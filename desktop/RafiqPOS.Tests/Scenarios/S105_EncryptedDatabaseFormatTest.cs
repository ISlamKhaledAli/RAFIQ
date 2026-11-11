using System;
using System.IO;
using System.Text;
using NUnit.Framework;
using RafiqPOS.Data;

namespace RafiqPOS.Tests.Scenarios
{
    /// <summary>
    /// قاعدة البيانات الجديدة مشفرة من أول بايت: لا ترويسة SQLite عادية، لا نصوص قابلة للقراءة في الملف أو WAL أو الـ journal،
    /// وأي عميل بدون المفتاح أو بمفتاح آخر يفشل. كل اتصال (بما فيه النسخ الاحتياطي) يُفتح بالمفتاح.
    /// </summary>
    [TestFixture]
    [NonParallelizable]
    public class S105_EncryptedDatabaseFormatTest
    {
        private const string Marker = "نص_سري_للبحث_في_الملف_QZXV9";
        private string _folder;

        [SetUp]
        public void SetUp()
        {
            TestMode.RequireEncrypted();
            _folder = EncryptionTestKit.NewFolder("rafiq_nunit_fmt_");
        }

        [TearDown]
        public void TearDown()
        {
            EncryptionTestKit.DeleteFolder(_folder);
        }

