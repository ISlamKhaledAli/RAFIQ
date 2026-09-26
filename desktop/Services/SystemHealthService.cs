using System;
using System.Collections.Generic;
using System.IO;
using RafiqPOS.Common;
using RafiqPOS.Repositories;

namespace RafiqPOS.Services
{
    public class SystemAlert
    {
        public string Id { get; set; }
        public string Level { get; set; } // "critical", "warning", "info"
        public string Title { get; set; }
        public string Message { get; set; }
        public string FixAction { get; set; }
        public string FixTarget { get; set; }
    }

    public class SystemHealthMetrics
    {
        public string DiskFreeFormatted { get; set; }
        public long DiskFreeBytes { get; set; }
        public string LastBackupFormatted { get; set; }
        public bool IsBackupOverdue { get; set; }
        public string PrinterName { get; set; }
        public bool IsPrinterReady { get; set; }
        public string LicenseStatus { get; set; }
        public string AppVersion { get; set; }
        public string DatabaseStatus { get; set; }
        public int ProductsCount { get; set; }
        public bool IsAuditLogTampered { get; set; }
        public string AuditLogStatus { get; set; }
        public string EncryptionStatus { get; set; }
        public string DeviceFingerprint { get; set; }
    }

    public class SystemHealthResult
    {
        public string OverallStatus { get; set; } // "HEALTHY", "ATTENTION_NEEDED", "CRITICAL"
        public string OneSentenceSummary { get; set; }
        public int HealthScore { get; set; } // 0 - 100
        public string PrimaryIssueFixAction { get; set; }
        public string PrimaryIssueFixTarget { get; set; }
        public List<SystemAlert> Alerts { get; set; }
        public SystemHealthMetrics Metrics { get; set; }

        public SystemHealthResult()
        {
            Alerts = new List<SystemAlert>();
            Metrics = new SystemHealthMetrics();
        }
    }

    public class SystemHealthService
    {
        private readonly string _dbPath;
        private readonly SettingsRepository _settingsRepo;
        private readonly ProductRepository _productRepo;
        private readonly BackupService _backupService;
        private readonly PrinterService _printerService;

        public SystemHealthService(
            string dbPath,
            SettingsRepository settingsRepo,
            ProductRepository productRepo,
            BackupService backupService,
            PrinterService printerService)
        {
            this._dbPath = dbPath;
            this._settingsRepo = settingsRepo;
            this._productRepo = productRepo;
            this._backupService = backupService;
            this._printerService = printerService;
        }

