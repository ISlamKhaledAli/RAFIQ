using System;
using System.Collections.Generic;
using RafiqPOS.Models;
using RafiqPOS.Repositories;

namespace RafiqPOS.Services
{
    public class PurchaseService
    {
        private readonly PurchaseRepository _purchaseRepo;
        private SyncRepository _syncRepo;

        public PurchaseService(PurchaseRepository purchaseRepo)
        {
            _purchaseRepo = purchaseRepo;
        }

        public void SetSyncRepository(SyncRepository syncRepo)
        {
            _syncRepo = syncRepo;
        }

        public Purchase CreatePurchase(Purchase purchase, string costingMethod = "LATEST", string userId = null)
        {
            lock (SaleService.FinancialWriteLock)
            {
                Purchase saved = _purchaseRepo.CreatePurchase(purchase, costingMethod, userId);
                if (_syncRepo != null && saved != null && saved.Items != null)
                {
                    var ids = new List<string>();
                    for (int i = 0; i < saved.Items.Count; i++)
                    {
                        if (!string.IsNullOrEmpty(saved.Items[i].ProductId)) ids.Add(saved.Items[i].ProductId);
                    }
                    _syncRepo.NotifyProductsStockChanged(ids);
                }
                return saved;
            }
        }

        public List<Purchase> GetAll(string supplierId = null, string startDate = null, string endDate = null, int limit = 100, string dateFrom = null, string dateTo = null)
        {
            return _purchaseRepo.GetAll(supplierId, startDate, endDate, limit, dateFrom, dateTo);
        }

        public Purchase GetById(string id)
        {
            return _purchaseRepo.GetById(id);
        }

        public PurchaseReturn CreatePurchaseReturn(PurchaseReturn returnDoc, string userId = null)
        {
            lock (SaleService.FinancialWriteLock)
            {
                PurchaseReturn saved = _purchaseRepo.CreatePurchaseReturn(returnDoc, userId);
                if (_syncRepo != null && saved != null && saved.Items != null)
                {
                    var ids = new List<string>();
                    for (int i = 0; i < saved.Items.Count; i++)
                    {
                        if (!string.IsNullOrEmpty(saved.Items[i].ProductId)) ids.Add(saved.Items[i].ProductId);
                    }
                    _syncRepo.NotifyProductsStockChanged(ids);
                }
                return saved;
            }
        }

        public List<PurchaseReturn> GetReturns(string supplierId = null, int limit = 50)
        {
            return _purchaseRepo.GetReturns(supplierId, limit);
        }

        public PurchaseReturn GetReturnById(string id)
        {
            return _purchaseRepo.GetReturnById(id);
        }
    }
}
