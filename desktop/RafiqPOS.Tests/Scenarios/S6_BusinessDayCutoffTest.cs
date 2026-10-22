using System;
using NUnit.Framework;
using RafiqPOS.Common;

namespace RafiqPOS.Tests.Scenarios
{
    [TestFixture]
    public class S6_BusinessDayCutoffTest : TestBase
    {
        [Test]
        public void Scenario_S6_Business_Day_Cutoff_Correctly_Groups_Night_Transactions()
        {
            // 1. Arrange: ضبط ساعة الإغلاق الليلية على 04:00 فجراً (Cutoff = 4)
            int cutoffHour = 4;
            SettingsRepo.Set("business_day_cutoff_hour", "4");

            // 2. حركة قبل منتصف الليل: 2026-10-21 الساعة 23:30 (11:30 مساءً)
            var timeBeforeMidnight = new DateTime(2026, 10, 21, 23, 30, 0);
            var businessDate1 = TimeGuard.GetBusinessDate(timeBeforeMidnight, cutoffHour);

            // 3. حركة بعد منتصف الليل ولكن قبل الفجر: 2026-10-22 الساعة 01:30 (1:30 صباحاً)
            var timeAfterMidnightBeforeCutoff = new DateTime(2026, 10, 22, 1, 30, 0);
            var businessDate2 = TimeGuard.GetBusinessDate(timeAfterMidnightBeforeCutoff, cutoffHour);

            // 4. حركة صباحية بعد موعد الـ Cutoff: 2026-10-22 الساعة 05:00 صباحاً
            var timeAfterCutoff = new DateTime(2026, 10, 22, 5, 0, 0);
            var businessDate3 = TimeGuard.GetBusinessDate(timeAfterCutoff, cutoffHour);

            // 5. Assert:
            // حركتي 23:30 و 01:30 تتبعان نفس يوم العمل (2026-10-21)
            Assert.AreEqual("2026-10-21", businessDate1.ToString("yyyy-MM-dd"), "حركة 11:30 مساءً تتبع يوم 21");
            Assert.AreEqual("2026-10-21", businessDate2.ToString("yyyy-MM-dd"), "حركة 01:30 صباحاً قبل الـ 04:00 فجراً تتبع نفس يوم العمل 21");
            Assert.AreEqual(businessDate1, businessDate2, "كلا المعاملتين الليلية وما بعد منتصف الليل تنتميان لنفس يوم العمل");

            // حركة 05:00 صباحاً تنتمي ليوم العمل الجديد (2026-10-22)
            Assert.AreEqual("2026-10-22", businessDate3.ToString("yyyy-MM-dd"), "حركة ما بعد الفجر 05:00 تتبع يوم العمل الجديد 22");
            Assert.AreNotEqual(businessDate1, businessDate3, "يوم العمل الجديد يبدأ بعد الساعة 04:00 فجراً");
        }
    }
}
