using System;
using System.Collections.Generic;
using System.Data.SQLite;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using RafiqPOS.Models;
using RafiqPOS.Repositories;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    /// <summary>
    /// Step 3A: purchases priced by the package (M1), distributor bonus in base units (H3), server-owned
    /// "paid in full" (M2), quick receive (M3) and batch merge rules (L4). Payloads mirror PurchasesView.tsx.
    /// </summary>
    [TestFixture]
    public class S21_PurchasePackagingTest : TestBase
    {
        private PurchaseRepository NewPurchaseRepo()
        {
            return new PurchaseRepository(ConnectionString, CounterRepo, SupplierRepo, PriceHistoryRepo, AuditRepo);
        }

        // Same deserialization as IpcDispatcher "purchases:create"
        private Purchase CreateFromUiPayload(string json)
        {
            JObject payload = JObject.Parse(json);
            var purchase = payload["purchase"].ToObject<Purchase>();
            string costingMethod = payload["costingMethod"] != null ? payload["costingMethod"].ToString() : "WEIGHTED_AVERAGE";
            return NewPurchaseRepo().CreatePurchase(purchase, costingMethod, null);
        }

        private long Scalar(string sql, string param)
        {
            using (var conn = new SQLiteConnection(ConnectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@p", param);
                    object res = cmd.ExecuteScalar();
                    return res == null || res == DBNull.Value ? 0 : Convert.ToInt64(res);
                }
            }
        }

        [Test]
        public void M1_H3_Ten_Boxes_Of_20_At_47_50_Plus_One_Bonus_Box()
        {
            var prod = CreateTestProduct("أموكسيسيلين 500 مجم", 300, 0, 0, "6221000000500");

            var created = CreateFromUiPayload(@"{
              ""purchase"": {
                ""supplierId"": null, ""supplierInvoiceNumber"": null, ""invoiceDate"": ""2026-11-01T10:00:00.000Z"",
                ""totalCostPiasters"": 47500, ""discountPiasters"": 0, ""netCostPiasters"": 47500,
                ""paidAmountPiasters"": 47500, ""payInFull"": true, ""remainingAmountPiasters"": 0,
                ""paymentStatus"": ""PAID"", ""paymentSource"": ""external_cash"", ""status"": ""COMPLETED"", ""notes"": null,
                ""items"": [{
                  ""productId"": """ + prod.Id + @""", ""productName"": ""أموكسيسيلين 500 مجم"", ""barcode"": ""6221000000500"",
                  ""quantityMilli"": 200000, ""bonusQuantityMilli"": 20000, ""unitCostPiasters"": 238, ""totalCostPiasters"": 47500,
                  ""previousCostPiasters"": 0, ""newSellingPricePiasters"": 300, ""publicPricePiasters"": 6000, ""distributorDiscountBps"": 2083,
                  ""batchNumber"": ""AMX-24"", ""expiryDate"": ""2028-03-31"", ""unitId"": ""قرص"", ""unitName"": ""قرص"",
                  ""conversionFactor"": 20, ""packageCostPiasters"": 4750
                }]
              },
              ""costingMethod"": ""LATEST""
            }");

            Assert.AreEqual(47500, created.NetCostPiasters, "10 علب × 47.50 = 475.00 بالضبط");
            Assert.AreEqual(47500, created.PaidAmountPiasters);
            Assert.AreEqual("PAID", created.PaymentStatus);

            var after = ProductRepo.GetById(prod.Id);
            Assert.AreEqual(220000, after.StockQuantityMilli, "200 قرص + علبة بونص (20 قرص)");
            Assert.AreEqual(216, after.CostPiasters, "التكلفة الفعلية = 475.00 / 220 قرص");
            Assert.AreEqual(220000, Scalar("SELECT quantity_milli FROM product_batches WHERE product_id = @p AND batch_number = 'AMX-24';", prod.Id));
            Assert.AreEqual(216, Scalar("SELECT cost_price_piasters FROM product_batches WHERE product_id = @p AND batch_number = 'AMX-24';", prod.Id));
            Assert.AreEqual(47500, Scalar("SELECT total_cost_piasters FROM purchase_items WHERE purchase_id = @p;", created.Id));
        }

        [Test]
        public void M2_Weighed_Line_Paid_In_Full_Uses_The_Server_Net()
        {
            var cheese = CreateTestProduct("جبنة بالوزن", 16000, 12000, 0, "2000000000086");

            // The client still sends the old float total (107); the server owns paid = net in PAID mode
            var created = CreateFromUiPayload(@"{
              ""purchase"": {
                ""supplierId"": null, ""invoiceDate"": ""2026-11-01T10:00:00.000Z"",
                ""totalCostPiasters"": 107, ""discountPiasters"": 0, ""netCostPiasters"": 107,
                ""paidAmountPiasters"": 107, ""payInFull"": true, ""remainingAmountPiasters"": 0,
                ""paymentStatus"": ""PAID"", ""paymentSource"": ""external_cash"", ""status"": ""COMPLETED"",
                ""items"": [{
                  ""productId"": """ + cheese.Id + @""", ""productName"": ""جبنة بالوزن"", ""barcode"": ""2000000000086"",
                  ""quantityMilli"": 86, ""bonusQuantityMilli"": 0, ""unitCostPiasters"": 1250, ""totalCostPiasters"": 108,
                  ""previousCostPiasters"": 12000, ""unitId"": ""كجم"", ""unitName"": ""كجم"", ""conversionFactor"": 1, ""packageCostPiasters"": 1250
                }]
              },
              ""costingMethod"": ""WEIGHTED_AVERAGE""
            }");

            Assert.AreEqual(108, created.NetCostPiasters, "0.086 × 12.50 = 1.075 → 1.08");
            Assert.AreEqual(108, created.PaidAmountPiasters);
            Assert.AreEqual(0, created.RemainingAmountPiasters);
            Assert.AreEqual("PAID", created.PaymentStatus);
        }

        [Test]
        public void M3_Quick_Receive_Of_A_Carton_Is_Paid_Exactly_And_Creates_The_Supplier_Atomically()
        {
            var prod = CreateTestProduct("بسكويت شاي", 1000, 800, 0, "6223000000777");
            var unitRepo = new ProductUnitRepository(ConnectionString);
            var carton = new ProductUnit { ProductId = prod.Id, UnitName = "كرتونة", ConversionFactor = 12, IsBaseUnit = false, SellPricePiasters = 11500, CostPricePiasters = 9600, SortOrder = 1 };
            unitRepo.Create(carton);
            var inventory = new InventoryService(ConnectionString, StockMovementRepo, ProductRepo, AuditRepo);

            // inventory:recordPurchase payload: 1 carton at 100.00 from a new supplier
            inventory.RecordPurchase(prod.Id, carton.Id, 1, 10000, "INV-77", "مورد البسكويت الجديد", true, "usr_admin_default");

            var supplier = SupplierRepo.GetAll().Find(delegate(Supplier s) { return s.Name == "مورد البسكويت الجديد"; });
            Assert.IsNotNull(supplier);
            Assert.AreEqual(0, supplier.BalancePiasters, "لا دين ولا رصيد زائد للمورد (المدفوع = الصافي)");
            StringAssert.Contains("T", supplier.CreatedAt, "تاريخ إنشاء المورد بصيغة ISO مثل باقي الجداول");

            var purchases = NewPurchaseRepo().GetAll(supplier.Id);
            Assert.AreEqual(1, purchases.Count);
            Assert.AreEqual(10000, purchases[0].NetCostPiasters);
            Assert.AreEqual(10000, purchases[0].PaidAmountPiasters);
            Assert.AreEqual("PAID", purchases[0].PaymentStatus);
            Assert.AreEqual(12000, ProductRepo.GetById(prod.Id).StockQuantityMilli);

            // A failing receipt must not leave an orphan supplier behind
            ProductService.DeleteProduct(prod.Id);
            Assert.Throws<InvalidOperationException>(delegate
            {
                inventory.RecordPurchase(prod.Id, carton.Id, 1, 10000, "INV-78", "مورد لا يجب أن يُنشأ", true, "usr_admin_default");
            });
            Assert.AreEqual(0, Scalar("SELECT COUNT(*) FROM suppliers WHERE name = @p;", "مورد لا يجب أن يُنشأ"));
        }

        [Test]
        public void L4_Same_Batch_Number_With_Different_Expiry_Creates_A_New_Batch()
        {
            var prod = CreateTestProduct("قطرة عين", 4000, 3000, 0, "6221000000900");
            var repo = NewPurchaseRepo();
            Func<string, long, long, Purchase> buy = delegate(string expiry, long qtyMilli, long sellPrice)
            {
                return repo.CreatePurchase(new Purchase
                {
                    PaidAmountPiasters = 0,
                    PayInFull = true,
                    PaymentSource = "external_cash",
                    Items = new List<PurchaseItem>
                    {
                        new PurchaseItem { ProductId = prod.Id, QuantityMilli = qtyMilli, UnitCostPiasters = 3000, BatchNumber = "LOT-1", ExpiryDate = expiry, NewSellingPricePiasters = sellPrice, ConversionFactor = 1 }
                    }
                }, "LATEST");
            };

            buy("2028-01-31", 10000, 4000);
            buy("2029-06-30", 5000, 4500);
            buy("2028-01-31", 2000, 4800);

            var batches = new ProductBatchRepository(ConnectionString, AuditRepo).GetByProductId(prod.Id, false);
            Assert.AreEqual(2, batches.Count, "تشغيلة جديدة عند اختلاف الصلاحية ودمج عند التطابق");
            var original = batches.Find(delegate(ProductBatch b) { return b.BatchNumber == "LOT-1"; });
            var second = batches.Find(delegate(ProductBatch b) { return b.BatchNumber == "LOT-1-2"; });
            Assert.IsNotNull(original);
            Assert.IsNotNull(second);
            StringAssert.StartsWith("2028-01-31", original.ExpiryDate, "صلاحية التشغيلة الأصلية لا تُستبدل");
            Assert.AreEqual(12000, original.QuantityMilli);
            Assert.AreEqual(4000, original.SellPricePiasters, "سعر بيع التشغيلة القائمة لا يُستبدل عند الدمج");
            StringAssert.StartsWith("2029-06-30", second.ExpiryDate);
            Assert.AreEqual(5000, second.QuantityMilli);
            Assert.AreEqual(17000, ProductRepo.GetById(prod.Id).StockQuantityMilli);
        }
    }
}
