using System;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace RafiqPOS.Common
{
    public static class WindowHelper
    {
        [DllImport("user32.dll")]
        private static extern IntPtr GetForegroundWindow();

        [DllImport("user32.dll")]
        private static extern uint GetWindowThreadProcessId(IntPtr hWnd, IntPtr processId);

        [DllImport("kernel32.dll")]
        private static extern uint GetCurrentThreadId();

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool SetForegroundWindow(IntPtr hWnd);

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool BringWindowToTop(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

        [DllImport("user32.dll")]
        private static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo);

        private const byte VK_MENU = 0x12; // Virtual key code for ALT
        private const uint KEYEVENTF_KEYUP = 0x0002;
        private const int SW_RESTORE = 9;

        /// <summary>
        /// Forces any window handle to bypass Windows foreground lock and take active foreground focus.
        /// </summary>
        public static void ForceForeground(IntPtr hWnd)
        {
            if (hWnd == IntPtr.Zero)
            {
                return;
            }

            try
            {
                IntPtr foreWnd = GetForegroundWindow();

                // Unlock foreground lock using simulated Alt key event
                keybd_event(VK_MENU, 0, 0, 0);
                keybd_event(VK_MENU, 0, KEYEVENTF_KEYUP, 0);

                if (foreWnd != hWnd && foreWnd != IntPtr.Zero)
                {
                    uint foreThread = GetWindowThreadProcessId(foreWnd, IntPtr.Zero);
                    uint appThread = GetCurrentThreadId();

                    if (foreThread != 0 && foreThread != appThread)
                    {
                        AttachThreadInput(foreThread, appThread, true);
                        ShowWindow(hWnd, SW_RESTORE);
                        BringWindowToTop(hWnd);
                        SetForegroundWindow(hWnd);
                        AttachThreadInput(foreThread, appThread, false);
                    }
                    else
                    {
                        ShowWindow(hWnd, SW_RESTORE);
                        BringWindowToTop(hWnd);
                        SetForegroundWindow(hWnd);
                    }
                }
                else
                {
                    ShowWindow(hWnd, SW_RESTORE);
                    BringWindowToTop(hWnd);
                    SetForegroundWindow(hWnd);
                }
            }
            catch (Exception ex)
            {
                Logger.Warn("تعذر إجبار النافذة على الظهور في المقدمة: " + ex.Message);
            }
        }

        /// <summary>
        /// Forces a Form to restore, bring to front, activate, and momentarily set TopMost to secure Z-order.
        /// </summary>
        public static void ActivateAndBringToFront(Form form)
        {
            if (form == null || form.IsDisposed)
            {
                return;
            }

            try
            {
                if (form.WindowState == FormWindowState.Minimized)
                {
                    form.WindowState = FormWindowState.Normal;
                }

                ForceForeground(form.Handle);

                form.Activate();
                form.BringToFront();

                // Momentarily toggle TopMost to guarantee Z-order placement on top of background Explorer
                form.TopMost = true;
                Application.DoEvents();
                form.TopMost = false;
            }
            catch (Exception ex)
            {
                Logger.Warn("تعذر تنشيط نافذة النموذج: " + ex.Message);
            }
        }
    }
}
