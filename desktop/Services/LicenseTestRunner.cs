using System;
using Newtonsoft.Json.Linq;
using RafiqPOS.Bridge;
using RafiqPOS.Common;
using RafiqPOS.Models;
using RafiqPOS.Repositories;

namespace RafiqPOS.Services
{
    public class LicenseTestResult
    {
        public bool Success { get; set; }
        public string Message { get; set; }
        public bool ExpiryDetectionPassed { get; set; }
        public bool ClockTamperPassed { get; set; }
        public bool SaleBlockingPassed { get; set; }
        public bool ReadWhitelistPassed { get; set; }
        public bool CheckExpiryContractPassed { get; set; }
    }

    public static class LicenseTestRunner
    {
        public static LicenseTestResult RunAllTests()
        {
            var result = new LicenseTestResult
            {
                Success = false,
                ExpiryDetectionPassed = false,
                ClockTamperPassed = false,
                SaleBlockingPassed = false,
                ReadWhitelistPassed = false,
                CheckExpiryContractPassed = false
            };

            var settingsRepo = DatabaseService.SettingsRepo;
            if (settingsRepo == null || DatabaseService.License == null)
            {
                result.Message = "خدمات النظام وقاعدة البيانات غير مهيأة لإجراء الاختبارات";
                return result;
            }

            // Backup existing settings to restore afterwards
            string origKey = settingsRepo.Get("license_key", "");
            string origToken = settingsRepo.Get("license_token", "");
            string origStatus = settingsRepo.Get("license_status", "");
            string origType = settingsRepo.Get("license_type", "lifetime");
            string origExpires = settingsRepo.Get("license_expires_at", "");
            string origLastKnown = settingsRepo.Get("last_known_utc", "");

            try
            {
                // ==========================================
                // TEST 1: Expiration Detection (Task 171-1, 171-5)
                // ==========================================
                settingsRepo.Set("license_key", "RFQ-TEST-EXPIRED-KEY");
                settingsRepo.Set("license_token", "test_token_signature_sample");
                settingsRepo.Set("license_status", "active");
                settingsRepo.Set("license_type", "trial");
                settingsRepo.Set("license_expires_at", DateTime.UtcNow.AddDays(-2).ToString("yyyy-MM-dd HH:mm:ss"));
                settingsRepo.Set("last_known_utc", DateTime.UtcNow.AddDays(-3).ToString("o"));

                var expiredInfo = DatabaseService.License.GetLicenseInfo();
                if (expiredInfo.IsActive || !expiredInfo.IsExpired || expiredInfo.Status != "expired")
                {
                    result.Message = "فشل اختبار كشف انتهاء الترخيص: لم يتم تحويل الحالة إلى expired و IsActive=false";
                    return result;
                }
                result.ExpiryDetectionPassed = true;

                // ==========================================
                // TEST 2: Anti-Clock Tampering (Task 171-2, 171-5)
                // ==========================================
                // Simulate future timestamp in last_known_utc (clock turned backwards by 30 mins)
                settingsRepo.Set("license_expires_at", DateTime.UtcNow.AddDays(30).ToString("yyyy-MM-dd HH:mm:ss"));
                settingsRepo.Set("last_known_utc", DateTime.UtcNow.AddMinutes(30).ToString("o"));

                var tamperedInfo = DatabaseService.License.GetLicenseInfo();
                if (tamperedInfo.IsActive || !tamperedInfo.ClockTampered)
                {
                    result.Message = "فشل اختبار حماية التلاعب بالساعة: لم يتم كشف تراجع ساعة الجهاز";
                    return result;
                }
                result.ClockTamperPassed = true;

                // ==========================================
                // TEST 3: Backend Sale Blocking (Task 173-2, 173-4)
                // ==========================================
                // With license expired, sales:create must be blocked with LICENSE_EXPIRED
                settingsRepo.Set("last_known_utc", DateTime.UtcNow.AddDays(-1).ToString("o"));
                settingsRepo.Set("license_expires_at", DateTime.UtcNow.AddDays(-1).ToString("yyyy-MM-dd HH:mm:ss"));

                var fakeSaleRequest = new BridgeRequest
                {
                    Id = "test_sale_req_1",
                    Action = "sales:create",
                    Payload = JObject.FromObject(new
                    {
                        items = new object[] { },
                        paymentMethod = "cash",
                        cashReceivedPiasters = 1000
                    })
                };

                var blockResponse = IpcDispatcher.Dispatch(fakeSaleRequest);
                if (blockResponse.Success || blockResponse.Error == null || blockResponse.Error.Code != "LICENSE_EXPIRED")
                {
                    result.Message = "فشل اختبار منع عمليات البيع: النواة سمحت بعملية البيع أو لم ترجع كود LICENSE_EXPIRED";
                    return result;
                }
                result.SaleBlockingPassed = true;

                // ==========================================
                // TEST 4: Read Whitelist while expired (Task 173-3, 173-4)
                // ==========================================
                var readRequest = new BridgeRequest
                {
                    Id = "test_read_req_1",
                    Action = "reports:getTodaySummary",
                    Payload = null
                };
                var readResponse = IpcDispatcher.Dispatch(readRequest);
                if (!readResponse.Success)
                {
                    result.Message = "فشل اختبار القائمة البيضاء: تم حجب تقارير اليومية أثناء انتهاء الترخيص";
                    return result;
                }

                var licInfoRequest = new BridgeRequest
                {
                    Id = "test_lic_info_req_1",
                    Action = "license:getInfo",
                    Payload = null
                };
                var licInfoResponse = IpcDispatcher.Dispatch(licInfoRequest);
                if (!licInfoResponse.Success)
                {
                    result.Message = "فشل اختبار القائمة البيضاء: تم حجب قراءة معلومات الترخيص أثناء انتهائه";
                    return result;
                }
                result.ReadWhitelistPassed = true;

                // ==========================================
                // TEST 5: CheckExpiry IPC Contract (Task 171-3)
                // ==========================================
                var chkExpiry = DatabaseService.License.CheckExpiry();
                if (chkExpiry == null || string.IsNullOrEmpty(chkExpiry.Status))
                {
                    result.Message = "فشل اختبار دالة CheckExpiry: لم يتم إرجاع نتيجة صالحة";
                    return result;
                }
                result.CheckExpiryContractPassed = true;

                result.Success = true;
                result.Message = "نجحت جميع اختبارات التحقق من انتهاء الترخيص وحماية الساعة ومنع البيع بنسبة 100%!";
                return result;
            }
            catch (Exception ex)
            {
                result.Message = "خطأ أثناء تنفيذ الاختبارات: " + ex.Message;
                return result;
            }
            finally
            {
                // Restore original settings
                settingsRepo.Set("license_key", origKey);
                settingsRepo.Set("license_token", origToken);
                settingsRepo.Set("license_status", origStatus);
                settingsRepo.Set("license_type", origType);
                settingsRepo.Set("license_expires_at", origExpires);
                settingsRepo.Set("last_known_utc", origLastKnown);
            }
        }
    }
}
