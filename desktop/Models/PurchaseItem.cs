using System;
using Newtonsoft.Json;

namespace RafiqPOS.Models
{
    public class PurchaseItem
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("purchaseId")]
        public string PurchaseId { get; set; }

        [JsonProperty("productId")]
        public string ProductId { get; set; }

        [JsonProperty("productName")]
        public string ProductName { get; set; }

        [JsonProperty("barcode")]
        public string Barcode { get; set; }

        [JsonProperty("quantityMilli")]
        public long QuantityMilli { get; set; }

        [JsonProperty("unitCostPiasters")]
        public long UnitCostPiasters { get; set; }

        [JsonProperty("totalCostPiasters")]
        public long TotalCostPiasters { get; set; }

        [JsonProperty("previousCostPiasters")]
        public long PreviousCostPiasters { get; set; }

        [JsonProperty("newSellingPricePiasters")]
        public long? NewSellingPricePiasters { get; set; }

        [JsonProperty("batchNumber")]
        public string BatchNumber { get; set; }

        [JsonProperty("expiryDate")]
        public string ExpiryDate { get; set; }

        [JsonProperty("productionDate")]
        public string ProductionDate { get; set; }

        [JsonProperty("createdAt")]
        public string CreatedAt { get; set; }
    }
}
