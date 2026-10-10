using System;
using System.Collections.Generic;
using System.Data.SQLite;
using RafiqPOS.Models;

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

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        // 1. Get next atomic purchase invoice number
                        purchase.InvoiceNumber = _counterRepo.GetNextCounterNumber(conn, trans, "purchase_invoice", "purchases", "invoice_number");

                        // 2. Calculate item totals and compute invoice total
                        long totalCost = 0;
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
                            if (item.UnitCostPiasters < 0)
                            {
                                throw new ArgumentException(string.Format("تكلفة شراء الصنف '{0}' لا يمكن أن تكون سالبة", item.ProductName ?? item.ProductId));
                            }

                            // Math check: total = (quantityMilli * unitCostPiasters) / 1000
                            item.TotalCostPiasters = (item.QuantityMilli * item.UnitCostPiasters) / 1000;
                            totalCost += item.TotalCostPiasters;
                        }

                        purchase.TotalCostPiasters = totalCost;
                        purchase.NetCostPiasters = Math.Max(0, totalCost - purchase.DiscountPiasters);

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

                        // 3. Insert Purchase Master Record
                        string insertMasterSql = @"
                            INSERT INTO purchases (
                                id, invoice_number, supplier_id, supplier_invoice_number,
                                invoice_date, total_cost_piasters, discount_piasters,
                                net_cost_piasters, paid_amount_piasters, remaining_amount_piasters,
                                payment_status, status, notes, created_by_user_id,
                                created_at, updated_at
                            ) VALUES (
                                @id, @invNum, @supId, @supInvNum,
                                @invDate, @totalCost, @discount,
                                @netCost, @paidAmt, @remAmt,
                                @payStatus, @status, @notes, @userId,
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
                            cmd.Parameters.AddWithValue("@status", purchase.Status);
                            cmd.Parameters.AddWithValue("@notes", (object)purchase.Notes ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@userId", (object)userId ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@createdAt", purchase.CreatedAt);
                            cmd.Parameters.AddWithValue("@updatedAt", purchase.UpdatedAt);
                            cmd.ExecuteNonQuery();
                        }

                        // 4. Process Each Item (Insert item, update stock, cost, price history, stock movement)
                        for (int i = 0; i < purchase.Items.Count; i++)
                        {
                            var item = purchase.Items[i];
                            item.Id = string.IsNullOrWhiteSpace(item.Id) ? "pi_" + Guid.NewGuid().ToString("N") : item.Id;
                            item.PurchaseId = purchase.Id;
                            item.CreatedAt = now;

                            // Fetch current product state
                            long currentStock = 0;
                            long currentCost = 0;
                            long currentPrice = 0;
                            string productName = item.ProductName;
                            string barcode = item.Barcode;

                            string selectProdSql = "SELECT name, barcode, stock_quantity_milli, cost_piasters, price_piasters FROM products WHERE id = @pid LIMIT 1;";
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
                                    QuantityMilli = item.QuantityMilli,
                                    CostPricePiasters = item.UnitCostPiasters,
                                    SupplierId = purchase.SupplierId,
                                    PurchaseId = purchase.Id,
                                    Notes = "فاتورة شراء #" + purchase.InvoiceNumber
                                };
                                batchRecord = _batchRepo.CreateOrUpdateBatch(batchRecord, conn, trans);
                                batchId = batchRecord.Id;
                                item.BatchNumber = batchRecord.BatchNumber;
                            }

                            // Insert into purchase_items
                            string insertItemSql = @"
                                INSERT INTO purchase_items (
                                    id, purchase_id, product_id, product_name, barcode,
                                    quantity_milli, unit_cost_piasters, total_cost_piasters,
                                    previous_cost_piasters, new_selling_price_piasters,
                                    batch_number, expiry_date, production_date, created_at
                                ) VALUES (
                                    @id, @purId, @prodId, @prodName, @barcode,
                                    @qty, @unitCost, @totalCost,
                                    @prevCost, @newPrice,
                                    @bnum, @exp, @prodDate, @createdAt
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
                                cmd.Parameters.AddWithValue("@unitCost", item.UnitCostPiasters);
                                cmd.Parameters.AddWithValue("@totalCost", item.TotalCostPiasters);
                                cmd.Parameters.AddWithValue("@prevCost", item.PreviousCostPiasters);
                                cmd.Parameters.AddWithValue("@newPrice", (object)item.NewSellingPricePiasters ?? DBNull.Value);
                                cmd.Parameters.AddWithValue("@bnum", (object)item.BatchNumber ?? DBNull.Value);
                                cmd.Parameters.AddWithValue("@exp", (object)item.ExpiryDate ?? DBNull.Value);
                                cmd.Parameters.AddWithValue("@prodDate", (object)item.ProductionDate ?? DBNull.Value);
                                cmd.Parameters.AddWithValue("@createdAt", item.CreatedAt);
                                cmd.ExecuteNonQuery();
                            }

                            // Calculate new cost
                            long newCost = item.UnitCostPiasters;
                            if (string.Equals(costingMethod, "WEIGHTED_AVERAGE", StringComparison.OrdinalIgnoreCase))
                            {
                                long validCurrentStock = Math.Max(0, currentStock);
                                long totalQty = validCurrentStock + item.QuantityMilli;
                                if (totalQty > 0)
                                {
                                    // Weighted average cost: (stock * old_cost + incoming * new_cost) / totalQty
                                    newCost = ((validCurrentStock * currentCost) + (item.QuantityMilli * item.UnitCostPiasters)) / totalQty;
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
                                cmd.Parameters.AddWithValue("@qtyDelta", item.QuantityMilli);
                                cmd.Parameters.AddWithValue("@newCost", newCost);
                                cmd.Parameters.AddWithValue("@newPrice", newPriceToSet);
                                cmd.Parameters.AddWithValue("@now", now);
                                cmd.Parameters.AddWithValue("@pid", item.ProductId);
                                cmd.ExecuteNonQuery();
                            }

                            // If this product is a variant, also sync the parent product's total stock
                            string syncParentSql = @"
                                UPDATE products
                                SET stock_quantity_milli = stock_quantity_milli + @qtyDelta,
                                    updated_at = @now
                                WHERE id = (SELECT parent_id FROM products WHERE id = @pid AND parent_id IS NOT NULL);
                            ";
                            using (var cmdSync = new SQLiteCommand(syncParentSql, conn, trans))
                            {
                                cmdSync.Parameters.AddWithValue("@qtyDelta", item.QuantityMilli);
                                cmdSync.Parameters.AddWithValue("@now", now);
                                cmdSync.Parameters.AddWithValue("@pid", item.ProductId);
                                cmdSync.ExecuteNonQuery();
                            }

                            // Record Stock Movement (Purchase increases stock)
                            string insertSmSql = @"
                                INSERT INTO stock_movements (
                                    id, product_id, movement_type, quantity_milli, reference_id, reference_type,
                                    unit_cost_piasters, note, batch_number, batch_id, created_at
                                ) VALUES (
                                    @id, @prodId, 'PURCHASE', @qty, @refId, 'PURCHASE_INVOICE',
                                    @unitCost, @note, @bnum, @bid, @createdAt
                                );
                            ";
                            using (var cmd = new SQLiteCommand(insertSmSql, conn, trans))
                            {
                                cmd.Parameters.AddWithValue("@id", Guid.NewGuid().ToString());
                                cmd.Parameters.AddWithValue("@prodId", item.ProductId);
                                cmd.Parameters.AddWithValue("@qty", item.QuantityMilli);
                                cmd.Parameters.AddWithValue("@refId", purchase.Id);
                                cmd.Parameters.AddWithValue("@unitCost", item.UnitCostPiasters);
                                cmd.Parameters.AddWithValue("@note", "فاتورة شراء رقم #" + purchase.InvoiceNumber);
                                cmd.Parameters.AddWithValue("@bnum", (object)item.BatchNumber ?? DBNull.Value);
                                cmd.Parameters.AddWithValue("@bid", (object)batchId ?? DBNull.Value);
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
                Status = reader["status"].ToString(),
                Notes = reader["notes"] != DBNull.Value ? reader["notes"].ToString() : null,
                CreatedByUserId = reader["created_by_user_id"] != DBNull.Value ? reader["created_by_user_id"].ToString() : null,
                CreatedAt = reader["created_at"].ToString(),
                UpdatedAt = reader["updated_at"].ToString()
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

            return new PurchaseItem
            {
                Id = reader["id"].ToString(),
                PurchaseId = reader["purchase_id"].ToString(),
                ProductId = reader["product_id"].ToString(),
                ProductName = reader["product_name"].ToString(),
                Barcode = reader["barcode"] != DBNull.Value ? reader["barcode"].ToString() : null,
                QuantityMilli = Convert.ToInt64(reader["quantity_milli"]),
                UnitCostPiasters = Convert.ToInt64(reader["unit_cost_piasters"]),
                TotalCostPiasters = Convert.ToInt64(reader["total_cost_piasters"]),
                PreviousCostPiasters = Convert.ToInt64(reader["previous_cost_piasters"]),
                NewSellingPricePiasters = newPrice,
                BatchNumber = bNum,
                ExpiryDate = exp,
                ProductionDate = prodDate,
                CreatedAt = reader["created_at"].ToString()
            };
        }
    }
}
