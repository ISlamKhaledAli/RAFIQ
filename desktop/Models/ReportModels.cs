using System;
using System.Collections.Generic;
using Newtonsoft.Json;

namespace RafiqPOS.Models
{
    public class PeriodSalesReport
    {
        [JsonProperty("period")]
        public string Period { get; set; }

        [JsonProperty("startDate")]
        public string StartDate { get; set; }

        [JsonProperty("endDate")]
        public string EndDate { get; set; }

        [JsonProperty("totalSalesPiasters")]
        public long TotalSalesPiasters { get; set; }

        [JsonProperty("cashSalesPiasters")]
        public long CashSalesPiasters { get; set; }

        [JsonProperty("creditSalesPiasters")]
        public long CreditSalesPiasters { get; set; }

        [JsonProperty("cardSalesPiasters")]
        public long CardSalesPiasters { get; set; }

        [JsonProperty("returnsTotalPiasters")]
        public long ReturnsTotalPiasters { get; set; }

        [JsonProperty("cancelledTotalPiasters")]
        public long CancelledTotalPiasters { get; set; }

        [JsonProperty("netSalesPiasters")]
        public long NetSalesPiasters { get; set; }

        [JsonProperty("grossProfitPiasters")]
        public long GrossProfitPiasters { get; set; }

        [JsonProperty("invoicesCount")]
        public int InvoicesCount { get; set; }

        [JsonProperty("returnsCount")]
        public int ReturnsCount { get; set; }

        [JsonProperty("cancelledCount")]
        public int CancelledCount { get; set; }

        [JsonProperty("zeroCostItemsCount")]
        public int ZeroCostItemsCount { get; set; }

        [JsonProperty("topSellingProducts")]
        public List<TopSellingItem> TopSellingProducts { get; set; }

        public PeriodSalesReport()
        {
            TopSellingProducts = new List<TopSellingItem>();
        }
    }

    public class LowStockReportItem
    {
        [JsonProperty("productId")]
        public string ProductId { get; set; }

        [JsonProperty("name")]
        public string Name { get; set; }

        [JsonProperty("barcode")]
        public string Barcode { get; set; }

        [JsonProperty("stockMilli")]
        public long StockMilli { get; set; }

        [JsonProperty("minStockMilli")]
        public long MinStockMilli { get; set; }

        [JsonProperty("suggestedOrderMilli")]
        public long SuggestedOrderMilli { get; set; }

        [JsonProperty("unitCostPiasters")]
        public long UnitCostPiasters { get; set; }

        [JsonProperty("estimatedCostPiasters")]
        public long EstimatedCostPiasters { get; set; }

        [JsonProperty("unit")]
        public string Unit { get; set; }

        [JsonProperty("categoryName")]
        public string CategoryName { get; set; }
    }

    public class DebtorReportItem
    {
        [JsonProperty("customerId")]
        public string CustomerId { get; set; }

        [JsonProperty("name")]
        public string Name { get; set; }

        [JsonProperty("phone")]
        public string Phone { get; set; }

        [JsonProperty("balancePiasters")]
        public long BalancePiasters { get; set; }

        [JsonProperty("creditLimitPiasters")]
        public long CreditLimitPiasters { get; set; }

        [JsonProperty("notes")]
        public string Notes { get; set; }

        [JsonProperty("lastTransactionDate")]
        public string LastTransactionDate { get; set; }
    }

    public class InventoryLossItem
    {
        [JsonProperty("productId")]
        public string ProductId { get; set; }

        [JsonProperty("productName")]
        public string ProductName { get; set; }

        [JsonProperty("unit")]
        public string Unit { get; set; }

        [JsonProperty("quantityDeltaMilli")]
        public long QuantityDeltaMilli { get; set; }

        [JsonProperty("unitCostPiasters")]
        public long UnitCostPiasters { get; set; }

        [JsonProperty("financialImpactPiasters")]
        public long FinancialImpactPiasters { get; set; }

        [JsonProperty("reason")]
        public string Reason { get; set; }

        [JsonProperty("createdAt")]
        public string CreatedAt { get; set; }
    }

    public class InventoryLossReport
    {
        [JsonProperty("totalLossPiasters")]
        public long TotalLossPiasters { get; set; }

        [JsonProperty("totalDamagePiasters")]
        public long TotalDamagePiasters { get; set; }

