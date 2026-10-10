using System;
using System.Collections.Generic;
using System.Data.SQLite;
using RafiqPOS.Models;

namespace RafiqPOS.Repositories
{
    public class ExpenseRepository
    {
        private readonly string _connectionString;

        public ExpenseRepository(string connectionString)
        {
            _connectionString = connectionString;
        }

        public Expense Insert(Expense expense)
        {
            if (expense == null) throw new ArgumentNullException("expense");
            if (expense.AmountPiasters <= 0)
            {
                throw new ArgumentException("قيمة المصروف يجب أن تكون أكبر من الصفر", "AmountPiasters");
            }

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        // 1. Get next sequential expense number from counters
                        long nextNum = 1;
                        using (var counterCmd = new SQLiteCommand(@"
                            UPDATE counters 
                            SET current_value = current_value + 1, updated_at = datetime('now')
                            WHERE name = 'expense';
                            SELECT current_value FROM counters WHERE name = 'expense';
                        ", conn, trans))
                        {
                            object val = counterCmd.ExecuteScalar();
                            if (val != null && val != DBNull.Value)
                            {
                                nextNum = Convert.ToInt64(val);
                            }
                        }
                        expense.ExpenseNumber = nextNum;

                        string sql = @"
                            INSERT INTO expenses (
                                id, expense_number, amount_piasters, category, notes, created_by, business_date, created_at
                            ) VALUES (
                                @id, @num, @amount, @category, @notes, @createdBy, @bdate, datetime('now', 'localtime')
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

                            cmd.ExecuteNonQuery();
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
