using System;
using System.Collections.Generic;
using System.IO;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Text;
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
    public class DoubleBufferedPanel : Panel
    {
        public DoubleBufferedPanel()
        {
            this.DoubleBuffered = true;
            this.SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint | ControlStyles.OptimizedDoubleBuffer, true);
            this.UpdateStyles();
        }
    }

    public class MainForm : Form
    {
        private WebView2 _webView;

        // Branded High-End Splash Screen UI (Atomic GDI+ Rendered - Zero HWND Flicker)
        private DoubleBufferedPanel _splashPanel;
        private DoubleBufferedPanel _splashCard;
        private Image _splashLogoImage;
        private string _splashStatusText = "جاري تهيئة قاعدة البيانات المحلية ومحرك العرض السريع...";
        private System.Windows.Forms.Timer _splashAnimTimer;
        private float _shimmerProgress = 0f;
        private bool _isSplashDarkMode = false;

        // Synchronized Splash Timing & Reveal Control
        private DateTime _splashStartTime = DateTime.UtcNow;
        private const int MinSplashDurationMs = 2200; // Fixed professional dwell time: 2.2s
        private bool _isNavigationCompleted = false;
        private bool _isReactReady = false;
        private bool _isSplashDismissed = false;
        private System.Windows.Forms.Timer _splashSafetyTimer;
        private System.Windows.Forms.Timer _dismissDelayTimer;

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
            _isSplashDarkMode = DetectSplashDarkMode();
            Color defaultCanvas = _isSplashDarkMode ? Color.FromArgb(14, 19, 18) : Color.FromArgb(248, 250, 252);
            this.BackColor = defaultCanvas;

            // Default to borderless desktop mode matching Windows WorkingArea (respecting Windows Taskbar and preventing bottom bar overflow)
            this.StartPosition = FormStartPosition.Manual;
            this.WindowState = FormWindowState.Normal;
            this.FormBorderStyle = FormBorderStyle.None;
            this.Bounds = Screen.PrimaryScreen.WorkingArea;
            this.KeyPreview = true;

            // Double-buffer the main form and all child drawing to eliminate any startup flicker
            this.DoubleBuffered = true;
            this.SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint | ControlStyles.OptimizedDoubleBuffer, true);
            this.UpdateStyles();

            this.KeyDown += delegate(object s, KeyEventArgs e)
            {
                if (e.KeyCode == Keys.F11)
                {
                    e.Handled = true;
                    ToggleFullscreen();
                }
                else if (e.KeyCode == Keys.F5 || (e.Control && e.KeyCode == Keys.R))
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

            // 1. Setup WebView2 container with background matching brand canvas
            _webView = new WebView2
            {
                Dock = DockStyle.Fill,
                Visible = true,
                DefaultBackgroundColor = defaultCanvas
            };
            this.Controls.Add(_webView);

            // 2. Initial Branded Splash Screen (Sits directly on top of WebView2 to hide page rendering seamlessly)
            InitializeBrandedSplashScreen();

            // 3. Setup Branded Error Screen Panel
            InitializeBrandedErrorScreen();

            this.Load += MainForm_Load;
            this.Shown += MainForm_Shown;
            this.FormClosing += MainForm_FormClosing;
        }

        private void InitializeBrandedSplashScreen()
        {
            _splashStartTime = DateTime.UtcNow;

            Color canvasBg = _isSplashDarkMode ? Color.FromArgb(14, 19, 18) : Color.FromArgb(248, 250, 252);
            Color cardBg = _isSplashDarkMode ? Color.FromArgb(21, 27, 26) : Color.White;

            _splashPanel = new DoubleBufferedPanel
            {
                Dock = DockStyle.Fill,
                BackColor = canvasBg,
                RightToLeft = RightToLeft.No,
                Visible = true
            };
            _splashPanel.Resize += delegate(object s, EventArgs e)
            {
                CenterSplashCard();
            };

            _splashCard = new DoubleBufferedPanel
            {
                BackColor = cardBg,
                Size = new Size(520, 360),
                RightToLeft = RightToLeft.No
            };
            _splashCard.Paint += SplashCard_Paint;

            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            List<string> candidateLogos = new List<string>();

            if (_isSplashDarkMode)
            {
                candidateLogos.Add(Path.Combine(baseDir, "logo_full_dark.png"));
                candidateLogos.Add(Path.Combine(baseDir, "logo_full_white.png"));
                candidateLogos.Add(Path.Combine(baseDir, "logo_white.png"));
                candidateLogos.Add(Path.Combine(baseDir, "branding", "logo_full_dark.png"));
                candidateLogos.Add(Path.Combine(baseDir, @"..\..\..\branding\logo_full_dark.png"));
                candidateLogos.Add(Path.Combine(baseDir, @"..\..\..\frontend\public\logo_full_dark.png"));
                candidateLogos.Add(Path.Combine(baseDir, @"..\..\..\frontend\public\logo_full_white.png"));
                candidateLogos.Add(Path.Combine(baseDir, @"..\..\..\frontend\public\logo_white.png"));
                candidateLogos.Add(Path.Combine(baseDir, "dist", "logo_full_dark.png"));
                candidateLogos.Add(Path.Combine(baseDir, "dist", "logo_full_white.png"));
            }

            candidateLogos.Add(Path.Combine(baseDir, "logo_full.png"));
            candidateLogos.Add(Path.Combine(baseDir, "logo.png"));
            candidateLogos.Add(Path.Combine(baseDir, "branding", "logo_full.png"));
            candidateLogos.Add(Path.Combine(baseDir, "branding", "logo.png"));
            candidateLogos.Add(Path.Combine(baseDir, @"..\..\..\branding\logo_full.png"));
            candidateLogos.Add(Path.Combine(baseDir, @"..\..\..\branding\logo.png"));
            candidateLogos.Add(Path.Combine(baseDir, @"..\..\..\frontend\public\logo_full.png"));
            candidateLogos.Add(Path.Combine(baseDir, @"..\..\..\frontend\public\logo.png"));
            candidateLogos.Add(Path.Combine(baseDir, "dist", "logo_full.png"));
            candidateLogos.Add(Path.Combine(baseDir, "dist", "logo.png"));

            foreach (string p in candidateLogos)
            {
                if (File.Exists(p))
                {
                    try
                    {
                        _splashLogoImage = Image.FromFile(p);
                        break;
                    }
                    catch { }
                }
            }

            _splashPanel.Controls.Add(_splashCard);
            CenterSplashCard();
            this.Controls.Add(_splashPanel);
            _splashPanel.BringToFront();

            // Smooth Shimmer Animation Timer (30fps) for the progress bar
            _splashAnimTimer = new System.Windows.Forms.Timer { Interval = 33 };
            _splashAnimTimer.Tick += delegate(object s, EventArgs e)
            {
                _shimmerProgress += 0.03f;
                if (_shimmerProgress > 1f) _shimmerProgress = 0f;
                if (_splashCard != null && !_splashCard.IsDisposed)
                {
                    int progW = 260;
                    int progX = (_splashCard.Width - progW) / 2;
                    _splashCard.Invalidate(new Rectangle(progX - 2, 184, progW + 4, 8));
                }
            };
            _splashAnimTimer.Start();

            // Safety Fallback Timer (4.5 seconds maximum) in case React or WebView fails to report
            _splashSafetyTimer = new System.Windows.Forms.Timer { Interval = 4500 };
            _splashSafetyTimer.Tick += delegate(object s, EventArgs e)
            {
                _splashSafetyTimer.Stop();
                _splashSafetyTimer.Dispose();
                _splashSafetyTimer = null;
                Logger.Warn("انتهت مهلة الأمان للشاشة الافتتاحية دون تأكيد، جاري إظهار الواجهة قسرياً.");
                DismissSplashNow();
            };
            _splashSafetyTimer.Start();
        }

        private void SplashCard_Paint(object sender, PaintEventArgs e)
        {
            Graphics g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.TextRenderingHint = TextRenderingHint.ClearTypeGridFit;

            bool isDark = _isSplashDarkMode;

            // 0. Card Background (#151B1A in Dark Mode, #FFFFFF in Light Mode)
            Color cardBg = isDark ? Color.FromArgb(21, 27, 26) : Color.White;
            using (SolidBrush bgBrush = new SolidBrush(cardBg))
            {
                g.FillRectangle(bgBrush, 0, 0, _splashCard.Width, _splashCard.Height);
            }

            // 1. Top Accent Stripe (#5FBFA2 in Dark Mode, #006D41 in Light Mode)
            Color stripeColor = isDark ? Color.FromArgb(95, 191, 162) : Color.FromArgb(0, 109, 65);
            using (SolidBrush topBrush = new SolidBrush(stripeColor))
            {
                g.FillRectangle(topBrush, 0, 0, _splashCard.Width, 4);
            }

            // 2. Refined Card Border (#2A3532 in Dark Mode, #DCE1DC in Light Mode)
            Color borderColor = isDark ? Color.FromArgb(42, 53, 50) : Color.FromArgb(220, 225, 220);
            using (Pen pen = new Pen(borderColor, 1.5f))
            {
                g.DrawRectangle(pen, 0, 0, _splashCard.Width - 1, _splashCard.Height - 1);
            }

            // 3. Logo (Centered at Y=28)
            if (_splashLogoImage != null)
            {
                int maxW = 250;
                int maxH = 68;
                float ratio = Math.Min((float)maxW / _splashLogoImage.Width, (float)maxH / _splashLogoImage.Height);
                int logoW = Math.Max(1, (int)(_splashLogoImage.Width * ratio));
                int logoH = Math.Max(1, (int)(_splashLogoImage.Height * ratio));
                int logoX = (_splashCard.Width - logoW) / 2;
                int logoY = 28 + (maxH - logoH) / 2;
                g.DrawImage(_splashLogoImage, logoX, logoY, logoW, logoH);
            }

            using (StringFormat sf = new StringFormat())
            {
                sf.Alignment = StringAlignment.Center;
                sf.LineAlignment = StringAlignment.Center;

                // 4. App Title (Segoe UI 20 Bold, #E6ECEA in Dark, #00372D in Light)
                Color titleColor = isDark ? Color.FromArgb(230, 236, 234) : Color.FromArgb(0, 55, 45);
                using (Font titleFont = new Font("Segoe UI", 20, FontStyle.Bold))
                using (SolidBrush titleBrush = new SolidBrush(titleColor))
                {
                    Rectangle titleRect = new Rectangle(20, 108, 480, 36);
                    g.DrawString("رفيق POS", titleFont, titleBrush, titleRect, sf);
                }

                // 5. Subtitle (Segoe UI 10.5, #5FBFA2 in Dark, #006D41 in Light)
                Color subColor = isDark ? Color.FromArgb(95, 191, 162) : Color.FromArgb(0, 109, 65);
                using (Font subFont = new Font("Segoe UI", 10.5f, FontStyle.Regular))
                using (SolidBrush subBrush = new SolidBrush(subColor))
                {
                    Rectangle subRect = new Rectangle(20, 146, 480, 24);
                    g.DrawString("نظام نقاط البيع وإدارة المتاجر ومحلات التجزئة", subFont, subBrush, subRect, sf);
                }

                // 6. Progress Bar Track & Shimmer (Y=186, 260x4)
                int progW = 260;
                int progH = 4;
                int progX = (_splashCard.Width - progW) / 2;
                int progY = 186;
                Rectangle progTrack = new Rectangle(progX, progY, progW, progH);
                Color trackColor = isDark ? Color.FromArgb(28, 36, 35) : Color.FromArgb(241, 245, 244);
                using (SolidBrush trackBrush = new SolidBrush(trackColor))
                {
                    g.FillRectangle(trackBrush, progTrack);
                }

                int shimW = 80;
                int shimX = progX + (int)((progW - shimW) * _shimmerProgress);
                Rectangle shimRect = new Rectangle(shimX, progY, shimW, progH);
                Color shimmerColor = isDark ? Color.FromArgb(95, 191, 162) : Color.FromArgb(0, 109, 65);
                using (SolidBrush progBrush = new SolidBrush(shimmerColor))
                {
                    g.FillRectangle(progBrush, shimRect);
                }

                // 7. Dynamic Status Label (Segoe UI 9.5, #93A19D in Dark, #52605D in Light)
                string statusText = _splashStatusText ?? "جاري تهيئة قاعدة البيانات المحلية ومحرك العرض السريع...";
                Color statusColor = isDark ? Color.FromArgb(147, 161, 157) : Color.FromArgb(82, 96, 93);
                using (Font statusFont = new Font("Segoe UI", 9.5f, FontStyle.Regular))
                using (SolidBrush statusBrush = new SolidBrush(statusColor))
                {
                    Rectangle statusRect = new Rectangle(20, 204, 480, 24);
                    g.DrawString(statusText, statusFont, statusBrush, statusRect, sf);
                }

                // 8. Footer Badge (Y=275, 440x32, #12302A in Dark, #EAF5EE in Light)
                int badgeW = 440;
                int badgeH = 32;
                int badgeX = (_splashCard.Width - badgeW) / 2;
                int badgeY = 275;
                Rectangle badgeRect = new Rectangle(badgeX, badgeY, badgeW, badgeH);
                Color badgeBgColor = isDark ? Color.FromArgb(18, 48, 42) : Color.FromArgb(234, 245, 238);
                Color badgeBorderColor = isDark ? Color.FromArgb(38, 73, 66) : Color.FromArgb(200, 230, 215);
                Color badgeTextColor = isDark ? Color.FromArgb(95, 191, 162) : Color.FromArgb(0, 109, 65);
                using (SolidBrush badgeBg = new SolidBrush(badgeBgColor))
                using (Pen badgeBorder = new Pen(badgeBorderColor, 1f))
                using (Font footerFont = new Font("Segoe UI", 8.5f, FontStyle.Bold))
                using (SolidBrush footerBrush = new SolidBrush(badgeTextColor))
                {
                    g.FillRectangle(badgeBg, badgeRect);
                    g.DrawRectangle(badgeBorder, badgeRect);
                    g.DrawString("Enterprise Offline-First Retail System • إصدار سطح المكتب المعتمد", footerFont, footerBrush, badgeRect, sf);
                }
            }
        }

        private void CenterSplashCard()
        {
            if (_splashPanel != null && _splashCard != null)
            {
                int x = Math.Max(10, (_splashPanel.ClientSize.Width - _splashCard.Width) / 2);
                int y = Math.Max(10, (_splashPanel.ClientSize.Height - _splashCard.Height) / 2);
                _splashCard.Location = new Point(x, y);
            }
        }

        private void UpdateSplashStatus(string text)
        {
            _splashStatusText = text;
            if (_splashCard != null && !_splashCard.IsDisposed)
            {
                try
                {
                    if (this.InvokeRequired)
                    {
                        this.BeginInvoke(new Action(delegate
                        {
                            _splashCard.Invalidate(new Rectangle(20, 204, 480, 24));
                        }));
                    }
                    else
                    {
                        _splashCard.Invalidate(new Rectangle(20, 204, 480, 24));
                    }
                }
                catch { }
            }
        }

        public void NotifyAppReady(string theme = null)
        {
            if (_isSplashDismissed) return;
            _isReactReady = true;
            Logger.Info("تم استلام إشارة جاهزية واجهة React (system:appReady).");
            if (!string.IsNullOrEmpty(theme))
            {
                SaveThemePreference(theme);
            }
            UpdateSplashStatus("اكتمل التشغيل بنجاح، جاري فتح النظام...");
            CheckAndDismissSplash();
        }

        public static void SaveThemePreference(string theme)
        {
            if (string.IsNullOrEmpty(theme)) return;
            try
            {
                string cleanTheme = theme.Trim().ToLowerInvariant();
                if (cleanTheme != "dark" && cleanTheme != "light")
                {
                    return;
                }

                string appData = Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData);
                string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
                string baseDir = AppDomain.CurrentDomain.BaseDirectory;

                string[] dirsToEnsure = new string[]
                {
                    Path.Combine(appData, "RafiqPOS"),
                    Path.Combine(appData, "RafiqPOS", "data"),
                    Path.Combine(localAppData, "RafiqPOS"),
                    Path.Combine(baseDir, "data")
                };

                for (int i = 0; i < dirsToEnsure.Length; i++)
                {
                    try
                    {
                        if (!Directory.Exists(dirsToEnsure[i]))
                        {
                            Directory.CreateDirectory(dirsToEnsure[i]);
                        }
                    }
                    catch { }
                }

                string[] filesToWrite = new string[]
                {
                    Path.Combine(appData, "RafiqPOS", "theme.pref"),
                    Path.Combine(appData, "RafiqPOS", "data", "theme.pref"),
                    Path.Combine(localAppData, "RafiqPOS", "theme.pref"),
                    Path.Combine(baseDir, "theme.pref"),
                    Path.Combine(baseDir, "data", "theme.pref")
                };

                for (int i = 0; i < filesToWrite.Length; i++)
                {
                    try
                    {
                        File.WriteAllText(filesToWrite[i], cleanTheme);
                    }
                    catch { }
                }

                // Also save to SQLite app_settings if database repository is ready
                try
                {
                    if (RafiqPOS.Services.DatabaseService.SettingsRepo != null)
                    {
                        RafiqPOS.Services.DatabaseService.SettingsRepo.Set("ui_theme", cleanTheme);
                    }
                }
                catch { }
            }
            catch { }
        }

        private bool DetectSplashDarkMode()
        {
            try
            {
                string appData = Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData);
                string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
                string baseDir = AppDomain.CurrentDomain.BaseDirectory;

                string[] candidateFiles = new string[]
                {
                    Path.Combine(appData, "RafiqPOS", "theme.pref"),
                    Path.Combine(appData, "RafiqPOS", "data", "theme.pref"),
                    Path.Combine(localAppData, "RafiqPOS", "theme.pref"),
                    Path.Combine(baseDir, "theme.pref"),
                    Path.Combine(baseDir, "data", "theme.pref"),
                    Path.Combine(baseDir, @"..\..\..\theme.pref")
                };

                // Pick the most recently modified theme.pref file to avoid picking up stale settings
                FileInfo latestFile = null;
                for (int i = 0; i < candidateFiles.Length; i++)
                {
                    try
                    {
                        string p = candidateFiles[i];
                        if (File.Exists(p))
                        {
                            FileInfo fi = new FileInfo(p);
                            if (latestFile == null || fi.LastWriteTimeUtc > latestFile.LastWriteTimeUtc)
                            {
                                latestFile = fi;
                            }
                        }
                    }
                    catch { }
                }

                if (latestFile != null)
                {
                    try
                    {
                        string t = File.ReadAllText(latestFile.FullName).Trim().ToLowerInvariant();
                        if (t == "dark") return true;
                        if (t == "light") return false;
                    }
                    catch { }
                }

                // Check SQLite database if rafiq_pos.db exists
                string[] candidateDbs = new string[]
                {
                    Path.Combine(appData, "RafiqPOS", "data", "rafiq_pos.db"),
                    Path.Combine(baseDir, "data", "rafiq_pos.db"),
                    Path.Combine(baseDir, "rafiq_pos.db"),
                    Path.Combine(baseDir, @"..\..\..\data\rafiq_pos.db")
                };

                for (int i = 0; i < candidateDbs.Length; i++)
                {
                    try
                    {
                        string dbPath = candidateDbs[i];
                        if (File.Exists(dbPath))
                        {
                            using (var conn = new System.Data.SQLite.SQLiteConnection("Data Source=" + dbPath + ";Version=3;Read Only=True;"))
                            {
                                conn.Open();
                                using (var cmd = new System.Data.SQLite.SQLiteCommand("SELECT value FROM app_settings WHERE key IN ('ui_theme', 'theme') LIMIT 1;", conn))
                                {
                                    object res = cmd.ExecuteScalar();
                                    if (res != null && res != DBNull.Value)
                                    {
                                        string s = res.ToString().Trim().ToLowerInvariant();
                                        if (s == "dark") return true;
                                        if (s == "light") return false;
                                    }
                                }
                            }
                        }
                    }
                    catch { }
                }

                // Check Windows System Theme (Dark Mode Registry)
                try
                {
                    using (Microsoft.Win32.RegistryKey key = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize"))
                    {
                        if (key != null)
                        {
                            object val = key.GetValue("AppsUseLightTheme");
                            if (val != null && val is int && ((int)val) == 0)
                            {
                                return true;
                            }
                            if (val != null && val is int && ((int)val) == 1)
                            {
                                return false;
                            }
                        }
                    }
                }
                catch { }
            }
            catch { }

            // Default to light mode as requested
            return false;
        }

        private void CheckAndDismissSplash()
        {
            if (_isSplashDismissed) return;

            if (this.InvokeRequired)
            {
                this.BeginInvoke(new Action(CheckAndDismissSplash));
                return;
            }

            // Both WebView Navigation and React must be completed (or at least NavigationCompleted)
            if (!_isNavigationCompleted && !_isReactReady) return;

            int elapsedMs = (int)(DateTime.UtcNow - _splashStartTime).TotalMilliseconds;
            int remainingMs = MinSplashDurationMs - elapsedMs;

            if (remainingMs > 0)
            {
                if (_dismissDelayTimer == null)
                {
                    _dismissDelayTimer = new System.Windows.Forms.Timer { Interval = remainingMs };
                    _dismissDelayTimer.Tick += delegate(object s, EventArgs e)
                    {
                        _dismissDelayTimer.Stop();
                        _dismissDelayTimer.Dispose();
                        _dismissDelayTimer = null;
                        DismissSplashNow();
                    };
                    _dismissDelayTimer.Start();
                }
            }
            else
            {
                DismissSplashNow();
            }
        }

        private void DismissSplashNow()
        {
            if (_isSplashDismissed) return;
            _isSplashDismissed = true;

            if (this.InvokeRequired)
            {
                this.BeginInvoke(new Action(DismissSplashNow));
                return;
            }

            try
            {
                if (_splashAnimTimer != null)
                {
                    _splashAnimTimer.Stop();
                    _splashAnimTimer.Dispose();
                    _splashAnimTimer = null;
                }
                if (_splashSafetyTimer != null)
                {
                    _splashSafetyTimer.Stop();
                    _splashSafetyTimer.Dispose();
                    _splashSafetyTimer = null;
                }
                if (_dismissDelayTimer != null)
                {
                    _dismissDelayTimer.Stop();
                    _dismissDelayTimer.Dispose();
                    _dismissDelayTimer = null;
                }

                if (_splashPanel != null)
                {
                    _splashPanel.Visible = false;
                }
                _errorPanel.Visible = false;
                if (_webView != null)
                {
                    _webView.Focus();
                }
                this.Activate();
                Logger.Info("تم الانتهاء من عرض الشاشة الافتتاحية للمدة المحددة وإظهار واجهة رفيق بسلاسة واحترافية.");
            }
            catch (Exception ex)
            {
                Logger.Error("خطأ أثناء إخفاء الشاشة الافتتاحية: ", ex);
            }
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
                UpdateSplashStatus("جاري إعادة فحص قاعدة البيانات وتصحيح الجداول...");
                if (_splashPanel != null) _splashPanel.Visible = true;
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
            this.Bounds = Screen.PrimaryScreen.WorkingArea;
            // Force immediate layout and paint of the splash screen
            this.Refresh();
        }

        private void MainForm_Shown(object sender, EventArgs e)
        {
            this.Bounds = Screen.PrimaryScreen.WorkingArea;
            WindowHelper.ActivateAndBringToFront(this);
            this.Bounds = Screen.PrimaryScreen.WorkingArea;
            this.Refresh();
            Application.DoEvents();
            InitializeApplication();
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
                UpdateSplashStatus("جاري تهيئة محرك العرض السريع...");

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

                // DevTools give full access to the IPC bridge; allow them only in Debug builds (Audit F-02)
#if DEBUG
                _webView.CoreWebView2.Settings.AreDevToolsEnabled = true;
#else
                _webView.CoreWebView2.Settings.AreDevToolsEnabled = false;
                _webView.CoreWebView2.Settings.AreBrowserAcceleratorKeysEnabled = false;
#endif

                // Navigate to app with cache-buster parameter
                UpdateSplashStatus("جاري فتح واجهة نظام رفيق...");
                string cacheBuster = DateTime.UtcNow.Ticks.ToString();
                Logger.Info("جاري استدعاء Navigate إلى واجهة التطبيق...");

                // Smooth Reveal: Coordinate splash dismissal with fixed duration and React readiness
                _webView.CoreWebView2.NavigationCompleted += delegate(object sNav, CoreWebView2NavigationCompletedEventArgs navArgs)
                {
                    _isNavigationCompleted = true;
                    Logger.Info("اكتمل تحميل مستند الواجهة بنجاح (NavigationCompleted).");
                    CheckAndDismissSplash();
                };

                _webView.CoreWebView2.Navigate("https://app.rafiq.local/index.html?v=" + cacheBuster);
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

            if (_splashPanel != null) _splashPanel.Visible = false;
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
                // Accept bridge messages only from the bundled local application origin (Audit F-02)
                string source = e.Source ?? "";
                if (!source.StartsWith("https://app.rafiq.local/", StringComparison.OrdinalIgnoreCase))
                {
                    Logger.Warn("تم تجاهل رسالة IPC من مصدر غير موثوق: " + source);
                    return;
                }
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
