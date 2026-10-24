using System;
using System.Collections.Generic;
using System.IO;
using RafiqPOS.Common;
using RafiqPOS.Database;
using RafiqPOS.Models;
using RafiqPOS.Repositories;

namespace RafiqPOS.Services
{
    public class InsuranceTestResult
    {
        public bool Success { get; set; }
        public string Message { get; set; }
        public int TotalAssertions { get; set; }
        public int PassedAssertions { get; set; }
    }

    /// <summary>
    /// جناح الاختبارات الصارمة لمنظومة التأمين الطبي والتعاقدات ومطالبات الشركات (المحطة 13 - قصة 132 / ميزة 189)
    /// </summary>
    public static class InsuranceTestRunner
    {
        public static InsuranceTestResult RunAllTests()
        {
            var result = new InsuranceTestResult
            {
                Success = true,
                TotalAssertions = 0,
                PassedAssertions = 0
            };

            string tempDbPath = Path.Combine(Path.GetTempPath(), "rafiq_insurance_test_" + Guid.NewGuid().ToString("N") + ".db");
            string tempConnStr = string.Format("Data Source={0};Version=3;BusyTimeout=5000;", tempDbPath);

            try
            {
                // 1. Run migrations including Migration 48
                MigrationRunner.ApplyMigrations(tempConnStr, tempDbPath);
                Assert(File.Exists(tempDbPath), "إنشاء قاعدة البيانات وتطبيق ميجريشن التأمين الطبي 48 بنجاح", result);

                // 2. Setup repos & services
                var auditRepo = new AuditLogRepository(tempConnStr);
                var productRepo = new ProductRepository(tempConnStr, auditRepo);
                var categoryRepo = new CategoryRepository(tempConnStr);
                var saleRepo = new SaleRepository(tempConnStr, null, auditRepo);
                var insuranceRepo = new InsuranceRepository(tempConnStr);
                var expenseRepo = new ExpenseRepository(tempConnStr, auditRepo);
                var expenseService = new ExpenseService(expenseRepo, null);
                var insuranceService = new InsuranceService(insuranceRepo, expenseService, auditRepo);

                // Seed categories & products
                var catMeds = new Category { Id = "cat_meds", Name = "أدوية علاجية" };
                var catCosmetics = new Category { Id = "cat_cosmetics", Name = "مستحضرات تجميل" };
                categoryRepo.Upsert(catMeds);
                categoryRepo.Upsert(catCosmetics);

                var prodMed1 = new Product
                {
                    Id = "prod_panadol",
                    Name = "بنادول أزرق 500",
                    Barcode = "62210001",
                    CategoryId = "cat_meds",
                    PricePiasters = 5000, // 50.00 EGP
                    CostPiasters = 3500,
                    StockQuantityMilli = 100000,
                    IsActive = true
                };
                var prodMed2 = new Product
                {
                    Id = "prod_augmentin",
                    Name = "أوجمنتين 1 جم",
                    Barcode = "62210002",
                    CategoryId = "cat_meds",
                    PricePiasters = 12000, // 120.00 EGP
                    CostPiasters = 9000,
                    StockQuantityMilli = 100000,
                    IsActive = true
                };
                var prodCosmetic = new Product
                {
                    Id = "prod_sunscreen",
                    Name = "صن بلوك لاروش",
                    Barcode = "62210003",
                    CategoryId = "cat_cosmetics",
                    PricePiasters = 30000, // 300.00 EGP
                    CostPiasters = 22000,
                    StockQuantityMilli = 100000,
                    IsActive = true
                };
                productRepo.Upsert(prodMed1);
                productRepo.Upsert(prodMed2);
                productRepo.Upsert(prodCosmetic);

                // =========================================================================
                // Test 1: Company, Contract, Exclusions and Member Management
                // =========================================================================
                var comp1 = new InsuranceCompany
                {
                    Id = "comp_bupa",
                    Name = "شركة بوبا للتأمين الطبي",
                    Phone = "0225550000",
                    TaxNumber = "123-456-789",
                    IsActive = true
                };
                insuranceRepo.SaveCompany(comp1);

                var savedComp = insuranceRepo.GetCompanyById("comp_bupa");
                Assert(savedComp != null && savedComp.Name == "شركة بوبا للتأمين الطبي", "حفظ واسترجاع شركة التأمين بنجاح", result);

                var contract1 = new InsuranceContract
                {
                    Id = "cnt_bupa_gold",
                    CompanyId = "comp_bupa",
                    Name = "فئة الذهب - تغطية 80%",
                    PatientShareBps = 2000, // 20% patient co-pay, 80% company coverage
                    CapPerInvoicePiasters = 10000, // Max 100 EGP company cap per invoice
                    ExcludesCosmetics = true,
                    IsActive = true,
                    Exclusions = new List<InsuranceExclusion>
                    {
                        new InsuranceExclusion
                        {
                            Id = "excl_cosmetics",
                            ContractId = "cnt_bupa_gold",
                            CategoryId = "cat_cosmetics"
                        }
                    }
                };
                insuranceRepo.SaveContract(contract1);

                var savedContract = insuranceRepo.GetContractById("cnt_bupa_gold");
                Assert(savedContract != null && savedContract.PatientShareBps == 2000, "حفظ واسترجاع عقد التأمين مع نسبة التحمل", result);
                Assert(savedContract.Exclusions != null && savedContract.Exclusions.Count == 1, "حفظ استثناء مستحضرات التجميل المرتبط بالعقد", result);

                var member1 = new InsuranceMember
                {
                    Id = "mem_ahmed",
                    ContractId = "cnt_bupa_gold",
                    MemberName = "أحمد محمد كمال",
                    MemberNo = "CARD-998877",
                    NationalId = "29001011234567",
                    IsActive = true
                };
                insuranceRepo.SaveMember(member1);

                var savedMem = insuranceRepo.GetMemberByNo("CARD-998877");
                Assert(savedMem != null && savedMem.MemberName == "أحمد محمد كمال", "استرجاع بيانات المشترك برقم الكارنيه", result);

                // =========================================================================
                // Test 2: Precise Integer Co-Pay Calculation & Exclusions
                // =========================================================================
                // Basket 1: Panadol (50 EGP) + Augmentin (120 EGP) -> Total 170 EGP (17,000 piasters)
                // Both are covered. Company 80% = 13,600. But contract cap is 10,000 piasters!
                // So Company = 10,000 piasters (capped). Patient = 7,000 piasters (3,400 co-pay + 3,600 excess).
                var itemsBasket1 = new List<SaleItem>
                {
                    new SaleItem { ProductId = "prod_panadol", UnitPricePiasters = 5000, QuantityMilli = 1000, TotalPiasters = 5000 },
                    new SaleItem { ProductId = "prod_augmentin", UnitPricePiasters = 12000, QuantityMilli = 1000, TotalPiasters = 12000 }
                };
                var calc1 = insuranceRepo.CalculateSplit("cnt_bupa_gold", itemsBasket1);
                Assert(calc1.TotalInvoicePiasters == 17000, "إجمالي الروشتة 17,000 قرش", result);
                Assert(calc1.CapApplied, "تطبيق الحد الأقصى للتغطية (Cap) بنجاح", result);
                Assert(calc1.CompanyPiasters == 10000, "تحمل شركة التأمين محدد بسقف 10,000 قرش", result);
                Assert(calc1.PatientPiasters == 7000, "تحمل المريض 7,000 قرش (تشمل نسبة 20% + الزيادة فوق السقف)", result);
                Assert(calc1.PatientPiasters + calc1.CompanyPiasters == calc1.TotalInvoicePiasters, "تطابق المجموع الحسابي التام دون أي قرش فرق", result);

                // Basket 2: Panadol (50 EGP) + Sunblock (300 EGP - Excluded) -> Total 350 EGP (35,000 piasters)
                // Panadol: Covered (5000). Company 80% = 4,000, Patient 20% = 1,000.
                // Sunblock: Excluded (30000). Patient 100% = 30,000, Company = 0.
                // Total Patient = 31,000 piasters. Total Company = 4,000 piasters.
                var itemsBasket2 = new List<SaleItem>
                {
                    new SaleItem { ProductId = "prod_panadol", UnitPricePiasters = 5000, QuantityMilli = 1000, TotalPiasters = 5000 },
                    new SaleItem { ProductId = "prod_sunscreen", UnitPricePiasters = 30000, QuantityMilli = 1000, TotalPiasters = 30000 }
                };
                var calc2 = insuranceRepo.CalculateSplit("cnt_bupa_gold", itemsBasket2);
                Assert(calc2.TotalInvoicePiasters == 35000, "إجمالي سلة الأدوية والمستحضرات 35,000 قرش", result);
                Assert(calc2.CompanyPiasters == 4000, "تغطية التأمين 4,000 قرش فقط بسبب استثناء الصن بلوك", result);
                Assert(calc2.PatientPiasters == 31000, "تحمل المريض 31,000 قرش تشمل 100% من سعر المستحضر المستثنى", result);
                Assert(calc2.PatientPiasters + calc2.CompanyPiasters == calc2.TotalInvoicePiasters, "تطابق المبالغ الموزعة مع إجمالي الفاتورة", result);

                // Basket 3: Odd Arithmetic Test (Zero Drift)
                // Item total = 3333 piasters with 20% patient share (2000 bps)
                // Patient: (3333 * 2000 + 5000) / 10000 = 666.6 + 0.5 = 667 piasters.
                // Company: 3333 - 667 = 2666 piasters.
                var itemsOdd = new List<SaleItem>
                {
                    new SaleItem { ProductId = "prod_panadol", UnitPricePiasters = 3333, QuantityMilli = 1000, TotalPiasters = 3333 }
                };
                var calcOdd = insuranceRepo.CalculateSplit("cnt_bupa_gold", itemsOdd);
                Assert(calcOdd.CompanyPiasters == 2666, "حساب نصيب الشركة في الكسور الفردية 2666 قرش", result);
                Assert(calcOdd.PatientPiasters == 667, "حساب نصيب المريض في الكسور الفردية 667 قرش", result);
                Assert(calcOdd.CompanyPiasters + calcOdd.PatientPiasters == 3333, "انعدام أي فارق تقريب (Zero Drift)", result);

                // =========================================================================
                // Test 3: Atomic Sale Integration & Cash Drawer Isolation
                // =========================================================================
                var testSale = new Sale
                {
                    Id = "sale_ins_test_1",
                    InvoiceNumber = 101,
                    SubtotalPiasters = 17000,
                    TotalPiasters = 17000,
                    PaidPiasters = 17000,
                    DiscountPiasters = 0,
                    TaxPiasters = 0,
                    PaymentMethod = "insurance",
                    CreatedAt = DateTime.UtcNow.ToString("o"),
                    CashierId = "usr_admin_default",
                    ShiftId = "shift_test_1",
                    Items = itemsBasket1,
                    Payments = new List<SalePayment>
                    {
                        new SalePayment { Id = "pay_cash", Method = "cash", AmountPiasters = 7000 },
                        new SalePayment { Id = "pay_ins", Method = "insurance", AmountPiasters = 10000 }
                    },
                    InsuranceClaim = new InsuranceClaimLine
                    {
                        Id = "claim_line_1",
                        CompanyId = "comp_bupa",
                        ContractId = "cnt_bupa_gold",
                        MemberId = "mem_ahmed",
                        MemberNo = "CARD-998877",
                        ApprovalNo = "APPR-12345",
                        TotalInvoicePiasters = 17000,
                        CoveredPiasters = 17000,
                        PatientPiasters = 7000,
                        CompanyPiasters = 10000,
                        PatientName = "أحمد محمد كمال",
                        Status = "pending"
                    }
                };

                saleRepo.CreateSaleAtomic(testSale);

                // Assert claim line inserted in DB
                var pendingClaims = insuranceRepo.GetPendingClaimLines("comp_bupa");
                Assert(pendingClaims.Count == 1, "إدراج مطالبة التأمين ذرياً داخل المعاملة بحالة pending", result);
                Assert(pendingClaims[0].CompanyPiasters == 10000, "قيمة المطالبة المعلقة 10,000 قرش", result);

                // Test Cash Drawer Isolation
                DateTime nowWindow = DateTime.UtcNow;
                var drawerRes = DrawerCashCalculator.Calculate(tempConnStr, nowWindow.AddHours(-1), nowWindow.AddHours(1), "shift_test_1");
                Assert(drawerRes.CashSalesPiasters == 7000, "عزل كاش الدرج بدقة: احتساب نسبة المريض النقدية فقط (7000 قرش) واستبعاد حصة التأمين (10000 قرش) بالكامل", result);

                // =========================================================================
                // Test 4: Batch Creation and State Transition
                // =========================================================================
                var createdBatch = insuranceService.CreateBatch(
                    "comp_bupa",
                    "BATCH-2026-10",
                    "2026-10",
                    "مطالبة شهر أكتوبر",
                    new List<string> { "claim_line_1" },
                    "usr_admin_default"
                );

                Assert(createdBatch != null && createdBatch.Status == "submitted", "إنشاء مطالبة شهرية مجمعة للشركة وتحديث حالتها إلى submitted", result);
                Assert(createdBatch.TotalClaimsCount == 1, "عدد الفواتير في المطالبة المجمعة = 1", result);
                Assert(createdBatch.TotalAmountPiasters == 10000, "إجمالي قيمة المطالبة المجمعة 10,000 قرش", result);

                // Verify line status updated to batched
                var pendingAfterBatch = insuranceRepo.GetPendingClaimLines("comp_bupa");
                Assert(pendingAfterBatch.Count == 0, "تحويل حالة بند المطالبة إلى batched واختفاؤه من قائمة المعلق", result);

                // =========================================================================
                // Test 5: Batch Settlement and Expense Contra-Entry for Rejections
                // =========================================================================
                // Settle batch: 8,500 piasters settled, 1,500 piasters rejected (deducted as expense)
                var settledBatch = insuranceService.SettleBatch(
                    createdBatch.Id,
                    8500,
                    1500,
                    "أدوية غير مطابقة لبروتوكول العلاج",
                    "expense",
                    "usr_admin_default"
                );

                Assert(settledBatch.Status == "partially_settled" || settledBatch.Status == "settled", "تسوية المطالبة المجمعة بنجاح وتحديث حالتها", result);
                Assert(settledBatch.SettledAmountPiasters == 8500, "اعتماد 8,500 قرش في التسوية", result);
                Assert(settledBatch.RejectedAmountPiasters == 1500, "تسجيل 1,500 قرش مرفوضات", result);

                // Check that expense contra-entry was recorded in expenses table
                var expenses = expenseRepo.GetRecent(50);
                Assert(expenses.Count > 0, "تسجيل قيد مصروفات عكسي تلقائياً لمبلغ الرفوضات التأمينية", result);
                bool foundRejectionExpense = false;
                for (int ei = 0; ei < expenses.Count; ei++)
                {
                    if (expenses[ei].Category == "insurance_rejection" && expenses[ei].AmountPiasters == 1500)
                    {
                        foundRejectionExpense = true;
                        break;
                    }
                }
                Assert(foundRejectionExpense, "تسجيل قيد المصروف في تصنيف insurance_rejection بقيمة 1500 قرش بالضبط", result);

                // =========================================================================
                // Test 6: ClosedXML Professional Excel Export
                // =========================================================================
                string exportedExcel = insuranceService.ExportBatchToExcel(createdBatch.Id);
                Assert(File.Exists(exportedExcel), "توليد ملف إكسل رسمي لمطالبة التأمين بنجاح", result);
                var fi = new FileInfo(exportedExcel);
                Assert(fi.Length > 2000, "ملف الإكسل يحتوي على بيانات وتنسيقات جدولية كاملة", result);

                result.Message = string.Format("نجحت جميع اختبارات التأمين الطبي ({0}/{1}) بدون أي أخطاء", result.PassedAssertions, result.TotalAssertions);
            }
            catch (Exception ex)
            {
                result.Success = false;
                result.Message = "فشل في اختبار التأمين الطبي: " + ex.Message + "\n" + ex.StackTrace;
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
                }
            }

            return result;
        }

        private static void Assert(bool condition, string description, InsuranceTestResult result)
        {
            result.TotalAssertions++;
            if (condition)
            {
                result.PassedAssertions++;
            }
            else
            {
                result.Success = false;
                throw new Exception("فشل التحقق: " + description);
            }
        }
    }
}
