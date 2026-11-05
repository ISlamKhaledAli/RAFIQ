using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using RafiqPOS.Bridge;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    /// <summary>
    /// الإجراءات الخاصة بصاحب المحل (REQUIRE_OWNER) ترفضها بوابة IPC للمديرين والكاشيرية، ويمر منها المالك وحساب المطور فقط.
    /// الترخيص والاسترجاع صارا قابلين للتفويض (settings.license / settings.restore): يُرفضان لأي مدير بلا منحة صريحة
    /// وللكاشير دائماً، وتغطية المنح نفسها في S50.
    /// الإجراءات المدمرة (إعادة ضبط المصنع، الاسترجاع، الترخيص) لا تُرسَل إلا لرفضها قبل الوصول للمعالج،
    /// وبعد التحقق أن لا قاعدة بيانات حقيقية محمّلة في DatabaseService.
    /// </summary>
    [TestFixture]
    [NonParallelizable]
    public class S46_OwnerOnlyActionsTest : S44_UserHierarchyFixtureBase
    {
        // Never delegable: mapped to REQUIRE_OWNER whatever the manager's stored permissions say
        private static readonly string[] OwnerOnlyActions = new string[]
        {
            "system:factoryReset",
            "backup:revealRecoveryCode",
            "backup:confirmRecoveryCode",
            "security:setPin",
            "security:disablePin",
            "security:enablePin",
            "security:saveProtectedActions"
        };

        // Owner-grade but delegable: mapped to a permission key that only the owner/root hold unless the owner grants it to a manager
        private static readonly string[] DelegableOwnerActions = new string[]
        {
            "license:activate",
            "license:activateSupportCode",
            "license:generateSupportCode",
            "license:deactivateForTransfer",
            "database:restore",
            "migration:restore",
            "migration:inspect"
        };

        // These handlers act on the store itself; a broken gate must never reach them against a real data folder
        private static void AssertNoRealStoreIsLoaded()
        {
            string conn = DatabaseService.ConnectionString;
            bool safe = string.IsNullOrEmpty(conn) || conn.IndexOf(Path.GetTempPath(), StringComparison.OrdinalIgnoreCase) >= 0;
            Assert.IsTrue(safe, "رفض تنفيذ اختبار إجراءات مدمرة لأن DatabaseService يشير لقاعدة غير مؤقتة: " + conn);
        }

        [Test]
        public void OwnerOnlyActions_AreForbiddenForManagersAndCashiers_WithoutReachingTheHandler()
        {
            AssertNoRealStoreIsLoaded();
            var manager = CreateManager("mgr_oo1", ManagerPin);
            var cashier = CreateCashierBy(OwnerId, "cash_oo1");
            long usersBefore = Scalar("SELECT COUNT(*) FROM users;");
            string pinHashBefore = UserRepo.GetById(OwnerId).PinCodeHash;

            string[] sessions = new string[] { manager.Id, cashier.Id };
            for (int s = 0; s < sessions.Length; s++)
            {
                LoginAs(sessions[s]);
                for (int i = 0; i < OwnerOnlyActions.Length; i++)
                {
                    var res = Dispatch(OwnerOnlyActions[i], null);
                    Assert.IsFalse(res.Success, OwnerOnlyActions[i] + " يجب أن يُرفض لـ " + sessions[s]);
                    Assert.AreEqual("FORBIDDEN", ErrorCode(res), OwnerOnlyActions[i] + ": " + Describe(res));
                }
                // The manager here holds no owner grant, and a cashier can never hold one
                for (int i = 0; i < DelegableOwnerActions.Length; i++)
                {
                    var res = Dispatch(DelegableOwnerActions[i], null);
                    Assert.IsFalse(res.Success, DelegableOwnerActions[i] + " يجب أن يُرفض لـ " + sessions[s]);
                    Assert.AreEqual("FORBIDDEN", ErrorCode(res), DelegableOwnerActions[i] + ": " + Describe(res));
                }
            }

            Assert.AreEqual(usersBefore, Scalar("SELECT COUNT(*) FROM users;"), "لم تُعاد تهيئة الموظفين");
            Assert.AreEqual(pinHashBefore, UserRepo.GetById(OwnerId).PinCodeHash, "رقم المالك لم يتغير");
            Assert.AreEqual("0", SettingsRepo.Get("owner_recovery_code_confirmed", "0"), "المدير لا يؤكد حفظ كود الاسترجاع");
            Assert.IsNotNull(UserRepo.GetById(manager.Id));
            Assert.IsTrue(UserRepo.GetById(manager.Id).IsActive);
        }

        [Test]
        public void RestoreScreenAction_IsDeniedToManagers_WithoutAnOwnerGrantOfSettingsRestore()
        {
            var manager = CreateManager("mgr_oo2", ManagerPin);

            LoginAs(manager.Id);
            var res = Dispatch("migration:browseFile", null);
            Assert.IsFalse(res.Success);
            Assert.AreEqual("FORBIDDEN", ErrorCode(res), "settings.restore مغلقة للمدير بلا منحة: " + Describe(res));
        }

        [Test]
        public void OwnerAndDeveloperRoot_PassTheOwnerGate_OnASafeAction()
        {
            // backup:confirmRecoveryCode only flips a flag, so it proves the gate lets the owner through without side effects on the store
            LoginAs(OwnerId);
            var ownerRes = Dispatch("backup:confirmRecoveryCode", null);
            Assert.IsTrue(ownerRes.Success, Describe(ownerRes));
            Assert.AreEqual("1", SettingsRepo.Get("owner_recovery_code_confirmed", "0"));

            SettingsRepo.Set("owner_recovery_code_confirmed", "0");
            LoginAs(RootId);
            var rootRes = Dispatch("backup:confirmRecoveryCode", null);
            Assert.IsTrue(rootRes.Success, Describe(rootRes));
            Assert.AreEqual("1", SettingsRepo.Get("owner_recovery_code_confirmed", "0"));
        }

        [Test]
        public void OwnerOnlyActions_AreMappedToTheOwnerMarkerInThePermissionTable()
        {
            // Direct check of the table: a refactor that downgrades one entry to REQUIRE_ADMIN would let managers through
            FieldInfo table = typeof(IpcDispatcher).GetField("ACTION_PERMISSIONS", BindingFlags.NonPublic | BindingFlags.Static);
            FieldInfo marker = typeof(IpcDispatcher).GetField("REQUIRE_OWNER", BindingFlags.NonPublic | BindingFlags.Static);
            Assert.IsNotNull(table, "جدول الصلاحيات غير موجود");
            Assert.IsNotNull(marker, "علامة REQUIRE_OWNER غير موجودة");

            var actions = (Dictionary<string, string>)table.GetValue(null);
            string ownerMarker = (string)marker.GetRawConstantValue();
            for (int i = 0; i < OwnerOnlyActions.Length; i++)
            {
                Assert.IsTrue(actions.ContainsKey(OwnerOnlyActions[i]), "غير مسجل: " + OwnerOnlyActions[i]);
                Assert.AreEqual(ownerMarker, actions[OwnerOnlyActions[i]], OwnerOnlyActions[i] + " يجب أن يكون لصاحب المحل فقط");
            }
            for (int i = 0; i < DelegableOwnerActions.Length; i++)
            {
                Assert.IsTrue(actions.ContainsKey(DelegableOwnerActions[i]), "غير مسجل: " + DelegableOwnerActions[i]);
                Assert.IsTrue(SecurityService.IsOwnerOnlyPermission(actions[DelegableOwnerActions[i]]),
                    DelegableOwnerActions[i] + " يجب أن يرتبط بمفتاح صلاحية خاص بالمالك قابل للتفويض: " + actions[DelegableOwnerActions[i]]);
            }

            Assert.AreEqual("users.deactivate", actions["users:delete"], "حذف الموظف يمر بصلاحية التعطيل");
            Assert.AreNotEqual(ownerMarker, actions["users:getAll"], "قائمة الموظفين ليست حكراً على المالك");
        }

        [Test]
        public void IsCurrentSessionOwner_IsTrueOnlyForOwnerAndRoot()
        {
            var manager = CreateManager("mgr_oo3", ManagerPin);

            Logout();
            Assert.IsFalse(SecurityService.IsCurrentSessionOwner(), "بلا جلسة");
            LoginAs(OwnerId);
            Assert.IsTrue(SecurityService.IsCurrentSessionOwner());
            LoginAs(RootId);
            Assert.IsTrue(SecurityService.IsCurrentSessionOwner(), "المطور يملك صلاحيات المالك");
            LoginAs(manager.Id);
            Assert.IsFalse(SecurityService.IsCurrentSessionOwner(), "المدير ليس مالكاً");
            Assert.IsTrue(SecurityService.IsCurrentSessionAdmin(), "لكنه يبقى admin لإجراءات الإدارة العادية");
            LoginAs(SeedCashierId);
            Assert.IsFalse(SecurityService.IsCurrentSessionOwner());
        }

        [Test]
        public void RecoveryStatus_ReturnsTheCodeOnlyToOwnerAndRoot()
        {
            var manager = CreateManager("mgr_oo4", ManagerPin);

            LoginAs(manager.Id);
            var managerRes = Dispatch("backup:getRecoveryStatus", null);
            Assert.IsTrue(managerRes.Success, "الطلب نفسه مسموح لأي جلسة: " + Describe(managerRes));
            JObject managerData = JObject.FromObject(managerRes.Data);
            Assert.IsNull(managerData["recoveryCode"], "المدير لا يستلم كود استرجاع المالك");
            Assert.IsNull(managerData["hasRecoveryCode"], "ولا حتى وجوده");

            LoginAs(OwnerId);
            JObject ownerData = JObject.FromObject(Dispatch("backup:getRecoveryStatus", null).Data);
            Assert.IsFalse(string.IsNullOrEmpty((string)ownerData["recoveryCode"]), "المالك يستلم الكود قبل تأكيد حفظه");

            LoginAs(RootId);
            JObject rootData = JObject.FromObject(Dispatch("backup:getRecoveryStatus", null).Data);
            Assert.IsFalse(string.IsNullOrEmpty((string)rootData["recoveryCode"]), "والمطور كذلك");
        }

        [Test]
        public void OwnerRecoveryCode_OpensOnlyTheOwnerAccount_NeverAManager()
        {
            CreateManager("mgr_oo5", ManagerPin);
            LoginAs(OwnerId);
            var initial = SecurityService.SetPin("7419", null, null);
            Assert.IsTrue(initial.Success, "شرط مسبق: توليد كود الاسترجاع");
            Assert.IsFalse(string.IsNullOrEmpty(initial.RecoveryCode));
            Logout();

            Assert.IsFalse(SecurityService.Login("mgr_oo5", initial.RecoveryCode).Success, "كود استرجاع المالك لا يفتح حساب مدير");
            Assert.IsTrue(SecurityService.Login("admin", initial.RecoveryCode).Success, "بينما يفتح حساب المالك");
        }
    }
}
