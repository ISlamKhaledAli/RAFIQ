using System;
using System.Collections.Generic;
using System.Threading;
using NUnit.Framework;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    /// <summary>
    /// M7 (المرحلة 1): سداد العملاء النقدي (يزيد الدرج) وفواتير الشراء المسددة من الدرج (تنقصه) تتزامن دون تعليق
    /// ودون سحب على المكشوف: كلاهما يأخذ قفل الكتابة المالي نفسه، وفحص رصيد الدرج يحدث داخل القفل.
    /// يستخدم التهيئة الكاملة حتى يكون فحص رصيد الدرج في المشتريات فعّالاً كما في الإنتاج.
    /// </summary>
    [TestFixture]
    [NonParallelizable]
    public class S41_ConcurrentDrawerWritersTest : S30_Step3BFixtureBase
    {
        private const int PaymentThreads = 6;
        private const int PurchaseThreads = 6;
        private const long OpeningFloat = 10000;
        private const long PaymentAmount = 500;
        private const long PurchaseAmount = 4000;

        [Test]
        public void CustomerPaymentsAndDrawerPurchases_RunTogether_WithoutDeadlockOrOverdraft()
        {
            OpenShift(OpeningFloat);
            var supplier = DatabaseService.Suppliers.Save(new Supplier { Name = "مورد التزامن", IsActive = true });
            var product = CreateProduct("صنف مشتريات متزامنة", 9000, 1000, 0);
            var customer = DatabaseService.Customers.SaveCustomer(new Customer
            {
                Name = "عميل التزامن",
                Phone = "010" + Guid.NewGuid().ToString("N").Substring(0, 8),
                BalancePiasters = 100000,
                CreditLimitPiasters = 500000
            });

            var paymentErrors = new Exception[PaymentThreads];
            var purchaseErrors = new Exception[PurchaseThreads];
            var purchaseSucceeded = new bool[PurchaseThreads];
            var threads = new List<Thread>();
            var gate = new ManualResetEvent(false);

            for (int i = 0; i < PaymentThreads; i++)
            {
                int slot = i;
                var t = new Thread(delegate ()
                {
                    gate.WaitOne();
                    try
                    {
                        DatabaseService.CustomerRepo.RecordPayment(customer.Id, PaymentAmount, "سداد متزامن");
                    }
                    catch (Exception ex)
                    {
                        paymentErrors[slot] = ex;
                    }
                });
                t.IsBackground = true;
                threads.Add(t);
            }

            for (int i = 0; i < PurchaseThreads; i++)
            {
                int slot = i;
                var t = new Thread(delegate ()
                {
                    gate.WaitOne();
                    try
                    {
                        var purchase = new Purchase
                        {
                            SupplierId = supplier.Id,
                            PaidAmountPiasters = PurchaseAmount,
                            PaymentSource = "cash_drawer",
                            Items = new List<PurchaseItem>
                            {
                                new PurchaseItem { ProductId = product.Id, ProductName = product.Name, QuantityMilli = 1000, UnitCostPiasters = PurchaseAmount }
                            }
                        };
                        DatabaseService.Purchases.CreatePurchase(purchase, "LATEST", null);
                        purchaseSucceeded[slot] = true;
                    }
                    catch (Exception ex)
                    {
                        purchaseErrors[slot] = ex;
                    }
                });
                t.IsBackground = true;
                threads.Add(t);
            }

            for (int i = 0; i < threads.Count; i++)
            {
                threads[i].Start();
            }
            gate.Set();
            for (int i = 0; i < threads.Count; i++)
            {
                Assert.IsTrue(threads[i].Join(TimeSpan.FromSeconds(90)), "الخيط توقف عن الاستجابة: تعليق (deadlock) محتمل بين السداد والشراء");
            }

            for (int i = 0; i < PaymentThreads; i++)
            {
                Assert.IsNull(paymentErrors[i], "سداد العميل يجب أن ينجح دائماً: " + (paymentErrors[i] != null ? paymentErrors[i].Message : ""));
            }

            int succeeded = 0;
            for (int i = 0; i < PurchaseThreads; i++)
            {
                if (purchaseSucceeded[i])
                {
                    succeeded++;
                }
                else
                {
                    Assert.IsNotNull(purchaseErrors[i]);
                    Assert.IsInstanceOf<InvalidOperationException>(purchaseErrors[i], "الرفض الوحيد المقبول هو عدم كفاية رصيد الدرج: " + purchaseErrors[i].Message);
                    StringAssert.Contains("رصيد نقدية الدرج", purchaseErrors[i].Message);
                }
            }

            // الرصيد المتاح: 100.00 عهدة + 5 x 6 = 30.00 سداد = 130.00 كحد أقصى، وكل شراء 40.00:
            // لا يمكن أن ينجح أكثر من 3 مشتريات، ويضمن العهدة وحدها نجاح اثنين على الأقل
            Assert.GreaterOrEqual(succeeded, 2, "العهدة وحدها تكفي لشراءين");
            Assert.LessOrEqual(succeeded, 3, "أكثر من 3 مشتريات يعني سحباً على المكشوف من الدرج");

            long expectedDrawer = OpeningFloat + PaymentThreads * PaymentAmount - succeeded * PurchaseAmount;
            var preview = DatabaseService.DailyClosing.GetClosingPreview(null);
            Assert.AreEqual(expectedDrawer, preview.ExpectedCashPiasters, "رصيد الدرج النهائي = العهدة + السداد - المشتريات الناجحة");
            Assert.GreaterOrEqual(preview.ExpectedCashPiasters, 0L, "لا رصيد سالب في الدرج");

            Assert.AreEqual(succeeded, Scalar("SELECT COUNT(*) FROM purchases;"), "عدد الفواتير المخزنة = الناجح فقط");
            Assert.AreEqual(100000 - PaymentThreads * PaymentAmount, Scalar("SELECT balance_piasters FROM customers WHERE id = @c;", "@c", customer.Id), "رصيد العميل بعد 6 سدادات");
        }
    }
}
