using System;
using System.Collections.Generic;
using System.Data.SQLite;
using RafiqPOS.Models;

namespace RafiqPOS.Repositories
{
    public class StockMovementRepository
    {
        private readonly string _connectionString;

        public StockMovementRepository(string connectionString)
        {
            _connectionString = connectionString;
        }

        public void Add(StockMovement movement, SQLiteConnection conn = null, SQLiteTransaction trans = null)
        {
            if (movement == null) throw new ArgumentNullException("movement");

            if (conn != null && trans != null)
            {
                InsertInternal(conn, trans, movement);
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
                            InsertInternal(localConn, localTrans, movement);
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
        }

        private static void InsertInternal(SQLiteConnection conn, SQLiteTransaction trans, StockMovement m)
        {
            string sql = @"
                INSERT INTO stock_movements (
                    id, product_id, movement_type, quantity_milli, reference_id, reference_type,
                    unit_cost_piasters, note, batch_number, created_at
                ) VALUES (
                    @id, @productId, @movementType, @quantityMilli, @referenceId, @referenceType,
                    @unitCost, @note, @batchNumber, @createdAt
                );
            ";

            using (var cmd = new SQLiteCommand(sql, conn, trans))
            {
                cmd.Parameters.AddWithValue("@id", string.IsNullOrEmpty(m.Id) ? Guid.NewGuid().ToString() : m.Id);
                cmd.Parameters.AddWithValue("@productId", m.ProductId);
                cmd.Parameters.AddWithValue("@movementType", m.MovementType);
                cmd.Parameters.AddWithValue("@quantityMilli", m.QuantityMilli);
                cmd.Parameters.AddWithValue("@referenceId", (object)m.ReferenceId ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@referenceType", (object)m.ReferenceType ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@unitCost", m.UnitCostPiasters);
                cmd.Parameters.AddWithValue("@note", (object)m.Note ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@batchNumber", (object)m.BatchNumber ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@createdAt", string.IsNullOrEmpty(m.CreatedAt) ? DateTime.UtcNow.ToString("o") : m.CreatedAt);
                cmd.ExecuteNonQuery();
            }
        }

        public List<StockMovement> GetMovements(string productId = null, string movementType = null, string fromDate = null, string toDate = null, int limit = 200)
        {
            var list = new List<StockMovement>();

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();

                var clauses = new List<string>();
                var parameters = new List<SQLiteParameter>();

                if (!string.IsNullOrWhiteSpace(productId))
                {
                    clauses.Add("sm.product_id = @productId");
                    parameters.Add(new SQLiteParameter("@productId", productId.Trim()));
                }

                if (!string.IsNullOrWhiteSpace(movementType) && movementType != "ALL")
                {
                    clauses.Add("sm.movement_type = @movementType");
                    parameters.Add(new SQLiteParameter("@movementType", movementType.Trim()));
                }

                if (!string.IsNullOrWhiteSpace(fromDate))
                {
                    clauses.Add("sm.created_at >= @fromDate");
                    parameters.Add(new SQLiteParameter("@fromDate", fromDate.Trim()));
                }

                if (!string.IsNullOrWhiteSpace(toDate))
                {
                    clauses.Add("sm.created_at <= @toDate");
                    parameters.Add(new SQLiteParameter("@toDate", toDate.Trim()));
                }

                string whereClause = clauses.Count > 0 ? "WHERE " + string.Join(" AND ", clauses.ToArray()) : "";

                string sql = string.Format(@"
                    SELECT sm.*, p.name AS product_name, p.barcode AS product_barcode, p.unit AS product_unit
                    FROM stock_movements sm
                    INNER JOIN products p ON sm.product_id = p.id
                    {0}
                    ORDER BY sm.created_at DESC
                    LIMIT {1};
                ", whereClause, limit > 0 ? limit : 200);

                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    foreach (var p in parameters)
                    {
                        cmd.Parameters.Add(p);
                    }

                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            list.Add(MapReaderToStockMovement(reader));
                        }
                    }
                }
            }

