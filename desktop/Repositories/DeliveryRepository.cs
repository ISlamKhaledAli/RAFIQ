using System;
using System.Collections.Generic;
using System.Data.SQLite;
using RafiqPOS.Models;

namespace RafiqPOS.Repositories
{
    public class DeliveryRepository
    {
        private readonly string _connectionString;
        private readonly AuditLogRepository _auditRepo;

        public DeliveryRepository(string connectionString, AuditLogRepository auditRepo)
        {
            _connectionString = connectionString;
            _auditRepo = auditRepo;
        }

        // ─── Delivery Zones ──────────────────────────────────────────────────

        public List<DeliveryZone> GetZones(bool includeInactive = false)
        {
            var list = new List<DeliveryZone>();
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    SELECT * FROM delivery_zones
                    WHERE (@inc = 1 OR is_active = 1)
                    ORDER BY display_order ASC, name ASC;
                ";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@inc", includeInactive ? 1 : 0);
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            list.Add(MapZone(reader));
                        }
                    }
                }
            }
            return list;
        }

        public DeliveryZone SaveZone(DeliveryZone zone)
        {
            if (zone == null) throw new ArgumentNullException("zone");
            if (string.IsNullOrWhiteSpace(zone.Name)) throw new InvalidOperationException("اسم منطقة التوصيل مطلوب");
            if (zone.FeePiasters < 0) throw new InvalidOperationException("رسوم التوصيل لا يمكن أن تكون سالبة");

            string nowIso = DateTime.UtcNow.ToString("o");
            if (string.IsNullOrWhiteSpace(zone.Id))
            {
                zone.Id = "dzn_" + Guid.NewGuid().ToString("N").Substring(0, 12);
                zone.CreatedAt = nowIso;
            }
            zone.UpdatedAt = nowIso;

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    INSERT INTO delivery_zones (
                        id, name, fee_piasters, estimated_minutes, min_order_piasters,
                        rider_commission_piasters, display_order, is_active, created_at, updated_at
                    ) VALUES (
                        @id, @name, @fee, @est, @minOrd,
                        @comm, @ord, @active, @createdAt, @updatedAt
                    )
                    ON CONFLICT(id) DO UPDATE SET
                        name = excluded.name,
                        fee_piasters = excluded.fee_piasters,
                        estimated_minutes = excluded.estimated_minutes,
                        min_order_piasters = excluded.min_order_piasters,
                        rider_commission_piasters = excluded.rider_commission_piasters,
                        display_order = excluded.display_order,
                        is_active = excluded.is_active,
                        updated_at = excluded.updated_at;
                ";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@id", zone.Id);
                    cmd.Parameters.AddWithValue("@name", zone.Name.Trim());
                    cmd.Parameters.AddWithValue("@fee", Math.Max(0L, zone.FeePiasters));
                    cmd.Parameters.AddWithValue("@est", zone.EstimatedMinutes > 0 ? zone.EstimatedMinutes : 30);
                    cmd.Parameters.AddWithValue("@minOrd", Math.Max(0L, zone.MinOrderPiasters));
                    cmd.Parameters.AddWithValue("@comm", Math.Max(0L, zone.RiderCommissionPiasters));
                    cmd.Parameters.AddWithValue("@ord", zone.DisplayOrder);
                    cmd.Parameters.AddWithValue("@active", zone.IsActive ? 1 : 0);
                    cmd.Parameters.AddWithValue("@createdAt", zone.CreatedAt ?? nowIso);
                    cmd.Parameters.AddWithValue("@updatedAt", nowIso);
                    cmd.ExecuteNonQuery();
                }
            }
            return zone;
        }

        public bool DeleteZone(string zoneId)
        {
            if (string.IsNullOrWhiteSpace(zoneId)) return false;
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand("DELETE FROM delivery_zones WHERE id = @id;", conn))
                {
                    cmd.Parameters.AddWithValue("@id", zoneId);
                    return cmd.ExecuteNonQuery() > 0;
                }
            }
        }

        // ─── Delivery Riders ─────────────────────────────────────────────────

        public List<DeliveryRider> GetRiders(bool includeInactive = false)
        {
            var list = new List<DeliveryRider>();
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    SELECT r.*,
                           COUNT(o.id) AS unsettled_orders_count,
                           COALESCE(SUM(o.total_to_collect_piasters), 0) AS unsettled_cash_piasters
                    FROM delivery_riders r
                    LEFT JOIN delivery_orders o ON r.id = o.rider_id AND o.is_settled = 0 AND o.status != 'returned'
                    WHERE (@inc = 1 OR r.is_active = 1)
                    GROUP BY r.id
                    ORDER BY r.name ASC;
                ";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@inc", includeInactive ? 1 : 0);
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            list.Add(MapRider(reader));
                        }
                    }
                }
            }
            return list;
        }

        public DeliveryRider SaveRider(DeliveryRider rider)
        {
            if (rider == null) throw new ArgumentNullException("rider");
            if (string.IsNullOrWhiteSpace(rider.Name)) throw new InvalidOperationException("اسم الطيار / المندوب مطلوب");

            string nowIso = DateTime.UtcNow.ToString("o");
            if (string.IsNullOrWhiteSpace(rider.Id))
            {
                rider.Id = "rdr_" + Guid.NewGuid().ToString("N").Substring(0, 12);
                rider.CreatedAt = nowIso;
            }
            if (string.IsNullOrWhiteSpace(rider.VehicleType)) rider.VehicleType = "motorcycle";
            if (string.IsNullOrWhiteSpace(rider.Status)) rider.Status = "available";
            rider.UpdatedAt = nowIso;

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    INSERT INTO delivery_riders (
                        id, name, phone, vehicle_type, commission_per_order_piasters,
                        status, is_active, notes, created_at, updated_at
                    ) VALUES (
                        @id, @name, @phone, @veh, @comm,
                        @status, @active, @notes, @createdAt, @updatedAt
                    )
                    ON CONFLICT(id) DO UPDATE SET
                        name = excluded.name,
                        phone = excluded.phone,
                        vehicle_type = excluded.vehicle_type,
                        commission_per_order_piasters = excluded.commission_per_order_piasters,
                        status = excluded.status,
                        is_active = excluded.is_active,
                        notes = excluded.notes,
                        updated_at = excluded.updated_at;
                ";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@id", rider.Id);
                    cmd.Parameters.AddWithValue("@name", rider.Name.Trim());
                    cmd.Parameters.AddWithValue("@phone", rider.Phone ?? "");
                    cmd.Parameters.AddWithValue("@veh", rider.VehicleType);
                    cmd.Parameters.AddWithValue("@comm", Math.Max(0L, rider.CommissionPerOrderPiasters));
                    cmd.Parameters.AddWithValue("@status", rider.Status);
                    cmd.Parameters.AddWithValue("@active", rider.IsActive ? 1 : 0);
                    cmd.Parameters.AddWithValue("@notes", rider.Notes ?? "");
                    cmd.Parameters.AddWithValue("@createdAt", rider.CreatedAt ?? nowIso);
                    cmd.Parameters.AddWithValue("@updatedAt", nowIso);
                    cmd.ExecuteNonQuery();
                }
            }
            return rider;
        }

        public bool DeleteRider(string riderId)
        {
            if (string.IsNullOrWhiteSpace(riderId)) return false;
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var chk = new SQLiteCommand("SELECT COUNT(*) FROM delivery_orders WHERE rider_id = @id AND is_settled = 0 AND status != 'returned';", conn))
                {
                    chk.Parameters.AddWithValue("@id", riderId);
                    if (Convert.ToInt64(chk.ExecuteScalar()) > 0)
                    {
                        throw new InvalidOperationException("لا يمكن حذف الطيار قبل تصفية العهدة والطلبات المسندة إليه.");
                    }
                }
                using (var cmd = new SQLiteCommand("DELETE FROM delivery_riders WHERE id = @id;", conn))
                {
                    cmd.Parameters.AddWithValue("@id", riderId);
                    return cmd.ExecuteNonQuery() > 0;
                }
            }
        }

        // ─── Delivery Orders ─────────────────────────────────────────────────

        public void CreateDeliveryOrderAtomic(SQLiteConnection conn, SQLiteTransaction trans, Sale sale, DeliveryOrderCreateInfo info, string nowIso)
        {
            if (sale == null) return;
            string orderId = "dlv_" + Guid.NewGuid().ToString("N").Substring(0, 12);

            string custName = info != null && !string.IsNullOrWhiteSpace(info.CustomerName)
                ? info.CustomerName.Trim()
                : (!string.IsNullOrWhiteSpace(sale.CustomerName) ? sale.CustomerName : "عميل دليفري");
            string custPhone = info != null && !string.IsNullOrWhiteSpace(info.CustomerPhone)
                ? info.CustomerPhone.Trim()
                : (sale.CustomerPhone ?? "");
            string address = info != null && !string.IsNullOrWhiteSpace(info.DeliveryAddress)
                ? info.DeliveryAddress.Trim()
                : "عنوان العميل";
            string landmark = info != null ? (info.Landmark ?? "") : "";
            string zoneId = info != null ? info.ZoneId : null;
            string zoneName = info != null ? (info.ZoneName ?? "") : "";
            string riderId = info != null ? info.RiderId : null;
            string riderName = info != null ? (info.RiderName ?? "") : "";
            string status = !string.IsNullOrWhiteSpace(riderId) ? "out_for_delivery" : "preparing";
            string dispatchedAt = !string.IsNullOrWhiteSpace(riderId) ? nowIso : null;

            long toCollect = string.Equals(sale.PaymentMethod, "cash", StringComparison.OrdinalIgnoreCase)
                ? sale.TotalPiasters
                : 0L;

            string sql = @"
                INSERT INTO delivery_orders (
                    id, sale_id, invoice_number, order_call_number, customer_id,
                    customer_name, customer_phone, delivery_address, landmark,
                    zone_id, zone_name, delivery_fee_piasters, rider_id, rider_name,
                    status, payment_method, total_to_collect_piasters,
                    is_settled, settled_at, settled_by_user_id,
                    dispatched_at, delivered_at, notes, created_at, updated_at
                ) VALUES (
                    @id, @saleId, @invNum, @callNum, @custId,
                    @custName, @custPhone, @addr, @landmark,
                    @zoneId, @zoneName, @fee, @riderId, @riderName,
                    @status, @payMethod, @toCollect,
                    0, NULL, NULL,
                    @dispatchedAt, NULL, @notes, @now, @now
                );
            ";
            using (var cmd = new SQLiteCommand(sql, conn, trans))
            {
                cmd.Parameters.AddWithValue("@id", orderId);
                cmd.Parameters.AddWithValue("@saleId", sale.Id);
                cmd.Parameters.AddWithValue("@invNum", sale.InvoiceNumber);
                cmd.Parameters.AddWithValue("@callNum", sale.OrderCallNumber);
                cmd.Parameters.AddWithValue("@custId", (object)sale.CustomerId ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@custName", custName);
                cmd.Parameters.AddWithValue("@custPhone", custPhone);
                cmd.Parameters.AddWithValue("@addr", address);
                cmd.Parameters.AddWithValue("@landmark", landmark);
                cmd.Parameters.AddWithValue("@zoneId", string.IsNullOrWhiteSpace(zoneId) ? (object)DBNull.Value : zoneId);
                cmd.Parameters.AddWithValue("@zoneName", zoneName);
                cmd.Parameters.AddWithValue("@fee", sale.DeliveryFeePiasters);
                cmd.Parameters.AddWithValue("@riderId", string.IsNullOrWhiteSpace(riderId) ? (object)DBNull.Value : riderId);
                cmd.Parameters.AddWithValue("@riderName", riderName);
                cmd.Parameters.AddWithValue("@status", status);
                cmd.Parameters.AddWithValue("@payMethod", sale.PaymentMethod ?? "cash");
                cmd.Parameters.AddWithValue("@toCollect", toCollect);
                cmd.Parameters.AddWithValue("@dispatchedAt", (object)dispatchedAt ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@notes", info != null && !string.IsNullOrWhiteSpace(info.Notes) ? info.Notes : (sale.Notes ?? ""));
                cmd.Parameters.AddWithValue("@now", nowIso);
                cmd.ExecuteNonQuery();
            }

            if (!string.IsNullOrWhiteSpace(riderId))
            {
                using (var rCmd = new SQLiteCommand("UPDATE delivery_riders SET status = 'on_delivery', updated_at = @now WHERE id = @rid;", conn, trans))
                {
                    rCmd.Parameters.AddWithValue("@now", nowIso);
                    rCmd.Parameters.AddWithValue("@rid", riderId);
                    rCmd.ExecuteNonQuery();
                }
            }
        }

        public List<DeliveryOrder> GetOrders(string statusFilter = null, string riderId = null, bool? unsettledOnly = null, int limit = 100)
        {
            var list = new List<DeliveryOrder>();
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    SELECT * FROM delivery_orders
                    WHERE (@status IS NULL OR @status = '' OR status = @status)
                      AND (@riderId IS NULL OR @riderId = '' OR rider_id = @riderId)
                      AND (@unsettled IS NULL OR is_settled = @unsettledVal)
                    ORDER BY created_at DESC
                    LIMIT @lim;
                ";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@status", (object)statusFilter ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@riderId", (object)riderId ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@unsettled", unsettledOnly.HasValue ? (object)1 : DBNull.Value);
                    cmd.Parameters.AddWithValue("@unsettledVal", unsettledOnly.HasValue && unsettledOnly.Value ? 0 : 1);
                    cmd.Parameters.AddWithValue("@lim", limit > 0 ? limit : 100);
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            list.Add(MapOrder(reader));
                        }
                    }
                }
            }
            return list;
        }

        public DeliveryOrder AssignOrderToRider(string orderId, string riderId, string userId)
        {
            if (string.IsNullOrWhiteSpace(orderId) || string.IsNullOrWhiteSpace(riderId))
                throw new InvalidOperationException("يرجى تحديد الطلب والطيار.");

            string nowIso = DateTime.UtcNow.ToString("o");
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        string riderName = "";
                        using (var rCmd = new SQLiteCommand("SELECT name FROM delivery_riders WHERE id = @rid LIMIT 1;", conn, trans))
                        {
                            rCmd.Parameters.AddWithValue("@rid", riderId);
                            object rVal = rCmd.ExecuteScalar();
                            if (rVal == null || rVal == DBNull.Value)
                                throw new InvalidOperationException("الطيار المحدد غير موجود.");
                            riderName = rVal.ToString();
                        }

                        using (var uCmd = new SQLiteCommand(@"
                            UPDATE delivery_orders
                            SET rider_id = @rid,
                                rider_name = @rname,
                                status = 'out_for_delivery',
                                dispatched_at = COALESCE(dispatched_at, @now),
                                updated_at = @now
                            WHERE id = @oid;", conn, trans))
                        {
                            uCmd.Parameters.AddWithValue("@rid", riderId);
                            uCmd.Parameters.AddWithValue("@rname", riderName);
                            uCmd.Parameters.AddWithValue("@now", nowIso);
                            uCmd.Parameters.AddWithValue("@oid", orderId);
                            uCmd.ExecuteNonQuery();
                        }

                        using (var rUpd = new SQLiteCommand("UPDATE delivery_riders SET status = 'on_delivery', updated_at = @now WHERE id = @rid;", conn, trans))
                        {
                            rUpd.Parameters.AddWithValue("@now", nowIso);
                            rUpd.Parameters.AddWithValue("@rid", riderId);
                            rUpd.ExecuteNonQuery();
                        }

                        DeliveryOrder updated = GetOrderByIdInternal(conn, trans, orderId);
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

        public DeliveryOrder UpdateOrderStatus(string orderId, string status, string userId)
        {
            if (string.IsNullOrWhiteSpace(orderId) || string.IsNullOrWhiteSpace(status))
                throw new InvalidOperationException("يرجى تحديد الطلب والحالة الجديدة.");

            string nowIso = DateTime.UtcNow.ToString("o");
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        var existing = GetOrderByIdInternal(conn, trans, orderId);
                        if (existing == null) throw new InvalidOperationException("طلب الدليفري غير موجود.");

                        using (var cmd = new SQLiteCommand(@"
                            UPDATE delivery_orders
                            SET status = @status,
                                dispatched_at = CASE WHEN @status = 'out_for_delivery' THEN COALESCE(dispatched_at, @now) ELSE dispatched_at END,
                                delivered_at = CASE WHEN @status = 'delivered' THEN COALESCE(delivered_at, @now) ELSE delivered_at END,
                                updated_at = @now
                            WHERE id = @id;", conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@status", status);
                            cmd.Parameters.AddWithValue("@now", nowIso);
                            cmd.Parameters.AddWithValue("@id", orderId);
                            cmd.ExecuteNonQuery();
                        }

                        if (!string.IsNullOrWhiteSpace(existing.RiderId) && (status == "delivered" || status == "returned"))
                        {
                            using (var activeCmd = new SQLiteCommand("SELECT COUNT(*) FROM delivery_orders WHERE rider_id = @rid AND status = 'out_for_delivery';", conn, trans))
                            {
                                activeCmd.Parameters.AddWithValue("@rid", existing.RiderId);
                                if (Convert.ToInt64(activeCmd.ExecuteScalar()) == 0)
                                {
                                    using (var rUpd = new SQLiteCommand("UPDATE delivery_riders SET status = 'available', updated_at = @now WHERE id = @rid;", conn, trans))
                                    {
                                        rUpd.Parameters.AddWithValue("@now", nowIso);
                                        rUpd.Parameters.AddWithValue("@rid", existing.RiderId);
                                        rUpd.ExecuteNonQuery();
                                    }
                                }
                            }
                        }

                        var updated = GetOrderByIdInternal(conn, trans, orderId);
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

        public RiderSettlementSummary GetRiderSettlementSummary(string riderId)
        {
            if (string.IsNullOrWhiteSpace(riderId)) throw new ArgumentNullException("riderId");
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                return BuildRiderSummaryInternal(conn, null, riderId);
            }
        }

        private RiderSettlementSummary BuildRiderSummaryInternal(SQLiteConnection conn, SQLiteTransaction trans, string riderId)
        {
            string riderName = "";
            long riderDefaultCommission = 0;
            using (var rCmd = new SQLiteCommand("SELECT name, commission_per_order_piasters FROM delivery_riders WHERE id = @rid LIMIT 1;", conn, trans))
            {
                rCmd.Parameters.AddWithValue("@rid", riderId);
                using (var reader = rCmd.ExecuteReader())
                {
                    if (reader.Read())
                    {
                        riderName = reader["name"].ToString();
                        riderDefaultCommission = reader["commission_per_order_piasters"] != DBNull.Value ? Convert.ToInt64(reader["commission_per_order_piasters"]) : 0;
                    }
                }
            }

            var summary = new RiderSettlementSummary
            {
                RiderId = riderId,
                RiderName = riderName
            };

            string sql = @"
                SELECT o.*, COALESCE(z.rider_commission_piasters, 0) AS zone_rider_commission
                FROM delivery_orders o
                LEFT JOIN delivery_zones z ON o.zone_id = z.id
                WHERE o.rider_id = @rid AND o.is_settled = 0 AND o.status != 'returned'
                ORDER BY o.created_at ASC;
            ";
            using (var cmd = new SQLiteCommand(sql, conn, trans))
            {
                cmd.Parameters.AddWithValue("@rid", riderId);
                using (var reader = cmd.ExecuteReader())
                {
                    while (reader.Read())
                    {
                        var ord = MapOrder(reader);
                        long zoneComm = reader["zone_rider_commission"] != DBNull.Value ? Convert.ToInt64(reader["zone_rider_commission"]) : 0;
                        long orderComm = zoneComm > 0 ? zoneComm : riderDefaultCommission;

                        summary.Orders.Add(ord);
                        summary.UnsettledOrdersCount++;
                        summary.TotalCashToCollectPiasters += ord.TotalToCollectPiasters;
                        summary.TotalDeliveryFeesPiasters += ord.DeliveryFeePiasters;
                        summary.RiderCommissionPiasters += orderComm;
                    }
                }
            }

            summary.NetDrawerDepositPiasters = Math.Max(0L, summary.TotalCashToCollectPiasters - summary.RiderCommissionPiasters);
            return summary;
        }

        public RiderSettlementSummary SettleRider(string riderId, string userId, bool recordCommissionExpense)
        {
            if (string.IsNullOrWhiteSpace(riderId)) throw new ArgumentNullException("riderId");
            string nowIso = DateTime.UtcNow.ToString("o");

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        var summary = BuildRiderSummaryInternal(conn, trans, riderId);
                        if (summary.UnsettledOrdersCount == 0)
                        {
                            throw new InvalidOperationException("لا توجد طلبات غير مصفاة لهذا الطيار حالياً.");
                        }

                        using (var uCmd = new SQLiteCommand(@"
                            UPDATE delivery_orders
                            SET is_settled = 1,
                                status = CASE WHEN status = 'out_for_delivery' THEN 'delivered' ELSE status END,
                                delivered_at = COALESCE(delivered_at, @now),
                                settled_at = @now,
                                settled_by_user_id = @uid,
                                updated_at = @now
                            WHERE rider_id = @rid AND is_settled = 0 AND status != 'returned';", conn, trans))
                        {
                            uCmd.Parameters.AddWithValue("@now", nowIso);
                            uCmd.Parameters.AddWithValue("@uid", string.IsNullOrEmpty(userId) ? "usr_admin_default" : userId);
                            uCmd.Parameters.AddWithValue("@rid", riderId);
                            uCmd.ExecuteNonQuery();
                        }

                        using (var rUpd = new SQLiteCommand("UPDATE delivery_riders SET status = 'available', updated_at = @now WHERE id = @rid;", conn, trans))
                        {
                            rUpd.Parameters.AddWithValue("@now", nowIso);
                            rUpd.Parameters.AddWithValue("@rid", riderId);
                            rUpd.ExecuteNonQuery();
                        }

                        if (recordCommissionExpense && summary.RiderCommissionPiasters > 0)
                        {
                            string expId = "exp_" + Guid.NewGuid().ToString("N").Substring(0, 12);
                            string bDate = DateTime.Now.ToString("yyyy-MM-dd");
                            using (var expCmd = new SQLiteCommand(@"
                                INSERT INTO expenses (id, expense_number, category, amount_piasters, notes, source, created_by, business_date, created_at)
                                VALUES (@id, COALESCE((SELECT MAX(expense_number) FROM expenses), 0) + 1, 'عمولات توصيل وطيارين', @amt, @desc, 'cash', @uid, @bdate, @now);
                            ", conn, trans))
                            {
                                expCmd.Parameters.AddWithValue("@id", expId);
                                expCmd.Parameters.AddWithValue("@amt", summary.RiderCommissionPiasters);
                                expCmd.Parameters.AddWithValue("@desc", string.Format("عمولة توصيل الطيار {0} عن ({1}) طلبات", summary.RiderName, summary.UnsettledOrdersCount));
                                expCmd.Parameters.AddWithValue("@uid", string.IsNullOrEmpty(userId) ? "usr_admin_default" : userId);
                                expCmd.Parameters.AddWithValue("@bdate", bDate);
                                expCmd.Parameters.AddWithValue("@now", nowIso);
                                expCmd.ExecuteNonQuery();
                            }
                        }

                        if (_auditRepo != null)
                        {
                            _auditRepo.Log(conn, trans, new AuditLog
                            {
                                Id = "aud_" + Guid.NewGuid().ToString("N"),
                                UserId = string.IsNullOrEmpty(userId) ? "usr_admin_default" : userId,
                                Action = "RIDER_SETTLEMENT",
                                EntityType = "DELIVERY_RIDER",
                                EntityId = riderId,
                                DetailsJson = string.Format("تصفية عهدة الطيار {0}: تحصيل {1} قرش عن {2} طلبات", summary.RiderName, summary.TotalCashToCollectPiasters, summary.UnsettledOrdersCount),
                                CreatedAt = nowIso
                            });
                        }

                        trans.Commit();
                        return summary;
                    }
                    catch
                    {
                        trans.Rollback();
                        throw;
                    }
                }
            }
        }

        private DeliveryOrder GetOrderByIdInternal(SQLiteConnection conn, SQLiteTransaction trans, string orderId)
        {
            using (var cmd = new SQLiteCommand("SELECT * FROM delivery_orders WHERE id = @id LIMIT 1;", conn, trans))
            {
                cmd.Parameters.AddWithValue("@id", orderId);
                using (var reader = cmd.ExecuteReader())
                {
                    if (reader.Read())
                    {
                        return MapOrder(reader);
                    }
                }
            }
            return null;
        }

        private static DeliveryZone MapZone(SQLiteDataReader reader)
        {
            return new DeliveryZone
            {
                Id = reader["id"].ToString(),
                Name = reader["name"].ToString(),
                FeePiasters = reader["fee_piasters"] != DBNull.Value ? Convert.ToInt64(reader["fee_piasters"]) : 0,
                EstimatedMinutes = reader["estimated_minutes"] != DBNull.Value ? Convert.ToInt32(reader["estimated_minutes"]) : 30,
                MinOrderPiasters = reader["min_order_piasters"] != DBNull.Value ? Convert.ToInt64(reader["min_order_piasters"]) : 0,
                RiderCommissionPiasters = reader["rider_commission_piasters"] != DBNull.Value ? Convert.ToInt64(reader["rider_commission_piasters"]) : 0,
                DisplayOrder = reader["display_order"] != DBNull.Value ? Convert.ToInt32(reader["display_order"]) : 0,
                IsActive = reader["is_active"] != DBNull.Value && Convert.ToInt32(reader["is_active"]) == 1,
                CreatedAt = reader["created_at"].ToString(),
                UpdatedAt = reader["updated_at"].ToString()
            };
        }

        private static DeliveryRider MapRider(SQLiteDataReader reader)
        {
            var r = new DeliveryRider
            {
                Id = reader["id"].ToString(),
                Name = reader["name"].ToString(),
                Phone = reader["phone"] != DBNull.Value ? reader["phone"].ToString() : "",
                VehicleType = reader["vehicle_type"] != DBNull.Value ? reader["vehicle_type"].ToString() : "motorcycle",
                CommissionPerOrderPiasters = reader["commission_per_order_piasters"] != DBNull.Value ? Convert.ToInt64(reader["commission_per_order_piasters"]) : 0,
                Status = reader["status"] != DBNull.Value ? reader["status"].ToString() : "available",
                IsActive = reader["is_active"] != DBNull.Value && Convert.ToInt32(reader["is_active"]) == 1,
                Notes = reader["notes"] != DBNull.Value ? reader["notes"].ToString() : "",
                CreatedAt = reader["created_at"].ToString(),
                UpdatedAt = reader["updated_at"].ToString()
            };
            try
            {
                r.UnsettledOrdersCount = reader["unsettled_orders_count"] != DBNull.Value ? Convert.ToInt32(reader["unsettled_orders_count"]) : 0;
                r.UnsettledCashPiasters = reader["unsettled_cash_piasters"] != DBNull.Value ? Convert.ToInt64(reader["unsettled_cash_piasters"]) : 0;
            }
            catch { }
            return r;
        }

        private static DeliveryOrder MapOrder(SQLiteDataReader reader)
        {
            return new DeliveryOrder
            {
                Id = reader["id"].ToString(),
                SaleId = reader["sale_id"].ToString(),
                InvoiceNumber = reader["invoice_number"] != DBNull.Value ? Convert.ToInt32(reader["invoice_number"]) : 0,
                OrderCallNumber = reader["order_call_number"] != DBNull.Value ? Convert.ToInt32(reader["order_call_number"]) : 0,
                CustomerId = reader["customer_id"] != DBNull.Value ? reader["customer_id"].ToString() : null,
                CustomerName = reader["customer_name"] != DBNull.Value ? reader["customer_name"].ToString() : "",
                CustomerPhone = reader["customer_phone"] != DBNull.Value ? reader["customer_phone"].ToString() : "",
                DeliveryAddress = reader["delivery_address"] != DBNull.Value ? reader["delivery_address"].ToString() : "",
                Landmark = reader["landmark"] != DBNull.Value ? reader["landmark"].ToString() : "",
                ZoneId = reader["zone_id"] != DBNull.Value ? reader["zone_id"].ToString() : null,
                ZoneName = reader["zone_name"] != DBNull.Value ? reader["zone_name"].ToString() : "",
                DeliveryFeePiasters = reader["delivery_fee_piasters"] != DBNull.Value ? Convert.ToInt64(reader["delivery_fee_piasters"]) : 0,
                RiderId = reader["rider_id"] != DBNull.Value ? reader["rider_id"].ToString() : null,
                RiderName = reader["rider_name"] != DBNull.Value ? reader["rider_name"].ToString() : "",
                Status = reader["status"] != DBNull.Value ? reader["status"].ToString() : "preparing",
                PaymentMethod = reader["payment_method"] != DBNull.Value ? reader["payment_method"].ToString() : "cash",
                TotalToCollectPiasters = reader["total_to_collect_piasters"] != DBNull.Value ? Convert.ToInt64(reader["total_to_collect_piasters"]) : 0,
                IsSettled = reader["is_settled"] != DBNull.Value && Convert.ToInt32(reader["is_settled"]) == 1,
                SettledAt = reader["settled_at"] != DBNull.Value ? reader["settled_at"].ToString() : null,
                SettledByUserId = reader["settled_by_user_id"] != DBNull.Value ? reader["settled_by_user_id"].ToString() : null,
                DispatchedAt = reader["dispatched_at"] != DBNull.Value ? reader["dispatched_at"].ToString() : null,
                DeliveredAt = reader["delivered_at"] != DBNull.Value ? reader["delivered_at"].ToString() : null,
                Notes = reader["notes"] != DBNull.Value ? reader["notes"].ToString() : "",
                CreatedAt = reader["created_at"].ToString(),
                UpdatedAt = reader["updated_at"].ToString()
            };
        }
    }
}
