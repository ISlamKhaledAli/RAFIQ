using System;
using System.Reflection;
using System.Threading;
using NUnit.Framework;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    [TestFixture]
    [Category("FinancePure")]
    [NonParallelizable]
    public class S53_FinancialPrincipalTest
    {
        private UserDto _previousUser;
        private SecurityService _previousSecurity;

        [SetUp]
        public void SetUp()
        {
            _previousUser = SecurityService.CurrentUser;
            _previousSecurity = DatabaseService.Security;
            DatabaseService.Security = null;
            SecurityService.SetCurrentUserForTesting(null);
        }

        [TearDown]
        public void TearDown()
        {
            Assert.IsNull(ProductWritePolicy.CurrentOperation);
            Assert.IsNull(ProductWritePolicy.CurrentAdmission);
            SecurityService.SetCurrentUserForTesting(_previousUser);
            DatabaseService.Security = _previousSecurity;
        }

        private static User Actor(string id, string role)
        {
            return new User
            {
                Id = id, Username = id, DisplayName = "Original " + id, Role = role, IsActive = true,
                PermissionsJson = "{\"pos.price_override\":false,\"returns.without_invoice\":true}"
            };
        }

        private static RequestAdmission Admit(User actor)
        {
            SecurityService.SetCurrentUserForTesting(SecurityService.MapToDto(actor));
            return SecurityService.CaptureRequestAdmission(delegate(string id) { return actor; });
        }

        private static void InvokeFinancialEntry(string entry)
        {
            var sales = new SaleService(null, null);
            if (entry == "sale") sales.ProcessSale(new Sale(), null);
            else if (entry == "reconcile") sales.ReconcileCheckout(new Sale(), "queued-key");
            else if (entry == "abandon") sales.AbandonCheckout(new Sale(), "queued-key");
            else if (entry == "cancel") sales.CancelSale("queued-sale", "Queued cancellation");
            else if (entry == "return") new ReturnService(null, null).ProcessReturn(new Return());
            else Assert.Fail("Unknown financial entry");
        }

        [TestCase("sale", "logout")]
        [TestCase("sale", "same-account")]
        [TestCase("sale", "different-account")]
        [TestCase("reconcile", "logout")]
        [TestCase("reconcile", "same-account")]
        [TestCase("reconcile", "different-account")]
        [TestCase("abandon", "logout")]
        [TestCase("abandon", "same-account")]
        [TestCase("abandon", "different-account")]
        [TestCase("cancel", "logout")]
        [TestCase("cancel", "same-account")]
        [TestCase("cancel", "different-account")]
        [TestCase("return", "logout")]
        [TestCase("return", "same-account")]
        [TestCase("return", "different-account")]
        public void QueuedFinancialEntryRejectsChangedAdmissionBeforeValidationOrRepository(string entry, string replacement)
        {
            var admission = Admit(Actor("cashier", "cashier"));
            Exception failure = null;
            using (var entered = new ManualResetEvent(false))
            {
                var worker = new Thread(delegate()
                {
                    try
                    {
                        using (ProductWritePolicy.EnterRequest(admission))
                        {
                            entered.Set();
                            InvokeFinancialEntry(entry);
                        }
                    }
                    catch (Exception ex) { failure = ex; }
                });
                lock (SaleService.FinancialWriteLock)
                {
                    worker.Start();
                    Assert.IsTrue(entered.WaitOne(5000), "Request must enter its original admission before waiting.");
                    SecurityService.SetCurrentUserForTesting(replacement == "logout" ? null :
                        SecurityService.MapToDto(Actor(replacement == "same-account" ? "cashier" : "owner", "admin")));
                }
                Assert.IsTrue(worker.Join(5000), "Financial request must terminate without deadlock.");
            }
            Assert.IsInstanceOf<UnauthorizedAccessException>(failure,
                "Stale admission must fail before financial validation or any repository access.");
        }

        private static MethodInfo Helper(string name)
        {
            var method = typeof(SaleService).GetMethod(name, BindingFlags.NonPublic | BindingFlags.Static);
            Assert.IsNotNull(method, name);
            return method;
        }

        [TestCase(false)]
        [TestCase(true)]
        public void AcceptedFinancialOperationKeepsOriginalActorAndRightsAfterSessionMutation(bool replaceSession)
        {
            var admission = Admit(Actor("cashier", "cashier"));
            using (ProductWritePolicy.EnterRequest(admission))
            lock (SaleService.FinancialWriteLock)
            using (var operation = (IDisposable)Helper("BeginFinancialOperation").Invoke(null, null))
            {
                if (replaceSession)
                    SecurityService.SetCurrentUserForTesting(SecurityService.MapToDto(Actor("owner", "admin")));
                else
                {
                    SecurityService.CurrentUser.Role = "admin";
                    SecurityService.CurrentUser.DisplayName = "Replacement label";
                    SecurityService.CurrentUser.Permissions["pos.price_override"] = true;
                }
                using (var nested = (IDisposable)Helper("BeginFinancialOperation").Invoke(null, null))
                {
                    var request = new Sale { CashierId = "forged", CashierName = "Forged", SupervisorPin = "approval-placeholder" };
                    var posting = (Sale)Helper("PrepareCheckoutRequest").Invoke(null, new object[] { request });
                    Assert.AreEqual("cashier", posting.CashierId);
                    Assert.AreEqual("Original cashier", posting.CashierName);
                    Assert.AreEqual("approval-placeholder", posting.SupervisorPin);
                    Assert.AreEqual("forged", request.CashierId, "Binding must not mutate the frozen caller request.");
                    Assert.AreEqual("cashier", ProductWritePolicy.CurrentOperation.Role);
                    Assert.IsFalse((bool)Helper("HasFinancialPermission").Invoke(null, new object[] { "owner", "pos.price_override" }));
                    Assert.IsTrue((bool)Helper("HasFinancialPermission").Invoke(null, new object[] { "owner", "returns.without_invoice" }));
                }
                Assert.AreEqual("cashier", ProductWritePolicy.CurrentOperation.ActorId);
            }
        }

        [Test]
        public void UnframedLegacyFinancialCallDoesNotGrantAmbientProductAuthority()
        {
            Admit(Actor("owner", "admin"));
            Assert.IsNull(Helper("BeginFinancialOperation").Invoke(null, null));
            Assert.IsFalse(ProductWritePolicy.CurrentUserHasPermission("products.edit_price"));
            var failure = Assert.Throws<InvalidOperationException>(delegate { new SaleService(null, null).ProcessSale(new Sale()); });
            StringAssert.Contains("بدون أصناف", failure.Message);
        }
    }
}
