using System;
using Newtonsoft.Json;

namespace RafiqPOS.Models
{
    public class ProductBatch
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("productId")]
        public string ProductId { get; set; }

        [JsonProperty("productName")]
        public string ProductName { get; set; }

        [JsonProperty("productBarcode")]
        public string ProductBarcode { get; set; }

        [JsonProperty("unit")]
        public string Unit { get; set; }

        [JsonProperty("batchNumber")]
        public string BatchNumber { get; set; }

        [JsonProperty("expiryDate")]
        public string ExpiryDate { get; set; } // YYYY-MM-DD

        [JsonProperty("productionDate")]
        public string ProductionDate { get; set; } // YYYY-MM-DD

        [JsonProperty("quantityMilli")]
        public long QuantityMilli { get; set; }

        [JsonProperty("costPricePiasters")]
        public long CostPricePiasters { get; set; }

        [JsonProperty("supplierId")]
        public string SupplierId { get; set; }

        [JsonProperty("supplierName")]
        public string SupplierName { get; set; }

        [JsonProperty("purchaseId")]
        public string PurchaseId { get; set; }

        [JsonProperty("status")]
        public string Status { get; set; } // 'ACTIVE', 'DEPLETED', 'EXPIRED'

        [JsonProperty("notes")]
        public string Notes { get; set; }

        [JsonProperty("createdAt")]
        public string CreatedAt { get; set; }

        [JsonProperty("updatedAt")]
        public string UpdatedAt { get; set; }

        // Presentation / status helper properties (Rule 1: Never used in internal arithmetic)
        [JsonProperty("daysUntilExpiry")]
        public int? DaysUntilExpiry
        {
            get
            {
                if (string.IsNullOrEmpty(ExpiryDate)) return null;
                DateTime exp;
                if (DateTime.TryParse(ExpiryDate, out exp))
                {
                    return (int)Math.Ceiling((exp.Date - DateTime.UtcNow.Date).TotalDays);
                }
                return null;
            }
        }

        [JsonProperty("expiryStatus")]
        public string ExpiryStatus
        {
            get
            {
                if (string.IsNullOrEmpty(ExpiryDate)) return "UNSPECIFIED";
                int? days = DaysUntilExpiry;
                if (!days.HasValue) return "UNSPECIFIED";
                if (days.Value < 0) return "EXPIRED";
                if (days.Value <= 30) return "NEAR_EXPIRY";
                return "VALID";
            }
        }

        [JsonProperty("totalValuePiasters")]
        public long TotalValuePiasters
        {
            get
            {
                return (QuantityMilli * CostPricePiasters) / 1000;
            }
        }
    }

    public class BatchSummaryResult
    {
        [JsonProperty("totalBatchesCount")]
        public int TotalBatchesCount { get; set; }

        [JsonProperty("activeBatchesCount")]
        public int ActiveBatchesCount { get; set; }

        [JsonProperty("expiringSoonCount")]
        public int ExpiringSoonCount { get; set; }

        [JsonProperty("expiredCount")]
        public int ExpiredCount { get; set; }

        [JsonProperty("expiredValuePiasters")]
        public long ExpiredValuePiasters { get; set; }

        [JsonProperty("expiringSoonValuePiasters")]
        public long ExpiringSoonValuePiasters { get; set; }

        [JsonProperty("alertDays")]
        public int AlertDays { get; set; }
    }

    public class BatchDeductionResult
    {
        public string BatchId { get; set; }
        public string BatchNumber { get; set; }
        public string ExpiryDate { get; set; }
        public long DeductedQuantityMilli { get; set; }
        public long RemainingQuantityMilli { get; set; }
    }
}
