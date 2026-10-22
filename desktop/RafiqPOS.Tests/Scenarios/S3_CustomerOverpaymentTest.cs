using System;
using System.Collections.Generic;
using NUnit.Framework;
using RafiqPOS.Models;

namespace RafiqPOS.Tests.Scenarios
{
    [TestFixture]
    public class S3_CustomerOverpaymentTest : TestBase
    {
        [Test]
        public void Scenario_S3_Customer_Overpayment_Creates_Advance_Credit()
        {
            // 1. Arrange: عميل عليه مديونية 5000 قرش (50 ج)
            var customer = CreateTestCustomer("محمد الأحمدي", 100000, 5000);
            Assert.AreEqual(5000, customer.BalancePiasters, "رصيد العميل الافتتاحي مدين بـ 5000 قرش");

            // 2. Act: العميل سدد 12000 قرش (120 ج) - زيادة 7000 قرش عن المديونية
            var updatedCustomer = CustomerService.RecordPayment(customer.Id, 12000, "سداد بالزيادة (دفعة مقدمة)");

            // 3. Assert: الرصيد يجب أن يصبح -7000 قرش (دائن لصالح العميل / دفعة مقدمة)
            Assert.AreEqual(-7000, updatedCustomer.BalancePiasters, "رصيد العميل بعد السداد الزائد يجب أن يكون -7000 قرش (رصيد دائن)");

            // 4. فحص كشف الحساب: الحركة مسجلة وسليمة
            var statement = CustomerRepo.GetStatement(customer.Id, 50);
            Assert.IsNotNull(statement);
            Assert.IsTrue(statement.Count >= 1, "كشف الحساب يجب أن يحتوي على حركة السداد");
            Assert.AreEqual(-7000, statement[0].BalanceAfterPiasters, "كشف الحساب يجب أن يعكس الرصيد الدائن بدقة");

            // 5. شراء آجل لاحق بـ 4000 قرش يستهلك من الدفعة المقدمة
            OpenTestShift();
            var prod = CreateTestProduct("صنف مشتريات لاحقة", 4000, 2500, 100000);

            var sale = new Sale
            {
                CashierId = "usr_cashier_1",
                CashierName = "كاشير 1",
                CustomerId = customer.Id,
                CustomerName = customer.Name,
                PaymentMethod = "credit",
                PaidPiasters = 0,
                Items = new List<SaleItem>
                {
                    new SaleItem { ProductId = prod.Id, ProductName = prod.Name, QuantityMilli = 1000, UnitPricePiasters = 4000, TotalPiasters = 4000 }
                }
            };
            SaleService.ProcessSale(sale, null);

            // 6. الرصيد بعد الفاتورة: -7000 + 4000 = -3000 قرش
            var finalCust = CustomerService.GetById(customer.Id);
            Assert.AreEqual(-3000, finalCust.BalancePiasters, "الفاتورة اللاحقة يجب أن تخصم من رصيد الدفعة المقدمة ليصبح -3000 قرش");
        }
    }
}
