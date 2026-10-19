using System;
using System.Collections.Generic;

namespace RafiqPOS.Models
{
    public class Shift
    {
        public string Id { get; set; }
        public int ShiftNumber { get; set; }
        public string CashierId { get; set; }
        public string CashierName { get; set; }
        public string PosRegisterId { get; set; }
        public string BusinessDate { get; set; }
        public string OpenedAt { get; set; }
        public string ClosedAt { get; set; }
        public string Status { get; set; } // "open", "closed"
        public long OpeningFloatPiasters { get; set; }
        public long CashSalesPiasters { get; set; }
        public long CardSalesPiasters { get; set; }
        public long InstapaySalesPiasters { get; set; }
        public long VodafoneCashSalesPiasters { get; set; }
        public long CreditSalesPiasters { get; set; }
        public long ReturnsCashPiasters { get; set; }
        public long DebtPaymentsCashPiasters { get; set; }
        public long ExpensesCashPiasters { get; set; }
        public long CashInPiasters { get; set; }
        public long CashOutPiasters { get; set; }
        public long EpayCashPiasters { get; set; }
        public long WalletsCashPiasters { get; set; }
        public long PurchasesCashPiasters { get; set; }
        public long SupplierPaymentsCashPiasters { get; set; }
        public long ExpectedCashPiasters { get; set; }
        public long ActualCashPiasters { get; set; }
        public long DifferencePiasters { get; set; }
        public int InvoicesCount { get; set; }
        public string Notes { get; set; }
        public string CreatedAt { get; set; }
        public string UpdatedAt { get; set; }
        public bool IsDanglingFromPreviousDay { get; set; }

        public Shift()
        {
            Status = "open";
            PosRegisterId = "default_pos";
        }
    }

    public class CashDrawerTransaction
    {
        public string Id { get; set; }
        public string ShiftId { get; set; }
        public string Type { get; set; } // "cash_in", "cash_out"
        public long AmountPiasters { get; set; }
        public string Reason { get; set; }
        public string PerformedById { get; set; }
        public string PerformedByName { get; set; }
        public string CreatedAt { get; set; }
    }

    public class OpenShiftRequest
    {
        public string CashierId { get; set; }
        public string CashierName { get; set; }
        public string PosRegisterId { get; set; }
        public long OpeningFloatPiasters { get; set; }
        public string Notes { get; set; }
    }

    public class CloseShiftRequest
    {
        public string ShiftId { get; set; }
        public string CashierId { get; set; }
        public string CashierName { get; set; }
        public long ActualCashPiasters { get; set; }
        public string Notes { get; set; }
    }

    public class CashMovementRequest
    {
        public string ShiftId { get; set; }
        public string Type { get; set; } // "cash_in", "cash_out"
        public long AmountPiasters { get; set; }
        public string Reason { get; set; }
        public string PerformedById { get; set; }
        public string PerformedByName { get; set; }
    }

    public class ShiftSummary
    {
        public Shift Shift { get; set; }
        public long OpeningFloatPiasters { get; set; }
        public long CashSalesPiasters { get; set; }
        public long CardSalesPiasters { get; set; }
        public long InstapaySalesPiasters { get; set; }
        public long VodafoneCashSalesPiasters { get; set; }
        public long CreditSalesPiasters { get; set; }
        public long ReturnsCashPiasters { get; set; }
        public long DebtPaymentsCashPiasters { get; set; }
        public long ExpensesCashPiasters { get; set; }
        public long CashInPiasters { get; set; }
        public long CashOutPiasters { get; set; }
        public long EpayCashPiasters { get; set; }
        public long WalletsCashPiasters { get; set; }
        public long PurchasesCashPiasters { get; set; }
        public long SupplierPaymentsCashPiasters { get; set; }
        public long ExpectedCashPiasters { get; set; }
        public long AvailableCashInDrawerPiasters { get; set; }
        public int InvoicesCount { get; set; }
        public List<CashDrawerTransaction> RecentMovements { get; set; }

        public ShiftSummary()
        {
            RecentMovements = new List<CashDrawerTransaction>();
        }
    }
}
