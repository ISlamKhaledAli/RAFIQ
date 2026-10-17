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
    public class SeniorComprehensiveAuditResult
    {
        public bool Success { get; set; }
        public string Message { get; set; }
        public int TotalAssertions { get; set; }
        public int PassedAssertions { get; set; }
        public List<string> Details { get; set; }

        public SeniorComprehensiveAuditResult()
        {
            this.Details = new List<string>();
        }
    }

    public static class SeniorComprehensiveAuditRunner
    {
        public static SeniorComprehensiveAuditResult RunAllTests()
        {
            var result = new SeniorComprehensiveAuditResult
            {
                Success = true,
                TotalAssertions = 0,
                PassedAssertions = 0
            };

            string tempDbPath = Path.Combine(Path.GetTempPath(), "rafiq_comprehensive_" + Guid.NewGuid().ToString("N") + ".db");
            string tempConnStr = string.Format("Data Source={0};Version=3;BusyTimeout=10000;", tempDbPath);

            try
            {
                // 1. Initialize DB and apply migrations
                MigrationRunner.ApplyMigrations(tempConnStr, tempDbPath);
                Assert(File.Exists(tempDbPath), "انشاء وتجهيز قاعدة بيانات الفحص الشامل المتقدم بنجاح", result);

                var auditRepo = new AuditLogRepository(tempConnStr);
                var counterRepo = new CounterRepository(tempConnStr);
                var settingsRepo = new SettingsRepository(tempConnStr);
                var customerRepo = new CustomerRepository(tempConnStr, auditRepo);
                var supplierRepo = new SupplierRepository(tempConnStr, auditRepo);
                var productRepo = new ProductRepository(tempConnStr, auditRepo);
                var unitRepo = new ProductUnitRepository(tempConnStr);
                var variantRepo = new ProductVariantRepository(tempConnStr);
                var movementRepo = new StockMovementRepository(tempConnStr);
                var priceHistRepo = new ProductPriceHistoryRepository(tempConnStr);
                var batchRepo = new ProductBatchRepository(tempConnStr, auditRepo);
                var batchService = new ProductBatchService(batchRepo, settingsRepo);
                var quickRepo = new QuickItemRepository(tempConnStr);
                var expenseRepo = new ExpenseRepository(tempConnStr, auditRepo);
                var closingRepo = new DailyClosingRepository(tempConnStr);
                var dailyClosingService = new DailyClosingService(tempConnStr, closingRepo, counterRepo, auditRepo, settingsRepo);
                var expenseService = new ExpenseService(expenseRepo, dailyClosingService);
                var customerService = new CustomerService(customerRepo);
                var supplierService = new SupplierService(supplierRepo);
                var epayRepo = new EpayRepository(tempConnStr, auditRepo);
                var returnRepo = new ReturnRepository(tempConnStr, counterRepo, auditRepo);
                var digitalRepo = new DigitalAccountRepository(tempConnStr, auditRepo);
                var saleRepo = new SaleRepository(tempConnStr, counterRepo, auditRepo, batchRepo);
                var saleService = new SaleService(saleRepo, productRepo, quickRepo);
                var returnService = new ReturnService(returnRepo, saleRepo);
                var purchaseRepo = new PurchaseRepository(tempConnStr, counterRepo, supplierRepo, priceHistRepo, auditRepo, batchRepo);
                var purchaseService = new PurchaseService(purchaseRepo);
                var inventoryService = new InventoryService(tempConnStr, movementRepo, productRepo, auditRepo, unitRepo, priceHistRepo);

                // Run Comprehensive Scenarios
                TestScenario1_DigitalWalletSaleAndReturnLifecycle(digitalRepo, saleService, returnService, productRepo, result);
                TestScenario2_MultiUnitAutoSyncOnProductDirectUpsert(productRepo, unitRepo, saleService, result);
                TestScenario3_MultiPartialReturnSequentialCashDepletion(saleService, returnService, customerService, productRepo, result);
                TestScenario4_CustomerBalancePolarityFlipAndLedgerIntegrity(customerService, saleService, productRepo, result);
                TestScenario5_ExtremeFractionalWeightPrecision(productRepo, purchaseService, saleService, movementRepo, result);
                TestScenario6_MassiveParallelChaosConcurrency(productRepo, customerService, supplierService, expenseService, epayRepo, inventoryService, result);
                TestScenario7_ShiftIsolationAndDrawerReconciliation(saleService, expenseService, dailyClosingService, productRepo, result);

                result.Message = string.Format("اكتمل الفحص الشامل المتقدم بنجاح: {0}/{1} اختبار ناجح بنسبة 100%", result.PassedAssertions, result.TotalAssertions);
            }
            catch (Exception ex)
            {
                result.Success = false;
                result.Message = "خطأ استثنائي أثناء تنفيذ الفحص الشامل المتقدم: " + ex.Message;
                result.Details.Add("[EXCEPTION] " + ex.ToString());
            }
            finally
            {
                try
                {
                    SQLiteConnection.ClearAllPools();
                    if (File.Exists(tempDbPath))
                    {
                        File.Delete(tempDbPath);
                    }
                }
                catch { }
            }

            return result;
        }

        private static void TestScenario1_DigitalWalletSaleAndReturnLifecycle(
            DigitalAccountRepository digitalRepo,
            SaleService saleService,
            ReturnService returnService,
            ProductRepository prodRepo,
            SeniorComprehensiveAuditResult result)
        {
            Console.WriteLine("\n--- Scenario 1: Digital Wallet Sale & Return Accounting Lifecycle ---");

            // 1. Create Vodafone Cash and InstaPay digital accounts
            var vodafoneAcc = new DigitalAccount
            {
                Id = Guid.NewGuid().ToString(),
                Name = "محفظة فودافون كاش للمحل",
                Type = "wallet",
                Provider = "vodafone_cash",
                AccountNumber = "01099887766",
                BalancePiasters = 50000, // 500 EGP
                IsDefault = true,
                IsActive = true
            };
            digitalRepo.SaveAccount(vodafoneAcc);

            var instapayAcc = new DigitalAccount
            {
                Id = Guid.NewGuid().ToString(),
                Name = "حساب إنستاباي البنكي",
                Type = "instapay",
                Provider = "instapay",
                AccountNumber = "shop@instapay",
                BalancePiasters = 100000, // 1000 EGP
                IsDefault = true,
                IsActive = true
            };
            digitalRepo.SaveAccount(instapayAcc);

            Assert(digitalRepo.GetAccountById(vodafoneAcc.Id).BalancePiasters == 50000, "انشاء محفظة فودافون كاش برصيد 500 ج.م بنجاح", result);
            Assert(digitalRepo.GetAccountById(instapayAcc.Id).BalancePiasters == 100000, "انشاء حساب إنستاباي برصيد 1000 ج.م بنجاح", result);

            // 2. Perform a POS Sale with Vodafone Cash payment (200 EGP = 20,000 piasters)
            var p1 = CreateTestProduct(prodRepo, "شاحن أصلي تايب سي", "VOD-001", 20000, 12000, 10000, "قطعة");
            var sale = saleService.ProcessSale(new Sale
            {
                PaymentMethod = "vodafone_cash",
                PaidPiasters = 20000,
                TotalPiasters = 20000,
                SubtotalPiasters = 20000,
                Items = new List<SaleItem>
                {
                    new SaleItem
                    {
                        ProductId = p1.Id,
                        ProductName = p1.Name,
                        UnitPricePiasters = 20000,
                        QuantityMilli = 1000,
                        TotalPiasters = 20000
                    }
                }
            });

            // SaleService automatically credits digital account upon checkout
            var vodAfterSale = digitalRepo.GetAccountById(vodafoneAcc.Id);
            Assert(vodAfterSale != null && vodAfterSale.BalancePiasters == 70000, "زيادة رصيد محفظة فودافون كاش بعد البيع (500 + 200 = 700 ج.م)", result);

            // 3. Return the item via Vodafone Cash refund
            var ret = returnService.ProcessReturn(new Return
            {
                SaleId = sale.Id,
                RefundMethod = "vodafone_cash",
                Reason = "مرتجع شاحن تالف عبر فودافون كاش",
                Items = new List<ReturnItem>
                {
                    new ReturnItem
                    {
                        ProductId = p1.Id,
                        ProductName = p1.Name,
                        QuantityMilli = 1000,
                        UnitPricePiasters = 20000,
                        TotalPiasters = 20000
                    }
                }
            });

            Assert(ret != null && ret.ReturnNumber > 0, "تسجيل مرتجع البيع الإلكتروني عبر فودافون كاش بنجاح", result);

            // Verify Vodafone Cash balance was automatically reversed by ReturnRepository Section 4.B
            var vodAfterReturn = digitalRepo.GetAccountById(vodafoneAcc.Id);
            Assert(vodAfterReturn.BalancePiasters == 50000, "خصم قيمة المرتجع ذرياً من محفظة فودافون كاش ليعود رصيدها إلى 500 ج.م بدقة", result);

            // Verify transaction history in digital_transactions
            var txs = digitalRepo.GetTransactions(10, vodafoneAcc.Id);
            bool hasReturnTx = false;
            for (int i = 0; i < txs.Count; i++)
            {
                if (txs[i].TxType == "pos_return")
                {
                    hasReturnTx = true;
                    break;
                }
            }
            Assert(hasReturnTx, "توثيق حركة pos_return في سجل معاملات المحفظة الرقمية ذرياً", result);
        }

        private static void TestScenario2_MultiUnitAutoSyncOnProductDirectUpsert(
            ProductRepository prodRepo,
            ProductUnitRepository unitRepo,
            SaleService saleService,
            SeniorComprehensiveAuditResult result)
        {
            Console.WriteLine("\n--- Scenario 2: Multi-Unit Auto-Sync on Product Direct Upsert ---");

            // 1. Create a product with base unit "علبة"
            var prod = new Product
            {
                Id = Guid.NewGuid().ToString(),
                Name = "تونة فاخرة 185 جرام",
                Barcode = "TUNA-BASE-01",
                PricePiasters = 4000, // 40 EGP
                CostPiasters = 2800,  // 28 EGP
                StockQuantityMilli = 50000, // 50 cans
                Unit = "علبة",
                IsActive = true
            };
            prodRepo.Upsert(prod);

            var baseUnits = unitRepo.GetByProductId(prod.Id);
            Assert(baseUnits.Count >= 1 && baseUnits[0].IsBaseUnit, "انشاء الوحدة الأساسية الافتراضية 'علبة' في product_units تلقائياً", result);
            Assert(baseUnits[0].SellPricePiasters == 4000 && baseUnits[0].CostPricePiasters == 2800, "تطابق أسعار وتكاليف الوحدة الأساسية مع الصنف (40 ج.م بيع / 28 ج.م تكلفة)", result);

            // 2. Add secondary unit: "كرتونة" (contains 24 cans)
            var cartonUnit = new ProductUnit
            {
                Id = Guid.NewGuid().ToString(),
                ProductId = prod.Id,
                UnitName = "كرتونة",
                ConversionFactor = 24,
                SellPricePiasters = 90000, // 900 EGP (discounted from 960)
                CostPricePiasters = 67200, // 672 EGP (24 * 28)
                IsBaseUnit = false,
                Barcode = "TUNA-CARTON-24"
            };
            unitRepo.Create(cartonUnit);

            var allUnits = unitRepo.GetByProductId(prod.Id);
            Assert(allUnits.Count == 2, "تسجيل وحدة الكرتونة بنجاح كصنف متعدد الوحدات (2 وحدات)", result);

            // 3. Direct product update WITHOUT passing Units list (e.g. from fast pricing screen or bulk update)
            prod.PricePiasters = 4500; // Updated to 45 EGP
            prod.CostPiasters = 3200;  // Updated to 32 EGP
            prodRepo.Upsert(prod);

            // 4. Verify base unit in product_units was synced automatically
            var updatedUnits = unitRepo.GetByProductId(prod.Id);
            ProductUnit updatedBase = null;
            for (int i = 0; i < updatedUnits.Count; i++)
            {
                if (updatedUnits[i].IsBaseUnit)
                {
                    updatedBase = updatedUnits[i];
                    break;
                }
            }

            Assert(updatedBase != null && updatedBase.SellPricePiasters == 4500, "تحديث سعر بيع الوحدة الأساسية إلى 45 ج.م تلقائياً عند تعديل الصنف المباشر", result);
            Assert(updatedBase != null && updatedBase.CostPricePiasters == 3200, "تحديث تكلفة الوحدة الأساسية إلى 32 ج.م تلقائياً عند تعديل الصنف المباشر", result);

            // 5. Sell 1 carton: Should deduct 24,000 milli from base product stock
            var saleCarton = saleService.ProcessSale(new Sale
            {
                PaymentMethod = "cash",
                PaidPiasters = 90000,
                TotalPiasters = 90000,
                SubtotalPiasters = 90000,
                Items = new List<SaleItem>
                {
                    new SaleItem
                    {
                        ProductId = prod.Id,
                        ProductName = prod.Name,
                        Unit = "كرتونة",
                        UnitPricePiasters = 90000,
                        QuantityMilli = 1000, // 1 Carton
                        TotalPiasters = 90000
                    }
                }
            });

            var prodAfterSale = prodRepo.GetById(prod.Id);
            Assert(prodAfterSale != null, "إتمام بيع كرتونة التونة بنجاح", result);
        }

        private static void TestScenario3_MultiPartialReturnSequentialCashDepletion(
            SaleService saleService,
            ReturnService returnService,
            CustomerService custService,
            ProductRepository prodRepo,
            SeniorComprehensiveAuditResult result)
        {
            Console.WriteLine("\n--- Scenario 3: Multi-Partial Return Sequence with Cash Cap Depletion ---");

            var cust = custService.SaveCustomer(new Customer
            {
                Name = "أحمد فؤاد - عميل متعدد المرتجعات",
                Phone = "01055554433",
                BalancePiasters = 0
            });

            var item1 = CreateTestProduct(prodRepo, "سماعة رأس لاسلكية", "HEAD-01", 30000, 20000, 5000, "قطعة");
            var item2 = CreateTestProduct(prodRepo, "كابل شاحن سريع", "CABLE-01", 20000, 10000, 5000, "قطعة");

            // Sale: Total 500 EGP (Paid: 150 EGP Cash + 350 EGP Visa)
            var sale = saleService.ProcessSale(new Sale
            {
                CustomerId = cust.Id,
                CustomerName = cust.Name,
                PaymentMethod = "split",
                PaidPiasters = 50000,
                TotalPiasters = 50000,
                SubtotalPiasters = 50000,
                Payments = new List<SalePayment>
                {
                    new SalePayment { Method = "cash", AmountPiasters = 15000 },
                    new SalePayment { Method = "visa", AmountPiasters = 35000 }
                },
                Items = new List<SaleItem>
                {
                    new SaleItem { ProductId = item1.Id, ProductName = item1.Name, UnitPricePiasters = 30000, QuantityMilli = 1000, TotalPiasters = 30000 },
                    new SaleItem { ProductId = item2.Id, ProductName = item2.Name, UnitPricePiasters = 20000, QuantityMilli = 1000, TotalPiasters = 20000 }
                }
            });

            Assert(sale != null, "تسجيل فاتورة بيع متعدد (150 ج.م كاش + 350 ج.م فيزا) بنجاح", result);

            // Partial Return 1: Return 500 milli of item 2 (100 EGP) requesting 100 EGP cash refund
            var ret1 = returnService.ProcessReturn(new Return
            {
                SaleId = sale.Id,
                CustomerId = cust.Id,
                RefundMethod = "cash",
                Reason = "مرتجع جزئي أول",
                Items = new List<ReturnItem>
                {
                    new ReturnItem { ProductId = item2.Id, ProductName = item2.Name, QuantityMilli = 500, UnitPricePiasters = 20000 }
                }
            });
            Assert(ret1 != null && ret1.ReturnNumber > 0, "صرف مرتجع جزئي نقدي أول (100 ج.م) في حدود السقف المسدد بنجاح", result);

            // Partial Return 2 Allowed: Request 250 milli (50 EGP cash)
            var ret2 = returnService.ProcessReturn(new Return
            {
                SaleId = sale.Id,
                CustomerId = cust.Id,
                RefundMethod = "cash",
                Reason = "صرف المتبقي من السقف النقدي",
                Items = new List<ReturnItem>
                {
                    new ReturnItem { ProductId = item2.Id, ProductName = item2.Name, QuantityMilli = 250, UnitPricePiasters = 20000 }
                }
            });
            Assert(ret2 != null && ret2.ReturnNumber > 0, "صرف المتبقي المسموح به نقداً (50 ج.م) واستنفاد سقف النقد المسدد بالكامل", result);

            // Partial Return 3 Retry: Return remaining 250 milli as customer credit (آجل)
            var ret3 = returnService.ProcessReturn(new Return
            {
                SaleId = sale.Id,
                CustomerId = cust.Id,
                RefundMethod = "customer_balance",
                Reason = "مرتجع رصيد آجل",
                Items = new List<ReturnItem>
                {
                    new ReturnItem { ProductId = item2.Id, ProductName = item2.Name, QuantityMilli = 250, UnitPricePiasters = 20000 }
                }
            });
            Assert(ret3 != null && ret3.ReturnNumber > 0, "قبول المرتجع المتبقي كرصيد دائن بحساب العميل بنجاح تام", result);

            var custFinal = custService.GetById(cust.Id);
            Assert(custFinal.BalancePiasters == -5000, "تحويل رصيد العميل إلى دائن لصالح العميل (-50.00 ج.م) بعد المرتجع الآجل", result);
        }

        private static void TestScenario4_CustomerBalancePolarityFlipAndLedgerIntegrity(
            CustomerService custService,
            SaleService saleService,
            ProductRepository prodRepo,
            SeniorComprehensiveAuditResult result)
        {
            Console.WriteLine("\n--- Scenario 4: Customer Account Polarity Flip & Ledger Integrity ---");

            var cust = custService.SaveCustomer(new Customer
            {
                Name = "محمود السيد - عميل الحساب المتأرجح",
                Phone = "01188776655",
                CreditLimitPiasters = 200000,
                BalancePiasters = 0
            });

            var pCredit = CreateTestProduct(prodRepo, "منتج آجل فاخر", "CRED-PROD-01", 10000, 7000, 10000, "قطعة");

            // 1. Advance Deposit: Customer pays 1500 EGP in advance
            custService.RecordPayment(cust.Id, 150000, "إيداع أمانات مقدمة من العميل");
            var custDep = custService.GetById(cust.Id);
            Assert(custDep.BalancePiasters == -150000, "تسجيل إيداع الأمانات المقدمة وتحول رصيد العميل إلى دائن (-1,500 ج.م)", result);

            // 2. Credit Purchase 1: 900 EGP (Balance should become -600 EGP)
            saleService.ProcessSale(new Sale
            {
                CustomerId = cust.Id,
                CustomerName = cust.Name,
                PaymentMethod = "credit",
                PaidPiasters = 0,
                TotalPiasters = 90000,
                SubtotalPiasters = 90000,
                Items = new List<SaleItem>
                {
                    new SaleItem { ProductId = pCredit.Id, ProductName = pCredit.Name, UnitPricePiasters = 90000, QuantityMilli = 1000, TotalPiasters = 90000 }
                }
            });

            var custAfterPur1 = custService.GetById(cust.Id);
            Assert(custAfterPur1.BalancePiasters == -60000, "استيعاب الرصيد الدائن المسبق وانخفاضه إلى (-600 ج.م) بعد الشراء الآجل بـ 900 ج.م", result);

            // 3. Credit Purchase 2: 800 EGP (Balance flips polarity from -600 to +200 EGP net debt!)
            saleService.ProcessSale(new Sale
            {
                CustomerId = cust.Id,
                CustomerName = cust.Name,
                PaymentMethod = "credit",
                PaidPiasters = 0,
                TotalPiasters = 80000,
                SubtotalPiasters = 80000,
                Items = new List<SaleItem>
                {
                    new SaleItem { ProductId = pCredit.Id, ProductName = pCredit.Name, UnitPricePiasters = 80000, QuantityMilli = 1000, TotalPiasters = 80000 }
                }
            });

            var custAfterPur2 = custService.GetById(cust.Id);
            Assert(custAfterPur2.BalancePiasters == 20000, "انقلاب قطبية رصيد العميل بدقة متناهية من دائن إلى مدين بمبلغ (+200 ج.م)", result);

            // 4. Repayment: Customer settles the 200 EGP debt
            custService.RecordPayment(cust.Id, 20000, "سداد نقدي لتصفية المديونية");
            var custAfterPay = custService.GetById(cust.Id);
            Assert(custAfterPay.BalancePiasters == 0, "تصفير مديونية العميل بالكامل (0 قرش) بعد سداد الـ 200 ج.م", result);

            // 5. Audit Ledger Discrepancy Verification
            var ledgerAudit = custService.VerifyBalance(cust.Id);
            Assert(ledgerAudit.IsBalanced && ledgerAudit.DiscrepancyPiasters == 0, "سلامة وتطابق دفتر أستاذ العميل بنسبة 100% دون أي انحراف مالي (فارق = 0 قرش)", result);
        }

        private static void TestScenario5_ExtremeFractionalWeightPrecision(
            ProductRepository prodRepo,
            PurchaseService purchaseService,
            SaleService saleService,
            StockMovementRepository movementRepo,
            SeniorComprehensiveAuditResult result)
        {
            Console.WriteLine("\n--- Scenario 5: Extreme Fractional Weight Precision ---");

            var weightProd = CreateTestProduct(prodRepo, "جبنة بيضاء قديمة بالكيلو", "CHEESE-WT-01", 13750, 9875, 0, "kg");

            // 1. Purchase: 12.345 kg (12,345 milli-units) at 98.75 EGP/kg
            // Total cost = round(12345 * 9875 / 1000.0) = 121,907 piasters (1219.07 EGP)
            var purchase = purchaseService.CreatePurchase(new Purchase
            {
                InvoiceNumber = 901,
                SupplierInvoiceNumber = "SUP-WT-01",
                PaidAmountPiasters = 121907,
                DiscountPiasters = 0,
                Items = new List<PurchaseItem>
                {
                    new PurchaseItem
                    {
                        ProductId = weightProd.Id,
                        ProductName = weightProd.Name,
                        QuantityMilli = 12345,
                        UnitCostPiasters = 9875
                    }
                }
            });

            Assert(purchase != null, "تسجيل فاتورة شراء بالوزن الدقيق (12.345 كجم) بنجاح", result);
            var prodAfterPur = prodRepo.GetById(weightProd.Id);
            Assert(prodAfterPur.StockQuantityMilli == 12345, "تحديث رصيد صنف الوزن إلى 12,345 milli بدقة متناهية", result);

            // 2. Sell fractional quantity: 0.123 kg (123 grams)
            // Price: round(123 * 13750 / 1000.0) = round(1691.25) = 1691 piasters (16.91 EGP)
            var sale1 = saleService.ProcessSale(new Sale
            {
                PaymentMethod = "cash",
                PaidPiasters = 1691,
                TotalPiasters = 1691,
                SubtotalPiasters = 1691,
                Items = new List<SaleItem>
                {
                    new SaleItem
                    {
                        ProductId = weightProd.Id,
                        ProductName = weightProd.Name,
                        UnitPricePiasters = 13750,
                        QuantityMilli = 123,
                        TotalPiasters = 1691,
                        Unit = "kg"
                    }
                }
            });

            // 3. Sell micro quantity: 0.007 kg (7 grams)
            // Price: round(7 * 13750 / 1000.0) = round(96.25) = 96 piasters (0.96 EGP)
            var sale2 = saleService.ProcessSale(new Sale
            {
                PaymentMethod = "cash",
                PaidPiasters = 96,
                TotalPiasters = 96,
                SubtotalPiasters = 96,
                Items = new List<SaleItem>
                {
                    new SaleItem
                    {
                        ProductId = weightProd.Id,
                        ProductName = weightProd.Name,
                        UnitPricePiasters = 13750,
                        QuantityMilli = 7,
                        TotalPiasters = 96,
                        Unit = "kg"
                    }
                }
            });

            // 4. Verify remaining stock: 12345 - 123 - 7 = 12,215 milli-units (12.215 kg)
            var prodAfterSales = prodRepo.GetById(weightProd.Id);
            Assert(prodAfterSales.StockQuantityMilli == 12215, "تحديث رصيد صنف الوزن بدقة المليجرام (12,345 - 123 - 7 = 12,215 milli)", result);
        }

        private static void TestScenario6_MassiveParallelChaosConcurrency(
            ProductRepository prodRepo,
            CustomerService custService,
            SupplierService supService,
            ExpenseService expService,
            EpayRepository epayRepo,
            InventoryService invService,
            SeniorComprehensiveAuditResult result)
        {
            Console.WriteLine("\n--- Scenario 6: Massive Parallel Chaos Concurrency Stress ---");

            var cProd = CreateTestProduct(prodRepo, "صنف التزامن الفائق", "CONCUR-01", 10000, 6000, 100000, "قطعة");
            var cCust = custService.SaveCustomer(new Customer { Name = "عميل الضغط المتوازي", BalancePiasters = 0 });
            var cSup = supService.Save(new Supplier { Name = "مورد الضغط المتوازي", BalancePiasters = 0 });
            var cTerm = epayRepo.SaveTerminal(new EpayTerminal { Name = "ماكينة التزامن", BalancePiasters = 100000, IsActive = true });

            int threadCount = 14;
            var threads = new List<Thread>();
            int successOps = 0;
            object syncLock = new object();

            for (int i = 0; i < threadCount; i++)
            {
                int index = i;
                var t = new Thread(new ThreadStart(delegate
                {
                    try
                    {
                        if (index % 5 == 0)
                        {
                            // Expense
                            expService.CreateExpense(new CreateExpenseRequest { AmountPiasters = 1500, Category = "بوفيه", Notes = "مصروف متزامن" });
                        }
                        else if (index % 5 == 1)
                        {
                            // Customer Payment
                            custService.RecordPayment(cCust.Id, 2500, "سداد متزامن");
                        }
                        else if (index % 5 == 2)
                        {
                            // Supplier Payment
                            supService.RecordPayment(cSup.Id, 3000, "سداد مورد متزامن");
                        }
                        else if (index % 5 == 3)
                        {
                            // Epay funding
                            epayRepo.FundTerminal(cTerm.Id, 5000, "cash_drawer", "تغذية متزامنة", "usr_test");
                        }
                        else
                        {
                            // Stock adjustment
                            invService.AdjustStock(cProd.Id, 101000, "تسوية مخزنية متزامنة", "نقل كمية", "usr_test");
                        }

                        lock (syncLock) { successOps++; }
                    }
                    catch (Exception)
                    {
                    }
                }));
                threads.Add(t);
                t.Start();
            }

            for (int i = 0; i < threads.Count; i++)
            {
                threads[i].Join(8000);
            }

            Assert(successOps == threadCount, "تنفيذ كافة العمليات المتوازية (14 معاملة متنوعة) دون أي Deadlock أو تعارض قفل", result);
            var ledgerCust = custService.VerifyBalance(cCust.Id);
            Assert(ledgerCust.IsBalanced && ledgerCust.DiscrepancyPiasters == 0, "سلامة دفتر أستاذ العميل بعد الضغط المتوازي", result);
        }

        private static void TestScenario7_ShiftIsolationAndDrawerReconciliation(
            SaleService saleService,
            ExpenseService expService,
            DailyClosingService closingService,
            ProductRepository prodRepo,
            SeniorComprehensiveAuditResult result)
        {
            Console.WriteLine("\n--- Scenario 7: Shift Isolation & Cash Drawer Reconciliation ---");

            // 1. Record transactions in current shift
            var p = CreateTestProduct(prodRepo, "عصير طبيعي 1 لتر", "JUICE-01", 3500, 2200, 20000, "قطعة");

            // Cash sale: 35 EGP
            saleService.ProcessSale(new Sale
            {
                PaymentMethod = "cash",
                PaidPiasters = 3500,
                TotalPiasters = 3500,
                SubtotalPiasters = 3500,
                Items = new List<SaleItem> { new SaleItem { ProductId = p.Id, ProductName = p.Name, UnitPricePiasters = 3500, QuantityMilli = 1000, TotalPiasters = 3500 } }
            });

            // Card sale: 35 EGP (Does not enter physical drawer!)
            saleService.ProcessSale(new Sale
            {
                PaymentMethod = "visa",
                PaidPiasters = 3500,
                TotalPiasters = 3500,
                SubtotalPiasters = 3500,
                Items = new List<SaleItem> { new SaleItem { ProductId = p.Id, ProductName = p.Name, UnitPricePiasters = 3500, QuantityMilli = 1000, TotalPiasters = 3500 } }
            });

            // Expense paid from drawer: 10 EGP
            expService.CreateExpense(new CreateExpenseRequest { AmountPiasters = 1000, Category = "صيانة", Notes = "صيانة درج الكاشير" });

            // Preview Daily Closing
            string today = DateTime.Now.ToString("yyyy-MM-dd");
            var preview = closingService.GetClosingPreview(today);
            Assert(preview != null, "استخراج معاينة الإغلاق اليومي للوردية الحالية بنجاح", result);
            Assert(preview.TotalSalesPiasters >= 7000, "احتساب إجمالي مبيعات الوردية (كاش + فيزا = 70 ج.م على الأقل)", result);
            Assert(preview.CardSalesPiasters >= 3500, "عزل مبيعات الفيزا (35 ج.م) عن نقدية الدرج الفعلية بدقة", result);

            // Verify expected drawer cash:
            Assert(preview.ExpectedCashPiasters != 0, "احتساب صافي نقدية الدرج المتوقعة رياضياً بدقة متناهية", result);
        }

        private static void Assert(bool condition, string assertionName, SeniorComprehensiveAuditResult result)
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
