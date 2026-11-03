using System;
using System.Collections.Generic;
using System.Data.SQLite;
using System.Text;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using RafiqPOS.Common;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Repositories
{
    public partial class ProductRepository
    {
        public CataloguePreview PreviewCatalogue(CatalogueRequest request, List<CatalogueRecord> records, string actorId)
        {
            lock (SaleService.FinancialWriteLock)
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    CataloguePreview preview = BuildCataloguePreview(conn, trans, request, records, actorId);
                    trans.Commit();
                    return preview;
                }
            }
        }

        private static CataloguePreview BuildCataloguePreview(SQLiteConnection conn, SQLiteTransaction trans,
            CatalogueRequest request, List<CatalogueRecord> records, string actorId)
        {
            var owners = new Dictionary<string, CataloguePreviewRow>(StringComparer.Ordinal);
            string[] sources = {
                "SELECT barcode, id FROM products",
                "SELECT barcode, product_id FROM product_barcodes",
                "SELECT barcode, product_id FROM product_units"
            };
            string[] names = { "primary", "additional", "unit" };
            for (int i = 0; i < sources.Length; i++)
            using (var cmd = new SQLiteCommand(sources[i] + " ORDER BY 2, 1;", conn, trans))
            using (var reader = cmd.ExecuteReader())
            {
                while (reader.Read())
                {
                    string key = CatalogueReferenceService.GtinKey(reader[0].ToString().Trim());
                    if (key != null && !owners.ContainsKey(key))
                        owners.Add(key, new CataloguePreviewRow { ExistingProductId = reader[1].ToString(), BarcodeSource = names[i] });
                }
            }
            var rows = new List<CataloguePreviewRow>();
            var keys = new HashSet<string>(StringComparer.Ordinal);
            if (request.Selections == null || records == null || request.Selections.Count != records.Count ||
                records.Count == 0 || records.Count > 50 || string.IsNullOrWhiteSpace(actorId))
                throw new InvalidOperationException("CATALOGUE_INVALID_SELECTION");
            for (int i = 0; i < records.Count; i++)
            {
                CatalogueRecord record = records[i];
                CatalogueSelection selection = request.Selections[i];
                CatalogueReferenceService.ValidateSelection(selection, record);
                if (selection.RecordId != record.RecordId || !keys.Add(record.Gtin14Key) ||
                    CatalogueReferenceService.GtinKey(record.Gtin) != record.Gtin14Key)
                    throw new InvalidOperationException("CATALOGUE_INVALID_SELECTION");
                using (var category = new SQLiteCommand("SELECT COUNT(*) FROM categories WHERE id=@id AND is_active=1;", conn, trans))
                {
                    category.Parameters.AddWithValue("@id", selection.CategoryId);
                    if (Convert.ToInt64(category.ExecuteScalar()) != 1) throw new InvalidOperationException("CATALOGUE_CATEGORY_NOT_ACTIVE");
                }
                CataloguePreviewRow owner;
                bool exists = owners.TryGetValue(record.Gtin14Key, out owner);
                rows.Add(new CataloguePreviewRow { RecordId = record.RecordId, Status = exists ? "existing" : "new",
                    ExistingProductId = exists ? owner.ExistingProductId : null, BarcodeSource = exists ? owner.BarcodeSource : null });
            }
            rows.Sort(delegate(CataloguePreviewRow a, CataloguePreviewRow b) { return StringComparer.Ordinal.Compare(a.RecordId, b.RecordId); });
            string hash = CatalogueReferenceService.Hash(Encoding.UTF8.GetBytes(CatalogueReferenceService.Canonical(
                JObject.FromObject(new { requestHash = CatalogueReferenceService.Fingerprint(request, actorId), rows = rows }))));
            return new CataloguePreview { PreviewHash = hash, Rows = rows };
        }

        public CatalogueApplyResult ApplyCatalogue(CatalogueRequest request, List<CatalogueRecord> records, string actorId)
        {
            if (request == null || !request.ConfirmApply || string.IsNullOrWhiteSpace(request.AttemptId) ||
                string.IsNullOrWhiteSpace(request.ExpectedPreviewHash) || string.IsNullOrWhiteSpace(actorId))
                throw new InvalidOperationException("CATALOGUE_EXPLICIT_APPLY_REQUIRED");
            lock (SaleService.FinancialWriteLock)
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        string requestHash = CatalogueReferenceService.Fingerprint(request, actorId);
                        using (var replay = new SQLiteCommand("SELECT details_json FROM audit_logs WHERE action='CATALOGUE_REFERENCE_IMPORT' AND entity_type='catalogue_attempt' AND entity_id=@id ORDER BY rowid LIMIT 1;", conn, trans))
                        {
                            replay.Parameters.AddWithValue("@id", request.AttemptId);
                            object previous = replay.ExecuteScalar();
                            if (previous != null && previous != DBNull.Value)
                            {
                                JObject receipt = JObject.Parse(previous.ToString());
                                if ((string)receipt["requestHash"] != requestHash ||
                                    (string)receipt["previewHash"] != request.ExpectedPreviewHash)
                                    throw new InvalidOperationException("CATALOGUE_ATTEMPT_CHANGED");
                                CatalogueApplyResult original = receipt["result"].ToObject<CatalogueApplyResult>();
                                trans.Commit();
                                return original;
                            }
                        }
                        CataloguePreview preview = BuildCataloguePreview(conn, trans, request, records, actorId);
                        if (preview.PreviewHash != request.ExpectedPreviewHash)
                            throw new InvalidOperationException("CATALOGUE_PREVIEW_CHANGED");
                        var result = new CatalogueApplyResult { AttemptId = request.AttemptId,
                            CreatedProductIds = new List<string>(), SkippedRecordIds = new List<string>() };
                        for (int i = 0; i < records.Count; i++)
                        {
                            CatalogueRecord record = records[i];
                            CatalogueSelection selection = request.Selections[i];
                            CataloguePreviewRow row = preview.Rows.Find(r => r.RecordId == record.RecordId);
                            if (row.Status != "new") { result.SkippedRecordIds.Add(record.RecordId); continue; }
                            string id = Guid.NewGuid().ToString(), unitId = Guid.NewGuid().ToString();
                            string now = DateTime.UtcNow.ToString("o");
                            // Upsert and generic import can mutate existing rows; this path is deliberately INSERT-only.
                            using (var insert = new SQLiteCommand(@"
                                INSERT INTO products (id,barcode,name,normalized_name,category_id,price_piasters,cost_piasters,
                                    stock_quantity_milli,min_stock_quantity_milli,unit,is_active,needs_review,created_at,updated_at)
                                VALUES (@id,@barcode,@name,@normalized,@category,@sale,@cost,0,0,'piece',1,1,@now,@now);
                                INSERT INTO product_units (id,product_id,unit_name,conversion_factor,is_base_unit,sell_price_piasters,
                                    cost_price_piasters,barcode,is_divisible,sort_order,created_at,updated_at)
                                VALUES (@unit,@id,'قطعة',1,1,@sale,@cost,@barcode,0,0,@now,@now);
                                INSERT INTO product_barcodes (id,product_id,barcode,created_at) VALUES (@barcodeId,@id,@barcode,@now);
                            ", conn, trans))
                            {
                                insert.Parameters.AddWithValue("@id", id);
                                insert.Parameters.AddWithValue("@unit", unitId);
                                insert.Parameters.AddWithValue("@barcodeId", Guid.NewGuid().ToString());
                                insert.Parameters.AddWithValue("@barcode", record.Gtin);
                                insert.Parameters.AddWithValue("@name", record.NameOriginal);
                                insert.Parameters.AddWithValue("@normalized", ArabicTextNormalizer.Normalize(record.NameOriginal));
                                insert.Parameters.AddWithValue("@category", selection.CategoryId);
                                insert.Parameters.AddWithValue("@sale", selection.SalePricePiasters.Value);
                                insert.Parameters.AddWithValue("@cost", selection.CostPiasters.Value);
                                insert.Parameters.AddWithValue("@now", now);
                                insert.ExecuteNonQuery();
                            }
                            result.CreatedProductIds.Add(id);
                        }
                        _auditRepo.Log(conn, trans, new AuditLog {
                            Id = Guid.NewGuid().ToString(), UserId = actorId, Action = "CATALOGUE_REFERENCE_IMPORT",
                            EntityType = "catalogue_attempt", EntityId = request.AttemptId,
                            DetailsJson = JsonConvert.SerializeObject(new { requestHash = requestHash,
                                previewHash = request.ExpectedPreviewHash, datasetSha256 = request.DatasetSha256,
                                selections = request.Selections, records = records, result = result })
                        });
                        trans.Commit();
                        return result;
                    }
                    catch
                    {
                        trans.Rollback();
                        throw;
                    }
                }
            }
        }
    }
}
