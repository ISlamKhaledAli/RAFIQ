using System;
using Newtonsoft.Json;

namespace RafiqPOS.Models
{
    public class SupplierTransaction
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("supplierId")]
        public string SupplierId { get; set; }

        [JsonProperty("transactionType")]
        public string TransactionType { get; set; }

        [JsonProperty("referenceId")]
        public string ReferenceId { get; set; }

        [JsonProperty("amountPiasters")]
        public long AmountPiasters { get; set; }

        [JsonProperty("notes")]
        public string Notes { get; set; }

        [JsonProperty("createdAt")]
        public string CreatedAt { get; set; }
    }
}
