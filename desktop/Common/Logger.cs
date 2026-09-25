using System;
using System.IO;
using System.Text;

namespace RafiqPOS.Common
{
    public static class Logger
    {
        private static readonly object _syncLock = new object();
        private static string _logFilePath;
        private const long MaxFileSizeBytes = 2 * 1024 * 1024; // 2 MB
        private const int MaxBackupFiles = 3;

        static Logger()
        {
            try
            {
                string baseFolder;
#if DEBUG
                baseFolder = AppDomain.CurrentDomain.BaseDirectory;
#else
                baseFolder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "RafiqPOS");
#endif
                string logFolder = Path.Combine(baseFolder, "logs");
                if (!Directory.Exists(logFolder))
                {
                    Directory.CreateDirectory(logFolder);
                }

                _logFilePath = Path.Combine(logFolder, "error.log");
            }
            catch
            {
                // Fallback to local directory if ProgramData is unavailable
                try
                {
                    string localLogs = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "logs");
                    if (!Directory.Exists(localLogs))
                    {
                        Directory.CreateDirectory(localLogs);
                    }
                    _logFilePath = Path.Combine(localLogs, "error.log");
                }
                catch
                {
                    _logFilePath = null;
                }
            }
        }

        public static string LogFilePath
        {
            get { return _logFilePath; }
        }

        public static void Info(string message)
        {
            Write("INFO", message, null);
        }

        public static void Warn(string message)
        {
            Write("WARN", message, null);
        }

        public static void Error(string message, Exception ex = null)
        {
            Write("ERROR", message, ex);
        }

        private static void Write(string level, string message, Exception ex)
        {
            if (string.IsNullOrEmpty(_logFilePath)) return;

            try
            {
                lock (_syncLock)
                {
                    CheckAndRotate();

                    StringBuilder sb = new StringBuilder();
                    sb.AppendFormat("[{0:yyyy-MM-dd HH:mm:ss.fff}] [{1}] {2}", DateTime.Now, level, message);
                    if (ex != null)
                    {
                        sb.AppendLine();
                        sb.AppendFormat("Exception: {0}: {1}", ex.GetType().FullName, ex.Message);
                        sb.AppendLine();
                        sb.Append(ex.StackTrace);
                        if (ex.InnerException != null)
                        {
                            sb.AppendLine();
                            sb.AppendFormat("InnerException: {0}: {1}", ex.InnerException.GetType().FullName, ex.InnerException.Message);
                            sb.AppendLine();
                            sb.Append(ex.InnerException.StackTrace);
                        }
                    }
                    sb.AppendLine();

                    File.AppendAllText(_logFilePath, sb.ToString(), Encoding.UTF8);
                }
            }
            catch
            {
                // Never allow a failure in logger to bring down the application
            }
        }

        private static void CheckAndRotate()
        {
            try
            {
                if (!File.Exists(_logFilePath)) return;

                FileInfo fi = new FileInfo(_logFilePath);
                if (fi.Length < MaxFileSizeBytes) return;

                // Rotate: error.log.2 -> error.log.3, error.log.1 -> error.log.2, error.log -> error.log.1
                for (int i = MaxBackupFiles - 1; i >= 1; i--)
                {
                    string src = string.Format("{0}.{1}", _logFilePath, i);
                    string dst = string.Format("{0}.{1}", _logFilePath, i + 1);
                    if (File.Exists(src))
                    {
                        if (File.Exists(dst))
                        {
                            File.Delete(dst);
                        }
                        File.Move(src, dst);
                    }
                }

                string firstBackup = _logFilePath + ".1";
                if (File.Exists(firstBackup))
                {
                    File.Delete(firstBackup);
                }
                File.Move(_logFilePath, firstBackup);
            }
            catch
            {
                // Ignore rotation errors safely
            }
        }

        public static string ReadRecentLogs(int maxLines = 500)
        {
            if (string.IsNullOrEmpty(_logFilePath) || !File.Exists(_logFilePath))
            {
                return "لا توجد سجلات أخطاء مسجلة حالياً.";
            }

            try
            {
                lock (_syncLock)
                {
                    string[] lines = File.ReadAllLines(_logFilePath, Encoding.UTF8);
                    if (lines.Length <= maxLines)
                    {
                        return string.Join(Environment.NewLine, lines);
                    }

                    string[] recent = new string[maxLines];
                    Array.Copy(lines, lines.Length - maxLines, recent, 0, maxLines);
                    return string.Join(Environment.NewLine, recent);
                }
            }
            catch (Exception ex)
            {
                return "تعذر قراءة ملف السجلات: " + ex.Message;
            }
        }
    }
}
