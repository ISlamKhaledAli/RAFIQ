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
            "returns", "customer_ledger", "expenses", "cash_drawer_transactions", "epay_transactions", "epay_terminal_fundings"
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
