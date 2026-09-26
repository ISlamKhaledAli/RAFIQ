using System;
using System.IO;
using System.Data.SQLite;

namespace RafiqPOS.Database
{
    public static class MigrationRunner
    {
        public const int LATEST_SUPPORTED_VERSION = 16;

        public static void ApplyMigrations(string connectionString, string dbPath)
        {
            using (var conn = new SQLiteConnection(connectionString))
            {
                conn.Open();

                // 1. Enable WAL mode and foreign keys
                using (var cmd = new SQLiteCommand("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;", conn))
                {
                    cmd.ExecuteNonQuery();
                }

                // 2. Ensure schema_migrations exists
                using (var cmd = new SQLiteCommand(@"
                    CREATE TABLE IF NOT EXISTS schema_migrations (
                        version INTEGER PRIMARY KEY,
                        name TEXT,
                        applied_at TEXT NOT NULL
                    );
                ", conn))
                {
                    cmd.ExecuteNonQuery();
                }

                // Add 'name' column if missing from legacy spike database
                try
                {
                    using (var cmd = new SQLiteCommand("ALTER TABLE schema_migrations ADD COLUMN name TEXT DEFAULT '';", conn))
                    {
                        cmd.ExecuteNonQuery();
                    }
                }
                catch
                {
                    // Column already exists, safe to ignore
                }

                // 3. Get current version
                int currentVersion = 0;
                using (var cmd = new SQLiteCommand("SELECT COALESCE(MAX(version), 0) FROM schema_migrations;", conn))
                {
                    object result = cmd.ExecuteScalar();
                    if (result != null && result != DBNull.Value)
                    {
                        currentVersion = Convert.ToInt32(result);
                    }
                }

                // 4. Apply Migration 1: Base Enterprise Schema
                if (currentVersion < 1)
                {
                    BackupDatabaseBeforeMigration(dbPath);
                    ApplyMigration1(conn);
                }

                // 5. Apply Migration 2: Customer Debts and Ledger
                if (currentVersion < 2)
                {
                    BackupDatabaseBeforeMigration(dbPath);
                    ApplyMigration2(conn);
                }

                // 6. Apply Migration 3: Tax Fields and ETA Readiness (Feature #6)
                if (currentVersion < 3)
                {
                    BackupDatabaseBeforeMigration(dbPath);
                    ApplyMigration3(conn);
                }

                // 7. Apply Migration 4: Multiple Product Barcodes (Feature #15)
                if (currentVersion < 4)
                {
                    BackupDatabaseBeforeMigration(dbPath);
                    ApplyMigration4(conn);
                }

                // 8. Apply Migration 5: Product Categories Management (Feature #16)
                if (currentVersion < 5)
                {
                    BackupDatabaseBeforeMigration(dbPath);
                    ApplyMigration5(conn);
                }

                // 9. Apply Migration 6: Product Price and Cost History (Feature #17)
                if (currentVersion < 6)
                {
                    BackupDatabaseBeforeMigration(dbPath);
                    ApplyMigration6(conn);
                }

                // 10. Apply Migration 7: Minimum Stock Threshold (Feature #18)
                if (currentVersion < 7)
                {
                    BackupDatabaseBeforeMigration(dbPath);
                    ApplyMigration7(conn);
                }

                // 11. Apply Migration 8: Stock Movements Ledger (Feature #35 & #34 / Tasks 35-1 & 34-1)
                if (currentVersion < 8)
                {
                    BackupDatabaseBeforeMigration(dbPath);
                    ApplyMigration8(conn);
                }

                // 12. Apply Migration 9: Product Normalized Name & Index for Fast Search (Feature #22 / Task 22-3)
                if (currentVersion < 9)
                {
                    BackupDatabaseBeforeMigration(dbPath);
                    ApplyMigration9(conn);
                }

                // 13. Apply Migration 10: Quick Items (Fast Picks) Management (Feature #20 / Task 20-1)
                if (currentVersion < 10)
                {
                    BackupDatabaseBeforeMigration(dbPath);
                    ApplyMigration10(conn);
                }

                // 14. Apply Migration 11: Sequential Counters Table (Feature #107 / Task 107-1 & 107-2)
                if (currentVersion < 11)
                {
                    BackupDatabaseBeforeMigration(dbPath);
                    ApplyMigration11(conn);
                }

                // 15. Apply Migration 12: High-Performance Covering Indexes (Feature #129 / Task 129-3)
                if (currentVersion < 12)
                {
                    BackupDatabaseBeforeMigration(dbPath);
                    ApplyMigration12(conn);
                }

                // 16. Apply Migration 13: Store Type Templates (Feature #106 / Task 106-2)
                if (currentVersion < 13)
                {
                    BackupDatabaseBeforeMigration(dbPath);
                    ApplyMigration13(conn);
                }

                // 17. Apply Migration 14: Product Multi-Units (Feature #161 / Tasks 161-1 & 161-2)
                if (currentVersion < 14)
                {
                    BackupDatabaseBeforeMigration(dbPath);
                    ApplyMigration14(conn);
                }

                // 18. Apply Migration 15: User Accounts and Role-Based Security (Feature #166)
                if (currentVersion < 15)
                {
                    BackupDatabaseBeforeMigration(dbPath);
                    ApplyMigration15(conn);
                }

                // 19. Apply Migration 16: Tamper-Evident Audit Log Chaining and Hash Sealing (Feature #169)
                if (currentVersion < 16)
                {
                    BackupDatabaseBeforeMigration(dbPath);
                    ApplyMigration16(conn);
                }

                // 20. Apply Migration 17: Discount Rules and Cashier Thresholds (Feature #24)
                if (currentVersion < 17)
                {
                    BackupDatabaseBeforeMigration(dbPath);
                    ApplyMigration17(conn);
                }

                // 21. Self-Healing Schema Guard: Automatically repair missing columns or indexes
                EnsureSchemaHealth(conn);
            }
        }

        private static void EnsureSchemaHealth(SQLiteConnection conn)
        {
            using (var trans = conn.BeginTransaction())
            {
                try
                {
                    // 1. Health check for categories table
                    using (var checkCatCmd = new SQLiteCommand("SELECT name FROM sqlite_master WHERE type='table' AND name='categories';", conn, trans))
                    {
                        var tbl = checkCatCmd.ExecuteScalar();
                        if (tbl != null)
                        {
                            var existingCols = new System.Collections.Generic.HashSet<string>(StringComparer.OrdinalIgnoreCase);
                            using (var infoCmd = new SQLiteCommand("PRAGMA table_info(categories);", conn, trans))
                            using (var reader = infoCmd.ExecuteReader())
                            {
                                while (reader.Read())
                                {
                                    existingCols.Add(reader["name"].ToString());
                                }
                            }

                            if (!existingCols.Contains("display_order"))
                            {
                                using (var alter = new SQLiteCommand("ALTER TABLE categories ADD COLUMN display_order INTEGER NOT NULL DEFAULT 0;", conn, trans))
                                {
                                    alter.ExecuteNonQuery();
                                }
                            }

                            if (!existingCols.Contains("is_active"))
                            {
                                using (var alter = new SQLiteCommand("ALTER TABLE categories ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;", conn, trans))
                                {
                                    alter.ExecuteNonQuery();
                                }
                            }

                            if (!existingCols.Contains("updated_at"))
                            {
                                using (var alter = new SQLiteCommand("ALTER TABLE categories ADD COLUMN updated_at TEXT;", conn, trans))
                                {
                                    alter.ExecuteNonQuery();
                                }
                                using (var update = new SQLiteCommand("UPDATE categories SET updated_at = created_at WHERE updated_at IS NULL;", conn, trans))
                                {
                                    update.ExecuteNonQuery();
                                }
                            }

                            using (var idxCmd = new SQLiteCommand(@"
                                CREATE INDEX IF NOT EXISTS idx_categories_display_order ON categories(display_order);
                                CREATE INDEX IF NOT EXISTS idx_categories_is_active ON categories(is_active);
                            ", conn, trans))
                            {
                                idxCmd.ExecuteNonQuery();
                            }

                            // Ensure default categories exist if table is empty
                            using (var countCmd = new SQLiteCommand("SELECT COUNT(*) FROM categories;", conn, trans))
                            {
                                long count = Convert.ToInt64(countCmd.ExecuteScalar());
                                if (count == 0)
                                {
                                    using (var seedCmd = new SQLiteCommand(@"
                                        INSERT OR IGNORE INTO categories (id, name, display_order, is_active, created_at, updated_at) VALUES
                                        ('cat_general', 'عام / متنوع', 0, 1, datetime('now'), datetime('now')),
                                        ('cat_dairy', 'ألبان وأجبان', 1, 1, datetime('now'), datetime('now')),
                                        ('cat_beverages', 'مشروبات وعصائر', 2, 1, datetime('now'), datetime('now')),
                                        ('cat_groceries', 'بقوليات ومعلبات', 3, 1, datetime('now'), datetime('now')),
                                        ('cat_snacks', 'حلويات ومقرمشات', 4, 1, datetime('now'), datetime('now')),
                                        ('cat_cleaning', 'منظفات وعناية شخصية', 5, 1, datetime('now'), datetime('now'));
                                    ", conn, trans))
                                    {
                                        seedCmd.ExecuteNonQuery();
                                    }
                                }
                            }
                        }
                    }

                    // 2. Health check for products table
                    using (var checkProdCmd = new SQLiteCommand("SELECT name FROM sqlite_master WHERE type='table' AND name='products';", conn, trans))
                    {
                        var tbl = checkProdCmd.ExecuteScalar();
                        if (tbl != null)
                        {
                            var existingCols = new System.Collections.Generic.HashSet<string>(StringComparer.OrdinalIgnoreCase);
                            using (var infoCmd = new SQLiteCommand("PRAGMA table_info(products);", conn, trans))
                            using (var reader = infoCmd.ExecuteReader())
                            {
                                while (reader.Read())
                                {
                                    existingCols.Add(reader["name"].ToString());
                                }
                            }

                            if (!existingCols.Contains("category_id"))
                            {
                                using (var alter = new SQLiteCommand("ALTER TABLE products ADD COLUMN category_id TEXT DEFAULT 'cat_general';", conn, trans))
                                {
                                    alter.ExecuteNonQuery();
                                }
                            }

                            if (!existingCols.Contains("unit"))
                            {
                                using (var alter = new SQLiteCommand("ALTER TABLE products ADD COLUMN unit TEXT NOT NULL DEFAULT 'piece';", conn, trans))
                                {
                                    alter.ExecuteNonQuery();
                                }
                            }

                            if (!existingCols.Contains("tax_rate_percent"))
                            {
                                using (var alter = new SQLiteCommand("ALTER TABLE products ADD COLUMN tax_rate_percent INTEGER NOT NULL DEFAULT 0;", conn, trans))
                                {
                                    alter.ExecuteNonQuery();
                                }
                            }

                            if (!existingCols.Contains("is_active"))
                            {
                                using (var alter = new SQLiteCommand("ALTER TABLE products ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;", conn, trans))
                                {
                                    alter.ExecuteNonQuery();
                                }
                            }

                            if (!existingCols.Contains("tax_category_code"))
                            {
                                using (var alter = new SQLiteCommand("ALTER TABLE products ADD COLUMN tax_category_code TEXT DEFAULT '';", conn, trans))
                                {
                                    alter.ExecuteNonQuery();
                                }
                            }

                            if (!existingCols.Contains("internal_code"))
                            {
                                using (var alter = new SQLiteCommand("ALTER TABLE products ADD COLUMN internal_code TEXT DEFAULT '';", conn, trans))
                                {
                                    alter.ExecuteNonQuery();
                                }
                            }

                            if (!existingCols.Contains("min_stock_milli"))
                            {
                                using (var alter = new SQLiteCommand("ALTER TABLE products ADD COLUMN min_stock_milli INTEGER NOT NULL DEFAULT 5000;", conn, trans))
                                {
                                    alter.ExecuteNonQuery();
                                }
                            }

                            if (!existingCols.Contains("stock_quantity_milli"))
                            {
                                using (var alter = new SQLiteCommand("ALTER TABLE products ADD COLUMN stock_quantity_milli INTEGER NOT NULL DEFAULT 0;", conn, trans))
                                {
                                    alter.ExecuteNonQuery();
                                }

                                if (existingCols.Contains("stock_quantity"))
                                {
                                    using (var syncStock = new SQLiteCommand("UPDATE products SET stock_quantity_milli = stock_quantity * 1000 WHERE stock_quantity > 0;", conn, trans))
                                    {
                                        syncStock.ExecuteNonQuery();
                                    }
                                }
                            }

                            if (!existingCols.Contains("updated_at"))
                            {
                                using (var alter = new SQLiteCommand("ALTER TABLE products ADD COLUMN updated_at TEXT;", conn, trans))
                                {
                                    alter.ExecuteNonQuery();
                                }
                                using (var syncDate = new SQLiteCommand("UPDATE products SET updated_at = created_at WHERE updated_at IS NULL;", conn, trans))
                                {
                                    syncDate.ExecuteNonQuery();
                                }
                            }

                            if (!existingCols.Contains("needs_review"))
                            {
                                using (var alter = new SQLiteCommand("ALTER TABLE products ADD COLUMN needs_review INTEGER NOT NULL DEFAULT 0;", conn, trans))
                                {
                                    alter.ExecuteNonQuery();
                                }
                                using (var idx = new SQLiteCommand("CREATE INDEX IF NOT EXISTS idx_products_needs_review ON products(needs_review);", conn, trans))
                                {
                                    idx.ExecuteNonQuery();
                                }
                            }

                            if (!existingCols.Contains("normalized_name"))
                            {
                                using (var alter = new SQLiteCommand("ALTER TABLE products ADD COLUMN normalized_name TEXT DEFAULT '';", conn, trans))
                                {
                                    alter.ExecuteNonQuery();
                                }
                            }

                            // Ensure indexes for products
                            using (var idxCmd = new SQLiteCommand(@"
                                CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);
                                CREATE INDEX IF NOT EXISTS idx_products_is_active ON products(is_active);
                                CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
                                CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
                                CREATE INDEX IF NOT EXISTS idx_products_normalized_name ON products(normalized_name);
                            ", conn, trans))
                            {
                                idxCmd.ExecuteNonQuery();
                            }

                            // Populate any missing normalized_name
                            var unnormalized = new System.Collections.Generic.List<System.Collections.Generic.KeyValuePair<string, string>>();
                            using (var missingCmd = new SQLiteCommand("SELECT id, name FROM products WHERE (normalized_name IS NULL OR normalized_name = '') AND name IS NOT NULL AND name != '';", conn, trans))
                            using (var rdr = missingCmd.ExecuteReader())
                            {
                                while (rdr.Read())
                                {
                                    unnormalized.Add(new System.Collections.Generic.KeyValuePair<string, string>(rdr["id"].ToString(), rdr["name"].ToString()));
                                }
                            }
                            if (unnormalized.Count > 0)
                            {
                                using (var upCmd = new SQLiteCommand("UPDATE products SET normalized_name = @norm WHERE id = @id;", conn, trans))
                                {
                                    var pId = upCmd.Parameters.Add("@id", System.Data.DbType.String);
                                    var pNorm = upCmd.Parameters.Add("@norm", System.Data.DbType.String);
                                    foreach (var item in unnormalized)
                                    {
                                        pId.Value = item.Key;
                                        pNorm.Value = Common.ArabicTextNormalizer.Normalize(item.Value);
                                        upCmd.ExecuteNonQuery();
                                    }
                                }
                            }
                        }
                    }

                    // 3. Health check for sales table
                    using (var checkSalesCmd = new SQLiteCommand("SELECT name FROM sqlite_master WHERE type='table' AND name='sales';", conn, trans))
                    {
                        var tbl = checkSalesCmd.ExecuteScalar();
                        if (tbl != null)
                        {
                            var existingCols = new System.Collections.Generic.HashSet<string>(StringComparer.OrdinalIgnoreCase);
                            using (var infoCmd = new SQLiteCommand("PRAGMA table_info(sales);", conn, trans))
                            using (var reader = infoCmd.ExecuteReader())
                            {
                                while (reader.Read())
                                {
                                    existingCols.Add(reader["name"].ToString());
                                }
                            }

                            if (!existingCols.Contains("status"))
                            {
                                using (var alter = new SQLiteCommand("ALTER TABLE sales ADD COLUMN status TEXT NOT NULL DEFAULT 'completed';", conn, trans))
                                {
                                    alter.ExecuteNonQuery();
                                }
                            }

                            if (!existingCols.Contains("customer_id"))
                            {
                                using (var alter = new SQLiteCommand("ALTER TABLE sales ADD COLUMN customer_id TEXT;", conn, trans))
                                {
                                    alter.ExecuteNonQuery();
                                }
                            }

                            if (!existingCols.Contains("change_piasters"))
                            {
                                using (var alter = new SQLiteCommand("ALTER TABLE sales ADD COLUMN change_piasters INTEGER NOT NULL DEFAULT 0;", conn, trans))
                                {
                                    alter.ExecuteNonQuery();
                                }
                            }

                            if (!existingCols.Contains("subtotal_piasters"))
                            {
                                using (var alter = new SQLiteCommand("ALTER TABLE sales ADD COLUMN subtotal_piasters INTEGER NOT NULL DEFAULT 0;", conn, trans))
                                {
                                    alter.ExecuteNonQuery();
                                }
                                using (var sync = new SQLiteCommand("UPDATE sales SET subtotal_piasters = total_piasters WHERE subtotal_piasters = 0;", conn, trans))
                                {
                                    sync.ExecuteNonQuery();
                                }
                            }

                            if (!existingCols.Contains("discount_piasters"))
                            {
                                using (var alter = new SQLiteCommand("ALTER TABLE sales ADD COLUMN discount_piasters INTEGER NOT NULL DEFAULT 0;", conn, trans))
                                {
                                    alter.ExecuteNonQuery();
                                }
                            }

                            if (!existingCols.Contains("tax_piasters"))
                            {
                                using (var alter = new SQLiteCommand("ALTER TABLE sales ADD COLUMN tax_piasters INTEGER NOT NULL DEFAULT 0;", conn, trans))
                                {
                                    alter.ExecuteNonQuery();
                                }
                            }

                            if (!existingCols.Contains("payment_method"))
                            {
                                using (var alter = new SQLiteCommand("ALTER TABLE sales ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'cash';", conn, trans))
                                {
                                    alter.ExecuteNonQuery();
                                }
                            }

                            if (!existingCols.Contains("cashier_id"))
                            {
                                using (var alter = new SQLiteCommand("ALTER TABLE sales ADD COLUMN cashier_id TEXT DEFAULT 'usr_admin_default';", conn, trans))
                                {
                                    alter.ExecuteNonQuery();
                                }
                            }

                            if (!existingCols.Contains("notes"))
                            {
                                using (var alter = new SQLiteCommand("ALTER TABLE sales ADD COLUMN notes TEXT DEFAULT '';", conn, trans))
                                {
                                    alter.ExecuteNonQuery();
                                }
                            }

                            if (!existingCols.Contains("is_deleted"))
                            {
                                using (var alter = new SQLiteCommand("ALTER TABLE sales ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0;", conn, trans))
                                {
                                    alter.ExecuteNonQuery();
                                }
                            }
                        }
                    }

                    // 4. Health check for sale_items table
                    using (var checkItemsCmd = new SQLiteCommand("SELECT name FROM sqlite_master WHERE type='table' AND name='sale_items';", conn, trans))
                    {
                        var tbl = checkItemsCmd.ExecuteScalar();
                        if (tbl != null)
                        {
                            var existingCols = new System.Collections.Generic.HashSet<string>(StringComparer.OrdinalIgnoreCase);
                            using (var infoCmd = new SQLiteCommand("PRAGMA table_info(sale_items);", conn, trans))
                            using (var reader = infoCmd.ExecuteReader())
                            {
                                while (reader.Read())
                                {
                                    existingCols.Add(reader["name"].ToString());
                                }
                            }

                            if (!existingCols.Contains("quantity_milli"))
                            {
                                using (var alter = new SQLiteCommand("ALTER TABLE sale_items ADD COLUMN quantity_milli INTEGER DEFAULT 0;", conn, trans))
                                {
                                    alter.ExecuteNonQuery();
                                }

                                if (existingCols.Contains("quantity"))
                                {
                                    using (var sync = new SQLiteCommand("UPDATE sale_items SET quantity_milli = quantity * 1000 WHERE quantity > 0;", conn, trans))
                                    {
                                        sync.ExecuteNonQuery();
                                    }
                                }
                            }

                            // Clean up legacy 'quantity' column to prevent NOT NULL constraint failures (Feature #1 / Senior Rule #1)
                            if (existingCols.Contains("quantity"))
                            {
                                try
                                {
                                    using (var dropCol = new SQLiteCommand("ALTER TABLE sale_items DROP COLUMN quantity;", conn, trans))
                                    {
                                        dropCol.ExecuteNonQuery();
                                    }
                                }
                                catch
                                {
                                    // Non-blocking fallback for older SQLite engines
                                }
                            }

                            if (!existingCols.Contains("unit_cost_piasters"))
                            {
                                using (var alter = new SQLiteCommand("ALTER TABLE sale_items ADD COLUMN unit_cost_piasters INTEGER NOT NULL DEFAULT 0;", conn, trans))
                                {
                                    alter.ExecuteNonQuery();
                                }
                            }

                            if (!existingCols.Contains("total_piasters"))
                            {
                                using (var alter = new SQLiteCommand("ALTER TABLE sale_items ADD COLUMN total_piasters INTEGER NOT NULL DEFAULT 0;", conn, trans))
                                {
                                    alter.ExecuteNonQuery();
                                }
                                using (var sync = new SQLiteCommand("UPDATE sale_items SET total_piasters = (quantity_milli * unit_price_piasters) / 1000 WHERE total_piasters = 0;", conn, trans))
                                {
                                    sync.ExecuteNonQuery();
                                }
                            }

                            if (!existingCols.Contains("discount_piasters"))
                            {
                                using (var alter = new SQLiteCommand("ALTER TABLE sale_items ADD COLUMN discount_piasters INTEGER NOT NULL DEFAULT 0;", conn, trans))
                                {
                                    alter.ExecuteNonQuery();
                                }
                            }

                            if (!existingCols.Contains("product_name"))
                            {
                                using (var alter = new SQLiteCommand("ALTER TABLE sale_items ADD COLUMN product_name TEXT DEFAULT '';", conn, trans))
                                {
                                    alter.ExecuteNonQuery();
                                }
                            }

                            if (!existingCols.Contains("barcode"))
                            {
                                using (var alter = new SQLiteCommand("ALTER TABLE sale_items ADD COLUMN barcode TEXT DEFAULT '';", conn, trans))
                                {
                                    alter.ExecuteNonQuery();
                                }
                                if (existingCols.Contains("product_barcode"))
                                {
                                    using (var sync = new SQLiteCommand("UPDATE sale_items SET barcode = product_barcode WHERE (barcode IS NULL OR barcode = '') AND product_barcode IS NOT NULL AND product_barcode != '';", conn, trans))
                                    {
                                        sync.ExecuteNonQuery();
                                    }
                                }
                            }

                            if (!existingCols.Contains("product_barcode"))
                            {
                                using (var alter = new SQLiteCommand("ALTER TABLE sale_items ADD COLUMN product_barcode TEXT DEFAULT '';", conn, trans))
                                {
                                    alter.ExecuteNonQuery();
                                }
                                if (existingCols.Contains("barcode"))
                                {
                                    using (var sync = new SQLiteCommand("UPDATE sale_items SET product_barcode = barcode WHERE (product_barcode IS NULL OR product_barcode = '') AND barcode IS NOT NULL AND barcode != '';", conn, trans))
                                    {
                                        sync.ExecuteNonQuery();
                                    }
                                }
                            }

                            if (!existingCols.Contains("unit"))
                            {
                                using (var alter = new SQLiteCommand("ALTER TABLE sale_items ADD COLUMN unit TEXT DEFAULT 'piece';", conn, trans))
                                {
                                    alter.ExecuteNonQuery();
                                }
                            }

                            if (!existingCols.Contains("tax_rate_percent"))
                            {
                                using (var alter = new SQLiteCommand("ALTER TABLE sale_items ADD COLUMN tax_rate_percent INTEGER DEFAULT 0;", conn, trans))
                                {
                                    alter.ExecuteNonQuery();
                                }
                            }

                            if (!existingCols.Contains("tax_piasters"))
                            {
                                using (var alter = new SQLiteCommand("ALTER TABLE sale_items ADD COLUMN tax_piasters INTEGER DEFAULT 0;", conn, trans))
                                {
                                    alter.ExecuteNonQuery();
                                }
                            }
                        }
                    }

                    // 6. Health check for stock_movements table (Feature #35)
                    using (var checkSmCmd = new SQLiteCommand("SELECT name FROM sqlite_master WHERE type='table' AND name='stock_movements';", conn, trans))
                    {
                        var tbl = checkSmCmd.ExecuteScalar();
                        if (tbl == null)
                        {
                            using (var createCmd = new SQLiteCommand(@"
                                CREATE TABLE IF NOT EXISTS stock_movements (
                                    id TEXT PRIMARY KEY,
                                    product_id TEXT NOT NULL,
                                    movement_type TEXT NOT NULL,
                                    quantity_milli INTEGER NOT NULL,
                                    reference_id TEXT,
                                    reference_type TEXT,
                                    unit_cost_piasters INTEGER NOT NULL,
                                    note TEXT,
                                    batch_number TEXT,
                                    created_at TEXT NOT NULL,
                                    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
                                );

                                CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id);
                                CREATE INDEX IF NOT EXISTS idx_stock_movements_created_at ON stock_movements(created_at);
                                CREATE INDEX IF NOT EXISTS idx_stock_movements_type ON stock_movements(movement_type);
                                CREATE INDEX IF NOT EXISTS idx_stock_movements_ref ON stock_movements(reference_id);
                            ", conn, trans))
                            {
                                createCmd.ExecuteNonQuery();
                            }
                        }
                    }

                    // 12. Ensure counters table exists and initialized (Task 107-1)
                    using (var checkCounterCmd = new SQLiteCommand(@"
                        CREATE TABLE IF NOT EXISTS counters (
                            name TEXT PRIMARY KEY,
                            current_value INTEGER NOT NULL,
                            updated_at TEXT NOT NULL
                        );
                        INSERT OR IGNORE INTO counters (name, current_value, updated_at)
                        VALUES ('invoice_number', COALESCE((SELECT MAX(invoice_number) FROM sales), 0), datetime('now'));
                    ", conn, trans))
                    {
                        checkCounterCmd.ExecuteNonQuery();
                    }

                    // 13. Ensure Enterprise High-Performance Covering Indexes exist (Feature #129 / Task 129-3)
                    using (var idxCmd = new SQLiteCommand(@"
                        CREATE INDEX IF NOT EXISTS idx_stock_movements_covering ON stock_movements(product_id, quantity_milli);
                        CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(status);
                        CREATE INDEX IF NOT EXISTS idx_sales_customer_id ON sales(customer_id);
                        CREATE INDEX IF NOT EXISTS idx_sales_payment_method ON sales(payment_method);
                        CREATE INDEX IF NOT EXISTS idx_sale_items_product_id ON sale_items(product_id);
                        CREATE INDEX IF NOT EXISTS idx_product_barcodes_covering ON product_barcodes(barcode, product_id);
                    ", conn, trans))
                    {
                        idxCmd.ExecuteNonQuery();
                    }

                    // 14. Ensure product_units table and sale_items unit columns exist (Feature #161 / Tasks 161-1 & 161-2)
                    using (var checkPuCmd = new SQLiteCommand(@"
                        CREATE TABLE IF NOT EXISTS product_units (
                            id TEXT PRIMARY KEY,
                            product_id TEXT NOT NULL,
                            unit_name TEXT NOT NULL,
                            conversion_factor INTEGER NOT NULL CHECK (conversion_factor > 0),
                            is_base_unit INTEGER NOT NULL DEFAULT 0 CHECK (is_base_unit IN (0, 1)),
                            sell_price_piasters INTEGER NOT NULL DEFAULT 0 CHECK (sell_price_piasters >= 0),
                            cost_price_piasters INTEGER NOT NULL DEFAULT 0 CHECK (cost_price_piasters >= 0),
                            barcode TEXT COLLATE NOCASE,
                            is_divisible INTEGER NOT NULL DEFAULT 0 CHECK (is_divisible IN (0, 1)),
                            sort_order INTEGER NOT NULL DEFAULT 0,
                            created_at TEXT NOT NULL,
                            updated_at TEXT NOT NULL,
                            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
                            UNIQUE(product_id, unit_name)
                        );
                        CREATE INDEX IF NOT EXISTS idx_product_units_product_id ON product_units(product_id);
                        CREATE INDEX IF NOT EXISTS idx_product_units_base ON product_units(product_id, is_base_unit);
                        CREATE INDEX IF NOT EXISTS idx_product_units_barcode ON product_units(barcode);
                    ", conn, trans))
                    {
                        checkPuCmd.ExecuteNonQuery();
                    }

                    // Check sale_items columns for unit support
                    using (var infoCmd = new SQLiteCommand("PRAGMA table_info(sale_items);", conn, trans))
                    {
                        var siCols = new System.Collections.Generic.HashSet<string>(StringComparer.OrdinalIgnoreCase);
                        using (var r = infoCmd.ExecuteReader())
                        {
                            while (r.Read())
                            {
                                siCols.Add(r["name"].ToString());
                            }
                        }

                        if (!siCols.Contains("unit_id"))
                        {
                            using (var alter = new SQLiteCommand("ALTER TABLE sale_items ADD COLUMN unit_id TEXT;", conn, trans))
                            {
                                alter.ExecuteNonQuery();
                            }
                        }
                        if (!siCols.Contains("unit_name"))
                        {
                            using (var alter = new SQLiteCommand("ALTER TABLE sale_items ADD COLUMN unit_name TEXT;", conn, trans))
                            {
                                alter.ExecuteNonQuery();
                            }
                        }
                        if (!siCols.Contains("conversion_factor"))
                        {
                            using (var alter = new SQLiteCommand("ALTER TABLE sale_items ADD COLUMN conversion_factor INTEGER DEFAULT 1;", conn, trans))
                            {
                                alter.ExecuteNonQuery();
                            }
                        }
                    }

                    // 10. Health check for users table (Feature #166)
                    using (var checkUsersCmd = new SQLiteCommand("SELECT name FROM sqlite_master WHERE type='table' AND name='users';", conn, trans))
                    {
                        var tbl = checkUsersCmd.ExecuteScalar();
                        if (tbl != null)
                        {
                            var uCols = new System.Collections.Generic.HashSet<string>(StringComparer.OrdinalIgnoreCase);
                            using (var infoCmd = new SQLiteCommand("PRAGMA table_info(users);", conn, trans))
                            using (var reader = infoCmd.ExecuteReader())
                            {
                                while (reader.Read())
                                {
                                    uCols.Add(reader["name"].ToString());
                                }
                            }

                            if (!uCols.Contains("pin_salt"))
                            {
                                using (var alter = new SQLiteCommand("ALTER TABLE users ADD COLUMN pin_salt TEXT DEFAULT '';", conn, trans))
                                {
                                    alter.ExecuteNonQuery();
                                }
                            }
                            if (!uCols.Contains("failed_attempts"))
                            {
                                using (var alter = new SQLiteCommand("ALTER TABLE users ADD COLUMN failed_attempts INTEGER NOT NULL DEFAULT 0;", conn, trans))
                                {
                                    alter.ExecuteNonQuery();
                                }
                            }
                            if (!uCols.Contains("lockout_until"))
                            {
                                using (var alter = new SQLiteCommand("ALTER TABLE users ADD COLUMN lockout_until TEXT;", conn, trans))
                                {
                                    alter.ExecuteNonQuery();
                                }
                            }
                            if (!uCols.Contains("permissions_json"))
                            {
                                using (var alter = new SQLiteCommand("ALTER TABLE users ADD COLUMN permissions_json TEXT;", conn, trans))
                                {
                                    alter.ExecuteNonQuery();
                                }
                            }
                            if (!uCols.Contains("updated_at"))
                            {
                                using (var alter = new SQLiteCommand("ALTER TABLE users ADD COLUMN updated_at TEXT;", conn, trans))
                                {
                                    alter.ExecuteNonQuery();
                                }
                            }
                            if (!uCols.Contains("last_login_at"))
                            {
                                using (var alter = new SQLiteCommand("ALTER TABLE users ADD COLUMN last_login_at TEXT;", conn, trans))
                                {
                                    alter.ExecuteNonQuery();
                                }
                            }

                            using (var idxCmd = new SQLiteCommand(@"
                                CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
                                CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
                                CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);
                            ", conn, trans))
                            {
                                idxCmd.ExecuteNonQuery();
                            }
                        }
                    }

                    // 12. Health check for audit_logs table (Feature #169)
                    using (var checkAudCmd = new SQLiteCommand("SELECT name FROM sqlite_master WHERE type='table' AND name='audit_logs';", conn, trans))
                    {
                        var tbl = checkAudCmd.ExecuteScalar();
                        if (tbl != null)
                        {
                            var aCols = new System.Collections.Generic.HashSet<string>(StringComparer.OrdinalIgnoreCase);
                            using (var infoCmd = new SQLiteCommand("PRAGMA table_info(audit_logs);", conn, trans))
                            using (var reader = infoCmd.ExecuteReader())
                            {
                                while (reader.Read())
                                {
                                    aCols.Add(reader["name"].ToString());
                                }
                            }

                            if (!aCols.Contains("prev_hash"))
                            {
                                using (var alter = new SQLiteCommand("ALTER TABLE audit_logs ADD COLUMN prev_hash TEXT DEFAULT '';", conn, trans))
                                {
                                    alter.ExecuteNonQuery();
                                }
                            }
                            if (!aCols.Contains("record_hash"))
                            {
                                using (var alter = new SQLiteCommand("ALTER TABLE audit_logs ADD COLUMN record_hash TEXT DEFAULT '';", conn, trans))
                                {
                                    alter.ExecuteNonQuery();
                                }
                            }
                        }
                    }

                    trans.Commit();
                }
                catch
                {
                    trans.Rollback();
                    throw;
                }
            }
        }

        private static void BackupDatabaseBeforeMigration(string dbPath)
        {
            try
            {
                if (File.Exists(dbPath))
                {
                    string backupDir = Path.Combine(Path.GetDirectoryName(dbPath), "backups");
                    if (!Directory.Exists(backupDir))
                    {
                        Directory.CreateDirectory(backupDir);
                    }

                    string timestamp = DateTime.UtcNow.ToString("yyyyMMdd_HHmmss");
                    string backupFile = Path.Combine(backupDir, string.Format("pre_migration_{0}.db", timestamp));
                    File.Copy(dbPath, backupFile, true);
                }
            }
            catch
            {
                // Silently continue if fresh DB
            }
        }

        private static void ApplyMigration1(SQLiteConnection conn)
        {
            using (var trans = conn.BeginTransaction())
            {
                try
                {
                    string sql = @"
                        -- جدول الإعدادات العامة للنظام
                        CREATE TABLE IF NOT EXISTS app_settings (
                            key TEXT PRIMARY KEY,
                            value TEXT NOT NULL,
                            updated_at TEXT NOT NULL
                        );

                        -- جدول المستخدمين مع مالك افتراضي (Admin)
                        CREATE TABLE IF NOT EXISTS users (
                            id TEXT PRIMARY KEY,
                            username TEXT UNIQUE NOT NULL,
                            display_name TEXT NOT NULL,
                            pin_code_hash TEXT NOT NULL,
                            role TEXT NOT NULL,
                            is_active INTEGER NOT NULL DEFAULT 1,
                            created_at TEXT NOT NULL
                        );

                        -- جدول أقسام وتصنيفات السلع
                        CREATE TABLE IF NOT EXISTS categories (
                            id TEXT PRIMARY KEY,
                            name TEXT NOT NULL,
                            display_order INTEGER NOT NULL DEFAULT 0,
                            is_active INTEGER NOT NULL DEFAULT 1,
                            created_at TEXT NOT NULL,
                            updated_at TEXT NOT NULL
                        );

                        -- جدول المنتجات والسلع
                        CREATE TABLE IF NOT EXISTS products (
                            id TEXT PRIMARY KEY,
                            barcode TEXT UNIQUE,
                            name TEXT NOT NULL,
                            category_id TEXT,
                            price_piasters INTEGER NOT NULL,
                            cost_piasters INTEGER NOT NULL,
                            stock_quantity_milli INTEGER NOT NULL DEFAULT 0,
                            unit TEXT NOT NULL DEFAULT 'piece',
                            tax_rate_percent INTEGER NOT NULL DEFAULT 0,
                            is_active INTEGER NOT NULL DEFAULT 1,
                            created_at TEXT NOT NULL,
                            updated_at TEXT NOT NULL,
                            FOREIGN KEY (category_id) REFERENCES categories(id)
                        );

                        -- فهارس البحث السريع للأصناف
                        CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
                        CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);

                        -- جدول العملاء والحسابات الآجلة
                        CREATE TABLE IF NOT EXISTS customers (
                            id TEXT PRIMARY KEY,
                            name TEXT NOT NULL,
                            phone TEXT,
                            balance_piasters INTEGER NOT NULL DEFAULT 0,
                            credit_limit_piasters INTEGER NOT NULL DEFAULT 0,
                            created_at TEXT NOT NULL
                        );

                        CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);

                        -- جدول فواتير المبيعات
                        CREATE TABLE IF NOT EXISTS sales (
                            id TEXT PRIMARY KEY,
                            invoice_number INTEGER NOT NULL,
                            cashier_id TEXT,
                            customer_id TEXT,
                            subtotal_piasters INTEGER NOT NULL,
                            discount_piasters INTEGER NOT NULL DEFAULT 0,
                            tax_piasters INTEGER NOT NULL DEFAULT 0,
                            total_piasters INTEGER NOT NULL,
                            paid_piasters INTEGER NOT NULL,
                            payment_method TEXT NOT NULL DEFAULT 'cash',
                            status TEXT NOT NULL DEFAULT 'completed',
                            notes TEXT,
                            created_at TEXT NOT NULL,
                            FOREIGN KEY (cashier_id) REFERENCES users(id),
                            FOREIGN KEY (customer_id) REFERENCES customers(id)
                        );

                        CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_invoice_number ON sales(invoice_number);
                        CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at);

                        -- جدول بنود تفاصيل الفاتورة
                        CREATE TABLE IF NOT EXISTS sale_items (
                            id TEXT PRIMARY KEY,
                            sale_id TEXT NOT NULL,
                            product_id TEXT NOT NULL,
                            product_name TEXT NOT NULL,
                            barcode TEXT,
                            quantity_milli INTEGER NOT NULL,
                            unit_price_piasters INTEGER NOT NULL,
                            unit_cost_piasters INTEGER NOT NULL,
                            discount_piasters INTEGER NOT NULL DEFAULT 0,
                            total_piasters INTEGER NOT NULL,
                            tax_piasters INTEGER NOT NULL DEFAULT 0,
                            FOREIGN KEY (sale_id) REFERENCES sales(id)
                        );

                        CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON sale_items(sale_id);

                        -- جدول المدفوعات المنفصلة
                        CREATE TABLE IF NOT EXISTS payments (
                            id TEXT PRIMARY KEY,
                            sale_id TEXT NOT NULL,
                            amount_piasters INTEGER NOT NULL,
                            method TEXT NOT NULL DEFAULT 'cash',
                            created_at TEXT NOT NULL,
                            FOREIGN KEY (sale_id) REFERENCES sales(id)
                        );

                        -- جدول سجل العمليات الحساسة (Audit Log)
                        CREATE TABLE IF NOT EXISTS audit_logs (
                            id TEXT PRIMARY KEY,
                            user_id TEXT,
                            action TEXT NOT NULL,
                            entity_type TEXT NOT NULL,
                            entity_id TEXT NOT NULL,
                            details_json TEXT,
                            created_at TEXT NOT NULL
                        );

                        -- بذر البيانات الأولية (Default Seed Data)
                        INSERT OR IGNORE INTO app_settings (key, value, updated_at)
                        VALUES ('store_name', 'سوبرماركت رفيق', datetime('now')),
                               ('receipt_header', 'أهلاً بكم في سوبرماركت رفيق', datetime('now')),
                               ('receipt_footer', 'شكراً لزيارتكم! البضاعة المباعة ترد وتستبدل خلال 14 يوم', datetime('now')),
                               ('currency_symbol', 'ج.م', datetime('now'));

                        -- مستخدم المالك الافتراضي (رمز الدخول السريع: 1234)
                        INSERT OR IGNORE INTO users (id, username, display_name, pin_code_hash, role, is_active, created_at)
                        VALUES ('usr_admin_default', 'admin', 'مدير النظام', '1234', 'owner', 1, datetime('now'));

                        -- تسجيل إصدار الهيكل رقم 1
                        INSERT OR REPLACE INTO schema_migrations (version, name, applied_at)
                        VALUES (1, 'initial_enterprise_pos_schema', datetime('now'));
                    ";

                    using (var cmd = new SQLiteCommand(sql, conn, trans))
                    {
                        cmd.ExecuteNonQuery();
                    }

                    trans.Commit();
                }
                catch
                {
                    trans.Rollback();
                    throw;
                }
            }
        }

        private static void ApplyMigration2(SQLiteConnection conn)
        {
            using (var trans = conn.BeginTransaction())
            {
                try
                {
                    string sql = @"
                        -- جدول كشف حساب العميل والآجل (Customer Debt Ledger)
                        CREATE TABLE IF NOT EXISTS customer_ledger (
                            id TEXT PRIMARY KEY,
                            customer_id TEXT NOT NULL,
                            type TEXT NOT NULL, -- 'sale', 'payment', 'opening_balance'
                            sale_id TEXT,
                            amount_piasters INTEGER NOT NULL,
                            balance_after_piasters INTEGER NOT NULL,
                            notes TEXT,
                            created_at TEXT NOT NULL,
                            FOREIGN KEY (customer_id) REFERENCES customers(id)
                        );

                        CREATE INDEX IF NOT EXISTS idx_customer_ledger_customer ON customer_ledger(customer_id);
                        CREATE INDEX IF NOT EXISTS idx_customer_ledger_created ON customer_ledger(created_at);

                        -- بذر عملاء تجريبيين أوليين للآجل والبيع
                        INSERT OR IGNORE INTO customers (id, name, phone, balance_piasters, credit_limit_piasters, created_at)
                        VALUES ('cust_general_cash', 'عميل نقدي عام', '', 0, 0, datetime('now')),
                               ('cust_demo_1', 'أحمد محمود (عميل آجل)', '01012345678', 35000, 200000, datetime('now')),
                               ('cust_demo_2', 'سارة إبراهيم', '01198765432', 0, 100000, datetime('now'));

                        -- رصيد افتتاحي للعميل التجريبي
                        INSERT OR IGNORE INTO customer_ledger (id, customer_id, type, sale_id, amount_piasters, balance_after_piasters, notes, created_at)
                        VALUES ('led_seed_demo_1', 'cust_demo_1', 'opening_balance', NULL, 35000, 35000, 'رصيد آجل سابق', datetime('now'));

                        -- تسجيل إصدار الهيكل رقم 2
                        INSERT OR REPLACE INTO schema_migrations (version, name, applied_at)
                        VALUES (2, 'customer_ledger_and_debts', datetime('now'));
                    ";

                    using (var cmd = new SQLiteCommand(sql, conn, trans))
                    {
                        cmd.ExecuteNonQuery();
                    }

                    trans.Commit();
                }
                catch
                {
                    trans.Rollback();
                    throw;
                }
            }
        }

        private static void ApplyMigration3(SQLiteConnection conn)
        {
            using (var trans = conn.BeginTransaction())
            {
                try
                {
                    // Check and add tax_category_code and internal_code to products safely
                    using (var cmd = new SQLiteCommand("PRAGMA table_info(products);", conn, trans))
                    {
                        var existingCols = new System.Collections.Generic.HashSet<string>(StringComparer.OrdinalIgnoreCase);
                        using (var reader = cmd.ExecuteReader())
                        {
                            while (reader.Read())
                            {
                                existingCols.Add(reader["name"].ToString());
                            }
                        }

                        if (!existingCols.Contains("tax_category_code"))
                        {
                            using (var alterCmd = new SQLiteCommand("ALTER TABLE products ADD COLUMN tax_category_code TEXT DEFAULT '';", conn, trans))
                            {
                                alterCmd.ExecuteNonQuery();
                            }
                        }

                        if (!existingCols.Contains("internal_code"))
                        {
                            using (var alterCmd = new SQLiteCommand("ALTER TABLE products ADD COLUMN internal_code TEXT DEFAULT '';", conn, trans))
                            {
                                alterCmd.ExecuteNonQuery();
                            }
                        }
                    }

                    // Seed default tax settings in app_settings (Egyptian retail standard)
                    string sqlSettings = @"
                        INSERT OR IGNORE INTO app_settings (key, value, updated_at)
                        VALUES ('tax_enabled', '0', datetime('now')),
                               ('prices_include_tax', '1', datetime('now')),
                               ('default_tax_rate_percent', '0', datetime('now')),
                               ('tax_registration_number', '', datetime('now'));

                        INSERT OR REPLACE INTO schema_migrations (version, name, applied_at)
                        VALUES (3, 'tax_fields_and_eta_readiness', datetime('now'));
                    ";

                    using (var cmd = new SQLiteCommand(sqlSettings, conn, trans))
                    {
                        cmd.ExecuteNonQuery();
                    }

                    trans.Commit();
                }
                catch
                {
                    trans.Rollback();
                    throw;
                }
            }
        }

        private static void ApplyMigration4(SQLiteConnection conn)
        {
            using (var trans = conn.BeginTransaction())
            {
                try
                {
                    string sql = @"
                        CREATE TABLE IF NOT EXISTS product_barcodes (
                            id TEXT PRIMARY KEY,
                            product_id TEXT NOT NULL,
                            barcode TEXT NOT NULL COLLATE NOCASE,
                            created_at TEXT NOT NULL,
                            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
                        );

                        CREATE UNIQUE INDEX IF NOT EXISTS idx_product_barcodes_barcode ON product_barcodes(barcode);
                        CREATE INDEX IF NOT EXISTS idx_product_barcodes_product_id ON product_barcodes(product_id);

                        -- Seed existing product primary barcodes into product_barcodes table
                        INSERT OR IGNORE INTO product_barcodes (id, product_id, barcode, created_at)
                        SELECT 'pb_' || id, id, barcode, datetime('now')
                        FROM products
                        WHERE barcode IS NOT NULL AND TRIM(barcode) != '';

                        INSERT OR REPLACE INTO schema_migrations (version, name, applied_at)
                        VALUES (4, 'multiple_product_barcodes', datetime('now'));
                    ";

                    using (var cmd = new SQLiteCommand(sql, conn, trans))
                    {
                        cmd.ExecuteNonQuery();
                    }

                    trans.Commit();
                }
                catch
                {
                    trans.Rollback();
                    throw;
                }
            }
        }

        private static void ApplyMigration5(SQLiteConnection conn)
        {
            using (var trans = conn.BeginTransaction())
            {
                try
                {
                    // 1. Ensure categories table exists
                    string createSql = @"
                        CREATE TABLE IF NOT EXISTS categories (
                            id TEXT PRIMARY KEY,
                            name TEXT NOT NULL,
                            created_at TEXT NOT NULL
                        );
                    ";
                    using (var createCmd = new SQLiteCommand(createSql, conn, trans))
                    {
                        createCmd.ExecuteNonQuery();
                    }

                    // 2. Add missing columns safely if categories existed from earlier schema
                    var existingCols = new System.Collections.Generic.HashSet<string>(StringComparer.OrdinalIgnoreCase);
                    using (var infoCmd = new SQLiteCommand("PRAGMA table_info(categories);", conn, trans))
                    using (var reader = infoCmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            existingCols.Add(reader["name"].ToString());
                        }
                    }

                    if (!existingCols.Contains("display_order"))
                    {
                        using (var alter = new SQLiteCommand("ALTER TABLE categories ADD COLUMN display_order INTEGER NOT NULL DEFAULT 0;", conn, trans))
                        {
                            alter.ExecuteNonQuery();
                        }
                    }

                    if (!existingCols.Contains("is_active"))
                    {
                        using (var alter = new SQLiteCommand("ALTER TABLE categories ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;", conn, trans))
                        {
                            alter.ExecuteNonQuery();
                        }
                    }

                    if (!existingCols.Contains("updated_at"))
                    {
                        using (var alter = new SQLiteCommand("ALTER TABLE categories ADD COLUMN updated_at TEXT;", conn, trans))
                        {
                            alter.ExecuteNonQuery();
                        }
                        using (var update = new SQLiteCommand("UPDATE categories SET updated_at = created_at WHERE updated_at IS NULL;", conn, trans))
                        {
                            update.ExecuteNonQuery();
                        }
                    }

                    string sql = @"
                        CREATE INDEX IF NOT EXISTS idx_categories_display_order ON categories(display_order);
                        CREATE INDEX IF NOT EXISTS idx_categories_is_active ON categories(is_active);

                        -- Seed standard Egyptian supermarket categories
                        INSERT OR IGNORE INTO categories (id, name, display_order, is_active, created_at, updated_at) VALUES
                        ('cat_general', 'عام / متنوع', 0, 1, datetime('now'), datetime('now')),
                        ('cat_dairy', 'ألبان وأجبان', 1, 1, datetime('now'), datetime('now')),
                        ('cat_beverages', 'مشروبات وعصائر', 2, 1, datetime('now'), datetime('now')),
                        ('cat_groceries', 'بقوليات ومعلبات', 3, 1, datetime('now'), datetime('now')),
                        ('cat_snacks', 'حلويات ومقرمشات', 4, 1, datetime('now'), datetime('now')),
                        ('cat_cleaning', 'منظفات وعناية شخصية', 5, 1, datetime('now'), datetime('now'));

                        INSERT OR REPLACE INTO schema_migrations (version, name, applied_at)
                        VALUES (5, 'product_categories', datetime('now'));
                    ";

                    using (var cmd = new SQLiteCommand(sql, conn, trans))
                    {
                        cmd.ExecuteNonQuery();
                    }

                    trans.Commit();
                }
                catch
                {
                    trans.Rollback();
                    throw;
                }
            }
        }

        private static void ApplyMigration6(SQLiteConnection conn)
        {
            using (var trans = conn.BeginTransaction())
            {
                try
                {
                    string sql = @"
                        CREATE TABLE IF NOT EXISTS product_price_history (
                            id TEXT PRIMARY KEY,
                            product_id TEXT NOT NULL,
                            old_price_piasters INTEGER NOT NULL,
                            new_price_piasters INTEGER NOT NULL,
                            old_cost_piasters INTEGER NOT NULL,
                            new_cost_piasters INTEGER NOT NULL,
                            change_reason TEXT,
                            created_at TEXT NOT NULL,
                            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
                        );

                        CREATE INDEX IF NOT EXISTS idx_price_history_product ON product_price_history(product_id);
                        CREATE INDEX IF NOT EXISTS idx_price_history_created_at ON product_price_history(created_at);

                        INSERT OR REPLACE INTO schema_migrations (version, name, applied_at)
                        VALUES (6, 'product_price_history', datetime('now'));
                    ";

                    using (var cmd = new SQLiteCommand(sql, conn, trans))
                    {
                        cmd.ExecuteNonQuery();
                    }

                    trans.Commit();
                }
                catch
                {
                    trans.Rollback();
                    throw;
                }
            }
        }

        private static void ApplyMigration7(SQLiteConnection conn)
        {
            using (var trans = conn.BeginTransaction())
            {
                try
                {
                    bool colExists = false;
                    using (var checkCmd = new SQLiteCommand("PRAGMA table_info(products);", conn, trans))
                    {
                        using (var reader = checkCmd.ExecuteReader())
                        {
                            while (reader.Read())
                            {
                                if (string.Equals(reader["name"].ToString(), "min_stock_quantity_milli", StringComparison.OrdinalIgnoreCase))
                                {
                                    colExists = true;
                                    break;
                                }
                            }
                        }
                    }

                    if (!colExists)
                    {
                        using (var alterCmd = new SQLiteCommand("ALTER TABLE products ADD COLUMN min_stock_quantity_milli INTEGER NOT NULL DEFAULT 5000;", conn, trans))
                        {
                            alterCmd.ExecuteNonQuery();
                        }
                    }

                    string sql = @"
                        CREATE INDEX IF NOT EXISTS idx_products_min_stock ON products(min_stock_quantity_milli);

                        INSERT OR REPLACE INTO schema_migrations (version, name, applied_at)
                        VALUES (7, 'product_min_stock_threshold', datetime('now'));
                    ";

                    using (var cmd = new SQLiteCommand(sql, conn, trans))
                    {
                        cmd.ExecuteNonQuery();
                    }

                    trans.Commit();
                }
                catch
                {
                    trans.Rollback();
                    throw;
                }
            }
        }

        private static void ApplyMigration8(SQLiteConnection conn)
        {
            using (var trans = conn.BeginTransaction())
            {
                try
                {
                    string sql = @"
                        CREATE TABLE IF NOT EXISTS stock_movements (
                            id TEXT PRIMARY KEY,
                            product_id TEXT NOT NULL,
                            movement_type TEXT NOT NULL,
                            quantity_milli INTEGER NOT NULL,
                            reference_id TEXT,
                            reference_type TEXT,
                            unit_cost_piasters INTEGER NOT NULL,
                            note TEXT,
                            batch_number TEXT,
                            created_at TEXT NOT NULL,
                            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
                        );

                        CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id);
                        CREATE INDEX IF NOT EXISTS idx_stock_movements_created_at ON stock_movements(created_at);
                        CREATE INDEX IF NOT EXISTS idx_stock_movements_type ON stock_movements(movement_type);
                        CREATE INDEX IF NOT EXISTS idx_stock_movements_ref ON stock_movements(reference_id);

                        INSERT OR REPLACE INTO schema_migrations (version, name, applied_at)
                        VALUES (8, 'stock_movements', datetime('now'));
                    ";

                    using (var cmd = new SQLiteCommand(sql, conn, trans))
                    {
                        cmd.ExecuteNonQuery();
                    }

                    // Backfill initial stock movements for any existing products that have non-zero stock
                    var productsToBackfill = new System.Collections.Generic.List<System.Collections.Generic.KeyValuePair<string, long[]>>();
                    using (var readCmd = new SQLiteCommand("SELECT id, cost_piasters, stock_quantity_milli FROM products WHERE stock_quantity_milli != 0;", conn, trans))
                    using (var reader = readCmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            string pid = reader["id"].ToString();
                            long cost = Convert.ToInt64(reader["cost_piasters"]);
                            long stock = Convert.ToInt64(reader["stock_quantity_milli"]);
                            productsToBackfill.Add(new System.Collections.Generic.KeyValuePair<string, long[]>(pid, new long[] { cost, stock }));
                        }
                    }

                    foreach (var pair in productsToBackfill)
                    {
                        string pid = pair.Key;
                        long cost = pair.Value[0];
                        long stock = pair.Value[1];

                        // Check if a movement already exists for this product
                        using (var existCmd = new SQLiteCommand("SELECT COUNT(*) FROM stock_movements WHERE product_id = @pid;", conn, trans))
                        {
                            existCmd.Parameters.AddWithValue("@pid", pid);
                            long cnt = Convert.ToInt64(existCmd.ExecuteScalar());
                            if (cnt == 0)
                            {
                                string insertSql = @"
                                    INSERT INTO stock_movements (id, product_id, movement_type, quantity_milli, reference_id, reference_type, unit_cost_piasters, note, batch_number, created_at)
                                    VALUES (@id, @pid, 'INITIAL', @stock, 'MIGRATION_BACKFILL', 'INITIAL_IMPORT', @cost, 'رصيد افتتاحي مسجل أثناء ترقية النظام', NULL, datetime('now'));
                                ";
                                using (var insCmd = new SQLiteCommand(insertSql, conn, trans))
                                {
                                    insCmd.Parameters.AddWithValue("@id", Guid.NewGuid().ToString());
                                    insCmd.Parameters.AddWithValue("@pid", pid);
                                    insCmd.Parameters.AddWithValue("@stock", stock);
                                    insCmd.Parameters.AddWithValue("@cost", cost);
                                    insCmd.ExecuteNonQuery();
                                }
                            }
                        }
                    }

                    trans.Commit();
                }
                catch
                {
                    trans.Rollback();
                    throw;
                }
            }
        }

        private static void ApplyMigration9(SQLiteConnection conn)
        {
            using (var trans = conn.BeginTransaction())
            {
                try
                {
                    // 1. Check if normalized_name column exists
                    bool colExists = false;
                    using (var infoCmd = new SQLiteCommand("PRAGMA table_info(products);", conn, trans))
                    using (var reader = infoCmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            if (string.Equals(reader["name"].ToString(), "normalized_name", StringComparison.OrdinalIgnoreCase))
                            {
                                colExists = true;
                                break;
                            }
                        }
                    }

                    if (!colExists)
                    {
                        using (var alterCmd = new SQLiteCommand("ALTER TABLE products ADD COLUMN normalized_name TEXT DEFAULT '';", conn, trans))
                        {
                            alterCmd.ExecuteNonQuery();
                        }
                    }

                    // 2. Create index on normalized_name
                    using (var idxCmd = new SQLiteCommand("CREATE INDEX IF NOT EXISTS idx_products_normalized_name ON products(normalized_name);", conn, trans))
                    {
                        idxCmd.ExecuteNonQuery();
                    }

                    // 3. Backfill normalized_name for all existing products
                    var productsToNormalize = new System.Collections.Generic.List<System.Collections.Generic.KeyValuePair<string, string>>();
                    using (var readCmd = new SQLiteCommand("SELECT id, name FROM products WHERE name IS NOT NULL AND name != '';", conn, trans))
                    using (var reader = readCmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            productsToNormalize.Add(new System.Collections.Generic.KeyValuePair<string, string>(
                                reader["id"].ToString(),
                                reader["name"].ToString()
                            ));
                        }
                    }

                    if (productsToNormalize.Count > 0)
                    {
                        using (var updateCmd = new SQLiteCommand("UPDATE products SET normalized_name = @norm WHERE id = @id;", conn, trans))
                        {
                            var idParam = updateCmd.Parameters.Add("@id", System.Data.DbType.String);
                            var normParam = updateCmd.Parameters.Add("@norm", System.Data.DbType.String);

                            foreach (var pair in productsToNormalize)
                            {
                                idParam.Value = pair.Key;
                                normParam.Value = Common.ArabicTextNormalizer.Normalize(pair.Value);
                                updateCmd.ExecuteNonQuery();
                            }
                        }
                    }

                    // 4. Record migration
                    using (var cmd = new SQLiteCommand(@"
                        INSERT OR REPLACE INTO schema_migrations (version, name, applied_at)
                        VALUES (9, 'product_normalized_name_for_fast_search', datetime('now'));
                    ", conn, trans))
                    {
                        cmd.ExecuteNonQuery();
                    }

                    trans.Commit();
                }
                catch
                {
                    trans.Rollback();
                    throw;
                }
            }
        }

        private static void ApplyMigration10(SQLiteConnection conn)
        {
            using (var trans = conn.BeginTransaction())
            {
                try
                {
                    // 1. Create quick_items table
                        string sqlCreate = @"
                            CREATE TABLE IF NOT EXISTS quick_items (
                                id TEXT PRIMARY KEY,
                                product_id TEXT,
                                name TEXT NOT NULL,
                                price_piasters INTEGER NOT NULL DEFAULT 0,
                                is_open_price INTEGER NOT NULL DEFAULT 0,
                                unit TEXT NOT NULL DEFAULT 'piece',
                                category_name TEXT NOT NULL DEFAULT 'عام',
                                color TEXT DEFAULT NULL,
                                display_order INTEGER NOT NULL DEFAULT 0,
                                created_at TEXT NOT NULL,
                                updated_at TEXT NOT NULL,
                                FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
                            );
                            CREATE INDEX IF NOT EXISTS idx_quick_items_cat_order ON quick_items(category_name, display_order);
                        ";
                        using (var cmd = new SQLiteCommand(sqlCreate, conn, trans))
                        {
                            cmd.ExecuteNonQuery();
                        }

                        // 2. Check if table is empty and seed defaults if so
                        long count = 0;
                        using (var checkCmd = new SQLiteCommand("SELECT COUNT(*) FROM quick_items;", conn, trans))
                        {
                            count = Convert.ToInt64(checkCmd.ExecuteScalar());
                        }

                        if (count == 0)
                        {
                            string now = DateTime.UtcNow.ToString("o");
                            string seedSql = @"
                                INSERT INTO quick_items (id, product_id, name, price_piasters, is_open_price, unit, category_name, display_order, created_at, updated_at)
                                VALUES 
                                  (@id1, NULL, 'خبز بلدي طازج', 100, 0, 'piece', 'مخبوزات وبقالة', 1, @now, @now),
                                  (@id2, NULL, 'عيش فينو كيس 5 رغيف', 1000, 0, 'piece', 'مخبوزات وبقالة', 2, @now, @now),
                                  (@id3, NULL, 'سكر أبيض ناعم 1 كجم', 3500, 0, 'piece', 'مخبوزات وبقالة', 3, @now, @now),
                                  (@id4, NULL, 'شاي العروسة 40 جم', 1200, 0, 'piece', 'مخبوزات وبقالة', 4, @now, @now),
                                  (@id5, NULL, 'مياه بركة معدنية 1.5 لتر', 800, 0, 'piece', 'ألبان ومشروبات', 1, @now, @now),
                                  (@id6, NULL, 'لبن جهينة كامل الدسم 1 لتر', 4200, 0, 'piece', 'ألبان ومشروبات', 2, @now, @now),
                                  (@id7, NULL, 'زبادي المراعي سادة 105 جم', 850, 0, 'piece', 'ألبان ومشروبات', 3, @now, @now),
                                  (@id8, NULL, 'بيبسي كانز 330 مل', 1500, 0, 'piece', 'ألبان ومشروبات', 4, @now, @now),
                                  (@id9, NULL, 'طماطم بلدي طازجة', 1500, 0, 'kg', 'خضار وفاكهة', 1, @now, @now),
                                  (@id10, NULL, 'بطاطس تحمير', 1800, 0, 'kg', 'خضار وفاكهة', 2, @now, @now),
                                  (@id11, NULL, 'بصل أحمر كجم', 1400, 0, 'kg', 'خضار وفاكهة', 3, @now, @now),
                                  (@id12, NULL, 'خيار صوب', 1600, 0, 'kg', 'خضار وفاكهة', 4, @now, @now);
                            ";

                            using (var seedCmd = new SQLiteCommand(seedSql, conn, trans))
                            {
                                seedCmd.Parameters.AddWithValue("@id1", Guid.NewGuid().ToString());
                                seedCmd.Parameters.AddWithValue("@id2", Guid.NewGuid().ToString());
                                seedCmd.Parameters.AddWithValue("@id3", Guid.NewGuid().ToString());
                                seedCmd.Parameters.AddWithValue("@id4", Guid.NewGuid().ToString());
                                seedCmd.Parameters.AddWithValue("@id5", Guid.NewGuid().ToString());
                                seedCmd.Parameters.AddWithValue("@id6", Guid.NewGuid().ToString());
                                seedCmd.Parameters.AddWithValue("@id7", Guid.NewGuid().ToString());
                                seedCmd.Parameters.AddWithValue("@id8", Guid.NewGuid().ToString());
                                seedCmd.Parameters.AddWithValue("@id9", Guid.NewGuid().ToString());
                                seedCmd.Parameters.AddWithValue("@id10", Guid.NewGuid().ToString());
                                seedCmd.Parameters.AddWithValue("@id11", Guid.NewGuid().ToString());
                                seedCmd.Parameters.AddWithValue("@id12", Guid.NewGuid().ToString());
                                seedCmd.Parameters.AddWithValue("@now", now);
                                seedCmd.ExecuteNonQuery();
                            }
                        }

                        // 3. Record migration
                        using (var cmd = new SQLiteCommand(@"
                            INSERT OR REPLACE INTO schema_migrations (version, name, applied_at)
                            VALUES (10, 'quick_items_fast_picks_management', datetime('now'));
                        ", conn, trans))
                        {
                            cmd.ExecuteNonQuery();
                        }

                        trans.Commit();
                    }
                    catch
                    {
                        trans.Rollback();
                        throw;
                    }
                }
            }

        private static void ApplyMigration11(SQLiteConnection conn)
        {
            using (var trans = conn.BeginTransaction())
            {
                try
                {
                    string sql = @"
                        -- جدول العدادات المتسلسلة التراكمية (Task 107-1)
                        CREATE TABLE IF NOT EXISTS counters (
                            name TEXT PRIMARY KEY,
                            current_value INTEGER NOT NULL,
                            updated_at TEXT NOT NULL
                        );

                        -- زرع القيمة الابتدائية لعداد الفواتير المتسلسل من واقع الفواتير المسجلة
                        INSERT OR IGNORE INTO counters (name, current_value, updated_at)
                        VALUES ('invoice_number', COALESCE((SELECT MAX(invoice_number) FROM sales), 0), datetime('now'));

                        -- تسجيل إصدار الهيكل رقم 11
                        INSERT OR REPLACE INTO schema_migrations (version, name, applied_at)
                        VALUES (11, 'atomic_sequence_counters_table', datetime('now'));
                    ";

                    using (var cmd = new SQLiteCommand(sql, conn, trans))
                    {
                        cmd.ExecuteNonQuery();
                    }

                    trans.Commit();
                }
                catch
                {
                    trans.Rollback();
                    throw;
                }
            }
        }

        private static void ApplyMigration12(SQLiteConnection conn)
        {
            using (var trans = conn.BeginTransaction())
            {
                try
                {
                    string sql = @"
                        -- 1. فهرس مغطي لحساب رصيد المخزون فورياً بدون قراءة الصفوف (Covering Index)
                        CREATE INDEX IF NOT EXISTS idx_stock_movements_covering ON stock_movements(product_id, quantity_milli);

                        -- 2. فهارس تسريع تصفية واستعلامات الفواتير والتقارير
                        CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(status);
                        CREATE INDEX IF NOT EXISTS idx_sales_customer_id ON sales(customer_id);
                        CREATE INDEX IF NOT EXISTS idx_sales_payment_method ON sales(payment_method);

                        -- 3. فهرس بنود الفواتير حسب كود المنتج
                        CREATE INDEX IF NOT EXISTS idx_sale_items_product_id ON sale_items(product_id);

                        -- 4. فهرس مغطي للبحث السريع بالباركودات المتعددة
                        CREATE INDEX IF NOT EXISTS idx_product_barcodes_covering ON product_barcodes(barcode, product_id);

                        -- تسجيل إصدار الهيكل رقم 12
                        INSERT OR REPLACE INTO schema_migrations (version, name, applied_at)
                        VALUES (12, 'high_performance_covering_indexes', datetime('now'));
                    ";

                    using (var cmd = new SQLiteCommand(sql, conn, trans))
                    {
                        cmd.ExecuteNonQuery();
                    }

                    trans.Commit();
                }
                catch
                {
                    trans.Rollback();
                    throw;
                }
            }
        }

        private static void ApplyMigration13(SQLiteConnection conn)
        {
            using (var trans = conn.BeginTransaction())
            {
                try
                {
                    string sqlCreate = @"
                        -- جدول قوالب أنواع المحلات (Feature #106 / Task 106-2)
                        CREATE TABLE IF NOT EXISTS store_templates (
                            id TEXT PRIMARY KEY,
                            name TEXT NOT NULL,
                            description TEXT,
                            icon TEXT NOT NULL DEFAULT 'store',
                            feature_flags_json TEXT NOT NULL,
                            categories_json TEXT NOT NULL,
                            quick_items_json TEXT NOT NULL,
                            default_settings_json TEXT,
                            is_active INTEGER NOT NULL DEFAULT 1,
                            created_at TEXT NOT NULL
                        );

                        -- 1. قالب سوبرماركت ومواد غذائية
                        INSERT OR REPLACE INTO store_templates (id, name, description, icon, feature_flags_json, categories_json, quick_items_json, default_settings_json, is_active, created_at)
                        VALUES (
                            'supermarket',
                            'سوبرماركت ومواد غذائية',
                            'مناسب لمحلات السوبرماركت ومحلات البقالة الكبيرة التي تستخدم الباركود والميزان والآجل',
                            'shopping-cart',
                            '{""feature_scale_weight"":true,""feature_credit_debts"":true,""feature_fast_buttons"":true,""feature_taxes"":false,""feature_expiry_dates"":true,""feature_multi_units"":true}',
                            '[""معلبات وبقوليات"",""ألبان وأجبان"",""منظفات وعناية منزلية"",""بسكويت وحلويات"",""مشروبات وعصائر"",""مخبوزات"",""خضار وفاكهة""]',
                            '[{""Name"":""خبز بلدي طازج"",""PricePiasters"":100,""Unit"":""piece"",""CategoryName"":""مخبوزات"",""IsOpenPrice"":false},{""Name"":""عيش فينو كيس 5 رغيف"",""PricePiasters"":1000,""Unit"":""piece"",""CategoryName"":""مخبوزات"",""IsOpenPrice"":false},{""Name"":""سكر حر ناعم 1 كجم"",""PricePiasters"":3500,""Unit"":""piece"",""CategoryName"":""معلبات وبقوليات"",""IsOpenPrice"":false},{""Name"":""شاي العروسة 40 جم"",""PricePiasters"":1200,""Unit"":""piece"",""CategoryName"":""معلبات وبقوليات"",""IsOpenPrice"":false},{""Name"":""مياه معدنية 1.5 لتر"",""PricePiasters"":800,""Unit"":""piece"",""CategoryName"":""مشروبات وعصائر"",""IsOpenPrice"":false},{""Name"":""لبن جهينة 1 لتر"",""PricePiasters"":4200,""Unit"":""piece"",""CategoryName"":""ألبان وأجبان"",""IsOpenPrice"":false},{""Name"":""طماطم بلدي طازجة"",""PricePiasters"":1500,""Unit"":""kg"",""CategoryName"":""خضار وفاكهة"",""IsOpenPrice"":false},{""Name"":""كيس تسوق كبير"",""PricePiasters"":150,""Unit"":""piece"",""CategoryName"":""عام"",""IsOpenPrice"":false}]',
                            '{""receipt_header"":""أهلاً بكم في سوبرماركت رفيق"",""receipt_footer"":""شكراً لزيارتكم! البضاعة المباعة ترد وتستبدل خلال 14 يوماً بموجب الفاتورة.""}',
                            1,
                            datetime('now')
                        );

                        -- 2. قالب ألبان ومخبوزات ومعلبات
                        INSERT OR REPLACE INTO store_templates (id, name, description, icon, feature_flags_json, categories_json, quick_items_json, default_settings_json, is_active, created_at)
                        VALUES (
                            'dairy_bakery',
                            'ألبان ومخبوزات ومعلبات',
                            'مناسب لمحلات اللبانة والأجبان والمخابز التي تعتمد على البيع بالوزن والأصناف الطازجة',
                            'milk',
                            '{""feature_scale_weight"":true,""feature_credit_debts"":true,""feature_fast_buttons"":true,""feature_taxes"":false,""feature_expiry_dates"":true,""feature_multi_units"":false}',
                            '[""ألبان سائبة ومعبأة"",""أجبان بيضاء ومطبوخة"",""مخبوزات طازجة"",""بيض ومستلزمات"",""معلبات وعسل""]',
                            '[{""Name"":""لبن جاموسي طازج كجم"",""PricePiasters"":3000,""Unit"":""kg"",""CategoryName"":""ألبان سائبة ومعبأة"",""IsOpenPrice"":false},{""Name"":""لبن بقري طازج كجم"",""PricePiasters"":2600,""Unit"":""kg"",""CategoryName"":""ألبان سائبة ومعبأة"",""IsOpenPrice"":false},{""Name"":""جبنة قريش كجم"",""PricePiasters"":7000,""Unit"":""kg"",""CategoryName"":""أجبان بيضاء ومطبوخة"",""IsOpenPrice"":false},{""Name"":""جبنة براميلي فلفل كجم"",""PricePiasters"":14000,""Unit"":""kg"",""CategoryName"":""أجبان بيضاء ومطبوخة"",""IsOpenPrice"":false},{""Name"":""رغيف فينو"",""PricePiasters"":150,""Unit"":""piece"",""CategoryName"":""مخبوزات طازجة"",""IsOpenPrice"":false},{""Name"":""طبق بيض أحمر 30 بيضة"",""PricePiasters"":16500,""Unit"":""piece"",""CategoryName"":""بيض ومستلزمات"",""IsOpenPrice"":false},{""Name"":""زبادي بلدي كبير"",""PricePiasters"":800,""Unit"":""piece"",""CategoryName"":""ألبان سائبة ومعبأة"",""IsOpenPrice"":false}]',
                            '{""receipt_header"":""ألبان ومخبوزات رفيق"",""receipt_footer"":""منتجات طازجة يومياً.. شكراً لثقتكم الغالية""}',
                            1,
                            datetime('now')
                        );

                        -- 3. قالب إكسسوارات ومكتبات وهدايا
                        INSERT OR REPLACE INTO store_templates (id, name, description, icon, feature_flags_json, categories_json, quick_items_json, default_settings_json, is_active, created_at)
                        VALUES (
                            'accessories_gifts',
                            'إكسسوارات ومكتبات وهدايا',
                            'مناسب لمحلات الإكسسوارات والموبايل، الهدايا، والمكتبات (بدون ميزان وأوزان)',
                            'gift',
                            '{""feature_scale_weight"":false,""feature_credit_debts"":true,""feature_fast_buttons"":true,""feature_taxes"":false,""feature_expiry_dates"":false,""feature_multi_units"":false}',
                            '[""إكسسوارات هاتف"",""أدوات مكتبية ومدرسية"",""هدايا وعطور"",""ألعاب وهوايات"",""إلكترونيات وشواحن""]',
                            '[{""Name"":""كابل شحن سريع Type-C"",""PricePiasters"":4500,""Unit"":""piece"",""CategoryName"":""إكسسوارات هاتف"",""IsOpenPrice"":false},{""Name"":""قلم جاف أزرق فاخر"",""PricePiasters"":500,""Unit"":""piece"",""CategoryName"":""أدوات مكتبية ومدرسية"",""IsOpenPrice"":false},{""Name"":""بطارية قلم AA"",""PricePiasters"":1500,""Unit"":""piece"",""CategoryName"":""إلكترونيات وشواحن"",""IsOpenPrice"":false},{""Name"":""تغليف هدية فاخر"",""PricePiasters"":2500,""Unit"":""piece"",""CategoryName"":""هدايا وعطور"",""IsOpenPrice"":true},{""Name"":""كيس هدايا كرتون"",""PricePiasters"":1000,""Unit"":""piece"",""CategoryName"":""هدايا وعطور"",""IsOpenPrice"":false},{""Name"":""لاصقة حماية شاشة"",""PricePiasters"":3000,""Unit"":""piece"",""CategoryName"":""إكسسوارات هاتف"",""IsOpenPrice"":false}]',
                            '{""receipt_header"":""رفيق للإكسسوارات والهدايا"",""receipt_footer"":""شكراً لزيارتكم.. نتمنى لكم يوماً سعيداً""}',
                            1,
                            datetime('now')
                        );

                        -- 4. قالب بقالة ومحل تجاري عام
                        INSERT OR REPLACE INTO store_templates (id, name, description, icon, feature_flags_json, categories_json, quick_items_json, default_settings_json, is_active, created_at)
                        VALUES (
                            'general_grocery',
                            'بقالة ومحل تجاري عام',
                            'إعداد عام متوازن يناسب كافة المحلات والأنشطة التجارية المتنوعة',
                            'store',
                            '{""feature_scale_weight"":true,""feature_credit_debts"":true,""feature_fast_buttons"":true,""feature_taxes"":false,""feature_expiry_dates"":false,""feature_multi_units"":false}',
                            '[""عام"",""أغذية ومشروبات"",""منظفات"",""حلويات وتسالي"",""دخان وسجائر""]',
                            '[{""Name"":""كيس تسوق"",""PricePiasters"":100,""Unit"":""piece"",""CategoryName"":""عام"",""IsOpenPrice"":false},{""Name"":""ولاعة عادية"",""PricePiasters"":500,""Unit"":""piece"",""CategoryName"":""دخان وسجائر"",""IsOpenPrice"":false},{""Name"":""علبة كبريت"",""PricePiasters"":100,""Unit"":""piece"",""CategoryName"":""عام"",""IsOpenPrice"":false},{""Name"":""مياه صغيرة 500 مل"",""PricePiasters"":500,""Unit"":""piece"",""CategoryName"":""أغذية ومشروبات"",""IsOpenPrice"":false},{""Name"":""شيبسي عائلي"",""PricePiasters"":1500,""Unit"":""piece"",""CategoryName"":""حلويات وتسالي"",""IsOpenPrice"":false}]',
                            '{""receipt_header"":""أهلاً بكم في متجرنا"",""receipt_footer"":""شكراً لتعاملكم معنا""}',
                            1,
                            datetime('now')
                        );

                        -- تسجيل إصدار الهيكل رقم 13
                        INSERT OR REPLACE INTO schema_migrations (version, name, applied_at)
                        VALUES (13, 'store_type_templates_table', datetime('now'));
                    ";

                    using (var cmd = new SQLiteCommand(sqlCreate, conn, trans))
                    {
                        cmd.ExecuteNonQuery();
                    }

                    trans.Commit();
                }
                catch
                {
                    trans.Rollback();
                    throw;
                }
            }
        }

        private static void ApplyMigration14(SQLiteConnection conn)
        {
            using (var trans = conn.BeginTransaction())
            {
                try
                {
                    string sql = @"
                        -- جدول وحدات بيع وشراء المنتج (Feature #161 / Task 161-1)
                        CREATE TABLE IF NOT EXISTS product_units (
                            id TEXT PRIMARY KEY,
                            product_id TEXT NOT NULL,
                            unit_name TEXT NOT NULL,
                            conversion_factor INTEGER NOT NULL CHECK (conversion_factor > 0),
                            is_base_unit INTEGER NOT NULL DEFAULT 0 CHECK (is_base_unit IN (0, 1)),
                            sell_price_piasters INTEGER NOT NULL DEFAULT 0 CHECK (sell_price_piasters >= 0),
                            cost_price_piasters INTEGER NOT NULL DEFAULT 0 CHECK (cost_price_piasters >= 0),
                            barcode TEXT COLLATE NOCASE,
                            is_divisible INTEGER NOT NULL DEFAULT 0 CHECK (is_divisible IN (0, 1)),
                            sort_order INTEGER NOT NULL DEFAULT 0,
                            created_at TEXT NOT NULL,
                            updated_at TEXT NOT NULL,
                            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
                            UNIQUE(product_id, unit_name)
                        );

                        CREATE INDEX IF NOT EXISTS idx_product_units_product_id ON product_units(product_id);
                        CREATE INDEX IF NOT EXISTS idx_product_units_base ON product_units(product_id, is_base_unit);
                        CREATE INDEX IF NOT EXISTS idx_product_units_barcode ON product_units(barcode);

                        -- ترقية المنتجات الحالية لإنشاء الوحدة الأساسية الافتراضية (Task 161-2)
                        INSERT OR IGNORE INTO product_units (
                            id, product_id, unit_name, conversion_factor, is_base_unit,
                            sell_price_piasters, cost_price_piasters, barcode, is_divisible, sort_order, created_at, updated_at
                        )
                        SELECT
                            'punit_' || p.id,
                            p.id,
                            CASE 
                                WHEN p.unit IS NOT NULL AND TRIM(p.unit) != '' THEN TRIM(p.unit)
                                ELSE 'قطعة'
                            END,
                            1,
                            1,
                            p.price_piasters,
                            p.cost_piasters,
                            p.barcode,
                            CASE WHEN p.unit IN ('kg', 'كيلو', 'كجم', 'جرام', 'gram') THEN 1 ELSE 0 END,
                            0,
                            datetime('now'),
                            datetime('now')
                        FROM products p
                        WHERE NOT EXISTS (
                            SELECT 1 FROM product_units pu WHERE pu.product_id = p.id AND pu.is_base_unit = 1
                        );

                        -- تسجيل إصدار الهيكل رقم 14
                        INSERT OR REPLACE INTO schema_migrations (version, name, applied_at)
                        VALUES (14, 'product_multi_units', datetime('now'));
                    ";

                    using (var cmd = new SQLiteCommand(sql, conn, trans))
                    {
                        cmd.ExecuteNonQuery();
                    }

                    // تحديث جدول بنود الفواتير لدعم الوحدات المتعددة بأمان
                    using (var infoCmd = new SQLiteCommand("PRAGMA table_info(sale_items);", conn, trans))
                    {
                        var existingCols = new System.Collections.Generic.HashSet<string>(StringComparer.OrdinalIgnoreCase);
                        using (var reader = infoCmd.ExecuteReader())
                        {
                            while (reader.Read())
                            {
                                existingCols.Add(reader["name"].ToString());
                            }
                        }

                        if (!existingCols.Contains("unit_id"))
                        {
                            using (var alter = new SQLiteCommand("ALTER TABLE sale_items ADD COLUMN unit_id TEXT;", conn, trans))
                            {
                                alter.ExecuteNonQuery();
                            }
                        }

                        if (!existingCols.Contains("unit_name"))
                        {
                            using (var alter = new SQLiteCommand("ALTER TABLE sale_items ADD COLUMN unit_name TEXT;", conn, trans))
                            {
                                alter.ExecuteNonQuery();
                            }
                        }

                        if (!existingCols.Contains("conversion_factor"))
                        {
                            using (var alter = new SQLiteCommand("ALTER TABLE sale_items ADD COLUMN conversion_factor INTEGER DEFAULT 1;", conn, trans))
                            {
                                alter.ExecuteNonQuery();
                            }
                        }
                    }

                    trans.Commit();
                }
                catch
                {
                    trans.Rollback();
                    throw;
                }
            }
        }

        private static void ApplyMigration15(SQLiteConnection conn)
        {
            using (var trans = conn.BeginTransaction())
            {
                try
                {
                    // 1. Ensure users table exists with base columns
                    string createUsersSql = @"
                        CREATE TABLE IF NOT EXISTS users (
                            id TEXT PRIMARY KEY,
                            username TEXT UNIQUE NOT NULL,
                            display_name TEXT NOT NULL,
                            pin_code_hash TEXT NOT NULL,
                            pin_salt TEXT NOT NULL DEFAULT '',
                            role TEXT NOT NULL DEFAULT 'cashier',
                            is_active INTEGER NOT NULL DEFAULT 1,
                            failed_attempts INTEGER NOT NULL DEFAULT 0,
                            lockout_until TEXT,
                            permissions_json TEXT,
                            created_at TEXT NOT NULL,
                            updated_at TEXT,
                            last_login_at TEXT
                        );
                    ";
                    using (var cmd = new SQLiteCommand(createUsersSql, conn, trans))
                    {
                        cmd.ExecuteNonQuery();
                    }

                    // 2. Add columns if users table was already created in earlier migration
                    var existingCols = new System.Collections.Generic.HashSet<string>(StringComparer.OrdinalIgnoreCase);
                    using (var infoCmd = new SQLiteCommand("PRAGMA table_info(users);", conn, trans))
                    using (var reader = infoCmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            existingCols.Add(reader["name"].ToString());
                        }
                    }

                    if (!existingCols.Contains("pin_salt"))
                    {
                        using (var alter = new SQLiteCommand("ALTER TABLE users ADD COLUMN pin_salt TEXT DEFAULT '';", conn, trans))
                        {
                            alter.ExecuteNonQuery();
                        }
                    }
                    if (!existingCols.Contains("failed_attempts"))
                    {
                        using (var alter = new SQLiteCommand("ALTER TABLE users ADD COLUMN failed_attempts INTEGER NOT NULL DEFAULT 0;", conn, trans))
                        {
                            alter.ExecuteNonQuery();
                        }
                    }
                    if (!existingCols.Contains("lockout_until"))
                    {
                        using (var alter = new SQLiteCommand("ALTER TABLE users ADD COLUMN lockout_until TEXT;", conn, trans))
                        {
                            alter.ExecuteNonQuery();
                        }
                    }
                    if (!existingCols.Contains("permissions_json"))
                    {
                        using (var alter = new SQLiteCommand("ALTER TABLE users ADD COLUMN permissions_json TEXT;", conn, trans))
                        {
                            alter.ExecuteNonQuery();
                        }
                    }
                    if (!existingCols.Contains("updated_at"))
                    {
                        using (var alter = new SQLiteCommand("ALTER TABLE users ADD COLUMN updated_at TEXT;", conn, trans))
                        {
                            alter.ExecuteNonQuery();
                        }
                    }
                    if (!existingCols.Contains("last_login_at"))
                    {
                        using (var alter = new SQLiteCommand("ALTER TABLE users ADD COLUMN last_login_at TEXT;", conn, trans))
                        {
                            alter.ExecuteNonQuery();
                        }
                    }

                    // 3. Create indexes for users
                    using (var idxCmd = new SQLiteCommand(@"
                        CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
                        CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
                        CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);
                    ", conn, trans))
                    {
                        idxCmd.ExecuteNonQuery();
                    }

                    // 4. Migrate existing PIN from app_settings or seed default admin & cashier
                    string existingPinHash = "";
                    string existingPinSalt = "";
                    using (var getPinCmd = new SQLiteCommand("SELECT key, value FROM app_settings WHERE key IN ('security_pin_hash', 'security_pin_salt');", conn, trans))
                    using (var reader = getPinCmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            string k = reader["key"].ToString();
                            string v = reader["value"].ToString();
                            if (k == "security_pin_hash") existingPinHash = v;
                            if (k == "security_pin_salt") existingPinSalt = v;
                        }
                    }

                    // Check if default admin exists
                    using (var chkAdminCmd = new SQLiteCommand("SELECT COUNT(*) FROM users WHERE id = 'usr_admin_default' OR username = 'admin';", conn, trans))
                    {
                        long adminCount = Convert.ToInt64(chkAdminCmd.ExecuteScalar());
                        if (adminCount == 0)
                        {
                            string adminHash = existingPinHash;
                            string adminSalt = existingPinSalt;
                            if (string.IsNullOrEmpty(adminHash) || string.IsNullOrEmpty(adminSalt))
                            {
                                byte[] saltBytes = new byte[16];
                                using (var rng = new System.Security.Cryptography.RNGCryptoServiceProvider())
                                {
                                    rng.GetBytes(saltBytes);
                                }
                                adminSalt = Convert.ToBase64String(saltBytes);
                                using (var pbkdf2 = new System.Security.Cryptography.Rfc2898DeriveBytes("1234", saltBytes, 10000))
                                {
                                    adminHash = Convert.ToBase64String(pbkdf2.GetBytes(32));
                                }
                            }

                            using (var insAdmin = new SQLiteCommand(@"
                                INSERT INTO users (id, username, display_name, pin_code_hash, pin_salt, role, is_active, failed_attempts, created_at, updated_at)
                                VALUES ('usr_admin_default', 'admin', 'مدير النظام', @hash, @salt, 'admin', 1, 0, datetime('now'), datetime('now'));
                            ", conn, trans))
                            {
                                insAdmin.Parameters.AddWithValue("@hash", adminHash);
                                insAdmin.Parameters.AddWithValue("@salt", adminSalt);
                                insAdmin.ExecuteNonQuery();
                            }
                        }
                    }

                    // Check if default cashier exists
                    using (var chkCashierCmd = new SQLiteCommand("SELECT COUNT(*) FROM users WHERE id = 'usr_cashier_1' OR username = 'cashier1';", conn, trans))
                    {
                        long cashierCount = Convert.ToInt64(chkCashierCmd.ExecuteScalar());
                        if (cashierCount == 0)
                        {
                            byte[] saltBytes = new byte[16];
                            using (var rng = new System.Security.Cryptography.RNGCryptoServiceProvider())
                            {
                                rng.GetBytes(saltBytes);
                            }
                            string cashierSalt = Convert.ToBase64String(saltBytes);
                            string cashierHash;
                            using (var pbkdf2 = new System.Security.Cryptography.Rfc2898DeriveBytes("0000", saltBytes, 10000))
                            {
                                cashierHash = Convert.ToBase64String(pbkdf2.GetBytes(32));
                            }

                            using (var insCashier = new SQLiteCommand(@"
                                INSERT INTO users (id, username, display_name, pin_code_hash, pin_salt, role, is_active, failed_attempts, created_at, updated_at)
                                VALUES ('usr_cashier_1', 'cashier1', 'كاشير (1)', @hash, @salt, 'cashier', 1, 0, datetime('now'), datetime('now'));
                            ", conn, trans))
                            {
                                insCashier.Parameters.AddWithValue("@hash", cashierHash);
                                insCashier.Parameters.AddWithValue("@salt", cashierSalt);
                                insCashier.ExecuteNonQuery();
                            }
                        }
                    }

                    // 5. Update schema_migrations
                    using (var logCmd = new SQLiteCommand(@"
                        INSERT INTO schema_migrations (version, name, applied_at)
                        VALUES (15, 'User Accounts and Role-Based Security (Feature #166)', datetime('now'));
                    ", conn, trans))
                    {
                        logCmd.ExecuteNonQuery();
                    }

                    trans.Commit();
                }
                catch
                {
                    trans.Rollback();
                    throw;
                }
            }
        }

        private static void ApplyMigration16(SQLiteConnection conn)
        {
            using (var trans = conn.BeginTransaction())
            {
                try
                {
                    // 1. Add columns to audit_logs if missing
                    var existingCols = new System.Collections.Generic.HashSet<string>(StringComparer.OrdinalIgnoreCase);
                    using (var infoCmd = new SQLiteCommand("PRAGMA table_info(audit_logs);", conn, trans))
                    using (var reader = infoCmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            existingCols.Add(reader["name"].ToString());
                        }
                    }

                    if (!existingCols.Contains("prev_hash"))
                    {
                        using (var alter = new SQLiteCommand("ALTER TABLE audit_logs ADD COLUMN prev_hash TEXT DEFAULT '';", conn, trans))
                        {
                            alter.ExecuteNonQuery();
                        }
                    }

                    if (!existingCols.Contains("record_hash"))
                    {
                        using (var alter = new SQLiteCommand("ALTER TABLE audit_logs ADD COLUMN record_hash TEXT DEFAULT '';", conn, trans))
                        {
                            alter.ExecuteNonQuery();
                        }
                    }

                    // 2. Backfill existing records to establish a valid cryptographic chain
                    var rows = new System.Collections.Generic.List<string[]>();
                    using (var readCmd = new SQLiteCommand("SELECT id, user_id, action, entity_type, entity_id, details_json, created_at, prev_hash, record_hash FROM audit_logs ORDER BY rowid ASC;", conn, trans))
                    using (var rdr = readCmd.ExecuteReader())
                    {
                        while (rdr.Read())
                        {
                            rows.Add(new string[] {
                                rdr["id"].ToString(),
                                rdr["user_id"] != DBNull.Value ? rdr["user_id"].ToString() : "",
                                rdr["action"].ToString(),
                                rdr["entity_type"].ToString(),
                                rdr["entity_id"] != DBNull.Value ? rdr["entity_id"].ToString() : "",
                                rdr["details_json"] != DBNull.Value ? rdr["details_json"].ToString() : "",
                                rdr["created_at"].ToString(),
                                rdr["prev_hash"] != DBNull.Value ? rdr["prev_hash"].ToString() : "",
                                rdr["record_hash"] != DBNull.Value ? rdr["record_hash"].ToString() : ""
                            });
                        }
                    }

                    string lastHash = "GENESIS_RAFIQ_AUDIT_V1";
                    for (int i = 0; i < rows.Count; i++)
                    {
                        string id = rows[i][0];
                        string userId = rows[i][1];
                        string action = rows[i][2];
                        string entityType = rows[i][3];
                        string entityId = rows[i][4];
                        string detailsJson = rows[i][5];
                        string createdAt = rows[i][6];
                        string prevHash = rows[i][7];
                        string recHash = rows[i][8];

                        if (string.IsNullOrEmpty(recHash))
                        {
                            prevHash = lastHash;
                            recHash = ComputeAuditHash(prevHash, id, userId, action, entityType, entityId, detailsJson, createdAt);

                            using (var updateCmd = new SQLiteCommand("UPDATE audit_logs SET prev_hash = @prev, record_hash = @rec WHERE id = @id;", conn, trans))
                            {
                                updateCmd.Parameters.AddWithValue("@prev", prevHash);
                                updateCmd.Parameters.AddWithValue("@rec", recHash);
                                updateCmd.Parameters.AddWithValue("@id", id);
                                updateCmd.ExecuteNonQuery();
                            }
                        }
                        lastHash = recHash;
                    }

                    // 3. Create index for hash chain
                    using (var idxCmd = new SQLiteCommand("CREATE INDEX IF NOT EXISTS idx_audit_logs_record_hash ON audit_logs(record_hash);", conn, trans))
                    {
                        idxCmd.ExecuteNonQuery();
                    }

                    // 4. Update schema_migrations
                    using (var logCmd = new SQLiteCommand(@"
                        INSERT INTO schema_migrations (version, name, applied_at)
                        VALUES (16, 'Tamper-Evident Audit Log Chaining and Hash Sealing (Feature #169)', datetime('now'));
                    ", conn, trans))
                    {
                        logCmd.ExecuteNonQuery();
                    }

                    trans.Commit();
                }
                catch
                {
                    trans.Rollback();
                    throw;
                }
            }
        }

        private static void ApplyMigration17(SQLiteConnection conn)
        {
            using (var trans = conn.BeginTransaction())
            {
                try
                {
                    // 1. Seed discount threshold settings in app_settings (Feature #24 / Task 24-1)
                    using (var cmd = new SQLiteCommand(@"
                        INSERT OR IGNORE INTO app_settings (key, value, updated_at)
                        VALUES 
                        ('max_discount_percent_cashier', '10', datetime('now')),
                        ('max_discount_amount_cashier_piasters', '5000', datetime('now'));
                    ", conn, trans))
                    {
                        cmd.ExecuteNonQuery();
                    }

                    // 2. Update schema_migrations
                    using (var logCmd = new SQLiteCommand(@"
                        INSERT INTO schema_migrations (version, name, applied_at)
                        VALUES (17, 'Discount Rules and Cashier Thresholds (Feature #24)', datetime('now'));
                    ", conn, trans))
                    {
                        logCmd.ExecuteNonQuery();
                    }

                    trans.Commit();
                }
                catch
                {
                    trans.Rollback();
                    throw;
                }
            }
        }

        public static string ComputeAuditHash(string prevHash, string id, string userId, string action, string entityType, string entityId, string detailsJson, string createdAt)
        {
            string raw = string.Format("{0}|{1}|{2}|{3}|{4}|{5}|{6}|{7}",
                prevHash ?? "",
                id ?? "",
                userId ?? "",
                action ?? "",
                entityType ?? "",
                entityId ?? "",
                detailsJson ?? "",
                createdAt ?? "");

            using (var sha = System.Security.Cryptography.SHA256.Create())
            {
                byte[] bytes = sha.ComputeHash(System.Text.Encoding.UTF8.GetBytes(raw));
                var sb = new System.Text.StringBuilder();
                for (int i = 0; i < bytes.Length; i++)
                {
                    sb.Append(bytes[i].ToString("x2"));
                }
                return sb.ToString();
            }
        }
    }
}


