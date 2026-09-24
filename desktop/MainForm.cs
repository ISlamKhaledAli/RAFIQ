using System;
using System.IO;
using System.Drawing;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using Newtonsoft.Json;
using RafiqPOS.Bridge;
using RafiqPOS.Common;
using RafiqPOS.Services;

namespace RafiqPOS
{
    public class MainForm : Form
    {
        private WebView2 _webView;
        private Label _lblStatus;

        public MainForm()
        {
            this.Text = "رفيق POS — نظام نقاط البيع والسوبرماركت";
            this.Size = new Size(1280, 800);
            this.MinimumSize = new Size(1024, 768); // Support compact screens (Task 159)
            this.StartPosition = FormStartPosition.CenterScreen;
            string icoPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "app.ico");
            if (File.Exists(icoPath))
            {
                try { this.Icon = new Icon(icoPath); } catch { this.Icon = SystemIcons.Application; }
            }
            else
            {
                this.Icon = SystemIcons.Application;
            }

            _lblStatus = new Label
            {
                Text = "جاري تهيئة مشغّل العرض والاتصال بقاعدة البيانات...",
                Dock = DockStyle.Fill,
                TextAlign = ContentAlignment.MiddleCenter,
                Font = new Font("Segoe UI", 11, FontStyle.Regular),
                ForeColor = Color.White,
                BackColor = Color.FromArgb(15, 23, 42),
                Padding = new Padding(30)
            };
            this.Controls.Add(_lblStatus);

            _webView = new WebView2
            {
                Dock = DockStyle.Fill,
                Visible = false
            };
            this.Controls.Add(_webView);

            this.Load += MainForm_Load;
        }

        private async void MainForm_Load(object sender, EventArgs e)
        {
            // 1. Initialize SQLite Database (Separated Error Handling)
            try
            {
                DatabaseService.Initialize();
            }
            catch (Exception dbEx)
            {
                ShowFatalError(
                    "فشل في تهيئة قاعدة البيانات المحلية (SQLite)",
                    dbEx.Message + "\n\nمسار ملف القاعدة:\n" + DatabaseService.DbPath,
                    "يرجى التأكد من صلاحيات مجلد البيانات وعدم استخدام الملف بواسطة برنامج آخر."
                );
                return;
            }

            // 2. Locate Frontend Dist folder (Separated Check)
            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            string distFolder = null;

            // During development, always prioritize freshly built frontend/dist
            string devFrontendDist = Path.GetFullPath(Path.Combine(baseDir, @"..\..\..\frontend\dist"));
            if (!Directory.Exists(devFrontendDist))
            {
                devFrontendDist = Path.GetFullPath(Path.Combine(baseDir, @"..\frontend\dist"));
            }

            if (Directory.Exists(devFrontendDist) && File.Exists(Path.Combine(devFrontendDist, "index.html")))
            {
                distFolder = devFrontendDist;
            }
            else
            {
                // In Production, load from local dist folder next to exe
                distFolder = Path.Combine(baseDir, "dist");
            }

            if (!Directory.Exists(distFolder) || !File.Exists(Path.Combine(distFolder, "index.html")))
            {
                ShowFatalError(
                    "ملفات واجهة النظام غير موجودة (Dist Missing)",
                    "لم يتم العثور على ملفات الواجهة (index.html) في المسار:\n" + distFolder,
                    "يرجى تشغيل أمر بناء الواجهة 'npm run build' في مجلد frontend أو إعادة تثبيت البرنامج."
                );
                return;
            }

            // 3. Accurate OS & Runtime Detection using OsDetector
            string browserExecutableFolder = null;
            string fixed109Folder = Path.Combine(baseDir, "runtimes", "fixed109");
            if (!Directory.Exists(fixed109Folder))
            {
                string altFixed = Path.Combine(baseDir, "fixed109");
                if (Directory.Exists(altFixed)) fixed109Folder = altFixed;
            }

            bool isLegacyWindows = OsDetector.IsLegacyWindows();
            bool hasFixed = Directory.Exists(fixed109Folder);

            if (isLegacyWindows)
            {
                // Windows 7 / 8 / 8.1 require bundled Fixed Version 109
                if (hasFixed)
                {
                    browserExecutableFolder = fixed109Folder;
                }
            }
            else
            {
                // Windows 10 & 11: try system Evergreen, fallback to fixed if Evergreen is missing
                try
                {
                    string systemVer = CoreWebView2Environment.GetAvailableBrowserVersionString();
                    if (string.IsNullOrEmpty(systemVer) && hasFixed)
                    {
                        browserExecutableFolder = fixed109Folder;
                    }
                }
                catch
                {
                    if (hasFixed) browserExecutableFolder = fixed109Folder;
                }
            }

            string baseDataFolder;
            #if DEBUG
            baseDataFolder = Path.Combine(baseDir, "data");
            #else
            baseDataFolder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "RafiqPOS", "data");
            #endif

