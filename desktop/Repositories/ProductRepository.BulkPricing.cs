using System;
using System.Collections.Generic;
using System.Data.SQLite;
using RafiqPOS.Common;
using RafiqPOS.Models;

namespace RafiqPOS.Repositories
{
    public partial class ProductRepository
    {
        public List<Product> GetProductsForBulkPrice(string scope, List<string> productIds, string categoryId, string searchQuery)
        {
            var results = new List<Product>();
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();

                if (string.Equals(scope, "selected", StringComparison.OrdinalIgnoreCase))
                {
                    if (productIds == null || productIds.Count == 0) return results;

                    var paramNames = new List<string>();
                    using (var cmd = new SQLiteCommand(conn))
                    {
                        for (int i = 0; i < productIds.Count; i++)
                        {
                            string pName = "@p" + i;
                            paramNames.Add(pName);
                            cmd.Parameters.AddWithValue(pName, productIds[i]);
                        }

                        cmd.CommandText = @"
                            SELECT p.*, c.name AS category_name
                            FROM products p
                            LEFT JOIN categories c ON p.category_id = c.id
                            WHERE p.is_active = 1 AND p.id IN (" + string.Join(",", paramNames.ToArray()) + @")
                            ORDER BY p.name ASC;
                        ";

                        using (var reader = cmd.ExecuteReader())
                        {
                            while (reader.Read())
                            {
                                results.Add(MapReaderToProduct(reader));
                            }
                        }
                    }
                    return results;
                }
                else if (string.Equals(scope, "category", StringComparison.OrdinalIgnoreCase))
                {
                    string catSql = @"
                        SELECT p.*, c.name AS category_name
                        FROM products p
                        LEFT JOIN categories c ON p.category_id = c.id
                        WHERE p.is_active = 1 
                          AND (p.category_id = @catId OR (p.category_id IS NULL AND @catId = 'cat_general'))
                        ORDER BY p.name ASC;
                    ";

                    using (var cmd = new SQLiteCommand(catSql, conn))
                    {
                        cmd.Parameters.AddWithValue("@catId", categoryId ?? "cat_general");
                        using (var reader = cmd.ExecuteReader())
                        {
                            while (reader.Read())
                            {
                                results.Add(MapReaderToProduct(reader));
                            }
                        }
                    }
                    return results;
                }
                else if (string.Equals(scope, "search", StringComparison.OrdinalIgnoreCase) && !string.IsNullOrWhiteSpace(searchQuery))
                {
                    return Search(searchQuery, 1000, 0, "all", categoryId ?? "all");
                }
                else
                {
                    // "all" scope
                    string allSql = @"
                        SELECT p.*, c.name AS category_name
                        FROM products p
                        LEFT JOIN categories c ON p.category_id = c.id
                        WHERE p.is_active = 1
                        ORDER BY p.name ASC;
                    ";

                    using (var cmd = new SQLiteCommand(allSql, conn))
                    {
                        using (var reader = cmd.ExecuteReader())
                        {
                            while (reader.Read())
                            {
                                results.Add(MapReaderToProduct(reader));
                            }
                        }
                    }
                    return results;
                }
            }
        }

