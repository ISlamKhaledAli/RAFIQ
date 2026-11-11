using System;
using System.IO;

namespace RafiqPOS.Data
{
    // Zero-fills a file before deleting it (best effort: SSD wear levelling, shadow copies and file-system journals can keep old blocks).
    // Used for every plaintext leftover (decrypted staging copies, plain originals, plain working files).
    internal static class SecureDelete
    {
        // Wipes and deletes the file itself; throws when it cannot (the caller decides whether that is fatal).
        internal static void WipeAndDelete(string path)
        {
            if (string.IsNullOrEmpty(path) || !File.Exists(path)) return;
            try
            {
                File.SetAttributes(path, FileAttributes.Normal);
            }
            catch (IOException) { }
            catch (UnauthorizedAccessException) { }

            long length = new FileInfo(path).Length;
            using (FileStream fs = new FileStream(path, FileMode.Open, FileAccess.Write, FileShare.None))
            {
                byte[] zeros = new byte[64 * 1024];
                long written = 0;
                while (written < length)
                {
                    int n = (int)Math.Min(zeros.Length, length - written);
                    fs.Write(zeros, 0, n);
                    written += n;
                }
                fs.Flush(true);
            }
            File.Delete(path);
        }

        // Zero-fills every readable plain SQLite file (and its -wal/-shm/-journal companions) under a staging folder before the folder is deleted.
        internal static void WipePlainSqliteFiles(string folder)
        {
            if (string.IsNullOrEmpty(folder) || !Directory.Exists(folder)) return;
            try
            {
                foreach (string file in Directory.GetFiles(folder, "*", SearchOption.AllDirectories))
                {
                    try
                    {
                        if (DatabaseKeyProvider.IsPlainSqliteFile(file)) WipeAndDeleteQuietly(file);
                    }
                    catch (IOException) { }
                    catch (UnauthorizedAccessException) { }
                }
            }
            catch (IOException) { }
            catch (UnauthorizedAccessException) { }
        }

        // The file and its SQLite companions (-wal, -shm, -journal); never throws, returns false when something could not be removed.
        internal static bool WipeAndDeleteQuietly(string path)
        {
            bool ok = true;
            string[] suffixes = new string[] { "", "-wal", "-shm", "-journal" };
            for (int i = 0; i < suffixes.Length; i++)
            {
                try
                {
                    WipeAndDelete(path + suffixes[i]);
                }
                catch (IOException) { ok = false; }
                catch (UnauthorizedAccessException) { ok = false; }
            }
            return ok;
        }
    }
}
