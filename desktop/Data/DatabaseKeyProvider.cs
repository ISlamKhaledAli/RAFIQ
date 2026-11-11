using System;
using System.IO;
using System.Security.Cryptography;
using System.Text;

namespace RafiqPOS.Data
{
    // What the first bytes of a database file say it is.
    internal enum DatabaseFileKind
    {
        Missing = 0,
        Empty = 1,
        // "SQLite format 3\0": a legacy unencrypted database (anyone can open it with a free viewer)
        Plain = 2,
        // Anything else: an encrypted database (or a damaged/foreign file; only a keyed open can tell)
        NotPlain = 3
    }

    // INTERNAL ON PURPOSE: nothing public in the assembly may hand out the key (S111 reflects over the public surface).
    // Supplies the database encryption key (SQLite3 Multiple Ciphers, ChaCha20, raw 256-bit key).
    // The key lives inside the application by design: it keeps casual users and free SQLite viewers out of the file,
    // it is not a defence against someone who reverse engineers the program (see docs/ENCRYPTED_DATABASE.md).
    // The key is never stored as a literal: it is derived at run time (HMAC-SHA256) from masked fragments, so neither
    // the key bytes nor their hex text exist in the assembly. NEVER change the fragments, the mask or the salt:
    // every existing encrypted database would become unreadable (S104 pins the key fingerprint).
    internal static class DatabaseKeyProvider
    {
        internal const string CipherName = "chacha20";

        private const string Salt = "RafiqPOS.Database.Key.v1";

        private static readonly byte[][] Fragments = new byte[][]
        {
            new byte[] { 0xB4, 0x7E, 0xA1, 0xB5, 0xEC, 0xC8, 0x27, 0x04, 0x12, 0x4E, 0x7D, 0xDF },
            new byte[] { 0x94, 0xB6, 0x9A, 0x45, 0xDF, 0x61, 0x2E, 0xA9, 0xBD, 0x6E, 0xAA, 0xEC },
            new byte[] { 0x9D, 0x0D, 0x98, 0xD4, 0x50, 0xFA, 0xFD, 0xED, 0x6D, 0x2E, 0x30, 0x88 },
            new byte[] { 0x64, 0xC1, 0x0C, 0x6F, 0x2A, 0xA6, 0x93, 0x6A, 0xFE, 0x1D, 0xC7, 0x0D }
        };

        private static readonly object Gate = new object();
        private static byte[] _cached;
        private static byte[] _testKeyOverride;

        // Test seam: a different key for the whole process (null restores the real key). Never used by shipping code.
        internal static byte[] TestKeyOverride
        {
            get { lock (Gate) { return _testKeyOverride == null ? null : (byte[])_testKeyOverride.Clone(); } }
            set
            {
                if (value != null && value.Length != 32) throw new ArgumentException("A raw database key must be exactly 32 bytes.");
                lock (Gate) { _testKeyOverride = value == null ? null : (byte[])value.Clone(); }
            }
        }

        // A fresh copy of the key in effect (the test override when set). Callers must wipe their copy after use.
        internal static byte[] GetKey()
        {
            lock (Gate)
            {
                if (_testKeyOverride != null) return (byte[])_testKeyOverride.Clone();
                if (_cached == null) _cached = Derive();
                return (byte[])_cached.Clone();
            }
        }

        // The hook installed into SQLiteConnection.ConnectionKeyHook: every file database is keyed, in-memory ones are not.
        internal static byte[] DefaultHook(string dataSource)
        {
            if (string.IsNullOrEmpty(dataSource) || string.Equals(dataSource, ":memory:", StringComparison.OrdinalIgnoreCase)) return null;
            return GetKey();
        }

        // True while the process uses the plain legacy database because the conversion has not (yet) succeeded
        private static bool _plainFallback;

        // Test/diagnostic seam: run every default connection without a key (RAFIQ_TEST_PLAIN mode of the test suites).
        internal static void DisableDefaultEncryption()
        {
            _plainFallback = false;
            SQLiteConnection.ConnectionKeyHook = null;
        }

