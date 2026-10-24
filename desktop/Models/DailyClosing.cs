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

        [JsonProperty("cardSalesPiasters")]
        public long CardSalesPiasters { get; set; }

        [JsonProperty("instapaySalesPiasters")]
        public long InstapaySalesPiasters { get; set; }

        [JsonProperty("vodafoneCashSalesPiasters")]
        public long VodafoneCashSalesPiasters { get; set; }

        [JsonProperty("creditSalesPiasters")]
        public long CreditSalesPiasters { get; set; }

        [JsonProperty("insuranceSalesPiasters")]
        public long InsuranceSalesPiasters { get; set; }

        [JsonProperty("epayTerminalsBalancePiasters")]
        public long EpayTerminalsBalancePiasters { get; set; }

        [JsonProperty("epayTillCashPiasters")]
        public long EpayTillCashPiasters { get; set; }

        [JsonProperty("epayDrawerCashPiasters")]
        public long EpayDrawerCashPiasters { get; set; }

        [JsonProperty("epayDrawerFundingPiasters")]
        public long EpayDrawerFundingPiasters { get; set; }

        [JsonProperty("epayNetProfitPiasters")]
        public long EpayNetProfitPiasters { get; set; }

        [JsonProperty("expensesPiasters")]
        public long ExpensesPiasters { get; set; }

        [JsonProperty("drawerExpensesPiasters")]
        public long DrawerExpensesPiasters { get; set; }

        [JsonProperty("safeExpensesPiasters")]
        public long SafeExpensesPiasters { get; set; }

        [JsonProperty("expensesCount")]
        public int ExpensesCount { get; set; }

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

        [JsonProperty("cardSalesFormatted")]
        public string CardSalesFormatted
        {
            get { return (CardSalesPiasters / 100.0).ToString("N2"); }
        }

        [JsonProperty("instapaySalesFormatted")]
        public string InstapaySalesFormatted
        {
            get { return (InstapaySalesPiasters / 100.0).ToString("N2"); }
        }

        [JsonProperty("vodafoneCashSalesFormatted")]
        public string VodafoneCashSalesFormatted
        {
            get { return (VodafoneCashSalesPiasters / 100.0).ToString("N2"); }
        }

        [JsonProperty("expensesFormatted")]
        public string ExpensesFormatted
        {
            get { return (ExpensesPiasters / 100.0).ToString("N2"); }
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

        [JsonProperty("cardSalesPiasters")]
        public long CardSalesPiasters { get; set; }

        [JsonProperty("instapaySalesPiasters")]
        public long InstapaySalesPiasters { get; set; }

        [JsonProperty("vodafoneCashSalesPiasters")]
        public long VodafoneCashSalesPiasters { get; set; }

        [JsonProperty("creditSalesPiasters")]
        public long CreditSalesPiasters { get; set; }

        [JsonProperty("insuranceSalesPiasters")]
        public long InsuranceSalesPiasters { get; set; }

        [JsonProperty("epayTerminalsBalancePiasters")]
        public long EpayTerminalsBalancePiasters { get; set; }

        [JsonProperty("epayTillCashPiasters")]
        public long EpayTillCashPiasters { get; set; }

        [JsonProperty("epayDrawerCashPiasters")]
        public long EpayDrawerCashPiasters { get; set; }

        [JsonProperty("epayDrawerFundingPiasters")]
        public long EpayDrawerFundingPiasters { get; set; }

        [JsonProperty("epayNetProfitPiasters")]
        public long EpayNetProfitPiasters { get; set; }

        [JsonProperty("walletsBalancePiasters")]
        public long WalletsBalancePiasters { get; set; }

        [JsonProperty("walletsDrawerCashPiasters")]
        public long WalletsDrawerCashPiasters { get; set; }

        [JsonProperty("walletsDrawerFundingPiasters")]
        public long WalletsDrawerFundingPiasters { get; set; }

        [JsonProperty("walletsNetProfitPiasters")]
        public long WalletsNetProfitPiasters { get; set; }

        [JsonProperty("expensesPiasters")]
        public long ExpensesPiasters { get; set; }

        [JsonProperty("drawerExpensesPiasters")]
        public long DrawerExpensesPiasters { get; set; }

        [JsonProperty("safeExpensesPiasters")]
        public long SafeExpensesPiasters { get; set; }

        [JsonProperty("expensesCount")]
        public int ExpensesCount { get; set; }

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

        [JsonProperty("postClosingSalesCount")]
        public int PostClosingSalesCount { get; set; }

        [JsonProperty("postClosingSalesPiasters")]
        public long PostClosingSalesPiasters { get; set; }

        [JsonProperty("purchasesDrawerCashPiasters")]
        public long PurchasesDrawerCashPiasters { get; set; }

        [JsonProperty("supplierPaymentsDrawerCashPiasters")]
        public long SupplierPaymentsDrawerCashPiasters { get; set; }

        [JsonProperty("isDateSuspicious")]
        public bool IsDateSuspicious { get; set; }

        [JsonProperty("dateSuspiciousReason")]
        public string DateSuspiciousReason { get; set; }
    }

    public class LiveDrawerBalanceResult
    {
        [JsonProperty("businessDate")]
        public string BusinessDate { get; set; }

        [JsonProperty("availableCashPiasters")]
        public long AvailableCashPiasters { get; set; }

        [JsonProperty("cashSalesPiasters")]
        public long CashSalesPiasters { get; set; }

        [JsonProperty("returnsCashPiasters")]
        public long ReturnsCashPiasters { get; set; }

        [JsonProperty("debtPaymentsPiasters")]
        public long DebtPaymentsPiasters { get; set; }

        [JsonProperty("expensesPiasters")]
        public long ExpensesPiasters { get; set; }

        [JsonProperty("epayDrawerCashPiasters")]
        public long EpayDrawerCashPiasters { get; set; }

        [JsonProperty("epayDrawerFundingPiasters")]
        public long EpayDrawerFundingPiasters { get; set; }

        [JsonProperty("walletsDrawerCashPiasters")]
        public long WalletsDrawerCashPiasters { get; set; }

        [JsonProperty("walletsDrawerFundingPiasters")]
        public long WalletsDrawerFundingPiasters { get; set; }

        [JsonProperty("purchasesDrawerCashPiasters")]
        public long PurchasesDrawerCashPiasters { get; set; }

        [JsonProperty("supplierPaymentsDrawerCashPiasters")]
        public long SupplierPaymentsDrawerCashPiasters { get; set; }
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
