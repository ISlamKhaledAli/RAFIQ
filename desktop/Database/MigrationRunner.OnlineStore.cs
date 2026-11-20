using System;
using System.Collections.Generic;
using System.Data.SQLite;

namespace RafiqPOS.Database
{
    public static partial class MigrationRunner
    {
        private static void ApplyOnlineStoreMigrations(SQLiteConnection conn, string dbPath, int currentVersion)
        {
            // 70. Apply Migration 67: Online Store Sync Engine, Outbox/Inbox, and Online Product Visibility
            if (currentVersion < 67)
            {
                BackupDatabaseBeforeMigration(dbPath);
                ApplyMigration67(conn);
            }

            // 71. Apply Migration 68: Retrofit Insurance Sales Payment Method & Cash Drawer Isolation (Feature #189)
            if (currentVersion < 68)
            {
                BackupDatabaseBeforeMigration(dbPath);
                ApplyMigration68(conn);
            }

            // 72. Apply Migration 69: Insurance Settlement Receipts & Cash Drawer Cancellation Tracking (Feature #190)
            if (currentVersion < 69)
            {
                BackupDatabaseBeforeMigration(dbPath);
                ApplyMigration69(conn);
            }
        }

        private static void ApplyMigration67(SQLiteConnection conn)
        {
            using (var trans = conn.BeginTransaction())
            {
                try
                {
                    // 1. Add online visibility fields to products table
                    var existingProdCols = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                    using (var infoCmd = new SQLiteCommand("PRAGMA table_info(products);", conn, trans))
                    using (var reader = infoCmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            existingProdCols.Add(reader["name"].ToString());
                        }
                    }

                    if (!existingProdCols.Contains("is_online"))
                    {
                        using (var cmd = new SQLiteCommand("ALTER TABLE products ADD COLUMN is_online INTEGER NOT NULL DEFAULT 1;", conn, trans))
                        {
                            cmd.ExecuteNonQuery();
                        }
                    }

                    if (!existingProdCols.Contains("is_featured"))
                    {
                        using (var cmd = new SQLiteCommand("ALTER TABLE products ADD COLUMN is_featured INTEGER NOT NULL DEFAULT 0;", conn, trans))
                        {
                            cmd.ExecuteNonQuery();
                        }
                    }

                    if (!existingProdCols.Contains("online_description"))
                    {
                        using (var cmd = new SQLiteCommand("ALTER TABLE products ADD COLUMN online_description TEXT;", conn, trans))
                        {
                            cmd.ExecuteNonQuery();
                        }
                    }

                    if (!existingProdCols.Contains("compare_price_piasters"))
                    {
                        using (var cmd = new SQLiteCommand("ALTER TABLE products ADD COLUMN compare_price_piasters INTEGER;", conn, trans))
                        {
                            cmd.ExecuteNonQuery();
                        }
                    }

                    // Index for fast online product queries
                    using (var cmd = new SQLiteCommand("CREATE INDEX IF NOT EXISTS idx_products_online ON products(is_online, is_active);", conn, trans))
                    {
                        cmd.ExecuteNonQuery();
                    }

                    // 2. Add online visibility fields to categories table
                    var existingCatCols = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                    using (var infoCmd = new SQLiteCommand("PRAGMA table_info(categories);", conn, trans))
                    using (var reader = infoCmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            existingCatCols.Add(reader["name"].ToString());
                        }
                    }

                    if (!existingCatCols.Contains("is_online"))
                    {
                        using (var cmd = new SQLiteCommand("ALTER TABLE categories ADD COLUMN is_online INTEGER NOT NULL DEFAULT 1;", conn, trans))
                        {
                            cmd.ExecuteNonQuery();
                        }
                    }

                    if (!existingCatCols.Contains("image_url"))
                    {
                        using (var cmd = new SQLiteCommand("ALTER TABLE categories ADD COLUMN image_url TEXT;", conn, trans))
                        {
                            cmd.ExecuteNonQuery();
                        }
                    }

                    using (var cmd = new SQLiteCommand("CREATE INDEX IF NOT EXISTS idx_categories_online ON categories(is_online, is_active);", conn, trans))
                    {
                        cmd.ExecuteNonQuery();
                    }

                    // 3. Create sync_outbox table (Delta changes waiting to be pushed to cloud)
                    using (var cmd = new SQLiteCommand(@"
                        CREATE TABLE IF NOT EXISTS sync_outbox (
                            id              TEXT PRIMARY KEY,
                            entity_type     TEXT NOT NULL,
                            entity_id       TEXT NOT NULL,
                            operation       TEXT NOT NULL,
                            payload_json    TEXT NOT NULL,
                            created_at      TEXT NOT NULL,
                            sync_status     TEXT NOT NULL DEFAULT 'pending',
                            retry_count     INTEGER NOT NULL DEFAULT 0,
                            last_error      TEXT,
                            synced_at       TEXT
                        );
                        CREATE INDEX IF NOT EXISTS idx_sync_outbox_status ON sync_outbox(sync_status, created_at);
                    ", conn, trans))
                    {
                        cmd.ExecuteNonQuery();
                    }

                    // 4. Create sync_inbox table (Online customer orders downloaded from cloud)
                    using (var cmd = new SQLiteCommand(@"
                        CREATE TABLE IF NOT EXISTS sync_inbox (
                            id              TEXT PRIMARY KEY,
                            order_id        TEXT NOT NULL UNIQUE,
                            order_number    INTEGER NOT NULL DEFAULT 0,
                            customer_name   TEXT,
                            customer_phone  TEXT,
                            total_piasters  INTEGER NOT NULL DEFAULT 0,
                            order_data_json TEXT NOT NULL,
                            received_at     TEXT NOT NULL,
                            process_status  TEXT NOT NULL DEFAULT 'new',
                            pos_invoice_id  TEXT,
                            processed_at    TEXT
                        );
                        CREATE INDEX IF NOT EXISTS idx_sync_inbox_status ON sync_inbox(process_status, received_at);
                    ", conn, trans))
                    {
                        cmd.ExecuteNonQuery();
                    }

                    // 5. Create sync_state table (Persistent local key-value store for cloud configuration)
                    using (var cmd = new SQLiteCommand(@"
                        CREATE TABLE IF NOT EXISTS sync_state (
                            key             TEXT PRIMARY KEY,
                            value           TEXT NOT NULL
                        );
                        INSERT OR IGNORE INTO sync_state (key, value) VALUES ('online_store_enabled', '0');
                        INSERT OR IGNORE INTO sync_state (key, value) VALUES ('store_cloud_id', '');
                        INSERT OR IGNORE INTO sync_state (key, value) VALUES ('sync_api_key', '');
                        INSERT OR IGNORE INTO sync_state (key, value) VALUES ('online_store_slug', '');
                        INSERT OR IGNORE INTO sync_state (key, value) VALUES ('cloud_api_url', 'https://rafiq-store-api.rafiq-store-api.workers.dev/api/v1');
                        INSERT OR IGNORE INTO sync_state (key, value) VALUES ('last_sync_timestamp', '');
                        INSERT OR IGNORE INTO sync_state (key, value) VALUES ('sync_interval_seconds', '300');
                    ", conn, trans))
                    {
                        cmd.ExecuteNonQuery();
                    }

                    // 6. Create product_images table (Local product photos catalog)
                    using (var cmd = new SQLiteCommand(@"
                        CREATE TABLE IF NOT EXISTS product_images (
                            id              TEXT PRIMARY KEY,
                            product_id      TEXT NOT NULL,
                            image_index     INTEGER NOT NULL DEFAULT 0,
                            local_path      TEXT NOT NULL,
                            r2_url          TEXT,
                            file_hash       TEXT NOT NULL,
                            created_at      TEXT NOT NULL,
                            synced_at       TEXT,
                            FOREIGN KEY (product_id) REFERENCES products(id),
                            UNIQUE(product_id, image_index)
                        );
                        CREATE INDEX IF NOT EXISTS idx_product_images_prod ON product_images(product_id);
                    ", conn, trans))
                    {
                        cmd.ExecuteNonQuery();
                    }

                    // 7. Record migration in schema_migrations
                    using (var cmd = new SQLiteCommand(@"
                        INSERT OR REPLACE INTO schema_migrations (version, name, applied_at)
                        VALUES (67, 'Online store sync tables and product online visibility fields', datetime('now'));
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

        private static void ApplyMigration68(SQLiteConnection conn)
        {
            using (var trans = conn.BeginTransaction())
            {
                try
                {
                    // Retrofit historical insurance sales that were stored with payment_method = 'credit'
                    using (var cmd = new SQLiteCommand(@"
                        UPDATE sales
                        SET payment_method = 'insurance'
                        WHERE payment_method = 'credit'
                          AND (
                              id IN (SELECT sale_id FROM insurance_claim_lines)
                              OR id IN (SELECT sale_id FROM payments WHERE method = 'insurance')
                          );
                    ", conn, trans))
                    {
                        cmd.ExecuteNonQuery();
                    }

                    // Record migration 68 in schema_migrations
                    using (var cmd = new SQLiteCommand(@"
                        INSERT OR REPLACE INTO schema_migrations (version, name, applied_at)
                        VALUES (68, 'Retrofit Insurance Sales Payment Method & Cash Drawer Isolation (Feature #189)', datetime('now'));
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

        private static void ApplyMigration69(SQLiteConnection conn)
        {
            using (var trans = conn.BeginTransaction())
            {
                try
                {
                    // 1. Add destination receipt tracking columns to insurance_claim_batches
                    var existingBatchCols = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                    using (var infoCmd = new SQLiteCommand("PRAGMA table_info(insurance_claim_batches);", conn, trans))
                    using (var reader = infoCmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            existingBatchCols.Add(reader["name"].ToString());
                        }
                    }

                    if (!existingBatchCols.Contains("settlement_receipt_target"))
                    {
                        using (var cmd = new SQLiteCommand("ALTER TABLE insurance_claim_batches ADD COLUMN settlement_receipt_target TEXT DEFAULT 'none';", conn, trans))
                        {
                            cmd.ExecuteNonQuery();
                        }
                    }

                    if (!existingBatchCols.Contains("settlement_receipt_account_id"))
                    {
                        using (var cmd = new SQLiteCommand("ALTER TABLE insurance_claim_batches ADD COLUMN settlement_receipt_account_id TEXT DEFAULT NULL;", conn, trans))
                        {
                            cmd.ExecuteNonQuery();
                        }
                    }

                    if (!existingBatchCols.Contains("settlement_drawer_tx_id"))
                    {
                        using (var cmd = new SQLiteCommand("ALTER TABLE insurance_claim_batches ADD COLUMN settlement_drawer_tx_id TEXT DEFAULT NULL;", conn, trans))
                        {
                            cmd.ExecuteNonQuery();
                        }
                    }

                    if (!existingBatchCols.Contains("settlement_digital_tx_id"))
                    {
                        using (var cmd = new SQLiteCommand("ALTER TABLE insurance_claim_batches ADD COLUMN settlement_digital_tx_id TEXT DEFAULT NULL;", conn, trans))
                        {
                            cmd.ExecuteNonQuery();
                        }
                    }

                    // 2. Add cancellation audit columns to cash_drawer_transactions
                    var existingDrawerCols = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                    using (var infoCmd = new SQLiteCommand("PRAGMA table_info(cash_drawer_transactions);", conn, trans))
                    using (var reader = infoCmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            existingDrawerCols.Add(reader["name"].ToString());
                        }
                    }

                    if (!existingDrawerCols.Contains("is_cancelled"))
                    {
                        using (var cmd = new SQLiteCommand("ALTER TABLE cash_drawer_transactions ADD COLUMN is_cancelled INTEGER DEFAULT 0;", conn, trans))
                        {
                            cmd.ExecuteNonQuery();
                        }
                    }

                    if (!existingDrawerCols.Contains("cancelled_at"))
                    {
                        using (var cmd = new SQLiteCommand("ALTER TABLE cash_drawer_transactions ADD COLUMN cancelled_at TEXT DEFAULT NULL;", conn, trans))
                        {
                            cmd.ExecuteNonQuery();
                        }
                    }

                    if (!existingDrawerCols.Contains("cancelled_by"))
                    {
                        using (var cmd = new SQLiteCommand("ALTER TABLE cash_drawer_transactions ADD COLUMN cancelled_by TEXT DEFAULT NULL;", conn, trans))
                        {
                            cmd.ExecuteNonQuery();
                        }
                    }

                    if (!existingDrawerCols.Contains("cancel_reason"))
                    {
                        using (var cmd = new SQLiteCommand("ALTER TABLE cash_drawer_transactions ADD COLUMN cancel_reason TEXT DEFAULT NULL;", conn, trans))
                        {
                            cmd.ExecuteNonQuery();
                        }
                    }

                    using (var cmd = new SQLiteCommand("CREATE INDEX IF NOT EXISTS idx_drawer_tx_cancelled ON cash_drawer_transactions(is_cancelled);", conn, trans))
                    {
                        cmd.ExecuteNonQuery();
                    }

                    // 3. Upgrade trigger to allow atomic cancellation while strictly locking amount and core financial fields
                    using (var cmd = new SQLiteCommand(@"
                        DROP TRIGGER IF EXISTS trg_prevent_drawer_tx_update;
                        CREATE TRIGGER trg_prevent_drawer_tx_update
                        BEFORE UPDATE ON cash_drawer_transactions
                        FOR EACH ROW
                        WHEN (
                            OLD.id != NEW.id 
                            OR OLD.shift_id != NEW.shift_id 
                            OR OLD.type != NEW.type 
                            OR OLD.amount_piasters != NEW.amount_piasters 
                            OR (OLD.is_cancelled = 1 AND NEW.is_cancelled = 0)
                        )
                        BEGIN
                            SELECT RAISE(ABORT, 'لا يمكن تعديل المبالغ أو البيانات الأساسية لحركة نقدية في الدرج بعد تسجيلها');
                        END;
                    ", conn, trans))
                    {
                        cmd.ExecuteNonQuery();
                    }

                    // 4. Record migration 69 in schema_migrations
                    using (var cmd = new SQLiteCommand(@"
                        INSERT OR REPLACE INTO schema_migrations (version, name, applied_at)
                        VALUES (69, 'Insurance Settlement Receipts & Cash Drawer Cancellation Tracking (Feature #190)', datetime('now'));
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
    }
}