        [JsonProperty("totalGiftsPiasters")]
        public long TotalGiftsPiasters { get; set; }

        [JsonProperty("totalSurplusPiasters")]
        public long TotalSurplusPiasters { get; set; }

        [JsonProperty("topLossItems")]
        public List<InventoryLossItem> TopLossItems { get; set; }

        public InventoryLossReport()
        {
            TopLossItems = new List<InventoryLossItem>();
        }
    }

    public class ClosingHistoryRecord
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("closingDate")]
        public string ClosingDate { get; set; }

        [JsonProperty("shiftNumber")]
        public int ShiftNumber { get; set; }

        [JsonProperty("cashierName")]
        public string CashierName { get; set; }

        [JsonProperty("totalSalesPiasters")]
        public long TotalSalesPiasters { get; set; }

        [JsonProperty("cashSalesPiasters")]
        public long CashSalesPiasters { get; set; }

        [JsonProperty("creditSalesPiasters")]
        public long CreditSalesPiasters { get; set; }

        [JsonProperty("returnsPiasters")]
        public long ReturnsPiasters { get; set; }

        [JsonProperty("netSalesPiasters")]
        public long NetSalesPiasters { get; set; }

        [JsonProperty("grossProfitPiasters")]
        public long GrossProfitPiasters { get; set; }

        [JsonProperty("expectedCashPiasters")]
        public long ExpectedCashPiasters { get; set; }

        [JsonProperty("actualCashPiasters")]
        public long ActualCashPiasters { get; set; }

        [JsonProperty("differencePiasters")]
        public long DifferencePiasters { get; set; }

        [JsonProperty("isClosed")]
        public bool IsClosed { get; set; }

        [JsonProperty("createdAt")]
        public string CreatedAt { get; set; }

        [JsonProperty("notes")]
        public string Notes { get; set; }
    }

    public class CategoryPerformanceItem
    {
        [JsonProperty("categoryId")]
        public string CategoryId { get; set; }

        [JsonProperty("categoryName")]
        public string CategoryName { get; set; }

        [JsonProperty("totalSalesPiasters")]
        public long TotalSalesPiasters { get; set; }

        [JsonProperty("totalCostPiasters")]
        public long TotalCostPiasters { get; set; }

        [JsonProperty("grossProfitPiasters")]
        public long GrossProfitPiasters { get; set; }

        [JsonProperty("profitMarginPercent")]
        public double ProfitMarginPercent { get; set; }

        [JsonProperty("itemsSoldQty")]
        public int ItemsSoldQty { get; set; }

        [JsonProperty("salesSharePercent")]
        public double SalesSharePercent { get; set; }
    }

    public class ItemProfitabilityItem
    {
        [JsonProperty("productId")]
        public string ProductId { get; set; }

        [JsonProperty("productName")]
        public string ProductName { get; set; }

        [JsonProperty("barcode")]
        public string Barcode { get; set; }

        [JsonProperty("categoryName")]
        public string CategoryName { get; set; }

        [JsonProperty("unitCostPiasters")]
        public long UnitCostPiasters { get; set; }

        [JsonProperty("unitPricePiasters")]
        public long UnitPricePiasters { get; set; }

        [JsonProperty("quantitySoldMilli")]
        public long QuantitySoldMilli { get; set; }

        [JsonProperty("totalSalesPiasters")]
        public long TotalSalesPiasters { get; set; }

        [JsonProperty("totalCostPiasters")]
        public long TotalCostPiasters { get; set; }

        [JsonProperty("grossProfitPiasters")]
        public long GrossProfitPiasters { get; set; }

        [JsonProperty("marginPercent")]
        public double MarginPercent { get; set; }

        [JsonProperty("isNegativeMargin")]
        public bool IsNegativeMargin { get; set; }

        [JsonProperty("isZeroCost")]
        public bool IsZeroCost { get; set; }
    }

    public class PeriodMetricComparison
    {
        [JsonProperty("current")]
        public long Current { get; set; }

        [JsonProperty("previous")]
        public long Previous { get; set; }

        [JsonProperty("deltaPiasters")]
        public long DeltaPiasters { get; set; }

        [JsonProperty("percentChange")]
        public double PercentChange { get; set; }
    }

    public class InvoiceCountComparison
    {
        [JsonProperty("current")]
        public int Current { get; set; }

        [JsonProperty("previous")]
        public int Previous { get; set; }

        [JsonProperty("percentChange")]
        public double PercentChange { get; set; }
    }

    public class PeriodComparisonReport
    {
        [JsonProperty("currentPeriodName")]
        public string CurrentPeriodName { get; set; }

        [JsonProperty("previousPeriodName")]
        public string PreviousPeriodName { get; set; }

        [JsonProperty("sales")]
        public PeriodMetricComparison Sales { get; set; }

        [JsonProperty("profit")]
        public PeriodMetricComparison Profit { get; set; }

        [JsonProperty("invoiceCount")]
        public InvoiceCountComparison InvoiceCount { get; set; }

        [JsonProperty("avgInvoicePiasters")]
        public PeriodMetricComparison AvgInvoicePiasters { get; set; }

        public PeriodComparisonReport()
        {
            Sales = new PeriodMetricComparison();
            Profit = new PeriodMetricComparison();
            InvoiceCount = new InvoiceCountComparison();
            AvgInvoicePiasters = new PeriodMetricComparison();
        }
    }

    public class InventoryOverviewReport
    {
        [JsonProperty("totalProductsCount")]
        public int TotalProductsCount { get; set; }

        [JsonProperty("activeProductsCount")]
        public int ActiveProductsCount { get; set; }

        [JsonProperty("totalInventoryCostPiasters")]
        public long TotalInventoryCostPiasters { get; set; }

        [JsonProperty("totalInventoryRetailPiasters")]
        public long TotalInventoryRetailPiasters { get; set; }

        [JsonProperty("potentialGrossProfitPiasters")]
        public long PotentialGrossProfitPiasters { get; set; }

        [JsonProperty("outOfStockCount")]
        public int OutOfStockCount { get; set; }

        [JsonProperty("lowStockCount")]
        public int LowStockCount { get; set; }

        [JsonProperty("expiredBatchesCount")]
        public int ExpiredBatchesCount { get; set; }

        [JsonProperty("expiringSoonBatchesCount")]
        public int ExpiringSoonBatchesCount { get; set; }

        [JsonProperty("turnoverRate")]
        public double TurnoverRate { get; set; }
    }

    public class ShrinkageReasonBreakdown
    {
        [JsonProperty("reason")]
        public string Reason { get; set; }

        [JsonProperty("label")]
        public string Label { get; set; }

        [JsonProperty("count")]
        public int Count { get; set; }

        [JsonProperty("totalCostPiasters")]
        public long TotalCostPiasters { get; set; }

        [JsonProperty("percentOfTotal")]
        public double PercentOfTotal { get; set; }
    }

    public class ShrinkageAnalysisReport
    {
        [JsonProperty("totalShrinkagePiasters")]
        public long TotalShrinkagePiasters { get; set; }

        [JsonProperty("shrinkageToSalesPercent")]
        public double ShrinkageToSalesPercent { get; set; }

        [JsonProperty("reasons")]
        public List<ShrinkageReasonBreakdown> Reasons { get; set; }

        [JsonProperty("topShrinkageProducts")]
        public List<InventoryLossItem> TopShrinkageProducts { get; set; }

        public ShrinkageAnalysisReport()
        {
            Reasons = new List<ShrinkageReasonBreakdown>();
            TopShrinkageProducts = new List<InventoryLossItem>();
        }
    }

    public class SupplierPurchaseItem
    {
        [JsonProperty("supplierId")]
        public string SupplierId { get; set; }

        [JsonProperty("supplierName")]
        public string SupplierName { get; set; }

        [JsonProperty("invoicesCount")]
        public int InvoicesCount { get; set; }

        [JsonProperty("totalPurchasePiasters")]
        public long TotalPurchasePiasters { get; set; }

        [JsonProperty("paidPiasters")]
        public long PaidPiasters { get; set; }

        [JsonProperty("unpaidPiasters")]
        public long UnpaidPiasters { get; set; }
    }

    public class PurchaseAnalysisReport
    {
        [JsonProperty("totalPurchasesPiasters")]
        public long TotalPurchasesPiasters { get; set; }

        [JsonProperty("totalInvoicesCount")]
        public int TotalInvoicesCount { get; set; }

        [JsonProperty("totalPaidPiasters")]
        public long TotalPaidPiasters { get; set; }

        [JsonProperty("totalUnpaidPiasters")]
        public long TotalUnpaidPiasters { get; set; }

        [JsonProperty("topSuppliers")]
        public List<SupplierPurchaseItem> TopSuppliers { get; set; }

        [JsonProperty("totalSupplierDebtsPiasters")]
        public long TotalSupplierDebtsPiasters { get; set; }

        [JsonProperty("debtorSuppliersCount")]
        public int DebtorSuppliersCount { get; set; }

        [JsonProperty("totalSupplierCreditsPiasters")]
        public long TotalSupplierCreditsPiasters { get; set; }

        [JsonProperty("creditorSuppliersCount")]
        public int CreditorSuppliersCount { get; set; }

        [JsonProperty("netSupplierExposurePiasters")]
        public long NetSupplierExposurePiasters { get; set; }

        public PurchaseAnalysisReport()
        {
            TopSuppliers = new List<SupplierPurchaseItem>();
        }
    }

    public class CreditOverviewReport
    {
        [JsonProperty("totalOutstandingDebtsPiasters")]
        public long TotalOutstandingDebtsPiasters { get; set; }

        [JsonProperty("debtorsCount")]
        public int DebtorsCount { get; set; }

        [JsonProperty("totalCustomerCreditsPiasters")]
        public long TotalCustomerCreditsPiasters { get; set; }

        [JsonProperty("creditorsCount")]
        public int CreditorsCount { get; set; }

        [JsonProperty("netMarketExposurePiasters")]
        public long NetMarketExposurePiasters { get; set; }

        [JsonProperty("periodNewCreditPiasters")]
        public long PeriodNewCreditPiasters { get; set; }

        [JsonProperty("periodRepaymentsPiasters")]
        public long PeriodRepaymentsPiasters { get; set; }

        [JsonProperty("netCreditFlowPiasters")]
        public long NetCreditFlowPiasters { get; set; }

        [JsonProperty("averagePaybackDays")]
        public double AveragePaybackDays { get; set; }
    }

    public class DebtAgingTier
    {
        [JsonProperty("label")]
        public string Label { get; set; }

        [JsonProperty("daysRange")]
        public string DaysRange { get; set; }

        [JsonProperty("customerCount")]
        public int CustomerCount { get; set; }

        [JsonProperty("totalDebtPiasters")]
        public long TotalDebtPiasters { get; set; }

        [JsonProperty("percentOfTotal")]
        public double PercentOfTotal { get; set; }

        [JsonProperty("severity")]
        public string Severity { get; set; }
    }

    public class DebtAgingReport
    {
        [JsonProperty("totalDebtPiasters")]
        public long TotalDebtPiasters { get; set; }

        [JsonProperty("tiers")]
        public List<DebtAgingTier> Tiers { get; set; }

        [JsonProperty("criticalDebtorsCount")]
        public int CriticalDebtorsCount { get; set; }

        public DebtAgingReport()
        {
            Tiers = new List<DebtAgingTier>();
        }
    }

    public class CustomerRankItem
    {
        [JsonProperty("customerId")]
        public string CustomerId { get; set; }

        [JsonProperty("customerName")]
        public string CustomerName { get; set; }

        [JsonProperty("phone")]
        public string Phone { get; set; }

        [JsonProperty("totalAmountPiasters")]
        public long TotalAmountPiasters { get; set; }

        [JsonProperty("invoicesCount")]
        public int InvoicesCount { get; set; }

        [JsonProperty("balancePiasters")]
        public long BalancePiasters { get; set; }

        [JsonProperty("lastActivityDate")]
        public string LastActivityDate { get; set; }
    }

    public class CustomerBehaviorReport
    {
        [JsonProperty("topBuyingCustomers")]
        public List<CustomerRankItem> TopBuyingCustomers { get; set; }

        [JsonProperty("topPayingCustomers")]
        public List<CustomerRankItem> TopPayingCustomers { get; set; }

        [JsonProperty("inactiveDebtors")]
        public List<CustomerRankItem> InactiveDebtors { get; set; }

        [JsonProperty("newCustomersCount")]
        public int NewCustomersCount { get; set; }

        public CustomerBehaviorReport()
        {
            TopBuyingCustomers = new List<CustomerRankItem>();
            TopPayingCustomers = new List<CustomerRankItem>();
            InactiveDebtors = new List<CustomerRankItem>();
        }
    }

    public class PaymentHistoryRecord
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("customerId")]
        public string CustomerId { get; set; }

        [JsonProperty("customerName")]
        public string CustomerName { get; set; }

        [JsonProperty("amountPiasters")]
        public long AmountPiasters { get; set; }

        [JsonProperty("paymentDate")]
        public string PaymentDate { get; set; }

        [JsonProperty("notes")]
        public string Notes { get; set; }

        [JsonProperty("cashierName")]
        public string CashierName { get; set; }

        [JsonProperty("previousBalancePiasters")]
        public long PreviousBalancePiasters { get; set; }

        [JsonProperty("newBalancePiasters")]
        public long NewBalancePiasters { get; set; }
    }

    public class HourlySalesPoint
    {
        [JsonProperty("hour")]
        public int Hour { get; set; }

        [JsonProperty("hourLabel")]
        public string HourLabel { get; set; }

        [JsonProperty("salesPiasters")]
        public long SalesPiasters { get; set; }

        [JsonProperty("invoicesCount")]
        public int InvoicesCount { get; set; }

        [JsonProperty("returnsPiasters")]
        public long ReturnsPiasters { get; set; }
    }

    public class HourlyIntensityReport
    {
        [JsonProperty("period")]
        public string Period { get; set; }

        [JsonProperty("peakHour")]
        public int PeakHour { get; set; }

        [JsonProperty("peakHourLabel")]
        public string PeakHourLabel { get; set; }

        [JsonProperty("peakHourSalesPiasters")]
        public long PeakHourSalesPiasters { get; set; }

        [JsonProperty("peakHourInvoicesCount")]
        public int PeakHourInvoicesCount { get; set; }

        [JsonProperty("hours")]
        public List<HourlySalesPoint> Hours { get; set; }

        public HourlyIntensityReport()
        {
            Hours = new List<HourlySalesPoint>();
        }
    }

    public class DeadStockItem
    {
        [JsonProperty("productId")]
        public string ProductId { get; set; }

        [JsonProperty("barcode")]
        public string Barcode { get; set; }

        [JsonProperty("name")]
        public string Name { get; set; }

        [JsonProperty("categoryName")]
        public string CategoryName { get; set; }

        [JsonProperty("stockMilli")]
        public long StockMilli { get; set; }

        [JsonProperty("unit")]
        public string Unit { get; set; }

        [JsonProperty("unitCostPiasters")]
        public long UnitCostPiasters { get; set; }

        [JsonProperty("retailPricePiasters")]
        public long RetailPricePiasters { get; set; }

        [JsonProperty("tiedCapitalPiasters")]
        public long TiedCapitalPiasters { get; set; }

        [JsonProperty("daysInactive")]
        public int DaysInactive { get; set; }

        [JsonProperty("lastSoldDate")]
        public string LastSoldDate { get; set; }
    }

    public class DeadStockReport
    {
        [JsonProperty("totalDeadItemsCount")]
        public int TotalDeadItemsCount { get; set; }

        [JsonProperty("totalTiedCapitalPiasters")]
        public long TotalTiedCapitalPiasters { get; set; }

        [JsonProperty("daysThreshold")]
        public int DaysThreshold { get; set; }

        [JsonProperty("items")]
        public List<DeadStockItem> Items { get; set; }

        public DeadStockReport()
        {
            Items = new List<DeadStockItem>();
        }
    }

    public class CashierPerformanceMetric
    {
        [JsonProperty("cashierId")]
        public string CashierId { get; set; }

        [JsonProperty("cashierName")]
        public string CashierName { get; set; }

        [JsonProperty("role")]
        public string Role { get; set; }

        [JsonProperty("invoicesCount")]
        public int InvoicesCount { get; set; }

        [JsonProperty("totalSalesPiasters")]
        public long TotalSalesPiasters { get; set; }

        [JsonProperty("cashSalesPiasters")]
        public long CashSalesPiasters { get; set; }

        [JsonProperty("averageInvoicePiasters")]
        public long AverageInvoicePiasters { get; set; }

        [JsonProperty("cancelledCount")]
        public int CancelledCount { get; set; }

        [JsonProperty("returnsCount")]
        public int ReturnsCount { get; set; }
    }
}

