using System;
using System.Collections.Generic;
using System.Data.SQLite;
using RafiqPOS.Models;

namespace RafiqPOS.Repositories
{
    public class ProductBatchRepository
    {
        private readonly string _connectionString;
        private readonly AuditLogRepository _auditRepo;

        public ProductBatchRepository(string connectionString, AuditLogRepository auditRepo = null)
        {
            _connectionString = connectionString;
            _auditRepo = auditRepo ?? new AuditLogRepository(connectionString);
        }

        public ProductBatch GetById(string id, SQLiteConnection conn = null, SQLiteTransaction trans = null)
        {
            if (string.IsNullOrEmpty(id)) return null;

            string sql = @"
                SELECT b.id, b.product_id, b.batch_number, b.expiry_date, b.production_date,
                       b.quantity_milli, b.cost_price_piasters, b.supplier_id, b.purchase_id,
                       b.status, b.notes, b.created_at, b.updated_at,
                       p.name AS product_name, p.barcode AS product_barcode, p.unit,
                       s.name AS supplier_name
                FROM product_batches b
                JOIN products p ON b.product_id = p.id
                LEFT JOIN suppliers s ON b.supplier_id = s.id
                WHERE b.id = @id;
            ";

            if (conn != null && trans != null)
            {
                using (var cmd = new SQLiteCommand(sql, conn, trans))
                {
                    cmd.Parameters.AddWithValue("@id", id);
                    using (var reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            return MapBatch(reader);
                        }
                    }
                }
                return null;
            }