        internal static void EnableDefaultEncryption()
        {
            _plainFallback = false;
            SQLiteConnection.ConnectionKeyHook = DefaultHook;
        }

        // The legacy plain database is still the live one (conversion failed or is deferred): default connections must not be keyed.
        internal static void EnterPlainFallback()
        {
            _plainFallback = true;
            SQLiteConnection.ConnectionKeyHook = null;
        }

        internal static void LeavePlainFallback()
        {
            if (!_plainFallback) return;
            _plainFallback = false;
            SQLiteConnection.ConnectionKeyHook = DefaultHook;
        }

        internal static bool IsPlainFallbackActive
        {
            get { return _plainFallback; }
        }

        // Encryption is wanted for this process (the default), even if a fallback temporarily switched the hook off
        internal static bool IsDefaultEncryptionEnabled
        {
            get { return SQLiteConnection.ConnectionKeyHook != null || _plainFallback; }
        }

        internal static string ToHex(byte[] key)
        {
            if (key == null) throw new ArgumentNullException("key");
            StringBuilder sb = new StringBuilder(key.Length * 2);
            for (int i = 0; i < key.Length; i++) sb.Append(key[i].ToString("x2"));
            return sb.ToString();
        }

        // A purpose-bound key derived from the product key (integrity tags of local state files). Never the product key itself.
        internal static byte[] DeriveSubKey(string purpose)
        {
            byte[] key = GetKey();
            try
            {
                using (HMACSHA256 hmac = new HMACSHA256(key))
                {
                    return hmac.ComputeHash(Encoding.UTF8.GetBytes("RafiqPOS.subkey:" + purpose));
                }
            }
            finally
            {
                Array.Clear(key, 0, key.Length);
            }
        }

        // SHA-256 of the key, for diagnostics and the regression test that pins the key; never reveals the key itself.
        internal static string KeyFingerprint(byte[] key)
        {
            using (SHA256 sha = SHA256.Create())
            {
                return ToHex(sha.ComputeHash(key));
            }
        }

        internal static DatabaseFileKind DetectFileKind(string path)
        {
            if (string.IsNullOrEmpty(path) || !File.Exists(path)) return DatabaseFileKind.Missing;
            byte[] header = new byte[16];
            int read = 0;
            using (FileStream fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
            {
                while (read < header.Length)
                {
                    int n = fs.Read(header, read, header.Length - read);
                    if (n <= 0) break;
                    read += n;
                }
            }
            if (read == 0) return DatabaseFileKind.Empty;
            if (read == 16 && HasPlainHeader(header)) return DatabaseFileKind.Plain;
            return DatabaseFileKind.NotPlain;
        }

        internal static bool IsPlainSqliteFile(string path)
        {
            return DetectFileKind(path) == DatabaseFileKind.Plain;
        }

        private static bool HasPlainHeader(byte[] header)
        {
            byte[] magic = Encoding.ASCII.GetBytes("SQLite format 3");
            for (int i = 0; i < magic.Length; i++)
            {
                if (header[i] != magic[i]) return false;
            }
            return header[15] == 0;
        }

        private static byte[] Derive()
        {
            byte[] seed = new byte[Fragments.Length * Fragments[0].Length];
            int p = 0;
            for (int f = 0; f < Fragments.Length; f++)
            {
                for (int j = 0; j < Fragments[f].Length; j++)
                {
                    int i = p;
                    seed[p++] = (byte)(Fragments[f][j] ^ ((i * 37 + 11) & 0xFF) ^ ((i * i + 5) & 0xFF));
                }
            }
            try
            {
                using (HMACSHA256 hmac = new HMACSHA256(seed))
                {
                    return hmac.ComputeHash(Encoding.ASCII.GetBytes(Salt));
                }
            }
            finally
            {
                Array.Clear(seed, 0, seed.Length);
            }
        }
    }
}
