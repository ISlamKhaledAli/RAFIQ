using System;
using System.IO;
using RafiqPOS.Database;
using RafiqPOS.Models;
using RafiqPOS.Repositories;

namespace RafiqPOS.Services
{
    public class ProductUnitTestResult
    {
        public bool Success { get; set; }
        public string Message { get; set; }
        public int TotalAssertions { get; set; }
        public int PassedAssertions { get; set; }
    }

    public static class ProductUnitTestRunner
    {
        public static ProductUnitTestResult RunAllTests()
        {
            var result = new ProductUnitTestResult
            {
                Success = true,
                TotalAssertions = 0,
                PassedAssertions = 0
            };

            string tempDbPath = Path.Combine(Path.GetTempPath(), "rafiq_unit_test_" + Guid.NewGuid().ToString("N") + ".db");
            string tempConnStr = string.Format("Data Source={0};Version=3;BusyTimeout=5000;", tempDbPath);

            try
            {
                // 1. Run migrations including Migration 14 (Multi-units)
                MigrationRunner.ApplyMigrations(tempConnStr, tempDbPath);
                Assert(File.Exists(tempDbPath), "قاعدة البيانات التجريبية تم إنشاؤها بنجاح مع دعم الوحدات المتعددة", result);

                // 2. Repositories & Services setup
                var auditRepo = new AuditLogRepository(tempConnStr);
                var counterRepo = new CounterRepository(tempConnStr);
                var batchRepo = new ProductBatchRepository(tempConnStr, auditRepo);
                var productRepo = new ProductRepository(tempConnStr, auditRepo);
                var smRepo = new StockMovementRepository(tempConnStr);
                var priceHistoryRepo = new ProductPriceHistoryRepository(tempConnStr);
                var productService = new ProductService(productRepo, auditRepo, priceHistoryRepo, smRepo);
                var unitService = new ProductUnitService(tempConnStr);
                var saleRepo = new SaleRepository(tempConnStr, counterRepo, auditRepo, batchRepo);

                // TEST 1: Base Product & Default Base Unit
                var prod = new Product
                {
                    Id = "prod_multiunit_1",
                    Name = "عصير مانجو جهينة 1 لتر",
                    Barcode = "6221112223334",
                    PricePiasters = 2500, // 25.00 EGP
                    CostPiasters = 1800,  // 18.00 EGP
                    StockQuantityMilli = 120000, // 120 pieces in stock
                    Unit = "piece",
                    IsActive = true
                };
                productService.SaveProduct(prod);
                unitService.EnsureDefaultBaseUnit(prod);

                var baseUnit = unitService.GetBaseUnit(prod.Id);
                Assert(baseUnit != null, "تم إنشاء الوحدة الأساسية الافتراضية بنجاح", result);
                Assert(baseUnit.IsBaseUnit && baseUnit.ConversionFactor == 1, "معامل تحويل الوحدة الأساسية يساوي 1 دائماً", result);
                Assert(baseUnit.SellPricePiasters == 2500, "سعر بيع الوحدة الأساسية مطابق لسعر المنتج", result);

                // TEST 2: Add Secondary Units (كرتونة = 12 قطعة، دستة = 6 قطع)
                var cartonUnit = new ProductUnit
                {
                    Id = "unit_carton_1",
                    ProductId = prod.Id,
                    UnitName = "كرتونة 12 قطعة",
                    ConversionFactor = 12,
                    IsBaseUnit = false,
                    SellPricePiasters = 28000, // 280.00 EGP (wholesale discount vs 300)
                    CostPricePiasters = 21000, // 210.00 EGP
                    Barcode = "6221112229999", // Carton barcode
                    IsDivisible = false,
                    SortOrder = 1
                };
                unitService.CreateUnit(cartonUnit);

                var halfDozenUnit = new ProductUnit
                {
                    Id = "unit_half_dozen_1",
                    ProductId = prod.Id,
                    UnitName = "باكت 6 قطع",
                    ConversionFactor = 6,
                    IsBaseUnit = false,
                    SellPricePiasters = 14500, // 145.00 EGP
                    CostPricePiasters = 10500,
                    Barcode = "6221112226666",
                    IsDivisible = false,
                    SortOrder = 2
                };
                unitService.CreateUnit(halfDozenUnit);

                var allUnits = unitService.GetUnitsForProduct(prod.Id);
                Assert(allUnits.Count == 3, "المنتج يحتوي على 3 وحدات (أساسية + كرتونة + باكت)", result);

                // TEST 3: Barcode lookup of secondary units
                var foundByBarcode = unitService.GetByBarcode("6221112229999");
                Assert(foundByBarcode != null && foundByBarcode.Id == "unit_carton_1", "البحث بباركود الكرتونة يرجع وحدة الكرتونة مباشرة", result);

                // TEST 4: Profit calculation and margin rounding
                var profitInfo = unitService.CalculateProfit(cartonUnit, baseUnit);
                Assert(profitInfo != null, "تم حساب أرباح وحدة الكرتونة بنجاح", result);
                Assert(profitInfo.ProfitPiasters == 7000, "ربح الكرتونة = 280.00 - 210.00 = 70.00 ج (7000 قرش)", result);
                Assert(profitInfo.MarginPercentagePoints == 25, "نسبة هامش ربح الكرتونة = 25%", result);

                // TEST 5: Stock deduction when selling via secondary unit
                // Selling 2 cartons (2 * 12 = 24 units = 24,000 milli):
                var sale = new Sale
                {
                    Id = "sale_unit_test_1",
                    InvoiceNumber = 1,
                    CustomerId = "cust_general_cash",
                    SubtotalPiasters = 56000,
                    TotalPiasters = 56000,
                    PaidPiasters = 56000,
                    PaymentMethod = "cash",
                    Status = "completed",
                    Items = new System.Collections.Generic.List<SaleItem>
                    {
                        new SaleItem
                        {
                            Id = "si_unit_1",
                            ProductId = prod.Id,
                            ProductName = prod.Name + " (" + cartonUnit.UnitName + ")",
                            QuantityMilli = 24000, // 2 cartons = 24 pieces in base unit
                            UnitPricePiasters = 28000,
                            TotalPiasters = 56000,
                            UnitCostPiasters = 21000
                        }
                    },
                    Payments = new System.Collections.Generic.List<SalePayment>
                    {
                        new SalePayment
                        {
                            Id = "sp_unit_1",
                            SaleId = "sale_unit_test_1",
                            AmountPiasters = 56000,
                            Method = "cash"
                        }
                    }
                };
                saleRepo.CreateSaleAtomic(sale);

                var afterSaleProd = productRepo.GetById(prod.Id);
                // Initial stock: 120,000 milli - 24,000 milli = 96,000 milli (96 pieces)
                Assert(afterSaleProd.StockQuantityMilli == 96000, "تم خصم رصيد المخزون للوحدة الأساسية بدقة (120 - 24 = 96 قطعة)", result);

                // TEST 6: Validation: Base unit cannot be deleted
                bool exceptionThrownOnBaseDelete = false;
                try
                {
                    unitService.DeleteUnit(baseUnit.Id);
                }
                catch (InvalidOperationException)
                {
                    exceptionThrownOnBaseDelete = true;
                }
                Assert(exceptionThrownOnBaseDelete, "قاعدة أمان: منع حذف الوحدة الأساسية للمنتج", result);

                result.Message = string.Format("نجحت جميع اختبارات الوحدات المتعددة والتحويل بنسبة 100% ({0}/{1} تأكيداً)",
                    result.PassedAssertions, result.TotalAssertions);
            }
            catch (Exception ex)
            {
                result.Success = false;
                result.Message = "خطأ في اختبارات الوحدات المتعددة: " + ex.Message;
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

        private static void Assert(bool condition, string assertionName, ProductUnitTestResult result)
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
