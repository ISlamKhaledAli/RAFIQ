using System;
using System.Data.SQLite;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    /// <summary>
    /// نطاق التاريخ في SQL لسجلات المحافظ وماكينات الدفع وتقارير الفترات:
    /// يوم محلي شامل الطرفين على طوابع UTC، نطاق معكوس يُقلب، طرف واحد يعمل، النطاق يسبق حد الصفوف،
    /// ومجاميع الفترة تُحسب في قاعدة البيانات، ونوافذ التقارير المتحركة (أسبوع 7، شهر 30، 3 أشهر 90، سنة 365 يوماً) شاملة اليوم.
    /// </summary>
    [TestFixture]
    [NonParallelizable]
    public class S63_WalletsEpayReportsDateRangeTest : S30_Step3BFixtureBase
    {
        // A fixed mid-year day: no DST switch happens at local midnight around it
        private static readonly DateTime Day = new DateTime(2026, 6, 15);

        private static string LocalToUtcIso(int dayOffset, int hour, int minute, int second)
        {
            DateTime local = new DateTime(Day.Year, Day.Month, Day.Day, hour, minute, second, DateTimeKind.Local).AddDays(dayOffset);
            return local.ToUniversalTime().ToString("o");
        }

        private static string DayText(int dayOffset)
        {
            return Day.AddDays(dayOffset).ToString("yyyy-MM-dd");
        }

        private static void Exec(string sql, params object[] nameValuePairs)
        {
            using (var conn = new SQLiteConnection(DatabaseService.ConnectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    for (int i = 0; i + 1 < nameValuePairs.Length; i += 2)
                    {
                        cmd.Parameters.AddWithValue((string)nameValuePairs[i], nameValuePairs[i + 1]);
                    }
                    cmd.ExecuteNonQuery();
                }
            }
        }

        // ---------- wallets ----------

        private static string NewAccountId()
        {
            var acc = DatabaseService.DigitalAccounts.SaveAccount(new DigitalAccount
            {
                Name = "محفظة اختبار النطاق",
                Type = "wallet",
                Provider = "vodafone_cash",
                PhoneNumber = "01011112222",
                BalancePiasters = 0,
                IsActive = true
            });
            return acc.Id;
        }

        private static void AddWalletTx(string accountId, string createdAtUtc, long amountPiasters, long profitPiasters, string status)
        {
            Exec(@"INSERT INTO digital_transactions (id, account_id, tx_type, amount_piasters, profit_piasters, total_collected_piasters, status, created_at)
                   VALUES (@id, @acc, 'cash_out', @amt, @profit, @amt, @status, @at);",
                "@id", Guid.NewGuid().ToString("N"), "@acc", accountId, "@amt", amountPiasters,
                "@profit", profitPiasters, "@status", status, "@at", createdAtUtc);
        }

        private static JArray WalletTxs(JObject payload)
        {
            return JArray.FromObject(DispatchOk("wallets:getTransactions", payload).Data);
        }

        private static JObject WalletRange(string dateFrom, string dateTo)
        {
            var payload = new JObject { { "limit", 1000 } };
            if (dateFrom != null) payload["dateFrom"] = dateFrom;
            if (dateTo != null) payload["dateTo"] = dateTo;
            return payload;
        }

        private string SeedWalletBoundaries()
        {
            string acc = NewAccountId();
            AddWalletTx(acc, LocalToUtcIso(-1, 23, 59, 59), 1000, 10, "completed");
            AddWalletTx(acc, LocalToUtcIso(0, 0, 0, 0), 2000, 20, "completed");
            AddWalletTx(acc, LocalToUtcIso(0, 23, 59, 59), 3000, 30, "completed");
            AddWalletTx(acc, LocalToUtcIso(1, 0, 0, 0), 4000, 40, "completed");
            return acc;
        }

        [Test]
        public void WalletTransactions_SingleLocalDay_IncludesFirstAndLastSecondOnly()
        {
            SeedWalletBoundaries();
            var rows = WalletTxs(WalletRange(DayText(0), DayText(0)));
            Assert.AreEqual(2, rows.Count, "00:00:00 و23:59:59 من اليوم المحلي داخل النطاق وما قبلهما وبعدهما خارجه");
        }

        [Test]
        public void WalletTransactions_SwappedAndOpenEndedRanges()
        {
            SeedWalletBoundaries();
            Assert.AreEqual(3, WalletTxs(WalletRange(DayText(0), DayText(-1))).Count, "النطاق المعكوس يُقلب");
            Assert.AreEqual(3, WalletTxs(WalletRange(DayText(0), null)).Count, "بداية فقط");
            Assert.AreEqual(3, WalletTxs(WalletRange(null, DayText(0))).Count, "نهاية فقط");
            Assert.AreEqual(4, WalletTxs(WalletRange(null, null)).Count, "بدون نطاق = كل العمليات");
        }

        [Test]
        public void WalletTransactions_RangeIsAppliedBeforeTheRowCap()
        {
            string acc = NewAccountId();
            // 250 old rows on an old day, then 5 newer rows: a plain "latest 200" load would never reach the old day
            for (int i = 0; i < 250; i++) AddWalletTx(acc, LocalToUtcIso(-30, 10, 0, 0), 100, 1, "completed");
            for (int i = 0; i < 5; i++) AddWalletTx(acc, LocalToUtcIso(0, 10, 0, 0), 100, 1, "completed");

            Assert.AreEqual(200, WalletTxs(new JObject()).Count, "الافتراضي بدون نطاق يبقى آخر 200");
            Assert.AreEqual(250, WalletTxs(WalletRange(DayText(-30), DayText(-30))).Count, "نطاق اليوم القديم يجلب كل صفوفه");
        }

        [Test]
        public void WalletTransactions_AccountAndTypeFiltersCombineWithTheRange()
        {
            string accA = NewAccountId();
            string accB = DatabaseService.DigitalAccounts.SaveAccount(new DigitalAccount
            {
                Name = "حساب ثان", Type = "wallet", Provider = "orange_cash", PhoneNumber = "01022223333", BalancePiasters = 0, IsActive = true
            }).Id;
            AddWalletTx(accA, LocalToUtcIso(0, 9, 0, 0), 100, 1, "completed");
            AddWalletTx(accB, LocalToUtcIso(0, 9, 0, 0), 100, 1, "completed");
            AddWalletTx(accA, LocalToUtcIso(-5, 9, 0, 0), 100, 1, "completed");

            var payload = WalletRange(DayText(0), DayText(0));
            payload["accountId"] = accA;
            Assert.AreEqual(1, WalletTxs(payload).Count);
        }

        [Test]
        public void WalletAnalytics_PeriodTotalsCoverAllCompletedRowsInTheRange()
        {
            string acc = NewAccountId();
            for (int i = 0; i < 250; i++) AddWalletTx(acc, LocalToUtcIso(0, 10, 0, 0), 100, 2, "completed");
            AddWalletTx(acc, LocalToUtcIso(0, 11, 0, 0), 5000, 500, "cancelled");
            AddWalletTx(acc, LocalToUtcIso(-3, 10, 0, 0), 700, 7, "completed");

            var day = Data(DispatchOk("wallets:getAnalytics", new JObject { { "dateFrom", DayText(0) }, { "dateTo", DayText(0) } }));
            Assert.AreEqual(250, (int)day["periodTransactionsCount"], "المجاميع تتجاوز حد 200 صف وتستبعد الملغاة");
            Assert.AreEqual(500, (long)day["periodProfitPiasters"]);
            Assert.AreEqual(25000, (long)day["periodVolumePiasters"]);

            var all = Data(DispatchOk("wallets:getAnalytics", new JObject()));
            Assert.AreEqual(251, (int)all["periodTransactionsCount"], "بدون نطاق = كل العمليات المكتملة");
            Assert.AreEqual(507, (long)all["totalProfitPiasters"]);
        }

        // ---------- e-pay ----------

        private static string NewTerminalId()
        {
            var res = DispatchOk("epay:saveTerminal", new JObject
            {
                { "name", "ماكينة اختبار النطاق" },
                { "provider", "fawry" },
                { "balancePiasters", 0 },
                { "isActive", true }
            });
            return (string)Data(res)["id"];
        }

        private static void AddEpayTx(string terminalId, string createdAtUtc, string serviceType, long billPiasters, long profitPiasters, string status)
        {
            Exec(@"INSERT INTO epay_transactions (id, terminal_id, service_type, service_name, bill_amount_piasters, customer_fee_piasters,
                       total_received_piasters, machine_deducted_piasters, provider_commission_piasters, net_profit_piasters, payment_channel, status, created_at)
                   VALUES (@id, @t, @svc, 'خدمة', @bill, 0, @bill, @bill, 0, @profit, 'cash_drawer', @status, @at);",
                "@id", Guid.NewGuid().ToString("N"), "@t", terminalId, "@svc", serviceType, "@bill", billPiasters,
                "@profit", profitPiasters, "@status", status, "@at", createdAtUtc);
        }

        private static JArray EpayTxs(string fromDate, string toDate)
        {
            var payload = new JObject { { "limit", 1000 } };
            if (fromDate != null) payload["fromDate"] = fromDate;
            if (toDate != null) payload["toDate"] = toDate;
            return JArray.FromObject(DispatchOk("epay:getTransactions", payload).Data);
        }

        private string SeedEpayBoundaries()
        {
            string term = NewTerminalId();
            AddEpayTx(term, LocalToUtcIso(-1, 23, 59, 59), "mobile_recharge", 1000, 10, "completed");
            AddEpayTx(term, LocalToUtcIso(0, 0, 0, 0), "mobile_recharge", 2000, 20, "completed");
            AddEpayTx(term, LocalToUtcIso(0, 23, 59, 59), "utility_bill", 3000, 30, "completed");
            AddEpayTx(term, LocalToUtcIso(1, 0, 0, 0), "mobile_recharge", 4000, 40, "completed");
            return term;
        }

        [Test]
        public void EpayTransactions_SingleLocalDay_AndSwappedAndOpenEndedRanges()
        {
            SeedEpayBoundaries();
            Assert.AreEqual(2, EpayTxs(DayText(0), DayText(0)).Count);
            Assert.AreEqual(3, EpayTxs(DayText(0), DayText(-1)).Count, "النطاق المعكوس يُقلب");
            Assert.AreEqual(3, EpayTxs(DayText(0), null).Count);
            Assert.AreEqual(3, EpayTxs(null, DayText(0)).Count);
            Assert.AreEqual(4, EpayTxs(null, null).Count);
        }

        [Test]
        public void EpayAnalytics_IncludesTheWholeEndDay_AndBreaksDownByService()
        {
            SeedEpayBoundaries();
            var day = Data(DispatchOk("epay:getAnalytics", new JObject { { "fromDate", DayText(0) }, { "toDate", DayText(0) } }));
            Assert.AreEqual(2, (int)day["totalTransactionsCount"], "اليوم الأخير كاملاً (كان toDate يُقارن بلا وقت فيُسقط اليوم)");
            Assert.AreEqual(50, (long)day["totalNetProfitPiasters"]);
            Assert.AreEqual(5000, (long)day["totalBillVolumePiasters"]);
            Assert.AreEqual(2000, (long)day["volumeByTypePiasters"]["mobile_recharge"]);
            Assert.AreEqual(3000, (long)day["volumeByTypePiasters"]["utility_bill"]);
            Assert.AreEqual(1, (int)day["transactionsByType"]["utility_bill"]);
        }

        [Test]
        public void EpayFundings_RangeAppliesToTheFundingsList()
        {
            string term = NewTerminalId();
            Exec(@"INSERT INTO epay_terminal_fundings (id, terminal_id, amount_piasters, funding_source, previous_balance_piasters, new_balance_piasters, created_at)
                   VALUES (@a, @t, 100, 'cash_drawer', 0, 100, @d1), (@b, @t, 200, 'cash_drawer', 100, 300, @d2);",
                "@a", Guid.NewGuid().ToString("N"), "@b", Guid.NewGuid().ToString("N"), "@t", term,
                "@d1", LocalToUtcIso(-1, 23, 59, 59), "@d2", LocalToUtcIso(0, 0, 0, 0));

            var res = DispatchOk("epay:getFundings", new JObject { { "fromDate", DayText(0) }, { "toDate", DayText(0) }, { "limit", 100 } });
            Assert.AreEqual(1, JArray.FromObject(res.Data).Count);
        }

        [Test]
        public void InvalidDate_IsRejectedInsteadOfSilentlyIgnored()
        {
            var res = Dispatch("wallets:getTransactions", new JObject { { "dateFrom", "not-a-date" } });
            Assert.IsFalse(res.Success);
        }

        // ---------- report periods ----------

        private static void AddSale(int seq, DateTime localMoment, long totalPiasters)
        {
            Exec(@"INSERT INTO sales (id, invoice_number, subtotal_piasters, total_piasters, paid_piasters, payment_method, status, created_at)
                   VALUES (@id, @inv, @t, @t, @t, 'cash', 'completed', @at);",
                "@id", "s63_" + seq, "@inv", 960000 + seq, "@t", totalPiasters,
                "@at", localMoment.ToUniversalTime().ToString("o"));
        }

        private static int InvoicesIn(string period)
        {
            return DatabaseService.Reports.GetPeriodSalesReport(period, null, null).InvoicesCount;
        }

        [Test]
        public void RollingPeriods_AreExactlyNDaysIncludingToday()
        {
            DateTime noon = DateTime.Now.Date.AddHours(12);
            int seq = 0;
            // one sale on the oldest included day and one on the first excluded day of each window
            int[] windows = new int[] { 7, 30, 90, 365 };
            foreach (int n in windows)
            {
                AddSale(++seq, noon.AddDays(-(n - 1)), 100);
                AddSale(++seq, noon.AddDays(-n), 100);
            }

            // week: -6 only (7 days); month adds -29; 3months adds -89; year adds -364. Each earlier "first excluded" day sits inside the next window.
            Assert.AreEqual(1, InvoicesIn("week"), "آخر 7 أيام = اليوم و6 أيام قبله");
            Assert.AreEqual(3, InvoicesIn("month"), "30 يوماً: بداية الأسبوع + نهايته + بداية الشهر");
            Assert.AreEqual(5, InvoicesIn("3months"), "90 يوماً");
            Assert.AreEqual(7, InvoicesIn("year"), "365 يوماً: التقرير الرئيسي لم يكن يدعم 3months/year (كان يعرض اليوم فقط)");
        }

        [Test]
        public void CustomPeriod_SwappedRangeReturnsTheSameAsOrderedRange()
        {
            DateTime noon = DateTime.Now.Date.AddHours(12);
            AddSale(1, noon.AddDays(-2), 100);
            AddSale(2, noon.AddDays(-10), 100);
            string from = noon.AddDays(-3).ToString("yyyy-MM-dd");
            string to = noon.ToString("yyyy-MM-dd");

            int ordered = DatabaseService.Reports.GetPeriodSalesReport("custom", from, to).InvoicesCount;
            int swapped = DatabaseService.Reports.GetPeriodSalesReport("custom", to, from).InvoicesCount;
            Assert.AreEqual(1, ordered);
            Assert.AreEqual(ordered, swapped);
        }

        [Test]
        public void PeriodComparison_SupportsCustomAndLongPeriods()
        {
            DateTime noon = DateTime.Now.Date.AddHours(12);
            AddSale(1, noon.AddDays(-1), 300);
            AddSale(2, noon.AddDays(-5), 200);
            string from = noon.AddDays(-2).ToString("yyyy-MM-dd");
            string to = noon.ToString("yyyy-MM-dd");

            var custom = DatabaseService.Reports.GetPeriodComparison("custom", from, to);
            Assert.AreEqual("الفترة المحددة", custom.CurrentPeriodName);
            Assert.AreEqual("الفترة السابقة المماثلة", custom.PreviousPeriodName);

            var quarter = DatabaseService.Reports.GetPeriodComparison("3months");
            Assert.AreEqual("الـ 90 يوماً السابقة", quarter.PreviousPeriodName);
        }
    }
}
