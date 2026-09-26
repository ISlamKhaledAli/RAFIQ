using System;
using System.IO;
using System.Security.AccessControl;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Win32;
using RafiqPOS.Common;

namespace RafiqPOS.Services
{
    public class EncryptionService
    {
        // 8-byte magic header: 'R', 'A', 'F', 'I', 'Q', '_', 'E', 0x01
        private static readonly byte[] MAGIC_HEADER = new byte[] { 0x52, 0x41, 0x46, 0x49, 0x51, 0x5F, 0x45, 0x01 };
        private static readonly byte[] APP_SALT = Encoding.UTF8.GetBytes("RafiqPOS_Security_Salt_Win7_v1");

        private readonly byte[] _aesKey;
        private readonly byte[] _hmacKey;
        private readonly string _deviceFingerprint;

        public string DeviceFingerprint
        {
            get { return _deviceFingerprint; }
        }

        public EncryptionService()
        {
            _deviceFingerprint = GenerateDeviceFingerprint();

            // Derive 32-byte AES key and 32-byte HMAC key using PBKDF2 with 10,000 iterations
            using (var deriveBytes = new Rfc2898DeriveBytes(_deviceFingerprint, APP_SALT, 10000))
            {
                _aesKey = deriveBytes.GetBytes(32);
                _hmacKey = deriveBytes.GetBytes(32);
            }
        }

        /// <summary>
        /// Generates a machine-bound hardware fingerprint using Windows MachineGuid, MachineName, and ProcessorCount.
        /// Works consistently from Windows 7 SP1 to Windows 11 without admin rights.
        /// </summary>
        public static string GenerateDeviceFingerprint()
        {
            string machineGuid = null;
            try
            {
                using (var hklm = RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, RegistryView.Registry64))
                using (var key = hklm.OpenSubKey(@"SOFTWARE\Microsoft\Cryptography"))
                {
                    if (key != null)
                    {
                        object val = key.GetValue("MachineGuid");
                        if (val != null)
                        {
                            machineGuid = val.ToString();
                        }
                    }
                }
            }
            catch
            {
                // Fallback if 64-bit view fails on 32-bit OS
            }

            if (string.IsNullOrEmpty(machineGuid))
            {
                try
                {
                    using (var key = Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Microsoft\Cryptography"))
                    {
                        if (key != null)
                        {
                            object val = key.GetValue("MachineGuid");
                            if (val != null)
                            {
                                machineGuid = val.ToString();
                            }
                        }
                    }
                }
                catch
                {
                    // Fallback to hardware environment variables
                }
            }

            if (string.IsNullOrEmpty(machineGuid))
            {
                machineGuid = "RAFIQ_DEFAULT_HARDWARE_GUID";
            }

            string rawId = string.Format("{0}|{1}|{2}", machineGuid, Environment.MachineName, Environment.ProcessorCount);

            using (var sha = SHA256.Create())
            {
                byte[] hash = sha.ComputeHash(Encoding.UTF8.GetBytes(rawId));
                StringBuilder sb = new StringBuilder("RAFIQ-DEV-");
                for (int i = 0; i < hash.Length; i++)
                {
                    sb.Append(hash[i].ToString("X2"));
                }
                return sb.ToString();
            }
        }

