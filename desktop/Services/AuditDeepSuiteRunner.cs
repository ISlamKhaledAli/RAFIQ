using System;
using System.Collections.Generic;
using System.Data.SQLite;
using System.IO;
using RafiqPOS.Models;
using RafiqPOS.Repositories;

namespace RafiqPOS.Services
{
    public static class AuditDeepSuiteRunner
    {
        private static string GenerateUniqueBarcode()
        {
            return "623" + Math.Abs(Guid.NewGuid().GetHashCode()).ToString("D9");
        }

        public static AuditTestRunnerSummary RunAllTests()
        {
            var summary = new AuditTestRunnerSummary();
            string tempDir = Path.Combine(Path.GetTempPath(), "rafiq_audit_deep_" + Guid.NewGuid().ToString("N"));
            if (!Directory.Exists(tempDir)) Directory.CreateDirectory(tempDir);

            try
            {
                DatabaseService.Initialize(tempDir);

                if (DatabaseService.License != null && DatabaseService.Encryption != null)
                {
                    string myFp = DatabaseService.Encryption.DeviceFingerprint;
                    string supCode = LicenseService.GenerateOfflineSupportCode(myFp, "lifetime", 9999);
                    DatabaseService.License.ActivateWithSupportCode(supCode, "متجر الفحص المعمق");
                }

                summary.Results.Add(RunTest1_SplitPaymentsDailyClosingAndReports());
                summary.Results.Add(RunTest2_VariantPurchaseStockSync());
                summary.Results.Add(RunTest3_StockRecalculationParentRollupAndVariants());
                summary.Results.Add(RunTest4_NegativeOrZeroCustomerPaymentValidation());
                summary.Results.Add(RunTest5_NegativeExpenseValidation());
                summary.Results.Add(RunTest6_InventoryAdjustmentVariantAndParentSync());
                summary.Results.Add(RunTest7_CustomerAdvancePrepaymentAndCreditSale());
                summary.Results.Add(RunTest8_PurchaseDiscountExceedingCostAndNegativeDiscount());
                summary.Results.Add(RunTest9_AdvanceCreditDrawerAndAnalyticsIntegrity());

                summary.TotalTests = summary.Results.Count;
                summary.PassedCount = 0;
                summary.FailedCount = 0;
                for (int i = 0; i < summary.Results.Count; i++)
                {
                    if (summary.Results[i].Passed) summary.PassedCount++;
                    else summary.FailedCount++;
                }

                return summary;
            }
            finally
            {
                try { Directory.Delete(tempDir, true); } catch { }
            }
        }

        /// <summary>
        /// TEST 1: Split / Multi-payments Cash and Card inclusion in Shift Closing Drawer and Reports
        /// </summary>
        private static AuditTestCaseResult RunTest1_SplitPaymentsDailyClosingAndReports()
        {
            var result = new AuditTestCaseResult();
            result.TestNumber = 101;
            result.TestCode = "DEEP-01";
            result.Title = "دقة احتساب مبيعات الدفع المتعدد (نقدي + فيزا) في تقفيل الوردية والتقارير المالية";
            result.Expected = "حساب حصة الكاش بدقة في درج الكاشير (ExpectedCash) وحصة الفيزا في تقفيل اليومية والتقارير عند الدفع المقسم (Split/Multi Payment)";

            try
            {
                string prodId = "prod_split_" + Guid.NewGuid().ToString("N").Substring(0, 8);
                var prod = new Product
                {
                    Id = prodId,
                    Name = "منتج اختبار الدفع المجزأ",
                    Barcode = GenerateUniqueBarcode(),
                    PricePiasters = 15000, // 150 EGP
                    CostPiasters = 8000,
                    StockQuantityMilli = 100000, // 100 units
                    IsActive = true
                };
                DatabaseService.Products.SaveProduct(prod);

                var sale = new Sale
                {
                    Id = "sale_split_" + Guid.NewGuid().ToString("N").Substring(0, 8),
                    TotalPiasters = 15000,
                    DiscountPiasters = 0,
                    PaidPiasters = 15000,
                    PaymentMethod = "multi", // Split payment
                    Status = "completed",
                    CreatedAt = DateTime.UtcNow.ToString("o"),
                    Payments = new List<SalePayment>
                    {
                        new SalePayment
                        {
                            Id = "pay_split_1_" + Guid.NewGuid().ToString("N").Substring(0, 6),
                            AmountPiasters = 5000, // 50 EGP cash
                            Method = "cash",
                            CreatedAt = DateTime.UtcNow.ToString("o")
                        },
                        new SalePayment
                        {
                            Id = "pay_split_2_" + Guid.NewGuid().ToString("N").Substring(0, 6),
                            AmountPiasters = 10000, // 100 EGP card
                            Method = "card",
                            CreatedAt = DateTime.UtcNow.ToString("o")
                        }
                    },
                    Items = new List<SaleItem>
                    {
                        new SaleItem
                        {
                            Id = "si_split_" + Guid.NewGuid().ToString("N").Substring(0, 8),
                            ProductId = prodId,
                            ProductName = prod.Name,
                            QuantityMilli = 1000,
                            UnitPricePiasters = 15000,
                            TotalPiasters = 15000
                        }
                    }
                };

                DatabaseService.Sales.ProcessSale(sale);

                // Check Daily Closing Preview
                string bdate = DatabaseService.DailyClosing.GetCurrentBusinessDate();
                var preview = DatabaseService.DailyClosing.GetClosingPreview(bdate);
                var periodReport = DatabaseService.Reports.GetPeriodSalesReport("today", null, null);

                bool previewCashMatches = (preview.CashSalesPiasters == 5000);
                bool previewCardMatches = (preview.CardSalesPiasters == 10000);
                bool reportCashMatches = (periodReport.CashSalesPiasters == 5000);
                bool reportCardMatches = (periodReport.CardSalesPiasters == 10000);

                if (previewCashMatches && previewCardMatches && reportCashMatches && reportCardMatches)
                {
                    result.Passed = true;
                    result.Observed = string.Format("تم احتساب الكاش ({0} قرش) والفيزا ({1} قرش) بدقة في التقفيل والتقارير", preview.CashSalesPiasters, preview.CardSalesPiasters);
                    result.Details = "نظام التقفيل والتقارير يحلل دفعات الدفع المتعدد Multi Payment بدون أي فقد مالي.";
                }
                else
                {
                    result.Passed = false;
                    result.Observed = string.Format("فشل التقفيل: CashPreview={0}, CardPreview={1}, CashReport={2}, CardReport={3}",
                        preview.CashSalesPiasters, preview.CardSalesPiasters, periodReport.CashSalesPiasters, periodReport.CardSalesPiasters);
                    result.Details = "تم تجاهل حصة الكاش والفيزا من الفاتورة المجزأة في التقفيل اليومي أو تقارير اليومية.";
                }
            }
            catch (Exception ex)
            {
                result.Passed = false;
                result.Observed = "استثناء أثناء الفحص: " + ex.Message;
                result.Details = ex.ToString();
            }

            return result;
        }

