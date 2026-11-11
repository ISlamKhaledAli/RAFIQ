using System;
using System.Collections.Generic;
using RafiqPOS.Data;
using System.Globalization;
using NUnit.Framework;
using RafiqPOS.Models;
using RafiqPOS.Repositories;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    [TestFixture]
    public class S2_DrawerCashFullDayTest : TestBase
    {
        [Test]
        public void Scenario_S2_Full_Day_Cash_Drawer_Reconciliation()
        {
            // 1. افتح وردية بعهدة 50000 قرش (500 ج)
            long initialFloat = 50000;
            var shift = OpenTestShift("usr_cashier_1", "كاشير 1", initialFloat);
            var prod = CreateTestProduct("صنف يومي", 5000, 3000, 500000);

            // 2. بيع نقدي 10000 (100 ج)
            var cashSale = SaleService.ProcessSale(new Sale
            {
                CashierId = shift.CashierId,
                CashierName = shift.CashierName,
                PaymentMethod = "cash",
                PaidPiasters = 10000,
                Items = new List<SaleItem>
                {
                    new SaleItem { ProductId = prod.Id, ProductName = prod.Name, QuantityMilli = 2000, UnitPricePiasters = 5000, TotalPiasters = 10000 }
                }
            }, null);

            // 3. بيع آجل 15000 (150 ج)، ثم سداد 15000 في نفس اليوم
            var cust = CreateTestCustomer("عميل آجل", 200000);
            SaleService.ProcessSale(new Sale
            {
                CashierId = shift.CashierId,
                CashierName = shift.CashierName,
                CustomerId = cust.Id,
                CustomerName = cust.Name,
                PaymentMethod = "credit",
                PaidPiasters = 0,
                Items = new List<SaleItem>
                {
                    new SaleItem { ProductId = prod.Id, ProductName = prod.Name, QuantityMilli = 3000, UnitPricePiasters = 5000, TotalPiasters = 15000 }
                }
            }, null);
            // سداد العميل نقداً في الدرج
            CustomerService.RecordPayment(cust.Id, 15000, "سداد نقدي لنفس اليوم");

            // 4. مرتجع نقدي 3000 (30 ج) من الفاتورة النقدية
            ReturnService.ProcessReturn(new Return
            {
                SaleId = cashSale.Id,
                CashierId = shift.CashierId,
                RefundMethod = "cash",
                Reason = "مرتجع نقدي",
                TotalPiasters = 3000,
                Items = new List<ReturnItem>
                {
                    new ReturnItem { ProductId = prod.Id, ProductName = prod.Name, QuantityMilli = 600, UnitPricePiasters = 5000, TotalPiasters = 3000 }
                }
            });

            // 5. مصروف نقدي من الدرج 2000 (20 ج)
            ExpenseService.CreateExpense(new CreateExpenseRequest
            {
                Category = "نثريات",
                Notes = "شاي وسكر",
                AmountPiasters = 2000,
                Source = "drawer",
                CreatedBy = shift.CashierName,
                ShiftId = shift.Id
            });

            // 6. حركة سحب يدوي (Cash-Out) 1000 (10 ج)
            CashDrawerService.RecordCashOut(new CashMovementRequest
            {
                ShiftId = shift.Id,
                Type = "cash_out",
                AmountPiasters = 1000,
                Reason = "سحب طوارئ",
                PerformedByName = shift.CashierName
            });

            // 7. الحساب اليدوي: 50000 + 10000 + 15000 - 3000 - 2000 - 1000 = 69000 قرش
            var summary = ShiftService.GetShiftSummary(shift.Id);
            Assert.IsNotNull(summary, "ملخص الوردية غير فارغ");
            Assert.AreEqual(50000, summary.OpeningFloatPiasters, "عهدة البداية");
            Assert.AreEqual(10000, summary.CashSalesPiasters, "المبيعات النقدية");
            Assert.AreEqual(15000, summary.DebtPaymentsCashPiasters, "سداد الآجل النقدي");
            Assert.AreEqual(3000, summary.ReturnsCashPiasters, "المرتجع النقدي");
            Assert.AreEqual(2000, summary.ExpensesCashPiasters, "مصروف الدرج");
            Assert.AreEqual(1000, summary.CashOutPiasters, "السحب اليدوي");
            Assert.AreEqual(69000, summary.ExpectedCashPiasters, "نقدية الوردية المتوقعة");

            string bDate = DailyClosingService.GetCurrentBusinessDate();
            var dayCalc = DrawerCashCalculator.CalculateForBusinessDate(ConnectionString, DateTime.Parse(bDate));
            Assert.AreEqual(69000, dayCalc.ExpectedCashPiasters, "نقدية اليوم من الحاسبة الموحدة");
            Assert.AreEqual(69000, DailyClosingService.GetClosingPreview(bDate).ExpectedCashPiasters, "نقدية معاينة التقفيل");
        }

        [Test]
        public void Scenario_S2_Shift_Handover_Float_Is_Not_Counted_Twice_And_Handover_Second_Purchase_Counted_Once()
        {
            var prod = CreateTestProduct("صنف تسليم وردية", 2500, 1500, 500000);
            var purchaseRepo = new PurchaseRepository(ConnectionString, CounterRepo, SupplierRepo, PriceHistoryRepo, AuditRepo);

            // الوردية 1: عهدة 50000، بيع نقدي 10000، شراء من الدرج 2000
            var shift1 = OpenTestShift("usr_cashier_1", "كاشير 1", 50000);
            SellCash(shift1, prod, 4000, 10000);
            purchaseRepo.CreatePurchase(new Purchase
            {
                PaidAmountPiasters = 2000,
                PaymentSource = "cash_drawer",
                Items = new List<PurchaseItem>
                {
                    new PurchaseItem { ProductId = prod.Id, QuantityMilli = 1000, UnitCostPiasters = 2000 }
                }
            }, "LATEST");

            // الوردية تستمر أطول من إزاحة الشراء، ثم ابتعد عن حدود الثانية حتى يقع الشراء والإغلاق والفتح في نفس الثانية فعلاً
            System.Threading.Thread.Sleep(250);
            while (DateTime.UtcNow.Millisecond < 150 || DateTime.UtcNow.Millisecond > 700) { System.Threading.Thread.Sleep(10); }
            var closed1 = ShiftService.CloseShift(new CloseShiftRequest { ShiftId = shift1.Id, ActualCashPiasters = 58000 });
            Assert.AreEqual(58000, closed1.ExpectedCashPiasters, "متوقع الوردية الأولى");
            Assert.AreEqual(0, closed1.DifferencePiasters, "لا عجز في الوردية الأولى");

            // الوردية 2 تستلم نفس النقدية (58000) كعهدة ثم تبيع 2500 نقداً
            var shift2 = OpenTestShift("usr_cashier_2", "كاشير 2", 58000);

            // D7: شراء في نفس ثانية التسليم يُحسب على وردية واحدة فقط (نوافذ نصف مفتوحة [فتح، إغلاق))
            DateTime closedAt = DateTime.Parse(closed1.ClosedAt, null, DateTimeStyles.RoundtripKind).ToUniversalTime();
            using (var conn = new SQLiteConnection(ConnectionString))
            {
                conn.Open();
                ExecSql(conn, "UPDATE purchases SET created_at = @t", closedAt.AddMilliseconds(-100), null);
                ExecSql(conn, "UPDATE shifts SET opened_at = @t WHERE id = @id", closedAt.AddMilliseconds(100), shift2.Id);
            }
            Assert.AreEqual(2000, ShiftService.GetShiftSummary(shift1.Id).PurchasesCashPiasters, "الشراء على الوردية التي تمت فيها");
            SellCash(shift2, prod, 1000, 2500);

            var summary2 = ShiftService.GetShiftSummary(shift2.Id);
            Assert.AreEqual(0, summary2.PurchasesCashPiasters, "شراء الوردية الأولى لا يُحسب على الثانية");
            Assert.AreEqual(60500, summary2.ExpectedCashPiasters, "متوقع الوردية الثانية");

            // اليوم = عهدة أول وردية + كل حركات اليوم (عهدة التسليم ليست نقدية جديدة)
            string bDate = DailyClosingService.GetCurrentBusinessDate();
            var dayCalc = DrawerCashCalculator.CalculateForBusinessDate(ConnectionString, DateTime.Parse(bDate));
            Assert.AreEqual(50000, dayCalc.OpeningFloatPiasters, "عهدة اليوم هي عهدة أول وردية فقط");
            Assert.AreEqual(60500, dayCalc.ExpectedCashPiasters, "نقدية اليوم المتوقعة");
            Assert.AreEqual(60500, DailyClosingService.GetClosingPreview(bDate).ExpectedCashPiasters, "معاينة التقفيل تطابق الدرج الفعلي");

            ShiftService.CloseShift(new CloseShiftRequest { ShiftId = shift2.Id, ActualCashPiasters = 60500 });
            var closing = DailyClosingService.SaveClosing(new DailyClosingSaveRequest { BusinessDate = bDate, ActualCashPiasters = 60500 });
            Assert.AreEqual(60500, closing.ExpectedCashPiasters, "تقفيل اليوم المحفوظ");
            Assert.AreEqual(0, closing.DifferencePiasters, "لا عجز وهمي في تقفيل اليوم");
        }

        private Sale SellCash(Shift shift, Product prod, long qtyMilli, long totalPiasters)
        {
            return SaleService.ProcessSale(new Sale
            {
                ShiftId = shift.Id,
                CashierId = shift.CashierId,
                CashierName = shift.CashierName,
                PaymentMethod = "cash",
                PaidPiasters = totalPiasters,
                Items = new List<SaleItem>
                {
                    new SaleItem { ProductId = prod.Id, ProductName = prod.Name, QuantityMilli = qtyMilli, UnitPricePiasters = prod.PricePiasters, TotalPiasters = totalPiasters }
                }
            }, null);
        }

        private static void ExecSql(SQLiteConnection conn, string sql, DateTime utc, string id)
        {
            using (var cmd = new SQLiteCommand(sql, conn))
            {
                cmd.Parameters.AddWithValue("@t", utc.ToString("o"));
                if (id != null) cmd.Parameters.AddWithValue("@id", id);
                cmd.ExecuteNonQuery();
            }
        }
    }
}
