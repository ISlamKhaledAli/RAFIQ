using System;
using System.Collections.Generic;
using Newtonsoft.Json;

namespace RafiqPOS.Models
{
    public class DashboardSummary
    {
        [JsonProperty("todaySalesPiasters")]
        public long TodaySalesPiasters { get; set; }

        [JsonProperty("todaySalesFormatted")]
        public string TodaySalesFormatted
        {
            get { return Common.Money.FormatPiasters(this.TodaySalesPiasters); }
        }

        [JsonProperty("todayCashPiasters")]
        public long TodayCashPiasters { get; set; }

        [JsonProperty("todayCashFormatted")]
        public string TodayCashFormatted
        {
            get { return Common.Money.FormatPiasters(this.TodayCashPiasters); }
        }

        [JsonProperty("todayCreditPiasters")]
        public long TodayCreditPiasters { get; set; }

        [JsonProperty("todayCreditFormatted")]
        public string TodayCreditFormatted
        {
            get { return Common.Money.FormatPiasters(this.TodayCreditPiasters); }
        }

        [JsonProperty("todayProfitsPiasters")]
        public long TodayProfitsPiasters { get; set; }

        [JsonProperty("todayProfitsFormatted")]
        public string TodayProfitsFormatted
        {
            get { return Common.Money.FormatPiasters(this.TodayProfitsPiasters); }
        }

        [JsonProperty("todayInvoicesCount")]
        public int TodayInvoicesCount { get; set; }

        [JsonProperty("cashDrawerPiasters")]
        public long CashDrawerPiasters { get; set; }

        [JsonProperty("cashDrawerFormatted")]
        public string CashDrawerFormatted
        {
            get { return Common.Money.FormatPiasters(this.CashDrawerPiasters); }
        }

        [JsonProperty("topSellingProducts")]
        public List<TopSellingItem> TopSellingProducts { get; set; }

        [JsonProperty("lowStockProducts")]
        public List<LowStockItem> LowStockProducts { get; set; }

        [JsonProperty("totalCustomerDebtsPiasters")]
        public long TotalCustomerDebtsPiasters { get; set; }

        [JsonProperty("totalCustomerDebtsFormatted")]
        public string TotalCustomerDebtsFormatted
        {
            get { return Common.Money.FormatPiasters(this.TotalCustomerDebtsPiasters); }
        }

        [JsonProperty("debtorsCount")]
        public int DebtorsCount { get; set; }

        [JsonProperty("topDebtors")]
        public List<TopDebtorItem> TopDebtors { get; set; }

        [JsonProperty("todaySalesGrossProfitPiasters")]
        public long TodaySalesGrossProfitPiasters { get; set; }

        [JsonProperty("todayInventoryLossPiasters")]
        public long TodayInventoryLossPiasters { get; set; }

        [JsonProperty("todayInventoryLossFormatted")]
        public string TodayInventoryLossFormatted
        {
            get { return Common.Money.FormatPiasters(this.TodayInventoryLossPiasters); }
        }

        [JsonProperty("todayInventorySurplusPiasters")]
        public long TodayInventorySurplusPiasters { get; set; }

        [JsonProperty("todayInventorySurplusFormatted")]
        public string TodayInventorySurplusFormatted
        {
            get { return Common.Money.FormatPiasters(this.TodayInventorySurplusPiasters); }
        }

        [JsonProperty("todayNetProfitsPiasters")]
        public long TodayNetProfitsPiasters { get; set; }

        [JsonProperty("todayNetProfitsFormatted")]
        public string TodayNetProfitsFormatted
        {
            get { return Common.Money.FormatPiasters(this.TodayNetProfitsPiasters); }
        }

        [JsonProperty("todayAdjustmentsCount")]
        public int TodayAdjustmentsCount { get; set; }

        [JsonProperty("todayDebtPaymentsPiasters")]
        public long TodayDebtPaymentsPiasters { get; set; }

        [JsonProperty("recentAdjustments")]
        public List<StockAdjustmentSummaryItem> RecentAdjustments { get; set; }

        public DashboardSummary()
        {
            this.TopSellingProducts = new List<TopSellingItem>();
            this.LowStockProducts = new List<LowStockItem>();
            this.TopDebtors = new List<TopDebtorItem>();
            this.RecentAdjustments = new List<StockAdjustmentSummaryItem>();
        }
    }

    public class StockAdjustmentSummaryItem
    {
        [JsonProperty("productId")]
        public string ProductId { get; set; }

        [JsonProperty("productName")]
        public string ProductName { get; set; }

        [JsonProperty("unit")]
        public string Unit { get; set; }

        [JsonProperty("quantityDeltaMilli")]
        public long QuantityDeltaMilli { get; set; }

        [JsonProperty("quantityDeltaFormatted")]
        public string QuantityDeltaFormatted
        {
            get
            {
                double qty = Math.Abs(this.QuantityDeltaMilli) / 1000.0;
                string sign = this.QuantityDeltaMilli > 0 ? "+" : "-";
                string unitStr = (this.Unit == "kg") ? " كجم" : " قطعة";
                return sign + qty.ToString("0.###") + " " + unitStr;
            }
        }

        [JsonProperty("unitCostPiasters")]
        public long UnitCostPiasters { get; set; }

        [JsonProperty("financialImpactPiasters")]
        public long FinancialImpactPiasters { get; set; }

        [JsonProperty("financialImpactFormatted")]
        public string FinancialImpactFormatted
        {
            get { return Common.Money.FormatPiasters(this.FinancialImpactPiasters); }
        }

        [JsonProperty("reason")]
        public string Reason { get; set; }

        [JsonProperty("createdAt")]
        public string CreatedAt { get; set; }
    }

    public class TopSellingItem
    {
        [JsonProperty("productId")]
        public string ProductId { get; set; }

        [JsonProperty("productName")]
        public string ProductName { get; set; }

        [JsonProperty("totalQuantity")]
        public int TotalQuantity { get; set; }

        [JsonProperty("totalSalesPiasters")]
        public long TotalSalesPiasters { get; set; }

        [JsonProperty("totalSalesFormatted")]
        public string TotalSalesFormatted
        {
            get { return Common.Money.FormatPiasters(this.TotalSalesPiasters); }
        }
    }

    public class LowStockItem
    {
        [JsonProperty("productId")]
        public string ProductId { get; set; }

        [JsonProperty("productName")]
        public string ProductName { get; set; }

        [JsonProperty("currentStock")]
        public int CurrentStock { get; set; }

        [JsonProperty("unit")]
        public string Unit { get; set; }
    }

    public class TopDebtorItem
    {
        [JsonProperty("customerId")]
        public string CustomerId { get; set; }

        [JsonProperty("customerName")]
        public string CustomerName { get; set; }

        [JsonProperty("customerPhone")]
        public string CustomerPhone { get; set; }

        [JsonProperty("balancePiasters")]
        public long BalancePiasters { get; set; }

        [JsonProperty("balanceFormatted")]
        public string BalanceFormatted
        {
            get { return Common.Money.FormatPiasters(this.BalancePiasters); }
        }
    }
}
