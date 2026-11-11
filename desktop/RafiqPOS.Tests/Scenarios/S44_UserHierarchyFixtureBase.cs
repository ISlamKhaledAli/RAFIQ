using System;
using RafiqPOS.Data;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using RafiqPOS.Bridge;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    /// <summary>
    /// قاعدة اختبارات هرم الموظفين (مطور root > صاحب المحل > مدير > كاشير): قاعدة بيانات معزولة بكل الهجرات،
    /// جلسة المستخدم تُحاكى بنفس طريقة S12 (SetCurrentUserForTesting)، وطلبات IPC تمر على البوابة الحقيقية.
    /// </summary>
    public abstract class S44_UserHierarchyFixtureBase : TestBase
    {
        protected const string OwnerId = "usr_admin_default";
        protected const string RootId = "usr_root_developer";
        protected const string SeedCashierId = "usr_cashier_1";

        // None of these is weak (see SecurityService.IsWeakPin) and each identity has its own value
        protected const string OwnerPin = "7418";
        protected const string ManagerPin = "5829";
        protected const string SecondManagerPin = "6394";
        protected const string StaffPin = "8142";

        [SetUp]
        public void UserHierarchySetUp()
        {
            DatabaseService.Settings = new SettingsService(SettingsRepo, AuditRepo);
            DatabaseService.Backup = BackupService;
            DatabaseService.Sales = SaleService;
            SecurityService.SetCurrentUserForTesting(null);
            // The factory owner PIN forces a change; the IPC gate refuses everything else until it is replaced
            SecurityService.ChangeUserPin(OwnerId, OwnerPin);
        }

        [TearDown]
        public override void BaseTearDown()
        {
            SecurityService.SetCurrentUserForTesting(null);
            DatabaseService.Settings = null;
            DatabaseService.Backup = null;
            DatabaseService.Sales = null;
            base.BaseTearDown();
        }

        protected void LoginAs(string userId)
        {
            var user = UserRepo.GetById(userId);
            Assert.IsNotNull(user, "المستخدم غير موجود: " + userId);
            SecurityService.SetCurrentUserForTesting(SecurityService.MapToDto(user));
        }

        protected void Logout()
        {
            SecurityService.SetCurrentUserForTesting(null);
        }

        // The owner creates a manager (role admin that is not the owner) and the session is closed again
        protected UserDto CreateManager(string username, string pin)
        {
            LoginAs(OwnerId);
            var created = SecurityService.CreateSubUser(null, username, "مدير " + username, null, pin, "admin", null, false, 0);
            Logout();
            return created;
        }

        // A plain cashier created by the given admin account (owner or manager); the creator becomes the parent
        protected UserDto CreateCashierBy(string creatorId, string username)
        {
            LoginAs(creatorId);
            var created = SecurityService.CreateSubUser(null, username, "كاشير " + username, null, StaffPin, "cashier", null, false, 0);
            Logout();
            return created;
        }

        protected BridgeResponse Dispatch(string action, object payload)
        {
            return IpcDispatcher.Dispatch(new BridgeRequest
            {
                Id = Guid.NewGuid().ToString("N"),
                Action = action,
                Payload = payload != null ? JObject.FromObject(payload) : null
            });
        }

        // Owner-immutability guards throw InvalidOperationException while tier guards throw UnauthorizedAccessException;
        // both are a refusal, and what matters is that nothing was changed
        protected static void AssertDenied(TestDelegate action, string message)
        {
            try
            {
                action();
            }
            catch (UnauthorizedAccessException)
            {
                return;
            }
            catch (InvalidOperationException)
            {
                return;
            }
            Assert.Fail("العملية كان يجب أن تُرفض: " + message);
        }

        protected static string ErrorCode(BridgeResponse res)
        {
            return res != null && res.Error != null ? res.Error.Code : null;
        }

        protected static string Describe(BridgeResponse res)
        {
            return res != null && res.Error != null ? res.Error.Code + ": " + res.Error.Message : "";
        }

        protected long Scalar(string sql, params object[] nameValuePairs)
        {
            using (var conn = new SQLiteConnection(ConnectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    for (int i = 0; i + 1 < nameValuePairs.Length; i += 2)
                    {
                        cmd.Parameters.AddWithValue((string)nameValuePairs[i], nameValuePairs[i + 1]);
                    }
                    object val = cmd.ExecuteScalar();
                    return val == null || val == DBNull.Value ? 0 : Convert.ToInt64(val);
                }
            }
        }

        protected string ScalarText(string sql, params object[] nameValuePairs)
        {
            using (var conn = new SQLiteConnection(ConnectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    for (int i = 0; i + 1 < nameValuePairs.Length; i += 2)
                    {
                        cmd.Parameters.AddWithValue((string)nameValuePairs[i], nameValuePairs[i + 1]);
                    }
                    object val = cmd.ExecuteScalar();
                    return val == null || val == DBNull.Value ? null : val.ToString();
                }
            }
        }

        protected void Execute(string sql, params object[] nameValuePairs)
        {
            using (var conn = new SQLiteConnection(ConnectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    for (int i = 0; i + 1 < nameValuePairs.Length; i += 2)
                    {
                        cmd.Parameters.AddWithValue((string)nameValuePairs[i], nameValuePairs[i + 1]);
                    }
                    cmd.ExecuteNonQuery();
                }
            }
        }

        protected long CountAudit(string action)
        {
            return Scalar("SELECT COUNT(*) FROM audit_logs WHERE action = @a;", "@a", action);
        }

        // What a fresh application start would see: NormalizeAdminRoles runs in the constructor
        protected SecurityService RestartSecurityService()
        {
            return new SecurityService(SettingsRepo, AuditRepo, UserRepo);
        }
    }
}