        /// <summary>
        /// TEST 2: Variant stock synchronization on Purchase Invoice creation
        /// </summary>
        private static AuditTestCaseResult RunTest2_VariantPurchaseStockSync()
        {
            var result = new AuditTestCaseResult();
            result.TestNumber = 102;
            result.TestCode = "DEEP-02";
            result.Title = "تحديث رصيد جدول المتغيرات (product_variants) وتجميع الصنف الأب عند إنشاء فاتورة شراء";
            result.Expected = "زيادة رصيد product_variants للمتغير وزيادة رصيد الصنف الأب التراكمي في جدول products عند شراء كمية للمتغير";

            try
            {
                // Create Parent Product with variants matrix
                var cells = new List<VariantMatrixCell>();
                cells.Add(new VariantMatrixCell
                {
                    Size = "XL",
                    Color = "أزرق",
                    PricePiasters = 25000,
                    CostPiasters = 15000,
                    StockQuantityMilli = 0,
                    MinStockQuantityMilli = 5000,
                    IsEnabled = true
                });

                var request = new CreateVariantMatrixRequest
                {
                    ParentName = "قميص قطن رجالي توريد " + Guid.NewGuid().ToString("N").Substring(0, 4),
                    DefaultPricePiasters = 25000,
                    DefaultCostPiasters = 15000,
                    DefaultMinStockQuantityMilli = 5000,
                    Sizes = new List<string> { "XL" },
                    Colors = new List<string> { "أزرق" },
                    MatrixCells = cells
                };

                var matrixResult = DatabaseService.ProductVariantRepo.CreateMatrix(request);
                string parentId = matrixResult.ParentProduct.Id;
                string varProdId = matrixResult.Variants[0].VariantProductId;

                // Purchase 25 units of this variant
                var purchase = new Purchase
                {
                    Id = "pur_vtest_" + Guid.NewGuid().ToString("N").Substring(0, 8),
                    InvoiceDate = DateTime.Now.ToString("yyyy-MM-dd"),
                    DiscountPiasters = 0,
                    PaidAmountPiasters = 375000, // 3750.00 EGP
                    PaymentStatus = "PAID",
                    CreatedAt = DateTime.UtcNow.ToString("o"),
                    UpdatedAt = DateTime.UtcNow.ToString("o"),
                    Items = new List<PurchaseItem>
                    {
                        new PurchaseItem
                        {
                            Id = "pi_vtest_" + Guid.NewGuid().ToString("N").Substring(0, 8),
                            ProductId = varProdId,
                            ProductName = matrixResult.Variants[0].Color + " " + matrixResult.Variants[0].Size,
                            Barcode = matrixResult.Variants[0].Barcode,
                            QuantityMilli = 25000, // 25 units
                            UnitCostPiasters = 15000,
                            TotalCostPiasters = 375000
                        }
                    }
                };

                DatabaseService.PurchaseRepo.CreatePurchase(purchase);

                // Verify stock in:
                // 1) products table (variant row)
                // 2) product_variants table (variant row)
                // 3) products table (parent row)
                var updatedVarProd = DatabaseService.ProductRepo.GetById(varProdId);
                var updatedParent = DatabaseService.ProductRepo.GetById(parentId);

                long pvTableStock = -1;
                using (var conn = new SQLiteConnection(DatabaseService.ConnectionString))
                {
                    conn.Open();
                    using (var cmd = new SQLiteCommand("SELECT stock_quantity_milli FROM product_variants WHERE variant_product_id = @vpid LIMIT 1;", conn))
                    {
                        cmd.Parameters.AddWithValue("@vpid", varProdId);
                        object val = cmd.ExecuteScalar();
                        if (val != null && val != DBNull.Value) pvTableStock = Convert.ToInt64(val);
                    }
                }

                long varProdStock = updatedVarProd != null ? updatedVarProd.StockQuantityMilli : -1;
                long parentStock = updatedParent != null ? updatedParent.StockQuantityMilli : -1;

                bool varProdPassed = (varProdStock == 25000);
                bool pvPassed = (pvTableStock == 25000);
                bool parentPassed = (parentStock == 25000);

                if (varProdPassed && pvPassed && parentPassed)
                {
                    result.Passed = true;
                    result.Observed = string.Format("تمت مزامنة المخزون بالكامل: VariantProd={0}, ProductVariantsTable={1}, ParentProd={2}", varProdStock, pvTableStock, parentStock);
                    result.Details = "فاتورة الشراء حدثت جدول المتغيرات والصنف الأب بنجاح تام.";
                }
                else
                {
                    result.Passed = false;
                    result.Observed = string.Format("عدم تطابق في الأرصدة: VariantProd={0} (متوقع 25000), ProductVariantsTable={1} (متوقع 25000), ParentProd={2} (متوقع 25000)", varProdStock, pvTableStock, parentStock);
                    result.Details = "جدول product_variants أو الصنف الأب لم يتم تحديث رصيدهما بعد حفظ فاتورة الشراء.";
                }
            }
            catch (Exception ex)
            {
                result.Passed = false;
                result.Observed = "استثناء أثناء الفحص: " + ex.Message;
                result.Details = ex.ToString();
            }

            return result;
        }

