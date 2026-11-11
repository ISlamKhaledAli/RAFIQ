using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Security.Cryptography;
using System.Text;

namespace RafiqPOS.Data
{
    // Opens database files of either format for the code paths that deal with arbitrary files (backups, staging copies,
    // conversion, inspection): the format is decided by the file header, never by the process-wide default, so a legacy
    // plain file and an encrypted file can be handled side by side.
    internal static class DatabaseFileAccess
    {
        public static string BuildConnectionString(string path, bool readOnly)
        {
            return string.Format(CultureInfo.InvariantCulture, "Data Source={0};Version=3;Pooling=False;BusyTimeout=5000;{1}", path, readOnly ? "Read Only=True;" : string.Empty);
        }

        // Opens an EXISTING file read-only or read/write; plain files without a key, everything else with the product key.
        public static SQLiteConnection OpenExisting(string path, bool readOnly)
        {
            DatabaseFileKind kind = DatabaseKeyProvider.DetectFileKind(path);
            if (kind == DatabaseFileKind.Missing) throw new FileNotFoundException("Database file not found", path);
            return Open(path, readOnly, kind == DatabaseFileKind.Plain);
        }

        public static SQLiteConnection Open(string path, bool readOnly, bool plain)
        {
            string cs = BuildConnectionString(path, readOnly);
            SQLiteConnection conn;
            if (plain)
            {
                conn = new SQLiteConnection(cs + "Encryption=None;");
            }
            else
            {
                conn = new SQLiteConnection(cs);
                byte[] key = DatabaseKeyProvider.GetKey();
                try { conn.SetEncryptionKey(key); }
                finally { Array.Clear(key, 0, key.Length); }
            }
            try
            {
                conn.Open();
                return conn;
            }
            catch (Exception)
            {
                conn.Dispose();
                throw;
            }
        }

        // Creates a new, empty database file that is encrypted with the product key (independent of the process default).
        public static SQLiteConnection CreateEncrypted(string path)
        {
            return Open(path, false, false);
        }

        // Creates a new, empty PLAIN database file (legacy tooling, tests, decrypted export).
        public static SQLiteConnection CreatePlain(string path)
        {
            return Open(path, false, true);
        }

        public static SQLiteConnection OpenWithKey(string path, bool readOnly, byte[] key)
        {
            SQLiteConnection conn = new SQLiteConnection(BuildConnectionString(path, readOnly));
            try
            {
                conn.SetEncryptionKey(key);
                conn.Open();
                return conn;
            }
            catch (Exception)
            {
                conn.Dispose();
                throw;
            }
        }

        public static string QuoteIdentifier(string name)
        {
            return "\"" + name.Replace("\"", "\"\"") + "\"";
        }

        public static object Scalar(SQLiteConnection conn, string sql)
        {
            using (SQLiteCommand cmd = new SQLiteCommand(sql, conn))
            {
                return cmd.ExecuteScalar();
            }
        }

        public static void Execute(SQLiteConnection conn, string sql)
        {
            using (SQLiteCommand cmd = new SQLiteCommand(sql, conn))
            {
                cmd.ExecuteNonQuery();
            }
        }

        // PRAGMA integrity_check returns the single row "ok" for a healthy database.
        public static bool IntegrityCheckPasses(SQLiteConnection conn)
        {
            using (SQLiteCommand cmd = new SQLiteCommand("PRAGMA integrity_check;", conn))
            using (SQLiteDataReader reader = cmd.ExecuteReader())
            {
                bool first = true;
                while (reader.Read())
                {
                    string line = reader.IsDBNull(0) ? string.Empty : reader.GetString(0);
                    if (!first || !string.Equals(line, "ok", StringComparison.OrdinalIgnoreCase)) return false;
                    first = false;
                }
                return !first;
            }
        }

        // Row-exact fingerprint of a database: the schema text, user_version and, per table, the row count plus a SHA-256 over
        // every row (values rendered with SQLite quote(), so type, blob bytes and full REAL precision all count).
        // Two databases with the same fingerprint hold the same data; it is how the plain-to-encrypted conversion is verified.
        public static IDictionary<string, string> ComputeFingerprint(SQLiteConnection conn)
        {
            return ComputeFingerprint(conn, null);
        }

