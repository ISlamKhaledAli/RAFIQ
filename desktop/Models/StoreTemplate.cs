using System.Collections.Generic;

namespace RafiqPOS.Models
{
    public class TemplateQuickItem
    {
        public string Name { get; set; }
        public long PricePiasters { get; set; }
        public string Unit { get; set; }
        public string CategoryName { get; set; }
        public bool IsOpenPrice { get; set; }
    }

    public class TemplateProductItem
    {
        public string Name { get; set; }
        public string Barcode { get; set; }
        public string CategoryName { get; set; }
        public long PricePiasters { get; set; }
        public long CostPiasters { get; set; }
        public long StockQuantityMilli { get; set; }
        public long MinStockQuantityMilli { get; set; }
        public string Unit { get; set; }
    }

    public class StoreTemplate
    {
        public string Id { get; set; }
        public string Name { get; set; }
        public string Description { get; set; }
        public string Icon { get; set; }
        public Dictionary<string, bool> FeatureFlags { get; set; }
        public List<string> Categories { get; set; }
        public List<TemplateQuickItem> QuickItems { get; set; }
        public Dictionary<string, string> DefaultSettings { get; set; }
        public bool IsActive { get; set; }
        public string CreatedAt { get; set; }
        public int ProductsCount { get; set; }

        public StoreTemplate()
        {
            FeatureFlags = new Dictionary<string, bool>();
            Categories = new List<string>();
            QuickItems = new List<TemplateQuickItem>();
            DefaultSettings = new Dictionary<string, string>();
            IsActive = true;
            ProductsCount = 0;
        }
    }

    public class ApplyTemplateRequest
    {
        public string TemplateId { get; set; }
        public string StoreName { get; set; }
        public string StorePhone { get; set; }
        public string StoreAddress { get; set; }
        public string ReceiptHeader { get; set; }
        public string ReceiptFooter { get; set; }
        public string DefaultPrinter { get; set; }
        public string BackupFolder { get; set; }
        public bool SeedInitialProducts { get; set; }

        public ApplyTemplateRequest()
        {
            SeedInitialProducts = true;
        }
    }

    public class ApplyTemplateResult
    {
        public bool Success { get; set; }
        public string Message { get; set; }
        public int CategoriesCount { get; set; }
        public int QuickItemsCount { get; set; }
        public int ProductsCount { get; set; }
    }
}