        /// <summary>
        /// TEST 3: Stock Recalculation from Movements preserves parent rollup and updates product_variants
        /// </summary>
        private static AuditTestCaseResult RunTest3_StockRecalculationParentRollupAndVariants()
        {
            var result = new AuditTestCaseResult();
            result.TestNumber = 103;
            result.TestCode = "DEEP-03";
            result.Title = "إعادة احتساب المخزون من سجل الحركات وحماية رصيد الصنف الأب من التصفير";
            result.Expected = "عدم تصفير رصيد الصنف الأب وتحديث جدول product_variants تلقائياً عند تنفيذ RecalculateStockFromMovements";

            try
            {
                var cells = new List<VariantMatrixCell>();
                cells.Add(new VariantMatrixCell
                {
                    Size = "42",
                    Color = "أسود",
                    PricePiasters = 50000,
                    CostPiasters = 30000,
                    StockQuantityMilli = 0,
                    IsEnabled = true
                });
                cells.Add(new VariantMatrixCell
                {
                    Size = "43",
                    Color = "أبيض",
                    PricePiasters = 50000,
                    CostPiasters = 30000,
                    StockQuantityMilli = 0,
                    IsEnabled = true
                });

                var request = new CreateVariantMatrixRequest
                {
                    ParentName = "حذاء رياضي أب " + Guid.NewGuid().ToString("N").Substring(0, 4),
                    DefaultPricePiasters = 50000,
                    DefaultCostPiasters = 30000,
                    Sizes = new List<string> { "42", "43" },
                    Colors = new List<string> { "أسود", "أبيض" },
                    MatrixCells = cells
                };

                var matrixResult = DatabaseService.ProductVariantRepo.CreateMatrix(request);
                string parentId = matrixResult.ParentProduct.Id;
                string var1Id = matrixResult.Variants[0].VariantProductId;
                string var2Id = matrixResult.Variants[1].VariantProductId;

                // Add movements for variant 1 (+30 units) and variant 2 (+20 units)
                DatabaseService.StockMovementRepo.Add(new StockMovement
                {
                    Id = Guid.NewGuid().ToString(),
                    ProductId = var1Id,
                    MovementType = "PURCHASE",
                    QuantityMilli = 30000,
                    UnitCostPiasters = 30000,
                    CreatedAt = DateTime.UtcNow.ToString("o")
                });

                DatabaseService.StockMovementRepo.Add(new StockMovement
                {
                    Id = Guid.NewGuid().ToString(),
                    ProductId = var2Id,
                    MovementType = "PURCHASE",
                    QuantityMilli = 20000,
                    UnitCostPiasters = 30000,
                    CreatedAt = DateTime.UtcNow.ToString("o")
                });

                // Execute Recalculate for the entire database
                DatabaseService.StockMovementRepo.RecalculateStockFromMovements();

                // Check stocks
                var upParent = DatabaseService.ProductRepo.GetById(parentId);
                var upVar1 = DatabaseService.ProductRepo.GetById(var1Id);
                var upVar2 = DatabaseService.ProductRepo.GetById(var2Id);

                long pv1Stock = -1;
                long pv2Stock = -1;
                using (var conn = new SQLiteConnection(DatabaseService.ConnectionString))
                {
                    conn.Open();
                    using (var cmd = new SQLiteCommand("SELECT stock_quantity_milli FROM product_variants WHERE variant_product_id = @vpid LIMIT 1;", conn))
                    {
                        cmd.Parameters.AddWithValue("@vpid", var1Id);
                        object val = cmd.ExecuteScalar();
                        if (val != null && val != DBNull.Value) pv1Stock = Convert.ToInt64(val);
                    }
                    using (var cmd = new SQLiteCommand("SELECT stock_quantity_milli FROM product_variants WHERE variant_product_id = @vpid LIMIT 1;", conn))
                    {
                        cmd.Parameters.AddWithValue("@vpid", var2Id);
                        object val = cmd.ExecuteScalar();
                        if (val != null && val != DBNull.Value) pv2Stock = Convert.ToInt64(val);
                    }
                }

                long parentStock = upParent != null ? upParent.StockQuantityMilli : -1;
                long var1Stock = upVar1 != null ? upVar1.StockQuantityMilli : -1;
                long var2Stock = upVar2 != null ? upVar2.StockQuantityMilli : -1;

                bool v1Passed = (var1Stock == 30000 && pv1Stock == 30000);
                bool v2Passed = (var2Stock == 20000 && pv2Stock == 20000);
                bool pPassed = (parentStock == 50000); // 30 + 20 = 50 units

                if (v1Passed && v2Passed && pPassed)
                {
                    result.Passed = true;
                    result.Observed = string.Format("تمت إعادة الاحتساب بنجاح: Parent={0}, Var1={1}, Var2={2}", parentStock, var1Stock, var2Stock);
                    result.Details = "احتفظ الصنف الأب بمجموع المتغيرات وتطابق جدول product_variants بالكامل مع سجل الحركات.";
                }
                else
                {
                    result.Passed = false;
                    result.Observed = string.Format("خلل في إعادة الاحتساب: Parent={0} (متوقع 50000), Var1={1} (pv={2}), Var2={3} (pv={4})",
                        parentStock, var1Stock, pv1Stock, var2Stock, pv2Stock);
                    result.Details = "تم تصفير رصيد الصنف الأب أو فشل تحديث جدول product_variants عند إعادة الاحتساب.";
                }
            }
            catch (Exception ex)
            {
                result.Passed = false;
                result.Observed = "استثناء أثناء الفحص: " + ex.Message;
                result.Details = ex.ToString();
            }

            return result;
        }

