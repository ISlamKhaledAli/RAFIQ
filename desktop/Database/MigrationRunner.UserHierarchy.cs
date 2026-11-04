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
