using System;
using System.Collections.Generic;
using System.Data.SQLite;
using RafiqPOS.Common;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Repositories
{
    public class ReturnRepository
    {
        private readonly string _connectionString;
        private readonly CounterRepository _counters;
        private readonly AuditLogRepository _auditRepo;

        public ReturnRepository(string connectionString, CounterRepository counters = null, AuditLogRepository auditRepo = null)
        {
            _connectionString = connectionString;
            _counters = counters ?? new CounterRepository(connectionString);
            _auditRepo = auditRepo ?? new AuditLogRepository(connectionString);
        }

        private static bool TryGetSaleItemTotal(SQLiteConnection conn, SQLiteTransaction trans, string saleId, string saleItemId, out long totalPiasters)
        {
            totalPiasters = 0;
            using (var cmd = new SQLiteCommand("SELECT total_piasters FROM sale_items WHERE id = @id AND sale_id = @sid LIMIT 1;", conn, trans))
            {
                cmd.Parameters.AddWithValue("@id", saleItemId);
                cmd.Parameters.AddWithValue("@sid", saleId);
                object res = cmd.ExecuteScalar();
                if (res == null || res == DBNull.Value) return false;
                totalPiasters = Convert.ToInt64(res);
                return true;
            }
        }

        private static long GetRefundedForSaleItem(SQLiteConnection conn, SQLiteTransaction trans, string saleItemId)
        {
            using (var cmd = new SQLiteCommand("SELECT COALESCE(SUM(total_piasters), 0) FROM return_items WHERE sale_item_id = @id;", conn, trans))
            {
                cmd.Parameters.AddWithValue("@id", saleItemId);
                object res = cmd.ExecuteScalar();
                return res != null && res != DBNull.Value ? Convert.ToInt64(res) : 0;
            }
        }

        public Return CreateReturnAtomic(Return returnObj)
        {
            if (returnObj == null) throw new ArgumentNullException("returnObj");
            if (returnObj.Items == null || returnObj.Items.Count == 0)
            {
                throw new InvalidOperationException("لا يمكن تسجيل مرتجع بدون أصناف");
            }

            if (string.IsNullOrEmpty(returnObj.Id))
            {
                returnObj.Id = Guid.NewGuid().ToString();
            }
            // Whitelisted and lower-cased at the persistence boundary too (callers other than ReturnService included)
            returnObj.RefundMethod = ReturnService.NormalizeRefundMethod(returnObj.RefundMethod);
            // Always stamped by the server (same UTC format as sales); a client time would move the return between business days
            returnObj.CreatedAt = DateTime.UtcNow.ToString("o");

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        // 1. Get next sequential return number
                        int nextReturnNumber = (int)_counters.GetNextCounterNumber(conn, trans, "return_number", "returns", "return_number");
                        returnObj.ReturnNumber = nextReturnNumber;

                        long saleFinalTotal = 0;
                        string saleStatus = null;

                        // Bidirectionally resolve SaleId and InvoiceNumber and load sale status & net total
                        if (string.IsNullOrEmpty(returnObj.SaleId) && returnObj.InvoiceNumber.HasValue)
                        {
                            using (var findSaleCmd = new SQLiteCommand("SELECT s.id, s.status, s.total_piasters, s.customer_id, c.name AS customer_name FROM sales s LEFT JOIN customers c ON s.customer_id = c.id WHERE s.invoice_number = @inv LIMIT 1;", conn, trans))
                            {
                                findSaleCmd.Parameters.AddWithValue("@inv", returnObj.InvoiceNumber.Value);
                                using (var saleReader = findSaleCmd.ExecuteReader())
                                {
                                    if (saleReader.Read())
                                    {
                                        returnObj.SaleId = saleReader["id"].ToString();
                                        saleStatus = saleReader["status"] != DBNull.Value ? saleReader["status"].ToString() : null;
                                        saleFinalTotal = saleReader["total_piasters"] != DBNull.Value ? Convert.ToInt64(saleReader["total_piasters"]) : 0;
                                        string invoiceCustomerId = saleReader["customer_id"] != DBNull.Value ? saleReader["customer_id"].ToString() : null;
                                        RafiqPOS.Services.ReturnService.EnsureInvoiceCustomer(returnObj.CustomerId, invoiceCustomerId);
                                        returnObj.CustomerId = invoiceCustomerId;
                                        returnObj.CustomerName = saleReader["customer_name"] != DBNull.Value ? saleReader["customer_name"].ToString() : null;
                                    }
                                }
                            }
                        }
                        else if (!string.IsNullOrEmpty(returnObj.SaleId))
                        {
                            using (var findInvCmd = new SQLiteCommand("SELECT s.invoice_number, s.status, s.total_piasters, s.customer_id, c.name AS customer_name FROM sales s LEFT JOIN customers c ON s.customer_id = c.id WHERE s.id = @sid LIMIT 1;", conn, trans))
                            {
                                findInvCmd.Parameters.AddWithValue("@sid", returnObj.SaleId);
                                using (var invReader = findInvCmd.ExecuteReader())
                                {
                                    if (invReader.Read())
                                    {
                                        if (!returnObj.InvoiceNumber.HasValue && invReader["invoice_number"] != DBNull.Value)
                                        {
                                            returnObj.InvoiceNumber = Convert.ToInt32(invReader["invoice_number"]);
                                        }
                                        saleStatus = invReader["status"] != DBNull.Value ? invReader["status"].ToString() : null;
                                        saleFinalTotal = invReader["total_piasters"] != DBNull.Value ? Convert.ToInt64(invReader["total_piasters"]) : 0;
                                        string invoiceCustomerId = invReader["customer_id"] != DBNull.Value ? invReader["customer_id"].ToString() : null;
                                        RafiqPOS.Services.ReturnService.EnsureInvoiceCustomer(returnObj.CustomerId, invoiceCustomerId);
                                        returnObj.CustomerId = invoiceCustomerId;
                                        returnObj.CustomerName = invReader["customer_name"] != DBNull.Value ? invReader["customer_name"].ToString() : null;
                                    }
                                }
                            }
                        }

                        // Senior invariant: Block returns against cancelled sales
                        if (!string.IsNullOrEmpty(saleStatus) && string.Equals(saleStatus, "cancelled", StringComparison.OrdinalIgnoreCase))
                        {
                            throw new InvalidOperationException("لا يمكن عمل مرتجع على فاتورة ملغاة بالفعل.");
                        }

                        // Calculate total and enforce consistency (prevent tampering)
                        long calculatedTotal = 0;
                        var refundedInRequestBySaleItem = new System.Collections.Generic.Dictionary<string, long>();
                        for (int i = 0; i < returnObj.Items.Count; i++)
                        {
                            var it = returnObj.Items[i];
                            if (it == null)
                            {
                                throw new InvalidOperationException(string.Format("بند المرتجع رقم {0} غير صالح", i + 1));
                            }
                            if (string.IsNullOrWhiteSpace(it.ProductId))
                            {
                                throw new InvalidOperationException(string.Format("معرف المنتج مطلوب لبند المرتجع رقم {0}", i + 1));
                            }
                            if (it.QuantityMilli <= 0)
                            {
                                throw new InvalidOperationException(string.Format("كمية المرتجع للصنف '{0}' يجب أن تكون أكبر من الصفر", it.ProductName ?? it.ProductId));
                            }
                            if (it.UnitPricePiasters < 0)
                            {
                                throw new InvalidOperationException(string.Format("سعر الوحدة للصنف '{0}' لا يمكن أن يكون سالباً", it.ProductName ?? it.ProductId));
                            }

                            decimal lineDec = ((decimal)it.UnitPricePiasters * it.QuantityMilli) / 1000m;
                            long expectedLineTotal = (long)Math.Round(lineDec, 0, MidpointRounding.AwayFromZero);
                            // Invoice-linked line totals are computed by ReturnService from the original sale line
                            // (proportional, remainder-exact - Audit F-19); every other path uses price x qty.
                            bool serviceComputed = returnObj.TotalsComputedByService;
                            if (!serviceComputed || it.TotalPiasters < 0)
                            {
                                it.TotalPiasters = expectedLineTotal;
                            }
                            else
                            {
                                // The service total (remainder-exact for the line that exhausts the sold quantity) is trusted,
                                // bounded by what is still refundable on the original line; a rounded price x qty cap would
                                // refund less than was paid. Without a resolvable original line the price-based cap applies.
                                long origLineTotal;
                                if (!string.IsNullOrEmpty(it.SaleItemId) && TryGetSaleItemTotal(conn, trans, returnObj.SaleId, it.SaleItemId, out origLineTotal))
                                {
                                    long refundedBefore = GetRefundedForSaleItem(conn, trans, it.SaleItemId);
                                    long inRequest;
                                    refundedInRequestBySaleItem.TryGetValue(it.SaleItemId, out inRequest);
                                    long remainingValue = Math.Max(0, origLineTotal - refundedBefore - inRequest);
                                    if (it.TotalPiasters > remainingValue)
                                    {
                                        it.TotalPiasters = remainingValue;
                                    }
                                    refundedInRequestBySaleItem[it.SaleItemId] = inRequest + it.TotalPiasters;
                                }
                                else if (it.TotalPiasters > expectedLineTotal)
                                {
                                    it.TotalPiasters = expectedLineTotal;
                                }
                            }
                            calculatedTotal += it.TotalPiasters;
                        }

                        // A fully discounted (free) invoice line may be returned at zero value: stock only, no money (L7)
                        if (calculatedTotal <= 0 && (string.IsNullOrEmpty(returnObj.SaleId) || returnObj.IsWithoutInvoice))
                        {
                            throw new InvalidOperationException("إجمالي قيمة المرتجع يجب أن يكون أكبر من الصفر");
                        }
                        returnObj.TotalPiasters = calculatedTotal;

                        // Split refund: the parts must add up to the recalculated total exactly; the first part is the master row's method
                        List<ReturnRefundPart> refundParts = (returnObj.Refunds != null && returnObj.Refunds.Count > 0) ? returnObj.Refunds : null;
                        if (refundParts != null)
                        {
                            long partsSum = 0;
                            for (int pIdx = 0; pIdx < refundParts.Count; pIdx++)
                            {
                                if (refundParts[pIdx] == null || refundParts[pIdx].AmountPiasters <= 0)
                                {
                                    throw new InvalidOperationException(string.Format("مبلغ جزء الاسترداد رقم {0} غير صالح.", pIdx + 1));
                                }
                                partsSum += refundParts[pIdx].AmountPiasters;
                            }
                            if (partsSum != calculatedTotal)
                            {
                                throw new InvalidOperationException(string.Format(
                                    "مجموع أجزاء الاسترداد ({0:N2} ج.م) لا يطابق قيمة المرتجع المحسوبة ({1:N2} ج.م).",
                                    partsSum / 100.0, calculatedTotal / 100.0));
                            }
                            returnObj.RefundMethod = refundParts[0].Method;
                        }
                        // Senior invariant: Ensure cumulative returns do not exceed original net sale total
                        if (!string.IsNullOrEmpty(returnObj.SaleId) && saleFinalTotal > 0)
                        {
                            long alreadyReturned = 0;
                            using (var sumRetCmd = new SQLiteCommand("SELECT COALESCE(SUM(total_piasters), 0) FROM returns WHERE sale_id = @sid;", conn, trans))
                            {
                                sumRetCmd.Parameters.AddWithValue("@sid", returnObj.SaleId);
                                object sumRes = sumRetCmd.ExecuteScalar();
                                if (sumRes != null && sumRes != DBNull.Value)
                                {
                                    alreadyReturned = Convert.ToInt64(sumRes);
                                }
                            }

                            if (alreadyReturned + calculatedTotal > saleFinalTotal)
                            {
                                throw new InvalidOperationException(string.Format("إجمالي المرتجع ({0}) يتجاوز القيمة الصافية المتبقية للفاتورة الأصلية ({1}).", calculatedTotal, saleFinalTotal - alreadyReturned));
                            }
                        }

                        // F-15: The return always belongs to the server's current open shift; a client shift id is ignored
                        returnObj.ShiftId = null;
                        using (var shiftCmd = new SQLiteCommand("SELECT id FROM shifts WHERE status = 'open' ORDER BY opened_at DESC LIMIT 1;", conn, trans))
                        {
                            object openShiftId = shiftCmd.ExecuteScalar();
                            if (openShiftId != null && openShiftId != DBNull.Value)
                            {
                                returnObj.ShiftId = openShiftId.ToString();
                            }
                        }

                        // 2. Insert Returns Master record
                        string insertReturnSql = @"
                            INSERT INTO returns (
                                id, return_number, sale_id, invoice_number, customer_id, customer_name,
                                cashier_id, total_piasters, refund_method, reason, is_without_invoice, shift_id, idempotency_key, idempotency_fingerprint, created_at
                            ) VALUES (
                                @id, @returnNumber, @saleId, @invoiceNumber, @customerId, @customerName,
                                @cashierId, @total, @refundMethod, @reason, @isWithoutInvoice, @shiftId, @idemKey, @idemFp, @createdAt
                            );
                        ";
                        using (var cmd = new SQLiteCommand(insertReturnSql, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@id", returnObj.Id);
                            cmd.Parameters.AddWithValue("@returnNumber", returnObj.ReturnNumber);
                            cmd.Parameters.AddWithValue("@saleId", (object)returnObj.SaleId ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@invoiceNumber", returnObj.InvoiceNumber.HasValue ? (object)returnObj.InvoiceNumber.Value : DBNull.Value);
                            cmd.Parameters.AddWithValue("@customerId", (object)returnObj.CustomerId ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@customerName", (object)returnObj.CustomerName ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@cashierId", (object)returnObj.CashierId ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@total", refundParts != null ? refundParts[0].AmountPiasters : returnObj.TotalPiasters);
                            cmd.Parameters.AddWithValue("@refundMethod", returnObj.RefundMethod);
                            cmd.Parameters.AddWithValue("@reason", (object)returnObj.Reason ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@isWithoutInvoice", returnObj.IsWithoutInvoice ? 1 : 0);
                            cmd.Parameters.AddWithValue("@shiftId", (object)returnObj.ShiftId ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@idemKey", (object)Common.IdempotencyGuard.NormalizeKey(returnObj.IdempotencyKey) ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@idemFp", (object)returnObj.IdempotencyFingerprint ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@createdAt", returnObj.CreatedAt);
                            cmd.ExecuteNonQuery();
                        }

                        // 2.b Split refund: every further method is stored as an item-less linked row ('split:' + master id) with its own amount,
                        // so drawer, shift, closing and per-method caps keep summing returns.total_piasters by refund_method
                        if (refundParts != null)
                        {
                            for (int partIdx = 1; partIdx < refundParts.Count; partIdx++)
                            {
                                int partReturnNumber = (int)_counters.GetNextCounterNumber(conn, trans, "return_number", "returns", "return_number");
                                string partReason = string.Format("{0} [جزء من مرتجع مقسّم رقم #{1}]", returnObj.Reason ?? "", returnObj.ReturnNumber).Trim();
                                using (var partCmd = new SQLiteCommand(insertReturnSql, conn, trans))
                                {
                                    partCmd.Parameters.AddWithValue("@id", Guid.NewGuid().ToString());
                                    partCmd.Parameters.AddWithValue("@returnNumber", partReturnNumber);
                                    partCmd.Parameters.AddWithValue("@saleId", (object)returnObj.SaleId ?? DBNull.Value);
                                    partCmd.Parameters.AddWithValue("@invoiceNumber", returnObj.InvoiceNumber.HasValue ? (object)returnObj.InvoiceNumber.Value : DBNull.Value);
                                    partCmd.Parameters.AddWithValue("@customerId", (object)returnObj.CustomerId ?? DBNull.Value);
                                    partCmd.Parameters.AddWithValue("@customerName", (object)returnObj.CustomerName ?? DBNull.Value);
                                    partCmd.Parameters.AddWithValue("@cashierId", (object)returnObj.CashierId ?? DBNull.Value);
                                    partCmd.Parameters.AddWithValue("@total", refundParts[partIdx].AmountPiasters);
                                    partCmd.Parameters.AddWithValue("@refundMethod", refundParts[partIdx].Method);
                                    partCmd.Parameters.AddWithValue("@reason", partReason);
                                    partCmd.Parameters.AddWithValue("@isWithoutInvoice", 0);
                                    partCmd.Parameters.AddWithValue("@shiftId", (object)returnObj.ShiftId ?? DBNull.Value);
                                    partCmd.Parameters.AddWithValue("@idemKey", SplitKeyPrefix + returnObj.Id + ":" + partIdx);
                                    partCmd.Parameters.AddWithValue("@idemFp", DBNull.Value);
                                    partCmd.Parameters.AddWithValue("@createdAt", returnObj.CreatedAt);
                                    partCmd.ExecuteNonQuery();
                                }
                            }
                        }

                        // 3. Process items, restore stock or record damaged, and log stock movements
                        string nowIso = DateTime.UtcNow.ToString("o");
                        for (int i = 0; i < returnObj.Items.Count; i++)
                        {
                            var item = returnObj.Items[i];
                            if (string.IsNullOrEmpty(item.Id))
                            {
                                item.Id = Guid.NewGuid().ToString();
                            }
                            item.ReturnId = returnObj.Id;
                            item.CreatedAt = returnObj.CreatedAt;

                            string insertItemSql = @"
                                INSERT INTO return_items (
                                    id, return_id, sale_item_id, product_id, product_name, barcode,
                                    quantity_milli, unit_price_piasters, total_piasters, is_damaged, unit, created_at
                                ) VALUES (
                                    @id, @returnId, @saleItemId, @productId, @productName, @barcode,
                                    @quantityMilli, @unitPrice, @total, @isDamaged, @unit, @createdAt
                                );
                            ";
                            using (var cmd = new SQLiteCommand(insertItemSql, conn, trans))
                            {
                                cmd.Parameters.AddWithValue("@id", item.Id);
                                cmd.Parameters.AddWithValue("@returnId", item.ReturnId);
                                cmd.Parameters.AddWithValue("@saleItemId", (object)item.SaleItemId ?? DBNull.Value);
                                cmd.Parameters.AddWithValue("@productId", item.ProductId);
                                cmd.Parameters.AddWithValue("@productName", item.ProductName);
                                cmd.Parameters.AddWithValue("@barcode", (object)item.Barcode ?? DBNull.Value);
                                cmd.Parameters.AddWithValue("@quantityMilli", item.QuantityMilli);
                                cmd.Parameters.AddWithValue("@unitPrice", item.UnitPricePiasters);
                                cmd.Parameters.AddWithValue("@total", item.TotalPiasters);
                                cmd.Parameters.AddWithValue("@isDamaged", item.IsDamaged ? 1 : 0);
                                cmd.Parameters.AddWithValue("@unit", item.Unit ?? "piece");
                                cmd.Parameters.AddWithValue("@createdAt", item.CreatedAt);
                                cmd.ExecuteNonQuery();
                            }

                            // Fetch product cost, catalog price, and verify warehouse existence (Audit F-28 / F-10)
                            long unitCost = 0;
                            long catalogPrice = 0;
                            string catalogProdName = null;
                            bool prodExistsInDb = false;
                            using (var cCmd = new SQLiteCommand("SELECT cost_piasters, price_piasters, name FROM products WHERE id = @pid LIMIT 1;", conn, trans))
                            {
                                cCmd.Parameters.AddWithValue("@pid", item.ProductId);
                                using (var cRdr = cCmd.ExecuteReader())
                                {
                                    if (cRdr.Read())
                                    {
                                        if (cRdr["cost_piasters"] != DBNull.Value) unitCost = Convert.ToInt64(cRdr["cost_piasters"]);
                                        if (cRdr["price_piasters"] != DBNull.Value) catalogPrice = Convert.ToInt64(cRdr["price_piasters"]);
                                        if (cRdr["name"] != DBNull.Value) catalogProdName = cRdr["name"].ToString();
                                        prodExistsInDb = true;
                                    }
                                }
                            }

                            // Price ceiling for without-invoice returns (F-10)
                            if (string.IsNullOrEmpty(returnObj.SaleId) || returnObj.IsWithoutInvoice)
                            {
                                if (catalogPrice > 0 && item.UnitPricePiasters > catalogPrice)
                                {
                                    bool hasOverride = RafiqPOS.Services.DatabaseService.Security != null && RafiqPOS.Services.DatabaseService.Security.HasPermission(returnObj.CashierId, "pos.price_override");
                                    if (!hasOverride)
                                    {
                                        throw new InvalidOperationException(string.Format(
                                            "سعر الوحدة للصنف '{0}' في المرتجع ({1:N2} ج.م) يتجاوز سعر البيع في الكتالوج ({2:N2} ج.م) ويتطلب صلاحية تجاوز السعر (pos.price_override).",
                                            catalogProdName ?? item.ProductName ?? item.ProductId, item.UnitPricePiasters / 100.0, catalogPrice / 100.0));
                                    }
                                }
                            }

                            // Determine conversion factor from stored data only - never trust the client value (Audit F-08)
                            int factor = 1;
                            bool factorResolved = false;
                            if (!string.IsNullOrEmpty(item.SaleItemId))
                            {
                                using (var fCmd = new SQLiteCommand("SELECT conversion_factor FROM sale_items WHERE id = @siId LIMIT 1;", conn, trans))
                                {
                                    fCmd.Parameters.AddWithValue("@siId", item.SaleItemId);
                                    object fRes = fCmd.ExecuteScalar();
                                    if (fRes != null && fRes != DBNull.Value)
                                    {
                                        int cf = Convert.ToInt32(fRes);
                                        if (cf > 0) factor = cf;
                                        factorResolved = true;
                                    }
                                }
                            }
                            if (!factorResolved && !string.IsNullOrEmpty(item.Unit) && item.Unit != "piece")
                            {
                                using (var fCmd = new SQLiteCommand("SELECT conversion_factor FROM product_units WHERE product_id = @pid AND unit_name = @uname LIMIT 1;", conn, trans))
                                {
                                    fCmd.Parameters.AddWithValue("@pid", item.ProductId);
                                    fCmd.Parameters.AddWithValue("@uname", item.Unit);
                                    object fRes = fCmd.ExecuteScalar();
                                    if (fRes != null && fRes != DBNull.Value)
                                    {
                                        int cf = Convert.ToInt32(fRes);
                                        if (cf > 0) factor = cf;
                                    }
                                }
                            }
                            long baseQtyMilli = item.QuantityMilli * factor;

                            // Recipe-made menu items never left stock (their ingredients did), so nothing returns to stock
                            bool lineStockDeducted = prodExistsInDb && (!string.IsNullOrEmpty(returnObj.SaleId)
                                ? SaleRepository.WasSaleLineStockDeducted(conn, trans, returnObj.SaleId, item.SaleItemId, item.ProductId)
                                : DatabaseService.RecipeRepo == null || !DatabaseService.RecipeRepo.IsRecipeDepletedOnSale(conn, trans, item.ProductId));

                            if (lineStockDeducted)
                            {
                                if (!item.IsDamaged)
                                {
                                    // Restore stock for undamaged returned items
                                    string updateStockSql = @"
                                        UPDATE products 
                                        SET stock_quantity_milli = stock_quantity_milli + @qty,
                                            updated_at = @now
                                        WHERE id = @prodId;
                                    ";
                                using (var cmd = new SQLiteCommand(updateStockSql, conn, trans))
                                {
                                    cmd.Parameters.AddWithValue("@qty", baseQtyMilli);
                                    cmd.Parameters.AddWithValue("@now", nowIso);
                                    cmd.Parameters.AddWithValue("@prodId", item.ProductId);
                                    cmd.ExecuteNonQuery();
                                }

                                // If this product is a variant (has parent_id), synchronize variant table and parent product total stock
                                string syncVariantStockSql = @"
                                    UPDATE product_variants
                                    SET stock_quantity_milli = stock_quantity_milli + @qty,
                                        updated_at = @now
                                    WHERE variant_product_id = @prodId;

                                    UPDATE products
                                    SET stock_quantity_milli = (
                                        SELECT COALESCE(SUM(p2.stock_quantity_milli), 0)
                                        FROM products p2
                                        WHERE p2.parent_id = (SELECT p1.parent_id FROM products p1 WHERE p1.id = @prodId)
                                          AND p2.is_active = 1
                                    ),
                                    updated_at = @now
                                    WHERE id = (SELECT p1.parent_id FROM products p1 WHERE p1.id = @prodId AND p1.parent_id IS NOT NULL);
                                ";
                                using (var vSyncCmd = new SQLiteCommand(syncVariantStockSql, conn, trans))
                                {
                                    vSyncCmd.Parameters.AddWithValue("@qty", baseQtyMilli);
                                    vSyncCmd.Parameters.AddWithValue("@now", nowIso);
                                    vSyncCmd.Parameters.AddWithValue("@prodId", item.ProductId);
                                    vSyncCmd.ExecuteNonQuery();
                                }

                                // Check if product has batches and restore batch inventory
                                bool hasBatches = false;
                                using (var bCheckCmd = new SQLiteCommand("SELECT 1 FROM product_batches WHERE product_id = @prodId LIMIT 1;", conn, trans))
                                {
                                    bCheckCmd.Parameters.AddWithValue("@prodId", item.ProductId);
                                    object bCheckRes = bCheckCmd.ExecuteScalar();
                                    if (bCheckRes != null && bCheckRes != DBNull.Value) hasBatches = true;
                                }

                                if (hasBatches)
                                {
                                    long remainingToRestore = baseQtyMilli;
                                    // 1. If linked to an original sale, find batches deducted in that sale
                                    if (!string.IsNullOrEmpty(returnObj.SaleId))
                                    {
                                        var saleBatches = new List<Tuple<string, string, long>>();
                                        // Priority 1: Check sale_item_batch_allocations for exact batch allocations
                                        string sAllocSql = @"
                                            SELECT a.batch_id, pb.batch_number, a.quantity_milli AS deducted_qty
                                            FROM sale_item_batch_allocations a
                                            JOIN sale_items si ON a.sale_item_id = si.id
                                            JOIN product_batches pb ON a.batch_id = pb.id
                                            WHERE si.sale_id = @sid AND si.product_id = @prodId
                                            ORDER BY a.created_at DESC, a.rowid DESC;
                                        ";
                                        using (var saCmd = new SQLiteCommand(sAllocSql, conn, trans))
                                        {
                                            saCmd.Parameters.AddWithValue("@sid", returnObj.SaleId);
                                            saCmd.Parameters.AddWithValue("@prodId", item.ProductId);
                                            using (var saReader = saCmd.ExecuteReader())
                                            {
                                                while (saReader.Read())
                                                {
                                                    string bId = saReader["batch_id"].ToString();
                                                    string bNum = saReader["batch_number"].ToString();
                                                    long dQty = Convert.ToInt64(saReader["deducted_qty"]);
                                                    saleBatches.Add(new Tuple<string, string, long>(bId, bNum, dQty));
                                                }
                                            }
                                        }

                                        // Fallback: If no allocations found (e.g. historical sales before migration 43), query stock_movements
                                        if (saleBatches.Count == 0)
                                        {
                                            string sBatchesSql = @"
                                                SELECT sm.batch_id, pb.batch_number, ABS(sm.quantity_milli) AS deducted_qty
                                                FROM stock_movements sm
                                                JOIN product_batches pb ON sm.batch_id = pb.id
                                                WHERE sm.reference_id = @sid AND sm.movement_type = 'SALE' AND sm.product_id = @prodId AND sm.batch_id IS NOT NULL
                                                ORDER BY sm.created_at DESC, sm.rowid DESC;
                                            ";
                                            using (var sbCmd = new SQLiteCommand(sBatchesSql, conn, trans))
                                            {
                                                sbCmd.Parameters.AddWithValue("@sid", returnObj.SaleId);
                                                sbCmd.Parameters.AddWithValue("@prodId", item.ProductId);
                                                using (var sbReader = sbCmd.ExecuteReader())
                                                {
                                                    while (sbReader.Read())
                                                    {
                                                        string bId = sbReader["batch_id"].ToString();
                                                        string bNum = sbReader["batch_number"].ToString();
                                                        long dQty = Convert.ToInt64(sbReader["deducted_qty"]);
                                                        saleBatches.Add(new Tuple<string, string, long>(bId, bNum, dQty));
                                                    }
                                                }
                                            }
                                        }

                                        for (int sbIdx = 0; sbIdx < saleBatches.Count && remainingToRestore > 0; sbIdx++)
                                        {
                                            string bId = saleBatches[sbIdx].Item1;
                                            string bNum = saleBatches[sbIdx].Item2;
                                            long dQty = saleBatches[sbIdx].Item3;

                                            long alreadyRestored = 0;
                                            using (var arCmd = new SQLiteCommand(@"
                                                SELECT COALESCE(SUM(sm_ret.quantity_milli), 0)
                                                FROM stock_movements sm_ret
                                                JOIN returns r ON sm_ret.reference_id = r.id
                                                WHERE r.sale_id = @sid AND sm_ret.movement_type = 'REFUND' AND sm_ret.batch_id = @bid;
                                            ", conn, trans))
                                            {
                                                arCmd.Parameters.AddWithValue("@sid", returnObj.SaleId);
                                                arCmd.Parameters.AddWithValue("@bid", bId);
                                                object arRes = arCmd.ExecuteScalar();
                                                if (arRes != null && arRes != DBNull.Value) alreadyRestored = Convert.ToInt64(arRes);
                                            }

                                            long canRestore = Math.Max(0, dQty - alreadyRestored);
                                            if (canRestore > 0)
                                            {
                                                long restoreThis = Math.Min(remainingToRestore, canRestore);
                                                using (var uBatchCmd = new SQLiteCommand("UPDATE product_batches SET quantity_milli = quantity_milli + @bQty, status = 'ACTIVE', updated_at = @now WHERE id = @bid;", conn, trans))
                                                {
                                                    uBatchCmd.Parameters.AddWithValue("@bQty", restoreThis);
                                                    uBatchCmd.Parameters.AddWithValue("@now", nowIso);
                                                    uBatchCmd.Parameters.AddWithValue("@bid", bId);
                                                    uBatchCmd.ExecuteNonQuery();
                                                }

                                                // Record stock movement for this restored batch
                                                using (var cmd = new SQLiteCommand(@"
                                                    INSERT INTO stock_movements (
                                                        id, product_id, movement_type, quantity_milli, reference_id, reference_type,
                                                        unit_cost_piasters, note, batch_number, batch_id, created_at
                                                    ) VALUES (
                                                        @mId, @mProdId, 'REFUND', @mQty, @mRefId, 'RETURN',
                                                        @mUnitCost, @mNote, @mBNum, @mBId, @mNow
                                                    );", conn, trans))
                                                {
                                                    cmd.Parameters.AddWithValue("@mId", Guid.NewGuid().ToString());
                                                    cmd.Parameters.AddWithValue("@mProdId", item.ProductId);
                                                    cmd.Parameters.AddWithValue("@mQty", restoreThis);
                                                    cmd.Parameters.AddWithValue("@mRefId", returnObj.Id);
                                                    cmd.Parameters.AddWithValue("@mUnitCost", unitCost);
                                                    cmd.Parameters.AddWithValue("@mNote", string.Format("مرتجع بضاعة #{0} (فاتورة #{1}) - دفعة {2}", returnObj.ReturnNumber, returnObj.InvoiceNumber.HasValue ? returnObj.InvoiceNumber.Value.ToString() : "بدون", bNum));
                                                    cmd.Parameters.AddWithValue("@mBNum", bNum);
                                                    cmd.Parameters.AddWithValue("@mBId", bId);
                                                    cmd.Parameters.AddWithValue("@mNow", nowIso);
                                                    cmd.ExecuteNonQuery();
                                                }

                                                remainingToRestore -= restoreThis;
                                            }
                                        }
                                    }

                                    // If still remaining (e.g. without invoice or excess), restore to latest active/available batch
                                    if (remainingToRestore > 0)
                                    {
                                        string fallbackBatchId = null;
                                        string fallbackBatchNum = null;
                                        using (var fbCmd = new SQLiteCommand("SELECT id, batch_number FROM product_batches WHERE product_id = @prodId ORDER BY (CASE WHEN status = 'ACTIVE' THEN 1 ELSE 2 END), created_at DESC LIMIT 1;", conn, trans))
                                        {
                                            fbCmd.Parameters.AddWithValue("@prodId", item.ProductId);
                                            using (var fbReader = fbCmd.ExecuteReader())
                                            {
                                                if (fbReader.Read())
                                                {
                                                    fallbackBatchId = fbReader["id"].ToString();
                                                    fallbackBatchNum = fbReader["batch_number"].ToString();
                                                }
                                            }
                                        }

                                        if (!string.IsNullOrEmpty(fallbackBatchId))
                                        {
                                            using (var uBatchCmd = new SQLiteCommand("UPDATE product_batches SET quantity_milli = quantity_milli + @bQty, status = 'ACTIVE', updated_at = @now WHERE id = @bid;", conn, trans))
                                            {
                                                uBatchCmd.Parameters.AddWithValue("@bQty", remainingToRestore);
                                                uBatchCmd.Parameters.AddWithValue("@now", nowIso);
                                                uBatchCmd.Parameters.AddWithValue("@bid", fallbackBatchId);
                                                uBatchCmd.ExecuteNonQuery();
                                            }

                                            using (var cmd = new SQLiteCommand(@"
                                                INSERT INTO stock_movements (
                                                    id, product_id, movement_type, quantity_milli, reference_id, reference_type,
                                                    unit_cost_piasters, note, batch_number, batch_id, created_at
                                                ) VALUES (
                                                    @mId, @mProdId, 'REFUND', @mQty, @mRefId, 'RETURN',
                                                    @mUnitCost, @mNote, @mBNum, @mBId, @mNow
                                                );", conn, trans))
                                            {
                                                cmd.Parameters.AddWithValue("@mId", Guid.NewGuid().ToString());
                                                cmd.Parameters.AddWithValue("@mProdId", item.ProductId);
                                                cmd.Parameters.AddWithValue("@mQty", remainingToRestore);
                                                cmd.Parameters.AddWithValue("@mRefId", returnObj.Id);
                                                cmd.Parameters.AddWithValue("@mUnitCost", unitCost);
                                                cmd.Parameters.AddWithValue("@mNote", string.Format("مرتجع بضاعة #{0} (فاتورة #{1}) - دفعة {2}", returnObj.ReturnNumber, returnObj.InvoiceNumber.HasValue ? returnObj.InvoiceNumber.Value.ToString() : "بدون", fallbackBatchNum));
                                                cmd.Parameters.AddWithValue("@mBNum", fallbackBatchNum);
                                                cmd.Parameters.AddWithValue("@mBId", fallbackBatchId);
                                                cmd.Parameters.AddWithValue("@mNow", nowIso);
                                                cmd.ExecuteNonQuery();
                                            }
                                            remainingToRestore = 0;
                                        }
                                    }

                                    // If for any reason no batch row was found, insert standard movement
                                    if (remainingToRestore > 0)
                                    {
                                        using (var cmd = new SQLiteCommand(@"
                                            INSERT INTO stock_movements (
                                                id, product_id, movement_type, quantity_milli, reference_id, reference_type,
                                                unit_cost_piasters, note, batch_number, created_at
                                            ) VALUES (
                                                @mId, @mProdId, 'REFUND', @mQty, @mRefId, 'RETURN',
                                                @mUnitCost, @mNote, NULL, @mNow
                                            );", conn, trans))
                                        {
                                            cmd.Parameters.AddWithValue("@mId", Guid.NewGuid().ToString());
                                            cmd.Parameters.AddWithValue("@mProdId", item.ProductId);
                                            cmd.Parameters.AddWithValue("@mQty", remainingToRestore);
                                            cmd.Parameters.AddWithValue("@mRefId", returnObj.Id);
                                            cmd.Parameters.AddWithValue("@mUnitCost", unitCost);
                                            cmd.Parameters.AddWithValue("@mNote", string.Format("مرتجع بضاعة #{0} (فاتورة #{1})", returnObj.ReturnNumber, returnObj.InvoiceNumber.HasValue ? returnObj.InvoiceNumber.Value.ToString() : "بدون"));
                                            cmd.Parameters.AddWithValue("@mNow", nowIso);
                                            cmd.ExecuteNonQuery();
                                        }
                                    }
                                }
                                else
                                {
                                    // Stock movement entry without batches
                                    string insertMovementSql = @"
                                        INSERT INTO stock_movements (
                                            id, product_id, movement_type, quantity_milli, reference_id, reference_type,
                                            unit_cost_piasters, note, batch_number, created_at
                                        ) VALUES (
                                            @mId, @mProdId, 'REFUND', @mQty, @mRefId, 'RETURN',
                                            @mUnitCost, @mNote, NULL, @mNow
                                        );
                                    ";
                                    using (var cmd = new SQLiteCommand(insertMovementSql, conn, trans))
                                    {
                                        cmd.Parameters.AddWithValue("@mId", Guid.NewGuid().ToString());
                                        cmd.Parameters.AddWithValue("@mProdId", item.ProductId);
                                        cmd.Parameters.AddWithValue("@mQty", baseQtyMilli);
                                        cmd.Parameters.AddWithValue("@mRefId", returnObj.Id);
                                        cmd.Parameters.AddWithValue("@mUnitCost", unitCost);
                                        cmd.Parameters.AddWithValue("@mNote", string.Format("مرتجع بضاعة #{0} (فاتورة #{1})", returnObj.ReturnNumber, returnObj.InvoiceNumber.HasValue ? returnObj.InvoiceNumber.Value.ToString() : "بدون"));
                                        cmd.Parameters.AddWithValue("@mNow", nowIso);
                                        cmd.ExecuteNonQuery();
                                    }
                                }
                            }
                            else
                            {
                                // Damaged items do NOT increase sellable stock, recorded as damaged movement
                                string insertDamagedSql = @"
                                    INSERT INTO stock_movements (
                                        id, product_id, movement_type, quantity_milli, reference_id, reference_type,
                                        unit_cost_piasters, note, batch_number, created_at
                                    ) VALUES (
                                        @mId, @mProdId, 'DAMAGED_RETURN', @mQty, @mRefId, 'RETURN_DAMAGED',
                                        @mUnitCost, @mNote, NULL, @mNow
                                    );
                                ";
                                using (var cmd = new SQLiteCommand(insertDamagedSql, conn, trans))
                                {
                                    cmd.Parameters.AddWithValue("@mId", Guid.NewGuid().ToString());
                                    cmd.Parameters.AddWithValue("@mProdId", item.ProductId);
                                    cmd.Parameters.AddWithValue("@mQty", baseQtyMilli);
                                    cmd.Parameters.AddWithValue("@mRefId", returnObj.Id);
                                    cmd.Parameters.AddWithValue("@mUnitCost", unitCost);
                                    cmd.Parameters.AddWithValue("@mNote", string.Format("مرتجع بضاعة تالفة #{0} (لا تدخل المخزون)", returnObj.ReturnNumber));
                                    cmd.Parameters.AddWithValue("@mNow", nowIso);
                                    cmd.ExecuteNonQuery();
                                }
                            }
                            }

                            // Story 131 / Task 188-5: Controlled Drug Contra-Entry in Inspection Ledger
                            if (DatabaseService.ControlledDrugRepo != null && DatabaseService.ControlledDrugRepo.IsProductControlled(item.ProductId, conn, trans))
                            {
                                var contra = new ControlledDrugDispense
                                {
                                    Id = Guid.NewGuid().ToString(),
                                    SaleId = returnObj.SaleId,
                                    SaleItemId = item.SaleItemId,
                                    ProductId = item.ProductId,
                                    ProductName = item.ProductName ?? catalogProdName,
                                    BatchId = item.BatchId,
                                    BatchNumber = item.BatchNumber,
                                    QuantityMilli = baseQtyMilli,
                                    PatientName = !string.IsNullOrEmpty(returnObj.CustomerName) ? returnObj.CustomerName : "مرتجع عميل",
                                    DoctorName = "إشعار مرتجع صيدلي",
                                    PrescriptionDate = DateTime.UtcNow.ToString("yyyy-MM-dd"),
                                    EntryType = "return",
                                    Reason = !string.IsNullOrEmpty(returnObj.Reason) ? returnObj.Reason : "مرتجع صيدلي رسمي",
                                    DispensedBy = returnObj.CashierId ?? "system",
                                    ApprovedBy = "مدير الصيدلية / المشرف المعتمد",
                                    Notes = string.Format("قيد معاكس رسمي لمرتجع #{0}", returnObj.ReturnNumber),
                                    CreatedAt = nowIso
                                };
                                DatabaseService.ControlledDrugRepo.InsertDispense(contra, conn, trans);
                            }
                        }

                        // 4. Apply each refund channel (credit ledger / digital account). Cash and card leave no extra rows:
                        // drawer and reports read the returns rows. The blocks below read the current charge from returnObj.
                        long fullReturnTotal = returnObj.TotalPiasters;
                        string primaryRefundMethod = returnObj.RefundMethod;
                        var refundCharges = new List<ReturnRefundPart>();
                        if (refundParts != null)
                        {
                            refundCharges.AddRange(refundParts);
                        }
                        else
                        {
                            refundCharges.Add(new ReturnRefundPart { Method = returnObj.RefundMethod, AmountPiasters = returnObj.TotalPiasters });
                        }
                        for (int chargeIdx = 0; chargeIdx < refundCharges.Count; chargeIdx++)
                        {
                        returnObj.RefundMethod = refundCharges[chargeIdx].Method;
                        returnObj.TotalPiasters = refundCharges[chargeIdx].AmountPiasters;

                        // 4.A If credit / customer_balance refund, reduce customer debt in customers and customer_ledger
                        if (returnObj.TotalPiasters > 0 && (string.Equals(returnObj.RefundMethod, "credit", StringComparison.OrdinalIgnoreCase) ||
                            string.Equals(returnObj.RefundMethod, "customer_balance", StringComparison.OrdinalIgnoreCase)))
                        {
                            if (string.IsNullOrWhiteSpace(returnObj.CustomerId))
                            {
                                throw new InvalidOperationException("لا يمكن صرف المرتجع كرصيد آجل/حساب عميل بدون تحديد عميل مسجل.");
                            }
                            if (returnObj.CustomerId == "cust_general_cash")
                            {
                                throw new InvalidOperationException("لا يمكن صرف المرتجع كرصيد آجل/حساب عميل للعميل النقدي العام.");
                            }

                            long currentBal = 0;
                            using (var cCmd = new SQLiteCommand("SELECT balance_piasters, is_archived FROM customers WHERE id = @cid LIMIT 1;", conn, trans))
                            {
                                cCmd.Parameters.AddWithValue("@cid", returnObj.CustomerId);
                                using (var cRdr = cCmd.ExecuteReader())
                                {
                                    if (!cRdr.Read())
                                    {
                                        throw new InvalidOperationException("العميل المحدد لصرف المرتجع غير موجود في قاعدة البيانات.");
                                    }
                                    if (cRdr["is_archived"] != DBNull.Value && Convert.ToInt32(cRdr["is_archived"]) == 1)
                                    {
                                        throw new InvalidOperationException("لا يمكن صرف المرتجع لحساب عميل مؤرشف. يرجى إلغاء أرشفة العميل أولاً.");
                                    }
                                    currentBal = Convert.ToInt64(cRdr["balance_piasters"]);
                                }
                            }

                            long newBal = currentBal - returnObj.TotalPiasters;
                            using (var uCmd = new SQLiteCommand("UPDATE customers SET balance_piasters = @newBal WHERE id = @cid;", conn, trans))
                            {
                                uCmd.Parameters.AddWithValue("@newBal", newBal);
                                uCmd.Parameters.AddWithValue("@cid", returnObj.CustomerId);
                                uCmd.ExecuteNonQuery();
                            }

                            string refundLedgerId = "led_" + Guid.NewGuid().ToString("N");
                            string insLedgerSql = @"
                                INSERT INTO customer_ledger (id, customer_id, type, sale_id, amount_piasters, balance_after_piasters, notes, created_at)
                                VALUES (@lid, @cid, 'refund', @sid, @amt, @after, @notes, @cat);
                            ";
                            using (var lCmd = new SQLiteCommand(insLedgerSql, conn, trans))
                            {
                                lCmd.Parameters.AddWithValue("@lid", refundLedgerId);
                                lCmd.Parameters.AddWithValue("@cid", returnObj.CustomerId);
                                lCmd.Parameters.AddWithValue("@sid", (object)returnObj.SaleId ?? DBNull.Value);
                                lCmd.Parameters.AddWithValue("@amt", returnObj.TotalPiasters);
                                lCmd.Parameters.AddWithValue("@after", newBal);
                                string ledgerNote = currentBal > 0 
                                    ? string.Format("خصم مرتجع رقم #{0} من المديونية", returnObj.ReturnNumber)
                                    : string.Format("إضافة مرتجع رقم #{0} كرصيد دائن لصالح العميل", returnObj.ReturnNumber);
                                lCmd.Parameters.AddWithValue("@notes", ledgerNote);
                                lCmd.Parameters.AddWithValue("@cat", returnObj.CreatedAt);
                                lCmd.ExecuteNonQuery();
                            }

                            // Record refund allocation against the original invoice in debt_allocations (F-28)
                            if (!string.IsNullOrEmpty(returnObj.SaleId))
                            {
                                string retAllocId = "alloc_ret_" + Guid.NewGuid().ToString("N");
                                string insRetAllocSql = @"
                                    INSERT INTO debt_allocations (id, ledger_id, sale_id, amount_piasters, type, created_at)
                                    VALUES (@aid, @lid, @sid, @amt, 'refund', @cat);
                                ";
                                using (var aCmd = new SQLiteCommand(insRetAllocSql, conn, trans))
                                {
                                    aCmd.Parameters.AddWithValue("@aid", retAllocId);
                                    aCmd.Parameters.AddWithValue("@lid", refundLedgerId);
                                    aCmd.Parameters.AddWithValue("@sid", returnObj.SaleId);
                                    aCmd.Parameters.AddWithValue("@amt", returnObj.TotalPiasters);
                                    aCmd.Parameters.AddWithValue("@cat", returnObj.CreatedAt);
                                    aCmd.ExecuteNonQuery();
                                }
                            }
                        }

                        // 4.B If refund was issued via digital wallet / InstaPay, deduct balance from digital_accounts and log transaction
                        if (returnObj.TotalPiasters > 0 && (string.Equals(returnObj.RefundMethod, "instapay", StringComparison.OrdinalIgnoreCase) ||
                            string.Equals(returnObj.RefundMethod, "vodafone_cash", StringComparison.OrdinalIgnoreCase) ||
                            string.Equals(returnObj.RefundMethod, "wallet", StringComparison.OrdinalIgnoreCase)))
                        {
                            string dType = string.Equals(returnObj.RefundMethod, "instapay", StringComparison.OrdinalIgnoreCase) ? "instapay" : "wallet";
                            string targetAccId = null;
                            string targetAccName = null;
                            long currentBal = 0;

                            using (var fCmd = new SQLiteCommand("SELECT id, name, balance_piasters FROM digital_accounts WHERE type = @t AND is_active = 1 ORDER BY is_default DESC, created_at ASC LIMIT 1;", conn, trans))
                            {
                                fCmd.Parameters.AddWithValue("@t", dType);
                                using (var fRdr = fCmd.ExecuteReader())
                                {
                                    if (fRdr.Read())
                                    {
                                        targetAccId = fRdr["id"].ToString();
                                        targetAccName = fRdr["name"] != DBNull.Value ? fRdr["name"].ToString() : (dType == "instapay" ? "إنستاباي" : "محفظة كاش");
                                        currentBal = Convert.ToInt64(fRdr["balance_piasters"]);
                                    }
                                }
                            }

                            if (string.IsNullOrEmpty(targetAccId))
                            {
                                throw new InvalidOperationException(string.Format("لا يوجد حساب {0} نشط مسجل في النظام لصرف المرتجع الإلكتروني من خلاله. يرجى تفعيل الحساب أو اختيار طريقة استرداد أخرى.", dType == "instapay" ? "إنستاباي" : "محفظة إلكترونية"));
                            }

                            if (currentBal < returnObj.TotalPiasters)
                            {
                                throw new InvalidOperationException(string.Format("رصيد حساب {0} الحالي ({1:N2} ج.م) غير كافٍ لصرف قيمة المرتجع ({2:N2} ج.م). يرجى تغذية رصيد الحساب أولاً أو اختيار طريقة استرداد أخرى.", targetAccName, currentBal / 100.0, returnObj.TotalPiasters / 100.0));
                            }

                            using (var uCmd = new SQLiteCommand("UPDATE digital_accounts SET balance_piasters = balance_piasters - @amt, updated_at = @now WHERE id = @id;", conn, trans))
                            {
                                uCmd.Parameters.AddWithValue("@amt", returnObj.TotalPiasters);
                                uCmd.Parameters.AddWithValue("@now", nowIso);
                                uCmd.Parameters.AddWithValue("@id", targetAccId);
                                uCmd.ExecuteNonQuery();
                            }

                            string insTx = @"
                                INSERT INTO digital_transactions (
                                    id, account_id, tx_type, amount_piasters, profit_piasters, total_collected_piasters,
                                    customer_name, sale_id, cashier_name, payment_destination, status, notes, created_at
                                ) VALUES (
                                    @id, @accId, 'pos_return', @amt, 0, @amt,
                                    @cust, @saleId, @cashier, 'wallet', 'completed', @notes, @now
                                );";
                            using (var iCmd = new SQLiteCommand(insTx, conn, trans))
                            {
                                iCmd.Parameters.AddWithValue("@id", Guid.NewGuid().ToString());
                                iCmd.Parameters.AddWithValue("@accId", targetAccId);
                                iCmd.Parameters.AddWithValue("@amt", returnObj.TotalPiasters);
                                iCmd.Parameters.AddWithValue("@cust", (object)returnObj.CustomerId ?? DBNull.Value);
                                iCmd.Parameters.AddWithValue("@saleId", (object)returnObj.SaleId ?? DBNull.Value);
                                iCmd.Parameters.AddWithValue("@cashier", (object)returnObj.CashierId ?? DBNull.Value);
                                iCmd.Parameters.AddWithValue("@notes", string.Format("مرتجع مبيعات #{0} عبر {1}", returnObj.ReturnNumber, dType == "instapay" ? "إنستاباي" : "محفظة كاش"));
                                iCmd.Parameters.AddWithValue("@now", nowIso);
                                iCmd.ExecuteNonQuery();
                            }
                        }

                        }
                        returnObj.RefundMethod = primaryRefundMethod;
                        returnObj.TotalPiasters = fullReturnTotal;

                        // 5. Update original sale status: differentiate fully refunded vs partially refunded
                        string targetSaleId = returnObj.SaleId;
                        if (string.IsNullOrEmpty(targetSaleId) && returnObj.InvoiceNumber.HasValue)
                        {
                            using (var findIdCmd = new SQLiteCommand("SELECT id FROM sales WHERE invoice_number = @inv LIMIT 1;", conn, trans))
                            {
                                findIdCmd.Parameters.AddWithValue("@inv", returnObj.InvoiceNumber.Value);
                                object foundIdObj = findIdCmd.ExecuteScalar();
                                if (foundIdObj != null && foundIdObj != DBNull.Value)
                                {
                                    targetSaleId = foundIdObj.ToString();
                                }
                            }
                        }

                        if (!string.IsNullOrEmpty(targetSaleId))
                        {
                            long totalSoldMilli = 0;
                            long totalSoldPiasters = 0;
                            using (var qCmd = new SQLiteCommand("SELECT COALESCE(SUM(quantity_milli), 0), COALESCE(SUM(total_piasters), 0) FROM sale_items WHERE sale_id = @sid;", conn, trans))
                            {
                                qCmd.Parameters.AddWithValue("@sid", targetSaleId);
                                using (var sReader = qCmd.ExecuteReader())
                                {
                                    if (sReader.Read())
                                    {
                                        totalSoldMilli = Convert.ToInt64(sReader[0]);
                                        totalSoldPiasters = Convert.ToInt64(sReader[1]);
                                    }
                                }
                            }

                            long totalRetMilli = 0;
                            using (var rqCmd = new SQLiteCommand(@"
                                SELECT COALESCE(SUM(ri.quantity_milli), 0)
                                FROM return_items ri
                                JOIN returns r ON ri.return_id = r.id
                                WHERE r.sale_id = @sid OR (r.invoice_number IS NOT NULL AND r.invoice_number = (SELECT invoice_number FROM sales WHERE id = @sid));", conn, trans))
                            {
                                rqCmd.Parameters.AddWithValue("@sid", targetSaleId);
                                object rRes = rqCmd.ExecuteScalar();
                                if (rRes != null && rRes != DBNull.Value) totalRetMilli = Convert.ToInt64(rRes);
                            }

                            long totalRetPiasters = 0;
                            using (var rpCmd = new SQLiteCommand(@"
                                SELECT COALESCE(SUM(total_piasters), 0)
                                FROM returns
                                WHERE sale_id = @sid OR (invoice_number IS NOT NULL AND invoice_number = (SELECT invoice_number FROM sales WHERE id = @sid));", conn, trans))
                            {
                                rpCmd.Parameters.AddWithValue("@sid", targetSaleId);
                                object pRes = rpCmd.ExecuteScalar();
                                if (pRes != null && pRes != DBNull.Value) totalRetPiasters = Convert.ToInt64(pRes);
                            }

                            bool isFullyRefunded = (totalSoldPiasters > 0 && totalRetPiasters >= totalSoldPiasters) ||
                                                   (totalSoldMilli > 0 && totalRetMilli >= totalSoldMilli);

                            string newStatus = isFullyRefunded ? "refunded" : "partially_refunded";

                            using (var uSaleCmd = new SQLiteCommand("UPDATE sales SET status = @st WHERE id = @sid AND status != 'cancelled';", conn, trans))
                            {
                                uSaleCmd.Parameters.AddWithValue("@st", newStatus);
                                uSaleCmd.Parameters.AddWithValue("@sid", targetSaleId);
                                uSaleCmd.ExecuteNonQuery();
                            }
                        }

                        // 6. Audit Log inside transaction
                        string detailsJson = Newtonsoft.Json.JsonConvert.SerializeObject(new
                        {
                            returnNumber = returnObj.ReturnNumber,
                            totalPiasters = returnObj.TotalPiasters,
                            itemCount = returnObj.Items.Count,
                            refundMethod = returnObj.RefundMethod,
                            refunds = refundParts,
                            saleId = returnObj.SaleId ?? "",
                            invoiceNumber = returnObj.InvoiceNumber
                        });
                        _auditRepo.Log(conn, trans, new AuditLog
                        {
                            Id = "aud_" + Guid.NewGuid().ToString("N"),
                            UserId = !string.IsNullOrEmpty(returnObj.CashierId) ? returnObj.CashierId : "usr_admin_default",
                            Action = "sale_refund",
                            EntityType = "return",
                            EntityId = returnObj.Id,
                            DetailsJson = detailsJson,
                            CreatedAt = returnObj.CreatedAt
                        });

                        if (string.IsNullOrEmpty(returnObj.SaleId) || returnObj.IsWithoutInvoice)
                        {
                            for (int aIdx = 0; aIdx < returnObj.Items.Count; aIdx++)
                            {
                                var aItem = returnObj.Items[aIdx];
                                _auditRepo.Log(conn, trans, new AuditLog
                                {
                                    Id = "aud_" + Guid.NewGuid().ToString("N"),
                                    UserId = !string.IsNullOrEmpty(returnObj.CashierId) ? returnObj.CashierId : "usr_admin_default",
                                    Action = "RETURN_WITHOUT_INVOICE",
                                    EntityType = "return",
                                    EntityId = returnObj.Id,
                                    DetailsJson = Newtonsoft.Json.JsonConvert.SerializeObject(new
                                    {
                                        product = aItem.ProductName ?? aItem.ProductId,
                                        pricePiasters = aItem.UnitPricePiasters,
                                        reason = returnObj.Reason ?? "مرتجع بدون فاتورة",
                                        returnNumber = returnObj.ReturnNumber
                                    }),
                                    CreatedAt = returnObj.CreatedAt
                                });
                            }
                        }

                        trans.Commit();
                        return returnObj;
                    }
                    catch
                    {
                        trans.Rollback();
                        throw;
                    }
                }
            }
        }

        public List<Return> GetRecentReturns(int limit = 50)
        {
            var list = new List<Return>();
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                // Masters only, so LIMIT counts operations; their linked split rows are fetched by creation time afterwards
                string sql = "SELECT * FROM returns WHERE COALESCE(idempotency_key, '') NOT LIKE 'split:%' ORDER BY created_at DESC LIMIT @limit;";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@limit", limit);
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            list.Add(MapReaderToReturn(reader));
                        }
                    }
                }

                if (list.Count > 0)
                {
                    string oldest = list[list.Count - 1].CreatedAt;
                    using (var cmd = new SQLiteCommand("SELECT * FROM returns WHERE idempotency_key LIKE 'split:%' AND created_at >= @oldest ORDER BY return_number ASC;", conn))
                    {
                        cmd.Parameters.AddWithValue("@oldest", oldest);
                        using (var reader = cmd.ExecuteReader())
                        {
                            while (reader.Read())
                            {
                                list.Add(MapReaderToReturn(reader));
                            }
                        }
                    }
                }
            }
            return FoldSplitRefunds(list);
        }

        /// <summary>
        /// المرتجع المسجل بنفس مفتاح منع التكرار (أو null)؛ يرفض نفس المفتاح مع بيانات مرتجع مختلفة
        /// </summary>
        public Return FindByIdempotency(string idempotencyKey, string fingerprint)
        {
            string existingId = Common.IdempotencyGuard.FindExisting(_connectionString, "returns", "id", idempotencyKey, fingerprint);
            return existingId != null ? GetReturnById(existingId) : null;
        }

        public Return GetReturnById(string id)
        {
            if (string.IsNullOrEmpty(id)) return null;
            Return ret = null;
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = "SELECT * FROM returns WHERE id = @id LIMIT 1;";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@id", id);
                    using (var reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            ret = MapReaderToReturn(reader);
                        }
                    }
                }
            }
            if (ret != null)
            {
                ret.Items = GetReturnItems(ret.Id);

                // A split refund keeps its other methods in linked rows; the caller sees the whole operation
                var rows = new List<Return>();
                rows.Add(ret);
                using (var conn = new SQLiteConnection(_connectionString))
                {
                    conn.Open();
                    using (var cmd = new SQLiteCommand("SELECT * FROM returns WHERE idempotency_key = @legacy OR idempotency_key LIKE @pattern ORDER BY return_number ASC;", conn))
                    {
                        // Legacy exact key (every companion shared it) plus the numbered keys 'split:<id>:<n>'
                        cmd.Parameters.AddWithValue("@legacy", SplitKeyPrefix + ret.Id);
                        cmd.Parameters.AddWithValue("@pattern", SplitKeyPrefix + ret.Id + ":%");
                        using (var reader = cmd.ExecuteReader())
                        {
                            while (reader.Read())
                            {
                                rows.Add(MapReaderToReturn(reader));
                            }
                        }
                    }
                }
                FoldSplitRefunds(rows);
            }
            return ret;
        }

        public List<Return> GetReturnsForSale(string saleId)
        {
            var list = new List<Return>();
            if (string.IsNullOrEmpty(saleId)) return list;

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = "SELECT * FROM returns WHERE sale_id = @saleId ORDER BY created_at ASC, return_number ASC;";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@saleId", saleId);
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            list.Add(MapReaderToReturn(reader));
                        }
                    }
                }
            }

            for (int i = 0; i < list.Count; i++)
            {
                list[i].Items = GetReturnItems(list[i].Id);
            }
            return list;
        }

        public List<ReturnItem> GetReturnItems(string returnId)
        {
            var items = new List<ReturnItem>();
            if (string.IsNullOrEmpty(returnId)) return items;

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = "SELECT * FROM return_items WHERE return_id = @rid;";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@rid", returnId);
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            items.Add(new ReturnItem
                            {
                                Id = reader["id"].ToString(),
                                ReturnId = reader["return_id"].ToString(),
                                SaleItemId = reader["sale_item_id"] != DBNull.Value ? reader["sale_item_id"].ToString() : null,
                                ProductId = reader["product_id"].ToString(),
                                ProductName = reader["product_name"].ToString(),
                                Barcode = reader["barcode"] != DBNull.Value ? reader["barcode"].ToString() : null,
                                QuantityMilli = Convert.ToInt64(reader["quantity_milli"]),
                                UnitPricePiasters = Convert.ToInt64(reader["unit_price_piasters"]),
                                TotalPiasters = Convert.ToInt64(reader["total_piasters"]),
                                IsDamaged = Convert.ToInt32(reader["is_damaged"]) == 1,
                                Unit = reader["unit"] != DBNull.Value ? reader["unit"].ToString() : "piece",
                                CreatedAt = reader["created_at"].ToString()
                            });
                        }
                    }
                }
            }
            return items;
        }

        private Return MapReaderToReturn(SQLiteDataReader reader)
        {
            return new Return
            {
                Id = reader["id"].ToString(),
                ReturnNumber = Convert.ToInt32(reader["return_number"]),
                SaleId = reader["sale_id"] != DBNull.Value ? reader["sale_id"].ToString() : null,
                InvoiceNumber = reader["invoice_number"] != DBNull.Value ? (int?)Convert.ToInt32(reader["invoice_number"]) : null,
                CustomerId = reader["customer_id"] != DBNull.Value ? reader["customer_id"].ToString() : null,
                CustomerName = reader["customer_name"] != DBNull.Value ? reader["customer_name"].ToString() : null,
                CashierId = reader["cashier_id"] != DBNull.Value ? reader["cashier_id"].ToString() : null,
                TotalPiasters = Convert.ToInt64(reader["total_piasters"]),
                RefundMethod = reader["refund_method"].ToString(),
                Reason = reader["reason"] != DBNull.Value ? reader["reason"].ToString() : null,
                IsWithoutInvoice = Convert.ToInt32(reader["is_without_invoice"]) == 1,
                ShiftId = HasColumn(reader, "shift_id") && reader["shift_id"] != DBNull.Value ? reader["shift_id"].ToString() : null,
                IdempotencyKey = HasColumn(reader, "idempotency_key") && reader["idempotency_key"] != DBNull.Value ? reader["idempotency_key"].ToString() : null,
                CreatedAt = reader["created_at"].ToString()
            };
        }

        private const string SplitKeyPrefix = "split:";

        // 'split:<masterId>:<n>' (or the legacy 'split:<masterId>') -> masterId
        private static string SplitMasterId(string idempotencyKey)
        {
            string rest = idempotencyKey.Substring(SplitKeyPrefix.Length);
            int colon = rest.IndexOf(':');
            return colon >= 0 ? rest.Substring(0, colon) : rest;
        }

        private static bool IsSplitCompanion(Return ret)
        {
            return ret != null && ret.IdempotencyKey != null && ret.IdempotencyKey.StartsWith(SplitKeyPrefix, StringComparison.OrdinalIgnoreCase);
        }

        /// <summary>
        /// يدمج صفوف المرتجع المقسّم: يبقى صف المرتجع الرئيسي فقط وإجماليه الكامل وأجزاء الاسترداد في Refunds؛
        /// الصفوف الملحقة (بلا أصناف) تُحذف من القائمة.
        /// </summary>
        public static List<Return> FoldSplitRefunds(List<Return> rows)
        {
            var folded = new List<Return>();
            if (rows == null) return folded;

            var masters = new Dictionary<string, Return>();
            for (int i = 0; i < rows.Count; i++)
            {
                if (!IsSplitCompanion(rows[i])) masters[rows[i].Id] = rows[i];
            }

            for (int i = 0; i < rows.Count; i++)
            {
                Return row = rows[i];
                if (!IsSplitCompanion(row))
                {
                    folded.Add(row);
                    continue;
                }

                Return master;
                if (!masters.TryGetValue(SplitMasterId(row.IdempotencyKey), out master)) continue;
                if (master.Refunds == null)
                {
                    master.Refunds = new List<ReturnRefundPart>();
                    master.Refunds.Add(new ReturnRefundPart { Method = master.RefundMethod, AmountPiasters = master.TotalPiasters });
                }
                master.Refunds.Add(new ReturnRefundPart { Method = row.RefundMethod, AmountPiasters = row.TotalPiasters });
                master.TotalPiasters += row.TotalPiasters;
            }
            return folded;
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
    }
}
