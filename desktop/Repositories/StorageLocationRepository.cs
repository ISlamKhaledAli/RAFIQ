using System;
using System.Collections.Generic;
using System.Data.SQLite;
using RafiqPOS.Models;

namespace RafiqPOS.Repositories
{
    public class StorageLocationRepository
    {
        private readonly string _connectionString;

        public StorageLocationRepository(string connectionString)
        {
            _connectionString = connectionString;
        }

        public List<StorageLocation> GetAll(bool onlyActive = false)
        {
            var list = new List<StorageLocation>();
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    SELECT sl.*,
                           (SELECT COUNT(*) FROM products p WHERE p.location_id = sl.id AND p.is_active = 1) AS products_count
                    FROM storage_locations sl
                    " + (onlyActive ? "WHERE sl.is_active = 1 " : "") + @"
                    ORDER BY sl.type ASC, sl.code ASC;
                ";

                using (var cmd = new SQLiteCommand(sql, conn))
                using (var reader = cmd.ExecuteReader())
                {
                    while (reader.Read())
                    {
                        list.Add(MapReader(reader));
                    }
                }
            }
            return list;
        }

        public StorageLocation GetById(string id)
        {
            if (string.IsNullOrWhiteSpace(id)) return null;

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    SELECT sl.*,
                           (SELECT COUNT(*) FROM products p WHERE p.location_id = sl.id AND p.is_active = 1) AS products_count
                    FROM storage_locations sl
                    WHERE sl.id = @id
                    LIMIT 1;
                ";

                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@id", id);
                    using (var reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            return MapReader(reader);
                        }
                    }
                }
            }
            return null;
        }

        public StorageLocation GetByCode(string code)
        {
            if (string.IsNullOrWhiteSpace(code)) return null;

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    SELECT sl.*,
                           (SELECT COUNT(*) FROM products p WHERE p.location_id = sl.id AND p.is_active = 1) AS products_count
                    FROM storage_locations sl
                    WHERE UPPER(sl.code) = UPPER(@code)
                    LIMIT 1;
                ";

                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@code", code.Trim());
                    using (var reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            return MapReader(reader);
                        }
                    }
                }
            }
            return null;
        }

        public StorageLocation Save(StorageLocation location, string userId)
        {
            if (location == null) throw new ArgumentNullException("location");
            if (string.IsNullOrWhiteSpace(location.Code)) throw new ArgumentException("كود الموقع مطلوب.");
            if (string.IsNullOrWhiteSpace(location.Name)) throw new ArgumentException("اسم الموقع مطلوب.");

            string cleanCode = location.Code.Trim();
            string cleanName = location.Name.Trim();
            string locType = string.IsNullOrWhiteSpace(location.Type) ? "shelf" : location.Type.Trim().ToLowerInvariant();

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        bool isNew = string.IsNullOrWhiteSpace(location.Id);
                        if (isNew)
                        {
                            location.Id = "loc_" + Guid.NewGuid().ToString("N");
                            location.CreatedAt = DateTime.UtcNow.ToString("o");
                        }
                        location.UpdatedAt = DateTime.UtcNow.ToString("o");
                        location.Code = cleanCode;
                        location.Name = cleanName;
                        location.Type = locType;

                        // Check code uniqueness
                        string checkSql = "SELECT id FROM storage_locations WHERE UPPER(code) = UPPER(@code) AND id != @id LIMIT 1;";
                        using (var checkCmd = new SQLiteCommand(checkSql, conn, trans))
                        {
                            checkCmd.Parameters.AddWithValue("@code", cleanCode);
                            checkCmd.Parameters.AddWithValue("@id", location.Id);
                            var existingId = checkCmd.ExecuteScalar();
                            if (existingId != null)
                            {
                                throw new InvalidOperationException(string.Format("كود الموقع '{0}' مستخدم بالفعل لموقع آخر.", cleanCode));
                            }
                        }

                        string upsertSql = @"
                            INSERT INTO storage_locations (id, code, name, type, description, is_active, created_at, updated_at)
                            VALUES (@id, @code, @name, @type, @desc, @isActive, @createdAt, @updatedAt)
                            ON CONFLICT(id) DO UPDATE SET
                                code = excluded.code,
                                name = excluded.name,
                                type = excluded.type,
                                description = excluded.description,
                                is_active = excluded.is_active,
                                updated_at = excluded.updated_at;
                        ";

                        using (var cmd = new SQLiteCommand(upsertSql, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@id", location.Id);
                            cmd.Parameters.AddWithValue("@code", location.Code);
                            cmd.Parameters.AddWithValue("@name", location.Name);
                            cmd.Parameters.AddWithValue("@type", location.Type);
                            cmd.Parameters.AddWithValue("@desc", (object)location.Description ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@isActive", location.IsActive ? 1 : 0);
                            cmd.Parameters.AddWithValue("@createdAt", location.CreatedAt);
                            cmd.Parameters.AddWithValue("@updatedAt", location.UpdatedAt);
                            cmd.ExecuteNonQuery();
                        }

                        // Audit log
                        if (Services.DatabaseService.Audit != null)
                        {
                            try
                            {
                                string act = isNew ? "STORAGE_LOCATION_CREATED" : "STORAGE_LOCATION_UPDATED";
                                string details = string.Format("{{\"code\":\"{0}\",\"name\":\"{1}\",\"type\":\"{2}\",\"active\":{3}}}",
                                    location.Code, location.Name, location.Type, location.IsActive ? "true" : "false");
                                Services.DatabaseService.Audit.Log(userId ?? "usr_admin_default", act, "storage_location", location.Id, details);
                            }
                            catch { }
                        }

                        trans.Commit();
                        return location;
                    }
                    catch
                    {
                        trans.Rollback();
                        throw;
                    }
                }
            }
        }

        public void Delete(string id, string userId)
        {
            if (string.IsNullOrWhiteSpace(id)) return;

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        string checkSql = "SELECT COUNT(*) FROM products WHERE location_id = @id AND is_active = 1;";
                        using (var checkCmd = new SQLiteCommand(checkSql, conn, trans))
                        {
                            checkCmd.Parameters.AddWithValue("@id", id);
                            long count = Convert.ToInt64(checkCmd.ExecuteScalar());
                            if (count > 0)
                            {
                                // Soft delete by setting is_active = 0
                                using (var deactCmd = new SQLiteCommand("UPDATE storage_locations SET is_active = 0, updated_at = @now WHERE id = @id;", conn, trans))
                                {
                                    deactCmd.Parameters.AddWithValue("@now", DateTime.UtcNow.ToString("o"));
                                    deactCmd.Parameters.AddWithValue("@id", id);
                                    deactCmd.ExecuteNonQuery();
                                }
                            }
                            else
                            {
                                using (var delCmd = new SQLiteCommand("DELETE FROM storage_locations WHERE id = @id;", conn, trans))
                                {
                                    delCmd.Parameters.AddWithValue("@id", id);
                                    delCmd.ExecuteNonQuery();
                                }
                            }
                        }

                        if (Services.DatabaseService.Audit != null)
                        {
                            try
                            {
                                Services.DatabaseService.Audit.Log(userId ?? "usr_admin_default", "STORAGE_LOCATION_DELETED", "storage_location", id, "{\"deleted\":true}");
                            }
                            catch { }
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

        public void AssignProduct(string productId, string locationId, bool isColdChain, string userId)
        {
            if (string.IsNullOrWhiteSpace(productId)) throw new ArgumentException("معرف الصنف مطلوب.");

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        string sql = @"
                            UPDATE products
                            SET location_id = @locId,
                                is_cold_chain = @isColdChain,
                                updated_at = @now
                            WHERE id = @pid;
                        ";

                        using (var cmd = new SQLiteCommand(sql, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@locId", string.IsNullOrWhiteSpace(locationId) ? (object)DBNull.Value : locationId);
                            cmd.Parameters.AddWithValue("@isColdChain", isColdChain ? 1 : 0);
                            cmd.Parameters.AddWithValue("@now", DateTime.UtcNow.ToString("o"));
                            cmd.Parameters.AddWithValue("@pid", productId);
                            cmd.ExecuteNonQuery();
                        }

                        if (Services.DatabaseService.Audit != null)
                        {
                            try
                            {
                                string details = string.Format("{{\"locationId\":\"{0}\",\"isColdChain\":{1}}}",
                                    locationId ?? "", isColdChain ? "true" : "false");
                                Services.DatabaseService.Audit.Log(userId ?? "usr_admin_default", "PRODUCT_LOCATION_ASSIGNED", "product", productId, details);
                            }
                            catch { }
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

        public List<Product> GetProductsByLocation(string locationId)
        {
            var list = new List<Product>();
            if (string.IsNullOrWhiteSpace(locationId)) return list;

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    SELECT p.*,
                           COALESCE(c.name, 'عام') AS category_name,
                           sl.name AS location_name,
                           sl.code AS location_code,
                           sl.type AS location_type
                    FROM products p
                    LEFT JOIN categories c ON p.category_id = c.id
                    LEFT JOIN storage_locations sl ON p.location_id = sl.id
                    WHERE p.location_id = @locId AND p.is_active = 1
                    ORDER BY p.name ASC;
                ";

                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@locId", locationId);
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            var prod = new Product();
                            prod.Id = reader["id"].ToString();
                            prod.Barcode = reader["barcode"] != DBNull.Value ? reader["barcode"].ToString() : null;
                            prod.Name = reader["name"].ToString();
                            prod.PricePiasters = Convert.ToInt64(reader["price_piasters"]);
                            prod.CostPiasters = Convert.ToInt64(reader["cost_piasters"]);
                            prod.StockQuantityMilli = Convert.ToInt64(reader["stock_quantity_milli"]);
                            prod.MinStockQuantityMilli = Convert.ToInt64(reader["min_stock_quantity_milli"]);
                            prod.Unit = reader["unit"] != DBNull.Value ? reader["unit"].ToString() : "piece";
                            prod.IsActive = Convert.ToInt32(reader["is_active"]) == 1;
                            prod.LocationId = reader["location_id"] != DBNull.Value ? reader["location_id"].ToString() : null;
                            prod.LocationCode = reader["location_code"] != DBNull.Value ? reader["location_code"].ToString() : null;
                            prod.LocationName = reader["location_name"] != DBNull.Value ? reader["location_name"].ToString() : null;
                            prod.LocationType = reader["location_type"] != DBNull.Value ? reader["location_type"].ToString() : null;
                            prod.IsColdChain = reader["is_cold_chain"] != DBNull.Value && Convert.ToInt32(reader["is_cold_chain"]) == 1;
                            list.Add(prod);
                        }
                    }
                }
            }
            return list;
        }

        private static StorageLocation MapReader(SQLiteDataReader reader)
        {
            var loc = new StorageLocation();
            loc.Id = reader["id"].ToString();
            loc.Code = reader["code"].ToString();
            loc.Name = reader["name"].ToString();
            loc.Type = reader["type"] != DBNull.Value ? reader["type"].ToString() : "shelf";
            loc.Description = reader["description"] != DBNull.Value ? reader["description"].ToString() : "";
            loc.IsActive = reader["is_active"] != DBNull.Value && Convert.ToInt32(reader["is_active"]) == 1;
            loc.CreatedAt = reader["created_at"] != DBNull.Value ? reader["created_at"].ToString() : "";
            loc.UpdatedAt = reader["updated_at"] != DBNull.Value ? reader["updated_at"].ToString() : "";

            try
            {
                if (reader["products_count"] != DBNull.Value)
                {
                    loc.ProductsCount = Convert.ToInt32(reader["products_count"]);
                }
            }
            catch { }

            return loc;
        }
    }
}
