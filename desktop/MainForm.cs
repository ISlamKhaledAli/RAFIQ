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
        private string _splashStatusText = "جاري تشغيل مساحة العمل والاتصال بالسجلات المحلية...";
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

        // System DPI scale factor (1.0 at 96 DPI, 1.5 at 150%) — app.manifest declares the process DPI aware
        private float _uiScale = 1f;
        private const int SplashCardWidth = 540;
        private const int SplashCardHeight = 350;

        // Preferred compact-screen minimum (Task 159); never larger than the screen's working area
        private const int PreferredMinWidth = 1024;
        private const int PreferredMinHeight = 768;

        // Auto backup on close must never hang the close or be killed half-way by a Windows shutdown
        private const int CloseBackupTimeoutMs = 30000;

        public static MainForm Instance { get; private set; }

        private static float DetectUiScale()
        {
            try
            {
                using (Graphics screenGraphics = Graphics.FromHwnd(IntPtr.Zero))
                {
                    float scale = screenGraphics.DpiX / 96f;
                    if (scale < 1f) scale = 1f;
                    if (scale > 3f) scale = 3f;
                    return scale;
                }
            }
            catch (Exception ex)
            {
                Logger.Warn("تعذر قراءة إعداد تكبير الشاشة (DPI)، سيتم استخدام الحجم الافتراضي: " + ex.Message);
                return 1f;
            }
        }

        private int Scaled(int value)
        {
            return (int)Math.Round(value * _uiScale);
        }

        // Fills the screen's working area (above the taskbar). On 1024x768 the working area is about 1024x728, so the
        // minimum size is clamped to it; otherwise Windows enforces MinimumSize and the bottom (payment buttons) hides behind the taskbar.
        private void ApplyWorkingAreaBounds(Screen screen)
        {
            Rectangle workingArea = screen.WorkingArea;
            this.MinimumSize = new Size(
                Math.Min(PreferredMinWidth, workingArea.Width),
                Math.Min(PreferredMinHeight, workingArea.Height));
            this.Bounds = workingArea;
        }

        // Startup mode: true fullscreen covering the whole display including the taskbar (F11 switches to the work-area mode).
        private void ApplyFullscreenBounds(Screen screen)
        {
            Rectangle full = screen.Bounds;
            this.MinimumSize = new Size(
                Math.Min(PreferredMinWidth, full.Width),
                Math.Min(PreferredMinHeight, full.Height));
            this.Bounds = full;
            _isKioskFullscreen = true;
        }

        public MainForm(bool isDemoError = false)
        {
            Instance = this;
            _isDemoError = isDemoError;
            this.Text = "نظام رفيق — نقاط البيع وإدارة المتاجر";
            this.Size = new Size(1280, 800);
            _uiScale = DetectUiScale();
            _isSplashDarkMode = DetectSplashDarkMode();
            Color defaultCanvas = _isSplashDarkMode ? Color.FromArgb(14, 19, 18) : Color.FromArgb(243, 245, 242);
            this.BackColor = defaultCanvas;

            // Default to borderless true fullscreen covering the whole display including the taskbar (owner decision)
            this.StartPosition = FormStartPosition.Manual;
            this.WindowState = FormWindowState.Normal;
            this.FormBorderStyle = FormBorderStyle.None;
            ApplyFullscreenBounds(Screen.PrimaryScreen);
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

            Color canvasBg = _isSplashDarkMode ? Color.FromArgb(14, 19, 18) : Color.FromArgb(243, 245, 242);
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
                Size = new Size(Scaled(SplashCardWidth), Scaled(SplashCardHeight)),
                RightToLeft = RightToLeft.No
            };
            using (GraphicsPath cardRegionPath = CreateRoundedRectanglePath(new Rectangle(0, 0, Scaled(SplashCardWidth), Scaled(SplashCardHeight)), Scaled(20)))
            {
                _splashCard.Region = new Region(cardRegionPath);
            }
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
                _shimmerProgress += 0.025f;
                if (_shimmerProgress > 1f) _shimmerProgress = 0f;
                if (_splashCard != null && !_splashCard.IsDisposed)
                {
                    _splashCard.Invalidate(new Rectangle(0, Scaled(170), _splashCard.Width, Scaled(75)));
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

            // Draw in 96-DPI logical units and let the transform scale to the real DPI (fonts use pixel units so they are not scaled twice)
            g.ScaleTransform(_uiScale, _uiScale);
            int cardW = SplashCardWidth;
            int cardH = SplashCardHeight;

            // 0. Card Background (#151B1A in Dark Mode, #FFFFFF in Light Mode)
            Color cardBg = isDark ? Color.FromArgb(21, 27, 26) : Color.White;
            using (SolidBrush bgBrush = new SolidBrush(cardBg))
            {
                g.FillRectangle(bgBrush, 0, 0, cardW, cardH);
            }

            // 1. Top Accent Stripe (#5FBFA2 in Dark Mode, #006D41 in Light Mode)
            Color stripeColor = isDark ? Color.FromArgb(95, 191, 162) : Color.FromArgb(0, 109, 65);
            using (SolidBrush topBrush = new SolidBrush(stripeColor))
            {
                g.FillRectangle(topBrush, 0, 0, cardW, 4);
            }

            // 2. Refined Card Border (#2A3532 in Dark Mode, #DCE1DC in Light Mode)
            Color borderColor = isDark ? Color.FromArgb(42, 53, 50) : Color.FromArgb(220, 225, 220);
            using (GraphicsPath borderPath = CreateRoundedRectanglePath(new Rectangle(0, 0, cardW - 1, cardH - 1), 20))
            using (Pen pen = new Pen(borderColor, 1.5f))
            {
                g.DrawPath(pen, borderPath);
            }

            // 3. Logo (Centered at Y=34, max 250x58)
            if (_splashLogoImage != null)
            {
                int maxW = 250;
                int maxH = 58;
                float ratio = Math.Min((float)maxW / _splashLogoImage.Width, (float)maxH / _splashLogoImage.Height);
                int logoW = Math.Max(1, (int)(_splashLogoImage.Width * ratio));
                int logoH = Math.Max(1, (int)(_splashLogoImage.Height * ratio));
                int logoX = (cardW - logoW) / 2;
                int logoY = 34 + (maxH - logoH) / 2;
                g.DrawImage(_splashLogoImage, logoX, logoY, logoW, logoH);
            }

            using (StringFormat sf = new StringFormat())
            {
                sf.Alignment = StringAlignment.Center;
                sf.LineAlignment = StringAlignment.Center;

                // 4. App Title (Y=106, Segoe UI 21 Bold, #E6ECEA in Dark, #00372D in Light)
                Color titleColor = isDark ? Color.FromArgb(230, 236, 234) : Color.FromArgb(0, 55, 45);
                using (Font titleFont = SplashFont(21f, FontStyle.Bold))
                using (SolidBrush titleBrush = new SolidBrush(titleColor))
                using (StringFormat sfTitle = new StringFormat())
                {
                    sfTitle.Alignment = StringAlignment.Center;
                    sfTitle.LineAlignment = StringAlignment.Center;
                    sfTitle.FormatFlags = StringFormatFlags.DirectionRightToLeft;
                    Rectangle titleRect = new Rectangle(10, 106, cardW - 20, 32);
                    g.DrawString("نظام رفيق", titleFont, titleBrush, titleRect, sfTitle);
                }

                // 5. Subtitle (Y=142, Segoe UI 10.5, #5FBFA2 in Dark, #006D41 in Light)
                Color subColor = isDark ? Color.FromArgb(95, 191, 162) : Color.FromArgb(0, 109, 65);
                using (Font subFont = SplashFont(10.5f, FontStyle.Regular))
                using (SolidBrush subBrush = new SolidBrush(subColor))
                {
                    Rectangle subRect = new Rectangle(10, 142, cardW - 20, 22);
                    g.DrawString("نظام نقاط البيع وإدارة المتاجر ومحلات التجزئة", subFont, subBrush, subRect, sf);
                }

                // 6. Circular Spinner Ring (Y=180, 40x40)
                int spinSize = 40;
                int spinX = (cardW - spinSize) / 2;
                int spinY = 180;
                Rectangle spinRect = new Rectangle(spinX, spinY, spinSize, spinSize);
                Color spinBgColor = isDark ? Color.FromArgb(40, 95, 191, 162) : Color.FromArgb(30, 0, 109, 65);
                using (Pen spinBgPen = new Pen(spinBgColor, 3f))
                {
                    g.DrawEllipse(spinBgPen, spinRect);
                }
                Color spinArcColor = isDark ? Color.FromArgb(95, 191, 162) : Color.FromArgb(0, 109, 65);
                using (Pen spinArcPen = new Pen(spinArcColor, 3f))
                {
                    spinArcPen.StartCap = LineCap.Round;
                    spinArcPen.EndCap = LineCap.Round;
                    g.DrawArc(spinArcPen, spinRect, _shimmerProgress * 360f, 100f);
                }

                // 7. Progress Bar Track & Smooth Animated Shimmer (Y=230, 260x4)
                int progW = 260;
                int progH = 4;
                int progX = (cardW - progW) / 2;
                int progY = 230;
                Rectangle progTrack = new Rectangle(progX, progY, progW, progH);
                using (GraphicsPath trackPath = CreateRoundedRectanglePath(progTrack, 2))
                {
                    // Track base background
                    Color trackColor = isDark ? Color.FromArgb(28, 36, 35) : Color.FromArgb(241, 245, 244);
                    using (SolidBrush trackBrush = new SolidBrush(trackColor))
                    {
                        g.FillPath(trackBrush, trackPath);
                    }

                    // Base brand emerald gradient fill
                    Color baseC1 = Color.FromArgb(0, 77, 63);   // #004D3F
                    Color baseC2 = Color.FromArgb(0, 109, 65);  // #006D41
                    using (LinearGradientBrush baseBrush = new LinearGradientBrush(
                        progTrack,
                        baseC1,
                        baseC2,
                        LinearGradientMode.Horizontal))
                    {
                        g.FillPath(baseBrush, trackPath);
                    }

                    // Continuous moving shimmer wave across the bar
                    float waveW = 130f;
                    float travelDistance = progW + waveW;
                    float currentX = (progX - waveW) + (_shimmerProgress * travelDistance);
                    RectangleF waveRect = new RectangleF(currentX, progY, waveW, progH);

                    using (LinearGradientBrush waveBrush = new LinearGradientBrush(
                        waveRect,
                        Color.Transparent,
                        Color.Transparent,
                        LinearGradientMode.Horizontal))
                    {
                        Color glowColor = isDark ? Color.FromArgb(220, 95, 191, 162) : Color.FromArgb(240, 52, 211, 153);
                        ColorBlend waveBlend = new ColorBlend();
                        waveBlend.Colors = new Color[] {
                            Color.FromArgb(0, glowColor),
                            glowColor,
                            Color.FromArgb(0, glowColor)
                        };
                        waveBlend.Positions = new float[] { 0.0f, 0.5f, 1.0f };
                        waveBrush.InterpolationColors = waveBlend;
                        g.FillPath(waveBrush, trackPath);
                    }
                }

                // 8. Dynamic Status Label (Y=248, Segoe UI 9.5)
                string statusText = _splashStatusText ?? "جاري تشغيل مساحة العمل والاتصال بالسجلات المحلية...";
                Color statusColor = isDark ? Color.FromArgb(147, 161, 157) : Color.FromArgb(82, 96, 93);
                using (Font statusFont = SplashFont(9.5f, FontStyle.Regular))
                using (SolidBrush statusBrush = new SolidBrush(statusColor))
                {
                    Rectangle statusRect = new Rectangle(10, 248, cardW - 20, 22);
                    g.DrawString(statusText, statusFont, statusBrush, statusRect, sf);
                }

                // 9. Footer Badge (Y=288, 320x28, rounded capsule matching web browser badge)
                int badgeW = 320;
                int badgeH = 28;
                int badgeX = (cardW - badgeW) / 2;
                int badgeY = 288;
                Rectangle badgeRect = new Rectangle(badgeX, badgeY, badgeW, badgeH);
                Color badgeBgColor = isDark ? Color.FromArgb(18, 48, 42) : Color.FromArgb(234, 245, 238);
                Color badgeBorderColor = isDark ? Color.FromArgb(38, 73, 66) : Color.FromArgb(200, 230, 215);
                Color badgeTextColor = isDark ? Color.FromArgb(95, 191, 162) : Color.FromArgb(0, 109, 65);
                using (GraphicsPath badgePath = CreateRoundedRectanglePath(badgeRect, 14))
                using (SolidBrush badgeBg = new SolidBrush(badgeBgColor))
                using (Pen badgeBorder = new Pen(badgeBorderColor, 1f))
                using (Font footerFont = SplashFont(9f, FontStyle.Bold))
                using (SolidBrush footerBrush = new SolidBrush(badgeTextColor))
                {
                    g.FillPath(badgeBg, badgePath);
                    g.DrawPath(badgeBorder, badgePath);
                    g.DrawString("نظام أوفلاين معتمد • إصدار التجزئة الاحترافي", footerFont, footerBrush, badgeRect, sf);
                }
            }
        }

        // Pixel-unit font equal to the given point size at 96 DPI (used under the splash ScaleTransform)
        private static Font SplashFont(float points, FontStyle style)
        {
            return new Font("Segoe UI", points * 96f / 72f, style, GraphicsUnit.Pixel);
        }

        private static GraphicsPath CreateRoundedRectanglePath(Rectangle rect, int radius)
        {
            GraphicsPath path = new GraphicsPath();
            int d = radius * 2;
            path.AddArc(rect.X, rect.Y, d, d, 180, 90);
            path.AddArc(rect.Right - d, rect.Y, d, d, 270, 90);
            path.AddArc(rect.Right - d, rect.Bottom - d, d, d, 0, 90);
            path.AddArc(rect.X, rect.Bottom - d, d, d, 90, 90);
            path.CloseFigure();
            return path;
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
                            _splashCard.Invalidate(new Rectangle(0, Scaled(240), _splashCard.Width, Scaled(36)));
                        }));
                    }
                    else
                    {
                        _splashCard.Invalidate(new Rectangle(0, Scaled(240), _splashCard.Width, Scaled(36)));
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
                Text = "نظام رفيق — نقاط البيع وإدارة المتاجر",
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
                UpdateSplashStatus("جاري تحرير مشغل العرض وإغلاق العمليات المعلقة...");
                if (_splashPanel != null) _splashPanel.Visible = true;

                // 1. Terminate any orphaned WebView2 processes
                WebViewProcessGuard.TerminateOrphanedProcesses();

                // 2. Clean stale lock files
                try
                {
                    string baseDataDir;
#if DEBUG
                    baseDataDir = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "data");
#else
                    baseDataDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "RafiqPOS", "data");
