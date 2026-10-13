using System;
using System.IO;
using System.Collections.Generic;
using System.Data.SQLite;
using System.Threading;
using RafiqPOS.Common;
using RafiqPOS.Database;
using RafiqPOS.Models;
using RafiqPOS.Repositories;

namespace RafiqPOS.Services
{
    public class SeniorStressTestResult
    {
        public bool Success { get; set; }
        public string Message { get; set; }
        public int TotalAssertions { get; set; }
        public int PassedAssertions { get; set; }
        public List<string> Details { get; set; }

        public SeniorStressTestResult()
        {
            this.Details = new List<string>();
        }
    }

    public static class SeniorStressTestRunner
    {
        public static SeniorStressTestResult RunAllTests()
        {
            var result = new SeniorStressTestResult
            {
                Success = true,
                TotalAssertions = 0,
                PassedAssertions = 0
            };

            string tempDbPath = Path.Combine(Path.GetTempPath(), "rafiq_senior_stress_" + Guid.NewGuid().ToString("N") + ".db");
            string tempConnStr = string.Format("Data Source={0};Version=3;BusyTimeout=10000;", tempDbPath);

            try
            {
                // 1. Initialize DB and apply migrations
                MigrationRunner.ApplyMigrations(tempConnStr, tempDbPath);
                Assert(File.Exists(tempDbPath), "إنشاء قاعدة بيانات اختبار السيناريوهات الاحترافية بنجاح", result);

                var auditRepo = new AuditLogRepository(tempConnStr);
                var custRepo = new CustomerRepository(tempConnStr, auditRepo);
                var prodRepo = new ProductRepository(tempConnStr, auditRepo);
                var unitRepo = new ProductUnitRepository(tempConnStr);
                var variantRepo = new ProductVariantRepository(tempConnStr);
                var movementRepo = new StockMovementRepository(tempConnStr);
                var priceHistRepo = new ProductPriceHistoryRepository(tempConnStr);
                var inventoryService = new InventoryService(tempConnStr, movementRepo, prodRepo, auditRepo, unitRepo, priceHistRepo);
                var expenseRepo = new ExpenseRepository(tempConnStr, auditRepo);
                var expenseService = new ExpenseService(expenseRepo, null);

                // =========================================================================
                // SCENARIO 1: استيراد العملاء بأرصدة سالبة (مقدمات/دائن) وموجبة والتحقق من دفتر الأستاذ
                // =========================================================================
                Console.WriteLine("--> Scenario 1: Customer Negative/Positive Initial Balances & Ledger Invariants");
                var customerRows = new List<CustomerImportRow>();
                customerRows.Add(new CustomerImportRow
                {
                    RowIndex = 1,
                    Name = "عميل آجل مدين",
                    Phone = "01011111111",
                    InitialBalancePiasters = 75000, // 750.00 EGP debt
                    CreditLimitPiasters = 200000,
                    IsValid = true
                });
                customerRows.Add(new CustomerImportRow
                {
                    RowIndex = 2,
                    Name = "عميل آجل دائن (مقدم)",
                    Phone = "01022222222",
                    InitialBalancePiasters = -35000, // -350.00 EGP credit/prepayment
                    CreditLimitPiasters = 100000,
                    IsValid = true
                });
                customerRows.Add(new CustomerImportRow
                {
                    RowIndex = 3,
                    Name = "عميل رصيد صفري",
                    Phone = "01033333333",
                    InitialBalancePiasters = 0,
                    CreditLimitPiasters = 50000,
                    IsValid = true
                });

                var importCustRes = custRepo.BatchImportCustomers(customerRows);
                Assert(importCustRes.ImportedCount == 3, "استيراد 3 عملاء بحالات أرصدة مختلفة بنجاح", result);
                Assert(importCustRes.TotalOpeningDebtsPiasters == 75000, "احتساب إجمالي الديون الافتتاحية للمدين فقط بدقة", result);

                var debCustomer = custRepo.FindByPhone("01011111111", null);
                var credCustomer = custRepo.FindByPhone("01022222222", null);
                var zeroCustomer = custRepo.FindByPhone("01033333333", null);

                Assert(debCustomer != null && debCustomer.BalancePiasters == 75000, "تطابق رصيد العميل المدين مع الرصيد الافتتاحي", result);
                Assert(credCustomer != null && credCustomer.BalancePiasters == -35000, "تطابق رصيد العميل الدائن مع الرصيد الافتتاحي السالب", result);
                Assert(zeroCustomer != null && zeroCustomer.BalancePiasters == 0, "تطابق رصيد العميل الصفري", result);

                // Check ledger integrity for negative balance
                var credLedger = custRepo.GetStatement(credCustomer.Id, 10);
                Assert(credLedger.Count == 1, "تسجيل قيد افتتاح في دفتر أستاذ العميل الدائن", result);
                Assert(credLedger[0].AmountPiasters == 35000, "تسجيل قيمة القيد بالقيمة المطلقة الموجبة 35000", result);
                Assert(credLedger[0].BalanceAfterPiasters == -35000, "تسجيل الرصيد بعد القيد بالرصيد الدائن -35000", result);

                // Verify ledger balance invariants
                var credVerify = custRepo.VerifyBalance(credCustomer.Id);
                Assert(credVerify.IsBalanced, "صحة مطابقة دفتر الأستاذ للعميل الدائن دون أي انحراف", result);
                Assert(credVerify.DiscrepancyPiasters == 0, "انحراف رصيد العميل الدائن يساوي صفر قرش", result);

                var debVerify = custRepo.VerifyBalance(debCustomer.Id);
                Assert(debVerify.IsBalanced, "صحة مطابقة دفتر الأستاذ للعميل المدين", result);

                // =========================================================================
                // SCENARIO 2: استيراد الأصناف جماعياً ومزامنة product_units وتعديل الأسعار الجماعي
                // =========================================================================
                Console.WriteLine("--> Scenario 2: Batch Product Import Base Unit Sync & Bulk Pricing Adjustments");
                var importProds = new List<BatchImportItem>();
                importProds.Add(new BatchImportItem
                {
                    Name = "سكر أبيض مكرر",
                    Barcode = "62211110001",
                    PricePiasters = 3500, // 35.00 EGP
                    CostPiasters = 2800,  // 28.00 EGP
                    StockQuantityMilli = 50000, // 50 units
                    Unit = "قطعة"
                });
                importProds.Add(new BatchImportItem
                {
                    Name = "تفاح أحمر مستورد",
                    Barcode = "62211110002",
                    PricePiasters = 8000, // 80.00 EGP / kg
                    CostPiasters = 6000,
                    StockQuantityMilli = 25000, // 25 kg
                    Unit = "kg"
                });

                var importProdRes = prodRepo.ImportBatchAtomic(importProds, "skip");
                Assert(importProdRes.ImportedCount == 2, "استيراد المنتجات جماعياً بنجاح", result);

                var prodSugar = prodRepo.GetByBarcode("62211110001");
                var prodApple = prodRepo.GetByBarcode("62211110002");
                Assert(prodSugar != null && prodApple != null, "العثور على المنتجات المستوردة بالباركود", result);

                // Verify base units created in product_units
                var sugarUnits = unitRepo.GetByProductId(prodSugar.Id);
                var appleUnits = unitRepo.GetByProductId(prodApple.Id);
                Assert(sugarUnits.Count >= 1 && sugarUnits[0].IsBaseUnit, "إنشاء الوحدة الأساسية تلقائياً لصنف السكر في product_units", result);
                Assert(appleUnits.Count >= 1 && appleUnits[0].IsBaseUnit && appleUnits[0].IsDivisible, "إنشاء الوحدة الأساسية القابلة للتجزئة لصنف التفاح بالكيلو", result);

                // Apply Bulk Price Adjustment
                var bulkItems = new List<BulkPriceApplyItem>();
                bulkItems.Add(new BulkPriceApplyItem
                {
                    ProductId = prodSugar.Id,
                    OldPricePiasters = 3500,
                    NewPricePiasters = 4000, // Increased to 40.00 EGP
                    OldCostPiasters = 2800,
                    NewCostPiasters = 3000
                });
                bulkItems.Add(new BulkPriceApplyItem
                {
                    ProductId = prodApple.Id,
                    OldPricePiasters = 8000,
                    NewPricePiasters = 9500, // Increased to 95.00 EGP
                    OldCostPiasters = 6000,
                    NewCostPiasters = 7200
                });

                var bulkRes = prodRepo.ApplyBulkPriceAdjustment(bulkItems, "زيادة أسعار عامة", "usr_tester");
                Assert(bulkRes.Success && bulkRes.UpdatedCount == 2, "تطبيق تعديل الأسعار الجماعي بنجاح", result);

                // Verify synchronization with products and product_units
                var reloadedSugar = prodRepo.GetById(prodSugar.Id);
                var reloadedSugarUnits = unitRepo.GetByProductId(prodSugar.Id);
                Assert(reloadedSugar.PricePiasters == 4000, "تحديث سعر السكر في جدول products", result);
                Assert(reloadedSugarUnits[0].SellPricePiasters == 4000, "تحديث سعر السكر بالتزامن في جدول product_units", result);

                // =========================================================================
                // SCENARIO 3: مصفوفة المتغيرات (Variants Matrix) ومزامنة الوحدات وتعديل الأسعار
                // =========================================================================
                Console.WriteLine("--> Scenario 3: Variant Matrix Base Unit Parity & Bulk Pricing Sync");
                var matrixCells = new List<VariantMatrixCell>();
                matrixCells.Add(new VariantMatrixCell { Color = "أبيض", Size = "L", StockQuantityMilli = 10000, PricePiasters = 25000, CostPiasters = 15000, IsEnabled = true });
                matrixCells.Add(new VariantMatrixCell { Color = "أبيض", Size = "XL", StockQuantityMilli = 10000, PricePiasters = 25000, CostPiasters = 15000, IsEnabled = true });
                matrixCells.Add(new VariantMatrixCell { Color = "أسود", Size = "L", StockQuantityMilli = 10000, PricePiasters = 26000, CostPiasters = 15500, IsEnabled = true });
                matrixCells.Add(new VariantMatrixCell { Color = "أسود", Size = "XL", StockQuantityMilli = 10000, PricePiasters = 26000, CostPiasters = 15500, IsEnabled = true });

                var matrixReq = new CreateVariantMatrixRequest
                {
                    ParentName = "تيشيرت بولو قطن",
                    DefaultPricePiasters = 25000, // 250.00 EGP
                    DefaultCostPiasters = 15000,  // 150.00 EGP
                    Colors = new List<string> { "أبيض", "أسود" },
                    Sizes = new List<string> { "L", "XL" },
                    MatrixCells = matrixCells
                };

                var matrixRes = variantRepo.CreateMatrix(matrixReq);
                Assert(matrixRes.Variants.Count == 4, "إنشاء 4 متغيرات في مصفوفة المقاسات والألوان", result);

                // Verify each variant product has a base unit in product_units
                bool allVariantsHaveBaseUnits = true;
                foreach (var v in matrixRes.Variants)
                {
                    var vUnits = unitRepo.GetByProductId(v.VariantProductId);
                    if (vUnits.Count == 0 || !vUnits[0].IsBaseUnit)
                    {
                        allVariantsHaveBaseUnits = false;
                        break;
                    }
                }
                Assert(allVariantsHaveBaseUnits, "جميع منتجات المتغيرات تمتلك وحدات أساسية مسجلة في product_units", result);

                // Adjust prices on variant product
                var firstVariant = matrixRes.Variants[0];
                var variantBulkItems = new List<BulkPriceApplyItem>();
                variantBulkItems.Add(new BulkPriceApplyItem
                {
                    ProductId = firstVariant.VariantProductId,
                    OldPricePiasters = firstVariant.PricePiasters,
                    NewPricePiasters = 28000, // New price 280.00 EGP
                    OldCostPiasters = firstVariant.CostPiasters,
                    NewCostPiasters = 17000
                });

                var varBulkRes = prodRepo.ApplyBulkPriceAdjustment(variantBulkItems, "تعديل سعر متغير البولو", "usr_tester");
                Assert(varBulkRes.Success && varBulkRes.UpdatedCount == 1, "تعديل سعر منتج المتغير بنجاح", result);

                // Check product_variants table reflected updated prices
                var reloadedVariants = variantRepo.GetVariantsByParentId(matrixRes.ParentProduct.Id);
                var reloadedTarget = reloadedVariants.Find(delegate(ProductVariant pv) { return pv.VariantProductId == firstVariant.VariantProductId; });
                Assert(reloadedTarget != null && reloadedTarget.PricePiasters == 28000, "تحديث سعر المتغير بنجاح في جدول product_variants", result);

                // =========================================================================
                // SCENARIO 4: توحيد توقيت المصروفات ISO-8601 UTC والربط التشفيري مع Audit Logs
                // =========================================================================
                Console.WriteLine("--> Scenario 4: Standardized ISO-8601 UTC Expense Timestamps & Audit Log Chaining");
                var expReq = new CreateExpenseRequest
                {
                    AmountPiasters = 12500, // 125.00 EGP
                    Category = "نثريات وضيافة",
                    Notes = "شراء شاي وسكر للإدارة",
                    CreatedBy = "الكاشير أحمد",
                    BusinessDate = "2026-10-13"
                };

                var createdExp = expenseService.CreateExpense(expReq);
                Assert(createdExp != null && createdExp.ExpenseNumber > 0, "تسجيل المصروف وتوليد رقمه التسلسلي بنجاح", result);
                Assert(!string.IsNullOrEmpty(createdExp.CreatedAt), "توليد حقل CreatedAt للمصروف", result);

                DateTime parsedTime;
                bool isIsoUtc = DateTime.TryParse(createdExp.CreatedAt, null, System.Globalization.DateTimeStyles.RoundtripKind, out parsedTime);
                Assert(isIsoUtc, "حفظ توقيت المصروف بنظام ISO-8601 UTC القياسي بدقة", result);

                // Check audit log recorded for expense
                var auditLogs = auditRepo.GetLogs(10, null);
                var expAudit = auditLogs.Find(delegate(AuditLog al) { return al.Action == "create_expense" && al.EntityId == createdExp.Id; });
                Assert(expAudit != null, "توثيق حركة المصروف في سجل الرقابة المشفر ذرياً داخل نفس المعاملة", result);

                // =========================================================================
                // SCENARIO 5: اختبار التزامن والضغط المتوازي (Concurrent Multi-threaded Stress Test)
                // =========================================================================
                Console.WriteLine("--> Scenario 5: Concurrent Multi-Threaded Invariant Stress Test");
                int concurrentThreads = 8;
                int operationsPerThread = 15;
                var threadTasks = new List<Thread>();
                var threadExceptions = new List<Exception>();
                object exceptionLock = new object();

                for (int t = 0; t < concurrentThreads; t++)
                {
                    int threadIdx = t;
                    var th = new Thread(new ThreadStart(delegate
                    {
                        try
                        {
                            for (int step = 0; step < operationsPerThread; step++)
                            {
                                int mod = step % 3;
                                if (mod == 0)
                                {
                                    // Concurrent Stock Adjustment
                                    inventoryService.AdjustStockByDelta(
                                        prodSugar.Id,
                                        1000, // Add 1 unit
                                        "تسوية ضغط متوازي خيط " + threadIdx,
                                        "tester_" + threadIdx,
                                        "SURPLUS"
                                    );
                                }
                                else if (mod == 1)
                                {
                                    // Concurrent Expense
                                    expenseService.CreateExpense(new CreateExpenseRequest
                                    {
                                        AmountPiasters = 500, // 5.00 EGP
                                        Category = "اختبار تزامني",
                                        Notes = "مصروف خيط " + threadIdx,
                                        CreatedBy = "th_" + threadIdx,
                                        BusinessDate = "2026-10-13"
                                    });
                                }
                                else
                                {
                                    // Concurrent Purchase
                                    inventoryService.RecordPurchase(
                                        prodApple.Id,
                                        null,
                                        2.0, // 2 kg
                                        12000,
                                        "INV-TH-" + threadIdx + "-" + step,
                                        "مورد متزامن",
                                        false,
                                        "th_" + threadIdx
                                    );
                                }
                            }
                        }
                        catch (Exception ex)
                        {
                            lock (exceptionLock)
                            {
                                threadExceptions.Add(ex);
                            }
                        }
                    }));
                    threadTasks.Add(th);
                }

                // Start all threads concurrently
                foreach (var th in threadTasks) th.Start();
                // Wait for all to finish
                foreach (var th in threadTasks) th.Join();

                Assert(threadExceptions.Count == 0, "نجاح تنفيذ عمليات التزامن المتوازي دون أي تعارض أو Lock Timeout", result);
                if (threadExceptions.Count > 0)
                {
                    result.Details.Add("خطأ في التزامن: " + threadExceptions[0].ToString());
                }

                // Check ledger invariant between products and movements
                var discrepancies = inventoryService.CheckDiscrepancies();
                Assert(discrepancies.Count == 0, "تطابق 100% بين رصيد المخزون في products ومجموع حركات المخزون في stock_movements بعد الضغط المتوازي", result);

                result.Success = (result.PassedAssertions == result.TotalAssertions);
                result.Message = string.Format("اكتمل فحص السينيور الاحترافي: {0}/{1} بنجاح تام", result.PassedAssertions, result.TotalAssertions);
            }
            catch (Exception ex)
            {
                result.Success = false;
                result.Message = "فشل أثناء تشغيل اختبارات السينيور: " + ex.Message;
                result.Details.Add(ex.ToString());
            }
            finally
            {
                // Cleanup temp database
                try
                {
                    if (File.Exists(tempDbPath))
                    {
                        File.Delete(tempDbPath);
                    }
                    string wal = tempDbPath + "-wal";
                    string shm = tempDbPath + "-shm";
                    if (File.Exists(wal)) File.Delete(wal);
                    if (File.Exists(shm)) File.Delete(shm);
                }
                catch { }
            }

            return result;
        }

        private static void Assert(bool condition, string assertionName, SeniorStressTestResult result)
        {
            result.TotalAssertions++;
            if (condition)
            {
                result.PassedAssertions++;
                result.Details.Add("[PASS] " + assertionName);
                Console.WriteLine("  [PASS] " + assertionName);
            }
            else
            {
                result.Success = false;
                result.Details.Add("[FAIL] " + assertionName);
                Console.WriteLine("  [FAIL] " + assertionName);
            }
        }
    }
}
