using System;
using System.Collections.Generic;
using RafiqPOS.Models;
using System.IO;
using RafiqPOS.Common;
using RafiqPOS.Repositories;

namespace RafiqPOS.Services
{
    public class DrugReferenceService
    {
        private readonly DrugReferenceRepository _repo;
        private readonly ExcelService _excelService;
        private readonly PurchaseRepository _purchaseRepo;
        private readonly ProductBatchRepository _batchRepo;

        public DrugReferenceService(
            DrugReferenceRepository repo,
            ExcelService excelService,
            PurchaseRepository purchaseRepo = null,
            ProductBatchRepository batchRepo = null)
        {
            if (repo == null) throw new ArgumentNullException("repo");
            _repo = repo;
            _excelService = excelService ?? new ExcelService();
            _purchaseRepo = purchaseRepo;
            _batchRepo = batchRepo;
        }

        public DrugReference GetByBarcode(string barcode)
        {
            return _repo.GetByBarcode(barcode);
        }

        public List<DrugReference> Search(string query, int limit = 50, int offset = 0)
        {
            return _repo.Search(query, limit, offset);
        }

        public int GetSearchCount(string query)
        {
            return _repo.GetSearchCount(query);
        }

        public int GetTotalCount()
        {
            return _repo.GetTotalCount();
        }

        public string GenerateTemplate()
        {
            return _excelService.GenerateDrugReferenceTemplate();
        }

        public DrugReferenceImportPreviewResult PreviewImport(string base64)
        {
            return _excelService.ParseDrugReferenceImportBase64(base64, _repo);
        }

        public string FindBuiltinCatalogPath()
        {
            try
            {
                string baseDir = AppDomain.CurrentDomain.BaseDirectory;
                string[] candidates = new string[]
                {
                    Path.Combine(baseDir, "dist", "دليل_الأدوية_المصرية_الشامل.xlsx"),
                    Path.Combine(baseDir, "دليل_الأدوية_المصرية_الشامل.xlsx"),
                    Path.Combine(baseDir, "..", "..", "frontend", "public", "دليل_الأدوية_المصرية_الشامل.xlsx"),
                    Path.Combine(baseDir, "..", "..", "frontend", "dist", "دليل_الأدوية_المصرية_الشامل.xlsx")
                };
                for (int i = 0; i < candidates.Length; i++)
                {
                    if (File.Exists(candidates[i]))
                    {
                        return Path.GetFullPath(candidates[i]);
                    }
                }
            }
            catch (Exception ex)
            {
                Logger.Error("خطأ أثناء البحث عن مسار الدليل الشامل المدمج: ", ex);
            }
            return null;
        }

        public DrugReferenceImportPreviewResult PreviewImportFile(string filePath)
        {
            return _excelService.ParseDrugReferenceImportFile(filePath, _repo);
        }

        public int ConfirmImportFromFile(string filePath, string source, string userId)
        {
            var preview = _excelService.ParseDrugReferenceImportFile(filePath, _repo);
            if (preview == null || preview.Rows == null || preview.Rows.Count == 0)
            {
                return 0;
            }

            var items = new List<DrugReference>();
            for (int i = 0; i < preview.Rows.Count; i++)
            {
                var row = preview.Rows[i];
                if (row != null && row.Status != "ERROR")
                {
                    items.Add(new DrugReference
                    {
                        Barcode = row.Barcode,
                        TradeName = row.TradeName,
                        ScientificName = row.ScientificName,
                        Form = row.Form,
                        Strength = row.Strength,
                        Manufacturer = row.Manufacturer,
                        PackDesc = row.PackDesc,
                        PublicPricePiasters = row.PublicPricePiasters,
                        TherapeuticClass = row.TherapeuticClass,
                        Category = row.Category,
                        StorageLocation = row.StorageLocation,
                        IsRefrigerated = row.IsRefrigerated,
                        Route = row.Route,
                        PregnancyCategory = row.PregnancyCategory,
                        IsAntibiotic = row.IsAntibiotic,
                        RxStatus = row.RxStatus,
                        FlavorForm = row.FlavorForm,
                        PiecesPerPack = row.PiecesPerPack
                    });
                }
            }

            return _repo.BulkInsertOrUpdate(items, source, userId);
        }

