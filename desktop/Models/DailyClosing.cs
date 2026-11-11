using System;
using System.Collections.Generic;
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

        // Shifts of this business date still open; the day cannot be sealed until they are closed
        [JsonProperty("openShiftsCount")]
        public int OpenShiftsCount { get; set; }

        [JsonProperty("openShifts")]
        public List<Shift> OpenShifts { get; set; }

        [JsonProperty("postClosingSalesPiasters")]
        public long PostClosingSalesPiasters { get; set; }

        [JsonProperty("purchasesDrawerCashPiasters")]
        public long PurchasesDrawerCashPiasters { get; set; }

        [JsonProperty("supplierPaymentsDrawerCashPiasters")]
        public long SupplierPaymentsDrawerCashPiasters { get; set; }

        [JsonProperty("openingFloatPiasters")]
        public long OpeningFloatPiasters { get; set; }

        [JsonProperty("manualCashInPiasters")]
        public long ManualCashInPiasters { get; set; }

        [JsonProperty("manualCashOutPiasters")]
        public long ManualCashOutPiasters { get; set; }

        [JsonProperty("isDateSuspicious")]
        public bool IsDateSuspicious { get; set; }

        [JsonProperty("dateSuspiciousReason")]
        public string DateSuspiciousReason { get; set; }

        [JsonProperty("epayTerminalsSummary")]
        public List<DailyClosingEpayTerminalSummary> EpayTerminalsSummary { get; set; }

        [JsonProperty("epayTransactions")]
        public List<DailyClosingEpayTransactionItem> EpayTransactions { get; set; }

        [JsonProperty("walletsSummary")]
        public List<DailyClosingWalletSummary> WalletsSummary { get; set; }

        [JsonProperty("walletTransactions")]
        public List<DailyClosingWalletTransactionItem> WalletTransactions { get; set; }
    }

    public class DailyClosingEpayTerminalSummary
    {
        [JsonProperty("terminalId")]
        public string TerminalId { get; set; }

        [JsonProperty("terminalName")]
        public string TerminalName { get; set; }

        [JsonProperty("provider")]
        public string Provider { get; set; }

        [JsonProperty("currentBalancePiasters")]
        public long CurrentBalancePiasters { get; set; }

        [JsonProperty("transactionsCount")]
        public int TransactionsCount { get; set; }

        [JsonProperty("tillCashPiasters")]
        public long TillCashPiasters { get; set; }

        [JsonProperty("drawerCashPiasters")]
        public long DrawerCashPiasters { get; set; }

        [JsonProperty("netProfitPiasters")]
        public long NetProfitPiasters { get; set; }
    }

    public class DailyClosingEpayTransactionItem
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("terminalId")]
        public string TerminalId { get; set; }

        [JsonProperty("terminalName")]
        public string TerminalName { get; set; }

        [JsonProperty("serviceType")]
        public string ServiceType { get; set; }

        [JsonProperty("serviceName")]
        public string ServiceName { get; set; }

        [JsonProperty("billAmountPiasters")]
        public long BillAmountPiasters { get; set; }

        [JsonProperty("customerFeePiasters")]
        public long CustomerFeePiasters { get; set; }

        [JsonProperty("totalReceivedPiasters")]
        public long TotalReceivedPiasters { get; set; }

        [JsonProperty("netProfitPiasters")]
        public long NetProfitPiasters { get; set; }

        [JsonProperty("paymentChannel")]
        public string PaymentChannel { get; set; }

        [JsonProperty("cashierName")]
        public string CashierName { get; set; }

        [JsonProperty("referenceNumber")]
        public string ReferenceNumber { get; set; }

        [JsonProperty("createdAt")]
        public string CreatedAt { get; set; }
    }

    public class DailyClosingWalletSummary
    {
        [JsonProperty("accountId")]
        public string AccountId { get; set; }

        [JsonProperty("accountName")]
        public string AccountName { get; set; }

        [JsonProperty("accountType")]
        public string AccountType { get; set; }

        [JsonProperty("provider")]
        public string Provider { get; set; }

        [JsonProperty("currentBalancePiasters")]
        public long CurrentBalancePiasters { get; set; }

        [JsonProperty("transactionsCount")]
        public int TransactionsCount { get; set; }

        [JsonProperty("totalInPiasters")]
        public long TotalInPiasters { get; set; }

        [JsonProperty("totalOutPiasters")]
        public long TotalOutPiasters { get; set; }

        [JsonProperty("drawerCashImpactPiasters")]
        public long DrawerCashImpactPiasters { get; set; }

        [JsonProperty("netProfitPiasters")]
        public long NetProfitPiasters { get; set; }
    }

    public class DailyClosingWalletTransactionItem
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("accountId")]
        public string AccountId { get; set; }

        [JsonProperty("accountName")]
        public string AccountName { get; set; }

        [JsonProperty("accountType")]
        public string AccountType { get; set; }

        [JsonProperty("txType")]
        public string TxType { get; set; }

        [JsonProperty("amountPiasters")]
        public long AmountPiasters { get; set; }

        [JsonProperty("profitPiasters")]
        public long ProfitPiasters { get; set; }

        [JsonProperty("totalCollectedPiasters")]
        public long TotalCollectedPiasters { get; set; }

        [JsonProperty("customerPhone")]
        public string CustomerPhone { get; set; }

        [JsonProperty("customerName")]
        public string CustomerName { get; set; }

        [JsonProperty("paymentDestination")]
        public string PaymentDestination { get; set; }

        [JsonProperty("cashierName")]
        public string CashierName { get; set; }

        [JsonProperty("notes")]
        public string Notes { get; set; }

        [JsonProperty("createdAt")]
        public string CreatedAt { get; set; }
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

        [JsonProperty("openingFloatPiasters")]
        public long OpeningFloatPiasters { get; set; }

        [JsonProperty("manualCashInPiasters")]
        public long ManualCashInPiasters { get; set; }

        [JsonProperty("manualCashOutPiasters")]
        public long ManualCashOutPiasters { get; set; }
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

        [JsonProperty("autoClosePendingShifts")]
        public bool AutoClosePendingShifts { get; set; }
    }

    public class AutoCloseShiftsResult
    {
        [JsonProperty("closedCount")]
        public int ClosedCount { get; set; }

        [JsonProperty("totalExpectedCashPiasters")]
        public long TotalExpectedCashPiasters { get; set; }

        [JsonProperty("closedShiftNumbers")]
        public List<int> ClosedShiftNumbers { get; set; }

        [JsonProperty("message")]
        public string Message { get; set; }
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
