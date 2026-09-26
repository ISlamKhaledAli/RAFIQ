using System;
using System.IO;
using System.Net;
using System.Text;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
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
    }

    public class LicenseOperationResult
    {
        public bool Success { get; set; }
        public string Code { get; set; }
        public string Message { get; set; }
        public LicenseInfo License { get; set; }
    }

    public class LicenseService
    {
        private const string DEFAULT_SERVER_URL = "https://rafiq-license-server.khaledislam9003.workers.dev";
        private const string CLIENT_API_KEY = "rafiq_pos_client_secret_k9x2m4p8";
        private const int REQUEST_TIMEOUT_MS = 8000;

        private readonly SettingsRepository _settingsRepo;
        private readonly AuditLogService _auditService;

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
            string statusLabel = "نسخة تجريبية / غير مفعلة";

            if (!string.IsNullOrEmpty(key) && !string.IsNullOrEmpty(token) && status == "active")
            {
                isActive = true;
                statusLabel = licType == "lifetime" ? "ترخيص دائم نشط (مدى الحياة)" : "ترخيص سنوي نشط";
            }
            else if (status == "disabled")
            {
                statusLabel = "ترخيص معطل أو ملغي";
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

            return info;
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
            string fp = EncryptionService.GenerateDeviceFingerprint();

            if (string.IsNullOrEmpty(token))
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
                            result.Success = false;
                            result.Code = json["code"] != null ? json["code"].ToString() : "VERIFICATION_FAILED";
                            result.Message = json["message"] != null ? json["message"].ToString() : "فشل التحقق من الترخيص";
                            return result;
                        }
                    }
                    catch { }
                }

                // If offline, the POS remains operational using the locally stored cryptographic token
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
                return result;
            }

            result.License = GetLicenseInfo();
            return result;
        }
    }
}
