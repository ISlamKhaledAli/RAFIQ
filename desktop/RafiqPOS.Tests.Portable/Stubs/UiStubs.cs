// Harness-only stand-ins for UI types the host references but the portable run never shows.
// Real WinForms/WebView2 are Windows-only; these members exist just so the non-UI host sources compile on net8.0.
using System;
using System.Collections.Generic;

namespace System.Windows.Forms
{
    public enum DialogResult { None, OK, Cancel }

    public interface IWin32Window
    {
        IntPtr Handle { get; }
    }

    public enum FormWindowState { Normal, Minimized, Maximized }

    public class Form : IDisposable
    {
        public bool IsDisposed { get { return false; } }
        public FormWindowState WindowState { get; set; }
        public IntPtr Handle { get { return IntPtr.Zero; } }
        public bool TopMost { get; set; }
        public void Activate() { }
        public void BringToFront() { }
        public void Close() { }
        public object Invoke(Delegate method) { return method.DynamicInvoke(); }
        public void Dispose() { }
    }

    public class FormCollection
    {
        public int Count { get { return 0; } }
        public Form this[int index] { get { return null; } }
    }

    public static class Application
    {
        public static FormCollection OpenForms { get { return new FormCollection(); } }
        public static void DoEvents() { }
        public static void EnableVisualStyles() { }
        public static void SetCompatibleTextRenderingDefault(bool defaultValue) { }
        public static void SetUnhandledExceptionMode(UnhandledExceptionMode mode) { }
        public static void Run(Form form) { }
        public static event System.Threading.ThreadExceptionEventHandler ThreadException;
    }

    public enum UnhandledExceptionMode { Automatic, ThrowException, CatchException }
    public enum MessageBoxButtons { OK }
    public enum MessageBoxIcon { None, Error, Warning, Information }

    public static class MessageBox
    {
        public static DialogResult Show(string text, string caption, MessageBoxButtons buttons, MessageBoxIcon icon)
        {
            Console.Error.WriteLine("[MessageBox] " + caption + ": " + text);
            return DialogResult.OK;
        }
    }

    public class FolderBrowserDialog : IDisposable
    {
        public string Description { get; set; }
        public string SelectedPath { get; set; }
        public bool ShowNewFolderButton { get; set; }
        public DialogResult ShowDialog() { return DialogResult.Cancel; }
        public DialogResult ShowDialog(IWin32Window owner) { return DialogResult.Cancel; }
        public void Dispose() { }
    }

    public class OpenFileDialog : IDisposable
    {
        public string Title { get; set; }
        public string Filter { get; set; }
        public string FileName { get; set; }
        public string InitialDirectory { get; set; }
        public bool CheckFileExists { get; set; }
        public bool Multiselect { get; set; }
        public DialogResult ShowDialog() { return DialogResult.Cancel; }
        public DialogResult ShowDialog(IWin32Window owner) { return DialogResult.Cancel; }
        public void Dispose() { }
    }

    public class SaveFileDialog : OpenFileDialog
    {
    }

    public class Screen
    {
        public System.Drawing.Rectangle Bounds { get { return new System.Drawing.Rectangle(0, 0, 1366, 768); } }
        public static Screen PrimaryScreen { get { return new Screen(); } }
        public static Screen[] AllScreens { get { return new Screen[] { new Screen() }; } }
    }
}

namespace Microsoft.Web.WebView2.Core
{
    public static class CoreWebView2Environment
    {
        public static string GetAvailableBrowserVersionString()
        {
            throw new PlatformNotSupportedException("WebView2 is not available in the portable harness");
        }
    }
}

namespace System.Threading
{
    public delegate void ThreadExceptionEventHandler(object sender, ThreadExceptionEventArgs e);

    public class ThreadExceptionEventArgs : EventArgs
    {
        public ThreadExceptionEventArgs(Exception t) { Exception = t; }
        public Exception Exception { get; private set; }
    }
}
