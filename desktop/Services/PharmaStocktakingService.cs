using System;
using System.Collections.Generic;
using System.Data.SQLite;
using RafiqPOS.Common;
using RafiqPOS.Models;
using RafiqPOS.Repositories;

namespace RafiqPOS.Services
{
    /// <summary>
    /// خدمة الجرد الصيدلي المتقدم والتسويات المخزنية الدقيقة على مستوى الرف والتشغيلة والوحدات المركبة (Story 135 / Task 192-3)
    /// </summary>
    public class PharmaStocktakingService
    {
        private readonly string _connectionString;
        private readonly ProductBatchRepository _batchRepo;
        private readonly ProductRepository _productRepo;
        private readonly AuditLogRepository _auditRepo;

        public PharmaStocktakingService(
            string connectionString,
            ProductBatchRepository batchRepo,
            ProductRepository productRepo,
            AuditLogRepository auditRepo)
        {
            _connectionString = connectionString;
            _batchRepo = batchRepo;
            _productRepo = productRepo;
            _auditRepo = auditRepo;
        }

        /// <summary>
        /// استخراج مسودة كشف الجرد الصيدلي بحسب الرف أو الشركة أو البحث العام مع بيانات التشغيلات والوحدات
        /// </summary>
        public PharmacyStocktakingSheet GetStocktakingSheet(string locationId = null, string manufacturerId = null, string searchQuery = null, int limit = 200)
        {
            if (limit <= 0) limit = 200;

            var sheet = new PharmacyStocktakingSheet();
            sheet.GeneratedAt = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss");
            sheet.LocationId = locationId;
            sheet.ManufacturerId = manufacturerId;
            sheet.SearchQuery = searchQuery;

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();

                // 1. Get location and manufacturer names if filtered
                if (!string.IsNullOrEmpty(locationId))
                {
                    using (var cmd = new SQLiteCommand("SELECT name, code FROM storage_locations WHERE id = @id;", conn))
                    {
                        cmd.Parameters.AddWithValue("@id", locationId);
                        using (var reader = cmd.ExecuteReader())
                        {
                            if (reader.Read())
                            {
                                sheet.LocationName = reader["name"].ToString();
                            }
                        }
                    }
                }

                if (!string.IsNullOrEmpty(manufacturerId))
                {
                    using (var cmd = new SQLiteCommand("SELECT name_ar FROM pharma_manufacturers WHERE id = @id;", conn))
                    {
                        cmd.Parameters.AddWithValue("@id", manufacturerId);
                        using (var reader = cmd.ExecuteReader())
                        {
                            if (reader.Read())
                            {
                                sheet.ManufacturerName = reader["name_ar"].ToString();
                            }
                        }
                    }
                }

                // 2. Build products query with dynamic filters
                List<string> whereParts = new List<string>();
                whereParts.Add("p.is_active = 1");

                if (!string.IsNullOrEmpty(locationId))
                {
                    whereParts.Add("(p.location_id = @locId OR EXISTS (SELECT 1 FROM product_batches pbLoc WHERE pbLoc.product_id = p.id AND pbLoc.location_id = @locId AND pbLoc.status = 'ACTIVE' AND pbLoc.quantity_milli > 0))");
                }

                if (!string.IsNullOrEmpty(manufacturerId))
                {
                    whereParts.Add("ppi.manufacturer_id = @mfgId");
                }

                if (!string.IsNullOrEmpty(searchQuery))
                {
                    whereParts.Add("(p.name LIKE @sq OR p.barcode LIKE @sq OR ppi.scientific_name LIKE @sq OR ppi.normalized_scientific_name LIKE @sq)");
                }

                string whereClause = string.Join(" AND ", whereParts.ToArray());

                string sql = string.Format(@"
                    SELECT 
                        p.id AS product_id,
                        p.name AS product_name,
                        COALESCE(p.barcode, '') AS barcode,
                        COALESCE(ppi.scientific_name, '') AS scientific_name,
                        COALESCE(df.name_ar, '') AS dosage_form,
                        COALESCE(pm.name_ar, '') AS manufacturer_name,
                        p.location_id,
                        COALESCE(sl.code, '') AS location_code,
                        COALESCE(sl.name, '') AS location_name,
                        p.cost_piasters,
                        p.price_piasters,
                        p.stock_quantity_milli
                    FROM products p
                    LEFT JOIN product_pharma_info ppi ON p.id = ppi.product_id
                    LEFT JOIN pharma_dosage_forms df ON ppi.dosage_form_id = df.id
                    LEFT JOIN pharma_manufacturers pm ON ppi.manufacturer_id = pm.id
                    LEFT JOIN storage_locations sl ON p.location_id = sl.id
                    WHERE {0}
                    ORDER BY COALESCE(sl.code, 'ZZZ') ASC, p.name ASC
                    LIMIT {1};", whereClause, limit);

                var productMap = new Dictionary<string, PharmacyStocktakingItem>(StringComparer.OrdinalIgnoreCase);
                var productIds = new List<string>();

                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    if (!string.IsNullOrEmpty(locationId)) cmd.Parameters.AddWithValue("@locId", locationId);
                    if (!string.IsNullOrEmpty(manufacturerId)) cmd.Parameters.AddWithValue("@mfgId", manufacturerId);
                    if (!string.IsNullOrEmpty(searchQuery)) cmd.Parameters.AddWithValue("@sq", "%" + searchQuery.Trim() + "%");

                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            var item = new PharmacyStocktakingItem();
                            item.ProductId = reader["product_id"].ToString();
                            item.ProductName = reader["product_name"].ToString();
                            item.Barcode = reader["barcode"].ToString();
                            item.ScientificName = reader["scientific_name"].ToString();
                            item.DosageForm = reader["dosage_form"].ToString();
                            item.ManufacturerName = reader["manufacturer_name"].ToString();
                            item.LocationId = reader["location_id"] != DBNull.Value ? reader["location_id"].ToString() : "";
                            item.LocationCode = reader["location_code"].ToString();
                            item.LocationName = reader["location_name"].ToString();
                            item.CostPricePiasters = Convert.ToInt64(reader["cost_piasters"]);
                            item.SellPricePiasters = Convert.ToInt64(reader["price_piasters"]);
                            item.BookQuantityMilli = Convert.ToInt64(reader["stock_quantity_milli"]);

                            productMap[item.ProductId] = item;
                            productIds.Add(item.ProductId);
                            sheet.Items.Add(item);

                            sheet.TotalItemsCount++;
                            sheet.TotalBookCostPiasters += (item.BookQuantityMilli * item.CostPricePiasters) / 1000L;
                        }
                    }
                }

