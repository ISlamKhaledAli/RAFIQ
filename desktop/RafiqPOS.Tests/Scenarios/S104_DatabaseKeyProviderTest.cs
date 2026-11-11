using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using NUnit.Framework;
using RafiqPOS.Data;

namespace RafiqPOS.Tests.Scenarios
{
    /// <summary>
    /// مزود مفتاح تشفير قاعدة البيانات: مفتاح ثابت لا يتغير أبداً (وإلا تنقفل كل القواعد المشفرة)، ولا يظهر كنص أو مصفوفة
    /// في ملف البرنامج، والخوارزمية محددة صراحة بحيث لا يغيّرها اختلاف إعدادات المكتبة الافتراضية.
    /// </summary>
    [TestFixture]
    [NonParallelizable]
    public class S104_DatabaseKeyProviderTest
    {
        // SHA-256 of the product key. If this test fails after a code change, the key changed: every installed encrypted
        // database would become unreadable. Revert the change; never update this constant.
        private const string PinnedKeyFingerprint = "a61a7e9b7550900b3baf12b1ddcbeef3b15582f95bb645d594bbbb6276867078";

        private string _folder;

        [SetUp]
        public void SetUp()
        {
            _folder = EncryptionTestKit.NewFolder("rafiq_nunit_key_");
            DatabaseKeyProvider.TestKeyOverride = null;
        }

        [TearDown]
        public void TearDown()
        {
            DatabaseKeyProvider.TestKeyOverride = null;
            if (!TestMode.Plain) DatabaseKeyProvider.EnableDefaultEncryption();
            EncryptionTestKit.DeleteFolder(_folder);
        }

        [Test]
        public void Key_IsThirtyTwoBytes_Stable_AndPinned()
        {
            byte[] key = DatabaseKeyProvider.GetKey();
            Assert.AreEqual(32, key.Length);
            CollectionAssert.AreEqual(key, DatabaseKeyProvider.GetKey(), "same key on every call");
            Assert.AreEqual(PinnedKeyFingerprint, DatabaseKeyProvider.KeyFingerprint(key), "the product key must never change");

            // callers get a copy: wiping it must not damage the provider
            Array.Clear(key, 0, key.Length);
            Assert.AreEqual(PinnedKeyFingerprint, DatabaseKeyProvider.KeyFingerprint(DatabaseKeyProvider.GetKey()));
        }

        [Test]
        public void TestKeyOverride_ReplacesTheKey_AndRestores()
        {
            byte[] other = EncryptionTestKit.OtherKey();
            DatabaseKeyProvider.TestKeyOverride = other;
            CollectionAssert.AreEqual(other, DatabaseKeyProvider.GetKey());
            DatabaseKeyProvider.TestKeyOverride = null;
            Assert.AreEqual(PinnedKeyFingerprint, DatabaseKeyProvider.KeyFingerprint(DatabaseKeyProvider.GetKey()));
            Assert.Throws<ArgumentException>(delegate { DatabaseKeyProvider.TestKeyOverride = new byte[5]; });
        }

        [Test]
        public void Key_IsNotStoredInTheHostAssembly_AsBytesOrHexText()
        {
            string assemblyPath = typeof(DatabaseKeyProvider).Assembly.Location;
            byte[] image = File.ReadAllBytes(assemblyPath);
            byte[] key = DatabaseKeyProvider.GetKey();
            string hex = DatabaseKeyProvider.ToHex(key);

            Assert.AreEqual(-1, IndexOf(image, key), "raw key bytes found in the assembly");
            Assert.AreEqual(-1, IndexOf(image, Encoding.ASCII.GetBytes(hex)), "lower-case hex key found in the assembly");
            Assert.AreEqual(-1, IndexOf(image, Encoding.ASCII.GetBytes(hex.ToUpperInvariant())), "upper-case hex key found in the assembly");
            Assert.AreEqual(-1, IndexOf(image, Encoding.Unicode.GetBytes(hex)), "UTF-16 hex key found in the assembly (string literal)");
            Assert.AreEqual(-1, IndexOf(image, Encoding.Unicode.GetBytes(hex.ToUpperInvariant())), "UTF-16 upper-case hex key found in the assembly");
            Assert.AreEqual(-1, IndexOf(image, Encoding.ASCII.GetBytes(Convert.ToBase64String(key))), "base64 key found in the assembly");
            Assert.AreEqual(-1, IndexOf(image, Encoding.Unicode.GetBytes(Convert.ToBase64String(key))), "UTF-16 base64 key found in the assembly");
        }

