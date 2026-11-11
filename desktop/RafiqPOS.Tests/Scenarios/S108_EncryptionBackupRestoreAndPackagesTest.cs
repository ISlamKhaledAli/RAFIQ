using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using NUnit.Framework;
using RafiqPOS.Data;
using RafiqPOS.Database;
using RafiqPOS.Models;
using RafiqPOS.Repositories;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    /// <summary>
    /// كل مسار ينسخ أو يقرأ ملف قاعدة بيانات يفهم الصيغتين: نسخ احتياطية جديدة (مشفرة) وقديمة (غير مشفرة) تُسترجع وتتحول،
    /// وحزم نقل المحل بالصيغتين، ونسخة ما قبل الترحيل بنفس صيغة الأصل. لا يبقى ملف SQLite عادي في أي مجلد أو في temp.
    /// </summary>
    [TestFixture]
    [NonParallelizable]
    public class S108_EncryptionBackupRestoreAndPackagesTest
    {
        private string _base;
        // The code under test gets a private temp folder (TMPDIR/TMP/TEMP), so the plaintext scans never look at the shared %TEMP%
        private EncryptionTestKit.HermeticTemp _temp;

        [SetUp]
        public void SetUp()
        {
            TestMode.RequireEncrypted();
            _base = EncryptionTestKit.NewFolder("rafiq_nunit_bk_");
            RafiqPOS.Services.SecurityService.SetCurrentUserForTesting(null);
        }

        [TearDown]
        public void TearDown()
        {
            if (_temp != null) { _temp.Dispose(); _temp = null; }
            RafiqPOS.Services.SecurityService.SetCurrentUserForTesting(null);
            DatabaseEncryptionService.ResetTestSeams();
            if (!TestMode.Plain) DatabaseKeyProvider.EnableDefaultEncryption();
            if (DatabaseService.License != null) DatabaseService.License.StopBackgroundPeriodicCheck();
            if (DatabaseService.Backup != null) DatabaseService.Backup.StopBackgroundPeriodicCheck();
            EncryptionTestKit.ResetDatabaseServiceStatics();
            if (_base != null) EncryptionTestKit.DeleteFolder(_base);
        }

        private static Product NewProduct(string name, string barcode)
        {
            return DatabaseService.Products.SaveProduct(new Product
            {
                Name = name,
                Barcode = barcode,
                PricePiasters = 1500,
                CostPiasters = 1000,
                StockQuantityMilli = 100000,
                Unit = "piece",
                IsActive = true
            }, true, true);
        }

        [Test]
        public void NewBackup_IsEncryptedInsideTheContainer_LeavesNoStagingFile_AndRestores()
        {
            EncryptionTestKit.LegacyTemplate();
            _temp = new EncryptionTestKit.HermeticTemp();
            DatabaseService.Initialize(_base);
            NewProduct("منتج النسخة الاحتياطية المشفرة", "ENCBK1");
            string code = DatabaseService.Backup.GetOrCreateRecoveryCode();
            string backups = Path.Combine(_base, "backups");

            BackupResult backup = DatabaseService.Backup.CreateBackup(backups);
            Assert.IsTrue(backup.Success, backup.Message);
            Assert.IsTrue(backup.IsVerified);

            string[] leftovers = Directory.GetFiles(backups, "*.raw");
            Assert.AreEqual(0, leftovers.Length, "no staged .raw snapshot remains");
            Assert.AreEqual(0, Directory.GetFiles(backups, "*.tmp").Length, "no staged .tmp file remains");
            Assert.AreEqual(0, EncryptionTestKit.FindPlainSqliteFiles(_base).Count, "no plain SQLite file in the store or backup folders");

            // the database INSIDE the container is the encrypted format, not a plain snapshot
            string inner = Path.Combine(_base, "inner_check.tmp");
            DatabaseService.Encryption.DecryptFile(backup.BackupFilePath, inner, code);
            Assert.AreEqual(DatabaseFileKind.NotPlain, DatabaseKeyProvider.DetectFileKind(inner), "the staged snapshot was keyed");
            File.Delete(inner);

            NewProduct("منتج بعد النسخة", "ENCBK2");
            SQLiteConnection.ClearAllPools();
            long productsWithSecond = EncryptionTestKit.Count(DatabaseService.DbPath, "products");

            TransactionResult restored = DatabaseService.RestoreFromBackup(backup.BackupFilePath, code);
            Assert.IsTrue(restored.Success, restored.Message);
            SQLiteConnection.ClearAllPools();
            Assert.AreEqual(productsWithSecond - 1, EncryptionTestKit.Count(DatabaseService.DbPath, "products"), "the restore rolled the store back to the backup");
            Assert.AreEqual(DatabaseFileKind.NotPlain, DatabaseKeyProvider.DetectFileKind(DatabaseService.DbPath));
            Assert.AreEqual(0, EncryptionTestKit.FindPlainSqliteFiles(_base).Count, "still no plain SQLite file after the restore (safety snapshot included)");
            Assert.AreEqual(0, EncryptionTestKit.FindPlainSqliteFiles(_temp.Path).Count, "no plain staging file left in temp");
        }

        [Test]
        public void LegacyPlainBackup_IsAcceptedVerified_AndConvertedOnRestore()
        {
            string template = EncryptionTestKit.LegacyTemplate();
            _temp = new EncryptionTestKit.HermeticTemp();
            DatabaseService.Initialize(_base);
            string code = DatabaseService.Backup.GetOrCreateRecoveryCode();
            string backups = Path.Combine(_base, "backups");
            Directory.CreateDirectory(backups);

            // a backup exactly as the pre-encryption program wrote it: a plain database inside the RFBK container
            string plainCopy = Path.Combine(_base, "legacy_plain.db");
            File.Copy(template, plainCopy);
            string legacyBackup = Path.Combine(backups, "rafiq_backup_20200101_000000_000.db");
            new EncryptionService().EncryptFileDualWrap(plainCopy, legacyBackup, code);
            File.Delete(plainCopy);

            long products;
            long sales;
            string message;
            Assert.IsTrue(DatabaseService.Backup.VerifyBackupDetailed(legacyBackup, false, out products, out sales, out message), message);
            Assert.AreEqual(EncryptionTestKit.Count(template, "sales"), sales, "the legacy backup is read in its plain format");

            TransactionResult restored = DatabaseService.RestoreFromBackup(legacyBackup, code);
            Assert.IsTrue(restored.Success, restored.Message);
            SQLiteConnection.ClearAllPools();

            Assert.AreEqual(DatabaseFileKind.NotPlain, DatabaseKeyProvider.DetectFileKind(DatabaseService.DbPath), "restored data is stored encrypted");
            Assert.AreEqual(EncryptionTestKit.Count(template, "sales"), EncryptionTestKit.Count(DatabaseService.DbPath, "sales"));
            Assert.AreEqual(EncryptionTestKit.Count(template, "customers"), EncryptionTestKit.Count(DatabaseService.DbPath, "customers"));
            Assert.AreEqual(EncryptionTestKit.Count(template, "stock_movements"), EncryptionTestKit.Count(DatabaseService.DbPath, "stock_movements"));
            Assert.AreEqual(0, EncryptionTestKit.FindPlainSqliteFiles(_base).Count, "the plain data was never left in the store folders");
            Assert.AreEqual(0, EncryptionTestKit.FindPlainSqliteFiles(_temp.Path).Count, "the decrypted staging copy is gone");
        }

        [Test]
        public void PreMigrationBackup_HasTheFormatOfTheOriginal_EncryptedStaysEncrypted()
        {
            MethodInfo backupCore = typeof(MigrationRunner).GetMethod("BackupDatabaseCore", BindingFlags.NonPublic | BindingFlags.Static);
            Assert.IsNotNull(backupCore, "BackupDatabaseCore exists");

            string encrypted = Path.Combine(_base, "enc_source.db");
            using (SQLiteConnection conn = DatabaseFileAccess.CreateEncrypted(encrypted))
            {
                DatabaseFileAccess.Execute(conn, "CREATE TABLE t (v TEXT); INSERT INTO t VALUES ('تشفير');");
            }
            SQLiteConnection.ClearAllPools();
            Assert.IsTrue((bool)backupCore.Invoke(null, new object[] { encrypted, "enctest", false, false }));
            SQLiteConnection.ClearAllPools();

            string[] copies = Directory.GetFiles(Path.Combine(_base, "migration_backups"), "pre_enctest_*.db");
            Assert.AreEqual(1, copies.Length);
            Assert.AreEqual(DatabaseFileKind.NotPlain, DatabaseKeyProvider.DetectFileKind(copies[0]), "the pre-migration copy of an encrypted store is encrypted");
            Assert.AreEqual(1L, EncryptionTestKit.Count(copies[0], "t"));
        }

        [Test]
        public void PreMigrationBackup_OfALegacyPlainStore_StaysReadableByTheSameFormatOnly()
        {
            MethodInfo backupCore = typeof(MigrationRunner).GetMethod("BackupDatabaseCore", BindingFlags.NonPublic | BindingFlags.Static);
            string plain = Path.Combine(_base, "plain_source.db");
            using (SQLiteConnection conn = DatabaseFileAccess.CreatePlain(plain))
            {
                DatabaseFileAccess.Execute(conn, "CREATE TABLE t (v TEXT); INSERT INTO t VALUES ('x');");
            }
            SQLiteConnection.ClearAllPools();
            Assert.IsTrue((bool)backupCore.Invoke(null, new object[] { plain, "plaintest", false, false }), "a plain legacy store can still be backed up before a migration");
            SQLiteConnection.ClearAllPools();
            string[] copies = Directory.GetFiles(Path.Combine(_base, "migration_backups"), "pre_plaintest_*.db");
            Assert.AreEqual(1, copies.Length);
            Assert.AreEqual(1L, EncryptionTestKit.Count(copies[0], "t"));
        }

        [TestCase(true)]
        [TestCase(false)]
        public void StorePackage_RoundTrip_WorksForLegacyAndNewPackageFormats(bool legacyPlainSource)
        {
            string template = EncryptionTestKit.LegacyTemplate();
            _temp = new EncryptionTestKit.HermeticTemp();
            string sourceRoot = Path.Combine(_base, "source");
            string targetRoot = Path.Combine(_base, "target");
            string flash = Path.Combine(_base, "flash");
            Directory.CreateDirectory(targetRoot);
            Directory.CreateDirectory(flash);

            string sourceDb = EncryptionTestKit.InstallLegacyStore(sourceRoot);
            string sourceConn;
            if (legacyPlainSource)
            {
                sourceConn = "Data Source=" + sourceDb + ";Version=3;BusyTimeout=5000;Encryption=None;";
            }
            else
            {
                string encrypted = sourceDb + ".enc";
                DatabaseEncryptionService.EncryptPlainCopy(sourceDb, encrypted);
                File.Delete(sourceDb);
                File.Move(encrypted, sourceDb);
                sourceConn = "Data Source=" + sourceDb + ";Version=3;BusyTimeout=5000;";
            }
            Assert.AreEqual(legacyPlainSource, DatabaseKeyProvider.IsPlainSqliteFile(sourceDb));

            string targetDb = Path.Combine(targetRoot, "rafiq_pos.db");
            string targetConn = "Data Source=" + targetDb + ";Version=3;BusyTimeout=5000;";
            MigrationRunner.ApplyMigrations(targetConn, targetDb);
            Assert.AreEqual(DatabaseFileKind.NotPlain, DatabaseKeyProvider.DetectFileKind(targetDb), "the new PC database is encrypted");

            string code = EncryptionService.GenerateRecoveryCode();
            var source = new MigrationService(sourceConn, sourceDb, new SettingsRepository(sourceConn), new AuditLogRepository(sourceConn));
            var target = new MigrationService(targetConn, targetDb, new SettingsRepository(targetConn), new AuditLogRepository(targetConn));

            MigrationPackageExportResult exported = source.CreateMigrationPackage(flash, code);
            Assert.IsTrue(exported.Success, exported.Message);

            // the package really carries the intended format
            string zip = Path.Combine(_base, "package.zip");
            new EncryptionService().DecryptFile(exported.FilePath, zip, code);
            using (ZipArchive archive = ZipFile.OpenRead(zip))
            using (Stream entry = archive.GetEntry("rafiq_pos.db").Open())
            {
                byte[] header = new byte[15];
                int read = entry.Read(header, 0, header.Length);
                Assert.AreEqual(15, read);
                Assert.AreEqual(legacyPlainSource, System.Text.Encoding.ASCII.GetString(header) == EncryptionTestKit.SqliteMagic, "package database format");
            }
            File.Delete(zip);

            MigrationPackageInspectResult inspected = target.InspectPackage(exported.FilePath, code);
            Assert.IsTrue(inspected.Success, inspected.Message);
            MigrationRestoreResult restored = target.RestorePackage(exported.FilePath, code);
            Assert.IsTrue(restored.Success, restored.Message);
            SQLiteConnection.ClearAllPools();

            Assert.AreEqual(DatabaseFileKind.NotPlain, DatabaseKeyProvider.DetectFileKind(targetDb), "the imported store is encrypted either way");
            Assert.AreEqual(EncryptionTestKit.Count(template, "sales"), EncryptionTestKit.Count(targetDb, "sales"));
            Assert.AreEqual(EncryptionTestKit.Count(template, "customers"), EncryptionTestKit.Count(targetDb, "customers"));
            Assert.AreEqual(EncryptionTestKit.Count(template, "products"), EncryptionTestKit.Count(targetDb, "products"));

            Assert.AreEqual(0, EncryptionTestKit.FindPlainSqliteFiles(targetRoot).Count, "no plain SQLite file in the target store folder");
            Assert.AreEqual(0, EncryptionTestKit.FindPlainSqliteFiles(flash).Count, "no plain SQLite file on the flash drive");
            Assert.AreEqual(0, EncryptionTestKit.FindPlainSqliteFiles(_temp.Path).Count, "no plain staging file left in temp");
        }
    }
}
