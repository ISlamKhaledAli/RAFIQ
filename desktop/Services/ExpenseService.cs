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

            string businessDate = string.IsNullOrEmpty(request.BusinessDate)
                ? (_dailyClosingService != null ? _dailyClosingService.GetCurrentBusinessDate() : DateTime.Now.ToString("yyyy-MM-dd"))
                : request.BusinessDate;

            var expense = new Expense
            {
                Id = "exp_" + Guid.NewGuid().ToString("N"),
                AmountPiasters = request.AmountPiasters,
                Category = string.IsNullOrEmpty(request.Category) ? "عام" : request.Category.Trim(),
                Notes = string.IsNullOrEmpty(request.Notes) ? null : request.Notes.Trim(),
                CreatedBy = string.IsNullOrEmpty(request.CreatedBy) ? "الكاشير" : request.CreatedBy.Trim(),
                BusinessDate = businessDate,
                CreatedAt = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss")
            };

            return _expenseRepo.Insert(expense);
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
    }
}
