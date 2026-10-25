using System;
using System.Collections.Generic;
using Newtonsoft.Json;

namespace RafiqPOS.Models
{
    /// <summary>
    /// الشكل الصيدلاني (Dosage Form)
    /// </summary>
    public class PharmaDosageForm
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("nameAr")]
        public string NameAr { get; set; }

        [JsonProperty("nameEn")]
        public string NameEn { get; set; }

        [JsonProperty("code")]
        public string Code { get; set; }

        [JsonProperty("isActive")]
        public bool IsActive { get; set; }

        public PharmaDosageForm()
        {
            Id = Guid.NewGuid().ToString();
            IsActive = true;
        }
    }

    /// <summary>
    /// الشركة المصنعة للأدوية (Pharma Manufacturer)
    /// </summary>
    public class PharmaManufacturer
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("nameAr")]
        public string NameAr { get; set; }

        [JsonProperty("nameEn")]
        public string NameEn { get; set; }

        [JsonProperty("country")]
        public string Country { get; set; }

        [JsonProperty("isActive")]
        public bool IsActive { get; set; }

        public PharmaManufacturer()
        {
            Id = Guid.NewGuid().ToString();
            IsActive = true;
        }
    }

    /// <summary>
    /// التصنيف العلاجي (Therapeutic Class)
    /// </summary>
    public class TherapeuticClass
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("nameAr")]
        public string NameAr { get; set; }

        [JsonProperty("nameEn")]
        public string NameEn { get; set; }

        [JsonProperty("code")]
        public string Code { get; set; }

        [JsonProperty("description")]
        public string Description { get; set; }

        [JsonProperty("isActive")]
        public bool IsActive { get; set; }

        public TherapeuticClass()
        {
            Id = Guid.NewGuid().ToString();
            IsActive = true;
        }
    }

    /// <summary>
    /// المادة الفعالة (Active Ingredient)
    /// </summary>
    public class ActiveIngredient
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("nameEn")]
        public string NameEn { get; set; }

        [JsonProperty("nameAr")]
        public string NameAr { get; set; }

        [JsonProperty("normalizedName")]
        public string NormalizedName { get; set; }

        [JsonProperty("isActive")]
        public bool IsActive { get; set; }

        public ActiveIngredient()
        {
            Id = Guid.NewGuid().ToString();
            IsActive = true;
        }
    }

    /// <summary>
    /// مادة فعالة مرتبطة بمنتج مع تركيزها
    /// </summary>
    public class ProductIngredientDto
    {
        [JsonProperty("ingredientId")]
        public string IngredientId { get; set; }

        [JsonProperty("ingredientNameEn")]
        public string IngredientNameEn { get; set; }

        [JsonProperty("ingredientNameAr")]
        public string IngredientNameAr { get; set; }

        /// <summary>
        /// التركيز بالأرقام الصحيحة مقاساً بالميكرو (مثال: 500mg = 500,000 micro)
        /// </summary>
        [JsonProperty("strengthValueMicro")]
        public int StrengthValueMicro { get; set; }

        [JsonProperty("strengthUnit")]
        public string StrengthUnit { get; set; }

        public ProductIngredientDto()
        {
            StrengthUnit = "mg";
        }
    }

    /// <summary>
    /// الملف الدوائي الممتد للصنف (Product Pharma Info) - Story 130 / Feature #187
    /// </summary>
    public class ProductPharmaInfo
    {
        [JsonProperty("productId")]
        public string ProductId { get; set; }

        [JsonProperty("scientificName")]
        public string ScientificName { get; set; }

        [JsonProperty("normalizedScientificName")]
        public string NormalizedScientificName { get; set; }

        [JsonProperty("dosageFormId")]
        public string DosageFormId { get; set; }

        [JsonProperty("dosageFormName")]
        public string DosageFormName { get; set; }

        [JsonProperty("strengthText")]
        public string StrengthText { get; set; }

        [JsonProperty("route")]
        public string Route { get; set; }

        [JsonProperty("manufacturerId")]
        public string ManufacturerId { get; set; }

        [JsonProperty("manufacturerName")]
        public string ManufacturerName { get; set; }

        [JsonProperty("registrationNo")]
        public string RegistrationNo { get; set; }

        [JsonProperty("rxStatus")]
        public string RxStatus { get; set; } // "otc", "rx", "controlled"

        [JsonProperty("controlledSchedule")]
        public string ControlledSchedule { get; set; }

        [JsonProperty("storageCondition")]
        public string StorageCondition { get; set; } // "room", "fridge", "freezer"

        [JsonProperty("usageNotes")]
        public string UsageNotes { get; set; }

        [JsonProperty("therapeuticClassId")]
        public string TherapeuticClassId { get; set; }

        [JsonProperty("therapeuticClassName")]
        public string TherapeuticClassName { get; set; }

        [JsonProperty("ingredients")]
        public List<ProductIngredientDto> Ingredients { get; set; }

        [JsonProperty("createdAt")]
        public string CreatedAt { get; set; }

        [JsonProperty("updatedAt")]
        public string UpdatedAt { get; set; }

        public ProductPharmaInfo()
        {
            RxStatus = "otc";
            StorageCondition = "room";
            Ingredients = new List<ProductIngredientDto>();
            CreatedAt = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss");
        }
    }

    /// <summary>
    /// صنف بديل أو مثيل مرشح للاستبدال
    /// </summary>
    public class DrugAlternativeItem
    {
        [JsonProperty("productId")]
        public string ProductId { get; set; }

        [JsonProperty("name")]
        public string Name { get; set; }

        [JsonProperty("barcode")]
        public string Barcode { get; set; }

        [JsonProperty("scientificName")]
        public string ScientificName { get; set; }

        [JsonProperty("dosageFormName")]
        public string DosageFormName { get; set; }

        [JsonProperty("strengthText")]
        public string StrengthText { get; set; }

        [JsonProperty("manufacturerName")]
        public string ManufacturerName { get; set; }

        [JsonProperty("pricePiasters")]
        public long PricePiasters { get; set; }

        [JsonProperty("stockQuantityMilli")]
        public int StockQuantityMilli { get; set; }

        [JsonProperty("compoundStockDisplay")]
        public string CompoundStockDisplay { get; set; }

        [JsonProperty("matchTier")]
        public int MatchTier { get; set; } // 1: Exact Generic, 2: Diff Form, 3: Diff Strength, 4: Therapeutic

        [JsonProperty("tierDescription")]
        public string TierDescription { get; set; }

        [JsonProperty("nearestExpiryDate")]
        public string NearestExpiryDate { get; set; }

        [JsonProperty("priceDifferencePiasters")]
        public long PriceDifferencePiasters { get; set; }

        [JsonProperty("isColdChain")]
        public bool IsColdChain { get; set; }
    }

    /// <summary>
    /// نتيجة محرك البدائل والمثائل مقسمة إلى المستويات الأربعة
    /// </summary>
    public class DrugAlternativesResult
    {
        [JsonProperty("originalProductId")]
        public string OriginalProductId { get; set; }

        [JsonProperty("originalProductName")]
        public string OriginalProductName { get; set; }

        [JsonProperty("originalScientificName")]
        public string OriginalScientificName { get; set; }

        [JsonProperty("originalPricePiasters")]
        public long OriginalPricePiasters { get; set; }

        [JsonProperty("exactGenerics")]
        public List<DrugAlternativeItem> ExactGenerics { get; set; }

        [JsonProperty("differentForms")]
        public List<DrugAlternativeItem> DifferentForms { get; set; }

        [JsonProperty("differentStrengths")]
        public List<DrugAlternativeItem> DifferentStrengths { get; set; }

        [JsonProperty("therapeuticAlternatives")]
        public List<DrugAlternativeItem> TherapeuticAlternatives { get; set; }

        // TypeScript Contract Aliases (Frontend Compatibility)
        [JsonProperty("tier1IdenticalGenerics")]
        public List<DrugAlternativeItem> Tier1IdenticalGenerics { get { return ExactGenerics; } set { ExactGenerics = value; } }

        [JsonProperty("tier2DifferentForms")]
        public List<DrugAlternativeItem> Tier2DifferentForms { get { return DifferentForms; } set { DifferentForms = value; } }

        [JsonProperty("tier3DifferentStrengths")]
        public List<DrugAlternativeItem> Tier3DifferentStrengths { get { return DifferentStrengths; } set { DifferentStrengths = value; } }

        [JsonProperty("tier4TherapeuticAlternatives")]
        public List<DrugAlternativeItem> Tier4TherapeuticAlternatives { get { return TherapeuticAlternatives; } set { TherapeuticAlternatives = value; } }

        public DrugAlternativesResult()
        {
            ExactGenerics = new List<DrugAlternativeItem>();
            DifferentForms = new List<DrugAlternativeItem>();
            DifferentStrengths = new List<DrugAlternativeItem>();
            TherapeuticAlternatives = new List<DrugAlternativeItem>();
        }
    }

    /// <summary>
    /// قيد صرف / مرتجع دواء جدول رقابة دوائية (Story 131 / Feature #188)
    /// </summary>
    public class ControlledDrugDispense
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("saleId")]
        public string SaleId { get; set; }

        [JsonProperty("saleItemId")]
        public string SaleItemId { get; set; }

        [JsonProperty("productId")]
        public string ProductId { get; set; }

        [JsonProperty("productName")]
        public string ProductName { get; set; }

        [JsonProperty("batchId")]
        public string BatchId { get; set; }

        [JsonProperty("batchNumber")]
        public string BatchNumber { get; set; }

        [JsonProperty("quantityMilli")]
        public long QuantityMilli { get; set; }

        [JsonProperty("patientName")]
        public string PatientName { get; set; }

        [JsonProperty("patientNationalId")]
        public string PatientNationalId { get; set; }

        [JsonProperty("patientNationalIdMasked")]
        public string PatientNationalIdMasked { get; set; }

        [JsonProperty("patientPhone")]
        public string PatientPhone { get; set; }

        [JsonProperty("patientAddress")]
        public string PatientAddress { get; set; }

        [JsonProperty("doctorName")]
        public string DoctorName { get; set; }

        [JsonProperty("doctorLicenseNo")]
        public string DoctorLicenseNo { get; set; }

        [JsonProperty("prescriptionNo")]
        public string PrescriptionNo { get; set; }

        [JsonProperty("prescriptionDate")]
        public string PrescriptionDate { get; set; }

        [JsonProperty("prescriptionId")]
        public string PrescriptionId { get; set; }

        [JsonProperty("entryType")]
        public string EntryType { get; set; } // "dispense", "return", "correction"

        [JsonProperty("originalDispenseId")]
        public string OriginalDispenseId { get; set; }

        [JsonProperty("reason")]
        public string Reason { get; set; }

        [JsonProperty("dispensedBy")]
        public string DispensedBy { get; set; }

        [JsonProperty("dispensedByName")]
        public string DispensedByName { get; set; }

        [JsonProperty("approvedBy")]
        public string ApprovedBy { get; set; }

        [JsonProperty("approvedByName")]
        public string ApprovedByName { get; set; }

        [JsonProperty("notes")]
        public string Notes { get; set; }

        [JsonProperty("createdAt")]
        public string CreatedAt { get; set; }

        public ControlledDrugDispense()
        {
            Id = Guid.NewGuid().ToString();
            EntryType = "dispense";
            QuantityMilli = 1000;
            CreatedAt = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss");
        }
    }

    /// <summary>
    /// سجل الروشتة الطبية وأرشيف الصور (Story 131 / Feature #188)
    /// </summary>
    public class Prescription
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("customerId")]
        public string CustomerId { get; set; }

        [JsonProperty("patientName")]
        public string PatientName { get; set; }

        [JsonProperty("patientPhone")]
        public string PatientPhone { get; set; }

        [JsonProperty("patientNationalId")]
        public string PatientNationalId { get; set; }

        [JsonProperty("doctorName")]
        public string DoctorName { get; set; }

        [JsonProperty("clinic")]
        public string Clinic { get; set; }

        [JsonProperty("prescriptionNo")]
        public string PrescriptionNo { get; set; }

        [JsonProperty("prescriptionDate")]
        public string PrescriptionDate { get; set; }

        [JsonProperty("notes")]
        public string Notes { get; set; }

        [JsonProperty("imagePath")]
        public string ImagePath { get; set; }

        [JsonProperty("createdBy")]
        public string CreatedBy { get; set; }

        [JsonProperty("createdAt")]
        public string CreatedAt { get; set; }

        [JsonProperty("updatedAt")]
        public string UpdatedAt { get; set; }

        public Prescription()
        {
            Id = Guid.NewGuid().ToString();
            CreatedAt = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss");
        }
    }

    /// <summary>
    /// سطر تقرير دفتر التفتيش الصيدلي الرسمي A4 (Story 131 / Task 188-7)
    /// </summary>
    public class ControlledInspectionReportRow
    {
        [JsonProperty("date")]
        public string Date { get; set; }

        [JsonProperty("transactionType")]
        public string TransactionType { get; set; }

        [JsonProperty("transactionTypeAr")]
        public string TransactionTypeAr { get; set; }

        [JsonProperty("documentRefNo")]
        public string DocumentRefNo { get; set; }

        [JsonProperty("supplierOrPatientName")]
        public string SupplierOrPatientName { get; set; }

        [JsonProperty("patientNationalIdMasked")]
        public string PatientNationalIdMasked { get; set; }

        [JsonProperty("doctorName")]
        public string DoctorName { get; set; }

        [JsonProperty("doctorLicenseNo")]
        public string DoctorLicenseNo { get; set; }

        [JsonProperty("prescriptionNo")]
        public string PrescriptionNo { get; set; }

        [JsonProperty("prescriptionDate")]
        public string PrescriptionDate { get; set; }

        [JsonProperty("batchNumber")]
        public string BatchNumber { get; set; }

        [JsonProperty("inflowQtyMilli")]
        public long InflowQtyMilli { get; set; }

        [JsonProperty("outflowQtyMilli")]
        public long OutflowQtyMilli { get; set; }

        [JsonProperty("runningBalanceMilli")]
        public long RunningBalanceMilli { get; set; }

        [JsonProperty("dispensedBy")]
        public string DispensedBy { get; set; }

        [JsonProperty("approvedBy")]
        public string ApprovedBy { get; set; }

        [JsonProperty("notes")]
        public string Notes { get; set; }
    }

    /// <summary>
    /// تفصيل تشغيلة في خريطة الصلاحيات الشهرية
    /// </summary>
    public class PharmaExpiryBatchDetail
    {
        [JsonProperty("batchId")]
        public string BatchId { get; set; }

        [JsonProperty("productId")]
        public string ProductId { get; set; }

        [JsonProperty("productName")]
        public string ProductName { get; set; }

        [JsonProperty("scientificName")]
        public string ScientificName { get; set; }

        [JsonProperty("batchNumber")]
        public string BatchNumber { get; set; }

        [JsonProperty("expiryDate")]
        public string ExpiryDate { get; set; }

        [JsonProperty("quantityMilli")]
        public long QuantityMilli { get; set; }

        [JsonProperty("costPricePiasters")]
        public long CostPricePiasters { get; set; }

        [JsonProperty("totalCostPiasters")]
        public long TotalCostPiasters { get; set; }

        [JsonProperty("retailPricePiasters")]
        public long RetailPricePiasters { get; set; }

        [JsonProperty("totalRetailPiasters")]
        public long TotalRetailPiasters { get; set; }

        [JsonProperty("locationCode")]
        public string LocationCode { get; set; }

        [JsonProperty("daysRemaining")]
        public int DaysRemaining { get; set; }

        [JsonProperty("status")]
        public string Status { get; set; }
    }

    /// <summary>
    /// تجميعة شهر في خريطة الصلاحيات
    /// </summary>
    public class PharmaExpiryMonthBucket
    {
        [JsonProperty("monthKey")]
        public string MonthKey { get; set; } // YYYY-MM or 'EXPIRED'

        [JsonProperty("monthLabel")]
        public string MonthLabel { get; set; }

        [JsonProperty("batchCount")]
        public int BatchCount { get; set; }

        [JsonProperty("productCount")]
        public int ProductCount { get; set; }

        [JsonProperty("totalQuantityMilli")]
        public long TotalQuantityMilli { get; set; }

        [JsonProperty("totalCostPiasters")]
        public long TotalCostPiasters { get; set; }

        [JsonProperty("totalRetailPiasters")]
        public long TotalRetailPiasters { get; set; }

        [JsonProperty("isExpired")]
        public bool IsExpired { get; set; }

        [JsonProperty("isUrgent")]
        public bool IsUrgent { get; set; }

        [JsonProperty("batches")]
        public List<PharmaExpiryBatchDetail> Batches { get; set; }

        public PharmaExpiryMonthBucket()
        {
            Batches = new List<PharmaExpiryBatchDetail>();
        }
    }

    /// <summary>
    /// تقرير خريطة الصلاحيات الشهرية المتكامل برأس المال
    /// </summary>
    public class PharmaExpiryHeatmapReport
    {
        [JsonProperty("generatedAt")]
        public string GeneratedAt { get; set; }

        [JsonProperty("totalBatchesCount")]
        public int TotalBatchesCount { get; set; }

        [JsonProperty("totalExpiredBatchesCount")]
        public int TotalExpiredBatchesCount { get; set; }

        [JsonProperty("totalExpiringSoonBatchesCount")]
        public int TotalExpiringSoonBatchesCount { get; set; }

        [JsonProperty("totalCapitalAtRiskPiasters")]
        public long TotalCapitalAtRiskPiasters { get; set; }

        [JsonProperty("totalExpiredCapitalPiasters")]
        public long TotalExpiredCapitalPiasters { get; set; }

        [JsonProperty("totalInventoryCostPiasters")]
        public long TotalInventoryCostPiasters { get; set; }

        [JsonProperty("monthBuckets")]
        public List<PharmaExpiryMonthBucket> MonthBuckets { get; set; }

        public PharmaExpiryHeatmapReport()
        {
            MonthBuckets = new List<PharmaExpiryMonthBucket>();
        }
    }

    /// <summary>
    /// بند الدواء الراكد
    /// </summary>
    public class PharmaStagnantDrugItem
    {
        [JsonProperty("productId")]
        public string ProductId { get; set; }

        [JsonProperty("productName")]
        public string ProductName { get; set; }

        [JsonProperty("barcode")]
        public string Barcode { get; set; }

        [JsonProperty("scientificName")]
        public string ScientificName { get; set; }

        [JsonProperty("dosageForm")]
        public string DosageForm { get; set; }

        [JsonProperty("manufacturerName")]
        public string ManufacturerName { get; set; }

        [JsonProperty("stockQuantityMilli")]
        public long StockQuantityMilli { get; set; }

        [JsonProperty("mixedStockDisplay")]
        public string MixedStockDisplay { get; set; }

        [JsonProperty("costPricePiasters")]
        public long CostPricePiasters { get; set; }

        [JsonProperty("totalCostPiasters")]
        public long TotalCostPiasters { get; set; }

        [JsonProperty("sellPricePiasters")]
        public long SellPricePiasters { get; set; }

        [JsonProperty("closestExpiryDate")]
        public string ClosestExpiryDate { get; set; }

        [JsonProperty("closestBatchNumber")]
        public string ClosestBatchNumber { get; set; }

        [JsonProperty("locationCode")]
        public string LocationCode { get; set; }

        [JsonProperty("lastSaleDate")]
        public string LastSaleDate { get; set; }

        [JsonProperty("daysWithoutSale")]
        public int DaysWithoutSale { get; set; }

        [JsonProperty("daysSinceRegistration")]
        public int DaysSinceRegistration { get; set; }
    }

    /// <summary>
    /// تقرير الأدوية والأصناف الراكدة
    /// </summary>
    public class PharmaStagnantDrugsReport
    {
        [JsonProperty("generatedAt")]
        public string GeneratedAt { get; set; }

        [JsonProperty("thresholdDays")]
        public int ThresholdDays { get; set; }

        [JsonProperty("totalStagnantCount")]
        public int TotalStagnantCount { get; set; }

        [JsonProperty("totalTiedCapitalPiasters")]
        public long TotalTiedCapitalPiasters { get; set; }

        [JsonProperty("items")]
        public List<PharmaStagnantDrugItem> Items { get; set; }

        public PharmaStagnantDrugsReport()
        {
            Items = new List<PharmaStagnantDrugItem>();
        }
    }

    /// <summary>
    /// بند ربحية الشركة المصنعة للأدوية
    /// </summary>
    public class PharmaManufacturerProfitItem
    {
        [JsonProperty("manufacturerId")]
        public string ManufacturerId { get; set; }

        [JsonProperty("manufacturerName")]
        public string ManufacturerName { get; set; }

        [JsonProperty("country")]
        public string Country { get; set; }

        [JsonProperty("productsCount")]
        public int ProductsCount { get; set; }

        [JsonProperty("invoicesCount")]
        public int InvoicesCount { get; set; }

        [JsonProperty("quantitySoldMilli")]
        public long QuantitySoldMilli { get; set; }

        [JsonProperty("totalSalesPiasters")]
        public long TotalSalesPiasters { get; set; }

        [JsonProperty("totalCostPiasters")]
        public long TotalCostPiasters { get; set; }

        [JsonProperty("grossProfitPiasters")]
        public long GrossProfitPiasters { get; set; }

        [JsonProperty("profitMarginBps")]
        public int ProfitMarginBps { get; set; } // 2500 = 25.00%
    }

    /// <summary>
    /// بند ربحية المادة الفعالة
    /// </summary>
    public class PharmaIngredientProfitItem
    {
        [JsonProperty("ingredientId")]
        public string IngredientId { get; set; }

        [JsonProperty("ingredientNameEn")]
        public string IngredientNameEn { get; set; }

        [JsonProperty("ingredientNameAr")]
        public string IngredientNameAr { get; set; }

        [JsonProperty("productsCount")]
        public int ProductsCount { get; set; }

        [JsonProperty("invoicesCount")]
        public int InvoicesCount { get; set; }

        [JsonProperty("quantitySoldMilli")]
        public long QuantitySoldMilli { get; set; }

        [JsonProperty("totalSalesPiasters")]
        public long TotalSalesPiasters { get; set; }

        [JsonProperty("totalCostPiasters")]
        public long TotalCostPiasters { get; set; }

        [JsonProperty("grossProfitPiasters")]
        public long GrossProfitPiasters { get; set; }

        [JsonProperty("profitMarginBps")]
        public int ProfitMarginBps { get; set; }
    }

    /// <summary>
    /// تقرير أرباح الصيدلية المتخصص بحسب الشركات المصنعة والمواد الفعالة
    /// </summary>
    public class PharmaProfitabilityReport
    {
        [JsonProperty("generatedAt")]
        public string GeneratedAt { get; set; }

        [JsonProperty("period")]
        public string Period { get; set; }

        [JsonProperty("fromDate")]
        public string FromDate { get; set; }

        [JsonProperty("toDate")]
        public string ToDate { get; set; }

        [JsonProperty("totalSalesPiasters")]
        public long TotalSalesPiasters { get; set; }

        [JsonProperty("totalCostPiasters")]
        public long TotalCostPiasters { get; set; }

        [JsonProperty("grossProfitPiasters")]
        public long GrossProfitPiasters { get; set; }

        [JsonProperty("overallMarginBps")]
        public int OverallMarginBps { get; set; }

        [JsonProperty("manufacturers")]
        public List<PharmaManufacturerProfitItem> Manufacturers { get; set; }

        [JsonProperty("activeIngredients")]
        public List<PharmaIngredientProfitItem> ActiveIngredients { get; set; }

        public PharmaProfitabilityReport()
        {
            Manufacturers = new List<PharmaManufacturerProfitItem>();
            ActiveIngredients = new List<PharmaIngredientProfitItem>();
        }
    }

    /// <summary>
    /// طلب طباعة ملصق الجرعة الحراري للعبوات الصيدلانية
    /// </summary>
    public class DosageLabelRequest
    {
        [JsonProperty("patientName")]
        public string PatientName { get; set; }

        [JsonProperty("drugName")]
        public string DrugName { get; set; }

        [JsonProperty("dosageInstructions")]
        public string DosageInstructions { get; set; }

        [JsonProperty("dispenseDate")]
        public string DispenseDate { get; set; }

        [JsonProperty("doctorName")]
        public string DoctorName { get; set; }

        [JsonProperty("pharmacistName")]
        public string PharmacistName { get; set; }

        [JsonProperty("storageCondition")]
        public string StorageCondition { get; set; }

        [JsonProperty("copies")]
        public int Copies { get; set; }

        [JsonProperty("printerName")]
        public string PrinterName { get; set; }

        [JsonProperty("paperWidth")]
        public string PaperWidth { get; set; }

        public DosageLabelRequest()
        {
            Copies = 1;
        }
    }

    /// <summary>
    /// تعريف وحدة تعبئة في نموذج الجرد
    /// </summary>
    public class PharmacyStocktakingUnitDef
    {
        [JsonProperty("unitId")]
        public string UnitId { get; set; }

        [JsonProperty("unitName")]
        public string UnitName { get; set; }

        [JsonProperty("conversionFactor")]
        public int ConversionFactor { get; set; }

        [JsonProperty("isBaseUnit")]
        public bool IsBaseUnit { get; set; }
    }

    /// <summary>
    /// بيانات تشغيلة في نموذج الجرد
    /// </summary>
    public class PharmacyStocktakingBatchItem
    {
        [JsonProperty("batchId")]
        public string BatchId { get; set; }

        [JsonProperty("batchNumber")]
        public string BatchNumber { get; set; }

        [JsonProperty("expiryDate")]
        public string ExpiryDate { get; set; }

        [JsonProperty("bookQuantityMilli")]
        public long BookQuantityMilli { get; set; }

        [JsonProperty("actualQuantityMilli")]
        public long? ActualQuantityMilli { get; set; }

        [JsonProperty("unitCostPiasters")]
        public long UnitCostPiasters { get; set; }

        [JsonProperty("status")]
        public string Status { get; set; }
    }

    /// <summary>
    /// سطر صنف في كشف الجرد الصيدلي
    /// </summary>
    public class PharmacyStocktakingItem
    {
        [JsonProperty("productId")]
        public string ProductId { get; set; }

        [JsonProperty("productName")]
        public string ProductName { get; set; }

        [JsonProperty("barcode")]
        public string Barcode { get; set; }

        [JsonProperty("scientificName")]
        public string ScientificName { get; set; }

        [JsonProperty("dosageForm")]
        public string DosageForm { get; set; }

        [JsonProperty("manufacturerName")]
        public string ManufacturerName { get; set; }

        [JsonProperty("locationId")]
        public string LocationId { get; set; }

        [JsonProperty("locationCode")]
        public string LocationCode { get; set; }

        [JsonProperty("locationName")]
        public string LocationName { get; set; }

        [JsonProperty("costPricePiasters")]
        public long CostPricePiasters { get; set; }

        [JsonProperty("sellPricePiasters")]
        public long SellPricePiasters { get; set; }

        [JsonProperty("bookQuantityMilli")]
        public long BookQuantityMilli { get; set; }

        [JsonProperty("units")]
        public List<PharmacyStocktakingUnitDef> Units { get; set; }

        [JsonProperty("batches")]
        public List<PharmacyStocktakingBatchItem> Batches { get; set; }

        public PharmacyStocktakingItem()
        {
            Units = new List<PharmacyStocktakingUnitDef>();
            Batches = new List<PharmacyStocktakingBatchItem>();
        }
    }

    /// <summary>
    /// كشف الجرد الصيدلي الشامل
    /// </summary>
    public class PharmacyStocktakingSheet
    {
        [JsonProperty("generatedAt")]
        public string GeneratedAt { get; set; }

        [JsonProperty("locationId")]
        public string LocationId { get; set; }

        [JsonProperty("locationName")]
        public string LocationName { get; set; }

        [JsonProperty("manufacturerId")]
        public string ManufacturerId { get; set; }

        [JsonProperty("manufacturerName")]
        public string ManufacturerName { get; set; }

        [JsonProperty("searchQuery")]
        public string SearchQuery { get; set; }

        [JsonProperty("totalItemsCount")]
        public int TotalItemsCount { get; set; }

        [JsonProperty("totalBookCostPiasters")]
        public long TotalBookCostPiasters { get; set; }

        [JsonProperty("items")]
        public List<PharmacyStocktakingItem> Items { get; set; }

        public PharmacyStocktakingSheet()
        {
            Items = new List<PharmacyStocktakingItem>();
        }
    }

    /// <summary>
    /// تعديل سطر في تسوية الجرد الصيدلي
    /// </summary>
    public class PharmacyStocktakingAdjustmentItem
    {
        [JsonProperty("productId")]
        public string ProductId { get; set; }

        [JsonProperty("batchId")]
        public string BatchId { get; set; }

        [JsonProperty("countedQuantityMilli")]
        public long CountedQuantityMilli { get; set; }

        [JsonProperty("reason")]
        public string Reason { get; set; }
    }

    /// <summary>
    /// طلب اعتماد تسوية الجرد الصيدلي
    /// </summary>
    public class PharmacyStocktakingBatchRequest
    {
        [JsonProperty("auditReason")]
        public string AuditReason { get; set; }

        [JsonProperty("locationId")]
        public string LocationId { get; set; }

        [JsonProperty("items")]
        public List<PharmacyStocktakingAdjustmentItem> Items { get; set; }

        public PharmacyStocktakingBatchRequest()
        {
            Items = new List<PharmacyStocktakingAdjustmentItem>();
        }
    }
}
