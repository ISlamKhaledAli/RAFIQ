using System;
using System.Collections.Generic;
using RafiqPOS.Models;
using RafiqPOS.Repositories;

namespace RafiqPOS.Services
{
    public class StorageLocationService
    {
        private readonly StorageLocationRepository _locationRepo;

        public StorageLocationService(StorageLocationRepository locationRepo)
        {
            _locationRepo = locationRepo;
        }

        public List<StorageLocation> GetAll(bool onlyActive = false)
        {
            return _locationRepo.GetAll(onlyActive);
        }

        public StorageLocation GetById(string id)
        {
            return _locationRepo.GetById(id);
        }

        public StorageLocation GetByCode(string code)
        {
            return _locationRepo.GetByCode(code);
        }

        public StorageLocation Save(StorageLocation location, string userId)
        {
            if (location == null) throw new ArgumentNullException("location");
            if (string.IsNullOrWhiteSpace(location.Code)) throw new ArgumentException("كود الموقع مطلوب.");
            if (string.IsNullOrWhiteSpace(location.Name)) throw new ArgumentException("اسم الموقع مطلوب.");

            return _locationRepo.Save(location, userId);
        }

        public void Delete(string id, string userId)
        {
            _locationRepo.Delete(id, userId);
        }

        public void AssignProduct(string productId, string locationId, bool isColdChain, string userId)
        {
            _locationRepo.AssignProduct(productId, locationId, isColdChain, userId);
        }

        public List<Product> GetProductsByLocation(string locationId)
        {
            return _locationRepo.GetProductsByLocation(locationId);
        }

        public LocationInventoryDraft GetDraftInventory(string locationId)
        {
            var loc = _locationRepo.GetById(locationId);
            if (loc == null)
            {
                throw new ArgumentException("الموقع المحدد غير موجود.");
            }

            var prods = _locationRepo.GetProductsByLocation(locationId);
            var draft = new LocationInventoryDraft();
            draft.LocationId = loc.Id;
            draft.LocationCode = loc.Code;
            draft.LocationName = loc.Name;
            draft.LocationType = loc.Type;
            draft.GeneratedAt = DateTime.UtcNow.ToString("o");
            draft.Items = new List<LocationInventoryDraftItem>();

            for (int i = 0; i < prods.Count; i++)
            {
                var p = prods[i];
                var item = new LocationInventoryDraftItem();
                item.ProductId = p.Id;
                item.Barcode = p.Barcode ?? "";
                item.ProductName = p.Name;
                item.UnitName = p.Unit ?? "piece";
                item.BookStockQuantityMilli = p.StockQuantityMilli;
                item.ActualStockQuantityMilli = null;
                item.DifferenceMilli = 0;
                item.PricePiasters = p.PricePiasters;
                item.CostPiasters = p.CostPiasters;
                item.IsColdChain = p.IsColdChain;
                draft.Items.Add(item);
            }

            return draft;
        }
    }

    public class LocationInventoryDraft
    {
        public string LocationId { get; set; }
        public string LocationCode { get; set; }
        public string LocationName { get; set; }
        public string LocationType { get; set; }
        public string GeneratedAt { get; set; }
        public List<LocationInventoryDraftItem> Items { get; set; }

        public LocationInventoryDraft()
        {
            Items = new List<LocationInventoryDraftItem>();
        }
    }

    public class LocationInventoryDraftItem
    {
        public string ProductId { get; set; }
        public string Barcode { get; set; }
        public string ProductName { get; set; }
        public string UnitName { get; set; }
        public long BookStockQuantityMilli { get; set; }
        public long? ActualStockQuantityMilli { get; set; }
        public long DifferenceMilli { get; set; }
        public long PricePiasters { get; set; }
        public long CostPiasters { get; set; }
        public bool IsColdChain { get; set; }
    }
}
