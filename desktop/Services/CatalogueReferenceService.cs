using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Newtonsoft.Json.Serialization;
using RafiqPOS.Models;
using RafiqPOS.Repositories;

namespace RafiqPOS.Services
{
    public sealed class CatalogueReferenceService
    {
        public const string ManifestSha256 = "c7276a34e2047b3323dc825fff3e137f65aba0df1db29ae49b73b1edcb7f99f6";
        private readonly ProductRepository _products;
        private readonly List<CatalogueRecord> _records;
        private readonly JObject _manifest;

        public CatalogueReferenceService(ProductRepository products)
        {
            if (products == null) throw new ArgumentNullException("products");
            _products = products;
            string directory = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "dist", "catalogue");
            byte[] manifest = File.ReadAllBytes(Path.Combine(directory, "manifest.json"));
            if (Hash(manifest) != ManifestSha256) throw new InvalidOperationException("CATALOGUE_MANIFEST_HASH_MISMATCH");
            _manifest = JObject.Parse(Encoding.UTF8.GetString(manifest));
            byte[] reference = File.ReadAllBytes(Path.Combine(directory, "reference.json"));
            if (Hash(reference) != (string)_manifest["datasetSha256"]) throw new InvalidOperationException("CATALOGUE_DATASET_HASH_MISMATCH");
            _records = JsonConvert.DeserializeObject<List<CatalogueRecord>>(Encoding.UTF8.GetString(reference),
                new JsonSerializerSettings { MissingMemberHandling = MissingMemberHandling.Error });
            var keys = new HashSet<string>(StringComparer.Ordinal);
            foreach (CatalogueRecord record in _records)
            {
                if (record.SchemaVersion != 1 || GtinKey(record.Gtin) == null ||
                    GtinKey(record.Gtin) != record.Gtin14Key || !keys.Add(record.Gtin14Key) ||
                    record.RecordId != "off:" + record.Gtin || !SafeText(record.NameOriginal) ||
                    !SafeText(record.Brand) || !SafeText(record.NetQuantityText) ||
                    record.PackDescription != record.NetQuantityText || record.Variant != null ||
                    record.Provenance == null)
                    throw new InvalidOperationException("CATALOGUE_INVALID_RECORD");
            }
        }

        public object GetReference(int page, int pageSize, string query, string category)
        {
            if (page < 1 || pageSize < 1 || pageSize > 50 || page > 10000 || (query ?? "").Length > 200)
                throw new InvalidOperationException("CATALOGUE_INVALID_PAGE");
            IEnumerable<CatalogueRecord> filtered = _records;
            if (!string.IsNullOrEmpty(category)) filtered = filtered.Where(r => r.Category == category);
            if (!string.IsNullOrWhiteSpace(query))
                filtered = filtered.Where(r => (r.NameOriginal + " " + r.Brand + " " + r.Gtin).IndexOf(query, StringComparison.OrdinalIgnoreCase) >= 0);
            List<CatalogueRecord> list = filtered.ToList();
            return new { manifest = _manifest, total = list.Count, page = page, pageSize = pageSize,
                records = list.Skip((page - 1) * pageSize).Take(pageSize).ToList() };
        }

        public CataloguePreview Preview(CatalogueRequest request, string actorId)
        {
            List<CatalogueRecord> records = Resolve(request, actorId);
            return _products.PreviewCatalogue(request, records, actorId);
        }

        public CatalogueApplyResult Apply(CatalogueRequest request, string actorId)
        {
            List<CatalogueRecord> records = Resolve(request, actorId);
            Guid attempt;
            if (!request.ConfirmApply || !Guid.TryParseExact(request.AttemptId, "D", out attempt) ||
                request.AttemptId[14] != '4' || !Regex.IsMatch(request.ExpectedPreviewHash ?? "", "^[a-f0-9]{64}$"))
                throw new InvalidOperationException("CATALOGUE_EXPLICIT_APPLY_REQUIRED");
            return _products.ApplyCatalogue(request, records, actorId);
        }

