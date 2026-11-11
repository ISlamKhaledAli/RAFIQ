// Harness-only replacement for desktop/MainForm.cs (WinForms + WebView2 window, excluded from the portable build).
// Instance stays null, which is exactly what the host sees when no window exists (headless / CLI self-test runs).
using System;

namespace RafiqPOS
{
    public class MainForm : System.Windows.Forms.Form
    {
        public MainForm() { }
        public MainForm(bool isDemoError) { }

        public static MainForm Instance { get { return null; } }
        public static void SaveThemePreference(string theme) { }
        public bool TryShowPrintDialog(string kind, out string error) { error = "no UI"; return false; }
        public void NotifyAppReady(string theme) { }
        public void ToggleFullscreen() { }
        public bool IsFullscreen() { return false; }
        public byte[] RenderPagePdf(bool landscape, int timeoutMs, out string error) { error = "no UI"; return null; }
    }
}
