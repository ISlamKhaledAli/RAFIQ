using System;
using System.Data.SQLite;
using NUnit.Framework;

namespace RafiqPOS.Tests.Scenarios
{
    [TestFixture]
    [NonParallelizable]
    public class S40_TestConnectionPolicyTest : TestBase
    {
        [Test]
        public void Harness_EveryFreshConnection_EnforcesForeignKeysWalAndTimeout()
        {
            for (int i = 0; i < 2; i++)
            {
                using (var conn = new SQLiteConnection(ConnectionString))
                {
                    conn.Open();
                    using (var cmd = new SQLiteCommand("PRAGMA foreign_keys;", conn))
                        Assert.AreEqual(1, Convert.ToInt32(cmd.ExecuteScalar()));
                    using (var cmd = new SQLiteCommand("PRAGMA journal_mode;", conn))
                        Assert.AreEqual("wal", Convert.ToString(cmd.ExecuteScalar()).ToLowerInvariant());
                    using (var cmd = new SQLiteCommand("PRAGMA synchronous;", conn))
                        Assert.AreEqual(1, Convert.ToInt32(cmd.ExecuteScalar()));
                    using (var cmd = new SQLiteCommand("PRAGMA busy_timeout;", conn))
                        Assert.AreEqual(5000, Convert.ToInt32(cmd.ExecuteScalar()));
                    using (var cmd = new SQLiteCommand(
                        "UPDATE insurance_claim_lines SET claim_batch_id='missing_batch' WHERE id='missing_line';", conn))
                        Assert.AreEqual(0, cmd.ExecuteNonQuery());
                    using (var cmd = new SQLiteCommand(
                        "INSERT INTO insurance_claim_batches(id,batch_number,company_id,period,created_by,created_at) " +
                        "VALUES('orphan','orphan','missing_company','2026-11','test','2026-11-02T00:00:00Z');", conn))
                    {
                        var ex = Assert.Throws<SQLiteException>(delegate { cmd.ExecuteNonQuery(); });
                        StringAssert.Contains("FOREIGN KEY", ex.Message.ToUpperInvariant());
                    }
                }
                SQLiteConnection.ClearAllPools();
            }
        }
    }
}
