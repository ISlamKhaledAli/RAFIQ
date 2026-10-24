using System;
using System.Collections.Generic;
using System.IO;
using RafiqPOS.Common;
using RafiqPOS.Database;
using RafiqPOS.Models;
using RafiqPOS.Repositories;

namespace RafiqPOS.Services
{
    public class StorageLocationTestResult
    {
        public bool Success { get; set; }
        public string Message { get; set; }
        public int TotalAssertions { get; set; }
        public int PassedAssertions { get; set; }
    }

    /// <summary>
    /// جناح الاختبارات الشاملة لمواقع التخزين والرفوف وسلسلة التبريد (المحطة 13 - قصة 128 / ميزة 185)
    /// </summary>
    public static class StorageLocationTestRunner
    {
        public static StorageLocationTestResult RunAllTests()
        {
            var result = new StorageLocationTestResult
            {
                Success = true,
                TotalAssertions = 0,
                PassedAssertions = 0
            };

            string tempDbPath = Path.Combine(Path.GetTempPath(), "rafiq_loc_test_" + Guid.NewGuid().ToString("N") + ".db");
            string tempConnStr = string.Format("Data Source={0};Version=3;BusyTimeout=5000;", tempDbPath);

            try
            {
                // 1. Run migrations including Migration 44
                MigrationRunner.ApplyMigrations(tempConnStr, tempDbPath);
                Assert(File.Exists(tempDbPath), "إنشاء قاعدة البيانات وتطبيق الميجريشن 44 بنجاح", result);

                // 2. Setup repos & services
                var auditRepo = new AuditLogRepository(tempConnStr);
                var counterRepo = new CounterRepository(tempConnStr);
                var settingsRepo = new SettingsRepository(tempConnStr);
                var batchRepo = new ProductBatchRepository(tempConnStr, auditRepo);
                var productRepo = new ProductRepository(tempConnStr, auditRepo);
                var locRepo = new StorageLocationRepository(tempConnStr);
                var locService = new StorageLocationService(locRepo);
                var saleRepo = new SaleRepository(tempConnStr, counterRepo, auditRepo, batchRepo);
                var userRepo = new UserRepository(tempConnStr);
                var securityService = new SecurityService(settingsRepo, auditRepo, userRepo);
                DatabaseService.Security = securityService;

                // 3. Test Creating Storage Locations
                var loc1 = new StorageLocation
                {
                    Code = "RACK-A1",
                    Name = "رف A-1 أدوية عامة",
                    Type = "shelf",
                    Description = "الرف العلوي من ستاند رقم 1",
                    IsActive = true
                };
                var savedLoc1 = locRepo.Save(loc1, "usr_admin");
                Assert(savedLoc1 != null && !string.IsNullOrEmpty(savedLoc1.Id), "إنشاء موقع تخزين (رف عادي) بنجاح", result);

                var locFridge = new StorageLocation
                {
                    Code = "FRIDGE-01",
                    Name = "ثلاجة الأنسولين والأمصال الرئيسية",
                    Type = "fridge",
                    Description = "درجة حرارة 2 إلى 8 مئوية",
                    IsActive = true
                };
                var savedFridge = locRepo.Save(locFridge, "usr_admin");
                Assert(savedFridge != null && savedFridge.Type == "fridge", "إنشاء موقع تخزين (ثلاجة تبريد) بنجاح", result);

                // 4. Test Code Uniqueness
                bool duplicateCaught = false;
                try
                {
                    var dupLoc = new StorageLocation
                    {
                        Code = "RACK-A1",
                        Name = "رف مكرر",
                        Type = "rack"
                    };
                    locRepo.Save(dupLoc, "usr_admin");
                }
                catch (InvalidOperationException)
                {
                    duplicateCaught = true;
                }
                Assert(duplicateCaught, "منع تكرار كود موقع التخزين والرفوف بنجاح", result);

                // 5. Test Listing locations
                var allLocations = locRepo.GetAll(onlyActive: true);
                Assert(allLocations.Count == 2, "استرجاع قائمة مواقع التخزين النشطة (عدد 2)", result);

                // 6. Test Assigning Products to Locations
                var prod1 = new Product
                {
                    Id = "prod_panadol_loc",
                    Name = "بنادول أزرق 500 مجم",
                    Barcode = "6221000111222",
                    PricePiasters = 3000,
                    CostPiasters = 2200,
                    StockQuantityMilli = 50000, // 50 units
                    IsActive = true,
                    LocationId = savedLoc1.Id,
                    IsColdChain = false
                };
                productRepo.Upsert(prod1);

                var prodInsulin = new Product
                {
                    Id = "prod_insulin_loc",
                    Name = "أنسولين لانتوس سولوستار",
                    Barcode = "6221000999888",
                    PricePiasters = 25000,
                    CostPiasters = 21000,
                    StockQuantityMilli = 10000, // 10 units
                    IsActive = true,
                    LocationId = savedFridge.Id,
                    IsColdChain = true
                };
                productRepo.Upsert(prodInsulin);

                // Verify reading back product with joined location data
                var fetchedProd1 = productRepo.GetById(prod1.Id);
                Assert(fetchedProd1 != null && fetchedProd1.LocationCode == "RACK-A1" && fetchedProd1.LocationName == "رف A-1 أدوية عامة", "جلب بيانات موقع الصنف ورمزه واسمه بنجاح من المستودع", result);
                Assert(!fetchedProd1.IsColdChain, "الصنف العادي ليس سلسلة تبريد", result);

                var fetchedInsulin = productRepo.GetById(prodInsulin.Id);
                Assert(fetchedInsulin != null && fetchedInsulin.IsColdChain && fetchedInsulin.LocationType == "fridge", "التحقق من بيانات سلسلة التبريد وموقع الثلاجة لصنف الأنسولين", result);

                // 7. Test GetProductsByLocation
                var fridgeProducts = locRepo.GetProductsByLocation(savedFridge.Id);
                Assert(fridgeProducts.Count == 1 && fridgeProducts[0].Id == prodInsulin.Id, "استرجاع الأصناف المرتبطة بموقع الثلاجة بدقة", result);

                // 8. Test Draft Inventory Sheet Generation
                var draftSheet = locService.GetDraftInventory(savedLoc1.Id);
                Assert(draftSheet != null && draftSheet.Items.Count == 1, "توليد مسودة كشف جرد الرف RACK-A1 بنجاح", result);
                Assert(draftSheet.Items[0].BookStockQuantityMilli == 50000 && !draftSheet.Items[0].ActualStockQuantityMilli.HasValue, "بيانات الكمية الدفترية والكمية الفعلية الأولية صحيحة في مسودة الجرد", result);

                // 9. Test Sale Cold Chain Alert Verification
                var sale = new Sale
                {
                    Id = "sale_loc_test_01",
                    InvoiceNumber = 9001,
                    PaymentMethod = "cash",
                    SubtotalPiasters = 25000,
                    TotalPiasters = 25000,
                    PaidPiasters = 25000,
                    Items = new List<SaleItem>
                    {
                        new SaleItem
                        {
                            ProductId = prodInsulin.Id,
                            ProductName = prodInsulin.Name,
                            QuantityMilli = 1000,
                            UnitPricePiasters = 25000,
                            TotalPiasters = 25000
                        }
                    }
                };

                var createdSale = saleRepo.CreateSaleAtomic(sale);
                Assert(createdSale != null, "إتمام عملية بيع صنف الثلاجة بنجاح", result);
                Assert(createdSale.HasColdChainItems, "الكشف التلقائي عن وجود أصناف سلسلة تبريد وتفعيل علم الفاتورة HasColdChainItems", result);
                Assert(createdSale.Items[0].IsColdChain, "تعليم بند الفاتورة كصنف تبريد IsColdChain بنجاح", result);

                // 10. Test Location Soft-Delete / Deactivation
                locRepo.Delete(savedLoc1.Id, "usr_admin");
                var activeAfterDelete = locRepo.GetAll(onlyActive: true);
                Assert(activeAfterDelete.Count == 1, "قائمة المواقع النشطة تعكس التعطيل بدقة بعد الحذف الناعم", result);

                result.Message = string.Format("نجحت جميع اختبارات مواقع التخزين وسلسلة التبريد: {0} من {1}", result.PassedAssertions, result.TotalAssertions);
            }
            catch (Exception ex)
            {
                result.Success = false;
                result.Message = "فشل في اختبارات مواقع التخزين: " + ex.Message + "\n" + ex.StackTrace;
            }
            finally
            {
                try
                {
                    if (File.Exists(tempDbPath))
                    {
                        File.Delete(tempDbPath);
                    }
                }
                catch { }
            }

            return result;
        }

        private static void Assert(bool condition, string testName, StorageLocationTestResult result)
        {
            result.TotalAssertions++;
            if (condition)
            {
                result.PassedAssertions++;
                Console.WriteLine("[PASS] " + testName);
            }
            else
            {
                result.Success = false;
                Console.WriteLine("[FAIL] " + testName);
                throw new Exception("فشل الفحص: " + testName);
            }
        }
    }
}
