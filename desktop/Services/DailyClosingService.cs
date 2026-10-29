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

        public DailyClosingService(
            string connectionString,
            DailyClosingRepository closingRepo,
            CounterRepository counterRepo,
            AuditLogRepository auditRepo,
            SettingsRepository settingsRepo)
        {
            _connectionString = connectionString;
            _closingRepo = closingRepo;
            _counterRepo = counterRepo;
            _auditRepo = auditRepo;
            _settingsRepo = settingsRepo;
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
                }

                return preview;
            }

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();

                // 3. Sales totals (Excluding cancelled and demo sales - strictly isolating cash, card, and credit)
                string salesSql = @"
                    SELECT 
                        COALESCE(SUM(s.total_piasters), 0) AS total_sales,
                        COALESCE(SUM(
                            CASE 
                                -- Cash kept in the drawer = paid minus change handed back (includes cash deposited to a customer account - Audit F-27)
                                WHEN s.payment_method = 'cash' THEN MAX(0, (s.paid_piasters - s.service_fee_piasters) - COALESCE(s.change_piasters, 0))
                                WHEN s.payment_method = 'credit' THEN MIN((s.paid_piasters - s.service_fee_piasters), s.total_piasters)
                                WHEN s.payment_method = 'multi' THEN MAX(0, (
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
                                WHEN s.payment_method = 'multi' THEN (
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
                                WHEN s.payment_method = 'multi' THEN (
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
                                WHEN s.payment_method = 'multi' THEN (
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
                                WHEN s.payment_method = 'insurance' THEN (s.paid_piasters - s.service_fee_piasters)
                                WHEN s.payment_method = 'multi' THEN (
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
                        COALESCE(SUM((si.total_piasters - COALESCE(si.tax_piasters, 0)) - (si.quantity_milli * si.unit_cost_piasters / 1000)), 0) AS total_profit,
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

                // Adjust gross profit by deducting gross profit of items returned on this business date
                using (var checkRetCmd = new SQLiteCommand("SELECT name FROM sqlite_master WHERE type='table' AND name='returns';", conn))
                {
                    if (checkRetCmd.ExecuteScalar() != null)
                    {
                        string retProfitSql = @"
                            SELECT COALESCE(SUM(
                                CASE 
                                    WHEN ri.is_damaged = 1 THEN ri.total_piasters
                                    ELSE (ri.total_piasters - (ri.quantity_milli * COALESCE(si.unit_cost_piasters, p.cost_piasters, 0) / 1000))
                                END
                            ), 0) AS returned_profit
                            FROM return_items ri
                            JOIN returns r ON ri.return_id = r.id
                            LEFT JOIN sale_items si ON ri.sale_item_id = si.id
                            LEFT JOIN products p ON ri.product_id = p.id
                            WHERE date(datetime(r.created_at, 'localtime', '-' || @cutoff || ' hours')) = @bdate;
                        ";
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
            }

            return preview;
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

        public DailyClosing GetById(string id)
        {
            return _closingRepo.GetById(id);
        }
    }
}
