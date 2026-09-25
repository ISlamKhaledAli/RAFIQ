using System;
using System.Collections.Generic;
using RafiqPOS.Models;
using RafiqPOS.Repositories;

namespace RafiqPOS.Services
{
    public class UnitProfitInfo
    {
        public long SellPricePiasters { get; set; }
        public long EffectiveCostPiasters { get; set; }
        public long ProfitPiasters { get; set; }
        public int MarginPercentagePoints { get; set; } // e.g. 25 for 25%
        public string ProfitFormatted { get; set; }
        public string MarginFormatted { get; set; }
    }

    public class ProductUnitService
    {
        private readonly ProductUnitRepository _unitRepo;
        private readonly ProductRepository _prodRepo;

        public ProductUnitService(string connectionString)
        {
            this._unitRepo = new ProductUnitRepository(connectionString);
            this._prodRepo = new ProductRepository(connectionString);
        }

        public List<ProductUnit> GetUnitsForProduct(string productId)
        {
            if (string.IsNullOrWhiteSpace(productId)) return new List<ProductUnit>();
            return _unitRepo.GetByProductId(productId);
        }

        public ProductUnit GetUnitById(string id)
        {
            if (string.IsNullOrWhiteSpace(id)) return null;
            return _unitRepo.GetById(id);
        }

        public ProductUnit GetBaseUnit(string productId)
        {
            if (string.IsNullOrWhiteSpace(productId)) return null;
            return _unitRepo.GetBaseUnit(productId);
        }

        public ProductUnit GetByBarcode(string barcode)
        {
            if (string.IsNullOrWhiteSpace(barcode)) return null;
            return _unitRepo.GetByBarcode(barcode);
        }

        public ProductUnit CreateUnit(ProductUnit unit)
        {
            if (unit == null) throw new ArgumentNullException("unit");

            // 1. Validation
            ValidateUnit(unit, true);

            // 2. Base unit logic
            int existingCount = _unitRepo.GetUnitCountForProduct(unit.ProductId);
            if (existingCount == 0)
            {
                // First unit is always base unit
                unit.IsBaseUnit = true;
                unit.ConversionFactor = 1;
            }
            else if (unit.IsBaseUnit)
            {
                unit.ConversionFactor = 1;
            }

            _unitRepo.Create(unit);
            return _unitRepo.GetById(unit.Id);
        }

        public ProductUnit UpdateUnit(ProductUnit unit)
        {
            if (unit == null) throw new ArgumentNullException("unit");
            if (string.IsNullOrWhiteSpace(unit.Id)) throw new ArgumentException("معرف الوحدة مطلوب");

            var existing = _unitRepo.GetById(unit.Id);
            if (existing == null) throw new InvalidOperationException("الوحدة غير موجودة");

            ValidateUnit(unit, false);

            // If it was the base unit, and trying to unmark base unit without another base unit:
            if (existing.IsBaseUnit && !unit.IsBaseUnit)
            {
                int count = _unitRepo.GetUnitCountForProduct(unit.ProductId);
                if (count <= 1)
                {
                    throw new InvalidOperationException("لا يمكن إلغاء الوحدة الأساسية لأنها الوحدة الوحيدة للمنتج");
                }
            }

            if (unit.IsBaseUnit)
            {
                unit.ConversionFactor = 1;
            }

            _unitRepo.Update(unit);
            return _unitRepo.GetById(unit.Id);
        }

        public void DeleteUnit(string unitId)
        {
            if (string.IsNullOrWhiteSpace(unitId)) throw new ArgumentException("معرف الوحدة مطلوب");

            var unit = _unitRepo.GetById(unitId);
            if (unit == null) return;

            // Check rule 161-4: Cannot delete base unit if it's the only unit
            int count = _unitRepo.GetUnitCountForProduct(unit.ProductId);
            if (count <= 1)
            {
                throw new InvalidOperationException("لا يمكن حذف الوحدة لأنها الوحدة الوحيدة للمنتج");
            }

            // Check rule 161-4: Cannot delete base unit directly without setting another base unit first
            if (unit.IsBaseUnit)
            {
                throw new InvalidOperationException("لا يمكن حذف الوحدة الأساسية للمنتج مباشرة. يرجى تعيين وحدة أخرى كوحدة أساسية أولاً");
            }

            // Check rule 161-4: Cannot delete unit if it has prior sales
            if (_unitRepo.HasSales(unitId))
            {
                throw new InvalidOperationException("لا يمكن حذف الوحدة لوجود حركات مبيعات وفواتير مسجلة بها سابقاً");
            }

            _unitRepo.Delete(unitId);
        }

