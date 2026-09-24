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

        [JsonProperty("name")]
        public string Name { get; set; }

        [JsonProperty("categoryId")]
        public string CategoryId { get; set; }

        [JsonProperty("pricePiasters")]
        public long PricePiasters { get; set; }

        [JsonProperty("costPiasters")]
        public long CostPiasters { get; set; }

        [JsonProperty("stockQuantityMilli")]
        public long StockQuantityMilli { get; set; }

        [JsonProperty("unit")]
        public string Unit { get; set; }

        [JsonProperty("taxRatePercent")]
        public int TaxRatePercent { get; set; }

        [JsonProperty("isActive")]
        public bool IsActive { get; set; }

        [JsonProperty("createdAt")]
        public string CreatedAt { get; set; }

        [JsonProperty("updatedAt")]
        public string UpdatedAt { get; set; }

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
    }
}
