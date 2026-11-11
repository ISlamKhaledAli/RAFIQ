using System;
using System.Collections.Generic;
using RafiqPOS.Data;
using NUnit.Framework;
using RafiqPOS.Models;
using RafiqPOS.Repositories;

namespace RafiqPOS.Tests.Scenarios
{
    [TestFixture]
    public class S100_ExactBarcodeLookupTest : TestBase
    {
        private void AddSecondaryBarcode(string productId, string barcode)
        {
            using (var conn = new SQLiteConnection(ConnectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand("INSERT INTO product_barcodes (id, product_id, barcode, created_at) VALUES (@id, @pid, @bc, datetime('now'));", conn))
                {
                    cmd.Parameters.AddWithValue("@id", "pb_" + Guid.NewGuid().ToString("N"));
                    cmd.Parameters.AddWithValue("@pid", productId);
                    cmd.Parameters.AddWithValue("@bc", barcode);
                    cmd.ExecuteNonQuery();
                }
            }
        }

        [Test]
        public void ExactLookup_Finds_Product_By_Primary_Secondary_And_Unit_Barcode_Once()
        {
            var prod = CreateTestProduct("عصير برتقال", 1500, 1000, 20000, "6221000000011");
            AddSecondaryBarcode(prod.Id, "ALT-ORANGE-1");
            var unitRepo = new ProductUnitRepository(ConnectionString);
            unitRepo.Create(new ProductUnit { ProductId = prod.Id, UnitName = "كرتونة", ConversionFactor = 12, IsBaseUnit = false, SellPricePiasters = 17000, CostPricePiasters = 12000, Barcode = "6221000099999", SortOrder = 1 });

            foreach (string code in new string[] { "6221000000011", "ALT-ORANGE-1", "alt-orange-1", "6221000099999" })
            {
                List<Product> found = ProductRepo.GetByExactBarcode(code);
                Assert.AreEqual(1, found.Count, "كل باركود يعيد الصنف مرة واحدة: " + code);
                Assert.AreEqual(prod.Id, found[0].Id);
                Assert.IsNotNull(found[0].Units, "الوحدات مرفقة كما في البحث");
                Assert.IsNotNull(found[0].Barcodes, "الباركودات مرفقة كما في البحث");
            }
        }

        [Test]
        public void ExactLookup_Does_Not_Match_Partial_Or_Name_Text_And_Skips_Inactive_Products()
        {
            var prod = CreateTestProduct("شاي العروسة", 3000, 2000, 5000, "6221000000022");

            Assert.AreEqual(0, ProductRepo.GetByExactBarcode("62210000000").Count, "جزء من الباركود لا يطابق");
            Assert.AreEqual(0, ProductRepo.GetByExactBarcode("شاي").Count, "الاسم لا يُبحث عنه في المسار السريع");
            Assert.AreEqual(0, ProductRepo.GetByExactBarcode("   ").Count);
            Assert.AreEqual(0, ProductRepo.GetByExactBarcode(null).Count);

            ProductService.DeleteProduct(prod.Id);
            Assert.AreEqual(0, ProductRepo.GetByExactBarcode("6221000000022").Count, "الصنف غير النشط لا يظهر");
        }

        [Test]
        public void ExactLookup_Handles_Twelve_And_Thirteen_Digit_Ean_Variants()
        {
            var ean13 = CreateTestProduct("صنف EAN13", 1000, 700, 1000, "0123456789012");
            var plain12 = CreateTestProduct("صنف UPC12", 1000, 700, 1000, "987654321098");

            Assert.AreEqual(ean13.Id, ProductRepo.GetByExactBarcode("123456789012")[0].Id, "12 رقم يطابق 13 رقم بصفر في البداية");
            Assert.AreEqual(plain12.Id, ProductRepo.GetByExactBarcode("0987654321098")[0].Id, "13 رقم بصفر يطابق 12 رقم");
        }

        [Test]
        public void ExactLookup_Prefers_The_Product_Whose_Own_Barcode_Matches()
        {
            var water = CreateTestProduct("مياه", 500, 400, 0, "6220000000001");
            var juice = CreateTestProduct("عصير", 900, 700, 0, "6220000000002");
            var unitRepo = new ProductUnitRepository(ConnectionString);
            unitRepo.Create(new ProductUnit { ProductId = juice.Id, UnitName = "كرتونة", ConversionFactor = 24, IsBaseUnit = false, SellPricePiasters = 20000, CostPricePiasters = 16000, Barcode = "LEGACY-DUP", SortOrder = 1 });
            using (var conn = new SQLiteConnection(ConnectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand("UPDATE product_units SET barcode = '6220000000001' WHERE product_id = @pid;", conn))
                {
                    cmd.Parameters.AddWithValue("@pid", juice.Id);
                    cmd.ExecuteNonQuery();
                }
            }

            List<Product> found = ProductRepo.GetByExactBarcode("6220000000001");
            Assert.AreEqual(2, found.Count, "الصنفان يظهران عند وجود تكرار قديم");
            Assert.AreEqual(water.Id, found[0].Id, "صاحب الباركود الأساسي أولاً دائماً");
        }
    }
}
