using System;
using System.Collections.Generic;
using System.Data.SQLite;
using RafiqPOS.Models;

namespace RafiqPOS.Repositories
{
    public class QuickItemRepository
    {
        private readonly string _connectionString;

        public QuickItemRepository(string connectionString)
        {
            this._connectionString = connectionString;
        }

        public List<QuickItem> GetAll()
        {
            var list = new List<QuickItem>();
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    SELECT id, product_id, name, price_piasters, is_open_price, unit, category_name, color, display_order, created_at, updated_at
                    FROM quick_items
                    ORDER BY category_name ASC, display_order ASC, name ASC;
                ";
                using (var cmd = new SQLiteCommand(sql, conn))
                using (var reader = cmd.ExecuteReader())
                {
                    while (reader.Read())
                    {
                        list.Add(new QuickItem
                        {
                            Id = reader["id"].ToString(),
                            ProductId = reader["product_id"] == DBNull.Value ? null : reader["product_id"].ToString(),
                            Name = reader["name"].ToString(),
                            PricePiasters = Convert.ToInt64(reader["price_piasters"]),
                            IsOpenPrice = Convert.ToInt32(reader["is_open_price"]) == 1,
                            Unit = reader["unit"].ToString(),
                            CategoryName = reader["category_name"].ToString(),
                            Color = reader["color"] == DBNull.Value ? null : reader["color"].ToString(),
                            DisplayOrder = Convert.ToInt32(reader["display_order"]),
                            CreatedAt = reader["created_at"].ToString(),
                            UpdatedAt = reader["updated_at"].ToString()
                        });
                    }
                }
            }
            return list;
        }

