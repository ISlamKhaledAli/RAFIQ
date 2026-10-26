using System;
using System.Collections.Generic;
using System.Data.SQLite;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Repositories
{
    /// <summary>
    /// مستودع بيانات كشكول النواقص ومقترحات الشراء (Story 129 / Feature #186)
    /// </summary>
    public class ShortageRepository
    {
        private readonly string _connectionString;

        public ShortageRepository(string connectionString)
        {
            _connectionString = connectionString;
        }

        public List<ShortageEntry> GetAll(string status = null, string source = null, string supplierId = null, string search = null)
        {
            var list = new List<ShortageEntry>();
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                AutoResolveReplenishedShortages(conn);
                string sql = @"
                    SELECT 
                        s.id, s.product_id, s.free_text, s.requested_qty_milli, 
                        s.customer_id, s.customer_name, s.customer_phone, 
                        s.source, s.status, s.priority, s.purchase_id, s.notes, 
                        s.created_by, s.created_at, s.updated_at,
                        p.name AS product_name, p.barcode AS product_barcode, p.price_piasters,
                        p.cost_piasters,
                        p.preferred_supplier_id, sup.name AS preferred_supplier_name,
                        u.display_name AS created_by_name,
                        COALESCE(p.stock_quantity_milli, 0) AS current_stock_milli,
                        COALESCE(p.min_stock_quantity_milli, 0) AS min_stock_milli,
                        COALESCE(p.unit, 'قطعة') AS product_unit
                    FROM shortage_entries s
                    LEFT JOIN products p ON s.product_id = p.id
                    LEFT JOIN suppliers sup ON p.preferred_supplier_id = sup.id
                    LEFT JOIN users u ON s.created_by = u.id
                    WHERE 1=1 ";

                var parameters = new List<SQLiteParameter>();

                if (!string.IsNullOrEmpty(status) && status != "all")
                {
                    if (status == "pending" || status == "open")
                    {
                        sql += " AND (s.status = 'open' OR s.status = 'pending') ";
                    }
                    else
                    {
                        sql += " AND s.status = @status ";
                        parameters.Add(new SQLiteParameter("@status", status));
                    }
                }

                if (!string.IsNullOrEmpty(source) && source != "all")
                {
                    sql += " AND s.source = @source ";
                    parameters.Add(new SQLiteParameter("@source", source));
                }

                if (!string.IsNullOrEmpty(supplierId) && supplierId != "all")
                {
                    sql += " AND p.preferred_supplier_id = @supplierId ";
                    parameters.Add(new SQLiteParameter("@supplierId", supplierId));
                }

                if (!string.IsNullOrEmpty(search))
                {
                    sql += " AND (s.free_text LIKE @q OR p.name LIKE @q OR p.barcode LIKE @q OR s.customer_name LIKE @q OR s.customer_phone LIKE @q) ";
                    parameters.Add(new SQLiteParameter("@q", "%" + search.Trim() + "%"));
                }

                sql += " ORDER BY CASE s.priority WHEN 'urgent' THEN 0 ELSE 1 END, s.created_at DESC;";

                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    for (int i = 0; i < parameters.Count; i++)
                    {
                        cmd.Parameters.Add(parameters[i]);
                    }

                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            list.Add(MapReaderToEntry(reader));
                        }
                    }
                }
            }
            return list;
        }

        public ShortageEntry GetById(string id)
        {
            if (string.IsNullOrEmpty(id)) return null;

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    SELECT 
                        s.id, s.product_id, s.free_text, s.requested_qty_milli, 
                        s.customer_id, s.customer_name, s.customer_phone, 
                        s.source, s.status, s.priority, s.purchase_id, s.notes, 
                        s.created_by, s.created_at, s.updated_at,
                        p.name AS product_name, p.barcode AS product_barcode, p.price_piasters,
                        p.cost_piasters,
                        p.preferred_supplier_id, sup.name AS preferred_supplier_name,
                        u.display_name AS created_by_name,
                        COALESCE(p.stock_quantity_milli, 0) AS current_stock_milli,
                        COALESCE(p.min_stock_quantity_milli, 0) AS min_stock_milli,
                        COALESCE(p.unit, 'قطعة') AS product_unit
                    FROM shortage_entries s
                    LEFT JOIN products p ON s.product_id = p.id
                    LEFT JOIN suppliers sup ON p.preferred_supplier_id = sup.id
                    LEFT JOIN users u ON s.created_by = u.id
                    WHERE s.id = @id LIMIT 1;";

                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@id", id);
                    using (var reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            return MapReaderToEntry(reader);
                        }
                    }
                }
            }
            return null;
        }

        public ShortageEntry Save(ShortageEntry entry, string userId)
        {
            if (entry == null) throw new ArgumentNullException("entry");

            if (string.IsNullOrEmpty(entry.Id))
            {
                entry.Id = Guid.NewGuid().ToString();
            }

            if (string.IsNullOrEmpty(entry.FreeText))
            {
                if (!string.IsNullOrEmpty(entry.ProductName)) entry.FreeText = entry.ProductName;
                else throw new ArgumentException("اسم الصنف الناقص مطلوب.");
            }

            if (string.IsNullOrEmpty(entry.CreatedBy))
            {
                entry.CreatedBy = userId ?? "usr_admin_default";
            }

            if (string.IsNullOrEmpty(entry.CreatedAt))
            {
                entry.CreatedAt = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss");
            }
            entry.UpdatedAt = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss");

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        string sql = @"
                            INSERT OR REPLACE INTO shortage_entries (
                                id, product_id, free_text, requested_qty_milli,
                                customer_id, customer_name, customer_phone,
                                source, status, priority, purchase_id, notes,
                                created_by, created_at, updated_at
                            ) VALUES (
                                @id, @product_id, @free_text, @requested_qty_milli,
                                @customer_id, @customer_name, @customer_phone,
                                @source, @status, @priority, @purchase_id, @notes,
                                @created_by, @created_at, @updated_at
                            );";

                        using (var cmd = new SQLiteCommand(sql, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@id", entry.Id);
                            cmd.Parameters.AddWithValue("@product_id", (object)entry.ProductId ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@free_text", entry.FreeText);
                            cmd.Parameters.AddWithValue("@requested_qty_milli", entry.RequestedQtyMilli > 0 ? entry.RequestedQtyMilli : 1000);
                            cmd.Parameters.AddWithValue("@customer_id", (object)entry.CustomerId ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@customer_name", (object)entry.CustomerName ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@customer_phone", (object)entry.CustomerPhone ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@source", entry.Source ?? "pos");
                            cmd.Parameters.AddWithValue("@status", entry.Status ?? "open");
                            cmd.Parameters.AddWithValue("@priority", entry.Priority ?? "normal");
                            cmd.Parameters.AddWithValue("@purchase_id", (object)entry.PurchaseId ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@notes", (object)entry.Notes ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@created_by", entry.CreatedBy);
                            cmd.Parameters.AddWithValue("@created_at", entry.CreatedAt);
                            cmd.Parameters.AddWithValue("@updated_at", entry.UpdatedAt);

                            cmd.ExecuteNonQuery();
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

            return GetById(entry.Id);
        }

        public void UpdateStatus(string id, string status, string purchaseId, string userId, bool increaseStock = true)
        {
            if (string.IsNullOrEmpty(id)) return;

            lock (SaleService.FinancialWriteLock)
            {
                using (var conn = new SQLiteConnection(_connectionString))
                {
                    conn.Open();
                    using (var trans = conn.BeginTransaction())
                    {
                        try
                        {
                            string now = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss");
                            string selectSql = @"
                                SELECT s.id, s.product_id, s.free_text, s.requested_qty_milli, s.status,
                                       p.name AS product_name, p.cost_piasters, p.parent_id
                                FROM shortage_entries s
                                LEFT JOIN products p ON s.product_id = p.id
                                WHERE s.id = @id LIMIT 1;";

                            string productId = null;
                            string productName = null;
                            string oldStatus = "pending";
                            int requestedQtyMilli = 1000;
                            long unitCostPiasters = 0;

                            using (var cmd = new SQLiteCommand(selectSql, conn, trans))
                            {
                                cmd.Parameters.AddWithValue("@id", id);
                                using (var reader = cmd.ExecuteReader())
                                {
                                    if (reader.Read())
                                    {
                                        productId = reader["product_id"] != DBNull.Value ? reader["product_id"].ToString() : null;
                                        productName = reader["product_name"] != DBNull.Value ? reader["product_name"].ToString() : reader["free_text"].ToString();
                                        oldStatus = reader["status"] != DBNull.Value ? reader["status"].ToString() : "pending";
                                        requestedQtyMilli = Convert.ToInt32(reader["requested_qty_milli"]);
                                        unitCostPiasters = reader["cost_piasters"] != DBNull.Value ? Convert.ToInt64(reader["cost_piasters"]) : 0;
                                    }
                                }
                            }

                            // If transitioning to received and increaseStock is requested, and wasn't already received:
                            if (string.Equals(status, "received", StringComparison.OrdinalIgnoreCase) &&
                                !string.Equals(oldStatus, "received", StringComparison.OrdinalIgnoreCase) &&
                                increaseStock && !string.IsNullOrEmpty(productId) && requestedQtyMilli > 0)
                            {
                                // 1. Update product stock
                                string updateProdSql = @"
                                    UPDATE products
                                    SET stock_quantity_milli = stock_quantity_milli + @qtyDelta,
                                        updated_at = @now
                                    WHERE id = @pid;";

                                using (var prodCmd = new SQLiteCommand(updateProdSql, conn, trans))
                                {
                                    prodCmd.Parameters.AddWithValue("@qtyDelta", requestedQtyMilli);
                                    prodCmd.Parameters.AddWithValue("@now", now);
                                    prodCmd.Parameters.AddWithValue("@pid", productId);
                                    prodCmd.ExecuteNonQuery();
                                }

                                // 2. If it has parent or variants, synchronize variant and parent stock
                                string syncVariantSql = @"
                                    UPDATE product_variants
                                    SET stock_quantity_milli = stock_quantity_milli + @qtyDelta,
                                        updated_at = @now
                                    WHERE variant_product_id = @pid;

                                    UPDATE products
                                    SET stock_quantity_milli = (
                                        SELECT COALESCE(SUM(p2.stock_quantity_milli), 0)
                                        FROM products p2
                                        WHERE p2.parent_id = (SELECT p1.parent_id FROM products p1 WHERE p1.id = @pid)
                                          AND p2.is_active = 1
                                    ),
                                    updated_at = @now
                                    WHERE id = (SELECT p1.parent_id FROM products p1 WHERE p1.id = @pid AND p1.parent_id IS NOT NULL);";

                                using (var syncCmd = new SQLiteCommand(syncVariantSql, conn, trans))
                                {
                                    syncCmd.Parameters.AddWithValue("@qtyDelta", requestedQtyMilli);
                                    syncCmd.Parameters.AddWithValue("@now", now);
                                    syncCmd.Parameters.AddWithValue("@pid", productId);
                                    syncCmd.ExecuteNonQuery();
                                }

                                // 3. Record in stock_movements (Double-Entry Ledger Invariant)
                                string insertSmSql = @"
                                    INSERT INTO stock_movements (
                                        id, product_id, movement_type, quantity_milli, reference_id, reference_type,
                                        unit_cost_piasters, note, created_at
                                    ) VALUES (
                                        @smId, @pid, 'PURCHASE', @qtyDelta, @shortageId, 'SHORTAGE_RECEIPT',
                                        @unitCost, @note, @now
                                    );";

                                using (var smCmd = new SQLiteCommand(insertSmSql, conn, trans))
                                {
                                    smCmd.Parameters.AddWithValue("@smId", Guid.NewGuid().ToString());
                                    smCmd.Parameters.AddWithValue("@pid", productId);
                                    smCmd.Parameters.AddWithValue("@qtyDelta", requestedQtyMilli);
                                    smCmd.Parameters.AddWithValue("@shortageId", id);
                                    smCmd.Parameters.AddWithValue("@unitCost", unitCostPiasters);
                                    smCmd.Parameters.AddWithValue("@note", "توريد واستلام مباشر من كشكول النواقص - صنف: " + (productName ?? productId));
                                    smCmd.Parameters.AddWithValue("@now", now);
                                    smCmd.ExecuteNonQuery();
                                }
                            }

                            string sql = @"
                                UPDATE shortage_entries 
                                SET status = @status, 
                                    purchase_id = CASE WHEN @purchase_id IS NOT NULL THEN @purchase_id ELSE purchase_id END,
                                    updated_at = @updated_at
                                WHERE id = @id;";

                            using (var cmd = new SQLiteCommand(sql, conn, trans))
                            {
                                cmd.Parameters.AddWithValue("@id", id);
                                cmd.Parameters.AddWithValue("@status", status);
                                cmd.Parameters.AddWithValue("@purchase_id", (object)purchaseId ?? DBNull.Value);
                                cmd.Parameters.AddWithValue("@updated_at", now);
                                cmd.ExecuteNonQuery();
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

        public void Delete(string id, string userId)
        {
            if (string.IsNullOrEmpty(id)) return;

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        using (var cmd = new SQLiteCommand("DELETE FROM shortage_entries WHERE id = @id;", conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@id", id);
                            cmd.ExecuteNonQuery();
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

        /// <summary>
        /// تجميع النواقص وتحويلها إلى مقترح طلبية شراء للمورد المفضل (Task 186-4)
        /// </summary>
        public ShortagePurchaseProposal ConvertToPurchaseProposal(List<string> shortageIds, string preferredSupplierId, string userId)
        {
            var proposal = new ShortagePurchaseProposal();
            if (shortageIds == null || shortageIds.Count == 0) return proposal;

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();

                // Lookup supplier name
                if (!string.IsNullOrEmpty(preferredSupplierId))
                {
                    proposal.SupplierId = preferredSupplierId;
                    using (var supCmd = new SQLiteCommand("SELECT name FROM suppliers WHERE id = @id LIMIT 1;", conn))
                    {
                        supCmd.Parameters.AddWithValue("@id", preferredSupplierId);
                        var sName = supCmd.ExecuteScalar();
                        if (sName != null) proposal.SupplierName = sName.ToString();
                    }
                }

                // Group entries by product_id or free_text
                var inParams = new List<string>();
                var cmdParams = new List<SQLiteParameter>();
                for (int i = 0; i < shortageIds.Count; i++)
                {
                    string pName = "@sid" + i;
                    inParams.Add(pName);
                    cmdParams.Add(new SQLiteParameter(pName, shortageIds[i]));
                }

                string sql = string.Format(@"
                    SELECT 
                        s.id, s.product_id, s.free_text, s.requested_qty_milli,
                        p.name AS product_name, p.barcode, p.cost_piasters, p.preferred_supplier_id
                    FROM shortage_entries s
                    LEFT JOIN products p ON s.product_id = p.id
                    WHERE s.id IN ({0})
                    ORDER BY p.name ASC;", string.Join(",", inParams.ToArray()));

                var dict = new Dictionary<string, ShortagePurchaseProposalLine>(StringComparer.OrdinalIgnoreCase);

                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    for (int i = 0; i < cmdParams.Count; i++) cmd.Parameters.Add(cmdParams[i]);
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            string pid = reader["product_id"] != DBNull.Value ? reader["product_id"].ToString() : null;
                            string name = reader["product_name"] != DBNull.Value ? reader["product_name"].ToString() : reader["free_text"].ToString();
                            string barcode = reader["barcode"] != DBNull.Value ? reader["barcode"].ToString() : "";
                            int qty = Convert.ToInt32(reader["requested_qty_milli"]);
                            long cost = reader["cost_piasters"] != DBNull.Value ? Convert.ToInt64(reader["cost_piasters"]) : 0;

                            string key = !string.IsNullOrEmpty(pid) ? pid : ("text_" + name);

                            if (!dict.ContainsKey(key))
                            {
                                dict[key] = new ShortagePurchaseProposalLine
                                {
                                    ProductId = pid,
                                    ProductName = name,
                                    Barcode = barcode,
                                    SuggestedQtyMilli = 0,
                                    CostPricePiasters = cost,
                                    ShortageCount = 0
                                };
                            }

                            dict[key].SuggestedQtyMilli += qty;
                            dict[key].ShortageCount += 1;
                        }
                    }
                }

                proposal.ShortageIds.AddRange(shortageIds);
                foreach (var kvp in dict)
                {
                    proposal.Lines.Add(kvp.Value);
                }

                // Mark selected shortage entries as 'ordered'
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        string updateSql = string.Format(@"
                            UPDATE shortage_entries 
                            SET status = 'ordered', updated_at = @now 
                            WHERE id IN ({0});", string.Join(",", inParams.ToArray()));

                        using (var upCmd = new SQLiteCommand(updateSql, conn, trans))
                        {
                            upCmd.Parameters.AddWithValue("@now", DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss"));
                            for (int i = 0; i < cmdParams.Count; i++) upCmd.Parameters.Add(cmdParams[i]);
                            upCmd.ExecuteNonQuery();
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

            return proposal;
        }

        /// <summary>
        /// تقرير المبيعات الضائعة بسبب النواقص (Story 129 / Task 186-5)
        /// محسوب بدقة حسابية مالية صحيحة 100% بدون أي فواصل عائمة (Rule 1)
        /// </summary>
        public LostSalesReportSummary GetLostSalesReport(string fromDate = null, string toDate = null, string source = null, string status = null)
        {
            var summary = new LostSalesReportSummary();
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();

                // تنظيف ذاتي فوري لأي أصناف أو قيود تالفة من بقايا استيراد الإكسل
                PurgeCorruptedEntriesInternal(conn);

                string filterClause = " WHERE 1=1 ";
                var parameters = new List<SQLiteParameter>();

                if (status == "unmet" || status == "active")
                {
                    filterClause += " AND s.status IN ('pending', 'open', 'ordered') ";
                }
                else if (!string.IsNullOrEmpty(status) && status != "all")
                {
                    filterClause += " AND s.status = @status ";
                    parameters.Add(new SQLiteParameter("@status", status));
                }
                else
                {
                    filterClause += " AND s.status != 'cancelled' ";
                }

                if (!string.IsNullOrEmpty(source) && source != "all")
                {
                    if (source == "customer" || source == "customer_request")
                    {
                        filterClause += " AND s.source IN ('customer_request', 'pos', 'manual_pos') ";
                    }
                    else
                    {
                        filterClause += " AND s.source = @source ";
                        parameters.Add(new SQLiteParameter("@source", source));
                    }
                }

                if (!string.IsNullOrEmpty(fromDate))
                {
                    filterClause += " AND s.created_at >= @fromDate ";
                    parameters.Add(new SQLiteParameter("@fromDate", fromDate));
                }
                if (!string.IsNullOrEmpty(toDate))
                {
                    filterClause += " AND s.created_at <= @toDate ";
                    parameters.Add(new SQLiteParameter("@toDate", toDate));
                }

                // عزل أي صفوف إجماليات أو تذييلات إكسل تالفة
                filterClause += @" AND (p.name IS NULL OR (p.name NOT LIKE '%عدد الأصناف%' AND p.name NOT LIKE '%إجمالي%' AND p.name NOT LIKE '%المجموع%'))
                                   AND (s.free_text IS NULL OR (s.free_text NOT LIKE '%عدد الأصناف%' AND s.free_text NOT LIKE '%إجمالي%')) ";

                string sql = string.Format(@"
                    SELECT 
                        s.product_id,
                        COALESCE(p.name, s.free_text) AS item_name,
                        COALESCE(p.barcode, '') AS barcode,
                        COALESCE(p.unit, 'قطعة') AS unit,
                        s.source,
                        s.status,
                        COUNT(s.id) AS request_count,
                        SUM(s.requested_qty_milli) AS total_requested_qty_milli,
                        COALESCE(p.price_piasters, 0) AS unit_price_piasters,
                        COALESCE(p.stock_quantity_milli, 0) AS current_stock_milli,
                        sup.name AS preferred_supplier_name
                    FROM shortage_entries s
                    LEFT JOIN products p ON s.product_id = p.id
                    LEFT JOIN suppliers sup ON p.preferred_supplier_id = sup.id
                    {0}
                    GROUP BY s.product_id, COALESCE(p.name, s.free_text)
                    ORDER BY (CAST(SUM(s.requested_qty_milli) AS INTEGER) * COALESCE(p.price_piasters, 0)) DESC, request_count DESC;", filterClause);

                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    for (int i = 0; i < parameters.Count; i++) cmd.Parameters.Add(parameters[i]);

                    using (var reader = cmd.ExecuteReader())
                    {
                        int totalRequests = 0;
                        int customerRequests = 0;
                        int autoRequests = 0;
                        long totalRevenue = 0;

                        while (reader.Read())
                        {
                            string pid = reader["product_id"] != DBNull.Value ? reader["product_id"].ToString() : null;
                            string name = reader["item_name"].ToString();
                            string barcode = reader["barcode"] != DBNull.Value ? reader["barcode"].ToString() : "";
                            string unit = reader["unit"] != DBNull.Value ? reader["unit"].ToString() : "قطعة";
                            string rowSource = reader["source"] != DBNull.Value ? reader["source"].ToString() : "pos";
                            string rowStatus = reader["status"] != DBNull.Value ? reader["status"].ToString() : "pending";
                            int count = Convert.ToInt32(reader["request_count"]);
                            int totalQty = Convert.ToInt32(reader["total_requested_qty_milli"]);
                            long price = Convert.ToInt64(reader["unit_price_piasters"]);
                            int currentStock = Convert.ToInt32(reader["current_stock_milli"]);
                            string supName = reader["preferred_supplier_name"] != DBNull.Value ? reader["preferred_supplier_name"].ToString() : "";

                            // حساب القيمة بدقة الأعداد الصحيحة الصارمة (Rule 1)
                            long lostRev = ((long)totalQty * price + 500) / 1000;

                            summary.Items.Add(new LostSalesReportItem
                            {
                                ProductId = pid,
                                ItemName = name,
                                Barcode = barcode,
                                Unit = unit,
                                Source = rowSource,
                                Status = rowStatus,
                                RequestCount = count,
                                TotalRequestedQtyMilli = totalQty,
                                UnitPricePiasters = price,
                                EstimatedLostRevenuePiasters = lostRev,
                                CurrentStockMilli = currentStock,
                                PreferredSupplierName = supName
                            });

                            totalRequests += count;
                            if (rowSource == "customer_request" || rowSource == "pos" || rowSource == "manual_pos")
                            {
                                customerRequests += count;
                            }
                            else
                            {
                                autoRequests += count;
                            }
                            totalRevenue += lostRev;
                        }

                        summary.TotalRequests = totalRequests;
                        summary.UniqueProductsCount = summary.Items.Count;
                        summary.TotalCustomerRequestsCount = customerRequests;
                        summary.TotalAutoReorderCount = autoRequests;
                        summary.TotalLostRevenuePiasters = totalRevenue;
                    }
                }
            }
            return summary;
        }

        /// <summary>
        /// تنظيف ذاتي لأي صفوف أو مجاميع تالفة تم استيرادها خطأ من تذييل ملفات الإكسل
        /// </summary>
        public void PurgeCorruptedEntries()
        {
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                PurgeCorruptedEntriesInternal(conn);
            }
        }

        private static void PurgeCorruptedEntriesInternal(SQLiteConnection conn)
        {
            try
            {
                using (var cmd = new SQLiteCommand(@"
                    DELETE FROM shortage_entries 
                    WHERE product_id IN (
                        SELECT id FROM products 
                        WHERE name LIKE '%عدد الأصناف%' OR name LIKE '%إجمالي%' OR name LIKE '%المجموع%'
                    )
                    OR free_text LIKE '%عدد الأصناف%';

                    DELETE FROM products 
                    WHERE name LIKE '%عدد الأصناف%' OR name LIKE '%إجمالي%' OR name LIKE '%المجموع%';
                ", conn))
                {
                    cmd.ExecuteNonQuery();
                }
            }
            catch
            {
                // إجراء تنظيف ذاتي صامت
            }
        }

        /// <summary>
        /// فحص وتحديث تلقائي ذكي للأصناف التي تم استلامها وتوريدها للمخزن أو زاد رصيدها عن حد الطلب
        /// لتحويل حالتها تلقائياً إلى 'received' دون الحاجة للتدخل اليدوي
        /// </summary>
        public void AutoResolveReplenishedShortages(SQLiteConnection conn)
        {
            try
            {
                string now = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss");
                string autoResolveSql = @"
                    UPDATE shortage_entries
                    SET status = 'received',
                        updated_at = @now,
                        purchase_id = COALESCE(purchase_id, (
                            SELECT pi.purchase_id 
                            FROM purchase_items pi 
                            WHERE pi.product_id = shortage_entries.product_id 
                            ORDER BY pi.created_at DESC 
                            LIMIT 1
                        )),
                        notes = CASE 
                            WHEN notes IS NULL OR notes = '' THEN 'تم الاستلام وتوريد الرصيد للمخزن تلقائياً'
                            ELSE notes || ' | تم الاستلام وتوريد الرصيد للمخزن تلقائياً'
                        END
                    WHERE status IN ('open', 'pending', 'ordered')
                      AND product_id IS NOT NULL
                      AND product_id IN (
                          SELECT p.id 
                          FROM products p 
                          WHERE p.stock_quantity_milli > 0 
                            AND (
                                (p.min_stock_quantity_milli > 0 AND p.stock_quantity_milli >= p.min_stock_quantity_milli)
                                OR p.stock_quantity_milli >= 1000
                            )
                            AND (
                                EXISTS (SELECT 1 FROM purchase_items pi WHERE pi.product_id = p.id)
                                OR p.stock_quantity_milli >= shortage_entries.requested_qty_milli
                            )
                      );";

                using (var cmd = new SQLiteCommand(autoResolveSql, conn))
                {
                    cmd.Parameters.AddWithValue("@now", now);
                    cmd.ExecuteNonQuery();
                }
            }
            catch
            {
                // Non-blocking auto-sync
            }
        }

        private static ShortageEntry MapReaderToEntry(SQLiteDataReader reader)
        {
            var e = new ShortageEntry();
            e.Id = reader["id"].ToString();
            e.ProductId = reader["product_id"] != DBNull.Value ? reader["product_id"].ToString() : null;
            e.FreeText = reader["free_text"].ToString();
            e.RequestedQtyMilli = Convert.ToInt32(reader["requested_qty_milli"]);
            e.CustomerId = reader["customer_id"] != DBNull.Value ? reader["customer_id"].ToString() : null;
            e.CustomerName = reader["customer_name"] != DBNull.Value ? reader["customer_name"].ToString() : null;
            e.CustomerPhone = reader["customer_phone"] != DBNull.Value ? reader["customer_phone"].ToString() : null;
            e.Source = reader["source"] != DBNull.Value ? reader["source"].ToString() : "pos";
            string rawStatus = reader["status"] != DBNull.Value ? reader["status"].ToString() : "pending";
            e.Status = (rawStatus == "open") ? "pending" : rawStatus;
            e.Priority = reader["priority"] != DBNull.Value ? reader["priority"].ToString() : "normal";
            e.PurchaseId = reader["purchase_id"] != DBNull.Value ? reader["purchase_id"].ToString() : null;
            e.Notes = reader["notes"] != DBNull.Value ? reader["notes"].ToString() : null;
            e.CreatedBy = reader["created_by"].ToString();
            e.CreatedAt = reader["created_at"].ToString();
            e.UpdatedAt = reader["updated_at"] != DBNull.Value ? reader["updated_at"].ToString() : null;

            e.ProductName = reader["product_name"] != DBNull.Value ? reader["product_name"].ToString() : e.FreeText;
            e.ProductBarcode = reader["product_barcode"] != DBNull.Value ? reader["product_barcode"].ToString() : null;
            e.UnitPricePiasters = reader["price_piasters"] != DBNull.Value ? Convert.ToInt64(reader["price_piasters"]) : 0;
            e.CostPiasters = reader["cost_piasters"] != DBNull.Value ? Convert.ToInt64(reader["cost_piasters"]) : 0;
            e.PreferredSupplierId = reader["preferred_supplier_id"] != DBNull.Value ? reader["preferred_supplier_id"].ToString() : null;
            e.PreferredSupplierName = reader["preferred_supplier_name"] != DBNull.Value ? reader["preferred_supplier_name"].ToString() : null;
            e.CreatedByName = reader["created_by_name"] != DBNull.Value ? reader["created_by_name"].ToString() : null;
            e.CurrentStockMilli = reader["current_stock_milli"] != DBNull.Value ? Convert.ToInt32(reader["current_stock_milli"]) : 0;
            e.MinStockMilli = reader["min_stock_milli"] != DBNull.Value ? Convert.ToInt32(reader["min_stock_milli"]) : 0;
            e.Unit = reader["product_unit"] != DBNull.Value ? reader["product_unit"].ToString() : "قطعة";

            return e;
        }
    }
}
