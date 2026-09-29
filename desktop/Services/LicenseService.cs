using System;
using System.IO;
using System.Net;
using System.Text;
using System.Threading;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using RafiqPOS.Common;
using RafiqPOS.Repositories;

namespace RafiqPOS.Services
{
    public class LicenseInfo
    {
        public bool IsActive { get; set; }
        public string LicenseKey { get; set; }
        public string ShopName { get; set; }
        public string LicenseType { get; set; }
        public string Status { get; set; }
        public string StatusLabel { get; set; }
        public string DeviceFingerprint { get; set; }
        public string ActivatedAt { get; set; }
        public string ExpiresAt { get; set; }
        public bool IsOfflineMode { get; set; }
        public bool IsExpired { get; set; }
        public int DaysRemaining { get; set; }
        public bool ClockTampered { get; set; }
        public string ClockTamperMessage { get; set; }
    }

    public class LicenseCheckExpiryResult
    {
        public bool IsActive { get; set; }
        public bool IsExpired { get; set; }
        public string Status { get; set; } // "active", "warning", "expired", "disabled"
        public string StatusLabel { get; set; }
        public int DaysRemaining { get; set; }
        public string ExpiresAt { get; set; }
        public bool ClockTampered { get; set; }
        public string ClockTamperMessage { get; set; }
        public string LicenseType { get; set; }
        public string ShopName { get; set; }
        public string DeviceFingerprint { get; set; }
    }

    public class LicenseOperationResult
    {
        public bool Success { get; set; }
        public string Code { get; set; }
        public string Message { get; set; }
        public LicenseInfo License { get; set; }
    }

    public class LicenseService : IDisposable
    {
        private const string DEFAULT_SERVER_URL = "https://rafiq-license-server.khaledislam9003.workers.dev";
        private const string CLIENT_API_KEY = "rafiq_pos_client_secret_k9x2m4p8";
        private const int REQUEST_TIMEOUT_MS = 8000;

        private readonly SettingsRepository _settingsRepo;
        private readonly AuditLogService _auditService;
        private Timer _backgroundSyncTimer;

        public LicenseService(SettingsRepository settingsRepo, AuditLogService auditService)
        {
            this._settingsRepo = settingsRepo;
            this._auditService = auditService;
        }

