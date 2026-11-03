using System;
using System.Collections.Generic;
using System.Data.SQLite;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    [TestFixture]
    [NonParallelizable]
    public class S51_ProductWritePermissionsTest : S40_FinanceFixture
    {
        private Product _product;
        private ProductUnit _pack;

        [SetUp]
        public void ArrangeMetadataOnlyActor()
        {
            // The inherited real initialization starts as admin; arrange the catalogue before restricting the session.
            _product = CreateProduct("Permission regression product", 1000, 400, 24000);
            DatabaseService.ProductUnits.EnsureDefaultBaseUnit(_product);
            using (ProductWritePolicy.EnterTrustedFixtureOperation())
            {
            _pack = DatabaseService.ProductUnits.CreateUnit(new ProductUnit
            {
                ProductId = _product.Id, UnitName = "box12", ConversionFactor = 12,
                IsBaseUnit = false, SellPricePiasters = 12000, CostPricePiasters = 4800,
                Barcode = "PERM_PACK_" + Guid.NewGuid().ToString("N"), IsDivisible = false
            });
            }
            var permissions = SecurityService.GetAllPermissionsDictionary(false);
            permissions["products.edit"] = true;
            permissions["products.create"] = false;
            permissions["products.edit_price"] = false;
            permissions["products.edit_cost"] = false;
            DatabaseService.Security.UpdateUserPermissions(CashierId, permissions);
            LoginAs(CashierId);
            Assert.IsTrue(DatabaseService.Security.HasPermission("products.edit"));
            Assert.IsFalse(DatabaseService.Security.HasPermission("products.create"));
            Assert.IsFalse(DatabaseService.Security.HasPermission("products.edit_price"));
            Assert.IsFalse(DatabaseService.Security.HasPermission("products.edit_cost"));
        }

        private Product ProductRequest()
        {
            var request = JsonConvert.DeserializeObject<Product>(
                JsonConvert.SerializeObject(DatabaseService.Products.GetById(_product.Id)));
            request.Units = DatabaseService.ProductUnits.GetUnitsForProduct(_product.Id);
            return request;
        }

        private static JObject ProductPayload(Product product)
        {
            var payload = JObject.FromObject(product);
            payload["confirmSimilarName"] = true;
            payload["confirmBelowCost"] = true;
            return payload;
        }

        // Compare complete persisted rows, not just counts: catches partial metadata/unit/stock/price-history writes.
        // A denied request may be audited, but no other database table is allowed to change.
        private static string DatabaseState()
        {
            var state = new SortedDictionary<string, List<string>>(StringComparer.Ordinal);
            using (var conn = OpenFinanceConnection())
            {
                var tables = new List<string>();
                using (var cmd = new SQLiteCommand(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' " +
                    "AND name<>'audit_logs' ORDER BY name;", conn))
                using (var reader = cmd.ExecuteReader())
                    while (reader.Read()) tables.Add(reader.GetString(0));
                foreach (string table in tables)
                {
                    var rows = new List<string>();
                    using (var cmd = new SQLiteCommand("SELECT * FROM \"" + table.Replace("\"", "\"\"") + "\";", conn))
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            var values = new object[reader.FieldCount];
                            reader.GetValues(values);
                            rows.Add(JsonConvert.SerializeObject(values));
                        }
                    }
                    rows.Sort(StringComparer.Ordinal);
                    state.Add(table, rows);
                }
            }
            return JsonConvert.SerializeObject(state);
        }

        [Test]
        public void SEC03_MetadataOnlyActor_CanRenameThroughIPC_WithoutChangingFinancialFields()
        {
            var request = ProductRequest();
            request.Name = "Allowed metadata rename";
            long historyBefore = FinanceCount("SELECT COUNT(*) FROM product_price_history;");
            long movementsBefore = FinanceCount("SELECT COUNT(*) FROM stock_movements;");
            DispatchOk("products:save", ProductPayload(request));
            var saved = DatabaseService.Products.GetById(_product.Id);
            Assert.AreEqual(request.Name, saved.Name);
            Assert.AreEqual(1000, saved.PricePiasters);
            Assert.AreEqual(400, saved.CostPiasters);
            Assert.AreEqual(_product.IsOpenPrice, saved.IsOpenPrice);
            Assert.AreEqual(_product.TaxRatePercent, saved.TaxRatePercent);
            Assert.AreEqual(24000, saved.StockQuantityMilli);
            var unit = DatabaseService.ProductUnits.GetUnitById(_pack.Id);
            Assert.AreEqual(12000, unit.SellPricePiasters);
            Assert.AreEqual(4800, unit.CostPricePiasters);
            Assert.AreEqual(12, unit.ConversionFactor);
            Assert.AreEqual(historyBefore, FinanceCount("SELECT COUNT(*) FROM product_price_history;"));
            Assert.AreEqual(movementsBefore, FinanceCount("SELECT COUNT(*) FROM stock_movements;"));
        }

        [Test]
        public void SEC03_MetadataOnlyActor_CannotCreateThroughIPC_AndLeavesDatabaseUnchanged()
        {
            var request = new Product
            {
                Name = "Forbidden new product", Barcode = "PERM_NEW_" + Guid.NewGuid().ToString("N"),
                Unit = "piece", PricePiasters = 1000, CostPiasters = 400, StockQuantityMilli = 1000, IsActive = true
            };
            string before = DatabaseState();
            var response = Dispatch("products:save", ProductPayload(request));
            Assert.IsFalse(response.Success);
            StringAssert.Contains("products.create", Describe(response), "The service create permission, not an unrelated gate, must deny this.");
            Assert.AreEqual(before, DatabaseState(), "Do not insert a product, base unit, opening stock or price history before authorization.");
        }

        [Test]
        public void SEC03_MetadataOnlyActor_CannotChangeProductOrEmbeddedUnitFinancialFields_Atomically()
        {
            string[] changes = { "price", "cost", "open_price", "tax", "unit_price", "unit_cost", "unit_factor" };
            foreach (string change in changes)
            {
                var request = ProductRequest();
                request.Name = "Must roll back " + change;
                var pack = request.Units.Find(delegate(ProductUnit unit) { return unit.Id == _pack.Id; });
                Assert.IsNotNull(pack);
                switch (change)
                {
                    case "price": request.PricePiasters++; break;
                    case "cost": request.CostPiasters++; break;
                    case "open_price": request.IsOpenPrice = !request.IsOpenPrice; break;
                    case "tax": request.TaxRatePercent = request.TaxRatePercent == 14 ? 5 : 14; break;
                    case "unit_price": pack.SellPricePiasters++; break;
                    case "unit_cost": pack.CostPricePiasters++; break;
                    case "unit_factor": pack.ConversionFactor = 24; break;
                }
                string permission = change == "cost" || change == "unit_cost" ? "products.edit_cost" : "products.edit_price";
                string before = DatabaseState();
                var response = Dispatch("products:save", ProductPayload(request));
                Assert.IsFalse(response.Success, change);
                StringAssert.Contains(permission, Describe(response), change + " must fail for the financial permission.");
                Assert.AreEqual(before, DatabaseState(), change + " cannot partially rename, reprice, recost or alter stock/units.");
            }
        }

        [Test]
        public void SEC03_MetadataOnlyActor_CannotChangeStandaloneUnitFinancialFields_ThroughServiceOrIPC()
        {
            foreach (string change in new string[] { "price", "cost", "factor" })
            {
                var request = DatabaseService.ProductUnits.GetUnitById(_pack.Id);
                request.UnitName = "Must roll back unit " + change;
                if (change == "price") request.SellPricePiasters++;
                if (change == "cost") request.CostPricePiasters++;
                if (change == "factor") request.ConversionFactor = 24;
                string permission = change == "cost" ? "products.edit_cost" : "products.edit_price";
                string before = DatabaseState();
                UnauthorizedAccessException error;
                using (ProductWritePolicy.EnterRequest(SecurityService.CaptureRequestAdmission()))
                    error = Assert.Throws<UnauthorizedAccessException>(delegate { DatabaseService.ProductUnits.UpdateUnit(request); });
                StringAssert.Contains(permission, error.Message);
                Assert.AreEqual(before, DatabaseState(), "Direct service call must roll back " + change);
                var response = Dispatch("productUnits:save", JObject.FromObject(request));
                Assert.IsFalse(response.Success, change);
                StringAssert.Contains(permission, Describe(response));
                Assert.AreEqual(before, DatabaseState(), "Standalone unit IPC must roll back " + change);
            }
        }
    }
}
