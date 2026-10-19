using System;
using System.Collections.Generic;
using System.Data.SQLite;
using RafiqPOS.Models;

namespace RafiqPOS.Repositories
{
    public class ProductUnitRepository
    {
        private readonly string _connectionString;

        public ProductUnitRepository(string connectionString)
        {
            this._connectionString = connectionString;
        }

        public List<ProductUnit> GetByProductId(string productId)
        {
            var list = new List<ProductUnit>();
            if (string.IsNullOrWhiteSpace(productId)) return list;

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    SELECT pu.id, pu.product_id, pu.unit_name, pu.conversion_factor, pu.is_base_unit,
                           pu.sell_price_piasters, pu.cost_price_piasters, pu.barcode, pu.is_divisible,
                           pu.sort_order, pu.created_at, pu.updated_at,
                           (SELECT COUNT(*) FROM sale_items si WHERE si.unit_id = pu.id LIMIT 1) > 0 AS has_sales
                    FROM product_units pu
                    WHERE pu.product_id = @productId
                    ORDER BY pu.is_base_unit DESC, pu.sort_order ASC, pu.unit_name ASC;
                ";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@productId", productId.Trim());
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            list.Add(MapReader(reader));
                        }
                    }
                }
            }
            return list;
        }

        public ProductUnit GetById(string id)
        {
            if (string.IsNullOrWhiteSpace(id)) return null;

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    SELECT pu.id, pu.product_id, pu.unit_name, pu.conversion_factor, pu.is_base_unit,
                           pu.sell_price_piasters, pu.cost_price_piasters, pu.barcode, pu.is_divisible,
                           pu.sort_order, pu.created_at, pu.updated_at,
                           (SELECT COUNT(*) FROM sale_items si WHERE si.unit_id = pu.id LIMIT 1) > 0 AS has_sales
                    FROM product_units pu
                    WHERE pu.id = @id
                    LIMIT 1;
                ";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@id", id.Trim());
                    using (var reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            return MapReader(reader);
                        }
                    }
                }
            }
            return null;
        }

        public ProductUnit GetBaseUnit(string productId)
        {
            if (string.IsNullOrWhiteSpace(productId)) return null;

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    SELECT pu.id, pu.product_id, pu.unit_name, pu.conversion_factor, pu.is_base_unit,
                           pu.sell_price_piasters, pu.cost_price_piasters, pu.barcode, pu.is_divisible,
                           pu.sort_order, pu.created_at, pu.updated_at,
                           (SELECT COUNT(*) FROM sale_items si WHERE si.unit_id = pu.id LIMIT 1) > 0 AS has_sales
                    FROM product_units pu
                    WHERE pu.product_id = @productId AND pu.is_base_unit = 1
                    LIMIT 1;
                ";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@productId", productId.Trim());
                    using (var reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            return MapReader(reader);
                        }
                    }
                }
            }
            return null;
        }

        public ProductUnit GetByBarcode(string barcode)
        {
            if (string.IsNullOrWhiteSpace(barcode)) return null;

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    SELECT pu.id, pu.product_id, pu.unit_name, pu.conversion_factor, pu.is_base_unit,
                           pu.sell_price_piasters, pu.cost_price_piasters, pu.barcode, pu.is_divisible,
                           pu.sort_order, pu.created_at, pu.updated_at,
                           (SELECT COUNT(*) FROM sale_items si WHERE si.unit_id = pu.id LIMIT 1) > 0 AS has_sales
                    FROM product_units pu
                    WHERE pu.barcode = @barcode COLLATE NOCASE
                    LIMIT 1;
                ";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@barcode", barcode.Trim());
                    using (var reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            return MapReader(reader);
                        }
                    }
                }
            }
            return null;
        }

        public bool HasSales(string unitId)
        {
            if (string.IsNullOrWhiteSpace(unitId)) return false;

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = "SELECT COUNT(*) FROM sale_items WHERE unit_id = @unitId LIMIT 1;";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@unitId", unitId.Trim());
                    long count = Convert.ToInt64(cmd.ExecuteScalar());
                    return count > 0;
                }
            }
        }

        public int GetUnitCountForProduct(string productId)
        {
            if (string.IsNullOrWhiteSpace(productId)) return 0;

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = "SELECT COUNT(*) FROM product_units WHERE product_id = @productId;";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@productId", productId.Trim());
                    return Convert.ToInt32(cmd.ExecuteScalar());
                }
            }
        }

        public void Create(ProductUnit unit)
        {
            if (unit == null) throw new ArgumentNullException("unit");
            if (string.IsNullOrWhiteSpace(unit.ProductId)) throw new ArgumentException("معرف المنتج مطلوب لإنشاء الوحدة");
            if (string.IsNullOrWhiteSpace(unit.UnitName)) throw new ArgumentException("اسم الوحدة مطلوب");
            if (unit.IsBaseUnit) unit.ConversionFactor = 1;
            else if (unit.ConversionFactor <= 0) throw new ArgumentException("معامل التحويل للوحدة يجب أن يكون أكبر من الصفر");
            if (unit.SellPricePiasters < 0) throw new ArgumentException("سعر بيع الوحدة لا يمكن أن يكون سالباً");
            if (unit.CostPricePiasters < 0) throw new ArgumentException("سعر شراء/تكلفة الوحدة لا يمكن أن يكون سالباً");

            if (string.IsNullOrWhiteSpace(unit.Id)) unit.Id = Guid.NewGuid().ToString("N");
            if (string.IsNullOrWhiteSpace(unit.CreatedAt)) unit.CreatedAt = DateTime.UtcNow.ToString("o");
            unit.UpdatedAt = DateTime.UtcNow.ToString("o");

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        // If marked as base unit, unmark other units of the product
                        if (unit.IsBaseUnit)
                        {
                            string unmarkSql = "UPDATE product_units SET is_base_unit = 0 WHERE product_id = @productId;";
                            using (var unmarkCmd = new SQLiteCommand(unmarkSql, conn, trans))
                            {
                                unmarkCmd.Parameters.AddWithValue("@productId", unit.ProductId);
                                unmarkCmd.ExecuteNonQuery();
                            }
                        }

                        string sql = @"
                            INSERT INTO product_units (
                                id, product_id, unit_name, conversion_factor, is_base_unit,
                                sell_price_piasters, cost_price_piasters, barcode, is_divisible,
                                sort_order, created_at, updated_at
                            ) VALUES (
                                @id, @productId, @unitName, @conversionFactor, @isBaseUnit,
                                @sellPrice, @costPrice, @barcode, @isDivisible,
                                @sortOrder, @createdAt, @updatedAt
                            );
                        ";
                        using (var cmd = new SQLiteCommand(sql, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@id", unit.Id);
                            cmd.Parameters.AddWithValue("@productId", unit.ProductId);
                            cmd.Parameters.AddWithValue("@unitName", unit.UnitName.Trim());
                            cmd.Parameters.AddWithValue("@conversionFactor", unit.ConversionFactor);
                            cmd.Parameters.AddWithValue("@isBaseUnit", unit.IsBaseUnit ? 1 : 0);
                            cmd.Parameters.AddWithValue("@sellPrice", unit.SellPricePiasters);
                            cmd.Parameters.AddWithValue("@costPrice", unit.CostPricePiasters);
                            cmd.Parameters.AddWithValue("@barcode", string.IsNullOrWhiteSpace(unit.Barcode) ? (object)DBNull.Value : unit.Barcode.Trim());
                            cmd.Parameters.AddWithValue("@isDivisible", unit.IsDivisible ? 1 : 0);
                            cmd.Parameters.AddWithValue("@sortOrder", unit.SortOrder);
                            cmd.Parameters.AddWithValue("@createdAt", unit.CreatedAt);
                            cmd.Parameters.AddWithValue("@updatedAt", unit.UpdatedAt);
                            cmd.ExecuteNonQuery();
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
        }

        public void Update(ProductUnit unit)
        {
            if (unit == null) throw new ArgumentNullException("unit");
            if (string.IsNullOrWhiteSpace(unit.UnitName)) throw new ArgumentException("اسم الوحدة مطلوب");
            if (!unit.IsBaseUnit && unit.ConversionFactor <= 0) throw new ArgumentException("معامل التحويل للوحدة يجب أن يكون أكبر من الصفر");
            if (unit.SellPricePiasters < 0) throw new ArgumentException("سعر بيع الوحدة لا يمكن أن يكون سالباً");
            if (unit.CostPricePiasters < 0) throw new ArgumentException("سعر شراء/تكلفة الوحدة لا يمكن أن يكون سالباً");

            unit.UpdatedAt = DateTime.UtcNow.ToString("o");

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        bool isCurrentlyBase = false;
                        int oldConversionFactor = 1;
                        string oldUnitName = unit.UnitName;
                        using (var checkCmd = new SQLiteCommand("SELECT is_base_unit, conversion_factor, unit_name FROM product_units WHERE id = @id LIMIT 1;", conn, trans))
                        {
                            checkCmd.Parameters.AddWithValue("@id", unit.Id);
                            using (var r = checkCmd.ExecuteReader())
                            {
                                if (r.Read())
                                {
                                    if (r["is_base_unit"] != DBNull.Value) isCurrentlyBase = (Convert.ToInt32(r["is_base_unit"]) == 1);
                                    if (r["conversion_factor"] != DBNull.Value) oldConversionFactor = Convert.ToInt32(r["conversion_factor"]);
                                    if (r["unit_name"] != DBNull.Value) oldUnitName = r["unit_name"].ToString();
                                }
                            }
                        }
                        bool isBase = unit.IsBaseUnit || isCurrentlyBase;
                        int targetFactor = isBase ? 1 : unit.ConversionFactor;

                        if (oldConversionFactor != targetFactor)
                        {
                            using (var saleCheckCmd = new SQLiteCommand("SELECT COUNT(*) FROM sale_items WHERE unit_id = @uId LIMIT 1;", conn, trans))
                            {
                                saleCheckCmd.Parameters.AddWithValue("@uId", unit.Id);
                                long sCount = Convert.ToInt64(saleCheckCmd.ExecuteScalar());
                                if (sCount > 0)
                                {
                                    throw new InvalidOperationException(string.Format("لا يمكن تعديل معامل التحويل للوحدة ({0}) من {1} إلى {2} لوجود مبيعات وفواتير مسجلة بها سابقاً لضمان سلامة السجل التاريخي وتقارير الجرد.", oldUnitName, oldConversionFactor, targetFactor));
                                }
                            }
                        }

                        if (isBase)
                        {
                            string unmarkSql = "UPDATE product_units SET is_base_unit = 0 WHERE product_id = @productId AND id != @id;";
                            using (var unmarkCmd = new SQLiteCommand(unmarkSql, conn, trans))
                            {
                                unmarkCmd.Parameters.AddWithValue("@productId", unit.ProductId);
                                unmarkCmd.Parameters.AddWithValue("@id", unit.Id);
                                unmarkCmd.ExecuteNonQuery();
                            }
                        }

                        string sql = @"
                            UPDATE product_units SET
                                unit_name = @unitName,
                                conversion_factor = @conversionFactor,
                                is_base_unit = @isBaseUnit,
                                sell_price_piasters = @sellPrice,
                                cost_price_piasters = @costPrice,
                                barcode = @barcode,
                                is_divisible = @isDivisible,
                                sort_order = @sortOrder,
                                updated_at = @updatedAt
                            WHERE id = @id;
                        ";
                        using (var cmd = new SQLiteCommand(sql, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@id", unit.Id);
                            cmd.Parameters.AddWithValue("@unitName", unit.UnitName.Trim());
                            cmd.Parameters.AddWithValue("@conversionFactor", isBase ? 1 : unit.ConversionFactor);
                            cmd.Parameters.AddWithValue("@isBaseUnit", isBase ? 1 : 0);
                            cmd.Parameters.AddWithValue("@sellPrice", unit.SellPricePiasters);
                            cmd.Parameters.AddWithValue("@costPrice", unit.CostPricePiasters);
                            cmd.Parameters.AddWithValue("@barcode", string.IsNullOrWhiteSpace(unit.Barcode) ? (object)DBNull.Value : unit.Barcode.Trim());
                            cmd.Parameters.AddWithValue("@isDivisible", unit.IsDivisible ? 1 : 0);
                            cmd.Parameters.AddWithValue("@sortOrder", unit.SortOrder);
                            cmd.Parameters.AddWithValue("@updatedAt", unit.UpdatedAt);
                            cmd.ExecuteNonQuery();
                        }

                        if (isBase)
                        {
                            string syncProdSql = @"
                                UPDATE products
                                SET unit = @unitName,
                                    price_piasters = @sellPrice,
                                    cost_piasters = @costPrice,
                                    updated_at = @updatedAt
                                WHERE id = @productId;
                            ";
                            using (var syncCmd = new SQLiteCommand(syncProdSql, conn, trans))
                            {
                                syncCmd.Parameters.AddWithValue("@unitName", unit.UnitName.Trim());
                                syncCmd.Parameters.AddWithValue("@sellPrice", unit.SellPricePiasters);
                                syncCmd.Parameters.AddWithValue("@costPrice", unit.CostPricePiasters);
                                syncCmd.Parameters.AddWithValue("@updatedAt", unit.UpdatedAt);
                                syncCmd.Parameters.AddWithValue("@productId", unit.ProductId);
                                syncCmd.ExecuteNonQuery();
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
        }

        public void Delete(string id)
        {
            if (string.IsNullOrWhiteSpace(id)) return;

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var chkCmd = new SQLiteCommand("SELECT is_base_unit FROM product_units WHERE id = @id LIMIT 1;", conn))
                {
                    chkCmd.Parameters.AddWithValue("@id", id.Trim());
                    object o = chkCmd.ExecuteScalar();
                    if (o != null && o != DBNull.Value && Convert.ToInt32(o) == 1)
                    {
                        throw new InvalidOperationException("لا يمكن حذف الوحدة الأساسية للمنتج. يرجى تعيين وحدة أساسية أخرى أولاً.");
                    }
                }

                if (HasSales(id))
                {
                    throw new InvalidOperationException("لا يمكن حذف هذه الوحدة لوجود مبيعات مسجلة مرتبطة بها.");
                }

                string sql = "DELETE FROM product_units WHERE id = @id;";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@id", id.Trim());
                    cmd.ExecuteNonQuery();
                }
            }
        }

        public void SetBaseUnit(string productId, string unitId)
        {
            if (string.IsNullOrWhiteSpace(productId) || string.IsNullOrWhiteSpace(unitId)) return;

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        string now = DateTime.UtcNow.ToString("o");
                        string resetSql = "UPDATE product_units SET is_base_unit = 0 WHERE product_id = @productId;";
                        using (var cmd = new SQLiteCommand(resetSql, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@productId", productId.Trim());
                            cmd.ExecuteNonQuery();
                        }

                        string setSql = "UPDATE product_units SET is_base_unit = 1, conversion_factor = 1, updated_at = @now WHERE id = @unitId AND product_id = @productId;";
                        using (var cmd = new SQLiteCommand(setSql, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@unitId", unitId.Trim());
                            cmd.Parameters.AddWithValue("@productId", productId.Trim());
                            cmd.Parameters.AddWithValue("@now", now);
                            cmd.ExecuteNonQuery();
                        }

                        // Synchronize products table with new base unit attributes
                        string syncProductSql = @"
                            UPDATE products
                            SET unit = (SELECT unit_name FROM product_units WHERE id = @unitId),
                                price_piasters = (SELECT sell_price_piasters FROM product_units WHERE id = @unitId),
                                cost_piasters = (SELECT cost_price_piasters FROM product_units WHERE id = @unitId),
                                updated_at = @now
                            WHERE id = @productId;
                        ";
                        using (var syncCmd = new SQLiteCommand(syncProductSql, conn, trans))
                        {
                            syncCmd.Parameters.AddWithValue("@unitId", unitId.Trim());
                            syncCmd.Parameters.AddWithValue("@productId", productId.Trim());
                            syncCmd.Parameters.AddWithValue("@now", now);
                            syncCmd.ExecuteNonQuery();
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
        }

        private static ProductUnit MapReader(SQLiteDataReader reader)
        {
            bool hasSales = false;
            try
            {
                int colIdx = reader.GetOrdinal("has_sales");
                if (colIdx >= 0 && reader[colIdx] != DBNull.Value)
                {
                    hasSales = Convert.ToInt32(reader[colIdx]) == 1;
                }
            }
            catch { }

            return new ProductUnit
            {
                Id = reader["id"].ToString(),
                ProductId = reader["product_id"].ToString(),
                UnitName = reader["unit_name"].ToString(),
                ConversionFactor = Convert.ToInt32(reader["conversion_factor"]),
                IsBaseUnit = Convert.ToInt32(reader["is_base_unit"]) == 1,
                SellPricePiasters = Convert.ToInt64(reader["sell_price_piasters"]),
                CostPricePiasters = Convert.ToInt64(reader["cost_price_piasters"]),
                Barcode = reader["barcode"] == DBNull.Value ? null : reader["barcode"].ToString(),
                IsDivisible = Convert.ToInt32(reader["is_divisible"]) == 1,
                SortOrder = Convert.ToInt32(reader["sort_order"]),
                HasSales = hasSales,
                CreatedAt = reader["created_at"].ToString(),
                UpdatedAt = reader["updated_at"].ToString()
            };
        }
    }
}
