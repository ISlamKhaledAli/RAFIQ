using System;
using System.Collections.Generic;
using NUnit.Framework;
using RafiqPOS.Models;

namespace RafiqPOS.Tests.Scenarios
{
    [TestFixture]
    public class S4_ProductEditConcurrentSaleTest : TestBase
    {
        [Test]
        public void Scenario_S4_Product_Edit_Does_Not_Overwrite_InFlight_Stock_Deduction()
        {
            // 1. Arrange: منتج برصيد أولي 100 قطعة (100,000 ملي)
            long initialStockMilli = 100000;
            var prod = CreateTestProduct("شاي لبتون 100 فتلة", 5000, 3500, initialStockMilli);
            OpenTestShift();

            // 2. محاكاة: فتح شاشة تعديل المنتج في الفرونت إند وقراءة الرصيد القديم
            var staleProductSnapshot = ProductService.GetById(prod.Id);
            Assert.AreEqual(initialStockMilli, staleProductSnapshot.StockQuantityMilli);

            // 3. حدوث عملية بيع فعلية لـ 20 قطعة (20,000 ملي) أثناء فتح نافذة التعديل
            SaleService.ProcessSale(new Sale
            {
                CashierId = "usr_cashier_1",
                CashierName = "كاشير 1",
                PaymentMethod = "cash",
                PaidPiasters = 100000,
                Items = new List<SaleItem>
                {
                    new SaleItem
                    {
                        ProductId = prod.Id,
                        ProductName = prod.Name,
                        QuantityMilli = 20000, // 20 units
                        UnitPricePiasters = 5000,
                        TotalPiasters = 100000
                    }
                }
            }, null);

            // تحقق من خصم المخزون إلى 80 قطعة
            var afterSaleProd = ProductService.GetById(prod.Id);
            Assert.AreEqual(80000, afterSaleProd.StockQuantityMilli, "الرصيد بعد البيع يجب أن يكون 80000 ملي (80 قطعة)");

            // 4. قيام المستخدم بحفظ تعديل السعر فقط من نافذة التعديل المفتوحة
            staleProductSnapshot.PricePiasters = 5500; // رفع السعر إلى 55 ج
            staleProductSnapshot.Name = "شاي لبتون 100 فتلة - عبوة توفير";

            // حفظ المنتج: تعديل بيانات المنتج لا يجب أن يمس الرصيد الحي
            ProductService.SaveProduct(staleProductSnapshot, false, false);

            // 5. Assert: الرصيد النهائي يجب أن يظل 80,000 ملي ولا يعود إلى 100,000 القديمة
            var finalProd = ProductService.GetById(prod.Id);
            Assert.AreEqual(5500, finalProd.PricePiasters, "يجب تحديث السعر الجديد");
            Assert.AreEqual(80000, finalProd.StockQuantityMilli, "المخزون يجب أن يظل 80000 ملي (80 قطعة) ولا يتم استبداله بالرصيد القديم");
        }
    }
}
