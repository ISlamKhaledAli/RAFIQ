using System;
using System.Collections.Generic;
using System.Data.SQLite;
using RafiqPOS.Models;
using RafiqPOS.Repositories;

namespace RafiqPOS.Services
{
    public class DemoStatusResult
    {
        public bool HasDemoData { get; set; }
        public int DemoProductsCount { get; set; }
        public int DemoSalesCount { get; set; }
        public int DemoCustomersCount { get; set; }
    }

    public class LoadDemoDataResult
    {
        public bool Success { get; set; }
        public string Message { get; set; }
        public int ProductsAdded { get; set; }
        public int CustomersAdded { get; set; }
        public int SalesAdded { get; set; }
    }

    public class ClearDemoDataResult
    {
        public bool Success { get; set; }
        public string Message { get; set; }
        public int DeletedProducts { get; set; }
        public int DeletedSales { get; set; }
        public int DeletedCustomers { get; set; }
    }

    public class DemoDataService
    {
        private const string DEMO_PREFIX = "demo_";
        private readonly string _connectionString;
        private readonly SettingsRepository _settingsRepo;
        private readonly AuditLogRepository _auditRepo;

        public DemoDataService(string connectionString, SettingsRepository settingsRepo, AuditLogRepository auditRepo)
        {
            this._connectionString = connectionString;
            this._settingsRepo = settingsRepo;
            this._auditRepo = auditRepo;
        }

        public DemoStatusResult GetStatus()
        {
            var status = new DemoStatusResult();

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();

                using (var cmd = new SQLiteCommand("SELECT COUNT(*) FROM products WHERE id LIKE 'demo_%';", conn))
                {
                    status.DemoProductsCount = Convert.ToInt32(cmd.ExecuteScalar());
                }

                using (var cmd = new SQLiteCommand("SELECT COUNT(*) FROM sales WHERE id LIKE 'demo_%';", conn))
                {
                    status.DemoSalesCount = Convert.ToInt32(cmd.ExecuteScalar());
                }

                using (var cmd = new SQLiteCommand("SELECT COUNT(*) FROM customers WHERE id LIKE 'demo_%';", conn))
                {
                    status.DemoCustomersCount = Convert.ToInt32(cmd.ExecuteScalar());
                }
            }

            status.HasDemoData = status.DemoProductsCount > 0 || status.DemoSalesCount > 0;
            return status;
        }

