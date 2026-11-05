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
    /// الصلاحيات الخاصة بالمالك القابلة للتفويض (system.updates / settings.restore / settings.license):
    /// المالك والمطور يملكونها دائماً، والمدير لا يملكها إلا بمنحة صريحة من المالك، والكاشير لا يملكها أبداً.
    /// الإجراءات التي تُنفَّذ فعلاً (تحديث، ترخيص، استرجاع) لا تُرسَل للمعالج في حالة السماح:
    /// يُختبر قرار البوابة AuthorizeRequest مباشرة (null = مسموح)، والرفض فقط يمر عبر Dispatch الحقيقي.
    /// </summary>
    [TestFixture]
    [NonParallelizable]
    public class S50_OwnerGradeDelegationTest : S44_UserHierarchyFixtureBase
    {
        private const string KeyUpdates = "system.updates";
        private const string KeyRestore = "settings.restore";
        private const string KeyLicense = "settings.license";

        private static readonly string[] UpdatesActions = new string[] { "updates:check" };

        private static readonly string[] LicenseActions = new string[]
        {
            "license:activate", "license:activateSupportCode", "license:generateSupportCode", "license:deactivateForTransfer"
        };

        private static readonly string[] RestoreActions = new string[]
        {
            "database:restore", "migration:restore", "migration:inspect", "migration:browseFile"
        };

        // Remain REQUIRE_OWNER: no grant can ever open them for a manager
        private static readonly string[] NeverDelegableActions = new string[]
        {
            "system:factoryReset", "backup:revealRecoveryCode", "backup:confirmRecoveryCode",
            "security:setPin", "security:disablePin", "security:enablePin", "security:saveProtectedActions"
        };

        private static string[] AllDelegableActions()
        {
            var all = new List<string>();
            all.AddRange(UpdatesActions);
            all.AddRange(LicenseActions);
            all.AddRange(RestoreActions);
            return all.ToArray();
        }

        private static string[] ActionsFor(string key)
        {
            if (key == KeyUpdates) return UpdatesActions;
            if (key == KeyLicense) return LicenseActions;
            return RestoreActions;
        }

        // ---------- helpers ----------

        // These handlers act on the store itself; a broken gate must never reach them against a real data folder
        private static void AssertNoRealStoreIsLoaded()
        {
            string conn = DatabaseService.ConnectionString;
            bool safe = string.IsNullOrEmpty(conn) || conn.IndexOf(Path.GetTempPath(), StringComparison.OrdinalIgnoreCase) >= 0;
            Assert.IsTrue(safe, "رفض تنفيذ اختبار إجراءات مدمرة لأن DatabaseService يشير لقاعدة غير مؤقتة: " + conn);
        }

        // The authorization gate only: null means "allowed past authorization", anything else is the refusal response
        private static BridgeResponse Authorize(string action)
        {
            MethodInfo method = typeof(IpcDispatcher).GetMethod("AuthorizeRequest", BindingFlags.NonPublic | BindingFlags.Static);
            Assert.IsNotNull(method, "بوابة التفويض AuthorizeRequest غير موجودة");
            var request = new BridgeRequest { Id = Guid.NewGuid().ToString("N"), Action = action, Payload = null };
            return (BridgeResponse)method.Invoke(null, new object[] { request });
        }

        private static void AssertGateForbids(string[] actions, string who)
        {
            for (int i = 0; i < actions.Length; i++)
            {
                BridgeResponse res = Authorize(actions[i]);
                Assert.IsNotNull(res, actions[i] + " يجب أن تُرفض لـ " + who);
                Assert.IsFalse(res.Success, actions[i] + " لـ " + who);
                Assert.AreEqual("FORBIDDEN", ErrorCode(res), actions[i] + " لـ " + who + ": " + Describe(res));
            }
        }

        private static void AssertGateAllows(string[] actions, string who)
        {
            for (int i = 0; i < actions.Length; i++)
            {
                BridgeResponse res = Authorize(actions[i]);
                Assert.IsNull(res, actions[i] + " يجب أن تمر من البوابة لـ " + who + ": " + Describe(res));
            }
        }

        private static Dictionary<string, bool> Keys(params string[] trueKeys)
        {
            var map = new Dictionary<string, bool>();
            for (int i = 0; i < trueKeys.Length; i++) map[trueKeys[i]] = true;
            return map;
        }

        // The owner (or the given actor) grants exactly these owner-grade keys to a manager; the session is closed afterwards
        private void Grant(string managerId, params string[] keys)
        {
            LoginAs(OwnerId);
            SecurityService.UpdateUserPermissions(managerId, Keys(keys));
            Logout();
        }

        private JObject StoredPermissions(string userId)
        {
            string json = ScalarText("SELECT permissions_json FROM users WHERE id = @id;", "@id", userId);
            return string.IsNullOrEmpty(json) ? new JObject() : JObject.Parse(json);
        }

        private void SetStoredPermissionsJson(string userId, string json)
        {
            Execute("UPDATE users SET permissions_json = @p WHERE id = @id;", "@p", json, "@id", userId);
        }

        // ---------- permission table ----------

        [Test]
        public void DelegableKeys_AreExactlyTheThreeOwnerGradeKeys_AndMapToTheirActions()
        {
            CollectionAssert.AreEquivalent(new string[] { KeyUpdates, KeyRestore, KeyLicense }, SecurityService.DELEGABLE_OWNER_PERMISSIONS);
            Assert.IsTrue(SecurityService.IsOwnerOnlyPermission(KeyUpdates));
            Assert.IsTrue(SecurityService.IsOwnerOnlyPermission(KeyRestore));
            Assert.IsTrue(SecurityService.IsOwnerOnlyPermission(KeyLicense));
            Assert.IsFalse(SecurityService.IsOwnerOnlyPermission("settings.backup"));
            Assert.IsFalse(SecurityService.IsOwnerOnlyPermission("users.edit"));

            FieldInfo table = typeof(IpcDispatcher).GetField("ACTION_PERMISSIONS", BindingFlags.NonPublic | BindingFlags.Static);
            FieldInfo marker = typeof(IpcDispatcher).GetField("REQUIRE_OWNER", BindingFlags.NonPublic | BindingFlags.Static);
            Assert.IsNotNull(table);
            Assert.IsNotNull(marker);
            var actions = (Dictionary<string, string>)table.GetValue(null);
            string ownerMarker = (string)marker.GetRawConstantValue();

            string[] keys = new string[] { KeyUpdates, KeyRestore, KeyLicense };
            for (int k = 0; k < keys.Length; k++)
            {
                string[] mapped = ActionsFor(keys[k]);
                for (int i = 0; i < mapped.Length; i++)
                {
                    Assert.IsTrue(actions.ContainsKey(mapped[i]), "غير مسجل: " + mapped[i]);
                    Assert.AreEqual(keys[k], actions[mapped[i]], mapped[i]);
                }
            }
            for (int i = 0; i < NeverDelegableActions.Length; i++)
            {
                Assert.IsTrue(actions.ContainsKey(NeverDelegableActions[i]), "غير مسجل: " + NeverDelegableActions[i]);
                Assert.AreEqual(ownerMarker, actions[NeverDelegableActions[i]], NeverDelegableActions[i] + " يبقى لصاحب المحل فقط");
            }
        }

        // ---------- manager without a grant ----------

        [Test]
        public void ManagerWithoutGrant_IsForbiddenOnUpdatesLicenseAndRestore_ThroughTheRealDispatcher()
        {
            AssertNoRealStoreIsLoaded();
            var manager = CreateManager("mgr_og1", ManagerPin);
            long usersBefore = Scalar("SELECT COUNT(*) FROM users;");

            LoginAs(manager.Id);
            string[] all = AllDelegableActions();
            for (int i = 0; i < all.Length; i++)
            {
                var res = Dispatch(all[i], null);
                Assert.IsFalse(res.Success, all[i]);
                Assert.AreEqual("FORBIDDEN", ErrorCode(res), all[i] + ": " + Describe(res));
            }
            // The refusal is also visible at the gate level and by permission lookup
            AssertGateForbids(all, "مدير بلا منحة");
            Assert.IsFalse(SecurityService.HasPermission(manager.Id, KeyUpdates));
            Assert.IsFalse(SecurityService.HasPermission(manager.Id, KeyRestore));
            Assert.IsFalse(SecurityService.HasPermission(manager.Id, KeyLicense));
            Assert.AreEqual(usersBefore, Scalar("SELECT COUNT(*) FROM users;"), "لم يصل أي معالج للمتجر");
        }

        [Test]
        public void ManagerKeepsEveryOtherDailyPower_WithoutAnyGrant()
        {
            var manager = CreateManager("mgr_og2", ManagerPin);
            Assert.IsTrue(SecurityService.HasPermission(manager.Id, "users.create"));
            Assert.IsTrue(SecurityService.HasPermission(manager.Id, "users.edit"));
            Assert.IsTrue(SecurityService.HasPermission(manager.Id, "settings.backup"));
            Assert.IsTrue(SecurityService.HasPermission(manager.Id, "reports.profit"));
        }

        // ---------- grant ----------

        [Test]
        public void EachGrantOpensOnlyItsOwnActions()
        {
            string[] keys = new string[] { KeyUpdates, KeyRestore, KeyLicense };
            for (int k = 0; k < keys.Length; k++)
            {
                var manager = CreateManager("mgr_og3_" + k, ManagerPin);
                Grant(manager.Id, keys[k]);
                LoginAs(manager.Id);

                for (int other = 0; other < keys.Length; other++)
                {
                    if (other == k) AssertGateAllows(ActionsFor(keys[other]), "مدير منحته " + keys[k]);
                    else AssertGateForbids(ActionsFor(keys[other]), "مدير لم يُمنح " + keys[other]);
                    Assert.AreEqual(other == k, SecurityService.HasPermission(manager.Id, keys[other]), keys[other] + " بعد منح " + keys[k]);
                }
                Logout();
            }
        }

        [Test]
        public void AllThreeGrants_OpenEveryDelegableAction_ButNeverTheOwnerOnlyOnes()
        {
            AssertNoRealStoreIsLoaded();
            var manager = CreateManager("mgr_og4", ManagerPin);
            Grant(manager.Id, KeyUpdates, KeyRestore, KeyLicense);
            long usersBefore = Scalar("SELECT COUNT(*) FROM users;");

            LoginAs(manager.Id);
            AssertGateAllows(AllDelegableActions(), "مدير بكل المنح");

            for (int i = 0; i < NeverDelegableActions.Length; i++)
            {
                var res = Dispatch(NeverDelegableActions[i], null);
                Assert.IsFalse(res.Success, NeverDelegableActions[i]);
                Assert.AreEqual("FORBIDDEN", ErrorCode(res), NeverDelegableActions[i] + ": " + Describe(res));
            }
            Assert.IsFalse(SecurityService.IsCurrentSessionOwner(), "المنح لا تجعل المدير مالكاً");
            Assert.AreEqual(usersBefore, Scalar("SELECT COUNT(*) FROM users;"));
            Assert.AreEqual("0", SettingsRepo.Get("owner_recovery_code_confirmed", "0"));
        }

        [Test]
        public void OwnerGrantsThroughUsersUpdatePermissionsIpc_ThenManagerPassesTheGate()
        {
            var manager = CreateManager("mgr_og5", ManagerPin);

            LoginAs(OwnerId);
            var res = Dispatch("users:updatePermissions", new { userId = manager.Id, permissions = Keys(KeyUpdates, KeyLicense) });
            Assert.IsTrue(res.Success, Describe(res));

            LoginAs(manager.Id);
            AssertGateAllows(UpdatesActions, "منحة التحديثات");
            AssertGateAllows(LicenseActions, "منحة الترخيص");
            AssertGateForbids(RestoreActions, "لم تُمنح منحة الاسترجاع");
        }

        [Test]
        public void GrantTakesEffectForAnAlreadyOpenManagerSession()
        {
            var manager = CreateManager("mgr_og6", ManagerPin);
            LoginAs(manager.Id);
            AssertGateForbids(UpdatesActions, "قبل المنحة");
            Assert.IsFalse(SecurityService.HasPermission(KeyUpdates), "بالجلسة الحالية قبل المنحة");

            // The grant is stored while the manager's session object stays the same
            SetStoredPermissionsJson(manager.Id, "{\"system.updates\":true}");
            AssertGateAllows(UpdatesActions, "بعد المنحة");
            Assert.IsTrue(SecurityService.HasPermission(KeyUpdates), "بالجلسة الحالية بعد المنحة");
        }

        // ---------- revoke ----------

        [Test]
        public void Revoke_RemovesAccessAgain_ByEmptyMapOrExplicitFalse()
        {
            var manager = CreateManager("mgr_og7", ManagerPin);
            Grant(manager.Id, KeyUpdates, KeyRestore, KeyLicense);
            LoginAs(manager.Id);
            AssertGateAllows(AllDelegableActions(), "قبل السحب");

            LoginAs(OwnerId);
            SecurityService.UpdateUserPermissions(manager.Id, new Dictionary<string, bool>
            {
                { KeyUpdates, false }, { KeyRestore, true }, { KeyLicense, true }
            });
            LoginAs(manager.Id);
            AssertGateForbids(UpdatesActions, "بعد سحب التحديثات");
            AssertGateAllows(RestoreActions, "الاسترجاع لم يُسحب");
            AssertGateAllows(LicenseActions, "الترخيص لم يُسحب");

            LoginAs(OwnerId);
            SecurityService.UpdateUserPermissions(manager.Id, new Dictionary<string, bool>());
            LoginAs(manager.Id);
            AssertGateForbids(AllDelegableActions(), "بعد سحب الكل");
            Assert.IsFalse(SecurityService.HasPermission(manager.Id, KeyRestore));
            Assert.IsFalse(SecurityService.HasPermission(manager.Id, KeyLicense));
        }

        [Test]
        public void Revoke_ByNullPermissionsPayload_RemovesEveryGrant()
        {
            var manager = CreateManager("mgr_og8", ManagerPin);
            Grant(manager.Id, KeyUpdates, KeyLicense);

            LoginAs(OwnerId);
            SecurityService.UpdateUserPermissions(manager.Id, null);
            LoginAs(manager.Id);
            AssertGateForbids(AllDelegableActions(), "بعد سحب الكل");
            Assert.AreEqual(0, StoredPermissions(manager.Id).Count);
        }

        // ---------- owner, root, cashier ----------

        [Test]
        public void OwnerAndRoot_AreAlwaysAllowed_EvenWhenTheirStoredPermissionsSayFalse()
        {
            SetStoredPermissionsJson(OwnerId, "{\"system.updates\":false,\"settings.restore\":false,\"settings.license\":false}");
            SetStoredPermissionsJson(RootId, "{\"system.updates\":false,\"settings.restore\":false,\"settings.license\":false}");

            LoginAs(OwnerId);
            AssertGateAllows(AllDelegableActions(), "المالك");
            LoginAs(RootId);
            AssertGateAllows(AllDelegableActions(), "المطور");

            string[] keys = SecurityService.DELEGABLE_OWNER_PERMISSIONS;
            for (int i = 0; i < keys.Length; i++)
            {
                Assert.IsTrue(SecurityService.HasPermission(OwnerId, keys[i]), "المالك " + keys[i]);
                Assert.IsTrue(SecurityService.HasPermission(RootId, keys[i]), "المطور " + keys[i]);
            }
        }

        [Test]
        public void Cashier_NeverHoldsOwnerGradeKeys_EvenWhenStoredPermissionsSayTrue()
        {
            var cashier = CreateCashierBy(OwnerId, "cash_og1");
            SetStoredPermissionsJson(cashier.Id, "{\"system.updates\":true,\"settings.restore\":true,\"settings.license\":true,\"pos.sell\":true}");
            SetStoredPermissionsJson(SeedCashierId, "{\"system.updates\":true,\"settings.restore\":true,\"settings.license\":true}");

            // The seeded cashier has a factory PIN (forced change), so only its permission lookups are checked, not a session
            string[] ids = new string[] { cashier.Id, SeedCashierId };
            for (int s = 0; s < ids.Length; s++)
            {
                var effective = SecurityService.GetEffectivePermissions(UserRepo.GetById(ids[s]));
                Assert.IsFalse(effective[KeyUpdates], ids[s]);
                Assert.IsFalse(effective[KeyRestore], ids[s]);
                Assert.IsFalse(effective[KeyLicense], ids[s]);
                Assert.IsFalse(SecurityService.HasPermission(ids[s], KeyUpdates), ids[s]);
                Assert.IsFalse(SecurityService.HasPermission(ids[s], KeyRestore), ids[s]);
                Assert.IsFalse(SecurityService.HasPermission(ids[s], KeyLicense), ids[s]);
            }

            LoginAs(cashier.Id);
            AssertGateForbids(AllDelegableActions(), "كاشير");
            // The refusal is also what the real dispatcher answers
            var res = Dispatch("updates:check", null);
            Assert.AreEqual("FORBIDDEN", ErrorCode(res), Describe(res));
        }

        [Test]
        public void OwnerCannotGrantOwnerGradeKeysToACashier_StoredValuesAreForcedFalse()
        {
            var cashier = CreateCashierBy(OwnerId, "cash_og2");

            LoginAs(OwnerId);
            SecurityService.UpdateUserPermissions(cashier.Id, new Dictionary<string, bool>
            {
                { KeyUpdates, true }, { KeyRestore, true }, { KeyLicense, true }, { "pos.sell", true }
            });

            JObject stored = StoredPermissions(cashier.Id);
            Assert.AreNotEqual(true, (bool?)stored[KeyUpdates]);
            Assert.AreNotEqual(true, (bool?)stored[KeyRestore]);
            Assert.AreNotEqual(true, (bool?)stored[KeyLicense]);
            LoginAs(cashier.Id);
            AssertGateForbids(AllDelegableActions(), "كاشير بعد محاولة المنح");
        }

        // ---------- a manager cannot grant ----------

        [Test]
        public void ManagerCannotGrant_ToAnotherManagerToHimselfOrByIpc()
        {
            var m1 = CreateManager("mgr_og9a", ManagerPin);
            var m2 = CreateManager("mgr_og9b", SecondManagerPin);
            var all = Keys(KeyUpdates, KeyRestore, KeyLicense);

            LoginAs(m1.Id);
            AssertDenied(delegate { SecurityService.UpdateUserPermissions(m2.Id, all); }, "منح مدير آخر");
            AssertDenied(delegate { SecurityService.UpdateUserPermissions(m1.Id, all); }, "منح نفسه");
            AssertDenied(delegate { SecurityService.UpdateUserPermissions(OwnerId, all); }, "تعديل المالك");

            var res = Dispatch("users:updatePermissions", new { userId = m2.Id, permissions = all });
            Assert.IsFalse(res.Success, "المدير يصل لمعالج الصلاحيات (users.edit) لكن المنح يُرفض");
            Assert.AreEqual("PERMISSIONS_UPDATE_ERROR", ErrorCode(res), Describe(res));
            var self = Dispatch("users:updatePermissions", new { userId = m1.Id, permissions = all });
            Assert.IsFalse(self.Success);
            Assert.AreEqual("PERMISSIONS_UPDATE_ERROR", ErrorCode(self), Describe(self));

            Assert.AreEqual(0, StoredPermissions(m1.Id).Count, "لا منحة وصلت لنفسه");
            Assert.AreEqual(0, StoredPermissions(m2.Id).Count, "ولا للمدير الآخر");
            Assert.IsFalse(SecurityService.HasPermission(m2.Id, KeyUpdates));
            AssertGateForbids(AllDelegableActions(), "المدير الأول بعد المحاولات");
        }

        [Test]
        public void ManagerWhoHoldsGrants_StillCannotGrantThemOnward()
        {
            var m1 = CreateManager("mgr_og10a", ManagerPin);
            var m2 = CreateManager("mgr_og10b", SecondManagerPin);
            var cashier = CreateCashierBy(m1.Id, "cash_og3");
            Grant(m1.Id, KeyUpdates, KeyRestore, KeyLicense);

            LoginAs(m1.Id);
            AssertDenied(delegate { SecurityService.UpdateUserPermissions(m2.Id, Keys(KeyUpdates)); }, "تمرير المنحة لمدير");

            // A cashier of his own may be edited, but owner-grade keys are forced false for cashiers
            SecurityService.UpdateUserPermissions(cashier.Id, Keys(KeyUpdates, KeyRestore, KeyLicense, "pos.sell"));
            Assert.IsFalse(SecurityService.HasPermission(cashier.Id, KeyUpdates));
            Assert.IsFalse(SecurityService.HasPermission(cashier.Id, KeyRestore));
            Assert.IsFalse(SecurityService.HasPermission(cashier.Id, KeyLicense));
            Assert.IsFalse(SecurityService.HasPermission(m2.Id, KeyUpdates));
        }

        // ---------- audit ----------

        [Test]
        public void OwnerGrantAndRevoke_AreAudited_WithKeysAndActor()
        {
            var manager = CreateManager("mgr_og11", ManagerPin);
            Assert.AreEqual(0, CountAudit("USER_PERMISSIONS_CHANGED"));

            LoginAs(OwnerId);
            SecurityService.UpdateUserPermissions(manager.Id, Keys(KeyUpdates, KeyLicense));
            Assert.AreEqual(1, CountAudit("USER_PERMISSIONS_CHANGED"));
            string ownerUsername = UserRepo.GetById(OwnerId).Username;
            Assert.AreEqual(OwnerId, ScalarText("SELECT user_id FROM audit_logs WHERE action = 'USER_PERMISSIONS_CHANGED' ORDER BY rowid DESC LIMIT 1;"), "المنفذ");
            Assert.AreEqual("mgr_og11", ScalarText("SELECT entity_id FROM audit_logs WHERE action = 'USER_PERMISSIONS_CHANGED' ORDER BY rowid DESC LIMIT 1;"), "الحساب المستهدف");
            string grantDetails = ScalarText("SELECT details_json FROM audit_logs WHERE action = 'USER_PERMISSIONS_CHANGED' ORDER BY rowid DESC LIMIT 1;");
            StringAssert.Contains(KeyUpdates, grantDetails);
            StringAssert.Contains(KeyLicense, grantDetails);
            StringAssert.DoesNotContain(KeyRestore, grantDetails, "المفتاح الذي لم يُمنح لا يظهر");
            StringAssert.Contains(ownerUsername, grantDetails, "اسم المنفذ");

            // Re-saving the same grants changes nothing and therefore adds no event
            SecurityService.UpdateUserPermissions(manager.Id, Keys(KeyUpdates, KeyLicense));
            Assert.AreEqual(1, CountAudit("USER_PERMISSIONS_CHANGED"), "إعادة الحفظ بنفس المنح ليست تغييراً");

            // Revoke one and grant another in a single save
            SecurityService.UpdateUserPermissions(manager.Id, Keys(KeyUpdates, KeyRestore));
            Assert.AreEqual(2, CountAudit("USER_PERMISSIONS_CHANGED"));
            string mixedDetails = ScalarText("SELECT details_json FROM audit_logs WHERE action = 'USER_PERMISSIONS_CHANGED' ORDER BY rowid DESC LIMIT 1;");
            StringAssert.Contains(KeyRestore, mixedDetails, "الممنوح حديثاً");
            StringAssert.Contains(KeyLicense, mixedDetails, "المسحوب");
            StringAssert.DoesNotContain(KeyUpdates, mixedDetails, "المنحة التي لم تتغير لا تظهر");

            // Revoke everything
            SecurityService.UpdateUserPermissions(manager.Id, new Dictionary<string, bool>());
            Assert.AreEqual(3, CountAudit("USER_PERMISSIONS_CHANGED"));
            string revokeDetails = ScalarText("SELECT details_json FROM audit_logs WHERE action = 'USER_PERMISSIONS_CHANGED' ORDER BY rowid DESC LIMIT 1;");
            StringAssert.Contains(KeyUpdates, revokeDetails);
            StringAssert.Contains(KeyRestore, revokeDetails);
            StringAssert.DoesNotContain(KeyLicense, revokeDetails);
        }

        [Test]
        public void RootGrant_IsAuditedWithTheRootActor()
        {
            var manager = CreateManager("mgr_og12", ManagerPin);

            LoginAs(RootId);
            SecurityService.UpdateUserPermissions(manager.Id, Keys(KeyRestore));

            Assert.AreEqual(1, CountAudit("USER_PERMISSIONS_CHANGED"));
            Assert.AreEqual(RootId, ScalarText("SELECT user_id FROM audit_logs WHERE action = 'USER_PERMISSIONS_CHANGED' ORDER BY rowid DESC LIMIT 1;"));
            string details = ScalarText("SELECT details_json FROM audit_logs WHERE action = 'USER_PERMISSIONS_CHANGED' ORDER BY rowid DESC LIMIT 1;");
            StringAssert.Contains(KeyRestore, details);
            StringAssert.Contains(UserRepo.GetById(RootId).Username, details);
        }

        [Test]
        public void RefusedGrantByAManager_WritesNoPermissionsChangedEvent()
        {
            var m1 = CreateManager("mgr_og13a", ManagerPin);
            var m2 = CreateManager("mgr_og13b", SecondManagerPin);

            LoginAs(m1.Id);
            AssertDenied(delegate { SecurityService.UpdateUserPermissions(m2.Id, Keys(KeyUpdates)); }, "منح مرفوض");
            Assert.AreEqual(0, CountAudit("USER_PERMISSIONS_CHANGED"));
        }

        // ---------- stored shape ----------

        [Test]
        public void ManagerStoredPermissions_ContainOnlyTrueDelegableKeys_IgnoringTheRestOfThePayload()
        {
            var manager = CreateManager("mgr_og14", ManagerPin);

            LoginAs(OwnerId);
            SecurityService.UpdateUserPermissions(manager.Id, new Dictionary<string, bool>
            {
                { KeyUpdates, true }, { KeyLicense, false }, { "reports.profit", false },
                { "users.create", false }, { "pos.sell", true }, { "not.a.real.key", true }
            });

            JObject stored = StoredPermissions(manager.Id);
            Assert.AreEqual(1, stored.Count, "المخزن: " + stored);
            Assert.AreEqual(true, (bool)stored[KeyUpdates]);
            Assert.IsNull(stored[KeyLicense], "المفتاح المرسل false لا يُخزَّن");
            Assert.IsNull(stored["reports.profit"]);
            Assert.IsNull(stored["not.a.real.key"]);

            // The ignored keys neither take power away from the manager nor add anything
            Assert.IsTrue(SecurityService.HasPermission(manager.Id, "reports.profit"), "المدير يحتفظ بصلاحياته اليومية");
            Assert.IsTrue(SecurityService.HasPermission(manager.Id, "users.create"));
            Assert.IsTrue(SecurityService.HasPermission(manager.Id, KeyUpdates));
            Assert.IsFalse(SecurityService.HasPermission(manager.Id, KeyLicense));
        }

        [Test]
        public void ManagerStoredPermissions_AreAnEmptyObject_WhenNothingIsGranted()
        {
            var manager = CreateManager("mgr_og15", ManagerPin);

            LoginAs(OwnerId);
            SecurityService.UpdateUserPermissions(manager.Id, new Dictionary<string, bool> { { "reports.profit", true }, { KeyRestore, false } });
            Assert.AreEqual(0, StoredPermissions(manager.Id).Count);
            SecurityService.UpdateUserPermissions(manager.Id, new Dictionary<string, bool>());
            Assert.AreEqual(0, StoredPermissions(manager.Id).Count);
        }

        // ---------- promote / demote ----------

        [Test]
        public void PromotingACashier_DropsStoredOwnerGradeKeys_SoNoGrantAppears()
        {
            var cashier = CreateCashierBy(OwnerId, "cash_og4");
            SetStoredPermissionsJson(cashier.Id, "{\"system.updates\":true,\"settings.restore\":true,\"settings.license\":true}");

            LoginAs(OwnerId);
            SecurityService.UpdateUser(cashier.Id, "كاشير مُرقّى", "admin", true);

            Assert.IsTrue(string.IsNullOrEmpty(UserRepo.GetById(cashier.Id).PermissionsJson), "تُصفَّر الصلاحيات عند الترقية");
            Assert.AreEqual(SecurityService.TIER_MANAGER, SecurityService.Tier(UserRepo.GetById(cashier.Id)));
            string[] keys = SecurityService.DELEGABLE_OWNER_PERMISSIONS;
            for (int i = 0; i < keys.Length; i++)
            {
                Assert.IsFalse(SecurityService.HasPermission(cashier.Id, keys[i]), keys[i]);
            }
            LoginAs(cashier.Id);
            AssertGateForbids(AllDelegableActions(), "مدير مُرقّى حديثاً");
        }

        [Test]
        public void DemotingAManager_RemovesGrants_AndRePromotionDoesNotBringThemBack()
        {
            var manager = CreateManager("mgr_og16", ManagerPin);
            Grant(manager.Id, KeyUpdates, KeyRestore, KeyLicense);
            Assert.IsTrue(SecurityService.HasPermission(manager.Id, KeyRestore), "شرط مسبق: المنحة فعالة");

            LoginAs(OwnerId);
            SecurityService.UpdateUser(manager.Id, null, "cashier", true);
            var demoted = UserRepo.GetById(manager.Id);
            Assert.AreEqual("cashier", demoted.Role);
            Assert.IsTrue(string.IsNullOrEmpty(demoted.PermissionsJson), "تُصفَّر الصلاحيات عند التخفيض");
            string[] keys = SecurityService.DELEGABLE_OWNER_PERMISSIONS;
            for (int i = 0; i < keys.Length; i++)
            {
                Assert.IsFalse(SecurityService.HasPermission(manager.Id, keys[i]), "بعد التخفيض " + keys[i]);
            }
            LoginAs(manager.Id);
            AssertGateForbids(AllDelegableActions(), "بعد التخفيض");

            LoginAs(OwnerId);
            SecurityService.UpdateUser(manager.Id, null, "admin", true);
            Assert.IsTrue(string.IsNullOrEmpty(UserRepo.GetById(manager.Id).PermissionsJson), "الترقية من جديد لا تعيد المنح");
            for (int i = 0; i < keys.Length; i++)
            {
                Assert.IsFalse(SecurityService.HasPermission(manager.Id, keys[i]), "بعد إعادة الترقية " + keys[i]);
            }
        }

        // ---------- restart ----------

        [Test]
        public void RestartNormalisation_KeepsAManagersGrants_AndGrantsNothingExtra()
        {
            var manager = CreateManager("mgr_og17", ManagerPin);
            var plain = CreateManager("mgr_og17b", SecondManagerPin);
            Grant(manager.Id, KeyUpdates, KeyLicense);
            string before = UserRepo.GetById(manager.Id).PermissionsJson;
            Assert.IsFalse(string.IsNullOrEmpty(before), "شرط مسبق");

            SecurityService restarted = RestartSecurityService();
            RestartSecurityService();

            Assert.AreEqual(before, UserRepo.GetById(manager.Id).PermissionsJson, "إعادة التشغيل لا تغيّر المنح المخزنة");
            Assert.IsTrue(restarted.HasPermission(manager.Id, KeyUpdates));
            Assert.IsFalse(restarted.HasPermission(manager.Id, KeyRestore));
            Assert.IsTrue(restarted.HasPermission(manager.Id, KeyLicense));
            Assert.IsFalse(restarted.HasPermission(plain.Id, KeyUpdates), "مدير بلا منحة يبقى بلا منحة");
            Assert.IsFalse(restarted.HasPermission(plain.Id, KeyLicense));

            LoginAs(manager.Id);
            AssertGateAllows(UpdatesActions, "بعد إعادة التشغيل");
            AssertGateForbids(RestoreActions, "بعد إعادة التشغيل");
        }

        [Test]
        public void RestartNormalisation_DoesNotTurnACashiersStoredKeysIntoAccess()
        {
            var cashier = CreateCashierBy(OwnerId, "cash_og5");
            SetStoredPermissionsJson(cashier.Id, "{\"system.updates\":true,\"settings.license\":true}");

            SecurityService restarted = RestartSecurityService();
            Assert.IsFalse(restarted.HasPermission(cashier.Id, KeyUpdates));
            Assert.IsFalse(restarted.HasPermission(cashier.Id, KeyLicense));
        }

        // ---------- stored-JSON tampering ----------

        [Test]
        public void NeverDelegableActions_StayDeniedForAManager_EvenWhenStoredPermissionsSayTrue()
        {
            AssertNoRealStoreIsLoaded();
            var manager = CreateManager("mgr_og18", ManagerPin);
            SetStoredPermissionsJson(manager.Id,
                "{\"system.updates\":true,\"settings.restore\":true,\"settings.license\":true,\"__owner__\":true,\"owner\":true,\"system.factoryReset\":true,\"security.setPin\":true}");

            LoginAs(manager.Id);
            for (int i = 0; i < NeverDelegableActions.Length; i++)
            {
                var res = Dispatch(NeverDelegableActions[i], null);
                Assert.IsFalse(res.Success, NeverDelegableActions[i]);
                Assert.AreEqual("FORBIDDEN", ErrorCode(res), NeverDelegableActions[i] + ": " + Describe(res));
            }
            Assert.IsFalse(SecurityService.IsCurrentSessionOwner());
            Assert.AreEqual("0", SettingsRepo.Get("owner_recovery_code_confirmed", "0"));
            // ... while the genuine delegable keys in the same JSON do open their own actions
            AssertGateAllows(AllDelegableActions(), "المنح الحقيقية في نفس الـ JSON");
        }

        [Test]
        public void CorruptOrNonGrantingStoredPermissions_NeverGrantAnything()
        {
            var manager = CreateManager("mgr_og19", ManagerPin);
            string[] broken = new string[]
            {
                "{not json", "[]", "\"system.updates\"", "{\"system.updates\":null}", "{\"system.updates\":false}"
            };

            for (int b = 0; b < broken.Length; b++)
            {
                SetStoredPermissionsJson(manager.Id, broken[b]);
                string[] keys = SecurityService.DELEGABLE_OWNER_PERMISSIONS;
                for (int i = 0; i < keys.Length; i++)
                {
                    Assert.IsFalse(SecurityService.HasPermission(manager.Id, keys[i]), broken[b] + " -> " + keys[i]);
                }
                LoginAs(manager.Id);
                AssertGateForbids(AllDelegableActions(), "JSON تالف: " + broken[b]);
                Logout();
            }
        }

        // ---------- effective permission DTO ----------

        [Test]
        public void EffectivePermissionsDto_ShowsTheThreeKeysPerRole()
        {
            var noGrant = CreateManager("mgr_og20a", ManagerPin);
            var granted = CreateManager("mgr_og20b", SecondManagerPin);
            var cashier = CreateCashierBy(OwnerId, "cash_og6");
            Grant(granted.Id, KeyUpdates, KeyLicense);

            string[] keys = SecurityService.DELEGABLE_OWNER_PERMISSIONS;
            var ownerPerms = SecurityService.MapToDto(UserRepo.GetById(OwnerId)).Permissions;
            var rootPerms = SecurityService.MapToDto(UserRepo.GetById(RootId)).Permissions;
            var noGrantPerms = SecurityService.MapToDto(UserRepo.GetById(noGrant.Id)).Permissions;
            var grantedPerms = SecurityService.MapToDto(UserRepo.GetById(granted.Id)).Permissions;
            var cashierPerms = SecurityService.MapToDto(UserRepo.GetById(cashier.Id)).Permissions;

            for (int i = 0; i < keys.Length; i++)
            {
                Assert.IsTrue(ownerPerms[keys[i]], "المالك " + keys[i]);
                Assert.IsTrue(rootPerms[keys[i]], "المطور " + keys[i]);
                Assert.IsFalse(noGrantPerms[keys[i]], "مدير بلا منحة " + keys[i]);
                Assert.IsFalse(cashierPerms[keys[i]], "كاشير " + keys[i]);
            }
            Assert.IsTrue(grantedPerms[KeyUpdates]);
            Assert.IsFalse(grantedPerms[KeyRestore]);
            Assert.IsTrue(grantedPerms[KeyLicense]);

            // The static helper (used by the UI payload) agrees with the DTO
            var viaHelper = SecurityService.GetEffectivePermissions(UserRepo.GetById(granted.Id));
            Assert.IsTrue(viaHelper[KeyUpdates]);
            Assert.IsFalse(viaHelper[KeyRestore]);
            Assert.IsTrue(viaHelper[KeyLicense]);
        }

        [Test]
        public void EffectivePermissionsDto_AgreesWithHasPermission_ForEveryIdentity()
        {
            var noGrant = CreateManager("mgr_og21a", ManagerPin);
            var granted = CreateManager("mgr_og21b", SecondManagerPin);
            var cashier = CreateCashierBy(OwnerId, "cash_og7");
            Grant(granted.Id, KeyRestore);

            string[] ids = new string[] { OwnerId, RootId, noGrant.Id, granted.Id, cashier.Id };
            string[] keys = SecurityService.DELEGABLE_OWNER_PERMISSIONS;
            for (int s = 0; s < ids.Length; s++)
            {
                var perms = SecurityService.GetEffectivePermissions(UserRepo.GetById(ids[s]));
                for (int i = 0; i < keys.Length; i++)
                {
                    Assert.AreEqual(SecurityService.HasPermission(ids[s], keys[i]), perms[keys[i]], ids[s] + " / " + keys[i]);
                }
            }
        }
    }
}