        public LicenseInfo GetLicenseInfo()
        {
            string key = _settingsRepo.Get("license_key", "");
            string token = _settingsRepo.Get("license_token", "");
            string status = _settingsRepo.Get("license_status", "");
            string shopName = _settingsRepo.Get("license_shop_name", _settingsRepo.Get("store_name", "سوبرماركت رفيق"));
            string licType = _settingsRepo.Get("license_type", "lifetime");
            string activatedAt = _settingsRepo.Get("license_activated_at", "");
            string expiresAt = _settingsRepo.Get("license_expires_at", "");
            string fp = EncryptionService.GenerateDeviceFingerprint();

            bool isActive = false;
            bool isExpired = false;
            int daysRemaining = 9999;
            string statusLabel = "نسخة تجريبية / غير مفعلة";

            // 1. Clock Tampering Detection (Feature #171 / Task 171-2)
            bool clockTampered = false;
            string clockTamperMessage = "";

            string lastKnownStr = _settingsRepo.Get("last_known_utc", "");
            DateTime lastKnownUtc;
            if (DateTime.TryParse(lastKnownStr, System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.AdjustToUniversal | System.Globalization.DateTimeStyles.AssumeUniversal, out lastKnownUtc))
            {
                // If system clock is more than 5 minutes behind last recorded UTC, clock was rolled back
                if (DateTime.UtcNow < lastKnownUtc.AddMinutes(-5))
                {
                    clockTampered = true;
                    TimeSpan diff = lastKnownUtc - DateTime.UtcNow;
                    clockTamperMessage = string.Format(
                        "تنبيه أمان: تم رصد تراجع في ساعة النظام بمقدار {0} دقيقة.\n" +
                        "آخر وقت مسجل: {1} (UTC)\n" +
                        "توقيت الجهاز الحالي: {2} (UTC)\n" +
                        "يرجى ضبط ساعة الجهاز وتاريخه بشكل صحيح لمتابعة العمل.",
                        Math.Round(diff.TotalMinutes),
                        lastKnownUtc.ToString("yyyy-MM-dd HH:mm:ss"),
                        DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss")
                    );
                    Logger.Warn("LicenseService: اكتشاف تلاعب في ساعة النظام: " + clockTamperMessage);
                }
            }

            // Check TimeGuard from sales/audit logs as well
            if (!clockTampered && DatabaseService.ConnectionString != null)
            {
                try
                {
                    ClockValidationResult clockVal = TimeGuard.ValidateSystemClock(DatabaseService.ConnectionString);
                    if (!clockVal.IsValid && clockVal.Code == "CLOCK_BACKWARDS")
                    {
                        clockTampered = true;
                        clockTamperMessage = clockVal.Message;
                    }
                }
                catch { }
            }

            // 2. Base Activation State
            if (!string.IsNullOrEmpty(key) && !string.IsNullOrEmpty(token) && status == "active")
            {
                isActive = true;
                statusLabel = licType == "lifetime" ? "ترخيص دائم نشط (مدى الحياة)" : "ترخيص نشط";
            }
            else if (status == "disabled")
            {
                statusLabel = "ترخيص معطل أو ملغي من الإدارة";
            }
            else if (status == "expired")
            {
                isExpired = true;
                statusLabel = "انتهت فترة الاشتراك";
            }

            // 3. Expiration Check against UTC (Feature #171 / Task 171-1)
            DateTime expiresAtUtc;
            if (!string.IsNullOrEmpty(expiresAt) && DateTime.TryParse(expiresAt, System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.AdjustToUniversal | System.Globalization.DateTimeStyles.AssumeUniversal, out expiresAtUtc))
            {
                DateTime nowUtc = DateTime.UtcNow;
                TimeSpan diff = expiresAtUtc - nowUtc;
                daysRemaining = (int)Math.Ceiling(diff.TotalDays);
                if (daysRemaining < 0) daysRemaining = 0;

                if (diff.TotalSeconds <= 0)
                {
                    isActive = false;
                    isExpired = true;
                    status = "expired";
                    statusLabel = "انتهت فترة الاشتراك في " + expiresAtUtc.ToString("yyyy-MM-dd");
                    _settingsRepo.Set("license_status", "expired");
                }
                else if (isActive)
                {
                    if (daysRemaining <= 7)
                    {
                        statusLabel = string.Format("ترخيص نشط (ينتهي خلال {0} أيام)", daysRemaining);
                    }
                    else
                    {
                        statusLabel = string.Format("ترخيص نشط حتى {0}", expiresAtUtc.ToString("yyyy-MM-dd"));
                    }
                }
            }

            // If clock tampering is detected, block license immediately
            if (clockTampered)
            {
                isActive = false;
                isExpired = true;
                status = "expired";
                statusLabel = "توقف النظام بسبب عدم دقة ساعة الجهاز";
            }
            else
            {
                // Advance last_known_utc forward safely
                RecordKnownUtc();
            }

            LicenseInfo info = new LicenseInfo();
            info.IsActive = isActive;
            info.LicenseKey = key;
            info.ShopName = shopName;
            info.LicenseType = licType;
            info.Status = string.IsNullOrEmpty(status) ? "trial" : status;
            info.StatusLabel = statusLabel;
            info.DeviceFingerprint = fp;
            info.ActivatedAt = activatedAt;
            info.ExpiresAt = expiresAt;
            info.IsOfflineMode = true;
            info.IsExpired = isExpired;
            info.DaysRemaining = daysRemaining;
            info.ClockTampered = clockTampered;
            info.ClockTamperMessage = clockTamperMessage;

            return info;
        }

        public LicenseCheckExpiryResult CheckExpiry()
        {
            LicenseInfo info = GetLicenseInfo();
            string expiryStatus = "active";

            if (!info.IsActive)
            {
                expiryStatus = info.Status == "disabled" ? "disabled" : "expired";

                // If expired locally, trigger background online check so extensions reflect automatically
                TriggerAsyncVerifyIfExpired();
            }
            else if (info.DaysRemaining <= 7 && !string.IsNullOrEmpty(info.ExpiresAt))
            {
                expiryStatus = "warning";
            }

            LicenseCheckExpiryResult result = new LicenseCheckExpiryResult();
            result.IsActive = info.IsActive;
            result.IsExpired = info.IsExpired || !info.IsActive;
            result.Status = expiryStatus;
            result.StatusLabel = info.StatusLabel;
            result.DaysRemaining = info.DaysRemaining;
            result.ExpiresAt = info.ExpiresAt;
            result.ClockTampered = info.ClockTampered;
            result.ClockTamperMessage = info.ClockTamperMessage;
            result.LicenseType = info.LicenseType;
            result.ShopName = info.ShopName;
            result.DeviceFingerprint = info.DeviceFingerprint;

            return result;
        }

