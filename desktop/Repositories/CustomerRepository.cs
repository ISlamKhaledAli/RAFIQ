using System;
using System.Collections.Generic;
using System.Data.SQLite;
using RafiqPOS.Models;

namespace RafiqPOS.Repositories
{
    public class CustomerRepository
    {
        private readonly string _connectionString;

        public CustomerRepository(string connectionString)
        {
            _connectionString = connectionString;
        }

        public List<Customer> GetAll(int limit)
        {
            var list = new List<Customer>();
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = "SELECT * FROM customers ORDER BY balance_piasters DESC, name ASC LIMIT @limit;";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@limit", limit > 0 ? limit : 100);
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            list.Add(MapReaderToCustomer(reader));
                        }
                    }
                }
            }
            return list;
        }

        public List<Customer> Search(string query)
        {
            var list = new List<Customer>();
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    SELECT * FROM customers 
                    WHERE name LIKE @q OR phone LIKE @q 
                    ORDER BY balance_piasters DESC, name ASC 
                    LIMIT 50;
                ";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@q", "%" + (query ?? "").Trim() + "%");
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            list.Add(MapReaderToCustomer(reader));
                        }
                    }
                }
            }
            return list;
        }

        public Customer GetById(string id)
        {
            if (string.IsNullOrWhiteSpace(id)) return null;

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = "SELECT * FROM customers WHERE id = @id LIMIT 1;";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@id", id);
                    using (var reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            return MapReaderToCustomer(reader);
                        }
                    }
                }
            }
            return null;
        }

        public Customer SaveCustomer(Customer customer)
        {
            if (customer == null) throw new ArgumentNullException("customer");
            if (string.IsNullOrWhiteSpace(customer.Name)) throw new ArgumentException("اسم العميل مطلوب");

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        string now = DateTime.UtcNow.ToString("o");
                        if (string.IsNullOrWhiteSpace(customer.Id))
                        {
                            customer.Id = "cust_" + Guid.NewGuid().ToString("N").Substring(0, 12);
                            customer.CreatedAt = now;

                            string sqlInsert = @"
                                INSERT INTO customers (id, name, phone, balance_piasters, credit_limit_piasters, created_at)
                                VALUES (@id, @name, @phone, @balance, @limit, @created_at);
                            ";
                            using (var cmd = new SQLiteCommand(sqlInsert, conn, trans))
                            {
                                cmd.Parameters.AddWithValue("@id", customer.Id);
                                cmd.Parameters.AddWithValue("@name", customer.Name.Trim());
                                cmd.Parameters.AddWithValue("@phone", (customer.Phone ?? "").Trim());
                                cmd.Parameters.AddWithValue("@balance", customer.BalancePiasters);
                                cmd.Parameters.AddWithValue("@limit", customer.CreditLimitPiasters);
                                cmd.Parameters.AddWithValue("@created_at", customer.CreatedAt);
                                cmd.ExecuteNonQuery();
                            }

                            if (customer.BalancePiasters > 0)
                            {
                                string ledgerSql = @"
                                    INSERT INTO customer_ledger (id, customer_id, type, sale_id, amount_piasters, balance_after_piasters, notes, created_at)
                                    VALUES (@lid, @cid, 'opening_balance', NULL, @amt, @after, 'رصيد افتتاحي', @cat);
                                ";
                                using (var lCmd = new SQLiteCommand(ledgerSql, conn, trans))
                                {
                                    lCmd.Parameters.AddWithValue("@lid", "led_" + Guid.NewGuid().ToString("N").Substring(0, 12));
                                    lCmd.Parameters.AddWithValue("@cid", customer.Id);
                                    lCmd.Parameters.AddWithValue("@amt", customer.BalancePiasters);
                                    lCmd.Parameters.AddWithValue("@after", customer.BalancePiasters);
                                    lCmd.Parameters.AddWithValue("@cat", now);
                                    lCmd.ExecuteNonQuery();
                                }
                            }
                        }
                        else
                        {
                            string sqlUpdate = @"
                                UPDATE customers 
                                SET name = @name, phone = @phone, credit_limit_piasters = @limit
                                WHERE id = @id;
                            ";
                            using (var cmd = new SQLiteCommand(sqlUpdate, conn, trans))
                            {
                                cmd.Parameters.AddWithValue("@id", customer.Id);
                                cmd.Parameters.AddWithValue("@name", customer.Name.Trim());
                                cmd.Parameters.AddWithValue("@phone", (customer.Phone ?? "").Trim());
                                cmd.Parameters.AddWithValue("@limit", customer.CreditLimitPiasters);
                                cmd.ExecuteNonQuery();
                            }
                        }

                        trans.Commit();
                        return GetById(customer.Id);
                    }
                    catch
                    {
                        trans.Rollback();
                        throw;
                    }
                }
            }
        }

        public Customer RecordPayment(string customerId, long amountPiasters, string notes)
        {
            if (string.IsNullOrWhiteSpace(customerId)) throw new ArgumentException("معرف العميل مطلوب");
            if (amountPiasters <= 0) throw new ArgumentException("مبلغ السداد يجب أن يكون أكبر من الصفر");

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        long currentBalance = 0;
                        string getBalSql = "SELECT balance_piasters FROM customers WHERE id = @id LIMIT 1;";
                        using (var cmd = new SQLiteCommand(getBalSql, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@id", customerId);
                            object res = cmd.ExecuteScalar();
                            if (res == null || res == DBNull.Value)
                            {
                                throw new InvalidOperationException("العميل غير موجود في النظام");
                            }
                            currentBalance = Convert.ToInt64(res);
                        }

                        long newBalance = currentBalance - amountPiasters;
                        string now = DateTime.UtcNow.ToString("o");

                        // Update customer balance
                        string updateBalSql = "UPDATE customers SET balance_piasters = @newBal WHERE id = @id;";
                        using (var cmd = new SQLiteCommand(updateBalSql, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@newBal", newBalance);
                            cmd.Parameters.AddWithValue("@id", customerId);
                            cmd.ExecuteNonQuery();
                        }

                        // Insert ledger entry
                        string ledgerSql = @"
                            INSERT INTO customer_ledger (id, customer_id, type, sale_id, amount_piasters, balance_after_piasters, notes, created_at)
                            VALUES (@lid, @cid, 'payment', NULL, @amt, @after, @notes, @cat);
                        ";
                        using (var cmd = new SQLiteCommand(ledgerSql, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@lid", "led_" + Guid.NewGuid().ToString("N").Substring(0, 12));
                            cmd.Parameters.AddWithValue("@cid", customerId);
                            cmd.Parameters.AddWithValue("@amt", amountPiasters);
                            cmd.Parameters.AddWithValue("@after", newBalance);
                            cmd.Parameters.AddWithValue("@notes", string.IsNullOrWhiteSpace(notes) ? "سداد نقدي من العميل" : notes.Trim());
                            cmd.Parameters.AddWithValue("@cat", now);
                            cmd.ExecuteNonQuery();
                        }

                        // Insert audit log
                        string auditSql = @"
                            INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details_json, created_at)
                            VALUES (@aid, 'usr_admin_default', 'customer_payment', 'customer', @cid, @details, @cat);
                        ";
                        using (var cmd = new SQLiteCommand(auditSql, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@aid", "aud_" + Guid.NewGuid().ToString("N").Substring(0, 12));
                            cmd.Parameters.AddWithValue("@cid", customerId);
                            cmd.Parameters.AddWithValue("@details", string.Format("{{\"paidPiasters\":{0},\"balanceAfter\":{1}}}", amountPiasters, newBalance));
                            cmd.Parameters.AddWithValue("@cat", now);
                            cmd.ExecuteNonQuery();
                        }

                        trans.Commit();
                        return GetById(customerId);
                    }
                    catch
                    {
                        trans.Rollback();
                        throw;
                    }
                }
            }
        }

        public List<CustomerLedgerEntry> GetStatement(string customerId, int limit)
        {
            var list = new List<CustomerLedgerEntry>();
            if (string.IsNullOrWhiteSpace(customerId)) return list;

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    SELECT * FROM customer_ledger 
                    WHERE customer_id = @cid 
                    ORDER BY created_at DESC 
                    LIMIT @limit;
                ";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@cid", customerId);
                    cmd.Parameters.AddWithValue("@limit", limit > 0 ? limit : 50);
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            list.Add(new CustomerLedgerEntry
                            {
                                Id = reader["id"].ToString(),
                                CustomerId = reader["customer_id"].ToString(),
                                Type = reader["type"].ToString(),
                                SaleId = reader["sale_id"] != DBNull.Value ? reader["sale_id"].ToString() : null,
                                AmountPiasters = Convert.ToInt64(reader["amount_piasters"]),
                                BalanceAfterPiasters = Convert.ToInt64(reader["balance_after_piasters"]),
                                Notes = reader["notes"] != DBNull.Value ? reader["notes"].ToString() : "",
                                CreatedAt = reader["created_at"].ToString()
                            });
                        }
                    }
                }
            }
            return list;
        }

        private static Customer MapReaderToCustomer(SQLiteDataReader reader)
        {
            return new Customer
            {
                Id = reader["id"].ToString(),
                Name = reader["name"].ToString(),
                Phone = reader["phone"] != DBNull.Value ? reader["phone"].ToString() : "",
                BalancePiasters = Convert.ToInt64(reader["balance_piasters"]),
                CreditLimitPiasters = Convert.ToInt64(reader["credit_limit_piasters"]),
                CreatedAt = reader["created_at"].ToString()
            };
        }
    }
}
