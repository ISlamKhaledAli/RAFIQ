using System;
using System.Collections.Generic;
using RafiqPOS.Models;
using RafiqPOS.Repositories;

namespace RafiqPOS.Services
{
    public class ModifierService
    {
        private readonly ModifierRepository _modifierRepo;

        public ModifierService(ModifierRepository modifierRepo)
        {
            _modifierRepo = modifierRepo;
        }

        public List<ModifierGroup> GetAllGroups(bool includeInactive = false)
        {
            return _modifierRepo.GetAllGroups(includeInactive);
        }

        public List<ModifierGroup> GetGroupsForProduct(string productId)
        {
            return _modifierRepo.GetGroupsForProduct(productId);
        }

        public ModifierOption GetOptionById(string optionId)
        {
            return _modifierRepo.GetOptionById(optionId);
        }

        public ModifierGroup SaveGroup(ModifierGroup group)
        {
            lock (SaleService.FinancialWriteLock)
            {
                return _modifierRepo.SaveGroup(group);
            }
        }

        public bool DeleteGroup(string groupId)
        {
            lock (SaleService.FinancialWriteLock)
            {
                return _modifierRepo.DeleteGroup(groupId);
            }
        }

        public ModifierOption SaveOption(ModifierOption option)
        {
            lock (SaleService.FinancialWriteLock)
            {
                return _modifierRepo.SaveOption(option);
            }
        }

        public bool DeleteOption(string optionId)
        {
            lock (SaleService.FinancialWriteLock)
            {
                return _modifierRepo.DeleteOption(optionId);
            }
        }

        public void LinkProductGroups(string productId, List<string> groupIds)
        {
            lock (SaleService.FinancialWriteLock)
            {
                _modifierRepo.LinkProductGroups(productId, groupIds);
            }
        }
    }
}
