using System;
using System.Collections.Generic;
using Newtonsoft.Json;

namespace RafiqPOS.Models
{
    public class BatchImportItem
    {
        [JsonProperty("name")]
        public string Name { get; set; }

        [JsonProperty("barcode")]
        public string Barcode { get; set; }

        [JsonProperty("barcodes")]
        public List<string> Barcodes { get; set; }

        [JsonProperty("categoryName")]
        public string CategoryName { get; set; }

        [JsonProperty("categoryId")]
        public string CategoryId { get; set; }

        [JsonProperty("unit")]
        public string Unit { get; set; }

        [JsonProperty("pricePiasters")]
        public long PricePiasters { get; set; }

        [JsonProperty("costPiasters")]
        public long CostPiasters { get; set; }

        [JsonProperty("stockQuantityMilli")]
        public long StockQuantityMilli { get; set; }

        [JsonProperty("minStockQuantityMilli")]
        public long MinStockQuantityMilli { get; set; }

        [JsonProperty("taxRatePercent")]
        public int TaxRatePercent { get; set; }

        [JsonProperty("internalCode")]
        public string InternalCode { get; set; }

        [JsonProperty("taxCategoryCode")]
        public string TaxCategoryCode { get; set; }

        public BatchImportItem()
        {
            Barcodes = new List<string>();
            Unit = "piece";
            MinStockQuantityMilli = 5000;
        }
    }

    public class BatchImportRequest
    {
        [JsonProperty("items")]
        public List<BatchImportItem> Items { get; set; }

        [JsonProperty("duplicateStrategy")]
        public string DuplicateStrategy { get; set; } // "skip", "update", "error"

        public BatchImportRequest()
        {
            Items = new List<BatchImportItem>();
            DuplicateStrategy = "skip";
        }
    }

    public class BatchImportResult
    {
        [JsonProperty("totalRows")]
        public int TotalRows { get; set; }

        [JsonProperty("importedCount")]
        public int ImportedCount { get; set; }

        [JsonProperty("updatedCount")]
        public int UpdatedCount { get; set; }

        [JsonProperty("skippedCount")]
        public int SkippedCount { get; set; }

        [JsonProperty("errors")]
        public List<string> Errors { get; set; }

        public BatchImportResult()
        {
            Errors = new List<string>();
        }
    }
}
