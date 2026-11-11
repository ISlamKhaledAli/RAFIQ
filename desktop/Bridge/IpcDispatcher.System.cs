using System;
using System.Collections.Generic;
using System.Windows.Forms;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using RafiqPOS.Common;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Bridge
{
    public partial class IpcDispatcher
    {
        // Settings keys a non-admin may write, grouped by the permission that unlocks them; everything else is admin-only
        private static readonly HashSet<string> PRINTER_SETTING_KEYS = new HashSet<string>(StringComparer.Ordinal)
        {
            "default_printer_name", "receipt_paper_width", "printer_auto_print", "printer_open_drawer",
            "default_label_printer_name", "default_label_paper_size", "drawer_pulse_ms", "drawer_pin", "report_paper_size",
            "label_custom_width_mm", "label_custom_height_mm", "label_show_store_name", "label_show_price",
            "label_show_barcode_text", "label_show_expiry_date"
        };

        private static readonly HashSet<string> BARCODE_SETTING_KEYS = new HashSet<string>(StringComparer.Ordinal)
        {
            "scanner_enabled", "scanner_speed_ms", "scanner_speed_threshold_ms", "scanner_prefix", "scanner_suffix", "scanner_min_length"
        };

        private static readonly HashSet<string> STORE_SETTING_KEYS = new HashSet<string>(StringComparer.Ordinal)
        {
            "store_name", "cashier_name", "store_phone", "store_address", "tax_number",
            "receipt_header", "receipt_footer", "show_receipt_logo", "receipt_show_cashier", "receipt_show_invoice_number", "receipt_show_paid", "receipt_show_change", "store_logo_url", "thermal_logo_mode", "logo_variant",
            "store_instapay_address", "store_wallet_number"
        };

        // Returns the keys the current session may not change. Runs after RemoveProtectedSettingKeys, so the
        // unchanged-value no-op rule only ever applies to keys that are visible through settings:getAll.
        private static List<string> FindUnauthorizedSettingKeys(Dictionary<string, string> settings)
        {
            var denied = new List<string>();
            UserDto user = SecurityService.CurrentUser;
            // No session is only reachable through the pre-login first-run gate in AuthorizeRequest
            if (settings == null || user == null || DatabaseService.Security == null) return denied;
            if (DatabaseService.Security.IsCurrentSessionAdmin()) return denied;

            bool canPrinter = DatabaseService.Security.HasPermission(user.Id, "settings.printer");
            bool canBarcode = DatabaseService.Security.HasPermission(user.Id, "settings.barcode");
            bool canStore = DatabaseService.Security.HasPermission(user.Id, "settings.store");

            foreach (var kvp in settings)
            {
                string key = kvp.Key ?? "";
                if (canPrinter && PRINTER_SETTING_KEYS.Contains(key)) continue;
                if (canBarcode && BARCODE_SETTING_KEYS.Contains(key)) continue;
                if (canStore && STORE_SETTING_KEYS.Contains(key)) continue;

                string current = DatabaseService.Settings != null ? DatabaseService.Settings.Get(key, null) : null;
                if (current != null && current == (kvp.Value ?? "")) continue;
                denied.Add(key);
            }
            return denied;
        }

        // settings:save / settings:updateBatch never echo stored settings back; callers re-read through settings:getAll
        private static BridgeResponse SaveSettingsAuthorized(BridgeRequest request, Dictionary<string, string> input)
        {
            // Root-only keys (developer signature) are rejected loudly for everyone else, unless the value is unchanged
            if (input != null && !IsCurrentUserRoot())
            {
                foreach (var kvp in input)
                {
                    if (!IsRootOnlySettingKey(kvp.Key)) continue;
                    string stored = EffectiveRootOnlyValue(kvp.Key);
                    if (stored != null && stored == (kvp.Value ?? "")) continue;
                    string rootWho = SecurityService.CurrentUser != null ? SecurityService.CurrentUser.Username : "";
                    Logger.Warn(string.Format("رفض تعديل توقيع ودعاية المطور للمستخدم {0}: يتطلب صلاحية روت.", rootWho));
                    return BridgeResponse.Fail(request.Id, "FORBIDDEN", "توقيع ودعاية المطور مخصصان لحساب المطور (روت) فقط.");
                }
            }

            Dictionary<string, string> writable = RemoveProtectedSettingKeys(input);

            // The retention policy decides which backups get deleted: only root may change it, here too (not only in backup:configure)
            if (!IsCurrentUserRoot() && DatabaseService.Backup != null)
            {
                foreach (var kvp in writable)
                {
                    if (!BackupService.IsRetentionSettingKey(kvp.Key)) continue;
                    if (!DatabaseService.Backup.IsRetentionSettingChange(kvp.Key, kvp.Value)) continue;
                    Logger.Warn("رفض تعديل سياسة الاحتفاظ بالنسخ الاحتياطية عبر الإعدادات: يتطلب حساب الروت.");
                    return BridgeResponse.Fail(request.Id, "FORBIDDEN", BackupService.RETENTION_ROOT_ONLY_MESSAGE);
                }
            }

            // Animations can slow weak shop PCs down: only root switches them, every user reads the value (settings:getStoreProfile)
            var motionKeys = new List<string>();
            foreach (var kvp in writable)
            {
                if (SettingsService.IsUiMotionSettingKey(kvp.Key)) motionKeys.Add(kvp.Key);
            }
            if (motionKeys.Count > 0 && DatabaseService.Settings != null)
            {
                bool isRootUser = IsCurrentUserRoot();
                for (int m = 0; m < motionKeys.Count; m++)
                {
                    string motionKey = motionKeys[m];
                    if (!isRootUser)
                    {
                        if (DatabaseService.Settings.IsUiMotionChange(motionKey, writable[motionKey]))
                        {
                            Logger.Warn("رفض تعديل الحركات والانتقالات: يتطلب حساب الروت.");
                            return BridgeResponse.Fail(request.Id, "FORBIDDEN", SettingsService.UiMotionRootOnlyMessageFor(motionKey));
                        }
                        writable.Remove(motionKey);
                    }
                    else
                    {
                        writable[motionKey] = SettingsService.NormalizeUiMotionSettingValue(motionKey, writable[motionKey]);
                    }
                }
            }

            List<string> denied = FindUnauthorizedSettingKeys(writable);
            if (denied.Count > 0)
            {
                string who = SecurityService.CurrentUser != null ? SecurityService.CurrentUser.Username : "";
                Logger.Warn(string.Format("رفض تعديل إعدادات غير مصرح بها للمستخدم {0}: {1}", who, string.Join(", ", denied.ToArray())));
                return BridgeResponse.Fail(request.Id, "FORBIDDEN", "ليس لديك صلاحية لتعديل بعض هذه الإعدادات. يرجى التواصل مع مدير المحل.");
            }

            // Receipt texts keep real line breaks: normalise once here so every renderer sees the same value
            var receiptTextKeys = new List<string>();
            foreach (var key in writable.Keys)
            {
                if (SettingsService.GetReceiptTextLabel(key) != null) receiptTextKeys.Add(key);
            }
            // Signature visibility/image (root only, already authorised above): authoritative validation, the image content is never echoed or logged
            foreach (var kvp in writable)
            {
                string signatureError;
                if (!SettingsService.TryValidateSignatureSetting(kvp.Key, kvp.Value, out signatureError))
                {
                    return BridgeResponse.Fail(request.Id, "VALIDATION_ERROR", signatureError);
                }
            }
            for (int i = 0; i < receiptTextKeys.Count; i++)
            {
                string normalized;
                string textError;
                if (!SettingsService.TryNormalizeReceiptText(receiptTextKeys[i], writable[receiptTextKeys[i]], out normalized, out textError))
                {
                    return BridgeResponse.Fail(request.Id, "INVALID_INPUT", textError);
                }
                writable[receiptTextKeys[i]] = normalized;
            }

            DatabaseService.Settings.SaveSettings(writable);
            return BridgeResponse.Ok(request.Id, new { success = true });
        }

        private static bool IsCurrentUserRoot()
        {
            return SecurityService.CurrentUser != null && SecurityService.CurrentUser.Role == "root";
        }

        // The value settings:getAll shows (stored value, or the built-in default when the key was never saved), so a full-screen
        // round trip by a non-root user that re-sends the defaults it just read is a no-op, not a forbidden change
        private static string EffectiveRootOnlyValue(string key)
        {
            if (DatabaseService.Settings == null) return null;
            string value;
            return DatabaseService.Settings.GetAllSettings().TryGetValue(key ?? "", out value) ? value : null;
        }

        private static bool IsRootOnlySettingKey(string key)
        {
            string lower = (key ?? "").Trim().ToLowerInvariant();
            return lower == "developer_signature" || lower == "developer_branding" || lower == "system_developer_signature"
                || SettingsService.IsSignatureSettingKey(key);
        }

        // Secrets and license/security state owned by services: never returned to the UI and never writable through settings:*
        private static bool IsProtectedSettingKey(string key)
        {
            string lower = (key ?? "").ToLowerInvariant();
            return lower.StartsWith("license_") ||
                lower.StartsWith("security_") ||
                lower.StartsWith("transfer_") ||
                lower.StartsWith("owner_") ||
                lower.StartsWith("last_online_verify") ||
                lower == "last_known_utc" ||
                lower == "consumed_offline_codes" ||
                lower == "used_recovery_jtis" ||
                lower.Contains("hash") ||
                lower.Contains("salt") ||
                lower.Contains("secret") ||
                lower.Contains("token");
        }

        private static Dictionary<string, string> SanitizeSettingsForUi(Dictionary<string, string> all)
        {
            var visible = new Dictionary<string, string>();
            if (all == null) return visible;
            foreach (var kvp in all)
            {
                if (!IsProtectedSettingKey(kvp.Key)) visible[kvp.Key] = kvp.Value;
            }
            return visible;
        }

        // License, clock-guard and security state may only be written by their owning services (Audit F-15)
        private static Dictionary<string, string> RemoveProtectedSettingKeys(Dictionary<string, string> input)
        {
            var clean = new Dictionary<string, string>();
            if (input == null) return clean;
            bool isRoot = IsCurrentUserRoot();

            foreach (var kvp in input)
            {
                string key = kvp.Key ?? "";

                // حماية دعاية وتوقيع مطور النظام: محجوزة حصرياً لحساب الروت (المطور)
                if (IsRootOnlySettingKey(key))
                {
                    if (!isRoot)
                    {
                        Logger.Warn("تم منع تعديل توقيع ودعاية المطور: يتطلب صلاحية روت.");
                        continue;
                    }
                }

                if (IsProtectedSettingKey(key))
                {
                    Logger.Warn("تم تجاهل محاولة تعديل إعداد محمي عبر الواجهة: " + key);
                    continue;
                }
                clean[key] = kvp.Value;
            }
            return clean;
        }

        private static bool TryDispatchSystem(BridgeRequest request, out BridgeResponse response)
        {
            response = null;
            switch (request.Action)
            {
                case "system:showPrintDialog":
                    string dialogKind = "browser";
                    if (request.Payload != null)
                    {
                        try
                        {
                            Newtonsoft.Json.Linq.JObject dObj = request.Payload as Newtonsoft.Json.Linq.JObject;
                            if (dObj != null && dObj["kind"] != null)
                            {
                                dialogKind = dObj["kind"].ToString();
                            }
                        }
                        catch { }
                    }
                    if (RafiqPOS.MainForm.Instance != null)
                    {
                        string dialogError;
                        if (RafiqPOS.MainForm.Instance.TryShowPrintDialog(dialogKind, out dialogError))
                        {
                            response = BridgeResponse.Ok(request.Id, new { triggered = true });
                        }
                        else
                        {
                            response = BridgeResponse.Fail(request.Id, "PRINT_DIALOG_FAILED", dialogError);
                        }
                    }
                    else
                    {
                        response = BridgeResponse.Fail(request.Id, "MAIN_FORM_NOT_READY", "النافذة الرئيسية غير جاهزة لعرض الطباعة");
                    }
                    return true;

                case "system:appReady":
                    if (RafiqPOS.MainForm.Instance != null)
                    {
                        string appTheme = null;
                        if (request.Payload != null)
                        {
                            try
                            {
                                Newtonsoft.Json.Linq.JObject obj = request.Payload as Newtonsoft.Json.Linq.JObject;
                                if (obj != null && obj["theme"] != null)
                                {
                                    appTheme = obj["theme"].ToString();
                                }
                            }
                            catch { }
                        }
                        RafiqPOS.MainForm.Instance.NotifyAppReady(appTheme);
                    }
                    response = BridgeResponse.Ok(request.Id, new { ready = true });
                    return true;

                case "system:setTheme":
                    string newTheme = null;
                    if (request.Payload != null)
                    {
                        try
                        {
                            Newtonsoft.Json.Linq.JObject obj = request.Payload as Newtonsoft.Json.Linq.JObject;
                            if (obj != null && obj["theme"] != null)
                            {
                                newTheme = obj["theme"].ToString();
                            }
                            else
                            {
                                newTheme = request.Payload.ToString().Trim('"', ' ');
                            }
                        }
                        catch { }
                    }
                    if (!string.IsNullOrEmpty(newTheme))
                    {
                        RafiqPOS.MainForm.SaveThemePreference(newTheme);
                    }
                    response = BridgeResponse.Ok(request.Id, new { success = true });
                    return true;

                case "system:getInfo":
                    string osDetails = RafiqPOS.Common.OsDetector.GetOsFriendlyName() + (Environment.Is64BitOperatingSystem ? " (64-bit)" : " (32-bit)");
                    DatabaseHealthInfo dbHealth = DatabaseService.GetHealth();
                    response = BridgeResponse.Ok(request.Id, new
                    {
                        appName = "رفيق POS",
                        version = RafiqPOS.Services.AppUpdateService.CurrentVersion,
                        osVersion = osDetails,
                        isWebView2 = true,
                        dbStatus = dbHealth.ToSummaryText(),
                        dbOk = dbHealth.IsOk,
                        dbJournalMode = dbHealth.JournalMode,
                        dbSchemaVersion = dbHealth.SchemaVersion,
                        dbSizeBytes = dbHealth.SizeBytes,
                        dbError = dbHealth.Error,
                        lastBackupAt = DatabaseService.Backup != null ? DatabaseService.Backup.GetLastSuccessfulBackupAt() : ""
                    });
                    return true;

                case "system:ping":
                    response = BridgeResponse.Ok(request.Id, new { timestamp = DateTime.UtcNow.ToString("o") });
                    return true;

                case "window:toggleFullscreen":
                    if (RafiqPOS.MainForm.Instance != null)
                    {
                        RafiqPOS.MainForm.Instance.ToggleFullscreen();
                        response = BridgeResponse.Ok(request.Id, new { isFullscreen = RafiqPOS.MainForm.Instance.IsFullscreen() });
                        return true;
                    }
                    response = BridgeResponse.Ok(request.Id, new { isFullscreen = true });
                    return true;

                case "window:isFullscreen":
                    bool isFs = RafiqPOS.MainForm.Instance != null && RafiqPOS.MainForm.Instance.IsFullscreen();
                    response = BridgeResponse.Ok(request.Id, new { isFullscreen = isFs });
                    return true;

                case "window:minimize":
                    if (RafiqPOS.MainForm.Instance != null)
                    {
                        RafiqPOS.MainForm.Instance.Invoke(new Action(delegate { RafiqPOS.MainForm.Instance.WindowState = FormWindowState.Minimized; }));
                    }
                    response = BridgeResponse.Ok(request.Id, new { success = true });
                    return true;

                case "window:close":
                    if (RafiqPOS.MainForm.Instance != null)
                    {
                        RafiqPOS.MainForm.Instance.Invoke(new Action(delegate { RafiqPOS.MainForm.Instance.Close(); }));
                    }
                    response = BridgeResponse.Ok(request.Id, new { success = true });
                    return true;

                case "db:testTransaction":
                    int count = 10;
                    JObject jObj = request.Payload as JObject;
                    if (jObj != null && jObj["count"] != null)
                    {
                        count = jObj["count"].Value<int>();
                    }
                    TransactionResult result = DatabaseService.ExecuteAtomicSaleTransaction(count);
                    if (result.Success)
                    {
                        response = BridgeResponse.Ok(request.Id, new { success = true, message = result.Message });
                    }
                    else
                    {
                        response = BridgeResponse.Fail(request.Id, "DB_TRANSACTION_FAILED", result.Message);
                    }
                    return true;

                case "settings:getAll":
                    response = BridgeResponse.Ok(request.Id, SanitizeSettingsForUi(DatabaseService.Settings.GetAllSettings()));
                    return true;

                case "settings:getStoreProfile":
                    var storeSettings = DatabaseService.Settings.GetAllSettings();
                    string sName = storeSettings.ContainsKey("store_name") ? storeSettings["store_name"] : (storeSettings.ContainsKey("storeName") ? storeSettings["storeName"] : "رفيق POS");
                    string sPhone = storeSettings.ContainsKey("store_phone") ? storeSettings["store_phone"] : "";
                    string sAddr = storeSettings.ContainsKey("store_address") ? storeSettings["store_address"] : "";
                    response = BridgeResponse.Ok(request.Id, new
                    {
                        storeName = sName,
                        storePhone = sPhone,
                        storeAddress = sAddr,
                        uiMotionEnabled = DatabaseService.Settings.IsUiMotionEnabled(),
                        uiMotionLevel = DatabaseService.Settings.GetUiMotionLevel(),
                        uiMotionStyle = DatabaseService.Settings.GetUiMotionStyle(),
                        deviceHardwareTier = DatabaseService.Settings.GetDeviceHardwareTier(),
                        deviceHardwareTierArabic = DatabaseService.Settings.GetDeviceHardwareTierArabic(),
                        deviceHardwareSummary = DatabaseService.Settings.GetDeviceHardwareSummary(),
                        detectedMotionLevel = DatabaseService.Settings.GetDetectedMotionLevel()
                    });
                    return true;

                case "settings:save":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات الإعدادات فارغة");
                        return true;
                    }
                    response = SaveSettingsAuthorized(request, JsonConvert.DeserializeObject<Dictionary<string, string>>(request.Payload.ToString()));
                    return true;

                case "settings:updateBatch":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات الإعدادات فارغة");
                        return true;
                    }
                    Dictionary<string, string> batchDict = null;
                    JObject batchObj = request.Payload as JObject;
                    if (batchObj != null && batchObj["settings"] != null)
                    {
                        batchDict = JsonConvert.DeserializeObject<Dictionary<string, string>>(batchObj["settings"].ToString());
                    }
                    else
                    {
                        batchDict = JsonConvert.DeserializeObject<Dictionary<string, string>>(request.Payload.ToString());
                    }
                    response = SaveSettingsAuthorized(request, batchDict);
                    return true;

                case "features:getAll":
                    var flags = DatabaseService.Settings.GetFeatureFlags();
                    response = BridgeResponse.Ok(request.Id, flags);
                    return true;

                case "system.getFeatureRegistry":
                case "system:getFeatureRegistry":
                case "features:getRegistry":
                    var registryList = FeatureRegistry.GetAllDefinitions();
                    response = BridgeResponse.Ok(request.Id, registryList);
                    return true;

                case "features:set":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات الميزة فارغة");
                        return true;
                    }
                    JObject featObj = request.Payload as JObject;
                    if (featObj != null && featObj["key"] != null && featObj["enabled"] != null)
                    {
                        string fKey = featObj["key"].ToString();
                        bool fEnabled = featObj["enabled"].Value<bool>();
                        try
                        {
                            DatabaseService.Settings.SetFeatureFlag(fKey, fEnabled);
                            response = BridgeResponse.Ok(request.Id, new { key = fKey, enabled = fEnabled });
                            return true;
                        }
                        catch (InvalidOperationException ex)
                        {
                            response = BridgeResponse.Fail(request.Id, "DEPENDENCY_ERROR", ex.Message);
                            return true;
                        }
                    }
                    response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "الحقول المطلوبة (key, enabled) ناقصة");
                    return true;

                case "health:getStatus":
                    var systemHealth = DatabaseService.SystemHealth.GetSystemHealth();
                    response = BridgeResponse.Ok(request.Id, systemHealth);
                    return true;

                case "system:factoryReset":
                    string resetConfirmWord = "";
                    JObject resetPayload = request.Payload as JObject;
                    if (resetPayload != null && resetPayload["confirmWord"] != null)
                    {
                        resetConfirmWord = resetPayload["confirmWord"].ToString().Trim();
                    }
                    // The typed word is enforced here too, so no other caller can wipe the store by accident
                    if (resetConfirmWord != "مسح" && resetConfirmWord != "تأكيد")
                    {
                        response = BridgeResponse.Fail(request.Id, "CONFIRMATION_REQUIRED", "لم يتم تأكيد التصفير: اكتب كلمة التأكيد كما هي في النافذة.");
                        return true;
                    }
                    // Backups are mandatory and are never wiped by a reset (Decision D1 & DATA-01)
                    var resetResult = DatabaseService.FactoryReset();
                    response = BridgeResponse.Ok(request.Id, resetResult);
                    return true;

                case "support:getSystemInfo":
                    var supportInfo = DatabaseService.Support.GetSystemDiagnosticInfo();
                    response = BridgeResponse.Ok(request.Id, supportInfo);
                    return true;

                case "support:createBundle":
                    var bundleResult = DatabaseService.Support.CreateSupportBundle();
                    response = BridgeResponse.Ok(request.Id, bundleResult);
                    return true;

                case "system:checkClock":
                    var clockResult = TimeGuard.ValidateSystemClock(DatabaseService.ConnectionString);
                    response = BridgeResponse.Ok(request.Id, clockResult);
                    return true;

                case "benchmark:run":
