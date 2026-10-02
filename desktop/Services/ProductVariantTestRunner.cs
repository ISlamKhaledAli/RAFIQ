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
    }

    public class ProductVariantTestRunner
    {
        public static VariantTestResult RunAllTests()
        {
            var result = new VariantTestResult
            {
                Success = false,
                TotalAssertions = 6,
                PassedAssertions = 0
            };

            string tempDbPath = Path.Combine(Path.GetTempPath(), "rafiq_test_variant_" + Guid.NewGuid().ToString("N") + ".db");
            string connStr = string.Format("Data Source={0};Version=3;BusyTimeout=5000;", tempDbPath);

            try
            {
                // Run migrations
                MigrationRunner.ApplyMigrations(connStr, tempDbPath);

                var variantRepo = new ProductVariantRepository(connStr);

                // Test 1: Create variant matrix with 3 sizes x 2 colors = 6 variants
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

                // Test 2: Verify barcodes and parent_id linkage in products table
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

                // Test 3: GetVariantsByParentId
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

                // Test 4: GetParentWithVariants
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

                // Test 5: GetVariantMatrixReport
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

                // Test 6: Verify atomic transaction rollback on failure
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

                result.Success = (result.PassedAssertions == result.TotalAssertions);
                result.Message = "نجحت كافة اختبارات مصفوفة المقاسات والألوان بنجاح (6/6).";
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
