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
        // 8-byte legacy magic header: 'R', 'A', 'F', 'I', 'Q', '_', 'E', 0x01
        private static readonly byte[] MAGIC_HEADER = new byte[] { 0x52, 0x41, 0x46, 0x49, 0x51, 0x5F, 0x45, 0x01 };

        // RFBK v2 Magic Header (F-42): 'R', 'F', 'B', 'K'
        private static readonly byte[] RFBK_MAGIC = new byte[] { 0x52, 0x46, 0x42, 0x4B };
        private static readonly byte[] RFBK_VERSION = new byte[] { 0x00, 0x02 };

        private static readonly byte[] APP_SALT = Encoding.UTF8.GetBytes("RafiqPOS_Security_Salt_Win7_v1");

        private readonly byte[] _aesKey;
        private readonly byte[] _hmacKey;
        private readonly string _deviceFingerprint;

        public string DeviceFingerprint
        {
            get { return _deviceFingerprint; }
        }

        public byte[] AesKey
        {
            get { return _aesKey; }
        }

        public EncryptionService() : this(null)
        {
        }

        public EncryptionService(string customKeyOrPassword)
        {
            _deviceFingerprint = GenerateDeviceFingerprint();
            string keyMaterial = !string.IsNullOrEmpty(customKeyOrPassword)
                ? customKeyOrPassword
                : _deviceFingerprint;

            DeriveKeys(keyMaterial, out _aesKey, out _hmacKey);
        }

        public static void DeriveKeys(string keyMaterial, out byte[] aesKey, out byte[] hmacKey)
        {
            using (var deriveBytes = new Rfc2898DeriveBytes(keyMaterial, APP_SALT, 10000))
            {
                aesKey = deriveBytes.GetBytes(32);
                hmacKey = deriveBytes.GetBytes(32);
            }
        }

        public static void DeriveKeyFromRecoveryCode(string recoveryCode, byte[] salt, out byte[] aesKey, out byte[] hmacKey)
        {
            if (string.IsNullOrEmpty(recoveryCode))
            {
                throw new ArgumentException("كود الاسترجاع لا يمكن أن يكون فارغاً.", "recoveryCode");
            }
            if (salt == null || salt.Length < 16)
            {
                throw new ArgumentException("ملح التشفير غير صالح.", "salt");
            }

            string normalized = NormalizeRecoveryCode(recoveryCode);
            using (var deriveBytes = new Rfc2898DeriveBytes(normalized, salt, 100000))
            {
                aesKey = deriveBytes.GetBytes(32);
                hmacKey = deriveBytes.GetBytes(32);
            }
        }

        public static string NormalizeRecoveryCode(string code)
        {
            if (string.IsNullOrEmpty(code)) return string.Empty;
            return code.Replace("-", "").Replace(" ", "").Trim().ToUpperInvariant();
        }

        public static string GenerateRecoveryCode()
        {
            const string chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // exclude 0, 1, I, O to avoid handwriting confusion
            byte[] bytes = new byte[12];
            using (var rng = new RNGCryptoServiceProvider())
            {
                rng.GetBytes(bytes);
            }
            char[] result = new char[12];
            for (int i = 0; i < 12; i++)
            {
                result[i] = chars[bytes[i] % chars.Length];
            }
            return string.Format("{0}-{1}-{2}",
                new string(result, 0, 4),
                new string(result, 4, 4),
                new string(result, 8, 4));
        }

        public static string HashRecoveryCode(string recoveryCode)
        {
            string normalized = NormalizeRecoveryCode(recoveryCode);
            using (var sha = SHA256.Create())
            {
                byte[] hash = sha.ComputeHash(Encoding.UTF8.GetBytes(normalized));
                StringBuilder sb = new StringBuilder();
                for (int i = 0; i < hash.Length; i++)
                {
                    sb.Append(hash[i].ToString("x2"));
                }
                return sb.ToString();
            }
        }

        public static string GetRawMachineGuid()
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
            return machineGuid;
        }

        /// <summary>
        /// Generates a stable machine-bound hardware fingerprint using Windows MachineGuid only (F-42).
        /// Removes MachineName and ProcessorCount so machine renaming and CPU upgrades do not invalidate backups.
        /// Works consistently from Windows 7 SP1 to Windows 11 without admin rights.
        /// </summary>
        public static string GenerateDeviceFingerprint()
        {
            string machineGuid = GetRawMachineGuid();
            string rawId = string.Format("{0}|RafiqPOS_Win7_HardwareSalt_v2", machineGuid);

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
        /// Legacy device fingerprint that includes MachineName and ProcessorCount for backward compatibility.
        /// </summary>
        public static string GenerateLegacyDeviceFingerprint()
        {
            string machineGuid = GetRawMachineGuid();
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

        public string EncryptString(string plainText)
        {
            if (string.IsNullOrEmpty(plainText)) return string.Empty;
            byte[] plainBytes = Encoding.UTF8.GetBytes(plainText);
            byte[] iv = new byte[16];
            using (var rng = new RNGCryptoServiceProvider())
            {
                rng.GetBytes(iv);
            }
            using (var aes = new RijndaelManaged())
            {
                aes.KeySize = 256;
                aes.BlockSize = 128;
                aes.Mode = CipherMode.CBC;
                aes.Padding = PaddingMode.PKCS7;
                aes.Key = _aesKey;
                aes.IV = iv;
                using (var enc = aes.CreateEncryptor())
                {
                    byte[] encrypted = enc.TransformFinalBlock(plainBytes, 0, plainBytes.Length);
                    byte[] result = new byte[iv.Length + encrypted.Length];
                    Buffer.BlockCopy(iv, 0, result, 0, iv.Length);
                    Buffer.BlockCopy(encrypted, 0, result, iv.Length, encrypted.Length);
                    return Convert.ToBase64String(result);
                }
            }
        }

        public string DecryptString(string cipherText)
        {
            if (string.IsNullOrEmpty(cipherText)) return string.Empty;
            byte[] cipherBytes = Convert.FromBase64String(cipherText);
            if (cipherBytes.Length < 16) return string.Empty;
            byte[] iv = new byte[16];
            Buffer.BlockCopy(cipherBytes, 0, iv, 0, 16);
            int encLength = cipherBytes.Length - 16;
            byte[] encrypted = new byte[encLength];
            Buffer.BlockCopy(cipherBytes, 16, encrypted, 0, encLength);

            using (var aes = new RijndaelManaged())
            {
                aes.KeySize = 256;
                aes.BlockSize = 128;
                aes.Mode = CipherMode.CBC;
                aes.Padding = PaddingMode.PKCS7;
                aes.Key = _aesKey;
                aes.IV = iv;
                using (var dec = aes.CreateDecryptor())
                {
                    byte[] plain = dec.TransformFinalBlock(encrypted, 0, encrypted.Length);
                    return Encoding.UTF8.GetString(plain);
                }
            }
        }

        /// <summary>
        /// Checks if a given file has the Rafiq encryption header (v2 RFBK or legacy v1)
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
                    if (fs.Length < 4) return false;
                    byte[] header = new byte[8];
                    int bytesRead = fs.Read(header, 0, 8);
                    if (bytesRead < 4) return false;

                    // 1. Check v2 RFBK
                    if (header[0] == RFBK_MAGIC[0] && header[1] == RFBK_MAGIC[1] &&
                        header[2] == RFBK_MAGIC[2] && header[3] == RFBK_MAGIC[3])
                    {
                        return true;
                    }

                    // 2. Check legacy v1 MAGIC_HEADER
                    if (bytesRead >= MAGIC_HEADER.Length)
                    {
                        bool legacyMatch = true;
                        for (int i = 0; i < MAGIC_HEADER.Length; i++)
                        {
                            if (header[i] != MAGIC_HEADER[i])
                            {
                                legacyMatch = false;
                                break;
                            }
                        }
                        if (legacyMatch) return true;
                    }

                    return false;
                }
            }
            catch
            {
                return false;
            }
        }

        /// <summary>
        /// Standard single-file encryption fallback using device-bound key (v1 legacy format).
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

                    // 3. Compute and write HMAC over ciphertext (Encrypt-then-MAC)
                    using (var hmac = new HMACSHA256(_hmacKey))
                    using (var verifyStream = new FileStream(tempTarget, FileMode.Open, FileAccess.ReadWrite, FileShare.None))
                    {
                        verifyStream.Seek(hmacPosition + 32, SeekOrigin.Begin);
                        byte[] computedHmac = hmac.ComputeHash(verifyStream);

                        verifyStream.Seek(hmacPosition, SeekOrigin.Begin);
                        verifyStream.Write(computedHmac, 0, computedHmac.Length);
                    }
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
        /// Dual-Wrap Envelope Encryption (F-42 & F-43).
        /// Format:
        /// [4 bytes: magic "RFBK"]
        /// [2 bytes: version = 2]
        /// [16 bytes: recovery salt]
        /// [48 bytes: device-wrapped data key (16 IV + 32 key)]
        /// [48 bytes: recovery-wrapped data key (16 IV + 32 key)]
        /// [32 bytes: HMAC of header]
        /// [16 bytes: payload IV]
        /// [32 bytes: payload HMAC]
        /// [... encrypted payload ...]
        /// </summary>
        public void EncryptFileDualWrap(string sourceFilePath, string targetEncryptedPath, string recoveryCode)
        {
            if (!File.Exists(sourceFilePath))
            {
                throw new FileNotFoundException("ملف المصدر غير موجود لتشفيره: " + sourceFilePath);
            }

            if (string.IsNullOrEmpty(recoveryCode))
            {
                recoveryCode = GenerateRecoveryCode();
            }

            // 1. Generate random 32-byte DataKey
            byte[] dataKey = new byte[32];
            using (var rng = new RNGCryptoServiceProvider())
            {
                rng.GetBytes(dataKey);
            }

            // 2. Generate random 16-byte recovery salt
            byte[] recoverySalt = new byte[16];
            using (var rng = new RNGCryptoServiceProvider())
            {
                rng.GetBytes(recoverySalt);
            }

            // 3. Wrap DataKey with Device Key (devIv 16 bytes + 32 bytes encrypted DataKey = 48 bytes)
            byte[] devIv = new byte[16];
            using (var rng = new RNGCryptoServiceProvider())
            {
                rng.GetBytes(devIv);
            }
            byte[] deviceWrappedKey = new byte[48];
            Buffer.BlockCopy(devIv, 0, deviceWrappedKey, 0, 16);
            using (var aes = new RijndaelManaged())
            {
                aes.KeySize = 256;
                aes.BlockSize = 128;
                aes.Mode = CipherMode.CBC;
                aes.Padding = PaddingMode.None;
                aes.Key = _aesKey;
                aes.IV = devIv;
                using (var enc = aes.CreateEncryptor())
                {
                    byte[] encKey = enc.TransformFinalBlock(dataKey, 0, dataKey.Length);
                    Buffer.BlockCopy(encKey, 0, deviceWrappedKey, 16, 32);
                }
            }

            // 4. Wrap DataKey with Recovery Key (recIv 16 bytes + 32 bytes encrypted DataKey = 48 bytes)
            byte[] recoveryWrappedKey = new byte[48];
            byte[] recAesKey;
            byte[] recHmacKey;
            DeriveKeyFromRecoveryCode(recoveryCode, recoverySalt, out recAesKey, out recHmacKey);

            byte[] recIv = new byte[16];
            using (var rng = new RNGCryptoServiceProvider())
            {
                rng.GetBytes(recIv);
            }
            Buffer.BlockCopy(recIv, 0, recoveryWrappedKey, 0, 16);
            using (var aes = new RijndaelManaged())
            {
                aes.KeySize = 256;
                aes.BlockSize = 128;
                aes.Mode = CipherMode.CBC;
                aes.Padding = PaddingMode.None;
                aes.Key = recAesKey;
                aes.IV = recIv;
                using (var enc = aes.CreateEncryptor())
                {
                    byte[] encKey = enc.TransformFinalBlock(dataKey, 0, dataKey.Length);
                    Buffer.BlockCopy(encKey, 0, recoveryWrappedKey, 16, 32);
                }
            }

            // 5. Build Header Pre-HMAC (4 + 2 + 16 + 48 + 48 = 118 bytes)
            byte[] headerPreHmac = new byte[118];
            Buffer.BlockCopy(RFBK_MAGIC, 0, headerPreHmac, 0, 4);
            Buffer.BlockCopy(RFBK_VERSION, 0, headerPreHmac, 4, 2);
            Buffer.BlockCopy(recoverySalt, 0, headerPreHmac, 6, 16);
            Buffer.BlockCopy(deviceWrappedKey, 0, headerPreHmac, 22, 48);
            Buffer.BlockCopy(recoveryWrappedKey, 0, headerPreHmac, 70, 48);

            // 6. Header HMAC (32 bytes) keyed with DataKey
            byte[] headerHmac;
            using (var hmac = new HMACSHA256(dataKey))
            {
                headerHmac = hmac.ComputeHash(headerPreHmac);
            }

            // 7. Payload IV (16 bytes)
            byte[] dataIv = new byte[16];
            using (var rng = new RNGCryptoServiceProvider())
            {
                rng.GetBytes(dataIv);
            }

            string tempTarget = targetEncryptedPath + ".tmp";
            try
            {
                using (var sourceStream = new FileStream(sourceFilePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
                using (var targetStream = new FileStream(tempTarget, FileMode.Create, FileAccess.Write, FileShare.None))
                {
                    targetStream.Write(headerPreHmac, 0, headerPreHmac.Length);
                    targetStream.Write(headerHmac, 0, headerHmac.Length);
                    targetStream.Write(dataIv, 0, dataIv.Length);

                    // Reserve 32 bytes for payload HMAC
                    long payloadHmacPos = targetStream.Position;
                    byte[] emptyHmac = new byte[32];
                    targetStream.Write(emptyHmac, 0, emptyHmac.Length);

                    // Encrypt payload stream
                    using (var aes = new RijndaelManaged())
                    {
                        aes.KeySize = 256;
                        aes.BlockSize = 128;
                        aes.Mode = CipherMode.CBC;
                        aes.Padding = PaddingMode.PKCS7;
                        aes.Key = dataKey;
                        aes.IV = dataIv;

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

                    // Compute payload HMAC over ciphertext
                    using (var hmac = new HMACSHA256(dataKey))
                    using (var verifyStream = new FileStream(tempTarget, FileMode.Open, FileAccess.ReadWrite, FileShare.None))
                    {
                        verifyStream.Seek(payloadHmacPos + 32, SeekOrigin.Begin);
                        byte[] computedPayloadHmac = hmac.ComputeHash(verifyStream);

                        verifyStream.Seek(payloadHmacPos, SeekOrigin.Begin);
                        verifyStream.Write(computedPayloadHmac, 0, computedPayloadHmac.Length);
                    }
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

        public void DecryptFile(string sourceEncryptedPath, string targetDecryptedPath)
        {
            DecryptFile(sourceEncryptedPath, targetDecryptedPath, null);
        }

        /// <summary>
        /// Decrypts a Rafiq encrypted file (supporting both v2 Dual-Wrap and v1 legacy formats).
        /// Automatically tries device key first, falling back to legacy fingerprint and recovery code.
        /// </summary>
        public void DecryptFile(string sourceEncryptedPath, string targetDecryptedPath, string fallbackKeyOrPassword)
        {
            if (!File.Exists(sourceEncryptedPath))
            {
                throw new FileNotFoundException("ملف النسخة المشفرة غير موجود: " + sourceEncryptedPath);
            }

            using (var sourceStream = new FileStream(sourceEncryptedPath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
            {
                if (sourceStream.Length < 4)
                {
                    throw new InvalidDataException("الملف تالف أو غير صالح للتشفير.");
                }

                byte[] checkMagic = new byte[4];
                int mRead = sourceStream.Read(checkMagic, 0, 4);
                if (mRead < 4)
                {
                    throw new InvalidDataException("رأس التشفير للملف غير مكتمل.");
                }

                // Check v2 RFBK
                if (checkMagic[0] == RFBK_MAGIC[0] && checkMagic[1] == RFBK_MAGIC[1] &&
                    checkMagic[2] == RFBK_MAGIC[2] && checkMagic[3] == RFBK_MAGIC[3])
                {
                    sourceStream.Seek(0, SeekOrigin.Begin);
                    DecryptFileDualWrap(sourceStream, targetDecryptedPath, fallbackKeyOrPassword);
                    return;
                }

                // Otherwise, check legacy v1
                sourceStream.Seek(0, SeekOrigin.Begin);
                DecryptFileLegacy(sourceStream, targetDecryptedPath, fallbackKeyOrPassword);
            }
        }

        private void DecryptFileDualWrap(FileStream sourceStream, string targetDecryptedPath, string fallbackRecoveryCode)
        {
            // Read 118 bytes header pre-HMAC
            byte[] headerPreHmac = new byte[118];
            int read = sourceStream.Read(headerPreHmac, 0, 118);
            if (read < 118)
            {
                throw new InvalidDataException("رأس حزمة التشفير الثنائي غير مكتمل.");
            }

            // Extract components:
            // 0..3: magic "RFBK"
            // 4..5: version
            byte[] recoverySalt = new byte[16];
            Buffer.BlockCopy(headerPreHmac, 6, recoverySalt, 0, 16);

            byte[] deviceWrappedKey = new byte[48];
            Buffer.BlockCopy(headerPreHmac, 22, deviceWrappedKey, 0, 48);

            byte[] recoveryWrappedKey = new byte[48];
            Buffer.BlockCopy(headerPreHmac, 70, recoveryWrappedKey, 0, 48);

            byte[] storedHeaderHmac = new byte[32];
            int hmacRead = sourceStream.Read(storedHeaderHmac, 0, 32);
            if (hmacRead < 32)
            {
                throw new InvalidDataException("توقيع التحقق من رأس التشفير مفقود.");
            }

            // Attempt to unwrap DataKey:
            byte[] dataKey = null;

            // Attempt 1: Unwrap using current device-bound key
            dataKey = TryUnwrapDataKey(deviceWrappedKey, _aesKey, headerPreHmac, storedHeaderHmac);

            // Attempt 2: If failed, try legacy device fingerprint (in case machine was upgraded before migration)
            if (dataKey == null)
            {
                byte[] legAes;
                byte[] legHmac;
                DeriveKeys(GenerateLegacyDeviceFingerprint(), out legAes, out legHmac);
                dataKey = TryUnwrapDataKey(deviceWrappedKey, legAes, headerPreHmac, storedHeaderHmac);
            }

            // Attempt 3: If failed and recovery code provided, unwrap using recovery key
            if (dataKey == null && !string.IsNullOrEmpty(fallbackRecoveryCode))
            {
                try
                {
                    byte[] recAes;
                    byte[] recHmac;
                    DeriveKeyFromRecoveryCode(fallbackRecoveryCode, recoverySalt, out recAes, out recHmac);
                    dataKey = TryUnwrapDataKey(recoveryWrappedKey, recAes, headerPreHmac, storedHeaderHmac);
                }
                catch
                {
                    // Invalid recovery code format
                }
            }

            if (dataKey == null)
            {
                if (string.IsNullOrEmpty(fallbackRecoveryCode))
                {
                    throw new CryptographicException("هذه النسخة مأخوذة من جهاز آخر أو تغيرت بيئة النظام. يرجى إدخال كود استرجاع الطوارئ (Recovery Code) للمتابعة.");
                }
                else
                {
                    throw new CryptographicException("كود استرجاع النسخ الاحتياطية غير صحيح.");
                }
            }

            // Read payload IV (16 bytes)
            byte[] dataIv = new byte[16];
            int ivRead = sourceStream.Read(dataIv, 0, 16);
            if (ivRead < 16)
            {
                throw new InvalidDataException("محدد تهيئة البيانات المشفرة مفقود.");
            }

            // Read payload stored HMAC (32 bytes)
            byte[] storedPayloadHmac = new byte[32];
            int pHmacRead = sourceStream.Read(storedPayloadHmac, 0, 32);
            if (pHmacRead < 32)
            {
                throw new InvalidDataException("توقيع سلامة محتوى الملف المشفر مفقود.");
            }

            long ciphertextStart = sourceStream.Position;

            // Verify payload HMAC
            using (var hmac = new HMACSHA256(dataKey))
            {
                sourceStream.Seek(ciphertextStart, SeekOrigin.Begin);
                byte[] computedPayloadHmac = hmac.ComputeHash(sourceStream);
                if (!ConstantTimeEquals(storedPayloadHmac, computedPayloadHmac))
                {
                    throw new CryptographicException("فشل التحقق من سلامة محتوى النسخة المشفرة! الملف إما تالف أو تم تعديله خارج النظام.");
                }
            }

            // Decrypt payload stream
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
                    aes.Key = dataKey;
                    aes.IV = dataIv;

                    using (var decryptor = aes.CreateDecryptor())
                    using (var cryptoStream = new CryptoStream(sourceStream, decryptor, CryptoStreamMode.Read))
                    {
                        byte[] buffer = new byte[64 * 1024];
                        int r;
                        while ((r = cryptoStream.Read(buffer, 0, buffer.Length)) > 0)
                        {
                            targetStream.Write(buffer, 0, r);
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

        private static byte[] TryUnwrapDataKey(byte[] wrappedKeyBytes, byte[] unwrapAesKey, byte[] headerPreHmac, byte[] expectedHmac)
        {
            if (wrappedKeyBytes == null || wrappedKeyBytes.Length < 48 || unwrapAesKey == null)
            {
                return null;
            }

            try
            {
                byte[] iv = new byte[16];
                Buffer.BlockCopy(wrappedKeyBytes, 0, iv, 0, 16);

                byte[] encKey = new byte[32];
                Buffer.BlockCopy(wrappedKeyBytes, 16, encKey, 0, 32);

                byte[] candidateDataKey = null;
                using (var aes = new RijndaelManaged())
                {
                    aes.KeySize = 256;
                    aes.BlockSize = 128;
                    aes.Mode = CipherMode.CBC;
                    aes.Padding = PaddingMode.None;
                    aes.Key = unwrapAesKey;
                    aes.IV = iv;
                    using (var dec = aes.CreateDecryptor())
                    {
                        candidateDataKey = dec.TransformFinalBlock(encKey, 0, encKey.Length);
                    }
                }

                if (candidateDataKey != null && candidateDataKey.Length == 32)
                {
                    using (var hmac = new HMACSHA256(candidateDataKey))
                    {
                        byte[] computed = hmac.ComputeHash(headerPreHmac);
                        if (ConstantTimeEquals(expectedHmac, computed))
                        {
                            return candidateDataKey;
                        }
                    }
                }
            }
            catch
            {
                // Decryption failure with mismatched key
            }
            return null;
        }

        private void DecryptFileLegacy(FileStream sourceStream, string targetDecryptedPath, string fallbackKeyOrPassword)
        {
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

            byte[] iv = new byte[16];
            int ivRead = sourceStream.Read(iv, 0, iv.Length);
            if (ivRead < iv.Length)
            {
                throw new InvalidDataException("رأس التشفير للملف غير مكتمل.");
            }

            byte[] storedHmac = new byte[32];
            int hmacRead = sourceStream.Read(storedHmac, 0, storedHmac.Length);
            if (hmacRead < storedHmac.Length)
            {
                throw new InvalidDataException("توقيع التحقق من التشفير مفقود.");
            }

            long ciphertextStart = sourceStream.Position;
            byte[] effectiveAesKey = _aesKey;
            bool hmacValid = false;

            // 1. Try with current device key
            using (var hmac = new HMACSHA256(_hmacKey))
            {
                byte[] computedHmac = hmac.ComputeHash(sourceStream);
                if (ConstantTimeEquals(storedHmac, computedHmac))
                {
                    hmacValid = true;
                }
            }

            // 2. Try with legacy device key
            if (!hmacValid)
            {
                byte[] legAes;
                byte[] legHmac;
                DeriveKeys(GenerateLegacyDeviceFingerprint(), out legAes, out legHmac);
                using (var hmac = new HMACSHA256(legHmac))
                {
                    sourceStream.Seek(ciphertextStart, SeekOrigin.Begin);
                    byte[] computedHmac = hmac.ComputeHash(sourceStream);
                    if (ConstantTimeEquals(storedHmac, computedHmac))
                    {
                        hmacValid = true;
                        effectiveAesKey = legAes;
                    }
                }
            }

            // 3. Try with fallback key or password
            if (!hmacValid && !string.IsNullOrEmpty(fallbackKeyOrPassword))
            {
                byte[] fallbackAes;
                byte[] fallbackHmac;
                DeriveKeys(fallbackKeyOrPassword, out fallbackAes, out fallbackHmac);

                using (var hmac = new HMACSHA256(fallbackHmac))
                {
                    sourceStream.Seek(ciphertextStart, SeekOrigin.Begin);
                    byte[] computedHmac = hmac.ComputeHash(sourceStream);
                    if (ConstantTimeEquals(storedHmac, computedHmac))
                    {
                        hmacValid = true;
                        effectiveAesKey = fallbackAes;
                    }
                }
            }

            if (!hmacValid)
            {
                throw new CryptographicException("فشل التحقق من صحة التشفير! الملف إما تالف أو تم تعديله خارج النظام أو أُخذ من جهاز مختلف ومفتاح الاسترجاع غير مطابق.");
            }

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
                    aes.Key = effectiveAesKey;
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
