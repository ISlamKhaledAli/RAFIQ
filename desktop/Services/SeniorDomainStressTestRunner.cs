using System;
using System.IO;
using System.Collections.Generic;
using System.Data.SQLite;
using RafiqPOS.Common;
using RafiqPOS.Database;
using RafiqPOS.Models;
using RafiqPOS.Repositories;
using RafiqPOS.Bridge;

namespace RafiqPOS.Services
{
    public class SeniorDomainStressTestResult
    {
        public bool Success { get; set; }
        public string Message { get; set; }
        public int TotalAssertions { get; set; }
        public int PassedAssertions { get; set; }
        public bool DomainVariantMatrixPassed { get; set; }
        public bool DomainInventoryRollupPassed { get; set; }
        public bool DomainSuppliersLedgerPassed { get; set; }
        public bool DomainPermissionsRbacPassed { get; set; }
        public bool DomainAtomicIntegrityPassed { get; set; }
        public List<string> Details { get; set; }

        public SeniorDomainStressTestResult()
        {
            this.Details = new List<string>();
        }
    }

    public static class SeniorDomainStressTestRunner
    {
        public static SeniorDomainStressTestResult RunAllTests()
        {
            var result = new SeniorDomainStressTestResult
            {
                Success = true,
                TotalAssertions = 0,
                PassedAssertions = 0
            };

            string tempFolder = Path.Combine(Path.GetTempPath(), "rafiq_domain_stress_" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(tempFolder);

            try
            {
                // Initialize whole stack in isolated sandbox directory
                DatabaseService.Initialize(tempFolder);
                Assert(File.Exists(DatabaseService.DbPath), "تهيئة قاعدة بيانات معزولة بنجاح لاختبارات النطاقات المتقدمة", result);

                // Domain 1: Variants, Colors & Sizes (الألوان والمقاسات ومصفوفة الفاريانت)
                bool d1 = TestVariantsAndMatrixDomain(result);
                result.DomainVariantMatrixPassed = d1;

                // Domain 2: Inventory, Rollup, FEFO & Returns (المخزون وحركات الإرجاع والصلاحية)
                bool d2 = TestInventoryRollupAndReturnsDomain(result);
                result.DomainInventoryRollupPassed = d2;

                // Domain 3: Suppliers, Purchases & Ledger (الموردين والحسابات الآجلة والتسديدات)
                bool d3 = TestSuppliersLedgerDomain(result);
                result.DomainSuppliersLedgerPassed = d3;

                // Domain 4: Permissions & RBAC via IPC (الصلاحيات والحماية عبر الـ IPC)
                bool d4 = TestPermissionsRbacDomain(result);
                result.DomainPermissionsRbacPassed = d4;

                // Domain 5: Atomic Transactions & Concurrency (المعاملات الذرية وحماية القيود)
                bool d5 = TestAtomicTransactionsDomain(result);
                result.DomainAtomicIntegrityPassed = d5;

                result.Success = d1 && d2 && d3 && d4 && d5 && (result.PassedAssertions == result.TotalAssertions);
                result.Message = string.Format(
                    "اكتملت جميع اختبارات النطاقات المتقدمة: {0} نجاح من إجمالي {1} اختبار (النتيجة: {2})",
                    result.PassedAssertions,
                    result.TotalAssertions,
                    result.Success ? "ناجح بنسبة 100%" : "يوجد إخفاقات"
                );
            }
            catch (Exception ex)
            {
                result.Success = false;
                result.Message = "حدث استثناء غير متوقع أثناء فحص النطاقات: " + ex.Message;
                result.Details.Add("خطأ فادح: " + ex.ToString());
            }
            finally
            {
                // Reset testing session
                SecurityService.SetCurrentUserForTesting(null);
            }

            return result;
        }

        private static bool TestVariantsAndMatrixDomain(SeniorDomainStressTestResult result)
        {
            int startPassed = result.PassedAssertions;
            int startTotal = result.TotalAssertions;

            var variantRepo = DatabaseService.ProductVariantRepo;
            var prodRepo = DatabaseService.ProductRepo;
            var saleRepo = DatabaseService.SaleRepo;
            var purchaseRepo = DatabaseService.PurchaseRepo;

            // 1.1: Matrix creation with 2 Colors x 2 Sizes = 4 Variants
            var cells = new List<VariantMatrixCell>();
            string[] colors = new string[] { "أبيض", "كحلي" };
            string[] sizes = new string[] { "M", "XL" };

            foreach (string c in colors)
            {
                foreach (string s in sizes)
                {
                    cells.Add(new VariantMatrixCell
                    {
                        Color = c,
                        Size = s,
                        PricePiasters = 25000, // 250 EGP
                        CostPiasters = 18000,  // 180 EGP
                        StockQuantityMilli = 10000, // 10 units
                        MinStockQuantityMilli = 2000, // 2 units
                        IsEnabled = true
                    });
                }
            }

            var matrixReq = new CreateVariantMatrixRequest
            {
                ParentName = "تيشيرت بولو صيفي فاخر",
                MatrixCells = cells
            };

            var createdParent = variantRepo.CreateMatrix(matrixReq);
            Assert(createdParent != null && createdParent.ParentProduct != null && !string.IsNullOrEmpty(createdParent.ParentProduct.Id), "انشاء مصفوفة فاريانت 2x2 وحفظ الصنف الحاوي بنجاح", result);
            Assert(createdParent.ParentProduct.HasVariants, "تاكيد خاصية احتواء الصنف الحاوي على فاريانت HasVariants = true", result);
            Assert(createdParent.TotalStockMilli == 40000, "تطابق رصيد الصنف الحاوي مع مجموع الـ 4 فاريانت (40 وحدة = 40,000 ملي)", result);

            string parentId = createdParent.ParentProduct.Id;
            var childVariants = variantRepo.GetVariantsByParentId(parentId);
            Assert(childVariants != null && childVariants.Count == 4, "انشاء 4 فاريانت فرعية مربوطة بالصنف الحاوي", result);

            // 1.2: Duplicate Barcodes in matrix request validation
            bool duplicateBarcodeBlocked = false;
            try
            {
                var dupCells = new List<VariantMatrixCell>();
                dupCells.Add(new VariantMatrixCell { Color = "أحمر", Size = "S", Barcode = "DUP123", PricePiasters = 1000, CostPiasters = 500, IsEnabled = true });
                dupCells.Add(new VariantMatrixCell { Color = "أحمر", Size = "M", Barcode = "DUP123", PricePiasters = 1000, CostPiasters = 500, IsEnabled = true });
                variantRepo.CreateMatrix(new CreateVariantMatrixRequest { ParentName = "صنف مكرر باركود", MatrixCells = dupCells });
            }
            catch (Exception)
            {
                duplicateBarcodeBlocked = true;
            }
            Assert(duplicateBarcodeBlocked, "منع انشاء مصفوفة بباركودات مكررة داخل نفس الطلب", result);

            // 1.3: Negative price/cost validation
            bool negativePriceBlocked = false;
            try
            {
                var negCells = new List<VariantMatrixCell>();
                negCells.Add(new VariantMatrixCell { Color = "أصفر", Size = "L", PricePiasters = -500, CostPiasters = 500, IsEnabled = true });
                variantRepo.CreateMatrix(new CreateVariantMatrixRequest { ParentName = "صنف بسعر سالب", MatrixCells = negCells });
            }
            catch (ArgumentException)
            {
                negativePriceBlocked = true;
            }
            Assert(negativePriceBlocked, "منع اسعار سالبة داخل مصفوفة الفاريانت", result);

            // 1.4: Existing product barcode collision validation
            string existingProdBarcode = "EXISTING-" + Guid.NewGuid().ToString("N").Substring(0, 6);
            prodRepo.Upsert(new Product
            {
                Name = "صنف باركود محجوز مسبقا",
                Barcode = existingProdBarcode,
                PricePiasters = 5000,
                CostPiasters = 3000,
                StockQuantityMilli = 5000,
                IsActive = true
            });

            bool barcodeCollisionBlocked = false;
            try
            {
                var colCells = new List<VariantMatrixCell>();
                colCells.Add(new VariantMatrixCell { Color = "اخضر", Size = "XL", Barcode = existingProdBarcode, PricePiasters = 1000, CostPiasters = 500, IsEnabled = true });
                variantRepo.CreateMatrix(new CreateVariantMatrixRequest { ParentName = "صنف باركود مصادم", MatrixCells = colCells });
            }
            catch (InvalidOperationException)
            {
                barcodeCollisionBlocked = true;
            }
            Assert(barcodeCollisionBlocked, "منع استخدام باركود محجوز لصنف اخر داخل مصفوفة الفاريانت", result);

            // 1.5: Selling a variant and verifying parent stock rollup
            var firstVar = childVariants[0]; // 10 units
            var firstVarProd = prodRepo.GetById(firstVar.VariantProductId);
            var sale = new Sale
            {
                PaymentMethod = "cash",
                SubtotalPiasters = 75000,
                TotalPiasters = 75000,
                PaidPiasters = 75000,
                ChangePiasters = 0,
                Items = new List<SaleItem>
                {
                    new SaleItem
                    {
                        ProductId = firstVarProd.Id,
                        ProductName = firstVarProd.Name,
                        Barcode = firstVarProd.Barcode,
                        QuantityMilli = 3000, // 3 units
                        UnitPricePiasters = 25000,
                        TotalPiasters = 75000,
                        Unit = "قطعة"
                    }
                }
            };

            var completedSale = saleRepo.CreateSaleAtomic(sale);
            Assert(completedSale != null && !string.IsNullOrEmpty(completedSale.Id), "اتمام عملية بيع لـ 3 وحدات من فاريانت بنجاح", result);

            var firstVarAfterSale = prodRepo.GetById(firstVarProd.Id);
            Assert(firstVarAfterSale.StockQuantityMilli == 7000, "خصم رصيد الفاريانت المباع بدقة (10 - 3 = 7 وحدات)", result);

            var parentAfterSale = prodRepo.GetById(parentId);
            Assert(parentAfterSale.StockQuantityMilli == 37000, "تحديث رصيد الصنف الحاوي تلقائيا وتجميعه (40 - 3 = 37 وحدة)", result);

            // 1.6: Direct Sale Guard on Parent Container
            bool parentDirectSaleBlocked = false;
            try
            {
                saleRepo.CreateSaleAtomic(new Sale
                {
                    PaymentMethod = "cash",
                    SubtotalPiasters = 25000,
                    TotalPiasters = 25000,
                    PaidPiasters = 25000,
                    Items = new List<SaleItem>
                    {
                        new SaleItem
                        {
                            ProductId = parentId,
                            ProductName = parentAfterSale.Name,
                            Barcode = parentAfterSale.Barcode,
                            QuantityMilli = 1000,
                            UnitPricePiasters = 25000,
                            TotalPiasters = 25000,
                            Unit = "قطعة"
                        }
                    }
                });
            }
            catch (InvalidOperationException)
            {
                parentDirectSaleBlocked = true;
            }
            Assert(parentDirectSaleBlocked, "منع بيع الصنف الحاوي المجمع مباشرة لحماية اتساق الفاريانت", result);

            // 1.7: Direct Purchase Guard on Parent Container
            bool parentDirectPurchaseBlocked = false;
            try
            {
                purchaseRepo.CreatePurchase(new Purchase
                {
                    SupplierInvoiceNumber = "PUR-TEST-PARENT",
                    TotalCostPiasters = 20000,
                    NetCostPiasters = 20000,
                    PaidAmountPiasters = 20000,
                    RemainingAmountPiasters = 0,
                    PaymentStatus = "paid",
                    Items = new List<PurchaseItem>
                    {
                        new PurchaseItem
                        {
                            ProductId = parentId,
                            ProductName = parentAfterSale.Name,
                            QuantityMilli = 1000,
                            UnitCostPiasters = 18000,
                            TotalCostPiasters = 18000
                        }
                    }
                });
            }
            catch (InvalidOperationException)
            {
                parentDirectPurchaseBlocked = true;
            }
            Assert(parentDirectPurchaseBlocked, "منع تسجيل مشتريات للصنف الحاوي المجمع مباشرة", result);

            // 1.8: Soft-deleting one child variant recalculates parent stock without the inactive one
            var varToDelete = childVariants[1]; // has 10,000 milli
            prodRepo.SoftDelete(varToDelete.VariantProductId);

            var deletedVarCheck = prodRepo.GetById(varToDelete.VariantProductId);
            Assert(deletedVarCheck != null && !deletedVarCheck.IsActive, "تحول حالة الفاريانت المحذوف إلى غير نشط IsActive = false", result);

            var parentAfterVarDelete = prodRepo.GetById(parentId);
            // Stock must be 40,000 - 3,000 (sold) - 10,000 (inactive variant) = 27,000 milli
            Assert(parentAfterVarDelete.StockQuantityMilli == 27000, "اعادة حساب رصيد الصنف الحاوي باستبعاد الفاريانت المحذوف بدقة (27,000 ملي)", result);

            // 1.9: Upsert variant synchronizes product_variants and parent stock
            var varToUpdateProd = prodRepo.GetById(childVariants[2].VariantProductId);
            varToUpdateProd.PricePiasters = 30000; // Price bump to 300 EGP
            prodRepo.Upsert(varToUpdateProd);

            var activeVariantsNow = variantRepo.GetVariantsByParentId(parentId);
            ProductVariant updatedVar = null;
            foreach (var v in activeVariantsNow)
            {
                if (v.VariantProductId == varToUpdateProd.Id)
                {
                    updatedVar = v;
                    break;
                }
            }
            Assert(updatedVar != null && updatedVar.PricePiasters == 30000, "تزامن جدول product_variants تلقائيا بعد تعديل الصنف عبر Upsert", result);

            // 1.10: Cascading soft-delete from Parent to all child variants
            prodRepo.SoftDelete(parentId);

            var parentCheck = prodRepo.GetById(parentId);
            Assert(parentCheck != null && !parentCheck.IsActive, "تحول حالة الصنف الحاوي إلى غير نشط IsActive = false", result);

            int activeChildrenCount = 0;
            using (var conn = new SQLiteConnection(DatabaseService.ConnectionString))
            {
                conn.Open();
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = "SELECT COUNT(*) FROM products WHERE parent_id = @pid AND is_active = 1;";
                    cmd.Parameters.AddWithValue("@pid", parentId);
                    activeChildrenCount = Convert.ToInt32(cmd.ExecuteScalar());
                }
            }
            Assert(activeChildrenCount == 0, "انتقال التعطيل تلقائيا (Cascade Soft-Delete) لكافة الفاريانت التابعة للصنف الحاوي", result);

            return (result.PassedAssertions - startPassed) == (result.TotalAssertions - startTotal);
        }

