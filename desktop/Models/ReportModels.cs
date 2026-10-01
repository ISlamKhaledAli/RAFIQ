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
}
