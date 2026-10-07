using System;
using System.Collections.Generic;
using System.Data.SQLite;
using RafiqPOS.Common;
using RafiqPOS.Models;

namespace RafiqPOS.Repositories
{
    public partial class ProductRepository
    {
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
                                            normalized_name = @normName,
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
                                        uCmd.Parameters.AddWithValue("@normName", Common.ArabicTextNormalizer.Normalize(item.Name ?? ""));
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
                                    id, barcode, internal_code, name, normalized_name, category_id, price_piasters, cost_piasters,
                                    stock_quantity_milli, min_stock_quantity_milli, unit, tax_rate_percent, tax_category_code, is_active, created_at, updated_at
                                ) VALUES (
                                    @id, @barcode, @internalCode, @name, @normName, @categoryId, @price, @cost,
                                    @stock, @minStock, @unit, @tax, @taxCategoryCode, 1, @now, @now
                                );
                            ";
                            using (var insCmd = new SQLiteCommand(insertSql, conn, trans))
                            {
                                insCmd.Parameters.AddWithValue("@id", newId);
                                insCmd.Parameters.AddWithValue("@barcode", primaryBarcode);
                                insCmd.Parameters.AddWithValue("@internalCode", (object)item.InternalCode ?? "");
                                insCmd.Parameters.AddWithValue("@name", item.Name.Trim());
                                insCmd.Parameters.AddWithValue("@normName", Common.ArabicTextNormalizer.Normalize(item.Name ?? ""));
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

                            // Record Initial Stock Movement (Task 21-5 & Feature #35)
                            if (item.StockQuantityMilli != 0)
                            {
                                string insertSmSql = @"
                                    INSERT INTO stock_movements (
                                        id, product_id, movement_type, quantity_milli, reference_id, reference_type,
                                        unit_cost_piasters, note, batch_number, created_at
                                    ) VALUES (
                                        @smId, @smPid, 'INITIAL', @smQty, 'EXCEL_IMPORT', 'INITIAL_IMPORT',
                                        @smCost, 'رصيد افتتاحي مسجل من استيراد إكسل', NULL, @now
                                    );
                                ";
                                using (var smCmd = new SQLiteCommand(insertSmSql, conn, trans))
                                {
                                    smCmd.Parameters.AddWithValue("@smId", Guid.NewGuid().ToString());
                                    smCmd.Parameters.AddWithValue("@smPid", newId);
                                    smCmd.Parameters.AddWithValue("@smQty", item.StockQuantityMilli);
                                    smCmd.Parameters.AddWithValue("@smCost", item.CostPiasters);
                                    smCmd.Parameters.AddWithValue("@now", now);
                                    smCmd.ExecuteNonQuery();
                                }
                            }

                            result.ImportedCount++;
                        }

                        // Record audit log entry inside transaction with full cryptographic chaining (Feature #169)
                        string details = string.Format("{{\"imported\":{0},\"updated\":{1},\"skipped\":{2},\"total\":{3}}}", result.ImportedCount, result.UpdatedCount, result.SkippedCount, result.TotalRows);
                        _auditRepo.Log(conn, trans, new AuditLog
                        {
                            Id = "aud_" + Guid.NewGuid().ToString("N"),
                            UserId = string.IsNullOrWhiteSpace(userId) ? "usr_admin_default" : userId,
                            Action = "product_import_batch",
                            EntityType = "products",
                            EntityId = "batch",
                            DetailsJson = details,
                            CreatedAt = now
                        });

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
    }
}