        private static bool TestInventoryRollupAndReturnsDomain(SeniorDomainStressTestResult result)
        {
            int startPassed = result.PassedAssertions;
            int startTotal = result.TotalAssertions;

            var variantRepo = DatabaseService.ProductVariantRepo;
            var prodRepo = DatabaseService.ProductRepo;
            var inventoryService = DatabaseService.Inventory;
            var saleRepo = DatabaseService.SaleRepo;
            var returnRepo = DatabaseService.ReturnRepo;
            var batchRepo = DatabaseService.ProductBatchRepo;

            // 2.1: Fresh Matrix for Inventory Tests
            var cells = new List<VariantMatrixCell>();
            cells.Add(new VariantMatrixCell
            {
                Color = "أسود",
                Size = "42",
                PricePiasters = 40000, // 400 EGP
                CostPiasters = 25000,
                StockQuantityMilli = 10000, // 10 units
                MinStockQuantityMilli = 2000,
                IsEnabled = true
            });

            var parentProd = variantRepo.CreateMatrix(new CreateVariantMatrixRequest
            {
                ParentName = "حذاء رياضي كاجوال",
                MatrixCells = cells
            });

            string parentId = parentProd.ParentProduct.Id;
            var variants = variantRepo.GetVariantsByParentId(parentId);
            var shoeVar = variants[0];
            var shoeProd = prodRepo.GetById(shoeVar.VariantProductId);

            // 2.2: Inventory Stock Adjustment (Add +5 units, Sub -2 units)
            inventoryService.AdjustStock(shoeProd.Id, 15000, "ADJUSTMENT_ADD", "تسوية بالزيادة - جرد فعلي", "المشرف");
            var varAfterAdd = prodRepo.GetById(shoeProd.Id);
            var parentAfterAdd = prodRepo.GetById(parentId);
            Assert(varAfterAdd.StockQuantityMilli == 15000, "زيادة رصيد فاريانت الحذاء عبر AdjustStock إلى 15 وحدة", result);
            Assert(parentAfterAdd.StockQuantityMilli == 15000, "تطابق رصيد الصنف الحاوي بعد التسوية بالزيادة (15 وحدة)", result);

            inventoryService.AdjustStock(shoeProd.Id, 12000, "ADJUSTMENT_SUB", "تسوية بالنقص - تالف", "المشرف");
            var varAfterSub = prodRepo.GetById(shoeProd.Id);
            var parentAfterSub = prodRepo.GetById(parentId);
            Assert(varAfterSub.StockQuantityMilli == 12000, "خصم رصيد فاريانت الحذاء عبر AdjustStock إلى 12 وحدة", result);
            Assert(parentAfterSub.StockQuantityMilli == 12000, "تطابق رصيد الصنف الحاوي بعد التسوية بالنقص (12 وحدة)", result);

            // 2.3: Sell 4 units of the shoe
            var sale = saleRepo.CreateSaleAtomic(new Sale
            {
                PaymentMethod = "cash",
                SubtotalPiasters = 160000,
                TotalPiasters = 160000,
                PaidPiasters = 160000,
                Items = new List<SaleItem>
                {
                    new SaleItem
                    {
                        ProductId = shoeProd.Id,
                        ProductName = shoeProd.Name,
                        Barcode = shoeProd.Barcode,
                        QuantityMilli = 4000,
                        UnitPricePiasters = 40000,
                        TotalPiasters = 160000,
                        Unit = "قطعة"
                    }
                }
            });
            Assert(sale != null && !string.IsNullOrEmpty(sale.Id), "بيع 4 وحدات من الحذاء بنجاح", result);

            var varAfterSale = prodRepo.GetById(shoeProd.Id);
            Assert(varAfterSale.StockQuantityMilli == 8000, "رصيد الفاريانت بعد البيع = 8 وحدات (8,000 ملي)", result);

            // 2.4: Undamaged Return (1 unit) -> Restores stock to 9 units
            var undamagedReturn = returnRepo.CreateReturnAtomic(new Return
            {
                SaleId = sale.Id,
                RefundMethod = "cash",
                Reason = "مقاس غير مناسب للعميل",
                Items = new List<ReturnItem>
                {
                    new ReturnItem
                    {
                        ProductId = shoeProd.Id,
                        ProductName = shoeProd.Name,
                        QuantityMilli = 1000,
                        UnitPricePiasters = 40000,
                        TotalPiasters = 40000,
                        IsDamaged = false
                    }
                }
            });
            Assert(undamagedReturn != null && !string.IsNullOrEmpty(undamagedReturn.Id), "تسجيل مرتجع سليم بنجاح", result);

            var varAfterUndamaged = prodRepo.GetById(shoeProd.Id);
            var parentAfterUndamaged = prodRepo.GetById(parentId);
            Assert(varAfterUndamaged.StockQuantityMilli == 9000, "استعادة رصيد الفاريانت بدقة عند المرتجع السليم (8 + 1 = 9 وحدات)", result);
            Assert(parentAfterUndamaged.StockQuantityMilli == 9000, "استعادة رصيد الصنف الحاوي بدقة عند المرتجع السليم (9 وحدات)", result);

            // 2.5: Damaged Return (1 unit) -> Does NOT restore stock (remains 9 units)
            var damagedReturn = returnRepo.CreateReturnAtomic(new Return
            {
                SaleId = sale.Id,
                RefundMethod = "cash",
                Reason = "عيب صناعة مقطوع",
                Items = new List<ReturnItem>
                {
                    new ReturnItem
                    {
                        ProductId = shoeProd.Id,
                        ProductName = shoeProd.Name,
                        QuantityMilli = 1000,
                        UnitPricePiasters = 40000,
                        TotalPiasters = 40000,
                        IsDamaged = true
                    }
                }
            });
            Assert(damagedReturn != null && !string.IsNullOrEmpty(damagedReturn.Id), "تسجيل مرتجع تالف بنجاح", result);

            var varAfterDamaged = prodRepo.GetById(shoeProd.Id);
            var parentAfterDamaged = prodRepo.GetById(parentId);
            Assert(varAfterDamaged.StockQuantityMilli == 9000, "عدم استعادة رصيد الفاريانت عند المرتجع التالف للحفاظ على المخزون القابل للبيع (يبقى 9 وحدات)", result);
            Assert(parentAfterDamaged.StockQuantityMilli == 9000, "عدم زيادة رصيد الصنف الحاوي عند المرتجع التالف", result);

            // 2.6: Batches & FEFO Consumption on Variant Product
            var batchA = new ProductBatch
            {
                ProductId = shoeProd.Id,
                BatchNumber = "BATCH-FEFO-01",
                QuantityMilli = 3000, // 3 units
                CostPricePiasters = 25000,
                ExpiryDate = DateTime.UtcNow.AddDays(10).ToString("yyyy-MM-dd") // Expiring soon
            };
            batchA = batchRepo.CreateOrUpdateBatch(batchA);

            var batchB = new ProductBatch
            {
                ProductId = shoeProd.Id,
                BatchNumber = "BATCH-FEFO-02",
                QuantityMilli = 5000, // 5 units
                CostPricePiasters = 25000,
                ExpiryDate = DateTime.UtcNow.AddDays(60).ToString("yyyy-MM-dd") // Expiring later
            };
            batchB = batchRepo.CreateOrUpdateBatch(batchB);

            // Consume 2 units from batches via FEFO
            using (var conn = new SQLiteConnection(DatabaseService.ConnectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    var consumed = batchRepo.DeductFromBatchesFefo(shoeProd.Id, 2000, conn, trans);
                    trans.Commit();
                    Assert(consumed != null && consumed.Count >= 1, "خصم تشغيلة الفاريانت بنجاح بنظام FEFO", result);
                    Assert(consumed[0].BatchId == batchA.Id && consumed[0].DeductedQuantityMilli == 2000, "سحب الكمية من التشغيلة الأقرب انتهاء BATCH-FEFO-01 أولاً", result);
                }
            }

            // 2.7: RecalculateStock returns clean execution
            int recalculatedCount = inventoryService.RecalculateStock();
            Assert(recalculatedCount >= 0, "تشغيل اعادة احتساب ومطابقة المخزون بالكامل بنجاح", result);

            return (result.PassedAssertions - startPassed) == (result.TotalAssertions - startTotal);
        }

