using System;
using System.Collections.Generic;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Bridge
{
    public partial class IpcDispatcher
    {
        private static bool TryDispatchCafe(BridgeRequest request, out BridgeResponse response)
        {
            response = null;
            string action = request.Action ?? "";

            // Normalize dot aliases to colon actions
            if (action.StartsWith("tables.") || action.StartsWith("modifiers.") ||
                action.StartsWith("delivery.") || action.StartsWith("recipes."))
            {
                action = action.Replace('.', ':');
            }
            else if (action == "printer.printKOT") action = "printer:printKOT";
            else if (action == "printer.getKOTRouting") action = "printer:getKOTRouting";
            else if (action == "printer.saveKOTRouting") action = "printer:saveKOTRouting";

            bool isTables = action.StartsWith("tables:");
            bool isModifiers = action.StartsWith("modifiers:");
            bool isDelivery = action.StartsWith("delivery:");
            bool isRecipes = action.StartsWith("recipes:");
            bool isKotPrinter = (action == "printer:printKOT" || action == "printer:getKOTRouting" || action == "printer:saveKOTRouting");

            if (!isTables && !isModifiers && !isDelivery && !isRecipes && !isKotPrinter)
            {
                return false;
            }

            var pObj = request.Payload as JObject;
            if (pObj == null && request.Payload != null)
            {
                try
                {
                    pObj = JObject.FromObject(request.Payload);
                }
                catch { }
            }

            try
            {
                // ==========================================================
                // 1. FLOOR & TABLE MANAGEMENT (F-04)
                // ==========================================================
                if (isTables)
                {
                    if (DatabaseService.Tables == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "MODULE_NOT_INITIALIZED", "خدمة إدارة الطاولات والصالة غير مهيأة.");
                        return true;
                    }

                    switch (action)
                    {
                        case "tables:getAll":
                        {
                            bool incInactive = pObj != null && pObj["includeInactive"] != null && pObj["includeInactive"].Value<bool>();
                            var list = DatabaseService.Tables.GetAllTables(incInactive);
                            response = BridgeResponse.Ok(request.Id, list);
                            return true;
                        }
                        case "tables:save":
                        {
                            if (pObj == null)
                            {
                                response = BridgeResponse.Fail(request.Id, "VALIDATION_ERROR", "بيانات الطاولة مطلوبة.");
                                return true;
                            }
                            var tbl = pObj.ToObject<RestaurantTable>();
                            var saved = DatabaseService.Tables.SaveTable(tbl);
                            response = BridgeResponse.Ok(request.Id, saved);
                            return true;
                        }
                        case "tables:delete":
                        {
                            string id = pObj != null && pObj["id"] != null ? pObj["id"].ToString() : (pObj != null && pObj["tableId"] != null ? pObj["tableId"].ToString() : "");
                            bool ok = DatabaseService.Tables.DeleteTable(id);
                            response = BridgeResponse.Ok(request.Id, new { success = ok });
                            return true;
                        }
                        case "tables:open":
                        {
                            string tableId = pObj != null && pObj["tableId"] != null ? pObj["tableId"].ToString() : "";
                            int guests = pObj != null && pObj["guestsCount"] != null ? pObj["guestsCount"].Value<int>() : 1;
                            string waiter = pObj != null && pObj["waiterName"] != null ? pObj["waiterName"].ToString() : "";
                            string cashierId = SecurityService.CurrentUser != null ? SecurityService.CurrentUser.Id : "usr_admin_default";
                            var opened = DatabaseService.Tables.OpenTable(tableId, waiter, guests, cashierId);
                            response = BridgeResponse.Ok(request.Id, opened);
                            return true;
                        }
                        case "tables:updateOrder":
                        {
                            string tableId = pObj != null && pObj["tableId"] != null ? pObj["tableId"].ToString() : "";
                            string cartJson = pObj != null && pObj["cartJson"] != null
                                ? pObj["cartJson"].ToString()
                                : (pObj != null && pObj["itemsJson"] != null ? pObj["itemsJson"].ToString() : "[]");
                            long subtotalPiasters = pObj != null && pObj["subtotalPiasters"] != null ? pObj["subtotalPiasters"].Value<long>() : 0;
                            long discountPiasters = pObj != null && pObj["discountPiasters"] != null ? pObj["discountPiasters"].Value<long>() : 0;
                            long totalPiasters = pObj != null && pObj["totalPiasters"] != null
                                ? pObj["totalPiasters"].Value<long>()
                                : Math.Max(0, subtotalPiasters - discountPiasters);
                            int itemsCount = pObj != null && pObj["itemsCount"] != null ? pObj["itemsCount"].Value<int>() : 0;
                            int guests = pObj != null && pObj["guestsCount"] != null ? pObj["guestsCount"].Value<int>() : 1;
                            string waiter = pObj != null && pObj["waiterName"] != null ? pObj["waiterName"].ToString() : "";
                            string notes = pObj != null && pObj["notes"] != null ? pObj["notes"].ToString() : "";
                            string kotPrintedJson = pObj != null && pObj["printedKotQuantitiesJson"] != null
                                ? pObj["printedKotQuantitiesJson"].ToString()
                                : (pObj != null && pObj["kotPrintedJson"] != null ? pObj["kotPrintedJson"].ToString() : null);
                            string cashierId = SecurityService.CurrentUser != null ? SecurityService.CurrentUser.Id : "usr_admin_default";
                            var updated = DatabaseService.Tables.UpdateTableOrder(
                                tableId, cartJson, subtotalPiasters, discountPiasters, totalPiasters, itemsCount, notes, waiter, guests, cashierId, kotPrintedJson
                            );
                            response = BridgeResponse.Ok(request.Id, updated);
                            return true;
                        }
                        case "tables:transfer":
                        {
                            string fromTableId = pObj != null && pObj["fromTableId"] != null ? pObj["fromTableId"].ToString() : "";
                            string toTableId = pObj != null && pObj["toTableId"] != null ? pObj["toTableId"].ToString() : "";
                            string userId = SecurityService.CurrentUser != null ? SecurityService.CurrentUser.Id : "usr_admin_default";
                            var transferred = DatabaseService.Tables.TransferTable(fromTableId, toTableId, userId);
                            response = BridgeResponse.Ok(request.Id, transferred);
                            return true;
                        }
                        case "tables:merge":
                        {
                            string sourceTableId = pObj != null && pObj["sourceTableId"] != null ? pObj["sourceTableId"].ToString() : "";
                            string targetTableId = pObj != null && pObj["targetTableId"] != null ? pObj["targetTableId"].ToString() : "";
                            string userId = SecurityService.CurrentUser != null ? SecurityService.CurrentUser.Id : "usr_admin_default";
                            var merged = DatabaseService.Tables.MergeTables(sourceTableId, targetTableId, userId);
                            response = BridgeResponse.Ok(request.Id, merged);
                            return true;
                        }
                        case "tables:split":
                        {
                            string sourceTableId = pObj != null && pObj["sourceTableId"] != null
                                ? pObj["sourceTableId"].ToString()
                                : (pObj != null && pObj["tableId"] != null ? pObj["tableId"].ToString() : "");
                            var splitItems = new List<TableSplitItemRequest>();
                            if (pObj != null && pObj["items"] != null)
                            {
                                splitItems = pObj["items"].ToObject<List<TableSplitItemRequest>>() ?? new List<TableSplitItemRequest>();
                            }
                            string userId = SecurityService.CurrentUser != null ? SecurityService.CurrentUser.Id : "usr_admin_default";
                            var splitResult = DatabaseService.Tables.SplitTableBill(sourceTableId, splitItems, userId);
                            response = BridgeResponse.Ok(request.Id, splitResult);
                            return true;
                        }
                        case "tables:setStatus":
                        {
                            string tableId = pObj != null && pObj["tableId"] != null ? pObj["tableId"].ToString() : "";
                            string status = pObj != null && pObj["status"] != null ? pObj["status"].ToString() : "available";
                            var updated = DatabaseService.Tables.SetTableStatus(tableId, status);
                            response = BridgeResponse.Ok(request.Id, updated);
                            return true;
                        }
                        case "tables:close":
                        {
                            string tableId = pObj != null && pObj["tableId"] != null ? pObj["tableId"].ToString() : "";
                            var closed = DatabaseService.Tables.CloseTable(tableId);
                            response = BridgeResponse.Ok(request.Id, closed);
                            return true;
                        }
                        case "tables:printPreBill":
                        {
                            string tableId = pObj != null && pObj["tableId"] != null ? pObj["tableId"].ToString() : "";
                            if (DatabaseService.Printer == null)
                            {
                                response = BridgeResponse.Fail(request.Id, "PRINTER_ERROR", "خدمة الطباعة غير مهيأة.");
                                return true;
                            }
                            var printRes = DatabaseService.Printer.PrintTablePreBill(tableId);
                            if (!printRes.Success)
                            {
                                response = BridgeResponse.Fail(request.Id, "PRINT_FAILED", printRes.Message);
                                return true;
                            }
                            response = BridgeResponse.Ok(request.Id, printRes);
                            return true;
                        }
                    }
                }

                // ==========================================================
                // 2. ITEM MODIFIERS & CUSTOMIZATIONS (F-06)
                // ==========================================================
                if (isModifiers)
                {
                    if (DatabaseService.Modifiers == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "MODULE_NOT_INITIALIZED", "خدمة إضافات وتخصيص الأصناف غير مهيأة.");
                        return true;
                    }

                    switch (action)
                    {
                        case "modifiers:getGroups":
                        {
                            bool incInactive = pObj != null && pObj["includeInactive"] != null && pObj["includeInactive"].Value<bool>();
                            var groups = DatabaseService.Modifiers.GetAllGroups(incInactive);
                            response = BridgeResponse.Ok(request.Id, groups);
                            return true;
                        }
                        case "modifiers:getForProduct":
                        {
                            string productId = pObj != null && pObj["productId"] != null ? pObj["productId"].ToString() : "";
                            var groups = DatabaseService.Modifiers.GetGroupsForProduct(productId);
                            response = BridgeResponse.Ok(request.Id, groups);
                            return true;
                        }
                        case "modifiers:saveGroup":
                        {
                            if (pObj == null)
                            {
                                response = BridgeResponse.Fail(request.Id, "VALIDATION_ERROR", "بيانات مجموعة الإضافات مطلوبة.");
                                return true;
                            }
                            var group = pObj.ToObject<ModifierGroup>();
                            var saved = DatabaseService.Modifiers.SaveGroup(group);
                            response = BridgeResponse.Ok(request.Id, saved);
                            return true;
                        }
                        case "modifiers:deleteGroup":
                        {
                            string id = pObj != null && pObj["id"] != null ? pObj["id"].ToString() : (pObj != null && pObj["groupId"] != null ? pObj["groupId"].ToString() : "");
                            bool ok = DatabaseService.Modifiers.DeleteGroup(id);
                            response = BridgeResponse.Ok(request.Id, new { success = ok });
                            return true;
                        }
                        case "modifiers:saveOption":
                        {
                            if (pObj == null)
                            {
                                response = BridgeResponse.Fail(request.Id, "VALIDATION_ERROR", "بيانات خيار الإضافة مطلوبة.");
                                return true;
                            }
                            var opt = pObj.ToObject<ModifierOption>();
                            var saved = DatabaseService.Modifiers.SaveOption(opt);
                            response = BridgeResponse.Ok(request.Id, saved);
                            return true;
                        }
                        case "modifiers:deleteOption":
                        {
                            string id = pObj != null && pObj["id"] != null ? pObj["id"].ToString() : (pObj != null && pObj["optionId"] != null ? pObj["optionId"].ToString() : "");
                            bool ok = DatabaseService.Modifiers.DeleteOption(id);
                            response = BridgeResponse.Ok(request.Id, new { success = ok });
                            return true;
                        }
                        case "modifiers:linkProduct":
                        {
                            string productId = pObj != null && pObj["productId"] != null ? pObj["productId"].ToString() : "";
                            var groupIds = new List<string>();
                            if (pObj != null && pObj["groupIds"] != null)
                            {
                                groupIds = pObj["groupIds"].ToObject<List<string>>() ?? new List<string>();
                            }
                            DatabaseService.Modifiers.LinkProductGroups(productId, groupIds);
                            response = BridgeResponse.Ok(request.Id, new { success = true });
                            return true;
                        }
                    }
                }

                // ==========================================================
                // 3. KITCHEN & BAR PRINTER KOT (F-05)
                // ==========================================================
                if (isKotPrinter)
                {
                    if (DatabaseService.Printer == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "MODULE_NOT_INITIALIZED", "خدمة الطباعة غير مهيأة.");
                        return true;
                    }

                    switch (action)
                    {
                        case "printer:getKOTRouting":
                        {
                            var cfg = DatabaseService.Printer.GetKotRoutingConfig();
                            response = BridgeResponse.Ok(request.Id, cfg);
                            return true;
                        }
                        case "printer:saveKOTRouting":
                        {
                            if (pObj == null)
                            {
                                response = BridgeResponse.Fail(request.Id, "VALIDATION_ERROR", "بيانات توجيه طابعات المطبخ مطلوبة.");
                                return true;
                            }
                            var cfg = pObj.ToObject<KotRoutingConfig>();
                            var saved = DatabaseService.Printer.SaveKotRoutingConfig(cfg);
                            response = BridgeResponse.Ok(request.Id, saved);
                            return true;
                        }
                        case "printer:printKOT":
                        {
                            if (pObj == null)
                            {
                                response = BridgeResponse.Fail(request.Id, "VALIDATION_ERROR", "بيانات تذكرة المطبخ مطلوبة.");
                                return true;
                            }
                            var req = pObj.ToObject<KotPrintRequest>();
                            var res = DatabaseService.Printer.PrintKitchenOrderTicket(req);
                            if (!res.Success)
                            {
                                response = BridgeResponse.Fail(request.Id, "KOT_PRINT_FAILED", res.Message);
                                return true;
                            }
                            response = BridgeResponse.Ok(request.Id, res);
                            return true;
                        }
                    }
                }

                // ==========================================================
                // 4. DELIVERY & RIDERS MANAGEMENT (F-07)
                // ==========================================================
                if (isDelivery)
                {
                    if (DatabaseService.Delivery == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "MODULE_NOT_INITIALIZED", "خدمة الدليفري والطيارين غير مهيأة.");
                        return true;
                    }

                    switch (action)
                    {
                        case "delivery:getZones":
                        {
                            bool incInactive = pObj != null && pObj["includeInactive"] != null && pObj["includeInactive"].Value<bool>();
                            var zones = DatabaseService.Delivery.GetZones(incInactive);
                            response = BridgeResponse.Ok(request.Id, zones);
                            return true;
                        }
                        case "delivery:saveZone":
                        {
                            if (pObj == null)
                            {
                                response = BridgeResponse.Fail(request.Id, "VALIDATION_ERROR", "بيانات منطقة التوصيل مطلوبة.");
                                return true;
                            }
                            var zone = pObj.ToObject<DeliveryZone>();
                            var saved = DatabaseService.Delivery.SaveZone(zone);
                            response = BridgeResponse.Ok(request.Id, saved);
                            return true;
                        }
                        case "delivery:deleteZone":
                        {
                            string id = pObj != null && pObj["id"] != null ? pObj["id"].ToString() : (pObj != null && pObj["zoneId"] != null ? pObj["zoneId"].ToString() : "");
                            bool ok = DatabaseService.Delivery.DeleteZone(id);
                            response = BridgeResponse.Ok(request.Id, new { success = ok });
                            return true;
                        }
                        case "delivery:getRiders":
                        {
                            bool incInactive = pObj != null && pObj["includeInactive"] != null && pObj["includeInactive"].Value<bool>();
                            var riders = DatabaseService.Delivery.GetRiders(incInactive);
                            response = BridgeResponse.Ok(request.Id, riders);
                            return true;
                        }
                        case "delivery:saveRider":
                        {
                            if (pObj == null)
                            {
                                response = BridgeResponse.Fail(request.Id, "VALIDATION_ERROR", "بيانات الطيار مطلوبة.");
                                return true;
                            }
                            var rider = pObj.ToObject<DeliveryRider>();
                            var saved = DatabaseService.Delivery.SaveRider(rider);
                            response = BridgeResponse.Ok(request.Id, saved);
                            return true;
                        }
                        case "delivery:deleteRider":
                        {
                            string id = pObj != null && pObj["id"] != null ? pObj["id"].ToString() : (pObj != null && pObj["riderId"] != null ? pObj["riderId"].ToString() : "");
                            bool ok = DatabaseService.Delivery.DeleteRider(id);
                            response = BridgeResponse.Ok(request.Id, new { success = ok });
                            return true;
                        }
                        case "delivery:getOrders":
                        {
                            string statusFilter = pObj != null && pObj["statusFilter"] != null ? pObj["statusFilter"].ToString() : "all";
                            string riderId = pObj != null && pObj["riderId"] != null ? pObj["riderId"].ToString() : null;
                            bool unsettledOnly = pObj != null && pObj["onlyUnsettled"] != null && pObj["onlyUnsettled"].Value<bool>();
                            var orders = DatabaseService.Delivery.GetOrders(statusFilter, riderId, unsettledOnly);
                            response = BridgeResponse.Ok(request.Id, orders);
                            return true;
                        }
                        case "delivery:assignOrder":
                        {
                            string orderId = pObj != null && pObj["orderId"] != null ? pObj["orderId"].ToString() : "";
                            string riderId = pObj != null && pObj["riderId"] != null ? pObj["riderId"].ToString() : "";
                            string userId = SecurityService.CurrentUser != null ? SecurityService.CurrentUser.Id : "usr_admin_default";
                            var updated = DatabaseService.Delivery.AssignOrderToRider(orderId, riderId, userId);
                            response = BridgeResponse.Ok(request.Id, updated);
                            return true;
                        }
                        case "delivery:updateStatus":
                        {
                            string orderId = pObj != null && pObj["orderId"] != null ? pObj["orderId"].ToString() : "";
                            string status = pObj != null && pObj["status"] != null ? pObj["status"].ToString() : "";
                            string userId = SecurityService.CurrentUser != null ? SecurityService.CurrentUser.Id : "usr_admin_default";
                            var updated = DatabaseService.Delivery.UpdateOrderStatus(orderId, status, userId);
                            response = BridgeResponse.Ok(request.Id, updated);
                            return true;
                        }
                        case "delivery:getRiderSummary":
                        {
                            string riderId = pObj != null && pObj["riderId"] != null ? pObj["riderId"].ToString() : "";
                            var summary = DatabaseService.Delivery.GetRiderSettlementSummary(riderId);
                            response = BridgeResponse.Ok(request.Id, summary);
                            return true;
                        }
                        case "delivery:settleRider":
                        {
                            string riderId = pObj != null && pObj["riderId"] != null ? pObj["riderId"].ToString() : "";
                            bool recordExp = pObj == null || pObj["recordCommissionExpense"] == null || pObj["recordCommissionExpense"].Value<bool>();
                            string userId = SecurityService.CurrentUser != null ? SecurityService.CurrentUser.Id : "usr_admin_default";
                            var settled = DatabaseService.Delivery.SettleRider(riderId, userId, recordExp);
                            response = BridgeResponse.Ok(request.Id, settled);
                            return true;
                        }
                    }
                }

                // ==========================================================
                // 5. MANUFACTURING RECIPES / BOM (F-09)
                // ==========================================================
                if (isRecipes)
                {
                    if (DatabaseService.Recipes == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "MODULE_NOT_INITIALIZED", "خدمة الوصفات والتصنيع غير مهيأة.");
                        return true;
                    }

                    switch (action)
                    {
                        case "recipes:getAll":
                        {
                            var list = DatabaseService.Recipes.GetAllRecipes();
                            response = BridgeResponse.Ok(request.Id, list);
                            return true;
                        }
                        case "recipes:getByProduct":
                        {
                            string productId = pObj != null && pObj["productId"] != null ? pObj["productId"].ToString() : "";
                            var rec = DatabaseService.Recipes.GetByProductId(productId);
                            response = BridgeResponse.Ok(request.Id, rec);
                            return true;
                        }
                        case "recipes:save":
                        {
                            if (pObj == null)
                            {
                                response = BridgeResponse.Fail(request.Id, "VALIDATION_ERROR", "بيانات الوصفة مطلوبة.");
                                return true;
                            }
                            bool updateProductCost = pObj["updateProductCost"] == null || pObj["updateProductCost"].Value<bool>();
                            var recipe = pObj.ToObject<Recipe>();
                            var saved = DatabaseService.Recipes.SaveRecipe(recipe, updateProductCost);
                            response = BridgeResponse.Ok(request.Id, saved);
                            return true;
                        }
                        case "recipes:delete":
                        {
                            string id = pObj != null && pObj["id"] != null ? pObj["id"].ToString() : (pObj != null && pObj["recipeId"] != null ? pObj["recipeId"].ToString() : "");
                            bool ok = DatabaseService.Recipes.DeleteRecipe(id);
                            response = BridgeResponse.Ok(request.Id, new { success = ok });
                            return true;
                        }
                        case "recipes:produce":
                        {
                            string recipeId = pObj != null && pObj["recipeId"] != null ? pObj["recipeId"].ToString() : "";
                            long qtyMilli = pObj != null && pObj["producedQtyMilli"] != null ? pObj["producedQtyMilli"].Value<long>() : 1000;
                            string notes = pObj != null && pObj["notes"] != null ? pObj["notes"].ToString() : "";
                            string userId = SecurityService.CurrentUser != null ? SecurityService.CurrentUser.Id : "usr_admin_default";
                            string userName = SecurityService.CurrentUser != null ? SecurityService.CurrentUser.DisplayName : "المدير";
                            var batch = DatabaseService.Recipes.ProduceBatch(recipeId, qtyMilli, notes, userId, userName);
                            response = BridgeResponse.Ok(request.Id, batch);
                            return true;
                        }
                        case "recipes:getProductionLog":
                        {
                            int limit = pObj != null && pObj["limit"] != null ? pObj["limit"].Value<int>() : 50;
                            var log = DatabaseService.Recipes.GetProductionLog(limit);
                            response = BridgeResponse.Ok(request.Id, log);
                            return true;
                        }
                    }
                }

                return false;
            }
            catch (Exception ex)
            {
                response = BridgeResponse.Fail(request.Id, "CAFE_OPERATION_FAILED", ex.Message);
                return true;
            }
        }
    }
}
