using System;
using System.Threading;
using System.Windows.Forms;

namespace RafiqPOS
{
    static class Program
    {
        private static Mutex _singleInstanceMutex;

        [STAThread]
        static void Main()
        {
            const string mutexName = "RafiqPOS_SingleInstance_AppMutex";
            bool createdNew;

            _singleInstanceMutex = new Mutex(true, mutexName, out createdNew);

            // Prevent running multiple instances on same data file (Feature #126 / Task 126-1)
            if (!createdNew)
            {
                MessageBox.Show(
                    "برنامج رفيق مفتوح بالفعل في نافذة أخرى.\nلا يمكن تشغيل البرنامج مرتين على نفس البيانات لتفادي تلفها.",
                    "تنبيه — رفيق نقاط البيع",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning
                );
                return;
            }

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new MainForm());

            GC.KeepAlive(_singleInstanceMutex);
        }
    }
}
