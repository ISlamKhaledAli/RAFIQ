using System;
using System.Collections.Generic;
using RafiqPOS.Data;
using NUnit.Framework;
using RafiqPOS.Common;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    /// <summary>
    /// L1 + L5 (المرحلة 1): تكلفة السطر = الكمية x تكلفة الوحدة / 1000 بتقريب نصف لأعلى بشكل موحد في كل تقارير الربح
    /// وفي عكس تكلفة المرتجع (1.5 كجم x 3.33 = 4.995 تصبح 5.00 لا 4.99)، وتوزيع خصم الفاتورة يرفض التجاوز ويحافظ على المجموع.
    /// </summary>
    [TestFixture]
    [NonParallelizable]
    public class S42_CostRoundingAndDiscountDistributionTest : TestBase
    {
        private Shift _shift;
        private Product _product;

        private void OpenShiftAndCreateKiloProduct()
        {
            _shift = OpenTestShift("usr_cashier_1", "كاشير 1", 100000);
            // سعر الكيلو 10.00 ج وتكلفته 3.33 ج
            _product = ProductService.SaveProduct(new Product
            {
                Name = "صنف بالكيلو",
                Barcode = "BAR_" + Guid.NewGuid().ToString("N").Substring(0, 8),
                PricePiasters = 1000,
                CostPiasters = 333,
                StockQuantityMilli = 100000,
                Unit = "kg",
                IsActive = true
            }, true, true);
        }

        private Sale SellOneAndHalfKilo()
        {
            var sale = SaleService.ProcessSale(new Sale
            {
                ShiftId = _shift.Id,
                CashierId = _shift.CashierId,
                CashierName = _shift.CashierName,
                PaymentMethod = "cash",
                PaidPiasters = 1500,
                Items = new List<SaleItem>
                {
                    new SaleItem { ProductId = _product.Id, ProductName = _product.Name, QuantityMilli = 1500, UnitPricePiasters = 1000, TotalPiasters = 1500 }
                }
            }, null);
            Assert.AreEqual(1500, sale.TotalPiasters, "1.5 كجم x 10.00 ج");
            return sale;
        }

        // ---------- L1 ----------

        [Test]
        public void Cost_Of_1500Milli_Times_333_RoundsHalfUpToFiveHundred_InEveryProfitReport()
        {
            OpenShiftAndCreateKiloProduct();
            SellOneAndHalfKilo();

            // الربح = 1500 - 500 = 1000 (بالتقطيع القديم كانت التكلفة 499 والربح 1001)
            string bDate = DailyClosingService.GetCurrentBusinessDate();
            Assert.AreEqual(1000, DailyClosingService.GetClosingPreview(bDate).GrossProfitPiasters, "ربح تقرير Z");

            var reports = new ReportsService(ConnectionString);
            Assert.AreEqual(1000, reports.GetTodaySummary().TodayProfitsPiasters, "ربح لوحة التحكم");
            Assert.AreEqual(1000, reports.GetPeriodSalesReport("today", null, null).GrossProfitPiasters, "ربح تقرير الفترة");

            var row = FindRow(reports);
            Assert.AreEqual(1500, row.TotalSalesPiasters, "مبيعات الصنف");
            Assert.AreEqual(500, row.TotalCostPiasters, "تكلفة الصنف مقربة لأعلى");
            Assert.AreEqual(1000, row.GrossProfitPiasters, "ربح الصنف");
        }

        [Test]
        public void ReturnOfFiveHundredMilli_RecoversOneSixtySevenOfCost_AndEveryReportAgrees()
        {
            OpenShiftAndCreateKiloProduct();
            var sale = SellOneAndHalfKilo();

            var ret = ReturnService.ProcessReturn(new Return
            {
                SaleId = sale.Id,
                CashierId = _shift.CashierId,
                RefundMethod = "cash",
                Reason = "مرتجع جزئي بالوزن",
                Items = new List<ReturnItem>
                {
                    new ReturnItem { SaleItemId = sale.Items[0].Id, ProductId = _product.Id, ProductName = _product.Name, QuantityMilli = 500 }
                }
            });
            Assert.AreEqual(500, ret.TotalPiasters, "استرداد نصف كيلو = 5.00 ج");

            // تكلفة المرتجع المستردة = 0.5 x 3.33 = 1.665 تقرب إلى 1.67؛ الربح المعكوس = 500 - 167 = 333
            long returnedProfit;
            long returnedTax;
            using (var conn = new SQLiteConnection(ConnectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand(ReturnProfitSql.BuildTotals("r.sale_id = @sid"), conn))
                {
                    cmd.Parameters.AddWithValue("@sid", sale.Id);
                    using (var reader = cmd.ExecuteReader())
                    {
                        Assert.IsTrue(reader.Read());
                        returnedProfit = Convert.ToInt64(reader["returned_profit"]);
                        returnedTax = Convert.ToInt64(reader["returned_tax"]);
                    }
                }
            }
            Assert.AreEqual(500 - 167, returnedProfit, "الربح المعكوس: إيراد 500 ناقص تكلفة مستردة 167");
            Assert.AreEqual(0, returnedTax, "لا ضريبة على الصنف");

            // الربح المتبقي: 1000 - 333 = 667 (إيراد 1000، تكلفة 500 - 167 = 333) في كل التقارير
            string bDate = DailyClosingService.GetCurrentBusinessDate();
            Assert.AreEqual(667, DailyClosingService.GetClosingPreview(bDate).GrossProfitPiasters, "ربح تقرير Z");

            var reports = new ReportsService(ConnectionString);
            Assert.AreEqual(667, reports.GetTodaySummary().TodayProfitsPiasters, "ربح لوحة التحكم");
            Assert.AreEqual(667, reports.GetPeriodSalesReport("today", null, null).GrossProfitPiasters, "ربح تقرير الفترة");

            var row = FindRow(reports);
            Assert.AreEqual(1000, row.TotalSalesPiasters, "صافي مبيعات الصنف بعد المرتجع");
            Assert.AreEqual(333, row.TotalCostPiasters, "تكلفة الصنف بعد استرداد 167");
            Assert.AreEqual(667, row.GrossProfitPiasters, "ربح الصنف بعد المرتجع");
        }

        private ItemProfitabilityItem FindRow(ReportsService reports)
        {
            var items = reports.GetItemProfitability("today", 20, "desc");
            var row = items.Find(delegate (ItemProfitabilityItem i) { return i.ProductId == _product.Id; });
            Assert.IsNotNull(row, "الصنف يظهر في ربحية الأصناف");
            return row;
        }

        // ---------- L5 ----------

        [Test]
        public void DistributeInvoiceDiscount_OverflowingInvoice_RaisesInvalidOperationException()
        {
            long half = long.MaxValue / 2;
            Assert.Throws<InvalidOperationException>(delegate
            {
                Money.DistributeInvoiceDiscount(new long[] { half, half }, long.MaxValue / 3);
            });
        }

        [Test]
        public void DistributeInvoiceDiscount_SplitsByLargestRemainder_AndKeepsTheTotal()
        {
            long[] shares = Money.DistributeInvoiceDiscount(new long[] { 3333, 3333, 3334 }, 100);

            Assert.AreEqual(new long[] { 33, 33, 34 }, shares, "الباقي (قرش) للأكبر باقياً");
            Assert.AreEqual(100, shares[0] + shares[1] + shares[2], "المجموع = الخصم");
        }

        [Test]
        public void DistributeInvoiceDiscount_NeverLosesOrInventsPiasters()
        {
            long[][] invoices = new long[][]
            {
                new long[] { 1, 1, 1 },
                new long[] { 100, 200, 300 },
                new long[] { 999, 1, 5000 },
                new long[] { 3333, 3333, 3334 }
            };
            long[] discounts = new long[] { 1, 2, 7, 99, 100, 5999 };

            for (int i = 0; i < invoices.Length; i++)
            {
                long gross = 0;
                for (int g = 0; g < invoices[i].Length; g++) gross += invoices[i][g];

                for (int d = 0; d < discounts.Length; d++)
                {
                    long expected = Math.Min(discounts[d], gross);
                    long[] shares = Money.DistributeInvoiceDiscount(invoices[i], discounts[d]);
                    long sum = 0;
                    for (int s = 0; s < shares.Length; s++)
                    {
                        sum += shares[s];
                        Assert.GreaterOrEqual(shares[s], 0L, "حصة سالبة");
                        Assert.LessOrEqual(shares[s], invoices[i][s], "حصة تتجاوز قيمة السطر");
                    }
                    Assert.AreEqual(expected, sum, "المجموع يساوي الخصم (أو قيمة الفاتورة إن كان أكبر)");
                }
            }
        }
    }
}
