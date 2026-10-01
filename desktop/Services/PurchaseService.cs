using System;
using System.Collections.Generic;
using RafiqPOS.Models;
using RafiqPOS.Repositories;

namespace RafiqPOS.Services
{
    public class PurchaseService
    {
        private readonly PurchaseRepository _purchaseRepo;

        public PurchaseService(PurchaseRepository purchaseRepo)
        {
            _purchaseRepo = purchaseRepo;
        }

        public Purchase CreatePurchase(Purchase purchase, string costingMethod = "LATEST", string userId = null)
        {
            return _purchaseRepo.CreatePurchase(purchase, costingMethod, userId);
        }

        public List<Purchase> GetAll(string supplierId = null, string startDate = null, string endDate = null, int limit = 100)
        {
            return _purchaseRepo.GetAll(supplierId, startDate, endDate, limit);
        }

        public Purchase GetById(string id)
        {
            return _purchaseRepo.GetById(id);
        }
    }
}