#endif
                    WebViewProcessGuard.CleanStaleLockFiles(Path.Combine(baseDataDir, "webview_profile"));
                }
                catch { }

                // 3. Dispose existing webview if half-initialized
                if (_webView != null)
                {
                    try
                    {
                        this.Controls.Remove(_webView);
                        _webView.Dispose();
                    }
                    catch { }
                    _webView = null;
                }

                _isNavigationCompleted = false;
                System.Threading.Thread.Sleep(400);
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

            // Layout above is in 96-DPI pixels; scale positions/sizes to the system DPI (fonts are already DPI-scaled by Windows)
            if (_uiScale > 1.01f)
            {
                _errorCard.Scale(new SizeF(_uiScale, _uiScale));
            }
            _errorPanel.Controls.Add(_errorCard);
            this.Controls.Add(_errorPanel);
        }

        private void CenterErrorCard()
        {
            if (_errorCard == null || _errorPanel == null) return;
            int cardW = Math.Min(Scaled(760), Math.Max(Scaled(600), _errorPanel.Width - 40));
            int cardH = Math.Min(Scaled(540), Math.Max(Scaled(480), _errorPanel.Height - 40));
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
            ApplyFullscreenBounds(Screen.PrimaryScreen);
            // Force immediate layout and paint of the splash screen
            this.Refresh();
        }

        private void MainForm_Shown(object sender, EventArgs e)
        {
            ApplyFullscreenBounds(Screen.PrimaryScreen);
            WindowHelper.ActivateAndBringToFront(this);
            ApplyFullscreenBounds(Screen.PrimaryScreen);
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
                DatabaseService.StartBackgroundChecks();
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
            // Production always loads the dist folder shipped next to the exe
            string distFolder = Path.Combine(baseDir, "dist");

#if DEBUG
            // Development only: prefer the freshly built frontend/dist (never in Release, where it could hijack the UI)
            string devFrontendDist = Path.GetFullPath(Path.Combine(baseDir, @"..\..\..\frontend\dist"));
            if (!Directory.Exists(devFrontendDist))
            {
                devFrontendDist = Path.GetFullPath(Path.Combine(baseDir, @"..\frontend\dist"));
            }

            if (Directory.Exists(devFrontendDist) && File.Exists(Path.Combine(devFrontendDist, "index.html")))
            {
                distFolder = devFrontendDist;
            }
#endif
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
            // Windows 7/8/8.1: bundled WebView2 Fixed Runtime 109 (last version supporting them).
            // Windows 10/11: system Evergreen runtime; when it is missing (e.g. Windows 10 LTSC offline) fall back to the bundled Fixed 109.
            string browserExecutableFolder = null;
            string fixed109Folder = Path.Combine(baseDir, "runtimes", "fixed109");
            if (!Directory.Exists(fixed109Folder))
            {
                string altFixed = Path.Combine(baseDir, "fixed109");
                if (Directory.Exists(altFixed)) fixed109Folder = altFixed;
            }

            bool isLegacyWindows = OsDetector.IsLegacyWindows();
            bool hasFixed = File.Exists(Path.Combine(fixed109Folder, "msedgewebview2.exe"));
            string evergreenVersion = TryGetEvergreenWebView2Version();
            string osFriendlyName = OsDetector.GetOsFriendlyName();

            if (isLegacyWindows)
            {
                if (hasFixed)
                {
                    browserExecutableFolder = fixed109Folder;
                }
                else if (string.IsNullOrEmpty(evergreenVersion))
                {
                    Logger.Error("مشغل WebView2 الثابت (Fixed 109) غير موجود في: " + fixed109Folder, null);
                    ShowFatalError(
                        "مشغل العرض المدمج لويندوز 7 غير موجود (WebView2 Fixed 109 Missing)",
                        "لم يتم العثور على الملف msedgewebview2.exe في المسار:\n" + fixed109Folder + "\n\nنظام التشغيل: " + osFriendlyName,
                        "1. أعد تشغيل ملف تثبيت رفيق الرسمي (Setup) لإصلاح التثبيت؛ فهو يحتوي على مشغل العرض المخصص لويندوز 7 و 8.\n" +
                        "2. تأكد أن برنامج الحماية (Antivirus) لم يحذف أو يعزل ملفات المجلد runtimes\\fixed109.\n" +
                        "3. لا يحتاج هذا المشغل إلى اتصال بالإنترنت."
                    );
                    return;
                }
            }
            else if (string.IsNullOrEmpty(evergreenVersion))
            {
                if (hasFixed)
                {
                    Logger.Warn("مشغل WebView2 Evergreen غير مثبت على النظام، سيتم استخدام المشغل المدمج Fixed 109 بدون إنترنت.");
                    browserExecutableFolder = fixed109Folder;
                }
                else
                {
                    Logger.Error("لا يوجد مشغل WebView2 على النظام ولا المشغل المدمج في: " + fixed109Folder, null);
                    ShowFatalError(
                        "مشغل العرض غير موجود (WebView2 Runtime Missing)",
                        "مشغل Microsoft Edge WebView2 غير مثبت على النظام، ولم يتم العثور على المشغل المدمج في:\n" + fixed109Folder + "\n\nنظام التشغيل: " + osFriendlyName,
                        "1. أعد تشغيل ملف تثبيت رفيق الرسمي (Setup) لإصلاح التثبيت؛ فهو يحتوي على مشغل عرض يعمل بدون إنترنت.\n" +
                        "2. أو قم بتثبيت Microsoft Edge WebView2 Runtime على هذا الجهاز.\n" +
                        "3. تأكد أن برنامج الحماية (Antivirus) لم يحذف ملفات المجلد runtimes\\fixed109."
                    );
                    return;
                }
            }
            Logger.Info(string.Format("مشغل العرض المختار: {0} (Evergreen={1}, Fixed109={2}, OS={3})",
                browserExecutableFolder ?? "Evergreen", evergreenVersion ?? "غير مثبت", hasFixed ? "موجود" : "غير موجود", osFriendlyName));

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

                if (_webView == null)
                {
                    _webView = new WebView2
                    {
                        Dock = DockStyle.Fill,
                        Visible = true,
                        DefaultBackgroundColor = Color.FromArgb(248, 250, 252)
                    };
                    this.Controls.Add(_webView);
                    if (_splashPanel != null) _splashPanel.BringToFront();
                }

                int wvAttempts = 0;
                while (wvAttempts < 2)
                {
                    wvAttempts++;
                    try
                    {
                        Logger.Info(string.Format("استدعاء CreateAsync(browserExecutable={0}, userDataFolder={1}) - محاولة {2}", browserExecutableFolder ?? "null", userDataFolder, wvAttempts));
                        var env = await CoreWebView2Environment.CreateAsync(browserExecutableFolder, userDataFolder, envOptions);
                        Logger.Info("تم إنشاء CoreWebView2Environment بنجاح. جاري استدعاء EnsureCoreWebView2Async...");

                        await _webView.EnsureCoreWebView2Async(env);
                        Logger.Info("اكتمل EnsureCoreWebView2Async بنجاح.");
                        break;
                    }
                    catch (Exception initEx)
                    {
                        uint hresult = (uint)initEx.HResult;
                        bool isBusy = (hresult == 0x800700AA) ||
                                      (initEx.Message != null && initEx.Message.IndexOf("0x800700AA", StringComparison.OrdinalIgnoreCase) >= 0) ||
                                      (initEx.Message != null && initEx.Message.IndexOf("resource is in use", StringComparison.OrdinalIgnoreCase) >= 0);

                        if (isBusy && wvAttempts == 1)
                        {
                            Logger.Warn("تم رصد تعليق في مشغل العرض السابق (0x800700AA: The requested resource is in use)، جاري التطهير التلقائي للعمليات المعلقة وإعادة المحاولة...");
                            WebViewProcessGuard.TerminateOrphanedProcesses();
                            WebViewProcessGuard.CleanStaleLockFiles(userDataFolder);
                            System.Threading.Thread.Sleep(600);
                            continue;
                        }

                        throw;
                    }
                }

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

                // Strict Navigation Boundary: Block navigation to any external URL outside app.rafiq.local
                _webView.CoreWebView2.NavigationStarting += delegate(object sNavStart, CoreWebView2NavigationStartingEventArgs navStartArgs)
                {
                    string targetUri = navStartArgs.Uri ?? "";
                    if (!targetUri.StartsWith("https://app.rafiq.local/", StringComparison.OrdinalIgnoreCase) &&
                        !string.Equals(targetUri, "about:blank", StringComparison.OrdinalIgnoreCase))
                    {
                        navStartArgs.Cancel = true;
                        Logger.Warn("تم حظر محاولة تصفح خارج نطاق النظام المعتمد: " + targetUri);
                    }
                };

                // Strict Window Policy: Block any untrusted popups or new browser windows
                _webView.CoreWebView2.NewWindowRequested += delegate(object sNewWin, CoreWebView2NewWindowRequestedEventArgs newWinArgs)
                {
                    newWinArgs.Handled = true;
                    Logger.Warn("تم حظر محاولة فتح نافذة متصفح منبثقة: " + newWinArgs.Uri);
                };

                // DevTools give full access to the IPC bridge; allow them only in Debug builds (Audit F-02)
#if DEBUG
                _webView.CoreWebView2.Settings.AreDevToolsEnabled = true;
#else
                _webView.CoreWebView2.Settings.AreDevToolsEnabled = false;
                _webView.CoreWebView2.Settings.AreBrowserAcceleratorKeysEnabled = false;
#endif

                // Navigate to app with cache-buster parameter
                UpdateSplashStatus("جاري تشغيل مساحة العمل والاتصال بالسجلات المحلية...");
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
                string osName = osFriendlyName;
                string advice;
                if (browserExecutableFolder != null)
                {
                    advice = string.Format("نظام التشغيل لديك هو: {0}.\nفشل تشغيل مشغل العرض المدمج (WebView2 Fixed 109) من المسار:\n{1}\n" +
                        "1. أعد تشغيل ملف تثبيت رفيق الرسمي (Setup) لإصلاح ملفات المشغل.\n" +
                        "2. تأكد أن برنامج الحماية (Antivirus) لا يمنع تشغيل الملف msedgewebview2.exe.\n" +
                        "3. على ويندوز 7: تأكد من تثبيت تحديثات ويندوز 7 المرفقة (KB4490628 ثم KB4474419) ثم أعد تشغيل الجهاز.", osName, browserExecutableFolder);
                }
                else
                {
                    advice = string.Format("نظام التشغيل لديك هو: {0}.\nفشل تشغيل مشغل Microsoft Edge WebView2 المثبت على النظام (الإصدار {1}).\n" +
                        "1. أعد تشغيل الجهاز ثم افتح البرنامج مرة أخرى.\n" +
                        "2. أعد تشغيل ملف تثبيت رفيق الرسمي (Setup) لإصلاح التثبيت.", osName, evergreenVersion ?? "غير معروف");
                }

                ShowFatalError(
                    "تعذر تشغيل محرك العرض (WebView2 Error)",
                    wvEx.Message,
                    advice
                );
            }
        }

        // Returns the installed Evergreen WebView2 version, or null when none is installed (never throws)
        private static string TryGetEvergreenWebView2Version()
        {
            try
            {
                string version = CoreWebView2Environment.GetAvailableBrowserVersionString();
                return string.IsNullOrEmpty(version) ? null : version;
            }
            catch (Exception ex)
            {
                Logger.Info("لا يوجد مشغل WebView2 Evergreen مثبت: " + ex.Message);
                return null;
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
                    if (!this.IsDisposed && this.IsHandleCreated)
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
                ApplyWorkingAreaBounds(Screen.FromControl(this));
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

        public void ShowPrintDialog(string dialogKind)
        {
            if (this.InvokeRequired)
            {
                this.BeginInvoke(new Action<string>(ShowPrintDialog), dialogKind);
                return;
            }

            try
            {
                if (_webView != null && _webView.CoreWebView2 != null)
                {
                    CoreWebView2PrintDialogKind kind = string.Equals(dialogKind, "system", StringComparison.OrdinalIgnoreCase)
                        ? CoreWebView2PrintDialogKind.System
                        : CoreWebView2PrintDialogKind.Browser;

                    _webView.CoreWebView2.ShowPrintUI(kind);
                    Logger.Info("تم إظهار نافذة طباعة التقرير بنجاح عبر ShowPrintUI: " + kind);
                }
                else
                {
                    Logger.Warn("تعذر إظهار نافذة الطباعة لأن مشغل العرض غير جاهز بعد.");
                }
            }
            catch (Exception ex)
            {
                Logger.Error("خطأ أثناء استدعاء ShowPrintUI: ", ex);
            }
        }

        protected override bool ProcessCmdKey(ref Message msg, Keys keyData)
        {
            if (keyData == (Keys.Alt | Keys.F4))
            {
                this.Close();
                return true;
            }
            if (keyData == Keys.Escape && _isKioskFullscreen)
            {
                ToggleFullscreen();
                return true;
            }
            if (keyData == Keys.F11)
            {
                ToggleFullscreen();
                return true;
            }
            return base.ProcessCmdKey(ref msg, keyData);
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

                if (DatabaseService.SettingsRepo != null && !DatabaseService.IsCorrupted)
                {
                    string autoClose = DatabaseService.SettingsRepo.Get("backup_auto_on_close", "1");
                    if (autoClose == "1" && DatabaseService.Backup != null)
                    {
                        if (e.CloseReason == CloseReason.WindowsShutDown || e.CloseReason == CloseReason.TaskManagerClosing)
                        {
                            // Windows kills a slow app during shutdown; a half-written backup is worse than none (periodic backups still exist)
                            Logger.Warn("تم تخطي النسخ الاحتياطي التلقائي عند الإغلاق لأن ويندوز يغلق البرنامج (سبب الإغلاق: " + e.CloseReason + ").");
                        }
                        else
                        {
                            RunCloseBackupWithTimeout();
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Logger.Warn("فشل النسخ الاحتياطي التلقائي عند إغلاق البرنامج: " + ex.Message);
            }
            finally
            {
                // Marks a clean shutdown so the next startup can skip the slow full integrity check
                DatabaseService.MarkCleanShutdown();

                // Explicitly dispose WebView2 so user profile lock is released cleanly
                if (_webView != null)
                {
                    try
                    {
                        _webView.Dispose();
                        _webView = null;
                    }
                    catch { }
                }
            }
        }

        private void RunCloseBackupWithTimeout()
        {
            BackupService backup = DatabaseService.Backup;
            Exception backupError = null;
            BackupResult backupResult = null;
            Stopwatch watch = Stopwatch.StartNew();
            System.Threading.Thread worker = new System.Threading.Thread(delegate()
            {
                try
                {
                    backupResult = backup.CreateBackup(null);
                }
                catch (Exception workerEx)
                {
                    backupError = workerEx;
                }
            });
            worker.IsBackground = true;
            worker.Name = "RafiqCloseBackup";
            worker.Start();

            if (!worker.Join(CloseBackupTimeoutMs))
            {
                Logger.Warn(string.Format("النسخ الاحتياطي التلقائي عند الإغلاق تجاوز المهلة ({0} ثانية) وسيتم إغلاق البرنامج دون انتظاره؛ قد يكون ملف النسخة الأخيرة غير مكتمل وسيُستبدل بالنسخ الدوري التالي.", CloseBackupTimeoutMs / 1000));
                return;
            }

            if (backupError != null)
            {
                Logger.Warn("فشل النسخ الاحتياطي التلقائي عند إغلاق البرنامج: " + backupError.Message);
            }
            else if (backupResult != null && !backupResult.Success)
            {
                Logger.Warn("لم يكتمل النسخ الاحتياطي التلقائي عند إغلاق البرنامج: " + backupResult.Message);
            }
            else
            {
                Logger.Info(string.Format("اكتمل النسخ الاحتياطي التلقائي عند الإغلاق خلال {0} مللي ثانية.", watch.ElapsedMilliseconds));
            }
        }
    }
}
