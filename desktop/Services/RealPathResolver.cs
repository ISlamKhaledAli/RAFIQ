using System;
using System.Runtime.InteropServices;
using System.Text;

namespace RafiqPOS.Services
{
    // Resolves a directory to its real location (following junctions / symbolic links) so path checks cannot be bypassed through a link.
    internal static class RealPathResolver
    {
        [DllImport("kernel32", EntryPoint = "CreateFileW", SetLastError = true, CharSet = CharSet.Unicode)]
        private static extern IntPtr CreateFileW(string fileName, uint access, uint share, IntPtr security, uint creation, uint flags, IntPtr template);

        [DllImport("kernel32", EntryPoint = "GetFinalPathNameByHandleW", SetLastError = true, CharSet = CharSet.Unicode)]
        private static extern uint GetFinalPathNameByHandleW(IntPtr handle, StringBuilder path, uint size, uint flags);

        [DllImport("kernel32", SetLastError = true)]
        private static extern bool CloseHandle(IntPtr handle);

        [DllImport("libc", EntryPoint = "realpath")]
        private static extern IntPtr realpath(string path, IntPtr resolved);

        [DllImport("libc", EntryPoint = "free")]
        private static extern void free(IntPtr pointer);

        // Returns the resolved absolute directory path, or null when it cannot be resolved (callers fail closed)
        internal static string ResolveDirectory(string path)
        {
            try
            {
                if (Environment.OSVersion.Platform == PlatformID.Win32NT)
                {
                    // FILE_FLAG_BACKUP_SEMANTICS opens a directory; FILE_SHARE_READ|WRITE|DELETE
                    IntPtr handle = CreateFileW(path, 0, 7, IntPtr.Zero, 3, 0x02000000, IntPtr.Zero);
                    if (handle == new IntPtr(-1)) return null;
                    try
                    {
                        StringBuilder sb = new StringBuilder(1024);
                        uint length = GetFinalPathNameByHandleW(handle, sb, (uint)sb.Capacity, 0);
                        if (length == 0 || length >= sb.Capacity) return null;
                        string resolved = sb.ToString();
                        if (resolved.StartsWith("\\\\?\\UNC\\", StringComparison.Ordinal)) return "\\\\" + resolved.Substring(8);
                        if (resolved.StartsWith("\\\\?\\", StringComparison.Ordinal)) return resolved.Substring(4);
                        return resolved;
                    }
                    finally
                    {
                        CloseHandle(handle);
                    }
                }

                IntPtr real = realpath(path, IntPtr.Zero);
                if (real == IntPtr.Zero) return null;
                try
                {
                    return Marshal.PtrToStringAnsi(real);
                }
                finally
                {
                    free(real);
                }
            }
            catch (Exception)
            {
                return null;
            }
        }
    }
}
