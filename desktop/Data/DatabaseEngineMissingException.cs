using System;

namespace RafiqPOS.Data
{
    // The native database engine (sqlite3mc.dll) is missing, blocked (antivirus) or the wrong architecture.
    // Not a data problem: the store is untouched, restoring a backup would not help, a re-install does.
    public sealed class DatabaseEngineMissingException : Exception
    {
        public const string ArabicMessage = "ملف محرك قاعدة البيانات sqlite3mc.dll مفقود أو محجوب بواسطة برنامج الحماية (Antivirus) أو غير مناسب لهذا النظام. بياناتك سليمة ولم يتم تغيير أي ملف. أعد تثبيت رفيق بملف التثبيت الرسمي وتأكد أن برنامج الحماية لا يعزل ملفات المجلد.";

        public int Win32Error { get; private set; }

        public DatabaseEngineMissingException(string detail, int win32Error, Exception inner)
            : base(ArabicMessage + (string.IsNullOrEmpty(detail) ? string.Empty : "\n\n" + detail), inner)
        {
            Win32Error = win32Error;
        }
    }
}
