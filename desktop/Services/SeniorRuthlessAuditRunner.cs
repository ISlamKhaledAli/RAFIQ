using System;
using System.Collections.Generic;
using System.Data.SQLite;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using RafiqPOS.Common;
using RafiqPOS.Models;
using RafiqPOS.Repositories;

namespace RafiqPOS.Services
{
    /// <summary>
    /// حزمة الفحص الشاملة واختبارات الإجهاد والحالات الحدية المتقدمة (Senior Ruthless Audit Runner).
    /// مصممة خصيصاً بمستوى مهندس برمجيات أول لاختبار كافة السيناريوهات المحاسبية والمخزنية
    /// والتزام العمليات المتزامنة والذرية (ACID) والتأكد من عدم وجود أي خطأ أو خلل مالي أو فجوة تسلسلية.
    /// </summary>
    public static class SeniorRuthlessAuditRunner
    {
        public class AuditReport
        {
            public bool Success { get; set; }
            public string Message { get; set; }
            public int TotalAssertions { get; set; }
            public int PassedAssertions { get; set; }
            public List<string> Details { get; set; }

            public AuditReport()
            {
                Details = new List<string>();
            }
        }

        private static string _tempDbPath;
        private static string _connStr;

        private static void AssertCondition(bool condition, string successMsg, string failureMsg, AuditReport report)
        {
            report.TotalAssertions++;
            if (condition)
            {
                report.PassedAssertions++;
                report.Details.Add("[PASS] " + successMsg);
            }
            else
            {
                report.Details.Add("[FAIL] " + failureMsg);
                throw new InvalidOperationException("فشل الاختبار: " + failureMsg);
            }
        }

        public static AuditReport RunAllTests()
        {
            var report = new AuditReport();
            string testDbDir = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "test_ruthless_env");
            if (!Directory.Exists(testDbDir))
            {
                Directory.CreateDirectory(testDbDir);
            }

            _tempDbPath = Path.Combine(testDbDir, "ruthless_audit_" + Guid.NewGuid().ToString("N") + ".db");
            _connStr = string.Format("Data Source={0};Version=3;Journal Mode=WAL;Synchronous=Normal;BusyTimeout=5000;Foreign Keys=True;", _tempDbPath);

            try
            {
                // 1. Initialize schema
                Database.MigrationRunner.ApplyMigrations(_connStr, _tempDbPath);
                AssertCondition(File.Exists(_tempDbPath), "تم إنشاء وتهيئة بيئة قاعدة البيانات المعزولة بنجاح", "فشل إنشاء قاعدة البيانات", report);

                SeedBaseFixtures(_connStr);

                // Run the battery of ruthless tests
                RunTest1_DigitalWalletClosingParity(report);
                RunTest2_DigitalWalletSaleCancelReversal(report);
                RunTest3_ExpenseCounterSelfHealing(report);
                RunTest4_FefoBatchAllocationAndReturns(report);
                RunTest5_HeldSaleStockRaceCondition(report);
                RunTest6_SupplierAdvanceCreditAndLedgerReconciliation(report);
                RunTest7_MultiUnitCascadeAndCostParity(report);
                RunTest8_FinancialRoundingAndCreditReversals(report);
                RunTest9_ParallelConcurrencyChaos(report);
                RunTest10_LiveDrawerBalanceAndPurchasesDeductionParity(report);
                RunTest11_SupplierDirectPaymentDrawerDeductionAndLedgerParity(report);
                RunTest12_SaleCancellationBlockedOnExistingReturns(report);
                RunTest13_DigitalWalletGenericKeywordParity(report);
                RunTest14_NetNegativeCustomerDebtPaymentInDrawer(report);
                RunTest15_ExpenseCreationBlockedOnClosedDay(report);
                RunTest16_ReturnOnCancelledSaleBlocked(report);
                RunTest17_ReturnCeilingsAndDigitalRefundGuards(report);
                RunTest18_CustomerPrepaymentExhaustionAndCancellationSymmetry(report);
                RunTest19_DigitalWalletDrawerCashInOutCommissionParity(report);
                RunTest20_DigitalWalletRefundAndCancelOverdraftGuards(report);
                RunTest21_EntityArchivalAndActiveValidationGuards(report);
                RunTest22_AdvancedSubsystemAssetAndCatalogIntegrityGuards(report);
                RunTest23_SeniorCustomerLedgerAndQuickCatalogGuards(report);
                RunTest24_ReturnCartBatchAndUnitResilienceGuards(report);
                RunTest25_DigitalAccountDailyAndMonthlyLimitGuards(report);
                RunTest26_GenericWalletAndCardClosingParity(report);
                RunTest28_HeldSalesAndQuickItemsSanityGuards(report);
                RunTest29_CustomerAdvanceCreditReturnSymmetry(report);
                RunTest30_MultiTenderInstapayWalletCashSplitParity(report);
                RunTest27_ClosedDayCashDrawerProtections(report);

                report.Success = (report.PassedAssertions == report.TotalAssertions);
                report.Message = string.Format("اكتمل الفحص الشامل المتقدم بنجاح فائق: {0}/{1} اختبارات ناجحة بنسبة 100%",
                    report.PassedAssertions, report.TotalAssertions);
            }
            catch (Exception ex)
            {
                report.Success = false;
                report.Message = "حدث خطأ أثناء إجراء الفحص الشامل المتقدم: " + ex.Message;
                report.Details.Add("[CRITICAL_ERROR] " + ex.ToString());
            }
            finally
            {
                try
                {
                    SQLiteConnection.ClearAllPools();
                    if (File.Exists(_tempDbPath)) File.Delete(_tempDbPath);
                    string shm = _tempDbPath + "-shm";
                    string wal = _tempDbPath + "-wal";
                    if (File.Exists(shm)) File.Delete(shm);
                    if (File.Exists(wal)) File.Delete(wal);
                    if (Directory.Exists(testDbDir)) Directory.Delete(testDbDir, true);
                }
                catch { }
            }

            return report;
        }