        private static bool FileContains(string path, string text)
        {
            byte[] data = File.ReadAllBytes(path);
            byte[] utf8 = Encoding.UTF8.GetBytes(text);
            return IndexOf(data, utf8) >= 0;
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

        private string CreateDatabaseWithSecrets(string name, string journalMode)
        {
            string path = Path.Combine(_folder, name);
            using (var conn = new SQLiteConnection("Data Source=" + path + ";Version=3;Journal Mode=" + journalMode + ";Synchronous=Full;"))
            {
                conn.Open();
                DatabaseFileAccess.Execute(conn, "CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT, barcode TEXT);");
                DatabaseFileAccess.Execute(conn, "BEGIN;");
                for (int i = 0; i < 200; i++)
                {
                    DatabaseFileAccess.Execute(conn, "INSERT INTO products (name, barcode) VALUES ('" + Marker + " " + i + "', 'BC" + i + "');");
                }
                DatabaseFileAccess.Execute(conn, "COMMIT;");

                if (journalMode == "Wal")
                {
                    // the WAL of the still-open connection is where fresh pages live: it must be encrypted too
                    Assert.IsTrue(File.Exists(path + "-wal"), "WAL file exists while the connection is open");
                    Assert.IsFalse(EncryptionTestKit.HasSqliteMagic(path + "-wal"));
                    Assert.IsFalse(FileContains(path + "-wal", Marker), "WAL must not hold readable text");
                }
            }
            SQLiteConnection.ClearAllPools();
            return path;
        }

        [Test]
        public void NewDatabase_IsEncryptedFromTheFirstByte_InDeleteAndWalModes()
        {
            string[] modes = new string[] { "Delete", "Wal" };
            for (int m = 0; m < modes.Length; m++)
            {
                string path = CreateDatabaseWithSecrets("new_" + modes[m] + ".db", modes[m]);
                Assert.AreEqual(DatabaseFileKind.NotPlain, DatabaseKeyProvider.DetectFileKind(path), modes[m]);
                Assert.IsFalse(EncryptionTestKit.HasSqliteMagic(path), "no plain SQLite header (" + modes[m] + ")");
                Assert.IsFalse(FileContains(path, Marker), "no readable product text in the file (" + modes[m] + ")");
                Assert.IsFalse(FileContains(path, "products"), "no readable table names in the file (" + modes[m] + ")");
            }
        }

        [Test]
        public void RollbackJournal_OfAnEncryptedDatabase_HoldsNoReadableText()
        {
            string path = Path.Combine(_folder, "journal.db");
            using (var conn = new SQLiteConnection("Data Source=" + path + ";Version=3;Journal Mode=Delete;"))
            {
                conn.Open();
                DatabaseFileAccess.Execute(conn, "CREATE TABLE t (v TEXT);");
                DatabaseFileAccess.Execute(conn, "INSERT INTO t VALUES ('" + Marker + "');");
                DatabaseFileAccess.Execute(conn, "BEGIN;");
                DatabaseFileAccess.Execute(conn, "UPDATE t SET v = '" + Marker + "_2';");
                string journal = path + "-journal";
                Assert.IsTrue(File.Exists(journal), "an open write transaction has a rollback journal");
                Assert.IsFalse(EncryptionTestKit.HasSqliteMagic(journal));
                Assert.IsFalse(FileContains(journal, Marker), "journal pages are encrypted");
                DatabaseFileAccess.Execute(conn, "ROLLBACK;");
            }
        }

        [Test]
        public void ClientWithoutTheKey_OrWithAnotherKey_CannotReadTheFile()
        {
            string path = CreateDatabaseWithSecrets("locked.db", "Delete");

            using (var plainClient = new SQLiteConnection("Data Source=" + path + ";Version=3;Pooling=False;Encryption=None;"))
            {
                plainClient.Open();
                SQLiteException ex = Assert.Throws<SQLiteException>(delegate { DatabaseFileAccess.Scalar(plainClient, "SELECT count(*) FROM products;"); });
                Assert.AreEqual(26, (int)ex.ResultCode & 0xFF, "SQLITE_NOTADB without a key");
            }

            using (var otherKey = new SQLiteConnection("Data Source=" + path + ";Version=3;Pooling=False;"))
            {
                otherKey.SetEncryptionKey(EncryptionTestKit.OtherKey());
                otherKey.Open();
                SQLiteException ex = Assert.Throws<SQLiteException>(delegate { DatabaseFileAccess.Scalar(otherKey, "SELECT count(*) FROM products;"); });
                Assert.AreEqual(26, (int)ex.ResultCode & 0xFF, "SQLITE_NOTADB with another key");
            }

            using (var good = new SQLiteConnection("Data Source=" + path + ";Version=3;Pooling=False;"))
            {
                good.Open();
                Assert.AreEqual(200L, DatabaseFileAccess.Scalar(good, "SELECT count(*) FROM products;"));
            }
        }

        [Test]
        public void BackupDatabase_ToADefaultConnection_ProducesAnEncryptedKeyedCopy()
        {
            string source = CreateDatabaseWithSecrets("backup_src.db", "Wal");
            string target = Path.Combine(_folder, "backup_dst.db");

            using (var src = new SQLiteConnection("Data Source=" + source + ";Version=3;Pooling=False;"))
            using (var dst = new SQLiteConnection("Data Source=" + target + ";Version=3;Pooling=False;"))
            {
                src.Open();
                dst.Open();
                src.BackupDatabase(dst, "main", "main", -1, null, 0);
            }
            SQLiteConnection.ClearAllPools();

            Assert.AreEqual(DatabaseFileKind.NotPlain, DatabaseKeyProvider.DetectFileKind(target));
            Assert.IsFalse(FileContains(target, Marker));
            using (var check = DatabaseFileAccess.OpenExisting(target, true))
            {
                Assert.AreEqual(200L, DatabaseFileAccess.Scalar(check, "SELECT count(*) FROM products;"));
            }
        }

        [Test]
        public void BackupDatabase_FromEncryptedToPlainDestination_IsRefused_NotSilentlyDowngraded()
        {
            string source = CreateDatabaseWithSecrets("down_src.db", "Delete");
            string target = Path.Combine(_folder, "down_dst.db");

            using (var src = new SQLiteConnection("Data Source=" + source + ";Version=3;Pooling=False;"))
            using (var dst = new SQLiteConnection("Data Source=" + target + ";Version=3;Pooling=False;Encryption=None;"))
            {
                src.Open();
                dst.Open();
                Assert.Throws<SQLiteException>(delegate { src.BackupDatabase(dst, "main", "main", -1, null, 0); },
                    "the online backup API cannot silently write a plain copy of an encrypted database");
            }
            SQLiteConnection.ClearAllPools();
            Assert.IsFalse(FileContains(target, Marker), "no readable data leaked into the refused copy");
        }

        [Test]
        public void ReadOnlyKeyedConnection_ReadsButCannotWrite()
        {
            string path = CreateDatabaseWithSecrets("ro.db", "Delete");
            using (var ro = new SQLiteConnection("Data Source=" + path + ";Version=3;Pooling=False;Read Only=True;"))
            {
                ro.Open();
                Assert.AreEqual(200L, DatabaseFileAccess.Scalar(ro, "SELECT count(*) FROM products;"));
                SQLiteException ex = Assert.Throws<SQLiteException>(delegate { DatabaseFileAccess.Execute(ro, "DELETE FROM products;"); });
                Assert.AreEqual(8, (int)ex.ResultCode & 0xFF, "SQLITE_READONLY");
            }
        }

        [Test]
        public void ChangeOfKeyMode_OnAnOpenConnection_IsRejected()
        {
            using (var conn = new SQLiteConnection("Data Source=" + Path.Combine(_folder, "k.db") + ";Version=3;Pooling=False;"))
            {
                conn.Open();
                Assert.Throws<InvalidOperationException>(delegate { conn.SetEncryptionKey(EncryptionTestKit.OtherKey()); });
            }
            Assert.Throws<ArgumentException>(delegate { new SQLiteConnection("Data Source=x.db;Version=3;").SetEncryptionKey(new byte[7]); });
            Assert.Throws<NotSupportedException>(delegate { new SQLiteConnection("Data Source=x.db;Version=3;Encryption=Maybe;"); });
            Assert.Throws<NotSupportedException>(delegate { new SQLiteConnection("Data Source=x.db;Version=3;Password=abc;"); });
        }
    }
}
