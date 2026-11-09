using Newtonsoft.Json.Linq;
using NUnit.Framework;
using RafiqPOS.Database;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    /// <summary>
    /// الحركات والانتقالات (ui_motion_enabled) مغلقة افتراضياً، ولا يغيّرها إلا حساب الروت من الخادم (settings:save و settings:updateBatch)،
    /// وإعادة إرسال القيمة نفسها من المدير مقبولة (لا تُكتب)، ويقرؤها الجميع حتى الكاشير عبر settings:getStoreProfile.
    /// قوة الحركة (ui_motion_level) وشكلها (ui_motion_style) بالحماية نفسها: افتراضيان medium وslide، وأي قيمة غير معروفة تعود للافتراضي.
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
        public void Default_WhenNothingIsSaved_IsOff()
        {
            Assert.IsFalse(DatabaseService.Settings.IsUiMotionEnabled());
            Assert.IsFalse(StoreProfileMotion());
            Assert.AreEqual("0", DatabaseService.Settings.GetAllSettings()[SettingsService.UiMotionKey]);
        }

        [Test]
        public void NonRoot_CannotTurnItOn_AndNothingIsSaved()
        {
            var denied = Dispatch("settings:save", new JObject { { "ui_motion_enabled", "1" } });
            Assert.IsFalse(denied.Success, "المدير لا يفعّل الحركات");
            Assert.AreEqual("FORBIDDEN", denied.Error.Code);
            Assert.AreEqual(SettingsService.UiMotionRootOnlyMessage, denied.Error.Message);
            Assert.AreEqual(string.Empty, DatabaseService.SettingsRepo.Get("ui_motion_enabled", ""));

            var batch = Dispatch("settings:updateBatch", new JObject { { "settings", new JObject { { "ui_motion_enabled", "1" } } } });
            Assert.IsFalse(batch.Success);
            Assert.AreEqual(SettingsService.UiMotionRootOnlyMessage, batch.Error.Message);
            Assert.IsFalse(StoreProfileMotion());
        }

        [Test]
        public void NonRoot_CannotTurnItOff_WhenRootEnabledIt()
        {
            LoginAs(RootId);
            DispatchOk("settings:save", new JObject { { "ui_motion_enabled", "1" } });

            LoginAs(AdminId);
            var denied = Dispatch("settings:save", new JObject { { "ui_motion_enabled", "0" } });
            Assert.IsFalse(denied.Success);
            Assert.AreEqual("FORBIDDEN", denied.Error.Code);
            Assert.IsTrue(DatabaseService.Settings.IsUiMotionEnabled(), "بقيت مفعّلة");
        }

        [Test]
        public void NonRoot_ResendingTheSameValue_IsAccepted_AndSavesTheOtherKeys()
        {
            var res = Dispatch("settings:save", new JObject { { "ui_motion_enabled", "0" }, { "store_phone", "0100" } });
            Assert.IsTrue(res.Success, Describe(res));
            Assert.AreEqual("0100", DatabaseService.SettingsRepo.Get("store_phone", ""));
            Assert.AreEqual(string.Empty, DatabaseService.SettingsRepo.Get("ui_motion_enabled", ""), "إعادة القيمة نفسها لا تكتب شيئاً");
        }

        [Test]
        public void Root_TurnsItOn_AndEveryoneCanRead_ThenRootTurnsItOff()
        {
            LoginAs(RootId);
            var on = Dispatch("settings:save", new JObject { { "ui_motion_enabled", "true" } });
            Assert.IsTrue(on.Success, Describe(on));
            Assert.AreEqual("1", DatabaseService.SettingsRepo.Get("ui_motion_enabled", ""), "القيمة تُخزَّن موحّدة 1");
            Assert.IsTrue(StoreProfileMotion());

            LoginAs(CashierId);
            Assert.IsTrue(StoreProfileMotion(), "الكاشير يقرأ الإعداد ليتحرك الواجهة عنده");

            LoginAs(RootId);
            var off = Dispatch("settings:updateBatch", new JObject { { "settings", new JObject { { "ui_motion_enabled", "0" } } } });
            Assert.IsTrue(off.Success, Describe(off));
            Assert.IsFalse(StoreProfileMotion());
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
        public void LevelAndStyle_Defaults_AreMediumAndSlide_ForEveryone()
        {
            Assert.AreEqual("medium", DatabaseService.Settings.GetUiMotionLevel());
            Assert.AreEqual("slide", DatabaseService.Settings.GetUiMotionStyle());
            Assert.AreEqual("medium", StoreProfileText("uiMotionLevel"));
            Assert.AreEqual("slide", StoreProfileText("uiMotionStyle"));
            var all = DatabaseService.Settings.GetAllSettings();
            Assert.AreEqual("medium", all[SettingsService.UiMotionLevelKey]);
            Assert.AreEqual("slide", all[SettingsService.UiMotionStyleKey]);
        }

        [Test]
        public void NonRoot_CannotChangeLevelOrStyle_AndNothingIsSaved()
        {
            var level = Dispatch("settings:save", new JObject { { "ui_motion_level", "strong" } });
            Assert.IsFalse(level.Success, "المدير لا يغيّر قوة الحركة");
            Assert.AreEqual("FORBIDDEN", level.Error.Code);
            Assert.AreEqual(SettingsService.UiMotionLookRootOnlyMessage, level.Error.Message);
            Assert.AreEqual(string.Empty, DatabaseService.SettingsRepo.Get("ui_motion_level", ""));

            var style = Dispatch("settings:updateBatch", new JObject { { "settings", new JObject { { "ui_motion_style", "zoom" } } } });
            Assert.IsFalse(style.Success, "المدير لا يغيّر شكل الحركة");
            Assert.AreEqual(SettingsService.UiMotionLookRootOnlyMessage, style.Error.Message);
            Assert.AreEqual(string.Empty, DatabaseService.SettingsRepo.Get("ui_motion_style", ""));
            Assert.AreEqual("medium", StoreProfileText("uiMotionLevel"));
            Assert.AreEqual("slide", StoreProfileText("uiMotionStyle"));
        }

        [Test]
        public void NonRoot_ResendingTheCurrentLevelAndStyle_IsAccepted_AndWritesNothing()
        {
            var res = Dispatch("settings:save", new JObject
            {
                { "ui_motion_level", "MEDIUM" }, { "ui_motion_style", "slide" }, { "store_phone", "0111" }
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
            DispatchOk("settings:save", new JObject { { "ui_motion_level", "strong" }, { "ui_motion_style", "fade" } });

            LoginAs(AdminId);
            var denied = Dispatch("settings:save", new JObject { { "ui_motion_level", "medium" } });
            Assert.IsFalse(denied.Success);
            Assert.AreEqual(SettingsService.UiMotionLookRootOnlyMessage, denied.Error.Message);
            Assert.AreEqual("strong", DatabaseService.Settings.GetUiMotionLevel());

            var same = Dispatch("settings:save", new JObject { { "ui_motion_level", "strong" }, { "ui_motion_style", "fade" } });
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
            Assert.AreEqual("medium", DatabaseService.SettingsRepo.Get("ui_motion_level", ""));
            Assert.AreEqual("slide", DatabaseService.SettingsRepo.Get("ui_motion_style", ""));
        }

        [Test]
        public void NormalizeLevelAndStyle_KnownValuesOnly()
        {
            Assert.AreEqual("soft", SettingsService.NormalizeUiMotionLevel(" SOFT "));
            Assert.AreEqual("strong", SettingsService.NormalizeUiMotionLevel("strong"));
            Assert.AreEqual("medium", SettingsService.NormalizeUiMotionLevel("high"));
            Assert.AreEqual("medium", SettingsService.NormalizeUiMotionLevel(null));
            Assert.AreEqual("fade", SettingsService.NormalizeUiMotionStyle("Fade"));
            Assert.AreEqual("zoom", SettingsService.NormalizeUiMotionStyle("zoom"));
            Assert.AreEqual("slide", SettingsService.NormalizeUiMotionStyle("flip"));
            Assert.AreEqual("slide", SettingsService.NormalizeUiMotionStyle(""));
            Assert.IsTrue(SettingsService.IsUiMotionSettingKey("ui_motion_level"));
            Assert.IsTrue(SettingsService.IsUiMotionSettingKey("ui_motion_style"));
            Assert.IsFalse(SettingsService.IsUiMotionSettingKey("ui_motion"));
        }
    }
}
