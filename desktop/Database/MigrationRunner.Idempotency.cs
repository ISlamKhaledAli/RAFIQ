using System;
using System.Collections.Generic;
using System.Data.SQLite;

namespace RafiqPOS.Database
{
    public static partial class MigrationRunner
    {
        // Tables whose create action the UI may retry after a timeout; a repeated client key returns the first result
        private static readonly string[] IDEMPOTENT_TABLES = new string[] { "returns", "customer_ledger", "expenses" };

        private static void ApplyIdempotencyMigrations(SQLiteConnection conn, string dbPath, int currentVersion)
        {
            // 63. Apply Migration 60: Client idempotency keys for returns, customer payments and expenses (go-live 3B / L8)
            if (currentVersion < 60)
            {
                BackupDatabaseBeforeMigration(dbPath);
                ApplyMigration60(conn);
            }

            // 64. Apply Migration 61: Request fingerprints, idempotency for drawer/e-pay, sale-line stock flag, register units (go-live 3B round 2)
            if (currentVersion < 61)
            {
                BackupDatabaseBeforeMigration(dbPath);
                ApplyMigration61(conn);
            }

            if (currentVersion < 62)
            {
                BackupDatabaseBeforeMigration(dbPath);
                ApplyMigration62(conn);
            }
        }

        private static readonly string[] FINANCIAL_RETRY_TABLES = new string[]
        {
            "digital_transactions", "digital_account_fundings"
        };

