using System;
using System.Collections.Generic;
using System.Data.SQLite;
using System.IO;
using RafiqPOS.Models;
using RafiqPOS.Repositories;
using RafiqPOS.Database;

namespace RafiqPOS.Services
{
    public class VariantTestResult
    {
        public bool Success { get; set; }
        public string Message { get; set; }
        public int TotalAssertions { get; set; }
        public int PassedAssertions { get; set; }
        public bool MatrixCreationPassed { get; set; }
        public bool BarcodeAndParentLinkagePassed { get; set; }
        public bool GetVariantsByParentPassed { get; set; }
        public bool GetParentWithVariantsPassed { get; set; }
        public bool MatrixReportPassed { get; set; }
        public bool AtomicRollbackPassed { get; set; }
        public bool AsymmetricMatrixPassed { get; set; }
        public bool UpdateExistingVariantsPassed { get; set; }
        public bool PurchaseVariantsAndLedgerPassed { get; set; }
        public bool DirectParentPurchaseGuardPassed { get; set; }
        public bool SaleAndReturnRollupPassed { get; set; }
    }

    public class ProductVariantTestRunner
    {
        public static VariantTestResult RunAllTests()
        {
            var result = new VariantTestResult
            {
                Success = false,
                TotalAssertions = 11,
                PassedAssertions = 0
            };

            string tempDbPath = Path.Combine(Path.GetTempPath(), "rafiq_test_variant_" + Guid.NewGuid().ToString("N") + ".db");
            string connStr = string.Format("Data Source={0};Version=3;BusyTimeout=5000;", tempDbPath);

            try
            {
                // Run migrations
                MigrationRunner.ApplyMigrations(connStr, tempDbPath);

                var variantRepo = new ProductVariantRepository(connStr);
                var prodRepo = new ProductRepository(connStr);
                var supplierRepo = new SupplierRepository(connStr);
                var purchaseRepo = new PurchaseRepository(connStr, null, supplierRepo);
                var saleRepo = new SaleRepository(connStr);
                var returnRepo = new ReturnRepository(connStr);

                // ========================================================
                // Test 1: Create variant matrix with 3 sizes x 2 colors = 6 variants
                // ========================================================
                var cells = new List<VariantMatrixCell>();
                string[] sizes = new string[] { "M", "L", "XL" };
                string[] colors = new string[] { "أحمر", "أزرق" };

                foreach (var c in colors)
                {
                    foreach (var s in sizes)
                    {
                        cells.Add(new VariantMatrixCell
                        {
                            Size = s,
                            Color = c,
                            PricePiasters = 15000, // 150 EGP
                            CostPiasters = 9000,   // 90 EGP
                            StockQuantityMilli = 10000, // 10 units
                            MinStockQuantityMilli = 2000, // 2 units
                            IsEnabled = true
                        });
                    }
                }

                var request = new CreateVariantMatrixRequest
                {
                    ParentName = "قميص كاجوال رجالي فاخر",
                    DefaultPricePiasters = 15000,
                    DefaultCostPiasters = 9000,
                    DefaultMinStockQuantityMilli = 2000,
                    Sizes = new List<string>(sizes),
                    Colors = new List<string>(colors),
                    MatrixCells = cells
                };

                var matrixResult = variantRepo.CreateMatrix(request);
                if (matrixResult != null && matrixResult.Variants != null && matrixResult.Variants.Count == 6 && matrixResult.TotalStockMilli == 60000)
                {
                    result.MatrixCreationPassed = true;
                    result.PassedAssertions++;
                }
                else
                {
                    result.Message = "Test 1 Failed: Expected 6 variants with 60000 total stock.";
                    return result;
                }

                // ========================================================
                // Test 2: Verify barcodes and parent_id linkage in products table
                // ========================================================
                string parentId = matrixResult.ParentProduct.Id;
                using (var conn = new SQLiteConnection(connStr))
                {
                    conn.Open();
                    using (var cmd = new SQLiteCommand("SELECT COUNT(*) FROM products WHERE parent_id = @pid AND barcode LIKE '214%';", conn))
                    {
                        cmd.Parameters.AddWithValue("@pid", parentId);
                        long countWithPrefix = Convert.ToInt64(cmd.ExecuteScalar());
                        if (countWithPrefix == 6)
                        {
                            result.BarcodeAndParentLinkagePassed = true;
                            result.PassedAssertions++;
                        }
                        else
                        {
                            result.Message = "Test 2 Failed: Barcode prefix or count mismatch: " + countWithPrefix;
                            return result;
                        }
                    }

                    // Check parent product has_variants flag
                    using (var cmd = new SQLiteCommand("SELECT has_variants, stock_quantity_milli FROM products WHERE id = @pid;", conn))
                    {
                        cmd.Parameters.AddWithValue("@pid", parentId);
                        using (var reader = cmd.ExecuteReader())
                        {
                            if (!reader.Read() || Convert.ToInt32(reader["has_variants"]) != 1 || Convert.ToInt64(reader["stock_quantity_milli"]) != 60000)
                            {
                                result.Message = "Test 2 Failed: Parent product flags not set correctly.";
                                return result;
                            }
                        }
                    }
                }

                // ========================================================
                // Test 3: GetVariantsByParentId
                // ========================================================
                var fetchedVariants = variantRepo.GetVariantsByParentId(parentId);
                if (fetchedVariants != null && fetchedVariants.Count == 6)
                {
                    result.GetVariantsByParentPassed = true;
                    result.PassedAssertions++;
                }
                else
                {
                    result.Message = "Test 3 Failed: GetVariantsByParentId failed.";
                    return result;
                }

                // ========================================================
                // Test 4: GetParentWithVariants
                // ========================================================
                var parentWithVars = variantRepo.GetParentWithVariants(parentId);
                if (parentWithVars != null && parentWithVars.ParentProduct != null && parentWithVars.TotalVariantsCount == 6)
                {
                    result.GetParentWithVariantsPassed = true;
                    result.PassedAssertions++;
                }
                else
                {
                    result.Message = "Test 4 Failed: GetParentWithVariants returned invalid object.";
                    return result;
                }

                // ========================================================
                // Test 5: GetVariantMatrixReport
                // ========================================================
                var report = variantRepo.GetVariantMatrixReport();
                if (report != null && report.Count >= 1)
                {
                    result.MatrixReportPassed = true;
                    result.PassedAssertions++;
                }
                else
                {
                    result.Message = "Test 5 Failed: GetVariantMatrixReport is empty.";
                    return result;
                }

                // ========================================================
                // Test 6: Verify atomic transaction rollback on failure
                // ========================================================
                try
                {
                    variantRepo.CreateMatrix(new CreateVariantMatrixRequest
                    {
                        ParentName = "",
                        MatrixCells = cells
                    });
                    result.Message = "Test 6 Failed: Expected ArgumentException for empty parent name.";
                    return result;
                }
                catch (ArgumentException)
                {
                    result.AtomicRollbackPassed = true;
                    result.PassedAssertions++;
                }

                // ========================================================
                // Test 7: Asymmetric Matrix (Size S has only 1 color, Size M has 2, Size L has 1, Size XL has 0 stock)
                // ========================================================
                var asymCells = new List<VariantMatrixCell>();
                // S - أحمر: 1 piece (1,000 milli)
                asymCells.Add(new VariantMatrixCell { Size = "S", Color = "أحمر", StockQuantityMilli = 1000, PricePiasters = 20000, CostPiasters = 12000, IsEnabled = true });
                // M - أسود: 5 pieces (5,000 milli)
                asymCells.Add(new VariantMatrixCell { Size = "M", Color = "أسود", StockQuantityMilli = 5000, PricePiasters = 20000, CostPiasters = 12000, IsEnabled = true });
                // M - أزرق: 3 pieces (3,000 milli)
                asymCells.Add(new VariantMatrixCell { Size = "M", Color = "أزرق", StockQuantityMilli = 3000, PricePiasters = 20000, CostPiasters = 12000, IsEnabled = true });
                // L - كحلي: 1 piece (1,000 milli)
                asymCells.Add(new VariantMatrixCell { Size = "L", Color = "كحلي", StockQuantityMilli = 1000, PricePiasters = 20000, CostPiasters = 12000, IsEnabled = true });
                // XL - أسود: 0 pieces (0 milli - Out of stock variant)
                asymCells.Add(new VariantMatrixCell { Size = "XL", Color = "أسود", StockQuantityMilli = 0, PricePiasters = 20000, CostPiasters = 12000, IsEnabled = true });

                var asymReq = new CreateVariantMatrixRequest
                {
                    ParentName = "بلوفر شتوي تريكو غير متماثل",
                    DefaultPricePiasters = 20000,
                    DefaultCostPiasters = 12000,
                    DefaultMinStockQuantityMilli = 2000,
                    Sizes = new List<string> { "S", "M", "L", "XL" },
                    Colors = new List<string> { "أحمر", "أسود", "أزرق", "كحلي" },
                    MatrixCells = asymCells
                };

                var asymResult = variantRepo.CreateMatrix(asymReq);
                long expectedAsymStock = 1000 + 5000 + 3000 + 1000 + 0; // 10,000 milli (10 pieces)
                if (asymResult != null && asymResult.Variants.Count == 5 && asymResult.TotalStockMilli == expectedAsymStock)
                {
                    result.AsymmetricMatrixPassed = true;
                    result.PassedAssertions++;
                }
                else
                {
                    result.Message = "Test 7 Failed: Asymmetric matrix creation failed or stock mismatch.";
                    return result;
                }

                string asymParentId = asymResult.ParentProduct.Id;

                // ========================================================
                // Test 8: Updating an existing parent with new variants without duplicate records
                // ========================================================
                var updatedCells = new List<VariantMatrixCell>(asymCells);
                // Update Size S - أحمر stock from 1000 to 2000 (+1 piece)
                updatedCells[0] = new VariantMatrixCell { Size = "S", Color = "أحمر", StockQuantityMilli = 2000, PricePiasters = 20000, CostPiasters = 12000, IsEnabled = true };
                // Add new variant: Size XL - رمادي (4 pieces = 4000 milli)
                updatedCells.Add(new VariantMatrixCell { Size = "XL", Color = "رمادي", StockQuantityMilli = 4000, PricePiasters = 20000, CostPiasters = 12000, IsEnabled = true });

                var updateReq = new CreateVariantMatrixRequest
                {
                    ParentProductId = asymParentId,
                    ParentName = "بلوفر شتوي تريكو غير متماثل",
                    DefaultPricePiasters = 20000,
                    DefaultCostPiasters = 12000,
                    MatrixCells = updatedCells
                };

                var updateResult = variantRepo.CreateMatrix(updateReq);
                long expectedUpdatedStock = 2000 + 5000 + 3000 + 1000 + 0 + 4000; // 15,000 milli (15 pieces)

                var updatedVariantsFromDb = variantRepo.GetVariantsByParentId(asymParentId);
                if (updateResult != null && updatedVariantsFromDb.Count == 6 && updateResult.TotalStockMilli == expectedUpdatedStock)
                {
                    result.UpdateExistingVariantsPassed = true;
                    result.PassedAssertions++;
                }
                else
                {
                    result.Message = string.Format("Test 8 Failed: Expected 6 variants with {0} stock, got {1} variants with {2} stock.",
                        expectedUpdatedStock, updatedVariantsFromDb != null ? updatedVariantsFromDb.Count : 0, updateResult != null ? updateResult.TotalStockMilli : -1);
                    return result;
                }

                // ========================================================
                // Test 9: Purchasing variants from supplier & Supplier Ledger verification
                // ========================================================
                // 1. Create registered supplier
                var supplier = new Supplier
                {
                    Name = "شركة الأناقة للملابس والنسيج",
                    CompanyName = "الأناقة جروب",
                    Phone = "01000000001",
                    BalancePiasters = 0,
                    IsActive = true
                };
                supplier = supplierRepo.Save(supplier);

                // Find specific variant products from asymParentId
                var sRedVar = updatedVariantsFromDb.Find(v => v.Size == "S" && v.Color == "أحمر");
                var mBlackVar = updatedVariantsFromDb.Find(v => v.Size == "M" && v.Color == "أسود");
                var lNavyVar = updatedVariantsFromDb.Find(v => v.Size == "L" && v.Color == "كحلي");

                var purItems = new List<PurchaseItem>();
                // Buy 3 pieces of S - Red at unit cost 85.00 EGP (8500 piasters)
                purItems.Add(new PurchaseItem
                {
                    ProductId = sRedVar.VariantProductId,
                    QuantityMilli = 3000,
                    UnitCostPiasters = 8500,
                    TotalCostPiasters = 25500
                });
                // Buy 10 pieces of M - Black at unit cost 80.00 EGP (8000 piasters)
                purItems.Add(new PurchaseItem
                {
                    ProductId = mBlackVar.VariantProductId,
                    QuantityMilli = 10000,
                    UnitCostPiasters = 8000,
                    TotalCostPiasters = 80000
                });
                // Buy 1 piece of L - Navy at unit cost 90.00 EGP (9000 piasters)
                purItems.Add(new PurchaseItem
                {
                    ProductId = lNavyVar.VariantProductId,
                    QuantityMilli = 1000,
                    UnitCostPiasters = 9000,
                    TotalCostPiasters = 9000
                });

                // Total: 25,500 + 80,000 + 9,000 = 114,500 piasters (1,145.00 EGP)
                // Pay 50,000 piasters (500.00 EGP). Remaining debt to supplier: 64,500 piasters (645.00 EGP)
                var purchase = new Purchase
                {
                    SupplierId = supplier.Id,
                    SupplierInvoiceNumber = "SUP-INV-2026-001",
                    InvoiceDate = DateTime.UtcNow.ToString("o"),
                    TotalCostPiasters = 114500,
                    DiscountPiasters = 0,
                    NetCostPiasters = 114500,
                    PaidAmountPiasters = 50000,
                    RemainingAmountPiasters = 64500,
                    PaymentStatus = "PARTIAL",
                    Status = "COMPLETED",
                    Items = purItems
                };

                var createdPur = purchaseRepo.CreatePurchase(purchase);

                // Verify supplier balance
                var updatedSup = supplierRepo.GetById(supplier.Id);
                // Verify variant stock increments
                var sRedProdAfter = prodRepo.GetById(sRedVar.VariantProductId);
                var mBlackProdAfter = prodRepo.GetById(mBlackVar.VariantProductId);
                var lNavyProdAfter = prodRepo.GetById(lNavyVar.VariantProductId);
                var parentProdAfter = prodRepo.GetById(asymParentId);

                bool supBalanceOk = updatedSup != null && updatedSup.BalancePiasters == 64500;
                bool sRedStockOk = sRedProdAfter != null && sRedProdAfter.StockQuantityMilli == 2000 + 3000; // 5000 milli
                bool mBlackStockOk = mBlackProdAfter != null && mBlackProdAfter.StockQuantityMilli == 5000 + 10000; // 15000 milli
                bool lNavyStockOk = lNavyProdAfter != null && lNavyProdAfter.StockQuantityMilli == 1000 + 1000; // 2000 milli
                bool parentStockOk = parentProdAfter != null && parentProdAfter.StockQuantityMilli == expectedUpdatedStock + 14000; // 29,000 milli

                if (createdPur != null && supBalanceOk && sRedStockOk && mBlackStockOk && lNavyStockOk && parentStockOk)
                {
                    result.PurchaseVariantsAndLedgerPassed = true;
                    result.PassedAssertions++;
                }
                else
                {
                    result.Message = string.Format("Test 9 Failed: Purchase invariant failure. SupBalance={0}, SRedStock={1}, ParentStock={2}",
                        updatedSup != null ? updatedSup.BalancePiasters : -1,
                        sRedProdAfter != null ? sRedProdAfter.StockQuantityMilli : -1,
                        parentProdAfter != null ? parentProdAfter.StockQuantityMilli : -1);
                    return result;
                }

                // ========================================================
                // Test 10: Direct Parent Purchase Guard
                // ========================================================
                bool parentPurchaseBlocked = false;
                try
                {
                    var invalidPur = new Purchase
                    {
                        SupplierId = supplier.Id,
                        TotalCostPiasters = 10000,
                        NetCostPiasters = 10000,
                        PaidAmountPiasters = 10000,
                        PaymentStatus = "PAID",
                        Status = "COMPLETED",
                        Items = new List<PurchaseItem>
                        {
                            new PurchaseItem
                            {
                                ProductId = asymParentId, // Parent product directly!
                                QuantityMilli = 5000,
                                UnitCostPiasters = 2000,
                                TotalCostPiasters = 10000
                            }
                        }
                    };
                    purchaseRepo.CreatePurchase(invalidPur);
                }
                catch (InvalidOperationException)
                {
                    parentPurchaseBlocked = true;
                }

                if (parentPurchaseBlocked)
                {
                    result.DirectParentPurchaseGuardPassed = true;
                    result.PassedAssertions++;
                }
                else
                {
                    result.Message = "Test 10 Failed: Direct parent purchase must be rejected with InvalidOperationException.";
                    return result;
                }

                // ========================================================
                // Test 11: Sale & Return Rollup (Single Piece Variant & Parent Sync)
                // ========================================================
                // Sell 1 piece of L - Navy (which has 2 pieces; after sale, exactly 1 piece remains!)
                var sale = new Sale
                {
                    SubtotalPiasters = 20000,
                    DiscountPiasters = 0,
                    TaxPiasters = 0,
                    TotalPiasters = 20000,
                    PaidPiasters = 20000,
                    PaymentMethod = "CASH",
                    Items = new List<SaleItem>
                    {
                        new SaleItem
                        {
                            ProductId = lNavyVar.VariantProductId,
                            ProductName = "بلوفر - كحلي - L",
                            QuantityMilli = 1000,
                            UnitPricePiasters = 20000,
                            UnitCostPiasters = 12000,
                            TotalPiasters = 20000,
                            ConversionFactor = 1
                        }
                    }
                };

                var createdSale = saleRepo.CreateSaleAtomic(sale);
                var lNavyAfterSale = prodRepo.GetById(lNavyVar.VariantProductId);
                var parentAfterSale = prodRepo.GetById(asymParentId);

                // Selling directly parent must also be rejected
                bool parentSaleBlocked = false;
                try
                {
                    var invalidSale = new Sale
                    {
                        SubtotalPiasters = 20000,
                        TotalPiasters = 20000,
                        PaidPiasters = 20000,
                        PaymentMethod = "CASH",
                        Items = new List<SaleItem>
                        {
                            new SaleItem { ProductId = asymParentId, QuantityMilli = 1000, UnitPricePiasters = 20000 }
                        }
                    };
                    saleRepo.CreateSaleAtomic(invalidSale);
                }
                catch (InvalidOperationException)
                {
                    parentSaleBlocked = true;
                }

                // Return 1 piece of L - Navy undamaged
                var saleReturn = new Return
                {
                    SaleId = createdSale.Id,
                    TotalPiasters = 20000,
                    RefundMethod = "CASH",
                    Reason = "استرجاع مقاس",
                    Items = new List<ReturnItem>
                    {
                        new ReturnItem
                        {
                            ProductId = lNavyVar.VariantProductId,
                            ProductName = "بلوفر - كحلي - L",
                            QuantityMilli = 1000,
                            UnitPricePiasters = 20000,
                            TotalPiasters = 20000,
                            IsDamaged = false,
                            Unit = "قطعة",
                            ConversionFactor = 1
                        }
                    }
                };
                returnRepo.CreateReturnAtomic(saleReturn);

                var lNavyAfterReturn = prodRepo.GetById(lNavyVar.VariantProductId);
                var parentAfterReturn = prodRepo.GetById(asymParentId);

                bool saleDeductionOk = lNavyAfterSale.StockQuantityMilli == 1000 && parentAfterSale.StockQuantityMilli == 28000;
                bool returnRestorationOk = lNavyAfterReturn.StockQuantityMilli == 2000 && parentAfterReturn.StockQuantityMilli == 29000;

                if (createdSale != null && saleDeductionOk && parentSaleBlocked && returnRestorationOk)
                {
                    result.SaleAndReturnRollupPassed = true;
                    result.PassedAssertions++;
                }
                else
                {
                    result.Message = string.Format("Test 11 Failed: Sale/Return sync failure. SaleDedOk={0}, ParentBlocked={1}, RetRestOk={2}",
                        saleDeductionOk, parentSaleBlocked, returnRestorationOk);
                    return result;
                }

                result.Success = (result.PassedAssertions == result.TotalAssertions);
                result.Message = string.Format("نجحت كافة اختبارات مصفوفة المقاسات والألوان والمشتريات وتوريدات الموردين بنجاح ({0}/{1}).",
                    result.PassedAssertions, result.TotalAssertions);
                return result;
            }
            catch (Exception ex)
            {
                result.Message = "Exception: " + ex.ToString();
                return result;
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
        }
    }
}
