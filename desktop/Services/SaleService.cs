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

            if (sale.NegativeStockWarnings == null)
            {
                sale.NegativeStockWarnings = new List<string>();
            }

            // Check negative stock policy setting (Feature #30 / Task 30-2)
            string allowNegativeSetting = "1";
            if (DatabaseService.Settings != null)
            {
                allowNegativeSetting = DatabaseService.Settings.Get("allow_negative_stock", "1");
            }
            bool allowNegative = (allowNegativeSetting == "1" || string.Equals(allowNegativeSetting, "true", StringComparison.OrdinalIgnoreCase));

            foreach (var item in sale.Items)
            {
                item.Id = Guid.NewGuid().ToString();
                item.SaleId = sale.Id;

                // Validate product exists or pull cost and tax if missing (Task 30-3)
                var product = _productRepo.GetById(item.ProductId);
                if (product != null)
                {
                    item.UnitCostPiasters = product.CostPiasters;
                    if (item.TaxRatePercent <= 0)
                    {
                        item.TaxRatePercent = product.TaxRatePercent;
                    }
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

                // Multi-unit resolution and validation (Feature #161 / Tasks 161-6 & 161-14)
                ProductUnit matchedUnit = null;
                if (!string.IsNullOrWhiteSpace(item.UnitId) && DatabaseService.ProductUnits != null)
                {
                    matchedUnit = DatabaseService.ProductUnits.GetUnitById(item.UnitId);
                }
                else if (product != null && product.Units != null && product.Units.Count > 0)
                {
                    if (!string.IsNullOrWhiteSpace(item.Barcode))
                    {
                        foreach (var u in product.Units)
                        {
                            if (string.Equals(u.Barcode, item.Barcode, StringComparison.OrdinalIgnoreCase))
                            {
                                matchedUnit = u;
                                break;
                            }
                        }
                    }
                    if (matchedUnit == null && !string.IsNullOrWhiteSpace(item.UnitName))
                    {
                        foreach (var u in product.Units)
                        {
                            if (string.Equals(u.UnitName, item.UnitName, StringComparison.OrdinalIgnoreCase))
                            {
                                matchedUnit = u;
                                break;
                            }
                        }
                    }
                    if (matchedUnit == null)
                    {
                        foreach (var u in product.Units)
                        {
                            if (u.IsBaseUnit)
                            {
                                matchedUnit = u;
                                break;
                            }
                        }
                    }
                }

                if (matchedUnit != null)
                {
                    item.UnitId = matchedUnit.Id;
                    item.UnitName = matchedUnit.UnitName;
                    item.ConversionFactor = matchedUnit.ConversionFactor > 0 ? matchedUnit.ConversionFactor : 1;
                    item.Unit = matchedUnit.UnitName;

                    // Task 161-14: Prevent fractional sale for non-divisible units
                    if (!matchedUnit.IsDivisible && (item.QuantityMilli % 1000 != 0))
                    {
                        string prodTitle = product != null ? product.Name : (item.ProductName ?? "");
                        throw new InvalidOperationException(
                            string.Format("الوحدة '{0}' للصنف '{1}' غير قابلة للتجزئة؛ يجب إدخال كمية صحيحة بدون كسور.", matchedUnit.UnitName, prodTitle)
                        );
                    }

                    if (item.UnitCostPiasters <= 0)
                    {
                        if (matchedUnit.CostPricePiasters > 0)
                        {
                            item.UnitCostPiasters = matchedUnit.CostPricePiasters;
                        }
                        else if (product != null && product.CostPiasters > 0)
                        {
                            item.UnitCostPiasters = product.CostPiasters * item.ConversionFactor;
                        }
                    }
                }
                else
                {
                    if (item.ConversionFactor <= 0)
                    {
                        item.ConversionFactor = 1;
                    }
                    if (string.IsNullOrWhiteSpace(item.UnitName))
                    {
                        item.UnitName = item.Unit ?? "piece";
                    }
                }

                long requiredStockBaseMilli = item.QuantityMilli * (item.ConversionFactor > 0 ? item.ConversionFactor : 1);

                if (product != null)
                {
                    // Task 30-2: Negative stock handling
                    if (!allowNegative && product.StockQuantityMilli < requiredStockBaseMilli)
                    {
                        throw new InvalidOperationException(string.Format("لا يمكن إتمام البيع: رصيد الصنف '{0}' غير كافٍ ({1:0.###}) وسياسة الرصيد السالب معطلة.", product.Name, product.StockQuantityMilli / 1000.0));
                    }
                    else if (product.StockQuantityMilli < requiredStockBaseMilli)
                    {
                        sale.NegativeStockWarnings.Add(string.Format("تنبيه: رصيد الصنف '{0}' قبل البيع كان ({1:0.###}) وأصبح بالسالب.", product.Name, product.StockQuantityMilli / 1000.0));
                    }
                }

                // Item gross = unit_price * quantity_milli / 1000
                Money unitPrice = Money.FromPiasters(item.UnitPricePiasters);
                Money lineGross = unitPrice.MultiplyByMilliUnits(item.QuantityMilli);
                subtotal = subtotal.Add(lineGross);
            }

            // Task 24-2: Proportional Invoice Discount Distribution
            long existingItemDiscountsSum = 0;
            long[] grossPiasters = new long[sale.Items.Count];
            for (int i = 0; i < sale.Items.Count; i++)
            {
                var it = sale.Items[i];
                Money uPrice = Money.FromPiasters(it.UnitPricePiasters);
                grossPiasters[i] = uPrice.MultiplyByMilliUnits(it.QuantityMilli).Piasters;
                existingItemDiscountsSum += it.DiscountPiasters;
            }

            if (sale.DiscountPiasters > 0 && existingItemDiscountsSum == 0)
            {
                // Proportionally distribute invoice discount to line items using Largest Remainder
                long[] distributed = Money.DistributeInvoiceDiscount(grossPiasters, sale.DiscountPiasters);
                for (int i = 0; i < sale.Items.Count; i++)
                {
                    sale.Items[i].DiscountPiasters = distributed[i];
                }
            }
            else if (existingItemDiscountsSum > 0 && sale.DiscountPiasters == 0)
            {
                sale.DiscountPiasters = existingItemDiscountsSum;
            }

            // Finalize item line totals
            for (int i = 0; i < sale.Items.Count; i++)
            {
                var it = sale.Items[i];
                Money lineDiscount = Money.FromPiasters(it.DiscountPiasters);
                Money lineTotal = Money.FromPiasters(grossPiasters[i]).Subtract(lineDiscount);
                it.TotalPiasters = Math.Max(0, lineTotal.Piasters);
            }

            sale.SubtotalPiasters = subtotal.Piasters;
            totalDiscount = Money.FromPiasters(sale.DiscountPiasters);
            Money grandTotal = subtotal.Subtract(totalDiscount).Add(totalTax);
            sale.TotalPiasters = Math.Max(0, grandTotal.Piasters);

            if (sale.PaidPiasters <= 0)
            {
                // Default full payment for cash
                sale.PaidPiasters = sale.TotalPiasters;
            }

            var result = _saleRepo.CreateSaleAtomic(sale);
            result.NegativeStockWarnings = sale.NegativeStockWarnings;
            return result;
        }

        /// <summary>
        /// Task 137-3: بيعة تجريبية بعلامة «تجريبي» لا تدخل المخزون ولا ترقيم الفواتير الرسمي
        /// </summary>
        public Sale ProcessTestSale(Sale sale = null)
        {
            if (sale == null)
            {
                sale = new Sale();
            }

            if (sale.Items == null || sale.Items.Count == 0)
            {
                // Create a standard sample test sale item if empty
                sale.Items = new List<SaleItem>
                {
                    new SaleItem
                    {
                        Id = "test_item_1",
                        ProductId = "test_sample_prod",
                        ProductName = "صنف تجريبي لاختبار الطابعة والفاتورة",
                        Barcode = "62299990001",
                        QuantityMilli = 1000,
                        UnitPricePiasters = 2500,
                        UnitCostPiasters = 1800,
                        TotalPiasters = 2500,
                        Unit = "piece"
                    }
                };
            }

            sale.Id = "test_sale_" + Guid.NewGuid().ToString("N").Substring(0, 8);
            sale.InvoiceNumber = 0; // Special test sequence, official counter remains untouched
            sale.Status = "TEST_PILOT";
            sale.CreatedAt = DateTime.UtcNow.ToString("o");
            sale.PaymentMethod = !string.IsNullOrEmpty(sale.PaymentMethod) ? sale.PaymentMethod : "CASH";
            sale.Notes = "فاتورة بيع تجريبية - فحص جاهزية التشغيل (لا تدخل المخزون ولا الحسابات)";

            Money subtotal = Money.Zero;
            long[] grossPiasters = new long[sale.Items.Count];
            long existingItemDiscountsSum = 0;

            for (int i = 0; i < sale.Items.Count; i++)
            {
                var item = sale.Items[i];
                item.Id = "test_item_" + (i + 1);
                item.SaleId = sale.Id;

                Money unitPrice = Money.FromPiasters(item.UnitPricePiasters > 0 ? item.UnitPricePiasters : 1000);
                long qty = item.QuantityMilli > 0 ? item.QuantityMilli : 1000;
                Money lineGross = unitPrice.MultiplyByMilliUnits(qty);
                grossPiasters[i] = lineGross.Piasters;
                existingItemDiscountsSum += item.DiscountPiasters;
                subtotal = subtotal.Add(lineGross);
            }

            if (sale.DiscountPiasters > 0 && existingItemDiscountsSum == 0)
            {
                long[] distributed = Money.DistributeInvoiceDiscount(grossPiasters, sale.DiscountPiasters);
                for (int i = 0; i < sale.Items.Count; i++)
                {
                    sale.Items[i].DiscountPiasters = distributed[i];
                }
            }
            else if (existingItemDiscountsSum > 0 && sale.DiscountPiasters == 0)
            {
                sale.DiscountPiasters = existingItemDiscountsSum;
            }

            for (int i = 0; i < sale.Items.Count; i++)
            {
                var item = sale.Items[i];
                Money lineDiscount = Money.FromPiasters(item.DiscountPiasters);
                Money lineTotal = Money.FromPiasters(grossPiasters[i]).Subtract(lineDiscount);
                item.TotalPiasters = Math.Max(0, lineTotal.Piasters);
            }

            sale.SubtotalPiasters = subtotal.Piasters;
            Money totalDiscount = Money.FromPiasters(sale.DiscountPiasters);
            sale.TotalPiasters = Math.Max(0, subtotal.Subtract(totalDiscount).Piasters);
            sale.PaidPiasters = sale.TotalPiasters;

            // Notice: NOT calling _saleRepo.CreateSaleAtomic, so official invoice_number counter
            // and stock_movements are strictly not modified.
            return sale;
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

        public Sale GetSaleByInvoiceNumber(int invoiceNumber)
        {
            if (invoiceNumber <= 0) return null;
            return _saleRepo.GetSaleByInvoiceNumber(invoiceNumber);
        }

        public List<Sale> SearchSales(
            string query = null,
            string dateFrom = null,
            string dateTo = null,
            string customerId = null,
            string status = null,
            long? minTotal = null,
            long? maxTotal = null,
            int limit = 100)
        {
            return _saleRepo.SearchSales(query, dateFrom, dateTo, customerId, status, minTotal, maxTotal, limit);
        }

        public Sale CancelSale(string saleId, string reason, string userId = null)
        {
            if (string.IsNullOrWhiteSpace(saleId))
            {
                throw new ArgumentNullException("saleId", "معرّف الفاتورة مطلوب للإلغاء");
            }
            return _saleRepo.CancelSaleAtomic(saleId, reason, userId);
        }
    }
}
