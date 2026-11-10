using Newtonsoft.Json.Linq;
using NUnit.Framework;
using RafiqPOS.Common;
using RafiqPOS.Database;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    /// <summary>
    /// الحركات والانتقالات (ui_motion_enabled) مفعّلة افتراضياً بنمط تلاشي (fade)،
    /// وقوة الحركة (ui_motion_level) تُكتشف وتُضبط تلقائياً حسب فئة عتاد الجهاز (ضعيف أو متوسط أو قوي).
    /// ولا يغيّر هذه الإعدادات إلا حساب الروت من الخادم (settings:save و settings:updateBatch)،
    /// ويقرؤها الجميع حتى الكاشير عبر settings:getStoreProfile مع تفاصيل فئة أداء الجهاز.
    /// </summary>
    [TestFixture]
    [NonParallelizable]
    public class S67_UiMotionRootOnlyTest : S30_Step3BFixtureBase
    {
        private const string RootId = "usr_root_developer";

        private static bool StoreProfileMotion()
        {
            JObject data = Data(DispatchOk("settings:getStoreProfile", null));
            return data["uiMotionEnabled"].Value<bool>();
        }

        private static string StoreProfileText(string field)
        {
            return Data(DispatchOk("settings:getStoreProfile", null))[field].Value<string>();
        }

        [Test]
        public void Default_WhenNothingIsSaved_IsOn()
        {
            Assert.IsTrue(DatabaseService.Settings.IsUiMotionEnabled());
            Assert.IsTrue(StoreProfileMotion());
            Assert.AreEqual("1", DatabaseService.Settings.GetAllSettings()[SettingsService.UiMotionKey]);
        }

        [Test]
        public void NonRoot_CannotTurnItOff_WhenItIsOnByDefault()
        {
            var denied = Dispatch("settings:save", new JObject { { "ui_motion_enabled", "0" } });
            Assert.IsFalse(denied.Success, "المدير لا يغلق الحركات المفعّلة افتراضياً");
            Assert.AreEqual("FORBIDDEN", denied.Error.Code);
            Assert.AreEqual(SettingsService.UiMotionRootOnlyMessage, denied.Error.Message);
            Assert.AreEqual(string.Empty, DatabaseService.SettingsRepo.Get("ui_motion_enabled", ""));

            var batch = Dispatch("settings:updateBatch", new JObject { { "settings", new JObject { { "ui_motion_enabled", "0" } } } });
            Assert.IsFalse(batch.Success);
            Assert.AreEqual(SettingsService.UiMotionRootOnlyMessage, batch.Error.Message);
            Assert.IsTrue(StoreProfileMotion());
        }

        [Test]
        public void NonRoot_CannotTurnItOn_WhenRootTurnedItOff()
        {
            LoginAs(RootId);
            DispatchOk("settings:save", new JObject { { "ui_motion_enabled", "0" } });

            LoginAs(AdminId);
            var denied = Dispatch("settings:save", new JObject { { "ui_motion_enabled", "1" } });
            Assert.IsFalse(denied.Success);
            Assert.AreEqual("FORBIDDEN", denied.Error.Code);
            Assert.IsFalse(DatabaseService.Settings.IsUiMotionEnabled(), "بقيت مغلقة");
        }

        [Test]
        public void NonRoot_ResendingTheSameValue_IsAccepted_AndSavesTheOtherKeys()
        {
            var res = Dispatch("settings:save", new JObject { { "ui_motion_enabled", "1" }, { "store_phone", "0100" } });
            Assert.IsTrue(res.Success, Describe(res));
            Assert.AreEqual("0100", DatabaseService.SettingsRepo.Get("store_phone", ""));
            Assert.AreEqual(string.Empty, DatabaseService.SettingsRepo.Get("ui_motion_enabled", ""), "إعادة القيمة نفسها لا تكتب شيئاً");
        }

        [Test]
        public void Root_TurnsItOff_AndEveryoneCanRead_ThenRootTurnsItOn()
        {
            LoginAs(RootId);
            var off = Dispatch("settings:save", new JObject { { "ui_motion_enabled", "0" } });
            Assert.IsTrue(off.Success, Describe(off));
            Assert.AreEqual("0", DatabaseService.SettingsRepo.Get("ui_motion_enabled", ""), "القيمة تُخزَّن موحّدة 0");
            Assert.IsFalse(StoreProfileMotion());

            LoginAs(CashierId);
            Assert.IsFalse(StoreProfileMotion(), "الكاشير يقرأ الإعداد المغلق");

            LoginAs(RootId);
            var on = Dispatch("settings:updateBatch", new JObject { { "settings", new JObject { { "ui_motion_enabled", "1" } } } });
            Assert.IsTrue(on.Success, Describe(on));
            Assert.IsTrue(StoreProfileMotion());
        }

        [Test]
        public void Normalize_AcceptsOnlyOneOrTrueAsOn()
        {
            Assert.AreEqual("1", SettingsService.NormalizeUiMotionValue("1"));
            Assert.AreEqual("1", SettingsService.NormalizeUiMotionValue(" TRUE "));
            Assert.AreEqual("0", SettingsService.NormalizeUiMotionValue("yes"));
            Assert.AreEqual("0", SettingsService.NormalizeUiMotionValue(null));
        }

        [Test]
        public void LevelAndStyle_Defaults_AreDetectedAndFade_ForEveryone()
        {
            string expectedLevel = DeviceTierDetector.DetectMotionLevel();
            Assert.AreEqual(expectedLevel, DatabaseService.Settings.GetUiMotionLevel());
            Assert.AreEqual("fade", DatabaseService.Settings.GetUiMotionStyle());
            Assert.AreEqual(expectedLevel, StoreProfileText("uiMotionLevel"));
            Assert.AreEqual("fade", StoreProfileText("uiMotionStyle"));
            var all = DatabaseService.Settings.GetAllSettings();
            Assert.AreEqual(expectedLevel, all[SettingsService.UiMotionLevelKey]);
            Assert.AreEqual("fade", all[SettingsService.UiMotionStyleKey]);
        }

        [Test]
        public void NonRoot_CannotChangeLevelOrStyle_AndNothingIsSaved()
        {
            string expectedLevel = DeviceTierDetector.DetectMotionLevel();
            string differentLevel = expectedLevel == "strong" ? "soft" : "strong";
            var level = Dispatch("settings:save", new JObject { { "ui_motion_level", differentLevel } });
            Assert.IsFalse(level.Success, "المدير لا يغيّر قوة الحركة");
            Assert.AreEqual("FORBIDDEN", level.Error.Code);
            Assert.AreEqual(SettingsService.UiMotionLookRootOnlyMessage, level.Error.Message);
            Assert.AreEqual(string.Empty, DatabaseService.SettingsRepo.Get("ui_motion_level", ""));

            var style = Dispatch("settings:updateBatch", new JObject { { "settings", new JObject { { "ui_motion_style", "zoom" } } } });
            Assert.IsFalse(style.Success, "المدير لا يغيّر شكل الحركة");
            Assert.AreEqual(SettingsService.UiMotionLookRootOnlyMessage, style.Error.Message);
            Assert.AreEqual(string.Empty, DatabaseService.SettingsRepo.Get("ui_motion_style", ""));
            Assert.AreEqual(expectedLevel, StoreProfileText("uiMotionLevel"));
            Assert.AreEqual("fade", StoreProfileText("uiMotionStyle"));
        }

        [Test]
        public void NonRoot_ResendingTheCurrentLevelAndStyle_IsAccepted_AndWritesNothing()
        {
            string currentLevel = DatabaseService.Settings.GetUiMotionLevel();
            var res = Dispatch("settings:save", new JObject
            {
                { "ui_motion_level", currentLevel.ToUpperInvariant() }, { "ui_motion_style", "FADE" }, { "store_phone", "0111" }
            });
            Assert.IsTrue(res.Success, Describe(res));
            Assert.AreEqual("0111", DatabaseService.SettingsRepo.Get("store_phone", ""));
            Assert.AreEqual(string.Empty, DatabaseService.SettingsRepo.Get("ui_motion_level", ""));
            Assert.AreEqual(string.Empty, DatabaseService.SettingsRepo.Get("ui_motion_style", ""));

            var garbage = Dispatch("settings:save", new JObject { { "ui_motion_level", "banana" } });
            Assert.IsTrue(garbage.Success, "قيمة غير معروفة تُوحَّد للافتراضي الحالي فلا تُعد تغييراً");
            Assert.AreEqual(string.Empty, DatabaseService.SettingsRepo.Get("ui_motion_level", ""));
        }

        [Test]
        public void NonRoot_CannotChangeLevelBack_WhenRootChoseIt()
        {
            LoginAs(RootId);
            DispatchOk("settings:save", new JObject { { "ui_motion_level", "soft" }, { "ui_motion_style", "slide" } });

            LoginAs(AdminId);
            var denied = Dispatch("settings:save", new JObject { { "ui_motion_level", "strong" } });
            Assert.IsFalse(denied.Success);
            Assert.AreEqual(SettingsService.UiMotionLookRootOnlyMessage, denied.Error.Message);
            Assert.AreEqual("soft", DatabaseService.Settings.GetUiMotionLevel());

            var same = Dispatch("settings:save", new JObject { { "ui_motion_level", "soft" }, { "ui_motion_style", "slide" } });
            Assert.IsTrue(same.Success, Describe(same));
        }

        [Test]
        public void Root_ChangesLevelAndStyle_EveryoneReads_InvalidValuesNormaliseToDefaults()
        {
            LoginAs(RootId);
            var ok = Dispatch("settings:save", new JObject { { "ui_motion_level", " Strong " }, { "ui_motion_style", "ZOOM" } });
            Assert.IsTrue(ok.Success, Describe(ok));
            Assert.AreEqual("strong", DatabaseService.SettingsRepo.Get("ui_motion_level", ""), "القيمة تُخزَّن موحّدة");
            Assert.AreEqual("zoom", DatabaseService.SettingsRepo.Get("ui_motion_style", ""));

            LoginAs(CashierId);
            Assert.AreEqual("strong", StoreProfileText("uiMotionLevel"));
            Assert.AreEqual("zoom", StoreProfileText("uiMotionStyle"));

            LoginAs(RootId);
            var bad = Dispatch("settings:save", new JObject { { "ui_motion_level", "extreme" }, { "ui_motion_style", "spin" } });
            Assert.IsTrue(bad.Success, Describe(bad));
            Assert.AreEqual(DeviceTierDetector.DetectMotionLevel(), DatabaseService.SettingsRepo.Get("ui_motion_level", ""));
            Assert.AreEqual("fade", DatabaseService.SettingsRepo.Get("ui_motion_style", ""));
        }

        [Test]
        public void NormalizeLevelAndStyle_KnownValuesOnly()
        {
            Assert.AreEqual("soft", SettingsService.NormalizeUiMotionLevel(" SOFT "));
            Assert.AreEqual("strong", SettingsService.NormalizeUiMotionLevel("strong"));
            Assert.AreEqual("medium", SettingsService.NormalizeUiMotionLevel("medium"));
            Assert.AreEqual(DeviceTierDetector.DetectMotionLevel(), SettingsService.NormalizeUiMotionLevel("high"));
            Assert.AreEqual(DeviceTierDetector.DetectMotionLevel(), SettingsService.NormalizeUiMotionLevel(null));
            Assert.AreEqual("fade", SettingsService.NormalizeUiMotionStyle("Fade"));
            Assert.AreEqual("zoom", SettingsService.NormalizeUiMotionStyle("zoom"));
            Assert.AreEqual("slide", SettingsService.NormalizeUiMotionStyle("slide"));
            Assert.AreEqual("fade", SettingsService.NormalizeUiMotionStyle("flip"));
            Assert.AreEqual("fade", SettingsService.NormalizeUiMotionStyle(""));
            Assert.IsTrue(SettingsService.IsUiMotionSettingKey("ui_motion_level"));
            Assert.IsTrue(SettingsService.IsUiMotionSettingKey("ui_motion_style"));
            Assert.IsFalse(SettingsService.IsUiMotionSettingKey("ui_motion"));
        }

        [Test]
        public void DeviceTierDetector_ClassifiesHardwareAccurately()
        {
            // Weak tier: 32-bit OS
            Assert.AreEqual(DevicePerformanceTier.Weak, DeviceTierDetector.ClassifyTier(8192, 4, false, false));
            // Weak tier: Low RAM (< 3.5GB)
            Assert.AreEqual(DevicePerformanceTier.Weak, DeviceTierDetector.ClassifyTier(2048, 4, true, false));
            // Weak tier: 4GB with <= 2 cores
            Assert.AreEqual(DevicePerformanceTier.Weak, DeviceTierDetector.ClassifyTier(4096, 2, true, false));
            // Weak tier: single core
            Assert.AreEqual(DevicePerformanceTier.Weak, DeviceTierDetector.ClassifyTier(16384, 1, true, false));

            // Medium tier: 4GB with 4 cores
            Assert.AreEqual(DevicePerformanceTier.Medium, DeviceTierDetector.ClassifyTier(4096, 4, true, false));
            // Medium tier: 6GB with 4 cores
            Assert.AreEqual(DevicePerformanceTier.Medium, DeviceTierDetector.ClassifyTier(6144, 4, true, false));
            // Medium tier: Legacy Windows with 8GB RAM
            Assert.AreEqual(DevicePerformanceTier.Medium, DeviceTierDetector.ClassifyTier(8192, 4, true, true));

            // Strong tier: 8GB+ RAM, 4+ cores, 64-bit modern Windows
            Assert.AreEqual(DevicePerformanceTier.Strong, DeviceTierDetector.ClassifyTier(8192, 4, true, false));
            Assert.AreEqual(DevicePerformanceTier.Strong, DeviceTierDetector.ClassifyTier(16384, 8, true, false));

            // Labels and motion levels
            Assert.AreEqual("soft", DeviceTierDetector.TierToMotionLevel(DevicePerformanceTier.Weak));
            Assert.AreEqual("medium", DeviceTierDetector.TierToMotionLevel(DevicePerformanceTier.Medium));
            Assert.AreEqual("strong", DeviceTierDetector.TierToMotionLevel(DevicePerformanceTier.Strong));

            Assert.AreEqual("ضعيف", DeviceTierDetector.GetTierArabicName(DevicePerformanceTier.Weak));
            Assert.AreEqual("متوسط", DeviceTierDetector.GetTierArabicName(DevicePerformanceTier.Medium));
            Assert.AreEqual("قوي", DeviceTierDetector.GetTierArabicName(DevicePerformanceTier.Strong));

            Assert.AreEqual("خفيفة", DeviceTierDetector.GetTierMotionLabel(DevicePerformanceTier.Weak));
            Assert.AreEqual("متوسطة", DeviceTierDetector.GetTierMotionLabel(DevicePerformanceTier.Medium));
            Assert.AreEqual("قوية", DeviceTierDetector.GetTierMotionLabel(DevicePerformanceTier.Strong));
        }

        [Test]
        public void StoreProfile_ExposesHardwareTierAndSummary()
        {
            JObject data = Data(DispatchOk("settings:getStoreProfile", null));
            Assert.IsNotNull(data["deviceHardwareTier"]);
            Assert.IsNotNull(data["deviceHardwareTierArabic"]);
            Assert.IsNotNull(data["deviceHardwareSummary"]);
            Assert.IsNotNull(data["detectedMotionLevel"]);
            Assert.AreEqual(DeviceTierDetector.DetectTier().ToString().ToLowerInvariant(), data["deviceHardwareTier"].Value<string>());
            Assert.AreEqual(DeviceTierDetector.GetTierArabicName(DeviceTierDetector.DetectTier()), data["deviceHardwareTierArabic"].Value<string>());
        }
    }
}
