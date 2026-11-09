using System;
using System.Collections.Generic;
using System.Data.SQLite;
using System.IO;
using System.IO.Compression;
using RafiqPOS.Common;
using RafiqPOS.Repositories;

namespace RafiqPOS.Services
{
    public class BackupResult
    {
        public bool Success { get; set; }
        public string BackupFilePath { get; set; }
        public long FileSizeBytes { get; set; }
        public string Message { get; set; }
        public bool IsVerified { get; set; }
        public bool FallbackToLocal { get; set; }
        public string CreatedAt { get; set; }
    }

    public class BackupFileInfo
    {
        public string FileName { get; set; }
        public string FullPath { get; set; }
        public long SizeBytes { get; set; }
        public string CreatedAt { get; set; }
    }

    public class DriveItem
    {
        public string Name { get; set; }
        public string Label { get; set; }
        public string DriveType { get; set; }
        public long TotalSpaceBytes { get; set; }
        public long FreeSpaceBytes { get; set; }
        public bool IsReady { get; set; }
        public bool IsRemovable { get; set; }
    }

    public class BackupStatusInfo
    {
        public string LastBackupAt { get; set; }
        public string LastBackupStatus { get; set; }
        public string LastBackupFile { get; set; }
        public long LastBackupSizeBytes { get; set; }
        public bool IsOverdue { get; set; }
        public string OverdueWarning { get; set; }
        public string ConfiguredFolder { get; set; }
        public bool AutoOnClose { get; set; }
        public bool AutoDaily { get; set; }
        public int RetentionDays { get; set; }
        public int RetentionWeeks { get; set; }
        public int WarnAfterDays { get; set; }
        public int MaxCopies { get; set; }
        public List<BackupFileInfo> RecentBackups { get; set; }
        public int TotalBackupCount { get; set; }
        public string ListedFolder { get; set; }
        // ok | unavailable (configured folder unreachable, local fallback listed) | unreadable (listing failed)
        public string FolderStatus { get; set; }
        public string FolderMessage { get; set; }

        public BackupStatusInfo()
        {
            RecentBackups = new List<BackupFileInfo>();
        }
    }

    public class BackupService
    {
        public const int MIN_GUARANTEED_COPIES = 3;
        // Defaults apply only while a key was never saved. 14 daily + 8 weekly copies (max 30) cover a supermarket's
        // audit/dispute window, and each backup is small, so the disk cost of keeping them is negligible.
        public const int DEFAULT_RETENTION_DAYS = 14;
        public const int DEFAULT_RETENTION_WEEKS = 8;
        public const int DEFAULT_MAX_COPIES = 30;
        public const int DEFAULT_WARN_AFTER_DAYS = 2;
        public const string RETENTION_ROOT_ONLY_MESSAGE = "تعديل سياسة الاحتفاظ بالنسخ الاحتياطية متاح لحساب الروت فقط";
        public const long LOW_DISK_SPACE_THRESHOLD_BYTES = 500L * 1024L * 1024L; // 500 MB
        public const int DEFAULT_LISTED_BACKUPS = 15;
        public const int MAX_LISTED_BACKUPS = 200;

        private class BackupFileEntry
        {
            public string FilePath;
            public string FileName;
            public DateTime Timestamp;
            public string DateKey;
            public long SizeBytes;
        }

        public static bool IsRetentionSettingKey(string key)
        {
            return key == "backup_retention_days" || key == "backup_retention_weeks" || key == "backup_max_copies";
        }

        private static int NormalizeRetentionDays(int value)
        {
            return ClampInt(value, 1, 365);
        }

        private static int NormalizeRetentionWeeks(int value)
        {
            return ClampInt(value, 1, 104);
        }

        private static int NormalizeMaxCopies(int value)
        {
            return ClampInt(value > 0 ? value : DEFAULT_MAX_COPIES, MIN_GUARANTEED_COPIES, MAX_LISTED_BACKUPS);
        }

        // A missing, empty, unparsable or non-positive stored value falls back to the default instead of becoming 0
        private int ReadIntSetting(string key, int fallback)
        {
            int value;
            if (!int.TryParse(_settingsRepo.Get(key, ""), out value) || value <= 0) return fallback;
            return value;
        }

        public int GetRetentionDays()
        {
            return NormalizeRetentionDays(ReadIntSetting("backup_retention_days", DEFAULT_RETENTION_DAYS));
        }

        public int GetRetentionWeeks()
        {
            return NormalizeRetentionWeeks(ReadIntSetting("backup_retention_weeks", DEFAULT_RETENTION_WEEKS));
        }

        public int GetMaxCopies()
        {
            return NormalizeMaxCopies(ReadIntSetting("backup_max_copies", DEFAULT_MAX_COPIES));
        }

        public int GetWarnAfterDays()
        {
            return ClampInt(ReadIntSetting("backup_warn_after_days", DEFAULT_WARN_AFTER_DAYS), 1, 365);
        }

        // True when saving these values (after the same clamping SaveConfiguration applies) would change the effective policy
        public bool RetentionWouldChange(int retentionDays, int retentionWeeks, int maxCopies)
        {
            return NormalizeRetentionDays(retentionDays) != GetRetentionDays()
                || NormalizeRetentionWeeks(retentionWeeks) != GetRetentionWeeks()
                || NormalizeMaxCopies(maxCopies) != GetMaxCopies();
        }

        // Raw settings writes are compared unclamped: the stored text would be the requested one
        public bool IsRetentionSettingChange(string key, string value)
        {
            int requested;
            if (!int.TryParse((value ?? "").Trim(), out requested)) return true;
            if (key == "backup_retention_days") return requested != GetRetentionDays();
            if (key == "backup_retention_weeks") return requested != GetRetentionWeeks();
            if (key == "backup_max_copies") return requested != GetMaxCopies();
            return false;
        }

        public string GetLastSuccessfulBackupAt()
        {
            try { return _settingsRepo.Get("backup_last_success_at", ""); }
            catch (Exception ex)
            {
                Logger.Warn("تعذر قراءة وقت آخر نسخة احتياطية: " + ex.Message);
                return "";
            }
        }

