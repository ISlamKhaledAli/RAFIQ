using System;
using Newtonsoft.Json;

namespace RafiqPOS.Models
{
    public class SaleItemBatchAllocation
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("saleItemId")]
        public string SaleItemId { get; set; }

        [JsonProperty("batchId")]
        public string BatchId { get; set; }

        [JsonProperty("batchNumber")]
        public string BatchNumber { get; set; }

        [JsonProperty("expiryDate")]
        public string ExpiryDate { get; set; }

        [JsonProperty("quantityMilli")]
        public long QuantityMilli { get; set; }

        [JsonProperty("unitPricePiasters")]
        public long UnitPricePiasters { get; set; }

        [JsonProperty("unitCostPiasters")]
        public long UnitCostPiasters { get; set; }

        [JsonProperty("createdAt")]
        public string CreatedAt { get; set; }
    }
}
