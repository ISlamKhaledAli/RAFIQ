using System;
using System.Collections.Generic;
using Newtonsoft.Json;

namespace RafiqPOS.Models
{
    /// <summary>
    /// عنصر مشكلة جودة البيانات لصنف محدد (Feature #117 / Task 117-1)
    /// </summary>
    public class DataQualityIssueItem
    {
        [JsonProperty("productId")]
        public string ProductId { get; set; }

        [JsonProperty("productName")]
        public string ProductName { get; set; }

        [JsonProperty("barcode")]
        public string Barcode { get; set; }

        [JsonProperty("categoryName")]
        public string CategoryName { get; set; }

        [JsonProperty("categoryId")]
        public string CategoryId { get; set; }

        [JsonProperty("stockMilli")]
        public long StockMilli { get; set; }

        [JsonProperty("costPiasters")]
        public long CostPiasters { get; set; }

        [JsonProperty("pricePiasters")]
        public long PricePiasters { get; set; }

        [JsonProperty("unit")]
        public string Unit { get; set; }

        [JsonProperty("issueType")]
        public string IssueType { get; set; } // missing_cost, missing_barcode, missing_category, duplicate_barcode, negative_stock, price_below_cost

        [JsonProperty("severity")]
        public string Severity { get; set; } // critical, warning, info

        [JsonProperty("issueTitle")]
        public string IssueTitle { get; set; }

        [JsonProperty("issueDescription")]
        public string IssueDescription { get; set; }

        [JsonProperty("suggestedFix")]
        public string SuggestedFix { get; set; }
    }

    /// <summary>
    /// تقرير فحص جودة وصحة بيانات المخزون والأصناف (Feature #117 / Task 117-1)
    /// </summary>
    public class DataQualityReport
    {
        [JsonProperty("totalProductsAudited")]
        public int TotalProductsAudited { get; set; }

        [JsonProperty("healthyProductsCount")]
        public int HealthyProductsCount { get; set; }

        [JsonProperty("healthScorePercent")]
        public int HealthScorePercent { get; set; }

        [JsonProperty("totalIssuesCount")]
        public int TotalIssuesCount { get; set; }

        [JsonProperty("missingCostCount")]
        public int MissingCostCount { get; set; }

        [JsonProperty("missingBarcodeCount")]
        public int MissingBarcodeCount { get; set; }

        [JsonProperty("missingCategoryCount")]
        public int MissingCategoryCount { get; set; }

        [JsonProperty("duplicateBarcodeCount")]
        public int DuplicateBarcodeCount { get; set; }

        [JsonProperty("negativeStockCount")]
        public int NegativeStockCount { get; set; }

        [JsonProperty("priceBelowCostCount")]
        public int PriceBelowCostCount { get; set; }

        [JsonProperty("issues")]
        public List<DataQualityIssueItem> Issues { get; set; }

        public DataQualityReport()
        {
            Issues = new List<DataQualityIssueItem>();
        }
    }
}
