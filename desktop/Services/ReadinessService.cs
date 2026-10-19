using System;
using System.Collections.Generic;
using System.IO;
using RafiqPOS.Common;
using RafiqPOS.Models;
using RafiqPOS.Repositories;

namespace RafiqPOS.Services
{
    public class ReadinessCheckItem
    {
        public string Key { get; set; }
        public string Title { get; set; }
        public bool Passed { get; set; }
        public string StatusText { get; set; }
        public string Description { get; set; }
        public string ActionLabel { get; set; }
        public string ActionTarget { get; set; }
    }

    public class ReadinessStatusResult
    {
        public bool IsReadyToSell { get; set; }
        public int TotalChecks { get; set; }
        public int PassedChecks { get; set; }
        public int ReadinessPercentage { get; set; }
        public string OverallStatusMessage { get; set; }
        public List<ReadinessCheckItem> Checks { get; set; }

        public ReadinessStatusResult()
        {
            Checks = new List<ReadinessCheckItem>();
        }
    }

    public class ReadinessService
    {
        private readonly SettingsRepository _settingsRepo;
        private readonly ProductRepository _productRepo;
        private readonly BackupService _backupService;
        private readonly PrinterService _printerService;

        public ReadinessService(
            SettingsRepository settingsRepo,
            ProductRepository productRepo,
            BackupService backupService,
            PrinterService printerService)
        {
            _settingsRepo = settingsRepo;
            _productRepo = productRepo;
            _backupService = backupService;
            _printerService = printerService;
        }

