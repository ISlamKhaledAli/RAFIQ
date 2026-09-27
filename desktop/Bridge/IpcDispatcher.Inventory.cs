using System;
using Newtonsoft.Json.Linq;
using RafiqPOS.Services;

namespace RafiqPOS.Bridge
{
    public partial class IpcDispatcher
    {
        private static bool TryDispatchInventory(BridgeRequest request, out BridgeResponse response)
        {
            response = null;
            switch (request.Action)
            {
                case "inventory:getMovements":
                    string invPid = null;
                    string invType = null;
                    string invFrom = null;
                    string invTo = null;
                    int invLimit = 200;
                    if (request.Payload != null)
                    {
                        JObject pObj = request.Payload as JObject;
                        if (pObj != null)
                        {
                            if (pObj["productId"] != null) invPid = pObj["productId"].ToString();
                            if (pObj["movementType"] != null) invType = pObj["movementType"].ToString();
                            if (pObj["fromDate"] != null) invFrom = pObj["fromDate"].ToString();
                            if (pObj["toDate"] != null) invTo = pObj["toDate"].ToString();
                            if (pObj["limit"] != null) invLimit = pObj["limit"].Value<int>();
                        }
                    }
                    var movements = DatabaseService.Inventory.GetMovements(invPid, invType, invFrom, invTo, invLimit);
                    response = BridgeResponse.Ok(request.Id, movements);
                    return true;

                case "inventory:adjustStock":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات التسوية الجردية فارغة");
                        return true;
                    }
                    JObject adjObj = request.Payload as JObject;
                    if (adjObj == null || adjObj["productId"] == null || adjObj["newStockQuantityMilli"] == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "معرف المنتج والرصيد الجديد مطلوبان");
                        return true;
                    }
                    string adjProdId = adjObj["productId"].ToString();
                    long newStockMilli = adjObj["newStockQuantityMilli"].Value<long>();
                    string adjReason = adjObj["reason"] != null ? adjObj["reason"].ToString() : "";
                    string adjUser = adjObj["userId"] != null ? adjObj["userId"].ToString() : "admin";
                    var adjMovement = DatabaseService.Inventory.AdjustStock(adjProdId, newStockMilli, adjReason, adjUser);
                    response = BridgeResponse.Ok(request.Id, adjMovement);
                    return true;

                case "inventory:getDiscrepancies":
                    var discrepancies = DatabaseService.Inventory.CheckDiscrepancies();
                    response = BridgeResponse.Ok(request.Id, discrepancies);
                    return true;

                case "inventory:recalculate":
                    string recalPid = null;
                    string recalUser = "admin";
                    if (request.Payload != null)
                    {
                        JObject recObj = request.Payload as JObject;
                        if (recObj != null)
                        {
                            if (recObj["productId"] != null) recalPid = recObj["productId"].ToString();
                            if (recObj["userId"] != null) recalUser = recObj["userId"].ToString();
                        }
                    }
                    int updatedCount = DatabaseService.Inventory.RecalculateStock(recalPid, recalUser);
                    response = BridgeResponse.Ok(request.Id, new
                    {
                        success = true,
                        updatedCount = updatedCount,
                        message = string.Format("تمت إعادة حساب ومطابقة المخزون بنجاح لـ {0} منتج.", updatedCount)
                    });
                    return true;

                case "inventory:runTests":
                    var testRes = InventoryTestRunner.RunAllTests();
                    if (testRes.Success)
                    {
                        response = BridgeResponse.Ok(request.Id, testRes);
                    }
                    else
                    {
                        response = BridgeResponse.Fail(request.Id, "INVENTORY_TESTS_FAILED", testRes.Message);
                    }
                    return true;

                default:
                    return false;
            }
        }
    }
}
