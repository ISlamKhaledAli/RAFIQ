using System;
using System.IO;
using System.Data.SQLite;

namespace RafiqPOS.Database
{
    public static class MigrationRunner
    {
        public const int LATEST_SUPPORTED_VERSION = 7;

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

                // 11. Self-Healing Schema Guard: Automatically repair missing columns or indexes
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

                            // Ensure indexes for products
                            using (var idxCmd = new SQLiteCommand(@"
                                CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);
                                CREATE INDEX IF NOT EXISTS idx_products_is_active ON products(is_active);
                                CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
                                CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
                            ", conn, trans))
                            {
                                idxCmd.ExecuteNonQuery();
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

                            if (!existingCols.Contains("product_barcode"))
                            {
                                using (var alter = new SQLiteCommand("ALTER TABLE sale_items ADD COLUMN product_barcode TEXT DEFAULT '';", conn, trans))
                                {
                                    alter.ExecuteNonQuery();
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
    }
}

