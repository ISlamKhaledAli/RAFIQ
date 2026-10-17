using System;
using System.Collections.Generic;
using System.Data.SQLite;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Repositories
{
    public class DigitalAccountRepository
    {
        private readonly string _connectionString;
        private readonly AuditLogRepository _auditRepo;

        public DigitalAccountRepository(string connectionString, AuditLogRepository auditRepo = null)
        {
            this._connectionString = connectionString;
            this._auditRepo = auditRepo;
        }

        public List<DigitalAccount> GetAllAccounts(bool includeInactive = false)
        {
            var list = new List<DigitalAccount>();
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = includeInactive
                    ? "SELECT * FROM digital_accounts ORDER BY is_active DESC, type ASC, is_default DESC, name ASC;"
                    : "SELECT * FROM digital_accounts WHERE is_active = 1 ORDER BY type ASC, is_default DESC, name ASC;";
                using (var cmd = new SQLiteCommand(sql, conn))
                using (var reader = cmd.ExecuteReader())
                {
                    while (reader.Read())
                    {
                        list.Add(MapAccount(reader));
                    }
                }
            }
            return list;
        }

        public DigitalAccount GetAccountById(string id)
        {
            if (string.IsNullOrEmpty(id)) return null;
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = "SELECT * FROM digital_accounts WHERE id = @id LIMIT 1;";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@id", id);
                    using (var reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            return MapAccount(reader);
                        }
                    }
                }
            }
            return null;
        }

        public DigitalAccount GetDefaultAccountForType(string type)
        {
            if (string.IsNullOrEmpty(type)) return null;
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = "SELECT * FROM digital_accounts WHERE type = @type AND is_active = 1 ORDER BY is_default DESC, created_at ASC LIMIT 1;";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@type", type);
                    using (var reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            return MapAccount(reader);
                        }
                    }
                }
            }
            return null;
        }

        private static bool _schemaEnsured = false;
        private static readonly object _schemaLock = new object();

        private void EnsureSchema(SQLiteConnection conn, SQLiteTransaction trans)
        {
            if (_schemaEnsured) return;
            lock (_schemaLock)
            {
                if (_schemaEnsured) return;
                try
                {
                    var cols = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                    using (var pragmaCmd = new SQLiteCommand("PRAGMA table_info(digital_accounts);", conn, trans))
                    using (var reader = pragmaCmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            cols.Add(reader["name"].ToString());
                        }
                    }
                    if (cols.Count > 0)
                    {
                        if (!cols.Contains("daily_limit_piasters"))
                        {
                            using (var cmd = new SQLiteCommand("ALTER TABLE digital_accounts ADD COLUMN daily_limit_piasters INTEGER NOT NULL DEFAULT 6000000;", conn, trans))
                            {
                                cmd.ExecuteNonQuery();
                            }
                        }
                        if (!cols.Contains("monthly_limit_piasters"))
                        {
                            using (var cmd = new SQLiteCommand("ALTER TABLE digital_accounts ADD COLUMN monthly_limit_piasters INTEGER NOT NULL DEFAULT 20000000;", conn, trans))
                            {
                                cmd.ExecuteNonQuery();
                            }
                        }
                    }
                    _schemaEnsured = true;
                }
                catch
                {
                    // Non-fatal fallback
                }
            }
        }

        public DigitalAccount SaveAccount(DigitalAccount account)
        {
            if (account == null) throw new ArgumentNullException("account");
            if (string.IsNullOrWhiteSpace(account.Name)) throw new ArgumentException("اسم الحساب أو المحفظة مطلوب");

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        EnsureSchema(conn, trans);
                        string now = DateTime.UtcNow.ToString("o");
                        if (string.IsNullOrEmpty(account.Id))
                        {
                            account.Id = Guid.NewGuid().ToString();
                        }

                        // If setting as default, unset other defaults for the same type
                        if (account.IsDefault)
                        {
                            string unsetSql = "UPDATE digital_accounts SET is_default = 0 WHERE type = @type AND id != @id;";
                            using (var uCmd = new SQLiteCommand(unsetSql, conn, trans))
                            {
                                uCmd.Parameters.AddWithValue("@type", account.Type ?? "wallet");
                                uCmd.Parameters.AddWithValue("@id", account.Id);
                                uCmd.ExecuteNonQuery();
                            }
                        }

                        bool exists = false;
                        string checkSql = "SELECT balance_piasters FROM digital_accounts WHERE id = @id LIMIT 1;";
                        using (var checkCmd = new SQLiteCommand(checkSql, conn, trans))
                        {
                            checkCmd.Parameters.AddWithValue("@id", account.Id);
                            using (var reader = checkCmd.ExecuteReader())
                            {
                                if (reader.Read())
                                {
                                    exists = true;
                                }
                            }
                        }

                        if (!exists)
                        {
                            long defaultDaily = string.Equals(account.Type, "instapay", StringComparison.OrdinalIgnoreCase) ? 7000000 : 6000000;
                            long defaultMonthly = string.Equals(account.Type, "instapay", StringComparison.OrdinalIgnoreCase) ? 40000000 : 20000000;
                            long dailyLimit = account.DailyLimitPiasters > 0 ? account.DailyLimitPiasters : defaultDaily;
                            long monthlyLimit = account.MonthlyLimitPiasters > 0 ? account.MonthlyLimitPiasters : defaultMonthly;

                            string insertSql = @"
                                INSERT INTO digital_accounts (
                                    id, name, type, provider, account_number, balance_piasters, low_balance_alert_piasters,
                                    daily_limit_piasters, monthly_limit_piasters,
                                    is_default, is_active, notes, created_at, updated_at
                                ) VALUES (
                                    @id, @name, @type, @provider, @accountNumber, @balance, @lowAlert,
                                    @dailyLimit, @monthlyLimit,
                                    @isDefault, @isActive, @notes, @now, @now
                                );";
                            using (var cmd = new SQLiteCommand(insertSql, conn, trans))
                            {
                                cmd.Parameters.AddWithValue("@id", account.Id);
                                cmd.Parameters.AddWithValue("@name", account.Name.Trim());
                                cmd.Parameters.AddWithValue("@type", account.Type ?? "wallet");
                                cmd.Parameters.AddWithValue("@provider", account.Provider ?? "vodafone_cash");
                                cmd.Parameters.AddWithValue("@accountNumber", (object)account.AccountNumber ?? DBNull.Value);
                                cmd.Parameters.AddWithValue("@balance", account.BalancePiasters);
                                cmd.Parameters.AddWithValue("@lowAlert", account.LowBalanceAlertPiasters > 0 ? account.LowBalanceAlertPiasters : 50000);
                                cmd.Parameters.AddWithValue("@dailyLimit", dailyLimit);
                                cmd.Parameters.AddWithValue("@monthlyLimit", monthlyLimit);
                                cmd.Parameters.AddWithValue("@isDefault", account.IsDefault ? 1 : 0);
                                cmd.Parameters.AddWithValue("@isActive", account.IsActive ? 1 : 0);
                                cmd.Parameters.AddWithValue("@notes", (object)account.Notes ?? DBNull.Value);
                                cmd.Parameters.AddWithValue("@now", now);
                                cmd.ExecuteNonQuery();
                            }

                            if (_auditRepo != null)
                            {
                                _auditRepo.Log(conn, trans, new AuditLog
                                {
                                    UserId = SecurityService.CurrentUser != null ? SecurityService.CurrentUser.Id : "system",
                                    Action = "create",
                                    EntityType = "digital_account",
                                    EntityId = account.Id,
                                    DetailsJson = string.Format("إضافة حساب محفظة / إنستاباي جديد: {0} برصيد ابتدائي {1:N2} ج.م", account.Name, account.BalancePiasters / 100.0),
                                    CreatedAt = now
                                });
                            }
                        }
                        else
                        {
                            long defaultDaily = string.Equals(account.Type, "instapay", StringComparison.OrdinalIgnoreCase) ? 7000000 : 6000000;
                            long defaultMonthly = string.Equals(account.Type, "instapay", StringComparison.OrdinalIgnoreCase) ? 40000000 : 20000000;
                            long dailyLimit = account.DailyLimitPiasters > 0 ? account.DailyLimitPiasters : defaultDaily;
                            long monthlyLimit = account.MonthlyLimitPiasters > 0 ? account.MonthlyLimitPiasters : defaultMonthly;

                            string updateSql = @"
                                UPDATE digital_accounts SET
                                    name = @name,
                                    type = @type,
                                    provider = @provider,
                                    account_number = @accountNumber,
                                    balance_piasters = @balance,
                                    low_balance_alert_piasters = @lowAlert,
                                    daily_limit_piasters = @dailyLimit,
                                    monthly_limit_piasters = @monthlyLimit,
                                    is_default = @isDefault,
                                    is_active = @isActive,
                                    notes = @notes,
                                    updated_at = @now
                                WHERE id = @id;";
                            using (var cmd = new SQLiteCommand(updateSql, conn, trans))
                            {
                                cmd.Parameters.AddWithValue("@name", account.Name.Trim());
                                cmd.Parameters.AddWithValue("@type", account.Type ?? "wallet");
                                cmd.Parameters.AddWithValue("@provider", account.Provider ?? "vodafone_cash");
                                cmd.Parameters.AddWithValue("@accountNumber", (object)account.AccountNumber ?? DBNull.Value);
                                cmd.Parameters.AddWithValue("@balance", account.BalancePiasters);
                                cmd.Parameters.AddWithValue("@lowAlert", account.LowBalanceAlertPiasters > 0 ? account.LowBalanceAlertPiasters : 50000);
                                cmd.Parameters.AddWithValue("@dailyLimit", dailyLimit);
                                cmd.Parameters.AddWithValue("@monthlyLimit", monthlyLimit);
                                cmd.Parameters.AddWithValue("@isDefault", account.IsDefault ? 1 : 0);
                                cmd.Parameters.AddWithValue("@isActive", account.IsActive ? 1 : 0);
                                cmd.Parameters.AddWithValue("@notes", (object)account.Notes ?? DBNull.Value);
                                cmd.Parameters.AddWithValue("@now", now);
                                cmd.Parameters.AddWithValue("@id", account.Id);
                                cmd.ExecuteNonQuery();
                            }

                            if (_auditRepo != null)
                            {
                                _auditRepo.Log(conn, trans, new AuditLog
                                {
                                    UserId = SecurityService.CurrentUser != null ? SecurityService.CurrentUser.Id : "system",
                                    Action = "edit",
                                    EntityType = "digital_account",
                                    EntityId = account.Id,
                                    DetailsJson = string.Format("تعديل بيانات حساب محفظة / إنستاباي: {0}", account.Name),
                                    CreatedAt = now
                                });
                            }
                        }

                        trans.Commit();
                        account.UpdatedAt = now;
                        return account;
                    }
                    catch
                    {
                        trans.Rollback();
                        throw;
                    }
                }
            }
        }

        public void DeleteAccount(string id)
        {
            if (string.IsNullOrEmpty(id)) return;
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        string checkUsageSql = "SELECT COUNT(*) FROM digital_transactions WHERE account_id = @id;";
                        using (var cmd = new SQLiteCommand(checkUsageSql, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@id", id);
                            long count = Convert.ToInt64(cmd.ExecuteScalar());
                            if (count > 0)
                            {
                                // Archive instead of delete to preserve historical integrity (Rule 2)
                                string archiveSql = "UPDATE digital_accounts SET is_active = 0, updated_at = @now WHERE id = @id;";
                                using (var aCmd = new SQLiteCommand(archiveSql, conn, trans))
                                {
                                    aCmd.Parameters.AddWithValue("@now", DateTime.UtcNow.ToString("o"));
                                    aCmd.Parameters.AddWithValue("@id", id);
                                    aCmd.ExecuteNonQuery();
                                }
                            }
                            else
                            {
                                string delSql = "DELETE FROM digital_accounts WHERE id = @id;";
                                using (var dCmd = new SQLiteCommand(delSql, conn, trans))
                                {
                                    dCmd.Parameters.AddWithValue("@id", id);
                                    dCmd.ExecuteNonQuery();
                                }
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

        public DigitalAccountFunding FundAccount(string accountId, long amountPiasters, string fundingSource, string notes, string createdBy)
        {
            if (string.IsNullOrEmpty(accountId)) throw new ArgumentException("معرف الحساب مطلوب");
            if (amountPiasters <= 0) throw new ArgumentException("مبلغ التغذية يجب أن يكون أكبر من الصفر");

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        long prevBal = 0;
                        string accName = null;
                        string getSql = "SELECT name, balance_piasters FROM digital_accounts WHERE id = @id LIMIT 1;";
                        using (var cmd = new SQLiteCommand(getSql, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@id", accountId);
                            using (var reader = cmd.ExecuteReader())
                            {
                                if (!reader.Read())
                                {
                                    throw new InvalidOperationException("حساب المحفظة / إنستاباي غير موجود");
                                }
                                accName = reader["name"].ToString();
                                prevBal = Convert.ToInt64(reader["balance_piasters"]);
                            }
                        }

                        long newBal = prevBal + amountPiasters;
                        string now = DateTime.UtcNow.ToString("o");

                        string updateBalSql = "UPDATE digital_accounts SET balance_piasters = @newBal, updated_at = @now WHERE id = @id;";
                        using (var cmd = new SQLiteCommand(updateBalSql, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@newBal", newBal);
                            cmd.Parameters.AddWithValue("@now", now);
                            cmd.Parameters.AddWithValue("@id", accountId);
                            cmd.ExecuteNonQuery();
                        }

                        var funding = new DigitalAccountFunding
                        {
                            Id = Guid.NewGuid().ToString(),
                            AccountId = accountId,
                            AccountName = accName,
                            AmountPiasters = amountPiasters,
                            FundingSource = !string.IsNullOrWhiteSpace(fundingSource) ? fundingSource : "cash_drawer",
                            PreviousBalancePiasters = prevBal,
                            NewBalancePiasters = newBal,
                            Notes = notes,
                            CreatedBy = createdBy,
                            CreatedAt = now
                        };

                        string insertFundingSql = @"
                            INSERT INTO digital_account_fundings (
                                id, account_id, amount_piasters, funding_source, previous_balance_piasters,
                                new_balance_piasters, notes, created_by, created_at
                            ) VALUES (
                                @id, @accId, @amount, @source, @prevBal, @newBal, @notes, @createdBy, @now
                            );";
                        using (var cmd = new SQLiteCommand(insertFundingSql, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@id", funding.Id);
                            cmd.Parameters.AddWithValue("@accId", funding.AccountId);
                            cmd.Parameters.AddWithValue("@amount", funding.AmountPiasters);
                            cmd.Parameters.AddWithValue("@source", funding.FundingSource);
                            cmd.Parameters.AddWithValue("@prevBal", funding.PreviousBalancePiasters);
                            cmd.Parameters.AddWithValue("@newBal", funding.NewBalancePiasters);
                            cmd.Parameters.AddWithValue("@notes", (object)funding.Notes ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@createdBy", (object)funding.CreatedBy ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@now", now);
                            cmd.ExecuteNonQuery();
                        }

                        // Also record in digital_transactions as funding
                        string insertTxSql = @"
                            INSERT INTO digital_transactions (
                                id, account_id, tx_type, amount_piasters, profit_piasters, total_collected_piasters,
                                cashier_name, payment_destination, status, notes, created_at
                            ) VALUES (
                                @id, @accId, 'funding', @amount, 0, @amount, @cashier, @source, 'completed', @notes, @now
                            );";
                        using (var cmd = new SQLiteCommand(insertTxSql, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@id", Guid.NewGuid().ToString());
                            cmd.Parameters.AddWithValue("@accId", accountId);
                            cmd.Parameters.AddWithValue("@amount", amountPiasters);
                            cmd.Parameters.AddWithValue("@cashier", (object)createdBy ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@source", funding.FundingSource);
                            cmd.Parameters.AddWithValue("@notes", string.Format("تغذية رصيد: {0}", notes ?? ""));
                            cmd.Parameters.AddWithValue("@now", now);
                            cmd.ExecuteNonQuery();
                        }

                        trans.Commit();
                        return funding;
                    }
                    catch
                    {
                        trans.Rollback();
                        throw;
                    }
                }
            }
        }

        /// <summary>
        /// Executes a direct cash-out or cash-in operation:
        /// - Cash Out: deducts ONLY AmountPiasters from wallet balance.
        /// - Cash In: adds AmountPiasters to wallet balance.
        /// - ProfitPiasters is variable as entered by cashier and stored as net shop profit.
        /// </summary>
        public DigitalTransaction ProcessTransaction(DigitalTransaction tx)
        {
            if (tx == null) throw new ArgumentNullException("tx");
            if (string.IsNullOrEmpty(tx.AccountId)) throw new ArgumentException("يرجى اختيار حساب المحفظة أو إنستاباي");
            if (tx.AmountPiasters <= 0) throw new ArgumentException("يرجى إدخال مبلغ العملية");
            if (tx.ProfitPiasters < 0) tx.ProfitPiasters = 0;

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        long currentBal = 0;
                        string accName = null;
                        string accType = null;
                        bool isActive = true;

                        string getAccSql = "SELECT name, type, balance_piasters, is_active FROM digital_accounts WHERE id = @id LIMIT 1;";
                        using (var cmd = new SQLiteCommand(getAccSql, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@id", tx.AccountId);
                            using (var reader = cmd.ExecuteReader())
                            {
                                if (!reader.Read())
                                {
                                    throw new InvalidOperationException("الحساب المحدد غير موجود");
                                }
                                accName = reader["name"].ToString();
                                accType = reader["type"].ToString();
                                currentBal = Convert.ToInt64(reader["balance_piasters"]);
                                isActive = Convert.ToInt32(reader["is_active"]) == 1;
                            }
                        }

                        if (!isActive)
                        {
                            throw new InvalidOperationException("هذا الحساب موقوف حالياً ولا يمكن إجراء معاملات عليه");
                        }

                        long balanceDelta = 0;
                        if (tx.TxType == "cash_out")
                        {
                            // Senders/Customer withdraws or store transfers from wallet:
                            // Wallet balance DECREASES by AmountPiasters ONLY (User rule: وتخصم المبلغ بس منه)
                            balanceDelta = -tx.AmountPiasters;
                            if (currentBal < tx.AmountPiasters)
                            {
                                throw new InvalidOperationException(string.Format("رصيد الحساب غير كافٍ لتنفيذ هذه العملية. الرصيد المتاح: {0:N2} ج.م والمطلوب: {1:N2} ج.م",
                                    currentBal / 100.0, tx.AmountPiasters / 100.0));
                            }
                            if (tx.TotalCollectedPiasters <= 0)
                            {
                                tx.TotalCollectedPiasters = tx.AmountPiasters + tx.ProfitPiasters;
                            }
                        }
                        else if (tx.TxType == "cash_in")
                        {
                            // Customer transfers to store wallet / deposit:
                            // Wallet balance INCREASES by AmountPiasters
                            balanceDelta = tx.AmountPiasters;
                            if (tx.TotalCollectedPiasters <= 0)
                            {
                                tx.TotalCollectedPiasters = tx.ProfitPiasters;
                            }
                        }
                        else
                        {
                            throw new InvalidOperationException("نوع العملية غير صالح");
                        }

                        string now = DateTime.UtcNow.ToString("o");
                        string updateBalSql = "UPDATE digital_accounts SET balance_piasters = balance_piasters + @delta, updated_at = @now WHERE id = @id;";
                        using (var cmd = new SQLiteCommand(updateBalSql, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@delta", balanceDelta);
                            cmd.Parameters.AddWithValue("@now", now);
                            cmd.Parameters.AddWithValue("@id", tx.AccountId);
                            cmd.ExecuteNonQuery();
                        }

                        if (string.IsNullOrEmpty(tx.Id))
                        {
                            tx.Id = Guid.NewGuid().ToString();
                        }
                        tx.AccountName = accName;
                        tx.AccountType = accType;
                        tx.Status = "completed";
                        tx.CreatedAt = now;

                        string insertTxSql = @"
                            INSERT INTO digital_transactions (
                                id, account_id, tx_type, amount_piasters, profit_piasters, total_collected_piasters,
                                customer_phone, customer_name, reference_number, sale_id, cashier_name,
                                payment_destination, status, notes, created_at
                            ) VALUES (
                                @id, @accId, @txType, @amount, @profit, @totalCollected,
                                @phone, @custName, @refNum, @saleId, @cashier,
                                @dest, @status, @notes, @now
                            );";
                        using (var cmd = new SQLiteCommand(insertTxSql, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@id", tx.Id);
                            cmd.Parameters.AddWithValue("@accId", tx.AccountId);
                            cmd.Parameters.AddWithValue("@txType", tx.TxType);
                            cmd.Parameters.AddWithValue("@amount", tx.AmountPiasters);
                            cmd.Parameters.AddWithValue("@profit", tx.ProfitPiasters);
                            cmd.Parameters.AddWithValue("@totalCollected", tx.TotalCollectedPiasters);
                            cmd.Parameters.AddWithValue("@phone", (object)tx.CustomerPhone ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@custName", (object)tx.CustomerName ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@refNum", (object)tx.ReferenceNumber ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@saleId", (object)tx.SaleId ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@cashier", (object)tx.CashierName ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@dest", tx.PaymentDestination ?? "cash_drawer");
                            cmd.Parameters.AddWithValue("@status", "completed");
                            cmd.Parameters.AddWithValue("@notes", (object)tx.Notes ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@now", now);
                            cmd.ExecuteNonQuery();
                        }

                        trans.Commit();
                        return tx;
                    }
                    catch
                    {
                        trans.Rollback();
                        throw;
                    }
                }
            }
        }

        /// <summary>
        /// Links a POS checkout payment directly to digital wallets / InstaPay:
        /// Automatically increases the balance of the designated wallet/instapay account.
        /// Satisfies: "وتربط الي في الصوره بيهم لما حد يشتري من هنا ويدفع بيهم فلوسي الي حاطتها تزيد"
        /// </summary>
        public bool CreditSaleToAccount(string saleId, string method, long amountPiasters, string customerName, string cashierName, string specificAccountId = null)
        {
            if (string.IsNullOrEmpty(saleId) || amountPiasters <= 0) return false;

            string targetType = (method == "instapay") ? "instapay" : "wallet";

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        string accountId = specificAccountId;
                        string accName = null;

                        if (string.IsNullOrEmpty(accountId))
                        {
                            // Find default active account for this type
                            string findSql = "SELECT id, name FROM digital_accounts WHERE type = @type AND is_active = 1 ORDER BY is_default DESC, created_at ASC LIMIT 1;";
                            using (var cmd = new SQLiteCommand(findSql, conn, trans))
                            {
                                cmd.Parameters.AddWithValue("@type", targetType);
                                using (var reader = cmd.ExecuteReader())
                                {
                                    if (reader.Read())
                                    {
                                        accountId = reader["id"].ToString();
                                        accName = reader["name"].ToString();
                                    }
                                }
                            }
                        }
                        else
                        {
                            string getSql = "SELECT name FROM digital_accounts WHERE id = @id LIMIT 1;";
                            using (var cmd = new SQLiteCommand(getSql, conn, trans))
                            {
                                cmd.Parameters.AddWithValue("@id", accountId);
                                object res = cmd.ExecuteScalar();
                                if (res != null && res != DBNull.Value)
                                {
                                    accName = res.ToString();
                                }
                            }
                        }

                        if (string.IsNullOrEmpty(accountId))
                        {
                            // If no account exists yet, we don't block the sale
                            return false;
                        }

                        string now = DateTime.UtcNow.ToString("o");

                        // Increase account balance
                        string updateBalSql = "UPDATE digital_accounts SET balance_piasters = balance_piasters + @amount, updated_at = @now WHERE id = @id;";
                        using (var cmd = new SQLiteCommand(updateBalSql, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@amount", amountPiasters);
                            cmd.Parameters.AddWithValue("@now", now);
                            cmd.Parameters.AddWithValue("@id", accountId);
                            cmd.ExecuteNonQuery();
                        }

                        // Record transaction
                        string insertTxSql = @"
                            INSERT INTO digital_transactions (
                                id, account_id, tx_type, amount_piasters, profit_piasters, total_collected_piasters,
                                customer_name, sale_id, cashier_name, payment_destination, status, notes, created_at
                            ) VALUES (
                                @id, @accId, 'pos_sale', @amount, 0, @amount,
                                @custName, @saleId, @cashier, 'wallet', 'completed', @notes, @now
                            );";
                        using (var cmd = new SQLiteCommand(insertTxSql, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@id", Guid.NewGuid().ToString());
                            cmd.Parameters.AddWithValue("@accId", accountId);
                            cmd.Parameters.AddWithValue("@amount", amountPiasters);
                            cmd.Parameters.AddWithValue("@custName", (object)customerName ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@saleId", saleId);
                            cmd.Parameters.AddWithValue("@cashier", (object)cashierName ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@notes", string.Format("سداد فاتورة بيع كاشير عبر {0}", targetType == "instapay" ? "إنستاباي" : "محفظة إلكترونية"));
                            cmd.Parameters.AddWithValue("@now", now);
                            cmd.ExecuteNonQuery();
                        }

                        trans.Commit();
                        return true;
                    }
                    catch
                    {
                        trans.Rollback();
                        return false;
                    }
                }
            }
        }

        public List<DigitalTransaction> GetTransactions(int limit = 200, string accountId = null, string txType = null)
        {
            var list = new List<DigitalTransaction>();
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    SELECT t.*, a.name AS account_name, a.type AS account_type
                    FROM digital_transactions t
                    LEFT JOIN digital_accounts a ON t.account_id = a.id
                    WHERE 1=1 ";

                if (!string.IsNullOrEmpty(accountId) && accountId != "all")
                {
                    sql += " AND t.account_id = @accId ";
                }
                if (!string.IsNullOrEmpty(txType) && txType != "all")
                {
                    sql += " AND t.tx_type = @txType ";
                }
                sql += " ORDER BY t.created_at DESC LIMIT @limit;";

                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@limit", limit > 0 ? limit : 200);
                    if (!string.IsNullOrEmpty(accountId) && accountId != "all")
                    {
                        cmd.Parameters.AddWithValue("@accId", accountId);
                    }
                    if (!string.IsNullOrEmpty(txType) && txType != "all")
                    {
                        cmd.Parameters.AddWithValue("@txType", txType);
                    }

                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            list.Add(MapTransaction(reader));
                        }
                    }
                }
            }
            return list;
        }

        public List<DigitalAccountFunding> GetFundings(int limit = 100, string accountId = null)
        {
            var list = new List<DigitalAccountFunding>();
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    SELECT f.*, a.name AS account_name
                    FROM digital_account_fundings f
                    LEFT JOIN digital_accounts a ON f.account_id = a.id
                    WHERE 1=1 ";

                if (!string.IsNullOrEmpty(accountId) && accountId != "all")
                {
                    sql += " AND f.account_id = @accId ";
                }
                sql += " ORDER BY f.created_at DESC LIMIT @limit;";

                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@limit", limit > 0 ? limit : 100);
                    if (!string.IsNullOrEmpty(accountId) && accountId != "all")
                    {
                        cmd.Parameters.AddWithValue("@accId", accountId);
                    }

                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            list.Add(MapFunding(reader));
                        }
                    }
                }
            }
            return list;
        }

        public DigitalAnalyticsSummary GetAnalytics()
        {
            var summary = new DigitalAnalyticsSummary();
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();

                // 1. Balances
                string balSql = @"
                    SELECT 
                        COALESCE(SUM(CASE WHEN type = 'wallet' AND is_active = 1 THEN balance_piasters ELSE 0 END), 0) AS wallets_bal,
                        COALESCE(SUM(CASE WHEN type = 'instapay' AND is_active = 1 THEN balance_piasters ELSE 0 END), 0) AS instapay_bal,
                        COALESCE(SUM(CASE WHEN is_active = 1 THEN balance_piasters ELSE 0 END), 0) AS total_bal,
                        COUNT(CASE WHEN is_active = 1 THEN 1 END) AS active_count
                    FROM digital_accounts;
                ";
                using (var cmd = new SQLiteCommand(balSql, conn))
                using (var reader = cmd.ExecuteReader())
                {
                    if (reader.Read())
                    {
                        summary.TotalWalletsBalancePiasters = Convert.ToInt64(reader["wallets_bal"]);
                        summary.TotalInstapayBalancePiasters = Convert.ToInt64(reader["instapay_bal"]);
                        summary.TotalDigitalBalancePiasters = Convert.ToInt64(reader["total_bal"]);
                        summary.ActiveAccountsCount = Convert.ToInt32(reader["active_count"]);
                    }
                }

                // 2. Transactions & Profits
                string todayStart = DateTime.UtcNow.ToString("yyyy-MM-dd") + "T00:00:00";
                string txSql = @"
                    SELECT 
                        COUNT(*) AS total_count,
                        COALESCE(SUM(profit_piasters), 0) AS total_profit,
                        COUNT(CASE WHEN created_at >= @today THEN 1 END) AS today_count,
                        COALESCE(SUM(CASE WHEN created_at >= @today THEN profit_piasters ELSE 0 END), 0) AS today_profit,
                        COALESCE(SUM(CASE WHEN created_at >= @today THEN amount_piasters ELSE 0 END), 0) AS today_volume
                    FROM digital_transactions
                    WHERE status = 'completed';
                ";
                using (var cmd = new SQLiteCommand(txSql, conn))
                {
                    cmd.Parameters.AddWithValue("@today", todayStart);
                    using (var reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            summary.TotalTransactionsCount = Convert.ToInt32(reader["total_count"]);
                            summary.TotalProfitPiasters = Convert.ToInt64(reader["total_profit"]);
                            summary.TodayTransactionsCount = Convert.ToInt32(reader["today_count"]);
                            summary.TodayProfitPiasters = Convert.ToInt64(reader["today_profit"]);
                            summary.TodayVolumePiasters = Convert.ToInt64(reader["today_volume"]);
                        }
                    }
                }
            }
            return summary;
        }

        private static DigitalAccount MapAccount(SQLiteDataReader r)
        {
            string accType = r["type"].ToString();
            long dailyLimit = string.Equals(accType, "instapay", StringComparison.OrdinalIgnoreCase) ? 7000000 : 6000000;
            long monthlyLimit = string.Equals(accType, "instapay", StringComparison.OrdinalIgnoreCase) ? 40000000 : 20000000;

            for (int i = 0; i < r.FieldCount; i++)
            {
                if (string.Equals(r.GetName(i), "daily_limit_piasters", StringComparison.OrdinalIgnoreCase))
                {
                    if (r[i] != DBNull.Value) dailyLimit = Convert.ToInt64(r[i]);
                }
                else if (string.Equals(r.GetName(i), "monthly_limit_piasters", StringComparison.OrdinalIgnoreCase))
                {
                    if (r[i] != DBNull.Value) monthlyLimit = Convert.ToInt64(r[i]);
                }
            }

            return new DigitalAccount
            {
                Id = r["id"].ToString(),
                Name = r["name"].ToString(),
                Type = accType,
                Provider = r["provider"].ToString(),
                AccountNumber = r["account_number"] != DBNull.Value ? r["account_number"].ToString() : null,
                BalancePiasters = Convert.ToInt64(r["balance_piasters"]),
                LowBalanceAlertPiasters = Convert.ToInt64(r["low_balance_alert_piasters"]),
                DailyLimitPiasters = dailyLimit,
                MonthlyLimitPiasters = monthlyLimit,
                IsDefault = Convert.ToInt32(r["is_default"]) == 1,
                IsActive = Convert.ToInt32(r["is_active"]) == 1,
                Notes = r["notes"] != DBNull.Value ? r["notes"].ToString() : null,
                CreatedAt = r["created_at"].ToString(),
                UpdatedAt = r["updated_at"].ToString()
            };
        }

        private static DigitalTransaction MapTransaction(SQLiteDataReader r)
        {
            return new DigitalTransaction
            {
                Id = r["id"].ToString(),
                AccountId = r["account_id"].ToString(),
                AccountName = r["account_name"] != DBNull.Value ? r["account_name"].ToString() : null,
                AccountType = r["account_type"] != DBNull.Value ? r["account_type"].ToString() : null,
                TxType = r["tx_type"].ToString(),
                AmountPiasters = Convert.ToInt64(r["amount_piasters"]),
                ProfitPiasters = Convert.ToInt64(r["profit_piasters"]),
                TotalCollectedPiasters = Convert.ToInt64(r["total_collected_piasters"]),
                CustomerPhone = r["customer_phone"] != DBNull.Value ? r["customer_phone"].ToString() : null,
                CustomerName = r["customer_name"] != DBNull.Value ? r["customer_name"].ToString() : null,
                ReferenceNumber = r["reference_number"] != DBNull.Value ? r["reference_number"].ToString() : null,
                SaleId = r["sale_id"] != DBNull.Value ? r["sale_id"].ToString() : null,
                CashierName = r["cashier_name"] != DBNull.Value ? r["cashier_name"].ToString() : null,
                PaymentDestination = r["payment_destination"] != DBNull.Value ? r["payment_destination"].ToString() : null,
                Status = r["status"] != DBNull.Value ? r["status"].ToString() : "completed",
                Notes = r["notes"] != DBNull.Value ? r["notes"].ToString() : null,
                CreatedAt = r["created_at"].ToString()
            };
        }

        private static DigitalAccountFunding MapFunding(SQLiteDataReader r)
        {
            return new DigitalAccountFunding
            {
                Id = r["id"].ToString(),
                AccountId = r["account_id"].ToString(),
                AccountName = r["account_name"] != DBNull.Value ? r["account_name"].ToString() : null,
                AmountPiasters = Convert.ToInt64(r["amount_piasters"]),
                FundingSource = r["funding_source"].ToString(),
                PreviousBalancePiasters = Convert.ToInt64(r["previous_balance_piasters"]),
                NewBalancePiasters = Convert.ToInt64(r["new_balance_piasters"]),
                Notes = r["notes"] != DBNull.Value ? r["notes"].ToString() : null,
                CreatedBy = r["created_by"] != DBNull.Value ? r["created_by"].ToString() : null,
                CreatedAt = r["created_at"].ToString()
            };
        }
    }
}
