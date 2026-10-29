using System;
using System.Data.SQLite;

namespace RafiqPOS.Database
{
    public static partial class MigrationRunner
    {
        private static void ApplyCafeHospitalityMigrations(SQLiteConnection conn, string dbPath, int currentVersion)
        {
            // 59. Apply Migration 56: Cafe & Restaurant Table Management, KOT Routing & Order Modes (Story 139 / Feature #196)
            if (currentVersion < 56)
            {
                BackupDatabaseBeforeMigration(dbPath);
                ApplyMigration56(conn);
            }

            // 60. Apply Migration 57: Item Modifiers & Customizations (Story 140 / Feature #197)
            if (currentVersion < 57)
            {
                BackupDatabaseBeforeMigration(dbPath);
                ApplyMigration57(conn);
            }

            // 61. Apply Migration 58: Delivery Zones, Riders & Delivery Orders (Story 142 / Feature #199)
            if (currentVersion < 58)
            {
                BackupDatabaseBeforeMigration(dbPath);
                ApplyMigration58(conn);
            }

            // 62. Apply Migration 59: Manufacturing Recipes (BOM) & Production Batches (Story 143 / Feature #200)
            if (currentVersion < 59)
            {
                BackupDatabaseBeforeMigration(dbPath);
                ApplyMigration59(conn);
            }
        }

