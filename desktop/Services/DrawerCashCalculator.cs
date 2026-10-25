using System;
using System.Data.SQLite;

namespace RafiqPOS.Services
{
    public class DrawerCashResult
    {
        public long ExpectedCashPiasters { get; set; }
        public long OpeningFloatPiasters { get; set; }
        public long CashSalesPiasters { get; set; }
        public long CashReturnsPiasters { get; set; }
        public long DebtPaymentsCashPiasters { get; set; }
        public long ExpensesPiasters { get; set; }
        public long EpayCashInPiasters { get; set; }
        public long EpayCashOutPiasters { get; set; }
        public long EpayNetCashPiasters { get; set; }
        public long TerminalFundingPiasters { get; set; }
        public long WalletsNetCashPiasters { get; set; }
        public long WalletFundingPiasters { get; set; }
        public long PurchasesCashPiasters { get; set; }
        public long SupplierPaymentsPiasters { get; set; }
        public long ManualCashInPiasters { get; set; }
        public long ManualCashOutPiasters { get; set; }
        public long ManualNetCashInOutPiasters { get; set; }
    }

    /// <summary>
    /// الحاسبة المالية الموحدة لنقدية الدرج (F-02, F-22, F-24)
    /// المرجع الحسابي الوحيد في كامل النظام لتقدير وجرد نقدية الدرج الفعلية
    /// </summary>
    public static class DrawerCashCalculator
    {
        public static DrawerCashResult Calculate(string connectionString, DateTime periodStart, DateTime periodEnd, string shiftId = null)
        {
            using (var conn = new SQLiteConnection(connectionString))
            {
                conn.Open();
                return Calculate(conn, null, periodStart, periodEnd, shiftId);
            }
        }

        public static DrawerCashResult CalculateForBusinessDate(SQLiteConnection conn, SQLiteTransaction trans, DateTime businessDate)
        {
            DateTime windowStart, windowEnd;
            BusinessDayHelper.GetBusinessDayWindow(conn, trans, businessDate, out windowStart, out windowEnd);
            return Calculate(conn, trans, windowStart, windowEnd, null);
        }

        public static DrawerCashResult CalculateForBusinessDate(SQLiteConnection conn, DateTime businessDate)
        {
            return CalculateForBusinessDate(conn, null, businessDate);
        }

        public static DrawerCashResult CalculateForBusinessDate(string connectionString, DateTime businessDate)
        {
            using (var conn = new SQLiteConnection(connectionString))
            {
                conn.Open();
                return CalculateForBusinessDate(conn, null, businessDate);
            }
        }

