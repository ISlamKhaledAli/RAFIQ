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
                            return MapReaderToProduct(reader);
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
                string sql = "SELECT * FROM products WHERE barcode = @barcode LIMIT 1;";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@barcode", barcode.Trim());
                    using (var reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            return MapReaderToProduct(reader);
                        }
                    }
                }
            }
            return null;
        }

        public List<Product> Search(string query, int limit = 50)
        {
            var results = new List<Product>();
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    SELECT * FROM products 
                    WHERE is_active = 1 
                      AND (barcode = @exact OR name LIKE @like)
                    ORDER BY name ASC 
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
                string sql = @"
                    INSERT INTO products (
                        id, barcode, name, category_id, price_piasters, cost_piasters, 
                        stock_quantity_milli, unit, tax_rate_percent, is_active, created_at, updated_at
                    ) VALUES (
                        @id, @barcode, @name, @categoryId, @price, @cost, 
                        @stock, @unit, @tax, @isActive, @createdAt, @updatedAt
                    )
                    ON CONFLICT(id) DO UPDATE SET
                        barcode = excluded.barcode,
                        name = excluded.name,
                        category_id = excluded.category_id,
                        price_piasters = excluded.price_piasters,
                        cost_piasters = excluded.cost_piasters,
                        stock_quantity_milli = excluded.stock_quantity_milli,
                        unit = excluded.unit,
                        tax_rate_percent = excluded.tax_rate_percent,
                        is_active = excluded.is_active,
                        updated_at = excluded.updated_at;
                ";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@id", product.Id);
                    cmd.Parameters.AddWithValue("@barcode", (object)product.Barcode ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@name", product.Name);
                    cmd.Parameters.AddWithValue("@categoryId", (object)product.CategoryId ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@price", product.PricePiasters);
                    cmd.Parameters.AddWithValue("@cost", product.CostPiasters);
                    cmd.Parameters.AddWithValue("@stock", product.StockQuantityMilli);
                    cmd.Parameters.AddWithValue("@unit", product.Unit ?? "piece");
                    cmd.Parameters.AddWithValue("@tax", product.TaxRatePercent);
                    cmd.Parameters.AddWithValue("@isActive", product.IsActive ? 1 : 0);
                    cmd.Parameters.AddWithValue("@createdAt", product.CreatedAt ?? DateTime.UtcNow.ToString("o"));
                    cmd.Parameters.AddWithValue("@updatedAt", DateTime.UtcNow.ToString("o"));
                    cmd.ExecuteNonQuery();
                }
            }
        }

        private static Product MapReaderToProduct(SQLiteDataReader reader)
        {
            return new Product
            {
                Id = reader["id"].ToString(),
                Barcode = reader["barcode"] != DBNull.Value ? reader["barcode"].ToString() : null,
                Name = reader["name"].ToString(),
                CategoryId = reader["category_id"] != DBNull.Value ? reader["category_id"].ToString() : null,
                PricePiasters = Convert.ToInt64(reader["price_piasters"]),
                CostPiasters = Convert.ToInt64(reader["cost_piasters"]),
                StockQuantityMilli = Convert.ToInt64(reader["stock_quantity_milli"]),
                Unit = reader["unit"].ToString(),
                TaxRatePercent = Convert.ToInt32(reader["tax_rate_percent"]),
                IsActive = Convert.ToInt32(reader["is_active"]) == 1,
                CreatedAt = reader["created_at"].ToString(),
                UpdatedAt = reader["updated_at"].ToString()
            };
        }
    }
}