        private static bool TestSuppliersLedgerDomain(SeniorDomainStressTestResult result)
        {
            int startPassed = result.PassedAssertions;
            int startTotal = result.TotalAssertions;

            var supplierRepo = DatabaseService.SupplierRepo;
            var purchaseRepo = DatabaseService.PurchaseRepo;
            var prodRepo = DatabaseService.ProductRepo;

            // 3.1: Create Supplier with initial balance 0
            var supplier = supplierRepo.Save(new Supplier
            {
                Name = "شركة النيل للتجارة والتوزيع",
                Phone = "01001234567",
                CompanyName = "النيل",
                BalancePiasters = 0,
                IsActive = true
            });
            Assert(supplier != null && !string.IsNullOrEmpty(supplier.Id), "انشاء مورد جديد بنجاح برصيد مبدئي صفر", result);

            // Create simple test product for purchases
            string purBarcode = "PUR-PROD-" + Guid.NewGuid().ToString("N").Substring(0, 6);
            string purProdId = Guid.NewGuid().ToString();
            prodRepo.Upsert(new Product
            {
                Id = purProdId,
                Name = "صنف مشتريات تجريبي موردين",
                Barcode = purBarcode,
                PricePiasters = 10000,
                CostPiasters = 7000,
                StockQuantityMilli = 0,
                IsActive = true
            });
            var testItem = prodRepo.GetById(purProdId);

            // 3.2: Credit Purchase (Total: 80,000 piasters = 800 EGP, Paid: 30,000 piasters = 300 EGP, Remaining: 50,000 piasters)
            var purchase = purchaseRepo.CreatePurchase(new Purchase
            {
                SupplierId = supplier.Id,
                SupplierName = supplier.Name,
                SupplierInvoiceNumber = "INV-SUP-001",
                TotalCostPiasters = 80000,
                NetCostPiasters = 80000,
                PaidAmountPiasters = 30000,
                RemainingAmountPiasters = 50000,
                PaymentStatus = "partial",
                Items = new List<PurchaseItem>
                {
                    new PurchaseItem
                    {
                        ProductId = testItem.Id,
                        ProductName = testItem.Name,
                        QuantityMilli = 10000, // 10 pieces
                        UnitCostPiasters = 8000,
                        TotalCostPiasters = 80000
                    }
                }
            });
            Assert(purchase != null && !string.IsNullOrEmpty(purchase.Id), "تسجيل فاتورة مشتريات آجلة بنجاح", result);

            var supAfterPur = supplierRepo.GetById(supplier.Id);
            Assert(supAfterPur.BalancePiasters == 50000, "تسجيل مديونية المورد بدقة بعد الفاتورة الآجلة (متبقي له 500 ج.م = 50,000 قرش)", result);

            // 3.3: Partial Payment (Pay 30,000 piasters -> Remaining 20,000 piasters)
            supplierRepo.RecordPayment(supplier.Id, 30000, "دفعة نقدية تحت الحساب");
            var supAfterPay1 = supplierRepo.GetById(supplier.Id);
            Assert(supAfterPay1.BalancePiasters == 20000, "تخفيض مديونية المورد بدقة بعد السداد الجزئي (متبقي له 200 ج.م = 20,000 قرش)", result);

            // 3.4: Overpayment / Advance Store Credit (Pay 35,000 piasters -> Balance becomes -15,000 piasters)
            supplierRepo.RecordPayment(supplier.Id, 35000, "سداد زائد (دفعة مقدمة للبضاعة القادمة)");
            var supAfterPay2 = supplierRepo.GetById(supplier.Id);
            Assert(supAfterPay2.BalancePiasters == -15000, "حساب الرصيد الدائن للمحل بدقة بعد السداد الزائد (-150 ج.م = -15,000 قرش)", result);

            // 3.5: Balance verification check
            var verifyResult = supplierRepo.VerifyBalance(supplier.Id);
            Assert(verifyResult != null && verifyResult.IsBalanced, "مطابقة كشف حساب المورد محاسبيا بنسبة 100%", result);
            Assert(verifyResult.DiscrepancyPiasters == 0, "عدم وجود اي فارق محاسبي بين الحركات والرصيد (Discrepancy = 0)", result);

            // 3.6: Deleting Supplier with Transactions Blocked
            bool deleteBlocked = false;
            try
            {
                supplierRepo.Delete(supplier.Id);
            }
            catch (InvalidOperationException)
            {
                deleteBlocked = true;
            }
            Assert(deleteBlocked, "منع الحذف النهائي للمورد في حالة وجود قيود وفواتير سابقة وحماية سجلات المحاسبة", result);

            // 3.7: Deactivating / Archiving Supplier
            supplierRepo.Archive(supplier.Id);
            var archivedSup = supplierRepo.GetById(supplier.Id);
            Assert(archivedSup != null && !archivedSup.IsActive, "ارشفة المورد بنجاح دون حذف حركاته المالية", result);

            // 3.8: Purchasing from Archived Supplier Blocked
            bool purchaseArchivedBlocked = false;
            try
            {
                purchaseRepo.CreatePurchase(new Purchase
                {
                    SupplierId = supplier.Id,
                    SupplierInvoiceNumber = "INV-SUP-ARCHIVED",
                    TotalCostPiasters = 10000,
                    NetCostPiasters = 10000,
                    PaidAmountPiasters = 10000,
                    RemainingAmountPiasters = 0,
                    PaymentStatus = "paid",
                    Items = new List<PurchaseItem>
                    {
                        new PurchaseItem
                        {
                            ProductId = testItem.Id,
                            ProductName = testItem.Name,
                            QuantityMilli = 1000,
                            UnitCostPiasters = 10000,
                            TotalCostPiasters = 10000
                        }
                    }
                });
            }
            catch (InvalidOperationException)
            {
                purchaseArchivedBlocked = true;
            }
            Assert(purchaseArchivedBlocked, "منع تسجيل فاتورة مشتريات لمورد معطل أو مؤرشف", result);

            // 3.9: Paying Archived Supplier Blocked
            bool paymentArchivedBlocked = false;
            try
            {
                supplierRepo.RecordPayment(supplier.Id, 5000, "محاولة سداد لمورد مؤرشف");
            }
            catch (InvalidOperationException)
            {
                paymentArchivedBlocked = true;
            }
            Assert(paymentArchivedBlocked, "منع تسجيل سداد مالي لمورد معطل أو مؤرشف", result);

            // 3.10: Paying Non-existent Supplier Blocked
            bool paymentNonExistentBlocked = false;
            try
            {
                supplierRepo.RecordPayment(Guid.NewGuid().ToString(), 5000, "سداد لمورد غير موجود");
            }
            catch (InvalidOperationException)
            {
                paymentNonExistentBlocked = true;
            }
            Assert(paymentNonExistentBlocked, "منع تسجيل سداد مالي لمورد غير موجود بقاعدة البيانات", result);

            return (result.PassedAssertions - startPassed) == (result.TotalAssertions - startTotal);
        }

