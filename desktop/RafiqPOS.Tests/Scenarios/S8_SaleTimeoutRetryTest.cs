using System;
using System.Collections.Generic;
using NUnit.Framework;
using RafiqPOS.Models;

namespace RafiqPOS.Tests.Scenarios
{
    [TestFixture]
    public class S8_SaleTimeoutRetryTest : TestBase
    {
        [Test]
        public void Scenario_S8_Sale_Timeout_Retry_With_Idempotency_Key_Prevents_Duplicate_Sale_And_Stock_Deduction()
        {
            // 1. Arrange: إعداد بيئة البيع ومخزون أولي 50 قطعة
            OpenTestShift();
            long initialStockMilli = 50000;
            var prod = CreateTestProduct("صنف اختبار إعادة المحاولة", 4000, 2500, initialStockMilli);

            string clientRequestId = "req_client_timeout_" + Guid.NewGuid().ToString("N");

            var sale = new Sale
            {
                CashierId = "usr_cashier_1",
                CashierName = "كاشير 1",
                PaymentMethod = "cash",
                PaidPiasters = 8000,
                IdempotencyKey = clientRequestId,
                Items = new List<SaleItem>
                {
                    new SaleItem
                    {
                        ProductId = prod.Id,
                        ProductName = prod.Name,
                        QuantityMilli = 2000, // 2 units
                        UnitPricePiasters = 4000,
                        TotalPiasters = 8000
                    }
                }
            };

            // 2. المحاولة الأولى: نجاح إنشاء الفاتورة
            var sale1 = SaleService.ProcessSale(sale, clientRequestId);
            Assert.IsNotNull(sale1, "الفاتورة الأولى تم إنشاؤها بنجاح");

            // فحص رصيد المخزون: يجب أن ينخفض بمقدار قطعتين (إلى 48 قطعة)
            var stockAfterFirst = ProductService.GetById(prod.Id).StockQuantityMilli;
            Assert.AreEqual(48000, stockAfterFirst, "تم خصم قطعتين من المخزون بعد العملية الأولى");

            // 3. المحاولة الثانية (محاكاة Timeout وإعادة إرسال نفس الطلب بنفس الـ IdempotencyKey)
            var sale2 = SaleService.ProcessSale(sale, clientRequestId);
            Assert.IsNotNull(sale2, "الاستجابة الثانية تم إرجاعها");

            // Assert: نفس الفاتورة ونفس رقم الفاتورة
            Assert.AreEqual(sale1.Id, sale2.Id, "يجب إرجاع نفس معرف الفاتورة الأصلية دون إنشاء فاتورة مكررة");
            Assert.AreEqual(sale1.InvoiceNumber, sale2.InvoiceNumber, "رقم الفاتورة يجب أن يكون متطابقاً تماماً");

            // Assert المخزون: لا يجب خصم المخزون مرة ثانية إطلاقاً!
            var stockAfterRetry = ProductService.GetById(prod.Id).StockQuantityMilli;
            Assert.AreEqual(48000, stockAfterRetry, "لا يجب خصم المخزون مرتين عند إعادة محاولة نفس الطلب");

            // 4. المحاولة الثالثة: محاكاة إعادة تشغيل البرنامج ومسح الكاش من الذاكرة (Audit F-09)
            // إثبات أن الـ Idempotency محفوظ في قاعدة بيانات SQLite عبر حقل sales.idempotency_key
            RafiqPOS.Services.SaleService.ClearIdempotencyCache();

            var sale3 = SaleService.ProcessSale(sale, clientRequestId);
            Assert.IsNotNull(sale3, "تم استرجاع الفاتورة من قاعدة البيانات بعد إعادة تشغيل البرنامج");
            Assert.AreEqual(sale1.Id, sale3.Id, "يجب إرجاع نفس الفاتورة المحفوظة في SQLite عبر الـ IdempotencyKey المستمر");

            var stockAfterRestartRetry = ProductService.GetById(prod.Id).StockQuantityMilli;
            Assert.AreEqual(48000, stockAfterRestartRetry, "المخزون ثابت تماماً بعد محاولة ما بعد إعادة التشغيل");
        }
    }
}
