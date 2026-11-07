using System;
using System.Diagnostics;
using System.IO;
using System.Management;

namespace RafiqPOS.Common
{
    /// <summary>
    /// Guard that cleans up orphaned msedgewebview2.exe processes and stale lock files
    /// to prevent HRESULT 0x800700AA (The requested resource is in use) on application restart.
    /// </summary>
    public static class WebViewProcessGuard
    {
        /// <summary>
        /// Kills any lingering msedgewebview2.exe processes associated with RafiqPOS profile or runtime.
        /// </summary>
        public static void TerminateOrphanedProcesses()
        {
            try
            {
                int killedCount = 0;

                // 1. First attempt: Query through WMI to inspect command lines accurately
                try
                {
                    string query = "SELECT ProcessId, ExecutablePath, CommandLine FROM Win32_Process WHERE Name = 'msedgewebview2.exe'";
                    using (ManagementObjectSearcher searcher = new ManagementObjectSearcher(query))
                    using (ManagementObjectCollection collection = searcher.Get())
                    {
                        foreach (ManagementObject mo in collection)
                        {
                            try
                            {
                                uint pid = (uint)mo["ProcessId"];
                                string cmdLine = mo["CommandLine"] as string;
                                string exePath = mo["ExecutablePath"] as string;

                                bool isOurProcess = false;
                                if (!string.IsNullOrEmpty(cmdLine))
                                {
                                    if (cmdLine.IndexOf("webview_profile", StringComparison.OrdinalIgnoreCase) >= 0 ||
                                        cmdLine.IndexOf("RafiqPOS", StringComparison.OrdinalIgnoreCase) >= 0 ||
                                        cmdLine.IndexOf("fixed109", StringComparison.OrdinalIgnoreCase) >= 0)
                                    {
                                        isOurProcess = true;
                                    }
                                }

                                if (!isOurProcess && !string.IsNullOrEmpty(exePath))
                                {
                                    if (exePath.IndexOf("fixed109", StringComparison.OrdinalIgnoreCase) >= 0 ||
                                        exePath.IndexOf("RafiqPOS", StringComparison.OrdinalIgnoreCase) >= 0)
                                    {
                                        isOurProcess = true;
                                    }
                                }

                                if (isOurProcess)
                                {
                                    try
                                    {
                                        Process p = Process.GetProcessById((int)pid);
                                        if (!p.HasExited)
                                        {
                                            p.Kill();
                                            p.WaitForExit(1000);
                                            killedCount++;
                                            Logger.Info(string.Format("تم إنهاء عملية مشغل عرض عالقة بواسطة WMI (PID={0})", pid));
                                        }
                                    }
                                    catch { }
                                }
                            }
                            catch { }
                        }
                    }
                }
                catch (Exception wmiEx)
                {
                    Logger.Warn("تعذر استخدام WMI لفحص مشغل العرض (سيتم استخدام الفحص المباشر): " + wmiEx.Message);
                }

                // 2. Fallback: Check Process.GetProcessesByName for fixed109 modules
                Process[] processes = Process.GetProcessesByName("msedgewebview2");
                if (processes != null && processes.Length > 0)
                {
                    for (int i = 0; i < processes.Length; i++)
                    {
                        Process proc = processes[i];
                        try
                        {
                            if (proc.HasExited) continue;

                            bool shouldKill = false;
                            try
                            {
                                string modulePath = proc.MainModule.FileName;
                                if (!string.IsNullOrEmpty(modulePath) &&
                                    (modulePath.IndexOf("fixed109", StringComparison.OrdinalIgnoreCase) >= 0 ||
                                     modulePath.IndexOf("RafiqPOS", StringComparison.OrdinalIgnoreCase) >= 0))
                                {
                                    shouldKill = true;
                                }
                            }
                            catch { }

                            if (shouldKill)
                            {
                                proc.Kill();
                                proc.WaitForExit(1000);
                                killedCount++;
                                Logger.Info(string.Format("تم إنهاء عملية مشغل عرض عالقة بالفحص المباشر (PID={0})", proc.Id));
                            }
                        }
                        catch { }
                        finally
                        {
                            try { proc.Dispose(); } catch { }
                        }
                    }
                }

                if (killedCount > 0)
                {
                    Logger.Info(string.Format("اكتمل تطهير عمليات مشغل العرض المعلقة: تم إنهاء {0} عملية بنجاح.", killedCount));
                }
            }
            catch (Exception ex)
            {
                Logger.Warn("خطأ أثناء تطهير عمليات مشغل العرض: " + ex.Message);
            }
        }

        /// <summary>
        /// Cleans up stale Chromium lockfiles inside the UserDataFolder.
        /// </summary>
        public static void CleanStaleLockFiles(string userDataFolder)
        {
            try
            {
                if (string.IsNullOrEmpty(userDataFolder) || !Directory.Exists(userDataFolder)) return;

                string ebPath = Path.Combine(userDataFolder, "EBWebView");
                if (!Directory.Exists(ebPath)) return;

                string[] lockFileNames = new string[] { "lockfile", "SingletonLock", "SingletonSocket", "SingletonCookie" };
                for (int i = 0; i < lockFileNames.Length; i++)
                {
                    string lockPath = Path.Combine(ebPath, lockFileNames[i]);
                    if (File.Exists(lockPath))
                    {
                        try
                        {
                            File.Delete(lockPath);
                            Logger.Info("تم حذف ملف القفل المعلق لمشغل العرض: " + lockFileNames[i]);
                        }
                        catch (Exception delEx)
                        {
                            Logger.Warn(string.Format("تعذر حذف ملف القفل {0}: {1}", lockFileNames[i], delEx.Message));
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Logger.Warn("خطأ أثناء تنظيف ملفات القفل لمشغل العرض: " + ex.Message);
            }
        }
    }
}

