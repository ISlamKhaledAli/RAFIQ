using System;
using System.Collections.Generic;
using RafiqPOS.Models;
using RafiqPOS.Repositories;

namespace RafiqPOS.Services
{
    public class ExpenseService
    {
        private readonly ExpenseRepository _expenseRepo;
        private readonly DailyClosingService _dailyClosingService;

        public ExpenseService(ExpenseRepository expenseRepo, DailyClosingService dailyClosingService)
        {
            _expenseRepo = expenseRepo;
            _dailyClosingService = dailyClosingService;
        }

        public Expense CreateExpense(CreateExpenseRequest request)
        {
            if (request == null)
            {
                throw new ArgumentNullException("request", "بيانات المصروف غير صالحة");
            }

            if (request.AmountPiasters <= 0)
            {
                throw new ArgumentException("قيمة المصروف يجب أن تكون أكبر من الصفر", "AmountPiasters");
            }

            lock (SaleService.FinancialWriteLock)
            {
                string businessDate = string.IsNullOrEmpty(request.BusinessDate)
                    ? (_dailyClosingService != null ? _dailyClosingService.GetCurrentBusinessDate() : DateTime.Now.ToString("yyyy-MM-dd"))
                    : request.BusinessDate;

                if (_dailyClosingService != null && _dailyClosingService.IsDayClosed(businessDate))
                {
                    throw new InvalidOperationException(string.Format("لا يمكن تسجيل مصروف لتاريخ يومية تم إقفالها مسبقاً ({0}).", businessDate));
                }

                string source = string.IsNullOrEmpty(request.Source) ? "drawer" : request.Source.Trim().ToLowerInvariant();
                if (source != "safe" && source != "main_safe")
                {
                    source = "drawer";
                }

                string shiftId = request.ShiftId;
                if (source == "drawer")
                {
                    if (DatabaseService.Shifts != null)
                    {
                        var activeShift = DatabaseService.Shifts.GetActiveShift();
                        if (activeShift == null)
                        {
                            throw new InvalidOperationException("لا يمكن تسجيل مصروفات نقدية من الدرج قبل فتح وردية رسمية.");
                        }
                        shiftId = activeShift.Id;
                    }

                    if (_dailyClosingService != null)
                    {
                        var liveBal = _dailyClosingService.GetLiveDrawerBalance(businessDate);
                        if (liveBal != null && liveBal.AvailableCashPiasters < request.AmountPiasters)
                        {
                            throw new InvalidOperationException(string.Format(
                                "رصيد نقدية الدرج المتاح حالياً ({0:N2} ج.م) غير كافٍ لصرف هذا المصروف ({1:N2} ج.م). يرجى توريد عهدة للدرج أولاً.",
                                liveBal.AvailableCashPiasters / 100.0, request.AmountPiasters / 100.0));
                        }
                    }
                }
                else
                {
                    // Safe expense does not require a cashier shift and does not deduct from cashier drawer
                    shiftId = null;
                }

                var expense = new Expense
                {
                    Id = "exp_" + Guid.NewGuid().ToString("N"),
                    AmountPiasters = request.AmountPiasters,
                    Category = string.IsNullOrEmpty(request.Category) ? "عام" : request.Category.Trim(),
                    Notes = string.IsNullOrEmpty(request.Notes) ? null : request.Notes.Trim(),
                    Source = source,
                    CreatedBy = string.IsNullOrEmpty(request.CreatedBy) ? "الكاشير" : request.CreatedBy.Trim(),
                    BusinessDate = businessDate,
                    ShiftId = shiftId,
                    CreatedAt = DateTime.UtcNow.ToString("o")
                };

                return _expenseRepo.Insert(expense);
            }
        }

        public bool CancelExpense(CancelExpenseRequest request, bool isManagerOrRoot = false)
        {
            if (request == null)
            {
                throw new ArgumentNullException("request", "بيانات إلغاء المصروف غير صالحة");
            }
            if (string.IsNullOrWhiteSpace(request.ExpenseId))
            {
                throw new ArgumentException("معرف المصروف غير صالح", "ExpenseId");
            }
            if (string.IsNullOrWhiteSpace(request.Reason))
            {
                throw new ArgumentException("يجب توضيح سبب إلغاء المصروف لتوثيقه في سجل التدقيق", "Reason");
            }

            // Manager authorization check
            if (!isManagerOrRoot)
            {
                // Verify manager PIN if provided
                if (!string.IsNullOrWhiteSpace(request.ManagerPin) && DatabaseService.Security != null)
                {
                    var pinRes = DatabaseService.Security.VerifyPin(request.ManagerPin.Trim(), "CANCEL_EXPENSE");
                    if (!pinRes.Success)
                    {
                        throw new UnauthorizedAccessException(string.IsNullOrEmpty(pinRes.Message)
                            ? "رمز PIN المدخل غير صحيح لإلغاء المصروف."
                            : pinRes.Message);
                    }
                    if (string.IsNullOrWhiteSpace(request.CancelledBy))
                    {
                        request.CancelledBy = "المدير (مفوض بـ PIN)";
                    }
                }
                else
                {
                    throw new UnauthorizedAccessException("حظر أمني: إلغاء المصروف يتطلب صلاحية مدير معتمدة وتدوين السبب.");
                }
            }

            return _expenseRepo.CancelExpense(request.ExpenseId, request.CancelledBy, request.Reason);
        }

