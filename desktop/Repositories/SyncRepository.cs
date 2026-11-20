using System;
using System.Collections.Generic;
using System.Data.SQLite;
using Newtonsoft.Json;
using RafiqPOS.Models;

namespace RafiqPOS.Repositories
{
    public class SyncRepository
    {
        private readonly string _connectionString;

        public SyncRepository(string connectionString)
        {
            _connectionString = connectionString;
        }

        /// <summary>
        /// Crash-recovery on startup: revert any outbox rows stuck in 'syncing' (e.g. after sudden power loss) back to 'pending'.
        /// </summary>
        public int ResetStuckSyncingItems()
        {
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand(
                    "UPDATE sync_outbox SET sync_status = 'pending' WHERE sync_status = 'syncing';", conn))
                {
                    return cmd.ExecuteNonQuery();
                }
            }
        }

        /// <summary>
        /// Enqueue a delta change into sync_outbox. Supports participating in an existing ACID transaction.
        /// </summary>
        public void EnqueueOutbox(
            string entityType,
            string entityId,
            string operation,
            string payloadJson,
            SQLiteConnection existingConn = null,
            SQLiteTransaction existingTrans = null)
        {
            if (string.IsNullOrEmpty(entityType) || string.IsNullOrEmpty(entityId)) return;

            string sql = @"
                INSERT INTO sync_outbox (id, entity_type, entity_id, operation, payload_json, created_at, sync_status, retry_count)
                VALUES (@id, @entityType, @entityId, @operation, @payloadJson, @createdAt, 'pending', 0);
            ";

            string id = Guid.NewGuid().ToString();
            string now = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ");
            string safePayload = string.IsNullOrEmpty(payloadJson) ? "{}" : payloadJson;

            if (existingConn != null)
            {
                using (var cmd = new SQLiteCommand(sql, existingConn, existingTrans))
                {
                    cmd.Parameters.AddWithValue("@id", id);
                    cmd.Parameters.AddWithValue("@entityType", entityType);
                    cmd.Parameters.AddWithValue("@entityId", entityId);
                    cmd.Parameters.AddWithValue("@operation", operation ?? "upsert");
                    cmd.Parameters.AddWithValue("@payloadJson", safePayload);
                    cmd.Parameters.AddWithValue("@createdAt", now);
                    cmd.ExecuteNonQuery();
                }
                return;
            }

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@id", id);
                    cmd.Parameters.AddWithValue("@entityType", entityType);
                    cmd.Parameters.AddWithValue("@entityId", entityId);
                    cmd.Parameters.AddWithValue("@operation", operation ?? "upsert");
                    cmd.Parameters.AddWithValue("@payloadJson", safePayload);
                    cmd.Parameters.AddWithValue("@createdAt", now);
                    cmd.ExecuteNonQuery();
                }
            }
        }

        /// <summary>
        /// Enqueue outbox safely only when the online store is configured/enabled, ignoring errors if sync_outbox isn't present yet.
        /// </summary>
        public void TryEnqueueOutboxIfEnabled(string entityType, string entityId, string operation, string payloadJson)
        {
            try
            {
                if (Services.DatabaseService.Settings != null && !Services.DatabaseService.Settings.IsFeatureEnabled("feature_online_store"))
                {
                    return;
                }
                string enabled = GetState("online_store_enabled", "0");
                if (enabled != "1") return;
                EnqueueOutbox(entityType, entityId, operation, payloadJson);
            }
            catch
            {
                // Never block POS core operations if sync queue fails
            }
        }

        public List<SyncOutboxItem> GetPendingOutboxItems(int limit = 100)
        {
            var list = new List<SyncOutboxItem>();
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    SELECT id, entity_type, entity_id, operation, payload_json, created_at, sync_status, retry_count, last_error, synced_at
                    FROM sync_outbox
                    WHERE sync_status IN ('pending', 'failed') AND retry_count < 10
                    ORDER BY created_at ASC
                    LIMIT @limit;
                ";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@limit", limit);
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            list.Add(new SyncOutboxItem
                            {
                                Id = reader["id"].ToString(),
                                EntityType = reader["entity_type"].ToString(),
                                EntityId = reader["entity_id"].ToString(),
                                Operation = reader["operation"].ToString(),
                                PayloadJson = reader["payload_json"].ToString(),
                                CreatedAt = reader["created_at"].ToString(),
                                SyncStatus = reader["sync_status"].ToString(),
                                RetryCount = Convert.ToInt32(reader["retry_count"]),
                                LastError = reader["last_error"] == DBNull.Value ? null : reader["last_error"].ToString(),
                                SyncedAt = reader["synced_at"] == DBNull.Value ? null : reader["synced_at"].ToString()
                            });
                        }
                    }
                }
            }
            return list;
        }

        public void MarkOutboxItemsStatus(List<string> ids, string status, string errorMessage = null)
        {
            if (ids == null || ids.Count == 0) return;

            string now = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ");
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        for (int i = 0; i < ids.Count; i++)
                        {
                            string sql;
                            if (status == "synced")
                            {
                                sql = "UPDATE sync_outbox SET sync_status = 'synced', synced_at = @now, last_error = NULL WHERE id = @id;";
                            }
                            else if (status == "failed")
                            {
                                sql = "UPDATE sync_outbox SET sync_status = 'failed', retry_count = retry_count + 1, last_error = @err WHERE id = @id;";
                            }
                            else
                            {
                                sql = "UPDATE sync_outbox SET sync_status = @status WHERE id = @id;";
                            }

                            using (var cmd = new SQLiteCommand(sql, conn, trans))
                            {
                                cmd.Parameters.AddWithValue("@id", ids[i]);
                                cmd.Parameters.AddWithValue("@now", now);
                                cmd.Parameters.AddWithValue("@status", status);
                                cmd.Parameters.AddWithValue("@err", (object)errorMessage ?? DBNull.Value);
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

        public int PurgeOldSyncedOutbox(int retainDays = 7)
        {
            string cutoff = DateTime.UtcNow.AddDays(-retainDays).ToString("yyyy-MM-ddTHH:mm:ss.fffZ");
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand(
                    "DELETE FROM sync_outbox WHERE sync_status = 'synced' AND synced_at IS NOT NULL AND synced_at < @cutoff;", conn))
                {
                    cmd.Parameters.AddWithValue("@cutoff", cutoff);
                    return cmd.ExecuteNonQuery();
                }
            }
        }

        private static string NormalizeCloudOrderStatus(string status)
        {
            if (string.IsNullOrEmpty(status)) return "new";
            string normalized = status.Trim().ToLowerInvariant();
            if (normalized == "cancelled") return "rejected";
            return normalized;
        }

        private static int GetOrderStageRank(string status)
        {
            switch (status)
            {
                case "new": return 1;
                case "accepted": return 2;
                case "preparing": return 3;
                case "ready": return 4;
                case "delivered": return 5;
                case "rejected": return 99;
                default: return 0;
            }
        }

        /// <summary>
        /// Saves an incoming online order idempotently into sync_inbox, or merges 2-way status updates
        /// pushed from the Web/Mobile Admin Dashboard while protecting local POS outbox actions and
        /// already-invoiced orders. Returns true ONLY if newly inserted.
        /// </summary>
        public bool SaveInboxOrder(OnlineOrderDto order)
        {
            return SaveInboxOrderDetailed(order) == InboxSaveOutcome.Inserted;
        }

        /// <summary>
        /// Saves or merges an incoming cloud order and returns whether it was Inserted, Updated (status changed), or Unchanged.
        /// </summary>
        public InboxSaveOutcome SaveInboxOrderDetailed(OnlineOrderDto order)
        {
            if (order == null || string.IsNullOrEmpty(order.Id)) return InboxSaveOutcome.Unchanged;

            string now = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ");
            string incomingStatus = NormalizeCloudOrderStatus(order.Status);
            order.Status = incomingStatus;
            string orderJson = JsonConvert.SerializeObject(order);

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        bool exists = false;
                        string existingStatus = "";
                        string existingPosInvoiceId = "";

                        using (var checkCmd = new SQLiteCommand(
                            "SELECT process_status, pos_invoice_id FROM sync_inbox WHERE order_id = @orderId LIMIT 1;",
                            conn, trans))
                        {
                            checkCmd.Parameters.AddWithValue("@orderId", order.Id);
                            using (var reader = checkCmd.ExecuteReader())
                            {
                                if (reader.Read())
                                {
                                    exists = true;
                                    existingStatus = NormalizeCloudOrderStatus(
                                        reader["process_status"] == DBNull.Value ? "" : reader["process_status"].ToString());
                                    existingPosInvoiceId =
                                        reader["pos_invoice_id"] == DBNull.Value ? "" : reader["pos_invoice_id"].ToString();
                                }
                            }
                        }

                        if (!exists)
                        {
                            string insertSql = @"
                                INSERT INTO sync_inbox (
                                    id, order_id, order_number, customer_name, customer_phone,
                                    total_piasters, order_data_json, received_at, process_status
                                )
                                VALUES (
                                    @id, @orderId, @orderNumber, @customerName, @customerPhone,
                                    @totalPiasters, @orderDataJson, @receivedAt, @processStatus
                                );
                            ";
                            using (var cmd = new SQLiteCommand(insertSql, conn, trans))
                            {
                                cmd.Parameters.AddWithValue("@id", Guid.NewGuid().ToString());
                                cmd.Parameters.AddWithValue("@orderId", order.Id);
                                cmd.Parameters.AddWithValue("@orderNumber", order.OrderNumber);
                                cmd.Parameters.AddWithValue("@customerName", (object)order.CustomerName ?? DBNull.Value);
                                cmd.Parameters.AddWithValue("@customerPhone", (object)order.CustomerPhone ?? DBNull.Value);
                                cmd.Parameters.AddWithValue("@totalPiasters", order.Total);
                                cmd.Parameters.AddWithValue("@orderDataJson", orderJson);
                                cmd.Parameters.AddWithValue("@receivedAt", now);
                                cmd.Parameters.AddWithValue("@processStatus", incomingStatus);
                                int rows = cmd.ExecuteNonQuery();
                                trans.Commit();
                                return rows > 0 ? InboxSaveOutcome.Inserted : InboxSaveOutcome.Unchanged;
                            }
                        }

                        // Guard 1: If local POS has an unsynced status update in sync_outbox for this order, local cashier action wins.
                        long pendingLocalUpdates = 0;
                        using (var outboxCmd = new SQLiteCommand(@"
                            SELECT COUNT(*) FROM sync_outbox
                            WHERE entity_type = 'order_status'
                              AND entity_id = @orderId
                              AND sync_status IN ('pending', 'syncing');", conn, trans))
                        {
                            outboxCmd.Parameters.AddWithValue("@orderId", order.Id);
                            object scalar = outboxCmd.ExecuteScalar();
                            if (scalar != null && scalar != DBNull.Value)
                            {
                                pendingLocalUpdates = Convert.ToInt64(scalar);
                            }
                        }

                        if (pendingLocalUpdates > 0)
                        {
                            trans.Commit();
                            return InboxSaveOutcome.Unchanged;
                        }

                        // Guard 2: Never overwrite a POS-invoiced order to 'rejected' (requires an official POS sales return).
                        if (!string.IsNullOrEmpty(existingPosInvoiceId) && incomingStatus == "rejected")
                        {
                            trans.Commit();
                            return InboxSaveOutcome.Unchanged;
                        }

                        // Guard 3: Never resurrect a rejected order or downgrade an already-delivered / further-advanced order.
                        int existingRank = GetOrderStageRank(existingStatus);
                        int incomingRank = GetOrderStageRank(incomingStatus);
                        if (existingStatus == "rejected" && incomingStatus != "rejected")
                        {
                            trans.Commit();
                            return InboxSaveOutcome.Unchanged;
                        }
                        if (incomingRank > 0 && existingRank > 0 && incomingRank < existingRank)
                        {
                            trans.Commit();
                            return InboxSaveOutcome.Unchanged;
                        }

                        bool statusChanged = !string.Equals(existingStatus, incomingStatus, StringComparison.OrdinalIgnoreCase);

                        // Safe 2-Way Merge: update status & cloud payload while preserving pos_invoice_id & received_at.
                        using (var updateCmd = new SQLiteCommand(@"
                            UPDATE sync_inbox
                            SET process_status = @processStatus,
                                order_data_json = @orderDataJson,
                                processed_at = @processedAt
                            WHERE order_id = @orderId;", conn, trans))
                        {
                            updateCmd.Parameters.AddWithValue("@processStatus", incomingStatus);
                            updateCmd.Parameters.AddWithValue("@orderDataJson", orderJson);
                            updateCmd.Parameters.AddWithValue("@processedAt", now);
                            updateCmd.Parameters.AddWithValue("@orderId", order.Id);
                            updateCmd.ExecuteNonQuery();
                        }

                        trans.Commit();
                        return statusChanged ? InboxSaveOutcome.Updated : InboxSaveOutcome.Unchanged;
                    }
                    catch
                    {
                        try { trans.Rollback(); } catch { }
                        throw;
                    }
                }
            }
        }

        public List<SyncInboxItem> GetInboxOrders(string statusFilter = null, int limit = 100)
        {
            var list = new List<SyncInboxItem>();
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    SELECT id, order_id, order_number, customer_name, customer_phone,
                           total_piasters, order_data_json, received_at, process_status, pos_invoice_id, processed_at
                    FROM sync_inbox
                ";
                if (!string.IsNullOrEmpty(statusFilter) && statusFilter != "all")
                {
                    sql += " WHERE process_status = @status ";
                }
                sql += " ORDER BY received_at DESC LIMIT @limit;";

                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    if (!string.IsNullOrEmpty(statusFilter) && statusFilter != "all")
                    {
                        cmd.Parameters.AddWithValue("@status", statusFilter);
                    }
                    cmd.Parameters.AddWithValue("@limit", limit);
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            string dataJson = reader["order_data_json"].ToString();
                            OnlineOrderDto parsedOrder = null;
                            try
                            {
                                parsedOrder = JsonConvert.DeserializeObject<OnlineOrderDto>(dataJson);
                            }
                            catch
                            {
                                parsedOrder = new OnlineOrderDto
                                {
                                    Id = reader["order_id"].ToString(),
                                    OrderNumber = Convert.ToInt32(reader["order_number"]),
                                    CustomerName = reader["customer_name"] == DBNull.Value ? "" : reader["customer_name"].ToString(),
                                    CustomerPhone = reader["customer_phone"] == DBNull.Value ? "" : reader["customer_phone"].ToString(),
                                    Total = Convert.ToInt64(reader["total_piasters"])
                                };
                            }

                            string currentStatus = reader["process_status"].ToString();
                            if (parsedOrder != null)
                            {
                                parsedOrder.Status = currentStatus;
                            }

                            list.Add(new SyncInboxItem
                            {
                                Id = reader["id"].ToString(),
                                OrderId = reader["order_id"].ToString(),
                                OrderNumber = Convert.ToInt32(reader["order_number"]),
                                CustomerName = reader["customer_name"] == DBNull.Value ? "" : reader["customer_name"].ToString(),
                                CustomerPhone = reader["customer_phone"] == DBNull.Value ? "" : reader["customer_phone"].ToString(),
                                TotalPiasters = Convert.ToInt64(reader["total_piasters"]),
                                OrderDataJson = dataJson,
                                ReceivedAt = reader["received_at"].ToString(),
                                ProcessStatus = currentStatus,
                                PosInvoiceId = reader["pos_invoice_id"] == DBNull.Value ? null : reader["pos_invoice_id"].ToString(),
                                ProcessedAt = reader["processed_at"] == DBNull.Value ? null : reader["processed_at"].ToString(),
                                Order = parsedOrder
                            });
                        }
                    }
                }
            }
            return list;
        }

        /// <summary>
        /// Retrieves a single online order from sync_inbox by its cloud order_id.
        /// </summary>
        public SyncInboxItem GetInboxOrderByOrderId(string orderId)
        {
            if (string.IsNullOrWhiteSpace(orderId)) return null;
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    SELECT id, order_id, order_number, customer_name, customer_phone,
                           total_piasters, order_data_json, received_at, process_status, pos_invoice_id, processed_at
                    FROM sync_inbox
                    WHERE order_id = @orderId
                    LIMIT 1;
                ";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@orderId", orderId);
                    using (var reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            string dataJson = reader["order_data_json"].ToString();
                            OnlineOrderDto parsedOrder = null;
                            try
                            {
                                parsedOrder = JsonConvert.DeserializeObject<OnlineOrderDto>(dataJson);
                            }
                            catch
                            {
                                parsedOrder = new OnlineOrderDto
                                {
                                    Id = reader["order_id"].ToString(),
                                    OrderNumber = Convert.ToInt32(reader["order_number"]),
                                    CustomerName = reader["customer_name"] == DBNull.Value ? "" : reader["customer_name"].ToString(),
                                    CustomerPhone = reader["customer_phone"] == DBNull.Value ? "" : reader["customer_phone"].ToString(),
                                    Total = Convert.ToInt64(reader["total_piasters"])
                                };
                            }

                            string currentStatus = reader["process_status"].ToString();
                            if (parsedOrder != null)
                            {
                                parsedOrder.Status = currentStatus;
                            }

                            return new SyncInboxItem
                            {
                                Id = reader["id"].ToString(),
                                OrderId = reader["order_id"].ToString(),
                                OrderNumber = Convert.ToInt32(reader["order_number"]),
                                CustomerName = reader["customer_name"] == DBNull.Value ? "" : reader["customer_name"].ToString(),
                                CustomerPhone = reader["customer_phone"] == DBNull.Value ? "" : reader["customer_phone"].ToString(),
                                TotalPiasters = Convert.ToInt64(reader["total_piasters"]),
                                OrderDataJson = dataJson,
                                ReceivedAt = reader["received_at"].ToString(),
                                ProcessStatus = currentStatus,
                                PosInvoiceId = reader["pos_invoice_id"] == DBNull.Value ? null : reader["pos_invoice_id"].ToString(),
                                ProcessedAt = reader["processed_at"] == DBNull.Value ? null : reader["processed_at"].ToString(),
                                Order = parsedOrder
                            };
                        }
                    }
                }
            }
            return null;
        }

        /// <summary>
        /// Updates local order status atomically and enqueues an outbox status update for cloud sync.
        /// </summary>
        public bool UpdateInboxOrderStatus(string orderId, string processStatus, string rejectionReason = null, string posInvoiceId = null)
        {
            if (string.IsNullOrEmpty(orderId) || string.IsNullOrEmpty(processStatus)) return false;

            string now = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ");
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        string sql = @"
                            UPDATE sync_inbox
                            SET process_status = @status,
                                pos_invoice_id = COALESCE(@posInvoiceId, pos_invoice_id),
                                processed_at = @now
                            WHERE order_id = @orderId;
                        ";
                        int rows;
                        using (var cmd = new SQLiteCommand(sql, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@status", processStatus);
                            cmd.Parameters.AddWithValue("@posInvoiceId", (object)posInvoiceId ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@now", now);
                            cmd.Parameters.AddWithValue("@orderId", orderId);
                            rows = cmd.ExecuteNonQuery();
                        }

                        if (rows > 0)
                        {
                            var payloadObj = new Dictionary<string, object>();
                            payloadObj["order_id"] = orderId;
                            payloadObj["status"] = processStatus;
                            if (!string.IsNullOrEmpty(rejectionReason))
                            {
                                payloadObj["rejection_reason"] = rejectionReason;
                            }
                            if (!string.IsNullOrEmpty(posInvoiceId))
                            {
                                payloadObj["pos_invoice_id"] = posInvoiceId;
                            }

                            EnqueueOutbox("order_status", orderId, "status_update", JsonConvert.SerializeObject(payloadObj), conn, trans);
                        }

                        trans.Commit();
                        return rows > 0;
                    }
                    catch
                    {
                        trans.Rollback();
                        throw;
                    }
                }
            }
        }

        public string GetState(string key, string defaultValue = "")
        {
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand("SELECT value FROM sync_state WHERE key = @key LIMIT 1;", conn))
                {
                    cmd.Parameters.AddWithValue("@key", key);
                    object result = cmd.ExecuteScalar();
                    if (result != null && result != DBNull.Value)
                    {
                        return result.ToString();
                    }
                }
            }
            return defaultValue;
        }

        public void SetState(string key, string value)
        {
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand("INSERT OR REPLACE INTO sync_state (key, value) VALUES (@key, @value);", conn))
                {
                    cmd.Parameters.AddWithValue("@key", key);
                    cmd.Parameters.AddWithValue("@value", value ?? "");
                    cmd.ExecuteNonQuery();
                }
            }
        }

        public Dictionary<string, string> GetAllStates()
        {
            var dict = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand("SELECT key, value FROM sync_state;", conn))
                using (var reader = cmd.ExecuteReader())
                {
                    while (reader.Read())
                    {
                        dict[reader["key"].ToString()] = reader["value"].ToString();
                    }
                }
            }
            return dict;
        }

        public int GetPendingOutboxCount()
        {
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand("SELECT COUNT(*) FROM sync_outbox WHERE sync_status IN ('pending', 'syncing');", conn))
                {
                    return Convert.ToInt32(cmd.ExecuteScalar());
                }
            }
        }

        public int GetFailedOutboxCount()
        {
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand("SELECT COUNT(*) FROM sync_outbox WHERE sync_status = 'failed';", conn))
                {
                    return Convert.ToInt32(cmd.ExecuteScalar());
                }
            }
        }

        public int GetNewOrdersCount()
        {
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand("SELECT COUNT(*) FROM sync_inbox WHERE process_status = 'new';", conn))
                {
                    return Convert.ToInt32(cmd.ExecuteScalar());
                }
            }
        }

        public int ClearInboxOrders()
        {
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand("DELETE FROM sync_inbox;", conn))
                {
                    return cmd.ExecuteNonQuery();
                }
            }
        }

        public int ClearOutboxQueue()
        {
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand("DELETE FROM sync_outbox;", conn))
                {
                    return cmd.ExecuteNonQuery();
                }
            }
        }

        public int ClearOrderOutbox()
        {
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand("DELETE FROM sync_outbox WHERE entity_type = 'order';", conn))
                {
                    return cmd.ExecuteNonQuery();
                }
            }
        }

        /// <summary>
        /// Safely enqueues deduplicated stock update events when online store sync is enabled.
        /// Never throws — POS sales, purchases, and returns must never fail due to sync queuing.
        /// </summary>
        public void NotifyProductsStockChanged(IEnumerable<string> productIds)
        {
            if (productIds == null) return;
            try
            {
                if (Services.DatabaseService.Settings != null && !Services.DatabaseService.Settings.IsFeatureEnabled("feature_online_store"))
                {
                    return;
                }
                if (GetState("online_store_enabled", "0") != "1") return;

                var uniqueIds = new HashSet<string>();
                foreach (string id in productIds)
                {
                    if (!string.IsNullOrWhiteSpace(id))
                    {
                        uniqueIds.Add(id);
                    }
                }
                if (uniqueIds.Count == 0) return;

                string now = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ");
                using (var conn = new SQLiteConnection(_connectionString))
                {
                    conn.Open();
                    using (var trans = conn.BeginTransaction())
                    {
                        using (var cmd = new SQLiteCommand(@"
                            INSERT INTO sync_outbox (id, entity_type, entity_id, operation, payload_json, created_at, sync_status, retry_count)
                            VALUES (@id, 'stock', @entityId, 'update', '{}', @createdAt, 'pending', 0);
                        ", conn, trans))
                        {
                            var pId = cmd.Parameters.Add("@id", System.Data.DbType.String);
                            var pEntityId = cmd.Parameters.Add("@entityId", System.Data.DbType.String);
                            var pCreated = cmd.Parameters.Add("@createdAt", System.Data.DbType.String);

                            foreach (string prodId in uniqueIds)
                            {
                                pId.Value = Guid.NewGuid().ToString();
                                pEntityId.Value = prodId;
                                pCreated.Value = now;
                                cmd.ExecuteNonQuery();
                            }
                        }
                        trans.Commit();
                    }
                }
            }
            catch
            {
                // Swallow safely so core POS operations remain 100% isolated
            }
        }

        /// <summary>
        /// Computes today's complete aggregate-only POS sales & financial summary (integer piasters, zero PII).
        /// Mirrors Rafiq Desktop ReportsService formulas 1:1.
        /// </summary>
        public DailySalesSummaryDto GetTodaySalesSummary()
        {
            return GetDailySalesSummaryForDate(DateTime.Today, true);
        }

        /// <summary>
        /// Computes aggregate-only POS daily summaries for the last N days (e.g. 30 days)
        /// so cloud date-range filters (7d, 30d, this month, custom) reflect 100% real Desktop POS data.
        /// </summary>
        public List<DailySalesSummaryDto> GetRecentDailySalesSummaries(int days = 30)
        {
            if (days < 1) days = 1;
            if (days > 60) days = 60;
            var list = new List<DailySalesSummaryDto>();
            DateTime today = DateTime.Today;
            for (int i = days - 1; i >= 0; i--)
            {
                DateTime targetDate = today.AddDays(-i);
                bool isToday = (i == 0);
                DailySalesSummaryDto dto = GetDailySalesSummaryForDate(targetDate, isToday);
                if (isToday || dto.InvoiceCount > 0 || dto.ReturnsCount > 0 || (dto.Metrics != null && (dto.Metrics.ExpensesTotalPiasters > 0 || dto.Metrics.DebtPaymentsTotalPiasters > 0)))
                {
                    list.Add(dto);
                }
            }
            return list;
        }

        public DailySalesSummaryDto GetDailySalesSummaryForDate(DateTime localDate, bool includeLiveBalances)
        {
            DateTime dayStartLocal = localDate.Date;
            string dateKey = dayStartLocal.ToString("yyyy-MM-dd");
            string startUtc = dayStartLocal.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss");
            string endUtc = dayStartLocal.AddDays(1).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss");

            var dto = new DailySalesSummaryDto
            {
                SummaryDate = dateKey,
                HourlyBreakdown = new Dictionary<string, long>(),
                TopProducts = new List<DailyTopProductDto>(),
                Metrics = new DailyExtendedMetricsDto()
            };

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();

                // 1. Completed Sales Totals, Payment Splits, Discounts (matching ReportsService)
                using (var cmd = new SQLiteCommand(@"
                    SELECT
                        COALESCE(SUM(s.total_piasters), 0) AS total_sales,
                        COUNT(*) AS invoice_count,
                        COALESCE(SUM(s.discount_piasters), 0) AS total_discount,
                        COALESCE(SUM(CASE WHEN LOWER(s.payment_method) = 'cash' THEN s.total_piasters ELSE 0 END), 0) AS direct_cash,
                        COALESCE(SUM(CASE WHEN LOWER(s.payment_method) = 'instapay' THEN s.total_piasters ELSE 0 END), 0) AS direct_instapay,
                        COALESCE(SUM(CASE WHEN LOWER(s.payment_method) IN ('vodafone_cash', 'wallet', 'orange_cash', 'etisalat_cash', 'we_pay') THEN s.total_piasters ELSE 0 END), 0) AS direct_wallet,
                        COALESCE(SUM(CASE WHEN LOWER(s.payment_method) IN ('card', 'visa', 'mastercard', 'meeza', 'pos', 'bank_card') THEN s.total_piasters ELSE 0 END), 0) AS direct_card,
                        COALESCE(SUM(CASE WHEN s.total_piasters > s.paid_piasters THEN (s.total_piasters - s.paid_piasters) ELSE 0 END), 0) AS credit_sales
                    FROM sales s
                    WHERE s.status != 'cancelled'
                      AND s.id NOT LIKE 'demo_%'
                      AND s.id NOT LIKE 'stress_%'
                      AND s.created_at >= @startUtc AND s.created_at < @endUtc;
                ", conn))
                {
                    cmd.Parameters.AddWithValue("@startUtc", startUtc);
                    cmd.Parameters.AddWithValue("@endUtc", endUtc);
                    using (var reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            dto.TotalSales = Convert.ToInt64(reader["total_sales"]);
                            dto.InvoiceCount = Convert.ToInt32(reader["invoice_count"]);
                            dto.AvgInvoice = dto.InvoiceCount > 0 ? (dto.TotalSales / dto.InvoiceCount) : 0;
                            dto.Metrics.DiscountTotalPiasters = Convert.ToInt64(reader["total_discount"]);
                            dto.CashTotal = Convert.ToInt64(reader["direct_cash"]);
                            dto.Metrics.InstapayTotalPiasters = Convert.ToInt64(reader["direct_instapay"]);
                            dto.Metrics.WalletTotalPiasters = Convert.ToInt64(reader["direct_wallet"]);
                            dto.Metrics.CardOnlyTotalPiasters = Convert.ToInt64(reader["direct_card"]);
                            dto.CreditTotal = Convert.ToInt64(reader["credit_sales"]);
                        }
                    }
                }

                // 1b. Detailed payments table overrides when present (handles multi-payment splits accurately)
                try
                {
                    using (var cmd = new SQLiteCommand(@"
                        SELECT LOWER(p.method) AS method, COALESCE(SUM(p.amount_piasters), 0) AS total_amt
                        FROM payments p
                        INNER JOIN sales s ON s.id = p.sale_id
                        WHERE s.status != 'cancelled'
                          AND s.id NOT LIKE 'demo_%'
                          AND s.id NOT LIKE 'stress_%'
                          AND s.created_at >= @startUtc AND s.created_at < @endUtc
                        GROUP BY LOWER(p.method);
                    ", conn))
                    {
                        cmd.Parameters.AddWithValue("@startUtc", startUtc);
                        cmd.Parameters.AddWithValue("@endUtc", endUtc);
                        long pCash = 0, pInstapay = 0, pWallet = 0, pCard = 0, pCredit = 0;
                        bool hasPayments = false;
                        using (var reader = cmd.ExecuteReader())
                        {
                            while (reader.Read())
                            {
                                hasPayments = true;
                                string m = reader["method"] == DBNull.Value ? "" : reader["method"].ToString();
                                long amt = Convert.ToInt64(reader["total_amt"]);
                                if (m == "cash") pCash += amt;
                                else if (m == "instapay") pInstapay += amt;
                                else if (m == "vodafone_cash" || m == "wallet" || m == "orange_cash" || m == "etisalat_cash" || m == "we_pay") pWallet += amt;
                                else if (m == "card" || m == "visa" || m == "mastercard" || m == "meeza" || m == "pos" || m == "bank_card") pCard += amt;
                                else if (m == "credit") pCredit += amt;
                            }
                        }
                        if (hasPayments)
                        {
                            dto.CashTotal = pCash;
                            dto.Metrics.InstapayTotalPiasters = pInstapay;
                            dto.Metrics.WalletTotalPiasters = pWallet;
                            dto.Metrics.CardOnlyTotalPiasters = pCard;
                            if (pCredit > dto.CreditTotal) dto.CreditTotal = pCredit;
                        }
                    }
                }
                catch { }

                // Combined non-cash electronic collections (Card + InstaPay + Wallets)
                dto.CardTotal = dto.Metrics.CardOnlyTotalPiasters + dto.Metrics.InstapayTotalPiasters + dto.Metrics.WalletTotalPiasters;

                // 2. Cancelled invoices
                try
                {
                    using (var cmd = new SQLiteCommand(@"
                        SELECT COUNT(*) AS cnt, COALESCE(SUM(total_piasters), 0) AS amt
                        FROM sales
                        WHERE status = 'cancelled'
                          AND id NOT LIKE 'demo_%'
                          AND id NOT LIKE 'stress_%'
                          AND created_at >= @startUtc AND created_at < @endUtc;
                    ", conn))
                    {
                        cmd.Parameters.AddWithValue("@startUtc", startUtc);
                        cmd.Parameters.AddWithValue("@endUtc", endUtc);
                        using (var reader = cmd.ExecuteReader())
                        {
                            if (reader.Read())
                            {
                                dto.Metrics.CancelledCount = Convert.ToInt32(reader["cnt"]);
                                dto.Metrics.CancelledTotalPiasters = Convert.ToInt64(reader["amt"]);
                            }
                        }
                    }
                }
                catch { }

                // 3. Returns
                try
                {
                    using (var cmd = new SQLiteCommand(@"
                        SELECT COUNT(*) AS ret_count, COALESCE(SUM(total_piasters), 0) AS ret_total
                        FROM returns
                        WHERE created_at >= @startUtc AND created_at < @endUtc;
                    ", conn))
                    {
                        cmd.Parameters.AddWithValue("@startUtc", startUtc);
                        cmd.Parameters.AddWithValue("@endUtc", endUtc);
                        using (var reader = cmd.ExecuteReader())
                        {
                            if (reader.Read())
                            {
                                dto.ReturnsCount = Convert.ToInt32(reader["ret_count"]);
                                dto.ReturnsTotal = Convert.ToInt64(reader["ret_total"]);
                            }
                        }
                    }
                }
                catch { }

                // 4. Gross Profit from completed sale items (strict integer arithmetic)
                try
                {
                    using (var cmd = new SQLiteCommand(@"
                        SELECT COALESCE(SUM((si.total_piasters - COALESCE(si.tax_piasters, 0)) - ((si.quantity_milli * si.unit_cost_piasters + 500) / 1000)), 0) AS gross_profit
                        FROM sale_items si
                        INNER JOIN sales s ON s.id = si.sale_id
                        WHERE s.status != 'cancelled'
                          AND s.id NOT LIKE 'demo_%'
                          AND s.id NOT LIKE 'stress_%'
                          AND s.created_at >= @startUtc AND s.created_at < @endUtc;
                    ", conn))
                    {
                        cmd.Parameters.AddWithValue("@startUtc", startUtc);
                        cmd.Parameters.AddWithValue("@endUtc", endUtc);
                        object gpObj = cmd.ExecuteScalar();
                        if (gpObj != null && gpObj != DBNull.Value)
                        {
                            dto.Metrics.GrossProfitPiasters = Convert.ToInt64(gpObj);
                        }
                    }
                }
                catch { }

                // 5. Operational Expenses
                try
                {
                    using (var cmd = new SQLiteCommand(@"
                        SELECT COALESCE(SUM(amount_piasters), 0) AS total_exp
                        FROM expenses
                        WHERE (is_cancelled = 0 OR is_cancelled IS NULL)
                          AND ((created_at >= @startUtc AND created_at < @endUtc) OR business_date = @dateKey);
                    ", conn))
                    {
                        cmd.Parameters.AddWithValue("@startUtc", startUtc);
                        cmd.Parameters.AddWithValue("@endUtc", endUtc);
                        cmd.Parameters.AddWithValue("@dateKey", dateKey);
                        object expObj = cmd.ExecuteScalar();
                        if (expObj != null && expObj != DBNull.Value)
                        {
                            dto.Metrics.ExpensesTotalPiasters = Convert.ToInt64(expObj);
                        }
                    }
                }
                catch { }

                // Net Operating Profit = Gross Profit - Expenses
                dto.Metrics.NetProfitPiasters = dto.Metrics.GrossProfitPiasters - dto.Metrics.ExpensesTotalPiasters;

                // 6. Customer Debt Collections received on this day
                try
                {
                    using (var cmd = new SQLiteCommand(@"
                        SELECT COALESCE(SUM(CASE WHEN type = 'payment' THEN amount_piasters WHEN type = 'payment_cancel' THEN -amount_piasters ELSE 0 END), 0)
                        FROM customer_ledger
                        WHERE ((type = 'payment' AND sale_id IS NULL) OR type = 'payment_cancel')
                          AND customer_id NOT LIKE 'demo_%'
                          AND created_at >= @startUtc AND created_at < @endUtc;
                    ", conn))
                    {
                        cmd.Parameters.AddWithValue("@startUtc", startUtc);
                        cmd.Parameters.AddWithValue("@endUtc", endUtc);
                        object dpObj = cmd.ExecuteScalar();
                        if (dpObj != null && dpObj != DBNull.Value)
                        {
                            long dp = Convert.ToInt64(dpObj);
                            dto.Metrics.DebtPaymentsTotalPiasters = dp > 0 ? dp : 0;
                        }
                    }
                }
                catch { }

                // 7. Live Store Receivables & Supplier Payables Snapshot (attached to today's summary)
                if (includeLiveBalances)
                {
                    try
                    {
                        using (var cmd = new SQLiteCommand(@"
                            SELECT COALESCE(SUM(CASE WHEN balance_piasters > 0 THEN balance_piasters ELSE 0 END), 0) AS total_debts,
                                   SUM(CASE WHEN balance_piasters > 0 THEN 1 ELSE 0 END) AS debtors_cnt
                            FROM customers
                            WHERE id NOT LIKE 'demo_%';
                        ", conn))
                        using (var reader = cmd.ExecuteReader())
                        {
                            if (reader.Read())
                            {
                                dto.Metrics.CustomerDebtsTotalPiasters = Convert.ToInt64(reader["total_debts"]);
                                dto.Metrics.DebtorCustomersCount = reader["debtors_cnt"] == DBNull.Value ? 0 : Convert.ToInt32(reader["debtors_cnt"]);
                            }
                        }
                    }
                    catch { }

                    try
                    {
                        using (var cmd = new SQLiteCommand(@"
                            SELECT COALESCE(SUM(CASE WHEN balance_piasters > 0 THEN balance_piasters ELSE 0 END), 0)
                            FROM suppliers
                            WHERE is_active = 1;
                        ", conn))
                        {
                            object spObj = cmd.ExecuteScalar();
                            if (spObj != null && spObj != DBNull.Value)
                            {
                                dto.Metrics.SupplierDebtsTotalPiasters = Convert.ToInt64(spObj);
                            }
                        }
                    }
                    catch { }
                }

                // 8. Hourly breakdown (local shop hours "00".."23" -> integer piasters)
                using (var cmd = new SQLiteCommand(@"
                    SELECT created_at, total_piasters
                    FROM sales
                    WHERE status != 'cancelled'
                      AND id NOT LIKE 'demo_%'
                      AND id NOT LIKE 'stress_%'
                      AND created_at >= @startUtc AND created_at < @endUtc;
                ", conn))
                {
                    cmd.Parameters.AddWithValue("@startUtc", startUtc);
                    cmd.Parameters.AddWithValue("@endUtc", endUtc);
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            string createdRaw = reader["created_at"] == DBNull.Value ? "" : reader["created_at"].ToString();
                            long saleTotal = Convert.ToInt64(reader["total_piasters"]);
                            DateTime parsedUtc;
                            if (DateTime.TryParse(createdRaw, System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.AssumeUniversal | System.Globalization.DateTimeStyles.AdjustToUniversal, out parsedUtc))
                            {
                                string hourKey = parsedUtc.ToLocalTime().ToString("HH");
                                if (dto.HourlyBreakdown.ContainsKey(hourKey))
                                {
                                    dto.HourlyBreakdown[hourKey] = dto.HourlyBreakdown[hourKey] + saleTotal;
                                }
                                else
                                {
                                    dto.HourlyBreakdown[hourKey] = saleTotal;
                                }
                            }
                        }
                    }
                }

                // 9. Top 8 best-selling offline POS products on this date (strict integer arithmetic)
                using (var cmd = new SQLiteCommand(@"
                    SELECT
                        si.product_id,
                        si.product_name,
                        COALESCE(SUM(si.quantity_milli), 0) AS qty_milli,
                        COALESCE(SUM(si.total_piasters), 0) AS revenue_piasters,
                        COALESCE(SUM((si.total_piasters - COALESCE(si.tax_piasters, 0)) - ((si.unit_cost_piasters * si.quantity_milli + 500) / 1000)), 0) AS profit_piasters
                    FROM sale_items si
                    INNER JOIN sales s ON s.id = si.sale_id
                    WHERE s.status != 'cancelled'
                      AND s.id NOT LIKE 'demo_%'
                      AND s.id NOT LIKE 'stress_%'
                      AND s.created_at >= @startUtc AND s.created_at < @endUtc
                    GROUP BY si.product_id, si.product_name
                    ORDER BY revenue_piasters DESC
                    LIMIT 8;
                ", conn))
                {
                    cmd.Parameters.AddWithValue("@startUtc", startUtc);
                    cmd.Parameters.AddWithValue("@endUtc", endUtc);
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            dto.TopProducts.Add(new DailyTopProductDto
                            {
                                Id = reader["product_id"] == DBNull.Value ? "" : reader["product_id"].ToString(),
                                Name = reader["product_name"] == DBNull.Value ? "" : reader["product_name"].ToString(),
                                QtyMilli = Convert.ToInt64(reader["qty_milli"]),
                                RevenuePiasters = Convert.ToInt64(reader["revenue_piasters"]),
                                ProfitPiasters = Convert.ToInt64(reader["profit_piasters"])
                            });
                        }
                    }
                }
            }

            return dto;
        }
    }
}
