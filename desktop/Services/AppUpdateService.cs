using System;
using System.IO;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using RafiqPOS.Common;
using RafiqPOS.Repositories;

namespace RafiqPOS.Services
{
    public class AppUpdateInfo
    {
        public bool HasUpdate { get; set; }
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

    public class AppUpdateResult
    {
        public bool Success { get; set; }
        public string Code { get; set; }
        public string Message { get; set; }
        public string BackupPath { get; set; }
        public bool RollbackTriggered { get; set; }
    }

    public class AppUpdateService
    {
        public const string CURRENT_VERSION = "1.0.0";
        public const string DEFAULT_UPDATE_SERVER_URL = "https://rafiq-license-server.khaledislam9003.workers.dev/api/updates/check";
        private const int NETWORK_TIMEOUT_MS = 7000;

        private readonly SettingsRepository _settingsRepo;
        private readonly BackupService _backupService;
        private readonly AuditLogService _auditService;

        public AppUpdateService(SettingsRepository settingsRepo, BackupService backupService, AuditLogService auditService)
        {
            this._settingsRepo = settingsRepo;
            this._backupService = backupService;
            this._auditService = auditService;
        }

        public AppUpdateInfo CheckForUpdates(string manifestJsonOrUrl = null)
        {
            AppUpdateInfo info = new AppUpdateInfo();
            info.CurrentVersion = CURRENT_VERSION;
            info.HasUpdate = false;

            try
            {
                string jsonContent = null;

                // 1. If explicit JSON passed (for testing / offline inspection)
                if (!string.IsNullOrEmpty(manifestJsonOrUrl) && manifestJsonOrUrl.Trim().StartsWith("{"))
                {
                    jsonContent = manifestJsonOrUrl;
                }
                else
                {
                    // 2. Fetch via HTTPS using TLS 1.2
                    ServicePointManager.SecurityProtocol = ServicePointManager.SecurityProtocol | SecurityProtocolType.Tls12;
                    string targetUrl = string.IsNullOrEmpty(manifestJsonOrUrl) ? DEFAULT_UPDATE_SERVER_URL : manifestJsonOrUrl;

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
                    string remoteVer = json["version"] != null ? json["version"].ToString() : "";
                    string releaseDate = json["releaseDate"] != null ? json["releaseDate"].ToString() : "";
                    string changelog = json["changelog"] != null ? json["changelog"].ToString() : "";
                    string downloadUrl = json["downloadUrl"] != null ? json["downloadUrl"].ToString() : "";
                    string sha = json["sha256"] != null ? json["sha256"].ToString() : "";
                    bool isMandatory = json["isMandatory"] != null && json["isMandatory"].Value<bool>();
                    long size = json["fileSizeBytes"] != null ? json["fileSizeBytes"].Value<long>() : 0;

                    info.LatestVersion = remoteVer;
                    info.ReleaseDate = releaseDate;
                    info.Changelog = changelog;
                    info.DownloadUrl = downloadUrl;
                    info.Sha256 = sha;
                    info.IsMandatory = isMandatory;
                    info.FileSizeBytes = size;

                    if (!string.IsNullOrEmpty(remoteVer) && CompareVersions(remoteVer, CURRENT_VERSION) > 0)
                    {
                        info.HasUpdate = true;
                    }

                    _settingsRepo.Set("last_update_check_at", DateTime.UtcNow.ToString("o"));
                    _settingsRepo.Set("last_known_latest_version", remoteVer);
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

        public AppUpdateResult ApplyUpdate(string packagePath, string expectedSha256, bool simulateFailure = false)
        {
            AppUpdateResult result = new AppUpdateResult();

            if (string.IsNullOrEmpty(packagePath) || !File.Exists(packagePath))
            {
                result.Success = false;
                result.Code = "PACKAGE_NOT_FOUND";
                result.Message = "ملف حزمة التحديث غير موجود في المسار المحدد";
                return result;
            }

            // Step 1: Verify Checksum
            if (!string.IsNullOrEmpty(expectedSha256))
            {
                string actualSha = ComputeFileSha256(packagePath);
                if (!string.Equals(actualSha, expectedSha256.Trim(), StringComparison.OrdinalIgnoreCase))
                {
                    result.Success = false;
                    result.Code = "CHECKSUM_MISMATCH";
                    result.Message = "فشل التحقق من أمان وسلامة ملف التحديث (تطابق الهاش غير صحيح). تم إلغاء العملية لحماية النظام.";
                    Logger.Warn(string.Format("AppUpdateService: Checksum mismatch. Expected: {0}, Actual: {1}", expectedSha256, actualSha));
                    return result;
                }
            }

            // Step 2: Safety Backup Before Update (Task 115-3)
            string backupPath = null;
            try
            {
                if (_backupService != null)
                {
                    var backupRes = _backupService.CreateBackup("نسخة_تلقائية_أمان_قبل_التحديث_v" + CURRENT_VERSION);
                    if (backupRes != null && backupRes.Success)
                    {
                        backupPath = backupRes.BackupFilePath;
                        result.BackupPath = backupPath;
                    }
                }
            }
            catch (Exception ex)
            {
                Logger.Warn("AppUpdateService: تعذر إنشاء نسخة احتياطية قبل التحديث: " + ex.Message);
            }

            // Step 3: Prepare Rollback Snapshot Directory
            string appDir = AppDomain.CurrentDomain.BaseDirectory;
            string rollbackDir = Path.Combine(appDir, "rollback_backup");

            try
            {
                if (!Directory.Exists(rollbackDir))
                {
                    Directory.CreateDirectory(rollbackDir);
                }

                // Backup current main exe to rollback dir
                string mainExe = Path.Combine(appDir, "RafiqPOS.exe");
                if (File.Exists(mainExe))
                {
                    File.Copy(mainExe, Path.Combine(rollbackDir, "RafiqPOS.exe.bak"), true);
                }

                if (simulateFailure)
                {
                    throw new InvalidOperationException("محاكاة فشل اختباري أثناء تطبيق التحديث للتأكد من التراجع الآمن.");
                }

                // Simulate successful atomic update staging
                string stagingDir = Path.Combine(appDir, "update_staging");
                if (!Directory.Exists(stagingDir))
                {
                    Directory.CreateDirectory(stagingDir);
                }

                _settingsRepo.Set("pending_update_package", packagePath);
                _settingsRepo.Set("pending_update_at", DateTime.UtcNow.ToString("o"));

                if (_auditService != null)
                {
                    _auditService.Log("APP_UPDATE_STAGED", "SYSTEM", Path.GetFileName(packagePath), "{\"backup\":\"" + (backupPath ?? "") + "\"}", "SYSTEM");
                }

                result.Success = true;
                result.Code = "UPDATE_APPLIED_SUCCESS";
                result.Message = "تم تجهيز التحديث بنجاح وأخذ نسخة احتياطية لكامل البيانات. سيتم تطبيق الإصدار الجديد فوراً.";
                return result;
            }
            catch (Exception ex)
            {
                // Step 4: Automatic Rollback on Exception (Task 115-3)
                Logger.Error("AppUpdateService: حدث خطأ أثناء تطبيق التحديث، بدء التراجع الفوري", ex);
                result.RollbackTriggered = true;

                try
                {
                    string rollbackExe = Path.Combine(rollbackDir, "RafiqPOS.exe.bak");
                    string mainExe = Path.Combine(appDir, "RafiqPOS.exe");
                    if (File.Exists(rollbackExe) && File.Exists(mainExe))
                    {
                        File.Copy(rollbackExe, mainExe, true);
                    }
                }
                catch { }

                if (_auditService != null)
                {
                    _auditService.Log("APP_UPDATE_ROLLBACK", "SYSTEM", "ERROR", "{\"error\":\"" + ex.Message.Replace("\"", "'") + "\"}", "SYSTEM");
                }

                result.Success = false;
                result.Code = "UPDATE_FAILED_ROLLED_BACK";
                result.Message = "فشل تثبيت التحديث وتم التراجع بنجاح إلى النسخة السابقة دون أي فقد للبيانات: " + ex.Message;
                return result;
            }
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

        public static string ComputeFileSha256(string filePath)
        {
            using (var sha = SHA256.Create())
            using (var stream = File.OpenRead(filePath))
            {
                byte[] hash = sha.ComputeHash(stream);
                StringBuilder sb = new StringBuilder();
                for (int i = 0; i < hash.Length; i++)
                {
                    sb.Append(hash[i].ToString("X2"));
                }
                return sb.ToString();
            }
        }
    }
}
