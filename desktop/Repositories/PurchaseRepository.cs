using System;
using System.Collections.Generic;
using System.Data.SQLite;
using RafiqPOS.Common;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Repositories
{
    public class PurchaseRepository
    {
        private readonly string _connectionString;
        private readonly CounterRepository _counterRepo;
        private readonly SupplierRepository _supplierRepo;
        private readonly ProductPriceHistoryRepository _priceHistoryRepo;
        private readonly AuditLogRepository _auditRepo;
        private readonly ProductBatchRepository _batchRepo;

        public PurchaseRepository(
            string connectionString,
            CounterRepository counterRepo = null,
            SupplierRepository supplierRepo = null,
            ProductPriceHistoryRepository priceHistoryRepo = null,
            AuditLogRepository auditRepo = null,
            ProductBatchRepository batchRepo = null)
        {
            _connectionString = connectionString;
            _counterRepo = counterRepo ?? new CounterRepository(connectionString);
            _auditRepo = auditRepo ?? new AuditLogRepository(connectionString);
            _supplierRepo = supplierRepo ?? new SupplierRepository(connectionString, _auditRepo);
            _priceHistoryRepo = priceHistoryRepo ?? new ProductPriceHistoryRepository(connectionString);
            _batchRepo = batchRepo ?? new ProductBatchRepository(connectionString, _auditRepo);
        }

        public Purchase CreatePurchase(Purchase purchase, string costingMethod = "LATEST", string userId = null)
        {
            if (purchase == null) throw new ArgumentNullException("purchase");
            if (purchase.Items == null || purchase.Items.Count == 0)
            {
                throw new ArgumentException("لا يمكن إنشاء فاتورة شراء بدون بنود/أصناف");
            }

            string now = DateTime.UtcNow.ToString("o");
            purchase.Id = string.IsNullOrWhiteSpace(purchase.Id) ? "pur_" + Guid.NewGuid().ToString("N") : purchase.Id;
            purchase.CreatedAt = now;
            purchase.UpdatedAt = now;
            if (string.IsNullOrWhiteSpace(purchase.InvoiceDate))
            {
                purchase.InvoiceDate = now;
            }

            lock (SaleService.FinancialWriteLock)
            {
                using (var conn = new SQLiteConnection(_connectionString))
                {
                    conn.Open();
                    using (var trans = conn.BeginTransaction())
                    {
                    try
                    {
                        // Validate Supplier if supplied
                        if (!string.IsNullOrWhiteSpace(purchase.SupplierId))
                        {
                            using (var sCmd = new SQLiteCommand("SELECT is_active FROM suppliers WHERE id = @supId LIMIT 1;", conn, trans))
                            {
                                sCmd.Parameters.AddWithValue("@supId", purchase.SupplierId);
                                object sRes = sCmd.ExecuteScalar();
                                if (sRes == null || sRes == DBNull.Value)
                                {
                                    throw new InvalidOperationException("المورد المحدد غير موجود في قاعدة البيانات");
                                }
                                if (Convert.ToInt32(sRes) == 0)
                                {
                                    throw new InvalidOperationException("لا يمكن إضافة فاتورة شراء لمورد مؤرشف");
                                }
                            }
                        }

                        // 1. Get next atomic purchase invoice number
                        purchase.InvoiceNumber = _counterRepo.GetNextCounterNumber(conn, trans, "purchase_invoice", "purchases", "invoice_number");

                        // 2. Calculate item totals and compute invoice total
                        long totalGrossCost = 0;
                        long totalLineDiscounts = 0;
                        for (int i = 0; i < purchase.Items.Count; i++)
                        {
                            var item = purchase.Items[i];
                            if (string.IsNullOrWhiteSpace(item.ProductId))
                            {
                                throw new ArgumentException(string.Format("الصنف رقم {0} غير صالح أو بدون معرف", i + 1));
                            }
                            if (item.QuantityMilli <= 0)
                            {
                                throw new ArgumentException(string.Format("كمية الشراء للصنف '{0}' يجب أن تكون أكبر من الصفر", item.ProductName ?? item.ProductId));
                            }
                            if (item.BonusQuantityMilli < 0)
                            {
                                throw new ArgumentException(string.Format("كمية البونص المجانية للصنف '{0}' لا يمكن أن تكون سالبة", item.ProductName ?? item.ProductId));
                            }
                            // Conversion Factor Validation Guard (Task 182-3 / F3 Security)
                            if (item.ConversionFactor == 0)
                            {
                                item.ConversionFactor = 1.0;
                            }
                            if (item.ConversionFactor < 1.0 || Math.Abs(item.ConversionFactor - Math.Round(item.ConversionFactor)) > 0.000001)
                            {
                                throw new ArgumentException(string.Format("معامل تحويل العبوة للصنف '{0}' يجب أن يكون رقماً صحيحاً موجباً", item.ProductName ?? item.ProductId));
                            }

                            if (item.PackageCostPiasters > 0 && item.ConversionFactor > 0 && item.UnitCostPiasters <= 0)
                            {
                                item.UnitCostPiasters = (long)Math.Round((decimal)item.PackageCostPiasters / (decimal)item.ConversionFactor, MidpointRounding.AwayFromZero);
                            }

                            // Pharmacy Distributor Pricing (P10 / Story 136): Calculate unit cost from public price minus distributor discount bps
                            if (item.PublicPricePiasters.HasValue && item.PublicPricePiasters.Value > 0)
                            {
                                long pubPrice = item.PublicPricePiasters.Value;
                                int distBps = item.DistributorDiscountBps.HasValue ? item.DistributorDiscountBps.Value : 0;
                                if (distBps < 0) distBps = 0;
                                if (distBps > 10000) distBps = 10000;

                                if (item.UnitCostPiasters <= 0)
                                {
                                    item.UnitCostPiasters = (long)Math.Round((decimal)pubPrice * (10000 - distBps) / 10000m, MidpointRounding.AwayFromZero);
                                }

                                if (!item.NewSellingPricePiasters.HasValue || item.NewSellingPricePiasters.Value <= 0)
                                {
                                    item.NewSellingPricePiasters = pubPrice;
                                }
                            }

                            if (item.UnitCostPiasters < 0)
                            {
                                throw new ArgumentException(string.Format("تكلفة شراء الصنف '{0}' لا يمكن أن تكون سالبة", item.ProductName ?? item.ProductId));
                            }
                            if (item.DiscountPiasters < 0)
                            {
                                throw new ArgumentException(string.Format("قيمة خصم الصنف '{0}' لا يمكن أن تكون سالبة", item.ProductName ?? item.ProductId));
                            }

                            // Integer Financial Arithmetic: compute exact piasters via Money struct (Half-Up AwayFromZero)
                            long lineGross = Money.FromPiasters(item.UnitCostPiasters).MultiplyByMilliUnits(item.QuantityMilli).Piasters;
                            if (item.DiscountPiasters > lineGross)
                            {
                                item.DiscountPiasters = lineGross;
                            }
                            item.TotalCostPiasters = lineGross - item.DiscountPiasters;
                            totalGrossCost += lineGross;
                            totalLineDiscounts += item.DiscountPiasters;
                        }

                        if (purchase.DiscountPiasters < 0)
                        {
                            throw new ArgumentException("قيمة الخصم في فاتورة الشراء لا يمكن أن تكون سالبة");
                        }

                        long totalAfterLineDiscounts = Math.Max(0, totalGrossCost - totalLineDiscounts);
                        if (purchase.DiscountPiasters > totalAfterLineDiscounts)
                        {
                            purchase.DiscountPiasters = totalAfterLineDiscounts;
                        }

                        purchase.TotalCostPiasters = totalAfterLineDiscounts;
                        purchase.NetCostPiasters = Math.Max(0, totalAfterLineDiscounts - purchase.DiscountPiasters);

                        // Reject unpaid/overpaid purchases without a registered supplier (Prevents orphaned debts/credits)
                        if (purchase.PaidAmountPiasters != purchase.NetCostPiasters && string.IsNullOrWhiteSpace(purchase.SupplierId))
                        {
                            throw new InvalidOperationException("يجب اختيار المورد أولاً لتسجيل فاتورة شراء آجلة أو بسداد جزئي أو بمبلغ زائد.");
                        }

                        // Validate paid amount and set payment status
                        if (purchase.PaidAmountPiasters < 0) purchase.PaidAmountPiasters = 0;

                        if (purchase.PaidAmountPiasters >= purchase.NetCostPiasters)
                        {
                            purchase.RemainingAmountPiasters = 0;
                            purchase.PaymentStatus = purchase.PaidAmountPiasters > purchase.NetCostPiasters ? "OVERPAID" : "PAID";
                        }
                        else
                        {
                            purchase.RemainingAmountPiasters = purchase.NetCostPiasters - purchase.PaidAmountPiasters;
                            purchase.PaymentStatus = purchase.PaidAmountPiasters > 0 ? "PARTIAL" : "CREDIT";
                        }

                        string paySource = !string.IsNullOrWhiteSpace(purchase.PaymentSource) ? purchase.PaymentSource : "cash_drawer";
                        if (purchase.PaidAmountPiasters > 0 && string.Equals(paySource, "cash_drawer", StringComparison.OrdinalIgnoreCase))
                        {
                            var currentBDate = Services.BusinessDayHelper.GetCurrentBusinessDate(conn, trans);
                            if (Services.BusinessDayHelper.IsBusinessDayClosed(conn, trans, currentBDate))
                            {
                                throw new InvalidOperationException("لا يمكن سداد فاتورة شراء من درج الكاشير لتاريخ عمل تم إقفاله وتشميعه مسبقاً.");
                            }

                            if (DatabaseService.DailyClosing != null)
                            {
                                var liveBal = DatabaseService.DailyClosing.GetLiveDrawerBalance(currentBDate.ToString("yyyy-MM-dd"));
                                if (liveBal != null && liveBal.AvailableCashPiasters < purchase.PaidAmountPiasters)
                                {
                                    throw new InvalidOperationException(string.Format("رصيد نقدية الدرج المتاح حالياً ({0:N2} ج.م) غير كافٍ لسداد فاتورة الشراء نقداً ({1:N2} ج.م). يرجى اختيار السداد من «كاش خارجي من صاحب المحل» أو توريد عهدة للدرج أولاً.", liveBal.AvailableCashPiasters / 100.0, purchase.PaidAmountPiasters / 100.0));
                                }
                            }
                        }

                        // 3. Insert Purchase Master Record
                        string insertMasterSql = @"
                            INSERT INTO purchases (
                                id, invoice_number, supplier_id, supplier_invoice_number,
                                invoice_date, total_cost_piasters, discount_piasters,
                                net_cost_piasters, paid_amount_piasters, remaining_amount_piasters,
                                payment_status, payment_source, status, notes, created_by_user_id,
                                created_at, updated_at
                            ) VALUES (
                                @id, @invNum, @supId, @supInvNum,
                                @invDate, @totalCost, @discount,
                                @netCost, @paidAmt, @remAmt,
                                @payStatus, @paySource, @status, @notes, @userId,
                                @createdAt, @updatedAt
                            );
                        ";
                        using (var cmd = new SQLiteCommand(insertMasterSql, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@id", purchase.Id);
                            cmd.Parameters.AddWithValue("@invNum", purchase.InvoiceNumber);
                            cmd.Parameters.AddWithValue("@supId", (object)purchase.SupplierId ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@supInvNum", (object)purchase.SupplierInvoiceNumber ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@invDate", purchase.InvoiceDate);
                            cmd.Parameters.AddWithValue("@totalCost", purchase.TotalCostPiasters);
                            cmd.Parameters.AddWithValue("@discount", purchase.DiscountPiasters);
                            cmd.Parameters.AddWithValue("@netCost", purchase.NetCostPiasters);
                            cmd.Parameters.AddWithValue("@paidAmt", purchase.PaidAmountPiasters);
                            cmd.Parameters.AddWithValue("@remAmt", purchase.RemainingAmountPiasters);
                            cmd.Parameters.AddWithValue("@payStatus", purchase.PaymentStatus);
                            cmd.Parameters.AddWithValue("@paySource", !string.IsNullOrWhiteSpace(purchase.PaymentSource) ? purchase.PaymentSource : "cash_drawer");
                            cmd.Parameters.AddWithValue("@status", purchase.Status);
                            cmd.Parameters.AddWithValue("@notes", (object)purchase.Notes ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@userId", (object)userId ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@createdAt", purchase.CreatedAt);
                            cmd.Parameters.AddWithValue("@updatedAt", purchase.UpdatedAt);
                            cmd.ExecuteNonQuery();
                        }

                        // 4. Process Each Item (Insert item, update stock, cost, price history, stock movement)
                        long remainingInvDiscount = purchase.DiscountPiasters;
                        for (int i = 0; i < purchase.Items.Count; i++)
                        {
                            var item = purchase.Items[i];
                            item.Id = string.IsNullOrWhiteSpace(item.Id) ? "pi_" + Guid.NewGuid().ToString("N") : item.Id;
                            item.PurchaseId = purchase.Id;
                            item.CreatedAt = now;

                            long itemInvDiscount = 0;
                            if (purchase.DiscountPiasters > 0 && totalAfterLineDiscounts > 0)
                            {
                                if (i == purchase.Items.Count - 1)
                                {
                                    itemInvDiscount = remainingInvDiscount;
                                }
                                else
                                {
                                    itemInvDiscount = (long)Math.Round((decimal)purchase.DiscountPiasters * item.TotalCostPiasters / totalAfterLineDiscounts, MidpointRounding.AwayFromZero);
                                    if (itemInvDiscount > remainingInvDiscount) itemInvDiscount = remainingInvDiscount;
                                    remainingInvDiscount -= itemInvDiscount;
                                }
                            }

                            long lineNetCost = Math.Max(0, item.TotalCostPiasters - itemInvDiscount);
                            long totalReceivedMilli = item.QuantityMilli + item.BonusQuantityMilli;

                            // Real effective unit cost (Net Cost / Total Received Quantity)
                            long effectiveUnitCost = item.UnitCostPiasters;
                            if (totalReceivedMilli > 0)
                            {
                                effectiveUnitCost = (long)Math.Round(((decimal)lineNetCost * 1000m) / totalReceivedMilli, MidpointRounding.AwayFromZero);
                            }

                            // Fetch current product state
                            long currentStock = 0;
                            long currentCost = 0;
                            long currentPrice = 0;
                            string productName = item.ProductName;
                            string barcode = item.Barcode;

                            string selectProdSql = "SELECT name, barcode, stock_quantity_milli, cost_piasters, price_piasters, has_variants, is_active FROM products WHERE id = @pid LIMIT 1;";
                            using (var prodCmd = new SQLiteCommand(selectProdSql, conn, trans))
                            {
                                prodCmd.Parameters.AddWithValue("@pid", item.ProductId);
                                using (var reader = prodCmd.ExecuteReader())
                                {
                                    if (reader.Read())
                                    {
                                        productName = reader["name"].ToString();
                                        barcode = reader["barcode"] != DBNull.Value ? reader["barcode"].ToString() : null;
                                        currentStock = Convert.ToInt64(reader["stock_quantity_milli"]);
                                        currentCost = Convert.ToInt64(reader["cost_piasters"]);
                                        currentPrice = Convert.ToInt64(reader["price_piasters"]);
                                        bool isActive = true;
                                        try { isActive = Convert.ToInt32(reader["is_active"]) == 1; } catch { }
                                        if (!isActive)
                                        {
                                            throw new InvalidOperationException(string.Format("لا يمكن إضافة فاتورة شراء للصنف '{0}' لأنه صنف مؤرشف أو محذوف.", productName));
                                        }

                                        bool hasVariants = false;
                                        try { hasVariants = Convert.ToInt32(reader["has_variants"]) == 1; } catch { }
                                        if (!hasVariants)
                                        {
                                            using (var vChkCmd = new SQLiteCommand("SELECT 1 FROM products WHERE parent_id = @pid AND is_active = 1 LIMIT 1;", conn, trans))
                                            {
                                                vChkCmd.Parameters.AddWithValue("@pid", item.ProductId);
                                                object vChkRes = vChkCmd.ExecuteScalar();
                                                if (vChkRes != null && vChkRes != DBNull.Value)
                                                {
                                                    hasVariants = true;
                                                }
                                            }
                                        }

                                        if (hasVariants)
                                        {
                                            throw new InvalidOperationException(string.Format("لا يمكن إضافة كميات شراء للمنتج الرئيسي '{0}' مباشرة لوجود متغيرات (ألوان ومقاسات) مرتبطة به. يرجى اختيار المتغير المحدد للشراء.", productName));
                                        }
                                    }
                                    else
                                    {
                                        throw new InvalidOperationException("المنتج غير موجود في قاعدة البيانات: " + item.ProductId);
                                    }
                                }
                            }

                            item.ProductName = productName;
                            item.Barcode = barcode;
                            item.PreviousCostPiasters = currentCost;

                            // Register or update Batch in product_batches (Feature #60 / Task 60-3)
                            string batchId = null;
                            string batchNumber = item.BatchNumber;
                            if (!string.IsNullOrEmpty(batchNumber) || !string.IsNullOrEmpty(item.ExpiryDate))
                            {
                                if (string.IsNullOrEmpty(batchNumber))
                                {
                                    batchNumber = "P" + purchase.InvoiceNumber + "-" + (i + 1);
                                }
                                var batchRecord = new ProductBatch
                                {
                                    ProductId = item.ProductId,
                                    BatchNumber = batchNumber,
                                    ExpiryDate = item.ExpiryDate,
                                    ProductionDate = item.ProductionDate,
                                    QuantityMilli = totalReceivedMilli,
                                    CostPricePiasters = effectiveUnitCost,
                                    SellPricePiasters = item.NewSellingPricePiasters.HasValue && item.NewSellingPricePiasters.Value > 0
                                        ? item.NewSellingPricePiasters
                                        : item.PublicPricePiasters,
                                    PublicPricePiasters = item.PublicPricePiasters,
                                    SupplierId = purchase.SupplierId,
                                    PurchaseId = purchase.Id,
                                    Notes = "فاتورة شراء #" + purchase.InvoiceNumber
                                };
                                batchRecord = _batchRepo.CreateOrUpdateBatch(batchRecord, conn, trans);
                                batchId = batchRecord.Id;
                                item.BatchNumber = batchRecord.BatchNumber;
                            }

                            // Insert into purchase_items (including F-34 packaging columns)
                            string insertItemSql = @"
                                INSERT INTO purchase_items (
                                    id, purchase_id, product_id, product_name, barcode,
                                    quantity_milli, bonus_quantity_milli, unit_cost_piasters, discount_piasters, total_cost_piasters,
                                    previous_cost_piasters, new_selling_price_piasters,
                                    batch_number, expiry_date, production_date,
                                    unit_id, unit_name, conversion_factor, package_cost_piasters,
                                    public_price_piasters, distributor_discount_bps,
                                    created_at
                                ) VALUES (
                                    @id, @purId, @prodId, @prodName, @barcode,
                                    @qty, @bonusQty, @unitCost, @discount, @totalCost,
                                    @prevCost, @newPrice,
                                    @bnum, @exp, @prodDate,
                                    @unitId, @unitName, @convFactor, @pkgCost,
                                    @pubPrice, @distBps,
                                    @createdAt
                                );
                            ";
                            using (var cmd = new SQLiteCommand(insertItemSql, conn, trans))
                            {
                                cmd.Parameters.AddWithValue("@id", item.Id);
                                cmd.Parameters.AddWithValue("@purId", purchase.Id);
                                cmd.Parameters.AddWithValue("@prodId", item.ProductId);
                                cmd.Parameters.AddWithValue("@prodName", item.ProductName);
                                cmd.Parameters.AddWithValue("@barcode", (object)item.Barcode ?? DBNull.Value);
                                cmd.Parameters.AddWithValue("@qty", item.QuantityMilli);
                                cmd.Parameters.AddWithValue("@bonusQty", item.BonusQuantityMilli);
                                cmd.Parameters.AddWithValue("@unitCost", item.UnitCostPiasters);
                                cmd.Parameters.AddWithValue("@discount", item.DiscountPiasters + itemInvDiscount);
                                cmd.Parameters.AddWithValue("@totalCost", lineNetCost);
                                cmd.Parameters.AddWithValue("@prevCost", item.PreviousCostPiasters);
                                cmd.Parameters.AddWithValue("@newPrice", (object)item.NewSellingPricePiasters ?? DBNull.Value);
                                cmd.Parameters.AddWithValue("@bnum", (object)item.BatchNumber ?? DBNull.Value);
                                cmd.Parameters.AddWithValue("@exp", (object)item.ExpiryDate ?? DBNull.Value);
                                cmd.Parameters.AddWithValue("@prodDate", (object)item.ProductionDate ?? DBNull.Value);
                                cmd.Parameters.AddWithValue("@unitId", (object)item.UnitId ?? DBNull.Value);
                                cmd.Parameters.AddWithValue("@unitName", (object)item.UnitName ?? DBNull.Value);
                                cmd.Parameters.AddWithValue("@convFactor", item.ConversionFactor > 0 ? item.ConversionFactor : 1.0);
                                cmd.Parameters.AddWithValue("@pkgCost", item.PackageCostPiasters);
                                cmd.Parameters.AddWithValue("@pubPrice", item.PublicPricePiasters.HasValue ? (object)item.PublicPricePiasters.Value : DBNull.Value);
                                cmd.Parameters.AddWithValue("@distBps", item.DistributorDiscountBps.HasValue ? (object)item.DistributorDiscountBps.Value : DBNull.Value);
                                cmd.Parameters.AddWithValue("@createdAt", item.CreatedAt);
                                cmd.ExecuteNonQuery();
                            }

                            // Calculate new cost
                            long newCost = currentCost;
                            if (string.Equals(costingMethod, "LATEST", StringComparison.OrdinalIgnoreCase))
                            {
                                newCost = effectiveUnitCost;
                            }
                            else if (string.Equals(costingMethod, "KEEP", StringComparison.OrdinalIgnoreCase))
                            {
                                newCost = currentCost;
                            }
                            else // Default or WEIGHTED_AVERAGE
                            {
                                long validCurrentStock = Math.Max(0, currentStock);
                                long totalQty = validCurrentStock + totalReceivedMilli;
                                if (totalQty > 0)
                                {
                                    // Weighted average cost with Half-Up AwayFromZero financial rounding
                                    decimal totalValue = ((decimal)validCurrentStock * currentCost) + ((decimal)totalReceivedMilli * effectiveUnitCost);
                                    newCost = (long)Math.Round(totalValue / (decimal)totalQty, 0, MidpointRounding.AwayFromZero);
                                }
                                else
                                {
                                    newCost = effectiveUnitCost;
                                }
                            }

                            // Determine if selling price is updated
                            long newPriceToSet = currentPrice;
                            bool updateSellingPrice = item.NewSellingPricePiasters.HasValue && item.NewSellingPricePiasters.Value > 0;
                            if (updateSellingPrice)
                            {
                                newPriceToSet = item.NewSellingPricePiasters.Value;
                            }

                            // Update Product Stock, Cost, and Selling Price
                            string updateProdSql = @"
                                UPDATE products
                                SET stock_quantity_milli = stock_quantity_milli + @qtyDelta,
                                    cost_piasters = @newCost,
                                    price_piasters = @newPrice,
                                    updated_at = @now
                                WHERE id = @pid;
                            ";
                            using (var cmd = new SQLiteCommand(updateProdSql, conn, trans))
                            {
                                cmd.Parameters.AddWithValue("@qtyDelta", totalReceivedMilli);
                                cmd.Parameters.AddWithValue("@newCost", newCost);
                                cmd.Parameters.AddWithValue("@newPrice", newPriceToSet);
                                cmd.Parameters.AddWithValue("@now", now);
                                cmd.Parameters.AddWithValue("@pid", item.ProductId);
                                cmd.ExecuteNonQuery();
                            }

                            // Synchronize base unit in product_units (Multi-Unit pricing parity)
                            string syncBaseUnitSql = @"
                                UPDATE product_units 
                                SET sell_price_piasters = @newPrice, 
                                    cost_price_piasters = @newCost, 
                                    updated_at = @now 
                                WHERE product_id = @pid AND is_base_unit = 1;
                            ";
                            using (var cmdBaseUnit = new SQLiteCommand(syncBaseUnitSql, conn, trans))
                            {
                                cmdBaseUnit.Parameters.AddWithValue("@newPrice", newPriceToSet);
                                cmdBaseUnit.Parameters.AddWithValue("@newCost", newCost);
                                cmdBaseUnit.Parameters.AddWithValue("@now", now);
                                cmdBaseUnit.Parameters.AddWithValue("@pid", item.ProductId);
                                cmdBaseUnit.ExecuteNonQuery();
                            }

                            // F-30: Synchronize non-base units in product_units (e.g. cartons) so unit cost doesn't stay stale
                            string syncNonBaseUnitsSql = @"
                                UPDATE product_units
                                SET cost_price_piasters = CAST(ROUND(@newCost * conversion_factor) AS INTEGER),
                                    updated_at = @now
                                WHERE product_id = @pid AND is_base_unit = 0;
                            ";
                            using (var cmdNonBase = new SQLiteCommand(syncNonBaseUnitsSql, conn, trans))
                            {
                                cmdNonBase.Parameters.AddWithValue("@newCost", newCost);
                                cmdNonBase.Parameters.AddWithValue("@now", now);
                                cmdNonBase.Parameters.AddWithValue("@pid", item.ProductId);
                                cmdNonBase.ExecuteNonQuery();
                            }

                            // If this product is a variant, also sync product_variants normalization table and parent product's total stock
                            string syncVariantSql = @"
                                UPDATE product_variants
                                SET stock_quantity_milli = stock_quantity_milli + @qtyDelta,
                                    cost_piasters = @newCost,
                                    price_piasters = @newPrice,
                                    updated_at = @now
                                WHERE variant_product_id = @pid;

                                UPDATE products
                                SET stock_quantity_milli = (
                                    SELECT COALESCE(SUM(p2.stock_quantity_milli), 0)
                                    FROM products p2
                                    WHERE p2.parent_id = (SELECT p1.parent_id FROM products p1 WHERE p1.id = @pid)
                                      AND p2.is_active = 1
                                ),
                                updated_at = @now
                                WHERE id = (SELECT p1.parent_id FROM products p1 WHERE p1.id = @pid AND p1.parent_id IS NOT NULL);
                            ";
                            using (var cmdSync = new SQLiteCommand(syncVariantSql, conn, trans))
                            {
                                cmdSync.Parameters.AddWithValue("@qtyDelta", totalReceivedMilli);
                                cmdSync.Parameters.AddWithValue("@newCost", newCost);
                                cmdSync.Parameters.AddWithValue("@newPrice", newPriceToSet);
                                cmdSync.Parameters.AddWithValue("@now", now);
                                cmdSync.Parameters.AddWithValue("@pid", item.ProductId);
                                cmdSync.ExecuteNonQuery();
                            }

                            // Record Stock Movement (Purchase increases stock)
                            string insertSmSql = @"
                                INSERT INTO stock_movements (
                                    id, product_id, movement_type, quantity_milli, reference_id, reference_type,
                                    unit_cost_piasters, note, batch_number, batch_id, expiry_date, created_at
                                ) VALUES (
                                    @id, @prodId, 'PURCHASE', @qty, @refId, 'PURCHASE_INVOICE',
                                    @unitCost, @note, @bnum, @bid, @expDate, @createdAt
                                );
                            ";
                            using (var cmd = new SQLiteCommand(insertSmSql, conn, trans))
                            {
                                cmd.Parameters.AddWithValue("@id", Guid.NewGuid().ToString());
                                cmd.Parameters.AddWithValue("@prodId", item.ProductId);
                                cmd.Parameters.AddWithValue("@qty", totalReceivedMilli);
                                cmd.Parameters.AddWithValue("@refId", purchase.Id);
                                cmd.Parameters.AddWithValue("@unitCost", effectiveUnitCost);
                                string smNote = "فاتورة شراء رقم #" + purchase.InvoiceNumber + (item.BonusQuantityMilli > 0 ? " (شامل بونص)" : "");
                                cmd.Parameters.AddWithValue("@note", smNote);
                                cmd.Parameters.AddWithValue("@bnum", (object)item.BatchNumber ?? DBNull.Value);
                                cmd.Parameters.AddWithValue("@bid", (object)batchId ?? DBNull.Value);
                                cmd.Parameters.AddWithValue("@expDate", (object)item.ExpiryDate ?? DBNull.Value);
                                cmd.Parameters.AddWithValue("@createdAt", now);
                                cmd.ExecuteNonQuery();
                            }

                            // Record Price History if cost or price changed
                            if (currentCost != newCost || currentPrice != newPriceToSet)
                            {
                                _priceHistoryRepo.Add(new ProductPriceHistory
                                {
                                    ProductId = item.ProductId,
                                    OldCostPiasters = currentCost,
                                    NewCostPiasters = newCost,
                                    OldPricePiasters = currentPrice,
                                    NewPricePiasters = newPriceToSet,
                                    ChangeReason = "فاتورة شراء رقم #" + purchase.InvoiceNumber,
                                    CreatedAt = now
                                }, conn, trans);
                            }
                        }

                        // 5. Update Supplier Balance & Ledger (Smart Advance & Debt Settlement)
                        if (!string.IsNullOrWhiteSpace(purchase.SupplierId))
                        {
                            long balanceDelta = purchase.NetCostPiasters - purchase.PaidAmountPiasters;
                            if (balanceDelta > 0)
                            {
                                // Unpaid portion: adds to debt or consumes available advance credit
                                string debtNote = string.Format("فاتورة شراء #{0} (الصافي: {1:N2} ج.م، المسدد: {2:N2} ج.م)",
                                    purchase.InvoiceNumber,
                                    purchase.NetCostPiasters / 100.0,
                                    purchase.PaidAmountPiasters / 100.0);
                                _supplierRepo.AdjustBalance(purchase.SupplierId, balanceDelta, "PURCHASE_INVOICE", purchase.Id, debtNote, conn, trans);
                            }
                            else if (balanceDelta < 0)
                            {
                                // Overpayment: excess paid is credited to our favor / reduces existing debt
                                long excessPiasters = Math.Abs(balanceDelta);
                                string excessNote = string.Format("سداد بالزيادة (تحت الحساب) من فاتورة شراء #{0} (الزيادة: {1:N2} ج.م)",
                                    purchase.InvoiceNumber,
                                    excessPiasters / 100.0);
                                _supplierRepo.AdjustBalance(purchase.SupplierId, balanceDelta, "PURCHASE_OVERPAYMENT", purchase.Id, excessNote, conn, trans);
                            }
                            else
                            {
                                // Fully paid on spot (cash): recorded in supplier ledger so it appears in account statement
                                string cashNote = string.Format("فاتورة شراء #{0} (مسددة نقداً بالكامل: {1:N2} ج.م)",
                                    purchase.InvoiceNumber,
                                    purchase.NetCostPiasters / 100.0);
                                _supplierRepo.AdjustBalance(purchase.SupplierId, 0, "PURCHASE_PAID_CASH", purchase.Id, cashNote, conn, trans);
                            }
                        }

                        // 6. Audit Log
                        _auditRepo.Log(conn, trans, new AuditLog
                        {
                            Id = "aud_" + Guid.NewGuid().ToString("N"),
                            UserId = string.IsNullOrWhiteSpace(userId) ? "usr_admin_default" : userId,
                            Action = "purchase_invoice_create",
                            EntityType = "purchases",
                            EntityId = purchase.Id,
                            DetailsJson = Newtonsoft.Json.JsonConvert.SerializeObject(new
                            {
                                invoiceNumber = purchase.InvoiceNumber,
                                netCost = purchase.NetCostPiasters,
                                paid = purchase.PaidAmountPiasters,
                                remaining = purchase.RemainingAmountPiasters,
                                itemsCount = purchase.Items.Count
                            }),
                            CreatedAt = now
                        });

                        trans.Commit();
                    }
                    catch
                    {
                        trans.Rollback();
                        throw;
                    }
                }
            }
            }

            return GetById(purchase.Id);
        }

        public List<Purchase> GetAll(string supplierId = null, string startDate = null, string endDate = null, int limit = 100)
        {
            var list = new List<Purchase>();
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    SELECT p.*, s.name as supplier_name
                    FROM purchases p
                    LEFT JOIN suppliers s ON p.supplier_id = s.id
                    WHERE (@supId IS NULL OR p.supplier_id = @supId)
                      AND (@startDate IS NULL OR p.invoice_date >= @startDate)
                      AND (@endDate IS NULL OR p.invoice_date <= @endDate)
                    ORDER BY p.invoice_number DESC
                    LIMIT @limit;
                ";

                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@supId", string.IsNullOrWhiteSpace(supplierId) ? (object)DBNull.Value : supplierId);
                    cmd.Parameters.AddWithValue("@startDate", string.IsNullOrWhiteSpace(startDate) ? (object)DBNull.Value : startDate);
                    cmd.Parameters.AddWithValue("@endDate", string.IsNullOrWhiteSpace(endDate) ? (object)DBNull.Value : endDate);
                    cmd.Parameters.AddWithValue("@limit", limit);

                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            list.Add(MapReaderToPurchase(reader));
                        }
                    }
                }
            }
            return list;
        }

        public Purchase GetById(string id)
        {
            if (string.IsNullOrWhiteSpace(id)) return null;

            Purchase purchase = null;
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    SELECT p.*, s.name as supplier_name
                    FROM purchases p
                    LEFT JOIN suppliers s ON p.supplier_id = s.id
                    WHERE p.id = @id
                    LIMIT 1;
                ";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@id", id);
                    using (var reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            purchase = MapReaderToPurchase(reader);
                        }
                    }
                }

                if (purchase != null)
                {
                    string itemsSql = "SELECT * FROM purchase_items WHERE purchase_id = @purId ORDER BY rowid ASC;";
                    using (var itemCmd = new SQLiteCommand(itemsSql, conn))
                    {
                        itemCmd.Parameters.AddWithValue("@purId", purchase.Id);
                        using (var itemReader = itemCmd.ExecuteReader())
                        {
                            while (itemReader.Read())
                            {
                                purchase.Items.Add(MapReaderToPurchaseItem(itemReader));
                            }
                        }
                    }
                }
            }
            return purchase;
        }

        private static Purchase MapReaderToPurchase(SQLiteDataReader reader)
        {
            return new Purchase
            {
                Id = reader["id"].ToString(),
                InvoiceNumber = Convert.ToInt64(reader["invoice_number"]),
                SupplierId = reader["supplier_id"] != DBNull.Value ? reader["supplier_id"].ToString() : null,
                SupplierName = reader["supplier_name"] != DBNull.Value ? reader["supplier_name"].ToString() : null,
                SupplierInvoiceNumber = reader["supplier_invoice_number"] != DBNull.Value ? reader["supplier_invoice_number"].ToString() : null,
                InvoiceDate = reader["invoice_date"].ToString(),
                TotalCostPiasters = Convert.ToInt64(reader["total_cost_piasters"]),
                DiscountPiasters = Convert.ToInt64(reader["discount_piasters"]),
                NetCostPiasters = Convert.ToInt64(reader["net_cost_piasters"]),
                PaidAmountPiasters = Convert.ToInt64(reader["paid_amount_piasters"]),
                RemainingAmountPiasters = Convert.ToInt64(reader["remaining_amount_piasters"]),
                PaymentStatus = reader["payment_status"].ToString(),
                PaymentSource = HasColumn(reader, "payment_source") && reader["payment_source"] != DBNull.Value ? reader["payment_source"].ToString() : "cash_drawer",
                Status = reader["status"].ToString(),
                Notes = reader["notes"] != DBNull.Value ? reader["notes"].ToString() : null,
                CreatedByUserId = reader["created_by_user_id"] != DBNull.Value ? reader["created_by_user_id"].ToString() : null,
                CreatedAt = reader["created_at"].ToString(),
                UpdatedAt = reader["updated_at"].ToString()
            };
        }

        private static bool HasColumn(SQLiteDataReader reader, string columnName)
        {
            for (int i = 0; i < reader.FieldCount; i++)
            {
                if (string.Equals(reader.GetName(i), columnName, StringComparison.OrdinalIgnoreCase))
                {
                    return true;
                }
            }
            return false;
        }

        public PurchaseReturn CreatePurchaseReturn(PurchaseReturn returnDoc, string userId = null)
        {
            if (returnDoc == null) throw new ArgumentNullException("returnDoc");
            if (string.IsNullOrWhiteSpace(returnDoc.SupplierId)) throw new ArgumentException("يجب تحديد المورد لإجراء مرتجع مشتريات");
            if (returnDoc.Items == null || returnDoc.Items.Count == 0) throw new ArgumentException("يجب إضافة صنف واحد على الأقل للمرتجع");

            string now = DateTime.UtcNow.ToString("o");

            lock (SaleService.FinancialWriteLock)
            {
                using (var conn = new SQLiteConnection(_connectionString))
                {
                    conn.Open();
                    using (var trans = conn.BeginTransaction())
                    {
                        try
                        {
                            // Validate supplier
                            using (var sCmd = new SQLiteCommand("SELECT name, is_active FROM suppliers WHERE id = @supId LIMIT 1;", conn, trans))
                            {
                                sCmd.Parameters.AddWithValue("@supId", returnDoc.SupplierId);
                                using (var reader = sCmd.ExecuteReader())
                                {
                                    if (reader.Read())
                                    {
                                        returnDoc.SupplierName = reader["name"].ToString();
                                        bool isAct = true;
                                        try { isAct = Convert.ToInt32(reader["is_active"]) == 1; } catch { }
                                        if (!isAct) throw new InvalidOperationException("لا يمكن عمل مرتجع لمورد مؤرشف");
                                    }
                                    else
                                    {
                                        throw new InvalidOperationException("المورد المحدد غير موجود في قاعدة البيانات");
                                    }
                                }
                            }

                            // 1. Get next return number
                            returnDoc.ReturnNumber = _counterRepo.GetNextCounterNumber(conn, trans, "purchase_return", "purchase_returns", "return_number");
                            returnDoc.Id = string.IsNullOrWhiteSpace(returnDoc.Id) ? "pret_" + Guid.NewGuid().ToString("N") : returnDoc.Id;
                            returnDoc.CreatedAt = now;
                            returnDoc.ReturnDate = string.IsNullOrWhiteSpace(returnDoc.ReturnDate) ? DateTime.Now.ToString("yyyy-MM-dd") : returnDoc.ReturnDate;
                            returnDoc.CreatedByUserId = userId;

                            // 1b. Validate original purchase if specified
                            if (!string.IsNullOrWhiteSpace(returnDoc.PurchaseId))
                            {
                                string origSupplierId = null;
                                using (var checkPurCmd = new SQLiteCommand("SELECT supplier_id FROM purchases WHERE id = @purId LIMIT 1;", conn, trans))
                                {
                                    checkPurCmd.Parameters.AddWithValue("@purId", returnDoc.PurchaseId);
                                    object o = checkPurCmd.ExecuteScalar();
                                    if (o == null || o == DBNull.Value)
                                    {
                                        throw new InvalidOperationException("فاتورة الشراء الأصلية المحددة غير موجودة.");
                                    }
                                    origSupplierId = o.ToString();
                                }
                                if (!string.Equals(origSupplierId, returnDoc.SupplierId, StringComparison.OrdinalIgnoreCase))
                                {
                                    throw new InvalidOperationException("فاتورة الشراء المحددة تابعة لمورد آخر غير المورد المحدد للمرتجع.");
                                }
                            }

                            // 2. Validate items, stock, purchase line quantities, and enforce server cost
                            long totalCost = 0;
                            for (int i = 0; i < returnDoc.Items.Count; i++)
                            {
                                var item = returnDoc.Items[i];
                                if (string.IsNullOrWhiteSpace(item.ProductId))
                                    throw new ArgumentException(string.Format("الصنف رقم {0} غير صالح في المرتجع", i + 1));
                                if (item.QuantityMilli <= 0)
                                    throw new ArgumentException(string.Format("كمية المرتجع للصنف '{0}' يجب أن تكون أكبر من الصفر", item.ProductName ?? item.ProductId));

                                // Fetch current product state
                                long currentStock = 0;
                                long catalogCost = 0;
                                string prodName = item.ProductName;
                                string barcode = item.Barcode;

                                using (var pCmd = new SQLiteCommand("SELECT name, barcode, stock_quantity_milli, cost_piasters, is_active FROM products WHERE id = @pid LIMIT 1;", conn, trans))
                                {
                                    pCmd.Parameters.AddWithValue("@pid", item.ProductId);
                                    using (var reader = pCmd.ExecuteReader())
                                    {
                                        if (reader.Read())
                                        {
                                            prodName = reader["name"].ToString();
                                            barcode = reader["barcode"] != DBNull.Value ? reader["barcode"].ToString() : null;
                                            currentStock = Convert.ToInt64(reader["stock_quantity_milli"]);
                                            catalogCost = Convert.ToInt64(reader["cost_piasters"]);
                                            bool isAct = true;
                                            try { isAct = Convert.ToInt32(reader["is_active"]) == 1; } catch { }
                                            if (!isAct)
                                            {
                                                throw new InvalidOperationException(string.Format("الصنف '{0}' مؤرشف أو محذوف.", prodName));
                                            }
                                        }
                                        else
                                        {
                                            throw new InvalidOperationException("المنتج غير موجود: " + item.ProductId);
                                        }
                                    }
                                }

                                if (currentStock < item.QuantityMilli)
                                {
                                    throw new InvalidOperationException(string.Format("رصيد المخزن للصنف '{0}' ({1:N2}) غير كافٍ لإرجاع كمية ({2:N2}) للمورد.",
                                        prodName, currentStock / 1000.0, item.QuantityMilli / 1000.0));
                                }

                                item.ProductName = prodName;
                                item.Barcode = barcode;

                                // Resolve and validate purchase invoice line
                                if (!string.IsNullOrWhiteSpace(returnDoc.PurchaseId))
                                {
                                    long purQty = 0;
                                    long purTotalCost = 0;
                                    long itemUnitCost = 0;
                                    bool foundPurItem = false;

                                    using (var piCmd = new SQLiteCommand("SELECT quantity_milli, bonus_quantity_milli, unit_cost_piasters, total_cost_piasters FROM purchase_items WHERE purchase_id = @purId AND product_id = @pid LIMIT 1;", conn, trans))
                                    {
                                        piCmd.Parameters.AddWithValue("@purId", returnDoc.PurchaseId);
                                        piCmd.Parameters.AddWithValue("@pid", item.ProductId);
                                        using (var piReader = piCmd.ExecuteReader())
                                        {
                                            if (piReader.Read())
                                            {
                                                foundPurItem = true;
                                                purQty = Convert.ToInt64(piReader["quantity_milli"]) + Convert.ToInt64(piReader["bonus_quantity_milli"]);
                                                purTotalCost = Convert.ToInt64(piReader["total_cost_piasters"]);
                                                itemUnitCost = Convert.ToInt64(piReader["unit_cost_piasters"]);
                                            }
                                        }
                                    }

                                    if (!foundPurItem)
                                    {
                                        throw new InvalidOperationException(string.Format("الصنف '{0}' غير موجود في فاتورة الشراء الأصلية.", prodName));
                                    }

                                    long effectiveUnitCost = purQty > 0 ? (purTotalCost * 1000 / purQty) : itemUnitCost;
                                    item.UnitCostPiasters = effectiveUnitCost;

                                    long alreadyReturned = 0;
                                    using (var retSumCmd = new SQLiteCommand(@"
                                        SELECT COALESCE(SUM(pri.quantity_milli), 0)
                                        FROM purchase_return_items pri
                                        JOIN purchase_returns pr ON pri.return_id = pr.id
                                        WHERE pr.purchase_id = @purId AND pri.product_id = @pid;", conn, trans))
                                    {
                                        retSumCmd.Parameters.AddWithValue("@purId", returnDoc.PurchaseId);
                                        retSumCmd.Parameters.AddWithValue("@pid", item.ProductId);
                                        object sumObj = retSumCmd.ExecuteScalar();
                                        if (sumObj != null && sumObj != DBNull.Value) alreadyReturned = Convert.ToInt64(sumObj);
                                    }

                                    long remainingReturnable = purQty - alreadyReturned;
                                    if (item.QuantityMilli > remainingReturnable)
                                    {
                                        throw new InvalidOperationException(string.Format("كمية المرتجع للصنف '{0}' ({1:N2}) تتجاوز الكمية المتبقية المتاحة للإرجاع ({2:N2}) من فاتورة الشراء الأصلية.",
                                            prodName, item.QuantityMilli / 1000.0, remainingReturnable / 1000.0));
                                    }
                                }
                                else
                                {
                                    // If no purchaseId, fallback to latest purchase from supplier or catalog cost
                                    long foundPurCost = 0;
                                    bool foundLastPur = false;
                                    using (var lastPurCmd = new SQLiteCommand(@"
                                        SELECT pi.quantity_milli, pi.bonus_quantity_milli, pi.total_cost_piasters, pi.unit_cost_piasters
                                        FROM purchases p
                                        JOIN purchase_items pi ON p.id = pi.purchase_id
                                        WHERE p.supplier_id = @supId AND pi.product_id = @pid
                                        ORDER BY p.purchase_date DESC, p.created_at DESC LIMIT 1;", conn, trans))
                                    {
                                        lastPurCmd.Parameters.AddWithValue("@supId", returnDoc.SupplierId);
                                        lastPurCmd.Parameters.AddWithValue("@pid", item.ProductId);
                                        using (var r = lastPurCmd.ExecuteReader())
                                        {
                                            if (r.Read())
                                            {
                                                foundLastPur = true;
                                                long lQty = Convert.ToInt64(r["quantity_milli"]) + Convert.ToInt64(r["bonus_quantity_milli"]);
                                                long lTotal = Convert.ToInt64(r["total_cost_piasters"]);
                                                foundPurCost = lQty > 0 ? (lTotal * 1000 / lQty) : Convert.ToInt64(r["unit_cost_piasters"]);
                                            }
                                        }
                                    }

                                    if (foundLastPur)
                                    {
                                        item.UnitCostPiasters = foundPurCost;
                                    }
                                    else if (item.UnitCostPiasters <= 0 || item.UnitCostPiasters > catalogCost)
                                    {
                                        item.UnitCostPiasters = catalogCost;
                                    }
                                }

                                // Validate batch availability
                                if (!string.IsNullOrEmpty(item.BatchNumber))
                                {
                                    long batchStock = 0;
                                    using (var bCmd = new SQLiteCommand("SELECT quantity_milli FROM product_batches WHERE product_id = @pid AND batch_number = @bnum LIMIT 1;", conn, trans))
                                    {
                                        bCmd.Parameters.AddWithValue("@pid", item.ProductId);
                                        bCmd.Parameters.AddWithValue("@bnum", item.BatchNumber);
                                        object bObj = bCmd.ExecuteScalar();
                                        if (bObj != null && bObj != DBNull.Value) batchStock = Convert.ToInt64(bObj);
                                    }
                                    if (batchStock < item.QuantityMilli)
                                    {
                                        throw new InvalidOperationException(string.Format("رصيد التشغيلة '{0}' للصنف '{1}' ({2:N2}) غير كافٍ لإرجاع كمية ({3:N2}) للمورد.",
                                            item.BatchNumber, prodName, batchStock / 1000.0, item.QuantityMilli / 1000.0));
                                    }
                                }

                                item.TotalCostPiasters = Money.FromPiasters(item.UnitCostPiasters).MultiplyByMilliUnits(item.QuantityMilli).Piasters;
                                totalCost += item.TotalCostPiasters;
                            }
                            returnDoc.TotalCostPiasters = totalCost;

                            // 3. Insert purchase_returns master
                            string insertMasterSql = @"
                                INSERT INTO purchase_returns (
                                    id, return_number, purchase_id, supplier_id,
                                    return_date, total_cost_piasters, refund_amount_piasters,
                                    refund_status, refund_source, notes, created_by_user_id, created_at
                                ) VALUES (
                                    @id, @retNum, @purId, @supId,
                                    @retDate, @totalCost, 0,
                                    'CREDIT', 'supplier_balance', @notes, @userId, @createdAt
                                );
                            ";
                            using (var cmd = new SQLiteCommand(insertMasterSql, conn, trans))
                            {
                                cmd.Parameters.AddWithValue("@id", returnDoc.Id);
                                cmd.Parameters.AddWithValue("@retNum", returnDoc.ReturnNumber);
                                cmd.Parameters.AddWithValue("@purId", (object)returnDoc.PurchaseId ?? DBNull.Value);
                                cmd.Parameters.AddWithValue("@supId", returnDoc.SupplierId);
                                cmd.Parameters.AddWithValue("@retDate", returnDoc.ReturnDate);
                                cmd.Parameters.AddWithValue("@totalCost", returnDoc.TotalCostPiasters);
                                cmd.Parameters.AddWithValue("@notes", (object)returnDoc.Notes ?? DBNull.Value);
                                cmd.Parameters.AddWithValue("@userId", (object)userId ?? DBNull.Value);
                                cmd.Parameters.AddWithValue("@createdAt", now);
                                cmd.ExecuteNonQuery();
                            }

                            // 4. Process each return item
                            for (int i = 0; i < returnDoc.Items.Count; i++)
                            {
                                var item = returnDoc.Items[i];
                                item.Id = string.IsNullOrWhiteSpace(item.Id) ? "pri_" + Guid.NewGuid().ToString("N") : item.Id;
                                item.ReturnId = returnDoc.Id;
                                item.CreatedAt = now;

                                // Insert purchase_return_items
                                string insertItemSql = @"
                                    INSERT INTO purchase_return_items (
                                        id, return_id, product_id, product_name, barcode,
                                        quantity_milli, unit_cost_piasters, total_cost_piasters,
                                        batch_number, reason, created_at
                                    ) VALUES (
                                        @id, @retId, @prodId, @prodName, @barcode,
                                        @qty, @unitCost, @totalCost,
                                        @bnum, @reason, @createdAt
                                    );
                                ";
                                using (var cmd = new SQLiteCommand(insertItemSql, conn, trans))
                                {
                                    cmd.Parameters.AddWithValue("@id", item.Id);
                                    cmd.Parameters.AddWithValue("@retId", returnDoc.Id);
                                    cmd.Parameters.AddWithValue("@prodId", item.ProductId);
                                    cmd.Parameters.AddWithValue("@prodName", item.ProductName);
                                    cmd.Parameters.AddWithValue("@barcode", (object)item.Barcode ?? DBNull.Value);
                                    cmd.Parameters.AddWithValue("@qty", item.QuantityMilli);
                                    cmd.Parameters.AddWithValue("@unitCost", item.UnitCostPiasters);
                                    cmd.Parameters.AddWithValue("@totalCost", item.TotalCostPiasters);
                                    cmd.Parameters.AddWithValue("@bnum", (object)item.BatchNumber ?? DBNull.Value);
                                    cmd.Parameters.AddWithValue("@reason", (object)item.Reason ?? DBNull.Value);
                                    cmd.Parameters.AddWithValue("@createdAt", now);
                                    cmd.ExecuteNonQuery();
                                }

                                // Deduct stock from products
                                string deductStockSql = @"
                                    UPDATE products
                                    SET stock_quantity_milli = stock_quantity_milli - @qty,
                                        updated_at = @now
                                    WHERE id = @pid;
                                ";
                                using (var cmd = new SQLiteCommand(deductStockSql, conn, trans))
                                {
                                    cmd.Parameters.AddWithValue("@qty", item.QuantityMilli);
                                    cmd.Parameters.AddWithValue("@now", now);
                                    cmd.Parameters.AddWithValue("@pid", item.ProductId);
                                    cmd.ExecuteNonQuery();
                                }

                                // Sync variant & parent product if applicable
                                string syncVarSql = @"
                                    UPDATE product_variants
                                    SET stock_quantity_milli = stock_quantity_milli - @qty,
                                        updated_at = @now
                                    WHERE variant_product_id = @pid;

                                    UPDATE products
                                    SET stock_quantity_milli = (
                                        SELECT COALESCE(SUM(p2.stock_quantity_milli), 0)
                                        FROM products p2
                                        WHERE p2.parent_id = (SELECT p1.parent_id FROM products p1 WHERE p1.id = @pid)
                                          AND p2.is_active = 1
                                    ),
                                    updated_at = @now
                                    WHERE id = (SELECT p1.parent_id FROM products p1 WHERE p1.id = @pid AND p1.parent_id IS NOT NULL);
                                ";
                                using (var cmdSync = new SQLiteCommand(syncVarSql, conn, trans))
                                {
                                    cmdSync.Parameters.AddWithValue("@qty", item.QuantityMilli);
                                    cmdSync.Parameters.AddWithValue("@now", now);
                                    cmdSync.Parameters.AddWithValue("@pid", item.ProductId);
                                    cmdSync.ExecuteNonQuery();
                                }

                                // Deduct batch if specified
                                if (!string.IsNullOrEmpty(item.BatchNumber))
                                {
                                    string batchDeductSql = @"
                                        UPDATE product_batches
                                        SET quantity_milli = quantity_milli - @qty,
                                            updated_at = @now
                                        WHERE product_id = @pid AND batch_number = @bnum;
                                    ";
                                    using (var cmd = new SQLiteCommand(batchDeductSql, conn, trans))
                                    {
                                        cmd.Parameters.AddWithValue("@qty", item.QuantityMilli);
                                        cmd.Parameters.AddWithValue("@now", now);
                                        cmd.Parameters.AddWithValue("@pid", item.ProductId);
                                        cmd.Parameters.AddWithValue("@bnum", item.BatchNumber);
                                        cmd.ExecuteNonQuery();
                                    }
                                }

                                // Record Stock Movement (Return decreases stock)
                                string insertSmSql = @"
                                    INSERT INTO stock_movements (
                                        id, product_id, movement_type, quantity_milli, reference_id, reference_type,
                                        unit_cost_piasters, note, batch_number, created_at
                                    ) VALUES (
                                        @id, @prodId, 'PURCHASE_RETURN', @qty, @refId, 'PURCHASE_RETURN',
                                        @unitCost, @note, @bnum, @createdAt
                                    );
                                ";
                                using (var cmd = new SQLiteCommand(insertSmSql, conn, trans))
                                {
                                    cmd.Parameters.AddWithValue("@id", Guid.NewGuid().ToString());
                                    cmd.Parameters.AddWithValue("@prodId", item.ProductId);
                                    cmd.Parameters.AddWithValue("@qty", -item.QuantityMilli);
                                    cmd.Parameters.AddWithValue("@refId", returnDoc.Id);
                                    cmd.Parameters.AddWithValue("@unitCost", item.UnitCostPiasters);
                                    cmd.Parameters.AddWithValue("@note", "مرتجع مشتريات رقم #" + returnDoc.ReturnNumber);
                                    cmd.Parameters.AddWithValue("@bnum", (object)item.BatchNumber ?? DBNull.Value);
                                    cmd.Parameters.AddWithValue("@createdAt", now);
                                    cmd.ExecuteNonQuery();
                                }
                            }

                            // 5. Update Supplier Balance & Ledger (Deducts debt or creates advance credit)
                            long returnDelta = -returnDoc.TotalCostPiasters;
                            string retNote = string.Format("مرتجع مشتريات #{0} بمبلغ {1:N2} ج.م",
                                returnDoc.ReturnNumber,
                                returnDoc.TotalCostPiasters / 100.0);
                            _supplierRepo.AdjustBalance(returnDoc.SupplierId, returnDelta, "PURCHASE_RETURN", returnDoc.Id, retNote, conn, trans);

                            _auditRepo.Log(conn, trans, new AuditLog
                            {
                                Id = "aud_" + Guid.NewGuid().ToString("N"),
                                UserId = string.IsNullOrWhiteSpace(userId) ? "usr_admin_default" : userId,
                                Action = "purchase_return_create",
                                EntityType = "purchase_returns",
                                EntityId = returnDoc.Id,
                                DetailsJson = Newtonsoft.Json.JsonConvert.SerializeObject(new { returnNumber = returnDoc.ReturnNumber, totalCost = returnDoc.TotalCostPiasters, supplierId = returnDoc.SupplierId }),
                                CreatedAt = now
                            });

                            trans.Commit();
                            return returnDoc;
                        }
                        catch
                        {
                            trans.Rollback();
                            throw;
                        }
                    }
                }
            }
        }

        public List<PurchaseReturn> GetReturns(string supplierId = null, int limit = 50)
        {
            var list = new List<PurchaseReturn>();
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    SELECT pr.*, s.name as supplier_name
                    FROM purchase_returns pr
                    LEFT JOIN suppliers s ON pr.supplier_id = s.id
                    WHERE (@supId IS NULL OR pr.supplier_id = @supId)
                    ORDER BY pr.return_number DESC
                    LIMIT @limit;
                ";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@supId", (object)supplierId ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@limit", limit);
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            list.Add(MapReaderToPurchaseReturn(reader));
                        }
                    }
                }
            }
            return list;
        }

        public PurchaseReturn GetReturnById(string id)
        {
            if (string.IsNullOrWhiteSpace(id)) return null;
            PurchaseReturn retDoc = null;
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    SELECT pr.*, s.name as supplier_name
                    FROM purchase_returns pr
                    LEFT JOIN suppliers s ON pr.supplier_id = s.id
                    WHERE pr.id = @id
                    LIMIT 1;
                ";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@id", id);
                    using (var reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            retDoc = MapReaderToPurchaseReturn(reader);
                        }
                    }
                }

                if (retDoc != null)
                {
                    string itemsSql = "SELECT * FROM purchase_return_items WHERE return_id = @retId ORDER BY rowid ASC;";
                    using (var cmd = new SQLiteCommand(itemsSql, conn))
                    {
                        cmd.Parameters.AddWithValue("@retId", retDoc.Id);
                        using (var reader = cmd.ExecuteReader())
                        {
                            while (reader.Read())
                            {
                                retDoc.Items.Add(new PurchaseReturnItem
                                {
                                    Id = reader["id"].ToString(),
                                    ReturnId = reader["return_id"].ToString(),
                                    ProductId = reader["product_id"].ToString(),
                                    ProductName = reader["product_name"].ToString(),
                                    Barcode = reader["barcode"] != DBNull.Value ? reader["barcode"].ToString() : null,
                                    QuantityMilli = Convert.ToInt64(reader["quantity_milli"]),
                                    UnitCostPiasters = Convert.ToInt64(reader["unit_cost_piasters"]),
                                    TotalCostPiasters = Convert.ToInt64(reader["total_cost_piasters"]),
                                    BatchNumber = reader["batch_number"] != DBNull.Value ? reader["batch_number"].ToString() : null,
                                    Reason = reader["reason"] != DBNull.Value ? reader["reason"].ToString() : null,
                                    CreatedAt = reader["created_at"].ToString()
                                });
                            }
                        }
                    }
                }
            }
            return retDoc;
        }

        private static PurchaseReturn MapReaderToPurchaseReturn(SQLiteDataReader reader)
        {
            return new PurchaseReturn
            {
                Id = reader["id"].ToString(),
                ReturnNumber = Convert.ToInt64(reader["return_number"]),
                PurchaseId = reader["purchase_id"] != DBNull.Value ? reader["purchase_id"].ToString() : null,
                SupplierId = reader["supplier_id"].ToString(),
                SupplierName = reader["supplier_name"] != DBNull.Value ? reader["supplier_name"].ToString() : null,
                ReturnDate = reader["return_date"].ToString(),
                TotalCostPiasters = Convert.ToInt64(reader["total_cost_piasters"]),
                Notes = reader["notes"] != DBNull.Value ? reader["notes"].ToString() : null,
                CreatedByUserId = reader["created_by_user_id"] != DBNull.Value ? reader["created_by_user_id"].ToString() : null,
                CreatedAt = reader["created_at"].ToString()
            };
        }

        private static PurchaseItem MapReaderToPurchaseItem(SQLiteDataReader reader)
        {
            long? newPrice = null;
            if (reader["new_selling_price_piasters"] != DBNull.Value)
            {
                newPrice = Convert.ToInt64(reader["new_selling_price_piasters"]);
            }

            string bNum = null;
            string exp = null;
            string prodDate = null;

            for (int i = 0; i < reader.FieldCount; i++)
            {
                string colName = reader.GetName(i);
                if (string.Equals(colName, "batch_number", StringComparison.OrdinalIgnoreCase) && reader[i] != DBNull.Value)
                {
                    bNum = reader[i].ToString();
                }
                else if (string.Equals(colName, "expiry_date", StringComparison.OrdinalIgnoreCase) && reader[i] != DBNull.Value)
                {
                    exp = reader[i].ToString();
                }
                else if (string.Equals(colName, "production_date", StringComparison.OrdinalIgnoreCase) && reader[i] != DBNull.Value)
                {
                    prodDate = reader[i].ToString();
                }
            }

            long bonusQty = 0;
            long lineDiscount = 0;
            if (HasColumn(reader, "bonus_quantity_milli") && reader["bonus_quantity_milli"] != DBNull.Value)
            {
                bonusQty = Convert.ToInt64(reader["bonus_quantity_milli"]);
            }
            if (HasColumn(reader, "discount_piasters") && reader["discount_piasters"] != DBNull.Value)
            {
                lineDiscount = Convert.ToInt64(reader["discount_piasters"]);
            }

            string uId = null;
            string uName = null;
            double convFactor = 1.0;
            long pkgCost = 0;
            long? pubPrice = null;
            int? distBps = null;
            if (HasColumn(reader, "unit_id") && reader["unit_id"] != DBNull.Value) uId = reader["unit_id"].ToString();
            if (HasColumn(reader, "unit_name") && reader["unit_name"] != DBNull.Value) uName = reader["unit_name"].ToString();
            if (HasColumn(reader, "conversion_factor") && reader["conversion_factor"] != DBNull.Value) convFactor = Convert.ToDouble(reader["conversion_factor"]);
            if (HasColumn(reader, "package_cost_piasters") && reader["package_cost_piasters"] != DBNull.Value) pkgCost = Convert.ToInt64(reader["package_cost_piasters"]);
            if (HasColumn(reader, "public_price_piasters") && reader["public_price_piasters"] != DBNull.Value) pubPrice = Convert.ToInt64(reader["public_price_piasters"]);
            if (HasColumn(reader, "distributor_discount_bps") && reader["distributor_discount_bps"] != DBNull.Value) distBps = Convert.ToInt32(reader["distributor_discount_bps"]);

            return new PurchaseItem
            {
                Id = reader["id"].ToString(),
                PurchaseId = reader["purchase_id"].ToString(),
                ProductId = reader["product_id"].ToString(),
                ProductName = reader["product_name"].ToString(),
                Barcode = reader["barcode"] != DBNull.Value ? reader["barcode"].ToString() : null,
                QuantityMilli = Convert.ToInt64(reader["quantity_milli"]),
                BonusQuantityMilli = bonusQty,
                UnitCostPiasters = Convert.ToInt64(reader["unit_cost_piasters"]),
                DiscountPiasters = lineDiscount,
                TotalCostPiasters = Convert.ToInt64(reader["total_cost_piasters"]),
                PreviousCostPiasters = Convert.ToInt64(reader["previous_cost_piasters"]),
                NewSellingPricePiasters = newPrice,
                BatchNumber = bNum,
                ExpiryDate = exp,
                ProductionDate = prodDate,
                UnitId = uId,
                UnitName = uName,
                ConversionFactor = convFactor,
                PackageCostPiasters = pkgCost,
                PublicPricePiasters = pubPrice,
                DistributorDiscountBps = distBps,
                CreatedAt = reader["created_at"].ToString()
            };
        }
    }
}
