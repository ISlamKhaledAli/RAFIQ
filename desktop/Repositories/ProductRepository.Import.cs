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
                        // 1. Preload categories map (exact name & normalized name)
                        var categoryMap = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                        var normalizedCategoryMap = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                        using (var catCmd = new SQLiteCommand("SELECT id, name FROM categories;", conn, trans))
                        {
                            using (var catReader = catCmd.ExecuteReader())
                            {
                                while (catReader.Read())
                                {
                                    string cName = catReader["name"].ToString().Trim();
                                    string cId = catReader["id"].ToString();
                                    categoryMap[cName] = cId;
                                    string normCName = ArabicTextNormalizer.Normalize(cName);
                                    if (!string.IsNullOrEmpty(normCName) && !normalizedCategoryMap.ContainsKey(normCName))
                                    {
                                        normalizedCategoryMap[normCName] = cId;
                                    }
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

                        // 3. Preload existing products by name + variant for deduplication when barcode is missing
                        var existingNameVariantMap = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                        using (var prodCmd = new SQLiteCommand("SELECT id, name, normalized_name, variant_color, variant_size FROM products;", conn, trans))
                        {
                            using (var prodReader = prodCmd.ExecuteReader())
                            {
                                while (prodReader.Read())
                                {
                                    string pid = prodReader["id"].ToString();
                                    string normName = prodReader["normalized_name"] != DBNull.Value ? prodReader["normalized_name"].ToString() : ArabicTextNormalizer.Normalize(prodReader["name"].ToString());
                                    string vColor = prodReader["variant_color"] != DBNull.Value ? prodReader["variant_color"].ToString().Trim() : "";
                                    string vSize = prodReader["variant_size"] != DBNull.Value ? prodReader["variant_size"].ToString().Trim() : "";
                                    string key = string.Format("{0}||{1}||{2}", normName, vColor, vSize);
                                    if (!existingNameVariantMap.ContainsKey(key))
                                    {
                                        existingNameVariantMap[key] = pid;
                                    }
                                }
                            }
                        }

                        // 4. Preload inactive/archived products so if an imported row matches a deleted item, it gets restored & reactivated!
                        var inactiveProductIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                        using (var inactCmd = new SQLiteCommand("SELECT id FROM products WHERE is_active = 0;", conn, trans))
                        {
                            using (var inactReader = inactCmd.ExecuteReader())
                            {
                                while (inactReader.Read())
                                {
                                    inactiveProductIds.Add(inactReader["id"].ToString());
                                }
                            }
                        }

                        string now = DateTime.UtcNow.ToString("o");

                        string insertProdSql = @"
                            INSERT INTO products (
                                id, barcode, internal_code, name, normalized_name, category_id, price_piasters, cost_piasters,
                                stock_quantity_milli, min_stock_quantity_milli, unit, tax_rate_percent, tax_category_code,
                                variant_color, variant_size, is_active, created_at, updated_at
                            ) VALUES (
                                @id, @barcode, @internalCode, @name, @normName, @categoryId, @price, @cost,
                                @stock, @minStock, @unit, @tax, @taxCategoryCode,
                                @color, @size, 1, @now, @now
                            );
                        ";

                        string updateProdSql = @"
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
                                variant_color = @color,
                                variant_size = @size,
                                is_active = 1,
                                updated_at = @now
                            WHERE id = @pid;
                        ";

                        string insertSmSql = @"
                            INSERT INTO stock_movements (
                                id, product_id, movement_type, quantity_milli, reference_id, reference_type,
                                unit_cost_piasters, note, batch_number, created_at
                            ) VALUES (
                                @smId, @smPid, @smType, @smQty, 'EXCEL_IMPORT', @smRefType,
                                @smCost, @smNote, NULL, @now
                            );
                        ";

                        string insUnitSql = @"
                            INSERT OR IGNORE INTO product_units (
                                id, product_id, unit_name, conversion_factor, is_base_unit,
                                sell_price_piasters, cost_price_piasters, barcode, is_divisible,
                                sort_order, created_at, updated_at
                            ) VALUES (
                                @id, @productId, @unitName, 1, 1,
                                @sellPrice, @costPrice, @barcode, @isDivisible,
                                0, @now, @now
                            );
                        ";

                        string updUnitSql = @"
                            UPDATE product_units
                            SET sell_price_piasters = @price,
                                cost_price_piasters = @cost,
                                updated_at = @now
                            WHERE product_id = @pid AND is_base_unit = 1;
                        ";

                        using (var insProdCmd = new SQLiteCommand(insertProdSql, conn, trans))
                        using (var updProdCmd = new SQLiteCommand(updateProdSql, conn, trans))
                        using (var insSmCmd = new SQLiteCommand(insertSmSql, conn, trans))
                        using (var insUnitCmd = new SQLiteCommand(insUnitSql, conn, trans))
                        using (var updUnitCmd = new SQLiteCommand(updUnitSql, conn, trans))
                        using (var insBcCmd = new SQLiteCommand("INSERT OR IGNORE INTO product_barcodes (id, product_id, barcode, created_at) VALUES (@pbid, @pid, @bc, @now);", conn, trans))
                        using (var insCatCmd = new SQLiteCommand("INSERT INTO categories (id, name, display_order, is_active, created_at, updated_at) VALUES (@cid, @cname, 0, 1, @cdate, @cdate);", conn, trans))
                        using (var getOldCmd = new SQLiteCommand("SELECT stock_quantity_milli FROM products WHERE id = @pid LIMIT 1;", conn, trans))
                        {
                            // Initialize parameters
                            insProdCmd.Parameters.Add("@id", System.Data.DbType.String);
                            insProdCmd.Parameters.Add("@barcode", System.Data.DbType.String);
                            insProdCmd.Parameters.Add("@internalCode", System.Data.DbType.String);
                            insProdCmd.Parameters.Add("@name", System.Data.DbType.String);
                            insProdCmd.Parameters.Add("@normName", System.Data.DbType.String);
                            insProdCmd.Parameters.Add("@categoryId", System.Data.DbType.String);
                            insProdCmd.Parameters.Add("@price", System.Data.DbType.Int64);
                            insProdCmd.Parameters.Add("@cost", System.Data.DbType.Int64);
                            insProdCmd.Parameters.Add("@stock", System.Data.DbType.Int64);
                            insProdCmd.Parameters.Add("@minStock", System.Data.DbType.Int64);
                            insProdCmd.Parameters.Add("@unit", System.Data.DbType.String);
                            insProdCmd.Parameters.Add("@tax", System.Data.DbType.Double);
                            insProdCmd.Parameters.Add("@taxCategoryCode", System.Data.DbType.String);
                            insProdCmd.Parameters.Add("@color", System.Data.DbType.String);
                            insProdCmd.Parameters.Add("@size", System.Data.DbType.String);
                            insProdCmd.Parameters.Add("@now", System.Data.DbType.String);

                            updProdCmd.Parameters.Add("@pid", System.Data.DbType.String);
                            updProdCmd.Parameters.Add("@name", System.Data.DbType.String);
                            updProdCmd.Parameters.Add("@normName", System.Data.DbType.String);
                            updProdCmd.Parameters.Add("@categoryId", System.Data.DbType.String);
                            updProdCmd.Parameters.Add("@price", System.Data.DbType.Int64);
                            updProdCmd.Parameters.Add("@cost", System.Data.DbType.Int64);
                            updProdCmd.Parameters.Add("@stock", System.Data.DbType.Int64);
                            updProdCmd.Parameters.Add("@minStock", System.Data.DbType.Int64);
                            updProdCmd.Parameters.Add("@unit", System.Data.DbType.String);
                            updProdCmd.Parameters.Add("@tax", System.Data.DbType.Double);
                            updProdCmd.Parameters.Add("@internalCode", System.Data.DbType.String);
                            updProdCmd.Parameters.Add("@taxCategoryCode", System.Data.DbType.String);
                            updProdCmd.Parameters.Add("@color", System.Data.DbType.String);
                            updProdCmd.Parameters.Add("@size", System.Data.DbType.String);
                            updProdCmd.Parameters.Add("@now", System.Data.DbType.String);

                            insSmCmd.Parameters.Add("@smId", System.Data.DbType.String);
                            insSmCmd.Parameters.Add("@smPid", System.Data.DbType.String);
                            insSmCmd.Parameters.Add("@smType", System.Data.DbType.String);
                            insSmCmd.Parameters.Add("@smQty", System.Data.DbType.Int64);
                            insSmCmd.Parameters.Add("@smRefType", System.Data.DbType.String);
                            insSmCmd.Parameters.Add("@smCost", System.Data.DbType.Int64);
                            insSmCmd.Parameters.Add("@smNote", System.Data.DbType.String);
                            insSmCmd.Parameters.Add("@now", System.Data.DbType.String);

                            insUnitCmd.Parameters.Add("@id", System.Data.DbType.String);
                            insUnitCmd.Parameters.Add("@productId", System.Data.DbType.String);
                            insUnitCmd.Parameters.Add("@unitName", System.Data.DbType.String);
                            insUnitCmd.Parameters.Add("@sellPrice", System.Data.DbType.Int64);
                            insUnitCmd.Parameters.Add("@costPrice", System.Data.DbType.Int64);
                            insUnitCmd.Parameters.Add("@barcode", System.Data.DbType.String);
                            insUnitCmd.Parameters.Add("@isDivisible", System.Data.DbType.Int32);
                            insUnitCmd.Parameters.Add("@now", System.Data.DbType.String);

                            updUnitCmd.Parameters.Add("@pid", System.Data.DbType.String);
                            updUnitCmd.Parameters.Add("@price", System.Data.DbType.Int64);
                            updUnitCmd.Parameters.Add("@cost", System.Data.DbType.Int64);
                            updUnitCmd.Parameters.Add("@now", System.Data.DbType.String);

                            insBcCmd.Parameters.Add("@pbid", System.Data.DbType.String);
                            insBcCmd.Parameters.Add("@pid", System.Data.DbType.String);
                            insBcCmd.Parameters.Add("@bc", System.Data.DbType.String);
                            insBcCmd.Parameters.Add("@now", System.Data.DbType.String);

                            insCatCmd.Parameters.Add("@cid", System.Data.DbType.String);
                            insCatCmd.Parameters.Add("@cname", System.Data.DbType.String);
                            insCatCmd.Parameters.Add("@cdate", System.Data.DbType.String);

                            getOldCmd.Parameters.Add("@pid", System.Data.DbType.String);

                            foreach (var item in items)
                            {
                                if (string.IsNullOrWhiteSpace(item.Name))
                                {
                                    continue;
                                }

                                // Financial sanity: clamp negative prices/costs to zero
                                if (item.PricePiasters < 0) item.PricePiasters = 0;
                                if (item.CostPiasters < 0) item.CostPiasters = 0;

                                // Resolve category with Arabic normalization to prevent duplicate categories
                                string categoryId = item.CategoryId;
                                if (string.IsNullOrWhiteSpace(categoryId))
                                {
                                    string catName = !string.IsNullOrWhiteSpace(item.CategoryName) ? item.CategoryName.Trim() : "عام";
                                    string normCatName = ArabicTextNormalizer.Normalize(catName);

                                    if (categoryMap.ContainsKey(catName))
                                    {
                                        categoryId = categoryMap[catName];
                                    }
                                    else if (!string.IsNullOrEmpty(normCatName) && normalizedCategoryMap.ContainsKey(normCatName))
                                    {
                                        categoryId = normalizedCategoryMap[normCatName];
                                    }
                                    else
                                    {
                                        categoryId = "cat_" + Guid.NewGuid().ToString("N").Substring(0, 8);
                                        insCatCmd.Parameters["@cid"].Value = categoryId;
                                        insCatCmd.Parameters["@cname"].Value = catName;
                                        insCatCmd.Parameters["@cdate"].Value = now;
                                        insCatCmd.ExecuteNonQuery();

                                        categoryMap[catName] = categoryId;
                                        if (!string.IsNullOrEmpty(normCatName))
                                        {
                                            normalizedCategoryMap[normCatName] = categoryId;
                                        }
                                    }
                                }

                                string cleanColor = !string.IsNullOrWhiteSpace(item.VariantColor) ? item.VariantColor.Trim() : "";
                                string cleanSize = !string.IsNullOrWhiteSpace(item.VariantSize) ? item.VariantSize.Trim() : "";
                                string itemNormName = ArabicTextNormalizer.Normalize(item.Name ?? "");
                                string nameVariantKey = string.Format("{0}||{1}||{2}", itemNormName, cleanColor, cleanSize);

                                // Check duplicate barcode or duplicate (name + color + size)
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

                                // If not matched by barcode, check if exact name and variant match already exists
                                if (existingProductId == null && existingNameVariantMap.ContainsKey(nameVariantKey))
                                {
                                    existingProductId = existingNameVariantMap[nameVariantKey];
                                }

                                if (existingProductId != null)
                                {
                                    bool isArchived = inactiveProductIds.Contains(existingProductId);

                                    if (isArchived)
                                    {
                                        // Product was previously deleted (is_active = 0).
                                        // Reactivate and restore it with imported data!
                                        long oldStock = 0;
                                        getOldCmd.Parameters["@pid"].Value = existingProductId;
                                        var oldVal = getOldCmd.ExecuteScalar();
                                        if (oldVal != null && oldVal != DBNull.Value)
                                        {
                                            oldStock = Convert.ToInt64(oldVal);
                                        }

                                        // Update existing product and set is_active = 1
                                        updProdCmd.Parameters["@pid"].Value = existingProductId;
                                        updProdCmd.Parameters["@name"].Value = item.Name.Trim();
                                        updProdCmd.Parameters["@normName"].Value = itemNormName;
                                        updProdCmd.Parameters["@categoryId"].Value = (object)categoryId ?? DBNull.Value;
                                        updProdCmd.Parameters["@price"].Value = item.PricePiasters;
                                        updProdCmd.Parameters["@cost"].Value = item.CostPiasters;
                                        updProdCmd.Parameters["@stock"].Value = item.StockQuantityMilli;
                                        updProdCmd.Parameters["@minStock"].Value = item.MinStockQuantityMilli;
                                        updProdCmd.Parameters["@unit"].Value = item.Unit ?? "piece";
                                        updProdCmd.Parameters["@tax"].Value = item.TaxRatePercent;
                                        updProdCmd.Parameters["@internalCode"].Value = (object)item.InternalCode ?? "";
                                        updProdCmd.Parameters["@taxCategoryCode"].Value = (object)item.TaxCategoryCode ?? "";
                                        updProdCmd.Parameters["@color"].Value = !string.IsNullOrEmpty(cleanColor) ? (object)cleanColor : DBNull.Value;
                                        updProdCmd.Parameters["@size"].Value = !string.IsNullOrEmpty(cleanSize) ? (object)cleanSize : DBNull.Value;
                                        updProdCmd.Parameters["@now"].Value = now;
                                        updProdCmd.ExecuteNonQuery();

                                        if (item.StockQuantityMilli != 0)
                                        {
                                            insSmCmd.Parameters["@smId"].Value = Guid.NewGuid().ToString();
                                            insSmCmd.Parameters["@smPid"].Value = existingProductId;
                                            insSmCmd.Parameters["@smType"].Value = "INITIAL";
                                            insSmCmd.Parameters["@smQty"].Value = item.StockQuantityMilli;
                                            insSmCmd.Parameters["@smRefType"].Value = "RESTORE_IMPORT";
                                            insSmCmd.Parameters["@smCost"].Value = item.CostPiasters;
                                            insSmCmd.Parameters["@smNote"].Value = "استعادة وتنشيط الصنف من ملف الإكسل";
                                            insSmCmd.Parameters["@now"].Value = now;
                                            insSmCmd.ExecuteNonQuery();
                                        }

                                        // Synchronize base unit in product_units
                                        try
                                        {
                                            updUnitCmd.Parameters["@pid"].Value = existingProductId;
                                            updUnitCmd.Parameters["@price"].Value = item.PricePiasters;
                                            updUnitCmd.Parameters["@cost"].Value = item.CostPiasters;
                                            updUnitCmd.Parameters["@now"].Value = now;
                                            int rows = updUnitCmd.ExecuteNonQuery();
                                            if (rows == 0)
                                            {
                                                string uName = !string.IsNullOrWhiteSpace(item.Unit) ? item.Unit.Trim() : "قطعة";
                                                bool isDiv = uName.Equals("kg", StringComparison.OrdinalIgnoreCase) ||
                                                             uName.Equals("كيلو", StringComparison.OrdinalIgnoreCase) ||
                                                             uName.Equals("كجم", StringComparison.OrdinalIgnoreCase);

                                                insUnitCmd.Parameters["@id"].Value = "punit_" + existingProductId;
                                                insUnitCmd.Parameters["@productId"].Value = existingProductId;
                                                insUnitCmd.Parameters["@unitName"].Value = uName;
                                                insUnitCmd.Parameters["@sellPrice"].Value = item.PricePiasters;
                                                insUnitCmd.Parameters["@costPrice"].Value = item.CostPiasters;
                                                insUnitCmd.Parameters["@barcode"].Value = string.IsNullOrWhiteSpace(primaryBarcode) ? (object)DBNull.Value : primaryBarcode;
                                                insUnitCmd.Parameters["@isDivisible"].Value = isDiv ? 1 : 0;
                                                insUnitCmd.Parameters["@now"].Value = now;
                                                insUnitCmd.ExecuteNonQuery();
                                            }
                                        }
                                        catch { }

                                        // Insert additional barcodes if provided
                                        if (item.Barcodes != null && item.Barcodes.Count > 0)
                                        {
                                            foreach (var b in item.Barcodes)
                                            {
                                                if (!string.IsNullOrWhiteSpace(b))
                                                {
                                                    string trimmedB = b.Trim();
                                                    if (!string.Equals(trimmedB, primaryBarcode, StringComparison.OrdinalIgnoreCase))
                                                    {
                                                        insBcCmd.Parameters["@pbid"].Value = "pbc_" + Guid.NewGuid().ToString("N");
                                                        insBcCmd.Parameters["@pid"].Value = existingProductId;
                                                        insBcCmd.Parameters["@bc"].Value = trimmedB;
                                                        insBcCmd.Parameters["@now"].Value = now;
                                                        insBcCmd.ExecuteNonQuery();
                                                        existingBarcodeMap[trimmedB] = existingProductId;
                                                    }
                                                }
                                            }
                                        }

                                        inactiveProductIds.Remove(existingProductId);
                                        result.ImportedCount++;
                                        continue;
                                    }

                                    // Active product duplicate handling:
                                    if (strat == "error")
                                    {
                                        string identifier = primaryBarcode != null
                                            ? string.Format("الباركود '{0}'", primaryBarcode)
                                            : string.Format("المنتج '{0}'", item.Name);
                                        throw new InvalidOperationException(string.Format("الصنف {0} مسجل مسبقاً في النظام.", identifier));
                                    }
                                    else if (strat == "update")
                                    {
                                        long oldStock = 0;
                                        getOldCmd.Parameters["@pid"].Value = existingProductId;
                                        var oldVal = getOldCmd.ExecuteScalar();
                                        if (oldVal != null && oldVal != DBNull.Value)
                                        {
                                            oldStock = Convert.ToInt64(oldVal);
                                        }
                                        long deltaStock = item.StockQuantityMilli - oldStock;

                                        // Update existing product including variant_color and variant_size
                                        updProdCmd.Parameters["@pid"].Value = existingProductId;
                                        updProdCmd.Parameters["@name"].Value = item.Name.Trim();
                                        updProdCmd.Parameters["@normName"].Value = itemNormName;
                                        updProdCmd.Parameters["@categoryId"].Value = (object)categoryId ?? DBNull.Value;
                                        updProdCmd.Parameters["@price"].Value = item.PricePiasters;
                                        updProdCmd.Parameters["@cost"].Value = item.CostPiasters;
                                        updProdCmd.Parameters["@stock"].Value = item.StockQuantityMilli;
                                        updProdCmd.Parameters["@minStock"].Value = item.MinStockQuantityMilli;
                                        updProdCmd.Parameters["@unit"].Value = item.Unit ?? "piece";
                                        updProdCmd.Parameters["@tax"].Value = item.TaxRatePercent;
                                        updProdCmd.Parameters["@internalCode"].Value = (object)item.InternalCode ?? "";
                                        updProdCmd.Parameters["@taxCategoryCode"].Value = (object)item.TaxCategoryCode ?? "";
                                        updProdCmd.Parameters["@color"].Value = !string.IsNullOrEmpty(cleanColor) ? (object)cleanColor : DBNull.Value;
                                        updProdCmd.Parameters["@size"].Value = !string.IsNullOrEmpty(cleanSize) ? (object)cleanSize : DBNull.Value;
                                        updProdCmd.Parameters["@now"].Value = now;
                                        updProdCmd.ExecuteNonQuery();

                                        if (deltaStock != 0)
                                        {
                                            insSmCmd.Parameters["@smId"].Value = Guid.NewGuid().ToString();
                                            insSmCmd.Parameters["@smPid"].Value = existingProductId;
                                            insSmCmd.Parameters["@smType"].Value = "ADJUSTMENT";
                                            insSmCmd.Parameters["@smQty"].Value = deltaStock;
                                            insSmCmd.Parameters["@smRefType"].Value = "IMPORT_UPDATE";
                                            insSmCmd.Parameters["@smCost"].Value = item.CostPiasters;
                                            insSmCmd.Parameters["@smNote"].Value = "تسوية رصيد ناتجة عن تحديث ملف إكسل";
                                            insSmCmd.Parameters["@now"].Value = now;
                                            insSmCmd.ExecuteNonQuery();
                                        }

                                        // Synchronize base unit in product_units
                                        try
                                        {
                                            updUnitCmd.Parameters["@pid"].Value = existingProductId;
                                            updUnitCmd.Parameters["@price"].Value = item.PricePiasters;
                                            updUnitCmd.Parameters["@cost"].Value = item.CostPiasters;
                                            updUnitCmd.Parameters["@now"].Value = now;
                                            updUnitCmd.ExecuteNonQuery();
                                        }
                                        catch { }

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
                                    uint hash = (uint)newId.GetHashCode();
                                    do
                                    {
                                        primaryBarcode = "200" + (hash % 1000000000U).ToString("D9");
                                        hash++;
                                    } while (existingBarcodeMap.ContainsKey(primaryBarcode));
                                }

                                insProdCmd.Parameters["@id"].Value = newId;
                                insProdCmd.Parameters["@barcode"].Value = primaryBarcode;
                                insProdCmd.Parameters["@internalCode"].Value = (object)item.InternalCode ?? "";
                                insProdCmd.Parameters["@name"].Value = item.Name.Trim();
                                insProdCmd.Parameters["@normName"].Value = itemNormName;
                                insProdCmd.Parameters["@categoryId"].Value = (object)categoryId ?? DBNull.Value;
                                insProdCmd.Parameters["@price"].Value = item.PricePiasters;
                                insProdCmd.Parameters["@cost"].Value = item.CostPiasters;
                                insProdCmd.Parameters["@stock"].Value = item.StockQuantityMilli;
                                insProdCmd.Parameters["@minStock"].Value = item.MinStockQuantityMilli;
                                insProdCmd.Parameters["@unit"].Value = item.Unit ?? "piece";
                                insProdCmd.Parameters["@tax"].Value = item.TaxRatePercent;
                                insProdCmd.Parameters["@taxCategoryCode"].Value = (object)item.TaxCategoryCode ?? "";
                                insProdCmd.Parameters["@color"].Value = !string.IsNullOrEmpty(cleanColor) ? (object)cleanColor : DBNull.Value;
                                insProdCmd.Parameters["@size"].Value = !string.IsNullOrEmpty(cleanSize) ? (object)cleanSize : DBNull.Value;
                                insProdCmd.Parameters["@now"].Value = now;
                                insProdCmd.ExecuteNonQuery();

                                existingBarcodeMap[primaryBarcode] = newId;
                                existingNameVariantMap[nameVariantKey] = newId;

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
                                                insBcCmd.Parameters["@pbid"].Value = "pbc_" + Guid.NewGuid().ToString("N");
                                                insBcCmd.Parameters["@pid"].Value = newId;
                                                insBcCmd.Parameters["@bc"].Value = trimmedB;
                                                insBcCmd.Parameters["@now"].Value = now;
                                                insBcCmd.ExecuteNonQuery();

                                                existingBarcodeMap[trimmedB] = newId;
                                            }
                                        }
                                    }
                                }

                                // Synchronize base unit in product_units
                                try
                                {
                                    string uName = !string.IsNullOrWhiteSpace(item.Unit) ? item.Unit.Trim() : "قطعة";
                                    bool isDiv = uName.Equals("kg", StringComparison.OrdinalIgnoreCase) ||
                                                 uName.Equals("كيلو", StringComparison.OrdinalIgnoreCase) ||
                                                 uName.Equals("كجم", StringComparison.OrdinalIgnoreCase);

                                    insUnitCmd.Parameters["@id"].Value = "punit_" + newId;
                                    insUnitCmd.Parameters["@productId"].Value = newId;
                                    insUnitCmd.Parameters["@unitName"].Value = uName;
                                    insUnitCmd.Parameters["@sellPrice"].Value = item.PricePiasters;
                                    insUnitCmd.Parameters["@costPrice"].Value = item.CostPiasters;
                                    insUnitCmd.Parameters["@barcode"].Value = string.IsNullOrWhiteSpace(primaryBarcode) ? (object)DBNull.Value : primaryBarcode;
                                    insUnitCmd.Parameters["@isDivisible"].Value = isDiv ? 1 : 0;
                                    insUnitCmd.Parameters["@now"].Value = now;
                                    insUnitCmd.ExecuteNonQuery();
                                }
                                catch { }

                                // Record Initial Stock Movement (Task 21-5 & Feature #35)
                                if (item.StockQuantityMilli != 0)
                                {
                                    insSmCmd.Parameters["@smId"].Value = Guid.NewGuid().ToString();
                                    insSmCmd.Parameters["@smPid"].Value = newId;
                                    insSmCmd.Parameters["@smType"].Value = "INITIAL";
                                    insSmCmd.Parameters["@smQty"].Value = item.StockQuantityMilli;
                                    insSmCmd.Parameters["@smRefType"].Value = "INITIAL_IMPORT";
                                    insSmCmd.Parameters["@smCost"].Value = item.CostPiasters;
                                    insSmCmd.Parameters["@smNote"].Value = "رصيد افتتاحي مسجل من استيراد إكسل";
                                    insSmCmd.Parameters["@now"].Value = now;
                                    insSmCmd.ExecuteNonQuery();
                                }

                                result.ImportedCount++;
                            }
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
