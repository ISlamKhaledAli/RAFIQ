using System;
using System.Text.RegularExpressions;
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

        [JsonProperty("batchId")]
        public string BatchId { get; set; }

        [JsonProperty("createdAt")]
        public string CreatedAt { get; set; }

        [JsonProperty("balanceAfterMilli")]
        public long? BalanceAfterMilli { get; set; }

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
                    case "INITIAL_OPENING":
                    case "OPENING_BALANCE":
                        return "رصيد افتتاحي";
                    case "SALE":
                        return "مبيعات كاشير";
                    case "SALE_CANCEL":
                        return "إلغاء فاتورة بيع";
                    case "PURCHASE":
                        return "استلام مشتريات";
                    case "PURCHASE_RETURN":
                        return "مرتجع مشتريات";
                    case "ADJUSTMENT":
                    case "INVENTORY_ADJUSTMENT":
                        return "تسوية جردية";
                    case "RETURN":
                    case "REFUND":
                        return "مرتجع مبيعات";
                    case "DAMAGED_RETURN":
                        return "مرتجع تالف";
                    case "DAMAGE":
                        return "تالف";
                    case "EXPIRED_WRITE_OFF":
                        return "إعدام منتهي الصلاحية";
                    case "UNIT_REBASE":
                        return "إعادة ضبط الوحدات";
                    case "PRODUCTION_CONSUMPTION":
                        return "استهلاك خامات إنتاج";
                    case "PRODUCTION_OUTPUT":
                        return "ناتج إنتاج";
                    case "RECIPE_SALE_CONSUMPTION":
                        return "استهلاك مكونات وصفة";
                    case "RECIPE_SALE_REVERSAL":
                        return "عكس استهلاك وصفة";
                    case "IN":
                        return "إضافة مخزون";
                    case "OUT":
                        return "صرف مخزون";
                    default:
                        return "حركة مخزون";
                }
            }
        }

        // Legacy notes may carry English unit/adjustment tokens; used for exports only, never written back
        public static string LocalizeNote(string note)
        {
            if (string.IsNullOrEmpty(note)) return note;
            string result = note.Replace("[SURPLUS]", "[فائض جردي]").Replace("[SHORTAGE]", "[عجز جردي]");
            result = Regex.Replace(result, @"\((piece|pieces|pcs|pc|unit|item)\)", "(قطعة)", RegexOptions.IgnoreCase);
            return Regex.Replace(result, @"\(kg\)", "(كجم)", RegexOptions.IgnoreCase);
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
