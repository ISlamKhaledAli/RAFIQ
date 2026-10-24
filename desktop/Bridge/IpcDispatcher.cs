using System;
using System.Collections.Generic;
using RafiqPOS.Common;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Bridge
{
    public partial class IpcDispatcher
    {
        public static BridgeResponse Dispatch(BridgeRequest request)
        {
            if (request == null || string.IsNullOrWhiteSpace(request.Action))
            {
                string reqId = (request != null && request.Id != null) ? request.Id : "";
                return BridgeResponse.Fail(reqId, "INVALID_REQUEST", "طلب غير صالح أو فارغ");
            }

            // License check runs first so an expired/invalid license or tampered clock strictly blocks commercial mutations (Task 173-2)
            if (DatabaseService.License != null && DatabaseService.License.IsLicenseExpired() && IsLicenseBlockedAction(request.Action))
            {
                return BridgeResponse.Fail(
                    request.Id,
                    "LICENSE_EXPIRED",
                    "انتهت فترة اشتراك البرنامج أو تم إيقافه. يرجى تجديد الترخيص لاستكمال عمليات البيع والأنشطة التجارية."
                );
            }

            // Central server-side authorization gate (Audit F-01 / F-03 / AGENTS Rule 8)
            BridgeResponse authFailure = AuthorizeRequest(request);
            if (authFailure != null)
            {
                return authFailure;
            }

            // Central server-side feature gate: block mutations for disabled features (Feature #182 / Task 182-2)
            BridgeResponse featureGateFailure = CheckFeatureGate(request);
            if (featureGateFailure != null)
            {
                return featureGateFailure;
            }

            // Lock write operations immediately if database is corrupt (Task 124-1)
            if (DatabaseService.IsCorrupted && (
                request.Action == "returns:create" ||
                request.Action == "customers:cancelPayment" ||
                request.Action == "customers:recalculateBalance" ||
                request.Action == "customers:archive" ||
                request.Action == "expenses:create" ||
                request.Action == "expenses:cancel" ||
                request.Action == "expenses:update" ||
                request.Action == "expenses:createCategory" ||
                request.Action == "epay:createTransaction" ||
                request.Action == "epay:fundTerminal" ||
                request.Action == "epay:saveTerminal" ||
                request.Action == "epay:adjustBalance" ||
                request.Action == "wallets:processTransaction" ||
                request.Action == "wallets:fundAccount" ||
                request.Action == "wallets:saveAccount" ||
                request.Action == "wallets:createAccount" ||
                request.Action == "wallets:updateAccount" ||
                request.Action == "wallets:deleteAccount" ||
                request.Action == "wallets:adjustBalance" ||
                request.Action == "wallets:cancelTransaction" ||
                request.Action == "closing:save" ||
                request.Action == "system:factoryReset" ||
                request.Action == "settings:save" ||
                request.Action == "settings:updateBatch" ||
                request.Action == "inventory:recordPurchase" ||
                request.Action == "productUnits:save" ||
                request.Action == "productUnits:delete" ||
                request.Action == "productUnits:setBase" ||
                request.Action == "products:rebaseUnit" ||
                request.Action == "packaging:saveLevels" ||
                request.Action == "excel:importCustomers" ||
                request.Action == "templates:apply" ||
                request.Action == "templates:seedProducts" ||
                request.Action == "demo:load" ||
                request.Action == "demo:clear" ||
                request.Action == "sales:create" ||
                request.Action == "sales:cancel" ||
                request.Action == "products:save" ||
                request.Action == "products:delete" ||
                request.Action == "products:bulkUpdateMinStock" ||
                request.Action == "products:applyBulkPriceAdjustment" ||
                request.Action == "products:revertBulkPriceAdjustment" ||
                request.Action == "products:importBatch" ||
                request.Action == "categories:save" ||
                request.Action == "categories:archive" ||
                request.Action == "categories:reorder" ||
                request.Action == "customers:save" ||
                request.Action == "customers:recordPayment" ||
                request.Action == "suppliers:save" ||
                request.Action == "suppliers:recordPayment" ||
                request.Action == "suppliers:archive" ||
                request.Action == "suppliers:delete" ||
                request.Action == "purchases:create" ||
                request.Action == "quickItems:save" ||
                request.Action == "quickItems:delete" ||
                request.Action == "quickItems:deleteCategory" ||
                request.Action == "quickItems:renameCategory" ||
                request.Action == "quickItems:reorder" ||
                request.Action == "inventory:adjustStock" ||
                request.Action == "inventory:recalculate" ||
                request.Action == "batch:save" ||
                request.Action == "batch:adjust" ||
                request.Action == "batch:disposeExpired" ||
                request.Action == "variants:createMatrix" ||
                request.Action == "variants:delete" ||
                request.Action == "variants:deleteVariant" ||
                request.Action == "shifts:open" ||
                request.Action == "shifts:close" ||
                request.Action == "shifts:cashIn" ||
                request.Action == "shifts:cashOut" ||
                request.Action == "drawer:cashIn" ||
                request.Action == "drawer:cashOut"))
            {
                return BridgeResponse.Fail(
                    request.Id,
                    "DATABASE_CORRUPT_LOCKED",
                    "قاعدة البيانات تالفة أو غير متسقة، تم إيقاف عمليات الكتابة والبيع لحماية البيانات. يرجى استرجاع نسخة احتياطية سليمة."
                );
            }

            bool isExclusive =
                request.Action == "database:restore" ||
                request.Action == "migration:restore" ||
                request.Action == "system:factoryReset";
            bool lockTaken = false;
            try
            {
                // Database replacement/reset must never run concurrently with other IPC work (Audit F-29)
                if (isExclusive)
                {
                    _dbGate.EnterWriteLock();
                }
                else
                {
                    _dbGate.EnterReadLock();
                }
                lockTaken = true;

                BridgeResponse response;
                if (TryDispatchProducts(request, out response)) return response;
                if (TryDispatchBatches(request, out response)) return response;
                if (TryDispatchVariants(request, out response)) return response;
                if (TryDispatchSales(request, out response)) return response;
                if (TryDispatchCustomers(request, out response)) return response;
                if (TryDispatchSuppliers(request, out response)) return response;
                if (TryDispatchPurchases(request, out response)) return response;
                if (TryDispatchInventory(request, out response)) return response;
                if (TryDispatchPrinting(request, out response)) return response;
                if (TryDispatchAuth(request, out response)) return response;
                if (TryDispatchTemplates(request, out response)) return response;
                if (TryDispatchReports(request, out response)) return response;
                if (TryDispatchBackup(request, out response)) return response;
                if (TryDispatchExcel(request, out response)) return response;
                if (TryDispatchSystem(request, out response)) return response;
                if (TryDispatchEpay(request, out response)) return response;
                if (TryDispatchWallets(request, out response)) return response;
                if (TryDispatchLocations(request, out response)) return response;
                if (TryDispatchShortages(request, out response)) return response;
                if (TryDispatchPharma(request, out response)) return response;
                if (TryDispatchInsurance(request, out response)) return response;
                if (TryDispatchPatients(request, out response)) return response;

                Logger.Warn("محاولة تنفيذ إجراء غير مسجل: " + request.Action);
                return BridgeResponse.Fail(request.Id, "ACTION_NOT_FOUND", "الإجراء غير مسجل في النواة: " + request.Action);
            }
            catch (Exception ex)
            {
                Logger.Error("خطأ غير متوقع أثناء معالجة طلب IPC: " + request.Action, ex);
                string cleanMsg = "حدث خطأ أثناء معالجة العملية، يرجى المحاولة مرة أخرى.";
                if (ex is System.Data.SQLite.SQLiteException)
                {
                    cleanMsg = "تعذر تحديث قاعدة البيانات، يرجى المحاولة مرة أخرى أو التأكد من سلامة البيانات.";
                }
                else if (!string.IsNullOrWhiteSpace(ex.Message) && !ex.Message.Contains("SQL") && !ex.Message.Contains("SQLite") && !ex.Message.Contains("table") && !ex.Message.Contains("column"))
                {
                    cleanMsg = ex.Message;
                }
                return BridgeResponse.Fail(request.Id, "INTERNAL_ERROR", cleanMsg);
            }
            finally
            {
                if (lockTaken)
                {
                    if (isExclusive) _dbGate.ExitWriteLock();
                    else _dbGate.ExitReadLock();
                }
            }
        }

        private static readonly System.Threading.ReaderWriterLockSlim _dbGate =
            new System.Threading.ReaderWriterLockSlim(System.Threading.LockRecursionPolicy.SupportsRecursion);

        private const string REQUIRE_ADMIN = "__admin__";
        private const string REQUIRE_SESSION = "__session_required__";
        // Store, printer and barcode-scanner screens all persist through the generic settings actions
        private const string REQUIRE_ANY_SETTINGS = "__any_settings__";

        private static readonly HashSet<string> PUBLIC_ACTIONS = new HashSet<string>(StringComparer.Ordinal)
        {
            // Login & session verification
            "auth:login",
            "auth:logout",
            "auth:getCurrentUser",
            "auth:checkSession",
            "security:resetWithRecovery",

            // System UI & basic status
            "system:appReady",
            "system:setTheme",
            "system:getInfo",
            "system:getEnv",
            "system:ping",
            "system:checkClock",
            "window:minimize",
            "window:maximize",
            "window:close",
            "window:setTitle",
            "window:getSize",
            "window:toggleFullscreen",
            "window:isFullscreen",
            "health:getStatus",

            // Licensing
            "license:verify",
            "license:checkExpiry",
            "license:getStatus",
            "license:getInfo",

            // First-run & initial store profile
            "settings:getStoreProfile",
            "features:getAll",
            "system.getFeatureRegistry",
            "system:getFeatureRegistry",
            "features:getRegistry",
            "support:getSystemInfo",
            "templates:getAll",
            "templates:isFirstRunNeeded",

            // Login Screen employee quick selection
            "auth:getActiveUsers"
        };

        // Sensitive actions -> required permission key (server-side RBAC, Audit F-01).
        private static readonly Dictionary<string, string> ACTION_PERMISSIONS = new Dictionary<string, string>
        {
            // Auth & Supervisor verification (F-36)
            { "auth:verifySupervisor", REQUIRE_SESSION },
            { "security:verifyPin", REQUIRE_SESSION },
            { "auth:hasPermission", REQUIRE_SESSION },
            { "security:getStatus", REQUIRE_SESSION },
            { "products:runBulkPriceAdjustmentTests", REQUIRE_ADMIN },

            // POS & Sales
            { "sales:create", "pos.sell" },
            { "sales:hold", "pos.hold_invoice" },
            { "sales:getHeld", "pos.hold_invoice" },
            { "sales:recallHeld", "pos.hold_invoice" },
            { "sales:deleteHeld", "pos.hold_invoice" },
            { "sales:cleanupHeld", REQUIRE_ADMIN },
            { "sales:cancel", "invoices.cancel" },
            { "sales:search", "invoices.view" },
            { "sales:getRecent", "pos.reprint" },
            { "sales:getById", "pos.reprint" },
            { "sales:getByInvoiceNumber", "pos.reprint" },
            { "counters:getNextExpectedInvoiceNumber", "pos.access" },

            // Returns
            { "returns:create", "returns.create" },
            { "returns:getRecent", "returns.create" },
            { "returns:getById", "returns.create" },
            { "returns:getForSale", "returns.create" },
            { "returns:printReceipt", "pos.reprint" },

            // Products & Catalog
            { "products:getAll", "products.view" },
            { "products:getById", "products.view" },
            { "products:getLowStock", "products.view" },
            { "products:getLowStockCount", "products.view" },
            { "products:getSmartCatalog", "products.view" },
            { "products:search", "products.view" },
            { "products:getMissingBarcodeCount", "products.view" },
            { "products:save", "products.edit" },
            { "products:delete", "products.archive" },
            { "products:bulkUpdateMinStock", "products.edit" },
            { "products:importBatch", "products.import" },
            { "products:previewBulkPriceAdjustment", "products.edit_price" },
            { "products:applyBulkPriceAdjustment", "products.edit_price" },
            { "products:revertBulkPriceAdjustment", "products.edit_price" },
            { "products:getPriceHistory", "products.edit_cost" },
            { "products:generateInternalBarcode", "products.edit" },
            { "products:assignInternalBarcode", "products.edit" },
            { "products:bulkGenerateInternalBarcodes", "products.edit" },
            { "products:rebaseUnit", "products.unit_rebase" },
            { "packaging:saveLevels", "products.packaging.edit" },
            { "productUnits:getByProduct", "products.view" },
            { "productUnits:calculateProfit", "products.edit_cost" },
            { "productUnits:save", "products.edit" },
            { "productUnits:delete", "products.edit" },
            { "productUnits:setBase", "products.edit" },
            { "variants:createMatrix", "products.edit" },
            { "variants:delete", "products.archive" },
            { "variants:deleteVariant", "products.archive" },
            { "variants:getMatrixReport", "products.view" },
            { "variants:getByParentId", "products.view" },
            { "variants:getParentWithVariants", "products.view" },
            { "categories:getAll", "products.view" },
            { "categories:save", "categories.manage" },
            { "categories:archive", "categories.manage" },
            { "categories:reorder", "categories.manage" },
            { "quickItems:getAll", "products.view" },
            { "quickItems:save", "products.edit" },
            { "quickItems:delete", "products.edit" },
            { "quickItems:reorder", "products.edit" },
            { "quickItems:deleteCategory", "products.edit" },
            { "quickItems:renameCategory", "products.edit" },

            // Stock & Inventory & Batches
            { "inventory:getMovements", "stock.movement_log" },
            { "inventory:getDiscrepancies", "stock.adjust" },
            { "inventory:adjustStock", "stock.adjust" },
            { "inventory:recalculate", "stock.adjust" },
            { "inventory:recordPurchase", "purchases.create" },
            { "batch:listByProduct", "stock.view" },
            { "batch:listExpiring", "stock.view" },
            { "batch:listExpired", "stock.view" },
            { "batch:getSuggested", "stock.view" },
            { "batch:summary", "stock.view" },
            { "batch:save", "stock.adjust" },
            { "batch:adjust", "stock.adjust" },
            { "batch:disposeExpired", "stock.adjust" },

            // Storage Locations & Shelves (Feature #185 / Story 128)
            { "locations:list", "stock.view" },
            { "locations:get", "stock.view" },
            { "locations:save", "inventory.locations.manage" },
            { "locations:delete", "inventory.locations.manage" },
            { "locations:assignProduct", "products.edit" },
            { "locations:getDraftInventory", "inventory.locations.manage" },
            { "locations:getProducts", "stock.view" },

            // Shortages (Feature #186 / Story 129)
            { "shortages:list", "shortage.view" },
            { "shortages:get", "shortage.view" },
            { "shortages:save", "shortage.manage" },
            { "shortages:updateStatus", "shortage.manage" },
            { "shortages:delete", "shortage.manage" },
            { "shortages:convertToPurchase", "shortage.convert_to_purchase" },
            { "shortages:getAuto", "shortage.view" },
            { "shortages:getLostSalesReport", "shortage.view" },

            // Pharmacy & Alternatives (Feature #187 / Story 130)
            { "pharma:getDrugInfo", "products.view" },
            { "pharma:saveDrugInfo", "pharma.drug_info.edit" },
            { "pharma:getAlternatives", "pharma.alternatives.view" },
            { "pharma:searchByIngredient", "products.view" },
            { "pharma:getDosageForms", "products.view" },
            { "pharma:saveDosageForm", "pharma.drug_info.edit" },
            { "pharma:getManufacturers", "products.view" },
            { "pharma:saveManufacturer", "pharma.drug_info.edit" },
            { "pharma:getTherapeuticClasses", "products.view" },
            { "pharma:saveTherapeuticClass", "pharma.drug_info.edit" },
            { "pharma:getActiveIngredients", "products.view" },
            { "pharma:saveActiveIngredient", "pharma.drug_info.edit" },
            { "pharma.getDrugInfo", "products.view" },
            { "pharma.saveDrugInfo", "pharma.drug_info.edit" },
            { "pharma.getAlternatives", "pharma.alternatives.view" },
            { "pharma.searchByIngredient", "products.view" },

            // Expiry Returns & External Drug Reference (Story 134 / Feature #191)
            { "pharma:getExpiryReturnableBatches", "pharma.expiry_returns.manage" },
            { "pharma.getExpiryReturnableBatches", "pharma.expiry_returns.manage" },
            { "pharma:createExpiryReturn", "pharma.expiry_returns.manage" },
            { "pharma.createExpiryReturn", "pharma.expiry_returns.manage" },
            { "pharma:getExpiredBatches", "pharma.expiry_returns.manage" },
            { "pharma.getExpiredBatches", "pharma.expiry_returns.manage" },
            { "pharma:writeOffExpiredBatches", "pharma.expiry_returns.manage" },
            { "pharma.writeOffExpiredBatches", "pharma.expiry_returns.manage" },
            { "pharma:getExpiredWriteOffs", "pharma.expiry_returns.manage" },
            { "pharma.getExpiredWriteOffs", "pharma.expiry_returns.manage" },
            { "pharma:downloadDrugReferenceTemplate", "pharma.drug_reference.import" },
            { "pharma.downloadDrugReferenceTemplate", "pharma.drug_reference.import" },
            { "pharma:previewDrugReferenceImport", "pharma.drug_reference.import" },
            { "pharma.previewDrugReferenceImport", "pharma.drug_reference.import" },
            { "pharma:confirmDrugReferenceImport", "pharma.drug_reference.import" },
            { "pharma.confirmDrugReferenceImport", "pharma.drug_reference.import" },
            { "pharma:checkDrugReference", "products.view" },
            { "pharma.checkDrugReference", "products.view" },
            { "pharma:searchDrugReference", "products.view" },
            { "pharma.searchDrugReference", "products.view" },
            { "pharma:clearDrugReference", REQUIRE_ADMIN },
            { "pharma.clearDrugReference", REQUIRE_ADMIN },

            // Purchases & Suppliers
            { "purchases:getAll", "purchases.view" },
            { "purchases:getById", "purchases.view" },
            { "purchases:getReturns", "purchases.view" },
            { "purchases:getReturnById", "purchases.view" },
            { "purchases:create", "purchases.create" },
            { "purchases:createReturn", "purchases.create" },
            { "suppliers:getAll", "suppliers.manage" },
            { "suppliers:getById", "suppliers.manage" },
            { "suppliers:save", "suppliers.manage" },
            { "suppliers:archive", "suppliers.manage" },
            { "suppliers:restore", "suppliers.manage" },
            { "suppliers:delete", "suppliers.manage" },
            { "suppliers:recordPayment", "suppliers.manage" },
            { "suppliers:cancelPayment", "suppliers.manage" },
            { "suppliers:recalculateBalance", REQUIRE_ADMIN },
            { "suppliers:verifyBalance", "suppliers.manage" },
            { "suppliers:checkDiscrepancies", REQUIRE_ADMIN },
            { "suppliers:getTransactions", "suppliers.manage" },

            // Customers & Excel
            { "customers:getAll", "customers.view" },
            { "customers:search", "customers.view" },
            { "customers:checkPhone", "customers.view" },
            { "customers:verifyBalance", "customers.view" },
            { "customers:getDetailedStatement", "customers.ledger" },
            { "customers:getStatement", "customers.ledger" },
            { "customers:save", "customers.create" },
            { "customers:archive", "customers.edit" },
            { "customers:recordPayment", "customers.payment" },
            { "customers:cancelPayment", "customers.payment_cancel" },
            { "customers:recalculateBalance", REQUIRE_ADMIN },
            { "excel:importCustomers", "customers.create" },
            { "excel:previewCustomerImport", "customers.create" },
            { "excel:getCustomerTemplate", "customers.create" },
            { "excel:getTemplate", "products.import" },
            { "excel:exportProducts", "products.export" },
            { "excel:exportCustomers", "products.export" },
            { "excel:exportFullStore", "products.export" },
            { "excel:browseExportFolder", "products.export" },
            { "excel:openExportFolder", "products.export" },

            // Reports & Closing
            { "closing:getPreview", "reports.daily_closing" },
            { "closing:save", "reports.daily_closing" },
            { "closing:getHistory", "reports.daily_closing" },
            { "reports:getClosingHistory", "reports.daily_closing" },
            { "closing:getById", "reports.daily_closing" },
            { "closing:checkPreviousDay", "reports.daily_closing" },
            { "closing:print", "reports.daily_closing" },
            { "reports:getTodaySummary", "reports.sales" },
            { "reports:getSalesReport", "reports.sales" },
            { "reports:getSalesTrends", "reports.sales" },
            { "reports:getPeriodSales", "reports.sales" },
            { "reports:getVatReport", "reports.sales" },
            { "reports:getCategoryPerformance", "reports.sales" },
            { "reports:getPeriodComparison", "reports.sales" },
            { "reports:getPaymentHistory", "reports.sales" },
            { "reports:getHourlyIntensity", "reports.sales" },
            { "reports:getDashboardAnalytics", "reports.sales" },
            { "reports:getProfitAndLoss", "reports.profit" },
            { "reports:getItemProfitability", "reports.profit" },
            { "reports:getInventoryLoss", "reports.profit" },
            { "reports:getShrinkageAnalysis", "reports.profit" },
            { "reports:getPurchaseAnalysis", "reports.profit" },
            { "reports:getLowStock", "reports.inventory" },
            { "reports:getInventoryOverview", "reports.inventory" },
            { "reports:getDeadStock", "reports.inventory" },
            { "reports:getDebtors", "reports.customers" },
            { "reports:getCreditOverview", "reports.customers" },
            { "reports:getDebtAging", "reports.customers" },
            { "reports:getCustomerBehavior", "reports.customers" },
            { "reports:getCashierSummary", "reports.cashier" },
            { "reports:getCashierPerformance", "reports.cashier" },
            { "reports:getDataQuality", REQUIRE_ADMIN },
            { "reports:repairDataQuality", REQUIRE_ADMIN },
            { "reports:runMilestone9Tests", REQUIRE_ADMIN },

            // Expenses
            { "expenses:getToday", "expenses.view" },
            { "expenses:getRecent", "expenses.view" },
            { "expenses:getCategories", "expenses.view" },
            { "expenses:create", "expenses.create" },
            { "expenses:createCategory", "expenses.create" },
            { "expenses:update", "expenses.edit" },
            { "expenses:cancel", "expenses.delete" },
            { "expenses:delete", "expenses.delete" },
            { "expenses:getBreakdown", "reports.profit" },

            // E-Pay
            { "epay:getTerminals", "epay.access" },
            { "epay:calculatePricing", "epay.access" },
            { "epay:createTransaction", "epay.transact" },
            { "epay:cancelTransaction", "epay.cancel" },
            { "epay:fundTerminal", "epay.fund" },
            { "epay:saveTerminal", "epay.terminals_manage" },
            { "epay:deleteTerminal", "epay.terminals_manage" },
            { "epay:adjustBalance", "epay.balance_adjust" },
            { "epay:getTransactions", "epay.history" },
            { "epay:getFundings", "epay.history" },
            { "epay:getAnalytics", "epay.analytics" },

            // Wallets & InstaPay
            { "wallets:getAccounts", "wallets.access" },
            { "wallets:processTransaction", "wallets.transact" },
            { "wallets:fundAccount", "wallets.fund" },
            { "wallets:saveAccount", "wallets.accounts_manage" },
            { "wallets:createAccount", "wallets.accounts_manage" },
            { "wallets:updateAccount", "wallets.accounts_manage" },
            { "wallets:deleteAccount", "wallets.accounts_manage" },
            { "wallets:adjustBalance", "wallets.balance_adjust" },
            { "wallets:cancelTransaction", "wallets.cancel" },
            { "wallets:getTransactions", "wallets.history" },
            { "wallets:getFundings", "wallets.history" },
            { "wallets:getAnalytics", "wallets.analytics" },

            // Shifts & Drawer
            { "shifts:getActive", "shifts.view" },
            { "shifts:open", "shifts.open" },
            { "shifts:close", "shifts.close" },
            { "shifts:getSummary", "shifts.view" },
            { "shifts:getHistory", "shifts.view" },
            { "shifts:getRecent", "shifts.view" },
            { "shifts:getMovements", "shifts.view" },
            { "shifts:cashIn", "shifts.cash_in" },
            { "shifts:cashOut", "shifts.cash_out" },
            { "shifts:getLiveBalance", "shifts.view" },
            { "drawer:cashIn", "shifts.cash_in" },
            { "drawer:cashOut", "shifts.cash_out" },
            { "drawer:getMovements", "shifts.view" },
            { "drawer:getLiveBalance", "shifts.view" },
            { "drawer:getBalance", "shifts.view" },
            { "drawer:openManual", "shifts.cash_in" },
            { "drawer:kick", "shifts.cash_in" },

            // Printing
            { "printer:getList", "settings.printer" },
            { "printer:list", "settings.printer" },
            { "printer:test", "settings.printer" },
            { "printer:testPrint", "settings.printer" },
            { "printer:printLabels", "settings.printer" },
            { "printer:testLabel", "settings.printer" },
            { "printer:printReceipt", "pos.reprint" },
            { "printer:kickDrawer", "shifts.cash_in" },
            { "printer:cutPaper", "settings.printer" },

            // Audit
            { "audit:list", "audit_log.view" },
            { "audit:getLogs", "audit_log.view" },
            { "audit:verifyChain", "audit_log.view" },
            { "audit:create", REQUIRE_ADMIN },
            { "auditLogs:create", REQUIRE_ADMIN },
            { "audit:resealChain", REQUIRE_ADMIN },

            // Settings & Backup & Migration & License
            { "settings:getAll", REQUIRE_ANY_SETTINGS },
            { "settings:save", REQUIRE_ANY_SETTINGS },
            { "settings:updateBatch", REQUIRE_ANY_SETTINGS },
            { "features:set", "settings.features" },
            { "backup:getStatus", "settings.backup" },
            { "backup:create", "settings.backup" },
            { "backup:getDrives", "settings.backup" },
            { "backup:configure", "settings.backup" },
            { "backup:verify", "settings.backup" },
            { "backup:getRecoveryStatus", REQUIRE_SESSION },
            { "backup:confirmRecoveryCode", REQUIRE_ADMIN },
            { "backup:revealRecoveryCode", REQUIRE_ADMIN },
            { "database:checkIntegrity", "settings.backup" },
            { "database:restore", "settings.restore" },
            { "migration:getMetrics", "settings.backup" },
            { "migration:export", "settings.backup" },
            { "migration:browseFolder", "settings.backup" },
            { "migration:inspect", "settings.restore" },
            { "migration:browseFile", "settings.restore" },
            { "migration:restore", "settings.restore" },
            { "license:activate", REQUIRE_ADMIN },
            { "license:activateSupportCode", REQUIRE_ADMIN },
            { "license:generateSupportCode", REQUIRE_ADMIN },
            { "license:deactivateForTransfer", "settings.license" },
            { "updates:check", REQUIRE_ADMIN },
            { "updates:browsePackage", REQUIRE_ADMIN },
            { "updates:inspectPackage", REQUIRE_ADMIN },
            { "updates:apply", REQUIRE_ADMIN },

            // Security & Users
            { "security:setPin", REQUIRE_ADMIN },
            { "security:disablePin", REQUIRE_ADMIN },
            { "security:enablePin", REQUIRE_ADMIN },
            { "security:saveProtectedActions", REQUIRE_ADMIN },
            { "security:setIdleTimeout", REQUIRE_ADMIN },
            { "security:getDeviceFingerprint", REQUIRE_ADMIN },
            { "users:getAll", "users.view" },
            { "users:getTree", "users.view" },
            { "users:create", "users.create" },
            { "users:createSubUser", "users.create" },
            { "users:update", REQUIRE_ADMIN },
            { "users:updatePermissions", "users.edit" },
            { "users:setDelegation", "users.delegate" },
            { "users:setPassword", "users.reset_pin" },
            { "users:changePin", REQUIRE_ADMIN },

            // Admin system & Test tools
            { "system:factoryReset", REQUIRE_ADMIN },
            { "support:createBundle", REQUIRE_ADMIN },
            { "templates:apply", REQUIRE_ADMIN },
            { "templates:seedProducts", REQUIRE_ADMIN },
            { "templates:resetFirstRun", REQUIRE_ADMIN },
            { "demo:getStatus", REQUIRE_ADMIN },
            { "demo:load", REQUIRE_ADMIN },
            { "demo:clear", REQUIRE_ADMIN },
            { "readiness:getStatus", REQUIRE_ADMIN },
            { "readiness:processTestSale", REQUIRE_ADMIN },
            { "db:testTransaction", REQUIRE_ADMIN },
            { "benchmark:run", REQUIRE_ADMIN },
            { "search:runBenchmark", REQUIRE_ADMIN },
            { "tests:runSalesCompletionTests", REQUIRE_ADMIN },
            { "security:runTests", REQUIRE_ADMIN },
            { "license:runTests", REQUIRE_ADMIN },
            { "migration:runTests", REQUIRE_ADMIN },
            { "updates:runTests", REQUIRE_ADMIN },
            { "inventory:runTests", REQUIRE_ADMIN },
            { "customers:runTests", REQUIRE_ADMIN },
            { "excel:runExportTests", REQUIRE_ADMIN },

            // Patient Profiles & Chronic Diseases (Story 133 / Feature #190)
            { "patients:getProfile", "patients.view" },
            { "patients:saveProfile", "patients.edit" },
            { "patients:getChronicMeds", "patients.view" },
            { "patients:saveChronicMed", "patients.edit" },
            { "patients:deleteChronicMed", "patients.edit" },
            { "patients:getDueAlerts", "patients.view" },
            { "patients:recordDispense", "patients.edit" },
            { "patients:checkAllergies", "patients.view" },
            { "patients:runTests", REQUIRE_ADMIN }
        };

        private static bool IsLicenseBlockedAction(string action)
        {
            if (string.IsNullOrEmpty(action)) return false;

            // Sales and draft operations
            if (action == "sales:create" || action == "sales:hold" || action == "sales:saveDraft" ||
                action == "sales:cancel" || action == "sales:quickSale")
                return true;

            // Returns operations
            if (action == "returns:create" || action == "returns:cancel")
                return true;

            // Purchases & Inventory mutations
            if (action == "purchases:create" || action == "purchases:saveDraft" ||
                action == "purchases:cancel" || action == "inventory:recordPurchase" ||
                action == "inventory:adjust" || action == "inventory:transfer")
                return true;

            // Expenses mutations
            if (action == "expenses:create" || action == "expenses:cancel" ||
                action == "expenses:update" || action == "expenses:createCategory")
                return true;

            // Financial & ledger mutations
            if (action == "customers:save" || action == "customers:recordPayment" || action == "customers:cancelPayment" ||
                action == "customers:archive" || action == "customers:recalculateBalance" ||
                action == "suppliers:save" || action == "suppliers:recordPayment" || action == "suppliers:archive" || action == "suppliers:delete" ||
                action == "epay:createTransaction" || action == "epay:fundTerminal" || action == "epay:saveTerminal" || action == "epay:adjustBalance" ||
                action == "wallets:processTransaction" || action == "wallets:fundAccount" || action == "wallets:saveAccount" || action == "wallets:adjustBalance" || action == "wallets:cancelTransaction" ||
                action == "closing:save" || action == "shifts:open" || action == "shifts:close" ||
                action == "shifts:cashIn" || action == "shifts:cashOut" || action == "drawer:cashIn" || action == "drawer:cashOut")
                return true;

            // Catalog modifications
            if (action == "products:save" || action == "products:delete" ||
                action == "products:bulkUpdateMinStock" || action == "products:applyBulkPriceAdjustment" ||
                action == "products:revertBulkPriceAdjustment" ||
                action == "products:importBatch" || action == "categories:save" || action == "categories:archive" ||
                action == "categories:reorder" || action == "productUnits:save" || action == "productUnits:delete" ||
                action == "productUnits:setBase" ||
                action == "locations:save" || action == "locations:delete" || action == "locations:assignProduct")
                return true;

            return false;
        }

        private static BridgeResponse AuthorizeRequest(BridgeRequest request)
        {
            // 1. Public actions: pre-login, window controls, and basic status checks
            if (PUBLIC_ACTIONS.Contains(request.Action))
            {
                return null;
            }

            // 2. Guided recovery: when database is corrupt nobody can log in, so restoring a backup must remain possible
            if (DatabaseService.IsCorrupted && (request.Action == "database:restore" || request.Action == "migration:restore" || request.Action == "migration:inspect" || request.Action == "migration:browseFile"))
            {
                return null;
            }

            // 3. Initial onboarding: when setting up the store before login, applying store template and saving initial settings is allowed ONLY when first run is needed
            if (DatabaseService.Templates != null && DatabaseService.Templates.IsFirstRunNeeded())
            {
                if (request.Action == "templates:apply" || request.Action == "settings:save")
                {
                    return null;
                }
            }

            // 4. Session authentication: all other actions strictly require an active user session
            UserDto sessionUser = SecurityService.CurrentUser;
            if (sessionUser == null || DatabaseService.Security == null)
            {
                return BridgeResponse.Fail(request.Id, "AUTH_REQUIRED", "يجب تسجيل الدخول أولاً لتنفيذ هذه العملية.");
            }

            // 5. Permission lookup (Default-Deny)
            string requiredPermission;
            if (!ACTION_PERMISSIONS.TryGetValue(request.Action, out requiredPermission))
            {
                Logger.Warn("SECURITY: Unknown or unmapped action blocked by default-deny: " + request.Action);
                return BridgeResponse.Fail(request.Id, "FORBIDDEN", "هذا الإجراء غير مصرح به أو غير مسجل في النظام.");
            }

            // 6. Action-specific RBAC evaluation
            bool allowed = false;
            if (requiredPermission == REQUIRE_SESSION)
            {
                allowed = true;
            }
            else if (requiredPermission == REQUIRE_ADMIN)
            {
                allowed = DatabaseService.Security.IsCurrentSessionAdmin();
            }
            else if (requiredPermission == REQUIRE_ANY_SETTINGS)
            {
                allowed = DatabaseService.Security.HasPermission(sessionUser.Id, "settings.store")
                    || DatabaseService.Security.HasPermission(sessionUser.Id, "settings.printer")
                    || DatabaseService.Security.HasPermission(sessionUser.Id, "settings.barcode");
            }
            else
            {
                allowed = DatabaseService.Security.HasPermission(sessionUser.Id, requiredPermission);
            }

            if (!allowed)
            {
                Logger.Warn(string.Format("رفض تنفيذ إجراء غير مصرح: {0} للمستخدم {1}", request.Action, sessionUser.Username));
                return BridgeResponse.Fail(request.Id, "FORBIDDEN", "ليس لديك صلاحية لتنفيذ هذه العملية. يرجى التواصل مع مدير المحل.");
            }
            return null;
        }

        private static BridgeResponse CheckFeatureGate(BridgeRequest request)
        {
            if (request == null || string.IsNullOrEmpty(request.Action)) return null;

            string featureKey = FeatureRegistry.GetFeatureForCommand(request.Action);
            if (string.IsNullOrEmpty(featureKey))
            {
                return null;
            }

            // Historical and read-only reporting commands are exempted from feature gate
            if (FeatureRegistry.IsHistoricalOrReadCommand(request.Action))
            {
                return null;
            }

            bool isEnabled = DatabaseService.Settings != null && DatabaseService.Settings.IsFeatureEnabled(featureKey);
            if (!isEnabled)
            {
                FeatureDefinition def = FeatureRegistry.GetDefinition(featureKey);
                string featName = def != null ? def.NameAr : featureKey;
                Logger.Warn(string.Format("FEATURE_GATE: تم حظر الإجراء '{0}' لأن الميزة '{1}' غير مفعّلة في هذا المحل.", request.Action, featName));
                return BridgeResponse.Fail(
                    request.Id,
                    "FEATURE_DISABLED",
                    string.Format("ميزة «{0}» غير مفعّلة في هذا المحل.", featName)
                );
            }

            return null;
        }
    }
}
