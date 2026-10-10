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
                string val = _settingsRepo.Get("business_day_cutoff_hour", "4");
                int hour;
                if (int.TryParse(val, out hour) && hour >= 0 && hour <= 12)
                {
                    return hour;
                }
            }
            catch
            {
                // Fallback default 4 AM
            }
            return 4;
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
                preview.CreditSalesPiasters = existing.CreditSalesPiasters;
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
                        COALESCE(SUM(total_piasters), 0) AS total_sales,
                        COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN paid_piasters ELSE 0 END), 0) AS cash_sales,
                        COALESCE(SUM(CASE WHEN payment_method = 'card' THEN paid_piasters ELSE 0 END), 0) AS card_sales,
                        COALESCE(SUM(CASE WHEN payment_method = 'credit' THEN (total_piasters - paid_piasters) ELSE 0 END), 0) AS credit_sales,
                        COUNT(*) AS inv_count
                    FROM sales
                    WHERE date(datetime(created_at, 'localtime', '-' || @cutoff || ' hours')) = @bdate
                      AND status != 'cancelled'
                      AND id NOT LIKE 'demo_%'
                      AND id NOT LIKE 'stress_%';
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
                            preview.CardSalesPiasters = Convert.ToInt64(reader["card_sales"]);
                            preview.CreditSalesPiasters = Convert.ToInt64(reader["credit_sales"]);
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

                // 6. Customer Debt Payments collected in cash
                string debtSql = @"
                    SELECT COALESCE(SUM(amount_piasters), 0) AS debt_payments
                    FROM customer_ledger
                    WHERE type = 'payment'
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
                        COALESCE(SUM(si.total_piasters - (si.quantity_milli * si.unit_cost_piasters / 1000)), 0) AS total_profit,
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

                // 7. Cash Drawer Expenses for the business date
                string expensesSql = @"
                    SELECT 
                        COALESCE(SUM(amount_piasters), 0) AS total_expenses,
                        COUNT(*) AS expenses_count
                    FROM expenses
                    WHERE business_date = @bdate;
                ";
                using (var cmd = new SQLiteCommand(expensesSql, conn))
                {
                    cmd.Parameters.AddWithValue("@bdate", businessDate);
                    using (var reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            preview.ExpensesPiasters = Convert.ToInt64(reader["total_expenses"]);
                            preview.ExpensesCount = Convert.ToInt32(reader["expenses_count"]);
                        }
                    }
                }

                // Expected Cash in Drawer = Cash Sales - Cash Refunds + Cash Debt Collections - Expenses
                preview.ExpectedCashPiasters = preview.CashSalesPiasters - preview.ReturnsCashPiasters + preview.DebtPaymentsPiasters - preview.ExpensesPiasters;
                if (preview.ExpectedCashPiasters < 0) preview.ExpectedCashPiasters = 0;
            }

            return preview;
        }

        public DailyClosing SaveClosing(DailyClosingSaveRequest request)
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
                CreditSalesPiasters = preview.CreditSalesPiasters,
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
