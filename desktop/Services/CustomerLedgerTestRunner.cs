using System;
using System.IO;
using System.Collections.Generic;
using RafiqPOS.Common;
using RafiqPOS.Database;
using RafiqPOS.Models;
using RafiqPOS.Repositories;

namespace RafiqPOS.Services
{
    public class CustomerLedgerTestResult
    {
        public bool Success { get; set; }
        public string Message { get; set; }
        public int TotalAssertions { get; set; }
        public int PassedAssertions { get; set; }
        public List<string> Details { get; set; }

        public CustomerLedgerTestResult()
        {
            this.Details = new List<string>();
        }
    }

    public static class CustomerLedgerTestRunner
    {
        public static CustomerLedgerTestResult RunAllTests()
        {
            var result = new CustomerLedgerTestResult
            {
                Success = true,
                TotalAssertions = 0,
                PassedAssertions = 0
            };

            string tempDbPath = Path.Combine(Path.GetTempPath(), "rafiq_cust_test_" + Guid.NewGuid().ToString("N") + ".db");
            string tempConnStr = string.Format("Data Source={0};Version=3;BusyTimeout=5000;", tempDbPath);

            try
            {
                // 1. Run migrations on isolated SQLite database
                MigrationRunner.ApplyMigrations(tempConnStr, tempDbPath);
                Assert(File.Exists(tempDbPath), "قاعدة البيانات التجريبية لحسابات الآجل تم إنشاؤها بنجاح", result);

                // 2. Setup repos & services
                var custRepo = new CustomerRepository(tempConnStr);
                var custService = new CustomerService(custRepo);
                var pRepo = new ProductRepository(tempConnStr);
                var saleRepo = new SaleRepository(tempConnStr);
                var saleService = new SaleService(saleRepo, pRepo);

                // TEST 1: Create customer with opening debt
                var cust = new Customer
                {
                    Name = "الحاج عبد الرحيم",
                    Phone = "01099887766",
                    BalancePiasters = 50000, // 500.00 EGP opening balance
                    CreditLimitPiasters = 150000 // 1,500.00 EGP credit limit
                };
                var savedCust = custService.SaveCustomer(cust);
                Assert(savedCust != null && savedCust.BalancePiasters == 50000, "تم إنشاء العميل وحفظ الرصيد الافتتاحي (500 ج.م)", result);

                var statement1 = custService.GetStatement(savedCust.Id, 10);
                Assert(statement1.Count == 1 && statement1[0].Type == "opening_balance", "تسجيل قيد رصيد افتتاحي في دفتر الأستاذ", result);
                Assert(statement1[0].AmountPiasters == 50000 && statement1[0].BalanceAfterPiasters == 50000, "مطابقة قيمة قيد الرصيد الافتتاحي والرصيد بعد الحركة", result);

                // TEST 2: Credit Sale (فاتورة بيع آجل تزيد رصيد الدين)
                // First create a product to sell
                var prod = new Product
                {
                    Id = Guid.NewGuid().ToString(),
                    Name = "جبنة براميلي كجم",
                    Barcode = "6221144556677",
                    PricePiasters = 12000, // 120 EGP
                    CostPiasters = 9500,
                    StockQuantityMilli = 30000,
                    Unit = "kg",
                    IsActive = true
                };
                pRepo.Upsert(prod);

                var creditSale = new Sale
                {
                    CustomerId = savedCust.Id,
                    PaymentMethod = "CREDIT",
                    PaidPiasters = 0, // completely on credit
                    Items = new List<SaleItem>
                    {
                        new SaleItem
                        {
                            ProductId = prod.Id,
                            ProductName = prod.Name,
                            QuantityMilli = 1000, // 1 kg
                            UnitPricePiasters = 12000
                        }
                    }
                };
                var processedSale = saleService.ProcessSale(creditSale);
                Assert(processedSale != null && processedSale.TotalPiasters == 12000, "تم حفظ الفاتورة الآجلة بإجمالي 120 ج.م", result);

                var custAfterSale = custService.GetById(savedCust.Id);
                Assert(custAfterSale.BalancePiasters == 62000, "تحديث رصيد دين العميل إلى 620 ج.م (500 + 120)", result);

                // TEST 3: Partial Payment (تسجيل دفعة سداد نقدية جزئية)
                var custAfterPay = custService.RecordPayment(savedCust.Id, 22000, "دفعة نقدية باليد");
                Assert(custAfterPay.BalancePiasters == 40000, "تخفيض دين العميل بدقة إلى 400 ج.م بعد سداد 220 ج.م", result);

                var statement2 = custService.GetStatement(savedCust.Id, 10);
                var paymentEntry = statement2[0]; // latest entry
                Assert(paymentEntry.Type == "payment" && paymentEntry.AmountPiasters == 22000, "تسجيل قيد سداد نقدي صحيح في دفتر الحساب", result);
                Assert(paymentEntry.BalanceAfterPiasters == 40000, "رصيد ما بعد السداد مطابق تماماً (400 ج.م)", result);

                // TEST 4: Payment Cancellation via Contra Entry (إلغاء دفعة سداد بالخطأ بقيد معاكس دون حذف)
                var custAfterCancel = custService.CancelPayment(savedCust.Id, paymentEntry.Id, "تسجيل خاطئ باسم عميل آخر", "الكاشير");
                Assert(custAfterCancel.BalancePiasters == 62000, "استعادة رصيد العميل الأصلي 620 ج.م بعد إلغاء الدفعة بقيد معاكس", result);

                var statement3 = custService.GetStatement(savedCust.Id, 10);
                Assert(statement3.Count == 4, "دفتر الحساب يحتوي على 4 قيود دون أي حذف مادي (افتتاحي، فاتورة، سداد، إلغاء)", result);
                Assert(statement3[0].Type == "payment_cancel", "تسجيل قيد معاكس بنوع payment_cancel", result);

                // TEST 5: Full Settlement (سداد كامل الدين)
                var custSettled = custService.RecordPayment(savedCust.Id, 62000, "سداد كامل الدين وتصفير الحساب");
                Assert(custSettled.BalancePiasters == 0, "تصفير حساب العميل بعد السداد الكامل", result);

                // TEST 6: Strict Balance Verification Invariant (stored == calculated from ledger)
                var verification = custService.VerifyBalance(savedCust.Id);
                Assert(verification.IsBalanced && verification.DiscrepancyPiasters == 0, "قاعدة الموثوقية: الرصيد المخزن يساوي تماماً مجموع قيود الدفتر بدون أي فارق", result);

                // TEST 7: Artificial Discrepancy & Recalculate Recovery
                using (var conn = new System.Data.SQLite.SQLiteConnection(tempConnStr))
                {
                    conn.Open();
                    using (var cmd = new System.Data.SQLite.SQLiteCommand("UPDATE customers SET balance_piasters = 999999 WHERE id = @id;", conn))
                    {
                        cmd.Parameters.AddWithValue("@id", savedCust.Id);
                        cmd.ExecuteNonQuery();
                    }
                }

                var badVerif = custService.VerifyBalance(savedCust.Id);
                Assert(!badVerif.IsBalanced && badVerif.DiscrepancyPiasters != 0, "اكتشاف أي تلاعب أو تلف في رصيد العميل فحص عدم الاتساق", result);

                var fixedCust = custService.RecalculateAndFixBalance(savedCust.Id);
                Assert(fixedCust.BalancePiasters == 0, "نجاح أداة التدقيق التلقائي وإعادة ضبط الرصيد الصحيح 0 ج.م", result);

                // TEST 8: Excel Batch Import Atomicity
                var excelRows = new List<CustomerImportRow>
                {
                    new CustomerImportRow { RowIndex = 4, Name = "عميل إكسل 1", Phone = "01000000010", InitialBalancePiasters = 15000, CreditLimitPiasters = 100000, IsValid = true },
                    new CustomerImportRow { RowIndex = 5, Name = "عميل إكسل 2", Phone = "01000000020", InitialBalancePiasters = 25000, CreditLimitPiasters = 100000, IsValid = true },
                    new CustomerImportRow { RowIndex = 6, Name = "عميل خاطئ", Phone = "01000000010", InitialBalancePiasters = 5000, CreditLimitPiasters = 100000, IsValid = false } // duplicate phone
                };

                var importRes = custRepo.BatchImportCustomers(excelRows);
                Assert(importRes.ImportedCount == 2 && importRes.SkippedCount == 1, "استيراد العملاء الصالحين فقط وتخطي غير الصالح", result);
                Assert(importRes.TotalOpeningDebtsPiasters == 40000, "إجمالي ديون الاستيراد الافتتاحية 400 ج.م مطابقة تماماً", result);

                // TEST 9: Strict Credit Limit Enforcement (منع تجاوز الحد الائتماني دون صلاحية مدير)
                SecurityService.SetCurrentUserForTesting(null);
                var strictCust = new Customer
                {
                    Name = "عميل سقف الائتمان",
                    Phone = "01122334455",
                    BalancePiasters = 0,
                    CreditLimitPiasters = 50000 // 500.00 EGP limit
                };
                var savedStrictCust = custService.SaveCustomer(strictCust);

                var expensiveProd = new Product
                {
                    Id = Guid.NewGuid().ToString(),
                    Name = "زيت زيتون بكر ممتاز",
                    Barcode = "6229988776655",
                    PricePiasters = 60000, // 600.00 EGP (exceeds 500 limit)
                    CostPiasters = 45000,
                    StockQuantityMilli = 10000,
                    Unit = "bottle",
                    IsActive = true
                };
                pRepo.Upsert(expensiveProd);

                var breachingSale = new Sale
                {
                    CustomerId = savedStrictCust.Id,
                    PaymentMethod = "CREDIT",
                    PaidPiasters = 0,
                    Items = new List<SaleItem>
                    {
                        new SaleItem
                        {
                            ProductId = expensiveProd.Id,
                            ProductName = expensiveProd.Name,
                            QuantityMilli = 1000,
                            UnitPricePiasters = 60000
                        }
                    }
                };

                bool blockedByCreditLimit = false;
                try
                {
                    saleService.ProcessSale(breachingSale);
                }
                catch (InvalidOperationException ex)
                {
                    if (ex.Message != null && ex.Message.Contains("الحد الائتماني"))
                    {
                        blockedByCreditLimit = true;
                    }
                }
                Assert(blockedByCreditLimit, "الحظر الصارم للبيع الآجل عند تجاوز سقف الائتمان (600 ج.م > 500 ج.م)", result);

                // TEST 10: Authorized Credit Limit Override by Manager Session
                SecurityService.SetCurrentUserForTesting(new UserDto
                {
                    Id = "usr_manager_test",
                    Username = "manager_audit",
                    DisplayName = "مدير تدقيق الحسابات",
                    Role = "admin",
                    IsActive = true
                });

                var authorizedSale = saleService.ProcessSale(breachingSale);
                Assert(authorizedSale != null && authorizedSale.TotalPiasters == 60000, "السماح بالبيع الآجل متجاوز الحد الائتماني بعد موافقة مدير بصلاحية", result);

                var custAfterOverride = custService.GetById(savedStrictCust.Id);
                Assert(custAfterOverride.BalancePiasters == 60000, "تحديث رصيد العميل الآجل إلى 600 ج.م بعد التخطي الإداري", result);

                // TEST 11: Multi-Invoice FIFO Payment Allocation
                var fifoCust = new Customer
                {
                    Name = "عميل تجربة الفيفو",
                    Phone = "01233445566",
                    BalancePiasters = 0,
                    CreditLimitPiasters = 500000 // 5,000 EGP
                };
                var savedFifoCust = custService.SaveCustomer(fifoCust);

                var itemProd = new Product
                {
                    Id = Guid.NewGuid().ToString(),
                    Name = "علبة تونة فاخرة",
                    Barcode = "6227766554433",
                    PricePiasters = 5000, // 50.00 EGP
                    CostPiasters = 3800,
                    StockQuantityMilli = 50000,
                    Unit = "can",
                    IsActive = true
                };
                pRepo.Upsert(itemProd);

                // Invoice 1: 100.00 EGP (2 cans)
                var sale1 = saleService.ProcessSale(new Sale
                {
                    CustomerId = savedFifoCust.Id,
                    PaymentMethod = "CREDIT",
                    PaidPiasters = 0,
                    Items = new List<SaleItem>
                    {
                        new SaleItem { ProductId = itemProd.Id, ProductName = itemProd.Name, QuantityMilli = 2000, UnitPricePiasters = 5000 }
                    }
                });

                // Invoice 2: 150.00 EGP (3 cans)
                var sale2 = saleService.ProcessSale(new Sale
                {
                    CustomerId = savedFifoCust.Id,
                    PaymentMethod = "CREDIT",
                    PaidPiasters = 0,
                    Items = new List<SaleItem>
                    {
                        new SaleItem { ProductId = itemProd.Id, ProductName = itemProd.Name, QuantityMilli = 3000, UnitPricePiasters = 5000 }
                    }
                });

                Assert(sale1 != null && sale2 != null, "إنشاء فاتورتين آجلتين بإجمالي 250 ج.م (100 + 150)", result);
                var fifoCustBeforePay = custService.GetById(savedFifoCust.Id);
                Assert(fifoCustBeforePay.BalancePiasters == 25000, "رصيد دين العميل 250 ج.م قبل السداد", result);

                // Customer pays 170.00 EGP (17,000 piasters)
                // FIFO rule: Sale 1 (10,000 piasters) is 100% paid.
                // Sale 2 (15,000 piasters) receives remaining 7,000 piasters (paid_piasters = 7000, remaining debt = 8000).
                var fifoCustAfterPay = custService.RecordPayment(savedFifoCust.Id, 17000, "سداد دفعة مجمعة لتوزيعها فيفو");
                Assert(fifoCustAfterPay.BalancePiasters == 8000, "تحديث رصيد دين العميل إلى 80 ج.م المتبقية (250 - 170)", result);

                var updatedSale1 = saleRepo.GetSaleById(sale1.Id);
                var updatedSale2 = saleRepo.GetSaleById(sale2.Id);
                Assert(updatedSale1.PaidPiasters == 10000, "الفاتورة الأولى الأقدم تم سدادها بالكامل (100 ج.م) وفق قاعدة FIFO", result);
                Assert(updatedSale2.PaidPiasters == 7000, "الفاتورة الثانية استلمت المبلغ المتبقي (70 ج.م من أصل 150 ج.م)", result);

                // TEST 12: Reverse Receipt Voucher (إلغاء سند القبض وعكس التوزيع دون المساس بالدفتر التاريخي)
                var fifoStatement = custService.GetStatement(savedFifoCust.Id, 10);
                var fifoPayEntry = fifoStatement[0];
                Assert(fifoPayEntry.Type == "payment" && fifoPayEntry.AmountPiasters == 17000, "التحقق من وجود قيد السداد لسند القبض", result);

                var fifoCustReverted = custService.CancelPayment(savedFifoCust.Id, fifoPayEntry.Id, "إلغاء سند قبض بالخطأ", "مدير المراجعة");
                Assert(fifoCustReverted.BalancePiasters == 25000, "استعادة رصيد دين العميل الأصلي 250 ج.م بعد إلغاء السند", result);

                var revertedSale1 = saleRepo.GetSaleById(sale1.Id);
                var revertedSale2 = saleRepo.GetSaleById(sale2.Id);
                Assert(revertedSale1.PaidPiasters == 0, "عكس توزيع السداد على الفاتورة الأولى وعودتها غير مسددة (0 ج.م)", result);
                Assert(revertedSale2.PaidPiasters == 0, "عكس توزيع السداد على الفاتورة الثانية وعودتها غير مسددة (0 ج.م)", result);

                // TEST 13: Statement of Account Exact Equation: (Opening + Debits - Credits - Refunds) == Closing
                var detailedStatement = custRepo.GetDetailedStatement(savedFifoCust.Id, null, null);
                long expectedClosing = detailedStatement.OpeningBalancePiasters 
                    + detailedStatement.PeriodDebitsPiasters 
                    - detailedStatement.PeriodCreditsPiasters 
                    - detailedStatement.PeriodRefundsPiasters;

                Assert(detailedStatement.ClosingBalancePiasters == expectedClosing, 
                    string.Format("سلامة معادلة كشف الحساب: ({0} + {1} - {2} - {3}) = {4} قرش",
                        detailedStatement.OpeningBalancePiasters,
                        detailedStatement.PeriodDebitsPiasters,
                        detailedStatement.PeriodCreditsPiasters,
                        detailedStatement.PeriodRefundsPiasters,
                        detailedStatement.ClosingBalancePiasters),
                    result);

                var liveFifoCust = custService.GetById(savedFifoCust.Id);
                Assert(detailedStatement.ClosingBalancePiasters == liveFifoCust.BalancePiasters, "تطابق رصيد إغلاق كشف الحساب مع رصيد العميل الحي في قاعدة البيانات بدقة القروش", result);

                SecurityService.SetCurrentUserForTesting(null);

                result.Message = string.Format("نجحت جميع اختبارات الآجل والحسابات والمخزون ({0}/{1} تأكيد بنجاح 100%).",
                    result.PassedAssertions, result.TotalAssertions);
            }
            catch (Exception ex)
            {
                result.Success = false;
                result.Message = "فشل في اختبارات حسابات الآجل: " + ex.Message;
                result.Details.Add(ex.ToString());
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

        private static void Assert(bool condition, string assertionName, CustomerLedgerTestResult result)
        {
            result.TotalAssertions++;
            if (condition)
            {
                result.PassedAssertions++;
                result.Details.Add("[نجح] " + assertionName);
            }
            else
            {
                result.Success = false;
                result.Details.Add("[فشل] خرق في التأكيد: " + assertionName);
                throw new InvalidOperationException("خرق في اختبار الآجل: " + assertionName);
            }
        }
    }
}
