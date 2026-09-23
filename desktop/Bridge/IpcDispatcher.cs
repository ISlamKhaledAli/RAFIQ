using System;
using Newtonsoft.Json.Linq;
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

            try
            {
                switch (request.Action)
                {
                    case "system:getInfo":
                        string osDetails = Environment.OSVersion.VersionString + (Environment.Is64BitOperatingSystem ? " (64-bit)" : " (32-bit)");
                        return BridgeResponse.Ok(request.Id, new
                        {
                            appName = "رفيق نقاط البيع (Rafiq POS)",
                            version = "1.0.0-Spike",
                            osVersion = osDetails,
                            isWebView2 = true,
                            dbStatus = DatabaseService.GetStatus()
                        });

                    case "system:ping":
                        return BridgeResponse.Ok(request.Id, new { timestamp = DateTime.UtcNow.ToString("o") });

                    case "db:testTransaction":
                        int count = 10;
                        if (request.Payload is JObject)
                        {
                            JObject jObj = (JObject)request.Payload;
                            if (jObj["count"] != null)
                            {
                                count = jObj["count"].Value<int>();
                            }
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

                    default:
                        return BridgeResponse.Fail(request.Id, "ACTION_NOT_FOUND", "الإجراء غير مسجل في النواة: " + request.Action);
                }
            }
            catch (Exception ex)
            {
                return BridgeResponse.Fail(request.Id, "INTERNAL_ERROR", ex.Message);
            }
        }
    }
}
