using System;
using System.Collections.Generic;
using NUnit.Framework;
using RafiqPOS.Common;
using RafiqPOS.Models;
using RafiqPOS.Repositories;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    [TestFixture]
    [NonParallelizable]
    public class S10_AuditFixesVerificationTest : TestBase
    {
        [TearDown]
        public override void BaseTearDown()
        {
            SecurityService.SetCurrentUserForTesting(null);
            base.BaseTearDown();
        }

        [Test]
        public void Scenario_F004_TaxInclusive_DoesNotDoubleCountTaxInGrandTotal()
        {
            // 1. Arrange: ضبط إعداد الأسعار شاملة الضريبة (السائد في التجزئة المصرية)
            SettingsRepo.Set("prices_include_tax", "true");

            // منتج بسعر 114 جنيه (11400 قرش) شامل ضريبة 14% (الضريبة المستخرجة 1400 قرش والتكلفة 8000 قرش)
            var prod = CreateTestProduct("شامبو 250 مل ضريبي", 11400, 8000, 50000);
            prod.TaxRatePercent = 14;
            ProductRepo.Upsert(prod);

            OpenTestShift();

            // 2. Act: تسجيل فاتورة بيع نقدي لصنف واحد
            var sale = new Sale
            {
                CashierId = "usr_cashier_1",
                CashierName = "كاشير 1",
                PaymentMethod = "cash",
                PaidPiasters = 11400, // العميل دفع 114 ج
                Items = new List<SaleItem>
                {
                    new SaleItem
                    {
                        ProductId = prod.Id,
                        ProductName = prod.Name,
                        QuantityMilli = 1000, // قطعة واحدة
                        UnitPricePiasters = 11400,
                        TotalPiasters = 11400,
                        TaxRatePercent = 14
                    }
                }
            };

            var processedSale = SaleService.ProcessSale(sale, null);

            // 3. Assert: الضريبة مستخرجة من السعر والإجمالي لا يتضاعف
            Assert.AreEqual(11400, processedSale.TotalPiasters, "إجمالي الفاتورة يجب أن يظل 11400 قرش ولا يُضاف عليه 1400 قرش مرة ثانية");
            Assert.AreEqual(1400, processedSale.TaxPiasters, "الضريبة المستخرجة يجب أن تكون 1400 قرش (14%)");
            Assert.AreEqual(11400, processedSale.PaidPiasters, "المدفوع يجب أن يطابق الإجمالي ولا يتحول لدين آجل");
            Assert.AreEqual(0, processedSale.ChangePiasters, "الباقي للعميل يجب أن يكون صفراً");
        }

        [Test]
        public void Scenario_F005_CashierDiscountLimit_CannotBeBypassedWithFractionalPercentages()
        {
            // صنف بسعر 10000 قرش (100 ج)
            var prod = CreateTestProduct("زيت طعام 1 لتر", 10000, 7500, 50000);
            OpenTestShift();

            try
            {
                SecurityService.SetCurrentUserForTesting(new UserDto
                {
                    Id = "usr_cashier_1",
                    Role = "cashier",
                    Username = "cashier1",
                    DisplayName = "كاشير 1",
                    IsActive = true
                });

                // محاولة إعطاء خصم 10.5% (1050 قرش) للكاشير عند حد 10%
                // في القسمة الصحيحة السابقة: (1050 * 100) / 10000 = 10% وكانت تمر بدون مشرف!
                // بعد الإصلاح بالضرب المتقاطع: (1050 * 100) > (10 * 10000) فيُطلب اعتماد المشرف
                var sale = new Sale
                {
                    CashierId = "usr_cashier_1",
                    CashierName = "كاشير 1",
                    PaymentMethod = "cash",
                    PaidPiasters = 8950,
                    Items = new List<SaleItem>
                    {
                        new SaleItem
                        {
                            ProductId = prod.Id,
                            ProductName = prod.Name,
                            QuantityMilli = 1000,
                            UnitPricePiasters = 10000,
                            DiscountPiasters = 1050,
                            TotalPiasters = 8950
                        }
                    }
                };

                // يجب أن يرمي استثناء لطلب اعتماد المشرف لتجاوز نسبة 10%
                var ex = Assert.Throws<InvalidOperationException>(delegate
                {
                    SaleService.ProcessSale(sale, null);
                });

                Assert.IsTrue(ex.Message.Contains("مشرف") || ex.Message.Contains("الحد الأقصى للخصم"),
                    "يجب رفض الخصم الذي يتجاوز 10% ولو بكسور عشرية ومطالبة المشرف");
            }
            finally
            {
                SecurityService.SetCurrentUserForTesting(null);
            }
        }

        [Test]
        public void Scenario_F007_DrawerCash_ReturnsAmountWhenSupplierPaymentCancelled()
        {
            // 1. Arrange: فتح وردية بـ 50000 قرش (500 ج) عهدة درج
            var shift = OpenTestShift("usr_cashier_1", "كاشير 1", 50000);

            // تسجيل مبيعات نقدية بـ 30000 قرش (300 ج) حتى يتوفر نقد كافٍ في الدرج لسداد المورد
            var cashProd = CreateTestProduct("بضاعة بيع نقدي", 30000, 15000, 20000);
            SaleService.ProcessSale(new Sale
            {
                CashierId = "usr_cashier_1",
                CashierName = "كاشير 1",
                PaymentMethod = "cash",
                PaidPiasters = 30000,
                Items = new List<SaleItem>
                {
                    new SaleItem
                    {
                        ProductId = cashProd.Id,
                        ProductName = cashProd.Name,
                        QuantityMilli = 1000,
                        UnitPricePiasters = 30000,
                        TotalPiasters = 30000
                    }
                }
            }, null);

            var supplier = new Supplier
            {
                Name = "شركة الأمل للتوزيع",
                Phone = "01122334455",
                BalancePiasters = 50000 // مدينين للمورد بـ 500 ج
            };
            supplier = SupplierRepo.Save(supplier);

            DateTime shiftStart = DateTime.Parse(shift.OpenedAt).ToLocalTime();

            // 2. صرف 20000 قرش (200 ج) للمورد نقداً من الدرج
            SupplierRepo.RecordPayment(supplier.Id, 20000, "دفعة نقدية", "usr_cashier_1", "cash_drawer");

            // التحقق من تسجيل حركة الصرف
            var transList = SupplierRepo.GetTransactions(supplier.Id, 10);
            Assert.IsTrue(transList.Count > 0, "يجب وجود حركة مسجلة للمورد");
            string paymentTransId = transList[0].Id;

            // فحص نقدية الدرج بعد الصرف
            var resAfterPay = DrawerCashCalculator.Calculate(ConnectionString, shiftStart, DateTime.Now.AddMinutes(5), shift.Id);
            Assert.AreEqual(20000, resAfterPay.SupplierPaymentsPiasters, "مدفوعات الموردين في الدرج يجب أن تكون 20000 قرش");

            // 3. إلغاء سند صرف المورد (استرداد المبلغ للدرج)
            SupplierRepo.CancelPayment(supplier.Id, paymentTransId, "إلغاء السند وعودة المبلغ للدرج", "usr_admin");

            // 4. Assert: نقدية الدرج بعد الإلغاء
            var resAfterCancel = DrawerCashCalculator.Calculate(ConnectionString, shiftStart, DateTime.Now.AddMinutes(5), shift.Id);
            Assert.AreEqual(0, resAfterCancel.SupplierPaymentsPiasters, "بعد إلغاء السند يجب أن تصبح مدفوعات الموردين من الدرج صفراً");
        }

        [Test]
        public void Scenario_F010_PurchaseReturnWithoutInvoice_ExecutesSafely()
        {
            var supplier = new Supplier
            {
                Name = "مورد أدوية ومستحضرات",
                Phone = "01099887766",
                BalancePiasters = 100000
            };
            supplier = SupplierRepo.Save(supplier);

            var prod = CreateTestProduct("كريم مرطب طبي", 6000, 4000, 20000);

            var purchaseRepo = new PurchaseRepository(ConnectionString, CounterRepo, SupplierRepo, PriceHistoryRepo, AuditRepo);

            // إنشاء مرتجع مشتريات بدون ربط بفاتورة شراء أصلية (purchaseId = null)
            var returnDoc = new PurchaseReturn
            {
                SupplierId = supplier.Id,
                PurchaseId = null,
                Notes = "بضاعة تالفة عند الاستلام",
                RefundMethod = "BALANCE_DEDUCTION",
                Items = new List<PurchaseReturnItem>
                {
                    new PurchaseReturnItem
                    {
                        ProductId = prod.Id,
                        ProductName = prod.Name,
                        QuantityMilli = 2000, // إرجاع 2 قطعة
                        UnitCostPiasters = 4000,
                        TotalCostPiasters = 8000
                    }
                }
            };

            // لا يجب أن يرمي استثناء: no such column: purchase_date
            Assert.DoesNotThrow(delegate
            {
                var ret = purchaseRepo.CreatePurchaseReturn(returnDoc, "usr_admin_1");
                Assert.IsNotNull(ret);
                Assert.AreEqual(8000, ret.TotalCostPiasters);
            }, "مرتجع المشتريات بدون فاتورة يجب ألا يفشل بخلل عمود purchase_date");
        }

        [Test]
        public void Scenario_F017_DemoDataClear_NeverDeletesRealProductsWithArabicKeywords()
        {
            // 1. Arrange: إنشاء صنف حقيقي اسمه "اختبار الحمل منزلي"
            var realPregnancyTest = CreateTestProduct("اختبار الحمل منزلي سريع", 2500, 1500, 10000);

            // صنف حقيقي آخر يحتوي كلمة "تجريبي" في اسمه التجاري الواقعي
            var realSampleProduct = CreateTestProduct("عطر فرنسي عبوة تجريبية 5 مل", 5000, 3000, 5000);

            // صنف ديمو تجريبي فعلي بالبادئة demo_
            var demoProd = new Product
            {
                Id = "demo_test_item_999",
                Name = "صنف وهمي للاختبار",
                Barcode = "DEMO_BAR_999",
                PricePiasters = 1000,
                CostPiasters = 500,
                StockQuantityMilli = 5000,
                Unit = "piece",
                IsActive = true
            };
            ProductRepo.Upsert(demoProd);

            // 2. Act: تشغيل خدمة مسح البيانات التجريبية
            var demoService = new DemoDataService(ConnectionString, SettingsRepo, AuditRepo);
            var clearRes = demoService.ClearDemoData();

            // 3. Assert: الأصناف الحقيقية يجب أن تبقى موجودة بالكامل في قاعدة البيانات
            var fetchedReal1 = ProductRepo.GetById(realPregnancyTest.Id);
            Assert.IsNotNull(fetchedReal1, "الصنف الحقيقي اختبار الحمل لا يجب حذفه نهائياً");
            Assert.AreEqual("اختبار الحمل منزلي سريع", fetchedReal1.Name);

            var fetchedReal2 = ProductRepo.GetById(realSampleProduct.Id);
            Assert.IsNotNull(fetchedReal2, "الصنف الحقيقي الذي يحتوي كلمة تجريبي لا يجب حذفه نهائياً");

            // الصنف الوهمي بالبادئة demo_ فقط هو الذي يُحذف
            var fetchedDemo = ProductRepo.GetById("demo_test_item_999");
            Assert.IsNull(fetchedDemo, "صنف الديمو ذو البادئة demo_ هو فقط الذي يجب حذفه");
        }
    }
}
