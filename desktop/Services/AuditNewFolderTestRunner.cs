using System;
using System.Collections.Generic;
using System.Data.SQLite;
using System.IO;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using RafiqPOS.Bridge;
using RafiqPOS.Common;
using RafiqPOS.Database;
using RafiqPOS.Models;
using RafiqPOS.Repositories;

namespace RafiqPOS.Services
{
    public class AuditTestCaseResult
    {
        public int TestNumber { get; set; }
        public string TestCode { get; set; }
        public string Title { get; set; }
        public bool Passed { get; set; } // True = behaving as expected (no bug); False = bug reproduced
        public string Expected { get; set; }
        public string Observed { get; set; }
        public string Details { get; set; }
    }

    public class AuditTestRunnerSummary
    {
        public int TotalTests { get; set; }
        public int PassedCount { get; set; }
        public int FailedCount { get; set; }
        public List<AuditTestCaseResult> Results { get; set; }

        public AuditTestRunnerSummary()
        {
            this.Results = new List<AuditTestCaseResult>();
        }
    }

    public static class AuditNewFolderTestRunner
    {
        private static string GenerateUniqueBarcode()
        {
            return "622" + Math.Abs(Guid.NewGuid().GetHashCode()).ToString("D9");
        }

        public static AuditTestRunnerSummary RunAllTests()
        {
            var summary = new AuditTestRunnerSummary();
            string tempDir = Path.Combine(Path.GetTempPath(), "rafiq_audit_" + Guid.NewGuid().ToString("N"));
            if (!Directory.Exists(tempDir)) Directory.CreateDirectory(tempDir);

            try
            {
                // Initialize DatabaseService in isolated temp directory
                DatabaseService.Initialize(tempDir);

                // Activate license so sale operations via bridge are not blocked by license expiry
                if (DatabaseService.License != null && DatabaseService.Encryption != null)
                {
                    string myFp = DatabaseService.Encryption.DeviceFingerprint;
                    string supCode = LicenseService.GenerateOfflineSupportCode(myFp, "lifetime", 9999);
                    DatabaseService.License.ActivateWithSupportCode(supCode, "متجر الفحص التجريبي");
                }

                // Run each test in sequence
                summary.Results.Add(RunTest1_CartonReturnStock());
                summary.Results.Add(RunTest2_CartonCancelSaleMovement());
                summary.Results.Add(RunTest3a_VariantCancelSaleStock());
                summary.Results.Add(RunTest3b_BatchCancelSaleStock());
                summary.Results.Add(RunTest4_DuplicateProductStockValidation());
                summary.Results.Add(RunTest5b_PartialReturnThenCancelSaleStock());
                summary.Results.Add(RunTest7_RefundIgnoresInvoiceDiscount());
                summary.Results.Add(RunTest8_CartonAndPiecesReturnValidation());
                summary.Results.Add(RunTest9_ItemDiscountAndInvoiceDiscountTogether());
                summary.Results.Add(RunTest10_CartonCostAndProfit());
                summary.Results.Add(RunTest11_CancelSaleOverpaidCustomerCredit());
                summary.Results.Add(RunTest13a_ZeroTaxLineOverride());
                summary.Results.Add(RunTest5a_ReturnOnCancelledSaleViaBridge());
                summary.Results.Add(RunTest6_FakeSaleIdBypassesSupervisorPinViaBridge());
                summary.Results.Add(RunTest7b_ManipulatedRefundTotalViaBridge());
                summary.Results.Add(RunTest12_SplitPaymentsSumMismatchViaBridge());

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
                // Cleanup temp dir if possible
                try { Directory.Delete(tempDir, true); } catch { }
            }
        }

        // الاختبار 1: إرجاع كرتونة يعيد كمية مخزون غير صحيحة
        private static AuditTestCaseResult RunTest1_CartonReturnStock()
        {
            var test = new AuditTestCaseResult
            {
                TestNumber = 1,
                TestCode = "TEST-1",
                Title = "إرجاع كرتونة يعيد كمية مخزون غير صحيحة",
                Expected = "المخزون يعود إلى 100 قطعة بعد إرجاع كرتونة واحدة (12 قطعة)",
                Passed = false
            };

            try
            {
                string prodId = "prod_t1_" + Guid.NewGuid().ToString("N");
                var prod = new Product
                {
                    Id = prodId,
                    Name = "صنف كرتونة أول للإرجاع",
                    Barcode = GenerateUniqueBarcode(),
                    CostPiasters = 1000, // 10 LE
                    PricePiasters = 1500, // 15 LE
                    StockQuantityMilli = 100000, // 100 pieces
                    Unit = "piece",
                    IsActive = true
                };
                DatabaseService.Products.SaveProduct(prod);

                var cartonUnit = new ProductUnit
                {
                    Id = "unit_t1_" + Guid.NewGuid().ToString("N"),
                    ProductId = prodId,
                    UnitName = "carton",
                    ConversionFactor = 12,
                    IsBaseUnit = false,
                    SellPricePiasters = 15000, // 150 LE
                    CostPricePiasters = 12000,
                    Barcode = GenerateUniqueBarcode(),
                    IsDivisible = false
                };
                DatabaseService.ProductUnits.CreateUnit(cartonUnit);

                // Sell 1 carton
                var sale = new Sale
                {
                    PaymentMethod = "CASH",
                    Items = new List<SaleItem>
                    {
                        new SaleItem
                        {
                            ProductId = prodId,
                            UnitId = cartonUnit.Id,
                            UnitName = cartonUnit.UnitName,
                            ConversionFactor = 12,
                            UnitPricePiasters = 15000,
                            QuantityMilli = 1000 // 1 carton
                        }
                    }
                };
                var createdSale = DatabaseService.Sales.ProcessSale(sale);

                var afterSaleProd = DatabaseService.ProductRepo.GetById(prodId);
                long stockAfterSale = afterSaleProd.StockQuantityMilli; // should be 88000 (88 pcs)

                // Return 1 carton
                var retObj = new Return
                {
                    SaleId = createdSale.Id,
                    Reason = "مرتجع كرتونة تجريبي",
                    RefundMethod = "cash",
                    Items = new List<ReturnItem>
                    {
                        new ReturnItem
                        {
                            SaleItemId = createdSale.Items[0].Id,
                            ProductId = prodId,
                            ProductName = "صنف كرتونة أول للإرجاع",
                            Unit = "carton",
                            QuantityMilli = 1000, // 1 carton
                            UnitPricePiasters = 15000,
                            TotalPiasters = 15000,
                            IsDamaged = false
                        }
                    }
                };
                DatabaseService.Returns.ProcessReturn(retObj);

                var afterReturnProd = DatabaseService.ProductRepo.GetById(prodId);
                long finalStock = afterReturnProd.StockQuantityMilli;

                if (finalStock == 100000)
                {
                    test.Passed = true;
                    test.Observed = "المخزون عاد إلى 100 قطعة تماماً (100,000 ملي).";
                }
                else
                {
                    test.Passed = false;
                    test.Observed = string.Format("المخزون أصبح {0} قطعة ({1} ملي) بدلاً من 100 قطعة. العطل موجود: أعاد 1 قطعة بدلاً من 12.", finalStock / 1000.0, finalStock);
                }
                test.Details = string.Format("رصيد البداية: 100، بعد بيع كرتونة: {0}، بعد إرجاع كرتونة: {1}", stockAfterSale / 1000.0, finalStock / 1000.0);
            }
            catch (Exception ex)
            {
                test.Passed = false;
                test.Observed = "استثناء أثناء التنفيذ: " + ex.Message;
            }

            return test;
        }

