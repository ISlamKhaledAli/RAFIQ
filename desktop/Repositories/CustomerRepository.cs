using System;
using System.Collections.Generic;
using System.Data.SQLite;
using RafiqPOS.Models;

namespace RafiqPOS.Repositories
{
    public class CustomerRepository
    {
        private readonly string _connectionString;
        private readonly AuditLogRepository _auditRepo;

        public CustomerRepository(string connectionString, AuditLogRepository auditRepo = null)
        {
            _connectionString = connectionString;
            _auditRepo = auditRepo ?? new AuditLogRepository(connectionString);
        }

        private class UnpaidSaleAlloc
        {
            public string SaleId { get; set; }
            public int InvoiceNumber { get; set; }
            public long UnpaidPiasters { get; set; }
        }

        public List<Customer> GetAll(int limit)
        {
            var list = new List<Customer>();
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = "SELECT * FROM customers WHERE is_archived = 0 AND id != 'cust_general_cash' ORDER BY balance_piasters DESC, name ASC LIMIT @limit;";
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
                    WHERE is_archived = 0 AND id != 'cust_general_cash' AND (name LIKE @q OR phone LIKE @q)
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
                        bool exists = false;
                        if (!string.IsNullOrWhiteSpace(customer.Id))
                        {
                            using (var checkCmd = new SQLiteCommand("SELECT COUNT(*) FROM customers WHERE id = @id;", conn, trans))
                            {
                                checkCmd.Parameters.AddWithValue("@id", customer.Id);
                                exists = Convert.ToInt64(checkCmd.ExecuteScalar()) > 0;
                            }
                        }

                        if (!exists)
                        {
                            if (string.IsNullOrWhiteSpace(customer.Id))
                            {
                                customer.Id = "cust_" + Guid.NewGuid().ToString("N").Substring(0, 12);
                            }
                            customer.CreatedAt = now;

                            if (customer.BalancePiasters == 0 && customer.InitialBalancePiasters != 0)
                            {
                                customer.BalancePiasters = customer.InitialBalancePiasters;
                            }

                            if (customer.BalancePiasters != 0)
                            {
                                if (!HasCustomerPermission("customers.opening_balance"))
                                {
                                    throw new UnauthorizedAccessException("ليس لديك صلاحية تحديد رصيد افتتاحي للعميل");
                                }
                            }

                            if (customer.CreditLimitPiasters > 0)
                            {
                                if (!HasCustomerPermission("customers.credit_limit"))
                                {
                                    throw new UnauthorizedAccessException("ليس لديك صلاحية تحديد الحد الائتماني للعميل");
                                }
                            }

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

                            if (customer.BalancePiasters != 0)
                            {
                                string ledgerSql = @"
                                    INSERT INTO customer_ledger (id, customer_id, type, sale_id, amount_piasters, balance_after_piasters, notes, created_at)
                                    VALUES (@lid, @cid, 'opening_balance', NULL, @amt, @after, 'رصيد افتتاحي قديم', @cat);
                                ";
                                using (var lCmd = new SQLiteCommand(ledgerSql, conn, trans))
                                {
                                    lCmd.Parameters.AddWithValue("@lid", "led_" + Guid.NewGuid().ToString("N").Substring(0, 12));
                                    lCmd.Parameters.AddWithValue("@cid", customer.Id);
                                    lCmd.Parameters.AddWithValue("@amt", Math.Abs(customer.BalancePiasters));
                                    lCmd.Parameters.AddWithValue("@after", customer.BalancePiasters);
                                    lCmd.Parameters.AddWithValue("@cat", now);
                                    lCmd.ExecuteNonQuery();
                                }

                                if (_auditRepo != null)
                                {
                                    _auditRepo.Log(conn, trans, new AuditLog
                                    {
                                        Id = "aud_" + Guid.NewGuid().ToString("N"),
                                        UserId = CurrentAuditUserId(),
                                        Action = "CUSTOMER_OPENING_BALANCE_SET",
                                        EntityType = "customer",
                                        EntityId = customer.Id,
                                        DetailsJson = string.Format("{{\"customerId\":\"{0}\",\"customerName\":\"{1}\",\"openingBalancePiasters\":{2}}}",
                                            customer.Id, customer.Name, customer.BalancePiasters),
                                        CreatedAt = now
                                    });
                                }
                            }

                            if (customer.CreditLimitPiasters > 0 && _auditRepo != null)
                            {
                                _auditRepo.Log(conn, trans, new AuditLog
                                {
                                    Id = "aud_" + Guid.NewGuid().ToString("N"),
                                    UserId = CurrentAuditUserId(),
                                    Action = "CUSTOMER_CREDIT_LIMIT_SET",
                                    EntityType = "customer",
                                    EntityId = customer.Id,
                                    DetailsJson = string.Format("{{\"customerId\":\"{0}\",\"customerName\":\"{1}\",\"creditLimitPiasters\":{2}}}",
                                        customer.Id, customer.Name, customer.CreditLimitPiasters),
                                    CreatedAt = now
                                });
                            }
                        }
                        else
                        {
                            long oldLimit = 0;
                            using (var getCmd = new SQLiteCommand("SELECT credit_limit_piasters FROM customers WHERE id = @id LIMIT 1;", conn, trans))
                            {
                                getCmd.Parameters.AddWithValue("@id", customer.Id);
                                object o = getCmd.ExecuteScalar();
                                if (o != null && o != DBNull.Value) oldLimit = Convert.ToInt64(o);
                            }

                            if (customer.CreditLimitPiasters != oldLimit)
                            {
                                if (!HasCustomerPermission("customers.credit_limit"))
                                {
                                    throw new UnauthorizedAccessException("ليس لديك صلاحية تعديل الحد الائتماني للعميل");
                                }

                                if (_auditRepo != null)
                                {
                                    _auditRepo.Log(conn, trans, new AuditLog
                                    {
                                        Id = "aud_" + Guid.NewGuid().ToString("N"),
                                        UserId = CurrentAuditUserId(),
                                        Action = "CUSTOMER_CREDIT_LIMIT_CHANGE",
                                        EntityType = "customer",
                                        EntityId = customer.Id,
                                        DetailsJson = string.Format("{{\"customerId\":\"{0}\",\"customerName\":\"{1}\",\"oldLimitPiasters\":{2},\"newLimitPiasters\":{3}}}",
                                            customer.Id, customer.Name, oldLimit, customer.CreditLimitPiasters),
                                        CreatedAt = now
                                    });
                                }
                            }

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

        public Customer RecordPayment(string customerId, long amountPiasters, string notes, string shiftId = null, string paymentMethod = "cash", string digitalAccountId = null)
        {
            if (string.IsNullOrWhiteSpace(customerId)) throw new ArgumentException("معرف العميل مطلوب");
            if (amountPiasters <= 0) throw new ArgumentException("مبلغ السداد يجب أن يكون أكبر من الصفر");
            if (customerId == "cust_general_cash")
            {
                throw new InvalidOperationException("لا يمكن تسجيل سداد آجل للعميل النقدي العام");
            }

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        long currentBalance = 0;
                        string customerName = "";
                        bool isArchived = false;
                        string getBalSql = "SELECT name, balance_piasters, is_archived FROM customers WHERE id = @id LIMIT 1;";
                        using (var cmd = new SQLiteCommand(getBalSql, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@id", customerId);
                            using (var reader = cmd.ExecuteReader())
                            {
                                if (!reader.Read())
                                {
                                    throw new InvalidOperationException("العميل غير موجود في النظام");
                                }
                                customerName = reader["name"] != DBNull.Value ? reader["name"].ToString() : "";
                                currentBalance = Convert.ToInt64(reader["balance_piasters"]);
                                isArchived = Convert.ToInt32(reader["is_archived"]) == 1;
                            }
                        }

                        if (isArchived)
                        {
                            throw new InvalidOperationException("لا يمكن تسجيل سداد لعميل مؤرشف");
                        }

                        // Closed day protection
                        int cutoffHour = 0;
                        using (var cutCmd = new SQLiteCommand("SELECT value FROM app_settings WHERE key = 'business_day_cutoff_hour' LIMIT 1;", conn, trans))
                        {
                            object cutVal = cutCmd.ExecuteScalar();
                            int parsedCut;
                            if (cutVal != null && cutVal != DBNull.Value && int.TryParse(cutVal.ToString(), out parsedCut) && parsedCut >= 0 && parsedCut <= 12)
                            {
                                cutoffHour = parsedCut;
                            }
                        }
                        using (var clCmd = new SQLiteCommand(@"
                            SELECT COUNT(*) FROM daily_closings 
                            WHERE business_date = date(datetime('now', 'localtime', '-' || @cutoff || ' hours'));", conn, trans))
                        {
                            clCmd.Parameters.AddWithValue("@cutoff", cutoffHour);
                            if (Convert.ToInt64(clCmd.ExecuteScalar()) > 0)
                            {
                                throw new InvalidOperationException("لا يمكن تسجيل سداد نقدي من عميل لتاريخ عمل تم إقفاله وتشميعه مسبقاً.");
                            }
                        }

                        long newBalance = currentBalance - amountPiasters;
                        string now = DateTime.UtcNow.ToString("o");
                        string ledgerId = "led_" + Guid.NewGuid().ToString("N").Substring(0, 12);

                        // FIFO Invoice Allocation (Senior Financial Requirement 2):
                        // Fetch unpaid or partially paid completed sales for this customer (oldest first)
                        var unpaidSales = new List<UnpaidSaleAlloc>();
                        string fetchSalesSql = @"
                            SELECT s.id, s.invoice_number, s.total_piasters, s.paid_piasters, COALESCE(s.service_fee_piasters, 0) AS service_fee_piasters,
                                   s.total_piasters - (s.paid_piasters - COALESCE(s.service_fee_piasters, 0)) -
                                   COALESCE((SELECT SUM(da.amount_piasters) FROM debt_allocations da WHERE da.sale_id = s.id AND da.type = 'payment'), 0) +
                                   COALESCE((SELECT SUM(da.amount_piasters) FROM debt_allocations da WHERE da.sale_id = s.id AND da.type = 'refund'), 0) AS unpaid_piasters
                            FROM sales s
                            WHERE s.customer_id = @cid AND s.status = 'completed'
                            ORDER BY s.created_at ASC, s.invoice_number ASC;
                        ";
                        using (var sCmd = new SQLiteCommand(fetchSalesSql, conn, trans))
                        {
                            sCmd.Parameters.AddWithValue("@cid", customerId);
                            using (var sReader = sCmd.ExecuteReader())
                            {
                                while (sReader.Read())
                                {
                                    string sId = sReader["id"].ToString();
                                    int sInvNum = Convert.ToInt32(sReader["invoice_number"]);
                                    long unpaid = Convert.ToInt64(sReader["unpaid_piasters"]);
                                    if (unpaid > 0)
                                    {
                                        unpaidSales.Add(new UnpaidSaleAlloc
                                        {
                                            SaleId = sId,
                                            InvoiceNumber = sInvNum,
                                            UnpaidPiasters = unpaid
                                        });
                                    }
                                }
                            }
                        }

                        long remainingToAllocate = amountPiasters;
                        var allocationNotes = new List<string>();
                        int allocIndex = 0;
                        for (int i = 0; i < unpaidSales.Count; i++)
                        {
                            if (remainingToAllocate <= 0) break;
                            var s = unpaidSales[i];
                            long alloc = Math.Min(remainingToAllocate, s.UnpaidPiasters);

                            // Insert into debt_allocations table (F-25 & F-28: sales.paid_piasters is immutable)
                            string allocId = "alloc_" + Guid.NewGuid().ToString("N").Substring(0, 12);
                            string insAllocSql = @"
                                INSERT INTO debt_allocations (id, ledger_id, sale_id, amount_piasters, type, created_at)
                                VALUES (@aid, @lid, @sid, @amt, 'payment', @cat);
                            ";
                            using (var aCmd = new SQLiteCommand(insAllocSql, conn, trans))
                            {
                                aCmd.Parameters.AddWithValue("@aid", allocId);
                                aCmd.Parameters.AddWithValue("@lid", ledgerId);
                                aCmd.Parameters.AddWithValue("@sid", s.SaleId);
                                aCmd.Parameters.AddWithValue("@amt", alloc);
                                aCmd.Parameters.AddWithValue("@cat", now);
                                aCmd.ExecuteNonQuery();
                            }

                            // Insert payment record linked to this ledger entry and sale
                            string paymentId = "pmt_settle_" + ledgerId + "_" + allocIndex;
                            string insPmtSql = @"
                                INSERT INTO payments (id, sale_id, amount_piasters, method, created_at)
                                VALUES (@pid, @sid, @amt, 'debt_settlement', @cat);
                            ";
                            using (var pCmd = new SQLiteCommand(insPmtSql, conn, trans))
                            {
                                pCmd.Parameters.AddWithValue("@pid", paymentId);
                                pCmd.Parameters.AddWithValue("@sid", s.SaleId);
                                pCmd.Parameters.AddWithValue("@amt", alloc);
                                pCmd.Parameters.AddWithValue("@cat", now);
                                pCmd.ExecuteNonQuery();
                            }

                            allocationNotes.Add(string.Format("#{0} ({1})", s.InvoiceNumber, Common.Money.FormatPiasters(alloc)));
                            remainingToAllocate -= alloc;
                            allocIndex++;
                        }

                        // Format comprehensive ledger notes documenting FIFO allocation
                        string formattedNotes;
                        if (!string.IsNullOrWhiteSpace(notes))
                        {
                            formattedNotes = notes.Trim();
                            if (allocationNotes.Count > 0)
                            {
                                formattedNotes += " [تسوية فواتير: " + string.Join("، ", allocationNotes.ToArray()) + "]";
                            }
                        }
                        else
                        {
                            if (allocationNotes.Count > 0)
                            {
                                formattedNotes = "سداد نقدي للدين [تسوية فواتير: " + string.Join("، ", allocationNotes.ToArray()) + "]";
                            }
                            else
                            {
                                formattedNotes = "سداد نقدي من العميل";
                            }
                        }
                        if (remainingToAllocate > 0 && allocationNotes.Count > 0)
                        {
                            formattedNotes += string.Format(" (متبقي {0} رصيد دائن)", Common.Money.FormatPiasters(remainingToAllocate));
                        }

                        // Update customer balance
                        string updateBalSql = "UPDATE customers SET balance_piasters = @newBal WHERE id = @id;";
                        using (var cmd = new SQLiteCommand(updateBalSql, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@newBal", newBalance);
                            cmd.Parameters.AddWithValue("@id", customerId);
                            cmd.ExecuteNonQuery();
                        }

                        // F-15: Link payment to current active shift if not specified
                        if (string.IsNullOrEmpty(shiftId))
                        {
                            using (var shiftCmd = new SQLiteCommand("SELECT id FROM shifts WHERE status = 'open' ORDER BY opened_at DESC LIMIT 1;", conn, trans))
                            {
                                object openShiftId = shiftCmd.ExecuteScalar();
                                if (openShiftId != null && openShiftId != DBNull.Value)
                                {
                                    shiftId = openShiftId.ToString();
                                }
                            }
                        }

                        // F-07: Process non-cash digital payment if paid via wallet or instapay
                        string pm = string.IsNullOrWhiteSpace(paymentMethod) ? "cash" : paymentMethod.ToLowerInvariant();
                        if (pm == "wallet" || pm == "instapay" || pm == "vodafone_cash" || pm == "card" || !string.IsNullOrEmpty(digitalAccountId))
                        {
                            if (string.IsNullOrEmpty(digitalAccountId))
                            {
                                string targetType = (pm == "instapay" || pm == "card") ? "instapay" : "wallet";
                                using (var accCmd = new SQLiteCommand("SELECT id FROM digital_accounts WHERE type = @t AND is_active = 1 ORDER BY is_default DESC, created_at ASC LIMIT 1;", conn, trans))
                                {
                                    accCmd.Parameters.AddWithValue("@t", targetType);
                                    object defAccId = accCmd.ExecuteScalar();
                                    if (defAccId != null && defAccId != DBNull.Value)
                                    {
                                        digitalAccountId = defAccId.ToString();
                                    }
                                }

                                if (string.IsNullOrEmpty(digitalAccountId))
                                {
                                    using (var accFallbackCmd = new SQLiteCommand("SELECT id FROM digital_accounts WHERE is_active = 1 ORDER BY is_default DESC, created_at ASC LIMIT 1;", conn, trans))
                                    {
                                        object anyAccId = accFallbackCmd.ExecuteScalar();
                                        if (anyAccId != null && anyAccId != DBNull.Value)
                                        {
                                            digitalAccountId = anyAccId.ToString();
                                        }
                                    }
                                }
                            }

                            if (!string.IsNullOrEmpty(digitalAccountId))
                            {
                                using (var credCmd = new SQLiteCommand("UPDATE digital_accounts SET balance_piasters = balance_piasters + @amt, updated_at = @now WHERE id = @id;", conn, trans))
                                {
                                    credCmd.Parameters.AddWithValue("@amt", amountPiasters);
                                    credCmd.Parameters.AddWithValue("@now", now);
                                    credCmd.Parameters.AddWithValue("@id", digitalAccountId);
                                    credCmd.ExecuteNonQuery();
                                }

                                string cashierName = "الكاشير";
                                var sessionUser = RafiqPOS.Services.SecurityService.CurrentUser;
                                if (sessionUser != null)
                                {
                                    cashierName = !string.IsNullOrEmpty(sessionUser.DisplayName) ? sessionUser.DisplayName : sessionUser.Username;
                                }

                                string dtxId = "dtx_" + Guid.NewGuid().ToString("N").Substring(0, 12);
                                string insDtxSql = @"
                                    INSERT INTO digital_transactions (
                                        id, account_id, tx_type, amount_piasters, profit_piasters, total_collected_piasters,
                                        customer_name, cashier_name, payment_destination, status, notes, created_at
                                    ) VALUES (
                                        @id, @accId, 'customer_debt_payment', @amt, 0, @amt,
                                        @cName, @cashier, 'wallet', 'completed', @notes, @now
                                    );
                                ";
                                using (var dtCmd = new SQLiteCommand(insDtxSql, conn, trans))
                                {
                                    dtCmd.Parameters.AddWithValue("@id", dtxId);
                                    dtCmd.Parameters.AddWithValue("@accId", digitalAccountId);
                                    dtCmd.Parameters.AddWithValue("@amt", amountPiasters);
                                    dtCmd.Parameters.AddWithValue("@cName", customerName);
                                    dtCmd.Parameters.AddWithValue("@cashier", cashierName);
                                    dtCmd.Parameters.AddWithValue("@notes", formattedNotes);
                                    dtCmd.Parameters.AddWithValue("@now", now);
                                    dtCmd.ExecuteNonQuery();
                                }
                            }
                        }

                        // Insert ledger entry
                        string ledgerSql = @"
                            INSERT INTO customer_ledger (id, customer_id, type, sale_id, amount_piasters, balance_after_piasters, notes, shift_id, payment_method, digital_account_id, created_at)
                            VALUES (@lid, @cid, 'payment', NULL, @amt, @after, @notes, @shiftId, @pm, @daId, @cat);
                        ";
                        using (var cmd = new SQLiteCommand(ledgerSql, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@lid", ledgerId);
                            cmd.Parameters.AddWithValue("@cid", customerId);
                            cmd.Parameters.AddWithValue("@amt", amountPiasters);
                            cmd.Parameters.AddWithValue("@after", newBalance);
                            cmd.Parameters.AddWithValue("@notes", formattedNotes);
                            cmd.Parameters.AddWithValue("@shiftId", (object)shiftId ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@pm", pm);
                            cmd.Parameters.AddWithValue("@daId", (object)digitalAccountId ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@cat", now);
                            cmd.ExecuteNonQuery();
                        }

                        // Insert audit log with full cryptographic chaining (Feature #169)
                        _auditRepo.Log(conn, trans, new AuditLog
                        {
                            Id = "aud_" + Guid.NewGuid().ToString("N"),
                            UserId = CurrentAuditUserId(),
                            Action = "customer_payment",
                            EntityType = "customer",
                            EntityId = customerId,
                            DetailsJson = string.Format("{{\"paidPiasters\":{0},\"balanceAfter\":{1}}}", amountPiasters, newBalance),
                            CreatedAt = now
                        });

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
                        bool isArchived = false;
                        string getBalSql = "SELECT balance_piasters, is_archived FROM customers WHERE id = @id LIMIT 1;";
                        using (var cmd = new SQLiteCommand(getBalSql, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@id", customerId);
                            using (var reader = cmd.ExecuteReader())
                            {
                                if (!reader.Read())
                                {
                                    throw new InvalidOperationException("العميل غير موجود في النظام");
                                }
                                currentBalance = Convert.ToInt64(reader["balance_piasters"]);
                                isArchived = Convert.ToInt32(reader["is_archived"]) == 1;
                            }
                        }

                        if (isArchived)
                        {
                            throw new InvalidOperationException("لا يمكن إلغاء سداد لعميل مؤرشف. يرجى إلغاء أرشفة العميل أولاً.");
                        }

                        // 2. Fetch original payment entry
                        long paymentAmount = 0;
                        string origPaymentMethod = "cash";
                        string origDigitalAccountId = null;
                        string getEntrySql = "SELECT type, amount_piasters, payment_method, digital_account_id FROM customer_ledger WHERE id = @lid AND customer_id = @cid LIMIT 1;";
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
                                if (HasColumn(reader, "payment_method") && reader["payment_method"] != DBNull.Value)
                                {
                                    origPaymentMethod = reader["payment_method"].ToString().ToLowerInvariant();
                                }
                                if (HasColumn(reader, "digital_account_id") && reader["digital_account_id"] != DBNull.Value)
                                {
                                    origDigitalAccountId = reader["digital_account_id"].ToString();
                                }
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

                        // Closed day protection
                        var currentBDate = Services.BusinessDayHelper.GetCurrentBusinessDate(conn, trans);
                        if (Services.BusinessDayHelper.IsBusinessDayClosed(conn, trans, currentBDate))
                        {
                            throw new InvalidOperationException("لا يمكن إلغاء دفعة نقدية لتاريخ عمل تم إقفاله وتشميعه مسبقاً.");
                        }

                        bool isDigitalPayment = origPaymentMethod == "wallet" || origPaymentMethod == "instapay" || origPaymentMethod == "vodafone_cash";
                        if (isDigitalPayment && !string.IsNullOrEmpty(origDigitalAccountId))
                        {
                            long accBal = 0;
                            string accName = "المحفظة / الحساب الإلكتروني";
                            using (var accCmd = new SQLiteCommand("SELECT name, balance_piasters FROM digital_accounts WHERE id = @id LIMIT 1;", conn, trans))
                            {
                                accCmd.Parameters.AddWithValue("@id", origDigitalAccountId);
                                using (var aRdr = accCmd.ExecuteReader())
                                {
                                    if (aRdr.Read())
                                    {
                                        accName = aRdr["name"] != DBNull.Value ? aRdr["name"].ToString() : "المحفظة";
                                        accBal = Convert.ToInt64(aRdr["balance_piasters"]);
                                    }
                                }
                            }

                            if (accBal < paymentAmount)
                            {
                                throw new InvalidOperationException(string.Format("رصيد {0} الحالي ({1:N2} ج.م) غير كافٍ لإلغاء هذه الدفعة الإلكترونية واستردادها ({2:N2} ج.م).", accName, accBal / 100.0, paymentAmount / 100.0));
                            }

                            using (var uAccCmd = new SQLiteCommand("UPDATE digital_accounts SET balance_piasters = balance_piasters - @amt, updated_at = @now WHERE id = @id;", conn, trans))
                            {
                                uAccCmd.Parameters.AddWithValue("@amt", paymentAmount);
                                uAccCmd.Parameters.AddWithValue("@now", DateTime.UtcNow.ToString("o"));
                                uAccCmd.Parameters.AddWithValue("@id", origDigitalAccountId);
                                uAccCmd.ExecuteNonQuery();
                            }

                            string revDtxId = "dtx_rev_" + Guid.NewGuid().ToString("N").Substring(0, 12);
                            using (var insDtxCmd = new SQLiteCommand(@"
                                INSERT INTO digital_transactions (
                                    id, account_id, tx_type, amount_piasters, profit_piasters, total_collected_piasters,
                                    customer_name, cashier_name, payment_destination, status, notes, created_at
                                ) VALUES (
                                    @id, @accId, 'payment_cancellation', @amt, 0, @amt,
                                    @cName, @cashier, 'wallet', 'completed', @notes, @now
                                );
                            ", conn, trans))
                            {
                                insDtxCmd.Parameters.AddWithValue("@id", revDtxId);
                                insDtxCmd.Parameters.AddWithValue("@accId", origDigitalAccountId);
                                insDtxCmd.Parameters.AddWithValue("@amt", -paymentAmount);
                                insDtxCmd.Parameters.AddWithValue("@cName", "");
                                insDtxCmd.Parameters.AddWithValue("@cashier", string.IsNullOrWhiteSpace(userName) ? "الكاشير" : userName.Trim());
                                insDtxCmd.Parameters.AddWithValue("@notes", "إلغاء دفعة إلكترونية: " + ledgerEntryId);
                                insDtxCmd.Parameters.AddWithValue("@now", DateTime.UtcNow.ToString("o"));
                                insDtxCmd.ExecuteNonQuery();
                            }
                        }
                        else
                        {
                            // Drawer cash balance protection for cash payments
                            if (RafiqPOS.Services.DatabaseService.DailyClosing != null)
                            {
                                var liveBal = RafiqPOS.Services.DatabaseService.DailyClosing.GetLiveDrawerBalance(currentBDate.ToString("yyyy-MM-dd"));
                                if (liveBal != null && liveBal.AvailableCashPiasters < paymentAmount)
                                {
                                    throw new InvalidOperationException(string.Format(
                                        "رصيد نقدية الدرج المتاح حالياً ({0:N2} ج.م) غير كافٍ لإلغاء هذه الدفعة النقدية واستردادها ({1:N2} ج.م).",
                                        liveBal.AvailableCashPiasters / 100.0, paymentAmount / 100.0));
                                }
                            }
                        }

                        // 4. Calculate restored balance (reversing payment restores debt)
                        long newBalance = currentBalance + paymentAmount;
                        string now = DateTime.UtcNow.ToString("o");

                        // Revert any invoice allocations linked to this payment (Requirement 4)
                        var allocatedPmts = new List<Tuple<string, string, long>>();
                        string getAllocPmtsSql = "SELECT id, sale_id, amount_piasters FROM payments WHERE id LIKE 'pmt_settle_' || @lid || '%';";
                        using (var pCmd = new SQLiteCommand(getAllocPmtsSql, conn, trans))
                        {
                            pCmd.Parameters.AddWithValue("@lid", ledgerEntryId);
                            using (var pReader = pCmd.ExecuteReader())
                            {
                                while (pReader.Read())
                                {
                                    allocatedPmts.Add(new Tuple<string, string, long>(
                                        pReader["id"].ToString(),
                                        pReader["sale_id"].ToString(),
                                        Convert.ToInt64(pReader["amount_piasters"])
                                    ));
                                }
                            }
                        }

                        // Delete debt allocations for this cancelled payment (F-25)
                        string delAllocSql = "DELETE FROM debt_allocations WHERE ledger_id = @lid;";
                        using (var dCmd = new SQLiteCommand(delAllocSql, conn, trans))
                        {
                            dCmd.Parameters.AddWithValue("@lid", ledgerEntryId);
                            dCmd.ExecuteNonQuery();
                        }

                        for (int i = 0; i < allocatedPmts.Count; i++)
                        {
                            var ap = allocatedPmts[i];
                            string delPmtSql = "DELETE FROM payments WHERE id = @pid;";
                            using (var dCmd = new SQLiteCommand(delPmtSql, conn, trans))
                            {
                                dCmd.Parameters.AddWithValue("@pid", ap.Item1);
                                dCmd.ExecuteNonQuery();
                            }
                        }

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

                        string cancelShiftId = null;
                        using (var shiftCmd = new SQLiteCommand("SELECT id FROM shifts WHERE status = 'open' ORDER BY opened_at DESC LIMIT 1;", conn, trans))
                        {
                            object openShiftId = shiftCmd.ExecuteScalar();
                            if (openShiftId != null && openShiftId != DBNull.Value)
                            {
                                cancelShiftId = openShiftId.ToString();
                            }
                        }

                        string ledgerSql = @"
                            INSERT INTO customer_ledger (id, customer_id, type, sale_id, amount_piasters, balance_after_piasters, notes, shift_id, payment_method, digital_account_id, created_at)
                            VALUES (@lid, @cid, 'payment_cancel', @origLid, @amt, @after, @notes, @shiftId, @pm, @daId, @cat);
                        ";
                        using (var cmd = new SQLiteCommand(ledgerSql, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@lid", "led_rev_" + Guid.NewGuid().ToString("N").Substring(0, 12));
                            cmd.Parameters.AddWithValue("@cid", customerId);
                            cmd.Parameters.AddWithValue("@origLid", ledgerEntryId);
                            cmd.Parameters.AddWithValue("@amt", paymentAmount);
                            cmd.Parameters.AddWithValue("@after", newBalance);
                            cmd.Parameters.AddWithValue("@notes", notesFormatted);
                            cmd.Parameters.AddWithValue("@shiftId", (object)cancelShiftId ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@pm", origPaymentMethod);
                            cmd.Parameters.AddWithValue("@daId", (object)origDigitalAccountId ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@cat", now);
                            cmd.ExecuteNonQuery();
                        }

                        // 7. Insert audit log with full cryptographic chaining (Feature #169)
                        _auditRepo.Log(conn, trans, new AuditLog
                        {
                            Id = "aud_" + Guid.NewGuid().ToString("N"),
                            UserId = user,
                            Action = "cancel_payment",
                            EntityType = "customer_ledger",
                            EntityId = ledgerEntryId,
                            DetailsJson = string.Format("{{\"cancelledAmountPiasters\":{0},\"restoredBalance\":{1},\"reason\":\"{2}\"}}", paymentAmount, newBalance, rsn.Replace("\"", "\\\"")),
                            CreatedAt = now
                        });

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

        private static string CurrentAuditUserId()
        {
            var sessionUser = RafiqPOS.Services.SecurityService.CurrentUser;
            return sessionUser != null ? sessionUser.Id : "usr_admin_default";
        }

        private static bool HasCustomerPermission(string permKey)
        {
            var sessionUser = RafiqPOS.Services.SecurityService.CurrentUser;
            if (sessionUser != null)
            {
                if (RafiqPOS.Services.DatabaseService.Security != null)
                {
                    return RafiqPOS.Services.DatabaseService.Security.HasPermission(sessionUser.Id, permKey);
                }
                var perms = RafiqPOS.Services.SecurityService.GetPermissionsForRole(sessionUser.Role);
                bool val;
                if (perms.TryGetValue(permKey, out val)) return val;
                return false;
            }
            return true;
        }

        /// <summary>
        /// Single source of truth for how each customer_ledger entry changes the customer's balance
        /// (positive = debt increases). Used by statements and balance verification (Audit F-20/F-21/F-22).
        /// </summary>
        public static long GetLedgerBalanceEffect(string type, long amountPiasters, long balanceAfterPiasters)
        {
            string t = (type ?? "").ToLowerInvariant();
            long abs = Math.Abs(amountPiasters);
            switch (t)
            {
                case "opening_balance":
                    // Stored as absolute (manual) or signed (import); the opening entry's balance_after carries the sign.
                    return balanceAfterPiasters < 0 ? -abs : abs;
                case "sale":
                case "debt_increase":
                case "payment_cancel":
                    return abs;
                case "payment":
                case "refund":
                case "debt_decrease":
                case "deposit":
                    return -abs;
                case "cancellation":
                    // Stored signed: -debt when a credit sale is cancelled, +excess when a deposit is reversed.
                    return amountPiasters;
                default:
                    return 0;
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
                                ShiftId = HasColumn(reader, "shift_id") && reader["shift_id"] != DBNull.Value ? reader["shift_id"].ToString() : null,
                                PaymentMethod = HasColumn(reader, "payment_method") && reader["payment_method"] != DBNull.Value ? reader["payment_method"].ToString() : null,
                                DigitalAccountId = HasColumn(reader, "digital_account_id") && reader["digital_account_id"] != DBNull.Value ? reader["digital_account_id"].ToString() : null,
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
                                ShiftId = HasColumn(reader, "shift_id") && reader["shift_id"] != DBNull.Value ? reader["shift_id"].ToString() : null,
                                PaymentMethod = HasColumn(reader, "payment_method") && reader["payment_method"] != DBNull.Value ? reader["payment_method"].ToString() : null,
                                DigitalAccountId = HasColumn(reader, "digital_account_id") && reader["digital_account_id"] != DBNull.Value ? reader["digital_account_id"].ToString() : null,
                                CreatedAt = reader["created_at"].ToString()
                            };

                            string entryType = (entry.Type ?? "").ToLowerInvariant();
                            string entryDate = entry.CreatedAt != null && entry.CreatedAt.Length >= 10 ? entry.CreatedAt.Substring(0, 10) : "";
                            long effect = GetLedgerBalanceEffect(entry.Type, entry.AmountPiasters, entry.BalanceAfterPiasters);

                            // Opening balance entry is ALWAYS an opening balance, not a new period transaction
                            if (entryType == "opening_balance")
                            {
                                runningOpening += effect;
                                report.Entries.Add(entry);
                                continue;
                            }

                            // If strictly prior to start date, factor into opening balance
                            if (!string.IsNullOrWhiteSpace(startDate) && string.Compare(entryDate, startDate, StringComparison.Ordinal) < 0)
                            {
                                runningOpening += effect;
                                continue;
                            }

                            // If strictly after end date, ignore
                            if (!string.IsNullOrWhiteSpace(endDate) && string.Compare(entryDate, endDate, StringComparison.Ordinal) > 0)
                            {
                                continue;
                            }

                            if (entryType == "sale" || entryType == "debt_increase")
                            {
                                report.PeriodDebitsPiasters += Math.Abs(entry.AmountPiasters);
                            }
                            else if (entryType == "payment" || entryType == "deposit")
                            {
                                report.PeriodCreditsPiasters += Math.Abs(entry.AmountPiasters);
                            }
                            else if (entryType == "payment_cancel")
                            {
                                report.PeriodCreditsPiasters -= Math.Abs(entry.AmountPiasters);
                            }
                            else if (entryType == "refund" || entryType == "debt_decrease")
                            {
                                report.PeriodRefundsPiasters += Math.Abs(entry.AmountPiasters);
                            }
                            else if (entryType == "cancellation")
                            {
                                if (effect < 0) report.PeriodDebitsPiasters -= Math.Abs(entry.AmountPiasters);
                                else report.PeriodCreditsPiasters -= Math.Abs(entry.AmountPiasters);
                            }
                            else
                            {
                                if (effect > 0) report.PeriodDebitsPiasters += effect;
                                else if (effect < 0) report.PeriodCreditsPiasters += -effect;
                            }

                            report.Entries.Add(entry);
                        }

                        report.OpeningBalancePiasters = runningOpening;
                        report.ClosingBalancePiasters = runningOpening + report.PeriodDebitsPiasters - report.PeriodCreditsPiasters - report.PeriodRefundsPiasters;
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
                string ledgerSql = "SELECT type, amount_piasters, balance_after_piasters FROM customer_ledger WHERE customer_id = @id ORDER BY created_at ASC;";
                using (var cmd = new SQLiteCommand(ledgerSql, conn))
                {
                    cmd.Parameters.AddWithValue("@id", customerId);
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            entriesCount++;
                            calculatedBalance += GetLedgerBalanceEffect(
                                reader["type"].ToString(),
                                Convert.ToInt64(reader["amount_piasters"]),
                                Convert.ToInt64(reader["balance_after_piasters"]));
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
                // The ledger is the source of truth; the cached balance is realigned to it and the
                // correction is recorded in the tamper-evident audit log inside the same transaction (Audit F-23).
                using (var conn = new SQLiteConnection(_connectionString))
                {
                    conn.Open();
                    using (var trans = conn.BeginTransaction())
                    {
                        try
                        {
                            using (var cmd = new SQLiteCommand("UPDATE customers SET balance_piasters = @bal WHERE id = @id;", conn, trans))
                            {
                                cmd.Parameters.AddWithValue("@bal", verify.CalculatedBalancePiasters);
                                cmd.Parameters.AddWithValue("@id", customerId);
                                cmd.ExecuteNonQuery();
                            }

                            if (_auditRepo != null)
                            {
                                string userId = CurrentAuditUserId();
                                _auditRepo.Log(conn, trans, new AuditLog
                                {
                                    Id = "aud_" + Guid.NewGuid().ToString("N"),
                                    UserId = userId,
                                    Action = "customer_balance_realign",
                                    EntityType = "customer",
                                    EntityId = customerId,
                                    DetailsJson = string.Format("{{\"storedBalance\":{0},\"ledgerBalance\":{1},\"discrepancy\":{2}}}",
                                        verify.StoredBalancePiasters, verify.CalculatedBalancePiasters, verify.DiscrepancyPiasters),
                                    CreatedAt = DateTime.UtcNow.ToString("o")
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

                        // 1. Preload existing phones to eliminate N+1 queries during bulk import
                        var existingPhones = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                        using (var loadPhonesCmd = new SQLiteCommand("SELECT phone FROM customers WHERE phone IS NOT NULL AND phone != '';", conn, trans))
                        {
                            using (var rdr = loadPhonesCmd.ExecuteReader())
                            {
                                while (rdr.Read())
                                {
                                    string p = rdr["phone"].ToString().Trim().Replace(" ", "").Replace("-", "");
                                    if (!string.IsNullOrEmpty(p))
                                    {
                                        existingPhones.Add(p);
                                    }
                                }
                            }
                        }

                        string insertSql = @"
                            INSERT INTO customers (id, name, phone, balance_piasters, credit_limit_piasters, created_at)
                            VALUES (@id, @name, @phone, @balance, @limit, @created_at);
                        ";

                        string ledgerSql = @"
                            INSERT INTO customer_ledger (id, customer_id, type, sale_id, amount_piasters, balance_after_piasters, notes, created_at)
                            VALUES (@lid, @cid, 'opening_balance', NULL, @amt, @after, @notes, @cat);
                        ";

                        using (var insCmd = new SQLiteCommand(insertSql, conn, trans))
                        using (var lCmd = new SQLiteCommand(ledgerSql, conn, trans))
                        {
                            insCmd.Parameters.Add("@id", System.Data.DbType.String);
                            insCmd.Parameters.Add("@name", System.Data.DbType.String);
                            insCmd.Parameters.Add("@phone", System.Data.DbType.String);
                            insCmd.Parameters.Add("@balance", System.Data.DbType.Int64);
                            insCmd.Parameters.Add("@limit", System.Data.DbType.Int64);
                            insCmd.Parameters.Add("@created_at", System.Data.DbType.String);

                            lCmd.Parameters.Add("@lid", System.Data.DbType.String);
                            lCmd.Parameters.Add("@cid", System.Data.DbType.String);
                            lCmd.Parameters.Add("@amt", System.Data.DbType.Int64);
                            lCmd.Parameters.Add("@after", System.Data.DbType.Int64);
                            lCmd.Parameters.Add("@notes", System.Data.DbType.String);
                            lCmd.Parameters.Add("@cat", System.Data.DbType.String);

                            foreach (var row in rows)
                            {
                                if (!row.IsValid || string.IsNullOrWhiteSpace(row.Name))
                                {
                                    result.SkippedCount++;
                                    continue;
                                }

                                string cleanPhone = (row.Phone ?? "").Trim().Replace(" ", "").Replace("-", "");

                                // Check phone uniqueness using in-memory set (instant O(1))
                                if (!string.IsNullOrEmpty(cleanPhone))
                                {
                                    if (existingPhones.Contains(cleanPhone))
                                    {
                                        result.SkippedCount++;
                                        continue;
                                    }
                                    existingPhones.Add(cleanPhone);
                                }

                                string customerId = "cust_" + Guid.NewGuid().ToString("N").Substring(0, 12);

                                insCmd.Parameters["@id"].Value = customerId;
                                insCmd.Parameters["@name"].Value = row.Name.Trim();
                                insCmd.Parameters["@phone"].Value = cleanPhone;
                                insCmd.Parameters["@balance"].Value = row.InitialBalancePiasters;
                                insCmd.Parameters["@limit"].Value = row.CreditLimitPiasters > 0 ? row.CreditLimitPiasters : 100000;
                                insCmd.Parameters["@created_at"].Value = now;
                                insCmd.ExecuteNonQuery();

                                if (row.InitialBalancePiasters != 0)
                                {
                                    string note = string.IsNullOrWhiteSpace(row.Notes)
                                        ? "رصيد افتتاحي (استيراد إكسل)"
                                        : ("رصيد افتتاحي: " + row.Notes.Trim());

                                    lCmd.Parameters["@lid"].Value = "led_" + Guid.NewGuid().ToString("N").Substring(0, 12);
                                    lCmd.Parameters["@cid"].Value = customerId;
                                    lCmd.Parameters["@amt"].Value = Math.Abs(row.InitialBalancePiasters);
                                    lCmd.Parameters["@after"].Value = row.InitialBalancePiasters;
                                    lCmd.Parameters["@notes"].Value = note;
                                    lCmd.Parameters["@cat"].Value = now;
                                    lCmd.ExecuteNonQuery();

                                    if (row.InitialBalancePiasters > 0)
                                    {
                                        result.TotalOpeningDebtsPiasters += row.InitialBalancePiasters;
                                    }
                                }

                                result.ImportedCount++;
                            }
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
            bool isArchived = false;
            try
            {
                int ordinal = reader.GetOrdinal("is_archived");
                if (!reader.IsDBNull(ordinal))
                {
                    isArchived = Convert.ToInt32(reader["is_archived"]) == 1;
                }
            }
            catch
            {
                // Column may not exist yet in older databases
            }

            return new Customer
            {
                Id = reader["id"].ToString(),
                Name = reader["name"].ToString(),
                Phone = reader["phone"] != DBNull.Value ? reader["phone"].ToString() : "",
                BalancePiasters = Convert.ToInt64(reader["balance_piasters"]),
                CreditLimitPiasters = Convert.ToInt64(reader["credit_limit_piasters"]),
                CreatedAt = reader["created_at"].ToString(),
                IsArchived = isArchived
            };
        }

        /// <summary>
        /// أرشفة العميل (Soft Delete) — يُخفي من القوائم لكن يبقى في قاعدة البيانات
        /// للحفاظ على سلامة السجلات المالية والفواتير المرتبطة.
        /// يمنع أرشفة: (1) العميل النقدي العام, (2) عميل عليه رصيد دين نشط.
        /// </summary>
        public void ArchiveCustomer(string customerId)
        {
            if (string.IsNullOrWhiteSpace(customerId))
            {
                throw new ArgumentException("معرف العميل مفقود");
            }

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();

                if (customerId == "cust_general_cash")
                {
                    throw new InvalidOperationException("لا يمكن أرشفة أو حذف العميل النقدي العام الافتراضي للنظام.");
                }

                // 2. Fetch current customer
                Customer cust = null;
                using (var cmd = new SQLiteCommand("SELECT * FROM customers WHERE id = @id LIMIT 1;", conn))
                {
                    cmd.Parameters.AddWithValue("@id", customerId);
                    using (var reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            cust = MapReaderToCustomer(reader);
                        }
                    }
                }

                if (cust == null)
                {
                    throw new InvalidOperationException("العميل غير موجود في قاعدة البيانات");
                }

                // 3. Block archive if customer has active balance (debt or advance credit)
                if (cust.BalancePiasters > 0)
                {
                    throw new InvalidOperationException(
                        string.Format("لا يمكن أرشفة العميل \"{0}\" لأن عليه رصيد دين مستحق ({1}). يجب تسوية حسابه أولاً.",
                            cust.Name, Common.Money.FormatPiasters(cust.BalancePiasters)));
                }
                if (cust.BalancePiasters < 0)
                {
                    throw new InvalidOperationException(
                        string.Format("لا يمكن أرشفة العميل \"{0}\" لأن له رصيد دائن / أمانات مستحقة ({1}). يجب تسوية حسابه أولاً.",
                            cust.Name, Common.Money.FormatPiasters(Math.Abs(cust.BalancePiasters))));
                }

                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        // 4. Set archived flag
                        using (var cmd = new SQLiteCommand(
                            "UPDATE customers SET is_archived = 1 WHERE id = @id;", conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@id", customerId);
                            cmd.ExecuteNonQuery();
                        }

                        // 5. Audit log inside the same atomic transaction (Senior Rule 2)
                        if (_auditRepo != null)
                        {
                            try
                            {
                                _auditRepo.Log(conn, trans, new AuditLog
                                {
                                    Action = "customer_archive",
                                    EntityType = "customer",
                                    EntityId = customerId,
                                    DetailsJson = string.Format("{{\"customerName\":\"{0}\",\"phone\":\"{1}\"}}",
                                        (cust.Name ?? "").Replace("\"", ""), (cust.Phone ?? "").Replace("\"", ""))
                                });
                            }
                            catch
                            {
                                // Audit failure should not block the archive operation
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

        public static long GetInvoiceOutstanding(SQLiteConnection conn, SQLiteTransaction trans, string saleId)
        {
            using (var cmd = conn.CreateCommand())
            {
                cmd.Transaction = trans;
                cmd.CommandText = @"
                    SELECT s.total_piasters - (s.paid_piasters - COALESCE(s.service_fee_piasters, 0)) -
                        COALESCE((SELECT SUM(da.amount_piasters) FROM debt_allocations da
                                  WHERE da.sale_id = s.id AND da.type = 'payment'), 0) +
                        COALESCE((SELECT SUM(da.amount_piasters) FROM debt_allocations da
                                  WHERE da.sale_id = s.id AND da.type = 'refund'), 0)
                    FROM sales s WHERE s.id = @sid";
                cmd.Parameters.AddWithValue("@sid", saleId);
                object result = cmd.ExecuteScalar();
                if (result == null || result == DBNull.Value) return 0;
                return Convert.ToInt64(result);
            }
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
