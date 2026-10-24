using System;
using System.Collections.Generic;
using System.IO;
using RafiqPOS.Database;
using RafiqPOS.Models;
using RafiqPOS.Repositories;

namespace RafiqPOS.Services
{
    public class PatientProfileTestResult
    {
        public bool Success { get; set; }
        public string Message { get; set; }
        public int TotalAssertions { get; set; }
        public int PassedAssertions { get; set; }
    }

    /// <summary>
    /// جناح الاختبارات الشاملة لمنظومة ملفات المرضى والأمراض المزمنة وتنبيهات الاستحقاق وفحص الحساسية السريرية (المحطة 13 - قصة 133 / فيتشر #190)
    /// </summary>
    public static class PatientProfileTestRunner
    {
        public static PatientProfileTestResult RunAllTests()
        {
            var result = new PatientProfileTestResult
            {
                Success = true,
                TotalAssertions = 0,
                PassedAssertions = 0
            };

            string tempDbPath = Path.Combine(Path.GetTempPath(), "rafiq_patient_test_" + Guid.NewGuid().ToString("N") + ".db");
            string tempConnStr = string.Format("Data Source={0};Version=3;BusyTimeout=5000;", tempDbPath);

            try
            {
                // 1. Run migrations up to 48 (which includes Migration 47)
                MigrationRunner.ApplyMigrations(tempConnStr, tempDbPath);
                Assert(File.Exists(tempDbPath), "إنشاء قاعدة البيانات المؤقتة وتطبيق الهجرة 47 بنجاح", result);

                // 2. Setup repositories & services
                var auditRepo = new AuditLogRepository(tempConnStr);
                var counterRepo = new CounterRepository(tempConnStr);
                var settingsRepo = new SettingsRepository(tempConnStr);
                var userRepo = new UserRepository(tempConnStr);
                var securityService = new SecurityService(settingsRepo, auditRepo, userRepo);
                var productRepo = new ProductRepository(tempConnStr, auditRepo);
                var customerRepo = new CustomerRepository(tempConnStr, auditRepo);
                var pharmaRepo = new PharmaRepository(tempConnStr);
                var patientRepo = new PatientRepository(tempConnStr, auditRepo);
                var patientService = new PatientService(patientRepo, securityService);

                // 3. Create test customer
                string custId = "cust_patient_test_01";
                var testCustomer = new Customer
                {
                    Id = custId,
                    Name = "الحاج أحمد عبد الرحمن",
                    Phone = "01012345678",
                    BalancePiasters = 0,
                    CreditLimitPiasters = 50000,
                    CreatedAt = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss")
                };
                customerRepo.SaveCustomer(testCustomer);
                Assert(customerRepo.GetById(custId) != null, "تسجيل العميل الأساسي في قاعدة البيانات", result);

                // 4. Test initial patient profile retrieval (defaults from customer record)
                var initialProfile = patientService.GetProfile(custId);
                Assert(initialProfile != null, "استرجاع الملف الطبي الافتراضي للعميل", result);
                Assert(initialProfile.CustomerName == "الحاج أحمد عبد الرحمن", "تطابق اسم العميل في الملف الطبي الافتراضي", result);
                Assert(initialProfile.CustomerPhone == "01012345678", "تطابق رقم هاتف العميل", result);
                Assert(string.IsNullOrEmpty(initialProfile.Allergies), "الحساسية فارغة في البداية", result);

                // 5. Save patient profile with clinical history & allergies
                var profileToSave = new CustomerPatientInfo
                {
                    CustomerId = custId,
                    BirthYear = 1958,
                    Gender = "male",
                    Allergies = "بنسلين، سلفا",
                    ChronicConditions = "ضغط الدم المرتفع، السكري من النوع الثاني",
                    Notes = "مريض كلى خفيف - يرجى الحذر في الجرعات"
                };
                var savedProfile = patientService.SaveProfile(profileToSave, "usr_admin_default");
                Assert(savedProfile != null, "حفظ الملف الطبي للمريض بنجاح", result);

                var reloadedProfile = patientService.GetProfile(custId);
                Assert(reloadedProfile != null && reloadedProfile.BirthYear == 1958, "حفظ واسترجاع سنة الميلاد للمريض بدقة", result);
                Assert(reloadedProfile.Allergies == "بنسلين، سلفا", "حفظ واسترجاع حساسية الأدوية المسجلة", result);
                Assert(reloadedProfile.ChronicConditions.Contains("ضغط الدم"), "حفظ واسترجاع الأمراض المزمنة", result);

                // 6. Create test products (Chronic drug & Antibiotic with ingredients)
                string prodConcorId = "prod_concor_5mg";
                var prodConcor = new Product
                {
                    Id = prodConcorId,
                    Name = "كونكور 5 مجم 30 قرص",
                    Barcode = "6221000111222",
                    PricePiasters = 4500, // 45 EGP
                    CostPiasters = 3200,
                    StockQuantityMilli = 50000, // 50 packs
                    IsActive = true
                };
                productRepo.Upsert(prodConcor);

                string prodAugmentinId = "prod_augmentin_1g";
                var prodAugmentin = new Product
                {
                    Id = prodAugmentinId,
                    Name = "أوجمنتين 1 جم 14 قرص",
                    Barcode = "6221000333444",
                    PricePiasters = 11000, // 110 EGP
                    CostPiasters = 8500,
                    StockQuantityMilli = 30000,
                    IsActive = true
                };
                productRepo.Upsert(prodAugmentin);

                // Register active ingredient for Augmentin: Amoxicillin (Penicillin group)
                var ingAmox = new ActiveIngredient
                {
                    Id = "ing_amoxicillin",
                    NameAr = "أموكسيسيلين (مشتق بنسلين)",
                    NameEn = "Amoxicillin (Penicillin group)",
                    NormalizedName = "amoxicillin penicillin بنسلين"
                };
                pharmaRepo.SaveActiveIngredient(ingAmox);

                var augmentinInfo = new ProductPharmaInfo
                {
                    ProductId = prodAugmentinId,
                    ScientificName = "Amoxicillin and Clavulanic Acid (Penicillin)",
                    RxStatus = "rx",
                    Ingredients = new List<ProductIngredientDto>
                    {
                        new ProductIngredientDto
                        {
                            IngredientId = "ing_amoxicillin",
                            IngredientNameAr = ingAmox.NameAr,
                            IngredientNameEn = ingAmox.NameEn,
                            StrengthValueMicro = 1000000,
                            StrengthUnit = "mg"
                        }
                    }
                };
                pharmaRepo.SavePharmaInfo(augmentinInfo, "usr_admin_default");

                // 7. Register Chronic Medication with Due Date
                var chronicMed = new ChronicMedication
                {
                    CustomerId = custId,
                    ProductId = prodConcorId,
                    DailyQtyMilli = 1000, // 1 tab daily
                    DaysSupply = 30,
                    LastDispensedAt = DateTime.UtcNow.AddDays(-28).ToString("yyyy-MM-dd HH:mm:ss"),
                    NextDueDate = DateTime.UtcNow.AddDays(2).ToString("yyyy-MM-dd"), // Due in 2 days
                    Notes = "قرص واحد صباحاً بعد الإفطار"
                };
                var savedMed = patientService.SaveChronicMedication(chronicMed, "usr_admin_default");
                Assert(savedMed != null && !string.IsNullOrEmpty(savedMed.Id), "تسجيل الدواء المزمن للمريض بنجاح", result);

                var customerMeds = patientService.GetChronicMedications(custId);
                Assert(customerMeds != null && customerMeds.Count == 1, "استرجاع قائمة أدوية المريض المزمنة بدقة", result);
                Assert(customerMeds[0].ProductName == "كونكور 5 مجم 30 قرص", "تطابق اسم الدواء المزمن في الاستعلام", result);
                Assert(customerMeds[0].DailyQtyMilli == 1000, "تطابق الجرعة اليومية (1000 ملي وحدة)", result);

                // 8. Test Due Alerts Engine
                // Due in 2 days -> Should be included when checking 3 days ahead
                var dueAlertsIn3Days = patientService.GetDueAlerts(3);
                Assert(dueAlertsIn3Days != null && dueAlertsIn3Days.Count == 1, "رصد استحقاق صرف الدواء للمريض خلال 3 أيام", result);
                Assert(dueAlertsIn3Days[0].CustomerId == custId, "تطابق معرّف المريض المستحق", result);
                Assert(dueAlertsIn3Days[0].MedicationNames.Contains("كونكور 5 مجم 30 قرص"), "تطابق اسم الدواء المستحق في التنبيه", result);
                Assert(dueAlertsIn3Days[0].DueSoonCount == 1, "تصنيف التنبيه كاستحقاق وشيك", result);

                // If checking 1 day ahead -> Should NOT be included (due in 2 days)
                var dueAlertsIn1Day = patientService.GetDueAlerts(1);
                Assert(dueAlertsIn1Day == null || dueAlertsIn1Day.Count == 0, "عدم إدراج المريض خارج نطاق الاستحقاق (أقل من يومين)", result);

                // 9. Test Chronic Medication Dispense Recording
                bool dispenseOk = patientService.RecordDispense(custId, new List<string> { prodConcorId }, 30, DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss"), "usr_admin_default");
                Assert(dispenseOk, "تسجيل صرف العلاج الشهري بنجاح وتحديث تاريخ الاستحقاق التالي", result);

                var updatedMeds = patientService.GetChronicMedications(custId);
                Assert(updatedMeds != null && updatedMeds.Count == 1, "استرجاع الأدوية بعد الصرف", result);
                Assert(!string.IsNullOrEmpty(updatedMeds[0].LastDispensedAt), "تحديث تاريخ آخر صرف", result);
                DateTime nextDueDt;
                Assert(DateTime.TryParse(updatedMeds[0].NextDueDate, out nextDueDt) && nextDueDt > DateTime.UtcNow.AddDays(25), "ترحيل تاريخ الاستحقاق القادم 30 يوماً للأمام بعد الصرف", result);

                // After dispensing for 30 days, 3-day alert should now be empty
                var alertsAfterDispense = patientService.GetDueAlerts(3);
                Assert(alertsAfterDispense == null || alertsAfterDispense.Count == 0, "اختفاء تنبيه الاستحقاق بعد إتمام الصرف بنجاح", result);

                // 10. Test Clinical Allergy Conflict Detection
                // Patient is allergic to: "بنسلين، سلفا"
                // Product A (Concor) -> No Penicillin, No Sulfa -> No Conflict
                var concorAllergyCheck = patientService.CheckAllergies(custId, new List<string> { prodConcorId });
                Assert(!concorAllergyCheck.HasConflict, "عدم إطلاق تحذير حساسية لدواء آمن لا يتعارض مع المريض", result);

                // Product B (Augmentin) -> Contains Amoxicillin (Penicillin group) -> CONFLICT!
                var augmentinAllergyCheck = patientService.CheckAllergies(custId, new List<string> { prodAugmentinId });
                Assert(augmentinAllergyCheck.HasConflict, "اكتشاف تعارض الحساسية السريرية بنجاح عند فحص صنف البنسلين للمريض", result);
                Assert(augmentinAllergyCheck.Conflicts != null && augmentinAllergyCheck.Conflicts.Count == 1, "إرجاع تفاصيل التعارض بدقة كاملة", result);
                Assert(augmentinAllergyCheck.Conflicts[0].ProductName.Contains("أوجمنتين"), "تطابق اسم الصنف المتعارض", result);
                Assert(augmentinAllergyCheck.Conflicts[0].AllergyMatch == "بنسلين" || augmentinAllergyCheck.Conflicts[0].AllergyMatch == "penicillin", "تطابق مادة الحساسية المسببة للتعارض", result);

                // 11. Test Delete Chronic Medication
                bool deleteOk = patientService.DeleteChronicMedication(savedMed.Id, "usr_admin_default");
                Assert(deleteOk, "حذف الدواء المزمن من ملف المريض بنجاح", result);
                var emptyMeds = patientService.GetChronicMedications(custId);
                Assert(emptyMeds != null && emptyMeds.Count == 0, "تأكيد خلو قائمة الأدوية المزمنة بعد الحذف", result);

                result.Message = string.Format("نجحت جميع اختبارات ملفات المرضى والأمراض المزمنة ({0}/{1} تأكيد بنجاح 100%)",
                    result.PassedAssertions, result.TotalAssertions);
            }
            catch (Exception ex)
            {
                result.Success = false;
                result.Message = "فشل في اختبارات ملفات المرضى: " + ex.Message + " | " + ex.StackTrace;
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

        private static void Assert(bool condition, string testName, PatientProfileTestResult result)
        {
            result.TotalAssertions++;
            if (condition)
            {
                result.PassedAssertions++;
            }
            else
            {
                result.Success = false;
                throw new InvalidOperationException("فشل التأكيد في اختبار: " + testName);
            }
        }
    }
}
