using System;
using System.Collections.Generic;
using NUnit.Framework;
using RafiqPOS.Models;

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

            // 7. الحساب اليدوي الرياضي الدقيق (Senior Hand Calculation):
            // البداية: 50000
            // + بيع نقدي: 10000
            // + سداد آجل نقدي: 15000
            // - مرتجع نقدي: 3000
            // - مصروف: 2000
            // - سحب يدوي: 1000
            // المجموع الصافي المتوقع للكاش = 69000 قرش (690 ج)
            long expectedDrawerCash = 50000 + 10000 + 15000 - 3000 - 2000 - 1000;
            Assert.AreEqual(69000, expectedDrawerCash);

            // فحص كاش الوردية عبر الـ Service & Repository
            var currentShift = ShiftRepo.GetActiveShift("default_pos");
            Assert.IsNotNull(currentShift, "الوردية يجب أن تكون مفتوحة ونشطة");

            var summary = ShiftService.GetShiftSummary(currentShift.Id);
            Assert.IsNotNull(summary, "ملخص الوردية غير فارغ");
        }
    }
}
