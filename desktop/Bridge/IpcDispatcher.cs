using System;
using System.Collections.Generic;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using RafiqPOS.Common;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Bridge
{
    public class IpcDispatcher
    {
        public static BridgeResponse Dispatch(BridgeRequest request)
        {
            if (request == null || string.IsNullOrWhiteSpace(request.Action))
            {
                string reqId = (request != null && request.Id != null) ? request.Id : "";
                return BridgeResponse.Fail(reqId, "INVALID_REQUEST", "طلب غير صالح أو فارغ");
            }

            // Lock write operations immediately if database is corrupt (Task 124-1)
            if (DatabaseService.IsCorrupted && (
                request.Action == "sales:create" ||
                request.Action == "sales:cancel" ||
                request.Action == "products:save" ||
                request.Action == "products:delete" ||
                request.Action == "products:bulkUpdateMinStock" ||
                request.Action == "products:importBatch" ||
                request.Action == "categories:save" ||
                request.Action == "categories:archive" ||
                request.Action == "categories:reorder" ||
                request.Action == "customers:save" ||
                request.Action == "customers:recordPayment" ||
                request.Action == "quickItems:save" ||
                request.Action == "quickItems:delete" ||
                request.Action == "quickItems:reorder" ||
                request.Action == "inventory:adjustStock" ||
                request.Action == "inventory:recalculate"))
            {
                return BridgeResponse.Fail(
                    request.Id,
                    "DATABASE_CORRUPT_LOCKED",
                    "قاعدة البيانات تالفة أو غير متسقة، تم إيقاف عمليات الكتابة والبيع لحماية البيانات. يرجى استرجاع نسخة احتياطية سليمة."
                );
            }

            try
            {
                switch (request.Action)
                {
                    case "system:getInfo":
                        string osDetails = RafiqPOS.Common.OsDetector.GetOsFriendlyName() + (Environment.Is64BitOperatingSystem ? " (64-bit)" : " (32-bit)");
                        return BridgeResponse.Ok(request.Id, new
                        {
                            appName = "رفيق POS",
                            version = "1.0.0",
                            osVersion = osDetails,
                            isWebView2 = true,
                            dbStatus = DatabaseService.GetStatus()
                        });

                    case "system:ping":
                        return BridgeResponse.Ok(request.Id, new { timestamp = DateTime.UtcNow.ToString("o") });

                    case "products:getAll":
                        int limit = 100;
                        JObject getAllObj = request.Payload as JObject;
                        if (getAllObj != null && getAllObj["limit"] != null)
                        {
                            limit = getAllObj["limit"].Value<int>();
                        }
                        var allProducts = DatabaseService.Products.GetAll(limit);
                        return BridgeResponse.Ok(request.Id, allProducts);

                    case "products:search":
                        string query = "";
                        int searchLimit = 50;
                        JObject searchObj = request.Payload as JObject;
                        if (searchObj != null)
                        {
                            if (searchObj["query"] != null)
                            {
                                query = searchObj["query"].ToString();
                            }
                            if (searchObj["limit"] != null)
                            {
                                searchLimit = searchObj["limit"].Value<int>();
                            }
                        }
                        else if (request.Payload != null)
                        {
                            query = request.Payload.ToString().Trim('"', ' ');
                        }
                        var searchResults = DatabaseService.Products.Search(query, searchLimit);
                        return BridgeResponse.Ok(request.Id, searchResults);

                    case "products:save":
                        if (request.Payload == null)
                        {
                            return BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات المنتج فارغة");
                        }
                        var pSaveObj = request.Payload as JObject;
                        bool confirmSimilar = false;
                        if (pSaveObj != null && pSaveObj["confirmSimilarName"] != null)
                        {
                            confirmSimilar = pSaveObj["confirmSimilarName"].Value<bool>();
                        }
                        bool confirmBelowCost = false;
                        if (pSaveObj != null && pSaveObj["confirmBelowCost"] != null)
                        {
                            confirmBelowCost = pSaveObj["confirmBelowCost"].Value<bool>();
                        }
                        var productToSave = JsonConvert.DeserializeObject<Product>(request.Payload.ToString());
                        try
                        {
                            var savedProduct = DatabaseService.Products.SaveProduct(productToSave, confirmSimilar, confirmBelowCost);
                            return BridgeResponse.Ok(request.Id, savedProduct);
                        }
                        catch (SimilarProductException simEx)
                        {
                            return BridgeResponse.Fail(request.Id, "SIMILAR_NAME_WARNING", simEx.Message, new { similarProductName = simEx.SimilarProductName, reason = simEx.Reason });
                        }
                        catch (BelowCostPriceException costEx)
                        {
                            return BridgeResponse.Fail(request.Id, "BELOW_COST_WARNING", costEx.Message, new { pricePiasters = costEx.PricePiasters, costPiasters = costEx.CostPiasters, lossPiasters = costEx.LossPiasters });
                        }

                    case "products:getPriceHistory":
                        string pHistId = "";
                        JObject pHistObj = request.Payload as JObject;
                        if (pHistObj != null && pHistObj["productId"] != null)
                        {
                            pHistId = pHistObj["productId"].ToString();
                        }
                        else if (request.Payload != null)
                        {
                            pHistId = request.Payload.ToString().Trim('"', ' ');
                        }
                        int histLimit = 50;
                        if (pHistObj != null && pHistObj["limit"] != null)
                        {
                            histLimit = pHistObj["limit"].Value<int>();
                        }
                        var pHistory = DatabaseService.Products.GetPriceHistory(pHistId, histLimit);
                        return BridgeResponse.Ok(request.Id, pHistory);

                    case "products:delete":
                        string prodIdToDelete = "";
                        JObject delObj = request.Payload as JObject;
                        if (delObj != null && delObj["id"] != null)
                        {
                            prodIdToDelete = delObj["id"].ToString();
                        }
                        else if (request.Payload != null)
                        {
                            prodIdToDelete = request.Payload.ToString().Trim('"', ' ');
                        }
                        DatabaseService.Products.DeleteProduct(prodIdToDelete);
                        return BridgeResponse.Ok(request.Id, new { success = true, deletedId = prodIdToDelete });

                    case "products:bulkUpdateMinStock":
                        if (request.Payload == null)
                        {
                            return BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات التعديل الجماعي فارغة");
                        }
                        JObject bulkObj = request.Payload as JObject;
                        if (bulkObj == null || bulkObj["productIds"] == null || bulkObj["minStockMilli"] == null)
                        {
                            return BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "الحقول المطلوبة (productIds, minStockMilli) ناقصة");
                        }
                        var pIds = bulkObj["productIds"].ToObject<List<string>>();
                        long minStockMilli = bulkObj["minStockMilli"].Value<long>();
                        DatabaseService.Products.BulkUpdateMinStock(pIds, minStockMilli);
                        return BridgeResponse.Ok(request.Id, new { success = true, count = pIds.Count, minStockMilli = minStockMilli });

                    case "products:importBatch":
                        if (request.Payload == null)
                        {
                            return BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات الاستيراد الجماعي فارغة");
                        }
                        var importReq = JsonConvert.DeserializeObject<BatchImportRequest>(request.Payload.ToString());
                        if (importReq == null || importReq.Items == null || importReq.Items.Count == 0)
                        {
                            return BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "قائمة الأصناف المراد استيرادها فارغة");
                        }
                        var importResult = DatabaseService.Products.ImportBatch(importReq, "usr_admin_default");
                        return BridgeResponse.Ok(request.Id, importResult);

                    // ==========================================
                    // Product Units Management (Feature #161 / Tasks 161-1 to 161-15)
                    // ==========================================
                    case "productUnits:getByProduct":
                        string puProdId = "";
                        JObject puProdObj = request.Payload as JObject;
                        if (puProdObj != null && puProdObj["productId"] != null)
                        {
                            puProdId = puProdObj["productId"].ToString();
                        }
                        else if (request.Payload != null)
                        {
                            puProdId = request.Payload.ToString().Trim('"', ' ');
                        }
                        var pUnits = DatabaseService.ProductUnits.GetUnitsForProduct(puProdId);
                        return BridgeResponse.Ok(request.Id, pUnits);

                    case "productUnits:save":
                        if (request.Payload == null)
                        {
                            return BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات الوحدة فارغة");
                        }
                        var unitToSave = JsonConvert.DeserializeObject<ProductUnit>(request.Payload.ToString());
                        if (unitToSave == null)
                        {
                            return BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "تعذر قراءة بيانات الوحدة");
                        }
                        try
                        {
                            ProductUnit savedUnit;
                            if (string.IsNullOrWhiteSpace(unitToSave.Id))
                            {
                                savedUnit = DatabaseService.ProductUnits.CreateUnit(unitToSave);
                            }
                            else
                            {
                                var existingUnit = DatabaseService.ProductUnits.GetUnitById(unitToSave.Id);
                                if (existingUnit == null)
                                {
                                    savedUnit = DatabaseService.ProductUnits.CreateUnit(unitToSave);
                                }
                                else
                                {
                                    savedUnit = DatabaseService.ProductUnits.UpdateUnit(unitToSave);
                                }
                            }
                            return BridgeResponse.Ok(request.Id, savedUnit);
                        }
                        catch (Exception ex)
                        {
                            return BridgeResponse.Fail(request.Id, "SAVE_UNIT_FAILED", ex.Message);
                        }

                    case "productUnits:delete":
                        string uIdToDelete = "";
                        JObject uDelObj = request.Payload as JObject;
                        if (uDelObj != null && uDelObj["unitId"] != null)
                        {
                            uIdToDelete = uDelObj["unitId"].ToString();
                        }
                        else if (uDelObj != null && uDelObj["id"] != null)
                        {
                            uIdToDelete = uDelObj["id"].ToString();
                        }
                        else if (request.Payload != null)
                        {
                            uIdToDelete = request.Payload.ToString().Trim('"', ' ');
                        }
                        try
                        {
                            DatabaseService.ProductUnits.DeleteUnit(uIdToDelete);
                            return BridgeResponse.Ok(request.Id, new { success = true, deletedId = uIdToDelete });
                        }
                        catch (Exception ex)
                        {
                            return BridgeResponse.Fail(request.Id, "DELETE_UNIT_FAILED", ex.Message);
                        }

                    case "productUnits:setBase":
                        string sbProdId = "";
                        string sbUnitId = "";
                        JObject sbObj = request.Payload as JObject;
                        if (sbObj != null)
                        {
                            if (sbObj["productId"] != null) sbProdId = sbObj["productId"].ToString();
                            if (sbObj["unitId"] != null) sbUnitId = sbObj["unitId"].ToString();
                        }
                        if (string.IsNullOrWhiteSpace(sbProdId) || string.IsNullOrWhiteSpace(sbUnitId))
                        {
                            return BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "معرف المنتج ومعرف الوحدة مطلوبان");
                        }
                        try
                        {
                            DatabaseService.ProductUnits.SetBaseUnit(sbProdId, sbUnitId);
                            var updatedUnits = DatabaseService.ProductUnits.GetUnitsForProduct(sbProdId);
                            return BridgeResponse.Ok(request.Id, updatedUnits);
                        }
                        catch (Exception ex)
                        {
                            return BridgeResponse.Fail(request.Id, "SET_BASE_UNIT_FAILED", ex.Message);
                        }

                    case "productUnits:calculateProfit":
                        if (request.Payload == null)
                        {
                            return BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "البيانات فارغة");
                        }
                        JObject calcObj = request.Payload as JObject;
                        ProductUnit calcUnit = null;
                        ProductUnit calcBaseUnit = null;
                        if (calcObj != null)
                        {
                            if (calcObj["unit"] != null)
                            {
                                calcUnit = calcObj["unit"].ToObject<ProductUnit>();
                            }
                            if (calcObj["baseUnit"] != null)
                            {
                                calcBaseUnit = calcObj["baseUnit"].ToObject<ProductUnit>();
                            }
                        }
                        var profitInfo = DatabaseService.ProductUnits.CalculateProfit(calcUnit, calcBaseUnit);
                        return BridgeResponse.Ok(request.Id, profitInfo);

                    case "sales:create":
                        if (request.Payload == null)
                        {
                            return BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات الفاتورة فارغة");
                        }
                        var saleToCreate = JsonConvert.DeserializeObject<Sale>(request.Payload.ToString());
                        var createdSale = DatabaseService.Sales.ProcessSale(saleToCreate);
                        return BridgeResponse.Ok(request.Id, createdSale);

                    case "sales:getRecent":
                        var recentSales = DatabaseService.Sales.GetRecentSales(20);
                        return BridgeResponse.Ok(request.Id, recentSales);

                    case "sales:getById":
                        string saleId = "";
                        JObject sIdObj = request.Payload as JObject;
                        if (sIdObj != null && sIdObj["id"] != null)
                        {
                            saleId = sIdObj["id"].ToString();
                        }
                        else if (request.Payload != null)
                        {
                            saleId = request.Payload.ToString().Trim('"', ' ');
                        }
                        var singleSale = DatabaseService.Sales.GetSaleById(saleId);
                        if (singleSale == null)
                        {
                            return BridgeResponse.Fail(request.Id, "SALE_NOT_FOUND", "لم يتم العثور على الفاتورة المطلوبة");
                        }
                        return BridgeResponse.Ok(request.Id, singleSale);

                    case "sales:cancel":
                        string cancelSaleId = "";
                        string cancelReason = "إلغاء بناء على طلب الكاشير";
                        string cancelUserId = "usr_admin_default";
                        JObject cPayload = request.Payload as JObject;
                        if (cPayload != null)
                        {
                            if (cPayload["saleId"] != null) cancelSaleId = cPayload["saleId"].ToString();
                            else if (cPayload["id"] != null) cancelSaleId = cPayload["id"].ToString();
                            if (cPayload["reason"] != null) cancelReason = cPayload["reason"].ToString();
                            if (cPayload["userId"] != null) cancelUserId = cPayload["userId"].ToString();
                        }
                        else if (request.Payload != null)
                        {
                            cancelSaleId = request.Payload.ToString().Trim('"', ' ');
                        }

                        if (string.IsNullOrWhiteSpace(cancelSaleId))
                        {
                            return BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "معرّف الفاتورة مطلوب لإلغائها");
                        }

                        var cancelledSale = DatabaseService.Sales.CancelSale(cancelSaleId, cancelReason, cancelUserId);
                        return BridgeResponse.Ok(request.Id, cancelledSale);

                    case "sales:getByInvoiceNumber":
                        int invNum = 0;
                        JObject invPayload = request.Payload as JObject;
                        if (invPayload != null && invPayload["invoiceNumber"] != null)
                        {
                            invNum = invPayload["invoiceNumber"].Value<int>();
                        }
                        else if (request.Payload != null)
                        {
                            int.TryParse(request.Payload.ToString().Trim('"', ' ', '#'), out invNum);
                        }
                        if (invNum <= 0)
                        {
                            return BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "رقم الفاتورة غير صحيح");
                        }
                        var foundSale = DatabaseService.Sales.GetSaleByInvoiceNumber(invNum);
                        return BridgeResponse.Ok(request.Id, foundSale);

                    case "sales:search":
                        string sQuery = null;
                        string sDateFrom = null;
                        string sDateTo = null;
                        string sCustomerId = null;
                        string sStatus = null;
                        long? sMinTotal = null;
                        long? sMaxTotal = null;
                        int sLimit = 100;

                        JObject sSearchObj = request.Payload as JObject;
                        if (sSearchObj != null)
                        {
                            if (sSearchObj["query"] != null) sQuery = sSearchObj["query"].ToString();
                            if (sSearchObj["dateFrom"] != null) sDateFrom = sSearchObj["dateFrom"].ToString();
                            if (sSearchObj["dateTo"] != null) sDateTo = sSearchObj["dateTo"].ToString();
                            if (sSearchObj["customerId"] != null) sCustomerId = sSearchObj["customerId"].ToString();
                            if (sSearchObj["status"] != null) sStatus = sSearchObj["status"].ToString();
                            if (sSearchObj["minTotal"] != null) sMinTotal = sSearchObj["minTotal"].Value<long>();
                            if (sSearchObj["maxTotal"] != null) sMaxTotal = sSearchObj["maxTotal"].Value<long>();
                            if (sSearchObj["limit"] != null) sLimit = sSearchObj["limit"].Value<int>();
                        }
                        else if (request.Payload != null)
                        {
                            sQuery = request.Payload.ToString().Trim('"', ' ');
                        }

                        var searchedSales = DatabaseService.Sales.SearchSales(
                            sQuery, sDateFrom, sDateTo, sCustomerId, sStatus, sMinTotal, sMaxTotal, sLimit
                        );
                        return BridgeResponse.Ok(request.Id, searchedSales);

                    case "counters:getNextExpectedInvoiceNumber":
                        long nextExpected = DatabaseService.CounterRepo != null 
                            ? DatabaseService.CounterRepo.GetNextExpectedInvoiceNumber() 
                            : 1;
                        return BridgeResponse.Ok(request.Id, new { nextInvoiceNumber = nextExpected });

                    case "db:testTransaction":
                        int count = 10;
                        JObject jObj = request.Payload as JObject;
                        if (jObj != null && jObj["count"] != null)
                        {
                            count = jObj["count"].Value<int>();
                        }
                        TransactionResult result = DatabaseService.ExecuteAtomicSaleTransaction(count);
                        if (result.Success)
                        {
                            return BridgeResponse.Ok(request.Id, new { success = true, message = result.Message });
                        }
                        else
                        {
                            return BridgeResponse.Fail(request.Id, "DB_TRANSACTION_FAILED", result.Message);
                        }

                    case "printer:getList":
                    case "printer:list":
                        var printers = DatabaseService.Printer.GetInstalledPrinters();
                        return BridgeResponse.Ok(request.Id, printers);

                    case "printer:test":
                    case "printer:testPrint":
                        string tPrinter = null;
                        string tWidth = null;
                        JObject tPayload = request.Payload as JObject;
                        if (tPayload != null)
                        {
                            if (tPayload["printerName"] != null) tPrinter = tPayload["printerName"].ToString();
                            if (tPayload["paperWidth"] != null) tWidth = tPayload["paperWidth"].ToString();
                        }
                        var testPrintResult = DatabaseService.Printer.PrintTestReceipt(tPrinter, tWidth);
                        return BridgeResponse.Ok(request.Id, testPrintResult);

                    case "printer:printReceipt":
                        if (request.Payload == null)
                        {
                            return BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات الفاتورة المراد طباعتها فارغة");
                        }
                        Sale saleToPrint = null;
                        string pPrinter = null;
                        string pWidth = null;
                        bool? pDrawer = null;
                        bool pIsCopy = false;

                        JObject printPayload = request.Payload as JObject;
                        if (printPayload != null && printPayload["sale"] != null)
                        {
                            saleToPrint = JsonConvert.DeserializeObject<Sale>(printPayload["sale"].ToString());
                            if (printPayload["printerName"] != null) pPrinter = printPayload["printerName"].ToString();
                            if (printPayload["paperWidth"] != null) pWidth = printPayload["paperWidth"].ToString();
                            if (printPayload["openDrawer"] != null) pDrawer = printPayload["openDrawer"].Value<bool>();
                            if (printPayload["isCopy"] != null) pIsCopy = printPayload["isCopy"].Value<bool>();
                        }
                        else
                        {
                            saleToPrint = JsonConvert.DeserializeObject<Sale>(request.Payload.ToString());
                            if (printPayload != null && printPayload["isCopy"] != null)
                            {
                                pIsCopy = printPayload["isCopy"].Value<bool>();
                            }
                        }

                        if (saleToPrint == null)
                        {
                            return BridgeResponse.Fail(request.Id, "INVALID_SALE", "تعذر تحليل بيانات الفاتورة المراد طباعتها");
                        }

                        var printReceiptResult = DatabaseService.Printer.PrintSaleReceipt(saleToPrint, pPrinter, pWidth, pDrawer, pIsCopy);
                        return BridgeResponse.Ok(request.Id, printReceiptResult);

                    case "settings:getAll":
                        var allSettings = DatabaseService.Settings.GetAllSettings();
                        return BridgeResponse.Ok(request.Id, allSettings);

                    case "settings:save":
                        if (request.Payload == null)
                        {
                            return BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات الإعدادات فارغة");
                        }
                        var settingsDict = JsonConvert.DeserializeObject<Dictionary<string, string>>(request.Payload.ToString());
                        var updatedSettings = DatabaseService.Settings.SaveSettings(settingsDict);
                        return BridgeResponse.Ok(request.Id, updatedSettings);

                    case "features:getAll":
                        var flags = DatabaseService.Settings.GetFeatureFlags();
                        return BridgeResponse.Ok(request.Id, flags);

                    case "features:set":
                        if (request.Payload == null)
                        {
                            return BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات الميزة فارغة");
                        }
                        JObject featObj = request.Payload as JObject;
                        if (featObj != null && featObj["key"] != null && featObj["enabled"] != null)
                        {
                            string fKey = featObj["key"].ToString();
                            bool fEnabled = featObj["enabled"].Value<bool>();
                            DatabaseService.Settings.SetFeatureFlag(fKey, fEnabled);
                            return BridgeResponse.Ok(request.Id, new { key = fKey, enabled = fEnabled });
                        }
                        return BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "الحقول المطلوبة (key, enabled) ناقصة");

                    case "security:getStatus":
                        var secStatus = DatabaseService.Security.GetStatus();
                        return BridgeResponse.Ok(request.Id, secStatus);

                    case "security:verifyPin":
                        if (request.Payload == null)
                        {
                            return BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات التحقق فارغة");
                        }
                        JObject verifyObj = request.Payload as JObject;
                        string verifyPinVal = verifyObj != null && verifyObj["pin"] != null ? verifyObj["pin"].ToString() : "";
                        string verifyActionVal = verifyObj != null && verifyObj["action"] != null ? verifyObj["action"].ToString() : "";
                        var verifyResult = DatabaseService.Security.VerifyPin(verifyPinVal, verifyActionVal);
                        return BridgeResponse.Ok(request.Id, verifyResult);

                    case "security:setPin":
                        if (request.Payload == null)
                        {
                            return BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات تعيين الرقم السري فارغة");
                        }
                        JObject setPinObj = request.Payload as JObject;
                        string newPin = setPinObj != null && setPinObj["newPin"] != null ? setPinObj["newPin"].ToString() : "";
                        string currPin = setPinObj != null && setPinObj["currentPin"] != null ? setPinObj["currentPin"].ToString() : null;
                        string recCode = setPinObj != null && setPinObj["recoveryCode"] != null ? setPinObj["recoveryCode"].ToString() : null;
                        var setPinResult = DatabaseService.Security.SetPin(newPin, currPin, recCode);
                        if (!setPinResult.Success)
                        {
                            return BridgeResponse.Fail(request.Id, "PIN_SET_FAILED", setPinResult.Message);
                        }
                        return BridgeResponse.Ok(request.Id, setPinResult);

                    case "security:resetWithRecovery":
                        if (request.Payload == null)
                        {
                            return BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات الاسترجاع فارغة");
                        }
                        JObject recoveryPayloadObj = request.Payload as JObject;
                        string rCode = recoveryPayloadObj != null && recoveryPayloadObj["recoveryCode"] != null ? recoveryPayloadObj["recoveryCode"].ToString() : "";
                        string rNewPin = recoveryPayloadObj != null && recoveryPayloadObj["newPin"] != null ? recoveryPayloadObj["newPin"].ToString() : "";
                        var recResult = DatabaseService.Security.ResetWithRecoveryCode(rCode, rNewPin);
                        if (!recResult.Success)
                        {
                            return BridgeResponse.Fail(request.Id, "RECOVERY_FAILED", recResult.Message);
                        }
                        return BridgeResponse.Ok(request.Id, recResult);

                    case "security:disablePin":
                        if (request.Payload == null)
                        {
                            return BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "الرقم السري الحالي مطلوب لإلغاء التفعيل");
                        }
                        JObject disObj = request.Payload as JObject;
                        string disPin = disObj != null && disObj["currentPin"] != null ? disObj["currentPin"].ToString() : "";
                        bool disabled = DatabaseService.Security.DisablePin(disPin);
                        if (!disabled)
                        {
                            return BridgeResponse.Fail(request.Id, "PIN_DISABLE_FAILED", "الرقم السري غير صحيح");
                        }
                        return BridgeResponse.Ok(request.Id, new { success = true });

                    case "security:enablePin":
                        if (request.Payload == null)
                        {
                            return BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "الرقم السري الحالي مطلوب للتفعيل");
                        }
                        JObject enObj = request.Payload as JObject;
                        string enPin = enObj != null && enObj["currentPin"] != null ? enObj["currentPin"].ToString() : "";
                        bool enabled = DatabaseService.Security.EnablePin(enPin);
                        if (!enabled)
                        {
                            return BridgeResponse.Fail(request.Id, "PIN_ENABLE_FAILED", "الرقم السري غير صحيح");
                        }
                        return BridgeResponse.Ok(request.Id, new { success = true });

                    case "security:saveProtectedActions":
                        if (request.Payload == null)
                        {
                            return BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات العمليات المحمية فارغة");
                        }
                        JObject actObj = request.Payload as JObject;
                        string actPin = actObj != null && actObj["currentPin"] != null ? actObj["currentPin"].ToString() : "";
                        Dictionary<string, bool> actionsDict = new Dictionary<string, bool>();
                        if (actObj != null && actObj["actions"] != null)
                        {
                            actionsDict = JsonConvert.DeserializeObject<Dictionary<string, bool>>(actObj["actions"].ToString());
                        }
                        bool actSaved = DatabaseService.Security.SaveProtectedActions(actionsDict, actPin);
                        if (!actSaved)
                        {
                            return BridgeResponse.Fail(request.Id, "AUTH_FAILED", "الرقم السري غير صحيح لحفظ إعدادات الحماية");
                        }
                        return BridgeResponse.Ok(request.Id, new { success = true });

                    case "templates:getAll":
                        var allTemplates = DatabaseService.Templates.GetAllTemplates();
                        return BridgeResponse.Ok(request.Id, allTemplates);

                    case "templates:isFirstRunNeeded":
                        bool needed = DatabaseService.Templates.IsFirstRunNeeded();
                        return BridgeResponse.Ok(request.Id, new { isNeeded = needed });

                    case "templates:apply":
                        if (request.Payload == null)
                        {
                            return BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات تطبيق القالب فارغة");
                        }
                        var applyReq = JsonConvert.DeserializeObject<ApplyTemplateRequest>(request.Payload.ToString());
                        var applyRes = DatabaseService.Templates.ApplyTemplate(applyReq);
                        if (!applyRes.Success)
                        {
                            return BridgeResponse.Fail(request.Id, "TEMPLATE_APPLY_FAILED", applyRes.Message);
                        }
                        return BridgeResponse.Ok(request.Id, applyRes);

                    case "demo:getStatus":
                        var demoStatus = DatabaseService.DemoData.GetStatus();
                        return BridgeResponse.Ok(request.Id, demoStatus);

                    case "demo:load":
                        string demoStoreType = "supermarket";
                        if (request.Payload != null)
                        {
                            JObject demoLoadObj = request.Payload as JObject;
                            if (demoLoadObj != null && demoLoadObj["storeType"] != null)
                            {
                                demoStoreType = demoLoadObj["storeType"].ToString();
                            }
                            else if (request.Payload is string)
                            {
                                demoStoreType = request.Payload.ToString();
                            }
                        }
                        var demoLoadRes = DatabaseService.DemoData.LoadDemoData(demoStoreType);
                        if (!demoLoadRes.Success)
                        {
                            return BridgeResponse.Fail(request.Id, "DEMO_LOAD_FAILED", demoLoadRes.Message);
                        }
                        return BridgeResponse.Ok(request.Id, demoLoadRes);

                    case "demo:clear":
                        var demoClearRes = DatabaseService.DemoData.ClearDemoData();
                        if (!demoClearRes.Success)
                        {
                            return BridgeResponse.Fail(request.Id, "DEMO_CLEAR_FAILED", demoClearRes.Message);
                        }
                        return BridgeResponse.Ok(request.Id, demoClearRes);

                    case "readiness:getStatus":
                        var readinessStatus = DatabaseService.Readiness.GetStatus();
                        return BridgeResponse.Ok(request.Id, readinessStatus);

                    case "readiness:processTestSale":
                        Sale inputTestSale = null;
                        if (request.Payload != null)
                        {
                            inputTestSale = JsonConvert.DeserializeObject<Sale>(request.Payload.ToString());
                        }
                        var testSaleResult = DatabaseService.Sales.ProcessTestSale(inputTestSale);
                        return BridgeResponse.Ok(request.Id, testSaleResult);

                    case "health:getStatus":
                        var systemHealth = DatabaseService.SystemHealth.GetSystemHealth();
                        return BridgeResponse.Ok(request.Id, systemHealth);

                    case "customers:getAll":
                        int custLimit = 100;
                        JObject getCustObj = request.Payload as JObject;
                        if (getCustObj != null && getCustObj["limit"] != null)
                        {
                            custLimit = getCustObj["limit"].Value<int>();
                        }
                        var allCustomers = DatabaseService.Customers.GetAll(custLimit);
                        return BridgeResponse.Ok(request.Id, allCustomers);

                    case "customers:search":
                        string custQuery = "";
                        JObject searchCustObj = request.Payload as JObject;
                        if (searchCustObj != null && searchCustObj["query"] != null)
                        {
                            custQuery = searchCustObj["query"].ToString();
                        }
                        var custSearchResults = DatabaseService.Customers.Search(custQuery);
                        return BridgeResponse.Ok(request.Id, custSearchResults);

                    case "customers:save":
                        if (request.Payload == null)
                        {
                            return BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات العميل فارغة");
                        }
                        var customerToSave = JsonConvert.DeserializeObject<Customer>(request.Payload.ToString());
                        var savedCustomer = DatabaseService.Customers.SaveCustomer(customerToSave);
                        return BridgeResponse.Ok(request.Id, savedCustomer);

                    case "customers:recordPayment":
                        if (request.Payload == null)
                        {
                            return BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات السداد فارغة");
                        }
                        JObject payObj = request.Payload as JObject;
                        if (payObj == null || payObj["customerId"] == null || payObj["amountPiasters"] == null)
                        {
                            return BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات السداد غير مكتملة");
                        }
                        string payCustId = payObj["customerId"].ToString();
                        long payAmount = payObj["amountPiasters"].Value<long>();
                        string payNotes = payObj["notes"] != null ? payObj["notes"].ToString() : "";
                        var updatedCustomerAfterPay = DatabaseService.Customers.RecordPayment(payCustId, payAmount, payNotes);
                        return BridgeResponse.Ok(request.Id, updatedCustomerAfterPay);

                    case "customers:cancelPayment":
                        if (request.Payload == null)
                        {
                            return BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات إلغاء السداد فارغة");
                        }
                        JObject cancelPayObj = request.Payload as JObject;
                        if (cancelPayObj == null || cancelPayObj["customerId"] == null || cancelPayObj["ledgerEntryId"] == null)
                        {
                            return BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات إلغاء السداد غير مكتملة");
                        }
                        string cpCustId = cancelPayObj["customerId"].ToString();
                        string cpLedgerId = cancelPayObj["ledgerEntryId"].ToString();
                        string cpReason = cancelPayObj["reason"] != null ? cancelPayObj["reason"].ToString() : "سجلت بالخطأ";
                        string cpUser = cancelPayObj["userName"] != null ? cancelPayObj["userName"].ToString() : "الكاشير";
                        var custAfterCancel = DatabaseService.Customers.CancelPayment(cpCustId, cpLedgerId, cpReason, cpUser);
                        return BridgeResponse.Ok(request.Id, custAfterCancel);

                    case "customers:checkPhone":
                        string checkPhoneNum = "";
                        string checkExcludeId = null;
                        JObject cpObj = request.Payload as JObject;
                        if (cpObj != null)
                        {
                            if (cpObj["phone"] != null) checkPhoneNum = cpObj["phone"].ToString();
                            if (cpObj["excludeId"] != null) checkExcludeId = cpObj["excludeId"].ToString();
                        }
                        else if (request.Payload != null)
                        {
                            checkPhoneNum = request.Payload.ToString().Trim('"', ' ');
                        }
                        var existingCust = DatabaseService.Customers.FindByPhone(checkPhoneNum, checkExcludeId);
                        return BridgeResponse.Ok(request.Id, new
                        {
                            isDuplicate = existingCust != null,
                            existingCustomer = existingCust
                        });

                    case "customers:verifyBalance":
                        string vbCustId = "";
                        JObject vbObj = request.Payload as JObject;
                        if (vbObj != null && vbObj["customerId"] != null) vbCustId = vbObj["customerId"].ToString();
                        else if (request.Payload != null) vbCustId = request.Payload.ToString().Trim('"', ' ');
                        var verifyRes = DatabaseService.Customers.VerifyBalance(vbCustId);
                        return BridgeResponse.Ok(request.Id, verifyRes);

                    case "customers:recalculateBalance":
                        string rbCustId = "";
                        JObject rbObj = request.Payload as JObject;
                        if (rbObj != null && rbObj["customerId"] != null) rbCustId = rbObj["customerId"].ToString();
                        else if (request.Payload != null) rbCustId = request.Payload.ToString().Trim('"', ' ');
                        var fixedCust = DatabaseService.Customers.RecalculateAndFixBalance(rbCustId);
                        return BridgeResponse.Ok(request.Id, fixedCust);

                    case "customers:getDetailedStatement":
                        string detCustId = "";
                        string detStartDate = null;
                        string detEndDate = null;
                        JObject detObj = request.Payload as JObject;
                        if (detObj != null)
                        {
                            if (detObj["customerId"] != null) detCustId = detObj["customerId"].ToString();
                            if (detObj["startDate"] != null) detStartDate = detObj["startDate"].ToString();
                            if (detObj["endDate"] != null) detEndDate = detObj["endDate"].ToString();
                        }
                        var detailedStatement = DatabaseService.Customers.GetDetailedStatement(detCustId, detStartDate, detEndDate);
                        return BridgeResponse.Ok(request.Id, detailedStatement);

                    case "categories:getAll":
                        bool incArchived = false;
                        JObject getCatObj = request.Payload as JObject;
                        if (getCatObj != null && getCatObj["includeArchived"] != null)
                        {
                            incArchived = getCatObj["includeArchived"].Value<bool>();
                        }
                        var allCats = DatabaseService.Categories.GetAll(incArchived);
                        return BridgeResponse.Ok(request.Id, allCats);

                    case "categories:save":
                        if (request.Payload == null)
                        {
                            return BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات التصنيف فارغة");
                        }
                        var catToSave = JsonConvert.DeserializeObject<Category>(request.Payload.ToString());
                        var savedCat = DatabaseService.Categories.SaveCategory(catToSave);
                        return BridgeResponse.Ok(request.Id, savedCat);

                    case "categories:archive":
                        if (request.Payload == null)
                        {
                            return BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "معرف التصنيف فارغ");
                        }
                        JObject archCatObj = request.Payload as JObject;
                        string archCatId = archCatObj != null && archCatObj["id"] != null ? archCatObj["id"].ToString() : "";
                        bool isArch = archCatObj != null && archCatObj["isArchived"] != null ? archCatObj["isArchived"].Value<bool>() : true;
                        DatabaseService.Categories.ArchiveCategory(archCatId, isArch);
                        return BridgeResponse.Ok(request.Id, new { success = true, id = archCatId, isArchived = isArch });

                    case "categories:reorder":
                        if (request.Payload == null)
                        {
                            return BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "قائمة الترتيب فارغة");
                        }
                        JObject reorderObj = request.Payload as JObject;
                        List<string> orderedIds = null;
                        if (reorderObj != null && reorderObj["orderedIds"] != null)
                        {
                            orderedIds = reorderObj["orderedIds"].ToObject<List<string>>();
                        }
                        DatabaseService.Categories.ReorderCategories(orderedIds);
                        return BridgeResponse.Ok(request.Id, new { success = true });

                    case "quickItems:getAll":
                        var allQuickItems = DatabaseService.QuickItems.GetAll();
                        return BridgeResponse.Ok(request.Id, allQuickItems);

                    case "quickItems:save":
                        if (request.Payload == null)
                        {
                            return BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات الصنف السريع فارغة");
                        }
                        var quickItemToSave = JsonConvert.DeserializeObject<QuickItem>(request.Payload.ToString());
                        var savedQuickItem = DatabaseService.QuickItems.Save(quickItemToSave);
                        return BridgeResponse.Ok(request.Id, savedQuickItem);

                    case "quickItems:delete":
                        if (request.Payload == null)
                        {
                            return BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "معرف الصنف السريع فارغ");
                        }
                        string deleteQuickId = "";
                        JObject delQuickObj = request.Payload as JObject;
                        if (delQuickObj != null && delQuickObj["id"] != null)
                        {
                            deleteQuickId = delQuickObj["id"].ToString();
                        }
                        else if (request.Payload != null)
                        {
                            deleteQuickId = request.Payload.ToString().Trim('"', ' ');
                        }
                        bool delSuccess = DatabaseService.QuickItems.Delete(deleteQuickId);
                        return BridgeResponse.Ok(request.Id, new { success = delSuccess, id = deleteQuickId });

                    case "quickItems:reorder":
                        if (request.Payload == null)
                        {
                            return BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "قائمة الترتيب فارغة");
                        }
                        JObject reorderQuickObj = request.Payload as JObject;
                        List<string> orderedQuickIds = null;
                        if (reorderQuickObj != null && reorderQuickObj["orderedIds"] != null)
                        {
                            orderedQuickIds = reorderQuickObj["orderedIds"].ToObject<List<string>>();
                        }
                        DatabaseService.QuickItems.Reorder(orderedQuickIds);
                        return BridgeResponse.Ok(request.Id, new { success = true });

                    case "customers:getStatement":
                        string statCustId = "";
                        JObject statObj = request.Payload as JObject;
                        if (statObj != null && statObj["customerId"] != null)
                        {
                            statCustId = statObj["customerId"].ToString();
                        }
                        var statement = DatabaseService.Customers.GetStatement(statCustId, 50);
                        return BridgeResponse.Ok(request.Id, statement);

                    case "customers:runTests":
                        var custTestRes = CustomerLedgerTestRunner.RunAllTests();
                        if (custTestRes.Success)
                        {
                            return BridgeResponse.Ok(request.Id, custTestRes);
                        }
                        return BridgeResponse.Fail(request.Id, "CUSTOMER_TESTS_FAILED", custTestRes.Message);

                    case "reports:getTodaySummary":
                        var summary = DatabaseService.Reports.GetTodaySummary();
                        return BridgeResponse.Ok(request.Id, summary);

                    case "audit:getLogs":
                        int auditLimit = 100;
                        string auditAction = null;
                        JObject auditObj = request.Payload as JObject;
                        if (auditObj != null)
                        {
                            if (auditObj["limit"] != null)
                            {
                                auditLimit = auditObj["limit"].Value<int>();
                            }
                            if (auditObj["action"] != null)
                            {
                                auditAction = auditObj["action"].ToString();
                            }
                        }
                        var logs = DatabaseService.Audit.GetLogs(auditLimit, auditAction);
                        return BridgeResponse.Ok(request.Id, logs);

                    case "support:getSystemInfo":
                        var supportInfo = DatabaseService.Support.GetSystemDiagnosticInfo();
                        return BridgeResponse.Ok(request.Id, supportInfo);

                    case "support:createBundle":
                        var bundleResult = DatabaseService.Support.CreateSupportBundle();
                        return BridgeResponse.Ok(request.Id, bundleResult);

                    case "system:checkClock":
                        var clockResult = TimeGuard.ValidateSystemClock(DatabaseService.ConnectionString);
                        return BridgeResponse.Ok(request.Id, clockResult);

                    case "benchmark:run":
                        int pCount = 3000;
                        if (request.Payload != null)
                        {
                            JObject bObj = request.Payload as JObject;
                            if (bObj != null && bObj["productCount"] != null)
                            {
                                pCount = bObj["productCount"].Value<int>();
                            }
                        }
                        var benchResult = DatabaseService.Benchmark.RunStressTest(pCount);
                        return BridgeResponse.Ok(request.Id, benchResult);

                    case "backup:getStatus":
                        var backupStatus = DatabaseService.Backup.GetStatus();
                        return BridgeResponse.Ok(request.Id, backupStatus);

                    case "backup:create":
                        string customFolder = null;
                        if (request.Payload != null)
                        {
                            JObject bkObj = request.Payload as JObject;
                            if (bkObj != null && bkObj["folder"] != null)
                            {
                                customFolder = bkObj["folder"].ToString();
                            }
                        }
                        var createResult = DatabaseService.Backup.CreateBackup(customFolder);
                        return BridgeResponse.Ok(request.Id, createResult);

                    case "backup:getDrives":
                        var drives = DatabaseService.Backup.GetAvailableDrives();
                        return BridgeResponse.Ok(request.Id, drives);

                    case "backup:configure":
                        if (request.Payload == null)
                        {
                            return BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات إعدادات النسخ فارغة");
                        }
                        JObject cfgObj = request.Payload as JObject;
                        string bFolder = cfgObj != null && cfgObj["targetFolder"] != null ? cfgObj["targetFolder"].ToString() : "";
                        bool bAutoClose = cfgObj != null && cfgObj["autoOnClose"] != null ? cfgObj["autoOnClose"].Value<bool>() : true;
                        bool bAutoDaily = cfgObj != null && cfgObj["autoDaily"] != null ? cfgObj["autoDaily"].Value<bool>() : true;
                        int bRetDays = cfgObj != null && cfgObj["retentionDays"] != null ? cfgObj["retentionDays"].Value<int>() : 7;
                        int bRetWeeks = cfgObj != null && cfgObj["retentionWeeks"] != null ? cfgObj["retentionWeeks"].Value<int>() : 4;
                        int bWarnDays = cfgObj != null && cfgObj["warnAfterDays"] != null ? cfgObj["warnAfterDays"].Value<int>() : 2;

                        DatabaseService.Backup.SaveConfiguration(bFolder, bAutoClose, bAutoDaily, bRetDays, bRetWeeks, bWarnDays);
                        return BridgeResponse.Ok(request.Id, new { success = true });

                    case "database:checkIntegrity":
                        var dbIntegrity = DatabaseService.CheckDatabaseIntegrity();
                        return BridgeResponse.Ok(request.Id, dbIntegrity);

                    case "database:restore":
                        string restoreFilePath = null;
                        if (request.Payload != null)
                        {
                            JObject rObj = request.Payload as JObject;
                            if (rObj != null && rObj["backupFilePath"] != null)
                            {
                                restoreFilePath = rObj["backupFilePath"].ToString();
                            }
                        }
                        var restoreResult = DatabaseService.RestoreFromBackup(restoreFilePath);
                        if (restoreResult.Success)
                        {
                            return BridgeResponse.Ok(request.Id, new { success = true, message = restoreResult.Message });
                        }
                        return BridgeResponse.Fail(request.Id, "RESTORE_FAILED", restoreResult.Message);

                    case "backup:verify":
                        string verifyFilePath = "";
                        if (request.Payload != null)
                        {
                            JObject vObj = request.Payload as JObject;
                            if (vObj != null && vObj["backupFilePath"] != null)
                            {
                                verifyFilePath = vObj["backupFilePath"].ToString();
                            }
                            else
                            {
                                verifyFilePath = request.Payload.ToString().Trim('"', ' ');
                            }
                        }
                        bool isVerified = DatabaseService.Backup.VerifyBackupIntegrity(verifyFilePath);
                        return BridgeResponse.Ok(request.Id, new
                        {
                            success = isVerified,
                            isVerified = isVerified,
                            message = isVerified
                                ? "تم فحص النسخة الاحتياطية بنجاح: بنية B-Tree سليمة وتطابق أعداد الأصناف والفواتير مع قاعدة البيانات الأصلية."
                                : "فشل فحص النسخة الاحتياطية: الملف تالف أو لا يطابق سجلات النظام."
                        });

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
                        return BridgeResponse.Ok(request.Id, movements);

                    case "inventory:adjustStock":
                        if (request.Payload == null)
                        {
                            return BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات التسوية الجردية فارغة");
                        }
                        JObject adjObj = request.Payload as JObject;
                        if (adjObj == null || adjObj["productId"] == null || adjObj["newStockQuantityMilli"] == null)
                        {
                            return BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "معرف المنتج والرصيد الجديد مطلوبان");
                        }
                        string adjProdId = adjObj["productId"].ToString();
                        long newStockMilli = adjObj["newStockQuantityMilli"].Value<long>();
                        string adjReason = adjObj["reason"] != null ? adjObj["reason"].ToString() : "";
                        string adjUser = adjObj["userId"] != null ? adjObj["userId"].ToString() : "admin";
                        var adjMovement = DatabaseService.Inventory.AdjustStock(adjProdId, newStockMilli, adjReason, adjUser);
                        return BridgeResponse.Ok(request.Id, adjMovement);

                    case "inventory:getDiscrepancies":
                        var discrepancies = DatabaseService.Inventory.CheckDiscrepancies();
                        return BridgeResponse.Ok(request.Id, discrepancies);

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
                        return BridgeResponse.Ok(request.Id, new
                        {
                            success = true,
                            updatedCount = updatedCount,
                            message = string.Format("تمت إعادة حساب ومطابقة المخزون بنجاح لـ {0} منتج.", updatedCount)
                        });

                    case "inventory:runTests":
                        var testRes = InventoryTestRunner.RunAllTests();
                        if (testRes.Success)
                        {
                            return BridgeResponse.Ok(request.Id, testRes);
                        }
                        return BridgeResponse.Fail(request.Id, "INVENTORY_TESTS_FAILED", testRes.Message);

                    case "search:runBenchmark":
                        int benchProdCount = 5000;
                        int benchQueryCount = 100;
                        JObject benchObj = request.Payload as JObject;
                        if (benchObj != null)
                        {
                            if (benchObj["productCount"] != null) benchProdCount = benchObj["productCount"].Value<int>();
                            if (benchObj["queryIterations"] != null) benchQueryCount = benchObj["queryIterations"].Value<int>();
                        }
                        var benchRunner = new SearchBenchmarkRunner(DatabaseService.ConnectionString, DatabaseService.ProductRepo);
                        var benchRes = benchRunner.RunBenchmark(benchProdCount, benchQueryCount);
                        return BridgeResponse.Ok(request.Id, benchRes);

                    case "excel:getTemplate":
                        string tplBase64 = DatabaseService.Excel.GenerateProductTemplateBase64();
                        return BridgeResponse.Ok(request.Id, new
                        {
                            success = true,
                            fileName = "قالب_استيراد_المنتجات_رفيق_POS.xlsx",
                            base64 = tplBase64
                        });

                    case "excel:exportProducts":
                        var prodsToExport = DatabaseService.ProductRepo.GetAll(50000);
                        var cats = DatabaseService.CategoryRepo.GetAll(true);
                        var catDict = new Dictionary<string, string>();
                        if (cats != null)
                        {
                            foreach (var c in cats)
                            {
                                if (!string.IsNullOrEmpty(c.Id)) catDict[c.Id] = c.Name;
                            }
                        }
                        string expBase64 = DatabaseService.Excel.ExportProductsBase64(prodsToExport, catDict);
                        string exportFileName = string.Format("كتالوج_أصناف_رفيق_{0}.xlsx", DateTime.Now.ToString("yyyyMMdd_HHmm"));
                        return BridgeResponse.Ok(request.Id, new
                        {
                            success = true,
                            fileName = exportFileName,
                            base64 = expBase64,
                            count = prodsToExport.Count
                        });

                    case "excel:getCustomerTemplate":
                        string custTplBase64 = DatabaseService.Excel.GenerateCustomerTemplateBase64();
                        return BridgeResponse.Ok(request.Id, new
                        {
                            success = true,
                            fileName = "قالب_استيراد_العملاء_رفيق_POS.xlsx",
                            base64 = custTplBase64
                        });

                    case "excel:previewCustomerImport":
                        string pBase64 = "";
                        JObject prevCustObj = request.Payload as JObject;
                        if (prevCustObj != null && prevCustObj["base64"] != null) pBase64 = prevCustObj["base64"].ToString();
                        else if (request.Payload != null) pBase64 = request.Payload.ToString().Trim('"', ' ');
                        var previewResult = DatabaseService.Excel.ParseCustomerImportBase64(pBase64, DatabaseService.CustomerRepo);
                        return BridgeResponse.Ok(request.Id, previewResult);

                    case "excel:importCustomers":
                        if (request.Payload == null) return BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات الاستيراد فارغة");
                        List<CustomerImportRow> rowsToImport = null;
                        JObject impCustObj = request.Payload as JObject;
                        if (impCustObj != null && impCustObj["rows"] != null)
                        {
                            rowsToImport = impCustObj["rows"].ToObject<List<CustomerImportRow>>();
                        }
                        else
                        {
                            rowsToImport = JsonConvert.DeserializeObject<List<CustomerImportRow>>(request.Payload.ToString());
                        }
                        var custImportResult = DatabaseService.Customers.BatchImportCustomers(rowsToImport);
                        return BridgeResponse.Ok(request.Id, custImportResult);

                    default:
                        Logger.Warn("محاولة تنفيذ إجراء غير مسجل: " + request.Action);
                        return BridgeResponse.Fail(request.Id, "ACTION_NOT_FOUND", "الإجراء غير مسجل في النواة: " + request.Action);
                }
            }
            catch (Exception ex)
            {
                Logger.Error("خطأ غير متوقع أثناء معالجة طلب IPC: " + request.Action, ex);
                return BridgeResponse.Fail(request.Id, "INTERNAL_ERROR", ex.Message);
            }
        }
    }
}
