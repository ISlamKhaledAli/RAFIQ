using System;
using System.Collections.Generic;
using System.IO;
using System.Data.SQLite;

namespace RafiqPOS.Database
{
    public static class MigrationRunner
    {
        public const int LATEST_SUPPORTED_VERSION = 51;

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

                // Ensure price history has audit and batch tracking columns (Feature #116 Stabilization)
                try
                {
                    using (var cmd = new SQLiteCommand("ALTER TABLE product_price_history ADD COLUMN user_id TEXT DEFAULT '';", conn)) { cmd.ExecuteNonQuery(); }
                }
                catch { }
                try
                {
                    using (var cmd = new SQLiteCommand("ALTER TABLE product_price_history ADD COLUMN user_name TEXT DEFAULT '';", conn)) { cmd.ExecuteNonQuery(); }
                }
                catch { }
                try
                {
                    using (var cmd = new SQLiteCommand("ALTER TABLE product_price_history ADD COLUMN batch_id TEXT DEFAULT '';", conn)) { cmd.ExecuteNonQuery(); }
                }
                catch { }
                try
                {
                    using (var cmd = new SQLiteCommand("CREATE INDEX IF NOT EXISTS idx_price_history_batch_id ON product_price_history(batch_id);", conn)) { cmd.ExecuteNonQuery(); }
                }
                catch { }

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

                // 21. Apply Migration 18: Reseal and Repair Audit Log Hash Chain (Feature #169 Fix)
                if (currentVersion < 18)
                {
                    BackupDatabaseBeforeMigration(dbPath);
                    ApplyMigration18(conn);
                }

                // 22. Apply Migration 19: Clean Slate for Transactions and Debts (Fresh Install)
                if (currentVersion < 19)
                {
                    BackupDatabaseBeforeMigration(dbPath);
                    ApplyMigration19(conn);
                }

                // 23. Apply Migration 20: Held Sales and Returns System (Milestone 7 / Features #25, #26, #33)
                if (currentVersion < 20)
                {
                    BackupDatabaseBeforeMigration(dbPath);
                    ApplyMigration20(conn);
                }

                // 24. Apply Migration 21: Suppliers and Purchases Management (Milestone 8 / Features #38, #39)
                if (currentVersion < 21)
                {
                    BackupDatabaseBeforeMigration(dbPath);
                    ApplyMigration21(conn);
                }

                // 25. Apply Migration 22: Daily Closing and Reporting System (Milestone 9 / Features #45, #48, #49, #50, #127, #137)
                if (currentVersion < 22)
                {
                    BackupDatabaseBeforeMigration(dbPath);
                    ApplyMigration22(conn);
                }

                // 26. Apply Migration 23: Customer Archival (Soft Delete) Support
                if (currentVersion < 23)
                {
                    BackupDatabaseBeforeMigration(dbPath);
                    ApplyMigration23(conn);
                }

                // 27. Apply Migration 24: Product Batches and Expiry Tracking System (Feature #60)
                if (currentVersion < 24)
                {
                    BackupDatabaseBeforeMigration(dbPath);
                    ApplyMigration24(conn);
                }

                // 28. Apply Migration 25: Product Variants (Sizes & Colors) System (Feature #114)
                if (currentVersion < 25)
                {
                    BackupDatabaseBeforeMigration(dbPath);
                    ApplyMigration25(conn);
                }

                // 29. Apply Migration 26: Hierarchical Authentication and Permission Tree System
                if (currentVersion < 26)
                {
                    BackupDatabaseBeforeMigration(dbPath);
                    ApplyMigration26(conn);
                }

                // 30. Apply Migration 27: Electronic Payment Terminals (SuperPay / Fawry / Aman) & Services System
                if (currentVersion < 27)
                {
                    BackupDatabaseBeforeMigration(dbPath);
                    ApplyMigration27(conn);
                }

                // 31. Apply Migration 28: Electronic Payment Terminals Dynamic Fee & Commission Rules
                if (currentVersion < 28)
                {
                    BackupDatabaseBeforeMigration(dbPath);
                    ApplyMigration28(conn);
                }

                // 32. Apply Migration 29: Pass-through e-payment service fees stored outside sales revenue
                if (currentVersion < 29)
                {
                    BackupDatabaseBeforeMigration(dbPath);
                    ApplyMigration29(conn);
                }

                // 33. Apply Migration 30: Advanced Tiered and Per-Service Fee Rules for Electronic Payment
                if (currentVersion < 30)
                {
                    BackupDatabaseBeforeMigration(dbPath);
                    ApplyMigration30(conn);
                }

                // 34. Apply Migration 31: Digital Wallets (Vodafone Cash, etc.) and InstaPay Accounts
                if (currentVersion < 31)
                {
                    BackupDatabaseBeforeMigration(dbPath);
                    ApplyMigration31(conn);
                }

                // 35. Apply Migration 32: Shifts and Cash Drawer Management System (Story 8 / Cashier Shifts)
                if (currentVersion < 32)
                {
                    BackupDatabaseBeforeMigration(dbPath);
                    ApplyMigration32(conn);
                }

                // 36. Apply Migration 33: Petty Cash & Expense System Stabilization (Corporate Controller)
                if (currentVersion < 33)
                {
                    BackupDatabaseBeforeMigration(dbPath);
                    ApplyMigration33(conn);
                }

                // 37. Apply Migration 34: Purchase Bonuses, Item Discounts, and Purchase Returns System (Feature 38/39 Hardening)
                if (currentVersion < 34)
                {
                    BackupDatabaseBeforeMigration(dbPath);
                    ApplyMigration34(conn);
                }

                // 38. Apply Migration 35: Forensic Audit & Compliance Engine (Tamper-Proof Triggers & Query Optimization)
                if (currentVersion < 35)
                {
                    BackupDatabaseBeforeMigration(dbPath);
                    ApplyMigration35(conn);
                }

                // 39. Apply Migration 36: Security Hardening (Deactivate Developer Backdoor & Enforce Owner PIN Change)
                if (currentVersion < 36)
                {
                    BackupDatabaseBeforeMigration(dbPath);
                    ApplyMigration36(conn);
                }

                // 40. Apply Migration 37: Dual-Wrap Envelope Encryption & Owner Recovery Code (F-42, F-43)
                if (currentVersion < 37)
                {
                    BackupDatabaseBeforeMigration(dbPath);
                    ApplyMigration37(conn);
                }

                // 41. Apply Migration 38: Debt Allocations Table & Expense Contra-Entry Chain (F-25, F-28, F-23)
                if (currentVersion < 38)
                {
                    BackupDatabaseBeforeMigration(dbPath);
                    ApplyMigration38(conn);
                }

                // 42. Apply Migration 39: Persistent Checkout Idempotency (F-09, F-45)
                if (currentVersion < 39)
                {
                    BackupDatabaseBeforeMigration(dbPath);
                    ApplyMigration39(conn);
                }

                // 43. Apply Migration 40: Packaging Precision and Shift-Level Isolation (F-34, F-15)
                if (currentVersion < 40)
                {
                    BackupDatabaseBeforeMigration(dbPath);
                    ApplyMigration40(conn);
                }

                // 44. Apply Migration 41: Non-Cash Debt Settlement & Ledger Optimization (F-07)
                if (currentVersion < 41)
                {
                    BackupDatabaseBeforeMigration(dbPath);
                    ApplyMigration41(conn);
                }

                // 45. Apply Migration 42: Multi-Pack Loose Selling & Packaging Columns (Story 126 / Feature #183)
                if (currentVersion < 42)
                {
                    BackupDatabaseBeforeMigration(dbPath);
                    ApplyMigration42(conn);
                }

                // 46. Apply Migration 43: Batch-Level Pricing & Sale Item Allocations (Story 127 / Feature #184)
                if (currentVersion < 43)
                {
                    BackupDatabaseBeforeMigration(dbPath);
                    ApplyMigration43(conn);
                }

                // 47. Apply Migration 44: Storage Locations, Racks & Shelves (Story 128 / Feature #185)
                if (currentVersion < 44)
                {
                    BackupDatabaseBeforeMigration(dbPath);
                    ApplyMigration44(conn);
                }

                // 48. Apply Migration 45: Shortage Book & Pharmacy Core Extension (Stories 129 & 130 / Features #186 & #187)
                if (currentVersion < 45)
                {
                    BackupDatabaseBeforeMigration(dbPath);
                    ApplyMigration45(conn);
                }

                // 49. Apply Migration 46: Controlled Drugs Register & Prescriptions (Story 131 / Feature #188)
                if (currentVersion < 46)
                {
                    BackupDatabaseBeforeMigration(dbPath);
                    ApplyMigration46(conn);
                }

                // 50. Apply Migration 47: Patient Profiles and Chronic Disease Tracking (Story 133 / Feature #190)
                if (currentVersion < 47)
                {
                    BackupDatabaseBeforeMigration(dbPath);
                    ApplyMigration47(conn);
                }

                // 51. Apply Migration 48: Health Insurance, Co-Payment Claims & Corporate Billing (Story 132 / Feature #189)
                if (currentVersion < 48)
                {
                    BackupDatabaseBeforeMigration(dbPath);
                    ApplyMigration48(conn);
                }

                // 52. Apply Migration 49: Supplier Expiry Returns & External Drug Reference (Story 134 / Feature #191)
                if (currentVersion < 49)
                {
                    BackupDatabaseBeforeMigration(dbPath);
                    ApplyMigration49(conn);
                }

                // 53. Apply Migration 50: Pharmacy Distributor Purchases & Public Price (Story 136 / Feature #193)
                if (currentVersion < 50)
                {
                    BackupDatabaseBeforeMigration(dbPath);
                    ApplyMigration50(conn);
                }

                // 54. Apply Migration 51: Seed Pharma Manufacturers & Extend Drug Reference (Story 134 Extension)
                if (currentVersion < 51)
                {
                    BackupDatabaseBeforeMigration(dbPath);
                    ApplyMigration51(conn);
                }

                // Self-Healing Schema Guard: Automatically repair missing columns or indexes
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

                            // Zero pre-seeded categories policy: categories table starts clean without pre-seeded mock categories
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

                            if (!existingCols.Contains("default_sale_unit_id"))
                            {
                                using (var alter = new SQLiteCommand("ALTER TABLE products ADD COLUMN default_sale_unit_id TEXT DEFAULT NULL;", conn, trans))
                                {
                                    alter.ExecuteNonQuery();
                                }
                            }

                            if (!existingCols.Contains("default_purchase_unit_id"))
                            {
                                using (var alter = new SQLiteCommand("ALTER TABLE products ADD COLUMN default_purchase_unit_id TEXT DEFAULT NULL;", conn, trans))
                                {
                                    alter.ExecuteNonQuery();
                                }
                            }

                            if (!existingCols.Contains("display_unit_id"))
                            {
                                using (var alter = new SQLiteCommand("ALTER TABLE products ADD COLUMN display_unit_id TEXT DEFAULT NULL;", conn, trans))
                                {
                                    alter.ExecuteNonQuery();
                                }
                            }

                            if (!existingCols.Contains("is_loose_sellable"))
                            {
                                using (var alter = new SQLiteCommand("ALTER TABLE products ADD COLUMN is_loose_sellable INTEGER NOT NULL DEFAULT 0;", conn, trans))
                                {
                                    alter.ExecuteNonQuery();
                                }
                                using (var idx = new SQLiteCommand("CREATE INDEX IF NOT EXISTS idx_products_loose_sellable ON products(is_loose_sellable);", conn, trans))
                                {
                                    idx.ExecuteNonQuery();
                                }
                            }

                            if (!existingCols.Contains("location_id"))
                            {
                                using (var alter = new SQLiteCommand("ALTER TABLE products ADD COLUMN location_id TEXT DEFAULT NULL;", conn, trans))
                                {
                                    alter.ExecuteNonQuery();
                                }
                                using (var idx = new SQLiteCommand("CREATE INDEX IF NOT EXISTS idx_products_location ON products(location_id);", conn, trans))
                                {
                                    idx.ExecuteNonQuery();
                                }
                            }

                            if (!existingCols.Contains("is_cold_chain"))
                            {
                                using (var alter = new SQLiteCommand("ALTER TABLE products ADD COLUMN is_cold_chain INTEGER NOT NULL DEFAULT 0;", conn, trans))
                                {
                                    alter.ExecuteNonQuery();
                                }
                                using (var idx = new SQLiteCommand("CREATE INDEX IF NOT EXISTS idx_products_cold_chain ON products(is_cold_chain);", conn, trans))
                                {
                                    idx.ExecuteNonQuery();
                                }
                            }

                            if (!existingCols.Contains("preferred_supplier_id"))
                            {
                                using (var alter = new SQLiteCommand("ALTER TABLE products ADD COLUMN preferred_supplier_id TEXT DEFAULT NULL;", conn, trans))
                                {
                                    alter.ExecuteNonQuery();
                                }
                                using (var idx = new SQLiteCommand("CREATE INDEX IF NOT EXISTS idx_products_pref_supplier ON products(preferred_supplier_id);", conn, trans))
                                {
                                    idx.ExecuteNonQuery();
                                }
                            }

