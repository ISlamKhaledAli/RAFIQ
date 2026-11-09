using System;
using System.Collections.Generic;
using RafiqPOS.Common;

namespace RafiqPOS.Services
{
    public class PrinterResolution
    {
        public string Name { get; set; }
        // الطابعة المحفوظة في الإعدادات لم تعد مثبتة فتم استبدالها بطابعة ويندوز الافتراضية
        public bool FellBack { get; set; }
        // لا توجد طابعة صالحة يمكن الطباعة عليها
        public bool NotFound { get; set; }
    }

    /// <summary>
    /// اختيار اسم الطابعة بدون لمس ويندوز: الاسم الصريح لا يُستبدل بجهاز آخر أبداً، والمحفوظ في الإعدادات
    /// يُستبدل بالطابعة الافتراضية إذا حُذفت من الجهاز، وطابعات الملفات الافتراضية لا تُحسب طابعة فعلية.
    /// </summary>
    public static class PrinterNameResolver
    {
        private static readonly string[] VirtualMarkers = new string[]
        {
            "xps document writer", "print to pdf", "onenote", "fax", "send to onenote"
        };

        public static bool IsVirtualPrinter(string name)
        {
            if (string.IsNullOrWhiteSpace(name)) return false;
            string lower = name.Trim().ToLowerInvariant();
            for (int i = 0; i < VirtualMarkers.Length; i++)
            {
                if (lower.IndexOf(VirtualMarkers[i], StringComparison.Ordinal) >= 0) return true;
            }
            return false;
        }

        public static bool ContainsPrinter(IList<string> installed, string name)
        {
            if (installed == null || string.IsNullOrWhiteSpace(name)) return false;
            string wanted = name.Trim();
            for (int i = 0; i < installed.Count; i++)
            {
                if (string.Equals((installed[i] ?? "").Trim(), wanted, StringComparison.OrdinalIgnoreCase)) return true;
            }
            return false;
        }

        public static PrinterResolution Resolve(string explicitName, string configuredName, IList<string> installed, string windowsDefault)
        {
            string requested = (explicitName ?? "").Trim();
            if (requested.Length > 0)
            {
                bool known = RawPrinterHelper.IsNetworkPrinter(requested) || ContainsPrinter(installed, requested);
                return new PrinterResolution { Name = requested, NotFound = !known };
            }

            string configured = (configuredName ?? "").Trim();
            if (configured.Length > 0 && (RawPrinterHelper.IsNetworkPrinter(configured) || ContainsPrinter(installed, configured)))
            {
                return new PrinterResolution { Name = configured };
            }

            string fallback = (windowsDefault ?? "").Trim();
            if (fallback.Length > 0 && ContainsPrinter(installed, fallback))
            {
                return new PrinterResolution { Name = fallback, FellBack = configured.Length > 0 };
            }

            return new PrinterResolution { Name = configured, NotFound = true };
        }

        /// <summary>عدد الطابعات الفعلية (بدون طابعات الملفات الافتراضية في ويندوز).</summary>
        public static int CountRealPrinters(IList<string> installed)
        {
            if (installed == null) return 0;
            int count = 0;
            for (int i = 0; i < installed.Count; i++)
            {
                if (!string.IsNullOrWhiteSpace(installed[i]) && !IsVirtualPrinter(installed[i])) count++;
            }
            return count;
        }
    }
}
