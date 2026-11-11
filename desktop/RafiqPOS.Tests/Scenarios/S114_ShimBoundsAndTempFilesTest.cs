using System;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Threading;
using NUnit.Framework;
using RafiqPOS.Data;

namespace RafiqPOS.Tests.Scenarios
{
    /// <summary>
    /// The shim must give up on a locked database when the connection string says so (BusyTimeout, not the engine's 30 s command
    /// default), the backup retry loop has a deadline, and a keyed connection never spills sort/index work into temp files.
    /// </summary>
    [TestFixture]
    [NonParallelizable]
    public class S114_ShimBoundsAndTempFilesTest
    {
        private string _folder;
        private string _db;

        [SetUp]
        public void SetUp()
        {
            _folder = EncryptionTestKit.NewFolder("rafiq_nunit_bounds_");
            _db = Path.Combine(_folder, "bounds.db");
        }

        [TearDown]
        public void TearDown()
        {
            SQLiteConnection.BackupBusyDeadlineMilliseconds = 60000;
            SQLiteConnection.ClearAllPools();
            EncryptionTestKit.DeleteFolder(_folder);
        }

        private string Conn(int busyMs)
        {
            return "Data Source=" + _db + ";Version=3;BusyTimeout=" + busyMs + ";Pooling=False;";
        }

        private static void Exec(SQLiteConnection c, string sql)
        {
            using (SQLiteCommand cmd = new SQLiteCommand(sql, c)) cmd.ExecuteNonQuery();
        }

        private void Seed()
        {
            using (SQLiteConnection c = new SQLiteConnection(Conn(5000)))
            {
                c.Open();
                Exec(c, "CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT); INSERT INTO t (v) VALUES ('a');");
            }
        }

        private double TimeBlockedWrite(int busyMs)
        {
            Seed();
            using (SQLiteConnection holder = new SQLiteConnection(Conn(5000)))
            using (SQLiteConnection victim = new SQLiteConnection(Conn(busyMs)))
            {
                holder.Open();
                victim.Open();
                Exec(holder, "BEGIN IMMEDIATE");
                Stopwatch sw = Stopwatch.StartNew();
                SQLiteException caught = null;
                try { Exec(victim, "INSERT INTO t (v) VALUES ('blocked')"); }
                catch (SQLiteException ex) { caught = ex; }
                sw.Stop();
                Exec(holder, "ROLLBACK");
                Assert.IsNotNull(caught, "the write must fail while the database is locked");
                Assert.AreEqual((int)SQLiteErrorCode.Busy, (int)caught.ResultCode & 0xFF);
                return sw.Elapsed.TotalSeconds;
            }
        }

        [Test]
        public void BusyTimeout500_FailsAfterAboutOneSecond_NotThirty()
        {
            double seconds = TimeBlockedWrite(500);
            Assert.GreaterOrEqual(seconds, 0.4, "it really waited");
            Assert.Less(seconds, 4.0, "BusyTimeout=500 must not fall back to the 30 s default");
        }

        [Test]
        public void BusyTimeout5000_FailsAfterAboutFiveSeconds()
        {
            double seconds = TimeBlockedWrite(5000);
            Assert.GreaterOrEqual(seconds, 4.0);
            Assert.Less(seconds, 12.0);
        }

        [Test]
        public void BackupDatabase_GivesUpWithBusyAfterItsDeadline()
        {
            Seed();
            string target = Path.Combine(_folder, "copy.db");
            SQLiteConnection.BackupBusyDeadlineMilliseconds = 700;
            using (SQLiteConnection writer = new SQLiteConnection(Conn(5000)))
            using (SQLiteConnection source = new SQLiteConnection(Conn(500)))
            using (SQLiteConnection destination = new SQLiteConnection("Data Source=" + target + ";Version=3;Pooling=False;"))
            {
                writer.Open();
                source.Open();
                destination.Open();
                Exec(writer, "BEGIN EXCLUSIVE; INSERT INTO t (v) VALUES ('x');");
                Stopwatch sw = Stopwatch.StartNew();
                SQLiteException caught = null;
                try { source.BackupDatabase(destination, "main", "main", -1, null, 20); }
                catch (SQLiteException ex) { caught = ex; }
                sw.Stop();
                Exec(writer, "ROLLBACK");
                Assert.IsNotNull(caught, "the retry loop must not spin forever");
                Assert.AreEqual((int)SQLiteErrorCode.Busy, (int)caught.ResultCode & 0xFF);
                Assert.GreaterOrEqual(sw.ElapsedMilliseconds, 600);
                Assert.Less(sw.ElapsedMilliseconds, 10000);
            }
        }