        public QuickItem GetById(string id)
        {
            if (string.IsNullOrWhiteSpace(id)) return null;

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    SELECT id, product_id, name, price_piasters, is_open_price, unit, category_name, color, display_order, created_at, updated_at
                    FROM quick_items
                    WHERE id = @id;
                ";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@id", id);
                    using (var reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            return new QuickItem
                            {
                                Id = reader["id"].ToString(),
                                ProductId = reader["product_id"] == DBNull.Value ? null : reader["product_id"].ToString(),
                                Name = reader["name"].ToString(),
                                PricePiasters = Convert.ToInt64(reader["price_piasters"]),
                                IsOpenPrice = Convert.ToInt32(reader["is_open_price"]) == 1,
                                Unit = reader["unit"].ToString(),
                                CategoryName = reader["category_name"].ToString(),
                                Color = reader["color"] == DBNull.Value ? null : reader["color"].ToString(),
                                DisplayOrder = Convert.ToInt32(reader["display_order"]),
                                CreatedAt = reader["created_at"].ToString(),
                                UpdatedAt = reader["updated_at"].ToString()
                            };
                        }
                    }
                }
            }
            return null;
        }

        public QuickItem Save(QuickItem item)
        {
            if (item == null) throw new ArgumentNullException("item");

            string now = DateTime.UtcNow.ToString("o");
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        if (string.IsNullOrWhiteSpace(item.Id))
                        {
                            item.Id = Guid.NewGuid().ToString();
                            item.CreatedAt = now;
                            item.UpdatedAt = now;

                            // Calculate next display_order if 0
                            if (item.DisplayOrder <= 0)
                            {
                                using (var maxCmd = new SQLiteCommand("SELECT COALESCE(MAX(display_order), 0) + 1 FROM quick_items WHERE category_name = @cat;", conn, trans))
                                {
                                    maxCmd.Parameters.AddWithValue("@cat", string.IsNullOrWhiteSpace(item.CategoryName) ? "عام" : item.CategoryName);
                                    item.DisplayOrder = Convert.ToInt32(maxCmd.ExecuteScalar());
                                }
                            }

                            string insertSql = @"
                                INSERT INTO quick_items (id, product_id, name, price_piasters, is_open_price, unit, category_name, color, display_order, created_at, updated_at)
                                VALUES (@id, @productId, @name, @pricePiasters, @isOpenPrice, @unit, @categoryName, @color, @displayOrder, @createdAt, @updatedAt);
                            ";
                            using (var cmd = new SQLiteCommand(insertSql, conn, trans))
                            {
                                cmd.Parameters.AddWithValue("@id", item.Id);
                                cmd.Parameters.AddWithValue("@productId", (object)item.ProductId ?? DBNull.Value);
                                cmd.Parameters.AddWithValue("@name", item.Name ?? "");
                                cmd.Parameters.AddWithValue("@pricePiasters", item.PricePiasters);
                                cmd.Parameters.AddWithValue("@isOpenPrice", item.IsOpenPrice ? 1 : 0);
                                cmd.Parameters.AddWithValue("@unit", string.IsNullOrWhiteSpace(item.Unit) ? "piece" : item.Unit);
                                cmd.Parameters.AddWithValue("@categoryName", string.IsNullOrWhiteSpace(item.CategoryName) ? "عام" : item.CategoryName);
                                cmd.Parameters.AddWithValue("@color", (object)item.Color ?? DBNull.Value);
                                cmd.Parameters.AddWithValue("@displayOrder", item.DisplayOrder);
                                cmd.Parameters.AddWithValue("@createdAt", item.CreatedAt);
                                cmd.Parameters.AddWithValue("@updatedAt", item.UpdatedAt);
                                cmd.ExecuteNonQuery();
                            }
                        }
                        else
                        {
                            item.UpdatedAt = now;
                            string updateSql = @"
                                UPDATE quick_items 
                                SET product_id = @productId,
                                    name = @name,
                                    price_piasters = @pricePiasters,
                                    is_open_price = @isOpenPrice,
                                    unit = @unit,
                                    category_name = @categoryName,
                                    color = @color,
                                    display_order = @displayOrder,
                                    updated_at = @updatedAt
                                WHERE id = @id;
                            ";
                            using (var cmd = new SQLiteCommand(updateSql, conn, trans))
                            {
                                cmd.Parameters.AddWithValue("@id", item.Id);
                                cmd.Parameters.AddWithValue("@productId", (object)item.ProductId ?? DBNull.Value);
                                cmd.Parameters.AddWithValue("@name", item.Name ?? "");
                                cmd.Parameters.AddWithValue("@pricePiasters", item.PricePiasters);
                                cmd.Parameters.AddWithValue("@isOpenPrice", item.IsOpenPrice ? 1 : 0);
                                cmd.Parameters.AddWithValue("@unit", string.IsNullOrWhiteSpace(item.Unit) ? "piece" : item.Unit);
                                cmd.Parameters.AddWithValue("@categoryName", string.IsNullOrWhiteSpace(item.CategoryName) ? "عام" : item.CategoryName);
                                cmd.Parameters.AddWithValue("@color", (object)item.Color ?? DBNull.Value);
                                cmd.Parameters.AddWithValue("@displayOrder", item.DisplayOrder);
                                cmd.Parameters.AddWithValue("@updatedAt", item.UpdatedAt);
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
            return item;
        }

        public bool Delete(string id)
        {
            if (string.IsNullOrWhiteSpace(id)) return false;

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand("DELETE FROM quick_items WHERE id = @id;", conn))
                {
                    cmd.Parameters.AddWithValue("@id", id);
                    return cmd.ExecuteNonQuery() > 0;
                }
            }
        }

        public void Reorder(List<string> orderedIds)
        {
            if (orderedIds == null || orderedIds.Count == 0) return;

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        for (int i = 0; i < orderedIds.Count; i++)
                        {
                            using (var cmd = new SQLiteCommand("UPDATE quick_items SET display_order = @order WHERE id = @id;", conn, trans))
                            {
                                cmd.Parameters.AddWithValue("@order", i + 1);
                                cmd.Parameters.AddWithValue("@id", orderedIds[i]);
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
    }
}
