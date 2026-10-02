using System;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Bridge
{
    public partial class IpcDispatcher
    {
        private static bool TryDispatchBatches(BridgeRequest request, out BridgeResponse response)
        {
            response = null;
            switch (request.Action)
            {
                case "batch:listByProduct":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "معرف المنتج مفقود");
                        return true;
                    }
                    string prodId = null;
                    bool activeOnly = true;

                    JObject byProdObj = request.Payload as JObject;
                    if (byProdObj != null)
                    {
                        if (byProdObj["productId"] != null) prodId = byProdObj["productId"].ToString();
                        if (byProdObj["activeOnly"] != null) activeOnly = byProdObj["activeOnly"].Value<bool>();
                    }
                    else
                    {
                        prodId = request.Payload.ToString();
                    }

                    var batches = DatabaseService.ProductBatches.GetBatchesByProduct(prodId, activeOnly);
                    response = BridgeResponse.Ok(request.Id, batches);
                    return true;

                case "batch:listExpiring":
                    int? days = null;
                    JObject expObj = request.Payload as JObject;
                    if (expObj != null && expObj["days"] != null)
                    {
                        days = expObj["days"].Value<int>();
                    }
                    var expiring = DatabaseService.ProductBatches.GetExpiringBatches(days);
                    response = BridgeResponse.Ok(request.Id, expiring);
                    return true;

                case "batch:listExpired":
                    var expired = DatabaseService.ProductBatches.GetExpiredBatches();
                    response = BridgeResponse.Ok(request.Id, expired);
                    return true;

                case "batch:summary":
                    int? sumDays = null;
                    JObject sumObj = request.Payload as JObject;
                    if (sumObj != null && sumObj["days"] != null)
                    {
                        sumDays = sumObj["days"].Value<int>();
                    }
                    var summary = DatabaseService.ProductBatches.GetBatchSummary(sumDays);
                    response = BridgeResponse.Ok(request.Id, summary);
                    return true;

                case "batch:save":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات الدفعة مفقودة");
                        return true;
                    }
                    try
                    {
                        var batchToSave = JsonConvert.DeserializeObject<ProductBatch>(request.Payload.ToString());
                        var saved = DatabaseService.ProductBatches.SaveBatch(batchToSave);
                        response = BridgeResponse.Ok(request.Id, saved);
                    }
                    catch (Exception ex)
                    {
                        response = BridgeResponse.Fail(request.Id, "BATCH_SAVE_ERROR", "فشل حفظ الدفعة: " + ex.Message);
                    }
                    return true;

                case "batch:adjust":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات التسوية مفقودة");
                        return true;
                    }
                    try
                    {
                        JObject adjObj = request.Payload as JObject;
                        string batchId = adjObj != null && adjObj["batchId"] != null ? adjObj["batchId"].ToString() : null;
                        long newQtyMilli = adjObj != null && adjObj["newQuantityMilli"] != null ? adjObj["newQuantityMilli"].Value<long>() : 0;
                        string reason = adjObj != null && adjObj["reason"] != null ? adjObj["reason"].ToString() : "تسوية يدوية";
                        string userId = adjObj != null && adjObj["userId"] != null ? adjObj["userId"].ToString() : "admin";

                        DatabaseService.ProductBatches.AdjustBatchStock(batchId, newQtyMilli, reason, userId);
                        response = BridgeResponse.Ok(request.Id, true);
                    }
                    catch (Exception ex)
                    {
                        response = BridgeResponse.Fail(request.Id, "BATCH_ADJUST_ERROR", "فشل تسوية الدفعة: " + ex.Message);
                    }
                    return true;

                case "batch:disposeExpired":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات الإتلاف مفقودة");
                        return true;
                    }
                    try
                    {
                        JObject dispObj = request.Payload as JObject;
                        string batchId = dispObj != null && dispObj["batchId"] != null ? dispObj["batchId"].ToString() : null;
                        string reason = dispObj != null && dispObj["reason"] != null ? dispObj["reason"].ToString() : "إتلاف منتهي الصلاحية";
                        string userId = dispObj != null && dispObj["userId"] != null ? dispObj["userId"].ToString() : "admin";

                        DatabaseService.ProductBatches.DisposeExpiredBatch(batchId, reason, userId);
                        response = BridgeResponse.Ok(request.Id, true);
                    }
                    catch (Exception ex)
                    {
                        response = BridgeResponse.Fail(request.Id, "BATCH_DISPOSE_ERROR", "فشل إتلاف الدفعة: " + ex.Message);
                    }
                    return true;

                default:
                    return false;
            }
        }
    }
}
