using System;
using System.Collections.Generic;
using Newtonsoft.Json;

namespace RafiqPOS.Models
{
    public class SaleItem
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("saleId")]
        public string SaleId { get; set; }

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

        [JsonProperty("unitCostPiasters")]
        public long UnitCostPiasters { get; set; }

        [JsonProperty("discountPiasters")]
        public long DiscountPiasters { get; set; }

        [JsonProperty("totalPiasters")]
        public long TotalPiasters { get; set; }

        [JsonProperty("taxPiasters")]
        public long TaxPiasters { get; set; }

        [JsonProperty("unit")]
        public string Unit { get; set; }
    }

    public class Sale
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("invoiceNumber")]
        public int InvoiceNumber { get; set; }

        [JsonProperty("cashierId")]
        public string CashierId { get; set; }

        [JsonProperty("customerId")]
        public string CustomerId { get; set; }

        [JsonProperty("subtotalPiasters")]
        public long SubtotalPiasters { get; set; }

        [JsonProperty("discountPiasters")]
        public long DiscountPiasters { get; set; }

        [JsonProperty("taxPiasters")]
        public long TaxPiasters { get; set; }

        [JsonProperty("totalPiasters")]
        public long TotalPiasters { get; set; }

        [JsonProperty("paidPiasters")]
        public long PaidPiasters { get; set; }

        [JsonProperty("paymentMethod")]
        public string PaymentMethod { get; set; }

        [JsonProperty("status")]
        public string Status { get; set; }

        [JsonProperty("notes")]
        public string Notes { get; set; }

        [JsonProperty("createdAt")]
        public string CreatedAt { get; set; }

        [JsonProperty("items")]
        public List<SaleItem> Items { get; set; }

        public Sale()
        {
            Items = new List<SaleItem>();
        }
    }
}
