using System;
using System.Collections.Generic;
using RafiqPOS.Models;
using RafiqPOS.Repositories;

namespace RafiqPOS.Services
{
    public class ProductBatchService
    {
        private readonly ProductBatchRepository _batchRepo;
        private readonly SettingsRepository _settingsRepo;

        public ProductBatchService(ProductBatchRepository batchRepo, SettingsRepository settingsRepo = null)
        {
            if (batchRepo == null) throw new ArgumentNullException("batchRepo");
            _batchRepo = batchRepo;
            _settingsRepo = settingsRepo;
        }

        public List<ProductBatch> GetBatchesByProduct(string productId, bool activeOnly = true)
        {
            if (string.IsNullOrEmpty(productId)) return new List<ProductBatch>();
            return _batchRepo.GetByProductId(productId, activeOnly);
        }

        public List<ProductBatch> GetExpiringBatches(int? daysAhead = null)
        {
            int days = daysAhead.HasValue && daysAhead.Value > 0 ? daysAhead.Value : GetAlertDaysSetting();
            return _batchRepo.GetExpiringBatches(days);
        }

        public List<ProductBatch> GetExpiredBatches()
        {
            return _batchRepo.GetExpiredBatches();
        }

        public BatchSummaryResult GetBatchSummary(int? alertDays = null)
        {
            int days = alertDays.HasValue && alertDays.Value > 0 ? alertDays.Value : GetAlertDaysSetting();
            return _batchRepo.GetBatchSummary(days);
        }

        public ProductBatch SaveBatch(ProductBatch batch)
        {
            if (batch == null) throw new ArgumentNullException("batch");
            return _batchRepo.CreateOrUpdateBatch(batch);
        }

        public void AdjustBatchStock(string batchId, long newQuantityMilli, string reason, string userId)
        {
            if (string.IsNullOrEmpty(batchId)) throw new ArgumentNullException("batchId");
            _batchRepo.AdjustBatchStock(batchId, newQuantityMilli, reason, userId);
        }

        public void DisposeExpiredBatch(string batchId, string reason, string userId)
        {
            if (string.IsNullOrEmpty(batchId)) throw new ArgumentNullException("batchId");
            _batchRepo.DisposeExpiredBatch(batchId, reason, userId);
        }

        private int GetAlertDaysSetting()
        {
            if (_settingsRepo == null) return 30;
            string val = _settingsRepo.Get("expiry_alert_days", "30");
            int parsed;
            if (int.TryParse(val, out parsed) && parsed > 0)
            {
                return parsed;
            }
            return 30;
        }
    }
}
