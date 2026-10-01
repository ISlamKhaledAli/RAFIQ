using System;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Bridge
{
    public partial class IpcDispatcher
    {
        private static bool TryDispatchPurchases(BridgeRequest request, out BridgeResponse response)
        {
            response = null;
            switch (request.Action)
            {
                case "purchases:getAll":
                    string supplierId = null;
                    string startDate = null;
                    string endDate = null;
                    int limit = 100;

                    JObject getObj = request.Payload as JObject;
                    if (getObj != null)
                    {
                        if (getObj["supplierId"] != null) supplierId = getObj["supplierId"].ToString();
                        if (getObj["startDate"] != null) startDate = getObj["startDate"].ToString();
                        if (getObj["endDate"] != null) endDate = getObj["endDate"].ToString();
                        if (getObj["limit"] != null) limit = getObj["limit"].Value<int>();
                    }

                    var purchases = DatabaseService.Purchases.GetAll(supplierId, startDate, endDate, limit);
                    response = BridgeResponse.Ok(request.Id, purchases);
                    return true;

                case "purchases:getById":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "معرف فاتورة الشراء مفقود");
                        return true;
                    }
                    JObject getByIdObj = request.Payload as JObject;
                    string purId = getByIdObj != null && getByIdObj["id"] != null ? getByIdObj["id"].ToString() : request.Payload.ToString();
                    var purchase = DatabaseService.Purchases.GetById(purId);
                    if (purchase == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "NOT_FOUND", "فاتورة الشراء غير موجودة");
                    }
                    else
                    {
                        response = BridgeResponse.Ok(request.Id, purchase);
                    }
                    return true;

                case "purchases:create":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات فاتورة الشراء فارغة");
                        return true;
                    }
                    try
                    {
                        Purchase purchaseToCreate = null;
                        string costingMethod = "LATEST";
                        string userId = null;

                        JObject payloadObj = request.Payload as JObject;
                        if (payloadObj != null && payloadObj["purchase"] != null)
                        {
                            purchaseToCreate = payloadObj["purchase"].ToObject<Purchase>();
                            if (payloadObj["costingMethod"] != null)
                            {
                                costingMethod = payloadObj["costingMethod"].ToString();
                            }
                            if (payloadObj["userId"] != null)
                            {
                                userId = payloadObj["userId"].ToString();
                            }
                        }
                        else
                        {
                            purchaseToCreate = JsonConvert.DeserializeObject<Purchase>(request.Payload.ToString());
                        }

                        var createdPurchase = DatabaseService.Purchases.CreatePurchase(purchaseToCreate, costingMethod, userId);
                        response = BridgeResponse.Ok(request.Id, createdPurchase);
                    }
                    catch (Exception ex)
                    {
                        response = BridgeResponse.Fail(request.Id, "PURCHASE_FAILED", ex.Message);
                    }
                    return true;
            }

            return false;
        }
    }
}