            using (var localConn = new SQLiteConnection(_connectionString))
            {
                localConn.Open();
                using (var cmd = new SQLiteCommand(sql, localConn))
                {
                    cmd.Parameters.AddWithValue("@id", id);
                    using (var reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            return MapBatch(reader);
                        }
                    }
                }
            }
            return null;
        }

        public List<ProductBatch> GetByProductId(string productId, bool activeOnly = true)
        {
            var list = new List<ProductBatch>();
            if (string.IsNullOrEmpty(productId)) return list;

            string sql = @"
                SELECT b.id, b.product_id, b.batch_number, b.expiry_date, b.production_date,
                       b.quantity_milli, b.cost_price_piasters, b.supplier_id, b.purchase_id,
                       b.status, b.notes, b.created_at, b.updated_at,
                       p.name AS product_name, p.barcode AS product_barcode, p.unit,
                       s.name AS supplier_name
                FROM product_batches b
                JOIN products p ON b.product_id = p.id
                LEFT JOIN suppliers s ON b.supplier_id = s.id
                WHERE b.product_id = @pid " + (activeOnly ? "AND b.status = 'ACTIVE' AND b.quantity_milli > 0 " : "") + @"
                ORDER BY 
                    CASE WHEN b.expiry_date IS NULL THEN 1 ELSE 0 END ASC,
                    b.expiry_date ASC,
                    b.created_at ASC;
            ";

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@pid", productId);
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            list.Add(MapBatch(reader));
                        }
                    }
                }
            }
            return list;
        }

        public List<ProductBatch> GetExpiringBatches(int daysAhead = 30)
        {
            var list = new List<ProductBatch>();

            string sql = @"
                SELECT b.id, b.product_id, b.batch_number, b.expiry_date, b.production_date,
                       b.quantity_milli, b.cost_price_piasters, b.supplier_id, b.purchase_id,
                       b.status, b.notes, b.created_at, b.updated_at,
                       p.name AS product_name, p.barcode AS product_barcode, p.unit,
                       s.name AS supplier_name
                FROM product_batches b
                JOIN products p ON b.product_id = p.id
                LEFT JOIN suppliers s ON b.supplier_id = s.id
                WHERE b.status = 'ACTIVE' 
                  AND b.quantity_milli > 0
                  AND b.expiry_date IS NOT NULL
                  AND date(b.expiry_date) >= date('now')
                  AND date(b.expiry_date) <= date('now', '+' || @days || ' days')
                ORDER BY b.expiry_date ASC, p.name ASC;
            ";

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@days", daysAhead);
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            list.Add(MapBatch(reader));
                        }
                    }
                }
            }
            return list;
        }

        public List<ProductBatch> GetExpiredBatches()
        {
            var list = new List<ProductBatch>();

            string sql = @"
                SELECT b.id, b.product_id, b.batch_number, b.expiry_date, b.production_date,
                       b.quantity_milli, b.cost_price_piasters, b.supplier_id, b.purchase_id,
                       b.status, b.notes, b.created_at, b.updated_at,
                       p.name AS product_name, p.barcode AS product_barcode, p.unit,
                       s.name AS supplier_name
                FROM product_batches b
                JOIN products p ON b.product_id = p.id
                LEFT JOIN suppliers s ON b.supplier_id = s.id
                WHERE b.quantity_milli > 0
                  AND b.expiry_date IS NOT NULL
                  AND date(b.expiry_date) < date('now')
                ORDER BY b.expiry_date ASC, p.name ASC;
            ";

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            list.Add(MapBatch(reader));
                        }
                    }
                }
            }
            return list;
        }

        public BatchSummaryResult GetBatchSummary(int alertDays = 30)
        {
            var summary = new BatchSummaryResult
            {
                AlertDays = alertDays
            };

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();

                // 1. Total and Active Batches
                using (var cmd = new SQLiteCommand(@"
                    SELECT 
                        COUNT(*) AS total_count,
                        COALESCE(SUM(CASE WHEN status = 'ACTIVE' AND quantity_milli > 0 THEN 1 ELSE 0 END), 0) AS active_count
                    FROM product_batches;
                ", conn))
                using (var reader = cmd.ExecuteReader())
                {
                    if (reader.Read())
                    {
                        summary.TotalBatchesCount = Convert.ToInt32(reader["total_count"]);
                        summary.ActiveBatchesCount = Convert.ToInt32(reader["active_count"]);
                    }
                }

                // 2. Expired Batches count and total value
                using (var cmd = new SQLiteCommand(@"
                    SELECT 
                        COUNT(*) AS expired_count,
                        COALESCE(SUM((quantity_milli * cost_price_piasters) / 1000), 0) AS expired_val
                    FROM product_batches
                    WHERE quantity_milli > 0
                      AND expiry_date IS NOT NULL
                      AND date(expiry_date) < date('now');
                ", conn))
                using (var reader = cmd.ExecuteReader())
                {
                    if (reader.Read())
                    {
                        summary.ExpiredCount = Convert.ToInt32(reader["expired_count"]);
                        summary.ExpiredValuePiasters = Convert.ToInt64(reader["expired_val"]);
                    }
                }

                // 3. Expiring Soon count and total value
                using (var cmd = new SQLiteCommand(@"
                    SELECT 
                        COUNT(*) AS soon_count,
                        COALESCE(SUM((quantity_milli * cost_price_piasters) / 1000), 0) AS soon_val
                    FROM product_batches
                    WHERE status = 'ACTIVE'
                      AND quantity_milli > 0
                      AND expiry_date IS NOT NULL
                      AND date(expiry_date) >= date('now')
                      AND date(expiry_date) <= date('now', '+' || @days || ' days');
                ", conn))
                {
                    cmd.Parameters.AddWithValue("@days", alertDays);
                    using (var reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            summary.ExpiringSoonCount = Convert.ToInt32(reader["soon_count"]);
                            summary.ExpiringSoonValuePiasters = Convert.ToInt64(reader["soon_val"]);
                        }
                    }
                }
            }

            return summary;
        }

        public ProductBatch CreateOrUpdateBatch(ProductBatch batch, SQLiteConnection conn = null, SQLiteTransaction trans = null)
        {
            if (batch == null) throw new ArgumentNullException("batch");
            if (string.IsNullOrEmpty(batch.ProductId)) throw new ArgumentException("معرف المنتج مطلوب لإنشاء أو تحديث الدفعة");

            string now = DateTime.UtcNow.ToString("o");
            bool localTrans = false;
            SQLiteConnection activeConn = conn;
            SQLiteTransaction activeTrans = trans;

            if (activeConn == null)
            {
                activeConn = new SQLiteConnection(_connectionString);
                activeConn.Open();
                activeTrans = activeConn.BeginTransaction();
                localTrans = true;
            }

            try
            {
                if (string.IsNullOrEmpty(batch.BatchNumber))
                {
                    batch.BatchNumber = "B-" + DateTime.UtcNow.ToString("yyyyMMdd-HHmmss");
                }

                // Check if existing batch with same product_id and batch_number exists
                string existingId = null;
                long existingQty = 0;
                using (var chk = new SQLiteCommand("SELECT id, quantity_milli FROM product_batches WHERE product_id = @pid AND batch_number = @bnum;", activeConn, activeTrans))
                {
                    chk.Parameters.AddWithValue("@pid", batch.ProductId);
                    chk.Parameters.AddWithValue("@bnum", batch.BatchNumber.Trim());
                    using (var reader = chk.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            existingId = reader["id"].ToString();
                            existingQty = Convert.ToInt64(reader["quantity_milli"]);
                        }
                    }
                }

                if (!string.IsNullOrEmpty(existingId))
                {
                    batch.Id = existingId;
                    batch.QuantityMilli += existingQty; // Add incoming quantity to existing batch
                    batch.UpdatedAt = now;

                    string updateSql = @"
                        UPDATE product_batches
                        SET expiry_date = COALESCE(@exp, expiry_date),
                            production_date = COALESCE(@prodDate, production_date),
                            quantity_milli = @qty,
                            cost_price_piasters = CASE WHEN @cost > 0 THEN @cost ELSE cost_price_piasters END,
                            supplier_id = COALESCE(@suppId, supplier_id),
                            purchase_id = COALESCE(@purId, purchase_id),
                            status = CASE WHEN @qty > 0 THEN 'ACTIVE' ELSE 'DEPLETED' END,
                            notes = COALESCE(@notes, notes),
                            updated_at = @now
                        WHERE id = @id;
                    ";
                    using (var cmd = new SQLiteCommand(updateSql, activeConn, activeTrans))
                    {
                        cmd.Parameters.AddWithValue("@exp", (object)batch.ExpiryDate ?? DBNull.Value);
                        cmd.Parameters.AddWithValue("@prodDate", (object)batch.ProductionDate ?? DBNull.Value);
                        cmd.Parameters.AddWithValue("@qty", batch.QuantityMilli);
                        cmd.Parameters.AddWithValue("@cost", batch.CostPricePiasters);
                        cmd.Parameters.AddWithValue("@suppId", (object)batch.SupplierId ?? DBNull.Value);
                        cmd.Parameters.AddWithValue("@purId", (object)batch.PurchaseId ?? DBNull.Value);
                        cmd.Parameters.AddWithValue("@notes", (object)batch.Notes ?? DBNull.Value);
                        cmd.Parameters.AddWithValue("@now", now);
                        cmd.Parameters.AddWithValue("@id", batch.Id);
                        cmd.ExecuteNonQuery();
                    }
                }
                else
                {
                    batch.Id = string.IsNullOrEmpty(batch.Id) ? "bat_" + Guid.NewGuid().ToString("N") : batch.Id;
                    batch.CreatedAt = now;
                    batch.UpdatedAt = now;
                    batch.Status = batch.QuantityMilli > 0 ? "ACTIVE" : "DEPLETED";

                    string insertSql = @"
                        INSERT INTO product_batches (
                            id, product_id, batch_number, expiry_date, production_date,
                            quantity_milli, cost_price_piasters, supplier_id, purchase_id,
                            status, notes, created_at, updated_at
                        ) VALUES (
                            @id, @pid, @bnum, @exp, @prodDate,
                            @qty, @cost, @suppId, @purId,
                            @status, @notes, @createdAt, @updatedAt
                        );
                    ";
                    using (var cmd = new SQLiteCommand(insertSql, activeConn, activeTrans))
                    {
                        cmd.Parameters.AddWithValue("@id", batch.Id);
                        cmd.Parameters.AddWithValue("@pid", batch.ProductId);
                        cmd.Parameters.AddWithValue("@bnum", batch.BatchNumber.Trim());
                        cmd.Parameters.AddWithValue("@exp", (object)batch.ExpiryDate ?? DBNull.Value);
                        cmd.Parameters.AddWithValue("@prodDate", (object)batch.ProductionDate ?? DBNull.Value);
                        cmd.Parameters.AddWithValue("@qty", batch.QuantityMilli);
                        cmd.Parameters.AddWithValue("@cost", batch.CostPricePiasters);
                        cmd.Parameters.AddWithValue("@suppId", (object)batch.SupplierId ?? DBNull.Value);
                        cmd.Parameters.AddWithValue("@purId", (object)batch.PurchaseId ?? DBNull.Value);
                        cmd.Parameters.AddWithValue("@status", batch.Status);
                        cmd.Parameters.AddWithValue("@notes", (object)batch.Notes ?? DBNull.Value);
                        cmd.Parameters.AddWithValue("@createdAt", batch.CreatedAt);
                        cmd.Parameters.AddWithValue("@updatedAt", batch.UpdatedAt);
                        cmd.ExecuteNonQuery();
                    }
                }

                if (localTrans)
                {
                    activeTrans.Commit();
                }

                return batch;
            }
            catch
            {
                if (localTrans && activeTrans != null)
                {
                    activeTrans.Rollback();
                }
                throw;
            }
            finally
            {
                if (localTrans && activeConn != null)
                {
                    activeConn.Dispose();
                }
            }
        }

        public List<BatchDeductionResult> DeductFromBatchesFefo(string productId, long quantityMilliToDeduct, SQLiteConnection conn, SQLiteTransaction trans)
        {
            var results = new List<BatchDeductionResult>();
            if (string.IsNullOrEmpty(productId) || quantityMilliToDeduct <= 0)
            {
                return results;
            }

            // Fetch active batches with remaining quantity ordered by expiry date (FEFO: First-Expired First-Out)
            // Rules from Task 60-1:
            // 1. Batches with expiry date are deducted before batches without expiry date.
            // 2. Earliest expiry date deducted first.
            // 3. If multiple batches have the same expiry date, earlier created_at deducted first.
            string sql = @"
                SELECT id, batch_number, expiry_date, quantity_milli
                FROM product_batches
                WHERE product_id = @pid AND status = 'ACTIVE' AND quantity_milli > 0
                ORDER BY 
                    CASE WHEN expiry_date IS NULL THEN 1 ELSE 0 END ASC,
                    expiry_date ASC,
                    created_at ASC;
            ";

            var batches = new List<ProductBatch>();
            using (var cmd = new SQLiteCommand(sql, conn, trans))
            {
                cmd.Parameters.AddWithValue("@pid", productId);
                using (var reader = cmd.ExecuteReader())
                {
                    while (reader.Read())
                    {
                        batches.Add(new ProductBatch
                        {
                            Id = reader["id"].ToString(),
                            BatchNumber = reader["batch_number"].ToString(),
                            ExpiryDate = reader["expiry_date"] != DBNull.Value ? reader["expiry_date"].ToString() : null,
                            QuantityMilli = Convert.ToInt64(reader["quantity_milli"])
                        });
                    }
                }
            }

            if (batches.Count == 0)
            {
                return results; // No batches recorded for this product
            }

            string now = DateTime.UtcNow.ToString("o");
            long remainingToDeduct = quantityMilliToDeduct;

            for (int i = 0; i < batches.Count; i++)
            {
                if (remainingToDeduct <= 0) break;

                var b = batches[i];
                long deductFromThisBatch = Math.Min(remainingToDeduct, b.QuantityMilli);
                long newQty = b.QuantityMilli - deductFromThisBatch;
                string newStatus = newQty > 0 ? "ACTIVE" : "DEPLETED";

                string updateSql = @"
                    UPDATE product_batches
                    SET quantity_milli = @qty,
                        status = @status,
                        updated_at = @now
                    WHERE id = @id;
                ";
                using (var cmd = new SQLiteCommand(updateSql, conn, trans))
                {
                    cmd.Parameters.AddWithValue("@qty", newQty);
                    cmd.Parameters.AddWithValue("@status", newStatus);
                    cmd.Parameters.AddWithValue("@now", now);
                    cmd.Parameters.AddWithValue("@id", b.Id);
                    cmd.ExecuteNonQuery();
                }

                results.Add(new BatchDeductionResult
                {
                    BatchId = b.Id,
                    BatchNumber = b.BatchNumber,
                    ExpiryDate = b.ExpiryDate,
                    DeductedQuantityMilli = deductFromThisBatch,
                    RemainingQuantityMilli = newQty
                });

                remainingToDeduct -= deductFromThisBatch;
            }

            return results;
        }

        public void AdjustBatchStock(string batchId, long newQuantityMilli, string reason, string userId, SQLiteConnection conn = null, SQLiteTransaction trans = null)
        {
            if (string.IsNullOrEmpty(batchId)) throw new ArgumentNullException("batchId");
            if (newQuantityMilli < 0) throw new ArgumentException("رصيد الدفعة لا يمكن أن يكون سالباً");

            bool localTrans = false;
            SQLiteConnection activeConn = conn;
            SQLiteTransaction activeTrans = trans;

            if (activeConn == null)
            {
                activeConn = new SQLiteConnection(_connectionString);
                activeConn.Open();
                activeTrans = activeConn.BeginTransaction();
                localTrans = true;
            }

            try
            {
                var batch = GetById(batchId, activeConn, activeTrans);
                if (batch == null)
                {
                    throw new InvalidOperationException("الدفعة المطلوبة غير موجودة");
                }

                long oldQty = batch.QuantityMilli;
                long delta = newQuantityMilli - oldQty;
                string now = DateTime.UtcNow.ToString("o");
                string newStatus = newQuantityMilli > 0 ? "ACTIVE" : "DEPLETED";

                // 1. Update batch quantity and status
                string updateBatchSql = @"
                    UPDATE product_batches
                    SET quantity_milli = @qty,
                        status = @status,
                        updated_at = @now
                    WHERE id = @id;
                ";
                using (var cmd = new SQLiteCommand(updateBatchSql, activeConn, activeTrans))
                {
                    cmd.Parameters.AddWithValue("@qty", newQuantityMilli);
                    cmd.Parameters.AddWithValue("@status", newStatus);
                    cmd.Parameters.AddWithValue("@now", now);
                    cmd.Parameters.AddWithValue("@id", batchId);
                    cmd.ExecuteNonQuery();
                }

                // 2. Adjust overall product stock
                string updateProductSql = @"
                    UPDATE products
                    SET stock_quantity_milli = stock_quantity_milli + @delta,
                        updated_at = @now
                    WHERE id = @pid;
                ";
                using (var cmd = new SQLiteCommand(updateProductSql, activeConn, activeTrans))
                {
                    cmd.Parameters.AddWithValue("@delta", delta);
                    cmd.Parameters.AddWithValue("@now", now);
                    cmd.Parameters.AddWithValue("@pid", batch.ProductId);
                    cmd.ExecuteNonQuery();
                }

                // 3. Record stock movement
                string insertSmSql = @"
                    INSERT INTO stock_movements (
                        id, product_id, movement_type, quantity_milli, reference_id, reference_type,
                        unit_cost_piasters, note, batch_number, batch_id, created_at
                    ) VALUES (
                        @id, @pid, 'ADJUSTMENT', @qty, @refId, 'BATCH_ADJUSTMENT',
                        @cost, @note, @bnum, @bid, @now
                    );
                ";
                using (var cmd = new SQLiteCommand(insertSmSql, activeConn, activeTrans))
                {
                    cmd.Parameters.AddWithValue("@id", Guid.NewGuid().ToString());
                    cmd.Parameters.AddWithValue("@pid", batch.ProductId);
                    cmd.Parameters.AddWithValue("@qty", delta);
                    cmd.Parameters.AddWithValue("@refId", batch.Id);
                    cmd.Parameters.AddWithValue("@cost", batch.CostPricePiasters);
                    cmd.Parameters.AddWithValue("@note", "تسوية رصيد الدفعة [" + batch.BatchNumber + "]: " + (reason ?? "تعديل يدوي"));
                    cmd.Parameters.AddWithValue("@bnum", batch.BatchNumber);
                    cmd.Parameters.AddWithValue("@bid", batch.Id);
                    cmd.Parameters.AddWithValue("@now", now);
                    cmd.ExecuteNonQuery();
                }

                // 4. Record audit log
                _auditRepo.Log(activeConn, activeTrans, new AuditLog
                {
                    UserId = userId,
                    Action = "ADJUST_BATCH_STOCK",
                    EntityType = "BATCH",
                    EntityId = batch.Id,
                    DetailsJson = string.Format("{{\"productId\":\"{0}\",\"batchNumber\":\"{1}\",\"oldQty\":{2},\"newQty\":{3},\"delta\":{4},\"reason\":\"{5}\"}}",
                        batch.ProductId, batch.BatchNumber, oldQty, newQuantityMilli, delta, reason ?? "")
                });

                if (localTrans)
                {
                    activeTrans.Commit();
                }
            }
            catch
            {
                if (localTrans && activeTrans != null)
                {
                    activeTrans.Rollback();
                }
                throw;
            }
            finally
            {
                if (localTrans && activeConn != null)
                {
                    activeConn.Dispose();
                }
            }
        }

        public void DisposeExpiredBatch(string batchId, string reason, string userId)
        {
            if (string.IsNullOrEmpty(batchId)) throw new ArgumentNullException("batchId");

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        var batch = GetById(batchId, conn, trans);
                        if (batch == null)
                        {
                            throw new InvalidOperationException("الدفعة المطلوبة غير موجودة");
                        }

                        if (batch.QuantityMilli <= 0)
                        {
                            throw new InvalidOperationException("رصيد الدفعة منتهٍ بالفعل (0)");
                        }

                        long disposedQty = batch.QuantityMilli;
                        string now = DateTime.UtcNow.ToString("o");

                        // 1. Mark batch as EXPIRED with 0 quantity
                        string updateBatchSql = @"
                            UPDATE product_batches
                            SET quantity_milli = 0,
                                status = 'EXPIRED',
                                notes = COALESCE(notes || ' | ', '') || 'تم الإتلاف: ' || @reason,
                                updated_at = @now
                            WHERE id = @id;
                        ";
                        using (var cmd = new SQLiteCommand(updateBatchSql, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@reason", reason ?? "إتلاف منتهي الصلاحية");
                            cmd.Parameters.AddWithValue("@now", now);
                            cmd.Parameters.AddWithValue("@id", batchId);
                            cmd.ExecuteNonQuery();
                        }

                        // 2. Deduct disposed quantity from product stock
                        string updateProductSql = @"
                            UPDATE products
                            SET stock_quantity_milli = stock_quantity_milli - @qty,
                                updated_at = @now
                            WHERE id = @pid;
                        ";
                        using (var cmd = new SQLiteCommand(updateProductSql, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@qty", disposedQty);
                            cmd.Parameters.AddWithValue("@now", now);
                            cmd.Parameters.AddWithValue("@pid", batch.ProductId);
                            cmd.ExecuteNonQuery();
                        }

                        // 3. Record stock movement as DAMAGE/EXPIRED
                        string insertSmSql = @"
                            INSERT INTO stock_movements (
                                id, product_id, movement_type, quantity_milli, reference_id, reference_type,
                                unit_cost_piasters, note, batch_number, batch_id, created_at
                            ) VALUES (
                                @id, @pid, 'DAMAGE', @qty, @refId, 'EXPIRED_DISPOSAL',
                                @cost, @note, @bnum, @bid, @now
                            );
                        ";
                        using (var cmd = new SQLiteCommand(insertSmSql, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@id", Guid.NewGuid().ToString());
                            cmd.Parameters.AddWithValue("@pid", batch.ProductId);
                            cmd.Parameters.AddWithValue("@qty", -disposedQty);
                            cmd.Parameters.AddWithValue("@refId", batch.Id);
                            cmd.Parameters.AddWithValue("@cost", batch.CostPricePiasters);
                            cmd.Parameters.AddWithValue("@note", "إتلاف بضاعة منتهية الصلاحية للدفعة [" + batch.BatchNumber + "]: " + (reason ?? "تالف"));
                            cmd.Parameters.AddWithValue("@bnum", batch.BatchNumber);
                            cmd.Parameters.AddWithValue("@bid", batch.Id);
                            cmd.Parameters.AddWithValue("@now", now);
                            cmd.ExecuteNonQuery();
                        }

                        // 4. Audit Log
                        _auditRepo.Log(conn, trans, new AuditLog
                        {
                            UserId = userId,
                            Action = "DISPOSE_EXPIRED_BATCH",
                            EntityType = "BATCH",
                            EntityId = batch.Id,
                            DetailsJson = string.Format("{{\"productId\":\"{0}\",\"batchNumber\":\"{1}\",\"disposedQty\":{2},\"lossPiasters\":{3},\"reason\":\"{4}\"}}",
                                batch.ProductId, batch.BatchNumber, disposedQty, batch.TotalValuePiasters, reason ?? "")
                        });

                        trans.Commit();
                    }
                    catch
                    {
                        trans.Rollback();
                        throw;
                    }
                }
            }
        }

        private static ProductBatch MapBatch(SQLiteDataReader reader)
        {
            return new ProductBatch
            {
                Id = reader["id"].ToString(),
                ProductId = reader["product_id"].ToString(),
                ProductName = reader["product_name"] != DBNull.Value ? reader["product_name"].ToString() : null,
                ProductBarcode = reader["product_barcode"] != DBNull.Value ? reader["product_barcode"].ToString() : null,
                Unit = reader["unit"] != DBNull.Value ? reader["unit"].ToString() : null,
                BatchNumber = reader["batch_number"].ToString(),
                ExpiryDate = reader["expiry_date"] != DBNull.Value ? reader["expiry_date"].ToString() : null,
                ProductionDate = reader["production_date"] != DBNull.Value ? reader["production_date"].ToString() : null,
                QuantityMilli = Convert.ToInt64(reader["quantity_milli"]),
                CostPricePiasters = Convert.ToInt64(reader["cost_price_piasters"]),
                SupplierId = reader["supplier_id"] != DBNull.Value ? reader["supplier_id"].ToString() : null,
                SupplierName = reader["supplier_name"] != DBNull.Value ? reader["supplier_name"].ToString() : null,
                PurchaseId = reader["purchase_id"] != DBNull.Value ? reader["purchase_id"].ToString() : null,
                Status = reader["status"].ToString(),
                Notes = reader["notes"] != DBNull.Value ? reader["notes"].ToString() : null,
                CreatedAt = reader["created_at"].ToString(),
                UpdatedAt = reader["updated_at"].ToString()
            };
        }
    }
}
