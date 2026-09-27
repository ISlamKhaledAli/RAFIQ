using System;
using System.Collections.Generic;
using System.Data.SQLite;
using RafiqPOS.Models;

namespace RafiqPOS.Repositories
{
    public class HeldSaleRepository
    {
        private readonly string _connectionString;

        public HeldSaleRepository(string connectionString)
        {
            _connectionString = connectionString;
        }

        public HeldSale SaveHeldSale(HeldSale heldSale)
        {
            if (heldSale == null) throw new ArgumentNullException("heldSale");
            if (string.IsNullOrEmpty(heldSale.Id))
            {
                heldSale.Id = Guid.NewGuid().ToString();
            }
            if (string.IsNullOrEmpty(heldSale.CreatedAt))
            {
                heldSale.CreatedAt = DateTime.UtcNow.ToString("o");
            }

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    INSERT INTO held_sales (
                        id, hold_label, customer_id, customer_name, items_count,
                        subtotal_piasters, discount_piasters, total_piasters,
                        cart_json, notes, cashier_id, created_at
                    ) VALUES (
                        @id, @holdLabel, @customerId, @customerName, @itemsCount,
                        @subtotal, @discount, @total,
                        @cartJson, @notes, @cashierId, @createdAt
                    );
                ";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@id", heldSale.Id);
                    cmd.Parameters.AddWithValue("@holdLabel", heldSale.HoldLabel ?? "فاتورة معلقة");
                    cmd.Parameters.AddWithValue("@customerId", (object)heldSale.CustomerId ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@customerName", (object)heldSale.CustomerName ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@itemsCount", heldSale.ItemsCount);
                    cmd.Parameters.AddWithValue("@subtotal", heldSale.SubtotalPiasters);
                    cmd.Parameters.AddWithValue("@discount", heldSale.DiscountPiasters);
                    cmd.Parameters.AddWithValue("@total", heldSale.TotalPiasters);
                    cmd.Parameters.AddWithValue("@cartJson", heldSale.CartJson ?? "[]");
                    cmd.Parameters.AddWithValue("@notes", (object)heldSale.Notes ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@cashierId", (object)heldSale.CashierId ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@createdAt", heldSale.CreatedAt);
                    cmd.ExecuteNonQuery();
                }
            }

            return heldSale;
        }

        public List<HeldSale> GetHeldSales()
        {
            var list = new List<HeldSale>();
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = "SELECT * FROM held_sales ORDER BY created_at DESC;";
                using (var cmd = new SQLiteCommand(sql, conn))
                using (var reader = cmd.ExecuteReader())
                {
                    while (reader.Read())
                    {
                        list.Add(MapReaderToHeldSale(reader));
                    }
                }
            }
            return list;
        }

        public HeldSale GetHeldSaleById(string id)
        {
            if (string.IsNullOrEmpty(id)) return null;
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = "SELECT * FROM held_sales WHERE id = @id LIMIT 1;";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@id", id);
                    using (var reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            return MapReaderToHeldSale(reader);
                        }
                    }
                }
            }
            return null;
        }

        public bool DeleteHeldSale(string id)
        {
            if (string.IsNullOrEmpty(id)) return false;
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = "DELETE FROM held_sales WHERE id = @id;";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@id", id);
                    int affected = cmd.ExecuteNonQuery();
                    return affected > 0;
                }
            }
        }

        public int CleanupOldHeldSales(int retentionDays = 7)
        {
            if (retentionDays < 1) retentionDays = 1;
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = "DELETE FROM held_sales WHERE date(created_at) < date('now', '-' || @days || ' days');";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@days", retentionDays);
                    return cmd.ExecuteNonQuery();
                }
            }
        }

        private HeldSale MapReaderToHeldSale(SQLiteDataReader reader)
        {
            return new HeldSale
            {
                Id = reader["id"].ToString(),
                HoldLabel = reader["hold_label"].ToString(),
                CustomerId = reader["customer_id"] != DBNull.Value ? reader["customer_id"].ToString() : null,
                CustomerName = reader["customer_name"] != DBNull.Value ? reader["customer_name"].ToString() : null,
                ItemsCount = Convert.ToInt32(reader["items_count"]),
                SubtotalPiasters = Convert.ToInt64(reader["subtotal_piasters"]),
                DiscountPiasters = Convert.ToInt64(reader["discount_piasters"]),
                TotalPiasters = Convert.ToInt64(reader["total_piasters"]),
                CartJson = reader["cart_json"].ToString(),
                Notes = reader["notes"] != DBNull.Value ? reader["notes"].ToString() : null,
                CashierId = reader["cashier_id"] != DBNull.Value ? reader["cashier_id"].ToString() : null,
                CreatedAt = reader["created_at"].ToString()
            };
        }
    }
}
