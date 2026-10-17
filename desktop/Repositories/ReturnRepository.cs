using System;
using System.Collections.Generic;
using System.Data.SQLite;
using RafiqPOS.Common;
using RafiqPOS.Models;

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
            if (string.IsNullOrEmpty(returnObj.CreatedAt))
            {
                returnObj.CreatedAt = DateTime.UtcNow.ToString("o");
            }

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
                                        if (string.IsNullOrEmpty(returnObj.CustomerId) && saleReader["customer_id"] != DBNull.Value)
                                        {
                                            returnObj.CustomerId = saleReader["customer_id"].ToString();
                                        }
                                        if (string.IsNullOrEmpty(returnObj.CustomerName) && saleReader["customer_name"] != DBNull.Value)
                                        {
                                            returnObj.CustomerName = saleReader["customer_name"].ToString();
                                        }
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
                                        if (string.IsNullOrEmpty(returnObj.CustomerId) && invReader["customer_id"] != DBNull.Value)
                                        {
                                            returnObj.CustomerId = invReader["customer_id"].ToString();
                                        }
                                        if (string.IsNullOrEmpty(returnObj.CustomerName) && invReader["customer_name"] != DBNull.Value)
                                        {
                                            returnObj.CustomerName = invReader["customer_name"].ToString();
                                        }
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
                        for (int i = 0; i < returnObj.Items.Count; i++)
                        {
                            var it = returnObj.Items[i];
                            decimal lineDec = ((decimal)it.UnitPricePiasters * it.QuantityMilli) / 1000m;
                            long expectedLineTotal = (long)Math.Round(lineDec, 0, MidpointRounding.AwayFromZero);
                            // Invoice-linked line totals are computed by ReturnService from the original sale line
                            // (proportional, remainder-exact - Audit F-19); returns without an invoice use price x qty.
                            bool serviceComputed = !string.IsNullOrEmpty(returnObj.SaleId);
                            if (!serviceComputed || it.TotalPiasters < 0)
                            {
                                it.TotalPiasters = expectedLineTotal;
                            }
                            else if (it.TotalPiasters > expectedLineTotal)
                            {
                                it.TotalPiasters = expectedLineTotal;
                            }
                            calculatedTotal += it.TotalPiasters;
                        }
                        returnObj.TotalPiasters = calculatedTotal;

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

                        // 2. Insert Returns Master record
                        string insertReturnSql = @"
                            INSERT INTO returns (
                                id, return_number, sale_id, invoice_number, customer_id, customer_name,
                                cashier_id, total_piasters, refund_method, reason, is_without_invoice, created_at
                            ) VALUES (
                                @id, @returnNumber, @saleId, @invoiceNumber, @customerId, @customerName,
                                @cashierId, @total, @refundMethod, @reason, @isWithoutInvoice, @createdAt
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
                            cmd.Parameters.AddWithValue("@total", returnObj.TotalPiasters);
                            cmd.Parameters.AddWithValue("@refundMethod", returnObj.RefundMethod ?? "cash");
                            cmd.Parameters.AddWithValue("@reason", (object)returnObj.Reason ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@isWithoutInvoice", returnObj.IsWithoutInvoice ? 1 : 0);
                            cmd.Parameters.AddWithValue("@createdAt", returnObj.CreatedAt);
                            cmd.ExecuteNonQuery();
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

                            // Fetch product cost and verify warehouse existence (Audit F-28 / Quick Items Support)
                            long unitCost = 0;
                            bool prodExistsInDb = false;
                            using (var cCmd = new SQLiteCommand("SELECT cost_piasters FROM products WHERE id = @pid LIMIT 1;", conn, trans))
                            {
                                cCmd.Parameters.AddWithValue("@pid", item.ProductId);
                                object cRes = cCmd.ExecuteScalar();
                                if (cRes != null && cRes != DBNull.Value)
                                {
                                    unitCost = Convert.ToInt64(cRes);
                                    prodExistsInDb = true;
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

                            if (prodExistsInDb)
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
                        }

                        // 4. If credit / customer_balance refund, reduce customer debt in customers and customer_ledger
                        if ((string.Equals(returnObj.RefundMethod, "credit", StringComparison.OrdinalIgnoreCase) ||
                             string.Equals(returnObj.RefundMethod, "customer_balance", StringComparison.OrdinalIgnoreCase)) && !string.IsNullOrEmpty(returnObj.CustomerId))
                        {
                            long currentBal = 0;
                            using (var cCmd = new SQLiteCommand("SELECT balance_piasters FROM customers WHERE id = @cid LIMIT 1;", conn, trans))
                            {
                                cCmd.Parameters.AddWithValue("@cid", returnObj.CustomerId);
                                object cRes = cCmd.ExecuteScalar();
                                if (cRes != null && cRes != DBNull.Value)
                                {
                                    currentBal = Convert.ToInt64(cRes);
                                }
                            }

                            long newBal = currentBal - returnObj.TotalPiasters;
                            using (var uCmd = new SQLiteCommand("UPDATE customers SET balance_piasters = @newBal WHERE id = @cid;", conn, trans))
                            {
                                uCmd.Parameters.AddWithValue("@newBal", newBal);
                                uCmd.Parameters.AddWithValue("@cid", returnObj.CustomerId);
                                uCmd.ExecuteNonQuery();
                            }

                            string insLedgerSql = @"
                                INSERT INTO customer_ledger (id, customer_id, type, sale_id, amount_piasters, balance_after_piasters, notes, created_at)
                                VALUES (@lid, @cid, 'refund', @sid, @amt, @after, @notes, @cat);
                            ";
                            using (var lCmd = new SQLiteCommand(insLedgerSql, conn, trans))
                            {
                                lCmd.Parameters.AddWithValue("@lid", "led_" + Guid.NewGuid().ToString("N").Substring(0, 12));
                                lCmd.Parameters.AddWithValue("@cid", returnObj.CustomerId);
                                lCmd.Parameters.AddWithValue("@sid", (object)returnObj.SaleId ?? DBNull.Value);
                                lCmd.Parameters.AddWithValue("@amt", returnObj.TotalPiasters);
                                lCmd.Parameters.AddWithValue("@after", newBal);
                                lCmd.Parameters.AddWithValue("@notes", string.Format("خصم مرتجع رقم #{0} من المديونية", returnObj.ReturnNumber));
                                lCmd.Parameters.AddWithValue("@cat", returnObj.CreatedAt);
                                lCmd.ExecuteNonQuery();
                            }
                        }

                        // 4.B If refund was issued via digital wallet / InstaPay, deduct balance from digital_accounts and log transaction
                        if (string.Equals(returnObj.RefundMethod, "instapay", StringComparison.OrdinalIgnoreCase) ||
                            string.Equals(returnObj.RefundMethod, "vodafone_cash", StringComparison.OrdinalIgnoreCase) ||
                            string.Equals(returnObj.RefundMethod, "wallet", StringComparison.OrdinalIgnoreCase))
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
                        string detailsJson = string.Format(
                            "{{\"returnNumber\":{0},\"totalPiasters\":{1},\"itemCount\":{2},\"refundMethod\":\"{3}\",\"saleId\":\"{4}\",\"invoiceNumber\":{5}}}",
                            returnObj.ReturnNumber, returnObj.TotalPiasters, returnObj.Items.Count,
                            returnObj.RefundMethod, returnObj.SaleId ?? "",
                            returnObj.InvoiceNumber.HasValue ? returnObj.InvoiceNumber.Value.ToString() : "null"
                        );
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
                string sql = "SELECT * FROM returns ORDER BY created_at DESC LIMIT @limit;";
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
            }
            return list;
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
                string sql = "SELECT * FROM returns WHERE sale_id = @saleId ORDER BY created_at ASC;";
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
                CreatedAt = reader["created_at"].ToString()
            };
        }
    }
}
