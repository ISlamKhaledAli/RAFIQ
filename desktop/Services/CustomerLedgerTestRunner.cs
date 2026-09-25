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