        // progress receives short Arabic lines (table n of m, row counts of big tables) for the startup splash
        public static IDictionary<string, string> ComputeFingerprint(SQLiteConnection conn, Action<string> progress)
        {
            SortedDictionary<string, string> result = new SortedDictionary<string, string>(StringComparer.Ordinal);
            result["pragma:user_version"] = Convert.ToString(Scalar(conn, "PRAGMA user_version;"), CultureInfo.InvariantCulture);

            using (SHA256 schemaHash = SHA256.Create())
            {
                using (SQLiteCommand cmd = new SQLiteCommand("SELECT quote(type) || char(31) || quote(name) || char(31) || quote(tbl_name) || char(31) || quote(sql) FROM sqlite_master ORDER BY type, name, rowid;", conn))
                using (SQLiteDataReader reader = cmd.ExecuteReader())
                {
                    while (reader.Read()) AppendLine(schemaHash, reader.GetString(0));
                }
                schemaHash.TransformFinalBlock(new byte[0], 0, 0);
                result["schema"] = DatabaseKeyProvider.ToHex(schemaHash.Hash);
            }

            List<string> tables = new List<string>();
            using (SQLiteCommand cmd = new SQLiteCommand("SELECT name FROM sqlite_master WHERE type = 'table' AND rootpage > 0 ORDER BY name;", conn))
            using (SQLiteDataReader reader = cmd.ExecuteReader())
            {
                while (reader.Read()) tables.Add(reader.GetString(0));
            }

            for (int t = 0; t < tables.Count; t++)
            {
                if (progress != null) progress(string.Format(CultureInfo.InvariantCulture, "جدول {0} من {1} ({2}%)", t + 1, tables.Count, (t * 100) / Math.Max(1, tables.Count)));
                result["table:" + tables[t]] = FingerprintTable(conn, tables[t], progress);
            }
            return result;
        }

        private static string FingerprintTable(SQLiteConnection conn, string table, Action<string> progress)
        {
            string quoted = QuoteIdentifier(table);
            List<string> columns = new List<string>();
            using (SQLiteCommand cmd = new SQLiteCommand("PRAGMA table_info(" + quoted + ");", conn))
            using (SQLiteDataReader reader = cmd.ExecuteReader())
            {
                while (reader.Read()) columns.Add(reader.GetString(1));
            }
            if (columns.Count == 0) return "0:no-columns";

            StringBuilder expr = new StringBuilder();
            for (int i = 0; i < columns.Count; i++)
            {
                if (i > 0) expr.Append(" || char(31) || ");
                string col = QuoteIdentifier(columns[i]);
                expr.Append("typeof(").Append(col).Append(") || ':' || quote(").Append(col).Append(")");
            }

            long count = 0;
            using (SHA256 sha = SHA256.Create())
            {
                string sql = "SELECT " + expr + " FROM " + quoted + " ORDER BY rowid;";
                SQLiteCommand cmd = new SQLiteCommand(sql, conn);
                SQLiteDataReader reader;
                try
                {
                    reader = cmd.ExecuteReader();
                }
                catch (SQLiteException)
                {
                    cmd.Dispose();
                    // WITHOUT ROWID table: fall back to ordering by every column
                    StringBuilder order = new StringBuilder();
                    for (int i = 0; i < columns.Count; i++)
                    {
                        if (i > 0) order.Append(", ");
                        order.Append(QuoteIdentifier(columns[i]));
                    }
                    cmd = new SQLiteCommand("SELECT " + expr + " FROM " + quoted + " ORDER BY " + order + ";", conn);
                    reader = cmd.ExecuteReader();
                }
                using (cmd)
                using (reader)
                {
                    while (reader.Read())
                    {
                        AppendLine(sha, reader.GetString(0));
                        count++;
                        if (progress != null && count % 100000 == 0)
                        {
                            progress(string.Format(CultureInfo.InvariantCulture, "{0}: {1:N0} سجل", table, count));
                        }
                    }
                }
                sha.TransformFinalBlock(new byte[0], 0, 0);
                return count.ToString(CultureInfo.InvariantCulture) + ":" + DatabaseKeyProvider.ToHex(sha.Hash);
            }
        }

        private static void AppendLine(SHA256 sha, string text)
        {
            byte[] bytes = Encoding.UTF8.GetBytes(text + "\n");
            sha.TransformBlock(bytes, 0, bytes.Length, null, 0);
        }

        // Returns null when both fingerprints are identical, otherwise a short description of the first difference.
        public static string CompareFingerprints(IDictionary<string, string> expected, IDictionary<string, string> actual)
        {
            foreach (KeyValuePair<string, string> pair in expected)
            {
                string other;
                if (!actual.TryGetValue(pair.Key, out other)) return pair.Key + " (missing)";
                if (!string.Equals(pair.Value, other, StringComparison.Ordinal)) return pair.Key;
            }
            foreach (KeyValuePair<string, string> pair in actual)
            {
                if (!expected.ContainsKey(pair.Key)) return pair.Key + " (unexpected)";
            }
            return null;
        }
    }
}
