using System;
using System.Collections.Generic;
using RafiqPOS.Data;
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

        public int BulkUpdateTaxRate(int taxRatePercent, bool onlyZeroOrNull)
        {
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        string sql = onlyZeroOrNull
                            ? "UPDATE products SET tax_rate_percent = @rate, updated_at = @now WHERE (tax_rate_percent IS NULL OR tax_rate_percent = 0) AND is_active = 1;"
                            : "UPDATE products SET tax_rate_percent = @rate, updated_at = @now WHERE is_active = 1;";

                        using (var cmd = new SQLiteCommand(sql, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@rate", taxRatePercent);
                            cmd.Parameters.AddWithValue("@now", DateTime.UtcNow.ToString("o"));
                            int affected = cmd.ExecuteNonQuery();
                            trans.Commit();
                            return affected;
                        }
                    }
                    catch
                    {
                        trans.Rollback();
                        throw;
                    }
                }
            }
        }

        public int GetUntaxedProductCount()
        {
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand("SELECT COUNT(*) FROM products WHERE (tax_rate_percent IS NULL OR tax_rate_percent = 0) AND is_active = 1;", conn))
                {
                    object res = cmd.ExecuteScalar();
                    return res != null && res != DBNull.Value ? Convert.ToInt32(res) : 0;
                }
            }
        }

        public BatchImportResult ImportBatchAtomic(List<BatchImportItem> items, string duplicateStrategy, string userId = "usr_admin_default")
        {
            return ImportBatchAtomic(items, duplicateStrategy, userId, true);
        }

        // canAdjustExistingStock=false (no stock.adjust permission): rows that carry stock for an existing product are rejected
        public BatchImportResult ImportBatchAtomic(List<BatchImportItem> items, string duplicateStrategy, string userId, bool canAdjustExistingStock)
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
                        var archivedCategoryIds = new HashSet<string>(StringComparer.Ordinal);
                        using (var catCmd = new SQLiteCommand("SELECT id, name, is_active FROM categories;", conn, trans))
                        {
                            using (var catReader = catCmd.ExecuteReader())
                            {
                                while (catReader.Read())
                                {
                                    string cName = catReader["name"].ToString().Trim();
                                    string cId = catReader["id"].ToString();
                                    if (Convert.ToInt64(catReader["is_active"]) == 0) archivedCategoryIds.Add(cId);
                                    categoryMap[cName] = cId;
                                    string normCName = ArabicTextNormalizer.Normalize(cName);
                                    if (!string.IsNullOrEmpty(normCName) && !normalizedCategoryMap.ContainsKey(normCName))
                                    {
                                        normalizedCategoryMap[normCName] = cId;
                                    }
                                }
                            }
                        }

                        // 2. Preload existing barcodes map (barcode -> product_id): main, extra, then unit (carton/box) barcodes
                        // Active products are ordered first so an archived row never shadows an active owner.
                        var existingBarcodeMap = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                        var productOwnedBarcodes = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);
                        string[] barcodeSources =
                        {
                            "SELECT barcode, id FROM products WHERE barcode IS NOT NULL AND barcode != '' ORDER BY is_active DESC, created_at, id;",
                            "SELECT pb.barcode, pb.product_id FROM product_barcodes pb JOIN products p ON p.id = pb.product_id WHERE pb.barcode IS NOT NULL AND pb.barcode != '' ORDER BY p.is_active DESC, pb.created_at, pb.product_id;",
                            "SELECT pu.barcode, pu.product_id FROM product_units pu JOIN products p ON p.id = pu.product_id WHERE pu.barcode IS NOT NULL AND pu.barcode != '' ORDER BY p.is_active DESC, pu.created_at, pu.product_id;"
                        };
                        var productLevelBarcodes = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                        for (int sourceIndex = 0; sourceIndex < barcodeSources.Length; sourceIndex++)
                        {
                            string barcodeSql = barcodeSources[sourceIndex];
                            using (var bcCmd = new SQLiteCommand(barcodeSql, conn, trans))
                            using (var bcReader = bcCmd.ExecuteReader())
                            {
                                while (bcReader.Read())
                                {
                                    string bc = bcReader[0].ToString().Trim();
                                    string ownerPid = bcReader[1].ToString();
                                    if (bc.Length > 0)
                                    {
                                        if (!existingBarcodeMap.ContainsKey(bc))
                                        {
                                            existingBarcodeMap[bc] = ownerPid;
                                            if (sourceIndex < 2) productLevelBarcodes.Add(bc);
                                        }
                                        List<string> ownedList;
                                        if (!productOwnedBarcodes.TryGetValue(ownerPid, out ownedList))
                                        {
                                            ownedList = new List<string>();
                                            productOwnedBarcodes[ownerPid] = ownedList;
                                        }
                                        ownedList.Add(bc);
                                    }
                                }
                            }
                        }

                        // 2b. Package-unit barcodes (carton/box, factor != 1): a row scanned with one of them describes the unit, not the product
                        var packageUnitBarcodes = new Dictionary<string, ImportUnitMatch>(StringComparer.OrdinalIgnoreCase);
                        using (var puCmd = new SQLiteCommand(@"
                            SELECT pu.id, pu.product_id, pu.unit_name, pu.conversion_factor, pu.barcode, p.name AS product_name
                            FROM product_units pu JOIN products p ON p.id = pu.product_id
                            WHERE pu.is_base_unit = 0 AND pu.conversion_factor != 1 AND pu.barcode IS NOT NULL AND pu.barcode != ''
                            ORDER BY p.is_active DESC, pu.created_at, pu.id;", conn, trans))
                        using (var puReader = puCmd.ExecuteReader())
                        {
                            while (puReader.Read())
                            {
                                string bc = puReader["barcode"].ToString().Trim();
                                if (bc.Length == 0 || productLevelBarcodes.Contains(bc) || packageUnitBarcodes.ContainsKey(bc)) continue;
                                packageUnitBarcodes[bc] = new ImportUnitMatch
                                {
                                    UnitId = puReader["id"].ToString(),
                                    ProductId = puReader["product_id"].ToString(),
                                    UnitName = puReader["unit_name"].ToString(),
                                    ConversionFactor = Convert.ToInt64(puReader["conversion_factor"]),
                                    ProductName = puReader["product_name"].ToString()
                                };
                            }
                        }

                        // 3. Preload existing products by name + variant for deduplication when barcode is missing
                        var existingNameVariantMap = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                        using (var prodCmd = new SQLiteCommand("SELECT id, name, normalized_name, variant_color, variant_size FROM products ORDER BY is_active DESC, created_at, id;", conn, trans))
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

                        // Only columns present in the sheet are written (NULL keeps the stored value); stock goes through the ledger path
                        string updateProdSql = @"
                            UPDATE products SET
                                barcode = COALESCE(@barcode, barcode),
                                name = @name,
                                normalized_name = @normName,
                                category_id = COALESCE(@categoryId, category_id),
                                price_piasters = COALESCE(@price, price_piasters),
                                cost_piasters = COALESCE(@cost, cost_piasters),
                                min_stock_quantity_milli = COALESCE(@minStock, min_stock_quantity_milli),
                                unit = COALESCE(@unit, unit),
                                tax_rate_percent = COALESCE(@tax, tax_rate_percent),
                                internal_code = COALESCE(@internalCode, internal_code),
                                tax_category_code = COALESCE(@taxCategoryCode, tax_category_code),
                                variant_color = COALESCE(@color, variant_color),
                                variant_size = COALESCE(@size, variant_size),
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
                            SET sell_price_piasters = COALESCE(@price, sell_price_piasters),
                                cost_price_piasters = COALESCE(@cost, cost_price_piasters),
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
                        using (var restoreCatCmd = new SQLiteCommand("UPDATE categories SET is_active = 1, updated_at = @cdate WHERE id = @cid;", conn, trans))
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
                            updProdCmd.Parameters.Add("@barcode", System.Data.DbType.String);
                            updProdCmd.Parameters.Add("@name", System.Data.DbType.String);
                            updProdCmd.Parameters.Add("@normName", System.Data.DbType.String);
                            updProdCmd.Parameters.Add("@categoryId", System.Data.DbType.String);
                            updProdCmd.Parameters.Add("@price", System.Data.DbType.Int64);
                            updProdCmd.Parameters.Add("@cost", System.Data.DbType.Int64);
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

                            var inventory = new Services.InventoryService(_connectionString, new StockMovementRepository(_connectionString), this, _auditRepo);

                            Func<string, string> resolveCategory = delegate(string catName)
                            {
                                string normCatName = ArabicTextNormalizer.Normalize(catName);
                                if (categoryMap.ContainsKey(catName))
                                {
                                    string matchedCategoryId = categoryMap[catName];
                                    if (archivedCategoryIds.Remove(matchedCategoryId))
                                    {
                                        restoreCatCmd.Parameters["@cid"].Value = matchedCategoryId;
                                        restoreCatCmd.Parameters["@cdate"].Value = now;
                                        restoreCatCmd.ExecuteNonQuery();
                                        result.CategoriesRestoredCount++;
                                    }
                                    return matchedCategoryId;
                                }
                                if (!string.IsNullOrEmpty(normCatName) && normalizedCategoryMap.ContainsKey(normCatName))
                                {
                                    string matchedCategoryId = normalizedCategoryMap[normCatName];
                                    if (archivedCategoryIds.Remove(matchedCategoryId))
                                    {
                                        restoreCatCmd.Parameters["@cid"].Value = matchedCategoryId;
                                        restoreCatCmd.Parameters["@cdate"].Value = now;
                                        restoreCatCmd.ExecuteNonQuery();
                                        result.CategoriesRestoredCount++;
                                    }
                                    return matchedCategoryId;
                                }
                                string newCategoryId = "cat_" + Guid.NewGuid().ToString("N").Substring(0, 8);
                                insCatCmd.Parameters["@cid"].Value = newCategoryId;
                                insCatCmd.Parameters["@cname"].Value = catName;
                                insCatCmd.Parameters["@cdate"].Value = now;
                                insCatCmd.ExecuteNonQuery();
                                result.CategoriesCreatedCount++;
                                categoryMap[catName] = newCategoryId;
                                if (!string.IsNullOrEmpty(normCatName))
                                {
                                    normalizedCategoryMap[normCatName] = newCategoryId;
                                }
                                return newCategoryId;
                            };

                            foreach (var item in items)
                            {
                                if (string.IsNullOrWhiteSpace(item.Name))
                                {
                                    continue;
                                }

                                // Financial sanity: clamp negative prices/costs to zero
                                if (item.PricePiasters.HasValue && item.PricePiasters.Value < 0) item.PricePiasters = 0;
                                if (item.CostPiasters.HasValue && item.CostPiasters.Value < 0) item.CostPiasters = 0;
                                if (item.StockQuantityMilli.HasValue && item.StockQuantityMilli.Value < 0)
                                {
                                    throw new ArgumentException(string.Format("رصيد الصنف '{0}' في ملف الاستيراد لا يمكن أن يكون سالباً.", item.Name.Trim()));
                                }

                                // Category is resolved only when the sheet provides one (Arabic normalization prevents duplicates)
                                string categoryId = !string.IsNullOrWhiteSpace(item.CategoryId) ? item.CategoryId : null;
                                if (categoryId == null && !string.IsNullOrWhiteSpace(item.CategoryName))
                                {
                                    categoryId = resolveCategory(item.CategoryName.Trim());
                                }

                                string cleanColor = CleanVariantValue(item.VariantColor);
                                string cleanSize = CleanVariantValue(item.VariantSize);
                                string itemNormName = ArabicTextNormalizer.Normalize(item.Name ?? "");
                                string nameVariantKey = string.Format("{0}||{1}||{2}", itemNormName, cleanColor, cleanSize);

                                // Check duplicate barcode or duplicate (name + color + size)
                                string primaryBarcode = !string.IsNullOrWhiteSpace(item.Barcode) ? item.Barcode.Trim() : null;
                                string existingProductId = null;
                                string matchedBarcode = null;

                                if (primaryBarcode != null && existingBarcodeMap.ContainsKey(primaryBarcode))
                                {
                                    matchedBarcode = primaryBarcode;
                                }
                                else if (item.Barcodes != null)
                                {
                                    foreach (var b in item.Barcodes)
                                    {
                                        if (!string.IsNullOrWhiteSpace(b) && existingBarcodeMap.ContainsKey(b.Trim()))
                                        {
                                            matchedBarcode = b.Trim();
                                            break;
                                        }
                                    }
                                }
                                if (matchedBarcode != null)
                                {
                                    existingProductId = existingBarcodeMap[matchedBarcode];
                                }

                                ImportUnitMatch unitMatch;
                                if (matchedBarcode != null && packageUnitBarcodes.TryGetValue(matchedBarcode, out unitMatch))
                                {
                                    // Never rename, reprice or restock the base product from a carton/box row
                                    ApplyPackageUnitRow(conn, trans, result, strat, item, unitMatch, matchedBarcode, inactiveProductIds.Contains(unitMatch.ProductId), now);
                                    continue;
                                }

                                // If not matched by barcode, check if exact name and variant match already exists
                                if (existingProductId == null && existingNameVariantMap.ContainsKey(nameVariantKey))
                                {
                                    existingProductId = existingNameVariantMap[nameVariantKey];
                                }

                                if (existingProductId != null)
                                {
                                    bool isArchived = inactiveProductIds.Contains(existingProductId);

                                    // An absolute stock figure for an existing product is a stock adjustment (same permission as the product card)
                                    if (item.StockQuantityMilli.HasValue && !canAdjustExistingStock && (isArchived || strat == "update"))
                                    {
                                        result.Errors.Add(string.Format("تم رفض صف الصنف '{0}': يحتوي على رصيد لصنف مسجل، وتعديل الرصيد يتطلب صلاحية «تسوية المخزون». احذف عمود الرصيد أو اطلب من المدير.", item.Name.Trim()));
                                        result.SkippedCount++;
                                        continue;
                                    }

                                    if (isArchived)
                                    {
                                        // Product was previously deleted (is_active = 0): reactivate it with the imported data
                                        if (!string.IsNullOrWhiteSpace(primaryBarcode) || (item.Barcodes != null && item.Barcodes.Count > 0))
                                        {
                                            ReleaseRestoredProductOldBarcodes(conn, trans, existingProductId, productOwnedBarcodes, existingBarcodeMap);
                                        }

                                        string restoredPrimaryBarcode = null;
                                        if (!string.IsNullOrWhiteSpace(primaryBarcode))
                                        {
                                            string primaryOwner;
                                            if (existingBarcodeMap.TryGetValue(primaryBarcode, out primaryOwner) && !string.Equals(primaryOwner, existingProductId, StringComparison.OrdinalIgnoreCase))
                                            {
                                                if (inactiveProductIds.Contains(primaryOwner))
                                                {
                                                    ReleaseBarcodeFromArchivedProducts(conn, trans, primaryBarcode, existingProductId, existingBarcodeMap);
                                                    restoredPrimaryBarcode = primaryBarcode;
                                                }
                                            }
                                            else
                                            {
                                                ReleaseBarcodeFromArchivedProducts(conn, trans, primaryBarcode, existingProductId, existingBarcodeMap);
                                                restoredPrimaryBarcode = primaryBarcode;
                                            }
                                        }

                                        BindImportUpdate(updProdCmd, item, existingProductId, restoredPrimaryBarcode, itemNormName, categoryId, cleanColor, cleanSize, now);
                                        updProdCmd.ExecuteNonQuery();
                                        if (!string.IsNullOrWhiteSpace(restoredPrimaryBarcode))
                                        {
                                            existingBarcodeMap[restoredPrimaryBarcode] = existingProductId;
                                        }
                                        existingNameVariantMap[nameVariantKey] = existingProductId;

                                        ApplyImportedStock(conn, trans, inventory, result, existingProductId, item, userId, "RESTORE_IMPORT", "استعادة وتنشيط الصنف من ملف الإكسل");
                                        SyncImportedBaseUnit(updUnitCmd, insUnitCmd, existingProductId, item, restoredPrimaryBarcode ?? primaryBarcode, now);
                                        SyncAdditionalBarcodes(conn, trans, insBcCmd, result, strat, existingProductId, item.Name.Trim(), restoredPrimaryBarcode ?? primaryBarcode, item.Barcodes, existingBarcodeMap, inactiveProductIds, now);

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
                                        BindImportUpdate(updProdCmd, item, existingProductId, null, itemNormName, categoryId, cleanColor, cleanSize, now);
                                        updProdCmd.ExecuteNonQuery();
                                        ApplyImportedStock(conn, trans, inventory, result, existingProductId, item, userId, "IMPORT_UPDATE", "تسوية رصيد ناتجة عن تحديث ملف إكسل");

                                        updUnitCmd.Parameters["@pid"].Value = existingProductId;
                                        updUnitCmd.Parameters["@price"].Value = item.PricePiasters.HasValue ? (object)item.PricePiasters.Value : DBNull.Value;
                                        updUnitCmd.Parameters["@cost"].Value = item.CostPiasters.HasValue ? (object)item.CostPiasters.Value : DBNull.Value;
                                        updUnitCmd.Parameters["@now"].Value = now;
                                        updUnitCmd.ExecuteNonQuery();

                                        SyncAdditionalBarcodes(conn, trans, insBcCmd, result, strat, existingProductId, item.Name.Trim(), primaryBarcode, item.Barcodes, existingBarcodeMap, inactiveProductIds, now);

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
                                long newPrice = item.PricePiasters.HasValue ? item.PricePiasters.Value : 0;
                                long newCost = item.CostPiasters.HasValue ? item.CostPiasters.Value : 0;
                                long newStock = item.StockQuantityMilli.HasValue ? item.StockQuantityMilli.Value : 0;
                                if (string.IsNullOrWhiteSpace(primaryBarcode))
                                {
                                    uint hash = (uint)newId.GetHashCode();
                                    do
                                    {
                                        primaryBarcode = "200" + (hash % 1000000000U).ToString("D9");
                                        hash++;
                                    } while (existingBarcodeMap.ContainsKey(primaryBarcode));
                                }

                                ReleaseBarcodeFromArchivedProducts(conn, trans, primaryBarcode, newId, existingBarcodeMap);

                                insProdCmd.Parameters["@id"].Value = newId;
                                insProdCmd.Parameters["@barcode"].Value = primaryBarcode;
                                insProdCmd.Parameters["@internalCode"].Value = (object)item.InternalCode ?? "";
                                insProdCmd.Parameters["@name"].Value = item.Name.Trim();
                                insProdCmd.Parameters["@normName"].Value = itemNormName;
                                insProdCmd.Parameters["@categoryId"].Value = categoryId ?? resolveCategory("عام");
                                insProdCmd.Parameters["@price"].Value = newPrice;
                                insProdCmd.Parameters["@cost"].Value = newCost;
                                insProdCmd.Parameters["@stock"].Value = newStock;
                                insProdCmd.Parameters["@minStock"].Value = item.MinStockQuantityMilli.HasValue ? item.MinStockQuantityMilli.Value : DefaultImportMinStockMilli;
                                insProdCmd.Parameters["@unit"].Value = !string.IsNullOrWhiteSpace(item.Unit) ? item.Unit.Trim() : "piece";
                                insProdCmd.Parameters["@tax"].Value = item.TaxRatePercent.HasValue ? item.TaxRatePercent.Value : 0;
                                insProdCmd.Parameters["@taxCategoryCode"].Value = (object)item.TaxCategoryCode ?? "";
                                insProdCmd.Parameters["@color"].Value = !string.IsNullOrEmpty(cleanColor) ? (object)cleanColor : DBNull.Value;
                                insProdCmd.Parameters["@size"].Value = !string.IsNullOrEmpty(cleanSize) ? (object)cleanSize : DBNull.Value;
                                insProdCmd.Parameters["@now"].Value = now;
                                insProdCmd.ExecuteNonQuery();

                                existingBarcodeMap[primaryBarcode] = newId;
                                existingNameVariantMap[nameVariantKey] = newId;

                                // Insert additional barcodes
                                SyncAdditionalBarcodes(conn, trans, insBcCmd, result, strat, newId, item.Name.Trim(), primaryBarcode, item.Barcodes, existingBarcodeMap, inactiveProductIds, now);

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
                                    insUnitCmd.Parameters["@sellPrice"].Value = newPrice;
                                    insUnitCmd.Parameters["@costPrice"].Value = newCost;
                                    insUnitCmd.Parameters["@barcode"].Value = string.IsNullOrWhiteSpace(primaryBarcode) ? (object)DBNull.Value : primaryBarcode;
                                    insUnitCmd.Parameters["@isDivisible"].Value = isDiv ? 1 : 0;
                                    insUnitCmd.Parameters["@now"].Value = now;
                                    insUnitCmd.ExecuteNonQuery();
                                }
                                catch { }

                                // Record Initial Stock Movement (Task 21-5 & Feature #35)
                                if (newStock != 0)
                                {
                                    insSmCmd.Parameters["@smId"].Value = Guid.NewGuid().ToString();
                                    insSmCmd.Parameters["@smPid"].Value = newId;
                                    insSmCmd.Parameters["@smType"].Value = "INITIAL";
                                    insSmCmd.Parameters["@smQty"].Value = newStock;
                                    insSmCmd.Parameters["@smRefType"].Value = "INITIAL_IMPORT";
                                    insSmCmd.Parameters["@smCost"].Value = newCost;
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

                        // Auto-sync drug_reference to product_pharma_info for any imported pharmacy items (Feature #187 / Story 130 / DDI & Alternatives)
                        try
                        {
                            using (var syncPharmaCmd = new SQLiteCommand(@"
                                INSERT OR REPLACE INTO product_pharma_info (
                                    product_id, scientific_name, normalized_scientific_name, dosage_form_id,
                                    strength, rx_status, is_fridge, created_at, updated_at
                                )
                                SELECT 
                                    p.id, dr.scientific_name, LOWER(dr.scientific_name), NULL,
                                    dr.strength, dr.rx_status, dr.is_refrigerated, @now, @now
                                FROM products p
                                JOIN drug_reference dr ON p.barcode = dr.barcode
                                WHERE p.is_active = 1
                                  AND (
                                    NOT EXISTS (SELECT 1 FROM product_pharma_info pi WHERE pi.product_id = p.id)
                                    OR EXISTS (SELECT 1 FROM product_pharma_info pi WHERE pi.product_id = p.id AND (pi.scientific_name IS NULL OR pi.scientific_name = ''))
                                  );
                            ", conn, trans))
                            {
                                syncPharmaCmd.Parameters.AddWithValue("@now", now);
                                syncPharmaCmd.ExecuteNonQuery();
                            }
                        }
                        catch { }

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

        private const long DefaultImportMinStockMilli = 5000;

        private class ImportUnitMatch
        {
            public string UnitId;
            public string ProductId;
            public string UnitName;
            public long ConversionFactor;
            public string ProductName;
        }

        // A row whose barcode is a package unit's: update only that unit's prices; its stock is never applied because
        // a count of cartons says nothing about loose pieces of the same product
        private static void ApplyPackageUnitRow(SQLiteConnection conn, SQLiteTransaction trans, BatchImportResult result, string strategy, BatchImportItem item, ImportUnitMatch unit, string barcode, bool productArchived, string now)
        {
            string rowLabel = string.Format("الصف '{0}' (باركود {1})", item.Name.Trim(), barcode);
            if (strategy == "error")
            {
                throw new InvalidOperationException(string.Format("{0} هو باركود وحدة «{1}» للصنف '{2}' المسجل مسبقاً.", rowLabel, unit.UnitName, unit.ProductName));
            }
            if (strategy != "update")
            {
                result.SkippedCount++;
                return;
            }
            if (productArchived)
            {
                result.Errors.Add(string.Format("{0}: باركود وحدة «{1}» لصنف مؤرشف '{2}'؛ استعد الصنف بصف الوحدة الأساسية.", rowLabel, unit.UnitName, unit.ProductName));
                result.SkippedCount++;
                return;
            }

            bool hasPrices = item.PricePiasters.HasValue || item.CostPiasters.HasValue;
            if (hasPrices)
            {
                using (var cmd = new SQLiteCommand(@"
                    UPDATE product_units
                    SET sell_price_piasters = COALESCE(@price, sell_price_piasters),
                        cost_price_piasters = COALESCE(@cost, cost_price_piasters),
                        updated_at = @now
                    WHERE id = @uid;", conn, trans))
                {
                    cmd.Parameters.AddWithValue("@price", item.PricePiasters.HasValue ? (object)item.PricePiasters.Value : DBNull.Value);
                    cmd.Parameters.AddWithValue("@cost", item.CostPiasters.HasValue ? (object)item.CostPiasters.Value : DBNull.Value);
                    cmd.Parameters.AddWithValue("@now", now);
                    cmd.Parameters.AddWithValue("@uid", unit.UnitId);
                    cmd.ExecuteNonQuery();
                }
                result.UpdatedCount++;
            }
            else
            {
                result.SkippedCount++;
            }

            if (item.StockQuantityMilli.HasValue)
            {
                result.Errors.Add(string.Format("{0}: باركود وحدة «{1}» (×{2}) للصنف '{3}'؛ {4}لم يُطبَّق الرصيد. سجّل رصيد الصنف في صف الوحدة الأساسية.",
                    rowLabel, unit.UnitName, unit.ConversionFactor, unit.ProductName, hasPrices ? "حُدِّث سعر الوحدة فقط و" : ""));
            }
        }

        private static string CleanVariantValue(string value)
        {
            if (string.IsNullOrWhiteSpace(value)) return "";
            string t = value.Trim();
            if (t == "—" || t == "–" || t == "-" || t == "_" || t == "/" || t == "." || t == "\\" ||
                t.Equals("n/a", StringComparison.OrdinalIgnoreCase) ||
                t.Equals("na", StringComparison.OrdinalIgnoreCase) ||
                t.Equals("none", StringComparison.OrdinalIgnoreCase) ||
                t.Equals("null", StringComparison.OrdinalIgnoreCase) ||
                t.Equals("nil", StringComparison.OrdinalIgnoreCase) ||
                t.Equals("لا يوجد", StringComparison.OrdinalIgnoreCase) ||
                t.Equals("لايوجد", StringComparison.OrdinalIgnoreCase) ||
                t.Equals("بدون", StringComparison.OrdinalIgnoreCase) ||
                t.Equals("غير محدد", StringComparison.OrdinalIgnoreCase))
            {
                return "";
            }
            return t;
        }

        private static object OptionalText(string value)
        {
            return string.IsNullOrWhiteSpace(value) ? (object)DBNull.Value : value.Trim();
        }

        private static void BindImportUpdate(SQLiteCommand cmd, BatchImportItem item, string productId, string barcodeToSet, string normName, string categoryId, string color, string size, string now)
        {
            cmd.Parameters["@pid"].Value = productId;
            cmd.Parameters["@barcode"].Value = OptionalText(barcodeToSet);
            cmd.Parameters["@name"].Value = item.Name.Trim();
            cmd.Parameters["@normName"].Value = normName;
            cmd.Parameters["@categoryId"].Value = OptionalText(categoryId);
            cmd.Parameters["@price"].Value = item.PricePiasters.HasValue ? (object)item.PricePiasters.Value : DBNull.Value;
            cmd.Parameters["@cost"].Value = item.CostPiasters.HasValue ? (object)item.CostPiasters.Value : DBNull.Value;
            cmd.Parameters["@minStock"].Value = item.MinStockQuantityMilli.HasValue ? (object)item.MinStockQuantityMilli.Value : DBNull.Value;
            cmd.Parameters["@unit"].Value = OptionalText(item.Unit);
            cmd.Parameters["@tax"].Value = item.TaxRatePercent.HasValue ? (object)item.TaxRatePercent.Value : DBNull.Value;
            cmd.Parameters["@internalCode"].Value = OptionalText(item.InternalCode);
            cmd.Parameters["@taxCategoryCode"].Value = OptionalText(item.TaxCategoryCode);
            cmd.Parameters["@color"].Value = OptionalText(color);
            cmd.Parameters["@size"].Value = OptionalText(size);
            cmd.Parameters["@now"].Value = now;
        }

        private static void ReleaseRestoredProductOldBarcodes(SQLiteConnection conn, SQLiteTransaction trans, string productId, Dictionary<string, List<string>> productOwnedBarcodes, Dictionary<string, string> existingBarcodeMap)
        {
            using (var delCmd = new SQLiteCommand("DELETE FROM product_barcodes WHERE product_id = @pid;", conn, trans))
            {
                delCmd.Parameters.AddWithValue("@pid", productId);
                delCmd.ExecuteNonQuery();
            }

            List<string> oldBarcodes;
            if (productOwnedBarcodes.TryGetValue(productId, out oldBarcodes))
            {
                for (int i = 0; i < oldBarcodes.Count; i++)
                {
                    string oldBc = oldBarcodes[i];
                    string mappedOwner;
                    if (existingBarcodeMap.TryGetValue(oldBc, out mappedOwner) && string.Equals(mappedOwner, productId, StringComparison.OrdinalIgnoreCase))
                    {
                        existingBarcodeMap.Remove(oldBc);
                    }
                }
                oldBarcodes.Clear();
            }
        }

        private static void ReleaseBarcodeFromArchivedProducts(SQLiteConnection conn, SQLiteTransaction trans, string barcode, string targetProductId, Dictionary<string, string> existingBarcodeMap)
        {
            if (string.IsNullOrWhiteSpace(barcode)) return;

            string cleanBc = barcode.Trim();
            using (var relCmd = new SQLiteCommand(@"
                UPDATE products SET barcode = NULL WHERE barcode = @bc COLLATE NOCASE AND is_active = 0 AND id <> @targetId;
                DELETE FROM product_barcodes WHERE barcode = @bc COLLATE NOCASE AND product_id <> @targetId AND product_id IN (SELECT id FROM products WHERE is_active = 0);
                UPDATE product_units SET barcode = @nullVal WHERE barcode = @bc COLLATE NOCASE AND product_id <> @targetId AND product_id IN (SELECT id FROM products WHERE is_active = 0);", conn, trans))
            {
                relCmd.Parameters.AddWithValue("@bc", cleanBc);
                relCmd.Parameters.AddWithValue("@targetId", targetProductId ?? "");
                relCmd.Parameters.AddWithValue("@nullVal", DBNull.Value);
                relCmd.ExecuteNonQuery();
            }

            string mappedOwner;
            if (existingBarcodeMap.TryGetValue(cleanBc, out mappedOwner) && !string.Equals(mappedOwner, targetProductId, StringComparison.OrdinalIgnoreCase))
            {
                existingBarcodeMap.Remove(cleanBc);
            }
        }

        private static void SyncAdditionalBarcodes(SQLiteConnection conn, SQLiteTransaction trans, SQLiteCommand insBcCmd, BatchImportResult result, string strat, string targetProductId, string itemName, string primaryBarcode, List<string> barcodes, Dictionary<string, string> existingBarcodeMap, HashSet<string> inactiveProductIds, string now)
        {
            if (barcodes == null || barcodes.Count == 0) return;

            for (int i = 0; i < barcodes.Count; i++)
            {
                string rawB = barcodes[i];
                if (string.IsNullOrWhiteSpace(rawB)) continue;

                string trimmedB = rawB.Trim();
                if (string.Equals(trimmedB, primaryBarcode, StringComparison.OrdinalIgnoreCase)) continue;

                string owner;
                if (existingBarcodeMap.TryGetValue(trimmedB, out owner) && !string.Equals(owner, targetProductId, StringComparison.OrdinalIgnoreCase))
                {
                    if (inactiveProductIds.Contains(owner))
                    {
                        ReleaseBarcodeFromArchivedProducts(conn, trans, trimmedB, targetProductId, existingBarcodeMap);
                    }
                    else
                    {
                        if (strat == "error")
                        {
                            throw new InvalidOperationException(string.Format("الباركود '{0}' للصنف '{1}' مسجل لصنف آخر في النظام. صحح الملف ثم أعد الاستيراد.", trimmedB, itemName));
                        }
                        result.Errors.Add(string.Format("تنبيه للصنف '{0}': تم تخطي الباركود الإضافي '{1}' لأنه مسجل لصنف نشط آخر.", itemName, trimmedB));
                        continue;
                    }
                }
                else
                {
                    ReleaseBarcodeFromArchivedProducts(conn, trans, trimmedB, targetProductId, existingBarcodeMap);
                }

                insBcCmd.Parameters["@pbid"].Value = "pbc_" + Guid.NewGuid().ToString("N");
                insBcCmd.Parameters["@pid"].Value = targetProductId;
                insBcCmd.Parameters["@bc"].Value = trimmedB;
                insBcCmd.Parameters["@now"].Value = now;
                insBcCmd.ExecuteNonQuery();
                existingBarcodeMap[trimmedB] = targetProductId;
            }
        }

        // An imported stock figure is an absolute count: recorded as an adjustment (ledger + variants + FEFO batch sync)
        private static void ApplyImportedStock(SQLiteConnection conn, SQLiteTransaction trans, Services.InventoryService inventory, BatchImportResult result, string productId, BatchImportItem item, string userId, string referenceType, string reason)
        {
            if (!item.StockQuantityMilli.HasValue) return;

            using (var cmd = new SQLiteCommand("SELECT COALESCE(has_variants, 0) FROM products WHERE id = @pid;", conn, trans))
            {
                cmd.Parameters.AddWithValue("@pid", productId);
                if (Convert.ToInt32(cmd.ExecuteScalar()) == 1)
                {
                    result.Errors.Add(string.Format("تم تجاهل رصيد الصنف '{0}' لأنه صنف أب رصيده مجموع متغيراته؛ عدّل رصيد كل متغير على حدة.", item.Name.Trim()));
                    return;
                }
            }

            inventory.AdjustStockInTransaction(conn, trans, productId, item.StockQuantityMilli.Value, reason, string.IsNullOrWhiteSpace(userId) ? "usr_admin_default" : userId, null, referenceType);
        }

        private static void SyncImportedBaseUnit(SQLiteCommand updUnitCmd, SQLiteCommand insUnitCmd, string productId, BatchImportItem item, string primaryBarcode, string now)
        {
            updUnitCmd.Parameters["@pid"].Value = productId;
            updUnitCmd.Parameters["@price"].Value = item.PricePiasters.HasValue ? (object)item.PricePiasters.Value : DBNull.Value;
            updUnitCmd.Parameters["@cost"].Value = item.CostPiasters.HasValue ? (object)item.CostPiasters.Value : DBNull.Value;
            updUnitCmd.Parameters["@now"].Value = now;
            if (updUnitCmd.ExecuteNonQuery() > 0) return;

            string uName = !string.IsNullOrWhiteSpace(item.Unit) ? item.Unit.Trim() : "قطعة";
            bool isDiv = uName.Equals("kg", StringComparison.OrdinalIgnoreCase) ||
                         uName.Equals("كيلو", StringComparison.OrdinalIgnoreCase) ||
                         uName.Equals("كجم", StringComparison.OrdinalIgnoreCase);
            insUnitCmd.Parameters["@id"].Value = "punit_" + productId;
            insUnitCmd.Parameters["@productId"].Value = productId;
            insUnitCmd.Parameters["@unitName"].Value = uName;
            insUnitCmd.Parameters["@sellPrice"].Value = item.PricePiasters.HasValue ? item.PricePiasters.Value : 0;
            insUnitCmd.Parameters["@costPrice"].Value = item.CostPiasters.HasValue ? item.CostPiasters.Value : 0;
            insUnitCmd.Parameters["@barcode"].Value = string.IsNullOrWhiteSpace(primaryBarcode) ? (object)DBNull.Value : primaryBarcode;
            insUnitCmd.Parameters["@isDivisible"].Value = isDiv ? 1 : 0;
            insUnitCmd.Parameters["@now"].Value = now;
            insUnitCmd.ExecuteNonQuery();
        }
    }
}
