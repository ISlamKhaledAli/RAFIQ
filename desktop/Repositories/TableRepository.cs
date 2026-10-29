using System;
using System.Collections.Generic;
using System.Data.SQLite;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using RafiqPOS.Models;

namespace RafiqPOS.Repositories
{
    public class TableRepository
    {
        private readonly string _connectionString;
        private readonly AuditLogRepository _auditRepo;

        public TableRepository(string connectionString, AuditLogRepository auditRepo)
        {
            _connectionString = connectionString;
            _auditRepo = auditRepo;
        }

        public List<RestaurantTable> GetAll(bool includeInactive = false)
        {
            var list = new List<RestaurantTable>();
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    SELECT t.*,
                           COALESCE(h.total_piasters, h.subtotal_piasters, 0) AS current_total_piasters,
                           COALESCE(h.items_count, 0) AS current_items_count,
                           h.cart_json,
                           h.printed_kot_quantities_json
                    FROM restaurant_tables t
                    LEFT JOIN held_sales h ON t.active_held_sale_id = h.id
                    WHERE (@inc = 1 OR t.is_active = 1)
                    ORDER BY t.display_order ASC, t.name ASC;
                ";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@inc", includeInactive ? 1 : 0);
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            list.Add(MapTable(reader));
                        }
                    }
                }
            }
            return list;
        }

        public RestaurantTable GetById(string id)
        {
            if (string.IsNullOrWhiteSpace(id)) return null;
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                return GetByIdInternal(conn, null, id);
            }
        }

        public RestaurantTable GetByIdInternal(SQLiteConnection conn, SQLiteTransaction trans, string id)
        {
            string sql = @"
                SELECT t.*,
                       COALESCE(h.total_piasters, h.subtotal_piasters, 0) AS current_total_piasters,
                       COALESCE(h.items_count, 0) AS current_items_count,
                       h.cart_json,
                       h.printed_kot_quantities_json
                FROM restaurant_tables t
                LEFT JOIN held_sales h ON t.active_held_sale_id = h.id
                WHERE t.id = @id
                LIMIT 1;
            ";
            using (var cmd = new SQLiteCommand(sql, conn, trans))
            {
                cmd.Parameters.AddWithValue("@id", id);
                using (var reader = cmd.ExecuteReader())
                {
                    if (reader.Read())
                    {
                        return MapTable(reader);
                    }
                }
            }
            return null;
        }

        public RestaurantTable SaveTable(RestaurantTable table)
        {
            if (table == null) throw new ArgumentNullException("table");
            if (string.IsNullOrWhiteSpace(table.Name)) throw new InvalidOperationException("اسم الطاولة مطلوب");

            string nowIso = DateTime.UtcNow.ToString("o");
            if (string.IsNullOrWhiteSpace(table.Id))
            {
                table.Id = "tbl_" + Guid.NewGuid().ToString("N").Substring(0, 12);
                table.CreatedAt = nowIso;
            }
            if (string.IsNullOrWhiteSpace(table.ZoneName))
            {
                table.ZoneName = "الصالة الداخلية";
            }
            if (table.Capacity <= 0) table.Capacity = 4;
            if (string.IsNullOrWhiteSpace(table.Status)) table.Status = "available";
            table.UpdatedAt = nowIso;

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    INSERT INTO restaurant_tables (
                        id, name, zone_name, capacity, status, active_held_sale_id,
                        waiter_name, guests_count, opened_at, display_order, is_active,
                        created_at, updated_at
                    ) VALUES (
                        @id, @name, @zone, @cap, @status, @heldId,
                        @waiter, @guests, @openedAt, @order, @active,
                        @createdAt, @updatedAt
                    )
                    ON CONFLICT(id) DO UPDATE SET
                        name = excluded.name,
                        zone_name = excluded.zone_name,
                        capacity = excluded.capacity,
                        display_order = excluded.display_order,
                        is_active = excluded.is_active,
                        updated_at = excluded.updated_at;
                ";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@id", table.Id);
                    cmd.Parameters.AddWithValue("@name", table.Name.Trim());
                    cmd.Parameters.AddWithValue("@zone", table.ZoneName.Trim());
                    cmd.Parameters.AddWithValue("@cap", table.Capacity);
                    cmd.Parameters.AddWithValue("@status", table.Status);
                    cmd.Parameters.AddWithValue("@heldId", (object)table.ActiveHeldSaleId ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@waiter", (object)table.WaiterName ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@guests", table.GuestsCount);
                    cmd.Parameters.AddWithValue("@openedAt", (object)table.OpenedAt ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@order", table.DisplayOrder);
                    cmd.Parameters.AddWithValue("@active", table.IsActive ? 1 : 0);
                    cmd.Parameters.AddWithValue("@createdAt", table.CreatedAt ?? nowIso);
                    cmd.Parameters.AddWithValue("@updatedAt", nowIso);
                    cmd.ExecuteNonQuery();
                }
                return GetByIdInternal(conn, null, table.Id);
            }
        }

        public bool DeleteTable(string tableId)
        {
            if (string.IsNullOrWhiteSpace(tableId)) return false;
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                var existing = GetByIdInternal(conn, null, tableId);
                if (existing == null) return false;
                if (existing.Status == "occupied" || existing.Status == "bill_printed" || !string.IsNullOrEmpty(existing.ActiveHeldSaleId))
                {
                    throw new InvalidOperationException("لا يمكن حذف طاولة مشغولة حالياً قبل إغلاق أو تصفية الفاتورة المفتوحة عليها.");
                }

                using (var cmd = new SQLiteCommand("DELETE FROM restaurant_tables WHERE id = @id;", conn))
                {
                    cmd.Parameters.AddWithValue("@id", tableId);
                    return cmd.ExecuteNonQuery() > 0;
                }
            }
        }

        public RestaurantTable OpenTable(string tableId, string waiterName, int guestsCount, string cashierId)
        {
            if (string.IsNullOrWhiteSpace(tableId)) throw new ArgumentNullException("tableId");
            string nowIso = DateTime.UtcNow.ToString("o");

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        var table = GetByIdInternal(conn, trans, tableId);
                        if (table == null) throw new InvalidOperationException("الطاولة غير موجودة");

                        string heldId = table.ActiveHeldSaleId;
                        if (string.IsNullOrEmpty(heldId))
                        {
                            heldId = "hld_tbl_" + Guid.NewGuid().ToString("N").Substring(0, 12);
                            string insHeld = @"
                                INSERT INTO held_sales (
                                    id, hold_label, customer_id, customer_name, items_count,
                                    subtotal_piasters, discount_piasters, total_piasters,
                                    cart_json, notes, cashier_id, created_at,
                                    table_id, table_name, order_type, waiter_name, guests_count, printed_kot_quantities_json
                                ) VALUES (
                                    @id, @label, NULL, NULL, 0,
                                    0, 0, 0,
                                    '[]', '', @cashierId, @now,
                                    @tableId, @tableName, 'dine_in', @waiter, @guests, '{}'
                                );
                            ";
                            using (var cmd = new SQLiteCommand(insHeld, conn, trans))
                            {
                                cmd.Parameters.AddWithValue("@id", heldId);
                                cmd.Parameters.AddWithValue("@label", "طاولة: " + table.Name);
                                cmd.Parameters.AddWithValue("@cashierId", (object)cashierId ?? DBNull.Value);
                                cmd.Parameters.AddWithValue("@now", nowIso);
                                cmd.Parameters.AddWithValue("@tableId", table.Id);
                                cmd.Parameters.AddWithValue("@tableName", table.Name);
                                cmd.Parameters.AddWithValue("@waiter", (object)waiterName ?? DBNull.Value);
                                cmd.Parameters.AddWithValue("@guests", guestsCount > 0 ? guestsCount : table.Capacity);
                                cmd.ExecuteNonQuery();
                            }
                        }
                        else
                        {
                            using (var cmd = new SQLiteCommand("UPDATE held_sales SET waiter_name = COALESCE(@waiter, waiter_name), guests_count = CASE WHEN @guests > 0 THEN @guests ELSE guests_count END WHERE id = @hid;", conn, trans))
                            {
                                cmd.Parameters.AddWithValue("@waiter", (object)waiterName ?? DBNull.Value);
                                cmd.Parameters.AddWithValue("@guests", guestsCount);
                                cmd.Parameters.AddWithValue("@hid", heldId);
                                cmd.ExecuteNonQuery();
                            }
                        }

                        string updTable = @"
                            UPDATE restaurant_tables
                            SET status = CASE WHEN status = 'bill_printed' THEN 'bill_printed' ELSE 'occupied' END,
                                active_held_sale_id = @heldId,
                                waiter_name = COALESCE(@waiter, waiter_name),
                                guests_count = CASE WHEN @guests > 0 THEN @guests ELSE CASE WHEN guests_count > 0 THEN guests_count ELSE capacity END END,
                                opened_at = COALESCE(opened_at, @now),
                                updated_at = @now
                            WHERE id = @id;
                        ";
                        using (var cmd = new SQLiteCommand(updTable, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@heldId", heldId);
                            cmd.Parameters.AddWithValue("@waiter", string.IsNullOrWhiteSpace(waiterName) ? (object)DBNull.Value : waiterName.Trim());
                            cmd.Parameters.AddWithValue("@guests", guestsCount);
                            cmd.Parameters.AddWithValue("@now", nowIso);
                            cmd.Parameters.AddWithValue("@id", table.Id);
                            cmd.ExecuteNonQuery();
                        }

                        var updated = GetByIdInternal(conn, trans, table.Id);
                        trans.Commit();
                        return updated;
                    }
                    catch
                    {
                        trans.Rollback();
                        throw;
                    }
                }
            }
        }

        public RestaurantTable UpdateTableOrder(
            string tableId,
            string cartJson,
            long subtotalPiasters,
            long discountPiasters,
            long totalPiasters,
            int itemsCount,
            string notes,
            string waiterName,
            int guestsCount,
            string cashierId,
            string printedKotQuantitiesJson = null)
        {
            if (string.IsNullOrWhiteSpace(tableId)) throw new ArgumentNullException("tableId");
            string nowIso = DateTime.UtcNow.ToString("o");

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        var table = GetByIdInternal(conn, trans, tableId);
                        if (table == null) throw new InvalidOperationException("الطاولة غير موجودة");

                        string heldId = table.ActiveHeldSaleId;
                        if (string.IsNullOrEmpty(heldId))
                        {
                            heldId = "hld_tbl_" + Guid.NewGuid().ToString("N").Substring(0, 12);
                        }

                        string effWaiter = !string.IsNullOrWhiteSpace(waiterName) ? waiterName.Trim() : table.WaiterName;
                        int effGuests = guestsCount > 0 ? guestsCount : (table.GuestsCount > 0 ? table.GuestsCount : table.Capacity);
                        string effKotJson = !string.IsNullOrWhiteSpace(printedKotQuantitiesJson)
                            ? printedKotQuantitiesJson
                            : (!string.IsNullOrWhiteSpace(table.PrintedKotQuantitiesJson) ? table.PrintedKotQuantitiesJson : "{}");

                        string upsertHeld = @"
                            INSERT OR REPLACE INTO held_sales (
                                id, hold_label, customer_id, customer_name, items_count,
                                subtotal_piasters, discount_piasters, total_piasters,
                                cart_json, notes, cashier_id, created_at,
                                table_id, table_name, order_type, waiter_name, guests_count, printed_kot_quantities_json
                            ) VALUES (
                                @id, @label, NULL, NULL, @itemsCount,
                                @subtotal, @discount, @total,
                                @cartJson, @notes, @cashierId, @createdAt,
                                @tableId, @tableName, 'dine_in', @waiter, @guests, @kotJson
                            );
                        ";
                        using (var cmd = new SQLiteCommand(upsertHeld, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@id", heldId);
                            cmd.Parameters.AddWithValue("@label", "طاولة: " + table.Name);
                            cmd.Parameters.AddWithValue("@itemsCount", itemsCount);
                            cmd.Parameters.AddWithValue("@subtotal", subtotalPiasters);
                            cmd.Parameters.AddWithValue("@discount", discountPiasters);
                            cmd.Parameters.AddWithValue("@total", totalPiasters);
                            cmd.Parameters.AddWithValue("@cartJson", string.IsNullOrWhiteSpace(cartJson) ? "[]" : cartJson);
                            cmd.Parameters.AddWithValue("@notes", (object)notes ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@cashierId", (object)cashierId ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@createdAt", table.OpenedAt ?? nowIso);
                            cmd.Parameters.AddWithValue("@tableId", table.Id);
                            cmd.Parameters.AddWithValue("@tableName", table.Name);
                            cmd.Parameters.AddWithValue("@waiter", (object)effWaiter ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@guests", effGuests);
                            cmd.Parameters.AddWithValue("@kotJson", effKotJson);
                            cmd.ExecuteNonQuery();
                        }

                        string updTable = @"
                            UPDATE restaurant_tables
                            SET status = CASE WHEN status = 'available' OR status = 'reserved' THEN 'occupied' ELSE status END,
                                active_held_sale_id = @heldId,
                                waiter_name = @waiter,
                                guests_count = @guests,
                                opened_at = COALESCE(opened_at, @now),
                                updated_at = @now
                            WHERE id = @id;
                        ";
                        using (var cmd = new SQLiteCommand(updTable, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@heldId", heldId);
                            cmd.Parameters.AddWithValue("@waiter", (object)effWaiter ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@guests", effGuests);
                            cmd.Parameters.AddWithValue("@now", nowIso);
                            cmd.Parameters.AddWithValue("@id", table.Id);
                            cmd.ExecuteNonQuery();
                        }

                        var updated = GetByIdInternal(conn, trans, table.Id);
                        trans.Commit();
                        return updated;
                    }
                    catch
                    {
                        trans.Rollback();
                        throw;
                    }
                }
            }
        }

        public RestaurantTable TransferTable(string fromTableId, string toTableId, string userId)
        {
            if (string.IsNullOrWhiteSpace(fromTableId) || string.IsNullOrWhiteSpace(toTableId))
                throw new InvalidOperationException("يرجى تحديد الطاولة المصدر والطاولة الهدف.");
            if (fromTableId == toTableId)
                throw new InvalidOperationException("لا يمكن نقل الطاولة إلى نفسها.");

            string nowIso = DateTime.UtcNow.ToString("o");
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        var fromTable = GetByIdInternal(conn, trans, fromTableId);
                        var toTable = GetByIdInternal(conn, trans, toTableId);
                        if (fromTable == null || toTable == null)
                            throw new InvalidOperationException("إحدى الطاولات المحددة غير موجودة.");
                        if (fromTable.Status == "available" && string.IsNullOrEmpty(fromTable.ActiveHeldSaleId))
                            throw new InvalidOperationException("الطاولة المصدر فارغة ولا يوجد عليها طلب لنقله.");
                        if (toTable.Status == "occupied" || toTable.Status == "bill_printed" || !string.IsNullOrEmpty(toTable.ActiveHeldSaleId))
                            throw new InvalidOperationException("الطاولة الهدف مشغولة بالفعل. استخدم دمج الطاولات إذا كنت ترغب في جمع الطلبين.");

                        if (!string.IsNullOrEmpty(fromTable.ActiveHeldSaleId))
                        {
                            using (var cmd = new SQLiteCommand("UPDATE held_sales SET table_id = @toId, table_name = @toName, hold_label = @label WHERE id = @hid;", conn, trans))
                            {
                                cmd.Parameters.AddWithValue("@toId", toTable.Id);
                                cmd.Parameters.AddWithValue("@toName", toTable.Name);
                                cmd.Parameters.AddWithValue("@label", "طاولة: " + toTable.Name);
                                cmd.Parameters.AddWithValue("@hid", fromTable.ActiveHeldSaleId);
                                cmd.ExecuteNonQuery();
                            }
                        }

                        using (var cmd = new SQLiteCommand(@"
                            UPDATE restaurant_tables
                            SET status = @status,
                                active_held_sale_id = @heldId,
                                waiter_name = @waiter,
                                guests_count = @guests,
                                opened_at = @openedAt,
                                updated_at = @now
                            WHERE id = @toId;", conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@status", fromTable.Status == "bill_printed" ? "bill_printed" : "occupied");
                            cmd.Parameters.AddWithValue("@heldId", (object)fromTable.ActiveHeldSaleId ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@waiter", (object)fromTable.WaiterName ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@guests", fromTable.GuestsCount);
                            cmd.Parameters.AddWithValue("@openedAt", (object)fromTable.OpenedAt ?? nowIso);
                            cmd.Parameters.AddWithValue("@now", nowIso);
                            cmd.Parameters.AddWithValue("@toId", toTable.Id);
                            cmd.ExecuteNonQuery();
                        }

                        using (var cmd = new SQLiteCommand(@"
                            UPDATE restaurant_tables
                            SET status = 'available',
                                active_held_sale_id = NULL,
                                waiter_name = NULL,
                                guests_count = 0,
                                opened_at = NULL,
                                updated_at = @now
                            WHERE id = @fromId;", conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@now", nowIso);
                            cmd.Parameters.AddWithValue("@fromId", fromTable.Id);
                            cmd.ExecuteNonQuery();
                        }

                        if (_auditRepo != null)
                        {
                            _auditRepo.Log(conn, trans, new AuditLog
                            {
                                Id = "aud_" + Guid.NewGuid().ToString("N"),
                                UserId = string.IsNullOrEmpty(userId) ? "system" : userId,
                                Action = "TABLE_TRANSFER",
                                EntityType = "TABLE",
                                EntityId = toTable.Id,
                                DetailsJson = string.Format("نقل الطلب من {0} إلى {1}", fromTable.Name, toTable.Name),
                                CreatedAt = nowIso
                            });
                        }

                        var updatedTarget = GetByIdInternal(conn, trans, toTable.Id);
                        trans.Commit();
                        return updatedTarget;
                    }
                    catch
                    {
                        trans.Rollback();
                        throw;
                    }
                }
            }
        }

        public RestaurantTable MergeTables(string sourceTableId, string targetTableId, string userId)
        {
            if (string.IsNullOrWhiteSpace(sourceTableId) || string.IsNullOrWhiteSpace(targetTableId))
                throw new InvalidOperationException("يرجى تحديد الطاولتين المراد دمجهما.");
            if (sourceTableId == targetTableId)
                throw new InvalidOperationException("لا يمكن دمج الطاولة مع نفسها.");

            string nowIso = DateTime.UtcNow.ToString("o");
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        var src = GetByIdInternal(conn, trans, sourceTableId);
                        var tgt = GetByIdInternal(conn, trans, targetTableId);
                        if (src == null || tgt == null)
                            throw new InvalidOperationException("إحدى الطاولات المحددة غير موجودة.");
                        if (string.IsNullOrEmpty(src.ActiveHeldSaleId))
                            throw new InvalidOperationException("الطاولة المصدر لا تحتوي على طلب مفتوح لدمجه.");

                        JArray srcArray = ParseCartArray(src.CartJson);
                        JArray tgtArray = ParseCartArray(tgt.CartJson);

                        for (int i = 0; i < srcArray.Count; i++)
                        {
                            tgtArray.Add(srcArray[i]);
                        }

                        long mergedSubtotal = 0;
                        int mergedCount = tgtArray.Count;
                        for (int i = 0; i < tgtArray.Count; i++)
                        {
                            var token = tgtArray[i] as JObject;
                            if (token != null)
                            {
                                long lineTotal = ReadJObjectLong(token, "totalPiasters", ReadJObjectLong(token, "subtotalPiasters", 0));
                                if (lineTotal <= 0)
                                {
                                    long unitPrice = ReadJObjectLong(token, "unitPricePiasters", ReadJObjectLong(token, "pricePiasters", 0));
                                    long qtyMilli = ReadJObjectLong(token, "quantityMilli", 1000);
                                    lineTotal = (unitPrice * qtyMilli) / 1000L;
                                }
                                mergedSubtotal += lineTotal;
                            }
                        }

                        var mergedKot = new Dictionary<string, long>();
                        MergeKotDictionaries(mergedKot, src.PrintedKotQuantitiesJson);
                        MergeKotDictionaries(mergedKot, tgt.PrintedKotQuantitiesJson);
                        string mergedKotJson = JsonConvert.SerializeObject(mergedKot);

                        string targetHeldId = tgt.ActiveHeldSaleId;
                        if (string.IsNullOrEmpty(targetHeldId))
                        {
                            targetHeldId = "hld_tbl_" + Guid.NewGuid().ToString("N").Substring(0, 12);
                        }

                        int mergedGuests = src.GuestsCount + tgt.GuestsCount;
                        string mergedWaiter = !string.IsNullOrWhiteSpace(tgt.WaiterName) ? tgt.WaiterName : src.WaiterName;

                        string upsertHeld = @"
                            INSERT OR REPLACE INTO held_sales (
                                id, hold_label, customer_id, customer_name, items_count,
                                subtotal_piasters, discount_piasters, total_piasters,
                                cart_json, notes, cashier_id, created_at,
                                table_id, table_name, order_type, waiter_name, guests_count, printed_kot_quantities_json
                            ) VALUES (
                                @id, @label, NULL, NULL, @itemsCount,
                                @subtotal, 0, @subtotal,
                                @cartJson, @notes, NULL, @createdAt,
                                @tableId, @tableName, 'dine_in', @waiter, @guests, @kotJson
                            );
                        ";
                        using (var cmd = new SQLiteCommand(upsertHeld, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@id", targetHeldId);
                            cmd.Parameters.AddWithValue("@label", "طاولة: " + tgt.Name);
                            cmd.Parameters.AddWithValue("@itemsCount", mergedCount);
                            cmd.Parameters.AddWithValue("@subtotal", mergedSubtotal);
                            cmd.Parameters.AddWithValue("@cartJson", tgtArray.ToString(Formatting.None));
                            cmd.Parameters.AddWithValue("@notes", string.Format("مدمجة من {0}", src.Name));
                            cmd.Parameters.AddWithValue("@createdAt", tgt.OpenedAt ?? src.OpenedAt ?? nowIso);
                            cmd.Parameters.AddWithValue("@tableId", tgt.Id);
                            cmd.Parameters.AddWithValue("@tableName", tgt.Name);
                            cmd.Parameters.AddWithValue("@waiter", (object)mergedWaiter ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@guests", mergedGuests);
                            cmd.Parameters.AddWithValue("@kotJson", mergedKotJson);
                            cmd.ExecuteNonQuery();
                        }

                        if (!string.IsNullOrEmpty(src.ActiveHeldSaleId) && src.ActiveHeldSaleId != targetHeldId)
                        {
                            using (var delCmd = new SQLiteCommand("DELETE FROM held_sales WHERE id = @hid;", conn, trans))
                            {
                                delCmd.Parameters.AddWithValue("@hid", src.ActiveHeldSaleId);
                                delCmd.ExecuteNonQuery();
                            }
                        }

                        using (var cmd = new SQLiteCommand(@"
                            UPDATE restaurant_tables
                            SET status = 'occupied',
                                active_held_sale_id = @heldId,
                                waiter_name = @waiter,
                                guests_count = @guests,
                                opened_at = COALESCE(opened_at, @now),
                                updated_at = @now
                            WHERE id = @id;", conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@heldId", targetHeldId);
                            cmd.Parameters.AddWithValue("@waiter", (object)mergedWaiter ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@guests", mergedGuests);
                            cmd.Parameters.AddWithValue("@now", nowIso);
                            cmd.Parameters.AddWithValue("@id", tgt.Id);
                            cmd.ExecuteNonQuery();
                        }

                        using (var cmd = new SQLiteCommand(@"
                            UPDATE restaurant_tables
                            SET status = 'available',
                                active_held_sale_id = NULL,
                                waiter_name = NULL,
                                guests_count = 0,
                                opened_at = NULL,
                                updated_at = @now
                            WHERE id = @id;", conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@now", nowIso);
                            cmd.Parameters.AddWithValue("@id", src.Id);
                            cmd.ExecuteNonQuery();
                        }

                        if (_auditRepo != null)
                        {
                            _auditRepo.Log(conn, trans, new AuditLog
                            {
                                Id = "aud_" + Guid.NewGuid().ToString("N"),
                                UserId = string.IsNullOrEmpty(userId) ? "system" : userId,
                                Action = "TABLE_MERGE",
                                EntityType = "TABLE",
                                EntityId = tgt.Id,
                                DetailsJson = string.Format("دمج الطاولة {0} في الطاولة {1}", src.Name, tgt.Name),
                                CreatedAt = nowIso
                            });
                        }

                        var updated = GetByIdInternal(conn, trans, tgt.Id);
                        trans.Commit();
                        return updated;
                    }
                    catch
                    {
                        trans.Rollback();
                        throw;
                    }
                }
            }
        }

        public TableSplitResult SplitTableBill(string tableId, List<TableSplitItemRequest> splitItems, string userId)
        {
            if (string.IsNullOrWhiteSpace(tableId)) throw new ArgumentNullException("tableId");
            if (splitItems == null || splitItems.Count == 0)
                throw new InvalidOperationException("يرجى اختيار صنف واحد على الأقل لتقسيم الفاتورة.");

            string nowIso = DateTime.UtcNow.ToString("o");
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        var table = GetByIdInternal(conn, trans, tableId);
                        if (table == null || string.IsNullOrEmpty(table.ActiveHeldSaleId))
                            throw new InvalidOperationException("لا يوجد طلب مفتوح على هذه الطاولة لتقسيمه.");

                        JArray currentCart = ParseCartArray(table.CartJson);
                        JArray splitCart = new JArray();
                        JArray remainingCart = new JArray();

                        long splitSubtotal = 0;
                        long remainingSubtotal = 0;

                        for (int idx = 0; idx < currentCart.Count; idx++)
                        {
                            var lineObj = currentCart[idx] as JObject;
                            if (lineObj == null) continue;

                            long lineQtyMilli = ReadJObjectLong(lineObj, "quantityMilli", 1000);
                            long unitPrice = ReadJObjectLong(lineObj, "unitPricePiasters", ReadJObjectLong(lineObj, "pricePiasters", 0));

                            long requestedSplitMilli = 0;
                            for (int s = 0; s < splitItems.Count; s++)
                            {
                                if (splitItems[s].CartLineIndex == idx && splitItems[s].QuantityMilli > 0)
                                {
                                    requestedSplitMilli = Math.Min(lineQtyMilli, splitItems[s].QuantityMilli);
                                    break;
                                }
                            }

                            if (requestedSplitMilli > 0)
                            {
                                JObject splitCopy = (JObject)lineObj.DeepClone();
                                long splitLineTotal = (unitPrice * requestedSplitMilli) / 1000L;
                                splitCopy["quantityMilli"] = requestedSplitMilli;
                                splitCopy["quantity"] = requestedSplitMilli / 1000.0;
                                splitCopy["totalPiasters"] = splitLineTotal;
                                splitCart.Add(splitCopy);
                                splitSubtotal += splitLineTotal;

                                long remQtyMilli = lineQtyMilli - requestedSplitMilli;
                                if (remQtyMilli > 0)
                                {
                                    JObject remCopy = (JObject)lineObj.DeepClone();
                                    long remLineTotal = (unitPrice * remQtyMilli) / 1000L;
                                    remCopy["quantityMilli"] = remQtyMilli;
                                    remCopy["quantity"] = remQtyMilli / 1000.0;
                                    remCopy["totalPiasters"] = remLineTotal;
                                    remainingCart.Add(remCopy);
                                    remainingSubtotal += remLineTotal;
                                }
                            }
                            else
                            {
                                long remLineTotal = (unitPrice * lineQtyMilli) / 1000L;
                                remainingCart.Add(lineObj);
                                remainingSubtotal += remLineTotal;
                            }
                        }

                        if (splitCart.Count == 0)
                        {
                            throw new InvalidOperationException("لم يتم تحديد كميات صالحة لفصلها من الفاتورة.");
                        }

                        using (var cmd = new SQLiteCommand(@"
                            UPDATE held_sales
                            SET items_count = @cnt,
                                subtotal_piasters = @sub,
                                total_piasters = @sub,
                                cart_json = @cart
                            WHERE id = @hid;", conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@cnt", remainingCart.Count);
                            cmd.Parameters.AddWithValue("@sub", remainingSubtotal);
                            cmd.Parameters.AddWithValue("@cart", remainingCart.ToString(Formatting.None));
                            cmd.Parameters.AddWithValue("@hid", table.ActiveHeldSaleId);
                            cmd.ExecuteNonQuery();
                        }

                        if (_auditRepo != null)
                        {
                            _auditRepo.Log(conn, trans, new AuditLog
                            {
                                Id = "aud_" + Guid.NewGuid().ToString("N"),
                                UserId = string.IsNullOrEmpty(userId) ? "system" : userId,
                                Action = "TABLE_SPLIT_BILL",
                                EntityType = "TABLE",
                                EntityId = table.Id,
                                DetailsJson = string.Format("تقسيم شيك الطاولة {0} بمبلغ {1} قرش", table.Name, splitSubtotal),
                                CreatedAt = nowIso
                            });
                        }

                        var updatedSource = GetByIdInternal(conn, trans, table.Id);
                        trans.Commit();

                        return new TableSplitResult
                        {
                            SourceTable = updatedSource,
                            SplitCartJson = splitCart.ToString(Formatting.None),
                            RemainingCartJson = remainingCart.ToString(Formatting.None),
                            SplitSubtotalPiasters = splitSubtotal
                        };
                    }
                    catch
                    {
                        trans.Rollback();
                        throw;
                    }
                }
            }
        }

        public RestaurantTable SetStatus(string tableId, string status)
        {
            if (string.IsNullOrWhiteSpace(tableId)) throw new ArgumentNullException("tableId");
            string nowIso = DateTime.UtcNow.ToString("o");
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand("UPDATE restaurant_tables SET status = @status, updated_at = @now WHERE id = @id;", conn))
                {
                    cmd.Parameters.AddWithValue("@status", status ?? "available");
                    cmd.Parameters.AddWithValue("@now", nowIso);
                    cmd.Parameters.AddWithValue("@id", tableId);
                    cmd.ExecuteNonQuery();
                }
                return GetByIdInternal(conn, null, tableId);
            }
        }

        public void CloseTableAtomic(SQLiteConnection conn, SQLiteTransaction trans, string tableId)
        {
            if (string.IsNullOrWhiteSpace(tableId)) return;
            var table = GetByIdInternal(conn, trans, tableId);
            if (table == null) return;

            if (!string.IsNullOrEmpty(table.ActiveHeldSaleId))
            {
                using (var delHeld = new SQLiteCommand("DELETE FROM held_sales WHERE id = @hid;", conn, trans))
                {
                    delHeld.Parameters.AddWithValue("@hid", table.ActiveHeldSaleId);
                    delHeld.ExecuteNonQuery();
                }
            }

            string nowIso = DateTime.UtcNow.ToString("o");
            using (var upd = new SQLiteCommand(@"
                UPDATE restaurant_tables
                SET status = 'available',
                    active_held_sale_id = NULL,
                    waiter_name = NULL,
                    guests_count = 0,
                    opened_at = NULL,
                    updated_at = @now
                WHERE id = @id;", conn, trans))
            {
                upd.Parameters.AddWithValue("@now", nowIso);
                upd.Parameters.AddWithValue("@id", tableId);
                upd.ExecuteNonQuery();
            }
        }

        public RestaurantTable CloseTable(string tableId)
        {
            if (string.IsNullOrWhiteSpace(tableId)) return null;
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        CloseTableAtomic(conn, trans, tableId);
                        var updated = GetByIdInternal(conn, trans, tableId);
                        trans.Commit();
                        return updated;
                    }
                    catch
                    {
                        trans.Rollback();
                        throw;
                    }
                }
            }
        }

        private static JArray ParseCartArray(string cartJson)
        {
            if (string.IsNullOrWhiteSpace(cartJson)) return new JArray();
            try
            {
                var token = JToken.Parse(cartJson);
                if (token is JArray) return (JArray)token;
            }
            catch { }
            return new JArray();
        }

        private static long ReadJObjectLong(JObject obj, string propName, long fallback)
        {
            if (obj == null || obj[propName] == null) return fallback;
            long val;
            if (long.TryParse(obj[propName].ToString(), out val)) return val;
            return fallback;
        }

        private static void MergeKotDictionaries(Dictionary<string, long> target, string json)
        {
            if (string.IsNullOrWhiteSpace(json)) return;
            try
            {
                var dict = JsonConvert.DeserializeObject<Dictionary<string, long>>(json);
                if (dict != null)
                {
                    foreach (var kvp in dict)
                    {
                        if (target.ContainsKey(kvp.Key))
                        {
                            target[kvp.Key] += kvp.Value;
                        }
                        else
                        {
                            target[kvp.Key] = kvp.Value;
                        }
                    }
                }
            }
            catch { }
        }

        private static RestaurantTable MapTable(SQLiteDataReader reader)
        {
            return new RestaurantTable
            {
                Id = reader["id"].ToString(),
                Name = reader["name"].ToString(),
                ZoneName = reader["zone_name"] != DBNull.Value ? reader["zone_name"].ToString() : "الصالة الداخلية",
                Capacity = reader["capacity"] != DBNull.Value ? Convert.ToInt32(reader["capacity"]) : 4,
                Status = reader["status"] != DBNull.Value ? reader["status"].ToString() : "available",
                ActiveHeldSaleId = reader["active_held_sale_id"] != DBNull.Value ? reader["active_held_sale_id"].ToString() : null,
                WaiterName = reader["waiter_name"] != DBNull.Value ? reader["waiter_name"].ToString() : null,
                GuestsCount = reader["guests_count"] != DBNull.Value ? Convert.ToInt32(reader["guests_count"]) : 0,
                OpenedAt = reader["opened_at"] != DBNull.Value ? reader["opened_at"].ToString() : null,
                DisplayOrder = reader["display_order"] != DBNull.Value ? Convert.ToInt32(reader["display_order"]) : 0,
                IsActive = reader["is_active"] != DBNull.Value && Convert.ToInt32(reader["is_active"]) == 1,
                CurrentTotalPiasters = reader["current_total_piasters"] != DBNull.Value ? Convert.ToInt64(reader["current_total_piasters"]) : 0,
                ItemsCount = reader["current_items_count"] != DBNull.Value ? Convert.ToInt32(reader["current_items_count"]) : 0,
                CartJson = reader["cart_json"] != DBNull.Value ? reader["cart_json"].ToString() : "[]",
                PrintedKotQuantitiesJson = reader["printed_kot_quantities_json"] != DBNull.Value ? reader["printed_kot_quantities_json"].ToString() : "{}",
                CreatedAt = reader["created_at"].ToString(),
                UpdatedAt = reader["updated_at"].ToString()
            };
        }
    }
}
