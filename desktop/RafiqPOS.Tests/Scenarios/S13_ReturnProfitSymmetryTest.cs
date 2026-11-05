using System;
using System.Collections.Generic;
using NUnit.Framework;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    [TestFixture]
    public class S13_ReturnProfitSymmetryTest : TestBase
    {
        [Test]
        public void Scenario_S13_Returns_Reverse_Profit_Ex_Vat_In_Every_Profit_Report()
        {
            // سعر شامل ضريبة 14%: 11400 = 10000 صافي + 1400 ضريبة، التكلفة 6000
            var shift = OpenTestShift("usr_cashier_1", "كاشير 1", 100000);
            // نسبة الضريبة تُقرأ من الكتالوج فقط (M3): الصنف يحمل 14% ولا تُرسل نسبة من العميل
            var prod = ProductService.SaveProduct(new Product
            {
                Name = "صنف خاضع للضريبة",
                Barcode = "BAR_" + Guid.NewGuid().ToString("N").Substring(0, 8),
                PricePiasters = 11400,
                CostPiasters = 6000,
                StockQuantityMilli = 100000,
                Unit = "piece",
                TaxRatePercent = 14,
                IsActive = true
            }, true, true);

            var sale = SaleService.ProcessSale(new Sale
            {
                ShiftId = shift.Id,
                CashierId = shift.CashierId,
                CashierName = shift.CashierName,
                PaymentMethod = "cash",
                PaidPiasters = 34200,
                Items = new List<SaleItem>
                {
                    new SaleItem { ProductId = prod.Id, ProductName = prod.Name, QuantityMilli = 3000, UnitPricePiasters = 11400, TotalPiasters = 34200 }
                }
            }, null);
            Assert.AreEqual(4200, sale.TaxPiasters, "ضريبة الفاتورة");
            string saleItemId = sale.Items[0].Id;

            // مرتجع وحدة سليمة + وحدة تالفة
            ReturnService.ProcessReturn(new Return
            {
                SaleId = sale.Id,
                CashierId = shift.CashierId,
                ShiftId = shift.Id,
                RefundMethod = "cash",
                Reason = "مرتجع سليم",
                TotalPiasters = 11400,
                Items = new List<ReturnItem>
                {
                    new ReturnItem { SaleItemId = saleItemId, ProductId = prod.Id, ProductName = prod.Name, QuantityMilli = 1000, UnitPricePiasters = 11400, TotalPiasters = 11400 }
                }
            });
            ReturnService.ProcessReturn(new Return
            {
                SaleId = sale.Id,
                CashierId = shift.CashierId,
                ShiftId = shift.Id,
                RefundMethod = "cash",
                Reason = "مرتجع تالف",
                TotalPiasters = 11400,
                Items = new List<ReturnItem>
                {
                    new ReturnItem { SaleItemId = saleItemId, ProductId = prod.Id, ProductName = prod.Name, QuantityMilli = 1000, UnitPricePiasters = 11400, TotalPiasters = 11400, IsDamaged = true }
                }
            });

            // صافي المبيعات بدون ضريبة = 30000 - 20000 = 10000
            // صافي التكلفة = 18000 - 6000 (السليم فقط يعود للمخزون) = 12000
            // مجمل الربح = 10000 - 12000 = -2000
            const long expectedProfit = -2000;
            const long expectedNetExVat = 10000;

            string bDate = DailyClosingService.GetCurrentBusinessDate();
            Assert.AreEqual(expectedProfit, DailyClosingService.GetClosingPreview(bDate).GrossProfitPiasters, "مجمل ربح تقرير Z");

            var reports = new ReportsService(ConnectionString);
            var dashboard = reports.GetTodaySummary();
            Assert.AreEqual(expectedProfit, dashboard.TodayProfitsPiasters, "مجمل ربح لوحة التحكم");
            Assert.AreEqual(expectedNetExVat, dashboard.TodayNetSalesExcludingTaxPiasters, "صافي المبيعات بدون ضريبة في لوحة التحكم");

            var period = reports.GetPeriodSalesReport("today", null, null);
            Assert.AreEqual(expectedProfit, period.GrossProfitPiasters, "مجمل ربح تقرير الفترة");
            Assert.AreEqual(expectedNetExVat, period.NetSalesExcludingTaxPiasters, "صافي مبيعات الفترة بدون ضريبة");

            var items = reports.GetItemProfitability("today", 20, "desc");
            var row = items.Find(delegate (ItemProfitabilityItem i) { return i.ProductId == prod.Id; });
            Assert.IsNotNull(row, "الصنف يظهر في ربحية الأصناف");
            Assert.AreEqual(expectedNetExVat, row.TotalSalesPiasters, "صافي مبيعات الصنف بعد المرتجع");
            Assert.AreEqual(12000, row.TotalCostPiasters, "تكلفة الصنف بعد المرتجع");
            Assert.AreEqual(expectedProfit, row.GrossProfitPiasters, "ربح الصنف بعد المرتجع");
            Assert.AreEqual(1000, row.QuantitySoldMilli, "الكمية الصافية المباعة");
            Assert.IsTrue(row.IsNegativeMargin, "هامش سالب يظهر كما هو");

            var categories = reports.GetCategoryPerformance("today", null, null);
            Assert.AreEqual(1, categories.Count, "قسم واحد");
            Assert.AreEqual(expectedProfit, categories[0].GrossProfitPiasters, "ربح القسم بعد المرتجع");

            Assert.AreEqual(expectedProfit, reports.GetPeriodComparison("today").Profit.Current, "ربح مقارنة الفترات");
        }

        [Test]
        public void Scenario_S13_No_Invoice_Return_Reverses_Vat_From_Product_Rate()
        {
            var shift = OpenTestShift("usr_cashier_1", "كاشير 1", 100000);
            var prod = ProductService.SaveProduct(new Product
            {
                Name = "صنف 14% بدون فاتورة",
                Barcode = "BAR_" + Guid.NewGuid().ToString("N").Substring(0, 8),
                PricePiasters = 11400,
                CostPiasters = 6000,
                StockQuantityMilli = 100000,
                Unit = "piece",
                TaxRatePercent = 14,
                IsActive = true
            }, true, true);

            SaleService.ProcessSale(new Sale
            {
                ShiftId = shift.Id,
                CashierId = shift.CashierId,
                PaymentMethod = "cash",
                PaidPiasters = 11400,
                Items = new List<SaleItem>
                {
                    new SaleItem { ProductId = prod.Id, ProductName = prod.Name, QuantityMilli = 1000, UnitPricePiasters = 11400, TotalPiasters = 11400 }
                }
            }, null);

            ReturnService.ProcessReturn(new Return
            {
                IsWithoutInvoice = true,
                CashierId = shift.CashierId,
                ShiftId = shift.Id,
                RefundMethod = "cash",
                Reason = "مرتجع بدون فاتورة",
                TotalPiasters = 11400,
                Items = new List<ReturnItem>
                {
                    new ReturnItem { ProductId = prod.Id, ProductName = prod.Name, QuantityMilli = 1000, UnitPricePiasters = 11400, TotalPiasters = 11400 }
                }
            });

            // البيع والمرتجع يلغيان بعضهما: صافي بدون ضريبة 0، تكلفة 0، ربح 0، وضريبة المرتجع 1400
            string bDate = DailyClosingService.GetCurrentBusinessDate();
            Assert.AreEqual(0, DailyClosingService.GetClosingPreview(bDate).GrossProfitPiasters, "ربح Z بعد مرتجع بدون فاتورة");
            var reports = new ReportsService(ConnectionString);
            Assert.AreEqual(0, reports.GetTodaySummary().TodayProfitsPiasters, "ربح لوحة التحكم");
            Assert.AreEqual(0, reports.GetPeriodSalesReport("today", null, null).GrossProfitPiasters, "ربح تقرير الفترة");
            Assert.AreEqual(1400, reports.GetVatReport("today", null, null).ReturnsTaxPiasters, "ضريبة المرتجع بدون فاتورة");
            Assert.AreEqual(0, reports.GetPeriodComparison("today").Profit.Current, "ربح مقارنة الفترات");
        }
    }
}