        private void TriggerAsyncVerifyIfExpired()
        {
            try
            {
                string lastAttemptStr = _settingsRepo.Get("last_online_verify_attempt", "");
                DateTime lastAttempt;
                if (DateTime.TryParse(lastAttemptStr, System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.AdjustToUniversal | System.Globalization.DateTimeStyles.AssumeUniversal, out lastAttempt))
                {
                    if ((DateTime.UtcNow - lastAttempt).TotalSeconds < 30)
                    {
                        return;
                    }
                }

                ThreadPool.QueueUserWorkItem(delegate(object state)
                {
                    try
                    {
                        VerifyLicenseOnline();
                    }
                    catch { }
                });
            }
            catch { }
        }

        public bool IsLicenseExpired()
        {
            LicenseInfo info = GetLicenseInfo();
            return !info.IsActive || info.IsExpired || info.ClockTampered || info.Status == "expired" || info.Status == "disabled";
        }

        public void RecordKnownUtc()
        {
            try
            {
                string lastKnownStr = _settingsRepo.Get("last_known_utc", "");
                DateTime lastKnown;
                if (!DateTime.TryParse(lastKnownStr, System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.AdjustToUniversal | System.Globalization.DateTimeStyles.AssumeUniversal, out lastKnown)
                    || DateTime.UtcNow > lastKnown)
                {
                    _settingsRepo.Set("last_known_utc", DateTime.UtcNow.ToString("o"));
                }
            }
            catch { }
        }

        public LicenseOperationResult ActivateLicense(string licenseKey)
        {
            LicenseOperationResult result = new LicenseOperationResult();

            if (string.IsNullOrEmpty(licenseKey) || string.IsNullOrEmpty(licenseKey.Trim()))
            {
                result.Success = false;
                result.Code = "EMPTY_KEY";
                result.Message = "يرجى إدخال رمز الترخيص أولاً";
                return result;
            }

            string cleanKey = licenseKey.Trim().ToUpperInvariant();
            string fp = EncryptionService.GenerateDeviceFingerprint();
            string machineName = Environment.MachineName;

            try
            {
                // Ensure TLS 1.2 is enabled for Cloudflare HTTPS communication on .NET 4.8 / Windows 7
                ServicePointManager.SecurityProtocol = ServicePointManager.SecurityProtocol | SecurityProtocolType.Tls12;

                string activateUrl = DEFAULT_SERVER_URL + "/api/activate";
                HttpWebRequest request = (HttpWebRequest)WebRequest.Create(activateUrl);
                request.Method = "POST";
                request.ContentType = "application/json; charset=utf-8";
                request.Headers.Add("X-Rafiq-Api-Key", CLIENT_API_KEY);
                request.Timeout = REQUEST_TIMEOUT_MS;
                request.ReadWriteTimeout = REQUEST_TIMEOUT_MS;

                var payload = new
                {
                    license_key = cleanKey,
                    machine_fingerprint = fp,
                    device_name = machineName,
                    app_version = "1.0.0"
                };

                byte[] postBytes = Encoding.UTF8.GetBytes(JsonConvert.SerializeObject(payload));
                request.ContentLength = postBytes.Length;

                using (Stream reqStream = request.GetRequestStream())
                {
                    reqStream.Write(postBytes, 0, postBytes.Length);
                }

                using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
                {
                    using (StreamReader reader = new StreamReader(response.GetResponseStream(), Encoding.UTF8))
                    {
                        string responseText = reader.ReadToEnd();
                        JObject json = JObject.Parse(responseText);

                        if (json["success"] != null && (bool)json["success"])
                        {
                            string token = json["token"] != null ? json["token"].ToString() : "";
                            JToken licData = json["license"];

                            string shop = licData != null && licData["shop_name"] != null ? licData["shop_name"].ToString() : "";
                            string type = licData != null && licData["type"] != null ? licData["type"].ToString() : "lifetime";
                            string status = licData != null && licData["status"] != null ? licData["status"].ToString() : "active";
                            string activated = licData != null && licData["activated_at"] != null ? licData["activated_at"].ToString() : DateTime.Now.ToString("yyyy-MM-dd HH:mm");
                            string expires = licData != null && licData["expires_at"] != null ? licData["expires_at"].ToString() : "";

                            _settingsRepo.Set("license_key", cleanKey);
                            _settingsRepo.Set("license_token", token);
                            _settingsRepo.Set("license_status", status);
                            if (!string.IsNullOrEmpty(shop)) _settingsRepo.Set("license_shop_name", shop);
                            _settingsRepo.Set("license_type", type);
                            _settingsRepo.Set("license_activated_at", activated);
                            _settingsRepo.Set("license_expires_at", expires);
                            _settingsRepo.Set("last_known_utc", DateTime.UtcNow.ToString("o"));
                            _settingsRepo.Set("last_online_verify_at", DateTime.UtcNow.ToString("o"));

                            if (_auditService != null)
                            {
                                _auditService.Log("LICENSE_ACTIVATED", "SYSTEM", cleanKey, "{\"shopName\":\"" + shop + "\"}", "SYSTEM");
                            }

                            result.Success = true;
                            result.Code = "ACTIVATION_SUCCESS";
                            result.Message = json["message"] != null ? json["message"].ToString() : "تم تفعيل الترخيص السحابي بنجاح!";
                            result.License = GetLicenseInfo();
                            return result;
                        }
                        else
                        {
                            result.Success = false;
                            result.Code = json["code"] != null ? json["code"].ToString() : "ACTIVATION_FAILED";
                            result.Message = json["message"] != null ? json["message"].ToString() : "فشل تفعيل الترخيص من السيرفر";
                            return result;
                        }
                    }
                }
            }
            catch (WebException webEx)
            {
                if (webEx.Response != null)
                {
                    try
                    {
                        using (StreamReader reader = new StreamReader(webEx.Response.GetResponseStream(), Encoding.UTF8))
                        {
                            string errJson = reader.ReadToEnd();
                            JObject json = JObject.Parse(errJson);
                            result.Success = false;
                            result.Code = json["code"] != null ? json["code"].ToString() : "SERVER_ERROR";
                            result.Message = json["message"] != null ? json["message"].ToString() : "رفض خادم التراخيص الطلب";
                            return result;
                        }
                    }
                    catch
                    {
                        // Fallback below
                    }
                }

                result.Success = false;
                result.Code = "NETWORK_ERROR";
                result.Message = "تعذر الاتصال بسيرفر التراخيص السحابي. يرجى التأكد من اتصال الإنترنت وإعادة المحاولة.";
                return result;
            }
            catch (Exception ex)
            {
                result.Success = false;
                result.Code = "UNEXPECTED_ERROR";
                result.Message = "حدث خطأ غير متوقع أثناء تفعيل الترخيص: " + ex.Message;
                return result;
            }
        }

