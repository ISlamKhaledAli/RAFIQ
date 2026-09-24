using System;
using System.Collections.Generic;
using System.Data.SQLite;
using RafiqPOS.Models;

namespace RafiqPOS.Repositories
{
    public class SaleRepository
    {
        private readonly string _connectionString;

        public SaleRepository(string connectionString)
        {
            _connectionString = connectionString;
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
                        // 1. Calculate next sequential daily invoice number
                        int nextInvoiceNumber = 1;
                        using (var cmd = new SQLiteCommand("SELECT COALESCE(MAX(invoice_number), 0) + 1 FROM sales;", conn, trans))
                        {
                            object val = cmd.ExecuteScalar();
                            if (val != null && val != DBNull.Value)
                            {
                                nextInvoiceNumber = Convert.ToInt32(val);
                            }
                        }
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
                                    discount_piasters, total_piasters, tax_piasters
                                ) VALUES (
                                    @id, @saleId, @productId, @productName, @barcode,
                                    @quantityMilli, @unitPrice, @unitCost,
                                    @discount, @total, @tax
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
                        }

                        // 4. Record Payment record
                        string insertPaymentSql = @"
                            INSERT INTO payments (id, sale_id, amount_piasters, method, created_at)
                            VALUES (@id, @saleId, @amount, @method, @createdAt);
                        ";
                        using (var cmd = new SQLiteCommand(insertPaymentSql, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@id", Guid.NewGuid().ToString());
                            cmd.Parameters.AddWithValue("@saleId", sale.Id);
                            cmd.Parameters.AddWithValue("@amount", sale.PaidPiasters);
                            cmd.Parameters.AddWithValue("@method", sale.PaymentMethod ?? "cash");
                            cmd.Parameters.AddWithValue("@createdAt", sale.CreatedAt ?? DateTime.UtcNow.ToString("o"));
                            cmd.ExecuteNonQuery();
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

        public List<Sale> GetRecentSales(int limit = 20)
        {
            var sales = new List<Sale>();
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = "SELECT * FROM sales ORDER BY created_at DESC LIMIT @limit;";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@limit", limit);
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            sales.Add(new Sale
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
                            });
                        }
                    }
                }
            }
            return sales;
        }
    }
}
