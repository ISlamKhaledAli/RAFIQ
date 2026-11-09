using System;
using System.Collections.Generic;
using NUnit.Framework;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    /// <summary>
    /// حذف الموظف حذفاً ناعماً (هجرة 63: users.deleted_at): الحساب يختفي من الدخول والقوائم ويتحرر اسم الدخول،
    /// أما الصف نفسه فيبقى كي تظل المبيعات والورديات وسجل المراجعة تحل اسم صاحبها.
    /// </summary>
    [TestFixture]
    [NonParallelizable]
    public class S45_UserSoftDeleteTest : S44_UserHierarchyFixtureBase
    {
        private string SellAs(UserDto cashier, string shiftId, Product product)
        {
            return SaleRepo.CreateSaleAtomic(new Sale
            {
                CashierId = cashier.Id,
                CashierName = cashier.DisplayName,
                ShiftId = shiftId,
                SubtotalPiasters = 1500,
                TotalPiasters = 1500,
                PaidPiasters = 1500,
                PaymentMethod = "cash",
                Status = "completed",
                Items = new List<SaleItem>
                {
                    new SaleItem { ProductId = product.Id, ProductName = product.Name, QuantityMilli = 1000, UnitPricePiasters = 1500, TotalPiasters = 1500, UnitCostPiasters = 1000 }
                }
            }).Id;
        }

        // ---------- Happy path: the account disappears from every live view ----------

        [Test]
        public void OwnerDeletesCashier_LoginBlocked_AndAccountAbsentFromEveryLiveListing()
        {
            var c = CreateCashierBy(OwnerId, "cash_sd1");
            Assert.IsTrue(SecurityService.Login("cash_sd1", StaffPin).Success, "شرط مسبق: الحساب يدخل قبل الحذف");

            LoginAs(OwnerId);
            Assert.IsTrue(ContainsDtoId(SecurityService.GetAllUsers(), c.Id), "شرط مسبق: المالك يرى كاشيره قبل الحذف");
            Assert.IsTrue(SecurityService.DeleteUser(c.Id));

            Assert.IsNull(UserRepo.GetById(c.Id), "GetById لا يرى المحذوف");
            Assert.IsNull(UserRepo.GetByUsername("cash_sd1"), "ولا GetByUsername");
            Assert.IsFalse(ContainsId(UserRepo.GetAll(false), c.Id), "ولا GetAll");
            Assert.IsFalse(ContainsId(UserRepo.GetAll(true), c.Id), "ولا GetAll(onlyActive)");
            Assert.IsFalse(ContainsDtoId(SecurityService.GetAllUsers(), c.Id), "ولا قائمة الموظفين");
            Assert.IsFalse(ContainsDtoId(SecurityService.GetActiveUsers(), c.Id), "ولا قائمة شاشة الدخول");
            Assert.IsFalse(ContainsDtoId(FlattenTree(SecurityService.GetUserTree()), c.Id), "ولا الشجرة");

            Assert.IsFalse(SecurityService.Login("cash_sd1", StaffPin).Success, "الدخول باسم الدخول القديم مرفوض");
            Assert.IsFalse(SecurityService.Login(c.Id, StaffPin).Success, "والدخول بالمعرّف مرفوض");
            string renamed = ScalarText("SELECT username FROM users WHERE id = @id;", "@id", c.Id);
            Assert.IsFalse(SecurityService.Login(renamed, StaffPin).Success, "وبالاسم الذي أعيدت تسميته مرفوض");
        }

        [Test]
        public void SoftDelete_WipesCredentials_RenamesUsername_AndKeepsTheRowForHistory()
        {
            var c = CreateCashierBy(OwnerId, "cash_sd2");
            Execute("UPDATE users SET password_hash = 'x', password_salt = 'y', failed_attempts = 3, must_change_pin = 1 WHERE id = @id;", "@id", c.Id);

            LoginAs(OwnerId);
            SecurityService.DeleteUser(c.Id);

            Assert.IsFalse(string.IsNullOrEmpty(ScalarText("SELECT deleted_at FROM users WHERE id = @id;", "@id", c.Id)), "deleted_at مضبوط");
            Assert.AreEqual(0, Scalar("SELECT is_active FROM users WHERE id = @id;", "@id", c.Id));
            Assert.IsTrue(string.IsNullOrEmpty(ScalarText("SELECT pin_code_hash FROM users WHERE id = @id;", "@id", c.Id)), "الرقم السري ممسوح");
            Assert.IsTrue(string.IsNullOrEmpty(ScalarText("SELECT pin_salt FROM users WHERE id = @id;", "@id", c.Id)));
            Assert.IsTrue(string.IsNullOrEmpty(ScalarText("SELECT password_hash FROM users WHERE id = @id;", "@id", c.Id)), "كلمة المرور ممسوحة");
            Assert.IsTrue(string.IsNullOrEmpty(ScalarText("SELECT password_salt FROM users WHERE id = @id;", "@id", c.Id)));
            Assert.AreEqual(0, Scalar("SELECT failed_attempts FROM users WHERE id = @id;", "@id", c.Id));
            Assert.AreEqual(0, Scalar("SELECT must_change_pin FROM users WHERE id = @id;", "@id", c.Id));

            string expectedName = "cash_sd2#del" + c.Id.Substring(4);
            Assert.AreEqual(expectedName, ScalarText("SELECT username FROM users WHERE id = @id;", "@id", c.Id), "اسم الدخول يُحرَّر بإضافة لاحقة");

            var ghost = UserRepo.GetByIdIncludingDeleted(c.Id);
            Assert.IsNotNull(ghost, "الصف باقٍ لسجل التاريخ");
            Assert.AreEqual(c.DisplayName, ghost.DisplayName);
            Assert.IsFalse(ghost.IsActive);
        }

        [Test]
        public void SoftDelete_FreesTheUsername_ForANewAccountWithItsOwnIdentity()
        {
            var old = CreateCashierBy(OwnerId, "cash_sd3");
            LoginAs(OwnerId);
            SecurityService.DeleteUser(old.Id);

            var fresh = SecurityService.CreateSubUser(null, "cash_sd3", "كاشير جديد بنفس الاسم", null, "3957", "cashier", null, false, 0);

            Assert.AreNotEqual(old.Id, fresh.Id);
            Assert.AreEqual("cash_sd3", fresh.Username);
            var login = SecurityService.Login("cash_sd3", "3957");
            Assert.IsTrue(login.Success, "الاسم المُعاد استخدامه يدخل بالرقم الجديد");
            Assert.AreEqual(fresh.Id, login.User.Id, "الدخول يصل للحساب الجديد لا القديم");
            Assert.IsFalse(SecurityService.Login("cash_sd3", StaffPin).Success, "الرقم القديم لا يعمل");
            Assert.IsNotNull(UserRepo.GetByIdIncludingDeleted(old.Id), "الحساب القديم باقٍ كسجل");
            Assert.IsNull(UserRepo.GetById(old.Id));
        }

        [Test]
        public void SoftDelete_LeavesSalesAndShiftHistoryUntouched_AndTheNameStillResolves()
        {
            var c = CreateCashierBy(OwnerId, "cash_sd4");
            var product = CreateTestProduct("صنف سجل المبيعات", 1500, 1000, 100000);
            var shift = OpenTestShift(c.Id, c.DisplayName, 50000);
            string saleId = SellAs(c, shift.Id, product);
            ShiftService.CloseShift(new CloseShiftRequest { ShiftId = shift.Id, ActualCashPiasters = 51500 });

            long salesBefore = Scalar("SELECT COUNT(*) FROM sales;");
            long shiftsBefore = Scalar("SELECT COUNT(*) FROM shifts;");
            long saleTotalBefore = Scalar("SELECT total_piasters FROM sales WHERE id = @id;", "@id", saleId);

            LoginAs(OwnerId);
            Assert.IsTrue(SecurityService.DeleteUser(c.Id), "لا وردية مفتوحة: الحذف مسموح");

            Assert.AreEqual(salesBefore, Scalar("SELECT COUNT(*) FROM sales;"));
            Assert.AreEqual(shiftsBefore, Scalar("SELECT COUNT(*) FROM shifts;"));
            Assert.AreEqual(saleTotalBefore, Scalar("SELECT total_piasters FROM sales WHERE id = @id;", "@id", saleId));
            Assert.AreEqual(c.Id, ScalarText("SELECT cashier_id FROM sales WHERE id = @id;", "@id", saleId), "الفاتورة ما زالت منسوبة لصاحبها");
            Assert.AreEqual(1, Scalar("SELECT COUNT(*) FROM shifts WHERE id = @id AND cashier_id = @c AND status = 'closed';", "@id", shift.Id, "@c", c.Id), "الوردية المغلقة كما هي");
            Assert.AreEqual(c.DisplayName, SaleRepo.GetSaleById(saleId).CashierName, "سجل الفواتير يعرض اسم الكاشير المحذوف لا اسماً بديلاً");
            Assert.AreEqual(c.DisplayName, UserRepo.GetByIdIncludingDeleted(c.Id).DisplayName);
        }

        [Test]
        public void DeleteUser_IsBlockedWhileAShiftIsOpen_ThenAllowedAfterItIsClosed()
        {
            var c = CreateCashierBy(OwnerId, "cash_sd5");
            var shift = OpenTestShift(c.Id, c.DisplayName, 50000);

            LoginAs(OwnerId);
            Assert.Throws<InvalidOperationException>(delegate { SecurityService.DeleteUser(c.Id); });
            var ipc = Dispatch("users:delete", new { id = c.Id });
            Assert.IsFalse(ipc.Success);
            Assert.AreEqual("USER_DELETE_ERROR", ErrorCode(ipc));

            var stillThere = UserRepo.GetById(c.Id);
            Assert.IsNotNull(stillThere, "الحساب لم يُحذف");
            Assert.IsTrue(stillThere.IsActive);
            Assert.AreEqual("cash_sd5", stillThere.Username);
            Assert.AreEqual(0, CountAudit("USER_DELETED"), "لا تدقيق لحذف لم يحدث");

            ShiftService.CloseShift(new CloseShiftRequest { ShiftId = shift.Id, ActualCashPiasters = 50000 });
            Assert.IsTrue(SecurityService.DeleteUser(c.Id), "بعد إغلاق الوردية يُسمح بالحذف");
            Assert.IsNull(UserRepo.GetById(c.Id));
        }

        // ---------- Refusals ----------

        [Test]
        public void DeleteUser_IsRefused_ForSelf_Owner_AndDeveloperRoot()
        {
            var m = CreateManager("mgr_sd6", ManagerPin);

            LoginAs(m.Id);
            Assert.Throws<InvalidOperationException>(delegate { SecurityService.DeleteUser(m.Id); }, "لا يحذف نفسه");
            AssertDenied(delegate { SecurityService.DeleteUser(OwnerId); }, "المدير يحذف المالك");
            AssertDenied(delegate { SecurityService.DeleteUser(RootId); }, "المدير يحذف المطور");

            LoginAs(OwnerId);
            Assert.Throws<InvalidOperationException>(delegate { SecurityService.DeleteUser(OwnerId); }, "المالك لا يحذف نفسه");
            Assert.Throws<InvalidOperationException>(delegate { SecurityService.DeleteUser(RootId); }, "ولا المطور");

            LoginAs(RootId);
            Assert.Throws<InvalidOperationException>(delegate { SecurityService.DeleteUser(OwnerId); }, "حتى المطور لا يحذف المالك");

            Assert.AreEqual(0, Scalar("SELECT COUNT(*) FROM users WHERE deleted_at IS NOT NULL;"), "لم يُحذف أي حساب");
            Assert.IsNotNull(UserRepo.GetById(OwnerId));
            Assert.IsNotNull(UserRepo.GetById(RootId));
            Assert.IsNotNull(UserRepo.GetById(m.Id));
            Assert.AreEqual(0, CountAudit("USER_DELETED"));
        }

        [Test]
        public void ManagerCannotDeleteAnotherManager_AndCashierOrAnonymousCannotDeleteAnyone()
        {
            var m1 = CreateManager("mgr_sd7a", ManagerPin);
            var m2 = CreateManager("mgr_sd7b", SecondManagerPin);
            var c1 = CreateCashierBy(m1.Id, "cash_sd7a");
            var c2 = CreateCashierBy(m1.Id, "cash_sd7b");

            LoginAs(m1.Id);
            Assert.Throws<UnauthorizedAccessException>(delegate { SecurityService.DeleteUser(m2.Id); }, "مدير يحذف مديراً");
            Assert.IsNotNull(UserRepo.GetById(m2.Id));

            LoginAs(c1.Id);
            Assert.Throws<UnauthorizedAccessException>(delegate { SecurityService.DeleteUser(c2.Id); }, "كاشير يحذف زميلاً");
            Assert.Throws<UnauthorizedAccessException>(delegate { SecurityService.DeleteUser(m1.Id); }, "كاشير يحذف مديراً");

            Logout();
            Assert.Throws<UnauthorizedAccessException>(delegate { SecurityService.DeleteUser(c2.Id); }, "بدون جلسة");
            Assert.IsNotNull(UserRepo.GetById(c2.Id));
            Assert.AreEqual(0, Scalar("SELECT COUNT(*) FROM users WHERE deleted_at IS NOT NULL;"));
        }

        [Test]
        public void ManagerCanDeleteHisCashier()
        {
            var m = CreateManager("mgr_sd8", ManagerPin);
            var c = CreateCashierBy(m.Id, "cash_sd8");

            LoginAs(m.Id);
            Assert.IsTrue(SecurityService.DeleteUser(c.Id));
            Assert.IsNull(UserRepo.GetById(c.Id));
            Assert.AreEqual(1, CountAudit("USER_DELETED"));
        }

        [Test]
        public void DeleteUser_RejectsUnknownEmptyAndAlreadyDeletedIds()
        {
            var c = CreateCashierBy(OwnerId, "cash_sd9");
            LoginAs(OwnerId);

            Assert.Throws<ArgumentException>(delegate { SecurityService.DeleteUser("usr_does_not_exist"); });
            Assert.Throws<ArgumentException>(delegate { SecurityService.DeleteUser(""); });
            Assert.Throws<ArgumentException>(delegate { SecurityService.DeleteUser(null); });

            Assert.IsTrue(SecurityService.DeleteUser(c.Id));
            Assert.Throws<ArgumentException>(delegate { SecurityService.DeleteUser(c.Id); }, "الحذف مرتين لا يكرر شيئاً");
            Assert.AreEqual(1, CountAudit("USER_DELETED"), "تسجيل واحد فقط");
        }

        [Test]
        public void DeletedAccount_CannotBeManagedOrUsedAsParent_AnyMore()
        {
            var c = CreateCashierBy(OwnerId, "cash_sd10");
            LoginAs(OwnerId);
            SecurityService.DeleteUser(c.Id);

            Assert.Throws<ArgumentException>(delegate { SecurityService.UpdateUser(c.Id, "x", "cashier", true); });
            Assert.Throws<ArgumentException>(delegate { SecurityService.SetUserPassword(c.Id, "abcd1234", null); });
            Assert.Throws<ArgumentException>(delegate { SecurityService.ChangeUserPinSecure(c.Id, "2846", null, null); });
            Assert.Throws<ArgumentException>(delegate { SecurityService.UpdateUserPermissions(c.Id, new Dictionary<string, bool>()); });
            Assert.Throws<ArgumentException>(delegate
            {
                SecurityService.CreateSubUser(c.Id, "under_deleted", "x", null, StaffPin, "cashier", null, false, 0);
            });
            Assert.IsNull(UserRepo.GetByUsername("under_deleted"));
            Assert.IsFalse(SecurityService.VerifyUserPin(c.Id, StaffPin), "الرقم السري القديم لا يتحقق");

            // The repository never revives a deleted row either
            var ghost = UserRepo.GetByIdIncludingDeleted(c.Id);
            ghost.IsActive = true;
            ghost.DisplayName = "محاولة إحياء";
            UserRepo.Update(ghost);
            Assert.AreEqual(0, Scalar("SELECT is_active FROM users WHERE id = @id;", "@id", c.Id));
            Assert.AreEqual(c.DisplayName, UserRepo.GetByIdIncludingDeleted(c.Id).DisplayName);
            Assert.IsNull(UserRepo.GetById(c.Id));
        }

        // ---------- Subordinates ----------

        [Test]
        public void OwnerDeletesManager_CashiersMoveToOwnerAndStayActive_AndAuditNamesTheOriginalUsername()
        {
            var m = CreateManager("mgr_sd11", ManagerPin);
            var c1 = CreateCashierBy(m.Id, "cash_sd11a");
            var c2 = CreateCashierBy(m.Id, "cash_sd11b");
            int adminsBefore = UserRepo.GetActiveAdminCount();

            LoginAs(OwnerId);
            Assert.IsTrue(SecurityService.DeleteUser(m.Id));

            Assert.AreEqual(OwnerId, UserRepo.GetById(c1.Id).ParentId, "كاشيرية المدير المحذوف انتقلوا للمالك");
            Assert.AreEqual(OwnerId, UserRepo.GetById(c2.Id).ParentId);
            Assert.IsTrue(UserRepo.GetById(c1.Id).IsActive, "ولم يتعطلوا");
            Assert.IsTrue(UserRepo.GetById(c2.Id).IsActive);
            Assert.IsTrue(SecurityService.Login("cash_sd11a", StaffPin).Success, "ويستطيعون الدخول");
            Assert.IsFalse(UserRepo.HasChildren(m.Id));
            Assert.AreEqual(0, UserRepo.GetByParentId(m.Id).Count);
            Assert.AreEqual(adminsBefore - 1, UserRepo.GetActiveAdminCount(), "المدير المحذوف لا يُحسب مديراً نشطاً");

            Assert.AreEqual(1, CountAudit("USER_DELETED"));
            Assert.AreEqual(1, Scalar("SELECT COUNT(*) FROM audit_logs WHERE action = 'USER_DELETED' AND entity_id = @e;", "@e", "mgr_sd11"),
                "التدقيق يحمل اسم الدخول الأصلي لا المُعاد تسميته");
            Assert.AreEqual(OwnerId, ScalarText("SELECT user_id FROM audit_logs WHERE action = 'USER_DELETED' LIMIT 1;"), "ومن نفّذ الحذف");
        }

        [Test]
        public void DeletingADelegatingCashier_MovesHisSubordinatesToHisOwnParent_WithoutDisablingThem()
        {
            var m = CreateManager("mgr_sd12", ManagerPin);
            LoginAs(OwnerId);
            var delegateUser = SecurityService.CreateSubUser(m.Id, "deleg_sd12", "مفوَّض", null, StaffPin, "cashier", null, false, 0);
            // Legacy data: a delegating cashier that sits under a manager
            Execute("UPDATE users SET can_delegate = 1, max_depth = 2 WHERE id = @id;", "@id", delegateUser.Id);
            LoginAs(delegateUser.Id);
            var child = SecurityService.CreateSubUser(null, "child_sd12", "تابع", null, StaffPin, "cashier", null, false, 0);
            Assert.AreEqual(delegateUser.Id, child.ParentId);

            LoginAs(OwnerId);
            Assert.IsTrue(SecurityService.DeleteUser(delegateUser.Id));

            Assert.AreEqual(m.Id, UserRepo.GetById(child.Id).ParentId, "التابع يرتبط بأب المحذوف");
            Assert.IsTrue(UserRepo.GetById(child.Id).IsActive, "الحذف لا يعطّل التابعين");
        }

        // ---------- Repository level ----------

        [Test]
        public void Repo_SoftDelete_ReturnsFalseForMissingOrRepeated_AndBuildsTheSuffixFromTheId()
        {
            UserRepo.Insert(new User { Id = "usr_abcdef1234567890", Username = "repo_one", DisplayName = "أول", Role = "cashier", IsActive = true, PinCodeHash = "h", PinSalt = "s" });
            UserRepo.Insert(new User { Id = "ab1", Username = "repo_two", DisplayName = "ثان", Role = "cashier", IsActive = true, PinCodeHash = "h", PinSalt = "s" });
            UserRepo.Insert(new User { Id = "abcdefghijkl", Username = "repo_three", DisplayName = "ثالث", Role = "cashier", IsActive = true, PinCodeHash = "h", PinSalt = "s" });

            Assert.IsTrue(UserRepo.SoftDelete("usr_abcdef1234567890", null));
            Assert.IsFalse(UserRepo.SoftDelete("usr_abcdef1234567890", null), "المحذوف لا يُحذف مرة ثانية");
            Assert.IsFalse(UserRepo.SoftDelete("usr_missing", null), "غير الموجود");
            Assert.IsTrue(UserRepo.SoftDelete("ab1", null));
            Assert.IsTrue(UserRepo.SoftDelete("abcdefghijkl", null));
            Assert.Throws<ArgumentException>(delegate { UserRepo.SoftDelete("", null); });
            Assert.Throws<ArgumentException>(delegate { UserRepo.SoftDelete(null, null); });

            Assert.AreEqual("repo_one#delabcdef1234567890", ScalarText("SELECT username FROM users WHERE id = @id;", "@id", "usr_abcdef1234567890"), "يُحذف usr_ ثم يُلحق باقي المعرّف كاملاً");
            Assert.AreEqual("repo_two#delab1", ScalarText("SELECT username FROM users WHERE id = @id;", "@id", "ab1"), "معرّف قصير كما هو");
            Assert.AreEqual("repo_three#delabcdefghijkl", ScalarText("SELECT username FROM users WHERE id = @id;", "@id", "abcdefghijkl"), "ومعرّف بلا بادئة usr_ كاملاً");
            Assert.IsNull(UserRepo.GetByUsername("repo_one"));
        }

        [Test]
        public void Repo_SoftDelete_MovesChildrenToTheNewParent_AndDeletedChildrenLeaveTheParentCounts()
        {
            UserRepo.Insert(new User { Id = "usr_parent_x", Username = "repo_parent", DisplayName = "أب", Role = "cashier", IsActive = true, PinCodeHash = "h", PinSalt = "s" });
            UserRepo.Insert(new User { Id = "usr_child_x", Username = "repo_child", DisplayName = "ابن", Role = "cashier", IsActive = true, PinCodeHash = "h", PinSalt = "s", ParentId = "usr_parent_x" });
            Assert.IsTrue(UserRepo.HasChildren("usr_parent_x"));
            Assert.AreEqual(1, UserRepo.GetByParentId("usr_parent_x").Count);

            Assert.IsTrue(UserRepo.SoftDelete("usr_child_x", null));
            Assert.IsFalse(UserRepo.HasChildren("usr_parent_x"), "الابن المحذوف لا يُحسب");
            Assert.AreEqual(0, UserRepo.GetByParentId("usr_parent_x").Count);

            UserRepo.Insert(new User { Id = "usr_child_y", Username = "repo_child2", DisplayName = "ابن2", Role = "cashier", IsActive = true, PinCodeHash = "h", PinSalt = "s", ParentId = "usr_parent_x" });
            Assert.IsTrue(UserRepo.SoftDelete("usr_parent_x", OwnerId));
            Assert.AreEqual(OwnerId, UserRepo.GetById("usr_child_y").ParentId, "الأبناء ينتقلون للأب الجديد في نفس العملية");
            Assert.IsTrue(UserRepo.GetById("usr_child_y").IsActive);
        }

        [Test]
        public void ActiveAdminCount_ExcludesDeletedAndDisabledAdmins()
        {
            int baseline = UserRepo.GetActiveAdminCount();
            int rootsBaseline = UserRepo.GetActiveRootCount();
            Assert.AreEqual(1, rootsBaseline, "حساب المطور فعال");

            var m1 = CreateManager("mgr_sd13a", ManagerPin);
            var m2 = CreateManager("mgr_sd13b", SecondManagerPin);
            Assert.AreEqual(baseline + 2, UserRepo.GetActiveAdminCount());

            LoginAs(OwnerId);
            SecurityService.UpdateUser(m1.Id, "x", "admin", false);
            Assert.AreEqual(baseline + 1, UserRepo.GetActiveAdminCount(), "المعطّل لا يُحسب");

            SecurityService.DeleteUser(m2.Id);
            Assert.AreEqual(baseline, UserRepo.GetActiveAdminCount(), "المحذوف لا يُحسب");
            SecurityService.DeleteUser(m1.Id);
            Assert.AreEqual(baseline, UserRepo.GetActiveAdminCount(), "حذف مدير معطّل لا يغيّر العدد");
            Assert.AreEqual(rootsBaseline, UserRepo.GetActiveRootCount());
        }

        // ---------- IPC: users:delete is mapped to users.deactivate ----------

        [Test]
        public void UsersDeleteIpc_RequiresTheDeactivatePermission_AndHonoursTheTierRules()
        {
            var m1 = CreateManager("mgr_sd14a", ManagerPin);
            var m2 = CreateManager("mgr_sd14b", SecondManagerPin);
            var c1 = CreateCashierBy(m1.Id, "cash_sd14a");
            var c2 = CreateCashierBy(m1.Id, "cash_sd14b");

            LoginAs(c1.Id);
            var forbidden = Dispatch("users:delete", new { id = c2.Id });
            Assert.AreEqual("FORBIDDEN", ErrorCode(forbidden), "الكاشير لا يملك users.deactivate");
            Assert.IsNotNull(UserRepo.GetById(c2.Id));

            LoginAs(m1.Id);
            var mgrOnMgr = Dispatch("users:delete", new { id = m2.Id });
            Assert.AreEqual("USER_DELETE_ERROR", ErrorCode(mgrOnMgr), "المدير يمر البوابة لكن قاعدة المستويات ترفض");
            Assert.IsNotNull(UserRepo.GetById(m2.Id));
            var self = Dispatch("users:delete", new { id = m1.Id });
            Assert.AreEqual("USER_DELETE_ERROR", ErrorCode(self));
            var alias = Dispatch("users:delete", new { userId = c2.Id });
            Assert.IsTrue(alias.Success, Describe(alias));
            Assert.IsNull(UserRepo.GetById(c2.Id));

            LoginAs(OwnerId);
            var ownerDeletesManager = Dispatch("users:delete", new { id = m2.Id });
            Assert.IsTrue(ownerDeletesManager.Success, Describe(ownerDeletesManager));
            var ownerDeletesSelf = Dispatch("users:delete", new { id = OwnerId });
            Assert.AreEqual("USER_DELETE_ERROR", ErrorCode(ownerDeletesSelf));

            var all = Dispatch("users:getAll", null);
            Assert.IsTrue(all.Success, Describe(all));
            var list = (List<UserDto>)all.Data;
            Assert.IsFalse(ContainsDtoId(list, c2.Id), "المحذوف غائب عن users:getAll");
            Assert.IsFalse(ContainsDtoId(list, m2.Id));
            Assert.IsTrue(ContainsDtoId(list, m1.Id));
            Assert.IsFalse(ContainsDtoId(list, OwnerId), "المالك لا يظهر لنفسه في قائمة الموظفين");
        }

        // ---------- helpers ----------

        private static bool ContainsId(List<User> users, string id)
        {
            for (int i = 0; i < users.Count; i++)
            {
                if (users[i].Id == id) return true;
            }
            return false;
        }

        private static bool ContainsDtoId(List<UserDto> users, string id)
        {
            for (int i = 0; i < users.Count; i++)
            {
                if (users[i].Id == id) return true;
            }
            return false;
        }

        private static List<UserDto> FlattenTree(List<UserDto> nodes)
        {
            var flat = new List<UserDto>();
            for (int i = 0; i < nodes.Count; i++)
            {
                flat.Add(nodes[i]);
                if (nodes[i].Children != null) flat.AddRange(FlattenTree(nodes[i].Children));
            }
            return flat;
        }
    }
}