        public BulkPriceApplyResult ApplyBulkPriceAdjustment(List<BulkPriceApplyItem> items, string reason, string userId)
        {
            var result = new BulkPriceApplyResult();
            if (items == null || items.Count == 0)
            {
                result.Success = true;
                result.UpdatedCount = 0;
                result.Message = "لا توجد أصناف لتعديل أسعارها";
                return result;
            }

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        string now = DateTime.UtcNow.ToString("o");
                        string updateProductSql = @"
                            UPDATE products 
                            SET price_piasters = @newPrice, 
                                cost_piasters = @newCost, 
                                updated_at = @now 
                            WHERE id = @id AND is_active = 1;
                        ";

                        string updateBaseUnitSql = @"
                            UPDATE product_units 
                            SET sell_price_piasters = @newPrice, 
                                cost_price_piasters = @newCost, 
                                updated_at = @now 
                            WHERE product_id = @id AND is_base_unit = 1;
                        ";

                        string insertHistorySql = @"
                            INSERT INTO product_price_history (
                                id, product_id, old_price_piasters, new_price_piasters, 
                                old_cost_piasters, new_cost_piasters, change_reason, created_at
                            ) VALUES (
                                @histId, @productId, @oldPrice, @newPrice, 
                                @oldCost, @newCost, @reason, @now
                            );
                        ";

                        int updatedCount = 0;
                        foreach (var item in items)
                        {
                            if (item == null || string.IsNullOrWhiteSpace(item.ProductId)) continue;

                            long finalPrice = item.NewPricePiasters < 0 ? 0 : item.NewPricePiasters;
                            long finalCost = item.NewCostPiasters < 0 ? 0 : item.NewCostPiasters;

                            using (var cmd = new SQLiteCommand(updateProductSql, conn, trans))
                            {
                                cmd.Parameters.AddWithValue("@newPrice", finalPrice);
                                cmd.Parameters.AddWithValue("@newCost", finalCost);
                                cmd.Parameters.AddWithValue("@now", now);
                                cmd.Parameters.AddWithValue("@id", item.ProductId);
                                int affected = cmd.ExecuteNonQuery();
                                if (affected > 0)
                                {
                                    updatedCount++;

                                    try
                                    {
                                        using (var unitCmd = new SQLiteCommand(updateBaseUnitSql, conn, trans))
                                        {
                                            unitCmd.Parameters.AddWithValue("@newPrice", finalPrice);
                                            unitCmd.Parameters.AddWithValue("@newCost", finalCost);
                                            unitCmd.Parameters.AddWithValue("@now", now);
                                            unitCmd.Parameters.AddWithValue("@id", item.ProductId);
                                            unitCmd.ExecuteNonQuery();
                                        }
                                    }
                                    catch { }

                                    using (var histCmd = new SQLiteCommand(insertHistorySql, conn, trans))
                                    {
                                        histCmd.Parameters.AddWithValue("@histId", "ph_" + Guid.NewGuid().ToString("N"));
                                        histCmd.Parameters.AddWithValue("@productId", item.ProductId);
                                        histCmd.Parameters.AddWithValue("@oldPrice", item.OldPricePiasters);
                                        histCmd.Parameters.AddWithValue("@newPrice", finalPrice);
                                        histCmd.Parameters.AddWithValue("@oldCost", item.OldCostPiasters);
                                        histCmd.Parameters.AddWithValue("@newCost", finalCost);
                                        histCmd.Parameters.AddWithValue("@reason", string.IsNullOrWhiteSpace(reason) ? "تعديل أسعار جماعي" : reason.Trim());
                                        histCmd.Parameters.AddWithValue("@now", now);
                                        histCmd.ExecuteNonQuery();
                                    }
                                }
                            }
                        }

                        if (_auditRepo != null && updatedCount > 0)
                        {
                            try
                            {
                                string details = string.Format(
                                    "{{\"updatedCount\":{0},\"reason\":\"{1}\"}}",
                                    updatedCount,
                                    (reason ?? "تعديل أسعار جماعي").Replace("\"", "\\\"")
                                );
                                _auditRepo.Log(conn, trans, new AuditLog
                                {
                                    Id = "aud_" + Guid.NewGuid().ToString("N"),
                                    UserId = string.IsNullOrWhiteSpace(userId) ? "usr_admin_default" : userId,
                                    Action = "bulk_price_adjustment",
                                    EntityType = "products",
                                    EntityId = "bulk",
                                    DetailsJson = details,
                                    CreatedAt = now
                                });
                            }
                            catch { }
                        }

                        trans.Commit();

                        result.Success = true;
                        result.UpdatedCount = updatedCount;
                        result.Message = string.Format("تم تحديث أسعار {0} صنف بنجاح", updatedCount);
                        return result;
                    }
                    catch (Exception ex)
                    {
                        trans.Rollback();
                        Common.Logger.Error("فشل تنفيذ التعديل الجماعي للأسعار", ex);
                        throw;
                    }
                }
            }
        }
    }
}
