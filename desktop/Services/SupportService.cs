using System;
using System.Collections.Generic;
using System.Data.SQLite;
using System.IO;
using System.IO.Compression;
using System.Text;
using Newtonsoft.Json;
using RafiqPOS.Common;

namespace RafiqPOS.Services
{
    public class SupportSystemInfo
    {
        public string AppVersion { get; set; }
        public string OsName { get; set; }
        public string OsBuild { get; set; }
        public bool Is64BitOperatingSystem { get; set; }
        public bool Is64BitProcess { get; set; }
        public string DotNetVersion { get; set; }
        public string TimestampUtc { get; set; }
        public string DatabaseFileSize { get; set; }
        public long DatabaseFileSizeBytes { get; set; }
        public int SchemaVersion { get; set; }
        public string IntegrityCheck { get; set; }
        public int TotalProductsCount { get; set; }
        public int TotalSalesCount { get; set; }
        public int TotalAuditLogsCount { get; set; }
        public Dictionary<string, bool> FeatureFlags { get; set; }
    }

    public class SupportBundleResult
    {
        public bool Success { get; set; }
        public string FilePath { get; set; }
        public string Message { get; set; }
        public SupportSystemInfo SystemInfo { get; set; }
    }

    public class SupportService
    {
        private readonly string _connectionString;
        private readonly string _dbPath;

        public SupportService(string connectionString, string dbPath)
        {
            this._connectionString = connectionString;
            this._dbPath = dbPath;
        }

        public SupportSystemInfo GetSystemDiagnosticInfo()
        {
            SupportSystemInfo info = new SupportSystemInfo();
            info.AppVersion = "1.0.0";
            info.OsName = OsDetector.GetOsFriendlyName();
            info.OsBuild = OsDetector.GetBuildNumber().ToString();
            info.Is64BitOperatingSystem = Environment.Is64BitOperatingSystem;
            info.Is64BitProcess = Environment.Is64BitProcess;
            info.DotNetVersion = Environment.Version.ToString();
            info.TimestampUtc = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ");

            // Database file info
            if (File.Exists(_dbPath))
            {
                FileInfo fi = new FileInfo(_dbPath);
                info.DatabaseFileSizeBytes = fi.Length;
                info.DatabaseFileSize = FormatBytes(fi.Length);
            }
            else
            {
                info.DatabaseFileSizeBytes = 0;
                info.DatabaseFileSize = "غير موجود";
            }

            // DB metadata & Integrity (NO sensitive customer/sales personal data)
            try
            {
                using (SQLiteConnection conn = new SQLiteConnection(_connectionString))
                {
                    conn.Open();

                    // Integrity check
                    using (SQLiteCommand cmd = new SQLiteCommand("PRAGMA integrity_check;", conn))
                    {
                        object res = cmd.ExecuteScalar();
                        info.IntegrityCheck = res != null ? res.ToString() : "unknown";
                    }

                    // Schema Version
                    using (SQLiteCommand cmd = new SQLiteCommand("SELECT COALESCE(MAX(version), 0) FROM schema_migrations;", conn))
                    {
                        object ver = cmd.ExecuteScalar();
                        info.SchemaVersion = ver != null ? Convert.ToInt32(ver) : 0;
                    }

                    // Counts (only non-sensitive totals)
                    using (SQLiteCommand cmd = new SQLiteCommand("SELECT COUNT(*) FROM products;", conn))
                    {
                        info.TotalProductsCount = Convert.ToInt32(cmd.ExecuteScalar());
                    }

                    using (SQLiteCommand cmd = new SQLiteCommand("SELECT COUNT(*) FROM sales;", conn))
                    {
                        info.TotalSalesCount = Convert.ToInt32(cmd.ExecuteScalar());
                    }

                    using (SQLiteCommand cmd = new SQLiteCommand("SELECT COUNT(*) FROM audit_logs;", conn))
                    {
                        info.TotalAuditLogsCount = Convert.ToInt32(cmd.ExecuteScalar());
                    }
                }
            }
            catch (Exception ex)
            {
                info.IntegrityCheck = "Error: " + ex.Message;
                Logger.Error("فشل فحص سلامة قاعدة البيانات لحزمة الدعم", ex);
            }

            // Feature Flags
            try
            {
                if (DatabaseService.Settings != null)
                {
                    info.FeatureFlags = DatabaseService.Settings.GetFeatureFlags();
                }
            }
            catch
            {
                info.FeatureFlags = new Dictionary<string, bool>();
            }

            return info;
        }