        /// <summary>
        /// TEST 4: Validation against negative or zero customer payments
        /// </summary>
        private static AuditTestCaseResult RunTest4_NegativeOrZeroCustomerPaymentValidation()
        {
            var result = new AuditTestCaseResult();
            result.TestNumber = 104;
            result.TestCode = "DEEP-04";
            result.Title = "منع تسجيل سداد مالي صفري أو سالب للعميل وحماية كشف الحساب من التضارب";
            result.Expected = "رفض المبالغ الصفرية أو السالبة برمي ArgumentException وعدم تغيير رصيد العميل أو إضافة حركات باطلة";

            try
            {
                var cust = new Customer
                {
                    Id = "cust_negpay_" + Guid.NewGuid().ToString("N").Substring(0, 8),
                    Name = "عميل فحص السداد السالب",
                    Phone = "0100" + Math.Abs(Guid.NewGuid().GetHashCode()).ToString("D7"),
                    BalancePiasters = 50000 // 500 EGP debt
                };
                DatabaseService.CustomerRepo.SaveCustomer(cust);

                bool zeroRejected = false;
                try
                {
                    DatabaseService.CustomerRepo.RecordPayment(cust.Id, 0, "سداد صفري");
                }
                catch (ArgumentException)
                {
                    zeroRejected = true;
                }

                bool negativeRejected = false;
                try
                {
                    DatabaseService.CustomerRepo.RecordPayment(cust.Id, -20000, "سداد سالب");
                }
                catch (ArgumentException)
                {
                    negativeRejected = true;
                }

                var checkCust = DatabaseService.CustomerRepo.GetById(cust.Id);
                bool balanceUnchanged = (checkCust != null && checkCust.BalancePiasters == 50000);

                if (zeroRejected && negativeRejected && balanceUnchanged)
                {
                    result.Passed = true;
                    result.Observed = "تم رفض السداد الصفري والسالب بنجاح وظل رصيد العميل ثابتاً 50000 قرش";
                    result.Details = "منع النظام أي تلاعب حسابي أو تضخيم لديون العملاء عبر مبالغ سداد سالبة.";
                }
                else
                {
                    result.Passed = false;
                    result.Observed = string.Format("فشل الحماية: ZeroRejected={0}, NegativeRejected={1}, Balance={2}",
                        zeroRejected, negativeRejected, checkCust != null ? checkCust.BalancePiasters : -1);
                    result.Details = "تم قبول مبالغ سداد غير صالحة مما سبب تشوهاً في مديونية العميل.";
                }
            }
            catch (Exception ex)
            {
                result.Passed = false;
                result.Observed = "استثناء أثناء الفحص: " + ex.Message;
                result.Details = ex.ToString();
            }

            return result;
        }

        /// <summary>
        /// TEST 5: Negative expense creation validation
        /// </summary>
        private static AuditTestCaseResult RunTest5_NegativeExpenseValidation()
        {
            var result = new AuditTestCaseResult();
            result.TestNumber = 105;
            result.TestCode = "DEEP-05";
            result.Title = "منع تسجيل مصاريف سالبة أو صفرية وحماية حسابات عهدة الكاشير";
            result.Expected = "رفض إدراج مصروف بقيمة سالبة أو صفر برمي استثناء صريح لمنع التلاعب بدرج الكاشير";

            try
            {
                bool negRejected = false;
                try
                {
                    var exp = new Expense
                    {
                        Id = "exp_neg_" + Guid.NewGuid().ToString("N").Substring(0, 8),
                        AmountPiasters = -15000,
                        Category = "إيجار",
                        BusinessDate = DateTime.Now.ToString("yyyy-MM-dd")
                    };
                    DatabaseService.ExpenseRepo.Insert(exp);
                }
                catch (ArgumentException)
                {
                    negRejected = true;
                }

                bool zeroRejected = false;
                try
                {
                    var expZero = new Expense
                    {
                        Id = "exp_zero_" + Guid.NewGuid().ToString("N").Substring(0, 8),
                        AmountPiasters = 0,
                        Category = "نثريات",
                        BusinessDate = DateTime.Now.ToString("yyyy-MM-dd")
                    };
                    DatabaseService.ExpenseRepo.Insert(expZero);
                }
                catch (ArgumentException)
                {
                    zeroRejected = true;
                }

                if (negRejected && zeroRejected)
                {
                    result.Passed = true;
                    result.Observed = "تم حظر المصروف السالب والصفري بنجاح على مستوى طبقة البيانات";
                    result.Details = "حماية مطلقة لحسابات المصروفات ومنع تضخيم رصيد النقدية المتوقع.";
                }
                else
                {
                    result.Passed = false;
                    result.Observed = string.Format("تم السماح بإدخال مصروفات غير صالحة: NegRejected={0}, ZeroRejected={1}", negRejected, zeroRejected);
                    result.Details = "طبقة قاعدة البيانات تسمح بقيم مصاريف سالبة تؤدي لإضافة كاش وهمي لدرج الوردية.";
                }
            }
            catch (Exception ex)
            {
                result.Passed = false;
                result.Observed = "استثناء أثناء الفحص: " + ex.Message;
                result.Details = ex.ToString();
            }

            return result;
        }

