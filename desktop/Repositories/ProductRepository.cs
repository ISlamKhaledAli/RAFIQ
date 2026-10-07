using System;
using System.Collections.Generic;
using System.Data.SQLite;
using RafiqPOS.Common;
using RafiqPOS.Models;

namespace RafiqPOS.Repositories
{
    public partial class ProductRepository
    {
        private readonly string _connectionString;
        private readonly AuditLogRepository _auditRepo;
        private readonly CounterRepository _counters;

        public ProductRepository(string connectionString, AuditLogRepository auditRepo = null, CounterRepository counters = null)
        {
            _connectionString = connectionString;
            _auditRepo = auditRepo ?? new AuditLogRepository(connectionString);
            _counters = counters ?? new CounterRepository(connectionString);
        }

        public Product GetById(string id)
        {
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    SELECT p.*, COALESCE(c.name, 'عام') AS category_name 
                    FROM products p 
                    LEFT JOIN categories c ON p.category_id = c.id 
                    WHERE p.id = @id LIMIT 1;
                ";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@id", id);
                    using (var reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            var prod = MapReaderToProduct(reader);
                            prod.Barcodes = GetBarcodesForProductInternal(conn, prod.Id);
                            prod.Units = GetUnitsForProductInternal(conn, prod.Id);
                            return prod;
                        }
                    }
                }
            }
            return null;
        }

        public Product GetByBarcode(string barcode)
        {
            if (string.IsNullOrWhiteSpace(barcode)) return null;

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    SELECT DISTINCT p.*, COALESCE(c.name, 'عام') AS category_name FROM products p
                    LEFT JOIN categories c ON p.category_id = c.id
                    LEFT JOIN product_barcodes pb ON p.id = pb.product_id
                    LEFT JOIN product_units pu ON p.id = pu.product_id
                    WHERE p.is_active = 1 AND (p.barcode = @barcode OR pb.barcode = @barcode OR pu.barcode = @barcode)
                    LIMIT 1;
                ";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@barcode", barcode.Trim());
                    using (var reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            var prod = MapReaderToProduct(reader);
                            prod.Barcodes = GetBarcodesForProductInternal(conn, prod.Id);
                            prod.Units = GetUnitsForProductInternal(conn, prod.Id);
                            return prod;
                        }
                    }
                }
            }
            return null;
        }

        public Product GetOwnerOfBarcode(string barcode)
        {
            if (string.IsNullOrWhiteSpace(barcode)) return null;

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    SELECT DISTINCT p.*, COALESCE(c.name, 'عام') AS category_name FROM products p
                    LEFT JOIN categories c ON p.category_id = c.id
                    LEFT JOIN product_barcodes pb ON p.id = pb.product_id
                    LEFT JOIN product_units pu ON p.id = pu.product_id
                    WHERE p.barcode = @barcode OR pb.barcode = @barcode OR pu.barcode = @barcode
                    LIMIT 1;
                ";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@barcode", barcode.Trim());
                    using (var reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            var prod = MapReaderToProduct(reader);
                            prod.Barcodes = GetBarcodesForProductInternal(conn, prod.Id);
                            prod.Units = GetUnitsForProductInternal(conn, prod.Id);
                            return prod;
                        }
                    }
                }
            }
            return null;
        }

        private static List<string> GetBarcodesForProductInternal(SQLiteConnection conn, string productId, SQLiteTransaction trans = null)
        {
            var list = new List<string>();
            try
            {
                string sql = "SELECT barcode FROM product_barcodes WHERE product_id = @pid ORDER BY created_at ASC;";
                using (var cmd = new SQLiteCommand(sql, conn, trans))
                {
                    cmd.Parameters.AddWithValue("@pid", productId);
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            list.Add(reader["barcode"].ToString());
                        }
                    }
                }
            }
            catch { }
            return list;
        }

        private static List<ProductUnit> GetUnitsForProductInternal(SQLiteConnection conn, string productId, SQLiteTransaction trans = null)
        {
            var list = new List<ProductUnit>();
            try
            {
                string sql = @"
                    SELECT id, product_id, unit_name, conversion_factor, is_base_unit,
                           sell_price_piasters, cost_price_piasters, barcode, is_divisible,
                           sort_order, created_at, updated_at
                    FROM product_units
                    WHERE product_id = @pid
                    ORDER BY is_base_unit DESC, sort_order ASC, unit_name ASC;
                ";
                using (var cmd = new SQLiteCommand(sql, conn, trans))
                {
                    cmd.Parameters.AddWithValue("@pid", productId);
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            list.Add(new ProductUnit
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
                                CreatedAt = reader["created_at"].ToString(),
                                UpdatedAt = reader["updated_at"].ToString()
                            });
                        }
                    }
                }
            }
            catch { }
            return list;
        }

        public List<Product> Search(string query, int limit = 50, int offset = 0, string stockStatus = "all", string categoryId = "all")
        {
            var results = new List<Product>();
            if (string.IsNullOrWhiteSpace(query))
            {
                return GetAll(limit, offset, stockStatus, categoryId);
            }

            string cleanQuery = query.Trim();
            string normalizedQuery = Common.ArabicTextNormalizer.Normalize(cleanQuery);

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string filterSql = "";
                if (string.Equals(stockStatus, "lowStock", StringComparison.OrdinalIgnoreCase))
                {
                    filterSql = " AND p.stock_quantity_milli <= p.min_stock_quantity_milli";
                }
                else if (string.Equals(stockStatus, "outOfStock", StringComparison.OrdinalIgnoreCase))
                {
                    filterSql = " AND p.stock_quantity_milli <= 0";
                }

                if (!string.IsNullOrEmpty(categoryId) && !string.Equals(categoryId, "all", StringComparison.OrdinalIgnoreCase))
                {
                    filterSql += " AND (p.category_id = @categoryId OR (p.category_id IS NULL AND @categoryId = 'cat_general'))";
                }

                string sql = @"
                    SELECT DISTINCT p.*, COALESCE(c.name, 'عام') AS category_name FROM products p
                    LEFT JOIN categories c ON p.category_id = c.id
                    LEFT JOIN product_barcodes pb ON p.id = pb.product_id
                    LEFT JOIN product_units pu ON p.id = pu.product_id
                    WHERE p.is_active = 1 " + filterSql + @"
                      AND (
                           p.barcode = @exact 
                        OR pb.barcode = @exact 
                        OR p.internal_code = @exact 
                        OR p.normalized_name = @normExactText
                        OR p.normalized_name LIKE @normPrefix
                        OR p.normalized_name LIKE @normLike
                        OR p.name LIKE @like
                      )
                    ORDER BY 
                      CASE 
                        WHEN p.barcode = @exact OR pb.barcode = @exact OR p.internal_code = @exact THEN 1
                        WHEN p.normalized_name = @normExactText THEN 2
                        WHEN p.normalized_name LIKE @normPrefix THEN 3
                        WHEN p.normalized_name LIKE @normLike THEN 4
                        ELSE 5
                      END,
                      p.name ASC 
                    LIMIT @limit OFFSET @offset;
                ";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@exact", cleanQuery);
                    cmd.Parameters.AddWithValue("@normExactText", normalizedQuery);
                    cmd.Parameters.AddWithValue("@normPrefix", normalizedQuery + "%");
                    cmd.Parameters.AddWithValue("@normLike", "%" + normalizedQuery + "%");
                    cmd.Parameters.AddWithValue("@like", "%" + cleanQuery + "%");
                    cmd.Parameters.AddWithValue("@categoryId", categoryId);
                    cmd.Parameters.AddWithValue("@limit", limit);
                    cmd.Parameters.AddWithValue("@offset", offset);
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            results.Add(MapReaderToProduct(reader));
                        }
                    }
                }

                // Populate barcodes and units for each result
                foreach (var prod in results)
                {
                    prod.Barcodes = GetBarcodesForProductInternal(conn, prod.Id);
                    prod.Units = GetUnitsForProductInternal(conn, prod.Id);
                }
            }
            return results;
        }

        public List<Product> GetAll(int limit = 100, int offset = 0, string stockStatus = "all", string categoryId = "all")
        {
            var results = new List<Product>();
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string filterSql = "";
                if (string.Equals(stockStatus, "lowStock", StringComparison.OrdinalIgnoreCase))
                {
                    filterSql = " AND p.stock_quantity_milli <= p.min_stock_quantity_milli";
                }
                else if (string.Equals(stockStatus, "outOfStock", StringComparison.OrdinalIgnoreCase))
                {
                    filterSql = " AND p.stock_quantity_milli <= 0";
                }

                if (!string.IsNullOrEmpty(categoryId) && !string.Equals(categoryId, "all", StringComparison.OrdinalIgnoreCase))
                {
                    filterSql += " AND (p.category_id = @categoryId OR (p.category_id IS NULL AND @categoryId = 'cat_general'))";
                }

                string sql = @"
                    SELECT p.*, COALESCE(c.name, 'عام') AS category_name,
                        CASE 
                            WHEN p.has_variants = 1 THEN 1
                            WHEN EXISTS(SELECT 1 FROM product_variants pv WHERE pv.parent_product_id = p.id) THEN 1
                            ELSE 0 
                        END AS has_variants_computed,
                        (SELECT COUNT(*) FROM product_variants pv WHERE pv.parent_product_id = p.id) AS variants_count,
                        (SELECT MIN(pb.expiry_date) FROM product_batches pb WHERE pb.product_id = p.id AND pb.quantity_milli > 0 AND pb.status = 'ACTIVE' AND pb.expiry_date IS NOT NULL AND pb.expiry_date != '') AS nearest_expiry_date,
                        CASE WHEN EXISTS(SELECT 1 FROM product_batches pb WHERE pb.product_id = p.id AND pb.quantity_milli > 0 AND pb.status = 'ACTIVE' AND pb.expiry_date < date('now')) THEN 1 ELSE 0 END AS is_expired,
                        CASE WHEN EXISTS(SELECT 1 FROM product_batches pb WHERE pb.product_id = p.id) THEN 1 ELSE 0 END AS has_batches
                    FROM products p
                    LEFT JOIN categories c ON p.category_id = c.id
                    WHERE p.is_active = 1" + filterSql + @"
                    ORDER BY p.created_at DESC
                    LIMIT @limit OFFSET @offset;
                ";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@categoryId", categoryId);
                    cmd.Parameters.AddWithValue("@limit", limit);
                    cmd.Parameters.AddWithValue("@offset", offset);
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            results.Add(MapReaderToProduct(reader));
                        }
                    }
                }

                foreach (var prod in results)
                {
                    prod.Barcodes = GetBarcodesForProductInternal(conn, prod.Id);
                    prod.Units = GetUnitsForProductInternal(conn, prod.Id);
                }
            }
            return results;
        }

        /// <summary>
        /// Task 36-1: استعلام الأصناف التي كميتها أقل من أو تساوي حد الطلب
        /// </summary>
        public List<Product> GetLowStock(int limit = 100)
        {
            var results = new List<Product>();
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    SELECT p.*, COALESCE(c.name, 'عام') AS category_name
                    FROM products p
                    LEFT JOIN categories c ON p.category_id = c.id
                    WHERE p.is_active = 1 AND p.stock_quantity_milli <= p.min_stock_quantity_milli 
                    ORDER BY p.stock_quantity_milli ASC, (p.min_stock_quantity_milli - p.stock_quantity_milli) DESC 
                    LIMIT @limit;
                ";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@limit", limit);
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            results.Add(MapReaderToProduct(reader));
                        }
                    }
                }

                foreach (var prod in results)
                {
                    prod.Barcodes = GetBarcodesForProductInternal(conn, prod.Id);
                    prod.Units = GetUnitsForProductInternal(conn, prod.Id);
                }
            }
            return results;
        }

        public int GetLowStockCount()
        {
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = "SELECT COUNT(1) FROM products WHERE is_active = 1 AND stock_quantity_milli <= min_stock_quantity_milli;";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    object scalar = cmd.ExecuteScalar();
                    if (scalar != null && scalar != DBNull.Value)
                    {
                        return Convert.ToInt32(scalar);
                    }
                }
            }
            return 0;
        }

        public int GetOutOfStockCount()
        {
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = "SELECT COUNT(1) FROM products WHERE is_active = 1 AND stock_quantity_milli <= 0;";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    object scalar = cmd.ExecuteScalar();
                    if (scalar != null && scalar != DBNull.Value)
                    {
                        return Convert.ToInt32(scalar);
                    }
                }
            }
            return 0;
        }

        /// <summary>
        /// Returns total count of active products for pagination display.
        /// </summary>
        public int GetTotalActiveCount(string stockStatus = "all", string categoryId = "all")
        {
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string filterSql = "";
                if (string.Equals(stockStatus, "lowStock", StringComparison.OrdinalIgnoreCase))
                {
                    filterSql = " AND stock_quantity_milli <= min_stock_quantity_milli";
                }
                else if (string.Equals(stockStatus, "outOfStock", StringComparison.OrdinalIgnoreCase))
                {
                    filterSql = " AND stock_quantity_milli <= 0";
                }

                if (!string.IsNullOrEmpty(categoryId) && !string.Equals(categoryId, "all", StringComparison.OrdinalIgnoreCase))
                {
                    filterSql += " AND (category_id = @categoryId OR (category_id IS NULL AND @categoryId = 'cat_general'))";
                }

                string sql = "SELECT COUNT(1) FROM products WHERE is_active = 1" + filterSql + ";";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@categoryId", categoryId);
                    object scalar = cmd.ExecuteScalar();
                    if (scalar != null && scalar != DBNull.Value)
                    {
                        return Convert.ToInt32(scalar);
                    }
                }
            }
            return 0;
        }

        /// <summary>
        /// Returns total count of active products matching a search query (for pagination).
        /// </summary>
        public int GetSearchCount(string query, string stockStatus = "all", string categoryId = "all")
        {
            if (string.IsNullOrWhiteSpace(query))
            {
                return GetTotalActiveCount(stockStatus, categoryId);
            }

            string cleanQuery = query.Trim();
            string normalizedQuery = Common.ArabicTextNormalizer.Normalize(cleanQuery);

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string filterSql = "";
                if (string.Equals(stockStatus, "lowStock", StringComparison.OrdinalIgnoreCase))
                {
                    filterSql = " AND p.stock_quantity_milli <= p.min_stock_quantity_milli";
                }
                else if (string.Equals(stockStatus, "outOfStock", StringComparison.OrdinalIgnoreCase))
                {
                    filterSql = " AND p.stock_quantity_milli <= 0";
                }

                if (!string.IsNullOrEmpty(categoryId) && !string.Equals(categoryId, "all", StringComparison.OrdinalIgnoreCase))
                {
                    filterSql += " AND (p.category_id = @categoryId OR (p.category_id IS NULL AND @categoryId = 'cat_general'))";
                }

                string sql = @"
                    SELECT COUNT(DISTINCT p.id) FROM products p
                    LEFT JOIN product_barcodes pb ON p.id = pb.product_id
                    LEFT JOIN product_units pu ON p.id = pu.product_id
                    WHERE p.is_active = 1 " + filterSql + @"
                      AND (
                           p.barcode = @exact 
                        OR pb.barcode = @exact 
                        OR p.internal_code = @exact 
                        OR p.normalized_name = @normExactText
                        OR p.normalized_name LIKE @normPrefix
                        OR p.normalized_name LIKE @normLike
                        OR p.name LIKE @like
                      );
                ";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@exact", cleanQuery);
                    cmd.Parameters.AddWithValue("@normExactText", normalizedQuery);
                    cmd.Parameters.AddWithValue("@normPrefix", normalizedQuery + "%");
                    cmd.Parameters.AddWithValue("@normLike", "%" + normalizedQuery + "%");
                    cmd.Parameters.AddWithValue("@like", "%" + cleanQuery + "%");
                    cmd.Parameters.AddWithValue("@categoryId", categoryId);
                    object scalar = cmd.ExecuteScalar();
                    if (scalar != null && scalar != DBNull.Value)
                    {
                        return Convert.ToInt32(scalar);
                    }
                }
            }
            return 0;
        }

        public List<Product> GetAllForExport(int limit = 100000)
        {
            var results = new List<Product>();
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = "SELECT * FROM products WHERE is_active = 1 ORDER BY name ASC LIMIT @limit;";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@limit", limit);
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            results.Add(MapReaderToProduct(reader));
                        }
                    }
                }
            }
            return results;
        }


        public List<Product> GetSmartCatalog(int limit = 1000)
        {
            var results = new List<Product>();
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    SELECT 
                        p.*,
                        COALESCE(c.name, 'عام') AS category_name,
                        COALESCE(s_stat.sale_count, 0) AS sale_count,
                        CASE WHEN q.id IS NOT NULL THEN 1 ELSE 0 END AS is_custom_quick_item,
                        COALESCE(q.is_open_price, 0) AS is_open_price,
                        COALESCE(q.display_order, 9999) AS quick_display_order,
                        CASE 
                            WHEN p.has_variants = 1 THEN 1
                            WHEN EXISTS(SELECT 1 FROM product_variants pv WHERE pv.parent_product_id = p.id) THEN 1
                            ELSE 0 
                        END AS has_variants_computed,
                        (SELECT COUNT(*) FROM product_variants pv WHERE pv.parent_product_id = p.id) AS variants_count,
                        (SELECT MIN(pb.expiry_date) FROM product_batches pb WHERE pb.product_id = p.id AND pb.quantity_milli > 0 AND pb.status = 'ACTIVE' AND pb.expiry_date IS NOT NULL AND pb.expiry_date != '') AS nearest_expiry_date,
                        CASE WHEN EXISTS(SELECT 1 FROM product_batches pb WHERE pb.product_id = p.id AND pb.quantity_milli > 0 AND pb.status = 'ACTIVE' AND pb.expiry_date < date('now')) THEN 1 ELSE 0 END AS is_expired,
                        CASE WHEN EXISTS(SELECT 1 FROM product_batches pb WHERE pb.product_id = p.id) THEN 1 ELSE 0 END AS has_batches
                    FROM products p
                    LEFT JOIN categories c ON p.category_id = c.id
                    LEFT JOIN (
                        SELECT product_id, COUNT(*) AS sale_count
                        FROM sale_items
                        GROUP BY product_id
                        ORDER BY sale_count DESC
                        LIMIT 300
                    ) s_stat ON p.id = s_stat.product_id
                    LEFT JOIN quick_items q ON p.id = q.product_id
                    WHERE p.is_active = 1
                    ORDER BY 
                        is_custom_quick_item DESC,
                        sale_count DESC,
                        p.name ASC
                    LIMIT @limit;
                ";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@limit", limit);
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            results.Add(MapReaderToProduct(reader));
                        }
                    }
                }

                foreach (var prod in results)
                {
                    prod.Barcodes = GetBarcodesForProductInternal(conn, prod.Id);
                    prod.Units = GetUnitsForProductInternal(conn, prod.Id);
                }
            }
            return results;
        }

        public int GetTotalCount()
        {
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand("SELECT COUNT(*) FROM products WHERE is_active = 1;", conn))
                {
                    return Convert.ToInt32(cmd.ExecuteScalar());
                }
            }
        }

        public void Upsert(Product product)
        {
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        string normName = Common.ArabicTextNormalizer.Normalize(product.Name ?? "");
                        string sql = @"
                            INSERT INTO products (
                                id, barcode, internal_code, name, normalized_name, category_id, price_piasters, cost_piasters, 
                                stock_quantity_milli, min_stock_quantity_milli, unit, tax_rate_percent, tax_category_code, is_active, needs_review, created_at, updated_at
                            ) VALUES (
                                @id, @barcode, @internalCode, @name, @normName, @categoryId, @price, @cost, 
                                @stock, @minStock, @unit, @tax, @taxCategoryCode, @isActive, @needsReview, @createdAt, @updatedAt
                            )
                            ON CONFLICT(id) DO UPDATE SET
                                barcode = excluded.barcode,
                                internal_code = excluded.internal_code,
                                name = excluded.name,
                                normalized_name = excluded.normalized_name,
                                category_id = excluded.category_id,
                                price_piasters = excluded.price_piasters,
                                cost_piasters = excluded.cost_piasters,
                                stock_quantity_milli = excluded.stock_quantity_milli,
                                min_stock_quantity_milli = excluded.min_stock_quantity_milli,
                                unit = excluded.unit,
                                tax_rate_percent = excluded.tax_rate_percent,
                                tax_category_code = excluded.tax_category_code,
                                is_active = excluded.is_active,
                                needs_review = excluded.needs_review,
                                updated_at = excluded.updated_at;
                        ";
                        using (var cmd = new SQLiteCommand(sql, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@id", product.Id);
                            cmd.Parameters.AddWithValue("@barcode", (object)product.Barcode ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@internalCode", (object)product.InternalCode ?? "");
                            cmd.Parameters.AddWithValue("@name", product.Name);
                            cmd.Parameters.AddWithValue("@normName", normName);
                            cmd.Parameters.AddWithValue("@categoryId", (object)product.CategoryId ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@price", product.PricePiasters);
                            cmd.Parameters.AddWithValue("@cost", product.CostPiasters);
                            cmd.Parameters.AddWithValue("@stock", product.StockQuantityMilli);
                            cmd.Parameters.AddWithValue("@minStock", product.MinStockQuantityMilli);
                            cmd.Parameters.AddWithValue("@unit", product.Unit ?? "piece");
                            cmd.Parameters.AddWithValue("@tax", product.TaxRatePercent);
                            cmd.Parameters.AddWithValue("@taxCategoryCode", (object)product.TaxCategoryCode ?? "");
                            cmd.Parameters.AddWithValue("@isActive", product.IsActive ? 1 : 0);
                            cmd.Parameters.AddWithValue("@needsReview", product.NeedsReview ? 1 : 0);
                            cmd.Parameters.AddWithValue("@createdAt", product.CreatedAt ?? DateTime.UtcNow.ToString("o"));
                            cmd.Parameters.AddWithValue("@updatedAt", DateTime.UtcNow.ToString("o"));
                            cmd.ExecuteNonQuery();
                        }

                        // Synchronize product_barcodes table
                        try
                        {
                            using (var delCmd = new SQLiteCommand("DELETE FROM product_barcodes WHERE product_id = @pid;", conn, trans))
                            {
                                delCmd.Parameters.AddWithValue("@pid", product.Id);
                                delCmd.ExecuteNonQuery();
                            }

                            var allCodes = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                            if (!string.IsNullOrWhiteSpace(product.Barcode))
                            {
                                allCodes.Add(product.Barcode.Trim());
                            }
                            if (product.Barcodes != null)
                            {
                                foreach (var b in product.Barcodes)
                                {
                                    if (!string.IsNullOrWhiteSpace(b))
                                    {
                                        allCodes.Add(b.Trim());
                                    }
                                }
                            }

                            string insBcSql = @"
                                INSERT OR IGNORE INTO product_barcodes (id, product_id, barcode, created_at)
                                VALUES (@id, @pid, @barcode, @createdAt);
                            ";
                            foreach (var code in allCodes)
                            {
                                using (var insCmd = new SQLiteCommand(insBcSql, conn, trans))
                                {
                                    insCmd.Parameters.AddWithValue("@id", "pb_" + Guid.NewGuid().ToString("N"));
                                    insCmd.Parameters.AddWithValue("@pid", product.Id);
                                    insCmd.Parameters.AddWithValue("@barcode", code);
                                    insCmd.Parameters.AddWithValue("@createdAt", DateTime.UtcNow.ToString("o"));
                                    insCmd.ExecuteNonQuery();
                                }
                            }
                        }
                        catch
                        {
                            // Ignore if product_barcodes is not ready
                        }

                        // Synchronize product_units table
                        try
                        {
                            if (product.Units != null && product.Units.Count > 0)
                            {
                                string upsertUnitSql = @"
                                    INSERT INTO product_units (
                                        id, product_id, unit_name, conversion_factor, is_base_unit,
                                        sell_price_piasters, cost_price_piasters, barcode, is_divisible,
                                        sort_order, created_at, updated_at
                                    ) VALUES (
                                        @id, @productId, @unitName, @conversionFactor, @isBaseUnit,
                                        @sellPrice, @costPrice, @barcode, @isDivisible,
                                        @sortOrder, @createdAt, @updatedAt
                                    )
                                    ON CONFLICT(id) DO UPDATE SET
                                        unit_name = excluded.unit_name,
                                        conversion_factor = excluded.conversion_factor,
                                        is_base_unit = excluded.is_base_unit,
                                        sell_price_piasters = excluded.sell_price_piasters,
                                        cost_price_piasters = excluded.cost_price_piasters,
                                        barcode = excluded.barcode,
                                        is_divisible = excluded.is_divisible,
                                        sort_order = excluded.sort_order,
                                        updated_at = excluded.updated_at;
                                ";
                                foreach (var u in product.Units)
                                {
                                    if (string.IsNullOrWhiteSpace(u.Id)) u.Id = Guid.NewGuid().ToString("N");
                                    u.ProductId = product.Id;
                                    using (var uCmd = new SQLiteCommand(upsertUnitSql, conn, trans))
                                    {
                                        uCmd.Parameters.AddWithValue("@id", u.Id);
                                        uCmd.Parameters.AddWithValue("@productId", product.Id);
                                        uCmd.Parameters.AddWithValue("@unitName", u.UnitName != null ? u.UnitName.Trim() : "قطعة");
                                        uCmd.Parameters.AddWithValue("@conversionFactor", u.ConversionFactor <= 0 ? 1 : u.ConversionFactor);
                                        uCmd.Parameters.AddWithValue("@isBaseUnit", u.IsBaseUnit ? 1 : 0);
                                        uCmd.Parameters.AddWithValue("@sellPrice", u.SellPricePiasters);
                                        uCmd.Parameters.AddWithValue("@costPrice", u.CostPricePiasters);
                                        uCmd.Parameters.AddWithValue("@barcode", string.IsNullOrWhiteSpace(u.Barcode) ? (object)DBNull.Value : u.Barcode.Trim());
                                        uCmd.Parameters.AddWithValue("@isDivisible", u.IsDivisible ? 1 : 0);
                                        uCmd.Parameters.AddWithValue("@sortOrder", u.SortOrder);
                                        uCmd.Parameters.AddWithValue("@createdAt", u.CreatedAt ?? DateTime.UtcNow.ToString("o"));
                                        uCmd.Parameters.AddWithValue("@updatedAt", DateTime.UtcNow.ToString("o"));
                                        uCmd.ExecuteNonQuery();
                                    }
                                }

                                var keptIds = new List<string>();
                                foreach (var u in product.Units)
                                {
                                    if (!string.IsNullOrWhiteSpace(u.Id)) keptIds.Add(u.Id);
                                }
                                if (keptIds.Count > 0)
                                {
                                    using (var delCmd = new SQLiteCommand(conn))
                                    {
                                        delCmd.Transaction = trans;
                                        var paramNames = new List<string>();
                                        for (int i = 0; i < keptIds.Count; i++)
                                        {
                                            string pName = "@keptId" + i;
                                            paramNames.Add(pName);
                                            delCmd.Parameters.AddWithValue(pName, keptIds[i]);
                                        }
                                        delCmd.Parameters.AddWithValue("@productId", product.Id);
                                        delCmd.CommandText = "DELETE FROM product_units WHERE product_id = @productId AND id NOT IN (" + string.Join(",", paramNames.ToArray()) + ");";
                                        delCmd.ExecuteNonQuery();
                                    }
                                }
                            }
                            else
                            {
                                string checkUnitSql = "SELECT COUNT(*) FROM product_units WHERE product_id = @pid AND is_base_unit = 1;";
                                using (var cCmd = new SQLiteCommand(checkUnitSql, conn, trans))
                                {
                                    cCmd.Parameters.AddWithValue("@pid", product.Id);
                                    long count = Convert.ToInt64(cCmd.ExecuteScalar());
                                    if (count == 0)
                                    {
                                        string uName = !string.IsNullOrWhiteSpace(product.Unit) ? product.Unit.Trim() : "قطعة";
                                        bool isDiv = uName.Equals("kg", StringComparison.OrdinalIgnoreCase) ||
                                                     uName.Equals("كيلو", StringComparison.OrdinalIgnoreCase) ||
                                                     uName.Equals("كجم", StringComparison.OrdinalIgnoreCase);

                                        string insUnitSql = @"
                                            INSERT OR IGNORE INTO product_units (
                                                id, product_id, unit_name, conversion_factor, is_base_unit,
                                                sell_price_piasters, cost_price_piasters, barcode, is_divisible,
                                                sort_order, created_at, updated_at
                                            ) VALUES (
                                                @id, @productId, @unitName, 1, 1,
                                                @sellPrice, @costPrice, @barcode, @isDivisible,
                                                0, @createdAt, @updatedAt
                                            );
                                        ";
                                        using (var insCmd = new SQLiteCommand(insUnitSql, conn, trans))
                                        {
                                            insCmd.Parameters.AddWithValue("@id", "punit_" + product.Id);
                                            insCmd.Parameters.AddWithValue("@productId", product.Id);
                                            insCmd.Parameters.AddWithValue("@unitName", uName);
                                            insCmd.Parameters.AddWithValue("@sellPrice", product.PricePiasters);
                                            insCmd.Parameters.AddWithValue("@costPrice", product.CostPiasters);
                                            insCmd.Parameters.AddWithValue("@barcode", string.IsNullOrWhiteSpace(product.Barcode) ? (object)DBNull.Value : product.Barcode.Trim());
                                            insCmd.Parameters.AddWithValue("@isDivisible", isDiv ? 1 : 0);
                                            insCmd.Parameters.AddWithValue("@createdAt", DateTime.UtcNow.ToString("o"));
                                            insCmd.Parameters.AddWithValue("@updatedAt", DateTime.UtcNow.ToString("o"));
                                            insCmd.ExecuteNonQuery();
                                        }
                                    }
                                }
                            }
                        }
                        catch
                        {
                            // Ignore if product_units is not ready
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

        public void SoftDelete(string id)
        {
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = "UPDATE products SET is_active = 0, updated_at = @updatedAt WHERE id = @id;";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@id", id);
                    cmd.Parameters.AddWithValue("@updatedAt", DateTime.UtcNow.ToString("o"));
                    cmd.ExecuteNonQuery();
                }
            }
        }

        private static Product MapReaderToProduct(SQLiteDataReader reader)
        {
            string taxCategory = "";
            try { taxCategory = reader["tax_category_code"] != DBNull.Value ? reader["tax_category_code"].ToString() : ""; } catch { }
            string internalCode = "";
            try { internalCode = reader["internal_code"] != DBNull.Value ? reader["internal_code"].ToString() : ""; } catch { }
            string normalizedName = "";
            try { normalizedName = reader["normalized_name"] != DBNull.Value ? reader["normalized_name"].ToString() : ""; } catch { }

            long minStock = 5000;
            try
            {
                if (reader["min_stock_quantity_milli"] != DBNull.Value)
                {
                    minStock = Convert.ToInt64(reader["min_stock_quantity_milli"]);
                }
            }
            catch { }

            bool needsReview = false;
            try
            {
                if (reader["needs_review"] != DBNull.Value)
                {
                    needsReview = Convert.ToInt32(reader["needs_review"]) == 1;
                }
            }
            catch { }
            string catName = "عام";
            try { if (reader["category_name"] != DBNull.Value) catName = reader["category_name"].ToString(); } catch { }
            int salesCount = 0;
            try
            {
                if (reader["sale_count"] != DBNull.Value)
                {
                    long rawCount = Convert.ToInt64(reader["sale_count"]);
                    salesCount = (int)Math.Min(rawCount, (long)int.MaxValue);
                }
            }
            catch { }
            bool isCustom = false;
            try { if (reader["is_custom_quick_item"] != DBNull.Value) isCustom = Convert.ToInt32(reader["is_custom_quick_item"]) == 1; } catch { }
            bool isOpenPrice = false;
            try { if (reader["is_open_price"] != DBNull.Value) isOpenPrice = Convert.ToInt32(reader["is_open_price"]) == 1; } catch { }
            int quickDisplayOrder = 9999;
            try { if (reader["quick_display_order"] != DBNull.Value) quickDisplayOrder = Convert.ToInt32(reader["quick_display_order"]); } catch { }

            bool hasVariants = false;
            try
            {
                if (reader["has_variants_computed"] != DBNull.Value)
                {
                    hasVariants = Convert.ToInt32(reader["has_variants_computed"]) == 1;
                }
                else if (reader["has_variants"] != DBNull.Value)
                {
                    hasVariants = Convert.ToInt32(reader["has_variants"]) == 1;
                }
            }
            catch
            {
                try
                {
                    if (reader["has_variants"] != DBNull.Value)
                    {
                        hasVariants = Convert.ToInt32(reader["has_variants"]) == 1;
                    }
                }
                catch { }
            }

            int variantsCount = 0;
            try
            {
                if (reader["variants_count"] != DBNull.Value)
                {
                    variantsCount = Convert.ToInt32(reader["variants_count"]);
                }
            }
            catch { }

            string parentId = null;
            try { if (reader["parent_id"] != DBNull.Value) parentId = reader["parent_id"].ToString(); } catch { }

            string variantSize = null;
            try { if (reader["variant_size"] != DBNull.Value) variantSize = reader["variant_size"].ToString(); } catch { }

            string variantColor = null;
            try { if (reader["variant_color"] != DBNull.Value) variantColor = reader["variant_color"].ToString(); } catch { }

            string variantSku = null;
            try { if (reader["variant_sku"] != DBNull.Value) variantSku = reader["variant_sku"].ToString(); } catch { }

            bool hasBatches = false;
            try { if (reader["has_batches"] != DBNull.Value) hasBatches = Convert.ToInt32(reader["has_batches"]) == 1; } catch { }

            string nearestExpiryDate = null;
            try { if (reader["nearest_expiry_date"] != DBNull.Value) nearestExpiryDate = reader["nearest_expiry_date"].ToString(); } catch { }

            bool isExpired = false;
            try { if (reader["is_expired"] != DBNull.Value) isExpired = Convert.ToInt32(reader["is_expired"]) == 1; } catch { }

            return new Product
            {
                Id = reader["id"].ToString(),
                Barcode = reader["barcode"] != DBNull.Value ? reader["barcode"].ToString() : null,
                InternalCode = internalCode,
                Name = reader["name"].ToString(),
                NormalizedName = normalizedName,
                CategoryId = reader["category_id"] != DBNull.Value ? reader["category_id"].ToString() : null,
                CategoryName = catName,
                SalesCount = salesCount,
                IsCustomQuickItem = isCustom,
                IsOpenPrice = isOpenPrice,
                QuickDisplayOrder = quickDisplayOrder,
                PricePiasters = Convert.ToInt64(reader["price_piasters"]),
                CostPiasters = Convert.ToInt64(reader["cost_piasters"]),
                StockQuantityMilli = Convert.ToInt64(reader["stock_quantity_milli"]),
                MinStockQuantityMilli = minStock,
                Unit = reader["unit"].ToString(),
                TaxRatePercent = Convert.ToInt32(reader["tax_rate_percent"]),
                TaxCategoryCode = taxCategory,
                IsActive = Convert.ToInt32(reader["is_active"]) == 1,
                NeedsReview = needsReview,
                CreatedAt = reader["created_at"].ToString(),
                UpdatedAt = reader["updated_at"].ToString(),
                HasVariants = hasVariants,
                ParentId = parentId,
                VariantSize = variantSize,
                VariantColor = variantColor,
                VariantSku = variantSku,
                VariantsCount = variantsCount,
                HasBatches = hasBatches,
                NearestExpiryDate = nearestExpiryDate,
                IsExpired = isExpired
            };
        }
    }
}
