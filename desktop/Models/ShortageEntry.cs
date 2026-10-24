using System;
using System.Collections.Generic;
using Newtonsoft.Json;

namespace RafiqPOS.Models
{
    /// <summary>
    /// نموذج قيد في كشكول النواقص (Shortage Entry) - Story 129 / Feature #186
    /// </summary>
    public class ShortageEntry
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("productId")]
        public string ProductId { get; set; }

        [JsonProperty("productName")]
        public string ProductName { get; set; }

        [JsonProperty("productBarcode")]
        public string ProductBarcode { get; set; }

        [JsonProperty("freeText")]
        public string FreeText { get; set; }

        [JsonProperty("requestedQtyMilli")]
        public int RequestedQtyMilli { get; set; }

        [JsonProperty("customerId")]
        public string CustomerId { get; set; }

        [JsonProperty("customerName")]
        public string CustomerName { get; set; }

        [JsonProperty("customerPhone")]
        public string CustomerPhone { get; set; }

        [JsonProperty("source")]
        public string Source { get; set; } // "pos", "low_stock", "manual"

        [JsonProperty("status")]
        public string Status { get; set; } // "open", "ordered", "received", "cancelled"

        [JsonProperty("priority")]
        public string Priority { get; set; } // "normal", "urgent"

        [JsonProperty("purchaseId")]
        public string PurchaseId { get; set; }

        [JsonProperty("notes")]
        public string Notes { get; set; }

        [JsonProperty("preferredSupplierId")]
        public string PreferredSupplierId { get; set; }

        [JsonProperty("preferredSupplierName")]
        public string PreferredSupplierName { get; set; }

        [JsonProperty("unitPricePiasters")]
        public long UnitPricePiasters { get; set; }

        [JsonProperty("createdBy")]
        public string CreatedBy { get; set; }

        [JsonProperty("createdByName")]
        public string CreatedByName { get; set; }

        [JsonProperty("createdAt")]
        public string CreatedAt { get; set; }

        [JsonProperty("updatedAt")]
        public string UpdatedAt { get; set; }

        public ShortageEntry()
        {
            Id = Guid.NewGuid().ToString();
            RequestedQtyMilli = 1000;
            Source = "pos";
            Status = "open";
            Priority = "normal";
            CreatedAt = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss");
        }
    }

    /// <summary>
    /// عنصر تقرير المبيعات الضائعة بسبب النواقص (Lost Sales Report Item)
    /// </summary>
    public class LostSalesReportItem
    {
        [JsonProperty("productId")]
        public string ProductId { get; set; }

        [JsonProperty("itemName")]
        public string ItemName { get; set; }

        [JsonProperty("requestCount")]
        public int RequestCount { get; set; }

        [JsonProperty("totalRequestedQtyMilli")]
        public int TotalRequestedQtyMilli { get; set; }

        [JsonProperty("unitPricePiasters")]
        public long UnitPricePiasters { get; set; }

        [JsonProperty("estimatedLostRevenuePiasters")]
        public long EstimatedLostRevenuePiasters { get; set; }

        [JsonProperty("preferredSupplierName")]
        public string PreferredSupplierName { get; set; }
    }

    /// <summary>
    /// تقرير المبيعات الضائعة الكامل
    /// </summary>
    public class LostSalesReportSummary
    {
        [JsonProperty("totalRequests")]
        public int TotalRequests { get; set; }

        [JsonProperty("uniqueProductsCount")]
        public int UniqueProductsCount { get; set; }

        [JsonProperty("totalLostRevenuePiasters")]
        public long TotalLostRevenuePiasters { get; set; }

        [JsonProperty("items")]
        public List<LostSalesReportItem> Items { get; set; }

        public LostSalesReportSummary()
        {
            Items = new List<LostSalesReportItem>();
        }
    }

    /// <summary>
    /// مقترح طلبية شراء مجمعة من النواقص للموردين
    /// </summary>
    public class ShortagePurchaseProposal
    {
        [JsonProperty("supplierId")]
        public string SupplierId { get; set; }

        [JsonProperty("supplierName")]
        public string SupplierName { get; set; }

        [JsonProperty("shortageIds")]
        public List<string> ShortageIds { get; set; }

        [JsonProperty("lines")]
        public List<ShortagePurchaseProposalLine> Lines { get; set; }

        public ShortagePurchaseProposal()
        {
            ShortageIds = new List<string>();
            Lines = new List<ShortagePurchaseProposalLine>();
        }
    }

    public class ShortagePurchaseProposalLine
    {
        [JsonProperty("productId")]
        public string ProductId { get; set; }

        [JsonProperty("productName")]
        public string ProductName { get; set; }

        [JsonProperty("barcode")]
        public string Barcode { get; set; }

        [JsonProperty("suggestedQtyMilli")]
        public int SuggestedQtyMilli { get; set; }

        [JsonProperty("costPricePiasters")]
        public long CostPricePiasters { get; set; }

        [JsonProperty("shortageCount")]
        public int ShortageCount { get; set; }
    }
}
