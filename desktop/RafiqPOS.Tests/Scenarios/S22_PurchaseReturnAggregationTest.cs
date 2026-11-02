using System;
using System.Collections.Generic;
using System.Data.SQLite;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using RafiqPOS.Models;
using RafiqPOS.Repositories;

namespace RafiqPOS.Tests.Scenarios
{
    /// <summary>
    /// Step 3A M8: purchase returns aggregate a product across lines, allocate batches, keep the invoice
    /// discount, settle cash refunds in the drawer, and can be read back. Payloads mirror "purchases:createReturn".
    /// </summary>
    [TestFixture]
    public class S22_PurchaseReturnAggregationTest : TestBase
    {
        private PurchaseRepository Repo;
        private Supplier Vendor;
        private Product Item;
        private Purchase Invoice;

        [SetUp]
        public void CreateTwoBatchPurchase()
        {
            Repo = new PurchaseRepository(ConnectionString, CounterRepo, SupplierRepo, PriceHistoryRepo, AuditRepo);
            Vendor = SupplierRepo.Save(new Supplier { Name = "موزع الأدوية", IsActive = true });
            Item = CreateTestProduct("فيتامين سي فوار", 900, 0, 0, "6221000001234");

            // Same product on two lines/batches, 10.00 invoice discount: gross 110.00, net 100.00 (45.45 + 54.55)
            Invoice = Repo.CreatePurchase(new Purchase
            {
                SupplierId = Vendor.Id,
                PaidAmountPiasters = 0,
                DiscountPiasters = 1000,
                PaymentSource = "external_cash",
                Items = new List<PurchaseItem>
                {
                    new PurchaseItem { ProductId = Item.Id, QuantityMilli = 10000, UnitCostPiasters = 500, BatchNumber = "VC-1", ExpiryDate = "2028-01-31", ConversionFactor = 1 },
                    new PurchaseItem { ProductId = Item.Id, QuantityMilli = 10000, UnitCostPiasters = 600, BatchNumber = "VC-2", ExpiryDate = "2029-01-31", ConversionFactor = 1 }
                }
            }, "LATEST");
            Assert.AreEqual(10000, Invoice.NetCostPiasters);
            Assert.AreEqual(10000, SupplierRepo.GetById(Vendor.Id).BalancePiasters);
        }

        private PurchaseReturn ReturnFromIpc(string refundMethod, params long[] lineQuantities)
        {
            var items = new JArray();
            foreach (long q in lineQuantities)
            {
                items.Add(new JObject { { "productId", Item.Id }, { "quantityMilli", q } });
            }
            var payload = new JObject
            {
                { "returnDoc", new JObject
                    {
                        { "supplierId", Vendor.Id },
                        { "purchaseId", Invoice.Id },
                        { "refundMethod", refundMethod },
                        { "items", items }
                    }
                }
            };
            return Repo.CreatePurchaseReturn(payload["returnDoc"].ToObject<PurchaseReturn>(), "usr_admin_default");
        }

        private long BatchQty(string batchNumber)
        {
            using (var conn = new SQLiteConnection(ConnectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand("SELECT quantity_milli FROM product_batches WHERE product_id = @pid AND batch_number = @b;", conn))
                {
                    cmd.Parameters.AddWithValue("@pid", Item.Id);
                    cmd.Parameters.AddWithValue("@b", batchNumber);
                    return Convert.ToInt64(cmd.ExecuteScalar());
                }
            }
        }

        [Test]
        public void Same_Product_On_Two_Return_Lines_Is_Valued_And_Limited_As_One()
        {
            var ret = ReturnFromIpc("BALANCE_DEDUCTION", 8000, 8000);

            Assert.AreEqual(8000, ret.TotalCostPiasters, "16 من 20 من صافي 100.00 بعد الخصم = 80.00");
            Assert.AreEqual(2000, SupplierRepo.GetById(Vendor.Id).BalancePiasters);
            Assert.AreEqual(4000, ProductRepo.GetById(Item.Id).StockQuantityMilli);
            Assert.AreEqual(0, BatchQty("VC-1"), "الخصم من تشغيلات الفاتورة بالترتيب");
            Assert.AreEqual(4000, BatchQty("VC-2"));

            Assert.Throws<InvalidOperationException>(delegate { ReturnFromIpc("BALANCE_DEDUCTION", 5000); }, "المتبقي 4 فقط");

            var last = ReturnFromIpc("BALANCE_DEDUCTION", 4000);
            Assert.AreEqual(2000, last.TotalCostPiasters, "آخر مرتجع يأخذ الباقي بالضبط");
            Assert.AreEqual(0, SupplierRepo.GetById(Vendor.Id).BalancePiasters, "إجمالي المرتجعات = صافي الفاتورة بعد الخصم");
        }

        [Test]
        public void Lines_That_Together_Exceed_The_Invoice_Are_Rejected()
        {
            Assert.Throws<InvalidOperationException>(delegate { ReturnFromIpc("BALANCE_DEDUCTION", 9000, 9000, 9000); });
            Assert.AreEqual(20000, ProductRepo.GetById(Item.Id).StockQuantityMilli, "لا رصيد سالب ولا خصم جزئي");
            Assert.AreEqual(10000, SupplierRepo.GetById(Vendor.Id).BalancePiasters);
        }

        [Test]
        public void Cash_Refund_Goes_To_The_Drawer_And_Leaves_Supplier_Balance()
        {
            Assert.Throws<InvalidOperationException>(delegate { ReturnFromIpc("CASH", 2000); }, "لا وردية مفتوحة");

            var shift = OpenTestShift();
            var ret = ReturnFromIpc("CASH", 2000);

            Assert.AreEqual(1000, ret.TotalCostPiasters);
            Assert.AreEqual(10000, SupplierRepo.GetById(Vendor.Id).BalancePiasters, "الاسترداد النقدي لا يخصم من دين المورد");
            using (var conn = new SQLiteConnection(ConnectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand("SELECT COALESCE(SUM(amount_piasters), 0) FROM cash_drawer_transactions WHERE shift_id = @sid AND type = 'cash_in';", conn))
                {
                    cmd.Parameters.AddWithValue("@sid", shift.Id);
                    Assert.AreEqual(1000, Convert.ToInt64(cmd.ExecuteScalar()), "النقدية دخلت الدرج");
                }
            }

            var loaded = Repo.GetReturnById(ret.Id);
            Assert.IsNotNull(loaded);
            Assert.AreEqual("CASH", loaded.RefundMethod);
            Assert.AreEqual(1, loaded.Items.Count);
            Assert.AreEqual(2000, loaded.Items[0].QuantityMilli);
        }
    }
}
