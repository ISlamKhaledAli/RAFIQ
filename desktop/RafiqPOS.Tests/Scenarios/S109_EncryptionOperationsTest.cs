using System;
using System.Collections.Generic;
using System.IO;
using System.Threading;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using RafiqPOS.Data;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    /// <summary>
    /// أدوات التشفير التشغيلية: سياسة الاحتفاظ بنسخة ما قبل التشفير (14 يوماً و5 تشغيلات)، التصدير غير المشفر للمستخدم الجذر فقط
    /// ومُدقَّق، حالة التشفير، الكتابة المتزامنة من خيوط متعددة على قاعدة مشفرة، ودورة كاملة لا تترك أي نص مقروء على القرص.
    /// </summary>
    [TestFixture]
    [NonParallelizable]
    public class S109_EncryptionOperationsTest : S30_Step3BFixtureBase
    {
        private string _scratch;

        // Built through the real services before any DatabaseService store is initialised by the fixture set-up
        [OneTimeSetUp]
        public void BuildLegacyTemplateOnce()
        {
            if (!TestMode.Plain) EncryptionTestKit.LegacyTemplate();
        }

        [SetUp]
        public void OperationsSetUp()
        {
            TestMode.RequireEncrypted();
            _scratch = EncryptionTestKit.NewFolder("rafiq_nunit_ops_");
        }

        [TearDown]
        public void OperationsTearDown()
        {
            DatabaseEncryptionService.ResetTestSeams();
            if (!TestMode.Plain) DatabaseKeyProvider.EnableDefaultEncryption();
            if (_scratch != null) EncryptionTestKit.DeleteFolder(_scratch);
        }

        private static string RootId
        {
            get { return "usr_root_developer"; }
        }

        // ---------------------------------------------------------------- retention

        [Test]
        public void PreEncryptionCopy_IsKept_UntilBoth14DaysAnd5LaunchesHavePassed()
        {
            string dbPath = Path.Combine(_scratch, "rafiq_pos.db");
            string sealedPath = DatabaseEncryptionService.PreEncryptionPath(dbPath);
            DateTime now = new DateTime(2031, 3, 1, 9, 0, 0, DateTimeKind.Utc);
            DatabaseEncryptionService.UtcNow = delegate { return now; };
            File.WriteAllBytes(sealedPath, new byte[] { 1, 2, 3 });
            File.SetLastWriteTimeUtc(sealedPath, now.AddDays(-5));

            for (int launch = 1; launch <= 10; launch++)
            {
                Assert.IsFalse(DatabaseEncryptionService.ApplyPreEncryptionRetention(dbPath), "launch " + launch + ": only 5 days old");
            }
            Assert.IsTrue(File.Exists(sealedPath), "many launches alone never delete the copy");

            // old enough but too few launches: a fresh copy, 20 days old, 4 launches
            File.SetLastWriteTimeUtc(sealedPath, now.AddDays(-20));
            DatabaseEncryptionService.DeletePreEncryptionCopy(dbPath);
            File.WriteAllBytes(sealedPath, new byte[] { 1, 2, 3 });
            File.SetLastWriteTimeUtc(sealedPath, now.AddDays(-20));
            for (int launch = 1; launch <= 4; launch++)
            {
                Assert.IsFalse(DatabaseEncryptionService.ApplyPreEncryptionRetention(dbPath), "launch " + launch + ": fewer than 5 launches");
            }
            Assert.IsTrue(File.Exists(sealedPath), "age alone never deletes the copy");
            Assert.IsTrue(DatabaseEncryptionService.ApplyPreEncryptionRetention(dbPath), "the 5th launch on a copy older than 14 days deletes it");
            Assert.IsFalse(File.Exists(sealedPath));
            Assert.IsFalse(DatabaseEncryptionService.ApplyPreEncryptionRetention(dbPath), "nothing left to do");
        }

        [Test]
        public void PreEncryptionStatus_ReportsTheCopyAndCounters()
        {
            string dbPath = Path.Combine(_scratch, "rafiq_pos.db");
            EncryptionStatus none = DatabaseEncryptionService.GetStatus(dbPath);
            Assert.IsFalse(none.PreEncryptionCopyPresent);
            Assert.AreEqual(14, none.RetentionDays);
            Assert.AreEqual(5, none.RetentionLaunches);

            File.WriteAllBytes(DatabaseEncryptionService.PreEncryptionPath(dbPath), new byte[] { 9 });
            DatabaseEncryptionService.ApplyPreEncryptionRetention(dbPath);
            EncryptionStatus present = DatabaseEncryptionService.GetStatus(dbPath);
            Assert.IsTrue(present.PreEncryptionCopyPresent);
            Assert.AreEqual(1, present.PreEncryptionLaunches);
            Assert.IsTrue(present.PreEncryptionCopyCreatedUtc.HasValue);
        }

        // ---------------------------------------------------------------- IPC actions

        [Test]
        public void EncryptionStatusAction_IsReadOnly_AndShowsAnEncryptedStore()
        {
            JObject data = Data(DispatchOk("database:getEncryptionStatus", null));
            Assert.IsTrue((bool)data["DatabaseEncrypted"]);
            Assert.AreEqual("chacha20", (string)data["Cipher"]);
            Assert.IsFalse((bool)data["ConversionStopped"]);

            SystemHealthResult health = DatabaseService.SystemHealth.GetSystemHealth();
            Assert.AreEqual("قاعدة البيانات مشفرة (ChaCha20)", health.Metrics.DatabaseEncryptionStatus);
            Assert.IsNull(health.Alerts.Find(delegate(SystemAlert a) { return a.Id == "database_encryption_pending"; }));
        }

        [Test]
        public void ExportDecrypted_IsRootOnly_Audited_AndProducesAVerifiedPlainCopy()
        {
            string[] rootOnly = new string[] { "database:exportDecrypted", "database:deletePreEncryptionCopy", "database:retryEncryptionConversion", "database:restoreFromPreEncryptionCopy" };
            string target = Path.Combine(_scratch, "support_export.db");

            // the store owner and staff are refused before any handler runs
            string[] notRoot = new string[] { AdminId, CashierId };
            for (int u = 0; u < notRoot.Length; u++)
            {
                LoginAs(notRoot[u]);
                for (int i = 0; i < rootOnly.Length; i++)
                {
                    var denied = Dispatch(rootOnly[i], new JObject { { "path", target } });
                    Assert.IsFalse(denied.Success, rootOnly[i] + " must be refused for " + notRoot[u]);
                    Assert.AreEqual("FORBIDDEN", denied.Error.Code, rootOnly[i]);
                }
            }
            Assert.IsFalse(File.Exists(target), "nothing was exported by the refused calls");

            LoginAs(RootId);
            long auditBefore = Scalar("SELECT COUNT(*) FROM audit_logs WHERE action = 'تصدير_قاعدة_بيانات_غير_مشفرة';");
            JObject ok = Data(DispatchOk("database:exportDecrypted", new JObject { { "path", target } }));
            Assert.IsTrue((bool)ok["success"]);
            Assert.AreEqual(auditBefore + 1, Scalar("SELECT COUNT(*) FROM audit_logs WHERE action = 'تصدير_قاعدة_بيانات_غير_مشفرة';"), "the export is audited");

            Assert.AreEqual(DatabaseFileKind.Plain, DatabaseKeyProvider.DetectFileKind(target), "the export is a plain SQLite file a support tool can open");
            SQLiteConnection.ClearAllPools();
            using (SQLiteConnection live = DatabaseFileAccess.OpenExisting(DatabaseService.DbPath, true))
            using (SQLiteConnection copy = DatabaseFileAccess.OpenExisting(target, true))
            {
                // the audit row of the export itself is written after the copy was taken
                IDictionary<string, string> liveFingerprint = DatabaseFileAccess.ComputeFingerprint(live);
                IDictionary<string, string> copyFingerprint = DatabaseFileAccess.ComputeFingerprint(copy);
                liveFingerprint.Remove("table:audit_logs");
                copyFingerprint.Remove("table:audit_logs");
                Assert.IsNull(DatabaseFileAccess.CompareFingerprints(liveFingerprint, copyFingerprint), "the exported copy equals the live database row for row");
            }

            // refusals that keep the export from clobbering or hiding in the wrong place
            Assert.AreEqual("EXPORT_DECRYPTED_FAILED", Dispatch("database:exportDecrypted", new JObject { { "path", target } }).Error.Code, "never overwrites");
            Assert.AreEqual("EXPORT_DECRYPTED_FAILED", Dispatch("database:exportDecrypted", new JObject { { "path", "relative.db" } }).Error.Code, "absolute paths only");
            Assert.AreEqual("EXPORT_DECRYPTED_FAILED", Dispatch("database:exportDecrypted", new JObject { { "path", Path.Combine(_scratch, "x.txt") } }).Error.Code, ".db only");
            string inside = Path.Combine(Path.GetDirectoryName(DatabaseService.DbPath), "inside.db");
            Assert.AreEqual("EXPORT_DECRYPTED_FAILED", Dispatch("database:exportDecrypted", new JObject { { "path", inside } }).Error.Code, "not into the data folder");
            Assert.IsFalse(File.Exists(inside));

            // retry action and delete action behave
            Assert.IsTrue(Dispatch("database:retryEncryptionConversion", null).Success);
            Assert.AreEqual("DELETE_PRE_ENCRYPTION_FAILED", Dispatch("database:deletePreEncryptionCopy", null).Error.Code, "no copy to delete on a fresh install");
            Assert.AreEqual("RESTORE_PRE_ENCRYPTION_FAILED", Dispatch("database:restoreFromPreEncryptionCopy", null).Error.Code, "nothing to restore while the live database is present");
        }

        // ---------------------------------------------------------------- factory reset

        private const string OldStoreSecret = "OLD-STORE-SECRET-QZXV9";

        private static string[] EncryptionArtifacts(string dbPath)
        {
            string folder = Path.GetDirectoryName(dbPath);
            return new string[]
            {
                DatabaseEncryptionService.PreEncryptionPath(dbPath),
                DatabaseEncryptionService.MarkerPath(folder),
                Path.Combine(folder, DatabaseEncryptionService.LaunchCounterFileName),
                dbPath + DatabaseEncryptionService.WorkSuffix,
                dbPath + DatabaseEncryptionService.OldPlainSuffix
            };
        }

        [Test]
        public void FactoryReset_RemovesTheSealedCopyAndEveryEncryptionStateFile()
        {
            string dbPath = DatabaseService.DbPath;
            string[] artifacts = EncryptionArtifacts(dbPath);
            for (int i = 0; i < artifacts.Length; i++) File.WriteAllText(artifacts[i], OldStoreSecret + " " + i);
            Assert.IsTrue(DatabaseService.GetEncryptionStatus().PreEncryptionCopyPresent, "precondition: the sealed copy is there");

            LoginAs(AdminId);
            var reset = Dispatch("system:factoryReset", new JObject { { "confirmWord", "مسح" } });
            Assert.IsTrue(reset.Success, reset.Error != null ? reset.Error.Message : "");
            Assert.IsTrue(((FactoryResetResult)reset.Data).Success, ((FactoryResetResult)reset.Data).Message);

            for (int i = 0; i < artifacts.Length; i++) Assert.IsFalse(File.Exists(artifacts[i]), "must be gone after a reset: " + Path.GetFileName(artifacts[i]));
            Assert.AreEqual(0, EncryptionTestKit.FindFilesContaining(Path.GetDirectoryName(dbPath), OldStoreSecret).Count, "no old-store bytes remain in the data folder");
            EncryptionStatus status = DatabaseService.GetEncryptionStatus();
            Assert.IsFalse(status.PreEncryptionCopyPresent);
            Assert.IsTrue(status.DatabaseEncrypted, "the store itself stays encrypted");
            Assert.AreEqual(DatabaseFileKind.NotPlain, DatabaseKeyProvider.DetectFileKind(dbPath));
        }

        [Test]
        public void PurgeEncryptionArtifacts_ReportsWhatItCouldNotRemove_AndRemovesTheRest()
        {
            string dbPath = Path.Combine(_scratch, "rafiq_pos.db");
            string[] artifacts = EncryptionArtifacts(dbPath);
            for (int i = 0; i < artifacts.Length; i++) File.WriteAllText(artifacts[i], OldStoreSecret);

            string sealedPath = DatabaseEncryptionService.PreEncryptionPath(dbPath);
            string[] failed;
            using (new FileStream(sealedPath, FileMode.Open, FileAccess.ReadWrite, FileShare.None))
            {
                failed = DatabaseEncryptionService.PurgeEncryptionArtifacts(dbPath);
            }
            Assert.AreEqual(1, failed.Length, "only the locked file is reported");
            Assert.AreEqual(sealedPath, failed[0]);
            Assert.IsTrue(File.Exists(sealedPath), "a locked file is left intact, not half-wiped");
            for (int i = 0; i < artifacts.Length; i++)
            {
                if (artifacts[i] != sealedPath) Assert.IsFalse(File.Exists(artifacts[i]), Path.GetFileName(artifacts[i]));
            }
            Assert.AreEqual(0, DatabaseEncryptionService.PurgeEncryptionArtifacts(dbPath).Length, "a second pass removes it once the lock is gone");
            Assert.IsFalse(File.Exists(sealedPath));
        }

        // ---------------------------------------------------------------- concurrency

        [Test]
        public void TwoWriterThreads_WithKeyedOpens_NeverLoseOrBreakAnything()
        {
            string path = Path.Combine(_scratch, "concurrent.db");
            using (SQLiteConnection conn = DatabaseFileAccess.CreateEncrypted(path))
            {
                DatabaseFileAccess.Execute(conn, "CREATE TABLE t (id INTEGER PRIMARY KEY, writer INTEGER, n INTEGER);");
            }
            SQLiteConnection.ClearAllPools();

            List<Exception> errors = new List<Exception>();
            Thread[] threads = new Thread[4];
            for (int w = 0; w < threads.Length; w++)
            {
                int writer = w;
                threads[w] = new Thread(delegate()
                {
                    try
                    {
                        for (int n = 0; n < 60; n++)
                        {
                            // a brand-new keyed connection per operation: the key is applied on every open
                            using (var conn = new SQLiteConnection("Data Source=" + path + ";Version=3;BusyTimeout=10000;Journal Mode=Wal;Synchronous=Full;"))
                            {
                                conn.Open();
                                if (writer % 2 == 0)
                                {
                                    using (var cmd = new SQLiteCommand("INSERT INTO t (writer, n) VALUES (@w, @n);", conn))
                                    {
                                        cmd.Parameters.AddWithValue("@w", writer);
                                        cmd.Parameters.AddWithValue("@n", n);
                                        cmd.ExecuteNonQuery();
                                    }
                                }
                                else
                                {
                                    DatabaseFileAccess.Scalar(conn, "SELECT COUNT(*) FROM t;");
                                }
                            }
                        }
                    }
                    catch (Exception ex)
                    {
                        lock (errors) { errors.Add(ex); }
                    }
                });
            }
            for (int i = 0; i < threads.Length; i++) threads[i].Start();
            for (int i = 0; i < threads.Length; i++) threads[i].Join();

            Assert.AreEqual(0, errors.Count, errors.Count > 0 ? errors[0].ToString() : "");
            SQLiteConnection.ClearAllPools();
            Assert.AreEqual(120L, EncryptionTestKit.Count(path, "t"), "two writers x 60 inserts, every row present");
            Assert.AreEqual(DatabaseFileKind.NotPlain, DatabaseKeyProvider.DetectFileKind(path));
        }

        // ---------------------------------------------------------------- the whole lifecycle leaves nothing readable behind

        [Test]
        public void FullCycle_LegacyConversion_Backup_Restore_LeavesNoReadableDataOnDisk()
        {
            // a new store folder, separate from the one the fixture initialised
            SecurityService.SetCurrentUserForTesting(null);
            EncryptionTestKit.LegacyTemplate();
            // a private temp folder: the scan below never looks at the shared %TEMP%
            using (EncryptionTestKit.HermeticTemp temp = new EncryptionTestKit.HermeticTemp())
            {
            string store = Path.Combine(_scratch, "store");
            Directory.CreateDirectory(store);
            string dbPath = EncryptionTestKit.InstallLegacyStore(store);
            Assert.Greater(EncryptionTestKit.FindFilesContaining(store, EncryptionTestKit.TemplateProductMarker).Count, 0, "precondition: the legacy store is readable text");

            DatabaseService.Initialize(store);
            Assert.IsFalse(DatabaseService.IsCorrupted);
            string code = DatabaseService.Backup.GetOrCreateRecoveryCode();
            string backups = Path.Combine(store, "backups");
            BackupResult first = DatabaseService.Backup.CreateBackup(backups);
            Assert.IsTrue(first.Success, first.Message);
            DatabaseService.Products.SaveProduct(new Product { Name = "صنف بعد النسخة", Barcode = "AFTERBK1", PricePiasters = 100, CostPiasters = 50, StockQuantityMilli = 1000, Unit = "piece", IsActive = true }, true, true);
            BackupResult second = DatabaseService.Backup.CreateBackup(backups);
            Assert.IsTrue(second.Success, second.Message);

            TransactionResult restored = DatabaseService.RestoreFromBackup(first.BackupFilePath, code);
            Assert.IsTrue(restored.Success, restored.Message);
            DatabaseService.MarkCleanShutdown();
            SQLiteConnection.ClearAllPools();

            Assert.AreEqual(0, EncryptionTestKit.FindPlainSqliteFiles(store).Count, "no plain SQLite header anywhere in the store folder tree");
            List<string> leaks = EncryptionTestKit.FindFilesContaining(store, EncryptionTestKit.TemplateProductMarker);
            Assert.AreEqual(0, leaks.Count, "readable product names found in: " + string.Join(", ", leaks.ToArray()));
            Assert.AreEqual(0, EncryptionTestKit.FindPlainSqliteFiles(temp.Path).Count, "no plain SQLite file left in temp");
            Assert.AreEqual(0, EncryptionTestKit.FindFilesContaining(temp.Path, EncryptionTestKit.TemplateProductMarker).Count, "no readable store text left in temp");
            }
        }
    }
}
