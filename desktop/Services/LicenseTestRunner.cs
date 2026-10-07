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
        public bool TrialLifecyclePassed { get; set; }
        public bool LicenseTransferPassed { get; set; }
        public bool OfflineSupportActivationPassed { get; set; }
        public int TotalAssertions { get; set; }
        public int PassedAssertions { get; set; }
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
                CheckExpiryContractPassed = false,
                TrialLifecyclePassed = false,
                LicenseTransferPassed = false,
                OfflineSupportActivationPassed = false,
                TotalAssertions = 0,
                PassedAssertions = 0
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
            string origRel = settingsRepo.Get("transfer_release_code", "");

            try
            {
                // ==========================================
                // TEST 1: Expiration Detection (Task 171-1, 171-5)
                // ==========================================
                result.TotalAssertions++;
                settingsRepo.Set("license_key", "RFQ-TEST-EXPIRED-KEY");
                settingsRepo.Set("license_token", "test_token_signature_sample");
                settingsRepo.Set("license_status", "active");
                settingsRepo.Set("license_type", "annual");
                settingsRepo.Set("license_expires_at", DateTime.UtcNow.AddDays(-2).ToString("yyyy-MM-dd HH:mm:ss"));
                settingsRepo.Set("last_known_utc", DateTime.UtcNow.AddDays(-3).ToString("o"));

                var expiredInfo = DatabaseService.License.GetLicenseInfo();
                if (expiredInfo.IsActive || !expiredInfo.IsExpired || expiredInfo.Status != "expired")
                {
                    result.Message = "فشل اختبار كشف انتهاء الترخيص: لم يتم تحويل الحالة إلى expired و IsActive=false";
                    return result;
                }
                result.ExpiryDetectionPassed = true;
                result.PassedAssertions++;

                // ==========================================
                // TEST 2: Anti-Clock Tampering (Task 171-2, 171-5)
                // ==========================================
                result.TotalAssertions++;
                settingsRepo.Set("license_expires_at", DateTime.UtcNow.AddDays(30).ToString("yyyy-MM-dd HH:mm:ss"));
                settingsRepo.Set("last_known_utc", DateTime.UtcNow.AddMinutes(30).ToString("o"));

                var tamperedInfo = DatabaseService.License.GetLicenseInfo();
                if (tamperedInfo.IsActive || !tamperedInfo.ClockTampered)
                {
                    result.Message = "فشل اختبار حماية التلاعب بالساعة: لم يتم كشف تراجع ساعة الجهاز";
                    return result;
                }
                result.ClockTamperPassed = true;
                result.PassedAssertions++;

                // ==========================================
                // TEST 3: Backend Sale Blocking (Task 173-2, 173-4)
                // ==========================================
                result.TotalAssertions++;
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
                result.PassedAssertions++;

                // ==========================================
                // TEST 4: Read Whitelist while expired (Task 173-3, 173-4)
                // ==========================================
                result.TotalAssertions++;
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
                result.PassedAssertions++;

                // ==========================================
                // TEST 5: CheckExpiry IPC Contract (Task 171-3)
                // ==========================================
                result.TotalAssertions++;
                var chkExpiry = DatabaseService.License.CheckExpiry();
                if (chkExpiry == null || string.IsNullOrEmpty(chkExpiry.Status))
                {
                    result.Message = "فشل اختبار دالة CheckExpiry: لم يتم إرجاع نتيجة صالحة";
                    return result;
                }
                result.CheckExpiryContractPassed = true;
                result.PassedAssertions++;

                // ==========================================
                // TEST 6: Trial Lifecycle (Story 97 / Feature #151)
                // ==========================================
                result.TotalAssertions++;
                settingsRepo.Set("license_key", "");
                settingsRepo.Set("license_token", "");
                settingsRepo.Set("license_status", "");
                settingsRepo.Set("license_type", "");
                settingsRepo.Set("license_expires_at", "");
                settingsRepo.Set("last_known_utc", DateTime.UtcNow.ToString("o"));

                var initialInfo = DatabaseService.License.GetLicenseInfo();
                if (initialInfo.IsActive || initialInfo.Status != "unlicensed")
                {
                    result.Message = "فشل التحقق من أن النسخة غير المفعلة تبدأ بحالة unlicensed";
                    return result;
                }

                // Simulate authorized trial granted from server or support code (7 days)
                settingsRepo.Set("license_key", "RFQ-TR-TEST-1234");
                settingsRepo.Set("license_status", "trial");
                settingsRepo.Set("license_type", "trial");
                settingsRepo.Set("license_expires_at", DateTime.UtcNow.AddDays(7).ToString("yyyy-MM-dd HH:mm:ss"));

                var trialInfo = DatabaseService.License.GetLicenseInfo();
                if (!trialInfo.IsActive || trialInfo.Status != "trial" || trialInfo.DaysRemaining < 5)
                {
                    result.Message = "فشل اختبار تشغيل الفترة التجريبية المعتمدة";
                    return result;
                }

                // Simulate trial expired
                settingsRepo.Set("license_expires_at", DateTime.UtcNow.AddDays(-1).ToString("yyyy-MM-dd HH:mm:ss"));
                var expiredTrialInfo = DatabaseService.License.GetLicenseInfo();
                if (expiredTrialInfo.IsActive || expiredTrialInfo.Status != "expired")
                {
                    result.Message = "فشل اختبار انتهاء الفترة التجريبية";
                    return result;
                }
                result.TrialLifecyclePassed = true;
                result.PassedAssertions++;

                // ==========================================
                // TEST 7: Offline Support Activation (Story 98 / Task 150-1)
                // ==========================================
                result.TotalAssertions++;
                string myFp = EncryptionService.GenerateDeviceFingerprint();
                string validSupportCode = LicenseService.GenerateOfflineSupportCode(myFp, "lifetime", 9999);
                if (string.IsNullOrEmpty(validSupportCode) || !validSupportCode.StartsWith("RFQ-SUP-L"))
                {
                    result.Message = "فشل توليد كود الدعم الفني أوفلاين";
                    return result;
                }

                var actSupRes = DatabaseService.License.ActivateWithSupportCode(validSupportCode, "سوبرماركت البركة");
                if (!actSupRes.Success || !actSupRes.License.IsActive || actSupRes.License.LicenseType != "lifetime")
                {
                    result.Message = "فشل التفعيل بكود الدعم الفني: " + actSupRes.Message;
                    return result;
                }

                // Verify ActivateLicense automatically detects RFQ-SUP- and activates offline without internet
                var actLicViaSup = DatabaseService.License.ActivateLicense(validSupportCode);
                if (!actLicViaSup.Success || !actLicViaSup.License.IsActive)
                {
                    result.Message = "فشل التفعيل التلقائي لكود الدعم عبر دالة ActivateLicense الرئيسية: " + actLicViaSup.Message;
                    return result;
                }

                // Verify mismatching fingerprint is rejected
                string fakeFp = "RAFIQ-DEV-FAKEMACHINE-000011112222";
                string foreignCode = LicenseService.GenerateOfflineSupportCode(fakeFp, "lifetime", 9999);
                var rejectRes = DatabaseService.License.ActivateWithSupportCode(foreignCode, "محل مزور");
                if (rejectRes.Success || rejectRes.Code != "DEVICE_MISMATCH")
                {
                    result.Message = "فشل حماية عدم تطابق بصمة الجهاز لكود الدعم";
                    return result;
                }

                // Verify consumed trial code cannot be reused to reset trial
                string trialSupCode = LicenseService.GenerateOfflineSupportCode(myFp, "trial", 7);
                var actTrial1 = DatabaseService.License.ActivateWithSupportCode(trialSupCode, "سوبرماركت البركة");
                if (!actTrial1.Success || actTrial1.License.LicenseType != "trial")
                {
                    result.Message = "فشل التفعيل الأول لكود التجربة أوفلاين";
                    return result;
                }
                var actTrialAgain = DatabaseService.License.ActivateWithSupportCode(trialSupCode, "سوبرماركت البركة");
                if (actTrialAgain.Success || actTrialAgain.Code != "CODE_ALREADY_USED")
                {
                    result.Message = "فشل منع إعادة استخدام نفس كود التجربة المستهلك";
                    return result;
                }

                result.OfflineSupportActivationPassed = true;
                result.PassedAssertions++;

                // ==========================================
                // TEST 8: License Transfer & Deactivation (Story 98 / Task 150-1 & 150-2)
                // ==========================================
                result.TotalAssertions++;
                var deactRes = DatabaseService.License.DeactivateForTransfer("نقل لجهاز كاشير جديد");
                if (!deactRes.Success || string.IsNullOrEmpty(deactRes.ReleaseCode) || !deactRes.ReleaseCode.StartsWith("RFQ-REL-"))
                {
                    result.Message = "فشل إلغاء التفعيل وتوليد كود إثبات التحويل";
                    return result;
                }

                // Ensure old device is now deactivated and sales are blocked
                var transferredInfo = DatabaseService.License.GetLicenseInfo();
                if (transferredInfo.IsActive || transferredInfo.Status != "transferred")
                {
                    result.Message = "فشل تحديث حالة الجهاز القديم إلى transferred بعد إلغاء التفعيل";
                    return result;
                }

                var blockedSaleOnOld = IpcDispatcher.Dispatch(fakeSaleRequest);
                if (blockedSaleOnOld.Success || blockedSaleOnOld.Error == null || blockedSaleOnOld.Error.Code != "LICENSE_EXPIRED")
                {
                    result.Message = "فشل منع البيع على الجهاز القديم بعد نقل الترخيص";
                    return result;
                }
                result.LicenseTransferPassed = true;
                result.PassedAssertions++;

                result.Success = true;
                result.Message = string.Format("نجحت جميع اختبارات الترخيص والفترة التجريبية والنقل وكود الدعم بنسبة 100% ({0}/{1} تأكيداً)!", result.PassedAssertions, result.TotalAssertions);
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
                settingsRepo.Set("transfer_release_code", origRel);
            }
        }
    }
}
