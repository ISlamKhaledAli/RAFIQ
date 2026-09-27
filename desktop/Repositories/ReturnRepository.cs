using System;
using System.Collections.Generic;
using System.Data.SQLite;
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

                        // Calculate total if not set
                        long calculatedTotal = 0;
                        for (int i = 0; i < returnObj.Items.Count; i++)
                        {
                            var it = returnObj.Items[i];
                            if (it.TotalPiasters <= 0 && it.UnitPricePiasters > 0 && it.QuantityMilli > 0)
                            {
                                it.TotalPiasters = (it.UnitPricePiasters * it.QuantityMilli) / 1000;
                            }
                            calculatedTotal += it.TotalPiasters;
                        }
                        if (returnObj.TotalPiasters <= 0)
                        {
                            returnObj.TotalPiasters = calculatedTotal;
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

                            // Fetch product cost
                            long unitCost = 0;
                            using (var cCmd = new SQLiteCommand("SELECT cost_piasters FROM products WHERE id = @pid LIMIT 1;", conn, trans))
                            {
                                cCmd.Parameters.AddWithValue("@pid", item.ProductId);
                                object cRes = cCmd.ExecuteScalar();
                                if (cRes != null && cRes != DBNull.Value)
                                {
                                    unitCost = Convert.ToInt64(cRes);
                                }
                            }

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
                                    cmd.Parameters.AddWithValue("@qty", item.QuantityMilli);
                                    cmd.Parameters.AddWithValue("@now", nowIso);
                                    cmd.Parameters.AddWithValue("@prodId", item.ProductId);
                                    cmd.ExecuteNonQuery();
                                }

                                // Stock movement entry
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
                                    cmd.Parameters.AddWithValue("@mQty", item.QuantityMilli);
                                    cmd.Parameters.AddWithValue("@mRefId", returnObj.Id);
                                    cmd.Parameters.AddWithValue("@mUnitCost", unitCost);
                                    cmd.Parameters.AddWithValue("@mNote", string.Format("مرتجع بضاعة #{0} (فاتورة #{1})", returnObj.ReturnNumber, returnObj.InvoiceNumber.HasValue ? returnObj.InvoiceNumber.Value.ToString() : "بدون"));
                                    cmd.Parameters.AddWithValue("@mNow", nowIso);
                                    cmd.ExecuteNonQuery();
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
                                    cmd.Parameters.AddWithValue("@mQty", item.QuantityMilli);
                                    cmd.Parameters.AddWithValue("@mRefId", returnObj.Id);
                                    cmd.Parameters.AddWithValue("@mUnitCost", unitCost);
                                    cmd.Parameters.AddWithValue("@mNote", string.Format("مرتجع بضاعة تالفة #{0} (لا تدخل المخزون)", returnObj.ReturnNumber));
                                    cmd.Parameters.AddWithValue("@mNow", nowIso);
                                    cmd.ExecuteNonQuery();
                                }
                            }
                        }

                        // 4. If credit refund, reduce customer debt in customers and customer_ledger
                        if (string.Equals(returnObj.RefundMethod, "credit", StringComparison.OrdinalIgnoreCase) && !string.IsNullOrEmpty(returnObj.CustomerId))
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
                                lCmd.Parameters.AddWithValue("@amt", -returnObj.TotalPiasters);
                                lCmd.Parameters.AddWithValue("@after", newBal);
                                lCmd.Parameters.AddWithValue("@notes", string.Format("خصم مرتجع رقم #{0} من المديونية", returnObj.ReturnNumber));
                                lCmd.Parameters.AddWithValue("@cat", returnObj.CreatedAt);
                                lCmd.ExecuteNonQuery();
                            }
                        }

                        // 5. Audit Log inside transaction
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