        public int ConfirmImport(List<DrugReference> items, string source, string userId)
        {
            return _repo.BulkInsertOrUpdate(items, source, userId);
        }

        public void ClearAll(string userId)
        {
            _repo.ClearAll(userId);
        }

        public List<ExpiryReturnableBatch> GetExpiryReturnableBatches(string supplierId = null, int? windowDays = null)
        {
            return _repo.GetExpiryReturnableBatches(supplierId, windowDays);
        }

        public List<ExpiryReturnableBatch> GetExpiredBatches()
        {
            return _repo.GetExpiredBatches();
        }

        public PurchaseReturn CreateExpiryPurchaseReturn(BatchExpiryReturnRequest request, string userId)
        {
            if (request == null) throw new ArgumentNullException("request");
            if (string.IsNullOrWhiteSpace(request.SupplierId))
                throw new ArgumentException("المورد مطلوب لإنشاء مرتجع مشتريات.");
            if (request.Items == null || request.Items.Count == 0)
                throw new ArgumentException("يجب اختيار صنف واحد على الأقل للمرتجع.");
            if (_purchaseRepo == null)
                throw new InvalidOperationException("خدمة المشتريات غير مهيأة.");

            var returnDoc = new PurchaseReturn
            {
                SupplierId = request.SupplierId,
                ReturnDate = DateTime.Now.ToString("yyyy-MM-dd"),
                Notes = "مرتجع أدوية منتهية أو قريبة الصلاحية: " + (request.Notes ?? ""),
                Items = new List<PurchaseReturnItem>()
            };

            for (int i = 0; i < request.Items.Count; i++)
            {
                var reqItem = request.Items[i];
                if (reqItem == null || string.IsNullOrWhiteSpace(reqItem.BatchId)) continue;
                if (reqItem.QuantityMilli <= 0) continue;

                ProductBatch batch = null;
                if (_batchRepo != null)
                {
                    batch = _batchRepo.GetById(reqItem.BatchId);
                }

                if (batch == null)
                {
                    throw new InvalidOperationException("التشغيلة المحددة غير موجودة: " + reqItem.BatchId);
                }

                // If creditBps is provided, calculate the actual credit unit cost
                long effectiveUnitCost = reqItem.UnitCostPiasters > 0 ? reqItem.UnitCostPiasters : batch.CostPricePiasters;
                if (reqItem.CreditBps > 0 && reqItem.CreditBps < 10000)
                {
                    effectiveUnitCost = (long)Math.Round((double)effectiveUnitCost * (double)reqItem.CreditBps / 10000.0);
                }

                returnDoc.Items.Add(new PurchaseReturnItem
                {
                    ProductId = batch.ProductId,
                    BatchNumber = batch.BatchNumber,
                    QuantityMilli = reqItem.QuantityMilli,
                    UnitCostPiasters = effectiveUnitCost,
                    Reason = "إرجاع صلاحية للمورد"
                });
            }

            return _purchaseRepo.CreatePurchaseReturn(returnDoc, userId);
        }

        public ExpiredWriteOffCertificate WriteOffExpiredBatches(
            List<ExpiredWriteOffItemRequest> items,
            string committeeMembers,
            string generalNotes,
            string userId)
        {
            return _repo.WriteOffExpiredBatches(items, committeeMembers, generalNotes, userId);
        }

        public List<ExpiredWriteOff> GetExpiredWriteOffs(string fromDate = null, string toDate = null)
        {
            return _repo.GetExpiredWriteOffs(fromDate, toDate);
        }
    }
}
