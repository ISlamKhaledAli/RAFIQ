using System;
using Newtonsoft.Json;

namespace RafiqPOS.Models
{
    public class HeldSale
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("holdLabel")]
        public string HoldLabel { get; set; }

        [JsonProperty("customerId")]
        public string CustomerId { get; set; }

        [JsonProperty("customerName")]
        public string CustomerName { get; set; }

        [JsonProperty("itemsCount")]
        public int ItemsCount { get; set; }

        [JsonProperty("subtotalPiasters")]
        public long SubtotalPiasters { get; set; }

        [JsonProperty("discountPiasters")]
        public long DiscountPiasters { get; set; }

        [JsonProperty("totalPiasters")]
        public long TotalPiasters { get; set; }

        [JsonProperty("cartJson")]
        public string CartJson { get; set; }

        [JsonProperty("notes")]
        public string Notes { get; set; }

        [JsonProperty("cashierId")]
        public string CashierId { get; set; }

        [JsonProperty("createdAt")]
        public string CreatedAt { get; set; }
    }
}
