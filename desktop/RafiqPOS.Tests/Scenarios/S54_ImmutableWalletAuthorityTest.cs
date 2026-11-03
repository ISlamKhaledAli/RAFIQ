using System;
using System.Collections.Generic;
using Newtonsoft.Json;
using NUnit.Framework;
using RafiqPOS.Common;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    [TestFixture]
    [NonParallelizable]
    [Category("FinancePure")]
    public class S54_ImmutableWalletAuthorityTest
    {
        [SetUp]
        public void SetUp()
        {
            SecurityService.SetCurrentUserForTesting(null);
            DatabaseService.Security = new SecurityService(null, null);
        }

        [TearDown]
        public void TearDown()
        {
            Assert.IsNull(ProductWritePolicy.CurrentOperation);
            Assert.IsNull(ProductWritePolicy.CurrentAdmission);
            SecurityService.SetCurrentUserForTesting(null);
            DatabaseService.Security = null;
        }

        private static User Actor(string id, string permission, bool allowed, string role)
        {
            return new User
            {
                Id = id, Username = id, DisplayName = "Admitted " + id, Role = role, IsActive = true,
                PermissionsJson = JsonConvert.SerializeObject(new Dictionary<string, bool> { { permission, allowed } })
            };
        }

        private static RequestAdmission Admit(string permission, bool allowed)
        {
            var persisted = Actor("actor-a", permission, allowed, "cashier");
            SecurityService.SetCurrentUserForTesting(SecurityService.MapToDto(persisted));
            return SecurityService.CaptureRequestAdmission(delegate(string id) { return persisted; });
        }

        private static void SwitchToAdmin(string permission)
        {
            SecurityService.SetCurrentUserForTesting(SecurityService.MapToDto(Actor("actor-b", permission, true, "admin")));
        }

        [TestCase("wallets.transact")]
        [TestCase("wallets.fund")]
        [TestCase("epay.transact")]
        [TestCase("epay.fund")]
        public void QueuedPrincipalSwitchCannotAcceptOrUpgradeFinancialWork(string permission)
        {
            var admission = Admit(permission, false);
            bool ran = false;
            using (ProductWritePolicy.EnterRequest(admission))
            {
                SwitchToAdmin(permission);
                Assert.Throws<UnauthorizedAccessException>(delegate
                {
                    IdempotencyGuard.WithFinancialOperation(permission, delegate { ran = true; return 0; });
                });
            }
            Assert.IsFalse(ran);
        }

        [TestCase("wallets.transact")]
        [TestCase("wallets.fund")]
        [TestCase("epay.transact")]
        [TestCase("epay.fund")]
        public void AcceptedOperationKeepsOriginalActorNameAndFinancialCapability(string permission)
        {
            using (ProductWritePolicy.EnterRequest(Admit(permission, true)))
                IdempotencyGuard.WithFinancialOperation(permission, delegate
                {
                    var original = ProductWritePolicy.CurrentOperation;
                    SwitchToAdmin(permission);
                    Assert.AreEqual("actor-a", IdempotencyGuard.FinancialActorId(null));
                    Assert.AreEqual("Admitted actor-a", IdempotencyGuard.FinancialActorName(null));
                    Assert.AreEqual("cashier", original.Role);
                    Assert.IsTrue(IdempotencyGuard.FinancialHasPermission(permission));
                    Assert.AreEqual("actor-a", IdempotencyGuard.VerifyFinancialAttemptActor("actor-a"));
                    IdempotencyGuard.WithFinancialOperation(permission, delegate
                    {
                        Assert.AreEqual("actor-a", ProductWritePolicy.CurrentOperation.ActorId);
                        return 0;
                    });
                    Assert.AreSame(original, ProductWritePolicy.CurrentOperation);
                    return 0;
                });
        }

        [TestCase("wallets.transact")]
        [TestCase("wallets.fund")]
        [TestCase("epay.transact")]
        [TestCase("epay.fund")]
        public void AcceptedLowPrivilegeCannotBorrowLaterAdministrator(string permission)
        {
            bool ran = false;
            using (ProductWritePolicy.EnterRequest(Admit(permission, false)))
                IdempotencyGuard.WithFinancialOperation<object>(null, delegate
                {
                    SwitchToAdmin(permission);
                    Assert.IsFalse(IdempotencyGuard.FinancialHasPermission(permission));
                    Assert.Throws<UnauthorizedAccessException>(delegate
                    {
                        IdempotencyGuard.WithFinancialOperation(permission, delegate { ran = true; return 0; });
                    });
                    Assert.AreEqual("actor-a", IdempotencyGuard.FinancialActorId(null));
                    return null;
                });
            Assert.IsFalse(ran);
        }

        [Test]
        public void AnonymousIpcFrameNeverUsesTheLegacyActorFallback()
        {
            var admission = SecurityService.CaptureRequestAdmission(delegate(string id) { return null; });
            using (ProductWritePolicy.EnterRequest(admission))
            {
                SwitchToAdmin("wallets.fund");
                Assert.Throws<UnauthorizedAccessException>(delegate { IdempotencyGuard.FinancialActorId(null); });
                Assert.Throws<UnauthorizedAccessException>(delegate
                {
                    IdempotencyGuard.WithFinancialOperation("wallets.fund", delegate { return 0; });
                });
            }
        }
    }
}