        public BatchImportRequest ValidateMerchantImport(object rawPayload)
        {
            JObject payload = rawPayload as JObject;
            if (payload == null) throw new InvalidOperationException("MERCHANT_IMPORT_OBJECT_REQUIRED");
            ValidateMerchantFields(payload, typeof(BatchImportRequest), true);
            JArray items = payload["items"] as JArray;
            if (items == null || items.Count == 0) throw new InvalidOperationException("MERCHANT_IMPORT_ITEMS_REQUIRED");
            foreach (JToken item in items)
            {
                JObject row = item as JObject;
                if (row == null) throw new InvalidOperationException("MERCHANT_IMPORT_ROW_OBJECT_REQUIRED");
                ValidateMerchantFields(row, typeof(BatchImportItem), false);
            }
            byte[] bytes = File.ReadAllBytes(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "dist", "catalogue", "legacy-quarantine.json"));
            if (Hash(bytes) != (string)_manifest["files"]["legacy-quarantine.json"])
                throw new InvalidOperationException("CATALOGUE_QUARANTINE_HASH_MISMATCH");
            JObject inventory = JObject.Parse(Encoding.UTF8.GetString(bytes));
            JToken hashToken = payload["sourceFileSha256"];
            if (hashToken != null && (hashToken.Type != JTokenType.String ||
                !Regex.IsMatch((string)hashToken, "^[a-fA-F0-9]{64}$")))
                throw new InvalidOperationException("MERCHANT_IMPORT_INVALID_FILE_HASH");
            string sourceHash = hashToken == null ? null : ((string)hashToken).ToLowerInvariant();
            if (!string.IsNullOrEmpty(sourceHash) && ((JArray)inventory["artifacts"]).Any(a => (string)a["sha256"] == sourceHash))
                throw new InvalidOperationException("LEGACY_CATALOGUE_DISABLED");

