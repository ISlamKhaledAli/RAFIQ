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
    /// فلاتر التاريخ في الخلفية: سجل الفواتير (sales:getRecent / sales:search) وسجل الإقفالات (closing:getHistory)
    /// وقائمة النسخ الاحتياطية (backup:getStatus). الفترة بيوم محلي شاملة الطرفين وتُطبَّق في SQL قبل حد القائمة
    /// حتى لا تختفي النتائج الأقدم؛ بدونها يبقى السلوك القديم كما هو.
    /// </summary>
    [TestFixture]
    [NonParallelizable]
    public class S61_DateRangeFiltersTest : S30_Step3BFixtureBase
    {
        private static string LocalIso(int year, int month, int day, int hour, int minute, int second)
        {
            return new DateTime(year, month, day, hour, minute, second, DateTimeKind.Local).ToUniversalTime().ToString("o");
        }

        private static string Sell(Product product)
        {
            JObject line = CartLine(product, 1000, 1000);
            JObject sale = Data(DispatchOk("sales:create", SalePayload(new JArray { line }, 1000, "cash", 1000, null)));
            return sale["id"].ToString();
        }

        private static void SetCreatedAt(string saleId, string createdAt)
        {
            Execute("UPDATE sales SET created_at = @at WHERE id = @id;", "@at", createdAt, "@id", saleId);
        }

        private static List<string> Ids(BridgeResponse res)
        {
            Assert.IsTrue(res.Success, Describe(res));
            var ids = new List<string>();
            foreach (JToken row in JArray.FromObject(res.Data))
            {
                ids.Add(row["id"].ToString());
            }
            return ids;
        }

        private string _before;
        private string _first;
        private string _last;
        private string _after;

        // 4 sales around a local-day boundary: 03-09 23:59:55 | 03-10 00:00:05 | 03-10 23:59:55 | 03-11 00:00:05
        private void SeedBoundarySales()
        {
            OpenShift(100000);
            Product product = CreateProduct("صنف فلتر التاريخ", 1000, 500, 500000);
            _before = Sell(product);
            _first = Sell(product);
            _last = Sell(product);
            _after = Sell(product);
            SetCreatedAt(_before, LocalIso(2026, 3, 9, 23, 59, 55));
            SetCreatedAt(_first, LocalIso(2026, 3, 10, 0, 0, 5));
            SetCreatedAt(_last, LocalIso(2026, 3, 10, 23, 59, 55));
            SetCreatedAt(_after, LocalIso(2026, 3, 11, 0, 0, 5));
        }

        private static void AssertSameSet(List<string> actual, params string[] expected)
        {
            Assert.AreEqual(expected.Length, actual.Count, "عدد الفواتير");
            foreach (string id in expected)
            {
                Assert.Contains(id, actual);
            }
        }

        [Test]
        public void SalesGetRecent_SingleLocalDay_IncludesFirstAndLastSecondAndExcludesNeighbours()
        {
            SeedBoundarySales();
            var ids = Ids(Dispatch("sales:getRecent", new JObject { { "dateFrom", "2026-03-10" }, { "dateTo", "2026-03-10" } }));
            AssertSameSet(ids, _first, _last);
        }

        [Test]
        public void SalesGetRecent_OnlyStartOnlyEndAndSwappedRange()
        {
            SeedBoundarySales();
            AssertSameSet(Ids(Dispatch("sales:getRecent", new JObject { { "dateFrom", "2026-03-10" } })), _first, _last, _after);
            AssertSameSet(Ids(Dispatch("sales:getRecent", new JObject { { "dateTo", "2026-03-10" } })), _before, _first, _last);
            AssertSameSet(Ids(Dispatch("sales:getRecent", new JObject { { "dateFrom", "2026-03-11" }, { "dateTo", "2026-03-10" } })), _first, _last, _after);
        }

        [Test]
        public void SalesGetRecent_InvalidDateIsIgnoredNotInjected()
        {
            SeedBoundarySales();
            var ids = Ids(Dispatch("sales:getRecent", new JObject { { "dateFrom", "x'; DROP TABLE sales;--" }, { "dateTo", "not-a-date" } }));
            AssertSameSet(ids, _before, _first, _last, _after);
            Assert.AreEqual(4, Scalar("SELECT COUNT(*) FROM sales;"));
        }

        [Test]
        public void SalesGetRecent_WithoutPayloadKeepsOldBehaviourAndHonoursLimit()
        {
            SeedBoundarySales();
            var all = Ids(Dispatch("sales:getRecent", null));
            Assert.AreEqual(4, all.Count, "بدون فلتر: أحدث فواتير (حتى 20) كما كان");
            Assert.AreEqual(_after, all[0], "الأحدث أولاً");
            Assert.AreEqual(2, Ids(Dispatch("sales:getRecent", new JObject { { "limit", 2 } })).Count);
        }

        [Test]
        public void SalesGetRecent_PeriodIsAppliedBeforeTheLimit_SoOlderMatchesAreNotHidden()
        {
            SeedBoundarySales();
            // limit 1 would return only the newest invoice (03-11); the period must still find the 03-09 one
            var ids = Ids(Dispatch("sales:getRecent", new JObject { { "limit", 1 }, { "dateFrom", "2026-03-09" }, { "dateTo", "2026-03-09" } }));
            AssertSameSet(ids, _before);
        }

        [Test]
        public void SalesGetRecent_StatusFilter_RefundedIncludesPartialRefunds()
        {
            SeedBoundarySales();
            Execute("UPDATE sales SET status = 'partially_refunded' WHERE id = @id;", "@id", _last);
            Execute("UPDATE sales SET status = 'cancelled' WHERE id = @id;", "@id", _first);
            AssertSameSet(Ids(Dispatch("sales:getRecent", new JObject { { "status", "refunded" } })), _last);
            AssertSameSet(Ids(Dispatch("sales:getRecent", new JObject { { "status", "cancelled" }, { "dateFrom", "2026-03-10" }, { "dateTo", "2026-03-10" } })), _first);
            AssertSameSet(Ids(Dispatch("sales:getRecent", new JObject { { "status", "all" } })), _before, _first, _last, _after);
        }

        [Test]
        public void SalesSearch_UsesTheLocalDayNotTheUtcDay()
        {
            SeedBoundarySales();
            var ids = Ids(Dispatch("sales:search", new JObject { { "dateFrom", "2026-03-10" }, { "dateTo", "2026-03-10" } }));
            AssertSameSet(ids, _first, _last);
        }

        private static DailyClosing MakeClosing(int number, string businessDate)
        {
            return new DailyClosing
            {
                Id = "closing_s61_" + number,
                ClosingNumber = number,
                BusinessDate = businessDate,
                ClosedAt = LocalIso(2026, 1, 1, 12, 0, 0),
                CashierId = AdminId,
                CashierName = "مدير النظام"
            };
        }

        private static void InsertClosing(DailyClosing closing)
        {
            using (var conn = new SQLiteConnection(DatabaseService.ConnectionString))
            {
                conn.Open();
                DatabaseService.DailyClosingRepo.Insert(closing, conn, null);
            }
        }

        private static List<string> BusinessDates(BridgeResponse res)
        {
            Assert.IsTrue(res.Success, Describe(res));
            var dates = new List<string>();
            foreach (JToken row in JArray.FromObject(res.Data))
            {
                dates.Add(row["businessDate"].ToString());
            }
            return dates;
        }

        [Test]
        public void ClosingHistory_PeriodFiltersBusinessDaysInclusively_BeforeTheDefaultCapOf30()
        {
            for (int i = 0; i < 35; i++)
            {
                InsertClosing(MakeClosing(i + 1, new DateTime(2026, 1, 1).AddDays(i).ToString("yyyy-MM-dd")));
            }

            var latest = BusinessDates(Dispatch("closing:getHistory", null));
            Assert.AreEqual(30, latest.Count, "بدون فترة: آخر 30 إقفال كما كان");
            Assert.AreEqual("2026-02-04", latest[0]);

            var oldest = BusinessDates(Dispatch("closing:getHistory", new JObject { { "limit", 400 }, { "dateFrom", "2026-01-01" }, { "dateTo", "2026-01-03" } }));
            CollectionAssert.AreEqual(new string[] { "2026-01-03", "2026-01-02", "2026-01-01" }, oldest, "الإقفالات الأقدم من آخر 30 تظهر عند تحديد فترتها");

            var swapped = BusinessDates(Dispatch("closing:getHistory", new JObject { { "dateFrom", "2026-01-03" }, { "dateTo", "2026-01-01" } }));
            CollectionAssert.AreEqual(oldest, swapped);

            var onlyEnd = BusinessDates(Dispatch("closing:getHistory", new JObject { { "dateTo", "2026-01-02" } }));
            CollectionAssert.AreEqual(new string[] { "2026-01-02", "2026-01-01" }, onlyEnd);

            var invalid = BusinessDates(Dispatch("closing:getHistory", new JObject { { "dateFrom", "garbage" } }));
            Assert.AreEqual(30, invalid.Count, "تاريخ غير صالح يُهمل");
        }

        [Test]
        public void BackupList_PeriodFiltersFileCreationDayBeforeTheCapOf15()
        {
            string folder = Path.Combine(Path.GetTempPath(), "rafiq_s61_backups_" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(folder);
            try
            {
                DatabaseService.SettingsRepo.Set("backup_target_folder", folder);
                for (int i = 0; i < 20; i++)
                {
                    DateTime day = new DateTime(2026, 2, 1).AddDays(i);
                    string path = Path.Combine(folder, "rafiq_backup_" + day.ToString("yyyyMMdd") + "_0230.db");
                    File.WriteAllText(path, "x");
                    File.SetCreationTime(path, new DateTime(day.Year, day.Month, day.Day, 23, 59, 55));
                }

                BackupStatusInfo plain = DatabaseService.Backup.GetStatus();
                Assert.AreEqual(15, plain.RecentBackups.Count, "بدون فترة: أحدث 15 نسخة كما كان");

                BackupStatusInfo oldest = DatabaseService.Backup.GetStatus("2026-02-01", "2026-02-03");
                Assert.AreEqual(3, oldest.RecentBackups.Count, "النسخ الأقدم من أحدث 15 تظهر عند تحديد فترتها، ويوم النهاية شامل حتى 23:59");

                BackupStatusInfo swapped = DatabaseService.Backup.GetStatus("2026-02-03", "2026-02-01");
                Assert.AreEqual(3, swapped.RecentBackups.Count);

                BackupStatusInfo wholeRange = DatabaseService.Backup.GetStatus("2026-02-01", null);
                Assert.AreEqual(20, wholeRange.RecentBackups.Count, "مع فترة يرتفع حد القائمة");
            }
            finally
            {
                try { Directory.Delete(folder, true); } catch (IOException) { } catch (UnauthorizedAccessException) { }
            }
        }
    }
}
