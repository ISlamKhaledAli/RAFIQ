using System;
using System.Collections.Generic;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
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
            if (!settings.ContainsKey("store_address")) settings["store_address"] = "";
            if (!settings.ContainsKey("tax_number")) settings["tax_number"] = "";
            if (!settings.ContainsKey("tax_enabled")) settings["tax_enabled"] = "0";
            if (!settings.ContainsKey("feature_taxes")) settings["feature_taxes"] = "0";
            if (!settings.ContainsKey("default_tax_rate_percent")) settings["default_tax_rate_percent"] = "0";
            if (!settings.ContainsKey("cashier_name")) settings["cashier_name"] = "كاشير (1)";
            if (!settings.ContainsKey("receipt_header")) settings["receipt_header"] = "";
            if (!settings.ContainsKey("receipt_footer")) settings["receipt_footer"] = "";
            if (!settings.ContainsKey("show_receipt_logo")) settings["show_receipt_logo"] = "1";
            if (!settings.ContainsKey("receipt_show_cashier")) settings["receipt_show_cashier"] = "1";
            if (!settings.ContainsKey("receipt_show_invoice_number")) settings["receipt_show_invoice_number"] = "1";
            if (!settings.ContainsKey("receipt_show_paid")) settings["receipt_show_paid"] = "1";
            if (!settings.ContainsKey("receipt_show_change")) settings["receipt_show_change"] = "1";
            if (!settings.ContainsKey(UiMotionKey)) settings[UiMotionKey] = UiMotionDefault;
            if (!settings.ContainsKey(UiMotionLevelKey)) settings[UiMotionLevelKey] = GetDetectedDefaultMotionLevel();
            if (!settings.ContainsKey(UiMotionStyleKey)) settings[UiMotionStyleKey] = UiMotionStyleDefault;
            if (!settings.ContainsKey(SignatureVisibleKey)) settings[SignatureVisibleKey] = "1";
            if (!settings.ContainsKey(SignatureImageKey)) settings[SignatureImageKey] = "";
            if (!settings.ContainsKey("store_logo_url") || settings["store_logo_url"] == "/logo.png" || settings["store_logo_url"] == "/receipt_logo.png")
            {
                settings["store_logo_url"] = "/receipt_logo_square.png";
            }
            // Missing, blank or any older built-in default becomes the current default; a value the root customised is never touched
            if (!settings.ContainsKey("developer_signature") ||
                IsLegacyOrBlankDeveloperSignature(settings["developer_signature"]))
            {
                settings["developer_signature"] = DefaultDeveloperSignature;
                _repo.Set("developer_signature", DefaultDeveloperSignature);
            }

            return settings;
        }

        /// <summary>التوقيع الافتراضي على ثلاثة أسطر (تُطبع فوقها صورة رفيق تلقائياً): اسم الشركة ثم الاستفسار ثم التواصل. بلا رموز تعبيرية</summary>
        public const string DefaultDeveloperSignature = "رفيق للأنظمة والحلول البرمجية\nللاستفسار وتجربة النظام\nم. إسلام خالد | 01097782965";

        /// <summary>كل قيمة افتراضية قديمة سبق أن حُفظت في قاعدة البيانات تُرحَّل للقيمة الجديدة</summary>
        public static readonly string[] LegacyDeveloperSignatures = new string[]
        {
            "نظام رفيق لإدارة المتاجر ونقاط البيع | تطوير: م. إسلام خالد",
            "نظام رفيق للأنظمة والحلول البرمجية | تطوير: م. إسلام خالد - 01097782965",
            "نظام رفيق للأنظمة والحلول البرمجية\nللتواصل: م. إسلام خالد - 01097782965",
            "رفيق للأنظمة والحلول البرمجية\nللدعم الفني والاستفسارات\nم. إسلام خالد - 01097782965\nشكرًا لثقتكم بنا",
            "للدعم الفني والاستفسارات\nم. إسلام خالد - 01097782965"
        };

        // ---------- الحركات والانتقالات (تأثيرات الواجهة): يغيّرها الروت فقط ويقرأها الجميع ----------

        /// <summary>"1" تفعّل الحركات والانتقالات (مفعّلة افتراضياً)، و"0" تعني مغلقة</summary>
        public const string UiMotionKey = "ui_motion_enabled";
        /// <summary>قوة الحركة: soft (ضعيف) أو medium (متوسط) أو strong (قوي)</summary>
        public const string UiMotionLevelKey = "ui_motion_level";
        /// <summary>شكل الحركة: fade (الافتراضي تلاشي) أو slide أو zoom</summary>
        public const string UiMotionStyleKey = "ui_motion_style";
        public const string UiMotionLevelDefault = "medium";
        public const string UiMotionStyleDefault = "fade";
        public const string UiMotionDefault = "1";
        public const string UiMotionRootOnlyMessage = "تفعيل الحركات والانتقالات متاح لحساب الروت فقط";
        public const string UiMotionLookRootOnlyMessage = "تغيير شكل الحركات متاح لحساب الروت فقط";

        public static string GetDetectedDefaultMotionLevel()
        {
            try
            {
                return DeviceTierDetector.DetectMotionLevel();
            }
            catch
            {
                return UiMotionLevelDefault;
            }
        }

        public static bool IsUiMotionSettingKey(string key)
        {
            string k = (key ?? "").Trim();
            return k == UiMotionKey || k == UiMotionLevelKey || k == UiMotionStyleKey;
        }

        public static string UiMotionRootOnlyMessageFor(string key)
        {
            return (key ?? "").Trim() == UiMotionKey ? UiMotionRootOnlyMessage : UiMotionLookRootOnlyMessage;
        }

        /// <summary>أي قيمة غير "0" أو "false" تُعد مفعّلة إذا كانت 1 أو true، والقيم الفارغة تعود للافتراضي</summary>
        public static string NormalizeUiMotionValue(string value)
        {
            string v = (value ?? "").Trim().ToLowerInvariant();
            return v == "1" || v == "true" ? "1" : "0";
        }

        /// <summary>أي قيمة غير soft وmedium وstrong تعود للافتراضي المحسوب للجهاز</summary>
        public static string NormalizeUiMotionLevel(string value)
        {
            string v = (value ?? "").Trim().ToLowerInvariant();
            return v == "soft" || v == "medium" || v == "strong" ? v : GetDetectedDefaultMotionLevel();
        }

        /// <summary>أي قيمة غير slide وfade وzoom تعود للافتراضي fade</summary>
        public static string NormalizeUiMotionStyle(string value)
        {
            string v = (value ?? "").Trim().ToLowerInvariant();
            return v == "slide" || v == "fade" || v == "zoom" ? v : UiMotionStyleDefault;
        }

        /// <summary>القيمة الموحّدة لأي مفتاح من مفاتيح الحركات الثلاثة</summary>
        public static string NormalizeUiMotionSettingValue(string key, string value)
        {
            string k = (key ?? "").Trim();
            if (k == UiMotionLevelKey) return NormalizeUiMotionLevel(value);
            if (k == UiMotionStyleKey) return NormalizeUiMotionStyle(value);
            return NormalizeUiMotionValue(value);
        }

        public bool IsUiMotionEnabled()
        {
            return NormalizeUiMotionValue(_repo.Get(UiMotionKey, UiMotionDefault)) == "1";
        }

        public string GetUiMotionLevel()
        {
            string saved = _repo.Get(UiMotionLevelKey, "");
            if (string.IsNullOrEmpty(saved))
            {
                return GetDetectedDefaultMotionLevel();
            }
            return NormalizeUiMotionLevel(saved);
        }

        public string GetUiMotionStyle()
        {
            return NormalizeUiMotionStyle(_repo.Get(UiMotionStyleKey, UiMotionStyleDefault));
        }

        public string GetDeviceHardwareTier()
        {
            return DeviceTierDetector.DetectTier().ToString().ToLowerInvariant();
        }

        public string GetDeviceHardwareTierArabic()
        {
            return DeviceTierDetector.GetTierArabicName(DeviceTierDetector.DetectTier());
        }

        public string GetDeviceHardwareSummary()
        {
            return DeviceTierDetector.GetDeviceSummary();
        }

        public string GetDetectedMotionLevel()
        {
            return DeviceTierDetector.DetectMotionLevel();
        }

        /// <summary>هل القيمة المرسلة تغيّر المحفوظ فعلاً (بعد التوحيد)؟ إعادة إرسال القيمة نفسها ليست تغييراً</summary>
        public bool IsUiMotionChange(string key, string value)
        {
            string k = (key ?? "").Trim();
            string current;
            if (k == UiMotionLevelKey) current = GetUiMotionLevel();
            else if (k == UiMotionStyleKey) current = GetUiMotionStyle();
            else current = IsUiMotionEnabled() ? "1" : "0";
            return NormalizeUiMotionSettingValue(k, value) != current;
        }

        // ---------- توقيع الإيصال أسفل الوصل (للروت فقط): ظهوره وصورته ----------

        /// <summary>"1" (الافتراضي عند غياب المفتاح) يُظهر كتلة التوقيع كلها، و"0" يخفيها</summary>
        public const string SignatureVisibleKey = "developer_signature_visible";
        /// <summary>"" = الصورة الافتراضية المضمّنة، "none" = بدون صورة، data URL لصورة PNG واحدة، أو مصفوفة JSON (حتى 8 عناصر: "default" أو data URL) تُختار منها صورة لكل فاتورة</summary>
        public const string SignatureImageKey = "developer_signature_image";
        public const string SignatureImageNone = "none";
        public const string SignatureImagePrefix = "data:image/png;base64,";
        public const int MaxSignatureImageChars = 300000;
        public const int MaxSignatureImageBytes = 220000;
        public const int MaxSignatureImageWidth = 1600;
        public const int MaxSignatureImageHeight = 600;
        /// <summary>عنصر في مصفوفة الصور يعني الصورة المضمّنة في البرنامج</summary>
        public const string SignatureImageDefaultToken = "default";
        public const int MaxSignatureImages = 8;
        public const int MaxSignatureImagesTotalChars = 900000;

        public static bool IsSignatureSettingKey(string key)
        {
            string lower = (key ?? "").Trim().ToLowerInvariant();
            return lower == SignatureVisibleKey || lower == SignatureImageKey;
        }

        /// <summary>يفك base64 لصورة PNG بعد البادئة المحددة بالضبط؛ أي مسافة أو حرف غير صالح يرفض القيمة. لا يلمس GDI</summary>
        public static bool TryDecodeSignatureImage(string value, out byte[] bytes)
        {
            bytes = null;
            if (value == null || !value.StartsWith(SignatureImagePrefix, StringComparison.Ordinal)) return false;
            string base64 = value.Substring(SignatureImagePrefix.Length);
            if (base64.Length == 0) return false;
            for (int i = 0; i < base64.Length; i++)
            {
                if (char.IsWhiteSpace(base64[i])) return false;
            }
            try
            {
                bytes = Convert.FromBase64String(base64);
            }
            catch (FormatException)
            {
                bytes = null;
                return false;
            }
            return true;
        }

        /// <summary>
        /// تحقق المضيف من إعدادي التوقيع: الظهور "0"/"1" فقط، والصورة "" أو "none" أو PNG data URL واحد أو مصفوفة JSON
        /// (حتى 8 عناصر: "default" أو PNG data URL) بحدود الحجم والأبعاد (الأبعاد من IHDR مباشرة دون فك الصورة).
        /// المفاتيح الأخرى تمر. الرسالة لا تحوي أي جزء من محتوى الصورة.
        /// </summary>
        public static bool TryValidateSignatureSetting(string key, string value, out string error)
        {
            error = null;
            string lower = (key ?? "").Trim().ToLowerInvariant();
            string text = value ?? "";

            if (lower == SignatureVisibleKey)
            {
                if (text == "0" || text == "1") return true;
                error = "قيمة إظهار توقيع الإيصال غير صالحة.";
                return false;
            }
            if (lower != SignatureImageKey) return true;
            if (text.Length == 0 || text == SignatureImageNone) return true;
            if (text[0] == '[') return TryValidateSignatureImageArray(text, out error);
            return TryValidateSingleSignatureImage(text, out error);
        }

        /// <summary>صورة واحدة: PNG data URL بالحدود المعتمدة (لا يُقبل "" ولا "none" ولا "default" هنا)</summary>
        private static bool TryValidateSingleSignatureImage(string text, out string error)
        {
            error = null;
            if (text.Length > MaxSignatureImageChars)
            {
                error = "صورة توقيع الإيصال كبيرة جداً.";
                return false;
            }
            if (!text.StartsWith(SignatureImagePrefix, StringComparison.Ordinal))
            {
                error = "صورة توقيع الإيصال يجب أن تكون PNG.";
                return false;
            }
            byte[] bytes;
            if (!TryDecodeSignatureImage(text, out bytes))
            {
                error = "صورة توقيع الإيصال تالفة.";
                return false;
            }
            if (bytes.Length > MaxSignatureImageBytes)
            {
                error = "صورة توقيع الإيصال كبيرة جداً.";
                return false;
            }
            byte[] pngSignature = new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A };
            bool isPng = bytes.Length >= 24;
            for (int i = 0; isPng && i < pngSignature.Length; i++)
            {
                if (bytes[i] != pngSignature[i]) isPng = false;
            }
            // الجزء الأول بعد التوقيع يجب أن يكون IHDR
            if (isPng && (bytes[12] != 0x49 || bytes[13] != 0x48 || bytes[14] != 0x44 || bytes[15] != 0x52)) isPng = false;
            if (!isPng)
            {
                error = "صورة توقيع الإيصال ليست PNG صالحة.";
                return false;
            }
            long width = ((long)bytes[16] << 24) | ((long)bytes[17] << 16) | ((long)bytes[18] << 8) | bytes[19];
            long height = ((long)bytes[20] << 24) | ((long)bytes[21] << 16) | ((long)bytes[22] << 8) | bytes[23];
            if (width < 1 || height < 1 || width > MaxSignatureImageWidth || height > MaxSignatureImageHeight)
            {
                error = "أبعاد صورة توقيع الإيصال أكبر من المسموح.";
                return false;
            }
            return true;
        }

        /// <summary>مصفوفة JSON: 1 إلى 8 عناصر نصية، كل منها "default" (الصورة المضمّنة، مرة واحدة فقط) أو PNG data URL صالح</summary>
        private static bool TryValidateSignatureImageArray(string text, out string error)
        {
            error = null;
            if (text.Length > MaxSignatureImagesTotalChars)
            {
                error = "صور توقيع الإيصال كبيرة جداً.";
                return false;
            }
            List<string> items;
            if (!TryParseSignatureImageItems(text, out items))
            {
                error = "قائمة صور توقيع الإيصال غير صالحة.";
                return false;
            }
            if (items.Count == 0)
            {
                error = "قائمة صور توقيع الإيصال فارغة: استخدم \"بدون صور\".";
                return false;
            }
            if (items.Count > MaxSignatureImages)
            {
                error = "الحد الأقصى لصور توقيع الإيصال " + MaxSignatureImages + " صور.";
                return false;
            }
            int defaults = 0;
            for (int i = 0; i < items.Count; i++)
            {
                if (items[i] == SignatureImageDefaultToken)
                {
                    defaults++;
                    if (defaults > 1)
                    {
                        error = "الصورة الافتراضية مكررة في قائمة صور التوقيع.";
                        return false;
                    }
                    continue;
                }
                string itemError;
                if (!TryValidateSingleSignatureImage(items[i], out itemError))
                {
                    error = "الصورة رقم " + (i + 1) + ": " + itemError;
                    return false;
                }
            }
            return true;
        }

        /// <summary>
        /// يحوّل قيمة الإعداد إلى قائمة عناصر دون فحص محتوى الصور: "" = ["default"]، "none" = [] ، data URL واحد = [هو]،
        /// ومصفوفة JSON = عناصرها النصية. يرجع false لـ JSON تالف أو عنصر غير نصي.
        /// </summary>
        public static bool TryParseSignatureImageItems(string value, out List<string> items)
        {
            items = new List<string>();
            string text = value ?? "";
            if (text.Length == 0)
            {
                items.Add(SignatureImageDefaultToken);
                return true;
            }
            if (text == SignatureImageNone) return true;
            if (text[0] != '[')
            {
                items.Add(text);
                return true;
            }
            if (text[text.Length - 1] != ']') return false;
            try
            {
                JArray array = JArray.Parse(text);
                foreach (JToken token in array)
                {
                    if (token.Type != JTokenType.String)
                    {
                        items = new List<string>();
                        return false;
                    }
                    items.Add((string)token);
                }
            }
            catch (JsonException)
            {
                items = new List<string>();
                return false;
            }
            return true;
        }

        /// <summary>
        /// فهرس صورة التوقيع لكل فاتورة: FNV-1a 32 بت على وحدات UTF-16 للمفتاح (رقم الفاتورة الداخلي) ثم باقي القسمة على العدد،
        /// فيُطبع نفس الاختيار في المعاينة وعلى الطابعة وعند إعادة الطباعة. مفتاح فارغ يعطي 0 والعدد غير الموجب يعطي -1.
        /// (نفس pickSignatureImageIndex في الواجهة)
        /// </summary>
        public static int PickSignatureImageIndex(string key, int count)
        {
            if (count <= 0) return -1;
            if (string.IsNullOrEmpty(key)) return 0;
            unchecked
            {
                uint hash = 2166136261u;
                for (int i = 0; i < key.Length; i++)
                {
                    hash ^= (uint)key[i];
                    hash *= 16777619u;
                }
                return (int)(hash % (uint)count);
            }
        }

        /// <summary>قيمة آمنة لسجل التدقيق: لا يُسجَّل محتوى الصورة أبداً (العدد والطول فقط)</summary>
        private static string AuditSafeValue(string key, string value)
        {
            if ((key ?? "").Trim().ToLowerInvariant() != SignatureImageKey) return value;
            string text = value ?? "";
            if (text.Length == 0 || text == SignatureImageNone) return text;
            if (text[0] != '[') return "[صورة مخصصة: " + text.Length + " حرف]";
            List<string> items;
            if (!TryParseSignatureImageItems(text, out items)) return "[صور غير صالحة: " + text.Length + " حرف]";
            int custom = 0;
            for (int i = 0; i < items.Count; i++)
            {
                if (items[i] != SignatureImageDefaultToken) custom++;
            }
            return "[" + custom + " صور مخصصة: " + text.Length + " حرف]";
        }

        public const int MaxReceiptTextChars = 300;
        public const int MaxReceiptTextLines = 4;

        public static bool IsLegacyOrBlankDeveloperSignature(string value)
        {
            if (string.IsNullOrWhiteSpace(value)) return true;
            string text = value.Trim();
            for (int i = 0; i < LegacyDeveloperSignatures.Length; i++)
            {
                if (text == LegacyDeveloperSignatures[i]) return true;
            }
            return false;
        }

        /// <summary>اسم العرض لمفاتيح نصوص الإيصال متعددة الأسطر (سطر جديد حقيقي \n)، أو null لأي مفتاح آخر</summary>
        public static string GetReceiptTextLabel(string key)
        {
            switch (key)
            {
                case "receipt_header": return "ترحيب أول الوصل";
                case "receipt_footer": return "تذييل الوصل";
                case "developer_signature": return "توقيع المطور";
                default: return null;
            }
        }

        /// <summary>
        /// تطبيع نص الإيصال: \r\n و \r تصبح \n، كل سطر يُقص من أطرافه، تُحذف الأسطر الفارغة من البداية والنهاية،
        /// وأي عدد من الأسطر الفارغة المتتالية يصبح سطراً فارغاً واحداً. (نفس قواعد normalizeReceiptText في الواجهة)
        /// </summary>
        public static string NormalizeReceiptText(string value)
        {
            if (string.IsNullOrEmpty(value)) return "";
            string[] raw = value.Replace("\r\n", "\n").Replace('\r', '\n').Split('\n');
            var lines = new List<string>();
            bool previousBlank = true;
            for (int i = 0; i < raw.Length; i++)
            {
                string line = raw[i].Trim();
                if (line.Length == 0)
                {
                    if (previousBlank) continue;
                    previousBlank = true;
                    lines.Add("");
                }
                else
                {
                    previousBlank = false;
                    lines.Add(line);
                }
            }
            while (lines.Count > 0 && lines[lines.Count - 1].Length == 0) lines.RemoveAt(lines.Count - 1);
            return string.Join("\n", lines.ToArray());
        }

        /// <summary>يتحقق من نص إيصال متعدد الأسطر بعد تطبيعه: حد أقصى 300 حرف و4 أسطر. لا يقتطع شيئاً بصمت.</summary>
        public static bool TryNormalizeReceiptText(string key, string value, out string normalized, out string error)
        {
            normalized = NormalizeReceiptText(value);
            error = null;
            string label = GetReceiptTextLabel(key);
            if (label == null) return true;

            if (normalized.Length > MaxReceiptTextChars)
            {
                error = "نص \"" + label + "\" أطول من المسموح (الحد الأقصى " + MaxReceiptTextChars + " حرفاً).";
                return false;
            }
            int lineCount = normalized.Length == 0 ? 0 : normalized.Split('\n').Length;
            if (lineCount > MaxReceiptTextLines)
            {
                error = "نص \"" + label + "\" يتجاوز الحد الأقصى (" + MaxReceiptTextLines + " أسطر).";
                return false;
            }
            return true;
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
                        new Dictionary<string, string> { { "key", key }, { "oldValue", AuditSafeValue(key, oldVal) }, { "newValue", AuditSafeValue(key, value ?? "") } }
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
                    item["oldValue"] = AuditSafeValue(kvp.Key, oldVal);
                    item["newValue"] = AuditSafeValue(kvp.Key, newVal);
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
                bool val = GetBool(settings, def.Key, def.DefaultValue);
                if (def.Key == "feature_taxes" && !settings.ContainsKey("feature_taxes") && settings.ContainsKey("tax_enabled"))
                {
                    val = GetBool(settings, "tax_enabled", def.DefaultValue);
                }
                flags[def.Key] = val;
            }

            return flags;
        }

        public bool IsFeatureEnabled(string key)
        {
            if (string.IsNullOrEmpty(key)) return false;
            var def = FeatureRegistry.GetDefinition(key);
            bool defVal = def != null ? def.DefaultValue : false;
            var settings = _repo.GetAll();
            if (key == "feature_taxes" && !settings.ContainsKey("feature_taxes") && settings.ContainsKey("tax_enabled"))
            {
                return GetBool(settings, "tax_enabled", defVal);
            }
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