        [Test]
        public void Key_IsNotWrittenAnywhereInTheSourceTree()
        {
            string desktop = FindDesktopFolder();
            if (desktop == null) Assert.Inconclusive("source tree not reachable from the test output folder");

            byte[] key = DatabaseKeyProvider.GetKey();
            string hex = DatabaseKeyProvider.ToHex(key);
            string base64 = Convert.ToBase64String(key);
            string[] patterns = new string[] { "*.cs", "*.md", "*.json", "*.config", "*.iss", "*.yml", "*.props", "*.csproj" };
            int scanned = 0;
            for (int p = 0; p < patterns.Length; p++)
            {
                foreach (string file in Directory.GetFiles(desktop, patterns[p], SearchOption.AllDirectories))
                {
                    if (file.IndexOf(Path.DirectorySeparatorChar + "obj" + Path.DirectorySeparatorChar, StringComparison.Ordinal) >= 0) continue;
                    if (file.IndexOf(Path.DirectorySeparatorChar + "bin" + Path.DirectorySeparatorChar, StringComparison.Ordinal) >= 0) continue;
                    string text = File.ReadAllText(file);
                    scanned++;
                    Assert.IsFalse(text.IndexOf(hex, StringComparison.OrdinalIgnoreCase) >= 0, "key hex found in " + file);
                    Assert.IsFalse(text.IndexOf(base64, StringComparison.Ordinal) >= 0, "key base64 found in " + file);
                }
            }
            Assert.Greater(scanned, 100, "the scan really covered the sources");
        }

        [Test]
        public void DefaultHook_KeysFileDatabases_AndSkipsInMemory()
        {
            TestMode.RequireEncrypted();
            Func<string, byte[]> hook = SQLiteConnection.ConnectionKeyHook;
            Assert.IsNotNull(hook, "the default hook is installed");
            Assert.IsNull(hook(":memory:"));
            Assert.IsNull(hook(string.Empty));
            byte[] key = hook(Path.Combine(_folder, "x.db"));
            Assert.AreEqual(PinnedKeyFingerprint, DatabaseKeyProvider.KeyFingerprint(key));

            using (var conn = new SQLiteConnection("Data Source=:memory:;Version=3;"))
            {
                conn.Open();
                Assert.AreEqual(1L, DatabaseFileAccess.Scalar(conn, "SELECT 1;"), "in-memory databases open without a key");
            }
        }