        public void SetBaseUnit(string productId, string unitId)
        {
            if (string.IsNullOrWhiteSpace(productId)) throw new ArgumentException("معرف المنتج مطلوب");
            if (string.IsNullOrWhiteSpace(unitId)) throw new ArgumentException("معرف الوحدة مطلوب");

            var unit = _unitRepo.GetById(unitId);
            if (unit == null || unit.ProductId != productId)
            {
                throw new InvalidOperationException("الوحدة المحددة غير تابعة لهذا المنتج");
            }

            _unitRepo.SetBaseUnit(productId, unitId);
        }

        public void EnsureDefaultBaseUnit(Product product)
        {
            if (product == null || string.IsNullOrWhiteSpace(product.Id)) return;

            var existingBase = _unitRepo.GetBaseUnit(product.Id);
            if (existingBase != null) return;

            string unitName = !string.IsNullOrWhiteSpace(product.Unit) ? product.Unit.Trim() : "قطعة";
            bool isDivisible = unitName.Equals("kg", StringComparison.OrdinalIgnoreCase) ||
                               unitName.Equals("كيلو", StringComparison.OrdinalIgnoreCase) ||
                               unitName.Equals("كجم", StringComparison.OrdinalIgnoreCase);

            var baseUnit = new ProductUnit
            {
                Id = "punit_" + product.Id,
                ProductId = product.Id,
                UnitName = unitName,
                ConversionFactor = 1,
                IsBaseUnit = true,
                SellPricePiasters = product.PricePiasters,
                CostPricePiasters = product.CostPiasters,
                Barcode = product.Barcode,
                IsDivisible = isDivisible,
                SortOrder = 0,
                CreatedAt = DateTime.UtcNow.ToString("o"),
                UpdatedAt = DateTime.UtcNow.ToString("o")
            };

            _unitRepo.Create(baseUnit);
        }

        public UnitProfitInfo CalculateProfit(ProductUnit unit, ProductUnit baseUnit)
        {
            if (unit == null) return null;

            long effectiveCost = unit.CostPricePiasters;
            if (effectiveCost == 0 && baseUnit != null && baseUnit.CostPricePiasters > 0)
            {
                effectiveCost = baseUnit.CostPricePiasters * unit.ConversionFactor;
            }

            long profit = unit.SellPricePiasters - effectiveCost;
            int marginPercent = 0;
            if (unit.SellPricePiasters > 0)
            {
                marginPercent = (int)((profit * 100) / unit.SellPricePiasters);
            }

            return new UnitProfitInfo
            {
                SellPricePiasters = unit.SellPricePiasters,
                EffectiveCostPiasters = effectiveCost,
                ProfitPiasters = profit,
                MarginPercentagePoints = marginPercent,
                ProfitFormatted = (profit / 100.0).ToString("N2") + " ج.م",
                MarginFormatted = marginPercent.ToString() + "%"
            };
        }

        public void ValidateSaleQuantity(ProductUnit unit, long quantityMilli)
        {
            if (unit == null) return;

            // Task 161-14: Prevent fractional sale of non-divisible units
            if (!unit.IsDivisible && (quantityMilli % 1000 != 0))
            {
                throw new InvalidOperationException(
                    string.Format("الوحدة ({0}) غير قابلة للتجزئة؛ يجب إدخال كمية صحيحة بدون كسور.", unit.UnitName)
                );
            }
        }

        private void ValidateUnit(ProductUnit unit, bool isNew)
        {
            if (string.IsNullOrWhiteSpace(unit.ProductId))
                throw new ArgumentException("معرف المنتج مطلوب");

            if (string.IsNullOrWhiteSpace(unit.UnitName))
                throw new ArgumentException("اسم الوحدة مطلوب (مثال: قطعة، كرتونة، دستة)");

            if (unit.ConversionFactor <= 0)
                throw new ArgumentException("معامل التحويل للوحدة الأساسية يجب أن يكون أكبر من صفر");

            if (unit.SellPricePiasters < 0)
                throw new ArgumentException("سعر البيع لا يمكن أن يكون سالباً");

            if (unit.CostPricePiasters < 0)
                throw new ArgumentException("سعر التكلفة لا يمكن أن يكون سالباً");

            // Check duplicate barcode if barcode is provided
            if (!string.IsNullOrWhiteSpace(unit.Barcode))
            {
                var barcodeOwner = _unitRepo.GetByBarcode(unit.Barcode);
                if (barcodeOwner != null && barcodeOwner.Id != unit.Id)
                {
                    throw new InvalidOperationException(
                        string.Format("الباركود ({0}) مسجل بالفعل لوحدة أخرى ({1})", unit.Barcode, barcodeOwner.UnitName)
                    );
                }
            }
        }
    }
}
