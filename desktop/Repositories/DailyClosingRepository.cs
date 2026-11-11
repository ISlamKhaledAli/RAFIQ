using System;
using System.Collections.Generic;
using RafiqPOS.Data;
using RafiqPOS.Models;

namespace RafiqPOS.Repositories
{
    public class DailyClosingRepository
    {
        private readonly string _connectionString;

        public DailyClosingRepository(string connectionString)
        {
            _connectionString = connectionString;
        }

        public DailyClosing GetByBusinessDate(string businessDate)
        {
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = "SELECT * FROM daily_closings WHERE business_date = @bdate LIMIT 1;";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@bdate", businessDate);
                    using (var reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            return MapReaderToClosing(reader);
                        }
                    }
                }
            }
            return null;
        }

        public DailyClosing GetById(string id)
        {
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = "SELECT * FROM daily_closings WHERE id = @id LIMIT 1;";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@id", id);
                    using (var reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            return MapReaderToClosing(reader);
                        }
                    }
                }
            }
            return null;
        }

        public List<DailyClosing> GetHistory(int limit)
        {
            return GetHistory(limit, null, null);
        }

        /// <summary>
        /// سجل الإغلاقات مع تصفية اختيارية بتاريخ يوم العمل (business_date، شاملة الطرفين؛ تُعاد الترتيب لو انعكست)
        /// </summary>
        private static string NormalizeBusinessDay(string value)
        {
            if (string.IsNullOrWhiteSpace(value)) return null;
            string trimmed = value.Trim();
            if (trimmed.Length > 10) trimmed = trimmed.Substring(0, 10);
            DateTime parsed;
            if (!DateTime.TryParseExact(trimmed, "yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.None, out parsed))
            {
                return null;
            }
            return parsed.ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture);
        }

        public List<DailyClosing> GetHistory(int limit, string dateFrom, string dateTo)
        {
            var list = new List<DailyClosing>();
            string fromDay = NormalizeBusinessDay(dateFrom);
            string toDay = NormalizeBusinessDay(dateTo);
            if (fromDay != null && toDay != null && string.CompareOrdinal(fromDay, toDay) > 0)
            {
                string swap = fromDay;
                fromDay = toDay;
                toDay = swap;
            }

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                var clauses = new List<string>();
                if (fromDay != null) clauses.Add("business_date >= @dateFrom");
                if (toDay != null) clauses.Add("business_date <= @dateTo");
                string sql = "SELECT * FROM daily_closings "
                    + (clauses.Count > 0 ? "WHERE " + string.Join(" AND ", clauses) + " " : "")
                    + "ORDER BY business_date DESC LIMIT @limit;";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    if (fromDay != null) cmd.Parameters.AddWithValue("@dateFrom", fromDay);
                    if (toDay != null) cmd.Parameters.AddWithValue("@dateTo", toDay);
                    cmd.Parameters.AddWithValue("@limit", limit > 0 ? limit : 30);
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            list.Add(MapReaderToClosing(reader));
                        }
                    }
                }
            }
            return list;
        }

        public void Insert(DailyClosing closing, SQLiteConnection conn, SQLiteTransaction trans)
        {
            string sql = @"
                INSERT INTO daily_closings (
                    id, closing_number, business_date, closed_at, cashier_id, cashier_name,
                    total_sales_piasters, cash_sales_piasters, card_sales_piasters, instapay_sales_piasters, vodafone_cash_sales_piasters, credit_sales_piasters, expenses_piasters,
                    returns_total_piasters, returns_cash_piasters, cancelled_total_piasters,
                    debt_payments_piasters, expected_cash_piasters, actual_cash_piasters,
                    difference_piasters, gross_profit_piasters, invoices_count, returns_count,
                    cancelled_count, notes, summary_json, is_sealed
                ) VALUES (
                    @id, @cnum, @bdate, @closedAt, @cashierId, @cashierName,
                    @sales, @cash, @card, @instapay, @vodafone, @credit, @expenses,
                    @retTotal, @retCash, @cancTotal,
                    @debtPay, @expCash, @actCash,
                    @diff, @profit, @invCount, @retCount,
                    @cancCount, @notes, @summaryJson, 1
                );
            ";

            using (var cmd = new SQLiteCommand(sql, conn, trans))
            {
                cmd.Parameters.AddWithValue("@id", closing.Id);
                cmd.Parameters.AddWithValue("@cnum", closing.ClosingNumber);
                cmd.Parameters.AddWithValue("@bdate", closing.BusinessDate);
                cmd.Parameters.AddWithValue("@closedAt", closing.ClosedAt);
                cmd.Parameters.AddWithValue("@cashierId", (object)closing.CashierId ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@cashierName", (object)closing.CashierName ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@sales", closing.TotalSalesPiasters);
                cmd.Parameters.AddWithValue("@cash", closing.CashSalesPiasters);
                cmd.Parameters.AddWithValue("@card", closing.CardSalesPiasters);
                cmd.Parameters.AddWithValue("@instapay", closing.InstapaySalesPiasters);
                cmd.Parameters.AddWithValue("@vodafone", closing.VodafoneCashSalesPiasters);
                cmd.Parameters.AddWithValue("@credit", closing.CreditSalesPiasters);
                cmd.Parameters.AddWithValue("@expenses", closing.ExpensesPiasters);
                cmd.Parameters.AddWithValue("@retTotal", closing.ReturnsTotalPiasters);
                cmd.Parameters.AddWithValue("@retCash", closing.ReturnsCashPiasters);
                cmd.Parameters.AddWithValue("@cancTotal", closing.CancelledTotalPiasters);
                cmd.Parameters.AddWithValue("@debtPay", closing.DebtPaymentsPiasters);
                cmd.Parameters.AddWithValue("@expCash", closing.ExpectedCashPiasters);
                cmd.Parameters.AddWithValue("@actCash", closing.ActualCashPiasters);
                cmd.Parameters.AddWithValue("@diff", closing.DifferencePiasters);
                cmd.Parameters.AddWithValue("@profit", closing.GrossProfitPiasters);
                cmd.Parameters.AddWithValue("@invCount", closing.InvoicesCount);
                cmd.Parameters.AddWithValue("@retCount", closing.ReturnsCount);
                cmd.Parameters.AddWithValue("@cancCount", closing.CancelledCount);
                cmd.Parameters.AddWithValue("@notes", (object)closing.Notes ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@summaryJson", (object)closing.SummaryJson ?? DBNull.Value);

                cmd.ExecuteNonQuery();
            }
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

        private DailyClosing MapReaderToClosing(SQLiteDataReader reader)
        {
            return new DailyClosing
            {
                Id = reader["id"].ToString(),
                ClosingNumber = Convert.ToInt64(reader["closing_number"]),
                BusinessDate = reader["business_date"].ToString(),
                ClosedAt = reader["closed_at"].ToString(),
                CashierId = reader["cashier_id"] != DBNull.Value ? reader["cashier_id"].ToString() : null,
                CashierName = reader["cashier_name"] != DBNull.Value ? reader["cashier_name"].ToString() : null,
                TotalSalesPiasters = Convert.ToInt64(reader["total_sales_piasters"]),
                CashSalesPiasters = Convert.ToInt64(reader["cash_sales_piasters"]),
                CardSalesPiasters = HasColumn(reader, "card_sales_piasters") ? Convert.ToInt64(reader["card_sales_piasters"]) : 0,
                InstapaySalesPiasters = HasColumn(reader, "instapay_sales_piasters") ? Convert.ToInt64(reader["instapay_sales_piasters"]) : 0,
                VodafoneCashSalesPiasters = HasColumn(reader, "vodafone_cash_sales_piasters") ? Convert.ToInt64(reader["vodafone_cash_sales_piasters"]) : 0,
                CreditSalesPiasters = Convert.ToInt64(reader["credit_sales_piasters"]),
                ExpensesPiasters = HasColumn(reader, "expenses_piasters") ? Convert.ToInt64(reader["expenses_piasters"]) : 0,
                ReturnsTotalPiasters = Convert.ToInt64(reader["returns_total_piasters"]),
                ReturnsCashPiasters = Convert.ToInt64(reader["returns_cash_piasters"]),
                CancelledTotalPiasters = Convert.ToInt64(reader["cancelled_total_piasters"]),
                DebtPaymentsPiasters = Convert.ToInt64(reader["debt_payments_piasters"]),
                ExpectedCashPiasters = Convert.ToInt64(reader["expected_cash_piasters"]),
                ActualCashPiasters = Convert.ToInt64(reader["actual_cash_piasters"]),
                DifferencePiasters = Convert.ToInt64(reader["difference_piasters"]),
                GrossProfitPiasters = Convert.ToInt64(reader["gross_profit_piasters"]),
                InvoicesCount = Convert.ToInt32(reader["invoices_count"]),
                ReturnsCount = Convert.ToInt32(reader["returns_count"]),
                CancelledCount = Convert.ToInt32(reader["cancelled_count"]),
                Notes = reader["notes"] != DBNull.Value ? reader["notes"].ToString() : null,
                SummaryJson = reader["summary_json"] != DBNull.Value ? reader["summary_json"].ToString() : null,
                IsSealed = Convert.ToInt32(reader["is_sealed"]) == 1
            };
        }
    }
}
