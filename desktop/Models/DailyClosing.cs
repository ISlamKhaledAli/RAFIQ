using System;
using Newtonsoft.Json;

namespace RafiqPOS.Models
{
    public class DailyClosing
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("closingNumber")]
        public long ClosingNumber { get; set; }

        [JsonProperty("businessDate")]
        public string BusinessDate { get; set; }

        [JsonProperty("closedAt")]
        public string ClosedAt { get; set; }

        [JsonProperty("cashierId")]
        public string CashierId { get; set; }

        [JsonProperty("cashierName")]
        public string CashierName { get; set; }

        [JsonProperty("totalSalesPiasters")]
        public long TotalSalesPiasters { get; set; }

        [JsonProperty("cashSalesPiasters")]
        public long CashSalesPiasters { get; set; }

        [JsonProperty("creditSalesPiasters")]
        public long CreditSalesPiasters { get; set; }

        [JsonProperty("returnsTotalPiasters")]
        public long ReturnsTotalPiasters { get; set; }

        [JsonProperty("returnsCashPiasters")]
        public long ReturnsCashPiasters { get; set; }

        [JsonProperty("cancelledTotalPiasters")]
        public long CancelledTotalPiasters { get; set; }

        [JsonProperty("debtPaymentsPiasters")]
        public long DebtPaymentsPiasters { get; set; }

        [JsonProperty("expectedCashPiasters")]
        public long ExpectedCashPiasters { get; set; }

        [JsonProperty("actualCashPiasters")]
        public long ActualCashPiasters { get; set; }

        [JsonProperty("differencePiasters")]
        public long DifferencePiasters { get; set; }

        [JsonProperty("grossProfitPiasters")]
        public long GrossProfitPiasters { get; set; }

        [JsonProperty("invoicesCount")]
        public int InvoicesCount { get; set; }

        [JsonProperty("returnsCount")]
        public int ReturnsCount { get; set; }

        [JsonProperty("cancelledCount")]
        public int CancelledCount { get; set; }

        [JsonProperty("notes")]
        public string Notes { get; set; }

        [JsonProperty("summaryJson")]
        public string SummaryJson { get; set; }

        [JsonProperty("isSealed")]
        public bool IsSealed { get; set; }

        [JsonProperty("totalSalesFormatted")]
        public string TotalSalesFormatted
        {
            get { return (TotalSalesPiasters / 100.0).ToString("N2"); }
        }

        [JsonProperty("cashSalesFormatted")]
        public string CashSalesFormatted
        {
            get { return (CashSalesPiasters / 100.0).ToString("N2"); }
        }

        [JsonProperty("creditSalesFormatted")]
        public string CreditSalesFormatted
        {
            get { return (CreditSalesPiasters / 100.0).ToString("N2"); }
        }

        [JsonProperty("expectedCashFormatted")]
        public string ExpectedCashFormatted
        {
            get { return (ExpectedCashPiasters / 100.0).ToString("N2"); }
        }

        [JsonProperty("actualCashFormatted")]
        public string ActualCashFormatted
        {
            get { return (ActualCashPiasters / 100.0).ToString("N2"); }
        }

        [JsonProperty("differenceFormatted")]
        public string DifferenceFormatted
        {
            get { return (DifferencePiasters / 100.0).ToString("N2"); }
        }
    }

    public class DailyClosingPreview
    {
        [JsonProperty("businessDate")]
        public string BusinessDate { get; set; }

        [JsonProperty("currentUtc")]
        public string CurrentUtc { get; set; }

        [JsonProperty("totalSalesPiasters")]
        public long TotalSalesPiasters { get; set; }

        [JsonProperty("cashSalesPiasters")]
        public long CashSalesPiasters { get; set; }

        [JsonProperty("creditSalesPiasters")]
        public long CreditSalesPiasters { get; set; }

        [JsonProperty("returnsTotalPiasters")]
        public long ReturnsTotalPiasters { get; set; }

        [JsonProperty("returnsCashPiasters")]
        public long ReturnsCashPiasters { get; set; }

        [JsonProperty("cancelledTotalPiasters")]
        public long CancelledTotalPiasters { get; set; }

        [JsonProperty("debtPaymentsPiasters")]
        public long DebtPaymentsPiasters { get; set; }

        [JsonProperty("expectedCashPiasters")]
        public long ExpectedCashPiasters { get; set; }

        [JsonProperty("grossProfitPiasters")]
        public long GrossProfitPiasters { get; set; }

        [JsonProperty("zeroCostItemsCount")]
        public int ZeroCostItemsCount { get; set; }

        [JsonProperty("invoicesCount")]
        public int InvoicesCount { get; set; }

        [JsonProperty("returnsCount")]
        public int ReturnsCount { get; set; }

        [JsonProperty("cancelledCount")]
        public int CancelledCount { get; set; }

        [JsonProperty("isAlreadyClosed")]
        public bool IsAlreadyClosed { get; set; }

        [JsonProperty("existingClosing")]
        public DailyClosing ExistingClosing { get; set; }

        [JsonProperty("isDateSuspicious")]
        public bool IsDateSuspicious { get; set; }

        [JsonProperty("dateSuspiciousReason")]
        public string DateSuspiciousReason { get; set; }
    }

    public class DailyClosingSaveRequest
    {
        [JsonProperty("businessDate")]
        public string BusinessDate { get; set; }

        [JsonProperty("actualCashPiasters")]
        public long ActualCashPiasters { get; set; }

        [JsonProperty("cashierId")]
        public string CashierId { get; set; }

        [JsonProperty("cashierName")]
        public string CashierName { get; set; }

        [JsonProperty("notes")]
        public string Notes { get; set; }

        [JsonProperty("confirmSuspiciousDate")]
        public bool ConfirmSuspiciousDate { get; set; }
    }

    public class UnclosedDayAlert
    {
        [JsonProperty("hasUnclosedDay")]
        public bool HasUnclosedDay { get; set; }

        [JsonProperty("unclosedDate")]
        public string UnclosedDate { get; set; }

        [JsonProperty("unclosedSalesCount")]
        public int UnclosedSalesCount { get; set; }

        [JsonProperty("unclosedSalesTotalPiasters")]
        public long UnclosedSalesTotalPiasters { get; set; }
    }
}
