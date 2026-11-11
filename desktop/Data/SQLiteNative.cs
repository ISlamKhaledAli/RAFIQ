using System;
using System.IO;
using System.Runtime.InteropServices;
using RafiqPOS.Common;

namespace RafiqPOS.Data
{
    // One-time SQLitePCLRaw provider setup (SQLite3 Multiple Ciphers bundle) and native DLL load. Fails closed: when the engine
    // cannot be loaded from the application folder a dedicated exception is raised (never a silent search of other folders).
    internal static class SQLiteNative
    {
        private const string NativeLibraryFile = "sqlite3mc.dll";
        // LOAD_LIBRARY_SEARCH_APPLICATION_DIR | LOAD_LIBRARY_SEARCH_SYSTEM32
        private const uint DefaultDllDirectories = 0x00000200 | 0x00000800;

        private static readonly object Gate = new object();
        private static bool _initialized;
        private static bool _dllDirectoriesRestricted;

        [DllImport("kernel32", EntryPoint = "LoadLibraryW", SetLastError = true, CharSet = CharSet.Unicode)]
        private static extern IntPtr LoadLibraryW(string fileName);

        [DllImport("kernel32", EntryPoint = "GetModuleHandleW", CharSet = CharSet.Unicode)]
        private static extern IntPtr GetModuleHandleW(string moduleName);

        [DllImport("kernel32", EntryPoint = "GetProcAddress", CharSet = CharSet.Ansi)]
        private static extern IntPtr GetProcAddress(IntPtr module, string procName);

        [UnmanagedFunctionPointer(CallingConvention.Winapi, SetLastError = true)]
        private delegate bool SetDefaultDllDirectoriesDelegate(uint flags);

        // Test seams
        internal static bool EnforceNativeLoad = Environment.OSVersion.Platform == PlatformID.Win32NT;
        internal static string NativeDirectoryOverride;
        internal static Func<string, IntPtr> LoadLibraryHook = LoadLibraryByPath;
        internal static Action ProbeHook = DefaultProbe;

        internal static void ResetForTests()
        {
            lock (Gate) { _initialized = false; }
        }

        // Restores every seam to the shipping behaviour and initialises the engine again
        internal static void RestoreDefaultsForTests()
        {
            lock (Gate)
            {
                EnforceNativeLoad = Environment.OSVersion.Platform == PlatformID.Win32NT;
                NativeDirectoryOverride = null;
                LoadLibraryHook = LoadLibraryByPath;
                ProbeHook = DefaultProbe;
                _initialized = false;
            }
            EnsureInitialized();
        }

        internal static void EnsureInitialized()
        {
            if (_initialized) return;
            lock (Gate)
            {
                if (_initialized) return;
                RestrictDllSearchPath();
                PreloadNativeLibrary();
                try
                {
                    SQLitePCL.Batteries_V2.Init();
                    ProbeHook();
                }
                catch (DllNotFoundException ex)
                {
                    throw Missing("DllNotFoundException", ex);
                }
                catch (BadImageFormatException ex)
                {
                    throw Missing("BadImageFormatException", ex);
                }
                catch (EntryPointNotFoundException ex)
                {
                    throw Missing("EntryPointNotFoundException", ex);
                }
                _initialized = true;
            }
        }

        private static void DefaultProbe()
        {
            // The first native call: a missing or wrong-architecture DLL fails here, before any database file is touched
            SQLitePCL.raw.sqlite3_libversion();
        }

        private static DatabaseEngineMissingException Missing(string kind, Exception inner)
        {
            int win32 = 0;
            try { win32 = Marshal.GetLastWin32Error(); } catch (Exception) { }
            Logger.Error("تعذر تحميل محرك قاعدة البيانات (" + kind + ", Win32=" + win32 + "): " + inner.Message, inner);
            return new DatabaseEngineMissingException(kind + " (Win32 " + win32 + ")", win32, inner);
        }

        private static IntPtr LoadLibraryByPath(string path)
        {
            return LoadLibraryW(path);
        }

        // Applications on Windows 7 need KB2533623 for this API: when it is absent the normal (full path) load below still applies.
        private static void RestrictDllSearchPath()
        {
            if (_dllDirectoriesRestricted || Environment.OSVersion.Platform != PlatformID.Win32NT) return;
            _dllDirectoriesRestricted = true;
            try
            {
                IntPtr kernel = GetModuleHandleW("kernel32.dll");
                if (kernel == IntPtr.Zero) return;
                IntPtr proc = GetProcAddress(kernel, "SetDefaultDllDirectories");
                if (proc == IntPtr.Zero) return;
                SetDefaultDllDirectoriesDelegate setDefault = (SetDefaultDllDirectoriesDelegate)Marshal.GetDelegateForFunctionPointer(proc, typeof(SetDefaultDllDirectoriesDelegate));
                if (!setDefault(DefaultDllDirectories))
                {
                    Logger.Warn("SetDefaultDllDirectories فشلت (Win32 " + Marshal.GetLastWin32Error() + ")");
                }
            }
            catch (Exception ex)
            {
                Logger.Warn("تعذر تقييد مسارات تحميل الملفات التنفيذية: " + ex.Message);
            }
        }

        // The provider uses a bare DllImport("sqlite3mc"); loading it by full path from the application folder first makes the
        // lookup independent of the host process directory and of any other folder on the search path.
        private static void PreloadNativeLibrary()
        {
            if (!EnforceNativeLoad) return;
            string directory = NativeDirectoryOverride;
            if (string.IsNullOrEmpty(directory))
            {
                string location = typeof(SQLiteNative).Assembly.Location;
                directory = string.IsNullOrEmpty(location) ? AppDomain.CurrentDomain.BaseDirectory : Path.GetDirectoryName(location);
            }
            string candidate = Path.Combine(directory, NativeLibraryFile);
            if (!File.Exists(candidate))
            {
                Logger.Error("ملف محرك قاعدة البيانات غير موجود: " + candidate, null);
                throw new DatabaseEngineMissingException("غير موجود: " + candidate, 2, null);
            }
            IntPtr handle = LoadLibraryHook(candidate);
            if (handle == IntPtr.Zero)
            {
                int win32 = Marshal.GetLastWin32Error();
                Logger.Error("فشل LoadLibraryW لمحرك قاعدة البيانات " + candidate + " (Win32 " + win32 + ")", null);
                throw new DatabaseEngineMissingException("LoadLibraryW فشلت (Win32 " + win32 + ")", win32, null);
            }
        }
    }
}
