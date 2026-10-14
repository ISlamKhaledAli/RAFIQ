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
    public class SeniorMasterEdgeCaseResult
    {
        public bool Success { get; set; }
        public string Message { get; set; }
        public int TotalAssertions { get; set; }
        public int PassedAssertions { get; set; }
        public List<string> Details { get; set; }

        public SeniorMasterEdgeCaseResult()
        {
            this.Details = new List<string>();
        }
    }

    public static class SeniorMasterEdgeCaseRunner
    {
        public static SeniorMasterEdgeCaseResult RunAllTests()
        {
            var result = new SeniorMasterEdgeCaseResult
            {
                Success = true,
                TotalAssertions = 0,
                PassedAssertions = 0
            };

            string tempDbPath = Path.Combine(Path.GetTempPath(), "rafiq_master_edge_" + Guid.NewGuid().ToString("N") + ".db");
            string tempConnStr = string.Format("Data Source={0};Version=3;BusyTimeout=10000;", tempDbPath);

            try
            {
                // 1. Initialize DB and apply migrations
                MigrationRunner.ApplyMigrations(tempConnStr, tempDbPath);
                Assert(File.Exists(tempDbPath), "انشاء قاعدة بيانات اختبار الحالات المتقدمة بنجاح", result);

                var auditRepo = new AuditLogRepository(tempConnStr);
                var custRepo = new CustomerRepository(tempConnStr, auditRepo);
                var prodRepo = new ProductRepository(tempConnStr, auditRepo);
                var expenseRepo = new ExpenseRepository(tempConnStr, auditRepo);
                var counterRepo = new CounterRepository(tempConnStr);
                var settingsRepo = new SettingsRepository(tempConnStr);
                var batchRepo = new ProductBatchRepository(tempConnStr, auditRepo);
                var catRepo = new CategoryRepository(tempConnStr);
                var catService = new CategoryService(catRepo);
                var quickRepo = new QuickItemRepository(tempConnStr);
                var quickItemService = new QuickItemService(quickRepo);
                var heldRepo = new HeldSaleRepository(tempConnStr);
                var heldSaleService = new HeldSaleService(heldRepo);
                var closingRepo = new DailyClosingRepository(tempConnStr);
                var dailyClosingService = new DailyClosingService(tempConnStr, closingRepo, counterRepo, auditRepo, settingsRepo);
                var expenseService = new ExpenseService(expenseRepo, dailyClosingService);
                var customerService = new CustomerService(custRepo);
                var supplierRepo = new SupplierRepository(tempConnStr, auditRepo);
                var supplierService = new SupplierService(supplierRepo);
                var priceHistoryRepo = new ProductPriceHistoryRepository(tempConnStr);
                var purchaseRepo = new PurchaseRepository(tempConnStr, counterRepo, supplierRepo, priceHistoryRepo, auditRepo, batchRepo);
                var purchaseService = new PurchaseService(purchaseRepo);
                var saleRepo = new SaleRepository(tempConnStr, counterRepo, auditRepo, batchRepo);
                var saleService = new SaleService(saleRepo, prodRepo, quickRepo);
                var returnRepo = new ReturnRepository(tempConnStr, counterRepo, auditRepo);
                var returnService = new ReturnService(returnRepo, saleRepo);
                var storeTemplateService = new StoreTemplateService(tempConnStr, settingsRepo, catService, quickItemService, auditRepo);

                // =========================================================================
                // Scenario 1: Held Sales (تعليق واسترجاع الفواتير)
                // =========================================================================
                TestHeldSalesLifecycle(heldSaleService, result);

                // =========================================================================
                // Scenario 2: Quick Items & Combo Bundles (الأصناف السريعة وحزم العروض)
                // =========================================================================
                TestQuickItemsAndBundles(quickItemService, result);

                // =========================================================================
                // Scenario 3: Store Template Engine (قوالب المحلات وتغيير النشاط)
                // =========================================================================
                TestStoreTemplatesEngine(storeTemplateService, settingsRepo, result);

                // =========================================================================
                // Scenario 4: Petty Cash Expenses & Daily Reconciliation (المصروفات وإقفال اليومية)
                // =========================================================================
                TestExpensesAndDailyClosing(expenseService, dailyClosingService, tempConnStr, result);

                // =========================================================================
                // Scenario 5: Customer Credit Overpayment & Ledger (العملاء والديون والتحصيل)
                // =========================================================================
                TestCustomerCreditAndOverpayment(customerService, result);

                // =========================================================================
                // Scenario 6: Supplier Transactions & Ledger Integrity (الموردين وحساباتهم)
                // =========================================================================
                TestSupplierLedgerAndProtection(supplierService, result);

                // =========================================================================
                // Scenario 7: Advanced Return Anti-Tampering & Partial Returns (المرتجعات المتقدمة)
                // =========================================================================
                TestAdvancedReturns(saleService, returnService, prodRepo, custRepo, result);

                // =========================================================================
                // Scenario 8: Weights Arithmetic, Divisibility Guard, & Supplier Ledger Stress
                // =========================================================================
                TestWeightsAndSuppliersDeepStress(saleService, purchaseService, supplierService, returnService, prodRepo, result);

                result.Message = string.Format("اكتمل فحص الحالات المتقدمة بنجاح: تم اجتياز {0} من اصل {1} تحقق.", result.PassedAssertions, result.TotalAssertions);
            }
            catch (Exception ex)
            {
                result.Success = false;
                result.Message = "خطأ استثنائي اثناء فحص الحالات المتقدمة: " + ex.Message;
                result.Details.Add("خطأ غير متوقع: " + ex.ToString());
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
                catch
                {
                    // Ignored on cleanup
                }
            }

            return result;
        }

        private static void TestHeldSalesLifecycle(HeldSaleService heldService, SeniorMasterEdgeCaseResult result)
        {
            // 1. Hold a sale with items
            var held1 = new HeldSale
            {
                HoldLabel = "عميل الصباح",
                ItemsCount = 3,
                SubtotalPiasters = 15000,
                DiscountPiasters = 1000,
                TotalPiasters = 14000,
                CartJson = "[{\"productId\":\"p1\",\"name\":\"عصير\",\"quantity\":2,\"price\":5000}]",
                Notes = "انتظار احضار بطاقة الفيزا",
                CashierId = "usr_cashier_1"
            };

            var savedHeld = heldService.HoldSale(held1);
            Assert(savedHeld != null && !string.IsNullOrEmpty(savedHeld.Id), "حفظ الفاتورة المعلقة بنجاح في قاعدة البيانات", result);

            // 2. Query held sales list
            var list = heldService.GetHeldSales();
            Assert(list.Count >= 1, "استرجاع قائمة الفواتير المعلقة بنجاح", result);
            Assert(list[0].HoldLabel == "عميل الصباح", "مطابقة ملصق الفاتورة المعلقة", result);
            Assert(list[0].TotalPiasters == 14000, "مطابقة اجمالي الفاتورة المعلقة بالقروش", result);

            // 3. Recall the held sale
            var recalled = heldService.RecallHeldSale(savedHeld.Id);
            Assert(recalled != null, "استرجاع الفاتورة المعلقة بنجاح", result);
            Assert(recalled.Id == savedHeld.Id, "تطابق معرف الفاتورة المسترجعة", result);

            // 4. Verify atomic removal on recall: cannot be recalled a second time!
            var recalledAgain = heldService.RecallHeldSale(savedHeld.Id);
            Assert(recalledAgain == null, "منع استرجاع الفاتورة المعلقة مرتين وحذفها الذري بعد الاستدعاء", result);

            // 5. Query non-existent held sale
            var nonExistent = heldService.GetHeldSaleById("non_existent_id");
            Assert(nonExistent == null, "استدعاء فاتورة معلقة غير موجودة يرجع null بامان", result);

            // 6. Hold 10 sales in rapid succession
            for (int i = 0; i < 10; i++)
            {
                heldService.HoldSale(new HeldSale
                {
                    HoldLabel = "معلقة رقم " + (i + 1),
                    ItemsCount = 1,
                    SubtotalPiasters = 5000 * (i + 1),
                    TotalPiasters = 5000 * (i + 1),
                    CartJson = "[]"
                });
            }
            var bulkList = heldService.GetHeldSales();
            Assert(bulkList.Count >= 10, "حفظ واسترجاع 10 فواتير معلقة متتالية بنجاح", result);

            // 7. Test manual delete
            string targetId = bulkList[0].Id;
            bool delOk = heldService.DeleteHeldSale(targetId);
            Assert(delOk, "حذف فاتورة معلقة يدويا بنجاح", result);
            Assert(heldService.GetHeldSaleById(targetId) == null, "تاكيد ازالة الفاتورة المحذوفة", result);

            // 8. Cleanup expired held sales with retentionDays = 0 (all deleted)
            int cleaned = heldService.CleanupOldHeldSales(0);
            Assert(cleaned >= 9, "تنظيف الفواتير المعلقة القديمة بنجاح", result);
        }

        private static void TestQuickItemsAndBundles(QuickItemService quickService, SeniorMasterEdgeCaseResult result)
        {
            // 1. Validation: null item
            bool threwNull = false;
            try
            {
                quickService.Save(null);
            }
            catch (ArgumentException)
            {
                threwNull = true;
            }
            Assert(threwNull, "منع حفظ صنف سريع فارغ (null) ورمي استثناء", result);

            // 2. Validation: empty name
            bool threwEmptyName = false;
            try
            {
                quickService.Save(new QuickItem { Name = "", PricePiasters = 1000 });
            }
            catch (ArgumentException)
            {
                threwEmptyName = true;
            }
            Assert(threwEmptyName, "منع حفظ صنف سريع بدون اسم ورمي استثناء", result);

            // 3. Validation: negative price
            bool threwNegativePrice = false;
            try
            {
                quickService.Save(new QuickItem { Name = "كيس بلاستيك", PricePiasters = -50 });
            }
            catch (ArgumentException)
            {
                threwNegativePrice = true;
            }
            Assert(threwNegativePrice, "منع حفظ صنف سريع بسعر سالب ورمي استثناء", result);

            // 4. Valid item with open price (سعر مفتوح)
            var openPriceItem = quickService.Save(new QuickItem
            {
                Name = "خبز طازج",
                PricePiasters = 0,
                IsOpenPrice = true,
                Unit = "piece",
                CategoryName = "مخبوزات"
            });
            Assert(openPriceItem != null && !string.IsNullOrEmpty(openPriceItem.Id), "حفظ صنف سريع بسعر مفتوح بنجاح", result);
            Assert(openPriceItem.IsOpenPrice, "تاكيد خاصية السعر المفتوح في الصنف السريع", result);

            // 5. Valid Combo Bundle item with JSON
            string bundleJson = "[{\"productId\":\"p_rice\",\"productName\":\"ارز\",\"quantityMilli\":1000,\"originalPricePiasters\":3500},{\"productId\":\"p_oil\",\"productName\":\"زيت\",\"quantityMilli\":1000,\"originalPricePiasters\":6500}]";
            var comboItem1 = quickService.Save(new QuickItem
            {
                Name = "كرتونة التوفير الرمضانية",
                PricePiasters = 8500, // 85 EGP discounted from 100 EGP
                IsOpenPrice = false,
                Unit = "piece",
                CategoryName = "عروض وتوفير",
                BundleItemsJson = bundleJson
            });
            Assert(comboItem1 != null && comboItem1.BundleItemsJson == bundleJson, "حفظ صنف سريع كومبو بحزمة اصناف متعددة بنجاح", result);

            var comboItem2 = quickService.Save(new QuickItem
            {
                Name = "عرض السكر والشاي",
                PricePiasters = 4500,
                IsOpenPrice = false,
                Unit = "piece",
                CategoryName = "عروض وتوفير"
            });
            Assert(comboItem2 != null && !string.IsNullOrEmpty(comboItem2.Id), "حفظ صنف سريع ثان في نفس القسم", result);

            // 6. Test Category Rename
            quickService.RenameCategory("مخبوزات", "قسم المخبوزات والحلويات");
            var retrievedOpen = quickService.GetById(openPriceItem.Id);
            Assert(retrievedOpen != null && retrievedOpen.CategoryName == "قسم المخبوزات والحلويات", "تعديل اسم قسم الاصناف السريعة وتحديثه لجميع الاصناف المرتبطة", result);

            // 7. Test Reordering within category
            var reorderedIds = new List<string>();
            reorderedIds.Add(comboItem2.Id);
            reorderedIds.Add(comboItem1.Id);
            quickService.Reorder(reorderedIds);
            var allItems = quickService.GetAll();
            QuickItem firstInCombo = null;
            for (int i = 0; i < allItems.Count; i++)
            {
                if (allItems[i].CategoryName == "عروض وتوفير")
                {
                    firstInCombo = allItems[i];
                    break;
                }
            }
            Assert(firstInCombo != null && firstInCombo.Id == comboItem2.Id, "اعادة ترتيب الاصناف السريعة وحفظ الترتيب في قاعدة البيانات", result);

            // 8. Test Delete Category
            quickService.DeleteCategory("قسم المخبوزات والحلويات");
            Assert(quickService.GetById(openPriceItem.Id) == null, "حذف قسم اصناف سريعة وحذف الاصناف التابعة له بنجاح", result);
        }

        private static void TestStoreTemplatesEngine(StoreTemplateService templateService, SettingsRepository settingsRepo, SeniorMasterEdgeCaseResult result)
        {
            // 1. Get all templates
            var templates = templateService.GetAllTemplates();
            Assert(templates != null && templates.Count >= 8, "تحميل قوالب الانشطة التجارية (8 قوالب معتمدة على الاقل)", result);

            // 2. Apply Supermarket template
            var superResult = templateService.ApplyTemplate(new ApplyTemplateRequest
            {
                TemplateId = "supermarket",
                StoreName = "سوبر ماركت البركة والخير",
                StorePhone = "01012345678",
                StoreAddress = "شارع الجمهورية"
            });
            Assert(superResult != null && superResult.Success, "تطبيق قالب السوبر ماركت بنجاح", result);
            Assert(settingsRepo.Get("store_name", "") == "سوبر ماركت البركة والخير", "حفظ وتثبيت اسم المنشاة في اعدادات النظام", result);
            Assert(settingsRepo.Get("feature_scale_weight", "0") == "1", "تفعيل ميزة الميزان الباركود في قالب السوبر ماركت", result);
            Assert(settingsRepo.Get("feature_expiry_dates", "0") == "1", "تفعيل ميزة تواريخ الصلاحية تلقائيا في قالب السوبر ماركت", result);
            Assert(settingsRepo.Get("first_run_completed", "0") == "1", "تثبيت اكتمال المعالج الاولي بنجاح", result);

            // 3. Switch to Clothes / Apparel template (clothing_apparel)
            var clothesResult = templateService.ApplyTemplate(new ApplyTemplateRequest
            {
                TemplateId = "clothing_apparel",
                StoreName = "بوتيك الاناقة",
                StorePhone = "01198765432"
            });
            Assert(clothesResult != null && clothesResult.Success, "التبديل الى قالب محلات الملابس والاحذية بنجاح", result);
            Assert(settingsRepo.Get("feature_matrix_variants", "0") == "1", "تفعيل ميزة مصفوفة المقاسات والالوان في قالب الملابس", result);
            Assert(settingsRepo.Get("feature_expiry_dates", "0") == "0", "ايقاف ميزة تواريخ الصلاحية تلقائيا عند التبديل لقالب الملابس", result);

            // 4. Switch to Phones & Electronics template (phones_electronics)
            var phonesResult = templateService.ApplyTemplate(new ApplyTemplateRequest
            {
                TemplateId = "phones_electronics",
                StoreName = "مركز المستقبل للاتصالات"
            });
            Assert(phonesResult != null && phonesResult.Success, "التبديل الى قالب الهواتف والالكترونيات بنجاح", result);
            Assert(settingsRepo.Get("feature_scale_weight", "0") == "0", "ايقاف ميزة الميزان في قالب الالكترونيات", result);
        }

        private static void TestExpensesAndDailyClosing(ExpenseService expenseService, DailyClosingService closingService, string connStr, SeniorMasterEdgeCaseResult result)
        {
            string today = DateTime.Now.ToString("yyyy-MM-dd");

            // 1. Validation: expense with 0 or negative amount must throw
            bool threwZeroExpense = false;
            try
            {
                expenseService.CreateExpense(new CreateExpenseRequest
                {
                    AmountPiasters = 0,
                    Category = "نثريات"
                });
            }
            catch (ArgumentException)
            {
                threwZeroExpense = true;
            }
            Assert(threwZeroExpense, "منع تسجيل مصروف بقيمة صفر او سالبة ورمي استثناء", result);

            // 2. Create valid expenses
            var exp1 = expenseService.CreateExpense(new CreateExpenseRequest
            {
                AmountPiasters = 3500, // 35 EGP
                Category = "بوفيه وضيافة",
                Notes = "شاي وسكر للمحل",
                CreatedBy = "الكاشير",
                BusinessDate = today
            });
            Assert(exp1 != null && exp1.AmountPiasters == 3500, "تسجيل مصروف نقدي اول بقيمة 35 ج.م بنجاح", result);

            var exp2 = expenseService.CreateExpense(new CreateExpenseRequest
            {
                AmountPiasters = 1500, // 15 EGP
                Category = "نظافة",
                Notes = "منظفات ارضيات",
                CreatedBy = "الكاشير",
                BusinessDate = today
            });
            Assert(exp2 != null && exp2.AmountPiasters == 1500, "تسجيل مصروف نقدي ثان بقيمة 15 ج.م بنجاح", result);

            // 3. Query total expenses for business date
            long totalExp = expenseService.GetTodayTotal(today);
            Assert(totalExp == 5000, "تطابق اجمالي المصروفات لليوم (5000 قرش = 50 ج.م)", result);

            // 4. Verify Daily Closing Preview deduction
            var preview = closingService.GetClosingPreview(today);
            Assert(preview != null, "استخراج معاينة الاقفال اليومي بنجاح", result);
            Assert(preview.ExpensesPiasters == 5000, "تطابق اجمالي المصروفات في تقرير الاقفال اليومي", result);
            Assert(preview.ExpensesCount >= 2, "تطابق عدد حركات المصروفات في الاقفال اليومي", result);

            // 5. Concurrency test: 10 parallel expense insertions under FinancialWriteLock
            var threads = new List<Thread>();
            long parallelSum = 0;
            object sumLock = new object();

            for (int i = 0; i < 10; i++)
            {
                int idx = i;
                var t = new Thread(new ThreadStart(delegate
                {
                    var exp = expenseService.CreateExpense(new CreateExpenseRequest
                    {
                        AmountPiasters = 1000, // 10 EGP
                        Category = "نثريات متوازية",
                        Notes = "مصروف متزامن " + idx,
                        BusinessDate = today
                    });
                    if (exp != null)
                    {
                        lock (sumLock)
                        {
                            parallelSum += exp.AmountPiasters;
                        }
                    }
                }));
                threads.Add(t);
                t.Start();
            }

            for (int i = 0; i < threads.Count; i++)
            {
                threads[i].Join();
            }

            Assert(parallelSum == 10000, "تنفيذ 10 حركات مصروفات متزامنة في امان مالي تام وبدون تعارض", result);
            long newTotalExp = expenseService.GetTodayTotal(today);
            Assert(newTotalExp == 15000, "تطابق اجمالي المصروفات بعد الحركات المتزامنة (150 ج.م)", result);
        }

        private static void TestCustomerCreditAndOverpayment(CustomerService custService, SeniorMasterEdgeCaseResult result)
        {
            // 1. Create a customer
            var customer = custService.SaveCustomer(new Customer
            {
                Name = "الحاج محمود عبدالرازق",
                Phone = "01001122334",
                CreditLimitPiasters = 100000, // 1000 EGP credit limit
                BalancePiasters = 5000 // Owes 50 EGP
            });
            Assert(customer != null && !string.IsNullOrEmpty(customer.Id), "انشاء عميل جديد بمديونية افتتاحية 50 ج.م بنجاح", result);

            // 2. Negative or zero payment must throw
            bool threwNegativePay = false;
            try
            {
                custService.RecordPayment(customer.Id, 0, "سداد خاطئ");
            }
            catch (ArgumentException)
            {
                threwNegativePay = true;
            }
            Assert(threwNegativePay, "منع تسجيل سداد عميل بقيمة صفر او سالبة", result);

            // 3. Customer overpayment: customer owes 5000, pays 8000 (overpays 3000 piasters)
            var updatedCust = custService.RecordPayment(customer.Id, 8000, "سداد زائد عن الدين");
            Assert(updatedCust != null, "تسجيل سداد العميل بنجاح", result);
            Assert(updatedCust.BalancePiasters == -3000, "حساب رصيد العميل بعد السداد الزائد (-3000 قرش = دائن للمحل بـ 30 ج.م)", result);

            // 4. Verify statement history
            var statement = custService.GetStatement(customer.Id, 10);
            Assert(statement != null && statement.Count >= 1, "استخراج كشف حساب العميل والتحقق من تسجيل الحركة", result);
            Assert(statement[0].Type == "payment", "تسجيل حركة السداد بنوع payment في السجل", result);
            Assert(statement[0].AmountPiasters == 8000, "تطابق مبلغ السداد في كشف الحساب", result);

            // 5. Cancel the payment (الغاء السداد بقيد معاكس)
            string ledgerId = statement[0].Id;
            var cancelledCust = custService.CancelPayment(customer.Id, ledgerId, "خطأ في استلام المبلغ من العميل", "الكاشير");
            Assert(cancelledCust != null, "الغاء حركة سداد العميل بقيد محاسبي معاكس", result);
            Assert(cancelledCust.BalancePiasters == 5000, "استعادة رصيد مديونية العميل بدقة تامة بعد الغاء السداد (50 ج.م)", result);

            // 6. Balance verification check
            var verification = custService.VerifyBalance(customer.Id);
            Assert(verification != null && verification.DiscrepancyPiasters == 0, "التحقق المحاسبي من تطابق رصيد العميل الفعلي مع سجل الحركات بدون اي فارق", result);
        }

        private static void TestSupplierLedgerAndProtection(SupplierService supplierService, SeniorMasterEdgeCaseResult result)
        {
            // 1. Create a supplier
            var supplier = supplierService.Save(new Supplier
            {
                Name = "شركة الدلتا للصناعات الغذائية",
                Phone = "01234567890",
                CompanyName = "الدلتا"
            });
            Assert(supplier != null && !string.IsNullOrEmpty(supplier.Id), "انشاء مورد جديد بنجاح", result);

            // 2. Adjust balance (Purchase on credit: we owe supplier 500 EGP = 50000 piasters)
            supplierService.RecordPayment(supplier.Id, 20000, "سداد نقدي للمورد من الدرج");
            var supAfterPay = supplierService.GetById(supplier.Id);
            Assert(supAfterPay != null && supAfterPay.BalancePiasters == -20000, "تسجيل سداد للمورد وتحديث الرصيد بدقة", result);

            // 3. Balance verification
            var supVerify = supplierService.VerifyBalance(supplier.Id);
            Assert(supVerify != null && supVerify.DiscrepancyPiasters == 0, "مطابقة كشف حساب المورد محاسبيا بنسبة 100%", result);

            // 4. Hard Delete Protection: attempting to delete a supplier with financial transactions MUST THROW
            bool threwDeleteProtected = false;
            try
            {
                supplierService.Delete(supplier.Id);
            }
            catch (InvalidOperationException)
            {
                threwDeleteProtected = true;
            }
            Assert(threwDeleteProtected, "منع الحذف النهائي للمورد لوجود حركات مالية مسجلة عليه وحماية البيانات", result);

            // 5. Archiving supplier
            bool archiveOk = supplierService.Archive(supplier.Id);
            Assert(archiveOk, "ارشفة المورد بنجاح بدلا من الحذف للحفاظ على القيود المحاسبية", result);
            var archivedSup = supplierService.GetById(supplier.Id);
            Assert(archivedSup != null && !archivedSup.IsActive, "تاكيد حالة المورد المؤرشف (غير نشط)", result);

            // 6. Restoring supplier
            bool restoreOk = supplierService.Restore(supplier.Id);
            Assert(restoreOk, "استعادة المورد المؤرشف بنجاح", result);
            var restoredSup = supplierService.GetById(supplier.Id);
            Assert(restoredSup != null && restoredSup.IsActive, "تاكيد عودة المورد للحالة النشطة", result);
        }

        private static void TestAdvancedReturns(
            SaleService saleService,
            ReturnService returnService,
            ProductRepository prodRepo,
            CustomerRepository custRepo,
            SeniorMasterEdgeCaseResult result)
        {
            // 1. Seed a product with stock = 20
            var prod = CreateTestProduct(prodRepo, "شاي العروسة 250 جم", "6221100223344", 4500, 3800, 20000, "قطعة");
            Assert(prod != null && !string.IsNullOrEmpty(prod.Id), "تجهيز صنف جديد لاختبار المرتجعات المتقدمة", result);

            // 2. Seed a customer
            var customer = custRepo.SaveCustomer(new Customer
            {
                Name = "عميل المرتجعات التجريبي",
                Phone = "01099887766",
                CreditLimitPiasters = 100000,
                BalancePiasters = 0
            });

            // 3. Complete a sale: 4 pieces of the product (Total = 18000 piasters) paid in CASH
            var saleReq = new Sale
            {
                CustomerId = customer.Id,
                CustomerName = customer.Name,
                PaymentMethod = "cash",
                PaidPiasters = 20000,
                ChangePiasters = 2000,
                SubtotalPiasters = 18000,
                TotalPiasters = 18000,
                Items = new List<SaleItem>
                {
                    new SaleItem
                    {
                        ProductId = prod.Id,
                        ProductName = prod.Name,
                        Barcode = prod.Barcode,
                        QuantityMilli = 4000, // 4 pieces
                        UnitPricePiasters = 4500,
                        TotalPiasters = 18000,
                        Unit = "piece"
                    }
                }
            };
            var sale = saleService.ProcessSale(saleReq);
            Assert(sale != null && !string.IsNullOrEmpty(sale.Id), "اتمام فاتورة بيع لـ 4 قطع شاي بنجاح", result);

            // Check stock after sale: 20 - 4 = 16 pieces (16000 milli)
            var prodAfterSale = prodRepo.GetById(prod.Id);
            Assert(prodAfterSale.StockQuantityMilli == 16000, "خصم المخزون بدقة بعد عملية البيع (16 قطعة متبقية)", result);

            // 4. Edge-case: Try to return MORE than sold quantity (e.g. 5 pieces when only 4 were sold)
            bool threwExcessReturn = false;
            try
            {
                returnService.ProcessReturn(new Return
                {
                    SaleId = sale.Id,
                    RefundMethod = "cash",
                    Reason = "ارجاع زائد عمدا للاختبار",
                    Items = new List<ReturnItem>
                    {
                        new ReturnItem
                        {
                            ProductId = prod.Id,
                            ProductName = prod.Name,
                            QuantityMilli = 5000, // 5 pieces (exceeds 4!)
                            UnitPricePiasters = 4500
                        }
                    }
                });
            }
            catch (InvalidOperationException)
            {
                threwExcessReturn = true;
            }
            Assert(threwExcessReturn, "منع ارجاع كمية اكبر من الكمية المباعة في الفاتورة الاصلية ورمي استثناء", result);

            // 5. Partial return #1: Return 1 piece in undamaged condition
            var ret1 = returnService.ProcessReturn(new Return
            {
                SaleId = sale.Id,
                RefundMethod = "cash",
                Reason = "تغيير راي العميل",
                Items = new List<ReturnItem>
                {
                    new ReturnItem
                    {
                        ProductId = prod.Id,
                        ProductName = prod.Name,
                        QuantityMilli = 1000, // 1 piece
                        UnitPricePiasters = 4500,
                        IsDamaged = false
                    }
                }
            });
            Assert(ret1 != null && ret1.TotalPiasters == 4500, "تسجيل مرتجع جزئي اول لقطعة واحدة بنجاح", result);
            var prodAfterRet1 = prodRepo.GetById(prod.Id);
            Assert(prodAfterRet1.StockQuantityMilli == 17000, "استعادة مخزون الصنف السليم بدقة بعد المرتجع (17 قطعة)", result);

            // 6. Partial return #2: Return 2 pieces in DAMAGED condition (بضاعة تالفة)
            var ret2 = returnService.ProcessReturn(new Return
            {
                SaleId = sale.Id,
                RefundMethod = "cash",
                Reason = "عبوة ممزقة تالفة",
                Items = new List<ReturnItem>
                {
                    new ReturnItem
                    {
                        ProductId = prod.Id,
                        ProductName = prod.Name,
                        QuantityMilli = 2000, // 2 pieces
                        UnitPricePiasters = 4500,
                        IsDamaged = true // DAMAGED!
                    }
                }
            });
            Assert(ret2 != null && ret2.TotalPiasters == 9000, "تسجيل مرتجع جزئي ثان لبضاعة تالفة بنجاح", result);
            var prodAfterRet2 = prodRepo.GetById(prod.Id);
            Assert(prodAfterRet2.StockQuantityMilli == 17000, "عدم زيادة مخزون الصنف القابل للبيع عند ارجاع بضاعة تالفة", result);

            // 7. Partial return #3: Try to return 2 pieces when only 1 remaining! (4 sold - 1 returned - 2 returned = 1 remaining)
            bool threwExceededCumulative = false;
            try
            {
                returnService.ProcessReturn(new Return
                {
                    SaleId = sale.Id,
                    RefundMethod = "cash",
                    Reason = "محاولة ارجاع قطعتين والمتبقي واحدة",
                    Items = new List<ReturnItem>
                    {
                        new ReturnItem
                        {
                            ProductId = prod.Id,
                            ProductName = prod.Name,
                            QuantityMilli = 2000,
                            UnitPricePiasters = 4500
                        }
                    }
                });
            }
            catch (InvalidOperationException)
            {
                threwExceededCumulative = true;
            }
            Assert(threwExceededCumulative, "منع تجاوز اجمالي الكميات المرتجعة التراكمية عبر عدة عمليات ارجاع متتالية", result);

            // 8. Partial return #4: Return the exact last remaining piece (1 piece) -> completes full refund!
            var ret3 = returnService.ProcessReturn(new Return
            {
                SaleId = sale.Id,
                RefundMethod = "cash",
                Reason = "ارجاع القطعة الاخيرة المتبقية",
                Items = new List<ReturnItem>
                {
                    new ReturnItem
                    {
                        ProductId = prod.Id,
                        ProductName = prod.Name,
                        QuantityMilli = 1000, // 1 piece
                        UnitPricePiasters = 4500,
                        IsDamaged = false
                    }
                }
            });
            Assert(ret3 != null && ret3.TotalPiasters == 4500, "ارجاع اخر قطعة متبقية في الفاتورة بنجاح", result);

            // Verify original sale status changed to 'refunded'
            var refreshedSale = saleService.GetSaleById(sale.Id);
            Assert(refreshedSale.Status == "refunded", "تحديث حالة الفاتورة الاصلية تلقائيا الى مستردة بالكامل (refunded)", result);
        }

        private static void TestWeightsAndSuppliersDeepStress(
            SaleService saleService,
            PurchaseService purchaseService,
            SupplierService supplierService,
            ReturnService returnService,
            ProductRepository prodRepo,
            SeniorMasterEdgeCaseResult result)
        {
            // 1. Divisibility Guard: A piece-based product cannot be sold in fractional quantities
            var pieceProd = CreateTestProduct(prodRepo, "شيبسي عائلي بالجبنة", "6221199880011", 1000, 750, 10000, "piece");
            bool threwFractionalPiece = false;
            try
            {
                saleService.ProcessSale(new Sale
                {
                    PaymentMethod = "cash",
                    SubtotalPiasters = 350,
                    TotalPiasters = 350,
                    PaidPiasters = 350,
                    ChangePiasters = 0,
                    Items = new List<SaleItem>
                    {
                        new SaleItem
                        {
                            ProductId = pieceProd.Id,
                            ProductName = pieceProd.Name,
                            Barcode = pieceProd.Barcode,
                            QuantityMilli = 350, // 0.35 piece - forbidden!
                            UnitPricePiasters = 1000,
                            TotalPiasters = 350,
                            Unit = "piece"
                        }
                    }
                });
            }
            catch (InvalidOperationException)
            {
                threwFractionalPiece = true;
            }
            Assert(threwFractionalPiece, "حظر بيع كميات كسرية (0.35) للأصناف المباعة بالقطعة في غياب وحدة قابلة للتجزئة", result);

            // 2. Weighted Product Sale with AwayFromZero Half-Up Rounding
            var weightProd = CreateTestProduct(prodRepo, "جبنة رومي قديمة", "2010055003501", 1399, 1100, 50000, "kg");
            var weightSale = saleService.ProcessSale(new Sale
            {
                PaymentMethod = "cash",
                SubtotalPiasters = 490,
                TotalPiasters = 490,
                PaidPiasters = 500,
                ChangePiasters = 10,
                Items = new List<SaleItem>
                {
                    new SaleItem
                    {
                        ProductId = weightProd.Id,
                        ProductName = weightProd.Name,
                        Barcode = weightProd.Barcode,
                        QuantityMilli = 350, // 350 grams (0.35 kg)
                        UnitPricePiasters = 1399,
                        TotalPiasters = 490, // (1399 * 350) / 1000 = 489.65 -> 490
                        Unit = "kg"
                    }
                }
            });
            Assert(weightSale != null && weightSale.TotalPiasters == 490, "إتمام بيع 350 جرام جبنة رومي بحساب مالي صحيح مقرب لأقرب قرش (490 قرش)", result);

            var weightProdAfterSale = prodRepo.GetById(weightProd.Id);
            Assert(weightProdAfterSale.StockQuantityMilli == 49650, "خصم المخزون بالمليجرام بدقة متناهية (50000 - 350 = 49650)", result);

            // 3. Purchase of Weighted Item: exact AwayFromZero piasters line total
            var supplier = supplierService.Save(new Supplier
            {
                Name = "شركة الألبان الممتازة",
                Phone = "01122334455",
                BalancePiasters = 0
            });

            var pur1 = purchaseService.CreatePurchase(new Purchase
            {
                SupplierId = supplier.Id,
                DiscountPiasters = 0,
                PaidAmountPiasters = 12,
                Items = new List<PurchaseItem>
                {
                    new PurchaseItem
                    {
                        ProductId = weightProd.Id,
                        ProductName = weightProd.Name,
                        Barcode = weightProd.Barcode,
                        QuantityMilli = 350, // 350 grams
                        UnitCostPiasters = 33 // 33 piasters/kg -> 33 * 350 / 1000 = 11.55 -> 12 piasters
                    }
                }
            });
            Assert(pur1 != null && pur1.NetCostPiasters == 12 && pur1.PaymentStatus == "PAID", "فاتورة شراء بالوزن مسددة بالكامل (12 قرش) دون ترحيل عجز أو فائض وهمي", result);

            // 4. Weighted Average Cost Precision with MidpointRounding.AwayFromZero
            var costTestProd = CreateTestProduct(prodRepo, "تفاح أحمر سكري", "2020044000001", 2500, 1000, 1000, "kg"); // 1 kg at 1000 piasters
            purchaseService.CreatePurchase(new Purchase
            {
                SupplierId = supplier.Id,
                DiscountPiasters = 0,
                PaidAmountPiasters = 525,
                Items = new List<PurchaseItem>
                {
                    new PurchaseItem
                    {
                        ProductId = costTestProd.Id,
                        ProductName = costTestProd.Name,
                        QuantityMilli = 350, // 350 grams
                        UnitCostPiasters = 1500 // (1000 * 1000 + 350 * 1500) / 1350 = 1525000 / 1350 = 1129.629 -> 1130
                    }
                }
            }, "WEIGHTED_AVERAGE");
            var prodAfterPur = prodRepo.GetById(costTestProd.Id);
            Assert(prodAfterPur.CostPiasters == 1130, "حساب متوسط التكلفة المرجح بدقة التقريب المالي المعتمدة (1130 قرش بدلاً من 1129)", result);

            // 5. Liability Leak Guard: Credit or Partial Purchase without SupplierId MUST fail
            bool threwNoSupplierCredit = false;
            try
            {
                purchaseService.CreatePurchase(new Purchase
                {
                    SupplierId = null,
                    DiscountPiasters = 0,
                    PaidAmountPiasters = 0, // Unpaid credit purchase without supplier
                    Items = new List<PurchaseItem>
                    {
                        new PurchaseItem
                        {
                            ProductId = weightProd.Id,
                            ProductName = weightProd.Name,
                            QuantityMilli = 1000,
                            UnitCostPiasters = 1000
                        }
                    }
                });
            }
            catch (InvalidOperationException)
            {
                threwNoSupplierCredit = true;
            }
            Assert(threwNoSupplierCredit, "منع إنشاء فاتورة شراء آجلة أو جزئية بدون تحديد مورد (حماية من تسريب الالتزامات المالية)", result);

            // 6. Supplier Credit Purchase & Ledger Verification
            var creditPur = purchaseService.CreatePurchase(new Purchase
            {
                SupplierId = supplier.Id,
                DiscountPiasters = 0,
                PaidAmountPiasters = 2000,
                Items = new List<PurchaseItem>
                {
                    new PurchaseItem
                    {
                        ProductId = weightProd.Id,
                        ProductName = weightProd.Name,
                        QuantityMilli = 5000,
                        UnitCostPiasters = 1000 // Total = 5000, Paid = 2000, Remaining = 3000
                    }
                }
            });
            Assert(creditPur.RemainingAmountPiasters == 3000 && creditPur.PaymentStatus == "PARTIAL", "تسجيل فاتورة شراء جزئية (سداد 2000 والباقي 3000 قرش)", result);

            var supAfterCredit = supplierService.GetById(supplier.Id);
            Assert(supAfterCredit.BalancePiasters == 3000, "تحديث رصيد المورد الدائن بـ 3000 قرش بدقة", result);

            // 7. Supplier Payment Settlement
            supplierService.RecordPayment(supplier.Id, 1000, "سداد نقدي على الحساب");
            var supAfterPay = supplierService.GetById(supplier.Id);
            Assert(supAfterPay.BalancePiasters == 2000, "خفض رصيد المورد بعد السداد النقدي إلى 2000 قرش", result);

            // 8. Supplier Overpayment (Advance Credit)
            supplierService.RecordPayment(supplier.Id, 2500, "سداد بالزيادة تحت الحساب");
            var supAfterAdvance = supplierService.GetById(supplier.Id);
            Assert(supAfterAdvance.BalancePiasters == -500, "تحول رصيد المورد إلى دائن لصالح المحل (-500 قرش)", result);

            // 9. Audit and Discrepancy Verification
            var verify = supplierService.VerifyBalance(supplier.Id);
            Assert(verify.IsBalanced && verify.DiscrepancyPiasters == 0, "مطابقة كشف حساب المورد رياضياً مع الرصيد المسجل (فارق = 0 قرش)", result);

            // 10. Concurrency stress on Supplier Ledger under FinancialWriteLock
            int threadCount = 10;
            Thread[] threads = new Thread[threadCount];
            int successfulOps = 0;
            object syncCount = new object();

            for (int t = 0; t < threadCount; t++)
            {
                int tid = t;
                threads[t] = new Thread(() =>
                {
                    try
                    {
                        if (tid % 2 == 0)
                        {
                            purchaseService.CreatePurchase(new Purchase
                            {
                                SupplierId = supplier.Id,
                                DiscountPiasters = 0,
                                PaidAmountPiasters = 100,
                                Items = new List<PurchaseItem>
                                {
                                    new PurchaseItem
                                    {
                                        ProductId = weightProd.Id,
                                        ProductName = weightProd.Name,
                                        QuantityMilli = 1000,
                                        UnitCostPiasters = 100 // Total = 100, Paid = 100 (Full cash)
                                    }
                                }
                            });
                        }
                        else
                        {
                            supplierService.RecordPayment(supplier.Id, 50, "سداد متزامن");
                        }
                        lock (syncCount) { successfulOps++; }
                    }
                    catch (Exception)
                    {
                    }
                });
                threads[t].Start();
            }

            for (int t = 0; t < threadCount; t++)
            {
                threads[t].Join(5000);
            }

            Assert(successfulOps == threadCount, "تنفيذ كافة العمليات المتزامنة على المورد بنجاح تام تحت FinancialWriteLock", result);
            var finalVerify = supplierService.VerifyBalance(supplier.Id);
            Assert(finalVerify.IsBalanced && finalVerify.DiscrepancyPiasters == 0, "سلامة وتطابق كشف حساب المورد بعد اختبار الإجهاد التزامني المعقد", result);
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

        private static void Assert(bool condition, string assertionName, SeniorMasterEdgeCaseResult result)
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
    }
}
