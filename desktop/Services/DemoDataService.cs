using System;
using System.Collections.Generic;
using System.Data.SQLite;
using System.Text;
using Newtonsoft.Json;
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
        // Demo rows that a clean-up would delete, and the ones it must keep because real records already use them
        public int RemovableProductsCount { get; set; }
        public int KeptProductsCount { get; set; }
        public int RemovableCustomersCount { get; set; }
        public int KeptCustomersCount { get; set; }
        public int RealProductsCount { get; set; }
        public int RealCustomersCount { get; set; }
        public int RealSalesCount { get; set; }
        public int PlannedProductsCount { get; set; }
        public int PlannedCustomersCount { get; set; }
        public bool CanLoad { get; set; }
        public string LoadBlockedReason { get; set; }
    }

    public class LoadDemoDataResult
    {
        public bool Success { get; set; }
        public string Code { get; set; }
        public string Message { get; set; }
        public int ProductsAdded { get; set; }
        public int ProductsSkipped { get; set; }
        public int CustomersAdded { get; set; }
    }

    public class ClearDemoDataResult
    {
        public bool Success { get; set; }
        public string Code { get; set; }
        public string Message { get; set; }
        public int DeletedProducts { get; set; }
        public int DeletedSales { get; set; }
        public int DeletedCustomers { get; set; }
        public int KeptProducts { get; set; }
        public int KeptCustomers { get; set; }
    }

    /// <summary>
    /// Demo products/customers for training. Every demo row carries the id prefix demo_ (benchmark rows use stress_),
    /// which reports, closing and the drawer already exclude. The loader never creates sales, debts or wallet money.
    /// </summary>
    public class DemoDataService
    {
        // GS1 prefix 299 is reserved for in-store use, so a demo barcode can never equal a manufacturer barcode
        private const string DEMO_BARCODE_PREFIX = "299";
        private readonly string _connectionString;
        private readonly SettingsRepository _settingsRepo;
        private readonly AuditLogRepository _auditRepo;
        private readonly Func<BackupResult> _preChangeBackup;

        public DemoDataService(string connectionString, SettingsRepository settingsRepo, AuditLogRepository auditRepo)
            : this(connectionString, settingsRepo, auditRepo, null)
        {
        }

        public DemoDataService(string connectionString, SettingsRepository settingsRepo, AuditLogRepository auditRepo, Func<BackupResult> preChangeBackup)
        {
            this._connectionString = connectionString;
            this._settingsRepo = settingsRepo;
            this._auditRepo = auditRepo;
            this._preChangeBackup = preChangeBackup;
        }

        private class DemoCustomerSeed
        {
            public string Id;
            public string Name;
            public string Phone;
            public long CreditLimitPiasters;
        }

        private class RefColumn
        {
            public string Table;
            public string Column;
            public string ExtraWhere;
        }

        private class DemoScan
        {
            public List<string> RemovableProductIds = new List<string>();
            public List<string> KeptProductIds = new List<string>();
            public List<string> RemovableCustomerIds = new List<string>();
            public List<string> KeptCustomerIds = new List<string>();
            public List<string> SaleIds = new List<string>();

            public bool IsEmpty
            {
                get
                {
                    return RemovableProductIds.Count == 0 && KeptProductIds.Count == 0
                        && RemovableCustomerIds.Count == 0 && KeptCustomerIds.Count == 0 && SaleIds.Count == 0;
                }
            }
        }

        private static string IsDemoSql(string column)
        {
            return "(substr(COALESCE(" + column + ", ''), 1, 5) = 'demo_' OR substr(COALESCE(" + column + ", ''), 1, 7) = 'stress_')";
        }

        private static List<DemoCustomerSeed> GetDemoCustomers()
        {
            var list = new List<DemoCustomerSeed>();
            list.Add(new DemoCustomerSeed { Id = "demo_cust_1", Name = "عميل تجريبي - أحمد محمود", Phone = "01099887766", CreditLimitPiasters = 50000 });
            list.Add(new DemoCustomerSeed { Id = "demo_cust_2", Name = "عميلة تجريبية - أم كريم", Phone = "01122334455", CreditLimitPiasters = 30000 });
            return list;
        }

        public DemoStatusResult GetStatus()
        {
            return GetStatus(null);
        }

        public DemoStatusResult GetStatus(string storeType)
        {
            var status = new DemoStatusResult();

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();

                DemoScan scan = ScanDemoRows(conn, null);
                status.RemovableProductsCount = scan.RemovableProductIds.Count;
                status.KeptProductsCount = scan.KeptProductIds.Count;
                status.RemovableCustomersCount = scan.RemovableCustomerIds.Count;
                status.KeptCustomersCount = scan.KeptCustomerIds.Count;
                status.DemoProductsCount = scan.RemovableProductIds.Count + scan.KeptProductIds.Count;
                status.DemoCustomersCount = scan.RemovableCustomerIds.Count + scan.KeptCustomerIds.Count;
                status.DemoSalesCount = scan.SaleIds.Count;

                status.RealProductsCount = CountWhere(conn, null, "products", "NOT " + IsDemoSql("id"));
                status.RealCustomersCount = CountWhere(conn, null, "customers", "NOT " + IsDemoSql("id") + " AND id <> 'cust_general_cash'");
                status.RealSalesCount = CountWhere(conn, null, "sales", "NOT " + IsDemoSql("id"));
            }

            status.HasDemoData = status.DemoProductsCount > 0 || status.DemoSalesCount > 0 || status.DemoCustomersCount > 0;
            status.PlannedProductsCount = GetDemoProductsForStoreType(NormalizeStoreType(storeType)).Count;
            status.PlannedCustomersCount = GetDemoCustomers().Count;

            string code;
            string blockReason = LoadBlockReason(status.RealSalesCount, status.HasDemoData, out code);
            status.CanLoad = blockReason == null;
            status.LoadBlockedReason = blockReason;
            return status;
        }

        private static string NormalizeStoreType(string storeType)
        {
            return string.IsNullOrWhiteSpace(storeType) ? "supermarket" : storeType;
        }

        private static string LoadBlockReason(int realSalesCount, bool hasDemoData, out string code)
        {
            if (realSalesCount > 0)
            {
                code = "REAL_SALES_EXIST";
                return string.Format("لا يمكن تحميل بضاعة تجريبية لأن النظام يحتوي على {0} فاتورة حقيقية. البضاعة التجريبية تدخل في مخزون المحل وتقاريره، لذلك لا تُحمَّل إلا على نظام لم تُسجَّل عليه أي مبيعات.", realSalesCount);
            }
            if (hasDemoData)
            {
                code = "ALREADY_LOADED";
                return "البيانات التجريبية محمّلة بالفعل في النظام. امسحها أولاً إذا أردت تحميلها من جديد.";
            }
            code = null;
            return null;
        }

        public LoadDemoDataResult LoadDemoData(string storeType)
        {
            return LoadDemoData(storeType, false);
        }

        public LoadDemoDataResult LoadDemoData(string storeType, bool acknowledgeRealData)
        {
            var result = new LoadDemoDataResult();
            string type = NormalizeStoreType(storeType);
            string now = DateTime.UtcNow.ToString("o");
            List<Product> demoProducts = GetDemoProductsForStoreType(type);
            List<DemoCustomerSeed> demoCustomers = GetDemoCustomers();

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        // The checks run inside the transaction so they cannot go stale before the inserts
                        DemoScan existing = ScanDemoRows(conn, trans);
                        bool hasDemo = !existing.IsEmpty;
                        int realSales = CountWhere(conn, trans, "sales", "NOT " + IsDemoSql("id"));
                        string blockCode;
                        string blockReason = LoadBlockReason(realSales, hasDemo, out blockCode);
                        if (blockReason != null)
                        {
                            trans.Rollback();
                            result.Success = false;
                            result.Code = blockCode;
                            result.Message = blockReason;
                            return result;
                        }

                        int realProducts = CountWhere(conn, trans, "products", "NOT " + IsDemoSql("id"));
                        int realCustomers = CountWhere(conn, trans, "customers", "NOT " + IsDemoSql("id") + " AND id <> 'cust_general_cash'");
                        if ((realProducts > 0 || realCustomers > 0) && !acknowledgeRealData)
                        {
                            trans.Rollback();
                            result.Success = false;
                            result.Code = "CONFIRM_REQUIRED";
                            result.Message = string.Format("يوجد في النظام {0} صنف و{1} زبون حقيقيون. البضاعة التجريبية ستُضاف بجانبهم وتظهر معهم في البيع والمخزن. أكّد صراحة أنك تريد ذلك.", realProducts, realCustomers);
                            return result;
                        }

                        int prodsAdded = 0;
                        int prodsSkipped = 0;
                        for (int i = 0; i < demoProducts.Count; i++)
                        {
                            Product dp = demoProducts[i];
                            // A real product (or a kept demo product) with the same id or barcode is never overwritten, merged or re-stocked
                            if (ProductIdOrBarcodeExists(conn, trans, dp.Id, dp.Barcode))
                            {
                                prodsSkipped++;
                                continue;
                            }

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

                            using (var bcmd = new SQLiteCommand(@"
                                INSERT INTO product_barcodes (id, product_id, barcode, created_at)
                                VALUES (@bid, @pid, @barcode, @now);
                            ", conn, trans))
                            {
                                bcmd.Parameters.AddWithValue("@bid", "demo_bcode_" + dp.Id);
                                bcmd.Parameters.AddWithValue("@pid", dp.Id);
                                bcmd.Parameters.AddWithValue("@barcode", dp.Barcode);
                                bcmd.Parameters.AddWithValue("@now", now);
                                bcmd.ExecuteNonQuery();
                            }

                            using (var smCmd = new SQLiteCommand(@"
                                INSERT INTO stock_movements (
                                    id, product_id, movement_type, quantity_milli,
                                    reference_type, reference_id, unit_cost_piasters, note, created_at
                                ) VALUES (
                                    @smid, @pid, 'INITIAL_OPENING', @qty,
                                    'DEMO', 'DEMO_SEED', @cost, 'رصيد افتتاحي تجريبي للتدريب', @now
                                );
                            ", conn, trans))
                            {
                                smCmd.Parameters.AddWithValue("@smid", "demo_sm_" + dp.Id);
                                smCmd.Parameters.AddWithValue("@pid", dp.Id);
                                smCmd.Parameters.AddWithValue("@qty", dp.StockQuantityMilli);
                                smCmd.Parameters.AddWithValue("@cost", dp.CostPiasters);
                                smCmd.Parameters.AddWithValue("@now", now);
                                smCmd.ExecuteNonQuery();
                            }

                            prodsAdded++;
                        }

                        int customersAdded = 0;
                        for (int c = 0; c < demoCustomers.Count; c++)
                        {
                            DemoCustomerSeed seed = demoCustomers[c];
                            using (var cCmd = new SQLiteCommand(@"
                                INSERT INTO customers (id, name, phone, balance_piasters, credit_limit_piasters, is_archived, created_at)
                                SELECT @id, @name, @phone, 0, @limit, 0, @now
                                WHERE NOT EXISTS (SELECT 1 FROM customers WHERE id = @id);
                            ", conn, trans))
                            {
                                cCmd.Parameters.AddWithValue("@id", seed.Id);
                                cCmd.Parameters.AddWithValue("@name", seed.Name);
                                cCmd.Parameters.AddWithValue("@phone", seed.Phone);
                                cCmd.Parameters.AddWithValue("@limit", seed.CreditLimitPiasters);
                                cCmd.Parameters.AddWithValue("@now", now);
                                customersAdded += cCmd.ExecuteNonQuery();
                            }
                        }

                        WriteAudit(conn, trans, "DEMO_DATA_LOADED", type, new
                        {
                            storeType = type,
                            productsAdded = prodsAdded,
                            productsSkipped = prodsSkipped,
                            customersAdded = customersAdded,
                            mixedWithRealData = realProducts > 0 || realCustomers > 0
                        });

                        trans.Commit();

                        SetDemoFlag(prodsAdded > 0 || customersAdded > 0);

                        result.Success = true;
                        result.ProductsAdded = prodsAdded;
                        result.ProductsSkipped = prodsSkipped;
                        result.CustomersAdded = customersAdded;
                        result.Message = string.Format("تمت إضافة {0} صنف تجريبي و{1} زبون تجريبي، ولم تُنشأ أي فواتير أو ديون أو أرصدة.", prodsAdded, customersAdded);
                        if (prodsSkipped > 0)
                        {
                            result.Message += string.Format(" وتم تخطي {0} صنف لأن الكود أو الباركود موجود مسبقاً ولم يُلمس.", prodsSkipped);
                        }
                        return result;
                    }
                    catch (Exception ex)
                    {
                        trans.Rollback();
                        result.Success = false;
                        result.Code = "DEMO_LOAD_FAILED";
                        result.Message = "فشل تحميل البيانات التجريبية ولم يتغير شيء في النظام: " + ex.Message;
                        return result;
                    }
                }
            }
        }

        public ClearDemoDataResult ClearDemoData()
        {
            var res = new ClearDemoDataResult();

            try
            {
                DemoScan preview;
                using (var scanConn = new SQLiteConnection(_connectionString))
                {
                    scanConn.Open();
                    preview = ScanDemoRows(scanConn, null);
                }

                if (preview.IsEmpty)
                {
                    res.Success = true;
                    res.Message = "لا توجد بيانات تجريبية في النظام لمسحها.";
                    return res;
                }

                // A verified copy of the whole database is taken before anything is deleted
                if (_preChangeBackup != null)
                {
                    BackupResult backup = null;
                    try
                    {
                        backup = _preChangeBackup();
                    }
                    catch (Exception)
                    {
                        backup = null;
                    }
                    if (backup == null || !backup.Success || !backup.IsVerified)
                    {
                        res.Success = false;
                        res.Code = "BACKUP_FAILED";
                        res.Message = "تم إيقاف المسح ولم يتغير شيء: تعذر أخذ نسخة احتياطية موثقة من البيانات الحالية أولاً.";
                        return res;
                    }
                }

                using (var conn = new SQLiteConnection(_connectionString))
                {
                    conn.Open();
                    using (var trans = conn.BeginTransaction())
                    {
                        try
                        {
                            DemoScan scan = ScanDemoRows(conn, trans);
                            int deletedProducts = 0;
                            int deletedCustomers = 0;
                            var keptProducts = new List<string>(scan.KeptProductIds);
                            var keptCustomers = new List<string>(scan.KeptCustomerIds);

                            // Fake sales left by older versions and the benchmark; real sales never match the demo prefixes
                            if (scan.SaleIds.Count > 0)
                            {
                                ExecuteSql(conn, trans, "DELETE FROM return_items WHERE return_id IN (SELECT id FROM returns WHERE " + IsDemoSql("sale_id") + " OR " + IsDemoSql("id") + ");");
                                ExecuteSql(conn, trans, "DELETE FROM returns WHERE " + IsDemoSql("sale_id") + " OR " + IsDemoSql("id") + ";");
                                ExecuteSql(conn, trans, "DELETE FROM payments WHERE " + IsDemoSql("sale_id") + ";");
                                ExecuteSql(conn, trans, "DELETE FROM sale_items WHERE " + IsDemoSql("sale_id") + ";");
                                ExecuteSql(conn, trans, "DELETE FROM customer_ledger WHERE " + IsDemoSql("sale_id") + ";");
                                ExecuteSql(conn, trans, "DELETE FROM sales WHERE " + IsDemoSql("id") + ";");
                                ExecuteSql(conn, trans, "UPDATE counters SET current_value = COALESCE((SELECT MAX(invoice_number) FROM sales), 0) WHERE name = 'invoice_number';");
                            }

                            for (int c = 0; c < scan.RemovableCustomerIds.Count; c++)
                            {
                                string customerId = scan.RemovableCustomerIds[c];
                                if (TryDeleteInSavepoint(conn, trans, customerId, new string[] { "DELETE FROM customers WHERE id = @id;" }))
                                {
                                    deletedCustomers++;
                                }
                                else
                                {
                                    keptCustomers.Add(customerId);
                                }
                            }

                            for (int p = 0; p < scan.RemovableProductIds.Count; p++)
                            {
                                string productId = scan.RemovableProductIds[p];
                                bool deleted = TryDeleteInSavepoint(conn, trans, productId, new string[]
                                {
                                    "DELETE FROM stock_movements WHERE product_id = @id;",
                                    "DELETE FROM product_price_history WHERE product_id = @id;",
                                    "DELETE FROM product_barcodes WHERE product_id = @id;",
                                    "DELETE FROM quick_items WHERE product_id = @id;",
                                    "DELETE FROM products WHERE id = @id;"
                                });
                                if (deleted)
                                {
                                    deletedProducts++;
                                }
                                else
                                {
                                    keptProducts.Add(productId);
                                }
                            }

                            // Kept rows stay for the real records that use them: the product leaves the sale screen, the customer is archived
                            for (int k = 0; k < keptProducts.Count; k++)
                            {
                                ExecuteSqlWithId(conn, trans, "UPDATE products SET is_active = 0, updated_at = datetime('now') WHERE id = @id;", keptProducts[k]);
                            }
                            for (int k = 0; k < keptCustomers.Count; k++)
                            {
                                ExecuteSqlWithId(conn, trans, "UPDATE customers SET is_archived = 1 WHERE id = @id;", keptCustomers[k]);
                            }

                            ExecuteSql(conn, trans, "DELETE FROM categories WHERE " + IsDemoSql("id") + " AND NOT EXISTS (SELECT 1 FROM products WHERE products.category_id = categories.id);");

                            WriteAudit(conn, trans, "DEMO_DATA_CLEARED", "SYSTEM", new
                            {
                                deletedProducts = deletedProducts,
                                deletedSales = scan.SaleIds.Count,
                                deletedCustomers = deletedCustomers,
                                keptProducts = keptProducts.Count,
                                keptCustomers = keptCustomers.Count
                            });

                            trans.Commit();

                            SetDemoFlag(keptProducts.Count > 0 || keptCustomers.Count > 0);

                            res.Success = true;
                            res.DeletedProducts = deletedProducts;
                            res.DeletedSales = scan.SaleIds.Count;
                            res.DeletedCustomers = deletedCustomers;
                            res.KeptProducts = keptProducts.Count;
                            res.KeptCustomers = keptCustomers.Count;
                            res.Message = BuildClearMessage(res);
                            return res;
                        }
                        catch (Exception ex)
                        {
                            trans.Rollback();
                            res.Success = false;
                            res.Code = "DEMO_CLEAR_FAILED";
                            res.Message = "فشل مسح البيانات التجريبية ولم يتغير شيء في النظام: " + ex.Message;
                            return res;
                        }
                    }
                }
            }
            catch (Exception outerEx)
            {
                res.Success = false;
                res.Code = "DEMO_CLEAR_FAILED";
                res.Message = "فشل مسح البيانات التجريبية ولم يتغير شيء في النظام: " + outerEx.Message;
                return res;
            }
        }

        private static string BuildClearMessage(ClearDemoDataResult res)
        {
            var sb = new StringBuilder();
            sb.Append(string.Format("تم أخذ نسخة احتياطية موثقة ثم مسح {0} صنف و{1} فاتورة تجريبية و{2} زبون تجريبي.", res.DeletedProducts, res.DeletedSales, res.DeletedCustomers));
            if (res.KeptProducts > 0)
            {
                sb.Append(string.Format(" بقي {0} صنف تجريبي لأن فواتير أو حركات مخزن حقيقية استخدمته، وتم إيقافه فلا يظهر في البيع.", res.KeptProducts));
            }
            if (res.KeptCustomers > 0)
            {
                sb.Append(string.Format(" بقي {0} زبون تجريبي لأن له فواتير أو حركات حساب حقيقية، وتمت أرشفته.", res.KeptCustomers));
            }
            return sb.ToString();
        }

        private DemoScan ScanDemoRows(SQLiteConnection conn, SQLiteTransaction trans)
        {
            var scan = new DemoScan();
            List<RefColumn> productRefs = BuildReferenceColumns(conn, trans, true);
            List<RefColumn> customerRefs = BuildReferenceColumns(conn, trans, false);

            foreach (string productId in ReadStrings(conn, trans, "SELECT id FROM products WHERE " + IsDemoSql("id") + ";"))
            {
                if (HasReference(conn, trans, productRefs, productId))
                {
                    scan.KeptProductIds.Add(productId);
                }
                else
                {
                    scan.RemovableProductIds.Add(productId);
                }
            }

            var withBalance = new HashSet<string>(ReadStrings(conn, trans, "SELECT id FROM customers WHERE " + IsDemoSql("id") + " AND balance_piasters <> 0;"));
            foreach (string customerId in ReadStrings(conn, trans, "SELECT id FROM customers WHERE " + IsDemoSql("id") + ";"))
            {
                if (withBalance.Contains(customerId) || HasReference(conn, trans, customerRefs, customerId))
                {
                    scan.KeptCustomerIds.Add(customerId);
                }
                else
                {
                    scan.RemovableCustomerIds.Add(customerId);
                }
            }

            scan.SaleIds.AddRange(ReadStrings(conn, trans, "SELECT id FROM sales WHERE " + IsDemoSql("id") + ";"));
            return scan;
        }

        // Tables that point at products or customers are discovered from the schema, so a table added later also protects the demo row
        private static List<RefColumn> BuildReferenceColumns(SQLiteConnection conn, SQLiteTransaction trans, bool forProducts)
        {
            var refs = new List<RefColumn>();
            List<string> tables = ReadStrings(conn, trans, "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%';");

            for (int t = 0; t < tables.Count; t++)
            {
                string table = tables[t];
                if (!IsSafeIdentifier(table) || IsOwnedByDemoRow(table, forProducts))
                {
                    continue;
                }

                var columns = new List<string>();
                using (var cmd = new SQLiteCommand("PRAGMA table_info(" + table + ");", conn, trans))
                using (var rd = cmd.ExecuteReader())
                {
                    while (rd.Read())
                    {
                        columns.Add(Convert.ToString(rd["name"]));
                    }
                }

                for (int c = 0; c < columns.Count; c++)
                {
                    string column = columns[c];
                    bool matches = forProducts
                        ? (column == "product_id" || column.EndsWith("_product_id", StringComparison.Ordinal))
                        : column == "customer_id";
                    if (!matches)
                    {
                        continue;
                    }
                    refs.Add(new RefColumn { Table = table, Column = column, ExtraWhere = GetReferenceFilter(table, forProducts) });
                }
            }
            return refs;
        }

        // Rows deleted together with the demo row itself, so they never count as a real use
        private static bool IsOwnedByDemoRow(string table, bool forProducts)
        {
            if (!forProducts)
            {
                return false;
            }
            return table == "product_barcodes" || table == "product_price_history" || table == "quick_items";
        }

        // Only rows that belong to a demo sale, return or seed movement are ignored; everything else is real activity
        private static string GetReferenceFilter(string table, bool forProducts)
        {
            if (forProducts)
            {
                if (table == "sale_items") return " AND NOT " + IsDemoSql("sale_id");
                if (table == "return_items") return " AND NOT " + IsDemoSql("return_id");
                if (table == "stock_movements") return " AND NOT " + IsDemoSql("id") + " AND NOT " + IsDemoSql("reference_id");
                return "";
            }
            if (table == "sales") return " AND NOT " + IsDemoSql("id");
            if (table == "customer_ledger") return " AND NOT " + IsDemoSql("sale_id");
            return "";
        }

        private static bool HasReference(SQLiteConnection conn, SQLiteTransaction trans, List<RefColumn> refs, string id)
        {
            for (int i = 0; i < refs.Count; i++)
            {
                string sql = "SELECT 1 FROM \"" + refs[i].Table + "\" WHERE \"" + refs[i].Column + "\" = @id" + refs[i].ExtraWhere + " LIMIT 1;";
                using (var cmd = new SQLiteCommand(sql, conn, trans))
                {
                    cmd.Parameters.AddWithValue("@id", id);
                    if (cmd.ExecuteScalar() != null)
                    {
                        return true;
                    }
                }
            }
            return false;
        }

        private static bool IsSafeIdentifier(string name)
        {
            if (string.IsNullOrEmpty(name))
            {
                return false;
            }
            for (int i = 0; i < name.Length; i++)
            {
                char ch = name[i];
                if (!(char.IsLetterOrDigit(ch) || ch == '_'))
                {
                    return false;
                }
            }
            return true;
        }

        private static List<string> ReadStrings(SQLiteConnection conn, SQLiteTransaction trans, string sql)
        {
            var list = new List<string>();
            using (var cmd = new SQLiteCommand(sql, conn, trans))
            using (var rd = cmd.ExecuteReader())
            {
                while (rd.Read())
                {
                    list.Add(rd.GetString(0));
                }
            }
            return list;
        }

        // table and condition are always code constants, never user input
        private static int CountWhere(SQLiteConnection conn, SQLiteTransaction trans, string table, string condition)
        {
            using (var cmd = new SQLiteCommand("SELECT COUNT(*) FROM " + table + " WHERE " + condition + ";", conn, trans))
            {
                return Convert.ToInt32(cmd.ExecuteScalar());
            }
        }

        private static bool ProductIdOrBarcodeExists(SQLiteConnection conn, SQLiteTransaction trans, string id, string barcode)
        {
            using (var cmd = new SQLiteCommand("SELECT 1 FROM products WHERE id = @id OR barcode = @barcode LIMIT 1;", conn, trans))
            {
                cmd.Parameters.AddWithValue("@id", id);
                cmd.Parameters.AddWithValue("@barcode", barcode);
                if (cmd.ExecuteScalar() != null)
                {
                    return true;
                }
            }
            using (var cmd = new SQLiteCommand("SELECT 1 FROM product_barcodes WHERE barcode = @barcode LIMIT 1;", conn, trans))
            {
                cmd.Parameters.AddWithValue("@barcode", barcode);
                return cmd.ExecuteScalar() != null;
            }
        }

        private static void ExecuteSql(SQLiteConnection conn, SQLiteTransaction trans, string sql)
        {
            using (var cmd = new SQLiteCommand(sql, conn, trans))
            {
                cmd.ExecuteNonQuery();
            }
        }

        private static void ExecuteSqlWithId(SQLiteConnection conn, SQLiteTransaction trans, string sql, string id)
        {
            using (var cmd = new SQLiteCommand(sql, conn, trans))
            {
                cmd.Parameters.AddWithValue("@id", id);
                cmd.ExecuteNonQuery();
            }
        }

        // A foreign key that the schema scan did not foresee keeps the row instead of failing the whole clean-up
        private static bool TryDeleteInSavepoint(SQLiteConnection conn, SQLiteTransaction trans, string id, string[] statements)
        {
            ExecuteSql(conn, trans, "SAVEPOINT demo_row;");
            try
            {
                for (int i = 0; i < statements.Length; i++)
                {
                    ExecuteSqlWithId(conn, trans, statements[i], id);
                }
                ExecuteSql(conn, trans, "RELEASE demo_row;");
                return true;
            }
            catch (SQLiteException)
            {
                ExecuteSql(conn, trans, "ROLLBACK TO demo_row;");
                ExecuteSql(conn, trans, "RELEASE demo_row;");
                return false;
            }
        }

        private void WriteAudit(SQLiteConnection conn, SQLiteTransaction trans, string action, string entityId, object details)
        {
            if (_auditRepo == null)
            {
                return;
            }
            UserDto actor = SecurityService.CurrentUser;
            _auditRepo.Log(conn, trans, new AuditLog
            {
                UserId = actor != null ? actor.Id : "system",
                Action = action,
                EntityType = "DEMO",
                EntityId = entityId,
                DetailsJson = JsonConvert.SerializeObject(details)
            });
        }

        // The flag is only a convenience mirror of the real rows, so failing to write it must not undo a committed change
        private void SetDemoFlag(bool hasDemo)
        {
            try
            {
                _settingsRepo.Set("has_demo_data", hasDemo ? "1" : "0");
            }
            catch (Exception)
            {
                // Mirror only
            }
        }

        private static string ToInStoreEan13(string seed)
        {
            var digits = new StringBuilder();
            for (int i = 0; i < seed.Length; i++)
            {
                if (char.IsDigit(seed[i]))
                {
                    digits.Append(seed[i]);
                }
            }
            string tail = digits.ToString();
            tail = tail.Length >= 9 ? tail.Substring(tail.Length - 9) : tail.PadLeft(9, '0');

            string body = DEMO_BARCODE_PREFIX + tail;
            int sum = 0;
            for (int i = 0; i < body.Length; i++)
            {
                int d = body[i] - '0';
                sum += (i % 2 == 0) ? d : d * 3;
            }
            int check = (10 - (sum % 10)) % 10;
            return body + check.ToString();
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
            else if (storeType == "toys_kids")
            {
                list.Add(new Product { Id = "demo_prod_1", Name = "سيارة لعبة معدنية صغيرة (تجريبي)", Barcode = "62266001", PricePiasters = 5500, CostPiasters = 3500, StockQuantityMilli = 30000, MinStockQuantityMilli = 5000, Unit = "piece" });
                list.Add(new Product { Id = "demo_prod_2", Name = "عروسة قماش وسط (تجريبي)", Barcode = "62266002", PricePiasters = 9500, CostPiasters = 6500, StockQuantityMilli = 20000, MinStockQuantityMilli = 4000, Unit = "piece" });
                list.Add(new Product { Id = "demo_prod_3", Name = "مكعبات تركيب ملونة 50 قطعة (تجريبي)", Barcode = "62266003", PricePiasters = 12000, CostPiasters = 8000, StockQuantityMilli = 15000, MinStockQuantityMilli = 3000, Unit = "piece" });
                list.Add(new Product { Id = "demo_prod_4", Name = "كرة بلاستيك ملونة (تجريبي)", Barcode = "62266004", PricePiasters = 3000, CostPiasters = 1800, StockQuantityMilli = 40000, MinStockQuantityMilli = 8000, Unit = "piece" });
            }
            else if (storeType == "pharmacy")
            {
                list.Add(new Product { Id = "demo_prod_1", Name = "بنادول إكسترا أحمر 12 قرص (تجريبي)", Barcode = "62211001", PricePiasters = 4200, CostPiasters = 3400, StockQuantityMilli = 50000, MinStockQuantityMilli = 10000, Unit = "piece" });
                list.Add(new Product { Id = "demo_prod_2", Name = "كونجستال نزلات برد وإنفلونزا (تجريبي)", Barcode = "62211002", PricePiasters = 2800, CostPiasters = 2200, StockQuantityMilli = 60000, MinStockQuantityMilli = 12000, Unit = "piece" });
                list.Add(new Product { Id = "demo_prod_3", Name = "كحول طبي 70% بخاخ 120 مل (تجريبي)", Barcode = "62211003", PricePiasters = 2500, CostPiasters = 1600, StockQuantityMilli = 60000, MinStockQuantityMilli = 12000, Unit = "piece" });
                list.Add(new Product { Id = "demo_prod_4", Name = "بلاستر طبي لاصق جروح علبة 50 قطعة (تجريبي)", Barcode = "62211004", PricePiasters = 3000, CostPiasters = 1800, StockQuantityMilli = 40000, MinStockQuantityMilli = 8000, Unit = "piece" });
                list.Add(new Product { Id = "demo_prod_5", Name = "قطن طبي معقم 100 جم (تجريبي)", Barcode = "62211005", PricePiasters = 2200, CostPiasters = 1500, StockQuantityMilli = 50000, MinStockQuantityMilli = 10000, Unit = "piece" });
                list.Add(new Product { Id = "demo_prod_6", Name = "شامبو جونسون للأطفال 300 مل (تجريبي)", Barcode = "62211006", PricePiasters = 6500, CostPiasters = 5200, StockQuantityMilli = 30000, MinStockQuantityMilli = 6000, Unit = "piece" });
            }
            else if (storeType == "cafe_restaurant" || storeType == "cafe" || storeType == "restaurant")
            {
                list.Add(new Product { Id = "demo_prod_1", Name = "برجر لحم بقري سنجل كلاسيك (تجريبي)", Barcode = "5001", PricePiasters = 8500, CostPiasters = 5500, StockQuantityMilli = 100000, MinStockQuantityMilli = 20000, Unit = "piece" });
                list.Add(new Product { Id = "demo_prod_2", Name = "ساندوتش كريسبي دجاج زنجر حار (تجريبي)", Barcode = "5002", PricePiasters = 9500, CostPiasters = 6200, StockQuantityMilli = 90000, MinStockQuantityMilli = 18000, Unit = "piece" });
                list.Add(new Product { Id = "demo_prod_3", Name = "بيتزا مارجريتا إيطالي وسط (تجريبي)", Barcode = "5003", PricePiasters = 11000, CostPiasters = 6800, StockQuantityMilli = 50000, MinStockQuantityMilli = 10000, Unit = "piece" });
                list.Add(new Product { Id = "demo_prod_4", Name = "بطاطس مقلية فارم فريتس وسط (تجريبي)", Barcode = "5004", PricePiasters = 3000, CostPiasters = 1600, StockQuantityMilli = 150000, MinStockQuantityMilli = 30000, Unit = "piece" });
                list.Add(new Product { Id = "demo_prod_5", Name = "إسبريسو سنجل شوت إيطالي (تجريبي)", Barcode = "5005", PricePiasters = 3500, CostPiasters = 1200, StockQuantityMilli = 200000, MinStockQuantityMilli = 30000, Unit = "piece" });
                list.Add(new Product { Id = "demo_prod_6", Name = "كابتشينو حليب مبخر رغوة غنية (تجريبي)", Barcode = "5006", PricePiasters = 5500, CostPiasters = 2400, StockQuantityMilli = 150000, MinStockQuantityMilli = 25000, Unit = "piece" });
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

            // The catalog codes only seed a unique in-store EAN-13, so a demo product never collides with a real one
            for (int i = 0; i < list.Count; i++)
            {
                list[i].Barcode = ToInStoreEan13(list[i].Barcode);
            }
            return list;
        }
    }
}