        private static void ApplyMigration56(SQLiteConnection conn)
        {
            using (var trans = conn.BeginTransaction())
            {
                try
                {
                    string createTablesSql = @"
                        CREATE TABLE IF NOT EXISTS restaurant_tables (
                            id TEXT PRIMARY KEY,
                            name TEXT NOT NULL,
                            zone_name TEXT NOT NULL DEFAULT 'الصالة الداخلية',
                            capacity INTEGER NOT NULL DEFAULT 4,
                            status TEXT NOT NULL DEFAULT 'available',
                            active_held_sale_id TEXT DEFAULT NULL,
                            waiter_name TEXT DEFAULT NULL,
                            guests_count INTEGER NOT NULL DEFAULT 0,
                            opened_at TEXT DEFAULT NULL,
                            display_order INTEGER NOT NULL DEFAULT 0,
                            is_active INTEGER NOT NULL DEFAULT 1,
                            created_at TEXT NOT NULL,
                            updated_at TEXT NOT NULL
                        );
                        CREATE INDEX IF NOT EXISTS idx_restaurant_tables_status ON restaurant_tables(status, is_active);
                    ";
                    using (var cmd = new SQLiteCommand(createTablesSql, conn, trans))
                    {
                        cmd.ExecuteNonQuery();
                    }

                    string[] salesCols = new string[]
                    {
                        "ALTER TABLE sales ADD COLUMN order_type TEXT NOT NULL DEFAULT 'takeaway';",
                        "ALTER TABLE sales ADD COLUMN order_call_number INTEGER NOT NULL DEFAULT 0;",
                        "ALTER TABLE sales ADD COLUMN table_id TEXT DEFAULT NULL;",
                        "ALTER TABLE sales ADD COLUMN table_name TEXT DEFAULT NULL;",
                        "ALTER TABLE sales ADD COLUMN guests_count INTEGER NOT NULL DEFAULT 0;",
                        "ALTER TABLE sales ADD COLUMN waiter_name TEXT DEFAULT NULL;",
                        "ALTER TABLE sales ADD COLUMN service_charge_piasters INTEGER NOT NULL DEFAULT 0;",
                        "ALTER TABLE sales ADD COLUMN delivery_fee_piasters INTEGER NOT NULL DEFAULT 0;"
                    };
                    for (int i = 0; i < salesCols.Length; i++)
                    {
                        try
                        {
                            using (var cmd = new SQLiteCommand(salesCols[i], conn, trans))
                            {
                                cmd.ExecuteNonQuery();
                            }
                        }
                        catch { }
                    }

                    string[] heldCols = new string[]
                    {
                        "ALTER TABLE held_sales ADD COLUMN table_id TEXT DEFAULT NULL;",
                        "ALTER TABLE held_sales ADD COLUMN table_name TEXT DEFAULT NULL;",
                        "ALTER TABLE held_sales ADD COLUMN order_type TEXT NOT NULL DEFAULT 'takeaway';",
                        "ALTER TABLE held_sales ADD COLUMN waiter_name TEXT DEFAULT NULL;",
                        "ALTER TABLE held_sales ADD COLUMN guests_count INTEGER NOT NULL DEFAULT 0;",
                        "ALTER TABLE held_sales ADD COLUMN printed_kot_quantities_json TEXT DEFAULT '{}';"
                    };
                    for (int i = 0; i < heldCols.Length; i++)
                    {
                        try
                        {
                            using (var cmd = new SQLiteCommand(heldCols[i], conn, trans))
                            {
                                cmd.ExecuteNonQuery();
                            }
                        }
                        catch { }
                    }

                    try
                    {
                        using (var cmd = new SQLiteCommand("ALTER TABLE categories ADD COLUMN kot_station TEXT NOT NULL DEFAULT 'kitchen';", conn, trans))
                        {
                            cmd.ExecuteNonQuery();
                        }
                    }
                    catch { }

                    using (var counterCmd = new SQLiteCommand("INSERT OR IGNORE INTO counters (name, current_value) VALUES ('order_call_number', 0);", conn, trans))
                    {
                        counterCmd.ExecuteNonQuery();
                    }

                    string nowIso = DateTime.UtcNow.ToString("o");
                    string seedTablesSql = @"
                        INSERT OR IGNORE INTO restaurant_tables (id, name, zone_name, capacity, status, display_order, is_active, created_at, updated_at) VALUES
                        ('tbl_default_01', 'طاولة 1', 'الصالة الداخلية', 4, 'available', 1, 1, @now, @now),
                        ('tbl_default_02', 'طاولة 2', 'الصالة الداخلية', 4, 'available', 2, 1, @now, @now),
                        ('tbl_default_03', 'طاولة 3', 'الصالة الداخلية', 4, 'available', 3, 1, @now, @now),
                        ('tbl_default_04', 'طاولة 4', 'الصالة الداخلية', 6, 'available', 4, 1, @now, @now),
                        ('tbl_default_05', 'طاولة 5', 'الصالة الداخلية', 6, 'available', 5, 1, @now, @now),
                        ('tbl_default_06', 'طاولة 6', 'الصالة الداخلية', 2, 'available', 6, 1, @now, @now),
                        ('tbl_default_07', 'تراس 1', 'التراس الخارجي', 4, 'available', 7, 1, @now, @now),
                        ('tbl_default_08', 'تراس 2', 'التراس الخارجي', 4, 'available', 8, 1, @now, @now),
                        ('tbl_default_09', 'VIP 1', 'ركن العائلات VIP', 8, 'available', 9, 1, @now, @now);
                    ";
                    using (var seedCmd = new SQLiteCommand(seedTablesSql, conn, trans))
                    {
                        seedCmd.Parameters.AddWithValue("@now", nowIso);
                        seedCmd.ExecuteNonQuery();
                    }

                    using (var migCmd = new SQLiteCommand(@"
                        INSERT OR REPLACE INTO schema_migrations (version, name, applied_at)
                        VALUES (56, 'Cafe & Restaurant Table Management, KOT Routing & Order Modes (Story 139 / Feature #196)', datetime('now'));
                    ", conn, trans))
                    {
                        migCmd.ExecuteNonQuery();
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

        private static void ApplyMigration57(SQLiteConnection conn)
        {
            using (var trans = conn.BeginTransaction())
            {
                try
                {
                    string sql = @"
                        CREATE TABLE IF NOT EXISTS modifier_groups (
                            id TEXT PRIMARY KEY,
                            name TEXT NOT NULL,
                            selection_type TEXT NOT NULL DEFAULT 'multiple',
                            is_required INTEGER NOT NULL DEFAULT 0,
                            min_selections INTEGER NOT NULL DEFAULT 0,
                            max_selections INTEGER NOT NULL DEFAULT 5,
                            display_order INTEGER NOT NULL DEFAULT 0,
                            is_active INTEGER NOT NULL DEFAULT 1,
                            created_at TEXT NOT NULL,
                            updated_at TEXT NOT NULL
                        );

                        CREATE TABLE IF NOT EXISTS modifier_options (
                            id TEXT PRIMARY KEY,
                            group_id TEXT NOT NULL,
                            name TEXT NOT NULL,
                            extra_price_piasters INTEGER NOT NULL DEFAULT 0,
                            cost_piasters INTEGER NOT NULL DEFAULT 0,
                            linked_ingredient_id TEXT DEFAULT NULL,
                            linked_qty_milli INTEGER NOT NULL DEFAULT 0,
                            is_default INTEGER NOT NULL DEFAULT 0,
                            display_order INTEGER NOT NULL DEFAULT 0,
                            is_active INTEGER NOT NULL DEFAULT 1,
                            created_at TEXT NOT NULL,
                            FOREIGN KEY (group_id) REFERENCES modifier_groups(id) ON DELETE CASCADE
                        );

                        CREATE TABLE IF NOT EXISTS product_modifier_groups (
                            product_id TEXT NOT NULL,
                            group_id TEXT NOT NULL,
                            display_order INTEGER NOT NULL DEFAULT 0,
                            PRIMARY KEY (product_id, group_id),
                            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
                            FOREIGN KEY (group_id) REFERENCES modifier_groups(id) ON DELETE CASCADE
                        );

                        CREATE TABLE IF NOT EXISTS sale_item_modifiers (
                            id TEXT PRIMARY KEY,
                            sale_item_id TEXT NOT NULL,
                            sale_id TEXT NOT NULL,
                            option_id TEXT,
                            group_name TEXT NOT NULL,
                            option_name TEXT NOT NULL,
                            extra_price_piasters INTEGER NOT NULL DEFAULT 0,
                            quantity_milli INTEGER NOT NULL DEFAULT 1000,
                            FOREIGN KEY (sale_item_id) REFERENCES sale_items(id) ON DELETE CASCADE,
                            FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE
                        );
                        CREATE INDEX IF NOT EXISTS idx_sale_item_modifiers_sale ON sale_item_modifiers(sale_id);
                    ";
                    using (var cmd = new SQLiteCommand(sql, conn, trans))
                    {
                        cmd.ExecuteNonQuery();
                    }

                    using (var migCmd = new SQLiteCommand(@"
                        INSERT OR REPLACE INTO schema_migrations (version, name, applied_at)
                        VALUES (57, 'Item Modifiers & Customizations (Story 140 / Feature #197)', datetime('now'));
                    ", conn, trans))
                    {
                        migCmd.ExecuteNonQuery();
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

        private static void ApplyMigration58(SQLiteConnection conn)
        {
            using (var trans = conn.BeginTransaction())
            {
                try
                {
                    string sql = @"
                        CREATE TABLE IF NOT EXISTS delivery_zones (
                            id TEXT PRIMARY KEY,
                            name TEXT NOT NULL,
                            fee_piasters INTEGER NOT NULL DEFAULT 0,
                            estimated_minutes INTEGER NOT NULL DEFAULT 30,
                            min_order_piasters INTEGER NOT NULL DEFAULT 0,
                            rider_commission_piasters INTEGER NOT NULL DEFAULT 0,
                            display_order INTEGER NOT NULL DEFAULT 0,
                            is_active INTEGER NOT NULL DEFAULT 1,
                            created_at TEXT NOT NULL,
                            updated_at TEXT NOT NULL
                        );

                        CREATE TABLE IF NOT EXISTS delivery_riders (
                            id TEXT PRIMARY KEY,
                            name TEXT NOT NULL,
                            phone TEXT DEFAULT '',
                            vehicle_type TEXT NOT NULL DEFAULT 'motorcycle',
                            commission_per_order_piasters INTEGER NOT NULL DEFAULT 0,
                            status TEXT NOT NULL DEFAULT 'available',
                            is_active INTEGER NOT NULL DEFAULT 1,
                            notes TEXT DEFAULT '',
                            created_at TEXT NOT NULL,
                            updated_at TEXT NOT NULL
                        );

                        CREATE TABLE IF NOT EXISTS delivery_orders (
                            id TEXT PRIMARY KEY,
                            sale_id TEXT NOT NULL,
                            invoice_number INTEGER NOT NULL,
                            order_call_number INTEGER NOT NULL DEFAULT 0,
                            customer_id TEXT DEFAULT NULL,
                            customer_name TEXT NOT NULL,
                            customer_phone TEXT NOT NULL,
                            delivery_address TEXT NOT NULL,
                            landmark TEXT DEFAULT '',
                            zone_id TEXT DEFAULT NULL,
                            zone_name TEXT DEFAULT '',
                            delivery_fee_piasters INTEGER NOT NULL DEFAULT 0,
                            rider_id TEXT DEFAULT NULL,
                            rider_name TEXT DEFAULT '',
                            status TEXT NOT NULL DEFAULT 'preparing',
                            payment_method TEXT NOT NULL DEFAULT 'cash',
                            total_to_collect_piasters INTEGER NOT NULL DEFAULT 0,
                            is_settled INTEGER NOT NULL DEFAULT 0,
                            settled_at TEXT DEFAULT NULL,
                            settled_by_user_id TEXT DEFAULT NULL,
                            dispatched_at TEXT DEFAULT NULL,
                            delivered_at TEXT DEFAULT NULL,
                            notes TEXT DEFAULT '',
                            created_at TEXT NOT NULL,
                            updated_at TEXT NOT NULL,
                            FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE
                        );
                        CREATE INDEX IF NOT EXISTS idx_delivery_orders_status ON delivery_orders(status, is_settled);
                        CREATE INDEX IF NOT EXISTS idx_delivery_orders_rider ON delivery_orders(rider_id, is_settled);
                        CREATE INDEX IF NOT EXISTS idx_delivery_orders_sale ON delivery_orders(sale_id);
                    ";
                    using (var cmd = new SQLiteCommand(sql, conn, trans))
                    {
                        cmd.ExecuteNonQuery();
                    }

                    using (var migCmd = new SQLiteCommand(@"
                        INSERT OR REPLACE INTO schema_migrations (version, name, applied_at)
                        VALUES (58, 'Delivery Zones, Riders & Delivery Orders (Story 142 / Feature #199)', datetime('now'));
                    ", conn, trans))
                    {
                        migCmd.ExecuteNonQuery();
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

        private static void ApplyMigration59(SQLiteConnection conn)
        {
            using (var trans = conn.BeginTransaction())
            {
                try
                {
                    string sql = @"
                        CREATE TABLE IF NOT EXISTS recipes (
                            id TEXT PRIMARY KEY,
                            product_id TEXT NOT NULL UNIQUE,
                            name TEXT NOT NULL,
                            yield_qty_milli INTEGER NOT NULL DEFAULT 1000,
                            depletion_mode TEXT NOT NULL DEFAULT 'on_sale',
                            notes TEXT DEFAULT '',
                            is_active INTEGER NOT NULL DEFAULT 1,
                            created_at TEXT NOT NULL,
                            updated_at TEXT NOT NULL,
                            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
                        );

                        CREATE TABLE IF NOT EXISTS recipe_ingredients (
                            id TEXT PRIMARY KEY,
                            recipe_id TEXT NOT NULL,
                            ingredient_product_id TEXT NOT NULL,
                            quantity_milli INTEGER NOT NULL,
                            wastage_percent INTEGER NOT NULL DEFAULT 0,
                            sort_order INTEGER NOT NULL DEFAULT 0,
                            created_at TEXT NOT NULL,
                            FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE,
                            FOREIGN KEY (ingredient_product_id) REFERENCES products(id) ON DELETE RESTRICT
                        );
                        CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe ON recipe_ingredients(recipe_id);

                        CREATE TABLE IF NOT EXISTS production_batches (
                            id TEXT PRIMARY KEY,
                            batch_number TEXT NOT NULL,
                            recipe_id TEXT NOT NULL,
                            product_id TEXT NOT NULL,
                            product_name TEXT NOT NULL,
                            produced_qty_milli INTEGER NOT NULL,
                            total_cost_piasters INTEGER NOT NULL,
                            unit_cost_piasters INTEGER NOT NULL,
                            produced_by_user_id TEXT DEFAULT NULL,
                            produced_by_name TEXT DEFAULT '',
                            notes TEXT DEFAULT '',
                            created_at TEXT NOT NULL,
                            FOREIGN KEY (recipe_id) REFERENCES recipes(id),
                            FOREIGN KEY (product_id) REFERENCES products(id)
                        );
                        CREATE INDEX IF NOT EXISTS idx_production_batches_date ON production_batches(created_at);
                    ";
                    using (var cmd = new SQLiteCommand(sql, conn, trans))
                    {
                        cmd.ExecuteNonQuery();
                    }

                    using (var migCmd = new SQLiteCommand(@"
                        INSERT OR REPLACE INTO schema_migrations (version, name, applied_at)
                        VALUES (59, 'Manufacturing Recipes (BOM) & Production Batches (Story 143 / Feature #200)', datetime('now'));
                    ", conn, trans))
                    {
                        migCmd.ExecuteNonQuery();
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