        private static bool TestPermissionsRbacDomain(SeniorDomainStressTestResult result)
        {
            int startPassed = result.PassedAssertions;
            int startTotal = result.TotalAssertions;

            var userRepo = DatabaseService.UserRepo;
            var secService = DatabaseService.Security;

            // 4.1: Create Cashier and Admin users
            var cashierUser = new User
            {
                Id = Guid.NewGuid().ToString(),
                Username = "cashier_test_" + Guid.NewGuid().ToString("N").Substring(0, 4),
                DisplayName = "كاشير الصالة التجريبي",
                Role = "cashier",
                IsActive = true
            };
            userRepo.Insert(cashierUser);

            var adminUser = new User
            {
                Id = Guid.NewGuid().ToString(),
                Username = "admin_test_" + Guid.NewGuid().ToString("N").Substring(0, 4),
                DisplayName = "مدير الفرع التجريبي",
                Role = "admin",
                IsActive = true
            };
            userRepo.Insert(adminUser);

            // 4.2: Verify default permissions in SecurityService
            bool cashierHasSell = secService.HasPermission(cashierUser.Id, "pos.sell");
            bool cashierHasSuppliers = secService.HasPermission(cashierUser.Id, "suppliers.manage");
            bool cashierHasStockAdjust = secService.HasPermission(cashierUser.Id, "stock.adjust");
            bool cashierHasUsersManage = secService.HasPermission(cashierUser.Id, "users.create");

            Assert(cashierHasSell, "الكاشير يمتلك صلاحية البيع pos.sell افتراضياً", result);
            Assert(!cashierHasSuppliers, "حجب صلاحية ادارة الموردين suppliers.manage عن الكاشير افتراضياً", result);
            Assert(!cashierHasStockAdjust, "حجب صلاحية تسوية المخزون stock.adjust عن الكاشير افتراضياً", result);
            Assert(!cashierHasUsersManage, "حجب صلاحية ادارة الموظفين users.create عن الكاشير افتراضياً", result);

            bool adminHasSuppliers = secService.HasPermission(adminUser.Id, "suppliers.manage");
            Assert(adminHasSuppliers, "مدير النظام يمتلك صلاحية الموردين suppliers.manage كاملة", result);

            // 4.3: IPC Authorization Gate Testing
            // A) Unauthenticated dispatch -> MUST return AUTH_REQUIRED
            SecurityService.SetCurrentUserForTesting(null);
            var unauthReq = new BridgeRequest
            {
                Id = "REQ-UNAUTH",
                Action = "suppliers:save"
            };
            var unauthRes = IpcDispatcher.Dispatch(unauthReq);
            Assert(!unauthRes.Success && unauthRes.Error != null && unauthRes.Error.Code == "AUTH_REQUIRED", "منع تنفيذ طلبات الـ IPC المحمية بدون تسجيل دخول (AUTH_REQUIRED)", result);

            // B) Cashier dispatching protected action -> MUST return FORBIDDEN
            var cashierDto = new UserDto
            {
                Id = cashierUser.Id,
                Username = cashierUser.Username,
                DisplayName = cashierUser.DisplayName,
                Role = "cashier",
                IsActive = true
            };
            SecurityService.SetCurrentUserForTesting(cashierDto);

            var cashierForbiddenSup = IpcDispatcher.Dispatch(new BridgeRequest
            {
                Id = "REQ-FORBIDDEN-SUP",
                Action = "suppliers:save"
            });
            Assert(!cashierForbiddenSup.Success && cashierForbiddenSup.Error != null && cashierForbiddenSup.Error.Code == "FORBIDDEN", "حظر الكاشير من حفظ مورد عبر الـ IPC وإرجاع خطأ FORBIDDEN", result);

            var cashierForbiddenAdj = IpcDispatcher.Dispatch(new BridgeRequest
            {
                Id = "REQ-FORBIDDEN-ADJ",
                Action = "inventory:adjustStock"
            });
            Assert(!cashierForbiddenAdj.Success && cashierForbiddenAdj.Error != null && cashierForbiddenAdj.Error.Code == "FORBIDDEN", "حظر الكاشير من تسوية المخزون inventory:adjustStock عبر الـ IPC", result);

            var cashierForbiddenReset = IpcDispatcher.Dispatch(new BridgeRequest
            {
                Id = "REQ-FORBIDDEN-RESET",
                Action = "system:factoryReset"
            });
            Assert(!cashierForbiddenReset.Success && cashierForbiddenReset.Error != null && cashierForbiddenReset.Error.Code == "FORBIDDEN", "حظر الكاشير من استعادة ضبط المصنع system:factoryReset", result);

            // C) Admin dispatching protected action -> Authorized (not blocked by RBAC gate)
            var adminDto = new UserDto
            {
                Id = adminUser.Id,
                Username = adminUser.Username,
                DisplayName = adminUser.DisplayName,
                Role = "admin",
                IsActive = true
            };
            SecurityService.SetCurrentUserForTesting(adminDto);

            var adminSupRes = IpcDispatcher.Dispatch(new BridgeRequest
            {
                Id = "REQ-ADMIN-SUP",
                Action = "suppliers:save",
                Payload = Newtonsoft.Json.Linq.JObject.FromObject(new { name = "مورد تجريبي أدمن" })
            });
            Assert(adminSupRes.Error == null || (adminSupRes.Error.Code != "FORBIDDEN" && adminSupRes.Error.Code != "AUTH_REQUIRED"), "اجتياز مدير النظام لبوابة الصلاحيات بنجاح عند تنفيذ suppliers:save", result);

            // Reset testing session
            SecurityService.SetCurrentUserForTesting(null);

            return (result.PassedAssertions - startPassed) == (result.TotalAssertions - startTotal);
        }

