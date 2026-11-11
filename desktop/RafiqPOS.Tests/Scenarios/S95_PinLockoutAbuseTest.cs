using System;
using NUnit.Framework;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    /// <summary>
    /// منع إساءة استخدام قفل الرقم السري: حساب المالك/المدير لا يُقفل بالفشل أبداً (تأخير تصاعدي بحد 60 ثانية فقط)،
    /// وكود استرجاع المالك لا يتعطل بالقفل، وعداد اعتماد المشرف يتلاشى ويُقيَّد بخمس دقائق، وحماية الكاشير باقية.
    /// </summary>
    [TestFixture]
    [NonParallelizable]
    public class S95_PinLockoutAbuseTest : S44_UserHierarchyFixtureBase
    {
        private DateTime LockoutUntil(string userId)
        {
            string text = UserRepo.GetById(userId).LockoutUntil;
            Assert.IsFalse(string.IsNullOrEmpty(text), "يوجد تأخير مسجل");
            return DateTime.Parse(text, System.Globalization.CultureInfo.InvariantCulture,
                System.Globalization.DateTimeStyles.AdjustToUniversal | System.Globalization.DateTimeStyles.AssumeUniversal);
        }

        [Test]
        public void AdminLoginDelay_IsExponentialAndCappedAtSixtySeconds()
        {
            Assert.AreEqual(0, SecurityService.AdminLoginDelaySeconds(0));
            Assert.AreEqual(0, SecurityService.AdminLoginDelaySeconds(1));
            Assert.AreEqual(0, SecurityService.AdminLoginDelaySeconds(2));
            Assert.AreEqual(2, SecurityService.AdminLoginDelaySeconds(3));
            Assert.AreEqual(4, SecurityService.AdminLoginDelaySeconds(4));
            Assert.AreEqual(8, SecurityService.AdminLoginDelaySeconds(5));
            Assert.AreEqual(16, SecurityService.AdminLoginDelaySeconds(6));
            Assert.AreEqual(32, SecurityService.AdminLoginDelaySeconds(7));
            Assert.AreEqual(60, SecurityService.AdminLoginDelaySeconds(8));
            Assert.AreEqual(60, SecurityService.AdminLoginDelaySeconds(50));
            Assert.AreEqual(60, SecurityService.AdminLoginDelaySeconds(int.MaxValue));
        }

        [Test]
        public void OwnerAndRoot_RiseToFiveMinutesAfterFifteenFailures_ManagersStayAtOneMinute()
        {
            Assert.AreEqual(60, SecurityService.AdminLoginDelaySeconds(14, true));
            Assert.AreEqual(300, SecurityService.AdminLoginDelaySeconds(15, true));
            Assert.AreEqual(300, SecurityService.AdminLoginDelaySeconds(500, true));
            Assert.AreEqual(60, SecurityService.AdminLoginDelaySeconds(15, false));
            Assert.AreEqual(60, SecurityService.AdminLoginDelaySeconds(500, false));
            Assert.AreEqual(8, SecurityService.AdminLoginDelaySeconds(5, true), "الجزء التصاعدي لم يتغير");
        }

        [Test]
        public void ParallelWrongLogins_CannotOutrunTheCashierLockout()
        {
            CreateCashierBy(OwnerId, "cash_par");
            System.Threading.Tasks.Parallel.For(0, 24, delegate(int i)
            {
                SecurityService.Login("cash_par", "000" + (i % 10));
            });

            Assert.AreEqual(5, UserRepo.GetByUsername("cash_par").FailedAttempts, "العداد يتوقف عند 5 ثم يرفض القفل بقية المحاولات");
        }

        [Test]
        public void ParallelWrongSupervisorPins_CannotOutrunTheSharedThrottle()
        {
            System.Threading.Tasks.Parallel.For(0, 24, delegate(int i)
            {
                SecurityService.VerifySupervisorPin("000" + (i % 10), "TEST");
            });

            Assert.AreEqual("3", SettingsRepo.Get("security_supervisor_failed_attempts", "0"), "بعد 3 فشل يبدأ القفل وبقية المحاولات تُرفض قبل العد");
        }

        [Test]
        public void WrongRecoveryCodes_AreThrottled_ThenTheRealCodeWorksAfterTheShortWait()
        {
            LoginAs(OwnerId);
            var initial = SecurityService.SetPin("7419", null, null);
            Assert.IsTrue(initial.Success, initial.Message);
            Logout();

            for (int i = 0; i < 5; i++)
            {
                Assert.IsFalse(SecurityService.Login("admin", "RFK-AAAA-BBBB-" + i).Success);
            }

            var throttled = SecurityService.Login("admin", initial.RecoveryCode);
            Assert.IsFalse(throttled.Success, "بعد 5 أكواد خاطئة خلال 5 دقائق يوجد انتظار قصير");
            Assert.IsTrue(throttled.IsLocked);
            Assert.LessOrEqual(throttled.RemainingLockoutSeconds, 60);

            SettingsRepo.Set("security_login_recovery_lockout_until", "");
            Assert.IsTrue(SecurityService.Login("admin", initial.RecoveryCode).Success, "الكود الصحيح يعمل بعد انتهاء الانتظار");
        }

        [Test]
        public void WrongRecoveryCodeAuditRows_AreCappedAtTenPerHour()
        {
            for (int i = 0; i < 25; i++)
            {
                SettingsRepo.Set("security_login_recovery_lockout_until", "");
                SecurityService.Login("admin", "RFK-AAAA-BBBB-" + i);
            }

            Assert.AreEqual(10L, CountAudit("RECOVERY_CODE_FAILED"));
        }

        [Test]
        public void AdminChangingOwnPassword_MustProveTheCurrentCredential()
        {
            LoginAs(OwnerId);
            Assert.Throws<UnauthorizedAccessException>(delegate { SecurityService.SetUserPassword(OwnerId, "newpass12", null); });
            Assert.Throws<UnauthorizedAccessException>(delegate { SecurityService.SetUserPassword(OwnerId, "newpass12", "0000"); });
            Assert.IsFalse(SecurityService.VerifyUserPassword(OwnerId, "newpass12"));

            // The failed attempts only delay the account; clear the short delay as time would
            Execute("UPDATE users SET lockout_until = NULL WHERE id = @id;", "@id", OwnerId);
            SecurityService.SetUserPassword(OwnerId, "newpass12", OwnerPin);
            Assert.IsTrue(SecurityService.VerifyUserPassword(OwnerId, "newpass12"));
        }

        [Test]
        public void ManagerChangingOwnPassword_MustProveTheCurrentCredential()
        {
            var manager = CreateManager("mgr_pwd", ManagerPin);
            LoginAs(manager.Id);
            Assert.Throws<UnauthorizedAccessException>(delegate { SecurityService.SetUserPassword(manager.Id, "mgrnew123", null); });
            SecurityService.SetUserPassword(manager.Id, "mgrnew123", ManagerPin);
            Assert.IsTrue(SecurityService.VerifyUserPassword(manager.Id, "mgrnew123"));
        }

        [Test]
        public void SupervisorLockout_IsCappedAtFiveMinutes()
        {
            Assert.AreEqual(0, SecurityService.SupervisorLockoutSeconds(2));
            Assert.AreEqual(30, SecurityService.SupervisorLockoutSeconds(3));
            Assert.AreEqual(300, SecurityService.SupervisorLockoutSeconds(5));
            Assert.AreEqual(300, SecurityService.SupervisorLockoutSeconds(10));
            Assert.AreEqual(300, SecurityService.SupervisorLockoutSeconds(20));
            Assert.AreEqual(300, SecurityService.SupervisorLockoutSeconds(1000));
        }

        [Test]
        public void SpammingWrongPins_NeverHardLocksTheOwner_AndTheDelayStaysUnderAMinute()
        {
            for (int i = 0; i < 30; i++)
            {
                SecurityService.Login("admin", "000" + (i % 10));
            }

            double seconds = (LockoutUntil(OwnerId) - DateTime.UtcNow).TotalSeconds;
            Assert.LessOrEqual(seconds, 61.0, "تأخير المالك لا يتجاوز دقيقة");

            // Once the short delay has passed the owner signs in with the real PIN
            Execute("UPDATE users SET lockout_until = NULL WHERE id = @id;", "@id", OwnerId);
            var login = SecurityService.Login("admin", OwnerPin);
            Assert.IsTrue(login.Success, login.Message);
        }

        [Test]
        public void OwnerRecoveryCode_IsNeverBlockedByTheLoginDelay()
        {
            LoginAs(OwnerId);
            var initial = SecurityService.SetPin("7419", null, null);
            Assert.IsTrue(initial.Success, initial.Message);
            Logout();

            for (int i = 0; i < 12; i++)
            {
                SecurityService.Login("admin", "000" + (i % 10));
            }
            // Make the delay deterministic regardless of machine speed
            Execute("UPDATE users SET lockout_until = @u WHERE id = @id;", "@u", DateTime.UtcNow.AddSeconds(60).ToString("o"), "@id", OwnerId);
            Assert.IsFalse(string.IsNullOrEmpty(UserRepo.GetById(OwnerId).LockoutUntil), "المالك عليه تأخير");
            Assert.IsFalse(SecurityService.Login("admin", "7419").Success, "الرقم الصحيح ينتظر انتهاء التأخير القصير");

            var recovery = SecurityService.Login("admin", initial.RecoveryCode);
            Assert.IsTrue(recovery.Success, "كود الاسترجاع لا يتعطل بالتأخير: " + recovery.Message);
        }

        [Test]
        public void WrongRecoveryCodes_DoNotAddToTheOwnersPinDelay()
        {
            LoginAs(OwnerId);
            var initial = SecurityService.SetPin("7419", null, null);
            Assert.IsTrue(initial.Success, initial.Message);
            Logout();

            for (int i = 0; i < 10; i++)
            {
                var res = SecurityService.Login("admin", "RFK-AAAA-BBBB-" + i);
                Assert.IsFalse(res.Success);
            }

            Assert.AreEqual(0, UserRepo.GetById(OwnerId).FailedAttempts, "أكواد الاسترجاع الخاطئة لا تزيد عداد الرقم السري");
            Assert.IsTrue(SecurityService.Login("admin", "7419").Success, "المالك يدخل بالرقم الصحيح فوراً");
        }

        [Test]
        public void CashierAccounts_StillHardLockAfterFiveFailures()
        {
            var cashier = CreateCashierBy(OwnerId, "cash_lock");
            for (int i = 0; i < 5; i++)
            {
                Assert.IsFalse(SecurityService.Login("cash_lock", "000" + i).Success);
            }

            var locked = SecurityService.Login("cash_lock", StaffPin);
            Assert.IsFalse(locked.Success, "الكاشير مقفل حتى بالرقم الصحيح");
            Assert.IsTrue(locked.IsLocked);
            Assert.Greater(locked.RemainingLockoutSeconds, 0);
            Assert.IsNotNull(cashier);
        }

        [Test]
        public void OwnerApprovals_AreNotBlockedByLoginFailuresOfTheOwnerAccount()
        {
            for (int i = 0; i < 4; i++)
            {
                SecurityService.Login("admin", "000" + i);
            }
            Assert.IsFalse(string.IsNullOrEmpty(UserRepo.GetById(OwnerId).LockoutUntil), "المالك عليه تأخير دخول");

            var approval = SecurityService.VerifySupervisorPin(OwnerPin, "TEST");
            Assert.IsTrue(approval.Success, approval.Message);
        }

        [Test]
        public void SupervisorFailures_DecayAfterFifteenMinutesWithoutFailures()
        {
            for (int i = 0; i < 3; i++)
            {
                SecurityService.VerifySupervisorPin("000" + i, "TEST");
            }
            Assert.IsTrue(SecurityService.VerifySupervisorPin(OwnerPin, "TEST").IsLocked, "القفل فعّال بعد 3 فشل");

            // Time passes: the lock has expired and the last failure is older than 15 minutes
            SettingsRepo.Set("security_supervisor_lockout_until", "");
            SettingsRepo.Set("security_supervisor_last_failure_at", DateTime.UtcNow.AddMinutes(-20).ToString("o"));

            var next = SecurityService.VerifySupervisorPin("0009", "TEST");
            Assert.IsFalse(next.Success);
            Assert.IsFalse(next.IsLocked, "العداد بدأ من الصفر فلا قفل");
            Assert.AreEqual(1, next.FailedAttempts);
            Assert.IsTrue(SecurityService.VerifySupervisorPin(OwnerPin, "TEST").Success, "المالك يعتمد بعد تلاشي العداد");
        }

        [Test]
        public void SupervisorFailures_WithinFifteenMinutes_KeepAccumulating()
        {
            for (int i = 0; i < 3; i++)
            {
                SecurityService.VerifySupervisorPin("000" + i, "TEST");
            }
            SettingsRepo.Set("security_supervisor_lockout_until", "");
            SettingsRepo.Set("security_supervisor_last_failure_at", DateTime.UtcNow.AddMinutes(-5).ToString("o"));

            var next = SecurityService.VerifySupervisorPin("0009", "TEST");
            Assert.IsFalse(next.Success);
            Assert.AreEqual(4, next.FailedAttempts, "فشل حديث لا يتلاشى");
        }
    }
}
