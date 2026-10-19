using System;
using System.Collections.Generic;
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
                var unitRepo = new ProductUnitRepository(tempConnStr);
                var saleRepo = new SaleRepository(tempConnStr, counterRepo, auditRepo, batchRepo);
                var returnRepo = new ReturnRepository(tempConnStr, counterRepo, auditRepo);
                var invService = new InventoryService(tempConnStr, smRepo, productRepo, auditRepo, unitRepo, priceHistoryRepo);

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

                var foundBaseBarcode = productRepo.GetByBarcode("6221112223334");
                Assert(foundBaseBarcode != null && foundBaseBarcode.Id == prod.Id, "البحث بباركود القطعة يرجع المنتج الأساسي", result);

                var foundCartonViaProductRepo = productRepo.GetByBarcode("6221112229999");
                Assert(foundCartonViaProductRepo != null && foundCartonViaProductRepo.Id == prod.Id, "البحث بباركود الكرتونة في ProductRepository يرجع المنتج مع قائمة وحداته", result);

                // TEST 4: Profit calculation and margin rounding
                var profitInfo = unitService.CalculateProfit(cartonUnit, baseUnit);
                Assert(profitInfo != null, "تم حساب أرباح وحدة الكرتونة بنجاح", result);
                Assert(profitInfo.ProfitPiasters == 7000, "ربح الكرتونة = 280.00 - 210.00 = 70.00 ج (7000 قرش)", result);
                Assert(profitInfo.MarginPercentagePoints == 25, "نسبة هامش ربح الكرتونة = 25%", result);

                // TEST 5: Stock deduction when selling via secondary unit
                // Selling 2 cartons (QuantityMilli = 2000, ConversionFactor = 12 => Base deduction = 24,000 milli = 24 pieces):
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
                    Items = new List<SaleItem>
                    {
                        new SaleItem
                        {
                            Id = "si_unit_carton_1",
                            ProductId = prod.Id,
                            ProductName = prod.Name + " (" + cartonUnit.UnitName + ")",
                            UnitId = cartonUnit.Id,
                            UnitName = cartonUnit.UnitName,
                            ConversionFactor = cartonUnit.ConversionFactor,
                            QuantityMilli = 2000, // 2 cartons
                            UnitPricePiasters = 28000,
                            TotalPiasters = 56000,
                            UnitCostPiasters = 21000
                        }
                    },
                    Payments = new List<SalePayment>
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
                // Initial stock: 120,000 milli - (2 cartons * 12 = 24,000 milli) = 96,000 milli (96 pieces)
                Assert(afterSaleProd.StockQuantityMilli == 96000, "تم خصم رصيد المخزون للوحدة الأساسية بدقة (120 - 24 = 96 قطعة)", result);

                // TEST 6: Purchase a Carton containing 24 pieces (Issue 1: Conversion Factor in Purchases)
                var prod2 = new Product
                {
                    Id = "prod_biscuit_24",
                    Name = "بسكويت ويفر لوكس",
                    Barcode = "6229990001111",
                    PricePiasters = 500, // 5.00 EGP
                    CostPiasters = 350,  // 3.50 EGP
                    StockQuantityMilli = 0, // Starts at 0
                    Unit = "piece",
                    IsActive = true
                };
                productService.SaveProduct(prod2);
                unitService.EnsureDefaultBaseUnit(prod2);

                var carton24Unit = new ProductUnit
                {
                    Id = "unit_carton_24",
                    ProductId = prod2.Id,
                    UnitName = "كرتونة 24 علبة",
                    ConversionFactor = 24,
                    IsBaseUnit = false,
                    SellPricePiasters = 11000, // 110.00 EGP
                    CostPricePiasters = 8000,  // 80.00 EGP
                    Barcode = "6229990002424",
                    IsDivisible = false,
                    SortOrder = 1
                };
                unitService.CreateUnit(carton24Unit);

                // Purchase 1 carton of 24 pieces via InventoryService.RecordPurchase
                invService.RecordPurchase(
                    productId: prod2.Id,
                    unitId: carton24Unit.Id,
                    purchaseQuantity: 1, // 1 carton
                    packageCostPiasters: 8000,
                    invoiceNumber: "PUR-101",
                    supplierName: "شركة لوكس للأغذية",
                    updateProductCost: true,
                    userId: "admin"
                );

                var afterPurchaseProd2 = productRepo.GetById(prod2.Id);
                Assert(afterPurchaseProd2.StockQuantityMilli == 24000, "شراء 1 كرتونة (24 قطعة) زاد رصيد المخزن الأساسي بدقة إلى 24,000 ملي (24 قطعة)", result);

                // Sell 1 piece (1,000 milli)
                var pieceSale = new Sale
                {
                    Id = "sale_piece_1",
                    InvoiceNumber = 2,
                    CustomerId = "cust_general_cash",
                    SubtotalPiasters = 500,
                    TotalPiasters = 500,
                    PaidPiasters = 500,
                    PaymentMethod = "cash",
                    Status = "completed",
                    Items = new List<SaleItem>
                    {
                        new SaleItem
                        {
                            Id = "si_piece_1",
                            ProductId = prod2.Id,
                            ProductName = prod2.Name,
                            QuantityMilli = 1000, // 1 piece
                            ConversionFactor = 1,
                            UnitPricePiasters = 500,
                            TotalPiasters = 500,
                            UnitCostPiasters = 333
                        }
                    },
                    Payments = new List<SalePayment>
                    {
                        new SalePayment { Id = "sp_piece_1", SaleId = "sale_piece_1", AmountPiasters = 500, Method = "cash" }
                    }
                };
                saleRepo.CreateSaleAtomic(pieceSale);
                var afterPieceSale = productRepo.GetById(prod2.Id);
                Assert(afterPieceSale.StockQuantityMilli == 23000, "بيع قطعة واحدة خصم 1,000 ملي وأصبح الرصيد 23,000 ملي (23 قطعة)", result);

                // TEST 7: Return secondary unit restores stock accurately (Issue 1 & 2)
                var returnObj = new Return
                {
                    Id = "ret_carton_1",
                    ReturnNumber = 1,
                    SaleId = "sale_unit_test_1",
                    InvoiceNumber = 1,
                    CustomerId = "cust_general_cash",
                    CustomerName = "عميل نقدي",
                    TotalPiasters = 28000,
                    RefundMethod = "cash",
                    Reason = "مرتجع كرتونة سليمة",
                    IsWithoutInvoice = false,
                    CreatedAt = DateTime.UtcNow.ToString("o"),
                    Items = new List<ReturnItem>
                    {
                        new ReturnItem
                        {
                            Id = "ri_carton_1",
                            ReturnId = "ret_carton_1",
                            SaleItemId = "si_unit_carton_1",
                            ProductId = prod.Id,
                            ProductName = prod.Name + " (" + cartonUnit.UnitName + ")",
                            QuantityMilli = 1000, // 1 carton returned
                            UnitPricePiasters = 28000,
                            TotalPiasters = 28000,
                            IsDamaged = false,
                            Unit = cartonUnit.UnitName
                        }
                    }
                };
                returnRepo.CreateReturnAtomic(returnObj);
                var afterReturnProd = productRepo.GetById(prod.Id);
                // Was 96,000, returned 1 carton (12 pieces = 12,000 milli) => 108,000 milli
                Assert(afterReturnProd.StockQuantityMilli == 108000, "إرجاع 1 كرتونة استرجع 12 قطعة (12,000 ملي) بدقة إلى رصيد المخزن الأساسي (96 + 12 = 108 قطعة)", result);

                // TEST 8: Historical Record Immutability (Issue 3: ثبات السجل التاريخي)
                // 8.1 Base unit cannot be deleted
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

                // 8.2 Secondary unit with sales cannot be deleted
                bool exceptionThrownOnUnitWithSalesDelete = false;
                try
                {
                    unitService.DeleteUnit(cartonUnit.Id);
                }
                catch (InvalidOperationException)
                {
                    exceptionThrownOnUnitWithSalesDelete = true;
                }
                Assert(exceptionThrownOnUnitWithSalesDelete, "ثبات السجل التاريخي: منع حذف وحدة مستخدمة في مبيعات وفواتير سابقة", result);

                // 8.3 Secondary unit with sales cannot have its conversion factor changed
                bool exceptionThrownOnFactorChange = false;
                try
                {
                    var modifiedUnit = new ProductUnit
                    {
                        Id = cartonUnit.Id,
                        ProductId = prod.Id,
                        UnitName = cartonUnit.UnitName,
                        ConversionFactor = 24, // Attempting to change factor from 12 to 24!
                        IsBaseUnit = false,
                        SellPricePiasters = cartonUnit.SellPricePiasters,
                        CostPricePiasters = cartonUnit.CostPricePiasters,
                        Barcode = cartonUnit.Barcode,
                        IsDivisible = cartonUnit.IsDivisible
                    };
                    unitService.UpdateUnit(modifiedUnit);
                }
                catch (InvalidOperationException)
                {
                    exceptionThrownOnFactorChange = true;
                }
                Assert(exceptionThrownOnFactorChange, "ثبات السجل التاريخي: منع تغيير معامل التحويل لوحدة مستخدمة في فواتير سابقة لحماية تقارير الجرد", result);

                // 8.4 Secondary unit with sales CAN update sell price or barcode (prices are mutable)
                cartonUnit.SellPricePiasters = 29500; // Price increase to 295.00 EGP
                cartonUnit.Barcode = "6221112229990"; // Updated barcode
                var updatedCarton = unitService.UpdateUnit(cartonUnit);
                Assert(updatedCarton.SellPricePiasters == 29500 && updatedCarton.Barcode == "6221112229990", "السماح بتحديث أسعار وباركودات الوحدات مع الحفاظ على ثبات معامل التحويل", result);

                // 8.5 ProductRepository.SaveProduct enforces unit immutability
                bool exceptionOnProductSaveFactorChange = false;
                try
                {
                    var prodWithMutatedUnits = productRepo.GetById(prod.Id);
                    foreach (var u in prodWithMutatedUnits.Units)
                    {
                        if (u.Id == cartonUnit.Id)
                        {
                            u.ConversionFactor = 48; // Mutate
                        }
                    }
                    productService.SaveProduct(prodWithMutatedUnits);
                }
                catch (InvalidOperationException)
                {
                    exceptionOnProductSaveFactorChange = true;
                }
                Assert(exceptionOnProductSaveFactorChange, "حماية المخزن في ProductRepository: منع حفظ المنتج إذا تم العبث بمعامل تحويل وحدة مباعة", result);

                // TEST 9: Non-divisible unit fractional validation (Issue 1 & 2)
                bool exceptionOnFractionalSale = false;
                try
                {
                    unitService.ValidateSaleQuantity(cartonUnit, 1500); // 1.5 cartons
                }
                catch (InvalidOperationException)
                {
                    exceptionOnFractionalSale = true;
                }
                Assert(exceptionOnFractionalSale, "منع بيع أجزاء أو كسور من وحدة غير قابلة للتجزئة (مثل 1.5 كرتونة)", result);

                result.Message = string.Format("نجحت جميع اختبارات الوحدات المتعددة والتحويل وثبات السجل التاريخي بنسبة 100% ({0}/{1} تأكيداً)",
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