        public LoadDemoDataResult LoadDemoData(string storeType)
        {
            var result = new LoadDemoDataResult();
            string now = DateTime.UtcNow.ToString("o");

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        // Clean existing demo data first to prevent duplicate keys
                        ExecuteClearDemoDataInternal(conn, trans);

                        // 1. Seed Demo Products based on storeType
                        var demoProducts = GetDemoProductsForStoreType(storeType ?? "supermarket");
                        int prodsCount = 0;

                        for (int i = 0; i < demoProducts.Count; i++)
                        {
                            var dp = demoProducts[i];
                            using (var cmd = new SQLiteCommand(@"
                                INSERT INTO products (
                                    id, name, normalized_name, barcode, price_piasters, cost_piasters,
                                    stock_quantity_milli, min_stock_quantity_milli, unit, tax_rate_percent,
                                    is_active, created_at, updated_at
                                ) VALUES (
                                    @id, @name, @norm, @barcode, @price, @cost,
                                    @stock, @minStock, @unit, 0,
                                    1, @now, @now
                                );
                            ", conn, trans))
                            {
                                cmd.Parameters.AddWithValue("@id", dp.Id);
                                cmd.Parameters.AddWithValue("@name", dp.Name);
                                cmd.Parameters.AddWithValue("@norm", dp.Name.ToLowerInvariant());
                                cmd.Parameters.AddWithValue("@barcode", dp.Barcode);
                                cmd.Parameters.AddWithValue("@price", dp.PricePiasters);
                                cmd.Parameters.AddWithValue("@cost", dp.CostPiasters);
                                cmd.Parameters.AddWithValue("@stock", dp.StockQuantityMilli);
                                cmd.Parameters.AddWithValue("@minStock", dp.MinStockQuantityMilli);
                                cmd.Parameters.AddWithValue("@unit", dp.Unit);
                                cmd.Parameters.AddWithValue("@now", now);
                                cmd.ExecuteNonQuery();
                            }

                            // Secondary barcode
                            using (var bcmd = new SQLiteCommand(@"
                                INSERT OR IGNORE INTO product_barcodes (id, product_id, barcode, created_at)
                                VALUES (@bid, @pid, @barcode, @now);
                            ", conn, trans))
                            {
                                bcmd.Parameters.AddWithValue("@bid", "demo_bcode_" + i);
                                bcmd.Parameters.AddWithValue("@pid", dp.Id);
                                bcmd.Parameters.AddWithValue("@barcode", dp.Barcode);
                                bcmd.Parameters.AddWithValue("@now", now);
                                bcmd.ExecuteNonQuery();
                            }

                            // Initial Stock Movement
                            using (var smCmd = new SQLiteCommand(@"
                                INSERT INTO stock_movements (
                                    id, product_id, movement_type, quantity_milli,
                                    reference_type, reference_id, notes, created_by, created_at
                                ) VALUES (
                                    @smid, @pid, 'INITIAL_OPENING', @qty,
                                    'DEMO', 'DEMO_SEED', 'رصيد افتتاحي تجريبي للتدريب', 'system', @now
                                );
                            ", conn, trans))
                            {
                                smCmd.Parameters.AddWithValue("@smid", "demo_sm_" + i);
                                smCmd.Parameters.AddWithValue("@pid", dp.Id);
                                smCmd.Parameters.AddWithValue("@qty", dp.StockQuantityMilli);
                                smCmd.Parameters.AddWithValue("@now", now);
                                smCmd.ExecuteNonQuery();
                            }

                            prodsCount++;
                        }

                        // 2. Seed Demo Customers
                        using (var cCmd1 = new SQLiteCommand(@"
                            INSERT INTO customers (id, name, phone, address, notes, is_active, created_at, updated_at)
                            VALUES ('demo_cust_1', 'عميل تجريبي - أحمد محمود', '01099887766', 'شارع التجربة', 'حساب عميل تجريبي لتجربة البيع الآجل', 1, @now, @now);
                        ", conn, trans))
                        {
                            cCmd1.Parameters.AddWithValue("@now", now);
                            cCmd1.ExecuteNonQuery();
                        }

                        using (var cCmd2 = new SQLiteCommand(@"
                            INSERT INTO customers (id, name, phone, address, notes, is_active, created_at, updated_at)
                            VALUES ('demo_cust_2', 'عميلة تجريبية - أم كريم', '01122334455', 'بجوار المسجد', 'عميلة تجريبية منتظمة', 1, @now, @now);
                        ", conn, trans))
                        {
                            cCmd2.Parameters.AddWithValue("@now", now);
                            cCmd2.ExecuteNonQuery();
                        }

                        // 3. Seed Sample Demo Sale
                        using (var saleCmd = new SQLiteCommand(@"
                            INSERT INTO sales (
                                id, invoice_number, total_amount_piasters, discount_piasters,
                                final_amount_piasters, paid_amount_piasters, remaining_amount_piasters,
                                payment_method, customer_id, status, created_at
                            ) VALUES (
                                'demo_sale_1', 99901, 7700, 0,
                                7700, 7700, 0,
                                'CASH', NULL, 'COMPLETED', @now
                            );
                        ", conn, trans))
                        {
                            saleCmd.Parameters.AddWithValue("@now", now);
                            saleCmd.ExecuteNonQuery();
                        }

                        using (var itemCmd = new SQLiteCommand(@"
                            INSERT INTO sale_items (
                                id, sale_id, product_id, product_name, barcode, quantity_milli,
                                unit_price_piasters, unit_cost_piasters, total_piasters
                            ) VALUES (
                                'demo_item_1', 'demo_sale_1', 'demo_prod_1', 'لبن جهينة كامل الدسم 1 لتر (تجريبي)', '62211001',
                                1000, 4200, 3400, 4200
                            ), (
                                'demo_item_2', 'demo_sale_1', 'demo_prod_2', 'أرز مصري فاخر 1 كجم (تجريبي)', '62211002',
                                1000, 3500, 2800, 3500
                            );
                        ", conn, trans))
                        {
                            itemCmd.ExecuteNonQuery();
                        }

                        trans.Commit();

                        _settingsRepo.Set("has_demo_data", "1");
                        LogAudit("DEMO_DATA_LOADED", "DEMO", storeType ?? "supermarket", string.Format("تم تحميل {0} منتج تجريبي وعميلين وفاتورة تجريبية بنجاح", prodsCount));

                        result.Success = true;
                        result.Message = string.Format("تم تحميل {0} صنف تجريبي وعميلين للتدريب بنجاح.", prodsCount);
                        result.ProductsAdded = prodsCount;
                        result.CustomersAdded = 2;
                        result.SalesAdded = 1;
                        return result;
                    }
                    catch (Exception ex)
                    {
                        trans.Rollback();
                        result.Success = false;
                        result.Message = "فشل تحميل البيانات التجريبية: " + ex.Message;
                        return result;
                    }
                }
            }
        }

        public ClearDemoDataResult ClearDemoData()
        {
            var res = new ClearDemoDataResult();

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        var counts = ExecuteClearDemoDataInternal(conn, trans);
                        trans.Commit();

                        _settingsRepo.Set("has_demo_data", "0");
                        LogAudit("DEMO_DATA_CLEARED", "DEMO", "SYSTEM", string.Format("تم مسح كافة البيانات التجريبية بأمان ({0} منتج، {1} فاتورة)", counts.Products, counts.Sales));

                        res.Success = true;
                        res.Message = "تم مسح كافة البيانات التجريبية بأمان دون المساس ببيانات المحل الحقيقية.";
                        res.DeletedProducts = counts.Products;
                        res.DeletedSales = counts.Sales;
                        res.DeletedCustomers = counts.Customers;
                        return res;
                    }
                    catch (Exception ex)
                    {
                        trans.Rollback();
                        res.Success = false;
                        res.Message = "فشل مسح البيانات التجريبية: " + ex.Message;
                        return res;
                    }
                }
            }
        }

        private struct ClearCounts
        {
            public int Products;
            public int Sales;
            public int Customers;
        }

        private ClearCounts ExecuteClearDemoDataInternal(SQLiteConnection conn, SQLiteTransaction trans)
        {
            var counts = new ClearCounts();

            // Count items before deleting
            using (var pCmd = new SQLiteCommand("SELECT COUNT(*) FROM products WHERE id LIKE 'demo_%';", conn, trans))
            {
                counts.Products = Convert.ToInt32(pCmd.ExecuteScalar());
            }
            using (var sCmd = new SQLiteCommand("SELECT COUNT(*) FROM sales WHERE id LIKE 'demo_%';", conn, trans))
            {
                counts.Sales = Convert.ToInt32(sCmd.ExecuteScalar());
            }
            using (var cCmd = new SQLiteCommand("SELECT COUNT(*) FROM customers WHERE id LIKE 'demo_%';", conn, trans))
            {
                counts.Customers = Convert.ToInt32(cCmd.ExecuteScalar());
            }

            // Safe atomic cascaded delete strictly for demo prefixed entities (Task 113-2)
            string sqlDelete = @"
                DELETE FROM stock_movements WHERE id LIKE 'demo_%' OR product_id LIKE 'demo_%';
                DELETE FROM product_price_history WHERE product_id LIKE 'demo_%';
                DELETE FROM product_barcodes WHERE product_id LIKE 'demo_%';
                DELETE FROM sale_items WHERE sale_id LIKE 'demo_%' OR product_id LIKE 'demo_%';
                DELETE FROM sales WHERE id LIKE 'demo_%';
                DELETE FROM customer_transactions WHERE customer_id LIKE 'demo_%';
                DELETE FROM customers WHERE id LIKE 'demo_%';
                DELETE FROM quick_items WHERE id LIKE 'demo_%';
                DELETE FROM products WHERE id LIKE 'demo_%';
            ";

            using (var delCmd = new SQLiteCommand(sqlDelete, conn, trans))
            {
                delCmd.ExecuteNonQuery();
            }

            return counts;
        }

        private static List<Product> GetDemoProductsForStoreType(string storeType)
        {
            var list = new List<Product>();

            if (storeType == "phones_electronics" || storeType == "accessories_gifts")
            {
                list.Add(new Product { Id = "demo_prod_1", Name = "كابل شحن سريع Type-C (تجريبي)", Barcode = "62222001", PricePiasters = 4500, CostPiasters = 2500, StockQuantityMilli = 25000, MinStockQuantityMilli = 5000, Unit = "piece" });
                list.Add(new Product { Id = "demo_prod_2", Name = "شاحن حائط سريع 20W (تجريبي)", Barcode = "62222002", PricePiasters = 12000, CostPiasters = 8000, StockQuantityMilli = 15000, MinStockQuantityMilli = 3000, Unit = "piece" });
                list.Add(new Product { Id = "demo_prod_3", Name = "لاصقة حماية زجاج 9D (تجريبي)", Barcode = "62222003", PricePiasters = 3000, CostPiasters = 1200, StockQuantityMilli = 50000, MinStockQuantityMilli = 10000, Unit = "piece" });
                list.Add(new Product { Id = "demo_prod_4", Name = "جراب سيليكون شفاف حماية (تجريبي)", Barcode = "62222004", PricePiasters = 3500, CostPiasters = 1500, StockQuantityMilli = 40000, MinStockQuantityMilli = 8000, Unit = "piece" });
                list.Add(new Product { Id = "demo_prod_5", Name = "سماعة أذن سلكية AUX (تجريبي)", Barcode = "62222005", PricePiasters = 4000, CostPiasters = 2200, StockQuantityMilli = 30000, MinStockQuantityMilli = 5000, Unit = "piece" });
                list.Add(new Product { Id = "demo_prod_6", Name = "كارت ميموري 32 جيجا أصلي (تجريبي)", Barcode = "62222006", PricePiasters = 9500, CostPiasters = 7000, StockQuantityMilli = 20000, MinStockQuantityMilli = 4000, Unit = "piece" });
            }
            else if (storeType == "dairy_bakery")
            {
                list.Add(new Product { Id = "demo_prod_1", Name = "لبن جاموسي طازج كجم (تجريبي)", Barcode = "62211001", PricePiasters = 3000, CostPiasters = 2400, StockQuantityMilli = 50000, MinStockQuantityMilli = 10000, Unit = "kg" });
                list.Add(new Product { Id = "demo_prod_2", Name = "جبنة براميلي فلفل كجم (تجريبي)", Barcode = "62211002", PricePiasters = 14000, CostPiasters = 11500, StockQuantityMilli = 20000, MinStockQuantityMilli = 5000, Unit = "kg" });
                list.Add(new Product { Id = "demo_prod_3", Name = "جبنة قريش فلاحي كجم (تجريبي)", Barcode = "62211003", PricePiasters = 7000, CostPiasters = 5800, StockQuantityMilli = 15000, MinStockQuantityMilli = 5000, Unit = "kg" });
                list.Add(new Product { Id = "demo_prod_4", Name = "زبادي بلدي طازج (تجريبي)", Barcode = "62211004", PricePiasters = 800, CostPiasters = 600, StockQuantityMilli = 40000, MinStockQuantityMilli = 10000, Unit = "piece" });
                list.Add(new Product { Id = "demo_prod_5", Name = "عيش فينو كيس 10 أرغفة (تجريبي)", Barcode = "62211005", PricePiasters = 1500, CostPiasters = 1200, StockQuantityMilli = 30000, MinStockQuantityMilli = 10000, Unit = "piece" });
                list.Add(new Product { Id = "demo_prod_6", Name = "طبق بيض أحمر 30 بيضة (تجريبي)", Barcode = "62211006", PricePiasters = 16500, CostPiasters = 14500, StockQuantityMilli = 12000, MinStockQuantityMilli = 3000, Unit = "piece" });
            }
            else if (storeType == "produce_butchery")
            {
                list.Add(new Product { Id = "demo_prod_1", Name = "طماطم بلدي طازجة (تجريبي)", Barcode = "62270001", PricePiasters = 1500, CostPiasters = 1000, StockQuantityMilli = 80000, MinStockQuantityMilli = 15000, Unit = "kg" });
                list.Add(new Product { Id = "demo_prod_2", Name = "بطاطس تحمير كجم (تجريبي)", Barcode = "62270002", PricePiasters = 1800, CostPiasters = 1200, StockQuantityMilli = 90000, MinStockQuantityMilli = 20000, Unit = "kg" });
                list.Add(new Product { Id = "demo_prod_3", Name = "بصل أحمر بلدي كجم (تجريبي)", Barcode = "62270003", PricePiasters = 1400, CostPiasters = 900, StockQuantityMilli = 70000, MinStockQuantityMilli = 15000, Unit = "kg" });
                list.Add(new Product { Id = "demo_prod_4", Name = "خيار صوب بلدي كجم (تجريبي)", Barcode = "62270004", PricePiasters = 1600, CostPiasters = 1100, StockQuantityMilli = 50000, MinStockQuantityMilli = 10000, Unit = "kg" });
                list.Add(new Product { Id = "demo_prod_5", Name = "موز بلدي كجم (تجريبي)", Barcode = "62270005", PricePiasters = 2000, CostPiasters = 1500, StockQuantityMilli = 40000, MinStockQuantityMilli = 10000, Unit = "kg" });
            }
            else if (storeType == "stationery_gifts")
            {
                list.Add(new Product { Id = "demo_prod_1", Name = "قلم جاف أزرق فاخر (تجريبي)", Barcode = "62233001", PricePiasters = 500, CostPiasters = 300, StockQuantityMilli = 80000, MinStockQuantityMilli = 20000, Unit = "piece" });
                list.Add(new Product { Id = "demo_prod_2", Name = "كشكول سلك 60 ورقة (تجريبي)", Barcode = "62233002", PricePiasters = 2000, CostPiasters = 1400, StockQuantityMilli = 35000, MinStockQuantityMilli = 8000, Unit = "piece" });
                list.Add(new Product { Id = "demo_prod_3", Name = "باكت ورق تصوير A4 (تجريبي)", Barcode = "62233003", PricePiasters = 18000, CostPiasters = 15000, StockQuantityMilli = 15000, MinStockQuantityMilli = 3000, Unit = "piece" });
                list.Add(new Product { Id = "demo_prod_4", Name = "علبة ألوان خشب 12 لون (تجريبي)", Barcode = "62233004", PricePiasters = 3500, CostPiasters = 2400, StockQuantityMilli = 20000, MinStockQuantityMilli = 5000, Unit = "piece" });
                list.Add(new Product { Id = "demo_prod_5", Name = "بطارية قلم AA أصلية (تجريبي)", Barcode = "62233005", PricePiasters = 1500, CostPiasters = 1000, StockQuantityMilli = 40000, MinStockQuantityMilli = 10000, Unit = "piece" });
            }
            else if (storeType == "spices_roastery")
            {
                list.Add(new Product { Id = "demo_prod_1", Name = "ثمن بن محوج وسط (تجريبي)", Barcode = "62244001", PricePiasters = 4500, CostPiasters = 3500, StockQuantityMilli = 30000, MinStockQuantityMilli = 5000, Unit = "piece" });
                list.Add(new Product { Id = "demo_prod_2", Name = "ربع بن سادة فاتح (تجريبي)", Barcode = "62244002", PricePiasters = 7000, CostPiasters = 5500, StockQuantityMilli = 25000, MinStockQuantityMilli = 5000, Unit = "piece" });
                list.Add(new Product { Id = "demo_prod_3", Name = "كمون بلدي مطحون 100 جم (تجريبي)", Barcode = "62244003", PricePiasters = 2500, CostPiasters = 1800, StockQuantityMilli = 40000, MinStockQuantityMilli = 8000, Unit = "piece" });
                list.Add(new Product { Id = "demo_prod_4", Name = "فول سوداني مقشر 250 جم (تجريبي)", Barcode = "62244004", PricePiasters = 2500, CostPiasters = 1700, StockQuantityMilli = 35000, MinStockQuantityMilli = 7000, Unit = "piece" });
            }
            else if (storeType == "clothing_apparel")
            {
                list.Add(new Product { Id = "demo_prod_1", Name = "تيشيرت قطن رجالي أساسي (تجريبي)", Barcode = "62255001", PricePiasters = 15000, CostPiasters = 9500, StockQuantityMilli = 20000, MinStockQuantityMilli = 4000, Unit = "piece" });
                list.Add(new Product { Id = "demo_prod_2", Name = "شراب قطن فاخر (تجريبي)", Barcode = "62255002", PricePiasters = 2500, CostPiasters = 1200, StockQuantityMilli = 50000, MinStockQuantityMilli = 10000, Unit = "piece" });
                list.Add(new Product { Id = "demo_prod_3", Name = "حزام جلد كلاسيك (تجريبي)", Barcode = "62255003", PricePiasters = 8500, CostPiasters = 5000, StockQuantityMilli = 15000, MinStockQuantityMilli = 3000, Unit = "piece" });
            }
            else
            {
                // Supermarket & General Grocery
                list.Add(new Product { Id = "demo_prod_1", Name = "لبن جهينة كامل الدسم 1 لتر (تجريبي)", Barcode = "6223001234567", PricePiasters = 4200, CostPiasters = 3400, StockQuantityMilli = 45000, MinStockQuantityMilli = 10000, Unit = "piece" });
                list.Add(new Product { Id = "demo_prod_2", Name = "أرز مصري فاخر 1 كجم (تجريبي)", Barcode = "6221009876543", PricePiasters = 3500, CostPiasters = 2800, StockQuantityMilli = 80000, MinStockQuantityMilli = 15000, Unit = "piece" });
                list.Add(new Product { Id = "demo_prod_3", Name = "شاي العروسة ناعم 250 جم (تجريبي)", Barcode = "6224005544332", PricePiasters = 5500, CostPiasters = 4600, StockQuantityMilli = 25000, MinStockQuantityMilli = 5000, Unit = "piece" });
                list.Add(new Product { Id = "demo_prod_4", Name = "زيت ذرة عافية 800 مل (تجريبي)", Barcode = "6225001122334", PricePiasters = 8500, CostPiasters = 7200, StockQuantityMilli = 30000, MinStockQuantityMilli = 8000, Unit = "piece" });
                list.Add(new Product { Id = "demo_prod_5", Name = "مكرونة الملكة 400 جم (تجريبي)", Barcode = "6226009988776", PricePiasters = 1500, CostPiasters = 1150, StockQuantityMilli = 60000, MinStockQuantityMilli = 12000, Unit = "piece" });
                list.Add(new Product { Id = "demo_prod_6", Name = "طماطم بلدي طازجة كجم (تجريبي)", Barcode = "6227003344556", PricePiasters = 1500, CostPiasters = 1000, StockQuantityMilli = 35000, MinStockQuantityMilli = 10000, Unit = "kg" });
                list.Add(new Product { Id = "demo_prod_7", Name = "جبنة دومتي فيتا بلس 500 جم (تجريبي)", Barcode = "6228004455667", PricePiasters = 3800, CostPiasters = 3000, StockQuantityMilli = 40000, MinStockQuantityMilli = 8000, Unit = "piece" });
                list.Add(new Product { Id = "demo_prod_8", Name = "مياه بركة معدنية 1.5 لتر (تجريبي)", Barcode = "6229007788990", PricePiasters = 800, CostPiasters = 550, StockQuantityMilli = 55000, MinStockQuantityMilli = 12000, Unit = "piece" });
            }

            return list;
        }

        private void LogAudit(string action, string entityType, string entityId, string details)
        {
            try
            {
                if (_auditRepo != null)
                {
                    _auditRepo.Log(new AuditLog
                    {
                        UserId = "system",
                        Action = action,
                        EntityType = entityType,
                        EntityId = entityId,
                        DetailsJson = details
                    });
                }
            }
            catch
            {
                // Non-blocking
            }
        }
    }
}
