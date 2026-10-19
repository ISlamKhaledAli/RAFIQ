using System;
using System.Collections.Generic;
using Newtonsoft.Json;

namespace RafiqPOS.Models
{
    public class Shift
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("shiftNumber")]
        public int ShiftNumber { get; set; }

        [JsonProperty("cashierId")]
        public string CashierId { get; set; }

        [JsonProperty("cashierName")]
        public string CashierName { get; set; }

        [JsonProperty("posRegisterId")]
        public string PosRegisterId { get; set; }

        [JsonProperty("businessDate")]
        public string BusinessDate { get; set; }

        [JsonProperty("openedAt")]
        public string OpenedAt { get; set; }

        [JsonProperty("closedAt")]
        public string ClosedAt { get; set; }

        [JsonProperty("status")]
        public string Status { get; set; } // "open", "closed"

        [JsonProperty("openingFloatPiasters")]
        public long OpeningFloatPiasters { get; set; }

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

        [JsonProperty("returnsCashPiasters")]
        public long ReturnsCashPiasters { get; set; }

        [JsonProperty("debtPaymentsCashPiasters")]
        public long DebtPaymentsCashPiasters { get; set; }

        [JsonProperty("expensesCashPiasters")]
        public long ExpensesCashPiasters { get; set; }

        [JsonProperty("cashInPiasters")]
        public long CashInPiasters { get; set; }

        [JsonProperty("cashOutPiasters")]
        public long CashOutPiasters { get; set; }

        [JsonProperty("epayCashPiasters")]
        public long EpayCashPiasters { get; set; }

        [JsonProperty("walletsCashPiasters")]
        public long WalletsCashPiasters { get; set; }

        [JsonProperty("purchasesCashPiasters")]
        public long PurchasesCashPiasters { get; set; }

        [JsonProperty("supplierPaymentsCashPiasters")]
        public long SupplierPaymentsCashPiasters { get; set; }

        [JsonProperty("expectedCashPiasters")]
        public long ExpectedCashPiasters { get; set; }

        [JsonProperty("actualCashPiasters")]
        public long ActualCashPiasters { get; set; }

        [JsonProperty("differencePiasters")]
        public long DifferencePiasters { get; set; }

        [JsonProperty("invoicesCount")]
        public int InvoicesCount { get; set; }

        [JsonProperty("notes")]
        public string Notes { get; set; }

        [JsonProperty("createdAt")]
        public string CreatedAt { get; set; }

        [JsonProperty("updatedAt")]
        public string UpdatedAt { get; set; }

        [JsonProperty("isDanglingFromPreviousDay")]
        public bool IsDanglingFromPreviousDay { get; set; }

        public Shift()
        {
            Status = "open";
            PosRegisterId = "default_pos";
        }
    }

    public class CashDrawerTransaction
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("shiftId")]
        public string ShiftId { get; set; }

        [JsonProperty("type")]
        public string Type { get; set; } // "cash_in", "cash_out"

        [JsonProperty("amountPiasters")]
        public long AmountPiasters { get; set; }

        [JsonProperty("reason")]
        public string Reason { get; set; }

        [JsonProperty("performedById")]
        public string PerformedById { get; set; }

        [JsonProperty("performedByName")]
        public string PerformedByName { get; set; }

        [JsonProperty("createdAt")]
        public string CreatedAt { get; set; }
    }

    public class OpenShiftRequest
    {
        [JsonProperty("cashierId")]
        public string CashierId { get; set; }

        [JsonProperty("cashierName")]
        public string CashierName { get; set; }

        [JsonProperty("posRegisterId")]
        public string PosRegisterId { get; set; }

        [JsonProperty("openingFloatPiasters")]
        public long OpeningFloatPiasters { get; set; }

        [JsonProperty("notes")]
        public string Notes { get; set; }
    }

    public class CloseShiftRequest
    {
        [JsonProperty("shiftId")]
        public string ShiftId { get; set; }

        [JsonProperty("cashierId")]
        public string CashierId { get; set; }

        [JsonProperty("cashierName")]
        public string CashierName { get; set; }

        [JsonProperty("actualCashPiasters")]
        public long ActualCashPiasters { get; set; }

        [JsonProperty("notes")]
        public string Notes { get; set; }
    }

    public class CashMovementRequest
    {
        [JsonProperty("shiftId")]
        public string ShiftId { get; set; }

        [JsonProperty("type")]
        public string Type { get; set; } // "cash_in", "cash_out"

        [JsonProperty("amountPiasters")]
        public long AmountPiasters { get; set; }

        [JsonProperty("reason")]
        public string Reason { get; set; }

        [JsonProperty("performedById")]
        public string PerformedById { get; set; }

        [JsonProperty("performedByName")]
        public string PerformedByName { get; set; }
    }

    public class ShiftSummary
    {
        [JsonProperty("shift")]
        public Shift Shift { get; set; }

        [JsonProperty("openingFloatPiasters")]
        public long OpeningFloatPiasters { get; set; }

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

        [JsonProperty("returnsCashPiasters")]
        public long ReturnsCashPiasters { get; set; }

        [JsonProperty("debtPaymentsCashPiasters")]
        public long DebtPaymentsCashPiasters { get; set; }

        [JsonProperty("expensesCashPiasters")]
        public long ExpensesCashPiasters { get; set; }

        [JsonProperty("cashInPiasters")]
        public long CashInPiasters { get; set; }

        [JsonProperty("cashOutPiasters")]
        public long CashOutPiasters { get; set; }

        [JsonProperty("epayCashPiasters")]
        public long EpayCashPiasters { get; set; }

        [JsonProperty("walletsCashPiasters")]
        public long WalletsCashPiasters { get; set; }

        [JsonProperty("purchasesCashPiasters")]
        public long PurchasesCashPiasters { get; set; }

        [JsonProperty("supplierPaymentsCashPiasters")]
        public long SupplierPaymentsCashPiasters { get; set; }

        [JsonProperty("expectedCashPiasters")]
        public long ExpectedCashPiasters { get; set; }

        [JsonProperty("availableCashInDrawerPiasters")]
        public long AvailableCashInDrawerPiasters { get; set; }

        [JsonProperty("invoicesCount")]
        public int InvoicesCount { get; set; }

        [JsonProperty("recentMovements")]
        public List<CashDrawerTransaction> RecentMovements { get; set; }

        public ShiftSummary()
        {
            RecentMovements = new List<CashDrawerTransaction>();
        }
    }
}