        public LicenseOperationResult VerifyLicenseOnline()
        {
            LicenseOperationResult result = new LicenseOperationResult();
            string token = _settingsRepo.Get("license_token", "");
            string key = _settingsRepo.Get("license_key", "");
            string fp = EncryptionService.GenerateDeviceFingerprint();

            _settingsRepo.Set("last_online_verify_attempt", DateTime.UtcNow.ToString("o"));

            if (string.IsNullOrEmpty(token) && string.IsNullOrEmpty(key))
            {
                result.Success = false;
                result.Code = "NO_TOKEN";
                result.Message = "لا يوجد ترخيص مفعّل حالياً للتحقق منه";
                result.License = GetLicenseInfo();
                return result;
            }

            try
            {
                ServicePointManager.SecurityProtocol = ServicePointManager.SecurityProtocol | SecurityProtocolType.Tls12;
                string verifyUrl = DEFAULT_SERVER_URL + "/api/verify";
                HttpWebRequest request = (HttpWebRequest)WebRequest.Create(verifyUrl);
                request.Method = "POST";
                request.ContentType = "application/json; charset=utf-8";
                request.Headers.Add("X-Rafiq-Api-Key", CLIENT_API_KEY);
                request.Timeout = REQUEST_TIMEOUT_MS;
                request.ReadWriteTimeout = REQUEST_TIMEOUT_MS;

                var payload = new
                {
                    token = token,
                    license_key = key,
                    machine_fingerprint = fp
                };

                byte[] postBytes = Encoding.UTF8.GetBytes(JsonConvert.SerializeObject(payload));
                request.ContentLength = postBytes.Length;

                using (Stream reqStream = request.GetRequestStream())
                {
                    reqStream.Write(postBytes, 0, postBytes.Length);
                }

                using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
                {
                    using (StreamReader reader = new StreamReader(response.GetResponseStream(), Encoding.UTF8))
                    {
                        string responseText = reader.ReadToEnd();
                        JObject json = JObject.Parse(responseText);

                        if (json["success"] != null && (bool)json["success"])
                        {
                            // Save fresh cryptographically signed token issued by server (e.g. on license extension)
                            if (json["token"] != null && !string.IsNullOrEmpty(json["token"].ToString()))
                            {
                                _settingsRepo.Set("license_token", json["token"].ToString());
                            }

                            // Feature #171 / Task 171-4 & Feature #174 / Task 174-3
                            JToken details = json["details"];
                            if (details != null)
                            {
                                string status = details["status"] != null ? details["status"].ToString() : "active";
                                string licType = details["license_type"] != null ? details["license_type"].ToString() : "";
                                string expires = details["expires_at"] != null ? details["expires_at"].ToString() : "";
                                string shop = details["shop_name"] != null ? details["shop_name"].ToString() : "";

                                if (!string.IsNullOrEmpty(status)) _settingsRepo.Set("license_status", status);
                                if (!string.IsNullOrEmpty(licType)) _settingsRepo.Set("license_type", licType);
                                _settingsRepo.Set("license_expires_at", expires);
                                if (!string.IsNullOrEmpty(shop)) _settingsRepo.Set("license_shop_name", shop);
                            }

                            _settingsRepo.Set("last_online_verify_at", DateTime.UtcNow.ToString("o"));
                            RecordKnownUtc();

                            result.Success = true;
                            result.Code = "VERIFIED";
                            result.Message = json["message"] != null ? json["message"].ToString() : "الترخيص سارٍ ومعتمد لهذا الجهاز";
                            result.License = GetLicenseInfo();
                            return result;
                        }
                    }
                }
            }
            catch (WebException webEx)
            {
                if (webEx.Response != null)
                {
                    try
                    {
                        using (StreamReader reader = new StreamReader(webEx.Response.GetResponseStream(), Encoding.UTF8))
                        {
                            string errJson = reader.ReadToEnd();
                            JObject json = JObject.Parse(errJson);

                            string errCode = json["code"] != null ? json["code"].ToString() : "VERIFICATION_FAILED";
                            if (errCode == "LICENSE_REVOKED")
                            {
                                _settingsRepo.Set("license_status", "disabled");
                            }
                            else if (errCode == "LICENSE_EXPIRED")
                            {
                                _settingsRepo.Set("license_status", "expired");
                            }

                            result.Success = false;
                            result.Code = errCode;
                            result.Message = json["message"] != null ? json["message"].ToString() : "فشل التحقق من الترخيص";
                            result.License = GetLicenseInfo();
                            return result;
                        }
                    }
                    catch { }
                }

                // If offline, the POS remains operational using the locally stored cryptographic token & local expiration
                result.Success = true;
                result.Code = "OFFLINE_VALID";
                result.Message = "النظام يعمل أوفلاين مع الاحتفاظ بالترخيص المحلي المعتمد";
                result.License = GetLicenseInfo();
                return result;
            }
            catch (Exception ex)
            {
                result.Success = false;
                result.Code = "ERROR";
                result.Message = "خطأ أثناء التحقق: " + ex.Message;
                result.License = GetLicenseInfo();
                return result;
            }

            result.License = GetLicenseInfo();
            return result;
        }

