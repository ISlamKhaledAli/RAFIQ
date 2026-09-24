using System;
using Microsoft.Win32;

namespace RafiqPOS.Common
{
    public static class OsDetector
    {
        public static string GetOsFriendlyName()
        {
            try
            {
                using (var key = Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Microsoft\Windows NT\CurrentVersion"))
                {
                    if (key != null)
                    {
                        object productName = key.GetValue("ProductName");
                        object currentBuild = key.GetValue("CurrentBuild");
                        int buildNum = 0;
                        if (currentBuild != null)
                        {
                            int.TryParse(currentBuild.ToString(), out buildNum);
                        }

                        // Windows 11 check: Windows 11 still reports "Windows 10" in ProductName on older builds,
                        // but build number is >= 22000
                        if (buildNum >= 22000)
                        {
                            return string.Format("Windows 11 (Build {0})", buildNum);
                        }

                        if (productName != null)
                        {
                            return string.Format("{0} (Build {1})", productName, buildNum);
                        }
                    }
                }
            }
            catch
            {
                // Fallback to Environment if registry is inaccessible
            }

            var ver = Environment.OSVersion.Version;
            if (ver.Major == 10)
            {
                return (ver.Build >= 22000) ? "Windows 11" : "Windows 10";
            }
            if (ver.Major == 6)
            {
                if (ver.Minor == 1) return "Windows 7 SP1";
                if (ver.Minor == 2) return "Windows 8";
                if (ver.Minor == 3) return "Windows 8.1";
            }

            return Environment.OSVersion.VersionString;
        }

        public static bool IsLegacyWindows()
        {
            // True ONLY for Windows 7, Windows 8, and Windows 8.1
            try
            {
                using (var key = Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Microsoft\Windows NT\CurrentVersion"))
                {
                    if (key != null)
                    {
                        object currentBuild = key.GetValue("CurrentBuild");
                        if (currentBuild != null)
                        {
                            int buildNum = 0;
                            if (int.TryParse(currentBuild.ToString(), out buildNum))
                            {
                                // Windows 10/11 build numbers are >= 10240
                                if (buildNum >= 10000)
                                {
                                    return false;
                                }
                            }
                        }
                    }
                }
            }
            catch
            {
            }

            var ver = Environment.OSVersion.Version;
            return ver.Major == 6 && (ver.Minor == 1 || ver.Minor == 2 || ver.Minor == 3);
        }
    }
}
