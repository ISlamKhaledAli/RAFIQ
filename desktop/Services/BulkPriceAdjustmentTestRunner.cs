using System;
using System.Collections.Generic;
using System.IO;
using RafiqPOS.Common;
using RafiqPOS.Database;
using RafiqPOS.Models;
using RafiqPOS.Repositories;

namespace RafiqPOS.Services
{
    public class BulkPriceTestResult
    {
        public bool Success { get; set; }
        public string Message { get; set; }
        public int TotalAssertions { get; set; }
        public int PassedAssertions { get; set; }
    }

    public static class BulkPriceAdjustmentTestRunner
    {
        public static BulkPriceTestResult RunAllTests()
        {
            var result = new BulkPriceTestResult
            {
                Success = true,
                TotalAssertions = 0,
                PassedAssertions = 0
            };

            string tempDbPath = Path.Combine(Path.GetTempPath(), "rafiq_bulk_price_test_" + Guid.NewGuid().ToString("N") + ".db");
            string tempConnStr = string.Format("Data Source={0};Version=3;BusyTimeout=5000;", tempDbPath);

            try
            {
                // 1. Initialize schema
                MigrationRunner.ApplyMigrations(tempConnStr, tempDbPath);
                Assert(File.Exists(tempDbPath), "تم إنشاء قاعدة البيانات المؤقتة بنجاح", result);

                // 2. Setup repos & services
                var auditRepo = new AuditLogRepository(tempConnStr);
                var productRepo = new ProductRepository(tempConnStr, auditRepo);
                var smRepo = new StockMovementRepository(tempConnStr);
                var priceHistoryRepo = new ProductPriceHistoryRepository(tempConnStr);
                var productService = new ProductService(productRepo, auditRepo, priceHistoryRepo, smRepo);

                // 3. Test Rounding Rules (Task 116-1)
                Assert(ProductService.RoundPrice(2320, "none") == 2320, "قاعدة بدون تقريب صحيحة", result);
                Assert(ProductService.RoundPrice(2325, "half_pound") == 2350, "تقريب لأقرب نصف جنيه (لأعلى) صحيح", result);
                Assert(ProductService.RoundPrice(2320, "half_pound") == 2300, "تقريب لأقرب نصف جنيه (لأسفل) صحيح", result);
                Assert(ProductService.RoundPrice(2350, "one_pound") == 2400, "تقريب لأقرب جنيه (لأعلى) صحيح", result);
                Assert(ProductService.RoundPrice(2349, "one_pound") == 2300, "تقريب لأقرب جنيه (لأسفل) صحيح", result);
                Assert(ProductService.RoundPrice(2300, "ceil_pound") == 2300, "تقريب سقف للجنيه لعدد صحيح متطابق", result);
                Assert(ProductService.RoundPrice(2301, "ceil_pound") == 2400, "تقريب سقف للجنيه عند وجود قروش صحيح", result);
                Assert(ProductService.RoundPrice(2320, "psychological_95") == 2395, "التقريب التسويقي 95 قرش صحيح", result);
                Assert(ProductService.RoundPrice(2320, "psychological_50") == 2350, "التقريب التسويقي 50 قرش صحيح", result);

                // 4. Create Seed Products
                var p1 = new Product
                {
                    Id = "p_test_1",
                    Name = "حليب كامل الدسم 1 لتر",
                    Barcode = "622100000001",
                    CategoryId = "cat_dairy",
                    PricePiasters = 3000, // 30.00 EGP
                    CostPiasters = 2500,  // 25.00 EGP
                    StockQuantityMilli = 50000,
                    Unit = "piece",
                    IsActive = true
                };
                var p2 = new Product
                {
                    Id = "p_test_2",
                    Name = "جبنة بيضاء 500 جم",
                    Barcode = "622100000002",
                    CategoryId = "cat_dairy",
                    PricePiasters = 4000, // 40.00 EGP
                    CostPiasters = 3200,  // 32.00 EGP
                    StockQuantityMilli = 30000,
                    Unit = "piece",
                    IsActive = true
                };
                var p3 = new Product
                {
                    Id = "p_test_3",
                    Name = "شاي أسود 100 جم",
                    Barcode = "622100000003",
                    CategoryId = "cat_beverages",
                    PricePiasters = 1500, // 15.00 EGP
                    CostPiasters = 1200,  // 12.00 EGP
                    StockQuantityMilli = 100000,
                    Unit = "piece",
                    IsActive = true
                };

                productService.SaveProduct(p1);
                productService.SaveProduct(p2);
                productService.SaveProduct(p3);

                // 5. Test Preview Percentage Increase (Task 116-2)
                var previewReqPercent = new BulkPricePreviewRequest
                {
                    Scope = "selected",
                    ProductIds = new List<string> { p1.Id, p2.Id },
                    TargetField = "price",
                    Method = "percentage",
                    PercentageValue = 10.0, // +10%
                    RoundingRule = "none"
                };
                var previewResPercent = productService.PreviewBulkPriceAdjustment(previewReqPercent);
                Assert(previewResPercent.TotalCount == 2, "معاينة الصنفين المحددين بنجاح", result);

                BulkPricePreviewItem prevP1 = null;
                BulkPricePreviewItem prevP2 = null;
                foreach (var item in previewResPercent.Items)
                {
                    if (item.ProductId == p1.Id) prevP1 = item;
                    if (item.ProductId == p2.Id) prevP2 = item;
                }

                Assert(prevP1 != null && prevP1.NewPricePiasters == 3300, "زيادة 10% على 30.00 ج.م = 33.00 ج.م", result);
                Assert(prevP2 != null && prevP2.NewPricePiasters == 4400, "زيادة 10% على 40.00 ج.م = 44.00 ج.م", result);
                Assert(prevP1 != null && !prevP1.BelowCost, "سعر البيع الجديد أعلى من التكلفة", result);

                // 6. Test Preview Fixed Amount with Below Cost Warning (Task 116-2)
                var previewReqReduction = new BulkPricePreviewRequest
                {
                    Scope = "category",
                    CategoryId = "cat_dairy",
                    TargetField = "price",
                    Method = "fixed_amount",
                    AmountPiasters = -1000, // -10.00 EGP
                    RoundingRule = "none"
                };
                var previewResRed = productService.PreviewBulkPriceAdjustment(previewReqReduction);
                Assert(previewResRed.TotalCount == 2, "معاينة قسم الألبان بالكامل", result);

                BulkPricePreviewItem redP1 = null;
                foreach (var item in previewResRed.Items)
                {
                    if (item.ProductId == p1.Id) redP1 = item;
                }

                // p1 new price: 3000 - 1000 = 2000. Cost is 2500 -> BelowCost!
                Assert(redP1 != null && redP1.NewPricePiasters == 2000, "السعر الجديد بعد التخفيض 20.00 ج.م", result);
                Assert(redP1 != null && redP1.BelowCost, "تم اكتشاف أن السعر الجديد أقل من التكلفة", result);
                Assert(previewResRed.BelowCostCount >= 1, "تم إحصاء تنبيهات البيع بأقل من التكلفة", result);

                // 7. Test Atomic Execution (Task 116-4)
                var applyReq = new BulkPriceApplyRequest
                {
                    Reason = "زيادة تسعيرة مصنع الألبان 2026",
                    UserId = "usr_owner_test",
                    Items = new List<BulkPriceApplyItem>
                    {
                        new BulkPriceApplyItem
                        {
                            ProductId = p1.Id,
                            OldPricePiasters = p1.PricePiasters,
                            NewPricePiasters = 3300,
                            OldCostPiasters = p1.CostPiasters,
                            NewCostPiasters = 2600
                        },
                        new BulkPriceApplyItem
                        {
                            ProductId = p2.Id,
                            OldPricePiasters = p2.PricePiasters,
                            NewPricePiasters = 4400,
                            OldCostPiasters = p2.CostPiasters,
                            NewCostPiasters = p2.CostPiasters
                        }
                    }
                };

                var applyResult = productService.ApplyBulkPriceAdjustment(applyReq);
                Assert(applyResult.Success, "تم تطبيق تعديل الأسعار بنجاح", result);
                Assert(applyResult.UpdatedCount == 2, "تم تحديث صنفين في المعاملة", result);

                // Verify Database Updates
                var updatedP1 = productRepo.GetById(p1.Id);
                var updatedP2 = productRepo.GetById(p2.Id);
                Assert(updatedP1.PricePiasters == 3300, "تم تحديث سعر بيع الصنف الأول في قاعدة البيانات", result);
                Assert(updatedP1.CostPiasters == 2600, "تم تحديث تكلفة الصنف الأول في قاعدة البيانات", result);
                Assert(updatedP2.PricePiasters == 4400, "تم تحديث سعر بيع الصنف الثاني في قاعدة البيانات", result);

                // Verify Price History Logged
                var histP1 = priceHistoryRepo.GetByProductId(p1.Id);
                Assert(histP1.Count > 0, "تم تسجيل حركة في سجل تاريخ الأسعار للصنف الأول", result);
                Assert(histP1[0].NewPricePiasters == 3300 && histP1[0].ChangeReason == "زيادة تسعيرة مصنع الألبان 2026", "بيانات تاريخ السعر مطابقة", result);

                // Verify Audit Log
                var auditLogs = auditRepo.GetLogs(10);
                bool foundAudit = false;
                foreach (var log in auditLogs)
                {
                    if (log.Action == "bulk_price_adjustment")
                    {
                        foundAudit = true;
                        break;
                    }
                }
                Assert(foundAudit, "تم تسجيل العملية في سجل العمليات الحساسة (Audit Log)", result);

                result.Message = string.Format("نجحت جميع اختبارات التعديل الجماعي للأسعار ({0}/{1})", result.PassedAssertions, result.TotalAssertions);
            }
            catch (Exception ex)
            {
                result.Success = false;
                result.Message = "فشل في اختبارات التعديل الجماعي: " + ex.Message + "\n" + ex.StackTrace;
            }
            finally
            {
                if (File.Exists(tempDbPath))
                {
                    try { File.Delete(tempDbPath); } catch { }
                }
            }

            return result;
        }

        private static void Assert(bool condition, string assertionName, BulkPriceTestResult result)
        {
            result.TotalAssertions++;
            if (condition)
            {
                result.PassedAssertions++;
            }
            else
            {
                result.Success = false;
                throw new InvalidOperationException("فشل التحقق: " + assertionName);
            }
        }
    }
}
