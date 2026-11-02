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
    /// Step 3A: pharmacy stocktaking (H1), product-card stock edits (M5), batch/stock alignment (M7),
    /// delta adjustments (L1), base-unit switch (L2) and unit-barcode ownership (M6).
    /// </summary>
    [TestFixture]
    public class S19_StocktakingAndAdjustmentPathsTest : TestBase
    {
        private ProductBatchRepository BatchRepo;

        [SetUp]
        public void CreateBatchRepository()
        {
            BatchRepo = new ProductBatchRepository(ConnectionString, AuditRepo);
        }

        [TearDown]
        public void ClearSessionUser()
        {
            SecurityService.SetCurrentUserForTesting(null);
        }

        private long Scalar(string sql, string productId)
        {
            using (var conn = new SQLiteConnection(ConnectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@pid", productId);
                    object res = cmd.ExecuteScalar();
                    return res == null || res == DBNull.Value ? 0 : Convert.ToInt64(res);
                }
            }
        }

        private long LedgerSum(string productId)
        {
            return Scalar("SELECT COALESCE(SUM(quantity_milli), 0) FROM stock_movements WHERE product_id = @pid;", productId);
        }

        private long BatchSum(string productId)
        {
            return Scalar("SELECT COALESCE(SUM(quantity_milli), 0) FROM product_batches WHERE product_id = @pid;", productId);
        }

        private Product CreateBatchedProduct(string name, long batchAMilli, long batchBMilli)
        {
            var prod = CreateTestProduct(name, 1500, 1000, batchAMilli + batchBMilli);
            BatchRepo.CreateOrUpdateBatch(new ProductBatch { ProductId = prod.Id, BatchNumber = "A-EARLY", ExpiryDate = "2030-01-31", QuantityMilli = batchAMilli, CostPricePiasters = 1000 });
            BatchRepo.CreateOrUpdateBatch(new ProductBatch { ProductId = prod.Id, BatchNumber = "B-LATE", ExpiryDate = "2031-06-30", QuantityMilli = batchBMilli, CostPricePiasters = 1000 });
            return prod;
        }

        [Test]
        public void H1_Product_Level_Stocktake_Without_Batches_Commits_With_Ledger_Row()
        {
            var prod = CreateTestProduct("شراب كحة بدون تشغيلات", 3000, 2000, 10000);
            var service = new PharmaStocktakingService(ConnectionString, BatchRepo, ProductRepo, AuditRepo);

            // Exact JSON the PharmacyStocktakingModal sends for a product without batches
            string payload = "{\"auditReason\":\"جرد آخر الشهر\",\"locationId\":null,\"items\":[{\"productId\":\"" + prod.Id + "\",\"countedQuantityMilli\":7000,\"reason\":\"جرد آخر الشهر\"}]}";
            var request = JsonConvert.DeserializeObject<PharmacyStocktakingBatchRequest>(payload);

            int adjusted = service.ApplyStocktakingAdjustments(request, "usr_admin_default");

            Assert.AreEqual(1, adjusted);
            Assert.AreEqual(7000, ProductRepo.GetById(prod.Id).StockQuantityMilli);
            Assert.AreEqual(7000, LedgerSum(prod.Id), "دفتر الحركات يطابق الرصيد بعد الجرد");
            var movements = StockMovementRepo.GetMovements(prod.Id, "ADJUSTMENT");
            Assert.AreEqual(1, movements.Count);
            Assert.AreEqual(-3000, movements[0].QuantityMilli);
            Assert.AreEqual("INVENTORY_AUDIT", movements[0].ReferenceType);
        }

        [Test]
        public void H1_M7_Product_Level_Count_Of_A_Batched_Product_Aligns_Batches_FEFO()
        {
            var prod = CreateBatchedProduct("أقراص مسكن بتشغيلتين", 4000, 6000);
            var service = new PharmaStocktakingService(ConnectionString, BatchRepo, ProductRepo, AuditRepo);
            var request = JsonConvert.DeserializeObject<PharmacyStocktakingBatchRequest>(
                "{\"auditReason\":\"جرد\",\"items\":[{\"productId\":\"" + prod.Id + "\",\"countedQuantityMilli\":5000}]}");

            service.ApplyStocktakingAdjustments(request, "usr_admin_default");

            Assert.AreEqual(5000, ProductRepo.GetById(prod.Id).StockQuantityMilli);
            Assert.AreEqual(5000, BatchSum(prod.Id), "مجموع التشغيلات يساوي رصيد الصنف");
            Assert.AreEqual(0, Scalar("SELECT quantity_milli FROM product_batches WHERE product_id = @pid AND batch_number = 'A-EARLY';", prod.Id), "العجز يخصم من الأقرب صلاحية أولاً");
        }

        [Test]
        public void M7_Manual_Adjustment_And_Recalculation_Keep_Batches_In_Step()
        {
            var prod = CreateBatchedProduct("مرهم بتشغيلتين", 3000, 3000);
            var inventory = new InventoryService(ConnectionString, StockMovementRepo, ProductRepo, AuditRepo);

            inventory.AdjustStock(prod.Id, 8000, "زيادة جرد", "usr_admin_default");
            Assert.AreEqual(8000, BatchSum(prod.Id), "الزيادة تضاف إلى تشغيلة");

            inventory.AdjustStockByDelta(prod.Id, -5000, "تالف", "usr_admin_default");
            Assert.AreEqual(3000, ProductRepo.GetById(prod.Id).StockQuantityMilli);
            Assert.AreEqual(3000, BatchSum(prod.Id), "العجز يخصم من التشغيلات");

            // Cached stock drifted (legacy data): recalculation from the ledger also realigns batches
            using (var conn = new SQLiteConnection(ConnectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand("UPDATE products SET stock_quantity_milli = 9000 WHERE id = @pid; UPDATE product_batches SET quantity_milli = quantity_milli + 6000 WHERE product_id = @pid AND batch_number = 'B-LATE';", conn))
                {
                    cmd.Parameters.AddWithValue("@pid", prod.Id);
                    cmd.ExecuteNonQuery();
                }
            }
            inventory.RecalculateStock(prod.Id, "usr_admin_default");
            Assert.AreEqual(3000, ProductRepo.GetById(prod.Id).StockQuantityMilli);
            Assert.AreEqual(3000, BatchSum(prod.Id));
        }

        [Test]
        public void L1_Delta_Adjustment_Applies_To_The_Live_Stock_After_A_Sale()
        {
            var prod = CreateTestProduct("صنف يباع أثناء التسوية", 1000, 500, 10000);
            var staleSnapshot = ProductRepo.GetById(prod.Id);
            OpenTestShift();
            SaleService.ProcessSale(new Sale
            {
                CashierId = "usr_cashier_1",
                CashierName = "كاشير 1",
                PaymentMethod = "cash",
                PaidPiasters = 3000,
                Items = new List<SaleItem> { new SaleItem { ProductId = prod.Id, ProductName = prod.Name, QuantityMilli = 3000, UnitPricePiasters = 1000, TotalPiasters = 3000 } }
            }, null);
            Assert.AreEqual(10000, staleSnapshot.StockQuantityMilli);

            var inventory = new InventoryService(ConnectionString, StockMovementRepo, ProductRepo, AuditRepo);
            var movement = inventory.AdjustStockByDelta(prod.Id, -2000, "كسر", "usr_admin_default");

            Assert.AreEqual(-2000, movement.QuantityMilli, "الفارق يبقى -2 ولا يتأثر بالبيع");
            Assert.AreEqual(5000, ProductRepo.GetById(prod.Id).StockQuantityMilli);
            Assert.Throws<ArgumentException>(delegate { inventory.AdjustStockByDelta(prod.Id, -6000, "كسر", "usr_admin_default"); });
        }

        [Test]
        public void M5_Card_Stock_Edit_Requires_Reason_And_Stock_Adjust_Permission()
        {
            var prod = CreateBatchedProduct("صنف يعدل رصيده من البطاقة", 2000, 2000);

            var noReason = ProductService.GetById(prod.Id);
            noReason.StockQuantityMilli = 1000;
            Assert.Throws<ArgumentException>(delegate { ProductService.SaveProduct(noReason, true, true); });
            Assert.AreEqual(4000, ProductRepo.GetById(prod.Id).StockQuantityMilli, "لا يتغير الرصيد بدون سبب");

            var cashier = UserRepo.GetById("usr_cashier_1");
            Assert.IsNotNull(cashier, "الكاشير المبدئي غير موجود");
            SecurityService.SetCurrentUserForTesting(SecurityService.MapToDto(cashier));
            var cashierEdit = ProductService.GetById(prod.Id);
            cashierEdit.StockQuantityMilli = 1000;
            cashierEdit.StockAdjustReason = "تالف";
            Assert.Throws<UnauthorizedAccessException>(delegate { ProductService.SaveProduct(cashierEdit, true, true); });
            Assert.AreEqual(4000, ProductRepo.GetById(prod.Id).StockQuantityMilli, "الكاشير بدون صلاحية التسوية لا يغير الرصيد");

            // A price-only edit by the same cashier stays allowed
            var priceOnly = ProductService.GetById(prod.Id);
            priceOnly.PricePiasters = 1600;
            ProductService.SaveProduct(priceOnly, true, true);
            Assert.AreEqual(1600, ProductRepo.GetById(prod.Id).PricePiasters);

            SecurityService.SetCurrentUserForTesting(null);
            var adminEdit = ProductService.GetById(prod.Id);
            adminEdit.StockQuantityMilli = 1000;
            adminEdit.StockAdjustReason = "تالف بالرف";
            var saved = ProductService.SaveProduct(adminEdit, true, true);

            Assert.AreEqual(1000, saved.StockQuantityMilli);
            Assert.AreEqual(1000, LedgerSum(prod.Id), "الحركة سجلت داخل نفس المعاملة");
            Assert.AreEqual(1000, BatchSum(prod.Id), "التشغيلات تتبع الرصيد");
            var adj = StockMovementRepo.GetMovements(prod.Id, "ADJUSTMENT");
            Assert.AreEqual(1, adj.Count);
            StringAssert.Contains("تالف بالرف", adj[0].Note);
        }

        [Test]
        public void L2_Promoting_A_Carton_To_Base_Unit_Is_Refused_And_Changes_Nothing()
        {
            var prod = CreateTestProduct("مياه 600 مل", 500, 400, 120000);
            var unitRepo = new ProductUnitRepository(ConnectionString);
            var carton = new ProductUnit { ProductId = prod.Id, UnitName = "كرتونة", ConversionFactor = 12, IsBaseUnit = false, SellPricePiasters = 5800, CostPricePiasters = 4800, SortOrder = 1 };
            unitRepo.Create(carton);

            Assert.Throws<InvalidOperationException>(delegate { unitRepo.SetBaseUnit(prod.Id, carton.Id); });

            var after = ProductRepo.GetById(prod.Id);
            Assert.AreEqual(120000, after.StockQuantityMilli);
            Assert.AreEqual(500, after.PricePiasters);
            Assert.AreEqual(12, unitRepo.GetById(carton.Id).ConversionFactor);
            Assert.IsFalse(unitRepo.GetById(carton.Id).IsBaseUnit);
        }

        [Test]
        public void M6_Unit_Barcode_Owned_By_Another_Product_Is_Rejected_And_Lookup_Is_Deterministic()
        {
            var water = CreateTestProduct("مياه معدنية صغيرة", 500, 400, 0, "6220000000001");
            var juice = CreateTestProduct("عصير مانجو", 900, 700, 0, "6220000000002");

            var edit = ProductService.GetById(juice.Id);
            edit.Units = new List<ProductUnit>
            {
                new ProductUnit { Id = "u-juice-base", ProductId = juice.Id, UnitName = "علبة", ConversionFactor = 1, IsBaseUnit = true, SellPricePiasters = 900, CostPricePiasters = 700, Barcode = "6220000000002" },
                new ProductUnit { Id = "u-juice-carton", ProductId = juice.Id, UnitName = "كرتونة", ConversionFactor = 24, IsBaseUnit = false, SellPricePiasters = 20000, CostPricePiasters = 16000, Barcode = "6220000000001" }
            };
            var ex = Assert.Throws<InvalidOperationException>(delegate { ProductService.SaveProduct(edit, true, true); });
            StringAssert.Contains("مياه معدنية صغيرة", ex.Message);

            // Legacy duplicate already in the database: the product whose own barcode matches wins every time
            using (var conn = new SQLiteConnection(ConnectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand("UPDATE product_units SET barcode = '6220000000001' WHERE product_id = @pid;", conn))
                {
                    cmd.Parameters.AddWithValue("@pid", juice.Id);
                    cmd.ExecuteNonQuery();
                }
            }
            for (int i = 0; i < 3; i++)
            {
                Assert.AreEqual(water.Id, ProductRepo.GetByBarcode("6220000000001").Id);
            }
        }
    }
}
