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

                            string source = string.IsNullOrEmpty(expense.Source) ? "drawer" : expense.Source.Trim().ToLowerInvariant();
                            if (source != "safe" && source != "main_safe")
                            {
                                source = "drawer";
                            }
                            expense.Source = source;

                            // Closed day validation
                            using (var clCmd = new SQLiteCommand("SELECT 1 FROM daily_closings WHERE business_date = @bdate LIMIT 1;", conn, trans))
                            {
                                clCmd.Parameters.AddWithValue("@bdate", expense.BusinessDate);
                                if (clCmd.ExecuteScalar() != null)
                                {
                                    throw new InvalidOperationException(string.Format("لا يمكن تسجيل مصروف لتاريخ عمل تم إقفاله وتشميعه مسبقاً ({0}).", expense.BusinessDate));
                                }
                            }

                            // Live drawer cash balance validation - ONLY if expense is paid from drawer
                            if (source == "drawer" && RafiqPOS.Services.DatabaseService.DailyClosing != null)
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
                                    id, expense_number, amount_piasters, category, notes, source, created_by, business_date, created_at, shift_id, is_cancelled
                                ) VALUES (
                                    @id, @num, @amount, @category, @notes, @source, @createdBy, @bdate, @created_at, @shiftId, 0
                                );
                            ";

                            using (var cmd = new SQLiteCommand(sql, conn, trans))
                            {
                                cmd.Parameters.AddWithValue("@id", expense.Id);
                                cmd.Parameters.AddWithValue("@num", expense.ExpenseNumber);
                                cmd.Parameters.AddWithValue("@amount", expense.AmountPiasters);
                                cmd.Parameters.AddWithValue("@category", expense.Category ?? "عام");
                                cmd.Parameters.AddWithValue("@notes", (object)expense.Notes ?? DBNull.Value);
                                cmd.Parameters.AddWithValue("@source", expense.Source);
                                cmd.Parameters.AddWithValue("@createdBy", (object)expense.CreatedBy ?? DBNull.Value);
                                cmd.Parameters.AddWithValue("@bdate", expense.BusinessDate);
                                cmd.Parameters.AddWithValue("@created_at", expense.CreatedAt);
                                cmd.Parameters.AddWithValue("@shiftId", (object)expense.ShiftId ?? DBNull.Value);

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
                                        DetailsJson = string.Format("{{\"amountPiasters\":{0},\"category\":\"{1}\",\"expenseNumber\":{2},\"source\":\"{3}\"}}",
                                            expense.AmountPiasters,
                                            (expense.Category ?? "").Replace("\"", "\\\""),
                                            expense.ExpenseNumber,
                                            expense.Source),
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

        public Expense GetById(string id)
        {
            if (string.IsNullOrEmpty(id)) return null;

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = "SELECT * FROM expenses WHERE id = @id LIMIT 1;";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@id", id);
                    using (var reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            return MapReaderToExpense(reader);
                        }
                    }
                }
            }
            return null;
        }

        public bool CancelExpense(string expenseId, string cancelledBy, string reason)
        {
            if (string.IsNullOrWhiteSpace(expenseId))
            {
                throw new ArgumentException("معرف المصروف غير صالح", "expenseId");
            }
            if (string.IsNullOrWhiteSpace(reason))
            {
                throw new ArgumentException("يجب توضيح سبب إلغاء المصروف لتوثيقه في سجل التدقيق المالي", "reason");
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
                            Expense existing = null;
                            string selSql = "SELECT * FROM expenses WHERE id = @id LIMIT 1;";
                            using (var selCmd = new SQLiteCommand(selSql, conn, trans))
                            {
                                selCmd.Parameters.AddWithValue("@id", expenseId);
                                using (var reader = selCmd.ExecuteReader())
                                {
                                    if (reader.Read())
                                    {
                                        existing = MapReaderToExpense(reader);
                                    }
                                }
                            }

                            if (existing == null)
                            {
                                throw new InvalidOperationException("المصروف المطلوب إلغاؤه غير موجود.");
                            }

                            if (existing.IsCancelled)
                            {
                                throw new InvalidOperationException("هذا المصروف ملغى بالفعل مسبقاً.");
                            }

                            // Verify business day is not closed
                            using (var clCmd = new SQLiteCommand("SELECT 1 FROM daily_closings WHERE business_date = @bdate LIMIT 1;", conn, trans))
                            {
                                clCmd.Parameters.AddWithValue("@bdate", existing.BusinessDate);
                                if (clCmd.ExecuteScalar() != null)
                                {
                                    throw new InvalidOperationException(string.Format("لا يمكن إلغاء مصروف ليوم عمل تم إقفاله واعتماده مسبقاً ({0}).", existing.BusinessDate));
                                }
                            }

                            string nowUtc = DateTime.UtcNow.ToString("o");
                            string updateSql = @"
                                UPDATE expenses 
                                SET is_cancelled = 1,
                                    cancelled_at = @now,
                                    cancelled_by = @by,
                                    cancel_reason = @reason
                                WHERE id = @id;
                            ";

                            using (var updCmd = new SQLiteCommand(updateSql, conn, trans))
                            {
                                updCmd.Parameters.AddWithValue("@now", nowUtc);
                                updCmd.Parameters.AddWithValue("@by", !string.IsNullOrWhiteSpace(cancelledBy) ? cancelledBy : "المدير");
                                updCmd.Parameters.AddWithValue("@reason", reason.Trim());
                                updCmd.Parameters.AddWithValue("@id", expenseId);
                                updCmd.ExecuteNonQuery();
                            }

                            if (_auditRepo != null)
                            {
                                try
                                {
                                    _auditRepo.Log(conn, trans, new AuditLog
                                    {
                                        Id = "aud_" + Guid.NewGuid().ToString("N"),
                                        UserId = !string.IsNullOrWhiteSpace(cancelledBy) ? cancelledBy : "المدير",
                                        Action = "cancel_expense",
                                        EntityType = "expense",
                                        EntityId = expenseId,
                                        DetailsJson = string.Format("{{\"amountPiasters\":{0},\"category\":\"{1}\",\"expenseNumber\":{2},\"source\":\"{3}\",\"reason\":\"{4}\"}}",
                                            existing.AmountPiasters,
                                            (existing.Category ?? "").Replace("\"", "\\\""),
                                            existing.ExpenseNumber,
                                            existing.Source,
                                            reason.Trim().Replace("\"", "\\\"")),
                                        CreatedAt = nowUtc
                                    });
                                }
                                catch { }
                            }

                            trans.Commit();
                            return true;
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

        public Expense UpdateExpense(UpdateExpenseRequest request)
        {
            if (request == null) throw new ArgumentNullException("request");
            if (string.IsNullOrWhiteSpace(request.ExpenseId))
            {
                throw new ArgumentException("معرف المصروف غير صالح", "ExpenseId");
            }
            if (request.AmountPiasters <= 0)
            {
                throw new ArgumentException("قيمة المصروف يجب أن تكون أكبر من الصفر", "AmountPiasters");
            }
            if (string.IsNullOrWhiteSpace(request.Reason))
            {
                throw new ArgumentException("يجب توضيح سبب تعديل المصروف لتوثيقه في سجل التدقيق المالي", "Reason");
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
                            Expense existing = null;
                            string selSql = "SELECT * FROM expenses WHERE id = @id LIMIT 1;";
                            using (var selCmd = new SQLiteCommand(selSql, conn, trans))
                            {
                                selCmd.Parameters.AddWithValue("@id", request.ExpenseId);
                                using (var reader = selCmd.ExecuteReader())
                                {
                                    if (reader.Read())
                                    {
                                        existing = MapReaderToExpense(reader);
                                    }
                                }
                            }

                            if (existing == null)
                            {
                                throw new InvalidOperationException("المصروف المطلوب تعديله غير موجود.");
                            }

                            if (existing.IsCancelled)
                            {
                                throw new InvalidOperationException("لا يمكن تعديل مصروف تم إلغاؤه مسبقاً.");
                            }

                            // Verify business day is not closed
                            using (var clCmd = new SQLiteCommand("SELECT 1 FROM daily_closings WHERE business_date = @bdate LIMIT 1;", conn, trans))
                            {
                                clCmd.Parameters.AddWithValue("@bdate", existing.BusinessDate);
                                if (clCmd.ExecuteScalar() != null)
                                {
                                    throw new InvalidOperationException(string.Format("لا يمكن تعديل مصروف ليوم عمل تم إقفاله واعتماده مسبقاً ({0}).", existing.BusinessDate));
                                }
                            }

                            string targetSource = string.IsNullOrEmpty(request.Source) ? existing.Source : request.Source.Trim().ToLowerInvariant();
                            if (targetSource != "safe" && targetSource != "main_safe")
                            {
                                targetSource = "drawer";
                            }

                            // If drawer expense increases, ensure drawer balance can cover delta
                            if (targetSource == "drawer" && request.AmountPiasters > existing.AmountPiasters && RafiqPOS.Services.DatabaseService.DailyClosing != null)
                            {
                                long delta = request.AmountPiasters - existing.AmountPiasters;
                                var liveBal = RafiqPOS.Services.DatabaseService.DailyClosing.GetLiveDrawerBalance(existing.BusinessDate);
                                if (liveBal != null && liveBal.AvailableCashPiasters < delta)
                                {
                                    throw new InvalidOperationException(string.Format(
                                        "رصيد نقدية الدرج المتاح حالياً ({0:N2} ج.م) غير كافٍ لزيادة هذا المصروف بفارق ({1:N2} ج.م).",
                                        liveBal.AvailableCashPiasters / 100.0, delta / 100.0));
                                }
                            }

                            string nowUtc = DateTime.UtcNow.ToString("o");
                            string updatedBy = !string.IsNullOrWhiteSpace(request.UpdatedBy) ? request.UpdatedBy : "المدير";
                            string cancelReason = "تم التعديل: " + (request.Reason ?? "").Trim();

                            // 1. Cancel the existing expense (Immutable audit trail - F-23)
                            string cancelOldSql = @"
                                UPDATE expenses
                                SET is_cancelled = 1,
                                    cancel_reason = @cancelReason,
                                    cancelled_at = @now,
                                    cancelled_by = @cancelledBy,
                                    updated_at = @now
                                WHERE id = @id;
                            ";
                            using (var cancelCmd = new SQLiteCommand(cancelOldSql, conn, trans))
                            {
                                cancelCmd.Parameters.AddWithValue("@cancelReason", cancelReason);
                                cancelCmd.Parameters.AddWithValue("@cancelledBy", updatedBy);
                                cancelCmd.Parameters.AddWithValue("@now", nowUtc);
                                cancelCmd.Parameters.AddWithValue("@id", existing.Id);
                                cancelCmd.ExecuteNonQuery();
                            }

                            // 2. Insert new replacement expense linked via replaces_expense_id
                            string newExpId = "exp_" + Guid.NewGuid().ToString("N").Substring(0, 12);
                            long newExpNumber = _counterRepo != null 
                                ? _counterRepo.GetNextCounterNumber(conn, trans, "expense", "expenses", "expense_number") 
                                : (existing.ExpenseNumber + 1);
                            string targetCategory = !string.IsNullOrEmpty(request.Category) ? request.Category.Trim() : existing.Category;

                            string insNewSql = @"
                                INSERT INTO expenses (
                                    id, expense_number, amount_piasters, category, notes, source,
                                    created_by, business_date, shift_id, is_cancelled,
                                    replaces_expense_id, created_at, updated_at
                                ) VALUES (
                                    @newId, @expenseNumber, @amount, @category, @notes, @source,
                                    @createdBy, @businessDate, @shiftId, 0,
                                    @replacesId, @now, @now
                                );
                            ";
                            using (var insCmd = new SQLiteCommand(insNewSql, conn, trans))
                            {
                                insCmd.Parameters.AddWithValue("@newId", newExpId);
                                insCmd.Parameters.AddWithValue("@expenseNumber", newExpNumber);
                                insCmd.Parameters.AddWithValue("@amount", request.AmountPiasters);
                                insCmd.Parameters.AddWithValue("@category", targetCategory);
                                insCmd.Parameters.AddWithValue("@notes", (object)request.Notes ?? DBNull.Value);
                                insCmd.Parameters.AddWithValue("@source", targetSource);
                                insCmd.Parameters.AddWithValue("@createdBy", updatedBy);
                                insCmd.Parameters.AddWithValue("@businessDate", existing.BusinessDate);
                                insCmd.Parameters.AddWithValue("@shiftId", (object)existing.ShiftId ?? DBNull.Value);
                                insCmd.Parameters.AddWithValue("@replacesId", existing.Id);
                                insCmd.Parameters.AddWithValue("@now", nowUtc);
                                insCmd.ExecuteNonQuery();
                            }

                            if (_auditRepo != null)
                            {
                                try
                                {
                                    _auditRepo.Log(conn, trans, new AuditLog
                                    {
                                        Id = "aud_" + Guid.NewGuid().ToString("N"),
                                        UserId = updatedBy,
                                        Action = "update_expense",
                                        EntityType = "expense",
                                        EntityId = newExpId,
                                        DetailsJson = string.Format("{{\"oldExpenseId\":\"{0}\",\"newExpenseId\":\"{1}\",\"oldAmount\":{2},\"newAmount\":{3},\"oldCat\":\"{4}\",\"newCat\":\"{5}\",\"reason\":\"{6}\"}}",
                                            existing.Id,
                                            newExpId,
                                            existing.AmountPiasters,
                                            request.AmountPiasters,
                                            (existing.Category ?? "").Replace("\"", "\\\""),
                                            targetCategory.Replace("\"", "\\\""),
                                            request.Reason.Trim().Replace("\"", "\\\"")),
                                        CreatedAt = nowUtc
                                    });
                                }
                                catch { }
                            }

                            trans.Commit();

                            var replacedExpense = new Expense
                            {
                                Id = newExpId,
                                ExpenseNumber = newExpNumber,
                                AmountPiasters = request.AmountPiasters,
                                Category = targetCategory,
                                Notes = request.Notes,
                                Source = targetSource,
                                CreatedBy = updatedBy,
                                BusinessDate = existing.BusinessDate,
                                ShiftId = existing.ShiftId,
                                IsCancelled = false,
                                ReplacesExpenseId = existing.Id,
                                CreatedAt = nowUtc,
                                UpdatedAt = nowUtc
                            };
                            return replacedExpense;
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
                string sql = "SELECT COALESCE(SUM(amount_piasters), 0) FROM expenses WHERE business_date = @bdate AND is_cancelled = 0;";
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

        public List<ExpenseCategory> GetCategories()
        {
            var list = new List<ExpenseCategory>();
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = "SELECT * FROM expense_categories ORDER BY is_predefined DESC, name ASC;";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            list.Add(new ExpenseCategory
                            {
                                Id = reader["id"].ToString(),
                                Name = reader["name"].ToString(),
                                Description = reader["description"] != DBNull.Value ? reader["description"].ToString() : null,
                                IsPredefined = Convert.ToInt32(reader["is_predefined"]) == 1,
                                CreatedAt = reader["created_at"].ToString()
                            });
                        }
                    }
                }
            }
            return list;
        }

        public ExpenseCategory InsertCategory(string name, string description)
        {
            if (string.IsNullOrWhiteSpace(name))
            {
                throw new ArgumentException("اسم بند المصروف مطلوب", "name");
            }

            name = name.Trim();
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string checkSql = "SELECT * FROM expense_categories WHERE name = @name LIMIT 1;";
                using (var checkCmd = new SQLiteCommand(checkSql, conn))
                {
                    checkCmd.Parameters.AddWithValue("@name", name);
                    using (var reader = checkCmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            return new ExpenseCategory
                            {
                                Id = reader["id"].ToString(),
                                Name = reader["name"].ToString(),
                                Description = reader["description"] != DBNull.Value ? reader["description"].ToString() : null,
                                IsPredefined = Convert.ToInt32(reader["is_predefined"]) == 1,
                                CreatedAt = reader["created_at"].ToString()
                            };
                        }
                    }
                }

                string id = "exp_cat_" + Guid.NewGuid().ToString("N");
                string now = DateTime.UtcNow.ToString("o");
                string insSql = @"
                    INSERT INTO expense_categories (id, name, description, is_predefined, created_at)
                    VALUES (@id, @name, @desc, 0, @now);
                ";
                using (var cmd = new SQLiteCommand(insSql, conn))
                {
                    cmd.Parameters.AddWithValue("@id", id);
                    cmd.Parameters.AddWithValue("@name", name);
                    cmd.Parameters.AddWithValue("@desc", (object)description ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@now", now);
                    cmd.ExecuteNonQuery();
                }

                return new ExpenseCategory
                {
                    Id = id,
                    Name = name,
                    Description = description,
                    IsPredefined = false,
                    CreatedAt = now
                };
            }
        }

        private Expense MapReaderToExpense(SQLiteDataReader reader)
        {
            var exp = new Expense();
            exp.Id = reader["id"].ToString();
            exp.ExpenseNumber = Convert.ToInt64(reader["expense_number"]);
            exp.AmountPiasters = Convert.ToInt64(reader["amount_piasters"]);
            exp.Category = reader["category"] != DBNull.Value ? reader["category"].ToString() : "عام";
            exp.Notes = reader["notes"] != DBNull.Value ? reader["notes"].ToString() : null;
            exp.CreatedBy = reader["created_by"] != DBNull.Value ? reader["created_by"].ToString() : null;
            exp.BusinessDate = reader["business_date"].ToString();
            exp.CreatedAt = reader["created_at"].ToString();

            for (int i = 0; i < reader.FieldCount; i++)
            {
                string col = reader.GetName(i);
                if (string.Equals(col, "source", StringComparison.OrdinalIgnoreCase))
                {
                    exp.Source = reader[i] != DBNull.Value ? reader[i].ToString() : "drawer";
                }
                else if (string.Equals(col, "shift_id", StringComparison.OrdinalIgnoreCase))
                {
                    exp.ShiftId = reader[i] != DBNull.Value ? reader[i].ToString() : null;
                }
                else if (string.Equals(col, "is_cancelled", StringComparison.OrdinalIgnoreCase))
                {
                    exp.IsCancelled = Convert.ToInt32(reader[i]) == 1;
                }
                else if (string.Equals(col, "cancelled_at", StringComparison.OrdinalIgnoreCase))
                {
                    exp.CancelledAt = reader[i] != DBNull.Value ? reader[i].ToString() : null;
                }
                else if (string.Equals(col, "cancelled_by", StringComparison.OrdinalIgnoreCase))
                {
                    exp.CancelledBy = reader[i] != DBNull.Value ? reader[i].ToString() : null;
                }
                else if (string.Equals(col, "cancel_reason", StringComparison.OrdinalIgnoreCase))
                {
                    exp.CancelReason = reader[i] != DBNull.Value ? reader[i].ToString() : null;
                }
                else if (string.Equals(col, "updated_at", StringComparison.OrdinalIgnoreCase))
                {
                    exp.UpdatedAt = reader[i] != DBNull.Value ? reader[i].ToString() : null;
                }
                else if (string.Equals(col, "replaces_expense_id", StringComparison.OrdinalIgnoreCase))
                {
                    exp.ReplacesExpenseId = reader[i] != DBNull.Value ? reader[i].ToString() : null;
                }
            }

            if (string.IsNullOrEmpty(exp.Source))
            {
                exp.Source = "drawer";
            }

            return exp;
        }
    }
}