            var canonical = (JObject)payload.DeepClone();
            canonical.Remove("sourceFileSha256");
            var serializer = JsonSerializer.Create(new JsonSerializerSettings { MissingMemberHandling = MissingMemberHandling.Error });
            return canonical.ToObject<BatchImportRequest>(serializer);
        }

        private static void ValidateMerchantFields(JObject value, Type dtoType, bool allowFileHash)
        {
            var contract = (JsonObjectContract)new DefaultContractResolver().ResolveContract(dtoType);
            var fields = new HashSet<string>(contract.Properties.Where(p => !p.Ignored).Select(p => p.PropertyName), StringComparer.Ordinal);
            if (allowFileHash) fields.Add("sourceFileSha256");
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var markers = new HashSet<string>(new[] { "datasetSha256", "recordId", "gtin14Key", "provenance" }, StringComparer.OrdinalIgnoreCase);
            foreach (JProperty property in value.Properties())
            {
                if (markers.Contains(property.Name))
                    throw new InvalidOperationException("REFERENCE_REVIEW_REQUIRED");
                if (!seen.Add(property.Name) || !fields.Contains(property.Name))
                    throw new InvalidOperationException("MERCHANT_IMPORT_NONCANONICAL_FIELD");
            }
        }

        public static void ValidateRequestTokens(JObject payload)
        {
            var fields = new HashSet<string>(new[] { "datasetSha256", "selections", "expectedPreviewHash", "attemptId", "confirmApply" }, StringComparer.Ordinal);
            if (payload == null || payload.Properties().Any(p => !fields.Contains(p.Name)) ||
                payload["datasetSha256"] == null || payload["datasetSha256"].Type != JTokenType.String ||
                !(payload["selections"] is JArray))
                throw new InvalidOperationException("CATALOGUE_INVALID_PAYLOAD");
            var selectionFields = new HashSet<string>(new[] { "recordId", "confirmedBarcode", "confirmedPack",
                "identityConfirmed", "pricesConfirmed", "belowCostConfirmed", "zeroCostConfirmed", "salePricePiasters", "costPiasters", "categoryId" }, StringComparer.Ordinal);
            foreach (JToken item in (JArray)payload["selections"])
            {
                JObject selection = item as JObject;
                if (selection == null || selection.Properties().Any(p => !selectionFields.Contains(p.Name)))
                    throw new InvalidOperationException("CATALOGUE_INVALID_PAYLOAD");
                foreach (string field in selectionFields)
                {
                    JToken value = selection[field];
                    if (field == "belowCostConfirmed" && value == null) continue;
                    JTokenType type = field == "salePricePiasters" || field == "costPiasters" ? JTokenType.Integer :
                        field.EndsWith("Confirmed", StringComparison.Ordinal) ? JTokenType.Boolean : JTokenType.String;
                    if (value == null || value.Type != type) throw new InvalidOperationException("CATALOGUE_INVALID_FIELD_TYPE");
                }
            }
            if (payload["confirmApply"] != null && payload["confirmApply"].Type != JTokenType.Boolean)
                throw new InvalidOperationException("CATALOGUE_INVALID_FIELD_TYPE");
        }

        private List<CatalogueRecord> Resolve(CatalogueRequest request, string actorId)
        {
            if (string.IsNullOrWhiteSpace(actorId)) throw new InvalidOperationException("CATALOGUE_ACTOR_REQUIRED");
            if (request == null || request.DatasetSha256 != (string)_manifest["datasetSha256"] ||
                request.Selections == null || request.Selections.Count < 1 || request.Selections.Count > 50)
                throw new InvalidOperationException("CATALOGUE_INVALID_SELECTION");
            var result = new List<CatalogueRecord>();
            var ids = new HashSet<string>(StringComparer.Ordinal);
            foreach (CatalogueSelection selection in request.Selections)
            {
                CatalogueRecord record = selection == null ? null : _records.Find(r => r.RecordId == selection.RecordId);
                if (record == null || !ids.Add(record.RecordId)) throw new InvalidOperationException("CATALOGUE_UNKNOWN_OR_DUPLICATE_RECORD");
                ValidateSelection(selection, record);
                result.Add(record);
            }
            return result;
        }

        public static void ValidateSelection(CatalogueSelection selection, CatalogueRecord record)
        {
            if (selection == null || record == null || !selection.IdentityConfirmed || !selection.PricesConfirmed ||
                selection.ConfirmedBarcode != record.Gtin || selection.ConfirmedPack != record.PackDescription ||
                !selection.SalePricePiasters.HasValue || selection.SalePricePiasters.Value <= 0 ||
                selection.SalePricePiasters.Value > 99999999999L || !selection.CostPiasters.HasValue ||
                selection.CostPiasters.Value < 0 || selection.CostPiasters.Value > 99999999999L ||
                (selection.CostPiasters.Value == 0 && !selection.ZeroCostConfirmed) ||
                string.IsNullOrWhiteSpace(selection.CategoryId))
                throw new InvalidOperationException("CATALOGUE_MERCHANT_CONFIRMATION_REQUIRED");
            if (selection.SalePricePiasters.Value < selection.CostPiasters.Value && !selection.BelowCostConfirmed)
                throw new BelowCostPriceException(selection.SalePricePiasters.Value, selection.CostPiasters.Value);
        }

        public static string GtinKey(string code)
        {
            if (code == null || !Regex.IsMatch(code, "^(?:[0-9]{8}|[0-9]{12}|[0-9]{13}|[0-9]{14})$")) return null;
            int sum = 0, weight = 3;
            for (int i = code.Length - 2; i >= 0; i--, weight = 4 - weight) sum += (code[i] - '0') * weight;
            return (10 - sum % 10) % 10 == code[code.Length - 1] - '0' ? code.PadLeft(14, '0') : null;
        }

        private static bool SafeText(string text)
        {
            return !string.IsNullOrWhiteSpace(text) && text.Length <= 500 && !Regex.IsMatch(text, @"^\s*[=+@-]");
        }

        public static string Hash(byte[] bytes)
        {
            using (SHA256 algorithm = SHA256.Create())
                return BitConverter.ToString(algorithm.ComputeHash(bytes)).Replace("-", "").ToLowerInvariant();
        }

        public static string Canonical(JToken token)
        {
            JObject obj = token as JObject;
            if (obj != null)
            {
                var sorted = new JObject();
                foreach (JProperty property in obj.Properties().OrderBy(p => p.Name, StringComparer.Ordinal))
                    sorted.Add(property.Name, JToken.Parse(Canonical(property.Value)));
                return sorted.ToString(Formatting.None);
            }
            JArray array = token as JArray;
            if (array != null) return new JArray(array.Select(v => JToken.Parse(Canonical(v)))).ToString(Formatting.None);
            return token.ToString(Formatting.None);
        }

        public static string Fingerprint(CatalogueRequest request, string actorId)
        {
            return Hash(Encoding.UTF8.GetBytes(Canonical(JObject.FromObject(new {
                actorId = actorId, datasetSha256 = request.DatasetSha256,
                selections = request.Selections.OrderBy(s => s.RecordId, StringComparer.Ordinal).ToList()
            }))));
        }
    }
}