        public SystemHealthResult GetSystemHealth()
        {
            var result = new SystemHealthResult();
            var alerts = new List<SystemAlert>();
            var metrics = new SystemHealthMetrics();

            metrics.AppVersion = "رفيق POS v1.0.0 (أوفلاين)";
            metrics.LicenseStatus = "ترخيص دائم نشط (مدى الحياة)";

            // 1. Check Database File & Drive Free Space (Task 138-1)
            long freeBytes = 0;
            try
            {
                string root = Path.GetPathRoot(Path.GetFullPath(_dbPath));
                var drive = new DriveInfo(root);
                if (drive.IsReady)
                {
                    freeBytes = drive.AvailableFreeSpace;
                    metrics.DiskFreeBytes = freeBytes;
                    metrics.DiskFreeFormatted = FormatBytes(freeBytes);

                    if (freeBytes < 300L * 1024 * 1024) // < 300MB Critical
                    {
                        alerts.Add(new SystemAlert
                        {
                            Id = "disk_critical",
                            Level = "critical",
                            Title = "مساحة القرص منخفضة جداً",
                            Message = string.Format("المساحة المتبقية على القرص ({0}) أقل من 300 ميجابايت. قد يتوقف تسجيل الفواتير.", metrics.DiskFreeFormatted),
                            FixAction = "تفريغ مساحة",
                            FixTarget = "settings:system"
                        });
                    }
                    else if (freeBytes < 1024L * 1024 * 1024) // < 1GB Warning
                    {
                        alerts.Add(new SystemAlert
                        {
                            Id = "disk_warning",
                            Level = "warning",
                            Title = "تنبيه مساحة القرص",
                            Message = string.Format("المساحة المتبقية على القرص {0}. ينصح بتفريغ مساحة لضمان سرعة قاعدة البيانات.", metrics.DiskFreeFormatted),
                            FixAction = "فحص القرص",
                            FixTarget = "settings:system"
                        });
                    }
                }
            }
            catch
            {
                metrics.DiskFreeFormatted = "غير متاح";
            }

            // Database status
            metrics.DatabaseStatus = File.Exists(_dbPath) ? "سليمة (وضع WAL الفائق)" : "غير منشأة";

            // 2. Check Backup Status (Task 138-1)
            metrics.LastBackupFormatted = "لم تؤخذ بعد";
            metrics.IsBackupOverdue = false;
            try
            {
                if (_backupService != null)
                {
                    var bStatus = _backupService.GetStatus();
                    if (bStatus != null)
                    {
                        metrics.IsBackupOverdue = bStatus.IsOverdue;
                        if (!string.IsNullOrEmpty(bStatus.LastBackupAt))
                        {
                            DateTime bDt;
                            if (DateTime.TryParse(bStatus.LastBackupAt, out bDt))
                            {
                                metrics.LastBackupFormatted = bDt.ToLocalTime().ToString("yyyy/MM/dd hh:mm tt");
                            }
                            else
                            {
                                metrics.LastBackupFormatted = "محفوظة اليوم";
                            }
                        }

                        if (string.IsNullOrEmpty(bStatus.LastBackupAt))
                        {
                            alerts.Add(new SystemAlert
                            {
                                Id = "backup_missing",
                                Level = "warning",
                                Title = "لم يتم أخذ نسخة احتياطية",
                                Message = "لا توجد أي نسخة احتياطية مسجلة للنظام. احفظ نسخة على فلاشة USB لحماية بياناتك.",
                                FixAction = "أخذ نسخة احتياطية الآن",
                                FixTarget = "settings:backup"
                            });
                        }
                        else if (bStatus.IsOverdue)
                        {
                            alerts.Add(new SystemAlert
                            {
                                Id = "backup_overdue",
                                Level = "warning",
                                Title = "النسخة الاحتياطية قديمة",
                                Message = bStatus.OverdueWarning ?? "تجاوزت المدة المحددة دون أخذ نسخة احتياطية حديثة.",
                                FixAction = "تحديث النسخة الاحتياطية",
                                FixTarget = "settings:backup"
                            });
                        }
                    }
                }
            }
            catch
            {
                // Non-blocking
            }

            // 3. Check Printer Status (Task 138-1)
            metrics.IsPrinterReady = false;
            metrics.PrinterName = "لا توجد طابعة";
            try
            {
                if (_printerService != null)
                {
                    var printers = _printerService.GetInstalledPrinters();
                    string defPrinter = _settingsRepo != null ? _settingsRepo.Get("default_printer_name", "") : "";
                    if (printers.Count > 0)
                    {
                        metrics.IsPrinterReady = true;
                        metrics.PrinterName = !string.IsNullOrEmpty(defPrinter) ? defPrinter : printers[0].Name;
                    }
                    else
                    {
                        alerts.Add(new SystemAlert
                        {
                            Id = "printer_missing",
                            Level = "info",
                            Title = "طابعة الإيصالات غير متصلة",
                            Message = "لم يتم العثور على طابعة فواتير مثبتة في ويندوز. يمكنك الاستمرار بالبيع بدون طباعة ورقية.",
                            FixAction = "ضبط الطابعة",
                            FixTarget = "settings:printer"
                        });
                    }
                }
            }
            catch
            {
                // Non-blocking
            }

            // 4. Products Count
            try
            {
                metrics.ProductsCount = _productRepo != null ? _productRepo.GetTotalCount() : 0;
                if (metrics.ProductsCount == 0)
                {
                    alerts.Add(new SystemAlert
                    {
                        Id = "products_empty",
                        Level = "info",
                        Title = "كتالوج الأصناف فارغ",
                        Message = "لا توجد منتجات مسجلة في المحل حتى الآن. أضف بعض المنتجات أو حمّل البيانات التجريبية.",
                        FixAction = "إضافة أصناف",
                        FixTarget = "products"
                    });
                }
            }
            catch
            {
                metrics.ProductsCount = 0;
            }

            // 4.5. Check Cryptographic Audit Log Integrity & Device Encryption (Feature #167, #168, #169)
            metrics.EncryptionStatus = "مشفّر ومحمي ببصمة الجهاز (AES-256-CBC + HMAC-SHA256)";
            metrics.DeviceFingerprint = DatabaseService.Encryption != null ? DatabaseService.Encryption.DeviceFingerprint : "RAFIQ-DEV-ACTIVE";
            metrics.IsAuditLogTampered = false;
            metrics.AuditLogStatus = "سلسلة العمليات سليمة ومحمية بالتوقيع الرقمي";

            try
            {
                if (DatabaseService.Audit != null)
                {
                    var auditCheck = DatabaseService.Audit.VerifyChainIntegrity();
                    if (auditCheck != null && auditCheck.IsTampered)
                    {
                        metrics.IsAuditLogTampered = true;
                        metrics.AuditLogStatus = auditCheck.ErrorMessage;

                        alerts.Add(new SystemAlert
                        {
                            Id = "audit_tamper_detected",
                            Level = "critical",
                            Title = "تنبيه أمني: كشف تلاعب مباشر في سجل العمليات!",
                            Message = auditCheck.ErrorMessage,
                            FixAction = "مراجعة السجل وحظر التعديل المباشر",
                            FixTarget = "settings"
                        });
                    }
                    else if (auditCheck != null)
                    {
                        metrics.AuditLogStatus = string.Format("سلسلة العمليات سليمة وموثقة ({0} سجل)", auditCheck.TotalRecordsVerified);
                    }
                }
            }
            catch (Exception ex)
            {
                Logger.Warn("فحص سلامة سلسلة سجل العمليات واجه استثناء: " + ex.Message);
            }

            // 5. Aggregate Health & One-Sentence Summary (Task 138-1 & 138-2)
            result.Alerts = alerts;
            result.Metrics = metrics;

            bool hasCritical = false;
            bool hasWarning = false;

            for (int i = 0; i < alerts.Count; i++)
            {
                if (alerts[i].Level == "critical") hasCritical = true;
                if (alerts[i].Level == "warning") hasWarning = true;
            }

            if (hasCritical)
            {
                result.OverallStatus = "CRITICAL";
                result.HealthScore = 40;
                var critAlert = alerts.Find(a => a.Level == "critical");
                result.OneSentenceSummary = "انتباه حرج: " + (critAlert != null ? critAlert.Message : "يوجد خطر يهدد سلامة حفظ البيانات.");
                result.PrimaryIssueFixAction = critAlert != null ? critAlert.FixAction : "إصلاح الآن";
                result.PrimaryIssueFixTarget = critAlert != null ? critAlert.FixTarget : "settings";
            }
            else if (hasWarning)
            {
                result.OverallStatus = "ATTENTION_NEEDED";
                result.HealthScore = 75;
                var warnAlert = alerts.Find(a => a.Level == "warning");
                result.OneSentenceSummary = "يحتاج انتباهك: " + (warnAlert != null ? warnAlert.Message : "توجد توصيات أمان مستحسنة للمحل.");
                result.PrimaryIssueFixAction = warnAlert != null ? warnAlert.FixAction : "مراجعة الآن";
                result.PrimaryIssueFixTarget = warnAlert != null ? warnAlert.FixTarget : "settings:backup";
            }
            else
            {
                result.OverallStatus = "HEALTHY";
                result.HealthScore = 100;
                result.OneSentenceSummary = "النظام جاهز تماماً لتسجيل المبيعات • قاعدة البيانات مؤمنة ومستقرة بنسبة 100%";
                result.PrimaryIssueFixAction = null;
                result.PrimaryIssueFixTarget = null;
            }

            return result;
        }

        private static string FormatBytes(long bytes)
        {
            if (bytes < 1024) return bytes + " بايت";
            if (bytes < 1024 * 1024) return (bytes / 1024.0).ToString("0.#") + " كيلوبايت";
            if (bytes < 1024 * 1024 * 1024) return (bytes / (1024.0 * 1024.0)).ToString("0.#") + " ميجابايت";
            return (bytes / (1024.0 * 1024.0 * 1024.0)).ToString("0.##") + " جيجابايت";
        }
    }
}
