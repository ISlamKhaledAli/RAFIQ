using System;
using System.Collections.Generic;
using NUnit.Framework;
using RafiqPOS.Models;

namespace RafiqPOS.Tests.Scenarios
{
    [TestFixture]
    public class S1_DiscountDoubleCountTest : TestBase
    {
        [Test]
        public void Scenario_S1_Discounts_Do_Not_Double_Count_Or_Exceed_Total()
        {
            // Arrange
            OpenTestShift();
            var prod = CreateTestProduct("صنف اختبار الخصم", 10000, 6000, 50000); // 100.00 EGP

            // Act: 1 item with 30 EGP (3000 piasters) line discount, plus 20 EGP (2000 piasters) invoice discount
            var sale = new Sale
            {
                CashierId = "usr_cashier_1",
                CashierName = "كاشير 1",
                PaymentMethod = "cash",
                PaidPiasters = 5000,
                DiscountPiasters = 2000, // Invoice discount
                Items = new List<SaleItem>
                {
                    new SaleItem
                    {
                        ProductId = prod.Id,
                        ProductName = prod.Name,
                        Barcode = prod.Barcode,
                        QuantityMilli = 1000, // 1 unit
                        UnitPricePiasters = 10000,
                        DiscountPiasters = 3000, // Item discount
                        TotalPiasters = 7000
                    }
                }
            };

            var createdSale = SaleService.ProcessSale(sale, null);

            // Assert
            Assert.IsNotNull(createdSale, "يجب إنشاء الفاتورة بنجاح");
            Assert.AreEqual(10000, createdSale.SubtotalPiasters, "المجموع الفرعي يجب أن يكون 10000 قرش");
            
            // Total should be: 10000 - 3000 (item discount) - 2000 (invoice discount) = 5000 piasters (50.00 EGP)
            Assert.AreEqual(5000, createdSale.TotalPiasters, "إجمالي الفاتورة الصافي يجب أن يكون 5000 قرش (50 ج)");

            // Sum of discounts across the transaction should be 5000 piasters
            long totalDiscount = createdSale.DiscountPiasters + createdSale.Items[0].DiscountPiasters;
            Assert.AreEqual(5000, totalDiscount, "مجموع الخصومات يجب أن يساوي 5000 قرش بالضبط");

            // Verify partial return: return cannot refund more than the net paid (5000 piasters)
            var retItem = new ReturnItem
            {
                SaleItemId = createdSale.Items[0].Id,
                ProductId = prod.Id,
                ProductName = prod.Name,
                QuantityMilli = 1000,
                UnitPricePiasters = 5000,
                TotalPiasters = 5000 // Net paid per item after all discounts
            };

            var ret = new Return
            {
                SaleId = createdSale.Id,
                CashierId = "usr_cashier_1",
                RefundMethod = "cash",
                Reason = "استرجاع صنف مخفض",
                TotalPiasters = 5000,
                Items = new List<ReturnItem> { retItem }
            };

            var createdReturn = ReturnService.ProcessReturn(ret);
            Assert.IsNotNull(createdReturn, "يجب قبول المرتجع");
            Assert.AreEqual(5000, createdReturn.TotalPiasters, "قيمة المرتجع لا يجب أن تتجاوز صافي ما دفعه العميل");
        }
    }
}