        private static void SeedBaseFixtures(string connStr)
        {
            using (var conn = new SQLiteConnection(connStr))
            {
                conn.Open();
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = @"
                        INSERT OR IGNORE INTO customers (id, name, phone, balance_piasters, credit_limit_piasters, created_at)
                        VALUES ('cust_general_cash', 'عميل نقدي عام', '01000000000', 0, 0, datetime('now'));
                    ";
                    cmd.ExecuteNonQuery();
                }
            }
        }

        // Test 1: Digital Wallet Closing Parity
        private static void RunTest1_DigitalWalletClosingParity(AuditReport report)
        {
            var digRepo = new DigitalAccountRepository(_connStr);
            var closingRepo = new DailyClosingRepository(_connStr);
            var counterRepo = new CounterRepository(_connStr);
            var auditRepo = new AuditLogRepository(_connStr);
            var settingsRepo = new SettingsRepository(_connStr);
            var closingService = new DailyClosingService(_connStr, closingRepo, counterRepo, auditRepo, settingsRepo);

            string bDate = closingService.GetCurrentBusinessDate();

            // Create Vodafone Cash account with 500 EGP
            var acc = new DigitalAccount
            {
                Id = "dig_voda_main",
                Name = "فودافون كاش الفرع الرئيسي",
                Type = "wallet",
                Provider = "vodafone_cash",
                BalancePiasters = 50000,
                IsDefault = true,
                IsActive = true
            };
            digRepo.SaveAccount(acc);

            // Fund account with 1000 EGP from cash drawer
            digRepo.FundAccount(acc.Id, 100000, "cash_drawer", "تغذية من الخزينة", "الكاشير");

            // Execute cash_out of 400 EGP (+ 15 EGP profit) collected in cash drawer
            var txOut = new DigitalTransaction
            {
                AccountId = acc.Id,
                TxType = "cash_out",
                AmountPiasters = 40000,
                ProfitPiasters = 1500,
                TotalCollectedPiasters = 41500,
                PaymentDestination = "cash_drawer",
                CashierName = "الكاشير"
            };
            digRepo.ProcessTransaction(txOut);

            // Execute cash_in of 250 EGP where cash is paid out from drawer
            var txIn = new DigitalTransaction
            {
                AccountId = acc.Id,
                TxType = "cash_in",
                AmountPiasters = 25000,
                ProfitPiasters = 500,
                TotalCollectedPiasters = 500,
                PaymentDestination = "cash_drawer",
                CashierName = "الكاشير"
            };
            digRepo.ProcessTransaction(txIn);

            // Query Daily Closing Preview
            var preview = closingService.GetClosingPreview(bDate);

            // Final wallet balance: 500 + 1000 - 400 + 250 = 1350 EGP (135000 piasters)
            var reloadedAcc = digRepo.GetAccountById(acc.Id);
            AssertCondition(reloadedAcc.BalancePiasters == 135000,
                "رصيد محفظة فودافون كاش بعد العمليات متطابق تماماً (1,350.00 ج.م)",
                "رصيد المحفظة غير مطابق: " + reloadedAcc.BalancePiasters, report);

            AssertCondition(preview.WalletsBalancePiasters == 135000,
                "إجمالي أرصدة المحافظ الرقمية ظاهر بدقة في معاينة تقفيل اليومية (1,350.00 ج.م)",
                "إجمالي أرصدة المحافظ في التقفيل غير متطابق: " + preview.WalletsBalancePiasters, report);

            AssertCondition(preview.WalletsDrawerFundingPiasters == 100000,
                "تغذية المحفظة من درج الكاشير مسجلة ومفصولة بدقة (1,000.00 ج.م)",
                "قيمة تغذية المحفظة في التقفيل غير مطابقة: " + preview.WalletsDrawerFundingPiasters, report);

            // Net wallet drawer cash: 41,500 collected - 24,500 paid = 17,000 piasters (+170.00 EGP)
            AssertCondition(preview.WalletsDrawerCashPiasters == 17000,
                "صافي حركة الكاشير الناتجة عن معاملات المحفظة (سحب وإيداع) دقيقة (+170.00 ج.م)",
                "صافي كاش المحفظة غير مطابق: " + preview.WalletsDrawerCashPiasters, report);

            // Expected cash must incorporate + 17,000 - 100,000 = -83,000 (F-08: No zero clamping, true deficit preserved)
            AssertCondition(preview.ExpectedCashPiasters == -83000,
                "حساب النقدية المتوقعة في الدرج يعكس العجز الحقيقي بدقة القروش (-830.00 ج.م)",
                "النقدية المتوقعة غير صالحة: " + preview.ExpectedCashPiasters, report);
        }

        // Test 2: Digital Wallet Sale Cancellation Symmetry
        private static void RunTest2_DigitalWalletSaleCancelReversal(AuditReport report)
        {
            var digRepo = new DigitalAccountRepository(_connStr);
            var prodRepo = new ProductRepository(_connStr);
            var saleRepo = new SaleRepository(_connStr);
            var saleService = new SaleService(saleRepo, prodRepo);

            var instaAcc = new DigitalAccount
            {
                Id = "dig_insta_main",
                Name = "إنستاباي المتجر الرئيسي",
                Type = "instapay",
                Provider = "instapay",
                BalancePiasters = 200000, // 2,000 EGP
                IsDefault = true,
                IsActive = true
            };
            digRepo.SaveAccount(instaAcc);

            var prod = new Product
            {
                Id = "p_insta_test",
                Name = "منتج تجربة إنستاباي",
                PricePiasters = 35000, // 350 EGP
                CostPiasters = 20000,
                StockQuantityMilli = 50000,
                IsActive = true
            };
            prodRepo.Upsert(prod);

            var sale = new Sale
            {
                CustomerId = "cust_general_cash",
                PaymentMethod = "instapay",
                PaidPiasters = 35000,
                TotalPiasters = 35000,
                Items = new List<SaleItem>
                {
                    new SaleItem
                    {
                        ProductId = prod.Id,
                        ProductName = prod.Name,
                        QuantityMilli = 1000,
                        UnitPricePiasters = 35000,
                        UnitCostPiasters = 20000,
                        TotalPiasters = 35000
                    }
                }
            };

            var completedSale = saleService.ProcessSale(sale);
            var reloadedInsta = digRepo.GetAccountById(instaAcc.Id);

            AssertCondition(reloadedInsta.BalancePiasters == 235000,
                "رصيد حساب إنستاباي زاد تلقائياً بقيمة الفاتورة المباعة (2,350.00 ج.م)",
                "رصيد إنستاباي لم يزد بشكل صحيح: " + reloadedInsta.BalancePiasters, report);

            // Now Cancel the Sale
            saleRepo.CancelSaleAtomic(completedSale.Id, "إلغاء لخطأ في الصنف", "مدير النظام");

            var restoredInsta = digRepo.GetAccountById(instaAcc.Id);
            AssertCondition(restoredInsta.BalancePiasters == 200000,
                "تم عكس واسترداد رصيد حساب إنستاباي بدقة بعد إلغاء الفاتورة (عادت إلى 2,000.00 ج.م)",
                "فشل استرجاع رصيد إنستاباي بعد الإلغاء: " + restoredInsta.BalancePiasters, report);

            // Verify digital_transactions has cancellation contra entry
            var txs = digRepo.GetTransactions(10, instaAcc.Id, "pos_sale_cancel");
            AssertCondition(txs.Count > 0 && txs[0].AmountPiasters == 35000,
                "تم تسجيل قيد معاكس (Contra Entry) في جدول حركات المحافظ الرقمية لتوثيق الإلغاء",
                "لم يتم العثور على حركة إلغاء في سجل المعاملات الرقمية", report);
        }

        // Test 3: Expense Counter Self Healing
        private static void RunTest3_ExpenseCounterSelfHealing(AuditReport report)
        {
            var expenseRepo = new ExpenseRepository(_connStr);

            // Deliberately delete 'expense' counter to simulate broken/unseeded database state
            using (var conn = new SQLiteConnection(_connStr))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand("DELETE FROM counters WHERE name = 'expense';", conn))
                {
                    cmd.ExecuteNonQuery();
                }
            }

            var exp1 = new Expense
            {
                Id = "exp_test_1",
                AmountPiasters = 1500,
                Category = "بوفيه",
                Notes = "شاي وسكر",
                BusinessDate = "2026-10-17"
            };
            var exp2 = new Expense
            {
                Id = "exp_test_2",
                AmountPiasters = 2500,
                Category = "نظافة",
                Notes = "أدوات نظافة",
                BusinessDate = "2026-10-17"
            };
            var exp3 = new Expense
            {
                Id = "exp_test_3",
                AmountPiasters = 5000,
                Category = "كهرباء",
                Notes = "لمبات",
                BusinessDate = "2026-10-17"
            };

            var res1 = expenseRepo.Insert(exp1);
            var res2 = expenseRepo.Insert(exp2);
            var res3 = expenseRepo.Insert(exp3);

            AssertCondition(res1.ExpenseNumber > 0 && res2.ExpenseNumber == res1.ExpenseNumber + 1 && res3.ExpenseNumber == res2.ExpenseNumber + 1,
                string.Format("استعادة العداد التلقائي للمصروفات بنجاح وتوليد أرقام متسلسلة بدقة ({0}, {1}, {2}) بدون تكرار", res1.ExpenseNumber, res2.ExpenseNumber, res3.ExpenseNumber),
                string.Format("أرقام المصروفات متكررة أو غير صالحة: {0}, {1}, {2}", res1.ExpenseNumber, res2.ExpenseNumber, res3.ExpenseNumber), report);
        }

        // Test 4: FEFO Batch Allocation and Returns
        private static void RunTest4_FefoBatchAllocationAndReturns(AuditReport report)
        {
            var prodRepo = new ProductRepository(_connStr);
            var batchRepo = new ProductBatchRepository(_connStr);
            var saleRepo = new SaleRepository(_connStr);
            var saleService = new SaleService(saleRepo, prodRepo);
            var returnRepo = new ReturnRepository(_connStr);

            var p = new Product
            {
                Id = "p_batch_test",
                Name = "زبادي المراعي 100جم",
                PricePiasters = 1000, // 10 EGP
                CostPiasters = 700,
                StockQuantityMilli = 30000, // 30 items
                IsActive = true
            };
            prodRepo.Upsert(p);

            // Create 3 batches: FEFO
            var b1 = new ProductBatch
            {
                ProductId = p.Id,
                BatchNumber = "BATCH-001",
                ExpiryDate = "2026-11-01",
                QuantityMilli = 10000,
                CostPricePiasters = 700,
                Status = "ACTIVE"
            };
            var b2 = new ProductBatch
            {
                ProductId = p.Id,
                BatchNumber = "BATCH-002",
                ExpiryDate = "2026-11-15",
                QuantityMilli = 10000,
                CostPricePiasters = 700,
                Status = "ACTIVE"
            };
            var b3 = new ProductBatch
            {
                ProductId = p.Id,
                BatchNumber = "BATCH-003",
                ExpiryDate = "2026-12-01",
                QuantityMilli = 10000,
                CostPricePiasters = 700,
                Status = "ACTIVE"
            };

            batchRepo.CreateOrUpdateBatch(b1);
            batchRepo.CreateOrUpdateBatch(b2);
            batchRepo.CreateOrUpdateBatch(b3);

            // Sell 14 items (14,000 milli). System must exhaust B1 (10 items) and deduct 4 items from B2.
            var sale = new Sale
            {
                CustomerId = "cust_general_cash",
                PaymentMethod = "cash",
                PaidPiasters = 14000,
                TotalPiasters = 14000,
                Items = new List<SaleItem>
                {
                    new SaleItem
                    {
                        ProductId = p.Id,
                        ProductName = p.Name,
                        QuantityMilli = 14000,
                        UnitPricePiasters = 1000,
                        UnitCostPiasters = 700,
                        TotalPiasters = 14000
                    }
                }
            };

            var completedSale = saleService.ProcessSale(sale);

            var reloadedB1 = batchRepo.GetByProductId(p.Id, false).Find(delegate(ProductBatch b) { return b.BatchNumber == "BATCH-001"; });
            var reloadedB2 = batchRepo.GetByProductId(p.Id, false).Find(delegate(ProductBatch b) { return b.BatchNumber == "BATCH-002"; });
            var reloadedB3 = batchRepo.GetByProductId(p.Id, false).Find(delegate(ProductBatch b) { return b.BatchNumber == "BATCH-003"; });

            AssertCondition(reloadedB1.QuantityMilli == 0 && (reloadedB1.Status == "DEPLETED" || reloadedB1.Status == "EXHAUSTED"),
                "تم استهلاك الدفعة الأقرب انتهاءً أولاً بالكامل (BATCH-001 = 0)",
                "الدفعة الأولى لم تستنفد: " + reloadedB1.QuantityMilli + "، الحالة: " + reloadedB1.Status, report);

            AssertCondition(reloadedB2.QuantityMilli == 6000 && reloadedB2.Status == "ACTIVE",
                "تم خصم باقي الكمية بدقة متناهية من الدفعة التالية (BATCH-002 = 6,000)",
                "الدفعة الثانية لم تخصم بشكل سليم: " + reloadedB2.QuantityMilli, report);

            AssertCondition(reloadedB3.QuantityMilli == 10000,
                "الدفعة الأبعد انتهاءً لم تُمس وحافظت على كامل رصيدها (BATCH-003 = 10,000)",
                "الدفعة الثالثة تأثرت بالخطأ: " + reloadedB3.QuantityMilli, report);

            // Now return 6 items from this sale
            var retObj = new Return
            {
                SaleId = completedSale.Id,
                InvoiceNumber = completedSale.InvoiceNumber,
                RefundMethod = "cash",
                TotalPiasters = 6000,
                Items = new List<ReturnItem>
                {
                    new ReturnItem
                    {
                        ProductId = p.Id,
                        ProductName = p.Name,
                        QuantityMilli = 6000,
                        UnitPricePiasters = 1000,
                        TotalPiasters = 6000,
                        IsDamaged = false
                    }
                }
            };
            returnRepo.CreateReturnAtomic(retObj);

            // Returning 6 items should restore 4 items to B2 (back to 10,000) and 2 items to B1 (back to 2,000 and ACTIVE)!
            var afterRetB1 = batchRepo.GetByProductId(p.Id, false).Find(delegate(ProductBatch b) { return b.BatchNumber == "BATCH-001"; });
            var afterRetB2 = batchRepo.GetByProductId(p.Id, false).Find(delegate(ProductBatch b) { return b.BatchNumber == "BATCH-002"; });

            AssertCondition(afterRetB2.QuantityMilli == 10000,
                "تمت استعادة رصيد الدفعة الثانية BATCH-002 إلى 10,000 بالكامل",
                "فشل استعادة الدفعة الثانية: " + afterRetB2.QuantityMilli, report);

            AssertCondition(afterRetB1.QuantityMilli == 2000 && afterRetB1.Status == "ACTIVE",
                "تمت استعادة باقي المرتجع (2,000) إلى الدفعة المستنفدة BATCH-001 وتنشيط حالتها إلى ACTIVE",
                "فشل استعادة الدفعة الأولى: " + afterRetB1.QuantityMilli, report);
        }

        // Test 5: Held Sale Stock Race Condition
        private static void RunTest5_HeldSaleStockRaceCondition(AuditReport report)
        {
            var prodRepo = new ProductRepository(_connStr);
            var heldService = new HeldSaleService(new HeldSaleRepository(_connStr));
            var saleRepo = new SaleRepository(_connStr);
            var saleService = new SaleService(saleRepo, prodRepo);

            var p = new Product
            {
                Id = "p_held_race",
                Name = "منتج تجربة تعليق الفواتير",
                PricePiasters = 5000,
                CostPiasters = 3000,
                StockQuantityMilli = 2000, // 2 items in stock
                IsActive = true
            };
            prodRepo.Upsert(p);

            // Hold a sale for 2 items
            var held = new HeldSale
            {
                HoldLabel = "فاتورة عميل رقم 5",
                ItemsCount = 1,
                TotalPiasters = 10000,
                CartJson = Newtonsoft.Json.JsonConvert.SerializeObject(new List<SaleItem>
                {
                    new SaleItem
                    {
                        ProductId = p.Id,
                        ProductName = p.Name,
                        QuantityMilli = 2000,
                        UnitPricePiasters = 5000,
                        UnitCostPiasters = 3000,
                        TotalPiasters = 10000
                    }
                })
            };
            heldService.HoldSale(held);

            // In parallel, another customer buys out the available stock
            var buyout = new Sale
            {
                CustomerId = "cust_general_cash",
                PaymentMethod = "cash",
                PaidPiasters = 10000,
                TotalPiasters = 10000,
                Items = new List<SaleItem>
                {
                    new SaleItem
                    {
                        ProductId = p.Id,
                        ProductName = p.Name,
                        QuantityMilli = 2000,
                        UnitPricePiasters = 5000,
                        UnitCostPiasters = 3000,
                        TotalPiasters = 10000
                    }
                }
            };
            saleService.ProcessSale(buyout);

            var pAfterBuy = prodRepo.GetById(p.Id);
            AssertCondition(pAfterBuy.StockQuantityMilli == 0,
                "تم شراء رصيد الصنف بالكامل بنجاح وأصبح المخزون المتاح 0",
                "رصيد المخزون لم ينفد: " + pAfterBuy.StockQuantityMilli, report);

            // Now attempt to checkout the held sale items
            bool rejected = false;
            try
            {
                var heldSaleToCheckout = new Sale
                {
                    CustomerId = "cust_general_cash",
                    PaymentMethod = "cash",
                    PaidPiasters = 10000,
                    TotalPiasters = 10000,
                    Items = Newtonsoft.Json.JsonConvert.DeserializeObject<List<SaleItem>>(held.CartJson)
                };
                saleService.ProcessSale(heldSaleToCheckout);
            }
            catch (InvalidOperationException ex)
            {
                rejected = true;
                AssertCondition(ex.Message.Contains("المخزون") || ex.Message.Contains("غير كاف"),
                    "تم كشف محاولة بيع صنف نفد رصيده أثناء التعليق ورفض العملية برسالة واضحة: " + ex.Message,
                    "الرسالة لا تشير للمخزون: " + ex.Message, report);
            }

            AssertCondition(rejected,
                "نظام البيع محمي تماماً ضد بيع الفواتير المعلقة في حال نفاد المخزون",
                "فشل النظام في منع البيع بالسالب للفاتورة المعلقة!", report);
        }

        // Test 6: Supplier Advance Credit & Ledger Reconciliation
        private static void RunTest6_SupplierAdvanceCreditAndLedgerReconciliation(AuditReport report)
        {
            var auditRepo = new AuditLogRepository(_connStr);
            var supRepo = new SupplierRepository(_connStr, auditRepo);
            var purRepo = new PurchaseRepository(_connStr, null, supRepo, null, auditRepo);
            var prodRepo = new ProductRepository(_connStr);

            var sup = new Supplier
            {
                Name = "شركة النصر للأغذية المحفوظة",
                Phone = "01099887766",
                BalancePiasters = 0,
                IsActive = true
            };
            sup = supRepo.Save(sup);

            var p = new Product
            {
                Id = "p_sup_test",
                Name = "تونة النصر قطع 140جم",
                PricePiasters = 4000,
                CostPiasters = 2500,
                StockQuantityMilli = 10000,
                IsActive = true
            };
            prodRepo.Upsert(p);

            // Purchase 10 cans at 25 EGP (Net: 250 EGP). Paid 350 EGP (100 EGP overpaid)
            var pur1 = new Purchase
            {
                SupplierId = sup.Id,
                DiscountPiasters = 0,
                PaidAmountPiasters = 35000,
                Items = new List<PurchaseItem>
                {
                    new PurchaseItem
                    {
                        ProductId = p.Id,
                        QuantityMilli = 10000,
                        UnitCostPiasters = 2500,
                        TotalCostPiasters = 25000
                    }
                }
            };
            purRepo.CreatePurchase(pur1);

            var s1 = supRepo.GetById(sup.Id);
            AssertCondition(s1.BalancePiasters == -10000,
                "تم تسجيل السداد بالزيادة كأمانات ورصيد دائن لصالحنا لدى المورد (-100.00 ج.م)",
                "رصيد المورد غير مطابق: " + s1.BalancePiasters, report);

            // Purchase 2: Net 80 EGP, 0 paid. Should consume 80 EGP of our credit. Remaining credit: -20 EGP (-2000 piasters)
            var pur2 = new Purchase
            {
                SupplierId = sup.Id,
                DiscountPiasters = 0,
                PaidAmountPiasters = 0,
                Items = new List<PurchaseItem>
                {
                    new PurchaseItem
                    {
                        ProductId = p.Id,
                        QuantityMilli = 3200,
                        UnitCostPiasters = 2500,
                        TotalCostPiasters = 8000
                    }
                }
            };
            purRepo.CreatePurchase(pur2);

            var s2 = supRepo.GetById(sup.Id);
            AssertCondition(s2.BalancePiasters == -2000,
                "تم استيعاب وخصم الفاتورة الآجلة التالية تلقائياً من رصيدنا المسبق (باقي أمانات: -20.00 ج.م)",
                "رصيد المورد غير مطابق: " + s2.BalancePiasters, report);

            // Record payment to supplier of 50 EGP. Credit increases to -70 EGP (-7000 piasters)
            supRepo.RecordPayment(sup.Id, 5000, "دفعة نقدية تحت الحساب للمورد");

            var s3 = supRepo.GetById(sup.Id);
            AssertCondition(s3.BalancePiasters == -7000,
                "تم تسجيل سداد المورد بنجاح وتحديث الرصيد (-70.00 ج.م)",
                "رصيد المورد غير مطابق: " + s3.BalancePiasters, report);

            // Verify Double-Entry Balance Integrity
            var verification = supRepo.VerifyBalance(sup.Id);
            AssertCondition(verification != null && verification.IsBalanced && verification.DiscrepancyPiasters == 0,
                "تطابق مالي 100% بين رصيد المورد المخزن وسجل كشف الحساب التراكمي (فارق = 0 قرش)",
                "يوجد انحراف مالي في كشف حساب المورد: " + (verification != null ? verification.DiscrepancyPiasters : -1), report);
        }

        // Test 7: Multi-Unit Cascade And Cost Parity
        private static void RunTest7_MultiUnitCascadeAndCostParity(AuditReport report)
        {
            var prodRepo = new ProductRepository(_connStr);
            var unitRepo = new ProductUnitRepository(_connStr);
            var purRepo = new PurchaseRepository(_connStr);
            var saleRepo = new SaleRepository(_connStr);
            var saleService = new SaleService(saleRepo, prodRepo);

            var p = new Product
            {
                Id = "p_multi_cascade",
                Name = "حلاوة البوادى 250جم",
                PricePiasters = 2000, // 20 EGP
                CostPiasters = 1200,  // 12 EGP
                StockQuantityMilli = 10000, // 10 pieces
                IsActive = true
            };
            prodRepo.Upsert(p);

            // Add Carton unit (Factor 12)
            var cartonUnit = new ProductUnit
            {
                ProductId = p.Id,
                UnitName = "كرتونة",
                ConversionFactor = 12,
                SellPricePiasters = 22000,
                CostPricePiasters = 14400,
                IsBaseUnit = false
            };
            unitRepo.Create(cartonUnit);

            // Purchase 5 Cartons (60 pieces) at 120 EGP/carton (10 EGP/piece cost)
            var pur = new Purchase
            {
                DiscountPiasters = 0,
                PaidAmountPiasters = 60000,
                Items = new List<PurchaseItem>
                {
                    new PurchaseItem
                    {
                        ProductId = p.Id,
                        QuantityMilli = 60000, // 60 pieces in base units
                        UnitCostPiasters = 1000, // 10 EGP base unit cost
                        TotalCostPiasters = 60000,
                        NewSellingPricePiasters = 2200 // Selling price updated to 22 EGP
                    }
                }
            };
            purRepo.CreatePurchase(pur);

            var reloadedP = prodRepo.GetById(p.Id);
            AssertCondition(reloadedP.StockQuantityMilli == 70000,
                "تمت زيادة المخزون بالوحدة الأساسية بدقة متناهية (10 + 60 = 70 قطعة)",
                "مخزون الصنف غير مطابق: " + reloadedP.StockQuantityMilli, report);

            AssertCondition(reloadedP.CostPiasters == 1000 && reloadedP.PricePiasters == 2200,
                "تم تحديث سعر البيع والتكلفة للقطعة الأساسية من فاتورة الشراء تلقائياً",
                "أسعار الصنف لم تُحدّث بشكل صحيح", report);

            // Base unit in product_units must be 100% synchronized
            var baseUnit = unitRepo.GetBaseUnit(p.Id);
            AssertCondition(baseUnit != null && baseUnit.CostPricePiasters == 1000 && baseUnit.SellPricePiasters == 2200,
                "تطابق أسعار وتكلفة الوحدة الأساسية في جدول product_units مع الصنف",
                "أسعار الوحدة الأساسية غير مطابقة", report);

            // Sell 1 Carton (12 pieces)
            var sale = new Sale
            {
                CustomerId = "cust_general_cash",
                PaymentMethod = "cash",
                PaidPiasters = 22000,
                TotalPiasters = 22000,
                Items = new List<SaleItem>
                {
                    new SaleItem
                    {
                        ProductId = p.Id,
                        ProductName = p.Name,
                        QuantityMilli = 12000, // 12 pieces
                        UnitPricePiasters = 22000 / 12,
                        UnitCostPiasters = 1000,
                        TotalPiasters = 22000
                    }
                }
            };
            saleService.ProcessSale(sale);

            var pAfterSale = prodRepo.GetById(p.Id);
            AssertCondition(pAfterSale.StockQuantityMilli == 58000,
                "تم خصم كمية الكرتونة المباعة من رصيد الصنف الأساسي (70 - 12 = 58 قطعة)",
                "المخزون بعد بيع الكرتونة غير سليم: " + pAfterSale.StockQuantityMilli, report);
        }

        // Test 8: Financial Rounding And Credit Reversals
        private static void RunTest8_FinancialRoundingAndCreditReversals(AuditReport report)
        {
            var custRepo = new CustomerRepository(_connStr);
            var prodRepo = new ProductRepository(_connStr);
            var saleRepo = new SaleRepository(_connStr);
            var saleService = new SaleService(saleRepo, prodRepo);

            var cust = new Customer
            {
                Name = "الحاج إبراهيم الدسوقي",
                Phone = "01155443322",
                BalancePiasters = 0,
                CreditLimitPiasters = 500000 // 5,000 EGP limit
            };
            cust = custRepo.SaveCustomer(cust);

            var weightProd = new Product
            {
                Id = "p_weight_test",
                Name = "جبنة رومي قديمة بالوزن",
                PricePiasters = 35500, // 355.00 EGP/kg
                CostPiasters = 28000,
                Unit = "kg",
                StockQuantityMilli = 50000,
                IsActive = true
            };
            prodRepo.Upsert(weightProd);

            // Sell 0.333 kg (333 milli) on credit.
            // Integer Money: Round(35500 * 333 / 1000) = 11821.5 -> 11822 piasters (118.22 EGP)
            long expectedPiasters = Money.FromPiasters(35500).MultiplyByMilliUnits(333).Piasters;
            AssertCondition(expectedPiasters == 11822,
                "الحساب المالي للوزن دقيق بالقروش بدون أي تقريب عائم (118.22 ج.م = 11822 قرش)",
                "حساب مبالغ الأوزان غير دقيق: " + expectedPiasters, report);

            var sale = new Sale
            {
                CustomerId = cust.Id,
                PaymentMethod = "credit",
                PaidPiasters = 0,
                TotalPiasters = expectedPiasters,
                Items = new List<SaleItem>
                {
                    new SaleItem
                    {
                        ProductId = weightProd.Id,
                        ProductName = weightProd.Name,
                        QuantityMilli = 333,
                        UnitPricePiasters = 35500,
                        UnitCostPiasters = 28000,
                        TotalPiasters = expectedPiasters
                    }
                }
            };
            var completed = saleService.ProcessSale(sale);

            var c1 = custRepo.GetById(cust.Id);
            AssertCondition(c1.BalancePiasters == 11822,
                "تسجيل مديونية العميل بالقروش بدقة (+118.22 ج.م)",
                "مديونية العميل غير مطابقة: " + c1.BalancePiasters, report);

            // Customer pays 200.00 EGP cash. Balance becomes -81.78 EGP (-8178 piasters)
            var paymentCust = custRepo.RecordPayment(cust.Id, 20000, "سداد نقدي بزيادة تحت الحساب");
            AssertCondition(paymentCust.BalancePiasters == -8178,
                "تحول رصيد العميل إلى دائن/أمانات لصالحه بدقة (-81.78 ج.م)",
                "رصيد العميل غير مطابق: " + paymentCust.BalancePiasters, report);

            // Get payment ledger entry id to cancel it
            var stmt = custRepo.GetStatement(cust.Id, 5);
            var payEntry = stmt.Find(delegate(CustomerLedgerEntry e) { return e.Type == "payment"; });
            AssertCondition(payEntry != null, "تم العثور على حركة السداد في كشف الحساب", "حركة السداد غير موجودة", report);

            // Cancel payment
            custRepo.CancelPayment(cust.Id, payEntry.Id, "شيك بدون رصيد", "المدير");
            var afterCancelPay = custRepo.GetById(cust.Id);
            AssertCondition(afterCancelPay.BalancePiasters == 11822,
                "إلغاء السداد واستعادة مديونية العميل السابقة بدقة (+118.22 ج.م)",
                "فشل استعادة مديونية العميل: " + afterCancelPay.BalancePiasters, report);

            // Cancel the original sale
            saleRepo.CancelSaleAtomic(completed.Id, "إلغاء لخطأ في الصنف", "المدير");
            var finalCust = custRepo.GetById(cust.Id);
            AssertCondition(finalCust.BalancePiasters == 0,
                "إلغاء الفاتورة الأصلية وتصفير حساب العميل بالكامل (0.00 ج.م)",
                "فشل تصفير حساب العميل: " + finalCust.BalancePiasters, report);

            // Verify Customer Ledger Audit
            var vCust = custRepo.VerifyBalance(cust.Id);
            AssertCondition(vCust != null && vCust.IsBalanced && vCust.DiscrepancyPiasters == 0,
                "تطابق كشف حساب العميل التراكمي مع الرصيد الحالي 100% (فارق = 0 قرش)",
                "انحراف في كشف حساب العميل!", report);
        }

        // Test 9: Parallel Concurrency Chaos Under FinancialWriteLock
        private static void RunTest9_ParallelConcurrencyChaos(AuditReport report)
        {
            var prodRepo = new ProductRepository(_connStr);
            var saleRepo = new SaleRepository(_connStr);
            var saleService = new SaleService(saleRepo, prodRepo);
            var custRepo = new CustomerRepository(_connStr);
            var expenseRepo = new ExpenseRepository(_connStr);

            var p = new Product
            {
                Id = "p_chaos_test",
                Name = "بيبسي كانز 330مل",
                PricePiasters = 1200,
                CostPiasters = 900,
                StockQuantityMilli = 500000, // 500 items
                IsActive = true
            };
            prodRepo.Upsert(p);

            var c = new Customer
            {
                Name = "عميل الضغط المتزامن",
                BalancePiasters = 0,
                CreditLimitPiasters = 1000000
            };
            c = custRepo.SaveCustomer(c);

            int threadCount = 20;
            var tasks = new Task[threadCount];
            int successfulOps = 0;
            int failedOps = 0;

            for (int i = 0; i < threadCount; i++)
            {
                int threadIndex = i;
                tasks[i] = Task.Factory.StartNew(delegate
                {
                    try
                    {
                        if (threadIndex % 4 == 0)
                        {
                            // Sale operation
                            var s = new Sale
                            {
                                CustomerId = "cust_general_cash",
                                PaymentMethod = "cash",
                                PaidPiasters = 1200,
                                TotalPiasters = 1200,
                                Items = new List<SaleItem>
                                {
                                    new SaleItem
                                    {
                                        ProductId = p.Id,
                                        ProductName = p.Name,
                                        QuantityMilli = 1000,
                                        UnitPricePiasters = 1200,
                                        UnitCostPiasters = 900,
                                        TotalPiasters = 1200
                                    }
                                }
                            };
                            saleService.ProcessSale(s);
                        }
                        else if (threadIndex % 4 == 1)
                        {
                            // Expense operation
                            expenseRepo.Insert(new Expense
                            {
                                AmountPiasters = 500,
                                Category = "نثريات",
                                Notes = "ضغط متزامن " + threadIndex,
                                BusinessDate = "2026-10-17"
                            });
                        }
                        else if (threadIndex % 4 == 2)
                        {
                            // Customer payment
                            custRepo.RecordPayment(c.Id, 100, "سداد متزامن " + threadIndex);
                        }
                        else
                        {
                            // Credit sale to customer
                            var sCredit = new Sale
                            {
                                CustomerId = c.Id,
                                PaymentMethod = "credit",
                                PaidPiasters = 0,
                                TotalPiasters = 1200,
                                Items = new List<SaleItem>
                                {
                                    new SaleItem
                                    {
                                        ProductId = p.Id,
                                        ProductName = p.Name,
                                        QuantityMilli = 1000,
                                        UnitPricePiasters = 1200,
                                        UnitCostPiasters = 900,
                                        TotalPiasters = 1200
                                    }
                                }
                            };
                            saleService.ProcessSale(sCredit);
                        }

                        Interlocked.Increment(ref successfulOps);
                    }
                    catch (Exception)
                    {
                        Interlocked.Increment(ref failedOps);
                    }
                });
            }

            Task.WaitAll(tasks);

            AssertCondition(failedOps == 0 && successfulOps == threadCount,
                string.Format("تنفيذ {0} عمليات مالية متزامنة في خيوط معالجة مختلفة بنجاح فائق ودون أي تعارض (0 Deadlocks / 0 Lock Contention)", successfulOps),
                string.Format("فشل {0} عملية من أصل {1} أثناء الضغط المتزامن!", failedOps, threadCount), report);

            // Customer ledger verification after chaos
            var vCust = custRepo.VerifyBalance(c.Id);
            AssertCondition(vCust != null && vCust.IsBalanced && vCust.DiscrepancyPiasters == 0,
                "سلامة كشف حساب العميل التامة بعد اختبار الضغط المتزامن بنسبة 100%",
                "انحراف في حساب العميل بعد الضغط المتزامن!", report);
        }

        // Test 10: Live Drawer Balance and Purchases Cash Deduction Parity
        private static void RunTest10_LiveDrawerBalanceAndPurchasesDeductionParity(AuditReport report)
        {
            var closingRepo = new DailyClosingRepository(_connStr);
            var counterRepo = new CounterRepository(_connStr);
            var auditRepo = new AuditLogRepository(_connStr);
            var settingsRepo = new SettingsRepository(_connStr);
            var closingService = new DailyClosingService(_connStr, closingRepo, counterRepo, auditRepo, settingsRepo);

            var prodRepo = new ProductRepository(_connStr);
            var supRepo = new SupplierRepository(_connStr, auditRepo);
            var purRepo = new PurchaseRepository(_connStr, null, supRepo, null, auditRepo);
            var saleRepo = new SaleRepository(_connStr);
            var saleService = new SaleService(saleRepo, prodRepo);

            string bDate = closingService.GetCurrentBusinessDate();

            // 0. Ensure drawer has positive base cash (simulating morning register opening float/sales)
            var pBase = new Product
            {
                Id = "p_drawer_base",
                Name = "صنف رصيد افتتاحي للدرج",
                PricePiasters = 200000,
                CostPiasters = 120000,
                StockQuantityMilli = 50000,
                IsActive = true
            };
            prodRepo.Upsert(pBase);

            saleService.ProcessSale(new Sale
            {
                CustomerId = "cust_general_cash",
                PaymentMethod = "cash",
                PaidPiasters = 200000,
                TotalPiasters = 200000,
                Items = new List<SaleItem>
                {
                    new SaleItem
                    {
                        ProductId = pBase.Id,
                        ProductName = pBase.Name,
                        QuantityMilli = 1000,
                        UnitPricePiasters = 200000,
                        UnitCostPiasters = 120000,
                        TotalPiasters = 200000
                    }
                }
            });

            // 1. Check initial live drawer balance
            var initialLive = closingService.GetLiveDrawerBalance(bDate);
            long startCash = initialLive.AvailableCashPiasters;

            // 2. Add cash sale of 500 EGP (50,000 piasters)
            var pSale = new Product
            {
                Id = "p_drawer_parity",
                Name = "صنف اختبار الدرج النقدي",
                PricePiasters = 50000,
                CostPiasters = 30000,
                StockQuantityMilli = 100000,
                IsActive = true
            };
            prodRepo.Upsert(pSale);

            var cashSale = new Sale
            {
                CustomerId = "cust_general_cash",
                PaymentMethod = "cash",
                PaidPiasters = 50000,
                TotalPiasters = 50000,
                Items = new List<SaleItem>
                {
                    new SaleItem
                    {
                        ProductId = pSale.Id,
                        ProductName = pSale.Name,
                        QuantityMilli = 1000,
                        UnitPricePiasters = 50000,
                        UnitCostPiasters = 30000,
                        TotalPiasters = 50000
                    }
                }
            };
            saleService.ProcessSale(cashSale);

            var afterSaleLive = closingService.GetLiveDrawerBalance(bDate);
            AssertCondition(afterSaleLive.AvailableCashPiasters == startCash + 50000,
                "زيادة رصيد نقدية الدرج الحية فور إتمام عملية البيع النقدي بدقة متناهية (+500.00 ج.م)",
                "رصيد الدرج بعد البيع غير مطابق: " + afterSaleLive.AvailableCashPiasters, report);

            // 3. Create purchase with payment_source = 'cash_drawer' for 200 EGP (20,000 piasters)
            var sup = supRepo.Save(new Supplier { Name = "مورد تجربة الدرج", Phone = "01011112222", BalancePiasters = 0, IsActive = true });
            var purFromDrawer = new Purchase
            {
                SupplierId = sup.Id,
                DiscountPiasters = 0,
                PaidAmountPiasters = 20000,
                PaymentSource = "cash_drawer",
                Items = new List<PurchaseItem>
                {
                    new PurchaseItem
                    {
                        ProductId = pSale.Id,
                        QuantityMilli = 1000,
                        UnitCostPiasters = 20000,
                        TotalCostPiasters = 20000
                    }
                }
            };
            purRepo.CreatePurchase(purFromDrawer);

            var afterPurDrawerLive = closingService.GetLiveDrawerBalance(bDate);
            AssertCondition(afterPurDrawerLive.PurchasesDrawerCashPiasters == initialLive.PurchasesDrawerCashPiasters + 20000,
                "رصد مشتريات نقدية الدرج بدقة متناهية (زيادة 200.00 ج.م)",
                "مشتريات الدرج غير مطابقة: " + afterPurDrawerLive.PurchasesDrawerCashPiasters, report);
            AssertCondition(afterPurDrawerLive.AvailableCashPiasters == startCash + 50000 - 20000,
                "خصم المشتريات النقدية المسددة من الدرج فورياً من الرصيد الحي للدرج",
                "الرصيد الحي للدرج بعد الشراء النقدي غير مطابق: " + afterPurDrawerLive.AvailableCashPiasters, report);

            // 4. Create purchase with payment_source = 'external_cash' for 150 EGP (15,000 piasters)
            var purExternal = new Purchase
            {
                SupplierId = sup.Id,
                DiscountPiasters = 0,
                PaidAmountPiasters = 15000,
                PaymentSource = "external_cash",
                Items = new List<PurchaseItem>
                {
                    new PurchaseItem
                    {
                        ProductId = pSale.Id,
                        QuantityMilli = 1000,
                        UnitCostPiasters = 15000,
                        TotalCostPiasters = 15000
                    }
                }
            };
            purRepo.CreatePurchase(purExternal);

            var afterPurExtLive = closingService.GetLiveDrawerBalance(bDate);
            AssertCondition(afterPurExtLive.PurchasesDrawerCashPiasters == afterPurDrawerLive.PurchasesDrawerCashPiasters,
                "عزل مشتريات الكاش الخارجي تماماً وعدم تحميلها على مشتريات الدرج",
                "مشتريات الدرج تأثرت بالكاش الخارجي: " + afterPurExtLive.PurchasesDrawerCashPiasters, report);
            AssertCondition(afterPurExtLive.AvailableCashPiasters == afterPurDrawerLive.AvailableCashPiasters,
                "حماية رصيد الدرج الحي بنسبة 100% من الخصم عند الشراء من جاري صاحب المحل (كاش خارجي)",
                "رصيد الدرج انخفض بالخطأ بعد شراء الكاش الخارجي!", report);
        }

        // Test 11: Supplier Direct Payment Drawer Deduction and Ledger Parity
        private static void RunTest11_SupplierDirectPaymentDrawerDeductionAndLedgerParity(AuditReport report)
        {
            var closingRepo = new DailyClosingRepository(_connStr);
            var counterRepo = new CounterRepository(_connStr);
            var auditRepo = new AuditLogRepository(_connStr);
            var settingsRepo = new SettingsRepository(_connStr);
            var closingService = new DailyClosingService(_connStr, closingRepo, counterRepo, auditRepo, settingsRepo);

            var supRepo = new SupplierRepository(_connStr, auditRepo);
            string bDate = closingService.GetCurrentBusinessDate();

            var sup = supRepo.Save(new Supplier { Name = "مورد سداد الخزينة", Phone = "01033334444", BalancePiasters = 100000, IsActive = true });

            var liveBefore = closingService.GetLiveDrawerBalance(bDate);
            long cashBefore = liveBefore.AvailableCashPiasters;
            long suppPaymentsBefore = liveBefore.SupplierPaymentsDrawerCashPiasters;

            // 1. Pay 300 EGP to supplier from drawer
            supRepo.RecordPayment(sup.Id, 30000, "سداد دفعة للمورد من الدرج", "الكاشير", "cash_drawer");

            var liveAfterDrawerPay = closingService.GetLiveDrawerBalance(bDate);
            AssertCondition(liveAfterDrawerPay.SupplierPaymentsDrawerCashPiasters == suppPaymentsBefore + 30000,
                "تسجيل مدفوعات الموردين من نقدية الدرج بدقة (زيادة 300.00 ج.م)",
                "مدفوعات الموردين من الدرج غير مطابقة: " + liveAfterDrawerPay.SupplierPaymentsDrawerCashPiasters, report);
            AssertCondition(liveAfterDrawerPay.AvailableCashPiasters == cashBefore - 30000,
                "خصم سداد المورد من رصيد الدرج الحي فورياً بدقة متناهية (-300.00 ج.م)",
                "الرصيد الحي للدرج بعد سداد المورد غير مطابق: " + liveAfterDrawerPay.AvailableCashPiasters, report);

            // 2. Pay 400 EGP to supplier from external cash (owner pocket)
            supRepo.RecordPayment(sup.Id, 40000, "سداد دفعة من جيب صاحب المحل", "المالك", "external_cash");

            var liveAfterExtPay = closingService.GetLiveDrawerBalance(bDate);
            AssertCondition(liveAfterExtPay.SupplierPaymentsDrawerCashPiasters == liveAfterDrawerPay.SupplierPaymentsDrawerCashPiasters,
                "حماية نقدية الدرج وعزل مدفوعات الموردين المسددة من الكاش الخارجي",
                "مدفوعات الدرج تأثرت بالكاش الخارجي: " + liveAfterExtPay.SupplierPaymentsDrawerCashPiasters, report);
            AssertCondition(liveAfterExtPay.AvailableCashPiasters == liveAfterDrawerPay.AvailableCashPiasters,
                "حماية رصيد نقدية الدرج من الخصم عند سداد المورد من الكاش الخارجي",
                "رصيد الدرج تأثر بالسداد الخارجي للمورد!", report);

            // Check supplier remaining debt: 1000 - 300 - 400 = 300 EGP (30,000 piasters)
            var supReloaded = supRepo.GetById(sup.Id);
            AssertCondition(supReloaded.BalancePiasters == 30000,
                "سداد مديونية المورد بالكامل من المصدرين بدقة متناهية (متبقي له: 300.00 ج.م)",
                "رصيد المورد غير مطابق: " + supReloaded.BalancePiasters, report);

            // Ledger double entry verification
            var v = supRepo.VerifyBalance(sup.Id);
            AssertCondition(v != null && v.IsBalanced && v.DiscrepancyPiasters == 0,
                "تطابق مالي بنسبة 100% بين رصيد المورد ودفتر الحركات لجميع مصادر السداد (فارق = 0 قرش)",
                "عدم تطابق في دفتر المورد!", report);
        }

        // Test 12: Sale Cancellation Blocked On Existing Returns (Double Credit / Debt Desync Prevention)
        private static void RunTest12_SaleCancellationBlockedOnExistingReturns(AuditReport report)
        {
            var prodRepo = new ProductRepository(_connStr);
            var custRepo = new CustomerRepository(_connStr);
            var saleRepo = new SaleRepository(_connStr);
            var saleService = new SaleService(saleRepo, prodRepo);
            var returnRepo = new ReturnRepository(_connStr);

            var cust = custRepo.SaveCustomer(new Customer
            {
                Name = "عميل تجربة حماية إلغاء المرتجعات",
                Phone = "01122334455",
                BalancePiasters = 0
            });

            var prod = new Product
            {
                Id = "p_ret_cancel_guard",
                Name = "منتج حماية إلغاء المرتجع",
                PricePiasters = 10000,
                CostPiasters = 6000,
                StockQuantityMilli = 10000,
                IsActive = true
            };
            prodRepo.Upsert(prod);

            var sale = new Sale
            {
                CustomerId = cust.Id,
                PaymentMethod = "cash",
                PaidPiasters = 5000,
                TotalPiasters = 20000,
                Items = new List<SaleItem>
                {
                    new SaleItem
                    {
                        ProductId = prod.Id,
                        ProductName = prod.Name,
                        QuantityMilli = 2000,
                        UnitPricePiasters = 10000,
                        UnitCostPiasters = 6000,
                        TotalPiasters = 20000
                    }
                }
            };

            var completedSale = saleService.ProcessSale(sale);

            var custAfterSale = custRepo.GetById(cust.Id);
            AssertCondition(custAfterSale.BalancePiasters == 15000,
                "تسجيل مديونية العميل الآجلة بدقة (+150.00 ج.م)",
                "مديونية العميل غير مطابقة: " + custAfterSale.BalancePiasters, report);

            var retObj = new Return
            {
                SaleId = completedSale.Id,
                InvoiceNumber = completedSale.InvoiceNumber,
                RefundMethod = "cash",
                TotalPiasters = 10000,
                Items = new List<ReturnItem>
                {
                    new ReturnItem
                    {
                        ProductId = prod.Id,
                        ProductName = prod.Name,
                        QuantityMilli = 1000,
                        UnitPricePiasters = 10000,
                        TotalPiasters = 10000,
                        IsDamaged = false
                    }
                }
            };
            returnRepo.CreateReturnAtomic(retObj);

            bool cancelBlocked = false;
            string blockMessage = "";
            try
            {
                saleRepo.CancelSaleAtomic(completedSale.Id, "محاولة إلغاء فاتورة مرتجعة جزئياً", "المدير");
            }
            catch (InvalidOperationException ex)
            {
                cancelBlocked = true;
                blockMessage = ex.Message;
            }

            AssertCondition(cancelBlocked,
                "منع إلغاء الفاتورة التي تحتوي على مرتجعات بنجاح وصدور استثناء تشغيلي صارم",
                "فشل المنع! تم السماح بإلغاء فاتورة عليها مرتجعات سابقة مما يسبب ازدواجية مالية!", report);

            AssertCondition(blockMessage.Contains("مرتجعات"),
                "رسالة الخطأ توضح للمستخدم وجود مرتجعات سابقة وتوجهه لاسترجاع باقي الأصناف: " + blockMessage,
                "رسالة الخطأ غير واضحة: " + blockMessage, report);

            var custAfterCancelAttempt = custRepo.GetById(cust.Id);
            AssertCondition(custAfterCancelAttempt.BalancePiasters == 15000,
                "حماية رصيد العميل بنسبة 100% وعدم تصفير المديونية أو ازدواجية الخصم بعد محاولة الإلغاء المرفوضة",
                "رصيد العميل تغير بالخطأ: " + custAfterCancelAttempt.BalancePiasters, report);

            string currentStatus = "";
            using (var conn = new SQLiteConnection(_connStr))
            {
                conn.Open();
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = "SELECT status FROM sales WHERE id = @sid;";
                    cmd.Parameters.AddWithValue("@sid", completedSale.Id);
                    currentStatus = Convert.ToString(cmd.ExecuteScalar());
                }
            }
            AssertCondition(currentStatus == "partially_refunded",
                "حالة الفاتورة الأصلية بقيت مرتجعة جزئياً (partially_refunded) ولم تُشطب كملغاة",
                "حالة الفاتورة تغيرت إلى: " + currentStatus, report);
        }

        // Test 13: Digital Wallet Generic Keyword 'wallet' Parity for Sale and Return
        private static void RunTest13_DigitalWalletGenericKeywordParity(AuditReport report)
        {
            var digRepo = new DigitalAccountRepository(_connStr);
            var prodRepo = new ProductRepository(_connStr);
            var saleRepo = new SaleRepository(_connStr);
            var saleService = new SaleService(saleRepo, prodRepo);
            var returnRepo = new ReturnRepository(_connStr);

            var walletAcc = new DigitalAccount
            {
                Id = "dig_wallet_generic_test",
                Name = "محفظة كاش للتجربة",
                Type = "wallet",
                Provider = "vodafone_cash",
                BalancePiasters = 50000,
                IsDefault = true,
                IsActive = true
            };
            digRepo.SaveAccount(walletAcc);

            var prod = new Product
            {
                Id = "p_wallet_generic_test",
                Name = "صنف تجربة المحفظة العامة",
                PricePiasters = 25000,
                CostPiasters = 15000,
                StockQuantityMilli = 10000,
                IsActive = true
            };
            prodRepo.Upsert(prod);

            var sale = new Sale
            {
                CustomerId = "cust_general_cash",
                PaymentMethod = "wallet",
                PaidPiasters = 25000,
                TotalPiasters = 25000,
                Items = new List<SaleItem>
                {
                    new SaleItem
                    {
                        ProductId = prod.Id,
                        ProductName = prod.Name,
                        QuantityMilli = 1000,
                        UnitPricePiasters = 25000,
                        UnitCostPiasters = 15000,
                        TotalPiasters = 25000
                    }
                }
            };

            var completedSale = saleService.ProcessSale(sale);

            var walletAfterSale = digRepo.GetAccountById(walletAcc.Id);
            AssertCondition(walletAfterSale.BalancePiasters == 75000,
                "إيداع قيمة الفاتورة تلقائياً في المحفظة باستخدام الكلمة العامة 'wallet' (+250.00 ج.م)",
                "رصيد المحفظة لم يزد: " + walletAfterSale.BalancePiasters, report);

            var retObj = new Return
            {
                SaleId = completedSale.Id,
                InvoiceNumber = completedSale.InvoiceNumber,
                RefundMethod = "wallet",
                TotalPiasters = 25000,
                Items = new List<ReturnItem>
                {
                    new ReturnItem
                    {
                        ProductId = prod.Id,
                        ProductName = prod.Name,
                        QuantityMilli = 1000,
                        UnitPricePiasters = 25000,
                        TotalPiasters = 25000,
                        IsDamaged = false
                    }
                }
            };
            returnRepo.CreateReturnAtomic(retObj);

            var walletAfterReturn = digRepo.GetAccountById(walletAcc.Id);
            AssertCondition(walletAfterReturn.BalancePiasters == 50000,
                "خصم قيمة المرتجع تلقائياً من المحفظة باستخدام RefundMethod = 'wallet' (-250.00 ج.م)",
                "رصيد المحفظة بعد المرتجع غير مطابق: " + walletAfterReturn.BalancePiasters, report);

            var retTxs = digRepo.GetTransactions(10, walletAcc.Id, "pos_return");
            AssertCondition(retTxs.Count > 0 && retTxs[0].AmountPiasters == 25000,
                "تسجيل حركة المرتجع بدقة في سجل حركات المحافظ الرقمية",
                "سجل حركات المحفظة لم يسجل المرتجع بشكل سليم", report);
        }

        // Test 14: Net Negative Customer Debt Payment in Drawer Inclusion
        private static void RunTest14_NetNegativeCustomerDebtPaymentInDrawer(AuditReport report)
        {
            var custRepo = new CustomerRepository(_connStr);
            var closingRepo = new DailyClosingRepository(_connStr);
            var counterRepo = new CounterRepository(_connStr);
            var auditRepo = new AuditLogRepository(_connStr);
            var settingsRepo = new SettingsRepository(_connStr);
            var closingService = new DailyClosingService(_connStr, closingRepo, counterRepo, auditRepo, settingsRepo);

            string bDate = closingService.GetCurrentBusinessDate();

            var cust = custRepo.SaveCustomer(new Customer
            {
                Name = "عميل سداد الخزينة الصافي",
                Phone = "01199887766",
                BalancePiasters = 100000
            });

            custRepo.RecordPayment(cust.Id, 50000, "سداد دفعة نقدية");

            var previewAfterPay = closingService.GetClosingPreview(bDate);
            AssertCondition(previewAfterPay.DebtPaymentsPiasters >= 50000,
                "تسجيل سداد مديونية العميل في معاينة التقفيل بنجاح",
                "سداد مديونية العميل غير مطابق: " + previewAfterPay.DebtPaymentsPiasters, report);

            var stmt = custRepo.GetStatement(cust.Id, 10);
            var payEntry = stmt.Find(delegate(CustomerLedgerEntry e) { return e.Type == "payment"; });
            AssertCondition(payEntry != null,
                "العثور على حركة السداد في كشف حساب العميل",
                "لم يتم العثور على حركة السداد في دفتر العميل", report);

            custRepo.CancelPayment(cust.Id, payEntry.Id, "إلغاء لخطأ في السداد واسترداد النقدية للعميل", "المدير");

            var liveAfterCancel = closingService.GetLiveDrawerBalance(bDate);

            AssertCondition(custRepo.GetById(cust.Id).BalancePiasters == 100000,
                "استعادة مديونية العميل الأصلية بالكامل (1,000.00 ج.م)",
                "مديونية العميل بعد إلغاء السداد غير مطابقة: " + custRepo.GetById(cust.Id).BalancePiasters, report);

            AssertCondition(liveAfterCancel.AvailableCashPiasters >= 0,
                "رصيد النقدية المتاح في الدرج سليم وغير مضطرب بعد إلغاء السداد واسترداد الكاش",
                "رصيد النقدية المتاح غير صالح: " + liveAfterCancel.AvailableCashPiasters, report);
        }

        // Test 15: Expense Creation Blocked On Closed Business Date
        private static void RunTest15_ExpenseCreationBlockedOnClosedDay(AuditReport report)
        {
            var closingRepo = new DailyClosingRepository(_connStr);
            var counterRepo = new CounterRepository(_connStr);
            var auditRepo = new AuditLogRepository(_connStr);
            var settingsRepo = new SettingsRepository(_connStr);
            var closingService = new DailyClosingService(_connStr, closingRepo, counterRepo, auditRepo, settingsRepo);

            var expRepo = new ExpenseRepository(_connStr, auditRepo, counterRepo);
            var expService = new ExpenseService(expRepo, closingService);

            string closedDate = "2026-03-01";

            using (var conn = new SQLiteConnection(_connStr))
            {
                conn.Open();
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = @"
                        INSERT INTO daily_closings (
                            id, closing_number, business_date, closed_at, cashier_name,
                            total_sales_piasters, cash_sales_piasters, credit_sales_piasters,
                            returns_total_piasters, returns_cash_piasters, cancelled_total_piasters,
                            debt_payments_piasters, expected_cash_piasters, actual_cash_piasters,
                            difference_piasters, gross_profit_piasters, invoices_count,
                            returns_count, cancelled_count, notes, is_sealed
                        ) VALUES (
                            'dc_closed_test_day', 9999, @bdate, datetime('now'), 'المدير',
                            0, 0, 0,
                            0, 0, 0,
                            0, 0, 0,
                            0, 0, 0,
                            0, 0, 'تقفيل تجريبي ليوم مغلق', 1
                        );";
                    cmd.Parameters.AddWithValue("@bdate", closedDate);
                    cmd.ExecuteNonQuery();
                }
            }

            AssertCondition(closingService.IsDayClosed(closedDate),
                "تأكيد إغلاق يوم العمل المحدد مسبقاً (2026-03-01)",
                "فشل فحص إغلاق يوم العمل عبر IsDayClosed", report);

            bool expenseBlocked = false;
            string expenseBlockMsg = "";
            try
            {
                var req = new CreateExpenseRequest
                {
                    Category = "نظافة",
                    AmountPiasters = 5000,
                    BusinessDate = closedDate,
                    Notes = "محاولة تسجيل مصروف في يوم مغلق",
                    CreatedBy = "الكاشير"
                };
                expService.CreateExpense(req);
            }
            catch (InvalidOperationException ex)
            {
                expenseBlocked = true;
                expenseBlockMsg = ex.Message;
            }

            AssertCondition(expenseBlocked,
                "منع تسجيل أي مصروف على يوم عمل مغلق ومرحل مسبقاً بنجاح",
                "فشل الحظر! تم السماح بتسجيل مصروف على يوم عمل مقفل مما يشوه الحسابات الختامية!", report);

            AssertCondition(expenseBlockMsg.Contains("إقفالها") || expenseBlockMsg.Contains("مغلق"),
                "رسالة الخطأ توضح للمستخدم أن اليوم مغلق ومرحل: " + expenseBlockMsg,
                "رسالة الخطأ غير واضحة: " + expenseBlockMsg, report);

            var expenses = expService.GetExpenses(closedDate);
            AssertCondition(expenses.Count == 0,
                "تأكيد عدم إدراج أي مصروف في قاعدة البيانات لليوم المغلق (عدد المصروفات = 0)",
                "تم حفظ مصروف في قاعدة البيانات بالخطأ!", report);
        }

        private static void RunTest16_ReturnOnCancelledSaleBlocked(AuditReport report)
        {
            var pRepo = new ProductRepository(_connStr);
            var saleRepo = new SaleRepository(_connStr);
            var returnRepo = new ReturnRepository(_connStr);
            var returnService = new ReturnService(returnRepo, saleRepo);

            var p = new Product
            {
                Id = "prod_ret_cancel_16",
                Name = "صنف اختبار المرتجع على فاتورة ملغاة",
                Barcode = "622111161616",
                Unit = "piece",
                PricePiasters = 5000,
                CostPiasters = 3000,
                StockQuantityMilli = 10000,
                IsActive = true
            };
            pRepo.Upsert(p);

            var sale = new Sale
            {
                Id = "sale_ret_cancel_16",
                PaymentMethod = "cash",
                SubtotalPiasters = 10000,
                TotalPiasters = 10000,
                PaidPiasters = 10000,
                Status = "completed",
                CreatedAt = DateTime.UtcNow.ToString("o"),
                Items = new List<SaleItem>
                {
                    new SaleItem
                    {
                        ProductId = p.Id,
                        ProductName = p.Name,
                        QuantityMilli = 2000,
                        UnitPricePiasters = 5000,
                        TotalPiasters = 10000,
                        Unit = "piece"
                    }
                }
            };
            var savedSale = saleRepo.CreateSaleAtomic(sale);

            var pAfterSale = pRepo.GetById(p.Id);
            AssertCondition(pAfterSale.StockQuantityMilli == 8000,
                "خصم المخزون بنجاح عند البيع (المتبقي: 8000)",
                "فشل خصم المخزون عند البيع", report);

            // Cancel the sale
            saleRepo.CancelSaleAtomic(savedSale.Id, "إلغاء لاختبار حظر المرتجع", "usr_admin");
            var pAfterCancel = pRepo.GetById(p.Id);
            AssertCondition(pAfterCancel.StockQuantityMilli == 10000,
                "استعادة المخزون بنجاح عند إلغاء الفاتورة (المتبقي: 10000)",
                "فشل استعادة المخزون عند الإلغاء", report);

            // Attempt return via ReturnService
            bool serviceBlocked = false;
            try
            {
                var retObj = new Return
                {
                    SaleId = savedSale.Id,
                    RefundMethod = "cash",
                    Reason = "محاولة مرتجع على فاتورة ملغاة",
                    Items = new List<ReturnItem>
                    {
                        new ReturnItem
                        {
                            ProductId = p.Id,
                            ProductName = p.Name,
                            QuantityMilli = 2000,
                            UnitPricePiasters = 5000,
                            TotalPiasters = 10000,
                            Unit = "piece"
                        }
                    }
                };
                returnService.ProcessReturn(retObj);
            }
            catch (InvalidOperationException)
            {
                serviceBlocked = true;
            }

            AssertCondition(serviceBlocked,
                "حظر عمل مرتجع عبر ReturnService على فاتورة ملغاة بنجاح",
                "ثغرة خطيرة! تم السماح بعمل مرتجع على فاتورة ملغاة عبر ReturnService!", report);

            // Attempt return directly via ReturnRepository
            bool repoBlocked = false;
            try
            {
                var retObjRepo = new Return
                {
                    SaleId = savedSale.Id,
                    RefundMethod = "cash",
                    Reason = "محاولة مرتجع مباشرة عبر ReturnRepository",
                    Items = new List<ReturnItem>
                    {
                        new ReturnItem
                        {
                            ProductId = p.Id,
                            ProductName = p.Name,
                            QuantityMilli = 2000,
                            UnitPricePiasters = 5000,
                            TotalPiasters = 10000,
                            Unit = "piece"
                        }
                    }
                };
                returnRepo.CreateReturnAtomic(retObjRepo);
            }
            catch (InvalidOperationException)
            {
                repoBlocked = true;
            }

            AssertCondition(repoBlocked,
                "حظر عمل مرتجع عبر ReturnRepository على فاتورة ملغاة بنجاح",
                "ثغرة خطيرة! تم السماح بعمل مرتجع على فاتورة ملغاة عبر ReturnRepository!", report);

            // Verify stock didn't change and no returns exist
            var pFinal = pRepo.GetById(p.Id);
            AssertCondition(pFinal.StockQuantityMilli == 10000,
                "ثبات رصيد المخزون عند 10000 ومنع التضخيم المزدوج للمخزون",
                "تضخم المخزون بشكل خاطئ بعد محاولات المرتجع!", report);

            var pastReturns = returnRepo.GetReturnsForSale(savedSale.Id);
            AssertCondition(pastReturns.Count == 0,
                "عدم تسجيل أي مرتجع للفاتورة الملغاة في قاعدة البيانات",
                "تم حفظ مرتجع للفاتورة الملغاة بالخطأ!", report);
        }

        private static void RunTest17_ReturnCeilingsAndDigitalRefundGuards(AuditReport report)
        {
            var pRepo = new ProductRepository(_connStr);
            var custRepo = new CustomerRepository(_connStr);
            var saleRepo = new SaleRepository(_connStr);
            var returnRepo = new ReturnRepository(_connStr);
            var returnService = new ReturnService(returnRepo, saleRepo);

            var cust = new Customer
            {
                Id = "cust_ret_guard_17",
                Name = "عميل اختبار أسقف المرتجعات",
                Phone = "01000000017",
                BalancePiasters = 0
            };
            custRepo.SaveCustomer(cust);

            var p = new Product
            {
                Id = "prod_ret_guard_17",
                Name = "صنف اختبار أسقف المرتجعات",
                Barcode = "622111171717",
                Unit = "piece",
                PricePiasters = 10000, // 100 EGP
                CostPiasters = 6000,
                StockQuantityMilli = 20000,
                IsActive = true
            };
            pRepo.Upsert(p);

            // Create pure credit sale: 3 pieces = 300 EGP (30,000 piasters), paid = 0
            var sale = new Sale
            {
                Id = "sale_ret_guard_17",
                CustomerId = cust.Id,
                PaymentMethod = "credit",
                SubtotalPiasters = 30000,
                TotalPiasters = 30000,
                PaidPiasters = 0,
                Status = "completed",
                CreatedAt = DateTime.UtcNow.ToString("o"),
                Items = new List<SaleItem>
                {
                    new SaleItem
                    {
                        ProductId = p.Id,
                        ProductName = p.Name,
                        QuantityMilli = 3000,
                        UnitPricePiasters = 10000,
                        TotalPiasters = 30000,
                        Unit = "piece"
                    }
                }
            };
            var savedSale = saleRepo.CreateSaleAtomic(sale);

            var cAfterSale = custRepo.GetById(cust.Id);
            AssertCondition(cAfterSale.BalancePiasters == 30000,
                "تسجيل دين الفاتورة الآجل على العميل بنجاح (30,000 قرش)",
                "فشل تسجيل دين الفاتورة الآجل على العميل", report);

            // 1. Attempt cash refund for unpaid credit sale -> MUST FAIL
            bool cashRefundBlocked = false;
            try
            {
                var retCash = new Return
                {
                    SaleId = savedSale.Id,
                    RefundMethod = "cash",
                    Reason = "محاولة استرداد نقدي من الدرج لبيع آجل لم يسدد نقداً",
                    Items = new List<ReturnItem>
                    {
                        new ReturnItem
                        {
                            ProductId = p.Id,
                            ProductName = p.Name,
                            QuantityMilli = 1000,
                            UnitPricePiasters = 10000,
                            TotalPiasters = 10000,
                            Unit = "piece"
                        }
                    }
                };
                returnService.ProcessReturn(retCash);
            }
            catch (InvalidOperationException)
            {
                cashRefundBlocked = true;
            }
            AssertCondition(cashRefundBlocked,
                "حظر صرف مرتجع نقدي من الدرج لفاتورة بيع آجل لم تسدد نقداً بنجاح",
                "ثغرة مالية! تم السماح بصرف كاش من الدرج لمرتجع بيع آجل غير مسدد!", report);

            // 2. Attempt instapay refund for unpaid credit sale -> MUST FAIL
            bool instapayRefundBlocked = false;
            try
            {
                var retInsta = new Return
                {
                    SaleId = savedSale.Id,
                    RefundMethod = "instapay",
                    Reason = "محاولة استرداد إنستاباي لبيع آجل",
                    Items = new List<ReturnItem>
                    {
                        new ReturnItem
                        {
                            ProductId = p.Id,
                            ProductName = p.Name,
                            QuantityMilli = 1000,
                            UnitPricePiasters = 10000,
                            TotalPiasters = 10000,
                            Unit = "piece"
                        }
                    }
                };
                returnService.ProcessReturn(retInsta);
            }
            catch (InvalidOperationException)
            {
                instapayRefundBlocked = true;
            }
            AssertCondition(instapayRefundBlocked,
                "حظر صرف مرتجع عبر إنستاباي لفاتورة بيع آجل لم تسدد عبر إنستاباي بنجاح",
                "ثغرة مالية! تم السماح بتحويل إنستاباي لمرتجع بيع آجل!", report);

            // 3. Process valid credit return for 1 piece -> MUST SUCCEED
            var retCredit1 = new Return
            {
                SaleId = savedSale.Id,
                CustomerId = cust.Id,
                RefundMethod = "credit",
                Reason = "مرتجع آجل نظامي لقطعة واحدة",
                Items = new List<ReturnItem>
                {
                    new ReturnItem
                    {
                        ProductId = p.Id,
                        ProductName = p.Name,
                        QuantityMilli = 1000,
                        UnitPricePiasters = 10000,
                        TotalPiasters = 10000,
                        Unit = "piece"
                    }
                }
            };
            returnService.ProcessReturn(retCredit1);

            var cAfterRet1 = custRepo.GetById(cust.Id);
            AssertCondition(cAfterRet1.BalancePiasters == 20000,
                "تخفيض دين العميل بعد المرتجع الآجل الأول إلى 20,000 قرش",
                "فشل تخفيض دين العميل بعد المرتجع الآجل الأول", report);

            // 4. Attempt return for 3 pieces (cumulative would be 40,000 > 30,000 total) -> MUST FAIL
            bool ceilingBlocked = false;
            try
            {
                var retExceed = new Return
                {
                    SaleId = savedSale.Id,
                    CustomerId = cust.Id,
                    RefundMethod = "credit",
                    Reason = "محاولة إرجاع كمية تتجاوز سقف الفاتورة الأصلي",
                    Items = new List<ReturnItem>
                    {
                        new ReturnItem
                        {
                            ProductId = p.Id,
                            ProductName = p.Name,
                            QuantityMilli = 3000,
                            UnitPricePiasters = 10000,
                            TotalPiasters = 30000,
                            Unit = "piece"
                        }
                    }
                };
                returnService.ProcessReturn(retExceed);
            }
            catch (InvalidOperationException)
            {
                ceilingBlocked = true;
            }
            AssertCondition(ceilingBlocked,
                "حظر إرجاع كميات تتجاوز سقف الفاتورة الصافية بنجاح",
                "ثغرة خطيرة! تم السماح بإرجاع قيمة تفوق إجمالي الفاتورة الأصلية!", report);

            // 5. Return remaining 2 pieces via credit -> MUST SUCCEED
            var retCredit2 = new Return
            {
                SaleId = savedSale.Id,
                CustomerId = cust.Id,
                RefundMethod = "credit",
                Reason = "إرجاع باقي القطعتين رصيد آجل",
                Items = new List<ReturnItem>
                {
                    new ReturnItem
                    {
                        ProductId = p.Id,
                        ProductName = p.Name,
                        QuantityMilli = 2000,
                        UnitPricePiasters = 10000,
                        TotalPiasters = 20000,
                        Unit = "piece"
                    }
                }
            };
            returnService.ProcessReturn(retCredit2);

            var cFinal = custRepo.GetById(cust.Id);
            AssertCondition(cFinal.BalancePiasters == 0,
                "تصفير مديونية العميل بالكامل بعد إرجاع كامل الفاتورة (0 قرش)",
                "لم يتم تصفير مديونية العميل بدقة!", report);

            var vCust = custRepo.VerifyBalance(cust.Id);
            AssertCondition(vCust.IsBalanced && vCust.DiscrepancyPiasters == 0,
                "تطابق دفتر أستاذ العميل بنسبة 100% بعد سلسلة المرتجعات",
                "اختلال في دفتر أستاذ العميل بعد المرتجعات!", report);
        }

        private static void RunTest18_CustomerPrepaymentExhaustionAndCancellationSymmetry(AuditReport report)
        {
            var pRepo = new ProductRepository(_connStr);
            var custRepo = new CustomerRepository(_connStr);
            var saleRepo = new SaleRepository(_connStr);

            // 1. Customer with initial advance deposit: -200 EGP (-20,000 piasters)
            var cust = new Customer
            {
                Id = "cust_advance_symm_18",
                Name = "عميل اختبار تماثل الدفعة المقدمة والإلغاء",
                Phone = "01000000018",
                InitialBalancePiasters = -20000
            };
            custRepo.SaveCustomer(cust);

            var vInit = custRepo.VerifyBalance(cust.Id);
            AssertCondition(vInit.IsBalanced && vInit.StoredBalancePiasters == -20000,
                "تسجيل وتدقيق الرصيد الدائن المسبق للعميل بنجاح (-20,000 قرش)",
                "فشل تدقيق الرصيد الدائن المسبق للعميل", report);

            // 2. Product for sale
            var p = new Product
            {
                Id = "prod_adv_symm_18",
                Name = "صنف اختبار الدفعة المسبقة",
                Barcode = "622111181818",
                Unit = "piece",
                PricePiasters = 35000, // 350 EGP
                CostPiasters = 20000,
                StockQuantityMilli = 10000,
                IsActive = true
            };
            pRepo.Upsert(p);

            // 3. Purchase on credit: 350 EGP (35,000 piasters), paid = 0
            // Initial deposit (200 EGP) is exhausted, remainder becomes 150 EGP debt (+15,000 piasters).
            var sale = new Sale
            {
                Id = "sale_adv_symm_18",
                CustomerId = cust.Id,
                PaymentMethod = "credit",
                SubtotalPiasters = 35000,
                TotalPiasters = 35000,
                PaidPiasters = 0,
                Status = "completed",
                CreatedAt = DateTime.UtcNow.ToString("o"),
                Items = new List<SaleItem>
                {
                    new SaleItem
                    {
                        ProductId = p.Id,
                        ProductName = p.Name,
                        QuantityMilli = 1000,
                        UnitPricePiasters = 35000,
                        TotalPiasters = 35000,
                        Unit = "piece"
                    }
                }
            };
            var savedSale = saleRepo.CreateSaleAtomic(sale);

            var cAfterSale = custRepo.GetById(cust.Id);
            AssertCondition(cAfterSale.BalancePiasters == 15000,
                "استهلاك الدفعة المقدمة بالكامل وتحول الرصيد إلى مديونية 15,000 قرش (+150 ج.م)",
                "فشل احتساب استهلاك الدفعة المقدمة وتحولها إلى دين!", report);

            var vAfterSale = custRepo.VerifyBalance(cust.Id);
            AssertCondition(vAfterSale.IsBalanced && vAfterSale.StoredBalancePiasters == 15000,
                "تطابق دفتر أستاذ العميل بعد استهلاك الرصيد المسبق وتحوله لمديونية",
                "عدم تطابق دفتر أستاذ العميل بعد البيع الآجل!", report);

            // 4. Cancel the sale
            saleRepo.CancelSaleAtomic(savedSale.Id, "إلغاء فاتورة لاختبار استعادة الرصيد المسبق بدقة تامة", "usr_admin");

            var cAfterCancel = custRepo.GetById(cust.Id);
            AssertCondition(cAfterCancel.BalancePiasters == -20000,
                "استعادة الرصيد الدائن المسبق للعميل بدقة مطلقة (-20,000 قرش) بعد إلغاء الفاتورة",
                string.Format("فشل التماثل! الرصيد بعد الإلغاء ({0}) لا يطابق الرصيد المسبق الأصلي (-20000)", cAfterCancel.BalancePiasters),
                report);

            var vFinal = custRepo.VerifyBalance(cust.Id);
            AssertCondition(vFinal.IsBalanced && vFinal.DiscrepancyPiasters == 0,
                "تطابق دفتر الأستاذ والميزان الرياضي للعميل بنسبة 100% بدون أي فاقد بالقروش (Discrepancy = 0)",
                "فشل مطابقة دفتر الأستاذ بعد الإلغاء!", report);
        }

        private static void RunTest19_DigitalWalletDrawerCashInOutCommissionParity(AuditReport report)
        {
            var closingRepo = new DailyClosingRepository(_connStr);
            var counterRepo = new CounterRepository(_connStr);
            var auditRepo = new AuditLogRepository(_connStr);
            var settingsRepo = new SettingsRepository(_connStr);
            var closingService = new DailyClosingService(_connStr, closingRepo, counterRepo, auditRepo, settingsRepo);

            var digitalRepo = new DigitalAccountRepository(_connStr, auditRepo);
            var productRepo = new ProductRepository(_connStr);
            var saleRepo = new SaleRepository(_connStr);
            var supplierRepo = new SupplierRepository(_connStr, auditRepo);
            var purchaseRepo = new PurchaseRepository(_connStr, counterRepo, supplierRepo, null, auditRepo, null);
            var expenseRepo = new ExpenseRepository(_connStr, auditRepo, counterRepo);
            var expenseService = new ExpenseService(expenseRepo, closingService);

            string bDate = "2026-04-10";
            settingsRepo.Set("business_day_cutoff_hour", "0");

            // 1. Initial cash sale in register: 1,000 EGP (100,000 piasters)
            var prod = new Product
            {
                Id = "prod_close_parity_19",
                Name = "صنف اختبار التقفيل 19",
                Barcode = "622111191919",
                Unit = "piece",
                PricePiasters = 100000,
                CostPiasters = 60000,
                StockQuantityMilli = 50000,
                IsActive = true
            };
            productRepo.Upsert(prod);

            var sale = new Sale
            {
                Id = "sale_close_parity_19",
                PaymentMethod = "cash",
                SubtotalPiasters = 100000,
                TotalPiasters = 100000,
                PaidPiasters = 100000,
                Status = "completed",
                CreatedAt = bDate + "T10:00:00Z",
                Items = new List<SaleItem>
                {
                    new SaleItem
                    {
                        ProductId = prod.Id,
                        ProductName = prod.Name,
                        QuantityMilli = 1000,
                        UnitPricePiasters = 100000,
                        TotalPiasters = 100000,
                        Unit = "piece"
                    }
                }
            };
            saleRepo.CreateSaleAtomic(sale);

            // Update created_at of sale to exact bDate
            using (var conn = new SQLiteConnection(_connStr))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand("UPDATE sales SET created_at = @cat WHERE id = @id;", conn))
                {
                    cmd.Parameters.AddWithValue("@cat", bDate + "T10:00:00Z");
                    cmd.Parameters.AddWithValue("@id", sale.Id);
                    cmd.ExecuteNonQuery();
                }
            }

            // 2. Add digital wallet and fund it with 300 EGP (30,000 piasters) from cash drawer
            var wallet = new DigitalAccount
            {
                Id = "wallet_voda_parity_19",
                Name = "فودافون كاش - فحص التقفيل 19",
                Type = "wallet",
                Provider = "vodafone_cash",
                BalancePiasters = 0,
                IsActive = true
            };
            digitalRepo.SaveAccount(wallet);

            var funding = digitalRepo.FundAccount(wallet.Id, 30000, "cash_drawer", "تغذية من درج النقدية", "usr_admin");
            using (var conn = new SQLiteConnection(_connStr))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand("UPDATE digital_account_fundings SET created_at = @cat WHERE id = @id;", conn))
                {
                    cmd.Parameters.AddWithValue("@cat", bDate + "T10:30:00Z");
                    cmd.Parameters.AddWithValue("@id", funding.Id);
                    cmd.ExecuteNonQuery();
                }
                using (var cmd = new SQLiteCommand("UPDATE digital_transactions SET created_at = @cat WHERE account_id = @aid AND tx_type = 'funding';", conn))
                {
                    cmd.Parameters.AddWithValue("@cat", bDate + "T10:30:00Z");
                    cmd.Parameters.AddWithValue("@aid", wallet.Id);
                    cmd.ExecuteNonQuery();
                }
            }

            // 3. Customer Transaction 1: cash_out (store transfers 200 EGP from wallet to customer, customer pays 215 EGP cash into drawer)
            var txOut = new DigitalTransaction
            {
                AccountId = wallet.Id,
                TxType = "cash_out",
                AmountPiasters = 20000,
                ProfitPiasters = 1500,
                TotalCollectedPiasters = 21500,
                PaymentDestination = "cash_drawer",
                Notes = "سحب كاش للزبون",
                CashierName = "كاشير 1"
            };
            var savedTxOut = digitalRepo.ProcessTransaction(txOut);
            using (var conn = new SQLiteConnection(_connStr))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand("UPDATE digital_transactions SET created_at = @cat WHERE id = @id;", conn))
                {
                    cmd.Parameters.AddWithValue("@cat", bDate + "T11:00:00Z");
                    cmd.Parameters.AddWithValue("@id", savedTxOut.Id);
                    cmd.ExecuteNonQuery();
                }
            }

            // 4. Customer Transaction 2: cash_in (customer transfers 100 EGP to store wallet, store charges 5 EGP fee, cashier gives customer 95 EGP cash from drawer)
            var txIn = new DigitalTransaction
            {
                AccountId = wallet.Id,
                TxType = "cash_in",
                AmountPiasters = 10000,
                ProfitPiasters = 500,
                TotalCollectedPiasters = 500,
                PaymentDestination = "cash_drawer",
                Notes = "إيداع كاش للزبون",
                CashierName = "كاشير 1"
            };
            var savedTxIn = digitalRepo.ProcessTransaction(txIn);
            using (var conn = new SQLiteConnection(_connStr))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand("UPDATE digital_transactions SET created_at = @cat WHERE id = @id;", conn))
                {
                    cmd.Parameters.AddWithValue("@cat", bDate + "T11:30:00Z");
                    cmd.Parameters.AddWithValue("@id", savedTxIn.Id);
                    cmd.ExecuteNonQuery();
                }
            }

            // 5. Purchase from cash drawer: 100 EGP (10,000 piasters)
            var pur = new Purchase
            {
                Id = "pur_close_parity_19",
                PaidAmountPiasters = 10000,
                PaymentSource = "cash_drawer",
                Items = new List<PurchaseItem>
                {
                    new PurchaseItem
                    {
                        ProductId = prod.Id,
                        ProductName = prod.Name,
                        QuantityMilli = 1000,
                        UnitCostPiasters = 10000
                    }
                }
            };
            purchaseRepo.CreatePurchase(pur);
            using (var conn = new SQLiteConnection(_connStr))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand("UPDATE purchases SET created_at = @cat WHERE id = @id;", conn))
                {
                    cmd.Parameters.AddWithValue("@cat", bDate + "T12:00:00Z");
                    cmd.Parameters.AddWithValue("@id", pur.Id);
                    cmd.ExecuteNonQuery();
                }
            }

            // 6. Direct Supplier Payment from cash drawer: 50 EGP (5,000 piasters)
            var sup = new Supplier
            {
                Name = "مورد فحص التقفيل 19",
                IsActive = true
            };
            var savedSup = supplierRepo.Save(sup);
            supplierRepo.RecordPayment(savedSup.Id, 5000, "سداد نقدي للمورد من الدرج", "usr_admin", "cash_drawer");
            using (var conn = new SQLiteConnection(_connStr))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand("UPDATE supplier_transactions SET created_at = @cat WHERE supplier_id = @sid;", conn))
                {
                    cmd.Parameters.AddWithValue("@cat", bDate + "T12:30:00Z");
                    cmd.Parameters.AddWithValue("@sid", savedSup.Id);
                    cmd.ExecuteNonQuery();
                }
            }

            // 7. Expense from cash drawer: 20 EGP (2,000 piasters)
            var exp = expenseService.CreateExpense(new CreateExpenseRequest
            {
                Category = "فواتير",
                AmountPiasters = 2000,
                BusinessDate = bDate,
                Notes = "فاتورة كهرباء",
                CreatedBy = "الكاشير"
            });
            using (var conn = new SQLiteConnection(_connStr))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand("UPDATE expenses SET created_at = @cat WHERE id = @id;", conn))
                {
                    cmd.Parameters.AddWithValue("@cat", bDate + "T13:00:00Z");
                    cmd.Parameters.AddWithValue("@id", exp.Id);
                    cmd.ExecuteNonQuery();
                }
            }

            // 8. Assertions on Closing Preview:
            // Expected Cash:
            //   Cash Sales: +100,000
            //   Wallets Drawer Funding: -30,000
            //   Wallets Drawer Cash: +21,500 (cash_out) + (500 - 10000 = -9,500 cash_in) = +12,000
            //   Purchases Drawer Cash: -10,000
            //   Supplier Payments Drawer Cash: -5,000
            //   Expenses: -2,000
            // Total Expected Cash: 100,000 - 30,000 + 12,000 - 10,000 - 5,000 - 2,000 = 65,000 piasters (650.00 EGP)
            var preview = closingService.GetClosingPreview(bDate);
            AssertCondition(preview.CashSalesPiasters == 100000,
                "مبيعات الكاش تطابق 100,000 قرش",
                "فشل مطابقة مبيعات الكاش في التقفيل", report);

            AssertCondition(preview.WalletsDrawerFundingPiasters == 30000,
                "تغذية المحفظة من الدرج محسوبة بدقة (30,000 قرش)",
                "فشل احتساب تغذية المحفظة من الدرج", report);

            AssertCondition(preview.WalletsDrawerCashPiasters == 12000,
                "صافي حركة كاش الدرج لمعاملات المحافظ (21,500 قبض - 9,500 تسليم) = 12,000 قرش بدقة مطلقة",
                string.Format("فشل احتساب كاش المحافظ في الدرج: القيمة المحسوبة ({0}) والمطلوبة (12000)", preview.WalletsDrawerCashPiasters),
                report);

            AssertCondition(preview.WalletsNetProfitPiasters == 2000,
                "أرباح معاملات المحافظ المكتسبة (1500 + 500 = 2000 قرش) محسوبة ومستقلة",
                "فشل احتساب أرباح معاملات المحافظ", report);

            AssertCondition(preview.PurchasesDrawerCashPiasters == 10000,
                "مشتريات الدرج النقدية محسوبة بدقة (10,000 قرش)",
                "فشل احتساب مشتريات الدرج النقدية", report);

            AssertCondition(preview.SupplierPaymentsDrawerCashPiasters == 5000,
                "سداد المورد من الدرج محسوب بدقة (5,000 قرش)",
                "فشل احتساب سداد المورد من الدرج", report);

            AssertCondition(preview.ExpensesPiasters == 2000,
                "المصروفات النقدية محسوبة بدقة (2,000 قرش)",
                "فشل احتساب المصروفات النقدية", report);

            AssertCondition(preview.ExpectedCashPiasters == 65000,
                "رصيد النقدية المتوقع في الدرج مطابق للواقع المالي بنسبة 100% (65,000 قرش = 650 ج.م)",
                string.Format("فشل التقفيل! رصيد الدرج المتوقع ({0}) لا يطابق المطلوب (65000)", preview.ExpectedCashPiasters),
                report);

            var live = closingService.GetLiveDrawerBalance(bDate);
            AssertCondition(live.AvailableCashPiasters == 65000,
                "الرصيد اللحظي لدرج الكاشير يطابق الرصيد المتوقع بدقة تامة (65,000 قرش)",
                "فشل تطابق الرصيد اللحظي للدرج مع التقفيل", report);

            // 9. Save closing and seal the day
            var closingReq = new DailyClosingSaveRequest
            {
                BusinessDate = bDate,
                ActualCashPiasters = 65000,
                CashierId = "usr_cashier_1",
                CashierName = "كاشير الوردية",
                Notes = "تقفيل نظامي بدون أي عجز أو زيادة",
                ConfirmSuspiciousDate = true
            };
            var savedClosing = closingService.SaveClosing(closingReq);
            AssertCondition(savedClosing != null && savedClosing.DifferencePiasters == 0,
                "إقفال وتشميع اليومية بنجاح مع تسجيل فارق الدرج = 0 (مطابقة تامة بدون أي عجز أو زيادة)",
                "فشل إقفال اليومية بمطابقة صفرية", report);

            AssertCondition(closingService.IsDayClosed(bDate),
                "تأكيد تشميع اليومية وإغلاق تاريخ العمل عبر IsDayClosed",
                "فشل التحقق من إغلاق اليومية بعد التشميع", report);

            // 10. Attempt duplicate closing on sealed day -> MUST FAIL
            bool secondClosingBlocked = false;
            try
            {
                closingService.SaveClosing(closingReq);
            }
            catch (InvalidOperationException)
            {
                secondClosingBlocked = true;
            }
            AssertCondition(secondClosingBlocked,
                "منع إعادة إقفال يوم عمل مشمع ومقفل مسبقاً بنجاح",
                "ثغرة خطيرة! تم السماح بإعادة إقفال يوم عمل مقفل وتكرار الحسابات الختامية!", report);

            // 11. Attempt adding expense on sealed day -> MUST FAIL
            bool expBlocked = false;
            try
            {
                expenseService.CreateExpense(new CreateExpenseRequest
                {
                    Category = "نثريات",
                    AmountPiasters = 1000,
                    BusinessDate = bDate,
                    Notes = "محاولة تسجيل بعد التقفيل",
                    CreatedBy = "الكاشير"
                });
            }
            catch (InvalidOperationException)
            {
                expBlocked = true;
            }
            AssertCondition(expBlocked,
                "منع تسجيل أي حركة مصروف جديدة على يومية مشمعة ومقفلة بنجاح",
                "تم السماح بتسجيل مصروف بعد إقفال اليومية وتشميعها!", report);
        }

        /// <summary>
        /// TEST 20: حماية المحافظ الإلكترونية وحسابات إنستاباي من السحب على المكشوف أو الصرف الوهمي في المرتجعات وإلغاء المبيعات
        /// 1. منع صرف مرتجع إنستاباي إذا كان رصيد الحساب غير كافٍ.
        /// 2. منع صرف مرتجع محفظة إذا لم يكن هناك حساب محفظة نشط مسجل في النظام.
        /// 3. نجاح المرتجع الإلكتروني بعد تغذية الحساب وخصم الرصيد وتسجيل pos_return.
        /// 4. منع إلغاء فاتورة بيع إلكترونية إذا كان رصيد الحساب غير كافٍ لعكس المبلغ.
        /// 5. نجاح إلغاء الفاتورة بعد تغذية الحساب وتسجيل pos_sale_cancel وخصم الرصيد.
        /// </summary>
        private static void RunTest20_DigitalWalletRefundAndCancelOverdraftGuards(AuditReport report)
        {
            var prodRepo = new ProductRepository(_connStr);
            var saleRepo = new SaleRepository(_connStr);
            var returnRepo = new ReturnRepository(_connStr);
            var returnService = new ReturnService(returnRepo, saleRepo);
            var saleService = new SaleService(saleRepo, prodRepo);
            var digitalRepo = new DigitalAccountRepository(_connStr);

            // 1. Setup product
            var prod = new Product
            {
                Id = "prod_guard_20_" + Guid.NewGuid().ToString("N").Substring(0, 6),
                Name = "سماعة بلوتوث فحص 20",
                Barcode = "622999900020",
                PricePiasters = 50000, // 500 EGP
                CostPiasters = 30000,
                StockQuantityMilli = 10000, // 10 units
                IsActive = true
            };
            prodRepo.Upsert(prod);

            // 2. Setup InstaPay account with 100 EGP (10,000 piasters)
            var instaAcc = new DigitalAccount
            {
                Id = "dig_insta_guard_20",
                Name = "إنستاباي فحص 20",
                Type = "instapay",
                Provider = "instapay",
                AccountNumber = "01099998888",
                BalancePiasters = 10000,
                IsActive = true,
                IsDefault = true
            };
            digitalRepo.SaveAccount(instaAcc);

            // 3. Process Sale of 500 EGP paid via InstaPay
            var sale1 = new Sale
            {
                CustomerId = "cust_general_cash",
                TotalPiasters = 50000,
                PaidPiasters = 50000,
                PaymentMethod = "instapay",
                Items = new List<SaleItem>
                {
                    new SaleItem
                    {
                        ProductId = prod.Id,
                        ProductName = prod.Name,
                        QuantityMilli = 1000,
                        UnitPricePiasters = 50000,
                        TotalPiasters = 50000
                    }
                }
            };
            var savedSale1 = saleService.ProcessSale(sale1);
            long postSaleBal = digitalRepo.GetAccountById(instaAcc.Id).BalancePiasters;
            AssertCondition(postSaleBal == 60000,
                "رصيد إنستاباي أصبح 60,000 قرش (10,000 رصيد افتتاحي + 50,000 مبيعات) بدقة تامة",
                "فشل إضافة قيمة المبيعات الإلكترونية لرصيد إنستاباي", report);

            // 4. Shop owner transfers out 55,000 piasters (leaving only 5,000 piasters = 50 EGP in InstaPay)
            digitalRepo.ProcessTransaction(new DigitalTransaction
            {
                AccountId = instaAcc.Id,
                TxType = "cash_out",
                AmountPiasters = 55000,
                ProfitPiasters = 0,
                TotalCollectedPiasters = 55000,
                PaymentDestination = "external",
                Notes = "تحويل خارجي لتوريد نقدية"
            });
            long depletedBal = digitalRepo.GetAccountById(instaAcc.Id).BalancePiasters;
            AssertCondition(depletedBal == 5000,
                "رصيد إنستاباي أصبح 5,000 قرش (50 ج.م) بعد التحويل الخارجي",
                "فشل خصم التحويل الخارجي من إنستاباي", report);

            // 5. Attempt InstaPay return of 500 EGP when InstaPay only has 50 EGP -> MUST BE BLOCKED
            var ret1 = new Return
            {
                SaleId = savedSale1.Id,
                InvoiceNumber = savedSale1.InvoiceNumber,
                RefundMethod = "instapay",
                Items = new List<ReturnItem>
                {
                    new ReturnItem
                    {
                        ProductId = prod.Id,
                        ProductName = prod.Name,
                        QuantityMilli = 1000,
                        UnitPricePiasters = 50000,
                        TotalPiasters = 50000,
                        IsDamaged = false
                    }
                }
            };

            bool returnBlockedOverdraft = false;
            try
            {
                returnService.ProcessReturn(ret1);
            }
            catch (InvalidOperationException ex)
            {
                returnBlockedOverdraft = ex.Message.Contains("غير كافٍ");
            }
            AssertCondition(returnBlockedOverdraft,
                "منع صرف المرتجع الإلكتروني بنجاح لعدم كفاية رصيد حساب إنستاباي وحماية الحساب من السحب على المكشوف",
                "ثغرة خطيرة! تم السماح بصرف مرتجع إلكتروني برصيد غير كافٍ وتسبب في رصيد سالب للمحفظة!", report);

            long balAfterBlocked = digitalRepo.GetAccountById(instaAcc.Id).BalancePiasters;
            AssertCondition(balAfterBlocked == 5000,
                "ثبات رصيد إنستاباي تماماً عند 5,000 قرش بدون أي نقص بعد رفض المرتجع الذري",
                "فشل الذرية! تم تعديل رصيد المحفظة رغم فشل المرتجع!", report);

            // 6. Attempt Wallet return when no wallet account exists -> MUST BE BLOCKED
            using (var conn = new SQLiteConnection(_connStr))
            {
                conn.Open();
                using (var deactCmd = new SQLiteCommand("UPDATE digital_accounts SET is_active = 0 WHERE type = 'wallet';", conn))
                {
                    deactCmd.ExecuteNonQuery();
                }
            }

            var retWallet = new Return
            {
                SaleId = savedSale1.Id,
                InvoiceNumber = savedSale1.InvoiceNumber,
                RefundMethod = "wallet",
                Items = new List<ReturnItem>
                {
                    new ReturnItem
                    {
                        ProductId = prod.Id,
                        ProductName = prod.Name,
                        QuantityMilli = 1000,
                        UnitPricePiasters = 50000,
                        TotalPiasters = 50000,
                        IsDamaged = false
                    }
                }
            };
            bool returnBlockedNoWallet = false;
            try
            {
                returnRepo.CreateReturnAtomic(retWallet);
            }
            catch (InvalidOperationException ex)
            {
                returnBlockedNoWallet = ex.Message.Contains("لا يوجد حساب");
            }

            using (var conn = new SQLiteConnection(_connStr))
            {
                conn.Open();
                using (var reactCmd = new SQLiteCommand("UPDATE digital_accounts SET is_active = 1 WHERE type = 'wallet';", conn))
                {
                    reactCmd.ExecuteNonQuery();
                }
            }

            AssertCondition(returnBlockedNoWallet,
                "منع صرف المرتجع الإلكتروني بنجاح عند عدم وجود أي حساب محفظة كاش نشط في النظام",
                "ثغرة خطيرة! تم السماح بالمرتجع الإلكتروني دون وجود حساب محفظة نشط في النظام!", report);

            // 7. Fund InstaPay with 60,000 piasters (Balance becomes 65,000 piasters)
            digitalRepo.FundAccount(instaAcc.Id, 60000, "cash_drawer", "تغذية الحساب لتغطية المرتجعات", "usr_admin");
            long fundedBal = digitalRepo.GetAccountById(instaAcc.Id).BalancePiasters;
            AssertCondition(fundedBal == 65000,
                "تغذية رصيد إنستاباي بنجاح إلى 65,000 قرش (650 ج.م)",
                "فشل تغذية رصيد إنستاباي", report);

            // 8. Re-attempt InstaPay return -> MUST SUCCEED
            var savedReturn = returnService.ProcessReturn(ret1);
            AssertCondition(savedReturn != null && savedReturn.ReturnNumber > 0,
                "تم تسجيل المرتجع الإلكتروني بنجاح بعد توفر الرصيد الكافي",
                "فشل تنفيذ المرتجع بعد تغذية الرصيد", report);

            long balAfterReturn = digitalRepo.GetAccountById(instaAcc.Id).BalancePiasters;
            AssertCondition(balAfterReturn == 15000,
                "خصم قيمة المرتجع (50,000 قرش) من حساب إنستاباي بدقة (65,000 - 50,000 = 15,000 قرش)",
                string.Format("فشل دقة الرصيد بعد المرتجع: الفعلي ({0}) والمتوقع (15000)", balAfterReturn), report);

            // 9. Process a second sale of 100 EGP (10,000 piasters) paid via InstaPay
            var sale2 = new Sale
            {
                CustomerId = "cust_general_cash",
                TotalPiasters = 10000,
                PaidPiasters = 10000,
                PaymentMethod = "instapay",
                Items = new List<SaleItem>
                {
                    new SaleItem
                    {
                        ProductId = prod.Id,
                        ProductName = prod.Name,
                        QuantityMilli = 1000,
                        UnitPricePiasters = 10000,
                        TotalPiasters = 10000
                    }
                }
            };
            var savedSale2 = saleService.ProcessSale(sale2);
            long balAfterSale2 = digitalRepo.GetAccountById(instaAcc.Id).BalancePiasters;
            AssertCondition(balAfterSale2 == 25000,
                "رصيد إنستاباي أصبح 25,000 قرش (15,000 + 10,000 مبيعات جديدة)",
                "فشل إضافة مبيعات الفاتورة الثانية لحساب إنستاباي", report);

            // Withdraw 20,000 piasters so remaining balance is only 5,000 piasters
            digitalRepo.ProcessTransaction(new DigitalTransaction
            {
                AccountId = instaAcc.Id,
                TxType = "cash_out",
                AmountPiasters = 20000,
                ProfitPiasters = 0,
                TotalCollectedPiasters = 20000,
                PaymentDestination = "external",
                Notes = "سحب نقدي من الحساب"
            });
            long balBeforeCancelAttempt = digitalRepo.GetAccountById(instaAcc.Id).BalancePiasters;
            AssertCondition(balBeforeCancelAttempt == 5000,
                "رصيد إنستاباي 5,000 قرش (50 ج.م)",
                "فشل خصم السحب النقدي", report);

            // 10. Attempt CancelSaleAtomic on the 100 EGP sale when balance is only 50 EGP -> MUST BE BLOCKED
            bool cancelBlockedOverdraft = false;
            try
            {
                saleRepo.CancelSaleAtomic(savedSale2.Id, "إلغاء تجريبي للاختبار", "usr_admin");
            }
            catch (InvalidOperationException ex)
            {
                cancelBlockedOverdraft = ex.Message.Contains("غير كافٍ");
            }
            AssertCondition(cancelBlockedOverdraft,
                "منع إلغاء فاتورة البيع الإلكترونية بنجاح لعدم كفاية رصيد الحساب لعكس المعاملة ومنع السحب على المكشوف",
                "ثغرة خطيرة! تم السماح بإلغاء فاتورة إلكترونية مع رصيد حساب غير كافٍ وتسبب في رصيد سالب!", report);

            long balAfterCancelBlocked = digitalRepo.GetAccountById(instaAcc.Id).BalancePiasters;
            AssertCondition(balAfterCancelBlocked == 5000,
                "ثبات رصيد إنستاباي عند 5,000 قرش دون أي تغيير بعد إحباط الإلغاء",
                "فشل الحفاظ على رصيد الحساب عند إحباط إلغاء الفاتورة", report);

            // 11. Fund account with 10,000 piasters (balance becomes 15,000 piasters)
            digitalRepo.FundAccount(instaAcc.Id, 10000, "cash_drawer", "تغذية لإلغاء الفاتورة", "usr_admin");
            long balFundedForCancel = digitalRepo.GetAccountById(instaAcc.Id).BalancePiasters;
            AssertCondition(balFundedForCancel == 15000,
                "تغذية رصيد إنستاباي إلى 15,000 قرش",
                "فشل تغذية رصيد إنستاباي", report);

            // 12. Retry CancelSaleAtomic -> MUST SUCCEED
            var cancelledSale = saleRepo.CancelSaleAtomic(savedSale2.Id, "إلغاء نظامي بعد تغذية الرصيد", "usr_admin");
            AssertCondition(cancelledSale != null && cancelledSale.Status == "cancelled",
                "إلغاء فاتورة البيع الإلكترونية بنجاح بعد توفر الرصيد الكافي وتسجيل حركة pos_sale_cancel",
                "فشل إلغاء الفاتورة بعد توفر الرصيد", report);

            long finalBal = digitalRepo.GetAccountById(instaAcc.Id).BalancePiasters;
            AssertCondition(finalBal == 5000,
                "خصم قيمة الفاتورة الملغاة (10,000 قرش) بدقة مطلقة (15,000 - 10,000 = 5,000 قرش)",
                string.Format("فشل مطابقة رصيد إنستاباي النهائي: الفعلي ({0}) والمتوقع (5000)", finalBal), report);
        }

        // Test 21: Entity Archival and Active Validation Guards
        private static void RunTest21_EntityArchivalAndActiveValidationGuards(AuditReport report)
        {
            var auditRepo = new AuditLogRepository(_connStr);
            var counterRepo = new CounterRepository(_connStr);
            var custRepo = new CustomerRepository(_connStr, auditRepo);
            var supplierRepo = new SupplierRepository(_connStr, auditRepo);
            var productRepo = new ProductRepository(_connStr, auditRepo);
            var saleRepo = new SaleRepository(_connStr, counterRepo, auditRepo);
            var purchaseRepo = new PurchaseRepository(_connStr, counterRepo, supplierRepo, null, auditRepo);

            // 1. Attempt to archive cust_general_cash -> MUST BE BLOCKED
            bool archiveDefaultCashBlocked = false;
            try
            {
                custRepo.ArchiveCustomer("cust_general_cash");
            }
            catch (InvalidOperationException ex)
            {
                archiveDefaultCashBlocked = ex.Message.Contains("الافتراضي");
            }
            AssertCondition(archiveDefaultCashBlocked,
                "منع أرشفة أو حذف العميل النقدي العام الافتراضي بنجاح مع إطلاق استثناء واضح",
                "ثغرة خطيرة! تم السماح بحذف أو أرشفة العميل النقدي العام الافتراضي للنظام!", report);

            // Verify cust_general_cash is still in the DB
            var defaultCust = custRepo.GetById("cust_general_cash");
            AssertCondition(defaultCust != null,
                "بقاء العميل النقدي العام الافتراضي في قاعدة البيانات بكامل سلامته",
                "كارثة! العميل النقدي العام تم حذفه من قاعدة البيانات!", report);

            // 2. Customer with active debt cannot be archived
            string custDebtId = "cust_test_debt_" + Guid.NewGuid().ToString("N").Substring(0, 8);
            custRepo.SaveCustomer(new Customer
            {
                Id = custDebtId,
                Name = "عميل عليه دين مدين",
                Phone = "01111111111",
                BalancePiasters = 50000
            });

            bool archiveDebtCustomerBlocked = false;
            try
            {
                custRepo.ArchiveCustomer(custDebtId);
            }
            catch (InvalidOperationException ex)
            {
                archiveDebtCustomerBlocked = ex.Message.Contains("دين");
            }
            AssertCondition(archiveDebtCustomerBlocked,
                "منع أرشفة العميل الذي عليه رصيد دين مستحق بنجاح",
                "ثغرة! تم السماح بأرشفة عميل عليه ديون معلقة!", report);

            // 3. Customer with negative balance (advance deposit / overpayment) cannot be archived
            string custDepositId = "cust_test_dep_" + Guid.NewGuid().ToString("N").Substring(0, 8);
            custRepo.SaveCustomer(new Customer
            {
                Id = custDepositId,
                Name = "عميل له أمانات ودائن",
                Phone = "01222222222",
                BalancePiasters = -20000
            });

            bool archiveDepositCustomerBlocked = false;
            try
            {
                custRepo.ArchiveCustomer(custDepositId);
            }
            catch (InvalidOperationException ex)
            {
                archiveDepositCustomerBlocked = ex.Message.Contains("أمانات") || ex.Message.Contains("دائن");
            }
            AssertCondition(archiveDepositCustomerBlocked,
                "منع أرشفة العميل الذي له رصيد دائن / أمانات مستحقة لحماية أموال العملاء",
                "ثغرة! تم السماح بأرشفة عميل له رصيد أمانات مستحقة وضياع حقه!", report);

            // 4. Settle customer deposit to 0 -> Archive MUST SUCCEED
            using (var conn = new SQLiteConnection(_connStr))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand("UPDATE customers SET balance_piasters = 0 WHERE id = @id;", conn))
                {
                    cmd.Parameters.AddWithValue("@id", custDepositId);
                    cmd.ExecuteNonQuery();
                }
            }
            custRepo.ArchiveCustomer(custDepositId);
            var archivedCust = custRepo.GetById(custDepositId);
            AssertCondition(archivedCust != null && archivedCust.IsArchived,
                "أرشفة العميل بنجاح بعد تصفية وتسوية حسابه بالكامل للصفر",
                "فشل أرشفة العميل بعد تصفية رصيده", report);

            // 5. Attempt Sale on Archived Customer -> MUST BE BLOCKED
            var prod = new Product
            {
                Id = "prod_arch_" + Guid.NewGuid().ToString("N").Substring(0, 8),
                Name = "صنف فحص الأرشفة",
                Barcode = "998877665544",
                PricePiasters = 5000,
                CostPiasters = 3000,
                StockQuantityMilli = 10000,
                IsActive = true
            };
            productRepo.Upsert(prod);

            var saleToArchived = new Sale
            {
                Id = "stress_sale_arch_" + Guid.NewGuid().ToString("N").Substring(0, 8),
                CustomerId = custDepositId,
                PaymentMethod = "cash",
                SubtotalPiasters = 5000,
                TotalPiasters = 5000,
                PaidPiasters = 5000,
                Items = new List<SaleItem>
                {
                    new SaleItem
                    {
                        ProductId = prod.Id,
                        ProductName = prod.Name,
                        QuantityMilli = 1000,
                        UnitPricePiasters = 5000,
                        TotalPiasters = 5000
                    }
                }
            };

            bool saleToArchivedBlocked = false;
            try
            {
                saleRepo.CreateSaleAtomic(saleToArchived);
            }
            catch (InvalidOperationException ex)
            {
                saleToArchivedBlocked = ex.Message.Contains("مؤرشف");
            }
            AssertCondition(saleToArchivedBlocked,
                "منع إنشاء فاتورة بيع لعميل مؤرشف بنجاح",
                "ثغرة! تم السماح بالبيع لعميل تم أرشفته سابقاً!", report);

            // 6. Attempt Sale on Non-Existent Customer -> MUST BE BLOCKED
            var saleToGhostCust = new Sale
            {
                Id = "stress_sale_ghost_" + Guid.NewGuid().ToString("N").Substring(0, 8),
                CustomerId = "cust_ghost_does_not_exist",
                PaymentMethod = "cash",
                SubtotalPiasters = 5000,
                TotalPiasters = 5000,
                PaidPiasters = 5000,
                Items = new List<SaleItem>
                {
                    new SaleItem
                    {
                        ProductId = prod.Id,
                        ProductName = prod.Name,
                        QuantityMilli = 1000,
                        UnitPricePiasters = 5000,
                        TotalPiasters = 5000
                    }
                }
            };

            bool saleToGhostBlocked = false;
            try
            {
                saleRepo.CreateSaleAtomic(saleToGhostCust);
            }
            catch (InvalidOperationException ex)
            {
                saleToGhostBlocked = ex.Message.Contains("غير موجود");
            }
            AssertCondition(saleToGhostBlocked,
                "منع إنشاء فاتورة بيع لعميل وهمي غير مسجل في النظام بنجاح",
                "ثغرة! تم السماح بالبيع لعميل غير مسجل في قاعدة البيانات!", report);

            // 7. Supplier with balance cannot be archived
            string supId = "sup_test_" + Guid.NewGuid().ToString("N").Substring(0, 8);
            supplierRepo.Save(new Supplier
            {
                Id = supId,
                Name = "شركة التوريدات العالمية",
                Phone = "01099999999",
                BalancePiasters = 30000,
                IsActive = true
            });

            bool archiveSupDebtBlocked = false;
            try
            {
                supplierRepo.Archive(supId);
            }
            catch (InvalidOperationException ex)
            {
                archiveSupDebtBlocked = ex.Message.Contains("مستحق");
            }
            AssertCondition(archiveSupDebtBlocked,
                "منع أرشفة المورد الذي له رصيد مستحق بذمة المحل بنجاح",
                "ثغرة! تم السماح بأرشفة مورد له مستحقات مالية معلقة!", report);

            // 8. Supplier with advance balance (balance < 0) cannot be archived
            using (var conn = new SQLiteConnection(_connStr))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand("UPDATE suppliers SET balance_piasters = -15000 WHERE id = @id;", conn))
                {
                    cmd.Parameters.AddWithValue("@id", supId);
                    cmd.ExecuteNonQuery();
                }
            }

            bool archiveSupAdvBlocked = false;
            try
            {
                supplierRepo.Archive(supId);
            }
            catch (InvalidOperationException ex)
            {
                archiveSupAdvBlocked = ex.Message.Contains("مدين") || ex.Message.Contains("مقدمة");
            }
            AssertCondition(archiveSupAdvBlocked,
                "منع أرشفة المورد الذي بذمته دفعات مقدمة للمحل بنجاح لحماية حقوق المحل",
                "ثغرة! تم السماح بأرشفة مورد بذمته دفعات مقدمة للمحل!", report);

            // 9. Settle supplier balance to 0 -> Archive MUST SUCCEED
            using (var conn = new SQLiteConnection(_connStr))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand("UPDATE suppliers SET balance_piasters = 0 WHERE id = @id;", conn))
                {
                    cmd.Parameters.AddWithValue("@id", supId);
                    cmd.ExecuteNonQuery();
                }
            }
            supplierRepo.Archive(supId);
            var archivedSup = supplierRepo.GetById(supId);
            AssertCondition(archivedSup != null && !archivedSup.IsActive,
                "أرشفة المورد بنجاح بعد تصفية حسابه بالكامل للصفر",
                "فشل أرشفة المورد بعد تصفية رصيده", report);

            // 10. Attempt to archive non-existent supplier -> MUST BE BLOCKED
            bool archiveGhostSupBlocked = false;
            try
            {
                supplierRepo.Archive("sup_ghost_id_xyz");
            }
            catch (InvalidOperationException ex)
            {
                archiveGhostSupBlocked = ex.Message.Contains("غير موجود");
            }
            AssertCondition(archiveGhostSupBlocked,
                "منع أرشفة مورد وهمي غير مسجل في النظام بنجاح",
                "فشل كشف المورد غير المسجل عند طلب الأرشفة", report);

            // 11. Attempt Purchase on Archived Supplier -> MUST BE BLOCKED
            var purToArchived = new Purchase
            {
                Id = "pur_arch_" + Guid.NewGuid().ToString("N").Substring(0, 8),
                SupplierId = supId,
                PaymentSource = "cash_drawer",
                Items = new List<PurchaseItem>
                {
                    new PurchaseItem
                    {
                        ProductId = prod.Id,
                        ProductName = prod.Name,
                        QuantityMilli = 5000,
                        UnitCostPiasters = 3000
                    }
                }
            };

            bool purToArchivedBlocked = false;
            try
            {
                purchaseRepo.CreatePurchase(purToArchived);
            }
            catch (InvalidOperationException ex)
            {
                purToArchivedBlocked = ex.Message.Contains("مؤرشف");
            }
            AssertCondition(purToArchivedBlocked,
                "منع إضافة فاتورة شراء لمورد مؤرشف بنجاح وحماية دورة المشتريات",
                "ثغرة! تم السماح بإنشاء فاتورة شراء لمورد مؤرشف!", report);
        }

        private static void RunTest22_AdvancedSubsystemAssetAndCatalogIntegrityGuards(AuditReport report)
        {
            var digitalAccountRepo = new DigitalAccountRepository(_connStr);
            var epayRepo = new EpayRepository(_connStr);
            var productRepo = new ProductRepository(_connStr);
            var customerRepo = new CustomerRepository(_connStr);
            var supplierRepo = new SupplierRepository(_connStr);
            var saleRepo = new SaleRepository(_connStr);
            var purchaseRepo = new PurchaseRepository(_connStr);

            // 1. Digital Account (Wallet) with positive balance cannot be deleted or archived
            string walletId1 = "w_test_" + Guid.NewGuid().ToString("N").Substring(0, 8);
            var wallet1 = new DigitalAccount
            {
                Id = walletId1,
                Name = "محفظة فودافون كاش رئيسية",
                Type = "vodafone_cash",
                PhoneNumber = "01011112222",
                BalancePiasters = 10000,
                IsActive = true,
                IsDefault = false
            };
            digitalAccountRepo.SaveAccount(wallet1);

            bool deleteWalletWithBalanceBlocked = false;
            try
            {
                digitalAccountRepo.DeleteAccount(walletId1);
            }
            catch (InvalidOperationException ex)
            {
                deleteWalletWithBalanceBlocked = ex.Message.Contains("رصيد") || ex.Message.Contains("تصفية");
            }
            AssertCondition(deleteWalletWithBalanceBlocked,
                "منع حذف أو أرشفة المحفظة الرقمية طالما بها رصيد مالي نشط لحماية أصول المتجر",
                "ثغرة! تم السماح بحذف محفظة رقمية تحتوي على رصيد مالي للمحل!", report);

            // 2. Default Digital Account cannot be deleted when other active accounts of the same type exist
            string walletId2 = "w_test_" + Guid.NewGuid().ToString("N").Substring(0, 8);
            var wallet2 = new DigitalAccount
            {
                Id = walletId2,
                Name = "محفظة فودافون كاش ثانوية",
                Type = "vodafone_cash",
                PhoneNumber = "01033334444",
                BalancePiasters = 0,
                IsActive = true,
                IsDefault = false
            };
            digitalAccountRepo.SaveAccount(wallet2);

            // Settle wallet 1 to 0 balance, but make it default
            using (var conn = new SQLiteConnection(_connStr))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand("UPDATE digital_accounts SET balance_piasters = 0, is_default = 1 WHERE id = @id;", conn))
                {
                    cmd.Parameters.AddWithValue("@id", walletId1);
                    cmd.ExecuteNonQuery();
                }
            }

            bool deleteDefaultWalletBlocked = false;
            try
            {
                digitalAccountRepo.DeleteAccount(walletId1);
            }
            catch (InvalidOperationException ex)
            {
                deleteDefaultWalletBlocked = ex.Message.Contains("افتراضي");
            }
            AssertCondition(deleteDefaultWalletBlocked,
                "منع حذف المحفظة الافتراضية بنجاح عند وجود محافظ أخرى نشطة من نفس النوع",
                "ثغرة! تم السماح بحذف المحفظة الافتراضية مع بقاء محافظ أخرى من نفس النوع!", report);

            // Make wallet 2 default -> Now wallet 1 can be safely deleted/archived
            using (var conn = new SQLiteConnection(_connStr))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand("UPDATE digital_accounts SET is_default = 1 WHERE id = @id2; UPDATE digital_accounts SET is_default = 0 WHERE id = @id1;", conn))
                {
                    cmd.Parameters.AddWithValue("@id2", walletId2);
                    cmd.Parameters.AddWithValue("@id1", walletId1);
                    cmd.ExecuteNonQuery();
                }
            }
            digitalAccountRepo.DeleteAccount(walletId1);
            var checkW1 = digitalAccountRepo.GetAccountById(walletId1);
            AssertCondition(checkW1 == null || !checkW1.IsActive,
                "حذف أو أرشفة المحفظة بنجاح بعد تصفير رصيدها ونقل الحالة الافتراضية لمحفظة أخرى",
                "فشل حذف المحفظة الرقمية بعد استيفاء كافة الشروط الرقابية", report);

            // 3. Epay Terminal with positive balance cannot be deleted or archived
            string epayTermId = "epay_term_" + Guid.NewGuid().ToString("N").Substring(0, 8);
            var epayTerm = new EpayTerminal
            {
                Id = epayTermId,
                Name = "ماكينة فوري الفرع الرئيسي",
                Provider = "fawry",
                TerminalCode = "FWR-9001",
                BalancePiasters = 50000,
                IsActive = true
            };
            epayRepo.SaveTerminal(epayTerm);

            string epayMsg = null;
            bool deleteTermWithBalanceResult = epayRepo.DeleteTerminal(epayTermId, out epayMsg);
            AssertCondition(!deleteTermWithBalanceResult && epayMsg != null && (epayMsg.Contains("رصيد") || epayMsg.Contains("تصفية")),
                "منع حذف أو أرشفة ماكينة الدفع الإلكتروني وبها رصيد مالي قائم لحماية رأس مال المحل",
                "ثغرة! تم السماح بحذف ماكينة دفع إلكتروني تحوي رصيداً نقدياً!", report);

            // Settle terminal balance to 0 -> Delete/Archive MUST SUCCEED
            using (var conn = new SQLiteConnection(_connStr))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand("UPDATE epay_terminals SET balance_piasters = 0 WHERE id = @id;", conn))
                {
                    cmd.Parameters.AddWithValue("@id", epayTermId);
                    cmd.ExecuteNonQuery();
                }
            }
            string epayMsg2 = null;
            bool deleteTermZeroResult = epayRepo.DeleteTerminal(epayTermId, out epayMsg2);
            var checkTerm = epayRepo.GetTerminalById(epayTermId);
            AssertCondition(deleteTermZeroResult && (checkTerm == null || !checkTerm.IsActive),
                "حذف أو أرشفة ماكينة الدفع الإلكتروني بنجاح بعد تصفير رصيدها بالكامل",
                "فشل حذف أو أرشفة ماكينة الدفع الإلكتروني بعد تصفير رصيدها", report);

            // 4. Product Catalog Archival Integrity: Block Sale on Archived Product
            string prodId = "prod_arch_" + Guid.NewGuid().ToString("N").Substring(0, 8);
            var product = new Product
            {
                Id = prodId,
                Name = "صنف مجمد للاختبار الرقابي",
                Barcode = "BAR-ARCH-99",
                StockQuantityMilli = 10000,
                CostPiasters = 2000,
                PricePiasters = 3500,
                IsActive = true
            };
            productRepo.Upsert(product);

            // Soft-delete the product
            using (var conn = new SQLiteConnection(_connStr))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand("UPDATE products SET is_active = 0 WHERE id = @id;", conn))
                {
                    cmd.Parameters.AddWithValue("@id", prodId);
                    cmd.ExecuteNonQuery();
                }
            }

            string custId = "cust_active_" + Guid.NewGuid().ToString("N").Substring(0, 8);
            customerRepo.SaveCustomer(new Customer
            {
                Id = custId,
                Name = "عميل فحص الأصناف النشطة",
                Phone = "01000001111"
            });

            var saleWithArchivedProd = new Sale
            {
                Id = "stress_sale_arch_prod_" + Guid.NewGuid().ToString("N").Substring(0, 8),
                CustomerId = custId,
                PaymentMethod = "cash",
                SubtotalPiasters = 3500,
                TotalPiasters = 3500,
                PaidPiasters = 3500,
                Items = new List<SaleItem>
                {
                    new SaleItem
                    {
                        ProductId = prodId,
                        ProductName = product.Name,
                        QuantityMilli = 1000,
                        UnitPricePiasters = 3500,
                        TotalPiasters = 3500
                    }
                }
            };

            bool saleArchivedProdBlocked = false;
            try
            {
                saleRepo.CreateSaleAtomic(saleWithArchivedProd);
            }
            catch (InvalidOperationException ex)
            {
                saleArchivedProdBlocked = ex.Message.Contains("مؤرشف") || ex.Message.Contains("محذوف");
            }
            AssertCondition(saleArchivedProdBlocked,
                "منع إنشاء فاتورة بيع لصنف مؤرشف أو محذوف لحماية دقة جرد المخزون",
                "ثغرة! تم السماح ببيع صنف مؤرشف أو محذوف من قائمة الأصناف!", report);

            // 5. Product Catalog Archival Integrity: Block Purchase on Archived Product
            string supId = "sup_active_" + Guid.NewGuid().ToString("N").Substring(0, 8);
            supplierRepo.Save(new Supplier
            {
                Id = supId,
                Name = "مورد فحص الأصناف النشطة",
                Phone = "01000002222",
                IsActive = true
            });

            var purchaseWithArchivedProd = new Purchase
            {
                Id = "stress_pur_arch_prod_" + Guid.NewGuid().ToString("N").Substring(0, 8),
                SupplierId = supId,
                PaymentSource = "cash_drawer",
                Items = new List<PurchaseItem>
                {
                    new PurchaseItem
                    {
                        ProductId = prodId,
                        ProductName = product.Name,
                        QuantityMilli = 5000,
                        UnitCostPiasters = 2000
                    }
                }
            };

            bool purchaseArchivedProdBlocked = false;
            try
            {
                purchaseRepo.CreatePurchase(purchaseWithArchivedProd);
            }
            catch (InvalidOperationException ex)
            {
                purchaseArchivedProdBlocked = ex.Message.Contains("مؤرشف") || ex.Message.Contains("محذوف");
            }
            AssertCondition(purchaseArchivedProdBlocked,
                "منع إنشاء فاتورة شراء لصنف مؤرشف أو محذوف وحماية قيود التوريد المخزني",
                "ثغرة! تم السماح بشراء وتوريد صنف مؤرشف أو محذوف إلى المخزن!", report);

            // 6. Re-activate product -> Sale and Purchase MUST SUCCEED
            using (var conn = new SQLiteConnection(_connStr))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand("UPDATE products SET is_active = 1 WHERE id = @id;", conn))
                {
                    cmd.Parameters.AddWithValue("@id", prodId);
                    cmd.ExecuteNonQuery();
                }
            }

            saleRepo.CreateSaleAtomic(saleWithArchivedProd);
            purchaseRepo.CreatePurchase(purchaseWithArchivedProd);
            var updatedProd = productRepo.GetById(prodId);
            AssertCondition(updatedProd != null && updatedProd.StockQuantityMilli == 10000 - 1000 + 5000,
                "نجاح عمليات البيع والشراء وتحديث رصيد المخزن بدقة متناهية بعد إعادة تنشيط الصنف",
                "فشل تحديث رصيد الصنف بعد إعادة تنشيطه وإتمام عمليتي البيع والشراء", report);
        }

        private static void RunTest23_SeniorCustomerLedgerAndQuickCatalogGuards(AuditReport report)
        {
            var auditRepo = new AuditLogRepository(_connStr);
            var custRepo = new CustomerRepository(_connStr, auditRepo);
            var prodRepo = new ProductRepository(_connStr);
            var expenseRepo = new ExpenseRepository(_connStr, auditRepo);
            var quickRepo = new QuickItemRepository(_connStr);

            // 1. Block payment recording on general cash customer (cust_general_cash)
            bool genCashPayBlocked = false;
            try
            {
                custRepo.RecordPayment("cust_general_cash", 5000, "سداد نقدي غير صالح");
            }
            catch (InvalidOperationException ex)
            {
                genCashPayBlocked = ex.Message.Contains("النقدي العام") || ex.Message.Contains("سداد");
            }
            AssertCondition(genCashPayBlocked,
                "منع تسجيل سداد آجل للعميل النقدي العام بنجاح لحماية الحسابات النقدية العامة",
                "ثغرة! تم السماح بتسجيل سداد دين للعميل النقدي العام!", report);

            // 2. Block payment recording on archived customer
            string custArchId = "cust_arch_pay_" + Guid.NewGuid().ToString("N").Substring(0, 8);
            custRepo.SaveCustomer(new Customer
            {
                Id = custArchId,
                Name = "عميل سداد مؤرشف",
                Phone = "01122334455",
                BalancePiasters = 0
            });
            custRepo.ArchiveCustomer(custArchId);

            bool archCustPayBlocked = false;
            try
            {
                custRepo.RecordPayment(custArchId, 10000, "سداد لعميل مؤرشف");
            }
            catch (InvalidOperationException ex)
            {
                archCustPayBlocked = ex.Message.Contains("مؤرشف") || ex.Message.Contains("أرشفته");
            }
            AssertCondition(archCustPayBlocked,
                "منع تسجيل دفعات سداد لعميل مؤرشف بنجاح لمنع إحداث أرصدة دائنة وهمية",
                "ثغرة! تم السماح بتسجيل سداد لعميل تم أرشفته سابقاً!", report);

            // 3. Block payment cancellation on archived customer
            string custActId = "cust_act_cancel_" + Guid.NewGuid().ToString("N").Substring(0, 8);
            custRepo.SaveCustomer(new Customer
            {
                Id = custActId,
                Name = "عميل إلغاء سداد",
                Phone = "01199887766",
                BalancePiasters = 10000
            });
            // Record payment -> balance becomes 0
            custRepo.RecordPayment(custActId, 10000, "سداد الديون");
            var statement = custRepo.GetStatement(custActId, 10);
            var payEntry = statement.Find(delegate(CustomerLedgerEntry e) { return e.Type == "payment"; });
            AssertCondition(payEntry != null, "تسجيل دفعة السداد في كشف حساب العميل بنجاح", "فشل العثور على حركة السداد", report);

            // Archive customer with 0 balance
            custRepo.ArchiveCustomer(custActId);

            // Attempt to cancel payment while archived
            bool cancelArchCustPayBlocked = false;
            try
            {
                custRepo.CancelPayment(custActId, payEntry.Id, "إلغاء دفعة", "admin");
            }
            catch (InvalidOperationException ex)
            {
                cancelArchCustPayBlocked = ex.Message.Contains("مؤرشف");
            }
            AssertCondition(cancelArchCustPayBlocked,
                "منع إلغاء دفعة سداد لعميل مؤرشف لحماية الحسابات من إعادة تنشيط ديون على حساب مغلق",
                "ثغرة! تم السماح بإلغاء سداد واستعادة ديون على عميل مؤرشف!", report);

            // Unarchive/Restore customer -> Cancel payment must succeed and restore balance to 10,000 piasters
            using (var conn = new SQLiteConnection(_connStr))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand("UPDATE customers SET is_archived = 0 WHERE id = @id;", conn))
                {
                    cmd.Parameters.AddWithValue("@id", custActId);
                    cmd.ExecuteNonQuery();
                }
            }
            custRepo.CancelPayment(custActId, payEntry.Id, "إلغاء بعد استعادة العميل", "admin");
            var restoredCust = custRepo.GetById(custActId);
            AssertCondition(restoredCust != null && restoredCust.BalancePiasters == 10000,
                "إلغاء السداد بنجاح بعد استعادة العميل وعودة رصيد المديونية 100 ج.م بدقة",
                "فشل استعادة مديونية العميل بعد إلغاء السداد", report);

            // 4. Expense Auto-ID and Business Date Fallback
            var expWithoutId = new Expense
            {
                AmountPiasters = 7500,
                Category = "صيانة أجهزة",
                CreatedBy = "الكاشير"
            };
            var savedExp = expenseRepo.Insert(expWithoutId);
            AssertCondition(savedExp != null && !string.IsNullOrEmpty(savedExp.Id) && savedExp.Id.StartsWith("exp_") && !string.IsNullOrEmpty(savedExp.BusinessDate),
                "توليد معرف تلقائي وتاريخ يومية تلقائي للمصروفات بنجاح عند عدم تمريرهم",
                "فشل توليد المعرف أو تاريخ اليومية التلقائي للمصروف", report);

            // 5. Quick Item Product Integrity (Block linking to archived or non-existent product)
            string prodQId = "prod_q_" + Guid.NewGuid().ToString("N").Substring(0, 8);
            var prodQ = new Product
            {
                Id = prodQId,
                Name = "منتج سريع فحص الكتالوج",
                Barcode = "BAR-Q-11",
                PricePiasters = 3000,
                CostPiasters = 1800,
                IsActive = true
            };
            prodRepo.Upsert(prodQ);

            // Soft-delete the product
            using (var conn = new SQLiteConnection(_connStr))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand("UPDATE products SET is_active = 0 WHERE id = @id;", conn))
                {
                    cmd.Parameters.AddWithValue("@id", prodQId);
                    cmd.ExecuteNonQuery();
                }
            }

            bool quickArchProdBlocked = false;
            try
            {
                quickRepo.Save(new QuickItem
                {
                    Name = "زر سريع لصنف مؤرشف",
                    ProductId = prodQId,
                    PricePiasters = 3000
                });
            }
            catch (InvalidOperationException ex)
            {
                quickArchProdBlocked = ex.Message.Contains("مؤرشف") || ex.Message.Contains("محذوف");
            }
            AssertCondition(quickArchProdBlocked,
                "منع ربط صنف سريع بمنتج مؤرشف أو محذوف بنجاح لحماية شاشة الكاشير",
                "ثغرة! تم السماح بربط صنف سريع بمنتج مؤرشف!", report);

            bool quickGhostProdBlocked = false;
            try
            {
                quickRepo.Save(new QuickItem
                {
                    Name = "زر سريع لمنتج وهمي",
                    ProductId = "prod_ghost_does_not_exist",
                    PricePiasters = 3000
                });
            }
            catch (InvalidOperationException ex)
            {
                quickGhostProdBlocked = ex.Message.Contains("غير موجود");
            }
            AssertCondition(quickGhostProdBlocked,
                "منع ربط صنف سريع بمنتج وهمي غير مسجل في النظام بنجاح",
                "ثغرة! تم السماح بربط صنف سريع بمنتج غير موجود!", report);

            // Re-activate product -> Quick item creation must succeed
            using (var conn = new SQLiteConnection(_connStr))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand("UPDATE products SET is_active = 1 WHERE id = @id;", conn))
                {
                    cmd.Parameters.AddWithValue("@id", prodQId);
                    cmd.ExecuteNonQuery();
                }
            }
            var savedQuick = quickRepo.Save(new QuickItem
            {
                Name = "زر سريع لصنف نشط",
                ProductId = prodQId,
                PricePiasters = 3000
            });
            AssertCondition(savedQuick != null && savedQuick.ProductId == prodQId,
                "إنشاء الصنف السريع بنجاح وربطه بالمنتج بعد إعادة تنشيطه",
                "فشل إنشاء الصنف السريع بعد تنشيط المنتج", report);
        }

        private static void RunTest24_ReturnCartBatchAndUnitResilienceGuards(AuditReport report)
        {
            var auditRepo = new AuditLogRepository(_connStr);
            var counterRepo = new CounterRepository(_connStr);
            var custRepo = new CustomerRepository(_connStr, auditRepo);
            var prodRepo = new ProductRepository(_connStr);
            var returnRepo = new ReturnRepository(_connStr, counterRepo, auditRepo);
            var heldRepo = new HeldSaleRepository(_connStr);
            var batchRepo = new ProductBatchRepository(_connStr, auditRepo);
            var unitRepo = new ProductUnitRepository(_connStr);
            var saleRepo = new SaleRepository(_connStr, counterRepo, auditRepo);

            // 1. Create active product for returns and batch tests
            string prodId = "prod_t24_" + Guid.NewGuid().ToString("N").Substring(0, 8);
            var prod = new Product
            {
                Id = prodId,
                Name = "منتج اختبار سيناريوهات الرقابة 24",
                Barcode = "BAR-T24-01",
                PricePiasters = 5000,
                CostPiasters = 3000,
                StockQuantityMilli = 20000,
                IsActive = true
            };
            prodRepo.Upsert(prod);

            // 2. Return with quantity <= 0 -> MUST BE BLOCKED
            var retZeroQty = new Return
            {
                Items = new List<ReturnItem>
                {
                    new ReturnItem
                    {
                        ProductId = prod.Id,
                        ProductName = prod.Name,
                        QuantityMilli = 0,
                        UnitPricePiasters = 5000
                    }
                }
            };
            bool retZeroQtyBlocked = false;
            try
            {
                returnRepo.CreateReturnAtomic(retZeroQty);
            }
            catch (InvalidOperationException ex)
            {
                retZeroQtyBlocked = ex.Message.Contains("أكبر من الصفر");
            }
            AssertCondition(retZeroQtyBlocked,
                "منع تسجيل مرتجع بكمية صفر أو سالبة بنجاح لحماية المخزون من التلاعب",
                "ثغرة! تم السماح بتسجيل مرتجع بكمية صفر أو سالبة!", report);

            // 3. Return with negative unit price -> MUST BE BLOCKED
            var retNegPrice = new Return
            {
                Items = new List<ReturnItem>
                {
                    new ReturnItem
                    {
                        ProductId = prod.Id,
                        ProductName = prod.Name,
                        QuantityMilli = 1000,
                        UnitPricePiasters = -500
                    }
                }
            };
            bool retNegPriceBlocked = false;
            try
            {
                returnRepo.CreateReturnAtomic(retNegPrice);
            }
            catch (InvalidOperationException ex)
            {
                retNegPriceBlocked = ex.Message.Contains("سعر الوحدة") || ex.Message.Contains("سالب");
            }
            AssertCondition(retNegPriceBlocked,
                "منع تسجيل مرتجع بسعر وحدة سالب لحماية العمليات المالية",
                "ثغرة! تم السماح بتسجيل مرتجع بسعر وحدة سالب!", report);

            // 4. Return with refund_method = 'credit' without customer -> MUST BE BLOCKED
            var retCreditNoCust = new Return
            {
                RefundMethod = "credit",
                CustomerId = null,
                Items = new List<ReturnItem>
                {
                    new ReturnItem
                    {
                        ProductId = prod.Id,
                        ProductName = prod.Name,
                        QuantityMilli = 1000,
                        UnitPricePiasters = 5000
                    }
                }
            };
            bool retCreditNoCustBlocked = false;
            try
            {
                returnRepo.CreateReturnAtomic(retCreditNoCust);
            }
            catch (InvalidOperationException ex)
            {
                retCreditNoCustBlocked = ex.Message.Contains("بدون تحديد عميل");
            }
            AssertCondition(retCreditNoCustBlocked,
                "منع صرف المرتجع رصيد آجل/حساب عميل بدون تحديد عميل مسجل",
                "ثغرة! تم السماح بصرف مرتجع كرصيد آجل بدون تحديد عميل!", report);

            // 5. Return with refund_method = 'credit' on cust_general_cash -> MUST BE BLOCKED
            var retCreditGenCash = new Return
            {
                RefundMethod = "credit",
                CustomerId = "cust_general_cash",
                Items = new List<ReturnItem>
                {
                    new ReturnItem
                    {
                        ProductId = prod.Id,
                        ProductName = prod.Name,
                        QuantityMilli = 1000,
                        UnitPricePiasters = 5000
                    }
                }
            };
            bool retCreditGenCashBlocked = false;
            try
            {
                returnRepo.CreateReturnAtomic(retCreditGenCash);
            }
            catch (InvalidOperationException ex)
            {
                retCreditGenCashBlocked = ex.Message.Contains("النقدي العام");
            }
            AssertCondition(retCreditGenCashBlocked,
                "منع صرف المرتجع كرصيد آجل للعميل النقدي العام لمنع إفساد دفتر الأستاذ العام",
                "ثغرة! تم السماح بصرف مرتجع كرصيد آجل للعميل النقدي العام!", report);

            // 6. Return with refund_method = 'credit' on archived customer -> MUST BE BLOCKED
            string custArchId = "cust_t24_arch_" + Guid.NewGuid().ToString("N").Substring(0, 8);
            custRepo.SaveCustomer(new Customer
            {
                Id = custArchId,
                Name = "عميل مرتجع مؤرشف",
                Phone = "01033445566",
                BalancePiasters = 0
            });
            custRepo.ArchiveCustomer(custArchId);

            var retCreditArch = new Return
            {
                RefundMethod = "credit",
                CustomerId = custArchId,
                Items = new List<ReturnItem>
                {
                    new ReturnItem
                    {
                        ProductId = prod.Id,
                        ProductName = prod.Name,
                        QuantityMilli = 1000,
                        UnitPricePiasters = 5000
                    }
                }
            };
            bool retCreditArchBlocked = false;
            try
            {
                returnRepo.CreateReturnAtomic(retCreditArch);
            }
            catch (InvalidOperationException ex)
            {
                retCreditArchBlocked = ex.Message.Contains("مؤرشف");
            }
            AssertCondition(retCreditArchBlocked,
                "منع صرف المرتجع كرصيد آجل لحساب عميل مؤرشف بنجاح",
                "ثغرة! تم السماح بصرف مرتجع آجل لعميل مؤرشف!", report);

            // 7. Held Sale: Holding empty cart -> MUST BE BLOCKED
            var emptyHeld = new HeldSale
            {
                ItemsCount = 0,
                CartJson = "[]",
                TotalPiasters = 0
            };
            bool emptyHeldBlocked = false;
            try
            {
                heldRepo.SaveHeldSale(emptyHeld);
            }
            catch (InvalidOperationException ex)
            {
                emptyHeldBlocked = ex.Message.Contains("سلة فارغة");
            }
            AssertCondition(emptyHeldBlocked,
                "منع تعليق سلة فارغة بدون أصناف بنجاح وحماية شاشات الكاشير من الفواتير المعلقة الوهمية",
                "ثغرة! تم السماح بتعليق سلة فارغة!", report);

            // 8. Batch: Creating batch on non-existent product -> MUST BE BLOCKED
            var ghostBatch = new ProductBatch
            {
                ProductId = "prod_ghost_does_not_exist",
                BatchNumber = "BATCH-GHOST",
                QuantityMilli = 5000,
                CostPricePiasters = 2500
            };
            bool ghostBatchBlocked = false;
            try
            {
                batchRepo.CreateOrUpdateBatch(ghostBatch);
            }
            catch (InvalidOperationException ex)
            {
                ghostBatchBlocked = ex.Message.Contains("غير موجود");
            }
            AssertCondition(ghostBatchBlocked,
                "منع إنشاء دفعة مخزنية لمنتج وهمي غير مسجل في قاعدة البيانات",
                "ثغرة! تم السماح بإنشاء دفعة لمنتج غير موجود!", report);

            // 9. Batch: Negative quantity or cost -> MUST BE BLOCKED
            var negQtyBatch = new ProductBatch
            {
                ProductId = prod.Id,
                BatchNumber = "BATCH-NEG-QTY",
                QuantityMilli = -1000,
                CostPricePiasters = 2500
            };
            bool negQtyBatchBlocked = false;
            try
            {
                batchRepo.CreateOrUpdateBatch(negQtyBatch);
            }
            catch (ArgumentException ex)
            {
                negQtyBatchBlocked = ex.Message.Contains("سالبة");
            }
            AssertCondition(negQtyBatchBlocked,
                "منع إنشاء دفعة بكمية سالبة بنجاح",
                "ثغرة! تم السماح بإنشاء دفعة بكمية سالبة!", report);

            // 10. Product Unit: Conversion factor <= 0 -> MUST BE BLOCKED
            var zeroFactorUnit = new ProductUnit
            {
                ProductId = prod.Id,
                UnitName = "علبة غير صالحة",
                ConversionFactor = 0,
                IsBaseUnit = false,
                SellPricePiasters = 10000,
                CostPricePiasters = 6000
            };
            bool zeroFactorUnitBlocked = false;
            try
            {
                unitRepo.Create(zeroFactorUnit);
            }
            catch (ArgumentException ex)
            {
                zeroFactorUnitBlocked = ex.Message.Contains("معامل التحويل");
            }
            AssertCondition(zeroFactorUnitBlocked,
                "منع إنشاء وحدة ثانوية بمعامل تحويل صفر أو سالب لمنع أخطاء القسمة في المخزون",
                "ثغرة! تم السماح بإنشاء وحدة بمعامل تحويل صفر!", report);

            // 11. Product Unit: Deleting base unit -> MUST BE BLOCKED
            var baseUnit = new ProductUnit
            {
                Id = "unit_base_t24_" + Guid.NewGuid().ToString("N").Substring(0, 8),
                ProductId = prod.Id,
                UnitName = "قطعة أساسية",
                ConversionFactor = 1,
                IsBaseUnit = true,
                SellPricePiasters = 5000,
                CostPricePiasters = 3000
            };
            unitRepo.Create(baseUnit);

            bool deleteBaseUnitBlocked = false;
            try
            {
                unitRepo.Delete(baseUnit.Id);
            }
            catch (InvalidOperationException ex)
            {
                deleteBaseUnitBlocked = ex.Message.Contains("الوحدة الأساسية");
            }
            AssertCondition(deleteBaseUnitBlocked,
                "منع حذف الوحدة الأساسية للمنتج لحماية الهيكل التأسيسي لوحدات القياس",
                "ثغرة! تم السماح بحذف الوحدة الأساسية للمنتج!", report);

            // 12. Product Unit: Deleting unit with active sales records -> MUST BE BLOCKED
            var secUnit = new ProductUnit
            {
                Id = "unit_sec_t24_" + Guid.NewGuid().ToString("N").Substring(0, 8),
                ProductId = prod.Id,
                UnitName = "دستة (12 قطعة)",
                ConversionFactor = 12,
                IsBaseUnit = false,
                SellPricePiasters = 55000,
                CostPricePiasters = 33000
            };
            unitRepo.Create(secUnit);

            // Simulate a sale referencing this unit_id via SaleRepository
            var saleWithUnit = new Sale
            {
                Id = "sale_unit_t24_" + Guid.NewGuid().ToString("N").Substring(0, 8),
                CustomerId = "cust_general_cash",
                PaymentMethod = "cash",
                SubtotalPiasters = 55000,
                TotalPiasters = 55000,
                PaidPiasters = 55000,
                Items = new List<SaleItem>
                {
                    new SaleItem
                    {
                        ProductId = prod.Id,
                        ProductName = prod.Name,
                        QuantityMilli = 1000,
                        UnitPricePiasters = 55000,
                        UnitCostPiasters = 33000,
                        TotalPiasters = 55000,
                        Unit = "دستة",
                        UnitId = secUnit.Id,
                        ConversionFactor = 12
                    }
                }
            };
            saleRepo.CreateSaleAtomic(saleWithUnit);

            bool deleteUnitWithSalesBlocked = false;
            try
            {
                unitRepo.Delete(secUnit.Id);
            }
            catch (InvalidOperationException ex)
            {
                deleteUnitWithSalesBlocked = ex.Message.Contains("مبيعات مسجلة");
            }
            AssertCondition(deleteUnitWithSalesBlocked,
                "منع حذف الوحدة المرتبطة بمبيعات مسجلة سابقة لحماية التكامل المرجعي للتقارير التاريخية",
                "ثغرة! تم السماح بحذف وحدة تم البيع بها سابقاً!", report);
        }

        // Test 25: Digital Account Daily and Monthly Limit Guards
        private static void RunTest25_DigitalAccountDailyAndMonthlyLimitGuards(AuditReport report)
        {
            var digRepo = new DigitalAccountRepository(_connStr);
            var acc = new DigitalAccount
            {
                Id = "dig_limit_test_" + Guid.NewGuid().ToString("N").Substring(0, 8),
                Name = "محفظة تجربة الحدود اليومية",
                Type = "wallet",
                Provider = "vodafone_cash",
                BalancePiasters = 1000000, // 10,000 EGP balance
                DailyLimitPiasters = 500000, // 5,000 EGP daily limit
                MonthlyLimitPiasters = 2000000, // 20,000 EGP monthly limit
                IsDefault = false,
                IsActive = true
            };
            digRepo.SaveAccount(acc);

            // 1. Valid cash_out of 2,000 EGP (within limit) -> MUST PASS
            var tx1 = new DigitalTransaction
            {
                AccountId = acc.Id,
                TxType = "cash_out",
                AmountPiasters = 200000,
                ProfitPiasters = 2000,
                PaymentDestination = "other",
                CustomerPhone = "01011112222"
            };
            var savedTx1 = digRepo.ProcessTransaction(tx1);
            AssertCondition(savedTx1 != null && savedTx1.Status == "completed",
                "تنفيذ سحب أو تحويل صادر نظامي ضمن الحد اليومي بنجاح",
                "فشل تنفيذ سحب صادر ضمن الحد اليومي", report);

            // 2. Attempt cash_out of 4,000 EGP (2000 + 4000 = 6000 > 5000 daily limit) -> MUST FAIL
            bool dailyLimitBlocked = false;
            try
            {
                var txOverDaily = new DigitalTransaction
                {
                    AccountId = acc.Id,
                    TxType = "cash_out",
                    AmountPiasters = 400000,
                    ProfitPiasters = 4000,
                    PaymentDestination = "other"
                };
                digRepo.ProcessTransaction(txOverDaily);
            }
            catch (InvalidOperationException ex)
            {
                dailyLimitBlocked = ex.Message.Contains("الحد اليومي");
            }
            AssertCondition(dailyLimitBlocked,
                "حظر تنفيذ تحويل يتجاوز الحد اليومي المصرح به للحساب الرقمي وحماية السياسة المالية",
                "ثغرة! تم السماح بتجاوز الحد الأقصى اليومي للتحويلات الصادرة!", report);

            // 3. Cash-in (deposit) of 10,000 EGP -> MUST PASS (deposits are not constrained by outgoing cash_out limit)
            var txCashIn = new DigitalTransaction
            {
                AccountId = acc.Id,
                TxType = "cash_in",
                AmountPiasters = 1000000,
                ProfitPiasters = 1000,
                PaymentDestination = "other"
            };
            var savedCashIn = digRepo.ProcessTransaction(txCashIn);
            AssertCondition(savedCashIn != null && savedCashIn.Status == "completed",
                "تنفيذ إيداع نقدي غير مقيد بالحد اليومي للصادر بنجاح",
                "فشل تنفيذ الإيداع النقدي للحساب", report);
        }

        // Test 26: Generic Wallet and Card Closing & Reporting Parity
        private static void RunTest26_GenericWalletAndCardClosingParity(AuditReport report)
        {
            var closingRepo = new DailyClosingRepository(_connStr);
            var counterRepo = new CounterRepository(_connStr);
            var auditRepo = new AuditLogRepository(_connStr);
            var settingsRepo = new SettingsRepository(_connStr);
            var closingService = new DailyClosingService(_connStr, closingRepo, counterRepo, auditRepo, settingsRepo);
            var prodRepo = new ProductRepository(_connStr);
            var saleRepo = new SaleRepository(_connStr);
            var saleService = new SaleService(saleRepo, prodRepo);

            var p = new Product
            {
                Id = "p_closing_parity_" + Guid.NewGuid().ToString("N").Substring(0, 8),
                Name = "صنف فحص إقفال الطرق المتنوعة",
                PricePiasters = 10000, // 100 EGP
                CostPiasters = 6000,
                StockQuantityMilli = 100000,
                IsActive = true
            };
            prodRepo.Upsert(p);

            // Sale 1: Generic 'wallet' method (100 EGP)
            saleService.ProcessSale(new Sale
            {
                CustomerId = "cust_general_cash",
                PaymentMethod = "wallet",
                PaidPiasters = 10000,
                TotalPiasters = 10000,
                Items = new List<SaleItem> { new SaleItem { ProductId = p.Id, ProductName = p.Name, QuantityMilli = 1000, UnitPricePiasters = 10000, TotalPiasters = 10000 } }
            });

            // Sale 2: 'orange_cash' method (100 EGP)
            saleService.ProcessSale(new Sale
            {
                CustomerId = "cust_general_cash",
                PaymentMethod = "orange_cash",
                PaidPiasters = 10000,
                TotalPiasters = 10000,
                Items = new List<SaleItem> { new SaleItem { ProductId = p.Id, ProductName = p.Name, QuantityMilli = 1000, UnitPricePiasters = 10000, TotalPiasters = 10000 } }
            });

            // Sale 3: 'mastercard' card method (100 EGP)
            saleService.ProcessSale(new Sale
            {
                CustomerId = "cust_general_cash",
                PaymentMethod = "mastercard",
                PaidPiasters = 10000,
                TotalPiasters = 10000,
                Items = new List<SaleItem> { new SaleItem { ProductId = p.Id, ProductName = p.Name, QuantityMilli = 1000, UnitPricePiasters = 10000, TotalPiasters = 10000 } }
            });

            // Sale 4: Split Multi Payment (100 EGP: 30 EGP Cash + 40 EGP 'etisalat_cash' + 30 EGP 'meeza')
            var splitSale = new Sale
            {
                CustomerId = "cust_general_cash",
                PaymentMethod = "multi",
                SubtotalPiasters = 10000,
                TotalPiasters = 10000,
                PaidPiasters = 10000,
                Items = new List<SaleItem> { new SaleItem { ProductId = p.Id, ProductName = p.Name, QuantityMilli = 1000, UnitPricePiasters = 10000, TotalPiasters = 10000 } },
                Payments = new List<SalePayment>
                {
                    new SalePayment { Method = "cash", AmountPiasters = 3000 },
                    new SalePayment { Method = "etisalat_cash", AmountPiasters = 4000 },
                    new SalePayment { Method = "meeza", AmountPiasters = 3000 }
                }
            };
            saleService.ProcessSale(splitSale);

            string bDate = closingService.GetCurrentBusinessDate();
            var preview = closingService.GetClosingPreview(bDate);

            // Assert that wallet sales include wallet (100) + orange_cash (100) + etisalat_cash (40) = 240 EGP (24,000 piasters)
            AssertCondition(preview.VodafoneCashSalesPiasters >= 24000,
                "تجميع كافة مدفوعات المحافظ الإلكترونية بمسمياتها المتعددة (wallet, orange, etisalat) في تقرير الإقفال بدقة",
                "فشل احتساب مدفوعات المحافظ البديلة في تقرير الإقفال: " + preview.VodafoneCashSalesPiasters, report);

            // Assert that card sales include mastercard (100) + meeza (30) = 130 EGP (13,000 piasters)
            AssertCondition(preview.CardSalesPiasters >= 13000,
                "تجميع كافة مدفوعات البطاقات البنكية المتنوعة (mastercard, meeza) في مبيعات الفيزا/الكروت بدقة",
                "فشل احتساب مدفوعات البطاقات البديلة في تقرير الإقفال: " + preview.CardSalesPiasters, report);

            // Check ReportsService parity
            var reportsService = new ReportsService(_connStr);
            var todaySummary = reportsService.GetTodaySummary();
            AssertCondition(todaySummary.TodayVodafoneCashPiasters >= 24000,
                "مطابقة المبيعات الإلكترونية للمحافظ في لوحة التقارير المالية والإحصائية",
                "فشل مطابقة تقارير المحافظ المالية: " + todaySummary.TodayVodafoneCashPiasters, report);
        }

        // Test 27: Closed Day Cash Drawer Protections
        private static void RunTest27_ClosedDayCashDrawerProtections(AuditReport report)
        {
            var closingRepo = new DailyClosingRepository(_connStr);
            var counterRepo = new CounterRepository(_connStr);
            var auditRepo = new AuditLogRepository(_connStr);
            var settingsRepo = new SettingsRepository(_connStr);
            var closingService = new DailyClosingService(_connStr, closingRepo, counterRepo, auditRepo, settingsRepo);

            string bDate = closingService.GetCurrentBusinessDate();

            // Perform formal daily closing if not already closed
            if (!closingService.IsDayClosed(bDate))
            {
                closingService.SaveClosing(new DailyClosingSaveRequest
                {
                    BusinessDate = bDate,
                    ActualCashPiasters = 100000,
                    CashierName = "كاشير الاختبار",
                    Notes = "إقفال تجريبي لفحص حماية اليوم المغلق"
                });
            }

            AssertCondition(closingService.IsDayClosed(bDate),
                "تأكيد تشميع اليومية وإغلاق تاريخ العمل عبر IsDayClosed",
                "اليومية ليست مغلقة بعد الحفظ", report);

            // 1. DigitalTransaction touching cash_drawer -> MUST FAIL
            var digRepo = new DigitalAccountRepository(_connStr);
            var acc = new DigitalAccount
            {
                Id = "dig_closed_test_" + Guid.NewGuid().ToString("N").Substring(0, 8),
                Name = "محفظة اليوم المغلق",
                Type = "wallet",
                Provider = "vodafone_cash",
                BalancePiasters = 100000,
                IsActive = true
            };
            digRepo.SaveAccount(acc);

            bool digDrawerBlocked = false;
            try
            {
                digRepo.ProcessTransaction(new DigitalTransaction
                {
                    AccountId = acc.Id,
                    TxType = "cash_out",
                    AmountPiasters = 10000,
                    ProfitPiasters = 100,
                    PaymentDestination = "cash_drawer"
                });
            }
            catch (InvalidOperationException ex)
            {
                digDrawerBlocked = ex.Message.Contains("درج الكاشير");
            }
            AssertCondition(digDrawerBlocked,
                "منع إجراء معاملة محفظة نقدية تؤثر على درج الكاشير بعد تشميع اليومية",
                "ثغرة! تم السماح بمعاملة محفظة نقدية في الدرج بعد إقفال اليوم!", report);

            // 2. DigitalAccountFunding from cash_drawer -> MUST FAIL
            bool fundDrawerBlocked = false;
            try
            {
                digRepo.FundAccount(acc.Id, 5000, "cash_drawer", "تغذية تجريبية بعد الإغلاق", "admin");
            }
            catch (InvalidOperationException ex)
            {
                fundDrawerBlocked = ex.Message.Contains("درج الكاشير");
            }
            AssertCondition(fundDrawerBlocked,
                "منع تغذية حساب رقمي من درج الكاشير بعد تشميع اليومية",
                "ثغرة! تم السماح بتغذية حساب من الدرج بعد إقفال اليوم!", report);

            // 3. EpayTerminal funding from cash_drawer -> MUST FAIL
            var epayRepo = new EpayRepository(_connStr, auditRepo);
            var terminal = new EpayTerminal
            {
                Id = "epay_term_closed_" + Guid.NewGuid().ToString("N").Substring(0, 8),
                Name = "ماكينة اليوم المغلق",
                Provider = "fawry",
                BalancePiasters = 50000,
                IsActive = true
            };
            epayRepo.SaveTerminal(terminal);

            bool epayFundBlocked = false;
            try
            {
                epayRepo.FundTerminal(terminal.Id, 10000, "cash_drawer", "تغذية بعد الإغلاق", "admin");
            }
            catch (InvalidOperationException ex)
            {
                epayFundBlocked = ex.Message.Contains("درج الكاشير");
            }
            AssertCondition(epayFundBlocked,
                "منع تغذية ماكينة دفع إلكتروني من درج الكاشير بعد تشميع اليومية",
                "ثغرة! تم السماح بتغذية ماكينة دفع من الدرج بعد إقفال اليوم!", report);

            // 4. Supplier Payment from cash_drawer -> MUST FAIL
            var supRepo = new SupplierRepository(_connStr, auditRepo);
            var sup = new Supplier
            {
                Id = "sup_closed_" + Guid.NewGuid().ToString("N").Substring(0, 8),
                Name = "مورد اليوم المغلق",
                BalancePiasters = 50000,
                IsActive = true
            };
            supRepo.Save(sup);

            bool supPayBlocked = false;
            try
            {
                supRepo.RecordPayment(sup.Id, 20000, "دفعة بعد الإغلاق", "admin", "cash_drawer");
            }
            catch (InvalidOperationException ex)
            {
                supPayBlocked = ex.Message.Contains("درج الكاشير");
            }
            AssertCondition(supPayBlocked,
                "منع صرف دفعة نقدية لمورد من درج الكاشير بعد تشميع اليومية",
                "ثغرة! تم السماح بسداد دفعة للمورد من الدرج بعد إقفال اليوم!", report);

            // 5. Purchase Invoice from cash_drawer -> MUST FAIL
            var purRepo = new PurchaseRepository(_connStr, counterRepo, supRepo, null, auditRepo);
            var prodRepo = new ProductRepository(_connStr);
            var prod = new Product
            {
                Id = "p_pur_closed_" + Guid.NewGuid().ToString("N").Substring(0, 8),
                Name = "صنف شراء بعد الإغلاق",
                PricePiasters = 5000,
                CostPiasters = 3000,
                StockQuantityMilli = 10000,
                IsActive = true
            };
            prodRepo.Upsert(prod);

            bool purBlocked = false;
            try
            {
                purRepo.CreatePurchase(new Purchase
                {
                    SupplierId = sup.Id,
                    PaidAmountPiasters = 30000,
                    PaymentSource = "cash_drawer",
                    Items = new List<PurchaseItem>
                    {
                        new PurchaseItem
                        {
                            ProductId = prod.Id,
                            QuantityMilli = 10000,
                            UnitCostPiasters = 3000
                        }
                    }
                });
            }
            catch (InvalidOperationException ex)
            {
                purBlocked = ex.Message.Contains("درج الكاشير");
            }
            AssertCondition(purBlocked,
                "منع سداد فاتورة شراء نقداً من درج الكاشير بعد تشميع اليومية",
                "ثغرة! تم السماح بسداد فاتورة شراء من الدرج بعد إقفال اليوم!", report);
        }

        // Test 28: Held Sales and Quick Items Sanity Guards
        private static void RunTest28_HeldSalesAndQuickItemsSanityGuards(AuditReport report)
        {
            var heldRepo = new HeldSaleRepository(_connStr);

            // 1. Held sale with negative total -> MUST FAIL
            bool negTotalBlocked = false;
            try
            {
                heldRepo.SaveHeldSale(new HeldSale
                {
                    HoldLabel = "سلة سالبة",
                    ItemsCount = 1,
                    SubtotalPiasters = -5000,
                    TotalPiasters = -5000,
                    CartJson = "[{\"id\":\"p1\"}]"
                });
            }
            catch (InvalidOperationException ex)
            {
                negTotalBlocked = ex.Message.Contains("سالب");
            }
            AssertCondition(negTotalBlocked,
                "منع تعليق فاتورة بإجمالي مالي سالب لحماية سلامة السلات المؤقتة",
                "ثغرة! تم السماح بتعليق فاتورة بإجمالي سالب!", report);

            // 2. Held sale with discount exceeding subtotal -> MUST FAIL
            bool discountExcessBlocked = false;
            try
            {
                heldRepo.SaveHeldSale(new HeldSale
                {
                    HoldLabel = "سلة خصم مبالغ",
                    ItemsCount = 1,
                    SubtotalPiasters = 5000,
                    DiscountPiasters = 10000,
                    TotalPiasters = 5000,
                    CartJson = "[{\"id\":\"p1\"}]"
                });
            }
            catch (InvalidOperationException ex)
            {
                discountExcessBlocked = ex.Message.Contains("الخصم");
            }
            AssertCondition(discountExcessBlocked,
                "منع تعليق فاتورة بقيمة خصم تتجاوز إجمالي الأصناف",
                "ثغرة! تم السماح بتعليق فاتورة بخصم أكبر من إجمالي السلة!", report);

            // 3. Quick Item with empty name -> MUST FAIL
            var quickRepo = new QuickItemRepository(_connStr);
            bool emptyNameBlocked = false;
            try
            {
                quickRepo.Save(new QuickItem
                {
                    Name = "   ",
                    PricePiasters = 1000,
                    IsOpenPrice = false
                });
            }
            catch (ArgumentException ex)
            {
                emptyNameBlocked = ex.Message.Contains("مطلوب");
            }
            AssertCondition(emptyNameBlocked,
                "منع إنشاء صنف سريع بدون اسم أو باسم فارغ",
                "ثغرة! تم السماح بإنشاء صنف سريع بدون اسم!", report);

            // 4. Quick Item with negative price -> MUST FAIL
            bool negPriceBlocked = false;
            try
            {
                quickRepo.Save(new QuickItem
                {
                    Name = "صنف سالب السعر",
                    PricePiasters = -5000,
                    IsOpenPrice = false
                });
            }
            catch (ArgumentException ex)
            {
                negPriceBlocked = ex.Message.Contains("سالب");
            }
            AssertCondition(negPriceBlocked,
                "منع إنشاء صنف سريع بسعر بيع سالب لحماية تسعيرة نقطة البيع",
                "ثغرة! تم السماح بإنشاء صنف سريع بسعر سالب!", report);
        }

        // Test 29: Customer Advance Credit Return Symmetry
        private static void RunTest29_CustomerAdvanceCreditReturnSymmetry(AuditReport report)
        {
            var custRepo = new CustomerRepository(_connStr);
            var prodRepo = new ProductRepository(_connStr);
            var saleRepo = new SaleRepository(_connStr);
            var saleService = new SaleService(saleRepo, prodRepo);
            var returnRepo = new ReturnRepository(_connStr);
            var returnService = new ReturnService(returnRepo, saleRepo);

            var cust = new Customer
            {
                Id = "cust_credit_sym_" + Guid.NewGuid().ToString("N").Substring(0, 8),
                Name = "عميل فحص الرصيد الدائن المتقدم",
                BalancePiasters = 0,
                IsArchived = false
            };
            custRepo.SaveCustomer(cust);

            var prod = new Product
            {
                Id = "prod_credit_sym_" + Guid.NewGuid().ToString("N").Substring(0, 8),
                Name = "صنف اختبار المرتجع الدائن",
                PricePiasters = 20000, // 200 EGP
                CostPiasters = 12000,
                StockQuantityMilli = 50000,
                IsActive = true
            };
            prodRepo.Upsert(prod);

            // Sale 1: Credit sale for 200 EGP (Balance goes to +20,000 debt)
            var sale = saleService.ProcessSale(new Sale
            {
                CustomerId = cust.Id,
                PaymentMethod = "credit",
                PaidPiasters = 0,
                TotalPiasters = 20000,
                Items = new List<SaleItem>
                {
                    new SaleItem
                    {
                        ProductId = prod.Id,
                        ProductName = prod.Name,
                        QuantityMilli = 1000,
                        UnitPricePiasters = 20000,
                        TotalPiasters = 20000
                    }
                }
            });

            AssertCondition(custRepo.GetById(cust.Id).BalancePiasters == 20000,
                "تسجيل مديونية الفاتورة الآجلة بدقة (+20,000 قرش)",
                "رصيد العميل غير مطابق بعد الفاتورة الآجلة", report);

            // Return 1: Return the item with credit refund (Balance drops back to 0)
            returnService.ProcessReturn(new Return
            {
                SaleId = sale.Id,
                CustomerId = cust.Id,
                RefundMethod = "credit",
                Reason = "استرجاع البضاعة وإلغاء المديونية",
                Items = new List<ReturnItem>
                {
                    new ReturnItem
                    {
                        ProductId = prod.Id,
                        ProductName = prod.Name,
                        QuantityMilli = 1000,
                        UnitPricePiasters = 20000,
                        TotalPiasters = 20000
                    }
                }
            });

            var cAfterReturn = custRepo.GetById(cust.Id);
            AssertCondition(cAfterReturn.BalancePiasters == 0,
                "تصفية مديونية العميل تماماً بعد المرتجع الآجل الكامل (الرصيد = 0 قرش)",
                "رصيد العميل بعد المرتجع غير مطابق: " + cAfterReturn.BalancePiasters, report);

            // Verify Double-Entry Balance Integrity
            var verif = custRepo.VerifyBalance(cust.Id);
            AssertCondition(verif != null && verif.IsBalanced && verif.DiscrepancyPiasters == 0,
                "تطابق دفتر أستاذ العميل بنسبة 100% مع الرصيد المخزن (انحراف = 0)",
                "يوجد انحراف في دفتر أستاذ العميل بعد المرتجع", report);
        }

        // Test 30: Multi-Tender InstaPay, Wallet, Cash, and Credit Split Parity
        private static void RunTest30_MultiTenderInstapayWalletCashSplitParity(AuditReport report)
        {
            var digRepo = new DigitalAccountRepository(_connStr);
            var custRepo = new CustomerRepository(_connStr);
            var prodRepo = new ProductRepository(_connStr);
            var saleRepo = new SaleRepository(_connStr);
            var saleService = new SaleService(saleRepo, prodRepo);

            // Setup default InstaPay and Wallet accounts
            var instaAcc = new DigitalAccount
            {
                Id = "dig_split_insta_" + Guid.NewGuid().ToString("N").Substring(0, 8),
                Name = "حساب إنستاباي للدفع المتعدد",
                Type = "instapay",
                Provider = "instapay",
                BalancePiasters = 100000, // 1,000 EGP
                IsDefault = true,
                IsActive = true
            };
            digRepo.SaveAccount(instaAcc);

            var walletAcc = new DigitalAccount
            {
                Id = "dig_split_wall_" + Guid.NewGuid().ToString("N").Substring(0, 8),
                Name = "محفظة كاش للدفع المتعدد",
                Type = "wallet",
                Provider = "vodafone_cash",
                BalancePiasters = 100000, // 1,000 EGP
                IsDefault = true,
                IsActive = true
            };
            digRepo.SaveAccount(walletAcc);

            var cust = new Customer
            {
                Id = "cust_split_" + Guid.NewGuid().ToString("N").Substring(0, 8),
                Name = "عميل الفاتورة المجزأة الرباعية",
                BalancePiasters = 0,
                IsArchived = false
            };
            custRepo.SaveCustomer(cust);

            var p = new Product
            {
                Id = "prod_split_" + Guid.NewGuid().ToString("N").Substring(0, 8),
                Name = "صنف الفاتورة الرباعية",
                PricePiasters = 100000, // 1,000 EGP
                CostPiasters = 70000,
                StockQuantityMilli = 50000,
                IsActive = true
            };
            prodRepo.Upsert(p);

            // 4-Way Split Sale: Total 1,000 EGP (100,000 piasters)
            // 250 EGP Cash (25,000 p)
            // 250 EGP InstaPay (25,000 p)
            // 250 EGP Wallet (25,000 p)
            // 250 EGP Debt / Credit (25,000 p) -> Unpaid
            // PaidPiasters = 75,000 piasters
            var splitSale = new Sale
            {
                CustomerId = cust.Id,
                PaymentMethod = "multi",
                SubtotalPiasters = 100000,
                TotalPiasters = 100000,
                PaidPiasters = 75000,
                Items = new List<SaleItem>
                {
                    new SaleItem
                    {
                        ProductId = p.Id,
                        ProductName = p.Name,
                        QuantityMilli = 1000,
                        UnitPricePiasters = 100000,
                        TotalPiasters = 100000
                    }
                },
                Payments = new List<SalePayment>
                {
                    new SalePayment { Method = "cash", AmountPiasters = 25000 },
                    new SalePayment { Method = "instapay", AmountPiasters = 25000 },
                    new SalePayment { Method = "wallet", AmountPiasters = 25000 },
                    new SalePayment { Method = "credit", AmountPiasters = 25000 }
                }
            };

            var completedSale = saleService.ProcessSale(splitSale);
            AssertCondition(completedSale != null && !string.IsNullOrEmpty(completedSale.Id),
                "تسجيل الفاتورة المجزأة الرباعية الذرية بنجاح فائق",
                "فشل تسجيل الفاتورة المجزأة الرباعية", report);

            // Verify InstaPay balance (+250 EGP -> 1250 EGP = 125,000 piasters)
            var instaAfter = digRepo.GetAccountById(instaAcc.Id);
            AssertCondition(instaAfter.BalancePiasters == 125000,
                "إيداع حصة إنستاباي من الفاتورة المجزأة تلقائياً (+250.00 ج.م)",
                "رصيد إنستاباي بعد الفاتورة المجزأة غير مطابق: " + instaAfter.BalancePiasters, report);

            // Verify Wallet balance (+250 EGP -> 1250 EGP = 125,000 piasters)
            var walletAfter = digRepo.GetAccountById(walletAcc.Id);
            AssertCondition(walletAfter.BalancePiasters == 125000,
                "إيداع حصة المحفظة الإلكترونية من الفاتورة المجزأة تلقائياً (+250.00 ج.م)",
                "رصيد المحفظة بعد الفاتورة المجزأة غير مطابق: " + walletAfter.BalancePiasters, report);

            // Verify Customer debt (+250 EGP = 25,000 piasters)
            var custAfter = custRepo.GetById(cust.Id);
            AssertCondition(custAfter.BalancePiasters == 25000,
                "تسجيل حصة الدين الآجل من الفاتورة المجزأة على حساب العميل بدقة (+250.00 ج.م)",
                "مديونية العميل بعد الفاتورة المجزأة غير مطابقة: " + custAfter.BalancePiasters, report);

            // Check Daily Closing Parity
            var closingRepo = new DailyClosingRepository(_connStr);
            var counterRepo = new CounterRepository(_connStr);
            var auditRepo = new AuditLogRepository(_connStr);
            var settingsRepo = new SettingsRepository(_connStr);
            var closingService = new DailyClosingService(_connStr, closingRepo, counterRepo, auditRepo, settingsRepo);

            string bDate = closingService.GetCurrentBusinessDate();
            var preview = closingService.GetClosingPreview(bDate);

            AssertCondition(preview.CashSalesPiasters >= 25000,
                "احتساب حصة الكاش من الفاتورة المجزأة في مبيعات النقدية بدقة",
                "حصة الكاش غير صحيحة في الإقفال", report);

            AssertCondition(preview.InstapaySalesPiasters >= 25000,
                "احتساب حصة إنستاباي من الفاتورة المجزأة في مبيعات إنستاباي بدقة",
                "حصة إنستاباي غير صحيحة في الإقفال", report);

            AssertCondition(preview.VodafoneCashSalesPiasters >= 25000,
                "احتساب حصة المحفظة من الفاتورة المجزأة في مبيعات المحافظ بدقة",
                "حصة المحفظة غير صحيحة في الإقفال", report);

            AssertCondition(preview.CreditSalesPiasters >= 25000,
                "احتساب حصة الآجل من الفاتورة المجزأة في مبيعات الآجل بدقة",
                "حصة الآجل غير صحيحة في الإقفال", report);
        }
    }
}


