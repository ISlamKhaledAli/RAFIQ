using System;
using System.Collections.Generic;
using RafiqPOS.Models;
using RafiqPOS.Repositories;

namespace RafiqPOS.Services
{
    public class HeldSaleService
    {
        private readonly HeldSaleRepository _heldRepo;

        public HeldSaleService(HeldSaleRepository heldRepo)
        {
            _heldRepo = heldRepo;
        }

        public HeldSale HoldSale(HeldSale heldSale)
        {
            if (heldSale == null) throw new ArgumentNullException("heldSale");
            if (string.IsNullOrEmpty(heldSale.HoldLabel))
            {
                heldSale.HoldLabel = "معلقة " + DateTime.Now.ToString("HH:mm");
            }
            return _heldRepo.SaveHeldSale(heldSale);
        }

        public List<HeldSale> GetHeldSales()
        {
            return _heldRepo.GetHeldSales();
        }

        public HeldSale GetHeldSaleById(string id)
        {
            return _heldRepo.GetHeldSaleById(id);
        }

        public HeldSale RecallHeldSale(string id)
        {
            if (string.IsNullOrEmpty(id)) return null;
            var held = _heldRepo.GetHeldSaleById(id);
            if (held != null)
            {
                // Delete from held table upon recall
                _heldRepo.DeleteHeldSale(id);
            }
            return held;
        }

        public bool DeleteHeldSale(string id)
        {
            return _heldRepo.DeleteHeldSale(id);
        }

        public int CleanupOldHeldSales(int retentionDays = 7)
        {
            return _heldRepo.CleanupOldHeldSales(retentionDays);
        }
    }
}
