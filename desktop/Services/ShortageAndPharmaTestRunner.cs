using System;
using System.Collections.Generic;
using System.IO;
using RafiqPOS.Common;
using RafiqPOS.Database;
using RafiqPOS.Models;
using RafiqPOS.Repositories;

namespace RafiqPOS.Services
{
    public class ShortageAndPharmaTestResult
    {
        public bool Success { get; set; }
        public string Message { get; set; }
        public int TotalAssertions { get; set; }
        public int PassedAssertions { get; set; }
    }

    /// <summary>
    /// جناح الاختبارات الشاملة لكشكول النواقص ومحرك البدائل الصيدلانية (المحطة 13 - قصة 129 و 130 / ميزات 186 و 187)
    /// </summary>
    public static class ShortageAndPharmaTestRunner
    {
        public static ShortageAndPharmaTestResult RunAllTests()
        {
            var result = new ShortageAndPharmaTestResult
            {
                Success = true,
                TotalAssertions = 0,
                PassedAssertions = 0
            };

            string tempDbPath = Path.Combine(Path.GetTempPath(), "rafiq_pharma_test_" + Guid.NewGuid().ToString("N") + ".db");
            string tempConnStr = string.Format("Data Source={0};Version=3;BusyTimeout=5000;", tempDbPath);

            try
            {
                // 1. Run migrations including Migration 45
                MigrationRunner.ApplyMigrations(tempConnStr, tempDbPath);
                Assert(File.Exists(tempDbPath), "إنشاء قاعدة البيانات وتطبيق الميجريشن 45 بنجاح", result);

                // 2. Setup repos & services
                var auditRepo = new AuditLogRepository(tempConnStr);
                var productRepo = new ProductRepository(tempConnStr, auditRepo);
                var shortageRepo = new ShortageRepository(tempConnStr);
                var shortageService = new ShortageService(shortageRepo, tempConnStr);
                var pharmaRepo = new PharmaRepository(tempConnStr);
                var alternativesService = new DrugAlternativesService(pharmaRepo, productRepo, tempConnStr);

                // =========================================================================
                // اختبارات كشكول النواقص (Story 129 / Feature #186)
                // =========================================================================

                // إنشاء منتج ومورد لاختبار النواقص
                var sup1 = new Supplier
                {
                    Id = "sup_pharma_1",
                    Name = "الشركة المصرية للأدوية",
                    Phone = "01000000001",
                    CreatedAt = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss")
                };
                var supRepo = new SupplierRepository(tempConnStr, auditRepo);
                supRepo.Save(sup1);

                var prod1 = new Product
                {
                    Id = "prod_panadol_500",
                    Name = "بنادول 500 مجم أقراص",
                    Barcode = "622100000001",
                    PricePiasters = 4500, // 45 EGP
                    CostPiasters = 3500,
                    StockQuantityMilli = 0, // out of stock
                    MinStockQuantityMilli = 5000,
                    Unit = "علبة",
                    PreferredSupplierId = "sup_pharma_1"
                };
                productRepo.Upsert(prod1);

                // حفظ قيد نواقص من الكاشير
                var shortage1 = new ShortageEntry
                {
                    ProductId = prod1.Id,
                    ProductName = prod1.Name,
                    FreeText = prod1.Name,
                    RequestedQtyMilli = 2000,
                    CustomerName = "أحمد محمد",
                    CustomerPhone = "01112223334",
                    Source = "pos",
                    Priority = "urgent",
                    Notes = "مطلوب علبتين للمريض فور وصول الدواء"
                };
                var savedShortage = shortageService.Save(shortage1, "usr_admin");
                Assert(savedShortage != null && savedShortage.Id == shortage1.Id, "تسجيل قيد نواقص من الكاشير بنجاح", result);
                Assert(savedShortage.Priority == "urgent", "حفظ أولوية النواقص كـ urgent بنجاح", result);

                // حفظ قيد نواقص حر (صنف غير مسجل)
                var shortageFree = new ShortageEntry
                {
                    ProductId = null,
                    FreeText = "كونجستال أقراص غير متوفر بالكتالوج",
                    RequestedQtyMilli = 1000,
                    Source = "manual",
                    Priority = "normal"
                };
                var savedFree = shortageService.Save(shortageFree, "usr_admin");
                Assert(savedFree != null && !string.IsNullOrEmpty(savedFree.Id), "تسجيل قيد نواقص حر بنجاح", result);

                // استعلام النواقص المفتوحة
                var openShortages = shortageService.GetAll("open", null, null, null);
                Assert(openShortages.Count >= 2, "استرجاع قائمة النواقص المفتوحة مفلترة بشكل صحيح", result);

                // تحويل النواقص لمقترح طلبية شراء للمورد
                var idsToConvert = new List<string> { savedShortage.Id, savedFree.Id };
                var proposal = shortageService.ConvertToPurchaseProposal(idsToConvert, "sup_pharma_1", "usr_admin");
                Assert(proposal != null && proposal.Lines.Count == 2, "توليد مقترح طلبية شراء مجمعة من النواقص", result);

                // التحقق من تحديث حالة القيود إلى 'ordered'
                var reloadedShortage = shortageService.GetById(savedShortage.Id);
                Assert(reloadedShortage.Status == "ordered", "تحديث حالة قيد النواقص تلقائياً إلى ordered", result);

                // تقرير المبيعات الضائعة
                var lostReport = shortageService.GetLostSalesReport(null, null);
                Assert(lostReport != null && lostReport.TotalRequests >= 2, "حساب تقرير المبيعات الضائعة وإجمالي الطلبات بنجاح", result);
                Assert(lostReport.TotalLostRevenuePiasters > 0, "تقدير قيمة المبيعات والأرباح المفقودة بالقرش بدقة", result);
                Assert(lostReport.TotalUnmetRequestsCount == lostReport.TotalRequests, "تطابق مفاتيح التوافق مع الواجهة totalUnmetRequestsCount", result);
                Assert(lostReport.TotalEstimatedLostRevenuePiasters == lostReport.TotalLostRevenuePiasters, "تطابق مفاتيح التوافق مع الواجهة totalEstimatedLostRevenuePiasters", result);
                Assert(lostReport.TopRequestedProducts.Count == lostReport.Items.Count, "تطابق مصفوفة المنتجات topRequestedProducts", result);

                // اختبار محرك فحص النواقص التلقائي
                var autoShortages = shortageService.GetAutoShortages(15);
                Assert(autoShortages != null && autoShortages.Count >= 1, "محرك فحص النواقص التلقائي اكتشف الأصناف تحت حد الأمان", result);
                Assert(autoShortages.Exists(s => s.ProductId == prod1.Id), "إدراج صنف بنادول تلقائياً في كشكول النواقص لتصفير رصيده", result);

                // =========================================================================
                // اختبارات الملف الدوائي ومحرك البدائل (Story 130 / Feature #187)
                // =========================================================================

                // التحقق من بذر الأشكال الصيدلانية والتصنيفات العلاجية
                var dosageForms = pharmaRepo.GetDosageForms(true);
                Assert(dosageForms.Count >= 10, "التأكد من وجود الأشكال الصيدلانية القياسية (أقراص، كبسول، شراب، حقن...)", result);

                var therapeuticClasses = pharmaRepo.GetTherapeuticClasses(true);
                Assert(therapeuticClasses.Count >= 5, "التأكد من وجود المجموعات العلاجية القياسية (مسكنات، مضادات حيوية...)", result);

                // تسجيل مادة فعالة Paracetamol
                var paracetamol = new ActiveIngredient
                {
                    Id = "ing_paracetamol",
                    NameEn = "Paracetamol",
                    NameAr = "باراسيتامول",
                    NormalizedName = "paracetamol باراسيتامول"
                };
                pharmaRepo.SaveActiveIngredient(paracetamol);

                var ibuprofen = new ActiveIngredient
                {
                    Id = "ing_ibuprofen",
                    NameEn = "Ibuprofen",
                    NameAr = "إيبوبروفين",
                    NormalizedName = "ibuprofen ايبوبروفين"
                };
                pharmaRepo.SaveActiveIngredient(ibuprofen);

                // ربط الملف الدوائي للمنتج المستهدف (بنادول 500 أقراص)
                var panadolPharma = new ProductPharmaInfo
                {
                    ProductId = prod1.Id,
                    ScientificName = "Paracetamol 500mg",
                    DosageFormId = "df_tablets",
                    StrengthText = "500 mg",
                    Route = "oral",
                    StorageCondition = "room",
                    TherapeuticClassId = "tc_analgesic",
                    Ingredients = new List<ProductIngredientDto>
                    {
                        new ProductIngredientDto
                        {
                            IngredientId = "ing_paracetamol",
                            StrengthValueMicro = 500000, // 500 mg = 500,000 micro
                            StrengthUnit = "mg"
                        }
                    }
                };
                pharmaRepo.SavePharmaInfo(panadolPharma, "usr_admin");
                var reloadedPanadolPharma = pharmaRepo.GetPharmaInfo(prod1.Id);
                Assert(reloadedPanadolPharma != null && reloadedPanadolPharma.Ingredients.Count == 1, "حفظ واسترجاع الملف الدوائي للصنف والمواد الفعالة بنجاح", result);

                // إنشاء منتج (2): بارامول 500 أقراص -> مثيل مطابق (Tier 1)
                var prod2 = new Product
                {
                    Id = "prod_paramol_500",
                    Name = "بارامول 500 مجم أقراص",
                    Barcode = "622100000002",
                    PricePiasters = 2500,
                    CostPiasters = 1800,
                    StockQuantityMilli = 10000, // متوفر 10 علب
                    Unit = "علبة"
                };
                productRepo.Upsert(prod2);
                pharmaRepo.SavePharmaInfo(new ProductPharmaInfo
                {
                    ProductId = prod2.Id,
                    ScientificName = "Paracetamol 500mg",
                    DosageFormId = "df_tablets",
                    StrengthText = "500 mg",
                    TherapeuticClassId = "tc_analgesic",
                    Ingredients = new List<ProductIngredientDto>
                    {
                        new ProductIngredientDto { IngredientId = "ing_paracetamol", StrengthValueMicro = 500000, StrengthUnit = "mg" }
                    }
                }, "usr_admin");

                // إنشاء منتج (3): باراسيتامول فوار 500 مجم -> شكل صيدلاني مختلف (Tier 2)
                var prod3 = new Product
                {
                    Id = "prod_paracetamol_eff",
                    Name = "باراسيتامول فوار 500 مجم",
                    Barcode = "622100000003",
                    PricePiasters = 3000,
                    CostPiasters = 2200,
                    StockQuantityMilli = 5000,
                    Unit = "علبة"
                };
                productRepo.Upsert(prod3);
                pharmaRepo.SavePharmaInfo(new ProductPharmaInfo
                {
                    ProductId = prod3.Id,
                    ScientificName = "Paracetamol 500mg",
                    DosageFormId = "df_effervescent", // فوار مختلف عن أقراص
                    StrengthText = "500 mg",
                    TherapeuticClassId = "tc_analgesic",
                    Ingredients = new List<ProductIngredientDto>
                    {
                        new ProductIngredientDto { IngredientId = "ing_paracetamol", StrengthValueMicro = 500000, StrengthUnit = "mg" }
                    }
                }, "usr_admin");

                // إنشاء منتج (4): بنادول اكسترا 1000 مجم -> تركيز مختلف (Tier 3)
                var prod4 = new Product
                {
                    Id = "prod_panadol_extra_1000",
                    Name = "بنادول اكسترا 1000 مجم أقراص",
                    Barcode = "622100000004",
                    PricePiasters = 6000,
                    CostPiasters = 4800,
                    StockQuantityMilli = 3000,
                    Unit = "علبة"
                };
                productRepo.Upsert(prod4);
                pharmaRepo.SavePharmaInfo(new ProductPharmaInfo
                {
                    ProductId = prod4.Id,
                    ScientificName = "Paracetamol 1000mg",
                    DosageFormId = "df_tablets",
                    StrengthText = "1000 mg",
                    TherapeuticClassId = "tc_analgesic",
                    Ingredients = new List<ProductIngredientDto>
                    {
                        new ProductIngredientDto { IngredientId = "ing_paracetamol", StrengthValueMicro = 1000000, StrengthUnit = "mg" }
                    }
                }, "usr_admin");

                // إنشاء منتج (5): بروفين 400 أقراص -> بديل علاجي (Tier 4: مسكن مختلف المادة الفعالة)
                var prod5 = new Product
                {
                    Id = "prod_brufen_400",
                    Name = "بروفين 400 مجم أقراص",
                    Barcode = "622100000005",
                    PricePiasters = 5500,
                    CostPiasters = 4200,
                    StockQuantityMilli = 8000,
                    Unit = "علبة"
                };
                productRepo.Upsert(prod5);
                pharmaRepo.SavePharmaInfo(new ProductPharmaInfo
                {
                    ProductId = prod5.Id,
                    ScientificName = "Ibuprofen 400mg",
                    DosageFormId = "df_tablets",
                    StrengthText = "400 mg",
                    TherapeuticClassId = "tc_analgesic", // نفس التصنيف العلاجي
                    Ingredients = new List<ProductIngredientDto>
                    {
                        new ProductIngredientDto { IngredientId = "ing_ibuprofen", StrengthValueMicro = 400000, StrengthUnit = "mg" }
                    }
                }, "usr_admin");

                // تشغيل محرك البدائل للصنف المستهدف بنادول 500
                var alternatives = alternativesService.GetAlternatives(prod1.Id);
                Assert(alternatives != null, "استدعاء محرك البدائل والمثائل بنجاح", result);

                // التحقق من تصنيف المستويات الأربعة
                Assert(alternatives.ExactGenerics.Count == 1 && alternatives.ExactGenerics[0].ProductId == prod2.Id,
                    "المستوى 1: تصنيف بارامول كمثيل مطابق (نفس المادة والشكل والتركيز)", result);

                Assert(alternatives.DifferentForms.Count == 1 && alternatives.DifferentForms[0].ProductId == prod3.Id,
                    "المستوى 2: تصنيف الفوار كمثيل بشكل صيدلاني مختلف", result);

                Assert(alternatives.DifferentStrengths.Count == 1 && alternatives.DifferentStrengths[0].ProductId == prod4.Id,
                    "المستوى 3: تصنيف بنادول 1000 كتركيز مختلف", result);

                Assert(alternatives.TherapeuticAlternatives.Count == 1 && alternatives.TherapeuticAlternatives[0].ProductId == prod5.Id,
                    "المستوى 4: تصنيف بروفين 400 كبديل علاجي (نفس المجموعة)", result);

                result.Message = string.Format("نجحت كافة اختبارات كشكول النواقص والملف الدوائي ومحرك البدائل ({0}/{1} بنجاح تام).",
                    result.PassedAssertions, result.TotalAssertions);
            }
            catch (Exception ex)
            {
                result.Success = false;
                result.Message = "فشل في اختبارات النواقص والبدائل: " + ex.Message + "\n" + ex.StackTrace;
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

        private static void Assert(bool condition, string assertionName, ShortageAndPharmaTestResult result)
        {
            result.TotalAssertions++;
            if (condition)
            {
                result.PassedAssertions++;
            }
            else
            {
                result.Success = false;
                throw new Exception("فشل التحقق: " + assertionName);
            }
        }
    }
}
