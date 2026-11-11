using System;
using System.Collections.Generic;
using RafiqPOS.Data;
using System.Threading;
using NUnit.Framework;
using RafiqPOS.Models;
using RafiqPOS.Repositories;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    /// <summary>
    /// H1 (المرحلة 1): إعادة محاولة فاتورة شراء أو مرتجع شراء أو سداد مورد بنفس مفتاح العملية وبنفس البيانات
    /// تُرجع العملية الأولى دون ترحيل ثانٍ للمخزون أو رصيد المورد أو الدرج، ونفس المفتاح مع بيانات مختلفة يُرفض.
    /// </summary>
    [TestFixture]
    [NonParallelizable]
    public class S36_PurchasingIdempotencyTest : TestBase
    {
        private const string SameOperationText = "نفس رقم العملية";

        private PurchaseRepository _purchaseRepo;
        private PurchaseService _purchases;
        private SupplierService _suppliers;

        [SetUp]
        public void SetUpPurchasing()
        {
            _purchaseRepo = new PurchaseRepository(ConnectionString, CounterRepo, SupplierRepo, PriceHistoryRepo, AuditRepo);
            _purchases = new PurchaseService(_purchaseRepo);
            _suppliers = new SupplierService(SupplierRepo);
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

        private static Purchase BuildPurchase(string key, Supplier supplier, Product prod, long quantityMilli, long unitCostPiasters, long paidPiasters)
        {
            return new Purchase
            {
                SupplierId = supplier.Id,
                PaidAmountPiasters = paidPiasters,
                PaymentSource = "cash_drawer",
                IdempotencyKey = key,
                Items = new List<PurchaseItem>
                {
                    new PurchaseItem { ProductId = prod.Id, ProductName = prod.Name, QuantityMilli = quantityMilli, UnitCostPiasters = unitCostPiasters }
                }
            };
        }

        private static PurchaseReturn BuildReturn(string key, Supplier supplier, Purchase purchase, Product prod, long quantityMilli)
        {
            return new PurchaseReturn
            {
                SupplierId = supplier.Id,
                PurchaseId = purchase.Id,
                IdempotencyKey = key,
                Items = new List<PurchaseReturnItem>
                {
                    new PurchaseReturnItem { ProductId = prod.Id, ProductName = prod.Name, QuantityMilli = quantityMilli }
                }
            };
        }

        private static string NewKey(string prefix)
        {
            return prefix + Guid.NewGuid().ToString("N");
        }

        private DailyClosingPreview Preview()
        {
            return DailyClosingService.GetClosingPreview(null);
        }

        [Test]
        public void CreatePurchase_RetriedWithSameKeyAndPayload_PostsStockSupplierAndDrawerOnce()
        {
            OpenTestShift("usr_cashier_1", "كاشير 1", 50000);
            var prod = CreateTestProduct("صنف مشتريات مكرر", 2000, 1000, 0);
            var supplier = SupplierRepo.Save(new Supplier { Name = "مورد التكرار", IsActive = true });
            string key = NewKey("pur_");
            long drawerBefore = Preview().ExpectedCashPiasters;

            // 5 وحدات بتكلفة 10.00 ج = 50.00 ج، يُسدد منها 20.00 ج من الدرج والباقي 30.00 ج دين للمورد
            var first = _purchases.CreatePurchase(BuildPurchase(key, supplier, prod, 5000, 1000, 2000), "LATEST", null);
            var retry = _purchases.CreatePurchase(BuildPurchase(key, supplier, prod, 5000, 1000, 2000), "LATEST", null);

            Assert.IsNotNull(first);
            Assert.IsNotNull(retry);
            Assert.AreEqual(first.Id, retry.Id, "إعادة المحاولة ترجع نفس الفاتورة");
            Assert.AreEqual(1, Scalar("SELECT COUNT(*) FROM purchases;"), "فاتورة شراء واحدة فقط");
            Assert.AreEqual(1, Scalar("SELECT COUNT(*) FROM purchases WHERE idempotency_key = @k;", "@k", key), "المفتاح محفوظ على الفاتورة");
            Assert.AreEqual(5000, ProductRepo.GetById(prod.Id).StockQuantityMilli, "المخزون زاد مرة واحدة");
            Assert.AreEqual(3000, SupplierRepo.GetById(supplier.Id).BalancePiasters, "رصيد المورد تحرك مرة واحدة");
            Assert.AreEqual(1, Scalar("SELECT COUNT(*) FROM supplier_transactions WHERE supplier_id = @s;", "@s", supplier.Id), "قيد واحد في كشف المورد");

            var after = Preview();
            Assert.AreEqual(2000, after.PurchasesDrawerCashPiasters, "المسدد من الدرج محسوب مرة واحدة");
            Assert.AreEqual(drawerBefore - 2000, after.ExpectedCashPiasters, "الدرج نقص مرة واحدة");
        }

        [Test]
        public void CreatePurchase_SameKeyDifferentQuantity_IsRejectedAndNothingIsPosted()
        {
            OpenTestShift("usr_cashier_1", "كاشير 1", 50000);
            var prod = CreateTestProduct("صنف مشتريات مختلف", 2000, 1000, 0);
            var supplier = SupplierRepo.Save(new Supplier { Name = "مورد الاختلاف", IsActive = true });
            string key = NewKey("pur_");

            _purchases.CreatePurchase(BuildPurchase(key, supplier, prod, 5000, 1000, 2000), "LATEST", null);

            var ex = Assert.Throws<InvalidOperationException>(delegate
            {
                _purchases.CreatePurchase(BuildPurchase(key, supplier, prod, 6000, 1000, 2000), "LATEST", null);
            });
            StringAssert.Contains(SameOperationText, ex.Message);

            Assert.AreEqual(1, Scalar("SELECT COUNT(*) FROM purchases;"), "لم تُسجل فاتورة جديدة");
            Assert.AreEqual(5000, ProductRepo.GetById(prod.Id).StockQuantityMilli, "المخزون لم يتغير بالطلب المرفوض");
            Assert.AreEqual(3000, SupplierRepo.GetById(supplier.Id).BalancePiasters, "رصيد المورد لم يتغير بالطلب المرفوض");
        }

        [Test]
        public void CreatePurchase_DifferentKeys_PostTwoInvoices()
        {
            var prod = CreateTestProduct("صنف مفتاحان", 2000, 1000, 0);
            var supplier = SupplierRepo.Save(new Supplier { Name = "مورد مفتاحين", IsActive = true });

            var a = _purchases.CreatePurchase(BuildPurchase(NewKey("pur_"), supplier, prod, 1000, 1000, 0), "LATEST", null);
            var b = _purchases.CreatePurchase(BuildPurchase(NewKey("pur_"), supplier, prod, 1000, 1000, 0), "LATEST", null);

            Assert.AreNotEqual(a.Id, b.Id);
            Assert.AreEqual(2, Scalar("SELECT COUNT(*) FROM purchases;"));
            Assert.AreEqual(2000, ProductRepo.GetById(prod.Id).StockQuantityMilli);
        }

        [Test]
        public void CreatePurchase_TwoThreadsSubmitTheSameKeyTogether_PostOnce()
        {
            var prod = CreateTestProduct("صنف نقرتان", 2000, 1000, 0);
            var supplier = SupplierRepo.Save(new Supplier { Name = "مورد النقرتين", IsActive = true });
            string key = NewKey("pur_");

            var results = new Purchase[2];
            var errors = new Exception[2];
            var gate = new ManualResetEvent(false);
            var threads = new Thread[2];
            for (int t = 0; t < 2; t++)
            {
                int slot = t;
                threads[slot] = new Thread(delegate ()
                {
                    gate.WaitOne();
                    try
                    {
                        results[slot] = _purchases.CreatePurchase(BuildPurchase(key, supplier, prod, 2000, 1000, 0), "LATEST", null);
                    }
                    catch (Exception ex)
                    {
                        errors[slot] = ex;
                    }
                });
                threads[slot].IsBackground = true;
                threads[slot].Start();
            }
            gate.Set();
            for (int t = 0; t < 2; t++)
            {
                Assert.IsTrue(threads[t].Join(TimeSpan.FromSeconds(60)), "الخيط توقف عن الاستجابة (تعليق محتمل)");
            }

            Assert.IsNull(errors[0], errors[0] != null ? errors[0].Message : "");
            Assert.IsNull(errors[1], errors[1] != null ? errors[1].Message : "");
            Assert.AreEqual(results[0].Id, results[1].Id, "الطلبان المتزامنان ينتهيان بنفس الفاتورة");
            Assert.AreEqual(1, Scalar("SELECT COUNT(*) FROM purchases;"), "فاتورة واحدة فقط");
            Assert.AreEqual(2000, ProductRepo.GetById(prod.Id).StockQuantityMilli, "المخزون زاد مرة واحدة");
            Assert.AreEqual(2000, SupplierRepo.GetById(supplier.Id).BalancePiasters, "الدين سُجل مرة واحدة");
        }

        [Test]
        public void CreatePurchaseReturn_RetriedWithSameKeyAndPayload_ReturnsStockAndCreditsSupplierOnce()
        {
            var prod = CreateTestProduct("صنف مرتجع مكرر", 2000, 1000, 0);
            var supplier = SupplierRepo.Save(new Supplier { Name = "مورد المرتجع", IsActive = true });
            var purchase = _purchases.CreatePurchase(BuildPurchase(null, supplier, prod, 5000, 1000, 0), "LATEST", null);
            Assert.AreEqual(5000, SupplierRepo.GetById(supplier.Id).BalancePiasters, "الدين قبل المرتجع");
            string key = NewKey("pret_");

            var first = _purchases.CreatePurchaseReturn(BuildReturn(key, supplier, purchase, prod, 2000), null);
            var retry = _purchases.CreatePurchaseReturn(BuildReturn(key, supplier, purchase, prod, 2000), null);

            Assert.AreEqual(first.Id, retry.Id, "إعادة المحاولة ترجع نفس المرتجع");
            Assert.AreEqual(2000, first.TotalCostPiasters, "قيمة المرتجع 2000 من 5000 وحدة تكلفة");
            Assert.AreEqual(1, Scalar("SELECT COUNT(*) FROM purchase_returns;"), "مرتجع واحد فقط");
            Assert.AreEqual(1, Scalar("SELECT COUNT(*) FROM purchase_returns WHERE idempotency_key = @k;", "@k", key));
            Assert.AreEqual(3000, ProductRepo.GetById(prod.Id).StockQuantityMilli, "المخزون خرج مرة واحدة");
            Assert.AreEqual(5000 - first.TotalCostPiasters, SupplierRepo.GetById(supplier.Id).BalancePiasters, "رصيد المورد خُصم مرة واحدة");
        }

        [Test]
        public void CreatePurchaseReturn_SameKeyDifferentQuantity_IsRejectedAndNothingIsPosted()
        {
            var prod = CreateTestProduct("صنف مرتجع مختلف", 2000, 1000, 0);
            var supplier = SupplierRepo.Save(new Supplier { Name = "مورد المرتجع المختلف", IsActive = true });
            var purchase = _purchases.CreatePurchase(BuildPurchase(null, supplier, prod, 5000, 1000, 0), "LATEST", null);
            string key = NewKey("pret_");

            var first = _purchases.CreatePurchaseReturn(BuildReturn(key, supplier, purchase, prod, 2000), null);
            long balanceAfterFirst = SupplierRepo.GetById(supplier.Id).BalancePiasters;

            var ex = Assert.Throws<InvalidOperationException>(delegate
            {
                _purchases.CreatePurchaseReturn(BuildReturn(key, supplier, purchase, prod, 1000), null);
            });
            StringAssert.Contains(SameOperationText, ex.Message);

            Assert.IsNotNull(first);
            Assert.AreEqual(1, Scalar("SELECT COUNT(*) FROM purchase_returns;"), "لم يُسجل مرتجع جديد");
            Assert.AreEqual(3000, ProductRepo.GetById(prod.Id).StockQuantityMilli, "المخزون لم يتغير بالطلب المرفوض");
            Assert.AreEqual(balanceAfterFirst, SupplierRepo.GetById(supplier.Id).BalancePiasters, "رصيد المورد لم يتغير بالطلب المرفوض");
        }

        [Test]
        public void RecordSupplierPayment_RetriedWithSameKeyAndAmount_PostsOnePaymentAndReducesDrawerOnce()
        {
            OpenTestShift("usr_cashier_1", "كاشير 1", 50000);
            var prod = CreateTestProduct("صنف سداد مكرر", 2000, 1000, 0);
            var supplier = SupplierRepo.Save(new Supplier { Name = "مورد السداد", IsActive = true });
            _purchases.CreatePurchase(BuildPurchase(null, supplier, prod, 5000, 1000, 0), "LATEST", null);
            long drawerBefore = Preview().ExpectedCashPiasters;
            string key = NewKey("spay_");

            _suppliers.RecordPayment(supplier.Id, 2000, "دفعة أولى", null, "cash_drawer", key);
            _suppliers.RecordPayment(supplier.Id, 2000, "دفعة أولى", null, "cash_drawer", key);

            Assert.AreEqual(1, Scalar("SELECT COUNT(*) FROM supplier_transactions WHERE supplier_id = @s AND transaction_type = 'PAYMENT';", "@s", supplier.Id), "سند صرف واحد فقط");
            Assert.AreEqual(1, Scalar("SELECT COUNT(*) FROM supplier_transactions WHERE idempotency_key = @k;", "@k", key));
            Assert.AreEqual(3000, SupplierRepo.GetById(supplier.Id).BalancePiasters, "رصيد المورد انخفض مرة واحدة");

            var after = Preview();
            Assert.AreEqual(2000, after.SupplierPaymentsDrawerCashPiasters, "المصروف للمورد من الدرج محسوب مرة واحدة");
            Assert.AreEqual(drawerBefore - 2000, after.ExpectedCashPiasters, "الدرج نقص مرة واحدة");
        }

        [Test]
        public void RecordSupplierPayment_SameKeyDifferentAmount_IsRejectedAndNothingIsPosted()
        {
            OpenTestShift("usr_cashier_1", "كاشير 1", 50000);
            var prod = CreateTestProduct("صنف سداد مختلف", 2000, 1000, 0);
            var supplier = SupplierRepo.Save(new Supplier { Name = "مورد السداد المختلف", IsActive = true });
            _purchases.CreatePurchase(BuildPurchase(null, supplier, prod, 5000, 1000, 0), "LATEST", null);
            string key = NewKey("spay_");

            _suppliers.RecordPayment(supplier.Id, 2000, "دفعة", null, "cash_drawer", key);
            long drawerAfterFirst = Preview().ExpectedCashPiasters;

            var ex = Assert.Throws<InvalidOperationException>(delegate
            {
                _suppliers.RecordPayment(supplier.Id, 2500, "دفعة", null, "cash_drawer", key);
            });
            StringAssert.Contains(SameOperationText, ex.Message);

            Assert.AreEqual(1, Scalar("SELECT COUNT(*) FROM supplier_transactions WHERE supplier_id = @s AND transaction_type = 'PAYMENT';", "@s", supplier.Id), "لم يُسجل سند جديد");
            Assert.AreEqual(3000, SupplierRepo.GetById(supplier.Id).BalancePiasters, "الرصيد لم يتغير بالطلب المرفوض");
            Assert.AreEqual(drawerAfterFirst, Preview().ExpectedCashPiasters, "الدرج لم يتغير بالطلب المرفوض");
        }

        [Test]
        public void RecordSupplierPayment_DifferentKeysSameAmount_PostTwoPayments()
        {
            OpenTestShift("usr_cashier_1", "كاشير 1", 50000);
            var prod = CreateTestProduct("صنف دفعتان", 2000, 1000, 0);
            var supplier = SupplierRepo.Save(new Supplier { Name = "مورد دفعتين", IsActive = true });
            _purchases.CreatePurchase(BuildPurchase(null, supplier, prod, 5000, 1000, 0), "LATEST", null);

            _suppliers.RecordPayment(supplier.Id, 1000, "دفعة", null, "cash_drawer", NewKey("spay_"));
            _suppliers.RecordPayment(supplier.Id, 1000, "دفعة", null, "cash_drawer", NewKey("spay_"));

            Assert.AreEqual(2, Scalar("SELECT COUNT(*) FROM supplier_transactions WHERE supplier_id = @s AND transaction_type = 'PAYMENT';", "@s", supplier.Id), "دفعتان مشروعتان بمفتاحين مختلفين");
            Assert.AreEqual(3000, SupplierRepo.GetById(supplier.Id).BalancePiasters);
        }
    }
}
