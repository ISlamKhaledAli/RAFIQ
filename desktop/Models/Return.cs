using System;
using System.Collections.Generic;
using Newtonsoft.Json;

namespace RafiqPOS.Models
{
    public class ReturnItem
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("returnId")]
        public string ReturnId { get; set; }

        [JsonProperty("saleItemId")]
        public string SaleItemId { get; set; }

        [JsonProperty("productId")]
        public string ProductId { get; set; }

        [JsonProperty("productName")]
        public string ProductName { get; set; }

        [JsonProperty("barcode")]
        public string Barcode { get; set; }

        [JsonProperty("quantityMilli")]
        public long QuantityMilli { get; set; }

        [JsonProperty("unitPricePiasters")]
        public long UnitPricePiasters { get; set; }

        [JsonProperty("totalPiasters")]
        public long TotalPiasters { get; set; }

        [JsonProperty("isDamaged")]
        public bool IsDamaged { get; set; }

        [JsonProperty("unit")]
        public string Unit { get; set; }

        [JsonProperty("createdAt")]
        public string CreatedAt { get; set; }
    }

    public class Return
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("returnNumber")]
        public int ReturnNumber { get; set; }

        [JsonProperty("saleId")]
        public string SaleId { get; set; }

        [JsonProperty("invoiceNumber")]
        public int? InvoiceNumber { get; set; }

        [JsonProperty("customerId")]
        public string CustomerId { get; set; }

        [JsonProperty("customerName")]
        public string CustomerName { get; set; }

        [JsonProperty("cashierId")]
        public string CashierId { get; set; }

        [JsonProperty("totalPiasters")]
        public long TotalPiasters { get; set; }

        [JsonProperty("refundMethod")]
        public string RefundMethod { get; set; }

        [JsonProperty("reason")]
        public string Reason { get; set; }

        [JsonProperty("isWithoutInvoice")]
        public bool IsWithoutInvoice { get; set; }

        [JsonProperty("createdAt")]
        public string CreatedAt { get; set; }

        [JsonProperty("items")]
        public List<ReturnItem> Items { get; set; }

        public Return()
        {
            Items = new List<ReturnItem>();
        }
    }
}