#if DEBUG
                    // Developer-only (no product screen uses it); always runs on a temporary database copy, capped at 5000 products
                    int pCount = 3000;
                    if (request.Payload != null)
                    {
                        JObject bObj = request.Payload as JObject;
                        if (bObj != null && bObj["productCount"] != null)
                        {
                            pCount = bObj["productCount"].Value<int>();
                        }
                    }
                    var benchResult = DatabaseService.Benchmark.RunStressTest(pCount);
                    response = BridgeResponse.Ok(request.Id, benchResult);
#else
                    response = BridgeResponse.Fail(request.Id, "NOT_AVAILABLE", "اختبار الحمل متاح لنسخة المطورين فقط.");
#endif
                    return true;

                case "search:runBenchmark":
                    int benchProdCount = 5000;
                    int benchQueryCount = 100;
                    JObject benchObj = request.Payload as JObject;
                    if (benchObj != null)
                    {
                        if (benchObj["productCount"] != null) benchProdCount = benchObj["productCount"].Value<int>();
                        if (benchObj["queryIterations"] != null) benchQueryCount = benchObj["queryIterations"].Value<int>();
                    }
                    // Runs on a temporary database (never the live store) and is capped inside the runner
                    var benchRunner = new SearchBenchmarkRunner();
                    var benchRes = benchRunner.RunBenchmark(benchProdCount, benchQueryCount);
                    response = BridgeResponse.Ok(request.Id, benchRes);
                    return true;

                default:
                    return false;
            }
        }
    }
}
