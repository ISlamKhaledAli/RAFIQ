using System;
using System.Collections.Generic;
using System.Data.SQLite;
using System.IO;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using RafiqPOS.Bridge;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    /// <summary>
    /// سجل النسخ الاحتياطية (backup:getStatus) وفحصها (backup:verify) واسترجاعها (database:restore):
    /// القائمة تعرض ملفات النسخ المكتملة فقط مرتبة من الأحدث بتوقيت اسم الملف مع إجمالي حقيقي وحد قابل للزيادة،
    /// والمسار القادم من الواجهة لا يُثق به أبداً، والاستبدال يتراجع تلقائياً عند الفشل، والاستبقاء لا يحذف الأحدث ولا ملفات غريبة.
    /// </summary>
    [TestFixture]
    [NonParallelizable]
    public class S64_BackupListVerifyRestoreTest : S30_Step3BFixtureBase
    {
        private string _folder;

        [SetUp]
        public void BackupFolderSetUp()
        {
            foreach (string stale in Directory.GetFiles(Path.GetTempPath(), "rafiq_bk_verify_*"))
            {
                try { File.Delete(stale); } catch { }
            }
            _folder = Path.Combine(Path.GetTempPath(), "rafiq_s64_backups_" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(_folder);
        }

        [TearDown]
        public void BackupFolderTearDown()
        {
            SQLiteConnection.ClearAllPools();
            try { Directory.Delete(_folder, true); } catch (IOException) { } catch (UnauthorizedAccessException) { }
        }

        private string FakeBackup(DateTime stamp)
        {
            string path = Path.Combine(_folder, "rafiq_backup_" + stamp.ToString("yyyyMMdd_HHmmss") + ".db");
            File.WriteAllText(path, "x");
            return path;
        }

        private static string ErrorCodeOf(BridgeResponse res)
        {
            return res != null && res.Error != null ? res.Error.Code : "";
        }

        private static long CountSales()
        {
            return Scalar("SELECT COUNT(*) FROM sales;");
        }

        private void SellOnce(Product product)
        {
            JObject line = CartLine(product, 1000, 1000);
            DispatchOk("sales:create", SalePayload(new JArray { line }, 1000, "cash", 1000, null));
        }

        // ---------- (a)(b)(d) list: sorting, real total, cap, which files are listed ----------

        [Test]
        public void List_SortsNewestFirstByFileNameTimestamp_NotByFileCreationTime()
        {
            DatabaseService.SettingsRepo.Set("backup_target_folder", _folder);
            string oldest = FakeBackup(new DateTime(2026, 1, 5, 10, 0, 0));
            string newest = FakeBackup(new DateTime(2026, 3, 5, 10, 0, 0));
            string middle = FakeBackup(new DateTime(2026, 2, 5, 10, 0, 0));
            // A flash-drive copy resets the creation time: the oldest file looks like the newest on disk
            File.SetCreationTime(oldest, DateTime.Now);
            File.SetCreationTime(newest, new DateTime(2020, 1, 1));

            BackupStatusInfo status = DatabaseService.Backup.GetStatus();

            Assert.AreEqual("ok", status.FolderStatus);
            Assert.AreEqual(3, status.TotalBackupCount);
            Assert.AreEqual(Path.GetFileName(newest), status.RecentBackups[0].FileName);
            Assert.AreEqual(Path.GetFileName(middle), status.RecentBackups[1].FileName);
            Assert.AreEqual(Path.GetFileName(oldest), status.RecentBackups[2].FileName);
            Assert.AreEqual("2026-03-05 10:00", status.RecentBackups[0].CreatedAt, "وقت النسخة من اسم الملف بتوقيت الجهاز");
        }

        [Test]
        public void List_TotalCountIsTheRealMatchCount_AndLimitRaisesTheCapUpToTheMaximum()
        {
            DatabaseService.SettingsRepo.Set("backup_target_folder", _folder);
            for (int i = 0; i < 40; i++)
            {
                FakeBackup(new DateTime(2026, 1, 1, 8, 0, 0).AddDays(i));
            }

            BackupStatusInfo defaultPage = DatabaseService.Backup.GetStatus();
            Assert.AreEqual(BackupService.DEFAULT_LISTED_BACKUPS, defaultPage.RecentBackups.Count, "الصفحة الافتراضية");
            Assert.AreEqual(40, defaultPage.TotalBackupCount, "الإجمالي لا يتأثر بحد القائمة");

            BackupStatusInfo more = DatabaseService.Backup.GetStatus(null, null, 30);
            Assert.AreEqual(30, more.RecentBackups.Count);
            Assert.AreEqual(40, more.TotalBackupCount);

            BackupStatusInfo all = DatabaseService.Backup.GetStatus(null, null, 5000);
            Assert.AreEqual(40, all.RecentBackups.Count, "الحد الأقصى يغطي كل النسخ المسموح بها");

            BackupStatusInfo period = DatabaseService.Backup.GetStatus("2026-01-01", "2026-01-10");
            Assert.AreEqual(10, period.TotalBackupCount, "إجمالي الفترة وليس إجمالي المجلد");
        }

        [Test]
        public void List_ShowsOnlyFinishedBackupFilesMadeByTheApp()
        {
            DatabaseService.SettingsRepo.Set("backup_target_folder", _folder);
            string real = FakeBackup(new DateTime(2026, 4, 1, 9, 0, 0));
            string realName = Path.GetFileName(real);
            File.WriteAllText(real + "-wal", "x");
            File.WriteAllText(real + "-shm", "x");
            File.WriteAllText(real + ".raw", "x");
            File.WriteAllText(real + ".tmp", "x");
            File.WriteAllText(Path.Combine(_folder, "rafiq_rx_20260401_090000.db"), "x");
            File.WriteAllText(Path.Combine(_folder, "notes.db"), "x");
            File.WriteAllText(Path.Combine(_folder, "rafiq_backup_20260401_090000.txt"), "x");
            Directory.CreateDirectory(Path.Combine(_folder, "rafiq_backup_20260402_090000.db_dir"));

            BackupStatusInfo status = DatabaseService.Backup.GetStatus();

            Assert.AreEqual(1, status.RecentBackups.Count, "ملف النسخة فقط دون ملفات WAL/SHM/المؤقتة/الروشتات/الغريبة");
            Assert.AreEqual(realName, status.RecentBackups[0].FileName);
        }

        [Test]
        public void List_MissingConfiguredFolder_IsReportedAsUnavailable_AndListsTheLocalFallbackFolder()
        {
            DatabaseService.SettingsRepo.Set("backup_target_folder", Path.Combine(_folder, "removed_flash_drive"));

            BackupStatusInfo status = DatabaseService.Backup.GetStatus();

            Assert.AreEqual("unavailable", status.FolderStatus);
            StringAssert.Contains("تعذر الوصول", status.FolderMessage);
            Assert.AreEqual(DatabaseService.Backup.GetDefaultBackupFolder(), status.ListedFolder, "النسخ التي حُفظت محلياً بسبب غياب الفلاشة تظهر");
        }

        [Test]
        public void List_BlankConfiguredFolder_ListsTheDefaultFolderLikeCreateBackupDoes()
        {
            DatabaseService.SettingsRepo.Set("backup_target_folder", "");

            BackupStatusInfo status = DatabaseService.Backup.GetStatus();

            Assert.AreEqual("ok", status.FolderStatus);
            Assert.AreEqual(DatabaseService.Backup.GetDefaultBackupFolder(), status.ListedFolder);
        }

        // ---------- (c)(g) creation: complete files only, consistent snapshot ----------

        [Test]
        public void CreateBackup_LeavesOnlyTheFinishedEncryptedFile_AndItAppearsInTheList()
        {
            DatabaseService.SettingsRepo.Set("backup_target_folder", _folder);
            Product product = CreateProduct("صنف نسخة", 1000, 500, 100000);
            OpenShift(100000);
            SellOnce(product);

            BackupResult created = DatabaseService.Backup.CreateBackup(_folder);

            Assert.IsTrue(created.Success, created.Message);
            Assert.IsTrue(EncryptionService.IsFileEncrypted(created.BackupFilePath), "النسخة مشفرة");
            Assert.AreEqual(0, Directory.GetFiles(_folder, "*.raw").Length, "لا لقطة غير مشفرة متروكة");
            Assert.AreEqual(0, Directory.GetFiles(_folder, "*.tmp").Length, "لا ملف مرحلي متروك");
            BackupStatusInfo status = DatabaseService.Backup.GetStatus();
            Assert.AreEqual(1, status.TotalBackupCount);
            Assert.AreEqual(Path.GetFileName(created.BackupFilePath), status.RecentBackups[0].FileName);
        }

        [Test]
        public void CreateBackup_SnapshotIncludesCommittedSalesStillSittingInTheWal()
        {
            DatabaseService.SettingsRepo.Set("backup_target_folder", _folder);
            Product product = CreateProduct("صنف سجل WAL", 1000, 500, 100000);
            OpenShift(100000);
            SellOnce(product);
            SellOnce(product);
            long salesNow = CountSales();

            BackupResult created = DatabaseService.Backup.CreateBackup(_folder);
            Assert.IsTrue(created.Success, created.Message);

            var res = DispatchOk("backup:verify", new JObject { { "backupFilePath", created.BackupFilePath } });
            Assert.AreEqual(salesNow, Data(res)["salesCount"].Value<long>(), "النسخة تحتوي كل المبيعات المسجلة وقت أخذها");
        }

        // ---------- (e) verify ----------

        [Test]
        public void Verify_ReportsHealthyBackup_AndDoesNotTouchTheFileOrTheLiveDatabase()
        {
            DatabaseService.SettingsRepo.Set("backup_target_folder", _folder);
            BackupResult created = DatabaseService.Backup.CreateBackup(_folder);
            Assert.IsTrue(created.Success, created.Message);
            byte[] before = File.ReadAllBytes(created.BackupFilePath);
            DateTime writeBefore = File.GetLastWriteTimeUtc(created.BackupFilePath);

            var res = DispatchOk("backup:verify", new JObject { { "backupFilePath", created.BackupFilePath } });

            Assert.IsTrue(Data(res)["isVerified"].Value<bool>(), Data(res)["message"].ToString());
            CollectionAssert.AreEqual(before, File.ReadAllBytes(created.BackupFilePath), "الفحص للقراءة فقط");
            Assert.AreEqual(writeBefore, File.GetLastWriteTimeUtc(created.BackupFilePath));
            Assert.AreEqual(0, Directory.GetFiles(Path.GetTempPath(), "rafiq_bk_verify_*").Length, "لا نسخة مفكوكة التشفير متروكة في مجلد المؤقت");
        }

        [Test]
        public void Verify_EmptyCorruptAndMissingFiles_ReturnClearArabicFailures()
        {
            DatabaseService.SettingsRepo.Set("backup_target_folder", _folder);
            string empty = Path.Combine(_folder, "rafiq_backup_20260101_000000.db");
            File.WriteAllBytes(empty, new byte[0]);
            string garbage = Path.Combine(_folder, "rafiq_backup_20260102_000000.db");
            File.WriteAllBytes(garbage, new byte[] { 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20 });
            string missing = Path.Combine(_folder, "rafiq_backup_20260103_000000.db");

            var emptyRes = Data(DispatchOk("backup:verify", new JObject { { "backupFilePath", empty } }));
            Assert.IsFalse(emptyRes["isVerified"].Value<bool>());
            StringAssert.Contains("فارغ", emptyRes["message"].ToString());

            var garbageRes = Data(DispatchOk("backup:verify", new JObject { { "backupFilePath", garbage } }));
            Assert.IsFalse(garbageRes["isVerified"].Value<bool>());
            Assert.IsNotEmpty(garbageRes["message"].ToString());

            var missingRes = Data(DispatchOk("backup:verify", new JObject { { "backupFilePath", missing } }));
            Assert.IsFalse(missingRes["isVerified"].Value<bool>());
            StringAssert.Contains("لم يتم العثور", missingRes["message"].ToString());
        }

        [Test]
        public void Verify_RejectsPathsThatAreNotARealBackupFile_WithoutOpeningThem()
        {
            string[] bad = new string[]
            {
                "",
                "relative\\rafiq_backup_20260101_000000.db",
                "\\\\?\\C:\\Windows\\win.ini",
                "C:\\Windows\\win.ini",
                Path.Combine(_folder, "rafiq_backup_20260101_000000.db:stream"),
                Path.Combine(_folder, "*.db"),
                "\\\\attacker-host\\share\\rafiq_backup_20260101_000000.db"
            };
            for (int i = 0; i < bad.Length; i++)
            {
                var res = Data(DispatchOk("backup:verify", new JObject { { "backupFilePath", bad[i] } }));
                Assert.IsFalse(res["isVerified"].Value<bool>(), "يجب رفض المسار: " + bad[i]);
            }
        }

        // ---------- (f) restore gate and atomic swap ----------

        [Test]
        public void ValidateRestoreSource_AcceptsOnlyExistingRegularDbFilesOutsideTheLiveDataFolder()
        {
            string good = FakeBackup(new DateTime(2026, 5, 1, 8, 0, 0));
            string full;
            string live = Path.GetDirectoryName(DatabaseService.DbPath);

            Assert.IsNull(BackupService.ValidateRestoreSource(good, _folder, live, out full));
            Assert.AreEqual(Path.GetFullPath(good), full);

            Assert.IsNotNull(BackupService.ValidateRestoreSource(null, _folder, live, out full), "فارغ");
            Assert.IsNotNull(BackupService.ValidateRestoreSource("rafiq_backup_20260501_080000.db", _folder, live, out full), "مسار نسبي");
            Assert.IsNotNull(BackupService.ValidateRestoreSource("\\\\.\\PhysicalDrive0", _folder, live, out full), "مسار جهاز");
            Assert.IsNotNull(BackupService.ValidateRestoreSource(good + ":hidden", _folder, live, out full), "تيار بيانات بديل");
            Assert.IsNotNull(BackupService.ValidateRestoreSource(Path.Combine(_folder, "backup.txt"), _folder, live, out full), "امتداد خاطئ");
            Assert.IsNotNull(BackupService.ValidateRestoreSource(Path.Combine(_folder, "rafiq_backup_20260501_000000.db"), _folder, live, out full), "ملف غير موجود");
            Assert.IsNotNull(BackupService.ValidateRestoreSource(DatabaseService.DbPath, _folder, live, out full), "قاعدة البيانات الحالية نفسها");
            Assert.IsNotNull(BackupService.ValidateRestoreSource("\\\\server\\share\\rafiq_backup_20260501_080000.db", _folder, live, out full), "مسار شبكة خارج مجلد النسخ");
        }

        [Test]
        public void ValidateTargetFolder_RequiresAFullPath()
        {
            Assert.IsNull(BackupService.ValidateTargetFolder(""));
            Assert.IsNull(BackupService.ValidateTargetFolder(_folder));
            Assert.IsNotNull(BackupService.ValidateTargetFolder("backups"));
            Assert.IsNotNull(BackupService.ValidateTargetFolder("E:backups"));
            Assert.IsNotNull(BackupService.ValidateTargetFolder("\\\\?\\C:\\x"));
            Assert.IsNotNull(BackupService.ValidateTargetFolder(_folder + "\\*"));
        }

        [Test]
        public void Configure_And_Create_RejectARelativeFolder_AndConfigureClampsRetention()
        {
            var bad = Dispatch("backup:configure", new JObject { { "targetFolder", "relative\\folder" } });
            Assert.IsFalse(bad.Success);
            Assert.AreEqual("INVALID_FOLDER", ErrorCodeOf(bad));
            Assert.AreEqual(string.Empty, DatabaseService.SettingsRepo.Get("backup_target_folder", ""), "لم يُحفظ مسار غير صالح");

            var badCreate = Dispatch("backup:create", new JObject { { "folder", "relative\\folder" } });
            Assert.AreEqual("INVALID_FOLDER", ErrorCodeOf(badCreate));

            // Retention is root-only on the server (S65 covers the refusal for the owner)
            LoginAs("usr_root_developer");
            DispatchOk("backup:configure", new JObject
            {
                { "targetFolder", _folder }, { "retentionDays", -5 }, { "retentionWeeks", 100000 }, { "warnAfterDays", 0 }, { "maxCopies", 1 }
            });
            Assert.AreEqual("1", DatabaseService.SettingsRepo.Get("backup_retention_days", ""));
            Assert.AreEqual("104", DatabaseService.SettingsRepo.Get("backup_retention_weeks", ""));
            Assert.AreEqual("1", DatabaseService.SettingsRepo.Get("backup_warn_after_days", ""));
            Assert.AreEqual(BackupService.MIN_GUARANTEED_COPIES.ToString(), DatabaseService.SettingsRepo.Get("backup_max_copies", ""));
        }

        [Test]
        public void Restore_RequiresTheOwnerRecoveryCodeInEveryState_AndRejectsArbitraryPaths()
        {
            DatabaseService.SettingsRepo.Set("backup_target_folder", _folder);
            BackupResult created = DatabaseService.Backup.CreateBackup(_folder);
            Assert.IsTrue(created.Success, created.Message);
            string code = DatabaseService.Backup.GetOrCreateRecoveryCode();
            long salesBefore = CountSales();

            Assert.AreEqual("RECOVERY_REJECTED", ErrorCodeOf(Dispatch("database:restore", new JObject { { "backupFilePath", created.BackupFilePath } })), "بدون كود");
            Assert.AreEqual("RECOVERY_REJECTED", ErrorCodeOf(Dispatch("database:restore", new JObject { { "backupFilePath", created.BackupFilePath }, { "recoveryCode", "RFK-0000-0000-0000" } })), "كود خاطئ");
            Assert.AreEqual("RECOVERY_REJECTED", ErrorCodeOf(Dispatch("database:restore", new JObject { { "backupFilePath", DatabaseService.DbPath }, { "recoveryCode", code } })), "ملف قاعدة البيانات الحالية");
            Assert.AreEqual("RECOVERY_REJECTED", ErrorCodeOf(Dispatch("database:restore", new JObject { { "backupFilePath", "relative.db" }, { "recoveryCode", code } })), "مسار نسبي");
            Assert.AreEqual(salesBefore, CountSales(), "لا شيء تغيّر بالمحاولات المرفوضة");
        }

        [Test]
        public void Restore_WithTheCorrectCode_ReplacesTheDatabase_KeepsASafetyCopy_AndLeavesNoStagingFiles()
        {
            DatabaseService.SettingsRepo.Set("backup_target_folder", _folder);
            Product product = CreateProduct("صنف استرجاع", 1000, 500, 100000);
            OpenShift(100000);
            SellOnce(product);
            long salesAtBackup = CountSales();
            BackupResult created = DatabaseService.Backup.CreateBackup(_folder);
            Assert.IsTrue(created.Success, created.Message);
            SellOnce(product);
            Assert.AreEqual(salesAtBackup + 1, CountSales());
            string code = DatabaseService.Backup.GetOrCreateRecoveryCode();
            string dataFolder = Path.GetDirectoryName(DatabaseService.DbPath);

            var res = Dispatch("database:restore", new JObject { { "backupFilePath", created.BackupFilePath }, { "recoveryCode", code } });

            Assert.IsTrue(res.Success, Describe(res));
            Assert.IsFalse(DatabaseService.IsCorrupted);
            Assert.AreEqual(salesAtBackup, CountSales(), "البيانات رجعت لوقت النسخة");
            Assert.IsTrue(Directory.GetFiles(Path.Combine(dataFolder, "pre_restore"), "pre_restore_*.db").Length >= 1, "نسخة أمان من البيانات الحالية قبل الاستبدال");
            Assert.AreEqual(0, Directory.GetFiles(dataFolder, "*.incoming_*").Length, "لا ملف مرحلي");
            Assert.AreEqual(0, Directory.GetFiles(dataFolder, "*.rollback_*").Length, "لا نسخة معلقة بعد النجاح");
        }

        [Test]
        public void ReplaceDatabaseFile_FailureAfterTheSwap_RollsBackToTheOriginalDatabase()
        {
            Product product = CreateProduct("صنف تراجع", 1000, 500, 100000);
            OpenShift(100000);
            SellOnce(product);
            long salesBefore = CountSales();
            string dataFolder = Path.GetDirectoryName(DatabaseService.DbPath);

            string replacement = Path.Combine(_folder, "replacement_empty_schema.db");
            using (var conn = new SQLiteConnection("Data Source=" + replacement + ";Version=3;"))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand("CREATE TABLE only_one (id INTEGER);", conn)) { cmd.ExecuteNonQuery(); }
            }
            SQLiteConnection.ClearAllPools();

            TransactionResult swap = DatabaseService.ReplaceDatabaseFile(
                DatabaseService.DbPath, DatabaseService.ConnectionString, replacement, "pre_test",
                delegate { throw new InvalidOperationException("فشل مقصود بعد الاستبدال"); });

            Assert.IsFalse(swap.Success);
            StringAssert.Contains("إرجاع قاعدة البيانات", swap.Message);
            Assert.IsFalse(DatabaseService.IsCorrupted, "القاعدة الأصلية عادت سليمة");
            Assert.AreEqual(salesBefore, CountSales(), "بيانات المتجر الأصلية كما هي");
            Assert.AreEqual(0, Directory.GetFiles(dataFolder, "*.incoming_*").Length);
            Assert.AreEqual(0, Directory.GetFiles(dataFolder, "*.rollback_*").Length);
        }

        // ---------- (h) retention ----------

        [Test]
        public void Retention_NeverDeletesTheNewestBackup_AndKeepsAtLeastThreeCopies()
        {
            DatabaseService.SettingsRepo.Set("backup_target_folder", _folder);
            DateTime today = DateTime.Now.Date;
            var all = new List<string>();
            for (int i = 0; i < 12; i++)
            {
                all.Add(FakeBackup(today.AddDays(-(200 + i)).AddHours(9)));
            }
            string newest = all[0];

            DatabaseService.Backup.PruneOldBackups(_folder, 1, 1, 3);

            string[] left = Directory.GetFiles(_folder, "rafiq_backup_*.db");
            Assert.AreEqual(3, left.Length, "الحد الأدنى المضمون 3 نسخ حتى لو كلها أقدم من مدة الاستبقاء");
            Assert.Contains(newest, new List<string>(left), "الأحدث لا يُحذف");
        }

        [Test]
        public void Retention_MaxCopiesCountsExactlyWhatTheListShows_AndDropsTheOldestFirst()
        {
            DatabaseService.SettingsRepo.Set("backup_target_folder", _folder);
            DateTime today = DateTime.Now.Date;
            for (int i = 0; i < 12; i++)
            {
                FakeBackup(today.AddMinutes(i * 5));
            }

            DatabaseService.Backup.PruneOldBackups(_folder, 7, 4, 5);

            BackupStatusInfo status = DatabaseService.Backup.GetStatus();
            Assert.AreEqual(5, status.TotalBackupCount, "سقف عدد النسخ = ما تعرضه القائمة");
            Assert.AreEqual("rafiq_backup_" + today.AddMinutes(11 * 5).ToString("yyyyMMdd_HHmmss") + ".db", status.RecentBackups[0].FileName, "الأحدث باقٍ");
        }

        [Test]
        public void Retention_TouchesOnlyBackupFiles_AndRemovesTheCompanionRxArchiveWithItsBackup()
        {
            DatabaseService.SettingsRepo.Set("backup_target_folder", _folder);
            DateTime today = DateTime.Now.Date;
            var made = new List<string>();
            for (int i = 0; i < 6; i++)
            {
                made.Add(FakeBackup(today.AddDays(-(300 + i)).AddHours(9)));
            }
            string oldestName = Path.GetFileName(made[5]);
            string oldestRx = Path.Combine(_folder, oldestName.Replace("rafiq_backup_", "rafiq_rx_"));
            File.WriteAllText(oldestRx, "x");
            string foreign = Path.Combine(_folder, "my_own_copy.db");
            string live = Path.Combine(_folder, "rafiq_pos.db");
            File.WriteAllText(foreign, "x");
            File.WriteAllText(live, "x");

            DatabaseService.Backup.PruneOldBackups(_folder, 1, 1, 3);

            Assert.IsTrue(File.Exists(foreign), "ملفات غير تابعة للتطبيق لا تُحذف");
            Assert.IsTrue(File.Exists(live), "ملف قاعدة بيانات باسم آخر لا يُحذف");
            Assert.IsFalse(File.Exists(made[5]), "أقدم نسخة حُذفت");
            Assert.IsFalse(File.Exists(oldestRx), "أرشيف الروشتات المرافق حُذف معها");
        }

        // ---------- (i) permissions ----------

        [Test]
        public void BackupActions_AreForbiddenForCashiers_ByTheServer()
        {
            LoginAs(CashierId);
            string[] actions = new string[]
            {
                "backup:getStatus", "backup:create", "backup:getDrives", "backup:configure", "backup:verify",
                "database:checkIntegrity", "database:restore"
            };
            for (int i = 0; i < actions.Length; i++)
            {
                var res = Dispatch(actions[i], new JObject());
                Assert.IsFalse(res.Success, actions[i]);
                Assert.AreEqual("FORBIDDEN", ErrorCodeOf(res), actions[i] + ": " + Describe(res));
            }
        }
    }
}
