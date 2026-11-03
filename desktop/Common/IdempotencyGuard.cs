using System;
using System.Data.SQLite;
using System.Security.Cryptography;
using System.Text;

namespace RafiqPOS.Common
{
    /// <summary>
    /// حماية العمليات المالية من التكرار عند إعادة المحاولة: نفس المفتاح ونفس البيانات يُرجع العملية الأولى،
    /// ونفس المفتاح مع بيانات مختلفة يُرفض حتى لا تُستبدل عملية بأخرى بصمت.
    /// </summary>
    public static class IdempotencyGuard
    {
        // Fixed internal whitelist; table/column names are never taken from a request
        private static readonly string[] GUARDED_TABLES = new string[]
        {
            "returns", "customer_ledger", "expenses", "cash_drawer_transactions", "epay_transactions", "epay_terminal_fundings",
            "digital_transactions", "digital_account_fundings"
        };

        public static string Fingerprint(params object[] parts)
        {
            var sb = new StringBuilder();
            for (int i = 0; i < parts.Length; i++)
            {
                if (i > 0) sb.Append('\u001f');
                sb.Append(parts[i] == null ? "" : Convert.ToString(parts[i], System.Globalization.CultureInfo.InvariantCulture).Trim().ToLowerInvariant());
            }
            using (var sha = SHA256.Create())
            {
                byte[] hash = sha.ComputeHash(Encoding.UTF8.GetBytes(sb.ToString()));
                var hex = new StringBuilder(hash.Length * 2);
                for (int i = 0; i < hash.Length; i++)
                {
                    hex.Append(hash[i].ToString("x2"));
                }
                return hex.ToString();
            }
        }

        public static string NormalizeKey(string idempotencyKey)
        {
            return string.IsNullOrWhiteSpace(idempotencyKey) ? null : idempotencyKey.Trim();
        }

        internal static T WithFinancialOperation<T>(string permission, Func<T> body)
        {
            lock (Services.SaleService.FinancialWriteLock)
            using (var operation = Services.ProductWritePolicy.CurrentAdmission != null ? Services.ProductWritePolicy.BeginOperation() : null)
            {
                if (operation != null && permission != null && !operation.HasPermission(permission))
                    throw new UnauthorizedAccessException("لا تملك صلاحية العملية المالية الأصلية.");
                return body();
            }
        }

        internal static string FinancialActorId(string legacyActor)
        {
            if (Services.ProductWritePolicy.CurrentAdmission != null)
            {
                var operation = Services.ProductWritePolicy.CurrentOperation;
                if (operation == null) throw new UnauthorizedAccessException("العملية المالية لم تُقبل داخل القفل.");
                return operation.ActorId;
            }
            var user = Services.SecurityService.CurrentUser;
            return user != null ? user.Id : legacyActor;
        }

        internal static string FinancialActorName(string legacyName)
        {
            if (Services.ProductWritePolicy.CurrentAdmission != null)
            {
                var operation = Services.ProductWritePolicy.CurrentOperation;
                if (operation == null) throw new UnauthorizedAccessException("العملية المالية لم تُقبل داخل القفل.");
                return operation.ActorName;
            }
            var user = Services.SecurityService.CurrentUser;
            return user != null ? (!string.IsNullOrWhiteSpace(user.DisplayName) ? user.DisplayName : user.Username) : legacyName;
        }

        internal static bool FinancialHasPermission(string permission)
        {
            if (Services.ProductWritePolicy.CurrentAdmission != null)
            {
                var operation = Services.ProductWritePolicy.CurrentOperation;
                if (operation == null) throw new UnauthorizedAccessException("العملية المالية لم تُقبل داخل القفل.");
                return operation.HasPermission(permission);
            }
            return Services.DatabaseService.Security != null &&
                Services.DatabaseService.Security.HasPermission(FinancialActorId(null), permission);
        }

