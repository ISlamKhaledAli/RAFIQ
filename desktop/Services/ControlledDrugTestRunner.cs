using System;
using System.Collections.Generic;
using System.IO;
using RafiqPOS.Common;
using RafiqPOS.Database;
using RafiqPOS.Models;
using RafiqPOS.Repositories;

namespace RafiqPOS.Services
{
    public class ControlledDrugTestResult
    {
        public bool Success { get; set; }
        public string Message { get; set; }
        public int TotalAssertions { get; set; }
        public int PassedAssertions { get; set; }
    }

    /// <summary>
    /// جناح الاختبارات الشاملة لمنظومة أدوية الجدول والرقابة والروشتات ودفتر التفتيش (المحطة 13 - قصة 131 / فيتشر #188)
    /// </summary>
    public static class ControlledDrugTestRunner
    {
        public static ControlledDrugTestResult RunAllTests()
        {
            var result = new ControlledDrugTestResult
            {
                Success = true,
                TotalAssertions = 0,
                PassedAssertions = 0
            };

            string tempDbPath = Path.Combine(Path.GetTempPath(), "rafiq_controlled_test_" + Guid.NewGuid().ToString("N") + ".db");
            string tempConnStr = string.Format("Data Source={0};Version=3;BusyTimeout=5000;", tempDbPath);

            try
            {
                // 1. Run migrations up to 46
                MigrationRunner.ApplyMigrations(tempConnStr, tempDbPath);
                Assert(File.Exists(tempDbPath), "إنشاء قاعدة البيانات وتطبيق الهجرة 46 بنجاح", result);

                // 2. Setup repositories & services
                var auditRepo = new AuditLogRepository(tempConnStr);
                var counterRepo = new CounterRepository(tempConnStr);
                var settingsRepo = new SettingsRepository(tempConnStr);
                var userRepo = new UserRepository(tempConnStr);
                var securityService = new SecurityService(settingsRepo, auditRepo, userRepo);
                var encryptionService = new EncryptionService("TestControlledSecret123!");

                var productRepo = new ProductRepository(tempConnStr, auditRepo);
                var pharmaRepo = new PharmaRepository(tempConnStr);
                var batchRepo = new ProductBatchRepository(tempConnStr, auditRepo);
                var saleRepo = new SaleRepository(tempConnStr, counterRepo, auditRepo, batchRepo);
                var saleService = new SaleService(saleRepo, productRepo);

                var controlledRepo = new ControlledDrugRepository(tempConnStr);
                var prescriptionRepo = new PrescriptionRepository(tempConnStr, Path.GetDirectoryName(tempDbPath));
                var controlledService = new ControlledDrugService(controlledRepo, settingsRepo, encryptionService, securityService);
                var prescriptionService = new PrescriptionService(prescriptionRepo, Path.GetDirectoryName(tempDbPath));
                var heldSaleRepo = new HeldSaleRepository(tempConnStr);
                var heldSaleService = new HeldSaleService(heldSaleRepo);
                var returnRepo = new ReturnRepository(tempConnStr, counterRepo, auditRepo);
                var returnService = new ReturnService(returnRepo, saleRepo);

                DatabaseService.ControlledDrugRepo = controlledRepo;
                DatabaseService.PrescriptionRepo = prescriptionRepo;
                DatabaseService.ControlledDrugs = controlledService;
                DatabaseService.Prescriptions = prescriptionService;
                DatabaseService.Security = securityService;

                // 3. Create test users (Pharmacist Admin and Cashier)
                var adminUser = userRepo.GetByUsername("admin");
                if (adminUser == null)
                {
                    adminUser = new User
                    {
                        Id = "usr_test_admin",
                        Username = "admin",
                        DisplayName = "د. أحمد (الصيدلي المدير)",
                        Role = "admin",
                        IsActive = true
                    };
                    userRepo.Insert(adminUser);
                }

                var cashierUser = new User
                {
                    Id = "usr_test_cashier",
                    Username = "cashier_ali",
                    DisplayName = "علي (مساعد الصيدلي)",
                    Role = "cashier",
                    IsActive = true
                };
                userRepo.Insert(cashierUser);

                // 4. Create Controlled Drug Product & Pharma Info
                var drugProd = new Product
                {
                    Id = "prod_morphine_amp",
                    Name = "مورفين أمبول 10 مجم",
                    Barcode = "622500000001",
                    PricePiasters = 7500, // 75 EGP
                    CostPiasters = 5000,
                    StockQuantityMilli = 100000, // 100 ampoules
                    Unit = "أمبول",
                    IsActive = true
                };
                productRepo.Upsert(drugProd);

                var pharmaInfo = new ProductPharmaInfo
                {
                    ProductId = drugProd.Id,
                    ScientificName = "Morphine Sulfate",
                    NormalizedScientificName = "morphine sulfate",
                    RxStatus = "controlled",
                    ControlledSchedule = "جدول أول أ مخدرات",
                    StrengthText = "10mg/1ml"
                };
                pharmaRepo.SavePharmaInfo(pharmaInfo, adminUser.Id);

                // Create a batch
                var batch1 = new ProductBatch
                {
                    Id = "batch_morph_01",
                    ProductId = drugProd.Id,
                    BatchNumber = "BATCH-MO-2026",
                    QuantityMilli = 100000,
                    ExpiryDate = "2028-12-31",
                    CostPricePiasters = 5000,
                    SellPricePiasters = 7500,
                    Status = "ACTIVE"
                };
                batchRepo.CreateOrUpdateBatch(batch1);

                // Open shift
                var shiftRepo = new ShiftRepository(tempConnStr);
                var shift = new Shift
                {
                    Id = "shift_test_ctrl",
                    ShiftNumber = 1,
                    CashierId = cashierUser.Id,
                    CashierName = cashierUser.DisplayName,
                    PosRegisterId = "pos_1",
                    BusinessDate = DateTime.UtcNow.ToString("yyyy-MM-dd"),
                    Status = "open",
                    OpenedAt = DateTime.UtcNow.ToString("o"),
                    OpeningFloatPiasters = 50000,
                    CreatedAt = DateTime.UtcNow.ToString("o"),
                    UpdatedAt = DateTime.UtcNow.ToString("o")
                };
                using (var shiftConn = new System.Data.SQLite.SQLiteConnection(tempConnStr))
                {
                    shiftConn.Open();
                    using (var shiftTrans = shiftConn.BeginTransaction())
                    {
                        shiftRepo.Insert(shift, shiftConn, shiftTrans);
                        shiftTrans.Commit();
                    }
                }

                // =========================================================================
                // Test Case 1: Rejection of sale without controlled dispenses (Task 188-2)
                // =========================================================================
                bool saleBlocked = false;
                try
                {
                    var bareSale = new Sale
                    {
                        Id = "sale_unauthorized_1",
                        CashierId = cashierUser.Id,
                        ShiftId = shift.Id,
                        PaymentMethod = "cash",
                        Items = new List<SaleItem>
                        {
                            new SaleItem
                            {
                                ProductId = drugProd.Id,
                                ProductName = drugProd.Name,
                                QuantityMilli = 2000, // 2 ampoules
                                UnitPricePiasters = 7500,
                                UnitCostPiasters = 5000,
                                BatchId = batch1.Id,
                                BatchNumber = batch1.BatchNumber
                            }
                        }
                    };

                    saleService.ProcessSale(bareSale);
                }
                catch (InvalidOperationException ex)
                {
                    saleBlocked = ex.Message.Contains("جدول الرقابة") || ex.Message.Contains("المهدئات");
                }
                Assert(saleBlocked, "حظر إتمام بيع دواء جدول دون تسجيل بيانات الصرف الإلزامية", result);

                // =========================================================================
                // Test Case 2: Prevention of Holding Controlled Drugs (Task 188-2)
                // =========================================================================
                bool holdBlocked = false;
                try
                {
                    var held = new HeldSale
                    {
                        Id = "held_ctrl_1",
                        CashierId = cashierUser.Id,
                        CartJson = string.Format("[{{\"productId\":\"{0}\",\"quantity\":2}}]", drugProd.Id)
                    };
                    heldSaleService.HoldSale(held);
                }
                catch (InvalidOperationException ex)
                {
                    holdBlocked = ex.Message.Contains("لا يمكن تعليق فاتورة تحتوي على أدوية جدول");
                }
                Assert(holdBlocked, "منع تعليق فواتير أدوية الجدول والمهدئات نهائياً", result);

                // =========================================================================
                // Test Case 3: Rejection of Cashier without approval / supervisor PIN (Task 188-4)
                // =========================================================================
                bool approvalBlocked = false;
                try
                {
                    var disp = new ControlledDrugDispense
                    {
                        ProductId = drugProd.Id,
                        ProductName = drugProd.Name,
                        QuantityMilli = 2000,
                        PatientName = "محمود السيد حسن",
                        DoctorName = "د. خالد عبد الرحمن",
                        PrescriptionDate = "2026-10-24"
                    };

                    var unauthorizedSale = new Sale
                    {
                        Id = "sale_unauth_dispense",
                        CashierId = cashierUser.Id,
                        ShiftId = shift.Id,
                        PaymentMethod = "cash",
                        Items = new List<SaleItem>
                        {
                            new SaleItem
                            {
                                ProductId = drugProd.Id,
                                ProductName = drugProd.Name,
                                QuantityMilli = 2000,
                                UnitPricePiasters = 7500,
                                UnitCostPiasters = 5000,
                                BatchId = batch1.Id,
                                BatchNumber = batch1.BatchNumber
                            }
                        },
                        ControlledDispenses = new List<ControlledDrugDispense> { disp }
                    };

                    saleService.ProcessSale(unauthorizedSale);
                }
                catch (UnauthorizedAccessException ex)
                {
                    approvalBlocked = ex.Message.Contains("اعتماد الصيدلي المسؤول");
                }
                Assert(approvalBlocked, "طلب موافقة واعتماد الصيدلي بالرمز السري للكاشير غير المخول", result);

                // =========================================================================
                // Test Case 4: Successful Dispense with Encryption & Masking (Task 188-3 & 188-4)
                // =========================================================================
                // Configure supervisor pin
                byte[] saltBytes = new byte[16];
                using (var rng = new System.Security.Cryptography.RNGCryptoServiceProvider())
                {
                    rng.GetBytes(saltBytes);
                }
                var pbkdf2 = new System.Security.Cryptography.Rfc2898DeriveBytes("5566", saltBytes, 10000);
                byte[] hashBytes = pbkdf2.GetBytes(32);
                userRepo.UpdatePin(adminUser.Id, Convert.ToBase64String(hashBytes), Convert.ToBase64String(saltBytes));

                var validDispense = new ControlledDrugDispense
                {
                    ProductId = drugProd.Id,
                    ProductName = drugProd.Name,
                    QuantityMilli = 2000,
                    PatientName = "محمود السيد حسن",
                    PatientNationalId = "29905151234567", // 14 digits
                    PatientPhone = "01012345678",
                    DoctorName = "د. خالد عبد الرحمن",
                    DoctorLicenseNo = "DOC-7890",
                    PrescriptionNo = "RX-2026-99",
                    PrescriptionDate = "2026-10-24",
                    Notes = "صرف لتسكين آلام ما بعد العملية"
                };

                var approvedSale = new Sale
                {
                    Id = "sale_approved_ctrl_1",
                    CashierId = cashierUser.Id,
                    SupervisorPin = "5566", // Pharmacist PIN
                    ShiftId = shift.Id,
                    PaymentMethod = "cash",
                    Items = new List<SaleItem>
                    {
                        new SaleItem
                        {
                            ProductId = drugProd.Id,
                            ProductName = drugProd.Name,
                            QuantityMilli = 2000,
                            UnitPricePiasters = 7500,
                            UnitCostPiasters = 5000,
                            BatchId = batch1.Id,
                            BatchNumber = batch1.BatchNumber
                        }
                    },
                    ControlledDispenses = new List<ControlledDrugDispense> { validDispense }
                };

                var completedSale = saleService.ProcessSale(approvedSale);
                Assert(completedSale != null && completedSale.TotalPiasters == 15000, "إتمام بيع دواء الجدول بنجاح بعد اعتماد المشرف", result);

                // Check stored dispense record in DB
                var dispList = controlledRepo.GetBySaleId(completedSale.Id);
                Assert(dispList != null && dispList.Count == 1, "تسجيل قيد الصرف ذرياً داخل نفس معاملة الفاتورة", result);

                var storedDisp = dispList[0];
                Assert(!string.IsNullOrEmpty(storedDisp.PatientNationalIdMasked) && storedDisp.PatientNationalIdMasked.Contains("**"),
                    "تقنيع الرقم القومي في العرض وسجل التفتيش (29**********67)", result);
                Assert(storedDisp.PatientNationalId != "29905151234567",
                    "تشفير الرقم القومي للعميل بقاعدة البيانات وعدم حفظه بنص صريح", result);

                // Decrypt test with permission
                string decryptedId = encryptionService.DecryptString(storedDisp.PatientNationalId);
                Assert(decryptedId == "29905151234567", "فك تشفير الرقم القومي بنجاح لمن يملك صلاحية الاطلاع الكامل", result);

                // =========================================================================
                // Test Case 5: Controlled Drug Contra-Entry on Return (Task 188-5)
                // =========================================================================
                var retObj = new Return
                {
                    Id = "ret_ctrl_1",
                    SaleId = completedSale.Id,
                    CashierId = cashierUser.Id,
                    RefundMethod = "cash",
                    Reason = "استرجاع علبة غير مستخدمة بناءً على توصية الطبيب",
                    Items = new List<ReturnItem>
                    {
                        new ReturnItem
                        {
                            ProductId = drugProd.Id,
                            ProductName = drugProd.Name,
                            QuantityMilli = 1000, // 1 ampoule
                            UnitPricePiasters = 7500,
                            TotalPiasters = 7500,
                            BatchId = batch1.Id,
                            BatchNumber = batch1.BatchNumber
                        }
                    }
                };

                var completedRet = returnService.ProcessReturn(retObj, "5566");
                Assert(completedRet != null, "معالجة مرتجع دواء الجدول بنجاح باعتماد المشرف", result);

                // Verify contra-entry in controlled_dispenses
                var contraList = controlledRepo.GetDispenses(drugProd.Id, null, null, "return");
                Assert(contraList != null && contraList.Count == 1 && contraList[0].QuantityMilli == 1000,
                    "إنشاء قيد معاكس رسمي لمرتجع دواء الجدول في دفتر التفتيش الصيدلي", result);

                // =========================================================================
                // Test Case 6: Prescription Archiving & Image (Task 188-6)
                // =========================================================================
                var rx = new Prescription
                {
                    PatientName = "محمود السيد حسن",
                    DoctorName = "د. خالد عبد الرحمن",
                    PrescriptionNo = "RX-2026-99",
                    PrescriptionDate = "2026-10-24"
                };
                prescriptionService.SavePrescription(rx);
                Assert(!string.IsNullOrEmpty(rx.Id), "حفظ الروشتة الطبية وتوليد المعرف بنجاح", result);

                byte[] dummyImageBytes = new byte[] { 0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46 }; // Fake JPEG header
                string imgRelPath = prescriptionService.UploadImage(rx.Id, dummyImageBytes, "jpg");
                Assert(!string.IsNullOrEmpty(imgRelPath) && imgRelPath.Contains("prescriptions/"),
                    "أرشفة صورة الروشتة في مجلد البيانات المحلي المخصص للنسخ الاحتياطي", result);

                // =========================================================================
                // Test Case 7: Official Inspection Register Report (Task 188-7)
                // =========================================================================
                var report = controlledService.GetInspectionRegister(drugProd.Id, "2026-01-01", "2026-12-31");
                Assert(report != null && report.Count >= 3, "توليد تقرير دفتر التفتيش الصيدلي بحركات الصرف والمرتجع", result);

                // Row 1: Opening balance
                Assert(report[0].TransactionType == "opening_balance", "احتساب رصيد أول المدة بدقة", result);
                // Last row running balance calculation
                long lastBalance = report[report.Count - 1].RunningBalanceMilli;
                // Net outflow = 2000 (dispensed) - 1000 (returned) = 1000 net dispensed
                Assert(lastBalance == -1000, "مطابقة الرصيد التراكمي النهائي بعد حركة المنصرف والمرتجع", result);
            }
            catch (Exception ex)
            {
                result.Success = false;
                result.Message = "فشل في اختبار أدوية الجدول: " + ex.Message + "\n" + ex.StackTrace;
            }
            finally
            {
                try
                {
                    if (File.Exists(tempDbPath)) File.Delete(tempDbPath);
                }
                catch { }
            }

            return result;
        }

        private static void Assert(bool condition, string testName, ControlledDrugTestResult result)
        {
            result.TotalAssertions++;
            if (condition)
            {
                result.PassedAssertions++;
            }
            else
            {
                result.Success = false;
                if (string.IsNullOrEmpty(result.Message))
                {
                    result.Message = "فشل التحقق: " + testName;
                }
            }
        }
    }
}
