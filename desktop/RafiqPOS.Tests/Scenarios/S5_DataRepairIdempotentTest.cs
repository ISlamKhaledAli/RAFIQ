using System;
using System.Collections.Generic;
using NUnit.Framework;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    [TestFixture]
    public class S5_DataRepairIdempotentTest : TestBase
    {
        [Test]
        public void Scenario_S5_Data_Quality_Repair_Is_Idempotent_On_Healthy_Ledgers()
        {
            // 1. Arrange: إعداد عدة عملاء بحركات دفترية متنوعة وصحيحة
            OpenTestShift();
            var prod = CreateTestProduct("صنف اختبار النظافة", 5000, 3000, 100000);

            // عميل 1: بيع آجل وسداد جزئي
            var c1 = CreateTestCustomer("عميل حركات متنوعة 1", 200000, 0);
            SaleService.ProcessSale(new Sale
            {
                CashierId = "usr_cashier_1",
                CashierName = "كاشير 1",
                CustomerId = c1.Id,
                CustomerName = c1.Name,
                PaymentMethod = "credit",
                PaidPiasters = 0,
                Items = new List<SaleItem>
                {
                    new SaleItem { ProductId = prod.Id, ProductName = prod.Name, QuantityMilli = 2000, UnitPricePiasters = 5000, TotalPiasters = 10000 }
                }
            }, null);
            CustomerService.RecordPayment(c1.Id, 4000, "سداد جزئي 40 ج");

            // عميل 2: رصيد افتتاحي وسداد كامل
            var c2 = CreateTestCustomer("عميل مسدد بالكامل 2", 100000, 8000);
            CustomerService.RecordPayment(c2.Id, 8000, "سداد كامل للرصيد الافتتاحي");

            // أخذ لقطة لأرصدة العملاء قبل المعالجة
            long bal1Before = CustomerService.GetById(c1.Id).BalancePiasters;
            long bal2Before = CustomerService.GetById(c2.Id).BalancePiasters;

            Assert.AreEqual(6000, bal1Before); // 10000 - 4000 = 6000
            Assert.AreEqual(0, bal2Before);

            // 2. Act 1: تشغيل أداة معالجة جودة البيانات للمرة الأولى
            var reportsService = new ReportsService(ConnectionString);
            var repair1 = reportsService.RepairDataQualityIssues();

            // Assert 1: الحسابات السليمة لا يجب أن يتم العبث بها أو تغييرها
            Assert.IsNotNull(repair1);
            Assert.IsTrue(repair1.Success);

            long bal1AfterFirst = CustomerService.GetById(c1.Id).BalancePiasters;
            long bal2AfterFirst = CustomerService.GetById(c2.Id).BalancePiasters;

            Assert.AreEqual(bal1Before, bal1AfterFirst, "رصيد العميل 1 لم يتغير لأن دفاتره متزنة محاسبياً");
            Assert.AreEqual(bal2Before, bal2AfterFirst, "رصيد العميل 2 لم يتغير لأن دفاتره متزنة محاسبياً");

            // 3. Act 2: تشغيل أداة المعالجة للمرة الثانية على التوالي (Idempotency Check)
            var repair2 = reportsService.RepairDataQualityIssues();
            Assert.IsNotNull(repair2);
            Assert.IsTrue(repair2.Success);

            long bal1AfterSecond = CustomerService.GetById(c1.Id).BalancePiasters;
            long bal2AfterSecond = CustomerService.GetById(c2.Id).BalancePiasters;

            Assert.AreEqual(bal1Before, bal1AfterSecond, "خاصية Idempotence: التكرار الثاني لا يحدث أي تغيير في الأرصدة المتزنة");
            Assert.AreEqual(bal2Before, bal2AfterSecond, "خاصية Idempotence: التكرار الثاني لا يحدث أي تغيير في الأرصدة المتزنة");
        }
    }
}
