using System;
using System.Collections.Generic;
using System.Data.SQLite;
using System.IO;
using Newtonsoft.Json;
using NUnit.Framework;
using RafiqPOS.Database;
using RafiqPOS.Models;
using RafiqPOS.Repositories;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    [TestFixture]
    [NonParallelizable]
    public class S43_FinancialMigration62Test : TestBase
    {
        private static readonly string[] WalletTables = { "digital_transactions", "digital_account_fundings" };
        private const string LegacyBusinessDate = "2026-10-25";
        private string _legacyShiftId;
        private string _legacyRiderId;

        private string DbString(string path, bool wal)
        {
            string full = Path.GetFullPath(path);
            Assert.IsTrue(full.StartsWith(Path.GetFullPath(TestDirectory) + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase),
                "Refusing migration fixture access outside its disposable directory.");
            return "Data Source=" + full + ";Version=3;Foreign Keys=True;BusyTimeout=5000;Synchronous=Normal;"
                + (wal ? "Journal Mode=Wal;" : "");
        }

        private SQLiteConnection OpenDb(string path)
        {
            var conn = new SQLiteConnection(DbString(path, true));
            conn.Open();
            return conn;
        }

        private object Value(string path, string sql)
        {
            using (var conn = OpenDb(path))
            using (var cmd = new SQLiteCommand(sql, conn))
                return cmd.ExecuteScalar();
        }

        private void RunSql(string path, string sql)
        {
            using (var conn = OpenDb(path))
            using (var cmd = new SQLiteCommand(sql, conn))
                cmd.ExecuteNonQuery();
        }

        private string HistoricalRows(string path)
        {
            var all = new SortedDictionary<string, List<string>>(StringComparer.Ordinal);
            using (var conn = OpenDb(path))
            {
                foreach (string table in new string[] { "sales", "sale_items", "payments", "products", "stock_movements",
                    "digital_accounts", "digital_transactions", "digital_account_fundings",
                    "delivery_orders", "delivery_riders", "shifts", "daily_closings", "cash_drawer_transactions", "expenses" })
                {
                    var rows = new List<string>();
                    using (var cmd = new SQLiteCommand("SELECT * FROM " + table + ";", conn))
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            var row = new SortedDictionary<string, object>(StringComparer.Ordinal);
                            for (int i = 0; i < reader.FieldCount; i++)
                                if (!reader.GetName(i).StartsWith("idempotency_", StringComparison.Ordinal)
                                    && reader.GetName(i) != "cash_handover_tracked")
                                    row[reader.GetName(i)] = reader.GetValue(i);
                            rows.Add(JsonConvert.SerializeObject(row));
                        }
                    }
                    rows.Sort(StringComparer.Ordinal);
                    all[table] = rows;
                }
            }
            return JsonConvert.SerializeObject(all);
        }

        private void SeedHistoricalMoney()
        {
            var account = DigitalAccountRepo.SaveAccount(new DigitalAccount
            {
                Name = "Legacy wallet", Type = "wallet", Provider = "vodafone_cash",
                AccountNumber = "01012345678", BalancePiasters = 5000000000L, IsActive = true
            });
            DigitalAccountRepo.FundAccount(account.Id, 12001, "external", "Legacy funding 1", "test");
            DigitalAccountRepo.FundAccount(account.Id, 12002, "external", "Legacy funding 2", "test");
            DigitalAccountRepo.ProcessTransaction(new DigitalTransaction
            {
                AccountId = account.Id, TxType = "cash_out", AmountPiasters = 7890,
                ProfitPiasters = 21, PaymentDestination = "external"
            });
            var product = CreateTestProduct("Legacy sale stock", 10000, 3000, 10000);
            SaleService.ProcessSale(new Sale
            {
                CashierId = "usr_cashier_1", PaymentMethod = "cash", PaidPiasters = 10000,
                Items = new List<SaleItem> { new SaleItem
                {
                    ProductId = product.Id, ProductName = product.Name, QuantityMilli = 1000,
                    UnitPricePiasters = 10000, TotalPiasters = 10000
                } }
            }, Guid.NewGuid().ToString("N"));
            SeedLegacyCodHistory();
        }

        private void SeedLegacyCodHistory()
        {
            // Import a genuine pre-rollout shape: two COD invoices were counted as sale cash;
            // one rider order was settled without a handover ledger, one is still unsettled.
            var product = CreateTestProduct("Legacy COD stock", 10000, 3000, 30000);
            var rider = DeliveryService.SaveRider(new DeliveryRider
            {
                Name = "Legacy COD rider", Phone = "01012345678", VehicleType = "motorcycle",
                CommissionPerOrderPiasters = 1000, Status = "available", IsActive = true
            });
            _legacyRiderId = rider.Id;
            _legacyShiftId = Guid.NewGuid().ToString("N");
            var shift = new Shift
            {
                Id = _legacyShiftId, ShiftNumber = 811, CashierId = "usr_cashier_1", CashierName = "Legacy cashier",
                PosRegisterId = "legacy_pos", BusinessDate = LegacyBusinessDate,
                OpenedAt = LegacyBusinessDate + "T08:00:00Z", Status = "open", OpeningFloatPiasters = 50000,
                CreatedAt = LegacyBusinessDate + "T08:00:00Z", UpdatedAt = LegacyBusinessDate + "T08:00:00Z"
            };
            using (var conn = new SQLiteConnection(ConnectionString))
            {
                conn.Open();
                using (var tx = conn.BeginTransaction())
                {
                    ShiftRepo.Insert(shift, conn, tx);
                    tx.Commit();
                }
            }
            for (int i = 0; i < 2; i++)
            {
                var sale = SaleRepo.CreateSaleAtomic(new Sale
                {
                    ShiftId = shift.Id, CashierId = shift.CashierId, CashierName = shift.CashierName,
                    OrderType = "delivery", PaymentMethod = "cash", PaidPiasters = 10000,
                    SubtotalPiasters = 10000, TotalPiasters = 10000, Status = "completed",
                    CreatedAt = LegacyBusinessDate + (i == 0 ? "T10:00:00Z" : "T10:05:00Z"),
                    DeliveryInfo = new DeliveryOrderCreateInfo
                    {
                        CustomerName = "Legacy customer", CustomerPhone = "01012345678",
                        DeliveryAddress = "Legacy test address", RiderId = rider.Id, RiderName = rider.Name
                    },
                    Items = new List<SaleItem> { new SaleItem
                    {
                        ProductId = product.Id, ProductName = product.Name, QuantityMilli = 1000,
                        UnitPricePiasters = 10000, UnitCostPiasters = 3000, TotalPiasters = 10000,
                        ConversionFactor = 1, Unit = product.Unit
                    } }
                });
                using (var conn = new SQLiteConnection(ConnectionString))
                {
                    conn.Open();
                    using (var cmd = new SQLiteCommand(
                        "UPDATE delivery_orders SET cash_handover_tracked=NULL,status='delivered',is_settled=@settled," +
                        "settled_at=@at,settled_by_user_id=@by WHERE sale_id=@sale;", conn))
                    {
                        cmd.Parameters.AddWithValue("@settled", i == 0 ? 1 : 0);
                        cmd.Parameters.AddWithValue("@at", i == 0 ? (object)(LegacyBusinessDate + "T17:00:00Z") : DBNull.Value);
                        cmd.Parameters.AddWithValue("@by", i == 0 ? (object)"usr_cashier_1" : DBNull.Value);
                        cmd.Parameters.AddWithValue("@sale", sale.Id);
                        Assert.AreEqual(1, cmd.ExecuteNonQuery());
                    }
                }
            }
            // Repository import of the old sealed snapshots. Do not recalculate them using new semantics.
            shift.Status = "closed";
            shift.ClosedAt = LegacyBusinessDate + "T18:00:00Z";
            shift.CashSalesPiasters = 20000;
            shift.ExpectedCashPiasters = 70000;
            shift.ActualCashPiasters = 70000;
            shift.InvoicesCount = 2;
            using (var conn = new SQLiteConnection(ConnectionString))
            {
                conn.Open();
                using (var tx = conn.BeginTransaction())
                {
                    ShiftRepo.CloseShift(shift, conn, tx);
                    DailyClosingRepo.Insert(new DailyClosing
                    {
                        Id = Guid.NewGuid().ToString("N"), ClosingNumber = 811, BusinessDate = LegacyBusinessDate,
                        ClosedAt = LegacyBusinessDate + "T18:00:00Z", CashierId = shift.CashierId, CashierName = shift.CashierName,
                        TotalSalesPiasters = 20000, CashSalesPiasters = 20000, ExpectedCashPiasters = 70000,
                        ActualCashPiasters = 70000, GrossProfitPiasters = 14000, InvoicesCount = 2,
                        SummaryJson = "{\"legacyCodCashPiasters\":20000}", IsSealed = true
                    }, conn, tx);
                    tx.Commit();
                }
            }
        }

        private string CreateVersion61Copy(string name)
        {
            string folder = Path.Combine(TestDirectory, name);
            Directory.CreateDirectory(folder);
            string path = Path.Combine(folder, "rafiq_test_61.db");
            using (var original = new SQLiteConnection(ConnectionString))
            using (var copy = OpenDb(path))
            {
                original.Open();
                original.BackupDatabase(copy, "main", "main", -1, null, 0);
            }
            // Same real-provider downgrade technique as S35. SQLite 1.0.118 supports DROP COLUMN.
            foreach (string table in WalletTables)
            {
                RunSql(path, "DROP INDEX IF EXISTS idx_" + table + "_idempotency;");
                RunSql(path, "ALTER TABLE " + table + " DROP COLUMN idempotency_fingerprint;");
                RunSql(path, "ALTER TABLE " + table + " DROP COLUMN idempotency_key;");
            }
            RunSql(path, "ALTER TABLE sales DROP COLUMN idempotency_fingerprint;");
            RunSql(path, "ALTER TABLE delivery_orders DROP COLUMN cash_handover_tracked;");
            RunSql(path, "DROP TABLE sale_checkout_cancellations;");
            RunSql(path, "DELETE FROM schema_migrations WHERE version=62;");
            Assert.AreEqual(61, Convert.ToInt32(Value(path, "SELECT MAX(version) FROM schema_migrations;")));
            SQLiteConnection.ClearAllPools();
            return path;
        }

        private static string[] Backups(string path)
        {
            string folder = Path.Combine(Path.GetDirectoryName(path), "migration_backups");
            return Directory.Exists(folder) ? Directory.GetFiles(folder, "pre_*.db") : new string[0];
        }

        private void AssertBackupPrecedesDdl(string path, string historicalRows)
        {
            string[] backups = Backups(path);
            Assert.AreEqual(1, backups.Length, "Exactly one safety snapshot per database upgrade.");
            Assert.AreEqual(61, Convert.ToInt32(Value(backups[0], "SELECT MAX(version) FROM schema_migrations;")));
            Assert.AreEqual(0, Convert.ToInt32(Value(backups[0],
                "SELECT COUNT(*) FROM pragma_table_info('digital_transactions') WHERE name='idempotency_key';")));
            Assert.AreEqual(0, Convert.ToInt32(Value(backups[0],
                "SELECT COUNT(*) FROM pragma_table_info('delivery_orders') WHERE name='cash_handover_tracked';")));
            Assert.AreEqual(0, Convert.ToInt32(Value(backups[0],
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='sale_checkout_cancellations';")));
            Assert.AreEqual(historicalRows, HistoricalRows(backups[0]), "Readable backup must preserve all pre-upgrade financial rows.");
            Assert.AreEqual("ok", Convert.ToString(Value(backups[0], "PRAGMA quick_check;")));
        }

        [Test]
        public void Migration62_UpgradeFrom61_PreservesFinancialRowsAndEnforcesPersistentKeys()
        {
            SeedHistoricalMoney();
            string path = CreateVersion61Copy("upgrade");
            string before = HistoricalRows(path);
            MigrationRunner.ApplyMigrations(DbString(path, true), path);
            Assert.AreEqual(62, Convert.ToInt32(Value(path, "SELECT MAX(version) FROM schema_migrations;")));
            Assert.AreEqual(before, HistoricalRows(path));
            AssertBackupPrecedesDdl(path, before);
            AssertLegacyCodHistoryUnchanged(path);
            Assert.AreEqual(1, Convert.ToInt32(Value(path,
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='sale_checkout_cancellations';")));
            Assert.AreEqual(0, Convert.ToInt32(Value(path, "SELECT COUNT(*) FROM sale_checkout_cancellations;")),
                "Migration must not infer abandonment of any historical checkout.");
            foreach (string table in WalletTables)
            {
                Assert.AreEqual(2, Convert.ToInt32(Value(path, "SELECT COUNT(*) FROM pragma_table_info('" + table +
                    "') WHERE name IN ('idempotency_key','idempotency_fingerprint');")));
                Assert.AreEqual(0, Convert.ToInt32(Value(path, "SELECT COUNT(*) FROM " + table + " WHERE idempotency_key IS NOT NULL;")));
                RunSql(path, "UPDATE " + table + " SET idempotency_key='same-attempt' WHERE rowid=(SELECT MIN(rowid) FROM " + table + ");");
                var error = Assert.Throws<SQLiteException>(delegate
                {
                    RunSql(path, "UPDATE " + table + " SET idempotency_key='same-attempt' WHERE rowid=(SELECT MAX(rowid) FROM " + table + ");");
                });
                StringAssert.Contains("UNIQUE", error.Message.ToUpperInvariant());
            }
            Assert.AreEqual(1, Convert.ToInt32(Value(path,
                "SELECT COUNT(*) FROM pragma_table_info('sales') WHERE name='idempotency_fingerprint';")));
        }

        [Test]
        public void Migration62_RepeatedRunnerAndTwoDatabases_EachUpgradeHasItsOwnPreDdlBackup()
        {
            SeedHistoricalMoney();
            string first = CreateVersion61Copy("first");
            string second = CreateVersion61Copy("second");
            string originalRows = HistoricalRows(first);
            foreach (string path in new string[] { first, second })
            {
                MigrationRunner.ApplyMigrations(DbString(path, true), path);
                AssertBackupPrecedesDdl(path, originalRows);
                string[] beforeRepeat = Backups(path);
                MigrationRunner.ApplyMigrations(DbString(path, true), path);
                CollectionAssert.AreEquivalent(beforeRepeat, Backups(path), "A no-op rerun needs no additional backup.");
                Assert.AreEqual(originalRows, HistoricalRows(path));
                AssertLegacyCodHistoryUnchanged(path);
            }
            Assert.AreNotEqual(Path.GetFileName(Backups(first)[0]), Path.GetFileName(Backups(second)[0]),
                "Backups in one process must have collision-resistant names, not second-resolution timestamps.");
        }

        private void AssertLegacyCodHistoryUnchanged(string path)
        {
            Assert.AreEqual(1, Convert.ToInt32(Value(path,
                "SELECT COUNT(*) FROM pragma_table_info('delivery_orders') WHERE name='cash_handover_tracked';")));
            Assert.AreEqual(2, Convert.ToInt32(Value(path,
                "SELECT COUNT(*) FROM delivery_orders WHERE cash_handover_tracked IS NULL;")),
                "Existing orders must stay legacy NULL, not be backfilled into new cash accounting.");
            Assert.AreEqual(1, Convert.ToInt32(Value(path, "SELECT COUNT(*) FROM delivery_orders WHERE is_settled=1;")));
            Assert.AreEqual(1, Convert.ToInt32(Value(path, "SELECT COUNT(*) FROM delivery_orders WHERE is_settled=0;")));
            Assert.AreEqual(70000, Convert.ToInt64(Value(path,
                "SELECT expected_cash_piasters FROM daily_closings WHERE business_date='" + LegacyBusinessDate + "';")));
            Assert.AreEqual(70000, Convert.ToInt64(Value(path,
                "SELECT expected_cash_piasters FROM shifts WHERE id='" + _legacyShiftId + "';")));
            DateTime start = new DateTime(2026, 10, 25, 0, 0, 0, DateTimeKind.Utc);
            var cash = DrawerCashCalculator.Calculate(DbString(path, true), start, start.AddDays(1), _legacyShiftId);
            Assert.AreEqual(70000, cash.ExpectedCashPiasters,
                "Recomputed old shift cash must agree with the sealed 50,000 float + 20,000 legacy sale cash.");
            Assert.AreEqual(0, Convert.ToInt32(Value(path,
                "SELECT COUNT(*) FROM cash_drawer_transactions WHERE shift_id='" + _legacyShiftId + "';")),
                "A legacy settled order must not gain an inferred second handover entry.");
        }

        [Test]
        public void Migration62_LegacyUnsettledCod_ExplicitlyRejectsSettlementWithoutHistoricalRewrite()
        {
            SeedHistoricalMoney();
            string path = CreateVersion61Copy("legacy-unsettled");
            string connection = DbString(path, true);
            MigrationRunner.ApplyMigrations(connection, path);
            var audit = new AuditLogRepository(connection);
            var counter = new CounterRepository(connection);
            var closing = new DailyClosingService(connection, new DailyClosingRepository(connection),
                counter, audit, new SettingsRepository(connection));
            var shifts = new ShiftService(connection, new ShiftRepository(connection), counter, audit, closing);
            shifts.OpenShift(new OpenShiftRequest
            {
                CashierId = "usr_cashier_1", CashierName = "New period cashier",
                PosRegisterId = "default_pos", OpeningFloatPiasters = 50000
            });
            string before = HistoricalRows(path);
            var delivery = new DeliveryService(new DeliveryRepository(connection, audit));
            var error = Assert.Throws<InvalidOperationException>(delegate
            {
                delivery.SettleRider(_legacyRiderId, "usr_cashier_1", true);
            });
            StringAssert.IsMatch("قديم|تسوي|مطابق|[Rr]econcil|[Ll]egacy", error.Message,
                "Legacy cash cannot be guessed; explain that reconciliation is required.");
            Assert.AreEqual(before, HistoricalRows(path));
            AssertLegacyCodHistoryUnchanged(path);
        }

        [Test]
        public void Migration62_BackupFailure_StopsBeforeSchemaOrFinancialMutation()
        {
            SeedHistoricalMoney();
            string path = CreateVersion61Copy("blocked-backup");
            string before = HistoricalRows(path);
            // A file in place of the required directory deterministically prevents backup creation.
            File.WriteAllText(Path.Combine(Path.GetDirectoryName(path), "migration_backups"), "test blocker");
            Assert.Throws<InvalidOperationException>(delegate { MigrationRunner.ApplyMigrations(DbString(path, true), path); });
            Assert.AreEqual(61, Convert.ToInt32(Value(path, "SELECT MAX(version) FROM schema_migrations;")));
            Assert.AreEqual(before, HistoricalRows(path));
            Assert.AreEqual(0, Convert.ToInt32(Value(path,
                "SELECT COUNT(*) FROM pragma_table_info('sales') WHERE name='idempotency_fingerprint';")));
        }

        [Test]
        public void Migration62_NewerSchemaRejected_BeforePragmaDdlOrBackupMutation()
        {
            string folder = Path.Combine(TestDirectory, "future");
            Directory.CreateDirectory(folder);
            string path = Path.Combine(folder, "rafiq_test_future.db");
            // Deliberately do not request WAL on Open: the version guard must run before changing journal mode.
            using (var conn = new SQLiteConnection(DbString(path, false)))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand(
                    "PRAGMA journal_mode=DELETE; CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);" +
                    "INSERT INTO schema_migrations VALUES(999,'2026-11-02T00:00:00Z');" +
                    "CREATE TABLE sentinel(id TEXT PRIMARY KEY,amount_piasters INTEGER NOT NULL);" +
                    "INSERT INTO sentinel VALUES('untouched',5000000001);", conn))
                    cmd.ExecuteNonQuery();
            }
            SQLiteConnection.ClearAllPools();
            byte[] before = File.ReadAllBytes(path);
            var error = Assert.Throws<InvalidOperationException>(delegate
            {
                MigrationRunner.ApplyMigrations(DbString(path, false), path);
            });
            StringAssert.Contains("999", error.Message);
            SQLiteConnection.ClearAllPools();
            CollectionAssert.AreEqual(before, File.ReadAllBytes(path), "Even persistent PRAGMA/header mutation is forbidden for future schemas.");
            Assert.AreEqual(0, Backups(path).Length);
            Assert.IsFalse(File.Exists(path + "-wal"));
            Assert.IsFalse(File.Exists(path + "-shm"));
        }
    }
}
