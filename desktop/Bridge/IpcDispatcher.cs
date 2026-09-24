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
                request.Action == "products:save" ||
                request.Action == "products:delete" ||
                request.Action == "products:bulkUpdateMinStock" ||
                request.Action == "products:importBatch" ||
                request.Action == "categories:save" ||
                request.Action == "categories:archive" ||
                request.Action == "categories:reorder" ||
                request.Action == "customers:save" ||
                request.Action == "customers:recordPayment"))
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
                        JObject searchObj = request.Payload as JObject;
                        if (searchObj != null && searchObj["query"] != null)
                        {
                            query = searchObj["query"].ToString();
                        }
                        var searchResults = DatabaseService.Products.Search(query);
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

                    case "printer:test":
                        return BridgeResponse.Ok(request.Id, new
                        {
                            success = true,
                            message = "تمت محاكاة طباعة إيصال عربي (ESC/POS) بعرض 80مم عبر Win32 Spooler بنجاح"
                        });

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

                    case "customers:getStatement":
                        string statCustId = "";
                        JObject statObj = request.Payload as JObject;
                        if (statObj != null && statObj["customerId"] != null)
                        {
                            statCustId = statObj["customerId"].ToString();
                        }
                        var statement = DatabaseService.Customers.GetStatement(statCustId, 50);
                        return BridgeResponse.Ok(request.Id, statement);

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
