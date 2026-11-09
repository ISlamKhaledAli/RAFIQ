using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;
using RafiqPOS.Common;

namespace RafiqPOS.Services
{
    public class ReportSaveResult
    {
        public bool Success { get; set; }
        public string ErrorCode { get; set; }
        public string Message { get; set; }
        public string FilePath { get; set; }
        public string FolderPath { get; set; }
        public string FileName { get; set; }
        public long SizeBytes { get; set; }
    }

    /// <summary>
    /// حفظ التقارير والمستندات كملفات في مجلد يجده المستخدم (المستندات\RafiqPOS\Reports):
    /// اسم فريد بالتاريخ والوقت، كتابة ذرية (ملف مؤقت ثم إعادة تسمية)، وتنظيف الأسماء من أي مسار أو اسم محجوز في ويندوز.
    /// المسار ثابت من الخادم: الواجهة لا تحدد مجلداً أبداً.
    /// </summary>
    public class ReportFileService
    {
        public const long MaxFileBytes = 100L * 1024L * 1024L;
        public const string DefaultBaseName = "تقرير";
        private const int MaxBaseNameLength = 80;
        private const int MaxCollisionAttempts = 999;

        private static readonly string[] AllowedExtensions = new string[] { "pdf", "html", "png" };

        private static readonly string[] ReservedNames = new string[]
        {
            "CON", "PRN", "AUX", "NUL",
            "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
            "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9"
        };

        private readonly string _baseFolder;

        // baseFolder = null يعني المجلد الافتراضي؛ الاختبارات توجه الحفظ إلى مجلد مؤقت
        public ReportFileService(string baseFolder)
        {
            _baseFolder = baseFolder;
        }

        public static string NormalizeExtension(string extension)
        {
            string ext = (extension ?? "").Trim().TrimStart('.').ToLowerInvariant();
            for (int i = 0; i < AllowedExtensions.Length; i++)
            {
                if (AllowedExtensions[i] == ext) return ext;
            }
            return null;
        }

        private static bool IsUnsafeChar(char c)
        {
            if (c < 32) return true;
            if (c >= '\u200B' && c <= '\u200F') return true; // علامات الاتجاه غير المرئية
            if (c >= '\u202A' && c <= '\u202E') return true;
            if (c >= '\u2066' && c <= '\u2069') return true;
            return "\\/:*?\"<>|".IndexOf(c) >= 0;
        }

        public static string SanitizeBaseName(string raw)
        {
            string text = (raw ?? "").Trim();
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < text.Length; i++)
            {
                char c = text[i];
                if (IsUnsafeChar(c))
                {
                    if (sb.Length == 0 || sb[sb.Length - 1] != '_') sb.Append('_');
                }
                else
                {
                    sb.Append(c);
                }
            }

            string name = sb.ToString();
            while (name.IndexOf("..", StringComparison.Ordinal) >= 0) name = name.Replace("..", ".");
            name = name.Trim(' ', '.', '_');
            if (name.Length > MaxBaseNameLength) name = name.Substring(0, MaxBaseNameLength).Trim(' ', '.', '_');
            if (name.Length == 0) return DefaultBaseName;

            string firstPart = name;
            int dot = name.IndexOf('.');
            if (dot >= 0) firstPart = name.Substring(0, dot);
            for (int r = 0; r < ReservedNames.Length; r++)
            {
                if (string.Equals(firstPart.Trim(), ReservedNames[r], StringComparison.OrdinalIgnoreCase))
                {
                    return DefaultBaseName + "_" + name.Replace('.', '_');
                }
            }
            return name;
        }

        public static string BuildFileName(string baseName, DateTime now, string extension, int attempt)
        {
            string stamp = now.ToString("yyyyMMdd_HHmmss", CultureInfo.InvariantCulture);
            string suffix = attempt > 1 ? "_" + attempt.ToString(CultureInfo.InvariantCulture) : "";
            return SanitizeBaseName(baseName) + "_" + stamp + suffix + "." + extension;
        }

