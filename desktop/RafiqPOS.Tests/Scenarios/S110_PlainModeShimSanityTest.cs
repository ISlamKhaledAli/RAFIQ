using System;
using System.IO;
using NUnit.Framework;
using RafiqPOS.Data;

namespace RafiqPOS.Tests.Scenarios
{
    /// <summary>
    /// Shim sanity subset that runs in BOTH test modes and never depends on the process default (explicit Encryption=None / Product):
    /// plain mode (RAFIQ_TEST_PLAIN=1) therefore still exercises the compatibility layer on plain files, encrypted mode on keyed ones.
    /// </summary>
    [TestFixture]
    [NonParallelizable]
    public class S110_PlainModeShimSanityTest
    {
        private string _folder;

        [SetUp]
        public void SetUp() { _folder = EncryptionTestKit.NewFolder("rafiq_nunit_sanity_"); }

        [TearDown]
        public void TearDown() { EncryptionTestKit.DeleteFolder(_folder); }

        private string Conn(string name, string mode, string extra)
        {
            return "Data Source=" + Path.Combine(_folder, name) + ";Version=3;Pooling=False;Encryption=" + mode + ";" + extra;
        }

        [TestCase("None")]
        [TestCase("Product")]
        public void RoundTrip_Transactions_Parameters_AndBackup_WorkInBothFormats(string mode)
        {
            using (var conn = new SQLiteConnection(Conn("a_" + mode + ".db", mode, "BusyTimeout=2000;Journal Mode=Wal;Synchronous=Full;")))
            {
                conn.Open();
                DatabaseFileAccess.Execute(conn, "CREATE TABLE t (id INTEGER PRIMARY KEY, s TEXT, n INTEGER, d TEXT, b BLOB);");
                using (var tx = conn.BeginTransaction())
                {
                    for (int i = 0; i < 100; i++)
                    {
                        using (var cmd = new SQLiteCommand("INSERT INTO t (s, n, d, b) VALUES (@s, @n, @d, @b);", conn, tx))
                        {
                            cmd.Parameters.AddWithValue("@s", "نص " + i);
                            cmd.Parameters.AddWithValue("@n", (long)i * 3);
                            cmd.Parameters.AddWithValue("@d", new DateTime(2030, 1, 2, 3, 4, 5));
                            cmd.Parameters.AddWithValue("@b", new byte[] { 1, 2, (byte)i });
                            cmd.ExecuteNonQuery();
                        }
                    }
                    tx.Commit();
                }
                using (var tx = conn.BeginTransaction())
                {
                    DatabaseFileAccess.Execute(conn, "DELETE FROM t;");
                    tx.Rollback();
                }
                Assert.AreEqual(100L, DatabaseFileAccess.Scalar(conn, "SELECT COUNT(*) FROM t;"));
                StringAssert.StartsWith("2030-01-02 03:04:05", DatabaseFileAccess.Scalar(conn, "SELECT d FROM t LIMIT 1;").ToString());

                using (var dst = new SQLiteConnection(Conn("b_" + mode + ".db", mode, "")))
                {
                    dst.Open();
                    conn.BackupDatabase(dst, "main", "main", -1, null, 0);
                }
            }
            SQLiteConnection.ClearAllPools();
            string copy = Path.Combine(_folder, "b_" + mode + ".db");
            Assert.AreEqual(mode == "None" ? DatabaseFileKind.Plain : DatabaseFileKind.NotPlain, DatabaseKeyProvider.DetectFileKind(copy));
            using (var check = new SQLiteConnection(Conn("b_" + mode + ".db", mode, "Read Only=True;")))
            {
                check.Open();
                Assert.AreEqual(100L, DatabaseFileAccess.Scalar(check, "SELECT COUNT(*) FROM t;"));
                SQLiteException ex = Assert.Throws<SQLiteException>(delegate { DatabaseFileAccess.Execute(check, "DELETE FROM t;"); });
                Assert.AreEqual(8, (int)ex.ResultCode & 0xFF);
            }
        }

        [Test]
        public void ConnectionStringParsing_StaysStrict()
        {
            Assert.Throws<NotSupportedException>(delegate { new SQLiteConnection("Data Source=x.db;Version=3;Password=abc;"); });
            Assert.Throws<NotSupportedException>(delegate { new SQLiteConnection("Data Source=x.db;Version=2;"); });
            Assert.Throws<ArgumentException>(delegate { new SQLiteConnection("Data Source=;"); });
            Assert.Throws<NotSupportedException>(delegate { new SQLiteConnection("Data Source=x.db;Encryption=Maybe;"); });
        }
    }
}
