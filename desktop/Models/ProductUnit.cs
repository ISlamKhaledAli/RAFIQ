using System;
using Newtonsoft.Json;

namespace RafiqPOS.Models
{
    public class ProductUnit
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("productId")]
        public string ProductId { get; set; }

        [JsonProperty("unitName")]
        public string UnitName { get; set; }

        [JsonProperty("conversionFactor")]
        public int ConversionFactor { get; set; }

        [JsonProperty("isBaseUnit")]
        public bool IsBaseUnit { get; set; }

        [JsonProperty("sellPricePiasters")]
        public long SellPricePiasters { get; set; }

        [JsonProperty("costPricePiasters")]
        public long CostPricePiasters { get; set; }

        [JsonProperty("barcode")]
        public string Barcode { get; set; }

        [JsonProperty("isDivisible")]
        public bool IsDivisible { get; set; }

        [JsonProperty("sortOrder")]
        public int SortOrder { get; set; }

        [JsonProperty("createdAt")]
        public string CreatedAt { get; set; }

        [JsonProperty("updatedAt")]
        public string UpdatedAt { get; set; }

        // Presentation helpers (Never used in internal DB math)
        [JsonProperty("sellPriceFormatted")]
        public string SellPriceFormatted
        {
            get { return (SellPricePiasters / 100.0).ToString("N2") + " ج.م"; }
        }

        [JsonProperty("costPriceFormatted")]
        public string CostPriceFormatted
        {
            get { return (CostPricePiasters / 100.0).ToString("N2") + " ج.م"; }
        }
    }
}