        /// <summary>مجلدات الحفظ بالترتيب: المجلد المحدد للاختبار، ثم المستندات، ثم ProgramData.</summary>
        public List<string> GetCandidateFolders()
        {
            List<string> folders = new List<string>();
            if (!string.IsNullOrWhiteSpace(_baseFolder))
            {
                folders.Add(_baseFolder);
                return folders;
            }

            string documents = Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments);
            if (!string.IsNullOrWhiteSpace(documents))
            {
                folders.Add(Path.Combine(Path.Combine(documents, "RafiqPOS"), "Reports"));
            }
            folders.Add(Path.Combine(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "RafiqPOS"), "reports"));
            return folders;
        }

        public ReportSaveResult Save(string reportName, string extension, byte[] content)
        {
            string ext = NormalizeExtension(extension);
            if (ext == null)
            {
                return Fail("INVALID_EXTENSION", "نوع الملف غير مدعوم للحفظ.");
            }
            if (content == null || content.Length == 0)
            {
                return Fail("EMPTY_CONTENT", "لا يوجد محتوى لحفظه في الملف.");
            }
            if (content.LongLength > MaxFileBytes)
            {
                return Fail("FILE_TOO_LARGE", "حجم الملف أكبر من الحد المسموح للحفظ (100 ميجابايت).");
            }

            string lastMessage = "";
            List<string> folders = GetCandidateFolders();
            for (int i = 0; i < folders.Count; i++)
            {
                try
                {
                    return WriteUnique(folders[i], reportName, ext, content);
                }
                catch (Exception ex)
                {
                    lastMessage = DescribeIoError(ex);
                    Logger.Warn("تعذر حفظ التقرير في المجلد " + folders[i] + ": " + ex.Message);
                }
            }
            return Fail("SAVE_FAILED", "تعذر حفظ الملف: " + lastMessage);
        }

        private static ReportSaveResult WriteUnique(string folder, string reportName, string ext, byte[] content)
        {
            Directory.CreateDirectory(folder);
            string folderFull = Path.GetFullPath(folder);
            string guard = folderFull.TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
            DateTime now = DateTime.Now;

            for (int attempt = 1; attempt <= MaxCollisionAttempts; attempt++)
            {
                string fileName = BuildFileName(reportName, now, ext, attempt);
                string finalPath = Path.GetFullPath(Path.Combine(folderFull, fileName));
                if (!finalPath.StartsWith(guard, StringComparison.OrdinalIgnoreCase))
                {
                    return Fail("INVALID_FILE_NAME", "اسم الملف غير صالح.");
                }
                if (File.Exists(finalPath)) continue;

                string tempPath = Path.Combine(folderFull, "." + Guid.NewGuid().ToString("N") + ".tmp");
                try
                {
                    using (FileStream fs = new FileStream(tempPath, FileMode.CreateNew, FileAccess.Write, FileShare.None))
                    {
                        fs.Write(content, 0, content.Length);
                        fs.Flush(true);
                    }
                    File.Move(tempPath, finalPath);
                }
                catch (IOException)
                {
                    TryDelete(tempPath);
                    // سباق على نفس الاسم: نجرب الرقم التالي، وأي خطأ آخر يُرفع
                    if (File.Exists(finalPath)) continue;
                    throw;
                }
                catch
                {
                    TryDelete(tempPath);
                    throw;
                }

                return new ReportSaveResult
                {
                    Success = true,
                    FilePath = finalPath,
                    FolderPath = folderFull,
                    FileName = fileName,
                    SizeBytes = content.LongLength
                };
            }
            throw new IOException("تعذر إيجاد اسم ملف غير مكرر.");
        }

        private static void TryDelete(string path)
        {
            try { if (File.Exists(path)) File.Delete(path); }
            catch (IOException) { }
            catch (UnauthorizedAccessException) { }
        }

        private static string DescribeIoError(Exception ex)
        {
            if (ex is UnauthorizedAccessException) return "لا توجد صلاحية كتابة على المجلد.";
            if (ex is PathTooLongException) return "مسار المجلد طويل جداً.";
            if (ex is DirectoryNotFoundException) return "المجلد غير موجود أو غير متاح.";
            if (ex is IOException)
            {
                int code = System.Runtime.InteropServices.Marshal.GetHRForException(ex) & 0xFFFF;
                if (code == 112 || code == 39) return "لا توجد مساحة كافية على القرص.";
                return "تعذر الكتابة على القرص (الملف مستخدم أو القرص غير جاهز).";
            }
            return "حدث خطأ غير متوقع أثناء الكتابة.";
        }

        private static ReportSaveResult Fail(string code, string message)
        {
            return new ReportSaveResult { Success = false, ErrorCode = code, Message = message };
        }
    }
}
