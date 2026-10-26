using System;
using System.Collections.Generic;
using Newtonsoft.Json;

namespace RafiqPOS.Models
{
    public class DrugReference
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("barcode")]
        public string Barcode { get; set; }

        [JsonProperty("tradeName")]
        public string TradeName { get; set; }

        [JsonProperty("scientificName")]
        public string ScientificName { get; set; }

        [JsonProperty("form")]
        public string Form { get; set; }

        [JsonProperty("strength")]
        public string Strength { get; set; }

        [JsonProperty("manufacturer")]
        public string Manufacturer { get; set; }

        [JsonProperty("therapeuticClass")]
        public string TherapeuticClass { get; set; }

        [JsonProperty("category")]
        public string Category { get; set; }

        [JsonProperty("storageLocation")]
        public string StorageLocation { get; set; }

        [JsonProperty("isRefrigerated")]
        public bool IsRefrigerated { get; set; }

        [JsonProperty("packDesc")]
        public string PackDesc { get; set; }

        [JsonProperty("publicPricePiasters")]
        public long? PublicPricePiasters { get; set; }

        [JsonProperty("route")]
        public string Route { get; set; }

        [JsonProperty("pregnancyCategory")]
        public string PregnancyCategory { get; set; }

        [JsonProperty("isAntibiotic")]
        public bool IsAntibiotic { get; set; }

        [JsonProperty("rxStatus")]
        public string RxStatus { get; set; }

        [JsonProperty("flavorForm")]
        public string FlavorForm { get; set; }

        [JsonProperty("piecesPerPack")]
        public int? PiecesPerPack { get; set; }

        [JsonProperty("source")]
        public string Source { get; set; }

        [JsonProperty("importedAt")]
        public string ImportedAt { get; set; }

        [JsonProperty("createdAt")]
        public string CreatedAt { get; set; }

        [JsonProperty("updatedAt")]
        public string UpdatedAt { get; set; }
    }

    public class DrugReferenceImportRow
    {
        [JsonProperty("rowNumber")]
        public int RowNumber { get; set; }

        [JsonProperty("barcode")]
        public string Barcode { get; set; }

        [JsonProperty("tradeName")]
        public string TradeName { get; set; }

        [JsonProperty("scientificName")]
        public string ScientificName { get; set; }

        [JsonProperty("form")]
        public string Form { get; set; }

        [JsonProperty("strength")]
        public string Strength { get; set; }

        [JsonProperty("manufacturer")]
        public string Manufacturer { get; set; }

        [JsonProperty("therapeuticClass")]
        public string TherapeuticClass { get; set; }

        [JsonProperty("category")]
        public string Category { get; set; }

        [JsonProperty("storageLocation")]
        public string StorageLocation { get; set; }

        [JsonProperty("isRefrigerated")]
        public bool IsRefrigerated { get; set; }

        [JsonProperty("route")]
        public string Route { get; set; }

        [JsonProperty("pregnancyCategory")]
        public string PregnancyCategory { get; set; }

        [JsonProperty("isAntibiotic")]
        public bool IsAntibiotic { get; set; }

        [JsonProperty("rxStatus")]
        public string RxStatus { get; set; }

        [JsonProperty("flavorForm")]
        public string FlavorForm { get; set; }

        [JsonProperty("piecesPerPack")]
        public int? PiecesPerPack { get; set; }

        [JsonProperty("packDesc")]
        public string PackDesc { get; set; }

        [JsonProperty("publicPricePiasters")]
        public long? PublicPricePiasters { get; set; }

        [JsonProperty("status")]
        public string Status { get; set; } // "NEW", "UPDATE", "ERROR"

        [JsonProperty("reason")]
        public string Reason { get; set; }
    }

    public class DrugReferenceImportPreviewResult
    {
        [JsonProperty("totalRows")]
        public int TotalRows { get; set; }

        [JsonProperty("newRowsCount")]
        public int NewRowsCount { get; set; }

        [JsonProperty("updateRowsCount")]
        public int UpdateRowsCount { get; set; }

        [JsonProperty("errorRowsCount")]
        public int ErrorRowsCount { get; set; }

        [JsonProperty("rows")]
        public List<DrugReferenceImportRow> Rows { get; set; }

        public DrugReferenceImportPreviewResult()
        {
            Rows = new List<DrugReferenceImportRow>();
        }
    }

    public class ExpiryReturnableBatch
    {
        [JsonProperty("batchId")]
        public string BatchId { get; set; }

        [JsonProperty("productId")]
        public string ProductId { get; set; }

        [JsonProperty("productName")]
        public string ProductName { get; set; }

        [JsonProperty("barcode")]
        public string Barcode { get; set; }

        [JsonProperty("batchNumber")]
        public string BatchNumber { get; set; }

        [JsonProperty("expiryDate")]
        public string ExpiryDate { get; set; }

        [JsonProperty("daysUntilExpiry")]
        public int DaysUntilExpiry { get; set; }

        [JsonProperty("quantityMilli")]
        public long QuantityMilli { get; set; }

        [JsonProperty("unitCostPiasters")]
        public long UnitCostPiasters { get; set; }

        [JsonProperty("totalCostPiasters")]
        public long TotalCostPiasters { get; set; }

        [JsonProperty("supplierId")]
        public string SupplierId { get; set; }

        [JsonProperty("supplierName")]
        public string SupplierName { get; set; }

        [JsonProperty("windowDays")]
        public int WindowDays { get; set; }

        [JsonProperty("creditBps")]
        public int CreditBps { get; set; }

        [JsonProperty("estimatedCreditPiasters")]
        public long EstimatedCreditPiasters { get; set; }

        [JsonProperty("unit")]
        public string Unit { get; set; }
    }

    public class BatchExpiryReturnItemRequest
    {
        [JsonProperty("batchId")]
        public string BatchId { get; set; }

        [JsonProperty("quantityMilli")]
        public long QuantityMilli { get; set; }

        [JsonProperty("unitCostPiasters")]
        public long UnitCostPiasters { get; set; }

        [JsonProperty("creditBps")]
        public int CreditBps { get; set; }
    }

    public class BatchExpiryReturnRequest
    {
        [JsonProperty("supplierId")]
        public string SupplierId { get; set; }

        [JsonProperty("items")]
        public List<BatchExpiryReturnItemRequest> Items { get; set; }

        [JsonProperty("notes")]
        public string Notes { get; set; }

        public BatchExpiryReturnRequest()
        {
            Items = new List<BatchExpiryReturnItemRequest>();
        }
    }

    public class ExpiredWriteOffItemRequest
    {
        [JsonProperty("batchId")]
        public string BatchId { get; set; }

        [JsonProperty("quantityMilli")]
        public long QuantityMilli { get; set; }

        [JsonProperty("reason")]
        public string Reason { get; set; }
    }

    public class ExpiredWriteOff
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("writeOffNumber")]
        public string WriteOffNumber { get; set; }

        [JsonProperty("batchId")]
        public string BatchId { get; set; }

        [JsonProperty("productId")]
        public string ProductId { get; set; }

        [JsonProperty("productName")]
        public string ProductName { get; set; }

        [JsonProperty("batchNumber")]
        public string BatchNumber { get; set; }

        [JsonProperty("quantityMilli")]
        public long QuantityMilli { get; set; }

        [JsonProperty("unitCostPiasters")]
        public long UnitCostPiasters { get; set; }

        [JsonProperty("totalCostPiasters")]
        public long TotalCostPiasters { get; set; }

        [JsonProperty("reason")]
        public string Reason { get; set; }

        [JsonProperty("committeeMembers")]
        public string CommitteeMembers { get; set; }

        [JsonProperty("notes")]
        public string Notes { get; set; }

        [JsonProperty("createdBy")]
        public string CreatedBy { get; set; }

        [JsonProperty("createdAt")]
        public string CreatedAt { get; set; }
    }

    public class ExpiredWriteOffCertificate
    {
        [JsonProperty("certificateNumber")]
        public string CertificateNumber { get; set; }

        [JsonProperty("date")]
        public string Date { get; set; }

        [JsonProperty("committeeMembers")]
        public string CommitteeMembers { get; set; }

        [JsonProperty("generalNotes")]
        public string GeneralNotes { get; set; }

        [JsonProperty("totalItemsCount")]
        public int TotalItemsCount { get; set; }

        [JsonProperty("totalCostPiasters")]
        public long TotalCostPiasters { get; set; }

        [JsonProperty("items")]
        public List<ExpiredWriteOff> Items { get; set; }

        public ExpiredWriteOffCertificate()
        {
            Items = new List<ExpiredWriteOff>();
        }
    }
}
