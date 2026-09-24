using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;
using RafiqPOS.Common;

namespace RafiqPOS
{
    static class Program
    {
        private static Mutex _singleInstanceMutex;

        [STAThread]
        static void Main(string[] args)
        {
            bool isDemoError = false;
#if DEBUG
            if (args != null)
            {
                for (int i = 0; i < args.Length; i++)
                {
                    if (args[i] == "--demo-error" || args[i] == "--test-error")
                    {
                        isDemoError = true;
                        break;
                    }
                }
            }
#endif

            const string mutexName = "RafiqPOS_SingleInstance_AppMutex";
            bool createdNew;

            _singleInstanceMutex = new Mutex(true, mutexName, out createdNew);

            // Prevent running multiple instances on same data file (Feature #126 / Task 126-1)
            // If already open, activate and bring the running instance to the front without showing confusing dialogs
            if (!createdNew && !isDemoError)
            {
                BringExistingInstanceToFront();
                return;
            }

            // Global Unhandled Exception Handling (Feature #111 / Task 111-2)
            Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
            Application.ThreadException += Application_ThreadException;
            AppDomain.CurrentDomain.UnhandledException += CurrentDomain_UnhandledException;

            Logger.Info("تم بدء تشغيل نظام رفيق POS بنجاح.");

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            try
            {
                Application.Run(new MainForm(isDemoError));
            }
            catch (Exception ex)
            {
                Logger.Error("استثناء غير متوقع أثناء تشغيل واجهة التطبيق الرئيسية", ex);
                ShowFriendlyErrorDialog(ex, true);
            }
            finally
            {
                Logger.Info("تم إغلاق نظام رفيق POS.");
                if (_singleInstanceMutex != null)
                {
                    try
                    {
                        _singleInstanceMutex.ReleaseMutex();
                    }
                    catch
                    {
                    }
                    _singleInstanceMutex.Dispose();
                    _singleInstanceMutex = null;
                }
            }
        }

        private static void BringExistingInstanceToFront()
        {
            try
            {
                Process current = Process.GetCurrentProcess();
                Process[] processes = Process.GetProcessesByName(current.ProcessName);
                for (int i = 0; i < processes.Length; i++)
                {
                    Process p = processes[i];
                    if (p.Id != current.Id && p.MainWindowHandle != IntPtr.Zero)
                    {
                        WindowHelper.ForceForeground(p.MainWindowHandle);
                        return;
                    }
                }
            }
            catch
            {
                // Fallback to notification only if window activation cannot be completed
                MessageBox.Show(
                    "برنامج رفيق POS قيد التشغيل بالفعل على هذا الجهاز في نافذة أخرى.",
                    "رفيق POS",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information
                );
            }
        }

        private static void Application_ThreadException(object sender, ThreadExceptionEventArgs e)
        {
            Logger.Error("استثناء غير معالج في خيط الواجهة (UI Thread)", e.Exception);
            ShowFriendlyErrorDialog(e.Exception, false);
        }

        private static void CurrentDomain_UnhandledException(object sender, UnhandledExceptionEventArgs e)
        {
            Exception ex = e.ExceptionObject as Exception;
            Logger.Error("استثناء حرج غير معالج في نطاق التطبيق (AppDomain)", ex);
            ShowFriendlyErrorDialog(ex, e.IsTerminating);
        }

        private static void ShowFriendlyErrorDialog(Exception ex, bool isFatal)
        {
            string errorDetails = ex != null ? ex.Message : "خطأ غير محدد";
            string msg = string.Format(
                "حدث تنبيه غير متوقع أثناء المعالجة.\n\n" +
                "التفاصيل: {0}\n\n" +
                "• تم حفظ السجلات بأمان لحماية بيانات المحل من التلف.\n" +
                "• يمكنك استخراج حزمة معلومات الدعم من شاشة الإعدادات لمساعدتنا في حل المشكلة.\n\n" +
                "{1}",
                errorDetails,
                isFatal ? "سيتم إغلاق البرنامج للحفاظ على سلامة ملف البيانات." : "يمكنك متابعة العمل بشكل طبيعي."
            );

            MessageBox.Show(
                msg,
                "تنبيه النظام — رفيق POS",
                MessageBoxButtons.OK,
                isFatal ? MessageBoxIcon.Error : MessageBoxIcon.Warning
            );
        }
    }
}