                            if (!existingCols.Contains("is_archived"))
                            {
                                using (var alter = new SQLiteCommand("ALTER TABLE products ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0;", conn, trans))
                                {
                                    alter.ExecuteNonQuery();
                                }
                                using (var syncArchived = new SQLiteCommand("UPDATE products SET is_archived = CASE WHEN is_active = 0 THEN 1 ELSE 0 END;", conn, trans))
                                {
                                    syncArchived.ExecuteNonQuery();
                                }
                                using (var idx = new SQLiteCommand("CREATE INDEX IF NOT EXISTS idx_products_is_archived ON products(is_archived);", conn, trans))
                                {
                                    idx.ExecuteNonQuery();
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

                    // 3. Health check for customers table (is_archived column)
                    using (var checkCustCmd = new SQLiteCommand("SELECT name FROM sqlite_master WHERE type='table' AND name='customers';", conn, trans))
                    {
                        var tbl = checkCustCmd.ExecuteScalar();
                        if (tbl != null)
                        {
                            var existingCols = new System.Collections.Generic.HashSet<string>(StringComparer.OrdinalIgnoreCase);
                            using (var infoCmd = new SQLiteCommand("PRAGMA table_info(customers);", conn, trans))
                            using (var reader = infoCmd.ExecuteReader())
                            {
                                while (reader.Read())
                                {
                                    existingCols.Add(reader["name"].ToString());
                                }
                            }

                            if (!existingCols.Contains("is_archived"))
                            {
                                using (var alter = new SQLiteCommand("ALTER TABLE customers ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0;", conn, trans))
                                {
                                    alter.ExecuteNonQuery();
                                }
                            }

                            using (var idxCmd = new SQLiteCommand("CREATE INDEX IF NOT EXISTS idx_customers_is_archived ON customers(is_archived);", conn, trans))
                            {
                                idxCmd.ExecuteNonQuery();
                            }
                        }
                    }

                    // 3.5. Health check for customer_ledger table: Ensure all amount_piasters are positive absolute magnitudes and shift_id exists (F-15)
                    using (var checkLedgerCmd = new SQLiteCommand("SELECT name FROM sqlite_master WHERE type='table' AND name='customer_ledger';", conn, trans))
                    {
                        var tbl = checkLedgerCmd.ExecuteScalar();
                        if (tbl != null)
                        {
                            var clCols = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                            using (var infoCmd = new SQLiteCommand("PRAGMA table_info(customer_ledger);", conn, trans))
                            using (var reader = infoCmd.ExecuteReader())
                            {
                                while (reader.Read())
                                {
                                    clCols.Add(reader["name"].ToString());
                                }
                            }
                            if (!clCols.Contains("shift_id"))
                            {
                                using (var alter = new SQLiteCommand("ALTER TABLE customer_ledger ADD COLUMN shift_id TEXT;", conn, trans))
                                {
                                    alter.ExecuteNonQuery();
                                }
                            }
                            using (var idxCmd = new SQLiteCommand("CREATE INDEX IF NOT EXISTS idx_customer_ledger_shift_id ON customer_ledger(shift_id);", conn, trans))
                            {
                                idxCmd.ExecuteNonQuery();
                            }

                            using (var fixNegCmd = new SQLiteCommand("UPDATE customer_ledger SET amount_piasters = ABS(amount_piasters) WHERE amount_piasters < 0;", conn, trans))
                            {
                                fixNegCmd.ExecuteNonQuery();
                            }
                        }
                    }

                    // 3.6. Health check for returns table: Ensure shift_id exists (F-15)
                    using (var checkRetCmd = new SQLiteCommand("SELECT name FROM sqlite_master WHERE type='table' AND name='returns';", conn, trans))
                    {
                        var tbl = checkRetCmd.ExecuteScalar();
                        if (tbl != null)
                        {
                            var retCols = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                            using (var infoCmd = new SQLiteCommand("PRAGMA table_info(returns);", conn, trans))
                            using (var reader = infoCmd.ExecuteReader())
                            {
                                while (reader.Read())
                                {
                                    retCols.Add(reader["name"].ToString());
                                }
                            }
                            if (!retCols.Contains("shift_id"))
                            {
                                using (var alter = new SQLiteCommand("ALTER TABLE returns ADD COLUMN shift_id TEXT;", conn, trans))
                                {
                                    alter.ExecuteNonQuery();
                                }
                            }
                            using (var idxCmd = new SQLiteCommand("CREATE INDEX IF NOT EXISTS idx_returns_shift_id ON returns(shift_id);", conn, trans))
                            {
                                idxCmd.ExecuteNonQuery();
                            }
                        }
                    }

                    // 4. Health check for sales table
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

                            // Sync sales status for any sales that have records in returns table
                            using (var checkRetTable = new SQLiteCommand("SELECT name FROM sqlite_master WHERE type='table' AND name='returns';", conn, trans))
                            {
                                if (checkRetTable.ExecuteScalar() != null)
                                {
                                    using (var syncReturnsCmd = new SQLiteCommand(@"
                                        UPDATE sales 
                                        SET status = 'refunded' 
                                        WHERE status = 'completed' 
                                          AND (
                                              id IN (SELECT DISTINCT sale_id FROM returns WHERE sale_id IS NOT NULL AND sale_id != '')
                                              OR invoice_number IN (SELECT DISTINCT invoice_number FROM returns WHERE invoice_number IS NOT NULL)
                                          );
                                    ", conn, trans))
                                    {
                                        syncReturnsCmd.ExecuteNonQuery();
                                    }
                                }
                            }

                            if (!existingCols.Contains("idempotency_key"))
                            {
                                using (var alter = new SQLiteCommand("ALTER TABLE sales ADD COLUMN idempotency_key TEXT DEFAULT NULL;", conn, trans))
                                {
                                    alter.ExecuteNonQuery();
                                }
                            }

                            using (var idxCmd = new SQLiteCommand(@"
                                CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_idempotency ON sales(idempotency_key) WHERE idempotency_key IS NOT NULL AND idempotency_key != '';
                            ", conn, trans))
                            {
                                idxCmd.ExecuteNonQuery();
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
                        DROP INDEX IF EXISTS idx_sales_date_expr;
                        DROP INDEX IF EXISTS idx_sales_date_utc_expr;
                        DROP INDEX IF EXISTS idx_returns_date_expr;
                        DROP INDEX IF EXISTS idx_expenses_date_expr;
                        DROP INDEX IF EXISTS idx_customer_ledger_date_expr;

                        CREATE INDEX IF NOT EXISTS idx_stock_movements_covering ON stock_movements(product_id, quantity_milli);
                        CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(status);
                        CREATE INDEX IF NOT EXISTS idx_sales_customer_id ON sales(customer_id);
                        CREATE INDEX IF NOT EXISTS idx_sales_payment_method ON sales(payment_method);
                        CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at);
                        CREATE INDEX IF NOT EXISTS idx_sales_created_status ON sales(created_at, status);
                        CREATE INDEX IF NOT EXISTS idx_sales_status_created ON sales(status, created_at);
                        CREATE INDEX IF NOT EXISTS idx_sales_date_substr ON sales(substr(created_at, 1, 10), status);
                        CREATE INDEX IF NOT EXISTS idx_sales_tax_piasters ON sales(tax_piasters);
                        CREATE INDEX IF NOT EXISTS idx_sale_items_product_id ON sale_items(product_id);
                        CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON sale_items(sale_id);
                        CREATE INDEX IF NOT EXISTS idx_sale_items_perf ON sale_items(sale_id, unit_cost_piasters, quantity_milli);
                        CREATE INDEX IF NOT EXISTS idx_returns_created_at ON returns(created_at);
                        CREATE INDEX IF NOT EXISTS idx_expenses_created_cancelled ON expenses(created_at, is_cancelled);
                        CREATE INDEX IF NOT EXISTS idx_customer_ledger_created_type ON customer_ledger(created_at, type);
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
                        if (!siCols.Contains("batch_number"))
                        {
                            using (var alter = new SQLiteCommand("ALTER TABLE sale_items ADD COLUMN batch_number TEXT;", conn, trans))
                            {
                                alter.ExecuteNonQuery();
                            }
                        }
                        if (!siCols.Contains("batch_id"))
                        {
                            using (var alter = new SQLiteCommand("ALTER TABLE sale_items ADD COLUMN batch_id TEXT;", conn, trans))
                            {
                                alter.ExecuteNonQuery();
                            }
                        }
                        if (!siCols.Contains("expiry_date"))
                        {
                            using (var alter = new SQLiteCommand("ALTER TABLE sale_items ADD COLUMN expiry_date TEXT;", conn, trans))
                            {
                                alter.ExecuteNonQuery();
                            }
                        }
                    }

                    // Check stock_movements for expiry_date column
                    using (var infoCmd = new SQLiteCommand("PRAGMA table_info(stock_movements);", conn, trans))
                    {
                        var smCols = new System.Collections.Generic.HashSet<string>(StringComparer.OrdinalIgnoreCase);
                        using (var r = infoCmd.ExecuteReader())
                        {
                            while (r.Read())
                            {
                                smCols.Add(r["name"].ToString());
                            }
                        }
                        if (!smCols.Contains("expiry_date"))
                        {
                            using (var alter = new SQLiteCommand("ALTER TABLE stock_movements ADD COLUMN expiry_date TEXT;", conn, trans))
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

                            if (!uCols.Contains("parent_id"))
                            {
                                using (var alter = new SQLiteCommand("ALTER TABLE users ADD COLUMN parent_id TEXT;", conn, trans))
                                {
                                    alter.ExecuteNonQuery();
                                }
                            }
                            if (!uCols.Contains("max_depth"))
                            {
                                using (var alter = new SQLiteCommand("ALTER TABLE users ADD COLUMN max_depth INTEGER NOT NULL DEFAULT 0;", conn, trans))
                                {
                                    alter.ExecuteNonQuery();
                                }
                            }
                            if (!uCols.Contains("created_by"))
                            {
                                using (var alter = new SQLiteCommand("ALTER TABLE users ADD COLUMN created_by TEXT;", conn, trans))
                                {
                                    alter.ExecuteNonQuery();
                                }
                            }
                            if (!uCols.Contains("can_delegate"))
                            {
                                using (var alter = new SQLiteCommand("ALTER TABLE users ADD COLUMN can_delegate INTEGER NOT NULL DEFAULT 0;", conn, trans))
                                {
                                    alter.ExecuteNonQuery();
                                }
                            }
                            if (!uCols.Contains("password_hash"))
                            {
                                using (var alter = new SQLiteCommand("ALTER TABLE users ADD COLUMN password_hash TEXT;", conn, trans))
                                {
                                    alter.ExecuteNonQuery();
                                }
                            }
                            if (!uCols.Contains("password_salt"))
                            {
                                using (var alter = new SQLiteCommand("ALTER TABLE users ADD COLUMN password_salt TEXT;", conn, trans))
                                {
                                    alter.ExecuteNonQuery();
                                }
                            }

                            using (var idxCmd = new SQLiteCommand(@"
                                CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
                                CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
                                CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);
                                CREATE INDEX IF NOT EXISTS idx_users_parent_id ON users(parent_id);
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

                            // Ensure high-speed filtering indexes on audit_logs
                            using (var idxCmd = new SQLiteCommand(@"
                                CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
                                CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
                                CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
                                CREATE INDEX IF NOT EXISTS idx_audit_logs_action_created ON audit_logs(action, created_at);
                            ", conn, trans))
                            {
                                idxCmd.ExecuteNonQuery();
                            }

                            // Ensure Tamper-Proof Triggers on audit_logs
                            using (var trgCmd = new SQLiteCommand(@"
                                CREATE TRIGGER IF NOT EXISTS trg_audit_logs_no_update
                                BEFORE UPDATE ON audit_logs
                                WHEN (SELECT value FROM app_settings WHERE key = 'allow_audit_reseal') IS NULL 
                                  OR (SELECT value FROM app_settings WHERE key = 'allow_audit_reseal') != 'CONFIRM_RESEAL_AUTHORIZED'
                                BEGIN
                                    SELECT RAISE(ABORT, 'خطأ أمني: سجل التدقيق والرقابة محمي تماماً من التعديل (Audit logs are immutable).');
                                END;

                                CREATE TRIGGER IF NOT EXISTS trg_audit_logs_no_delete
                                BEFORE DELETE ON audit_logs
                                WHEN (SELECT value FROM app_settings WHERE key = 'allow_audit_reset') IS NULL 
                                  OR (SELECT value FROM app_settings WHERE key = 'allow_audit_reset') != 'CONFIRM_PURGE_AUTHORIZED'
                                BEGIN
                                    SELECT RAISE(ABORT, 'خطأ أمني: سجل التدقيق والرقابة محمي تماماً من الحذف (Audit logs cannot be deleted).');
                                END;
                            ", conn, trans))
                            {
                                trgCmd.ExecuteNonQuery();
                            }
                        }
                    }

                    // 13. Ensure demo customer debts or records and legacy cust_general_cash are completely cleaned
                    using (var cleanDemoCmd = new SQLiteCommand(@"
                        DELETE FROM customer_ledger WHERE customer_id IN ('cust_demo_1', 'cust_demo_2', 'cust_general_cash') OR id = 'led_seed_demo_1';
                        DELETE FROM customers WHERE id IN ('cust_demo_1', 'cust_demo_2', 'cust_general_cash');
                    ", conn, trans))
                    {
                        cleanDemoCmd.ExecuteNonQuery();
                    }

                    // 14. Health check for daily_closings table (card_sales_piasters and expenses_piasters)
                    using (var checkClosingCmd = new SQLiteCommand("SELECT name FROM sqlite_master WHERE type='table' AND name='daily_closings';", conn, trans))
                    {
                        if (checkClosingCmd.ExecuteScalar() != null)
                        {
                            var dcCols = new System.Collections.Generic.HashSet<string>(StringComparer.OrdinalIgnoreCase);
                            using (var infoCmd = new SQLiteCommand("PRAGMA table_info(daily_closings);", conn, trans))
                            using (var reader = infoCmd.ExecuteReader())
                            {
                                while (reader.Read())
                                {
                                    dcCols.Add(reader["name"].ToString());
                                }
                            }

                            if (!dcCols.Contains("card_sales_piasters"))
                            {
                                using (var alter = new SQLiteCommand("ALTER TABLE daily_closings ADD COLUMN card_sales_piasters INTEGER NOT NULL DEFAULT 0;", conn, trans))
                                {
                                    alter.ExecuteNonQuery();
                                }
                            }

                            if (!dcCols.Contains("expenses_piasters"))
                            {
                                using (var alter = new SQLiteCommand("ALTER TABLE daily_closings ADD COLUMN expenses_piasters INTEGER NOT NULL DEFAULT 0;", conn, trans))
                                {
                                    alter.ExecuteNonQuery();
                                }
                            }

                            if (!dcCols.Contains("instapay_sales_piasters"))
                            {
                                using (var alter = new SQLiteCommand("ALTER TABLE daily_closings ADD COLUMN instapay_sales_piasters INTEGER NOT NULL DEFAULT 0;", conn, trans))
                                {
                                    alter.ExecuteNonQuery();
                                }
                            }

                            if (!dcCols.Contains("vodafone_cash_sales_piasters"))
                            {
                                using (var alter = new SQLiteCommand("ALTER TABLE daily_closings ADD COLUMN vodafone_cash_sales_piasters INTEGER NOT NULL DEFAULT 0;", conn, trans))
                                {
                                    alter.ExecuteNonQuery();
                                }
                            }
                        }
                    }

                    // 15. Health check for expenses table
                    using (var createExpCmd = new SQLiteCommand(@"
                        CREATE TABLE IF NOT EXISTS expenses (
                            id TEXT PRIMARY KEY,
                            expense_number INTEGER NOT NULL,
                            amount_piasters INTEGER NOT NULL,
                            category TEXT NOT NULL DEFAULT 'عام',
                            notes TEXT,
                            created_by TEXT,
                            business_date TEXT NOT NULL,
                            created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
                        );
                        CREATE INDEX IF NOT EXISTS idx_expenses_bdate ON expenses(business_date);
                        CREATE INDEX IF NOT EXISTS idx_expenses_created_at ON expenses(created_at);
                        INSERT OR IGNORE INTO counters (name, current_value, updated_at) VALUES ('expense', 0, datetime('now'));
                    ", conn, trans))
                    {
                        createExpCmd.ExecuteNonQuery();
                    }

                    try
                    {
                        using (var alterExpCmd = new SQLiteCommand("ALTER TABLE expenses ADD COLUMN replaces_expense_id TEXT DEFAULT NULL;", conn, trans))
                        {
                            alterExpCmd.ExecuteNonQuery();
                        }
                    }
                    catch { }

                    // Health check for debt_allocations table (F-25 & F-28)
                    using (var createAllocCmd = new SQLiteCommand(@"
                        CREATE TABLE IF NOT EXISTS debt_allocations (
                            id TEXT PRIMARY KEY,
                            ledger_id TEXT NOT NULL,
                            sale_id TEXT NOT NULL,
                            amount_piasters INTEGER NOT NULL,
                            type TEXT NOT NULL DEFAULT 'payment',
                            created_at TEXT NOT NULL DEFAULT (datetime('now')),
                            FOREIGN KEY (sale_id) REFERENCES sales(id)
                        );
                        CREATE INDEX IF NOT EXISTS idx_debt_alloc_sale ON debt_allocations(sale_id);
                        CREATE INDEX IF NOT EXISTS idx_debt_alloc_ledger ON debt_allocations(ledger_id);
                    ", conn, trans))
                    {
                        createAllocCmd.ExecuteNonQuery();
                    }

                    // 16. Health check for epay_terminals table (tiered & per-service fee columns)
                    using (var checkEpayCmd = new SQLiteCommand("SELECT name FROM sqlite_master WHERE type='table' AND name='epay_terminals';", conn, trans))
                    {
                        if (checkEpayCmd.ExecuteScalar() != null)
                        {
                            var epCols = new System.Collections.Generic.HashSet<string>(StringComparer.OrdinalIgnoreCase);
                            using (var infoCmd = new SQLiteCommand("PRAGMA table_info(epay_terminals);", conn, trans))
                            using (var reader = infoCmd.ExecuteReader())
                            {
                                while (reader.Read())
                                {
                                    epCols.Add(reader["name"].ToString());
                                }
                            }

                            if (!epCols.Contains("customer_fee_min_piasters"))
                            {
                                using (var alter = new SQLiteCommand("ALTER TABLE epay_terminals ADD COLUMN customer_fee_min_piasters INTEGER NOT NULL DEFAULT 0;", conn, trans))
                                {
                                    alter.ExecuteNonQuery();
                                }
                            }

                            if (!epCols.Contains("customer_fee_max_piasters"))
                            {
                                using (var alter = new SQLiteCommand("ALTER TABLE epay_terminals ADD COLUMN customer_fee_max_piasters INTEGER NOT NULL DEFAULT 0;", conn, trans))
                                {
                                    alter.ExecuteNonQuery();
                                }
                            }

                            if (!epCols.Contains("provider_commission_min_piasters"))
                            {
                                using (var alter = new SQLiteCommand("ALTER TABLE epay_terminals ADD COLUMN provider_commission_min_piasters INTEGER NOT NULL DEFAULT 0;", conn, trans))
                                {
                                    alter.ExecuteNonQuery();
                                }
                            }

                            if (!epCols.Contains("provider_commission_max_piasters"))
                            {
                                using (var alter = new SQLiteCommand("ALTER TABLE epay_terminals ADD COLUMN provider_commission_max_piasters INTEGER NOT NULL DEFAULT 0;", conn, trans))
                                {
                                    alter.ExecuteNonQuery();
                                }
                            }

                            if (!epCols.Contains("service_fee_rules_json"))
                            {
                                using (var alter = new SQLiteCommand("ALTER TABLE epay_terminals ADD COLUMN service_fee_rules_json TEXT;", conn, trans))
                                {
                                    alter.ExecuteNonQuery();
                                }
                            }
                        }
                    }

                    // 17. Health check for digital_accounts table
                    using (var checkDigitalCmd = new SQLiteCommand(@"
                        CREATE TABLE IF NOT EXISTS digital_accounts (
                            id TEXT PRIMARY KEY,
                            name TEXT NOT NULL,
                            type TEXT NOT NULL DEFAULT 'wallet',
                            provider TEXT NOT NULL DEFAULT 'vodafone_cash',
                            account_number TEXT,
                            balance_piasters INTEGER NOT NULL DEFAULT 0,
                            low_balance_alert_piasters INTEGER NOT NULL DEFAULT 50000,
                            daily_limit_piasters INTEGER NOT NULL DEFAULT 6000000,
                            monthly_limit_piasters INTEGER NOT NULL DEFAULT 20000000,
                            is_default INTEGER NOT NULL DEFAULT 0,
                            is_active INTEGER NOT NULL DEFAULT 1,
                            notes TEXT,
                            created_at TEXT NOT NULL,
                            updated_at TEXT NOT NULL
                        );

                        CREATE TABLE IF NOT EXISTS digital_transactions (
                            id TEXT PRIMARY KEY,
                            account_id TEXT NOT NULL REFERENCES digital_accounts(id),
                            tx_type TEXT NOT NULL,
                            amount_piasters INTEGER NOT NULL DEFAULT 0,
                            profit_piasters INTEGER NOT NULL DEFAULT 0,
                            total_collected_piasters INTEGER NOT NULL DEFAULT 0,
                            customer_phone TEXT,
                            customer_name TEXT,
                            reference_number TEXT,
                            sale_id TEXT,
                            cashier_name TEXT,
                            payment_destination TEXT NOT NULL DEFAULT 'cash_drawer',
                            status TEXT NOT NULL DEFAULT 'completed',
                            notes TEXT,
                            created_at TEXT NOT NULL
                        );

                        CREATE TABLE IF NOT EXISTS digital_account_fundings (
                            id TEXT PRIMARY KEY,
                            account_id TEXT NOT NULL REFERENCES digital_accounts(id),
                            amount_piasters INTEGER NOT NULL,
                            funding_source TEXT NOT NULL DEFAULT 'cash_drawer',
                            previous_balance_piasters INTEGER NOT NULL,
                            new_balance_piasters INTEGER NOT NULL,
                            notes TEXT,
                            created_by TEXT,
                            created_at TEXT NOT NULL
                        );

                        CREATE INDEX IF NOT EXISTS idx_digital_tx_acc ON digital_transactions(account_id);
                        CREATE INDEX IF NOT EXISTS idx_digital_tx_created ON digital_transactions(created_at);
                        CREATE INDEX IF NOT EXISTS idx_digital_tx_sale ON digital_transactions(sale_id);

                        INSERT OR IGNORE INTO digital_accounts (id, name, type, provider, account_number, balance_piasters, low_balance_alert_piasters, daily_limit_piasters, monthly_limit_piasters, is_default, is_active, created_at, updated_at)
                        VALUES ('acc_default_wallet', 'محفظة كاش الأساسية (فودافون كاش)', 'wallet', 'vodafone_cash', '', 0, 50000, 6000000, 20000000, 1, 1, datetime('now'), datetime('now'));

                        INSERT OR IGNORE INTO digital_accounts (id, name, type, provider, account_number, balance_piasters, low_balance_alert_piasters, daily_limit_piasters, monthly_limit_piasters, is_default, is_active, created_at, updated_at)
                        VALUES ('acc_default_instapay', 'حساب إنستاباي الأساسي', 'instapay', 'instapay', '', 0, 50000, 7000000, 40000000, 1, 1, datetime('now'), datetime('now'));
                    ", conn, trans))
                    {
                        checkDigitalCmd.ExecuteNonQuery();
                    }

                    // Ensure daily_limit_piasters and monthly_limit_piasters exist on digital_accounts
                    var daCols = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                    using (var pragmaCmd = new SQLiteCommand("PRAGMA table_info(digital_accounts);", conn, trans))
                    using (var reader = pragmaCmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            daCols.Add(reader["name"].ToString());
                        }
                    }
                    if (!daCols.Contains("daily_limit_piasters"))
                    {
                        using (var alter = new SQLiteCommand("ALTER TABLE digital_accounts ADD COLUMN daily_limit_piasters INTEGER NOT NULL DEFAULT 6000000;", conn, trans))
                        {
                            alter.ExecuteNonQuery();
                        }
                    }
                    if (!daCols.Contains("monthly_limit_piasters"))
                    {
                        using (var alter = new SQLiteCommand("ALTER TABLE digital_accounts ADD COLUMN monthly_limit_piasters INTEGER NOT NULL DEFAULT 20000000;", conn, trans))
                        {
                            alter.ExecuteNonQuery();
                        }
                    }

                    // Ensure payment_source exists on purchases
                    var purCols = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                    using (var pragmaCmd = new SQLiteCommand("PRAGMA table_info(purchases);", conn, trans))
                    using (var reader = pragmaCmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            purCols.Add(reader["name"].ToString());
                        }
                    }
                    if (purCols.Count > 0 && !purCols.Contains("payment_source"))
                    {
                        using (var alter = new SQLiteCommand("ALTER TABLE purchases ADD COLUMN payment_source TEXT NOT NULL DEFAULT 'cash_drawer';", conn, trans))
                        {
                            alter.ExecuteNonQuery();
                        }
                    }

                    // Ensure payment_source exists on supplier_transactions
                    var suppTxCols = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                    using (var pragmaCmd = new SQLiteCommand("PRAGMA table_info(supplier_transactions);", conn, trans))
                    using (var reader = pragmaCmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            suppTxCols.Add(reader["name"].ToString());
                        }
                    }
                    if (suppTxCols.Count > 0 && !suppTxCols.Contains("payment_source"))
                    {
                        using (var alter = new SQLiteCommand("ALTER TABLE supplier_transactions ADD COLUMN payment_source TEXT NOT NULL DEFAULT 'cash_drawer';", conn, trans))
                        {
                            alter.ExecuteNonQuery();
                        }
                    }

                    if (suppTxCols.Count > 0 && !suppTxCols.Contains("balance_after_piasters"))
                    {
                        using (var alter = new SQLiteCommand("ALTER TABLE supplier_transactions ADD COLUMN balance_after_piasters INTEGER NOT NULL DEFAULT 0;", conn, trans))
                        {
                            alter.ExecuteNonQuery();
                        }
                    }

                    // Ensure bonus_quantity_milli and discount_piasters exist on purchase_items
                    var piCols = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                    using (var pragmaCmd = new SQLiteCommand("PRAGMA table_info(purchase_items);", conn, trans))
                    using (var reader = pragmaCmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            piCols.Add(reader["name"].ToString());
                        }
                    }
                    if (piCols.Count > 0 && !piCols.Contains("bonus_quantity_milli"))
                    {
                        using (var alter = new SQLiteCommand("ALTER TABLE purchase_items ADD COLUMN bonus_quantity_milli INTEGER NOT NULL DEFAULT 0;", conn, trans))
                        {
                            alter.ExecuteNonQuery();
                        }
                    }
                    if (piCols.Count > 0 && !piCols.Contains("discount_piasters"))
                    {
                        using (var alter = new SQLiteCommand("ALTER TABLE purchase_items ADD COLUMN discount_piasters INTEGER NOT NULL DEFAULT 0;", conn, trans))
                        {
                            alter.ExecuteNonQuery();
                        }
                    }
                    if (piCols.Count > 0 && !piCols.Contains("unit_id"))
                    {
                        using (var alter = new SQLiteCommand("ALTER TABLE purchase_items ADD COLUMN unit_id TEXT;", conn, trans))
                        {
                            alter.ExecuteNonQuery();
                        }
                    }
                    if (piCols.Count > 0 && !piCols.Contains("unit_name"))
                    {
                        using (var alter = new SQLiteCommand("ALTER TABLE purchase_items ADD COLUMN unit_name TEXT;", conn, trans))
                        {
                            alter.ExecuteNonQuery();
                        }
                    }
                    if (piCols.Count > 0 && !piCols.Contains("conversion_factor"))
                    {
                        using (var alter = new SQLiteCommand("ALTER TABLE purchase_items ADD COLUMN conversion_factor REAL NOT NULL DEFAULT 1;", conn, trans))
                        {
                            alter.ExecuteNonQuery();
                        }
                    }
                    if (piCols.Count > 0 && !piCols.Contains("package_cost_piasters"))
                    {
                        using (var alter = new SQLiteCommand("ALTER TABLE purchase_items ADD COLUMN package_cost_piasters INTEGER NOT NULL DEFAULT 0;", conn, trans))
                        {
                            alter.ExecuteNonQuery();
                        }
                    }

                    // Ensure purchase_returns & purchase_return_items tables exist
                    using (var cmd = new SQLiteCommand(@"
                        CREATE TABLE IF NOT EXISTS purchase_returns (
                            id TEXT PRIMARY KEY,
                            return_number INTEGER NOT NULL,
                            supplier_id TEXT NOT NULL,
                            purchase_id TEXT,
                            return_date TEXT NOT NULL,
                            total_cost_piasters INTEGER NOT NULL,
                            refund_method TEXT NOT NULL DEFAULT 'BALANCE_DEDUCTION',
                            notes TEXT,
                            created_by_user_id TEXT,
                            created_at TEXT NOT NULL,
                            FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
                        );
                        CREATE INDEX IF NOT EXISTS idx_purchase_returns_supplier ON purchase_returns(supplier_id);

                        CREATE TABLE IF NOT EXISTS purchase_return_items (
                            id TEXT PRIMARY KEY,
                            return_id TEXT NOT NULL,
                            product_id TEXT NOT NULL,
                            product_name TEXT NOT NULL,
                            quantity_milli INTEGER NOT NULL,
                            unit_cost_piasters INTEGER NOT NULL,
                            total_cost_piasters INTEGER NOT NULL,
                            batch_number TEXT,
                            reason TEXT,
                            created_at TEXT NOT NULL,
                            FOREIGN KEY (return_id) REFERENCES purchase_returns(id) ON DELETE CASCADE,
                            FOREIGN KEY (product_id) REFERENCES products(id)
                        );
                        CREATE INDEX IF NOT EXISTS idx_purchase_return_items_return ON purchase_return_items(return_id);

                        INSERT OR IGNORE INTO counters (name, current_value, updated_at)
                        VALUES ('purchase_return', 0, datetime('now'));
                    ", conn, trans))
                    {
                        cmd.ExecuteNonQuery();
                    }

                    // Ensure payment_method and digital_account_id exist on customer_ledger (F-07)
                    var clHealthCols = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                    using (var pragmaCmd = new SQLiteCommand("PRAGMA table_info(customer_ledger);", conn, trans))
                    using (var reader = pragmaCmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            clHealthCols.Add(reader["name"].ToString());
                        }
                    }
                    if (clHealthCols.Count > 0 && !clHealthCols.Contains("payment_method"))
                    {
                        using (var alter = new SQLiteCommand("ALTER TABLE customer_ledger ADD COLUMN payment_method TEXT DEFAULT 'cash';", conn, trans))
                        {
                            alter.ExecuteNonQuery();
                        }
                    }
                    if (clHealthCols.Count > 0 && !clHealthCols.Contains("digital_account_id"))
                    {
                        using (var alter = new SQLiteCommand("ALTER TABLE customer_ledger ADD COLUMN digital_account_id TEXT DEFAULT NULL;", conn, trans))
                        {
                            alter.ExecuteNonQuery();
                        }
                    }
                    using (var idxCmd = new SQLiteCommand("CREATE INDEX IF NOT EXISTS idx_customer_ledger_customer_created ON customer_ledger(customer_id, created_at);", conn, trans))
                    {
                        idxCmd.ExecuteNonQuery();
                    }

                    // Ensure sell_price_piasters & public_price_piasters exist on product_batches (Story 127 / Feature #184)
                    var pbHealthCols = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                    using (var pragmaCmd = new SQLiteCommand("PRAGMA table_info(product_batches);", conn, trans))
                    using (var reader = pragmaCmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            pbHealthCols.Add(reader["name"].ToString());
                        }
                    }
                    if (pbHealthCols.Count > 0 && !pbHealthCols.Contains("sell_price_piasters"))
                    {
                        using (var alter = new SQLiteCommand("ALTER TABLE product_batches ADD COLUMN sell_price_piasters INTEGER DEFAULT NULL;", conn, trans))
                        {
                            alter.ExecuteNonQuery();
                        }
                    }
                    if (pbHealthCols.Count > 0 && !pbHealthCols.Contains("public_price_piasters"))
                    {
                        using (var alter = new SQLiteCommand("ALTER TABLE product_batches ADD COLUMN public_price_piasters INTEGER DEFAULT NULL;", conn, trans))
                        {
                            alter.ExecuteNonQuery();
                        }
                    }
                    if (pbHealthCols.Count > 0 && !pbHealthCols.Contains("location_id"))
                    {
                        using (var alter = new SQLiteCommand("ALTER TABLE product_batches ADD COLUMN location_id TEXT DEFAULT NULL;", conn, trans))
                        {
                            alter.ExecuteNonQuery();
                        }
                        using (var idx = new SQLiteCommand("CREATE INDEX IF NOT EXISTS idx_product_batches_location ON product_batches(location_id);", conn, trans))
                        {
                            idx.ExecuteNonQuery();
                        }
                    }

                    // Ensure sale_item_batch_allocations table exists
                    using (var allocCmd = new SQLiteCommand(@"
                        CREATE TABLE IF NOT EXISTS sale_item_batch_allocations (
                            id TEXT PRIMARY KEY,
                            sale_item_id TEXT NOT NULL,
                            batch_id TEXT NOT NULL,
                            quantity_milli INTEGER NOT NULL,
                            unit_price_piasters INTEGER NOT NULL,
                            unit_cost_piasters INTEGER NOT NULL,
                            created_at TEXT NOT NULL,
                            FOREIGN KEY (sale_item_id) REFERENCES sale_items(id) ON DELETE CASCADE,
                            FOREIGN KEY (batch_id) REFERENCES product_batches(id) ON DELETE RESTRICT
                        );
                        CREATE INDEX IF NOT EXISTS idx_sale_item_batch_allocations_sale_item ON sale_item_batch_allocations(sale_item_id);
                        CREATE INDEX IF NOT EXISTS idx_sale_item_batch_allocations_batch ON sale_item_batch_allocations(batch_id);
                    ", conn, trans))
                    {
                        allocCmd.ExecuteNonQuery();
                    }

                    // Auto-sync drug_reference to product_pharma_info for any matching products (Story 130 / Feature #187)
                    using (var checkPharmaSyncCmd = new SQLiteCommand(@"
                        SELECT name FROM sqlite_master WHERE type='table' AND name IN ('product_pharma_info', 'drug_reference');
                    ", conn, trans))
                    {
                        int tableCount = 0;
                        using (var rdr = checkPharmaSyncCmd.ExecuteReader())
                        {
                            while (rdr.Read()) tableCount++;
                        }
                        if (tableCount == 2)
                        {
                            string syncPharmaSql = @"
                                INSERT OR IGNORE INTO product_pharma_info (
                                    product_id, scientific_name, normalized_scientific_name,
                                    dosage_form_id, strength_text, manufacturer_id,
                                    storage_condition, rx_status, created_at, updated_at
                                )
                                SELECT 
                                    p.id,
                                    dr.scientific_name,
                                    LOWER(TRIM(dr.scientific_name)),
                                    CASE 
                                        WHEN dr.form LIKE '%أقراص%' OR dr.form LIKE '%قرص%' OR dr.form LIKE '%tablet%' THEN 'df_tablets'
                                        WHEN dr.form LIKE '%كبسول%' OR dr.form LIKE '%capsul%' THEN 'df_capsules'
                                        WHEN dr.form LIKE '%شراب%' OR dr.form LIKE '%syrup%' THEN 'df_syrup'
                                        WHEN dr.form LIKE '%معلق%' OR dr.form LIKE '%susp%' THEN 'df_suspension'
                                        WHEN dr.form LIKE '%حقن%' OR dr.form LIKE '%inject%' OR dr.form LIKE '%amp%' OR dr.form LIKE '%vial%' THEN 'df_injection'
                                        WHEN dr.form LIKE '%كريم%' OR dr.form LIKE '%مرهم%' OR dr.form LIKE '%cream%' OR dr.form LIKE '%oint%' THEN 'df_cream'
                                        WHEN dr.form LIKE '%نقط%' OR dr.form LIKE '%قطرة%' OR dr.form LIKE '%drop%' THEN 'df_drops'
                                        WHEN dr.form LIKE '%فوار%' OR dr.form LIKE '%efferv%' THEN 'df_effervescent'
                                        WHEN dr.form LIKE '%بخاخ%' OR dr.form LIKE '%inhal%' OR dr.form LIKE '%spray%' THEN 'df_inhaler'
                                        WHEN dr.form LIKE '%لبوس%' OR dr.form LIKE '%suppos%' THEN 'df_suppository'
                                        WHEN dr.form LIKE '%أكياس%' OR dr.form LIKE '%sachet%' THEN 'df_sachets'
                                        WHEN dr.form LIKE '%جل%' OR dr.form LIKE '%gel%' THEN 'df_gel'
                                        WHEN dr.form LIKE '%لوشن%' OR dr.form LIKE '%lotion%' THEN 'df_lotion'
                                        ELSE NULL
                                    END,
                                    dr.strength,
                                    NULL,
                                    CASE WHEN dr.is_refrigerated = 1 THEN 'fridge' ELSE 'room' END,
                                    'otc',
                                    datetime('now'),
                                    datetime('now')
                                FROM products p
                                JOIN drug_reference dr ON p.barcode = dr.barcode
                                WHERE p.is_active = 1 
                                  AND (dr.scientific_name IS NOT NULL AND dr.scientific_name != '')
                                  AND NOT EXISTS (
                                      SELECT 1 FROM product_pharma_info pi WHERE pi.product_id = p.id
                                  );
                            ";
                            using (var syncCmd = new SQLiteCommand(syncPharmaSql, conn, trans))
                            {
                                syncCmd.ExecuteNonQuery();
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

        private static void ApplyMigration25(SQLiteConnection conn)
        {
            using (var trans = conn.BeginTransaction())
            {
                try
                {
                    // 1. Table: product_variants (Feature #114 / Task 114-2)
                    using (var cmd = new SQLiteCommand(@"
                        CREATE TABLE IF NOT EXISTS product_variants (
                            id TEXT PRIMARY KEY,
                            parent_product_id TEXT NOT NULL,
                            variant_product_id TEXT NOT NULL,
                            size TEXT,
                            color TEXT,
                            sku TEXT,
                            barcode TEXT,
                            price_piasters INTEGER NOT NULL DEFAULT 0,
                            cost_piasters INTEGER NOT NULL DEFAULT 0,
                            stock_quantity_milli INTEGER NOT NULL DEFAULT 0,
                            min_stock_quantity_milli INTEGER NOT NULL DEFAULT 0,
                            created_at TEXT NOT NULL,
                            updated_at TEXT NOT NULL,
                            FOREIGN KEY (parent_product_id) REFERENCES products(id) ON DELETE CASCADE,
                            FOREIGN KEY (variant_product_id) REFERENCES products(id) ON DELETE CASCADE
                        );

                        CREATE INDEX IF NOT EXISTS idx_product_variants_parent ON product_variants(parent_product_id);
                        CREATE INDEX IF NOT EXISTS idx_product_variants_child ON product_variants(variant_product_id);
                        CREATE INDEX IF NOT EXISTS idx_product_variants_barcode ON product_variants(barcode);
                        CREATE INDEX IF NOT EXISTS idx_product_variants_size_color ON product_variants(parent_product_id, size, color);
                    ", conn, trans))
                    {
                        cmd.ExecuteNonQuery();
                    }

                    // 2. Add variant columns to products table if missing
                    var existingProdCols = new System.Collections.Generic.HashSet<string>(StringComparer.OrdinalIgnoreCase);
                    using (var infoCmd = new SQLiteCommand("PRAGMA table_info(products);", conn, trans))
                    using (var reader = infoCmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            existingProdCols.Add(reader["name"].ToString());
                        }
                    }

                    if (!existingProdCols.Contains("parent_id"))
                    {
                        using (var alter = new SQLiteCommand("ALTER TABLE products ADD COLUMN parent_id TEXT;", conn, trans))
                        {
                            alter.ExecuteNonQuery();
                        }
                    }

                    if (!existingProdCols.Contains("has_variants"))
                    {
                        using (var alter = new SQLiteCommand("ALTER TABLE products ADD COLUMN has_variants INTEGER NOT NULL DEFAULT 0;", conn, trans))
                        {
                            alter.ExecuteNonQuery();
                        }
                    }

                    if (!existingProdCols.Contains("variant_size"))
                    {
                        using (var alter = new SQLiteCommand("ALTER TABLE products ADD COLUMN variant_size TEXT;", conn, trans))
                        {
                            alter.ExecuteNonQuery();
                        }
                    }

                    if (!existingProdCols.Contains("variant_color"))
                    {
                        using (var alter = new SQLiteCommand("ALTER TABLE products ADD COLUMN variant_color TEXT;", conn, trans))
                        {
                            alter.ExecuteNonQuery();
                        }
                    }

                    if (!existingProdCols.Contains("variant_sku"))
                    {
                        using (var alter = new SQLiteCommand("ALTER TABLE products ADD COLUMN variant_sku TEXT;", conn, trans))
                        {
                            alter.ExecuteNonQuery();
                        }
                    }

                    using (var idxCmd = new SQLiteCommand(@"
                        CREATE INDEX IF NOT EXISTS idx_products_parent_id ON products(parent_id);
                        CREATE INDEX IF NOT EXISTS idx_products_has_variants ON products(has_variants);
                    ", conn, trans))
                    {
                        idxCmd.ExecuteNonQuery();
                    }

                    // 3. Update schema_migrations
                    using (var logCmd = new SQLiteCommand(@"
                        INSERT OR REPLACE INTO schema_migrations (version, name, applied_at)
                        VALUES (25, 'Product Variants (Sizes & Colors) System (Feature #114)', datetime('now'));
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

        private static void ApplyMigration26(SQLiteConnection conn)
        {
            using (var trans = conn.BeginTransaction())
            {
                try
                {
                    // 1. Add hierarchy and password columns to users table
                    var uCols = new System.Collections.Generic.HashSet<string>(StringComparer.OrdinalIgnoreCase);
                    using (var infoCmd = new SQLiteCommand("PRAGMA table_info(users);", conn, trans))
                    using (var reader = infoCmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            uCols.Add(reader["name"].ToString());
                        }
                    }

                    if (!uCols.Contains("parent_id"))
                    {
                        using (var alter = new SQLiteCommand("ALTER TABLE users ADD COLUMN parent_id TEXT;", conn, trans))
                        {
                            alter.ExecuteNonQuery();
                        }
                    }
                    if (!uCols.Contains("max_depth"))
                    {
                        using (var alter = new SQLiteCommand("ALTER TABLE users ADD COLUMN max_depth INTEGER NOT NULL DEFAULT 0;", conn, trans))
                        {
                            alter.ExecuteNonQuery();
                        }
                    }
                    if (!uCols.Contains("created_by"))
                    {
                        using (var alter = new SQLiteCommand("ALTER TABLE users ADD COLUMN created_by TEXT;", conn, trans))
                        {
                            alter.ExecuteNonQuery();
                        }
                    }
                    if (!uCols.Contains("can_delegate"))
                    {
                        using (var alter = new SQLiteCommand("ALTER TABLE users ADD COLUMN can_delegate INTEGER NOT NULL DEFAULT 0;", conn, trans))
                        {
                            alter.ExecuteNonQuery();
                        }
                    }
                    if (!uCols.Contains("password_hash"))
                    {
                        using (var alter = new SQLiteCommand("ALTER TABLE users ADD COLUMN password_hash TEXT;", conn, trans))
                        {
                            alter.ExecuteNonQuery();
                        }
                    }
                    if (!uCols.Contains("password_salt"))
                    {
                        using (var alter = new SQLiteCommand("ALTER TABLE users ADD COLUMN password_salt TEXT;", conn, trans))
                        {
                            alter.ExecuteNonQuery();
                        }
                    }

                    // 2. Index on parent_id
                    using (var idxCmd = new SQLiteCommand("CREATE INDEX IF NOT EXISTS idx_users_parent_id ON users(parent_id);", conn, trans))
                    {
                        idxCmd.ExecuteNonQuery();
                    }

                    // 3. Ensure store owner admin exists as 'admin' (صاحب المحل)
                    using (var updateOwner = new SQLiteCommand(@"
                        UPDATE users 
                        SET role = 'admin', 
                            display_name = 'صاحب المحل',
                            parent_id = NULL, 
                            max_depth = 10, 
                            can_delegate = 1
                        WHERE id = 'usr_admin_default' OR username = 'admin';
                    ", conn, trans))
                    {
                        updateOwner.ExecuteNonQuery();
                    }

                    // Self-heal: ensure feature_matrix_variants is turned off if current store is not clothing
                    using (var checkStoreCmd = new SQLiteCommand("SELECT value FROM app_settings WHERE key = 'store_type';", conn, trans))
                    {
                        var sType = checkStoreCmd.ExecuteScalar();
                        if (sType != null)
                        {
                            string sTypeStr = sType.ToString();
                            if (sTypeStr != "clothing_apparel")
                            {
                                using (var healCmd = new SQLiteCommand("INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('feature_matrix_variants', '0', datetime('now'));", conn, trans))
                                {
                                    healCmd.ExecuteNonQuery();
                                }
                            }
                        }
                    }

                    // 4. Update schema_migrations
                    using (var logCmd = new SQLiteCommand(@"
                        INSERT OR REPLACE INTO schema_migrations (version, name, applied_at)
                        VALUES (26, 'Hierarchical Authentication and Permission Tree System', datetime('now'));
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

        private static void BackupDatabaseBeforeMigration(string dbPath)
        {
            if (!BackupDatabaseBeforeMigration(dbPath, 0))
            {
                throw new InvalidOperationException(
                    "تعذر إنشاء نسخة أمان قبل ترحيل قاعدة البيانات. تم إيقاف الترحيل لحماية بياناتك. تواصل مع الدعم الفني.");
            }
        }

        private static bool BackupDatabaseBeforeMigration(string dbPath, int targetVersion)
        {
            if (string.IsNullOrEmpty(dbPath) || !File.Exists(dbPath))
            {
                return true; // Fresh DB, nothing to back up
            }

            try
            {
                var fi = new FileInfo(dbPath);
                if (fi.Length == 0)
                {
                    return true;
                }

                string backupDir = Path.Combine(Path.GetDirectoryName(dbPath), "migration_backups");
                if (!Directory.Exists(backupDir))
                {
                    Directory.CreateDirectory(backupDir);
                }

                string timestamp = DateTime.UtcNow.ToString("yyyyMMdd_HHmmss");
                string backupFile = Path.Combine(backupDir, string.Format("pre_v{0}_{1}.db", targetVersion, timestamp));

                using (var backupConn = new SQLiteConnection("Data Source=" + backupFile + ";Version=3;"))
                {
                    backupConn.Open();
                    using (var sourceConn = new SQLiteConnection("Data Source=" + dbPath + ";Version=3;Read Only=True;"))
                    {
                        sourceConn.Open();
                        sourceConn.BackupDatabase(backupConn, "main", "main", -1, null, 100);
                    }
                }

                // Verify backup integrity
                using (var checkConn = new SQLiteConnection("Data Source=" + backupFile + ";Version=3;Read Only=True;"))
                {
                    checkConn.Open();
                    using (var cmd = checkConn.CreateCommand())
                    {
                        cmd.CommandText = "PRAGMA quick_check;";
                        object result = cmd.ExecuteScalar();
                        if (result == null || !result.ToString().Equals("ok", StringComparison.OrdinalIgnoreCase))
                        {
                            throw new InvalidOperationException("فشل التحقق من سلامة النسخة الاحتياطية قبل الترحيل (quick_check failed)");
                        }
                    }
                }

                PruneOldMigrationBackups(backupDir, 30);
                Common.Logger.Info("تم إنشاء نسخة أمان لقاعدة البيانات قبل الترحيل بنجاح: " + backupFile);
                return true;
            }
            catch (Exception ex)
            {
                Common.Logger.Error("CRITICAL: فشل إنشاء نسخة أمان قبل الترحيل: " + ex.Message, ex);
                return false;
            }
        }

        private static void PruneOldMigrationBackups(string backupDir, int retentionDays)
        {
            try
            {
                if (!Directory.Exists(backupDir)) return;
                string[] files = Directory.GetFiles(backupDir, "pre_*.db");
                DateTime cutoff = DateTime.UtcNow.AddDays(-retentionDays);
                for (int i = 0; i < files.Length; i++)
                {
                    try
                    {
                        var fi = new FileInfo(files[i]);
                        if (fi.CreationTimeUtc < cutoff && fi.LastWriteTimeUtc < cutoff)
                        {
                            fi.Delete();
                        }
                    }
                    catch { }
                }
            }
            catch { }
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
                        VALUES ('store_name', 'متجر رفيق', datetime('now')),
                               ('receipt_header', 'أهلاً بكم في متجر رفيق', datetime('now')),
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

                        -- Zero pre-seeded categories policy: categories table starts clean without pre-seeded mock categories

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
                            user_id TEXT DEFAULT '',
                            user_name TEXT DEFAULT '',
                            batch_id TEXT DEFAULT '',
                            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
                        );

                        CREATE INDEX IF NOT EXISTS idx_price_history_product ON product_price_history(product_id);
                        CREATE INDEX IF NOT EXISTS idx_price_history_created_at ON product_price_history(created_at);
                        CREATE INDEX IF NOT EXISTS idx_price_history_batch_id ON product_price_history(batch_id);

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

                        // Ensure bundle_items_json column exists in quick_items (Combo & Bundle Offers)
                        using (var checkColCmd = new SQLiteCommand("PRAGMA table_info(quick_items);", conn, trans))
                        using (var colReader = checkColCmd.ExecuteReader())
                        {
                            bool hasBundleCol = false;
                            while (colReader.Read())
                            {
                                string col = colReader["name"].ToString();
                                if (string.Equals(col, "bundle_items_json", StringComparison.OrdinalIgnoreCase))
                                {
                                    hasBundleCol = true;
                                    break;
                                }
                            }
                            if (!hasBundleCol)
                            {
                                using (var alterCmd = new SQLiteCommand("ALTER TABLE quick_items ADD COLUMN bundle_items_json TEXT DEFAULT NULL;", conn, trans))
                                {
                                    alterCmd.ExecuteNonQuery();
                                }
                            }
                        }

                        // 2. Table created/updated without mock data injection (starts clean)

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
                            '[]',
                            '[]',
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
                            '[]',
                            '[]',
                            '{""receipt_header"":""ألبان ومخبوزات رفيق"",""receipt_footer"":""منتجات طازجة يومياً.. شكراً لثقتكم الغالية""}',
                            1,
                            datetime('now')
                        );

                        -- 3. قالب بقالة ومحل تجاري عام
                        INSERT OR REPLACE INTO store_templates (id, name, description, icon, feature_flags_json, categories_json, quick_items_json, default_settings_json, is_active, created_at)
                        VALUES (
                            'general_grocery',
                            'بقالة ومحل تجاري عام',
                            'إعداد عام متوازن يناسب كافة المحلات والأنشطة التجارية المتنوعة',
                            'store',
                            '{""feature_scale_weight"":true,""feature_credit_debts"":true,""feature_fast_buttons"":true,""feature_taxes"":false,""feature_expiry_dates"":false,""feature_multi_units"":false}',
                            '[]',
                            '[]',
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

        private static void ApplyMigration18(SQLiteConnection conn)
        {
            using (var trans = conn.BeginTransaction())
            {
                try
                {
                    // 1. Reseal and chain all audit records
                    var rows = new System.Collections.Generic.List<string[]>();
                    using (var readCmd = new SQLiteCommand("SELECT id, user_id, action, entity_type, entity_id, details_json, created_at FROM audit_logs ORDER BY rowid ASC;", conn, trans))
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
                                rdr["created_at"].ToString()
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
                        string prevHash = lastHash;
                        string recHash = ComputeAuditHash(prevHash, id, userId, action, entityType, entityId, detailsJson, createdAt);

                        using (var updateCmd = new SQLiteCommand("UPDATE audit_logs SET prev_hash = @prev, record_hash = @rec WHERE id = @id;", conn, trans))
                        {
                            updateCmd.Parameters.AddWithValue("@prev", prevHash);
                            updateCmd.Parameters.AddWithValue("@rec", recHash);
                            updateCmd.Parameters.AddWithValue("@id", id);
                            updateCmd.ExecuteNonQuery();
                        }
                        lastHash = recHash;
                    }

                    // 2. Update schema_migrations
                    using (var logCmd = new SQLiteCommand(@"
                        INSERT INTO schema_migrations (version, name, applied_at)
                        VALUES (18, 'Reseal and Repair Audit Log Hash Chain (Feature #169 Fix)', datetime('now'));
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

        private static void ApplyMigration19(SQLiteConnection conn)
        {
            using (var trans = conn.BeginTransaction())
            {
                try
                {
                    // 1. Purge all customer debts and test sales for a clean initial installation
                    using (var cmd = new SQLiteCommand(@"
                        -- حذف أي ديون أو كشوف حسابات تجريبية سابقة للعملاء
                        DELETE FROM customer_ledger;
                        DELETE FROM customers WHERE id IN ('cust_demo_1', 'cust_demo_2');
                        UPDATE customers SET balance_piasters = 0;

                        -- حذف أي مبيعات أو فواتير تجريبية سابقة
                        DELETE FROM sale_items;
                        DELETE FROM sales;
                        DELETE FROM payments;
                        DELETE FROM stock_movements WHERE movement_type IN ('SALE', 'REFUND');

                        -- تصفير رقم الفاتورة ليبدأ الكاشير من الفاتورة رقم 1
                        UPDATE counters SET current_value = 0 WHERE name = 'invoice_number';
                        DELETE FROM customers WHERE id = 'cust_general_cash';
                    ", conn, trans))
                    {
                        cmd.ExecuteNonQuery();
                    }

                    // 2. Update schema_migrations
                    using (var logCmd = new SQLiteCommand(@"
                        INSERT OR REPLACE INTO schema_migrations (version, name, applied_at)
                        VALUES (19, 'Purge demo sales debts and start fresh clean slate', datetime('now'));
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

        private static void ApplyMigration20(SQLiteConnection conn)
        {
            using (var trans = conn.BeginTransaction())
            {
                try
                {
                    // 1. Table: held_sales (Feature #25 / Task 25-1)
                    using (var cmd = new SQLiteCommand(@"
                        CREATE TABLE IF NOT EXISTS held_sales (
                            id TEXT PRIMARY KEY,
                            hold_label TEXT NOT NULL,
                            customer_id TEXT,
                            customer_name TEXT,
                            items_count INTEGER NOT NULL DEFAULT 0,
                            subtotal_piasters INTEGER NOT NULL DEFAULT 0,
                            discount_piasters INTEGER NOT NULL DEFAULT 0,
                            total_piasters INTEGER NOT NULL DEFAULT 0,
                            cart_json TEXT NOT NULL,
                            notes TEXT,
                            cashier_id TEXT,
                            created_at TEXT NOT NULL
                        );
                        CREATE INDEX IF NOT EXISTS idx_held_sales_created_at ON held_sales(created_at);
                    ", conn, trans))
                    {
                        cmd.ExecuteNonQuery();
                    }

                    // 2. Table: returns (Feature #26 / Task 26-2)
                    using (var cmd = new SQLiteCommand(@"
                        CREATE TABLE IF NOT EXISTS returns (
                            id TEXT PRIMARY KEY,
                            return_number INTEGER NOT NULL,
                            sale_id TEXT,
                            invoice_number INTEGER,
                            customer_id TEXT,
                            customer_name TEXT,
                            cashier_id TEXT,
                            total_piasters INTEGER NOT NULL DEFAULT 0,
                            refund_method TEXT NOT NULL DEFAULT 'cash',
                            reason TEXT,
                            is_without_invoice INTEGER NOT NULL DEFAULT 0,
                            created_at TEXT NOT NULL
                        );
                        CREATE INDEX IF NOT EXISTS idx_returns_return_number ON returns(return_number);
                        CREATE INDEX IF NOT EXISTS idx_returns_sale_id ON returns(sale_id);
                        CREATE INDEX IF NOT EXISTS idx_returns_created_at ON returns(created_at);
                    ", conn, trans))
                    {
                        cmd.ExecuteNonQuery();
                    }

                    // 3. Table: return_items (Feature #26 / Task 26-2)
                    using (var cmd = new SQLiteCommand(@"
                        CREATE TABLE IF NOT EXISTS return_items (
                            id TEXT PRIMARY KEY,
                            return_id TEXT NOT NULL,
                            sale_item_id TEXT,
                            product_id TEXT NOT NULL,
                            product_name TEXT NOT NULL,
                            barcode TEXT,
                            quantity_milli INTEGER NOT NULL,
                            unit_price_piasters INTEGER NOT NULL,
                            total_piasters INTEGER NOT NULL,
                            is_damaged INTEGER NOT NULL DEFAULT 0,
                            unit TEXT DEFAULT 'piece',
                            created_at TEXT NOT NULL,
                            FOREIGN KEY (return_id) REFERENCES returns(id) ON DELETE CASCADE
                        );
                        CREATE INDEX IF NOT EXISTS idx_return_items_return_id ON return_items(return_id);
                        CREATE INDEX IF NOT EXISTS idx_return_items_product_id ON return_items(product_id);
                    ", conn, trans))
                    {
                        cmd.ExecuteNonQuery();
                    }

                    // 4. Ensure counter for return numbers (Feature #26)
                    using (var cmd = new SQLiteCommand(@"
                        INSERT OR IGNORE INTO counters (name, current_value, updated_at)
                        VALUES ('return_number', 0, datetime('now'));
                    ", conn, trans))
                    {
                        cmd.ExecuteNonQuery();
                    }

                    // 5. Update schema_migrations
                    using (var logCmd = new SQLiteCommand(@"
                        INSERT OR REPLACE INTO schema_migrations (version, name, applied_at)
                        VALUES (20, 'Held sales and returns system (Features 25, 26, 33)', datetime('now'));
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

        private static void ApplyMigration21(SQLiteConnection conn)
        {
            using (var trans = conn.BeginTransaction())
            {
                try
                {
                    // 1. Table: suppliers (Feature #39 / Task 39-1)
                    using (var cmd = new SQLiteCommand(@"
                        CREATE TABLE IF NOT EXISTS suppliers (
                            id TEXT PRIMARY KEY,
                            name TEXT NOT NULL,
                            phone TEXT,
                            company_name TEXT,
                            address TEXT,
                            balance_piasters INTEGER NOT NULL DEFAULT 0,
                            notes TEXT,
                            is_active INTEGER NOT NULL DEFAULT 1,
                            created_at TEXT NOT NULL,
                            updated_at TEXT NOT NULL
                        );
                        CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name);
                        CREATE INDEX IF NOT EXISTS idx_suppliers_phone ON suppliers(phone);
                        CREATE INDEX IF NOT EXISTS idx_suppliers_is_active ON suppliers(is_active);
                    ", conn, trans))
                    {
                        cmd.ExecuteNonQuery();
                    }

                    // 2. Table: purchases (Feature #38 / Task 38-1)
                    using (var cmd = new SQLiteCommand(@"
                        CREATE TABLE IF NOT EXISTS purchases (
                            id TEXT PRIMARY KEY,
                            invoice_number INTEGER NOT NULL,
                            supplier_id TEXT,
                            supplier_invoice_number TEXT,
                            invoice_date TEXT NOT NULL,
                            total_cost_piasters INTEGER NOT NULL,
                            discount_piasters INTEGER NOT NULL DEFAULT 0,
                            net_cost_piasters INTEGER NOT NULL,
                            paid_amount_piasters INTEGER NOT NULL DEFAULT 0,
                            remaining_amount_piasters INTEGER NOT NULL DEFAULT 0,
                            payment_status TEXT NOT NULL DEFAULT 'PAID',
                            status TEXT NOT NULL DEFAULT 'COMPLETED',
                            notes TEXT,
                            created_by_user_id TEXT,
                            created_at TEXT NOT NULL,
                            updated_at TEXT NOT NULL,
                            FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
                        );
                        CREATE INDEX IF NOT EXISTS idx_purchases_invoice_number ON purchases(invoice_number);
                        CREATE INDEX IF NOT EXISTS idx_purchases_supplier_id ON purchases(supplier_id);
                        CREATE INDEX IF NOT EXISTS idx_purchases_invoice_date ON purchases(invoice_date);
                        CREATE INDEX IF NOT EXISTS idx_purchases_payment_status ON purchases(payment_status);
                    ", conn, trans))
                    {
                        cmd.ExecuteNonQuery();
                    }

                    // 3. Table: purchase_items (Feature #38 / Task 38-1)
                    using (var cmd = new SQLiteCommand(@"
                        CREATE TABLE IF NOT EXISTS purchase_items (
                            id TEXT PRIMARY KEY,
                            purchase_id TEXT NOT NULL,
                            product_id TEXT NOT NULL,
                            product_name TEXT NOT NULL,
                            barcode TEXT,
                            quantity_milli INTEGER NOT NULL,
                            bonus_quantity_milli INTEGER NOT NULL DEFAULT 0,
                            unit_cost_piasters INTEGER NOT NULL,
                            discount_piasters INTEGER NOT NULL DEFAULT 0,
                            total_cost_piasters INTEGER NOT NULL,
                            previous_cost_piasters INTEGER NOT NULL DEFAULT 0,
                            new_selling_price_piasters INTEGER,
                            batch_number TEXT,
                            expiry_date TEXT,
                            production_date TEXT,
                            created_at TEXT NOT NULL,
                            FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE,
                            FOREIGN KEY (product_id) REFERENCES products(id)
                        );
                        CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase_id ON purchase_items(purchase_id);
                        CREATE INDEX IF NOT EXISTS idx_purchase_items_product_id ON purchase_items(product_id);
                    ", conn, trans))
                    {
                        cmd.ExecuteNonQuery();
                    }

                    // 4. Table: supplier_transactions (Feature #39 / Task 39-1)
                    using (var cmd = new SQLiteCommand(@"
                        CREATE TABLE IF NOT EXISTS supplier_transactions (
                            id TEXT PRIMARY KEY,
                            supplier_id TEXT NOT NULL,
                            transaction_type TEXT NOT NULL,
                            reference_id TEXT,
                            amount_piasters INTEGER NOT NULL,
                            payment_source TEXT NOT NULL DEFAULT 'cash_drawer',
                            balance_after_piasters INTEGER NOT NULL DEFAULT 0,
                            notes TEXT,
                            created_at TEXT NOT NULL,
                            FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE
                        );
                        CREATE INDEX IF NOT EXISTS idx_supplier_trans_supplier_id ON supplier_transactions(supplier_id);
                    ", conn, trans))
                    {
                        cmd.ExecuteNonQuery();
                    }

                    // 5. Ensure counter for purchase invoices (Feature #38 / Task 38-1)
                    using (var cmd = new SQLiteCommand(@"
                        INSERT OR IGNORE INTO counters (name, current_value, updated_at)
                        VALUES ('purchase_invoice', 0, datetime('now'));
                    ", conn, trans))
                    {
                        cmd.ExecuteNonQuery();
                    }

                    // 6. Update schema_migrations
                    using (var logCmd = new SQLiteCommand(@"
                        INSERT OR REPLACE INTO schema_migrations (version, name, applied_at)
                        VALUES (21, 'Suppliers and Purchases Management (Features 38, 39)', datetime('now'));
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

        private static void ApplyMigration22(SQLiteConnection conn)
        {
            using (var trans = conn.BeginTransaction())
            {
                try
                {
                    // 1. Table: daily_closings (Story 87 / Tasks 49-1, 49-4)
                    using (var cmd = new SQLiteCommand(@"
                        CREATE TABLE IF NOT EXISTS daily_closings (
                            id TEXT PRIMARY KEY,
                            closing_number INTEGER NOT NULL,
                            business_date TEXT NOT NULL,
                            closed_at TEXT NOT NULL,
                            cashier_id TEXT,
                            cashier_name TEXT,
                            total_sales_piasters INTEGER NOT NULL,
                            cash_sales_piasters INTEGER NOT NULL,
                            credit_sales_piasters INTEGER NOT NULL,
                            returns_total_piasters INTEGER NOT NULL,
                            returns_cash_piasters INTEGER NOT NULL,
                            cancelled_total_piasters INTEGER NOT NULL,
                            debt_payments_piasters INTEGER NOT NULL,
                            expected_cash_piasters INTEGER NOT NULL,
                            actual_cash_piasters INTEGER NOT NULL,
                            difference_piasters INTEGER NOT NULL,
                            gross_profit_piasters INTEGER NOT NULL,
                            invoices_count INTEGER NOT NULL,
                            returns_count INTEGER NOT NULL,
                            cancelled_count INTEGER NOT NULL,
                            notes TEXT,
                            summary_json TEXT,
                            is_sealed INTEGER NOT NULL DEFAULT 1
                        );
                        CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_closings_bdate ON daily_closings(business_date);
                        CREATE INDEX IF NOT EXISTS idx_daily_closings_closed_at ON daily_closings(closed_at);
                    ", conn, trans))
                    {
                        cmd.ExecuteNonQuery();
                    }

                    // 2. Sequential counter for daily_closing (Task 49-4)
                    using (var cmd = new SQLiteCommand(@"
                        INSERT OR IGNORE INTO counters (name, current_value, updated_at)
                        VALUES ('daily_closing', 0, datetime('now'));
                    ", conn, trans))
                    {
                        cmd.ExecuteNonQuery();
                    }

                    // 3. Immutability triggers (Task 49-4: سجل لا يُعدَّل ولا يُحذف بعد الحفظ)
                    using (var cmd = new SQLiteCommand(@"
                        CREATE TRIGGER IF NOT EXISTS trg_prevent_daily_closing_update
                        BEFORE UPDATE ON daily_closings
                        BEGIN
                            SELECT RAISE(ABORT, 'لا يمكن تعديل سجل قفل اليومية بعد اعتماده');
                        END;

                        CREATE TRIGGER IF NOT EXISTS trg_prevent_daily_closing_delete
                        BEFORE DELETE ON daily_closings
                        BEGIN
                            SELECT RAISE(ABORT, 'لا يمكن حذف سجل قفل اليومية بعد اعتماده');
                        END;
                    ", conn, trans))
                    {
                        cmd.ExecuteNonQuery();
                    }

                    // 4. Update schema_migrations
                    using (var logCmd = new SQLiteCommand(@"
                        INSERT OR REPLACE INTO schema_migrations (version, name, applied_at)
                        VALUES (22, 'Daily Closing and Reporting System (Features 45, 48, 49, 50, 127, 137)', datetime('now'));
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

        private static void ApplyMigration23(SQLiteConnection conn)
        {
            using (var trans = conn.BeginTransaction())
            {
                try
                {
                    // 1. Add is_archived column to customers table (Soft Delete / Archival)
                    // Default 0 = active, 1 = archived (hidden from UI but data preserved)
                    try
                    {
                        using (var cmd = new SQLiteCommand(
                            "ALTER TABLE customers ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0;", conn, trans))
                        {
                            cmd.ExecuteNonQuery();
                        }
                    }
                    catch
                    {
                        // Column already exists, safe to ignore
                    }

                    // 2. Add partial index for fast filtering of active customers
                    using (var cmd = new SQLiteCommand(@"
                        CREATE INDEX IF NOT EXISTS idx_customers_is_archived 
                        ON customers(is_archived);
                    ", conn, trans))
                    {
                        cmd.ExecuteNonQuery();
                    }

                    // 3. Purge legacy system customer from customers table
                    using (var cmd = new SQLiteCommand(@"
                        DELETE FROM customers WHERE id = 'cust_general_cash';
                    ", conn, trans))
                    {
                        cmd.ExecuteNonQuery();
                    }

                    // 4. Update schema_migrations
                    using (var logCmd = new SQLiteCommand(@"
                        INSERT OR REPLACE INTO schema_migrations (version, name, applied_at)
                        VALUES (23, 'Customer Archival Soft Delete Support', datetime('now'));
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

        private static void ApplyMigration24(SQLiteConnection conn)
        {
            using (var trans = conn.BeginTransaction())
            {
                try
                {
                    // 1. Table: product_batches (Feature #60 / Task 60-2)
                    using (var cmd = new SQLiteCommand(@"
                        CREATE TABLE IF NOT EXISTS product_batches (
                            id TEXT PRIMARY KEY,
                            product_id TEXT NOT NULL,
                            batch_number TEXT NOT NULL,
                            expiry_date TEXT,
                            production_date TEXT,
                            quantity_milli INTEGER NOT NULL DEFAULT 0,
                            cost_price_piasters INTEGER NOT NULL DEFAULT 0,
                            supplier_id TEXT,
                            purchase_id TEXT,
                            status TEXT NOT NULL DEFAULT 'ACTIVE',
                            notes TEXT,
                            created_at TEXT NOT NULL,
                            updated_at TEXT NOT NULL,
                            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
                            FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL,
                            FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE SET NULL
                        );

                        CREATE INDEX IF NOT EXISTS idx_product_batches_product_id ON product_batches(product_id);
                        CREATE INDEX IF NOT EXISTS idx_product_batches_expiry_date ON product_batches(expiry_date);
                        CREATE INDEX IF NOT EXISTS idx_product_batches_status ON product_batches(status);
                        CREATE INDEX IF NOT EXISTS idx_product_batches_qty ON product_batches(product_id, quantity_milli);
                        CREATE UNIQUE INDEX IF NOT EXISTS idx_product_batches_unique ON product_batches(product_id, batch_number);
                    ", conn, trans))
                    {
                        cmd.ExecuteNonQuery();
                    }

                    // 2. Add batch_id to stock_movements if missing
                    var existingSmCols = new System.Collections.Generic.HashSet<string>(StringComparer.OrdinalIgnoreCase);
                    using (var infoCmd = new SQLiteCommand("PRAGMA table_info(stock_movements);", conn, trans))
                    using (var reader = infoCmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            existingSmCols.Add(reader["name"].ToString());
                        }
                    }

                    if (!existingSmCols.Contains("batch_id"))
                    {
                        using (var alter = new SQLiteCommand("ALTER TABLE stock_movements ADD COLUMN batch_id TEXT;", conn, trans))
                        {
                            alter.ExecuteNonQuery();
                        }
                    }

                    if (!existingSmCols.Contains("expiry_date"))
                    {
                        using (var alter = new SQLiteCommand("ALTER TABLE stock_movements ADD COLUMN expiry_date TEXT;", conn, trans))
                        {
                            alter.ExecuteNonQuery();
                        }
                    }

                    // 4. Add batch columns to sale_items if missing
                    var existingSiCols = new System.Collections.Generic.HashSet<string>(StringComparer.OrdinalIgnoreCase);
                    using (var infoCmd = new SQLiteCommand("PRAGMA table_info(sale_items);", conn, trans))
                    using (var reader = infoCmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            existingSiCols.Add(reader["name"].ToString());
                        }
                    }

                    if (!existingSiCols.Contains("batch_number"))
                    {
                        using (var alter = new SQLiteCommand("ALTER TABLE sale_items ADD COLUMN batch_number TEXT;", conn, trans))
                        {
                            alter.ExecuteNonQuery();
                        }
                    }

                    if (!existingSiCols.Contains("batch_id"))
                    {
                        using (var alter = new SQLiteCommand("ALTER TABLE sale_items ADD COLUMN batch_id TEXT;", conn, trans))
                        {
                            alter.ExecuteNonQuery();
                        }
                    }

                    if (!existingSiCols.Contains("expiry_date"))
                    {
                        using (var alter = new SQLiteCommand("ALTER TABLE sale_items ADD COLUMN expiry_date TEXT;", conn, trans))
                        {
                            alter.ExecuteNonQuery();
                        }
                    }

                    using (var idxCmd = new SQLiteCommand("CREATE INDEX IF NOT EXISTS idx_stock_movements_batch_id ON stock_movements(batch_id);", conn, trans))
                    {
                        idxCmd.ExecuteNonQuery();
                    }

                    // 3. Add batch columns to purchase_items if missing
                    var existingPiCols = new System.Collections.Generic.HashSet<string>(StringComparer.OrdinalIgnoreCase);
                    using (var infoCmd = new SQLiteCommand("PRAGMA table_info(purchase_items);", conn, trans))
                    using (var reader = infoCmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            existingPiCols.Add(reader["name"].ToString());
                        }
                    }

                    if (!existingPiCols.Contains("batch_number"))
                    {
                        using (var alter = new SQLiteCommand("ALTER TABLE purchase_items ADD COLUMN batch_number TEXT;", conn, trans))
                        {
                            alter.ExecuteNonQuery();
                        }
                    }

                    if (!existingPiCols.Contains("expiry_date"))
                    {
                        using (var alter = new SQLiteCommand("ALTER TABLE purchase_items ADD COLUMN expiry_date TEXT;", conn, trans))
                        {
                            alter.ExecuteNonQuery();
                        }
                    }

                    if (!existingPiCols.Contains("production_date"))
                    {
                        using (var alter = new SQLiteCommand("ALTER TABLE purchase_items ADD COLUMN production_date TEXT;", conn, trans))
                        {
                            alter.ExecuteNonQuery();
                        }
                    }

                    // 4. Default setting for expiry alert days (Task 60-5)
                    using (var cmd = new SQLiteCommand(@"
                        INSERT OR IGNORE INTO app_settings (key, value, updated_at)
                        VALUES ('expiry_alert_days', '30', datetime('now'));
                    ", conn, trans))
                    {
                        cmd.ExecuteNonQuery();
                    }

                    // 5. Update schema_migrations
                    using (var logCmd = new SQLiteCommand(@"
                        INSERT OR REPLACE INTO schema_migrations (version, name, applied_at)
                        VALUES (24, 'Product Batches and Expiry Tracking System (Feature #60)', datetime('now'));
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

        // Migration 27: Electronic Payment Terminals and Services System (SuperPay / Fawry / Aman)
        private static void ApplyMigration27(SQLiteConnection conn)
        {
            using (var trans = conn.BeginTransaction())
            {
                    try
                    {
                        using (var cmd = new SQLiteCommand(@"
                            CREATE TABLE IF NOT EXISTS epay_terminals (
                                id TEXT PRIMARY KEY,
                                name TEXT NOT NULL,
                                provider TEXT NOT NULL DEFAULT 'super_pay',
                                terminal_code TEXT,
                                balance_piasters INTEGER NOT NULL DEFAULT 0,
                                low_balance_alert_piasters INTEGER NOT NULL DEFAULT 50000,
                                is_active INTEGER NOT NULL DEFAULT 1,
                                created_at TEXT NOT NULL,
                                updated_at TEXT NOT NULL
                            );

                            CREATE TABLE IF NOT EXISTS epay_transactions (
                                id TEXT PRIMARY KEY,
                                terminal_id TEXT NOT NULL REFERENCES epay_terminals(id),
                                service_type TEXT NOT NULL,
                                service_name TEXT NOT NULL,
                                reference_number TEXT,
                                customer_phone TEXT,
                                customer_name TEXT,
                                bill_amount_piasters INTEGER NOT NULL DEFAULT 0,
                                customer_fee_piasters INTEGER NOT NULL DEFAULT 0,
                                total_received_piasters INTEGER NOT NULL DEFAULT 0,
                                machine_deducted_piasters INTEGER NOT NULL DEFAULT 0,
                                provider_commission_piasters INTEGER NOT NULL DEFAULT 0,
                                net_profit_piasters INTEGER NOT NULL DEFAULT 0,
                                payment_channel TEXT NOT NULL DEFAULT 'cash_drawer',
                                cashier_name TEXT,
                                status TEXT NOT NULL DEFAULT 'completed',
                                notes TEXT,
                                created_at TEXT NOT NULL
                            );

                            CREATE TABLE IF NOT EXISTS epay_terminal_fundings (
                                id TEXT PRIMARY KEY,
                                terminal_id TEXT NOT NULL REFERENCES epay_terminals(id),
                                amount_piasters INTEGER NOT NULL,
                                funding_source TEXT NOT NULL DEFAULT 'cash_drawer',
                                previous_balance_piasters INTEGER NOT NULL,
                                new_balance_piasters INTEGER NOT NULL,
                                notes TEXT,
                                created_by TEXT,
                                created_at TEXT NOT NULL
                            );

                            CREATE INDEX IF NOT EXISTS idx_epay_tx_terminal ON epay_transactions(terminal_id);
                            CREATE INDEX IF NOT EXISTS idx_epay_tx_created ON epay_transactions(created_at);
                            CREATE INDEX IF NOT EXISTS idx_epay_tx_type ON epay_transactions(service_type);

                            INSERT OR REPLACE INTO schema_migrations (version, name, applied_at)
                            VALUES (27, 'Electronic Payment Terminals and Services System (SuperPay / Fawry / Aman)', datetime('now'));
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

        // Migration 28: Electronic Payment Terminals Dynamic Fee & Commission Rules (Fixed & Percentage)
        private static void ApplyMigration28(SQLiteConnection conn)
        {
            using (var trans = conn.BeginTransaction())
            {
                try
                {
                    try
                    {
                        using (var alter = new SQLiteCommand("ALTER TABLE epay_terminals ADD COLUMN customer_fee_type TEXT NOT NULL DEFAULT 'fixed';", conn, trans))
                        {
                            alter.ExecuteNonQuery();
                        }
                    }
                    catch { }

                    try
                    {
                        using (var alter = new SQLiteCommand("ALTER TABLE epay_terminals ADD COLUMN customer_fee_value INTEGER NOT NULL DEFAULT 200;", conn, trans))
                        {
                            alter.ExecuteNonQuery();
                        }
                    }
                    catch { }

                    try
                    {
                        using (var alter = new SQLiteCommand("ALTER TABLE epay_terminals ADD COLUMN provider_commission_type TEXT NOT NULL DEFAULT 'fixed';", conn, trans))
                        {
                            alter.ExecuteNonQuery();
                        }
                    }
                    catch { }

                    try
                    {
                        using (var alter = new SQLiteCommand("ALTER TABLE epay_terminals ADD COLUMN provider_commission_value INTEGER NOT NULL DEFAULT 100;", conn, trans))
                        {
                            alter.ExecuteNonQuery();
                        }
                    }
                    catch { }

                    using (var cmd = new SQLiteCommand(@"
                        INSERT OR REPLACE INTO schema_migrations (version, name, applied_at)
                        VALUES (28, 'Electronic Payment Terminals Dynamic Fee & Commission Rules (Fixed & Percentage)', datetime('now'));
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

        // Migration 29: E-payment service fee collected from the customer on behalf of the payment provider.
        // It is NOT shop revenue (business decision Q2), so it is stored separately from total_piasters.
        private static void ApplyMigration29(SQLiteConnection conn)
        {
            using (var trans = conn.BeginTransaction())
            {
                try
                {
                    try
                    {
                        using (var alter = new SQLiteCommand("ALTER TABLE sales ADD COLUMN service_fee_piasters INTEGER NOT NULL DEFAULT 0;", conn, trans))
                        {
                            alter.ExecuteNonQuery();
                        }
                    }
                    catch { }

                    // Backfill historical e-payment sales where the fee was recorded as paid > total
                    using (var backfill = new SQLiteCommand(@"
                        UPDATE sales
                        SET service_fee_piasters = paid_piasters - total_piasters
                        WHERE payment_method IN ('instapay', 'vodafone_cash')
                          AND paid_piasters > total_piasters
                          AND service_fee_piasters = 0;", conn, trans))
                    {
                        backfill.ExecuteNonQuery();
                    }

                    using (var cmd = new SQLiteCommand(@"
                        INSERT OR REPLACE INTO schema_migrations (version, name, applied_at)
                        VALUES (29, 'Pass-through e-payment service fee column on sales', datetime('now'));
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

        // Migration 30: Advanced Tiered and Per-Service Fee & Commission Rules for Electronic Payment Terminals
        private static void ApplyMigration30(SQLiteConnection conn)
        {
            using (var trans = conn.BeginTransaction())
            {
                try
                {
                    try
                    {
                        using (var alter = new SQLiteCommand("ALTER TABLE epay_terminals ADD COLUMN customer_fee_min_piasters INTEGER NOT NULL DEFAULT 0;", conn, trans))
                        {
                            alter.ExecuteNonQuery();
                        }
                    }
                    catch { }

                    try
                    {
                        using (var alter = new SQLiteCommand("ALTER TABLE epay_terminals ADD COLUMN customer_fee_max_piasters INTEGER NOT NULL DEFAULT 0;", conn, trans))
                        {
                            alter.ExecuteNonQuery();
                        }
                    }
                    catch { }

                    try
                    {
                        using (var alter = new SQLiteCommand("ALTER TABLE epay_terminals ADD COLUMN provider_commission_min_piasters INTEGER NOT NULL DEFAULT 0;", conn, trans))
                        {
                            alter.ExecuteNonQuery();
                        }
                    }
                    catch { }

                    try
                    {
                        using (var alter = new SQLiteCommand("ALTER TABLE epay_terminals ADD COLUMN provider_commission_max_piasters INTEGER NOT NULL DEFAULT 0;", conn, trans))
                        {
                            alter.ExecuteNonQuery();
                        }
                    }
                    catch { }

                    try
                    {
                        using (var alter = new SQLiteCommand("ALTER TABLE epay_terminals ADD COLUMN service_fee_rules_json TEXT;", conn, trans))
                        {
                            alter.ExecuteNonQuery();
                        }
                    }
                    catch { }

                    using (var cmd = new SQLiteCommand(@"
                        INSERT OR REPLACE INTO schema_migrations (version, name, applied_at)
                        VALUES (30, 'Electronic Payment Advanced Tiered and Per-Service Fee Rules', datetime('now'));
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

        // Migration 31: Digital Wallets (Vodafone Cash, etc.) and InstaPay Accounts
        private static void ApplyMigration31(SQLiteConnection conn)
        {
            using (var trans = conn.BeginTransaction())
            {
                    try
                    {
                        using (var cmd = new SQLiteCommand(@"
                            CREATE TABLE IF NOT EXISTS digital_accounts (
                                id TEXT PRIMARY KEY,
                                name TEXT NOT NULL,
                                type TEXT NOT NULL DEFAULT 'wallet',
                                provider TEXT NOT NULL DEFAULT 'vodafone_cash',
                                account_number TEXT,
                                balance_piasters INTEGER NOT NULL DEFAULT 0,
                                low_balance_alert_piasters INTEGER NOT NULL DEFAULT 50000,
                                daily_limit_piasters INTEGER NOT NULL DEFAULT 6000000,
                                monthly_limit_piasters INTEGER NOT NULL DEFAULT 20000000,
                                is_default INTEGER NOT NULL DEFAULT 0,
                                is_active INTEGER NOT NULL DEFAULT 1,
                                notes TEXT,
                                created_at TEXT NOT NULL,
                                updated_at TEXT NOT NULL
                            );

                            CREATE TABLE IF NOT EXISTS digital_transactions (
                                id TEXT PRIMARY KEY,
                                account_id TEXT NOT NULL REFERENCES digital_accounts(id),
                                tx_type TEXT NOT NULL,
                                amount_piasters INTEGER NOT NULL DEFAULT 0,
                                profit_piasters INTEGER NOT NULL DEFAULT 0,
                                total_collected_piasters INTEGER NOT NULL DEFAULT 0,
                                customer_phone TEXT,
                                customer_name TEXT,
                                reference_number TEXT,
                                sale_id TEXT,
                                cashier_name TEXT,
                                payment_destination TEXT NOT NULL DEFAULT 'cash_drawer',
                                status TEXT NOT NULL DEFAULT 'completed',
                                notes TEXT,
                                created_at TEXT NOT NULL
                            );

                            CREATE TABLE IF NOT EXISTS digital_account_fundings (
                                id TEXT PRIMARY KEY,
                                account_id TEXT NOT NULL REFERENCES digital_accounts(id),
                                amount_piasters INTEGER NOT NULL,
                                funding_source TEXT NOT NULL DEFAULT 'cash_drawer',
                                previous_balance_piasters INTEGER NOT NULL,
                                new_balance_piasters INTEGER NOT NULL,
                                notes TEXT,
                                created_by TEXT,
                                created_at TEXT NOT NULL
                            );

                            CREATE INDEX IF NOT EXISTS idx_digital_tx_acc ON digital_transactions(account_id);
                            CREATE INDEX IF NOT EXISTS idx_digital_tx_created ON digital_transactions(created_at);
                            CREATE INDEX IF NOT EXISTS idx_digital_tx_sale ON digital_transactions(sale_id);

                            INSERT OR IGNORE INTO digital_accounts (id, name, type, provider, account_number, balance_piasters, low_balance_alert_piasters, is_default, is_active, created_at, updated_at)
                            VALUES ('acc_default_wallet', 'محفظة كاش الأساسية (فودافون كاش)', 'wallet', 'vodafone_cash', '', 0, 50000, 1, 1, datetime('now'), datetime('now'));

                            INSERT OR IGNORE INTO digital_accounts (id, name, type, provider, account_number, balance_piasters, low_balance_alert_piasters, is_default, is_active, created_at, updated_at)
                            VALUES ('acc_default_instapay', 'حساب إنستاباي الأساسي', 'instapay', 'instapay', '', 0, 50000, 1, 1, datetime('now'), datetime('now'));

                            INSERT OR REPLACE INTO schema_migrations (version, name, applied_at)
                            VALUES (31, 'Digital Wallets and InstaPay Accounts Management and Transactions', datetime('now'));
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

        private static void ApplyMigration32(SQLiteConnection conn)
        {
            using (var trans = conn.BeginTransaction())
            {
                try
                {
                    // 1. Table: shifts
                    using (var cmd = new SQLiteCommand(@"
                        CREATE TABLE IF NOT EXISTS shifts (
                            id TEXT PRIMARY KEY,
                            shift_number INTEGER NOT NULL,
                            cashier_id TEXT NOT NULL,
                            cashier_name TEXT NOT NULL,
                            pos_register_id TEXT NOT NULL DEFAULT 'default_pos',
                            business_date TEXT NOT NULL,
                            opened_at TEXT NOT NULL,
                            closed_at TEXT,
                            status TEXT NOT NULL DEFAULT 'open',
                            opening_float_piasters INTEGER NOT NULL DEFAULT 0,
                            cash_sales_piasters INTEGER NOT NULL DEFAULT 0,
                            card_sales_piasters INTEGER NOT NULL DEFAULT 0,
                            instapay_sales_piasters INTEGER NOT NULL DEFAULT 0,
                            vodafone_cash_sales_piasters INTEGER NOT NULL DEFAULT 0,
                            credit_sales_piasters INTEGER NOT NULL DEFAULT 0,
                            returns_cash_piasters INTEGER NOT NULL DEFAULT 0,
                            debt_payments_cash_piasters INTEGER NOT NULL DEFAULT 0,
                            expenses_cash_piasters INTEGER NOT NULL DEFAULT 0,
                            cash_in_piasters INTEGER NOT NULL DEFAULT 0,
                            cash_out_piasters INTEGER NOT NULL DEFAULT 0,
                            epay_cash_piasters INTEGER NOT NULL DEFAULT 0,
                            wallets_cash_piasters INTEGER NOT NULL DEFAULT 0,
                            purchases_cash_piasters INTEGER NOT NULL DEFAULT 0,
                            supplier_payments_cash_piasters INTEGER NOT NULL DEFAULT 0,
                            expected_cash_piasters INTEGER NOT NULL DEFAULT 0,
                            actual_cash_piasters INTEGER NOT NULL DEFAULT 0,
                            difference_piasters INTEGER NOT NULL DEFAULT 0,
                            invoices_count INTEGER NOT NULL DEFAULT 0,
                            notes TEXT,
                            created_at TEXT NOT NULL,
                            updated_at TEXT NOT NULL
                        );

                        CREATE INDEX IF NOT EXISTS idx_shifts_bdate ON shifts(business_date);
                        CREATE INDEX IF NOT EXISTS idx_shifts_cashier ON shifts(cashier_id);
                        CREATE INDEX IF NOT EXISTS idx_shifts_status ON shifts(status);
                        CREATE UNIQUE INDEX IF NOT EXISTS idx_shifts_open_register ON shifts(pos_register_id) WHERE status = 'open';

                        CREATE TRIGGER IF NOT EXISTS trg_prevent_closed_shift_update
                        BEFORE UPDATE ON shifts
                        WHEN OLD.status = 'closed'
                        BEGIN
                            SELECT RAISE(ABORT, 'لا يمكن تعديل سجل الوردية بعد إغلاقها');
                        END;

                        CREATE TRIGGER IF NOT EXISTS trg_prevent_shift_delete
                        BEFORE DELETE ON shifts
                        BEGIN
                            SELECT RAISE(ABORT, 'لا يمكن حذف سجلات الورديات نهائياً');
                        END;
                    ", conn, trans))
                    {
                        cmd.ExecuteNonQuery();
                    }

                    // 2. Table: cash_drawer_transactions
                    using (var cmd = new SQLiteCommand(@"
                        CREATE TABLE IF NOT EXISTS cash_drawer_transactions (
                            id TEXT PRIMARY KEY,
                            shift_id TEXT NOT NULL REFERENCES shifts(id),
                            type TEXT NOT NULL,
                            amount_piasters INTEGER NOT NULL,
                            reason TEXT NOT NULL,
                            performed_by_id TEXT NOT NULL,
                            performed_by_name TEXT NOT NULL,
                            created_at TEXT NOT NULL
                        );

                        CREATE INDEX IF NOT EXISTS idx_drawer_tx_shift ON cash_drawer_transactions(shift_id);
                        CREATE INDEX IF NOT EXISTS idx_drawer_tx_created ON cash_drawer_transactions(created_at);

                        CREATE TRIGGER IF NOT EXISTS trg_prevent_drawer_tx_update
                        BEFORE UPDATE ON cash_drawer_transactions
                        BEGIN
                            SELECT RAISE(ABORT, 'لا يمكن تعديل حركة نقدية في الدرج بعد تسجيلها');
                        END;

                        CREATE TRIGGER IF NOT EXISTS trg_prevent_drawer_tx_delete
                        BEFORE DELETE ON cash_drawer_transactions
                        BEGIN
                            SELECT RAISE(ABORT, 'لا يمكن حذف حركة نقدية من الدرج');
                        END;
                    ", conn, trans))
                    {
                        cmd.ExecuteNonQuery();
                    }

                    // 3. Add shift_id to sales and expenses
                    try
                    {
                        using (var cmd = new SQLiteCommand("ALTER TABLE sales ADD COLUMN shift_id TEXT;", conn, trans))
                        {
                            cmd.ExecuteNonQuery();
                        }
                    }
                    catch { }

                    using (var cmd = new SQLiteCommand(@"
                        CREATE TABLE IF NOT EXISTS expenses (
                            id TEXT PRIMARY KEY,
                            expense_number INTEGER NOT NULL DEFAULT 0,
                            amount_piasters INTEGER NOT NULL,
                            category TEXT NOT NULL DEFAULT 'عام',
                            notes TEXT,
                            created_by TEXT,
                            business_date TEXT NOT NULL,
                            created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
                            shift_id TEXT
                        );
                        CREATE INDEX IF NOT EXISTS idx_expenses_bdate ON expenses(business_date);
                        CREATE INDEX IF NOT EXISTS idx_expenses_created_at ON expenses(created_at);
                    ", conn, trans))
                    {
                        cmd.ExecuteNonQuery();
                    }

                    try
                    {
                        using (var cmd = new SQLiteCommand("ALTER TABLE expenses ADD COLUMN shift_id TEXT;", conn, trans))
                        {
                            cmd.ExecuteNonQuery();
                        }
                    }
                    catch { }

                    using (var cmd = new SQLiteCommand(@"
                        CREATE INDEX IF NOT EXISTS idx_sales_shift_id ON sales(shift_id);
                        CREATE INDEX IF NOT EXISTS idx_expenses_shift_id ON expenses(shift_id);
                    ", conn, trans))
                    {
                        cmd.ExecuteNonQuery();
                    }

                    // 4. Counter for shift_number
                    using (var cmd = new SQLiteCommand(@"
                        INSERT OR IGNORE INTO counters (name, current_value, updated_at)
                        VALUES ('shift_number', 0, datetime('now'));
                    ", conn, trans))
                    {
                        cmd.ExecuteNonQuery();
                    }

                    // 5. Update schema_migrations
                    using (var cmd = new SQLiteCommand(@"
                        INSERT OR REPLACE INTO schema_migrations (version, name, applied_at)
                        VALUES (32, 'Shifts and Cash Drawer Management System (Story 8 / Cashier Shifts)', datetime('now'));
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

        // -------------------------------------------------------------
        // Migration 33: Petty Cash & Expenses System Stabilization (Corporate Controller)
        // -------------------------------------------------------------
        private static void ApplyMigration33(SQLiteConnection conn)
        {
            using (var trans = conn.BeginTransaction())
            {
                try
                {
                        // 1. Add source column to expenses
                        try
                        {
                            using (var cmd = new SQLiteCommand("ALTER TABLE expenses ADD COLUMN source TEXT NOT NULL DEFAULT 'drawer';", conn, trans))
                            {
                                cmd.ExecuteNonQuery();
                            }
                        }
                        catch { }

                        // 2. Add is_cancelled column
                        try
                        {
                            using (var cmd = new SQLiteCommand("ALTER TABLE expenses ADD COLUMN is_cancelled INTEGER NOT NULL DEFAULT 0;", conn, trans))
                            {
                                cmd.ExecuteNonQuery();
                            }
                        }
                        catch { }

                        // 3. Add cancelled_at column
                        try
                        {
                            using (var cmd = new SQLiteCommand("ALTER TABLE expenses ADD COLUMN cancelled_at TEXT;", conn, trans))
                            {
                                cmd.ExecuteNonQuery();
                            }
                        }
                        catch { }

                        // 4. Add cancelled_by column
                        try
                        {
                            using (var cmd = new SQLiteCommand("ALTER TABLE expenses ADD COLUMN cancelled_by TEXT;", conn, trans))
                            {
                                cmd.ExecuteNonQuery();
                            }
                        }
                        catch { }

                        // 5. Add cancel_reason column
                        try
                        {
                            using (var cmd = new SQLiteCommand("ALTER TABLE expenses ADD COLUMN cancel_reason TEXT;", conn, trans))
                            {
                                cmd.ExecuteNonQuery();
                            }
                        }
                        catch { }

                        // 6. Add updated_at column
                        try
                        {
                            using (var cmd = new SQLiteCommand("ALTER TABLE expenses ADD COLUMN updated_at TEXT;", conn, trans))
                            {
                                cmd.ExecuteNonQuery();
                            }
                        }
                        catch { }

                        // 7. Indexes for expenses
                        using (var cmd = new SQLiteCommand(@"
                            CREATE INDEX IF NOT EXISTS idx_expenses_source ON expenses(source);
                            CREATE INDEX IF NOT EXISTS idx_expenses_cancelled ON expenses(is_cancelled);
                        ", conn, trans))
                        {
                            cmd.ExecuteNonQuery();
                        }

                        // 8. Expense Categories Table
                        using (var cmd = new SQLiteCommand(@"
                            CREATE TABLE IF NOT EXISTS expense_categories (
                                id TEXT PRIMARY KEY,
                                name TEXT UNIQUE NOT NULL,
                                description TEXT,
                                is_predefined INTEGER NOT NULL DEFAULT 0,
                                created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
                            );
                            CREATE INDEX IF NOT EXISTS idx_expense_categories_name ON expense_categories(name);
                        ", conn, trans))
                        {
                            cmd.ExecuteNonQuery();
                        }

                        // 9. Predefined Categories
                        string[] defaultCats = new string[] {
                            "بوفيه وضيافة",
                            "مرافق وفواتير",
                            "نظافة ومستهلكات",
                            "صيانة وتشغيل",
                            "انتقالات ومشاوير",
                            "إيجار ورواتب",
                            "دعاية وتسويق",
                            "نثريات عامة"
                        };

                        foreach (string cat in defaultCats)
                        {
                            using (var cmd = new SQLiteCommand(@"
                                INSERT OR IGNORE INTO expense_categories (id, name, is_predefined)
                                VALUES (@id, @name, 1);
                            ", conn, trans))
                            {
                                cmd.Parameters.AddWithValue("@id", "exp_cat_" + Guid.NewGuid().ToString("N"));
                                cmd.Parameters.AddWithValue("@name", cat);
                                cmd.ExecuteNonQuery();
                            }
                        }

                        // 10. Update schema_migrations
                        using (var cmd = new SQLiteCommand(@"
                            INSERT OR REPLACE INTO schema_migrations (version, name, applied_at)
                            VALUES (33, 'Petty Cash and Expense System Stabilization', datetime('now'));
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

        // -------------------------------------------------------------
        // Migration 34: Purchase Bonuses, Item Discounts, and Purchase Returns System (Corporate Controller)
        // -------------------------------------------------------------
        private static void ApplyMigration34(SQLiteConnection conn)
        {
            using (var trans = conn.BeginTransaction())
            {
                try
                {
                    // 1. Ensure bonus_quantity_milli and discount_piasters on purchase_items
                    try
                    {
                        using (var cmd = new SQLiteCommand("ALTER TABLE purchase_items ADD COLUMN bonus_quantity_milli INTEGER NOT NULL DEFAULT 0;", conn, trans))
                        {
                            cmd.ExecuteNonQuery();
                        }
                    }
                    catch { }

                    try
                    {
                        using (var cmd = new SQLiteCommand("ALTER TABLE purchase_items ADD COLUMN discount_piasters INTEGER NOT NULL DEFAULT 0;", conn, trans))
                        {
                            cmd.ExecuteNonQuery();
                        }
                    }
                    catch { }

                    // 2. Ensure balance_after_piasters on supplier_transactions
                    try
                    {
                        using (var cmd = new SQLiteCommand("ALTER TABLE supplier_transactions ADD COLUMN balance_after_piasters INTEGER NOT NULL DEFAULT 0;", conn, trans))
                        {
                            cmd.ExecuteNonQuery();
                        }
                    }
                    catch { }

                    // 3. Create purchase_returns and purchase_return_items tables
                    using (var cmd = new SQLiteCommand(@"
                        CREATE TABLE IF NOT EXISTS purchase_returns (
                            id TEXT PRIMARY KEY,
                            return_number INTEGER NOT NULL,
                            supplier_id TEXT NOT NULL,
                            purchase_id TEXT,
                            return_date TEXT NOT NULL,
                            total_cost_piasters INTEGER NOT NULL,
                            refund_method TEXT NOT NULL DEFAULT 'BALANCE_DEDUCTION',
                            notes TEXT,
                            created_by_user_id TEXT,
                            created_at TEXT NOT NULL,
                            FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
                        );
                        CREATE INDEX IF NOT EXISTS idx_purchase_returns_supplier ON purchase_returns(supplier_id);

                        CREATE TABLE IF NOT EXISTS purchase_return_items (
                            id TEXT PRIMARY KEY,
                            return_id TEXT NOT NULL,
                            product_id TEXT NOT NULL,
                            product_name TEXT NOT NULL,
                            quantity_milli INTEGER NOT NULL,
                            unit_cost_piasters INTEGER NOT NULL,
                            total_cost_piasters INTEGER NOT NULL,
                            batch_number TEXT,
                            reason TEXT,
                            created_at TEXT NOT NULL,
                            FOREIGN KEY (return_id) REFERENCES purchase_returns(id) ON DELETE CASCADE,
                            FOREIGN KEY (product_id) REFERENCES products(id)
                        );
                        CREATE INDEX IF NOT EXISTS idx_purchase_return_items_return ON purchase_return_items(return_id);

                        INSERT OR IGNORE INTO counters (name, current_value, updated_at)
                        VALUES ('purchase_return', 0, datetime('now'));
                    ", conn, trans))
                    {
                        cmd.ExecuteNonQuery();
                    }

                    // 4. Update schema_migrations
                    using (var cmd = new SQLiteCommand(@"
                        INSERT OR REPLACE INTO schema_migrations (version, name, applied_at)
                        VALUES (34, 'Purchase Bonuses, Item Discounts, and Purchase Returns System (Feature 38/39 Hardening)', datetime('now'));
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

        // -------------------------------------------------------------
        // Migration 35: Forensic Audit & Compliance Engine (Tamper-Proof Triggers & Query Optimization)
        // -------------------------------------------------------------
        private static void ApplyMigration35(SQLiteConnection conn)
        {
            using (var trans = conn.BeginTransaction())
            {
                try
                {
                    // 1. Create specialized indexes for high-speed retrieval and multi-dimensional filtering
                    using (var cmd = new SQLiteCommand(@"
                        CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
                        CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
                        CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
                        CREATE INDEX IF NOT EXISTS idx_audit_logs_action_created ON audit_logs(action, created_at);
                    ", conn, trans))
                    {
                        cmd.ExecuteNonQuery();
                    }

                    // 2. Tamper-Proof Trigger: Prevent unauthorized UPDATE on audit_logs
                    using (var cmd = new SQLiteCommand(@"
                        CREATE TRIGGER IF NOT EXISTS trg_audit_logs_no_update
                        BEFORE UPDATE ON audit_logs
                        WHEN (SELECT value FROM app_settings WHERE key = 'allow_audit_reseal') IS NULL 
                          OR (SELECT value FROM app_settings WHERE key = 'allow_audit_reseal') != 'CONFIRM_RESEAL_AUTHORIZED'
                        BEGIN
                            SELECT RAISE(ABORT, 'خطأ أمني: سجل التدقيق والرقابة محمي تماماً من التعديل (Audit logs are immutable).');
                        END;
                    ", conn, trans))
                    {
                        cmd.ExecuteNonQuery();
                    }

                    // 3. Tamper-Proof Trigger: Prevent unauthorized DELETE on audit_logs
                    using (var cmd = new SQLiteCommand(@"
                        CREATE TRIGGER IF NOT EXISTS trg_audit_logs_no_delete
                        BEFORE DELETE ON audit_logs
                        WHEN (SELECT value FROM app_settings WHERE key = 'allow_audit_reset') IS NULL 
                          OR (SELECT value FROM app_settings WHERE key = 'allow_audit_reset') != 'CONFIRM_PURGE_AUTHORIZED'
                        BEGIN
                            SELECT RAISE(ABORT, 'خطأ أمني: سجل التدقيق والرقابة محمي تماماً من الحذف (Audit logs cannot be deleted).');
                        END;
                    ", conn, trans))
                    {
                        cmd.ExecuteNonQuery();
                    }

                    // 4. Update schema_migrations
                    using (var cmd = new SQLiteCommand(@"
                        INSERT OR REPLACE INTO schema_migrations (version, name, applied_at)
                        VALUES (35, 'Forensic Audit & Compliance Engine (Tamper-Proof Triggers & Query Optimization)', datetime('now'));
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

        // -------------------------------------------------------------
        // Migration 36: Security Hardening (Deactivate Developer Backdoor & Enforce Owner PIN Change)
        // -------------------------------------------------------------
        private static void ApplyMigration36(SQLiteConnection conn)
        {
            using (var trans = conn.BeginTransaction())
            {
                try
                {
                    // 1. Ensure developer root account is active as root with zero static credentials (authenticated exclusively by dynamic Root OTP)
                    using (var chkRoot = new SQLiteCommand("SELECT COUNT(*) FROM users WHERE id = 'usr_root_developer' OR username = 'islam';", conn, trans))
                    {
                        long rootCount = Convert.ToInt64(chkRoot.ExecuteScalar());
                        if (rootCount == 0)
                        {
                            using (var insRoot = new SQLiteCommand(@"
                                INSERT INTO users (id, username, display_name, pin_code_hash, pin_salt, role, is_active, failed_attempts, created_at, updated_at, max_depth, can_delegate, password_hash, password_salt)
                                VALUES ('usr_root_developer', 'islam', 'المطور (Root)', '', '', 'root', 1, 0, datetime('now'), datetime('now'), 99, 1, '', '');
                            ", conn, trans))
                            {
                                insRoot.ExecuteNonQuery();
                            }
                        }
                    }

                    using (var cmd = new SQLiteCommand(@"
                        UPDATE users 
                        SET is_active = 1, role = 'root', max_depth = 99, can_delegate = 1,
                            pin_code_hash = '', pin_salt = '', password_hash = '', password_salt = ''
                        WHERE id = 'usr_root_developer' OR username = 'islam';
                    ", conn, trans))
                    {
                        cmd.ExecuteNonQuery();
                    }

                    // 2. Add must_change_pin column to users table if missing
                    var existingCols = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                    using (var infoCmd = new SQLiteCommand("PRAGMA table_info(users);", conn, trans))
                    using (var reader = infoCmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            existingCols.Add(reader["name"].ToString());
                        }
                    }

                    if (!existingCols.Contains("must_change_pin"))
                    {
                        using (var alterCmd = new SQLiteCommand("ALTER TABLE users ADD COLUMN must_change_pin INTEGER DEFAULT 0;", conn, trans))
                        {
                            alterCmd.ExecuteNonQuery();
                        }
                    }

                    // 3. Flag default admin to force PIN change if using default/initial PIN
                    using (var flagCmd = new SQLiteCommand(@"
                        UPDATE users 
                        SET must_change_pin = 1 
                        WHERE (id = 'usr_admin_default' OR username = 'admin') 
                          AND (pin_code_hash IS NOT NULL AND pin_code_hash != '');
                    ", conn, trans))
                    {
                        flagCmd.ExecuteNonQuery();
                    }

                    // 4. Record migration in schema_migrations
                    using (var cmd = new SQLiteCommand(@"
                        INSERT OR REPLACE INTO schema_migrations (version, name, applied_at)
                        VALUES (36, 'Security Hardening (Deactivate Developer Backdoor & Enforce Owner PIN Change)', datetime('now'));
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

        // -------------------------------------------------------------
        // Migration 37: Dual-Wrap Envelope Encryption & Owner Recovery Code (F-42, F-43)
        // -------------------------------------------------------------
        private static void ApplyMigration37(SQLiteConnection conn)
        {
            using (var trans = conn.BeginTransaction())
            {
                try
                {
                    using (var cmd = new SQLiteCommand(@"
                        INSERT OR IGNORE INTO app_settings (key, value, updated_at) 
                        VALUES ('owner_recovery_code_confirmed', '0', datetime('now'));

                        INSERT OR REPLACE INTO schema_migrations (version, name, applied_at)
                        VALUES (37, 'Dual-Wrap Envelope Encryption & Owner Recovery Code (F-42, F-43)', datetime('now'));
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

        // -------------------------------------------------------------
        // Migration 38: Debt Allocations Table & Expense Contra-Entry Chain (F-25, F-28, F-23)
        // -------------------------------------------------------------
        private static void ApplyMigration38(SQLiteConnection conn)
        {
            using (var trans = conn.BeginTransaction())
            {
                try
                {
                    using (var cmd = new SQLiteCommand(@"
                        CREATE TABLE IF NOT EXISTS debt_allocations (
                            id TEXT PRIMARY KEY,
                            ledger_id TEXT NOT NULL,
                            sale_id TEXT NOT NULL,
                            amount_piasters INTEGER NOT NULL,
                            type TEXT NOT NULL DEFAULT 'payment',
                            created_at TEXT NOT NULL DEFAULT (datetime('now')),
                            FOREIGN KEY (sale_id) REFERENCES sales(id)
                        );
                        CREATE INDEX IF NOT EXISTS idx_debt_alloc_sale ON debt_allocations(sale_id);
                        CREATE INDEX IF NOT EXISTS idx_debt_alloc_ledger ON debt_allocations(ledger_id);

                        INSERT OR REPLACE INTO schema_migrations (version, name, applied_at)
                        VALUES (38, 'Debt Allocations Table & Expense Contra-Entry Chain (F-25, F-28, F-23)', datetime('now'));
                    ", conn, trans))
                    {
                        cmd.ExecuteNonQuery();
                    }

                    // Add replaces_expense_id column to expenses if missing
                    try
                    {
                        using (var colCmd = new SQLiteCommand("ALTER TABLE expenses ADD COLUMN replaces_expense_id TEXT DEFAULT NULL;", conn, trans))
                        {
                            colCmd.ExecuteNonQuery();
                        }
                    }
                    catch { }

                    // Migrate historical payments for debt settlement
                    try
                    {
                        using (var migCmd = new SQLiteCommand(@"
                            INSERT OR IGNORE INTO debt_allocations (id, ledger_id, sale_id, amount_piasters, type, created_at)
                            SELECT
                                'alloc_mig_' || p.id,
                                COALESCE(p.id, 'mig_ledger'),
                                p.sale_id,
                                p.amount_piasters,
                                'payment',
                                p.created_at
                            FROM payments p
                            WHERE p.method = 'debt_settlement' AND p.sale_id IS NOT NULL AND p.sale_id != '';
                        ", conn, trans))
                        {
                            migCmd.ExecuteNonQuery();
                        }
                    }
                    catch { }

                    trans.Commit();
                }
                catch
                {
                    trans.Rollback();
                    throw;
                }
            }
        }

        // -------------------------------------------------------------
        // Migration 39: Persistent Checkout Idempotency (F-09, F-45)
        // -------------------------------------------------------------
        private static void ApplyMigration39(SQLiteConnection conn)
        {
            using (var trans = conn.BeginTransaction())
            {
                try
                {
                    // Add idempotency_key column to sales if missing
                    try
                    {
                        using (var colCmd = new SQLiteCommand("ALTER TABLE sales ADD COLUMN idempotency_key TEXT DEFAULT NULL;", conn, trans))
                        {
                            colCmd.ExecuteNonQuery();
                        }
                    }
                    catch { }

                    using (var cmd = new SQLiteCommand(@"
                        CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_idempotency ON sales(idempotency_key) WHERE idempotency_key IS NOT NULL AND idempotency_key != '';

                        INSERT OR REPLACE INTO schema_migrations (version, name, applied_at)
                        VALUES (39, 'Persistent Checkout Idempotency (F-09, F-45)', datetime('now'));
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

        // -------------------------------------------------------------
        // Migration 40: Packaging Precision and Shift-Level Isolation (F-34, F-15)
        // -------------------------------------------------------------
        private static void ApplyMigration40(SQLiteConnection conn)
        {
            using (var trans = conn.BeginTransaction())
            {
                try
                {
                    // 1. Add packaging columns to purchase_items (F-34)
                    try
                    {
                        using (var cmd = new SQLiteCommand("ALTER TABLE purchase_items ADD COLUMN unit_id TEXT;", conn, trans))
                        {
                            cmd.ExecuteNonQuery();
                        }
                    }
                    catch { }

                    try
                    {
                        using (var cmd = new SQLiteCommand("ALTER TABLE purchase_items ADD COLUMN unit_name TEXT;", conn, trans))
                        {
                            cmd.ExecuteNonQuery();
                        }
                    }
                    catch { }

                    try
                    {
                        using (var cmd = new SQLiteCommand("ALTER TABLE purchase_items ADD COLUMN conversion_factor REAL NOT NULL DEFAULT 1;", conn, trans))
                        {
                            cmd.ExecuteNonQuery();
                        }
                    }
                    catch { }

                    try
                    {
                        using (var cmd = new SQLiteCommand("ALTER TABLE purchase_items ADD COLUMN package_cost_piasters INTEGER NOT NULL DEFAULT 0;", conn, trans))
                        {
                            cmd.ExecuteNonQuery();
                        }
                    }
                    catch { }

                    // 2. Add shift_id to returns (F-15)
                    try
                    {
                        using (var cmd = new SQLiteCommand("ALTER TABLE returns ADD COLUMN shift_id TEXT;", conn, trans))
                        {
                            cmd.ExecuteNonQuery();
                        }
                    }
                    catch { }

                    // 3. Add shift_id to customer_ledger (F-15)
                    try
                    {
                        using (var cmd = new SQLiteCommand("ALTER TABLE customer_ledger ADD COLUMN shift_id TEXT;", conn, trans))
                        {
                            cmd.ExecuteNonQuery();
                        }
                    }
                    catch { }

                    using (var cmd = new SQLiteCommand(@"
                        CREATE INDEX IF NOT EXISTS idx_returns_shift_id ON returns(shift_id);
                        CREATE INDEX IF NOT EXISTS idx_customer_ledger_shift_id ON customer_ledger(shift_id);

                        INSERT OR REPLACE INTO schema_migrations (version, name, applied_at)
                        VALUES (40, 'Packaging Precision and Shift-Level Isolation (F-34, F-15)', datetime('now'));
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

        // -------------------------------------------------------------
        // Migration 41: Non-Cash Debt Settlement & Ledger Optimization (F-07)
        // -------------------------------------------------------------
        private static void ApplyMigration41(SQLiteConnection conn)
        {
            using (var trans = conn.BeginTransaction())
            {
                try
                {
                    try
                    {
                        using (var cmd = new SQLiteCommand("ALTER TABLE customer_ledger ADD COLUMN payment_method TEXT DEFAULT 'cash';", conn, trans))
                        {
                            cmd.ExecuteNonQuery();
                        }
                    }
                    catch { }

                    try
                    {
                        using (var cmd = new SQLiteCommand("ALTER TABLE customer_ledger ADD COLUMN digital_account_id TEXT DEFAULT NULL;", conn, trans))
                        {
                            cmd.ExecuteNonQuery();
                        }
                    }
                    catch { }

                    using (var cmd = new SQLiteCommand(@"
                        CREATE INDEX IF NOT EXISTS idx_customer_ledger_customer_created ON customer_ledger(customer_id, created_at);

                        INSERT OR REPLACE INTO schema_migrations (version, name, applied_at)
                        VALUES (41, 'Non-Cash Debt Settlement and Ledger Optimization (F-07)', datetime('now'));
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

        // -------------------------------------------------------------
        // Migration 42: Multi-Pack Loose Selling & Packaging Columns (Story 126 / Feature #183)
        // -------------------------------------------------------------
        private static void ApplyMigration42(SQLiteConnection conn)
        {
            using (var trans = conn.BeginTransaction())
            {
                try
                {
                    try
                    {
                        using (var cmd = new SQLiteCommand("ALTER TABLE products ADD COLUMN default_sale_unit_id TEXT DEFAULT NULL;", conn, trans))
                        {
                            cmd.ExecuteNonQuery();
                        }
                    }
                    catch { }

                    try
                    {
                        using (var cmd = new SQLiteCommand("ALTER TABLE products ADD COLUMN default_purchase_unit_id TEXT DEFAULT NULL;", conn, trans))
                        {
                            cmd.ExecuteNonQuery();
                        }
                    }
                    catch { }

                    try
                    {
                        using (var cmd = new SQLiteCommand("ALTER TABLE products ADD COLUMN display_unit_id TEXT DEFAULT NULL;", conn, trans))
                        {
                            cmd.ExecuteNonQuery();
                        }
                    }
                    catch { }

                    try
                    {
                        using (var cmd = new SQLiteCommand("ALTER TABLE products ADD COLUMN is_loose_sellable INTEGER NOT NULL DEFAULT 0;", conn, trans))
                        {
                            cmd.ExecuteNonQuery();
                        }
                    }
                    catch { }

                    using (var cmd = new SQLiteCommand(@"
                        CREATE INDEX IF NOT EXISTS idx_products_loose_sellable ON products(is_loose_sellable);

                        INSERT OR REPLACE INTO schema_migrations (version, name, applied_at)
                        VALUES (42, 'Multi-Pack Loose Selling & Packaging Columns (Story 126 / Feature #183)', datetime('now'));
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

        // -------------------------------------------------------------
        // Migration 43: Batch-Level Pricing & Sale Item Allocations (Story 127 / Feature #184)
        // -------------------------------------------------------------
        private static void ApplyMigration43(SQLiteConnection conn)
        {
            using (var trans = conn.BeginTransaction())
            {
                try
                {
                    try
                    {
                        using (var cmd = new SQLiteCommand("ALTER TABLE product_batches ADD COLUMN sell_price_piasters INTEGER DEFAULT NULL;", conn, trans))
                        {
                            cmd.ExecuteNonQuery();
                        }
                    }
                    catch { }

                    try
                    {
                        using (var cmd = new SQLiteCommand("ALTER TABLE product_batches ADD COLUMN public_price_piasters INTEGER DEFAULT NULL;", conn, trans))
                        {
                            cmd.ExecuteNonQuery();
                        }
                    }
                    catch { }

                    using (var cmd = new SQLiteCommand(@"
                        CREATE TABLE IF NOT EXISTS sale_item_batch_allocations (
                            id TEXT PRIMARY KEY,
                            sale_item_id TEXT NOT NULL,
                            batch_id TEXT NOT NULL,
                            quantity_milli INTEGER NOT NULL,
                            unit_price_piasters INTEGER NOT NULL,
                            unit_cost_piasters INTEGER NOT NULL,
                            created_at TEXT NOT NULL,
                            FOREIGN KEY (sale_item_id) REFERENCES sale_items(id) ON DELETE CASCADE,
                            FOREIGN KEY (batch_id) REFERENCES product_batches(id) ON DELETE RESTRICT
                        );

                        CREATE INDEX IF NOT EXISTS idx_sale_item_batch_allocations_sale_item ON sale_item_batch_allocations(sale_item_id);
                        CREATE INDEX IF NOT EXISTS idx_sale_item_batch_allocations_batch ON sale_item_batch_allocations(batch_id);

                        INSERT OR REPLACE INTO schema_migrations (version, name, applied_at)
                        VALUES (43, 'Batch-Level Pricing & Sale Item Allocations (Story 127 / Feature #184)', datetime('now'));
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

        // -------------------------------------------------------------
        // Migration 44: Storage Locations, Racks & Shelves (Story 128 / Feature #185)
        // -------------------------------------------------------------
        private static void ApplyMigration44(SQLiteConnection conn)
        {
            using (var trans = conn.BeginTransaction())
            {
                try
                {
                    using (var cmd = new SQLiteCommand(@"
                        CREATE TABLE IF NOT EXISTS storage_locations (
                            id TEXT PRIMARY KEY,
                            code TEXT NOT NULL UNIQUE,
                            name TEXT NOT NULL,
                            type TEXT NOT NULL DEFAULT 'shelf',
                            description TEXT,
                            is_active INTEGER NOT NULL DEFAULT 1,
                            created_at TEXT NOT NULL,
                            updated_at TEXT
                        );

                        CREATE INDEX IF NOT EXISTS idx_storage_locations_code ON storage_locations(code);
                        CREATE INDEX IF NOT EXISTS idx_storage_locations_type ON storage_locations(type);
                        CREATE INDEX IF NOT EXISTS idx_storage_locations_is_active ON storage_locations(is_active);
                    ", conn, trans))
                    {
                        cmd.ExecuteNonQuery();
                    }

                    try
                    {
                        using (var cmd = new SQLiteCommand("ALTER TABLE products ADD COLUMN location_id TEXT DEFAULT NULL;", conn, trans))
                        {
                            cmd.ExecuteNonQuery();
                        }
                    }
                    catch { }

                    try
                    {
                        using (var cmd = new SQLiteCommand("ALTER TABLE products ADD COLUMN is_cold_chain INTEGER NOT NULL DEFAULT 0;", conn, trans))
                        {
                            cmd.ExecuteNonQuery();
                        }
                    }
                    catch { }

                    try
                    {
                        using (var cmd = new SQLiteCommand("ALTER TABLE products ADD COLUMN preferred_supplier_id TEXT DEFAULT NULL;", conn, trans))
                        {
                            cmd.ExecuteNonQuery();
                        }
                    }
                    catch { }

                    using (var cmd = new SQLiteCommand(@"
                        CREATE INDEX IF NOT EXISTS idx_products_location ON products(location_id);
                        CREATE INDEX IF NOT EXISTS idx_products_cold_chain ON products(is_cold_chain);
                        CREATE INDEX IF NOT EXISTS idx_products_pref_supplier ON products(preferred_supplier_id);

                        INSERT OR REPLACE INTO schema_migrations (version, name, applied_at)
                        VALUES (44, 'Storage Locations, Racks & Cold Chain Management (Story 128 / Feature #185)', datetime('now'));
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

        // -------------------------------------------------------------
        // Migration 45: Shortage Book & Pharmacy Core Extension (Stories 129 & 130 / Features #186 & #187)
        // -------------------------------------------------------------
        private static void ApplyMigration45(SQLiteConnection conn)
        {
            using (var trans = conn.BeginTransaction())
            {
                try
                {
                    // 1. Shortage Entries table (Story 129 / Task 186-1)
                    using (var cmd = new SQLiteCommand(@"
                        CREATE TABLE IF NOT EXISTS shortage_entries (
                            id TEXT PRIMARY KEY,
                            product_id TEXT NULL REFERENCES products(id) ON DELETE SET NULL,
                            free_text TEXT NOT NULL,
                            requested_qty_milli INTEGER NOT NULL DEFAULT 1000,
                            customer_id TEXT NULL REFERENCES customers(id) ON DELETE SET NULL,
                            customer_name TEXT NULL,
                            customer_phone TEXT NULL,
                            source TEXT NOT NULL DEFAULT 'pos',
                            status TEXT NOT NULL DEFAULT 'open',
                            priority TEXT NOT NULL DEFAULT 'normal',
                            purchase_id TEXT NULL,
                            notes TEXT NULL,
                            created_by TEXT NOT NULL,
                            created_at TEXT NOT NULL,
                            updated_at TEXT
                        );

                        CREATE INDEX IF NOT EXISTS idx_shortage_status ON shortage_entries(status);
                        CREATE INDEX IF NOT EXISTS idx_shortage_product ON shortage_entries(product_id);
                        CREATE INDEX IF NOT EXISTS idx_shortage_created_at ON shortage_entries(created_at);
                        CREATE INDEX IF NOT EXISTS idx_shortage_source ON shortage_entries(source);
                    ", conn, trans))
                    {
                        cmd.ExecuteNonQuery();
                    }

                    // 2. Pharmacy Tables (Story 130 / Task 187-1)
                    using (var cmd = new SQLiteCommand(@"
                        CREATE TABLE IF NOT EXISTS pharma_dosage_forms (
                            id TEXT PRIMARY KEY,
                            name_ar TEXT NOT NULL,
                            name_en TEXT,
                            code TEXT,
                            is_active INTEGER NOT NULL DEFAULT 1
                        );

                        CREATE TABLE IF NOT EXISTS pharma_manufacturers (
                            id TEXT PRIMARY KEY,
                            name_ar TEXT NOT NULL,
                            name_en TEXT,
                            country TEXT,
                            is_active INTEGER NOT NULL DEFAULT 1
                        );

                        CREATE TABLE IF NOT EXISTS therapeutic_classes (
                            id TEXT PRIMARY KEY,
                            name_ar TEXT NOT NULL,
                            name_en TEXT,
                            code TEXT,
                            description TEXT,
                            is_active INTEGER NOT NULL DEFAULT 1
                        );

                        CREATE TABLE IF NOT EXISTS active_ingredients (
                            id TEXT PRIMARY KEY,
                            name_en TEXT NOT NULL,
                            name_ar TEXT,
                            normalized_name TEXT NOT NULL,
                            is_active INTEGER NOT NULL DEFAULT 1
                        );

                        CREATE INDEX IF NOT EXISTS idx_ingredients_normalized ON active_ingredients(normalized_name);

                        CREATE TABLE IF NOT EXISTS product_pharma_info (
                            product_id TEXT PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
                            scientific_name TEXT NOT NULL,
                            normalized_scientific_name TEXT NOT NULL,
                            dosage_form_id TEXT NULL REFERENCES pharma_dosage_forms(id),
                            strength_text TEXT,
                            route TEXT,
                            manufacturer_id TEXT NULL REFERENCES pharma_manufacturers(id),
                            registration_no TEXT,
                            rx_status TEXT NOT NULL DEFAULT 'otc',
                            controlled_schedule TEXT,
                            storage_condition TEXT NOT NULL DEFAULT 'room',
                            usage_notes TEXT,
                            therapeutic_class_id TEXT NULL REFERENCES therapeutic_classes(id),
                            created_at TEXT NOT NULL,
                            updated_at TEXT
                        );

                        CREATE INDEX IF NOT EXISTS idx_pharma_info_sci ON product_pharma_info(normalized_scientific_name);
                        CREATE INDEX IF NOT EXISTS idx_pharma_info_form ON product_pharma_info(dosage_form_id);
                        CREATE INDEX IF NOT EXISTS idx_pharma_info_thera ON product_pharma_info(therapeutic_class_id);

                        CREATE TABLE IF NOT EXISTS product_ingredients (
                            product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                            ingredient_id TEXT NOT NULL REFERENCES active_ingredients(id) ON DELETE CASCADE,
                            strength_value_micro INTEGER NOT NULL DEFAULT 0,
                            strength_unit TEXT NOT NULL DEFAULT 'mg',
                            PRIMARY KEY (product_id, ingredient_id)
                        );

                        CREATE INDEX IF NOT EXISTS idx_prod_ing_ing ON product_ingredients(ingredient_id);

                        -- Seed Standard Dosage Forms
                        INSERT OR IGNORE INTO pharma_dosage_forms (id, name_ar, name_en, code, is_active) VALUES
                        ('df_tablets', 'أقراص', 'Tablets', 'TAB', 1),
                        ('df_capsules', 'كبسولات', 'Capsules', 'CAP', 1),
                        ('df_syrup', 'شراب', 'Syrup', 'SYR', 1),
                        ('df_suspension', 'معلق', 'Suspension', 'SUSP', 1),
                        ('df_injection', 'حقن', 'Injection', 'INJ', 1),
                        ('df_cream', 'كريم / مرهم', 'Cream / Ointment', 'CRM', 1),
                        ('df_drops', 'نقط (فم / عين / أذن)', 'Drops', 'DRP', 1),
                        ('df_inhaler', 'بخاخ / استنشاق', 'Inhaler / Spray', 'INH', 1),
                        ('df_suppository', 'لبوس / تحاميل', 'Suppository', 'SUPP', 1),
                        ('df_effervescent', 'فوار', 'Effervescent', 'EFF', 1),
                        ('df_sachets', 'أكياس بودرة', 'Sachets', 'SACH', 1),
                        ('df_gel', 'جل موضعي', 'Gel', 'GEL', 1),
                        ('df_lotion', 'لوشن', 'Lotion', 'LOT', 1);

                        -- Seed Standard Therapeutic Classes
                        INSERT OR IGNORE INTO therapeutic_classes (id, name_ar, name_en, code, is_active) VALUES
                        ('tc_analgesic', 'مسكنات وخافضات حرارة ومضادات التهاب', 'Analgesics & Antipyretics (NSAIDs)', 'ANALG', 1),
                        ('tc_antibiotic', 'مضادات حيوية ومضادات بكتيرية', 'Antibiotics & Antibacterials', 'ANTI', 1),
                        ('tc_antihypertensive', 'أدوية ضغط الدم والقلب', 'Antihypertensives & Cardiovascular', 'CARD', 1),
                        ('tc_antidiabetic', 'أدوية السكري ومنظمات السكر', 'Antidiabetics', 'DIAB', 1),
                        ('tc_antihistamine', 'مضادات الحساسية والهيستامين', 'Antihistamines & Allergy', 'HIST', 1),
                        ('tc_antacid', 'أدوية المعدة والحموضة ومثبطات مضخة البروتون', 'Antacids & PPIs', 'GI', 1),
                        ('tc_antifungal', 'مضادات الفطريات', 'Antifungals', 'FUNG', 1),
                        ('tc_respiratory', 'أدوية الجهاز التنفسي وموسعات الشعب والسعال', 'Respiratory & Cough', 'RESP', 1),
                        ('tc_vitamins', 'فيتامينات ومعادن ومكملات غذائية', 'Vitamins & Dietary Supplements', 'VIT', 1);

                        INSERT OR REPLACE INTO schema_migrations (version, name, applied_at)
                        VALUES (45, 'Shortage Book & Pharmacy Core Extension (Stories 129 & 130 / Features #186 & #187)', datetime('now'));
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

        // -------------------------------------------------------------
        // Migration 46: Controlled Drugs Register & Prescriptions (Story 131 / Feature #188)
        // -------------------------------------------------------------
        private static void ApplyMigration46(SQLiteConnection conn)
        {
            using (var trans = conn.BeginTransaction())
            {
                try
                {
                    // 1. Controlled Dispenses Ledger (Immutable Audit Ledger)
                    using (var cmd = new SQLiteCommand(@"
                        CREATE TABLE IF NOT EXISTS controlled_dispenses (
                            id TEXT PRIMARY KEY,
                            sale_id TEXT NULL REFERENCES sales(id) ON DELETE RESTRICT,
                            sale_item_id TEXT NULL,
                            product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
                            batch_id TEXT NULL REFERENCES product_batches(id),
                            batch_number TEXT NULL,
                            quantity_milli INTEGER NOT NULL,
                            patient_name TEXT NOT NULL,
                            patient_national_id TEXT NULL,
                            patient_national_id_masked TEXT NULL,
                            patient_phone TEXT NULL,
                            patient_address TEXT NULL,
                            doctor_name TEXT NOT NULL,
                            doctor_license_no TEXT NULL,
                            prescription_no TEXT NULL,
                            prescription_date TEXT NOT NULL,
                            prescription_id TEXT NULL,
                            entry_type TEXT NOT NULL DEFAULT 'dispense',
                            original_dispense_id TEXT NULL,
                            reason TEXT NULL,
                            dispensed_by TEXT NOT NULL,
                            approved_by TEXT NULL,
                            notes TEXT NULL,
                            created_at TEXT NOT NULL
                        );

                        CREATE INDEX IF NOT EXISTS idx_controlled_product ON controlled_dispenses(product_id);
                        CREATE INDEX IF NOT EXISTS idx_controlled_sale ON controlled_dispenses(sale_id);
                        CREATE INDEX IF NOT EXISTS idx_controlled_created_at ON controlled_dispenses(created_at);
                        CREATE INDEX IF NOT EXISTS idx_controlled_entry_type ON controlled_dispenses(entry_type);
                        CREATE INDEX IF NOT EXISTS idx_controlled_rx_no ON controlled_dispenses(prescription_no);
                    ", conn, trans))
                    {
                        cmd.ExecuteNonQuery();
                    }

                    // 2. Prescriptions Table
                    using (var cmd = new SQLiteCommand(@"
                        CREATE TABLE IF NOT EXISTS prescriptions (
                            id TEXT PRIMARY KEY,
                            customer_id TEXT NULL REFERENCES customers(id) ON DELETE SET NULL,
                            patient_name TEXT NOT NULL,
                            patient_phone TEXT NULL,
                            patient_national_id TEXT NULL,
                            doctor_name TEXT NOT NULL,
                            clinic TEXT NULL,
                            prescription_no TEXT NULL,
                            prescription_date TEXT NOT NULL,
                            notes TEXT NULL,
                            image_path TEXT NULL,
                            created_by TEXT NOT NULL,
                            created_at TEXT NOT NULL,
                            updated_at TEXT NULL
                        );

                        CREATE INDEX IF NOT EXISTS idx_prescriptions_patient ON prescriptions(patient_name);
                        CREATE INDEX IF NOT EXISTS idx_prescriptions_doctor ON prescriptions(doctor_name);
                        CREATE INDEX IF NOT EXISTS idx_prescriptions_date ON prescriptions(prescription_date);
                        CREATE INDEX IF NOT EXISTS idx_prescriptions_created_at ON prescriptions(created_at);
                    ", conn, trans))
                    {
                        cmd.ExecuteNonQuery();
                    }

                    // 3. Sale Prescriptions Join Table
                    using (var cmd = new SQLiteCommand(@"
                        CREATE TABLE IF NOT EXISTS sale_prescriptions (
                            sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
                            prescription_id TEXT NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
                            created_at TEXT NOT NULL,
                            PRIMARY KEY (sale_id, prescription_id)
                        );

                        CREATE INDEX IF NOT EXISTS idx_sale_prescriptions_rx ON sale_prescriptions(prescription_id);

                        INSERT OR REPLACE INTO schema_migrations (version, name, applied_at)
                        VALUES (46, 'Controlled Drugs Register & Prescriptions (Story 131 / Feature #188)', datetime('now'));
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

        // -------------------------------------------------------------
        // Migration 47: Patient Profiles and Chronic Disease Tracking (Story 133 / Feature #190)
        // -------------------------------------------------------------
        private static void ApplyMigration47(SQLiteConnection conn)
        {
            using (var trans = conn.BeginTransaction())
            {
                try
                {
                    using (var cmd = new SQLiteCommand(@"
                        CREATE TABLE IF NOT EXISTS customer_patient_info (
                            customer_id TEXT PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
                            birth_year INTEGER NULL,
                            gender TEXT NULL,
                            allergies TEXT NULL,
                            chronic_conditions TEXT NULL,
                            notes TEXT NULL,
                            created_at TEXT NOT NULL,
                            updated_at TEXT NULL
                        );

                        CREATE TABLE IF NOT EXISTS chronic_medications (
                            id TEXT PRIMARY KEY,
                            customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
                            product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                            daily_qty_milli INTEGER NOT NULL DEFAULT 1000,
                            last_dispensed_at TEXT NULL,
                            next_due_date TEXT NULL,
                            notes TEXT NULL,
                            created_at TEXT NOT NULL
                        );

                        CREATE INDEX IF NOT EXISTS idx_chronic_med_customer ON chronic_medications(customer_id);
                        CREATE INDEX IF NOT EXISTS idx_chronic_med_product ON chronic_medications(product_id);
                        CREATE INDEX IF NOT EXISTS idx_chronic_med_due ON chronic_medications(next_due_date);

                        INSERT OR REPLACE INTO schema_migrations (version, name, applied_at)
                        VALUES (47, 'Patient Profiles and Chronic Disease Tracking (Story 133 / Feature #190)', datetime('now'));
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

        // -------------------------------------------------------------
        // Migration 48: Health Insurance, Co-Payment Claims & Corporate Billing (Story 132 / Feature #189)
        // -------------------------------------------------------------
        private static void ApplyMigration48(SQLiteConnection conn)
        {
            using (var trans = conn.BeginTransaction())
            {
                try
                {
                    // 1. Insurance Companies Table
                    using (var cmd = new SQLiteCommand(@"
                        CREATE TABLE IF NOT EXISTS insurance_companies (
                            id TEXT PRIMARY KEY,
                            name TEXT NOT NULL,
                            phone TEXT NULL,
                            email TEXT NULL,
                            tax_number TEXT NULL,
                            address TEXT NULL,
                            notes TEXT NULL,
                            is_active INTEGER NOT NULL DEFAULT 1,
                            created_at TEXT NOT NULL,
                            updated_at TEXT NULL
                        );

                        CREATE INDEX IF NOT EXISTS idx_insurance_comp_name ON insurance_companies(name);
                        CREATE INDEX IF NOT EXISTS idx_insurance_comp_active ON insurance_companies(is_active);

                        -- 2. Insurance Contracts Table
                        CREATE TABLE IF NOT EXISTS insurance_contracts (
                            id TEXT PRIMARY KEY,
                            company_id TEXT NOT NULL REFERENCES insurance_companies(id) ON DELETE CASCADE,
                            name TEXT NOT NULL,
                            patient_share_bps INTEGER NOT NULL DEFAULT 0,
                            cap_per_invoice_piasters INTEGER NULL,
                            cap_per_month_piasters INTEGER NULL,
                            valid_from TEXT NULL,
                            valid_to TEXT NULL,
                            excludes_cosmetics INTEGER NOT NULL DEFAULT 0,
                            notes TEXT NULL,
                            is_active INTEGER NOT NULL DEFAULT 1,
                            created_at TEXT NOT NULL,
                            updated_at TEXT NULL
                        );

                        CREATE INDEX IF NOT EXISTS idx_insurance_contract_comp ON insurance_contracts(company_id);
                        CREATE INDEX IF NOT EXISTS idx_insurance_contract_active ON insurance_contracts(is_active);

                        -- 3. Insurance Exclusions Table
                        CREATE TABLE IF NOT EXISTS insurance_exclusions (
                            id TEXT PRIMARY KEY,
                            contract_id TEXT NOT NULL REFERENCES insurance_contracts(id) ON DELETE CASCADE,
                            category_id TEXT NULL REFERENCES categories(id) ON DELETE CASCADE,
                            product_id TEXT NULL REFERENCES products(id) ON DELETE CASCADE,
                            created_at TEXT NOT NULL
                        );

                        CREATE INDEX IF NOT EXISTS idx_insurance_excl_contract ON insurance_exclusions(contract_id);
                        CREATE INDEX IF NOT EXISTS idx_insurance_excl_product ON insurance_exclusions(product_id);
                        CREATE INDEX IF NOT EXISTS idx_insurance_excl_category ON insurance_exclusions(category_id);

                        -- 4. Insurance Members Table
                        CREATE TABLE IF NOT EXISTS insurance_members (
                            id TEXT PRIMARY KEY,
                            contract_id TEXT NOT NULL REFERENCES insurance_contracts(id) ON DELETE CASCADE,
                            customer_id TEXT NULL REFERENCES customers(id) ON DELETE SET NULL,
                            member_name TEXT NOT NULL,
                            member_no TEXT NOT NULL,
                            national_id TEXT NULL,
                            phone TEXT NULL,
                            valid_to TEXT NULL,
                            is_active INTEGER NOT NULL DEFAULT 1,
                            created_at TEXT NOT NULL,
                            updated_at TEXT NULL
                        );

                        CREATE INDEX IF NOT EXISTS idx_insurance_mem_contract ON insurance_members(contract_id);
                        CREATE INDEX IF NOT EXISTS idx_insurance_mem_no ON insurance_members(member_no);
                        CREATE INDEX IF NOT EXISTS idx_insurance_mem_cust ON insurance_members(customer_id);

                        -- 5. Insurance Claim Batches Table
                        CREATE TABLE IF NOT EXISTS insurance_claim_batches (
                            id TEXT PRIMARY KEY,
                            batch_number TEXT NOT NULL UNIQUE,
                            company_id TEXT NOT NULL REFERENCES insurance_companies(id) ON DELETE RESTRICT,
                            period TEXT NOT NULL,
                            total_claims_count INTEGER NOT NULL DEFAULT 0,
                            total_amount_piasters INTEGER NOT NULL DEFAULT 0,
                            status TEXT NOT NULL DEFAULT 'open',
                            submitted_at TEXT NULL,
                            settled_at TEXT NULL,
                            settled_amount_piasters INTEGER NOT NULL DEFAULT 0,
                            rejected_amount_piasters INTEGER NOT NULL DEFAULT 0,
                            rejection_reason TEXT NULL,
                            settlement_notes TEXT NULL,
                            settlement_deduction_target TEXT NULL,
                            notes TEXT NULL,
                            created_by TEXT NOT NULL,
                            created_at TEXT NOT NULL,
                            updated_at TEXT NULL
                        );

                        CREATE INDEX IF NOT EXISTS idx_insurance_batch_comp ON insurance_claim_batches(company_id);
                        CREATE INDEX IF NOT EXISTS idx_insurance_batch_period ON insurance_claim_batches(period);
                        CREATE INDEX IF NOT EXISTS idx_insurance_batch_status ON insurance_claim_batches(status);

                        -- 6. Insurance Claim Lines Table
                        CREATE TABLE IF NOT EXISTS insurance_claim_lines (
                            id TEXT PRIMARY KEY,
                            sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
                            contract_id TEXT NOT NULL REFERENCES insurance_contracts(id) ON DELETE RESTRICT,
                            company_id TEXT NOT NULL REFERENCES insurance_companies(id) ON DELETE RESTRICT,
                            member_id TEXT NULL REFERENCES insurance_members(id) ON DELETE SET NULL,
                            member_no TEXT NOT NULL,
                            patient_name TEXT NOT NULL,
                            approval_no TEXT NULL,
                            total_invoice_piasters INTEGER NOT NULL,
                            covered_piasters INTEGER NOT NULL,
                            patient_piasters INTEGER NOT NULL,
                            company_piasters INTEGER NOT NULL,
                            status TEXT NOT NULL DEFAULT 'pending',
                            claim_batch_id TEXT NULL REFERENCES insurance_claim_batches(id) ON DELETE SET NULL,
                            settled_at TEXT NULL,
                            rejection_reason TEXT NULL,
                            created_at TEXT NOT NULL,
                            updated_at TEXT NULL
                        );

                        CREATE INDEX IF NOT EXISTS idx_insurance_claim_sale ON insurance_claim_lines(sale_id);
                        CREATE INDEX IF NOT EXISTS idx_insurance_claim_comp ON insurance_claim_lines(company_id);
                        CREATE INDEX IF NOT EXISTS idx_insurance_claim_contract ON insurance_claim_lines(contract_id);
                        CREATE INDEX IF NOT EXISTS idx_insurance_claim_batch ON insurance_claim_lines(claim_batch_id);
                        CREATE INDEX IF NOT EXISTS idx_insurance_claim_status ON insurance_claim_lines(status);

                        INSERT OR REPLACE INTO schema_migrations (version, name, applied_at)
                        VALUES (48, 'Health Insurance, Co-Payment Claims & Corporate Billing (Story 132 / Feature #189)', datetime('now'));
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

        // -------------------------------------------------------------
        // Migration 49: Supplier Expiry Returns & External Drug Reference (Story 134 / Feature #191)
        // -------------------------------------------------------------
        private static void ApplyMigration49(SQLiteConnection conn)
        {
            using (var trans = conn.BeginTransaction())
            {
                try
                {
                    // 1. Add expiry return window and credit bps to suppliers table if missing
                    var supplierCols = new System.Collections.Generic.HashSet<string>(StringComparer.OrdinalIgnoreCase);
                    using (var infoCmd = new SQLiteCommand("PRAGMA table_info(suppliers);", conn, trans))
                    using (var reader = infoCmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            supplierCols.Add(reader["name"].ToString());
                        }
                    }

                    if (!supplierCols.Contains("expiry_return_window_days"))
                    {
                        using (var alter = new SQLiteCommand("ALTER TABLE suppliers ADD COLUMN expiry_return_window_days INTEGER NULL;", conn, trans))
                        {
                            alter.ExecuteNonQuery();
                        }
                    }

                    if (!supplierCols.Contains("expiry_return_credit_bps"))
                    {
                        using (var alter = new SQLiteCommand("ALTER TABLE suppliers ADD COLUMN expiry_return_credit_bps INTEGER NULL;", conn, trans))
                        {
                            alter.ExecuteNonQuery();
                        }
                    }

                    // 2. Create external drug_reference table
                    using (var cmd = new SQLiteCommand(@"
                        CREATE TABLE IF NOT EXISTS drug_reference (
                            id TEXT PRIMARY KEY,
                            barcode TEXT NOT NULL UNIQUE,
                            trade_name TEXT NOT NULL,
                            scientific_name TEXT NULL,
                            form TEXT NULL,
                            strength TEXT NULL,
                            manufacturer TEXT NULL,
                            pack_desc TEXT NULL,
                            public_price_piasters INTEGER NULL,
                            source TEXT NULL,
                            imported_at TEXT NOT NULL,
                            created_at TEXT NOT NULL,
                            updated_at TEXT NULL
                        );

                        CREATE UNIQUE INDEX IF NOT EXISTS idx_drug_ref_barcode ON drug_reference(barcode);
                        CREATE INDEX IF NOT EXISTS idx_drug_ref_trade ON drug_reference(trade_name);
                        CREATE INDEX IF NOT EXISTS idx_drug_ref_scientific ON drug_reference(scientific_name);

                        -- 3. Create expired_write_offs table (Task 191-3)
                        CREATE TABLE IF NOT EXISTS expired_write_offs (
                            id TEXT PRIMARY KEY,
                            write_off_number TEXT NOT NULL UNIQUE,
                            batch_id TEXT NULL,
                            product_id TEXT NOT NULL,
                            batch_number TEXT NULL,
                            quantity_milli INTEGER NOT NULL,
                            unit_cost_piasters INTEGER NOT NULL,
                            total_cost_piasters INTEGER NOT NULL,
                            reason TEXT NOT NULL,
                            committee_members TEXT NULL,
                            notes TEXT NULL,
                            created_by TEXT NOT NULL,
                            created_at TEXT NOT NULL
                        );

                        CREATE INDEX IF NOT EXISTS idx_expired_write_offs_prod ON expired_write_offs(product_id);
                        CREATE INDEX IF NOT EXISTS idx_expired_write_offs_batch ON expired_write_offs(batch_id);
                        CREATE INDEX IF NOT EXISTS idx_expired_write_offs_created ON expired_write_offs(created_at);

                        INSERT OR REPLACE INTO schema_migrations (version, name, applied_at)
                        VALUES (49, 'Supplier Expiry Returns & External Drug Reference (Story 134 / Feature #191)', datetime('now'));
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

        private static void ApplyMigration50(SQLiteConnection conn)
        {
            using (var trans = conn.BeginTransaction())
            {
                try
                {
                    var piCols = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                    using (var pragmaCmd = new SQLiteCommand("PRAGMA table_info(purchase_items);", conn, trans))
                    using (var reader = pragmaCmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            piCols.Add(reader["name"].ToString());
                        }
                    }

                    if (!piCols.Contains("public_price_piasters"))
                    {
                        using (var alter = new SQLiteCommand("ALTER TABLE purchase_items ADD COLUMN public_price_piasters INTEGER NULL;", conn, trans))
                        {
                            alter.ExecuteNonQuery();
                        }
                    }

                    if (!piCols.Contains("distributor_discount_bps"))
                    {
                        using (var alter = new SQLiteCommand("ALTER TABLE purchase_items ADD COLUMN distributor_discount_bps INTEGER NULL;", conn, trans))
                        {
                            alter.ExecuteNonQuery();
                        }
                    }

                    using (var cmd = new SQLiteCommand(@"
                        CREATE INDEX IF NOT EXISTS idx_purchase_items_prod ON purchase_items(product_id);
                        CREATE INDEX IF NOT EXISTS idx_purchase_items_pur ON purchase_items(purchase_id);

                        INSERT OR REPLACE INTO schema_migrations (version, name, applied_at)
                        VALUES (50, 'Pharmacy Distributor Purchases & Public Pricing (Story 136 / Feature #193)', datetime('now'));
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

        // -------------------------------------------------------------
        // Migration 51: Seed Pharma Manufacturers & Extend Drug Reference Schema (Story 134 Extension)
        // -------------------------------------------------------------
        private static void ApplyMigration51(SQLiteConnection conn)
        {
            using (var trans = conn.BeginTransaction())
            {
                try
                {
                    // 1. Seed 28 Major Pharmaceutical Companies into pharma_manufacturers
                    using (var cmd = new SQLiteCommand(@"
                        INSERT OR IGNORE INTO pharma_manufacturers (id, name_ar, name_en, country, is_active) VALUES
                        ('mfg_amoun', 'آمون للأدوية', 'Amoun Pharmaceutical Co.', 'مصر', 1),
                        ('mfg_eipico', 'إيبيكو للأدوية', 'EIPICO', 'مصر', 1),
                        ('mfg_eva', 'إيفا فارما', 'Eva Pharma', 'مصر', 1),
                        ('mfg_pharco', 'فاركو للأدوية', 'Pharco Pharmaceuticals', 'مصر', 1),
                        ('mfg_gsk', 'جلاكسو سميث كلاين (GSK)', 'GlaxoSmithKline (GSK)', 'بريطانيا / مصر', 1),
                        ('mfg_novartis', 'نوفارتس مصر', 'Novartis Egypt', 'سويسرا / مصر', 1),
                        ('mfg_sanofi', 'سانوفي مصر', 'Sanofi Egypt', 'فرنسا / مصر', 1),
                        ('mfg_cid', 'سيد للأدوية', 'CID', 'مصر', 1),
                        ('mfg_nile', 'النيل للأدوية', 'Nile Pharmaceuticals', 'مصر', 1),
                        ('mfg_cairo', 'القاهرة للأدوية', 'Cairo Pharmaceuticals', 'مصر', 1),
                        ('mfg_alex', 'الإسكندرية للأدوية', 'Alexandria Pharmaceuticals', 'مصر', 1),
                        ('mfg_memphis', 'ممفيس للأدوية', 'Memphis Pharmaceuticals', 'مصر', 1),
                        ('mfg_mup', 'المهن الطبية للأدوية (MUP)', 'Medical Union Pharmaceuticals (MUP)', 'مصر', 1),
                        ('mfg_astrazeneca', 'أسترازينيكا مصر', 'AstraZeneca Egypt', 'بريطانيا / مصر', 1),
                        ('mfg_pfizer', 'فايزر مصر', 'Pfizer Egypt', 'أمريكا / مصر', 1),
                        ('mfg_sigma', 'سيجما للأدوية', 'SIGMA Pharmaceuticals', 'مصر', 1),
                        ('mfg_marcyrl', 'ماركيرل للصناعات الدوائية', 'Marcyrl Pharmaceutical Industries', 'مصر', 1),
                        ('mfg_abbott', 'أبوت للرعاية الصحية', 'Abbott Laboratories', 'أمريكا / مصر', 1),
                        ('mfg_hikma', 'حكمة فارما', 'Hikma Pharmaceuticals', 'الأردن / مصر', 1),
                        ('mfg_bayer', 'باير للرعاية الصحية', 'Bayer Healthcare', 'ألمانيا / مصر', 1),
                        ('mfg_andalous', 'الأندلس للأدوية', 'Andalous Pharma', 'مصر', 1),
                        ('mfg_utopia', 'يوتوبيا للأدوية', 'Utopia Pharmaceuticals', 'مصر', 1),
                        ('mfg_global_napi', 'جلوبال نابي للأدوية', 'Global Napi Pharmaceuticals', 'مصر', 1),
                        ('mfg_tabuk', 'تبوك للصناعات الدوائية', 'Tabuk Pharmaceuticals', 'السعودية / مصر', 1),
                        ('mfg_rameda', 'العاشر من رمضان (راميدا)', 'Rameda', 'مصر', 1),
                        ('mfg_sedico', 'سيديكو للأدوية', 'SEDICO Pharmaceuticals', 'مصر', 1),
                        ('mfg_nerhadou', 'نرهادو إنترناشيونال', 'Nerhadou International', 'مصر', 1),
                        ('mfg_roche', 'روش للأدوية', 'Roche Egypt', 'سويسرا / مصر', 1);
                    ", conn, trans))
                    {
                        cmd.ExecuteNonQuery();
                    }

                    // 2. Extend drug_reference columns if not present
                    var drCols = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                    using (var cmd = new SQLiteCommand("PRAGMA table_info(drug_reference);", conn, trans))
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            drCols.Add(reader["name"].ToString());
                        }
                    }

                    if (!drCols.Contains("therapeutic_class"))
                    {
                        using (var alter = new SQLiteCommand("ALTER TABLE drug_reference ADD COLUMN therapeutic_class TEXT NULL;", conn, trans))
                        {
                            alter.ExecuteNonQuery();
                        }
                    }
                    if (!drCols.Contains("category"))
                    {
                        using (var alter = new SQLiteCommand("ALTER TABLE drug_reference ADD COLUMN category TEXT NULL;", conn, trans))
                        {
                            alter.ExecuteNonQuery();
                        }
                    }
                    if (!drCols.Contains("storage_location"))
                    {
                        using (var alter = new SQLiteCommand("ALTER TABLE drug_reference ADD COLUMN storage_location TEXT NULL;", conn, trans))
                        {
                            alter.ExecuteNonQuery();
                        }
                    }
                    if (!drCols.Contains("is_refrigerated"))
                    {
                        using (var alter = new SQLiteCommand("ALTER TABLE drug_reference ADD COLUMN is_refrigerated INTEGER NULL DEFAULT 0;", conn, trans))
                        {
                            alter.ExecuteNonQuery();
                        }
                    }

                    using (var cmd = new SQLiteCommand(@"
                        INSERT OR REPLACE INTO schema_migrations (version, name, applied_at)
                        VALUES (51, 'Seed Pharma Manufacturers & Extend Drug Reference (Story 134 Extension)', datetime('now'));
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


