using System;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Bridge
{
    public partial class IpcDispatcher
    {
        private static bool TryDispatchCatalogue(BridgeRequest request, out BridgeResponse response)
        {
            response = null;
            if (request.Action != "catalogue:getReference" && request.Action != "catalogue:preview" && request.Action != "catalogue:apply")
                return false;
            RequestAdmission admission = ProductWritePolicy.CurrentAdmission;
            if (admission == null || !admission.IsAuthenticated || admission.MustChangePin ||
                !admission.HasPermission("products.import"))
            {
                response = BridgeResponse.Fail(request.Id, "FORBIDDEN", "لا توجد صلاحية استيراد الأصناف");
                return true;
            }
            string actorId = SessionActorId();
            try
            {
                var service = new CatalogueReferenceService(DatabaseService.ProductRepo);
                JObject payload = request.Payload as JObject;
                if (payload == null) throw new InvalidOperationException("CATALOGUE_INVALID_PAYLOAD");
                object result;
                if (request.Action == "catalogue:getReference")
                {
                    result = service.GetReference((int?)payload["page"] ?? 1, (int?)payload["pageSize"] ?? 25,
                        (string)payload["query"], (string)payload["category"]);
                }
                else
                {
                    CatalogueReferenceService.ValidateRequestTokens(payload);
                    var serializer = JsonSerializer.Create(new JsonSerializerSettings {
                        MissingMemberHandling = MissingMemberHandling.Error
                    });
                    CatalogueRequest selection = payload.ToObject<CatalogueRequest>(serializer);
                    lock (SaleService.FinancialWriteLock)
                    using (ProductWritePolicy.Operation operation = ProductWritePolicy.BeginOperation())
                    {
                        if (!operation.HasPermission("products.import") ||
                            !string.Equals(actorId, operation.ActorId, StringComparison.Ordinal))
                            throw new UnauthorizedAccessException("جلسة الطلب مفقودة أو تغيرت.");
                        result = request.Action == "catalogue:preview"
                            ? (object)service.Preview(selection, operation.ActorId)
                            : service.Apply(selection, operation.ActorId);
                    }
                }
                response = BridgeResponse.Ok(request.Id, result);
            }
            catch (BelowCostPriceException ex)
            {
                response = BridgeResponse.Fail(request.Id, "BELOW_COST_WARNING", ex.Message,
                    new { pricePiasters = ex.PricePiasters, costPiasters = ex.CostPiasters, lossPiasters = ex.LossPiasters });
            }
            catch (UnauthorizedAccessException ex)
            {
                response = BridgeResponse.Fail(request.Id, "FORBIDDEN", ex.Message);
            }
            catch (Exception ex)
            {
                System.Diagnostics.Trace.TraceError("Catalogue request failed: {0}", ex.GetType().Name);
                response = BridgeResponse.Fail(request.Id, "CATALOGUE_REJECTED",
                    ex is InvalidOperationException ? ex.Message : "تعذر التحقق من حزمة المراجع المحلية أو بيانات الطلب");
            }
            return true;
        }

        private static bool TryRejectCatalogueMerchantImport(BridgeRequest request, out BridgeResponse response)
        {
            response = null;
            if (request.Action != "products:importBatch") return false;
            try
            {
                BatchImportRequest canonical = new CatalogueReferenceService(DatabaseService.ProductRepo).ValidateMerchantImport(request.Payload);
                request.Payload = JObject.FromObject(canonical);
                return false;
            }
            catch (Exception ex)
            {
                System.Diagnostics.Trace.TraceError("Catalogue merchant import guard failed: {0}", ex.GetType().Name);
                string code = ex is JsonException || (ex is InvalidOperationException &&
                    ex.Message.StartsWith("MERCHANT_IMPORT_", StringComparison.Ordinal)) ? "INVALID_PAYLOAD" : "REFERENCE_REVIEW_REQUIRED";
                response = BridgeResponse.Fail(request.Id, code,
                    ex is InvalidOperationException ? ex.Message : "تعذر التحقق من عزل الكتالوجات؛ أعد تثبيت حزمة المراجع المحلية");
                return true;
            }
        }
    }
}
