using System;
using System.IO;
using RafiqPOS.Common;
using RafiqPOS.Database;
using RafiqPOS.Models;
using RafiqPOS.Repositories;

namespace RafiqPOS.Services
{
    public class BatchTestResult
    {
        public bool Success { get; set; }
        public string Message { get; set; }
        public int TotalAssertions { get; set; }
        public int PassedAssertions { get; set; }
    }

    public static class BatchTestRunner
    {
        public static BatchTestResult RunAllTests()
        {
            var result = new BatchTestResult
            {
                Success = true,
                TotalAssertions = 0,
                PassedAssertions = 0
            };

            string tempDbPath = Path.Combine(Path.GetTempPath(), "rafiq_batch_test_" + Guid.NewGuid().ToString("N") + ".db");
            string tempConnStr = string.Format("Data Source={0};Version=3;BusyTimeout=5000;", tempDbPath);

            try
            {
                // 1. Run migrations including Migration 24
                MigrationRunner.ApplyMigrations(tempConnStr, tempDbPath);
                Assert(File.Exists(tempDbPath), "قاعدة البيانات التجريبية تم إنشاؤها بنجاح مع الهيكل 24", result);

                // 2. Setup repos & services
                var auditRepo = new AuditLogRepository(tempConnStr);
                var counterRepo = new CounterRepository(tempConnStr);
                var settingsRepo = new SettingsRepository(tempConnStr);
                var batchRepo = new ProductBatchRepository(tempConnStr, auditRepo);
                var productRepo = new ProductRepository(tempConnStr, auditRepo);
                var smRepo = new StockMovementRepository(tempConnStr);
                var priceHistoryRepo = new ProductPriceHistoryRepository(tempConnStr);
                var productService = new ProductService(productRepo, auditRepo, priceHistoryRepo, smRepo);
                var saleRepo = new SaleRepository(tempConnStr, counterRepo, auditRepo, batchRepo);
                var supplierRepo = new SupplierRepository(tempConnStr, auditRepo);
                var purchaseRepo = new PurchaseRepository(tempConnStr, counterRepo, supplierRepo, priceHistoryRepo, auditRepo, batchRepo);
                var batchService = new ProductBatchService(batchRepo, settingsRepo);
                var userRepo = new UserRepository(tempConnStr);
                var securityService = new SecurityService(settingsRepo, auditRepo, userRepo);
                DatabaseService.Security = securityService;
                var adminUser = new User
                {
                    Id = "usr_admin_batch",
                    Username = "admin",
                    DisplayName = "مدير النظام",
                    Role = "admin",
                    IsActive = true,
                    CreatedAt = DateTime.UtcNow.ToString("o"),
                    UpdatedAt = DateTime.UtcNow.ToString("o")
                };
                userRepo.Insert(adminUser);
                securityService.ChangeUserPin(adminUser.Id, "1234");

                // TEST 1: Create a product
                var supplier = supplierRepo.Save(new Supplier
                {
                    Id = "supp_juhayna",
                    Name = "شركة جهينة",
                    Phone = "01000000000",
                    IsActive = true
                });

                var prod = new Product
                {
                    Id = "prod_batch_test_1",
                    Name = "زبادي بلدي طازج 100 جم",
                    Barcode = "6221234567890",
                    PricePiasters = 1000,
                    CostPiasters = 700,
                    StockQuantityMilli = 0,
                    Unit = "piece",
                    IsActive = true
                };
                productService.SaveProduct(prod);
                Assert(productRepo.GetById(prod.Id) != null, "تم إنشاء المنتج التجريبي بنجاح", result);

                // TEST 2: Add Batches via Purchase
                var pur = new Purchase
                {
                    InvoiceNumber = 101,
                    SupplierId = supplier.Id,
                    SupplierName = "شركة جهينة",
                    InvoiceDate = DateTime.UtcNow.ToString("yyyy-MM-dd"),
                    PaidAmountPiasters = 17500, // 10*700 + 15*700 = 17500 piasters (175 EGP)
                    DiscountPiasters = 0,
                    Items = new System.Collections.Generic.List<PurchaseItem>
                    {
                        new PurchaseItem
                        {
                            Id = "pi_1",
                            ProductId = prod.Id,
                            ProductName = prod.Name,
                            Barcode = prod.Barcode,
                            QuantityMilli = 10000, // 10 units
                            UnitCostPiasters = 700,
                            BatchNumber = "BATCH-A",
                            ExpiryDate = DateTime.UtcNow.AddDays(5).ToString("yyyy-MM-dd"), // expires in 5 days
                            ProductionDate = DateTime.UtcNow.AddDays(-2).ToString("yyyy-MM-dd")
                        },
                        new PurchaseItem
                        {
                            Id = "pi_2",
                            ProductId = prod.Id,
                            ProductName = prod.Name,
                            Barcode = prod.Barcode,
                            QuantityMilli = 15000, // 15 units
                            UnitCostPiasters = 700,
                            BatchNumber = "BATCH-B",
                            ExpiryDate = DateTime.UtcNow.AddDays(25).ToString("yyyy-MM-dd"), // expires in 25 days
                            ProductionDate = DateTime.UtcNow.ToString("yyyy-MM-dd")
                        }
                    }
                };
                purchaseRepo.CreatePurchase(pur);

                var batches = batchRepo.GetByProductId(prod.Id);
                Assert(batches.Count == 2, "تم تسجيل دفعتين للمنتج بنجاح عبر فاتورة الشراء", result);
                Assert(batches[0].BatchNumber == "BATCH-A" && batches[0].QuantityMilli == 10000, "الدفعة الأولى BATCH-A برصيد 10000 ملي", result);
                Assert(batches[1].BatchNumber == "BATCH-B" && batches[1].QuantityMilli == 15000, "الدفعة الثانية BATCH-B برصيد 15000 ملي", result);

                var updatedProd = productRepo.GetById(prod.Id);
                Assert(updatedProd.StockQuantityMilli == 25000, "تم تحديث رصيد المنتج الكلي إلى 25 قطعة (25000 ملي)", result);

                // TEST 3: FEFO Deduction on Sale (Task 60-4)
                // Selling 12 units (12,000 milli):
                // Should deduct all 10,000 from BATCH-A (earliest expiry, 5 days), remaining 0 (DEPLETED)
                // And deduct 2,000 from BATCH-B (25 days), remaining 13,000 (ACTIVE)
                var sale = new Sale
                {
                    Id = "sale_batch_test_1",
                    InvoiceNumber = 1,
                    CustomerId = "cust_general_cash",
                    SubtotalPiasters = 12000,
                    TotalPiasters = 12000,
                    PaidPiasters = 12000,
                    PaymentMethod = "cash",
                    Status = "completed",
                    Items = new System.Collections.Generic.List<SaleItem>
                    {
                        new SaleItem
                        {
                            Id = "si_1",
                            ProductId = prod.Id,
                            ProductName = prod.Name,
                            QuantityMilli = 12000,
                            UnitPricePiasters = 1000,
                            TotalPiasters = 12000,
                            UnitCostPiasters = 700
                        }
                    },
                    Payments = new System.Collections.Generic.List<SalePayment>
                    {
                        new SalePayment
                        {
                            Id = "sp_1",
                            SaleId = "sale_batch_test_1",
                            AmountPiasters = 12000,
                            Method = "cash"
                        }
                    }
                };
                saleRepo.CreateSaleAtomic(sale);

                var afterSaleBatches = batchRepo.GetByProductId(prod.Id, false);
                ProductBatch batchA = null;
                ProductBatch batchB = null;
                for (int i = 0; i < afterSaleBatches.Count; i++)
                {
                    if (afterSaleBatches[i].BatchNumber == "BATCH-A") batchA = afterSaleBatches[i];
                    if (afterSaleBatches[i].BatchNumber == "BATCH-B") batchB = afterSaleBatches[i];
                }

                Assert(batchA != null && batchA.QuantityMilli == 0 && batchA.Status == "DEPLETED", "قاعدة FEFO: تم استهلاك الدفعة الأقدم BATCH-A بالكامل (رصيد 0 وحالة DEPLETED)", result);
                Assert(batchB != null && batchB.QuantityMilli == 13000 && batchB.Status == "ACTIVE", "قاعدة FEFO: تم خصم المتبقي 2000 ملي من الدفعة التالية BATCH-B ومتبقي بها 13000 ملي", result);

                var afterSaleProd = productRepo.GetById(prod.Id);
                Assert(afterSaleProd.StockQuantityMilli == 13000, "رصيد المنتج الكلي مطابق بعد الخصم الموزع (13000 ملي)", result);

                // TEST 4: Expired and Expiring Soon Alerts (Task 60-5)
                // Create an expired batch directly
                var expiredBatch = new ProductBatch
                {
                    ProductId = prod.Id,
                    BatchNumber = "BATCH-EXPIRED-TEST",
                    ExpiryDate = DateTime.UtcNow.AddDays(-3).ToString("yyyy-MM-dd"), // expired 3 days ago
                    QuantityMilli = 3000, // 3 units
                    CostPricePiasters = 700
                };
                batchRepo.CreateOrUpdateBatch(expiredBatch);

                var expiredList = batchService.GetExpiredBatches();
                Assert(expiredList.Count == 1 && expiredList[0].BatchNumber == "BATCH-EXPIRED-TEST", "اكتشاف الدفعة المنتهية الصلاحية بنجاح", result);

                var expiringSoonList = batchService.GetExpiringBatches(30);
                bool hasBatchBInExpiring = false;
                for (int i = 0; i < expiringSoonList.Count; i++)
                {
                    if (expiringSoonList[i].BatchNumber == "BATCH-B")
                    {
                        hasBatchBInExpiring = true;
                        break;
                    }
                }
                Assert(hasBatchBInExpiring, "اكتشاف الدفعة القريبة من الانتهاء BATCH-B خلال 30 يوماً", result);

                var summary = batchService.GetBatchSummary(30);
                Assert(summary.ExpiredCount == 1, "تقرير الملخص: عدد الدفعات المنتهية = 1", result);
                Assert(summary.ExpiredValuePiasters == 2100, "تقرير الملخص: قيمة الهالك المتوقع للدفعة المنتهية = 21.00 ج (2100 قرش)", result);

                // TEST 5: Disposal of Expired Batch (Task 60-1 / Rule 2)
                batchService.DisposeExpiredBatch(expiredBatch.Id, "تالفة ومنتهية الصلاحية", "admin");

                var disposedBatch = batchRepo.GetById(expiredBatch.Id);
                Assert(disposedBatch != null && disposedBatch.QuantityMilli == 0 && disposedBatch.Status == "EXPIRED", "تم إتلاف الدفعة المنتهية وتصفير رصيدها وتغيير حالتها إلى EXPIRED", result);

                var postDisposalSummary = batchService.GetBatchSummary(30);
                Assert(postDisposalSummary.ExpiredCount == 0, "بعد الإتلاف: الدفعات المنتهية غير المعالجة أصبحت 0", result);

                // TEST 6: FEFO Suggested Batch (Requirement 1)
                // BATCH-A was depleted in Test 3, so BATCH-B is the earliest active valid batch
                var suggested = batchService.GetSuggestedBatch(prod.Id);
                Assert(suggested != null && suggested.BatchNumber == "BATCH-B", "اقتراح التشغيلة الأقرب انتهاءً تلقائياً بنظام FEFO (BATCH-B)", result);

                // TEST 7: Batch Independence & Distinct Cost Tracking in Purchases and Stock Movements (Requirement 3)
                var pur2 = new Purchase
                {
                    InvoiceNumber = 102,
                    SupplierId = supplier.Id,
                    SupplierName = "شركة جهينة - توريد جديد",
                    InvoiceDate = DateTime.UtcNow.ToString("yyyy-MM-dd"),
                    PaidAmountPiasters = 9500, // 10*950 = 9500 piasters (95 EGP)
                    DiscountPiasters = 0,
                    Items = new System.Collections.Generic.List<PurchaseItem>
                    {
                        new PurchaseItem
                        {
                            Id = "pi_cost_test",
                            ProductId = prod.Id,
                            ProductName = prod.Name,
                            Barcode = prod.Barcode,
                            QuantityMilli = 10000, // 10 units
                            UnitCostPiasters = 950, // Distinct cost: 9.50 EGP vs 7.00 EGP earlier
                            BatchNumber = "BATCH-COST-950",
                            ExpiryDate = DateTime.UtcNow.AddDays(40).ToString("yyyy-MM-dd"),
                            ProductionDate = DateTime.UtcNow.ToString("yyyy-MM-dd")
                        }
                    }
                };
                purchaseRepo.CreatePurchase(pur2);

                // Verify stock_movement for purchase has the distinct batch cost 950 and expiry date
                var batch950 = batchRepo.GetByProductId(prod.Id);
                ProductBatch found950 = null;
                for (int bIdx = 0; bIdx < batch950.Count; bIdx++)
                {
                    if (batch950[bIdx].BatchNumber == "BATCH-COST-950")
                    {
                        found950 = batch950[bIdx];
                        break;
                    }
                }
                Assert(found950 != null && found950.CostPricePiasters == 950, "تسجيل سعر التكلفة المستقل للتشغيلة الجديدة (950 قرش)", result);

                // Verify stock movements recorded the distinct cost and expiry date
                bool purMovementVerified = false;
                using (var conn = new System.Data.SQLite.SQLiteConnection(tempConnStr))
                {
                    conn.Open();
                    using (var cmd = new System.Data.SQLite.SQLiteCommand("SELECT unit_cost_piasters, batch_number, expiry_date FROM stock_movements WHERE batch_number = 'BATCH-COST-950' AND movement_type = 'PURCHASE';", conn))
                    using (var reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            long costFromSm = Convert.ToInt64(reader["unit_cost_piasters"]);
                            string expFromSm = reader["expiry_date"].ToString();
                            purMovementVerified = (costFromSm == 950) && !string.IsNullOrEmpty(expFromSm);
                        }
                    }
                }
                Assert(purMovementVerified, "حركات المخزن تسجل تكلفة التشغيلة (950) ورقمها وتاريخ انتهائها بشكل مستقل في حركة الشراء", result);

                // TEST 8: Block Sale of Expired Items Without Supervisor Authorization (Requirement 2)
                var expiredProd = new Product
                {
                    Id = "prod_expired_med",
                    Name = "دواء شراب للأطفال منتهي",
                    Barcode = "6229999888877",
                    PricePiasters = 3500,
                    CostPiasters = 2000,
                    StockQuantityMilli = 5000,
                    Unit = "piece",
                    IsActive = true
                };
                productService.SaveProduct(expiredProd);

                var expiredBatchOnly = new ProductBatch
                {
                    ProductId = expiredProd.Id,
                    BatchNumber = "BATCH-EXPIRED-DRUG",
                    ExpiryDate = DateTime.UtcNow.AddDays(-10).ToString("yyyy-MM-dd"), // expired 10 days ago
                    QuantityMilli = 5000,
                    CostPricePiasters = 2000,
                    Status = "ACTIVE"
                };
                batchRepo.CreateOrUpdateBatch(expiredBatchOnly);

                bool blockedAsExpected = false;
                try
                {
                    var invalidSale = new Sale
                    {
                        Id = "sale_blocked_expired",
                        InvoiceNumber = 2,
                        SubtotalPiasters = 3500,
                        TotalPiasters = 3500,
                        PaidPiasters = 3500,
                        PaymentMethod = "cash",
                        Status = "completed",
                        Items = new System.Collections.Generic.List<SaleItem>
                        {
                            new SaleItem
                            {
                                Id = "si_exp_blocked",
                                ProductId = expiredProd.Id,
                                ProductName = expiredProd.Name,
                                QuantityMilli = 1000,
                                UnitPricePiasters = 3500,
                                TotalPiasters = 3500,
                                UnitCostPiasters = 2000,
                                BatchId = expiredBatchOnly.Id,
                                BatchNumber = expiredBatchOnly.BatchNumber,
                                ExpiryDate = expiredBatchOnly.ExpiryDate,
                                IsExpiredBypass = false
                            }
                        }
                    };
                    saleRepo.CreateSaleAtomic(invalidSale);
                }
                catch (InvalidOperationException)
                {
                    blockedAsExpected = true;
                }
                Assert(blockedAsExpected, "منع بيع الصنف المنتهي الصلاحية ورفض الفاتورة عند عدم وجود تخطي إداري موثق", result);

                // TEST 9: Allow Sale of Expired Items WITH Documented Supervisor Authorization (Requirement 2)
                var validBypassSale = new Sale
                {
                    Id = "sale_allowed_expired_bypass",
                    InvoiceNumber = 3,
                    CashierId = "cashier_1",
                    SupervisorPin = "1234",
                    SubtotalPiasters = 3500,
                    TotalPiasters = 3500,
                    PaidPiasters = 3500,
                    PaymentMethod = "cash",
                    Status = "completed",
                    Items = new System.Collections.Generic.List<SaleItem>
                    {
                        new SaleItem
                        {
                            Id = "si_exp_bypass",
                            ProductId = expiredProd.Id,
                            ProductName = expiredProd.Name,
                            QuantityMilli = 1000,
                            UnitPricePiasters = 3500,
                            TotalPiasters = 3500,
                            UnitCostPiasters = 2000,
                            BatchId = expiredBatchOnly.Id,
                            BatchNumber = expiredBatchOnly.BatchNumber,
                            ExpiryDate = expiredBatchOnly.ExpiryDate
                        }
                    }
                };
                saleRepo.CreateSaleAtomic(validBypassSale);

                // Verify audit log has the documented supervisor override
                bool auditLogFound = false;
                using (var conn = new System.Data.SQLite.SQLiteConnection(tempConnStr))
                {
                    conn.Open();
                    using (var cmd = new System.Data.SQLite.SQLiteCommand("SELECT COUNT(*) FROM audit_logs WHERE action = 'EXPIRED_PRODUCT_SALE_OVERRIDE' AND entity_id = @sid;", conn))
                    {
                        cmd.Parameters.AddWithValue("@sid", validBypassSale.Id);
                        long cnt = Convert.ToInt64(cmd.ExecuteScalar());
                        auditLogFound = cnt > 0;
                    }
                }
                Assert(auditLogFound, "توثيق التخطي الإداري لبيع الصنف المنتهي الصلاحية في سجل المراجعة (Audit Log)", result);

                // Verify sale recorded batch cost in stock_movements on sale
                bool saleMovementCostVerified = false;
                using (var conn = new System.Data.SQLite.SQLiteConnection(tempConnStr))
                {
                    conn.Open();
                    using (var cmd = new System.Data.SQLite.SQLiteCommand("SELECT unit_cost_piasters, batch_number, expiry_date FROM stock_movements WHERE reference_id = @sid AND movement_type = 'SALE';", conn))
                    {
                        cmd.Parameters.AddWithValue("@sid", validBypassSale.Id);
                        using (var reader = cmd.ExecuteReader())
                        {
                            if (reader.Read())
                            {
                                long saleCost = Convert.ToInt64(reader["unit_cost_piasters"]);
                                string bNum = reader["batch_number"].ToString();
                                string expDate = reader["expiry_date"].ToString();
                                saleMovementCostVerified = (saleCost == 2000) && (bNum == "BATCH-EXPIRED-DRUG") && !string.IsNullOrEmpty(expDate);
                            }
                        }
                    }
                }
                Assert(saleMovementCostVerified, "حركات المخزن تسجل تكلفة التشغيلة ورقمها وتاريخ انتهائها بشكل مستقل في حركة البيع", result);

                result.Message = string.Format("نجحت جميع اختبارات تواريخ الصلاحية والدفعات بنسبة 100% ({0}/{1} تأكيداً)",
                    result.PassedAssertions, result.TotalAssertions);
            }
            catch (Exception ex)
            {
                result.Success = false;
                result.Message = "خطأ في اختبارات الدفعات: " + ex.Message;
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
                catch { }
            }

            return result;
        }

        private static void Assert(bool condition, string assertionName, BatchTestResult result)
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