        private static void ApplyMigration62(SQLiteConnection conn)
        {
            using (var trans = conn.BeginTransaction())
            {
                try
                {
                    EnsureFinancialRetryColumns(conn, trans);
                    using (var cmd = new SQLiteCommand(@"
                        INSERT INTO schema_migrations (version, name, applied_at)
                        VALUES (62, 'Financial retry barriers and delivery cash handover tracking', datetime('now'));
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

        private static void EnsureFinancialRetryColumns(SQLiteConnection conn, SQLiteTransaction trans)
        {
            using (var cmd = new SQLiteCommand(@"
                CREATE TABLE IF NOT EXISTS sale_checkout_cancellations (
                    id TEXT PRIMARY KEY NOT NULL,
                    idempotency_key TEXT NOT NULL UNIQUE,
                    request_fingerprint TEXT NOT NULL,
                    actor_id TEXT NOT NULL,
                    cancelled_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS financial_attempt_cancellations (
                    id TEXT PRIMARY KEY NOT NULL,
                    operation TEXT NOT NULL,
                    idempotency_key TEXT NOT NULL,
                    request_fingerprint TEXT NOT NULL,
                    actor_id TEXT NOT NULL,
                    cancelled_at TEXT NOT NULL,
                    UNIQUE(operation, idempotency_key)
                );
            ", conn, trans))
            {
                cmd.ExecuteNonQuery();
            }
            for (int i = 0; i < FINANCIAL_RETRY_TABLES.Length; i++)
            {
                string table = FINANCIAL_RETRY_TABLES[i];
                if (!TableExists(conn, trans, table)) continue;
                EnsureColumn(conn, trans, table, "idempotency_key", "TEXT DEFAULT NULL");
                EnsureColumn(conn, trans, table, "idempotency_fingerprint", "TEXT DEFAULT NULL");
                using (var cmd = new SQLiteCommand(string.Format(
                    "CREATE UNIQUE INDEX IF NOT EXISTS idx_{0}_idempotency ON {0}(idempotency_key) WHERE idempotency_key IS NOT NULL AND idempotency_key != '';",
                    table), conn, trans))
                {
                    cmd.ExecuteNonQuery();
                }
            }
            if (TableExists(conn, trans, "sales"))
            {
                EnsureColumn(conn, trans, "sales", "idempotency_fingerprint", "TEXT DEFAULT NULL");
            }
            if (TableExists(conn, trans, "delivery_orders"))
            {
                EnsureColumn(conn, trans, "delivery_orders", "cash_handover_tracked", "INTEGER DEFAULT NULL");
            }
        }

        // Tables that the UI may retry, with the client key and the request fingerprint stored per row
        private static readonly string[] FINGERPRINTED_TABLES = new string[]
        {
            "returns", "customer_ledger", "expenses", "cash_drawer_transactions", "epay_transactions", "epay_terminal_fundings"
        };

        private static void ApplyMigration61(SQLiteConnection conn)
        {
            using (var trans = conn.BeginTransaction())
            {
                try
                {
                    EnsureStep3BColumns(conn, trans);

                    // Controlled register: rows written before this release by the sale path stored the sale unit
                    // (e.g. boxes). They are converted to base units when the invoice line factor is unambiguous.
                    string registerSql = @"
                        UPDATE controlled_dispenses SET quantity_unit = 'base'
                        WHERE quantity_unit IS NULL
                          AND (entry_type != 'dispense' OR sale_id IS NULL OR sale_item_id IS NOT NULL);

                        UPDATE controlled_dispenses
                        SET quantity_milli = quantity_milli * (
                                SELECT MAX(COALESCE(si.conversion_factor, 1)) FROM sale_items si
                                WHERE si.sale_id = controlled_dispenses.sale_id AND si.product_id = controlled_dispenses.product_id),
                            quantity_unit = 'base'
                        WHERE quantity_unit IS NULL
                          AND (SELECT COUNT(DISTINCT COALESCE(si.conversion_factor, 1)) FROM sale_items si
                               WHERE si.sale_id = controlled_dispenses.sale_id AND si.product_id = controlled_dispenses.product_id) = 1;

                        UPDATE controlled_dispenses SET quantity_unit = 'legacy_sale_unit' WHERE quantity_unit IS NULL;
                    ";
                    using (var cmd = new SQLiteCommand(registerSql, conn, trans))
                    {
                        cmd.ExecuteNonQuery();
                    }

                    using (var migCmd = new SQLiteCommand(@"
                        INSERT OR REPLACE INTO schema_migrations (version, name, applied_at)
                        VALUES (61, 'Idempotency fingerprints, drawer/e-pay keys, sale-line stock flag, controlled register base units', datetime('now'));
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
        /// إصلاح ذاتي عند كل تشغيل لأعمدة وفهارس هجرات 60/61 (مثل فحص صحة جدول المبيعات)
        /// </summary>
        private static void EnsureIdempotencySchemaHealth(SQLiteConnection conn)
        {
            using (var trans = conn.BeginTransaction())
            {
                try
                {
                    EnsureStep3BColumns(conn, trans);
                    EnsureFinancialRetryColumns(conn, trans);
                    trans.Commit();
                }
                catch
                {
                    trans.Rollback();
                    throw;
                }
            }
        }

        private static void EnsureStep3BColumns(SQLiteConnection conn, SQLiteTransaction trans)
        {
            for (int i = 0; i < FINGERPRINTED_TABLES.Length; i++)
            {
                string table = FINGERPRINTED_TABLES[i];
                if (!TableExists(conn, trans, table)) continue;
                EnsureColumn(conn, trans, table, "idempotency_key", "TEXT DEFAULT NULL");
                EnsureColumn(conn, trans, table, "idempotency_fingerprint", "TEXT DEFAULT NULL");
                string indexSql = string.Format(
                    "CREATE UNIQUE INDEX IF NOT EXISTS idx_{0}_idempotency ON {0}(idempotency_key) WHERE idempotency_key IS NOT NULL AND idempotency_key != '';",
                    table);
                using (var idx = new SQLiteCommand(indexSql, conn, trans))
                {
                    idx.ExecuteNonQuery();
                }
            }
            if (TableExists(conn, trans, "sale_items"))
            {
                // NULL = legacy line (decided from stock movements); 1/0 = recorded at sale time
                EnsureColumn(conn, trans, "sale_items", "stock_deducted", "INTEGER DEFAULT NULL");
            }
            if (TableExists(conn, trans, "controlled_dispenses"))
            {
                EnsureColumn(conn, trans, "controlled_dispenses", "quantity_unit", "TEXT DEFAULT NULL");
            }
        }

        private static bool TableExists(SQLiteConnection conn, SQLiteTransaction trans, string table)
        {
            using (var cmd = new SQLiteCommand("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = @t LIMIT 1;", conn, trans))
            {
                cmd.Parameters.AddWithValue("@t", table);
                object res = cmd.ExecuteScalar();
                return res != null && res != DBNull.Value;
            }
        }

        private static void EnsureColumn(SQLiteConnection conn, SQLiteTransaction trans, string table, string column, string ddlType)
        {
            using (var infoCmd = new SQLiteCommand("PRAGMA table_info(" + table + ");", conn, trans))
            using (var reader = infoCmd.ExecuteReader())
            {
                while (reader.Read())
                {
                    if (string.Equals(reader["name"].ToString(), column, StringComparison.OrdinalIgnoreCase)) return;
                }
            }
            using (var alter = new SQLiteCommand("ALTER TABLE " + table + " ADD COLUMN " + column + " " + ddlType + ";", conn, trans))
            {
                alter.ExecuteNonQuery();
            }
        }

        private static void ApplyMigration60(SQLiteConnection conn)
        {
            using (var trans = conn.BeginTransaction())
            {
                try
                {
                    for (int i = 0; i < IDEMPOTENT_TABLES.Length; i++)
                    {
                        string table = IDEMPOTENT_TABLES[i];
                        var existingCols = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                        using (var infoCmd = new SQLiteCommand("PRAGMA table_info(" + table + ");", conn, trans))
                        using (var reader = infoCmd.ExecuteReader())
                        {
                            while (reader.Read())
                            {
                                existingCols.Add(reader["name"].ToString());
                            }
                        }

                        if (!existingCols.Contains("idempotency_key"))
                        {
                            using (var alter = new SQLiteCommand("ALTER TABLE " + table + " ADD COLUMN idempotency_key TEXT DEFAULT NULL;", conn, trans))
                            {
                                alter.ExecuteNonQuery();
                            }
                        }

                        string indexSql = string.Format(
                            "CREATE UNIQUE INDEX IF NOT EXISTS idx_{0}_idempotency ON {0}(idempotency_key) WHERE idempotency_key IS NOT NULL AND idempotency_key != '';",
                            table);
                        using (var idx = new SQLiteCommand(indexSql, conn, trans))
                        {
                            idx.ExecuteNonQuery();
                        }
                    }

                    using (var migCmd = new SQLiteCommand(@"
                        INSERT OR REPLACE INTO schema_migrations (version, name, applied_at)
                        VALUES (60, 'Client idempotency keys for returns, customer payments and expenses', datetime('now'));
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
