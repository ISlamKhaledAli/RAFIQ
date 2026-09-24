using System;
using Newtonsoft.Json;

namespace RafiqPOS.Models
{
    public class ProductPriceHistory
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("productId")]
        public string ProductId { get; set; }

        [JsonProperty("oldPricePiasters")]
        public long OldPricePiasters { get; set; }

        [JsonProperty("newPricePiasters")]
        public long NewPricePiasters { get; set; }

        [JsonProperty("oldCostPiasters")]
        public long OldCostPiasters { get; set; }

        [JsonProperty("newCostPiasters")]
        public long NewCostPiasters { get; set; }

        [JsonProperty("changeReason")]
        public string ChangeReason { get; set; }

        [JsonProperty("createdAt")]
        public string CreatedAt { get; set; }

        // Presentation helpers
        [JsonProperty("oldPriceFormatted")]
        public string OldPriceFormatted
        {
            get { return (OldPricePiasters / 100.0).ToString("N2") + " ج.م"; }
        }

        [JsonProperty("newPriceFormatted")]
        public string NewPriceFormatted
        {
            get { return (NewPricePiasters / 100.0).ToString("N2") + " ج.م"; }
        }

        [JsonProperty("oldCostFormatted")]
        public string OldCostFormatted
        {
            get { return (OldCostPiasters / 100.0).ToString("N2") + " ج.م"; }
        }

        [JsonProperty("newCostFormatted")]
        public string NewCostFormatted
        {
            get { return (NewCostPiasters / 100.0).ToString("N2") + " ج.م"; }
        }
    }
}
