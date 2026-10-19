using System;
using System.Collections.Generic;
using RafiqPOS.Models;
using RafiqPOS.Repositories;

namespace RafiqPOS.Services
{
    public class SupplierService
    {
        private readonly SupplierRepository _supplierRepo;

        public SupplierService(SupplierRepository supplierRepo)
        {
            _supplierRepo = supplierRepo;
        }

        public List<Supplier> GetAll(bool includeInactive = false)
        {
            return _supplierRepo.GetAll(includeInactive);
        }

        public Supplier GetById(string id)
        {
            return _supplierRepo.GetById(id);
        }

        public Supplier Save(Supplier supplier, string userId = null)
        {
            return _supplierRepo.Save(supplier, userId);
        }

        public bool Archive(string id, string userId = null)
        {
            return _supplierRepo.Archive(id, userId);
        }

        public bool Restore(string id, string userId = null)
        {
            return _supplierRepo.Restore(id, userId);
        }

        public bool Delete(string id, string userId = null)
        {
            return _supplierRepo.Delete(id, userId);
        }

        public void RecordPayment(string supplierId, long amountPiasters, string notes, string userId = null, string paymentSource = "cash_drawer")
        {
            lock (SaleService.FinancialWriteLock)
            {
                _supplierRepo.RecordPayment(supplierId, amountPiasters, notes, userId, paymentSource);
            }
        }

        public void CancelPayment(string supplierId, string transactionId, string reason, string userId = null)
        {
            lock (SaleService.FinancialWriteLock)
            {
                _supplierRepo.CancelPayment(supplierId, transactionId, reason, userId);
            }
        }

        public List<SupplierTransaction> GetTransactions(string supplierId, int limit = 50)
        {
            return _supplierRepo.GetTransactions(supplierId, limit);
        }

        public SupplierBalanceVerification VerifyBalance(string supplierId)
        {
            return _supplierRepo.VerifyBalance(supplierId);
        }

        public Supplier RecalculateAndFixBalance(string supplierId, string userId = null)
        {
            lock (SaleService.FinancialWriteLock)
            {
                return _supplierRepo.RecalculateAndFixBalance(supplierId, userId);
            }
        }

        public List<SupplierBalanceVerification> CheckDiscrepancies()
        {
            return _supplierRepo.CheckDiscrepancies();
        }
    }
}
