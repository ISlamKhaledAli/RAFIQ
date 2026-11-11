using System;
using System.Collections.Generic;
using System.Data.SQLite;
using Newtonsoft.Json;
using RafiqPOS.Common;
using RafiqPOS.Models;
using RafiqPOS.Repositories;

namespace RafiqPOS.Services
{
    public class DailyClosingService
    {
        private readonly string _connectionString;
        private readonly DailyClosingRepository _closingRepo;
        private readonly CounterRepository _counterRepo;
        private readonly AuditLogRepository _auditRepo;
        private readonly SettingsRepository _settingsRepo;
        private readonly ShiftRepository _shiftRepo;

        public DailyClosingService(
            string connectionString,
            DailyClosingRepository closingRepo,
            CounterRepository counterRepo,
            AuditLogRepository auditRepo,
            SettingsRepository settingsRepo,
            ShiftRepository shiftRepo = null)
        {
            _connectionString = connectionString;
            _closingRepo = closingRepo;
            _counterRepo = counterRepo;
            _auditRepo = auditRepo;
            _settingsRepo = settingsRepo;
            _shiftRepo = shiftRepo != null ? shiftRepo : new ShiftRepository(connectionString);
        }

        private int GetCutoffHour()
        {
            try
            {
                string val = _settingsRepo.Get("business_day_cutoff_hour", "0");
                int hour;
                if (int.TryParse(val, out hour) && hour >= 0 && hour <= 12)
                {
                    return hour;
                }
            }
            catch
            {
                // Fallback default 0 (12:00 AM midnight)
            }
            return 0;
        }

        public string GetCurrentBusinessDate()
        {
            int cutoff = GetCutoffHour();
            DateTime bDate = TimeGuard.GetBusinessDate(DateTime.Now, cutoff);
            return bDate.ToString("yyyy-MM-dd");
        }

        public DailyClosingPreview GetClosingPreview(string businessDate)
        {
            if (string.IsNullOrEmpty(businessDate))
            {
                businessDate = GetCurrentBusinessDate();
            }

            int cutoff = GetCutoffHour();
            var preview = new DailyClosingPreview
            {
                BusinessDate = businessDate,
                CurrentUtc = DateTime.UtcNow.ToString("o")
            };

            // 1. Clock validation (Feature #127 / Task 127-4)
            var clockCheck = TimeGuard.ValidateSystemClock(_connectionString);
            if (!clockCheck.IsValid)
            {
                preview.IsDateSuspicious = true;
                preview.DateSuspiciousReason = clockCheck.Message;
            }

            var openShiftsList = _shiftRepo.GetOpenShifts(businessDate);
            preview.OpenShifts = openShiftsList;
            preview.OpenShiftsCount = openShiftsList != null ? openShiftsList.Count : 0;

            // 2. Check if already closed
            var existing = _closingRepo.GetByBusinessDate(businessDate);
            if (existing != null)
            {
                preview.IsAlreadyClosed = true;
                preview.ExistingClosing = existing;
                preview.TotalSalesPiasters = existing.TotalSalesPiasters;
                preview.CashSalesPiasters = existing.CashSalesPiasters;
                preview.CardSalesPiasters = existing.CardSalesPiasters;
                preview.InstapaySalesPiasters = existing.InstapaySalesPiasters;
                preview.VodafoneCashSalesPiasters = existing.VodafoneCashSalesPiasters;
                preview.CreditSalesPiasters = existing.CreditSalesPiasters;
                preview.ExpensesPiasters = existing.ExpensesPiasters;
                preview.ReturnsTotalPiasters = existing.ReturnsTotalPiasters;
                preview.ReturnsCashPiasters = existing.ReturnsCashPiasters;
                preview.ReturnsCount = existing.ReturnsCount;
                preview.CancelledTotalPiasters = existing.CancelledTotalPiasters;
                preview.CancelledCount = existing.CancelledCount;
                preview.DebtPaymentsPiasters = existing.DebtPaymentsPiasters;
                preview.ExpectedCashPiasters = existing.ExpectedCashPiasters;
                preview.GrossProfitPiasters = existing.GrossProfitPiasters;
                preview.InvoicesCount = existing.InvoicesCount;

                if (!string.IsNullOrEmpty(existing.SummaryJson))
                {
                    try
                    {
                        var parsed = JsonConvert.DeserializeObject<DailyClosingPreview>(existing.SummaryJson);
                        if (parsed != null)
                        {
                            preview.EpayTerminalsBalancePiasters = parsed.EpayTerminalsBalancePiasters;
                            preview.EpayTillCashPiasters = parsed.EpayTillCashPiasters;
                            preview.EpayDrawerCashPiasters = parsed.EpayDrawerCashPiasters;
                            preview.EpayDrawerFundingPiasters = parsed.EpayDrawerFundingPiasters;
                            preview.EpayNetProfitPiasters = parsed.EpayNetProfitPiasters;
                            preview.WalletsBalancePiasters = parsed.WalletsBalancePiasters;
                            preview.WalletsDrawerCashPiasters = parsed.WalletsDrawerCashPiasters;
                            preview.WalletsDrawerFundingPiasters = parsed.WalletsDrawerFundingPiasters;
                            preview.WalletsNetProfitPiasters = parsed.WalletsNetProfitPiasters;
                            preview.PurchasesDrawerCashPiasters = parsed.PurchasesDrawerCashPiasters;
                            preview.SupplierPaymentsDrawerCashPiasters = parsed.SupplierPaymentsDrawerCashPiasters;
                            preview.OpeningFloatPiasters = parsed.OpeningFloatPiasters;
                            preview.ManualCashInPiasters = parsed.ManualCashInPiasters;
                            preview.ManualCashOutPiasters = parsed.ManualCashOutPiasters;
                            preview.DrawerExpensesPiasters = parsed.DrawerExpensesPiasters;
                            preview.SafeExpensesPiasters = parsed.SafeExpensesPiasters;
                            preview.ZeroCostItemsCount = parsed.ZeroCostItemsCount;
                        }
                    }
                    catch
                    {
                    }
                }

                // Detect any sales registered after the closing was sealed
                using (var conn = new SQLiteConnection(_connectionString))
                {
                    conn.Open();
                    string postSalesSql = @"
                        SELECT COUNT(*), COALESCE(SUM(total_piasters), 0)
                        FROM sales
                        WHERE created_at > @closedAt
                          AND date(datetime(created_at, 'localtime', '-' || @cutoff || ' hours')) = @bdate
                          AND status != 'cancelled'
                          AND id NOT LIKE 'demo_%'
                          AND id NOT LIKE 'stress_%';
                    ";
                    using (var cmd = new SQLiteCommand(postSalesSql, conn))
                    {
                        cmd.Parameters.AddWithValue("@closedAt", existing.ClosedAt);
                        cmd.Parameters.AddWithValue("@cutoff", cutoff);
                        cmd.Parameters.AddWithValue("@bdate", businessDate);
                        using (var reader = cmd.ExecuteReader())
                        {
                            if (reader.Read())
                            {
                                preview.PostClosingSalesCount = Convert.ToInt32(reader[0]);
                                preview.PostClosingSalesPiasters = Convert.ToInt64(reader[1]);
                            }
                        }
                    }

                    PopulateEpayAndWalletsDetails(conn, preview, businessDate, cutoff);
                }

                return preview;
            }

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var pragmaCmd = new SQLiteCommand("PRAGMA temp_store = MEMORY;", conn))
                {
                    pragmaCmd.ExecuteNonQuery();
                }

