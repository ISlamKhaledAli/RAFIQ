using System;
using System.Collections.Generic;
using System.Data.SQLite;
using System.Globalization;
using NUnit.Framework;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    /// <summary>
    /// M4 / M5 / L7 (المرحلة 1): المرتجع والمصروف يخضعان لسلطة الخادم.
    /// المرتجع الجزئي يوزع الصافي بعد الخصم دون فروق قروش، والتاريخ والوردية من الخادم لا من العميل،
    /// ومصروف يوم عمل يُحتسب على يوم عمله فقط، ومرتجع سطر بلا معرّف يطابق السطر الصحيح من نفس الصنف.
    /// </summary>
    [TestFixture]
    [NonParallelizable]
    public class S40_ReturnsAndExpensesServerAuthorityTest : TestBase
    {
        private long Scalar(string sql, params object[] nameValuePairs)
        {
            using (var conn = new SQLiteConnection(ConnectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    for (int i = 0; i + 1 < nameValuePairs.Length; i += 2)
                    {
                        cmd.Parameters.AddWithValue((string)nameValuePairs[i], nameValuePairs[i + 1]);
                    }
                    object val = cmd.ExecuteScalar();
                    return val == null || val == DBNull.Value ? 0 : Convert.ToInt64(val);
                }
            }
        }

        private string Text(string sql, params object[] nameValuePairs)
        {
            using (var conn = new SQLiteConnection(ConnectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    for (int i = 0; i + 1 < nameValuePairs.Length; i += 2)
                    {
                        cmd.Parameters.AddWithValue((string)nameValuePairs[i], nameValuePairs[i + 1]);
                    }
                    object val = cmd.ExecuteScalar();
                    return val == null || val == DBNull.Value ? null : Convert.ToString(val, CultureInfo.InvariantCulture);
                }
            }
        }

        private static Return CashReturn(Sale sale, Shift shift, string saleItemId, Product product, long quantityMilli)
        {
            return new Return
            {
                SaleId = sale.Id,
                CashierId = shift.CashierId,
                RefundMethod = "cash",
                Reason = "مرتجع اختبار",
                Items = new List<ReturnItem>
                {
                    new ReturnItem { SaleItemId = saleItemId, ProductId = product.Id, ProductName = product.Name, QuantityMilli = quantityMilli }
                }
            };
        }

        // ---------- M4: partial returns of a discounted line ----------

        private Sale SellThreeWithInvoiceDiscount(Shift shift, Product product)
        {
            // 3 x 10.00 = 30.00 ج، خصم فاتورة 0.86 ج، صافي السطر 29.14 ج (2914 قرش)
            var sale = SaleService.ProcessSale(new Sale
            {
                ShiftId = shift.Id,
                CashierId = shift.CashierId,
                CashierName = shift.CashierName,
                PaymentMethod = "cash",
                PaidPiasters = 2914,
                DiscountPiasters = 86,
                Items = new List<SaleItem>
                {
                    new SaleItem { ProductId = product.Id, ProductName = product.Name, QuantityMilli = 3000, UnitPricePiasters = 1000, TotalPiasters = 3000 }
                }
            }, null);
            Assert.AreEqual(2914, sale.Items[0].TotalPiasters, "صافي السطر بعد توزيع خصم الفاتورة");
            Assert.AreEqual(2914, sale.TotalPiasters, "إجمالي الفاتورة");
            return sale;
        }

        [Test]
        public void Return_OfTheWholeDiscountedLine_RefundsExactlyTheNetLineTotal()
        {
            var shift = OpenTestShift("usr_cashier_1", "كاشير 1", 50000);
            var product = CreateTestProduct("صنف خصم تقريب", 1000, 600, 100000);
            var sale = SellThreeWithInvoiceDiscount(shift, product);

            var ret = ReturnService.ProcessReturn(CashReturn(sale, shift, sale.Items[0].Id, product, 3000));

            Assert.AreEqual(2914, ret.TotalPiasters, "استرداد كامل السطر = صافيه بالضبط");
            Assert.AreEqual(2914, Scalar("SELECT COALESCE(SUM(total_piasters), 0) FROM return_items WHERE return_id = @r;", "@r", ret.Id));
        }

        [Test]
        public void Return_OfTheLineOnePieceAtATime_RefundsTheRemainderOnTheLastPiece()
        {
            var shift = OpenTestShift("usr_cashier_1", "كاشير 1", 50000);
            var product = CreateTestProduct("صنف قطعة قطعة", 1000, 600, 100000);
            var sale = SellThreeWithInvoiceDiscount(shift, product);
            string lineId = sale.Items[0].Id;

            var r1 = ReturnService.ProcessReturn(CashReturn(sale, shift, lineId, product, 1000));
            var r2 = ReturnService.ProcessReturn(CashReturn(sale, shift, lineId, product, 1000));
            var r3 = ReturnService.ProcessReturn(CashReturn(sale, shift, lineId, product, 1000));

            Assert.AreEqual(971, r1.TotalPiasters, "المرتجع الأول");
            Assert.AreEqual(971, r2.TotalPiasters, "المرتجع الثاني");
            Assert.AreEqual(972, r3.TotalPiasters, "المرتجع الأخير يأخذ الباقي");
            Assert.AreEqual(2914, r1.TotalPiasters + r2.TotalPiasters + r3.TotalPiasters, "مجموع المرتجعات = صافي السطر المدفوع");

            Assert.Throws<InvalidOperationException>(delegate
            {
                ReturnService.ProcessReturn(CashReturn(sale, shift, lineId, product, 1000));
            }, "لا مرتجع رابع بعد استنفاد الكمية");
            Assert.AreEqual(3, Scalar("SELECT COUNT(*) FROM returns WHERE sale_id = @s;", "@s", sale.Id), "ثلاثة مرتجعات فقط");
            Assert.AreEqual(2914, Scalar("SELECT COALESCE(SUM(total_piasters), 0) FROM returns WHERE sale_id = @s;", "@s", sale.Id), "إجمالي المسترد المخزن");
        }

        // ---------- M5: server owns the return time and shift ----------

        [Test]
        public void Return_IgnoresClientCreatedAtAndShiftId_UsesServerTimeAndTheOpenShift()
        {
            var shift = OpenTestShift("usr_cashier_1", "كاشير 1", 50000);
            var product = CreateTestProduct("صنف ختم مرتجع", 1000, 600, 100000);
            var sale = SaleService.ProcessSale(new Sale
            {
                ShiftId = shift.Id,
                CashierId = shift.CashierId,
                PaymentMethod = "cash",
                PaidPiasters = 1000,
                Items = new List<SaleItem>
                {
                    new SaleItem { ProductId = product.Id, ProductName = product.Name, QuantityMilli = 1000, UnitPricePiasters = 1000, TotalPiasters = 1000 }
                }
            }, null);

            DateTime beforeUtc = DateTime.UtcNow.AddSeconds(-2);
            var request = CashReturn(sale, shift, sale.Items[0].Id, product, 1000);
            request.CreatedAt = "2020-01-01T10:00:00.0000000Z";
            request.ShiftId = "shift_foreign_999";

            var ret = ReturnService.ProcessReturn(request);
            DateTime afterUtc = DateTime.UtcNow.AddSeconds(2);

            string storedCreatedAt = Text("SELECT CAST(created_at AS TEXT) FROM returns WHERE id = @r;", "@r", ret.Id);
            string storedShiftId = Text("SELECT shift_id FROM returns WHERE id = @r;", "@r", ret.Id);
            Assert.IsNotNull(storedCreatedAt);
            DateTime stamped = DateTime.Parse(storedCreatedAt, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind).ToUniversalTime();
            Assert.GreaterOrEqual(stamped, beforeUtc, "ختم الزمن من الخادم لا من العميل (2020)");
            Assert.LessOrEqual(stamped, afterUtc, "ختم الزمن لا يسبق ساعة الخادم");
            Assert.AreEqual(shift.Id, storedShiftId, "المرتجع على الوردية المفتوحة لا على وردية أرسلها العميل");
        }

        // ---------- M5: expense business date ----------

        [Test]
        public void CreateExpense_IgnoresClientBusinessDate_AndCountsOnTheCurrentBusinessDay()
        {
            OpenTestShift("usr_cashier_1", "كاشير 1", 50000);
            string bDate = DailyClosingService.GetCurrentBusinessDate();
            long expensesBefore = DailyClosingService.GetClosingPreview(bDate).ExpensesPiasters;

            var expense = ExpenseService.CreateExpense(new CreateExpenseRequest
            {
                AmountPiasters = 1500,
                Category = "نثريات",
                Source = "drawer",
                CreatedBy = "كاشير 1",
                BusinessDate = "2001-02-03"
            });

            Assert.AreEqual(bDate, expense.BusinessDate, "يوم العمل من الخادم");
            Assert.AreEqual(bDate, Text("SELECT business_date FROM expenses WHERE id = @id;", "@id", expense.Id), "يوم العمل المخزن");
            Assert.AreEqual(expensesBefore + 1500, DailyClosingService.GetClosingPreview(bDate).ExpensesPiasters, "المصروف يدخل تقرير اليوم الحالي");
        }

        [Test]
        public void DrawerExpense_OfBusinessDayD_CreatedInTheNextDaysWindow_CountsOnlyOnD()
        {
            DateTime day = new DateTime(2020, 3, 10);
            DateTime nextDay = day.AddDays(1);
            // 12:00 محلياً من اليوم التالي: داخل نافذة يوم العمل التالي لكن المصروف تابع لليوم 10
            string createdAtUtc = new DateTime(2020, 3, 11, 12, 0, 0, DateTimeKind.Local).ToUniversalTime().ToString("o", CultureInfo.InvariantCulture);

            ExpenseRepo.Insert(new Expense
            {
                AmountPiasters = 700,
                Category = "نثريات",
                Source = "drawer",
                CreatedBy = "كاشير 1",
                BusinessDate = "2020-03-10",
                CreatedAt = createdAtUtc
            });

            Assert.AreEqual(700, DrawerCashCalculator.CalculateForBusinessDate(ConnectionString, day).ExpensesPiasters, "يُحتسب على يوم عمله");
            Assert.AreEqual(0, DrawerCashCalculator.CalculateForBusinessDate(ConnectionString, nextDay).ExpensesPiasters, "لا يُحتسب مرة ثانية على اليوم التالي");
        }

        // ---------- L7: two lines of the same product ----------

        [Test]
        public void Return_WithoutSaleItemId_MatchesTheSameProductLineThatStillHasQuantity()
        {
            // سطران لنفس الصنف: الإصلاح يحاسب كل سطر بسجل مرتجعاته هو لا بمجموع الصنف والوحدة
            var shift = OpenTestShift("usr_cashier_1", "كاشير 1", 50000);
            var product = CreateTestProduct("صنف سطران", 1000, 600, 100000);
            var sale = SaleService.ProcessSale(new Sale
            {
                ShiftId = shift.Id,
                CashierId = shift.CashierId,
                PaymentMethod = "cash",
                PaidPiasters = 3000,
                Items = new List<SaleItem>
                {
                    new SaleItem { ProductId = product.Id, ProductName = product.Name, QuantityMilli = 1000, UnitPricePiasters = 1000, TotalPiasters = 1000 },
                    new SaleItem { ProductId = product.Id, ProductName = product.Name, QuantityMilli = 2000, UnitPricePiasters = 1000, TotalPiasters = 2000 }
                }
            }, null);
            SaleItem firstLine = sale.Items.Find(delegate (SaleItem i) { return i.QuantityMilli == 1000; });
            SaleItem secondLine = sale.Items.Find(delegate (SaleItem i) { return i.QuantityMilli == 2000; });
            Assert.IsNotNull(firstLine);
            Assert.IsNotNull(secondLine);

            // الأول: وحدة واحدة على السطر الأول بمعرّفه
            var r1 = ReturnService.ProcessReturn(CashReturn(sale, shift, firstLine.Id, product, 1000));
            Assert.AreEqual(firstLine.Id, r1.Items[0].SaleItemId);
            Assert.AreEqual(1000, r1.TotalPiasters);

            // الثاني: وحدتان بدون معرّف سطر؛ السطر الأول مستنفد فيطابق الثاني
            var r2 = ReturnService.ProcessReturn(CashReturn(sale, shift, null, product, 2000));

            Assert.AreEqual(secondLine.Id, r2.Items[0].SaleItemId, "طابق السطر الثاني الذي ما زالت له كمية");
            Assert.AreEqual(2000, r2.TotalPiasters, "استرداد السطر الثاني كاملاً");
            Assert.AreEqual(3000, Scalar("SELECT COALESCE(SUM(total_piasters), 0) FROM returns WHERE sale_id = @s;", "@s", sale.Id), "إجمالي ما استُرد = الفاتورة كلها");
        }
    }
}