        public static bool TryParseBackupTimestamp(string filePath, out DateTime timestamp)
        {
            timestamp = DateTime.MinValue;
            try
            {
                string fileName = Path.GetFileNameWithoutExtension(filePath);
                if (!string.IsNullOrEmpty(fileName) && fileName.StartsWith("rafiq_backup_") && fileName.Length >= 28)
                {
                    string datePart = fileName.Substring(13, 8); // yyyyMMdd
                    string timePart = fileName.Substring(22, 6); // HHmmss
                    int year = int.Parse(datePart.Substring(0, 4));
                    int month = int.Parse(datePart.Substring(4, 2));
                    int day = int.Parse(datePart.Substring(6, 2));
                    int hour = int.Parse(timePart.Substring(0, 2));
                    int minute = int.Parse(timePart.Substring(2, 2));
                    int second = int.Parse(timePart.Substring(4, 2));
                    timestamp = new DateTime(year, month, day, hour, minute, second, DateTimeKind.Local);
                    return true;
                }
            }
            catch
            {
                // Fallback to file creation time
            }

            try
            {
                var fi = new FileInfo(filePath);
                timestamp = fi.CreationTime < fi.LastWriteTime ? fi.CreationTime : fi.LastWriteTime;
                return true;
            }
            catch
            {
                return false;
            }
        }

        private readonly string _connectionString;
        private readonly string _dbPath;
        private readonly SettingsRepository _settingsRepo;
        private readonly AuditLogRepository _auditRepo;
        private readonly EncryptionService _encryptionService;
        private System.Threading.Timer _backgroundTimer;

        public BackupService(string connectionString, string dbPath, SettingsRepository settingsRepo, AuditLogRepository auditRepo, EncryptionService encryptionService = null)
        {
            this._connectionString = connectionString;
            this._dbPath = dbPath;
            this._settingsRepo = settingsRepo;
            this._auditRepo = auditRepo;
            this._encryptionService = encryptionService ?? new EncryptionService();
        }

        public void StartBackgroundPeriodicCheck()
        {
            if (_backgroundTimer != null) return;

            _backgroundTimer = new System.Threading.Timer(
                delegate(object state)
                {
                    try
                    {
                        // 1. Maintain SQLite WAL and internal optimization
                        try
                        {
                            using (var conn = new SQLiteConnection(_connectionString))
                            {
                                conn.Open();
                                using (var cmd = new SQLiteCommand("PRAGMA wal_checkpoint(PASSIVE); PRAGMA optimize;", conn))
                                {
                                    cmd.ExecuteNonQuery();
                                }
                            }
                        }
                        catch { }

                        // 2. Check if Auto Daily Backup is enabled and due
                        string autoDaily = _settingsRepo.Get("backup_auto_daily", "1");
                        if (autoDaily == "1")
                        {
                            string lastSuccess = _settingsRepo.Get("backup_last_success_at", "");
                            bool isDue = false;

                            if (string.IsNullOrEmpty(lastSuccess))
                            {
                                isDue = true;
                            }
                            else
                            {
                                DateTime lastDt;
                                if (DateTime.TryParse(lastSuccess, out lastDt))
                                {
                                    TimeSpan elapsed = DateTime.UtcNow - lastDt.ToUniversalTime();
                                    if (elapsed.TotalHours >= 24 || lastDt.ToLocalTime().Date < DateTime.Today)
                                    {
                                        isDue = true;
                                    }
                                }
                            }

                            if (isDue)
                            {
                                Logger.Info("المؤقت الدوري: بدء تنفيذ النسخ الاحتياطي اليومي الآلي المجدول...");
                                CreateBackup(null);
                            }
                        }
                    }
                    catch (Exception ex)
                    {
                        Logger.Warn("خطأ في المؤقت الدوري للنسخ الاحتياطي: " + ex.Message);
                    }
                },
                null,
                30 * 1000, // Initial delay 30s after startup
                30 * 60 * 1000 // Check every 30 minutes
            );
        }

        public void StopBackgroundPeriodicCheck()
        {
            if (_backgroundTimer != null)
            {
                try { _backgroundTimer.Dispose(); } catch { }
                _backgroundTimer = null;
            }
        }

        public string GetOrCreateRecoveryCode()
        {
            if (_settingsRepo == null) return EncryptionService.GenerateRecoveryCode();

            string encCode = _settingsRepo.Get("owner_recovery_code_encrypted", "");
            if (!string.IsNullOrEmpty(encCode))
            {
                try
                {
                    string dec = _encryptionService.DecryptString(encCode);
                    if (!string.IsNullOrEmpty(dec)) return dec;
                }
                catch { }
            }

            // Generate new recovery code
            string newCode = EncryptionService.GenerateRecoveryCode();
            string newEnc = _encryptionService.EncryptString(newCode);
            string newHash = EncryptionService.HashRecoveryCode(newCode);
            _settingsRepo.Set("owner_recovery_code_encrypted", newEnc);
            _settingsRepo.Set("owner_recovery_code_hash", newHash);
            _settingsRepo.Set("owner_recovery_code_confirmed", "0");
            return newCode;
        }

        public string GetConfirmedRecoveryCodeStatus()
        {
            if (_settingsRepo == null) return "0";
            return _settingsRepo.Get("owner_recovery_code_confirmed", "0");
        }

        public string GetDefaultBackupFolder()
        {
            string baseFolder;
#if DEBUG
            baseFolder = AppDomain.CurrentDomain.BaseDirectory;
#else
            baseFolder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "RafiqPOS");
#endif
            string backupFolder = Path.Combine(baseFolder, "backups");
            if (!Directory.Exists(backupFolder))
            {
                Directory.CreateDirectory(backupFolder);
            }
            return backupFolder;
        }

