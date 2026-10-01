using System;
using System.Collections.Generic;
using System.Data.SQLite;
using System.IO;
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
        public bool IsVerified { get; set; }
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

        public BackupStatusInfo()
        {
            RecentBackups = new List<BackupFileInfo>();
        }
    }

    public class BackupService
    {
        public const int MIN_GUARANTEED_COPIES = 3;
        public const long LOW_DISK_SPACE_THRESHOLD_BYTES = 500L * 1024L * 1024L; // 500 MB

        private class BackupFileEntry
        {
            public string FilePath;
            public string FileName;
            public DateTime Timestamp;
            public string DateKey;
            public long SizeBytes;
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

        public BackupService(string connectionString, string dbPath, SettingsRepository settingsRepo, AuditLogRepository auditRepo, EncryptionService encryptionService = null)
        {
            this._connectionString = connectionString;
            this._dbPath = dbPath;
            this._settingsRepo = settingsRepo;
            this._auditRepo = auditRepo;
            this._encryptionService = encryptionService ?? new EncryptionService();
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

                string timestamp = DateTime.Now.ToString("yyyyMMdd_HHmmss");
                string fileName = string.Format("rafiq_backup_{0}.db", timestamp);
                string backupFilePath = Path.Combine(targetFolder, fileName);

                // Use SQLite Online Backup API (thread-safe, non-blocking snapshot in WAL mode)
                string destConnString = string.Format("Data Source={0};Version=3;", backupFilePath);

                using (var sourceConn = new SQLiteConnection(_connectionString))
                using (var destConn = new SQLiteConnection(destConnString))
                {
                    sourceConn.Open();
                    destConn.Open();

                    sourceConn.BackupDatabase(destConn, "main", "main", -1, null, 0);
                }

                // Feature #168: Encrypt the backup snapshot using device-bound AES-256-CBC + HMAC-SHA256
                string rawSnapshotPath = backupFilePath + ".raw";
                File.Move(backupFilePath, rawSnapshotPath);
                _encryptionService.EncryptFile(rawSnapshotPath, backupFilePath);
                try { File.Delete(rawSnapshotPath); } catch { }

                // Verify the backup file immediately (Feature #125 / Task 125-1)
                var fileInfo = new FileInfo(backupFilePath);
                result.BackupFilePath = backupFilePath;
                result.FileSizeBytes = fileInfo.Length;

                bool integrityPassed = VerifyBackupIntegrity(backupFilePath);
                if (!integrityPassed)
                {
                    try { File.Delete(backupFilePath); } catch { }
                    result.Message = "فشل فحص سلامة النسخة الاحتياطية بعد إنشائها. تم حذف الملف غير السليم لحماية البيانات.";
                    Logger.Error("فشل التحقق من سلامة ملف النسخة الاحتياطية: " + backupFilePath, null);
                    _settingsRepo.Set("backup_last_status", "failed");
                    return result;
                }

                result.IsVerified = true;
                result.Success = true;

                // Save status in settings
                _settingsRepo.Set("backup_last_success_at", DateTime.UtcNow.ToString("o"));
                _settingsRepo.Set("backup_last_file", backupFilePath);
                _settingsRepo.Set("backup_last_size_bytes", fileInfo.Length.ToString());
                _settingsRepo.Set("backup_last_status", result.FallbackToLocal ? "warning" : "success");

                // Prune old backups per retention policy (Task 9-3 & Senior Retention Engine)
                int retentionDays = 7;
                int retentionWeeks = 4;
                int maxCopies = 20;
                int.TryParse(_settingsRepo.Get("backup_retention_days", "7"), out retentionDays);
                int.TryParse(_settingsRepo.Get("backup_retention_weeks", "4"), out retentionWeeks);
                int.TryParse(_settingsRepo.Get("backup_max_copies", "20"), out maxCopies);

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

        public bool VerifyBackupIntegrity(string backupFilePath)
        {
            string fileToCheck = backupFilePath;
            string tempDecrypted = null;
            try
            {
                if (!File.Exists(backupFilePath)) return false;

                // Feature #168: If backup is encrypted, decrypt to temp staging for SQLite verification
                if (EncryptionService.IsFileEncrypted(backupFilePath))
                {
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
                            return false;
                        }
                    }

                    // 2. Count products and sales in backup
                    long bkProducts = 0;
                    long bkSales = 0;
                    using (var cmd = new SQLiteCommand("SELECT COUNT(*) FROM products;", bkConn))
                    {
                        object pRes = cmd.ExecuteScalar();
                        if (pRes != null && pRes != DBNull.Value) bkProducts = Convert.ToInt64(pRes);
                    }
                    using (var cmd = new SQLiteCommand("SELECT COUNT(*) FROM sales;", bkConn))
                    {
                        object sRes = cmd.ExecuteScalar();
                        if (sRes != null && sRes != DBNull.Value) bkSales = Convert.ToInt64(sRes);
                    }

                    // 3. Compare with primary active database (Task 125-1)
                    using (var mainConn = new SQLiteConnection(_connectionString))
                    {
                        mainConn.Open();
                        long mainProducts = 0;
                        long mainSales = 0;

                        using (var cmd = new SQLiteCommand("SELECT COUNT(*) FROM products;", mainConn))
                        {
                            object pRes = cmd.ExecuteScalar();
                            if (pRes != null && pRes != DBNull.Value) mainProducts = Convert.ToInt64(pRes);
                        }
                        using (var cmd = new SQLiteCommand("SELECT COUNT(*) FROM sales;", mainConn))
                        {
                            object sRes = cmd.ExecuteScalar();
                            if (sRes != null && sRes != DBNull.Value) mainSales = Convert.ToInt64(sRes);
                        }

                        if (bkProducts != mainProducts || bkSales != mainSales)
                        {
                            Logger.Warn(string.Format("فحص مطابقة النسخة الاحتياطية غير متطابق: أصناف (أصل {0} / نسخة {1})، فواتير (أصل {2} / نسخة {3})", mainProducts, bkProducts, mainSales, bkSales));
                            return false;
                        }
                    }
                }
                return true;
            }
            catch (Exception ex)
            {
                Logger.Error("فحص سلامة النسخة الاحتياطية فشل: " + backupFilePath, ex);
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
            int maxCopies = 20;
            int.TryParse(_settingsRepo.Get("backup_max_copies", "20"), out maxCopies);
            PruneOldBackups(folderPath, keepDays, keepWeeks, maxCopies);
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

                // Traverse from newest to oldest to preserve the latest backup for each calendar week
                var keptWeeks = new HashSet<string>();
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
                        if (entries.Count - filesToDelete.Count > MIN_GUARANTEED_COPIES)
                        {
                            filesToDelete.Add(e.FilePath);
                            Logger.Info(string.Format("تنظيف استبقاء: تجاوزت النسخة الحد الأقصى للأسابيع ({0} أسابيع): {1}", keepWeeks, e.FileName));
                        }
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
                        if (entries.Count - filesToDelete.Count > MIN_GUARANTEED_COPIES)
                        {
                            filesToDelete.Add(e.FilePath);
                            Logger.Info(string.Format("تنظيف استبقاء: تكرار نسخة في نفس الأسبوع القديم: {0}", e.FileName));
                        }
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

            int retDays = 7;
            int.TryParse(_settingsRepo.Get("backup_retention_days", "7"), out retDays);
            status.RetentionDays = retDays;

            int retWeeks = 4;
            int.TryParse(_settingsRepo.Get("backup_retention_weeks", "4"), out retWeeks);
            status.RetentionWeeks = retWeeks;

            int warnDays = 2;
            int.TryParse(_settingsRepo.Get("backup_warn_after_days", "2"), out warnDays);
            status.WarnAfterDays = warnDays;

            int maxCopies = 20;
            int.TryParse(_settingsRepo.Get("backup_max_copies", "20"), out maxCopies);
            status.MaxCopies = maxCopies;

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

            // List recent backups from folder
            try
            {
                string folder = status.ConfiguredFolder;
                if (Directory.Exists(folder))
                {
                    string[] files = Directory.GetFiles(folder, "rafiq_backup_*.db");
                    Array.Sort(files);
                    Array.Reverse(files);

                    int maxItems = Math.Min(files.Length, 15);
                    for (int i = 0; i < maxItems; i++)
                    {
                        var fi = new FileInfo(files[i]);
                        status.RecentBackups.Add(new BackupFileInfo
                        {
                            FileName = fi.Name,
                            FullPath = fi.FullName,
                            SizeBytes = fi.Length,
                            CreatedAt = fi.CreationTime.ToString("yyyy-MM-dd HH:mm"),
                            IsVerified = true
                        });
                    }
                }
            }
            catch
            {
                // Non-critical listing error
            }

            return status;
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

        public void SaveConfiguration(string targetFolder, bool autoOnClose, bool autoDaily, int retentionDays, int retentionWeeks, int warnDays, int maxCopies = 20)
        {
            var dict = new Dictionary<string, string>
            {
                { "backup_target_folder", targetFolder ?? "" },
                { "backup_auto_on_close", autoOnClose ? "1" : "0" },
                { "backup_auto_daily", autoDaily ? "1" : "0" },
                { "backup_retention_days", retentionDays.ToString() },
                { "backup_retention_weeks", retentionWeeks.ToString() },
                { "backup_warn_after_days", warnDays.ToString() },
                { "backup_max_copies", (maxCopies > 0 ? maxCopies : 20).ToString() }
            };
            _settingsRepo.SaveBatch(dict);
        }
    }
}
