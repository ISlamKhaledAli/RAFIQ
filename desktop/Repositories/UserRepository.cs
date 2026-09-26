using System;
using System.Collections.Generic;
using System.Data.SQLite;
using RafiqPOS.Models;

namespace RafiqPOS.Repositories
{
    public class UserRepository
    {
        private readonly string _connectionString;

        public UserRepository(string connectionString)
        {
            this._connectionString = connectionString;
        }

        public List<User> GetAll(bool onlyActive = false)
        {
            var list = new List<User>();
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = "SELECT id, username, display_name, pin_code_hash, pin_salt, role, is_active, failed_attempts, lockout_until, permissions_json, created_at, updated_at, last_login_at FROM users";
                if (onlyActive)
                {
                    sql += " WHERE is_active = 1";
                }
                sql += " ORDER BY role DESC, display_name ASC;";

                using (var cmd = new SQLiteCommand(sql, conn))
                using (var reader = cmd.ExecuteReader())
                {
                    while (reader.Read())
                    {
                        list.Add(MapUser(reader));
                    }
                }
            }
            return list;
        }

        public User GetById(string id)
        {
            if (string.IsNullOrEmpty(id)) return null;

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = "SELECT id, username, display_name, pin_code_hash, pin_salt, role, is_active, failed_attempts, lockout_until, permissions_json, created_at, updated_at, last_login_at FROM users WHERE id = @id LIMIT 1;";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@id", id);
                    using (var reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            return MapUser(reader);
                        }
                    }
                }
            }
            return null;
        }

        public User GetByUsername(string username)
        {
            if (string.IsNullOrEmpty(username)) return null;

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = "SELECT id, username, display_name, pin_code_hash, pin_salt, role, is_active, failed_attempts, lockout_until, permissions_json, created_at, updated_at, last_login_at FROM users WHERE username = @username COLLATE NOCASE LIMIT 1;";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@username", username);
                    using (var reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            return MapUser(reader);
                        }
                    }
                }
            }
            return null;
        }

        public void Insert(User user)
        {
            if (user == null) throw new ArgumentNullException("user");

            if (string.IsNullOrEmpty(user.Id))
            {
                user.Id = "usr_" + Guid.NewGuid().ToString("N");
            }
            if (string.IsNullOrEmpty(user.CreatedAt))
            {
                user.CreatedAt = DateTime.UtcNow.ToString("o");
            }
            user.UpdatedAt = DateTime.UtcNow.ToString("o");

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    INSERT INTO users (id, username, display_name, pin_code_hash, pin_salt, role, is_active, failed_attempts, lockout_until, permissions_json, created_at, updated_at, last_login_at)
                    VALUES (@id, @username, @displayName, @pinCodeHash, @pinSalt, @role, @isActive, @failedAttempts, @lockoutUntil, @permissionsJson, @createdAt, @updatedAt, @lastLoginAt);
                ";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@id", user.Id);
                    cmd.Parameters.AddWithValue("@username", user.Username);
                    cmd.Parameters.AddWithValue("@displayName", user.DisplayName);
                    cmd.Parameters.AddWithValue("@pinCodeHash", user.PinCodeHash ?? "");
                    cmd.Parameters.AddWithValue("@pinSalt", user.PinSalt ?? "");
                    cmd.Parameters.AddWithValue("@role", user.Role ?? "cashier");
                    cmd.Parameters.AddWithValue("@isActive", user.IsActive ? 1 : 0);
                    cmd.Parameters.AddWithValue("@failedAttempts", user.FailedAttempts);
                    cmd.Parameters.AddWithValue("@lockoutUntil", (object)user.LockoutUntil ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@permissionsJson", (object)user.PermissionsJson ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@createdAt", user.CreatedAt);
                    cmd.Parameters.AddWithValue("@updatedAt", user.UpdatedAt);
                    cmd.Parameters.AddWithValue("@lastLoginAt", (object)user.LastLoginAt ?? DBNull.Value);
                    cmd.ExecuteNonQuery();
                }
            }
        }

        public void Update(User user)
        {
            if (user == null) throw new ArgumentNullException("user");

            user.UpdatedAt = DateTime.UtcNow.ToString("o");

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    UPDATE users 
                    SET display_name = @displayName,
                        role = @role,
                        is_active = @isActive,
                        permissions_json = @permissionsJson,
                        updated_at = @updatedAt
                    WHERE id = @id;
                ";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@id", user.Id);
                    cmd.Parameters.AddWithValue("@displayName", user.DisplayName);
                    cmd.Parameters.AddWithValue("@role", user.Role ?? "cashier");
                    cmd.Parameters.AddWithValue("@isActive", user.IsActive ? 1 : 0);
                    cmd.Parameters.AddWithValue("@permissionsJson", (object)user.PermissionsJson ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@updatedAt", user.UpdatedAt);
                    cmd.ExecuteNonQuery();
                }
            }
        }

        public void UpdatePin(string userId, string pinHash, string pinSalt)
        {
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    UPDATE users 
                    SET pin_code_hash = @pinHash,
                        pin_salt = @pinSalt,
                        failed_attempts = 0,
                        lockout_until = NULL,
                        updated_at = @updatedAt
                    WHERE id = @id;
                ";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@id", userId);
                    cmd.Parameters.AddWithValue("@pinHash", pinHash ?? "");
                    cmd.Parameters.AddWithValue("@pinSalt", pinSalt ?? "");
                    cmd.Parameters.AddWithValue("@updatedAt", DateTime.UtcNow.ToString("o"));
                    cmd.ExecuteNonQuery();
                }
            }
        }

        public void RecordLoginAttempt(string userId, bool success, int lockoutSeconds = 0)
        {
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql;
                if (success)
                {
                    sql = @"
                        UPDATE users 
                        SET failed_attempts = 0,
                            lockout_until = NULL,
                            last_login_at = @now,
                            updated_at = @now
                        WHERE id = @id;
                    ";
                }
                else
                {
                    sql = @"
                        UPDATE users 
                        SET failed_attempts = failed_attempts + 1,
                            lockout_until = @lockoutUntil,
                            updated_at = @now
                        WHERE id = @id;
                    ";
                }

                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@id", userId);
                    cmd.Parameters.AddWithValue("@now", DateTime.UtcNow.ToString("o"));
                    if (!success)
                    {
                        object lockVal = DBNull.Value;
                        if (lockoutSeconds > 0)
                        {
                            lockVal = DateTime.UtcNow.AddSeconds(lockoutSeconds).ToString("o");
                        }
                        cmd.Parameters.AddWithValue("@lockoutUntil", lockVal);
                    }
                    cmd.ExecuteNonQuery();
                }
            }
        }

        public void SetStatus(string userId, bool isActive)
        {
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = "UPDATE users SET is_active = @isActive, updated_at = @now WHERE id = @id;";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@id", userId);
                    cmd.Parameters.AddWithValue("@isActive", isActive ? 1 : 0);
                    cmd.Parameters.AddWithValue("@now", DateTime.UtcNow.ToString("o"));
                    cmd.ExecuteNonQuery();
                }
            }
        }

        public int GetActiveAdminCount()
        {
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = "SELECT COUNT(*) FROM users WHERE role = 'admin' AND is_active = 1;";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    return Convert.ToInt32(cmd.ExecuteScalar());
                }
            }
        }

        private static User MapUser(SQLiteDataReader reader)
        {
            var u = new User();
            u.Id = reader["id"].ToString();
            u.Username = reader["username"].ToString();
            u.DisplayName = reader["display_name"].ToString();
            u.PinCodeHash = reader["pin_code_hash"] != DBNull.Value ? reader["pin_code_hash"].ToString() : "";
            u.PinSalt = reader["pin_salt"] != DBNull.Value ? reader["pin_salt"].ToString() : "";
            u.Role = reader["role"].ToString();
            u.IsActive = Convert.ToInt32(reader["is_active"]) == 1;
            u.FailedAttempts = reader["failed_attempts"] != DBNull.Value ? Convert.ToInt32(reader["failed_attempts"]) : 0;
            u.LockoutUntil = reader["lockout_until"] != DBNull.Value ? reader["lockout_until"].ToString() : null;
            u.PermissionsJson = reader["permissions_json"] != DBNull.Value ? reader["permissions_json"].ToString() : null;
            u.CreatedAt = reader["created_at"].ToString();
            u.UpdatedAt = reader["updated_at"] != DBNull.Value ? reader["updated_at"].ToString() : null;
            u.LastLoginAt = reader["last_login_at"] != DBNull.Value ? reader["last_login_at"].ToString() : null;
            return u;
        }
    }
}
