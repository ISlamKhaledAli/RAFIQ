using System;
using System.Data.SQLite;
using Newtonsoft.Json;
using NUnit.Framework;
using RafiqPOS.Models;
using RafiqPOS.Repositories;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    /// <summary>
    /// Step 3A: Excel import "update" never wipes stock (H2), restores archived products with a correct
    /// movement (M4) and treats unit barcodes as owned (M6). Payloads are the JSON ExcelImportModal sends.
    /// </summary>
    [TestFixture]
    public class S20_ExcelImportStockTest : TestBase
    {
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

        private BatchImportResult Import(string itemJson, string strategy)
        {
            string payload = "{\"items\":[" + itemJson + "],\"duplicateStrategy\":\"" + strategy + "\"}";
            var request = JsonConvert.DeserializeObject<BatchImportRequest>(payload);
            using (AdmitProductRequest("usr_admin_default"))
                return ProductService.ImportBatch(request, "usr_admin_default");
        }

        private Product CreateKgProductWithBatch(string barcode)
        {
            Product prod;
            using (ProductWritePolicy.EnterTrustedFixtureOperation())
            prod = ProductService.SaveProduct(new Product
            {
                Name = "جبنة رومي بالوزن",
                Barcode = barcode,
                CategoryId = "cat_general",
                PricePiasters = 32000,
                CostPiasters = 26000,
                StockQuantityMilli = 50000,
                MinStockQuantityMilli = 3000,
                Unit = "kg",
                IsActive = true
            }, true, true);
            new ProductBatchRepository(ConnectionString, AuditRepo).CreateOrUpdateBatch(new ProductBatch
            {
                ProductId = prod.Id, BatchNumber = "CH-1", ExpiryDate = "2030-01-01", QuantityMilli = 50000, CostPricePiasters = 26000
            });
            return prod;
        }

        [Test]
        public void H2_Price_Only_Sheet_Update_Keeps_Stock_Unit_Category_And_Cost()
        {
            var prod = CreateKgProductWithBatch("6229990000001");
            var before = ProductRepo.GetById(prod.Id);

            // A sheet with name, barcode and price columns only (stock/cost/unit/category absent -> null)
            var result = Import("{\"barcode\":\"6229990000001\",\"name\":\"جبنة رومي بالوزن\",\"categoryName\":null,\"unit\":null,\"pricePiasters\":34000,\"costPiasters\":null,\"stockQuantityMilli\":null,\"minStockQuantityMilli\":null,\"taxRatePercent\":null,\"internalCode\":null,\"taxCategoryCode\":null,\"barcodes\":[\"6229990000001\"]}", "update");

            Assert.AreEqual(1, result.UpdatedCount);
            var after = ProductRepo.GetById(prod.Id);
            Assert.AreEqual(34000, after.PricePiasters, "السعر الموجود في الملف يتحدث");
            Assert.AreEqual(50000, after.StockQuantityMilli, "غياب عمود الرصيد لا يصفّر المخزون");
            Assert.AreEqual(before.CostPiasters, after.CostPiasters);
            Assert.AreEqual(before.Unit, after.Unit);
            Assert.AreEqual(before.CategoryId, after.CategoryId);
            Assert.AreEqual(before.MinStockQuantityMilli, after.MinStockQuantityMilli);
            Assert.AreEqual(50000, LedgerSum(prod.Id), "لا حركة تسوية سالبة");
        }

        [Test]
        public void H2_M7_Sheet_With_Stock_Adjusts_Through_Ledger_And_Batches()
        {
            var prod = CreateKgProductWithBatch("6229990000002");

            Import("{\"barcode\":\"6229990000002\",\"name\":\"جبنة رومي بالوزن\",\"categoryName\":null,\"unit\":\"kg\",\"pricePiasters\":null,\"costPiasters\":null,\"stockQuantityMilli\":30000,\"minStockQuantityMilli\":null,\"taxRatePercent\":null,\"internalCode\":null,\"taxCategoryCode\":null,\"barcodes\":[\"6229990000002\"]}", "update");

            Assert.AreEqual(30000, ProductRepo.GetById(prod.Id).StockQuantityMilli);
            Assert.AreEqual(30000, LedgerSum(prod.Id));
            Assert.AreEqual(30000, Scalar("SELECT COALESCE(SUM(quantity_milli), 0) FROM product_batches WHERE product_id = @pid;", prod.Id), "التشغيلات تتبع الرصيد المستورد");
            var adj = StockMovementRepo.GetMovements(prod.Id, "ADJUSTMENT");
            Assert.AreEqual(1, adj.Count);
            Assert.AreEqual(-20000, adj[0].QuantityMilli);
            Assert.AreEqual("IMPORT_UPDATE", adj[0].ReferenceType);
        }

        [Test]
        public void M4_Restoring_An_Archived_Product_Records_Only_The_Difference()
        {
            var prod = CreateTestProduct("صنف مؤرشف برصيد", 1000, 700, 5000, "6229990000003");
            ProductService.DeleteProduct(prod.Id);

            Import("{\"barcode\":\"6229990000003\",\"name\":\"صنف مؤرشف برصيد\",\"categoryName\":null,\"unit\":null,\"pricePiasters\":1100,\"costPiasters\":null,\"stockQuantityMilli\":12000,\"minStockQuantityMilli\":null,\"taxRatePercent\":null,\"internalCode\":null,\"taxCategoryCode\":null,\"barcodes\":[\"6229990000003\"]}", "skip");

            var restored = ProductRepo.GetById(prod.Id);
            Assert.IsTrue(restored.IsActive);
            Assert.AreEqual(12000, restored.StockQuantityMilli);
            Assert.AreEqual(12000, LedgerSum(prod.Id), "دفتر الحركات = الرصيد (+7 وليس +12)");
            Assert.AreEqual(700, restored.CostPiasters, "التكلفة غير الموجودة في الملف تبقى كما هي");
        }

        [Test]
        public void M6_Row_Whose_Barcode_Is_Another_Products_Carton_Barcode_Is_Not_Inserted()
        {
            var water = CreateTestProduct("مياه معدنية", 500, 400, 0, "6229990000010");
            using (var conn = new SQLiteConnection(ConnectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand(@"INSERT INTO product_units (id, product_id, unit_name, conversion_factor, is_base_unit, sell_price_piasters, cost_price_piasters, barcode, is_divisible, sort_order, created_at, updated_at)
                                                     VALUES ('u-water-carton', @pid, 'كرتونة', 12, 0, 5800, 4800, '6229990000099', 0, 1, @now, @now);", conn))
                {
                    cmd.Parameters.AddWithValue("@pid", water.Id);
                    cmd.Parameters.AddWithValue("@now", DateTime.UtcNow.ToString("o"));
                    cmd.ExecuteNonQuery();
                }
            }

            var result = Import("{\"barcode\":\"6229990000099\",\"name\":\"صنف جديد بباركود كرتونة\",\"categoryName\":\"عام\",\"unit\":\"piece\",\"pricePiasters\":700,\"costPiasters\":500,\"stockQuantityMilli\":10000,\"minStockQuantityMilli\":null,\"taxRatePercent\":null,\"internalCode\":null,\"taxCategoryCode\":null,\"barcodes\":[\"6229990000099\"]}", "skip");

            Assert.AreEqual(0, result.ImportedCount, "لا يُنشأ صنف ثانٍ بباركود كرتونة صنف آخر");
            Assert.AreEqual(1, result.SkippedCount);
            Assert.AreEqual(water.Id, ProductRepo.GetByBarcode("6229990000099").Id);
        }

        [Test]
        public void H2_New_Row_Without_Optional_Columns_Gets_Safe_Defaults()
        {
            var result = Import("{\"barcode\":\"6229990000020\",\"name\":\"صنف جديد من ملف مختصر\",\"categoryName\":null,\"unit\":null,\"pricePiasters\":1500,\"costPiasters\":null,\"stockQuantityMilli\":null,\"minStockQuantityMilli\":null,\"taxRatePercent\":null,\"internalCode\":null,\"taxCategoryCode\":null,\"barcodes\":[\"6229990000020\"]}", "skip");

            Assert.AreEqual(1, result.ImportedCount);
            var created = ProductRepo.GetByBarcode("6229990000020");
            Assert.AreEqual(1500, created.PricePiasters);
            Assert.AreEqual(0, created.CostPiasters);
            Assert.AreEqual(0, created.StockQuantityMilli);
            Assert.AreEqual("piece", created.Unit);
            Assert.AreEqual(5000, created.MinStockQuantityMilli);
            Assert.IsFalse(string.IsNullOrEmpty(created.CategoryId));
        }
    }
}