        [Test]
        public void Files_AreChaCha20_AndOnlyAClientNamingThatCipherCanReadThem()
        {
            TestMode.RequireEncrypted();
            string path = Path.Combine(_folder, "cipher.db");
            using (var conn = new SQLiteConnection("Data Source=" + path + ";Version=3;Pooling=False;"))
            {
                conn.Open();
                DatabaseFileAccess.Execute(conn, "CREATE TABLE t (v TEXT); INSERT INTO t VALUES ('kept');");
                Assert.AreEqual("chacha20", DatabaseFileAccess.Scalar(conn, "PRAGMA cipher;").ToString(), "the program names the cipher explicitly");
            }
            SQLiteConnection.ClearAllPools();

            string hex = DatabaseKeyProvider.ToHex(DatabaseKeyProvider.GetKey());
            string[] otherCiphers = new string[] { "aes256cbc", "sqlcipher", "rc4", "aes128cbc" };
            for (int i = 0; i < otherCiphers.Length; i++)
            {
                string cipher = otherCiphers[i];
                using (var raw = new SQLiteConnection("Data Source=" + path + ";Version=3;Pooling=False;Encryption=None;"))
                {
                    raw.Open();
                    DatabaseFileAccess.Execute(raw, "PRAGMA cipher = '" + cipher + "';");
                    DatabaseFileAccess.Execute(raw, "PRAGMA key = \"x'" + hex + "'\";");
                    Assert.Throws<SQLiteException>(delegate { DatabaseFileAccess.Scalar(raw, "SELECT count(*) FROM t;"); }, "a " + cipher + " client must not read the file");
                }
            }

            using (var chacha = new SQLiteConnection("Data Source=" + path + ";Version=3;Pooling=False;Encryption=None;"))
            {
                chacha.Open();
                DatabaseFileAccess.Execute(chacha, "PRAGMA cipher = 'chacha20';");
                DatabaseFileAccess.Execute(chacha, "PRAGMA key = \"x'" + hex + "'\";");
                Assert.AreEqual("kept", DatabaseFileAccess.Scalar(chacha, "SELECT v FROM t;").ToString());
            }
            using (var conn = new SQLiteConnection("Data Source=" + path + ";Version=3;Pooling=False;"))
            {
                conn.Open();
                Assert.AreEqual("kept", DatabaseFileAccess.Scalar(conn, "SELECT v FROM t;").ToString());
            }
        }

        [Test]
        public void FileWrittenWithTheProductKeyButAnotherCipher_IsUnreadable_ProvingTheExplicitCipherPinsTheFormat()
        {
            string path = Path.Combine(_folder, "aes.db");
            string hex = DatabaseKeyProvider.ToHex(DatabaseKeyProvider.GetKey());
            string[] others = new string[] { "aes256cbc", "sqlcipher" };
            for (int i = 0; i < others.Length; i++)
            {
                string file = path + i;
                using (var raw = new SQLiteConnection("Data Source=" + file + ";Version=3;Pooling=False;Encryption=None;"))
                {
                    raw.Open();
                    DatabaseFileAccess.Execute(raw, "PRAGMA cipher = '" + others[i] + "';");
                    DatabaseFileAccess.Execute(raw, "PRAGMA key = \"x'" + hex + "'\";");
                    DatabaseFileAccess.Execute(raw, "CREATE TABLE t (v TEXT); INSERT INTO t VALUES ('other cipher');");
                }
                SQLiteConnection.ClearAllPools();
                Assert.AreEqual(DatabaseFileKind.NotPlain, DatabaseKeyProvider.DetectFileKind(file), others[i] + " file is not a plain header");

                // our program: always chacha20 + product key, never a default, so the same key with another cipher cannot open it
                using (var ours = new SQLiteConnection("Data Source=" + file + ";Version=3;Pooling=False;Encryption=Product;"))
                {
                    ours.Open();
                    SQLiteException ex = Assert.Throws<SQLiteException>(delegate { DatabaseFileAccess.Scalar(ours, "SELECT v FROM t;"); }, others[i]);
                    Assert.AreEqual(26, (int)ex.ResultCode & 0xFF, "SQLITE_NOTADB for " + others[i]);
                }
                // and the same file does open when the cipher is named, which shows the failure above is the cipher alone
                using (var named = new SQLiteConnection("Data Source=" + file + ";Version=3;Pooling=False;Encryption=None;"))
                {
                    named.Open();
                    DatabaseFileAccess.Execute(named, "PRAGMA cipher = '" + others[i] + "';");
                    DatabaseFileAccess.Execute(named, "PRAGMA key = \"x'" + hex + "'\";");
                    Assert.AreEqual("other cipher", DatabaseFileAccess.Scalar(named, "SELECT v FROM t;").ToString());
                }
            }
        }

