using System;
using System.IO;
using NUnit.Framework;
using RafiqPOS.Data;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    /// <summary>
    /// Readable plain SQLite files left in the store folders are swept (re-encrypted or zero-filled) at every encrypted start; the
    /// conversion marker and the "this store was encrypted" evidence are integrity protected; a plain database that shows up in a store
    /// known to be encrypted is never adopted silently.
    /// </summary>
    [TestFixture]
    [NonParallelizable]
    public class S115_PlainSweepAndStateTrustTest
    {
        private string _base;
        private string _data;
        private string _db;

        [SetUp]
        public void SetUp()
        {
            TestMode.RequireEncrypted();
            RafiqPOS.Services.SecurityService.SetCurrentUserForTesting(null);
            _base = EncryptionTestKit.NewFolder("rafiq_nunit_trust_");
            _db = EncryptionTestKit.InstallLegacyStore(_base);
            _data = Path.GetDirectoryName(_db);
            EncryptionTestKit.UseStubBackup();
            DatabaseEncryptionService.RetryBaseDelayMilliseconds = 1;
        }

        [TearDown]
        public void TearDown()
        {
            RafiqPOS.Services.SecurityService.SetCurrentUserForTesting(null);
            DatabaseEncryptionService.ResetTestSeams();
            if (!TestMode.Plain) DatabaseKeyProvider.EnableDefaultEncryption();
            if (DatabaseService.License != null) DatabaseService.License.StopBackgroundPeriodicCheck();
            if (DatabaseService.Backup != null) DatabaseService.Backup.StopBackgroundPeriodicCheck();
            EncryptionTestKit.ResetDatabaseServiceStatics();
            if (_base != null) EncryptionTestKit.DeleteFolder(_base);
        }

        private void ConvertNow()
        {
            EncryptionStartupResult r = DatabaseEncryptionService.EnsureEncryptedAtStartup(_data, _db, null);
            Assert.AreEqual(EncryptionStartupOutcome.Converted, r.Outcome, r.Message + " " + r.LastError);
        }

        private string PlantPlainCopy(string folder, string name)
        {
            Directory.CreateDirectory(folder);
            string path = Path.Combine(folder, name);
            File.Copy(EncryptionTestKit.LegacyTemplate(), path, true);
            Assert.IsTrue(DatabaseKeyProvider.IsPlainSqliteFile(path));
            return path;
        }

        [Test]
        public void EveryEncryptedStart_ReencryptsPlainCopiesOfDataAndWipesStaging()
        {
            ConvertNow();
            string mig = PlantPlainCopy(Path.Combine(_data, "migration_backups"), "before_migration_old.db");
            string pre = PlantPlainCopy(Path.Combine(_data, "pre_restore"), "pre_restore_old.db");
            string quarantine = PlantPlainCopy(Path.Combine(_data, "quarantine"), "corrupt_old.db");
            string raw = PlantPlainCopy(Path.Combine(_base, "backups"), "rafiq_backup_old.raw");

            using (EncryptionTestKit.HermeticTemp temp = new EncryptionTestKit.HermeticTemp())
            {
                string staging = PlantPlainCopy(temp.Path, "rafiq_staging_old.db");
                File.SetLastWriteTimeUtc(staging, DateTime.UtcNow.AddHours(-5));
                string fresh = PlantPlainCopy(temp.Path, "rafiq_staging_inuse.db");

                EncryptionStartupResult r = DatabaseEncryptionService.EnsureEncryptedAtStartup(_data, _db, null);
                Assert.AreEqual(EncryptionStartupOutcome.AlreadyEncrypted, r.Outcome);

                Assert.IsFalse(File.Exists(staging), "stale decrypted staging copy wiped");
                Assert.IsTrue(File.Exists(fresh), "a staging copy that may be in use right now is left alone");
            }

            Assert.IsFalse(File.Exists(raw), "plain .raw snapshot wiped");
            foreach (string kept in new string[] { mig, pre, quarantine })
            {
                Assert.IsTrue(File.Exists(kept), "the copy is kept (it may hold the only good data)");
                Assert.AreEqual(DatabaseFileKind.NotPlain, DatabaseKeyProvider.DetectFileKind(kept), "and it is encrypted now");
                Assert.AreEqual(EncryptionTestKit.Count(EncryptionTestKit.LegacyTemplate(), "sales"), EncryptionTestKit.Count(kept, "sales"), "with the same content");
            }
            Assert.AreEqual(3, DatabaseEncryptionService.LastSweepResult.Reencrypted.Count);
            Assert.AreEqual(0, DatabaseEncryptionService.LastSweepResult.Unprotected.Count);
            Assert.AreEqual(0, EncryptionTestKit.FindFilesContaining(_base, EncryptionTestKit.TemplateProductMarker).Count, "no readable store data anywhere in the data tree");
        }

        [Test]
        public void ARetainedPlainOriginal_IsNeverTouchedByTheSweep()
        {
            ConvertNow();
            string old = _db + DatabaseEncryptionService.OldPlainSuffix;
            File.Copy(EncryptionTestKit.LegacyTemplate(), old, true);
            string hash = EncryptionTestKit.Sha256Hex(old);
            DatabaseEncryptionService.SweepPlainFiles(_base, _data, _db);
            Assert.IsTrue(File.Exists(old));
            Assert.AreEqual(hash, EncryptionTestKit.Sha256Hex(old), ".plain-old may be the only readable copy: only the swap logic removes it");
        }

        [Test]
        public void InTheBackupFolder_OnlyStagingFilesAreHandled_AnyOtherReadableFileIsReportedNotTouched()
        {
            ConvertNow();
            string backups = Path.Combine(_base, "backups");
            string raw = PlantPlainCopy(backups, "rafiq_backup_x.db.raw");
            string tmp = PlantPlainCopy(backups, "rafiq_backup_x.db.tmp");
            string other = PlantPlainCopy(backups, "somebody_elses_copy.db");
            string hash = EncryptionTestKit.Sha256Hex(other);

            PlainSweepResult sweep = DatabaseEncryptionService.SweepPlainFiles(_base, _data, _db);

            Assert.IsFalse(File.Exists(raw));
            Assert.IsFalse(File.Exists(tmp));
            Assert.IsTrue(File.Exists(other));
            Assert.AreEqual(hash, EncryptionTestKit.Sha256Hex(other), "an unexpected file in backups\\ is not rewritten or deleted");
            Assert.AreEqual(1, sweep.Unprotected.Count);
            Assert.AreEqual(0, sweep.Reencrypted.Count);
        }

        [Test]
        public void AFileThatCannotBeProtected_IsKept_ReportedAndRaisesTheHealthStatus()
        {
            ConvertNow();
            string broken = Path.Combine(_data, "quarantine");
            Directory.CreateDirectory(broken);
            broken = Path.Combine(broken, "broken.db");
            byte[] bytes = new byte[8192];
            byte[] magic = System.Text.Encoding.ASCII.GetBytes("SQLite format 3\0");
            Array.Copy(magic, bytes, magic.Length);
            for (int i = magic.Length; i < bytes.Length; i++) bytes[i] = (byte)(i * 31);
            File.WriteAllBytes(broken, bytes);

            PlainSweepResult sweep = DatabaseEncryptionService.SweepPlainFiles(_base, _data, _db);
            Assert.AreEqual(1, sweep.Unprotected.Count);
            Assert.IsTrue(File.Exists(broken), "never deleted: it may be the only copy of something");
            EncryptionStatus status = DatabaseEncryptionService.GetStatus(_db);
            Assert.AreEqual(1, status.UnprotectedLeftovers);
        }

        [Test]
        public void AForgedOrEditedMarker_IsAFreshState_NeverAStop()
        {
            // 1) text with no valid tag and a future back-off
            File.WriteAllText(DatabaseEncryptionService.MarkerPath(_data), "State=Failed\nAttempts=9\nLastError=x\nNextAttemptUtc=" + DateTime.UtcNow.AddDays(30).ToString("o") + "\nMac=00");
            EncryptionStartupResult r = DatabaseEncryptionService.EnsureEncryptedAtStartup(_data, _db, null);
            Assert.AreEqual(EncryptionStartupOutcome.Converted, r.Outcome, "an unverifiable marker must not block the conversion");
            Assert.AreEqual(0, r.Failures);
        }

        [Test]
        public void AValidMarkerEditedAfterwards_LosesItsTag_AndIsTreatedAsFresh()
        {
            DatabaseEncryptionService.FreeSpaceProvider = delegate(string p) { return 1; };
            EncryptionStartupResult failed = DatabaseEncryptionService.EnsureEncryptedAtStartup(_data, _db, null);
            Assert.AreEqual(EncryptionStartupOutcome.RunningPlain, failed.Outcome);
            Assert.AreEqual(1, failed.Failures);
            string marker = DatabaseEncryptionService.MarkerPath(_data);
            string text = File.ReadAllText(marker);
            Assert.IsTrue(text.Contains("Attempts=1"));

            // untouched marker is honoured: the retry is backed off
            EncryptionStartupResult backoff = DatabaseEncryptionService.EnsureEncryptedAtStartup(_data, _db, null);
            Assert.AreEqual(EncryptionStartupOutcome.RunningPlain, backoff.Outcome);
            Assert.AreEqual(1, backoff.Failures);

            // an edited one (attempts raised) no longer verifies
            File.WriteAllText(marker, text.Replace("Attempts=1", "Attempts=9"));
            DatabaseEncryptionService.FreeSpaceProvider = null;
            DatabaseEncryptionService.ResetTestSeams();
            EncryptionTestKit.UseStubBackup();
            EncryptionStartupResult after = DatabaseEncryptionService.EnsureEncryptedAtStartup(_data, _db, null);
            Assert.AreEqual(EncryptionStartupOutcome.Converted, after.Outcome);
            Assert.AreEqual(0, after.Failures);
        }

        [Test]
        public void APlainDatabase_InAStoreKnownToBeEncrypted_IsNotAdopted_NotConverted_AndNotModified()
        {
            ConvertNow();
            Assert.IsTrue(DatabaseEncryptionService.HasValidEvidence(_data));
            // somebody puts a plain database in place of the live file
            SQLiteConnection.ClearAllPools();
            File.Delete(_db);
            File.Copy(EncryptionTestKit.LegacyTemplate(), _db, true);
            string hash = EncryptionTestKit.Sha256Hex(_db);

            EncryptionStartupResult r = DatabaseEncryptionService.EnsureEncryptedAtStartup(_data, _db, null);
            Assert.AreEqual(EncryptionStartupOutcome.UnexpectedPlain, r.Outcome);
            Assert.AreEqual(hash, EncryptionTestKit.Sha256Hex(_db), "no automatic action");
            Assert.IsFalse(File.Exists(_db + DatabaseEncryptionService.WorkSuffix));
            Assert.IsFalse(File.Exists(DatabaseEncryptionService.MarkerPath(_data)));
        }

        [Test]
        public void Initialize_WithAnUnexpectedPlainDatabase_EntersTheRecoveryState_WithoutChangingTheFile()
        {
            ConvertNow();
            SQLiteConnection.ClearAllPools();
            File.Delete(_db);
            File.Copy(EncryptionTestKit.LegacyTemplate(), _db, true);
            string hash = EncryptionTestKit.Sha256Hex(_db);

            DatabaseService.Initialize(_base);

            DatabaseIntegrityStatus status = DatabaseService.IntegrityStatus;
            Assert.IsTrue(status.IsCorrupt, "same recovery flow as corruption");
            Assert.IsTrue(status.IsUnexpectedPlain);
            Assert.AreEqual("UNEXPECTED_PLAIN_DATABASE", status.FailureCode);
            StringAssert.Contains("غير مشفرة", status.Message);
            SQLiteConnection.ClearAllPools();
            Assert.AreEqual(hash, EncryptionTestKit.Sha256Hex(DatabaseService.DbPath), "nothing was quarantined, restored or rewritten");
        }

        [Test]
        public void ForgedEvidence_IsIgnored_AndThePlainStoreIsConverted()
        {
            File.WriteAllText(DatabaseEncryptionService.EvidencePath(_data), "EncryptedSinceUtc=2020-01-01T00:00:00.0000000Z\nMac=deadbeef");
            Assert.IsFalse(DatabaseEncryptionService.HasValidEvidence(_data));
            ConvertNow();
        }

        [Test]
        public void TheRootRetryAction_ForgetsTheEvidence_SoAPlainStoreCanBeConvertedAgain()
        {
            ConvertNow();
            Assert.IsTrue(DatabaseEncryptionService.HasValidEvidence(_data));
            SQLiteConnection.ClearAllPools();
            File.Delete(_db);
            File.Copy(EncryptionTestKit.LegacyTemplate(), _db, true);
            Assert.AreEqual(EncryptionStartupOutcome.UnexpectedPlain, DatabaseEncryptionService.EnsureEncryptedAtStartup(_data, _db, null).Outcome);

            DatabaseEncryptionService.ResetConversionFailures(_data);

            Assert.IsFalse(DatabaseEncryptionService.HasValidEvidence(_data));
            Assert.AreEqual(EncryptionStartupOutcome.Converted, DatabaseEncryptionService.EnsureEncryptedAtStartup(_data, _db, null).Outcome);
        }
    }
}
