using System;
using System.Collections.Generic;
using System.IO;
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

            // 1. Store Profile Check
            string storeName = _settingsRepo != null ? _settingsRepo.Get("store_name", "") : "";
            string storePhone = _settingsRepo != null ? _settingsRepo.Get("store_phone", "") : "";
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

            // 2. Printer Hardware Check
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
                Title = "طابعة الإيصالات الحرارية (Feature #53)",
                Passed = printerPassed,
                StatusText = printerStatusText,
                Description = printerPassed
                    ? "تم اكتشاف الطابعة وجاهزة لطباعة إيصالات الكاشير وفتح درج النقدية."
                    : "يرجى تثبيت طابعة فواتير أو اختيار الطابعة الافتراضية من إعدادات الطابعة.",
                ActionLabel = "اختبار الطباعة",
                ActionTarget = "printer:testPrint"
            });

            // 3. Barcode Scanner Check
            // Barcode scanners in POS act as USB HID Keyboard wedges; check if enabled
            string scannerEnabled = _settingsRepo != null ? _settingsRepo.Get("scanner_enabled", "1") : "1";
            bool scannerPassed = scannerEnabled != "0";

            result.Checks.Add(new ReadinessCheckItem
            {
                Key = "scanner",
                Title = "قارئ الباركود (Barcode Scanner)",
                Passed = scannerPassed,
                StatusText = scannerPassed ? "مفعل وجاهز للمسح" : "معطل في الإعدادات",
                Description = "مستمع الباركود السريع نشط وينقل الأصناف مباشرة إلى سلة المبيعات بدون لمس الماوس.",
                ActionLabel = "فحص قارئ الباركود",
                ActionTarget = "scanner:test"
            });

            // 4. Backup & Data Protection Check
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
                        backupStatusText = string.Format("سليمة ({0})", bStatus.LastBackupAt);
                    }
                    else if (bStatus != null && !string.IsNullOrEmpty(bStatus.LastBackupAt))
                    {
                        backupPassed = true;
                        backupStatusText = "يوجد نسخة ولكنها قديمة";
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
                Title = "النسخ الاحتياطي وأمان البيانات (Feature #9)",
                Passed = backupPassed,
                StatusText = backupStatusText,
                Description = backupPassed
                    ? "يوجد مسار للنسخ الاحتياطي ونسخة محفوظة تحمي بياناتك من انقطاع الكهرباء."
                    : "ينصح بأخذ أول نسخة احتياطية على فلاشة USB خارجية لضمان أمان المحل.",
                ActionLabel = "أخذ نسخة احتياطية",
                ActionTarget = "backup:run"
            });

            // 5. Products Catalog Check
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

            result.IsReadyToSell = result.ReadinessPercentage >= 80 && profilePassed && productsPassed;

            if (result.IsReadyToSell && result.ReadinessPercentage == 100)
            {
                result.OverallStatusMessage = "🎉 رفيق جاهز للبيع بنسبة 100%! كافة الأجهزة والإعدادات مكتملة.";
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
    }
}
