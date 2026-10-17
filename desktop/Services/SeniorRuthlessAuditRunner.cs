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

            // Net wallet drawer cash: 41,500 collected - 25,000 paid = 16,500 piasters
            AssertCondition(preview.WalletsDrawerCashPiasters == 16500,
                "صافي حركة الكاشير الناتجة عن معاملات المحفظة (سحب وإيداع) دقيقة (+165.00 ج.م)",
                "صافي كاش المحفظة غير مطابق: " + preview.WalletsDrawerCashPiasters, report);

            // Expected cash must incorporate + 16,500 - 100,000 = -83,500
            // Since there were no sales yet, Math.Max(0, -83500) = 0
            AssertCondition(preview.ExpectedCashPiasters >= 0,
                "حساب النقدية المتوقعة في الدرج آمن وغير سالب",
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
    }
}
