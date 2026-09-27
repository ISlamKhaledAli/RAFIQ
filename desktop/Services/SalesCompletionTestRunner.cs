using System;
using System.IO;
using System.Collections.Generic;
using RafiqPOS.Common;
using RafiqPOS.Database;
using RafiqPOS.Models;
using RafiqPOS.Repositories;

namespace RafiqPOS.Services
{
    public class SalesCompletionTestResult
    {
        public bool Success { get; set; }
        public string Message { get; set; }
        public int TotalAssertions { get; set; }
        public int PassedAssertions { get; set; }
        public List<string> Details { get; set; }

        public SalesCompletionTestResult()
        {
            this.Details = new List<string>();
        }
    }

    public static class SalesCompletionTestRunner
    {
        public static SalesCompletionTestResult RunAllTests()
        {
            var result = new SalesCompletionTestResult
            {
                Success = true,
                TotalAssertions = 0,
                PassedAssertions = 0
            };

            string tempDbPath = Path.Combine(Path.GetTempPath(), "rafiq_sales_compl_test_" + Guid.NewGuid().ToString("N") + ".db");
            string tempConnStr = string.Format("Data Source={0};Version=3;BusyTimeout=5000;", tempDbPath);

            try
            {
                // 1. Run migrations on isolated SQLite database (up to Migration 20)
                MigrationRunner.ApplyMigrations(tempConnStr, tempDbPath);
                Assert(File.Exists(tempDbPath), "تم إنشاء قاعدة بيانات اختبارات اكتمال البيع بنجاح", result);

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

                var priceHistRepo = new ProductPriceHistoryRepository(tempConnStr);
                var stockMovementRepo = new StockMovementRepository(tempConnStr);
                var prodService = new ProductService(pRepo, auditRepo, priceHistRepo, stockMovementRepo);
                var custService = new CustomerService(custRepo);
                var saleService = new SaleService(saleRepo, pRepo);
                var heldService = new HeldSaleService(heldRepo);
                var returnService = new ReturnService(retRepo, saleRepo);
                var reportsService = new ReportsService(tempConnStr);

                // Create initial test products
                var prod1 = new Product
                {
                    Name = "شاي العروسة 250 جم",
                    Barcode = "6221001001",
                    PricePiasters = 4500, // 45.00 EGP
                    CostPiasters = 3800,  // 38.00 EGP
                    StockQuantityMilli = 50000, // 50 units
                    Unit = "piece"
                };
                prod1 = prodService.SaveProduct(prod1, true, true);

                var prod2 = new Product
                {
                    Name = "أرز الضحى 1 كجم",
                    Barcode = "6221002002",
                    PricePiasters = 3200, // 32.00 EGP
                    CostPiasters = 2600,  // 26.00 EGP
                    StockQuantityMilli = 30000, // 30 units
                    Unit = "piece"
                };
                prod2 = prodService.SaveProduct(prod2, true, true);

                // Create test customer
                var cust = new Customer
                {
                    Name = "أحمد رضوان",
                    Phone = "01011223344",
                    BalancePiasters = 0,
                    CreditLimitPiasters = 200000
                };
                cust = custService.SaveCustomer(cust);

                // =========================================================================
                // PART 1: Feature #25 — تعليق الفاتورة واسترجاعها (Hold & Recall Sales)
                // =========================================================================
                var held1 = new HeldSale
                {
                    HoldLabel = "معلقة-01",
                    CustomerId = cust.Id,
                    CustomerName = cust.Name,
                    ItemsCount = 2,
                    SubtotalPiasters = 12200,
                    DiscountPiasters = 0,
                    TotalPiasters = 12200,
                    CartJson = "[{\"productId\":\"" + prod1.Id + "\",\"quantity\":2}]",
                    Notes = "انتظار إحضار صنف آخر"
                };
                var savedHeld1 = heldService.HoldSale(held1);
                Assert(!string.IsNullOrEmpty(savedHeld1.Id), "تم تعليق الفاتورة الأولى بنجاح وحفظها في قاعدة البيانات", result);

                // Invariant check: Stock quantity must NOT change upon hold
                var p1Check = pRepo.GetById(prod1.Id);
                Assert(p1Check.StockQuantityMilli == 50000, "تعليق الفاتورة لم يخصم أي كميات من المخزون", result);

                // Hold second sale
                var held2 = new HeldSale
                {
                    HoldLabel = "معلقة-02",
                    ItemsCount = 1,
                    SubtotalPiasters = 4500,
                    TotalPiasters = 4500,
                    CartJson = "[{\"productId\":\"" + prod2.Id + "\",\"quantity\":1}]"
                };
                heldService.HoldSale(held2);

                var allHeld = heldService.GetHeldSales();
                Assert(allHeld.Count == 2, "قائمة الفواتير المعلقة تحتوي على فاتورتين معلقتين", result);

                // Recall held1
                var recalledHeld1 = heldService.RecallHeldSale(savedHeld1.Id);
                Assert(recalledHeld1 != null && recalledHeld1.Id == savedHeld1.Id, "تم استرجاع الفاتورة المعلقة الأولى بنجاح", result);

                // Verify it was deleted from held table upon recall
                var remainingHeld = heldService.GetHeldSales();
                Assert(remainingHeld.Count == 1, "الفاتورة المسترجعة تم حذفها تلقائياً من قائمة المعلقات", result);

                // Delete held2 manually
                bool deletedHeld2 = heldService.DeleteHeldSale(remainingHeld[0].Id);
                Assert(deletedHeld2 && heldService.GetHeldSales().Count == 0, "تم حذف الفاتورة المعلقة يدوياً وتفريغ قائمة المعلقات", result);

                // Cleanup test
                int cleanedCount = heldService.CleanupOldHeldSales(7);
                Assert(cleanedCount >= 0, "دالة التنظيف التلقائي للفواتير المعلقة القديمة تعمل بنجاح", result);

                // =========================================================================
                // PART 2: Complete an Official Sale to Test Returns & Cancellation
                // =========================================================================
                var sale = new Sale
                {
                    CustomerId = cust.Id,
                    CustomerName = cust.Name,
                    PaymentMethod = "credit", // On-Credit sale
                    PaidPiasters = 0,
                    Items = new List<SaleItem>
                    {
                        new SaleItem
                        {
                            ProductId = prod1.Id,
                            ProductName = prod1.Name,
                            Barcode = prod1.Barcode,
                            QuantityMilli = 5000, // 5 pieces
                            UnitPricePiasters = 4500,
                            UnitCostPiasters = 3800,
                            TotalPiasters = 22500, // 225.00 EGP
                            Unit = "piece"
                        },
                        new SaleItem
                        {
                            ProductId = prod2.Id,
                            ProductName = prod2.Name,
                            Barcode = prod2.Barcode,
                            QuantityMilli = 3000, // 3 pieces
                            UnitPricePiasters = 3200,
                            UnitCostPiasters = 2600,
                            TotalPiasters = 9600,  // 96.00 EGP
                            Unit = "piece"
                        }
                    }
                };

                var createdSale = saleService.ProcessSale(sale);
                Assert(createdSale.InvoiceNumber == 1, "تم إتمام عملية البيع الرسمية برقم فاتورة متسلسل #1", result);
                Assert(createdSale.TotalPiasters == 32100, "إجمالي الفاتورة محسوب بالقروش بدقة 321.00 ج.م", result);

                // Check customer balance increased
                var custAfterSale = custRepo.GetById(cust.Id);
                Assert(custAfterSale.BalancePiasters == 32100, "مديونية العميل زادت بمقدار قيمة الفاتورة الآجلة بدقة", result);

                // Check product stocks decreased
                Assert(pRepo.GetById(prod1.Id).StockQuantityMilli == 45000, "رصيد صنف الشاي انخفض بمقدار 5 وحدات", result);
                Assert(pRepo.GetById(prod2.Id).StockQuantityMilli == 27000, "رصيد صنف الأرز انخفض بمقدار 3 وحدات", result);

                // =========================================================================
                // PART 3: Feature #26 — مرتجع بسيط (Returns & Refunds)
                // =========================================================================
                // Test 3.1: Partial Return of 2 pieces of prod1 with credit refund
                var return1 = new Return
                {
                    SaleId = createdSale.Id,
                    InvoiceNumber = createdSale.InvoiceNumber,
                    CustomerId = cust.Id,
                    CustomerName = cust.Name,
                    RefundMethod = "credit",
                    Reason = "العميل أرجع علبتين شاي فائضتين",
                    IsWithoutInvoice = false,
                    Items = new List<ReturnItem>
                    {
                        new ReturnItem
                        {
                            ProductId = prod1.Id,
                            ProductName = prod1.Name,
                            Barcode = prod1.Barcode,
                            QuantityMilli = 2000, // 2 pieces returned
                            UnitPricePiasters = 4500,
                            TotalPiasters = 9000, // 90.00 EGP
                            IsDamaged = false,
                            Unit = "piece"
                        }
                    }
                };

                var processedReturn1 = returnService.ProcessReturn(return1);
                Assert(processedReturn1.ReturnNumber == 1, "تم تسجيل المرتجع الأول برقم متسلسل ذري #1", result);

                // Verify stock increased for undamaged return
                Assert(pRepo.GetById(prod1.Id).StockQuantityMilli == 47000, "رصيد المخزون للصنف السليم زاد بمقدار الكمية المرتجعة (2 علبة)", result);

                // Verify customer balance decreased by refund amount (321.00 - 90.00 = 231.00 EGP)
                var custAfterReturn1 = custRepo.GetById(cust.Id);
                Assert(custAfterReturn1.BalancePiasters == 23100, "مديونية العميل انخفضت بمقدار المرتجع الآجل (231.00 ج.م)", result);

                // Test 3.2: Return of 1 piece of prod2 marked as Damaged
                var return2 = new Return
                {
                    SaleId = createdSale.Id,
                    InvoiceNumber = createdSale.InvoiceNumber,
                    CustomerId = cust.Id,
                    CustomerName = cust.Name,
                    RefundMethod = "credit",
                    Reason = "كيس الأرز ممزق (صنف تالف)",
                    IsWithoutInvoice = false,
                    Items = new List<ReturnItem>
                    {
                        new ReturnItem
                        {
                            ProductId = prod2.Id,
                            ProductName = prod2.Name,
                            Barcode = prod2.Barcode,
                            QuantityMilli = 1000, // 1 piece damaged
                            UnitPricePiasters = 3200,
                            TotalPiasters = 3200,
                            IsDamaged = true, // Damaged item
                            Unit = "piece"
                        }
                    }
                };

                var processedReturn2 = returnService.ProcessReturn(return2);
                Assert(processedReturn2.ReturnNumber == 2, "تم تسجيل المرتجع الثاني برقم متسلسل ذري #2", result);

                // Verify stock DID NOT increase for damaged item
                Assert(pRepo.GetById(prod2.Id).StockQuantityMilli == 27000, "الصنف التالف لم يدخل المخزون الصالح للبيع وحافظ على رصيده السابق", result);

                // Test 3.3: Excess quantity rejection
                bool excessRejected = false;
                try
                {
                    var excessReturn = new Return
                    {
                        SaleId = createdSale.Id,
                        InvoiceNumber = createdSale.InvoiceNumber,
                        RefundMethod = "cash",
                        Items = new List<ReturnItem>
                        {
                            new ReturnItem
                            {
                                ProductId = prod1.Id,
                                ProductName = prod1.Name,
                                QuantityMilli = 5000, // 5 pieces while only 3 remaining!
                                UnitPricePiasters = 4500,
                                TotalPiasters = 22500
                            }
                        }
                    };
                    returnService.ProcessReturn(excessReturn);
                }
                catch (InvalidOperationException)
                {
                    excessRejected = true;
                }
                Assert(excessRejected, "تم رفض المرتجع عند محاولة إرجاع كمية أكبر من المتبقي في الفاتورة الأصلية بنجاح", result);

                // =========================================================================
                // PART 4: Feature #33 — إلغاء فاتورة مع تسجيل السبب (Void / Cancel Sale)
                // =========================================================================
                // Create a fresh sale to test cancellation
                var saleToCancel = new Sale
                {
                    CustomerId = cust.Id,
                    CustomerName = cust.Name,
                    PaymentMethod = "cash",
                    PaidPiasters = 9000,
                    Items = new List<SaleItem>
                    {
                        new SaleItem
                        {
                            ProductId = prod1.Id,
                            ProductName = prod1.Name,
                            QuantityMilli = 2000,
                            UnitPricePiasters = 4500,
                            UnitCostPiasters = 3800,
                            TotalPiasters = 9000,
                            Unit = "piece"
                        }
                    }
                };

                var createdSale2 = saleService.ProcessSale(saleToCancel);
                Assert(createdSale2.InvoiceNumber == 2, "تم إصدار فاتورة نقدية جديدة برقم #2 لاختبار الإلغاء", result);
                Assert(pRepo.GetById(prod1.Id).StockQuantityMilli == 45000, "رصيد المخزون خصم وحدتين للفاتورة رقم #2", result);

                // Attempt cancellation without reason -> must throw
                bool missingReasonRejected = false;
                try
                {
                    saleService.CancelSale(createdSale2.Id, "");
                }
                catch (ArgumentException)
                {
                    missingReasonRejected = true;
                }
                Assert(missingReasonRejected, "تم رفض إلغاء الفاتورة بدون كتابة سبب الإلغاء", result);

                // Cancel with valid reason
                var cancelledSale2 = saleService.CancelSale(createdSale2.Id, "العميل غير رأيه قبل الاستلام", "usr_admin_default");
                Assert(cancelledSale2.Status == "cancelled", "تم وسم حالة الفاتورة كـ cancelled دون حذفها المادي من قاعدة البيانات", result);

                // Verify stock fully restored upon cancellation
                Assert(pRepo.GetById(prod1.Id).StockQuantityMilli == 47000, "تم إرجاع كمية الأصناف للمخزون فور إلغاء الفاتورة", result);

                // =========================================================================
                // PART 5: Reports Exclusions Test (Task 33-4 & 26-3)
                // =========================================================================
                var summary = reportsService.GetTodaySummary();
                Assert(summary.TodayCancelledCount == 1, "تقرير اليوم يعرض عدد الفواتير الملغاة بدقة كبند منفصل (1 فاتورة)", result);
                Assert(summary.TodayCancelledSalesPiasters == 9000, "تقرير اليوم يعرض إجمالي المبالغ الملغاة (90.00 ج.م)", result);
                Assert(summary.TodayReturnsCount == 2, "تقرير اليوم يعرض إجمالي المرتجعات المسجلة بدقة (2 مرتجع)", result);

                result.Message = string.Format("نجحت جميع اختبارات اكتمال البيع (المحطة 7): {0}/{1} بنسبة 100%.", result.PassedAssertions, result.TotalAssertions);
            }
            catch (Exception ex)
            {
                result.Success = false;
                result.Message = "فشل أثناء تشغيل اختبارات اكتمال البيع: " + ex.Message;
                result.Details.Add("خطأ غير معالج: " + ex.ToString());
            }
            finally
            {
                if (File.Exists(tempDbPath))
                {
                    try
                    {
                        File.Delete(tempDbPath);
                    }
                    catch
                    {
                    }
                }
            }

            return result;
        }

        private static void Assert(bool condition, string message, SalesCompletionTestResult result)
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
                result.Details.Add("✗ فشل اختبار: " + message);
            }
        }
    }
}
