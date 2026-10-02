using System;
using Newtonsoft.Json;

namespace RafiqPOS.Models
{
    public class ProductVariant
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("parentProductId")]
        public string ParentProductId { get; set; }

        [JsonProperty("variantProductId")]
        public string VariantProductId { get; set; }

        [JsonProperty("size")]
        public string Size { get; set; }

        [JsonProperty("color")]
        public string Color { get; set; }

        [JsonProperty("sku")]
        public string Sku { get; set; }

        [JsonProperty("barcode")]
        public string Barcode { get; set; }

        [JsonProperty("pricePiasters")]
        public long PricePiasters { get; set; }

        [JsonProperty("costPiasters")]
        public long CostPiasters { get; set; }

        [JsonProperty("stockQuantityMilli")]
        public long StockQuantityMilli { get; set; }

        [JsonProperty("minStockQuantityMilli")]
        public long MinStockQuantityMilli { get; set; }

        [JsonProperty("createdAt")]
        public string CreatedAt { get; set; }

        [JsonProperty("updatedAt")]
        public string UpdatedAt { get; set; }

        [JsonProperty("priceFormatted")]
        public string PriceFormatted
        {
            get { return (PricePiasters / 100.0).ToString("N2") + " Ø¬.Ù…"; }
        }

        [JsonProperty("costFormatted")]
        public string CostFormatted
        {
            get { return (CostPiasters / 100.0).ToString("N2") + " Ø¬.Ù…"; }
        }

        [JsonProperty("stockFormatted")]
        public string StockFormatted
        {
            get { return (StockQuantityMilli / 1000.0).ToString("0.###"); }
        }
    }

    public class CreateVariantMatrixRequest
    {
        [JsonProperty("parentProductId")]
        public string ParentProductId { get; set; }

        [JsonProperty("parentName")]
        public string ParentName { get; set; }

        [JsonProperty("categoryId")]
        public string CategoryId { get; set; }

        [JsonProperty("defaultPricePiasters")]
        public long DefaultPricePiasters { get; set; }

        [JsonProperty("defaultCostPiasters")]
        public long DefaultCostPiasters { get; set; }

        [JsonProperty("defaultMinStockQuantityMilli")]
        public long DefaultMinStockQuantityMilli { get; set; }

        [JsonProperty("sizes")]
        public System.Collections.Generic.List<string> Sizes { get; set; }

        [JsonProperty("colors")]
        public System.Collections.Generic.List<string> Colors { get; set; }

        [JsonProperty("matrixCells")]
        public System.Collections.Generic.List<VariantMatrixCell> MatrixCells { get; set; }
    }

    public class VariantMatrixCell
    {
        [JsonProperty("size")]
        public string Size { get; set; }

        [JsonProperty("color")]
        public string Color { get; set; }

        [JsonProperty("barcode")]
        public string Barcode { get; set; }

        [JsonProperty("sku")]
        public string Sku { get; set; }

        [JsonProperty("pricePiasters")]
        public long PricePiasters { get; set; }

        [JsonProperty("costPiasters")]
        public long CostPiasters { get; set; }

        [JsonProperty("stockQuantityMilli")]
        public long StockQuantityMilli { get; set; }

        [JsonProperty("minStockQuantityMilli")]
        public long MinStockQuantityMilli { get; set; }

        [JsonProperty("isEnabled")]
        public bool IsEnabled { get; set; }
    }

    public class ParentProductWithVariants
    {
        [JsonProperty("parentProduct")]
        public Product ParentProduct { get; set; }

        [JsonProperty("variants")]
        public System.Collections.Generic.List<ProductVariant> Variants { get; set; }

        [JsonProperty("totalStockMilli")]
        public long TotalStockMilli { get; set; }

        [JsonProperty("totalVariantsCount")]
        public int TotalVariantsCount { get; set; }
    }
}

