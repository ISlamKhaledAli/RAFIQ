using System;
using System.Collections.Generic;
using System.Data.SQLite;
using System.IO;
using System.IO.Compression;
using System.Text;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using RafiqPOS.Common;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    /// <summary>
    /// حزمة الدعم الفني: تُنشأ في مجلد قابل للتوجيه، فيها التقرير المقروء وJSON والسجل المنقّح وREADME، ولا تحتوي أي ملف قاعدة بيانات،
    /// الإصدار فيها هو الإصدار الحقيقي، والسجل يحجب الهواتف وكلمات السر، وفشل أي قسم لا يفشل الحزمة.
    /// </summary>
    [TestFixture]
    [NonParallelizable]
    public class S66_SupportBundleTest : S30_Step3BFixtureBase
    {
        private string _outDir;

        [SetUp]
        public void SupportSetUp()
        {
            _outDir = Path.Combine(Path.GetTempPath(), "rafiq_s66_support_" + Guid.NewGuid().ToString("N"));
        }

        [TearDown]
        public void SupportTearDown()
        {
            SQLiteConnection.ClearAllPools();
            try { Directory.Delete(_outDir, true); } catch (IOException) { } catch (UnauthorizedAccessException) { }
        }

        private static Dictionary<string, string> ReadZip(string zipPath)
        {
            Dictionary<string, string> entries = new Dictionary<string, string>();
            using (ZipArchive zip = ZipFile.OpenRead(zipPath))
            {
                foreach (ZipArchiveEntry entry in zip.Entries)
                {
                    using (StreamReader reader = new StreamReader(entry.Open(), Encoding.UTF8))
                    {
                        entries[entry.FullName] = reader.ReadToEnd();
                    }
                }
            }
            return entries;
        }

        [Test]
        public void Bundle_IsCreatedInTheRequestedFolder_WithTheExpectedEntries_AndNoDatabaseFiles()
        {
            SupportBundleResult result = DatabaseService.Support.CreateSupportBundle(_outDir);

            Assert.IsTrue(result.Success, result.Message);
            Assert.AreEqual("custom", result.Location);
            Assert.AreEqual(_outDir, result.FolderPath);
            Assert.AreEqual(Path.GetFullPath(_outDir), Path.GetDirectoryName(Path.GetFullPath(result.FilePath)));
            Assert.IsTrue(File.Exists(result.FilePath));
            StringAssert.StartsWith("rafiq_support_bundle_", Path.GetFileName(result.FilePath));
            StringAssert.EndsWith(".zip", result.FilePath);
            Assert.IsFalse(File.Exists(result.FilePath + ".tmp"), "الملف المؤقت يجب ألا يبقى");

            Dictionary<string, string> entries = ReadZip(result.FilePath);
            CollectionAssert.AreEquivalent(
                new string[] { "diagnostic_info.json", "SUPPORT_REPORT_AR.txt", "system_error.log", "README_AR.txt" },
                entries.Keys);
            foreach (string name in entries.Keys)
            {
                string lower = name.ToLowerInvariant();
                Assert.IsFalse(lower.EndsWith(".db") || lower.EndsWith(".db-wal") || lower.EndsWith(".db-shm") || lower.EndsWith(".sqlite"), "ملف قاعدة بيانات داخل الحزمة: " + name);
            }
            Assert.IsTrue(entries["SUPPORT_REPORT_AR.txt"].Contains("إصدار البرنامج"));
            Assert.IsTrue(entries["README_AR.txt"].Contains("لا تحتوي الحزمة على ملف قاعدة البيانات"));
        }

        [Test]
        public void DiagnosticJson_HasTheRealVersion_AndRealDatabaseFacts()
        {
            SupportBundleResult result = DatabaseService.Support.CreateSupportBundle(_outDir);
            Assert.IsTrue(result.Success, result.Message);

            JObject json = JObject.Parse(ReadZip(result.FilePath)["diagnostic_info.json"]);
            Assert.AreEqual(AppUpdateService.CurrentVersion, (string)json["AppVersion"]);
            Assert.IsTrue((bool)json["DatabaseHealthOk"]);
            Assert.AreEqual("wal", (string)json["DatabaseJournalMode"]);
            Assert.Greater((int)json["SchemaVersion"], 0);
            Assert.AreEqual("ok", (string)json["IntegrityCheck"], "quick_check على قاعدة سليمة");
            Assert.Greater(((JArray)json["MigrationHistory"]).Count, 0);
            Assert.Greater((long)json["DiskFreeBytes"], 0L);
            Assert.IsNotNull(json["BackupRetentionDays"]);
        }

        [Test]
        public void Bundle_NeverCarriesStoreIdentityOrDatabaseContent()
        {
            DatabaseService.SettingsRepo.Set("store_name", "صيدلية الأمل الخاصة");
            DatabaseService.SettingsRepo.Set("store_phone", "01234567890");
            DatabaseService.SettingsRepo.Set("tax_enabled", "1");

            SupportBundleResult result = DatabaseService.Support.CreateSupportBundle(_outDir);
            Assert.IsTrue(result.Success, result.Message);

            Dictionary<string, string> entries = ReadZip(result.FilePath);
            foreach (KeyValuePair<string, string> pair in entries)
            {
                Assert.IsFalse(pair.Value.Contains("صيدلية الأمل الخاصة"), "اسم المحل تسرّب في " + pair.Key);
                Assert.IsFalse(pair.Value.Contains("01234567890"), "هاتف المحل تسرّب في " + pair.Key);
            }
            JObject json = JObject.Parse(entries["diagnostic_info.json"]);
            Assert.IsNull(json["SettingsSnapshot"]["store_name"]);
            Assert.IsNull(json["SettingsSnapshot"]["store_phone"]);
            Assert.AreEqual("1", (string)json["SettingsSnapshot"]["tax_enabled"]);
        }

        [Test]
        public void Scrubber_MasksPhoneNumbers_PasswordTokens_Emails_AndProfilePaths_ButKeepsDiagnostics()
        {
            string masked = SupportLogScrubber.Scrub("[2026-11-08 22:21:21.100] [ERROR] اتصال 01012345678 فشل password=Secret123 pin: 4821 ali@example.com");
            StringAssert.StartsWith("[2026-11-08 22:21:21.100] [ERROR]", masked);
            Assert.IsFalse(masked.Contains("01012345678"));
            Assert.IsFalse(masked.Contains("Secret123"));
            Assert.IsFalse(masked.Contains("4821"));
            Assert.IsFalse(masked.Contains("ali@example.com"));
            StringAssert.Contains("password=" + SupportLogScrubber.Mask, masked);

            Assert.IsFalse(SupportLogScrubber.Scrub("كلمة المرور: abc123").Contains("abc123"));
            Assert.IsFalse(SupportLogScrubber.Scrub("هاتف 010 9778 2965").Contains("9778"));
            Assert.IsFalse(SupportLogScrubber.Scrub("مبلغ 150.50 جنيه").Contains("150"));
            Assert.IsFalse(SupportLogScrubber.Scrub("فتح الوردية للكاشير أحمد علي بعهدة 500 قرش").Contains("أحمد"));
            string path = SupportLogScrubber.Scrub("C:\\Users\\Ahmed\\Desktop\\x.zip");
            Assert.IsFalse(path.Contains("Ahmed"));
            StringAssert.Contains("Desktop", path);
            Assert.AreEqual("رقم الفاتورة 12345 الإصدار 1.2.3", SupportLogScrubber.Scrub("رقم الفاتورة 12345 الإصدار 1.2.3"));
        }

        [Test]
        public void LoggedSecrets_AreMaskedInsideTheBundleLog()
        {
            Assert.IsFalse(string.IsNullOrEmpty(Logger.LogFilePath), "مسار السجل غير متاح في بيئة الاختبار");
            Logger.Error("اختبار S66 اتصال العميل 01099887766 password=TopSecret99");

            SupportBundleResult result = DatabaseService.Support.CreateSupportBundle(_outDir);
            Assert.IsTrue(result.Success, result.Message);

            string log = ReadZip(result.FilePath)["system_error.log"];
            StringAssert.Contains("اختبار S66", log);
            Assert.IsFalse(log.Contains("01099887766"));
            Assert.IsFalse(log.Contains("TopSecret99"));
        }

        [Test]
        public void Scrubber_BoundsTheLogToTheNewestLines()
        {
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < SupportLogScrubber.MaxLines + 500; i++)
            {
                sb.Append("line ").Append(i).Append("\r\n");
            }
            string bounded = SupportLogScrubber.ScrubRecentLog(sb.ToString());
            string[] lines = bounded.Split(new string[] { "\r\n" }, StringSplitOptions.None);
            Assert.LessOrEqual(lines.Length, SupportLogScrubber.MaxLines);
            StringAssert.Contains("line " + (SupportLogScrubber.MaxLines + 499), bounded);
            Assert.IsFalse(bounded.Contains("line 0\r\n"));
        }

        [Test]
        public void ASectionThatFails_IsReportedAsUnavailable_AndDoesNotFailTheBundle()
        {
            // The fixture removes the licence service, so that section cannot be collected
            Assert.IsNull(DatabaseService.License);
            SupportBundleResult result = DatabaseService.Support.CreateSupportBundle(_outDir);

            Assert.IsTrue(result.Success, result.Message);
            Assert.Greater(result.UnavailableSectionCount, 0);
            Assert.IsTrue(result.SystemInfo.UnavailableSections.ContainsKey("الترخيص"));
            Dictionary<string, string> entries = ReadZip(result.FilePath);
            StringAssert.Contains("الترخيص: غير متاح", entries["SUPPORT_REPORT_AR.txt"]);
            StringAssert.Contains("تنبيه", result.Message);
            Assert.IsNotNull(JObject.Parse(entries["diagnostic_info.json"])["UnavailableSections"]["الترخيص"]);
        }

        [Test]
        public void AnUnreachableDatabase_StillProducesABundle_WithTheDatabaseSectionMarkedUnavailable()
        {
            string missing = Path.Combine(_outDir, "missing", "none.db");
            string conn = "Data Source=" + missing + ";Version=3;FailIfMissing=True;Pooling=False;";
            SupportService broken = new SupportService(conn, missing);

            SupportBundleResult result = broken.CreateSupportBundle(_outDir);

            Assert.IsTrue(result.Success, result.Message);
            Assert.IsTrue(result.SystemInfo.UnavailableSections.ContainsKey("قاعدة البيانات"));
            Assert.AreEqual(AppUpdateService.CurrentVersion, result.SystemInfo.AppVersion);
            Assert.IsTrue(File.Exists(result.FilePath));
        }

        [Test]
        public void ReportedFolder_IsTheRealFolder_NotAlwaysTheDesktop()
        {
            SupportBundleResult result = DatabaseService.Support.CreateSupportBundle(_outDir);
            Assert.IsTrue(result.Success, result.Message);
            StringAssert.Contains(_outDir, result.Message);
            Assert.IsFalse(result.Message.Contains("سطح المكتب"), "الرسالة لا يجوز أن تدّعي سطح المكتب لمجلد مخصص");
        }

        [Test]
        public void SchemaVersion_AndCounts_MatchTheDatabase()
        {
            SupportSystemInfo info = DatabaseService.Support.GetSystemDiagnosticInfo();
            using (SQLiteConnection conn = new SQLiteConnection(DatabaseService.ConnectionString))
            {
                conn.Open();
                using (SQLiteCommand cmd = new SQLiteCommand("SELECT COALESCE(MAX(version), 0) FROM schema_migrations;", conn))
                {
                    Assert.AreEqual(Convert.ToInt32(cmd.ExecuteScalar()), info.SchemaVersion);
                }
            }
            Assert.AreEqual(info.SchemaVersion, info.MigrationHistory[info.MigrationHistory.Count - 1].Version);
        }
    }
}
