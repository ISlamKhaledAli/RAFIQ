using System;
using System.Collections.Generic;
using Newtonsoft.Json;

namespace RafiqPOS.Models
{
    public class PurchaseReturn
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("returnNumber")]
        public long ReturnNumber { get; set; }

        [JsonProperty("supplierId")]
        public string SupplierId { get; set; }

        [JsonProperty("supplierName")]
        public string SupplierName { get; set; }

        [JsonProperty("purchaseId")]
        public string PurchaseId { get; set; }

        [JsonProperty("returnDate")]
        public string ReturnDate { get; set; }

        [JsonProperty("totalCostPiasters")]
        public long TotalCostPiasters { get; set; }

        [JsonProperty("refundMethod")]
        public string RefundMethod { get; set; } // "BALANCE_DEDUCTION" or "CASH"

        [JsonProperty("notes")]
        public string Notes { get; set; }

        [JsonProperty("createdByUserId")]
        public string CreatedByUserId { get; set; }

        [JsonProperty("createdAt")]
        public string CreatedAt { get; set; }

        [JsonProperty("items")]
        public List<PurchaseReturnItem> Items { get; set; }

        public PurchaseReturn()
        {
            this.Items = new List<PurchaseReturnItem>();
            this.RefundMethod = "BALANCE_DEDUCTION";
        }
    }
}
