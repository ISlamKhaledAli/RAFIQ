using System;
using System.Collections.Generic;
using System.Data.SQLite;
using System.Globalization;
using System.IO;
using System.IO.Compression;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.Web.WebView2.Core;
using Newtonsoft.Json;
using RafiqPOS.Common;
using RafiqPOS.Models;

namespace RafiqPOS.Services
{
    public class SupportMigrationEntry
    {
        public int Version { get; set; }
        public string Name { get; set; }
        public string AppliedAt { get; set; }
    }

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

        public bool DatabaseHealthOk { get; set; }
        public string DatabaseHealthMessage { get; set; }
        public string DatabaseJournalMode { get; set; }
        public List<SupportMigrationEntry> MigrationHistory { get; set; }
        public string AuditChainStatus { get; set; }
        public string LicenseType { get; set; }
        public string LicenseStatus { get; set; }
        public string LicenseExpiresAt { get; set; }
        public string LastBackupAt { get; set; }
        public string LastBackupStatus { get; set; }
        public bool BackupFolderReachable { get; set; }
        public int BackupRetentionDays { get; set; }
        public int BackupRetentionWeeks { get; set; }
        public int BackupMaxCopies { get; set; }
        public long DiskFreeBytes { get; set; }
        public string DiskFree { get; set; }
        public string WebView2Runtime { get; set; }
        public long TotalRamMb { get; set; }
        public string ScreenResolution { get; set; }
        public string DefaultPrinterName { get; set; }
        public List<string> PrinterNames { get; set; }
        public Dictionary<string, string> SettingsSnapshot { get; set; }
        // Section name -> reason, for every part of the report that could not be collected
        public Dictionary<string, string> UnavailableSections { get; set; }

