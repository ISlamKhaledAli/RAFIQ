using System;
using System.Collections.Generic;
using RafiqPOS.Models;
using RafiqPOS.Repositories;

namespace RafiqPOS.Services
{
    public class QuickItemService
    {
        private readonly QuickItemRepository _repo;

        public QuickItemService(QuickItemRepository repo)
        {
            this._repo = repo;
        }

        public List<QuickItem> GetAll()
        {
            return _repo.GetAll();
        }

        public QuickItem GetById(string id)
        {
            return _repo.GetById(id);
        }

        public QuickItem Save(QuickItem item)
        {
            if (item == null)
            {
                throw new ArgumentException("بيانات الصنف السريع غير صالحة");
            }

            if (string.IsNullOrWhiteSpace(item.Name))
            {
                throw new ArgumentException("اسم الصنف السريع مطلوب ولا يمكن أن يكون فارغاً");
            }

            if (item.PricePiasters < 0)
            {
                throw new ArgumentException("سعر الصنف السريع لا يمكن أن يكون سالباً");
            }

            if (string.IsNullOrWhiteSpace(item.CategoryName))
            {
                item.CategoryName = "عام";
            }

            if (string.IsNullOrWhiteSpace(item.Unit))
            {
                item.Unit = "piece";
            }

            return _repo.Save(item);
        }

        public bool Delete(string id)
        {
            if (string.IsNullOrWhiteSpace(id))
            {
                return false;
            }
            return _repo.Delete(id);
        }

        public void Reorder(List<string> orderedIds)
        {
            if (orderedIds == null || orderedIds.Count == 0)
            {
                return;
            }
            _repo.Reorder(orderedIds);
        }
    }
}