        public static DrawerCashResult Calculate(SQLiteConnection conn, SQLiteTransaction trans,
            DateTime periodStart, DateTime periodEnd, string shiftId = null)
        {
            var result = new DrawerCashResult();

            string startStr = periodStart.ToString("yyyy-MM-dd HH:mm:ss");
            string endStr = periodEnd.ToString("yyyy-MM-dd HH:mm:ss");

            // 1. عهدة بداية الوردية (Opening Float)
            if (!string.IsNullOrEmpty(shiftId))
            {
                using (var cmd = conn.CreateCommand())
                {
                    cmd.Transaction = trans;
                    cmd.CommandText = "SELECT COALESCE(opening_float_piasters, 0) FROM shifts WHERE id = @shiftId LIMIT 1;";
                    cmd.Parameters.AddWithValue("@shiftId", shiftId);
                    object val = cmd.ExecuteScalar();
                    if (val != null && val != DBNull.Value) result.OpeningFloatPiasters = Convert.ToInt64(val);
                }
            }
            else
            {
                using (var cmd = conn.CreateCommand())
                {
                    cmd.Transaction = trans;
                    cmd.CommandText = @"
                        SELECT COALESCE(SUM(opening_float_piasters), 0)
                        FROM shifts
                        WHERE datetime(opened_at, 'localtime') >= @start AND datetime(opened_at, 'localtime') <= @end;";
                    cmd.Parameters.AddWithValue("@start", startStr);
                    cmd.Parameters.AddWithValue("@end", endStr);
                    object val = cmd.ExecuteScalar();
                    if (val != null && val != DBNull.Value) result.OpeningFloatPiasters = Convert.ToInt64(val);
                }
            }

            // 2. مبيعات نقدية (Cash Sales)
            using (var cmd = conn.CreateCommand())
            {
                cmd.Transaction = trans;
                cmd.CommandText = @"
                    SELECT COALESCE(SUM(
                        CASE 
                            -- Task 189-5: Corporate insurance claims are corporate receivables; only the patient's cash co-payment from payments table enters the drawer
                            WHEN s.payment_method = 'insurance' THEN MAX(0, (
                                SELECT COALESCE(SUM(p.amount_piasters), 0) 
                                FROM payments p 
                                WHERE p.sale_id = s.id AND p.method = 'cash'
                            ) - COALESCE(s.change_piasters, 0))
                            WHEN s.payment_method = 'cash' THEN MAX(0, (s.paid_piasters - s.service_fee_piasters) - COALESCE(s.change_piasters, 0))
                            WHEN s.payment_method = 'credit' THEN MIN((s.paid_piasters - s.service_fee_piasters), s.total_piasters)
                            WHEN s.payment_method = 'multi' THEN MAX(0, (
                                SELECT COALESCE(SUM(p.amount_piasters), 0) 
                                FROM payments p 
                                WHERE p.sale_id = s.id AND p.method = 'cash'
                            ) - COALESCE(s.change_piasters, 0))
                            ELSE 0 
                        END
                    ), 0)
                    FROM sales s
                    WHERE s.status != 'cancelled'
                      AND s.id NOT LIKE 'demo_%'
                      AND s.id NOT LIKE 'stress_%'
                      AND (
                          (@shiftId IS NOT NULL AND (s.shift_id = @shiftId OR (s.shift_id IS NULL AND datetime(s.created_at, 'localtime') >= @start AND datetime(s.created_at, 'localtime') <= @end)))
                          OR (@shiftId IS NULL AND datetime(s.created_at, 'localtime') >= @start AND datetime(s.created_at, 'localtime') <= @end)
                      );";
                cmd.Parameters.AddWithValue("@shiftId", (object)shiftId ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@start", startStr);
                cmd.Parameters.AddWithValue("@end", endStr);
                object val = cmd.ExecuteScalar();
                if (val != null && val != DBNull.Value) result.CashSalesPiasters = Convert.ToInt64(val);
            }

            // 3. مرتجعات نقدية (Cash Returns) — يُخصم من الدرج
            if (TableExists(conn, trans, "returns"))
            {
                using (var cmd = conn.CreateCommand())
                {
                    cmd.Transaction = trans;
                    cmd.CommandText = @"
                        SELECT COALESCE(SUM(total_piasters), 0)
                        FROM returns
                        WHERE refund_method = 'cash'
                          AND (
                              (@shiftId IS NOT NULL AND (shift_id = @shiftId OR (shift_id IS NULL AND datetime(created_at, 'localtime') >= @start AND datetime(created_at, 'localtime') <= @end)))
                              OR (@shiftId IS NULL AND datetime(created_at, 'localtime') >= @start AND datetime(created_at, 'localtime') <= @end)
                          );";
                    cmd.Parameters.AddWithValue("@shiftId", (object)shiftId ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@start", startStr);
                    cmd.Parameters.AddWithValue("@end", endStr);
                    object val = cmd.ExecuteScalar();
                    if (val != null && val != DBNull.Value) result.CashReturnsPiasters = Convert.ToInt64(val);
                }
            }

            // 4. سداد ديون العملاء نقدياً (Customer Debt Collections - Cash)
            if (TableExists(conn, trans, "customer_ledger"))
            {
                using (var cmd = conn.CreateCommand())
                {
                    cmd.Transaction = trans;
                    cmd.CommandText = @"
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
                          AND (
                              (@shiftId IS NOT NULL AND (shift_id = @shiftId OR (shift_id IS NULL AND datetime(created_at, 'localtime') >= @start AND datetime(created_at, 'localtime') <= @end)))
                              OR (@shiftId IS NULL AND datetime(created_at, 'localtime') >= @start AND datetime(created_at, 'localtime') <= @end)
                          )
                          AND customer_id NOT LIKE 'demo_%';";
                    cmd.Parameters.AddWithValue("@shiftId", (object)shiftId ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@start", startStr);
                    cmd.Parameters.AddWithValue("@end", endStr);
                    object val = cmd.ExecuteScalar();
                    if (val != null && val != DBNull.Value) result.DebtPaymentsCashPiasters = Convert.ToInt64(val);
                }
            }

            // 5. مصروفات الدرج (Expenses from Drawer) — يُخصم من الدرج
            if (TableExists(conn, trans, "expenses"))
            {
                bool hasBDateCol = ColumnExists(conn, trans, "expenses", "business_date");
                using (var cmd = conn.CreateCommand())
                {
                    cmd.Transaction = trans;
                    cmd.CommandText = hasBDateCol
                        ? @"SELECT COALESCE(SUM(amount_piasters), 0)
                            FROM expenses
                            WHERE (is_cancelled = 0 OR is_cancelled IS NULL)
                              AND (source = 'drawer' OR source IS NULL OR source = '')
                              AND (
                                  (@shiftId IS NOT NULL AND (shift_id = @shiftId OR (shift_id IS NULL AND datetime(created_at, 'localtime') >= @start AND datetime(created_at, 'localtime') <= @end)))
                                  OR (@shiftId IS NULL AND (business_date = date(@start) OR (datetime(created_at, 'localtime') >= @start AND datetime(created_at, 'localtime') <= @end)))
                              );"
                        : @"SELECT COALESCE(SUM(amount_piasters), 0)
                            FROM expenses
                            WHERE (is_cancelled = 0 OR is_cancelled IS NULL)
                              AND (source = 'drawer' OR source IS NULL OR source = '')
                              AND (
                                  (@shiftId IS NOT NULL AND (shift_id = @shiftId OR (shift_id IS NULL AND datetime(created_at, 'localtime') >= @start AND datetime(created_at, 'localtime') <= @end)))
                                  OR (@shiftId IS NULL AND datetime(created_at, 'localtime') >= @start AND datetime(created_at, 'localtime') <= @end)
                              );";
                    cmd.Parameters.AddWithValue("@shiftId", (object)shiftId ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@start", startStr);
                    cmd.Parameters.AddWithValue("@end", endStr);
                    object val = cmd.ExecuteScalar();
                    if (val != null && val != DBNull.Value) result.ExpensesPiasters = Convert.ToInt64(val);
                }
            }

            // 6. حركات الإيداع والسحب اليدوي من الدرج (Cash Drawer Transactions)
            if (TableExists(conn, trans, "cash_drawer_transactions"))
            {
                using (var cmd = conn.CreateCommand())
                {
                    cmd.Transaction = trans;
                    cmd.CommandText = @"
                        SELECT 
                            COALESCE(SUM(CASE WHEN type = 'cash_in' THEN amount_piasters ELSE 0 END), 0) AS total_cash_in,
                            COALESCE(SUM(CASE WHEN type = 'cash_out' THEN amount_piasters ELSE 0 END), 0) AS total_cash_out
                        FROM cash_drawer_transactions
                        WHERE (
                            (@shiftId IS NOT NULL AND shift_id = @shiftId)
                            OR (@shiftId IS NULL AND datetime(created_at, 'localtime') >= @start AND datetime(created_at, 'localtime') <= @end)
                        );";
                    cmd.Parameters.AddWithValue("@shiftId", (object)shiftId ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@start", startStr);
                    cmd.Parameters.AddWithValue("@end", endStr);
                    using (var reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            result.ManualCashInPiasters = Convert.ToInt64(reader["total_cash_in"]);
                            result.ManualCashOutPiasters = Convert.ToInt64(reader["total_cash_out"]);
                            result.ManualNetCashInOutPiasters = result.ManualCashInPiasters - result.ManualCashOutPiasters;
                        }
                    }
                }
            }

            // 7. خدمات الدفع الإلكتروني (E-pay Services)
            if (TableExists(conn, trans, "epay_transactions"))
            {
                using (var cmd = conn.CreateCommand())
                {
                    cmd.Transaction = trans;
                    cmd.CommandText = @"
                        SELECT 
                            COALESCE(SUM(CASE WHEN payment_channel = 'cash_drawer' THEN 
                                (CASE WHEN service_type = 'cash_out' THEN (customer_fee_piasters - bill_amount_piasters) 
                                      ELSE total_received_piasters END) 
                                ELSE 0 END), 0) AS drawer_cash
                        FROM epay_transactions
                        WHERE status = 'completed'
                          AND datetime(created_at, 'localtime') >= @start AND datetime(created_at, 'localtime') <= @end;";
                    cmd.Parameters.AddWithValue("@start", startStr);
                    cmd.Parameters.AddWithValue("@end", endStr);
                    object val = cmd.ExecuteScalar();
                    if (val != null && val != DBNull.Value)
                    {
                        result.EpayNetCashPiasters = Convert.ToInt64(val);
                    }
                }
            }

            // 8. تغذية ماكينات الدفع الإلكتروني من الدرج (Terminal Funding)
            if (TableExists(conn, trans, "epay_terminal_fundings"))
            {
                using (var cmd = conn.CreateCommand())
                {
                    cmd.Transaction = trans;
                    cmd.CommandText = @"
                        SELECT COALESCE(SUM(amount_piasters), 0)
                        FROM epay_terminal_fundings
                        WHERE funding_source = 'cash_drawer'
                          AND datetime(created_at, 'localtime') >= @start AND datetime(created_at, 'localtime') <= @end;";
                    cmd.Parameters.AddWithValue("@start", startStr);
                    cmd.Parameters.AddWithValue("@end", endStr);
                    object val = cmd.ExecuteScalar();
                    if (val != null && val != DBNull.Value) result.TerminalFundingPiasters = Convert.ToInt64(val);
                }
            }

            // 9. المحافظ الإلكترونية وإنستاباي (Digital Wallets Transactions)
            if (TableExists(conn, trans, "digital_transactions"))
            {
                using (var cmd = conn.CreateCommand())
                {
                    cmd.Transaction = trans;
                    cmd.CommandText = @"
                        SELECT COALESCE(SUM(
                            CASE 
                                WHEN tx_type = 'cash_out' THEN total_collected_piasters 
                                WHEN tx_type = 'cash_in' THEN (profit_piasters - amount_piasters) 
                                ELSE 0 
                            END
                        ), 0) AS drawer_cash
                        FROM digital_transactions
                        WHERE payment_destination = 'cash_drawer'
                          AND status = 'completed'
                          AND datetime(created_at, 'localtime') >= @start AND datetime(created_at, 'localtime') <= @end;";
                    cmd.Parameters.AddWithValue("@start", startStr);
                    cmd.Parameters.AddWithValue("@end", endStr);
                    object val = cmd.ExecuteScalar();
                    if (val != null && val != DBNull.Value) result.WalletsNetCashPiasters = Convert.ToInt64(val);
                }
            }

            // 10. تغذية المحافظ الإلكترونية من الدرج (Wallet Funding)
            if (TableExists(conn, trans, "digital_account_fundings"))
            {
                using (var cmd = conn.CreateCommand())
                {
                    cmd.Transaction = trans;
                    cmd.CommandText = @"
                        SELECT COALESCE(SUM(amount_piasters), 0)
                        FROM digital_account_fundings
                        WHERE funding_source = 'cash_drawer'
                          AND datetime(created_at, 'localtime') >= @start AND datetime(created_at, 'localtime') <= @end;";
                    cmd.Parameters.AddWithValue("@start", startStr);
                    cmd.Parameters.AddWithValue("@end", endStr);
                    object val = cmd.ExecuteScalar();
                    if (val != null && val != DBNull.Value) result.WalletFundingPiasters = Convert.ToInt64(val);
                }
            }

            // 11. مشتريات نقدية مدفوعة من الدرج (Purchases Cash from Drawer)
            if (TableExists(conn, trans, "purchases"))
            {
                bool hasPurSource = ColumnExists(conn, trans, "purchases", "payment_source");
                using (var cmd = conn.CreateCommand())
                {
                    cmd.Transaction = trans;
                    cmd.CommandText = hasPurSource
                        ? @"SELECT COALESCE(SUM(paid_amount_piasters), 0)
                            FROM purchases
                            WHERE status != 'cancelled'
                              AND (payment_source = 'cash_drawer' OR payment_source IS NULL OR payment_source = '')
                              AND datetime(created_at, 'localtime') >= @start AND datetime(created_at, 'localtime') <= @end;"
                        : @"SELECT COALESCE(SUM(paid_amount_piasters), 0)
                            FROM purchases
                            WHERE status != 'cancelled'
                              AND datetime(created_at, 'localtime') >= @start AND datetime(created_at, 'localtime') <= @end;";
                    cmd.Parameters.AddWithValue("@start", startStr);
                    cmd.Parameters.AddWithValue("@end", endStr);
                    object val = cmd.ExecuteScalar();
                    if (val != null && val != DBNull.Value) result.PurchasesCashPiasters = Convert.ToInt64(val);
                }
            }

            // 12. سداد دفعات للموردين من الدرج (Supplier Payments from Drawer)
            if (TableExists(conn, trans, "supplier_transactions"))
            {
                bool hasSuppSource = ColumnExists(conn, trans, "supplier_transactions", "payment_source");
                using (var cmd = conn.CreateCommand())
                {
                    cmd.Transaction = trans;
                    cmd.CommandText = hasSuppSource
                        ? @"SELECT COALESCE(SUM(ABS(amount_piasters)), 0)
                            FROM supplier_transactions
                            WHERE transaction_type = 'PAYMENT'
                              AND (payment_source = 'cash_drawer' OR payment_source IS NULL OR payment_source = '')
                              AND datetime(created_at, 'localtime') >= @start AND datetime(created_at, 'localtime') <= @end;"
                        : @"SELECT COALESCE(SUM(ABS(amount_piasters)), 0)
                            FROM supplier_transactions
                            WHERE transaction_type = 'PAYMENT'
                              AND datetime(created_at, 'localtime') >= @start AND datetime(created_at, 'localtime') <= @end;";
                    cmd.Parameters.AddWithValue("@start", startStr);
                    cmd.Parameters.AddWithValue("@end", endStr);
                    object val = cmd.ExecuteScalar();
                    if (val != null && val != DBNull.Value) result.SupplierPaymentsPiasters = Convert.ToInt64(val);
                }
            }

            // ═════════════════════════════════════════════════════════════════════════
            // المعادلة الموحدة الشاملة لنقدية الدرج (Unified Senior Cash Formula):
            // ═════════════════════════════════════════════════════════════════════════
            result.ExpectedCashPiasters = result.OpeningFloatPiasters
                + result.CashSalesPiasters
                - result.CashReturnsPiasters
                + result.DebtPaymentsCashPiasters
                - result.ExpensesPiasters
                + result.ManualNetCashInOutPiasters
                + result.EpayNetCashPiasters
                - result.TerminalFundingPiasters
                + result.WalletsNetCashPiasters
                - result.WalletFundingPiasters
                - result.PurchasesCashPiasters
                - result.SupplierPaymentsPiasters;

            // F-08: لا تصفير للرصيد السالب (Zero Math.Max(0, ...)) لضمان كشف العجز الحقيقي
            return result;
        }

        private static bool TableExists(SQLiteConnection conn, SQLiteTransaction trans, string tableName)
        {
            using (var cmd = conn.CreateCommand())
            {
                cmd.Transaction = trans;
                cmd.CommandText = "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = @name LIMIT 1;";
                cmd.Parameters.AddWithValue("@name", tableName);
                return cmd.ExecuteScalar() != null;
            }
        }

        private static bool ColumnExists(SQLiteConnection conn, SQLiteTransaction trans, string tableName, string columnName)
        {
            using (var cmd = conn.CreateCommand())
            {
                cmd.Transaction = trans;
                cmd.CommandText = string.Format("PRAGMA table_info({0});", tableName);
                using (var reader = cmd.ExecuteReader())
                {
                    while (reader.Read())
                    {
                        if (string.Equals(reader["name"].ToString(), columnName, StringComparison.OrdinalIgnoreCase))
                        {
                            return true;
                        }
                    }
                }
            }
            return false;
        }
    }
}
