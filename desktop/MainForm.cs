using System;
using System.IO;
using System.Drawing;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using Newtonsoft.Json;
using RafiqPOS.Bridge;
using RafiqPOS.Services;

namespace RafiqPOS
{
    public class MainForm : Form
    {
        private WebView2 _webView;
        private Label _lblStatus;

        public MainForm()
        {
            this.Text = "رفيق POS";
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
                Font = new Font("Segoe UI", 12, FontStyle.Regular),
                ForeColor = Color.White,
                BackColor = Color.FromArgb(15, 23, 42)
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
            try
            {
                // 1. Initialize SQLite Database
                DatabaseService.Initialize();

                // 2. Locate Frontend Dist folder
                string baseDir = AppDomain.CurrentDomain.BaseDirectory;
                string distFolder = Path.Combine(baseDir, "dist");
                
                // If running from bin/Debug or project root, search in frontend/dist
                if (!Directory.Exists(distFolder))
                {
                    string candidate = Path.GetFullPath(Path.Combine(baseDir, @"..\..\..\frontend\dist"));
                    if (Directory.Exists(candidate))
                    {
                        distFolder = candidate;
                    }
                    else
                    {
                        candidate = Path.GetFullPath(Path.Combine(baseDir, @"..\frontend\dist"));
                        if (Directory.Exists(candidate))
                        {
                            distFolder = candidate;
                        }
                    }
                }

                // 3. Runtime detection: Fixed Version 109 vs System Evergreen
                string browserExecutableFolder = null;
                string fixed109Folder = Path.Combine(baseDir, "runtimes", "fixed109");
                if (!Directory.Exists(fixed109Folder))
                {
                    string altFixed = Path.Combine(baseDir, "fixed109");
                    if (Directory.Exists(altFixed)) fixed109Folder = altFixed;
                }

                bool isLegacyWindows = Environment.OSVersion.Version.Major == 6; // Windows 7 (6.1), Windows 8 (6.2), Windows 8.1 (6.3)
                bool hasFixed = Directory.Exists(fixed109Folder);

                if (isLegacyWindows && hasFixed)
                {
                    // For Windows 7/8, always use bundled Fixed Version 109 to avoid any EdgeUpdate crashes
                    browserExecutableFolder = fixed109Folder;
                }
                else
                {
                    // For Windows 10/11 or if fixed109 isn't found, try system Evergreen
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
                        if (hasFixed)
                        {
                            browserExecutableFolder = fixed109Folder;
                        }
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

                string userDataFolder = Path.Combine(baseDataFolder, "webview_profile");
                var env = await CoreWebView2Environment.CreateAsync(browserExecutableFolder, userDataFolder);

                await _webView.EnsureCoreWebView2Async(env);

                // Configure WebView settings for retail POS
                _webView.CoreWebView2.Settings.IsStatusBarEnabled = false;
                _webView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false; // Disable right-click in production
                
                // Map local files to virtual host name
                if (Directory.Exists(distFolder))
                {
                    _webView.CoreWebView2.SetVirtualHostNameToFolderMapping(
                        "app.rafiq.local",
                        distFolder,
                        CoreWebView2HostResourceAccessKind.Allow
                    );
                }

                // Attach IPC message receiver
                _webView.CoreWebView2.WebMessageReceived += CoreWebView2_WebMessageReceived;

                // Navigate to app
                _webView.CoreWebView2.Navigate("https://app.rafiq.local/index.html");

                _lblStatus.Visible = false;
                _webView.Visible = true;
            }
            catch (Exception ex)
            {
                string helpMsg = "خطأ في بدء تشغيل رفيق:\n" + ex.Message + "\n\n";
                if (Environment.OSVersion.Version.Major == 6)
                {
                    helpMsg += "نظام التشغيل لديك هو (Windows 7 / 8).\n" +
                               "يتطلب النظام مشغل WebView2 Runtime إصدار 109 المتوافق مع ويندوز 7.\n" +
                               "يرجى تشغيل أداة التثبيت وتحديد خيار تثبيت المشغل الأوفلاين.";
                }
                else
                {
                    helpMsg += "يرجى التأكد من تثبيت Microsoft Edge WebView2 Runtime على هذا الجهاز.";
                }
                _lblStatus.Text = helpMsg;
                _lblStatus.ForeColor = Color.Salmon;
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
