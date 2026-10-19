using System;
using System.Collections.Generic;
using Newtonsoft.Json;

namespace RafiqPOS.Models
{
    public class Expense
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("expenseNumber")]
        public long ExpenseNumber { get; set; }

        [JsonProperty("amountPiasters")]
        public long AmountPiasters { get; set; }

        [JsonProperty("amountFormatted")]
        public string AmountFormatted
        {
            get { return Common.Money.FormatPiasters(this.AmountPiasters); }
        }

        [JsonProperty("category")]
        public string Category { get; set; }

        [JsonProperty("notes")]
        public string Notes { get; set; }

        [JsonProperty("source")]
        public string Source { get; set; } // "drawer" (درج الكاشير) or "safe" (الخزينة الرئيسية)

        [JsonProperty("createdBy")]
        public string CreatedBy { get; set; }

        [JsonProperty("businessDate")]
        public string BusinessDate { get; set; }

        [JsonProperty("shiftId")]
        public string ShiftId { get; set; }

        [JsonProperty("isCancelled")]
        public bool IsCancelled { get; set; }

        [JsonProperty("cancelledAt")]
        public string CancelledAt { get; set; }

        [JsonProperty("cancelledBy")]
        public string CancelledBy { get; set; }

        [JsonProperty("cancelReason")]
        public string CancelReason { get; set; }

        [JsonProperty("updatedAt")]
        public string UpdatedAt { get; set; }

        [JsonProperty("createdAt")]
        public string CreatedAt { get; set; }
    }

    public class CreateExpenseRequest
    {
        [JsonProperty("amountPiasters")]
        public long AmountPiasters { get; set; }

        [JsonProperty("category")]
        public string Category { get; set; }

        [JsonProperty("notes")]
        public string Notes { get; set; }

        [JsonProperty("source")]
        public string Source { get; set; } // "drawer" or "safe"

        [JsonProperty("createdBy")]
        public string CreatedBy { get; set; }

        [JsonProperty("businessDate")]
        public string BusinessDate { get; set; }

        [JsonProperty("shiftId")]
        public string ShiftId { get; set; }
    }

    public class UpdateExpenseRequest
    {
        [JsonProperty("expenseId")]
        public string ExpenseId { get; set; }

        [JsonProperty("amountPiasters")]
        public long AmountPiasters { get; set; }

        [JsonProperty("category")]
        public string Category { get; set; }

        [JsonProperty("notes")]
        public string Notes { get; set; }

        [JsonProperty("source")]
        public string Source { get; set; }

        [JsonProperty("updatedBy")]
        public string UpdatedBy { get; set; }

        [JsonProperty("reason")]
        public string Reason { get; set; }

        [JsonProperty("managerPin")]
        public string ManagerPin { get; set; }
    }

    public class CancelExpenseRequest
    {
        [JsonProperty("expenseId")]
        public string ExpenseId { get; set; }

        [JsonProperty("cancelledBy")]
        public string CancelledBy { get; set; }

        [JsonProperty("reason")]
        public string Reason { get; set; }

        [JsonProperty("managerPin")]
        public string ManagerPin { get; set; }
    }

    public class ExpenseCategory
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("name")]
        public string Name { get; set; }

        [JsonProperty("description")]
        public string Description { get; set; }

        [JsonProperty("isPredefined")]
        public bool IsPredefined { get; set; }

        [JsonProperty("createdAt")]
        public string CreatedAt { get; set; }
    }

    public class CreateExpenseCategoryRequest
    {
        [JsonProperty("name")]
        public string Name { get; set; }

        [JsonProperty("description")]
        public string Description { get; set; }
    }

    public class ExpenseBreakdownItem
    {
        [JsonProperty("category")]
        public string Category { get; set; }

        [JsonProperty("count")]
        public int Count { get; set; }

        [JsonProperty("totalPiasters")]
        public long TotalPiasters { get; set; }

        [JsonProperty("drawerPiasters")]
        public long DrawerPiasters { get; set; }

        [JsonProperty("safePiasters")]
        public long SafePiasters { get; set; }

        [JsonProperty("percentage")]
        public double Percentage { get; set; }
    }

    public class ExpenseBreakdownReport
    {
        [JsonProperty("totalExpensesPiasters")]
        public long TotalExpensesPiasters { get; set; }

        [JsonProperty("totalDrawerExpensesPiasters")]
        public long TotalDrawerExpensesPiasters { get; set; }

        [JsonProperty("totalSafeExpensesPiasters")]
        public long TotalSafeExpensesPiasters { get; set; }

        [JsonProperty("categories")]
        public List<ExpenseBreakdownItem> Categories { get; set; }

        public ExpenseBreakdownReport()
        {
            this.Categories = new List<ExpenseBreakdownItem>();
        }
    }
}
