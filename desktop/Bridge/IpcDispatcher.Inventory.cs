using System;
using Newtonsoft.Json.Linq;
using RafiqPOS.Models;
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
                    if (adjObj == null || adjObj["productId"] == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "معرف المنتج مطلوب للتسوية");
                        return true;
                    }
                    string adjProdId = adjObj["productId"].ToString();
                    string adjReason = adjObj["reason"] != null ? adjObj["reason"].ToString().Trim() : "";
                    if (string.IsNullOrWhiteSpace(adjReason))
                    {
                        response = BridgeResponse.Fail(request.Id, "REASON_REQUIRED", "سبب التسوية الجردية إجباري لتوثيق العملية في السجل المالي");
                        return true;
                    }

                    string adjUser = adjObj["userId"] != null ? adjObj["userId"].ToString() : "admin";
                    string adjType = adjObj["adjustmentType"] != null ? adjObj["adjustmentType"].ToString() : null;

                    StockMovement adjMovement = null;
                    if (adjObj["newStockQuantityMilli"] != null)
                    {
                        long newStockMilli = adjObj["newStockQuantityMilli"].Value<long>();
                        adjMovement = DatabaseService.Inventory.AdjustStock(adjProdId, newStockMilli, adjReason, adjUser, adjType);
                    }
                    else if (adjObj["quantityDeltaMilli"] != null)
                    {
                        long deltaMilli = adjObj["quantityDeltaMilli"].Value<long>();
                        adjMovement = DatabaseService.Inventory.AdjustStockByDelta(adjProdId, deltaMilli, adjReason, adjUser, adjType);
                    }
                    else
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "يجب تحديد الرصيد الجديد أو مقدار الزيادة/العجز");
                        return true;
                    }

                    var updatedProd = DatabaseService.Products.GetById(adjProdId);
                    response = BridgeResponse.Ok(request.Id, new
                    {
                        movement = adjMovement,
                        product = updatedProd
                    });
                    return true;

                case "inventory:recordPurchase":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات فاتورة الشراء فارغة");
                        return true;
                    }
                    JObject purObj = request.Payload as JObject;
                    if (purObj == null || purObj["productId"] == null || purObj["purchaseQuantity"] == null || purObj["packageCostPiasters"] == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "معرف المنتج والكمية وسعر الشراء مطلوبة");
                        return true;
                    }
                    try
                    {
                        string purProdId = purObj["productId"].ToString();
                        string purUnitId = purObj["unitId"] != null ? purObj["unitId"].ToString() : null;
                        double purQty = purObj["purchaseQuantity"].Value<double>();
                        long purPkgCost = purObj["packageCostPiasters"].Value<long>();
                        string purInvoice = purObj["invoiceNumber"] != null ? purObj["invoiceNumber"].ToString() : null;
                        string purSupplier = purObj["supplierName"] != null ? purObj["supplierName"].ToString() : null;
                        bool purUpdateCost = purObj["updateProductCost"] == null || purObj["updateProductCost"].Value<bool>();
                        string purUserId = purObj["userId"] != null ? purObj["userId"].ToString() : "admin";

                        var purMovement = DatabaseService.Inventory.RecordPurchase(
                            purProdId, purUnitId, purQty, purPkgCost, purInvoice, purSupplier, purUpdateCost, purUserId);
                        response = BridgeResponse.Ok(request.Id, purMovement);
                    }
                    catch (Exception ex)
                    {
                        response = BridgeResponse.Fail(request.Id, "RECORD_PURCHASE_FAILED", ex.Message);
                    }
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
