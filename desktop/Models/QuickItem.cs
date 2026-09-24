using System;
using Newtonsoft.Json;

namespace RafiqPOS.Models
{
    public class QuickItem
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("productId")]
        public string ProductId { get; set; }

        [JsonProperty("name")]
        public string Name { get; set; }

        [JsonProperty("pricePiasters")]
        public long PricePiasters { get; set; }

        [JsonProperty("isOpenPrice")]
        public bool IsOpenPrice { get; set; }

        [JsonProperty("unit")]
        public string Unit { get; set; }

        [JsonProperty("categoryName")]
        public string CategoryName { get; set; }

        [JsonProperty("color")]
        public string Color { get; set; }

        [JsonProperty("displayOrder")]
        public int DisplayOrder { get; set; }

        [JsonProperty("createdAt")]
        public string CreatedAt { get; set; }

        [JsonProperty("updatedAt")]
        public string UpdatedAt { get; set; }
    }
}
