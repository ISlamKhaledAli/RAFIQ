using System;
using System.Collections.Generic;
using System.Data.SQLite;
using RafiqPOS.Models;
using RafiqPOS.Repositories;

namespace RafiqPOS.Services
{
    public class InventoryService
    {
        private readonly string _connectionString;
        private readonly StockMovementRepository _movementRepo;
        private readonly ProductRepository _productRepo;
        private readonly AuditLogRepository _auditRepo;
        private readonly ProductUnitRepository _unitRepo;
        private readonly ProductPriceHistoryRepository _priceHistoryRepo;

        public InventoryService(
            string connectionString,
            StockMovementRepository movementRepo,
            ProductRepository productRepo,
            AuditLogRepository auditRepo = null,
            ProductUnitRepository unitRepo = null,
            ProductPriceHistoryRepository priceHistoryRepo = null)
        {
            _connectionString = connectionString;
            _movementRepo = movementRepo;
            _productRepo = productRepo;
            _auditRepo = auditRepo;
            _unitRepo = unitRepo ?? new ProductUnitRepository(connectionString);
            _priceHistoryRepo = priceHistoryRepo ?? new ProductPriceHistoryRepository(connectionString);
        }

        /// <summary>
        /// Task 35-2: الدالة المركزية الموحدة الوحيدة المسموح لها بتغيير كميات المخزون في النظام
        /// تضمن الذرية التامة وتحديث الرصيد وتسجيل الحركة في جدول حركات المخزون معاً.
        /// </summary>
        public StockMovement RecordStockChange(
            string productId,
            string movementType,
            long quantityDeltaMilli,
            long unitCostPiasters,
            string referenceId = null,
            string referenceType = null,
            string note = null,
            string batchNumber = null,
            SQLiteConnection conn = null,
            SQLiteTransaction trans = null)
        {
            if (string.IsNullOrWhiteSpace(productId))
            {
                throw new ArgumentException("معرف المنتج مطلوب لتغيير المخزون", "productId");
            }

            if (string.IsNullOrWhiteSpace(movementType))
            {
                throw new ArgumentException("نوع حركة المخزون مطلوب", "movementType");
            }

            var movement = new StockMovement
            {
                Id = Guid.NewGuid().ToString(),
                ProductId = productId.Trim(),
                MovementType = movementType.Trim().ToUpperInvariant(),
                QuantityMilli = quantityDeltaMilli,
                ReferenceId = referenceId,
                ReferenceType = referenceType,
                UnitCostPiasters = unitCostPiasters,
                Note = note,
                BatchNumber = batchNumber,
                CreatedAt = DateTime.UtcNow.ToString("o")
            };

            if (conn != null && trans != null)
            {
                ApplyStockChangeInternal(conn, trans, movement);
            }
            else
            {
                using (var localConn = new SQLiteConnection(_connectionString))
                {
                    localConn.Open();
                    using (var localTrans = localConn.BeginTransaction())
                    {
                        try
                        {
                            ApplyStockChangeInternal(localConn, localTrans, movement);
                            localTrans.Commit();
                        }
                        catch
                        {
                            localTrans.Rollback();
                            throw;
                        }
                    }
                }
            }

            return movement;
        }

        private void ApplyStockChangeInternal(SQLiteConnection conn, SQLiteTransaction trans, StockMovement movement)
        {
            // 1. Insert Movement in ledger
            _movementRepo.Add(movement, conn, trans);

            // 2. Atomically update cached stock on products table
            string updateSql = @"
                UPDATE products
                SET stock_quantity_milli = stock_quantity_milli + @delta,
                    updated_at = @now
                WHERE id = @pid;
            ";
            using (var cmd = new SQLiteCommand(updateSql, conn, trans))
            {
                cmd.Parameters.AddWithValue("@delta", movement.QuantityMilli);
                cmd.Parameters.AddWithValue("@now", movement.CreatedAt);
                cmd.Parameters.AddWithValue("@pid", movement.ProductId);
                int rows = cmd.ExecuteNonQuery();
                if (rows == 0)
                {
                    throw new InvalidOperationException("تعذر العثور على المنتج المطلوب تحديث مخزونه: " + movement.ProductId);
                }
            }

            // 3. If this product is a variant, update product_variants table and roll up parent product stock
            string syncVariantSql = @"
                UPDATE product_variants
                SET stock_quantity_milli = stock_quantity_milli + @delta,
                    updated_at = @now
                WHERE variant_product_id = @pid;

                UPDATE products
                SET stock_quantity_milli = (
                    SELECT COALESCE(SUM(p2.stock_quantity_milli), 0)
                    FROM products p2
                    WHERE p2.parent_id = (SELECT p1.parent_id FROM products p1 WHERE p1.id = @pid)
                ),
                updated_at = @now
                WHERE id = (SELECT p1.parent_id FROM products p1 WHERE p1.id = @pid AND p1.parent_id IS NOT NULL);
            ";
            using (var cmdSync = new SQLiteCommand(syncVariantSql, conn, trans))
            {
                cmdSync.Parameters.AddWithValue("@delta", movement.QuantityMilli);
                cmdSync.Parameters.AddWithValue("@now", movement.CreatedAt);
                cmdSync.Parameters.AddWithValue("@pid", movement.ProductId);
                cmdSync.ExecuteNonQuery();
            }
        }

