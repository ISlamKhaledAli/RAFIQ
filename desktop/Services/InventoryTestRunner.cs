using System;
using System.IO;
using RafiqPOS.Common;
using RafiqPOS.Database;
using RafiqPOS.Models;
using RafiqPOS.Repositories;

namespace RafiqPOS.Services
{
    public class InventoryTestResult
    {
        public bool Success { get; set; }
        public string Message { get; set; }
        public int TotalAssertions { get; set; }
        public int PassedAssertions { get; set; }
    }

    public static class InventoryTestRunner
    {
        public static InventoryTestResult RunAllTests()
        {
            var result = new InventoryTestResult
            {
                Success = true,
                TotalAssertions = 0,
                PassedAssertions = 0
            };

            string tempDbPath = Path.Combine(Path.GetTempPath(), "rafiq_inv_test_" + Guid.NewGuid().ToString("N") + ".db");
            string tempConnStr = string.Format("Data Source={0};Version=3;BusyTimeout=5000;", tempDbPath);

            try
            {
                // 1. Run migrations
                MigrationRunner.ApplyMigrations(tempConnStr, tempDbPath);
                Assert(File.Exists(tempDbPath), "قاعدة البيانات التجريبية تم إنشاؤها بنجاح", result);

                // 2. Setup repos & services
                var pRepo = new ProductRepository(tempConnStr);
                var smRepo = new StockMovementRepository(tempConnStr);
                var auditRepo = new AuditLogRepository(tempConnStr);
                var priceRepo = new ProductPriceHistoryRepository(tempConnStr);
                var pService = new ProductService(pRepo, auditRepo, priceRepo, smRepo);
                var invService = new InventoryService(tempConnStr, smRepo, pRepo, auditRepo);

                // TEST 1: Creating a product with initial stock creates INITIAL movement
                var prod = new Product
                {
                    Id = Guid.NewGuid().ToString(),
                    Name = "لبن تجريبي 1 لتر",
                    Barcode = "6229998881110",
                    PricePiasters = 3500, // 35 EGP
                    CostPiasters = 2800,  // 28 EGP
                    StockQuantityMilli = 50000, // 50 units
                    MinStockQuantityMilli = 10000,
                    Unit = "piece",
                    IsActive = true
                };
                pService.SaveProduct(prod);

                var loadedProd = pRepo.GetById(prod.Id);
                Assert(loadedProd != null && loadedProd.StockQuantityMilli == 50000, "الصنف تم حفظه برصيد افتتاحي 50 قطعة (50000 ملي)", result);

                var initialMovements = invService.GetMovements(prod.Id, "INITIAL", null, null, 10);
                Assert(initialMovements.Count == 1, "تم تسجيل حركة رصيد افتتاحي واحدة في سجل المخزون", result);
                Assert(initialMovements[0].QuantityMilli == 50000, "كمية الحركة الافتتاحية مطابقة تماماً (50000 ملي)", result);

                // TEST 2: Manual stock adjustment (Task 35-2)
                var adj = invService.AdjustStock(prod.Id, 45000, "عجز جرد شهري", "tester");
                Assert(adj != null && adj.QuantityMilli == -5000, "تمت التسوية الجردية بعجز 5 قطع (-5000 ملي)", result);

                var afterAdjProd = pRepo.GetById(prod.Id);
                Assert(afterAdjProd.StockQuantityMilli == 45000, "تم تحديث رصيد الصنف إلى 45 قطعة بعد التسوية", result);

                // TEST 3: Consistency check (Task 34-1)
                var discrepancies = invService.CheckDiscrepancies();
                Assert(discrepancies.Count == 0, "فحص مطابقة الأرصدة: لا يوجد أي تفاوت بين الرصيد ومجموع الحركات", result);

                // TEST 4: Simulate discrepancy and repair with Recalculate (Task 34-3)
                using (var conn = new System.Data.SQLite.SQLiteConnection(tempConnStr))
                {
                    conn.Open();
                    using (var cmd = new System.Data.SQLite.SQLiteCommand("UPDATE products SET stock_quantity_milli = 99999 WHERE id = @id;", conn))
                    {
                        cmd.Parameters.AddWithValue("@id", prod.Id);
                        cmd.ExecuteNonQuery();
                    }
                }

                var badDiscrepancies = invService.CheckDiscrepancies();
                Assert(badDiscrepancies.Count == 1, "اكتشاف التفاوت الاصطناعي بنجاح بواسطة فحص عدم الاتساق", result);
                Assert(badDiscrepancies[0].DifferenceMilli == (99999 - 45000), "حساب الفارق بدقة تامة", result);

                // Run repair
                int repairedCount = invService.RecalculateStock(prod.Id, "tester");
                Assert(repairedCount == 1, "نجاح تشغيل أداة إعادة حساب المخزون من الحركات", result);

                var fixedProd = pRepo.GetById(prod.Id);
                Assert(fixedProd.StockQuantityMilli == 45000, "استعادة الرصيد الدقيق الصحيح (45000) بعد الإصلاح", result);

                var finalDiscrepancies = invService.CheckDiscrepancies();
                Assert(finalDiscrepancies.Count == 0, "لا توجد أي فروقات بعد الإصلاح", result);

                // TEST 5: Low stock detection & queries (Story 79 / Task 36-1)
                int initialLowCount = pService.GetLowStockCount();
                Assert(initialLowCount == 0, "الصنف حالياً فوق حد الطلب (45000 > 10000) ورصيد النواقص = 0", result);

                // Adjust stock to below reorder point (e.g., 8000 milli <= 10000 milli)
                var lowAdj = invService.AdjustStock(prod.Id, 8000, "تلف بضاعة وسكب مياه", "tester", "DAMAGED");
                Assert(lowAdj != null && lowAdj.QuantityMilli == -37000, "تسوية خفضت الرصيد إلى ما دون حد الطلب", result);

                int afterLowCount = pService.GetLowStockCount();
                Assert(afterLowCount == 1, "تم اكتشاف الصنف ضمن النواقص بنجاح (GetLowStockCount = 1)", result);

                var lowStockList = pService.GetLowStock(10);
                Assert(lowStockList.Count == 1 && lowStockList[0].Id == prod.Id, "استرجاع قائمة الأصناف تحت حد الطلب بدقة", result);

                // TEST 6: Adjust by delta (+ / -) (Story 80 / Task 37-2)
                var deltaAdj = invService.AdjustStockByDelta(prod.Id, 7000, "توريد عينات ترويجية مجانية", "tester", "GIFT_PROMOTION");
                Assert(deltaAdj != null && deltaAdj.QuantityMilli == 7000, "نجاح التسوية بإضافة دلتا مباشرة (+7000 ملي)", result);

                var afterDeltaProd = pRepo.GetById(prod.Id);
                Assert(afterDeltaProd.StockQuantityMilli == 15000, "الرصيد بعد إضافة الدلتا أصبح 15 قطعة (15000 ملي)", result);
                Assert(pService.GetLowStockCount() == 0, "خروج الصنف من النواقص بعد زيادة الرصيد فوق حد الطلب", result);

                // TEST 7: Validation constraints (negative stock & empty reason) (Story 80 / Task 37-2)
                bool caughtNegative = false;
                try
                {
                    invService.AdjustStock(prod.Id, -5000, "محاولة رصيد سالب", "tester");
                }
                catch (ArgumentException)
                {
                    caughtNegative = true;
                }
                Assert(caughtNegative, "رفض إدخال رصيد نهائي سالب بنجاح", result);

                bool caughtEmptyReason = false;
                try
                {
                    invService.AdjustStock(prod.Id, 10000, "   ", "tester");
                }
                catch (ArgumentException)
                {
                    caughtEmptyReason = true;
                }
                Assert(caughtEmptyReason, "فرض إجبارية إدخال سبب التسوية الجردية لحماية السجل المالي", result);

                result.Message = string.Format("نجحت جميع اختبارات المخزون والتسوية الجردية وتنبيهات النواقص ({0}/{1} تأكيد سليم)", result.PassedAssertions, result.TotalAssertions);
            }
            catch (Exception ex)
            {
                result.Success = false;
                result.Message = "فشل في اختبارات المخزون: " + ex.Message;
                Logger.Error("فشل في اختبارات المخزون الآلية", ex);
            }
            finally
            {
                try
                {
                    System.Data.SQLite.SQLiteConnection.ClearAllPools();
                    if (File.Exists(tempDbPath))
                    {
                        File.Delete(tempDbPath);
                    }
                }
                catch { }
            }

            return result;
        }

        private static void Assert(bool condition, string message, InventoryTestResult res)
        {
            res.TotalAssertions++;
            if (condition)
            {
                res.PassedAssertions++;
            }
            else
            {
                res.Success = false;
                throw new InvalidOperationException("فشل الشرط: " + message);
            }
        }
    }
}