        /// <summary>
        /// Checks if a given file has the Rafiq encryption header
        /// </summary>
        public static bool IsFileEncrypted(string filePath)
        {
            if (string.IsNullOrEmpty(filePath) || !File.Exists(filePath))
            {
                return false;
            }

            try
            {
                using (var fs = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
                {
                    if (fs.Length < MAGIC_HEADER.Length)
                    {
                        return false;
                    }

                    byte[] header = new byte[MAGIC_HEADER.Length];
                    int bytesRead = fs.Read(header, 0, header.Length);
                    if (bytesRead < MAGIC_HEADER.Length)
                    {
                        return false;
                    }

                    for (int i = 0; i < MAGIC_HEADER.Length; i++)
                    {
                        if (header[i] != MAGIC_HEADER[i])
                        {
                            return false;
                        }
                    }
                    return true;
                }
            }
            catch
            {
                return false;
            }
        }

        /// <summary>
        /// Encrypts an unencrypted file using AES-256-CBC and HMAC-SHA256 signature
        /// Format: [MAGIC_HEADER (8 bytes)] [IV (16 bytes)] [HMAC-SHA256 (32 bytes)] [CIPHERTEXT]
        /// </summary>
        public void EncryptFile(string sourceFilePath, string targetEncryptedPath)
        {
            if (!File.Exists(sourceFilePath))
            {
                throw new FileNotFoundException("ملف المصدر غير موجود لتشفيره: " + sourceFilePath);
            }

            byte[] iv = new byte[16];
            using (var rng = new RNGCryptoServiceProvider())
            {
                rng.GetBytes(iv);
            }

            string tempTarget = targetEncryptedPath + ".tmp";
            try
            {
                using (var sourceStream = new FileStream(sourceFilePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
                using (var targetStream = new FileStream(tempTarget, FileMode.Create, FileAccess.Write, FileShare.None))
                {
                    // 1. Write Header and IV
                    targetStream.Write(MAGIC_HEADER, 0, MAGIC_HEADER.Length);
                    targetStream.Write(iv, 0, iv.Length);

                    // Reserve 32 bytes for HMAC
                    long hmacPosition = targetStream.Position;
                    byte[] emptyHmac = new byte[32];
                    targetStream.Write(emptyHmac, 0, emptyHmac.Length);

                    // 2. Encrypt plaintext into targetStream
                    using (var aes = new RijndaelManaged())
                    {
                        aes.KeySize = 256;
                        aes.BlockSize = 128;
                        aes.Mode = CipherMode.CBC;
                        aes.Padding = PaddingMode.PKCS7;
                        aes.Key = _aesKey;
                        aes.IV = iv;

                        using (var encryptor = aes.CreateEncryptor())
                        using (var cryptoStream = new CryptoStream(targetStream, encryptor, CryptoStreamMode.Write))
                        {
                            byte[] buffer = new byte[64 * 1024];
                            int read;
                            while ((read = sourceStream.Read(buffer, 0, buffer.Length)) > 0)
                            {
                                cryptoStream.Write(buffer, 0, read);
                            }
                            cryptoStream.FlushFinalBlock();
                        }
                    }
                }

                // 3. Compute and write HMAC over ciphertext (Encrypt-then-MAC)
                using (var hmac = new HMACSHA256(_hmacKey))
                using (var targetStream = new FileStream(tempTarget, FileMode.Open, FileAccess.ReadWrite, FileShare.None))
                {
                    // Start computing HMAC from after the 32-byte HMAC placeholder
                    targetStream.Seek(MAGIC_HEADER.Length + iv.Length + 32, SeekOrigin.Begin);
                    byte[] computedHmac = hmac.ComputeHash(targetStream);

                    // Seek back and overwrite HMAC placeholder
                    targetStream.Seek(MAGIC_HEADER.Length + iv.Length, SeekOrigin.Begin);
                    targetStream.Write(computedHmac, 0, computedHmac.Length);
                }

                if (File.Exists(targetEncryptedPath))
                {
                    File.Delete(targetEncryptedPath);
                }
                File.Move(tempTarget, targetEncryptedPath);
            }
            finally
            {
                if (File.Exists(tempTarget))
                {
                    try { File.Delete(tempTarget); } catch { }
                }
            }
        }

        /// <summary>
        /// Decrypts a Rafiq encrypted file back to its original plain format
        /// </summary>
        public void DecryptFile(string sourceEncryptedPath, string targetDecryptedPath)
        {
            if (!File.Exists(sourceEncryptedPath))
            {
                throw new FileNotFoundException("ملف النسخة المشفرة غير موجود: " + sourceEncryptedPath);
            }

            using (var sourceStream = new FileStream(sourceEncryptedPath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
            {
                // Verify magic header
                byte[] header = new byte[MAGIC_HEADER.Length];
                int hRead = sourceStream.Read(header, 0, header.Length);
                if (hRead < MAGIC_HEADER.Length)
                {
                    throw new InvalidDataException("الملف تالف أو غير صالح للتشفير.");
                }

                for (int i = 0; i < MAGIC_HEADER.Length; i++)
                {
                    if (header[i] != MAGIC_HEADER[i])
                    {
                        throw new InvalidDataException("الملف ليس بصيغة رفيق المشفرة المعتمدة.");
                    }
                }

                // Read IV
                byte[] iv = new byte[16];
                int ivRead = sourceStream.Read(iv, 0, iv.Length);
                if (ivRead < iv.Length)
                {
                    throw new InvalidDataException("رأس التشفير للملف غير مكتمل.");
                }

                // Read stored HMAC
                byte[] storedHmac = new byte[32];
                int hmacRead = sourceStream.Read(storedHmac, 0, storedHmac.Length);
                if (hmacRead < storedHmac.Length)
                {
                    throw new InvalidDataException("توقيع التحقق من التشفير مفقود.");
                }

                long ciphertextStart = sourceStream.Position;

                // Verify HMAC integrity before decrypting
                using (var hmac = new HMACSHA256(_hmacKey))
                {
                    byte[] computedHmac = hmac.ComputeHash(sourceStream);
                    if (!ConstantTimeEquals(storedHmac, computedHmac))
                    {
                        throw new CryptographicException("فشل التحقق من صحة التشفير! الملف إما تالف أو تم تعديله خارج النظام أو أُخذ من جهاز مختلف.");
                    }
                }

                // Decrypt ciphertext to destination
                sourceStream.Seek(ciphertextStart, SeekOrigin.Begin);

                string tempDecrypted = targetDecryptedPath + ".tmp";
                try
                {
                    using (var targetStream = new FileStream(tempDecrypted, FileMode.Create, FileAccess.Write, FileShare.None))
                    using (var aes = new RijndaelManaged())
                    {
                        aes.KeySize = 256;
                        aes.BlockSize = 128;
                        aes.Mode = CipherMode.CBC;
                        aes.Padding = PaddingMode.PKCS7;
                        aes.Key = _aesKey;
                        aes.IV = iv;

                        using (var decryptor = aes.CreateDecryptor())
                        using (var cryptoStream = new CryptoStream(sourceStream, decryptor, CryptoStreamMode.Read))
                        {
                            byte[] buffer = new byte[64 * 1024];
                            int read;
                            while ((read = cryptoStream.Read(buffer, 0, buffer.Length)) > 0)
                            {
                                targetStream.Write(buffer, 0, read);
                            }
                        }
                    }

                    if (File.Exists(targetDecryptedPath))
                    {
                        File.Delete(targetDecryptedPath);
                    }
                    File.Move(tempDecrypted, targetDecryptedPath);
                }
                finally
                {
                    if (File.Exists(tempDecrypted))
                    {
                        try { File.Delete(tempDecrypted); } catch { }
                    }
                }
            }
        }

        /// <summary>
        /// Restricts directory and file permissions in production to avoid unauthorized local user tampering.
        /// </summary>
        public static void ProtectDatabaseFolderAcl(string folderPath)
        {
            try
            {
                if (!Directory.Exists(folderPath))
                {
                    Directory.CreateDirectory(folderPath);
                }

                var dInfo = new DirectoryInfo(folderPath);
                var dSecurity = dInfo.GetAccessControl();
                dSecurity.SetAccessRuleProtection(false, true);
                dInfo.SetAccessControl(dSecurity);
            }
            catch (Exception ex)
            {
                Logger.Warn("تعذر تعيين قيود الأمان المتقدمة على مجلد البيانات: " + ex.Message);
            }
        }

        private static bool ConstantTimeEquals(byte[] a, byte[] b)
        {
            if (a == null || b == null || a.Length != b.Length)
            {
                return false;
            }

            int diff = 0;
            for (int i = 0; i < a.Length; i++)
            {
                diff |= (a[i] ^ b[i]);
            }
            return diff == 0;
        }
    }
}
