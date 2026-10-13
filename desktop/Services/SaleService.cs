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

        /// <summary>
        /// IPC requests run on thread-pool threads. Validation (stock, return limits, idempotency) happens before the
        /// write transaction, so sales, cancellations and returns are serialized to keep those checks valid (Audit F-17).
        /// </summary>
        public static readonly object FinancialWriteLock = new object();

        private static readonly Dictionary<string, Sale> _completedByIdempotencyKey = new Dictionary<string, Sale>();
        private static readonly Queue<string> _idempotencyOrder = new Queue<string>();
        private const int IDEMPOTENCY_CACHE_SIZE = 200;

        /// <summary>
        /// Creates a sale at most once per client checkout key, so a retry after a UI timeout cannot duplicate it (Audit F-16).
        /// </summary>
        public Sale ProcessSale(Sale sale, string idempotencyKey)
        {
            lock (FinancialWriteLock)
            {
                if (!string.IsNullOrWhiteSpace(idempotencyKey) && _completedByIdempotencyKey.ContainsKey(idempotencyKey))
                {
                    return _completedByIdempotencyKey[idempotencyKey];
                }

                Sale created = ProcessSaleCore(sale);

                if (!string.IsNullOrWhiteSpace(idempotencyKey))
                {
                    _completedByIdempotencyKey[idempotencyKey] = created;
                    _idempotencyOrder.Enqueue(idempotencyKey);
                    while (_idempotencyOrder.Count > IDEMPOTENCY_CACHE_SIZE)
                    {
                        _completedByIdempotencyKey.Remove(_idempotencyOrder.Dequeue());
                    }
                }
                return created;
            }
        }

        public Sale ProcessSale(Sale sale)
        {
            return ProcessSale(sale, null);
        }

        private Sale ProcessSaleCore(Sale sale)
        {
            if (sale == null) throw new ArgumentNullException("sale");
            if (sale.Items == null || sale.Items.Count == 0)
            {
                throw new InvalidOperationException("لا يمكن حفظ فاتورة بدون أصناف");
            }

            // Server-side input validation: never trust client amounts (Audit F-10)
            if (sale.DiscountPiasters < 0)
            {
                throw new InvalidOperationException("قيمة خصم الفاتورة لا يمكن أن تكون سالبة.");
            }
            if (sale.PaidPiasters < 0)
            {
                throw new InvalidOperationException("المبلغ المدفوع لا يمكن أن يكون سالباً.");
            }
            for (int vIdx = 0; vIdx < sale.Items.Count; vIdx++)
            {
                var vItem = sale.Items[vIdx];
                if (vItem == null || string.IsNullOrWhiteSpace(vItem.ProductId))
                {
                    throw new InvalidOperationException(string.Format("البند رقم {0} في الفاتورة غير صالح.", vIdx + 1));
                }
                if (vItem.QuantityMilli <= 0)
                {
                    throw new InvalidOperationException(string.Format("كمية الصنف '{0}' يجب أن تكون أكبر من الصفر.", vItem.ProductName ?? vItem.ProductId));
                }
                if (vItem.UnitPricePiasters < 0 || vItem.DiscountPiasters < 0 || vItem.UnitCostPiasters < 0)
                {
                    throw new InvalidOperationException(string.Format("سعر أو خصم أو تكلفة الصنف '{0}' لا يمكن أن تكون سالبة.", vItem.ProductName ?? vItem.ProductId));
                }
            }
            if (sale.Payments != null)
            {
                for (int pv = 0; pv < sale.Payments.Count; pv++)
                {
                    if (sale.Payments[pv] != null && sale.Payments[pv].AmountPiasters < 0)
                    {
                        throw new InvalidOperationException("لا يمكن تسجيل دفعة بمبلغ سالب.");
                    }
                }
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

            // Check negative stock policy setting (Feature #30 / Task 30-2) - Default: OFF (0)
            string allowNegativeSetting = "0";
            if (DatabaseService.Settings != null)
            {
                allowNegativeSetting = DatabaseService.Settings.Get("allow_negative_stock", "0");
            }
            bool allowNegative = (allowNegativeSetting == "1" || string.Equals(allowNegativeSetting, "true", StringComparison.OrdinalIgnoreCase));

            // Total resolved base-unit demand per product across all cart lines (computed after server-side unit resolution)
            var productTotalDemandMilli = new Dictionary<string, long>();
            var resolvedProducts = new Dictionary<string, Product>();

            // Price authority applies to interactive sales by a logged-in user without the override permission
            bool enforcePriceAuthority = SecurityService.CurrentUser != null
                && DatabaseService.Security != null
                && !DatabaseService.Security.HasPermission(SecurityService.CurrentUser.Id, "pos.price_override");

            foreach (var item in sale.Items)
            {
                item.Id = Guid.NewGuid().ToString();
                item.SaleId = sale.Id;

                // Validate product exists or pull cost and tax if missing (Task 30-3)
                var product = _productRepo.GetById(item.ProductId);
                if (product != null)
                {
                    // Cost always comes from the catalogue, never from the client (Audit F-11)
                    item.UnitCostPiasters = product.CostPiasters;
                    if (!item.TaxRatePercent.HasValue)
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
                    // A unit id belonging to another product must never be accepted
                    if (matchedUnit != null && !string.Equals(matchedUnit.ProductId, item.ProductId, StringComparison.Ordinal))
                    {
                        matchedUnit = null;
                    }
                }
                if (matchedUnit == null && product != null && product.Units != null && product.Units.Count > 0)
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

                    // Accurately assign carton unit cost (TEST-10)
                    if (matchedUnit.CostPricePiasters > 0)
                    {
                        item.UnitCostPiasters = matchedUnit.CostPricePiasters;
                    }
                    else if (product != null && product.CostPiasters > 0)
                    {
                        item.UnitCostPiasters = product.CostPiasters * item.ConversionFactor;
                    }
                }
                else
                {
                    // No registered unit: catalogue products are always sold in their base unit; the client
                    // conversion factor is never trusted for stock or cost (Audit F-08/F-11 pattern)
                    if (product != null || item.ConversionFactor <= 0)
                    {
                        item.ConversionFactor = 1;
                    }

                    if (string.IsNullOrWhiteSpace(item.UnitName))
                    {
                        item.UnitName = item.Unit ?? "piece";
                    }
                }

                // Selling below/above the catalogue price requires the price-override permission (Audit F-11)
                if (enforcePriceAuthority && product != null && !IsCataloguePrice(item, product, matchedUnit))
                {
                    throw new InvalidOperationException(string.Format("سعر الصنف '{0}' يختلف عن سعر الكتالوج ويتطلب صلاحية تعديل السعر.", product.Name));
                }

                if (product != null)
                {
                    resolvedProducts[item.ProductId] = product;
                    long baseDemand = item.QuantityMilli * (item.ConversionFactor > 0 ? item.ConversionFactor : 1);
                    productTotalDemandMilli[item.ProductId] = (productTotalDemandMilli.ContainsKey(item.ProductId) ? productTotalDemandMilli[item.ProductId] : 0) + baseDemand;
                }

                // Item gross = unit_price * quantity_milli / 1000
                Money unitPrice = Money.FromPiasters(item.UnitPricePiasters);
                Money lineGross = unitPrice.MultiplyByMilliUnits(item.QuantityMilli);
                subtotal = subtotal.Add(lineGross);
            }

            // Task 30-2: Negative stock handling, evaluated on the total resolved base-unit demand per product
            // across all lines (prevents duplicate-line bypass - TEST-4)
            foreach (var demand in productTotalDemandMilli)
            {
                Product demandProduct = resolvedProducts[demand.Key];
                if (demandProduct.StockQuantityMilli < demand.Value)
                {
                    if (!allowNegative)
                    {
                        double currentQty = demandProduct.StockQuantityMilli / 1000.0;
                        string unitLabel = !string.IsNullOrWhiteSpace(demandProduct.Unit) ? demandProduct.Unit : "قطعة";
                        throw new InvalidOperationException(string.Format("لا يمكن إتمام البيع: رصيد الصنف '{0}' في المخزن غير كافٍ (الرصيد المتاح حالياً: {1:0.###} {2}). يمكنك إضافة كمية للصنف من شاشة الأصناف أو تفعيل «السماح بالبيع بالسالب» من الإعدادات.", demandProduct.Name, currentQty, unitLabel));
                    }
                    sale.NegativeStockWarnings.Add(string.Format("تنبيه: رصيد الصنف '{0}' قبل البيع كان ({1:0.###}) وأصبح بالسالب.", demandProduct.Name, demandProduct.StockQuantityMilli / 1000.0));
                }
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
            else if (sale.DiscountPiasters > 0 && existingItemDiscountsSum > 0)
            {
                // Both item discounts and invoice discount exist (TEST-9)
                long extraInvoiceDiscount;
                if (sale.DiscountPiasters > existingItemDiscountsSum)
                {
                    extraInvoiceDiscount = sale.DiscountPiasters - existingItemDiscountsSum;
                }
                else
                {
                    extraInvoiceDiscount = sale.DiscountPiasters;
                    sale.DiscountPiasters = existingItemDiscountsSum + extraInvoiceDiscount;
                }

                // Distribute extra invoice discount across remaining net amounts of lines
                long[] remainingNetPiasters = new long[sale.Items.Count];
                for (int i = 0; i < sale.Items.Count; i++)
                {
                    remainingNetPiasters[i] = Math.Max(0, grossPiasters[i] - sale.Items[i].DiscountPiasters);
                }

                long[] distributedExtra = Money.DistributeInvoiceDiscount(remainingNetPiasters, extraInvoiceDiscount);
                for (int i = 0; i < sale.Items.Count; i++)
                {
                    sale.Items[i].DiscountPiasters += distributedExtra[i];
                }
            }

            // Finalize item line totals and calculate tax
            for (int i = 0; i < sale.Items.Count; i++)
            {
                var it = sale.Items[i];
                Money lineDiscount = Money.FromPiasters(it.DiscountPiasters);
                Money lineTotal = Money.FromPiasters(grossPiasters[i]).Subtract(lineDiscount);
                it.TotalPiasters = Math.Max(0, lineTotal.Piasters);

                if (it.TaxRatePercent.HasValue && it.TaxRatePercent.Value > 0)
                {
                    it.TaxPiasters = Money.CalculateTaxPiasters(it.TotalPiasters, it.TaxRatePercent.Value, true);
                    totalTax = totalTax.Add(Money.FromPiasters(it.TaxPiasters));
                }
                else
                {
                    it.TaxPiasters = 0;
                }
            }

            sale.SubtotalPiasters = subtotal.Piasters;
            sale.TaxPiasters = totalTax.Piasters;
            totalDiscount = Money.FromPiasters(sale.DiscountPiasters);
            Money grandTotal = subtotal.Subtract(totalDiscount);
            sale.TotalPiasters = Math.Max(0, grandTotal.Piasters);

            // E-payment service fee: collected from the customer on behalf of the payment provider.
            // It is NOT shop revenue (business decision Q2): computed here from settings, kept out of
            // TotalPiasters/revenue, and stored separately in ServiceFeePiasters.
            sale.ServiceFeePiasters = CalculateEpayServiceFee(sale.PaymentMethod, sale.TotalPiasters);
            bool isEpayMethod = sale.ServiceFeePiasters > 0;
            if (isEpayMethod)
            {
                // The customer pays the invoice total plus the provider fee in full through the wallet
                sale.PaidPiasters = sale.TotalPiasters + sale.ServiceFeePiasters;
                if (sale.Payments != null && sale.Payments.Count == 1 && sale.Payments[0] != null)
                {
                    sale.Payments[0].AmountPiasters = sale.PaidPiasters;
                }
            }

            if (sale.PaidPiasters <= 0 && !string.Equals(sale.PaymentMethod, "credit", StringComparison.OrdinalIgnoreCase))
            {
                // Default full payment for cash
                sale.PaidPiasters = sale.TotalPiasters;
            }

            bool hasRegisteredCustomer = !string.IsNullOrWhiteSpace(sale.CustomerId) && sale.CustomerId != "cust_general_cash";
            bool isCashMethod = string.Equals(sale.PaymentMethod, "cash", StringComparison.OrdinalIgnoreCase);

            // Unpaid remainder can only be recorded as debt on a registered customer account (Audit F-36)
            if (sale.PaidPiasters < sale.TotalPiasters && !hasRegisteredCustomer)
            {
                throw new InvalidOperationException("لا يمكن تسجيل فاتورة آجلة أو مدفوعة جزئياً بدون اختيار عميل مسجل.");
            }

            if (sale.PaidPiasters > sale.TotalPiasters && isCashMethod && !hasRegisteredCustomer)
            {
                // If registered customer and ChangePiasters is explicitly 0 (or Notes indicate deposit), keep as 0 to deposit on customer ledger
                if (sale.ChangePiasters == 0 && !string.IsNullOrWhiteSpace(sale.CustomerId))
                {
                    // Kept as 0 so unreturned change becomes a deposit in customer account
                }
                else if (sale.ChangePiasters <= 0)
                {
                    sale.ChangePiasters = sale.PaidPiasters - sale.TotalPiasters;
                }
            }
            else
            {
                // For registered customers the cash excess is deposited to the account, so no change is handed back (Audit F-27)
                sale.ChangePiasters = 0;
            }

            if (sale.Payments != null && sale.Payments.Count > 0)
            {
                long sumPayments = 0;
                for (int pIdx = 0; pIdx < sale.Payments.Count; pIdx++)
                {
                    // The 'credit' portion is unpaid debt, not money received (Audit F-39)
                    if (sale.Payments[pIdx] == null || string.Equals(sale.Payments[pIdx].Method, "credit", StringComparison.OrdinalIgnoreCase)) continue;
                    sumPayments += sale.Payments[pIdx].AmountPiasters;
                }
                if (sumPayments != sale.PaidPiasters)
                {
                    throw new InvalidOperationException(string.Format("مجموع الدفعات المتعددة ({0} قرش) لا يطابق المبلغ المدفوع المسجل ({1} قرش).", sumPayments, sale.PaidPiasters));
                }
            }

            var result = _saleRepo.CreateSaleAtomic(sale);
            result.NegativeStockWarnings = sale.NegativeStockWarnings;
            return result;
        }

        /// <summary>
        /// Pass-through e-payment fee in whole piasters, using integer basis points (AGENTS Rule 1).
        /// </summary>
        private static long CalculateEpayServiceFee(string paymentMethod, long totalPiasters)
        {
            if (totalPiasters <= 0 || DatabaseService.Settings == null) return 0;

            string settingKey;
            if (string.Equals(paymentMethod, "instapay", StringComparison.OrdinalIgnoreCase))
            {
                settingKey = "instapay_fee_percent";
            }
            else if (string.Equals(paymentMethod, "vodafone_cash", StringComparison.OrdinalIgnoreCase))
            {
                settingKey = "vodafone_cash_fee_percent";
            }
            else
            {
                return 0;
            }

            decimal percent;
            string raw = DatabaseService.Settings.Get(settingKey, "0");
            if (!decimal.TryParse(raw, System.Globalization.NumberStyles.Number, System.Globalization.CultureInfo.InvariantCulture, out percent) || percent <= 0)
            {
                return 0;
            }

            long basisPoints = (long)decimal.Round(percent * 100m, 0, MidpointRounding.AwayFromZero);
            // Round half up to whole piasters, matching the POS screen preview
            return (totalPiasters * basisPoints + 5000L) / 10000L;
        }

        /// <summary>
        /// A line price is accepted without the price-override permission when it matches a configured catalogue
        /// price: the product price, the unit price, or a quick-pick price (open-price quick items allow any price).
        /// </summary>
        private static bool IsCataloguePrice(SaleItem item, Product product, ProductUnit matchedUnit)
        {
            long price = item.UnitPricePiasters;
            int factor = item.ConversionFactor > 0 ? item.ConversionFactor : 1;

            // Products without a catalogue price are sold at an entered price by design
            if (product.PricePiasters <= 0) return true;
            if (price == product.PricePiasters) return true;
            if (price == product.PricePiasters * factor) return true;
            if (matchedUnit != null && matchedUnit.SellPricePiasters > 0 && price == matchedUnit.SellPricePiasters) return true;

            if (DatabaseService.QuickItems != null)
            {
                var quickItems = DatabaseService.QuickItems.GetAll();
                if (quickItems != null)
                {
                    for (int q = 0; q < quickItems.Count; q++)
                    {
                        var qi = quickItems[q];
                        if (qi == null) continue;
                        bool sameProduct = string.Equals(qi.ProductId, product.Id, StringComparison.Ordinal) ||
                                           string.Equals(qi.Id, product.Id, StringComparison.Ordinal);
                        if (!sameProduct) continue;
                        if (qi.IsOpenPrice || qi.PricePiasters == price) return true;
                    }
                }
            }
            return false;
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

        public Sale CancelSale(string saleId, string reason, string userId = null, string supervisorPin = null)
        {
            if (string.IsNullOrWhiteSpace(saleId))
            {
                throw new ArgumentNullException("saleId", "معرّف الفاتورة مطلوب للإلغاء");
            }
            if (string.IsNullOrWhiteSpace(reason))
            {
                throw new ArgumentException("سبب الإلغاء إجباري لتسجيل العملية في سجل النظام", "reason");
            }

            // Task 33-3: Verify supervisor PIN if security PIN is enabled
            if (DatabaseService.Security != null)
            {
                var pinStatus = DatabaseService.Security.GetStatus();
                if (pinStatus != null && pinStatus.IsEnabled)
                {
                    if (string.IsNullOrEmpty(supervisorPin))
                    {
                        throw new UnauthorizedAccessException("إلغاء الفاتورة يتطلب إدخال الرقم السري للمشرف.");
                    }
                    var pinCheck = DatabaseService.Security.VerifySupervisorPin(supervisorPin, "SALE_CANCEL");
                    if (pinCheck == null || !pinCheck.Success)
                    {
                        string msg = (pinCheck != null && !string.IsNullOrEmpty(pinCheck.Message)) ? pinCheck.Message : "الرقم السري للمشرف غير صحيح";
                        throw new UnauthorizedAccessException(msg);
                    }
                }
            }

            lock (FinancialWriteLock)
            {
                return _saleRepo.CancelSaleAtomic(saleId, reason.Trim(), userId);
            }
        }
    }
}