                if (productIds.Count == 0)
                {
                    return sheet;
                }

                // 3. Load packaging units for products to allow compound units entry
                string inPids = string.Format("'{0}'", string.Join("','", productIds.ToArray()));
                string unitsSql = string.Format(@"
                    SELECT product_id, id AS unit_id, unit_name, conversion_factor, is_base_unit
                    FROM product_units
                    WHERE product_id IN ({0})
                    ORDER BY conversion_factor DESC;", inPids);

                using (var cmd = new SQLiteCommand(unitsSql, conn))
                using (var reader = cmd.ExecuteReader())
                {
                    while (reader.Read())
                    {
                        string pid = reader["product_id"].ToString();
                        PharmacyStocktakingItem pItem;
                        if (productMap.TryGetValue(pid, out pItem))
                        {
                            pItem.Units.Add(new PharmacyStocktakingUnitDef
                            {
                                UnitId = reader["unit_id"].ToString(),
                                UnitName = reader["unit_name"].ToString(),
                                ConversionFactor = Convert.ToInt32(reader["conversion_factor"]),
                                IsBaseUnit = Convert.ToInt32(reader["is_base_unit"]) == 1
                            });
                        }
                    }
                }

                // If any product has no units registered in product_units, provide default base unit
                for (int i = 0; i < sheet.Items.Count; i++)
                {
                    var pItem = sheet.Items[i];
                    if (pItem.Units.Count == 0)
                    {
                        pItem.Units.Add(new PharmacyStocktakingUnitDef
                        {
                            UnitId = "base_" + pItem.ProductId,
                            UnitName = "عبوة",
                            ConversionFactor = 1,
                            IsBaseUnit = true
                        });
                    }
                }

                // 4. Load active batches for products
                string batchesSql = string.Format(@"
                    SELECT id AS batch_id, product_id, batch_number, expiry_date, quantity_milli, cost_price_piasters, status
                    FROM product_batches
                    WHERE product_id IN ({0}) AND status = 'ACTIVE' AND quantity_milli > 0
                    ORDER BY expiry_date ASC;", inPids);

                using (var cmd = new SQLiteCommand(batchesSql, conn))
                using (var reader = cmd.ExecuteReader())
                {
                    while (reader.Read())
                    {
                        string pid = reader["product_id"].ToString();
                        PharmacyStocktakingItem pItem;
                        if (productMap.TryGetValue(pid, out pItem))
                        {
                            pItem.Batches.Add(new PharmacyStocktakingBatchItem
                            {
                                BatchId = reader["batch_id"].ToString(),
                                BatchNumber = reader["batch_number"].ToString(),
                                ExpiryDate = reader["expiry_date"].ToString(),
                                BookQuantityMilli = Convert.ToInt64(reader["quantity_milli"]),
                                UnitCostPiasters = Convert.ToInt64(reader["cost_price_piasters"]),
                                Status = reader["status"].ToString()
                            });
                        }
                    }
                }
            }

            return sheet;
        }

