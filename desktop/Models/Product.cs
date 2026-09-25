using System;
using Newtonsoft.Json;

namespace RafiqPOS.Models
{
    public class Product
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("barcode")]
        public string Barcode { get; set; }

        [JsonProperty("barcodes")]
        public System.Collections.Generic.List<string> Barcodes { get; set; }

        [JsonProperty("name")]
        public string Name { get; set; }

        [JsonProperty("normalizedName")]
        public string NormalizedName { get; set; }

        [JsonProperty("categoryId")]
        public string CategoryId { get; set; }

        [JsonProperty("pricePiasters")]
        public long PricePiasters { get; set; }

        [JsonProperty("costPiasters")]
        public long CostPiasters { get; set; }

        [JsonProperty("stockQuantityMilli")]
        public long StockQuantityMilli { get; set; }

        [JsonProperty("minStockQuantityMilli")]
        public long MinStockQuantityMilli { get; set; }

        [JsonProperty("unit")]
        public string Unit { get; set; }

        [JsonProperty("taxRatePercent")]
        public int TaxRatePercent { get; set; }

        [JsonProperty("taxCategoryCode")]
        public string TaxCategoryCode { get; set; }

        [JsonProperty("internalCode")]
        public string InternalCode { get; set; }

        [JsonProperty("isActive")]
        public bool IsActive { get; set; }

        [JsonProperty("needsReview")]
        public bool NeedsReview { get; set; }

        [JsonProperty("createdAt")]
        public string CreatedAt { get; set; }

        [JsonProperty("updatedAt")]
        public string UpdatedAt { get; set; }

        [JsonProperty("units")]
        public System.Collections.Generic.List<ProductUnit> Units { get; set; }

        // Presentation helpers (Never used in internal DB math)
        [JsonProperty("priceFormatted")]
        public string PriceFormatted
        {
            get { return (PricePiasters / 100.0).ToString("N2") + " ج.م"; }
        }

        [JsonProperty("stockFormatted")]
        public string StockFormatted
        {
            get { return (StockQuantityMilli / 1000.0).ToString("0.###"); }
        }

        [JsonProperty("minStockFormatted")]
        public string MinStockFormatted
        {
            get { return (MinStockQuantityMilli / 1000.0).ToString("0.###"); }
        }
    }
}