        /// <summary>
        /// TEST 6: Inventory Adjustment synchronizes variant table and parent rollup
        /// </summary>
        private static AuditTestCaseResult RunTest6_InventoryAdjustmentVariantAndParentSync()
        {
            var result = new AuditTestCaseResult();
            result.TestNumber = 106;
            result.TestCode = "DEEP-06";
            result.Title = "مزامنة رصيد المتغيرات والصنف الأب عند إجراء تسوية جردية يدوية (عجز أو زيادة)";
            result.Expected = "تحديث رصيد جدول product_variants وتجميع رصيد الصنف الأب في products تلقائياً عند تنفيذ AdjustStock";

            try
            {
                var cells = new List<VariantMatrixCell>();
                cells.Add(new VariantMatrixCell
                {
                    Size = "1 لتر",
                    Color = "مانجو",
                    PricePiasters = 3000,
                    CostPiasters = 2000,
                    StockQuantityMilli = 10000, // 10 units initial
                    IsEnabled = true
                });

                var request = new CreateVariantMatrixRequest
                {
                    ParentName = "عصير فواكه جرد " + Guid.NewGuid().ToString("N").Substring(0, 4),
                    DefaultPricePiasters = 3000,
                    DefaultCostPiasters = 2000,
                    Sizes = new List<string> { "1 لتر" },
                    Colors = new List<string> { "مانجو" },
                    MatrixCells = cells
                };

                var matrixResult = DatabaseService.ProductVariantRepo.CreateMatrix(request);
                string parentId = matrixResult.ParentProduct.Id;
                string varId = matrixResult.Variants[0].VariantProductId;

                // Perform inventory adjustment on variant: adjust from 10 units to 25 units (+15 units)
                DatabaseService.Inventory.AdjustStock(varId, 25000, "جرد سنوي - فائض غير مسجل", "usr_admin", "SURPLUS");

                var updatedVar = DatabaseService.ProductRepo.GetById(varId);
                var updatedParent = DatabaseService.ProductRepo.GetById(parentId);

                long pvTableStock = -1;
                using (var conn = new SQLiteConnection(DatabaseService.ConnectionString))
                {
                    conn.Open();
                    using (var cmd = new SQLiteCommand("SELECT stock_quantity_milli FROM product_variants WHERE variant_product_id = @vpid LIMIT 1;", conn))
                    {
                        cmd.Parameters.AddWithValue("@vpid", varId);
                        object val = cmd.ExecuteScalar();
                        if (val != null && val != DBNull.Value) pvTableStock = Convert.ToInt64(val);
                    }
                }

                long varStock = updatedVar != null ? updatedVar.StockQuantityMilli : -1;
                long parentStock = updatedParent != null ? updatedParent.StockQuantityMilli : -1;

                bool varOk = (varStock == 25000);
                bool pvOk = (pvTableStock == 25000);
                bool parentOk = (parentStock == 25000);

                if (varOk && pvOk && parentOk)
                {
                    result.Passed = true;
                    result.Observed = string.Format("تمت مزامنة التسوية الجردية: VarProd={0}, ProductVariantsTable={1}, ParentProd={2}", varStock, pvTableStock, parentStock);
                    result.Details = "التسوية الجردية قامت بتحديث جدول المتغيرات وتجميع الصنف الأب بالكامل.";
                }
                else
                {
                    result.Passed = false;
                    result.Observed = string.Format("عدم تطابق أرصدة التسوية: VarProd={0} (متوقع 25000), PvTable={1} (متوقع 25000), Parent={2} (متوقع 25000)", varStock, pvTableStock, parentStock);
                    result.Details = "فشلت التسوية الجردية في تحديث جدول product_variants أو تجميع الصنف الأب.";
                }
            }
            catch (Exception ex)
            {
                result.Passed = false;
                result.Observed = "استثناء أثناء الفحص: " + ex.Message;
                result.Details = ex.ToString();
            }

            return result;
        }

        /// <summary>
        /// TEST 7: Customer Advance Prepayment (Negative balance) and consuming it on credit sales
        /// </summary>
        private static AuditTestCaseResult RunTest7_CustomerAdvancePrepaymentAndCreditSale()
        {
            var result = new AuditTestCaseResult();
            result.TestNumber = 107;
            result.TestCode = "DEEP-07";
            result.Title = "سلامة السداد المسبق (رصيد دائن لصالح العميل) واستهلاكه الآلي في المبيعات الآجلة";
            result.Expected = "قبول السداد تحت الحساب (رصيد سالب/دائن لصالح العميل) وخصم المشتريات الآجلة اللاحقة منه بدقة دون أخطاء";

            try
            {
                var cust = new Customer
                {
                    Id = "cust_adv_" + Guid.NewGuid().ToString("N").Substring(0, 8),
                    Name = "عميل سداد مسبق وتحت الحساب",
                    Phone = "0111" + Math.Abs(Guid.NewGuid().GetHashCode()).ToString("D7"),
                    BalancePiasters = 2000 // owes 20.00 EGP
                };
                DatabaseService.CustomerRepo.SaveCustomer(cust);

                // Customer pays 50.00 EGP (overpayment of 30.00 EGP in their favor)
                DatabaseService.CustomerRepo.RecordPayment(cust.Id, 5000, "سداد بالزيادة تحت الحساب");

                var custAfterPay = DatabaseService.CustomerRepo.GetById(cust.Id);
                long balAfterPay = custAfterPay != null ? custAfterPay.BalancePiasters : 0;
                bool advanceCreditRecorded = (balAfterPay == -3000); // Customer is owed 30.00 EGP

                // Create a product for sale
                string pId = "prod_adv_" + Guid.NewGuid().ToString("N").Substring(0, 8);
                var prod = new Product
                {
                    Id = pId,
                    Name = "سلعة استهلاك رصيد مسبق " + Guid.NewGuid().ToString("N").Substring(0, 4),
                    Barcode = GenerateUniqueBarcode(),
                    PricePiasters = 2000, // 20.00 EGP
                    CostPiasters = 1200,
                    StockQuantityMilli = 50000,
                    IsActive = true
                };
                DatabaseService.Products.SaveProduct(prod);

                // Make a credit sale of 20.00 EGP (Paid = 0) against this customer
                var sale = new Sale
                {
                    Id = "sale_adv_" + Guid.NewGuid().ToString("N").Substring(0, 8),
                    CustomerId = cust.Id,
                    TotalPiasters = 2000,
                    PaidPiasters = 0, // on account
                    PaymentMethod = "credit",
                    Status = "completed",
                    CreatedAt = DateTime.UtcNow.ToString("o"),
                    Items = new List<SaleItem>
                    {
                        new SaleItem
                        {
                            Id = "si_adv_" + Guid.NewGuid().ToString("N").Substring(0, 8),
                            ProductId = pId,
                            ProductName = prod.Name,
                            QuantityMilli = 1000,
                            UnitPricePiasters = 2000,
                            TotalPiasters = 2000
                        }
                    }
                };

                DatabaseService.Sales.ProcessSale(sale);

                // Balance should now be: -3000 + 2000 = -1000 (-10.00 EGP remaining in customer favor)
                var custAfterSale = DatabaseService.CustomerRepo.GetById(cust.Id);
                long balAfterSale = custAfterSale != null ? custAfterSale.BalancePiasters : 999;
                bool advanceCreditConsumed = (balAfterSale == -1000);

                if (advanceCreditRecorded && advanceCreditConsumed)
                {
                    result.Passed = true;
                    result.Observed = string.Format("تم احتساب الرصيد الدائن بدقة: بعد السداد={0} قرش، بعد الشراء الآجل={1} قرش", balAfterPay, balAfterSale);
                    result.Details = "النظام يدعم الأرصدة الدائنة المسبقة للعملاء واستهلاكها المحاسبي السليم.";
                }
                else
                {
                    result.Passed = false;
                    result.Observed = string.Format("خلل في الرصيد الدائن: بعد السداد={0} (متوقع -3000)، بعد الشراء={1} (متوقع -1000)", balAfterPay, balAfterSale);
                    result.Details = "فشل النظام في معالجة رصيد العميل الدائن أو حسابه في دفتر الأستاذ.";
                }
            }
            catch (Exception ex)
            {
                result.Passed = false;
                result.Observed = "استثناء أثناء الفحص: " + ex.Message;
                result.Details = ex.ToString();
            }

            return result;
        }

