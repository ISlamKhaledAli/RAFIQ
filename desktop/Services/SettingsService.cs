using System.Collections.Generic;
using RafiqPOS.Repositories;

namespace RafiqPOS.Services
{
    public class SettingsService
    {
        private readonly SettingsRepository _repo;

        public SettingsService(SettingsRepository repo)
        {
            this._repo = repo;
        }

        public Dictionary<string, string> GetAllSettings()
        {
            var settings = _repo.GetAll();

            // Populate defaults if missing
            if (!settings.ContainsKey("store_name")) settings["store_name"] = "سوبرماركت رفيق";
            if (!settings.ContainsKey("store_phone")) settings["store_phone"] = "01012345678";
            if (!settings.ContainsKey("store_address")) settings["store_address"] = "فرع أسيوط الرئيسي - ش الجمهورية";
            if (!settings.ContainsKey("tax_number")) settings["tax_number"] = "123-456-789";
            if (!settings.ContainsKey("receipt_header")) settings["receipt_header"] = "أهلاً بكم في سوبرماركت رفيق";
            if (!settings.ContainsKey("receipt_footer")) settings["receipt_footer"] = "شكراً لزيارتكم! البضاعة المباعة ترد وتستبدل خلال 14 يوماً بموجب الفاتورة.";

            return settings;
        }

        public string Get(string key, string defaultValue)
        {
            return _repo.Get(key, defaultValue);
        }

        public void Set(string key, string value)
        {
            _repo.Set(key, value);
        }

        public Dictionary<string, string> SaveSettings(Dictionary<string, string> newSettings)
        {
            _repo.SaveBatch(newSettings);
            return GetAllSettings();
        }

        /// <summary>
        /// استرجاع مفاتيح الميزات وملف تعريف المحل (Feature #105)
        /// </summary>
        public Dictionary<string, bool> GetFeatureFlags()
        {
            var flags = new Dictionary<string, bool>();
            var settings = _repo.GetAll();

            flags["feature_scale_weight"] = GetBool(settings, "feature_scale_weight", true);
            flags["feature_credit_debts"] = GetBool(settings, "feature_credit_debts", true);
            flags["feature_fast_buttons"] = GetBool(settings, "feature_fast_buttons", true);
            flags["feature_taxes"] = GetBool(settings, "feature_taxes", false);
            flags["feature_expiry_dates"] = GetBool(settings, "feature_expiry_dates", false);
            flags["feature_multi_units"] = GetBool(settings, "feature_multi_units", false);

            return flags;
        }

        public void SetFeatureFlag(string key, bool enabled)
        {
            _repo.Set(key, enabled ? "1" : "0");
        }

        private static bool GetBool(Dictionary<string, string> dict, string key, bool defaultValue)
        {
            if (dict.ContainsKey(key))
            {
                string val = dict[key];
                return val == "1" || val.ToLower() == "true";
            }
            return defaultValue;
        }
    }
}
