using System;
using System.Collections.Generic;
using System.Data.SQLite;
using RafiqPOS.Models;

namespace RafiqPOS.Repositories
{
    public class ProductRepository
    {
        private readonly string _connectionString;

        public ProductRepository(string connectionString)
        {
            _connectionString = connectionString;
        }

        public Product GetById(string id)
        {
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = "SELECT * FROM products WHERE id = @id LIMIT 1;";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@id", id);
                    using (var reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            var prod = MapReaderToProduct(reader);
                            prod.Barcodes = GetBarcodesForProductInternal(conn, prod.Id);
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
                    SELECT p.* FROM products p
                    LEFT JOIN product_barcodes pb ON p.id = pb.product_id
                    WHERE p.is_active = 1 AND (p.barcode = @barcode OR pb.barcode = @barcode)
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
                    SELECT p.* FROM products p
                    LEFT JOIN product_barcodes pb ON p.id = pb.product_id
                    WHERE p.barcode = @barcode OR pb.barcode = @barcode
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

        public List<Product> Search(string query, int limit = 50)
        {
            var results = new List<Product>();
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    SELECT DISTINCT p.* FROM products p
                    LEFT JOIN product_barcodes pb ON p.id = pb.product_id
                    WHERE p.is_active = 1 
                      AND (p.barcode = @exact OR pb.barcode = @exact OR p.internal_code = @exact OR p.name LIKE @like)
                    ORDER BY p.name ASC 
                    LIMIT @limit;
                ";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@exact", query.Trim());
                    cmd.Parameters.AddWithValue("@like", "%" + query.Trim() + "%");
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

        public List<Product> GetAll(int limit = 100)
        {
            var results = new List<Product>();
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = "SELECT * FROM products WHERE is_active = 1 ORDER BY created_at DESC LIMIT @limit;";
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

        public void Upsert(Product product)
        {
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        string sql = @"
                            INSERT INTO products (
                                id, barcode, internal_code, name, category_id, price_piasters, cost_piasters, 
                                stock_quantity_milli, min_stock_quantity_milli, unit, tax_rate_percent, tax_category_code, is_active, created_at, updated_at
                            ) VALUES (
                                @id, @barcode, @internalCode, @name, @categoryId, @price, @cost, 
                                @stock, @minStock, @unit, @tax, @taxCategoryCode, @isActive, @createdAt, @updatedAt
                            )
                            ON CONFLICT(id) DO UPDATE SET
                                barcode = excluded.barcode,
                                internal_code = excluded.internal_code,
                                name = excluded.name,
                                category_id = excluded.category_id,
                                price_piasters = excluded.price_piasters,
                                cost_piasters = excluded.cost_piasters,
                                stock_quantity_milli = excluded.stock_quantity_milli,
                                min_stock_quantity_milli = excluded.min_stock_quantity_milli,
                                unit = excluded.unit,
                                tax_rate_percent = excluded.tax_rate_percent,
                                tax_category_code = excluded.tax_category_code,
                                is_active = excluded.is_active,
                                updated_at = excluded.updated_at;
                        ";
                        using (var cmd = new SQLiteCommand(sql, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@id", product.Id);
                            cmd.Parameters.AddWithValue("@barcode", (object)product.Barcode ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@internalCode", (object)product.InternalCode ?? "");
                            cmd.Parameters.AddWithValue("@name", product.Name);
                            cmd.Parameters.AddWithValue("@categoryId", (object)product.CategoryId ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@price", product.PricePiasters);
                            cmd.Parameters.AddWithValue("@cost", product.CostPiasters);
                            cmd.Parameters.AddWithValue("@stock", product.StockQuantityMilli);
                            cmd.Parameters.AddWithValue("@minStock", product.MinStockQuantityMilli);
                            cmd.Parameters.AddWithValue("@unit", product.Unit ?? "piece");
                            cmd.Parameters.AddWithValue("@tax", product.TaxRatePercent);
                            cmd.Parameters.AddWithValue("@taxCategoryCode", (object)product.TaxCategoryCode ?? "");
                            cmd.Parameters.AddWithValue("@isActive", product.IsActive ? 1 : 0);
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

        public void BulkUpdateMinStock(List<string> productIds, long minStockMilli)
        {
            if (productIds == null || productIds.Count == 0) return;

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        string sql = "UPDATE products SET min_stock_quantity_milli = @minStock, updated_at = @updatedAt WHERE id = @id;";
                        string now = DateTime.UtcNow.ToString("o");

                        foreach (var id in productIds)
                        {
                            if (string.IsNullOrWhiteSpace(id)) continue;
                            using (var cmd = new SQLiteCommand(sql, conn, trans))
                            {
                                cmd.Parameters.AddWithValue("@minStock", minStockMilli);
                                cmd.Parameters.AddWithValue("@updatedAt", now);
                                cmd.Parameters.AddWithValue("@id", id);
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
        }

        public BatchImportResult ImportBatchAtomic(List<BatchImportItem> items, string duplicateStrategy, string userId = "usr_admin_default")
        {
            var result = new BatchImportResult();
            if (items == null || items.Count == 0) return result;

            result.TotalRows = items.Count;
            string strat = (duplicateStrategy ?? "skip").Trim().ToLowerInvariant();

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        // 1. Preload categories map (name.ToLower() -> id)
                        var categoryMap = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                        using (var catCmd = new SQLiteCommand("SELECT id, name FROM categories;", conn, trans))
                        {
                            using (var catReader = catCmd.ExecuteReader())
                            {
                                while (catReader.Read())
                                {
                                    categoryMap[catReader["name"].ToString().Trim()] = catReader["id"].ToString();
                                }
                            }
                        }

                        // 2. Preload existing barcodes map (barcode.ToLower() -> product_id)
                        var existingBarcodeMap = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                        using (var bcCmd = new SQLiteCommand("SELECT barcode, id FROM products WHERE barcode IS NOT NULL UNION SELECT barcode, product_id FROM product_barcodes WHERE barcode IS NOT NULL;", conn, trans))
                        {
                            using (var bcReader = bcCmd.ExecuteReader())
                            {
                                while (bcReader.Read())
                                {
                                    string bc = bcReader["barcode"].ToString().Trim();
                                    string pid = bcReader[1].ToString();
                                    existingBarcodeMap[bc] = pid;
                                }
                            }
                        }

                        string now = DateTime.UtcNow.ToString("o");

                        foreach (var item in items)
                        {
                            if (string.IsNullOrWhiteSpace(item.Name))
                            {
                                continue;
                            }

                            // Resolve category
                            string categoryId = item.CategoryId;
                            if (string.IsNullOrWhiteSpace(categoryId))
                            {
                                string catName = !string.IsNullOrWhiteSpace(item.CategoryName) ? item.CategoryName.Trim() : "عام";
                                if (categoryMap.ContainsKey(catName))
                                {
                                    categoryId = categoryMap[catName];
                                }
                                else
                                {
                                    categoryId = "cat_" + Guid.NewGuid().ToString("N").Substring(0, 8);
                                    using (var insCatCmd = new SQLiteCommand("INSERT INTO categories (id, name, created_at) VALUES (@cid, @cname, @cdate);", conn, trans))
                                    {
                                        insCatCmd.Parameters.AddWithValue("@cid", categoryId);
                                        insCatCmd.Parameters.AddWithValue("@cname", catName);
                                        insCatCmd.Parameters.AddWithValue("@cdate", now);
                                        insCatCmd.ExecuteNonQuery();
                                    }
                                    categoryMap[catName] = categoryId;
                                }
                            }

                            // Check duplicate barcode
                            string primaryBarcode = !string.IsNullOrWhiteSpace(item.Barcode) ? item.Barcode.Trim() : null;
                            string existingProductId = null;

                            if (primaryBarcode != null && existingBarcodeMap.ContainsKey(primaryBarcode))
                            {
                                existingProductId = existingBarcodeMap[primaryBarcode];
                            }
                            else if (item.Barcodes != null)
                            {
                                foreach (var b in item.Barcodes)
                                {
                                    if (!string.IsNullOrWhiteSpace(b) && existingBarcodeMap.ContainsKey(b.Trim()))
                                    {
                                        existingProductId = existingBarcodeMap[b.Trim()];
                                        break;
                                    }
                                }
                            }

                            if (existingProductId != null)
                            {
                                if (strat == "error")
                                {
                                    throw new InvalidOperationException(string.Format("الباركود '{0}' مسجل مسبقاً في النظام.", primaryBarcode));
                                }
                                else if (strat == "update")
                                {
                                    // Update existing product
                                    string updateSql = @"
                                        UPDATE products SET
                                            name = @name,
                                            category_id = @categoryId,
                                            price_piasters = @price,
                                            cost_piasters = @cost,
                                            stock_quantity_milli = @stock,
                                            min_stock_quantity_milli = @minStock,
                                            unit = @unit,
                                            tax_rate_percent = @tax,
                                            internal_code = @internalCode,
                                            tax_category_code = @taxCategoryCode,
                                            is_active = 1,
                                            updated_at = @now
                                        WHERE id = @pid;
                                    ";
                                    using (var uCmd = new SQLiteCommand(updateSql, conn, trans))
                                    {
                                        uCmd.Parameters.AddWithValue("@pid", existingProductId);
                                        uCmd.Parameters.AddWithValue("@name", item.Name.Trim());
                                        uCmd.Parameters.AddWithValue("@categoryId", (object)categoryId ?? DBNull.Value);
                                        uCmd.Parameters.AddWithValue("@price", item.PricePiasters);
                                        uCmd.Parameters.AddWithValue("@cost", item.CostPiasters);
                                        uCmd.Parameters.AddWithValue("@stock", item.StockQuantityMilli);
                                        uCmd.Parameters.AddWithValue("@minStock", item.MinStockQuantityMilli);
                                        uCmd.Parameters.AddWithValue("@unit", item.Unit ?? "piece");
                                        uCmd.Parameters.AddWithValue("@tax", item.TaxRatePercent);
                                        uCmd.Parameters.AddWithValue("@internalCode", (object)item.InternalCode ?? "");
                                        uCmd.Parameters.AddWithValue("@taxCategoryCode", (object)item.TaxCategoryCode ?? "");
                                        uCmd.Parameters.AddWithValue("@now", now);
                                        uCmd.ExecuteNonQuery();
                                    }
                                    result.UpdatedCount++;
                                    continue;
                                }
                                else // "skip"
                                {
                                    result.SkippedCount++;
                                    continue;
                                }
                            }

                            // Fresh Insert
                            string newId = Guid.NewGuid().ToString();
                            if (string.IsNullOrWhiteSpace(primaryBarcode))
                            {
                                primaryBarcode = "200" + Math.Abs(newId.GetHashCode()).ToString("D9");
                            }

                            string insertSql = @"
                                INSERT INTO products (
                                    id, barcode, internal_code, name, category_id, price_piasters, cost_piasters,
                                    stock_quantity_milli, min_stock_quantity_milli, unit, tax_rate_percent, tax_category_code, is_active, created_at, updated_at
                                ) VALUES (
                                    @id, @barcode, @internalCode, @name, @categoryId, @price, @cost,
                                    @stock, @minStock, @unit, @tax, @taxCategoryCode, 1, @now, @now
                                );
                            ";
                            using (var insCmd = new SQLiteCommand(insertSql, conn, trans))
                            {
                                insCmd.Parameters.AddWithValue("@id", newId);
                                insCmd.Parameters.AddWithValue("@barcode", primaryBarcode);
                                insCmd.Parameters.AddWithValue("@internalCode", (object)item.InternalCode ?? "");
                                insCmd.Parameters.AddWithValue("@name", item.Name.Trim());
                                insCmd.Parameters.AddWithValue("@categoryId", (object)categoryId ?? DBNull.Value);
                                insCmd.Parameters.AddWithValue("@price", item.PricePiasters);
                                insCmd.Parameters.AddWithValue("@cost", item.CostPiasters);
                                insCmd.Parameters.AddWithValue("@stock", item.StockQuantityMilli);
                                insCmd.Parameters.AddWithValue("@minStock", item.MinStockQuantityMilli);
                                insCmd.Parameters.AddWithValue("@unit", item.Unit ?? "piece");
                                insCmd.Parameters.AddWithValue("@tax", item.TaxRatePercent);
                                insCmd.Parameters.AddWithValue("@taxCategoryCode", (object)item.TaxCategoryCode ?? "");
                                insCmd.Parameters.AddWithValue("@now", now);
                                insCmd.ExecuteNonQuery();
                            }

                            existingBarcodeMap[primaryBarcode] = newId;

                            // Insert additional barcodes
                            if (item.Barcodes != null && item.Barcodes.Count > 0)
                            {
                                foreach (var b in item.Barcodes)
                                {
                                    if (!string.IsNullOrWhiteSpace(b))
                                    {
                                        string trimmedB = b.Trim();
                                        if (!string.Equals(trimmedB, primaryBarcode, StringComparison.OrdinalIgnoreCase))
                                        {
                                            using (var pbCmd = new SQLiteCommand("INSERT OR IGNORE INTO product_barcodes (id, product_id, barcode, created_at) VALUES (@pbid, @pid, @bc, @now);", conn, trans))
                                            {
                                                pbCmd.Parameters.AddWithValue("@pbid", "pbc_" + Guid.NewGuid().ToString("N"));
                                                pbCmd.Parameters.AddWithValue("@pid", newId);
                                                pbCmd.Parameters.AddWithValue("@bc", trimmedB);
                                                pbCmd.Parameters.AddWithValue("@now", now);
                                                pbCmd.ExecuteNonQuery();
                                            }
                                            existingBarcodeMap[trimmedB] = newId;
                                        }
                                    }
                                }
                            }

                            result.ImportedCount++;
                        }

                        // Record audit log entry inside transaction
                        using (var auditCmd = new SQLiteCommand("INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details_json, created_at) VALUES (@aid, @uid, 'product_import_batch', 'products', 'batch', @details, @now);", conn, trans))
                        {
                            auditCmd.Parameters.AddWithValue("@aid", "aud_" + Guid.NewGuid().ToString("N"));
                            auditCmd.Parameters.AddWithValue("@uid", string.IsNullOrWhiteSpace(userId) ? "usr_admin_default" : userId);
                            string details = string.Format("{{\"imported\":{0},\"updated\":{1},\"skipped\":{2},\"total\":{3}}}", result.ImportedCount, result.UpdatedCount, result.SkippedCount, result.TotalRows);
                            auditCmd.Parameters.AddWithValue("@details", details);
                            auditCmd.Parameters.AddWithValue("@now", now);
                            auditCmd.ExecuteNonQuery();
                        }

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

        private static Product MapReaderToProduct(SQLiteDataReader reader)
        {
            string taxCategory = "";
            try { taxCategory = reader["tax_category_code"] != DBNull.Value ? reader["tax_category_code"].ToString() : ""; } catch { }
            string internalCode = "";
            try { internalCode = reader["internal_code"] != DBNull.Value ? reader["internal_code"].ToString() : ""; } catch { }

            long minStock = 5000;
            try
            {
                if (reader["min_stock_quantity_milli"] != DBNull.Value)
                {
                    minStock = Convert.ToInt64(reader["min_stock_quantity_milli"]);
                }
            }
            catch { }

            return new Product
            {
                Id = reader["id"].ToString(),
                Barcode = reader["barcode"] != DBNull.Value ? reader["barcode"].ToString() : null,
                InternalCode = internalCode,
                Name = reader["name"].ToString(),
                CategoryId = reader["category_id"] != DBNull.Value ? reader["category_id"].ToString() : null,
                PricePiasters = Convert.ToInt64(reader["price_piasters"]),
                CostPiasters = Convert.ToInt64(reader["cost_piasters"]),
                StockQuantityMilli = Convert.ToInt64(reader["stock_quantity_milli"]),
                MinStockQuantityMilli = minStock,
                Unit = reader["unit"].ToString(),
                TaxRatePercent = Convert.ToInt32(reader["tax_rate_percent"]),
                TaxCategoryCode = taxCategory,
                IsActive = Convert.ToInt32(reader["is_active"]) == 1,
                CreatedAt = reader["created_at"].ToString(),
                UpdatedAt = reader["updated_at"].ToString()
            };
        }
    }
}
