using System;
using System.Collections.Generic;
using System.Data.SQLite;
using Newtonsoft.Json;
using NUnit.Framework;
using RafiqPOS.Models;
using RafiqPOS.Repositories;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    /// <summary>
    /// الجولة الثانية للمرحلة 1:
    /// R1 سطران لنفس الصنف يُردان كل بسجله ومرتجع قديم بلا معرّف سطر،
    /// R2 المرتجع المرتبط بفاتورة مع علم "بدون فاتورة" أو عبر المستودع مباشرة لا يثق بإجمالي العميل،
    /// R4 مرتجع الصلاحية للمورد يعتمد نسبة المورد المضبوطة وتكلفة التشغيلة لا قيم العميل.
    /// (R3 رسوم الخدمة والتوصيل في S39.)
    /// </summary>
    [TestFixture]
    [NonParallelizable]
    public class S43_ReturnAndExpiryRound2Test : TestBase
    {
        private ProductBatchRepository _batchRepo;
        private PurchaseRepository _purchaseRepo;
        private DrugReferenceService _drugReference;

        [SetUp]
        public void SetUpRound2()
        {
            _batchRepo = new ProductBatchRepository(ConnectionString, AuditRepo);
            _purchaseRepo = new PurchaseRepository(ConnectionString, CounterRepo, SupplierRepo, PriceHistoryRepo, AuditRepo, _batchRepo);
            _drugReference = new DrugReferenceService(new DrugReferenceRepository(ConnectionString, AuditRepo), null, _purchaseRepo, _batchRepo);
        }

        private long Scalar(string sql, params object[] nameValuePairs)
        {
            using (var conn = new SQLiteConnection(ConnectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    for (int i = 0; i + 1 < nameValuePairs.Length; i += 2)
                    {
                        cmd.Parameters.AddWithValue((string)nameValuePairs[i], nameValuePairs[i + 1]);
                    }
                    object val = cmd.ExecuteScalar();
                    return val == null || val == DBNull.Value ? 0 : Convert.ToInt64(val);
                }
            }
        }

        private static Return CashReturn(Sale sale, Shift shift, string saleItemId, Product product, long quantityMilli)
        {
            return new Return
            {
                SaleId = sale.Id,
                CashierId = shift.CashierId,
                RefundMethod = "cash",
                Reason = "مرتجع اختبار",
                Items = new List<ReturnItem>
                {
                    new ReturnItem { SaleItemId = saleItemId, ProductId = product.Id, ProductName = product.Name, QuantityMilli = quantityMilli }
                }
            };
        }

        private Sale SellSingleLine(Shift shift, Product product, long quantityMilli, long unitPricePiasters, long lineDiscountPiasters)
        {
            long total = unitPricePiasters * quantityMilli / 1000 - lineDiscountPiasters;
            return SaleService.ProcessSale(new Sale
            {
                ShiftId = shift.Id,
                CashierId = shift.CashierId,
                CashierName = shift.CashierName,
                PaymentMethod = "cash",
                PaidPiasters = total,
                Items = new List<SaleItem>
                {
                    new SaleItem
                    {
                        ProductId = product.Id,
                        ProductName = product.Name,
                        QuantityMilli = quantityMilli,
                        UnitPricePiasters = unitPricePiasters,
                        DiscountPiasters = lineDiscountPiasters,
                        TotalPiasters = total
                    }
                }
            }, null);
        }

        // ---------- R1 ----------

        [Test]
        public void R1_TwoLinesOfTheSameProduct_AreRefundedEachAtItsOwnLineValue()
        {
            var shift = OpenTestShift("usr_cashier_1", "كاشير 1", 50000);
            var product = CreateTestProduct("صنف سطران ثانية", 10000, 6000, 100000);
            var sale = SaleService.ProcessSale(new Sale
            {
                ShiftId = shift.Id,
                CashierId = shift.CashierId,
                PaymentMethod = "cash",
                PaidPiasters = 50000,
                Items = new List<SaleItem>
                {
                    new SaleItem { ProductId = product.Id, ProductName = product.Name, QuantityMilli = 2000, UnitPricePiasters = 10000, TotalPiasters = 20000 },
                    new SaleItem { ProductId = product.Id, ProductName = product.Name, QuantityMilli = 3000, UnitPricePiasters = 10000, TotalPiasters = 30000 }
                }
            }, null);
            SaleItem lineA = sale.Items.Find(delegate (SaleItem i) { return i.QuantityMilli == 2000; });
            SaleItem lineB = sale.Items.Find(delegate (SaleItem i) { return i.QuantityMilli == 3000; });
            Assert.IsNotNull(lineA);
            Assert.IsNotNull(lineB);
            Assert.AreEqual(20000, lineA.TotalPiasters);
            Assert.AreEqual(30000, lineB.TotalPiasters);

            var r1 = ReturnService.ProcessReturn(CashReturn(sale, shift, lineA.Id, product, 1000));
            Assert.AreEqual(10000, r1.TotalPiasters, "نصف السطر الأول");

            var r2 = ReturnService.ProcessReturn(CashReturn(sale, shift, lineB.Id, product, 2000));
            Assert.AreEqual(20000, r2.TotalPiasters, "ثلثا السطر الثاني بالضبط");

            var r3 = ReturnService.ProcessReturn(CashReturn(sale, shift, lineB.Id, product, 1000));
            Assert.AreEqual(10000, r3.TotalPiasters, "المتبقي من السطر الثاني بالضبط");

            Assert.AreEqual(30000, Scalar("SELECT COALESCE(SUM(total_piasters), 0) FROM return_items WHERE sale_item_id = @i;", "@i", lineB.Id), "مجموع ما رُد من السطر الثاني = قيمته");
            Assert.AreEqual(10000, Scalar("SELECT COALESCE(SUM(total_piasters), 0) FROM return_items WHERE sale_item_id = @i;", "@i", lineA.Id));

            Assert.Throws<InvalidOperationException>(delegate
            {
                ReturnService.ProcessReturn(CashReturn(sale, shift, lineB.Id, product, 1000));
            }, "السطر الثاني استُنفد");
        }

        [Test]
        public void R1_BogusClientSaleItemId_IsResolvedByProduct_AndTheRealLineIdIsSaved()
        {
            var shift = OpenTestShift("usr_cashier_1", "كاشير 1", 50000);
            var product = CreateTestProduct("صنف معرّف خاطئ", 10000, 6000, 100000);
            var sale = SellSingleLine(shift, product, 2000, 10000, 0);
            string realLineId = sale.Items[0].Id;

            var ret = ReturnService.ProcessReturn(CashReturn(sale, shift, "bogus", product, 1000));

            Assert.AreEqual(10000, ret.TotalPiasters);
            Assert.AreEqual(realLineId, ret.Items[0].SaleItemId, "المعرف الحقيقي للسطر وليس ما أرسله العميل");
            Assert.AreEqual(1, Scalar("SELECT COUNT(*) FROM return_items WHERE return_id = @r AND sale_item_id = @i;", "@r", ret.Id, "@i", realLineId), "المخزن هو المعرف الحقيقي");
            Assert.AreEqual(0, Scalar("SELECT COUNT(*) FROM return_items WHERE sale_item_id = 'bogus';"));
        }

        [Test]
        public void R1_LegacyReturnWithoutSaleItemId_IsCountedWhenTheNextReturnExhaustsTheLine()
        {
            // يتوقع هذا الاختبار أن آخر مرتجع يسترد 10000 فقط وألا يتجاوز المسترد قيمة السطر،
            // وبالقراءة الثابتة للإنتاج (refundedBefore يعد فقط البنود ذات SaleItemId) يتوقع أن يفشل حتى يُصلح (انظر التقرير)
            var shift = OpenTestShift("usr_cashier_1", "كاشير 1", 50000);
            var product = CreateTestProduct("صنف مرتجع قديم", 10000, 6000, 100000);
            var sale = SellSingleLine(shift, product, 2000, 10000, 0);
            string lineId = sale.Items[0].Id;

            // مرتجع محفوظ بلا معرّف سطر (كما كتبته الإصدارات القديمة)
            ReturnRepo.CreateReturnAtomic(new Return
            {
                SaleId = sale.Id,
                CashierId = shift.CashierId,
                RefundMethod = "cash",
                Reason = "مرتجع قديم",
                Items = new List<ReturnItem>
                {
                    new ReturnItem { ProductId = product.Id, ProductName = product.Name, QuantityMilli = 1000, UnitPricePiasters = 10000 }
                }
            });
            Assert.AreEqual(1, Scalar("SELECT COUNT(*) FROM return_items WHERE sale_item_id IS NULL;"), "المرتجع القديم بلا معرّف سطر");
            Assert.AreEqual(10000, Scalar("SELECT COALESCE(SUM(total_piasters), 0) FROM returns WHERE sale_id = @s;", "@s", sale.Id));

            var last = ReturnService.ProcessReturn(CashReturn(sale, shift, lineId, product, 1000));

            Assert.AreEqual(10000, last.TotalPiasters, "المتبقي من السطر بعد المرتجع القديم");
            Assert.LessOrEqual(Scalar("SELECT COALESCE(SUM(total_piasters), 0) FROM returns WHERE sale_id = @s;", "@s", sale.Id), 20000L, "المسترد لا يتجاوز قيمة السطر");
        }

        // ---------- R2 ----------

        [Test]
        public void R2_NoInvoiceFlagWithSaleId_IgnoresTheClientTotal()
        {
            var shift = OpenTestShift("usr_cashier_1", "كاشير 1", 50000);
            var product = CreateTestProduct("صنف علم بدون فاتورة", 10000, 6000, 100000);
            var sale = SellSingleLine(shift, product, 1000, 10000, 0);

            var ret = ReturnService.ProcessReturn(new Return
            {
                SaleId = sale.Id,
                IsWithoutInvoice = true,
                CashierId = shift.CashierId,
                RefundMethod = "cash",
                Reason = "مرتجع بعلم بدون فاتورة",
                TotalPiasters = 99999,
                Items = new List<ReturnItem>
                {
                    new ReturnItem { ProductId = product.Id, ProductName = product.Name, QuantityMilli = 1000, UnitPricePiasters = 10000, TotalPiasters = 99999 }
                }
            });

            Assert.AreEqual(10000, ret.TotalPiasters, "السعر x الكمية لا إجمالي العميل");
            Assert.AreEqual(10000, Scalar("SELECT total_piasters FROM returns WHERE id = @r;", "@r", ret.Id), "الإجمالي المخزن");
            Assert.AreEqual(10000, Scalar("SELECT COALESCE(SUM(total_piasters), 0) FROM return_items WHERE return_id = @r;", "@r", ret.Id), "إجمالي البند المخزن");
        }

        [Test]
        public void R2_NormalInvoiceReturnOfADiscountedLine_StillRefundsTheServiceComputedNet()
        {
            var shift = OpenTestShift("usr_cashier_1", "كاشير 1", 50000);
            var product = CreateTestProduct("صنف خصم سطر", 10000, 6000, 100000);
            var sale = SellSingleLine(shift, product, 1000, 10000, 2500);
            Assert.AreEqual(7500, sale.Items[0].TotalPiasters, "صافي السطر بعد الخصم");

            var ret = ReturnService.ProcessReturn(CashReturn(sale, shift, sale.Items[0].Id, product, 1000));

            Assert.AreEqual(7500, ret.TotalPiasters, "المسترد = الصافي الذي دفعه العميل");
        }

        [Test]
        public void R2_RepositoryCreateReturnAtomic_CapsAClientTotalAtPriceTimesQuantity()
        {
            var shift = OpenTestShift("usr_cashier_1", "كاشير 1", 50000);
            var product = CreateTestProduct("صنف سقف المستودع", 10000, 6000, 100000);
            var sale = SellSingleLine(shift, product, 3000, 10000, 0);

            var withLineId = ReturnRepo.CreateReturnAtomic(new Return
            {
                SaleId = sale.Id,
                CashierId = shift.CashierId,
                RefundMethod = "cash",
                Reason = "مباشر",
                TotalPiasters = 99999,
                Items = new List<ReturnItem>
                {
                    new ReturnItem { SaleItemId = sale.Items[0].Id, ProductId = product.Id, ProductName = product.Name, QuantityMilli = 1000, UnitPricePiasters = 10000, TotalPiasters = 99999 }
                }
            });
            Assert.AreEqual(10000, withLineId.TotalPiasters, "سقف السعر x الكمية مع معرّف السطر");

            var withoutLineId = ReturnRepo.CreateReturnAtomic(new Return
            {
                SaleId = sale.Id,
                CashierId = shift.CashierId,
                RefundMethod = "cash",
                Reason = "مباشر 2",
                TotalPiasters = 99999,
                Items = new List<ReturnItem>
                {
                    new ReturnItem { ProductId = product.Id, ProductName = product.Name, QuantityMilli = 1000, UnitPricePiasters = 10000, TotalPiasters = 99999 }
                }
            });
            Assert.AreEqual(10000, withoutLineId.TotalPiasters, "سقف السعر x الكمية بدون معرّف السطر");
            Assert.AreEqual(20000, Scalar("SELECT COALESCE(SUM(total_piasters), 0) FROM returns WHERE sale_id = @s;", "@s", sale.Id));
        }

        // ---------- R4 ----------

        private Supplier NewSupplier(string name, int? expiryCreditBps)
        {
            return SupplierRepo.Save(new Supplier { Name = name, IsActive = true, ExpiryReturnCreditBps = expiryCreditBps });
        }

        private ProductBatch NewBatch(Supplier supplier, string productName)
        {
            // التكلفة 10.00 ج للوحدة في الكتالوج وفي التشغيلة
            var product = CreateTestProduct(productName, 2000, 1000, 100000);
            return _batchRepo.CreateOrUpdateBatch(new ProductBatch
            {
                ProductId = product.Id,
                BatchNumber = "EXP-" + Guid.NewGuid().ToString("N").Substring(0, 8),
                ExpiryDate = DateTime.Now.AddDays(20).ToString("yyyy-MM-dd"),
                QuantityMilli = 50000,
                CostPricePiasters = 1000,
                SupplierId = supplier.Id
            });
        }

        private PurchaseReturn ExpiryReturn(Supplier supplier, ProductBatch batch, int clientCreditBps, long clientUnitCostPiasters)
        {
            var request = new BatchExpiryReturnRequest
            {
                SupplierId = supplier.Id,
                Items = new List<BatchExpiryReturnItemRequest>
                {
                    new BatchExpiryReturnItemRequest { BatchId = batch.Id, QuantityMilli = 10000, UnitCostPiasters = clientUnitCostPiasters, CreditBps = clientCreditBps }
                }
            };
            return _drugReference.CreateExpiryPurchaseReturn(request, null);
        }

        [Test]
        public void R4_SupplierConfiguredCredit_WinsOverTheClientCreditBps()
        {
            var supplier = NewSupplier("مورد نسبة 70", 7000);
            var batch = NewBatch(supplier, "دواء نسبة المورد");

            var ret = ExpiryReturn(supplier, batch, 10000, 1000);

            Assert.AreEqual(7000, ret.TotalCostPiasters, "10 وحدات x 10.00 ج x 70%");
        }

        [Test]
        public void R4_SupplierConfiguredCredit_WinsOverTheOldAgreedCreditBpsField()
        {
            var supplier = NewSupplier("مورد نسبة 70 قديم", 7000);
            var batch = NewBatch(supplier, "دواء الحقل القديم");

            // الواجهة القديمة ترسل agreedCreditBps؛ الحقل غير معروف فيُهمل ولا يرفع النسبة
            var item = JsonConvert.DeserializeObject<BatchExpiryReturnItemRequest>(
                "{\"batchId\":\"" + batch.Id + "\",\"quantityMilli\":10000,\"unitCostPiasters\":1000,\"agreedCreditBps\":10000}");
            var ret = _drugReference.CreateExpiryPurchaseReturn(new BatchExpiryReturnRequest
            {
                SupplierId = supplier.Id,
                Items = new List<BatchExpiryReturnItemRequest> { item }
            }, null);

            Assert.AreEqual(7000, ret.TotalCostPiasters);
        }

        [Test]
        public void R4_SupplierWithoutConfiguredCredit_UsesTheClientCredit_ClampedToTheValidRange()
        {
            var supplier = NewSupplier("مورد بلا نسبة", null);

            Assert.AreEqual(5000, ExpiryReturn(supplier, NewBatch(supplier, "دواء 50"), 5000, 1000).TotalCostPiasters, "نسبة العميل 50% عند عدم ضبط المورد");
            Assert.AreEqual(10000, ExpiryReturn(supplier, NewBatch(supplier, "دواء 200"), 20000, 1000).TotalCostPiasters, "لا تتجاوز 100%");
            Assert.AreEqual(10000, ExpiryReturn(supplier, NewBatch(supplier, "دواء سالب"), -5, 1000).TotalCostPiasters, "النسبة السالبة لا تنقص ولا تعكس القيمة");
            Assert.AreEqual(10000, ExpiryReturn(supplier, NewBatch(supplier, "دواء صفر"), 0, 1000).TotalCostPiasters, "بدون نسبة = 100%");
        }

        [Test]
        public void R4_ClientUnitCost_IsIgnored_BatchCostIsUsed()
        {
            var supplier = NewSupplier("مورد التكلفة", 7000);
            var batch = NewBatch(supplier, "دواء تكلفة العميل");

            var ret = ExpiryReturn(supplier, batch, 10000, 9999);

            Assert.AreEqual(7000, ret.TotalCostPiasters, "تكلفة التشغيلة 10.00 ج لا 99.99 ج");
            Assert.AreEqual(700, ret.Items[0].UnitCostPiasters, "تكلفة الوحدة بعد نسبة المورد");
        }
    }
}
