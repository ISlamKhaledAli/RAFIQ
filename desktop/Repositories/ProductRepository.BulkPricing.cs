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
                        string batchId = "bpa_" + Guid.NewGuid().ToString("N");
                        string userName = "المدير";

                        if (!string.IsNullOrWhiteSpace(userId))
                        {
                            try
                            {
                                using (var uCmd = new SQLiteCommand("SELECT name FROM users WHERE id = @uid LIMIT 1;", conn, trans))
                                {
                                    uCmd.Parameters.AddWithValue("@uid", userId);
                                    object uObj = uCmd.ExecuteScalar();
                                    if (uObj != null && uObj != DBNull.Value && !string.IsNullOrWhiteSpace(uObj.ToString()))
                                    {
                                        userName = uObj.ToString();
                                    }
                                    else
                                    {
                                        userName = userId;
                                    }
                                }
                            }
                            catch { }
                        }

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

                        string updateVariantSql = @"
                            UPDATE product_variants 
                            SET price_piasters = @newPrice, 
                                cost_price_piasters = @newCost, 
                                updated_at = @now 
                            WHERE variant_product_id = @id;
                        ";

                        string insertHistorySql = @"
                            INSERT INTO product_price_history (
                                id, product_id, old_price_piasters, new_price_piasters, 
                                old_cost_piasters, new_cost_piasters, change_reason, created_at,
                                user_id, user_name, batch_id
                            ) VALUES (
                                @histId, @productId, @oldPrice, @newPrice, 
                                @oldCost, @newCost, @reason, @now,
                                @userId, @userName, @batchId
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

                                    try
                                    {
                                        using (var variantCmd = new SQLiteCommand(updateVariantSql, conn, trans))
                                        {
                                            variantCmd.Parameters.AddWithValue("@newPrice", finalPrice);
                                            variantCmd.Parameters.AddWithValue("@newCost", finalCost);
                                            variantCmd.Parameters.AddWithValue("@now", now);
                                            variantCmd.Parameters.AddWithValue("@id", item.ProductId);
                                            variantCmd.ExecuteNonQuery();
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
                                        histCmd.Parameters.AddWithValue("@userId", userId ?? "usr_admin_default");
                                        histCmd.Parameters.AddWithValue("@userName", userName);
                                        histCmd.Parameters.AddWithValue("@batchId", batchId);
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
                                    "{{\"batchId\":\"{0}\",\"updatedCount\":{1},\"reason\":\"{2}\"}}",
                                    batchId,
                                    updatedCount,
                                    (reason ?? "تعديل أسعار جماعي").Replace("\"", "\\\"")
                                );
                                _auditRepo.Log(conn, trans, new AuditLog
                                {
                                    Id = "aud_" + Guid.NewGuid().ToString("N"),
                                    UserId = string.IsNullOrWhiteSpace(userId) ? "usr_admin_default" : userId,
                                    Action = "bulk_price_adjustment",
                                    EntityType = "products",
                                    EntityId = batchId,
                                    DetailsJson = details,
                                    CreatedAt = now
                                });
                            }
                            catch { }
                        }

                        trans.Commit();

                        result.Success = true;
                        result.UpdatedCount = updatedCount;
                        result.BatchId = batchId;
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

        public BulkPriceRevertResult RevertBulkPriceAdjustment(string batchId, string userId)
        {
            var result = new BulkPriceRevertResult();

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        string targetBatchId = batchId;
                        if (string.IsNullOrWhiteSpace(targetBatchId))
                        {
                            using (var findCmd = new SQLiteCommand(@"
                                SELECT batch_id FROM product_price_history 
                                WHERE batch_id IS NOT NULL AND batch_id != '' AND batch_id NOT LIKE 'rev_%'
                                ORDER BY created_at DESC LIMIT 1;
                            ", conn, trans))
                            {
                                object bObj = findCmd.ExecuteScalar();
                                if (bObj != null && bObj != DBNull.Value)
                                {
                                    targetBatchId = bObj.ToString();
                                }
                            }
                        }

                        if (string.IsNullOrWhiteSpace(targetBatchId))
                        {
                            result.Success = false;
                            result.Message = "لم يتم العثور على أي تعديل أسعار جماعي سابق للتراجع عنه";
                            return result;
                        }

                        string revBatchId = "rev_" + targetBatchId;

                        // Check if already reverted
                        using (var checkCmd = new SQLiteCommand("SELECT COUNT(*) FROM product_price_history WHERE batch_id = @revBatchId;", conn, trans))
                        {
                            checkCmd.Parameters.AddWithValue("@revBatchId", revBatchId);
                            long existingRevertCount = Convert.ToInt64(checkCmd.ExecuteScalar());
                            if (existingRevertCount > 0)
                            {
                                result.Success = false;
                                result.BatchId = targetBatchId;
                                result.Message = "تم التراجع عن هذا التعديل مسبقاً ولا يمكن التراجع عنه مرة أخرى";
                                return result;
                            }
                        }

                        // Retrieve original batch records
                        var recordsToRevert = new List<ProductPriceHistory>();
                        using (var fetchCmd = new SQLiteCommand(@"
                            SELECT product_id, old_price_piasters, new_price_piasters, old_cost_piasters, new_cost_piasters, change_reason 
                            FROM product_price_history 
                            WHERE batch_id = @batchId;
                        ", conn, trans))
                        {
                            fetchCmd.Parameters.AddWithValue("@batchId", targetBatchId);
                            using (var reader = fetchCmd.ExecuteReader())
                            {
                                while (reader.Read())
                                {
                                    recordsToRevert.Add(new ProductPriceHistory
                                    {
                                        ProductId = reader["product_id"].ToString(),
                                        OldPricePiasters = Convert.ToInt64(reader["old_price_piasters"]),
                                        NewPricePiasters = Convert.ToInt64(reader["new_price_piasters"]),
                                        OldCostPiasters = Convert.ToInt64(reader["old_cost_piasters"]),
                                        NewCostPiasters = Convert.ToInt64(reader["new_cost_piasters"]),
                                        ChangeReason = reader["change_reason"] != DBNull.Value ? reader["change_reason"].ToString() : ""
                                    });
                                }
                            }
                        }

                        if (recordsToRevert.Count == 0)
                        {
                            result.Success = false;
                            result.BatchId = targetBatchId;
                            result.Message = "لم يتم العثور على سجلات سابقة مرتبطة برقم التعديل: " + targetBatchId;
                            return result;
                        }

                        string userName = "المدير";
                        if (!string.IsNullOrWhiteSpace(userId))
                        {
                            try
                            {
                                using (var uCmd = new SQLiteCommand("SELECT name FROM users WHERE id = @uid LIMIT 1;", conn, trans))
                                {
                                    uCmd.Parameters.AddWithValue("@uid", userId);
                                    object uObj = uCmd.ExecuteScalar();
                                    if (uObj != null && uObj != DBNull.Value && !string.IsNullOrWhiteSpace(uObj.ToString()))
                                    {
                                        userName = uObj.ToString();
                                    }
                                    else
                                    {
                                        userName = userId;
                                    }
                                }
                            }
                            catch { }
                        }

                        string now = DateTime.UtcNow.ToString("o");
                        string updateProductSql = @"
                            UPDATE products 
                            SET price_piasters = @restoredPrice, 
                                cost_piasters = @restoredCost, 
                                updated_at = @now 
                            WHERE id = @id AND is_active = 1;
                        ";

                        string updateBaseUnitSql = @"
                            UPDATE product_units 
                            SET sell_price_piasters = @restoredPrice, 
                                cost_price_piasters = @restoredCost, 
                                updated_at = @now 
                            WHERE product_id = @id AND is_base_unit = 1;
                        ";

                        string updateVariantSql = @"
                            UPDATE product_variants 
                            SET price_piasters = @restoredPrice, 
                                cost_price_piasters = @restoredCost, 
                                updated_at = @now 
                            WHERE variant_product_id = @id;
                        ";

                        string insertHistorySql = @"
                            INSERT INTO product_price_history (
                                id, product_id, old_price_piasters, new_price_piasters, 
                                old_cost_piasters, new_cost_piasters, change_reason, created_at,
                                user_id, user_name, batch_id
                            ) VALUES (
                                @histId, @productId, @curPrice, @restoredPrice, 
                                @curCost, @restoredCost, @reason, @now,
                                @userId, @userName, @batchId
                            );
                        ";

                        int revertedCount = 0;
                        foreach (var record in recordsToRevert)
                        {
                            using (var cmd = new SQLiteCommand(updateProductSql, conn, trans))
                            {
                                cmd.Parameters.AddWithValue("@restoredPrice", record.OldPricePiasters);
                                cmd.Parameters.AddWithValue("@restoredCost", record.OldCostPiasters);
                                cmd.Parameters.AddWithValue("@now", now);
                                cmd.Parameters.AddWithValue("@id", record.ProductId);
                                int affected = cmd.ExecuteNonQuery();
                                if (affected > 0)
                                {
                                    revertedCount++;

                                    try
                                    {
                                        using (var unitCmd = new SQLiteCommand(updateBaseUnitSql, conn, trans))
                                        {
                                            unitCmd.Parameters.AddWithValue("@restoredPrice", record.OldPricePiasters);
                                            unitCmd.Parameters.AddWithValue("@restoredCost", record.OldCostPiasters);
                                            unitCmd.Parameters.AddWithValue("@now", now);
                                            unitCmd.Parameters.AddWithValue("@id", record.ProductId);
                                            unitCmd.ExecuteNonQuery();
                                        }
                                    }
                                    catch { }

                                    try
                                    {
                                        using (var varCmd = new SQLiteCommand(updateVariantSql, conn, trans))
                                        {
                                            varCmd.Parameters.AddWithValue("@restoredPrice", record.OldPricePiasters);
                                            varCmd.Parameters.AddWithValue("@restoredCost", record.OldCostPiasters);
                                            varCmd.Parameters.AddWithValue("@now", now);
                                            varCmd.Parameters.AddWithValue("@id", record.ProductId);
                                            varCmd.ExecuteNonQuery();
                                        }
                                    }
                                    catch { }

                                    using (var histCmd = new SQLiteCommand(insertHistorySql, conn, trans))
                                    {
                                        histCmd.Parameters.AddWithValue("@histId", "ph_" + Guid.NewGuid().ToString("N"));
                                        histCmd.Parameters.AddWithValue("@productId", record.ProductId);
                                        histCmd.Parameters.AddWithValue("@curPrice", record.NewPricePiasters);
                                        histCmd.Parameters.AddWithValue("@restoredPrice", record.OldPricePiasters);
                                        histCmd.Parameters.AddWithValue("@curCost", record.NewCostPiasters);
                                        histCmd.Parameters.AddWithValue("@restoredCost", record.OldCostPiasters);
                                        histCmd.Parameters.AddWithValue("@reason", "تراجع عن تعديل الأسعار الجماعي (" + (record.ChangeReason ?? "") + ")");
                                        histCmd.Parameters.AddWithValue("@now", now);
                                        histCmd.Parameters.AddWithValue("@userId", userId ?? "usr_admin_default");
                                        histCmd.Parameters.AddWithValue("@userName", userName);
                                        histCmd.Parameters.AddWithValue("@batchId", revBatchId);
                                        histCmd.ExecuteNonQuery();
                                    }
                                }
                            }
                        }

                        // Mark original batch items as reverted
                        using (var markCmd = new SQLiteCommand("UPDATE product_price_history SET change_reason = change_reason || ' [تم التراجع]' WHERE batch_id = @batchId;", conn, trans))
                        {
                            markCmd.Parameters.AddWithValue("@batchId", targetBatchId);
                            markCmd.ExecuteNonQuery();
                        }

                        if (_auditRepo != null && revertedCount > 0)
                        {
                            try
                            {
                                string details = string.Format(
                                    "{{\"revertedBatchId\":\"{0}\",\"revertedCount\":{1}}}",
                                    targetBatchId,
                                    revertedCount
                                );
                                _auditRepo.Log(conn, trans, new AuditLog
                                {
                                    Id = "aud_" + Guid.NewGuid().ToString("N"),
                                    UserId = string.IsNullOrWhiteSpace(userId) ? "usr_admin_default" : userId,
                                    Action = "bulk_price_adjustment_revert",
                                    EntityType = "products",
                                    EntityId = targetBatchId,
                                    DetailsJson = details,
                                    CreatedAt = now
                                });
                            }
                            catch { }
                        }

                        trans.Commit();

                        result.Success = true;
                        result.RevertedCount = revertedCount;
                        result.BatchId = targetBatchId;
                        result.Message = string.Format("تم التراجع عن تعديل الأسعار بنجاح وإعادة {0} صنف لأسعارها السابقة", revertedCount);
                        return result;
                    }
                    catch (Exception ex)
                    {
                        trans.Rollback();
                        Common.Logger.Error("فشل التراجع عن التعديل الجماعي للأسعار", ex);
                        throw;
                    }
                }
            }
        }
    }
}
