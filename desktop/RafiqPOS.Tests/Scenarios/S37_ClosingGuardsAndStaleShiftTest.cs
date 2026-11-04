using System;
using System.Collections.Generic;
using System.Globalization;
using NUnit.Framework;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    /// <summary>
    /// M1 (المرحلة 1): لا إقفال يومية مع وردية مفتوحة، ولا بيع على وردية تخص يوم عمل سابق.
    /// يستخدم التهيئة الكاملة (DatabaseService.Initialize) لأن حارس الوردية في SaleService يعتمد عليها.
    /// </summary>
    [TestFixture]
    [NonParallelizable]
    public class S37_ClosingGuardsAndStaleShiftTest : S30_Step3BFixtureBase
    {
        private static Sale BuildSale(Product product, string shiftId)
        {
            return new Sale
            {
                CashierId = AdminId,
                PaymentMethod = "cash",
                PaidPiasters = 5000,
                ShiftId = shiftId,
                Items = new List<SaleItem>
                {
                    new SaleItem { ProductId = product.Id, ProductName = product.Name, QuantityMilli = 1000, UnitPricePiasters = 5000, TotalPiasters = 5000 }
                }
            };
        }

        [Test]
        public void SaveClosing_WithOpenShift_Throws_AndSucceedsAfterTheShiftIsClosed()
        {
            var shift = OpenShift(10000);
            string bDate = DatabaseService.DailyClosing.GetCurrentBusinessDate();
            Assert.AreEqual(1, DatabaseService.DailyClosing.GetClosingPreview(bDate).OpenShiftsCount, "المعاينة تعرض عدد الورديات المفتوحة");

            var ex = Assert.Throws<InvalidOperationException>(delegate
            {
                DatabaseService.DailyClosing.SaveClosing(new DailyClosingSaveRequest { BusinessDate = bDate, ActualCashPiasters = 10000 });
            });
            StringAssert.Contains("لوجود 1 وردية مفتوحة", ex.Message);
            Assert.AreEqual(0, Scalar("SELECT COUNT(*) FROM daily_closings;"), "لم يُختم يوم");

            DatabaseService.Shifts.CloseShift(new CloseShiftRequest { ShiftId = shift.Id, ActualCashPiasters = 10000 });
            Assert.AreEqual(0, DatabaseService.DailyClosing.GetClosingPreview(bDate).OpenShiftsCount, "لا ورديات مفتوحة بعد الإغلاق");

            var closing = DatabaseService.DailyClosing.SaveClosing(new DailyClosingSaveRequest { BusinessDate = bDate, ActualCashPiasters = 10000 });
            Assert.IsNotNull(closing);
            Assert.AreEqual(bDate, closing.BusinessDate);
            Assert.AreEqual(1, Scalar("SELECT COUNT(*) FROM daily_closings;"), "اليوم خُتم بعد إغلاق الوردية");
        }

        [Test]
        public void ProcessSale_OnShiftOfPreviousBusinessDay_IsRejected_UntilItIsClosedAndANewShiftOpened()
        {
            var product = CreateProduct("صنف يوم قديم", 5000, 3000, 100000);
            var staleShift = OpenShift(10000);

            string today = DatabaseService.DailyClosing.GetCurrentBusinessDate();
            string yesterday = DateTime.ParseExact(today, "yyyy-MM-dd", CultureInfo.InvariantCulture).AddDays(-1).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            Execute("UPDATE shifts SET business_date = @d WHERE id = @id;", "@d", yesterday, "@id", staleShift.Id);
            Assert.IsTrue(DatabaseService.Shifts.GetActiveShift().IsDanglingFromPreviousDay, "الوردية المفتوحة تخص يوماً سابقاً");

            // The cashier screen sells on the active shift (no shift id)
            var exActive = Assert.Throws<InvalidOperationException>(delegate { DatabaseService.Sales.ProcessSale(BuildSale(product, null), null); });
            StringAssert.Contains("يوم العمل الحالي", exActive.Message);

            // A client naming the stale shift explicitly is rejected as well
            var exNamed = Assert.Throws<InvalidOperationException>(delegate { DatabaseService.Sales.ProcessSale(BuildSale(product, staleShift.Id), null); });
            StringAssert.Contains("يوم العمل الحالي", exNamed.Message);

            Assert.AreEqual(0, Scalar("SELECT COUNT(*) FROM sales;"), "لا فواتير على الوردية القديمة");
            Assert.AreEqual(100000, Stock(product.Id), "المخزون لم يتأثر بالمحاولات المرفوضة");

            DatabaseService.Shifts.CloseShift(new CloseShiftRequest { ShiftId = staleShift.Id, ActualCashPiasters = 10000 });
            var freshShift = OpenShift(10000);
            Assert.AreEqual(today, freshShift.BusinessDate, "الوردية الجديدة على يوم العمل الحالي");

            var sale = DatabaseService.Sales.ProcessSale(BuildSale(product, null), null);
            Assert.IsNotNull(sale, "البيع يعمل بعد إغلاق الوردية القديمة وفتح وردية جديدة");
            Assert.AreEqual(freshShift.Id, sale.ShiftId, "الفاتورة على الوردية الجديدة");
            Assert.AreEqual(99000, Stock(product.Id));
        }
    }
}
