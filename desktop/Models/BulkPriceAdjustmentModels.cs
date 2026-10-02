using System;
using System.Collections.Generic;
using Newtonsoft.Json;

namespace RafiqPOS.Models
{
    public class BulkPriceExcelItem
    {
        [JsonProperty("identifier")]
        public string Identifier { get; set; }

        [JsonProperty("newPricePiasters")]
        public long? NewPricePiasters { get; set; }

        [JsonProperty("newCostPiasters")]
        public long? NewCostPiasters { get; set; }
    }

    public class BulkPricePreviewRequest
    {
        [JsonProperty("scope")]
        public string Scope { get; set; } // "selected", "category", "all", "search"

        [JsonProperty("productIds")]
        public List<string> ProductIds { get; set; }

        [JsonProperty("categoryId")]
        public string CategoryId { get; set; }

        [JsonProperty("searchQuery")]
        public string SearchQuery { get; set; }

        [JsonProperty("targetField")]
        public string TargetField { get; set; } // "price", "cost", "both"

        [JsonProperty("method")]
        public string Method { get; set; } // "percentage", "fixed_amount", "excel"

        [JsonProperty("percentageValue")]
        public double PercentageValue { get; set; } // e.g. 10.0 or -5.0

        [JsonProperty("amountPiasters")]
        public long AmountPiasters { get; set; } // e.g. 200 for 2.00 EGP

        [JsonProperty("roundingRule")]
        public string RoundingRule { get; set; } // "none", "half_pound", "one_pound", "five_pounds", "ceil_pound", "psychological_95", "psychological_50"

        [JsonProperty("reason")]
        public string Reason { get; set; }

        [JsonProperty("excelItems")]
        public List<BulkPriceExcelItem> ExcelItems { get; set; }

        public BulkPricePreviewRequest()
        {
            Scope = "selected";
            ProductIds = new List<string>();
            TargetField = "price";
            Method = "percentage";
            RoundingRule = "none";
            PercentageValue = 0;
            AmountPiasters = 0;
            ExcelItems = new List<BulkPriceExcelItem>();
        }
    }

    public class BulkPricePreviewItem
    {
        [JsonProperty("productId")]
        public string ProductId { get; set; }

        [JsonProperty("productName")]
        public string ProductName { get; set; }

        [JsonProperty("barcode")]
        public string Barcode { get; set; }

        [JsonProperty("categoryName")]
        public string CategoryName { get; set; }

        [JsonProperty("currentPricePiasters")]
        public long CurrentPricePiasters { get; set; }

        [JsonProperty("newPricePiasters")]
        public long NewPricePiasters { get; set; }

        [JsonProperty("currentCostPiasters")]
        public long CurrentCostPiasters { get; set; }

        [JsonProperty("newCostPiasters")]
        public long NewCostPiasters { get; set; }

        [JsonProperty("priceDiffPiasters")]
        public long PriceDiffPiasters { get; set; }

        [JsonProperty("priceDiffPercent")]
        public double PriceDiffPercent { get; set; }

        [JsonProperty("costDiffPiasters")]
        public long CostDiffPiasters { get; set; }

        [JsonProperty("belowCost")]
        public bool BelowCost { get; set; }
    }

    public class BulkPricePreviewResult
    {
        [JsonProperty("items")]
        public List<BulkPricePreviewItem> Items { get; set; }

        [JsonProperty("totalCount")]
        public int TotalCount { get; set; }

        [JsonProperty("belowCostCount")]
        public int BelowCostCount { get; set; }

        [JsonProperty("averageIncreasePercent")]
        public double AverageIncreasePercent { get; set; }

        public BulkPricePreviewResult()
        {
            Items = new List<BulkPricePreviewItem>();
        }
    }

    public class BulkPriceApplyItem
    {
        [JsonProperty("productId")]
        public string ProductId { get; set; }

        [JsonProperty("newPricePiasters")]
        public long NewPricePiasters { get; set; }

        [JsonProperty("newCostPiasters")]
        public long NewCostPiasters { get; set; }

        [JsonProperty("oldPricePiasters")]
        public long OldPricePiasters { get; set; }

        [JsonProperty("oldCostPiasters")]
        public long OldCostPiasters { get; set; }
    }

    public class BulkPriceApplyRequest
    {
        [JsonProperty("items")]
        public List<BulkPriceApplyItem> Items { get; set; }

        [JsonProperty("reason")]
        public string Reason { get; set; }

        [JsonProperty("userId")]
        public string UserId { get; set; }

        public BulkPriceApplyRequest()
        {
            Items = new List<BulkPriceApplyItem>();
            Reason = "تعديل أسعار جماعي";
            UserId = "usr_admin_default";
        }
    }

    public class BulkPriceApplyResult
    {
        [JsonProperty("success")]
        public bool Success { get; set; }

        [JsonProperty("updatedCount")]
        public int UpdatedCount { get; set; }

        [JsonProperty("message")]
        public string Message { get; set; }
    }
}
