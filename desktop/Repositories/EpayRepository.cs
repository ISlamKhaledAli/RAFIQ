using System;
using System.Collections.Generic;
using System.Data.SQLite;
using Newtonsoft.Json;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Repositories
{
    public class EpayRepository
    {
        private readonly string _connectionString;
        private readonly AuditLogRepository _auditRepo;

        public EpayRepository(string connectionString, AuditLogRepository auditRepo = null)
        {
            _connectionString = connectionString;
            _auditRepo = auditRepo ?? new AuditLogRepository(connectionString);
        }

        public List<EpayTerminal> GetAllTerminals(bool includeInactive = false)
        {
            var list = new List<EpayTerminal>();
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = includeInactive 
                    ? "SELECT * FROM epay_terminals ORDER BY is_active DESC, name ASC;"
                    : "SELECT * FROM epay_terminals WHERE is_active = 1 ORDER BY name ASC;";
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

            string rulesJson = null;
            if (!string.IsNullOrWhiteSpace(terminal.ServiceFeeRulesJson))
            {
                rulesJson = terminal.ServiceFeeRulesJson;
            }
            else if (terminal.ServiceFeeRules != null && terminal.ServiceFeeRules.Count > 0)
            {
                try
                {
                    rulesJson = JsonConvert.SerializeObject(terminal.ServiceFeeRules);
                }
                catch { }
            }

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        long existingBal = 0;
                        bool exists = false;
                        string checkSql = "SELECT balance_piasters FROM epay_terminals WHERE id = @id LIMIT 1;";
                        using (var checkCmd = new SQLiteCommand(checkSql, conn, trans))
                        {
                            checkCmd.Parameters.AddWithValue("@id", terminal.Id);
                            using (var reader = checkCmd.ExecuteReader())
                            {
                                if (reader.Read())
                                {
                                    exists = true;
                                    existingBal = Convert.ToInt64(reader["balance_piasters"]);
                                }
                            }
                        }

                        if (!exists)
                        {
                            string insertSql = @"
                                INSERT INTO epay_terminals (
                                    id, name, provider, terminal_code, balance_piasters, low_balance_alert_piasters, is_active,
                                    customer_fee_type, customer_fee_value, customer_fee_min_piasters, customer_fee_max_piasters,
                                    provider_commission_type, provider_commission_value, provider_commission_min_piasters, provider_commission_max_piasters,
                                    service_fee_rules_json,
                                    created_at, updated_at
                                ) VALUES (
                                    @id, @name, @provider, @terminalCode, @balance, @lowAlert, @isActive,
                                    @feeType, @feeVal, @feeMin, @feeMax,
                                    @commType, @commVal, @commMin, @commMax,
                                    @rulesJson,
                                    @now, @now
                                );";
                            using (var cmd = new SQLiteCommand(insertSql, conn, trans))
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
                                cmd.Parameters.AddWithValue("@feeMin", terminal.CustomerFeeMinPiasters >= 0 ? terminal.CustomerFeeMinPiasters : 0);
                                cmd.Parameters.AddWithValue("@feeMax", terminal.CustomerFeeMaxPiasters >= 0 ? terminal.CustomerFeeMaxPiasters : 0);
                                cmd.Parameters.AddWithValue("@commType", !string.IsNullOrWhiteSpace(terminal.ProviderCommissionType) ? terminal.ProviderCommissionType : "fixed");
                                cmd.Parameters.AddWithValue("@commVal", terminal.ProviderCommissionValue >= 0 ? terminal.ProviderCommissionValue : 100);
                                cmd.Parameters.AddWithValue("@commMin", terminal.ProviderCommissionMinPiasters >= 0 ? terminal.ProviderCommissionMinPiasters : 0);
                                cmd.Parameters.AddWithValue("@commMax", terminal.ProviderCommissionMaxPiasters >= 0 ? terminal.ProviderCommissionMaxPiasters : 0);
                                cmd.Parameters.AddWithValue("@rulesJson", (object)rulesJson ?? DBNull.Value);
                                cmd.Parameters.AddWithValue("@now", now);
                                cmd.ExecuteNonQuery();
                            }
                        }
                        else
                        {
                            bool balanceChanged = (terminal.BalancePiasters != existingBal);

                            string updateSql = @"
                                UPDATE epay_terminals SET
                                    name = @name,
                                    provider = @provider,
                                    terminal_code = @terminalCode,
                                    balance_piasters = @balance,
                                    low_balance_alert_piasters = @lowAlert,
                                    is_active = @isActive,
                                    customer_fee_type = @feeType,
                                    customer_fee_value = @feeVal,
                                    customer_fee_min_piasters = @feeMin,
                                    customer_fee_max_piasters = @feeMax,
                                    provider_commission_type = @commType,
                                    provider_commission_value = @commVal,
                                    provider_commission_min_piasters = @commMin,
                                    provider_commission_max_piasters = @commMax,
                                    service_fee_rules_json = @rulesJson,
                                    updated_at = @now
                                WHERE id = @id;
                            ";
                            using (var cmd = new SQLiteCommand(updateSql, conn, trans))
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
                                cmd.Parameters.AddWithValue("@feeMin", terminal.CustomerFeeMinPiasters >= 0 ? terminal.CustomerFeeMinPiasters : 0);
                                cmd.Parameters.AddWithValue("@feeMax", terminal.CustomerFeeMaxPiasters >= 0 ? terminal.CustomerFeeMaxPiasters : 0);
                                cmd.Parameters.AddWithValue("@commType", !string.IsNullOrWhiteSpace(terminal.ProviderCommissionType) ? terminal.ProviderCommissionType : "fixed");
                                cmd.Parameters.AddWithValue("@commVal", terminal.ProviderCommissionValue >= 0 ? terminal.ProviderCommissionValue : 100);
                                cmd.Parameters.AddWithValue("@commMin", terminal.ProviderCommissionMinPiasters >= 0 ? terminal.ProviderCommissionMinPiasters : 0);
                                cmd.Parameters.AddWithValue("@commMax", terminal.ProviderCommissionMaxPiasters >= 0 ? terminal.ProviderCommissionMaxPiasters : 0);
                                cmd.Parameters.AddWithValue("@rulesJson", (object)rulesJson ?? DBNull.Value);
                                cmd.Parameters.AddWithValue("@now", now);
                                cmd.ExecuteNonQuery();
                            }

                            if (balanceChanged)
                            {
                                long diff = terminal.BalancePiasters - existingBal;
                                string fundingId = Guid.NewGuid().ToString();
                                string insertFundingSql = @"
                                    INSERT INTO epay_terminal_fundings (
                                        id, terminal_id, amount_piasters, funding_source, previous_balance_piasters, new_balance_piasters, notes, created_by, created_at
                                    ) VALUES (
                                        @id, @termId, @amt, 'manual_adjustment', @prevBal, @newBal, 'تسوية رصيد يدوية من إعدادات الماكينة', 'admin', @now
                                    );
                                ";
                                using (var fundCmd = new SQLiteCommand(insertFundingSql, conn, trans))
                                {
                                    fundCmd.Parameters.AddWithValue("@id", fundingId);
                                    fundCmd.Parameters.AddWithValue("@termId", terminal.Id);
                                    fundCmd.Parameters.AddWithValue("@amt", diff);
                                    fundCmd.Parameters.AddWithValue("@prevBal", existingBal);
                                    fundCmd.Parameters.AddWithValue("@newBal", terminal.BalancePiasters);
                                    fundCmd.Parameters.AddWithValue("@now", now);
                                    fundCmd.ExecuteNonQuery();
                                }

                                if (_auditRepo != null)
                                {
                                    _auditRepo.Log(conn, trans, new AuditLog
                                    {
                                        Id = "aud_" + Guid.NewGuid().ToString("N"),
                                        UserId = "admin",
                                        Action = "epay_terminal_balance_adjust",
                                        EntityType = "epay_terminal",
                                        EntityId = terminal.Id,
                                        DetailsJson = string.Format("{{\"previousBalance\":{0},\"newBalance\":{1},\"diff\":{2}}}", existingBal, terminal.BalancePiasters, diff),
                                        CreatedAt = now
                                    });
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
            return GetTerminalById(terminal.Id);
        }

        public bool DeleteTerminal(string terminalId, out string message)
        {
            message = "";
            if (string.IsNullOrWhiteSpace(terminalId))
            {
                message = "معرف الماكينة غير محدد";
                return false;
            }

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        string termName = "";
                        long balancePiasters = 0;
                        string checkSql = "SELECT name, balance_piasters FROM epay_terminals WHERE id = @id LIMIT 1;";
                        using (var cmd = new SQLiteCommand(checkSql, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@id", terminalId);
                            using (var reader = cmd.ExecuteReader())
                            {
                                if (!reader.Read())
                                {
                                    message = "الماكينة غير موجودة";
                                    return false;
                                }
                                termName = reader.GetString(0);
                                balancePiasters = reader.IsDBNull(1) ? 0L : Convert.ToInt64(reader.GetValue(1));
                            }
                        }

                        if (balancePiasters > 0)
                        {
                            message = string.Format("لا يمكن حذف أو أرشفة الماكينة \"{0}\" لوجود رصيد متبقي ({1}). يجب سحب أو تصفية الرصيد أولاً.",
                                termName, Common.Money.FormatPiasters(balancePiasters));
                            return false;
                        }
                        if (balancePiasters < 0)
                        {
                            message = string.Format("لا يمكن حذف أو أرشفة الماكينة \"{0}\" لوجود رصيد مدين ({1}). يجب تسوية الرصيد أولاً.",
                                termName, Common.Money.FormatPiasters(Math.Abs(balancePiasters)));
                            return false;
                        }

                        long txCount = 0;
                        string countSql = @"
                            SELECT 
                                (SELECT COUNT(1) FROM epay_transactions WHERE terminal_id = @id) +
                                (SELECT COUNT(1) FROM epay_terminal_fundings WHERE terminal_id = @id);
                        ";
                        using (var cmd = new SQLiteCommand(countSql, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@id", terminalId);
                            object res = cmd.ExecuteScalar();
                            if (res != null && res != DBNull.Value)
                            {
                                txCount = Convert.ToInt64(res);
                            }
                        }

                        string now = DateTime.UtcNow.ToString("o");

                        if (txCount == 0)
                        {
                            string delSql = "DELETE FROM epay_terminals WHERE id = @id;";
                            using (var cmd = new SQLiteCommand(delSql, conn, trans))
                            {
                                cmd.Parameters.AddWithValue("@id", terminalId);
                                cmd.ExecuteNonQuery();
                            }
                            message = string.Format("تم حذف ماكينة \"{0}\" نهائياً بنجاح", termName);
                        }
                        else
                        {
                            string archiveSql = "UPDATE epay_terminals SET is_active = 0, updated_at = @now WHERE id = @id;";
                            using (var cmd = new SQLiteCommand(archiveSql, conn, trans))
                            {
                                cmd.Parameters.AddWithValue("@now", now);
                                cmd.Parameters.AddWithValue("@id", terminalId);
                                cmd.ExecuteNonQuery();
                            }
                            message = string.Format("تم أرشفة وتعطيل ماكينة \"{0}\" بنجاح للحفاظ على سجل المعاملات المالية السابقة", termName);
                        }

                        if (_auditRepo != null)
                        {
                            _auditRepo.Log(conn, trans, new AuditLog
                            {
                                Id = "aud_" + Guid.NewGuid().ToString("N"),
                                UserId = "admin",
                                Action = txCount == 0 ? "epay_terminal_delete" : "epay_terminal_archive",
                                EntityType = "epay_terminal",
                                EntityId = terminalId,
                                DetailsJson = string.Format("{{\"name\":\"{0}\",\"historyCount\":{1}}}", termName, txCount),
                                CreatedAt = now
                            });
                        }

                        trans.Commit();
                        return true;
                    }
                    catch (Exception ex)
                    {
                        trans.Rollback();
                        message = "فشل حذف الماكينة: " + ex.Message;
                        return false;
                    }
                }
            }
        }

        public EpayTerminalFunding FundTerminal(string terminalId, long amountPiasters, string fundingSource, string notes, string createdBy)
        {
            if (amountPiasters <= 0)
            {
                throw new ArgumentException("مبلغ تغذية رصيد الماكينة يجب أن يكون أكبر من الصفر");
            }

            lock (SaleService.FinancialWriteLock)
            {
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
                        if (string.Equals(fundingSource, "cash_drawer", StringComparison.OrdinalIgnoreCase))
                        {
                            using (var clCmd = new SQLiteCommand("SELECT 1 FROM daily_closings WHERE business_date = date('now', 'localtime') LIMIT 1;", conn, trans))
                            {
                                if (clCmd.ExecuteScalar() != null)
                                {
                                    throw new InvalidOperationException("لا يمكن تغذية رصيد الماكينة من درج الكاشير لتاريخ عمل تم إقفاله وتشميعه مسبقاً.");
                                }
                            }

                            if (DatabaseService.DailyClosing != null)
                            {
                                var liveBal = DatabaseService.DailyClosing.GetLiveDrawerBalance();
                                if (liveBal != null && liveBal.AvailableCashPiasters < amountPiasters)
                                {
                                    throw new InvalidOperationException(string.Format("رصيد نقدية درج الكاشير المتاح حالياً ({0:N2} ج.م) غير كافٍ لتغذية ماكينة الدفع بمبلغ ({1:N2} ج.م). يرجى تغذية الدرج أولاً أو اختيار مصدر تمويل آخر (مثل: كاش خارجي / صاحب المحل).", liveBal.AvailableCashPiasters / 100.0, amountPiasters / 100.0));
                                }
                            }
                        }

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

                        if (_auditRepo != null)
                        {
                            _auditRepo.Log(conn, trans, new AuditLog
                            {
                                Id = "aud_" + Guid.NewGuid().ToString("N"),
                                UserId = string.IsNullOrWhiteSpace(createdBy) ? "usr_admin_default" : createdBy,
                                Action = "epay_terminal_fund",
                                EntityType = "epay_terminal",
                                EntityId = terminalId,
                                DetailsJson = string.Format("{{\"amount\":{0},\"source\":\"{1}\",\"previousBalance\":{2},\"newBalance\":{3}}}",
                                    amountPiasters, fundingSource ?? "cash_drawer", prevBal, newBal),
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
        }

        public static long ComputeFeeOrCommission(long billPiasters, string ruleType, long ruleValue, long minPiasters, long maxPiasters, long defaultFixedPiasters)
        {
            if (billPiasters <= 0) return 0;
            long result = 0;
            string type = (ruleType ?? "fixed").ToLowerInvariant();

            if (type == "percent")
            {
                // ruleValue is basis points: e.g. 100 bps = 1.00%, 150 bps = 1.50%
                long bps = ruleValue > 0 ? ruleValue : 100;
                result = (long)Math.Round((double)(billPiasters * bps) / 10000.0, MidpointRounding.AwayFromZero);
            }
            else if (type == "per_thousand")
            {
                // Each 1000 EGP (100,000 piasters) or fraction thereof
                long thousands = (long)Math.Max(1, Math.Ceiling((double)billPiasters / 100000.0));
                long ratePerThousand = ruleValue > 0 ? ruleValue : 1000;
                result = thousands * ratePerThousand;
            }
            else
            {
                result = ruleValue >= 0 ? ruleValue : defaultFixedPiasters;
            }

            if (minPiasters > 0 && result < minPiasters)
            {
                result = minPiasters;
            }
            if (maxPiasters > 0 && result > maxPiasters)
            {
                result = maxPiasters;
            }

            return Math.Max(0, result);
        }

        public EpayPricingResult CalculatePricing(string terminalId, string serviceType, long billAmountPiasters)
        {
            if (string.IsNullOrWhiteSpace(terminalId))
            {
                throw new ArgumentException("يجب تحديد ماكينة الدفع الإلكتروني");
            }

            var terminal = GetTerminalById(terminalId);
            if (terminal == null)
            {
                throw new InvalidOperationException("ماكينة الدفع المحددة غير موجودة");
            }

            if (billAmountPiasters <= 0)
            {
                throw new ArgumentException("مبلغ العملية أو الفاتورة يجب أن يكون أكبر من الصفر");
            }

            // Check if there is a specific rule for this service
            EpayServiceFeeRule matchedRule = null;
            if (terminal.ServiceFeeRules != null && terminal.ServiceFeeRules.Count > 0)
            {
                for (int i = 0; i < terminal.ServiceFeeRules.Count; i++)
                {
                    var r = terminal.ServiceFeeRules[i];
                    if (r != null && string.Equals(r.ServiceType, serviceType, StringComparison.OrdinalIgnoreCase))
                    {
                        matchedRule = r;
                        break;
                    }
                }
            }

            string ruleApplied = "terminal_default";
            string feeType = terminal.CustomerFeeType;
            long feeVal = terminal.CustomerFeeValue;
            long feeMin = terminal.CustomerFeeMinPiasters;
            long feeMax = terminal.CustomerFeeMaxPiasters;

            string commType = terminal.ProviderCommissionType;
            long commVal = terminal.ProviderCommissionValue;
            long commMin = terminal.ProviderCommissionMinPiasters;
            long commMax = terminal.ProviderCommissionMaxPiasters;

            if (matchedRule != null && !string.IsNullOrWhiteSpace(matchedRule.FeeMode) && matchedRule.FeeMode != "default")
            {
                ruleApplied = "service_custom";
                feeType = !string.IsNullOrWhiteSpace(matchedRule.CustomerFeeType) ? matchedRule.CustomerFeeType : matchedRule.FeeMode;
                feeVal = matchedRule.CustomerFeeValue;
                feeMin = matchedRule.CustomerFeeMinPiasters;
                feeMax = matchedRule.CustomerFeeMaxPiasters;

                if (!string.IsNullOrWhiteSpace(matchedRule.ProviderCommissionType))
                {
                    commType = matchedRule.ProviderCommissionType;
                    commVal = matchedRule.ProviderCommissionValue;
                    commMin = matchedRule.ProviderCommissionMinPiasters;
                    commMax = matchedRule.ProviderCommissionMaxPiasters;
                }
            }

            long customerFee = ComputeFeeOrCommission(billAmountPiasters, feeType, feeVal, feeMin, feeMax, 200);
            long providerComm = ComputeFeeOrCommission(billAmountPiasters, commType, commVal, commMin, commMax, 100);

            long machineDeducted = (serviceType == "cash_out") ? 0 : (billAmountPiasters + providerComm);

            return new EpayPricingResult
            {
                TerminalId = terminalId,
                ServiceType = serviceType,
                BillAmountPiasters = billAmountPiasters,
                CustomerFeePiasters = customerFee,
                ProviderCommissionPiasters = providerComm,
                TotalReceivedPiasters = billAmountPiasters + providerComm + customerFee,
                MachineDeductedPiasters = machineDeducted,
                NetProfitPiasters = customerFee,
                RuleApplied = ruleApplied
            };
        }

        public EpayTransaction CreateTransaction(EpayTransaction tx)
        {
            if (tx == null) throw new ArgumentNullException("tx");
            if (string.IsNullOrWhiteSpace(tx.TerminalId))
            {
                throw new ArgumentException("يجب تحديد ماكينة الدفع الإلكتروني");
            }
            if (tx.BillAmountPiasters <= 0)
            {
                throw new ArgumentException("مبلغ العملية أو الفاتورة يجب أن يكون أكبر من الصفر");
            }
            if (tx.CustomerFeePiasters < 0)
            {
                throw new ArgumentException("رسوم الخدمة لا يمكن أن تكون سالبة");
            }
            if (tx.ProviderCommissionPiasters < 0)
            {
                throw new ArgumentException("عمولة الشركة لا يمكن أن تكون سالبة");
            }
            if (tx.MachineDeductedPiasters < 0)
            {
                throw new ArgumentException("المبلغ المخصوم من رصيد الماكينة لا يمكن أن يكون سالباً");
            }

            lock (SaleService.FinancialWriteLock)
            {
                if (string.IsNullOrWhiteSpace(tx.Id))
                {
                    tx.Id = Guid.NewGuid().ToString();
                }

                string now = DateTime.UtcNow.ToString("o");
                tx.CreatedAt = now;
                tx.Status = string.IsNullOrWhiteSpace(tx.Status) ? "completed" : tx.Status;

                // Financial Calculations:
                // Total from customer = bill amount + machine commission + shop profit
                // Machine deducted = bill amount + machine commission (profit is NOT deducted from machine)
                // Net profit for the shop = customer fee + machine commission discount (if deducted < bill)
                tx.TotalReceivedPiasters = tx.BillAmountPiasters + tx.ProviderCommissionPiasters + tx.CustomerFeePiasters;
                if (tx.NetProfitPiasters <= 0)
                {
                    if (tx.MachineDeductedPiasters > 0 && tx.MachineDeductedPiasters < tx.BillAmountPiasters)
                    {
                        tx.NetProfitPiasters = tx.CustomerFeePiasters + (tx.BillAmountPiasters - tx.MachineDeductedPiasters);
                    }
                    else
                    {
                        tx.NetProfitPiasters = tx.CustomerFeePiasters;
                    }
                }

                // Machine deducted amount: for cash_out it's 0; for debit operations default to billAmount + providerCommission
                if (tx.ServiceType == "cash_out")
                {
                    tx.MachineDeductedPiasters = 0;
                }
                else if (tx.MachineDeductedPiasters <= 0)
                {
                    tx.MachineDeductedPiasters = tx.BillAmountPiasters + tx.ProviderCommissionPiasters;
                }

                using (var conn = new SQLiteConnection(_connectionString))
                {
                    conn.Open();
                    using (var trans = conn.BeginTransaction())
                    {
                    try
                    {
                        // 1. Get terminal info and check balance & status
                        bool isActive = true;
                        long currentTermBal = 0;
                        string getTermSql = "SELECT name, balance_piasters, is_active FROM epay_terminals WHERE id = @id LIMIT 1;";
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
                                currentTermBal = Convert.ToInt64(reader["balance_piasters"]);
                                isActive = Convert.ToInt32(reader["is_active"]) == 1;
                            }
                        }

                        if (!isActive)
                        {
                            throw new InvalidOperationException("ماكينة الدفع الإلكتروني موقوفة ومُعطلة حالياً ولا يمكن إجراء معاملات عليها");
                        }

                        // Closed day protection if affecting cash drawer
                        if (string.Equals(tx.PaymentChannel, "cash_drawer", StringComparison.OrdinalIgnoreCase))
                        {
                            using (var clCmd = new SQLiteCommand("SELECT 1 FROM daily_closings WHERE business_date = date('now', 'localtime') LIMIT 1;", conn, trans))
                            {
                                if (clCmd.ExecuteScalar() != null)
                                {
                                    throw new InvalidOperationException("لا يمكن تنفيذ معاملة نقدية تؤثر على درج الكاشير لتاريخ عمل تم إقفاله وتشميعه مسبقاً.");
                                }
                            }

                            if (string.Equals(tx.ServiceType, "cash_out", StringComparison.OrdinalIgnoreCase))
                            {
                                long netDrawerOutflow = tx.BillAmountPiasters - tx.CustomerFeePiasters;
                                if (netDrawerOutflow > 0 && RafiqPOS.Services.DatabaseService.DailyClosing != null)
                                {
                                    var liveBal = RafiqPOS.Services.DatabaseService.DailyClosing.GetLiveDrawerBalance();
                                    if (liveBal != null && liveBal.AvailableCashPiasters < netDrawerOutflow)
                                    {
                                        throw new InvalidOperationException(string.Format(
                                            "رصيد نقدية الدرج المتاح حالياً ({0:N2} ج.م) غير كافٍ لصرف سحب نقدي للمستهلك بقيمة ({1:N2} ج.م). يرجى توريد نقدية للدرج أولاً.",
                                            liveBal.AvailableCashPiasters / 100.0, netDrawerOutflow / 100.0));
                                    }
                                }
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

                        if (balanceDelta < 0 && (currentTermBal + balanceDelta) < 0)
                        {
                            throw new InvalidOperationException(string.Format("رصيد ماكينة الدفع الإلكتروني غير كافٍ لإتمام العملية (الرصيد الحالي: {0:N2} ج.م، المطلوب خصمه: {1:N2} ج.م)",
                                currentTermBal / 100.0, Math.Abs(balanceDelta) / 100.0));
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

                        if (_auditRepo != null)
                        {
                            _auditRepo.Log(conn, trans, new AuditLog
                            {
                                Id = "aud_" + Guid.NewGuid().ToString("N"),
                                UserId = string.IsNullOrWhiteSpace(tx.CashierName) ? "usr_admin_default" : tx.CashierName,
                                Action = "epay_transaction_create",
                                EntityType = "epay_transaction",
                                EntityId = tx.Id,
                                DetailsJson = string.Format("{{\"serviceType\":\"{0}\",\"billAmount\":{1},\"fee\":{2},\"netProfit\":{3},\"terminalId\":\"{4}\"}}",
                                    tx.ServiceType, tx.BillAmountPiasters, tx.CustomerFeePiasters, tx.NetProfitPiasters, tx.TerminalId),
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

                return tx;
            }
        }

        public EpayTransaction CancelTransaction(string transactionId, string reason, string cancelledBy)
        {
            if (string.IsNullOrWhiteSpace(transactionId))
            {
                throw new ArgumentException("معرف العملية غير صالح");
            }

            lock (SaleService.FinancialWriteLock)
            {
                string now = DateTime.UtcNow.ToString("o");
                EpayTransaction tx = null;

                using (var conn = new SQLiteConnection(_connectionString))
                {
                    conn.Open();
                    using (var trans = conn.BeginTransaction())
                    {
                    try
                    {
                        // 1. Fetch transaction
                        string getTxSql = @"
                            SELECT t.*, m.name as terminal_name 
                            FROM epay_transactions t 
                            LEFT JOIN epay_terminals m ON t.terminal_id = m.id 
                            WHERE t.id = @id 
                            LIMIT 1;
                        ";
                        using (var cmd = new SQLiteCommand(getTxSql, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@id", transactionId);
                            using (var reader = cmd.ExecuteReader())
                            {
                                if (!reader.Read())
                                {
                                    throw new InvalidOperationException("عملية الدفع الإلكتروني غير موجودة");
                                }
                                tx = MapReaderToTransaction(reader);
                            }
                        }

                        if (string.Equals(tx.Status, "cancelled", StringComparison.OrdinalIgnoreCase))
                        {
                            throw new InvalidOperationException("هذه العملية ملغاة بالفعل مسبقاً");
                        }

                        // 2. Fetch terminal to adjust balance
                        long termBal = 0;
                        string getTermSql = "SELECT name, balance_piasters FROM epay_terminals WHERE id = @termId LIMIT 1;";
                        using (var cmd = new SQLiteCommand(getTermSql, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@termId", tx.TerminalId);
                            using (var reader = cmd.ExecuteReader())
                            {
                                if (!reader.Read())
                                {
                                    throw new InvalidOperationException("ماكينة الدفع الخاصة بهذه العملية غير موجودة");
                                }
                                termBal = Convert.ToInt64(reader["balance_piasters"]);
                            }
                        }

                        // Reverse balance:
                        // Cash-out increased terminal balance by BillAmountPiasters -> Reversal decreases by BillAmountPiasters
                        // Debit operations decreased terminal balance by MachineDeductedPiasters -> Reversal increases by MachineDeductedPiasters
                        long reversalDelta = 0;
                        if (tx.ServiceType == "cash_out")
                        {
                            reversalDelta = -tx.BillAmountPiasters;
                            if (termBal + reversalDelta < 0)
                            {
                                throw new InvalidOperationException(string.Format("لا يمكن إلغاء عملية السحب النقدي لأن رصيد الماكينة الحالي ({0:N2} ج.م) أقل من المبلغ المطلوب استرجاعه ({1:N2} ج.م)",
                                    termBal / 100.0, tx.BillAmountPiasters / 100.0));
                            }
                        }
                        else
                        {
                            reversalDelta = tx.MachineDeductedPiasters;
                        }

                        string updateBalSql = @"
                            UPDATE epay_terminals 
                            SET balance_piasters = balance_piasters + @delta,
                                updated_at = @now
                            WHERE id = @id;
                        ";
                        using (var cmd = new SQLiteCommand(updateBalSql, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@delta", reversalDelta);
                            cmd.Parameters.AddWithValue("@now", now);
                            cmd.Parameters.AddWithValue("@id", tx.TerminalId);
                            cmd.ExecuteNonQuery();
                        }

                        // 3. Mark transaction as cancelled
                        string cancelNote = string.Format("[ملغاة في {0} بواسطة {1}: {2}]", DateTime.Now.ToString("yyyy-MM-dd HH:mm"), cancelledBy ?? "كاشير المحل", reason ?? "بدون سبب");
                        string updatedNotes = string.IsNullOrWhiteSpace(tx.Notes) ? cancelNote : tx.Notes + " " + cancelNote;

                        string updateTxSql = @"
                            UPDATE epay_transactions
                            SET status = 'cancelled',
                                notes = @notes
                            WHERE id = @id;
                        ";
                        using (var cmd = new SQLiteCommand(updateTxSql, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@notes", updatedNotes);
                            cmd.Parameters.AddWithValue("@id", tx.Id);
                            cmd.ExecuteNonQuery();
                        }

                        tx.Status = "cancelled";
                        tx.Notes = updatedNotes;

                        // 4. Audit Log
                        if (_auditRepo != null)
                        {
                            _auditRepo.Log(conn, trans, new AuditLog
                            {
                                Id = "aud_" + Guid.NewGuid().ToString("N"),
                                UserId = string.IsNullOrWhiteSpace(cancelledBy) ? "usr_admin_default" : cancelledBy,
                                Action = "epay_transaction_cancel",
                                EntityType = "epay_transaction",
                                EntityId = tx.Id,
                                DetailsJson = string.Format("{{\"billAmount\":{0},\"reversalDelta\":{1},\"terminalId\":\"{2}\",\"reason\":\"{3}\"}}",
                                    tx.BillAmountPiasters, reversalDelta, tx.TerminalId, (reason ?? "").Replace("\"", "'")),
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

                return tx;
            }
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
                                TerminalName = HasColumn(reader, "terminal_name") && reader["terminal_name"] != DBNull.Value ? reader["terminal_name"].ToString() : "",
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

                // 1. Total terminal balance & active count
                using (var cmd = new SQLiteCommand("SELECT COUNT(*), COALESCE(SUM(balance_piasters), 0) FROM epay_terminals WHERE is_active = 1;", conn))
                {
                    using (var reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            summary.ActiveTerminalsCount = (reader[0] != DBNull.Value) ? Convert.ToInt32(reader[0]) : 0;
                            summary.TotalTerminalsBalancePiasters = (reader[1] != DBNull.Value) ? Convert.ToInt64(reader[1]) : 0;
                        }
                    }
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
                        COALESCE(SUM(net_profit_piasters), 0) as total_profit,
                        COALESCE(SUM(CASE WHEN payment_channel = 'cash_drawer' THEN total_received_piasters ELSE 0 END), 0) as total_cash_drawer,
                        COALESCE(SUM(CASE WHEN payment_channel = 'terminal_till' THEN total_received_piasters ELSE 0 END), 0) as total_terminal_till
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
                            summary.TotalInCashDrawerPiasters = Convert.ToInt64(reader["total_cash_drawer"]);
                            summary.TotalInTerminalTillPiasters = Convert.ToInt64(reader["total_terminal_till"]);
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
            var terminal = new EpayTerminal
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
                CustomerFeeMinPiasters = HasColumn(reader, "customer_fee_min_piasters") && reader["customer_fee_min_piasters"] != DBNull.Value ? Convert.ToInt64(reader["customer_fee_min_piasters"]) : 0,
                CustomerFeeMaxPiasters = HasColumn(reader, "customer_fee_max_piasters") && reader["customer_fee_max_piasters"] != DBNull.Value ? Convert.ToInt64(reader["customer_fee_max_piasters"]) : 0,
                ProviderCommissionType = HasColumn(reader, "provider_commission_type") && reader["provider_commission_type"] != DBNull.Value ? reader["provider_commission_type"].ToString() : "fixed",
                ProviderCommissionValue = HasColumn(reader, "provider_commission_value") && reader["provider_commission_value"] != DBNull.Value ? Convert.ToInt64(reader["provider_commission_value"]) : 100,
                ProviderCommissionMinPiasters = HasColumn(reader, "provider_commission_min_piasters") && reader["provider_commission_min_piasters"] != DBNull.Value ? Convert.ToInt64(reader["provider_commission_min_piasters"]) : 0,
                ProviderCommissionMaxPiasters = HasColumn(reader, "provider_commission_max_piasters") && reader["provider_commission_max_piasters"] != DBNull.Value ? Convert.ToInt64(reader["provider_commission_max_piasters"]) : 0,
                ServiceFeeRulesJson = HasColumn(reader, "service_fee_rules_json") && reader["service_fee_rules_json"] != DBNull.Value ? reader["service_fee_rules_json"].ToString() : null,
                CreatedAt = reader["created_at"].ToString(),
                UpdatedAt = reader["updated_at"].ToString()
            };

            if (!string.IsNullOrWhiteSpace(terminal.ServiceFeeRulesJson))
            {
                try
                {
                    terminal.ServiceFeeRules = JsonConvert.DeserializeObject<List<EpayServiceFeeRule>>(terminal.ServiceFeeRulesJson);
                }
                catch { }
            }

            return terminal;
        }

        private static EpayTransaction MapReaderToTransaction(SQLiteDataReader reader)
        {
            string termName = "";
            if (HasColumn(reader, "terminal_name") && reader["terminal_name"] != DBNull.Value)
            {
                termName = reader["terminal_name"].ToString();
            }

            return new EpayTransaction
            {
                Id = reader["id"].ToString(),
                TerminalId = reader["terminal_id"].ToString(),
                TerminalName = termName,
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
