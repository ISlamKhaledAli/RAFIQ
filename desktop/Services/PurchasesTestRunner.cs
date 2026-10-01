using System;
using System.Collections.Generic;
using System.IO;
using RafiqPOS.Models;

namespace RafiqPOS.Services
{
    public class PurchasesTestResult
    {
        public bool Success { get; set; }
        public string Message { get; set; }
        public int TotalAssertions { get; set; }
        public int PassedAssertions { get; set; }
    }

    public static class PurchasesTestRunner
    {
        public static PurchasesTestResult RunAllTests()
        {
            int total = 0;
            int passed = 0;

            Action<bool, string> assert = (condition, description) =>
            {
                total++;
                if (condition)
                {
                    passed++;
                }
                else
                {
                    throw new Exception("Assertion failed: " + description);
                }
            };

            // Use an isolated in-memory or dedicated test database
            string testDir = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "test_purchases_data");
            if (Directory.Exists(testDir))
            {
                try { Directory.Delete(testDir, true); } catch { }
            }
            Directory.CreateDirectory(testDir);

            try
            {
                DatabaseService.Initialize(testDir);

                // Setup test products
                var prod1 = DatabaseService.Products.SaveProduct(new Product
                {
                    Name = "زيت عباد الشمس 1 لتر - اختبار مشتريات",
                    Barcode = "9900112233",
                    PricePiasters = 5500, // 55.00 EGP
                    CostPiasters = 4000,  // 40.00 EGP
                    StockQuantityMilli = 10000, // 10 units
                    MinStockQuantityMilli = 5000,
                    Unit = "piece",
                    TaxRatePercent = 0,
                    IsActive = true
                });

                var prod2 = DatabaseService.Products.SaveProduct(new Product
                {
                    Name = "سكر أبيض ناعم 1 كجم - اختبار مشتريات",
                    Barcode = "9900112244",
                    PricePiasters = 3500, // 35.00 EGP
                    CostPiasters = 2500,  // 25.00 EGP
                    StockQuantityMilli = 20000, // 20 units
                    MinStockQuantityMilli = 5000,
                    Unit = "piece",
                    TaxRatePercent = 0,
                    IsActive = true
                });

                // ==========================================
                // 1. Supplier CRUD & Archiving Tests (Story 82 / Feature #39)
                // ==========================================
                var sup1 = DatabaseService.Suppliers.Save(new Supplier
                {
                    Name = "شركة النيل للتوزيع",
                    Phone = "01011223344",
                    CompanyName = "النيل للمواد الغذائية",
                    Address = "القاهرة - مصر",
                    BalancePiasters = 0,
                    Notes = "مورد رئيسي لزيوت الطعام"
                });

                assert(sup1 != null && !string.IsNullOrEmpty(sup1.Id), "إضافة مورد جديد بنجاح");
                assert(sup1.IsActive == true, "المورد الجديد نشط افتراضياً");

                // Update supplier
                sup1.Phone = "01099887766";
                var updatedSup = DatabaseService.Suppliers.Save(sup1);
                assert(updatedSup.Phone == "01099887766", "تحديث بيانات المورد بنجاح");

                // Archive supplier
                bool archOk = DatabaseService.Suppliers.Archive(sup1.Id);
                assert(archOk, "أرشفة المورد بنجاح");

                var activeList = DatabaseService.Suppliers.GetAll(false);
                var allList = DatabaseService.Suppliers.GetAll(true);
                assert(!activeList.Exists(s => s.Id == sup1.Id), "المورد المؤرشف لا يظهر في القائمة النشطة");
                assert(allList.Exists(s => s.Id == sup1.Id), "المورد المؤرشف يظهر عند طلب الكل");

                // Restore supplier
                bool restOk = DatabaseService.Suppliers.Restore(sup1.Id);
                assert(restOk, "استرجاع المورد المؤرشف بنجاح");
                var activeListAfterRestore = DatabaseService.Suppliers.GetAll(false);
                assert(activeListAfterRestore.Exists(s => s.Id == sup1.Id), "المورد المسترجع عاد للقائمة النشطة");

                // Supplier Opening Balance test
                var sup2 = DatabaseService.Suppliers.Save(new Supplier
                {
                    Name = "مطاحن الأمل",
                    BalancePiasters = 150000 // We owe 1500.00 EGP
                });
                assert(sup2.BalancePiasters == 150000, "تسجيل رصيد افتتاحي للمورد بنجاح");
                var sup2Tx = DatabaseService.Suppliers.GetTransactions(sup2.Id);
                assert(sup2Tx.Count == 1 && sup2Tx[0].TransactionType == "OPENING_BALANCE", "تسجيل حركة رصيد افتتاحي في دفتر المورد");

                // Supplier Payment test
                DatabaseService.Suppliers.RecordPayment(sup2.Id, 50000, "سداد دفعة نقدية"); // Paid 500.00 EGP
                var sup2AfterPay = DatabaseService.Suppliers.GetById(sup2.Id);
                assert(sup2AfterPay.BalancePiasters == 100000, "سداد دفعة يخفض رصيد المورد بدقة");

                // ==========================================
                // 2. Purchase Invoice Tests (Story 81 / Feature #38)
                // ==========================================

                // Test A: Cash Purchase (Paid in full, Latest Cost)
                long prevStock1 = prod1.StockQuantityMilli; // 10,000
                var cashPurchase = DatabaseService.Purchases.CreatePurchase(new Purchase
                {
                    SupplierId = sup1.Id,
                    SupplierInvoiceNumber = "INV-7001",
                    DiscountPiasters = 0,
                    PaidAmountPiasters = 210000, // 2100.00 EGP
                    Items = new List<PurchaseItem>
                    {
                        new PurchaseItem
                        {
                            ProductId = prod1.Id,
                            QuantityMilli = 50000, // 50 units
                            UnitCostPiasters = 4200 // 42.00 EGP
                        }
                    }
                }, "LATEST");

                assert(cashPurchase != null, "إنشاء فاتورة شراء نقدية بنجاح");
                assert(cashPurchase.InvoiceNumber > 0, "توليد رقم تسلسلي لفاتورة الشراء");
                assert(cashPurchase.PaymentStatus == "PAID", "حالة دفع الفاتورة النقدية بالكامل PAID");
                assert(cashPurchase.RemainingAmountPiasters == 0, "المتبقي على الفاتورة النقدية صفر");
                assert(cashPurchase.NetCostPiasters == 210000, "إجمالي تكلفة الفاتورة سليم (50 * 4200 = 210,000 قرش)");

                // Verify stock increased
                var prod1AfterCash = DatabaseService.Products.GetById(prod1.Id);
                assert(prod1AfterCash.StockQuantityMilli == prevStock1 + 50000, "زيادة مخزون الصنف بعد الشراء بنجاح (10 + 50 = 60 وحدة)");
                assert(prod1AfterCash.CostPiasters == 4200, "تحديث تكلفة الصنف لآخر سعر شراء بنجاح (4200 قرش)");

                // Test B: Credit Purchase (Unpaid, Weighted Average Cost)
                // prod2 initial: stock = 20,000 milli (20 units), cost = 2500 piasters
                // Incoming: qty = 30,000 milli (30 units), cost = 3000 piasters
                // Expected Weighted Average Cost = (20 * 2500 + 30 * 3000) / 50 = (50000 + 90000) / 50 = 140000 / 50 = 2800 piasters!
                long sup1BalanceBefore = DatabaseService.Suppliers.GetById(sup1.Id).BalancePiasters;

                var creditPurchase = DatabaseService.Purchases.CreatePurchase(new Purchase
                {
                    SupplierId = sup1.Id,
                    SupplierInvoiceNumber = "INV-7002",
                    DiscountPiasters = 0,
                    PaidAmountPiasters = 0, // Unpaid
                    Items = new List<PurchaseItem>
                    {
                        new PurchaseItem
                        {
                            ProductId = prod2.Id,
                            QuantityMilli = 30000, // 30 units
                            UnitCostPiasters = 3000, // 30.00 EGP
                            NewSellingPricePiasters = 4000 // Update selling price to 40.00 EGP
                        }
                    }
                }, "WEIGHTED_AVERAGE");

                assert(creditPurchase.PaymentStatus == "CREDIT", "حالة الفاتورة الآجلة CREDIT");
                assert(creditPurchase.RemainingAmountPiasters == 90000, "المتبقي للفاتورة الآجلة سليم (30 * 3000 = 90,000 قرش)");

                // Verify Weighted Cost and Selling Price on prod2
                var prod2AfterCredit = DatabaseService.Products.GetById(prod2.Id);
                assert(prod2AfterCredit.StockQuantityMilli == 50000, "زيادة مخزون الصنف الثاني 50 وحدة");
                assert(prod2AfterCredit.CostPiasters == 2800, "حساب متوسط التكلفة المرجح بدقة رياضية (2800 قرش)");
                assert(prod2AfterCredit.PricePiasters == 4000, "تحديث سعر البيع المقترح للصنف عند الشراء بنجاح (4000 قرش)");

                // Verify Supplier Balance increased by remaining
                var sup1BalanceAfter = DatabaseService.Suppliers.GetById(sup1.Id).BalancePiasters;
                assert(sup1BalanceAfter == sup1BalanceBefore + 90000, "زيادة رصيد مديونية المورد بقيمة الفاتورة الآجلة (90,000 قرش)");

                // Test C: Prevent hard deleting supplier when purchases exist
                bool threwOnDelete = false;
                try
                {
                    DatabaseService.Suppliers.Delete(sup1.Id);
                }
                catch (InvalidOperationException)
                {
                    threwOnDelete = true;
                }
                assert(threwOnDelete, "منع الحذف الفيزيائي للمورد المرتبط بفواتير شراء لحماية السجلات");

                // Test D: Validation protections (zero items, negative quantity, negative cost)
                bool threwEmptyItems = false;
                try
                {
                    DatabaseService.Purchases.CreatePurchase(new Purchase
                    {
                        SupplierId = sup1.Id,
                        Items = new List<PurchaseItem>()
                    });
                }
                catch (ArgumentException)
                {
                    threwEmptyItems = true;
                }
                assert(threwEmptyItems, "رفض إنشاء فاتورة شراء بدون بنود");

                bool threwNegativeQty = false;
                try
                {
                    DatabaseService.Purchases.CreatePurchase(new Purchase
                    {
                        SupplierId = sup1.Id,
                        Items = new List<PurchaseItem>
                        {
                            new PurchaseItem
                            {
                                ProductId = prod1.Id,
                                QuantityMilli = -5000,
                                UnitCostPiasters = 1000
                            }
                        }
                    });
                }
                catch (ArgumentException)
                {
                    threwNegativeQty = true;
                }
                assert(threwNegativeQty, "رفض كمية شراء سالبة");

                return new PurchasesTestResult
                {
                    Success = true,
                    Message = string.Format("نجحت جميع اختبارات الموردين وفواتير الشراء والتكلفة والمخزون ({0}/{1} تأكيد سليم)", passed, total),
                    TotalAssertions = total,
                    PassedAssertions = passed
                };
            }
            finally
            {
                // Re-initialize default database for application runtime
                try
                {
                    DatabaseService.Initialize();
                }
                catch { }

                try
                {
                    if (Directory.Exists(testDir))
                    {
                        Directory.Delete(testDir, true);
                    }
                }
                catch { }
            }
        }
    }
}
