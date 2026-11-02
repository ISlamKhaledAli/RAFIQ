using System;
using System.Collections.Generic;
using NUnit.Framework;
using RafiqPOS.Models;

namespace RafiqPOS.Tests.Scenarios
{
    [TestFixture]
    public class S16_CancelSaleClosedShiftTest : TestBase
    {
        [Test]
        public void Cancelling_Sale_Of_Closed_Shift_Is_Blocked_And_Own_Open_Shift_Still_Works()
        {
            var prod = CreateTestProduct("صنف إلغاء", 5000, 3000, 100000);

            var shift1 = OpenTestShift("usr_cashier_1", "كاشير 1", 50000);
            var oldSale = SellCash(shift1, prod);
            var closed1 = ShiftService.CloseShift(new CloseShiftRequest { ShiftId = shift1.Id, ActualCashPiasters = 55000 });
            Assert.AreEqual(55000, closed1.ExpectedCashPiasters);

            var shift2 = OpenTestShift("usr_cashier_2", "كاشير 2", 55000);

            var ex = Assert.Throws<InvalidOperationException>(delegate { SaleRepo.CancelSaleAtomic(oldSale.Id, "خطأ في الصنف", "usr_admin"); });
            StringAssert.Contains("وردية مغلقة", ex.Message);
            StringAssert.Contains("المرتجع", ex.Message);

            Assert.AreEqual("completed", SaleRepo.GetSaleById(oldSale.Id).Status, "الفاتورة القديمة لم تُلغَ");
            Assert.AreEqual(55000, ShiftService.GetShiftSummary(shift1.Id).ExpectedCashPiasters, "إجماليات الوردية المغلقة ثابتة كما خُتمت");
            Assert.AreEqual(55000, ShiftService.GetShiftSummary(shift2.Id).ExpectedCashPiasters, "لا عجز وهمي في الوردية الحالية");

            var newSale = SellCash(shift2, prod);
            var cancelled = SaleRepo.CancelSaleAtomic(newSale.Id, "خطأ في الصنف", "usr_admin");
            Assert.AreEqual("cancelled", cancelled.Status, "إلغاء فاتورة الوردية المفتوحة نفسها مسموح");
            Assert.AreEqual(55000, ShiftService.GetShiftSummary(shift2.Id).ExpectedCashPiasters, "الإلغاء داخل الوردية يعيد نقديتها كما كانت");
        }

        private Sale SellCash(Shift shift, Product prod)
        {
            return SaleService.ProcessSale(new Sale
            {
                ShiftId = shift.Id,
                CashierId = shift.CashierId,
                CashierName = shift.CashierName,
                PaymentMethod = "cash",
                PaidPiasters = 5000,
                Items = new List<SaleItem>
                {
                    new SaleItem { ProductId = prod.Id, ProductName = prod.Name, QuantityMilli = 1000, UnitPricePiasters = 5000, TotalPiasters = 5000 }
                }
            }, null);
        }
    }
}
