using System;
using System.Collections.Generic;
using System.Data.SQLite;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    [TestFixture]
    public class CatalogueImportSafetyTests : TestBase
    {
        private string CategoryId;

        [SetUp]
        public void CatalogueSetUp()
        {
            CategoryId = Guid.NewGuid().ToString();
            Execute("INSERT INTO categories(id,name,display_order,is_active,created_at,updated_at) VALUES(@id,'Catalogue test',0,1,'2026-11-02','2026-11-02');", CategoryId);
        }

        private void Execute(string sql, string id)
        {
            using (var conn = new SQLiteConnection(ConnectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@id", id);
                    cmd.ExecuteNonQuery();
                }
            }
        }

        private long Count(string table)
        {
            using (var conn = new SQLiteConnection(ConnectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand("SELECT COUNT(*) FROM " + table + ";", conn))
                    return Convert.ToInt64(cmd.ExecuteScalar());
            }
        }

        private static CatalogueRecord Record(string code)
        {
            return new CatalogueRecord { SchemaVersion = 1, RecordId = "off:" + code, Gtin = code,
                Gtin14Key = CatalogueReferenceService.GtinKey(code), NameOriginal = "Isolated fixture food",
                Brand = "Fixture", NetQuantityText = "250 g", PackDescription = "250 g", Category = "snacks",
                Provenance = JObject.Parse("{\"source\":\"openfoodfacts\",\"fixture\":true}") };
        }

        private CatalogueRequest Request(CatalogueRecord record)
        {
            return new CatalogueRequest { DatasetSha256 = new string('a', 64), AttemptId = Guid.NewGuid().ToString(),
                ConfirmApply = true, Selections = new List<CatalogueSelection> {
                    new CatalogueSelection { RecordId = record.RecordId, ConfirmedBarcode = record.Gtin,
                        ConfirmedPack = record.PackDescription, IdentityConfirmed = true, PricesConfirmed = true,
                        SalePricePiasters = 1234, CostPiasters = 1005, CategoryId = CategoryId }
                } };
        }

        private CatalogueApplyResult Apply(CatalogueRequest request, List<CatalogueRecord> records)
        {
            request.ExpectedPreviewHash = ProductRepo.PreviewCatalogue(request, records, "usr_admin_default").PreviewHash;
            return ProductRepo.ApplyCatalogue(request, records, "usr_admin_default");
        }

        [Test]
        public void NewProduct_BaseUnit_Barcode_ZeroStock_AndAuditCommitTogether_AndRetryIsOriginal()
        {
            var record = Record("036000291452");
            var records = new List<CatalogueRecord> { record };
            var request = Request(record);
            long movements = Count("stock_movements"), audits = Count("audit_logs");
            CatalogueApplyResult first = Apply(request, records);
            Assert.AreEqual(1, first.CreatedProductIds.Count);
            Product product = ProductRepo.GetById(first.CreatedProductIds[0]);
            Assert.AreEqual(0, product.StockQuantityMilli);
            Assert.AreEqual(1234, product.PricePiasters);
            Assert.AreEqual(1005, product.CostPiasters);
            Assert.AreEqual(1, product.Units.Count);
            Assert.AreEqual(1, product.Units[0].ConversionFactor);
            CollectionAssert.Contains(product.Barcodes, record.Gtin);
            Assert.AreEqual(movements, Count("stock_movements"));
            Assert.AreEqual(audits + 1, Count("audit_logs"));
            Assert.IsTrue(AuditRepo.VerifyChainIntegrity().IsValid);
            CatalogueApplyResult replay = ProductRepo.ApplyCatalogue(request, records, "usr_admin_default");
            CollectionAssert.AreEqual(first.CreatedProductIds, replay.CreatedProductIds);
            CatalogueApplyResult reopened = new RafiqPOS.Repositories.ProductRepository(ConnectionString, AuditRepo)
                .ApplyCatalogue(request, records, "usr_admin_default");
            CollectionAssert.AreEqual(first.CreatedProductIds, reopened.CreatedProductIds);
            Assert.AreEqual(audits + 1, Count("audit_logs"));
            request.Selections[0].SalePricePiasters++;
            Assert.Throws<InvalidOperationException>(delegate { ProductRepo.ApplyCatalogue(request, records, "usr_admin_default"); });
        }

        [TestCase("primary", false)]
        [TestCase("primary", true)]
        [TestCase("additional", true)]
        [TestCase("unit", true)]
        public void AnyOwnershipIncludingArchivedAndEquivalentEAN_IsNeverUpdated(string source, bool archived)
        {
            string equivalent = "0036000291452";
            Product existing = CreateTestProduct("Existing merchant product", 9900, 8800, 7000,
                source == "primary" ? equivalent : "PRIVATE-OWNED");
            if (source == "additional")
                Execute("INSERT INTO product_barcodes(id,product_id,barcode,created_at) VALUES('fixture-bc',@id,'0036000291452','2026-11-02');", existing.Id);
            if (source == "unit")
                Execute("UPDATE product_units SET barcode='0036000291452' WHERE product_id=@id AND is_base_unit=1;", existing.Id);
            if (archived) Execute("UPDATE products SET is_active=0 WHERE id=@id;", existing.Id);
            var record = Record("036000291452");
            var result = Apply(Request(record), new List<CatalogueRecord> { record });
            Assert.AreEqual(0, result.CreatedProductIds.Count);
            Assert.AreEqual(1, result.SkippedRecordIds.Count);
            Product after = ProductRepo.GetById(existing.Id);
            Assert.AreEqual(!archived, after.IsActive);
            Assert.AreEqual(9900, after.PricePiasters);
            Assert.AreEqual(8800, after.CostPiasters);
            Assert.AreEqual(7000, after.StockQuantityMilli);
            Assert.AreEqual("Existing merchant product", after.Name);
        }

        [Test]
        public void ChangedOwnershipSincePreview_RequiresFreshReview()
        {
            var record = Record("036000291452");
            var records = new List<CatalogueRecord> { record };
            var request = Request(record);
            request.ExpectedPreviewHash = ProductRepo.PreviewCatalogue(request, records, "usr_admin_default").PreviewHash;
            CreateTestProduct("Concurrent merchant product", 99, 55, 0, "0036000291452");
            long count = Count("products");
            Assert.Throws<InvalidOperationException>(delegate { ProductRepo.ApplyCatalogue(request, records, "usr_admin_default"); });
            Assert.AreEqual(count, Count("products"));
        }

        [Test]
        public void AuditFailureRollsBackProductUnitAndBarcode()
        {
            Execute("CREATE TRIGGER catalogue_test_fail BEFORE INSERT ON audit_logs WHEN NEW.action='CATALOGUE_REFERENCE_IMPORT' BEGIN SELECT RAISE(ABORT,'injected audit failure'); END;", "");
            var record = Record("036000291452");
            long products = Count("products"), units = Count("product_units"), barcodes = Count("product_barcodes"), audits = Count("audit_logs");
            Assert.Throws<SQLiteException>(delegate { Apply(Request(record), new List<CatalogueRecord> { record }); });
            Assert.AreEqual(products, Count("products"));
            Assert.AreEqual(units, Count("product_units"));
            Assert.AreEqual(barcodes, Count("product_barcodes"));
            Assert.AreEqual(audits, Count("audit_logs"));
        }

        [Test]
        public void ConcurrentSameAttempt_CreatesOnlyOnce()
        {
            var record = Record("036000291452");
            var records = new List<CatalogueRecord> { record };
            var request = Request(record);
            request.ExpectedPreviewHash = ProductRepo.PreviewCatalogue(request, records, "usr_admin_default").PreviewHash;
            CatalogueApplyResult a = null, b = null;
            Parallel.Invoke(
                delegate { a = ProductRepo.ApplyCatalogue(request, records, "usr_admin_default"); },
                delegate { b = ProductRepo.ApplyCatalogue(request, records, "usr_admin_default"); });
            CollectionAssert.AreEqual(a.CreatedProductIds, b.CreatedProductIds);
            Assert.AreEqual(1, a.CreatedProductIds.Count);
        }

        [Test]
        public void BelowCostApprovalIsSpecific_BindsPreview_AndIsAudited()
        {
            var record = Record("036000291452");
            var records = new List<CatalogueRecord> { record };
            var request = Request(record);
            request.Selections[0].SalePricePiasters = 100;
            request.Selections[0].CostPiasters = 200;
            Assert.IsFalse(request.Selections[0].BelowCostConfirmed);
            Assert.Throws<BelowCostPriceException>(delegate { ProductRepo.PreviewCatalogue(request, records, "usr_admin_default"); });
            request.ExpectedPreviewHash = new string('a', 64);
            Assert.Throws<BelowCostPriceException>(delegate { ProductRepo.ApplyCatalogue(request, records, "usr_admin_default"); });
            request.Selections[0].BelowCostConfirmed = true;
            string approvedHash = ProductRepo.PreviewCatalogue(request, records, "usr_admin_default").PreviewHash;
            request.ExpectedPreviewHash = approvedHash;
            request.Selections[0].SalePricePiasters = 150;
            Assert.Throws<InvalidOperationException>(delegate { ProductRepo.ApplyCatalogue(request, records, "usr_admin_default"); });
            CatalogueApplyResult result = Apply(request, records);
            Product product = ProductRepo.GetById(result.CreatedProductIds[0]);
            Assert.AreEqual(150, product.PricePiasters);
            Assert.AreEqual(200, product.CostPiasters);
            using (var conn = new SQLiteConnection(ConnectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand("SELECT details_json FROM audit_logs WHERE entity_type='catalogue_attempt' AND entity_id=@id;", conn))
                {
                    cmd.Parameters.AddWithValue("@id", request.AttemptId);
                    JObject audit = JObject.Parse(cmd.ExecuteScalar().ToString());
                    Assert.IsTrue((bool)audit["selections"][0]["BelowCostConfirmed"]);
                    Assert.AreEqual(request.ExpectedPreviewHash, (string)audit["previewHash"]);
                }
            }
        }

        [Test]
        public void ZeroCostNeedsExplicitConfirmation_AndMissingMoneyOrIdentityIsRejected()
        {
            var record = Record("036000291452");
            var selection = Request(record).Selections[0];
            selection.CostPiasters = 0;
            Assert.Throws<InvalidOperationException>(delegate { CatalogueReferenceService.ValidateSelection(selection, record); });
            selection.ZeroCostConfirmed = true;
            Assert.DoesNotThrow(delegate { CatalogueReferenceService.ValidateSelection(selection, record); });
            selection.SalePricePiasters = null;
            Assert.Throws<InvalidOperationException>(delegate { CatalogueReferenceService.ValidateSelection(selection, record); });
            selection.SalePricePiasters = 100;
            selection.IdentityConfirmed = false;
            Assert.Throws<InvalidOperationException>(delegate { CatalogueReferenceService.ValidateSelection(selection, record); });
        }

        [Test]
        public void JsonMoneyMustBeInteger_NotFloatOrString_AndCommercialFieldsAreRejected()
        {
            JObject payload = JObject.FromObject(Request(Record("036000291452")),
                Newtonsoft.Json.JsonSerializer.Create(new Newtonsoft.Json.JsonSerializerSettings {
                    ContractResolver = new Newtonsoft.Json.Serialization.CamelCasePropertyNamesContractResolver() }));
            Assert.DoesNotThrow(delegate { CatalogueReferenceService.ValidateRequestTokens(payload); });
            payload["selections"][0]["salePricePiasters"] = 1.5;
            Assert.Throws<InvalidOperationException>(delegate { CatalogueReferenceService.ValidateRequestTokens(payload); });
            payload["selections"][0]["salePricePiasters"] = "1234";
            Assert.Throws<InvalidOperationException>(delegate { CatalogueReferenceService.ValidateRequestTokens(payload); });
            payload["selections"][0]["salePricePiasters"] = 1234;
            payload["selections"][0]["stockQuantityMilli"] = 1;
            Assert.Throws<InvalidOperationException>(delegate { CatalogueReferenceService.ValidateRequestTokens(payload); });
        }
    }
}