        [Test]
        public void ProductKeyword_KeysTheFile_EvenWhenTheDefaultHookIsOff()
        {
            string path = Path.Combine(_folder, "forced.db");
            DatabaseKeyProvider.DisableDefaultEncryption();
            try
            {
                using (var conn = new SQLiteConnection("Data Source=" + path + ";Version=3;Pooling=False;Encryption=Product;"))
                {
                    conn.Open();
                    DatabaseFileAccess.Execute(conn, "CREATE TABLE t (v TEXT); INSERT INTO t VALUES ('forced');");
                }
                SQLiteConnection.ClearAllPools();
                Assert.AreEqual(DatabaseFileKind.NotPlain, DatabaseKeyProvider.DetectFileKind(path), "keyed although the process default is plain");

                using (var unkeyed = new SQLiteConnection("Data Source=" + path + ";Version=3;Pooling=False;"))
                {
                    unkeyed.Open();
                    Assert.Throws<SQLiteException>(delegate { DatabaseFileAccess.Scalar(unkeyed, "SELECT v FROM t;"); }, "the default (hook off) connection has no key");
                }
                using (var forced = new SQLiteConnection("Data Source=" + path + ";Version=3;Pooling=False;Encryption=Product;"))
                {
                    forced.Open();
                    Assert.AreEqual("forced", DatabaseFileAccess.Scalar(forced, "SELECT v FROM t;").ToString());
                }
            }
            finally
            {
                if (!TestMode.Plain) DatabaseKeyProvider.EnableDefaultEncryption();
            }
        }

        [Test]
        public void FileKindDetection_SeparatesPlainEncryptedMissingAndEmpty()
        {
            string plain = Path.Combine(_folder, "plain.db");
            string encrypted = Path.Combine(_folder, "enc.db");
            using (var conn = DatabaseFileAccess.CreatePlain(plain)) { DatabaseFileAccess.Execute(conn, "CREATE TABLE t (id INTEGER);"); }
            using (var conn = DatabaseFileAccess.CreateEncrypted(encrypted)) { DatabaseFileAccess.Execute(conn, "CREATE TABLE t (id INTEGER);"); }
            string empty = Path.Combine(_folder, "empty.db");
            File.WriteAllBytes(empty, new byte[0]);
            SQLiteConnection.ClearAllPools();

            Assert.AreEqual(DatabaseFileKind.Plain, DatabaseKeyProvider.DetectFileKind(plain));
            Assert.AreEqual(DatabaseFileKind.NotPlain, DatabaseKeyProvider.DetectFileKind(encrypted));
            Assert.AreEqual(DatabaseFileKind.Empty, DatabaseKeyProvider.DetectFileKind(empty));
            Assert.AreEqual(DatabaseFileKind.Missing, DatabaseKeyProvider.DetectFileKind(Path.Combine(_folder, "nope.db")));
        }

        private static string FindDesktopFolder()
        {
            string dir = AppDomain.CurrentDomain.BaseDirectory;
            for (int i = 0; i < 8 && !string.IsNullOrEmpty(dir); i++)
            {
                if (File.Exists(Path.Combine(dir, "RafiqPOS.csproj"))) return dir;
                string candidate = Path.Combine(dir, "desktop");
                if (File.Exists(Path.Combine(candidate, "RafiqPOS.csproj"))) return candidate;
                dir = Path.GetDirectoryName(dir);
            }
            return null;
        }

        private static int IndexOf(byte[] haystack, byte[] needle)
        {
            int last = haystack.Length - needle.Length;
            for (int i = 0; i <= last; i++)
            {
                if (haystack[i] != needle[0]) continue;
                bool match = true;
                for (int j = 1; j < needle.Length; j++)
                {
                    if (haystack[i + j] != needle[j]) { match = false; break; }
                }
                if (match) return i;
            }
            return -1;
        }
    }
}
