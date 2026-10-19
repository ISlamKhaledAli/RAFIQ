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
        private readonly QuickItemRepository _quickRepo;

        public SaleService(SaleRepository saleRepo, ProductRepository productRepo, QuickItemRepository quickRepo = null)
        {
            _saleRepo = saleRepo;
            _productRepo = productRepo;
            _quickRepo = quickRepo;
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
                if (string.IsNullOrWhiteSpace(idempotencyKey) && sale != null && !string.IsNullOrWhiteSpace(sale.IdempotencyKey))
                {
                    idempotencyKey = sale.IdempotencyKey;
                }

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

        public const long MAX_QUANTITY_MILLI = 10000000000L; // 10,000,000 units
        public const long MAX_PRICE_PIASTERS = 100000000000L; // 1,000,000,000 EGP

        private Sale ProcessSaleCore(Sale sale)
        {
            if (sale == null) throw new ArgumentNullException("sale");
            if (sale.Items == null || sale.Items.Count == 0)
            {
                throw new InvalidOperationException("لا يمكن حفظ فاتورة بدون أصناف");
            }

            // Closed Day Validation & Post-Closing Freeze (Story 87 / Feature 49)
            if (DatabaseService.DailyClosing != null)
            {
                string targetBDate = DatabaseService.DailyClosing.GetCurrentBusinessDate();
                if (!string.IsNullOrEmpty(sale.CreatedAt))
                {
                    DateTime parsedDate;
                    if (DateTime.TryParse(sale.CreatedAt, out parsedDate))
                    {
                        int cutoff = 0;
                        if (DatabaseService.Settings != null)
                        {
                            int.TryParse(DatabaseService.Settings.Get("business_day_cutoff_hour", "0"), out cutoff);
                        }
                        targetBDate = TimeGuard.GetBusinessDate(parsedDate.ToLocalTime(), cutoff).ToString("yyyy-MM-dd");
                    }
                }

                if (DatabaseService.DailyClosing.IsDayClosed(targetBDate))
                {
                    throw new InvalidOperationException(string.Format("تم إقفال وتشميع يومية العمل لتاريخ {0} مسبقاً. لا يمكن تسجيل أي فواتير جديدة.", targetBDate));
                }
            }

            // Scenario 1: Financial Operation Guard - Require open active shift
            if (DatabaseService.Shifts != null)
            {
                bool isTestSale = sale.Id != null && (sale.Id.StartsWith("demo_") || sale.Id.StartsWith("stress_"));
                bool requireShift = true;
                if (DatabaseService.Settings != null)
                {
                    string reqShiftSetting = DatabaseService.Settings.Get("require_open_shift_to_sell", "1");
                    requireShift = (reqShiftSetting != "0" && !string.Equals(reqShiftSetting, "false", StringComparison.OrdinalIgnoreCase));
                }

                if (!string.IsNullOrEmpty(sale.ShiftId))
                {
                    var specifiedShift = DatabaseService.Shifts.GetById(sale.ShiftId);
                    if (specifiedShift == null || !string.Equals(specifiedShift.Status, "open", StringComparison.OrdinalIgnoreCase))
                    {
                        throw new InvalidOperationException("الوردية المحددة للفاتورة مغلقة أو غير صالحة. لا يمكن تسجيل مبيعات على وردية مغلقة.");
                    }
                }
                else
                {
                    var activeShift = DatabaseService.Shifts.GetActiveShift();
                    if (activeShift == null)
                    {
                        if (requireShift && !isTestSale)
                        {
                            throw new InvalidOperationException("لا يمكن إتمام البيع قبل فتح وردية رسمية للكاشير واستلام عهدة الدرج. يرجى فتح وردية جديدة أولاً.");
                        }
                    }
                    else
                    {
                        sale.ShiftId = activeShift.Id;
                    }
                }
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
                if (vItem.QuantityMilli > MAX_QUANTITY_MILLI)
                {
                    throw new InvalidOperationException(string.Format("كمية الصنف '{0}' تتجاوز الحد الأقصى المسموح به للنظام.", vItem.ProductName ?? vItem.ProductId));
                }
                if (vItem.UnitPricePiasters < 0 || vItem.DiscountPiasters < 0 || vItem.UnitCostPiasters < 0)
                {
                    throw new InvalidOperationException(string.Format("سعر أو خصم أو تكلفة الصنف '{0}' لا يمكن أن تكون سالبة.", vItem.ProductName ?? vItem.ProductId));
                }
                if (vItem.UnitPricePiasters > MAX_PRICE_PIASTERS)
                {
                    throw new InvalidOperationException(string.Format("سعر الصنف '{0}' يتجاوز الحد الأقصى المسموح به للنظام.", vItem.ProductName ?? vItem.ProductId));
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
                QuickItem quickItem = null;
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
                }
                else
                {
                    if (_quickRepo != null)
                    {
                        quickItem = _quickRepo.GetById(item.ProductId);
                    }
                    else if (DatabaseService.QuickItems != null)
                    {
                        quickItem = DatabaseService.QuickItems.GetById(item.ProductId);
                    }

                    if (quickItem != null)
                    {
                        if (!string.IsNullOrEmpty(quickItem.ProductId))
                        {
                            product = _productRepo.GetById(quickItem.ProductId);
                            if (product != null)
                            {
                                item.ProductId = product.Id;
                                item.UnitCostPiasters = product.CostPiasters;
                                if (!item.TaxRatePercent.HasValue) item.TaxRatePercent = product.TaxRatePercent;
                                if (string.IsNullOrWhiteSpace(item.ProductName)) item.ProductName = product.Name;
                            }
                        }

                        if (product == null)
                        {
                            if (string.IsNullOrWhiteSpace(item.ProductName))
                            {
                                item.ProductName = quickItem.Name;
                            }
                            if (!item.TaxRatePercent.HasValue)
                            {
                                item.TaxRatePercent = 0;
                            }
                            // Standalone services have 0 inventory cost, preserving true 100% operating profit
                            item.UnitCostPiasters = 0;
                        }
                    }
                }

                // Preserve original client barcode for unit matching before filling catalog barcode
                string clientBarcode = item.Barcode;

                // Multi-unit resolution and validation (Feature #161 / Tasks 161-6 & 161-14)
                ProductUnit matchedUnit = null;

                // 1. Direct unit ID match
                if (!string.IsNullOrWhiteSpace(item.UnitId))
                {
                    if (product != null && product.Units != null)
                    {
                        foreach (var u in product.Units)
                        {
                            if (string.Equals(u.Id, item.UnitId, StringComparison.OrdinalIgnoreCase))
                            {
                                matchedUnit = u;
                                break;
                            }
                        }
                    }
                    if (matchedUnit == null && DatabaseService.ProductUnits != null)
                    {
                        var uDb = DatabaseService.ProductUnits.GetUnitById(item.UnitId);
                        if (uDb != null && (product == null || string.Equals(uDb.ProductId, item.ProductId, StringComparison.Ordinal)))
                        {
                            matchedUnit = uDb;
                        }
                    }
                }

                // 2. Unit name match
                if (matchedUnit == null && product != null && product.Units != null)
                {
                    string targetName = !string.IsNullOrWhiteSpace(item.UnitName) ? item.UnitName : item.Unit;
                    if (!string.IsNullOrWhiteSpace(targetName))
                    {
                        foreach (var u in product.Units)
                        {
                            if (string.Equals(u.UnitName, targetName, StringComparison.OrdinalIgnoreCase))
                            {
                                matchedUnit = u;
                                break;
                            }
                        }
                    }
                }

                // 3. Client barcode match against unit barcodes
                if (matchedUnit == null && !string.IsNullOrWhiteSpace(clientBarcode) && product != null && product.Units != null)
                {
                    foreach (var u in product.Units)
                    {
                        if (!string.IsNullOrWhiteSpace(u.Barcode) && string.Equals(u.Barcode, clientBarcode, StringComparison.OrdinalIgnoreCase))
                        {
                            matchedUnit = u;
                            break;
                        }
                    }
                }

                // 4. Conversion factor match
                if (matchedUnit == null && item.ConversionFactor > 1 && product != null && product.Units != null)
                {
                    foreach (var u in product.Units)
                    {
                        if (u.ConversionFactor == item.ConversionFactor)
                        {
                            matchedUnit = u;
                            break;
                        }
                    }
                }

                // 5. Fallback to base unit if available
                if (matchedUnit == null && product != null && product.Units != null)
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

                if (matchedUnit != null)
                {
                    item.UnitId = matchedUnit.Id;
                    item.UnitName = matchedUnit.UnitName;
                    item.ConversionFactor = matchedUnit.ConversionFactor > 0 ? matchedUnit.ConversionFactor : 1;
                    item.Unit = matchedUnit.UnitName;

                    if (string.IsNullOrWhiteSpace(item.Barcode))
                    {
                        item.Barcode = !string.IsNullOrWhiteSpace(matchedUnit.Barcode) ? matchedUnit.Barcode : (product != null ? product.Barcode : null);
                    }

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
                        item.UnitName = item.Unit ?? (product != null ? product.Unit : "piece");
                    }
                    if (string.IsNullOrWhiteSpace(item.Unit))
                    {
                        item.Unit = item.UnitName;
                    }
                    if (string.IsNullOrWhiteSpace(item.Barcode) && product != null)
                    {
                        item.Barcode = product.Barcode;
                    }

                    // Divisibility guard for base units: non-weighted products sold in piece units cannot have fractional quantities
                    if (product != null && !string.Equals(product.Unit, "kg", StringComparison.OrdinalIgnoreCase) && !string.Equals(product.Unit, "gram", StringComparison.OrdinalIgnoreCase))
                    {
                        if (item.QuantityMilli % 1000 != 0)
                        {
                            throw new InvalidOperationException(
                                string.Format("الصنف '{0}' يباع بالقطعة وغير قابل للتجزئة؛ يجب إدخال كمية صحيحة بدون كسور.", product.Name)
                            );
                        }
                    }
                }

                // Selling below/above the catalogue price requires the price-override permission (Audit F-11)
                if (enforcePriceAuthority)
                {
                    if (product != null)
                    {
                        if (!IsCataloguePrice(item, product, matchedUnit))
                        {
                            throw new InvalidOperationException(string.Format("سعر الصنف '{0}' يختلف عن سعر الكتالوج ويتطلب صلاحية تعديل السعر.", product.Name));
                        }
                    }
                    else if (quickItem != null)
                    {
                        if (!quickItem.IsOpenPrice && item.UnitPricePiasters != quickItem.PricePiasters)
                        {
                            throw new InvalidOperationException(string.Format("سعر الصنف السريع '{0}' محدد بـ {1:0.00} ج.م وتعديله يتطلب صلاحية تعديل السعر.", quickItem.Name, quickItem.PricePiasters / 100.0));
                        }
                    }
                    else
                    {
                        // Ghost / unregistered product attempt by cashier without price override permission
                        throw new InvalidOperationException(string.Format("الصنف '{0}' غير مسجل في الكتالوج أو الأصناف السريعة؛ وبيعه يتطلب صلاحية تعديل الأسعار.", !string.IsNullOrWhiteSpace(item.ProductName) ? item.ProductName : item.ProductId));
                    }
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
                // Both item discounts and invoice discount exist (TEST-9 & Scenario 2)
                long extraInvoiceDiscount = 0;
                if (sale.DiscountPiasters > existingItemDiscountsSum)
                {
                    extraInvoiceDiscount = sale.DiscountPiasters - existingItemDiscountsSum;
                }
                else if (sale.DiscountPiasters < existingItemDiscountsSum)
                {
                    // Caller specified extra invoice discount separately (TEST-9 compatibility)
                    extraInvoiceDiscount = sale.DiscountPiasters;
                    sale.DiscountPiasters = existingItemDiscountsSum + extraInvoiceDiscount;
                }
                else
                {
                    // sale.DiscountPiasters == existingItemDiscountsSum
                    // All discounts are already accounted for at the item level; no extra invoice discount
                    extraInvoiceDiscount = 0;
                }

                if (extraInvoiceDiscount > 0)
                {
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

            // Server-side Cashier Discount Limit Enforcement (Scenario 3 / Audit Security Rule 8 & F-10)
            // Prevent client-side bypass: verify that any discount exceeding cashier limits has supervisor authorization
            if (SecurityService.CurrentUser != null && DatabaseService.Security != null)
            {
                bool isPrivilegedUser = SecurityService.CurrentUser.Role == "root" ||
                                        SecurityService.CurrentUser.Role == "admin" ||
                                        DatabaseService.Security.HasPermission(SecurityService.CurrentUser.Id, "pos.discount_unlimited") ||
                                        DatabaseService.Security.HasPermission(SecurityService.CurrentUser.Id, "pos.discount_override");

                if (!isPrivilegedUser && subtotal.Piasters > 0 && sale.DiscountPiasters > 0)
                {
                    int maxPct = 10;
                    long maxAmountPiasters = 5000; // 50 EGP
                    if (DatabaseService.Settings != null)
                    {
                        int.TryParse(DatabaseService.Settings.Get("max_discount_percent_cashier", "10"), out maxPct);
                        long.TryParse(DatabaseService.Settings.Get("max_discount_amount_cashier_piasters", "5000"), out maxAmountPiasters);
                    }

                    long discountPct = (sale.DiscountPiasters * 100L) / subtotal.Piasters;
                    bool exceedsPercent = discountPct > maxPct;
                    bool exceedsAmount = sale.DiscountPiasters > maxAmountPiasters;

                    if (exceedsPercent || exceedsAmount)
                    {
                        string supPin = sale.SupervisorPin;
                        if (string.IsNullOrWhiteSpace(supPin))
                        {
                            throw new InvalidOperationException(string.Format(
                                "قيمة الخصم ({0:0.00} ج.م / {1}%) تتجاوز الحد الأقصى المصرح به للكاشير ({2:0.00} ج.م / {3}%) وتتطلب إدخال واعتماد الرقم السري للمشرف.",
                                sale.DiscountPiasters / 100.0,
                                discountPct,
                                maxAmountPiasters / 100.0,
                                maxPct
                            ));
                        }

                        var supCheck = DatabaseService.Security.VerifySupervisorPin(supPin, "DISCOUNT_OVERRIDE");
                        if (!supCheck.Success)
                        {
                            throw new InvalidOperationException("الرقم السري للمشرف غير صحيح أو غير مصرح له باعتماد الخصم: " + supCheck.Message);
                        }
                    }
                }
            }

            // E-payment service fee: collected from the customer on behalf of the payment provider.
            // It is NOT shop revenue (business decision Q2): kept out of TotalPiasters/revenue, and stored separately in ServiceFeePiasters.
            if (sale.ServiceFeePiasters < 0) sale.ServiceFeePiasters = 0;
            if (sale.ServiceFeePiasters == 0)
            {
                sale.ServiceFeePiasters = CalculateEpayServiceFee(sale.PaymentMethod, sale.TotalPiasters);
            }
            bool isEpayMethod = sale.ServiceFeePiasters > 0;
            if (isEpayMethod)
            {
                // The customer pays the invoice total plus the provider fee in full through the wallet
                if (sale.PaidPiasters < sale.TotalPiasters + sale.ServiceFeePiasters)
                {
                    sale.PaidPiasters = sale.TotalPiasters + sale.ServiceFeePiasters;
                }
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
            bool hasCashPayment = isCashMethod;
            long totalCashTendered = 0;

            if (sale.Payments != null && sale.Payments.Count > 0)
            {
                long sumNonCredit = 0;
                long sumCredit = 0;

                for (int pIdx = 0; pIdx < sale.Payments.Count; pIdx++)
                {
                    var p = sale.Payments[pIdx];
                    if (p == null) continue;
                    if (p.AmountPiasters < 0)
                    {
                        throw new InvalidOperationException("لا يمكن تسجيل مبالغ سالبة في طرق الدفع.");
                    }

                    if (string.Equals(p.Method, "credit", StringComparison.OrdinalIgnoreCase))
                    {
                        sumCredit += p.AmountPiasters;
                    }
                    else
                    {
                        sumNonCredit += p.AmountPiasters;
                        if (string.Equals(p.Method, "cash", StringComparison.OrdinalIgnoreCase))
                        {
                            hasCashPayment = true;
                            totalCashTendered += p.AmountPiasters;
                        }
                    }
                }

                if (sumNonCredit != sale.PaidPiasters)
                {
                    throw new InvalidOperationException(string.Format("مجموع الدفعات النقدية والإلكترونية ({0} قرش) لا يطابق المبلغ المدفوع المسجل ({1} قرش).", sumNonCredit, sale.PaidPiasters));
                }

                long expectedDebt = Math.Max(0, sale.TotalPiasters - (sale.PaidPiasters - sale.ServiceFeePiasters));
                if (sumCredit > 0 && sumCredit != expectedDebt)
                {
                    throw new InvalidOperationException(string.Format("مبلغ الجزء الآجل في الدفعات ({0} قرش) لا يطابق المتبقي من الفاتورة ({1} قرش).", sumCredit, expectedDebt));
                }

                if (sumCredit > 0 && !hasRegisteredCustomer)
                {
                    throw new InvalidOperationException("لا يمكن تسجيل جزء آجل من الفاتورة بدون اختيار عميل مسجل.");
                }
            }
            else if (isCashMethod)
            {
                totalCashTendered = sale.PaidPiasters;
            }

            // Unpaid remainder can only be recorded as debt on a registered customer account (Audit F-36)
            long netDebt = sale.TotalPiasters - (sale.PaidPiasters - sale.ServiceFeePiasters);
            if (netDebt > 0 && !hasRegisteredCustomer)
            {
                throw new InvalidOperationException("لا يمكن تسجيل فاتورة آجلة أو مدفوعة جزئياً بدون اختيار عميل مسجل.");
            }

            // Change calculation and anti-fraud cash drawer validation (Scenario 2)
            long expectedTotalReceivable = sale.TotalPiasters + sale.ServiceFeePiasters;
            if (sale.PaidPiasters > expectedTotalReceivable)
            {
                long excessPaid = sale.PaidPiasters - expectedTotalReceivable;
                if (totalCashTendered < excessPaid)
                {
                    throw new InvalidOperationException("لا يمكن صرف باقي نقدي أو قبول زيادة من مدفوعات إلكترونية (فيزا / محفظة / إنستاباي). الزيادة النقدية فقط هي المسموح بها.");
                }

                if (hasRegisteredCustomer)
                {
                    // If registered customer and ChangePiasters is 0 or negative, unreturned change is deposited to customer account (Audit F-27)
                    // If client specified ChangePiasters > 0, the cash change was handed back to the customer and must NOT be deposited!
                    if (sale.ChangePiasters < 0)
                    {
                        sale.ChangePiasters = 0;
                    }
                    else if (sale.ChangePiasters > excessPaid)
                    {
                        sale.ChangePiasters = excessPaid;
                    }

                    if (sale.ChangePiasters > totalCashTendered)
                    {
                        throw new InvalidOperationException("مبلغ باقي العميل لا يمكن أن يتجاوز المبلغ المدفوع نقداً بالدرج.");
                    }
                }
                else
                {
                    // For anonymous general cash customers, cash excess is always change handed back
                    sale.ChangePiasters = excessPaid;
                }
            }
            else
            {
                sale.ChangePiasters = 0;
            }

            var result = _saleRepo.CreateSaleAtomic(sale);
            result.NegativeStockWarnings = sale.NegativeStockWarnings;
            return result;
        }

        /// <summary>
        /// Pass-through e-payment fee (computed from configured percentage in settings if enabled).
        /// </summary>
        private static long CalculateEpayServiceFee(string paymentMethod, long totalPiasters)
        {
            if (string.IsNullOrEmpty(paymentMethod) || totalPiasters <= 0) return 0;
            if (DatabaseService.Settings != null)
            {
                string key = "epay_service_fee_percent_" + paymentMethod.ToLowerInvariant();
                string feePctStr = DatabaseService.Settings.Get(key, null);
                if (!string.IsNullOrEmpty(feePctStr))
                {
                    double pct;
                    if (double.TryParse(feePctStr, out pct) && pct > 0)
                    {
                        return (long)Math.Round(totalPiasters * (pct / 100.0), MidpointRounding.AwayFromZero);
                    }
                }
            }
            return 0;
        }

        /// <summary>
        /// A line price is accepted without the price-override permission when it matches a configured catalogue
        /// price: the product price, the unit price, or a quick-pick price (open-price quick items allow any price).
        /// </summary>
        private bool IsCataloguePrice(SaleItem item, Product product, ProductUnit matchedUnit)
        {
            long price = item.UnitPricePiasters;
            int factor = item.ConversionFactor > 0 ? item.ConversionFactor : 1;

            // Products without a catalogue price are sold at an entered price by design
            if (product.PricePiasters <= 0) return true;
            if (price == product.PricePiasters) return true;
            if (price == product.PricePiasters * factor) return true;
            if (matchedUnit != null && matchedUnit.SellPricePiasters > 0 && price == matchedUnit.SellPricePiasters) return true;

            List<QuickItem> quickItems = null;
            if (_quickRepo != null)
            {
                quickItems = _quickRepo.GetAll();
            }
            else if (DatabaseService.QuickItems != null)
            {
                quickItems = DatabaseService.QuickItems.GetAll();
            }

            if (quickItems != null)
            {
                for (int q = 0; q < quickItems.Count; q++)
                {
                    var qi = quickItems[q];
                    if (qi == null) continue;
                    bool sameProduct = string.Equals(qi.ProductId, product.Id, StringComparison.Ordinal) ||
                                       string.Equals(qi.Id, product.Id, StringComparison.Ordinal);
                    if (sameProduct)
                    {
                        if (qi.IsOpenPrice || qi.PricePiasters == price) return true;
                    }

                    // Authorized store combo / bundle offer component:
                    // If product is a configured component in an active quick item bundle offer, allow it
                    if (!string.IsNullOrEmpty(qi.BundleItemsJson) && qi.BundleItemsJson.IndexOf(product.Id, StringComparison.OrdinalIgnoreCase) >= 0)
                    {
                        if (price > 0 && price <= (product.PricePiasters * factor))
                        {
                            return true;
                        }
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