            return list;
        }

        public long GetTotalCalculatedStock(string productId, SQLiteConnection conn = null, SQLiteTransaction trans = null)
        {
            if (string.IsNullOrWhiteSpace(productId)) return 0;

            if (conn != null)
            {
                return GetTotalStockInternal(conn, trans, productId);
            }

            using (var localConn = new SQLiteConnection(_connectionString))
            {
                localConn.Open();
                return GetTotalStockInternal(localConn, null, productId);
            }
        }

        private static long GetTotalStockInternal(SQLiteConnection conn, SQLiteTransaction trans, string productId)
        {
            string sql = "SELECT COALESCE(SUM(quantity_milli), 0) FROM stock_movements WHERE product_id = @pid;";
            using (var cmd = new SQLiteCommand(sql, conn, trans))
            {
                cmd.Parameters.AddWithValue("@pid", productId);
                object res = cmd.ExecuteScalar();
                if (res != null && res != DBNull.Value)
                {
                    return Convert.ToInt64(res);
                }
            }
            return 0;
        }

        public List<StockDiscrepancy> CheckDiscrepancies(SQLiteConnection conn = null, SQLiteTransaction trans = null)
        {
            var list = new List<StockDiscrepancy>();

            if (conn != null)
            {
                return CheckDiscrepanciesInternal(conn, trans);
            }

            using (var localConn = new SQLiteConnection(_connectionString))
            {
                localConn.Open();
                return CheckDiscrepanciesInternal(localConn, null);
            }
        }

        private static List<StockDiscrepancy> CheckDiscrepanciesInternal(SQLiteConnection conn, SQLiteTransaction trans)
        {
            var list = new List<StockDiscrepancy>();
            string sql = @"
                SELECT 
                    p.id, 
                    p.name, 
                    p.barcode, 
                    p.unit, 
                    p.stock_quantity_milli AS cached_stock,
                    COALESCE(SUM(sm.quantity_milli), 0) AS calculated_stock,
                    (p.stock_quantity_milli - COALESCE(SUM(sm.quantity_milli), 0)) AS diff
                FROM products p
                LEFT JOIN stock_movements sm ON p.id = sm.product_id
                GROUP BY p.id
                HAVING diff != 0;
            ";

            using (var cmd = new SQLiteCommand(sql, conn, trans))
            using (var reader = cmd.ExecuteReader())
            {
                while (reader.Read())
                {
                    var d = new StockDiscrepancy
                    {
                        ProductId = reader["id"].ToString(),
                        ProductName = reader["name"] != DBNull.Value ? reader["name"].ToString() : "",
                        ProductBarcode = reader["barcode"] != DBNull.Value ? reader["barcode"].ToString() : "",
                        Unit = reader["unit"] != DBNull.Value ? reader["unit"].ToString() : "piece",
                        CachedStockMilli = Convert.ToInt64(reader["cached_stock"]),
                        CalculatedStockMilli = Convert.ToInt64(reader["calculated_stock"]),
                        DifferenceMilli = Convert.ToInt64(reader["diff"])
                    };
                    list.Add(d);
                }
            }

            return list;
        }

        public int RecalculateStockFromMovements(string productId = null, SQLiteConnection conn = null, SQLiteTransaction trans = null)
        {
            if (conn != null && trans != null)
            {
                return RecalculateInternal(conn, trans, productId);
            }

            using (var localConn = new SQLiteConnection(_connectionString))
            {
                localConn.Open();
                using (var localTrans = localConn.BeginTransaction())
                {
                    try
                    {
                        int rows = RecalculateInternal(localConn, localTrans, productId);
                        localTrans.Commit();
                        return rows;
                    }
                    catch
                    {
                        localTrans.Rollback();
                        throw;
                    }
                }
            }
        }

        private static int RecalculateInternal(SQLiteConnection conn, SQLiteTransaction trans, string productId)
        {
            string sql;
            if (!string.IsNullOrWhiteSpace(productId))
            {
                sql = @"
                    UPDATE products
                    SET stock_quantity_milli = COALESCE((
                        SELECT SUM(quantity_milli)
                        FROM stock_movements
                        WHERE product_id = @pid
                    ), 0),
                    updated_at = datetime('now')
                    WHERE id = @pid;
                ";
                using (var cmd = new SQLiteCommand(sql, conn, trans))
                {
                    cmd.Parameters.AddWithValue("@pid", productId.Trim());
                    return cmd.ExecuteNonQuery();
                }
            }
            else
            {
                sql = @"
                    UPDATE products
                    SET stock_quantity_milli = COALESCE((
                        SELECT SUM(quantity_milli)
                        FROM stock_movements
                        WHERE product_id = products.id
                    ), 0),
                    updated_at = datetime('now');
                ";
                using (var cmd = new SQLiteCommand(sql, conn, trans))
                {
                    return cmd.ExecuteNonQuery();
                }
            }
        }

        private static StockMovement MapReaderToStockMovement(SQLiteDataReader reader)
        {
            return new StockMovement
            {
                Id = reader["id"].ToString(),
                ProductId = reader["product_id"].ToString(),
                ProductName = reader["product_name"] != DBNull.Value ? reader["product_name"].ToString() : "",
                ProductBarcode = reader["product_barcode"] != DBNull.Value ? reader["product_barcode"].ToString() : "",
                Unit = reader["product_unit"] != DBNull.Value ? reader["product_unit"].ToString() : "piece",
                MovementType = reader["movement_type"].ToString(),
                QuantityMilli = Convert.ToInt64(reader["quantity_milli"]),
                ReferenceId = reader["reference_id"] != DBNull.Value ? reader["reference_id"].ToString() : null,
                ReferenceType = reader["reference_type"] != DBNull.Value ? reader["reference_type"].ToString() : null,
                UnitCostPiasters = Convert.ToInt64(reader["unit_cost_piasters"]),
                Note = reader["note"] != DBNull.Value ? reader["note"].ToString() : null,
                BatchNumber = reader["batch_number"] != DBNull.Value ? reader["batch_number"].ToString() : null,
                CreatedAt = reader["created_at"].ToString()
            };
        }
    }
}
