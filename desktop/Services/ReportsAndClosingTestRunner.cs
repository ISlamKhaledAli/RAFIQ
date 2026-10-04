using System;
using System.IO;
using System.Collections.Generic;
using System.Data.SQLite;
using RafiqPOS.Common;
using RafiqPOS.Database;
using RafiqPOS.Models;
using RafiqPOS.Repositories;

namespace RafiqPOS.Services
{
    public class ReportsAndClosingTestResult
    {
        public bool Success { get; set; }
        public string Message { get; set; }
        public int TotalAssertions { get; set; }
        public int PassedAssertions { get; set; }
        public List<string> Details { get; set; }

        public ReportsAndClosingTestResult()
        {
            this.Details = new List<string>();
        }
    }

    public static class ReportsAndClosingTestRunner
    {
        public static ReportsAndClosingTestResult RunAllTests()
        {
            var result = new ReportsAndClosingTestResult
            {
                Success = true,
                TotalAssertions = 0,
                PassedAssertions = 0
            };

            string tempDbPath = Path.Combine(Path.GetTempPath(), "rafiq_reports_m9_test_" + Guid.NewGuid().ToString("N") + ".db");
            string tempConnStr = string.Format("Data Source={0};Version=3;BusyTimeout=5000;", tempDbPath);

            try
            {
                // 1. Run migrations up to Migration 22
                MigrationRunner.ApplyMigrations(tempConnStr, tempDbPath);
                Assert(File.Exists(tempDbPath), "تم إنشاء وتطبيق قاعدة بيانات تقارير المحطة 9 وهجرتها للنسخة 22 بنجاح", result);

                // 2. Setup repos & services
                var counterRepo = new CounterRepository(tempConnStr);
                var auditRepo = new AuditLogRepository(tempConnStr);
                var pRepo = new ProductRepository(tempConnStr, auditRepo);
                var saleRepo = new SaleRepository(tempConnStr, counterRepo, auditRepo);
                var custRepo = new CustomerRepository(tempConnStr, auditRepo);
                var heldRepo = new HeldSaleRepository(tempConnStr);
                var retRepo = new ReturnRepository(tempConnStr, counterRepo, auditRepo);
                var settingsRepo = new SettingsRepository(tempConnStr);
                var userRepo = new UserRepository(tempConnStr);
                var closingRepo = new DailyClosingRepository(tempConnStr);
                var priceHistRepo = new ProductPriceHistoryRepository(tempConnStr);
                var stockMovementRepo = new StockMovementRepository(tempConnStr);

                var prodService = new ProductService(pRepo, auditRepo, priceHistRepo, stockMovementRepo);
                var custService = new CustomerService(custRepo);
                var saleService = new SaleService(saleRepo, pRepo);
                var retService = new ReturnService(retRepo, saleRepo);
                var reportsService = new ReportsService(tempConnStr);
                var closingService = new DailyClosingService(tempConnStr, closingRepo, counterRepo, auditRepo, settingsRepo);

                // 3. Seed Products: Product A (normal cost), Product B (zero cost to test Task 46-2), Product C (low stock)
                var prodA = new Product
                {
                    Name = "زيت عباد شمس 1 لتر",
                    Barcode = "6221000101",
                    PricePiasters = 7000,
                    CostPiasters = 5000,
                    StockQuantityMilli = 50000,
                    MinStockQuantityMilli = 10000,
                    Unit = "piece",
                    IsActive = true
                };
                prodA = prodService.SaveProduct(prodA, true, true);

                var prodB = new Product
                {
                    Name = "صنف بدون تكلفة تجريبي",
                    Barcode = "6221000102",
                    PricePiasters = 2000,
                    CostPiasters = 0, // Zero cost
                    StockQuantityMilli = 20000,
                    MinStockQuantityMilli = 5000,
                    Unit = "piece",
                    IsActive = true
                };
                prodB = prodService.SaveProduct(prodB, true, true);

                var prodC = new Product
                {
                    Name = "شاي كينيا 250 جم",
                    Barcode = "6221000103",
                    PricePiasters = 4000,
                    CostPiasters = 3000,
                    StockQuantityMilli = 3000, // Stock is 3 units, Min is 10 units -> Low stock!
                    MinStockQuantityMilli = 10000,
                    Unit = "piece",
                    IsActive = true
                };
                prodC = prodService.SaveProduct(prodC, true, true);

                // Seed Customer
                var cust = new Customer
                {
                    Name = "عميل آجل للاختبار",
                    Phone = "01012345678",
                    CreditLimitPiasters = 500000
                };
                cust = custService.SaveCustomer(cust);

                // 4. TEST TASK 45-4: 20 INVOICES MANUAL MATCHING RECONCILIATION
                long expectedCashSales = 0;
                long expectedCreditSales = 0;
                long expectedTotalSales = 0;
                long expectedGrossProfit = 0;
                List<Sale> createdSales = new List<Sale>();

                // 10 Cash Sales of Product A (1 unit each = 70.00 EGP = 7000 piasters, cost 5000, profit 2000)
                for (int i = 1; i <= 10; i++)
                {
                    var sale = new Sale
                    {
                        PaymentMethod = "cash",
                        PaidPiasters = 7000,
                        TotalPiasters = 7000,
                        SubtotalPiasters = 7000,
                        DiscountPiasters = 0,
                        TaxPiasters = 0,
                        Items = new List<SaleItem>
                        {
                            new SaleItem { ProductId = prodA.Id, ProductName = prodA.Name, QuantityMilli = 1000, UnitPricePiasters = 7000, UnitCostPiasters = 5000, TotalPiasters = 7000 }
                        }
                    };
                    var saved = saleService.ProcessSale(sale);
                    createdSales.Add(saved);
                    expectedCashSales += 7000;
                    expectedTotalSales += 7000;
                    expectedGrossProfit += 2000;
                }

                // 5 Credit Sales to Customer (1 unit of Product A each = 7000, paid 2000 cash, 5000 credit)
                for (int i = 1; i <= 5; i++)
                {
                    var sale = new Sale
                    {
                        CustomerId = cust.Id,
                        PaymentMethod = "credit",
                        PaidPiasters = 2000,
                        TotalPiasters = 7000,
                        SubtotalPiasters = 7000,
                        DiscountPiasters = 0,
                        TaxPiasters = 0,
                        Items = new List<SaleItem>
                        {
                            new SaleItem { ProductId = prodA.Id, ProductName = prodA.Name, QuantityMilli = 1000, UnitPricePiasters = 7000, UnitCostPiasters = 5000, TotalPiasters = 7000 }
                        }
                    };
                    var saved = saleService.ProcessSale(sale);
                    createdSales.Add(saved);
                    expectedCashSales += 2000;
                    expectedCreditSales += 5000;
                    expectedTotalSales += 7000;
                    expectedGrossProfit += 2000;
                }

                // 2 Sales of Product B (Zero cost item, 1 unit = 2000 cash)
                for (int i = 1; i <= 2; i++)
                {
                    var sale = new Sale
                    {
                        PaymentMethod = "cash",
                        PaidPiasters = 2000,
                        TotalPiasters = 2000,
                        SubtotalPiasters = 2000,
                        DiscountPiasters = 0,
                        TaxPiasters = 0,
                        Items = new List<SaleItem>
                        {
                            new SaleItem { ProductId = prodB.Id, ProductName = prodB.Name, QuantityMilli = 1000, UnitPricePiasters = 2000, UnitCostPiasters = 0, TotalPiasters = 2000 }
                        }
                    };
                    var saved = saleService.ProcessSale(sale);
                    createdSales.Add(saved);
                    expectedCashSales += 2000;
                    expectedTotalSales += 2000;
                    expectedGrossProfit += 2000;
                }

                // 1 Sale that will be cancelled (1 unit of Product A = 7000)
                var saleToCancel = new Sale
                {
                    PaymentMethod = "cash",
                    PaidPiasters = 7000,
                    TotalPiasters = 7000,
                    SubtotalPiasters = 7000,
                    DiscountPiasters = 0,
                    TaxPiasters = 0,
                    Items = new List<SaleItem>
                    {
                        new SaleItem { ProductId = prodA.Id, ProductName = prodA.Name, QuantityMilli = 1000, UnitPricePiasters = 7000, UnitCostPiasters = 5000, TotalPiasters = 7000 }
                    }
                };
                var savedToCancel = saleService.ProcessSale(saleToCancel);
                createdSales.Add(savedToCancel);
                // Cancel it!
                saleService.CancelSale(savedToCancel.Id, "إلغاء تجريبي لفحص التقارير");

                // 2 Sales that will have returns (1 unit of Product A = 7000 each)
                var saleRet1 = saleService.ProcessSale(new Sale
                {
                    PaymentMethod = "cash",
                    PaidPiasters = 7000,
                    TotalPiasters = 7000,
                    SubtotalPiasters = 7000,
                    Items = new List<SaleItem>
                    {
                        new SaleItem { ProductId = prodA.Id, ProductName = prodA.Name, QuantityMilli = 1000, UnitPricePiasters = 7000, UnitCostPiasters = 5000, TotalPiasters = 7000 }
                    }
                });
                createdSales.Add(saleRet1);
                expectedCashSales += 7000;
                expectedTotalSales += 7000;
                expectedGrossProfit += 2000;

                var saleRet2 = saleService.ProcessSale(new Sale
                {
                    PaymentMethod = "cash",
                    PaidPiasters = 7000,
                    TotalPiasters = 7000,
                    SubtotalPiasters = 7000,
                    Items = new List<SaleItem>
                    {
                        new SaleItem { ProductId = prodA.Id, ProductName = prodA.Name, QuantityMilli = 1000, UnitPricePiasters = 7000, UnitCostPiasters = 5000, TotalPiasters = 7000 }
                    }
                });
                createdSales.Add(saleRet2);
                expectedCashSales += 7000;
                expectedTotalSales += 7000;
                expectedGrossProfit += 2000;

                // Process return for saleRet1 (full return: 7000 piasters cash refund)
                var returnReq = new Return
                {
                    SaleId = saleRet1.Id,
                    InvoiceNumber = saleRet1.InvoiceNumber,
                    TotalPiasters = 7000,
                    RefundMethod = "cash",
                    Reason = "إرجاع صنف للاختبار",
                    Items = new List<ReturnItem>
                    {
                        new ReturnItem { ProductId = prodA.Id, ProductName = prodA.Name, QuantityMilli = 1000, UnitPricePiasters = 7000, TotalPiasters = 7000 }
                    }
                };
                retService.ProcessReturn(returnReq);

                // Add 2 DEMO sales to verify Task 137-5 (they should be EXCLUDED from reports and closing)
                using (var conn = new SQLiteConnection(tempConnStr))
                {
                    conn.Open();
                    using (var dCmd = new SQLiteCommand(@"
                        INSERT INTO sales (id, invoice_number, subtotal_piasters, discount_piasters, tax_piasters, total_piasters, paid_piasters, payment_method, status, created_at)
                        VALUES ('demo_sale_991', 99991, 50000, 0, 0, 50000, 50000, 'cash', 'completed', datetime('now')),
                               ('demo_sale_992', 99992, 30000, 0, 0, 30000, 30000, 'cash', 'completed', datetime('now'));
                    ", conn))
                    {
                        dCmd.ExecuteNonQuery();
                    }
                }

                Assert(createdSales.Count == 20, "تم إنشاء 20 فاتورة متنوعة يدوياً بنجاح (10 نقدي + 5 آجل + 2 بدون تكلفة + 1 ملغاة + 2 مرتجعات)", result);

                // Verify Task 45-4 & 45-3: Reports Matching
                var report = reportsService.GetPeriodSalesReport("today", null, null);
                Assert(report.TotalSalesPiasters == expectedTotalSales, string.Format("مبيعات اليوم مطابقة للمجموع اليدوي: {0} قرش", report.TotalSalesPiasters), result);
                Assert(report.CashSalesPiasters == expectedCashSales, string.Format("المبيعات النقدية مطابقة: {0} قرش", report.CashSalesPiasters), result);
                Assert(report.CreditSalesPiasters == expectedCreditSales, string.Format("المبيعات الآجلة مطابقة: {0} قرش", report.CreditSalesPiasters), result);
                Assert(report.ReturnsTotalPiasters == 7000, "إجمالي المرتجعات مطابق: 7000 قرش (70.00 ج.م)", result);
                Assert(report.CancelledCount == 1, "عدد الفواتير الملغاة مطابق: 1 فاتورة", result);
                Assert(report.CancelledTotalPiasters == 7000, "إجمالي الفواتير الملغاة مطابق: 7000 قرش", result);
                Assert(report.NetSalesPiasters == (expectedTotalSales - 7000), "صافي المبيعات (المبيعات - المرتجعات) مطابق تماماً", result);

                // Verify Task 137-5: Demo sales are strictly excluded
                Assert(report.TotalSalesPiasters < (expectedTotalSales + 80000), "الفواتير التجريبية (demo_sale_*) تم استبعادها بالكامل من التقارير", result);

                // Verify Task 46-3: Profit Calculation & Zero Cost Warning
                Assert(report.GrossProfitPiasters == expectedGrossProfit, string.Format("الربح التقريبي مطابق: {0} قرش (السعر - التكلفة المحفوظة)", report.GrossProfitPiasters), result);
                Assert(report.ZeroCostItemsCount == 2, "تنبيه الأصناف بدون تكلفة تم رصده بدقة (2 بند بدون تكلفة)", result);

                // Verify Task 86 / 48-1: Low Stock Report with Suggested Order Quantity
                var lowStockReport = reportsService.GetLowStockReport();
                Assert(lowStockReport.Count >= 1, "تم استخراج تقرير الأصناف الناقصة بنجاح", result);
                var teaItem = lowStockReport.Find(delegate(LowStockReportItem item) { return item.ProductId == prodC.Id; });
                Assert(teaItem != null, "الصنف شاي كينيا تم إدراجه بنجاح ضمن تقرير النواقص", result);
                if (teaItem != null)
                {
                    Assert(teaItem.SuggestedOrderMilli == (10000 * 2 - 3000), string.Format("الكمية المقترحة للطلب محسوبة بدقة: {0} وحدة", teaItem.SuggestedOrderMilli / 1000.0), result);
                    Assert(teaItem.EstimatedCostPiasters > 0, "التكلفة التقديرية للطلبية محسوبة بدقة", result);
                }

                // Verify Task 88 / 50-1: Debtors Report
                var debtorsReport = reportsService.GetDebtorsReport();
                Assert(debtorsReport.Count >= 1, "تقرير ديون العملاء المستحقة يحتوي على العملاء المدينين", result);
                Assert(debtorsReport[0].BalancePiasters == expectedCreditSales, string.Format("رصيد العميل المدين مطابق لمبيعات الآجل: {0} قرش", debtorsReport[0].BalancePiasters), result);

                // 5. TEST TASK 49: DAILY CLOSING (Z-REPORT) CYCLE & IMMUTABILITY
                string todayBusinessDate = closingService.GetCurrentBusinessDate();
                var closingPreview = closingService.GetClosingPreview(todayBusinessDate);

                Assert(closingPreview.TotalSalesPiasters == expectedTotalSales, "أرقام الإقفال: إجمالي المبيعات مطابق", result);
                Assert(closingPreview.ReturnsCashPiasters == 7000, "أرقام الإقفال: المرتجع النقدي مخصوم", result);
                long expectedDrawerCash = expectedCashSales - 7000;
                Assert(closingPreview.ExpectedCashPiasters == expectedDrawerCash, string.Format("النقد المتوقع في الدرج مطابق: {0} قرش", closingPreview.ExpectedCashPiasters), result);

                // Save Closing with actual cash 500 piasters shortage (عجز 5 جنيه)
                long actualCountedCash = expectedDrawerCash - 500;
                var savedClosing = closingService.SaveClosing(new DailyClosingSaveRequest
                {
                    BusinessDate = todayBusinessDate,
                    ActualCashPiasters = actualCountedCash,
                    CashierId = "cashier_1",
                    CashierName = "محمود سيد",
                    Notes = "إقفال اليومية الفعلي مع عجز 5 جنيه",
                    ConfirmSuspiciousDate = true
                });

                Assert(savedClosing != null && !string.IsNullOrEmpty(savedClosing.Id), "تم حفظ إقفال اليومية بنجاح", result);
                Assert(savedClosing.ClosingNumber > 0, string.Format("تم توليد رقم إقفال متسلسل #{0}", savedClosing.ClosingNumber), result);
                Assert(savedClosing.DifferencePiasters == -500, "تم حساب فرق النقدية (عجز 500 قرش) بدقة", result);
                Assert(savedClosing.IsSealed == true, "سجل الإقفال مختوم ومقفل", result);

                // Verify Task 49-4: Immutability enforcement (Cannot update or delete)
                bool updateBlocked = false;
                try
                {
                    using (var conn = new SQLiteConnection(tempConnStr))
                    {
                        conn.Open();
                        using (var cmd = new SQLiteCommand("UPDATE daily_closings SET notes = 'tampered' WHERE id = @id;", conn))
                        {
                            cmd.Parameters.AddWithValue("@id", savedClosing.Id);
                            cmd.ExecuteNonQuery();
                        }
                    }
                }
                catch (Exception ex)
                {
                    updateBlocked = true;
                    Assert(ex.Message.Contains("لا يمكن تعديل") || ex.Message.Contains("ABORT"), "منع تعديل سجل الإقفال بعد الحفظ عبر SQLite Trigger بنجاح", result);
                }
                Assert(updateBlocked, "تم التأكد من منع التعديل المادي على سجل قفل اليومية (Immutability Guaranteed)", result);

                bool deleteBlocked = false;
                try
                {
                    using (var conn = new SQLiteConnection(tempConnStr))
                    {
                        conn.Open();
                        using (var cmd = new SQLiteCommand("DELETE FROM daily_closings WHERE id = @id;", conn))
                        {
                            cmd.Parameters.AddWithValue("@id", savedClosing.Id);
                            cmd.ExecuteNonQuery();
                        }
                    }
                }
                catch (Exception ex)
                {
                    deleteBlocked = true;
                    Assert(ex.Message.Contains("لا يمكن حذف") || ex.Message.Contains("ABORT"), "منع حذف سجل الإقفال عبر SQLite Trigger بنجاح", result);
                }
                Assert(deleteBlocked, "تم التأكد من منع حذف سجل قفل اليومية (No Hard Deletes)", result);

                // Verify duplicate closing is blocked
                bool dupBlocked = false;
                try
                {
                    closingService.SaveClosing(new DailyClosingSaveRequest
                    {
                        BusinessDate = todayBusinessDate,
                        ActualCashPiasters = actualCountedCash,
                        CashierId = "cashier_1"
                    });
                }
                catch
                {
                    dupBlocked = true;
                }
                Assert(dupBlocked, "منع تكرار إقفال نفس يوم العمل بنجاح", result);

                // 11. Test Analytics Queries (Senior Level Verification)
                var periodSales = reportsService.GetPeriodSalesReport("today", null, null);
                Assert(periodSales != null, "استعلام تقرير مبيعات اليومية يعمل بنجاح بدون أخطاء", result);

                var invLoss = reportsService.GetInventoryLossReport("today", null, null);
                Assert(invLoss != null, "استعلام خسائر وعجز المخزون يعمل بنجاح بدون أخطاء", result);

                var closingsHistory = reportsService.GetClosingHistory("month", null, null);
                Assert(closingsHistory != null, "استعلام سجل إقفالات اليوميات السابقة يعمل بنجاح", result);

                var catPerf = reportsService.GetCategoryPerformance("month", null, null);
                Assert(catPerf != null, "استعلام تصنيف أداء الفئات والأقسام يعمل بنجاح", result);

                var itemProf = reportsService.GetItemProfitability("month", 10, "desc");
                Assert(itemProf != null, "استعلام هوامش ربحية الأصناف يعمل بنجاح", result);

                var periodComp = reportsService.GetPeriodComparison("week");
                Assert(periodComp != null, "استعلام مقارنة الأداء بين الفترات يعمل بنجاح", result);

                var invOverview = reportsService.GetInventoryOverview();
                Assert(invOverview != null, "استعلام القيمة التقديرية للمخزون يعمل بنجاح", result);

                var shrinkage = reportsService.GetShrinkageAnalysis("month", null, null);
                Assert(shrinkage != null, "استعلام تفكيك أسباب الهوالك والعجز يعمل بنجاح", result);

                var purAnalysis = reportsService.GetPurchaseAnalysis("month", null, null);
                Assert(purAnalysis != null, "استعلام تحليل المشتريات والموردين يعمل بنجاح", result);

                var creditOverview = reportsService.GetCreditOverview("month", null, null);
                Assert(creditOverview != null, "استعلام أرصدة الذمم والتدفق الائتماني يعمل بنجاح", result);

                var debtAging = reportsService.GetDebtAgingReport();
                Assert(debtAging != null && debtAging.Tiers.Count == 4, "استعلام شرائح أعمار الديون (4 شرائح) يعمل بنجاح وبدقة", result);

                var custBehavior = reportsService.GetCustomerBehavior("month", null, null);
                Assert(custBehavior != null, "استعلام سلوكيات وأفضل الزبائن يعمل بنجاح", result);

                var payHistory = reportsService.GetPaymentHistory("month", null, null, null);
                Assert(payHistory != null, "استعلام سجل تحصيلات وسدادات العملاء يعمل بنجاح", result);

                result.Message = string.Format("نجحت جميع اختبارات المحطة 9 والتحليلات التنفيذية بنسبة 100% ({0}/{1} تأكيد ناجح)", result.PassedAssertions, result.TotalAssertions);
            }
            catch (Exception ex)
            {
                result.Success = false;
                result.Message = "فشل في اختبارات المحطة 9: " + ex.Message;
                result.Details.Add("خطأ: " + ex.ToString());
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
                    // Ignore temp db file cleanup
                }
            }

            return result;
        }

        private static void Assert(bool condition, string message, ReportsAndClosingTestResult result)
        {
            result.TotalAssertions++;
            if (condition)
            {
                result.PassedAssertions++;
                result.Details.Add("✓ " + message);
            }
            else
            {
                result.Success = false;
                result.Details.Add("✗ فشل: " + message);
                throw new Exception("فشل تأكيد الاختبار: " + message);
            }
        }
    }
}