        /// <summary>
        /// TEST 8: Purchase invoice discount validation (Negative discount & Discount exceeding invoice total)
        /// </summary>
        private static AuditTestCaseResult RunTest8_PurchaseDiscountExceedingCostAndNegativeDiscount()
        {
            var result = new AuditTestCaseResult();
            result.TestNumber = 108;
            result.TestCode = "DEEP-08";
            result.Title = "سلامة خصومات فواتير الشراء ومنع الخصم السالب أو تجاوز إجمالي التكلفة";
            result.Expected = "منع الخصم السالب والخصم المتجاوز لإجمالي الفاتورة لحماية تكاليف المخزون من التضخم أو الخلل";

            try
            {
                string pId = "prod_disc_" + Guid.NewGuid().ToString("N").Substring(0, 8);
                var prod = new Product
                {
                    Id = pId,
                    Name = "منتج اختبار خصم المشتريات " + Guid.NewGuid().ToString("N").Substring(0, 4),
                    Barcode = GenerateUniqueBarcode(),
                    PricePiasters = 10000,
                    CostPiasters = 6000,
                    StockQuantityMilli = 10000,
                    IsActive = true
                };
                DatabaseService.Products.SaveProduct(prod);

                // Case 1: Negative discount on purchase invoice
                bool negDiscountRejected = false;
                try
                {
                    var pNeg = new Purchase
                    {
                        Id = "pur_negd_" + Guid.NewGuid().ToString("N").Substring(0, 8),
                        InvoiceDate = DateTime.Now.ToString("yyyy-MM-dd"),
                        DiscountPiasters = -5000, // Negative discount
                        PaidAmountPiasters = 6000,
                        CreatedAt = DateTime.UtcNow.ToString("o"),
                        UpdatedAt = DateTime.UtcNow.ToString("o"),
                        Items = new List<PurchaseItem>
                        {
                            new PurchaseItem
                            {
                                Id = "pi_negd_" + Guid.NewGuid().ToString("N").Substring(0, 8),
                                ProductId = pId,
                                ProductName = prod.Name,
                                QuantityMilli = 1000,
                                UnitCostPiasters = 6000,
                                TotalCostPiasters = 6000
                            }
                        }
                    };

                    DatabaseService.PurchaseRepo.CreatePurchase(pNeg);
                }
                catch (ArgumentException)
                {
                    negDiscountRejected = true;
                }

                // Case 2: Discount exceeding invoice total should be rejected or clamped to total cost
                bool excessDiscountHandled = false;
                try
                {
                    var pExcess = new Purchase
                    {
                        Id = "pur_excd_" + Guid.NewGuid().ToString("N").Substring(0, 8),
                        InvoiceDate = DateTime.Now.ToString("yyyy-MM-dd"),
                        DiscountPiasters = 100000, // 1000 EGP discount on a 60 EGP purchase
                        PaidAmountPiasters = 0,
                        CreatedAt = DateTime.UtcNow.ToString("o"),
                        UpdatedAt = DateTime.UtcNow.ToString("o"),
                        Items = new List<PurchaseItem>
                        {
                            new PurchaseItem
                            {
                                Id = "pi_excd_" + Guid.NewGuid().ToString("N").Substring(0, 8),
                                ProductId = pId,
                                ProductName = prod.Name,
                                QuantityMilli = 1000,
                                UnitCostPiasters = 6000,
                                TotalCostPiasters = 6000
                            }
                        }
                    };

                    var saved = DatabaseService.PurchaseRepo.CreatePurchase(pExcess);
                    // If accepted, NetCost must not be negative
                    excessDiscountHandled = (saved != null && saved.NetCostPiasters >= 0);
                }
                catch (ArgumentException)
                {
                    // Throwing ArgumentException for discount exceeding total is also valid
                    excessDiscountHandled = true;
                }

                if (negDiscountRejected && excessDiscountHandled)
                {
                    result.Passed = true;
                    result.Observed = "تم حظر الخصم السالب بنجاح وضمان عدم تحول صافي التكلفة إلى قيمة سالبة";
                    result.Details = "حماية كاملة لقواعد احتساب خصومات المشتريات وصافي الفاتورة.";
                }
                else
                {
                    result.Passed = false;
                    result.Observed = string.Format("فشل معالجة الخصم: NegDiscountRejected={0}, ExcessDiscountHandled={1}", negDiscountRejected, excessDiscountHandled);
                    result.Details = "سمح النظام بخصم سالب زاد من تكلفة الفاتورة بشكل وهمي أو سمح بصافي تكلفة سالب.";
                }
            }
            catch (Exception ex)
            {
                result.Passed = false;
                result.Observed = "استثناء أثناء الفحص: " + ex.Message;
                result.Details = ex.ToString();
            }

            return result;
        }

