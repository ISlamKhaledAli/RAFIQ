using System;
using System.Collections.Generic;
using Newtonsoft.Json;

namespace RafiqPOS.Models
{
    public class Purchase
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("invoiceNumber")]
        public long InvoiceNumber { get; set; }

        [JsonProperty("supplierId")]
        public string SupplierId { get; set; }

        [JsonProperty("supplierName")]
        public string SupplierName { get; set; }

        [JsonProperty("supplierInvoiceNumber")]
        public string SupplierInvoiceNumber { get; set; }

        [JsonProperty("invoiceDate")]
        public string InvoiceDate { get; set; }

        [JsonProperty("totalCostPiasters")]
        public long TotalCostPiasters { get; set; }

        [JsonProperty("discountPiasters")]
        public long DiscountPiasters { get; set; }

        [JsonProperty("netCostPiasters")]
        public long NetCostPiasters { get; set; }

        [JsonProperty("paidAmountPiasters")]
        public long PaidAmountPiasters { get; set; }

        [JsonProperty("remainingAmountPiasters")]
        public long RemainingAmountPiasters { get; set; }

        [JsonProperty("paymentStatus")]
        public string PaymentStatus { get; set; }

        [JsonProperty("status")]
        public string Status { get; set; }

        [JsonProperty("notes")]
        public string Notes { get; set; }

        [JsonProperty("createdByUserId")]
        public string CreatedByUserId { get; set; }

        [JsonProperty("createdAt")]
        public string CreatedAt { get; set; }

        [JsonProperty("updatedAt")]
        public string UpdatedAt { get; set; }

        [JsonProperty("items")]
        public List<PurchaseItem> Items { get; set; }

        public Purchase()
        {
            Items = new List<PurchaseItem>();
            PaymentStatus = "PAID";
            Status = "COMPLETED";
        }
    }
}
