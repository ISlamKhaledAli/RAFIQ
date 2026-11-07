using System;
using System.Diagnostics;
using System.Runtime.InteropServices;

namespace RafiqPOS.Common
{
    /// <summary>
    /// Uses Windows Job Object (JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE) to guarantee that
    /// all child processes (especially msedgewebview2.exe) are automatically and atomically
    /// terminated by the Windows kernel if the main RafiqPOS process closes or is killed.
    /// </summary>
    public static class ChildProcessTracker
    {
        private static IntPtr _jobHandle = IntPtr.Zero;

        [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern IntPtr CreateJobObject(IntPtr lpJobAttributes, string lpName);

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool SetInformationJobObject(IntPtr hJob, int JobObjectInfoClass, IntPtr lpJobObjectInfo, uint cbJobObjectInfoLength);

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool AssignProcessToJobObject(IntPtr hJob, IntPtr hProcess);

        private const int JobObjectExtendedLimitInformation = 9;
        private const uint JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x2000;

        [StructLayout(LayoutKind.Sequential)]
        private struct IO_COUNTERS
        {
            public ulong ReadOperationCount;
            public ulong WriteOperationCount;
            public ulong OtherOperationCount;
            public ulong ReadTransferCount;
            public ulong WriteTransferCount;
            public ulong OtherTransferCount;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct JOBOBJECT_BASIC_LIMIT_INFORMATION
        {
            public long PerProcessUserTimeLimit;
            public long PerJobUserTimeLimit;
            public uint LimitFlags;
            public UIntPtr MinimumWorkingSetSize;
            public UIntPtr MaximumWorkingSetSize;
            public uint ActiveProcessLimit;
            public UIntPtr Affinity;
            public uint PriorityClass;
            public uint SchedulingClass;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION
        {
            public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation;
            public IO_COUNTERS IoInfo;
            public UIntPtr ProcessMemoryLimit;
            public UIntPtr JobMemoryLimit;
            public UIntPtr PeakProcessMemoryLimit;
            public UIntPtr PeakJobMemoryLimit;
        }

        public static void Initialize()
        {
            if (_jobHandle != IntPtr.Zero) return;

            try
            {
                string jobName = "RafiqPOS_Job_" + Process.GetCurrentProcess().Id;
                _jobHandle = CreateJobObject(IntPtr.Zero, jobName);
                if (_jobHandle == IntPtr.Zero)
                {
                    Logger.Warn("تعذر إنشاء كائن مهمة ويندوز لحماية العمليات التابعة: " + Marshal.GetLastWin32Error());
                    return;
                }

                JOBOBJECT_EXTENDED_LIMIT_INFORMATION info = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
                info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;

                int length = Marshal.SizeOf(typeof(JOBOBJECT_EXTENDED_LIMIT_INFORMATION));
                IntPtr extendedInfoPtr = Marshal.AllocHGlobal(length);
                try
                {
                    Marshal.StructureToPtr(info, extendedInfoPtr, false);
                    if (!SetInformationJobObject(_jobHandle, JobObjectExtendedLimitInformation, extendedInfoPtr, (uint)length))
                    {
                        Logger.Warn("تعذر ضبط خصائص كائن المهمة التابعة: " + Marshal.GetLastWin32Error());
                    }
                }
                finally
                {
                    Marshal.FreeHGlobal(extendedInfoPtr);
                }

                IntPtr currentProcessHandle = Process.GetCurrentProcess().Handle;
                if (!AssignProcessToJobObject(_jobHandle, currentProcessHandle))
                {
                    Logger.Warn("تعذر إدراج العملية الحالية في كائن المهمة التابعة: " + Marshal.GetLastWin32Error());
                }
                else
                {
                    Logger.Info("تم تفعيل حارس العمليات التابعة (Job Object KillOnJobClose) بنجاح.");
                }
            }
            catch (Exception ex)
            {
                Logger.Warn("خطأ أثناء تفعيل حارس العمليات التابعة: " + ex.Message);
            }
        }
    }
}

