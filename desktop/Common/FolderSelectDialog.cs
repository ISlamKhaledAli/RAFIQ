using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace RafiqPOS.Common
{
    /// <summary>
    /// Senior Modern Folder Browser Dialog for .NET Framework 4.8.
    /// Uses native Windows Common Item Dialog (IFileOpenDialog with FOS_PICKFOLDERS)
    /// available in Windows 7 SP1, 8, 10, and 11 to display the modern Windows Explorer
    /// folder selection window instead of the legacy 1995 SHBrowseForFolder tree view.
    /// Gracefully falls back to FolderBrowserDialog if COM fails on any legacy environment.
    /// Strictly complies with C# 5.0 syntax for Windows 7 toolchain compatibility.
    /// </summary>
    public class FolderSelectDialog : IDisposable
    {
        public string Title { get; set; }
        public string InitialDirectory { get; set; }
        public string OkButtonLabel { get; set; }
        public string SelectedPath { get; set; }

        public FolderSelectDialog()
        {
            this.Title = "اختر المجلد";
            this.InitialDirectory = null;
            this.OkButtonLabel = "اختيار هذا المجلد";
            this.SelectedPath = null;
        }

        public DialogResult ShowDialog()
        {
            return ShowDialog(IntPtr.Zero);
        }

        public DialogResult ShowDialog(IntPtr ownerHandle)
        {
            if (ownerHandle == IntPtr.Zero)
            {
                if (Application.OpenForms.Count > 0 && Application.OpenForms[0] != null)
                {
                    try
                    {
                        ownerHandle = Application.OpenForms[0].Handle;
                    }
                    catch
                    {
                        ownerHandle = IntPtr.Zero;
                    }
                }
            }

            try
            {
                return ShowModernDialog(ownerHandle);
            }
            catch (Exception ex)
            {
                Logger.Warn("Modern IFileOpenDialog unavailable or failed: " + ex.Message + " -> falling back to FolderBrowserDialog.");
                return ShowLegacyDialog(ownerHandle);
            }
        }

        private DialogResult ShowModernDialog(IntPtr ownerHandle)
        {
            IFileOpenDialog dialog = null;
            try
            {
                dialog = (IFileOpenDialog)new FileOpenDialogRCW();

                uint options = 0;
                dialog.GetOptions(out options);
                options |= (FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM | FOS_PATHMUSTEXIST | FOS_NOCHANGEDIR);
                dialog.SetOptions(options);

                if (!string.IsNullOrEmpty(this.Title))
                {
                    dialog.SetTitle(this.Title);
                }

                if (!string.IsNullOrEmpty(this.OkButtonLabel))
                {
                    dialog.SetOkButtonLabel(this.OkButtonLabel);
                }

                // If initial directory is specified and exists, navigate to it
                if (!string.IsNullOrEmpty(this.InitialDirectory))
                {
                    string targetInit = this.InitialDirectory;
                    if (!Directory.Exists(targetInit))
                    {
                        try
                        {
                            string parent = Path.GetDirectoryName(targetInit);
                            if (!string.IsNullOrEmpty(parent) && Directory.Exists(parent))
                            {
                                targetInit = parent;
                            }
                            else
                            {
                                string root = Path.GetPathRoot(targetInit);
                                if (!string.IsNullOrEmpty(root) && Directory.Exists(root))
                                {
                                    targetInit = root;
                                }
                            }
                        }
                        catch
                        {
                            targetInit = null;
                        }
                    }

                    if (!string.IsNullOrEmpty(targetInit) && Directory.Exists(targetInit))
                    {
                        Guid iidShellItem = new Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE");
                        IShellItem initialItem = null;
                        int hr = SHCreateItemFromParsingName(targetInit, IntPtr.Zero, ref iidShellItem, out initialItem);
                        if (hr == 0 && initialItem != null)
                        {
                            dialog.SetFolder(initialItem);
                            dialog.SetDefaultFolder(initialItem);
                        }
                    }
                }

                int showResult = dialog.Show(ownerHandle);
                if (showResult == S_OK)
                {
                    IShellItem resultItem = null;
                    dialog.GetResult(out resultItem);
                    if (resultItem != null)
                    {
                        string path = null;
                        resultItem.GetDisplayName(SIGDN_FILESYSPATH, out path);
                        if (!string.IsNullOrEmpty(path))
                        {
                            this.SelectedPath = path;
                            return DialogResult.OK;
                        }
                    }
                }
                else if (showResult == ERROR_CANCELLED)
                {
                    return DialogResult.Cancel;
                }

                return DialogResult.Cancel;
            }
            finally
            {
                if (dialog != null)
                {
                    Marshal.ReleaseComObject(dialog);
                }
            }
        }

        private DialogResult ShowLegacyDialog(IntPtr ownerHandle)
        {
            using (var fbd = new FolderBrowserDialog())
            {
                fbd.Description = !string.IsNullOrEmpty(this.Title) ? this.Title : "اختر المجلد";
                fbd.ShowNewFolderButton = true;
                if (!string.IsNullOrEmpty(this.InitialDirectory) && Directory.Exists(this.InitialDirectory))
                {
                    fbd.SelectedPath = this.InitialDirectory;
                }

                DialogResult result;
                if (ownerHandle != IntPtr.Zero)
                {
                    result = fbd.ShowDialog(new WindowWrapper(ownerHandle));
                }
                else
                {
                    result = fbd.ShowDialog();
                }

                if (result == DialogResult.OK)
                {
                    this.SelectedPath = fbd.SelectedPath;
                    return DialogResult.OK;
                }

                return DialogResult.Cancel;
            }
        }

        public void Dispose()
        {
            // No unmanaged resources held directly
        }

        #region Helper WindowWrapper
        public class WindowWrapper : IWin32Window
        {
            private readonly IntPtr _hwnd;
            public WindowWrapper(IntPtr hwnd)
            {
                _hwnd = hwnd;
            }
            public IntPtr Handle
            {
                get { return _hwnd; }
            }
        }
        #endregion

        #region Native COM Definitions
        private const uint FOS_PICKFOLDERS = 0x00000020;
        private const uint FOS_FORCEFILESYSTEM = 0x00000040;
        private const uint FOS_NOCHANGEDIR = 0x00000008;
        private const uint FOS_PATHMUSTEXIST = 0x00000800;
        private const uint SIGDN_FILESYSPATH = 0x80058000;
        private const int S_OK = 0;
        private const int ERROR_CANCELLED = unchecked((int)0x800704C7);

        [DllImport("shell32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern int SHCreateItemFromParsingName(
            [In, MarshalAs(UnmanagedType.LPWStr)] string pszPath,
            [In] IntPtr pbc,
            [In] ref Guid riid,
            [Out, MarshalAs(UnmanagedType.Interface)] out IShellItem ppv);

        [ComImport]
        [Guid("DC1C5A9C-E88A-4dde-A5A1-60F82A20AEF7")]
        [ClassInterface(ClassInterfaceType.None)]
        [TypeLibType(TypeLibTypeFlags.FCanCreate)]
        private class FileOpenDialogRCW
        {
        }

        [ComImport]
        [Guid("d57c7288-d4ad-4768-be02-9d969532d960")]
        [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        private interface IFileOpenDialog
        {
            // IModalWindow
            [PreserveSig]
            int Show([In] IntPtr parent);

            // IFileDialog
            void SetFileTypes([In] uint cFileTypes, [In] IntPtr rgFilterSpec);
            void SetFileTypeIndex([In] uint iFileType);
            void GetFileTypeIndex(out uint piFileType);
            void Advise([In, MarshalAs(UnmanagedType.Interface)] IntPtr pfde, out uint pdwCookie);
            void Unadvise([In] uint dwCookie);
            void SetOptions([In] uint fos);
            void GetOptions(out uint pfos);
            void SetDefaultFolder([In, MarshalAs(UnmanagedType.Interface)] IShellItem psi);
            void SetFolder([In, MarshalAs(UnmanagedType.Interface)] IShellItem psi);
            void GetFolder([MarshalAs(UnmanagedType.Interface)] out IShellItem ppsi);
            void GetCurrentSelection([MarshalAs(UnmanagedType.Interface)] out IShellItem ppsi);
            void SetFileName([In, MarshalAs(UnmanagedType.LPWStr)] string pszName);
            void GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string pszName);
            void SetTitle([In, MarshalAs(UnmanagedType.LPWStr)] string pszTitle);
            void SetOkButtonLabel([In, MarshalAs(UnmanagedType.LPWStr)] string pszText);
            void SetFileNameLabel([In, MarshalAs(UnmanagedType.LPWStr)] string pszLabel);
            void GetResult([MarshalAs(UnmanagedType.Interface)] out IShellItem ppsi);
            void AddPlace([In, MarshalAs(UnmanagedType.Interface)] IShellItem psi, int fdap);
            void SetDefaultExtension([In, MarshalAs(UnmanagedType.LPWStr)] string pszDefaultExtension);
            void Close([MarshalAs(UnmanagedType.Error)] int hr);
            void SetClientGuid([In] ref Guid guid);
            void ClearClientData();
            void SetFilter([MarshalAs(UnmanagedType.Interface)] IntPtr pFilter);

            // IFileOpenDialog
            void GetResults([MarshalAs(UnmanagedType.Interface)] out IntPtr ppenum);
            void GetSelectedItems([MarshalAs(UnmanagedType.Interface)] out IntPtr ppsai);
        }

        [ComImport]
        [Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE")]
        [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        private interface IShellItem
        {
            void BindToHandler([In, MarshalAs(UnmanagedType.Interface)] IntPtr pbc, [In] ref Guid bhid, [In] ref Guid riid, out IntPtr ppv);
            void GetParent([MarshalAs(UnmanagedType.Interface)] out IShellItem ppsi);
            void GetDisplayName([In] uint sigdnName, [MarshalAs(UnmanagedType.LPWStr)] out string ppszName);
            void GetAttributes([In] uint sfgaoMask, out uint psfgaoAttribs);
            void Compare([In, MarshalAs(UnmanagedType.Interface)] IShellItem psi, [In] uint hint, out int piOrder);
        }
        #endregion
    }
}
