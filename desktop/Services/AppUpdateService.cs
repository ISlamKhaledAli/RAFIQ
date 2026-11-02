using System;
using System.IO;
using System.Net;
using System.Text;
using Newtonsoft.Json.Linq;
using RafiqPOS.Common;
using RafiqPOS.Repositories;

namespace RafiqPOS.Services
{
    public class AppUpdateInfo
    {
        public bool HasUpdate { get; set; }
        public bool IsEligible { get; set; }
        public string CurrentVersion { get; set; }
        public string LatestVersion { get; set; }
        public string ReleaseDate { get; set; }
        public string Changelog { get; set; }
        public string DownloadUrl { get; set; }
        public string Sha256 { get; set; }
        public bool IsMandatory { get; set; }
        public long FileSizeBytes { get; set; }
        public string ErrorMessage { get; set; }
    }

    // Informational only: updates are installed with the official Setup (elevated installer), never applied from inside the app.
    public class AppUpdateService
    {
        public const string CURRENT_VERSION = "1.0.0";
        public const string DEFAULT_UPDATE_SERVER_URL = "https://rafiq-license-server.khaledislam9003.workers.dev/api/updates/check";
        private const int NETWORK_TIMEOUT_MS = 7000;

        private readonly SettingsRepository _settingsRepo;

        public AppUpdateService(SettingsRepository settingsRepo)
        {
            this._settingsRepo = settingsRepo;
        }

        public AppUpdateInfo CheckForUpdates(string manifestJsonOrUrl = null)
        {
            AppUpdateInfo info = new AppUpdateInfo();
            info.CurrentVersion = CURRENT_VERSION;
            info.HasUpdate = false;

            try
            {
                string jsonContent = null;

                // 1. If explicit JSON passed (for testing / direct offline payload)
                if (!string.IsNullOrEmpty(manifestJsonOrUrl) && manifestJsonOrUrl.Trim().StartsWith("{"))
                {
                    jsonContent = manifestJsonOrUrl;
                }
                else
                {
                    // 2. Fetch via HTTPS using TLS 1.2
                    ServicePointManager.SecurityProtocol = ServicePointManager.SecurityProtocol | SecurityProtocolType.Tls12;
                    string targetUrl = string.IsNullOrEmpty(manifestJsonOrUrl) ? DEFAULT_UPDATE_SERVER_URL : manifestJsonOrUrl;

                    // Automatically attach license and machine identity if querying the official server
                    if (targetUrl.StartsWith(DEFAULT_UPDATE_SERVER_URL, StringComparison.OrdinalIgnoreCase))
                    {
                        string licKey = _settingsRepo != null ? _settingsRepo.Get("license_key", "") : "";
                        string fp = EncryptionService.GenerateDeviceFingerprint();
                        string sep = targetUrl.Contains("?") ? "&" : "?";
                        targetUrl = string.Format("{0}{1}version={2}&license_key={3}&machine_fingerprint={4}",
                            targetUrl, sep, Uri.EscapeDataString(CURRENT_VERSION), Uri.EscapeDataString(licKey), Uri.EscapeDataString(fp));
                    }

                    HttpWebRequest request = (HttpWebRequest)WebRequest.Create(targetUrl);
                    request.Method = "GET";
                    request.Timeout = NETWORK_TIMEOUT_MS;
                    request.ReadWriteTimeout = NETWORK_TIMEOUT_MS;
                    request.UserAgent = "RafiqPOS/" + CURRENT_VERSION + " (.NET4.8; Win7-11)";

                    using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
                    using (StreamReader reader = new StreamReader(response.GetResponseStream(), Encoding.UTF8))
                    {
                        jsonContent = reader.ReadToEnd();
                    }
                }

                if (!string.IsNullOrEmpty(jsonContent))
                {
                    JObject json = JObject.Parse(jsonContent);
                    string remoteVer = json["latestVersion"] != null ? json["latestVersion"].ToString() : (json["version"] != null ? json["version"].ToString() : "");
                    string releaseDate = json["releaseDate"] != null ? json["releaseDate"].ToString() : "";
                    string changelog = json["changelog"] != null ? json["changelog"].ToString() : "";
                    string downloadUrl = json["downloadUrl"] != null ? json["downloadUrl"].ToString() : "";
                    string sha = json["sha256"] != null ? json["sha256"].ToString() : "";
                    bool isMandatory = json["isMandatory"] != null && json["isMandatory"].Value<bool>();
                    long size = json["fileSizeBytes"] != null ? json["fileSizeBytes"].Value<long>() : 0;
                    bool isEligible = json["isEligible"] == null || json["isEligible"].Value<bool>();
                    string srvMsg = json["message"] != null ? json["message"].ToString() : "";

                    info.IsEligible = isEligible;
                    info.LatestVersion = remoteVer;
                    info.ReleaseDate = releaseDate;
                    info.Changelog = changelog;
                    info.DownloadUrl = downloadUrl;
                    info.Sha256 = sha;
                    info.IsMandatory = isMandatory;
                    info.FileSizeBytes = size;

                    if (!isEligible)
                    {
                        info.HasUpdate = false;
                        info.ErrorMessage = !string.IsNullOrEmpty(srvMsg) ? srvMsg : "الترخيص غير مؤهل لتلقي التحديثات.";
                    }
                    else if (!string.IsNullOrEmpty(remoteVer) && CompareVersions(remoteVer, CURRENT_VERSION) > 0)
                    {
                        info.HasUpdate = true;
                    }

                    if (_settingsRepo != null)
                    {
                        _settingsRepo.Set("last_update_check_at", DateTime.UtcNow.ToString("o"));
                        _settingsRepo.Set("last_known_latest_version", remoteVer);
                    }
                }
            }
            catch (WebException webEx)
            {
                info.ErrorMessage = "تعذر الاتصال بخادم التحديثات (تأكد من اتصال الإنترنت): " + webEx.Message;
                Logger.Warn("AppUpdateService: فشل فحص التحديثات أونلاين: " + webEx.Message);
            }
            catch (Exception ex)
            {
                info.ErrorMessage = "خطأ أثناء التحقق من التحديث: " + ex.Message;
                Logger.Error("AppUpdateService: خطأ أثناء فحص التحديث", ex);
            }

            return info;
        }

        public static int CompareVersions(string v1, string v2)
        {
            if (string.IsNullOrEmpty(v1) && string.IsNullOrEmpty(v2)) return 0;
            if (string.IsNullOrEmpty(v1)) return -1;
            if (string.IsNullOrEmpty(v2)) return 1;

            string[] p1 = v1.Trim().TrimStart('v', 'V').Split('.');
            string[] p2 = v2.Trim().TrimStart('v', 'V').Split('.');

            int maxLen = Math.Max(p1.Length, p2.Length);
            for (int i = 0; i < maxLen; i++)
            {
                int num1 = 0;
                int num2 = 0;
                if (i < p1.Length) int.TryParse(p1[i], out num1);
                if (i < p2.Length) int.TryParse(p2[i], out num2);

                if (num1 > num2) return 1;
                if (num1 < num2) return -1;
            }
            return 0;
        }
    }
}
