using System;
using System.Collections.Generic;
using System.Threading;
using Newtonsoft.Json;
using NUnit.Framework;
using RafiqPOS.Bridge;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    [TestFixture]
    [NonParallelizable]
    public class S52_RequestAdmissionTest
    {
        private SecurityService _security;

        [SetUp]
        public void SetUp()
        {
            SecurityService.SetCurrentUserForTesting(null);
            _security = new SecurityService(null, null);
            DatabaseService.Security = _security;
        }

        [TearDown]
        public void TearDown()
        {
            SecurityService.SetCurrentUserForTesting(null);
            DatabaseService.Security = null;
        }

        private static User Actor(string id, string role)
        {
            return new User
            {
                Id = id, Username = id, DisplayName = "Admitted " + id, Role = role, IsActive = true,
                PermissionsJson = "{\"products.edit\":true,\"products.create\":false,\"products.edit_price\":false,\"products.edit_cost\":false,\"stock.adjust\":false,\"products.packaging.edit\":false}"
            };
        }

        private static RequestAdmission Admit(User actor)
        {
            SecurityService.SetCurrentUserForTesting(actor == null ? null : SecurityService.MapToDto(actor));
            return SecurityService.CaptureRequestAdmission(delegate(string id) { return actor; });
        }

        private static BridgeRequest Request(string action, RequestAdmission admission)
        {
            return new BridgeRequest { Id = "admission-test", Action = action, Admission = admission };
        }

        private void Replace(string replacement)
        {
            if (replacement == "logout") _security.Logout();
            else SecurityService.SetCurrentUserForTesting(SecurityService.MapToDto(
                Actor(replacement == "same-account" ? "cashier" : "new-owner",
                    replacement == "same-account" ? "cashier" : "admin")));
        }

        [Test]
        public void MissingAmbientPrincipalNeverGrantsProductOrStockAuthority()
        {
            foreach (string key in new[] { "products.create", "products.edit", "products.edit_price",
                "products.edit_cost", "stock.adjust", "products.packaging.edit" })
                Assert.IsFalse(ProductWritePolicy.CurrentUserHasPermission(key), key);
            Assert.Throws<UnauthorizedAccessException>(delegate { ProductWritePolicy.BeginOperation(); });
            Admit(Actor("owner", "admin"));
            Assert.IsFalse(ProductWritePolicy.CurrentUserHasPermission("products.edit_price"),
                "A live session is not an explicitly admitted direct service request.");
        }

        [TestCase("logout")]
        [TestCase("same-account")]
        [TestCase("different-account")]
        public void QueuedRequestCannotBeReboundToReplacementSession(string replacement)
        {
            RequestAdmission admission = Admit(Actor("cashier", "cashier"));
            Replace(replacement);
            BridgeResponse response = IpcDispatcher.Dispatch(Request("products:save", admission));
            Assert.IsFalse(response.Success);
            Assert.AreEqual("AUTH_REQUIRED", response.Error.Code);
            Assert.Throws<UnauthorizedAccessException>(delegate { ProductWritePolicy.EnterRequest(admission); });
        }

        [TestCase("logout", "create-unit")]
        [TestCase("same-account", "create-unit")]
        [TestCase("different-account", "create-unit")]
        [TestCase("logout", "update-unit")]
        [TestCase("same-account", "update-unit")]
        [TestCase("different-account", "update-unit")]
        [TestCase("logout", "set-base")]
        [TestCase("same-account", "set-base")]
        [TestCase("different-account", "set-base")]
        [TestCase("logout", "packaging")]
        [TestCase("same-account", "packaging")]
        [TestCase("different-account", "packaging")]
        public void RequestWaitingOnFinancialLockIsRejectedBeforeMutation(string replacement, string action)
        {
            RequestAdmission admission = Admit(Actor("cashier", "cashier"));
            Exception failure = null;
            int mutations = 0;
            using (var entered = new ManualResetEvent(false))
            {
                Thread worker = new Thread(delegate()
                {
                    try
                    {
                        using (ProductWritePolicy.EnterRequest(admission))
                        {
                            entered.Set();
                            var service = new ProductUnitService("Admission test must not reach SQLite");
                            var unit = new ProductUnit
                            {
                                Id = "denied-unit", ProductId = "denied-product", UnitName = "piece",
                                ConversionFactor = 1, SellPricePiasters = 1000, CostPricePiasters = 400
                            };
                            if (action == "create-unit") service.CreateUnit(unit);
                            if (action == "update-unit") service.UpdateUnit(unit);
                            if (action == "set-base") service.SetBaseUnit(unit.ProductId, unit.Id);
                            if (action == "packaging")
                                new ProductService(null).SavePackagingLevels(unit.ProductId,
                                    new List<ProductUnit> { unit }, unit.Id, unit.Id, unit.Id, false);
                            Interlocked.Increment(ref mutations);
                        }
                    }
                    catch (Exception ex) { failure = ex; }
                });
                lock (SaleService.FinancialWriteLock)
                {
                    worker.Start();
                    Assert.IsTrue(entered.WaitOne(5000), "Request must be admitted before session replacement.");
                    Replace(replacement);
                }
                Assert.IsTrue(worker.Join(5000), "Worker must not deadlock.");
            }
            Assert.IsInstanceOf<UnauthorizedAccessException>(failure);
            Assert.AreEqual(0, mutations, "No product/unit/stock/financial-history mutation can begin.");
        }

        [Test]
        public void EffectivePermissionsAreFrozenFromPersistedActorNotMutableDto()
        {
            User actor = Actor("cashier", "cashier");
            RequestAdmission admission = Admit(actor);
            SecurityService.CurrentUser.Permissions["products.edit_price"] = true;
            SecurityService.CurrentUser.Role = "admin";
            actor.PermissionsJson = "{\"products.edit_price\":true}";
            using (ProductWritePolicy.EnterRequest(admission))
            using (var operation = ProductWritePolicy.BeginOperation())
            {
                Assert.IsTrue(operation.HasPermission("products.edit"));
                foreach (string denied in new[] { "products.create", "products.edit_price", "products.edit_cost",
                    "stock.adjust", "products.packaging.edit" })
                    Assert.IsFalse(operation.HasPermission(denied), denied);
                Assert.AreEqual("cashier", operation.Role);
                Assert.AreEqual("cashier", operation.ActorId);
                Assert.AreEqual("Admitted cashier", operation.ActorName);
            }
        }

        [TestCase("root")]
        [TestCase("admin")]
        public void PersistedPrivilegedRolesRetainExistingRoleBypass(string role)
        {
            RequestAdmission admission = Admit(Actor("owner", role));
            Assert.IsTrue(admission.HasPermission("products.edit_cost"));
            Assert.IsTrue(admission.HasPermission("stock.adjust"));
        }

        [Test]
        public void AdmissionLoadsExactActorOnceAndRejectsCaptureRaceOrMissingInactiveActor()
        {
            User actor = Actor("cashier", "cashier");
            Admit(actor);
            int reads = 0;
            RequestAdmission invalid = SecurityService.CaptureRequestAdmission(delegate(string id)
            {
                reads++;
                Assert.AreEqual("cashier", id);
                SecurityService.SetCurrentUserForTesting(SecurityService.MapToDto(Actor("owner", "admin")));
                return actor;
            });
            Assert.AreEqual(1, reads);
            Assert.IsFalse(invalid.IsValid);
            Assert.IsFalse(SecurityService.CaptureRequestAdmission(delegate(string id) { return null; }).IsValid);
            actor.IsActive = false;
            Assert.IsFalse(Admit(actor).IsValid);
        }

        [Test]
        public void SameAuthorityRefreshPreservesAdmissionAndDelayedRefreshCannotReloginAfterLogout()
        {
            User actor = Actor("cashier", "cashier");
            RequestAdmission admission = Admit(actor);
            Assert.IsTrue(SecurityService.TryRefreshSession(admission.Generation, actor.Id, actor));
            Assert.IsTrue(SecurityService.IsAdmissionCurrent(admission));
            _security.Logout();
            Assert.IsFalse(SecurityService.TryRefreshSession(admission.Generation, actor.Id, actor));
            Assert.IsNull(SecurityService.CurrentUser);
        }

        [TestCase("permissions")]
        [TestCase("role")]
        [TestCase("inactive")]
        [TestCase("pin")]
        public void AuthorityRefreshInvalidatesPriorAdmissions(string change)
        {
            User actor = Actor("cashier", "cashier");
            RequestAdmission admission = Admit(actor);
            if (change == "permissions") actor.PermissionsJson = "{\"products.edit\":false}";
            if (change == "role") actor.Role = "admin";
            if (change == "inactive") actor.IsActive = false;
            if (change == "pin") actor.MustChangePin = true;
            Assert.IsTrue(SecurityService.TryRefreshSession(admission.Generation, actor.Id, actor));
            Assert.IsFalse(SecurityService.IsAdmissionCurrent(admission));
        }

        [Test]
        public void ClientJsonCannotForgeHostAdmission()
        {
            string json = "{\"id\":\"forge\",\"action\":\"products:save\",\"admission\":{\"isValid\":true,\"generation\":0,\"actorId\":\"owner\",\"role\":\"admin\"}}";
            BridgeRequest request = JsonConvert.DeserializeObject<BridgeRequest>(json);
            Assert.IsNull(request.Admission);
            BridgeResponse response = IpcDispatcher.Dispatch(request);
            Assert.AreEqual("AUTH_REQUIRED", response.Error.Code);
            request.Admission = Admit(Actor("owner", "admin"));
            StringAssert.DoesNotContain("admission", JsonConvert.SerializeObject(request).ToLowerInvariant());
        }

        [Test]
        public void CurrentAnonymousAdmissionAllowsPublicLoginButNotProtectedWrites()
        {
            RequestAdmission admission = Admit(null);
            BridgeResponse denied = IpcDispatcher.Dispatch(Request("products:save", admission));
            Assert.AreEqual("AUTH_REQUIRED", denied.Error.Code);
            BridgeResponse login = IpcDispatcher.Dispatch(Request("auth:login", admission));
            Assert.AreNotEqual("AUTH_REQUIRED", login.Error.Code, "Public login must reach its existing payload validation.");
            using (ProductWritePolicy.EnterRequest(SecurityService.CaptureRequestAdmission()))
                Assert.Throws<UnauthorizedAccessException>(delegate { ProductWritePolicy.BeginOperation(); });
        }

        [Test]
        public void ForcedPinSessionRemainsAdmittedButCannotWriteProducts()
        {
            User actor = Actor("owner", "admin");
            actor.MustChangePin = true;
            RequestAdmission admission = Admit(actor);
            BridgeResponse response = IpcDispatcher.Dispatch(Request("products:save", admission));
            Assert.AreEqual("MUST_CHANGE_PIN", response.Error.Code);
            using (ProductWritePolicy.EnterRequest(admission))
                Assert.Throws<UnauthorizedAccessException>(delegate { ProductWritePolicy.BeginOperation(); });
            Assert.IsTrue(IpcDispatcher.Dispatch(Request("auth:getCurrentUser", admission)).Success);
        }

        [Test]
        public void AuthorizedOperationKeepsOriginalActorAndRightsAfterSessionReplacement()
        {
            RequestAdmission admission = Admit(Actor("cashier", "cashier"));
            using (ProductWritePolicy.EnterRequest(admission))
            using (var operation = ProductWritePolicy.BeginOperation())
            {
                Replace("different-account");
                Assert.AreEqual("cashier", operation.ActorId);
                Assert.AreEqual("Admitted cashier", operation.ActorName);
                Assert.IsTrue(operation.HasPermission("products.edit"));
                Assert.IsFalse(operation.HasPermission("products.edit_price"));
                Assert.IsFalse(ProductWritePolicy.CurrentUserHasPermission("products.edit_cost"));
            }
            Assert.IsFalse(ProductWritePolicy.CurrentUserHasPermission("products.edit"));
        }

        [Test]
        public void NestedOperationRetainsAllFinancialPermissionsAndRestoresPreviousFrame()
        {
            User actor = Actor("cashier", "cashier");
            actor.PermissionsJson = "{\"pos.discount_invoice\":true,\"customers.credit_limit_override\":true,\"returns.without_invoice\":true,\"insurance.sell\":true}";
            RequestAdmission admission = Admit(actor);
            using (ProductWritePolicy.EnterRequest(admission))
            using (var outer = ProductWritePolicy.BeginOperation())
            {
                Assert.AreSame(outer, ProductWritePolicy.CurrentOperation);
                Replace("different-account");
                using (var nested = ProductWritePolicy.BeginOperation())
                {
                    Assert.AreSame(nested, ProductWritePolicy.CurrentOperation);
                    foreach (string key in new[] { "pos.discount_invoice", "customers.credit_limit_override",
                        "returns.without_invoice", "insurance.sell" })
                        Assert.IsTrue(nested.HasPermission(key), key);
                    Assert.IsFalse(nested.HasPermission("products.edit_cost"));
                    Assert.AreEqual("cashier", nested.ActorId);
                }
                Assert.AreSame(outer, ProductWritePolicy.CurrentOperation);
            }
            Assert.IsNull(ProductWritePolicy.CurrentOperation);
            Assert.IsNull(ProductWritePolicy.CurrentAdmission);
        }

        [Test]
        public void FramesCleanUpAfterExceptionOnReusedThreadAndFixtureTrustCannotEnterIpc()
        {
            RequestAdmission admission = Admit(Actor("cashier", "cashier"));
            try
            {
                using (ProductWritePolicy.EnterRequest(admission))
                using (ProductWritePolicy.BeginOperation())
                {
                    Assert.Throws<UnauthorizedAccessException>(delegate { ProductWritePolicy.EnterTrustedFixtureOperation(); });
                    throw new InvalidOperationException("test failure");
                }
            }
            catch (InvalidOperationException) { }
            Assert.IsFalse(ProductWritePolicy.CurrentUserHasPermission("products.edit"));
            Assert.Throws<UnauthorizedAccessException>(delegate { ProductWritePolicy.BeginOperation(); });
            using (ProductWritePolicy.EnterTrustedFixtureOperation())
            {
                Assert.IsTrue(ProductWritePolicy.CurrentUserHasPermission("products.create"));
                Assert.IsFalse(ProductWritePolicy.CurrentUserHasPermission("users.manage"));
                Assert.AreEqual("AUTH_REQUIRED", IpcDispatcher.Dispatch(Request("system:ping", admission)).Error.Code);
            }
            using (ProductWritePolicy.EnterRequest(admission))
                Assert.IsFalse(ProductWritePolicy.CurrentUserHasPermission("products.edit_price"));
        }

        [Test]
        public void TrustedFixtureDoesNotFlowToThreadPool()
        {
            bool workerPermission = true;
            using (var finished = new ManualResetEvent(false))
            using (ProductWritePolicy.EnterTrustedFixtureOperation())
            {
                ThreadPool.QueueUserWorkItem(delegate
                {
                    workerPermission = ProductWritePolicy.CurrentUserHasPermission("products.create");
                    finished.Set();
                });
                Assert.IsTrue(finished.WaitOne(5000));
                Assert.IsFalse(workerPermission);
            }
        }
    }
}