        public Expense UpdateExpense(UpdateExpenseRequest request, bool isManagerOrRoot = false)
        {
            if (request == null)
            {
                throw new ArgumentNullException("request", "بيانات تعديل المصروف غير صالحة");
            }
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
                throw new ArgumentException("يجب توضيح سبب تعديل المصروف لتوثيقه في سجل التدقيق", "Reason");
            }

            // Manager authorization check
            if (!isManagerOrRoot)
            {
                if (!string.IsNullOrWhiteSpace(request.ManagerPin) && DatabaseService.Security != null)
                {
                    var pinRes = DatabaseService.Security.VerifyPin(request.ManagerPin.Trim(), "UPDATE_EXPENSE");
                    if (!pinRes.Success)
                    {
                        throw new UnauthorizedAccessException(string.IsNullOrEmpty(pinRes.Message)
                            ? "رمز PIN المدخل غير صحيح لتعديل المصروف."
                            : pinRes.Message);
                    }
                    if (string.IsNullOrWhiteSpace(request.UpdatedBy))
                    {
                        request.UpdatedBy = "المدير (مفوض بـ PIN)";
                    }
                }
                else
                {
                    throw new UnauthorizedAccessException("حظر أمني: تعديل المصروف يتطلب صلاحية مدير معتمدة وتدوين السبب.");
                }
            }

            return _expenseRepo.UpdateExpense(request);
        }

        public Expense GetExpenseById(string id)
        {
            return _expenseRepo.GetById(id);
        }

        public List<Expense> GetExpenses(string businessDate)
        {
            if (string.IsNullOrEmpty(businessDate))
            {
                businessDate = _dailyClosingService != null
                    ? _dailyClosingService.GetCurrentBusinessDate()
                    : DateTime.Now.ToString("yyyy-MM-dd");
            }
            return _expenseRepo.GetByBusinessDate(businessDate);
        }

        public List<Expense> GetRecentExpenses(int limit)
        {
            return _expenseRepo.GetRecent(limit > 0 ? limit : 50);
        }

        public long GetTodayTotal(string businessDate)
        {
            if (string.IsNullOrEmpty(businessDate))
            {
                businessDate = _dailyClosingService != null
                    ? _dailyClosingService.GetCurrentBusinessDate()
                    : DateTime.Now.ToString("yyyy-MM-dd");
            }
            return _expenseRepo.GetTotalByBusinessDate(businessDate);
        }

        public List<ExpenseCategory> GetCategories()
        {
            return _expenseRepo.GetCategories();
        }

        public ExpenseCategory CreateCategory(CreateExpenseCategoryRequest request)
        {
            if (request == null || string.IsNullOrWhiteSpace(request.Name))
            {
                throw new ArgumentException("اسم بند المصروف مطلوب");
            }
            return _expenseRepo.InsertCategory(request.Name, request.Description);
        }

        public ExpenseBreakdownReport GetExpensesBreakdown(string fromDate = null, string toDate = null)
        {
            var report = new ExpenseBreakdownReport();
            string bDate = _dailyClosingService != null ? _dailyClosingService.GetCurrentBusinessDate() : DateTime.Now.ToString("yyyy-MM-dd");
            if (string.IsNullOrEmpty(fromDate)) fromDate = bDate;
            if (string.IsNullOrEmpty(toDate)) toDate = bDate;

            var allExpenses = _expenseRepo.GetByBusinessDate(bDate);
            var categoryMap = new Dictionary<string, ExpenseBreakdownItem>(StringComparer.OrdinalIgnoreCase);

            for (int i = 0; i < allExpenses.Count; i++)
            {
                var exp = allExpenses[i];
                if (exp.IsCancelled) continue;

                report.TotalExpensesPiasters += exp.AmountPiasters;
                bool isDrawer = string.Equals(exp.Source, "drawer", StringComparison.OrdinalIgnoreCase) || string.IsNullOrEmpty(exp.Source);
                if (isDrawer)
                {
                    report.TotalDrawerExpensesPiasters += exp.AmountPiasters;
                }
                else
                {
                    report.TotalSafeExpensesPiasters += exp.AmountPiasters;
                }

                string catName = string.IsNullOrEmpty(exp.Category) ? "عام" : exp.Category.Trim();
                ExpenseBreakdownItem item;
                if (!categoryMap.TryGetValue(catName, out item))
                {
                    item = new ExpenseBreakdownItem
                    {
                        Category = catName,
                        Count = 0,
                        TotalPiasters = 0,
                        DrawerPiasters = 0,
                        SafePiasters = 0,
                        Percentage = 0
                    };
                    categoryMap[catName] = item;
                }

                item.Count++;
                item.TotalPiasters += exp.AmountPiasters;
                if (isDrawer) item.DrawerPiasters += exp.AmountPiasters;
                else item.SafePiasters += exp.AmountPiasters;
            }

            foreach (var kvp in categoryMap)
            {
                if (report.TotalExpensesPiasters > 0)
                {
                    kvp.Value.Percentage = Math.Round((double)kvp.Value.TotalPiasters * 100.0 / report.TotalExpensesPiasters, 2);
                }
                report.Categories.Add(kvp.Value);
            }

            return report;
        }
    }
}
