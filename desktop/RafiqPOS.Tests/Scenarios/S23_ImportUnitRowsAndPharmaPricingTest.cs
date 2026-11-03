using System;
using System.Collections.Generic;
using System.Data.SQLite;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using RafiqPOS.Models;
using RafiqPOS.Repositories;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    /// <summary>
    /// Step 3A final round: Excel rows scanned with a carton barcode (R1), import stock needs stock.adjust (R7),
    /// pharmacy public price is per box (leftover b) and batch-tracked purchases without a batch (leftover c).
    /// </summary>
    [TestFixture]
    public class S23_ImportUnitRowsAndPharmaPricingTest : TestBase
    {
        [TearDown]
        public void ClearSessionUser()
        {
            SecurityService.SetCurrentUserForTesting(null);
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

        // Same request object ExcelImportModal sends to products:importBatch
        private BatchImportResult Import(string itemJson, string strategy)
        {
            var request = JsonConvert.DeserializeObject<BatchImportRequest>("{\"items\":[" + itemJson + "],\"duplicateStrategy\":\"" + strategy + "\"}");
            string actorId = SecurityService.CurrentUser != null ? SecurityService.CurrentUser.Id : "usr_admin_default";
            using (AdmitProductRequest(actorId))
                return ProductService.ImportBatch(request, actorId);
        }

        private static string Row(string barcode, string name, string price, string cost, string stock)
        {
            return "{\"barcode\":\"" + barcode + "\",\"name\":\"" + name + "\",\"categoryName\":null,\"unit\":null,\"pricePiasters\":" + price
                + ",\"costPiasters\":" + cost + ",\"stockQuantityMilli\":" + stock
                + ",\"minStockQuantityMilli\":null,\"taxRatePercent\":null,\"internalCode\":null,\"taxCategoryCode\":null,\"barcodes\":[\"" + barcode + "\"]}";
        }

        private ProductUnit AddUnit(Product prod, string name, int factor, long sell, long cost, string barcode)
        {
            var unit = new ProductUnit { ProductId = prod.Id, UnitName = name, ConversionFactor = factor, IsBaseUnit = false, SellPricePiasters = sell, CostPricePiasters = cost, Barcode = barcode, SortOrder = 1 };
            new ProductUnitRepository(ConnectionString).Create(unit);
            return unit;
        }

        [Test]
        public void R1_Update_Row_With_A_Carton_Barcode_Never_Touches_The_Base_Product()
        {
            var cans = CreateTestProduct("بيبسي كانز 330 مل", 1000, 800, 48000, "6221030000001");
            var carton = AddUnit(cans, "كرتونة", 24, 22000, 18000, "6221030000024");
            var unitRepo = new ProductUnitRepository(ConnectionString);

            var result = Import(Row("6221030000024", "بيبسي كرتونة 24", "24000", "null", "3000"), "update");

            var after = ProductRepo.GetById(cans.Id);
            Assert.AreEqual("بيبسي كانز 330 مل", after.Name, "صف الكرتونة لا يعيد تسمية الصنف");
            Assert.AreEqual(1000, after.PricePiasters);
            Assert.AreEqual(800, after.CostPiasters);
            Assert.AreEqual(48000, after.StockQuantityMilli, "رصيد الكرتونة لا يُكتب كرصيد قطع");
            Assert.AreEqual(1000, unitRepo.GetBaseUnit(cans.Id).SellPricePiasters);
            Assert.AreEqual(24000, unitRepo.GetById(carton.Id).SellPricePiasters, "يتحدث سعر الكرتونة فقط");
            Assert.AreEqual(18000, unitRepo.GetById(carton.Id).CostPricePiasters);
            Assert.AreEqual(1, result.UpdatedCount);
            Assert.AreEqual(1, result.Errors.Count);
            StringAssert.Contains("كرتونة", result.Errors[0]);
            Assert.AreEqual(48000, Scalar("SELECT COALESCE(SUM(quantity_milli), 0) FROM stock_movements WHERE product_id = @p;", cans.Id));

            var skipped = Import(Row("6221030000024", "بيبسي كرتونة 24", "25000", "null", "null"), "skip");
            Assert.AreEqual(1, skipped.SkippedCount);
            Assert.AreEqual(24000, unitRepo.GetById(carton.Id).SellPricePiasters);
        }

        [Test]
        public void R7_Import_Stock_For_Existing_Products_Requires_Stock_Adjust()
        {
            var prod = CreateTestProduct("أرز مصري 1 كجم", 3500, 2800, 20000, "6221030000100");
            var cashier = UserRepo.GetById("usr_cashier_1");
            Assert.IsNotNull(cashier);
            SecurityService.SetCurrentUserForTesting(SecurityService.MapToDto(cashier));

            var rejected = Import(Row("6221030000100", "أرز مصري 1 كجم", "3600", "null", "5000"), "update");
            Assert.AreEqual(0, rejected.UpdatedCount);
            Assert.AreEqual(1, rejected.SkippedCount);
            StringAssert.Contains("تسوية المخزون", rejected.Errors[0]);
            var unchanged = ProductRepo.GetById(prod.Id);
            Assert.AreEqual(20000, unchanged.StockQuantityMilli);
            Assert.AreEqual(3500, unchanged.PricePiasters, "الصف المرفوض لا يطبق أي جزء منه");

            var priceOnly = Import(Row("6221030000100", "أرز مصري 1 كجم", "3600", "null", "null"), "update");
            Assert.AreEqual(1, priceOnly.UpdatedCount);
            Assert.AreEqual(3600, ProductRepo.GetById(prod.Id).PricePiasters);

            var created = Import(Row("6221030000101", "سكر 1 كجم", "3000", "2500", "10000"), "update");
            Assert.AreEqual(1, created.ImportedCount, "الرصيد الافتتاحي لصنف جديد مسموح");
        }

        [Test]
        public void Pharmacy_Line_Without_Selling_Price_Uses_Box_Public_Price_Divided_By_Pack_Size()
        {
            var drug = CreateTestProduct("باراسيتامول 500", 250, 0, 0, "6221030000500");
            var box = AddUnit(drug, "علبة", 20, 5000, 0, "6221030000520");

            // PurchasesView payload for a pharmacy line where the selling price field was left empty
            JObject payload = JObject.Parse(@"{
              ""purchase"": {
                ""supplierId"": null, ""invoiceDate"": ""2026-11-01T10:00:00.000Z"",
                ""totalCostPiasters"": 47500, ""discountPiasters"": 0, ""netCostPiasters"": 47500,
                ""paidAmountPiasters"": 47500, ""payInFull"": true, ""remainingAmountPiasters"": 0,
                ""paymentSource"": ""external_cash"", ""status"": ""COMPLETED"",
                ""items"": [{
                  ""productId"": """ + drug.Id + @""", ""productName"": ""باراسيتامول 500"",
                  ""quantityMilli"": 200000, ""bonusQuantityMilli"": 0, ""unitCostPiasters"": 238, ""totalCostPiasters"": 47500,
                  ""publicPricePiasters"": 6050, ""distributorDiscountBps"": 2149,
                  ""batchNumber"": ""PCM-1"", ""expiryDate"": ""2028-05-31"", ""conversionFactor"": 20, ""packageCostPiasters"": 4750
                }]
              },
              ""costingMethod"": ""LATEST""
            }");
            var created = new PurchaseRepository(ConnectionString, CounterRepo, SupplierRepo, PriceHistoryRepo, AuditRepo)
                .CreatePurchase(payload["purchase"].ToObject<Purchase>(), "LATEST", null);

            Assert.AreEqual(47500, created.NetCostPiasters);
            var unitRepo = new ProductUnitRepository(ConnectionString);
            Assert.AreEqual(303, ProductRepo.GetById(drug.Id).PricePiasters, "60.50 ÷ 20 = 3.025 → 3.03 للقرص");
            Assert.AreEqual(303, unitRepo.GetBaseUnit(drug.Id).SellPricePiasters);
            Assert.AreEqual(6050, unitRepo.GetById(box.Id).SellPricePiasters, "العلبة تحتفظ بسعر الجمهور للعلبة");
            Assert.AreEqual(303, Scalar("SELECT sell_price_piasters FROM product_batches WHERE batch_number = 'PCM-1' AND product_id = @p;", drug.Id));
        }

        [Test]
        public void Batch_Tracked_Product_Bought_Without_Batch_Keeps_Batch_Sum_Equal_To_Stock()
        {
            var prod = CreateTestProduct("شراب كحة", 4500, 3000, 0, "6221030000700");
            var repo = new PurchaseRepository(ConnectionString, CounterRepo, SupplierRepo, PriceHistoryRepo, AuditRepo);
            Func<string, string, long, Purchase> buy = delegate(string batch, string expiry, long qty)
            {
                return repo.CreatePurchase(new Purchase
                {
                    PayInFull = true,
                    PaymentSource = "external_cash",
                    Items = new List<PurchaseItem> { new PurchaseItem { ProductId = prod.Id, QuantityMilli = qty, UnitCostPiasters = 3000, BatchNumber = batch, ExpiryDate = expiry, ConversionFactor = 1 } }
                }, "LATEST");
            };

            buy("SY-1", "2028-01-31", 10000);
            buy(null, null, 4000);
            buy(null, null, 6000);

            Assert.AreEqual(20000, ProductRepo.GetById(prod.Id).StockQuantityMilli);
            Assert.AreEqual(20000, Scalar("SELECT COALESCE(SUM(quantity_milli), 0) FROM product_batches WHERE product_id = @p;", prod.Id), "مجموع التشغيلات = الرصيد");
            Assert.AreEqual(10000, Scalar("SELECT quantity_milli FROM product_batches WHERE product_id = @p AND batch_number = '" + PurchaseRepository.UndatedBatchNumber + "';", prod.Id), "المشتريات بدون تشغيلة تُجمع في تشغيلة واحدة بلا صلاحية");

            // A product that has never been batch-tracked is not given an artificial batch
            var plain = CreateTestProduct("كيس سكر", 2500, 2000, 0, "6221030000701");
            repo.CreatePurchase(new Purchase
            {
                PayInFull = true,
                PaymentSource = "external_cash",
                Items = new List<PurchaseItem> { new PurchaseItem { ProductId = plain.Id, QuantityMilli = 5000, UnitCostPiasters = 2000, ConversionFactor = 1 } }
            }, "LATEST");
            Assert.AreEqual(0, Scalar("SELECT COUNT(*) FROM product_batches WHERE product_id = @p;", plain.Id));
        }
    }
}
