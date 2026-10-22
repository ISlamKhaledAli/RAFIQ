using System;
using System.Collections.Generic;
using System.Data.SQLite;
using RafiqPOS.Models;
using RafiqPOS.Services;

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

            lock (SaleService.FinancialWriteLock)
            {
                using (var conn = new SQLiteConnection(_connectionString))
                {
                    conn.Open();
                    using (var trans = conn.BeginTransaction())
                    {
                    try
                    {
                        bool exists = false;
                        if (!string.IsNullOrWhiteSpace(supplier.Id))
                        {
                            using (var checkCmd = new SQLiteCommand("SELECT COUNT(*) FROM suppliers WHERE id = @id;", conn, trans))
                            {
                                checkCmd.Parameters.AddWithValue("@id", supplier.Id);
                                exists = Convert.ToInt64(checkCmd.ExecuteScalar()) > 0;
                            }
                        }

                        bool isNew = !exists;
                        if (isNew)
                        {
                            if (string.IsNullOrWhiteSpace(supplier.Id))
                            {
                                supplier.Id = "sup_" + Guid.NewGuid().ToString("N");
                            }
                            if (string.IsNullOrWhiteSpace(supplier.CreatedAt))
                            {
                                supplier.CreatedAt = now;
                            }
                            supplier.UpdatedAt = now;
                            supplier.IsActive = true;
                        }
                        else
                        {
                            supplier.UpdatedAt = now;
                        }

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
                                        amount_piasters, balance_after_piasters, notes, created_at
                                    ) VALUES (
                                        @id, @supplierId, 'OPENING_BALANCE', NULL,
                                        @amount, @amount, 'رصيد افتتاحي للمورد', @createdAt
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

                // 1. Fetch current supplier
                string supplierName = null;
                long balancePiasters = 0;
                bool exists = false;
                using (var checkCmd = new SQLiteCommand("SELECT name, balance_piasters FROM suppliers WHERE id = @id LIMIT 1;", conn))
                {
                    checkCmd.Parameters.AddWithValue("@id", id);
                    using (var reader = checkCmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            exists = true;
                            supplierName = reader.IsDBNull(0) ? "" : reader.GetString(0);
                            balancePiasters = reader.IsDBNull(1) ? 0L : Convert.ToInt64(reader.GetValue(1));
                        }
                    }
                }

                if (!exists)
                {
                    throw new InvalidOperationException("المورد غير موجود في قاعدة البيانات");
                }

                // 2. Block archive if supplier has active balance (debt owed or advance credit)
                if (balancePiasters > 0)
                {
                    throw new InvalidOperationException(
                        string.Format("لا يمكن أرشفة المورد \"{0}\" لأن له رصيد مستحق بذمة المحل ({1}). يجب تسوية حسابه أولاً.",
                            supplierName, Common.Money.FormatPiasters(balancePiasters)));
                }
                if (balancePiasters < 0)
                {
                    throw new InvalidOperationException(
                        string.Format("لا يمكن أرشفة المورد \"{0}\" لأن بذمته رصيد مدين / دفعات مقدمة ({1}). يجب تسوية حسابه أولاً.",
                            supplierName, Common.Money.FormatPiasters(Math.Abs(balancePiasters))));
                }

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

                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        // Linked-record checks run inside the same transaction as the delete (Audit F-28)
                        string checkSql = "SELECT COUNT(*) FROM purchases WHERE supplier_id = @id;";
                        using (var checkCmd = new SQLiteCommand(checkSql, conn, trans))
                        {
                            checkCmd.Parameters.AddWithValue("@id", id);
                            if (Convert.ToInt64(checkCmd.ExecuteScalar()) > 0)
                            {
                                throw new InvalidOperationException("لا يمكن حذف المورد لوجود فواتير شراء مرتبطة به. يرجى أرشفة المورد بدلاً من ذلك لحفظ السجلات المحاسبية.");
                            }
                        }

                        string checkTransSql = "SELECT COUNT(*) FROM supplier_transactions WHERE supplier_id = @id;";
                        using (var checkCmd = new SQLiteCommand(checkTransSql, conn, trans))
                        {
                            checkCmd.Parameters.AddWithValue("@id", id);
                            if (Convert.ToInt64(checkCmd.ExecuteScalar()) > 0)
                            {
                                throw new InvalidOperationException("لا يمكن حذف المورد لوجود حركات مالية مسجلة عليه. يرجى أرشفة المورد بدلاً من ذلك.");
                            }
                        }

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

        public void AdjustBalance(string supplierId, long deltaPiasters, string transactionType, string referenceId, string notes, SQLiteConnection conn = null, SQLiteTransaction trans = null, string paymentSource = "cash_drawer")
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

                long balanceAfter = 0;
                using (var balCmd = new SQLiteCommand("SELECT balance_piasters FROM suppliers WHERE id = @id LIMIT 1;", c, t))
                {
                    balCmd.Parameters.AddWithValue("@id", supplierId);
                    object bRes = balCmd.ExecuteScalar();
                    if (bRes != null && bRes != DBNull.Value) balanceAfter = Convert.ToInt64(bRes);
                }

                string insertSql = @"
                    INSERT INTO supplier_transactions (
                        id, supplier_id, transaction_type, reference_id,
                        amount_piasters, payment_source, balance_after_piasters, notes, created_at
                    ) VALUES (
                        @id, @supplierId, @transType, @refId,
                        @amount, @paymentSource, @balanceAfter, @notes, @createdAt
                    );
                ";
                using (var cmd = new SQLiteCommand(insertSql, c, t))
                {
                    cmd.Parameters.AddWithValue("@id", "st_" + Guid.NewGuid().ToString("N"));
                    cmd.Parameters.AddWithValue("@supplierId", supplierId);
                    cmd.Parameters.AddWithValue("@transType", transactionType);
                    cmd.Parameters.AddWithValue("@refId", (object)referenceId ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@amount", deltaPiasters);
                    cmd.Parameters.AddWithValue("@paymentSource", !string.IsNullOrWhiteSpace(paymentSource) ? paymentSource : "cash_drawer");
                    cmd.Parameters.AddWithValue("@balanceAfter", balanceAfter);
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
                lock (SaleService.FinancialWriteLock)
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
        }

        public void RecordPayment(string supplierId, long amountPiasters, string notes, string userId = null, string paymentSource = "cash_drawer")
        {
            if (string.IsNullOrWhiteSpace(supplierId)) throw new ArgumentException("معرف المورد مطلوب");
            if (amountPiasters <= 0) throw new ArgumentException("مبلغ السداد يجب أن يكون أكبر من الصفر");

            lock (SaleService.FinancialWriteLock)
            {
                using (var conn = new SQLiteConnection(_connectionString))
                {
                    conn.Open();
                    using (var trans = conn.BeginTransaction())
                    {
                    try
                    {
                        using (var sCmd = new SQLiteCommand("SELECT is_active FROM suppliers WHERE id = @id LIMIT 1;", conn, trans))
                        {
                            sCmd.Parameters.AddWithValue("@id", supplierId);
                            object res = sCmd.ExecuteScalar();
                            if (res == null || res == DBNull.Value)
                            {
                                throw new InvalidOperationException("المورد غير موجود أو تم حذفه");
                            }
                            if (Convert.ToInt32(res) == 0)
                            {
                                throw new InvalidOperationException("لا يمكن تسجيل دفعة لمورد مؤرشف");
                            }
                        }

                        if (string.Equals(paymentSource, "cash_drawer", StringComparison.OrdinalIgnoreCase))
                        {
                            var currentBDate = Services.BusinessDayHelper.GetCurrentBusinessDate(conn, trans);
                            if (Services.BusinessDayHelper.IsBusinessDayClosed(conn, trans, currentBDate))
                            {
                                throw new InvalidOperationException("لا يمكن صرف دفعة للمورد من درج الكاشير لتاريخ عمل تم إقفاله وتشميعه مسبقاً.");
                            }

                            if (DatabaseService.DailyClosing != null)
                            {
                                var liveBal = DatabaseService.DailyClosing.GetLiveDrawerBalance(currentBDate.ToString("yyyy-MM-dd"));
                                if (liveBal != null && liveBal.AvailableCashPiasters < amountPiasters)
                                {
                                    throw new InvalidOperationException(string.Format("رصيد نقدية الدرج المتاح حالياً ({0:N2} ج.م) غير كافٍ لسداد دفعة المورد ({1:N2} ج.م). يرجى السداد بنقدية خارجية أو توريد عهدة للدرج أولاً.", liveBal.AvailableCashPiasters / 100.0, amountPiasters / 100.0));
                                }
                            }
                        }

                        // Payment to supplier reduces what we owe (delta is negative balance)
                        AdjustBalance(supplierId, -amountPiasters, "PAYMENT", null, notes, conn, trans, paymentSource);

                        _auditRepo.Log(conn, trans, new AuditLog
                        {
                            Id = "aud_" + Guid.NewGuid().ToString("N"),
                            UserId = string.IsNullOrWhiteSpace(userId) ? "usr_admin_default" : userId,
                            Action = "supplier_payment",
                            EntityType = "suppliers",
                            EntityId = supplierId,
                            DetailsJson = string.Format("{{\"amountPiasters\":{0},\"notes\":\"{1}\"}}", amountPiasters, (notes ?? "").Replace("\"", "\\\"")),
                            CreatedAt = DateTime.UtcNow.ToString("o")
                        });

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

        public void CancelPayment(string supplierId, string transactionId, string reason, string userId = null)
        {
            if (string.IsNullOrWhiteSpace(supplierId)) throw new ArgumentException("معرف المورد مطلوب");
            if (string.IsNullOrWhiteSpace(transactionId)) throw new ArgumentException("معرف سند الصرف مطلوب");
            if (string.IsNullOrWhiteSpace(reason)) throw new ArgumentException("سبب إلغاء سند الصرف مطلوب");

            lock (SaleService.FinancialWriteLock)
            {
                using (var conn = new SQLiteConnection(_connectionString))
                {
                    conn.Open();
                    using (var trans = conn.BeginTransaction())
                    {
                        try
                        {
                            long origAmount = 0;
                            string origPaymentSource = "cash_drawer";
                            string origType = null;

                            using (var cmd = new SQLiteCommand("SELECT transaction_type, amount_piasters, payment_source FROM supplier_transactions WHERE id = @id AND supplier_id = @supId LIMIT 1;", conn, trans))
                            {
                                cmd.Parameters.AddWithValue("@id", transactionId);
                                cmd.Parameters.AddWithValue("@supId", supplierId);
                                using (var reader = cmd.ExecuteReader())
                                {
                                    if (reader.Read())
                                    {
                                        origType = reader["transaction_type"].ToString();
                                        origAmount = Convert.ToInt64(reader["amount_piasters"]);
                                        origPaymentSource = reader["payment_source"] != DBNull.Value ? reader["payment_source"].ToString() : "cash_drawer";
                                    }
                                    else
                                    {
                                        throw new InvalidOperationException("سند الصرف غير موجود في كشف حساب المورد");
                                    }
                                }
                            }

                            if (origType != "PAYMENT")
                            {
                                throw new InvalidOperationException("لا يمكن إلغاء هذه الحركة المحاسبية، الحركة ليست سند صرف سداد");
                            }

                            // Check if already cancelled
                            using (var checkCmd = new SQLiteCommand("SELECT 1 FROM supplier_transactions WHERE reference_id = @refId AND transaction_type = 'PAYMENT_CANCEL' LIMIT 1;", conn, trans))
                            {
                                checkCmd.Parameters.AddWithValue("@refId", transactionId);
                                if (checkCmd.ExecuteScalar() != null)
                                {
                                    throw new InvalidOperationException("تم إلغاء سند الصرف مسبقاً بقيد عكسي.");
                                }
                            }

                            // Payment was negative delta (-paid). Reversal adds back positive delta (+paid).
                            long reversalAmount = Math.Abs(origAmount);
                            string contraNotes = string.Format("قيد عكسي لإلغاء سند الصرف: {0}", reason);

                            AdjustBalance(supplierId, reversalAmount, "PAYMENT_CANCEL", transactionId, contraNotes, conn, trans, origPaymentSource);

                            _auditRepo.Log(conn, trans, new AuditLog
                            {
                                Id = "aud_" + Guid.NewGuid().ToString("N"),
                                UserId = string.IsNullOrWhiteSpace(userId) ? "usr_admin_default" : userId,
                                Action = "supplier_payment_cancel",
                                EntityType = "suppliers",
                                EntityId = supplierId,
                                DetailsJson = string.Format("{{\"transactionId\":\"{0}\",\"amountPiasters\":{1},\"reason\":\"{2}\"}}", transactionId, reversalAmount, reason.Replace("\"", "\\\"")),
                                CreatedAt = DateTime.UtcNow.ToString("o")
                            });

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
                                PaymentSource = HasColumn(reader, "payment_source") && reader["payment_source"] != DBNull.Value ? reader["payment_source"].ToString() : "cash_drawer",
                                BalanceAfterPiasters = HasColumn(reader, "balance_after_piasters") && reader["balance_after_piasters"] != DBNull.Value ? Convert.ToInt64(reader["balance_after_piasters"]) : 0L,
                                Notes = reader["notes"] != DBNull.Value ? reader["notes"].ToString() : null,
                                CreatedAt = reader["created_at"].ToString()
                            });
                        }
                    }
                }
            }
            return list;
        }

        public SupplierBalanceVerification VerifyBalance(string supplierId)
        {
            if (string.IsNullOrWhiteSpace(supplierId)) return null;

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();

                long storedBalance = 0;
                string getBalSql = "SELECT balance_piasters FROM suppliers WHERE id = @id LIMIT 1;";
                using (var cmd = new SQLiteCommand(getBalSql, conn))
                {
                    cmd.Parameters.AddWithValue("@id", supplierId);
                    object res = cmd.ExecuteScalar();
                    if (res == null || res == DBNull.Value) return null;
                    storedBalance = Convert.ToInt64(res);
                }

                long calculatedBalance = 0;
                int entriesCount = 0;
                string ledgerSql = "SELECT COALESCE(SUM(amount_piasters), 0) AS total_calc, COUNT(*) AS cnt FROM supplier_transactions WHERE supplier_id = @id;";
                using (var cmd = new SQLiteCommand(ledgerSql, conn))
                {
                    cmd.Parameters.AddWithValue("@id", supplierId);
                    using (var reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            calculatedBalance = Convert.ToInt64(reader["total_calc"]);
                            entriesCount = Convert.ToInt32(reader["cnt"]);
                        }
                    }
                }

                var verification = new SupplierBalanceVerification();
                verification.SupplierId = supplierId;
                verification.StoredBalancePiasters = storedBalance;
                verification.CalculatedBalancePiasters = calculatedBalance;
                verification.IsBalanced = (storedBalance == calculatedBalance);
                verification.DiscrepancyPiasters = storedBalance - calculatedBalance;
                verification.TotalEntriesCount = entriesCount;
                return verification;
            }
        }

        public Supplier RecalculateAndFixBalance(string supplierId, string userId = null)
        {
            var verify = VerifyBalance(supplierId);
            if (verify == null) return null;

            if (!verify.IsBalanced)
            {
                lock (SaleService.FinancialWriteLock)
                {
                    using (var conn = new SQLiteConnection(_connectionString))
                    {
                        conn.Open();
                        using (var trans = conn.BeginTransaction())
                        {
                        try
                        {
                            string now = DateTime.UtcNow.ToString("o");
                            using (var cmd = new SQLiteCommand("UPDATE suppliers SET balance_piasters = @bal, updated_at = @now WHERE id = @id;", conn, trans))
                            {
                                cmd.Parameters.AddWithValue("@bal", verify.CalculatedBalancePiasters);
                                cmd.Parameters.AddWithValue("@now", now);
                                cmd.Parameters.AddWithValue("@id", supplierId);
                                cmd.ExecuteNonQuery();
                            }

                            if (_auditRepo != null)
                            {
                                string uid = string.IsNullOrWhiteSpace(userId) ? "usr_admin_default" : userId;
                                _auditRepo.Log(conn, trans, new AuditLog
                                {
                                    Id = "aud_" + Guid.NewGuid().ToString("N"),
                                    UserId = uid,
                                    Action = "supplier_balance_realign",
                                    EntityType = "supplier",
                                    EntityId = supplierId,
                                    DetailsJson = string.Format("{{\"storedBalance\":{0},\"ledgerBalance\":{1},\"discrepancy\":{2}}}",
                                        verify.StoredBalancePiasters, verify.CalculatedBalancePiasters, verify.DiscrepancyPiasters),
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
                }
            }

            return GetById(supplierId);
        }

        public List<SupplierBalanceVerification> CheckDiscrepancies()
        {
            var results = new List<SupplierBalanceVerification>();
            var allSuppliers = GetAll(true);
            for (int i = 0; i < allSuppliers.Count; i++)
            {
                var v = VerifyBalance(allSuppliers[i].Id);
                if (v != null && !v.IsBalanced)
                {
                    results.Add(v);
                }
            }
            return results;
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

        private static bool HasColumn(SQLiteDataReader reader, string columnName)
        {
            for (int i = 0; i < reader.FieldCount; i++)
            {
                if (string.Equals(reader.GetName(i), columnName, StringComparison.OrdinalIgnoreCase))
                {
                    return true;
                }
            }
            return false;
        }
    }
}
