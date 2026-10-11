using System;
using System.Collections.Generic;
using System.Data.SQLite;
using RafiqPOS.Models;

namespace RafiqPOS.Repositories
{
    public class EpayRepository
    {
        private readonly string _connectionString;

        public EpayRepository(string connectionString)
        {
            _connectionString = connectionString;
        }

        public List<EpayTerminal> GetAllTerminals()
        {
            var list = new List<EpayTerminal>();
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = "SELECT * FROM epay_terminals ORDER BY is_active DESC, name ASC;";
                using (var cmd = new SQLiteCommand(sql, conn))
                using (var reader = cmd.ExecuteReader())
                {
                    while (reader.Read())
                    {
                        list.Add(MapReaderToTerminal(reader));
                    }
                }
            }
            return list;
        }

        public EpayTerminal GetTerminalById(string id)
        {
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = "SELECT * FROM epay_terminals WHERE id = @id LIMIT 1;";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@id", id);
                    using (var reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            return MapReaderToTerminal(reader);
                        }
                    }
                }
            }
            return null;
        }

        public EpayTerminal SaveTerminal(EpayTerminal terminal)
        {
            if (terminal == null) return null;
            if (string.IsNullOrWhiteSpace(terminal.Id))
            {
                terminal.Id = Guid.NewGuid().ToString();
            }
            string now = DateTime.UtcNow.ToString("o");

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    INSERT INTO epay_terminals (
                        id, name, provider, terminal_code, balance_piasters, low_balance_alert_piasters, is_active,
                        customer_fee_type, customer_fee_value, provider_commission_type, provider_commission_value,
                        created_at, updated_at
                    ) VALUES (
                        @id, @name, @provider, @terminalCode, @balance, @lowAlert, @isActive,
                        @feeType, @feeVal, @commType, @commVal,
                        @now, @now
                    )
                    ON CONFLICT(id) DO UPDATE SET
                        name = @name,
                        provider = @provider,
                        terminal_code = @terminalCode,
                        low_balance_alert_piasters = @lowAlert,
                        is_active = @isActive,
                        customer_fee_type = @feeType,
                        customer_fee_value = @feeVal,
                        provider_commission_type = @commType,
                        provider_commission_value = @commVal,
                        updated_at = @now;
                ";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@id", terminal.Id);
                    cmd.Parameters.AddWithValue("@name", terminal.Name ?? "ماكينة دفع");
                    cmd.Parameters.AddWithValue("@provider", terminal.Provider ?? "super_pay");
                    cmd.Parameters.AddWithValue("@terminalCode", (object)terminal.TerminalCode ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@balance", terminal.BalancePiasters);
                    cmd.Parameters.AddWithValue("@lowAlert", terminal.LowBalanceAlertPiasters > 0 ? terminal.LowBalanceAlertPiasters : 50000);
                    cmd.Parameters.AddWithValue("@isActive", terminal.IsActive ? 1 : 0);
                    cmd.Parameters.AddWithValue("@feeType", !string.IsNullOrWhiteSpace(terminal.CustomerFeeType) ? terminal.CustomerFeeType : "fixed");
                    cmd.Parameters.AddWithValue("@feeVal", terminal.CustomerFeeValue >= 0 ? terminal.CustomerFeeValue : 200);
                    cmd.Parameters.AddWithValue("@commType", !string.IsNullOrWhiteSpace(terminal.ProviderCommissionType) ? terminal.ProviderCommissionType : "fixed");
                    cmd.Parameters.AddWithValue("@commVal", terminal.ProviderCommissionValue >= 0 ? terminal.ProviderCommissionValue : 100);
                    cmd.Parameters.AddWithValue("@now", now);
                    cmd.ExecuteNonQuery();
                }
            }
            return GetTerminalById(terminal.Id);
        }

        public EpayTerminalFunding FundTerminal(string terminalId, long amountPiasters, string fundingSource, string notes, string createdBy)
        {
            if (amountPiasters <= 0)
            {
                throw new ArgumentException("مبلغ تغذية رصيد الماكينة يجب أن يكون أكبر من الصفر");
            }

            string now = DateTime.UtcNow.ToString("o");
            string fundingId = Guid.NewGuid().ToString();
            long prevBal = 0;
            long newBal = 0;
            string termName = "";

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        // 1. Get current balance
                        string getSql = "SELECT name, balance_piasters FROM epay_terminals WHERE id = @id LIMIT 1;";
                        using (var cmd = new SQLiteCommand(getSql, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@id", terminalId);
                            using (var reader = cmd.ExecuteReader())
                            {
                                if (!reader.Read())
                                {
                                    throw new InvalidOperationException("الماكينة غير موجودة بالسيستم");
                                }
                                termName = reader["name"].ToString();
                                prevBal = Convert.ToInt64(reader["balance_piasters"]);
                            }
                        }

                        newBal = prevBal + amountPiasters;

                        // 2. Update terminal balance
                        string updateSql = "UPDATE epay_terminals SET balance_piasters = @newBal, updated_at = @now WHERE id = @id;";
                        using (var cmd = new SQLiteCommand(updateSql, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@newBal", newBal);
                            cmd.Parameters.AddWithValue("@now", now);
                            cmd.Parameters.AddWithValue("@id", terminalId);
                            cmd.ExecuteNonQuery();
                        }

                        // 3. Insert funding record
                        string insertSql = @"
                            INSERT INTO epay_terminal_fundings (
                                id, terminal_id, amount_piasters, funding_source, previous_balance_piasters, new_balance_piasters, notes, created_by, created_at
                            ) VALUES (
                                @id, @termId, @amt, @src, @prevBal, @newBal, @notes, @createdBy, @now
                            );
                        ";
                        using (var cmd = new SQLiteCommand(insertSql, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@id", fundingId);
                            cmd.Parameters.AddWithValue("@termId", terminalId);
                            cmd.Parameters.AddWithValue("@amt", amountPiasters);
                            cmd.Parameters.AddWithValue("@src", fundingSource ?? "cash_drawer");
                            cmd.Parameters.AddWithValue("@prevBal", prevBal);
                            cmd.Parameters.AddWithValue("@newBal", newBal);
                            cmd.Parameters.AddWithValue("@notes", (object)notes ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@createdBy", (object)createdBy ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@now", now);
                            cmd.ExecuteNonQuery();
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

            return new EpayTerminalFunding
            {
                Id = fundingId,
                TerminalId = terminalId,
                TerminalName = termName,
                AmountPiasters = amountPiasters,
                FundingSource = fundingSource,
                PreviousBalancePiasters = prevBal,
                NewBalancePiasters = newBal,
                Notes = notes,
                CreatedBy = createdBy,
                CreatedAt = now
            };
        }

        public EpayTransaction CreateTransaction(EpayTransaction tx)
        {
            if (tx == null) throw new ArgumentNullException("tx");
            if (string.IsNullOrWhiteSpace(tx.TerminalId))
            {
                throw new ArgumentException("يجب تحديد ماكينة الدفع الإلكتروني");
            }
            if (string.IsNullOrWhiteSpace(tx.Id))
            {
                tx.Id = Guid.NewGuid().ToString();
            }

            string now = DateTime.UtcNow.ToString("o");
            tx.CreatedAt = now;
            tx.Status = string.IsNullOrWhiteSpace(tx.Status) ? "completed" : tx.Status;

            // Financial Calculations
            tx.TotalReceivedPiasters = tx.BillAmountPiasters + tx.CustomerFeePiasters;
            tx.NetProfitPiasters = tx.CustomerFeePiasters + tx.ProviderCommissionPiasters;

            // Machine deducted amount: usually bill amount minus provider commission (or bill amount)
            if (tx.ServiceType == "cash_out")
            {
                tx.MachineDeductedPiasters = 0;
            }
            else if (tx.MachineDeductedPiasters <= 0)
            {
                tx.MachineDeductedPiasters = Math.Max(0, tx.BillAmountPiasters - tx.ProviderCommissionPiasters);
            }

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        // 1. Get terminal info and check balance
                        string getTermSql = "SELECT name, balance_piasters FROM epay_terminals WHERE id = @id LIMIT 1;";
                        using (var cmd = new SQLiteCommand(getTermSql, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@id", tx.TerminalId);
                            using (var reader = cmd.ExecuteReader())
                            {
                                if (!reader.Read())
                                {
                                    throw new InvalidOperationException("ماكينة الدفع المحددة غير موجودة");
                                }
                                tx.TerminalName = reader["name"].ToString();
                            }
                        }

                        // 2. Adjust terminal balance atomically
                        // For topups, bills, cash_in, transfer: terminal balance DECREASES by machine_deducted_piasters
                        // For cash_out (customer withdraws cash from wallet, merchant receives credit on terminal): balance INCREASES
                        long balanceDelta = 0;
                        if (tx.ServiceType == "cash_out")
                        {
                            balanceDelta = tx.BillAmountPiasters;
                        }
                        else
                        {
                            balanceDelta = -tx.MachineDeductedPiasters;
                        }

                        string updateBalSql = @"
                            UPDATE epay_terminals 
                            SET balance_piasters = balance_piasters + @delta,
                                updated_at = @now
                            WHERE id = @id;
                        ";
                        using (var cmd = new SQLiteCommand(updateBalSql, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@delta", balanceDelta);
                            cmd.Parameters.AddWithValue("@now", now);
                            cmd.Parameters.AddWithValue("@id", tx.TerminalId);
                            cmd.ExecuteNonQuery();
                        }

                        // 3. Insert transaction
                        string insertSql = @"
                            INSERT INTO epay_transactions (
                                id, terminal_id, service_type, service_name, reference_number,
                                customer_phone, customer_name, bill_amount_piasters, customer_fee_piasters,
                                total_received_piasters, machine_deducted_piasters, provider_commission_piasters,
                                net_profit_piasters, payment_channel, cashier_name, status, notes, created_at
                            ) VALUES (
                                @id, @termId, @srvType, @srvName, @refNum,
                                @phone, @cName, @billAmt, @feeAmt,
                                @totalRec, @machDed, @commAmt,
                                @netProfit, @payChan, @cashier, @status, @notes, @now
                            );
                        ";
                        using (var cmd = new SQLiteCommand(insertSql, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@id", tx.Id);
                            cmd.Parameters.AddWithValue("@termId", tx.TerminalId);
                            cmd.Parameters.AddWithValue("@srvType", tx.ServiceType ?? "other");
                            cmd.Parameters.AddWithValue("@srvName", tx.ServiceName ?? "خدمة إلكترونية");
                            cmd.Parameters.AddWithValue("@refNum", (object)tx.ReferenceNumber ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@phone", (object)tx.CustomerPhone ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@cName", (object)tx.CustomerName ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@billAmt", tx.BillAmountPiasters);
                            cmd.Parameters.AddWithValue("@feeAmt", tx.CustomerFeePiasters);
                            cmd.Parameters.AddWithValue("@totalRec", tx.TotalReceivedPiasters);
                            cmd.Parameters.AddWithValue("@machDed", tx.MachineDeductedPiasters);
                            cmd.Parameters.AddWithValue("@commAmt", tx.ProviderCommissionPiasters);
                            cmd.Parameters.AddWithValue("@netProfit", tx.NetProfitPiasters);
                            cmd.Parameters.AddWithValue("@payChan", tx.PaymentChannel ?? "cash_drawer");
                            cmd.Parameters.AddWithValue("@cashier", (object)tx.CashierName ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@status", tx.Status);
                            cmd.Parameters.AddWithValue("@notes", (object)tx.Notes ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@now", now);
                            cmd.ExecuteNonQuery();
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

            return tx;
        }

        public List<EpayTransaction> GetTransactions(string terminalId, string serviceType, string fromDate, string toDate, int limit)
        {
            var list = new List<EpayTransaction>();
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                var whereClauses = new List<string>();
                whereClauses.Add("1=1");

                if (!string.IsNullOrWhiteSpace(terminalId))
                {
                    whereClauses.Add("t.terminal_id = @termId");
                }
                if (!string.IsNullOrWhiteSpace(serviceType) && serviceType != "all")
                {
                    whereClauses.Add("t.service_type = @srvType");
                }
                if (!string.IsNullOrWhiteSpace(fromDate))
                {
                    whereClauses.Add("t.created_at >= @fromDate");
                }
                if (!string.IsNullOrWhiteSpace(toDate))
                {
                    whereClauses.Add("t.created_at <= @toDate");
                }

                int effectiveLimit = limit > 0 ? limit : 100;

                string sql = string.Format(@"
                    SELECT t.*, m.name as terminal_name
                    FROM epay_transactions t
                    LEFT JOIN epay_terminals m ON t.terminal_id = m.id
                    WHERE {0}
                    ORDER BY t.created_at DESC
                    LIMIT {1};
                ", string.Join(" AND ", whereClauses.ToArray()), effectiveLimit);

                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    if (!string.IsNullOrWhiteSpace(terminalId)) cmd.Parameters.AddWithValue("@termId", terminalId);
                    if (!string.IsNullOrWhiteSpace(serviceType) && serviceType != "all") cmd.Parameters.AddWithValue("@srvType", serviceType);
                    if (!string.IsNullOrWhiteSpace(fromDate)) cmd.Parameters.AddWithValue("@fromDate", fromDate);
                    if (!string.IsNullOrWhiteSpace(toDate)) cmd.Parameters.AddWithValue("@toDate", toDate + "T23:59:59");

                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            list.Add(MapReaderToTransaction(reader));
                        }
                    }
                }
            }
            return list;
        }

        public List<EpayTerminalFunding> GetFundings(string terminalId, int limit)
        {
            var list = new List<EpayTerminalFunding>();
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string whereClause = !string.IsNullOrWhiteSpace(terminalId) ? "WHERE f.terminal_id = @termId" : "";
                int effectiveLimit = limit > 0 ? limit : 50;

                string sql = string.Format(@"
                    SELECT f.*, m.name as terminal_name
                    FROM epay_terminal_fundings f
                    LEFT JOIN epay_terminals m ON f.terminal_id = m.id
                    {0}
                    ORDER BY f.created_at DESC
                    LIMIT {1};
                ", whereClause, effectiveLimit);

                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    if (!string.IsNullOrWhiteSpace(terminalId)) cmd.Parameters.AddWithValue("@termId", terminalId);
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            list.Add(new EpayTerminalFunding
                            {
                                Id = reader["id"].ToString(),
                                TerminalId = reader["terminal_id"].ToString(),
                                TerminalName = reader["terminal_name"] != DBNull.Value ? reader["terminal_name"].ToString() : "",
                                AmountPiasters = Convert.ToInt64(reader["amount_piasters"]),
                                FundingSource = reader["funding_source"].ToString(),
                                PreviousBalancePiasters = Convert.ToInt64(reader["previous_balance_piasters"]),
                                NewBalancePiasters = Convert.ToInt64(reader["new_balance_piasters"]),
                                Notes = reader["notes"] != DBNull.Value ? reader["notes"].ToString() : null,
                                CreatedBy = reader["created_by"] != DBNull.Value ? reader["created_by"].ToString() : null,
                                CreatedAt = reader["created_at"].ToString()
                            });
                        }
                    }
                }
            }
            return list;
        }

        public EpayAnalyticsSummary GetAnalytics(string fromDate, string toDate)
        {
            var summary = new EpayAnalyticsSummary();
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();

                // 1. Total terminal balance
                using (var cmd = new SQLiteCommand("SELECT COALESCE(SUM(balance_piasters), 0) FROM epay_terminals WHERE is_active = 1;", conn))
                {
                    object res = cmd.ExecuteScalar();
                    summary.TotalTerminalsBalancePiasters = (res != null && res != DBNull.Value) ? Convert.ToInt64(res) : 0;
                }

                // 2. Aggregate transactions metrics
                var whereClauses = new List<string>();
                whereClauses.Add("status = 'completed'");
                if (!string.IsNullOrWhiteSpace(fromDate)) whereClauses.Add("created_at >= @fromDate");
                if (!string.IsNullOrWhiteSpace(toDate)) whereClauses.Add("created_at <= @toDate");

                string aggSql = string.Format(@"
                    SELECT 
                        COUNT(*) as total_count,
                        COALESCE(SUM(bill_amount_piasters), 0) as total_bill,
                        COALESCE(SUM(customer_fee_piasters), 0) as total_fees,
                        COALESCE(SUM(provider_commission_piasters), 0) as total_comm,
                        COALESCE(SUM(net_profit_piasters), 0) as total_profit
                    FROM epay_transactions
                    WHERE {0};
                ", string.Join(" AND ", whereClauses.ToArray()));

                using (var cmd = new SQLiteCommand(aggSql, conn))
                {
                    if (!string.IsNullOrWhiteSpace(fromDate)) cmd.Parameters.AddWithValue("@fromDate", fromDate);
                    if (!string.IsNullOrWhiteSpace(toDate)) cmd.Parameters.AddWithValue("@toDate", toDate + "T23:59:59");

                    using (var reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            summary.TotalTransactionsCount = Convert.ToInt32(reader["total_count"]);
                            summary.TotalBillVolumePiasters = Convert.ToInt64(reader["total_bill"]);
                            summary.TotalCustomerFeesPiasters = Convert.ToInt64(reader["total_fees"]);
                            summary.TotalProviderCommissionsPiasters = Convert.ToInt64(reader["total_comm"]);
                            summary.TotalNetProfitPiasters = Convert.ToInt64(reader["total_profit"]);
                        }
                    }
                }

                // 3. Today's metrics specifically
                string todayStart = DateTime.UtcNow.ToString("yyyy-MM-dd") + "T00:00:00";
                string todaySql = @"
                    SELECT 
                        COUNT(*) as today_count,
                        COALESCE(SUM(net_profit_piasters), 0) as today_profit
                    FROM epay_transactions
                    WHERE status = 'completed' AND created_at >= @todayStart;
                ";
                using (var cmd = new SQLiteCommand(todaySql, conn))
                {
                    cmd.Parameters.AddWithValue("@todayStart", todayStart);
                    using (var reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            summary.TodayTransactionsCount = Convert.ToInt32(reader["today_count"]);
                            summary.TodayNetProfitPiasters = Convert.ToInt64(reader["today_profit"]);
                        }
                    }
                }

                // 4. Breakdown by service type
                string typeSql = string.Format(@"
                    SELECT 
                        service_type,
                        COUNT(*) as count_by_type,
                        COALESCE(SUM(net_profit_piasters), 0) as profit_by_type
                    FROM epay_transactions
                    WHERE {0}
                    GROUP BY service_type;
                ", string.Join(" AND ", whereClauses.ToArray()));

                using (var cmd = new SQLiteCommand(typeSql, conn))
                {
                    if (!string.IsNullOrWhiteSpace(fromDate)) cmd.Parameters.AddWithValue("@fromDate", fromDate);
                    if (!string.IsNullOrWhiteSpace(toDate)) cmd.Parameters.AddWithValue("@toDate", toDate + "T23:59:59");

                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            string sType = reader["service_type"].ToString();
                            int c = Convert.ToInt32(reader["count_by_type"]);
                            long p = Convert.ToInt64(reader["profit_by_type"]);
                            summary.TransactionsByType[sType] = c;
                            summary.ProfitByTypePiasters[sType] = p;
                        }
                    }
                }
            }
            return summary;
        }

        private static bool HasColumn(SQLiteDataReader reader, string columnName)
        {
            for (int i = 0; i < reader.FieldCount; i++)
            {
                if (reader.GetName(i).Equals(columnName, StringComparison.OrdinalIgnoreCase))
                    return true;
            }
            return false;
        }

        private static EpayTerminal MapReaderToTerminal(SQLiteDataReader reader)
        {
            return new EpayTerminal
            {
                Id = reader["id"].ToString(),
                Name = reader["name"].ToString(),
                Provider = reader["provider"].ToString(),
                TerminalCode = reader["terminal_code"] != DBNull.Value ? reader["terminal_code"].ToString() : null,
                BalancePiasters = Convert.ToInt64(reader["balance_piasters"]),
                LowBalanceAlertPiasters = Convert.ToInt64(reader["low_balance_alert_piasters"]),
                IsActive = Convert.ToInt32(reader["is_active"]) == 1,
                CustomerFeeType = HasColumn(reader, "customer_fee_type") && reader["customer_fee_type"] != DBNull.Value ? reader["customer_fee_type"].ToString() : "fixed",
                CustomerFeeValue = HasColumn(reader, "customer_fee_value") && reader["customer_fee_value"] != DBNull.Value ? Convert.ToInt64(reader["customer_fee_value"]) : 200,
                ProviderCommissionType = HasColumn(reader, "provider_commission_type") && reader["provider_commission_type"] != DBNull.Value ? reader["provider_commission_type"].ToString() : "fixed",
                ProviderCommissionValue = HasColumn(reader, "provider_commission_value") && reader["provider_commission_value"] != DBNull.Value ? Convert.ToInt64(reader["provider_commission_value"]) : 100,
                CreatedAt = reader["created_at"].ToString(),
                UpdatedAt = reader["updated_at"].ToString()
            };
        }

        private static EpayTransaction MapReaderToTransaction(SQLiteDataReader reader)
        {
            return new EpayTransaction
            {
                Id = reader["id"].ToString(),
                TerminalId = reader["terminal_id"].ToString(),
                TerminalName = reader["terminal_name"] != DBNull.Value ? reader["terminal_name"].ToString() : "",
                ServiceType = reader["service_type"].ToString(),
                ServiceName = reader["service_name"].ToString(),
                ReferenceNumber = reader["reference_number"] != DBNull.Value ? reader["reference_number"].ToString() : null,
                CustomerPhone = reader["customer_phone"] != DBNull.Value ? reader["customer_phone"].ToString() : null,
                CustomerName = reader["customer_name"] != DBNull.Value ? reader["customer_name"].ToString() : null,
                BillAmountPiasters = Convert.ToInt64(reader["bill_amount_piasters"]),
                CustomerFeePiasters = Convert.ToInt64(reader["customer_fee_piasters"]),
                TotalReceivedPiasters = Convert.ToInt64(reader["total_received_piasters"]),
                MachineDeductedPiasters = Convert.ToInt64(reader["machine_deducted_piasters"]),
                ProviderCommissionPiasters = Convert.ToInt64(reader["provider_commission_piasters"]),
                NetProfitPiasters = Convert.ToInt64(reader["net_profit_piasters"]),
                PaymentChannel = reader["payment_channel"].ToString(),
                CashierName = reader["cashier_name"] != DBNull.Value ? reader["cashier_name"].ToString() : null,
                Status = reader["status"].ToString(),
                Notes = reader["notes"] != DBNull.Value ? reader["notes"].ToString() : null,
                CreatedAt = reader["created_at"].ToString()
            };
        }
    }
}
