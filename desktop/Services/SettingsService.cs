using System;
using System.Collections.Generic;
using RafiqPOS.Common;
using RafiqPOS.Repositories;

namespace RafiqPOS.Services
{
    public class SettingsService
    {
        private readonly SettingsRepository _repo;
        private readonly AuditLogRepository _auditRepo;

        public SettingsService(SettingsRepository repo, AuditLogRepository auditRepo = null)
        {
            this._repo = repo;
            this._auditRepo = auditRepo;
        }

        public Dictionary<string, string> GetAllSettings()
        {
            var settings = _repo.GetAll();

            // Populate defaults if missing
            if (!settings.ContainsKey("store_name")) settings["store_name"] = "متجر رفيق";
            if (!settings.ContainsKey("store_phone")) settings["store_phone"] = "";
            if (!settings.ContainsKey("store_address")) settings["store_address"] = "الفرع الرئيسي";
            if (!settings.ContainsKey("tax_number")) settings["tax_number"] = "";
            if (!settings.ContainsKey("cashier_name")) settings["cashier_name"] = "كاشير (1)";
            if (!settings.ContainsKey("receipt_header")) settings["receipt_header"] = "أهلاً بكم في متجرنا";
            if (!settings.ContainsKey("receipt_footer")) settings["receipt_footer"] = "شكراً لزيارتكم! البضاعة المباعة ترد وتستبدل وفقاً لسياسة المتجر.";
            if (!settings.ContainsKey("show_receipt_logo")) settings["show_receipt_logo"] = "1";
            if (!settings.ContainsKey("store_logo_url") || settings["store_logo_url"] == "/logo.png" || settings["store_logo_url"] == "/receipt_logo.png")
            {
                settings["store_logo_url"] = "/receipt_logo_square.png";
            }
            string defaultSig = "نظام رفيق للأنظمة والحلول البرمجية | تطوير: م. إسلام خالد - 01097782965";
            if (!settings.ContainsKey("developer_signature") || 
                string.IsNullOrWhiteSpace(settings["developer_signature"]) ||
                settings["developer_signature"] == "نظام رفيق لإدارة المتاجر ونقاط البيع | تطوير: م. إسلام خالد")
            {
                settings["developer_signature"] = defaultSig;
                _repo.Set("developer_signature", defaultSig);
            }

            return settings;
        }

        public string Get(string key, string defaultValue)
        {
            return _repo.Get(key, defaultValue);
        }

        public void Set(string key, string value, string userId = null)
        {
            string oldVal = _repo.Get(key, "");
            _repo.Set(key, value);

            if (_auditRepo != null && oldVal != (value ?? ""))
            {
                try
                {
                    string actor = !string.IsNullOrEmpty(userId)
                        ? userId
                        : (SecurityService.CurrentUser != null ? SecurityService.CurrentUser.Id : "usr_admin_default");

                    var changes = new List<Dictionary<string, string>>
                    {
                        new Dictionary<string, string> { { "key", key }, { "oldValue", oldVal }, { "newValue", value ?? "" } }
                    };

                    _auditRepo.Log(new Models.AuditLog
                    {
                        UserId = actor,
                        Action = "settings_update",
                        EntityType = "settings",
                        EntityId = key,
                        DetailsJson = Newtonsoft.Json.JsonConvert.SerializeObject(new { changes = changes, count = 1 })
                    });
                }
                catch
                {
                }
            }
        }

        public Dictionary<string, string> SaveSettings(Dictionary<string, string> newSettings, string userId = null)
        {
            if (newSettings == null) return GetAllSettings();

            var oldSettings = _repo.GetAll();
            var changes = new List<Dictionary<string, string>>();

            foreach (var kvp in newSettings)
            {
                string oldVal = oldSettings.ContainsKey(kvp.Key) ? oldSettings[kvp.Key] : "";
                string newVal = kvp.Value ?? "";
                if (oldVal != newVal)
                {
                    var item = new Dictionary<string, string>();
                    item["key"] = kvp.Key;
                    item["oldValue"] = oldVal;
                    item["newValue"] = newVal;
                    changes.Add(item);
                }
            }

            _repo.SaveBatch(newSettings);

            if (_auditRepo != null && changes.Count > 0)
            {
                try
                {
                    string actor = !string.IsNullOrEmpty(userId)
                        ? userId
                        : (SecurityService.CurrentUser != null ? SecurityService.CurrentUser.Id : "usr_admin_default");

                    _auditRepo.Log(new Models.AuditLog
                    {
                        UserId = actor,
                        Action = "settings_update",
                        EntityType = "settings",
                        EntityId = "app_settings",
                        DetailsJson = Newtonsoft.Json.JsonConvert.SerializeObject(new { changes = changes, count = changes.Count })
                    });
                }
                catch
                {
                }
            }

            return GetAllSettings();
        }

        /// <summary>
        /// استرجاع مفاتيح الميزات وملف تعريف المحل من السجل المركزي (Feature #182 / Task 182-1)
        /// </summary>
        public Dictionary<string, bool> GetFeatureFlags()
        {
            var flags = new Dictionary<string, bool>();
            var settings = _repo.GetAll();

            var definitions = FeatureRegistry.GetAllDefinitions();
            for (int i = 0; i < definitions.Count; i++)
            {
                var def = definitions[i];
                flags[def.Key] = GetBool(settings, def.Key, def.DefaultValue);
            }

            return flags;
        }

        public bool IsFeatureEnabled(string key)
        {
            if (string.IsNullOrEmpty(key)) return false;
            var def = FeatureRegistry.GetDefinition(key);
            bool defVal = def != null ? def.DefaultValue : false;
            var settings = _repo.GetAll();
            return GetBool(settings, key, defVal);
        }

        public void SetFeatureFlag(string key, bool enabled)
        {
            var currentFlags = GetFeatureFlags();
            string errorMsg;
            if (!FeatureRegistry.ValidateDependencies(key, enabled, currentFlags, out errorMsg))
            {
                throw new InvalidOperationException(errorMsg);
            }

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
