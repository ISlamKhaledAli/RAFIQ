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
                Assert(ProductService.RoundPrice(2310, "quarter_pound") == 2300, "تقريب لأقرب ربع جنيه (لأسفل) صحيح", result);
                Assert(ProductService.RoundPrice(2313, "quarter_pound") == 2325, "تقريب لأقرب ربع جنيه (لأعلى) صحيح", result);
                Assert(ProductService.RoundPrice(2325, "quarter_pound") == 2325, "تقريب لأقرب ربع جنيه متطابق صحيح", result);
                Assert(ProductService.RoundPrice(2337, "quarter_pound") == 2325, "تقريب 23.37 ج.م لأقرب ربع جنيه (23.25 ج.م) صحيح", result);
                Assert(ProductService.RoundPrice(2338, "quarter_pound") == 2350, "تقريب 23.38 ج.م لأقرب ربع جنيه (23.50 ج.م) صحيح", result);
                Assert(ProductService.RoundPrice(2388, "quarter_pound") == 2400, "تقريب 23.88 ج.م لأقرب ربع جنيه (24.00 ج.م) صحيح", result);
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

                // 5. Test Preview Percentage Increase with Quarter Pound Rounding
                var previewReqPercent = new BulkPricePreviewRequest
                {
                    Scope = "category",
                    CategoryId = "cat_dairy",
                    TargetField = "price",
                    Method = "percentage",
                    PercentageValue = 5.5, // 3000 * 5.5% = 165 piasters change -> 3165 -> round to quarter pound -> 3175 piasters (31.75 EGP)
                    RoundingRule = "quarter_pound"
                };
                var previewResPercent = productService.PreviewBulkPriceAdjustment(previewReqPercent);
                Assert(previewResPercent.TotalCount == 2, "معاينة قسم الألبان بالكامل بنجاح", result);

                BulkPricePreviewItem prevP1 = null;
                BulkPricePreviewItem prevP2 = null;
                foreach (var item in previewResPercent.Items)
                {
                    if (item.ProductId == p1.Id) prevP1 = item;
                    if (item.ProductId == p2.Id) prevP2 = item;
                }

                Assert(prevP1 != null && prevP1.NewPricePiasters == 3175, "زيادة 5.5% مع تقريب لأقرب ربع جنيه = 31.75 ج.م (3175 قرش)", result);
                // p2: 4000 + 5.5% = 4000 + 220 = 4220 -> round to quarter pound -> 4225 piasters
                Assert(prevP2 != null && prevP2.NewPricePiasters == 4225, "زيادة 5.5% مع تقريب لأقرب ربع جنيه = 42.25 ج.م (4225 قرش)", result);
                Assert(prevP1 != null && !prevP1.BelowCost, "سعر البيع الجديد أعلى من التكلفة", result);

                // 6. Test Preview Fixed Amount with Below Cost Warning (Profit Margin Protection)
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
                Assert(previewResRed.TotalCount == 2, "معاينة قسم الألبان لتخفيض السعر", result);

                BulkPricePreviewItem redP1 = null;
                foreach (var item in previewResRed.Items)
                {
                    if (item.ProductId == p1.Id) redP1 = item;
                }

                // p1 new price: 3000 - 1000 = 2000. Cost is 2500 -> BelowCost!
                Assert(redP1 != null && redP1.NewPricePiasters == 2000, "السعر الجديد بعد التخفيض 20.00 ج.م", result);
                Assert(redP1 != null && redP1.BelowCost, "تم اكتشاف أن السعر الجديد أقل من التكلفة (حماية هامش الربح)", result);
                Assert(previewResRed.BelowCostCount >= 1, "تم إحصاء تنبيهات البيع بأقل من التكلفة", result);

                // 7. Test Atomic Execution with User and Batch Tracking
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
                Assert(!string.IsNullOrWhiteSpace(applyResult.BatchId), "تم توليد معرف دفعة فريد (BatchId) لتعديل الأسعار", result);

                // Verify Database Updates
                var updatedP1 = productRepo.GetById(p1.Id);
                var updatedP2 = productRepo.GetById(p2.Id);
                Assert(updatedP1.PricePiasters == 3300, "تم تحديث سعر بيع الصنف الأول في قاعدة البيانات إلى 33.00 ج.م", result);
                Assert(updatedP1.CostPiasters == 2600, "تم تحديث تكلفة الصنف الأول في قاعدة البيانات إلى 26.00 ج.م", result);
                Assert(updatedP2.PricePiasters == 4400, "تم تحديث سعر بيع الصنف الثاني في قاعدة البيانات إلى 44.00 ج.م", result);

                // Verify Price History Logged with User and Batch
                var histP1 = priceHistoryRepo.GetByProductId(p1.Id);
                Assert(histP1.Count > 0, "تم تسجيل حركة في سجل تاريخ الأسعار للصنف الأول", result);
                Assert(histP1[0].NewPricePiasters == 3300 && histP1[0].ChangeReason == "زيادة تسعيرة مصنع الألبان 2026", "بيانات تاريخ السعر مطابقة", result);
                Assert(histP1[0].UserId == "usr_owner_test", "تم توثيق المستخدم المسؤول في سجل تاريخ الأسعار", result);
                Assert(histP1[0].BatchId == applyResult.BatchId, "تم ربط سجل تاريخ السعر بمعرف الدفعة الجماعية", result);

                // Verify Audit Log
                var auditLogs = auditRepo.GetLogs(10);
                bool foundAudit = false;
                foreach (var log in auditLogs)
                {
                    if (log.Action == "bulk_price_adjustment" && log.EntityId == applyResult.BatchId)
                    {
                        foundAudit = true;
                        break;
                    }
                }
                Assert(foundAudit, "تم تسجيل العملية في سجل العمليات الحساسة (Audit Log) مع معرف الدفعة", result);

                // 8. Test Quick Revert (Undo Bulk Price Adjustment)
                var revertReq = new BulkPriceRevertRequest
                {
                    BatchId = applyResult.BatchId,
                    UserId = "usr_owner_test"
                };
                var revertRes = productService.RevertBulkPriceAdjustment(revertReq);
                Assert(revertRes.Success, "تم تنفيذ التراجع السريع عن تعديل الأسعار بنجاح", result);
                Assert(revertRes.RevertedCount == 2, "تم التراجع عن الصنفين واستعادة أسعارهما", result);

                // Verify Database Restored
                var revertedP1 = productRepo.GetById(p1.Id);
                var revertedP2 = productRepo.GetById(p2.Id);
                Assert(revertedP1.PricePiasters == 3000, "تمت استعادة سعر الصنف الأول الأصلي 30.00 ج.م بنجاح", result);
                Assert(revertedP1.CostPiasters == 2500, "تمت استعادة تكلفة الصنف الأول الأصلية 25.00 ج.م بنجاح", result);
                Assert(revertedP2.PricePiasters == 4000, "تمت استعادة سعر الصنف الثاني الأصلي 40.00 ج.م بنجاح", result);
                Assert(revertedP2.CostPiasters == 3200, "تمت استعادة تكلفة الصنف الثاني الأصلية 32.00 ج.م بنجاح", result);

                // Verify Counter-entry in Price History
                var histP1AfterRevert = priceHistoryRepo.GetByProductId(p1.Id);
                Assert(histP1AfterRevert.Count >= 2, "تم توثيق حركة التراجع في سجل تاريخ الأسعار", result);
                Assert(histP1AfterRevert[0].OldPricePiasters == 3300 && histP1AfterRevert[0].NewPricePiasters == 3000, "حركة التراجع تعكس السعر من 3300 إلى 3000 قرش", result);
                Assert(histP1AfterRevert[0].ChangeReason.Contains("تراجع"), "سبب التعديل يوضح صراحة التراجع عن التعديل الجماعي", result);

                // Verify Audit Log for Revert
                var auditLogsAfterRevert = auditRepo.GetLogs(10);
                bool foundRevertAudit = false;
                foreach (var log in auditLogsAfterRevert)
                {
                    if (log.Action == "bulk_price_adjustment_revert" && log.EntityId == applyResult.BatchId)
                    {
                        foundRevertAudit = true;
                        break;
                    }
                }
                Assert(foundRevertAudit, "تم تسجيل حركة التراجع في سجل العمليات الحساسة (Audit Log)", result);

                // 9. Test Double Revert Prevention
                var doubleRevertRes = productService.RevertBulkPriceAdjustment(revertReq);
                Assert(!doubleRevertRes.Success, "تم منع التراجع المزدوج عن نفس الدفعة", result);


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
