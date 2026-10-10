using System;
using System.Collections.Generic;
using System.Data.SQLite;
using System.IO;
using RafiqPOS.Common;
using RafiqPOS.Database;
using RafiqPOS.Models;
using RafiqPOS.Repositories;

namespace RafiqPOS.Services
{
    public class MigrationTestResult
    {
        public bool Success { get; set; }
        public string Message { get; set; }
        public int TotalAssertions { get; set; }
        public int PassedAssertions { get; set; }
        public List<string> Details { get; set; }

        public MigrationTestResult()
        {
            this.Details = new List<string>();
        }
    }

    public static class MigrationTestRunner
    {
        public static MigrationTestResult RunAllTests()
        {
            var result = new MigrationTestResult
            {
                Success = true,
                TotalAssertions = 0,
                PassedAssertions = 0
            };

            string sourceDbPath = Path.Combine(Path.GetTempPath(), "rafiq_mig_src_" + Guid.NewGuid().ToString("N") + ".db");
            string sourceConnStr = string.Format("Data Source={0};Version=3;BusyTimeout=5000;", sourceDbPath);

            string targetDbPath = Path.Combine(Path.GetTempPath(), "rafiq_mig_tgt_" + Guid.NewGuid().ToString("N") + ".db");
            string targetConnStr = string.Format("Data Source={0};Version=3;BusyTimeout=5000;", targetDbPath);

            string packageFilePath = null;

            try
            {
                // 1. Setup Source Database
                MigrationRunner.ApplyMigrations(sourceConnStr, sourceDbPath);
                Assert(File.Exists(sourceDbPath), "تم إنشاء قاعدة بيانات الجهاز المصدر وتطبيق الهجرات", result);

                var srcAudit = new AuditLogRepository(sourceConnStr);
                var srcSettings = new SettingsRepository(sourceConnStr);
                var srcCounter = new CounterRepository(sourceConnStr);
                var srcProduct = new ProductRepository(sourceConnStr, srcAudit);
                var srcCustomer = new CustomerRepository(sourceConnStr, srcAudit);
                var srcSale = new SaleRepository(sourceConnStr, srcCounter, srcAudit);
                var srcSupplier = new SupplierRepository(sourceConnStr, srcAudit);

                srcSettings.Set("store_name", "سوبرماركت البركة للتجارة");
                srcSettings.Set("tax_number", "123-456-789");

                // Seed products
                for (int i = 1; i <= 5; i++)
                {
                    srcProduct.Upsert(new Product
                    {
                        Id = Guid.NewGuid().ToString("N"),
                        Name = "صنف تجريبي " + i,
                        Barcode = "6221000" + i,
                        PricePiasters = 2500 * i,
                        CostPiasters = 1800 * i,
                        StockQuantityMilli = 10000 * i, // 10 units
                        Unit = "piece",
                        IsActive = true
                    });
                }

                // Seed customers with debt
                srcCustomer.SaveCustomer(new Customer
                {
                    Name = "الحاج محمود سعيد",
                    Phone = "01011112222",
                    BalancePiasters = 15000 // 150 EGP debt
                });
                srcCustomer.SaveCustomer(new Customer
                {
                    Name = "الأستاذ طارق إبراهيم",
                    Phone = "01122223333",
                    BalancePiasters = 32000 // 320 EGP debt
                });

                // Seed completed sale
                var sale = new Sale
                {
                    Id = Guid.NewGuid().ToString("N"),
                    InvoiceNumber = 101,
                    SubtotalPiasters = 5000,
                    TotalPiasters = 5000,
                    PaidPiasters = 5000,
                    PaymentMethod = "cash",
                    Status = "completed",
                    CashierId = "usr_cashier",
                    CreatedAt = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss")
                };
                sale.Items.Add(new SaleItem
                {
                    Id = Guid.NewGuid().ToString("N"),
                    SaleId = sale.Id,
                    ProductId = "dummy_prod",
                    ProductName = "صنف تجريبي 1",
                    Barcode = "62210001",
                    QuantityMilli = 2000,
                    UnitPricePiasters = 2500,
                    TotalPiasters = 5000
                });
                srcSale.CreateSaleAtomic(sale);

                // Seed supplier
                srcSupplier.Save(new Supplier
                {
                    Name = "شركة النور للمواد الغذائية",
                    Phone = "01233334444",
                    BalancePiasters = 50000, // 500 EGP debt
                    IsActive = true
                });

                // 2. Export Migration Package (Task 139-1)
                var srcMigrationService = new MigrationService(sourceConnStr, sourceDbPath, srcSettings, srcAudit);
                var exportRes = srcMigrationService.CreateMigrationPackage(Path.GetTempPath());

                Assert(exportRes.Success, "نجاح إنشاء حزمة النقل (.rafiqpkg)", result);
                Assert(!string.IsNullOrEmpty(exportRes.FilePath) && File.Exists(exportRes.FilePath), "وجود ملف الحزمة في المجلد المحدد", result);
                Assert(exportRes.FileSizeBytes > 0, "حجم ملف الحزمة أكبر من الصفر", result);
                Assert(exportRes.Manifest != null, "توليد ملف البيان manifest.json المرفق بالحزمة", result);
                Assert(exportRes.Manifest.Metrics.ProductsCount == 5, "تطابق عدد الأصناف في البيان مع المدخلات (5)", result);
                Assert(exportRes.Manifest.Metrics.CustomersCount == 2, "تطابق عدد العملاء في البيان مع المدخلات (2)", result);
                Assert(exportRes.Manifest.Metrics.InvoicesCount == 1, "تطابق عدد الفواتير في البيان مع المدخلات (1)", result);
                Assert(exportRes.Manifest.Metrics.TotalCustomerDebtPiasters == 47000, "تطابق إجمالي ديون العملاء (470 ج.م)", result);
                Assert(exportRes.Manifest.Metrics.SuppliersCount == 1, "تطابق عدد الموردين في البيان مع المدخلات (1)", result);

                packageFilePath = exportRes.FilePath;

                // 3. Inspect Package on New / Target Machine (Task 139-2)
                var tgtMigrationService = new MigrationService(targetConnStr, targetDbPath, null, null);
                var inspectRes = tgtMigrationService.InspectPackage(packageFilePath);

                Assert(inspectRes.Success, "فحص الحزمة على الجهاز الجديد وقراءتها بنجاح", result);
                Assert(inspectRes.IsCompatible, "توافق هيكل الحزمة مع إصدار البرنامج الحالي", result);
                Assert(inspectRes.IsChecksumValid, "صحة بصمة التحقق SHA256 للبيانات داخل الحزمة", result);
                Assert(inspectRes.Manifest.StoreName == "سوبرماركت البركة للتجارة", "قراءة اسم المتجر المسجل بالحزمة", result);

                // 4. Restore Package on Target Machine & Verify Numbers Match (Tasks 139-2, 139-3, 139-4)
                // Initialize target DB with standard migrations first (simulating fresh install)
                MigrationRunner.ApplyMigrations(targetConnStr, targetDbPath);

                var restoreRes = tgtMigrationService.RestorePackage(packageFilePath);
                Assert(restoreRes.Success, "استرجاع حزمة النقل بنجاح وتثبيتها في قاعدة الهدف", result);
                Assert(restoreRes.IsMatch, "تطابق كافة الأرقام والإحصائيات بنسبة 100% بين المصدر والهدف", result);
                Assert(restoreRes.Differences.Count == 0, "خلو قائمة الفروقات من أي اختلافات", result);
                Assert(restoreRes.Comparisons.Count >= 7, "توليد جدول مقارنة مفصل يحتوي على كافة المؤشرات الـ 7", result);

                // Verify specific comparisons
                for (int i = 0; i < restoreRes.Comparisons.Count; i++)
                {
                    var comp = restoreRes.Comparisons[i];
                    Assert(comp.IsMatched, string.Format("مؤشر [{0}] متطابق: {1} == {2}", comp.LabelAr, comp.SourceValue, comp.RestoredValue), result);
                }

                // 5. Verify direct queries on target database to ensure physical data restored
                using (var conn = new SQLiteConnection(targetConnStr))
                {
                    conn.Open();
                    using (var cmd = new SQLiteCommand("SELECT COUNT(*) FROM products WHERE is_active = 1;", conn))
                    {
                        int pCount = Convert.ToInt32(cmd.ExecuteScalar());
                        Assert(pCount == 5, "تأكيد فيزيائي: 5 أصناف موجودة ومقروءة في قاعدة بيانات الجهاز الجديد", result);
                    }
                    using (var cmd = new SQLiteCommand("SELECT COALESCE(SUM(balance_piasters), 0) FROM customers;", conn))
                    {
                        long cDebt = Convert.ToInt64(cmd.ExecuteScalar());
                        Assert(cDebt == 47000, "تأكيد فيزيائي: ديون العملاء مسترجعة بدقة 47000 قرشاً (أمان مالي صحيح)", result);
                    }
                }
            }
            catch (Exception ex)
            {
                result.Success = false;
                result.Message = "حدث استثناء أثناء اختبارات النقل: " + ex.Message;
                result.Details.Add("خطأ: " + ex.ToString());
            }
            finally
            {
                // Cleanup temp test files
                try
                {
                    SQLiteConnection.ClearAllPools();
                    GC.Collect();
                    GC.WaitForPendingFinalizers();

                    if (File.Exists(sourceDbPath)) File.Delete(sourceDbPath);
                    if (File.Exists(targetDbPath)) File.Delete(targetDbPath);
                    if (!string.IsNullOrEmpty(packageFilePath) && File.Exists(packageFilePath))
                    {
                        File.Delete(packageFilePath);
                    }
                }
                catch { }
            }

            if (result.Success && result.PassedAssertions == result.TotalAssertions)
            {
                result.Message = string.Format("نجحت جميع اختبارات نقل البرنامج والبيانات للجهاز الجديد ({0}/{1} اختبارات ناجحة بنسبة 100%).", result.PassedAssertions, result.TotalAssertions);
            }
            else
            {
                result.Success = false;
                result.Message = string.Format("فشل بعض اختبارات النقل ({0}/{1} اختبارات اجتازت).", result.PassedAssertions, result.TotalAssertions);
            }

            return result;
        }

        private static void Assert(bool condition, string testName, MigrationTestResult result)
        {
            result.TotalAssertions++;
            if (condition)
            {
                result.PassedAssertions++;
                result.Details.Add("✓ اجتاز: " + testName);
            }
            else
            {
                result.Success = false;
                result.Details.Add("✗ فشل: " + testName);
            }
        }
    }
}
