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
    }
}
