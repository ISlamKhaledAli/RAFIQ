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
                var counterRepo = new CounterRepository(tempConnStr);
                var settingsRepo = new SettingsRepository(tempConnStr);
                var batchRepo = new ProductBatchRepository(tempConnStr, auditRepo);
                var batchService = new ProductBatchService(batchRepo, settingsRepo);
                var saleRepo = new SaleRepository(tempConnStr, counterRepo, auditRepo, batchRepo);
                var saleService = new SaleService(saleRepo, prodRepo);
                var returnRepo = new ReturnRepository(tempConnStr, counterRepo, auditRepo);
                var returnService = new ReturnService(returnRepo, saleRepo);
                var heldRepo = new HeldSaleRepository(tempConnStr);
                var supplierRepo = new SupplierRepository(tempConnStr, auditRepo);
                var closingRepo = new DailyClosingRepository(tempConnStr);
                var closingService = new DailyClosingService(tempConnStr, closingRepo, counterRepo, auditRepo, settingsRepo);

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

                // =========================================================================
                // SCENARIO 6: منع اختلاس الدرج في المرتجعات للدفعات المتعددة (Split Payment Cash Fraud)
                // =========================================================================
                Console.WriteLine("--> Scenario 6: Multi-Payment Refund Cash Drawer Fraud Prevention");
                var multiSaleProduct = CreateTestProduct(prodRepo, "شاحن هاتف أصلي", "62299990001", 50000, 30000, 10000, "قطعة");

                var multiSale = new Sale
                {
                    Id = Guid.NewGuid().ToString(),
                    CashierId = "usr_tester",
                    CustomerId = "cust_general_cash",
                    CustomerName = "عميل نقدي",
                    SubtotalPiasters = 100000, // 1000.00 EGP (2 chargers)
                    TotalPiasters = 100000,
                    PaidPiasters = 100000,
                    ChangePiasters = 0,
                    PaymentMethod = "multi",
                    CreatedAt = DateTime.UtcNow.ToString("o")
                };
                multiSale.Items.Add(new SaleItem
                {
                    Id = Guid.NewGuid().ToString(),
                    SaleId = multiSale.Id,
                    ProductId = multiSaleProduct.Id,
                    ProductName = multiSaleProduct.Name,
                    QuantityMilli = 2000, // 2 units
                    UnitPricePiasters = 50000,
                    UnitCostPiasters = 30000,
                    TotalPiasters = 100000,
                    Unit = "قطعة",
                    ConversionFactor = 1
                });
                // Customer paid: 200 EGP Cash + 800 EGP Card
                multiSale.Payments.Add(new SalePayment
                {
                    Id = Guid.NewGuid().ToString(),
                    SaleId = multiSale.Id,
                    AmountPiasters = 20000, // 200 EGP
                    Method = "cash"
                });
                multiSale.Payments.Add(new SalePayment
                {
                    Id = Guid.NewGuid().ToString(),
                    SaleId = multiSale.Id,
                    AmountPiasters = 80000, // 800 EGP
                    Method = "card"
                });

                var createdMultiSale = saleService.ProcessSale(multiSale, "idemp_multi_sale_test");
                Assert(createdMultiSale != null && createdMultiSale.InvoiceNumber > 0, "تسجيل فاتورة الدفع المتعدد (200 ج.م كاش + 800 ج.م فيزا) بنجاح", result);

                // Attempt to return 1 item (500 EGP) asking for CASH refund (500 EGP) when cash paid was only 200 EGP!
                bool cashDrainBlocked = false;
                try
                {
                    var fraudReturn = new Return
                    {
                        SaleId = createdMultiSale.Id,
                        RefundMethod = "cash",
                        CashierId = "usr_tester",
                        Items = new List<ReturnItem>
                        {
                            new ReturnItem
                            {
                                ProductId = multiSaleProduct.Id,
                                ProductName = multiSaleProduct.Name,
                                QuantityMilli = 1000, // 1 unit = 500 EGP
                                UnitPricePiasters = 50000,
                                TotalPiasters = 50000,
                                Unit = "قطعة",
                                ConversionFactor = 1
                            }
                        }
                    };
                    returnService.ProcessReturn(fraudReturn);
                }
                catch (InvalidOperationException ex)
                {
                    cashDrainBlocked = true;
                    Assert(ex.Message.Contains("يتجاوز النقد المسدد فعلياً"), "حظر صرف مرتجع نقدي (500 ج.م) يتجاوز النقد الفعلي المسدد في الفاتورة (200 ج.م)", result);
                }
                Assert(cashDrainBlocked, "فشل عملية المرتجع النقدي الاحتيالي وحماية سيولة درج الكاشير", result);

                // Legitimate cash return test on split sale
                var cheapProduct = CreateTestProduct(prodRepo, "كيبل شحن سريع", "62299990002", 20000, 10000, 10000, "قطعة");
                var splitSale2 = new Sale
                {
                    Id = Guid.NewGuid().ToString(),
                    CashierId = "usr_tester",
                    CustomerId = debCustomer.Id,
                    CustomerName = debCustomer.Name,
                    SubtotalPiasters = 70000, // 700 EGP total
                    TotalPiasters = 70000,
                    PaidPiasters = 70000,
                    ChangePiasters = 0,
                    PaymentMethod = "multi",
                    CreatedAt = DateTime.UtcNow.ToString("o")
                };
                splitSale2.Items.Add(new SaleItem
                {
                    Id = Guid.NewGuid().ToString(),
                    SaleId = splitSale2.Id,
                    ProductId = cheapProduct.Id,
                    ProductName = cheapProduct.Name,
                    QuantityMilli = 1000,
                    UnitPricePiasters = 20000,
                    TotalPiasters = 20000,
                    Unit = "قطعة",
                    ConversionFactor = 1
                });
                splitSale2.Items.Add(new SaleItem
                {
                    Id = Guid.NewGuid().ToString(),
                    SaleId = splitSale2.Id,
                    ProductId = multiSaleProduct.Id,
                    ProductName = multiSaleProduct.Name,
                    QuantityMilli = 1000,
                    UnitPricePiasters = 50000,
                    TotalPiasters = 50000,
                    Unit = "قطعة",
                    ConversionFactor = 1
                });
                // Customer paid: 200 EGP Cash + 500 EGP Card
                splitSale2.Payments.Add(new SalePayment { Id = Guid.NewGuid().ToString(), SaleId = splitSale2.Id, AmountPiasters = 20000, Method = "cash" });
                splitSale2.Payments.Add(new SalePayment { Id = Guid.NewGuid().ToString(), SaleId = splitSale2.Id, AmountPiasters = 50000, Method = "card" });
                var createdSplit2 = saleService.ProcessSale(splitSale2, "idemp_split_sale_2");

                // Legitimate cash return of exactly 200 EGP:
                var legitCashRet = new Return
                {
                    SaleId = createdSplit2.Id,
                    RefundMethod = "cash",
                    CashierId = "usr_tester",
                    CustomerId = debCustomer.Id,
                    Items = new List<ReturnItem>
                    {
                        new ReturnItem
                        {
                            ProductId = cheapProduct.Id,
                            ProductName = cheapProduct.Name,
                            QuantityMilli = 1000,
                            UnitPricePiasters = 20000,
                            TotalPiasters = 20000,
                            Unit = "قطعة",
                            ConversionFactor = 1
                        }
                    }
                };
                var retRes1 = returnService.ProcessReturn(legitCashRet);
                Assert(retRes1 != null && retRes1.TotalPiasters == 20000, "صرف المرتجع النقدي المسموح به (200 ج.م) بنجاح كامل", result);

                // Now second return for the remaining item (500 EGP) asking for CASH must fail because cash ceiling is exhausted (200 - 200 = 0)
                bool secondCashBlocked = false;
                try
                {
                    var secondRetCash = new Return
                    {
                        SaleId = createdSplit2.Id,
                        RefundMethod = "cash",
                        CashierId = "usr_tester",
                        CustomerId = debCustomer.Id,
                        Items = new List<ReturnItem>
                        {
                            new ReturnItem
                            {
                                ProductId = multiSaleProduct.Id,
                                ProductName = multiSaleProduct.Name,
                                QuantityMilli = 1000,
                                UnitPricePiasters = 50000,
                                TotalPiasters = 50000,
                                Unit = "قطعة",
                                ConversionFactor = 1
                            }
                        }
                    };
                    returnService.ProcessReturn(secondRetCash);
                }
                catch (InvalidOperationException)
                {
                    secondCashBlocked = true;
                }
                Assert(secondCashBlocked, "حظر صرف مرتجع نقدي إضافي بعد استنفاد سقف النقد المسدد في الفاتورة", result);

                // But returning as credit to customer's balance must succeed!
                var legitCreditRet = new Return
                {
                    SaleId = createdSplit2.Id,
                    RefundMethod = "credit",
                    CashierId = "usr_tester",
                    CustomerId = debCustomer.Id,
                    Items = new List<ReturnItem>
                    {
                        new ReturnItem
                        {
                            ProductId = multiSaleProduct.Id,
                            ProductName = multiSaleProduct.Name,
                            QuantityMilli = 1000,
                            UnitPricePiasters = 50000,
                            TotalPiasters = 50000,
                            Unit = "قطعة",
                            ConversionFactor = 1
                        }
                    }
                };
                var retCreditRes = returnService.ProcessReturn(legitCreditRet);
                Assert(retCreditRes != null && retCreditRes.RefundMethod == "credit", "قبول المرتجع كرصيد آجل لحساب العميل بنجاح تام", result);

                // =========================================================================
                // SCENARIO 7: استعادة الدفعات FEFO عند المرتجع وتطابق أرصدة product_batches
                // =========================================================================
                Console.WriteLine("--> Scenario 7: Product Batches FEFO Restoration on Customer Return");
                var batchedProd = CreateTestProduct(prodRepo, "مكمل غذائي فيتامين سي", "62288880001", 12000, 8000, 15000, "علبة");

                var b1 = batchRepo.CreateOrUpdateBatch(new ProductBatch
                {
                    ProductId = batchedProd.Id,
                    BatchNumber = "VITC-BATCH-01",
                    ExpiryDate = "2026-11-01",
                    QuantityMilli = 5000, // 5 units
                    CostPricePiasters = 8000,
                    Status = "ACTIVE"
                });
                var b2 = batchRepo.CreateOrUpdateBatch(new ProductBatch
                {
                    ProductId = batchedProd.Id,
                    BatchNumber = "VITC-BATCH-02",
                    ExpiryDate = "2026-12-01",
                    QuantityMilli = 10000, // 10 units
                    CostPricePiasters = 8000,
                    Status = "ACTIVE"
                });

                // Sell 7 units: FEFO consumes 5 from b1 (depleted) and 2 from b2 (8 remaining)
                var batchSale = new Sale
                {
                    Id = Guid.NewGuid().ToString(),
                    CashierId = "usr_tester",
                    SubtotalPiasters = 84000,
                    TotalPiasters = 84000,
                    PaidPiasters = 84000,
                    PaymentMethod = "cash",
                    CreatedAt = DateTime.UtcNow.ToString("o")
                };
                batchSale.Items.Add(new SaleItem
                {
                    Id = Guid.NewGuid().ToString(),
                    SaleId = batchSale.Id,
                    ProductId = batchedProd.Id,
                    ProductName = batchedProd.Name,
                    QuantityMilli = 7000,
                    UnitPricePiasters = 12000,
                    UnitCostPiasters = 8000,
                    TotalPiasters = 84000,
                    Unit = "علبة",
                    ConversionFactor = 1
                });
                var processedBatchSale = saleService.ProcessSale(batchSale, "idemp_batch_sale");
                Assert(processedBatchSale != null, "إتمام بيع 7 وحدات من صنف الدفعات بنجاح", result);

                var reloadedB1AfterSale = batchRepo.GetById(b1.Id);
                var reloadedB2AfterSale = batchRepo.GetById(b2.Id);
                Assert(reloadedB1AfterSale.QuantityMilli == 0 && reloadedB1AfterSale.Status == "DEPLETED", "استنفاد الدفعة الأولى بالكامل حسب FEFO وتحويل حالتها إلى DEPLETED", result);
                Assert(reloadedB2AfterSale.QuantityMilli == 8000 && reloadedB2AfterSale.Status == "ACTIVE", "خصم المتبقي من الدفعة الثانية وتحديث رصيدها إلى 8000 milli", result);

                // Return 3 units undamaged
                var batchReturn = new Return
                {
                    SaleId = processedBatchSale.Id,
                    RefundMethod = "cash",
                    CashierId = "usr_tester",
                    Items = new List<ReturnItem>
                    {
                        new ReturnItem
                        {
                            ProductId = batchedProd.Id,
                            ProductName = batchedProd.Name,
                            QuantityMilli = 3000,
                            UnitPricePiasters = 12000,
                            TotalPiasters = 36000,
                            Unit = "علبة",
                            ConversionFactor = 1,
                            IsDamaged = false
                        }
                    }
                };
                var retBatchRes = returnService.ProcessReturn(batchReturn);
                Assert(retBatchRes != null, "تسجيل مرتجع سليم لـ 3 وحدات من صنف الدفعات", result);

                // Check batches after return: total batches quantity must equal reloaded product stock (11 units = 11000 milli)
                var reloadedBatchedProd = prodRepo.GetById(batchedProd.Id);
                var allBatchesAfterReturn = batchRepo.GetByProductId(batchedProd.Id, false);
                long totalBatchStockMilli = 0;
                for (int bIdx = 0; bIdx < allBatchesAfterReturn.Count; bIdx++)
                {
                    totalBatchStockMilli += allBatchesAfterReturn[bIdx].QuantityMilli;
                }

                Assert(reloadedBatchedProd.StockQuantityMilli == 11000, "تحديث رصيد الصنف في products إلى 11000 milli بعد المرتجع", result);
                Assert(totalBatchStockMilli == 11000, "استعادة الدفعات في product_batches وتطابق مجموعها (11000 milli) مع رصيد المنتج بنسبة 100%", result);

                // =========================================================================
                // SCENARIO 8: إتلاف دفعة منتهية الصلاحية والتطابق المحاسبي لسجل حركات المخزون
                // =========================================================================
                Console.WriteLine("--> Scenario 8: Expired Batch Disposal & Stock Movements Ledger Invariant");
                var expiredProd = CreateTestProduct(prodRepo, "حليب معقم كامل الدسم", "62277770001", 4500, 3500, 6000, "علبة");
                var expBatch = batchRepo.CreateOrUpdateBatch(new ProductBatch
                {
                    ProductId = expiredProd.Id,
                    BatchNumber = "MILK-EXP-01",
                    ExpiryDate = "2026-01-01",
                    QuantityMilli = 6000,
                    CostPricePiasters = 3500,
                    Status = "ACTIVE"
                });

                batchService.DisposeExpiredBatch(expBatch.Id, "تلف بسبب انتهاء تاريخ الصلاحية", "usr_tester");
                var reloadedExpBatch = batchRepo.GetById(expBatch.Id);
                var reloadedExpProd = prodRepo.GetById(expiredProd.Id);

                Assert(reloadedExpBatch.QuantityMilli == 0 && reloadedExpBatch.Status == "EXPIRED", "تصفير رصيد الدفعة التالفة وتحديث حالتها إلى EXPIRED", result);
                Assert(reloadedExpProd.StockQuantityMilli == 0, "خصم الكمية التالفة من رصيد الصنف ليصبح 0", result);

                // Verify stock movements ledger integrity: no discrepancies
                var batchDiscrepancies = movementRepo.CheckDiscrepancies();
                Assert(batchDiscrepancies.Count == 0, "تطابق 100% بين products و stock_movements بعد إتلاف الدفعة المنتهية دون أي انحراف محاسبي", result);

                // =========================================================================
                // SCENARIO 9: حفظ وتحديث الفواتير المعلقة بدون تعارض (Held Sales UPSERT Idempotency)
                // =========================================================================
                Console.WriteLine("--> Scenario 9: Held Sale Save & Resave Idempotency");
                string heldId = "held_senior_test_1";
                var heldSale = new HeldSale
                {
                    Id = heldId,
                    HoldLabel = "تعليق زبون مستعجل",
                    ItemsCount = 2,
                    SubtotalPiasters = 15000,
                    TotalPiasters = 15000,
                    CartJson = "[{\"productId\":\"p1\",\"qty\":2}]",
                    Notes = "أول تعليق",
                    CashierId = "usr_tester"
                };
                heldRepo.SaveHeldSale(heldSale);

                // Cashier recalls and resaves with updated note and total
                heldSale.Notes = "تم تعديل الفاتورة وإضافة صنف";
                heldSale.TotalPiasters = 25000;
                heldSale.ItemsCount = 3;
                heldRepo.SaveHeldSale(heldSale); // Must NOT throw SQL UNIQUE constraint exception

                var heldList = heldRepo.GetHeldSales();
                var foundHeld = heldList.Find(delegate(HeldSale hs) { return hs.Id == heldId; });
                Assert(foundHeld != null && foundHeld.TotalPiasters == 25000 && foundHeld.Notes == "تم تعديل الفاتورة وإضافة صنف", "تحديث الفاتورة المعلقة بنفس المعرف بنجاح دون أي خطأ قيد فريد", result);

                // =========================================================================
                // SCENARIO 10: سداد الموردين والتوثيق الذري في Audit Log وعزو المستخدم
                // =========================================================================
                Console.WriteLine("--> Scenario 10: Supplier Payment Atomic Audit Logging & User Attribution");
                var supp = supplierRepo.Save(new Supplier
                {
                    Name = "شركة النصر للألبان والتجارة",
                    Phone = "01099998888",
                    BalancePiasters = 100000 // We owe 1000.00 EGP
                }, "usr_tester");
                Assert(supp != null && supp.BalancePiasters == 100000, "تسجيل المورد برصيد افتتاحي 1000 ج.م بنجاح", result);

                // Pay 400.00 EGP with audit user attribution
                supplierRepo.RecordPayment(supp.Id, 40000, "دفعة نقدية تحت الحساب", "usr_senior_accountant");
                var reloadedSupp = supplierRepo.GetById(supp.Id);
                Assert(reloadedSupp.BalancePiasters == 60000, "تخفيض مديونية المورد إلى 600 ج.م بعد السداد", result);

                // Check supplier transactions
                var suppTx = supplierRepo.GetTransactions(supp.Id, 10);
                Assert(suppTx.Count >= 1 && suppTx[0].TransactionType == "PAYMENT" && suppTx[0].AmountPiasters == -40000, "تسجيل حركة السداد في جدول supplier_transactions بدقة", result);

                // Check audit logs
                var recentAudits = auditRepo.GetLogs(20, null);
                var paymentAudit = recentAudits.Find(delegate(AuditLog al) { return al.Action == "supplier_payment" && al.EntityId == supp.Id; });
                Assert(paymentAudit != null && paymentAudit.UserId == "usr_senior_accountant", "توثيق حركة سداد المورد ذرياً في سجل الرقابة مع عزو المستخدم بدقة", result);

                // =========================================================================
                // SCENARIO 11: دقة احتساب نقدية الدرج في الإغلاق اليومي للفواتير المتعددة (Multi Cash-out Net of Change)
                // =========================================================================
                Console.WriteLine("--> Scenario 11: Multi-Payment Daily Closing Net Drawer Cash Calculation");
                string todayDate = closingService.GetCurrentBusinessDate();
                var closeProd = CreateTestProduct(prodRepo, "شاي أسود ناعم", "62266660001", 2500, 1800, 50000, "باكو");

                // Sale total 50.00 EGP (5000 piasters). Customer gives: 30 EGP card + 30 EGP cash (Total paid 60 EGP, Change 10 EGP cash returned)
                // Net cash received in drawer from this sale is 30 - 10 = 20 EGP (2000 piasters).
                var multiCloseSale = new Sale
                {
                    Id = Guid.NewGuid().ToString(),
                    CashierId = "usr_tester",
                    SubtotalPiasters = 5000,
                    TotalPiasters = 5000,
                    PaidPiasters = 6000,
                    ChangePiasters = 1000,
                    PaymentMethod = "multi",
                    CreatedAt = DateTime.UtcNow.ToString("o")
                };
                multiCloseSale.Items.Add(new SaleItem
                {
                    Id = Guid.NewGuid().ToString(),
                    SaleId = multiCloseSale.Id,
                    ProductId = closeProd.Id,
                    ProductName = closeProd.Name,
                    QuantityMilli = 2000,
                    UnitPricePiasters = 2500,
                    TotalPiasters = 5000,
                    Unit = "باكو",
                    ConversionFactor = 1
                });
                multiCloseSale.Payments.Add(new SalePayment { Id = Guid.NewGuid().ToString(), SaleId = multiCloseSale.Id, AmountPiasters = 3000, Method = "card" });
                multiCloseSale.Payments.Add(new SalePayment { Id = Guid.NewGuid().ToString(), SaleId = multiCloseSale.Id, AmountPiasters = 3000, Method = "cash" });

                var processedCloseSale = saleService.ProcessSale(multiCloseSale, "idemp_close_multi");
                Assert(processedCloseSale != null && processedCloseSale.ChangePiasters == 1000, "تسجيل فاتورة متعددة بدفع نقدي وإرجاع فكة 10 ج.م بنجاح", result);

                var preview = closingService.GetClosingPreview(todayDate);
                Assert(preview.TotalSalesPiasters > 0, "احتساب إجمالي المبيعات في معاينة الإغلاق اليومي", result);
                Assert(preview.CardSalesPiasters >= 3000, "احتساب مبيعات الفيزا بدقة (30 ج.م على الأقل)", result);
                Assert(preview.ExpectedCashPiasters >= 2000, "احتساب نقدية الدرج المتوقعة مخصوماً منها الفكة المستردة (20 ج.م صافي بدلاً من 30 ج.م)", result);

                // =========================================================================
                // SCENARIO 12: إلغاء دفعات العملاء وضبط نقدية الإغلاق اليومي والملخص المالي
                // =========================================================================
                Console.WriteLine("--> Scenario 12: Customer Payment Cancellation & Daily Closing Net Drawer Integrity");
                var custService = new CustomerService(custRepo);
                var cancelCust = new Customer
                {
                    Name = "عميل سداد ملغي",
                    Phone = "01099998888",
                    BalancePiasters = 100000, // 1000 EGP debt
                    CreditLimitPiasters = 500000
                };
                cancelCust = custRepo.SaveCustomer(cancelCust);

                // Collect payment of 30,000 piasters (300 EGP) in cash
                custService.RecordPayment(cancelCust.Id, 30000, "سداد نقدي من العميل");
                var previewAfterPay = closingService.GetClosingPreview(todayDate);
                Assert(previewAfterPay.DebtPaymentsPiasters >= 30000, "احتساب دفعة العميل النقدية في نقدية الدرج قبل الإلغاء", result);

                // Cashier cancels the payment via contra-entry
                var ledgerEntries = custService.GetStatement(cancelCust.Id, 10);
                CustomerLedgerEntry payEntry = null;
                for (int leIdx = 0; leIdx < ledgerEntries.Count; leIdx++)
                {
                    if (ledgerEntries[leIdx].Type == "payment")
                    {
                        payEntry = ledgerEntries[leIdx];
                        break;
                    }
                }
                Assert(payEntry != null, "العثور على حركة السداد الأصلية لإلغائها", result);
                custService.CancelPayment(cancelCust.Id, payEntry.Id, "سجلت بالخطأ", "كاشير الصباح");

                // Preview closing again: debt_payments should net out to 0!
                var previewAfterCancel = closingService.GetClosingPreview(todayDate);
                Assert(previewAfterCancel.DebtPaymentsPiasters == 0, "خصم القيد المعاكس payment_cancel من تحصيلات الديون بالإغلاق اليومي بدقة", result);

                var repService = new ReportsService(tempConnStr);
                var summaryAfterCancel = repService.GetTodaySummary();
                Assert(summaryAfterCancel.TodayDebtPaymentsPiasters == 0, "خصم القيد المعاكس في تقرير الملخص المالي اليومي", result);

                var custVerify = custService.VerifyBalance(cancelCust.Id);
                Assert(custVerify.IsBalanced && custVerify.StoredBalancePiasters == 100000, "تطابق رصيد العميل بعد الإلغاء مع دفتر الأستاذ (1000 ج.م)", result);

                // =========================================================================
                // SCENARIO 13: التحقق الذاتي من دفتر أستاذ الموردين واستشفاء انحرافات الرصيد
                // =========================================================================
                Console.WriteLine("--> Scenario 13: Supplier Ledger Verification & Self-Healing");
                var supplierService = new SupplierService(supplierRepo);
                var supDrift = new Supplier
                {
                    Name = "مورد ألبان الواحة",
                    Phone = "01155554444",
                    CompanyName = "ألبان الواحة",
                    BalancePiasters = 50000,
                    IsActive = true
                };
                supDrift = supplierService.Save(supDrift);

                // Record payment 20,000 piasters
                supplierService.RecordPayment(supDrift.Id, 20000, "سداد دفعة من الحساب", "usr_tester");
                var supVer1 = supplierService.VerifyBalance(supDrift.Id);
                Assert(supVer1.IsBalanced && supVer1.StoredBalancePiasters == 30000 && supVer1.CalculatedBalancePiasters == 30000, "تطابق رصيد المورد مع حركات دفتر الأستاذ بدقة", result);

                // Inject simulated drift into database
                using (var driftConn = new SQLiteConnection(tempConnStr))
                {
                    driftConn.Open();
                    using (var driftCmd = new SQLiteCommand("UPDATE suppliers SET balance_piasters = 99999 WHERE id = @id;", driftConn))
                    {
                        driftCmd.Parameters.AddWithValue("@id", supDrift.Id);
                        driftCmd.ExecuteNonQuery();
                    }
                }

                var supVer2 = supplierService.VerifyBalance(supDrift.Id);
                Assert(!supVer2.IsBalanced && supVer2.DiscrepancyPiasters == 69999, "كشف انحراف رصيد المورد المحاكى عن دفتر الأستاذ", result);

                var supDiscrepancies = supplierService.CheckDiscrepancies();
                Assert(supDiscrepancies.Count > 0, "إدراج المورد في قائمة الانحرافات المالية المكتشفة", result);

                // Auto-repair and reconcile balance
                var healedSup = supplierService.RecalculateAndFixBalance(supDrift.Id, "usr_tester");
                Assert(healedSup.BalancePiasters == 30000, "إعادة مواءمة رصيد المورد التالف تلقائياً إلى 30,000 قرش من دفتر الأستاذ", result);

                var supVer3 = supplierService.VerifyBalance(supDrift.Id);
                Assert(supVer3.IsBalanced && supVer3.DiscrepancyPiasters == 0, "استعادة توازن دفتر أستاذ المورد بعد المعالجة الذاتية بنسبة 100%", result);

                // =========================================================================
                // SCENARIO 14: مزامنة الوحدة الأساسية للمنتج مع جدول المنتجات عند التغيير والتعديل
                // =========================================================================
                Console.WriteLine("--> Scenario 14: Multi-Unit Base Unit Reassignment Synchronization");
                var orangeProd = CreateTestProduct(prodRepo, "عصير برتقال طبيعي", "62277770001", 1500, 1000, 100000, "علبة");
                var baseUnit = unitRepo.GetBaseUnit(orangeProd.Id);
                Assert(baseUnit != null && baseUnit.UnitName == "علبة", "إنشاء الوحدة الأساسية الافتراضية 'علبة' تلقائياً عند استيراد المنتج", result);

                var cartonUnit = new ProductUnit
                {
                    ProductId = orangeProd.Id,
                    UnitName = "كرتونة",
                    ConversionFactor = 24,
                    IsBaseUnit = false,
                    SellPricePiasters = 33000,
                    CostPricePiasters = 22000,
                    IsDivisible = false,
                    SortOrder = 2
                };
                unitRepo.Create(cartonUnit);

                // Reassign base unit to Carton
                unitRepo.SetBaseUnit(orangeProd.Id, cartonUnit.Id);

                var freshProd = prodRepo.GetById(orangeProd.Id);
                Assert(freshProd.Unit == "كرتونة", "مزامنة الوحدة الأساسية في جدول المنتجات إلى 'كرتونة'", result);
                Assert(freshProd.PricePiasters == 33000, "مزامنة سعر بيع الوحدة الأساسية الجديدة في جدول المنتجات (330 ج.م)", result);
                Assert(freshProd.CostPiasters == 22000, "مزامنة تكلفة الوحدة الأساسية الجديدة في جدول المنتجات (220 ج.م)", result);

                // Edit carton price via unitRepo.Update
                cartonUnit.SellPricePiasters = 34000;
                unitRepo.Update(cartonUnit);
                var freshProd2 = prodRepo.GetById(orangeProd.Id);
                Assert(freshProd2.PricePiasters == 34000, "تحديث سعر المنتج الرئيسي تلقائياً عند تعديل سعر الوحدة الأساسية", result);

                // =========================================================================
                // SCENARIO 15: حظر الماكينات الموقوفة والرصيد غير الكافي في ماكينات الدفع والتدقيق
                // =========================================================================
                Console.WriteLine("--> Scenario 15: E-Pay Inactive Terminal Guard & Audit Trail");
                var epayRepo = new EpayRepository(tempConnStr, auditRepo);
                var term = new EpayTerminal
                {
                    Name = "ماكينة فوري تجريبية",
                    Provider = "fawry",
                    BalancePiasters = 50000, // 500 EGP
                    IsActive = false
                };
                term = epayRepo.SaveTerminal(term);

                // Attempt transaction on inactive terminal
                bool inactiveBlocked = false;
                try
                {
                    epayRepo.CreateTransaction(new EpayTransaction
                    {
                        TerminalId = term.Id,
                        ServiceType = "bill_payment",
                        BillAmountPiasters = 10000,
                        CustomerFeePiasters = 500,
                        ProviderCommissionPiasters = 200,
                        CashierName = "كاشير تجريبي"
                    });
                }
                catch (InvalidOperationException ex)
                {
                    if (ex.Message.Contains("موقوفة ومُعطلة")) inactiveBlocked = true;
                }
                Assert(inactiveBlocked, "حظر إجراء أي معاملات على ماكينات الدفع الإلكتروني الموقوفة", result);

                // Activate terminal
                term.IsActive = true;
                term = epayRepo.SaveTerminal(term);

                // Attempt transaction exceeding balance
                bool overbalanceBlocked = false;
                try
                {
                    epayRepo.CreateTransaction(new EpayTransaction
                    {
                        TerminalId = term.Id,
                        ServiceType = "bill_payment",
                        BillAmountPiasters = 60000,
                        CustomerFeePiasters = 500,
                        ProviderCommissionPiasters = 200,
                        MachineDeductedPiasters = 59800,
                        CashierName = "كاشير تجريبي"
                    });
                }
                catch (InvalidOperationException ex)
                {
                    if (ex.Message.Contains("غير كافٍ")) overbalanceBlocked = true;
                }
                Assert(overbalanceBlocked, "حظر المعاملات التي تتجاوز رصيد ماكينة الدفع الإلكتروني المسبقة الدفع", result);

                // Fund terminal with 50,000 piasters (500 EGP)
                var funding = epayRepo.FundTerminal(term.Id, 50000, "cash_drawer", "تغذية رصيد الماكينة", "usr_tester");
                Assert(funding.NewBalancePiasters == 100000, "تغذية رصيد الماكينة بنجاح إلى 1,000 ج.م", result);

                // Create valid bill transaction
                var epayTx = epayRepo.CreateTransaction(new EpayTransaction
                {
                    TerminalId = term.Id,
                    ServiceType = "bill_payment",
                    ServiceName = "فاتورة كهرباء",
                    BillAmountPiasters = 20000,
                    CustomerFeePiasters = 500,
                    ProviderCommissionPiasters = 200,
                    MachineDeductedPiasters = 19800,
                    CashierName = "كاشير تجريبي"
                });
                Assert(epayTx != null && epayTx.NetProfitPiasters == 700, "تسجيل معاملة الدفع الإلكتروني واحتساب صافي الربح 7 ج.م بدقة", result);

                var termUpdated = epayRepo.GetTerminalById(term.Id);
                Assert(termUpdated.BalancePiasters == 80200, "خصم الرصيد من الماكينة بدقة (100,000 - 19,800 = 80,200 قرش)", result);

                var epayAudits = auditRepo.GetLogs(10, "epay_terminal_fund");
                Assert(epayAudits.Count > 0, "تسجيل عملية تغذية الماكينة في سجل التدقيق الأمني المشفر", result);

                // =========================================================================
                // SCENARIO 16: السداد بالزيادة للموردين وتكوين رصيد دائن لصالحنا بدفتر الأستاذ
                // =========================================================================
                Console.WriteLine("--> Scenario 16: Supplier Purchase Overpayment & Advance Credit Invariant");
                var advSupplier = new Supplier
                {
                    Name = "شركة النيل للتوزيع",
                    Phone = "01233332222",
                    CompanyName = "النيل",
                    BalancePiasters = 0,
                    IsActive = true
                };
                advSupplier = supplierRepo.Save(advSupplier);

                var advProd = CreateTestProduct(prodRepo, "بسكويت سادة", "62288880001", 500, 350, 10000, "علبة");
                var purchaseRepo = new PurchaseRepository(tempConnStr, counterRepo, supplierRepo, priceHistRepo, auditRepo, batchRepo);

                var purchaseInvoice = new Purchase
                {
                    SupplierId = advSupplier.Id,
                    SupplierName = advSupplier.Name,
                    TotalCostPiasters = 3500, // 35.00 EGP net cost
                    DiscountPiasters = 0,
                    NetCostPiasters = 3500,
                    PaidAmountPiasters = 5000, // 50.00 EGP paid (15.00 EGP advance credit)
                    CreatedAt = DateTime.UtcNow.ToString("o")
                };
                purchaseInvoice.Items.Add(new PurchaseItem
                {
                    ProductId = advProd.Id,
                    ProductName = advProd.Name,
                    QuantityMilli = 10000,
                    UnitCostPiasters = 350,
                    TotalCostPiasters = 3500,
                    CreatedAt = purchaseInvoice.CreatedAt
                });

                var createdPurchase = purchaseRepo.CreatePurchase(purchaseInvoice, "LATEST", "usr_tester");
                Assert(createdPurchase != null && createdPurchase.InvoiceNumber > 0, "تسجيل فاتورة الشراء بسداد بالزيادة بنجاح", result);

                var freshAdvSup = supplierRepo.GetById(advSupplier.Id);
                Assert(freshAdvSup.BalancePiasters == -1500, "تحويل رصيد المورد إلى دائن لصالحنا (-15.00 ج.م) بدقة تامة", result);

                var advSupVerify = supplierRepo.VerifyBalance(advSupplier.Id);
                Assert(advSupVerify.IsBalanced && advSupVerify.StoredBalancePiasters == -1500 && advSupVerify.CalculatedBalancePiasters == -1500, "تطابق رصيد المورد الدائن مع حركة PURCHASE_OVERPAYMENT في دفتر الأستاذ", result);

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
        private static Product CreateTestProduct(ProductRepository prodRepo, string name, string barcode, long price, long cost, long stockMilli, string unit)
        {
            var items = new List<BatchImportItem>();
            items.Add(new BatchImportItem
            {
                Name = name,
                Barcode = barcode,
                PricePiasters = price,
                CostPiasters = cost,
                StockQuantityMilli = stockMilli,
                Unit = unit ?? "قطعة"
            });
            prodRepo.ImportBatchAtomic(items, "skip");
            return prodRepo.GetByBarcode(barcode);
        }
    }
}
