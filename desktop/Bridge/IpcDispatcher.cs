using System;
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
                BridgeResponse response;
                if (TryDispatchProducts(request, out response)) return response;
                if (TryDispatchSales(request, out response)) return response;
                if (TryDispatchCustomers(request, out response)) return response;
                if (TryDispatchSuppliers(request, out response)) return response;
                if (TryDispatchPurchases(request, out response)) return response;
                if (TryDispatchInventory(request, out response)) return response;
                if (TryDispatchSystem(request, out response)) return response;

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
        }
    }
}
