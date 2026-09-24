using System;
using System.Collections.Generic;
using RafiqPOS.Common;
using RafiqPOS.Models;
using RafiqPOS.Repositories;

namespace RafiqPOS.Services
{
    public class SaleService
    {
        private readonly SaleRepository _saleRepo;
        private readonly ProductRepository _productRepo;

        public SaleService(SaleRepository saleRepo, ProductRepository productRepo)
        {
            _saleRepo = saleRepo;
            _productRepo = productRepo;
        }

        public Sale ProcessSale(Sale sale)
        {
            if (sale == null) throw new ArgumentNullException("sale");
            if (sale.Items == null || sale.Items.Count == 0)
            {
                throw new InvalidOperationException("لا يمكن حفظ فاتورة بدون أصناف");
            }

            sale.Id = Guid.NewGuid().ToString();
            sale.CreatedAt = DateTime.UtcNow.ToString("o");

            Money subtotal = Money.Zero;
            Money totalDiscount = Money.FromPiasters(sale.DiscountPiasters);
            Money totalTax = Money.Zero;

            foreach (var item in sale.Items)
            {
                item.Id = Guid.NewGuid().ToString();
                item.SaleId = sale.Id;

                // Validate product exists or pull cost if missing
                var product = _productRepo.GetById(item.ProductId);
                if (product != null)
                {
                    item.UnitCostPiasters = product.CostPiasters;
                    if (string.IsNullOrWhiteSpace(item.ProductName))
                    {
                        item.ProductName = product.Name;
                    }
                    if (string.IsNullOrWhiteSpace(item.Barcode))
                    {
                        item.Barcode = product.Barcode;
                    }
                    if (string.IsNullOrWhiteSpace(item.Unit))
                    {
                        item.Unit = product.Unit;
                    }
                }

                // Item total = (unit_price * quantity_milli / 1000) - discount
                Money unitPrice = Money.FromPiasters(item.UnitPricePiasters);
                Money lineGross = unitPrice.MultiplyByMilliUnits(item.QuantityMilli);
                Money lineDiscount = Money.FromPiasters(item.DiscountPiasters);
                Money lineTotal = lineGross.Subtract(lineDiscount);

                item.TotalPiasters = lineTotal.Piasters;
                subtotal = subtotal.Add(lineTotal);
            }

            sale.SubtotalPiasters = subtotal.Piasters;
            Money grandTotal = subtotal.Subtract(totalDiscount).Add(totalTax);
            sale.TotalPiasters = grandTotal.Piasters;

            if (sale.PaidPiasters <= 0)
            {
                // Default full payment for cash
                sale.PaidPiasters = sale.TotalPiasters;
            }

            return _saleRepo.CreateSaleAtomic(sale);
        }

        public List<Sale> GetRecentSales(int limit = 20)
        {
            return _saleRepo.GetRecentSales(limit);
        }

        public Sale GetSaleById(string id)
        {
            if (string.IsNullOrWhiteSpace(id)) return null;
            return _saleRepo.GetSaleById(id);
        }
    }
}
