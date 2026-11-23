using System;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
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

    public class AppUpdateDownloadState
    {
        public string State { get; set; } // idle | downloading | verifying | ready | error | cancelled
        public string TargetVersion { get; set; }
        public long BytesDownloaded { get; set; }
        public long TotalBytes { get; set; }
        public int Percent { get; set; }
        public string FileName { get; set; }
        public string Message { get; set; }
        public string ErrorMessage { get; set; }
        public bool IsVerified { get; set; }
    }

    public class AppUpdateLaunchResult
    {
        public bool Success { get; set; }
        public bool Launched { get; set; }
        public bool Cancelled { get; set; }
        public string Message { get; set; }
    }

    // Secure in-app update service:
    // Checks for releases, downloads the official Setup (.exe) into the user's %TEMP% folder, verifies its SHA-256
    // checksum and PE header automatically, and launches the verified official Setup via standard Windows UAC elevation.
    // The installed {app} folder remains strictly read-only; no updater scripts, ZIP extraction, or custom elevation hacks.
    public class AppUpdateService
    {
        // Single source of truth for the running version: the assembly version (AssemblyInfo.cs). The installer and
        // frontend/package.json must carry the same number (guarded by frontend/test/app_update.test.js).
        public static readonly string CurrentVersion = ReadAssemblyVersion();
        public const string DEFAULT_UPDATE_SERVER_URL = "https://licenses.rafiq-cloud.workers.dev/api/updates/check";
        public const string FALLBACK_UPDATE_SERVER_URL = "https://licenses.khaledislam9003.workers.dev/api/updates/check";
        private const int NETWORK_TIMEOUT_MS = 7000;
        private const int DOWNLOAD_TIMEOUT_MS = 30000;
        private const long MIN_INSTALLER_BYTES = 100L * 1024L;         // 100 KB sanity minimum
        private const long MAX_INSTALLER_BYTES = 600L * 1024L * 1024L; // 600 MB sanity maximum

        private readonly SettingsRepository _settingsRepo;
        private readonly object _downloadLock = new object();

        private AppUpdateInfo _lastCheckedUpdate;
        private AppUpdateDownloadState _downloadState = new AppUpdateDownloadState { State = "idle" };
        private volatile bool _cancelRequested = false;
        private string _verifiedSetupPath;
        private string _verifiedSetupSha256;
        private string _verifiedSetupVersion;

        public AppUpdateService(SettingsRepository settingsRepo)
        {
            this._settingsRepo = settingsRepo;
        }

        private static string ReadAssemblyVersion()
        {
            Version v = typeof(AppUpdateService).Assembly.GetName().Version;
            if (v == null) return "0.0.0";
            string text = string.Format("{0}.{1}.{2}", v.Major, v.Minor, Math.Max(0, v.Build));
            if (v.Revision > 0) text = text + "." + v.Revision;
            return text;
        }

        public AppUpdateInfo CheckForUpdates(string manifestJsonOrUrl = null)
        {
            AppUpdateInfo info = new AppUpdateInfo();
            info.CurrentVersion = CurrentVersion;
            info.HasUpdate = false;
            // Eligible unless the server says otherwise, so a network error is reported as an error and not as a licence problem
            info.IsEligible = true;

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

                    // Only HTTPS manifests are fetched (the licence key and device id are attached for the official server)
                    if (!targetUrl.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
                    {
                        info.ErrorMessage = "عنوان خادم التحديثات غير آمن (يجب أن يبدأ بـ https).";
                        return info;
                    }

                    // Automatically attach license and machine identity if querying the official server
                    if (targetUrl.StartsWith(DEFAULT_UPDATE_SERVER_URL, StringComparison.OrdinalIgnoreCase))
                    {
                        string licKey = _settingsRepo != null ? _settingsRepo.Get("license_key", "") : "";
                        string fp = EncryptionService.GenerateDeviceFingerprint();
                        string sep = targetUrl.Contains("?") ? "&" : "?";
                        targetUrl = string.Format("{0}{1}version={2}&license_key={3}&machine_fingerprint={4}",
                            targetUrl, sep, Uri.EscapeDataString(CurrentVersion), Uri.EscapeDataString(licKey), Uri.EscapeDataString(fp));
                    }

                    HttpWebRequest request = (HttpWebRequest)WebRequest.Create(targetUrl);
                    request.Method = "GET";
                    request.Timeout = NETWORK_TIMEOUT_MS;
                    request.ReadWriteTimeout = NETWORK_TIMEOUT_MS;
                    request.UserAgent = "RafiqPOS/" + CurrentVersion + " (.NET4.8; Win7-11)";

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
                    else if (!string.IsNullOrEmpty(remoteVer) && CompareVersions(remoteVer, CurrentVersion) > 0)
                    {
                        info.HasUpdate = true;
                    }

                    lock (_downloadLock)
                    {
                        if (info.HasUpdate && info.IsEligible)
                        {
                            _lastCheckedUpdate = info;
                            // If a verified setup for a different version/hash was cached in memory, reset idle state
                            if (_downloadState.State == "ready" &&
                                (!string.Equals(_verifiedSetupVersion, info.LatestVersion, StringComparison.OrdinalIgnoreCase) ||
                                 !string.Equals(_verifiedSetupSha256, (info.Sha256 ?? "").Trim(), StringComparison.OrdinalIgnoreCase)))
                            {
                                _verifiedSetupPath = null;
                                _verifiedSetupSha256 = null;
                                _verifiedSetupVersion = null;
                                _downloadState = new AppUpdateDownloadState { State = "idle" };
                            }
                        }
                        else if (!info.HasUpdate && string.IsNullOrEmpty(info.ErrorMessage))
                        {
                            _lastCheckedUpdate = null;
                        }
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
                // Server answered with an HTTP error vs. no connection at all
                if (webEx.Status == WebExceptionStatus.ProtocolError)
                {
                    info.ErrorMessage = "خادم التحديثات رد بخطأ مؤقت، حاول لاحقاً: " + webEx.Message;
                }
                else
                {
                    info.ErrorMessage = "تعذر الاتصال بخادم التحديثات (تأكد من اتصال الإنترنت): " + webEx.Message;
                }
                Logger.Warn("AppUpdateService: فشل فحص التحديثات أونلاين: " + webEx.Message);
            }
            catch (Exception ex)
            {
                info.ErrorMessage = "خطأ أثناء التحقق من التحديث: " + ex.Message;
                Logger.Error("AppUpdateService: خطأ أثناء فحص التحديث", ex);
            }

            return info;
        }

        public AppUpdateDownloadState GetDownloadState()
        {
            lock (_downloadLock)
            {
                return CloneDownloadState(_downloadState);
            }
        }

        public AppUpdateDownloadState StartDownload()
        {
            AppUpdateInfo target;
            lock (_downloadLock)
            {
                if (_downloadState.State == "downloading" || _downloadState.State == "verifying")
                {
                    return CloneDownloadState(_downloadState);
                }

                target = _lastCheckedUpdate;
                if (target == null || !target.HasUpdate || !target.IsEligible)
                {
                    _downloadState = new AppUpdateDownloadState
                    {
                        State = "error",
                        ErrorMessage = "لا يوجد تحديث مؤهل للتنزيل حالياً. اضغط على فحص التحديثات أولاً."
                    };
                    return CloneDownloadState(_downloadState);
                }

                string urlError = ValidateInstallerUrl(target.DownloadUrl);
                if (urlError != null)
                {
                    _downloadState = new AppUpdateDownloadState
                    {
                        State = "error",
                        TargetVersion = target.LatestVersion,
                        ErrorMessage = urlError
                    };
                    return CloneDownloadState(_downloadState);
                }

                string expectedSha = (target.Sha256 ?? "").Trim();
                if (!IsValidSha256(expectedSha))
                {
                    _downloadState = new AppUpdateDownloadState
                    {
                        State = "error",
                        TargetVersion = target.LatestVersion,
                        ErrorMessage = "بصمة التحقق الأمنية (SHA-256) لهذا الإصدار غير متوفرة أو غير صالحة."
                    };
                    return CloneDownloadState(_downloadState);
                }

                string fileName = BuildSafeInstallerFileName(target.LatestVersion);
                string finalPath = Path.Combine(GetTempDownloadFolder(), fileName);

                // Reuse already-downloaded Setup if it already passes PE + SHA-256 verification
                if (File.Exists(finalPath) && VerifyInstallerFile(finalPath, expectedSha))
                {
                    FileInfo fi = new FileInfo(finalPath);
                    _verifiedSetupPath = finalPath;
                    _verifiedSetupSha256 = expectedSha;
                    _verifiedSetupVersion = target.LatestVersion;
                    _downloadState = new AppUpdateDownloadState
                    {
                        State = "ready",
                        TargetVersion = target.LatestVersion,
                        BytesDownloaded = fi.Length,
                        TotalBytes = fi.Length,
                        Percent = 100,
                        FileName = fileName,
                        Message = "تم تنزيل التحديث والتحقق من سلامته بنجاح وجاهز للتثبيت.",
                        IsVerified = true
                    };
                    return CloneDownloadState(_downloadState);
                }

                _cancelRequested = false;
                _verifiedSetupPath = null;
                _verifiedSetupSha256 = null;
                _verifiedSetupVersion = null;
                _downloadState = new AppUpdateDownloadState
                {
                    State = "downloading",
                    TargetVersion = target.LatestVersion,
                    BytesDownloaded = 0,
                    TotalBytes = target.FileSizeBytes > 0 ? target.FileSizeBytes : 0,
                    Percent = 0,
                    FileName = fileName,
                    Message = "جاري تنزيل ملف التحديث الرسمي...",
                    IsVerified = false
                };

                string downloadUrl = target.DownloadUrl.Trim();
                long expectedSize = target.FileSizeBytes;
                string version = target.LatestVersion;

                Thread worker = new Thread(delegate()
                {
                    DownloadAndVerifyWorker(downloadUrl, expectedSha, version, expectedSize, fileName, finalPath);
                });
                worker.IsBackground = true;
                worker.Name = "RafiqUpdateDownload";
                worker.Start();

                return CloneDownloadState(_downloadState);
            }
        }

        public AppUpdateDownloadState CancelDownload()
        {
            lock (_downloadLock)
            {
                if (_downloadState.State == "downloading" || _downloadState.State == "verifying")
                {
                    _cancelRequested = true;
                    _downloadState.Message = "جاري إلغاء التنزيل...";
                }
                return CloneDownloadState(_downloadState);
            }
        }

        public AppUpdateLaunchResult LaunchVerifiedInstaller()
        {
            string setupPath;
            string expectedSha;

            lock (_downloadLock)
            {
                if (_downloadState.State != "ready" || string.IsNullOrEmpty(_verifiedSetupPath) || string.IsNullOrEmpty(_verifiedSetupSha256))
                {
                    return new AppUpdateLaunchResult
                    {
                        Success = false,
                        Launched = false,
                        Message = "لم يتم تنزيل ملف التحديث والتحقق منه بعد."
                    };
                }
                setupPath = _verifiedSetupPath;
                expectedSha = _verifiedSetupSha256;
            }

            if (!File.Exists(setupPath))
            {
                lock (_downloadLock)
                {
                    _verifiedSetupPath = null;
                    _verifiedSetupSha256 = null;
                    _downloadState = new AppUpdateDownloadState
                    {
                        State = "error",
                        ErrorMessage = "لم يتم العثور على ملف التحديث المؤقت. يرجى إعادة التنزيل."
                    };
                }
                return new AppUpdateLaunchResult
                {
                    Success = false,
                    Launched = false,
                    Message = "لم يتم العثور على ملف التحديث المؤقت. يرجى إعادة التنزيل."
                };
            }

            // Anti-TOCTOU check: re-verify PE header and SHA-256 immediately before launching the installer
            if (!VerifyInstallerFile(setupPath, expectedSha))
            {
                SafeDeleteFile(setupPath);
                lock (_downloadLock)
                {
                    _verifiedSetupPath = null;
                    _verifiedSetupSha256 = null;
                    _downloadState = new AppUpdateDownloadState
                    {
                        State = "error",
                        ErrorMessage = "تغيرت بصمة ملف التحديث قبل التشغيل؛ تم حذفه تلقائياً لحماية جهازك. يرجى إعادة التنزيل."
                    };
                }
                Logger.Warn("AppUpdateService: فشل إعادة التحقق من SHA-256 قبل تشغيل المثبت، تم حذف الملف.");
                return new AppUpdateLaunchResult
                {
                    Success = false,
                    Launched = false,
                    Message = "فشل التحقق الأمني من ملف التحديث قبل التشغيل؛ تم حذفه لحماية جهازك. يرجى إعادة التنزيل."
                };
            }

            try
            {
                // Standard Windows Shell execution: Inno Setup's own embedded UAC manifest requests elevation cleanly.
                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = setupPath;
                psi.UseShellExecute = true;
                Process.Start(psi);

                Logger.Info("AppUpdateService: تم تشغيل مثبت التحديث الرسمي بنجاح: " + Path.GetFileName(setupPath));
                return new AppUpdateLaunchResult
                {
                    Success = true,
                    Launched = true,
                    Cancelled = false,
                    Message = "تم تشغيل مثبت التحديث الرسمي بنجاح. جاري إغلاق رفيق لإكمال التثبيت..."
                };
            }
            catch (Win32Exception wex)
            {
                // 1223 = ERROR_CANCELLED (user clicked "No" on Windows UAC prompt)
                if (wex.NativeErrorCode == 1223)
                {
                    Logger.Info("AppUpdateService: ألغى المستخدم نافذة صلاحيات ويندوز (UAC) عند تشغيل المثبت.");
                    return new AppUpdateLaunchResult
                    {
                        Success = false,
                        Launched = false,
                        Cancelled = true,
                        Message = "تم إلغاء تشغيل المثبت من نافذة صلاحيات ويندوز. يمكنك المحاولة مرة أخرى في أي وقت."
                    };
                }
                Logger.Error("AppUpdateService: فشل تشغيل مثبت التحديث (Win32)", wex);
                return new AppUpdateLaunchResult
                {
                    Success = false,
                    Launched = false,
                    Message = "تعذر تشغيل مثبت التحديث: " + wex.Message
                };
            }
            catch (Exception ex)
            {
                Logger.Error("AppUpdateService: فشل تشغيل مثبت التحديث", ex);
                return new AppUpdateLaunchResult
                {
                    Success = false,
                    Launched = false,
                    Message = "تعذر تشغيل مثبت التحديث: " + ex.Message
                };
            }
        }

        private void DownloadAndVerifyWorker(string downloadUrl, string expectedSha, string targetVersion, long expectedSize, string fileName, string finalPath)
        {
            string partPath = finalPath + ".part";
            try
            {
                string folder = Path.GetDirectoryName(finalPath);
                if (!Directory.Exists(folder))
                {
                    Directory.CreateDirectory(folder);
                }
                SafeDeleteFile(partPath);

                ServicePointManager.SecurityProtocol = ServicePointManager.SecurityProtocol | SecurityProtocolType.Tls12;
                HttpWebRequest request = (HttpWebRequest)WebRequest.Create(downloadUrl);
                request.Method = "GET";
                request.Timeout = DOWNLOAD_TIMEOUT_MS;
                request.ReadWriteTimeout = DOWNLOAD_TIMEOUT_MS;
                request.AllowAutoRedirect = true;
                request.MaximumAutomaticRedirections = 5;
                request.UserAgent = "RafiqPOS/" + CurrentVersion + " (.NET4.8; Win7-11)";

                using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
                {
                    // Ensure redirects stayed on HTTPS
                    if (response.ResponseUri == null || !string.Equals(response.ResponseUri.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase))
                    {
                        throw new InvalidOperationException("تم تحويل رابط التنزيل إلى اتصال غير آمن (غير HTTPS)، وتم إيقاف التنزيل.");
                    }

                    long contentLength = response.ContentLength > 0 ? response.ContentLength : expectedSize;
                    if (contentLength > MAX_INSTALLER_BYTES)
                    {
                        throw new InvalidOperationException("حجم ملف التحديث يتجاوز الحد الأقصى المسموح به.");
                    }

                    using (Stream responseStream = response.GetResponseStream())
                    using (FileStream fs = new FileStream(partPath, FileMode.Create, FileAccess.Write, FileShare.None, 65536))
                    {
                        byte[] buffer = new byte[65536];
                        long totalRead = 0;
                        int bytesRead;

                        while ((bytesRead = responseStream.Read(buffer, 0, buffer.Length)) > 0)
                        {
                            if (_cancelRequested)
                            {
                                fs.Close();
                                SafeDeleteFile(partPath);
                                lock (_downloadLock)
                                {
                                    _downloadState = new AppUpdateDownloadState
                                    {
                                        State = "cancelled",
                                        TargetVersion = targetVersion,
                                        FileName = fileName,
                                        Message = "تم إلغاء تنزيل التحديث."
                                    };
                                }
                                return;
                            }

                            totalRead += bytesRead;
                            if (totalRead > MAX_INSTALLER_BYTES)
                            {
                                throw new InvalidOperationException("حجم الملف المُنزَّل تجاوز الحد المسموح به.");
                            }

                            fs.Write(buffer, 0, bytesRead);

                            int percent = 0;
                            if (contentLength > 0)
                            {
                                percent = (int)Math.Min(99L, (totalRead * 100L) / contentLength);
                            }

                            lock (_downloadLock)
                            {
                                _downloadState.BytesDownloaded = totalRead;
                                _downloadState.TotalBytes = contentLength > 0 ? contentLength : totalRead;
                                _downloadState.Percent = percent;
                            }
                        }

                        if (totalRead < MIN_INSTALLER_BYTES)
                        {
                            throw new InvalidOperationException("الملف المُنزَّل غير مكتمل أو تالف (حجمه أصغر من المتوقع).");
                        }
                    }
                }

                if (_cancelRequested)
                {
                    SafeDeleteFile(partPath);
                    lock (_downloadLock)
                    {
                        _downloadState = new AppUpdateDownloadState
                        {
                            State = "cancelled",
                            TargetVersion = targetVersion,
                            FileName = fileName,
                            Message = "تم إلغاء تنزيل التحديث."
                        };
                    }
                    return;
                }

                // Transition to automatic SHA-256 + PE verification
                lock (_downloadLock)
                {
                    _downloadState.State = "verifying";
                    _downloadState.Percent = 100;
                    _downloadState.Message = "جاري التحقق التلقائي من سلامة ملف التحديث...";
                }

                if (!HasValidPeHeader(partPath))
                {
                    SafeDeleteFile(partPath);
                    throw new InvalidOperationException("الملف المُنزَّل ليس ملف تثبيت ويندوز صالحاً (.exe). تم حذفه تلقائياً.");
                }

                string actualSha = ComputeFileSha256(partPath);
                if (!string.Equals(actualSha, expectedSha, StringComparison.OrdinalIgnoreCase))
                {
                    SafeDeleteFile(partPath);
                    Logger.Warn(string.Format("AppUpdateService: عدم تطابق SHA-256 (المتوقع: {0}، الفعلي: {1}).", expectedSha, actualSha));
                    throw new InvalidOperationException("فشل التحقق الأمني (SHA-256) من ملف التحديث؛ تم حذف الملف تلقائياً لحماية جهازك.");
                }

                SafeDeleteFile(finalPath);
                File.Move(partPath, finalPath);
                FileInfo finalInfo = new FileInfo(finalPath);

                lock (_downloadLock)
                {
                    _verifiedSetupPath = finalPath;
                    _verifiedSetupSha256 = expectedSha;
                    _verifiedSetupVersion = targetVersion;
                    _downloadState = new AppUpdateDownloadState
                    {
                        State = "ready",
                        TargetVersion = targetVersion,
                        BytesDownloaded = finalInfo.Length,
                        TotalBytes = finalInfo.Length,
                        Percent = 100,
                        FileName = fileName,
                        Message = "تم تنزيل التحديث والتحقق من سلامته بنجاح وجاهز للتثبيت.",
                        IsVerified = true
                    };
                }
                Logger.Info("AppUpdateService: اكتمل تنزيل والتحقق من ملف التحديث بنجاح: " + fileName);
            }
            catch (WebException webEx)
            {
                SafeDeleteFile(partPath);
                string msg = webEx.Status == WebExceptionStatus.ProtocolError
                    ? "تعذر تنزيل ملف التحديث من الخادم حالياً. حاول مرة أخرى لاحقاً."
                    : "انقطع الاتصال بالإنترنت أثناء تنزيل التحديث. تأكد من الاتصال وحاول مرة أخرى.";
                Logger.Warn("AppUpdateService: فشل تنزيل التحديث: " + webEx.Message);
                lock (_downloadLock)
                {
                    _downloadState = new AppUpdateDownloadState
                    {
                        State = "error",
                        TargetVersion = targetVersion,
                        FileName = fileName,
                        ErrorMessage = msg
                    };
                }
            }
            catch (Exception ex)
            {
                SafeDeleteFile(partPath);
                Logger.Error("AppUpdateService: خطأ أثناء تنزيل أو التحقق من التحديث", ex);
                lock (_downloadLock)
                {
                    _downloadState = new AppUpdateDownloadState
                    {
                        State = "error",
                        TargetVersion = targetVersion,
                        FileName = fileName,
                        ErrorMessage = ex.Message
                    };
                }
            }
        }

        public static string ValidateInstallerUrl(string url)
        {
            if (string.IsNullOrEmpty(url) || string.IsNullOrEmpty(url.Trim()))
            {
                return "لا يوجد رابط تنزيل متاح لهذا الإصدار حالياً.";
            }

            Uri uri;
            if (!Uri.TryCreate(url.Trim(), UriKind.Absolute, out uri) ||
                !string.Equals(uri.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase) ||
                string.IsNullOrEmpty(uri.Host))
            {
                return "رابط تنزيل التحديث غير آمن (يجب أن يبدأ بـ https).";
            }

            string path = uri.AbsolutePath ?? "";
            if (path.EndsWith(".zip", StringComparison.OrdinalIgnoreCase))
            {
                return "رابط التحديث المنشور على الخادم يشير إلى حزمة مضغوطة (.zip) وليس ملف التثبيت الرسمي (.exe). يرجى رفع ملف التثبيت (RafiqPOS_Setup) على لوحة التحديثات.";
            }

            if (!path.EndsWith(".exe", StringComparison.OrdinalIgnoreCase))
            {
                return "رابط التحديث يجب أن يشير إلى ملف التثبيت الرسمي (.exe).";
            }

            return null;
        }

        public static bool IsValidSha256(string hash)
        {
            if (string.IsNullOrEmpty(hash)) return false;
            string trimmed = hash.Trim();
            if (trimmed.Length != 64) return false;
            for (int i = 0; i < trimmed.Length; i++)
            {
                char c = trimmed[i];
                bool isHex = (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F');
                if (!isHex) return false;
            }
            return true;
        }

        public static string ComputeFileSha256(string filePath)
        {
            using (SHA256 sha = SHA256.Create())
            using (FileStream stream = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.Read, 65536))
            {
                byte[] hashBytes = sha.ComputeHash(stream);
                StringBuilder sb = new StringBuilder(64);
                for (int i = 0; i < hashBytes.Length; i++)
                {
                    sb.Append(hashBytes[i].ToString("x2"));
                }
                return sb.ToString();
            }
        }

        public static bool HasValidPeHeader(string filePath)
        {
            try
            {
                using (FileStream fs = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.Read))
                {
                    if (fs.Length < 2) return false;
                    int b0 = fs.ReadByte();
                    int b1 = fs.ReadByte();
                    return b0 == 0x4D && b1 == 0x5A; // 'M', 'Z'
                }
            }
            catch
            {
                return false;
            }
        }

        private static bool VerifyInstallerFile(string filePath, string expectedSha256)
        {
            try
            {
                FileInfo fi = new FileInfo(filePath);
                if (!fi.Exists || fi.Length < MIN_INSTALLER_BYTES || fi.Length > MAX_INSTALLER_BYTES)
                {
                    return false;
                }
                if (!HasValidPeHeader(filePath)) return false;
                string actual = ComputeFileSha256(filePath);
                return string.Equals(actual, expectedSha256, StringComparison.OrdinalIgnoreCase);
            }
            catch
            {
                return false;
            }
        }

        private static string GetTempDownloadFolder()
        {
            return Path.Combine(Path.GetTempPath(), "RafiqPOS_Updates");
        }

        private static string BuildSafeInstallerFileName(string version)
        {
            StringBuilder sb = new StringBuilder();
            string raw = string.IsNullOrEmpty(version) ? "latest" : version.Trim();
            for (int i = 0; i < raw.Length; i++)
            {
                char c = raw[i];
                if ((c >= '0' && c <= '9') || (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c == '.' || c == '-' || c == '_')
                {
                    sb.Append(c);
                }
            }
            string safeVer = sb.Length > 0 ? sb.ToString() : "latest";
            return "RafiqPOS_Setup_v" + safeVer + ".exe";
        }

        private static void SafeDeleteFile(string path)
        {
            try
            {
                if (!string.IsNullOrEmpty(path) && File.Exists(path))
                {
                    File.Delete(path);
                }
            }
            catch
            {
                // Best-effort cleanup of temporary files
            }
        }

        private static AppUpdateDownloadState CloneDownloadState(AppUpdateDownloadState src)
        {
            if (src == null) return new AppUpdateDownloadState { State = "idle" };
            return new AppUpdateDownloadState
            {
                State = src.State,
                TargetVersion = src.TargetVersion,
                BytesDownloaded = src.BytesDownloaded,
                TotalBytes = src.TotalBytes,
                Percent = src.Percent,
                FileName = src.FileName,
                Message = src.Message,
                ErrorMessage = src.ErrorMessage,
                IsVerified = src.IsVerified
            };
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