        /// <summary>
        /// Task 37-1, 37-2: إجراء تسوية جردية لصنف محدد (زيادة أو عجز) مع حساب الفارق تلقائياً وتوثيقه في السجل
        /// </summary>
        public StockMovement AdjustStock(string productId, long newStockQuantityMilli, string reason, string userId = null, string adjustmentType = null)
        {
            if (string.IsNullOrWhiteSpace(productId))
            {
                throw new ArgumentException("معرف المنتج مطلوب للتسوية الجردية", "productId");
            }
            if (newStockQuantityMilli < 0)
            {
                throw new ArgumentException("الرصيد الفعلي بعد التسوية لا يمكن أن يكون سالباً", "newStockQuantityMilli");
            }
            if (string.IsNullOrWhiteSpace(reason))
            {
                throw new ArgumentException("سبب التسوية الجردية إجباري لتوثيق العملية في السجل", "reason");
            }

            var product = _productRepo.GetById(productId);
            if (product == null)
            {
                throw new InvalidOperationException("المنتج غير موجود: " + productId);
            }

            long currentStock = product.StockQuantityMilli;
            long delta = newStockQuantityMilli - currentStock;

            if (delta == 0)
            {
                return null; // No change needed
            }

            string cleanReason = reason.Trim();
            string cleanAdjType = string.IsNullOrWhiteSpace(adjustmentType) 
                ? (delta > 0 ? "SURPLUS" : "SHORTAGE") 
                : adjustmentType.Trim().ToUpperInvariant();

            string fullNote = string.Format("تسوية جردية [{0}]: من {1} إلى {2} (فارق: {3}{4}) - السبب: {5}",
                cleanAdjType,
                (currentStock / 1000.0).ToString("0.###"),
                (newStockQuantityMilli / 1000.0).ToString("0.###"),
                delta > 0 ? "+" : "",
                (delta / 1000.0).ToString("0.###"),
                cleanReason
            );

            StockMovement m = RecordStockChange(
                productId: product.Id,
                movementType: "ADJUSTMENT",
                quantityDeltaMilli: delta,
                unitCostPiasters: product.CostPiasters,
                referenceId: Guid.NewGuid().ToString(),
                referenceType: "MANUAL_ADJUSTMENT",
                note: fullNote,
                batchNumber: cleanAdjType
            );

            // Audit Log (ACID compliant, Task 37-2)
            if (_auditRepo != null)
            {
                try
                {
                    _auditRepo.Log(new AuditLog
                    {
                        Action = "stock_adjustment",
                        EntityType = "product",
                        EntityId = product.Id,
                        UserId = userId,
                        DetailsJson = string.Format("{{\"productName\":\"{0}\",\"oldStockMilli\":{1},\"newStockMilli\":{2},\"deltaMilli\":{3},\"adjustmentType\":\"{4}\",\"reason\":\"{5}\"}}",
                            product.Name, currentStock, newStockQuantityMilli, delta, cleanAdjType, cleanReason)
                    });
                }
                catch { }
            }

            return m;
        }

