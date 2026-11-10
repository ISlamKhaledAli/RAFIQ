using System;
using System.Globalization;
using System.Runtime.InteropServices;

namespace RafiqPOS.Common
{
    public enum DevicePerformanceTier
    {
        Weak,
        Medium,
        Strong
    }

    public static class DeviceTierDetector
    {
        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
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

        [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern bool GlobalMemoryStatusEx(ref MEMORYSTATUSEX lpBuffer);

        private static bool _cached = false;
        private static long _cachedRamMb = 0;
        private static int _cachedCores = 0;
        private static bool _cachedIs64Bit = false;
        private static bool _cachedIsLegacy = false;
        private static DevicePerformanceTier _cachedTier = DevicePerformanceTier.Medium;
        private static string _cachedSummary = null;

        public static long GetTotalRamMb()
        {
            EnsureDetected();
            return _cachedRamMb;
        }

        public static int GetCpuCores()
        {
            EnsureDetected();
            return _cachedCores;
        }

        public static bool Is64BitOs()
        {
            EnsureDetected();
            return _cachedIs64Bit;
        }

        public static DevicePerformanceTier DetectTier()
        {
            EnsureDetected();
            return _cachedTier;
        }

        public static string DetectMotionLevel()
        {
            return TierToMotionLevel(DetectTier());
        }

        public static string TierToMotionLevel(DevicePerformanceTier tier)
        {
            switch (tier)
            {
                case DevicePerformanceTier.Weak:
                    return "soft";
                case DevicePerformanceTier.Strong:
                    return "strong";
                default:
                    return "medium";
            }
        }

        public static string GetTierArabicName(DevicePerformanceTier tier)
        {
            switch (tier)
            {
                case DevicePerformanceTier.Weak:
                    return "ضعيف";
                case DevicePerformanceTier.Strong:
                    return "قوي";
                default:
                    return "متوسط";
            }
        }

        public static string GetTierMotionLabel(DevicePerformanceTier tier)
        {
            switch (tier)
            {
                case DevicePerformanceTier.Weak:
                    return "خفيفة";
                case DevicePerformanceTier.Strong:
                    return "قوية";
                default:
                    return "متوسطة";
            }
        }

        public static DevicePerformanceTier ClassifyTier(long ramMb, int cores, bool is64Bit, bool isLegacy)
        {
            // الأجهزة الضعيفة: نظام 32 بت، أو رام أقل من 3.5 جيجا، أو نواة واحدة، أو نواتان مع رام 4 جيجا أو أقل
            if (!is64Bit || ramMb < 3500 || (ramMb <= 4096 && cores <= 2) || cores <= 1)
            {
                return DevicePerformanceTier.Weak;
            }

            // الأجهزة القوية: رام 7.5 جيجا فأكثر (8GB+)، مع 4 أنوية على الأقل، ونظام 64 بت حديث (ويندوز 10 أو 11)
            if (ramMb >= 7500 && cores >= 4 && !isLegacy)
            {
                return DevicePerformanceTier.Strong;
            }

            // الأجهزة المتوسطة: البقية (مثل 4-8 جيجا رام مع معالج رباعي، أو ويندوز 7 بذاكرة كبيرة)
            return DevicePerformanceTier.Medium;
        }

        public static string GetDeviceSummary()
        {
            EnsureDetected();
            return _cachedSummary;
        }

        private static void EnsureDetected()
        {
            if (_cached) return;

            long ram = 4096;
            try
            {
                MEMORYSTATUSEX status = new MEMORYSTATUSEX();
                status.dwLength = (uint)Marshal.SizeOf(typeof(MEMORYSTATUSEX));
                if (GlobalMemoryStatusEx(ref status))
                {
                    ram = (long)(status.ullTotalPhys / (1024UL * 1024UL));
                }
            }
            catch
            {
                ram = 4096;
            }

            int cores = 1;
            try
            {
                cores = Environment.ProcessorCount;
            }
            catch
            {
                cores = 2;
            }

            bool is64 = false;
            try
            {
                is64 = Environment.Is64BitOperatingSystem;
            }
            catch
            {
                is64 = false;
            }

            bool isLegacy = false;
            try
            {
                isLegacy = OsDetector.IsLegacyWindows();
            }
            catch
            {
                isLegacy = false;
            }

            _cachedRamMb = ram;
            _cachedCores = cores;
            _cachedIs64Bit = is64;
            _cachedIsLegacy = isLegacy;
            _cachedTier = ClassifyTier(ram, cores, is64, isLegacy);

            string osName = "Windows";
            try
            {
                osName = OsDetector.GetOsFriendlyName();
            }
            catch
            {
            }

            double ramGb = Math.Round((double)ram / 1024.0, 1);
            _cachedSummary = string.Format(
                CultureInfo.InvariantCulture,
                "{0} • ذاكرة {1:N0} ميجابايت ({2} جيجابايت) • {3} معالجات • نظام {4}-bit",
                osName,
                ram,
                ramGb.ToString("0.0", CultureInfo.InvariantCulture),
                cores,
                is64 ? 64 : 32
            );

            _cached = true;
        }

        /// <summary>تفريغ الذاكرة المؤقتة للاختبارات فقط</summary>
        public static void ResetCacheForTesting()
        {
            _cached = false;
        }
    }
}

