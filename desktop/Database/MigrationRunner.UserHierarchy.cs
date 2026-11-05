using System;
using System.Data.SQLite;

namespace RafiqPOS.Database
{
    public static partial class MigrationRunner
    {
        private static void ApplyUserHierarchyMigrations(SQLiteConnection conn, string dbPath, int currentVersion)
        {
            // 66. Apply Migration 63: Soft-deleted employee accounts (users.deleted_at) for the owner / manager / cashier hierarchy
            if (currentVersion < 63)
            {
                BackupDatabaseBeforeMigration(dbPath);
                ApplyMigration63(conn);
            }

            // 67. Apply Migration 64: digital_accounts.holder_name (the account holder name shown to the customer at checkout)
            if (currentVersion < 64)
            {
                BackupDatabaseBeforeMigration(dbPath);
                ApplyMigration64(conn);
            }

            // 68. Apply Migration 65: Clean placeholder dash variants from products (e.g. '—' or '-')
            if (currentVersion < 65)
            {
                BackupDatabaseBeforeMigration(dbPath);
                ApplyMigration65(conn);
            }
        }

        private static void ApplyMigration65(SQLiteConnection conn)
        {
            using (var trans = conn.BeginTransaction())
            {
                try
                {
                    using (var cmd = new SQLiteCommand(@"
                        UPDATE products SET variant_color = NULL WHERE variant_color IN ('—', '–', '-', '_', '/', '.', '\', 'N/A', 'na', 'none', 'null', 'nil', 'لا يوجد', 'لايوجد', 'بدون', 'غير محدد');
                        UPDATE products SET variant_size = NULL WHERE variant_size IN ('—', '–', '-', '_', '/', '.', '\', 'N/A', 'na', 'none', 'null', 'nil', 'لا يوجد', 'لايوجد', 'بدون', 'غير محدد');
                        INSERT OR REPLACE INTO schema_migrations (version, name, applied_at)
                        VALUES (65, 'Clean placeholder dash variants from products', datetime('now'));
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

        private static void ApplyMigration64(SQLiteConnection conn)
        {
            using (var trans = conn.BeginTransaction())
            {
                try
                {
                    EnsureDigitalAccountHolderColumn(conn, trans);

                    using (var migCmd = new SQLiteCommand(@"
                        INSERT OR REPLACE INTO schema_migrations (version, name, applied_at)
                        VALUES (64, 'Digital account holder name (digital_accounts.holder_name)', datetime('now'));
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

        private static void EnsureDigitalAccountHolderColumn(SQLiteConnection conn, SQLiteTransaction trans)
        {
            if (!TableExists(conn, trans, "digital_accounts")) return;

            // Guarded by PRAGMA table_info inside EnsureColumn: ADD COLUMN only, existing rows get the empty default
            EnsureColumn(conn, trans, "digital_accounts", "holder_name", "TEXT NOT NULL DEFAULT ''");
        }

        private static void ApplyMigration63(SQLiteConnection conn)
        {
            using (var trans = conn.BeginTransaction())
            {
                try
                {
                    EnsureUserHierarchyColumns(conn, trans);

                    using (var migCmd = new SQLiteCommand(@"
                        INSERT OR REPLACE INTO schema_migrations (version, name, applied_at)
                        VALUES (63, 'Soft-deleted employee accounts (users.deleted_at)', datetime('now'));
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

        /// <summary>
        /// إصلاح ذاتي عند كل تشغيل لعمود الحذف الناعم في جدول الموظفين (هجرة 63)
        /// </summary>
        private static void EnsureUserHierarchySchemaHealth(SQLiteConnection conn)
        {
            using (var trans = conn.BeginTransaction())
            {
                try
                {
                    EnsureUserHierarchyColumns(conn, trans);
                    EnsureDigitalAccountHolderColumn(conn, trans);

                    using (var cleanCmd = new SQLiteCommand(@"
                        UPDATE products SET variant_color = NULL WHERE variant_color IN ('—', '–', '-', '_', '/', '.', '\', 'N/A', 'na', 'none', 'null', 'nil', 'لا يوجد', 'لايوجد', 'بدون', 'غير محدد');
                        UPDATE products SET variant_size = NULL WHERE variant_size IN ('—', '–', '-', '_', '/', '.', '\', 'N/A', 'na', 'none', 'null', 'nil', 'لا يوجد', 'لايوجد', 'بدون', 'غير محدد');
                    ", conn, trans))
                    {
                        cleanCmd.ExecuteNonQuery();
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

        private static void EnsureUserHierarchyColumns(SQLiteConnection conn, SQLiteTransaction trans)
        {
            if (!TableExists(conn, trans, "users")) return;

            // Guarded by PRAGMA table_info inside EnsureColumn: ADD COLUMN only, never drops or rewrites data
            EnsureColumn(conn, trans, "users", "deleted_at", "TEXT DEFAULT NULL");

            using (var idx = new SQLiteCommand("CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users(deleted_at);", conn, trans))
            {
                idx.ExecuteNonQuery();
            }
        }
    }
}
