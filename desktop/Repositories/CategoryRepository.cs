using System;
using System.Collections.Generic;
using System.Data.SQLite;
using RafiqPOS.Models;

namespace RafiqPOS.Repositories
{
    public class CategoryRepository
    {
        private readonly string _connectionString;

        public CategoryRepository(string connectionString)
        {
            _connectionString = connectionString;
        }

        public List<Category> GetAll(bool includeArchived)
        {
            var list = new List<Category>();
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    SELECT c.id, c.name, c.display_order, c.is_active, c.created_at, c.updated_at,
                           COUNT(p.id) AS product_count
                    FROM categories c
                    LEFT JOIN products p ON c.id = p.category_id AND p.is_active = 1
                    WHERE (@includeArchived = 1 OR c.is_active = 1)
                    GROUP BY c.id
                    ORDER BY c.display_order ASC, c.name ASC;
                ";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@includeArchived", includeArchived ? 1 : 0);
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            list.Add(new Category
                            {
                                Id = reader["id"].ToString(),
                                Name = reader["name"].ToString(),
                                DisplayOrder = Convert.ToInt32(reader["display_order"]),
                                IsActive = Convert.ToInt32(reader["is_active"]) == 1,
                                ProductCount = Convert.ToInt32(reader["product_count"]),
                                CreatedAt = reader["created_at"].ToString(),
                                UpdatedAt = reader["updated_at"].ToString()
                            });
                        }
                    }
                }
            }
            return list;
        }

        public Category GetById(string id)
        {
            if (string.IsNullOrWhiteSpace(id)) return null;

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = "SELECT * FROM categories WHERE id = @id LIMIT 1;";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@id", id);
                    using (var reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            return new Category
                            {
                                Id = reader["id"].ToString(),
                                Name = reader["name"].ToString(),
                                DisplayOrder = Convert.ToInt32(reader["display_order"]),
                                IsActive = Convert.ToInt32(reader["is_active"]) == 1,
                                CreatedAt = reader["created_at"].ToString(),
                                UpdatedAt = reader["updated_at"].ToString()
                            };
                        }
                    }
                }
            }
            return null;
        }

        public Category GetByName(string name)
        {
            if (string.IsNullOrWhiteSpace(name)) return null;

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = "SELECT * FROM categories WHERE name = @name COLLATE NOCASE LIMIT 1;";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@name", name.Trim());
                    using (var reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            return new Category
                            {
                                Id = reader["id"].ToString(),
                                Name = reader["name"].ToString(),
                                DisplayOrder = Convert.ToInt32(reader["display_order"]),
                                IsActive = Convert.ToInt32(reader["is_active"]) == 1,
                                CreatedAt = reader["created_at"].ToString(),
                                UpdatedAt = reader["updated_at"].ToString()
                            };
                        }
                    }
                }
            }
            return null;
        }

        public void Upsert(Category category)
        {
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    INSERT INTO categories (id, name, display_order, is_active, created_at, updated_at)
                    VALUES (@id, @name, @order, @active, @createdAt, @updatedAt)
                    ON CONFLICT(id) DO UPDATE SET
                        name = excluded.name,
                        display_order = excluded.display_order,
                        is_active = excluded.is_active,
                        updated_at = excluded.updated_at;
                ";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@id", category.Id);
                    cmd.Parameters.AddWithValue("@name", category.Name.Trim());
                    cmd.Parameters.AddWithValue("@order", category.DisplayOrder);
                    cmd.Parameters.AddWithValue("@active", category.IsActive ? 1 : 0);
                    cmd.Parameters.AddWithValue("@createdAt", category.CreatedAt ?? DateTime.UtcNow.ToString("o"));
                    cmd.Parameters.AddWithValue("@updatedAt", DateTime.UtcNow.ToString("o"));
                    cmd.ExecuteNonQuery();
                }
            }
        }

        public void Archive(string id, bool isArchived)
        {
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = "UPDATE categories SET is_active = @active, updated_at = @updatedAt WHERE id = @id;";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@id", id);
                    cmd.Parameters.AddWithValue("@active", isArchived ? 0 : 1);
                    cmd.Parameters.AddWithValue("@updatedAt", DateTime.UtcNow.ToString("o"));
                    cmd.ExecuteNonQuery();
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
                            string sql = "UPDATE categories SET display_order = @order WHERE id = @id;";
                            using (var cmd = new SQLiteCommand(sql, conn, trans))
                            {
                                cmd.Parameters.AddWithValue("@order", i);
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