        // الاختبار 2: إلغاء بيع كرتونة يسجّل كمية غير صحيحة
        private static AuditTestCaseResult RunTest2_CartonCancelSaleMovement()
        {
            var test = new AuditTestCaseResult
            {
                TestNumber = 2,
                TestCode = "TEST-2",
                Title = "إلغاء بيع كرتونة يسجّل كمية غير صحيحة في حركة المخزون",
                Expected = "سطر SALE_CANCEL يسجل كمية +12 قطعة (+12000 ملي)",
                Passed = false
            };

            try
            {
                string prodId = "prod_t2_" + Guid.NewGuid().ToString("N");
                var prod = new Product
                {
                    Id = prodId,
                    Name = "صنف كرتونة مستقل خاص بالإلغاء",
                    Barcode = GenerateUniqueBarcode(),
                    CostPiasters = 1000,
                    PricePiasters = 1500,
                    StockQuantityMilli = 100000,
                    Unit = "piece",
                    IsActive = true
                };
                DatabaseService.Products.SaveProduct(prod);

                var cartonUnit = new ProductUnit
                {
                    Id = "unit_t2_" + Guid.NewGuid().ToString("N"),
                    ProductId = prodId,
                    UnitName = "carton",
                    ConversionFactor = 12,
                    IsBaseUnit = false,
                    SellPricePiasters = 15000,
                    CostPricePiasters = 12000,
                    Barcode = GenerateUniqueBarcode(),
                    IsDivisible = false
                };
                DatabaseService.ProductUnits.CreateUnit(cartonUnit);

                // Sell 1 carton
                var sale = new Sale
                {
                    PaymentMethod = "CASH",
                    Items = new List<SaleItem>
                    {
                        new SaleItem
                        {
                            ProductId = prodId,
                            UnitId = cartonUnit.Id,
                            UnitName = cartonUnit.UnitName,
                            ConversionFactor = 12,
                            UnitPricePiasters = 15000,
                            QuantityMilli = 1000
                        }
                    }
                };
                var createdSale = DatabaseService.Sales.ProcessSale(sale);

                // Cancel sale
                DatabaseService.Sales.CancelSale(createdSale.Id, "إلغاء بيع الكرتونة");

                // Check stock movements for SALE_CANCEL
                long cancelQtyLogged = 0;
                using (var conn = new SQLiteConnection(DatabaseService.ConnectionString))
                {
                    conn.Open();
                    using (var cmd = new SQLiteCommand("SELECT quantity_milli FROM stock_movements WHERE movement_type = 'SALE_CANCEL' AND reference_id = @sid ORDER BY rowid DESC LIMIT 1;", conn))
                    {
                        cmd.Parameters.AddWithValue("@sid", createdSale.Id);
                        object val = cmd.ExecuteScalar();
                        if (val != null && val != DBNull.Value) cancelQtyLogged = Convert.ToInt64(val);
                    }
                }

                if (cancelQtyLogged == 12000)
                {
                    test.Passed = true;
                    test.Observed = "سطر SALE_CANCEL سجّل كمية +12 قطعة (+12000 ملي) بشكل سليم.";
                }
                else
                {
                    test.Passed = false;
                    test.Observed = string.Format("سطر SALE_CANCEL سجّل كمية {0} ({1} ملي) بدلاً من +12 قطعة (+12000 ملي). العطل موجود: سجّل +1 قطعة فقط.", cancelQtyLogged / 1000.0, cancelQtyLogged);
                }
                test.Details = string.Format("قيمة quantity_milli المسجلة في جدول stock_movements هي {0}", cancelQtyLogged);
            }
            catch (Exception ex)
            {
                test.Passed = false;
                test.Observed = "استثناء أثناء التنفيذ: " + ex.Message;
            }

            return test;
        }

