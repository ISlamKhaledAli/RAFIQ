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
    public class InternalBarcodeTestResult
    {
        public bool Success { get; set; }
        public string Message { get; set; }
        public int TotalAssertions { get; set; }
        public int PassedAssertions { get; set; }
    }

    /// <summary>
    /// اختبارات وحدة وتكامل لتوليد الباركود الداخلي القياسي EAN-13 (Feature #119 / Story 108)
    /// </summary>
    public static class InternalBarcodeTestRunner
    {
        public static InternalBarcodeTestResult RunAllTests()
        {
            var result = new InternalBarcodeTestResult
            {
                Success = true,
                TotalAssertions = 0,
                PassedAssertions = 0
            };

            string tempDbPath = Path.Combine(Path.GetTempPath(), "rafiq_internal_bc_test_" + Guid.NewGuid().ToString("N") + ".db");
            string tempConnStr = string.Format("Data Source={0};Version=3;BusyTimeout=5000;", tempDbPath);

            try
            {
                // ==============================================================
                // 1. اختبارات خوارزمية EAN-13 وحساب الرقم التدقيقي Modulo 10
                // ==============================================================
                // اختبار أرقام قياسية معروفة
                // "400638133393" -> رقم التحقق 1 (Stabilo Boss)
                int check1 = BarcodeGenerator.CalculateEan13CheckDigit("400638133393");
                Assert(check1 == 1, "حساب رقم التحقق لـ 400638133393 يجب أن يساوي 1", result);

                // اختبار البادئة 200 مع التسلسل 1: "200000000001"
                // خانات فردية: 2 + 0 + 0 + 0 + 0 + 0 = 2
                // خانات زوجية: 0 + 0 + 0 + 0 + 0 + 1 = 1 (* 3 = 3)
                // المجموع: 5 => (10 - 5) % 10 = 5
                int checkInternal1 = BarcodeGenerator.CalculateEan13CheckDigit("200000000001");
                Assert(checkInternal1 == 5, "رقم تحقق الباركود الداخلي الأول 200000000001 يجب أن يساوي 5", result);

                string formattedBc1 = BarcodeGenerator.FormatInternalEan13(1);
                Assert(formattedBc1 == "2000000000015", "تنسيق أول باركود داخلي يجب أن يطابق 2000000000015", result);
                Assert(formattedBc1.Length == 13, "طول الباركود الداخلي EAN-13 يجب أن يكون 13 خانة تماماً", result);
                Assert(formattedBc1.StartsWith(BarcodeGenerator.INTERNAL_BARCODE_PREFIX), "الباركود الداخلي يجب أن يبدأ بالبادئة القياسية 200", result);

                // التحقق من صلاحية الباركود
                Assert(BarcodeGenerator.IsValidEan13("2000000000015"), "IsValidEan13 يجب أن يرجع true للباركود السليم", result);
                Assert(!BarcodeGenerator.IsValidEan13("2000000000014"), "IsValidEan13 يجب أن يرجع false عند التلاعب برقم التحقق", result);
                Assert(!BarcodeGenerator.IsValidEan13("123"), "IsValidEan13 يجب أن يرفض الباركود غير المكتمل", result);
                Assert(BarcodeGenerator.IsInternalBarcode("2000000000015"), "IsInternalBarcode يجب أن يتعرف على باركود رفيق الداخلي", result);
                Assert(!BarcodeGenerator.IsInternalBarcode("4006381333931"), "IsInternalBarcode يجب ألا يعتبر باركود المصنع الخارجي كباركود داخلي", result);

                // ==============================================================
                // 2. إعداد قاعدة بيانات تجريبية معزولة
                // ==============================================================
                MigrationRunner.ApplyMigrations(tempConnStr, tempDbPath);
                Assert(File.Exists(tempDbPath), "تم إنشاء قاعدة بيانات اختبار الباركود الداخلي", result);

                var auditRepo = new AuditLogRepository(tempConnStr);
                var counterRepo = new CounterRepository(tempConnStr);
                var productRepo = new ProductRepository(tempConnStr, auditRepo, counterRepo);
                var productService = new ProductService(productRepo, auditRepo);

                // ==============================================================
                // 3. اختبار التوليد المتسلسل في قاعدة البيانات
                // ==============================================================
                string generated1 = productService.GenerateNextInternalBarcode();
                string generated2 = productService.GenerateNextInternalBarcode();
                Assert(generated1 != generated2, "الباركودات المولدة متتالياً يجب أن تكون فريدة", result);
                Assert(BarcodeGenerator.IsValidEan13(generated1), "الباركود الأول المولد صالح كمعيار EAN-13", result);
                Assert(BarcodeGenerator.IsValidEan13(generated2), "الباركود الثاني المولد صالح كمعيار EAN-13", result);
                Assert(generated1.StartsWith("200"), "الباركود يبدأ بالبادئة 200", result);

                // ==============================================================
                // 4. اختبار تعيين باركود داخلي لصنف محدد (AssignInternalBarcode)
                // ==============================================================
                var testProd = new Product
                {
                    Id = "prod_internal_test_1",
                    Name = "صنف محلي بدون كود",
                    Barcode = "",
                    CategoryId = "cat_general",
                    PricePiasters = 1500,
                    CostPiasters = 1000,
                    StockQuantityMilli = 50000,
                    Unit = "piece",
                    IsActive = true
                };
                productService.SaveProduct(testProd);

                int missingInitial = productService.GetMissingBarcodeCount();
                Assert(missingInitial >= 1, "يوجد صنف واحد على الأقل بدون باركود في البداية", result);

                var assignResult = productService.AssignInternalBarcode("prod_internal_test_1", "usr_tester");
                Assert(assignResult.Success, "نجاح تعيين باركود داخلي للصنف", result);
                Assert(!string.IsNullOrEmpty(assignResult.Barcode), "تم إرجاع باركود داخلي غير فارغ", result);
                Assert(BarcodeGenerator.IsInternalBarcode(assignResult.Barcode), "الباركود المعين يبدأ بـ 200 وصالح كـ EAN-13", result);

                // التحقق من قاعدة البيانات
                var reloadedProd = productRepo.GetById("prod_internal_test_1");
                Assert(reloadedProd != null && reloadedProd.Barcode == assignResult.Barcode, "تم حفظ الباركود الداخلي في قاعدة البيانات بنجاح", result);

                // ==============================================================
                // 5. اختبار التوليد الجماعي للأصناف الناقصة (BulkGenerateInternalBarcodes)
                // ==============================================================
                // إضافة 3 أصناف بدون باركود
                var b1 = new Product
                {
                    Id = "prod_bulk_1",
                    Name = "توكة شعر مستوردة",
                    Barcode = null,
                    CategoryId = "cat_general",
                    PricePiasters = 500,
                    CostPiasters = 250,
                    StockQuantityMilli = 10000,
                    Unit = "piece",
                    IsActive = true
                };
                var b2 = new Product
                {
                    Id = "prod_bulk_2",
                    Name = "إسفنجة مطبخ عادية",
                    Barcode = "   ", // مسافات فارغة
                    CategoryId = "cat_general",
                    PricePiasters = 750,
                    CostPiasters = 400,
                    StockQuantityMilli = 20000,
                    Unit = "piece",
                    IsActive = true
                };
                var b3 = new Product
                {
                    Id = "prod_bulk_3",
                    Name = "كوب زجاجي محلي",
                    Barcode = "",
                    CategoryId = "cat_general",
                    PricePiasters = 1200,
                    CostPiasters = 800,
                    StockQuantityMilli = 15000,
                    Unit = "piece",
                    IsActive = true
                };
                productService.SaveProduct(b1);
                productService.SaveProduct(b2);
                productService.SaveProduct(b3);

                int missingBeforeBulk = productService.GetMissingBarcodeCount();
                Assert(missingBeforeBulk >= 3, "تم تسجيل 3 أصناف بدون باركود قبل التوليد الجماعي", result);

                var bulkResult = productService.BulkGenerateInternalBarcodes("usr_tester");
                Assert(bulkResult.Success, "نجاح عملية التوليد الجماعي للباركودات الداخلية", result);
                Assert(bulkResult.Count >= 3, "تم تحديث الأصناف الناقصة بالكامل", result);
                Assert(bulkResult.Products.Count == bulkResult.Count, "قائمة المنتجات المحدثة مطابقة للعدد الإجمالي", result);

                // التأكد من عدم تكرار أي باركود داخلي بين الأصناف المحدثة
                var generatedCodes = new HashSet<string>();
                for (int i = 0; i < bulkResult.Products.Count; i++)
                {
                    var item = bulkResult.Products[i];
                    Assert(BarcodeGenerator.IsInternalBarcode(item.Barcode), "باركود الصنف " + item.ProductName + " يتبع المعيار الداخلي 200", result);
                    Assert(!generatedCodes.Contains(item.Barcode), "عدم تكرار الباركود الداخلي: " + item.Barcode, result);
                    generatedCodes.Add(item.Barcode);
                }

                // التأكد من أن عدد الأصناف الناقصة أصبح صفراً
                int missingAfterBulk = productService.GetMissingBarcodeCount();
                Assert(missingAfterBulk == 0, "عدد الأصناف التي بلا باركود أصبح صفراً بعد التوليد الجماعي", result);

                // تشغيل التوليد الجماعي مرة ثانية والتأكد من التعامل السليم مع حالة عدم وجود أصناف ناقصة
                var secondBulk = productService.BulkGenerateInternalBarcodes("usr_tester");
                Assert(secondBulk.Success && secondBulk.Count == 0, "التوليد الجماعي الثاني يعيد بنجاح 0 أصناف بدون أخطاء", result);

                // ==============================================================
                // 6. اختبار تفادي التصادم عند وجود الباركود مسبقاً (Collision Avoidance)
                // ==============================================================
                using (var conn = new System.Data.SQLite.SQLiteConnection(tempConnStr))
                {
                    conn.Open();
                    using (var trans = conn.BeginTransaction())
                    {
                        // فحص دالة IsBarcodeInUse
                        string existingBc = reloadedProd.Barcode;
                        Assert(productRepo.IsBarcodeInUse(conn, trans, existingBc), "IsBarcodeInUse تكشف الباركود المسجل في جدول المنتجات", result);
                        Assert(!productRepo.IsBarcodeInUse(conn, trans, "200999999999"), "IsBarcodeInUse تعيد false لباركود غير مسجل", result);
                        trans.Rollback();
                    }
                }

                result.Success = (result.PassedAssertions == result.TotalAssertions);
                result.Message = string.Format("نجحت جميع اختبارات الباركود الداخلي القياسي ({0}/{1} فحص)", result.PassedAssertions, result.TotalAssertions);
            }
            catch (Exception ex)
            {
                result.Success = false;
                result.Message = "فشل في اختبارات الباركود الداخلي: " + ex.Message;
                Common.Logger.Error("خطأ في InternalBarcodeTestRunner", ex);
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

        private static void Assert(bool condition, string assertionName, InternalBarcodeTestResult result)
        {
            result.TotalAssertions++;
            if (condition)
            {
                result.PassedAssertions++;
            }
            else
            {
                throw new InvalidOperationException("فشل التحقق: " + assertionName);
            }
        }
    }
}