        public SupportBundleResult CreateSupportBundle()
        {
            try
            {
                Logger.Info("بدء إنشاء حزمة معلومات الدعم الفني...");
                SupportSystemInfo sysInfo = GetSystemDiagnosticInfo();

                string tempDir = Path.Combine(Path.GetTempPath(), "Rafiq_Support_" + Guid.NewGuid().ToString("N"));
                Directory.CreateDirectory(tempDir);

                try
                {
                    // 1. Write diagnostic system info JSON (sanitized, zero personal info)
                    string reportJson = JsonConvert.SerializeObject(sysInfo, Formatting.Indented);
                    File.WriteAllText(Path.Combine(tempDir, "diagnostic_info.json"), reportJson, Encoding.UTF8);

                    // 2. Write recent error log (technical logs only)
                    string recentLogs = Logger.ReadRecentLogs(1000);
                    File.WriteAllText(Path.Combine(tempDir, "system_error.log"), recentLogs, Encoding.UTF8);

                    // 3. Write Readme file in Arabic
                    string readme = "حزمة الدعم الفني لنظام رفيق POS\n" +
                                    "تاريخ الإنشاء: " + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + "\n" +
                                    "ملاحظة أمان وخصوصية: هذه الحزمة تحتوي حصراً على سجلات الأخطاء الفنية وإحصائيات النظام ومواصفات الجهاز، ولا تحتوي على أي أسماء عملاء أو أرقام هواتف أو تفاصيل مالية خاصة.";
                    File.WriteAllText(Path.Combine(tempDir, "README_AR.txt"), readme, Encoding.UTF8);

                    // Determine target output zip location (Desktop or Downloads)
                    string desktopPath = Environment.GetFolderPath(Environment.SpecialFolder.Desktop);
                    if (!Directory.Exists(desktopPath))
                    {
                        desktopPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads");
                    }
                    if (!Directory.Exists(desktopPath))
                    {
                        desktopPath = AppDomain.CurrentDomain.BaseDirectory;
                    }

                    string bundleFileName = string.Format("rafiq_support_bundle_{0:yyyyMMdd_HHmmss}.zip", DateTime.Now);
                    string targetZipPath = Path.Combine(desktopPath, bundleFileName);

                    if (File.Exists(targetZipPath))
                    {
                        File.Delete(targetZipPath);
                    }

                    ZipFile.CreateFromDirectory(tempDir, targetZipPath, CompressionLevel.Optimal, false);

                    Logger.Info("تم إنشاء حزمة الدعم بنجاح في: " + targetZipPath);

                    SupportBundleResult result = new SupportBundleResult();
                    result.Success = true;
                    result.FilePath = targetZipPath;
                    result.Message = string.Format("تم إنشاء حزمة الدعم الفني بنجاح وحفظها على سطح المكتب:\n{0}", bundleFileName);
                    result.SystemInfo = sysInfo;
                    return result;
                }
                finally
                {
                    try
                    {
                        if (Directory.Exists(tempDir))
                        {
                            Directory.Delete(tempDir, true);
                        }
                    }
                    catch
                    {
                        // Ignore cleanup exceptions
                    }
                }
            }
            catch (Exception ex)
            {
                Logger.Error("فشل إنشاء حزمة الدعم الفني", ex);
                SupportBundleResult err = new SupportBundleResult();
                err.Success = false;
                err.Message = "فشل إنشاء حزمة الدعم الفني: " + ex.Message;
                return err;
            }
        }

        private static string FormatBytes(long bytes)
        {
            if (bytes < 1024) return bytes + " B";
            if (bytes < 1024 * 1024) return (bytes / 1024.0).ToString("F1") + " KB";
            return (bytes / (1024.0 * 1024.0)).ToString("F2") + " MB";
        }
    }
}
