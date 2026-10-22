using System;
using System.Collections.Generic;
using System.Data.SQLite;
using RafiqPOS.Models;

namespace RafiqPOS.Repositories
{
    public class ShiftRepository
    {
        private readonly string _connectionString;

        public ShiftRepository(string connectionString)
        {
            _connectionString = connectionString;
        }

        public Shift GetActiveShift(string posRegisterId = null, string cashierId = null)
        {
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    SELECT * FROM shifts 
                    WHERE status = 'open' 
                      AND (@reg IS NULL OR pos_register_id = @reg)
                      AND (@cashier IS NULL OR cashier_id = @cashier)
                    ORDER BY opened_at DESC 
                    LIMIT 1;
                ";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@reg", string.IsNullOrEmpty(posRegisterId) ? (object)DBNull.Value : posRegisterId);
                    cmd.Parameters.AddWithValue("@cashier", string.IsNullOrEmpty(cashierId) ? (object)DBNull.Value : cashierId);
                    using (var reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            return MapShift(reader);
                        }
                    }
                }

                // Fallback: If posRegisterId was specified but not matched, return active shift if only one is open
                if (!string.IsNullOrEmpty(posRegisterId))
                {
                    string fallbackSql = "SELECT * FROM shifts WHERE status = 'open' ORDER BY opened_at DESC LIMIT 1;";
                    using (var cmd = new SQLiteCommand(fallbackSql, conn))
                    using (var reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            return MapShift(reader);
                        }
                    }
                }
            }
            return null;
        }

        public Shift GetById(string shiftId)
        {
            if (string.IsNullOrEmpty(shiftId)) return null;

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand("SELECT * FROM shifts WHERE id = @id LIMIT 1;", conn))
                {
                    cmd.Parameters.AddWithValue("@id", shiftId);
                    using (var reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            return MapShift(reader);
                        }
                    }
                }
            }
            return null;
        }

        public void Insert(Shift shift, SQLiteConnection conn, SQLiteTransaction trans)
        {
            string sql = @"
                INSERT INTO shifts (
                    id, shift_number, cashier_id, cashier_name, pos_register_id,
                    business_date, opened_at, status, opening_float_piasters,
                    cash_sales_piasters, card_sales_piasters, instapay_sales_piasters,
                    vodafone_cash_sales_piasters, credit_sales_piasters, returns_cash_piasters,
                    debt_payments_cash_piasters, expenses_cash_piasters, cash_in_piasters,
                    cash_out_piasters, epay_cash_piasters, wallets_cash_piasters,
                    purchases_cash_piasters, supplier_payments_cash_piasters,
                    expected_cash_piasters, actual_cash_piasters, difference_piasters,
                    invoices_count, notes, created_at, updated_at
                ) VALUES (
                    @id, @shift_number, @cashier_id, @cashier_name, @pos_register_id,
                    @business_date, @opened_at, @status, @opening_float_piasters,
                    @cash_sales_piasters, @card_sales_piasters, @instapay_sales_piasters,
                    @vodafone_cash_sales_piasters, @credit_sales_piasters, @returns_cash_piasters,
                    @debt_payments_cash_piasters, @expenses_cash_piasters, @cash_in_piasters,
                    @cash_out_piasters, @epay_cash_piasters, @wallets_cash_piasters,
                    @purchases_cash_piasters, @supplier_payments_cash_piasters,
                    @expected_cash_piasters, @actual_cash_piasters, @difference_piasters,
                    @invoices_count, @notes, @created_at, @updated_at
                );
            ";

            using (var cmd = new SQLiteCommand(sql, conn, trans))
            {
                cmd.Parameters.AddWithValue("@id", shift.Id);
                cmd.Parameters.AddWithValue("@shift_number", shift.ShiftNumber);
                cmd.Parameters.AddWithValue("@cashier_id", shift.CashierId);
                cmd.Parameters.AddWithValue("@cashier_name", shift.CashierName);
                cmd.Parameters.AddWithValue("@pos_register_id", shift.PosRegisterId ?? "default_pos");
                cmd.Parameters.AddWithValue("@business_date", shift.BusinessDate);
                cmd.Parameters.AddWithValue("@opened_at", shift.OpenedAt);
                cmd.Parameters.AddWithValue("@status", shift.Status ?? "open");
                cmd.Parameters.AddWithValue("@opening_float_piasters", shift.OpeningFloatPiasters);
                cmd.Parameters.AddWithValue("@cash_sales_piasters", shift.CashSalesPiasters);
                cmd.Parameters.AddWithValue("@card_sales_piasters", shift.CardSalesPiasters);
                cmd.Parameters.AddWithValue("@instapay_sales_piasters", shift.InstapaySalesPiasters);
                cmd.Parameters.AddWithValue("@vodafone_cash_sales_piasters", shift.VodafoneCashSalesPiasters);
                cmd.Parameters.AddWithValue("@credit_sales_piasters", shift.CreditSalesPiasters);
                cmd.Parameters.AddWithValue("@returns_cash_piasters", shift.ReturnsCashPiasters);
                cmd.Parameters.AddWithValue("@debt_payments_cash_piasters", shift.DebtPaymentsCashPiasters);
                cmd.Parameters.AddWithValue("@expenses_cash_piasters", shift.ExpensesCashPiasters);
                cmd.Parameters.AddWithValue("@cash_in_piasters", shift.CashInPiasters);
                cmd.Parameters.AddWithValue("@cash_out_piasters", shift.CashOutPiasters);
                cmd.Parameters.AddWithValue("@epay_cash_piasters", shift.EpayCashPiasters);
                cmd.Parameters.AddWithValue("@wallets_cash_piasters", shift.WalletsCashPiasters);
                cmd.Parameters.AddWithValue("@purchases_cash_piasters", shift.PurchasesCashPiasters);
                cmd.Parameters.AddWithValue("@supplier_payments_cash_piasters", shift.SupplierPaymentsCashPiasters);
                cmd.Parameters.AddWithValue("@expected_cash_piasters", shift.ExpectedCashPiasters);
                cmd.Parameters.AddWithValue("@actual_cash_piasters", shift.ActualCashPiasters);
                cmd.Parameters.AddWithValue("@difference_piasters", shift.DifferencePiasters);
                cmd.Parameters.AddWithValue("@invoices_count", shift.InvoicesCount);
                cmd.Parameters.AddWithValue("@notes", shift.Notes);
                cmd.Parameters.AddWithValue("@created_at", shift.CreatedAt);
                cmd.Parameters.AddWithValue("@updated_at", shift.UpdatedAt);

                cmd.ExecuteNonQuery();
            }
        }

        public void CloseShift(Shift shift, SQLiteConnection conn, SQLiteTransaction trans)
        {
            string sql = @"
                UPDATE shifts SET
                    closed_at = @closed_at,
                    status = 'closed',
                    cash_sales_piasters = @cash_sales_piasters,
                    card_sales_piasters = @card_sales_piasters,
                    instapay_sales_piasters = @instapay_sales_piasters,
                    vodafone_cash_sales_piasters = @vodafone_cash_sales_piasters,
                    credit_sales_piasters = @credit_sales_piasters,
                    returns_cash_piasters = @returns_cash_piasters,
                    debt_payments_cash_piasters = @debt_payments_cash_piasters,
                    expenses_cash_piasters = @expenses_cash_piasters,
                    cash_in_piasters = @cash_in_piasters,
                    cash_out_piasters = @cash_out_piasters,
                    epay_cash_piasters = @epay_cash_piasters,
                    wallets_cash_piasters = @wallets_cash_piasters,
                    purchases_cash_piasters = @purchases_cash_piasters,
                    supplier_payments_cash_piasters = @supplier_payments_cash_piasters,
                    expected_cash_piasters = @expected_cash_piasters,
                    actual_cash_piasters = @actual_cash_piasters,
                    difference_piasters = @difference_piasters,
                    invoices_count = @invoices_count,
                    notes = @notes,
                    updated_at = @updated_at
                WHERE id = @id AND status = 'open';
            ";

            using (var cmd = new SQLiteCommand(sql, conn, trans))
            {
                cmd.Parameters.AddWithValue("@id", shift.Id);
                cmd.Parameters.AddWithValue("@closed_at", shift.ClosedAt);
                cmd.Parameters.AddWithValue("@cash_sales_piasters", shift.CashSalesPiasters);
                cmd.Parameters.AddWithValue("@card_sales_piasters", shift.CardSalesPiasters);
                cmd.Parameters.AddWithValue("@instapay_sales_piasters", shift.InstapaySalesPiasters);
                cmd.Parameters.AddWithValue("@vodafone_cash_sales_piasters", shift.VodafoneCashSalesPiasters);
                cmd.Parameters.AddWithValue("@credit_sales_piasters", shift.CreditSalesPiasters);
                cmd.Parameters.AddWithValue("@returns_cash_piasters", shift.ReturnsCashPiasters);
                cmd.Parameters.AddWithValue("@debt_payments_cash_piasters", shift.DebtPaymentsCashPiasters);
                cmd.Parameters.AddWithValue("@expenses_cash_piasters", shift.ExpensesCashPiasters);
                cmd.Parameters.AddWithValue("@cash_in_piasters", shift.CashInPiasters);
                cmd.Parameters.AddWithValue("@cash_out_piasters", shift.CashOutPiasters);
                cmd.Parameters.AddWithValue("@epay_cash_piasters", shift.EpayCashPiasters);
                cmd.Parameters.AddWithValue("@wallets_cash_piasters", shift.WalletsCashPiasters);
                cmd.Parameters.AddWithValue("@purchases_cash_piasters", shift.PurchasesCashPiasters);
                cmd.Parameters.AddWithValue("@supplier_payments_cash_piasters", shift.SupplierPaymentsCashPiasters);
                cmd.Parameters.AddWithValue("@expected_cash_piasters", shift.ExpectedCashPiasters);
                cmd.Parameters.AddWithValue("@actual_cash_piasters", shift.ActualCashPiasters);
                cmd.Parameters.AddWithValue("@difference_piasters", shift.DifferencePiasters);
                cmd.Parameters.AddWithValue("@invoices_count", shift.InvoicesCount);
                cmd.Parameters.AddWithValue("@notes", shift.Notes);
                cmd.Parameters.AddWithValue("@updated_at", shift.UpdatedAt);

                int rowsAffected = cmd.ExecuteNonQuery();
                if (rowsAffected == 0)
                {
                    throw new InvalidOperationException("تعذر إغلاق الوردية. قد تكون الوردية مقفلة بالفعل أو غير موجودة.");
                }
            }
        }

        public void RecordDrawerTransaction(CashDrawerTransaction tx, SQLiteConnection conn, SQLiteTransaction trans)
        {
            string sql = @"
                INSERT INTO cash_drawer_transactions (
                    id, shift_id, type, amount_piasters, reason,
                    performed_by_id, performed_by_name, created_at
                ) VALUES (
                    @id, @shift_id, @type, @amount_piasters, @reason,
                    @performed_by_id, @performed_by_name, @created_at
                );
            ";

            using (var cmd = new SQLiteCommand(sql, conn, trans))
            {
                cmd.Parameters.AddWithValue("@id", tx.Id);
                cmd.Parameters.AddWithValue("@shift_id", tx.ShiftId);
                cmd.Parameters.AddWithValue("@type", tx.Type);
                cmd.Parameters.AddWithValue("@amount_piasters", tx.AmountPiasters);
                cmd.Parameters.AddWithValue("@reason", tx.Reason ?? "");
                cmd.Parameters.AddWithValue("@performed_by_id", tx.PerformedById ?? "system");
                cmd.Parameters.AddWithValue("@performed_by_name", tx.PerformedByName ?? "الكاشير");
                cmd.Parameters.AddWithValue("@created_at", tx.CreatedAt);

                cmd.ExecuteNonQuery();
            }
        }

        public List<CashDrawerTransaction> GetDrawerTransactions(string shiftId)
        {
            var list = new List<CashDrawerTransaction>();
            if (string.IsNullOrEmpty(shiftId)) return list;

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    SELECT * FROM cash_drawer_transactions 
                    WHERE shift_id = @shift_id 
                    ORDER BY created_at DESC;
                ";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@shift_id", shiftId);
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            list.Add(new CashDrawerTransaction
                            {
                                Id = reader["id"].ToString(),
                                ShiftId = reader["shift_id"].ToString(),
                                Type = reader["type"].ToString(),
                                AmountPiasters = Convert.ToInt64(reader["amount_piasters"]),
                                Reason = reader["reason"].ToString(),
                                PerformedById = reader["performed_by_id"].ToString(),
                                PerformedByName = reader["performed_by_name"].ToString(),
                                CreatedAt = reader["created_at"].ToString()
                            });
                        }
                    }
                }
            }
            return list;
        }

        public List<Shift> GetRecentShifts(int limit = 30)
        {
            var list = new List<Shift>();
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = "SELECT * FROM shifts ORDER BY shift_number DESC LIMIT @limit;";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@limit", limit > 0 ? limit : 30);
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            list.Add(MapShift(reader));
                        }
                    }
                }
            }
            return list;
        }

        public ShiftSummary CalculateShiftMetrics(Shift shift)
        {
            if (shift == null) return null;

            var summary = new ShiftSummary();
            summary.Shift = shift;
            summary.OpeningFloatPiasters = shift.OpeningFloatPiasters;

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();

                // 1. Sales totals linked to this shift
                string salesSql = @"
                    SELECT 
                        COUNT(*) AS inv_count,
                        COALESCE(SUM(
                            CASE 
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
                                WHEN s.payment_method IN ('card', 'visa', 'mastercard', 'meeza', 'pos', 'bank_card') THEN (s.paid_piasters - s.service_fee_piasters)
                                WHEN s.payment_method = 'multi' THEN (
                                    SELECT COALESCE(SUM(p.amount_piasters), 0) 
                                    FROM payments p 
                                    WHERE p.sale_id = s.id AND p.method IN ('card', 'visa', 'mastercard', 'meeza', 'pos', 'bank_card')
                                )
                                ELSE 0 
                            END
                        ), 0) AS card_sales,
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
                        COALESCE(SUM(CASE WHEN s.total_piasters > (s.paid_piasters - s.service_fee_piasters) THEN (s.total_piasters - (s.paid_piasters - s.service_fee_piasters)) ELSE 0 END), 0) AS credit_sales
                    FROM sales s
                    WHERE (s.shift_id = @shiftId OR (s.shift_id IS NULL AND s.created_at >= @openedAt AND (@closedAt IS NULL OR s.created_at <= @closedAt)))
                      AND s.status != 'cancelled'
                      AND s.id NOT LIKE 'demo_%'
                      AND s.id NOT LIKE 'stress_%';
                ";

                using (var cmd = new SQLiteCommand(salesSql, conn))
                {
                    cmd.Parameters.AddWithValue("@shiftId", shift.Id);
                    cmd.Parameters.AddWithValue("@openedAt", shift.OpenedAt);
                    cmd.Parameters.AddWithValue("@closedAt", (object)shift.ClosedAt ?? DBNull.Value);
                    using (var reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            summary.InvoicesCount = Convert.ToInt32(reader["inv_count"]);
                            summary.CashSalesPiasters = Convert.ToInt64(reader["cash_sales"]);
                            summary.CardSalesPiasters = Convert.ToInt64(reader["card_sales"]);
                            summary.InstapaySalesPiasters = Convert.ToInt64(reader["instapay_sales"]);
                            summary.VodafoneCashSalesPiasters = Convert.ToInt64(reader["vodafone_cash_sales"]);
                            summary.CreditSalesPiasters = Convert.ToInt64(reader["credit_sales"]);
                        }
                    }
                }

                // 2. Returns in cash
                using (var checkRetCmd = new SQLiteCommand("SELECT name FROM sqlite_master WHERE type='table' AND name='returns';", conn))
                {
                    if (checkRetCmd.ExecuteScalar() != null)
                    {
                        string retSql = @"
                            SELECT COALESCE(SUM(CASE WHEN refund_method = 'cash' THEN total_piasters ELSE 0 END), 0)
                            FROM returns
                            WHERE (shift_id = @shiftId OR (shift_id IS NULL AND created_at >= @openedAt AND (@closedAt IS NULL OR created_at <= @closedAt)));
                        ";
                        using (var cmd = new SQLiteCommand(retSql, conn))
                        {
                            cmd.Parameters.AddWithValue("@shiftId", shift.Id);
                            cmd.Parameters.AddWithValue("@openedAt", shift.OpenedAt);
                            cmd.Parameters.AddWithValue("@closedAt", (object)shift.ClosedAt ?? DBNull.Value);
                            object retRes = cmd.ExecuteScalar();
                            if (retRes != null && retRes != DBNull.Value)
                            {
                                summary.ReturnsCashPiasters = Convert.ToInt64(retRes);
                            }
                        }
                    }
                }

                // 3. Customer Debt Payments collected in cash
                string debtSql = @"
                    SELECT COALESCE(SUM(
                        CASE 
                            WHEN type = 'payment' THEN amount_piasters 
                            WHEN type = 'payment_cancel' THEN -amount_piasters 
                            ELSE 0 
                        END
                    ), 0)
                    FROM customer_ledger
                    WHERE ((type = 'payment' AND sale_id IS NULL) OR type = 'payment_cancel')
                      AND (payment_method = 'cash' OR payment_method IS NULL OR payment_method = '')
                      AND (shift_id = @shiftId OR (shift_id IS NULL AND created_at >= @openedAt AND (@closedAt IS NULL OR created_at <= @closedAt)))
                      AND customer_id NOT LIKE 'demo_%';
                ";
                using (var cmd = new SQLiteCommand(debtSql, conn))
                {
                    cmd.Parameters.AddWithValue("@shiftId", shift.Id);
                    cmd.Parameters.AddWithValue("@openedAt", shift.OpenedAt);
                    cmd.Parameters.AddWithValue("@closedAt", (object)shift.ClosedAt ?? DBNull.Value);
                    object debtRes = cmd.ExecuteScalar();
                    if (debtRes != null && debtRes != DBNull.Value)
                    {
                        summary.DebtPaymentsCashPiasters = Convert.ToInt64(debtRes);
                    }
                }

                // 4. Expenses paid from drawer (exclude safe expenses and cancelled expenses)
                string expSql = @"
                    SELECT COALESCE(SUM(amount_piasters), 0)
                    FROM expenses
                    WHERE (shift_id = @shiftId OR (shift_id IS NULL AND created_at >= @openedAt AND (@closedAt IS NULL OR created_at <= @closedAt)))
                      AND (is_cancelled = 0 OR is_cancelled IS NULL)
                      AND (source = 'drawer' OR source IS NULL OR source = '');
                ";
                using (var cmd = new SQLiteCommand(expSql, conn))
                {
                    cmd.Parameters.AddWithValue("@shiftId", shift.Id);
                    cmd.Parameters.AddWithValue("@openedAt", shift.OpenedAt);
                    cmd.Parameters.AddWithValue("@closedAt", (object)shift.ClosedAt ?? DBNull.Value);
                    object expRes = cmd.ExecuteScalar();
                    if (expRes != null && expRes != DBNull.Value)
                    {
                        summary.ExpensesCashPiasters = Convert.ToInt64(expRes);
                    }
                }

                // 5. Cash In and Cash Out drawer transactions
                string drawerSql = @"
                    SELECT 
                        COALESCE(SUM(CASE WHEN type = 'cash_in' THEN amount_piasters ELSE 0 END), 0) AS total_cash_in,
                        COALESCE(SUM(CASE WHEN type = 'cash_out' THEN amount_piasters ELSE 0 END), 0) AS total_cash_out
                    FROM cash_drawer_transactions
                    WHERE shift_id = @shiftId;
                ";
                using (var cmd = new SQLiteCommand(drawerSql, conn))
                {
                    cmd.Parameters.AddWithValue("@shiftId", shift.Id);
                    using (var reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            summary.CashInPiasters = Convert.ToInt64(reader["total_cash_in"]);
                            summary.CashOutPiasters = Convert.ToInt64(reader["total_cash_out"]);
                        }
                    }
                }

                // 6. Recent drawer movements
                summary.RecentMovements = GetDrawerTransactions(shift.Id);
            }

            // F-02, F-22, F-24: Unified Senior Cash Calculation via DrawerCashCalculator
            DateTime pStart = DateTime.MinValue;
            DateTime.TryParse(shift.OpenedAt, out pStart);
            DateTime pEnd = DateTime.UtcNow;
            if (!string.IsNullOrEmpty(shift.ClosedAt))
            {
                DateTime.TryParse(shift.ClosedAt, out pEnd);
            }
            if (pStart == DateTime.MinValue) pStart = DateTime.Today.AddDays(-1);

            var calc = Services.DrawerCashCalculator.Calculate(_connectionString, pStart, pEnd, shift.Id);
            summary.OpeningFloatPiasters = calc.OpeningFloatPiasters;
            summary.CashSalesPiasters = calc.CashSalesPiasters;
            summary.ReturnsCashPiasters = calc.CashReturnsPiasters;
            summary.DebtPaymentsCashPiasters = calc.DebtPaymentsCashPiasters;
            summary.ExpensesCashPiasters = calc.ExpensesPiasters;
            summary.CashInPiasters = calc.ManualCashInPiasters;
            summary.CashOutPiasters = calc.ManualCashOutPiasters;
            summary.EpayCashPiasters = calc.EpayNetCashPiasters - calc.TerminalFundingPiasters;
            summary.WalletsCashPiasters = calc.WalletsNetCashPiasters - calc.WalletFundingPiasters;
            summary.PurchasesCashPiasters = calc.PurchasesCashPiasters;
            summary.SupplierPaymentsCashPiasters = calc.SupplierPaymentsPiasters;
            summary.ExpectedCashPiasters = calc.ExpectedCashPiasters;
            summary.AvailableCashInDrawerPiasters = calc.ExpectedCashPiasters; // F-08: No Math.Max(0, ...)

            return summary;
        }

        private static Shift MapShift(SQLiteDataReader reader)
        {
            var shift = new Shift();
            shift.Id = reader["id"].ToString();
            shift.ShiftNumber = Convert.ToInt32(reader["shift_number"]);
            shift.CashierId = reader["cashier_id"].ToString();
            shift.CashierName = reader["cashier_name"].ToString();
            shift.PosRegisterId = reader["pos_register_id"].ToString();
            shift.BusinessDate = reader["business_date"].ToString();
            shift.OpenedAt = reader["opened_at"].ToString();
            shift.ClosedAt = reader["closed_at"] != DBNull.Value ? reader["closed_at"].ToString() : null;
            shift.Status = reader["status"].ToString();
            shift.OpeningFloatPiasters = Convert.ToInt64(reader["opening_float_piasters"]);
            shift.CashSalesPiasters = Convert.ToInt64(reader["cash_sales_piasters"]);
            shift.CardSalesPiasters = Convert.ToInt64(reader["card_sales_piasters"]);
            shift.InstapaySalesPiasters = Convert.ToInt64(reader["instapay_sales_piasters"]);
            shift.VodafoneCashSalesPiasters = Convert.ToInt64(reader["vodafone_cash_sales_piasters"]);
            shift.CreditSalesPiasters = Convert.ToInt64(reader["credit_sales_piasters"]);
            shift.ReturnsCashPiasters = Convert.ToInt64(reader["returns_cash_piasters"]);
            shift.DebtPaymentsCashPiasters = Convert.ToInt64(reader["debt_payments_cash_piasters"]);
            shift.ExpensesCashPiasters = Convert.ToInt64(reader["expenses_cash_piasters"]);
            shift.CashInPiasters = Convert.ToInt64(reader["cash_in_piasters"]);
            shift.CashOutPiasters = Convert.ToInt64(reader["cash_out_piasters"]);
            shift.EpayCashPiasters = Convert.ToInt64(reader["epay_cash_piasters"]);
            shift.WalletsCashPiasters = Convert.ToInt64(reader["wallets_cash_piasters"]);
            shift.PurchasesCashPiasters = Convert.ToInt64(reader["purchases_cash_piasters"]);
            shift.SupplierPaymentsCashPiasters = Convert.ToInt64(reader["supplier_payments_cash_piasters"]);
            shift.ExpectedCashPiasters = Convert.ToInt64(reader["expected_cash_piasters"]);
            shift.ActualCashPiasters = Convert.ToInt64(reader["actual_cash_piasters"]);
            shift.DifferencePiasters = Convert.ToInt64(reader["difference_piasters"]);
            shift.InvoicesCount = Convert.ToInt32(reader["invoices_count"]);
            shift.Notes = reader["notes"] != DBNull.Value ? reader["notes"].ToString() : null;
            shift.CreatedAt = reader["created_at"].ToString();
            shift.UpdatedAt = reader["updated_at"].ToString();
            return shift;
        }
    }
}