        private static bool TestAtomicTransactionsDomain(SeniorDomainStressTestResult result)
        {
            int startPassed = result.PassedAssertions;
            int startTotal = result.TotalAssertions;

            var prodRepo = DatabaseService.ProductRepo;
            var saleRepo = DatabaseService.SaleRepo;
            var customerRepo = DatabaseService.CustomerRepo;

            // 5.1: Create test product and customer
            string itemABarcode = "ATOM-A-" + Guid.NewGuid().ToString("N").Substring(0, 6);
            string itemAId = Guid.NewGuid().ToString();
            prodRepo.Upsert(new Product
            {
                Id = itemAId,
                Name = "صنف اختبار الذرية A",
                Barcode = itemABarcode,
                PricePiasters = 5000,
                CostPiasters = 3000,
                StockQuantityMilli = 20000, // 20 units
                IsActive = true
            });
            var itemA = prodRepo.GetById(itemAId);

            var customer = customerRepo.SaveCustomer(new Customer
            {
                Name = "عميل اختبار الذرية",
                Phone = "01122334455",
                CreditLimitPiasters = 100000,
                BalancePiasters = 0
            });

            // Count sales before test
            int initialSalesCount = GetSalesCount();

            // Create parent container product with variants as Item B
            string parentBId = Guid.NewGuid().ToString();
            prodRepo.Upsert(new Product
            {
                Id = parentBId,
                Name = "صنف حاوي B يحتوي فاريانت",
                Barcode = "PAR-B-" + Guid.NewGuid().ToString("N").Substring(0, 6),
                PricePiasters = 6000,
                CostPiasters = 4000,
                StockQuantityMilli = 10000,
                HasVariants = true,
                IsActive = true
            });

            // 5.2: Create a Sale containing Item A and Item B (Parent container product)
            // Mid-transaction: Item A stock is deducted first, then Item B throws InvalidOperationException (cannot sell parent product).
            // The transaction MUST catch the error and execute Rollback cleanly:
            // Item A stock must remain exactly 20 units.
            // Customer balance must remain exactly 0.
            // Sales count must not change.
            bool saleFailed = false;
            try
            {
                saleRepo.CreateSaleAtomic(new Sale
                {
                    CustomerId = customer.Id,
                    CustomerName = customer.Name,
                    PaymentMethod = "credit",
                    SubtotalPiasters = 16000,
                    TotalPiasters = 16000,
                    PaidPiasters = 0,
                    Items = new List<SaleItem>
                    {
                        new SaleItem
                        {
                            ProductId = itemA.Id,
                            ProductName = itemA.Name,
                            QuantityMilli = 2000, // 2 units
                            UnitPricePiasters = 5000,
                            TotalPiasters = 10000,
                            Unit = "قطعة"
                        },
                        new SaleItem
                        {
                            ProductId = parentBId,
                            ProductName = "صنف حاوي B يحتوي فاريانت",
                            QuantityMilli = 1000,
                            UnitPricePiasters = 6000,
                            TotalPiasters = 6000,
                            Unit = "قطعة"
                        }
                    }
                });
            }
            catch (InvalidOperationException)
            {
                saleFailed = true;
            }

            Assert(saleFailed, "فشل عملية البيع المحتوية على صنف حاوي مجمع في منتصف المعاملة", result);

            var itemACheck = prodRepo.GetById(itemA.Id);
            Assert(itemACheck.StockQuantityMilli == 20000, "تراجع رصيد الصنف A بالكامل (Rollback) وعدم خصم اي وحدة (بقي 20 وحدة)", result);

            var custCheck = customerRepo.GetById(customer.Id);
            Assert(custCheck.BalancePiasters == 0, "تراجع مديونية العميل بالكامل (Rollback) وعدم تسجيل اي زيادة في الحساب (بقي صفر)", result);

            int finalSalesCount = GetSalesCount();
            Assert(finalSalesCount == initialSalesCount, "عدم انشاء اي فاتورة بيع يتيمة في جدول الفواتير عند فشل المعاملة", result);

            return (result.PassedAssertions - startPassed) == (result.TotalAssertions - startTotal);
        }

        private static int GetSalesCount()
        {
            using (var conn = new SQLiteConnection(DatabaseService.ConnectionString))
            {
                conn.Open();
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = "SELECT COUNT(*) FROM sales;";
                    return Convert.ToInt32(cmd.ExecuteScalar());
                }
            }
        }

        private static void Assert(bool condition, string testName, SeniorDomainStressTestResult result)
        {
            result.TotalAssertions++;
            if (condition)
            {
                result.PassedAssertions++;
                result.Details.Add("[PASS] " + testName);
            }
            else
            {
                result.Details.Add("[FAIL] " + testName);
            }
        }
    }
}
