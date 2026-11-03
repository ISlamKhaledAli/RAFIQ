using System.Collections.Generic;
using Newtonsoft.Json.Linq;

namespace RafiqPOS.Models
{
    public class CatalogueRecord
    {
        public int SchemaVersion { get; set; }
        public string RecordId { get; set; }
        public string Gtin { get; set; }
        public string Gtin14Key { get; set; }
        public string NameOriginal { get; set; }
        public string Brand { get; set; }
        public string Variant { get; set; }
        public string NetQuantityText { get; set; }
        public string PackDescription { get; set; }
        public string Category { get; set; }
        public JObject Provenance { get; set; }
    }

    public class CatalogueSelection
    {
        public string RecordId { get; set; }
        public string ConfirmedBarcode { get; set; }
        public string ConfirmedPack { get; set; }
        public bool IdentityConfirmed { get; set; }
        public bool PricesConfirmed { get; set; }
        public bool BelowCostConfirmed { get; set; }
        public bool ZeroCostConfirmed { get; set; }
        public long? SalePricePiasters { get; set; }
        public long? CostPiasters { get; set; }
        public string CategoryId { get; set; }
    }

    public class CatalogueRequest
    {
        public string DatasetSha256 { get; set; }
        public List<CatalogueSelection> Selections { get; set; }
        public string ExpectedPreviewHash { get; set; }
        public string AttemptId { get; set; }
        public bool ConfirmApply { get; set; }
    }

    public class CataloguePreviewRow
    {
        public string RecordId { get; set; }
        public string Status { get; set; }
        public string ExistingProductId { get; set; }
        public string BarcodeSource { get; set; }
    }

    public class CataloguePreview
    {
        public string PreviewHash { get; set; }
        public List<CataloguePreviewRow> Rows { get; set; }
    }

    public class CatalogueApplyResult
    {
        public string AttemptId { get; set; }
        public List<string> CreatedProductIds { get; set; }
        public List<string> SkippedRecordIds { get; set; }
    }
}
