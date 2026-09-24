using System;
using System.IO;
using System.Data.SQLite;

namespace RafiqPOS.Database
{
    public static class MigrationRunner
    {
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
                            created_at TEXT NOT NULL
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
    }
}
