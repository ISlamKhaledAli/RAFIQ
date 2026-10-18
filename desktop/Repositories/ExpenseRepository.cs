using System;
using System.Collections.Generic;
using System.Data.SQLite;
using RafiqPOS.Models;

namespace RafiqPOS.Repositories
{
    public class ExpenseRepository
    {
        private readonly string _connectionString;
        private readonly AuditLogRepository _auditRepo;
        private readonly CounterRepository _counterRepo;

        public ExpenseRepository(string connectionString, AuditLogRepository auditRepo = null, CounterRepository counterRepo = null)
        {
            _connectionString = connectionString;
            _auditRepo = auditRepo;
            _counterRepo = counterRepo ?? new CounterRepository(connectionString);
        }

        public Expense Insert(Expense expense)
        {
            if (expense == null) throw new ArgumentNullException("expense");
            if (expense.AmountPiasters <= 0)
            {
                throw new ArgumentException("قيمة المصروف يجب أن تكون أكبر من الصفر", "AmountPiasters");
            }

            lock (RafiqPOS.Services.SaleService.FinancialWriteLock)
            {
                using (var conn = new SQLiteConnection(_connectionString))
                {
                    conn.Open();
                    using (var trans = conn.BeginTransaction())
                    {
                        try
                        {
                            // 1. Get next sequential expense number from counters with self-healing fallback
                            expense.ExpenseNumber = _counterRepo.GetNextCounterNumber(conn, trans, "expense", "expenses", "expense_number");

                        if (string.IsNullOrWhiteSpace(expense.Id))
                        {
                            expense.Id = "exp_" + Guid.NewGuid().ToString("N");
                        }
                        if (string.IsNullOrWhiteSpace(expense.BusinessDate))
                        {
                            expense.BusinessDate = DateTime.Now.ToString("yyyy-MM-dd");
                        }
                        if (string.IsNullOrWhiteSpace(expense.CreatedAt))
                        {
                            expense.CreatedAt = DateTime.UtcNow.ToString("o");
                        }

                        // Closed day validation
                        using (var clCmd = new SQLiteCommand("SELECT 1 FROM daily_closings WHERE business_date = @bdate LIMIT 1;", conn, trans))
                        {
                            clCmd.Parameters.AddWithValue("@bdate", expense.BusinessDate);
                            if (clCmd.ExecuteScalar() != null)
                            {
                                throw new InvalidOperationException(string.Format("لا يمكن تسجيل مصروف لتاريخ عمل تم إقفاله وتشميعه مسبقاً ({0}).", expense.BusinessDate));
                            }
                        }

                        // Live drawer cash balance validation
                        if (RafiqPOS.Services.DatabaseService.DailyClosing != null)
                        {
                            var liveBal = RafiqPOS.Services.DatabaseService.DailyClosing.GetLiveDrawerBalance(expense.BusinessDate);
                            if (liveBal != null && liveBal.AvailableCashPiasters < expense.AmountPiasters)
                            {
                                throw new InvalidOperationException(string.Format(
                                    "رصيد نقدية الدرج المتاح حالياً ({0:N2} ج.م) غير كافٍ لصرف هذا المصروف ({1:N2} ج.م). يرجى توريد عهدة للدرج أولاً.",
                                    liveBal.AvailableCashPiasters / 100.0, expense.AmountPiasters / 100.0));
                            }
                        }

                        string sql = @"
                            INSERT INTO expenses (
                                id, expense_number, amount_piasters, category, notes, created_by, business_date, created_at
                            ) VALUES (
                                @id, @num, @amount, @category, @notes, @createdBy, @bdate, @created_at
                            );
                        ";

                        using (var cmd = new SQLiteCommand(sql, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@id", expense.Id);
                            cmd.Parameters.AddWithValue("@num", expense.ExpenseNumber);
                            cmd.Parameters.AddWithValue("@amount", expense.AmountPiasters);
                            cmd.Parameters.AddWithValue("@category", expense.Category ?? "عام");
                            cmd.Parameters.AddWithValue("@notes", (object)expense.Notes ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@createdBy", (object)expense.CreatedBy ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@bdate", expense.BusinessDate);
                            cmd.Parameters.AddWithValue("@created_at", expense.CreatedAt);

                            cmd.ExecuteNonQuery();
                        }

                        if (_auditRepo != null)
                        {
                            try
                            {
                                _auditRepo.Log(conn, trans, new AuditLog
                                {
                                    Id = "aud_" + Guid.NewGuid().ToString("N"),
                                    UserId = !string.IsNullOrWhiteSpace(expense.CreatedBy) ? expense.CreatedBy : "الكاشير",
                                    Action = "create_expense",
                                    EntityType = "expense",
                                    EntityId = expense.Id,
                                    DetailsJson = string.Format("{{\"amountPiasters\":{0},\"category\":\"{1}\",\"expenseNumber\":{2}}}",
                                        expense.AmountPiasters,
                                        (expense.Category ?? "").Replace("\"", "\\\""),
                                        expense.ExpenseNumber),
                                    CreatedAt = expense.CreatedAt
                                });
                            }
                            catch { }
                        }

                        trans.Commit();
                        return expense;
                    }
                    catch
                    {
                        trans.Rollback();
                        throw;
                    }
                }
            }
            }
        }

        public List<Expense> GetByBusinessDate(string businessDate)
        {
            var list = new List<Expense>();
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = "SELECT * FROM expenses WHERE business_date = @bdate ORDER BY expense_number DESC;";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@bdate", businessDate);
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            list.Add(MapReaderToExpense(reader));
                        }
                    }
                }
            }
            return list;
        }

        public List<Expense> GetRecent(int limit)
        {
            var list = new List<Expense>();
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = "SELECT * FROM expenses ORDER BY created_at DESC LIMIT @limit;";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@limit", limit > 0 ? limit : 50);
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            list.Add(MapReaderToExpense(reader));
                        }
                    }
                }
            }
            return list;
        }

        public long GetTotalByBusinessDate(string businessDate)
        {
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = "SELECT COALESCE(SUM(amount_piasters), 0) FROM expenses WHERE business_date = @bdate;";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@bdate", businessDate);
                    object val = cmd.ExecuteScalar();
                    if (val != null && val != DBNull.Value)
                    {
                        return Convert.ToInt64(val);
                    }
                }
            }
            return 0;
        }

        private Expense MapReaderToExpense(SQLiteDataReader reader)
        {
            return new Expense
            {
                Id = reader["id"].ToString(),
                ExpenseNumber = Convert.ToInt64(reader["expense_number"]),
                AmountPiasters = Convert.ToInt64(reader["amount_piasters"]),
                Category = reader["category"] != DBNull.Value ? reader["category"].ToString() : "عام",
                Notes = reader["notes"] != DBNull.Value ? reader["notes"].ToString() : null,
                CreatedBy = reader["created_by"] != DBNull.Value ? reader["created_by"].ToString() : null,
                BusinessDate = reader["business_date"].ToString(),
                CreatedAt = reader["created_at"].ToString()
            };
        }
    }
}
