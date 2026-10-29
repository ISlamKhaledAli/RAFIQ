using System;
using NUnit.Framework;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    [TestFixture]
    public class S9_PinBruteForceTest : TestBase
    {
        [Test]
        public void Scenario_S9_Pin_Brute_Force_Rate_Limiting_And_Backdoor_Deactivation()
        {
            // 1. Arrange: إنشاء مشرف رسمي وتعيين PIN
            SeedDefaultUsers();
            var admin = UserRepo.GetByUsername("admin");
            Assert.IsNotNull(admin, "حساب مدير النظام الافتراضي موجود");

            string realPin = "7418";
            SecurityService.ChangeUserPin(admin.Id, realPin);

            // 2. محاكاة هجوم تخمين PIN متتابع (Brute Force):
            // إرسال محاولات خاطئة متتالية
            int failedCount = 0;
            for (int i = 0; i < 6; i++)
            {
                var check = SecurityService.VerifySupervisorPin("000" + i, "discount_override");
                if (!check.Success)
                {
                    failedCount++;
                }
            }

            Assert.AreEqual(6, failedCount, "جميع محاولات التخمين الخاطئة يجب أن تفشل");

            // بعد محاولات خاطئة متكررة، المحاولة بالـ PIN الصحيح يجب أن تُرفض مؤقتاً بسبب قفل الحماية (Lockout Active)
            var lockedOutCheck = SecurityService.VerifySupervisorPin(realPin, "discount_override");
            Assert.IsFalse(lockedOutCheck.Success, "يجب تفعيل قفل الحماية ضد التخمين ورفض التحقق مؤقتاً");
            Assert.IsTrue(lockedOutCheck.IsLocked, "خاصية IsLocked يجب أن تكون مفعّلة");

            // 3. اختبار حماية حساب المطور islam ضد كلمات المرور الثابتة (Dynamic OTP Only)
            var devUser = UserRepo.GetByUsername("islam");
            if (devUser != null)
            {
                Assert.IsTrue(devUser.IsActive, "المستخدم islam نشط كـ Root");
                Assert.AreEqual("root", devUser.Role, "المستخدم islam يجب أن يحمل رتبة root");
                Assert.IsTrue(string.IsNullOrEmpty(devUser.PinCodeHash), "حساب islam يجب ألا يحتوي على أي PIN ثابت");
            }

            var authAttempt = SecurityService.Login("islam", "islam123");
            Assert.IsFalse(authAttempt.Success, "تسجيل الدخول بكلمة سر ثابتة عشوائية يجب أن يُرفض قطعياً");

            var oldStaticAttempt = SecurityService.Login("islam", "8963906");
            Assert.IsFalse(oldStaticAttempt.Success, "تسجيل الدخول بالرقم الثابت القديم 8963906 يجب أن يُرفض قطعياً لأنه تم إلغاء الكلمات الثابتة");

            // 4. اختبار قبول رمز Root الديناميكي للمحل ورمز المطور الماستر العام (Master Universal Root OTP)
            long currentHour = (long)(DateTime.UtcNow - new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc)).TotalSeconds / 3600;
            string universalOtp = RafiqPOS.Common.RootOtpHelper.GenerateOtp(RafiqPOS.Common.RootOtpHelper.UNIVERSAL_MASTER_HWID, currentHour);
            var universalLogin = SecurityService.Login("islam", universalOtp);
            Assert.IsTrue(universalLogin.Success, "تسجيل الدخول برمز المطور الماستر العام (Universal Master Root OTP) يجب أن ينجح");
            Assert.AreEqual("root", universalLogin.User.Role, "المستخدم يجب أن يدخل برتبة root");
        }
    }
}
