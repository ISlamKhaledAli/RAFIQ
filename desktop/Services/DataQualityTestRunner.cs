using System;
using System.Collections.Generic;
using System.Data.SQLite;
using System.IO;
using RafiqPOS.Bridge;
using RafiqPOS.Common;
using RafiqPOS.Database;
using RafiqPOS.Models;
using RafiqPOS.Repositories;

namespace RafiqPOS.Services
{
    public class DataQualityTestResult
    {
        public bool Success { get; set; }
        public string Message { get; set; }
        public int TotalAssertions { get; set; }
        public int PassedAssertions { get; set; }
    }

    /// <summary>
    /// اختبارات فحص جودة وصحة بيانات المخزون والأصناف (Feature #117 / Task 117-3)
    /// </summary>
    public static class DataQualityTestRunner
    {
        public static DataQualityTestResult RunAllTests()
        {
            var result = new DataQualityTestResult
            {
                Success = true,
                TotalAssertions = 0,
                PassedAssertions = 0
            };

            string tempDbPath = Path.Combine(Path.GetTempPath(), "rafiq_data_quality_test_" + Guid.NewGuid().ToString("N") + ".db");
            string tempConnStr = string.Format("Data Source={0};Version=3;BusyTimeout=5000;", tempDbPath);

            try
            {
                // 1. Initialize DB schema
                MigrationRunner.ApplyMigrations(tempConnStr, tempDbPath);
                Assert(File.Exists(tempDbPath), "تم إنشاء قاعدة بيانات اختبار جودة البيانات بنجاح", result);

                var auditRepo = new AuditLogRepository(tempConnStr);
                var productRepo = new ProductRepository(tempConnStr, auditRepo);
                var smRepo = new StockMovementRepository(tempConnStr);
                var priceHistoryRepo = new ProductPriceHistoryRepository(tempConnStr);
                var productService = new ProductService(productRepo, auditRepo, priceHistoryRepo, smRepo);
                var reportsService = new ReportsService(tempConnStr);

                string dairyCatId = "cat_dairy";

                // 2. Insert Seed Products with different data conditions
                // Product 1: Perfect healthy product
                var p1 = new Product
                {
                    Id = "p_clean_1",
                    Name = "حليب كامل الدسم 1 لتر",
                    Barcode = "622100000001",
                    CategoryId = dairyCatId,
                    CostPiasters = 2500,
                    PricePiasters = 3200,
                    StockQuantityMilli = 15000,
                    MinStockQuantityMilli = 5000,
                    Unit = "piece",
                    IsActive = true
                };
                productService.SaveProduct(p1);

                // Product 2: Missing Cost (cost = 0)
                var p2 = new Product
                {
                    Id = "p_no_cost_2",
                    Name = "جبنة بيضاء فيتا 500 جم",
                    Barcode = "622100000002",
                    CategoryId = dairyCatId,
                    CostPiasters = 0,
                    PricePiasters = 1800,
                    StockQuantityMilli = 8000,
                    MinStockQuantityMilli = 2000,
                    Unit = "piece",
                    IsActive = true
                };
                productService.SaveProduct(p2);

                // Product 3: Missing Barcode (barcode empty, no secondary barcodes)
                var p3 = new Product
                {
                    Id = "p_no_barcode_3",
                    Name = "مخلل مشكل بلدي",
                    Barcode = "",
                    CategoryId = dairyCatId,
                    CostPiasters = 1200,
                    PricePiasters = 2000,
                    StockQuantityMilli = 6000,
                    MinStockQuantityMilli = 1000,
                    Unit = "kg",
                    IsActive = true
                };
                productService.SaveProduct(p3);

                // Product 4: Missing / Unassigned Category (cat_general)
                var p4 = new Product
                {
                    Id = "p_no_cat_4",
                    Name = "شاي أحمر خرز 100 جم",
                    Barcode = "622100000004",
                    CategoryId = "cat_general",
                    CostPiasters = 1400,
                    PricePiasters = 1800,
                    StockQuantityMilli = 20000,
                    MinStockQuantityMilli = 5000,
                    Unit = "piece",
                    IsActive = true
                };
                productService.SaveProduct(p4);

                // Product 5: Duplicate Barcode Collision (Matches Product 1: 622100000001 via secondary barcode)
                var p5 = new Product
                {
                    Id = "p_dup_barcode_5",
                    Name = "حليب خالي الدسم 1 لتر",
                    Barcode = "622100000005",
                    CategoryId = dairyCatId,
                    CostPiasters = 2600,
                    PricePiasters = 3300,
                    StockQuantityMilli = 10000,
                    MinStockQuantityMilli = 3000,
                    Unit = "piece",
                    IsActive = true
                };
                productService.SaveProduct(p5);

                using (var conn = new System.Data.SQLite.SQLiteConnection(tempConnStr))
                {
                    conn.Open();
                    string insertPuSql = @"
                        INSERT INTO product_units (id, product_id, unit_name, conversion_factor, is_base_unit, sell_price_piasters, cost_price_piasters, barcode, is_divisible, sort_order, created_at, updated_at)
                        VALUES ('pu_test_dup', 'p_dup_barcode_5', 'علبة كرتون', 12, 0, 39600, 31200, '622100000001', 0, 1, datetime('now'), datetime('now'));
                    ";
                    using (var cmd = new System.Data.SQLite.SQLiteCommand(insertPuSql, conn))
                    {
                        cmd.ExecuteNonQuery();
                    }
                }

                // Product 6: Negative Stock (-4000 milli)
                var p6 = new Product
                {
                    Id = "p_neg_stock_6",
                    Name = "زبادي سادة 105 جم",
                    Barcode = "622100000006",
                    CategoryId = dairyCatId,
                    CostPiasters = 500,
                    PricePiasters = 700,
                    StockQuantityMilli = -4000, // Negative!
                    MinStockQuantityMilli = 2000,
                    Unit = "piece",
                    IsActive = true
                };
                productService.SaveProduct(p6);

                // Product 7: Price Below Cost (cost 4000 > price 3000)
                var p7 = new Product
                {
                    Id = "p_below_cost_7",
                    Name = "زبدة طبيعي مستوردة 1 كجم",
                    Barcode = "622100000007",
                    CategoryId = dairyCatId,
                    CostPiasters = 4000, // Cost 40 LE
                    PricePiasters = 3000, // Price 30 LE -> Loss of 10 LE
                    StockQuantityMilli = 5000,
                    MinStockQuantityMilli = 1000,
                    Unit = "kg",
                    IsActive = true
                };
                // confirmBelowCost = true allows saving
                productService.SaveProduct(p7, false, true);

                // Product 8: Missing Selling Price (price = 0)
                var p8 = new Product
                {
                    Id = "p_no_price_8",
                    Name = "لبان نعناع عبوة توفير",
                    Barcode = "622100000008",
                    CategoryId = dairyCatId,
                    CostPiasters = 500,
                    PricePiasters = 0, // Zero selling price!
                    StockQuantityMilli = 12000,
                    MinStockQuantityMilli = 2000,
                    Unit = "piece",
                    IsActive = true
                };
                productService.SaveProduct(p8, false, true);

                // Product 9: Orphan Product (points to non-existent category)
                var p9 = new Product
                {
                    Id = "p_orphan_cat_9",
                    Name = "حلوى جيلي مستوردة",
                    Barcode = "622100000009",
                    CategoryId = "cat_non_existent_99",
                    CostPiasters = 800,
                    PricePiasters = 1200,
                    StockQuantityMilli = 5000,
                    MinStockQuantityMilli = 1000,
                    Unit = "piece",
                    IsActive = true
                };
                productService.SaveProduct(p9);

                // Product 10: Orphan Variant (points to non-existent parent product)
                using (var conn = new System.Data.SQLite.SQLiteConnection(tempConnStr))
                {
                    conn.Open();
                    string insertOrphanVariantSql = @"
                        INSERT INTO products (id, barcode, name, category_id, price_piasters, cost_piasters, stock_quantity_milli, unit, is_active, parent_id, created_at, updated_at)
                        VALUES ('p_orphan_var_10', '622100000010', 'قميص قطن رجالي - أحمر XL', @catId, 25000, 18000, 4000, 'piece', 1, 'p_deleted_parent_xyz', datetime('now'), datetime('now'));
                    ";
                    using (var cmd = new System.Data.SQLite.SQLiteCommand(insertOrphanVariantSql, conn))
                    {
                        cmd.Parameters.AddWithValue("@catId", dairyCatId);
                        cmd.ExecuteNonQuery();
                    }

                    // Incomplete Invoice: Completed sale with 0 sale items
                    string insertIncompleteSaleSql = @"
                        INSERT INTO sales (id, invoice_number, subtotal_piasters, discount_piasters, tax_piasters, total_piasters, paid_piasters, status, payment_method, is_deleted, created_at)
                        VALUES ('s_incomplete_empty_1', 9901, 4500, 0, 0, 4500, 4500, 'completed', 'cash', 0, datetime('now'));
                    ";
                    using (var cmd = new System.Data.SQLite.SQLiteCommand(insertIncompleteSaleSql, conn))
                    {
                        cmd.ExecuteNonQuery();
                    }

                    // Suspended Transaction: Stale held sale older than 24 hours
                    string insertStaleHeldSql = @"
                        INSERT INTO held_sales (id, hold_label, customer_id, customer_name, items_count, subtotal_piasters, discount_piasters, total_piasters, cart_json, notes, cashier_id, created_at)
                        VALUES ('h_stale_held_1', 'عميل طاولة 5 قديمة', NULL, NULL, 2, 6000, 0, 6000, '[]', 'معلقة', 'usr_admin', datetime('now', '-36 hours'));
                    ";
                    using (var cmd = new System.Data.SQLite.SQLiteCommand(insertStaleHeldSql, conn))
                    {
                        cmd.ExecuteNonQuery();
                    }

                    // Accounting Imbalance: Customer balance altered without corresponding ledger entries
                    string insertCustImbalanceSql = @"
                        INSERT INTO customers (id, name, phone, balance_piasters, credit_limit_piasters, created_at)
                        VALUES ('cust_imbalanced_1', 'العميل محمد توفيق', '01012345678', 15000, 50000, datetime('now'));

                        -- Ledger only contains 9000 piasters (Discrepancy: 6000 piasters)
                        INSERT INTO customer_ledger (id, customer_id, type, amount_piasters, balance_after_piasters, notes, created_at)
                        VALUES ('cl_test_1', 'cust_imbalanced_1', 'sale', 9000, 9000, 'فاتورة آجلة', datetime('now'));
                    ";
                    using (var cmd = new System.Data.SQLite.SQLiteCommand(insertCustImbalanceSql, conn))
                    {
                        cmd.ExecuteNonQuery();
                    }
                }

                // 3. Run Data Quality Audit Report (Task 117-1)
                var report = reportsService.GetDataQualityReport();

                Assert(report != null, "تقرير جودة البيانات ليس فارغاً (null)", result);
                Assert(report.TotalProductsAudited >= 10, "تم فحص كافة الأصناف النشطة العشرة بدقة", result);

                // Check Missing Cost detection
                Assert(report.MissingCostCount >= 1, "تم اكتشاف الأصناف بدون تكلفة بنجاح", result);
                bool foundMissingCostP2 = false;
                foreach (var issue in report.Issues)
                {
                    if (issue.ProductId == "p_no_cost_2" && issue.IssueType == "missing_cost")
                    {
                        foundMissingCostP2 = true;
                        break;
                    }
                }
                Assert(foundMissingCostP2, "تم تحديد الصنف p_no_cost_2 كصنف بدون تكلفة", result);

                // Check Missing Selling Price detection
                Assert(report.MissingPriceCount >= 1, "تم اكتشاف الأصناف بدون سعر بيع بنجاح", result);
                bool foundMissingPriceP8 = false;
                foreach (var issue in report.Issues)
                {
                    if (issue.ProductId == "p_no_price_8" && issue.IssueType == "missing_price")
                    {
                        foundMissingPriceP8 = true;
                        Assert(issue.Severity == "critical", "درجة خطورة انعدام سعر البيع حرجة", result);
                        break;
                    }
                }
                Assert(foundMissingPriceP8, "تم تحديد الصنف p_no_price_8 كصنف بدون سعر بيع", result);

                // Check Orphan Product detection
                Assert(report.OrphanProductCount >= 2, "تم اكتشاف الأصناف والمتغيرات اليتيمة بنجاح", result);
                bool foundOrphanCatP9 = false;
                bool foundOrphanVarP10 = false;
                foreach (var issue in report.Issues)
                {
                    if (issue.ProductId == "p_orphan_cat_9" && issue.IssueType == "orphan_product")
                    {
                        foundOrphanCatP9 = true;
                    }
                    if (issue.ProductId == "p_orphan_var_10" && issue.IssueType == "orphan_product")
                    {
                        foundOrphanVarP10 = true;
                    }
                }
                Assert(foundOrphanCatP9, "تم تحديد الصنف p_orphan_cat_9 كصنف يتيم ذو تصنيف محذوف", result);
                Assert(foundOrphanVarP10, "تم تحديد المتغير p_orphan_var_10 كمتغير يتيم ذو صنف أساسي محذوف", result);

                // Check Incomplete Invoice detection
                Assert(report.IncompleteInvoicesCount >= 1, "تم اكتشاف الفواتير غير المكتملة بدون بنود بنجاح", result);
                bool foundIncompleteSale = false;
                foreach (var issue in report.Issues)
                {
                    if (issue.ProductId == "s_incomplete_empty_1" && issue.IssueType == "incomplete_sale")
                    {
                        foundIncompleteSale = true;
                        Assert(issue.Severity == "critical", "درجة خطورة الفاتورة غير المكتملة حرجة", result);
                        break;
                    }
                }
                Assert(foundIncompleteSale, "تم تحديد الفاتورة s_incomplete_empty_1 كفاتورة فارغة غير مكتملة", result);

                // Check Suspended Transactions detection
                Assert(report.SuspendedTransactionsCount >= 1, "تم اكتشاف العمليات المعلقة القديمة بنجاح", result);
                bool foundStaleHeld = false;
                foreach (var issue in report.Issues)
                {
                    if (issue.ProductId == "h_stale_held_1" && issue.IssueType == "stale_held_sale")
                    {
                        foundStaleHeld = true;
                        break;
                    }
                }
                Assert(foundStaleHeld, "تم تحديد السلة المعلقة h_stale_held_1 كعملية معلقة قديمة", result);

                // Check Accounting Imbalance detection
                Assert(report.AccountingImbalanceCount >= 1, "تم اكتشاف خلل التوازن المحاسبي بين رصيد العميل وكشف الحساب بنجاح", result);
                bool foundCustImbalance = false;
                foreach (var issue in report.Issues)
                {
                    if (issue.ProductId == "cust_imbalanced_1" && issue.IssueType == "accounting_imbalance")
                    {
                        foundCustImbalance = true;
                        Assert(issue.Severity == "critical", "درجة خطورة خلل المعادلة المحاسبية حرجة (critical)", result);
                        break;
                    }
                }
                Assert(foundCustImbalance, "تم تحديد العميل cust_imbalanced_1 كحساب غير متوازن دفترية ومحاسبياً", result);

                // 4. Test Accounting Reconciliation & Data Quality Repair
                var repairResult = reportsService.RepairDataQualityIssues();
                Assert(repairResult != null, "نتيجة التسوية المحاسبية ليست فارغة", result);
                Assert(repairResult.Success, "عملية التسوية والمعالجة المحاسبية التلقائية تمت بنجاح", result);
                Assert(repairResult.RepairedInvoicesCount >= 1, "تم تصحيح وإلغاء الفواتير الفارغة بنجاح", result);
                Assert(repairResult.ReassignedOrphanProductsCount >= 1, "تمت إعادة ربط الأصناف اليتيمة بالتصنيف العام بنجاح", result);
                Assert(repairResult.ReconciledCustomersCount >= 1, "تمت تسوية حساب العميل ومطابقة رصيده مع كشف الحساب بنجاح", result);

                // Verify customer balance in database is now exactly 9000 piasters (realigned to ledger truth)
                using (var conn = new System.Data.SQLite.SQLiteConnection(tempConnStr))
                {
                    conn.Open();
                    using (var cmd = new System.Data.SQLite.SQLiteCommand("SELECT balance_piasters FROM customers WHERE id = 'cust_imbalanced_1';", conn))
                    {
                        long realignedBal = Convert.ToInt64(cmd.ExecuteScalar());
                        Assert(realignedBal == 9000, "رصيد العميل تمت مطابقته وتصحيحه محاسبياً ليتطابق تماماً مع كشف الحساب (9000 قرش)", result);
                    }

                    // Verify the empty sale status is now cancelled
                    using (var cmd = new SQLiteCommand("SELECT status FROM sales WHERE id = 's_incomplete_empty_1';", conn))
                    {
                        string saleStatus = cmd.ExecuteScalar().ToString();
                        Assert(saleStatus == "cancelled", "تم تغيير حالة الفاتورة غير المكتملة إلى cancelled لحماية التقارير المالية", result);
                    }
                }

                // Re-run report after repair and ensure resolved anomalies are cleared
                var reportAfterRepair = reportsService.GetDataQualityReport();
                Assert(reportAfterRepair.IncompleteInvoicesCount == 0, "لا توجد أي فواتير فارغة غير مكتملة بعد المعالجة", result);
                Assert(reportAfterRepair.AccountingImbalanceCount == 0, "لا يوجد أي خلل محاسبي في أرصدة العملاء بعد المعالجة", result);

                // 5. Test IPC Bridge Dispatcher & RBAC Enforcement
                var origUser = SecurityService.CurrentUser;
                try
                {
                    var bridgeReq = new BridgeRequest
                    {
                        Id = "req_dq_test",
                        Action = "reports:getDataQuality",
                        Payload = null
                    };

                    // Verify cashier is rejected (Rule 8 RBAC)
                    var cashierUser = new UserDto { Id = "cashier_dq_test", Username = "cashier", Role = "cashier", IsActive = true };
                    SecurityService.SetCurrentUserForTesting(cashierUser);
                    var rejectedResponse = IpcDispatcher.Dispatch(bridgeReq);
                    Assert(rejectedResponse != null && !rejectedResponse.Success, "تم حجب فحص جودة البيانات عن الكاشير بنجاح (RBAC Enforced)", result);

                    // Verify admin is authorized
                    var adminUser = new UserDto { Id = "admin_dq_test", Username = "admin", Role = "admin", IsActive = true };
                    SecurityService.SetCurrentUserForTesting(adminUser);

                    var dispatchResponse = IpcDispatcher.Dispatch(bridgeReq);
                    Assert(dispatchResponse != null, "استجابة IPC Dispatcher لفحص جودة البيانات ليست فارغة", result);
                    Assert(dispatchResponse.Success, "استجابة IPC Dispatcher ناجحة (Success = true)", result);
                    Assert(dispatchResponse.Data != null, "استجابة IPC تحتوي على كائن التقرير (Data != null)", result);

                    var bridgeRepairReq = new BridgeRequest
                    {
                        Id = "req_dq_repair_test",
                        Action = "reports:repairDataQuality",
                        Payload = null
                    };

                    var dispatchRepairResponse = IpcDispatcher.Dispatch(bridgeRepairReq);
                    Assert(dispatchRepairResponse != null, "استجابة IPC Dispatcher لمعالجة جودة البيانات ليست فارغة", result);
                    Assert(dispatchRepairResponse.Success, "استجابة IPC للمعالجة ناجحة (Success = true)", result);
                }
                finally
                {
                    SecurityService.SetCurrentUserForTesting(origUser);
                }

                result.Message = string.Format("نجحت جميع اختبارات فحص وتثبيت جودة وصحة البيانات والتسوية المحاسبية ({0}/{1} تأكيد بنجاح 100%)",
                    result.PassedAssertions, result.TotalAssertions);
            }
            catch (Exception ex)
            {
                result.Success = false;
                result.Message = "فشل في اختبارات فحص جودة البيانات: " + ex.Message + " -> " + ex.StackTrace;
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
                    // Ignore cleanup lock
                }
            }

            return result;
        }

        private static void Assert(bool condition, string assertionName, DataQualityTestResult result)
        {
            result.TotalAssertions++;
            if (condition)
            {
                result.PassedAssertions++;
            }
            else
            {
                result.Success = false;
                throw new Exception("فشل التأكيد: " + assertionName);
            }
        }
    }
}
