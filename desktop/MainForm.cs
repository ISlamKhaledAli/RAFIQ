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
            this.Text = "رفيق — نظام نقاط البيع والسوبرماركت (POS)";
            this.Size = new Size(1280, 800);
            this.MinimumSize = new Size(1024, 768); // Support compact screens (Task 159)
            this.StartPosition = FormStartPosition.CenterScreen;
            this.Icon = SystemIcons.Application;

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

                // 3. Runtime detection: Fixed Version 109 for Windows 7/8, Evergreen for 10/11
                string browserExecutableFolder = null;
                string fixed109Folder = Path.Combine(baseDir, "runtimes", "fixed109");
                bool isWin7Or8 = Environment.OSVersion.Version.Major == 6;

                if (isWin7Or8 && Directory.Exists(fixed109Folder))
                {
                    browserExecutableFolder = fixed109Folder;
                }

                string userDataFolder = Path.Combine(baseDir, "data", "webview_profile");
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
                _lblStatus.Text = string.Format("خطأ في بدء تشغيل رفيق:\n{0}\n\nيرجى التأكد من تثبيت WebView2 Runtime.", ex.Message);
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
