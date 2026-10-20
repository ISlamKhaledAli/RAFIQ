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
        // License, clock-guard and security state may only be written by their owning services (Audit F-15)
        private static Dictionary<string, string> RemoveProtectedSettingKeys(Dictionary<string, string> input)
        {
            var clean = new Dictionary<string, string>();
            if (input == null) return clean;
            bool isRoot = SecurityService.CurrentUser != null && SecurityService.CurrentUser.Role == "root";

            foreach (var kvp in input)
            {
                string key = kvp.Key ?? "";
                string lower = key.ToLowerInvariant();
                bool isProtected =
                    lower.StartsWith("license_") ||
                    lower.StartsWith("security_") ||
                    lower.StartsWith("transfer_") ||
                    lower.StartsWith("last_online_verify") ||
                    lower == "last_known_utc" ||
                    lower == "consumed_offline_codes";

                // حماية دعاية وتوقيع مطور النظام: محجوزة حصرياً لحساب الروت (المطور)
                if (lower == "developer_signature" || lower == "developer_branding" || lower == "system_developer_signature")
                {
                    if (!isRoot)
                    {
                        Logger.Warn("تم منع تعديل توقيع ودعاية المطور: يتطلب صلاحية روت.");
                        continue;
                    }
                }

                if (isProtected)
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
                    response = BridgeResponse.Ok(request.Id, new
                    {
                        appName = "رفيق POS",
                        version = "1.0.0",
                        osVersion = osDetails,
                        isWebView2 = true,
                        dbStatus = DatabaseService.GetStatus()
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
                    var allSettings = DatabaseService.Settings.GetAllSettings();
                    response = BridgeResponse.Ok(request.Id, allSettings);
                    return true;

                case "settings:getStoreProfile":
                    var storeSettings = DatabaseService.Settings.GetAllSettings();
                    string sName = storeSettings.ContainsKey("store_name") ? storeSettings["store_name"] : (storeSettings.ContainsKey("storeName") ? storeSettings["storeName"] : "رفيق POS");
                    string sPhone = storeSettings.ContainsKey("store_phone") ? storeSettings["store_phone"] : "";
                    string sAddr = storeSettings.ContainsKey("store_address") ? storeSettings["store_address"] : "";
                    response = BridgeResponse.Ok(request.Id, new { storeName = sName, storePhone = sPhone, storeAddress = sAddr });
                    return true;

                case "settings:save":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات الإعدادات فارغة");
                        return true;
                    }
                    var settingsDict = RemoveProtectedSettingKeys(JsonConvert.DeserializeObject<Dictionary<string, string>>(request.Payload.ToString()));
                    var updatedSettings = DatabaseService.Settings.SaveSettings(settingsDict);
                    response = BridgeResponse.Ok(request.Id, updatedSettings);
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
                    if (batchDict != null)
                    {
                        DatabaseService.Settings.SaveSettings(RemoveProtectedSettingKeys(batchDict));
                    }
                    response = BridgeResponse.Ok(request.Id, new { success = true });
                    return true;

                case "features:getAll":
                    var flags = DatabaseService.Settings.GetFeatureFlags();
                    response = BridgeResponse.Ok(request.Id, flags);
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
                        DatabaseService.Settings.SetFeatureFlag(fKey, fEnabled);
                        response = BridgeResponse.Ok(request.Id, new { key = fKey, enabled = fEnabled });
                        return true;
                    }
                    response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "الحقول المطلوبة (key, enabled) ناقصة");
                    return true;

                case "health:getStatus":
                    var systemHealth = DatabaseService.SystemHealth.GetSystemHealth();
                    response = BridgeResponse.Ok(request.Id, systemHealth);
                    return true;

                case "system:factoryReset":
                    bool wipeBackups = false;
                    if (request.Payload != null)
                    {
                        var pObj = request.Payload as JObject;
                        if (pObj != null && pObj["wipeBackups"] != null)
                        {
                            wipeBackups = pObj["wipeBackups"].Value<bool>();
                        }
                    }
                    var resetResult = DatabaseService.FactoryReset(wipeBackups);
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
                    var benchRunner = new SearchBenchmarkRunner(DatabaseService.ConnectionString, DatabaseService.ProductRepo);
                    var benchRes = benchRunner.RunBenchmark(benchProdCount, benchQueryCount);
                    response = BridgeResponse.Ok(request.Id, benchRes);
                    return true;

                default:
                    return false;
            }
        }
    }
}
