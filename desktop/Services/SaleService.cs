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
        /// Creates a sale at most once per client checkout key, so a retry after a UI timeout cannot duplicate it (Audit F-09, F-16).
        /// </summary>
        public Sale ProcessSale(Sale sale, string idempotencyKey)
        {
            lock (FinancialWriteLock)
            {
                if (string.IsNullOrWhiteSpace(idempotencyKey) && sale != null && !string.IsNullOrWhiteSpace(sale.IdempotencyKey))
                {
                    idempotencyKey = sale.IdempotencyKey;
                }

                // 1. Fast in-memory cache lookup
                if (!string.IsNullOrWhiteSpace(idempotencyKey) && _completedByIdempotencyKey.ContainsKey(idempotencyKey))
                {
                    return _completedByIdempotencyKey[idempotencyKey];
                }

                // 2. Persistent SQLite idempotency check across app restarts (Audit F-09)
                if (!string.IsNullOrWhiteSpace(idempotencyKey))
                {
                    Sale existing = _saleRepo.GetSaleByIdempotencyKey(idempotencyKey);
                    if (existing != null)
                    {
                        _completedByIdempotencyKey[idempotencyKey] = existing;
                        return existing;
                    }
                }

                if (sale != null && !string.IsNullOrWhiteSpace(idempotencyKey))
                {
                    sale.IdempotencyKey = idempotencyKey;
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

        public static void ClearIdempotencyCache()
        {
            lock (FinancialWriteLock)
            {
                _completedByIdempotencyKey.Clear();
                _idempotencyOrder.Clear();
            }
        }

        public Sale ProcessSale(Sale sale)
        {
            return ProcessSale(sale, null);
        }

        public Sale GetSaleByIdempotencyKey(string idempotencyKey)
        {
            if (string.IsNullOrWhiteSpace(idempotencyKey)) return null;
            return _saleRepo.GetSaleByIdempotencyKey(idempotencyKey);
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

                // 4.5 Fallback to default sale unit if specified
                if (matchedUnit == null && product != null && !string.IsNullOrWhiteSpace(product.DefaultSaleUnitId) && product.Units != null)
                {
                    foreach (var u in product.Units)
                    {
                        if (string.Equals(u.Id, product.DefaultSaleUnitId, StringComparison.OrdinalIgnoreCase))
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

                    // Task 183-3: Loose Unit COGS Engine (Integer arithmetic without floats)
                    if (matchedUnit.CostPricePiasters > 0)
                    {
                        item.UnitCostPiasters = matchedUnit.CostPricePiasters;
                    }
                    else if (product != null && product.CostPiasters > 0)
                    {
                        item.UnitCostPiasters = product.CostPiasters * item.ConversionFactor;
                    }
                    else if (product != null && product.Units != null)
                    {
                        // Check if any package/parent unit has a known cost price to derive COGS without floats
                        long derivedCost = 0;
                        for (int uIdx = 0; uIdx < product.Units.Count; uIdx++)
                        {
                            var pu = product.Units[uIdx];
                            if (pu.CostPricePiasters > 0 && pu.ConversionFactor > 0)
                            {
                                long pkgCost = pu.CostPricePiasters;
                                long pkgFactor = pu.ConversionFactor;
                                long itemFactor = item.ConversionFactor > 0 ? item.ConversionFactor : 1;
                                derivedCost = (pkgCost * itemFactor + (pkgFactor / 2)) / pkgFactor;
                                break;
                            }
                        }
                        if (derivedCost > 0)
                        {
                            item.UnitCostPiasters = derivedCost;
                        }
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
                    bool hasOnSaleRecipe = false;
                    if (DatabaseService.RecipeRepo != null)
                    {
                        try
                        {
                            var rcp = DatabaseService.RecipeRepo.GetByProductId(demandProduct.Id);
                            if (rcp != null && rcp.IsActive && string.Equals(rcp.DepletionMode, "on_sale", StringComparison.OrdinalIgnoreCase))
                            {
                                hasOnSaleRecipe = true;
                            }
                        }
                        catch { }
                    }
                    if (hasOnSaleRecipe)
                    {
                        continue;
                    }
                    if (!allowNegative)
                    {
                        double currentQty = demandProduct.StockQuantityMilli / 1000.0;
                        string unitLabel = !string.IsNullOrWhiteSpace(demandProduct.Unit) ? demandProduct.Unit : "قطعة";
                        throw new InvalidOperationException(string.Format("لا يمكن إتمام البيع: رصيد الصنف '{0}' في المخزن غير كافٍ (الرصيد المتاح حالياً: {1:0.###} {2}). يمكنك إضافة كمية للصنف من شاشة الأصناف أو تفعيل «السماح بالبيع بالسالب» من الإعدادات.", demandProduct.Name, currentQty, unitLabel));
                    }
                    sale.NegativeStockWarnings.Add(string.Format("تنبيه: رصيد الصنف '{0}' قبل البيع كان ({1:0.###}) وأصبح بالسالب.", demandProduct.Name, demandProduct.StockQuantityMilli / 1000.0));
                }
            }

            // Story 131 / Task 188-2: Controlled Drugs Validation Guard
            if (DatabaseService.ControlledDrugRepo != null)
            {
                var controlledIds = DatabaseService.ControlledDrugRepo.GetControlledProductIds();
                if (controlledIds != null && controlledIds.Count > 0)
                {
                    var controlledLines = new List<SaleItem>();
                    for (int i = 0; i < sale.Items.Count; i++)
                    {
                        var it = sale.Items[i];
                        if (it != null && !string.IsNullOrEmpty(it.ProductId) && controlledIds.Contains(it.ProductId))
                        {
                            controlledLines.Add(it);
                        }
                    }

                    if (controlledLines.Count > 0)
                    {
                        if (sale.ControlledDispenses == null || sale.ControlledDispenses.Count == 0)
                        {
                            string firstProdName = controlledLines[0].ProductName ?? controlledLines[0].ProductId;
                            throw new InvalidOperationException(string.Format("الصنف '{0}' خاضع لجدول الرقابة الدوائية والمهدئات، ويلزم تسجيل بيانات المريض والطبيب والروشتة قبل إتمام البيع.", firstProdName));
                        }

                        // Check cashier authorization
                        bool requiresApproval = false;
                        if (DatabaseService.Security != null && !string.IsNullOrEmpty(sale.CashierId))
                        {
                            requiresApproval = !DatabaseService.Security.HasPermission(sale.CashierId, "pharma.controlled.dispense");
                        }

                        // Validate each controlled line has a matching dispense entry
                        for (int clIdx = 0; clIdx < controlledLines.Count; clIdx++)
                        {
                            var cLine = controlledLines[clIdx];
                            ControlledDrugDispense matchingDispense = null;

                            for (int cdIdx = 0; cdIdx < sale.ControlledDispenses.Count; cdIdx++)
                            {
                                var d = sale.ControlledDispenses[cdIdx];
                                if (d != null && string.Equals(d.ProductId, cLine.ProductId, StringComparison.OrdinalIgnoreCase))
                                {
                                    matchingDispense = d;
                                    break;
                                }
                            }

                            if (matchingDispense == null)
                            {
                                throw new InvalidOperationException(string.Format("لم يتم تسجيل بيانات صرف دواء الجدول للصنف '{0}'.", cLine.ProductName ?? cLine.ProductId));
                            }

                            matchingDispense.ProductId = cLine.ProductId;
                            matchingDispense.ProductName = cLine.ProductName;
                            matchingDispense.QuantityMilli = cLine.QuantityMilli;
                            matchingDispense.BatchId = cLine.BatchId;
                            matchingDispense.BatchNumber = cLine.BatchNumber;

                            if (DatabaseService.ControlledDrugs != null)
                            {
                                DatabaseService.ControlledDrugs.ValidateAndPrepareDispense(
                                    matchingDispense,
                                    sale.CashierId,
                                    requiresApproval,
                                    sale.SupervisorPin);
                            }
                        }
                    }
                }
            }

            // Task 24-2: Proportional Invoice Discount Distribution (F-01 & C3)
            long existingItemDiscountsSum = 0;
            long[] grossPiasters = new long[sale.Items.Count];
            long[] remainingNetPiasters = new long[sale.Items.Count];

            for (int i = 0; i < sale.Items.Count; i++)
            {
                var it = sale.Items[i];
                Money uPrice = Money.FromPiasters(it.UnitPricePiasters);
                grossPiasters[i] = uPrice.MultiplyByMilliUnits(it.QuantityMilli).Piasters;

                if (it.DiscountPiasters < 0) it.DiscountPiasters = 0;
                if (it.DiscountPiasters > grossPiasters[i]) it.DiscountPiasters = grossPiasters[i];

                existingItemDiscountsSum += it.DiscountPiasters;
                remainingNetPiasters[i] = Math.Max(0, grossPiasters[i] - it.DiscountPiasters);
            }

            long totalRemainingNet = 0;
            for (int i = 0; i < sale.Items.Count; i++)
            {
                totalRemainingNet += remainingNetPiasters[i];
            }

            long invoiceDiscount = sale.DiscountPiasters;
            if (invoiceDiscount < 0) invoiceDiscount = 0;
            if (invoiceDiscount > totalRemainingNet) invoiceDiscount = totalRemainingNet;
            sale.DiscountPiasters = invoiceDiscount;

            long[] distributedInvoiceDiscount = new long[sale.Items.Count];
            if (invoiceDiscount > 0 && totalRemainingNet > 0)
            {
                distributedInvoiceDiscount = Money.DistributeInvoiceDiscount(remainingNetPiasters, invoiceDiscount);
            }

            // Finalize item line totals and calculate tax (Audit F-004: Support inclusive and exclusive pricing)
            bool pricesIncludeTax = true;
            if (DatabaseService.Settings != null)
            {
                string incSetting = DatabaseService.Settings.Get("prices_include_tax", "1");
                pricesIncludeTax = (incSetting == "1" || string.Equals(incSetting, "true", StringComparison.OrdinalIgnoreCase));
            }

            for (int i = 0; i < sale.Items.Count; i++)
            {
                var it = sale.Items[i];
                // Item Total is net after line discount AND its distributed share of invoice discount
                it.TotalPiasters = Math.Max(0, remainingNetPiasters[i] - distributedInvoiceDiscount[i]);

                if (it.TaxRatePercent.HasValue && it.TaxRatePercent.Value > 0)
                {
                    it.TaxPiasters = Money.CalculateTaxPiasters(it.TotalPiasters, it.TaxRatePercent.Value, pricesIncludeTax);
                    totalTax = totalTax.Add(Money.FromPiasters(it.TaxPiasters));
                }
                else
                {
                    it.TaxPiasters = 0;
                }
            }

            sale.SubtotalPiasters = subtotal.Piasters;
            sale.TaxPiasters = totalTax.Piasters;
            long totalDiscountPiasters = existingItemDiscountsSum + sale.DiscountPiasters;
            totalDiscount = Money.FromPiasters(totalDiscountPiasters);

            if (sale.ServiceChargePiasters < 0) sale.ServiceChargePiasters = 0;
            if (sale.DeliveryFeePiasters < 0) sale.DeliveryFeePiasters = 0;
            if (string.IsNullOrWhiteSpace(sale.OrderType)) sale.OrderType = "takeaway";

            // F-004: When prices include tax, tax is already part of the item price and must not be added again
            Money grandTotal = pricesIncludeTax
                ? subtotal.Subtract(totalDiscount)
                : subtotal.Subtract(totalDiscount).Add(totalTax);
            sale.TotalPiasters = Math.Max(0, grandTotal.Piasters + sale.ServiceChargePiasters + sale.DeliveryFeePiasters);

            // Server-side Cashier Discount Limit Enforcement (Scenario 3 / Audit Security Rule 8 & F-10)
            // Prevent client-side bypass: verify that any discount exceeding cashier limits has supervisor authorization
            if (SecurityService.CurrentUser != null)
            {
                bool isPrivilegedUser = SecurityService.CurrentUser.Role == "root" ||
                                        SecurityService.CurrentUser.Role == "admin" ||
                                        (DatabaseService.Security != null &&
                                         (DatabaseService.Security.HasPermission(SecurityService.CurrentUser.Id, "pos.discount_unlimited") ||
                                          DatabaseService.Security.HasPermission(SecurityService.CurrentUser.Id, "pos.discount_override")));

                if (!isPrivilegedUser && subtotal.Piasters > 0 && totalDiscountPiasters > 0)
                {
                    int maxPct = 10;
                    long maxAmountPiasters = 5000; // 50 EGP
                    if (DatabaseService.Settings != null)
                    {
                        int.TryParse(DatabaseService.Settings.Get("max_discount_percent_cashier", "10"), out maxPct);
                        long.TryParse(DatabaseService.Settings.Get("max_discount_amount_cashier_piasters", "5000"), out maxAmountPiasters);
                    }

                    long discountPct = (totalDiscountPiasters * 100L) / subtotal.Piasters;
                    // F-005: Use exact multiplication check to prevent integer truncation bypass (e.g. 10.99% passing 10% limit)
                    bool exceedsPercent = (totalDiscountPiasters * 100L) > ((long)maxPct * subtotal.Piasters);
                    bool exceedsAmount = totalDiscountPiasters > maxAmountPiasters;

                    if (exceedsPercent || exceedsAmount)
                    {
                        string supPin = sale.SupervisorPin;
                        if (string.IsNullOrWhiteSpace(supPin))
                        {
                            throw new InvalidOperationException(string.Format(
                                "قيمة الخصم ({0:0.00} ج.م / {1}%) تتجاوز الحد الأقصى المصرح به للكاشير ({2:0.00} ج.م / {3}%) وتتطلب إدخال واعتماد الرقم السري للمشرف.",
                                totalDiscountPiasters / 100.0,
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

                        // F-11: Log supervisor override server-side with full cryptographic audit trail
                        if (DatabaseService.AuditRepo != null)
                        {
                            DatabaseService.AuditRepo.Log(new AuditLog
                            {
                                Id = "aud_" + Guid.NewGuid().ToString("N"),
                                UserId = !string.IsNullOrEmpty(supCheck.SupervisorName) ? supCheck.SupervisorName : (SecurityService.CurrentUser != null ? SecurityService.CurrentUser.Username : "cashier"),
                                Action = "DISCOUNT_SUPERVISOR_OVERRIDE",
                                EntityType = "SALE",
                                EntityId = sale.Id,
                                DetailsJson = string.Format("{{\"discountPiasters\":{0},\"subtotalPiasters\":{1},\"supervisor\":\"{2}\",\"saleId\":\"{3}\"}}",
                                    totalDiscountPiasters, subtotal.Piasters, supCheck.SupervisorName ?? "", sale.Id),
                                CreatedAt = DateTime.UtcNow.ToString("o")
                            });
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

            // Insurance Claim Processing (Story 132 / Feature #189)
            if (sale.InsuranceClaim != null)
            {
                if (SecurityService.CurrentUser != null && DatabaseService.Security != null &&
                    !DatabaseService.Security.HasPermission(SecurityService.CurrentUser.Id, "insurance.sell"))
                {
                    throw new InvalidOperationException("المستخدم الحالي لا يملك صلاحية بيع روشتات التأمين الطبي (insurance.sell).");
                }

                if (DatabaseService.Insurance == null)
                {
                    throw new InvalidOperationException("نظام التأمين الطبي غير مفعل في قاعدة البيانات.");
                }

                var split = DatabaseService.Insurance.CalculateSplit(sale.InsuranceClaim.ContractId, sale.Items);
                sale.InsuranceClaim.SaleId = sale.Id;
                sale.InsuranceClaim.TotalInvoicePiasters = sale.TotalPiasters;
                sale.InsuranceClaim.CoveredPiasters = split.CoveredPiasters;
                sale.InsuranceClaim.PatientPiasters = split.PatientPiasters;
                sale.InsuranceClaim.CompanyPiasters = split.CompanyPiasters;
                if (string.IsNullOrEmpty(sale.InsuranceClaim.Status))
                {
                    sale.InsuranceClaim.Status = "pending";
                }

                // Ensure company share is represented in Payments under method "insurance"
                if (sale.Payments == null)
                {
                    sale.Payments = new List<SalePayment>();
                }

                bool hasInsurancePayment = false;
                for (int pi = 0; pi < sale.Payments.Count; pi++)
                {
                    if (string.Equals(sale.Payments[pi].Method, "insurance", StringComparison.OrdinalIgnoreCase))
                    {
                        sale.Payments[pi].AmountPiasters = split.CompanyPiasters;
                        hasInsurancePayment = true;
                        break;
                    }
                }

                if (!hasInsurancePayment && split.CompanyPiasters > 0)
                {
                    sale.Payments.Add(new SalePayment
                    {
                        Method = "insurance",
                        AmountPiasters = split.CompanyPiasters
                    });
                }

                // If no other payment was specified, default patient co-pay to sale.PaymentMethod or cash
                long nonInsuranceInPayments = 0;
                for (int pi = 0; pi < sale.Payments.Count; pi++)
                {
                    if (!string.Equals(sale.Payments[pi].Method, "insurance", StringComparison.OrdinalIgnoreCase))
                    {
                        nonInsuranceInPayments += sale.Payments[pi].AmountPiasters;
                    }
                }

                if (nonInsuranceInPayments == 0 && split.PatientPiasters > 0)
                {
                    string patientMethod = string.IsNullOrEmpty(sale.PaymentMethod) || string.Equals(sale.PaymentMethod, "insurance", StringComparison.OrdinalIgnoreCase)
                        ? "cash"
                        : sale.PaymentMethod;
                    sale.Payments.Add(new SalePayment
                    {
                        Method = patientMethod,
                        AmountPiasters = split.PatientPiasters
                    });
                }

                // Total paid across non-credit payments is full invoice (or patient payment + company claim)
                long totalNonCreditInPayments = 0;
                for (int pi = 0; pi < sale.Payments.Count; pi++)
                {
                    if (!string.Equals(sale.Payments[pi].Method, "credit", StringComparison.OrdinalIgnoreCase))
                    {
                        totalNonCreditInPayments += sale.Payments[pi].AmountPiasters;
                    }
                }
                sale.PaidPiasters = totalNonCreditInPayments;
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
                    decimal pct;
                    if (decimal.TryParse(feePctStr, System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out pct) && pct > 0)
                    {
                        // F-21: Integer basis points arithmetic (e.g. 1.5% -> 150 bps)
                        long bps = (long)Math.Round(pct * 100m, MidpointRounding.AwayFromZero);
                        return (totalPiasters * bps + 5000) / 10000;
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

            // Story 140 / Feature #197: Item Modifiers price authority validation
            // If item has modifiers, subtract verified modifier extra prices and check against base catalogue price
            if (item.Modifiers != null && item.Modifiers.Count > 0)
            {
                long modifiersExtra = 0;
                for (int m = 0; m < item.Modifiers.Count; m++)
                {
                    var mod = item.Modifiers[m];
                    if (mod == null) continue;
                    if (!string.IsNullOrEmpty(mod.OptionId) && DatabaseService.ModifierRepo != null)
                    {
                        var opt = DatabaseService.ModifierRepo.GetOptionById(mod.OptionId);
                        if (opt != null && opt.ExtraPricePiasters >= 0)
                        {
                            modifiersExtra += opt.ExtraPricePiasters;
                            mod.ExtraPricePiasters = opt.ExtraPricePiasters;
                            continue;
                        }
                    }
                    if (mod.ExtraPricePiasters > 0)
                    {
                        modifiersExtra += mod.ExtraPricePiasters;
                    }
                }

                long basePriceWithoutModifiers = price - modifiersExtra;
                if (basePriceWithoutModifiers == product.PricePiasters || basePriceWithoutModifiers == product.PricePiasters * factor)
                {
                    return true;
                }
                if (matchedUnit != null && matchedUnit.SellPricePiasters > 0 && basePriceWithoutModifiers == matchedUnit.SellPricePiasters)
                {
                    return true;
                }
            }

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

            // Task 184-2: Batch-level pricing (feature_batch_pricing)
            // If the product has batches with custom selling prices, match either the item's specific batch or any active batch
            if (DatabaseService.ProductBatchRepo != null && !string.IsNullOrEmpty(product.Id))
            {
                try
                {
                    if (!string.IsNullOrEmpty(item.BatchId))
                    {
                        var b = DatabaseService.ProductBatchRepo.GetById(item.BatchId);
                        if (b != null && b.SellPricePiasters.HasValue && b.SellPricePiasters.Value > 0)
                        {
                            long batchPrice = b.SellPricePiasters.Value;
                            if (price == batchPrice || price == batchPrice * factor) return true;
                        }
                    }
                    else
                    {
                        var batches = DatabaseService.ProductBatchRepo.GetByProductId(product.Id);
                        if (batches != null)
                        {
                            for (int bi = 0; bi < batches.Count; bi++)
                            {
                                var b = batches[bi];
                                if (b != null && b.SellPricePiasters.HasValue && b.SellPricePiasters.Value > 0)
                                {
                                    long batchPrice = b.SellPricePiasters.Value;
                                    if (price == batchPrice || price == batchPrice * factor) return true;
                                }
                            }
                        }
                    }
                }
                catch
                {
                    // Fail gracefully and fallback
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
