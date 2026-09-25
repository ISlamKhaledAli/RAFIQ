using System;
using Newtonsoft.Json;

namespace RafiqPOS.Models
{
    public class StockMovement
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

        [JsonProperty("movementType")]
        public string MovementType { get; set; }

        [JsonProperty("quantityMilli")]
        public long QuantityMilli { get; set; }

        [JsonProperty("referenceId")]
        public string ReferenceId { get; set; }

        [JsonProperty("referenceType")]
        public string ReferenceType { get; set; }

        [JsonProperty("unitCostPiasters")]
        public long UnitCostPiasters { get; set; }

        [JsonProperty("note")]
        public string Note { get; set; }

        [JsonProperty("batchNumber")]
        public string BatchNumber { get; set; }

        [JsonProperty("createdAt")]
        public string CreatedAt { get; set; }

        // Presentation helpers (Never used in internal calculations)
        [JsonProperty("movementTypeArabic")]
        public string MovementTypeArabic
        {
            get
            {
                if (string.IsNullOrEmpty(MovementType)) return "";
                switch (MovementType.ToUpperInvariant())
                {
                    case "INITIAL":
                        return "رصيد افتتاحي";
                    case "SALE":
                        return "مبيعات كاشير";
                    case "PURCHASE":
                        return "استلام مشتريات";
                    case "ADJUSTMENT":
                        return "تسوية جردية";
                    case "RETURN":
                        return "مرتجع مبيعات";
                    default:
                        return MovementType;
                }
            }
        }

        [JsonProperty("quantityFormatted")]
        public string QuantityFormatted
        {
            get
            {
                double qty = QuantityMilli / 1000.0;
                string sign = QuantityMilli > 0 ? "+" : "";
                string unitStr = (Unit == "kg") ? " كجم" : " ق";
                return sign + qty.ToString("0.###") + unitStr;
            }
        }

        [JsonProperty("costFormatted")]
        public string CostFormatted
        {
            get
            {
                return (UnitCostPiasters / 100.0).ToString("N2") + " ج.م";
            }
        }
    }

    public class StockDiscrepancy
    {
        [JsonProperty("productId")]
        public string ProductId { get; set; }

        [JsonProperty("productName")]
        public string ProductName { get; set; }

        [JsonProperty("productBarcode")]
        public string ProductBarcode { get; set; }

        [JsonProperty("unit")]
        public string Unit { get; set; }

        [JsonProperty("cachedStockMilli")]
        public long CachedStockMilli { get; set; }

        [JsonProperty("calculatedStockMilli")]
        public long CalculatedStockMilli { get; set; }

        [JsonProperty("differenceMilli")]
        public long DifferenceMilli { get; set; }
    }
}
