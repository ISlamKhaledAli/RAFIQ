using System;
using System.Collections.Generic;
using System.Data.SQLite;
using RafiqPOS.Models;

namespace RafiqPOS.Repositories
{
    public class SaleRepository
    {
        private readonly string _connectionString;
        private readonly CounterRepository _counters;

        public SaleRepository(string connectionString, CounterRepository counters = null)
        {
            _connectionString = connectionString;
            _counters = counters ?? new CounterRepository(connectionString);
        }

        public Sale CreateSaleAtomic(Sale sale)
        {
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        // 1. Calculate next sequential daily invoice number (Task 107-1 & 107-2: Atomic sequence counter)
                        int nextInvoiceNumber = (int)_counters.GetNextInvoiceNumber(conn, trans);
                        sale.InvoiceNumber = nextInvoiceNumber;

                        // 2. Insert Sale Master record
                        string insertSaleSql = @"
                            INSERT INTO sales (
                                id, invoice_number, cashier_id, customer_id, subtotal_piasters,
                                discount_piasters, tax_piasters, total_piasters, paid_piasters,
                                payment_method, status, notes, created_at
                            ) VALUES (
                                @id, @invoiceNumber, @cashierId, @customerId, @subtotal,
                                @discount, @tax, @total, @paid,
                                @paymentMethod, @status, @notes, @createdAt
                            );
                        ";
                        using (var cmd = new SQLiteCommand(insertSaleSql, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@id", sale.Id);
                            cmd.Parameters.AddWithValue("@invoiceNumber", sale.InvoiceNumber);
                            cmd.Parameters.AddWithValue("@cashierId", (object)sale.CashierId ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@customerId", (object)sale.CustomerId ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@subtotal", sale.SubtotalPiasters);
                            cmd.Parameters.AddWithValue("@discount", sale.DiscountPiasters);
                            cmd.Parameters.AddWithValue("@tax", sale.TaxPiasters);
                            cmd.Parameters.AddWithValue("@total", sale.TotalPiasters);
                            cmd.Parameters.AddWithValue("@paid", sale.PaidPiasters);
                            cmd.Parameters.AddWithValue("@paymentMethod", sale.PaymentMethod ?? "cash");
                            cmd.Parameters.AddWithValue("@status", sale.Status ?? "completed");
                            cmd.Parameters.AddWithValue("@notes", (object)sale.Notes ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@createdAt", sale.CreatedAt ?? DateTime.UtcNow.ToString("o"));
                            cmd.ExecuteNonQuery();
                        }

                        // 3. Insert each Sale Item and deduct inventory
                        foreach (var item in sale.Items)
                        {
                            string insertItemSql = @"
                                INSERT INTO sale_items (
                                    id, sale_id, product_id, product_name, barcode,
                                    quantity_milli, unit_price_piasters, unit_cost_piasters,
                                    discount_piasters, total_piasters, tax_piasters, tax_rate_percent, unit
                                ) VALUES (
                                    @id, @saleId, @productId, @productName, @barcode,
                                    @quantityMilli, @unitPrice, @unitCost,
                                    @discount, @total, @tax, @taxRate, @unit
                                );
                            ";
                            using (var cmd = new SQLiteCommand(insertItemSql, conn, trans))
                            {
                                cmd.Parameters.AddWithValue("@id", item.Id);
                                cmd.Parameters.AddWithValue("@saleId", sale.Id);
                                cmd.Parameters.AddWithValue("@productId", item.ProductId);
                                cmd.Parameters.AddWithValue("@productName", item.ProductName);
                                cmd.Parameters.AddWithValue("@barcode", (object)item.Barcode ?? DBNull.Value);
                                cmd.Parameters.AddWithValue("@quantityMilli", item.QuantityMilli);
                                cmd.Parameters.AddWithValue("@unitPrice", item.UnitPricePiasters);
                                cmd.Parameters.AddWithValue("@unitCost", item.UnitCostPiasters);
                                cmd.Parameters.AddWithValue("@discount", item.DiscountPiasters);
                                cmd.Parameters.AddWithValue("@total", item.TotalPiasters);
                                cmd.Parameters.AddWithValue("@tax", item.TaxPiasters);
                                cmd.Parameters.AddWithValue("@taxRate", item.TaxRatePercent);
                                cmd.Parameters.AddWithValue("@unit", item.Unit ?? "piece");
                                cmd.ExecuteNonQuery();
                            }

                            // Deduct Stock Quantity atomically
                            string updateStockSql = @"
                                UPDATE products 
                                SET stock_quantity_milli = stock_quantity_milli - @qty,
                                    updated_at = @now
                                WHERE id = @prodId;
                            ";
                            using (var cmd = new SQLiteCommand(updateStockSql, conn, trans))
                            {
                                cmd.Parameters.AddWithValue("@qty", item.QuantityMilli);
                                cmd.Parameters.AddWithValue("@now", DateTime.UtcNow.ToString("o"));
                                cmd.Parameters.AddWithValue("@prodId", item.ProductId);
                                cmd.ExecuteNonQuery();
                            }

                            // Record stock movement in ledger (Feature #35 / Tasks 35-1 & 35-2)
                            string insertMovementSql = @"
                                INSERT INTO stock_movements (
                                    id, product_id, movement_type, quantity_milli, reference_id, reference_type,
                                    unit_cost_piasters, note, batch_number, created_at
                                ) VALUES (
                                    @mId, @mProdId, 'SALE', @mQty, @mRefId, 'SALE',
                                    @mUnitCost, @mNote, NULL, @mNow
                                );
                            ";
                            using (var cmd = new SQLiteCommand(insertMovementSql, conn, trans))
                            {
                                cmd.Parameters.AddWithValue("@mId", Guid.NewGuid().ToString());
                                cmd.Parameters.AddWithValue("@mProdId", item.ProductId);
                                cmd.Parameters.AddWithValue("@mQty", -item.QuantityMilli);
                                cmd.Parameters.AddWithValue("@mRefId", sale.Id);
                                cmd.Parameters.AddWithValue("@mUnitCost", item.UnitCostPiasters);
                                cmd.Parameters.AddWithValue("@mNote", "مبيعات كاشير - فاتورة #" + (sale.InvoiceNumber > 0 ? sale.InvoiceNumber.ToString() : sale.Id));
                                cmd.Parameters.AddWithValue("@mNow", DateTime.UtcNow.ToString("o"));
                                cmd.ExecuteNonQuery();
                            }
                        }

                        // 4. Record Payment record(s) - Feature #27 / Task 27-1
                        string insertPaymentSql = @"
                            INSERT INTO payments (id, sale_id, amount_piasters, method, created_at)
                            VALUES (@id, @saleId, @amount, @method, @createdAt);
                        ";
                        if (sale.Payments != null && sale.Payments.Count > 0)
                        {
                            foreach (var p in sale.Payments)
                            {
                                using (var cmd = new SQLiteCommand(insertPaymentSql, conn, trans))
                                {
                                    cmd.Parameters.AddWithValue("@id", string.IsNullOrEmpty(p.Id) ? Guid.NewGuid().ToString() : p.Id);
                                    cmd.Parameters.AddWithValue("@saleId", sale.Id);
                                    cmd.Parameters.AddWithValue("@amount", p.AmountPiasters);
                                    cmd.Parameters.AddWithValue("@method", p.Method ?? "cash");
                                    cmd.Parameters.AddWithValue("@createdAt", p.CreatedAt ?? sale.CreatedAt ?? DateTime.UtcNow.ToString("o"));
                                    cmd.ExecuteNonQuery();
                                }
                            }
                        }
                        else
                        {
                            using (var cmd = new SQLiteCommand(insertPaymentSql, conn, trans))
                            {
                                cmd.Parameters.AddWithValue("@id", Guid.NewGuid().ToString());
                                cmd.Parameters.AddWithValue("@saleId", sale.Id);
                                cmd.Parameters.AddWithValue("@amount", sale.PaidPiasters);
                                cmd.Parameters.AddWithValue("@method", sale.PaymentMethod ?? "cash");
                                cmd.Parameters.AddWithValue("@createdAt", sale.CreatedAt ?? DateTime.UtcNow.ToString("o"));
                                cmd.ExecuteNonQuery();
                            }
                        }

                        // 5. If sale has a customer and unpaid debt, record in customer_ledger atomically
                        if (!string.IsNullOrWhiteSpace(sale.CustomerId))
                        {
                            long debtAmount = sale.TotalPiasters - sale.PaidPiasters;
                            if (debtAmount > 0)
                            {
                                long currentBal = 0;
                                long creditLimit = 0;
                                string getCustSql = "SELECT balance_piasters, credit_limit_piasters FROM customers WHERE id = @cid LIMIT 1;";
                                using (var cCmd = new SQLiteCommand(getCustSql, conn, trans))
                                {
                                    cCmd.Parameters.AddWithValue("@cid", sale.CustomerId);
                                    using (var cReader = cCmd.ExecuteReader())
                                    {
                                        if (cReader.Read())
                                        {
                                            currentBal = Convert.ToInt64(cReader["balance_piasters"]);
                                            creditLimit = Convert.ToInt64(cReader["credit_limit_piasters"]);
                                        }
                                    }
                                }
                                long newBal = currentBal + debtAmount;
                                if (creditLimit > 0 && newBal > creditLimit)
                                {
                                    sale.CreditLimitWarning = string.Format(
                                        "تنبيه: رصيد دين العميل ({0}) تجاوز الحد الائتماني المحدد ({1}) بمقدار {2}.",
                                        Common.Money.FormatPiasters(newBal),
                                        Common.Money.FormatPiasters(creditLimit),
                                        Common.Money.FormatPiasters(newBal - creditLimit)
                                    );
                                }
                                string upCustSql = "UPDATE customers SET balance_piasters = @newBal WHERE id = @cid;";
                                using (var uCmd = new SQLiteCommand(upCustSql, conn, trans))
                                {
                                    uCmd.Parameters.AddWithValue("@newBal", newBal);
                                    uCmd.Parameters.AddWithValue("@cid", sale.CustomerId);
                                    uCmd.ExecuteNonQuery();
                                }

                                string insLedgerSql = @"
                                    INSERT INTO customer_ledger (id, customer_id, type, sale_id, amount_piasters, balance_after_piasters, notes, created_at)
                                    VALUES (@lid, @cid, 'sale', @sid, @amt, @after, @notes, @cat);
                                ";
                                using (var lCmd = new SQLiteCommand(insLedgerSql, conn, trans))
                                {
                                    lCmd.Parameters.AddWithValue("@lid", "led_" + Guid.NewGuid().ToString("N").Substring(0, 12));
                                    lCmd.Parameters.AddWithValue("@cid", sale.CustomerId);
                                    lCmd.Parameters.AddWithValue("@sid", sale.Id);
                                    lCmd.Parameters.AddWithValue("@amt", debtAmount);
                                    lCmd.Parameters.AddWithValue("@after", newBal);
                                    lCmd.Parameters.AddWithValue("@notes", string.Format("فاتورة آجل رقم #{0}", sale.InvoiceNumber));
                                    lCmd.Parameters.AddWithValue("@cat", sale.CreatedAt ?? DateTime.UtcNow.ToString("o"));
                                    lCmd.ExecuteNonQuery();
                                }
                            }
                        }

                        // 6. Record sensitive sale operation in audit log inside the same atomic transaction (Feature #7)
                        string insertAuditSql = @"
                            INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details_json, created_at)
                            VALUES (@aid, @uid, 'sale_create', 'sale', @sid, @details, @now);
                        ";
                        using (var aCmd = new SQLiteCommand(insertAuditSql, conn, trans))
                        {
                            aCmd.Parameters.AddWithValue("@aid", "aud_" + Guid.NewGuid().ToString("N"));
                            aCmd.Parameters.AddWithValue("@uid", (object)sale.CashierId ?? "usr_admin_default");
                            aCmd.Parameters.AddWithValue("@sid", sale.Id);
                            string detailsJson = string.Format(
                                "{{\"invoiceNumber\":{0},\"totalPiasters\":{1},\"itemCount\":{2},\"paymentMethod\":\"{3}\"}}",
                                sale.InvoiceNumber, sale.TotalPiasters, sale.Items != null ? sale.Items.Count : 0, sale.PaymentMethod
                            );
                            aCmd.Parameters.AddWithValue("@details", detailsJson);
                            aCmd.Parameters.AddWithValue("@now", sale.CreatedAt ?? DateTime.UtcNow.ToString("o"));
                            aCmd.ExecuteNonQuery();
                        }

                        // Commit entire atomic transaction
                        trans.Commit();
                        return sale;
                    }
                    catch
                    {
                        trans.Rollback();
                        throw;
                    }
                }
            }
        }

        private Sale MapReaderToSale(SQLiteDataReader reader)
        {
            var sale = new Sale
            {
                Id = reader["id"].ToString(),
                InvoiceNumber = Convert.ToInt32(reader["invoice_number"]),
                CashierId = reader["cashier_id"] != DBNull.Value ? reader["cashier_id"].ToString() : null,
                CustomerId = reader["customer_id"] != DBNull.Value ? reader["customer_id"].ToString() : null,
                SubtotalPiasters = Convert.ToInt64(reader["subtotal_piasters"]),
                DiscountPiasters = Convert.ToInt64(reader["discount_piasters"]),
                TaxPiasters = Convert.ToInt64(reader["tax_piasters"]),
                TotalPiasters = Convert.ToInt64(reader["total_piasters"]),
                PaidPiasters = Convert.ToInt64(reader["paid_piasters"]),
                PaymentMethod = reader["payment_method"].ToString(),
                Status = reader["status"].ToString(),
                Notes = reader["notes"] != DBNull.Value ? reader["notes"].ToString() : null,
                CreatedAt = reader["created_at"].ToString()
            };

            for (int i = 0; i < reader.FieldCount; i++)
            {
                string col = reader.GetName(i);
                if (string.Equals(col, "customer_name", StringComparison.OrdinalIgnoreCase))
                {
                    sale.CustomerName = reader[i] != DBNull.Value ? reader[i].ToString() : null;
                }
                else if (string.Equals(col, "customer_phone", StringComparison.OrdinalIgnoreCase))
                {
                    sale.CustomerPhone = reader[i] != DBNull.Value ? reader[i].ToString() : null;
                }
            }

            return sale;
        }

        public List<Sale> GetRecentSales(int limit = 20)
        {
            var sales = new List<Sale>();
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    SELECT s.*, c.name AS customer_name, c.phone AS customer_phone
                    FROM sales s
                    LEFT JOIN customers c ON s.customer_id = c.id
                    ORDER BY s.created_at DESC LIMIT @limit;
                ";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@limit", limit);
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            sales.Add(MapReaderToSale(reader));
                        }
                    }
                }
            }
            return sales;
        }

        /// <summary>
        /// Task 133-1 & 133-4: البحث الشامل في الفواتير برقم الفاتورة أو التاريخ أو العميل أو المبلغ أو الحالة
        /// </summary>
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
            var sales = new List<Sale>();
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                var whereClauses = new List<string>();
                var parameters = new List<SQLiteParameter>();

                if (!string.IsNullOrWhiteSpace(query))
                {
                    string cleanQuery = query.Trim();
                    int invNum;
                    if (int.TryParse(cleanQuery.TrimStart('#'), out invNum) && invNum > 0)
                    {
                        whereClauses.Add("(s.invoice_number = @invNum OR s.notes LIKE @qWild OR c.name LIKE @qWild OR c.phone LIKE @qWild)");
                        parameters.Add(new SQLiteParameter("@invNum", invNum));
                        parameters.Add(new SQLiteParameter("@qWild", "%" + cleanQuery + "%"));
                    }
                    else
                    {
                        whereClauses.Add("(s.notes LIKE @qWild OR s.payment_method LIKE @qWild OR c.name LIKE @qWild OR c.phone LIKE @qWild)");
                        parameters.Add(new SQLiteParameter("@qWild", "%" + cleanQuery + "%"));
                    }
                }

                if (!string.IsNullOrWhiteSpace(dateFrom))
                {
                    whereClauses.Add("date(s.created_at) >= date(@dateFrom)");
                    parameters.Add(new SQLiteParameter("@dateFrom", dateFrom.Trim()));
                }

                if (!string.IsNullOrWhiteSpace(dateTo))
                {
                    whereClauses.Add("date(s.created_at) <= date(@dateTo)");
                    parameters.Add(new SQLiteParameter("@dateTo", dateTo.Trim()));
                }

                if (!string.IsNullOrWhiteSpace(customerId))
                {
                    whereClauses.Add("s.customer_id = @customerId");
                    parameters.Add(new SQLiteParameter("@customerId", customerId.Trim()));
                }

                if (!string.IsNullOrWhiteSpace(status) && !string.Equals(status, "all", StringComparison.OrdinalIgnoreCase))
                {
                    whereClauses.Add("s.status = @status");
                    parameters.Add(new SQLiteParameter("@status", status.Trim()));
                }

                if (minTotal.HasValue && minTotal.Value > 0)
                {
                    whereClauses.Add("s.total_piasters >= @minTotal");
                    parameters.Add(new SQLiteParameter("@minTotal", minTotal.Value));
                }

                if (maxTotal.HasValue && maxTotal.Value > 0)
                {
                    whereClauses.Add("s.total_piasters <= @maxTotal");
                    parameters.Add(new SQLiteParameter("@maxTotal", maxTotal.Value));
                }

                string whereSql = whereClauses.Count > 0 ? "WHERE " + string.Join(" AND ", whereClauses) : "";
                string sql = string.Format(@"
                    SELECT s.*, c.name AS customer_name, c.phone AS customer_phone
                    FROM sales s
                    LEFT JOIN customers c ON s.customer_id = c.id
                    {0}
                    ORDER BY s.created_at DESC
                    LIMIT @limit;
                ", whereSql);

                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    foreach (var p in parameters)
                    {
                        cmd.Parameters.Add(p);
                    }
                    cmd.Parameters.AddWithValue("@limit", limit > 0 ? limit : 100);

                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            sales.Add(MapReaderToSale(reader));
                        }
                    }
                }
            }
            return sales;
        }

        public List<SaleItem> GetSaleItems(string saleId)
        {
            var items = new List<SaleItem>();
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    SELECT si.*, COALESCE(p.unit, 'piece') AS unit
                    FROM sale_items si
                    LEFT JOIN products p ON si.product_id = p.id
                    WHERE si.sale_id = @saleId;
                ";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@saleId", saleId);
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            items.Add(new SaleItem
                            {
                                Id = reader["id"].ToString(),
                                SaleId = reader["sale_id"].ToString(),
                                ProductId = reader["product_id"].ToString(),
                                ProductName = reader["product_name"].ToString(),
                                Barcode = reader["barcode"] != DBNull.Value ? reader["barcode"].ToString() : null,
                                QuantityMilli = Convert.ToInt64(reader["quantity_milli"]),
                                UnitPricePiasters = Convert.ToInt64(reader["unit_price_piasters"]),
                                UnitCostPiasters = Convert.ToInt64(reader["unit_cost_piasters"]),
                                DiscountPiasters = Convert.ToInt64(reader["discount_piasters"]),
                                TotalPiasters = Convert.ToInt64(reader["total_piasters"]),
                                TaxPiasters = Convert.ToInt64(reader["tax_piasters"]),
                                TaxRatePercent = reader["tax_rate_percent"] != DBNull.Value ? Convert.ToInt32(reader["tax_rate_percent"]) : 0,
                                Unit = reader["unit"] != DBNull.Value ? reader["unit"].ToString() : "piece"
                            });
                        }
                    }
                }
            }
            return items;
        }

        public Sale GetSaleById(string id)
        {
            Sale sale = null;
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    SELECT s.*, c.name AS customer_name, c.phone AS customer_phone
                    FROM sales s
                    LEFT JOIN customers c ON s.customer_id = c.id
                    WHERE s.id = @id LIMIT 1;
                ";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@id", id);
                    using (var reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            sale = MapReaderToSale(reader);
                        }
                    }
                }
            }

            if (sale != null)
            {
                sale.Items = GetSaleItems(sale.Id);
                sale.Payments = GetSalePayments(sale.Id);
            }
            return sale;
        }

        /// <summary>
        /// Task 107-3: البحث عن فاتورة بالرقم المتسلسل المقروء
        /// </summary>
        public Sale GetSaleByInvoiceNumber(int invoiceNumber)
        {
            Sale sale = null;
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    SELECT s.*, c.name AS customer_name, c.phone AS customer_phone
                    FROM sales s
                    LEFT JOIN customers c ON s.customer_id = c.id
                    WHERE s.invoice_number = @inv LIMIT 1;
                ";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@inv", invoiceNumber);
                    using (var reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            sale = MapReaderToSale(reader);
                        }
                    }
                }
            }

            if (sale != null)
            {
                sale.Items = GetSaleItems(sale.Id);
                sale.Payments = GetSalePayments(sale.Id);
            }
            return sale;
        }

        public List<SalePayment> GetSalePayments(string saleId)
        {
            var payments = new List<SalePayment>();
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = "SELECT * FROM payments WHERE sale_id = @saleId ORDER BY created_at ASC;";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@saleId", saleId);
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            payments.Add(new SalePayment
                            {
                                Id = reader["id"].ToString(),
                                SaleId = reader["sale_id"].ToString(),
                                AmountPiasters = Convert.ToInt64(reader["amount_piasters"]),
                                Method = reader["method"].ToString(),
                                CreatedAt = reader["created_at"].ToString()
                            });
                        }
                    }
                }
            }
            return payments;
        }

        public Sale CancelSaleAtomic(string saleId, string reason, string userId)
        {
            if (string.IsNullOrWhiteSpace(saleId)) throw new ArgumentNullException("saleId");
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        Sale sale = null;
                        using (var cmd = new SQLiteCommand("SELECT * FROM sales WHERE id = @id LIMIT 1;", conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@id", saleId);
                            using (var reader = cmd.ExecuteReader())
                            {
                                if (reader.Read())
                                {
                                    sale = new Sale
                                    {
                                        Id = reader["id"].ToString(),
                                        InvoiceNumber = Convert.ToInt32(reader["invoice_number"]),
                                        CashierId = reader["cashier_id"] != DBNull.Value ? reader["cashier_id"].ToString() : null,
                                        CustomerId = reader["customer_id"] != DBNull.Value ? reader["customer_id"].ToString() : null,
                                        SubtotalPiasters = Convert.ToInt64(reader["subtotal_piasters"]),
                                        DiscountPiasters = Convert.ToInt64(reader["discount_piasters"]),
                                        TaxPiasters = Convert.ToInt64(reader["tax_piasters"]),
                                        TotalPiasters = Convert.ToInt64(reader["total_piasters"]),
                                        PaidPiasters = Convert.ToInt64(reader["paid_piasters"]),
                                        PaymentMethod = reader["payment_method"].ToString(),
                                        Status = reader["status"].ToString(),
                                        Notes = reader["notes"] != DBNull.Value ? reader["notes"].ToString() : null,
                                        CreatedAt = reader["created_at"].ToString()
                                    };
                                }
                            }
                        }

                        if (sale == null)
                        {
                            throw new InvalidOperationException("لم يتم العثور على الفاتورة المراد إلغاؤها");
                        }

                        if (string.Equals(sale.Status, "cancelled", StringComparison.OrdinalIgnoreCase))
                        {
                            throw new InvalidOperationException("هذه الفاتورة تم إلغاؤها مسبقاً");
                        }

                        var items = new List<SaleItem>();
                        using (var cmd = new SQLiteCommand("SELECT * FROM sale_items WHERE sale_id = @saleId;", conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@saleId", saleId);
                            using (var reader = cmd.ExecuteReader())
                            {
                                while (reader.Read())
                                {
                                    items.Add(new SaleItem
                                    {
                                        Id = reader["id"].ToString(),
                                        SaleId = reader["sale_id"].ToString(),
                                        ProductId = reader["product_id"].ToString(),
                                        ProductName = reader["product_name"].ToString(),
                                        Barcode = reader["barcode"] != DBNull.Value ? reader["barcode"].ToString() : null,
                                        QuantityMilli = Convert.ToInt64(reader["quantity_milli"]),
                                        UnitPricePiasters = Convert.ToInt64(reader["unit_price_piasters"]),
                                        UnitCostPiasters = Convert.ToInt64(reader["unit_cost_piasters"]),
                                        DiscountPiasters = Convert.ToInt64(reader["discount_piasters"]),
                                        TotalPiasters = Convert.ToInt64(reader["total_piasters"]),
                                        TaxPiasters = Convert.ToInt64(reader["tax_piasters"]),
                                        TaxRatePercent = reader["tax_rate_percent"] != DBNull.Value ? Convert.ToInt32(reader["tax_rate_percent"]) : 0,
                                        Unit = reader["unit"] != DBNull.Value ? reader["unit"].ToString() : "piece"
                                    });
                                }
                            }
                        }
                        sale.Items = items;

                        string cancelNote = string.Format(" [ملغاة: {0}]", string.IsNullOrEmpty(reason) ? "طلب الكاشير" : reason);
                        using (var cmd = new SQLiteCommand("UPDATE sales SET status = 'cancelled', notes = COALESCE(notes, '') || @note WHERE id = @id;", conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@note", cancelNote);
                            cmd.Parameters.AddWithValue("@id", saleId);
                            cmd.ExecuteNonQuery();
                        }
                        sale.Status = "cancelled";
                        sale.Notes = (sale.Notes ?? "") + cancelNote;

                        string nowIso = DateTime.UtcNow.ToString("o");
                        foreach (var item in items)
                        {
                            using (var cmd = new SQLiteCommand("UPDATE products SET stock_quantity_milli = stock_quantity_milli + @qty, updated_at = @now WHERE id = @prodId;", conn, trans))
                            {
                                cmd.Parameters.AddWithValue("@qty", item.QuantityMilli);
                                cmd.Parameters.AddWithValue("@now", nowIso);
                                cmd.Parameters.AddWithValue("@prodId", item.ProductId);
                                cmd.ExecuteNonQuery();
                            }

                            string insertMovementSql = @"
                                INSERT INTO stock_movements (
                                    id, product_id, movement_type, quantity_milli, reference_id, reference_type,
                                    unit_cost_piasters, note, batch_number, created_at
                                ) VALUES (
                                    @mId, @mProdId, 'SALE_CANCEL', @mQty, @mRefId, 'SALE_CANCEL',
                                    @mUnitCost, @mNote, NULL, @mNow
                                );
                            ";
                            using (var cmd = new SQLiteCommand(insertMovementSql, conn, trans))
                            {
                                cmd.Parameters.AddWithValue("@mId", Guid.NewGuid().ToString());
                                cmd.Parameters.AddWithValue("@mProdId", item.ProductId);
                                cmd.Parameters.AddWithValue("@mQty", item.QuantityMilli);
                                cmd.Parameters.AddWithValue("@mRefId", sale.Id);
                                cmd.Parameters.AddWithValue("@mUnitCost", item.UnitCostPiasters);
                                cmd.Parameters.AddWithValue("@mNote", "إلغاء فاتورة مبيعات #" + sale.InvoiceNumber);
                                cmd.Parameters.AddWithValue("@mNow", nowIso);
                                cmd.ExecuteNonQuery();
                            }
                        }

                        if (!string.IsNullOrWhiteSpace(sale.CustomerId))
                        {
                            long debtAmount = sale.TotalPiasters - sale.PaidPiasters;
                            if (debtAmount > 0)
                            {
                                long currentBal = 0;
                                using (var cCmd = new SQLiteCommand("SELECT balance_piasters FROM customers WHERE id = @cid LIMIT 1;", conn, trans))
                                {
                                    cCmd.Parameters.AddWithValue("@cid", sale.CustomerId);
                                    object cRes = cCmd.ExecuteScalar();
                                    if (cRes != null && cRes != DBNull.Value)
                                    {
                                        currentBal = Convert.ToInt64(cRes);
                                    }
                                }
                                long newBal = currentBal - debtAmount;
                                using (var uCmd = new SQLiteCommand("UPDATE customers SET balance_piasters = @newBal WHERE id = @cid;", conn, trans))
                                {
                                    uCmd.Parameters.AddWithValue("@newBal", newBal);
                                    uCmd.Parameters.AddWithValue("@cid", sale.CustomerId);
                                    uCmd.ExecuteNonQuery();
                                }

                                string insLedgerSql = @"
                                    INSERT INTO customer_ledger (id, customer_id, type, sale_id, amount_piasters, balance_after_piasters, notes, created_at)
                                    VALUES (@lid, @cid, 'cancellation', @sid, @amt, @after, @notes, @cat);
                                ";
                                using (var lCmd = new SQLiteCommand(insLedgerSql, conn, trans))
                                {
                                    lCmd.Parameters.AddWithValue("@lid", "led_" + Guid.NewGuid().ToString("N").Substring(0, 12));
                                    lCmd.Parameters.AddWithValue("@cid", sale.CustomerId);
                                    lCmd.Parameters.AddWithValue("@sid", sale.Id);
                                    lCmd.Parameters.AddWithValue("@amt", -debtAmount);
                                    lCmd.Parameters.AddWithValue("@after", newBal);
                                    lCmd.Parameters.AddWithValue("@notes", string.Format("إلغاء فاتورة آجل رقم #{0} - {1}", sale.InvoiceNumber, reason));
                                    lCmd.Parameters.AddWithValue("@cat", nowIso);
                                    lCmd.ExecuteNonQuery();
                                }
                            }
                        }

                        string insertAuditSql = @"
                            INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details_json, created_at)
                            VALUES (@aid, @uid, 'sale_cancel', 'sale', @sid, @details, @now);
                        ";
                        using (var aCmd = new SQLiteCommand(insertAuditSql, conn, trans))
                        {
                            aCmd.Parameters.AddWithValue("@aid", "aud_" + Guid.NewGuid().ToString("N"));
                            aCmd.Parameters.AddWithValue("@uid", string.IsNullOrEmpty(userId) ? "usr_admin_default" : userId);
                            aCmd.Parameters.AddWithValue("@sid", sale.Id);
                            string detailsJson = string.Format(
                                "{{\"invoiceNumber\":{0},\"reason\":\"{1}\",\"totalPiasters\":{2}}}",
                                sale.InvoiceNumber, (reason ?? "").Replace("\"", "\\\""), sale.TotalPiasters
                            );
                            aCmd.Parameters.AddWithValue("@details", detailsJson);
                            aCmd.Parameters.AddWithValue("@now", nowIso);
                            aCmd.ExecuteNonQuery();
                        }

                        trans.Commit();
                        return sale;
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
}