            if (!Directory.Exists(baseDataFolder))
            {
                Directory.CreateDirectory(baseDataFolder);
            }

            // 4. Initialize WebView2 with dedicated error handling
            try
            {
                string userDataFolder = Path.Combine(baseDataFolder, "webview_profile");
                var env = await CoreWebView2Environment.CreateAsync(browserExecutableFolder, userDataFolder);

                await _webView.EnsureCoreWebView2Async(env);

                // Configure WebView settings for retail POS
                _webView.CoreWebView2.Settings.IsStatusBarEnabled = false;
                _webView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;

                // Map local files to virtual host
                _webView.CoreWebView2.SetVirtualHostNameToFolderMapping(
                    "app.rafiq.local",
                    distFolder,
                    CoreWebView2HostResourceAccessKind.Allow
                );

                // Attach IPC message receiver
                _webView.CoreWebView2.WebMessageReceived += CoreWebView2_WebMessageReceived;

                // Navigate to app
                _webView.CoreWebView2.Navigate("https://app.rafiq.local/index.html");

                _lblStatus.Visible = false;
                _webView.Visible = true;
            }
            catch (Exception wvEx)
            {
                string osName = OsDetector.GetOsFriendlyName();
                string advice = isLegacyWindows
                    ? string.Format("نظام التشغيل لديك هو: {0}.\nيتطلب النظام مشغل WebView2 Runtime إصدار 109 المخصص لويندوز 7.\nيرجى تشغيل أداة التثبيت واختيار تثبيت المشغل الأوفلاين.", osName)
                    : string.Format("نظام التشغيل لديك هو: {0}.\nيرجى التأكد من تثبيت مشغل Microsoft Edge WebView2 Runtime على هذا الجهاز.", osName);

                ShowFatalError(
                    "تعذر تشغيل محرك العرض (WebView2 Error)",
                    wvEx.Message,
                    advice
                );
            }
        }

        private void ShowFatalError(string title, string details, string advice)
        {
            string fullMessage = string.Format(
                "خطأ في بدء تشغيل رفيق: {0}\n\n" +
                "التفاصيل الفنية:\n{1}\n\n" +
                "📌 خطوات المعالجة:\n{2}",
                title, details, advice
            );

            _lblStatus.Text = fullMessage;
            _lblStatus.ForeColor = Color.Salmon;
            _lblStatus.Visible = true;
            if (_webView != null)
            {
                _webView.Visible = false;
            }
        }

        private void CoreWebView2_WebMessageReceived(object sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            try
            {
                string rawJson = e.WebMessageAsJson;
                var request = JsonConvert.DeserializeObject<BridgeRequest>(rawJson);
                var response = IpcDispatcher.Dispatch(request);
                string responseJson = JsonConvert.SerializeObject(response);

                _webView.CoreWebView2.PostWebMessageAsJson(responseJson);
            }
            catch (Exception ex)
            {
                var errResponse = BridgeResponse.Fail("", "DISPATCHER_ERROR", ex.Message);
                _webView.CoreWebView2.PostWebMessageAsJson(JsonConvert.SerializeObject(errResponse));
            }
        }
    }
}
