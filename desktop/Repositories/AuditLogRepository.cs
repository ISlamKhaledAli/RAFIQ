using System;
using System.Collections.Generic;
using System.Data.SQLite;
using RafiqPOS.Models;

namespace RafiqPOS.Repositories
{
    public class AuditLogRepository
    {
        private readonly string _connectionString;

        public AuditLogRepository(string connectionString)
        {
            _connectionString = connectionString;
        }

        /// <summary>
        /// تسجيل عملية حساسة داخل نفس المعاملة الذرية (Task 7-3 & Senior Rule 2)
        /// يُلغى السجل تلقائياً إذا فشلت المعاملة
        /// </summary>
        public void Log(SQLiteConnection conn, SQLiteTransaction trans, AuditLog entry)
        {
            if (string.IsNullOrEmpty(entry.Id))
            {
                entry.Id = "aud_" + Guid.NewGuid().ToString("N");
            }
            if (string.IsNullOrEmpty(entry.CreatedAt))
            {
                entry.CreatedAt = DateTime.UtcNow.ToString("o");
            }

            string sql = @"
                INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details_json, created_at)
                VALUES (@id, @userId, @action, @entityType, @entityId, @detailsJson, @createdAt);
            ";

            using (var cmd = new SQLiteCommand(sql, conn, trans))
            {
                cmd.Parameters.AddWithValue("@id", entry.Id);
                cmd.Parameters.AddWithValue("@userId", (object)entry.UserId ?? "usr_admin_default");
                cmd.Parameters.AddWithValue("@action", entry.Action);
                cmd.Parameters.AddWithValue("@entityType", entry.EntityType);
                cmd.Parameters.AddWithValue("@entityId", entry.EntityId);
                cmd.Parameters.AddWithValue("@detailsJson", (object)entry.DetailsJson ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@createdAt", entry.CreatedAt);
                cmd.ExecuteNonQuery();
            }
        }

        public void Log(AuditLog entry)
        {
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        Log(conn, trans, entry);
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

        public List<AuditLog> GetLogs(int limit = 100, string action = null)
        {
            var list = new List<AuditLog>();
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    SELECT a.id, a.user_id, a.action, a.entity_type, a.entity_id, a.details_json, a.created_at,
                           COALESCE(u.display_name, 'مدير النظام') AS user_display_name
                    FROM audit_logs a
                    LEFT JOIN users u ON a.user_id = u.id
                    WHERE (@action IS NULL OR a.action = @action)
                    ORDER BY a.created_at DESC
                    LIMIT @limit;
                ";

                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@action", string.IsNullOrEmpty(action) ? (object)DBNull.Value : action);
                    cmd.Parameters.AddWithValue("@limit", limit);

                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            string rawAction = reader["action"].ToString();
                            list.Add(new AuditLog
                            {
                                Id = reader["id"].ToString(),
                                UserId = reader["user_id"] != DBNull.Value ? reader["user_id"].ToString() : null,
                                UserDisplayName = reader["user_display_name"].ToString(),
                                Action = rawAction,
                                ActionArabic = GetActionArabicLabel(rawAction),
                                EntityType = reader["entity_type"].ToString(),
                                EntityId = reader["entity_id"].ToString(),
                                DetailsJson = reader["details_json"] != DBNull.Value ? reader["details_json"].ToString() : null,
                                CreatedAt = reader["created_at"].ToString()
                            });
                        }
                    }
                }
            }
            return list;
        }

        public static string GetActionArabicLabel(string action)
        {
            switch (action)
            {
                case "price_update":
                    return "تعديل سعر البيع";
                case "cost_update":
                    return "تعديل تكلفة الشراء";
                case "stock_adjust":
                    return "تسوية رصيد مخزون";
                case "sale_create":
                    return "إصدار فاتورة بيع";
                case "sale_void":
                    return "إلغاء فاتورة بيع";
                case "debt_payment":
                    return "سداد دفعة آجل";
                case "product_create":
                    return "إضافة صنف جديد";
                case "product_delete":
                    return "حذف صنف من الكتالوج";
                case "settings_update":
                    return "تعديل إعدادات النظام";
                default:
                    return action;
            }
        }
    }
}