        /// <summary>
        /// Task 37-2: تسوية المخزون بإضافة أو خصم كمية محددة مباشرة (+ / -)
        /// </summary>
        public StockMovement AdjustStockByDelta(string productId, long quantityDeltaMilli, string reason, string userId = null, string adjustmentType = null)
        {
            if (string.IsNullOrWhiteSpace(productId))
            {
                throw new ArgumentException("معرف المنتج مطلوب للتسوية الجردية", "productId");
            }
            if (quantityDeltaMilli == 0)
            {
                return null;
            }

            var product = _productRepo.GetById(productId);
            if (product == null)
            {
                throw new InvalidOperationException("المنتج غير موجود: " + productId);
            }

            long targetStock = product.StockQuantityMilli + quantityDeltaMilli;
            if (targetStock < 0)
            {
                throw new ArgumentException(string.Format("لا يمكن خصم {0} لأن الرصيد المتاح {1} فقط (الرصيد الناتج سالب)", 
                    Math.Abs(quantityDeltaMilli / 1000.0).ToString("0.###"), 
                    (product.StockQuantityMilli / 1000.0).ToString("0.###")), "quantityDeltaMilli");
            }

            return AdjustStock(productId, targetStock, reason, userId, adjustmentType);
        }


        /// <summary>
        /// Tasks 161-8, 161-9, 161-10: تسجيل استلام مشتريات بالوحدات المتعددة مع زيادة المخزون واحتساب التكلفة بالوحدة الأساسية
        /// </summary>
        public StockMovement RecordPurchase(
            string productId,
            string unitId,
            double purchaseQuantity,
            long packageCostPiasters,
            string invoiceNumber,
            string supplierName,
            bool updateProductCost,
            string userId)
        {
            if (string.IsNullOrWhiteSpace(productId))
            {
                throw new ArgumentException("معرف المنتج مطلوب لتسجيل الشراء", "productId");
            }
            if (purchaseQuantity <= 0)
            {
                throw new ArgumentException("كمية الشراء يجب أن تكون أكبر من صفر", "purchaseQuantity");
            }
            if (packageCostPiasters < 0)
            {
                throw new ArgumentException("سعر الشراء لا يمكن أن يكون سالباً", "packageCostPiasters");
            }

            var product = _productRepo.GetById(productId);
            if (product == null)
            {
                throw new InvalidOperationException("المنتج غير موجود: " + productId);
            }

            ProductUnit unit = null;
            if (!string.IsNullOrWhiteSpace(unitId))
            {
                unit = _unitRepo.GetById(unitId);
            }

            long factor = 1;
            string unitName = product.Unit == "kg" ? "كجم" : "قطعة";

            if (unit != null)
            {
                factor = unit.ConversionFactor > 0 ? unit.ConversionFactor : 1;
                unitName = unit.UnitName;
            }

            // Task 161-9: إضافة المخزون بالوحدة الأساسية تلقائياً (الكمية × المعامل)
            long baseQuantityDeltaMilli = (long)Math.Round(purchaseQuantity * factor * 1000);

            // Task 161-10: حساب سعر التكلفة للوحدة الأساسية تلقائياً من سعر الشراء بالوحدة الكبيرة
            long baseCostPiasters = (long)Math.Round((double)packageCostPiasters / factor);

            string cleanSupplier = string.IsNullOrWhiteSpace(supplierName) ? "مورد عام" : supplierName.Trim();
            string cleanInvoice = string.IsNullOrWhiteSpace(invoiceNumber) ? ("PO-" + DateTime.Now.ToString("yyyyMMddHHmmss")) : invoiceNumber.Trim();

            string fullNote = string.Format("استلام مشتريات: {0} {1} (×{2}) بسعر {3:N2} ج.م/{1} | مورد: {4} | إذن/فاتورة: {5}",
                purchaseQuantity.ToString("0.###"),
                unitName,
                factor,
                packageCostPiasters / 100.0,
                cleanSupplier,
                cleanInvoice
            );

            StockMovement movement = null;

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        // 1. Record stock change in ledger & update stock_quantity_milli
                        movement = RecordStockChange(
                            productId: product.Id,
                            movementType: "PURCHASE",
                            quantityDeltaMilli: baseQuantityDeltaMilli,
                            unitCostPiasters: baseCostPiasters,
                            referenceId: cleanInvoice,
                            referenceType: "PURCHASE_RECEIPT",
                            note: fullNote,
                            batchNumber: null,
                            conn: conn,
                            trans: trans
                        );

                        // 2. Update product default cost if requested (Task 161-10)
                        if (updateProductCost && baseCostPiasters > 0 && baseCostPiasters != product.CostPiasters)
                        {
                            long oldCost = product.CostPiasters;
                            string updateCostSql = @"
                                UPDATE products
                                SET cost_piasters = @cost,
                                    updated_at = @now
                                WHERE id = @pid;
                            ";
                            using (var cmd = new SQLiteCommand(updateCostSql, conn, trans))
                            {
                                cmd.Parameters.AddWithValue("@cost", baseCostPiasters);
                                cmd.Parameters.AddWithValue("@now", DateTime.UtcNow.ToString("o"));
                                cmd.Parameters.AddWithValue("@pid", product.Id);
                                cmd.ExecuteNonQuery();
                            }

                            // 3. Log price history for cost change
                            if (_priceHistoryRepo != null)
                            {
                                var hist = new ProductPriceHistory
                                {
                                    Id = Guid.NewGuid().ToString(),
                                    ProductId = product.Id,
                                    OldPricePiasters = product.PricePiasters,
                                    NewPricePiasters = product.PricePiasters,
                                    OldCostPiasters = oldCost,
                                    NewCostPiasters = baseCostPiasters,
                                    ChangeReason = string.Format("تحديث تكلفة تلقائي من شراء {0} {1}", purchaseQuantity, unitName),
                                    CreatedAt = DateTime.UtcNow.ToString("o")
                                };
                                _priceHistoryRepo.Add(hist, conn, trans);
                            }
                        }

                        // 4. Update the package unit costPricePiasters in product_units if applicable
                        if (unit != null && packageCostPiasters > 0 && !unit.IsBaseUnit)
                        {
                            string updateUnitSql = @"
                                UPDATE product_units
                                SET cost_price_piasters = @cost,
                                    updated_at = @now
                                WHERE id = @uid;
                            ";
                            using (var cmd = new SQLiteCommand(updateUnitSql, conn, trans))
                            {
                                cmd.Parameters.AddWithValue("@cost", packageCostPiasters);
                                cmd.Parameters.AddWithValue("@now", DateTime.UtcNow.ToString("o"));
                                cmd.Parameters.AddWithValue("@uid", unit.Id);
                                cmd.ExecuteNonQuery();
                            }
                        }

                        trans.Commit();
                    }
                    catch
                    {
                        trans.Rollback();
                        throw;
                    }
                }
            }

            // Audit Log
            if (_auditRepo != null)
            {
                try
                {
                    _auditRepo.Log(new AuditLog
                    {
                        Action = "purchase_recorded",
                        EntityType = "inventory",
                        EntityId = product.Id,
                        UserId = userId,
                        DetailsJson = string.Format("{{\"productName\":\"{0}\",\"unitName\":\"{1}\",\"quantity\":{2},\"baseAdded\":{3},\"packageCostPiasters\":{4},\"baseCostPiasters\":{5},\"invoice\":\"{6}\"}}",
                            product.Name, unitName, purchaseQuantity, baseQuantityDeltaMilli / 1000.0, packageCostPiasters, baseCostPiasters, cleanInvoice)
                    });
                }
                catch { }
            }

            return movement;
        }

        public List<StockMovement> GetMovements(string productId = null, string movementType = null, string fromDate = null, string toDate = null, int limit = 200)
        {
            return _movementRepo.GetMovements(productId, movementType, fromDate, toDate, limit);
        }

        /// <summary>
        /// Task 34-1: فحص مطابقة الأرصدة المخزنة في جدول الأصناف مع مجموع حركات المخزون
        /// </summary>
        public List<StockDiscrepancy> CheckDiscrepancies()
        {
            return _movementRepo.CheckDiscrepancies();
        }

        /// <summary>
        /// Task 34-3: أداة «إعادة حساب المخزون من الحركات» لإصلاح أي عدم اتساق
        /// </summary>
        public int RecalculateStock(string productId = null, string userId = null)
        {
            int updatedCount = _movementRepo.RecalculateStockFromMovements(productId);

            if (_auditRepo != null)
            {
                try
                {
                    _auditRepo.Log(new AuditLog
                    {
                        Action = "stock_recalculation",
                        EntityType = "inventory",
                        EntityId = string.IsNullOrEmpty(productId) ? "ALL" : productId,
                        UserId = userId,
                        DetailsJson = string.Format("{{\"updatedCount\":{0},\"target\":\"{1}\"}}",
                            updatedCount, string.IsNullOrEmpty(productId) ? "ALL_PRODUCTS" : productId)
                    });
                }
                catch { }
            }

            return updatedCount;
        }
    }
}
