using System;
using System.IO;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Diagnostics;
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

        // Branded Diagnostics & Error Screen UI (Following Rafiq POS Identity)
        private Panel _errorPanel;
        private Panel _errorCard;
        private Label _lblBadge;
        private Label _lblAlertTag;
        private Label _lblErrorTitle;
        private Label _lblErrorSubtitle;
        private TextBox _txtErrorDetails;
        private Panel _pnlAdvice;
        private Label _lblAdviceHeader;
        private Label _lblAdviceBody;
        private Button _btnRetry;
        private Button _btnOpenFolder;
        private Button _btnCopy;
        private Button _btnClose;
        private string _lastErrorFullText;
        private bool _isDemoError;
        private bool _isKioskFullscreen;

        public static MainForm Instance { get; private set; }

        public MainForm(bool isDemoError = false)
        {
            Instance = this;
            _isDemoError = isDemoError;
            this.Text = "رفيق POS — نظام نقاط البيع وإدارة المتاجر";
            this.Size = new Size(1280, 800);
            this.MinimumSize = new Size(1024, 768); // Support compact screens (Task 159)
            this.StartPosition = FormStartPosition.CenterScreen;
            this.BackColor = Color.FromArgb(11, 20, 29);

            // Default to borderless desktop mode matching Windows WorkingArea (respecting Windows Taskbar and preventing bottom bar overflow)
            this.WindowState = FormWindowState.Normal;
            this.FormBorderStyle = FormBorderStyle.None;
            this.Bounds = Screen.PrimaryScreen.WorkingArea;
            this.KeyPreview = true;
            this.KeyDown += delegate(object s, KeyEventArgs e)
            {
                if (e.KeyCode == Keys.F11)
                {
                    e.Handled = true;
                    ToggleFullscreen();
                }
                else if (e.KeyCode == Keys.F5)
                {
                    e.Handled = true;
                    if (_webView != null && _webView.CoreWebView2 != null)
                    {
                        _webView.CoreWebView2.Reload();
                    }
                }
            };

            string icoPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "app.ico");
            if (File.Exists(icoPath))
            {
                try { this.Icon = new Icon(icoPath); } catch { this.Icon = SystemIcons.Application; }
            }
            else
            {
                this.Icon = SystemIcons.Application;
            }

            // 1. Initial loading status label
            _lblStatus = new Label
            {
                Text = "جاري تهيئة رفيق POS والاتصال بقاعدة البيانات المحلية...",
                Dock = DockStyle.Fill,
                TextAlign = ContentAlignment.MiddleCenter,
                Font = new Font("Segoe UI", 11, FontStyle.Regular),
                ForeColor = Color.FromArgb(203, 213, 225),
                BackColor = Color.FromArgb(11, 20, 29),
                Padding = new Padding(30)
            };
            this.Controls.Add(_lblStatus);

            // 2. Setup WebView2 container
            _webView = new WebView2
            {
                Dock = DockStyle.Fill,
                Visible = false
            };
            this.Controls.Add(_webView);

            // 3. Setup Branded Error Screen Panel
            InitializeBrandedErrorScreen();

            this.Load += MainForm_Load;
            this.Shown += MainForm_Shown;
            this.FormClosing += MainForm_FormClosing;
        }

        private void InitializeBrandedErrorScreen()
        {
            _errorPanel = new Panel
            {
                Dock = DockStyle.Fill,
                BackColor = Color.FromArgb(11, 20, 29),
                RightToLeft = RightToLeft.Yes,
                Visible = false
            };
            _errorPanel.Resize += delegate(object s, EventArgs e)
            {
                CenterErrorCard();
            };

            _errorCard = new Panel
            {
                BackColor = Color.FromArgb(19, 31, 46),
                Padding = new Padding(24),
                Size = new Size(760, 560)
            };
            _errorCard.Paint += ErrorCard_Paint;

            // Brand Badge
            _lblBadge = new Label
            {
                Text = "رفيق POS — نظام نقاط البيع وإدارة المتاجر",
                Font = new Font("Segoe UI", 9.5f, FontStyle.Bold),
                ForeColor = Color.FromArgb(52, 211, 153), // Emerald 400
                Location = new Point(24, 18),
                Size = new Size(712, 22),
                TextAlign = ContentAlignment.MiddleRight
            };
            _errorCard.Controls.Add(_lblBadge);

            // Alert Tag
            _lblAlertTag = new Label
            {
                Text = "تنبيه في بدء التشغيل — تم إيقاف التحميل لحماية البيانات",
                Font = new Font("Segoe UI", 9.5f, FontStyle.Bold),
                ForeColor = Color.FromArgb(248, 113, 113), // Rose 400
                Location = new Point(24, 44),
                Size = new Size(712, 22),
                TextAlign = ContentAlignment.MiddleRight
            };
            _errorCard.Controls.Add(_lblAlertTag);

            // Error Title
            _lblErrorTitle = new Label
            {
                Text = "فشل في تهيئة قاعدة البيانات المحلية (SQLite)",
                Font = new Font("Segoe UI", 13.5f, FontStyle.Bold),
                ForeColor = Color.White,
                Location = new Point(24, 70),
                Size = new Size(712, 34),
                TextAlign = ContentAlignment.MiddleRight
            };
            _errorCard.Controls.Add(_lblErrorTitle);

            // Subtitle
            _lblErrorSubtitle = new Label
            {
                Text = "تعذر على النظام إكمال الاتصال بقاعدة البيانات أو ملفات التشغيل. التفاصيل الفنية والخطوات الموصى بها أدناه:",
                Font = new Font("Segoe UI", 9.5f, FontStyle.Regular),
                ForeColor = Color.FromArgb(148, 163, 184), // Slate 400
                Location = new Point(24, 108),
                Size = new Size(712, 24),
                TextAlign = ContentAlignment.MiddleRight
            };
            _errorCard.Controls.Add(_lblErrorSubtitle);

            // Details box
            _txtErrorDetails = new TextBox
            {
                Location = new Point(24, 138),
                Size = new Size(712, 170),
                Multiline = true,
                ReadOnly = true,
                ScrollBars = ScrollBars.Vertical,
                BackColor = Color.FromArgb(12, 19, 30),
                ForeColor = Color.FromArgb(254, 205, 211), // Soft rose
                Font = new Font("Consolas", 9f, FontStyle.Regular),
                BorderStyle = BorderStyle.FixedSingle,
                RightToLeft = RightToLeft.No // Keep stack and SQL English readable
            };
            _errorCard.Controls.Add(_txtErrorDetails);

            // Guided advice panel
            _pnlAdvice = new Panel
            {
                Location = new Point(24, 318),
                Size = new Size(712, 115),
                BackColor = Color.FromArgb(15, 23, 42),
                Padding = new Padding(12)
            };
            _pnlAdvice.Paint += delegate(object s, PaintEventArgs e)
            {
                using (Pen p = new Pen(Color.FromArgb(41, 62, 88), 1))
                {
                    e.Graphics.DrawRectangle(p, 0, 0, _pnlAdvice.Width - 1, _pnlAdvice.Height - 1);
                }
            };

            _lblAdviceHeader = new Label
            {
                Text = "خطوات المعالجة المقترحة والتصحيح:",
                Font = new Font("Segoe UI", 9.5f, FontStyle.Bold),
                ForeColor = Color.FromArgb(52, 211, 153),
                Location = new Point(12, 10),
                Size = new Size(688, 22),
                TextAlign = ContentAlignment.MiddleRight
            };
            _pnlAdvice.Controls.Add(_lblAdviceHeader);

            _lblAdviceBody = new Label
            {
                Text = "1. انقر على «إعادة المحاولة» لتشغيل فحص التصحيح الذاتي التلقائي للأعمدة والجداول.\n" +
                       "2. تأكد من إغلاق أي برنامج آخر قد يفتح ملف قاعدة البيانات (مثل SQLite Studio أو Excel).\n" +
                       "3. انقر على «فتح مجلد البيانات» للتحقق من الصلاحيات ووجود النسخ الاحتياطية الأخيرة.",
                Font = new Font("Segoe UI", 9f, FontStyle.Regular),
                ForeColor = Color.FromArgb(226, 232, 240),
                Location = new Point(12, 34),
                Size = new Size(688, 70),
                TextAlign = ContentAlignment.TopRight
            };
            _pnlAdvice.Controls.Add(_lblAdviceBody);
            _errorCard.Controls.Add(_pnlAdvice);

            // Action Buttons Panel
            Panel btnPanel = new Panel
            {
                Location = new Point(24, 448),
                Size = new Size(712, 42)
            };

            // 1. Retry Button (Primary Green)
            _btnRetry = new Button
            {
                Text = "إعادة المحاولة والتصحيح التلقائي",
                Font = new Font("Segoe UI", 9.5f, FontStyle.Bold),
                BackColor = Color.FromArgb(0, 109, 65), // Forest Green
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat,
                Cursor = Cursors.Hand,
                Size = new Size(220, 38),
                Location = new Point(492, 0)
            };
            _btnRetry.FlatAppearance.BorderSize = 0;
            _btnRetry.Click += delegate(object s, EventArgs e)
            {
                _isDemoError = false;
                _errorPanel.Visible = false;
                _lblStatus.Text = "جاري إعادة فحص قاعدة البيانات وتصحيح الجداول...";
                _lblStatus.Visible = true;
                InitializeApplication();
            };
            btnPanel.Controls.Add(_btnRetry);

            // 2. Open Data Folder Button
            _btnOpenFolder = new Button
            {
                Text = "فتح مجلد البيانات",
                Font = new Font("Segoe UI", 9f, FontStyle.Bold),
                BackColor = Color.FromArgb(30, 41, 59),
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat,
                Cursor = Cursors.Hand,
                Size = new Size(150, 38),
                Location = new Point(334, 0)
            };
            _btnOpenFolder.FlatAppearance.BorderColor = Color.FromArgb(51, 65, 85);
            _btnOpenFolder.Click += delegate(object s, EventArgs e)
            {
                try
                {
                    string dir = Path.GetDirectoryName(DatabaseService.DbPath);
                    if (Directory.Exists(dir))
                    {
                        Process.Start("explorer.exe", dir);
                    }
                }
                catch (Exception ex)
                {
                    MessageBox.Show(ex.Message, "تنبيه", MessageBoxButtons.OK, MessageBoxIcon.Information);
                }
            };
            btnPanel.Controls.Add(_btnOpenFolder);

            // 3. Copy Error Button
            _btnCopy = new Button
            {
                Text = "نسخ تفاصيل الخطأ",
                Font = new Font("Segoe UI", 9f, FontStyle.Bold),
                BackColor = Color.FromArgb(30, 41, 59),
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat,
                Cursor = Cursors.Hand,
                Size = new Size(150, 38),
                Location = new Point(176, 0)
            };
            _btnCopy.FlatAppearance.BorderColor = Color.FromArgb(51, 65, 85);
            _btnCopy.Click += delegate(object s, EventArgs e)
            {
                try
                {
                    if (!string.IsNullOrEmpty(_lastErrorFullText))
                    {
                        Clipboard.SetText(_lastErrorFullText);
                        _btnCopy.Text = "تم النسخ للحافظة";
                        Timer t = new Timer { Interval = 2000 };
                        t.Tick += delegate(object ts, EventArgs te)
                        {
                            _btnCopy.Text = "نسخ تفاصيل الخطأ";
                            t.Stop();
                            t.Dispose();
                        };
                        t.Start();
                    }
                }
                catch { }
            };
            btnPanel.Controls.Add(_btnCopy);

            // 4. Close Button
            _btnClose = new Button
            {
                Text = "إغلاق البرنامج",
                Font = new Font("Segoe UI", 9f, FontStyle.Bold),
                BackColor = Color.FromArgb(24, 32, 47),
                ForeColor = Color.FromArgb(248, 113, 113),
                FlatStyle = FlatStyle.Flat,
                Cursor = Cursors.Hand,
                Size = new Size(120, 38),
                Location = new Point(48, 0)
            };
            _btnClose.FlatAppearance.BorderColor = Color.FromArgb(51, 65, 85);
            _btnClose.Click += delegate(object s, EventArgs e)
            {
                Application.Exit();
            };
            btnPanel.Controls.Add(_btnClose);

            _errorCard.Controls.Add(btnPanel);
            _errorPanel.Controls.Add(_errorCard);
            this.Controls.Add(_errorPanel);
        }

        private void CenterErrorCard()
        {
            if (_errorCard == null || _errorPanel == null) return;
            int cardW = Math.Min(760, Math.Max(600, _errorPanel.Width - 40));
            int cardH = Math.Min(540, Math.Max(480, _errorPanel.Height - 40));
            _errorCard.Size = new Size(cardW, cardH);
            _errorCard.Location = new Point(
                Math.Max(10, (_errorPanel.Width - cardW) / 2),
                Math.Max(10, (_errorPanel.Height - cardH) / 2)
            );
        }

        private void ErrorCard_Paint(object sender, PaintEventArgs e)
        {
            // Sleek card border
            using (Pen borderPen = new Pen(Color.FromArgb(41, 62, 88), 1))
            {
                e.Graphics.DrawRectangle(borderPen, 0, 0, _errorCard.Width - 1, _errorCard.Height - 1);
            }

            // Top accent banner (Forest Green to Emerald gradient)
            using (LinearGradientBrush brush = new LinearGradientBrush(
                new Point(0, 0),
                new Point(_errorCard.Width, 0),
                Color.FromArgb(0, 109, 65),
                Color.FromArgb(16, 185, 129)))
            {
                e.Graphics.FillRectangle(brush, 0, 0, _errorCard.Width, 5);
            }
        }

        private void MainForm_Load(object sender, EventArgs e)
        {
            InitializeApplication();
        }

        private void MainForm_Shown(object sender, EventArgs e)
        {
            WindowHelper.ActivateAndBringToFront(this);
        }

        private async void InitializeApplication()
        {
            Logger.Info("بدء تهيئة InitializeApplication...");
#if DEBUG
            if (_isDemoError)
            {
                ShowFatalError(
                    "فشل في تهيئة قاعدة البيانات المحلية (SQLite)",
                    "SQL logic error\nno such column: display_order\n\nمسار ملف القاعدة:\n" + Path.Combine(AppDomain.CurrentDomain.BaseDirectory, @"data\rafiq_pos.db"),
                    "1. انقر على زر «إعادة المحاولة والتصحيح التلقائي» لتشغيل فحص التصحيح التلقائي وتحديث أعمدة الجداول.\n" +
                    "2. يرجى التأكد من عدم استخدام ملف القاعدة بواسطة برنامج آخر (مثل SQLite Browser).\n" +
                    "3. يمكنك فتح مجلد البيانات للتحقق من سلامة المجلد أو استرجاع نسخة احتياطية سابقة."
                );
                return;
            }
#endif

            // 1. Initialize SQLite Database (Separated Error Handling & Self-Healing)
            try
            {
                Logger.Info("جاري استدعاء DatabaseService.Initialize()...");
                DatabaseService.Initialize();
                Logger.Info("اكتملت تهيئة DatabaseService بنجاح.");
                if (DatabaseService.License != null)
                {
                    DatabaseService.License.StartBackgroundPeriodicCheck();
                }
                if (DatabaseService.Backup != null)
                {
                    DatabaseService.Backup.StartBackgroundPeriodicCheck();
                }
            }
            catch (Exception dbEx)
            {
                Logger.Error("خطأ في DatabaseService.Initialize", dbEx);
                ShowFatalError(
                    "فشل في تهيئة قاعدة البيانات المحلية (SQLite)",
                    dbEx.Message + "\n\nمسار ملف القاعدة:\n" + DatabaseService.DbPath,
                    "1. انقر على زر «إعادة المحاولة» لتشغيل فحص التصحيح التلقائي وتحديث أعمدة الجداول.\n" +
                    "2. يرجى التأكد من عدم استخدام ملف القاعدة بواسطة برنامج آخر (مثل SQLite Browser).\n" +
                    "3. يمكنك فتح مجلد البيانات للتحقق من سلامة المجلد أو استرجاع نسخة احتياطية سابقة."
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
            Logger.Info(string.Format("مسار الواجهة distFolder: {0}", distFolder));

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

            // 4. Initialize WebView2 with dedicated error handling & Win7 Offline Performance Optimizations
            try
            {
                Logger.Info("بدء تهيئة CoreWebView2Environment...");
                if (_lblStatus != null) _lblStatus.Text = "جاري تهيئة محرك العرض السريع...";

                string userDataFolder = Path.Combine(baseDataFolder, "webview_profile");

                // تحسينات سرعة التشغيل الصارمة لويندوز 7 والعمل بدون إنترنت وحماية استقرار معالج الرسوميات (DWM & GPU) عند تشغيل برامج أخرى بجانب التطبيق
                string browserArgs = "--no-proxy-server " +
                                     "--disable-background-networking " +
                                     "--disable-component-update " +
                                     "--disable-domain-reliability " +
                                     "--disable-sync " +
                                     "--disable-features=Translate,OptimizationHints,MediaRouter,DialMediaRouteProvider " +
                                     "--disable-gpu-watchdog " +
                                     "--no-first-run " +
                                     "--autoplay-policy=no-user-gesture-required";

                CoreWebView2EnvironmentOptions envOptions = new CoreWebView2EnvironmentOptions(browserArgs, null, null, false);
                Logger.Info(string.Format("استدعاء CreateAsync(browserExecutable={0}, userDataFolder={1})", browserExecutableFolder ?? "null", userDataFolder));
                var env = await CoreWebView2Environment.CreateAsync(browserExecutableFolder, userDataFolder, envOptions);
                Logger.Info("تم إنشاء CoreWebView2Environment بنجاح. جاري استدعاء EnsureCoreWebView2Async...");

                await _webView.EnsureCoreWebView2Async(env);
                Logger.Info("اكتمل EnsureCoreWebView2Async بنجاح.");

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

                _webView.CoreWebView2.Settings.AreDevToolsEnabled = true;

                // Navigate to app with cache-buster parameter
                if (_lblStatus != null) _lblStatus.Text = "جاري فتح واجهة نظام رفيق...";
                string cacheBuster = DateTime.UtcNow.Ticks.ToString();
                Logger.Info("جاري استدعاء Navigate إلى واجهة التطبيق...");
                _webView.CoreWebView2.Navigate("https://app.rafiq.local/index.html?v=" + cacheBuster);

                _lblStatus.Visible = false;
                _errorPanel.Visible = false;
                _webView.Visible = true;
                _webView.Focus();
                WindowHelper.ActivateAndBringToFront(this);
                Logger.Info("تم الانتهاء من تهيئة الواجهة وتشغيلها بنجاح.");
            }
            catch (Exception wvEx)
            {
                Logger.Error("خطأ استثنائي أثناء تهيئة محرك WebView2: ", wvEx);
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
            _lastErrorFullText = string.Format(
                "====================================================\n" +
                "رفيق لنقاط البيع وإدارة المتاجر — تقرير التشخيص\n" +
                "====================================================\n" +
                "العنوان: {0}\n" +
                "التاريخ: {1}\n\n" +
                "[التفاصيل الفنية]\n{2}\n\n" +
                "[خطوات المعالجة المقترحة]\n{3}\n" +
                "====================================================",
                title, DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"), details, advice
            );

            _lblErrorTitle.Text = title;
            _txtErrorDetails.Text = details;
            _lblAdviceBody.Text = advice;

            _lblStatus.Visible = false;
            if (_webView != null)
            {
                _webView.Visible = false;
            }

            CenterErrorCard();
            _errorPanel.Visible = true;
            _errorPanel.BringToFront();
            WindowHelper.ActivateAndBringToFront(this);
        }

        private static readonly JsonSerializerSettings BridgeSerializerSettings = new JsonSerializerSettings
        {
            ContractResolver = new Newtonsoft.Json.Serialization.CamelCasePropertyNamesContractResolver(),
            NullValueHandling = NullValueHandling.Include
        };

        private void CoreWebView2_WebMessageReceived(object sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            string rawJson = null;
            try
            {
                rawJson = e.WebMessageAsJson;
            }
            catch (Exception ex)
            {
                Logger.Error("فشل قراءة رسالة الويب: ", ex);
                return;
            }

            System.Threading.ThreadPool.QueueUserWorkItem(delegate
            {
                BridgeRequest request = null;
                string reqId = "";
                BridgeResponse response = null;

                try
                {
                    request = JsonConvert.DeserializeObject<BridgeRequest>(rawJson);
                    if (request != null && !string.IsNullOrEmpty(request.Id))
                    {
                        reqId = request.Id;
                    }

                    response = IpcDispatcher.Dispatch(request);
                }
                catch (Exception ex)
                {
                    Logger.Error("خطأ غير متوقع في معالج IPC: ", ex);
                    response = BridgeResponse.Fail(reqId, "DISPATCHER_ERROR", ex.Message);
                }

                if (response == null)
                {
                    response = BridgeResponse.Fail(reqId, "EMPTY_RESPONSE", "لم يتم إرجاع استجابة");
                }

                string responseJson = JsonConvert.SerializeObject(response, BridgeSerializerSettings);

                try
                {
                    this.BeginInvoke(new Action(delegate
                    {
                        try
                        {
                            if (_webView != null && _webView.CoreWebView2 != null)
                            {
                                _webView.CoreWebView2.PostWebMessageAsJson(responseJson);
                            }
                        }
                        catch (Exception postEx)
                        {
                            Logger.Error("فشل إرسال رد IPC إلى WebView2: ", postEx);
                        }
                    }));
                }
                catch (Exception invokeEx)
                {
                    Logger.Error("فشل تنفيذ BeginInvoke للرد: ", invokeEx);
                }
            });
        }


        public void ToggleFullscreen()
        {
            if (this.InvokeRequired)
            {
                this.Invoke(new Action(delegate { ToggleFullscreen(); }));
                return;
            }

            if (_isKioskFullscreen)
            {
                // Return to borderless WorkingArea (respecting Windows Taskbar and preventing overflow)
                this.WindowState = FormWindowState.Normal;
                this.FormBorderStyle = FormBorderStyle.None;
                this.Bounds = Screen.FromControl(this).WorkingArea;
                _isKioskFullscreen = false;
            }
            else
            {
                // Enter True Kiosk Fullscreen (covering entire display including taskbar)
                this.WindowState = FormWindowState.Normal;
                this.FormBorderStyle = FormBorderStyle.None;
                this.Bounds = Screen.FromControl(this).Bounds;
                _isKioskFullscreen = true;
            }
        }

        public bool IsFullscreen()
        {
            return _isKioskFullscreen;
        }

        private void MainForm_FormClosing(object sender, FormClosingEventArgs e)
        {
            try
            {
                if (DatabaseService.License != null)
                {
                    DatabaseService.License.StopBackgroundPeriodicCheck();
                }
                if (DatabaseService.Backup != null)
                {
                    DatabaseService.Backup.StopBackgroundPeriodicCheck();
                }

                if (DatabaseService.SettingsRepo != null)
                {
                    string autoClose = DatabaseService.SettingsRepo.Get("backup_auto_on_close", "1");
                    if (autoClose == "1" && DatabaseService.Backup != null)
                    {
                        DatabaseService.Backup.CreateBackup(null);
                    }
                }
            }
            catch (Exception ex)
            {
                Logger.Warn("فشل النسخ الاحتياطي التلقائي عند إغلاق البرنامج: " + ex.Message);
            }
        }
    }
}
