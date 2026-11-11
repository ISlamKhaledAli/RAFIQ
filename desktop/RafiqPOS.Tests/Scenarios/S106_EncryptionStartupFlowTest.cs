using System;
using System.Collections.Generic;
using System.IO;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using RafiqPOS.Bridge;
using RafiqPOS.Data;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    /// <summary>
    /// مسار بدء التشغيل الكامل (DatabaseService.Initialize) مع قاعدة بيانات مشفرة: تثبيت جديد، متجر قديم غير مشفر يُحوَّل
    /// مع التحقق، فشل التحويل يُبقي القاعدة الأصلية ويُنبّه، ومفتاح خاطئ أو ترويسة تالفة يدخل مسار الاسترجاع بلا أي إجراء تلقائي.
    /// </summary>
    [TestFixture]
    [NonParallelizable]
    public class S106_EncryptionStartupFlowTest
    {
        private string _base;
        private string _dbPath;

        [SetUp]
        public void SetUp()
        {
            TestMode.RequireEncrypted();
            _base = EncryptionTestKit.NewFolder("rafiq_nunit_start_");
            _dbPath = Path.Combine(Path.Combine(_base, "data"), "rafiq_pos.db");
            RafiqPOS.Services.SecurityService.SetCurrentUserForTesting(null);
        }

        [TearDown]
        public void TearDown()
        {
            RafiqPOS.Services.SecurityService.SetCurrentUserForTesting(null);
            DatabaseEncryptionService.ResetTestSeams();
            DatabaseKeyProvider.TestKeyOverride = null;
            if (!TestMode.Plain) DatabaseKeyProvider.EnableDefaultEncryption();
            if (DatabaseService.License != null) DatabaseService.License.StopBackgroundPeriodicCheck();
            if (DatabaseService.Backup != null) DatabaseService.Backup.StopBackgroundPeriodicCheck();
            EncryptionTestKit.ResetDatabaseServiceStatics();
            if (_base != null) EncryptionTestKit.DeleteFolder(_base);
        }

        private static long Scalar(string path, string sql)
        {
            using (SQLiteConnection conn = DatabaseFileAccess.OpenExisting(path, true))
            {
                object value = DatabaseFileAccess.Scalar(conn, sql);
                return value == null || value == DBNull.Value ? 0 : Convert.ToInt64(value);
            }
        }

        [Test]
        public void FreshInstall_CreatesAnEncryptedDatabase_AndNothingPlainRemains()
        {
            DatabaseService.Initialize(_base);
            Assert.IsFalse(DatabaseService.IsCorrupted);
            Assert.AreEqual(EncryptionStartupOutcome.NewDatabase, DatabaseEncryptionService.LastStartupResult.Outcome);

            SQLiteConnection.ClearAllPools();
            Assert.AreEqual(DatabaseFileKind.NotPlain, DatabaseKeyProvider.DetectFileKind(_dbPath), "the first database is encrypted from the first byte");
            Assert.IsTrue(DatabaseService.GetEncryptionStatus().DatabaseEncrypted);
            Assert.IsFalse(File.Exists(DatabaseEncryptionService.MarkerPath(Path.GetDirectoryName(_dbPath))), "no conversion marker on a fresh install");
            Assert.AreEqual(0, EncryptionTestKit.FindPlainSqliteFiles(_base).Count, "no plain SQLite file anywhere in the store folder");
        }

        [Test]
        public void LegacyPlainStore_IsConvertedAtStartup_WithEveryRowVerified()
        {
            string dbPath = EncryptionTestKit.InstallLegacyStore(_base);
            string template = EncryptionTestKit.LegacyTemplate();
            Assert.IsTrue(DatabaseKeyProvider.IsPlainSqliteFile(dbPath), "precondition: a legacy plain file");
            IDictionary<string, string> expected = EncryptionTestKit.Fingerprint(template);
            long sales = Scalar(template, "SELECT COUNT(*) FROM sales;");
            long salesTotal = Scalar(template, "SELECT SUM(total_piasters) FROM sales;");
            long customerBalances = Scalar(template, "SELECT SUM(balance_piasters) FROM customers;");
            Assert.GreaterOrEqual(sales, EncryptionTestKit.TemplateSales, "the legacy store holds the generated sales");

            List<string> progress = new List<string>();
            DatabaseService.StartupProgress = delegate(string line) { progress.Add(line); };
            DatabaseService.Initialize(_base);
            SQLiteConnection.ClearAllPools();

            Assert.IsFalse(DatabaseService.IsCorrupted);
            Assert.AreEqual(EncryptionStartupOutcome.Converted, DatabaseEncryptionService.LastStartupResult.Outcome);
            Assert.AreEqual(DatabaseFileKind.NotPlain, DatabaseKeyProvider.DetectFileKind(dbPath), "the live file is encrypted now");
            Assert.AreEqual(sales, Scalar(dbPath, "SELECT COUNT(*) FROM sales;"));
            Assert.AreEqual(salesTotal, Scalar(dbPath, "SELECT SUM(total_piasters) FROM sales;"));
            Assert.AreEqual(customerBalances, Scalar(dbPath, "SELECT SUM(balance_piasters) FROM customers;"));
            Assert.AreEqual(Scalar(template, "SELECT COUNT(*) FROM stock_movements;"), Scalar(dbPath, "SELECT COUNT(*) FROM stock_movements;"));

            // the sealed rollback snapshot is the converted original, itself encrypted
            string sealedPath = DatabaseEncryptionService.PreEncryptionPath(dbPath);
            Assert.IsTrue(File.Exists(sealedPath), "pre-encryption copy retained");
            Assert.AreEqual(DatabaseFileKind.NotPlain, DatabaseKeyProvider.DetectFileKind(sealedPath), "the retained copy is not readable by a plain viewer");
            // the standard pre-conversion backup writes its settings (recovery code, last backup) into the store, so app_settings may differ
            IDictionary<string, string> sealedFingerprint = EncryptionTestKit.Fingerprint(sealedPath);
            expected.Remove("table:app_settings");
            sealedFingerprint.Remove("table:app_settings");
            Assert.IsNull(DatabaseFileAccess.CompareFingerprints(expected, sealedFingerprint), "the retained copy equals the original row for row");
            string backupFile = DatabaseEncryptionService.LastStartupResult.PreConversionBackupFile;
            Assert.IsTrue(!string.IsNullOrEmpty(backupFile) && File.Exists(backupFile), "a standard container backup was taken first");

            string folder = Path.GetDirectoryName(dbPath);
            Assert.IsFalse(File.Exists(dbPath + DatabaseEncryptionService.OldPlainSuffix), "the plain original is gone");
            Assert.IsFalse(File.Exists(dbPath + DatabaseEncryptionService.WorkSuffix), "no working copy left");
            Assert.IsFalse(File.Exists(DatabaseEncryptionService.MarkerPath(folder)), "conversion finished: marker removed");
            Assert.AreEqual(0, EncryptionTestKit.FindPlainSqliteFiles(_base).Count, "no plain SQLite file anywhere in the store folder");

            Assert.Greater(progress.Count, 0, "the owner is told what is happening");
            bool arabic = false;
            for (int i = 0; i < progress.Count; i++)
            {
                for (int c = 0; c < progress[i].Length; c++) if (progress[i][c] >= 0x0600 && progress[i][c] <= 0x06FF) arabic = true;
            }
            Assert.IsTrue(arabic, "progress lines are Arabic");

            EncryptionStatus status = DatabaseService.GetEncryptionStatus();
            Assert.IsTrue(status.DatabaseEncrypted);
            Assert.IsTrue(status.PreEncryptionCopyPresent);
            Assert.AreEqual("Done", status.ConversionState);

            // a second start finds an encrypted file and does nothing more
            DatabaseService.Initialize(_base);
            Assert.AreEqual(EncryptionStartupOutcome.AlreadyEncrypted, DatabaseEncryptionService.LastStartupResult.Outcome);
        }

        [Test]
        public void ConversionFailure_KeepsTheStoreRunningOnThePlainFile_AndAlertsTheOwner()
        {
            string dbPath = EncryptionTestKit.InstallLegacyStore(_base);
            DatabaseEncryptionService.FreeSpaceProvider = delegate(string path) { return 1024; };

            DatabaseService.Initialize(_base);

            Assert.IsFalse(DatabaseService.IsCorrupted, "a failed conversion is not corruption");
            Assert.AreEqual(EncryptionStartupOutcome.RunningPlain, DatabaseEncryptionService.LastStartupResult.Outcome);
            Assert.AreEqual(1, DatabaseEncryptionService.LastStartupResult.Failures);
            Assert.IsTrue(DatabaseKeyProvider.IsPlainFallbackActive, "default connections are unkeyed while the plain file is live");
            Assert.IsNotNull(DatabaseService.Products.GetById(DatabaseService.Products.GetAll()[0].Id), "the store is fully usable on the plain file");

            SystemHealthResult health = DatabaseService.SystemHealth.GetSystemHealth();
            SystemAlert alert = health.Alerts.Find(delegate(SystemAlert a) { return a.Id == "database_encryption_pending"; });
            Assert.IsNotNull(alert, "an owner-visible alert is raised");
            Assert.AreEqual("قاعدة البيانات غير مشفرة: ستتم إعادة المحاولة", health.Metrics.DatabaseEncryptionStatus);

            // the support export also works while the store runs on the plain fallback
            string exportPath = Path.Combine(EncryptionTestKit.NewFolder("rafiq_nunit_exp_"), "fallback_export.db");
            TransactionResult exported = DatabaseService.ExportDecryptedCopy(exportPath);
            Assert.IsTrue(exported.Success, exported.Message);
            Assert.AreEqual(DatabaseFileKind.Plain, DatabaseKeyProvider.DetectFileKind(exportPath));
            Assert.AreEqual(Scalar(dbPath, "SELECT COUNT(*) FROM sales;"), Scalar(exportPath, "SELECT COUNT(*) FROM sales;"));
            EncryptionTestKit.DeleteFolder(Path.GetDirectoryName(exportPath));

            DatabaseService.MarkCleanShutdown();
            SQLiteConnection.ClearAllPools();
            Assert.IsTrue(DatabaseKeyProvider.IsPlainSqliteFile(dbPath), "the original file is still plain and in place");
            Assert.IsFalse(File.Exists(dbPath + DatabaseEncryptionService.WorkSuffix), "no working copy left behind");
            Assert.IsFalse(File.Exists(DatabaseEncryptionService.PreEncryptionPath(dbPath)));
            // the running store may add settings/audit rows, so the business tables are compared, not the bytes
            string template = EncryptionTestKit.LegacyTemplate();
            Assert.AreEqual(Scalar(template, "SELECT COUNT(*) FROM sales;"), Scalar(dbPath, "SELECT COUNT(*) FROM sales;"));
            Assert.AreEqual(Scalar(template, "SELECT SUM(total_piasters) FROM sales;"), Scalar(dbPath, "SELECT SUM(total_piasters) FROM sales;"));

            // free space is back and the back-off has passed: the next start converts
            DatabaseEncryptionService.ResetTestSeams();
            DatabaseEncryptionService.UtcNow = delegate { return DateTime.UtcNow.AddHours(3); };
            EncryptionTestKit.ResetDatabaseServiceStatics();
            DatabaseService.Initialize(_base);
            Assert.AreEqual(EncryptionStartupOutcome.Converted, DatabaseEncryptionService.LastStartupResult.Outcome);
            Assert.IsFalse(DatabaseKeyProvider.IsPlainFallbackActive, "keyed connections again");
            SQLiteConnection.ClearAllPools();
            Assert.AreEqual(DatabaseFileKind.NotPlain, DatabaseKeyProvider.DetectFileKind(dbPath));
        }

        private static BridgeResponse Dispatch(string action, object payload)
        {
            return IpcDispatcher.Dispatch(new BridgeRequest
            {
                Id = Guid.NewGuid().ToString("N"),
                Action = action,
                Payload = payload != null ? JObject.FromObject(payload) : null
            });
        }

        // The shared expectations of every "header page does not decrypt with our key" case
        private void AssertKeyMismatchStateWithNoFileChange(string hashBefore, List<string> filesBefore)
        {
            Assert.IsTrue(DatabaseService.IsCorrupted, "the state drives the same recovery UI as corruption");
            DatabaseIntegrityStatus status = DatabaseService.IntegrityStatus;
            Assert.IsTrue(status.IsKeyMismatch);
            Assert.AreEqual("ENCRYPTION_KEY_MISMATCH", status.FailureCode);
            Assert.AreEqual(DatabaseFailureKind.EncryptionKeyMismatch, status.StorageFailure);
            StringAssert.Contains("تالف", status.Message, "says the file may be damaged");
            StringAssert.Contains("نسخة مختلفة", status.Message, "says it may come from a different build");
            StringAssert.Contains("لم يتم تغيير", status.Message, "says nothing was changed");
            StringAssert.Contains("استرجاع", status.Message, "offers restore");
            StringAssert.Contains("الدعم الفني", status.Message, "offers support");
            Assert.IsNull(status.CorruptBackupSavedPath, "nothing was quarantined");

            SQLiteConnection.ClearAllPools();
            Assert.AreEqual(hashBefore, EncryptionTestKit.Sha256Hex(_dbPath), "the database file is byte-identical");
            // session_open.marker is the pre-existing "this run started" flag (not a database file)
            List<string> filesAfter = ListFiles(_base);
            filesAfter.RemoveAll(delegate(string f) { return f.EndsWith("session_open.marker", StringComparison.Ordinal); });
            CollectionAssert.AreEquivalent(filesBefore, filesAfter, "no quarantine copy, no snapshot, no conversion marker was created");
            Assert.IsFalse(Directory.Exists(Path.Combine(Path.GetDirectoryName(_dbPath), "quarantine")));
        }

        [Test]
        public void WrongKey_EntersTheRecoveryState_AndNeverTouchesAnyFile()
        {
            Directory.CreateDirectory(Path.GetDirectoryName(_dbPath));
            // an encrypted store made with ANOTHER key, as if it had been written by a different build
            using (SQLiteConnection conn = DatabaseFileAccess.OpenWithKey(_dbPath, false, EncryptionTestKit.OtherKey()))
            {
                DatabaseFileAccess.Execute(conn, "CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT); INSERT INTO products (name) VALUES ('x');");
            }
            SQLiteConnection.ClearAllPools();
            string hashBefore = EncryptionTestKit.Sha256Hex(_dbPath);
            List<string> filesBefore = ListFiles(_base);

            DatabaseService.Initialize(_base);
            AssertKeyMismatchStateWithNoFileChange(hashBefore, filesBefore);
            Assert.IsNull(DatabaseService.Products, "services are not started on an unreadable store");
        }

        [Test]
        public void FileWrittenWithAnotherCipher_IsAKeyMismatch_SoTheExplicitCipherPinsTheFormat()
        {
            Directory.CreateDirectory(Path.GetDirectoryName(_dbPath));
            // the PRODUCT key, but aes256cbc instead of chacha20: exactly what a bundle that changed its default cipher would produce
            string hex = DatabaseKeyProvider.ToHex(DatabaseKeyProvider.GetKey());
            using (var raw = new SQLiteConnection("Data Source=" + _dbPath + ";Version=3;Pooling=False;Encryption=None;"))
            {
                raw.Open();
                DatabaseFileAccess.Execute(raw, "PRAGMA cipher = 'aes256cbc';");
                DatabaseFileAccess.Execute(raw, "PRAGMA key = \"x'" + hex + "'\";");
                DatabaseFileAccess.Execute(raw, "CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT); INSERT INTO products (name) VALUES ('x');");
            }
            SQLiteConnection.ClearAllPools();
            Assert.AreEqual(DatabaseFileKind.NotPlain, DatabaseKeyProvider.DetectFileKind(_dbPath));
            string hashBefore = EncryptionTestKit.Sha256Hex(_dbPath);
            List<string> filesBefore = ListFiles(_base);

            DatabaseService.Initialize(_base);
            AssertKeyMismatchStateWithNoFileChange(hashBefore, filesBefore);
        }

        [Test]
        public void DamagedHeaderPage_OfAnEncryptedFile_EntersTheRecoveryState_NotQuarantined()
        {
            DatabaseService.Initialize(_base);
            DatabaseService.MarkCleanShutdown();
            EncryptionTestKit.ResetDatabaseServiceStatics();
            SQLiteConnection.ClearAllPools();
            // a torn write of page 1 at a power cut
            using (var fs = new FileStream(_dbPath, FileMode.Open, FileAccess.Write))
            {
                byte[] junk = new byte[4096];
                for (int i = 0; i < junk.Length; i++) junk[i] = 0x5A;
                fs.Write(junk, 0, junk.Length);
            }
            string hashBefore = EncryptionTestKit.Sha256Hex(_dbPath);
            List<string> filesBefore = ListFiles(_base);

            DatabaseService.Initialize(_base);
            AssertKeyMismatchStateWithNoFileChange(hashBefore, filesBefore);
        }

        [Test]
        public void KeyMismatch_IsRecoverableThroughTheExistingRestoreAction_AndNothingChangesBeforeTheUserActs()
        {
            // 1. a healthy store with a backup
            DatabaseService.Initialize(_base);
            DatabaseService.Products.SaveProduct(new RafiqPOS.Models.Product
            {
                Name = "صنف قبل التلف", Barcode = "KMISM1", PricePiasters = 1500, CostPiasters = 1000, StockQuantityMilli = 100000, Unit = "piece", IsActive = true
            }, true, true);
            string code = DatabaseService.Backup.GetOrCreateRecoveryCode();
            BackupResult backup = DatabaseService.Backup.CreateBackup(Path.Combine(_base, "backups"));
            Assert.IsTrue(backup.Success, backup.Message);
            DatabaseService.MarkCleanShutdown();
            if (DatabaseService.Backup != null) DatabaseService.Backup.StopBackgroundPeriodicCheck();
            EncryptionTestKit.ResetDatabaseServiceStatics();
            SQLiteConnection.ClearAllPools();

            // 2. the live file becomes unreadable by our key (page 1 of a different build's file)
            foreach (string suffix in new string[] { "", "-wal", "-shm" })
            {
                if (File.Exists(_dbPath + suffix)) File.Delete(_dbPath + suffix);
            }
            using (SQLiteConnection conn = DatabaseFileAccess.OpenWithKey(_dbPath, false, EncryptionTestKit.OtherKey()))
            {
                DatabaseFileAccess.Execute(conn, "CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT); INSERT INTO products (name) VALUES ('other build');");
            }
            SQLiteConnection.ClearAllPools();
            string hashBefore = EncryptionTestKit.Sha256Hex(_dbPath);
            List<string> filesBefore = ListFiles(_base);

            // 3. startup: recovery state, backup offered, zero automatic action
            DatabaseService.Initialize(_base);
            AssertKeyMismatchStateWithNoFileChange(hashBefore, filesBefore);
            Assert.AreEqual(backup.BackupFilePath, DatabaseService.IntegrityStatus.LatestValidBackupFile, "the latest valid backup is exposed as for corruption");
            Assert.Greater(DatabaseService.IntegrityStatus.LatestValidBackupSizeBytes, 0);

            // 4. the UI asks for the state without a session and gets the same data; login explains the situation; still nothing changes
            BridgeResponse integrity = Dispatch("database:checkIntegrity", null);
            Assert.IsTrue(integrity.Success);
            DatabaseIntegrityStatus viaIpc = (DatabaseIntegrityStatus)integrity.Data;
            Assert.IsTrue(viaIpc.IsCorrupt && viaIpc.IsKeyMismatch);
            Assert.AreEqual(backup.BackupFilePath, viaIpc.LatestValidBackupFile);
            BridgeResponse login = Dispatch("auth:login", new { username = "admin", pin = "1234" });
            Assert.IsFalse(login.Success);
            Assert.AreEqual("DATABASE_CORRUPT", login.Error.Code);
            StringAssert.Contains("لم يتم تغيير", login.Error.Message);
            BridgeResponse rejected = Dispatch("database:restore", new { backupFilePath = backup.BackupFilePath, recoveryCode = "RFK-0000-0000-0000" });
            Assert.IsFalse(rejected.Success, "a wrong recovery code restores nothing");
            SQLiteConnection.ClearAllPools();
            Assert.AreEqual(hashBefore, EncryptionTestKit.Sha256Hex(_dbPath), "still byte-identical before the user acts");

            // 5. the user restores with the owner recovery code through the existing action
            BridgeResponse restore = Dispatch("database:restore", new { backupFilePath = backup.BackupFilePath, recoveryCode = code });
            Assert.IsTrue(restore.Success, restore.Error != null ? restore.Error.Message : "");
            Assert.IsFalse(DatabaseService.IsCorrupted, "the store is healthy again");
            SQLiteConnection.ClearAllPools();
            Assert.AreEqual(DatabaseFileKind.NotPlain, DatabaseKeyProvider.DetectFileKind(_dbPath));
            Assert.AreEqual(1L, EncryptionTestKit.Count(_dbPath, "products"), "the backed-up product is back");

            // 6. the unreadable file was kept as a safety copy, not destroyed
            bool kept = false;
            string safetyDir = Path.Combine(Path.GetDirectoryName(_dbPath), "pre_restore");
            if (Directory.Exists(safetyDir))
            {
                foreach (string f in Directory.GetFiles(safetyDir))
                {
                    if (EncryptionTestKit.Sha256Hex(f) == hashBefore) kept = true;
                }
            }
            Assert.IsTrue(kept, "a byte-identical copy of the unreadable file is kept in pre_restore");
        }

        [Test]
        public void DamagedDataPage_OfAnEncryptedFile_StillTakesTheGenuineCorruptionFlow_WithAnEncryptedQuarantineCopy()
        {
            DatabaseService.Initialize(_base);
            DatabaseService.MarkCleanShutdown();
            EncryptionTestKit.ResetDatabaseServiceStatics();
            SQLiteConnection.ClearAllPools();
            using (var fs = new FileStream(_dbPath, FileMode.Open, FileAccess.Write))
            {
                fs.Position = (fs.Length / 2 / 4096) * 4096;
                byte[] junk = new byte[4096];
                for (int i = 0; i < junk.Length; i++) junk[i] = 0x5A;
                fs.Write(junk, 0, junk.Length);
            }

            DatabaseService.Initialize(_base);
            Assert.IsTrue(DatabaseService.IsCorrupted, "damage after a successful keyed open is genuine corruption");
            string quarantined = DatabaseService.IntegrityStatus.CorruptBackupSavedPath;
            Assert.IsTrue(File.Exists(quarantined), "the damaged file is isolated, not deleted");
            Assert.AreEqual(DatabaseFileKind.NotPlain, DatabaseKeyProvider.DetectFileKind(quarantined), "the quarantine copy of an encrypted file stays encrypted");
        }

        private static List<string> ListFiles(string root)
        {
            List<string> files = new List<string>();
            foreach (string f in Directory.GetFileSystemEntries(root, "*", SearchOption.AllDirectories)) files.Add(f);
            return files;
        }
    }
}