        [Test]
        public void KeyedConnections_DoNotUseFileTempStore()
        {
            TestMode.RequireEncrypted();
            Seed();
            using (SQLiteConnection c = new SQLiteConnection(Conn(5000)))
            {
                c.Open();
                using (SQLiteCommand cmd = new SQLiteCommand("PRAGMA temp_store", c))
                {
                    long value = Convert.ToInt64(cmd.ExecuteScalar());
                    Assert.AreNotEqual(1L, value, "temp_store=FILE would write query intermediates to disk in plain text");
                }
            }
        }

        [Test]
        public void HeavySortGroupIndexAndVacuum_OnAKeyedStore_LeaveNoReadableTempFiles()
        {
            TestMode.RequireEncrypted();
            const string marker = "TEMP-LEAK-MARKER-ZX81";
            using (EncryptionTestKit.HermeticTemp temp = new EncryptionTestKit.HermeticTemp())
            {
                string tempPath = temp.Path;
                using (SQLiteConnection c = new SQLiteConnection(Conn(30000)))
                {
                    c.Open();
                    Exec(c, "CREATE TABLE big (id INTEGER PRIMARY KEY, grp INTEGER, note TEXT)");
                    using (SQLiteTransaction tx = c.BeginTransaction())
                    {
                        using (SQLiteCommand ins = new SQLiteCommand("INSERT INTO big (grp, note) VALUES (@g, @n)", c, tx))
                        {
                            ins.Parameters.AddWithValue("@g", 0);
                            ins.Parameters.AddWithValue("@n", "");
                            for (int i = 0; i < 150000; i++)
                            {
                                ins.Parameters["@g"].Value = (i * 7919) % 1000;
                                ins.Parameters["@n"].Value = marker + "-" + ((i * 104729) % 150001);
                                ins.ExecuteNonQuery();
                            }
                        }
                        tx.Commit();
                    }
                    Exec(c, "PRAGMA cache_size=10");

                    bool done = false;
                    bool leaked = false;
                    string leakedWhere = null;
                    Exception failure = null;
                    Thread worker = new Thread(delegate()
                    {
                        try
                        {
                            using (SQLiteCommand cmd = new SQLiteCommand("SELECT note FROM big ORDER BY note DESC", c))
                            using (SQLiteDataReader r = cmd.ExecuteReader()) { while (r.Read()) { } }
                            using (SQLiteCommand cmd = new SQLiteCommand("SELECT grp, COUNT(*), MAX(note) FROM big GROUP BY grp ORDER BY MAX(note)", c))
                            using (SQLiteDataReader r = cmd.ExecuteReader()) { while (r.Read()) { } }
                            Exec(c, "CREATE INDEX idx_big_note ON big(note)");
                            Exec(c, "VACUUM");
                        }
                        catch (Exception ex) { failure = ex; }
                        finally { done = true; }
                    });
                    worker.Start();
                    byte[] needle = Encoding.UTF8.GetBytes(marker);
                    while (!done)
                    {
                        foreach (string file in Directory.GetFiles(tempPath, "*", SearchOption.AllDirectories))
                        {
                            try
                            {
                                using (FileStream fs = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
                                {
                                    byte[] data = new byte[fs.Length];
                                    int read = fs.Read(data, 0, data.Length);
                                    if (EncryptionTestKit.IndexOf(data, needle) >= 0) { leaked = true; leakedWhere = Path.GetFileName(file); }
                                }
                            }
                            catch (IOException) { }
                        }
                        Thread.Sleep(15);
                    }
                    worker.Join();
                    Assert.IsNull(failure, failure == null ? null : failure.Message);
                    Assert.IsFalse(leaked, "readable query intermediates found in the temp folder: " + leakedWhere);
                }
                Assert.AreEqual(0, EncryptionTestKit.FindFilesContaining(tempPath, marker).Count);
                Assert.AreEqual(0, EncryptionTestKit.FindFilesContaining(_folder, marker).Count, "the keyed store file itself is not readable either");
            }
        }
    }
}
