using System;
using System.Collections.Generic;
using System.Data.SQLite;
using RafiqPOS.Models;

namespace RafiqPOS.Repositories
{
    public class SupplierRepository
    {
        private readonly string _connectionString;
        private readonly AuditLogRepository _auditRepo;

        public SupplierRepository(string connectionString, AuditLogRepository auditRepo = null)
        {
            _connectionString = connectionString;
            _auditRepo = auditRepo ?? new AuditLogRepository(connectionString);
        }

        public List<Supplier> GetAll(bool includeInactive = false)
        {
            var list = new List<Supplier>();
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = includeInactive
                    ? "SELECT * FROM suppliers ORDER BY name ASC;"
                    : "SELECT * FROM suppliers WHERE is_active = 1 ORDER BY name ASC;";

                using (var cmd = new SQLiteCommand(sql, conn))
                using (var reader = cmd.ExecuteReader())
                {
                    while (reader.Read())
                    {
                        list.Add(MapReaderToSupplier(reader));
                    }
                }
            }
            return list;
        }

        public Supplier GetById(string id)
        {
            if (string.IsNullOrWhiteSpace(id)) return null;

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = "SELECT * FROM suppliers WHERE id = @id LIMIT 1;";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@id", id);
                    using (var reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            return MapReaderToSupplier(reader);
                        }
                    }
                }
            }
            return null;
        }

        public Supplier Save(Supplier supplier, string userId = null)
        {
            if (supplier == null) throw new ArgumentNullException("supplier");
            if (string.IsNullOrWhiteSpace(supplier.Name))
            {
                throw new ArgumentException("اسم المورد مطلوب ولا يمكن تركه فارغاً");
            }

            string now = DateTime.UtcNow.ToString("o");
            bool isNew = string.IsNullOrWhiteSpace(supplier.Id);

            if (isNew)
            {
                supplier.Id = "sup_" + Guid.NewGuid().ToString("N");
                supplier.CreatedAt = now;
                supplier.UpdatedAt = now;
                supplier.IsActive = true;
            }
            else
            {
                supplier.UpdatedAt = now;
            }

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        if (isNew)
                        {
                            string insertSql = @"
                                INSERT INTO suppliers (
                                    id, name, phone, company_name, address, balance_piasters,
                                    notes, is_active, created_at, updated_at
                                ) VALUES (
                                    @id, @name, @phone, @companyName, @address, @balancePiasters,
                                    @notes, @isActive, @createdAt, @updatedAt
                                );
                            ";
                            using (var cmd = new SQLiteCommand(insertSql, conn, trans))
                            {
                                cmd.Parameters.AddWithValue("@id", supplier.Id);
                                cmd.Parameters.AddWithValue("@name", supplier.Name.Trim());
                                cmd.Parameters.AddWithValue("@phone", (object)supplier.Phone ?? DBNull.Value);
                                cmd.Parameters.AddWithValue("@companyName", (object)supplier.CompanyName ?? DBNull.Value);
                                cmd.Parameters.AddWithValue("@address", (object)supplier.Address ?? DBNull.Value);
                                cmd.Parameters.AddWithValue("@balancePiasters", supplier.BalancePiasters);
                                cmd.Parameters.AddWithValue("@notes", (object)supplier.Notes ?? DBNull.Value);
                                cmd.Parameters.AddWithValue("@isActive", supplier.IsActive ? 1 : 0);
                                cmd.Parameters.AddWithValue("@createdAt", supplier.CreatedAt);
                                cmd.Parameters.AddWithValue("@updatedAt", supplier.UpdatedAt);
                                cmd.ExecuteNonQuery();
                            }

                            if (supplier.BalancePiasters != 0)
                            {
                                string transSql = @"
                                    INSERT INTO supplier_transactions (
                                        id, supplier_id, transaction_type, reference_id,
                                        amount_piasters, notes, created_at
                                    ) VALUES (
                                        @id, @supplierId, 'OPENING_BALANCE', NULL,
                                        @amount, 'رصيد افتتاحي للمورد', @createdAt
                                    );
                                ";
                                using (var cmd = new SQLiteCommand(transSql, conn, trans))
                                {
                                    cmd.Parameters.AddWithValue("@id", "st_" + Guid.NewGuid().ToString("N"));
                                    cmd.Parameters.AddWithValue("@supplierId", supplier.Id);
                                    cmd.Parameters.AddWithValue("@amount", supplier.BalancePiasters);
                                    cmd.Parameters.AddWithValue("@createdAt", now);
                                    cmd.ExecuteNonQuery();
                                }
                            }

                            _auditRepo.Log(conn, trans, new AuditLog
                            {
                                Id = "aud_" + Guid.NewGuid().ToString("N"),
                                UserId = string.IsNullOrWhiteSpace(userId) ? "usr_admin_default" : userId,
                                Action = "supplier_create",
                                EntityType = "suppliers",
                                EntityId = supplier.Id,
                                DetailsJson = Newtonsoft.Json.JsonConvert.SerializeObject(new { name = supplier.Name, balance = supplier.BalancePiasters }),
                                CreatedAt = now
                            });
                        }
                        else
                        {
                            string updateSql = @"
                                UPDATE suppliers
                                SET name = @name,
                                    phone = @phone,
                                    company_name = @companyName,
                                    address = @address,
                                    notes = @notes,
                                    updated_at = @updatedAt
                                WHERE id = @id;
                            ";
                            using (var cmd = new SQLiteCommand(updateSql, conn, trans))
                            {
                                cmd.Parameters.AddWithValue("@name", supplier.Name.Trim());
                                cmd.Parameters.AddWithValue("@phone", (object)supplier.Phone ?? DBNull.Value);
                                cmd.Parameters.AddWithValue("@companyName", (object)supplier.CompanyName ?? DBNull.Value);
                                cmd.Parameters.AddWithValue("@address", (object)supplier.Address ?? DBNull.Value);
                                cmd.Parameters.AddWithValue("@notes", (object)supplier.Notes ?? DBNull.Value);
                                cmd.Parameters.AddWithValue("@updatedAt", supplier.UpdatedAt);
                                cmd.Parameters.AddWithValue("@id", supplier.Id);
                                cmd.ExecuteNonQuery();
                            }

                            _auditRepo.Log(conn, trans, new AuditLog
                            {
                                Id = "aud_" + Guid.NewGuid().ToString("N"),
                                UserId = string.IsNullOrWhiteSpace(userId) ? "usr_admin_default" : userId,
                                Action = "supplier_update",
                                EntityType = "suppliers",
                                EntityId = supplier.Id,
                                DetailsJson = Newtonsoft.Json.JsonConvert.SerializeObject(new { name = supplier.Name }),
                                CreatedAt = now
                            });
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

            return GetById(supplier.Id);
        }

        public bool Archive(string id, string userId = null)
        {
            if (string.IsNullOrWhiteSpace(id)) return false;

            string now = DateTime.UtcNow.ToString("o");
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        string sql = "UPDATE suppliers SET is_active = 0, updated_at = @now WHERE id = @id;";
                        using (var cmd = new SQLiteCommand(sql, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@now", now);
                            cmd.Parameters.AddWithValue("@id", id);
                            cmd.ExecuteNonQuery();
                        }

                        _auditRepo.Log(conn, trans, new AuditLog
                        {
                            Id = "aud_" + Guid.NewGuid().ToString("N"),
                            UserId = string.IsNullOrWhiteSpace(userId) ? "usr_admin_default" : userId,
                            Action = "supplier_archive",
                            EntityType = "suppliers",
                            EntityId = id,
                            DetailsJson = "{\"archived\": true}",
                            CreatedAt = now
                        });

                        trans.Commit();
                        return true;
                    }
                    catch
                    {
                        trans.Rollback();
                        throw;
                    }
                }
            }
        }

        public bool Restore(string id, string userId = null)
        {
            if (string.IsNullOrWhiteSpace(id)) return false;

            string now = DateTime.UtcNow.ToString("o");
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        string sql = "UPDATE suppliers SET is_active = 1, updated_at = @now WHERE id = @id;";
                        using (var cmd = new SQLiteCommand(sql, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@now", now);
                            cmd.Parameters.AddWithValue("@id", id);
                            cmd.ExecuteNonQuery();
                        }

                        _auditRepo.Log(conn, trans, new AuditLog
                        {
                            Id = "aud_" + Guid.NewGuid().ToString("N"),
                            UserId = string.IsNullOrWhiteSpace(userId) ? "usr_admin_default" : userId,
                            Action = "supplier_restore",
                            EntityType = "suppliers",
                            EntityId = id,
                            DetailsJson = "{\"restored\": true}",
                            CreatedAt = now
                        });

                        trans.Commit();
                        return true;
                    }
                    catch
                    {
                        trans.Rollback();
                        throw;
                    }
                }
            }
        }

        public bool Delete(string id, string userId = null)
        {
            if (string.IsNullOrWhiteSpace(id)) return false;

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();

                // Check for linked purchases
                string checkSql = "SELECT COUNT(*) FROM purchases WHERE supplier_id = @id;";
                using (var checkCmd = new SQLiteCommand(checkSql, conn))
                {
                    checkCmd.Parameters.AddWithValue("@id", id);
                    long count = Convert.ToInt64(checkCmd.ExecuteScalar());
                    if (count > 0)
                    {
                        throw new InvalidOperationException("لا يمكن حذف المورد لوجود فواتير شراء مرتبطة به. يرجى أرشفة المورد بدلاً من ذلك لحفظ السجلات المحاسبية.");
                    }
                }

                // Check for transactions
                string checkTransSql = "SELECT COUNT(*) FROM supplier_transactions WHERE supplier_id = @id;";
                using (var checkCmd = new SQLiteCommand(checkTransSql, conn))
                {
                    checkCmd.Parameters.AddWithValue("@id", id);
                    long count = Convert.ToInt64(checkCmd.ExecuteScalar());
                    if (count > 0)
                    {
                        throw new InvalidOperationException("لا يمكن حذف المورد لوجود حركات مالية مسجلة عليه. يرجى أرشفة المورد بدلاً من ذلك.");
                    }
                }

                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        string sql = "DELETE FROM suppliers WHERE id = @id;";
                        using (var cmd = new SQLiteCommand(sql, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@id", id);
                            cmd.ExecuteNonQuery();
                        }

                        _auditRepo.Log(conn, trans, new AuditLog
                        {
                            Id = "aud_" + Guid.NewGuid().ToString("N"),
                            UserId = string.IsNullOrWhiteSpace(userId) ? "usr_admin_default" : userId,
                            Action = "supplier_hard_delete",
                            EntityType = "suppliers",
                            EntityId = id,
                            DetailsJson = "{\"deleted\": true}",
                            CreatedAt = DateTime.UtcNow.ToString("o")
                        });

                        trans.Commit();
                        return true;
                    }
                    catch
                    {
                        trans.Rollback();
                        throw;
                    }
                }
            }
        }

        public void AdjustBalance(string supplierId, long deltaPiasters, string transactionType, string referenceId, string notes, SQLiteConnection conn = null, SQLiteTransaction trans = null)
        {
            if (string.IsNullOrWhiteSpace(supplierId)) return;
            string now = DateTime.UtcNow.ToString("o");

            Action<SQLiteConnection, SQLiteTransaction> execute = (c, t) =>
            {
                string updateSql = @"
                    UPDATE suppliers
                    SET balance_piasters = balance_piasters + @delta,
                        updated_at = @now
                    WHERE id = @id;
                ";
                using (var cmd = new SQLiteCommand(updateSql, c, t))
                {
                    cmd.Parameters.AddWithValue("@delta", deltaPiasters);
                    cmd.Parameters.AddWithValue("@now", now);
                    cmd.Parameters.AddWithValue("@id", supplierId);
                    cmd.ExecuteNonQuery();
                }

                string insertSql = @"
                    INSERT INTO supplier_transactions (
                        id, supplier_id, transaction_type, reference_id,
                        amount_piasters, notes, created_at
                    ) VALUES (
                        @id, @supplierId, @transType, @refId,
                        @amount, @notes, @createdAt
                    );
                ";
                using (var cmd = new SQLiteCommand(insertSql, c, t))
                {
                    cmd.Parameters.AddWithValue("@id", "st_" + Guid.NewGuid().ToString("N"));
                    cmd.Parameters.AddWithValue("@supplierId", supplierId);
                    cmd.Parameters.AddWithValue("@transType", transactionType);
                    cmd.Parameters.AddWithValue("@refId", (object)referenceId ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@amount", deltaPiasters);
                    cmd.Parameters.AddWithValue("@notes", (object)notes ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@createdAt", now);
                    cmd.ExecuteNonQuery();
                }
            };

            if (conn != null && trans != null)
            {
                execute(conn, trans);
            }
            else
            {
                using (var localConn = new SQLiteConnection(_connectionString))
                {
                    localConn.Open();
                    using (var localTrans = localConn.BeginTransaction())
                    {
                        try
                        {
                            execute(localConn, localTrans);
                            localTrans.Commit();
                        }
                        catch
                        {
                            localTrans.Rollback();
                            throw;
                        }
                    }
                }
            }
        }

        public void RecordPayment(string supplierId, long amountPiasters, string notes, string userId = null)
        {
            if (string.IsNullOrWhiteSpace(supplierId)) throw new ArgumentException("معرف المورد مطلوب");
            if (amountPiasters <= 0) throw new ArgumentException("مبلغ السداد يجب أن يكون أكبر من الصفر");

            // Payment to supplier reduces what we owe (delta is negative balance)
            AdjustBalance(supplierId, -amountPiasters, "PAYMENT", null, notes);
        }

        public List<SupplierTransaction> GetTransactions(string supplierId, int limit = 50)
        {
            var list = new List<SupplierTransaction>();
            if (string.IsNullOrWhiteSpace(supplierId)) return list;

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = "SELECT * FROM supplier_transactions WHERE supplier_id = @supplierId ORDER BY created_at DESC LIMIT @limit;";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@supplierId", supplierId);
                    cmd.Parameters.AddWithValue("@limit", limit);
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            list.Add(new SupplierTransaction
                            {
                                Id = reader["id"].ToString(),
                                SupplierId = reader["supplier_id"].ToString(),
                                TransactionType = reader["transaction_type"].ToString(),
                                ReferenceId = reader["reference_id"] != DBNull.Value ? reader["reference_id"].ToString() : null,
                                AmountPiasters = Convert.ToInt64(reader["amount_piasters"]),
                                Notes = reader["notes"] != DBNull.Value ? reader["notes"].ToString() : null,
                                CreatedAt = reader["created_at"].ToString()
                            });
                        }
                    }
                }
            }
            return list;
        }

        private static Supplier MapReaderToSupplier(SQLiteDataReader reader)
        {
            return new Supplier
            {
                Id = reader["id"].ToString(),
                Name = reader["name"].ToString(),
                Phone = reader["phone"] != DBNull.Value ? reader["phone"].ToString() : null,
                CompanyName = reader["company_name"] != DBNull.Value ? reader["company_name"].ToString() : null,
                Address = reader["address"] != DBNull.Value ? reader["address"].ToString() : null,
                BalancePiasters = Convert.ToInt64(reader["balance_piasters"]),
                Notes = reader["notes"] != DBNull.Value ? reader["notes"].ToString() : null,
                IsActive = Convert.ToInt32(reader["is_active"]) == 1,
                CreatedAt = reader["created_at"].ToString(),
                UpdatedAt = reader["updated_at"].ToString()
            };
        }
    }
}
