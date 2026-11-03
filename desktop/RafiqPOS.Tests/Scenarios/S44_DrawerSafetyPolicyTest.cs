using System;
using System.Collections.Generic;
using NUnit.Framework;
using RafiqPOS.Common;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    [TestFixture]
    public class S44_DrawerSafetyPolicyTest
    {
        [TestCase(0)]
        [TestCase(20)]
        [TestCase(30)]
        [TestCase(100)]
        [TestCase(250)]
        [TestCase(int.MaxValue)]
        public void RawKick_AlwaysDeniedBeforeNativeTransport(int duration)
        {
            string reason;
            Assert.IsFalse(RawPrinterHelper.SendDrawerKick("NEVER_SEND_TO_HARDWARE", out reason, duration));
            Assert.AreEqual(DrawerSafetyPolicy.BlockReason, reason);
        }

        [Test]
        public void Raster_RejectsEmbeddedDrawerCommandBeforeReadingBitmap()
        {
            Assert.Throws<InvalidOperationException>(() =>
                RawPrinterHelper.ConvertBitmapToEscPosRaster(null, true, false));
            Assert.IsNull(typeof(RawPrinterHelper).GetMethod("GetDrawerKickPulse"));
            Assert.IsNull(typeof(RawPrinterHelper).GetProperty("DrawerKickPulse"));
        }

        [Test]
        public void ManualPrinterAction_ReturnsBlockedWithoutLookingUpAnyDevice()
        {
            PrintResult result = new PrinterService(null).KickDrawer("NEVER_SEND_TO_HARDWARE", 20);
            Assert.IsFalse(result.Success);
            Assert.AreEqual("blocked", result.DrawerStatus);
            Assert.AreEqual(DrawerSafetyPolicy.WarningCode, result.WarningCode);
            Assert.AreEqual(DrawerSafetyPolicy.BlockReason, result.Message);
        }

        [TestCase("card")]
        [TestCase("instapay")]
        [TestCase("vodafone_cash")]
        [TestCase("credit")]
        [TestCase("multi")]
        public void AggregatePaidAmount_IsNotProofOfCash(string method)
        {
            Assert.IsFalse(DrawerSafetyPolicy.HasCashPayment(new Sale
            {
                PaymentMethod = method,
                PaidPiasters = 10000
            }));
        }

        [Test]
        public void RecordedPaymentLinesOverrideLegacyAggregateClassification()
        {
            Sale sale = new Sale
            {
                PaymentMethod = "cash",
                PaidPiasters = 10000,
                Payments = new List<SalePayment>
                {
                    new SalePayment { Method = "card", AmountPiasters = 10000 }
                }
            };
            Assert.IsFalse(DrawerSafetyPolicy.HasCashPayment(sale));
            sale.Payments.Add(new SalePayment { Method = "cash", AmountPiasters = 1 });
            Assert.IsTrue(DrawerSafetyPolicy.HasCashPayment(sale));
            sale.Payments[1].AmountPiasters = 0;
            Assert.IsFalse(DrawerSafetyPolicy.HasCashPayment(sale));
        }
    }
}
