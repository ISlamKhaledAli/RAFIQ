using System;
using RafiqPOS.Data;
using System.IO;
using System.Reflection;
using NUnit.Framework;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    /// <summary>
    /// المتانة (قرار المالك): كل اتصالات التطبيق بـ synchronous=FULL مع WAL، واختبارات الأداء تعمل على قاعدة مؤقتة
    /// ولا تلمس قاعدة المتجر الحية وتُقيَّد بـ 5000 صنف.
    /// </summary>
    [TestFixture]
    [NonParallelizable]
    public class S96_DurabilityAndBenchmarkSafetyTest
    {
        private string _baseFolder;

        [SetUp]
        public void SetUp()
        {
            _baseFolder = Path.Combine(Path.GetTempPath(), "rafiq_nunit_durability_" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(_baseFolder);
            SecurityService.SetCurrentUserForTesting(null);
        }

        [TearDown]
        public void TearDown()
        {
            SecurityService.SetCurrentUserForTesting(null);
            ResetDatabaseServiceStatics();
            SQLiteConnection.ClearAllPools();
            GC.Collect();
            GC.WaitForPendingFinalizers();
            try { Directory.Delete(_baseFolder, true); } catch (IOException) { } catch (UnauthorizedAccessException) { }
        }

        private static long Pragma(SQLiteConnection conn, string name)
        {
            using (var cmd = new SQLiteCommand("PRAGMA " + name + ";", conn))
            {
                return Convert.ToInt64(cmd.ExecuteScalar());
            }
        }

        [Test]
        public void AppConnections_UseSynchronousFull_WithWal()
        {
            DatabaseService.Initialize(_baseFolder);
            StringAssert.Contains("Synchronous=Full", DatabaseService.ConnectionString);
            StringAssert.DoesNotContain("Synchronous=Normal", DatabaseService.ConnectionString);

            using (var conn = new SQLiteConnection(DatabaseService.ConnectionString))
            {
                conn.Open();
                Assert.AreEqual(2L, Pragma(conn, "synchronous"), "PRAGMA synchronous = FULL (2)");
                using (var cmd = new SQLiteCommand("PRAGMA journal_mode;", conn))
                {
                    Assert.AreEqual("wal", Convert.ToString(cmd.ExecuteScalar()).ToLowerInvariant());
                }
            }
        }

        [Test]
        public void StressBenchmark_RunsOnATemporaryDatabase_NeverTheLiveStore_AndCapsTheProductCount()
        {
            DatabaseService.Initialize(_baseFolder);
            string tempFolder = Path.GetTempPath();
            int leftoverBefore = Directory.GetFiles(tempFolder, "rafiq_bench_*").Length;

            BenchmarkResult result = new BenchmarkService().RunStressTest(1000000, 5);

            Assert.IsTrue(result.Success, result.SummaryMessage);
            Assert.AreEqual(BenchmarkTempDatabase.MaxProducts, result.TotalProductsTested, "الحد الأقصى 5000 صنف");
            Assert.AreEqual(leftoverBefore, Directory.GetFiles(tempFolder, "rafiq_bench_*").Length, "القاعدة المؤقتة تُحذف بعد الاختبار");

            using (var conn = new SQLiteConnection(DatabaseService.ConnectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand("SELECT COUNT(*) FROM products WHERE id LIKE 'stress_%' OR barcode LIKE 'STRESS%';", conn))
                {
                    Assert.AreEqual(0L, Convert.ToInt64(cmd.ExecuteScalar()), "لا أصناف تجريبية في قاعدة المتجر");
                }
                using (var cmd = new SQLiteCommand("SELECT COUNT(*) FROM sales WHERE id LIKE 'stress_%';", conn))
                {
                    Assert.AreEqual(0L, Convert.ToInt64(cmd.ExecuteScalar()), "لا فواتير تجريبية في قاعدة المتجر");
                }
            }
        }

        [Test]
        public void SearchBenchmark_RunsOnATemporaryDatabase_AndLeavesTheLiveCatalogUntouched()
        {
            DatabaseService.Initialize(_baseFolder);
            string tempFolder = Path.GetTempPath();
            int leftoverBefore = Directory.GetFiles(tempFolder, "rafiq_bench_*").Length;

            SearchBenchmarkResult result = new SearchBenchmarkRunner().RunBenchmark(1000000, 5);

            Assert.IsTrue(result.Success, result.SummaryReport + " | " + string.Join(" ; ", result.TestLog.ToArray()));
            Assert.AreEqual(BenchmarkTempDatabase.MaxProducts, result.TotalProductsTested, "الحد الأقصى 5000 صنف");
            Assert.AreEqual(leftoverBefore, Directory.GetFiles(tempFolder, "rafiq_bench_*").Length, "القاعدة المؤقتة تُحذف بعد الاختبار");

            using (var conn = new SQLiteConnection(DatabaseService.ConnectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand("SELECT COUNT(*) FROM products WHERE id LIKE 'bench_fast_%';", conn))
                {
                    Assert.AreEqual(0L, Convert.ToInt64(cmd.ExecuteScalar()), "لا أصناف اختبار في قاعدة المتجر");
                }
            }
        }

        [Test]
        public void CleanShutdownMarker_IsKept_WhenStartupFailedBeforeTheIntegrityCheckFinished()
        {
            DatabaseService.Initialize(_baseFolder);
            string marker = Path.Combine(Path.GetDirectoryName(DatabaseService.DbPath), "session_open.marker");
            FieldInfo markerName = typeof(DatabaseService).GetField("SessionOpenMarkerName", BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic);
            if (markerName != null) marker = Path.Combine(Path.GetDirectoryName(DatabaseService.DbPath), (string)markerName.GetValue(null));
            Assert.IsTrue(File.Exists(marker), "علامة الجلسة المفتوحة موجودة بعد بدء ناجح");

            FieldInfo completed = typeof(DatabaseService).GetField("_integrityCheckCompleted", BindingFlags.Static | BindingFlags.NonPublic);
            Assert.IsNotNull(completed, "_integrityCheckCompleted");

            completed.SetValue(null, false);
            DatabaseService.MarkCleanShutdown();
            Assert.IsTrue(File.Exists(marker), "علامة الجلسة السابقة تبقى إذا لم يكتمل فحص السلامة");

            completed.SetValue(null, true);
            DatabaseService.MarkCleanShutdown();
            Assert.IsFalse(File.Exists(marker), "الإغلاق النظيف بعد فحص ناجح يحذف العلامة");
        }

        private static void ResetDatabaseServiceStatics()
        {
            if (DatabaseService.License != null) DatabaseService.License.StopBackgroundPeriodicCheck();
            if (DatabaseService.Backup != null) DatabaseService.Backup.StopBackgroundPeriodicCheck();
            const BindingFlags flags = BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic;
            foreach (PropertyInfo prop in typeof(DatabaseService).GetProperties(flags))
            {
                MethodInfo setter = prop.GetSetMethod(true);
                if (setter != null && !prop.PropertyType.IsValueType) setter.Invoke(null, new object[] { null });
            }
            foreach (FieldInfo field in typeof(DatabaseService).GetFields(flags))
            {
                if (field.IsLiteral || field.IsInitOnly) continue;
                field.SetValue(null, field.FieldType.IsValueType ? Activator.CreateInstance(field.FieldType) : null);
            }
        }
    }
}