                // 3. Sales totals (Excluding cancelled and demo sales - strictly isolating cash, card, and credit)
                string salesSql = @"
                    SELECT 
                        COALESCE(SUM(s.total_piasters), 0) AS total_sales,
                        COALESCE(SUM(
                            CASE 
                                -- Cash kept in the drawer = paid minus change handed back (includes cash deposited to a customer account - Audit F-27)
                                -- Insurance sales split like multi: patient co-pay by its own method, company share on the insurance line (Task 189-5)
                                WHEN s.payment_method = 'cash' THEN MAX(0, (s.paid_piasters - s.service_fee_piasters) - COALESCE(s.change_piasters, 0))
                                WHEN s.payment_method = 'credit' THEN MIN((s.paid_piasters - s.service_fee_piasters), s.total_piasters)
                                WHEN s.payment_method IN ('multi', 'insurance') THEN MAX(0, (
                                    SELECT COALESCE(SUM(p.amount_piasters), 0) 
                                    FROM payments p 
                                    WHERE p.sale_id = s.id AND p.method = 'cash'
                                ) - COALESCE(s.change_piasters, 0))
                                ELSE 0 
                            END
                        ), 0) AS cash_sales,
                        COALESCE(SUM(
                            CASE 
                                WHEN s.payment_method = 'instapay' THEN (s.paid_piasters - s.service_fee_piasters)
                                WHEN s.payment_method IN ('multi', 'insurance') THEN (
                                    SELECT COALESCE(SUM(p.amount_piasters), 0) 
                                    FROM payments p 
                                    WHERE p.sale_id = s.id AND p.method = 'instapay'
                                )
                                ELSE 0 
                            END
                        ), 0) AS instapay_sales,
                        COALESCE(SUM(
                            CASE 
                                WHEN s.payment_method IN ('vodafone_cash', 'wallet', 'orange_cash', 'etisalat_cash', 'we_pay') THEN (s.paid_piasters - s.service_fee_piasters)
                                WHEN s.payment_method IN ('multi', 'insurance') THEN (
                                    SELECT COALESCE(SUM(p.amount_piasters), 0) 
                                    FROM payments p 
                                    WHERE p.sale_id = s.id AND p.method IN ('vodafone_cash', 'wallet', 'orange_cash', 'etisalat_cash', 'we_pay')
                                )
                                ELSE 0 
                            END
                        ), 0) AS vodafone_cash_sales,
                        COALESCE(SUM(
                            CASE 
                                WHEN s.payment_method IN ('card', 'visa', 'mastercard', 'meeza', 'pos', 'bank_card') THEN (s.paid_piasters - s.service_fee_piasters)
                                WHEN s.payment_method IN ('multi', 'insurance') THEN (
                                    SELECT COALESCE(SUM(p.amount_piasters), 0) 
                                    FROM payments p 
                                    WHERE p.sale_id = s.id AND p.method IN ('card', 'visa', 'mastercard', 'meeza', 'pos', 'bank_card')
                                )
                                ELSE 0 
                            END
                        ), 0) AS card_sales,
                        COALESCE(SUM(CASE WHEN s.total_piasters > (s.paid_piasters - s.service_fee_piasters) THEN (s.total_piasters - (s.paid_piasters - s.service_fee_piasters)) ELSE 0 END), 0) AS credit_sales,
                        COALESCE(SUM(
                            CASE 
                                WHEN s.payment_method IN ('multi', 'insurance') THEN (
                                    SELECT COALESCE(SUM(p.amount_piasters), 0) 
                                    FROM payments p 
                                    WHERE p.sale_id = s.id AND p.method = 'insurance'
                                )
                                ELSE 0 
                            END
                        ), 0) AS insurance_sales,
                        COUNT(*) AS inv_count
                    FROM sales s
                    WHERE date(datetime(s.created_at, 'localtime', '-' || @cutoff || ' hours')) = @bdate
                      AND s.status != 'cancelled'
                      AND s.id NOT LIKE 'demo_%'
                      AND s.id NOT LIKE 'stress_%';
                ";
                using (var cmd = new SQLiteCommand(salesSql, conn))
                {
                    cmd.Parameters.AddWithValue("@cutoff", cutoff);
                    cmd.Parameters.AddWithValue("@bdate", businessDate);
                    using (var reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            preview.TotalSalesPiasters = Convert.ToInt64(reader["total_sales"]);
                            preview.CashSalesPiasters = Convert.ToInt64(reader["cash_sales"]);
                            preview.InstapaySalesPiasters = Convert.ToInt64(reader["instapay_sales"]);
                            preview.VodafoneCashSalesPiasters = Convert.ToInt64(reader["vodafone_cash_sales"]);
                            preview.CardSalesPiasters = Convert.ToInt64(reader["card_sales"]);
                            preview.CreditSalesPiasters = Convert.ToInt64(reader["credit_sales"]);
                            preview.InsuranceSalesPiasters = Convert.ToInt64(reader["insurance_sales"]);
                            preview.InvoicesCount = Convert.ToInt32(reader["inv_count"]);
                        }
                    }
                }

