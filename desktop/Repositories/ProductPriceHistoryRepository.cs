using System;
using System.Collections.Generic;
using System.Data.SQLite;
using RafiqPOS.Models;

namespace RafiqPOS.Repositories
{
    public class ProductPriceHistoryRepository
    {
        private readonly string _connectionString;

        public ProductPriceHistoryRepository(string connectionString)
        {
            _connectionString = connectionString;
        }

        public void Add(ProductPriceHistory entry, SQLiteConnection existingConn = null, SQLiteTransaction trans = null)
        {
            if (entry == null) return;
            if (string.IsNullOrWhiteSpace(entry.Id))
            {
                entry.Id = "ph_" + Guid.NewGuid().ToString("N");
            }
            if (string.IsNullOrWhiteSpace(entry.CreatedAt))
            {
                entry.CreatedAt = DateTime.UtcNow.ToString("o");
            }

            string sql = @"
                INSERT INTO product_price_history (
                    id, product_id, old_price_piasters, new_price_piasters, 
                    old_cost_piasters, new_cost_piasters, change_reason, created_at
                ) VALUES (
                    @id, @productId, @oldPrice, @newPrice, 
                    @oldCost, @newCost, @reason, @createdAt
                );
            ";

            if (existingConn != null)
            {
                using (var cmd = new SQLiteCommand(sql, existingConn, trans))
                {
                    cmd.Parameters.AddWithValue("@id", entry.Id);
                    cmd.Parameters.AddWithValue("@productId", entry.ProductId);
                    cmd.Parameters.AddWithValue("@oldPrice", entry.OldPricePiasters);
                    cmd.Parameters.AddWithValue("@newPrice", entry.NewPricePiasters);
                    cmd.Parameters.AddWithValue("@oldCost", entry.OldCostPiasters);
                    cmd.Parameters.AddWithValue("@newCost", entry.NewCostPiasters);
                    cmd.Parameters.AddWithValue("@reason", (object)entry.ChangeReason ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@createdAt", entry.CreatedAt);
                    cmd.ExecuteNonQuery();
                }
            }
            else
            {
                using (var conn = new SQLiteConnection(_connectionString))
                {
                    conn.Open();
                    using (var cmd = new SQLiteCommand(sql, conn))
                    {
                        cmd.Parameters.AddWithValue("@id", entry.Id);
                        cmd.Parameters.AddWithValue("@productId", entry.ProductId);
                        cmd.Parameters.AddWithValue("@oldPrice", entry.OldPricePiasters);
                        cmd.Parameters.AddWithValue("@newPrice", entry.NewPricePiasters);
                        cmd.Parameters.AddWithValue("@oldCost", entry.OldCostPiasters);
                        cmd.Parameters.AddWithValue("@newCost", entry.NewCostPiasters);
                        cmd.Parameters.AddWithValue("@reason", (object)entry.ChangeReason ?? DBNull.Value);
                        cmd.Parameters.AddWithValue("@createdAt", entry.CreatedAt);
                        cmd.ExecuteNonQuery();
                    }
                }
            }
        }

        public List<ProductPriceHistory> GetByProductId(string productId, int limit = 50)
        {
            var results = new List<ProductPriceHistory>();
            if (string.IsNullOrWhiteSpace(productId)) return results;

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    SELECT * FROM product_price_history 
                    WHERE product_id = @productId 
                    ORDER BY created_at DESC 
                    LIMIT @limit;
                ";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@productId", productId);
                    cmd.Parameters.AddWithValue("@limit", limit);
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            results.Add(new ProductPriceHistory
                            {
                                Id = reader["id"].ToString(),
                                ProductId = reader["product_id"].ToString(),
                                OldPricePiasters = Convert.ToInt64(reader["old_price_piasters"]),
                                NewPricePiasters = Convert.ToInt64(reader["new_price_piasters"]),
                                OldCostPiasters = Convert.ToInt64(reader["old_cost_piasters"]),
                                NewCostPiasters = Convert.ToInt64(reader["new_cost_piasters"]),
                                ChangeReason = reader["change_reason"] != DBNull.Value ? reader["change_reason"].ToString() : "",
                                CreatedAt = reader["created_at"].ToString()
                            });
                        }
                    }
                }
            }
            return results;
        }
    }
}