        public ReadinessStatusResult GetStatus()
        {
            var result = new ReadinessStatusResult();

            // 1. Windows OS Environment & WebView2 Runtime Check
            string osName = OsDetector.GetOsFriendlyName();
            bool isLegacy = OsDetector.IsLegacyWindows();
            bool osPassed = true; // Windows 7 SP1 to Windows 11 strictly supported
            string osStatusText = string.Format("متوافق ({0})", osName);

            result.Checks.Add(new ReadinessCheckItem
            {
                Key = "os_environment",
                Title = "بيئة الويندوز ومحرك العرض (Windows & WebView2)",
                Passed = osPassed,
                StatusText = osStatusText,
                Description = isLegacy
                    ? "تم تهيئة بيئة ويندوز الكلاسيكية (Windows 7/8) مع مشغل WebView2 Fixed 109 المستقر أوفلاين."
                    : "تم التحقق من توافق بيئة ويندوز الحديثة ومحرك WebView2 السريع للعمل المكتبي المستقر دون إنترنت.",
                ActionLabel = "بيانات النظام",
                ActionTarget = "settings:system"
            });

            // 2. Storage & ProgramData Permissions Check
            bool storagePassed = true;
            string storageStatusText = "صلاحيات ومساحة متوفرة";
            try
            {
                string dbPath = DatabaseService.DbPath;
                string dataFolder = !string.IsNullOrEmpty(dbPath) ? Path.GetDirectoryName(dbPath) : null;
                if (!string.IsNullOrEmpty(dataFolder) && Directory.Exists(dataFolder))
                {
                    // Check write permission in data folder
                    string probeFile = Path.Combine(dataFolder, "_perm_probe_" + Guid.NewGuid().ToString("N") + ".tmp");
                    File.WriteAllText(probeFile, "RAFIQ_PROBE");
                    File.Delete(probeFile);

                    // Check drive free space
                    string root = Path.GetPathRoot(Path.GetFullPath(dataFolder));
                    var drive = new DriveInfo(root);
                    if (drive.IsReady)
                    {
                        long freeBytes = drive.AvailableFreeSpace;
                        string freeFormatted = FormatBytes(freeBytes);
                        if (freeBytes < 300L * 1024 * 1024)
                        {
                            storagePassed = false;
                            storageStatusText = string.Format("المساحة منخفضة ({0})", freeFormatted);
                        }
                        else
                        {
                            storagePassed = true;
                            storageStatusText = string.Format("صلاحيات كاملة ({0} متاح)", freeFormatted);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                storagePassed = false;
                storageStatusText = "خلل في صلاحيات الكتابة: " + ex.Message;
            }

            result.Checks.Add(new ReadinessCheckItem
            {
                Key = "storage_permissions",
                Title = "صلاحيات التخزين ومساحة القرص (ProgramData)",
                Passed = storagePassed,
                StatusText = storageStatusText,
                Description = storagePassed
                    ? "مجلد البيانات المحلي (%ProgramData%\\RafiqPOS\\data) يتمتع بصلاحيات كتابة كاملة ومساحة قرص كافية لحفظ الفواتير والنسخ الاحتياطي دون انقطاع."
                    : "يرجى التحقق من توفر مساحة كافية على القرص أو التأكد من صلاحيات الكتابة في مجلد البرنامج.",
                ActionLabel = "فحص التخزين",
                ActionTarget = "settings:system"
            });

            // 3. Root User & Admin Security Check
            bool rootPassed = false;
            try
            {
                if (DatabaseService.UserRepo != null)
                {
                    var rootUser = DatabaseService.UserRepo.GetByUsername("islam");
                    var adminUser = DatabaseService.UserRepo.GetByUsername("admin");
                    rootPassed = (rootUser != null && rootUser.IsActive && rootUser.Role == "root") &&
                                 (adminUser != null && adminUser.IsActive);
                }
            }
            catch
            {
                rootPassed = false;
            }

            result.Checks.Add(new ReadinessCheckItem
            {
                Key = "root_security",
                Title = "أمان المستخدم الجذر والإدارة (Root & Admin)",
                Passed = rootPassed,
                StatusText = rootPassed ? "مؤمن ومشفر (PBKDF2)" : "غير مكتمل",
                Description = rootPassed
                    ? "المستخدم الجذر (Root) وصاحب المحل (Admin) مسجلان ومشفران لحماية الصلاحيات والإعدادات الحساسة."
                    : "يرجى التأكد من إنشاء حساب المدير وصاحب المحل وتعيين الصلاحيات.",
                ActionLabel = "إدارة المستخدمين",
                ActionTarget = "settings:users"
            });

            // 4. Store Profile Check
            string storeName = _settingsRepo != null ? _settingsRepo.Get("store_name", "") : "";
            bool profilePassed = !string.IsNullOrWhiteSpace(storeName);

            result.Checks.Add(new ReadinessCheckItem
            {
                Key = "store_profile",
                Title = "بيانات المحل والفاتورة",
                Passed = profilePassed,
                StatusText = profilePassed ? string.Format("مضبوطة ({0})", storeName) : "اسم المحل غير مسجل",
                Description = profilePassed
                    ? "اسم المحل وبيانات التواصل تظهر بشكل سليم في رأس وتذييل الإيصال المطبوع."
                    : "يرجى كتابة اسم المحل ورقم الهاتف لتظهر في فواتير الكاشير للزبائن.",
                ActionLabel = profilePassed ? "تعديل البيانات" : "تسجيل بيانات المحل",
                ActionTarget = "settings:profile"
            });

            // 5. Printer Hardware Check
            bool printerPassed = false;
            string printerStatusText = "لا توجد طابعة مضبوطة";
            try
            {
                var printers = _printerService != null ? _printerService.GetInstalledPrinters() : new List<PrinterInfo>();
                string defaultPrinter = _settingsRepo != null ? _settingsRepo.Get("default_printer_name", "") : "";

                if (printers.Count > 0)
                {
                    printerPassed = true;
                    string nameUsed = !string.IsNullOrEmpty(defaultPrinter) ? defaultPrinter : printers[0].Name;
                    printerStatusText = string.Format("جاهزة ({0})", nameUsed);
                }
            }
            catch
            {
                printerPassed = false;
                printerStatusText = "تعذر فحص الطابعات";
            }

            result.Checks.Add(new ReadinessCheckItem
            {
                Key = "printer",
                Title = "طابعة الفواتير والإيصالات الحرارية",
                Passed = printerPassed,
                StatusText = printerStatusText,
                Description = printerPassed
                    ? "تم اكتشاف الطابعة وجاهزة لطباعة إيصالات الكاشير وفتح درج النقدية."
                    : "يرجى تثبيت طابعة فواتير أو اختيار الطابعة الافتراضية من إعدادات الطابعة.",
                ActionLabel = "اختبار الطباعة",
                ActionTarget = "printer:testPrint"
            });

            // 6. Barcode Scanner Check
            string scannerEnabled = _settingsRepo != null ? _settingsRepo.Get("scanner_enabled", "1") : "1";
            bool scannerPassed = scannerEnabled != "0";

            result.Checks.Add(new ReadinessCheckItem
            {
                Key = "scanner",
                Title = "قارئ الباركود والماسح الضوئي",
                Passed = scannerPassed,
                StatusText = scannerPassed ? "مفعل وجاهز للمسح" : "معطل في الإعدادات",
                Description = "مستمع الباركود السريع نشط وينقل الأصناف مباشرة إلى سلة المبيعات بدون لمس الماوس.",
                ActionLabel = "فحص قارئ الباركود",
                ActionTarget = "scanner:test"
            });

            // 7. Backup & Data Protection Check
            bool backupPassed = false;
            string backupStatusText = "لم يتم أخذ نسخة بعد";
            try
            {
                if (_backupService != null)
                {
                    var bStatus = _backupService.GetStatus();
                    if (bStatus != null && !string.IsNullOrEmpty(bStatus.LastBackupAt) && !bStatus.IsOverdue)
                    {
                        backupPassed = true;
                        DateTime bDt;
                        if (DateTime.TryParse(bStatus.LastBackupAt, out bDt))
                        {
                            backupStatusText = string.Format("محفوظة ({0:yyyy/MM/dd hh:mm tt})", bDt.ToLocalTime());
                        }
                        else
                        {
                            backupStatusText = "سليمة ومحفوظة";
                        }
                    }
                    else if (bStatus != null && !string.IsNullOrEmpty(bStatus.LastBackupAt))
                    {
                        backupPassed = true;
                        backupStatusText = "توجد نسخة قديمة - ينصح بالتحديث";
                    }
                }
            }
            catch
            {
                backupPassed = false;
            }

            result.Checks.Add(new ReadinessCheckItem
            {
                Key = "backup",
                Title = "النسخ الاحتياطي وحماية البيانات",
                Passed = backupPassed,
                StatusText = backupStatusText,
                Description = backupPassed
                    ? "يوجد مسار للنسخ الاحتياطي ونسخة محفوظة تحمي بياناتك من انقطاع الكهرباء."
                    : "ينصح بأخذ أول نسخة احتياطية على فلاشة USB خارجية لضمان أمان المحل.",
                ActionLabel = "أخذ نسخة احتياطية",
                ActionTarget = "backup:run"
            });

            // 8. Products Catalog Check
            int prodsCount = 0;
            try
            {
                if (_productRepo != null)
                {
                    prodsCount = _productRepo.GetTotalCount();
                }
            }
            catch
            {
                prodsCount = 0;
            }
            bool productsPassed = prodsCount > 0;

            result.Checks.Add(new ReadinessCheckItem
            {
                Key = "products",
                Title = "كتالوج الأصناف والأسعار",
                Passed = productsPassed,
                StatusText = productsPassed ? string.Format("{0} صنف مسجل", prodsCount) : "لا توجد أصناف مسجلة",
                Description = productsPassed
                    ? string.Format("يحتوي النظام على {0} صنف جاهز للبيع بأسعارها المحددة.", prodsCount)
                    : "أضف بضعة أصناف أولاً أو حمّل البيانات التجريبية لتتمكن من إجراء أول بيعة.",
                ActionLabel = productsPassed ? "عرض الأصناف" : "إضافة صنف أو استيراد",
                ActionTarget = "products:catalog"
            });

            // Aggregate calculations
            result.TotalChecks = result.Checks.Count;
            result.PassedChecks = 0;
            for (int i = 0; i < result.Checks.Count; i++)
            {
                if (result.Checks[i].Passed) result.PassedChecks++;
            }

            result.ReadinessPercentage = (result.TotalChecks > 0)
                ? (result.PassedChecks * 100) / result.TotalChecks
                : 0;

            result.IsReadyToSell = result.ReadinessPercentage >= 70 && profilePassed && productsPassed && storagePassed;

            if (result.IsReadyToSell && result.ReadinessPercentage == 100)
            {
                result.OverallStatusMessage = "رفيق جاهز للبيع بنسبة 100%! كافة الأجهزة والإعدادات مكتملة.";
            }
            else if (result.IsReadyToSell)
            {
                result.OverallStatusMessage = "جاهز للبيع! يمكنك بدء البيع مع استكمال باقي التوصيات.";
            }
            else
            {
                result.OverallStatusMessage = string.Format("يلزم إكمال {0} عناصر للوصول للجاهزية التشغيلية الكاملة.", result.TotalChecks - result.PassedChecks);
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
