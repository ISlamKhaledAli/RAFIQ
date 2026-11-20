using System;
using System.Collections.Generic;
using System.Data.SQLite;
using RafiqPOS.Models;

namespace RafiqPOS.Repositories
{
    public partial class ProductRepository
    {
        public bool UpdateOnlineFields(string productId, bool isOnline, bool isFeatured, string onlineDescription, long? comparePricePiasters)
        {
            if (string.IsNullOrWhiteSpace(productId)) return false;

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    UPDATE products
                    SET is_online = @isOnline,
                        is_featured = @isFeatured,
                        online_description = @onlineDesc,
                        compare_price_piasters = @comparePrice,
                        updated_at = datetime('now')
                    WHERE id = @id;
                ";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@isOnline", isOnline ? 1 : 0);
                    cmd.Parameters.AddWithValue("@isFeatured", isFeatured ? 1 : 0);
                    cmd.Parameters.AddWithValue("@onlineDesc", (object)onlineDescription ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@comparePrice", comparePricePiasters.HasValue ? (object)comparePricePiasters.Value : DBNull.Value);
                    cmd.Parameters.AddWithValue("@id", productId);
                    return cmd.ExecuteNonQuery() > 0;
                }
            }
        }

        public List<Product> GetProductsForCloudSync(bool onlyOnline = false, bool onlyInStock = false, List<string> categoryIds = null, List<string> excludedProductIds = null, List<string> selectedProductIds = null)
        {
            var list = new List<Product>();
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    SELECT p.*, COALESCE(c.name, 'عام') AS category_name
                    FROM products p
                    LEFT JOIN categories c ON p.category_id = c.id
                    WHERE p.is_active = 1
                      AND p.id NOT LIKE 'demo_%'
                      AND p.id NOT LIKE 'stress_%'
                ";
                if (onlyOnline)
                {
                    sql += " AND COALESCE(p.is_online, 1) = 1 ";
                }
                if (onlyInStock)
                {
                    sql += " AND COALESCE(p.stock_quantity_milli, 0) > 0 ";
                }
                if (categoryIds != null && categoryIds.Count > 0)
                {
                    var catParams = new List<string>();
                    for (int i = 0; i < categoryIds.Count; i++)
                    {
                        catParams.Add("@cat" + i);
                    }
                    sql += " AND p.category_id IN (" + string.Join(",", catParams.ToArray()) + ") ";
                }
                if (excludedProductIds != null && excludedProductIds.Count > 0)
                {
                    var exParams = new List<string>();
                    for (int i = 0; i < excludedProductIds.Count; i++)
                    {
                        exParams.Add("@ex" + i);
                    }
                    sql += " AND p.id NOT IN (" + string.Join(",", exParams.ToArray()) + ") ";
                }
                if (selectedProductIds != null && selectedProductIds.Count > 0)
                {
                    var selParams = new List<string>();
                    for (int i = 0; i < selectedProductIds.Count; i++)
                    {
                        selParams.Add("@sel" + i);
                    }
                    sql += " AND p.id IN (" + string.Join(",", selParams.ToArray()) + ") ";
                }
                sql += " ORDER BY p.name ASC;";

                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    if (categoryIds != null && categoryIds.Count > 0)
                    {
                        for (int i = 0; i < categoryIds.Count; i++)
                        {
                            cmd.Parameters.AddWithValue("@cat" + i, categoryIds[i]);
                        }
                    }
                    if (excludedProductIds != null && excludedProductIds.Count > 0)
                    {
                        for (int i = 0; i < excludedProductIds.Count; i++)
                        {
                            cmd.Parameters.AddWithValue("@ex" + i, excludedProductIds[i]);
                        }
                    }
                    if (selectedProductIds != null && selectedProductIds.Count > 0)
                    {
                        for (int i = 0; i < selectedProductIds.Count; i++)
                        {
                            cmd.Parameters.AddWithValue("@sel" + i, selectedProductIds[i]);
                        }
                    }
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            list.Add(MapReaderToProduct(reader));
                        }
                    }
                }
            }
            return list;
        }

        public int CountProductsForCloudSync(bool onlyOnline = false, bool onlyInStock = false, List<string> categoryIds = null, List<string> excludedProductIds = null, List<string> selectedProductIds = null)
        {
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    SELECT COUNT(*)
                    FROM products p
                    WHERE p.is_active = 1
                      AND p.id NOT LIKE 'demo_%'
                      AND p.id NOT LIKE 'stress_%'
                ";
                if (onlyOnline)
                {
                    sql += " AND COALESCE(p.is_online, 1) = 1 ";
                }
                if (onlyInStock)
                {
                    sql += " AND COALESCE(p.stock_quantity_milli, 0) > 0 ";
                }
                if (categoryIds != null && categoryIds.Count > 0)
                {
                    var catParams = new List<string>();
                    for (int i = 0; i < categoryIds.Count; i++)
                    {
                        catParams.Add("@cat" + i);
                    }
                    sql += " AND p.category_id IN (" + string.Join(",", catParams.ToArray()) + ") ";
                }
                if (excludedProductIds != null && excludedProductIds.Count > 0)
                {
                    var exParams = new List<string>();
                    for (int i = 0; i < excludedProductIds.Count; i++)
                    {
                        exParams.Add("@ex" + i);
                    }
                    sql += " AND p.id NOT IN (" + string.Join(",", exParams.ToArray()) + ") ";
                }
                if (selectedProductIds != null && selectedProductIds.Count > 0)
                {
                    var selParams = new List<string>();
                    for (int i = 0; i < selectedProductIds.Count; i++)
                    {
                        selParams.Add("@sel" + i);
                    }
                    sql += " AND p.id IN (" + string.Join(",", selParams.ToArray()) + ") ";
                }

                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    if (categoryIds != null && categoryIds.Count > 0)
                    {
                        for (int i = 0; i < categoryIds.Count; i++)
                        {
                            cmd.Parameters.AddWithValue("@cat" + i, categoryIds[i]);
                        }
                    }
                    if (excludedProductIds != null && excludedProductIds.Count > 0)
                    {
                        for (int i = 0; i < excludedProductIds.Count; i++)
                        {
                            cmd.Parameters.AddWithValue("@ex" + i, excludedProductIds[i]);
                        }
                    }
                    if (selectedProductIds != null && selectedProductIds.Count > 0)
                    {
                        for (int i = 0; i < selectedProductIds.Count; i++)
                        {
                            cmd.Parameters.AddWithValue("@sel" + i, selectedProductIds[i]);
                        }
                    }
                    object res = cmd.ExecuteScalar();
                    return res != null && res != DBNull.Value ? Convert.ToInt32(res) : 0;
                }
            }
        }

        /// <summary>
        /// Applies catalog updates (descriptions, is_online, is_featured) pulled from the Cloud/Web Dashboard
        /// into the local SQLite database in an atomic transaction.
        /// </summary>
        public int ApplyCloudCatalogUpdates(List<CloudCatalogProductDelta> deltas)
        {
            if (deltas == null || deltas.Count == 0) return 0;

            int updated = 0;
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        string sql = @"
                            UPDATE products
                            SET online_description = CASE 
                                    WHEN @hasDesc = 1 THEN @onlineDesc 
                                    ELSE online_description 
                                END,
                                is_online = @isOnline,
                                is_featured = @isFeatured,
                                updated_at = datetime('now')
                            WHERE id = @id;
                        ";

                        using (var cmd = new SQLiteCommand(sql, conn, trans))
                        {
                            cmd.Parameters.Add("@hasDesc", System.Data.DbType.Int32);
                            cmd.Parameters.Add("@onlineDesc", System.Data.DbType.String);
                            cmd.Parameters.Add("@isOnline", System.Data.DbType.Int32);
                            cmd.Parameters.Add("@isFeatured", System.Data.DbType.Int32);
                            cmd.Parameters.Add("@id", System.Data.DbType.String);

                            for (int i = 0; i < deltas.Count; i++)
                            {
                                var d = deltas[i];
                                if (d == null || string.IsNullOrWhiteSpace(d.Id)) continue;

                                bool hasDesc = !string.IsNullOrWhiteSpace(d.Description);
                                cmd.Parameters["@hasDesc"].Value = hasDesc ? 1 : 0;
                                cmd.Parameters["@onlineDesc"].Value = hasDesc ? (object)d.Description : DBNull.Value;
                                cmd.Parameters["@isOnline"].Value = d.IsOnline == 1 ? 1 : 0;
                                cmd.Parameters["@isFeatured"].Value = d.IsFeatured == 1 ? 1 : 0;
                                cmd.Parameters["@id"].Value = d.Id;

                                if (cmd.ExecuteNonQuery() > 0)
                                {
                                    updated++;
                                }
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
            return updated;
        }
    }
}
