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

                // Supplier Payment test (Scenario 2: سندات الصرف للموردين وتحديث كشف الحساب والقيد المعاكس)
                DatabaseService.Suppliers.RecordPayment(sup2.Id, 50000, "سداد دفعة نقدية", null, "external_cash"); // Paid 500.00 EGP
                var sup2AfterPay = DatabaseService.Suppliers.GetById(sup2.Id);
                assert(sup2AfterPay.BalancePiasters == 100000, "سداد دفعة يخفض رصيد المورد بدقة");

                var sup2Txs = DatabaseService.Suppliers.GetTransactions(sup2.Id);
                assert(sup2Txs.Count >= 2 && sup2Txs[0].BalanceAfterPiasters == 100000, "تحديث الرصيد التراكمي balance_after_piasters في كشف حساب المورد بدقة");

                // Test contra-entry payment cancellation (Rule 2: Zero hard deletes, reversal via contra-entry)
                string payTxId = sup2Txs[0].Id;
                DatabaseService.Suppliers.CancelPayment(sup2.Id, payTxId, "إلغاء السند لوجود خطأ محاسبي");
                var sup2AfterCancel = DatabaseService.Suppliers.GetById(sup2.Id);
                assert(sup2AfterCancel.BalancePiasters == 150000, "إلغاء سند الصرف بقيد عكسي يستعيد رصيد مديونية المورد بالكامل");

                var sup2TxsAfterCancel = DatabaseService.Suppliers.GetTransactions(sup2.Id);
                assert(sup2TxsAfterCancel[0].TransactionType == "PAYMENT_CANCEL", "توثيق حركة القيد العكسي PAYMENT_CANCEL في كشف حساب المورد");
                assert(sup2TxsAfterCancel[0].BalanceAfterPiasters == 150000, "رصيد كشف الحساب بعد القيد العكسي سليم 100%");

                // Re-apply payment to maintain clean state
                DatabaseService.Suppliers.RecordPayment(sup2.Id, 50000, "إعادة سداد الدفعة بعد التصحيح", null, "external_cash");

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

                // ==========================================
                // 3. Scenario 1: ACID Atomic Transaction Rollback Test
                // ==========================================
                long prod1StockBeforeFail = DatabaseService.Products.GetById(prod1.Id).StockQuantityMilli;
                long sup1BalanceBeforeFail = DatabaseService.Suppliers.GetById(sup1.Id).BalancePiasters;
                bool threwAtomic = false;
                try
                {
                    DatabaseService.Purchases.CreatePurchase(new Purchase
                    {
                        SupplierId = sup1.Id,
                        PaidAmountPiasters = 0,
                        Items = new List<PurchaseItem>
                        {
                            new PurchaseItem
                            {
                                ProductId = prod1.Id,
                                QuantityMilli = 10000,
                                UnitCostPiasters = 4000
                            },
                            new PurchaseItem
                            {
                                ProductId = "invalid_non_existent_product_id",
                                QuantityMilli = 5000,
                                UnitCostPiasters = 2000
                            }
                        }
                    });
                }
                catch (Exception)
                {
                    threwAtomic = true;
                }
                assert(threwAtomic, "رفض العملية الذرية عند وجود صنف خاطئ داخل الفاتورة");
                var prod1StockAfterFail = DatabaseService.Products.GetById(prod1.Id).StockQuantityMilli;
                var sup1BalanceAfterFail = DatabaseService.Suppliers.GetById(sup1.Id).BalancePiasters;
                assert(prod1StockAfterFail == prod1StockBeforeFail, "ضمان ACID: تراجع المخزون بالكامل وعدم تعديل أي صنف عند فشل الفاتورة");
                assert(sup1BalanceAfterFail == sup1BalanceBeforeFail, "ضمان ACID: تراجع رصيد المورد بالكامل عند فشل الفاتورة");

                // ==========================================
                // 4. Scenario 3: Supplier Bonuses & Discounts Real Effective Cost
                // ==========================================
                var prod3 = DatabaseService.Products.SaveProduct(new Product
                {
                    Name = "شاي أسود ناعم 250 جم - اختبار بونص وخصم",
                    Barcode = "9900112255",
                    PricePiasters = 12000,
                    CostPiasters = 0,
                    StockQuantityMilli = 0,
                    MinStockQuantityMilli = 1000,
                    Unit = "piece",
                    IsActive = true
                });

                // Buy 10 units @ 100 EGP (10,000 piasters) = 1,000 EGP gross
                // Bonus = 2 units (2,000 milli) free
                // Line discount = 100 EGP (10,000 piasters)
                // Invoice discount = 100 EGP (10,000 piasters)
                // Net cost paid = 1,000 - 100 - 100 = 800 EGP (80,000 piasters)
                // Total units received = 10 + 2 = 12 units (12,000 milli)
                // Real Effective Unit Cost = (80,000 * 1000) / 12,000 = 6,667 piasters (66.67 EGP)
                long sup1BalBeforeBonus = DatabaseService.Suppliers.GetById(sup1.Id).BalancePiasters;
                var bonusPurchase = DatabaseService.Purchases.CreatePurchase(new Purchase
                {
                    SupplierId = sup1.Id,
                    SupplierInvoiceNumber = "INV-BONUS-01",
                    DiscountPiasters = 10000, // 100.00 EGP overall invoice discount
                    PaidAmountPiasters = 0,    // On credit
                    Items = new List<PurchaseItem>
                    {
                        new PurchaseItem
                        {
                            ProductId = prod3.Id,
                            QuantityMilli = 10000,
                            BonusQuantityMilli = 2000,
                            UnitCostPiasters = 10000,
                            DiscountPiasters = 10000 // 100.00 EGP line discount
                        }
                    }
                }, "LATEST");

                assert(bonusPurchase.TotalCostPiasters == 90000, "إجمالي الفاتورة بعد الخصم السطري 90,000 قرش");
                assert(bonusPurchase.NetCostPiasters == 80000, "صافي الفاتورة بعد خصم الفاتورة الإجمالي 80,000 قرش (800 ج.م)");

                var prod3After = DatabaseService.Products.GetById(prod3.Id);
                assert(prod3After.StockQuantityMilli == 12000, "دخول كمية الشراء والبونص معاً في المخزن (10 + 2 = 12 وحدة)");
                assert(prod3After.CostPiasters == 6667, "توزيع الخصومات والبونص بدقة وحساب التكلفة الفعلية (6667 قرش للوحدة)");

                var sup1BalAfterBonus = DatabaseService.Suppliers.GetById(sup1.Id).BalancePiasters;
                assert(sup1BalAfterBonus == sup1BalBeforeBonus + 80000, "زيادة رصيد المورد الدائن بصافي تكلفة الفاتورة الحقيقية (80,000 قرش)");

                // ==========================================
                // 5. Scenario 4: Purchase Returns (مردودات المشتريات)
                // ==========================================
                // Return 2 units (2,000 milli) of prod3 to supplier
                // Return cost = 2 * 6667 = 13,334 piasters
                var retDoc = DatabaseService.Purchases.CreatePurchaseReturn(new PurchaseReturn
                {
                    SupplierId = sup1.Id,
                    PurchaseId = bonusPurchase.Id,
                    ReturnDate = DateTime.Now.ToString("yyyy-MM-dd"),
                    Notes = "إرجاع 2 علبة شاي لوجود تلف في التغليف",
                    Items = new List<PurchaseReturnItem>
                    {
                        new PurchaseReturnItem
                        {
                            ProductId = prod3.Id,
                            QuantityMilli = 2000,
                            UnitCostPiasters = 6667,
                            Reason = "تلف في كرتونة الشاي"
                        }
                    }
                });

                assert(retDoc != null && retDoc.ReturnNumber > 0, "إنشاء مرتجع مشتريات وتوليد رقم تسلسلي للمرتجع");
                assert(retDoc.TotalCostPiasters == 13334, "قيمة المرتجع صحيحة بالمليم (2 * 6667 = 13,334 قرش)");

                // Check stock decreased
                var prod3AfterRet = DatabaseService.Products.GetById(prod3.Id);
                assert(prod3AfterRet.StockQuantityMilli == 10000, "تخفيض رصيد المخزن بدقة بعد المرتجع (12 - 2 = 10 وحدات)");

                // Check supplier balance decreased
                var sup1BalAfterRet = DatabaseService.Suppliers.GetById(sup1.Id).BalancePiasters;
                assert(sup1BalAfterRet == sup1BalAfterBonus - 13334, "تخفيض مديونية المورد بقيمة المرتجع (خصم 13,334 قرش)");

                // Check transactions ledger has return entry
                var sup1TxsAfterRet = DatabaseService.Suppliers.GetTransactions(sup1.Id);
                assert(sup1TxsAfterRet[0].TransactionType == "PURCHASE_RETURN", "تسجيل حركة PURCHASE_RETURN في كشف حساب المورد");
                assert(sup1TxsAfterRet[0].AmountPiasters == -13334, "مبلغ المرتجع مسجل بالسالب في دفتر المورد لتخفيض دينيته");

                // Check protection: cannot return more than available stock
                bool threwOverReturn = false;
                try
                {
                    DatabaseService.Purchases.CreatePurchaseReturn(new PurchaseReturn
                    {
                        SupplierId = sup1.Id,
                        Items = new List<PurchaseReturnItem>
                        {
                            new PurchaseReturnItem
                            {
                                ProductId = prod3.Id,
                                QuantityMilli = 50000, // 50 units (only 10 in stock!)
                                UnitCostPiasters = 6667
                            }
                        }
                    });
                }
                catch (InvalidOperationException)
                {
                    threwOverReturn = true;
                }
                assert(threwOverReturn, "منع مرتجع مشتريات بكمية أكبر من الرصيد المتاح بالمخزن");

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
