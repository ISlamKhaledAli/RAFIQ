using System;
using System.Collections.Generic;
using System.IO;
using NUnit.Framework;
using RafiqPOS.Data;
using RafiqPOS.Repositories;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    /// <summary>
    /// Hard precondition of the conversion: a VERIFIED standard application backup (RFBK container + owner recovery code) is created in
    /// the default local backup folder right before anything else happens. No backup, no conversion. The plaintext staging snapshot of
    /// that backup is wiped. The backup is the rollback path for a downgrade to the previous build.
    /// </summary>
    [TestFixture]
    [NonParallelizable]
    public class S112_PreConversionBackupTest
    {
        private string _base;

        [SetUp]
        public void SetUp()
        {
            TestMode.RequireEncrypted();
            _base = EncryptionTestKit.NewFolder("rafiq_nunit_pcb_");
            RafiqPOS.Services.SecurityService.SetCurrentUserForTesting(null);
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

        [Test]
        public void TheConversion_StartsWithAVerifiedContainerBackup_ThatRestoresTheOldStore_AndLeavesNoPlaintextStaging()
        {
            string template = EncryptionTestKit.LegacyTemplate();
            string dbPath = EncryptionTestKit.InstallLegacyStore(_base);
            IDictionary<string, string> expected = EncryptionTestKit.Fingerprint(template);

            DatabaseService.Initialize(_base);
            Assert.AreEqual(EncryptionStartupOutcome.Converted, DatabaseEncryptionService.LastStartupResult.Outcome);
            string backupFile = DatabaseEncryptionService.LastStartupResult.PreConversionBackupFile;
            string backups = Path.Combine(_base, "backups");

            Assert.AreEqual(Path.GetFullPath(backups), Path.GetDirectoryName(Path.GetFullPath(backupFile)), "the default local backup folder");
            StringAssert.StartsWith("rafiq_backup_", Path.GetFileName(backupFile));
            Assert.IsTrue(File.Exists(Path.Combine(_base, "data", DatabaseEncryptionService.PreConversionListFileName)), "the conversion backup is recorded for pruning");
            Assert.IsTrue(EncryptionService.IsFileEncrypted(backupFile), "a standard RFBK container");
            Assert.AreEqual(0, Directory.GetFiles(backups, "*.raw").Length, "no staged snapshot remains");
            Assert.AreEqual(0, Directory.GetFiles(backups, "*.tmp").Length);
            Assert.AreEqual(0, EncryptionTestKit.FindFilesContaining(backups, EncryptionTestKit.TemplateProductMarker).Count, "no readable store data in the backup folder");

            string code = DatabaseService.Backup.GetOrCreateRecoveryCode();
            long products;
            long sales;
            string message;
            Assert.IsTrue(DatabaseService.Backup.VerifyBackupDetailed(backupFile, false, out products, out sales, out message), message);
            Assert.AreEqual(EncryptionTestKit.Count(template, "sales"), sales, "it holds the pre-conversion store");

            // the container holds the ORIGINAL plain store (what a previous build can open: this is the downgrade rollback)
            using (var hermetic = new EncryptionTestKit.HermeticTemp())
            {
                string inner = Path.Combine(hermetic.Path, "inner.db");
                DatabaseService.Encryption.DecryptFile(backupFile, inner, code);
                Assert.AreEqual(DatabaseFileKind.Plain, DatabaseKeyProvider.DetectFileKind(inner), "legacy format inside: readable by the previous build");
                IDictionary<string, string> innerFingerprint = EncryptionTestKit.Fingerprint(inner);
                expected.Remove("table:app_settings");
                innerFingerprint.Remove("table:app_settings");
                Assert.IsNull(DatabaseFileAccess.CompareFingerprints(expected, innerFingerprint));
                SecureDelete.WipeAndDeleteQuietly(inner);
            }

            // and the new build restores it too (converted on the way in)
            TransactionResult restored = DatabaseService.RestoreFromBackup(backupFile, code);
            Assert.IsTrue(restored.Success, restored.Message);
            SQLiteConnection.ClearAllPools();
            Assert.AreEqual(DatabaseFileKind.NotPlain, DatabaseKeyProvider.DetectFileKind(DatabaseService.DbPath));
            Assert.AreEqual(EncryptionTestKit.Count(template, "sales"), EncryptionTestKit.Count(DatabaseService.DbPath, "sales"));
            Assert.AreEqual(0, EncryptionTestKit.FindPlainSqliteFiles(_base).Count);
        }

        [Test]
        public void WhenTheBackupCannotBeMade_NothingIsConverted_AndTheStoreStaysByteIdentical()
        {
            string dbPath = EncryptionTestKit.InstallLegacyStore(_base);
            string folder = Path.GetDirectoryName(dbPath);
            string hash = EncryptionTestKit.Sha256Hex(dbPath);
            DatabaseEncryptionService.PreConversionBackupProvider = delegate(string db, string backupFolder) { throw new InvalidOperationException("disk full (simulated)"); };

            EncryptionStartupResult result = DatabaseEncryptionService.EnsureEncryptedAtStartup(folder, dbPath, null);
            Assert.AreEqual(EncryptionStartupOutcome.RunningPlain, result.Outcome);
            Assert.AreEqual(1, result.Failures);
            StringAssert.Contains("نسخة احتياطية موثقة", result.LastError);
            Assert.AreEqual(hash, EncryptionTestKit.Sha256Hex(dbPath), "byte-identical");
            Assert.IsFalse(File.Exists(dbPath + DatabaseEncryptionService.WorkSuffix), "no encrypted candidate was even started");
            Assert.IsFalse(File.Exists(DatabaseEncryptionService.PreEncryptionPath(dbPath)));
            Assert.IsTrue(DatabaseKeyProvider.IsPlainSqliteFile(dbPath));
        }

        [Test]
        public void TheBackupOfAPlainStore_LeavesNoReadablePlaintextBehind()
        {
            string dbPath = EncryptionTestKit.InstallLegacyStore(_base);
            string plainConn = "Data Source=" + dbPath + ";Version=3;BusyTimeout=5000;Encryption=None;";
            var backup = new BackupService(plainConn, dbPath, new SettingsRepository(plainConn), null, new EncryptionService());
            string folder = Path.Combine(_base, "backups");
            BackupResult result = backup.CreateBackup(folder);
            Assert.IsTrue(result.Success, result.Message);
            Assert.AreEqual(0, EncryptionTestKit.FindFilesContaining(folder, EncryptionTestKit.TemplateProductMarker).Count, "the staged plain snapshot was zero-filled and deleted");
            Assert.AreEqual(0, EncryptionTestKit.FindPlainSqliteFiles(folder).Count);
        }
    }
}