        public SupportSystemInfo()
        {
            IntegrityCheck = "unknown";
            FeatureFlags = new Dictionary<string, bool>();
            MigrationHistory = new List<SupportMigrationEntry>();
            PrinterNames = new List<string>();
            SettingsSnapshot = new Dictionary<string, string>();
            UnavailableSections = new Dictionary<string, string>();
        }
    }

    public class SupportBundleResult
    {
        public bool Success { get; set; }
        public string FilePath { get; set; }
        public string FolderPath { get; set; }
        // desktop | downloads | custom | programdata
        public string Location { get; set; }
        public string Message { get; set; }
        public int UnavailableSectionCount { get; set; }
        public SupportSystemInfo SystemInfo { get; set; }
    }

    /// <summary>
    /// Masks personal data and secrets in log text before it leaves the machine inside a support bundle.
    /// The log is free text written by many call sites, so the rules are pattern based and deliberately aggressive.
    /// </summary>
    public static class SupportLogScrubber
    {
        public const string Mask = "[محجوب]";
        public const int MaxLines = 1000;
        public const int MaxChars = 400000;

        private static readonly Regex UserProfilePath = new Regex(@"(?i)([A-Z]:[\\/]+Users[\\/]+)[^\\/\r\n""]+", RegexOptions.CultureInvariant);
        private static readonly Regex EnglishSecret = new Regex(
            @"(?i)\b(password|passwd|pwd|pin|token|secret|api[_-]?key|license[_-]?key|key)\b(\s*[:=]\s*)(""[^""\r\n]*""|'[^'\r\n]*'|[^\s,;]+)",
            RegexOptions.CultureInvariant);
        private static readonly Regex ArabicSecret = new Regex(
            @"(كلمة المرور|كلمة السر|الرقم السري|رمز الاسترجاع|رمز التعافي|مفتاح الترخيص|توكن|الرمز|رمز|مفتاح)(\s*[:=]\s*)[^\s,;]+",
            RegexOptions.CultureInvariant);
        private static readonly Regex PersonLabel = new Regex(@"(للمستخدم|للكاشير|بواسطة)[^\r\n]*", RegexOptions.CultureInvariant);
        private static readonly Regex Email = new Regex(@"[A-Za-z0-9._%+\-]+@[A-Za-z0-9\-]+(\.[A-Za-z0-9\-]+)+", RegexOptions.CultureInvariant);
        private static readonly Regex LicenseKey = new Regex(@"\b[A-Z0-9]{4,6}(-[A-Z0-9]{4,6}){2,5}\b", RegexOptions.CultureInvariant);
        private static readonly Regex Amount = new Regex(@"\d[\d,.]*\s*(قرش|جنيه|EGP)", RegexOptions.CultureInvariant | RegexOptions.IgnoreCase);
        private static readonly Regex SeparatedPhone = new Regex(@"(?<!\d)\+?\d{3,4}[ \-]\d{3,4}[ \-]\d{3,4}(?!\d)", RegexOptions.CultureInvariant);
        private static readonly Regex LongDigits = new Regex(@"\d{8,}", RegexOptions.CultureInvariant);
        private static readonly Regex LongToken = new Regex(@"[A-Za-z0-9+/=]{32,}", RegexOptions.CultureInvariant);

        public static string Scrub(string text)
        {
            if (string.IsNullOrEmpty(text)) return text ?? "";

            string result = UserProfilePath.Replace(text, "$1<user>");
            result = EnglishSecret.Replace(result, "$1$2" + Mask);
            result = ArabicSecret.Replace(result, "$1$2" + Mask);
            result = PersonLabel.Replace(result, "$1 " + Mask);
            result = Email.Replace(result, Mask);
            result = LicenseKey.Replace(result, Mask);
            result = Amount.Replace(result, Mask);
            result = SeparatedPhone.Replace(result, Mask);
            result = LongDigits.Replace(result, Mask);
            result = LongToken.Replace(result, Mask);
            return result;
        }

        // Scrubs the log text and bounds it to the newest MaxLines lines / MaxChars characters
        public static string ScrubRecentLog(string logText)
        {
            string scrubbed = Scrub(logText);
            string[] lines = scrubbed.Split(new string[] { "\r\n", "\n" }, StringSplitOptions.None);
            if (lines.Length > MaxLines)
            {
                string[] recent = new string[MaxLines];
                Array.Copy(lines, lines.Length - MaxLines, recent, 0, MaxLines);
                lines = recent;
            }
            string joined = string.Join("\r\n", lines);
            if (joined.Length > MaxChars)
            {
                joined = joined.Substring(joined.Length - MaxChars);
                int firstBreak = joined.IndexOf('\n');
                if (firstBreak >= 0 && firstBreak < joined.Length - 1) joined = joined.Substring(firstBreak + 1);
            }
            return joined;
        }

        // Header lines of the newest error entries (stack trace lines are skipped)
        public static List<string> LastErrorLines(string scrubbedLog, int count)
        {
            List<string> found = new List<string>();
            if (string.IsNullOrEmpty(scrubbedLog)) return found;
            string[] lines = scrubbedLog.Split(new string[] { "\r\n", "\n" }, StringSplitOptions.None);
            for (int i = lines.Length - 1; i >= 0 && found.Count < count; i--)
            {
                if (lines[i].IndexOf("] [ERROR] ", StringComparison.Ordinal) < 0) continue;
                string line = lines[i].Trim();
                if (line.Length > 300) line = line.Substring(0, 300);
                found.Insert(0, line);
            }
            return found;
        }
    }

    public class SupportService
    {
        // quick_check reads the whole file: beyond this size it is skipped so the IPC call cannot stall for minutes
        private const long QuickCheckMaxBytes = 300L * 1024L * 1024L;
        // Reading every audit row to verify the hash chain is only cheap for modest logs
        private const int AuditChainMaxRows = 50000;

        // Non-sensitive keys only: no PINs, hashes, recovery codes, license data, store identity, contact data or tokens
        private static readonly string[] SettingsWhitelist = new string[]
        {
            "theme", "store_type", "tax_enabled", "feature_taxes", "default_tax_rate_percent", "allow_negative_stock",
            "scanner_enabled", "security_pin_enabled", "show_receipt_logo", "receipt_show_cashier",
            "receipt_show_invoice_number", "receipt_show_paid", "receipt_show_change", "receipt_paper_width",
            "kot_paper_width", "kot_auto_print_on_sale", "printer_auto_cut", "printer_open_drawer", "drawer_pin",
            "drawer_pulse_ms", "default_printer_name", "backup_auto_daily", "backup_auto_on_close",
            "backup_retention_days", "backup_retention_weeks", "backup_max_copies", "backup_warn_after_days"
        };

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
            info.AppVersion = AppUpdateService.CurrentVersion;
            info.OsName = OsDetector.GetOsFriendlyName();
            info.OsBuild = OsDetector.GetBuildNumber().ToString(CultureInfo.InvariantCulture);
            info.Is64BitOperatingSystem = Environment.Is64BitOperatingSystem;
            info.Is64BitProcess = Environment.Is64BitProcess;
            info.DotNetVersion = Environment.Version.ToString();
            info.TimestampUtc = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ", CultureInfo.InvariantCulture);

            RunSection(info, "قاعدة البيانات", delegate { CollectDatabase(info); });
            RunSection(info, "سلسلة التدقيق", delegate { CollectAuditChain(info); });
            RunSection(info, "الميزات المفعلة", delegate { CollectFeatureFlags(info); });
            RunSection(info, "الترخيص", delegate { CollectLicense(info); });
            RunSection(info, "النسخ الاحتياطي", delegate { CollectBackup(info); });
            RunSection(info, "مساحة القرص", delegate { CollectDisk(info); });
            RunSection(info, "مشغل الواجهة WebView2", delegate { CollectWebView2(info); });
            RunSection(info, "الذاكرة", delegate { CollectMemory(info); });
            RunSection(info, "الشاشة", delegate { CollectScreen(info); });
            RunSection(info, "الطابعات", delegate { CollectPrinters(info); });
            RunSection(info, "الإعدادات", delegate { CollectSettings(info); });
            return info;
        }

        // A failing section is recorded in the report and never fails the bundle
        private static void RunSection(SupportSystemInfo info, string name, Action body)
        {
            try
            {
                body();
            }
            catch (Exception ex)
            {
                info.UnavailableSections[name] = SupportLogScrubber.Scrub(ex.Message);
                Logger.Warn("تعذر جمع قسم '" + name + "' لحزمة الدعم: " + ex.Message);
            }
        }

        private void CollectDatabase(SupportSystemInfo info)
        {
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

            bool flaggedCorrupt = DatabaseService.IsCorrupted;
            DatabaseHealthInfo health = DatabaseService.CheckHealth(_dbPath, flaggedCorrupt);
            info.DatabaseHealthOk = health.IsOk;
            info.DatabaseHealthMessage = health.ToSummaryText();
            info.DatabaseJournalMode = health.JournalMode;
            info.SchemaVersion = health.SchemaVersion;

            if (flaggedCorrupt)
            {
                info.IntegrityCheck = "corrupt: flagged at startup";
            }
            else if (info.DatabaseFileSizeBytes > QuickCheckMaxBytes)
            {
                info.IntegrityCheck = "skipped: database larger than " + FormatBytes(QuickCheckMaxBytes);
            }

            using (SQLiteConnection conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();

                if (info.IntegrityCheck == "unknown")
                {
                    using (SQLiteCommand cmd = new SQLiteCommand("PRAGMA quick_check;", conn))
                    {
                        object res = cmd.ExecuteScalar();
                        info.IntegrityCheck = res != null ? res.ToString() : "unknown";
                    }
                }

                // Only non-sensitive totals
                info.TotalProductsCount = CountRows(conn, "products");
                info.TotalSalesCount = CountRows(conn, "sales");
                info.TotalAuditLogsCount = CountRows(conn, "audit_logs");

                using (SQLiteCommand cmd = new SQLiteCommand("SELECT version, COALESCE(name, ''), COALESCE(applied_at, '') FROM schema_migrations ORDER BY version;", conn))
                using (SQLiteDataReader reader = cmd.ExecuteReader())
                {
                    while (reader.Read())
                    {
                        SupportMigrationEntry entry = new SupportMigrationEntry();
                        entry.Version = Convert.ToInt32(reader.GetValue(0), CultureInfo.InvariantCulture);
                        entry.Name = reader.GetString(1);
                        entry.AppliedAt = reader.GetString(2);
                        info.MigrationHistory.Add(entry);
                    }
                }
            }
        }

        // The table name is always a constant of this class
        private static int CountRows(SQLiteConnection conn, string table)
        {
            using (SQLiteCommand cmd = new SQLiteCommand("SELECT COUNT(*) FROM " + table + ";", conn))
            {
                return Convert.ToInt32(cmd.ExecuteScalar(), CultureInfo.InvariantCulture);
            }
        }

        private static void CollectAuditChain(SupportSystemInfo info)
        {
            if (DatabaseService.Audit == null) throw new InvalidOperationException("خدمة سجل التدقيق غير مهيأة");
            if (info.TotalAuditLogsCount > AuditChainMaxRows)
            {
                info.AuditChainStatus = "skipped: more than " + AuditChainMaxRows.ToString(CultureInfo.InvariantCulture) + " audit rows";
                return;
            }
            AuditChainVerificationResult check = DatabaseService.Audit.VerifyChainIntegrity();
            if (check == null) throw new InvalidOperationException("لم يرجع فحص السلسلة نتيجة");
            info.AuditChainStatus = check.IsTampered
                ? "tampered"
                : "valid (" + check.TotalRecordsVerified.ToString(CultureInfo.InvariantCulture) + " records)";
        }

        private static void CollectFeatureFlags(SupportSystemInfo info)
        {
            if (DatabaseService.Settings == null) throw new InvalidOperationException("خدمة الإعدادات غير مهيأة");
            info.FeatureFlags = DatabaseService.Settings.GetFeatureFlags();
        }

        // Type and status only: the licence key, the device fingerprint and the release code are never read into the report
        private static void CollectLicense(SupportSystemInfo info)
        {
            if (DatabaseService.License == null) throw new InvalidOperationException("خدمة الترخيص غير مهيأة");
            LicenseInfo lic = DatabaseService.License.GetLicenseInfo();
            if (lic == null) throw new InvalidOperationException("لا توجد بيانات ترخيص");
            info.LicenseType = lic.LicenseType;
            info.LicenseStatus = lic.Status;
            info.LicenseExpiresAt = lic.ExpiresAt;
        }

        private static void CollectBackup(SupportSystemInfo info)
        {
            if (DatabaseService.Backup == null) throw new InvalidOperationException("خدمة النسخ الاحتياطي غير مهيأة");
            BackupStatusInfo status = DatabaseService.Backup.GetStatus();
            info.LastBackupAt = status.LastBackupAt;
            info.LastBackupStatus = status.LastBackupStatus;
            info.BackupFolderReachable = status.FolderStatus == "ok";
            info.BackupRetentionDays = status.RetentionDays;
            info.BackupRetentionWeeks = status.RetentionWeeks;
            info.BackupMaxCopies = status.MaxCopies;
        }

        private void CollectDisk(SupportSystemInfo info)
        {
            string root = Path.GetPathRoot(Path.GetFullPath(_dbPath));
            DriveInfo drive = new DriveInfo(root);
            if (!drive.IsReady) throw new IOException("القرص غير جاهز");
            info.DiskFreeBytes = drive.AvailableFreeSpace;
            info.DiskFree = FormatBytes(drive.AvailableFreeSpace);
        }

        private static void CollectWebView2(SupportSystemInfo info)
        {
            string evergreen = null;
            try
            {
                evergreen = CoreWebView2Environment.GetAvailableBrowserVersionString();
            }
            catch (Exception ex)
            {
                Logger.Info("لا يوجد مشغل WebView2 Evergreen لحزمة الدعم: " + ex.Message);
            }

            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            bool hasFixed = File.Exists(Path.Combine(Path.Combine(baseDir, "runtimes"), Path.Combine("fixed109", "msedgewebview2.exe")))
                || File.Exists(Path.Combine(Path.Combine(baseDir, "fixed109"), "msedgewebview2.exe"));
            info.WebView2Runtime = "Evergreen: " + (string.IsNullOrEmpty(evergreen) ? "غير مثبت" : evergreen)
                + " | Fixed 109: " + (hasFixed ? "موجود" : "غير موجود");
        }

        private static void CollectMemory(SupportSystemInfo info)
        {
            MEMORYSTATUSEX status = new MEMORYSTATUSEX();
            status.dwLength = (uint)Marshal.SizeOf(typeof(MEMORYSTATUSEX));
            if (!GlobalMemoryStatusEx(ref status)) throw new InvalidOperationException("تعذر قراءة حجم الذاكرة");
            info.TotalRamMb = (long)(status.ullTotalPhys / (1024UL * 1024UL));
        }

        private static void CollectScreen(SupportSystemInfo info)
        {
            System.Windows.Forms.Screen primary = System.Windows.Forms.Screen.PrimaryScreen;
            if (primary == null) throw new InvalidOperationException("لا توجد شاشة رئيسية");
            info.ScreenResolution = string.Format(CultureInfo.InvariantCulture, "{0}x{1} (عدد الشاشات: {2})",
                primary.Bounds.Width, primary.Bounds.Height, System.Windows.Forms.Screen.AllScreens.Length);
        }

        // Printer names only: no ports, addresses or driver paths
        private static void CollectPrinters(SupportSystemInfo info)
        {
            if (DatabaseService.Printer == null) throw new InvalidOperationException("خدمة الطباعة غير مهيأة");
            List<PrinterInfo> printers = DatabaseService.Printer.GetInstalledPrinters();
            for (int i = 0; i < printers.Count; i++)
            {
                info.PrinterNames.Add(printers[i].Name);
                if (printers[i].IsDefault) info.DefaultPrinterName = printers[i].Name;
            }
        }

        private static void CollectSettings(SupportSystemInfo info)
        {
            if (DatabaseService.SettingsRepo == null) throw new InvalidOperationException("مستودع الإعدادات غير مهيأ");
            Dictionary<string, string> all = DatabaseService.SettingsRepo.GetAll();
            for (int i = 0; i < SettingsWhitelist.Length; i++)
            {
                string value;
                if (!all.TryGetValue(SettingsWhitelist[i], out value) || value == null) continue;
                if (value.Length > 64) value = value.Substring(0, 64);
                info.SettingsSnapshot[SettingsWhitelist[i]] = SupportLogScrubber.Scrub(value);
            }
        }

        public SupportBundleResult CreateSupportBundle()
        {
            return CreateSupportBundle(null);
        }

        // outputDirectory (tests, or an explicit target) is tried first; otherwise Desktop, then Downloads, then ProgramData
        public SupportBundleResult CreateSupportBundle(string outputDirectory)
        {
            try
            {
                Logger.Info("بدء إنشاء حزمة معلومات الدعم الفني...");
                SupportSystemInfo sysInfo = GetSystemDiagnosticInfo();

                string scrubbedLog;
                try
                {
                    scrubbedLog = SupportLogScrubber.ScrubRecentLog(Logger.ReadRecentLogs(SupportLogScrubber.MaxLines));
                }
                catch (Exception logEx)
                {
                    scrubbedLog = "تعذر قراءة سجل الأخطاء: " + SupportLogScrubber.Scrub(logEx.Message);
                    sysInfo.UnavailableSections["سجل الأخطاء"] = SupportLogScrubber.Scrub(logEx.Message);
                }

                List<BundleEntry> entries = new List<BundleEntry>();
                entries.Add(new BundleEntry("diagnostic_info.json", JsonConvert.SerializeObject(sysInfo, Formatting.Indented), false));
                entries.Add(new BundleEntry("SUPPORT_REPORT_AR.txt", BuildHumanReport(sysInfo, scrubbedLog), true));
                entries.Add(new BundleEntry("system_error.log", scrubbedLog, true));
                entries.Add(new BundleEntry("README_AR.txt", BuildReadme(), true));

                string bundleFileName = string.Format(CultureInfo.InvariantCulture, "rafiq_support_bundle_{0:yyyyMMdd_HHmmss}.zip", DateTime.Now);
                List<KeyValuePair<string, string>> targets = BuildTargets(outputDirectory);

                string lastError = "";
                for (int i = 0; i < targets.Count; i++)
                {
                    try
                    {
                        string zipPath = WriteZip(targets[i].Value, bundleFileName, entries);
                        Logger.Info("تم إنشاء حزمة الدعم بنجاح في: " + zipPath);

                        SupportBundleResult result = new SupportBundleResult();
                        result.Success = true;
                        result.FilePath = zipPath;
                        result.FolderPath = targets[i].Value;
                        result.Location = targets[i].Key;
                        result.UnavailableSectionCount = sysInfo.UnavailableSections.Count;
                        result.Message = BuildSuccessMessage(result, bundleFileName);
                        result.SystemInfo = sysInfo;
                        return result;
                    }
                    catch (IOException ioEx)
                    {
                        lastError = ioEx.Message;
                        Logger.Warn("تعذر حفظ حزمة الدعم في أحد المجلدات: " + ioEx.Message);
                    }
                    catch (UnauthorizedAccessException authEx)
                    {
                        lastError = authEx.Message;
                        Logger.Warn("لا توجد صلاحية لحفظ حزمة الدعم في أحد المجلدات: " + authEx.Message);
                    }
                }

                SupportBundleResult failed = new SupportBundleResult();
                failed.Success = false;
                failed.Message = "تعذر حفظ حزمة الدعم الفني في أي مجلد متاح: " + lastError;
                return failed;
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

        private static string BuildSuccessMessage(SupportBundleResult result, string fileName)
        {
            string text;
            if (result.Location == "desktop")
            {
                text = "تم إنشاء حزمة الدعم الفني وحفظها على سطح المكتب:\n" + fileName;
            }
            else if (result.Location == "downloads")
            {
                text = "تم إنشاء حزمة الدعم الفني وحفظها في مجلد التنزيلات (تعذر الحفظ على سطح المكتب):\n" + fileName;
            }
            else
            {
                text = "تم إنشاء حزمة الدعم الفني وحفظها في المجلد:\n" + result.FolderPath;
            }
            if (result.UnavailableSectionCount > 0)
            {
                text += "\nتنبيه: تعذر جمع " + result.UnavailableSectionCount.ToString(CultureInfo.InvariantCulture)
                    + " قسم من المعلومات، وذُكر ذلك داخل التقرير.";
            }
            return text;
        }

        private static List<KeyValuePair<string, string>> BuildTargets(string outputDirectory)
        {
            List<KeyValuePair<string, string>> targets = new List<KeyValuePair<string, string>>();
            if (!string.IsNullOrEmpty(outputDirectory))
            {
                targets.Add(new KeyValuePair<string, string>("custom", outputDirectory));
                return targets;
            }

            string desktop = Environment.GetFolderPath(Environment.SpecialFolder.Desktop);
            if (!string.IsNullOrEmpty(desktop) && Directory.Exists(desktop))
            {
                targets.Add(new KeyValuePair<string, string>("desktop", desktop));
            }
            string downloads = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads");
            if (Directory.Exists(downloads))
            {
                targets.Add(new KeyValuePair<string, string>("downloads", downloads));
            }
            // The program folder can be read-only (Program Files), so the last resort is the shared data folder
            targets.Add(new KeyValuePair<string, string>("programdata",
                Path.Combine(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "RafiqPOS"), "support")));
            return targets;
        }

        // Only the entries built in memory are written: the database and its WAL/SHM files can never end up in the zip
        private static string WriteZip(string folder, string fileName, List<BundleEntry> entries)
        {
            Directory.CreateDirectory(folder);
            string finalPath = Path.Combine(folder, fileName);
            string tempPath = finalPath + ".tmp";
            try
            {
                using (FileStream fs = new FileStream(tempPath, FileMode.Create, FileAccess.Write))
                using (ZipArchive zip = new ZipArchive(fs, ZipArchiveMode.Create))
                {
                    for (int i = 0; i < entries.Count; i++)
                    {
                        UTF8Encoding encoding = new UTF8Encoding(entries[i].WithBom);
                        byte[] preamble = encoding.GetPreamble();
                        byte[] body = encoding.GetBytes(entries[i].Content ?? "");
                        ZipArchiveEntry entry = zip.CreateEntry(entries[i].Name, CompressionLevel.Optimal);
                        using (Stream stream = entry.Open())
                        {
                            if (preamble.Length > 0) stream.Write(preamble, 0, preamble.Length);
                            stream.Write(body, 0, body.Length);
                        }
                    }
                }
                if (File.Exists(finalPath)) File.Delete(finalPath);
                File.Move(tempPath, finalPath);
                return finalPath;
            }
            catch
            {
                try { if (File.Exists(tempPath)) File.Delete(tempPath); }
                catch (IOException) { }
                catch (UnauthorizedAccessException) { }
                throw;
            }
        }

        private static string BuildReadme()
        {
            return "حزمة الدعم الفني لنظام رفيق POS\r\n" +
                   "تاريخ الإنشاء: " + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture) + "\r\n\r\n" +
                   "محتويات الحزمة:\r\n" +
                   "- SUPPORT_REPORT_AR.txt: ملخص مقروء للحالة (الإصدار، الجهاز، قاعدة البيانات، النسخ الاحتياطي، الترخيص، آخر الأخطاء).\r\n" +
                   "- diagnostic_info.json: نفس المعلومات بصيغة JSON للفني.\r\n" +
                   "- system_error.log: آخر سجلات الأخطاء الفنية بعد حجب الأرقام الطويلة وأرقام الهواتف والبريد وكلمات السر والمفاتيح والمبالغ وأسماء المستخدمين.\r\n\r\n" +
                   "ملاحظة أمان وخصوصية: لا تحتوي الحزمة على ملف قاعدة البيانات ولا على أسماء العملاء أو أرقام هواتفهم أو الفواتير أو الأسعار. " +
                   "الإعدادات المضمنة قائمة محددة من الخيارات الفنية فقط، ولا تشمل اسم المحل أو بياناته أو أي رمز سري أو مفتاح ترخيص.\r\n";
        }

        private static string BuildHumanReport(SupportSystemInfo info, string scrubbedLog)
        {
            StringBuilder sb = new StringBuilder();
            sb.Append("تقرير الدعم الفني - رفيق POS\r\n");
            sb.Append("تاريخ الإنشاء: ").Append(DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture)).Append("\r\n");
            sb.Append("==============================\r\n\r\n");

            sb.Append("[البرنامج والجهاز]\r\n");
            AppendLine(sb, "إصدار البرنامج", info.AppVersion);
            AppendLine(sb, "نظام التشغيل", info.OsName + " (Build " + info.OsBuild + ", " + (info.Is64BitOperatingSystem ? "64-bit" : "32-bit") + ")");
            AppendLine(sb, "عملية البرنامج", info.Is64BitProcess ? "64-bit" : "32-bit");
            AppendLine(sb, ".NET", info.DotNetVersion);
            AppendLine(sb, "الذاكرة", info.TotalRamMb > 0 ? info.TotalRamMb.ToString(CultureInfo.InvariantCulture) + " MB" : null);
            AppendLine(sb, "الشاشة", info.ScreenResolution);
            AppendLine(sb, "مشغل WebView2", info.WebView2Runtime);
            AppendLine(sb, "المساحة الحرة على قرص قاعدة البيانات", info.DiskFree);

            sb.Append("\r\n[قاعدة البيانات]\r\n");
            AppendLine(sb, "الحالة", info.DatabaseHealthMessage);
            AppendLine(sb, "وضع السجل (Journal)", info.DatabaseJournalMode);
            AppendLine(sb, "إصدار الهيكل", info.SchemaVersion > 0 ? info.SchemaVersion.ToString(CultureInfo.InvariantCulture) : null);
            AppendLine(sb, "حجم الملف", info.DatabaseFileSize);
            AppendLine(sb, "فحص السلامة", info.IntegrityCheck);
            AppendLine(sb, "سلسلة التدقيق", info.AuditChainStatus);
            AppendLine(sb, "عدد الأصناف", info.TotalProductsCount.ToString(CultureInfo.InvariantCulture));
            AppendLine(sb, "عدد الفواتير", info.TotalSalesCount.ToString(CultureInfo.InvariantCulture));
            AppendLine(sb, "آخر ترحيل للهيكل", info.MigrationHistory.Count > 0
                ? "#" + info.MigrationHistory[info.MigrationHistory.Count - 1].Version.ToString(CultureInfo.InvariantCulture) + " - " + info.MigrationHistory[info.MigrationHistory.Count - 1].AppliedAt
                : null);

            sb.Append("\r\n[النسخ الاحتياطي]\r\n");
            AppendLine(sb, "آخر نسخة ناجحة", FormatLocalTime(info.LastBackupAt));
            AppendLine(sb, "حالة آخر محاولة", info.LastBackupStatus);
            AppendLine(sb, "مجلد النسخ", info.LastBackupStatus == null ? null : (info.BackupFolderReachable ? "متاح" : "غير متاح"));
            AppendLine(sb, "سياسة الاحتفاظ", info.BackupMaxCopies > 0
                ? string.Format(CultureInfo.InvariantCulture, "{0} يوم / {1} أسبوع / حتى {2} نسخة", info.BackupRetentionDays, info.BackupRetentionWeeks, info.BackupMaxCopies)
                : null);

            sb.Append("\r\n[الترخيص]\r\n");
            AppendLine(sb, "النوع", info.LicenseType);
            AppendLine(sb, "الحالة", info.LicenseStatus);
            AppendLine(sb, "ينتهي في", info.LicenseExpiresAt);

            sb.Append("\r\n[الطابعات]\r\n");
            AppendLine(sb, "الافتراضية", info.DefaultPrinterName);
            AppendLine(sb, "المثبتة", info.PrinterNames.Count > 0 ? string.Join(" | ", info.PrinterNames.ToArray()) : null);

            if (info.UnavailableSections.Count > 0)
            {
                sb.Append("\r\n[أقسام تعذر جمعها]\r\n");
                foreach (KeyValuePair<string, string> pair in info.UnavailableSections)
                {
                    sb.Append(pair.Key).Append(": غير متاح (").Append(pair.Value).Append(")\r\n");
                }
            }

            sb.Append("\r\n[آخر 10 أخطاء]\r\n");
            List<string> errors = SupportLogScrubber.LastErrorLines(scrubbedLog, 10);
            if (errors.Count == 0)
            {
                sb.Append("لا توجد أخطاء مسجلة.\r\n");
            }
            for (int i = 0; i < errors.Count; i++)
            {
                sb.Append(errors[i]).Append("\r\n");
            }
            return sb.ToString();
        }

        private static void AppendLine(StringBuilder sb, string label, string value)
        {
            sb.Append(label).Append(": ").Append(string.IsNullOrEmpty(value) ? "غير متاح" : value).Append("\r\n");
        }

        private static string FormatLocalTime(string isoUtc)
        {
            if (string.IsNullOrEmpty(isoUtc)) return null;
            DateTime parsed;
            if (!DateTime.TryParse(isoUtc, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out parsed)) return isoUtc;
            return parsed.ToLocalTime().ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture);
        }

        private static string FormatBytes(long bytes)
        {
            if (bytes < 1024) return bytes + " B";
            if (bytes < 1024 * 1024) return (bytes / 1024.0).ToString("F1", CultureInfo.InvariantCulture) + " KB";
            if (bytes < 1024L * 1024L * 1024L) return (bytes / (1024.0 * 1024.0)).ToString("F2", CultureInfo.InvariantCulture) + " MB";
            return (bytes / (1024.0 * 1024.0 * 1024.0)).ToString("F2", CultureInfo.InvariantCulture) + " GB";
        }

        private class BundleEntry
        {
            public readonly string Name;
            public readonly string Content;
            public readonly bool WithBom;

            public BundleEntry(string name, string content, bool withBom)
            {
                Name = name;
                Content = content;
                WithBom = withBom;
            }
        }

#pragma warning disable 0649
        [StructLayout(LayoutKind.Sequential)]
        private struct MEMORYSTATUSEX
        {
            public uint dwLength;
            public uint dwMemoryLoad;
            public ulong ullTotalPhys;
            public ulong ullAvailPhys;
            public ulong ullTotalPageFile;
            public ulong ullAvailPageFile;
            public ulong ullTotalVirtual;
            public ulong ullAvailVirtual;
            public ulong ullAvailExtendedVirtual;
        }
#pragma warning restore 0649

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool GlobalMemoryStatusEx(ref MEMORYSTATUSEX lpBuffer);
    }
}
