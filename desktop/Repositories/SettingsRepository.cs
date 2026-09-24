using System;
using System.Collections.Generic;
using System.Data.SQLite;

namespace RafiqPOS.Repositories
{
    public class SettingsRepository
    {
        private readonly string _connectionString;

        public SettingsRepository(string connectionString)
        {
            this._connectionString = connectionString;
        }

        public Dictionary<string, string> GetAll()
        {
            var result = new Dictionary<string, string>();
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand("SELECT key, value FROM app_settings;", conn))
                {
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            string key = reader.GetString(0);
                            string val = reader.IsDBNull(1) ? "" : reader.GetString(1);
                            result[key] = val;
                        }
                    }
                }
            }
            return result;
        }

        public string Get(string key, string defaultValue)
        {
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand("SELECT value FROM app_settings WHERE key = @key;", conn))
                {
                    cmd.Parameters.AddWithValue("@key", key);
                    object val = cmd.ExecuteScalar();
                    if (val != null && val != DBNull.Value)
                    {
                        return val.ToString();
                    }
                }
            }
            return defaultValue;
        }

        public void Set(string key, string value)
        {
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand(@"
                    INSERT INTO app_settings (key, value, updated_at) 
                    VALUES (@key, @value, @updated_at)
                    ON CONFLICT(key) DO UPDATE SET 
                        value = excluded.value, 
                        updated_at = excluded.updated_at;
                ", conn))
                {
                    cmd.Parameters.AddWithValue("@key", key);
                    cmd.Parameters.AddWithValue("@value", value ?? "");
                    cmd.Parameters.AddWithValue("@updated_at", DateTime.UtcNow.ToString("o"));
                    cmd.ExecuteNonQuery();
                }
            }
        }

        public void SaveBatch(Dictionary<string, string> settings)
        {
            if (settings == null) return;

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        string now = DateTime.UtcNow.ToString("o");
                        foreach (var kvp in settings)
                        {
                            using (var cmd = new SQLiteCommand(@"
                                INSERT INTO app_settings (key, value, updated_at) 
                                VALUES (@key, @value, @updated_at)
                                ON CONFLICT(key) DO UPDATE SET 
                                    value = excluded.value, 
                                    updated_at = excluded.updated_at;
                            ", conn, trans))
                            {
                                cmd.Parameters.AddWithValue("@key", kvp.Key);
                                cmd.Parameters.AddWithValue("@value", kvp.Value ?? "");
                                cmd.Parameters.AddWithValue("@updated_at", now);
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
    }
}
