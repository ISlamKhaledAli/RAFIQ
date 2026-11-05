using System;
using System.Collections.Generic;
using System.Drawing;
using System.Reflection;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using RafiqPOS.Bridge;
using RafiqPOS.Common;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    /// <summary>
    /// إصلاحات الطباعة (الجزء الحسابي بلا قاعدة بيانات ولا طابعة): تنسيق المبالغ بأعداد صحيحة، هوية إجماليات الإيصال،
    /// حساب الشيك المبدئي من السلة المحفوظة، اتفاقية الخصم في الفاتورة التجريبية، تقسيم الصور الطويلة إلى شرائح
    /// وأوامر GS v 0، وتحويل نتيجة الطباعة الفاشلة إلى PRINT_FAILED.
    /// الموجّهات المقابلة في الواجهة: frontend/test/receipt_layout.test.js (نفس القيم المرجعية).
    /// </summary>
    [TestFixture]
    public class S47_ReceiptMathAndRasterTest
    {
        // ------------------------------------------------------------------------------------------
        // FormatReceiptMoney / FormatReceiptQuantity (golden vectors shared with receipt_layout.test.js)
        // ------------------------------------------------------------------------------------------

        [TestCase(0L, "0.00")]
        [TestCase(5L, "0.05")]
        [TestCase(9L, "0.09")]
        [TestCase(10L, "0.10")]
        [TestCase(99L, "0.99")]
        [TestCase(100L, "1.00")]
        [TestCase(101L, "1.01")]
        [TestCase(99999L, "999.99")]
        [TestCase(100000L, "1,000.00")]
        [TestCase(100099L, "1,000.99")]
        [TestCase(123456789L, "1,234,567.89")]
        [TestCase(999999999L, "9,999,999.99")]
        [TestCase(99999999999L, "999,999,999.99")]
        [TestCase(-5L, "-0.05")]
        [TestCase(-100L, "-1.00")]
        [TestCase(-2050L, "-20.50")]
        [TestCase(-123456789L, "-1,234,567.89")]
        [TestCase(long.MaxValue, "92,233,720,368,547,758.07")]
        [TestCase(long.MinValue, "-92,233,720,368,547,758.08")]
        public void FormatReceiptMoney_GoldenVectors(long piasters, string expected)
        {
            Assert.AreEqual(expected, PrinterService.FormatReceiptMoney(piasters));
        }

        [Test]
        [SetCulture("ar-EG")]
        public void FormatReceiptMoney_UsesLatinDigitsAndInvariantSeparators_UnderArabicCulture()
        {
            string text = PrinterService.FormatReceiptMoney(123456789L);
            Assert.AreEqual("1,234,567.89", text);
            foreach (char c in text)
            {
                Assert.IsTrue("0123456789,.-".IndexOf(c) >= 0, "حرف غير لاتيني في المبلغ: " + (int)c);
            }
            Assert.AreEqual("-0.05", PrinterService.FormatReceiptMoney(-5L));
        }

        [TestCase(2000L, false, "2")]
        [TestCase(1250L, false, "1.250")]
        [TestCase(500L, false, "0.500")]
        [TestCase(1200000L, false, "1,200")]
        [TestCase(2000L, true, "2.000")]
        [TestCase(0L, false, "0")]
        [TestCase(-1250L, false, "-1.250")]
        public void FormatReceiptQuantity_GoldenVectors(long quantityMilli, bool forceDecimals, string expected)
        {
            Assert.AreEqual(expected, PrinterService.FormatReceiptQuantity(quantityMilli, forceDecimals));
        }

        [Test]
        public void FormatReceiptQuantityWithUnit_WeightsKeepThreeDecimals_PiecesDoNot()
        {
            Assert.AreEqual("1.250 \u0643\u062C\u0645", PrinterService.FormatReceiptQuantityWithUnit(1250, null, "kg"));
            Assert.AreEqual("2.000 \u0643\u062C\u0645", PrinterService.FormatReceiptQuantityWithUnit(2000, null, "kg"));
            Assert.AreEqual("2 \u0642", PrinterService.FormatReceiptQuantityWithUnit(2000, null, "piece"));
            Assert.AreEqual("3 \u0643\u064A\u0633", PrinterService.FormatReceiptQuantityWithUnit(3000, "\u0643\u064A\u0633", "piece"));
        }

        [TestCase(333L, 1500L, 500L)]      // 499.5 rounds half away from zero
        [TestCase(4200L, 2000L, 8400L)]
        [TestCase(16400L, 250L, 4100L)]
        [TestCase(1L, 499L, 0L)]
        [TestCase(1L, 500L, 1L)]
        [TestCase(1640L, 1250L, 2050L)]     // weighed line
        [TestCase(99999999999L, 1000L, 99999999999L)]
        public void LineGross_RoundsHalfAwayFromZero_LikeTheFrontend(long unitPrice, long quantityMilli, long expected)
        {
            Assert.AreEqual(expected, Money.FromPiasters(unitPrice).MultiplyByMilliUnits(quantityMilli).Piasters);
        }

        // ------------------------------------------------------------------------------------------
        // Print validation, transient sales, refund-method drawer rule
        // ------------------------------------------------------------------------------------------

        private static Sale ValidSale()
        {
            return new Sale
            {
                Id = "sale_x",
                InvoiceNumber = 5,
                SubtotalPiasters = 5000,
                TotalPiasters = 5000,
                PaidPiasters = 5000,
                PaymentMethod = "cash",
                CreatedAt = "2026-01-01T10:00:00",
                Items = new List<SaleItem>
                {
                    new SaleItem { ProductName = "x", QuantityMilli = 1000, UnitPricePiasters = 5000, TotalPiasters = 5000, Unit = "piece" }
                }
            };
        }

        [Test]
        public void TryValidateSaleForPrint_AcceptsAWellFormedSale()
        {
            string error;
            Assert.IsTrue(PrinterService.TryValidateSaleForPrint(ValidSale(), out error), error);
            Assert.IsNull(error);
        }

        [Test]
        public void TryValidateSaleForPrint_RejectsNullEmptyAndNullItems()
        {
            string error;
            Assert.IsFalse(PrinterService.TryValidateSaleForPrint(null, out error));
            Assert.IsNotEmpty(error);

            Sale noItems = ValidSale();
            noItems.Items = new List<SaleItem>();
            Assert.IsFalse(PrinterService.TryValidateSaleForPrint(noItems, out error));
            Assert.IsNotEmpty(error);

            Sale nullItems = ValidSale();
            nullItems.Items = null;
            Assert.IsFalse(PrinterService.TryValidateSaleForPrint(nullItems, out error));

            Sale nullLine = ValidSale();
            nullLine.Items.Add(null);
            Assert.IsFalse(PrinterService.TryValidateSaleForPrint(nullLine, out error));
        }

        [TestCase("qty0")]
        [TestCase("qtyNegative")]
        [TestCase("priceNegative")]
        [TestCase("discountNegative")]
        [TestCase("lineTotalNegative")]
        [TestCase("saleTotalNegative")]
        [TestCase("saleSubtotalNegative")]
        [TestCase("saleDiscountNegative")]
        [TestCase("paidNegative")]
        [TestCase("changeNegative")]
        [TestCase("serviceNegative")]
        [TestCase("deliveryNegative")]
        [TestCase("taxNegative")]
        public void TryValidateSaleForPrint_RejectsNegativeOrNonPositiveValues(string defect)
        {
            Sale sale = ValidSale();
            SaleItem line = sale.Items[0];
            switch (defect)
            {
                case "qty0": line.QuantityMilli = 0; break;
                case "qtyNegative": line.QuantityMilli = -1000; break;
                case "priceNegative": line.UnitPricePiasters = -1; break;
                case "discountNegative": line.DiscountPiasters = -1; break;
                case "lineTotalNegative": line.TotalPiasters = -1; break;
                case "saleTotalNegative": sale.TotalPiasters = -100; break;
                case "saleSubtotalNegative": sale.SubtotalPiasters = -1; break;
                case "saleDiscountNegative": sale.DiscountPiasters = -1; break;
                case "paidNegative": sale.PaidPiasters = -1; break;
                case "changeNegative": sale.ChangePiasters = -1; break;
                case "serviceNegative": sale.ServiceChargePiasters = -1; break;
                case "deliveryNegative": sale.DeliveryFeePiasters = -1; break;
                case "taxNegative": sale.TaxPiasters = -1; break;
                default: Assert.Fail("unknown defect " + defect); break;
            }
            string error;
            Assert.IsFalse(PrinterService.TryValidateSaleForPrint(sale, out error), defect);
            Assert.IsNotEmpty(error, defect);
        }

        [Test]
        public void IsTransientReceiptSale_OnlyPreBillIdAndTestPilotStatus()
        {
            Assert.IsFalse(PrinterService.IsTransientReceiptSale(null));
            Assert.IsTrue(PrinterService.IsTransientReceiptSale(new Sale { Id = "PRE-BILL" }));
            Assert.IsFalse(PrinterService.IsTransientReceiptSale(new Sale { Id = "pre-bill" }), "the id match is ordinal");
            Assert.IsTrue(PrinterService.IsTransientReceiptSale(new Sale { Id = "any", Status = "TEST_PILOT" }));
            Assert.IsTrue(PrinterService.IsTransientReceiptSale(new Sale { Id = "any", Status = "test_pilot" }));
            Assert.IsFalse(PrinterService.IsTransientReceiptSale(new Sale { Id = "any", Status = "completed" }));
            Assert.IsFalse(PrinterService.IsTransientReceiptSale(new Sale { Id = "any" }));
        }

        [TestCase(null, true)]
        [TestCase("", true)]
        [TestCase("   ", true)]
        [TestCase("cash", true)]
        [TestCase("CASH", true)]
        [TestCase(" cash ", true)]
        [TestCase("credit", false)]
        [TestCase("customer_balance", false)]
        [TestCase("instapay", false)]
        [TestCase("vodafone_cash", false)]
        [TestCase("wallet", false)]
        [TestCase("card", false)]
        public void IsCashRefund_OnlyCashOrEmptyOpensTheDrawer(string method, bool expected)
        {
            Assert.AreEqual(expected, PrinterService.IsCashRefund(method));
        }

        // ------------------------------------------------------------------------------------------
        // TryComputePreBillTotals
        // ------------------------------------------------------------------------------------------

        private sealed class PreBill
        {
            public bool Ok;
            public List<SaleItem> Items;
            public long Gross;
            public long InvoiceDiscount;
            public long Service;
            public string Error;
        }

        private static JObject Line(long quantityMilli, long unitPrice, long discount, bool v2Marker)
        {
            var line = JObject.FromObject(new
            {
                productId = "p1",
                productName = "item",
                quantityMilli = quantityMilli,
                unitPricePiasters = unitPrice,
                discountPiasters = discount,
                unit = "piece"
            });
            if (v2Marker) line["heldFormatVersion"] = 2;
            return line;
        }

        private static string Cart(params JObject[] lines)
        {
            var array = new JArray();
            for (int i = 0; i < lines.Length; i++) array.Add(lines[i]);
            return array.ToString(Formatting.None);
        }

        private static PreBill Compute(string cartJson, long heldSubtotal, long heldDiscount, long heldTotal)
        {
            var r = new PreBill();
            r.Ok = PrinterService.TryComputePreBillTotals(cartJson, heldSubtotal, heldDiscount, heldTotal,
                out r.Items, out r.Gross, out r.InvoiceDiscount, out r.Service, out r.Error);
            return r;
        }

        private static void AssertIdentity(PreBill r, long heldTotal)
        {
            long lineDiscounts = 0;
            long lineNets = 0;
            for (int i = 0; i < r.Items.Count; i++)
            {
                lineDiscounts += r.Items[i].DiscountPiasters;
                lineNets += r.Items[i].TotalPiasters;
            }
            Assert.AreEqual(heldTotal, r.Gross - lineDiscounts - r.InvoiceDiscount + r.Service, "subtotal - line discounts - invoice discount + service = total");
            Assert.AreEqual(r.Gross - lineDiscounts, lineNets, "line totals are gross minus the line discount only");
        }

        [Test]
        public void PreBill_V2Cart_LineDiscountOnly_ServiceFromStoredTotal()
        {
            // 10.00 x 2 with a 1.00 line discount, 12% service on the 190.00 net (22.80), held total 212.80
            PreBill r = Compute(Cart(Line(2000, 10000, 1000, true)), 20000, 0, 21280);

            Assert.IsTrue(r.Ok, r.Error);
            Assert.AreEqual(20000, r.Gross);
            Assert.AreEqual(0, r.InvoiceDiscount);
            Assert.AreEqual(2280, r.Service);
            Assert.AreEqual(1, r.Items.Count);
            Assert.AreEqual(1000, r.Items[0].DiscountPiasters);
            Assert.AreEqual(19000, r.Items[0].TotalPiasters);
            AssertIdentity(r, 21280);
        }

        [Test]
        public void PreBill_LegacyCartWithoutMarker_DoesNotCountTheLineDiscountTwice()
        {
            // Old held carts stored the sum of the line discounts inside the invoice discount as well
            PreBill r = Compute(Cart(Line(2000, 10000, 1000, false)), 20000, 1000, 21280);

            Assert.IsTrue(r.Ok, r.Error);
            Assert.AreEqual(20000, r.Gross);
            Assert.AreEqual(0, r.InvoiceDiscount);
            Assert.AreEqual(2280, r.Service);
            AssertIdentity(r, 21280);
        }

        [Test]
        public void PreBill_LegacyCart_InvoiceDiscountDifferentFromLineDiscounts_IsKept()
        {
            PreBill r = Compute(Cart(Line(2000, 10000, 1000, false)), 20000, 1500, 17500);

            Assert.IsTrue(r.Ok, r.Error);
            Assert.AreEqual(1500, r.InvoiceDiscount);
            Assert.AreEqual(0, r.Service);
            AssertIdentity(r, 17500);
        }

        [Test]
        public void PreBill_V2Marker_KeepsAnInvoiceDiscountThatEqualsTheLineDiscounts()
        {
            PreBill r = Compute(Cart(Line(2000, 10000, 1000, true)), 20000, 1000, 18000);

            Assert.IsTrue(r.Ok, r.Error);
            Assert.AreEqual(1000, r.InvoiceDiscount, "the marker says the held discount is invoice-level only");
            Assert.AreEqual(0, r.Service);
            AssertIdentity(r, 18000);
        }

        [Test]
        public void PreBill_InvoiceDiscountAndService()
        {
            // 10.00 x 1, invoice discount 1.00, service 12% on 9.00 = 1.08, held total 100.80
            PreBill r = Compute(Cart(Line(1000, 10000, 0, false)), 10000, 1000, 10080);

            Assert.IsTrue(r.Ok, r.Error);
            Assert.AreEqual(10000, r.Gross);
            Assert.AreEqual(1000, r.InvoiceDiscount);
            Assert.AreEqual(1080, r.Service);
            Assert.AreEqual(10000, r.Items[0].TotalPiasters, "line stays at the gross price; the invoice discount is not spread into the line");
            AssertIdentity(r, 10080);
        }

        [Test]
        public void PreBill_NoDiscountNoService()
        {
            PreBill r = Compute(Cart(Line(1000, 5000, 0, false)), 5000, 0, 5000);

            Assert.IsTrue(r.Ok, r.Error);
            Assert.AreEqual(5000, r.Gross);
            Assert.AreEqual(0, r.InvoiceDiscount);
            Assert.AreEqual(0, r.Service);
            AssertIdentity(r, 5000);
        }

        [Test]
        public void PreBill_WeighedLine_GrossComesFromPriceTimesMilliQuantity()
        {
            PreBill r = Compute(Cart(Line(1250, 1640, 0, true)), 2050, 0, 2050);

            Assert.IsTrue(r.Ok, r.Error);
            Assert.AreEqual(2050, r.Gross);
            Assert.AreEqual(2050, r.Items[0].TotalPiasters);
            AssertIdentity(r, 2050);
        }

        [Test]
        public void PreBill_HalfPiasterRoundsAwayFromZero()
        {
            // 1.500 x 3.33 = 4.995 => 5.00
            PreBill r = Compute(Cart(Line(1500, 333, 0, true)), 500, 0, 500);

            Assert.IsTrue(r.Ok, r.Error);
            Assert.AreEqual(500, r.Gross);
        }

        [Test]
        public void PreBill_MultipleLines_SumsGrossAndLineDiscounts()
        {
            PreBill r = Compute(Cart(Line(2000, 4200, 500, true), Line(250, 16400, 0, true), Line(3000, 1000, 0, true)), 15500, 500, 16320);

            // gross 8400 + 4100 + 3000 = 15500; line discounts 500; invoice discount 500 => net 14500; service 1820
            Assert.IsTrue(r.Ok, r.Error);
            Assert.AreEqual(15500, r.Gross);
            Assert.AreEqual(500, r.InvoiceDiscount);
            Assert.AreEqual(1820, r.Service);
            Assert.AreEqual(3, r.Items.Count);
            AssertIdentity(r, 16320);
        }

        [Test]
        public void PreBill_LineDiscountLargerThanGross_IsClampedToTheGross()
        {
            PreBill r = Compute(Cart(Line(1000, 1000, 5000, true)), 1000, 0, 0);

            Assert.IsTrue(r.Ok, r.Error);
            Assert.AreEqual(1000, r.Items[0].DiscountPiasters);
            Assert.AreEqual(0, r.Items[0].TotalPiasters);
            AssertIdentity(r, 0);
        }

        [Test]
        public void PreBill_HeldSubtotalNotStored_SkipsOnlyTheSubtotalComparison()
        {
            PreBill r = Compute(Cart(Line(1000, 5000, 0, true)), 0, 0, 5000);

            Assert.IsTrue(r.Ok, r.Error);
            Assert.AreEqual(5000, r.Gross);
        }

        // Each of these must refuse to print. ok=false and an explanatory message are what the caller relies on.
        [TestCase("totalBelowNet")]
        [TestCase("subtotalMismatch")]
        [TestCase("serviceExceedsNet")]
        [TestCase("negativeTotal")]
        [TestCase("invoiceDiscountExceedsNet")]
        public void PreBill_NumbersThatDoNotReconcile_RefuseToPrint(string defect)
        {
            PreBill r = ComputeInconsistent(defect);

            Assert.IsFalse(r.Ok, defect);
            Assert.IsNotEmpty(r.Error, defect);
        }

        // Contract from the task: a refused pre-bill hands the caller no items. TryComputePreBillTotals currently returns the
        // already-parsed lines (and partial totals) when reconciliation fails, so this is expected to fail until it clears them.
        [TestCase("totalBelowNet")]
        [TestCase("subtotalMismatch")]
        [TestCase("serviceExceedsNet")]
        [TestCase("negativeTotal")]
        [TestCase("invoiceDiscountExceedsNet")]
        public void PreBill_RefusedNumbers_ReturnNoItems(string defect)
        {
            PreBill r = ComputeInconsistent(defect);

            Assert.IsFalse(r.Ok, defect);
            Assert.IsNotNull(r.Items, defect);
            Assert.AreEqual(0, r.Items.Count, "no items may leak out of a refused pre-bill: " + defect);
        }

        private static PreBill ComputeInconsistent(string defect)
        {
            switch (defect)
            {
                case "totalBelowNet": return Compute(Cart(Line(1000, 10000, 0, true)), 10000, 0, 9000);
                case "subtotalMismatch": return Compute(Cart(Line(1000, 10000, 0, true)), 9999, 0, 10000);
                case "serviceExceedsNet": return Compute(Cart(Line(1000, 1000, 0, true)), 1000, 0, 3000);
                case "negativeTotal": return Compute(Cart(Line(1000, 1000, 0, true)), 1000, 0, -1);
                case "invoiceDiscountExceedsNet": return Compute(Cart(Line(1000, 10000, 0, true)), 10000, 11000, 0);
                default: throw new ArgumentException(defect);
            }
        }

        [TestCase(null)]
        [TestCase("")]
        [TestCase("[]")]
        [TestCase("[null]")]
        [TestCase("not json at all")]
        [TestCase("{}")]
        [TestCase("{\"a\":1}")]
        public void PreBill_EmptyOrUnreadableCart_FailsWithEmptyItems(string cartJson)
        {
            PreBill r = Compute(cartJson, 1000, 0, 1000);

            Assert.IsFalse(r.Ok);
            Assert.IsNotEmpty(r.Error);
            Assert.IsNotNull(r.Items);
            Assert.AreEqual(0, r.Items.Count);
        }

        [TestCase(0L, 1000L, 0L)]       // quantity 0
        [TestCase(-1000L, 1000L, 0L)]   // negative quantity
        [TestCase(1000L, -1L, 0L)]      // negative price
        [TestCase(1000L, 1000L, -1L)]   // negative line discount
        public void PreBill_InvalidLineValues_RefuseToPrint(long quantityMilli, long unitPrice, long discount)
        {
            PreBill r = Compute(Cart(Line(quantityMilli, unitPrice, discount, true)), 1000, 0, 1000);

            Assert.IsFalse(r.Ok);
            Assert.IsNotEmpty(r.Error);
        }

        // ------------------------------------------------------------------------------------------
        // Receipt totals identity (ComputeReceiptTotals is private: invoked through reflection)
        // ------------------------------------------------------------------------------------------

        private static Dictionary<string, long> ReceiptTotals(Sale sale)
        {
            MethodInfo method = typeof(PrinterService).GetMethod("ComputeReceiptTotals", BindingFlags.NonPublic | BindingFlags.Static);
            Assert.IsNotNull(method, "PrinterService.ComputeReceiptTotals was renamed or removed");
            object totals = method.Invoke(null, new object[] { sale });
            var values = new Dictionary<string, long>();
            foreach (FieldInfo field in totals.GetType().GetFields(BindingFlags.Public | BindingFlags.Instance))
            {
                if (field.FieldType == typeof(long)) values[field.Name] = (long)field.GetValue(totals);
            }
            return values;
        }

        // Same numbers as PrinterHardwareTestRunner test 6 (prices include VAT; total = items 17600 - invoice discount 500)
        private static Sale HardwareFixtureSale()
        {
            return new Sale
            {
                Id = "sale_full_render_test",
                InvoiceNumber = 1002,
                CreatedAt = "2026-01-01T10:00:00",
                PaymentMethod = "cash",
                SubtotalPiasters = 17600,
                DiscountPiasters = 500,
                TaxPiasters = 2100,
                TotalPiasters = 17100,
                PaidPiasters = 20000,
                ChangePiasters = 2900,
                Items = new List<SaleItem>
                {
                    new SaleItem { ProductName = "a", QuantityMilli = 3000, UnitPricePiasters = 3500, TotalPiasters = 10500, Unit = "piece" },
                    new SaleItem { ProductName = "b", QuantityMilli = 250, UnitPricePiasters = 16400, TotalPiasters = 4100, Unit = "kg" },
                    new SaleItem { ProductName = "c", QuantityMilli = 500, UnitPricePiasters = 6000, TotalPiasters = 3000, Unit = "piece" }
                }
            };
        }

        [Test]
        public void HardwareFixture_TotalsIdentityAndPaymentIdentityHold()
        {
            Sale sale = HardwareFixtureSale();
            long gross = 0;
            for (int i = 0; i < sale.Items.Count; i++)
            {
                gross += Money.FromPiasters(sale.Items[i].UnitPricePiasters).MultiplyByMilliUnits(sale.Items[i].QuantityMilli).Piasters;
            }
            Assert.AreEqual(17600, gross, "price x quantity of the lines equals the stored subtotal");
            Assert.AreEqual(sale.SubtotalPiasters, gross);

            Dictionary<string, long> t = ReceiptTotals(sale);
            Assert.AreEqual(17600, t["Subtotal"]);
            Assert.AreEqual(500, t["DiscountTotal"]);
            Assert.AreEqual(2100, t["Tax"]);
            Assert.AreEqual(17100, t["Total"]);
            Assert.AreEqual(20000, t["Paid"]);
            Assert.AreEqual(2900, t["Change"]);
            Assert.AreEqual(0, t["Remaining"]);
            Assert.AreEqual(t["Total"], t["Subtotal"] - t["DiscountTotal"] + t["ServiceCharge"] + t["DeliveryFee"], "subtotal - discounts + fees = total");
            Assert.AreEqual(t["Total"], t["Paid"] - t["Change"], "paid - change = total");
        }

        [Test]
        public void ReceiptTotals_MatchTheFrontendGoldenVector()
        {
            // Same basket as frontend/test/receipt_layout.test.js "totals: displayed gross lines add up..."
            Sale sale = new Sale
            {
                Id = "s",
                SubtotalPiasters = 44900,
                DiscountPiasters = 1500,
                TotalPiasters = 42900,
                PaidPiasters = 50000,
                PaymentMethod = "cash",
                Payments = new List<SalePayment> { new SalePayment { Method = "cash", AmountPiasters = 50000 } },
                Items = new List<SaleItem>
                {
                    new SaleItem { ProductName = "a", QuantityMilli = 2000, UnitPricePiasters = 4200, Unit = "piece" },
                    new SaleItem { ProductName = "b", QuantityMilli = 1250, UnitPricePiasters = 16400, DiscountPiasters = 500, Unit = "kg" },
                    new SaleItem { ProductName = "c", QuantityMilli = 12000, UnitPricePiasters = 2700, Unit = "piece" }
                }
            };

            Dictionary<string, long> t = ReceiptTotals(sale);

            Assert.AreEqual(44900, t["Subtotal"]);
            Assert.AreEqual(2000, t["DiscountTotal"]);
            Assert.AreEqual(42900, t["Total"]);
            Assert.AreEqual(t["Total"], t["Subtotal"] - t["DiscountTotal"]);
            Assert.IsFalse(t.ContainsKey("PieceCount") || t.ContainsKey("ItemCount"), "the invoice no longer prints item / piece counts");
            Assert.AreEqual(50000, t["Paid"]);
            Assert.AreEqual(7100, t["Change"]);
            Assert.AreEqual(0, t["Remaining"]);
        }

        private static long ParsePrintedMoney(string text)
        {
            return long.Parse(text.Replace(",", "").Replace(".", ""), System.Globalization.CultureInfo.InvariantCulture);
        }

        [Test]
        public void SaleReceipt_PrintedGrossLinesSumToSubtotal_ThenOneTotalDiscount_ThenTotal()
        {
            // line discounts (500 + 300) + invoice discount 1500 + a weighed line: lines print GROSS, the one discount row sums all of them
            // gross lines: 2 x 42.00 = 8400, 1.250 x 164.00 = 20500, 12 x 27.00 = 32400 => stored subtotal 61300
            Sale sale = new Sale
            {
                Id = "s",
                SubtotalPiasters = 61300,
                DiscountPiasters = 1500,
                PaidPiasters = 50000,
                PaymentMethod = "cash",
                Items = new List<SaleItem>
                {
                    new SaleItem { ProductName = "a", QuantityMilli = 2000, UnitPricePiasters = 4200, DiscountPiasters = 300, Unit = "piece" },
                    new SaleItem { ProductName = "b", QuantityMilli = 1250, UnitPricePiasters = 16400, DiscountPiasters = 500, Unit = "kg" },
                    new SaleItem { ProductName = "c", QuantityMilli = 12000, UnitPricePiasters = 2700, Unit = "piece" }
                }
            };
            sale.TotalPiasters = sale.SubtotalPiasters - (300 + 500 + 1500);

            MethodInfo build = typeof(PrinterService).GetMethod("BuildSaleReceiptLines", BindingFlags.NonPublic | BindingFlags.Static);
            Assert.IsNotNull(build, "PrinterService.BuildSaleReceiptLines was renamed or removed");
            System.Collections.IEnumerable lines = (System.Collections.IEnumerable)build.Invoke(null, new object[] { sale });

            long printedSum = 0;
            foreach (object line in lines)
            {
                Assert.IsNull(line.GetType().GetField("Discount"), "no per-line discount sub-line exists any more");
                printedSum += ParsePrintedMoney((string)line.GetType().GetField("Total").GetValue(line));
            }

            Dictionary<string, long> t = ReceiptTotals(sale);
            Assert.AreEqual(t["Subtotal"], printedSum, "printed line totals add up to the pre-discount subtotal row");
            Assert.AreEqual(2300, t["DiscountTotal"], "ONE discount row = line discounts + invoice discount");
            Assert.AreEqual(t["Total"], printedSum - t["DiscountTotal"] + t["ServiceCharge"] + t["DeliveryFee"], "subtotal - total discount (+ fees) = final total");
        }

        [TestCase("retail", 41, "")]
        [TestCase("", 41, "")]
        [TestCase("takeaway", 7, "نداء 7")]
        [TestCase("dine_in", 7, "نداء 7 - صالة")]
        [TestCase("delivery", 7, "نداء 7 - توصيل")]
        public void BuildOrderMetaText_CallNumberIsForCafeOrdersOnly(string orderType, int callNumber, string expected)
        {
            MethodInfo meta = typeof(PrinterService).GetMethod("BuildOrderMetaText", BindingFlags.NonPublic | BindingFlags.Static);
            Assert.IsNotNull(meta, "PrinterService.BuildOrderMetaText was renamed or removed");
            Sale sale = new Sale { Id = "s", OrderType = orderType, OrderCallNumber = callNumber };
            Assert.AreEqual(expected, (string)meta.Invoke(null, new object[] { sale }));
        }

        [Test]
        public void ReceiptTotals_DiscountIsLineDiscountsPlusInvoiceDiscount_Once()
        {
            Sale sale = new Sale
            {
                Id = "s",
                SubtotalPiasters = 10000,
                DiscountPiasters = 100,
                TotalPiasters = 9400,
                PaidPiasters = 9400,
                PaymentMethod = "cash",
                Items = new List<SaleItem>
                {
                    new SaleItem { ProductName = "a", QuantityMilli = 1000, UnitPricePiasters = 5000, DiscountPiasters = 500, TotalPiasters = 4453, Unit = "piece" },
                    new SaleItem { ProductName = "b", QuantityMilli = 1000, UnitPricePiasters = 3600, TotalPiasters = 3562, Unit = "piece" },
                    new SaleItem { ProductName = "c", QuantityMilli = 1000, UnitPricePiasters = 1400, TotalPiasters = 1385, Unit = "piece" }
                }
            };

            Dictionary<string, long> t = ReceiptTotals(sale);
            Assert.AreEqual(10000, t["Subtotal"]);
            Assert.AreEqual(600, t["DiscountTotal"]);
            Assert.AreEqual(9400, t["Total"]);
            Assert.AreEqual(t["Total"], t["Subtotal"] - t["DiscountTotal"]);
        }

        // ------------------------------------------------------------------------------------------
        // SaleService.ProcessTestSale discount convention
        // ------------------------------------------------------------------------------------------

        private static SaleItem Unit(long unitPrice, long discount)
        {
            return new SaleItem { ProductName = "x", QuantityMilli = 1000, UnitPricePiasters = unitPrice, DiscountPiasters = discount, Unit = "piece" };
        }

        [Test]
        public void ProcessTestSale_InvoiceDiscountIsDistributedProportionally_AndNeverDoubleCounted()
        {
            // nets 50.00 / 36.00 / 14.00 and a 1.00 invoice discount: shares 0.50 / 0.36 / 0.14 (86 + 14)
            var service = new SaleService(null, null);
            Sale sale = service.ProcessTestSale(new Sale
            {
                DiscountPiasters = 100,
                Items = new List<SaleItem> { Unit(5000, 0), Unit(3600, 0), Unit(1400, 0) }
            });

            Assert.AreEqual("TEST_PILOT", sale.Status);
            Assert.AreEqual(0, sale.InvoiceNumber);
            Assert.IsTrue(sale.Id.StartsWith("test_sale_", StringComparison.Ordinal));
            Assert.IsTrue(PrinterService.IsTransientReceiptSale(sale));

            Assert.AreEqual(10000, sale.SubtotalPiasters);
            Assert.AreEqual(100, sale.DiscountPiasters, "sale.DiscountPiasters is the invoice-level discount");
            Assert.AreEqual(9900, sale.TotalPiasters);
            Assert.AreEqual(9900, sale.PaidPiasters);

            Assert.AreEqual(0, sale.Items[0].DiscountPiasters, "line DiscountPiasters is the line discount only");
            Assert.AreEqual(0, sale.Items[1].DiscountPiasters);
            Assert.AreEqual(0, sale.Items[2].DiscountPiasters);
            Assert.AreEqual(4950, sale.Items[0].TotalPiasters);
            Assert.AreEqual(3564, sale.Items[1].TotalPiasters);
            Assert.AreEqual(1386, sale.Items[2].TotalPiasters);
            Assert.AreEqual(sale.TotalPiasters, sale.Items[0].TotalPiasters + sale.Items[1].TotalPiasters + sale.Items[2].TotalPiasters);

            Dictionary<string, long> t = ReceiptTotals(sale);
            Assert.AreEqual(10000, t["Subtotal"]);
            Assert.AreEqual(100, t["DiscountTotal"], "1.00 appears once, not 2.00");
            Assert.AreEqual(9900, t["Total"]);
            Assert.AreEqual(t["Total"], t["Subtotal"] - t["DiscountTotal"] + t["ServiceCharge"] + t["DeliveryFee"]);
        }

        [Test]
        public void ProcessTestSale_LineDiscountPlusInvoiceDiscount_KeepsBothSeparate()
        {
            var service = new SaleService(null, null);
            Sale sale = service.ProcessTestSale(new Sale
            {
                DiscountPiasters = 100,
                Items = new List<SaleItem> { Unit(5000, 500), Unit(3600, 0), Unit(1400, 0) }
            });

            Assert.AreEqual(10000, sale.SubtotalPiasters);
            Assert.AreEqual(100, sale.DiscountPiasters);
            Assert.AreEqual(500, sale.Items[0].DiscountPiasters, "the line discount stays on the line");
            Assert.AreEqual(0, sale.Items[1].DiscountPiasters);
            Assert.AreEqual(9400, sale.TotalPiasters);
            // largest remainder: nets 4500 / 3600 / 1400 share 100 as 47 / 38 / 15
            Assert.AreEqual(4453, sale.Items[0].TotalPiasters);
            Assert.AreEqual(3562, sale.Items[1].TotalPiasters);
            Assert.AreEqual(1385, sale.Items[2].TotalPiasters);
            Assert.AreEqual(sale.TotalPiasters, sale.Items[0].TotalPiasters + sale.Items[1].TotalPiasters + sale.Items[2].TotalPiasters);

            Dictionary<string, long> t = ReceiptTotals(sale);
            Assert.AreEqual(600, t["DiscountTotal"]);
            Assert.AreEqual(t["Total"], t["Subtotal"] - t["DiscountTotal"]);
        }

        [Test]
        public void ProcessTestSale_InvoiceDiscountAboveTheNet_IsClampedAndTotalNeverNegative()
        {
            var service = new SaleService(null, null);
            Sale sale = service.ProcessTestSale(new Sale
            {
                DiscountPiasters = 99999,
                Items = new List<SaleItem> { Unit(5000, 0), Unit(5000, 0) }
            });

            Assert.AreEqual(10000, sale.DiscountPiasters);
            Assert.AreEqual(0, sale.TotalPiasters);
            Assert.AreEqual(0, sale.Items[0].TotalPiasters + sale.Items[1].TotalPiasters);
        }

        [Test]
        public void ProcessTestSale_WithoutInput_BuildsTheSampleSale()
        {
            Sale sale = new SaleService(null, null).ProcessTestSale(null);

            Assert.AreEqual("TEST_PILOT", sale.Status);
            Assert.AreEqual(1, sale.Items.Count);
            Assert.AreEqual(2500, sale.SubtotalPiasters);
            Assert.AreEqual(2500, sale.TotalPiasters);
            string error;
            Assert.IsTrue(PrinterService.TryValidateSaleForPrint(sale, out error), error);
        }

        // ------------------------------------------------------------------------------------------
        // ToPrintResponse (private in IpcDispatcher: invoked through reflection)
        // ------------------------------------------------------------------------------------------

        private static BridgeResponse ToPrintResponse(string requestId, PrintResult result)
        {
            MethodInfo method = typeof(IpcDispatcher).GetMethod("ToPrintResponse", BindingFlags.NonPublic | BindingFlags.Static);
            Assert.IsNotNull(method, "IpcDispatcher.ToPrintResponse was renamed or removed");
            return (BridgeResponse)method.Invoke(null, new object[] { requestId, result });
        }

        [Test]
        public void ToPrintResponse_FailedPrint_IsPrintFailedWithPrinterUsed()
        {
            var failed = new PrintResult { Success = false, Message = "no paper", PrinterUsed = "XP-80" };

            BridgeResponse response = ToPrintResponse("req-1", failed);

            Assert.IsFalse(response.Success);
            Assert.AreEqual("req-1", response.Id);
            Assert.IsNotNull(response.Error);
            Assert.AreEqual("PRINT_FAILED", response.Error.Code);
            Assert.AreEqual("no paper", response.Error.Message);
            Assert.IsNotNull(response.Error.Details);
            Assert.AreEqual("XP-80", (string)JObject.FromObject(response.Error.Details)["printerUsed"]);
        }

        [TestCase(null)]
        [TestCase("")]
        [TestCase("   ")]
        public void ToPrintResponse_FailedPrintWithoutMessage_StillExplains(string message)
        {
            BridgeResponse response = ToPrintResponse("req-2", new PrintResult { Success = false, Message = message, PrinterUsed = "P" });

            Assert.IsFalse(response.Success);
            Assert.AreEqual("PRINT_FAILED", response.Error.Code);
            Assert.IsFalse(string.IsNullOrWhiteSpace(response.Error.Message));
        }

        [Test]
        public void ToPrintResponse_NullResult_IsPrintFailed()
        {
            BridgeResponse response = ToPrintResponse("req-3", null);

            Assert.IsFalse(response.Success);
            Assert.AreEqual("PRINT_FAILED", response.Error.Code);
        }

        [Test]
        public void ToPrintResponse_SuccessfulPrint_IsReturnedUnchanged()
        {
            var ok = new PrintResult { Success = true, Message = "done", PrinterUsed = "XP-80" };

            BridgeResponse response = ToPrintResponse("req-4", ok);

            Assert.IsTrue(response.Success);
            Assert.AreEqual("req-4", response.Id);
            Assert.IsNull(response.Error);
            Assert.AreSame(ok, response.Data);
        }

        // ------------------------------------------------------------------------------------------
        // Raster banding: > 8192 rows are rendered in 4096-row bands, every band split into 256-row GS v 0 chunks
        // ------------------------------------------------------------------------------------------

        /// <summary>Row y is painted black for its first (y % 100) + 1 pixels: any lost, duplicated or shifted row changes the bytes.</summary>
        public sealed class RowPatternPainter
        {
            public int Rows;

            public float Paint(Graphics g, int contentWidth)
            {
                for (int y = 0; y < Rows; y++)
                {
                    g.FillRectangle(Brushes.Black, 0, y, (y % 100) + 1, 1);
                }
                return Rows;
            }
        }

        private static byte[] BuildRasterBytes(int rows, int pixelWidth)
        {
            Type jobType = typeof(PrinterService).GetNestedType("ReceiptRenderJob", BindingFlags.NonPublic);
            Type paintType = typeof(PrinterService).GetNestedType("ReceiptPaintFunc", BindingFlags.NonPublic);
            MethodInfo build = typeof(PrinterService).GetMethod("BuildReceiptEscPos", BindingFlags.NonPublic | BindingFlags.Instance);
            Assert.IsNotNull(jobType, "PrinterService.ReceiptRenderJob was renamed or removed");
            Assert.IsNotNull(paintType, "PrinterService.ReceiptPaintFunc was renamed or removed");
            Assert.IsNotNull(build, "PrinterService.BuildReceiptEscPos was renamed or removed");

            var painter = new RowPatternPainter { Rows = rows };
            object job = Activator.CreateInstance(jobType, true);
            SetJobField(jobType, job, "Paint", Delegate.CreateDelegate(paintType, painter, typeof(RowPatternPainter).GetMethod("Paint")));
            SetJobField(jobType, job, "ContentWidth", pixelWidth);
            SetJobField(jobType, job, "PixelWidth", pixelWidth);
            SetJobField(jobType, job, "Scale", 1f);
            SetJobField(jobType, job, "PixelHeight", rows);

            // no settings service: pulse and pin fall back to their defaults
            var printer = new PrinterService(null);
            return (byte[])build.Invoke(printer, new object[] { job, false, true });
        }

        private static void SetJobField(Type jobType, object job, string name, object value)
        {
            FieldInfo field = jobType.GetField(name, BindingFlags.Public | BindingFlags.Instance);
            Assert.IsNotNull(field, "ReceiptRenderJob." + name + " was renamed or removed");
            field.SetValue(job, value);
        }

        private static byte[] ExpectedRow(int row, int pixelWidth)
        {
            int bytesPerLine = (pixelWidth + 7) / 8;
            int blackPixels = (row % 100) + 1;
            var bytes = new byte[bytesPerLine];
            for (int x = 0; x < blackPixels; x++)
            {
                bytes[x / 8] |= (byte)(0x80 >> (x % 8));
            }
            return bytes;
        }

        [TestCase(1, 576)]
        [TestCase(255, 576)]
        [TestCase(256, 576)]
        [TestCase(257, 576)]
        [TestCase(4096, 576)]
        [TestCase(8191, 576)]
        [TestCase(8192, 576)]
        [TestCase(8193, 576)]
        [TestCase(12288, 576)]
        [TestCase(8193, 384)]
        public void TallReceipt_RowsArePreservedExactly_AndGsV0HeadersAreCorrect(int rows, int pixelWidth)
        {
            byte[] data = BuildRasterBytes(rows, pixelWidth);
            int bytesPerLine = (pixelWidth + 7) / 8;

            // ESC @, ESC a 1 (no drawer kick requested) ... raster ... partial cut sequence
            Assert.GreaterOrEqual(data.Length, 5 + 8);
            Assert.AreEqual(0x1B, data[0]);
            Assert.AreEqual(0x40, data[1]);
            Assert.AreEqual(0x1B, data[2]);
            Assert.AreEqual(0x61, data[3]);
            Assert.AreEqual(0x01, data[4]);

            byte[] cut = RawPrinterHelper.PaperCutSequence;
            int end = data.Length - cut.Length;
            for (int i = 0; i < cut.Length; i++)
            {
                Assert.AreEqual(cut[i], data[end + i], "paper cut sequence byte " + i);
            }

            int pos = 5;
            int row = 0;
            var chunks = new List<int>();
            while (pos < end)
            {
                Assert.LessOrEqual(pos + 8, end, "truncated GS v 0 header");
                Assert.AreEqual(0x1D, data[pos], "GS");
                Assert.AreEqual(0x76, data[pos + 1], "v");
                Assert.AreEqual(0x30, data[pos + 2], "0");
                Assert.AreEqual(0x00, data[pos + 3], "m");
                int xBytes = data[pos + 4] | (data[pos + 5] << 8);
                int chunk = data[pos + 6] | (data[pos + 7] << 8);
                Assert.AreEqual(bytesPerLine, xBytes, "xL xH");
                Assert.IsTrue(chunk >= 1 && chunk <= 256, "chunk of " + chunk + " rows at row " + row);
                pos += 8;

                Assert.LessOrEqual(pos + (long)chunk * bytesPerLine, (long)end, "truncated raster data");
                for (int r = 0; r < chunk; r++)
                {
                    byte[] expected = ExpectedRow(row + r, pixelWidth);
                    for (int b = 0; b < bytesPerLine; b++)
                    {
                        if (data[pos + b] != expected[b])
                        {
                            Assert.Fail(string.Format("row {0}: byte {1} is 0x{2:X2}, expected 0x{3:X2} (a row was lost, duplicated or shifted)", row + r, b, data[pos + b], expected[b]));
                        }
                    }
                    pos += bytesPerLine;
                }
                chunks.Add(chunk);
                row += chunk;
            }

            Assert.AreEqual(end, pos, "raster data must end exactly where the cut sequence starts");
            Assert.AreEqual(rows, row, "total rows");

            int expectedChunks = (rows + 255) / 256;
            Assert.AreEqual(expectedChunks, chunks.Count, "chunk count");
            for (int c = 0; c < chunks.Count - 1; c++)
            {
                Assert.AreEqual(256, chunks[c], "every chunk but the last is 256 rows");
            }
            Assert.AreEqual(rows - 256 * (expectedChunks - 1), chunks[chunks.Count - 1], "last chunk");
        }

        [Test]
        public void TallReceipt_ChunkHeaderEncodesRowCountsAbove255_InTheHighByte()
        {
            byte[] data = BuildRasterBytes(300, 576);

            // first chunk 256 rows => yL = 0x00, yH = 0x01; second chunk 44 rows => yL = 0x2C, yH = 0x00
            Assert.AreEqual(0x00, data[5 + 6]);
            Assert.AreEqual(0x01, data[5 + 7]);
            int second = 5 + 8 + 256 * 72;
            Assert.AreEqual(0x1D, data[second]);
            Assert.AreEqual(0x2C, data[second + 6]);
            Assert.AreEqual(0x00, data[second + 7]);
            Assert.AreEqual(72, data[5 + 4], "xL for 576 px");
            Assert.AreEqual(0, data[5 + 5], "xH for 576 px");
        }
    }
}
