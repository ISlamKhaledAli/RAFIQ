using System;
using System.Data.SQLite;
using System.IO;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using RafiqPOS.Database;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    /// <summary>
    /// سياسة الاحتفاظ بالنسخ الاحتياطية (أيام/أسابيع/أقصى عدد نسخ) يعدلها حساب الروت فقط من الخادم (backup:configure و settings:save)،
    /// وإعادة إرسال نفس القيم من المالك مقبولة ليحفظ بقية الحقول، والافتراضيات 14/8/30 تسري فقط عند غياب القيم المحفوظة.
    /// ومعها فحص حقيقي لقاعدة البيانات في معلومات النظام (system:getInfo) بدل نص ثابت.
    /// </summary>
    [TestFixture]
    [NonParallelizable]
    public class S65_BackupRetentionRootOnlyTest : S30_Step3BFixtureBase
    {
        private const string RootId = "usr_root_developer";
        private string _folder;

        [SetUp]
        public void RetentionSetUp()
        {
            _folder = Path.Combine(Path.GetTempPath(), "rafiq_s65_backups_" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(_folder);
        }

        [TearDown]
        public void RetentionTearDown()
        {
            SQLiteConnection.ClearAllPools();
            try { Directory.Delete(_folder, true); } catch (IOException) { } catch (UnauthorizedAccessException) { }
        }

        private JObject ConfigPayload(int days, int weeks, int maxCopies, int warnDays)
        {
            return new JObject
            {
                { "targetFolder", _folder }, { "retentionDays", days }, { "retentionWeeks", weeks },
                { "maxCopies", maxCopies }, { "warnAfterDays", warnDays }
            };
        }

        [Test]
        public void Defaults_WhenNothingIsSaved_Are14Days_8Weeks_30Copies_WarnAfter2()
        {
            Assert.AreEqual(14, BackupService.DEFAULT_RETENTION_DAYS);
            Assert.AreEqual(8, BackupService.DEFAULT_RETENTION_WEEKS);
            Assert.AreEqual(30, BackupService.DEFAULT_MAX_COPIES);
            Assert.AreEqual(2, BackupService.DEFAULT_WARN_AFTER_DAYS);

            BackupStatusInfo status = DatabaseService.Backup.GetStatus();
            Assert.AreEqual(14, status.RetentionDays);
            Assert.AreEqual(8, status.RetentionWeeks);
            Assert.AreEqual(30, status.MaxCopies);
            Assert.AreEqual(2, status.WarnAfterDays);
        }

        [Test]
        public void Defaults_NeverOverwriteStoredValues_AndAnUnparsableValueFallsBackToTheDefault()
        {
            DatabaseService.SettingsRepo.Set("backup_retention_days", "7");
            DatabaseService.SettingsRepo.Set("backup_retention_weeks", "4");
            DatabaseService.SettingsRepo.Set("backup_max_copies", "20");
            BackupStatusInfo status = DatabaseService.Backup.GetStatus();
            Assert.AreEqual(7, status.RetentionDays, "قيمة محفوظة سابقاً لا تُستبدل بالافتراضي");
            Assert.AreEqual(4, status.RetentionWeeks);
            Assert.AreEqual(20, status.MaxCopies);

            DatabaseService.SettingsRepo.Set("backup_retention_days", "abc");
            DatabaseService.SettingsRepo.Set("backup_max_copies", "0");
            Assert.AreEqual(BackupService.DEFAULT_RETENTION_DAYS, DatabaseService.Backup.GetRetentionDays());
            Assert.AreEqual(BackupService.DEFAULT_MAX_COPIES, DatabaseService.Backup.GetMaxCopies());
        }

        [Test]
        public void Configure_NonRoot_ChangingRetention_IsRejected_AndNothingIsSaved()
        {
            var res = Dispatch("backup:configure", ConfigPayload(3, 8, 30, 2));
            Assert.IsFalse(res.Success, "المالك/المدير لا يغير الاحتفاظ");
            Assert.AreEqual("FORBIDDEN", res.Error.Code);
            Assert.AreEqual(BackupService.RETENTION_ROOT_ONLY_MESSAGE, res.Error.Message);
            Assert.AreEqual(string.Empty, DatabaseService.SettingsRepo.Get("backup_target_folder", ""), "لم يُحفظ أي حقل");
            Assert.AreEqual(string.Empty, DatabaseService.SettingsRepo.Get("backup_retention_days", ""));

            Assert.IsFalse(Dispatch("backup:configure", ConfigPayload(14, 1, 30, 2)).Success, "الأسابيع");
            Assert.IsFalse(Dispatch("backup:configure", ConfigPayload(14, 8, 99, 2)).Success, "أقصى عدد نسخ");
        }

        [Test]
        public void Configure_NonRoot_ResendingTheSameRetention_SavesTheOtherFields()
        {
            var res = Dispatch("backup:configure", ConfigPayload(14, 8, 30, 5));
            Assert.IsTrue(res.Success, Describe(res));
            Assert.AreEqual(_folder, DatabaseService.SettingsRepo.Get("backup_target_folder", ""));
            Assert.AreEqual(5, DatabaseService.Backup.GetWarnAfterDays(), "تنبيه التأخير يبقى بيد المالك");

            // Existing store with an older saved policy: the unchanged values are still accepted
            DatabaseService.SettingsRepo.Set("backup_retention_days", "7");
            DatabaseService.SettingsRepo.Set("backup_retention_weeks", "4");
            DatabaseService.SettingsRepo.Set("backup_max_copies", "20");
            var again = Dispatch("backup:configure", ConfigPayload(7, 4, 20, 3));
            Assert.IsTrue(again.Success, Describe(again));
            Assert.AreEqual(7, DatabaseService.Backup.GetRetentionDays());
            Assert.AreEqual(3, DatabaseService.Backup.GetWarnAfterDays());
        }

        [Test]
        public void Configure_NonRoot_PayloadWithoutRetentionFields_KeepsThePolicy()
        {
            DatabaseService.SettingsRepo.Set("backup_retention_days", "30");
            var res = Dispatch("backup:configure", new JObject { { "targetFolder", _folder }, { "autoDaily", false } });
            Assert.IsTrue(res.Success, Describe(res));
            Assert.AreEqual(30, DatabaseService.Backup.GetRetentionDays());
            Assert.AreEqual("0", DatabaseService.SettingsRepo.Get("backup_auto_daily", ""));
        }

        [Test]
        public void Configure_Root_ChangesRetention()
        {
            LoginAs(RootId);
            var res = Dispatch("backup:configure", ConfigPayload(3, 2, 10, 2));
            Assert.IsTrue(res.Success, Describe(res));
            Assert.AreEqual(3, DatabaseService.Backup.GetRetentionDays());
            Assert.AreEqual(2, DatabaseService.Backup.GetRetentionWeeks());
            Assert.AreEqual(10, DatabaseService.Backup.GetMaxCopies());
        }

        [Test]
        public void ConfigureKeepsTheFloor_NeverFewerThanTheGuaranteedCopies()
        {
            LoginAs(RootId);
            DispatchOk("backup:configure", ConfigPayload(1, 1, 1, 2));
            Assert.AreEqual(BackupService.MIN_GUARANTEED_COPIES, DatabaseService.Backup.GetMaxCopies());
        }

        [Test]
        public void SettingsSave_NonRoot_CannotChangeRetentionKeys_ButUnchangedValuesPass()
        {
            var denied = Dispatch("settings:save", new JObject { { "backup_retention_days", "1" } });
            Assert.IsFalse(denied.Success);
            Assert.AreEqual("FORBIDDEN", denied.Error.Code);
            Assert.AreEqual(string.Empty, DatabaseService.SettingsRepo.Get("backup_retention_days", ""));

            var deniedCopies = Dispatch("settings:updateBatch", new JObject { { "settings", new JObject { { "backup_max_copies", "3" } } } });
            Assert.IsFalse(deniedCopies.Success);

            var same = Dispatch("settings:save", new JObject { { "backup_retention_days", "14" }, { "backup_warn_after_days", "4" } });
            Assert.IsTrue(same.Success, Describe(same));

            LoginAs(RootId);
            var rootRes = Dispatch("settings:save", new JObject { { "backup_retention_days", "21" } });
            Assert.IsTrue(rootRes.Success, Describe(rootRes));
            Assert.AreEqual("21", DatabaseService.SettingsRepo.Get("backup_retention_days", ""));
        }

        // ---------- system:getInfo: real database facts ----------

        [Test]
        public void SystemInfo_ReportsRealDatabaseFacts()
        {
            DatabaseHealthInfo health = DatabaseService.GetHealth();
            Assert.IsTrue(health.IsOk, health.Error);
            Assert.AreEqual("wal", health.JournalMode);
            Assert.AreEqual(MigrationRunner.LATEST_SUPPORTED_VERSION, health.SchemaVersion);
            Assert.Greater(health.SizeBytes, 0L);
            Assert.AreEqual(string.Empty, health.Error);
            Assert.AreEqual("متصلة وسليمة", health.ToSummaryText());

            var res = Dispatch("system:getInfo", null);
            Assert.IsTrue(res.Success, Describe(res));
            JObject data = Data(res);
            Assert.IsTrue(data["dbOk"].Value<bool>());
            Assert.AreEqual("wal", data["dbJournalMode"].Value<string>());
            Assert.AreEqual(MigrationRunner.LATEST_SUPPORTED_VERSION, data["dbSchemaVersion"].Value<int>());
            Assert.Greater(data["dbSizeBytes"].Value<long>(), 0L);
            Assert.AreEqual(string.Empty, data["lastBackupAt"].Value<string>(), "لا نسخة احتياطية بعد");
        }

        [Test]
        public void SystemInfo_FailsSafely_WhenTheFileIsMissingOrFlaggedCorrupt()
        {
            DatabaseHealthInfo missing = DatabaseService.CheckHealth(Path.Combine(_folder, "nope.db"), false);
            Assert.IsFalse(missing.IsOk);
            Assert.IsNotEmpty(missing.Error);
            Assert.AreEqual(missing.Error, missing.ToSummaryText());

            DatabaseHealthInfo flagged = DatabaseService.CheckHealth(DatabaseService.DbPath, true);
            Assert.IsFalse(flagged.IsOk, "تلف مسجل لا يُبلَّغ كسليم");
            Assert.IsNotEmpty(flagged.Error);

            string notADb = Path.Combine(_folder, "garbage.db");
            File.WriteAllText(notADb, "this is not a sqlite database at all, just text padding padding padding");
            DatabaseHealthInfo garbage = DatabaseService.CheckHealth(notADb, false);
            Assert.IsFalse(garbage.IsOk);
            Assert.IsNotEmpty(garbage.Error);
        }

        [Test]
        public void SystemInfo_LastBackupAt_ComesFromTheStoredSuccessTime()
        {
            DatabaseService.SettingsRepo.Set("backup_last_success_at", "2026-05-01T10:00:00.0000000Z");
            JObject data = Data(DispatchOk("system:getInfo", null));
            Assert.AreEqual("2026-05-01T10:00:00.0000000Z", data["lastBackupAt"].Value<string>());
        }
    }
}
