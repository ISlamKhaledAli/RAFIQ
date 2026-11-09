using System.Collections.Generic;
using NUnit.Framework;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    /// <summary>
    /// قائمة الموظفين وشجرتهم: كل حساب يرى فقط من هم أدنى من مستواه بالضبط (لا نفسه ولا مستواه ولا ما فوقه)،
    /// والكاشير المفوِّض يرى تابعيه فقط، وبلا جلسة لا يرى أحداً.
    /// </summary>
    [TestFixture]
    [NonParallelizable]
    public class S68_StaffListVisibilityTest : S44_UserHierarchyFixtureBase
    {
        private UserDto _m1;
        private UserDto _m2;
        private UserDto _cashierOfOwner;
        private UserDto _cashierOfM1;
        private UserDto _cashierOfM2;

        [SetUp]
        public void StaffVisibilitySetUp()
        {
            _m1 = CreateManager("mgr_sv1", ManagerPin);
            _m2 = CreateManager("mgr_sv2", SecondManagerPin);
            _cashierOfOwner = CreateCashierBy(OwnerId, "cash_sv_o");
            _cashierOfM1 = CreateCashierBy(_m1.Id, "cash_sv_1");
            _cashierOfM2 = CreateCashierBy(_m2.Id, "cash_sv_2");
        }

        private static bool Has(List<UserDto> list, string id)
        {
            for (int i = 0; i < list.Count; i++)
            {
                if (list[i].Id == id) return true;
            }
            return false;
        }

        private static List<UserDto> Flatten(List<UserDto> nodes)
        {
            var flat = new List<UserDto>();
            for (int i = 0; i < nodes.Count; i++)
            {
                flat.Add(nodes[i]);
                if (nodes[i].Children != null) flat.AddRange(Flatten(nodes[i].Children));
            }
            return flat;
        }

        [Test]
        public void Owner_SeesManagersAndCashiers_ButNeitherRootNorHimself()
        {
            LoginAs(OwnerId);
            var list = SecurityService.GetAllUsers();

            Assert.IsTrue(Has(list, _m1.Id));
            Assert.IsTrue(Has(list, _m2.Id));
            Assert.IsTrue(Has(list, _cashierOfOwner.Id));
            Assert.IsTrue(Has(list, _cashierOfM1.Id));
            Assert.IsTrue(Has(list, _cashierOfM2.Id));
            Assert.IsFalse(Has(list, OwnerId), "المالك لا يرى نفسه");
            Assert.IsFalse(Has(list, RootId), "المالك لا يرى المطور");
        }

        [Test]
        public void Manager_SeesCashiersOnly_NotOwnerNotOtherManagerNotHimselfNotRoot()
        {
            LoginAs(_m1.Id);
            var list = SecurityService.GetAllUsers();

            Assert.IsTrue(Has(list, _cashierOfM1.Id));
            Assert.IsTrue(Has(list, _cashierOfM2.Id), "المستوى الأدنى كله ظاهر ولو كان تحت مدير آخر");
            Assert.IsFalse(Has(list, OwnerId), "المدير لا يرى المالك");
            Assert.IsFalse(Has(list, _m2.Id), "المدير لا يرى مديراً بمستواه");
            Assert.IsFalse(Has(list, _m1.Id), "المدير لا يرى نفسه");
            Assert.IsFalse(Has(list, RootId));
            for (int i = 0; i < list.Count; i++)
            {
                Assert.AreEqual(SecurityService.TIER_CASHIER, SecurityService.TierOf(list[i].Id, list[i].Username, list[i].Role));
            }
        }

        [Test]
        public void Root_SeesOwnerManagersAndCashiers_ButNotHimself()
        {
            LoginAs(RootId);
            var list = SecurityService.GetAllUsers();

            Assert.IsTrue(Has(list, OwnerId));
            Assert.IsTrue(Has(list, _m1.Id));
            Assert.IsTrue(Has(list, _m2.Id));
            Assert.IsTrue(Has(list, _cashierOfOwner.Id));
            Assert.IsTrue(Has(list, _cashierOfM1.Id));
            Assert.IsFalse(Has(list, RootId), "المطور لا يرى نفسه");
            for (int i = 0; i < list.Count; i++)
            {
                Assert.AreNotEqual("root", list[i].Role, "ولا أي حساب مطور آخر");
            }
        }

        [Test]
        public void DelegatingCashier_SeesOnlyHisOwnDescendants_AtAnyDepth()
        {
            LoginAs(OwnerId);
            var delegateUser = SecurityService.CreateSubUser(_m1.Id, "deleg_sv", "مفوَّض", null, StaffPin, "cashier", null, false, 0);
            Execute("UPDATE users SET can_delegate = 1, max_depth = 3 WHERE id = @id;", "@id", delegateUser.Id);
            LoginAs(delegateUser.Id);
            var child = SecurityService.CreateSubUser(null, "child_sv", "تابع", null, StaffPin, "cashier", null, true, 2);
            LoginAs(child.Id);
            var grandChild = SecurityService.CreateSubUser(null, "grand_sv", "حفيد", null, StaffPin, "cashier", null, false, 0);

            LoginAs(delegateUser.Id);
            var list = SecurityService.GetAllUsers();
            Assert.AreEqual(2, list.Count, "التابع والحفيد فقط");
            Assert.IsTrue(Has(list, child.Id));
            Assert.IsTrue(Has(list, grandChild.Id));
            Assert.IsFalse(Has(list, delegateUser.Id), "ولا نفسه");
            Assert.IsFalse(Has(list, _m1.Id), "ولا مديره");
            Assert.IsFalse(Has(list, _cashierOfM1.Id), "ولا زميله");

            var tree = SecurityService.GetUserTree();
            Assert.AreEqual(1, tree.Count, "الجذر الظاهر هو التابع المباشر");
            Assert.AreEqual(child.Id, tree[0].Id);
            Assert.AreEqual(1, tree[0].Children.Count);
            Assert.AreEqual(grandChild.Id, tree[0].Children[0].Id);
        }

        [Test]
        public void DelegatingCashier_WithCyclicParentChain_DoesNotHang()
        {
            LoginAs(OwnerId);
            var a = SecurityService.CreateSubUser(_m1.Id, "cyc_a", "حلقة أ", null, StaffPin, "cashier", null, false, 0);
            var b = SecurityService.CreateSubUser(_m1.Id, "cyc_b", "حلقة ب", null, StaffPin, "cashier", null, false, 0);
            Execute("UPDATE users SET parent_id = @p WHERE id = @id;", "@p", b.Id, "@id", a.Id);
            Execute("UPDATE users SET parent_id = @p WHERE id = @id;", "@p", a.Id, "@id", b.Id);

            LoginAs(_cashierOfM1.Id);
            Assert.AreEqual(0, SecurityService.GetAllUsers().Count);
        }

        [Test]
        public void PlainCashier_SeesNobody()
        {
            LoginAs(_cashierOfOwner.Id);
            Assert.AreEqual(0, SecurityService.GetAllUsers().Count);
            Assert.AreEqual(0, SecurityService.GetUserTree().Count);
        }

        [Test]
        public void Tree_Owner_StartsAtManagersAndNestsTheirCashiers_WithoutOwnerNode()
        {
            LoginAs(OwnerId);
            var tree = SecurityService.GetUserTree();

            Assert.IsFalse(Has(Flatten(tree), OwnerId));
            Assert.IsFalse(Has(Flatten(tree), RootId));
            Assert.IsTrue(Has(tree, _m1.Id), "المدير صف علوي لأن أباه (المالك) غير ظاهر");
            Assert.IsTrue(Has(tree, _m2.Id));
            Assert.IsTrue(Has(tree, _cashierOfOwner.Id), "كاشير المالك صف علوي أيضاً");
            Assert.IsFalse(Has(tree, _cashierOfM1.Id), "كاشير المدير داخل فرعه");

            UserDto m1Node = null;
            for (int i = 0; i < tree.Count; i++)
            {
                if (tree[i].Id == _m1.Id) m1Node = tree[i];
            }
            Assert.AreEqual(1, m1Node.Children.Count);
            Assert.AreEqual(_cashierOfM1.Id, m1Node.Children[0].Id);
            Assert.AreEqual("admin", tree[0].Role, "المديرون قبل الكاشيرية");
        }

        [Test]
        public void Tree_Manager_ShowsCashiersAsTopLevelRows_BecauseTheirParentIsInvisible()
        {
            LoginAs(_m1.Id);
            var tree = SecurityService.GetUserTree();

            Assert.IsTrue(Has(tree, _cashierOfM1.Id), "كاشير المدير صف علوي لأن أباه غير ظاهر (هو نفسه)");
            Assert.IsTrue(Has(tree, _cashierOfM2.Id), "وكاشير مدير آخر كذلك");
            Assert.IsFalse(Has(Flatten(tree), _m1.Id));
            Assert.IsFalse(Has(Flatten(tree), _m2.Id));
            Assert.IsFalse(Has(Flatten(tree), OwnerId));
        }

        [Test]
        public void Tree_ParentFilter_AppliesOnlyToVisibleNodes()
        {
            LoginAs(OwnerId);
            var m1Branch = SecurityService.GetUserTree(_m1.Id);
            Assert.AreEqual(1, m1Branch.Count);
            Assert.AreEqual(_m1.Id, m1Branch[0].Id);

            var ownAsParent = SecurityService.GetUserTree(OwnerId);
            Assert.IsFalse(Has(Flatten(ownAsParent), OwnerId), "طلب الشجرة بمعرّف المالك لا يكشفه");
            var rootAsParent = SecurityService.GetUserTree(RootId);
            Assert.IsFalse(Has(Flatten(rootAsParent), RootId), "ولا المطور");
        }

        [Test]
        public void NoSession_ReturnsEmptyLists_FailClosed()
        {
            Logout();
            Assert.AreEqual(0, SecurityService.GetAllUsers().Count);
            Assert.AreEqual(0, SecurityService.GetUserTree().Count);
            Assert.AreEqual(0, SecurityService.GetUserTree(OwnerId).Count);
        }

        [Test]
        public void SessionOfADeletedAccount_ReturnsEmptyLists()
        {
            LoginAs(OwnerId);
            Assert.IsTrue(SecurityService.DeleteUser(_m2.Id));
            SecurityService.SetCurrentUserForTesting(_m2);

            Assert.AreEqual(0, SecurityService.GetAllUsers().Count, "الجلسة المخزنة لحساب محذوف لا تكشف شيئاً");
            Assert.AreEqual(0, SecurityService.GetUserTree().Count);
        }

        [Test]
        public void IpcUsersGetAll_FollowsTheSameRule()
        {
            LoginAs(_m1.Id);
            var res = Dispatch("users:getAll", null);
            Assert.IsTrue(res.Success, Describe(res));
            var list = (List<UserDto>)res.Data;
            Assert.IsTrue(Has(list, _cashierOfM1.Id));
            Assert.IsFalse(Has(list, OwnerId));
            Assert.IsFalse(Has(list, _m1.Id));
        }
    }
}