        // الاختبار 3a: إلغاء بيع متغير لا يعيد مخزون المتغير
        private static AuditTestCaseResult RunTest3a_VariantCancelSaleStock()
        {
            var test = new AuditTestCaseResult
            {
                TestNumber = 3,
                TestCode = "TEST-3a",
                Title = "إلغاء بيع متغير لا يعيد مخزون المتغير (ProductVariant)",
                Expected = "مخزون المتغير M يعود إلى 10 ومخزون الأب يعود إلى 20",
                Passed = false
            };

            try
            {
                // Create parent product
                string uid = Guid.NewGuid().ToString("N").Substring(0, 6);
                string parentId = "parent_t3a_" + Guid.NewGuid().ToString("N");
                var parent = new Product
                {
                    Id = parentId,
                    Name = "قميص كاجوال " + uid,
                    Barcode = GenerateUniqueBarcode(),
                    PricePiasters = 15000,
                    CostPiasters = 9000,
                    StockQuantityMilli = 20000, // 20 units
                    Unit = "piece",
                    IsActive = true
                };
                DatabaseService.Products.SaveProduct(parent);

                // Create 2 variant products M and L
                string varMId = "var_m_" + Guid.NewGuid().ToString("N");
                string varLId = "var_l_" + Guid.NewGuid().ToString("N");

                var varM = new Product
                {
                    Id = varMId,
                    ParentId = parentId,
                    Name = "قميص كاجوال مقاس M " + uid,
                    Barcode = GenerateUniqueBarcode(),
                    PricePiasters = 15000,
                    CostPiasters = 9000,
                    StockQuantityMilli = 10000, // 10 units
                    Unit = "piece",
                    IsActive = true
                };
                var varL = new Product
                {
                    Id = varLId,
                    ParentId = parentId,
                    Name = "قميص كاجوال مقاس L " + uid,
                    Barcode = GenerateUniqueBarcode(),
                    PricePiasters = 15000,
                    CostPiasters = 9000,
                    StockQuantityMilli = 10000, // 10 units
                    Unit = "piece",
                    IsActive = true
                };
                DatabaseService.Products.SaveProduct(varM, true);
                DatabaseService.Products.SaveProduct(varL, true);

                // Register in product_variants table
                using (var conn = new SQLiteConnection(DatabaseService.ConnectionString))
                {
                    conn.Open();
                    using (var cmd = new SQLiteCommand(@"
                        INSERT INTO product_variants (id, parent_product_id, variant_product_id, size, color, stock_quantity_milli, created_at, updated_at)
                        VALUES (@id1, @pid, @vid1, 'M', 'أبيض', 10000, datetime('now'), datetime('now')),
                               (@id2, @pid, @vid2, 'L', 'أبيض', 10000, datetime('now'), datetime('now'));
                    ", conn))
                    {
                        cmd.Parameters.AddWithValue("@id1", Guid.NewGuid().ToString());
                        cmd.Parameters.AddWithValue("@pid", parentId);
                        cmd.Parameters.AddWithValue("@vid1", varMId);
                        cmd.Parameters.AddWithValue("@id2", Guid.NewGuid().ToString());
                        cmd.Parameters.AddWithValue("@vid2", varLId);
                        cmd.ExecuteNonQuery();
                    }
                }

                // Sell 1 from M
                var sale = new Sale
                {
                    PaymentMethod = "CASH",
                    Items = new List<SaleItem>
                    {
                        new SaleItem
                        {
                            ProductId = varMId,
                            UnitPricePiasters = 15000,
                            QuantityMilli = 1000 // 1 unit
                        }
                    }
                };
                var createdSale = DatabaseService.Sales.ProcessSale(sale);

                // Cancel sale
                DatabaseService.Sales.CancelSale(createdSale.Id, "إلغاء بيع المتغير M");

                // Check stock of variant M in product_variants and parent in products
                long varMStockInVariantTable = 0;
                using (var conn = new SQLiteConnection(DatabaseService.ConnectionString))
                {
                    conn.Open();
                    using (var cmd = new SQLiteCommand("SELECT stock_quantity_milli FROM product_variants WHERE variant_product_id = @vid;", conn))
                    {
                        cmd.Parameters.AddWithValue("@vid", varMId);
                        object val = cmd.ExecuteScalar();
                        if (val != null && val != DBNull.Value) varMStockInVariantTable = Convert.ToInt64(val);
                    }
                }
                var pProd = DatabaseService.ProductRepo.GetById(parentId);
                long parentStock = pProd != null ? pProd.StockQuantityMilli : 0;

                if (varMStockInVariantTable == 10000 && parentStock == 20000)
                {
                    test.Passed = true;
                    test.Observed = "رصيد المتغير M عاد إلى 10 ورصيد الأب إلى 20 بشكل سليم.";
                }
                else
                {
                    test.Passed = false;
                    test.Observed = string.Format("رصيد المتغير في جدول product_variants هو {0} ورصيد الأب هو {1}. العطل موجود: لم يتم تحديث جدول المتغيرات أو مزامنة الأب عند الإلغاء.", varMStockInVariantTable / 1000.0, parentStock / 1000.0);
                }
                test.Details = string.Format("product_variants: {0} milli, parent products.stock: {1} milli", varMStockInVariantTable, parentStock);
            }
            catch (Exception ex)
            {
                test.Passed = false;
                test.Observed = "استثناء أثناء التنفيذ: " + ex.Message;
            }

            return test;
        }

        // الاختبار 3b: إلغاء بيع يتتبع الدُفعات لا يعيد كمية الدفعة
        private static AuditTestCaseResult RunTest3b_BatchCancelSaleStock()
        {
            var test = new AuditTestCaseResult
            {
                TestNumber = 4,
                TestCode = "TEST-3b",
                Title = "إلغاء بيع يتتبع الدُفعات لا يعيد كمية الدفعة (ProductBatches)",
                Expected = "تعود كمية الدفعة B1 في جدول product_batches إلى 10 (10000 ملي)",
                Passed = false
            };

            try
            {
                string prodId = "prod_milk_" + Guid.NewGuid().ToString("N");
                var prod = new Product
                {
                    Id = prodId,
                    Name = "حليب معقم ذو دفعات وتاريخ صلاحية",
                    Barcode = GenerateUniqueBarcode(),
                    PricePiasters = 3000,
                    CostPiasters = 2000,
                    StockQuantityMilli = 10000, // 10 units
                    Unit = "piece",
                    IsActive = true
                };
                DatabaseService.Products.SaveProduct(prod);

                // Insert Batch B1 with 10 units
                string batchId = "batch_b1_" + Guid.NewGuid().ToString("N");
                using (var conn = new SQLiteConnection(DatabaseService.ConnectionString))
                {
                    conn.Open();
                    using (var cmd = new SQLiteCommand(@"
                        INSERT INTO product_batches (id, product_id, batch_number, expiry_date, quantity_milli, cost_price_piasters, status, created_at, updated_at)
                        VALUES (@id, @pid, 'B1', '2026-12-31', 10000, 2000, 'ACTIVE', datetime('now'), datetime('now'));
                    ", conn))
                    {
                        cmd.Parameters.AddWithValue("@id", batchId);
                        cmd.Parameters.AddWithValue("@pid", prodId);
                        cmd.ExecuteNonQuery();
                    }
                }

                // Sell 3 units
                var sale = new Sale
                {
                    PaymentMethod = "CASH",
                    Items = new List<SaleItem>
                    {
                        new SaleItem
                        {
                            ProductId = prodId,
                            UnitPricePiasters = 3000,
                            QuantityMilli = 3000 // 3 units
                        }
                    }
                };
                var createdSale = DatabaseService.Sales.ProcessSale(sale);

                // Cancel the sale
                DatabaseService.Sales.CancelSale(createdSale.Id, "إلغاء بيع الحليب ذي الدفعة");

                // Check batch B1 quantity in product_batches
                long batchQtyAfterCancel = 0;
                using (var conn = new SQLiteConnection(DatabaseService.ConnectionString))
                {
                    conn.Open();
                    using (var cmd = new SQLiteCommand("SELECT quantity_milli FROM product_batches WHERE id = @bid;", conn))
                    {
                        cmd.Parameters.AddWithValue("@bid", batchId);
                        object val = cmd.ExecuteScalar();
                        if (val != null && val != DBNull.Value) batchQtyAfterCancel = Convert.ToInt64(val);
                    }
                }

                if (batchQtyAfterCancel == 10000)
                {
                    test.Passed = true;
                    test.Observed = "كمية الدفعة B1 عادت إلى 10 (10000 ملي) بشكل سليم.";
                }
                else
                {
                    test.Passed = false;
                    test.Observed = string.Format("كمية الدفعة B1 ظلت {0} ({1} ملي) بدلاً من 10. العطل موجود: لم يتم إرجاع الكمية لجدول الدفعات عند الإلغاء.", batchQtyAfterCancel / 1000.0, batchQtyAfterCancel);
                }
                test.Details = string.Format("رصيد الدفعة B1 في جدول product_batches هو {0} ملي", batchQtyAfterCancel);
            }
            catch (Exception ex)
            {
                test.Passed = false;
                test.Observed = "استثناء أثناء التنفيذ: " + ex.Message;
            }

            return test;
        }

        // الاختبار 4: تكرار المنتج في سطرين يتجاوز التحقق من المخزون
        private static AuditTestCaseResult RunTest4_DuplicateProductStockValidation()
        {
            var test = new AuditTestCaseResult
            {
                TestNumber = 5,
                TestCode = "TEST-4",
                Title = "تكرار المنتج في سطرين منفصلين يتجاوز التحقق من المخزون",
                Expected = "رفض العملية برسالة خطأ تفيد بأن المخزون غير كافٍ (المجموع 8 > 5)",
                Passed = false
            };

            try
            {
                // Ensure allow_negative_stock is 0 (OFF)
                DatabaseService.Settings.Set("allow_negative_stock", "0");

                string prodId = "prod_neg_" + Guid.NewGuid().ToString("N");
                var prod = new Product
                {
                    Id = prodId,
                    Name = "صنف فحص التحقق من الرصيد السالب",
                    Barcode = GenerateUniqueBarcode(),
                    PricePiasters = 2000,
                    CostPiasters = 1000,
                    StockQuantityMilli = 5000, // 5 units available
                    Unit = "piece",
                    IsActive = true
                };
                DatabaseService.Products.SaveProduct(prod);

                // Create sale with 2 separate lines of 4 units each (total 8 units)
                var sale = new Sale
                {
                    PaymentMethod = "CASH",
                    Items = new List<SaleItem>
                    {
                        new SaleItem
                        {
                            ProductId = prodId,
                            UnitPricePiasters = 2000,
                            QuantityMilli = 4000 // line 1: 4 units
                        },
                        new SaleItem
                        {
                            ProductId = prodId,
                            UnitPricePiasters = 2000,
                            QuantityMilli = 4000 // line 2: 4 units
                        }
                    }
                };

                bool exceptionThrown = false;
                string thrownMessage = "";
                try
                {
                    DatabaseService.Sales.ProcessSale(sale);
                }
                catch (InvalidOperationException invEx)
                {
                    exceptionThrown = true;
                    thrownMessage = invEx.Message;
                }

                var prodAfter = DatabaseService.ProductRepo.GetById(prodId);
                long stockAfter = prodAfter.StockQuantityMilli;

                if (exceptionThrown)
                {
                    test.Passed = true;
                    test.Observed = "تم رفض البيع بنجاح برسالة منع البيع بالسالب: " + thrownMessage;
                }
                else
                {
                    test.Passed = false;
                    test.Observed = string.Format("تمت عملية البيع بنجاح وأصبح المخزون بالسالب ({0} قطعة / {1} ملي)! العطل موجود: فحص الرصيد يفحص كل سطر منفرداً دون تجميع الكمية لنفس الصنف.", stockAfter / 1000.0, stockAfter);
                }
                test.Details = string.Format("استثناء مقذوف: {0}، رصيد الصنف بعد المحاولة: {1}", exceptionThrown, stockAfter);
            }
            catch (Exception ex)
            {
                test.Passed = false;
                test.Observed = "استثناء عام: " + ex.Message;
            }

            return test;
        }

        // الاختبار 5b: إرجاع جزء من الفاتورة ثم إلغاؤها يعيد المخزون مرتين
        private static AuditTestCaseResult RunTest5b_PartialReturnThenCancelSaleStock()
        {
            var test = new AuditTestCaseResult
            {
                TestNumber = 6,
                TestCode = "TEST-5b",
                Title = "إرجاع جزء من الفاتورة ثم إلغاؤها يعيد المخزون مرتين",
                Expected = "يُرفض الإلغاء أو تُعاد الوحدة المتبقية فقط ليصبح المخزون 10 قطع (وليس 11)",
                Passed = false
            };

            try
            {
                string prodId = "prod_double_" + Guid.NewGuid().ToString("N");
                var prod = new Product
                {
                    Id = prodId,
                    Name = "صنف فحص الإرجاع المزدوج",
                    Barcode = GenerateUniqueBarcode(),
                    PricePiasters = 2000,
                    CostPiasters = 1000,
                    StockQuantityMilli = 10000, // 10 units
                    Unit = "piece",
                    IsActive = true
                };
                DatabaseService.Products.SaveProduct(prod);

                // 1. Sell 2 units (stock should become 8)
                var sale = new Sale
                {
                    PaymentMethod = "CASH",
                    Items = new List<SaleItem>
                    {
                        new SaleItem
                        {
                            ProductId = prodId,
                            UnitPricePiasters = 2000,
                            QuantityMilli = 2000 // 2 units
                        }
                    }
                };
                var createdSale = DatabaseService.Sales.ProcessSale(sale);

                // 2. Return 1 unit (stock should become 9)
                var retObj = new Return
                {
                    SaleId = createdSale.Id,
                    Reason = "إرجاع وحدة واحدة",
                    RefundMethod = "cash",
                    Items = new List<ReturnItem>
                    {
                        new ReturnItem
                        {
                            SaleItemId = createdSale.Items[0].Id,
                            ProductId = prodId,
                            ProductName = "صنف فحص الإرجاع المزدوج",
                            QuantityMilli = 1000,
                            UnitPricePiasters = 2000,
                            TotalPiasters = 2000,
                            IsDamaged = false
                        }
                    }
                };
                DatabaseService.Returns.ProcessReturn(retObj);

                long stockAfterReturn = DatabaseService.ProductRepo.GetById(prodId).StockQuantityMilli; // 9000

                // 3. Cancel the original sale
                bool cancelBlocked = false;
                string cancelBlockMsg = "";
                try
                {
                    DatabaseService.Sales.CancelSale(createdSale.Id, "إلغاء فاتورة عليها مرتجع جزئي");
                }
                catch (Exception ex)
                {
                    cancelBlocked = true;
                    cancelBlockMsg = ex.Message;
                }

                long stockAfterCancel = DatabaseService.ProductRepo.GetById(prodId).StockQuantityMilli;

                if (cancelBlocked)
                {
                    test.Passed = true;
                    test.Observed = "تم رفض إلغاء الفاتورة لوجود مرتجع عليها: " + cancelBlockMsg;
                }
                else if (stockAfterCancel == 10000)
                {
                    test.Passed = true;
                    test.Observed = "تم قبول الإلغاء مع خصم الكمية المرتجعة مسبقاً، وعاد الرصيد إلى 10 قطع تماماً.";
                }
                else
                {
                    test.Passed = false;
                    test.Observed = string.Format("نجح الإلغاء وأصبح رصيد المخزون {0} قطعة ({1} ملي) بدلاً من 10! العطل موجود: أعاد الكمية المباعة كاملة (2) رغم إرجاع (1) مسبقاً فتكرر المخزون مرتين.", stockAfterCancel / 1000.0, stockAfterCancel);
                }
                test.Details = string.Format("رصيد البداية: 10، بعد البيع: 8، بعد المرتجع: {0}، بعد الإلغاء: {1}", stockAfterReturn / 1000.0, stockAfterCancel / 1000.0);
            }
            catch (Exception ex)
            {
                test.Passed = false;
                test.Observed = "استثناء أثناء التنفيذ: " + ex.Message;
            }

            return test;
        }

        // الاختبار 7: استرداد المبلغ يتجاهل خصم الفاتورة
        private static AuditTestCaseResult RunTest7_RefundIgnoresInvoiceDiscount()
        {
            var test = new AuditTestCaseResult
            {
                TestNumber = 7,
                TestCode = "TEST-7",
                Title = "استرداد المبلغ يتجاهل خصم الفاتورة (Refund ignores invoice discount)",
                Expected = "مبلغ الاسترداد هو 80 ج.م (8000 قرش) بعد احتساب خصم الفاتورة",
                Passed = false
            };

            try
            {
                string prodId = "prod_disc_" + Guid.NewGuid().ToString("N");
                var prod = new Product
                {
                    Id = prodId,
                    Name = "صنف فحص خصم الفاتورة والمرتجع",
                    Barcode = GenerateUniqueBarcode(),
                    PricePiasters = 10000, // 100 LE
                    CostPiasters = 5000,
                    StockQuantityMilli = 10000,
                    Unit = "piece",
                    IsActive = true
                };
                DatabaseService.Products.SaveProduct(prod);

                // Sell with invoice discount 20 LE (2000 piasters) -> Net total 80 LE (8000 piasters)
                var sale = new Sale
                {
                    PaymentMethod = "CASH",
                    DiscountPiasters = 2000,
                    Items = new List<SaleItem>
                    {
                        new SaleItem
                        {
                            ProductId = prodId,
                            UnitPricePiasters = 10000,
                            QuantityMilli = 1000 // 1 unit
                        }
                    }
                };
                var createdSale = DatabaseService.Sales.ProcessSale(sale);

                // Return 1 unit via ReturnService
                var retObj = new Return
                {
                    SaleId = createdSale.Id,
                    Reason = "استرجاع صنف بخصم",
                    RefundMethod = "cash",
                    Items = new List<ReturnItem>
                    {
                        new ReturnItem
                        {
                            SaleItemId = createdSale.Items[0].Id,
                            ProductId = prodId,
                            ProductName = "صنف فحص خصم الفاتورة والمرتجع",
                            QuantityMilli = 1000,
                            UnitPricePiasters = createdSale.Items[0].UnitPricePiasters, // 10000
                            TotalPiasters = createdSale.Items[0].UnitPricePiasters, // 10000
                            IsDamaged = false
                        }
                    }
                };
                var processedReturn = DatabaseService.Returns.ProcessReturn(retObj);

                if (processedReturn.TotalPiasters == 8000)
                {
                    test.Passed = true;
                    test.Observed = "مبلغ الاسترداد هو 80 ج.م بدقة مع مراعاة خصم الفاتورة.";
                }
                else
                {
                    test.Passed = false;
                    test.Observed = string.Format("مبلغ الاسترداد هو {0} ج.م ({1} قرش) بدلاً من 80 ج.م. العطل موجود: تجاهل الخصم واسترد السعر الأصلي كاملاً مسبباً عجزاً في الخزينة.", processedReturn.TotalPiasters / 100.0, processedReturn.TotalPiasters);
                }
                test.Details = string.Format("إجمالي الفاتورة الأصلية: {0} قرش، إجمالي المرتجع: {1} قرش", createdSale.TotalPiasters, processedReturn.TotalPiasters);
            }
            catch (Exception ex)
            {
                test.Passed = false;
                test.Observed = "استثناء أثناء التنفيذ: " + ex.Message;
            }

            return test;
        }

        // الاختبار 8: بيع المنتج نفسه ككرتونة وكقطع في الفاتورة نفسها
        private static AuditTestCaseResult RunTest8_CartonAndPiecesReturnValidation()
        {
            var test = new AuditTestCaseResult
            {
                TestNumber = 8,
                TestCode = "TEST-8",
                Title = "بيع المنتج نفسه ككرتونة وكقطع في الفاتورة نفسها - التحقق من المرتجع",
                Expected = "قبول إرجاع 3 قطع من سطر القطع بنجاح، ورفض إرجاع كرتونتين",
                Passed = false
            };

            try
            {
                string prodId = "prod_c_p_" + Guid.NewGuid().ToString("N");
                var prod = new Product
                {
                    Id = prodId,
                    Name = "صنف كرتونة وقطع مختلطة",
                    Barcode = GenerateUniqueBarcode(),
                    CostPiasters = 1000,
                    PricePiasters = 1500,
                    StockQuantityMilli = 100000, // 100 pcs
                    Unit = "piece",
                    IsActive = true
                };
                DatabaseService.Products.SaveProduct(prod);

                var cartonUnit = new ProductUnit
                {
                    Id = "unit_c_p_" + Guid.NewGuid().ToString("N"),
                    ProductId = prodId,
                    UnitName = "carton",
                    ConversionFactor = 12,
                    IsBaseUnit = false,
                    SellPricePiasters = 15000,
                    CostPricePiasters = 12000,
                    Barcode = GenerateUniqueBarcode(),
                    IsDivisible = false
                };
                DatabaseService.ProductUnits.CreateUnit(cartonUnit);

                // Sell 1 carton (line 1) + 3 pieces (line 2)
                var sale = new Sale
                {
                    PaymentMethod = "CASH",
                    Items = new List<SaleItem>
                    {
                        new SaleItem
                        {
                            ProductId = prodId,
                            UnitId = cartonUnit.Id,
                            UnitName = cartonUnit.UnitName,
                            ConversionFactor = 12,
                            UnitPricePiasters = 15000,
                            QuantityMilli = 1000 // 1 carton
                        },
                        new SaleItem
                        {
                            ProductId = prodId,
                            UnitPricePiasters = 1500,
                            QuantityMilli = 3000 // 3 pieces
                        }
                    }
                };
                var createdSale = DatabaseService.Sales.ProcessSale(sale);

                // Attempt to return 3 pieces from line 2
                var returnPieces = new Return
                {
                    SaleId = createdSale.Id,
                    Reason = "إرجاع 3 قطع",
                    RefundMethod = "cash",
                    Items = new List<ReturnItem>
                    {
                        new ReturnItem
                        {
                            SaleItemId = createdSale.Items[1].Id,
                            ProductId = prodId,
                            ProductName = "صنف كرتونة وقطع مختلطة",
                            Unit = "piece",
                            QuantityMilli = 3000, // 3 pieces
                            UnitPricePiasters = 1500,
                            TotalPiasters = 4500,
                            IsDamaged = false
                        }
                    }
                };

                bool piecesReturnAccepted = false;
                string piecesReturnError = "";
                try
                {
                    DatabaseService.Returns.ProcessReturn(returnPieces);
                    piecesReturnAccepted = true;
                }
                catch (Exception ex)
                {
                    piecesReturnAccepted = false;
                    piecesReturnError = ex.Message;
                }

                if (piecesReturnAccepted)
                {
                    test.Passed = true;
                    test.Observed = "تم قبول إرجاع الـ 3 قطع بنجاح دون أي تعارض مع سطر الكرتونة.";
                }
                else
                {
                    test.Passed = false;
                    test.Observed = "تم رفض إرجاع الـ 3 قطع بخطأ: " + piecesReturnError + ". العطل موجود: التحقق تم مقابل سطر الكرتونة (كميته 1) بدلاً من سطر القطع.";
                }
                test.Details = string.Format("نتيجة إرجاع 3 قطع: {0}، رسالة الخطأ: {1}", piecesReturnAccepted, piecesReturnError);
            }
            catch (Exception ex)
            {
                test.Passed = false;
                test.Observed = "استثناء أثناء التنفيذ: " + ex.Message;
            }

            return test;
        }

        // الاختبار 9: خصم على الصنف وخصم على الفاتورة معاً
        private static AuditTestCaseResult RunTest9_ItemDiscountAndInvoiceDiscountTogether()
        {
            var test = new AuditTestCaseResult
            {
                TestNumber = 9,
                TestCode = "TEST-9",
                Title = "خصم على الصنف وخصم على الفاتورة معاً",
                Expected = "إجمالي الفاتورة 85 ج.م (8500 قرش) ومطابقة إجمالي البنود مع إجمالي الفاتورة",
                Passed = false
            };

            try
            {
                string prodId = "prod_both_disc_" + Guid.NewGuid().ToString("N");
                var prod = new Product
                {
                    Id = prodId,
                    Name = "صنف فحص الخصم المزدوج",
                    Barcode = GenerateUniqueBarcode(),
                    PricePiasters = 10000, // 100 LE
                    CostPiasters = 5000,
                    StockQuantityMilli = 10000,
                    Unit = "piece",
                    IsActive = true
                };
                DatabaseService.Products.SaveProduct(prod);

                // Line item discount: 10 LE (1000 piasters)
                // Invoice discount: 5 LE (500 piasters)
                var sale = new Sale
                {
                    PaymentMethod = "CASH",
                    DiscountPiasters = 500, // 5 LE invoice discount
                    Items = new List<SaleItem>
                    {
                        new SaleItem
                        {
                            ProductId = prodId,
                            UnitPricePiasters = 10000,
                            QuantityMilli = 1000, // 1 unit
                            DiscountPiasters = 1000 // 10 LE item discount
                        }
                    }
                };

                var createdSale = DatabaseService.Sales.ProcessSale(sale);

                // Reload from DB
                var loadedSale = DatabaseService.Sales.GetSaleById(createdSale.Id);
                long totalLines = 0;
                for (int i = 0; i < loadedSale.Items.Count; i++) totalLines += loadedSale.Items[i].TotalPiasters;

                if (loadedSale.TotalPiasters == 8500 && totalLines == 8500)
                {
                    test.Passed = true;
                    test.Observed = "إجمالي الفاتورة 85 ج.م وتطابق مجموع البنود 85 ج.م بشكل سليم.";
                }
                else
                {
                    test.Passed = false;
                    test.Observed = string.Format("الفاتورة المحفوظة إجماليها {0} ج.م ومجموع البنود {1} ج.م بدلاً من 85 ج.م. العطل موجود: لم يتم دمج وتوزيع خصم الفاتورة مع خصم الصنف.", loadedSale.TotalPiasters / 100.0, totalLines / 100.0);
                }
                test.Details = string.Format("الفاتورة: {0} قرش، مجموع البنود: {1} قرش، خصم الفاتورة: {2} قرش، خصم الصنف: {3} قرش", loadedSale.TotalPiasters, totalLines, loadedSale.DiscountPiasters, loadedSale.Items[0].DiscountPiasters);
            }
            catch (Exception ex)
            {
                test.Passed = false;
                test.Observed = "استثناء أثناء التنفيذ: " + ex.Message;
            }

            return test;
        }

        // الاختبار 10: الربح غير صحيح عند بيع كرتونة
        private static AuditTestCaseResult RunTest10_CartonCostAndProfit()
        {
            var test = new AuditTestCaseResult
            {
                TestNumber = 10,
                TestCode = "TEST-10",
                Title = "الربح غير صحيح عند بيع كرتونة (تخزين تكلفة الكرتونة في sale_items)",
                Expected = "تكلفة الكرتونة في sale_items.unit_cost_piasters تساوي 12000 قرش (120 ج.م) والربح 30 ج.م",
                Passed = false
            };

            try
            {
                string prodId = "prod_t10_" + Guid.NewGuid().ToString("N");
                var prod = new Product
                {
                    Id = prodId,
                    Name = "صنف كرتونة خاص بفحص الأرباح",
                    Barcode = GenerateUniqueBarcode(),
                    CostPiasters = 1000, // 10 LE piece cost
                    PricePiasters = 1500, // 15 LE
                    StockQuantityMilli = 100000,
                    Unit = "piece",
                    IsActive = true
                };
                DatabaseService.Products.SaveProduct(prod);

                var cartonUnit = new ProductUnit
                {
                    Id = "unit_t10_" + Guid.NewGuid().ToString("N"),
                    ProductId = prodId,
                    UnitName = "carton",
                    ConversionFactor = 12,
                    IsBaseUnit = false,
                    SellPricePiasters = 15000, // 150 LE
                    CostPricePiasters = 12000, // 120 LE
                    Barcode = GenerateUniqueBarcode(),
                    IsDivisible = false
                };
                DatabaseService.ProductUnits.CreateUnit(cartonUnit);

                // Sell 1 carton
                var sale = new Sale
                {
                    PaymentMethod = "CASH",
                    Items = new List<SaleItem>
                    {
                        new SaleItem
                        {
                            ProductId = prodId,
                            UnitId = cartonUnit.Id,
                            UnitName = cartonUnit.UnitName,
                            ConversionFactor = 12,
                            UnitPricePiasters = 15000,
                            QuantityMilli = 1000 // 1 carton
                        }
                    }
                };
                var createdSale = DatabaseService.Sales.ProcessSale(sale);

                // Check unit_cost_piasters stored in sale_items table
                long storedCostPiasters = 0;
                using (var conn = new SQLiteConnection(DatabaseService.ConnectionString))
                {
                    conn.Open();
                    using (var cmd = new SQLiteCommand("SELECT unit_cost_piasters FROM sale_items WHERE sale_id = @sid LIMIT 1;", conn))
                    {
                        cmd.Parameters.AddWithValue("@sid", createdSale.Id);
                        object val = cmd.ExecuteScalar();
                        if (val != null && val != DBNull.Value) storedCostPiasters = Convert.ToInt64(val);
                    }
                }

                if (storedCostPiasters == 12000)
                {
                    test.Passed = true;
                    test.Observed = "تم تخزين تكلفة الكرتونة بدقة 12000 قرش (120 ج.م) والربح 30 ج.م.";
                }
                else
                {
                    test.Passed = false;
                    test.Observed = string.Format("تم تخزين تكلفة الكرتونة بقيمة {0} قرش ({1} ج.م) بدلاً من 12000 قرش (120 ج.م)! العطل موجود: احتُسبت تكلفة القطعة الواحدة فقط (10 ج.م) فظهر الربح كأنه 140 ج.م بدلاً من 30 ج.م.", storedCostPiasters, storedCostPiasters / 100.0);
                }
                test.Details = string.Format("القيمة المسجلة في sale_items.unit_cost_piasters هي {0}", storedCostPiasters);
            }
            catch (Exception ex)
            {
                test.Passed = false;
                test.Observed = "استثناء أثناء التنفيذ: " + ex.Message;
            }

            return test;
        }

        // الاختبار 11: إلغاء البيع يترك المبلغ الزائد المدفوع للعميل كرصيد
        private static AuditTestCaseResult RunTest11_CancelSaleOverpaidCustomerCredit()
        {
            var test = new AuditTestCaseResult
            {
                TestNumber = 11,
                TestCode = "TEST-11",
                Title = "إلغاء البيع يترك المبلغ الزائد المدفوع للعميل كرصيد دائن",
                Expected = "رصيد العميل يعود إلى 0 بعد إلغاء الفاتورة",
                Passed = false
            };

            try
            {
                var cust = DatabaseService.Customers.SaveCustomer(new Customer
                {
                    Name = "TEST-CUST-11",
                    Phone = "01099" + Math.Abs(Guid.NewGuid().GetHashCode()).ToString("D6"),
                    BalancePiasters = 0,
                    IsArchived = false
                });

                string prodId = "prod_t11_" + Guid.NewGuid().ToString("N");
                var prod = new Product
                {
                    Id = prodId,
                    Name = "صنف فحص حساب العميل الملغى",
                    Barcode = GenerateUniqueBarcode(),
                    PricePiasters = 10000, // 100 LE
                    CostPiasters = 5000,
                    StockQuantityMilli = 10000,
                    Unit = "piece",
                    IsActive = true
                };
                DatabaseService.Products.SaveProduct(prod);

                // Sell 100 LE, customer pays 150 LE (15000 piasters) -> 50 LE overpayment credited
                var sale = new Sale
                {
                    CustomerId = cust.Id,
                    CustomerName = cust.Name,
                    PaymentMethod = "CASH",
                    TotalPiasters = 10000,
                    PaidPiasters = 15000,
                    Items = new List<SaleItem>
                    {
                        new SaleItem
                        {
                            ProductId = prodId,
                            UnitPricePiasters = 10000,
                            QuantityMilli = 1000
                        }
                    }
                };
                var createdSale = DatabaseService.Sales.ProcessSale(sale);

                // Check customer balance after sale
                long balAfterSale = DatabaseService.CustomerRepo.GetById(cust.Id).BalancePiasters; // should be -5000 (-50 LE)

                // Cancel the sale
                DatabaseService.Sales.CancelSale(createdSale.Id, "إلغاء فاتورة بها مدفوع زائد للعميل");

                long balAfterCancel = DatabaseService.CustomerRepo.GetById(cust.Id).BalancePiasters;

                if (balAfterCancel == 0)
                {
                    test.Passed = true;
                    test.Observed = "رصيد العميل عاد إلى 0 بشكل سليم بعد إلغاء الفاتورة.";
                }
                else
                {
                    test.Passed = false;
                    test.Observed = string.Format("رصيد العميل ظل {0} ج.م ({1} قرش) بدلاً من 0! العطل موجود: لم يتم إلغاء الرصيد الدائن للعميل عند إلغاء الفاتورة.", balAfterCancel / 100.0, balAfterCancel);
                }
                test.Details = string.Format("الرصيد بعد البيع: {0} قرش، الرصيد بعد الإلغاء: {1} قرش", balAfterSale, balAfterCancel);
            }
            catch (Exception ex)
            {
                test.Passed = false;
                test.Observed = "استثناء أثناء التنفيذ: " + ex.Message;
            }

            return test;
        }

        // الاختبار 13a: فرض ضريبة على سطر محدد ضريبته صفر
        private static AuditTestCaseResult RunTest13a_ZeroTaxLineOverride()
        {
            var test = new AuditTestCaseResult
            {
                TestNumber = 12,
                TestCode = "TEST-13a",
                Title = "فرض ضريبة على سطر محدد ضريبته صفر (Zero-tax line override)",
                Expected = "سطر الفاتورة يحتفظ بضريبة 0% و0 قرش ضريبة",
                Passed = false
            };

            try
            {
                // Product has 14% tax rate
                string prodId = "prod_tax_" + Guid.NewGuid().ToString("N");
                var prod = new Product
                {
                    Id = prodId,
                    Name = "صنف خاضع لضريبة 14",
                    Barcode = GenerateUniqueBarcode(),
                    PricePiasters = 10000, // 100 LE
                    CostPiasters = 5000,
                    TaxRatePercent = 14,
                    StockQuantityMilli = 10000,
                    Unit = "piece",
                    IsActive = true
                };
                DatabaseService.Products.SaveProduct(prod);

                // Create sale item explicitly setting TaxRatePercent = 0
                var sale = new Sale
                {
                    PaymentMethod = "CASH",
                    Items = new List<SaleItem>
                    {
                        new SaleItem
                        {
                            ProductId = prodId,
                            UnitPricePiasters = 10000,
                            QuantityMilli = 1000,
                            TaxRatePercent = 0 // Explicit 0%
                        }
                    }
                };
                var createdSale = DatabaseService.Sales.ProcessSale(sale);

                var loadedItem = createdSale.Items[0];

                if (loadedItem.TaxRatePercent == 0 && loadedItem.TaxPiasters == 0)
                {
                    test.Passed = true;
                    test.Observed = "سطر الفاتورة احتفظ بضريبة 0% و0 قرش ضريبة.";
                }
                else
                {
                    test.Passed = false;
                    test.Observed = string.Format("تم فرض ضريبة {0}% وقيمتها {1} قرش على السطر المعفى! العطل موجود: النظام يتجاهل نسبة 0% ويستبدلها بضريبة الصنف الافتراضية 14%.", loadedItem.TaxRatePercent, loadedItem.TaxPiasters);
                }
                test.Details = string.Format("النسبة المسجلة: {0}%، قيمة الضريبة: {1} قرش", loadedItem.TaxRatePercent, loadedItem.TaxPiasters);
            }
            catch (Exception ex)
            {
                test.Passed = false;
                test.Observed = "استثناء أثناء التنفيذ: " + ex.Message;
            }

            return test;
        }

        // الاختبار 5a: تنفيذ مرتجع على فاتورة ملغاة عبر الـ bridge
        private static AuditTestCaseResult RunTest5a_ReturnOnCancelledSaleViaBridge()
        {
            var test = new AuditTestCaseResult
            {
                TestNumber = 13,
                TestCode = "TEST-5a",
                Title = "تنفيذ مرتجع على فاتورة ملغاة عبر bridge (returns:create)",
                Expected = "رفض المرتجع بخطأ لأن الفاتورة ملغاة، وعدم زيادة المخزون",
                Passed = false
            };

            try
            {
                string prodId = "prod_c_ret_" + Guid.NewGuid().ToString("N");
                var prod = new Product
                {
                    Id = prodId,
                    Name = "صنف مرتجع الفاتورة الملغاة عبر الجسر",
                    Barcode = GenerateUniqueBarcode(),
                    PricePiasters = 2000,
                    CostPiasters = 1000,
                    StockQuantityMilli = 10000, // 10 units
                    Unit = "piece",
                    IsActive = true
                };
                DatabaseService.Products.SaveProduct(prod);

                // Sell 2 units (stock 8)
                var sale = new Sale
                {
                    PaymentMethod = "CASH",
                    Items = new List<SaleItem>
                    {
                        new SaleItem
                        {
                            ProductId = prodId,
                            UnitPricePiasters = 2000,
                            QuantityMilli = 2000
                        }
                    }
                };
                var createdSale = DatabaseService.Sales.ProcessSale(sale);

                // Cancel the sale (stock restored to 10)
                DatabaseService.Sales.CancelSale(createdSale.Id, "إلغاء الفاتورة");
                long stockAfterCancel = DatabaseService.ProductRepo.GetById(prodId).StockQuantityMilli; // 10000

                // Attempt to send returns:create for this cancelled sale via IPC Dispatcher
                var returnPayload = new JObject();
                returnPayload["saleId"] = createdSale.Id;
                returnPayload["reason"] = "محاولة مرتجع على فاتورة ملغاة";
                returnPayload["refundMethod"] = "cash";
                var rItem = new JObject();
                rItem["saleItemId"] = createdSale.Items[0].Id;
                rItem["productId"] = prodId;
                rItem["productName"] = "صنف مرتجع الفاتورة الملغاة عبر الجسر";
                rItem["quantityMilli"] = 1000;
                rItem["unitPricePiasters"] = 2000;
                rItem["totalPiasters"] = 2000;
                rItem["isDamaged"] = false;
                var rItems = new JArray();
                rItems.Add(rItem);
                returnPayload["items"] = rItems;

                var bridgeReq = new BridgeRequest
                {
                    Id = "req_t5a",
                    Action = "returns:create",
                    Payload = returnPayload
                };

                BridgeResponse resp = IpcDispatcher.Dispatch(bridgeReq);

                long stockAfterReturnAttempt = DatabaseService.ProductRepo.GetById(prodId).StockQuantityMilli;

                if (resp != null && !resp.Success)
                {
                    test.Passed = true;
                    test.Observed = "تم رفض المرتجع بنجاح بواسطة الـ bridge: " + (resp.Error != null ? resp.Error.Message : "");
                }
                else
                {
                    test.Passed = false;
                    test.Observed = string.Format("تم قبول المرتجع على الفاتورة الملغاة وأصبح المخزون {0} قطعة ({1} ملي) بدلاً من 10! العطل موجود: الـ bridge لا يتحقق من حالة الفاتورة الملغاة.", stockAfterReturnAttempt / 1000.0, stockAfterReturnAttempt);
                }
                test.Details = string.Format("استجابة الـ bridge: Success={0}, المخزون الحالي: {1}", resp != null ? resp.Success.ToString() : "null", stockAfterReturnAttempt);
            }
            catch (Exception ex)
            {
                test.Passed = false;
                test.Observed = "استثناء أثناء التنفيذ: " + ex.Message;
            }

            return test;
        }

        // الاختبار 6: رقم فاتورة وهمي يتجاوز الرقم السري للمشرف عبر bridge
        private static AuditTestCaseResult RunTest6_FakeSaleIdBypassesSupervisorPinViaBridge()
        {
            var test = new AuditTestCaseResult
            {
                TestNumber = 14,
                TestCode = "TEST-6",
                Title = "رقم فاتورة وهمي يتجاوز الرقم السري للمشرف عبر bridge",
                Expected = "رفض المرتجع وطلب الرقم السري للمشرف أو رفض الفاتورة الوهمية",
                Passed = false
            };

            try
            {
                // Enable Supervisor PIN in security
                DatabaseService.Security.SetPin("1234", null, null);
                DatabaseService.Security.EnablePin("1234");

                string prodId = "prod_fake_" + Guid.NewGuid().ToString("N");
                var prod = new Product
                {
                    Id = prodId,
                    Name = "صنف فحص تجاوز الرقم السري للمشرف",
                    Barcode = GenerateUniqueBarcode(),
                    PricePiasters = 2000,
                    CostPiasters = 1000,
                    StockQuantityMilli = 10000,
                    Unit = "piece",
                    IsActive = true
                };
                DatabaseService.Products.SaveProduct(prod);

                // Send returns:create with saleId = "fake-123" and isWithoutInvoice = false, NO supervisor PIN
                var returnPayload = new JObject();
                returnPayload["saleId"] = "fake-123";
                returnPayload["isWithoutInvoice"] = false;
                returnPayload["reason"] = "محاولة تجاوز PIN برقم وهمي";
                returnPayload["refundMethod"] = "cash";
                var rItem = new JObject();
                rItem["productId"] = prodId;
                rItem["productName"] = "صنف فحص تجاوز الرقم السري للمشرف";
                rItem["quantityMilli"] = 1000;
                rItem["unitPricePiasters"] = 2000;
                rItem["totalPiasters"] = 2000;
                rItem["isDamaged"] = false;
                var rItems = new JArray();
                rItems.Add(rItem);
                returnPayload["items"] = rItems;

                var bridgeReq = new BridgeRequest
                {
                    Id = "req_t6",
                    Action = "returns:create",
                    Payload = returnPayload
                };

                BridgeResponse resp = IpcDispatcher.Dispatch(bridgeReq);

                if (resp != null && !resp.Success)
                {
                    test.Passed = true;
                    test.Observed = "تم رفض الطلب بنجاح ومنع تجاوز PIN: " + (resp.Error != null ? resp.Error.Message : "");
                }
                else
                {
                    test.Passed = false;
                    test.Observed = "تم قبول المرتجع وحفظه بدون رقم سري للمشرف وبدون فاتورة حقيقية! العطل موجود: تجاوز كامل للرقم السري للمشرف بمجرد تمرير معرف وهمي.";
                }
                test.Details = string.Format("استجابة الـ bridge: Success={0}, Error={1}", resp != null ? resp.Success.ToString() : "null", resp != null && resp.Error != null ? resp.Error.Message : "None");
            }
            catch (Exception ex)
            {
                test.Passed = false;
                test.Observed = "استثناء أثناء التنفيذ: " + ex.Message;
            }

            return test;
        }

        // الاختبار 7b: مبلغ استرداد مختلق عبر bridge
        private static AuditTestCaseResult RunTest7b_ManipulatedRefundTotalViaBridge()
        {
            var test = new AuditTestCaseResult
            {
                TestNumber = 15,
                TestCode = "TEST-7b",
                Title = "مبلغ استرداد مختلق عبر bridge (totalPiasters: 99999999)",
                Expected = "رفض الطلب أو إعادة حساب الإجمالي الفعلي للأصناف المرتجعة ومنع المبلغ المختلق",
                Passed = false
            };

            try
            {
                string prodId = "prod_t7b_" + Guid.NewGuid().ToString("N");
                var prod = new Product
                {
                    Id = prodId,
                    Name = "صنف فحص التلاعب بمبلغ الاسترداد",
                    Barcode = GenerateUniqueBarcode(),
                    PricePiasters = 2000, // 20 LE
                    CostPiasters = 1000,
                    StockQuantityMilli = 10000,
                    Unit = "piece",
                    IsActive = true
                };
                DatabaseService.Products.SaveProduct(prod);

                var sale = new Sale
                {
                    PaymentMethod = "CASH",
                    Items = new List<SaleItem>
                    {
                        new SaleItem
                        {
                            ProductId = prodId,
                            UnitPricePiasters = 2000,
                            QuantityMilli = 1000
                        }
                    }
                };
                var createdSale = DatabaseService.Sales.ProcessSale(sale);

                // Send returns:create with forged totalPiasters = 99999999 (999,999.99 LE)
                var returnPayload = new JObject();
                returnPayload["saleId"] = createdSale.Id;
                returnPayload["reason"] = "تلاعب بمبلغ الاسترداد";
                returnPayload["refundMethod"] = "cash";
                returnPayload["totalPiasters"] = 99999999;
                var rItem = new JObject();
                rItem["saleItemId"] = createdSale.Items[0].Id;
                rItem["productId"] = prodId;
                rItem["productName"] = "صنف فحص التلاعب بمبلغ الاسترداد";
                rItem["quantityMilli"] = 1000;
                rItem["unitPricePiasters"] = 2000;
                rItem["totalPiasters"] = 2000;
                rItem["isDamaged"] = false;
                var rItems = new JArray();
                rItems.Add(rItem);
                returnPayload["items"] = rItems;

                var bridgeReq = new BridgeRequest
                {
                    Id = "req_t7b",
                    Action = "returns:create",
                    Payload = returnPayload
                };

                BridgeResponse resp = IpcDispatcher.Dispatch(bridgeReq);

                long savedReturnTotal = 0;
                using (var conn = new SQLiteConnection(DatabaseService.ConnectionString))
                {
                    conn.Open();
                    using (var cmd = new SQLiteCommand("SELECT total_piasters FROM returns WHERE sale_id = @sid ORDER BY rowid DESC LIMIT 1;", conn))
                    {
                        cmd.Parameters.AddWithValue("@sid", createdSale.Id);
                        object val = cmd.ExecuteScalar();
                        if (val != null && val != DBNull.Value) savedReturnTotal = Convert.ToInt64(val);
                    }
                }

                if (resp != null && !resp.Success)
                {
                    test.Passed = true;
                    test.Observed = "تم رفض الطلب المتلاعب به بنجاح: " + (resp.Error != null ? resp.Error.Message : "");
                }
                else if (savedReturnTotal == 2000)
                {
                    test.Passed = true;
                    test.Observed = "تم تصحيح الإجمالي تلقائياً إلى 2000 قرش وتجاهل المبلغ المزيف.";
                }
                else
                {
                    test.Passed = false;
                    test.Observed = string.Format("تم حفظ المرتجع بمبلغ مختلق قدره {0} ج.م ({1} قرش)! العطل موجود: النظام قبل إجمالي الاسترداد الممرر دون تدقيق.", savedReturnTotal / 100.0, savedReturnTotal);
                }
                test.Details = string.Format("القيمة المخزنة في جدول returns.total_piasters هي {0}", savedReturnTotal);
            }
            catch (Exception ex)
            {
                test.Passed = false;
                test.Observed = "استثناء أثناء التنفيذ: " + ex.Message;
            }

            return test;
        }

        // الاختبار 12: مبالغ الدفعات لا تساوي إجمالي المبلغ المدفوع عبر bridge
        private static AuditTestCaseResult RunTest12_SplitPaymentsSumMismatchViaBridge()
        {
            var test = new AuditTestCaseResult
            {
                TestNumber = 16,
                TestCode = "TEST-12",
                Title = "مبالغ الدفعات لا تساوي إجمالي المبلغ المدفوع عبر bridge (payments sum mismatch)",
                Expected = "رفض العملية لعدم تطابق تفاصيل الدفع (5000) مع المدفوع الفعلي (10000)",
                Passed = false
            };

            try
            {
                string prodId = "prod_t12_" + Guid.NewGuid().ToString("N");
                var prod = new Product
                {
                    Id = prodId,
                    Name = "صنف فحص تجزئة الدفعات عبر الجسر",
                    Barcode = GenerateUniqueBarcode(),
                    PricePiasters = 10000, // 100 LE
                    CostPiasters = 5000,
                    StockQuantityMilli = 10000,
                    Unit = "piece",
                    IsActive = true
                };
                DatabaseService.Products.SaveProduct(prod);

                // Send sales:create with paidPiasters: 10000, but payments: [{method: 'cash', amountPiasters: 5000}]
                var salePayload = new JObject();
                salePayload["totalPiasters"] = 10000;
                salePayload["paidPiasters"] = 10000;
                salePayload["paymentMethod"] = "multiple";
                var itemObj = new JObject();
                itemObj["productId"] = prodId;
                itemObj["productName"] = "صنف فحص تجزئة الدفعات عبر الجسر";
                itemObj["quantityMilli"] = 1000;
                itemObj["unitPricePiasters"] = 10000;
                itemObj["totalPiasters"] = 10000;
                var itemsArr = new JArray();
                itemsArr.Add(itemObj);
                salePayload["items"] = itemsArr;

                var payObj = new JObject();
                payObj["method"] = "cash";
                payObj["amountPiasters"] = 5000;
                var paysArr = new JArray();
                paysArr.Add(payObj);
                salePayload["payments"] = paysArr;

                var bridgeReq = new BridgeRequest
                {
                    Id = "req_t12",
                    Action = "sales:create",
                    Payload = salePayload
                };

                BridgeResponse resp = IpcDispatcher.Dispatch(bridgeReq);

                if (resp != null && !resp.Success)
                {
                    test.Passed = true;
                    test.Observed = "تم رفض عملية البيع بنجاح لعدم تطابق مبالغ الدفعات: " + (resp.Error != null ? resp.Error.Message : "");
                }
                else
                {
                    test.Passed = false;
                    test.Observed = "تم حفظ الفاتورة بنجاح رغم عدم تطابق مجموع الدفعات (5000) مع المبلغ المدفوع (10000)! العطل موجود: يُحدث عجزاً وتفاوتاً بين الإقفال اليومي وإجمالي المبيعات.";
                }
                test.Details = string.Format("استجابة الـ bridge: Success={0}, Error={1}", resp != null ? resp.Success.ToString() : "null", resp != null && resp.Error != null ? resp.Error.Message : "None");
            }
            catch (Exception ex)
            {
                test.Passed = false;
                test.Observed = "استثناء أثناء التنفيذ: " + ex.Message;
            }

            return test;
        }
    }
}
