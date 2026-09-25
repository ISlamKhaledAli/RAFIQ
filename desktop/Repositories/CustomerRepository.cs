using System;
using System.Collections.Generic;
using System.Data.SQLite;
using RafiqPOS.Models;

namespace RafiqPOS.Repositories
{
    public class CustomerRepository
    {
        private readonly string _connectionString;

        public CustomerRepository(string connectionString)
        {
            _connectionString = connectionString;
        }

        public List<Customer> GetAll(int limit)
        {
            var list = new List<Customer>();
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = "SELECT * FROM customers ORDER BY balance_piasters DESC, name ASC LIMIT @limit;";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@limit", limit > 0 ? limit : 100);
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            list.Add(MapReaderToCustomer(reader));
                        }
                    }
                }
            }
            return list;
        }

        public List<Customer> Search(string query)
        {
            var list = new List<Customer>();
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    SELECT * FROM customers 
                    WHERE name LIKE @q OR phone LIKE @q 
                    ORDER BY balance_piasters DESC, name ASC 
                    LIMIT 50;
                ";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@q", "%" + (query ?? "").Trim() + "%");
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            list.Add(MapReaderToCustomer(reader));
                        }
                    }
                }
            }
            return list;
        }

        public Customer GetById(string id)
        {
            if (string.IsNullOrWhiteSpace(id)) return null;

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = "SELECT * FROM customers WHERE id = @id LIMIT 1;";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@id", id);
                    using (var reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            return MapReaderToCustomer(reader);
                        }
                    }
                }
            }
            return null;
        }

        public Customer FindByPhone(string phone, string excludeId)
        {
            if (string.IsNullOrWhiteSpace(phone)) return null;

            string cleanPhone = phone.Trim().Replace(" ", "").Replace("-", "");
            if (cleanPhone.Length < 7) return null;

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = "SELECT * FROM customers WHERE REPLACE(REPLACE(phone, ' ', ''), '-', '') = @phone " +
                             (!string.IsNullOrEmpty(excludeId) ? "AND id != @excludeId " : "") +
                             "LIMIT 1;";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@phone", cleanPhone);
                    if (!string.IsNullOrEmpty(excludeId))
                    {
                        cmd.Parameters.AddWithValue("@excludeId", excludeId);
                    }
                    using (var reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            return MapReaderToCustomer(reader);
                        }
                    }
                }
            }
            return null;
        }

        public Customer SaveCustomer(Customer customer)
        {
            if (customer == null) throw new ArgumentNullException("customer");
            if (string.IsNullOrWhiteSpace(customer.Name)) throw new ArgumentException("اسم العميل مطلوب");

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        string now = DateTime.UtcNow.ToString("o");
                        if (string.IsNullOrWhiteSpace(customer.Id))
                        {
                            customer.Id = "cust_" + Guid.NewGuid().ToString("N").Substring(0, 12);
                            customer.CreatedAt = now;

                            string sqlInsert = @"
                                INSERT INTO customers (id, name, phone, balance_piasters, credit_limit_piasters, created_at)
                                VALUES (@id, @name, @phone, @balance, @limit, @created_at);
                            ";
                            using (var cmd = new SQLiteCommand(sqlInsert, conn, trans))
                            {
                                cmd.Parameters.AddWithValue("@id", customer.Id);
                                cmd.Parameters.AddWithValue("@name", customer.Name.Trim());
                                cmd.Parameters.AddWithValue("@phone", (customer.Phone ?? "").Trim());
                                cmd.Parameters.AddWithValue("@balance", customer.BalancePiasters);
                                cmd.Parameters.AddWithValue("@limit", customer.CreditLimitPiasters);
                                cmd.Parameters.AddWithValue("@created_at", customer.CreatedAt);
                                cmd.ExecuteNonQuery();
                            }

                            if (customer.BalancePiasters > 0)
                            {
                                string ledgerSql = @"
                                    INSERT INTO customer_ledger (id, customer_id, type, sale_id, amount_piasters, balance_after_piasters, notes, created_at)
                                    VALUES (@lid, @cid, 'opening_balance', NULL, @amt, @after, 'رصيد افتتاحي', @cat);
                                ";
                                using (var lCmd = new SQLiteCommand(ledgerSql, conn, trans))
                                {
                                    lCmd.Parameters.AddWithValue("@lid", "led_" + Guid.NewGuid().ToString("N").Substring(0, 12));
                                    lCmd.Parameters.AddWithValue("@cid", customer.Id);
                                    lCmd.Parameters.AddWithValue("@amt", customer.BalancePiasters);
                                    lCmd.Parameters.AddWithValue("@after", customer.BalancePiasters);
                                    lCmd.Parameters.AddWithValue("@cat", now);
                                    lCmd.ExecuteNonQuery();
                                }
                            }
                        }
                        else
                        {
                            string sqlUpdate = @"
                                UPDATE customers 
                                SET name = @name, phone = @phone, credit_limit_piasters = @limit
                                WHERE id = @id;
                            ";
                            using (var cmd = new SQLiteCommand(sqlUpdate, conn, trans))
                            {
                                cmd.Parameters.AddWithValue("@id", customer.Id);
                                cmd.Parameters.AddWithValue("@name", customer.Name.Trim());
                                cmd.Parameters.AddWithValue("@phone", (customer.Phone ?? "").Trim());
                                cmd.Parameters.AddWithValue("@limit", customer.CreditLimitPiasters);
                                cmd.ExecuteNonQuery();
                            }
                        }

                        trans.Commit();
                        return GetById(customer.Id);
                    }
                    catch
                    {
                        trans.Rollback();
                        throw;
                    }
                }
            }
        }

        public Customer RecordPayment(string customerId, long amountPiasters, string notes)
        {
            if (string.IsNullOrWhiteSpace(customerId)) throw new ArgumentException("معرف العميل مطلوب");
            if (amountPiasters <= 0) throw new ArgumentException("مبلغ السداد يجب أن يكون أكبر من الصفر");

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        long currentBalance = 0;
                        string getBalSql = "SELECT balance_piasters FROM customers WHERE id = @id LIMIT 1;";
                        using (var cmd = new SQLiteCommand(getBalSql, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@id", customerId);
                            object res = cmd.ExecuteScalar();
                            if (res == null || res == DBNull.Value)
                            {
                                throw new InvalidOperationException("العميل غير موجود في النظام");
                            }
                            currentBalance = Convert.ToInt64(res);
                        }

                        long newBalance = currentBalance - amountPiasters;
                        string now = DateTime.UtcNow.ToString("o");

                        // Update customer balance
                        string updateBalSql = "UPDATE customers SET balance_piasters = @newBal WHERE id = @id;";
                        using (var cmd = new SQLiteCommand(updateBalSql, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@newBal", newBalance);
                            cmd.Parameters.AddWithValue("@id", customerId);
                            cmd.ExecuteNonQuery();
                        }

                        // Insert ledger entry
                        string ledgerSql = @"
                            INSERT INTO customer_ledger (id, customer_id, type, sale_id, amount_piasters, balance_after_piasters, notes, created_at)
                            VALUES (@lid, @cid, 'payment', NULL, @amt, @after, @notes, @cat);
                        ";
                        using (var cmd = new SQLiteCommand(ledgerSql, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@lid", "led_" + Guid.NewGuid().ToString("N").Substring(0, 12));
                            cmd.Parameters.AddWithValue("@cid", customerId);
                            cmd.Parameters.AddWithValue("@amt", amountPiasters);
                            cmd.Parameters.AddWithValue("@after", newBalance);
                            cmd.Parameters.AddWithValue("@notes", string.IsNullOrWhiteSpace(notes) ? "سداد نقدي من العميل" : notes.Trim());
                            cmd.Parameters.AddWithValue("@cat", now);
                            cmd.ExecuteNonQuery();
                        }

                        // Insert audit log
                        string auditSql = @"
                            INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details_json, created_at)
                            VALUES (@aid, 'usr_admin_default', 'customer_payment', 'customer', @cid, @details, @cat);
                        ";
                        using (var cmd = new SQLiteCommand(auditSql, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@aid", "aud_" + Guid.NewGuid().ToString("N").Substring(0, 12));
                            cmd.Parameters.AddWithValue("@cid", customerId);
                            cmd.Parameters.AddWithValue("@details", string.Format("{{\"paidPiasters\":{0},\"balanceAfter\":{1}}}", amountPiasters, newBalance));
                            cmd.Parameters.AddWithValue("@cat", now);
                            cmd.ExecuteNonQuery();
                        }

                        trans.Commit();
                        return GetById(customerId);
                    }
                    catch
                    {
                        trans.Rollback();
                        throw;
                    }
                }
            }
        }

        public Customer CancelPayment(string customerId, string ledgerEntryId, string reason, string userName)
        {
            if (string.IsNullOrWhiteSpace(customerId)) throw new ArgumentException("معرف العميل مطلوب");
            if (string.IsNullOrWhiteSpace(ledgerEntryId)) throw new ArgumentException("معرف حركة السداد مطلوب");

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        // 1. Check customer exists and get balance
                        long currentBalance = 0;
                        string getBalSql = "SELECT balance_piasters FROM customers WHERE id = @id LIMIT 1;";
                        using (var cmd = new SQLiteCommand(getBalSql, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@id", customerId);
                            object res = cmd.ExecuteScalar();
                            if (res == null || res == DBNull.Value)
                            {
                                throw new InvalidOperationException("العميل غير موجود في النظام");
                            }
                            currentBalance = Convert.ToInt64(res);
                        }

                        // 2. Fetch original payment entry
                        long paymentAmount = 0;
                        string getEntrySql = "SELECT type, amount_piasters FROM customer_ledger WHERE id = @lid AND customer_id = @cid LIMIT 1;";
                        using (var cmd = new SQLiteCommand(getEntrySql, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@lid", ledgerEntryId);
                            cmd.Parameters.AddWithValue("@cid", customerId);
                            using (var reader = cmd.ExecuteReader())
                            {
                                if (!reader.Read())
                                {
                                    throw new InvalidOperationException("حركة السداد غير موجودة في سجل هذا العميل");
                                }
                                string entryType = reader["type"].ToString();
                                if (entryType != "payment")
                                {
                                    throw new InvalidOperationException("لا يمكن إلغاء سوى حركات السداد فقط");
                                }
                                paymentAmount = Convert.ToInt64(reader["amount_piasters"]);
                            }
                        }

                        // 3. Ensure this payment hasn't already been cancelled
                        string checkCancelledSql = "SELECT COUNT(*) FROM customer_ledger WHERE customer_id = @cid AND type = 'payment_cancel' AND sale_id = @lid;";
                        using (var cmd = new SQLiteCommand(checkCancelledSql, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@cid", customerId);
                            cmd.Parameters.AddWithValue("@lid", ledgerEntryId);
                            long count = Convert.ToInt64(cmd.ExecuteScalar());
                            if (count > 0)
                            {
                                throw new InvalidOperationException("تم إلغاء هذه الدفعة مسبقاً بقيد معاكس");
                            }
                        }

                        // 4. Calculate restored balance (reversing payment restores debt)
                        long newBalance = currentBalance + paymentAmount;
                        string now = DateTime.UtcNow.ToString("o");

                        // 5. Update customer balance
                        string updateBalSql = "UPDATE customers SET balance_piasters = @newBal WHERE id = @id;";
                        using (var cmd = new SQLiteCommand(updateBalSql, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@newBal", newBalance);
                            cmd.Parameters.AddWithValue("@id", customerId);
                            cmd.ExecuteNonQuery();
                        }

                        // 6. Insert contra ledger entry
                        string user = string.IsNullOrWhiteSpace(userName) ? "الكاشير" : userName.Trim();
                        string rsn = string.IsNullOrWhiteSpace(reason) ? "سجلت بالخطأ" : reason.Trim();
                        string notesFormatted = string.Format("قيد معاكس لإلغاء دفعة (المبلغ: {0} ج.م) — السبب: {1} (المستخدم: {2})",
                            Common.Money.FormatPiasters(paymentAmount), rsn, user);

                        string ledgerSql = @"
                            INSERT INTO customer_ledger (id, customer_id, type, sale_id, amount_piasters, balance_after_piasters, notes, created_at)
                            VALUES (@lid, @cid, 'payment_cancel', @origLid, @amt, @after, @notes, @cat);
                        ";
                        using (var cmd = new SQLiteCommand(ledgerSql, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@lid", "led_rev_" + Guid.NewGuid().ToString("N").Substring(0, 12));
                            cmd.Parameters.AddWithValue("@cid", customerId);
                            cmd.Parameters.AddWithValue("@origLid", ledgerEntryId);
                            cmd.Parameters.AddWithValue("@amt", paymentAmount);
                            cmd.Parameters.AddWithValue("@after", newBalance);
                            cmd.Parameters.AddWithValue("@notes", notesFormatted);
                            cmd.Parameters.AddWithValue("@cat", now);
                            cmd.ExecuteNonQuery();
                        }

                        // 7. Insert audit log
                        string auditSql = @"
                            INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details_json, created_at)
                            VALUES (@aid, @uid, 'cancel_payment', 'customer_ledger', @lid, @details, @cat);
                        ";
                        using (var cmd = new SQLiteCommand(auditSql, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@aid", "aud_" + Guid.NewGuid().ToString("N").Substring(0, 12));
                            cmd.Parameters.AddWithValue("@uid", user);
                            cmd.Parameters.AddWithValue("@lid", ledgerEntryId);
                            cmd.Parameters.AddWithValue("@details", string.Format("{{\"cancelledAmountPiasters\":{0},\"restoredBalance\":{1},\"reason\":\"{2}\"}}", paymentAmount, newBalance, rsn.Replace("\"", "\\\"")));
                            cmd.Parameters.AddWithValue("@cat", now);
                            cmd.ExecuteNonQuery();
                        }

                        trans.Commit();
                        return GetById(customerId);
                    }
                    catch
                    {
                        trans.Rollback();
                        throw;
                    }
                }
            }
        }

        public List<CustomerLedgerEntry> GetStatement(string customerId, int limit)
        {
            var list = new List<CustomerLedgerEntry>();
            if (string.IsNullOrWhiteSpace(customerId)) return list;

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    SELECT * FROM customer_ledger 
                    WHERE customer_id = @cid 
                    ORDER BY created_at DESC 
                    LIMIT @limit;
                ";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@cid", customerId);
                    cmd.Parameters.AddWithValue("@limit", limit > 0 ? limit : 50);
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            list.Add(new CustomerLedgerEntry
                            {
                                Id = reader["id"].ToString(),
                                CustomerId = reader["customer_id"].ToString(),
                                Type = reader["type"].ToString(),
                                SaleId = reader["sale_id"] != DBNull.Value ? reader["sale_id"].ToString() : null,
                                AmountPiasters = Convert.ToInt64(reader["amount_piasters"]),
                                BalanceAfterPiasters = Convert.ToInt64(reader["balance_after_piasters"]),
                                Notes = reader["notes"] != DBNull.Value ? reader["notes"].ToString() : "",
                                CreatedAt = reader["created_at"].ToString()
                            });
                        }
                    }
                }
            }
            return list;
        }

        public CustomerStatementReport GetDetailedStatement(string customerId, string startDate, string endDate)
        {
            var report = new CustomerStatementReport();
            if (string.IsNullOrWhiteSpace(customerId)) return report;

            var customer = GetById(customerId);
            if (customer == null) return report;

            report.CustomerId = customer.Id;
            report.CustomerName = customer.Name;
            report.CustomerPhone = customer.Phone;
            report.StartDate = startDate;
            report.EndDate = endDate;

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = "SELECT * FROM customer_ledger WHERE customer_id = @cid ORDER BY created_at ASC;";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@cid", customerId);
                    using (var reader = cmd.ExecuteReader())
                    {
                        long runningOpening = 0;
                        while (reader.Read())
                        {
                            var entry = new CustomerLedgerEntry
                            {
                                Id = reader["id"].ToString(),
                                CustomerId = reader["customer_id"].ToString(),
                                Type = reader["type"].ToString(),
                                SaleId = reader["sale_id"] != DBNull.Value ? reader["sale_id"].ToString() : null,
                                AmountPiasters = Convert.ToInt64(reader["amount_piasters"]),
                                BalanceAfterPiasters = Convert.ToInt64(reader["balance_after_piasters"]),
                                Notes = reader["notes"] != DBNull.Value ? reader["notes"].ToString() : "",
                                CreatedAt = reader["created_at"].ToString()
                            };

                            string entryDate = entry.CreatedAt != null && entry.CreatedAt.Length >= 10 ? entry.CreatedAt.Substring(0, 10) : "";
                            string type = entry.Type.ToLowerInvariant();
                            bool isDebit = (type == "sale" || type == "opening_balance" || type == "debt_increase" || type == "payment_cancel");
                            bool isCredit = (type == "payment" || type == "refund" || type == "cancellation" || type == "debt_decrease");

                            // If strictly prior to start date, factor into opening balance
                            if (!string.IsNullOrWhiteSpace(startDate) && string.Compare(entryDate, startDate, StringComparison.Ordinal) < 0)
                            {
                                if (isDebit) runningOpening += entry.AmountPiasters;
                                else if (isCredit) runningOpening -= entry.AmountPiasters;
                                continue;
                            }

                            // If strictly after end date, ignore
                            if (!string.IsNullOrWhiteSpace(endDate) && string.Compare(entryDate, endDate, StringComparison.Ordinal) > 0)
                            {
                                continue;
                            }

                            if (isDebit) report.PeriodDebitsPiasters += entry.AmountPiasters;
                            else if (isCredit) report.PeriodCreditsPiasters += entry.AmountPiasters;

                            report.Entries.Add(entry);
                        }

                        report.OpeningBalancePiasters = runningOpening;
                        report.ClosingBalancePiasters = runningOpening + report.PeriodDebitsPiasters - report.PeriodCreditsPiasters;
                    }
                }
            }

            return report;
        }

        public CustomerBalanceVerification VerifyBalance(string customerId)
        {
            if (string.IsNullOrWhiteSpace(customerId)) return null;

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();

                long storedBalance = 0;
                string getBalSql = "SELECT balance_piasters FROM customers WHERE id = @id LIMIT 1;";
                using (var cmd = new SQLiteCommand(getBalSql, conn))
                {
                    cmd.Parameters.AddWithValue("@id", customerId);
                    object res = cmd.ExecuteScalar();
                    if (res == null || res == DBNull.Value) return null;
                    storedBalance = Convert.ToInt64(res);
                }

                long calculatedBalance = 0;
                int entriesCount = 0;
                string ledgerSql = "SELECT type, amount_piasters FROM customer_ledger WHERE customer_id = @id ORDER BY created_at ASC;";
                using (var cmd = new SQLiteCommand(ledgerSql, conn))
                {
                    cmd.Parameters.AddWithValue("@id", customerId);
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            entriesCount++;
                            string type = reader["type"].ToString().ToLowerInvariant();
                            long amount = Convert.ToInt64(reader["amount_piasters"]);

                            if (type == "opening_balance" || type == "sale" || type == "debt_increase" || type == "payment_cancel")
                            {
                                calculatedBalance += amount;
                            }
                            else if (type == "payment" || type == "refund" || type == "cancellation" || type == "debt_decrease")
                            {
                                calculatedBalance -= amount;
                            }
                        }
                    }
                }

                var verification = new CustomerBalanceVerification();
                verification.CustomerId = customerId;
                verification.StoredBalancePiasters = storedBalance;
                verification.CalculatedBalancePiasters = calculatedBalance;
                verification.IsBalanced = (storedBalance == calculatedBalance);
                verification.DiscrepancyPiasters = storedBalance - calculatedBalance;
                verification.TotalEntriesCount = entriesCount;
                return verification;
            }
        }

        public Customer RecalculateAndFixBalance(string customerId)
        {
            var verify = VerifyBalance(customerId);
            if (verify == null) return null;

            if (!verify.IsBalanced)
            {
                using (var conn = new SQLiteConnection(_connectionString))
                {
                    conn.Open();
                    using (var cmd = new SQLiteCommand("UPDATE customers SET balance_piasters = @bal WHERE id = @id;", conn))
                    {
                        cmd.Parameters.AddWithValue("@bal", verify.CalculatedBalancePiasters);
                        cmd.Parameters.AddWithValue("@id", customerId);
                        cmd.ExecuteNonQuery();
                    }
                }
            }
            return GetById(customerId);
        }

        public CustomerImportResult BatchImportCustomers(List<CustomerImportRow> rows)
        {
            var result = new CustomerImportResult();
            if (rows == null || rows.Count == 0)
            {
                result.Message = "لا توجد سجلات صالحة للاستيراد";
                return result;
            }

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        string now = DateTime.UtcNow.ToString("o");
                        foreach (var row in rows)
                        {
                            if (!row.IsValid)
                            {
                                result.SkippedCount++;
                                continue;
                            }

                            string customerId = "cust_" + Guid.NewGuid().ToString("N").Substring(0, 12);
                            string cleanPhone = (row.Phone ?? "").Trim().Replace(" ", "").Replace("-", "");

                            // Check DB phone uniqueness
                            if (!string.IsNullOrEmpty(cleanPhone))
                            {
                                using (var chkCmd = new SQLiteCommand("SELECT 1 FROM customers WHERE REPLACE(REPLACE(phone, ' ', ''), '-', '') = @p LIMIT 1;", conn, trans))
                                {
                                    chkCmd.Parameters.AddWithValue("@p", cleanPhone);
                                    var existing = chkCmd.ExecuteScalar();
                                    if (existing != null)
                                    {
                                        result.SkippedCount++;
                                        continue;
                                    }
                                }
                            }

                            string insertSql = @"
                                INSERT INTO customers (id, name, phone, balance_piasters, credit_limit_piasters, created_at)
                                VALUES (@id, @name, @phone, @balance, @limit, @created_at);
                            ";
                            using (var cmd = new SQLiteCommand(insertSql, conn, trans))
                            {
                                cmd.Parameters.AddWithValue("@id", customerId);
                                cmd.Parameters.AddWithValue("@name", row.Name.Trim());
                                cmd.Parameters.AddWithValue("@phone", cleanPhone);
                                cmd.Parameters.AddWithValue("@balance", row.InitialBalancePiasters);
                                cmd.Parameters.AddWithValue("@limit", row.CreditLimitPiasters > 0 ? row.CreditLimitPiasters : 100000);
                                cmd.Parameters.AddWithValue("@created_at", now);
                                cmd.ExecuteNonQuery();
                            }

                            if (row.InitialBalancePiasters > 0)
                            {
                                string note = string.IsNullOrWhiteSpace(row.Notes)
                                    ? "رصيد افتتاحي (استيراد إكسل)"
                                    : ("رصيد افتتاحي: " + row.Notes.Trim());

                                string ledgerSql = @"
                                    INSERT INTO customer_ledger (id, customer_id, type, sale_id, amount_piasters, balance_after_piasters, notes, created_at)
                                    VALUES (@lid, @cid, 'opening_balance', NULL, @amt, @after, @notes, @cat);
                                ";
                                using (var lCmd = new SQLiteCommand(ledgerSql, conn, trans))
                                {
                                    lCmd.Parameters.AddWithValue("@lid", "led_" + Guid.NewGuid().ToString("N").Substring(0, 12));
                                    lCmd.Parameters.AddWithValue("@cid", customerId);
                                    lCmd.Parameters.AddWithValue("@amt", row.InitialBalancePiasters);
                                    lCmd.Parameters.AddWithValue("@after", row.InitialBalancePiasters);
                                    lCmd.Parameters.AddWithValue("@notes", note);
                                    lCmd.Parameters.AddWithValue("@cat", now);
                                    lCmd.ExecuteNonQuery();
                                }
                                result.TotalOpeningDebtsPiasters += row.InitialBalancePiasters;
                            }

                            result.ImportedCount++;
                        }

                        trans.Commit();
                        result.Message = string.Format("تم استيراد {0} عميل بنجاح بإجمالي ديون افتتاحية {1}.",
                            result.ImportedCount, Common.Money.FormatPiasters(result.TotalOpeningDebtsPiasters));
                        return result;
                    }
                    catch
                    {
                        trans.Rollback();
                        throw;
                    }
                }
            }
        }

        private static Customer MapReaderToCustomer(SQLiteDataReader reader)
        {
            return new Customer
            {
                Id = reader["id"].ToString(),
                Name = reader["name"].ToString(),
                Phone = reader["phone"] != DBNull.Value ? reader["phone"].ToString() : "",
                BalancePiasters = Convert.ToInt64(reader["balance_piasters"]),
                CreditLimitPiasters = Convert.ToInt64(reader["credit_limit_piasters"]),
                CreatedAt = reader["created_at"].ToString()
            };
        }
    }
}
