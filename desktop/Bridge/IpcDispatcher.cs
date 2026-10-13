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

            // License check runs first so an expired/invalid license is always reported as such (Task 173-2)
            if (DatabaseService.License != null && DatabaseService.License.IsLicenseExpired() && (
                request.Action == "sales:create" ||
                request.Action == "sales:hold"))
            {
                return BridgeResponse.Fail(
                    request.Id,
                    "LICENSE_EXPIRED",
                    "انتهت فترة اشتراك البرنامج أو تم إيقافه. يرجى تجديد الترخيص لاستكمال عمليات البيع."
                );
            }

            // Central server-side authorization gate (Audit F-01 / F-03 / AGENTS Rule 8)
            BridgeResponse authFailure = AuthorizeRequest(request);
            if (authFailure != null)
            {
                return authFailure;
            }

            // Lock write operations immediately if database is corrupt (Task 124-1)
            if (DatabaseService.IsCorrupted && (
                request.Action == "returns:create" ||
                request.Action == "customers:cancelPayment" ||
                request.Action == "customers:recalculateBalance" ||
                request.Action == "customers:archive" ||
                request.Action == "expenses:create" ||
                request.Action == "epay:createTransaction" ||
                request.Action == "epay:fundTerminal" ||
                request.Action == "epay:saveTerminal" ||
                request.Action == "closing:save" ||
                request.Action == "system:factoryReset" ||
                request.Action == "settings:save" ||
                request.Action == "settings:updateBatch" ||
                request.Action == "inventory:recordPurchase" ||
                request.Action == "productUnits:save" ||
                request.Action == "productUnits:delete" ||
                request.Action == "productUnits:setBase" ||
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
                request.Action == "variants:createMatrix"))
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
        // Store, printer and barcode-scanner screens all persist through the generic settings actions
        private const string REQUIRE_ANY_SETTINGS = "__any_settings__";

        // Sensitive actions -> required permission key (server-side RBAC, Audit F-01).
        // Read-only and pre-login actions (login, first-run wizard, license screen) are intentionally not listed.
        private static readonly Dictionary<string, string> ACTION_PERMISSIONS = new Dictionary<string, string>
        {
            { "sales:create", "pos.sell" },
            { "sales:hold", "pos.hold_invoice" },
            { "sales:cancel", "invoices.cancel" },
            { "returns:create", "returns.create" },

            { "products:save", "products.edit" },
            { "products:delete", "products.archive" },
            { "products:bulkUpdateMinStock", "products.edit" },
            { "products:importBatch", "products.import" },
            { "products:applyBulkPriceAdjustment", "products.edit_price" },
            { "products:assignInternalBarcode", "products.edit" },
            { "products:bulkGenerateInternalBarcodes", "products.edit" },
            { "productUnits:save", "products.edit" },
            { "productUnits:delete", "products.edit" },
            { "productUnits:setBase", "products.edit" },
            { "variants:createMatrix", "products.edit" },
            { "categories:save", "categories.manage" },
            { "categories:archive", "categories.manage" },
            { "categories:reorder", "categories.manage" },
            { "quickItems:save", "products.edit" },
            { "quickItems:delete", "products.edit" },
            { "quickItems:reorder", "products.edit" },
            { "quickItems:deleteCategory", "products.edit" },
            { "quickItems:renameCategory", "products.edit" },

            { "inventory:adjustStock", "stock.adjust" },
            { "inventory:recalculate", "stock.adjust" },
            { "inventory:recordPurchase", "purchases.create" },
            { "batch:save", "stock.adjust" },
            { "batch:adjust", "stock.adjust" },
            { "batch:disposeExpired", "stock.adjust" },
            { "purchases:create", "purchases.create" },
            { "suppliers:save", "suppliers.manage" },
            { "suppliers:archive", "suppliers.manage" },
            { "suppliers:restore", "suppliers.manage" },
            { "suppliers:delete", "suppliers.manage" },
            { "suppliers:recordPayment", "suppliers.manage" },
            { "suppliers:recalculateBalance", REQUIRE_ADMIN },

            { "customers:save", "customers.create" },
            { "customers:archive", "customers.edit" },
            { "customers:recordPayment", "customers.payment" },
            { "customers:cancelPayment", "customers.payment_cancel" },
            { "customers:recalculateBalance", REQUIRE_ADMIN },
            { "excel:importCustomers", "customers.create" },
            { "excel:exportProducts", "products.export" },
            { "excel:exportCustomers", "products.export" },
            { "excel:exportFullStore", "products.export" },

            { "closing:getPreview", "reports.daily_closing" },
            { "closing:save", "reports.daily_closing" },
            { "reports:getTodaySummary", "reports.sales" },
            { "reports:getSalesReport", "reports.sales" },
            { "reports:getSalesTrends", "reports.sales" },
            { "reports:getProfitAndLoss", "reports.profit" },
            { "reports:getItemProfitability", "reports.profit" },
            { "reports:getCashierSummary", "reports.cashier" },
            { "reports:getDashboardAnalytics", "reports.sales" },
            { "expenses:create", "expenses.create" },
            { "epay:createTransaction", "epay.transact" },
            { "epay:fundTerminal", "epay.fund" },
            { "epay:saveTerminal", "epay.terminals_manage" },
            { "audit:list", "audit_log.view" },
            { "audit:getLogs", "audit_log.view" },
            { "audit:resealChain", REQUIRE_ADMIN },

            { "settings:save", REQUIRE_ANY_SETTINGS },
            { "settings:updateBatch", REQUIRE_ANY_SETTINGS },
            { "features:set", "settings.features" },
            { "backup:create", "settings.backup" },
            { "backup:configure", "settings.backup" },
            { "database:restore", "settings.restore" },
            { "migration:restore", "settings.restore" },
            { "migration:export", "settings.backup" },
            { "license:deactivateForTransfer", "settings.license" },
            { "updates:apply", REQUIRE_ADMIN },

            { "users:createSubUser", "users.create" },
            { "users:update", REQUIRE_ADMIN },
            { "users:updatePermissions", "users.edit" },
            { "users:setDelegation", "users.delegate" },
            { "users:changePin", REQUIRE_ADMIN },
            { "security:setIdleTimeout", REQUIRE_ADMIN },

            { "system:factoryReset", REQUIRE_ADMIN },
            { "templates:seedProducts", REQUIRE_ADMIN },
            { "templates:resetFirstRun", REQUIRE_ADMIN },
            { "demo:load", REQUIRE_ADMIN },
            { "demo:clear", REQUIRE_ADMIN },
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
            { "excel:runExportTests", REQUIRE_ADMIN }
        };

        private static BridgeResponse AuthorizeRequest(BridgeRequest request)
        {
            string requiredPermission;
            if (!ACTION_PERMISSIONS.TryGetValue(request.Action, out requiredPermission))
            {
                return null;
            }

            // Guided recovery: when the database is corrupt nobody can log in, so restoring a backup must remain possible.
            if (DatabaseService.IsCorrupted && (request.Action == "database:restore" || request.Action == "migration:restore"))
            {
                return null;
            }

            UserDto sessionUser = SecurityService.CurrentUser;
            if (sessionUser == null || DatabaseService.Security == null)
            {
                return BridgeResponse.Fail(request.Id, "AUTH_REQUIRED", "يجب تسجيل الدخول أولاً لتنفيذ هذه العملية.");
            }

            bool allowed;
            if (requiredPermission == REQUIRE_ADMIN)
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
    }
}