                // 4. Cancelled sales
                string cancelledSql = @"
                    SELECT 
                        COALESCE(SUM(total_piasters), 0) AS total_cancelled,
                        COUNT(*) AS cancelled_count
                    FROM sales
                    WHERE date(datetime(created_at, 'localtime', '-' || @cutoff || ' hours')) = @bdate
                      AND status = 'cancelled'
                      AND id NOT LIKE 'demo_%'
                      AND id NOT LIKE 'stress_%';
                ";
                using (var cmd = new SQLiteCommand(cancelledSql, conn))
                {
                    cmd.Parameters.AddWithValue("@cutoff", cutoff);
                    cmd.Parameters.AddWithValue("@bdate", businessDate);
                    using (var reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            preview.CancelledTotalPiasters = Convert.ToInt64(reader["total_cancelled"]);
                            preview.CancelledCount = Convert.ToInt32(reader["cancelled_count"]);
                        }
                    }
                }

                // 5. Returns
                using (var checkRetCmd = new SQLiteCommand("SELECT name FROM sqlite_master WHERE type='table' AND name='returns';", conn))
                {
                    if (checkRetCmd.ExecuteScalar() != null)
                    {
                        string returnsSql = @"
                            SELECT 
                                COALESCE(SUM(total_piasters), 0) AS total_returns,
                                COALESCE(SUM(CASE WHEN refund_method = 'cash' THEN total_piasters ELSE 0 END), 0) AS cash_returns,
                                COUNT(*) AS ret_count
                            FROM returns
                            WHERE date(datetime(created_at, 'localtime', '-' || @cutoff || ' hours')) = @bdate;
                        ";
                        using (var cmd = new SQLiteCommand(returnsSql, conn))
                        {
                            cmd.Parameters.AddWithValue("@cutoff", cutoff);
                            cmd.Parameters.AddWithValue("@bdate", businessDate);
                            using (var reader = cmd.ExecuteReader())
                            {
                                if (reader.Read())
                                {
                                    preview.ReturnsTotalPiasters = Convert.ToInt64(reader["total_returns"]);
                                    preview.ReturnsCashPiasters = Convert.ToInt64(reader["cash_returns"]);
                                    preview.ReturnsCount = Convert.ToInt32(reader["ret_count"]);
                                }
                            }
                        }
                    }
                }

                // 6. Customer Debt Payments collected in cash (excluding sale deposits already counted in cash sales)
                string debtSql = @"
                    SELECT COALESCE(SUM(
                        CASE 
                            WHEN type = 'payment' THEN amount_piasters 
                            WHEN type = 'payment_cancel' THEN -amount_piasters 
                            ELSE 0 
                        END
                    ), 0) AS debt_payments
                    FROM customer_ledger
                    WHERE ((type = 'payment' AND sale_id IS NULL) OR type = 'payment_cancel')
                      AND (payment_method = 'cash' OR payment_method IS NULL OR payment_method = '')
                      AND date(datetime(created_at, 'localtime', '-' || @cutoff || ' hours')) = @bdate
                      AND customer_id NOT LIKE 'demo_%';
                ";
                using (var cmd = new SQLiteCommand(debtSql, conn))
                {
                    cmd.Parameters.AddWithValue("@cutoff", cutoff);
                    cmd.Parameters.AddWithValue("@bdate", businessDate);
                    object res = cmd.ExecuteScalar();
                    if (res != null && res != DBNull.Value)
                    {
                        preview.DebtPaymentsPiasters = Convert.ToInt64(res);
                    }
                }

                // 7. Gross profit & zero cost warning count
                string profitSql = @"
                    SELECT 
                        COALESCE(SUM((si.total_piasters - COALESCE(si.tax_piasters, 0)) - ((si.quantity_milli * si.unit_cost_piasters + 500) / 1000)), 0) AS total_profit,
                        COUNT(CASE WHEN si.unit_cost_piasters <= 0 THEN 1 END) AS zero_cost_count
                    FROM sale_items si
                    INNER JOIN sales s ON si.sale_id = s.id
                    WHERE date(datetime(s.created_at, 'localtime', '-' || @cutoff || ' hours')) = @bdate
                      AND s.status != 'cancelled'
                      AND s.id NOT LIKE 'demo_%'
                      AND s.id NOT LIKE 'stress_%';
                ";
                using (var cmd = new SQLiteCommand(profitSql, conn))
                {
                    cmd.Parameters.AddWithValue("@cutoff", cutoff);
                    cmd.Parameters.AddWithValue("@bdate", businessDate);
                    using (var reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            preview.GrossProfitPiasters = Convert.ToInt64(reader["total_profit"]);
                            preview.ZeroCostItemsCount = Convert.ToInt32(reader["zero_cost_count"]);
                        }
                    }
                }

                // Deduct the ex-VAT profit of items returned on this business date (symmetric with sales profit)
                using (var checkRetCmd = new SQLiteCommand("SELECT name FROM sqlite_master WHERE type='table' AND name='returns';", conn))
                {
                    if (checkRetCmd.ExecuteScalar() != null)
                    {
                        string retProfitSql = ReturnProfitSql.BuildTotals(
                            "date(datetime(r.created_at, 'localtime', '-' || @cutoff || ' hours')) = @bdate");
                        using (var cmd = new SQLiteCommand(retProfitSql, conn))
                        {
                            cmd.Parameters.AddWithValue("@cutoff", cutoff);
                            cmd.Parameters.AddWithValue("@bdate", businessDate);
                            object retProfRes = cmd.ExecuteScalar();
                            if (retProfRes != null && retProfRes != DBNull.Value)
                            {
                                long returnedProfit = Convert.ToInt64(retProfRes);
                                preview.GrossProfitPiasters = preview.GrossProfitPiasters - returnedProfit;
                            }
                        }
                    }
                }

                // 7. Cash Drawer & Operational Expenses for the business date
                string expensesSql = @"
                    SELECT 
                        COALESCE(SUM(amount_piasters), 0) AS total_expenses,
                        COALESCE(SUM(CASE WHEN (source = 'drawer' OR source IS NULL OR source = '') THEN amount_piasters ELSE 0 END), 0) AS drawer_expenses,
                        COALESCE(SUM(CASE WHEN (source = 'safe' OR source = 'main_safe') THEN amount_piasters ELSE 0 END), 0) AS safe_expenses,
                        COUNT(*) AS expenses_count
                    FROM expenses
                    WHERE business_date = @bdate
                      AND (is_cancelled = 0 OR is_cancelled IS NULL);
                ";
                using (var cmd = new SQLiteCommand(expensesSql, conn))
                {
                    cmd.Parameters.AddWithValue("@bdate", businessDate);
                    using (var reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            preview.ExpensesPiasters = Convert.ToInt64(reader["total_expenses"]);
                            preview.DrawerExpensesPiasters = Convert.ToInt64(reader["drawer_expenses"]);
                            preview.SafeExpensesPiasters = Convert.ToInt64(reader["safe_expenses"]);
                            preview.ExpensesCount = Convert.ToInt32(reader["expenses_count"]);
                        }
                    }
                }

                // 8. Electronic Payment Terminals (SuperPay / Fawry / Aman) & Till
                using (var checkEpayCmd = new SQLiteCommand("SELECT name FROM sqlite_master WHERE type='table' AND name='epay_transactions';", conn))
                {
                    if (checkEpayCmd.ExecuteScalar() != null)
                    {
                        string epaySql = @"
                            SELECT 
                                (SELECT COALESCE(SUM(balance_piasters), 0) FROM epay_terminals WHERE is_active = 1) AS terminals_balance,
                                COALESCE(SUM(CASE WHEN payment_channel = 'terminal_till' THEN (CASE WHEN service_type = 'cash_out' THEN (customer_fee_piasters - bill_amount_piasters) ELSE total_received_piasters END) ELSE 0 END), 0) AS till_cash,
                                COALESCE(SUM(CASE WHEN payment_channel = 'cash_drawer' THEN (CASE WHEN service_type = 'cash_out' THEN (customer_fee_piasters - bill_amount_piasters) ELSE total_received_piasters END) ELSE 0 END), 0) AS drawer_cash,
                                COALESCE(SUM(net_profit_piasters), 0) AS net_profit
                            FROM epay_transactions
                            WHERE date(datetime(created_at, 'localtime', '-' || @cutoff || ' hours')) = @bdate
                              AND status = 'completed';
                        ";
                        using (var epayCmd = new SQLiteCommand(epaySql, conn))
                        {
                            epayCmd.Parameters.AddWithValue("@cutoff", cutoff);
                            epayCmd.Parameters.AddWithValue("@bdate", businessDate);
                            using (var reader = epayCmd.ExecuteReader())
                            {
                                if (reader.Read())
                                {
                                    preview.EpayTerminalsBalancePiasters = Convert.ToInt64(reader["terminals_balance"]);
                                    preview.EpayTillCashPiasters = Convert.ToInt64(reader["till_cash"]);
                                    preview.EpayDrawerCashPiasters = Convert.ToInt64(reader["drawer_cash"]);
                                    preview.EpayNetProfitPiasters = Convert.ToInt64(reader["net_profit"]);
                                }
                            }
                        }

                        string fundingSql = @"
                            SELECT COALESCE(SUM(amount_piasters), 0)
                            FROM epay_terminal_fundings
                            WHERE date(datetime(created_at, 'localtime', '-' || @cutoff || ' hours')) = @bdate
                              AND funding_source = 'cash_drawer';
                        ";
                        using (var fundCmd = new SQLiteCommand(fundingSql, conn))
                        {
                            fundCmd.Parameters.AddWithValue("@cutoff", cutoff);
                            fundCmd.Parameters.AddWithValue("@bdate", businessDate);
                            object fundRes = fundCmd.ExecuteScalar();
                            if (fundRes != null && fundRes != DBNull.Value)
                            {
                                preview.EpayDrawerFundingPiasters = Convert.ToInt64(fundRes);
                            }
                        }
                    }
                }

                // 8.B Digital Wallets & InstaPay Accounts (Vodafone Cash, InstaPay, etc.)
                using (var checkDigCmd = new SQLiteCommand("SELECT name FROM sqlite_master WHERE type='table' AND name='digital_transactions';", conn))
                {
                    if (checkDigCmd.ExecuteScalar() != null)
                    {
                        string digSql = @"
                            SELECT 
                                (SELECT COALESCE(SUM(balance_piasters), 0) FROM digital_accounts WHERE is_active = 1) AS wallets_balance,
                                COALESCE(SUM(CASE WHEN payment_destination = 'cash_drawer' THEN 
                                    (CASE WHEN tx_type = 'cash_out' THEN total_collected_piasters 
                                          WHEN tx_type = 'cash_in' THEN (profit_piasters - amount_piasters) 
                                          ELSE 0 END) 
                                    ELSE 0 END), 0) AS drawer_cash,
                                COALESCE(SUM(profit_piasters), 0) AS net_profit
                            FROM digital_transactions
                            WHERE date(datetime(created_at, 'localtime', '-' || @cutoff || ' hours')) = @bdate
                              AND status = 'completed';
                        ";
                        using (var digCmd = new SQLiteCommand(digSql, conn))
                        {
                            digCmd.Parameters.AddWithValue("@cutoff", cutoff);
                            digCmd.Parameters.AddWithValue("@bdate", businessDate);
                            using (var reader = digCmd.ExecuteReader())
                            {
                                if (reader.Read())
                                {
                                    preview.WalletsBalancePiasters = Convert.ToInt64(reader["wallets_balance"]);
                                    preview.WalletsDrawerCashPiasters = Convert.ToInt64(reader["drawer_cash"]);
                                    preview.WalletsNetProfitPiasters = Convert.ToInt64(reader["net_profit"]);
                                }
                            }
                        }

                        string digFundSql = @"
                            SELECT COALESCE(SUM(amount_piasters), 0)
                            FROM digital_account_fundings
                            WHERE date(datetime(created_at, 'localtime', '-' || @cutoff || ' hours')) = @bdate
                              AND funding_source = 'cash_drawer';
                        ";
                        using (var fundCmd = new SQLiteCommand(digFundSql, conn))
                        {
                            fundCmd.Parameters.AddWithValue("@cutoff", cutoff);
                            fundCmd.Parameters.AddWithValue("@bdate", businessDate);
                            object fundRes = fundCmd.ExecuteScalar();
                            if (fundRes != null && fundRes != DBNull.Value)
                            {
                                preview.WalletsDrawerFundingPiasters = Convert.ToInt64(fundRes);
                            }
                        }
                    }
                }

                // 8.C Purchases Cash Paid from Drawer
                using (var checkPurCmd = new SQLiteCommand("SELECT name FROM sqlite_master WHERE type='table' AND name='purchases';", conn))
                {
                    if (checkPurCmd.ExecuteScalar() != null)
                    {
                        bool hasPurSourceCol = false;
                        using (var pragmaCmd = new SQLiteCommand("PRAGMA table_info(purchases);", conn))
                        using (var reader = pragmaCmd.ExecuteReader())
                        {
                            while (reader.Read())
                            {
                                if (string.Equals(reader["name"].ToString(), "payment_source", StringComparison.OrdinalIgnoreCase))
                                {
                                    hasPurSourceCol = true;
                                    break;
                                }
                            }
                        }

                        string purSql = hasPurSourceCol
                            ? @"SELECT COALESCE(SUM(paid_amount_piasters), 0)
                                FROM purchases
                                WHERE date(datetime(created_at, 'localtime', '-' || @cutoff || ' hours')) = @bdate
                                  AND status != 'cancelled'
                                  AND (payment_source = 'cash_drawer' OR payment_source IS NULL OR payment_source = '');"
                            : @"SELECT COALESCE(SUM(paid_amount_piasters), 0)
                                FROM purchases
                                WHERE date(datetime(created_at, 'localtime', '-' || @cutoff || ' hours')) = @bdate
                                  AND status != 'cancelled';";

                        using (var purCmd = new SQLiteCommand(purSql, conn))
                        {
                            purCmd.Parameters.AddWithValue("@cutoff", cutoff);
                            purCmd.Parameters.AddWithValue("@bdate", businessDate);
                            object purRes = purCmd.ExecuteScalar();
                            if (purRes != null && purRes != DBNull.Value)
                            {
                                preview.PurchasesDrawerCashPiasters = Convert.ToInt64(purRes);
                            }
                        }
                    }
                }

                // 8.D Supplier Direct Payments from Drawer
                using (var checkSuppCmd = new SQLiteCommand("SELECT name FROM sqlite_master WHERE type='table' AND name='supplier_transactions';", conn))
                {
                    if (checkSuppCmd.ExecuteScalar() != null)
                    {
                        bool hasSuppSourceCol = false;
                        using (var pragmaCmd = new SQLiteCommand("PRAGMA table_info(supplier_transactions);", conn))
                        using (var reader = pragmaCmd.ExecuteReader())
                        {
                            while (reader.Read())
                            {
                                if (string.Equals(reader["name"].ToString(), "payment_source", StringComparison.OrdinalIgnoreCase))
                                {
                                    hasSuppSourceCol = true;
                                    break;
                                }
                            }
                        }

                        string suppSql = hasSuppSourceCol
                            ? @"SELECT COALESCE(SUM(
                                    CASE 
                                        WHEN transaction_type = 'PAYMENT' THEN ABS(amount_piasters)
                                        WHEN transaction_type = 'PAYMENT_CANCEL' THEN -ABS(amount_piasters)
                                        ELSE 0 
                                    END
                                ), 0)
                                FROM supplier_transactions
                                WHERE date(datetime(created_at, 'localtime', '-' || @cutoff || ' hours')) = @bdate
                                  AND (transaction_type = 'PAYMENT' OR transaction_type = 'PAYMENT_CANCEL')
                                  AND (payment_source = 'cash_drawer' OR payment_source IS NULL OR payment_source = '');"
                            : @"SELECT COALESCE(SUM(
                                    CASE 
                                        WHEN transaction_type = 'PAYMENT' THEN ABS(amount_piasters)
                                        WHEN transaction_type = 'PAYMENT_CANCEL' THEN -ABS(amount_piasters)
                                        ELSE 0 
                                    END
                                ), 0)
                                FROM supplier_transactions
                                WHERE date(datetime(created_at, 'localtime', '-' || @cutoff || ' hours')) = @bdate
                                  AND (transaction_type = 'PAYMENT' OR transaction_type = 'PAYMENT_CANCEL');";

                        using (var suppCmd = new SQLiteCommand(suppSql, conn))
                        {
                            suppCmd.Parameters.AddWithValue("@cutoff", cutoff);
                            suppCmd.Parameters.AddWithValue("@bdate", businessDate);
                            object suppRes = suppCmd.ExecuteScalar();
                            if (suppRes != null && suppRes != DBNull.Value)
                            {
                                preview.SupplierPaymentsDrawerCashPiasters = Convert.ToInt64(suppRes);
                            }
                        }
                    }
                }

                // F-02, F-22, F-24 & F-08: Unified Senior Drawer Cash Calculation without zero-clamping
                DateTime bDate;
                if (!DateTime.TryParse(businessDate, out bDate))
                {
                    bDate = BusinessDayHelper.GetCurrentBusinessDate(conn, null);
                }
                DateTime wStart, wEnd;
                BusinessDayHelper.GetBusinessDayWindow(conn, null, bDate, out wStart, out wEnd);

                var calc = DrawerCashCalculator.Calculate(conn, null, wStart, wEnd, null);
                preview.ExpectedCashPiasters = calc.ExpectedCashPiasters;
                preview.OpeningFloatPiasters = calc.OpeningFloatPiasters;
                preview.ManualCashInPiasters = calc.ManualCashInPiasters;
                preview.ManualCashOutPiasters = calc.ManualCashOutPiasters;
                preview.WalletsDrawerCashPiasters = calc.WalletsNetCashPiasters;
                preview.WalletsDrawerFundingPiasters = calc.WalletFundingPiasters;
                preview.EpayDrawerCashPiasters = calc.EpayNetCashPiasters;
                preview.EpayDrawerFundingPiasters = calc.TerminalFundingPiasters;
                preview.PurchasesDrawerCashPiasters = calc.PurchasesCashPiasters;
                preview.SupplierPaymentsDrawerCashPiasters = calc.SupplierPaymentsPiasters;

                PopulateEpayAndWalletsDetails(conn, preview, businessDate, cutoff);
            }

            return preview;
        }

        private static bool TableExists(SQLiteConnection conn, string tableName)
        {
            using (var cmd = new SQLiteCommand("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = @name LIMIT 1;", conn))
            {
                cmd.Parameters.AddWithValue("@name", tableName);
                return cmd.ExecuteScalar() != null;
            }
        }

        private void PopulateEpayAndWalletsDetails(SQLiteConnection conn, DailyClosingPreview preview, string businessDate, int cutoff)
        {
            preview.EpayTerminalsSummary = new List<DailyClosingEpayTerminalSummary>();
            preview.EpayTransactions = new List<DailyClosingEpayTransactionItem>();
            preview.WalletsSummary = new List<DailyClosingWalletSummary>();
            preview.WalletTransactions = new List<DailyClosingWalletTransactionItem>();

            // 1. Epay Terminals & Transactions
            if (TableExists(conn, "epay_terminals") && TableExists(conn, "epay_transactions"))
            {
                // Terminals summary
                string termSql = @"
                    SELECT m.id, m.name, m.provider, m.balance_piasters,
                           COUNT(t.id) AS tx_count,
                           COALESCE(SUM(CASE WHEN t.payment_channel = 'terminal_till' THEN 
                               (CASE WHEN t.service_type = 'cash_out' THEN (t.customer_fee_piasters - t.bill_amount_piasters) ELSE t.total_received_piasters END)
                               ELSE 0 END), 0) AS till_cash,
                           COALESCE(SUM(CASE WHEN t.payment_channel = 'cash_drawer' THEN 
                               (CASE WHEN t.service_type = 'cash_out' THEN (t.customer_fee_piasters - t.bill_amount_piasters) ELSE t.total_received_piasters END)
                               ELSE 0 END), 0) AS drawer_cash,
                           COALESCE(SUM(t.net_profit_piasters), 0) AS net_profit
                    FROM epay_terminals m
                    LEFT JOIN epay_transactions t ON t.terminal_id = m.id 
                        AND date(datetime(t.created_at, 'localtime', '-' || @cutoff || ' hours')) = @bdate
                        AND t.status = 'completed'
                    WHERE m.is_active = 1
                    GROUP BY m.id, m.name, m.provider, m.balance_piasters
                    ORDER BY m.name ASC;";

                using (var cmd = new SQLiteCommand(termSql, conn))
                {
                    cmd.Parameters.AddWithValue("@cutoff", cutoff);
                    cmd.Parameters.AddWithValue("@bdate", businessDate);
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            var s = new DailyClosingEpayTerminalSummary();
                            s.TerminalId = reader["id"].ToString();
                            s.TerminalName = reader["name"].ToString();
                            s.Provider = reader["provider"] != DBNull.Value ? reader["provider"].ToString() : "";
                            s.CurrentBalancePiasters = Convert.ToInt64(reader["balance_piasters"]);
                            s.TransactionsCount = Convert.ToInt32(reader["tx_count"]);
                            s.TillCashPiasters = Convert.ToInt64(reader["till_cash"]);
                            s.DrawerCashPiasters = Convert.ToInt64(reader["drawer_cash"]);
                            s.NetProfitPiasters = Convert.ToInt64(reader["net_profit"]);
                            preview.EpayTerminalsSummary.Add(s);
                        }
                    }
                }

                // Epay Transactions of the day
                string epayTxSql = @"
                    SELECT t.id, t.terminal_id, COALESCE(m.name, 'ماكينة غير معروفة') AS terminal_name,
                           t.service_type, t.service_name, t.bill_amount_piasters, t.customer_fee_piasters,
                           t.total_received_piasters, t.net_profit_piasters, t.payment_channel,
                           t.cashier_name, t.reference_number, t.created_at
                    FROM epay_transactions t
                    LEFT JOIN epay_terminals m ON t.terminal_id = m.id
                    WHERE date(datetime(t.created_at, 'localtime', '-' || @cutoff || ' hours')) = @bdate
                      AND t.status = 'completed'
                    ORDER BY t.created_at DESC;";

                using (var cmd = new SQLiteCommand(epayTxSql, conn))
                {
                    cmd.Parameters.AddWithValue("@cutoff", cutoff);
                    cmd.Parameters.AddWithValue("@bdate", businessDate);
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            var item = new DailyClosingEpayTransactionItem();
                            item.Id = reader["id"].ToString();
                            item.TerminalId = reader["terminal_id"].ToString();
                            item.TerminalName = reader["terminal_name"].ToString();
                            item.ServiceType = reader["service_type"] != DBNull.Value ? reader["service_type"].ToString() : "";
                            item.ServiceName = reader["service_name"] != DBNull.Value ? reader["service_name"].ToString() : "";
                            item.BillAmountPiasters = Convert.ToInt64(reader["bill_amount_piasters"]);
                            item.CustomerFeePiasters = Convert.ToInt64(reader["customer_fee_piasters"]);
                            item.TotalReceivedPiasters = Convert.ToInt64(reader["total_received_piasters"]);
                            item.NetProfitPiasters = Convert.ToInt64(reader["net_profit_piasters"]);
                            item.PaymentChannel = reader["payment_channel"] != DBNull.Value ? reader["payment_channel"].ToString() : "cash_drawer";
                            item.CashierName = reader["cashier_name"] != DBNull.Value ? reader["cashier_name"].ToString() : "";
                            item.ReferenceNumber = reader["reference_number"] != DBNull.Value ? reader["reference_number"].ToString() : "";
                            item.CreatedAt = reader["created_at"].ToString();
                            preview.EpayTransactions.Add(item);
                        }
                    }
                }
            }

            // 2. Digital Accounts & Wallets
            if (TableExists(conn, "digital_accounts") && TableExists(conn, "digital_transactions"))
            {
                // Wallets summary
                string walSql = @"
                    SELECT a.id, a.name, a.type, a.provider, a.balance_piasters,
                           COUNT(t.id) AS tx_count,
                           COALESCE(SUM(CASE WHEN t.tx_type IN ('cash_in', 'pos_sale') THEN t.amount_piasters ELSE 0 END), 0) AS total_in,
                           COALESCE(SUM(CASE WHEN t.tx_type = 'cash_out' THEN t.amount_piasters ELSE 0 END), 0) AS total_out,
                           COALESCE(SUM(CASE WHEN t.payment_destination = 'cash_drawer' THEN 
                               (CASE WHEN t.tx_type = 'cash_out' THEN t.total_collected_piasters 
                                     WHEN t.tx_type = 'cash_in' THEN (t.profit_piasters - t.amount_piasters) 
                                     ELSE 0 END) 
                               ELSE 0 END), 0) AS drawer_cash,
                           COALESCE(SUM(t.profit_piasters), 0) AS net_profit
                    FROM digital_accounts a
                    LEFT JOIN digital_transactions t ON t.account_id = a.id
                        AND date(datetime(t.created_at, 'localtime', '-' || @cutoff || ' hours')) = @bdate
                        AND t.status = 'completed'
                    WHERE a.is_active = 1
                    GROUP BY a.id, a.name, a.type, a.provider, a.balance_piasters
                    ORDER BY a.name ASC;";

                using (var cmd = new SQLiteCommand(walSql, conn))
                {
                    cmd.Parameters.AddWithValue("@cutoff", cutoff);
                    cmd.Parameters.AddWithValue("@bdate", businessDate);
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            var ws = new DailyClosingWalletSummary();
                            ws.AccountId = reader["id"].ToString();
                            ws.AccountName = reader["name"].ToString();
                            ws.AccountType = reader["type"] != DBNull.Value ? reader["type"].ToString() : "wallet";
                            ws.Provider = reader["provider"] != DBNull.Value ? reader["provider"].ToString() : "";
                            ws.CurrentBalancePiasters = Convert.ToInt64(reader["balance_piasters"]);
                            ws.TransactionsCount = Convert.ToInt32(reader["tx_count"]);
                            ws.TotalInPiasters = Convert.ToInt64(reader["total_in"]);
                            ws.TotalOutPiasters = Convert.ToInt64(reader["total_out"]);
                            ws.DrawerCashImpactPiasters = Convert.ToInt64(reader["drawer_cash"]);
                            ws.NetProfitPiasters = Convert.ToInt64(reader["net_profit"]);
                            preview.WalletsSummary.Add(ws);
                        }
                    }
                }

                // Digital transactions of the day
                string walTxSql = @"
                    SELECT t.id, t.account_id, COALESCE(a.name, 'محفظة غير معروفة') AS account_name,
                           COALESCE(a.type, 'wallet') AS account_type,
                           t.tx_type, t.amount_piasters, t.profit_piasters, t.total_collected_piasters,
                           t.customer_phone, t.customer_name, t.payment_destination,
                           t.cashier_name, t.notes, t.created_at
                    FROM digital_transactions t
                    LEFT JOIN digital_accounts a ON t.account_id = a.id
                    WHERE date(datetime(t.created_at, 'localtime', '-' || @cutoff || ' hours')) = @bdate
                      AND t.status = 'completed'
                    ORDER BY t.created_at DESC;";

                using (var cmd = new SQLiteCommand(walTxSql, conn))
                {
                    cmd.Parameters.AddWithValue("@cutoff", cutoff);
                    cmd.Parameters.AddWithValue("@bdate", businessDate);
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            var wtx = new DailyClosingWalletTransactionItem();
                            wtx.Id = reader["id"].ToString();
                            wtx.AccountId = reader["account_id"].ToString();
                            wtx.AccountName = reader["account_name"].ToString();
                            wtx.AccountType = reader["account_type"].ToString();
                            wtx.TxType = reader["tx_type"] != DBNull.Value ? reader["tx_type"].ToString() : "";
                            wtx.AmountPiasters = Convert.ToInt64(reader["amount_piasters"]);
                            wtx.ProfitPiasters = Convert.ToInt64(reader["profit_piasters"]);
                            wtx.TotalCollectedPiasters = Convert.ToInt64(reader["total_collected_piasters"]);
                            wtx.CustomerPhone = reader["customer_phone"] != DBNull.Value ? reader["customer_phone"].ToString() : "";
                            wtx.CustomerName = reader["customer_name"] != DBNull.Value ? reader["customer_name"].ToString() : "";
                            wtx.PaymentDestination = reader["payment_destination"] != DBNull.Value ? reader["payment_destination"].ToString() : "cash_drawer";
                            wtx.CashierName = reader["cashier_name"] != DBNull.Value ? reader["cashier_name"].ToString() : "";
                            wtx.Notes = reader["notes"] != DBNull.Value ? reader["notes"].ToString() : "";
                            wtx.CreatedAt = reader["created_at"].ToString();
                            preview.WalletTransactions.Add(wtx);
                        }
                    }
                }
            }
        }

        private int CountOpenShifts(string businessDate)
        {
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var pragmaCmd = new SQLiteCommand("PRAGMA temp_store = MEMORY;", conn))
                {
                    pragmaCmd.ExecuteNonQuery();
                }
                string sql = string.IsNullOrEmpty(businessDate)
                    ? "SELECT COUNT(*) FROM shifts WHERE status = 'open';"
                    : "SELECT COUNT(*) FROM shifts WHERE status = 'open' AND business_date <= @bdate;";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    if (!string.IsNullOrEmpty(businessDate))
                    {
                        cmd.Parameters.AddWithValue("@bdate", businessDate);
                    }
                    object res = cmd.ExecuteScalar();
                    return res != null && res != DBNull.Value ? Convert.ToInt32(res) : 0;
                }
            }
        }

        public AutoCloseShiftsResult AutoClosePendingShifts(string businessDate, string supervisorId, string supervisorName, string notes = null)
        {
            if (string.IsNullOrEmpty(businessDate))
            {
                businessDate = GetCurrentBusinessDate();
            }

            lock (SaleService.FinancialWriteLock)
            {
                var openShifts = _shiftRepo.GetOpenShifts(businessDate);
                var result = new AutoCloseShiftsResult();
                result.ClosedShiftNumbers = new List<int>();

                if (openShifts == null || openShifts.Count == 0)
                {
                    result.ClosedCount = 0;
                    result.TotalExpectedCashPiasters = 0;
                    result.Message = "لا توجد أي ورديات مفتوحة لتسويتها.";
                    return result;
                }

                using (var conn = new SQLiteConnection(_connectionString))
                {
                    conn.Open();
                    using (var trans = conn.BeginTransaction())
                    {
                        try
                        {
                            long totalCash = 0;
                            foreach (var shift in openShifts)
                            {
                                shift.ClosedAt = DateTime.UtcNow.ToString("o");
                                var summary = _shiftRepo.CalculateShiftMetrics(shift);

                                long expectedCash = summary != null ? summary.ExpectedCashPiasters : 0;
                                totalCash += expectedCash;

                                shift.Status = "closed";
                                shift.CashSalesPiasters = summary != null ? summary.CashSalesPiasters : 0;
                                shift.CardSalesPiasters = summary != null ? summary.CardSalesPiasters : 0;
                                shift.InstapaySalesPiasters = summary != null ? summary.InstapaySalesPiasters : 0;
                                shift.VodafoneCashSalesPiasters = summary != null ? summary.VodafoneCashSalesPiasters : 0;
                                shift.CreditSalesPiasters = summary != null ? summary.CreditSalesPiasters : 0;
                                shift.ReturnsCashPiasters = summary != null ? summary.ReturnsCashPiasters : 0;
                                shift.DebtPaymentsCashPiasters = summary != null ? summary.DebtPaymentsCashPiasters : 0;
                                shift.ExpensesCashPiasters = summary != null ? summary.ExpensesCashPiasters : 0;
                                shift.CashInPiasters = summary != null ? summary.CashInPiasters : 0;
                                shift.CashOutPiasters = summary != null ? summary.CashOutPiasters : 0;
                                shift.EpayCashPiasters = summary != null ? summary.EpayCashPiasters : 0;
                                shift.WalletsCashPiasters = summary != null ? summary.WalletsCashPiasters : 0;
                                shift.PurchasesCashPiasters = summary != null ? summary.PurchasesCashPiasters : 0;
                                shift.SupplierPaymentsCashPiasters = summary != null ? summary.SupplierPaymentsCashPiasters : 0;
                                shift.ExpectedCashPiasters = expectedCash;
                                shift.ActualCashPiasters = expectedCash;
                                shift.DifferencePiasters = 0;
                                shift.InvoicesCount = summary != null ? summary.InvoicesCount : 0;

                                string autoNote = string.Format("إغلاق وتسوية تلقائية مع اليومية بواسطة {0}", string.IsNullOrEmpty(supervisorName) ? "المشرف" : supervisorName);
                                if (!string.IsNullOrEmpty(notes))
                                {
                                    autoNote += " (" + notes.Trim() + ")";
                                }
                                shift.Notes = string.IsNullOrEmpty(shift.Notes) ? autoNote : (shift.Notes + " | " + autoNote);
                                shift.UpdatedAt = DateTime.UtcNow.ToString("o");

                                _shiftRepo.CloseShift(shift, conn, trans);

                                _auditRepo.Log(
                                    conn,
                                    trans,
                                    new AuditLog
                                    {
                                        UserId = string.IsNullOrEmpty(supervisorId) ? "system" : supervisorId,
                                        Action = "SHIFT_AUTO_CLOSE_BY_DAILY_CLOSING",
                                        EntityType = "shift",
                                        EntityId = shift.Id,
                                        DetailsJson = string.Format(
                                            "{{\"shiftNumber\":{0},\"cashierId\":\"{1}\",\"expectedCash\":{2},\"autoClosed\":true}}",
                                            shift.ShiftNumber, shift.CashierId, expectedCash
                                        )
                                    }
                                );

                                result.ClosedShiftNumbers.Add(shift.ShiftNumber);
                            }

                            trans.Commit();

                            result.ClosedCount = openShifts.Count;
                            result.TotalExpectedCashPiasters = totalCash;
                            result.Message = string.Format("تم بنجاح تسوية وإغلاق {0} وردية مفتوحة.", openShifts.Count);
                            Logger.Info(string.Format("تم إغلاق {0} وردية معلقة تلقائياً مع الإقفال اليومي لتاريخ {1}", openShifts.Count, businessDate));
                            return result;
                        }
                        catch (Exception ex)
                        {
                            trans.Rollback();
                            Logger.Error("فشلت التسوية التلقائية للورديات المعلقة مع الإقفال اليومي", ex);
                            throw;
                        }
                    }
                }
            }
        }

        public LiveDrawerBalanceResult GetLiveDrawerBalance(string businessDate = null)
        {
            var preview = GetClosingPreview(businessDate);
            var res = new LiveDrawerBalanceResult();
            res.BusinessDate = preview.BusinessDate;
            res.AvailableCashPiasters = preview.ExpectedCashPiasters;
            res.CashSalesPiasters = preview.CashSalesPiasters;
            res.ReturnsCashPiasters = preview.ReturnsCashPiasters;
            res.DebtPaymentsPiasters = preview.DebtPaymentsPiasters;
            res.ExpensesPiasters = preview.ExpensesPiasters;
            res.EpayDrawerCashPiasters = preview.EpayDrawerCashPiasters;
            res.EpayDrawerFundingPiasters = preview.EpayDrawerFundingPiasters;
            res.WalletsDrawerCashPiasters = preview.WalletsDrawerCashPiasters;
            res.WalletsDrawerFundingPiasters = preview.WalletsDrawerFundingPiasters;
            res.PurchasesDrawerCashPiasters = preview.PurchasesDrawerCashPiasters;
            res.SupplierPaymentsDrawerCashPiasters = preview.SupplierPaymentsDrawerCashPiasters;
            return res;
        }

        public bool IsDayClosed(string businessDate)
        {
            if (string.IsNullOrWhiteSpace(businessDate)) return false;
            return _closingRepo.GetByBusinessDate(businessDate.Trim()) != null;
        }

        public DailyClosing SaveClosing(DailyClosingSaveRequest request)
        {
            lock (SaleService.FinancialWriteLock)
            {
                return SaveClosingCore(request);
            }
        }

        private DailyClosing SaveClosingCore(DailyClosingSaveRequest request)
        {
            if (request == null)
            {
                throw new ArgumentNullException("request", "بيانات طلب قفل اليومية غير صحيحة");
            }

            string businessDate = string.IsNullOrEmpty(request.BusinessDate)
                ? GetCurrentBusinessDate()
                : request.BusinessDate;

            // Check if already closed
            var existing = _closingRepo.GetByBusinessDate(businessDate);
            if (existing != null)
            {
                throw new InvalidOperationException(string.Format("تم إقفال هذا اليوم بالفعل مسبقاً برقم إقفال #{0} بتاريخ {1}.", existing.ClosingNumber, existing.ClosedAt));
            }

            if (request.AutoClosePendingShifts)
            {
                AutoClosePendingShifts(businessDate, request.CashierId, request.CashierName, request.Notes);
            }

            // Sealing a day while a shift is still open would freeze totals that the open shift keeps changing
            int openShifts = CountOpenShifts(businessDate);
            if (openShifts > 0)
            {
                throw new InvalidOperationException(string.Format("لا يمكن إقفال اليومية لتاريخ {0} لوجود {1} وردية مفتوحة. يرجى استخدام زر تسوية وإغلاق الورديات أولاً ثم إقفال اليومية.", businessDate, openShifts));
            }

            // Check suspicious clock date (Task 127-4)
            var clockCheck = TimeGuard.ValidateSystemClock(_connectionString);
            if (!clockCheck.IsValid && !request.ConfirmSuspiciousDate)
            {
                throw new InvalidOperationException("تحذير أمان: تاريخ وساعة الجهاز مشكوك فيهما. يتطلب الإقفال تأكيداً صريحاً للمتابعة.");
            }

            // Server-side calculation of official preview numbers
            var preview = GetClosingPreview(businessDate);

            long actualCash = request.ActualCashPiasters;
            long diffPiasters = actualCash - preview.ExpectedCashPiasters;

            var closing = new DailyClosing
            {
                Id = Guid.NewGuid().ToString(),
                BusinessDate = businessDate,
                ClosedAt = DateTime.UtcNow.ToString("o"),
                CashierId = request.CashierId,
                CashierName = request.CashierName ?? "الكاشير",
                TotalSalesPiasters = preview.TotalSalesPiasters,
                CashSalesPiasters = preview.CashSalesPiasters,
                CardSalesPiasters = preview.CardSalesPiasters,
                InstapaySalesPiasters = preview.InstapaySalesPiasters,
                VodafoneCashSalesPiasters = preview.VodafoneCashSalesPiasters,
                CreditSalesPiasters = preview.CreditSalesPiasters,
                InsuranceSalesPiasters = preview.InsuranceSalesPiasters,
                ExpensesPiasters = preview.ExpensesPiasters,
                ReturnsTotalPiasters = preview.ReturnsTotalPiasters,
                ReturnsCashPiasters = preview.ReturnsCashPiasters,
                CancelledTotalPiasters = preview.CancelledTotalPiasters,
                DebtPaymentsPiasters = preview.DebtPaymentsPiasters,
                ExpectedCashPiasters = preview.ExpectedCashPiasters,
                ActualCashPiasters = actualCash,
                DifferencePiasters = diffPiasters,
                GrossProfitPiasters = preview.GrossProfitPiasters,
                InvoicesCount = preview.InvoicesCount,
                ReturnsCount = preview.ReturnsCount,
                CancelledCount = preview.CancelledCount,
                Notes = request.Notes,
                SummaryJson = JsonConvert.SerializeObject(preview),
                IsSealed = true
            };

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var pragmaCmd = new SQLiteCommand("PRAGMA temp_store = MEMORY;", conn))
                {
                    pragmaCmd.ExecuteNonQuery();
                }
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        // Generate sequential closing number atomically
                        closing.ClosingNumber = _counterRepo.GetNextCounterNumber(conn, trans, "daily_closing");

                        // Insert into immutable daily_closings
                        _closingRepo.Insert(closing, conn, trans);

                        // Log to tamper-evident audit logs
                        string details = string.Format(
                            "{{\"closingNumber\":{0},\"businessDate\":\"{1}\",\"sales\":{2},\"expectedCash\":{3},\"actualCash\":{4},\"diff\":{5}}}",
                            closing.ClosingNumber, closing.BusinessDate, closing.TotalSalesPiasters,
                            closing.ExpectedCashPiasters, closing.ActualCashPiasters, closing.DifferencePiasters
                        );

                        _auditRepo.Log(
                            conn,
                            trans,
                            new AuditLog
                            {
                                UserId = request.CashierId ?? "system",
                                Action = "DAILY_CLOSING",
                                EntityType = "daily_closing",
                                EntityId = closing.Id,
                                DetailsJson = details
                            }
                        );

                        trans.Commit();
                        Logger.Info(string.Format("تم إقفال اليومية بنجاح: رقم #{0} لتاريخ {1}، الفرق: {2} قرش", closing.ClosingNumber, closing.BusinessDate, closing.DifferencePiasters));
                    }
                    catch (Exception ex)
                    {
                        trans.Rollback();
                        Logger.Error("فشل حفظ إقفال اليومية", ex);
                        throw;
                    }
                }
            }

            return closing;
        }

        public UnclosedDayAlert CheckPreviousDayClosed()
        {
            var alert = new UnclosedDayAlert
            {
                HasUnclosedDay = false
            };

            string currentBusinessDate = GetCurrentBusinessDate();
            int cutoff = GetCutoffHour();

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var pragmaCmd = new SQLiteCommand("PRAGMA temp_store = MEMORY;", conn))
                {
                    pragmaCmd.ExecuteNonQuery();
                }
                // Find any date prior to currentBusinessDate that had sales but was never closed
                string sql = @"
                    SELECT 
                        date(datetime(created_at, 'localtime', '-' || @cutoff || ' hours')) AS bdate,
                        COUNT(*) AS sales_count,
                        COALESCE(SUM(total_piasters), 0) AS total_sales
                    FROM sales
                    WHERE date(datetime(created_at, 'localtime', '-' || @cutoff || ' hours')) < @today
                      AND status != 'cancelled'
                      AND id NOT LIKE 'demo_%'
                      AND id NOT LIKE 'stress_%'
                      AND date(datetime(created_at, 'localtime', '-' || @cutoff || ' hours')) NOT IN (
                          SELECT business_date FROM daily_closings
                      )
                    GROUP BY bdate
                    ORDER BY bdate DESC
                    LIMIT 1;
                ";

                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@cutoff", cutoff);
                    cmd.Parameters.AddWithValue("@today", currentBusinessDate);
                    using (var reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            alert.HasUnclosedDay = true;
                            alert.UnclosedDate = reader["bdate"].ToString();
                            alert.UnclosedSalesCount = Convert.ToInt32(reader["sales_count"]);
                            alert.UnclosedSalesTotalPiasters = Convert.ToInt64(reader["total_sales"]);
                        }
                    }
                }
            }

            return alert;
        }

        public List<DailyClosing> GetHistory(int limit)
        {
            return _closingRepo.GetHistory(limit);
        }

        public List<DailyClosing> GetHistory(int limit, string dateFrom, string dateTo)
        {
            return _closingRepo.GetHistory(limit, dateFrom, dateTo);
        }

        public DailyClosing GetById(string id)
        {
            return _closingRepo.GetById(id);
        }
    }
}
