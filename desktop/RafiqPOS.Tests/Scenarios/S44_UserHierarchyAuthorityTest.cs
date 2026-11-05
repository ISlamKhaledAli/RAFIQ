using System;
using System.Collections.Generic;
using NUnit.Framework;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    /// <summary>
    /// نموذج المستويات: root (3) > صاحب المحل (2) > مدير (1) > كاشير (0).
    /// القاعدة: لا يعدّل حساباً إلا من مستواه أعلى، والمدير لا يلمس المالك ولا مديراً آخر،
    /// والمالك لا يُعطَّل ولا يُخفض، وتغيير الرتبة يعيد ربط التبعية بالمالك.
    /// </summary>
    [TestFixture]
    [NonParallelizable]
    public class S44_UserHierarchyAuthorityTest : S44_UserHierarchyFixtureBase
    {
        // ---------- Tier model ----------

        [Test]
        public void TierModel_RanksRootOwnerManagerCashier()
        {
            var manager = CreateManager("tier_mgr", ManagerPin);
            var cashier = CreateCashierBy(OwnerId, "tier_cash");

            Assert.AreEqual(SecurityService.TIER_ROOT, SecurityService.Tier(UserRepo.GetById(RootId)));
            Assert.AreEqual(SecurityService.TIER_OWNER, SecurityService.Tier(UserRepo.GetById(OwnerId)));
            Assert.AreEqual(SecurityService.TIER_MANAGER, SecurityService.Tier(UserRepo.GetById(manager.Id)));
            Assert.AreEqual(SecurityService.TIER_CASHIER, SecurityService.Tier(UserRepo.GetById(cashier.Id)));
            Assert.AreEqual(-1, SecurityService.Tier(null), "لا مستخدم = لا مستوى");

            Assert.IsTrue(SecurityService.MapToDto(UserRepo.GetById(OwnerId)).IsOwner, "المالك فقط isOwner");
            Assert.IsFalse(SecurityService.MapToDto(UserRepo.GetById(manager.Id)).IsOwner, "المدير ليس مالكاً رغم أن دوره admin");
            Assert.IsFalse(SecurityService.MapToDto(UserRepo.GetById(cashier.Id)).IsOwner);
            Assert.IsFalse(SecurityService.MapToDto(UserRepo.GetById(RootId)).IsOwner, "حساب المطور ليس صاحب المحل");
            Assert.IsTrue(SecurityService.IsOwnerUser(UserRepo.GetById(OwnerId)));
            Assert.IsFalse(SecurityService.IsOwnerUser(UserRepo.GetById(manager.Id)));
        }

        [Test]
        public void TierModel_OwnerIdentityIsFixedIdOrUsernameAdmin_NeverRoot()
        {
            Assert.AreEqual(2, SecurityService.TierOf("usr_admin_default", "renamed_owner", "admin"), "المعرّف الثابت يحدد المالك");
            Assert.AreEqual(2, SecurityService.TierOf("usr_other", "ADMIN", "admin"), "اسم admin بأي حالة أحرف يحدد المالك");
            Assert.AreEqual(1, SecurityService.TierOf("usr_other", "boss", "admin"), "أي admin آخر مدير");
            Assert.AreEqual(0, SecurityService.TierOf("usr_other", "boss", "cashier"));
            Assert.AreEqual(3, SecurityService.TierOf("usr_root_developer", "islam", "root"));
            Assert.AreEqual(3, SecurityService.TierOf("usr_other", "admin", "root"), "الجذر لا يُعامل كمالك حتى باسم admin");

            Assert.IsTrue(SecurityService.IsOwnerOnlyPermission("settings.restore"));
            Assert.IsTrue(SecurityService.IsOwnerOnlyPermission("settings.license"));
            Assert.IsFalse(SecurityService.IsOwnerOnlyPermission("settings.backup"));
            Assert.IsFalse(SecurityService.IsOwnerOnlyPermission("users.create"));
        }

        // ---------- Owner rename survives restart ----------

        [Test]
        public void OwnerRename_PersistsAcrossSecurityServiceRestart()
        {
            LoginAs(OwnerId);
            SecurityService.UpdateUser(OwnerId, "الحاج سعيد", "admin", true);
            Assert.AreEqual("الحاج سعيد", UserRepo.GetById(OwnerId).DisplayName);

            // Re-creating the service is what an application restart does (NormalizeAdminRoles runs in the constructor)
            RestartSecurityService();
            var afterFirst = UserRepo.GetById(OwnerId);
            Assert.AreEqual("الحاج سعيد", afterFirst.DisplayName, "إعادة التشغيل لا تعيد اسم صاحب المحل الافتراضي");
            Assert.AreEqual("admin", afterFirst.Username, "اسم الدخول لا يتغير");
            Assert.AreEqual("admin", afterFirst.Role);
            Assert.IsTrue(afterFirst.IsActive);

            RestartSecurityService();
            Assert.AreEqual("الحاج سعيد", UserRepo.GetById(OwnerId).DisplayName, "وكذلك بعد إعادة تشغيل ثانية");
        }

        [Test]
        public void OwnerRename_ThroughUsersUpdateIpc_Succeeds_AndSurvivesRestart()
        {
            LoginAs(OwnerId);
            var res = Dispatch("users:update", new { id = OwnerId, displayName = "المعلم حسن", role = "admin", isActive = true });
            Assert.IsTrue(res.Success, Describe(res));

            RestartSecurityService();
            Assert.AreEqual("المعلم حسن", UserRepo.GetById(OwnerId).DisplayName);
            Assert.AreEqual("admin", UserRepo.GetById(OwnerId).Role, "الرتبة لم تتأثر بالتعديل");
        }

        [Test]
        public void OwnerDisplayName_IsRestoredAtStartupOnlyWhenBlank()
        {
            Execute("UPDATE users SET display_name = '' WHERE id = @id;", "@id", OwnerId);
            RestartSecurityService();
            Assert.IsFalse(string.IsNullOrWhiteSpace(UserRepo.GetById(OwnerId).DisplayName), "الاسم الفارغ فقط يُستعاد افتراضياً");

            LoginAs(OwnerId);
            SecurityService.UpdateUser(OwnerId, "اسم مخصص", "admin", true);
            RestartSecurityService();
            Assert.AreEqual("اسم مخصص", UserRepo.GetById(OwnerId).DisplayName, "الاسم المخصص لا يُستبدل");
        }

        // ---------- Account creation ----------

        [Test]
        public void OwnerCreatesManager_ParentIsOwner_EvenWhenAnotherParentIsRequested()
        {
            LoginAs(OwnerId);
            var m = SecurityService.CreateSubUser(SeedCashierId, "mgr_a", "مدير أ", null, ManagerPin, "admin", null, false, 0);

            Assert.AreEqual("admin", m.Role);
            Assert.AreEqual(OwnerId, m.ParentId, "المدير تحت المالك دائماً ويُتجاهل parentId المرسل");
            Assert.AreEqual(OwnerId, m.CreatedBy);
            Assert.IsFalse(m.IsOwner);
            Assert.IsTrue(m.CanDelegate, "المدير يملك إنشاء الكاشيرية");
            Assert.GreaterOrEqual(m.MaxDepth, 1);
            Assert.IsTrue(m.HasPin);
            Assert.IsFalse(m.HasPassword);
            Assert.AreEqual(SecurityService.TIER_MANAGER, SecurityService.Tier(UserRepo.GetById(m.Id)));
            Assert.AreEqual(1, CountAudit("USER_CREATED"), "تسجيل إنشاء الحساب في المراجعة");
        }

        [Test]
        public void ManagerCreatesCashier_UnderHimself_WithoutDelegationFlags()
        {
            var m = CreateManager("mgr_b", ManagerPin);
            // Even a manager whose stored delegation fields are off may create cashiers (admins no longer need them)
            Execute("UPDATE users SET can_delegate = 0, max_depth = 0 WHERE id = @id;", "@id", m.Id);

            LoginAs(m.Id);
            var c = SecurityService.CreateSubUser(null, "cash_b1", "كاشير ب1", null, StaffPin, "cashier", null, true, 5);

            Assert.AreEqual("cashier", c.Role);
            Assert.AreEqual(m.Id, c.ParentId, "الكاشير تحت مديره");
            Assert.AreEqual(m.Id, c.CreatedBy);
            Assert.IsFalse(c.CanDelegate, "كاشير المدير لا يفوّض");
            Assert.AreEqual(0, c.MaxDepth);
            Assert.IsTrue(c.Permissions["pos.sell"], "افتراضيات دور الكاشير");
            Assert.IsFalse(c.Permissions["settings.restore"]);
            Assert.IsTrue(SecurityService.Login("cash_b1", StaffPin).Success, "الكاشير الجديد يدخل");
        }

        [Test]
        public void ManagerCannotCreateManager_ByServiceOrIpc()
        {
            var m = CreateManager("mgr_c", ManagerPin);
            LoginAs(m.Id);

            Assert.Throws<UnauthorizedAccessException>(delegate
            {
                SecurityService.CreateSubUser(null, "evil_mgr", "مدير مزيف", null, StaffPin, "admin", null, false, 0);
            });
            Assert.Throws<UnauthorizedAccessException>(delegate
            {
                SecurityService.CreateUser("evil_mgr2", "مدير مزيف 2", StaffPin, "admin");
            });
            Assert.IsNull(UserRepo.GetByUsername("evil_mgr"));
            Assert.IsNull(UserRepo.GetByUsername("evil_mgr2"));

            var sub = Dispatch("users:createSubUser", new { username = "evil_mgr3", displayName = "x", pin = StaffPin, role = "admin" });
            Assert.IsFalse(sub.Success);
            Assert.AreEqual("USER_CREATE_ERROR", ErrorCode(sub));
            var flat = Dispatch("users:create", new { username = "evil_mgr4", displayName = "x", pin = StaffPin, role = "admin" });
            Assert.IsFalse(flat.Success);
            Assert.AreEqual("USER_CREATE_ERROR", ErrorCode(flat));
            Assert.IsNull(UserRepo.GetByUsername("evil_mgr3"));
            Assert.IsNull(UserRepo.GetByUsername("evil_mgr4"));
        }

        [Test]
        public void ManagerCannotPlaceCashierOutsideHisOwnSubtree_ButOwnerMayPlaceUnderAManager()
        {
            var m1 = CreateManager("mgr_e1", ManagerPin);
            var m2 = CreateManager("mgr_e2", SecondManagerPin);

            LoginAs(m1.Id);
            Assert.Throws<UnauthorizedAccessException>(delegate
            {
                SecurityService.CreateSubUser(OwnerId, "stray1", "x", null, StaffPin, "cashier", null, false, 0);
            }, "لا يضع المدير حساباً تحت المالك");
            Assert.Throws<UnauthorizedAccessException>(delegate
            {
                SecurityService.CreateSubUser(m2.Id, "stray2", "x", null, StaffPin, "cashier", null, false, 0);
            }, "ولا تحت مدير آخر");
            Assert.IsNull(UserRepo.GetByUsername("stray1"));
            Assert.IsNull(UserRepo.GetByUsername("stray2"));

            LoginAs(OwnerId);
            var placed = SecurityService.CreateSubUser(m1.Id, "owner_placed", "كاشير مُعيَّن", null, StaffPin, "cashier", null, false, 0);
            Assert.AreEqual(m1.Id, placed.ParentId, "المالك يضع الكاشير تحت المدير الذي يختاره");
        }

        // ---------- Manager vs owner / manager ----------

        [Test]
        public void ManagerCannotUpdateOwnerOrAnotherManager_ByServiceOrIpc()
        {
            var m1 = CreateManager("mgr_f1", ManagerPin);
            var m2 = CreateManager("mgr_f2", SecondManagerPin);
            string ownerName = UserRepo.GetById(OwnerId).DisplayName;
            string m2Name = UserRepo.GetById(m2.Id).DisplayName;

            LoginAs(m1.Id);
            Assert.Throws<UnauthorizedAccessException>(delegate { SecurityService.UpdateUser(OwnerId, "اسم مخترق", "admin", true); });
            Assert.Throws<UnauthorizedAccessException>(delegate { SecurityService.UpdateUser(m2.Id, "اسم مخترق", "admin", true); });

            var ipc = Dispatch("users:update", new { id = m2.Id, displayName = "اسم مخترق", role = "admin", isActive = true });
            Assert.IsFalse(ipc.Success);
            Assert.AreEqual("USER_UPDATE_ERROR", ErrorCode(ipc));

            Assert.AreEqual(ownerName, UserRepo.GetById(OwnerId).DisplayName, "اسم المالك كما هو");
            Assert.AreEqual(m2Name, UserRepo.GetById(m2.Id).DisplayName, "اسم المدير الآخر كما هو");
        }

        [Test]
        public void Manager_CanRenameSelfAndHisCashier_ButNotChangeOwnRoleOrStatus()
        {
            var m = CreateManager("mgr_g", ManagerPin);
            var c = CreateCashierBy(m.Id, "cash_g");

            LoginAs(m.Id);
            SecurityService.UpdateUser(m.Id, "مدير بعد التعديل", "admin", true);
            SecurityService.UpdateUser(c.Id, "كاشير بعد التعديل", "cashier", true);
            Assert.AreEqual("مدير بعد التعديل", UserRepo.GetById(m.Id).DisplayName);
            Assert.AreEqual("كاشير بعد التعديل", UserRepo.GetById(c.Id).DisplayName);

            Assert.Throws<UnauthorizedAccessException>(delegate { SecurityService.UpdateUser(m.Id, "x", "cashier", true); }, "لا يخفض المدير رتبته بنفسه");
            Assert.Throws<UnauthorizedAccessException>(delegate { SecurityService.UpdateUser(m.Id, "x", "admin", false); }, "ولا يعطّل نفسه");
            Assert.AreEqual("admin", UserRepo.GetById(m.Id).Role);
            Assert.IsTrue(UserRepo.GetById(m.Id).IsActive);
        }

        [Test]
        public void ManagerCannotSetPassword_OfOwnerOrAnotherManager_ButCanForHisCashier()
        {
            var m1 = CreateManager("mgr_h1", ManagerPin);
            var m2 = CreateManager("mgr_h2", SecondManagerPin);
            var c = CreateCashierBy(m1.Id, "cash_h");

            LoginAs(m1.Id);
            Assert.Throws<UnauthorizedAccessException>(delegate { SecurityService.SetUserPassword(OwnerId, "newpass12", null); });
            Assert.Throws<UnauthorizedAccessException>(delegate { SecurityService.SetUserPassword(m2.Id, "newpass12", null); });
            Assert.IsFalse(SecurityService.VerifyUserPassword(OwnerId, "newpass12"));
            Assert.IsFalse(SecurityService.VerifyUserPassword(m2.Id, "newpass12"));

            var ipc = Dispatch("users:setPassword", new { userId = OwnerId, newPassword = "newpass12", currentPassword = "" });
            Assert.IsFalse(ipc.Success);
            Assert.AreEqual("PASSWORD_CHANGE_ERROR", ErrorCode(ipc));

            SecurityService.SetUserPassword(c.Id, "goodpass1", null);
            Assert.IsTrue(SecurityService.VerifyUserPassword(c.Id, "goodpass1"), "المدير يعيّن كلمة مرور كاشيره");

            LoginAs(OwnerId);
            SecurityService.SetUserPassword(m1.Id, "mgrpass12", null);
            Assert.IsTrue(SecurityService.VerifyUserPassword(m1.Id, "mgrpass12"), "المالك يعيّن كلمة مرور مدير");
        }

        [Test]
        public void ManagerCannotResetPin_OfOwnerOrAnotherManager_EvenWithHisOwnPinAsSupervisor()
        {
            var m1 = CreateManager("mgr_i1", ManagerPin);
            var m2 = CreateManager("mgr_i2", SecondManagerPin);
            var c = CreateCashierBy(m1.Id, "cash_i");
            string ownerHash = UserRepo.GetById(OwnerId).PinCodeHash;
            string m2Hash = UserRepo.GetById(m2.Id).PinCodeHash;

            LoginAs(m1.Id);
            // His own PIN as the approver: a manager is not strictly above the owner nor above another manager
            Assert.Throws<UnauthorizedAccessException>(delegate { SecurityService.ChangeUserPinSecure(OwnerId, "9047", null, ManagerPin); });
            Assert.Throws<UnauthorizedAccessException>(delegate { SecurityService.ChangeUserPinSecure(m2.Id, "9047", null, ManagerPin); });
            Assert.AreEqual(ownerHash, UserRepo.GetById(OwnerId).PinCodeHash, "رقم المالك لم يتغير");
            Assert.AreEqual(m2Hash, UserRepo.GetById(m2.Id).PinCodeHash, "رقم المدير الآخر لم يتغير");
            Assert.IsTrue(SecurityService.VerifyUserPin(OwnerId, OwnerPin));
            Assert.IsTrue(SecurityService.VerifyUserPin(m2.Id, SecondManagerPin));

            // Self-service and his own cashier remain possible
            SecurityService.ChangeUserPinSecure(m1.Id, "9047", ManagerPin, null);
            Assert.IsTrue(SecurityService.VerifyUserPin(m1.Id, "9047"), "المدير يغيّر رقمه بنفسه برقمه الحالي");
            SecurityService.ChangeUserPinSecure(c.Id, "2846", null, null);
            Assert.IsTrue(SecurityService.VerifyUserPin(c.Id, "2846"), "المدير يعيد ضبط رقم كاشيره");

            // The owner is strictly above a manager, so his PIN is a valid approval
            LoginAs(OwnerId);
            SecurityService.ChangeUserPinSecure(m2.Id, "3957", null, OwnerPin);
            Assert.IsTrue(SecurityService.VerifyUserPin(m2.Id, "3957"), "المالك يعيد ضبط رقم المدير");
            Assert.IsFalse(SecurityService.VerifyUserPin(m2.Id, SecondManagerPin));
        }

        [Test]
        public void ManagerCannotResetOwnerOrManagerPin_ThroughUsersChangePinIpc()
        {
            var m1 = CreateManager("mgr_i3", ManagerPin);
            var m2 = CreateManager("mgr_i4", SecondManagerPin);
            string ownerHash = UserRepo.GetById(OwnerId).PinCodeHash;
            string m2Hash = UserRepo.GetById(m2.Id).PinCodeHash;

            LoginAs(m1.Id);
            var onOwner = Dispatch("users:changePin", new { id = OwnerId, newPin = "9047", currentPin = "", supervisorPin = ManagerPin });
            Assert.IsFalse(onOwner.Success, "المدير لا يعيد ضبط رقم المالك: " + Describe(onOwner));
            var onManager = Dispatch("users:changePin", new { id = m2.Id, newPin = "9047", currentPin = "", supervisorPin = ManagerPin });
            Assert.IsFalse(onManager.Success, "ولا رقم مدير آخر: " + Describe(onManager));

            Assert.AreEqual(ownerHash, UserRepo.GetById(OwnerId).PinCodeHash);
            Assert.AreEqual(m2Hash, UserRepo.GetById(m2.Id).PinCodeHash);
        }

        [Test]
        public void ManagerPin_StillWorksAsSupervisorApproval_ForOrdinaryOverrides()
        {
            var m = CreateManager("mgr_j", ManagerPin);
            var res = SecurityService.VerifySupervisorPin(ManagerPin, "discount_override");
            Assert.IsTrue(res.Success, "اعتماد المشرف العادي يقبل رقم المدير");
            Assert.AreEqual(m.DisplayName, res.SupervisorName);

            var ownerOnly = SecurityService.VerifySupervisorPin(ManagerPin, "owner_level_action", SecurityService.TIER_OWNER);
            Assert.IsFalse(ownerOnly.Success, "لكنه لا يصلح كاعتماد على مستوى المالك");
        }

        [Test]
        public void ManagerCannotEditPermissionsOrDelegation_OfOwnerOrAnotherManagerOrHimself()
        {
            var m1 = CreateManager("mgr_k1", ManagerPin);
            var m2 = CreateManager("mgr_k2", SecondManagerPin);
            var c = CreateCashierBy(m1.Id, "cash_k");
            var denyPos = new Dictionary<string, bool> { { "pos.sell", false } };

            LoginAs(m1.Id);
            AssertDenied(delegate { SecurityService.UpdateUserPermissions(OwnerId, denyPos); }, "صلاحيات المالك");
            AssertDenied(delegate { SecurityService.UpdateUserPermissions(m2.Id, denyPos); }, "صلاحيات مدير آخر");
            AssertDenied(delegate { SecurityService.UpdateUserPermissions(m1.Id, denyPos); }, "صلاحيات نفسه");
            AssertDenied(delegate { SecurityService.SetUserDelegation(OwnerId, true, 5); }, "تفويض المالك");
            AssertDenied(delegate { SecurityService.SetUserDelegation(m2.Id, true, 5); }, "تفويض مدير آخر");
            AssertDenied(delegate { SecurityService.SetUserDelegation(m1.Id, true, 5); }, "تفويض نفسه");

            Assert.IsTrue(SecurityService.MapToDto(UserRepo.GetById(m2.Id)).Permissions["pos.sell"], "صلاحيات المدير الآخر لم تتغير");

            SecurityService.UpdateUserPermissions(c.Id, denyPos);
            Assert.IsFalse(SecurityService.MapToDto(UserRepo.GetById(c.Id)).Permissions["pos.sell"], "صلاحيات كاشيره قابلة للتعديل");
            SecurityService.SetUserDelegation(c.Id, true, 2);
            Assert.IsTrue(UserRepo.GetById(c.Id).CanDelegate, "وتفويض كاشيره كذلك");
        }

        [Test]
        public void OwnerEditsManagerPermissions_OnlyTheOwnerGradeGrantsAreStored_DailyPowersStayWithTheManager()
        {
            // Changed with the delegable owner-grade model (S50): the owner CAN grant settings.restore / settings.license to a manager,
            // and the stored map holds only those grants; a false sent for a daily power such as reports.profit is ignored (managers keep every daily power)
            var m = CreateManager("mgr_l", ManagerPin);
            Assert.IsFalse(SecurityService.HasPermission(m.Id, "settings.restore"), "قبل المنح");

            LoginAs(OwnerId);
            SecurityService.UpdateUserPermissions(m.Id, new Dictionary<string, bool>
            {
                { "settings.restore", true }, { "settings.license", true }, { "reports.profit", false }
            });

            var dto = SecurityService.MapToDto(UserRepo.GetById(m.Id));
            Assert.IsTrue(dto.Permissions["settings.restore"], "المالك يمنح المدير الاسترجاع صراحةً");
            Assert.IsTrue(dto.Permissions["settings.license"], "وكذلك الترخيص");
            Assert.IsFalse(dto.Permissions["system.updates"], "ما لم يُمنح يبقى مغلقاً");
            Assert.IsTrue(dto.Permissions["reports.profit"], "المدير يحتفظ بصلاحياته اليومية");
            Assert.IsTrue(SecurityService.HasPermission(m.Id, "settings.restore"));
            Assert.IsTrue(SecurityService.HasPermission(m.Id, "settings.license"));
            Assert.IsFalse(SecurityService.HasPermission(m.Id, "system.updates"));
        }

        // ---------- Disable / enable / owner protection ----------

        [Test]
        public void OwnerCannotBeDisabledOrDemoted_ByAnyoneIncludingHimselfAndRoot()
        {
            var m = CreateManager("mgr_m", ManagerPin);

            string[] callers = new string[] { OwnerId, m.Id, RootId };
            for (int i = 0; i < callers.Length; i++)
            {
                LoginAs(callers[i]);
                AssertDenied(delegate { SecurityService.UpdateUser(OwnerId, "x", "admin", false); }, "تعطيل المالك بواسطة " + callers[i]);
                AssertDenied(delegate { SecurityService.UpdateUser(OwnerId, "x", "cashier", true); }, "خفض المالك بواسطة " + callers[i]);
            }

            var owner = UserRepo.GetById(OwnerId);
            Assert.AreEqual("admin", owner.Role);
            Assert.IsTrue(owner.IsActive);
            Assert.AreNotEqual("x", owner.DisplayName);
        }

        [Test]
        public void OwnerCanDisableAndReenableManager_WithoutDisablingHisCashiers()
        {
            var m = CreateManager("mgr_n", ManagerPin);
            var c1 = CreateCashierBy(m.Id, "cash_n1");
            var c2 = CreateCashierBy(m.Id, "cash_n2");

            LoginAs(OwnerId);
            SecurityService.UpdateUser(m.Id, "مدير ن", "admin", false);

            Assert.IsFalse(UserRepo.GetById(m.Id).IsActive);
            Assert.IsTrue(UserRepo.GetById(c1.Id).IsActive, "تعطيل المدير لا يعطّل كاشيريته");
            Assert.IsTrue(UserRepo.GetById(c2.Id).IsActive);
            Assert.AreEqual(m.Id, UserRepo.GetById(c1.Id).ParentId, "ولا يغيّر تبعيتهم");
            Assert.IsFalse(SecurityService.Login("mgr_n", ManagerPin).Success, "المدير المعطّل لا يدخل");
            Assert.IsTrue(SecurityService.Login("cash_n1", StaffPin).Success, "كاشيريته يدخلون");

            LoginAs(OwnerId);
            SecurityService.UpdateUser(m.Id, "مدير ن", "admin", true);
            Assert.IsTrue(SecurityService.Login("mgr_n", ManagerPin).Success, "إعادة التفعيل تُرجع الدخول");
        }

        [Test]
        public void ManagerCannotDisableOrEnableAnotherManager_ButCanToggleHisOwnCashier()
        {
            var m1 = CreateManager("mgr_o1", ManagerPin);
            var m2 = CreateManager("mgr_o2", SecondManagerPin);
            var c = CreateCashierBy(m1.Id, "cash_o");

            LoginAs(m1.Id);
            Assert.Throws<UnauthorizedAccessException>(delegate { SecurityService.UpdateUser(m2.Id, "x", "admin", false); });
            Assert.IsTrue(UserRepo.GetById(m2.Id).IsActive, "المدير الآخر ما زال فعالاً");

            LoginAs(OwnerId);
            SecurityService.UpdateUser(m2.Id, "x", "admin", false);
            LoginAs(m1.Id);
            Assert.Throws<UnauthorizedAccessException>(delegate { SecurityService.UpdateUser(m2.Id, "x", "admin", true); }, "ولا يعيد تفعيل مدير");
            Assert.IsFalse(UserRepo.GetById(m2.Id).IsActive);

            SecurityService.UpdateUser(c.Id, "كاشير", "cashier", false);
            Assert.IsFalse(UserRepo.GetById(c.Id).IsActive);
            SecurityService.UpdateUser(c.Id, "كاشير", "cashier", true);
            Assert.IsTrue(UserRepo.GetById(c.Id).IsActive, "يعطّل ويفعّل كاشيره");
        }

        [Test]
        public void LegacyDelegatingCashier_Disable_StillCascadesToHisSubordinates()
        {
            LoginAs(OwnerId);
            var delegateUser = SecurityService.CreateSubUser(null, "deleg_a", "مفوَّض", null, StaffPin, "cashier", null, true, 2);
            Assert.IsTrue(delegateUser.CanDelegate, "المالك ما زال يستطيع إنشاء كاشير مفوِّض");

            LoginAs(delegateUser.Id);
            var child = SecurityService.CreateSubUser(null, "deleg_child", "تابع المفوَّض", null, StaffPin, "cashier", null, false, 0);
            Assert.AreEqual(delegateUser.Id, child.ParentId);

            LoginAs(OwnerId);
            SecurityService.UpdateUser(delegateUser.Id, "مفوَّض", "cashier", false);
            Assert.IsFalse(UserRepo.GetById(child.Id).IsActive, "التعطيل المتسلسل يبقى للكاشير المفوِّض القديم فقط");
        }

        // ---------- Promote / demote ----------

        [Test]
        public void OwnerPromotesCashierToManager_ReparentsToOwner_AndResetsPermissions()
        {
            var m1 = CreateManager("mgr_p1", ManagerPin);
            var c = CreateCashierBy(m1.Id, "cash_p");
            LoginAs(OwnerId);
            SecurityService.UpdateUserPermissions(c.Id, new Dictionary<string, bool> { { "pos.sell", false } });
            Assert.IsFalse(string.IsNullOrEmpty(UserRepo.GetById(c.Id).PermissionsJson), "شرط مسبق: صلاحيات مخصصة");
            Assert.AreEqual(m1.Id, UserRepo.GetById(c.Id).ParentId);

            SecurityService.UpdateUser(c.Id, "كاشير مُرقّى", "admin", true);

            var promoted = UserRepo.GetById(c.Id);
            Assert.AreEqual("admin", promoted.Role);
            Assert.AreEqual(OwnerId, promoted.ParentId, "المدير المُرقّى تحت المالك لا تحت مديره القديم");
            Assert.IsTrue(promoted.CanDelegate);
            Assert.GreaterOrEqual(promoted.MaxDepth, 1);
            Assert.IsTrue(string.IsNullOrEmpty(promoted.PermissionsJson), "تُصفَّر الصلاحيات المخصصة السابقة");
            Assert.AreEqual(SecurityService.TIER_MANAGER, SecurityService.Tier(promoted));

            var dto = SecurityService.MapToDto(promoted);
            Assert.IsFalse(dto.IsOwner);
            Assert.IsTrue(dto.Permissions["pos.sell"], "صلاحيات المدير الافتراضية");
            Assert.IsFalse(dto.Permissions["settings.restore"]);
            Assert.AreEqual(1, CountAudit("USER_ROLE_CHANGED"));
        }

        [Test]
        public void ManagerCannotPromoteACashierToManager()
        {
            var m = CreateManager("mgr_q", ManagerPin);
            var c = CreateCashierBy(m.Id, "cash_q");

            LoginAs(m.Id);
            Assert.Throws<UnauthorizedAccessException>(delegate { SecurityService.UpdateUser(c.Id, "x", "admin", true); });
            Assert.AreEqual("cashier", UserRepo.GetById(c.Id).Role);
            Assert.AreEqual(m.Id, UserRepo.GetById(c.Id).ParentId);
        }

        [Test]
        public void OwnerDemotesManager_ReparentsHisCashiersToOwner_AndStripsManagerData()
        {
            var m = CreateManager("mgr_r", ManagerPin);
            var c1 = CreateCashierBy(m.Id, "cash_r1");
            var c2 = CreateCashierBy(m.Id, "cash_r2");

            LoginAs(OwnerId);
            SecurityService.UpdateUser(m.Id, "مدير سابق", "cashier", true);

            var demoted = UserRepo.GetById(m.Id);
            Assert.AreEqual("cashier", demoted.Role);
            Assert.AreEqual(OwnerId, demoted.ParentId);
            Assert.IsFalse(demoted.CanDelegate);
            Assert.AreEqual(0, demoted.MaxDepth);
            Assert.IsTrue(string.IsNullOrEmpty(demoted.PermissionsJson));
            Assert.IsTrue(demoted.IsActive);
            Assert.AreEqual(SecurityService.TIER_CASHIER, SecurityService.Tier(demoted));

            Assert.AreEqual(OwnerId, UserRepo.GetById(c1.Id).ParentId, "كاشيرية المدير السابق انتقلوا للمالك");
            Assert.AreEqual(OwnerId, UserRepo.GetById(c2.Id).ParentId);
            Assert.IsTrue(UserRepo.GetById(c1.Id).IsActive, "ولم يتعطلوا");
            Assert.IsTrue(UserRepo.GetById(c2.Id).IsActive);
            Assert.AreEqual(1, CountAudit("USER_ROLE_CHANGED"));
        }

        [Test]
        public void DemotedManager_WithAStaleSession_LosesEveryManagerPower()
        {
            var m = CreateManager("mgr_s", ManagerPin);
            var c = CreateCashierBy(m.Id, "cash_s");

            LoginAs(m.Id);
            UserDto staleSession = SecurityService.CurrentUser;
            Assert.AreEqual("admin", staleSession.Role);

            LoginAs(OwnerId);
            SecurityService.UpdateUser(m.Id, "مدير سابق", "cashier", true);

            // The session object still says admin, but every authority check reads the stored role
            SecurityService.SetCurrentUserForTesting(staleSession);
            Assert.Throws<UnauthorizedAccessException>(delegate { SecurityService.UpdateUser(c.Id, "x", "cashier", true); });
            Assert.Throws<UnauthorizedAccessException>(delegate
            {
                SecurityService.CreateSubUser(null, "after_demote", "x", null, StaffPin, "cashier", null, false, 0);
            });
            Assert.IsNull(UserRepo.GetByUsername("after_demote"));
        }

        [Test]
        public void ManagerCannotDemoteAnotherManager()
        {
            var m1 = CreateManager("mgr_t1", ManagerPin);
            var m2 = CreateManager("mgr_t2", SecondManagerPin);

            LoginAs(m1.Id);
            Assert.Throws<UnauthorizedAccessException>(delegate { SecurityService.UpdateUser(m2.Id, "x", "cashier", true); });
            Assert.AreEqual("admin", UserRepo.GetById(m2.Id).Role);
        }

        [Test]
        public void PromotionToRootIsRefused_EvenForTheOwner()
        {
            var c = CreateCashierBy(OwnerId, "cash_u");
            LoginAs(OwnerId);
            Assert.Throws<UnauthorizedAccessException>(delegate { SecurityService.UpdateUser(c.Id, "x", "root", true); });
            Assert.AreEqual("cashier", UserRepo.GetById(c.Id).Role);
            Assert.Throws<UnauthorizedAccessException>(delegate
            {
                SecurityService.CreateSubUser(null, "evil_root", "x", null, StaffPin, "root", null, false, 0);
            });
            Assert.IsNull(UserRepo.GetByUsername("evil_root"));
        }

        // ---------- Startup healing ----------

        [Test]
        public void Startup_HealsLegacyAdmins_IntoManagersUnderTheOwner()
        {
            UserRepo.Insert(new User { Username = "legacy_a", DisplayName = "مدير قديم أ", Role = "admin", IsActive = true, CanDelegate = false, MaxDepth = 0, ParentId = SeedCashierId });
            UserRepo.Insert(new User { Username = "legacy_b", DisplayName = "مدير قديم ب", Role = "admin", IsActive = true, CanDelegate = false, MaxDepth = 0, ParentId = null });
            UserRepo.Insert(new User { Username = "legacy_c", DisplayName = "مدير قديم ج", Role = "admin", IsActive = true, CanDelegate = true, MaxDepth = 7, ParentId = RootId });

            RestartSecurityService();

            string[] names = new string[] { "legacy_a", "legacy_b", "legacy_c" };
            for (int i = 0; i < names.Length; i++)
            {
                var healed = UserRepo.GetByUsername(names[i]);
                Assert.IsTrue(healed.CanDelegate, names[i] + ": يملك إنشاء الكاشيرية");
                Assert.GreaterOrEqual(healed.MaxDepth, 1, names[i]);
                Assert.AreEqual(OwnerId, healed.ParentId, names[i] + ": تحت المالك");
                Assert.AreEqual(SecurityService.TIER_MANAGER, SecurityService.Tier(healed), names[i]);
            }

            // A manager who was healed can create a cashier right away
            LoginAs(UserRepo.GetByUsername("legacy_a").Id);
            var c = SecurityService.CreateSubUser(null, "cash_legacy", "x", null, StaffPin, "cashier", null, false, 0);
            Assert.AreEqual(UserRepo.GetByUsername("legacy_a").Id, c.ParentId);
        }

        [Test]
        public void Startup_RepairsOwnerDelegationAndDetachesHimFromTheDeveloper_WithoutTouchingCashiersOfManagers()
        {
            var m = CreateManager("mgr_v", ManagerPin);
            var c = CreateCashierBy(m.Id, "cash_v");
            Execute("UPDATE users SET can_delegate = 0, max_depth = 0, parent_id = @p WHERE id = @id;", "@p", RootId, "@id", OwnerId);
            Execute("UPDATE users SET parent_id = NULL WHERE id = @id;", "@id", SeedCashierId);

            RestartSecurityService();

            var owner = UserRepo.GetById(OwnerId);
            Assert.IsTrue(owner.CanDelegate);
            Assert.AreEqual(10, owner.MaxDepth);
            Assert.IsNull(owner.ParentId, "المالك لا يتبع حساب المطور");
            Assert.AreEqual(OwnerId, UserRepo.GetById(SeedCashierId).ParentId, "كاشير بلا أب يُربط بالمالك");
            Assert.AreEqual(m.Id, UserRepo.GetById(c.Id).ParentId, "كاشير المدير يبقى تحت مديره بعد إعادة التشغيل");
        }

        // ---------- Effective permissions ----------

        [Test]
        public void EffectivePermissions_ManagerLacksOnlyTheOwnerOnlyKeys_ComparedToOwner()
        {
            var m = CreateManager("mgr_w", ManagerPin);
            var c = CreateCashierBy(OwnerId, "cash_w");

            var owner = SecurityService.GetEffectivePermissions(UserRepo.GetById(OwnerId));
            var manager = SecurityService.GetEffectivePermissions(UserRepo.GetById(m.Id));
            var cashier = SecurityService.GetEffectivePermissions(UserRepo.GetById(c.Id));
            var root = SecurityService.GetEffectivePermissions(UserRepo.GetById(RootId));

            Assert.IsTrue(owner["settings.restore"]);
            Assert.IsTrue(owner["settings.license"]);
            Assert.IsFalse(manager["settings.restore"]);
            Assert.IsFalse(manager["settings.license"]);
            Assert.IsFalse(manager["system.updates"], "بلا منحة من المالك");
            Assert.IsTrue(owner["system.updates"]);
            Assert.IsTrue(root["system.updates"]);
            Assert.IsFalse(cashier["settings.restore"]);
            Assert.IsFalse(cashier["settings.license"]);
            Assert.IsTrue(root["settings.restore"]);
            Assert.IsTrue(root["settings.license"]);

            foreach (var kvp in owner)
            {
                if (kvp.Key == "settings.restore" || kvp.Key == "settings.license" || kvp.Key == "system.updates") continue;
                Assert.IsTrue(manager.ContainsKey(kvp.Key), "مفتاح ناقص للمدير: " + kvp.Key);
                Assert.AreEqual(kvp.Value, manager[kvp.Key], "المدير يطابق المالك في: " + kvp.Key);
            }

            Assert.IsTrue(manager["users.create"]);
            Assert.IsTrue(manager["users.deactivate"]);
            Assert.IsTrue(manager["settings.backup"]);
            Assert.IsTrue(manager["reports.profit"]);
            Assert.IsTrue(cashier["pos.sell"]);
            Assert.IsFalse(cashier["users.create"]);
        }

        [Test]
        public void HasPermission_OwnerOnlyKeys_AreDeniedToManagersAndCashiers_ByIdAndBySession()
        {
            // A manager WITHOUT an explicit owner grant (grants are covered by S50); cashiers can never hold these keys
            var m = CreateManager("mgr_x", ManagerPin);

            Assert.IsTrue(SecurityService.HasPermission(OwnerId, "settings.restore"));
            Assert.IsTrue(SecurityService.HasPermission(OwnerId, "settings.license"));
            Assert.IsTrue(SecurityService.HasPermission(OwnerId, "system.updates"));
            Assert.IsTrue(SecurityService.HasPermission(RootId, "settings.restore"));
            Assert.IsFalse(SecurityService.HasPermission(m.Id, "settings.restore"));
            Assert.IsFalse(SecurityService.HasPermission(m.Id, "settings.license"));
            Assert.IsFalse(SecurityService.HasPermission(m.Id, "system.updates"));
            Assert.IsFalse(SecurityService.HasPermission(SeedCashierId, "settings.restore"));
            Assert.IsFalse(SecurityService.HasPermission(SeedCashierId, "settings.license"));

            Assert.IsTrue(SecurityService.HasPermission(m.Id, "users.create"), "باقي صلاحيات المدير سليمة");
            Assert.IsTrue(SecurityService.HasPermission(m.Id, "settings.backup"));
            Assert.IsTrue(SecurityService.HasPermission(SeedCashierId, "pos.sell"));

            LoginAs(m.Id);
            Assert.IsFalse(SecurityService.HasPermission("settings.restore"), "بالجلسة الحالية: مدير");
            LoginAs(OwnerId);
            Assert.IsTrue(SecurityService.HasPermission("settings.restore"), "بالجلسة الحالية: مالك");
        }

        // ---------- DTO / tree ----------

        [Test]
        public void Dto_ExposesHasPinHasPasswordAndIsOwner()
        {
            LoginAs(OwnerId);
            var pwOnly = SecurityService.CreateSubUser(null, "pw_only", "كلمة فقط", "pass1234", null, "cashier", null, false, 0);
            var pinOnly = SecurityService.CreateSubUser(null, "pin_only", "رقم فقط", null, StaffPin, "cashier", null, false, 0);

            Assert.IsTrue(pwOnly.HasPassword);
            Assert.IsFalse(pwOnly.HasPin, "حساب بكلمة مرور فقط لا يملك رقماً سرياً");
            Assert.IsTrue(pinOnly.HasPin);
            Assert.IsFalse(pinOnly.HasPassword);

            var ownerDto = SecurityService.MapToDto(UserRepo.GetById(OwnerId));
            Assert.IsTrue(ownerDto.HasPin);
            Assert.IsTrue(ownerDto.IsOwner);
            Assert.IsFalse(SecurityService.MapToDto(UserRepo.GetById(RootId)).HasPin, "المطور بلا رقم ثابت");

            var all = SecurityService.GetAllUsers();
            int owners = 0;
            for (int i = 0; i < all.Count; i++)
            {
                if (all[i].IsOwner) owners++;
            }
            Assert.AreEqual(1, owners, "مالك واحد فقط في القائمة");
        }

        [Test]
        public void UserTree_ListsManagersBeforeCashiers_AndNestsCashiersUnderTheirManager()
        {
            var m = CreateManager("mgr_y", ManagerPin);
            var underManager = CreateCashierBy(m.Id, "cash_y1");
            var underOwner = CreateCashierBy(OwnerId, "cash_y2");

            LoginAs(OwnerId);
            var tree = SecurityService.GetUserTree();

            int rootIndex = -1;
            int ownerIndex = -1;
            UserDto ownerNode = null;
            for (int i = 0; i < tree.Count; i++)
            {
                if (tree[i].Role == "root") rootIndex = i;
                if (tree[i].Id == OwnerId) { ownerIndex = i; ownerNode = tree[i]; }
            }
            Assert.IsNotNull(ownerNode, "المالك جذر الشجرة");
            Assert.GreaterOrEqual(rootIndex, 0, "حساب المطور ظاهر في الشجرة");
            Assert.Greater(ownerIndex, rootIndex, "حساب المطور يسبق المالك");

            bool seenCashier = false;
            bool managerFound = false;
            for (int i = 0; i < ownerNode.Children.Count; i++)
            {
                var child = ownerNode.Children[i];
                if (child.Role == "admin")
                {
                    Assert.IsFalse(seenCashier, "المديرون قبل الكاشيرية");
                    if (child.Id == m.Id) managerFound = true;
                }
                else
                {
                    seenCashier = true;
                }
            }
            Assert.IsTrue(managerFound, "المدير تحت المالك");

            UserDto managerNode = null;
            bool ownerOwnsCashier = false;
            for (int i = 0; i < ownerNode.Children.Count; i++)
            {
                if (ownerNode.Children[i].Id == m.Id) managerNode = ownerNode.Children[i];
                if (ownerNode.Children[i].Id == underOwner.Id) ownerOwnsCashier = true;
            }
            Assert.IsTrue(ownerOwnsCashier);
            Assert.AreEqual(1, managerNode.Children.Count, "كاشير المدير داخل فرع المدير فقط");
            Assert.AreEqual(underManager.Id, managerNode.Children[0].Id);
        }

        // ---------- Cashier has no management power ----------

        [Test]
        public void Cashier_CannotUpdateOrResetOtherAccounts()
        {
            var other = CreateCashierBy(OwnerId, "cash_z");
            LoginAs(SeedCashierId);

            Assert.Throws<UnauthorizedAccessException>(delegate { SecurityService.UpdateUser(other.Id, "x", "cashier", true); });
            Assert.Throws<UnauthorizedAccessException>(delegate { SecurityService.UpdateUser(OwnerId, "x", "admin", true); });
            Assert.Throws<UnauthorizedAccessException>(delegate { SecurityService.SetUserPassword(other.Id, "abcd1234", null); });
            AssertDenied(delegate { SecurityService.UpdateUserPermissions(other.Id, new Dictionary<string, bool>()); }, "صلاحيات غيره");
            Assert.AreNotEqual("x", UserRepo.GetById(other.Id).DisplayName);
        }
    }
}