        // Feature #174: Background Periodic Verification (Task 174-1, 174-2, 174-6)
        public void StartBackgroundPeriodicCheck()
        {
            if (_backgroundSyncTimer != null) return;

            _backgroundSyncTimer = new Timer(
                delegate(object state)
                {
                    try
                    {
                        // Dynamic rate limit: If license is expired or <= 1 day left, check every 1 minute.
                        // Otherwise, check at most every 15 minutes to preserve network/resources.
                        LicenseInfo currentInfo = GetLicenseInfo();
                        int minIntervalMinutes = (currentInfo.IsExpired || currentInfo.DaysRemaining <= 1) ? 1 : 15;

                        string lastAttemptStr = _settingsRepo.Get("last_online_verify_attempt", "");
                        DateTime lastAttempt;
                        if (DateTime.TryParse(lastAttemptStr, System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.AdjustToUniversal | System.Globalization.DateTimeStyles.AssumeUniversal, out lastAttempt))
                        {
                            if ((DateTime.UtcNow - lastAttempt).TotalMinutes < minIntervalMinutes)
                            {
                                return;
                            }
                        }

                        VerifyLicenseOnline();
                    }
                    catch (Exception ex)
                    {
                        Logger.Warn("خطأ في المؤقت الدوري لفحص الترخيص: " + ex.Message);
                    }
                },
                null,
                2000, // Initial delay 2s on startup so license extension reflects immediately
                60 * 1000 // Run timer every 60 seconds
            );
        }

        public void StopBackgroundPeriodicCheck()
        {
            if (_backgroundSyncTimer != null)
            {
                try { _backgroundSyncTimer.Dispose(); } catch { }
                _backgroundSyncTimer = null;
            }
        }

        public void Dispose()
        {
            StopBackgroundPeriodicCheck();
        }
    }
}

