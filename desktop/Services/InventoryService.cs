using System;
using System.Collections.Generic;
using RafiqPOS.Data;
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
                      AND p2.is_active = 1
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
            ValidateAdjustmentInput(productId, reason);
            if (newStockQuantityMilli < 0)
            {
                throw new ArgumentException("الرصيد الفعلي بعد التسوية لا يمكن أن يكون سالباً", "newStockQuantityMilli");
            }

            lock (SaleService.FinancialWriteLock)
            {
                return RunInTransaction(delegate(SQLiteConnection conn, SQLiteTransaction trans)
                {
                    return AdjustStockInTransaction(conn, trans, productId, newStockQuantityMilli, reason, userId, adjustmentType, "MANUAL_ADJUSTMENT");
                });
            }
        }

        /// <summary>
        /// Task 37-2: تسوية المخزون بإضافة أو خصم كمية محددة مباشرة (+ / -)
        /// </summary>
        public StockMovement AdjustStockByDelta(string productId, long quantityDeltaMilli, string reason, string userId = null, string adjustmentType = null)
        {
            ValidateAdjustmentInput(productId, reason);
            if (quantityDeltaMilli == 0)
            {
                return null;
            }

            lock (SaleService.FinancialWriteLock)
            {
                return RunInTransaction(delegate(SQLiteConnection conn, SQLiteTransaction trans)
                {
                    // The current stock is read inside the lock and transaction so a concurrent sale cannot shift the delta
                    long currentStock = ReadProductStock(conn, trans, productId);
                    long targetStock = currentStock + quantityDeltaMilli;
                    if (targetStock < 0)
                    {
                        throw new ArgumentException(string.Format("لا يمكن خصم {0} لأن الرصيد المتاح {1} فقط (الرصيد الناتج سالب)",
                            Math.Abs(quantityDeltaMilli / 1000.0).ToString("0.###"),
                            (currentStock / 1000.0).ToString("0.###")), "quantityDeltaMilli");
                    }
                    return AdjustStockInTransaction(conn, trans, productId, targetStock, reason, userId, adjustmentType, "MANUAL_ADJUSTMENT");
                });
            }
        }

        /// <summary>
        /// تسوية رصيد صنف إلى رصيد مطلق داخل معاملة قائمة: حركة ADJUSTMENT + تحديث الرصيد والمتغيرات + مطابقة التشغيلات + سجل التدقيق.
        /// يجب استدعاؤها والقفل المالي محجوز.
        /// </summary>
        public StockMovement AdjustStockInTransaction(SQLiteConnection conn, SQLiteTransaction trans, string productId, long newStockQuantityMilli, string reason, string userId, string adjustmentType, string referenceType)
        {
            ValidateAdjustmentInput(productId, reason);
            if (newStockQuantityMilli < 0)
            {
                throw new ArgumentException("الرصيد الفعلي بعد التسوية لا يمكن أن يكون سالباً", "newStockQuantityMilli");
            }

            string productName;
            long currentStock;
            long costPiasters;
            bool hasVariants;
            using (var cmd = new SQLiteCommand("SELECT name, stock_quantity_milli, cost_piasters, COALESCE(has_variants, 0) AS has_variants FROM products WHERE id = @pid;", conn, trans))
            {
                cmd.Parameters.AddWithValue("@pid", productId.Trim());
                using (var reader = cmd.ExecuteReader())
                {
                    if (!reader.Read())
                    {
                        throw new InvalidOperationException("المنتج غير موجود: " + productId);
                    }
                    productName = reader["name"].ToString();
                    currentStock = Convert.ToInt64(reader["stock_quantity_milli"]);
                    costPiasters = Convert.ToInt64(reader["cost_piasters"]);
                    hasVariants = Convert.ToInt32(reader["has_variants"]) == 1;
                }
            }
            if (hasVariants)
            {
                throw new InvalidOperationException("لا يمكن إجراء تسوية جردية مباشرة على منتج أب له متغيرات. يرجى تسوية رصيد كل متغير (لون/مقاس) على حدة للحفاظ على مصفوفة الأصناف.");
            }

            long delta = newStockQuantityMilli - currentStock;
            if (delta == 0)
            {
                return null;
            }

            string cleanReason = reason.Trim();
            string cleanAdjType = string.IsNullOrWhiteSpace(adjustmentType)
                ? (delta > 0 ? "SURPLUS" : "SHORTAGE")
                : adjustmentType.Trim().ToUpperInvariant();

            string typeLabel = (cleanAdjType == "SURPLUS" || cleanAdjType == "فائض جردي" || cleanAdjType == "زيادة")
                ? "فائض جردي"
                : ((cleanAdjType == "SHORTAGE" || cleanAdjType == "عجز جردي" || cleanAdjType == "عجز") ? "عجز جردي" : cleanAdjType);

            string fullNote = string.Format("تسوية جردية [{0}]: من {1} إلى {2} (فارق: {3}{4}) - السبب: {5}",
                typeLabel,
                (currentStock / 1000.0).ToString("0.###"),
                (newStockQuantityMilli / 1000.0).ToString("0.###"),
                delta > 0 ? "+" : "",
                (delta / 1000.0).ToString("0.###"),
                cleanReason);

            StockMovement m = RecordStockChange(
                productId: productId.Trim(),
                movementType: "ADJUSTMENT",
                quantityDeltaMilli: delta,
                unitCostPiasters: costPiasters,
                referenceId: Guid.NewGuid().ToString(),
                referenceType: string.IsNullOrWhiteSpace(referenceType) ? "MANUAL_ADJUSTMENT" : referenceType,
                note: fullNote,
                batchNumber: null,
                conn: conn,
                trans: trans);

            ProductBatchRepository.SyncBatchesWithStockDelta(conn, trans, productId.Trim(), delta);

            if (_auditRepo != null)
            {
                _auditRepo.Log(conn, trans, new AuditLog
                {
                    Action = "stock_adjustment",
                    EntityType = "product",
                    EntityId = productId.Trim(),
                    UserId = userId,
                    DetailsJson = Newtonsoft.Json.JsonConvert.SerializeObject(new
                    {
                        productName = productName,
                        oldStockMilli = currentStock,
                        newStockMilli = newStockQuantityMilli,
                        deltaMilli = delta,
                        adjustmentType = cleanAdjType,
                        reason = cleanReason
                    })
                });
            }

            return m;
        }

        private static void ValidateAdjustmentInput(string productId, string reason)
        {
            if (string.IsNullOrWhiteSpace(productId))
            {
                throw new ArgumentException("معرف المنتج مطلوب للتسوية الجردية", "productId");
            }
            if (string.IsNullOrWhiteSpace(reason))
            {
                throw new ArgumentException("سبب التسوية الجردية إجباري لتوثيق العملية في السجل", "reason");
            }
        }

        private static long ReadProductStock(SQLiteConnection conn, SQLiteTransaction trans, string productId)
        {
            using (var cmd = new SQLiteCommand("SELECT stock_quantity_milli FROM products WHERE id = @pid;", conn, trans))
            {
                cmd.Parameters.AddWithValue("@pid", productId.Trim());
                object res = cmd.ExecuteScalar();
                if (res == null || res == DBNull.Value)
                {
                    throw new InvalidOperationException("المنتج غير موجود: " + productId);
                }
                return Convert.ToInt64(res);
            }
        }

        private delegate StockMovement TransactionStep(SQLiteConnection conn, SQLiteTransaction trans);

        private StockMovement RunInTransaction(TransactionStep step)
        {
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        StockMovement result = step(conn, trans);
                        trans.Commit();
                        return result;
                    }
                    catch
                    {
                        trans.Rollback();
                        throw;
                    }
                }
            }
        }


        /// <summary>
        /// F-31: إلغاء مسار الشراء الموازي المنفصل وتوحيده عبر دورة المشتريات المركزية CreatePurchase
        /// تضمن تحديث الحسابات، الأرصدة، وسجل المشتريات، وتسجيل الباتشات والتكلفة المرجحة بدقة.
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

            long baseQuantityDeltaMilli = (long)Math.Round((decimal)purchaseQuantity * factor * 1000m, MidpointRounding.AwayFromZero);
            if (baseQuantityDeltaMilli <= 0)
            {
                throw new ArgumentException("كمية الشراء يجب أن تكون أكبر من صفر", "purchaseQuantity");
            }
            long baseCostPiasters = (long)Math.Round((decimal)packageCostPiasters / factor, 0, MidpointRounding.AwayFromZero);

            string cleanInvoice = string.IsNullOrWhiteSpace(invoiceNumber) ? null : invoiceNumber.Trim();
            string nowIso = DateTime.UtcNow.ToString("o");

            // Totals, net and the paid amount are computed by CreatePurchase; the supplier is resolved inside its transaction
            var purchase = new Purchase
            {
                Id = Guid.NewGuid().ToString(),
                SupplierName = !string.IsNullOrWhiteSpace(supplierName) ? supplierName.Trim() : null,
                AutoCreateSupplier = !string.IsNullOrWhiteSpace(supplierName),
                SupplierInvoiceNumber = cleanInvoice,
                InvoiceDate = nowIso,
                DiscountPiasters = 0,
                PayInFull = true,
                PaymentSource = "external_cash",
                Status = "COMPLETED",
                Notes = string.Format("تسجيل استلام بضاعة سريع: {0} {1}", purchaseQuantity.ToString("0.###"), unitName),
                CreatedByUserId = userId,
                Items = new List<PurchaseItem>
                {
                    new PurchaseItem
                    {
                        Id = Guid.NewGuid().ToString(),
                        ProductId = product.Id,
                        ProductName = product.Name,
                        Barcode = !string.IsNullOrWhiteSpace(unit != null ? unit.Barcode : null) ? unit.Barcode : product.Barcode,
                        QuantityMilli = baseQuantityDeltaMilli,
                        BonusQuantityMilli = 0,
                        UnitCostPiasters = baseCostPiasters,
                        DiscountPiasters = 0,
                        PreviousCostPiasters = product.CostPiasters,
                        NewSellingPricePiasters = null,
                        UnitId = unit != null ? unit.Id : null,
                        UnitName = unitName,
                        ConversionFactor = factor,
                        PackageCostPiasters = packageCostPiasters,
                        CreatedAt = nowIso
                    }
                }
            };

            var purchaseRepo = new PurchaseRepository(_connectionString, auditRepo: _auditRepo);
            string costingMethod = updateProductCost ? "LATEST" : "KEEP";
            var createdPurchase = purchaseRepo.CreatePurchase(purchase, costingMethod, userId);

            return new StockMovement
            {
                Id = Guid.NewGuid().ToString(),
                ProductId = product.Id,
                MovementType = "PURCHASE",
                QuantityMilli = baseQuantityDeltaMilli,
                UnitCostPiasters = baseCostPiasters,
                ReferenceId = createdPurchase.InvoiceNumber.ToString(),
                ReferenceType = "PURCHASE_RECEIPT",
                Note = purchase.Notes,
                CreatedAt = nowIso
            };
        }

        public List<StockMovement> GetMovements(string productId = null, string movementType = null, string fromDate = null, string toDate = null, int limit = 200, string dateFrom = null, string dateTo = null)
        {
            return _movementRepo.GetMovements(productId, movementType, fromDate, toDate, limit, dateFrom, dateTo);
        }

        /// <summary>
        /// Task 34-1: فحص مطابقة الأرصدة المخزنة في جدول الأصناف مع مجموع حركات المخزون
        /// </summary>
        public List<StockDiscrepancy> CheckDiscrepancies()
        {
            return _movementRepo.CheckDiscrepancies();
        }

        private static Dictionary<string, long> ReadStandaloneStock(SQLiteConnection conn, SQLiteTransaction trans, string productId)
        {
            var map = new Dictionary<string, long>(StringComparer.OrdinalIgnoreCase);
            string sql = "SELECT id, stock_quantity_milli FROM products WHERE (has_variants = 0 OR has_variants IS NULL)"
                + (string.IsNullOrWhiteSpace(productId) ? ";" : " AND id = @pid;");
            using (var cmd = new SQLiteCommand(sql, conn, trans))
            {
                if (!string.IsNullOrWhiteSpace(productId)) cmd.Parameters.AddWithValue("@pid", productId.Trim());
                using (var reader = cmd.ExecuteReader())
                {
                    while (reader.Read())
                    {
                        map[reader["id"].ToString()] = Convert.ToInt64(reader["stock_quantity_milli"]);
                    }
                }
            }
            return map;
        }

        /// <summary>
        /// Task 34-3: أداة «إعادة حساب المخزون من الحركات» لإصلاح أي عدم اتساق
        /// </summary>
        public int RecalculateStock(string productId = null, string userId = null)
        {
            lock (SaleService.FinancialWriteLock)
            {
                int updatedCount;
                using (var conn = new SQLiteConnection(_connectionString))
                {
                    conn.Open();
                    using (var trans = conn.BeginTransaction())
                    {
                        try
                        {
                            Dictionary<string, long> before = ReadStandaloneStock(conn, trans, productId);
                            updatedCount = _movementRepo.RecalculateStockFromMovements(productId, conn, trans);
                            Dictionary<string, long> after = ReadStandaloneStock(conn, trans, productId);
                            foreach (var entry in after)
                            {
                                long oldStock;
                                if (before.TryGetValue(entry.Key, out oldStock) && oldStock != entry.Value)
                                {
                                    ProductBatchRepository.SyncBatchesWithStockDelta(conn, trans, entry.Key, entry.Value - oldStock);
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
}
