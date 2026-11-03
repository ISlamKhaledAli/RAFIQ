using System;
using System.Collections.Generic;
using System.Reflection;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    [TestFixture]
    [Category("FinancePure")]
    public class S49_SalePinSerializationTest
    {
        private const string ApprovalPlaceholder = "test-approval-placeholder";

        [TestCase(false)]
        [TestCase(true)]
        public void SaleResponseSerialization_NeverContainsSupervisorPin(bool envelope)
        {
            var sale = new Sale { Id = "committed-sale", SupervisorPin = ApprovalPlaceholder };
            string json = envelope
                ? JsonConvert.SerializeObject(new { data = sale })
                : JsonConvert.SerializeObject(sale);
            Assert.IsFalse(json.Contains("supervisorPin"));
            Assert.IsFalse(json.Contains(ApprovalPlaceholder));
        }

        [Test]
        public void SaleDtoDeserialization_LeavesPinForExplicitBridgeBinding()
        {
            var payload = new JObject();
            payload["supervisorPin"] = ApprovalPlaceholder;
            var sale = JsonConvert.DeserializeObject<Sale>(payload.ToString());
            Assert.IsNull(sale.SupervisorPin);
            sale.SupervisorPin = payload["supervisorPin"].ToString();
            Assert.AreEqual(ApprovalPlaceholder, sale.SupervisorPin);
        }

        [Test]
        public void CheckoutFingerprint_DoesNotDependOnApprovalCredential()
        {
            var fingerprint = typeof(SaleService).GetMethod("CheckoutFingerprint", BindingFlags.NonPublic | BindingFlags.Static);
            Assert.IsNotNull(fingerprint);
            var sale = new Sale();
            string before = (string)fingerprint.Invoke(null, new object[] { sale });
            sale.SupervisorPin = ApprovalPlaceholder;
            Assert.AreEqual(before, fingerprint.Invoke(null, new object[] { sale }));
        }
    }

    [TestFixture]
    [NonParallelizable]
    public class S49_SalePinPostingTest : S40_FinanceFixture
    {
        [Test]
        public void ApprovedOverrideRetainsAuthorizationAndAudit_ButCommittedAndReplayDtosHaveNoPin()
        {
            var product = CreateProduct("Credential-safe approval", 10000, 3000, 10000);
            LoginAs(CashierId);
            var shift = DatabaseService.Shifts.OpenShift(new OpenShiftRequest
            {
                PosRegisterId = "default_pos", CashierId = CashierId,
                CashierName = "Approval cashier", OpeningFloatPiasters = 50000
            });
            var request = new Sale
            {
                CashierId = CashierId, ShiftId = shift.Id, PaymentMethod = "cash", PaidPiasters = 9000,
                SupervisorPin = "7418",
                Items = new List<SaleItem> { new SaleItem
                {
                    ProductId = product.Id, QuantityMilli = 1000, UnitPricePiasters = 9000,
                    Unit = product.Unit, ConversionFactor = 1
                } }
            };
            string key = Guid.NewGuid().ToString("N");
            var committed = DatabaseService.Sales.ProcessSale(request, key);
            Assert.AreEqual(9000, committed.TotalPiasters);
            Assert.IsNull(committed.SupervisorPin);
            Assert.AreEqual(1, FinanceCount(
                "SELECT COUNT(*) FROM audit_logs WHERE action='SALE_PRICE_OVERRIDE_APPROVED' AND entity_id=@id;",
                "@id", committed.Id));
            string before = FinancialState();
            var replay = DatabaseService.Sales.ProcessSale(request, key);
            Assert.AreEqual(committed.Id, replay.Id);
            Assert.IsNull(replay.SupervisorPin);
            Assert.AreEqual(before, FinancialState());
        }
    }
}
