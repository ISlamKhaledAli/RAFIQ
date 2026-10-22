using System;
using System.Data.SQLite;

namespace RafiqPOS.Services
{
    /// <summary>
    /// مرجع موحد لحساب أيام العمل والنوافذ الزمنية الليلية وفق ساعة الإغلاق (F-17, F-26, F-33, F-40)
    /// </summary>
    public static class BusinessDayHelper
    {
        public static int GetCutoffHour(SQLiteConnection conn, SQLiteTransaction trans)
        {
            using (var cmd = conn.CreateCommand())
            {
                cmd.Transaction = trans;
                cmd.CommandText = "SELECT value FROM app_settings WHERE key = 'business_day_cutoff_hour' LIMIT 1;";
                object val = cmd.ExecuteScalar();
                int cutoff;
                if (val != null && val != DBNull.Value && int.TryParse(val.ToString(), out cutoff) && cutoff >= 0 && cutoff <= 12)
                {
                    return cutoff;
                }
                return 0;
            }
        }

        public static int GetCutoffHour(string connectionString)
        {
            using (var conn = new SQLiteConnection(connectionString))
            {
                conn.Open();
                return GetCutoffHour(conn, null);
            }
        }

        public static DateTime GetCurrentBusinessDate(SQLiteConnection conn, SQLiteTransaction trans)
        {
            int cutoffHour = GetCutoffHour(conn, trans);
            DateTime now = DateTime.Now; // Local time
            if (cutoffHour > 0 && now.Hour < cutoffHour)
            {
                return now.Date.AddDays(-1);
            }
            return now.Date;
        }

        public static DateTime GetCurrentBusinessDate(string connectionString)
        {
            using (var conn = new SQLiteConnection(connectionString))
            {
                conn.Open();
                return GetCurrentBusinessDate(conn, null);
            }
        }

        public static bool IsBusinessDayClosed(SQLiteConnection conn, SQLiteTransaction trans, DateTime businessDate)
        {
            using (var cmd = conn.CreateCommand())
            {
                cmd.Transaction = trans;
                cmd.CommandText = "SELECT COUNT(*) FROM daily_closings WHERE business_date = @d AND (status = 'closed' OR status = 'sealed');";
                cmd.Parameters.AddWithValue("@d", businessDate.ToString("yyyy-MM-dd"));
                object countObj = cmd.ExecuteScalar();
                long count = countObj != null && countObj != DBNull.Value ? Convert.ToInt64(countObj) : 0;
                return count > 0;
            }
        }

        public static bool IsBusinessDayClosed(string connectionString, DateTime businessDate)
        {
            using (var conn = new SQLiteConnection(connectionString))
            {
                conn.Open();
                return IsBusinessDayClosed(conn, null, businessDate);
            }
        }

        public static void GetBusinessDayWindow(SQLiteConnection conn, SQLiteTransaction trans,
            DateTime businessDate, out DateTime windowStart, out DateTime windowEnd)
        {
            int cutoffHour = GetCutoffHour(conn, trans);
            windowStart = businessDate.Date.AddHours(cutoffHour);
            windowEnd = businessDate.Date.AddDays(1).AddHours(cutoffHour).AddSeconds(-1);
        }

        public static string GetSqlDateClause(string columnName, string paramPrefix)
        {
            return string.Format(
                "datetime({0}, 'localtime') >= @{1}_start AND datetime({0}, 'localtime') <= @{1}_end",
                columnName, paramPrefix);
        }

        public static void AddDateParams(SQLiteCommand cmd, string paramPrefix,
            DateTime windowStart, DateTime windowEnd)
        {
            cmd.Parameters.AddWithValue("@" + paramPrefix + "_start",
                windowStart.ToString("yyyy-MM-dd HH:mm:ss"));
            cmd.Parameters.AddWithValue("@" + paramPrefix + "_end",
                windowEnd.ToString("yyyy-MM-dd HH:mm:ss"));
        }
    }
}