        public BackupResult CreateBackup(string customFolder)
        {
            var result = new BackupResult
            {
                Success = false,
                CreatedAt = DateTime.UtcNow.ToString("o"),
                IsVerified = false,
                FallbackToLocal = false
            };

            string targetFolder = customFolder;
            if (string.IsNullOrWhiteSpace(targetFolder))
            {
                targetFolder = _settingsRepo.Get("backup_target_folder", "");
            }

            string defaultFolder = GetDefaultBackupFolder();

            // Validate target folder or fallback to local
            if (string.IsNullOrWhiteSpace(targetFolder) || !CanWriteToFolder(targetFolder))
            {
                if (!string.IsNullOrWhiteSpace(targetFolder))
                {
                    result.FallbackToLocal = true;
                    Logger.Warn(string.Format("تعذر الكتابة في مجلد النسخ الاحتياطي المحدد '{0}'، تم التحويل تلقائياً للمجلد المحلي الآمن.", targetFolder));
                }
                targetFolder = defaultFolder;
            }

            string rawSnapshotPath = null;
            string encryptedTempPath = null;
            try
            {
                if (!Directory.Exists(targetFolder))
                {
                    Directory.CreateDirectory(targetFolder);
                }

                // Check free disk space (require at least 50MB)
                try
                {
                    string root = Path.GetPathRoot(targetFolder);
                    if (!string.IsNullOrEmpty(root))
                    {
                        var driveInfo = new DriveInfo(root);
                        if (driveInfo.IsReady && driveInfo.AvailableFreeSpace < 50 * 1024 * 1024)
                        {
                            result.Message = "المساحة المتوفرة على القرص غير كافية لإنشاء نسخة احتياطية (أقل من 50 ميجابايت).";
                            Logger.Error("فشل النسخ الاحتياطي: المساحة المتبقية غير كافية على القرص: " + root, null);
                            return result;
                        }
                    }
                }
                catch
                {
                    // DriveInfo check non-critical
                }

                string timestamp = DateTime.Now.ToString("yyyyMMdd_HHmmss_fff");
                string fileName = string.Format("rafiq_backup_{0}.db", timestamp);
                string backupFilePath = Path.Combine(targetFolder, fileName);

                // The plain snapshot and the encrypted copy are staged under .raw/.tmp names, so a rafiq_backup_*.db file
                // (what the list, retention and restore see) only ever appears complete
                rawSnapshotPath = backupFilePath + ".raw";
                encryptedTempPath = backupFilePath + ".tmp";
                if (File.Exists(backupFilePath))
                {
                    try { File.Delete(backupFilePath); } catch { }
                }
                if (File.Exists(rawSnapshotPath))
                {
                    try { File.Delete(rawSnapshotPath); } catch { }
                }

                // Counts before the snapshot: sales committed while the copy is encrypted may only make the backup older, never smaller
                long baselineProducts;
                long baselineSales;
                ReadLiveCounts(out baselineProducts, out baselineSales);

                // Use SQLite Online Backup API (thread-safe, non-blocking snapshot in WAL mode)
                string destConnString = string.Format("Data Source={0};Version=3;", rawSnapshotPath);

                using (var sourceConn = new SQLiteConnection(_connectionString))
                using (var destConn = new SQLiteConnection(destConnString))
                {
                    sourceConn.Open();
                    destConn.Open();

                    sourceConn.BackupDatabase(destConn, "main", "main", -1, null, 0);
                }

                // Feature #168 & F-42: Encrypt the backup snapshot using dual-wrap envelope encryption (RFBK v2)
                string recoveryCode = GetOrCreateRecoveryCode();
                _encryptionService.EncryptFileDualWrap(rawSnapshotPath, encryptedTempPath, recoveryCode);
                try { File.Delete(rawSnapshotPath); } catch { }
                File.Move(encryptedTempPath, backupFilePath);

                // Verify the backup file immediately (Feature #125 / Task 125-1)
                var fileInfo = new FileInfo(backupFilePath);
                result.BackupFilePath = backupFilePath;
                result.FileSizeBytes = fileInfo.Length;

                long verifiedProducts;
                long verifiedSales;
                string verifyMessage;
                bool integrityPassed = VerifyBackupCore(backupFilePath, true, baselineProducts, baselineSales, out verifiedProducts, out verifiedSales, out verifyMessage);
                if (!integrityPassed)
                {
                    try { File.Delete(backupFilePath); } catch { }
                    result.Message = "فشل فحص سلامة النسخة الاحتياطية بعد إنشائها. تم حذف الملف غير السليم لحماية البيانات. " + verifyMessage;
                    Logger.Error("فشل التحقق من سلامة ملف النسخة الاحتياطية: " + backupFilePath + " - " + verifyMessage, null);
                    _settingsRepo.Set("backup_last_status", "failed");
                    return result;
                }

                result.IsVerified = true;
                result.Success = true;

                // Story 136 / Feature #193: Include prescription media archive if present
                try
                {
                    string baseDataDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "RafiqPOS", "data");
#if DEBUG
                    if (!Directory.Exists(baseDataDir))
                    {
                        baseDataDir = AppDomain.CurrentDomain.BaseDirectory;
                    }
#endif
                    string rxDir = Path.Combine(baseDataDir, "prescriptions");
                    if (Directory.Exists(rxDir) && Directory.GetFiles(rxDir, "*", SearchOption.AllDirectories).Length > 0)
                    {
                        string rxZipTemp = Path.Combine(targetFolder, string.Format("rafiq_rx_{0}.zip.tmp", timestamp));
                        string rxEncPath = Path.Combine(targetFolder, string.Format("rafiq_rx_{0}.db", timestamp));
                        ZipFile.CreateFromDirectory(rxDir, rxZipTemp, CompressionLevel.Optimal, false);
                        _encryptionService.EncryptFileDualWrap(rxZipTemp, rxEncPath, recoveryCode);
                        try { File.Delete(rxZipTemp); } catch { }
                    }
                }
                catch (Exception rxEx)
                {
                    Logger.Warn("تعذر إدراج أرشيف صور الروشتات في النسخ الاحتياطي: " + rxEx.Message);
                }

                // Save status in settings
                _settingsRepo.Set("backup_last_success_at", DateTime.UtcNow.ToString("o"));
                _settingsRepo.Set("backup_last_file", backupFilePath);
                _settingsRepo.Set("backup_last_size_bytes", fileInfo.Length.ToString());
                _settingsRepo.Set("backup_last_status", result.FallbackToLocal ? "warning" : "success");

                // Prune old backups per retention policy (Task 9-3 & Senior Retention Engine)
                int retentionDays = GetRetentionDays();
                int retentionWeeks = GetRetentionWeeks();
                int maxCopies = GetMaxCopies();

                PruneOldBackups(targetFolder, retentionDays, retentionWeeks, maxCopies);

                // If fallback folder was used and differs from target, prune default too
                if (result.FallbackToLocal && targetFolder != defaultFolder)
                {
                    PruneOldBackups(defaultFolder, retentionDays, retentionWeeks, maxCopies);
                }

                // Audit log
                if (_auditRepo != null)
                {
                    string auditNotes = string.Format("تم إنشاء نسخة احتياطية بنجاح: {0} ({1:0.00} ميجا) {2}",
                        fileName,
                        fileInfo.Length / (1024.0 * 1024.0),
                        result.FallbackToLocal ? "[حفظ محلي لغياب الفلاشة]" : "[موقع معتمد]");

                    _auditRepo.Log(new Models.AuditLog
                    {
                        UserId = "usr_admin_default",
                        Action = "نسخ_احتياطي",
                        EntityType = "backups",
                        EntityId = fileName,
                        DetailsJson = auditNotes
                    });
                }

                if (result.FallbackToLocal)
                {
                    result.Message = string.Format("تم إنشاء النسخة الاحتياطية بنجاح وتم فحص سلامتها، لكن تم حفظها محلياً في الجهاز لتعذر الوصول إلى الفلاشة أو المجلد الخارجي. يرجى توصيل الفلاشة.");
                }
                else
                {
                    result.Message = string.Format("تم إنشاء النسخة الاحتياطية وفحص سلامتها بنجاح ({0:0.00} ميجابايت).", fileInfo.Length / (1024.0 * 1024.0));
                }

                Logger.Info("تم إتمام النسخ الاحتياطي بنجاح: " + backupFilePath);
                return result;
            }
            catch (Exception ex)
            {
                result.Message = "خطأ أثناء عملية النسخ الاحتياطي: " + ex.Message;
                Logger.Error("خطأ في إنشاء النسخة الاحتياطية", ex);
                // A half-written staging file must not linger next to the real backups (plain snapshot included)
                if (rawSnapshotPath != null) { try { File.Delete(rawSnapshotPath); } catch { } }
                if (encryptedTempPath != null) { try { File.Delete(encryptedTempPath); } catch { } }
                _settingsRepo.Set("backup_last_status", "failed");
                return result;
            }
        }

        private bool CanWriteToFolder(string folderPath)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(folderPath)) return false;

                string root = Path.GetPathRoot(folderPath);
                if (!string.IsNullOrEmpty(root))
                {
                    var drive = new DriveInfo(root);
                    if (!drive.IsReady) return false;
                }

                if (!Directory.Exists(folderPath))
                {
                    Directory.CreateDirectory(folderPath);
                }

                string testFile = Path.Combine(folderPath, "test_write_perm_" + Guid.NewGuid().ToString("N") + ".tmp");
                File.WriteAllText(testFile, "OK");
                File.Delete(testFile);
                return true;
            }
            catch
            {
                return false;
            }
        }

        private void ReadLiveCounts(out long products, out long sales)
        {
            products = 0;
            sales = 0;
            using (var mainConn = new SQLiteConnection(_connectionString))
            {
                mainConn.Open();
                using (var cmd = new SQLiteCommand("SELECT COUNT(*) FROM products;", mainConn))
                {
                    object pRes = cmd.ExecuteScalar();
                    if (pRes != null && pRes != DBNull.Value) products = Convert.ToInt64(pRes);
                }
                using (var cmd = new SQLiteCommand("SELECT COUNT(*) FROM sales;", mainConn))
                {
                    object sRes = cmd.ExecuteScalar();
                    if (sRes != null && sRes != DBNull.Value) sales = Convert.ToInt64(sRes);
                }
            }
        }

        /// <summary>
        /// Standalone check of an existing backup file (the list's "فحص" button): the file is only read, never modified, and the
        /// live database is not opened. An encrypted backup is decrypted to a private temp copy that is always deleted afterwards.
        /// </summary>
        public bool VerifyBackupDetailed(string backupFilePath, bool compareWithActiveDb, out long productsCount, out long salesCount, out string message)
        {
            return VerifyBackupCore(backupFilePath, compareWithActiveDb, -1, -1, out productsCount, out salesCount, out message);
        }

        // minProducts/minSales < 0 with compareWithActiveDb: exact match against the live counts read now (legacy behaviour);
        // otherwise the backup must hold at least those counts (taken before the snapshot started)
        private bool VerifyBackupCore(string backupFilePath, bool compareWithActiveDb, long minProducts, long minSales, out long productsCount, out long salesCount, out string message)
        {
            productsCount = 0;
            salesCount = 0;
            message = string.Empty;

            string fileToCheck = backupFilePath;
            string tempDecrypted = null;
            bool wasEncrypted = false;
            try
            {
                if (string.IsNullOrEmpty(backupFilePath) || !File.Exists(backupFilePath))
                {
                    message = "ملف النسخة الاحتياطية غير موجود أو تعذر الوصول إلى مساره.";
                    return false;
                }

                if (new FileInfo(backupFilePath).Length == 0)
                {
                    message = "ملف النسخة الاحتياطية فارغ (0 بايت) وغير صالح.";
                    return false;
                }

                // Feature #168: If backup is encrypted, decrypt to temp staging for SQLite verification
                if (EncryptionService.IsFileEncrypted(backupFilePath))
                {
                    wasEncrypted = true;
                    tempDecrypted = Path.Combine(Path.GetTempPath(), "rafiq_bk_verify_" + Guid.NewGuid().ToString("N") + ".tmp");
                    _encryptionService.DecryptFile(backupFilePath, tempDecrypted);
                    fileToCheck = tempDecrypted;
                }

                string connStr = string.Format("Data Source={0};Version=3;Read Only=True;", fileToCheck);
                using (var bkConn = new SQLiteConnection(connStr))
                {
                    bkConn.Open();

                    // 1. Quick integrity check
                    using (var cmd = new SQLiteCommand("PRAGMA quick_check;", bkConn))
                    {
                        object res = cmd.ExecuteScalar();
                        if (res == null || !res.ToString().Equals("ok", StringComparison.OrdinalIgnoreCase))
                        {
                            message = "بنية ملف قاعدة البيانات بها تلف داخلي.";
                            return false;
                        }
                    }

                    // 2. Count products and sales in backup
                    using (var cmd = new SQLiteCommand("SELECT COUNT(*) FROM products;", bkConn))
                    {
                        object pRes = cmd.ExecuteScalar();
                        if (pRes != null && pRes != DBNull.Value) productsCount = Convert.ToInt64(pRes);
                    }
                    using (var cmd = new SQLiteCommand("SELECT COUNT(*) FROM sales;", bkConn))
                    {
                        object sRes = cmd.ExecuteScalar();
                        if (sRes != null && sRes != DBNull.Value) salesCount = Convert.ToInt64(sRes);
                    }
                }

                // 3. Optional comparison with the active database (used right after the CreateBackup snapshot)
                if (compareWithActiveDb)
                {
                    bool exact = minProducts < 0 || minSales < 0;
                    long expectProducts = minProducts;
                    long expectSales = minSales;
                    if (exact)
                    {
                        ReadLiveCounts(out expectProducts, out expectSales);
                    }

                    bool mismatch = exact
                        ? (productsCount != expectProducts || salesCount != expectSales)
                        : (productsCount < expectProducts || salesCount < expectSales);
                    if (mismatch)
                    {
                        Logger.Warn(string.Format("فحص مطابقة النسخة الاحتياطية الفورية غير متطابق: أصناف (أصل {0} / نسخة {1})، فواتير (أصل {2} / نسخة {3})", expectProducts, productsCount, expectSales, salesCount));
                        message = string.Format("النسخة مأخوذة ولكنها لا تطابق السجلات اللحظية للنظام (أصناف: أصل {0} / نسخة {1}، فواتير: أصل {2} / نسخة {3}).", expectProducts, productsCount, expectSales, salesCount);
                        return false;
                    }
                }

                message = string.Format("تم فحص النسخة الاحتياطية بنجاح: بنية الملف سليمة {0} (تحتوي على {1} صنف و {2} فاتورة).",
                    wasEncrypted ? "ومشفرة بأمان" : "(نسخة قديمة غير مشفرة)", productsCount, salesCount);
                return true;
            }
            catch (IOException ex)
            {
                Logger.Error("فحص سلامة النسخة الاحتياطية فشل (الملف مستخدم أو غير مقروء): " + backupFilePath, ex);
                message = "تعذر قراءة ملف النسخة الاحتياطية (قد يكون مستخدماً من برنامج آخر أو الفلاشة غير متصلة): " + ex.Message;
                return false;
            }
            catch (SQLiteException ex)
            {
                Logger.Error("فحص سلامة النسخة الاحتياطية فشل (قاعدة بيانات غير صالحة): " + backupFilePath, ex);
                message = "الملف ليس نسخة احتياطية صالحة لرفيق أو أنه تالف: " + ex.Message;
                return false;
            }
            catch (Exception ex)
            {
                Logger.Error("فحص سلامة النسخة الاحتياطية فشل: " + backupFilePath, ex);
                message = "فشل فحص النسخة الاحتياطية: " + ex.Message;
                return false;
            }
            finally
            {
                if (!string.IsNullOrEmpty(tempDecrypted) && File.Exists(tempDecrypted))
                {
                    try { File.Delete(tempDecrypted); } catch { }
                }
            }
        }

        public void PruneOldBackups(string folderPath, int keepDays, int keepWeeks)
        {
            PruneOldBackups(folderPath, keepDays, keepWeeks, GetMaxCopies());
        }

        public void PruneOldBackups(string folderPath, int keepDays, int keepWeeks, int maxCopies)
        {
            try
            {
                if (!Directory.Exists(folderPath)) return;

                if (keepDays < 1) keepDays = 1;
                if (keepWeeks < 1) keepWeeks = 1;
                if (maxCopies < MIN_GUARANTEED_COPIES) maxCopies = MIN_GUARANTEED_COPIES;

                // Pillar 5: Clean orphaned temporary files older than 1 hour & excess pre-migrations
                CleanOrphanedFiles(folderPath);

                // Pillar 1: Retrieve and check fail-safe floor
                string[] files = Directory.GetFiles(folderPath, "rafiq_backup_*.db");
                if (files.Length <= MIN_GUARANTEED_COPIES)
                {
                    return;
                }

                var entries = new List<BackupFileEntry>();
                for (int i = 0; i < files.Length; i++)
                {
                    string f = files[i];
                    DateTime ts;
                    if (TryParseBackupTimestamp(f, out ts))
                    {
                        var fi = new FileInfo(f);
                        entries.Add(new BackupFileEntry
                        {
                            FilePath = f,
                            FileName = fi.Name,
                            Timestamp = ts,
                            DateKey = ts.ToString("yyyyMMdd"),
                            SizeBytes = fi.Length
                        });
                    }
                }

                if (entries.Count <= MIN_GUARANTEED_COPIES)
                {
                    return;
                }

                // Sort by timestamp ascending (oldest first)
                entries.Sort(delegate(BackupFileEntry a, BackupFileEntry b)
                {
                    return a.Timestamp.CompareTo(b.Timestamp);
                });

                var filesToDelete = new HashSet<string>();

                // Pillar 2: Intra-Day Consolidation (دمج نسخ اليوم الواحد للأيام السابقة)
                // For today: keep all backups. For past days: keep only the latest backup of that day.
                string todayKey = DateTime.Today.ToString("yyyyMMdd");
                var byDate = new Dictionary<string, List<BackupFileEntry>>();
                for (int i = 0; i < entries.Count; i++)
                {
                    var e = entries[i];
                    if (!byDate.ContainsKey(e.DateKey))
                    {
                        byDate[e.DateKey] = new List<BackupFileEntry>();
                    }
                    byDate[e.DateKey].Add(e);
                }

                foreach (var kvp in byDate)
                {
                    string dateKey = kvp.Key;
                    List<BackupFileEntry> dayEntries = kvp.Value;

                    if (dateKey != todayKey && dayEntries.Count > 1)
                    {
                        // Keep only the latest backup of that past day, delete earlier intra-day snapshots
                        for (int i = 0; i < dayEntries.Count - 1; i++)
                        {
                            if (entries.Count - filesToDelete.Count > MIN_GUARANTEED_COPIES)
                            {
                                filesToDelete.Add(dayEntries[i].FilePath);
                                Logger.Info(string.Format("تنظيف استبقاء: دمج وحذف نسخة مكررة لنفس اليوم السابق: {0}", dayEntries[i].FileName));
                            }
                        }
                    }
                }

                // Pillar 3: Tiered Retention (GFS: Daily & Weekly)
                DateTime now = DateTime.Now;
                DateTime cutoffDays = now.Date.AddDays(-keepDays);
                DateTime cutoffWeeks = now.Date.AddDays(-(keepWeeks * 7));

                // Traverse from newest to oldest to preserve the latest backup for each calendar week.
                // Expired/duplicate copies are only collected here: the minimum-copies floor is applied afterwards oldest-first,
                // otherwise the newest expired copies would be deleted first and the oldest would survive
                var keptWeeks = new HashSet<string>();
                var expiredCandidates = new List<BackupFileEntry>();
                for (int i = entries.Count - 1; i >= 0; i--)
                {
                    var e = entries[i];
                    if (filesToDelete.Contains(e.FilePath)) continue;

                    // Recent days: kept
                    if (e.Timestamp.Date >= cutoffDays)
                    {
                        continue;
                    }

                    // Expired past retention weeks: delete
                    if (e.Timestamp.Date < cutoffWeeks)
                    {
                        expiredCandidates.Add(e);
                        continue;
                    }

                    // Between keepDays and keepWeeks: keep 1 per week
                    int weekOfYear = e.Timestamp.DayOfYear / 7;
                    string weekKey = string.Format("{0}_{1}", e.Timestamp.Year, weekOfYear);
                    if (!keptWeeks.Contains(weekKey))
                    {
                        keptWeeks.Add(weekKey);
                    }
                    else
                    {
                        expiredCandidates.Add(e);
                    }
                }

                for (int i = expiredCandidates.Count - 1; i >= 0; i--)
                {
                    if (entries.Count - filesToDelete.Count > MIN_GUARANTEED_COPIES)
                    {
                        filesToDelete.Add(expiredCandidates[i].FilePath);
                        Logger.Info(string.Format("تنظيف استبقاء: نسخة خارج سياسة الاستبقاء ({0} أيام / {1} أسابيع): {2}", keepDays, keepWeeks, expiredCandidates[i].FileName));
                    }
                }

                // Pillar 4: Hard Ceiling (Max Total Copies)
                int survivingCount = entries.Count - filesToDelete.Count;
                if (survivingCount > maxCopies)
                {
                    for (int i = 0; i < entries.Count; i++)
                    {
                        var e = entries[i];
                        if (filesToDelete.Contains(e.FilePath)) continue;

                        if (entries.Count - filesToDelete.Count > maxCopies &&
                            entries.Count - filesToDelete.Count > MIN_GUARANTEED_COPIES)
                        {
                            filesToDelete.Add(e.FilePath);
                            Logger.Info(string.Format("تنظيف استبقاء: تجاوز الحد الأقصى لعدد النسخ ({0} نسخة): {1}", maxCopies, e.FileName));
                        }
                    }
                }

                // Pillar 5: Low Disk Space Emergency Pruning
                try
                {
                    string root = Path.GetPathRoot(folderPath);
                    if (!string.IsNullOrEmpty(root))
                    {
                        var drive = new DriveInfo(root);
                        if (drive.IsReady && drive.AvailableFreeSpace < LOW_DISK_SPACE_THRESHOLD_BYTES)
                        {
                            for (int i = 0; i < entries.Count; i++)
                            {
                                var e = entries[i];
                                if (filesToDelete.Contains(e.FilePath)) continue;

                                if (entries.Count - filesToDelete.Count > MIN_GUARANTEED_COPIES)
                                {
                                    filesToDelete.Add(e.FilePath);
                                    Logger.Warn(string.Format("تنظيف طارئ: حذف نسخة قديمة بسبب انخفاض مساحة القرص عن 500 ميجا: {0}", e.FileName));
                                }

                                drive = new DriveInfo(root);
                                if (drive.AvailableFreeSpace >= LOW_DISK_SPACE_THRESHOLD_BYTES)
                                {
                                    break;
                                }
                            }
                        }
                    }
                }
                catch
                {
                }

                // Safe Deletions Execution
                foreach (string f in filesToDelete)
                {
                    try
                    {
                        if (File.Exists(f))
                        {
                            File.Delete(f);
                        }

                        string rxCompanion = Path.Combine(Path.GetDirectoryName(f), Path.GetFileName(f).Replace("rafiq_backup_", "rafiq_rx_"));
                        if (File.Exists(rxCompanion))
                        {
                            try { File.Delete(rxCompanion); } catch { }
                        }
                    }
                    catch (Exception ex)
                    {
                        Logger.Warn(string.Format("تعذر حذف ملف النسخة القديمة '{0}': {1}", f, ex.Message));
                    }
                }
            }
            catch (Exception ex)
            {
                Logger.Warn("فشل تنظيف النسخ الاحتياطية القديمة: " + ex.Message);
            }
        }

        private static void CleanOrphanedFiles(string folderPath)
        {
            try
            {
                DateTime oneHourAgo = DateTime.Now.AddHours(-1);

                // Clean orphaned *.raw and *.tmp older than 1 hour
                string[] tempFiles = Directory.GetFiles(folderPath, "*.*");
                for (int i = 0; i < tempFiles.Length; i++)
                {
                    string f = tempFiles[i];
                    string ext = Path.GetExtension(f);
                    if (!string.IsNullOrEmpty(ext))
                    {
                        string lowerExt = ext.ToLowerInvariant();
                        if (lowerExt == ".raw" || lowerExt == ".tmp")
                        {
                            try
                            {
                                var fi = new FileInfo(f);
                                if (fi.CreationTime < oneHourAgo && fi.LastWriteTime < oneHourAgo)
                                {
                                    File.Delete(f);
                                    Logger.Info("تنظيف مخلفات مؤقتة قديمة: " + fi.Name);
                                }
                            }
                            catch { }
                        }
                    }
                }

                // Clean pre_migration_*.db keeping only latest 2
                string[] preMigFiles = Directory.GetFiles(folderPath, "pre_migration_*.db");
                if (preMigFiles.Length > 2)
                {
                    Array.Sort(preMigFiles);
                    int toDelete = preMigFiles.Length - 2;
                    for (int i = 0; i < toDelete; i++)
                    {
                        try
                        {
                            File.Delete(preMigFiles[i]);
                            Logger.Info("تنظيف نسخة ترحيل قديمة: " + Path.GetFileName(preMigFiles[i]));
                        }
                        catch { }
                    }
                }
            }
            catch { }
        }

        public BackupStatusInfo GetStatus()
        {
            return GetStatus(null, null);
        }

        /// <summary>
        /// نفس الحالة مع تصفية قائمة النسخ بتاريخ إنشاء الملف المحلي (من/إلى شاملين، تُعاد الترتيب لو انعكسا)؛
        /// مع الفترة يرتفع حد القائمة من 15 إلى 200 نسخة والتصفية تسبق الحد.
        /// </summary>
        public BackupStatusInfo GetStatus(string dateFrom, string dateTo)
        {
            return GetStatus(dateFrom, dateTo, 0);
        }

        /// <summary>limit &lt;= 0 keeps the default cap; any limit is bounded by MAX_LISTED_BACKUPS. TotalBackupCount is the match count before the cap.</summary>
        public BackupStatusInfo GetStatus(string dateFrom, string dateTo, int limit)
        {
            var status = new BackupStatusInfo();

            string lastSuccess = _settingsRepo.Get("backup_last_success_at", "");
            status.LastBackupAt = lastSuccess;
            status.LastBackupStatus = _settingsRepo.Get("backup_last_status", "never");
            status.LastBackupFile = _settingsRepo.Get("backup_last_file", "");
            
            long size = 0;
            long.TryParse(_settingsRepo.Get("backup_last_size_bytes", "0"), out size);
            status.LastBackupSizeBytes = size;

            status.ConfiguredFolder = _settingsRepo.Get("backup_target_folder", GetDefaultBackupFolder());
            status.AutoOnClose = _settingsRepo.Get("backup_auto_on_close", "1") == "1";
            status.AutoDaily = _settingsRepo.Get("backup_auto_daily", "1") == "1";

            status.RetentionDays = GetRetentionDays();
            status.RetentionWeeks = GetRetentionWeeks();
            int warnDays = GetWarnAfterDays();
            status.WarnAfterDays = warnDays;
            status.MaxCopies = GetMaxCopies();

            // Check overdue condition (Task 9-6)
            if (string.IsNullOrEmpty(lastSuccess))
            {
                status.IsOverdue = true;
                status.OverdueWarning = "تنبيه أمان حرج: لم يتم أخذ أي نسخة احتياطية للنظام بعد! يرجى أخذ نسخة الآن لحماية بيانات المحل من الضياع.";
            }
            else
            {
                DateTime dt;
                if (DateTime.TryParse(lastSuccess, out dt))
                {
                    TimeSpan elapsed = DateTime.UtcNow - dt.ToUniversalTime();
                    if (elapsed.TotalDays >= warnDays)
                    {
                        status.IsOverdue = true;
                        int daysPassed = (int)Math.Floor(elapsed.TotalDays);
                        status.OverdueWarning = string.Format("تحذير أمان: لم يتم أخذ نسخة احتياطية ناجحة منذ {0} أيام. احرص على توصيل الفلاشة وأخذ نسخة لحماية متجرك.", daysPassed);
                    }
                    else
                    {
                        status.IsOverdue = false;
                        status.OverdueWarning = null;
                    }
                }
            }

            FillBackupList(status, dateFrom, dateTo, limit);
            return status;
        }

        private class ListedBackup
        {
            public FileInfo Info;
            public DateTime Timestamp;
        }

        // Lists only finished backups made by the app (rafiq_backup_*.db), newest first by the timestamp in the file name
        // (a copy to a flash drive resets the file creation time, the name keeps the real moment)
        private void FillBackupList(BackupStatusInfo status, string dateFrom, string dateTo, int limit)
        {
            status.FolderStatus = "ok";
            string folder = status.ConfiguredFolder;
            try
            {
                if (string.IsNullOrWhiteSpace(folder))
                {
                    folder = GetDefaultBackupFolder();
                }
                else if (!Directory.Exists(folder))
                {
                    // CreateBackup falls back to the local safe folder when the configured one is unreachable, so the copies are there
                    status.FolderStatus = "unavailable";
                    status.FolderMessage = "تعذر الوصول إلى مجلد النسخ المحدد (الفلاشة غير متصلة أو المجلد غير موجود). المعروض هنا هو سجل المجلد المحلي الآمن بدلاً منه.";
                    folder = GetDefaultBackupFolder();
                }
                status.ListedFolder = folder;

                string[] files = Directory.GetFiles(folder, "rafiq_backup_*.db");

                string fromDay = NormalizeLocalDay(dateFrom);
                string toDay = NormalizeLocalDay(dateTo);
                if (fromDay != null && toDay != null && string.CompareOrdinal(fromDay, toDay) > 0)
                {
                    string swapDay = fromDay;
                    fromDay = toDay;
                    toDay = swapDay;
                }

                var matches = new List<ListedBackup>();
                foreach (string file in files)
                {
                    if (!file.EndsWith(".db", StringComparison.OrdinalIgnoreCase)) continue;
                    FileInfo fi;
                    DateTime ts;
                    try
                    {
                        fi = new FileInfo(file);
                        if ((fi.Attributes & FileAttributes.Hidden) != 0) continue;
                        if (!TryParseBackupTimestamp(file, out ts)) continue;
                    }
                    catch
                    {
                        continue;
                    }
                    string fileDay = ts.ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture);
                    if (fromDay != null && string.CompareOrdinal(fileDay, fromDay) < 0) continue;
                    if (toDay != null && string.CompareOrdinal(fileDay, toDay) > 0) continue;
                    matches.Add(new ListedBackup { Info = fi, Timestamp = ts });
                }

                matches.Sort(delegate(ListedBackup a, ListedBackup b)
                {
                    int byTime = b.Timestamp.CompareTo(a.Timestamp);
                    return byTime != 0 ? byTime : string.CompareOrdinal(b.Info.Name, a.Info.Name);
                });

                status.TotalBackupCount = matches.Count;
                int maxItems = limit > 0
                    ? Math.Min(limit, MAX_LISTED_BACKUPS)
                    : ((fromDay != null || toDay != null) ? MAX_LISTED_BACKUPS : DEFAULT_LISTED_BACKUPS);
                for (int i = 0; i < matches.Count && i < maxItems; i++)
                {
                    status.RecentBackups.Add(new BackupFileInfo
                    {
                        FileName = matches[i].Info.Name,
                        FullPath = matches[i].Info.FullName,
                        SizeBytes = matches[i].Info.Length,
                        CreatedAt = matches[i].Timestamp.ToString("yyyy-MM-dd HH:mm", System.Globalization.CultureInfo.InvariantCulture)
                    });
                }
            }
            catch (Exception ex)
            {
                status.FolderStatus = "unreadable";
                status.FolderMessage = "تعذر قراءة مجلد النسخ الاحتياطية: " + ex.Message;
                Logger.Warn("تعذر عرض سجل النسخ الاحتياطية: " + ex.Message);
            }
        }

        internal static bool IsPathInsideFolder(string fullPath, string folder)
        {
            if (string.IsNullOrWhiteSpace(folder)) return false;
            try
            {
                string prefix = Path.GetFullPath(folder.Trim()).TrimEnd('\\', '/') + Path.DirectorySeparatorChar;
                return fullPath.StartsWith(prefix, StringComparison.OrdinalIgnoreCase);
            }
            catch (Exception)
            {
                return false;
            }
        }

        internal static bool HasUnsafePathSyntax(string path)
        {
            if (path.StartsWith("\\\\?\\", StringComparison.Ordinal) || path.StartsWith("\\\\.\\", StringComparison.Ordinal)) return true;
            if (path.IndexOfAny(Path.GetInvalidPathChars()) >= 0 || path.IndexOf('*') >= 0 || path.IndexOf('?') >= 0) return true;
            // ':' is only valid as the drive separator; anywhere else it addresses an alternate data stream
            int colon = path.IndexOf(':');
            return colon >= 0 && colon != 1;
        }

        /// <summary>Arabic reason when the configured backup folder is not a usable full path; null when blank (default folder) or fine.</summary>
        public static string ValidateTargetFolder(string folder)
        {
            if (string.IsNullOrWhiteSpace(folder)) return null;
            string trimmed = folder.Trim();
            if (HasUnsafePathSyntax(trimmed))
            {
                return "مسار مجلد النسخ الاحتياطي غير صالح. اكتب مساراً كاملاً مثل E:\\RafiqBackups.";
            }
            bool driveRelative = trimmed.Length >= 2 && trimmed[1] == ':' && (trimmed.Length < 3 || (trimmed[2] != '\\' && trimmed[2] != '/'));
            if (!Path.IsPathRooted(trimmed) || driveRelative)
            {
                return "يجب كتابة المسار الكامل لمجلد النسخ الاحتياطي (مثال: E:\\RafiqBackups) وليس مساراً نسبياً.";
            }
            return null;
        }

        /// <summary>
        /// Gate for any path the UI sends to verify or restore a backup. Returns the Arabic reason, or null with the normalised
        /// full path. Network (UNC) files are accepted only inside the configured backup folder; a flash-drive file typed by the
        /// owner stays allowed (manual recovery) but must still be an existing regular .db file, never the live data folder.
        /// </summary>
        public static string ValidateRestoreSource(string path, string allowedFolder, string liveDataFolder, out string fullPath)
        {
            fullPath = null;
            if (string.IsNullOrWhiteSpace(path))
            {
                return "لم يتم تحديد ملف النسخة الاحتياطية.";
            }

            string trimmed = path.Trim().Trim('"');
            if (HasUnsafePathSyntax(trimmed))
            {
                return "مسار ملف النسخة الاحتياطية غير صالح أو غير مسموح.";
            }
            if (!Path.IsPathRooted(trimmed))
            {
                return "يجب تحديد المسار الكامل لملف النسخة الاحتياطية.";
            }

            string full;
            try
            {
                full = Path.GetFullPath(trimmed);
            }
            catch (Exception)
            {
                return "مسار ملف النسخة الاحتياطية غير صالح.";
            }

            if (full.StartsWith("\\\\", StringComparison.Ordinal) && !IsPathInsideFolder(full, allowedFolder))
            {
                return "ملفات مسارات الشبكة غير مسموحة إلا إذا كانت داخل مجلد النسخ الاحتياطي المحدد في الإعدادات.";
            }
            if (!string.Equals(Path.GetExtension(full), ".db", StringComparison.OrdinalIgnoreCase))
            {
                return "الملف المحدد ليس نسخة احتياطية من رفيق (الامتداد المطلوب db).";
            }
            if (!File.Exists(full))
            {
                return "لم يتم العثور على ملف النسخة الاحتياطية المحددة.";
            }
            try
            {
                if ((File.GetAttributes(full) & FileAttributes.ReparsePoint) != 0)
                {
                    return "الملف المحدد اختصار أو رابط رمزي وليس ملف نسخة احتياطية فعلياً.";
                }
            }
            catch (Exception)
            {
                return "تعذر قراءة خصائص ملف النسخة الاحتياطية.";
            }
            if (IsPathInsideFolder(full, liveDataFolder))
            {
                return "لا يمكن الاسترجاع من ملف داخل مجلد بيانات النظام الحالي.";
            }

            fullPath = full;
            return null;
        }

        private static string NormalizeLocalDay(string value)
        {
            if (string.IsNullOrWhiteSpace(value)) return null;
            string trimmed = value.Trim();
            if (trimmed.Length > 10) trimmed = trimmed.Substring(0, 10);
            DateTime parsed;
            if (!DateTime.TryParseExact(trimmed, "yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.None, out parsed))
            {
                return null;
            }
            return parsed.ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture);
        }

        public List<DriveItem> GetAvailableDrives()
        {
            var list = new List<DriveItem>();
            try
            {
                var drives = DriveInfo.GetDrives();
                foreach (var d in drives)
                {
                    try
                    {
                        var item = new DriveItem
                        {
                            Name = d.Name,
                            IsReady = d.IsReady,
                            IsRemovable = d.DriveType == System.IO.DriveType.Removable,
                            DriveType = d.DriveType.ToString()
                        };

                        if (d.IsReady)
                        {
                            item.Label = string.IsNullOrEmpty(d.VolumeLabel) ? (item.IsRemovable ? "فلاشة USB" : "قرص محلي") : d.VolumeLabel;
                            item.TotalSpaceBytes = d.TotalSize;
                            item.FreeSpaceBytes = d.AvailableFreeSpace;
                        }
                        else
                        {
                            item.Label = item.IsRemovable ? "فلاشة غير متصلة" : "قرص غير جاهز";
                        }

                        list.Add(item);
                    }
                    catch
                    {
                        // Ignore individual drive error
                    }
                }
            }
            catch
            {
                // Ignore system drives enumeration error
            }
            return list;
        }

        private static int ClampInt(int value, int min, int max)
        {
            if (value < min) return min;
            if (value > max) return max;
            return value;
        }

        public void SaveConfiguration(string targetFolder, bool autoOnClose, bool autoDaily, int retentionDays, int retentionWeeks, int warnDays, int maxCopies = DEFAULT_MAX_COPIES)
        {
            // Bounds keep an out-of-range request from turning retention into "delete everything but 3 files" or "never prune"
            var dict = new Dictionary<string, string>
            {
                { "backup_target_folder", targetFolder ?? "" },
                { "backup_auto_on_close", autoOnClose ? "1" : "0" },
                { "backup_auto_daily", autoDaily ? "1" : "0" },
                { "backup_retention_days", NormalizeRetentionDays(retentionDays).ToString() },
                { "backup_retention_weeks", NormalizeRetentionWeeks(retentionWeeks).ToString() },
                { "backup_warn_after_days", ClampInt(warnDays, 1, 365).ToString() },
                { "backup_max_copies", NormalizeMaxCopies(maxCopies).ToString() }
            };
            _settingsRepo.SaveBatch(dict);
        }
    }
}
