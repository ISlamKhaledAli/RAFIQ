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

        public InventoryService(
            string connectionString,
            StockMovementRepository movementRepo,
            ProductRepository productRepo,
            AuditLogRepository auditRepo = null)
        {
            _connectionString = connectionString;
            _movementRepo = movementRepo;
            _productRepo = productRepo;
            _auditRepo = auditRepo;
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
        }

        /// <summary>
        /// إجراء تسوية جردية لصنف محدد (زيادة أو عجز) مع حساب الفارق تلقائياً وتوثيقه في السجل
        /// </summary>
        public StockMovement AdjustStock(string productId, long newStockQuantityMilli, string reason, string userId = null)
        {
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

            string cleanReason = string.IsNullOrWhiteSpace(reason) ? "تسوية جردية يدوية" : reason.Trim();
            string fullNote = string.Format("تسوية جردية: من {0} إلى {1} ({2})", 
                (currentStock / 1000.0).ToString("0.###"),
                (newStockQuantityMilli / 1000.0).ToString("0.###"),
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
                batchNumber: null
            );

            // Audit Log
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
                        DetailsJson = string.Format("{{\"productName\":\"{0}\",\"oldStockMilli\":{1},\"newStockMilli\":{2},\"deltaMilli\":{3},\"reason\":\"{4}\"}}",
                            product.Name, currentStock, newStockQuantityMilli, delta, cleanReason)
                    });
                }
                catch { }
            }

            return m;
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
