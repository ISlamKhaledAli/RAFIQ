using System;
using System.Collections.Generic;
using System.IO;
using RafiqPOS.Bridge;
using RafiqPOS.Common;
using RafiqPOS.Database;
using RafiqPOS.Models;
using RafiqPOS.Repositories;

namespace RafiqPOS.Services
{
    public class DataQualityTestResult
    {
        public bool Success { get; set; }
        public string Message { get; set; }
        public int TotalAssertions { get; set; }
        public int PassedAssertions { get; set; }
    }

    /// <summary>
    /// اختبارات فحص جودة وصحة بيانات المخزون والأصناف (Feature #117 / Task 117-3)
    /// </summary>
    public static class DataQualityTestRunner
    {
        public static DataQualityTestResult RunAllTests()
        {
            var result = new DataQualityTestResult
            {
                Success = true,
                TotalAssertions = 0,
                PassedAssertions = 0
            };

            string tempDbPath = Path.Combine(Path.GetTempPath(), "rafiq_data_quality_test_" + Guid.NewGuid().ToString("N") + ".db");
            string tempConnStr = string.Format("Data Source={0};Version=3;BusyTimeout=5000;", tempDbPath);

            try
            {
                // 1. Initialize DB schema
                MigrationRunner.ApplyMigrations(tempConnStr, tempDbPath);
                Assert(File.Exists(tempDbPath), "تم إنشاء قاعدة بيانات اختبار جودة البيانات بنجاح", result);

                var auditRepo = new AuditLogRepository(tempConnStr);
                var productRepo = new ProductRepository(tempConnStr, auditRepo);
                var smRepo = new StockMovementRepository(tempConnStr);
                var priceHistoryRepo = new ProductPriceHistoryRepository(tempConnStr);
                var productService = new ProductService(productRepo, auditRepo, priceHistoryRepo, smRepo);
                var reportsService = new ReportsService(tempConnStr);

                string dairyCatId = "cat_dairy";

                // 2. Insert Seed Products with different data conditions
                // Product 1: Perfect healthy product
                var p1 = new Product
                {
                    Id = "p_clean_1",
                    Name = "حليب كامل الدسم 1 لتر",
                    Barcode = "622100000001",
                    CategoryId = dairyCatId,
                    CostPiasters = 2500,
                    PricePiasters = 3200,
                    StockQuantityMilli = 15000,
                    MinStockQuantityMilli = 5000,
                    Unit = "piece",
                    IsActive = true
                };
                productService.SaveProduct(p1);

                // Product 2: Missing Cost (cost = 0)
                var p2 = new Product
                {
                    Id = "p_no_cost_2",
                    Name = "جبنة بيضاء فيتا 500 جم",
                    Barcode = "622100000002",
                    CategoryId = dairyCatId,
                    CostPiasters = 0,
                    PricePiasters = 1800,
                    StockQuantityMilli = 8000,
                    MinStockQuantityMilli = 2000,
                    Unit = "piece",
                    IsActive = true
                };
                productService.SaveProduct(p2);

                // Product 3: Missing Barcode (barcode empty, no secondary barcodes)
                var p3 = new Product
                {
                    Id = "p_no_barcode_3",
                    Name = "مخلل مشكل بلدي",
                    Barcode = "",
                    CategoryId = dairyCatId,
                    CostPiasters = 1200,
                    PricePiasters = 2000,
                    StockQuantityMilli = 6000,
                    MinStockQuantityMilli = 1000,
                    Unit = "kg",
                    IsActive = true
                };
                productService.SaveProduct(p3);

                // Product 4: Missing / Unassigned Category (cat_general)
                var p4 = new Product
                {
                    Id = "p_no_cat_4",
                    Name = "شاي أحمر خرز 100 جم",
                    Barcode = "622100000004",
                    CategoryId = "cat_general",
                    CostPiasters = 1400,
                    PricePiasters = 1800,
                    StockQuantityMilli = 20000,
                    MinStockQuantityMilli = 5000,
                    Unit = "piece",
                    IsActive = true
                };
                productService.SaveProduct(p4);

                // Product 5: Duplicate Barcode Collision (Matches Product 1: 622100000001 via secondary barcode)
                var p5 = new Product
                {
                    Id = "p_dup_barcode_5",
                    Name = "حليب خالي الدسم 1 لتر",
                    Barcode = "622100000005",
                    CategoryId = dairyCatId,
                    CostPiasters = 2600,
                    PricePiasters = 3300,
                    StockQuantityMilli = 10000,
                    MinStockQuantityMilli = 3000,
                    Unit = "piece",
                    IsActive = true
                };
                productService.SaveProduct(p5);

                using (var conn = new System.Data.SQLite.SQLiteConnection(tempConnStr))
                {
                    conn.Open();
                    string insertPuSql = @"
                        INSERT INTO product_units (id, product_id, unit_name, conversion_factor, is_base_unit, sell_price_piasters, cost_price_piasters, barcode, is_divisible, sort_order, created_at, updated_at)
                        VALUES ('pu_test_dup', 'p_dup_barcode_5', 'علبة كرتون', 12, 0, 39600, 31200, '622100000001', 0, 1, datetime('now'), datetime('now'));
                    ";
                    using (var cmd = new System.Data.SQLite.SQLiteCommand(insertPuSql, conn))
                    {
                        cmd.ExecuteNonQuery();
                    }
                }

                // Product 6: Negative Stock (-4000 milli)
                var p6 = new Product
                {
                    Id = "p_neg_stock_6",
                    Name = "زبادي سادة 105 جم",
                    Barcode = "622100000006",
                    CategoryId = dairyCatId,
                    CostPiasters = 500,
                    PricePiasters = 700,
                    StockQuantityMilli = -4000, // Negative!
                    MinStockQuantityMilli = 2000,
                    Unit = "piece",
                    IsActive = true
                };
                productService.SaveProduct(p6);

                // Product 7: Price Below Cost (cost 4000 > price 3000)
                var p7 = new Product
                {
                    Id = "p_below_cost_7",
                    Name = "زبدة طبيعي مستوردة 1 كجم",
                    Barcode = "622100000007",
                    CategoryId = dairyCatId,
                    CostPiasters = 4000, // Cost 40 LE
                    PricePiasters = 3000, // Price 30 LE -> Loss of 10 LE
                    StockQuantityMilli = 5000,
                    MinStockQuantityMilli = 1000,
                    Unit = "kg",
                    IsActive = true
                };
                // confirmBelowCost = true allows saving
                productService.SaveProduct(p7, false, true);

                // 3. Run Data Quality Audit Report (Task 117-1)
                var report = reportsService.GetDataQualityReport();

                Assert(report != null, "تقرير جودة البيانات ليس فارغاً (null)", result);
                Assert(report.TotalProductsAudited == 7, "تم فحص كافة الأصناف النشطة السبعة بدقة", result);

                // Check Missing Cost detection
                Assert(report.MissingCostCount >= 1, "تم اكتشاف الأصناف بدون تكلفة بنجاح", result);
                bool foundMissingCostP2 = false;
                foreach (var issue in report.Issues)
                {
                    if (issue.ProductId == "p_no_cost_2" && issue.IssueType == "missing_cost")
                    {
                        foundMissingCostP2 = true;
                        break;
                    }
                }
                Assert(foundMissingCostP2, "تم تحديد الصنف p_no_cost_2 كصنف بدون تكلفة", result);

                // Check Missing Barcode detection
                Assert(report.MissingBarcodeCount >= 1, "تم اكتشاف الأصناف بدون باركود بنجاح", result);
                bool foundMissingBcP3 = false;
                foreach (var issue in report.Issues)
                {
                    if (issue.ProductId == "p_no_barcode_3" && issue.IssueType == "missing_barcode")
                    {
                        foundMissingBcP3 = true;
                        break;
                    }
                }
                Assert(foundMissingBcP3, "تم تحديد الصنف p_no_barcode_3 كصنف بدون باركود", result);

                // Check Missing Category detection
                Assert(report.MissingCategoryCount >= 1, "تم اكتشاف الأصناف بدون تصنيف محدد بنجاح", result);
                bool foundMissingCatP4 = false;
                foreach (var issue in report.Issues)
                {
                    if (issue.ProductId == "p_no_cat_4" && issue.IssueType == "missing_category")
                    {
                        foundMissingCatP4 = true;
                        break;
                    }
                }
                Assert(foundMissingCatP4, "تم تحديد الصنف p_no_cat_4 كصنف بدون تصنيف", result);

                // Check Duplicate Barcode detection
                Assert(report.DuplicateBarcodeCount >= 2, "تم اكتشاف الباركود المكرر للصنفين p1 و p5", result);
                bool foundDupP1 = false;
                bool foundDupP5 = false;
                foreach (var issue in report.Issues)
                {
                    if (issue.IssueType == "duplicate_barcode")
                    {
                        if (issue.ProductId == "p_clean_1") foundDupP1 = true;
                        if (issue.ProductId == "p_dup_barcode_5") foundDupP5 = true;
                    }
                }
                Assert(foundDupP1 && foundDupP5, "تم تحديد كلا الصنفين المشتركين في نفس الباركود", result);

                // Check Negative Stock detection
                Assert(report.NegativeStockCount >= 1, "تم اكتشاف الرصيد السالب بنجاح", result);
                bool foundNegStockP6 = false;
                foreach (var issue in report.Issues)
                {
                    if (issue.ProductId == "p_neg_stock_6" && issue.IssueType == "negative_stock")
                    {
                        foundNegStockP6 = true;
                        Assert(issue.Severity == "critical", "درجة خطورة الرصيد السالب حرجة (critical)", result);
                        break;
                    }
                }
                Assert(foundNegStockP6, "تم تحديد الصنف p_neg_stock_6 كصنف برصيد سالب", result);

                // Check Price Below Cost detection
                Assert(report.PriceBelowCostCount >= 1, "تم اكتشاف سعر البيع الأقل من التكلفة بنجاح", result);
                bool foundBelowCostP7 = false;
                foreach (var issue in report.Issues)
                {
                    if (issue.ProductId == "p_below_cost_7" && issue.IssueType == "price_below_cost")
                    {
                        foundBelowCostP7 = true;
                        Assert(issue.Severity == "critical", "درجة خطورة البيع بخسارة حرجة (critical)", result);
                        break;
                    }
                }
                Assert(foundBelowCostP7, "تم تحديد الصنف p_below_cost_7 كصنف بسعر بيع أقل من التكلفة", result);

                // Check Health Score calculation
                // Out of 7 products, all except p1 had at least 1 issue. p1 also had duplicate barcode issue with p5.
                // Total healthy products: 0 in this sample test
                Assert(report.TotalIssuesCount >= 6, "إجمالي عدد مشاكل البيانات المكتشفة مطابق للتوقعات", result);
                Assert(report.HealthScorePercent >= 0 && report.HealthScorePercent <= 100, "نسبة مؤشر جودة البيانات بين 0 و 100", result);

                // 4. Test IPC Bridge Dispatcher
                var bridgeReq = new BridgeRequest
                {
                    Id = "req_dq_test",
                    Action = "reports:getDataQuality",
                    Payload = null
                };

                // Temporarily inject DatabaseService connection string or verify dispatch
                var dispatchResponse = IpcDispatcher.Dispatch(bridgeReq);
                Assert(dispatchResponse != null, "استجابة IPC Dispatcher لفحص جودة البيانات ليست فارغة", result);
                Assert(dispatchResponse.Success, "استجابة IPC Dispatcher ناجحة (Success = true)", result);
                Assert(dispatchResponse.Data != null, "استجابة IPC تحتوي على كائن التقرير (Data != null)", result);

                result.Message = string.Format("نجحت جميع اختبارات فحص جودة وصحة البيانات ({0}/{1} تأكيد بنجاح 100%)",
                    result.PassedAssertions, result.TotalAssertions);
            }
            catch (Exception ex)
            {
                result.Success = false;
                result.Message = "فشل في اختبارات فحص جودة البيانات: " + ex.Message + " -> " + ex.StackTrace;
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
                catch
                {
                    // Ignore cleanup lock
                }
            }

            return result;
        }

        private static void Assert(bool condition, string assertionName, DataQualityTestResult result)
        {
            result.TotalAssertions++;
            if (condition)
            {
                result.PassedAssertions++;
            }
            else
            {
                result.Success = false;
                throw new Exception("فشل التأكيد: " + assertionName);
            }
        }
    }
}