        public static string FinancialAttemptTable(string operation)
        {
            switch (operation)
            {
                case "wallets:processTransaction": return "digital_transactions";
                case "wallets:fundAccount": return "digital_account_fundings";
                case "epay:createTransaction": return "epay_transactions";
                case "epay:fundTerminal": return "epay_terminal_fundings";
                default: throw new ArgumentException("عملية مالية غير مدعومة", "operation");
            }
        }

        internal static string FinancialAttemptPermission(string operation)
        {
            switch (operation)
            {
                case "wallets:processTransaction": return "wallets.transact";
                case "wallets:fundAccount": return "wallets.fund";
                case "epay:createTransaction": return "epay.transact";
                case "epay:fundTerminal": return "epay.fund";
                default: throw new ArgumentException("عملية مالية غير مدعومة", "operation");
            }
        }

        public static bool IsFinancialAttemptCancelled(SQLiteConnection conn, SQLiteTransaction trans,
            string operation, string key, string fingerprint, string actorId)
        {
            FinancialAttemptTable(operation);
            if (NormalizeKey(key) == null) return false;
            using (var cmd = new SQLiteCommand(@"SELECT request_fingerprint, actor_id FROM financial_attempt_cancellations
                WHERE operation = @operation AND idempotency_key = @key LIMIT 1;", conn, trans))
            {
                cmd.Parameters.AddWithValue("@operation", operation);
                cmd.Parameters.AddWithValue("@key", NormalizeKey(key));
                using (var reader = cmd.ExecuteReader())
                {
                    if (!reader.Read()) return false;
                    if (!string.Equals(reader["request_fingerprint"].ToString(), fingerprint, StringComparison.Ordinal) ||
                        !string.Equals(reader["actor_id"].ToString(), actorId, StringComparison.Ordinal))
                        throw new InvalidOperationException("هوية المستخدم أو بيانات المحاولة لا تطابق حاجز الإلغاء المحفوظ.");
                    return true;
                }
            }
        }

        public static void EnsureFinancialAttemptNotCancelled(SQLiteConnection conn, SQLiteTransaction trans,
            string operation, string key, string fingerprint, string actorId)
        {
            VerifyFinancialAttemptKeyActor(key, actorId, false);
            if (IsFinancialAttemptCancelled(conn, trans, operation, key, fingerprint, actorId))
                throw new InvalidOperationException("تم إلغاء هذه المحاولة نهائياً؛ لا يمكن تنفيذ الطلب المتأخر.");
        }

        public static void VerifyFinancialAttemptKeyActor(string key, string actorId, bool requireBoundKey)
        {
            key = NormalizeKey(key);
            bool bound = key != null && key.StartsWith("financial_v1:", StringComparison.Ordinal);
            if (!bound)
            {
                if (requireBoundKey) throw new InvalidOperationException("المحاولة القديمة غير المسجلة لا تثبت مالكها؛ لا يمكن إنشاء حاجز إلغاء لها.");
                return;
            }
            if (string.IsNullOrWhiteSpace(actorId)) throw new InvalidOperationException("المستخدم الأصلي مطلوب");
            string prefix = "financial_v1:" + Uri.EscapeDataString(actorId) + ":";
            if (!key.StartsWith(prefix, StringComparison.Ordinal) || key.Length == prefix.Length)
                throw new InvalidOperationException("رقم المحاولة لا ينتمي للمستخدم الأصلي.");
        }

        public static string FindStrictFinancialAttempt(SQLiteConnection conn, SQLiteTransaction trans,
            string operation, string key, string fingerprint)
        {
            string table = FinancialAttemptTable(operation);
            if (NormalizeKey(key) == null) throw new ArgumentException("رقم المحاولة مطلوب");
            using (var cmd = new SQLiteCommand("SELECT id, idempotency_fingerprint FROM " + table + " WHERE idempotency_key = @key LIMIT 1;", conn, trans))
            {
                cmd.Parameters.AddWithValue("@key", NormalizeKey(key));
                using (var reader = cmd.ExecuteReader())
                {
                    if (!reader.Read()) return null;
                    if (reader["idempotency_fingerprint"] == DBNull.Value ||
                        !string.Equals(reader["idempotency_fingerprint"].ToString(), fingerprint, StringComparison.Ordinal))
                        throw new InvalidOperationException("تعذر إثبات مطابقة الطلب الأصلي والمستخدم؛ لن يتم تحرير المحاولة.");
                    return reader["id"].ToString();
                }
            }
        }

        public static bool RecordFinancialAttemptCancellation(SQLiteConnection conn, SQLiteTransaction trans,
            string operation, string key, string fingerprint, string actorId)
        {
            if (trans == null || !System.Threading.Monitor.IsEntered(Services.SaleService.FinancialWriteLock))
                throw new InvalidOperationException("تسجيل حاجز الإلغاء يتطلب المعاملة الذرية والقفل المالي.");
            if (NormalizeKey(key) == null || string.IsNullOrWhiteSpace(fingerprint) || string.IsNullOrWhiteSpace(actorId))
                throw new ArgumentException("رقم المحاولة وبصمتها والمستخدم الأصلي مطلوبة");
            VerifyFinancialAttemptActor(actorId);
            if (Services.ProductWritePolicy.CurrentAdmission != null && !FinancialHasPermission(FinancialAttemptPermission(operation)))
                throw new UnauthorizedAccessException("لا تملك صلاحية العملية المالية الأصلية.");
            VerifyFinancialAttemptKeyActor(key, actorId, true);
            if (IsFinancialAttemptCancelled(conn, trans, operation, key, fingerprint, actorId)) return false;
            using (var cmd = new SQLiteCommand(@"INSERT INTO financial_attempt_cancellations
                (id, operation, idempotency_key, request_fingerprint, actor_id, cancelled_at)
                VALUES (@id, @operation, @key, @fingerprint, @actor, @now);", conn, trans))
            {
                cmd.Parameters.AddWithValue("@id", Guid.NewGuid().ToString());
                cmd.Parameters.AddWithValue("@operation", operation);
                cmd.Parameters.AddWithValue("@key", NormalizeKey(key));
                cmd.Parameters.AddWithValue("@fingerprint", fingerprint);
                cmd.Parameters.AddWithValue("@actor", actorId);
                cmd.Parameters.AddWithValue("@now", DateTime.UtcNow.ToString("o"));
                cmd.ExecuteNonQuery();
            }
            return true;
        }

        public static string VerifyFinancialAttemptActor(string actorId)
        {
            string admittedActor = FinancialActorId(null);
            if (string.IsNullOrWhiteSpace(admittedActor) || string.IsNullOrWhiteSpace(actorId) || !string.Equals(admittedActor, actorId, StringComparison.Ordinal))
                throw new InvalidOperationException("يجب تسجيل الدخول بالمستخدم الأصلي لإثبات نتيجة المحاولة.");
            return admittedActor;
        }

        public static Models.FinancialAttemptResult ResolveFinancialAttempt(string connectionString,
            string operation, string key, string fingerprint, string actorId, bool abandon,
            Func<SQLiteConnection, SQLiteTransaction, string, object> load,
            Repositories.AuditLogRepository audit)
        {
            VerifyFinancialAttemptActor(actorId);
            if (Services.ProductWritePolicy.CurrentAdmission != null && !FinancialHasPermission(FinancialAttemptPermission(operation)))
                throw new UnauthorizedAccessException("لا تملك صلاحية العملية المالية الأصلية.");
            VerifyFinancialAttemptKeyActor(key, actorId, false);
            if (NormalizeKey(key) == null) throw new ArgumentException("رقم المحاولة الأصلي مطلوب");
            lock (Services.SaleService.FinancialWriteLock)
            using (var conn = new SQLiteConnection(connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    VerifyFinancialAttemptActor(actorId);
                    bool cancelled = IsFinancialAttemptCancelled(conn, trans, operation, key, fingerprint, actorId);
                    string id = FindStrictFinancialAttempt(conn, trans, operation, key, fingerprint);
                    if (cancelled && id != null) throw new InvalidOperationException("حالة مالية متعارضة؛ يجب مراجعة السجل قبل تحرير المحاولة.");
                    object data = id != null ? load(conn, trans, id) : null;
                    if (id != null && data == null) throw new InvalidOperationException("تعذر تحميل النتيجة المالية الكاملة.");
                    if (id == null && !cancelled && abandon)
                    {
                        RecordFinancialAttemptCancellation(conn, trans, operation, key, fingerprint, actorId);
                        var logger = audit ?? new Repositories.AuditLogRepository(connectionString);
                        logger.Log(conn, trans, new Models.AuditLog
                        {
                            UserId = actorId, Action = "financial_attempt_abandon", EntityType = "financial_attempt", EntityId = NormalizeKey(key),
                            DetailsJson = Newtonsoft.Json.JsonConvert.SerializeObject(new { operation = operation, requestFingerprint = fingerprint }),
                            CreatedAt = DateTime.UtcNow.ToString("o")
                        });
                        cancelled = true;
                    }
                    var result = new Models.FinancialAttemptResult
                    {
                        Status = id != null ? "committed" : cancelled ? "abandoned" : "pending",
                        Operation = operation, IdempotencyKey = NormalizeKey(key), ActorId = actorId,
                        RequestFingerprint = fingerprint, Data = data
                    };
                    trans.Commit();
                    return result;
                }
            }
        }

        /// <summary>
        /// يُرجع قيمة العمود المطلوب للعملية المسجلة بنفس المفتاح، أو null إن لم توجد. يرفض اختلاف البيانات.
        /// </summary>
        public static string FindExisting(SQLiteConnection conn, SQLiteTransaction trans, string table, string valueColumn, string idempotencyKey, string fingerprint)
        {
            string key = NormalizeKey(idempotencyKey);
            if (key == null) return null;
            if (Array.IndexOf(GUARDED_TABLES, table) < 0)
            {
                throw new ArgumentException("جدول غير مدعوم لحماية التكرار", "table");
            }

            string sql = string.Format("SELECT {0}, idempotency_fingerprint FROM {1} WHERE idempotency_key = @key LIMIT 1;", valueColumn, table);
            using (var cmd = new SQLiteCommand(sql, conn, trans))
            {
                cmd.Parameters.AddWithValue("@key", key);
                using (var reader = cmd.ExecuteReader())
                {
                    if (!reader.Read()) return null;
                    string stored = reader["idempotency_fingerprint"] != DBNull.Value ? reader["idempotency_fingerprint"].ToString() : null;
                    // Rows saved before fingerprints existed (migration 60) cannot be compared and are accepted as the same operation
                    if (!string.IsNullOrEmpty(stored) && !string.Equals(stored, fingerprint, StringComparison.Ordinal))
                    {
                        throw new InvalidOperationException("تم استخدام نفس رقم العملية لطلب مختلف في البيانات؛ لم يتم تسجيل أي عملية جديدة. يرجى إعادة فتح الشاشة والمحاولة من جديد.");
                    }
                    return reader[0] != DBNull.Value ? reader[0].ToString() : null;
                }
            }
        }

        public static string FindExisting(string connectionString, string table, string valueColumn, string idempotencyKey, string fingerprint)
        {
            if (NormalizeKey(idempotencyKey) == null) return null;
            using (var conn = new SQLiteConnection(connectionString))
            {
                conn.Open();
                return FindExisting(conn, null, table, valueColumn, idempotencyKey, fingerprint);
            }
        }
    }
}
