using System;
using System.Linq;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    /// <summary>
    /// دفتر قيد أدوية الجدول: نطاق التاريخ يُطبق في SQL بتوقيت اليوم المحلي (شامل الطرفين)
    /// على الطوابع المخزنة UTC، والنطاق المعكوس يُقلب، وغياب النطاق يعيد كل الحركات.
    /// </summary>
    [TestFixture]
    [NonParallelizable]
    public class S63_PharmaRegisterDateRangeTest : S30_Step3BFixtureBase
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

        private static Product SeedRegister()
        {
            var drug = CreateProduct("ترامادول 50 مجم", 300, 200, 100000);
            // quantity (milli) per local moment: before the day, first/last second of the day, after the day
            AddDispense(drug.Id, LocalToUtcIso(-1, 23, 59, 59), 1000);
            AddDispense(drug.Id, LocalToUtcIso(0, 0, 0, 0), 2000);
            AddDispense(drug.Id, LocalToUtcIso(0, 23, 59, 59), 3000);
            AddDispense(drug.Id, LocalToUtcIso(1, 0, 0, 0), 4000);
            return drug;
        }

        private static void AddDispense(string productId, string createdAtUtc, long quantityMilli)
        {
            DatabaseService.ControlledDrugRepo.InsertDispense(new ControlledDrugDispense
            {
                ProductId = productId,
                QuantityMilli = quantityMilli,
                PatientName = "مريض اختبار",
                DoctorName = "د. اختبار",
                PrescriptionNo = "RX-" + quantityMilli,
                PrescriptionDate = DayText(0),
                EntryType = "dispense",
                DispensedBy = AdminId,
                CreatedAt = createdAtUtc
            });
        }

        private static JArray Register(string productId, string dateFrom, string dateTo)
        {
            var payload = new JObject { { "productId", productId } };
            if (dateFrom != null) payload["dateFrom"] = dateFrom;
            if (dateTo != null) payload["dateTo"] = dateTo;
            var res = DispatchOk("pharma:getControlledInspectionRegister", payload);
            return JArray.FromObject(res.Data);
        }

        private static long[] Outflows(JArray rows)
        {
            return rows.Where(r => (string)r["transactionType"] != "opening_balance")
                       .Select(r => (long)r["outflowQtyMilli"]).ToArray();
        }

        private static long OpeningBalance(JArray rows)
        {
            return (long)rows.First(r => (string)r["transactionType"] == "opening_balance")["runningBalanceMilli"];
        }

        [Test]
        public void Register_SingleLocalDay_IsInclusiveOnBothEnds_AndCarriesOpeningBalance()
        {
            var drug = SeedRegister();
            var rows = Register(drug.Id, DayText(0), DayText(0));

            CollectionAssert.AreEqual(new long[] { 2000, 3000 }, Outflows(rows), "أول وآخر ثانية في اليوم المحلي داخل النطاق وما قبلها وبعدها خارجه");
            Assert.AreEqual(-1000, OpeningBalance(rows), "قيد الثانية 23:59:59 من اليوم السابق يدخل في رصيد أول المدة");
            Assert.AreEqual(-6000, (long)rows.Last["runningBalanceMilli"]);
        }

        [Test]
        public void Register_SwappedRange_ReturnsTheSameRowsAsOrderedRange()
        {
            var drug = SeedRegister();
            var ordered = Register(drug.Id, DayText(-1), DayText(0));
            var swapped = Register(drug.Id, DayText(0), DayText(-1));

            CollectionAssert.AreEqual(Outflows(ordered), Outflows(swapped));
            CollectionAssert.AreEqual(new long[] { 1000, 2000, 3000 }, Outflows(swapped));
        }

        [Test]
        public void Register_OpenEndedRanges_WorkWithOnlyFromOrOnlyTo()
        {
            var drug = SeedRegister();

            CollectionAssert.AreEqual(new long[] { 2000, 3000, 4000 }, Outflows(Register(drug.Id, DayText(0), null)));
            CollectionAssert.AreEqual(new long[] { 1000, 2000, 3000 }, Outflows(Register(drug.Id, null, DayText(0))));
        }

        [Test]
        public void Register_WithoutRange_ReturnsEverything_BackwardCompatible()
        {
            var drug = SeedRegister();
            var rows = Register(drug.Id, null, null);

            CollectionAssert.AreEqual(new long[] { 1000, 2000, 3000, 4000 }, Outflows(rows));
            Assert.AreEqual(0, OpeningBalance(rows));
        }

        [Test]
        public void Register_InvalidDate_IsRejected()
        {
            var drug = SeedRegister();
            var res = Dispatch("pharma:getControlledInspectionRegister", new JObject
            {
                { "productId", drug.Id },
                { "dateFrom", "not-a-date" }
            });
            Assert.IsFalse(res.Success, "تاريخ غير صالح لا يجوز أن يُتجاهل بصمت");
        }

        [Test]
        public void Dispenses_FilteredByLocalDay_AndUnfilteredWhenAbsent()
        {
            var drug = SeedRegister();

            var day = DispatchOk("pharma:getControlledDispenses", new JObject
            {
                { "productId", drug.Id }, { "dateFrom", DayText(0) }, { "dateTo", DayText(0) }
            });
            Assert.AreEqual(2, JArray.FromObject(day.Data).Count);

            var all = DispatchOk("pharma:getControlledDispenses", new JObject { { "productId", drug.Id } });
            Assert.AreEqual(4, JArray.FromObject(all.Data).Count);
        }
    }
}