        /// <summary>
        /// اعتماد قيود تسوية الجرد الصيدلي في معاملة ذرية واحدة مع تحديث أرصدة التشغيلات والمخزن وسجل الحركات
        /// </summary>
        public int ApplyStocktakingAdjustments(PharmacyStocktakingBatchRequest request, string userId)
        {
            if (request == null || request.Items == null || request.Items.Count == 0)
            {
                throw new ArgumentException("قائمة بنود التسوية الجردية فارغة.");
            }

            string actorId = !string.IsNullOrEmpty(userId) ? userId : "usr_admin_default";
            string generalReason = !string.IsNullOrWhiteSpace(request.AuditReason) ? request.AuditReason.Trim() : "تسوية جرد صيدلي دوري";
            int adjustedCount = 0;

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        for (int i = 0; i < request.Items.Count; i++)
                        {
                            var item = request.Items[i];
                            if (item.CountedQuantityMilli < 0)
                            {
                                throw new ArgumentException("لا يمكن إدخال كمية جرد سالبة للصنف: " + item.ProductId);
                            }

                            string itemReason = !string.IsNullOrWhiteSpace(item.Reason) ? item.Reason.Trim() : generalReason;

                            if (!string.IsNullOrEmpty(item.BatchId))
                            {
                                // Adjust specific batch atomically
                                _batchRepo.AdjustBatchStock(item.BatchId, item.CountedQuantityMilli, itemReason, actorId, conn, trans);
                                adjustedCount++;
                            }
                            else if (!string.IsNullOrEmpty(item.ProductId))
                            {
                                // Product level stock adjustment
                                long currentStock = 0;
                                long costPiasters = 0;
                                using (var cmd = new SQLiteCommand("SELECT stock_quantity_milli, cost_piasters FROM products WHERE id = @pid;", conn, trans))
                                {
                                    cmd.Parameters.AddWithValue("@pid", item.ProductId);
                                    using (var reader = cmd.ExecuteReader())
                                    {
                                        if (reader.Read())
                                        {
                                            currentStock = Convert.ToInt64(reader["stock_quantity_milli"]);
                                            costPiasters = Convert.ToInt64(reader["cost_piasters"]);
                                        }
                                        else
                                        {
                                            throw new InvalidOperationException("المنتج المحدد غير موجود: " + item.ProductId);
                                        }
                                    }
                                }

                                long delta = item.CountedQuantityMilli - currentStock;
                                if (delta != 0)
                                {
                                    string now = DateTime.UtcNow.ToString("o");

                                    // Update product stock
                                    using (var cmd = new SQLiteCommand("UPDATE products SET stock_quantity_milli = @qty, updated_at = @now WHERE id = @pid;", conn, trans))
                                    {
                                        cmd.Parameters.AddWithValue("@qty", item.CountedQuantityMilli);
                                        cmd.Parameters.AddWithValue("@now", now);
                                        cmd.Parameters.AddWithValue("@pid", item.ProductId);
                                        cmd.ExecuteNonQuery();
                                    }

                                    // Record stock movement
                                    using (var cmd = new SQLiteCommand(@"
                                        INSERT INTO stock_movements (
                                            id, product_id, movement_type, quantity_milli, 
                                            stock_before_milli, stock_after_milli, 
                                            cost_price_piasters, reference_id, reference_type, 
                                            reason, user_id, created_at
                                        ) VALUES (
                                            @id, @pid, 'ADJUSTMENT', @delta, 
                                            @before, @after, 
                                            @cost, @refId, 'INVENTORY_AUDIT', 
                                            @reason, @user, @created
                                        );", conn, trans))
                                    {
                                        cmd.Parameters.AddWithValue("@id", Guid.NewGuid().ToString());
                                        cmd.Parameters.AddWithValue("@pid", item.ProductId);
                                        cmd.Parameters.AddWithValue("@delta", delta);
                                        cmd.Parameters.AddWithValue("@before", currentStock);
                                        cmd.Parameters.AddWithValue("@after", item.CountedQuantityMilli);
                                        cmd.Parameters.AddWithValue("@cost", costPiasters);
                                        cmd.Parameters.AddWithValue("@refId", "AUDIT_" + DateTime.UtcNow.ToString("yyyyMMddHHmmss"));
                                        cmd.Parameters.AddWithValue("@reason", itemReason);
                                        cmd.Parameters.AddWithValue("@user", actorId);
                                        cmd.Parameters.AddWithValue("@created", now);
                                        cmd.ExecuteNonQuery();
                                    }

                                    adjustedCount++;
                                }
                            }
                        }

                        // Log audit
                        if (_auditRepo != null)
                        {
                            _auditRepo.Log(conn, trans, new AuditLog
                            {
                                UserId = actorId,
                                Action = "pharma_stocktaking_settle",
                                EntityType = "inventory",
                                EntityId = request.LocationId ?? "all_locations",
                                DetailsJson = string.Format("{{\"adjustedCount\":{0},\"reason\":\"{1}\",\"timestamp\":\"{2}\"}}", adjustedCount, generalReason, DateTime.UtcNow.ToString("o"))
                            });
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

            return adjustedCount;
        }
    }
}
