using System;
using System.Data.SQLite;

namespace RafiqPOS.Repositories
{
    /// <summary>
    /// Feature #107 / Task 107-1 & 107-2: إدارة عدادات الأرقام المتسلسلة التراكمية في قاعدة البيانات (مثل أرقام الفواتير)
    /// تضمن زيادة ذرية آمنة بنسبة 100% داخل معاملة البيع بدون فجوات أو تكرار عند انقطاع الكهرباء.
    /// </summary>
    public class CounterRepository
    {
        private readonly string _connectionString;

        public CounterRepository(string connectionString)
        {
            _connectionString = connectionString;
        }

        /// <summary>
        /// Task 107-2: زيادة العداد الذري داخل معاملة البيع المفتوحة مسبقاً (ACID Transaction)
        /// </summary>
        public long GetNextInvoiceNumber(SQLiteConnection conn, SQLiteTransaction trans)
        {
            return GetNextCounterNumber(conn, trans, "invoice_number", "sales", "invoice_number");
        }

        public long GetNextCounterNumber(SQLiteConnection conn, SQLiteTransaction trans, string counterName, string fallbackMaxTable = null, string fallbackMaxCol = null)
        {
            if (conn == null) throw new ArgumentNullException("conn");
            if (string.IsNullOrEmpty(counterName)) throw new ArgumentNullException("counterName");

            string now = DateTime.UtcNow.ToString("o");

            string maxSelect = "0";
            if (!string.IsNullOrEmpty(fallbackMaxTable) && !string.IsNullOrEmpty(fallbackMaxCol))
            {
                maxSelect = string.Format("COALESCE((SELECT MAX({0}) FROM {1}), 0)", fallbackMaxCol, fallbackMaxTable);
            }

            string ensureSql = string.Format(@"
                INSERT OR IGNORE INTO counters (name, current_value, updated_at)
                VALUES (@name, {0}, @now);
            ", maxSelect);

            using (var cmdEnsure = new SQLiteCommand(ensureSql, conn, trans))
            {
                cmdEnsure.Parameters.AddWithValue("@name", counterName);
                cmdEnsure.Parameters.AddWithValue("@now", now);
                cmdEnsure.ExecuteNonQuery();
            }

            string updateSql = @"
                UPDATE counters
                SET current_value = current_value + 1,
                    updated_at = @now
                WHERE name = @name;
            ";
            using (var cmdUpdate = new SQLiteCommand(updateSql, conn, trans))
            {
                cmdUpdate.Parameters.AddWithValue("@name", counterName);
                cmdUpdate.Parameters.AddWithValue("@now", now);
                cmdUpdate.ExecuteNonQuery();
            }

            string selectSql = "SELECT current_value FROM counters WHERE name = @name;";
            using (var cmdSelect = new SQLiteCommand(selectSql, conn, trans))
            {
                cmdSelect.Parameters.AddWithValue("@name", counterName);
                object result = cmdSelect.ExecuteScalar();
                if (result != null && result != DBNull.Value)
                {
                    return Convert.ToInt64(result);
                }
            }

            return 1;
        }

        /// <summary>
        /// Task 107-3: قراءة رقم الفاتورة المتوقع التالي دون زيادته في قاعدة البيانات (للعرض على الواجهة)
        /// </summary>
        public long GetNextExpectedInvoiceNumber()
        {
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    SELECT COALESCE(
                        (SELECT current_value FROM counters WHERE name = 'invoice_number'),
                        (SELECT MAX(invoice_number) FROM sales),
                        0
                    ) + 1;
                ";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    object result = cmd.ExecuteScalar();
                    if (result != null && result != DBNull.Value)
                    {
                        return Convert.ToInt64(result);
                    }
                }
            }
            return 1;
        }

        /// <summary>
        /// الحصول على القيمة الحالية لأي عداد
        /// </summary>
        public long GetCurrentValue(string counterName)
        {
            if (string.IsNullOrEmpty(counterName)) return 0;

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = "SELECT current_value FROM counters WHERE name = @name;";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@name", counterName);
                    object result = cmd.ExecuteScalar();
                    if (result != null && result != DBNull.Value)
                    {
                        return Convert.ToInt64(result);
                    }
                }
            }
            return 0;
        }

        /// <summary>
        /// ضبط أو تصفير عداد (للاستخدام الإداري أو بداية سنة مالية جديدة)
        /// </summary>
        public void SetCounter(string counterName, long value)
        {
            if (string.IsNullOrEmpty(counterName)) throw new ArgumentNullException("counterName");

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string now = DateTime.UtcNow.ToString("o");
                string sql = @"
                    INSERT INTO counters (name, current_value, updated_at)
                    VALUES (@name, @val, @now)
                    ON CONFLICT(name) DO UPDATE SET current_value = @val, updated_at = @now;
                ";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@name", counterName);
                    cmd.Parameters.AddWithValue("@val", value);
                    cmd.Parameters.AddWithValue("@now", now);
                    cmd.ExecuteNonQuery();
                }
            }
        }
    }
}
