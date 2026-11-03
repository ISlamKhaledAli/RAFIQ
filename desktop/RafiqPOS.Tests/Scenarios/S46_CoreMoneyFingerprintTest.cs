using System;
using System.Collections.Generic;
using System.Reflection;
using Newtonsoft.Json;
using NUnit.Framework;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    [TestFixture]
    [Category("FinancePure")]
    public class S46_CoreMoneyFingerprintTest
    {
        private static Sale Request()
        {
            return new Sale
            {
                CashierId = "cashier", CustomerId = "customer", ShiftId = "shift",
                PaidPiasters = 1200, PaymentMethod = "cash",
                Items = new List<SaleItem> { new SaleItem
                {
                    ProductId = "product", QuantityMilli = 1000, UnitPricePiasters = 1200,
                    Unit = "box12", UnitId = "unit12", ConversionFactor = 12,
                    Modifiers = new List<SaleItemModifier> { new SaleItemModifier { OptionId = "option", ExtraPricePiasters = 100 } }
                } },
                Payments = new List<SalePayment> { new SalePayment { Method = "cash", AmountPiasters = 1200 } },
                InsuranceClaim = new InsuranceClaimLine { ContractId = "contract", CompanyId = "company", MemberNo = "member" },
                DeliveryInfo = new DeliveryOrderCreateInfo { DeliveryAddress = "Address", DeliveryFeePiasters = 200 },
                Prescription = new Prescription { PatientName = "Patient", DoctorName = "Doctor" },
                ControlledDispenses = new List<ControlledDrugDispense> { new ControlledDrugDispense { ProductId = "product", PatientName = "Patient" } }
            };
        }

        private static string Fingerprint(Sale request)
        {
            var method = typeof(SaleService).GetMethod("CheckoutFingerprint", BindingFlags.NonPublic | BindingFlags.Static);
            Assert.IsNotNull(method);
            return (string)method.Invoke(null, new object[] { request });
        }

        [Test]
        public void FIN11_GeneratedIdentityTotalsCostsAndTimestamps_DoNotChangeFingerprint()
        {
            var request = Request();
            string original = Fingerprint(request);
            request.Id = Guid.NewGuid().ToString();
            request.InvoiceNumber = 900;
            request.CreatedAt = DateTime.UtcNow.ToString("o");
            request.TotalPiasters = 99999;
            request.SubtotalPiasters = 99999;
            request.TaxPiasters = 99999;
            request.Items[0].Id = Guid.NewGuid().ToString();
            request.Items[0].SaleId = request.Id;
            request.Items[0].UnitCostPiasters = 999;
            request.Items[0].TotalPiasters = 888;
            request.Items[0].TaxPiasters = 77;
            request.Payments[0].Id = Guid.NewGuid().ToString();
            request.Payments[0].CreatedAt = request.CreatedAt;
            request.Items[0].Modifiers[0].Id = Guid.NewGuid().ToString();
            request.InsuranceClaim.Id = Guid.NewGuid().ToString();
            request.InsuranceClaim.CompanyPiasters = 99999;
            request.ControlledDispenses[0].Id = Guid.NewGuid().ToString();
            request.ControlledDispenses[0].CreatedAt = request.CreatedAt;
            Assert.AreEqual(original, Fingerprint(request));
            Assert.AreEqual(original, Fingerprint(JsonConvert.DeserializeObject<Sale>(JsonConvert.SerializeObject(Request()))));
        }

        [TestCase("quantity")]
        [TestCase("unit")]
        [TestCase("factor")]
        [TestCase("batch")]
        [TestCase("discount")]
        [TestCase("tax")]
        [TestCase("payment")]
        [TestCase("status")]
        [TestCase("change")]
        [TestCase("serviceFee")]
        [TestCase("serviceCharge")]
        [TestCase("deliveryFee")]
        [TestCase("deliveryAddress")]
        [TestCase("modifier")]
        [TestCase("insurance")]
        [TestCase("patient")]
        [TestCase("prescription")]
        [TestCase("cashier")]
        [TestCase("customer")]
        [TestCase("customerPhone")]
        [TestCase("shift")]
        public void FIN11_ChangedBusinessInput_ChangesFingerprint(string change)
        {
            var request = Request();
            string before = Fingerprint(request);
            switch (change)
            {
                case "quantity": request.Items[0].QuantityMilli++; break;
                case "unit": request.Items[0].UnitId = "other-unit"; break;
                case "factor": request.Items[0].ConversionFactor++; break;
                case "batch": request.Items[0].BatchId = "other-batch"; break;
                case "discount": request.Items[0].DiscountPiasters++; break;
                case "tax": request.Items[0].TaxRatePercent = 14; break;
                case "payment": request.Payments[0].AmountPiasters++; break;
                case "status": request.Status = "cancelled"; break;
                case "change": request.ChangePiasters++; break;
                case "serviceFee": request.ServiceFeePiasters++; break;
                case "serviceCharge": request.ServiceChargePiasters++; break;
                case "deliveryFee": request.DeliveryFeePiasters++; break;
                case "deliveryAddress": request.DeliveryInfo.DeliveryAddress = "Other"; break;
                case "modifier": request.Items[0].Modifiers[0].ExtraPricePiasters++; break;
                case "insurance": request.InsuranceClaim.ContractId = "other-contract"; break;
                case "patient": request.ControlledDispenses[0].PatientName = "Other"; break;
                case "prescription": request.Prescription.DoctorName = "Other"; break;
                case "cashier": request.CashierId = "other-cashier"; break;
                case "customer": request.CustomerId = "other-customer"; break;
                case "customerPhone": request.CustomerPhone = "01234567890"; break;
                case "shift": request.ShiftId = "other-shift"; break;
                default: Assert.Fail("Uncovered input"); break;
            }
            Assert.AreNotEqual(before, Fingerprint(request));
        }

        [Test]
        public void FIN11_LegacyFingerprint_RequiresExplicitReconciliation()
        {
            var method = typeof(SaleService).GetMethod("EnsureCheckoutReplayMatches", BindingFlags.NonPublic | BindingFlags.Static);
            Assert.IsNotNull(method);
            var error = Assert.Throws<TargetInvocationException>(delegate { method.Invoke(null, new object[] { null, "requested" }); });
            Assert.IsInstanceOf<InvalidOperationException>(error.InnerException);
            StringAssert.Contains("SALE_IDEMPOTENCY_RECONCILIATION_REQUIRED", error.InnerException.Message);
        }
    }
}