        /// <summary>
        /// TEST 9: Advance Credit (تحت الحساب) integrity for Customers & Suppliers - Drawer reconciliation and Analytics Exposure
        /// </summary>
        private static AuditTestCaseResult RunTest9_AdvanceCreditDrawerAndAnalyticsIntegrity()
        {
            var result = new AuditTestCaseResult();
            result.TestNumber = 109;
            result.TestCode = "DEEP-09";
            result.Title = "سلامة أموال تحت الحساب (أمانات العملاء ومقدمات الموردين) وعدم التسبب بعجز نقدي والظهور في التحليلات";
            result.Expected = "تطابق نقدية الدرج مع الفعلي بنسبة 100% عند تحصيل مبالغ بالزيادة أو الشراء من الرصيد الدائن، وظهور أرصدة تحت الحساب بدقة في تحليلات العملاء والمشتريات";

            try
            {
                string bdate = DatabaseService.DailyClosing.GetCurrentBusinessDate();
                long initialDrawerCash = DatabaseService.DailyClosing.GetClosingPreview(bdate).ExpectedCashPiasters;

                // 1. Customer Overpayment & Drawer Verification
                string custId = "cust_adv_" + Guid.NewGuid().ToString("N").Substring(0, 8);
                var cust = new Customer
                {
                    Id = custId,
                    Name = "عميل اختبار تحت الحساب " + Guid.NewGuid().ToString("N").Substring(0, 4),
                    Phone = "01099998888",
                    BalancePiasters = 0
                };
                DatabaseService.CustomerRepo.SaveCustomer(cust);

                string pId = "prod_adv_" + Guid.NewGuid().ToString("N").Substring(0, 8);
                var prod = new Product
                {
                    Id = pId,
                    Name = "منتج اختبار تحت الحساب",
                    Barcode = GenerateUniqueBarcode(),
                    PricePiasters = 10000, // 100 EGP
                    CostPiasters = 5000,
                    StockQuantityMilli = 50000,
                    IsActive = true
                };
                DatabaseService.Products.SaveProduct(prod);

                // Sale 1: Total 100 EGP, Paid 130 EGP cash. 30 EGP kept under account ("تحت الحساب")
                var sale1 = new Sale
                {
                    Id = "sale_adv_1_" + Guid.NewGuid().ToString("N").Substring(0, 8),
                    CustomerId = custId,
                    TotalPiasters = 10000,
                    DiscountPiasters = 0,
                    PaidPiasters = 13000, // Overpayment of 30 EGP
                    PaymentMethod = "cash",
                    Status = "completed",
                    CreatedAt = DateTime.UtcNow.ToString("o"),
                    Items = new List<SaleItem>
                    {
                        new SaleItem
                        {
                            Id = "si_adv_1_" + Guid.NewGuid().ToString("N").Substring(0, 8),
                            ProductId = pId,
                            ProductName = prod.Name,
                            QuantityMilli = 1000,
                            UnitPricePiasters = 10000,
                            TotalPiasters = 10000
                        }
                    }
                };
                DatabaseService.Sales.ProcessSale(sale1);

                // Check Customer Balance: should be -3000 (-30 EGP credit)
                var custAfterSale1 = DatabaseService.CustomerRepo.GetById(custId);
                bool custCreditSaved = (custAfterSale1 != null && custAfterSale1.BalancePiasters == -3000);

                // Check Drawer Cash: ExpectedCash must have increased by exactly 13000 (actual cash received)
                long drawerAfterSale1 = DatabaseService.DailyClosing.GetClosingPreview(bdate).ExpectedCashPiasters;
                bool drawerReconciledAfterSale1 = (drawerAfterSale1 == initialDrawerCash + 13000);

                // Product 2: Price 20 EGP (2000 piasters)
                string p2Id = "prod_adv_2_" + Guid.NewGuid().ToString("N").Substring(0, 8);
                var prod2 = new Product
                {
                    Id = p2Id,
                    Name = "منتج اختبار تحت الحساب 2",
                    Barcode = GenerateUniqueBarcode(),
                    PricePiasters = 2000, // 20 EGP
                    CostPiasters = 1000,
                    StockQuantityMilli = 50000,
                    IsActive = true
                };
                DatabaseService.Products.SaveProduct(prod2);

                // Sale 2: Customer buys 20 EGP (2000 piasters) from their advance credit
                var sale2 = new Sale
                {
                    Id = "sale_adv_2_" + Guid.NewGuid().ToString("N").Substring(0, 8),
                    CustomerId = custId,
                    TotalPiasters = 2000,
                    DiscountPiasters = 0,
                    PaidPiasters = 0, // Deducted from advance credit
                    PaymentMethod = "credit",
                    Status = "completed",
                    CreatedAt = DateTime.UtcNow.ToString("o"),
                    Items = new List<SaleItem>
                    {
                        new SaleItem
                        {
                            Id = "si_adv_2_" + Guid.NewGuid().ToString("N").Substring(0, 8),
                            ProductId = p2Id,
                            ProductName = prod2.Name,
                            QuantityMilli = 1000,
                            UnitPricePiasters = 2000,
                            TotalPiasters = 2000
                        }
                    }
                };
                DatabaseService.Sales.ProcessSale(sale2);

                // Customer Balance after Sale 2: -3000 + 2000 = -1000 (-10 EGP credit remaining)
                var custAfterSale2 = DatabaseService.CustomerRepo.GetById(custId);
                bool custCreditConsumed = (custAfterSale2 != null && custAfterSale2.BalancePiasters == -1000);

                // Drawer Cash after Sale 2: MUST NOT change (no cash entered the drawer)
                long drawerAfterSale2 = DatabaseService.DailyClosing.GetClosingPreview(bdate).ExpectedCashPiasters;
                bool drawerUnchangedAfterCreditSale = (drawerAfterSale2 == drawerAfterSale1);

                // 2. Customer Analytics Credit Verification
                var creditReport = DatabaseService.Reports.GetCreditOverview("month", null, null);
                bool creditReportAccurate = (creditReport != null && creditReport.TotalCustomerCreditsPiasters >= 1000 && creditReport.CreditorsCount >= 1);

                // 3. Supplier Advance & Purchase Deduction Verification
                var sup = new Supplier
                {
                    Name = "مورد اختبار تحت الحساب " + Guid.NewGuid().ToString("N").Substring(0, 4),
                    Phone = "01122334455",
                    BalancePiasters = 0,
                    IsActive = true
                };
                var savedSup = DatabaseService.SupplierRepo.Save(sup);
                string supId = savedSup.Id;

                // Store pays advance to supplier of 50 EGP (5000 piasters)
                DatabaseService.SupplierRepo.RecordPayment(supId, 5000, "دفعة مقدمة تحت الحساب للمورد");
                var supAfterAdvance = DatabaseService.SupplierRepo.GetById(supId);
                bool supAdvanceRecorded = (supAfterAdvance != null && supAfterAdvance.BalancePiasters == -5000);

                // Store purchases goods worth 30 EGP (3000 piasters) with 0 paid amount (deducted from advance)
                var purchase = new Purchase
                {
                    Id = "pur_adv_" + Guid.NewGuid().ToString("N").Substring(0, 8),
                    SupplierId = supId,
                    InvoiceDate = DateTime.Now.ToString("yyyy-MM-dd"),
                    DiscountPiasters = 0,
                    PaidAmountPiasters = 0,
                    CreatedAt = DateTime.UtcNow.ToString("o"),
                    UpdatedAt = DateTime.UtcNow.ToString("o"),
                    Items = new List<PurchaseItem>
                    {
                        new PurchaseItem
                        {
                            Id = "pi_adv_" + Guid.NewGuid().ToString("N").Substring(0, 8),
                            ProductId = pId,
                            ProductName = prod.Name,
                            QuantityMilli = 1000,
                            UnitCostPiasters = 3000,
                            TotalCostPiasters = 3000
                        }
                    }
                };
                DatabaseService.PurchaseRepo.CreatePurchase(purchase);

                // Supplier balance should now be: -5000 + 3000 = -2000 (-20 EGP advance credit remaining in our favor)
                var supAfterPurchase = DatabaseService.SupplierRepo.GetById(supId);
                bool supAdvanceOffset = (supAfterPurchase != null && supAfterPurchase.BalancePiasters == -2000);

                // 4. Supplier Analytics Verification
                var purReport = DatabaseService.Reports.GetPurchaseAnalysis("month", null, null);
                bool purReportAccurate = (purReport != null && purReport.TotalSupplierCreditsPiasters >= 2000 && purReport.CreditorSuppliersCount >= 1);

                if (custCreditSaved && drawerReconciledAfterSale1 && custCreditConsumed &&
                    drawerUnchangedAfterCreditSale && creditReportAccurate &&
                    supAdvanceRecorded && supAdvanceOffset && purReportAccurate)
                {
                    result.Passed = true;
                    result.Observed = string.Format("تطابق تام ومحاسبة منضبطة: رصيد العميل دائن ({0} قرش)، نقدية الدرج مطابقة تماماً، رصيد المورد دائن لصالحنا ({1} قرش)، وتقارير التحليلات عكست الأرصدة بدقة.",
                        custAfterSale2 != null ? custAfterSale2.BalancePiasters : 0,
                        supAfterPurchase != null ? supAfterPurchase.BalancePiasters : 0);
                    result.Details = "نظام الأمانات ومقدمات تحت الحساب يعمل بدون أي عجز نقدي في الدرج ومعزول محاسبياً ومعروض في التحليلات.";
                }
                else
                {
                    result.Passed = false;
                    result.Observed = string.Format("فشل الفحص: CustCreditSaved={0}, DrawerReconciled1={1}, CustCreditConsumed={2}, DrawerUnchanged={3}, CreditReportAccurate={4}, SupAdvanceRecorded={5}, SupAdvanceOffset={6}, PurReportAccurate={7}",
                        custCreditSaved, drawerReconciledAfterSale1, custCreditConsumed, drawerUnchangedAfterCreditSale,
                        creditReportAccurate, supAdvanceRecorded, supAdvanceOffset, purReportAccurate);
                    result.Details = "حدث خلل في احتساب رصيد تحت الحساب أو نقدية الدرج أو تقارير التحليلات.";
                }
            }
            catch (Exception ex)
            {
                result.Passed = false;
                result.Observed = "استثناء أثناء الفحص: " + ex.Message;
                result.Details = ex.ToString();
            }

            return result;
        }
    }
}
