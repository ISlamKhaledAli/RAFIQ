using System;
using System.Data;
using System.IO;
using NUnit.Framework;
using RafiqPOS.Data;

namespace RafiqPOS.Tests.Scenarios
{
    /// <summary>
    /// طبقة التوافق RafiqPOS.Data (فوق Microsoft.Data.Sqlite + SQLite3 Multiple Ciphers) تحافظ على سلوك System.Data.SQLite القديم:
    /// صيغة تخزين المعاملات والتواريخ، أنواع القراءة حسب نوع العمود المعلن، المعاملات (BEGIN IMMEDIATE)، تنفيذ كل جمل السكربت،
    /// أكواد الأخطاء الأساسية، وافتراضات المحرك القديمة (المفاتيح الخارجية مطفأة ما لم تُطلب، قبول النص بين علامتي اقتباس مزدوجة).
    /// </summary>
    [TestFixture]
    public class S102_SqliteCompatLayerTest
    {
        private string _dir;

        [SetUp]
        public void SetUp()
        {
            _dir = Path.Combine(Path.GetTempPath(), "rafiq_s102_" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(_dir);
        }

        [TearDown]
        public void TearDown()
        {
            SQLiteConnection.ClearAllPools();
            try { Directory.Delete(_dir, true); } catch (IOException) { } catch (UnauthorizedAccessException) { }
        }

        private string ConnString(string file, string extra)
        {
            return "Data Source=" + Path.Combine(_dir, file) + ";Version=3;" + extra;
        }

        private static object Scalar(SQLiteConnection conn, string sql)
        {
            using (var cmd = new SQLiteCommand(sql, conn)) return cmd.ExecuteScalar();
        }

        private static int Exec(SQLiteConnection conn, string sql)
        {
            using (var cmd = new SQLiteCommand(sql, conn)) return cmd.ExecuteNonQuery();
        }

        [Test]
        public void Parameters_AreStoredWithTheLegacyStorageClassesAndDateText()
        {
            using (var conn = new SQLiteConnection(ConnString("params.db", "")))
            {
                conn.Open();
                Exec(conn, "CREATE TABLE t (n TEXT, b INTEGER, l INTEGER, d REAL, dt1 TEXT, dt2 TEXT, dt3 TEXT, g BLOB, blob BLOB, e INTEGER)");
                using (var cmd = new SQLiteCommand("INSERT INTO t VALUES (@n,@b,@l,@d,@dt1,@dt2,@dt3,@g,@blob,@e)", conn))
                {
                    cmd.Parameters.AddWithValue("@n", null);
                    cmd.Parameters.AddWithValue("@b", true);
                    cmd.Parameters.AddWithValue("@l", 9000000000L);
                    cmd.Parameters.AddWithValue("@d", 12.5);
                    cmd.Parameters.AddWithValue("@dt1", new DateTime(2026, 11, 11, 16, 38, 51, DateTimeKind.Unspecified));
                    cmd.Parameters.AddWithValue("@dt2", new DateTime(2026, 11, 11, 16, 38, 51, 500, DateTimeKind.Local));
                    cmd.Parameters.AddWithValue("@dt3", new DateTime(2026, 11, 11, 14, 38, 51, DateTimeKind.Utc));
                    cmd.Parameters.AddWithValue("@g", new Guid("00112233-4455-6677-8899-aabbccddeeff"));
                    cmd.Parameters.AddWithValue("@blob", new byte[] { 1, 2, 3 });
                    cmd.Parameters.AddWithValue("@e", DayOfWeek.Saturday);
                    Assert.AreEqual(1, cmd.ExecuteNonQuery());
                }
                Assert.AreEqual("null", Scalar(conn, "SELECT typeof(n) FROM t"), "null binds SQL NULL");
                Assert.AreEqual("integer:1", Scalar(conn, "SELECT typeof(b)||':'||b FROM t"), "bool binds 0/1");
                Assert.AreEqual("integer:9000000000", Scalar(conn, "SELECT typeof(l)||':'||l FROM t"));
                Assert.AreEqual("real:12.5", Scalar(conn, "SELECT typeof(d)||':'||d FROM t"));
                Assert.AreEqual("2026-11-11 16:38:51", Scalar(conn, "SELECT dt1 FROM t"), "unspecified DateTime: no fraction, no zone");
                Assert.AreEqual("2026-11-11 16:38:51.5", Scalar(conn, "SELECT dt2 FROM t"), "local DateTime: trimmed fraction, no zone");
                Assert.AreEqual("2026-11-11 14:38:51Z", Scalar(conn, "SELECT dt3 FROM t"), "UTC DateTime keeps the Z suffix");
                Assert.AreEqual("blob:33221100554477668899AABBCCDDEEFF", Scalar(conn, "SELECT typeof(g)||':'||hex(g) FROM t"), "Guid binds as 16 byte blob");
                Assert.AreEqual("blob:010203", Scalar(conn, "SELECT typeof(blob)||':'||hex(blob) FROM t"));
                Assert.AreEqual("integer:6", Scalar(conn, "SELECT typeof(e)||':'||e FROM t"), "enum binds its integer value");
            }
        }

        [Test]
        public void Reader_FollowsDeclaredColumnTypes_AndExpressionsFollowTheStoredValue()
        {
            using (var conn = new SQLiteConnection(ConnString("reader.db", "")))
            {
                conn.Open();
                Exec(conn, "CREATE TABLE r (id INTEGER PRIMARY KEY, name TEXT, qty INT, price REAL, flag BOOLEAN, created DATETIME, note TEXT)");
                Exec(conn, "INSERT INTO r VALUES (1,'abc',5,1.25,1,'2026-11-11 16:38:51.5',NULL)");
                using (var cmd = new SQLiteCommand("SELECT id, name, qty, price, flag, created, note, COUNT(*), 'x', 1.5 FROM r", conn))
                using (SQLiteDataReader reader = cmd.ExecuteReader())
                {
                    Assert.IsTrue(reader.Read());
                    Assert.IsInstanceOf<long>(reader[0], "INTEGER column is Int64");
                    Assert.IsInstanceOf<string>(reader[1]);
                    Assert.IsInstanceOf<int>(reader[2], "INT column is Int32 like the old library");
                    Assert.IsInstanceOf<double>(reader[3]);
                    Assert.IsInstanceOf<bool>(reader[4], "BOOLEAN column is bool");
                    Assert.AreEqual(new DateTime(2026, 11, 11, 16, 38, 51, 500), reader[5], "DATETIME column is DateTime");
                    Assert.AreSame(DBNull.Value, reader[6]);
                    Assert.IsTrue(reader.IsDBNull(6));
                    Assert.IsInstanceOf<long>(reader[7], "COUNT(*) is Int64");
                    Assert.IsInstanceOf<string>(reader[8]);
                    Assert.IsInstanceOf<double>(reader[9]);
                    Assert.AreEqual(1, reader.GetOrdinal("NAME"));
                    Assert.AreEqual(-1, reader.GetOrdinal("missing"), "unknown column returns -1, not an exception");
                    Assert.AreEqual(5, reader.GetInt32(2));
                    Assert.AreEqual(1L, reader.GetInt64(0));
                    Assert.AreEqual("abc", reader.GetString(1));
                    Assert.Throws<InvalidCastException>(delegate { reader.GetString(2); }, "typed getter verifies the stored type");
                    Assert.Throws<InvalidCastException>(delegate { reader.GetString(6); }, "GetString on NULL throws");
                }
                Assert.IsNull(Scalar(conn, "SELECT id FROM r WHERE id = 999"), "ExecuteScalar without rows is null");
                Assert.AreEqual(5, Scalar(conn, "SELECT qty FROM r"));
            }
        }

        [Test]
        public void ParameterDbType_IsFixedByTheFirstValue_AndExplicitTypesConvert()
        {
            using (var conn = new SQLiteConnection(ConnString("dbtype.db", "")))
            {
                conn.Open();
                Exec(conn, "CREATE TABLE s (a, b, c)");
                using (var cmd = new SQLiteCommand("INSERT INTO s VALUES (@a,@b,@c)", conn))
                {
                    cmd.Parameters.Add("@a", DbType.Int64).Value = "12";
                    cmd.Parameters.Add("@b", DbType.String).Value = 5L;
                    cmd.Parameters.Add("@c", DbType.Boolean).Value = "true";
                    cmd.ExecuteNonQuery();
                }
                Assert.AreEqual("integer:12", Scalar(conn, "SELECT typeof(a)||':'||a FROM s"));
                Assert.AreEqual("text:5", Scalar(conn, "SELECT typeof(b)||':'||b FROM s"));
                Assert.AreEqual("integer:1", Scalar(conn, "SELECT typeof(c)||':'||c FROM s"));
                using (var cmd = new SQLiteCommand("SELECT @x", conn))
                {
                    SQLiteParameter p = cmd.Parameters.AddWithValue("@x", null);
                    p.Value = 5L;
                    p.Value = "7";
                    Assert.AreEqual(7L, cmd.ExecuteScalar(), "DbType became Int64 with the first non-null value");
                }
            }
        }

        [Test]
        public void Transactions_BeginImmediate_RollbackOnDispose_AndNestingJoinsTheOuterOne()
        {
            using (var conn = new SQLiteConnection(ConnString("tx.db", "BusyTimeout=100;Default Timeout=1;")))
            {
                conn.Open();
                Exec(conn, "CREATE TABLE t (id INTEGER)");
                using (SQLiteTransaction tx = conn.BeginTransaction())
                {
                    Exec(conn, "INSERT INTO t VALUES (1)");
                    tx.Commit();
                }
                using (SQLiteTransaction tx = conn.BeginTransaction())
                {
                    Exec(conn, "INSERT INTO t VALUES (2)");
                }
                Assert.AreEqual(1L, Scalar(conn, "SELECT COUNT(*) FROM t"), "dispose without commit rolls back");

                using (SQLiteTransaction outer = conn.BeginTransaction())
                {
                    using (var other = new SQLiteConnection(ConnString("tx.db", "BusyTimeout=100;Default Timeout=1;")))
                    {
                        other.Open();
                        SQLiteException busy = Assert.Throws<SQLiteException>(delegate { other.BeginTransaction(); }, "default BeginTransaction is BEGIN IMMEDIATE");
                        Assert.AreEqual((int)SQLiteErrorCode.Busy, (int)busy.ResultCode & 0xFF);
                    }
                    using (SQLiteTransaction inner = conn.BeginTransaction())
                    {
                        Exec(conn, "INSERT INTO t VALUES (10)");
                        inner.Commit();
                    }
                    outer.Rollback();
                }
                Assert.AreEqual(1L, Scalar(conn, "SELECT COUNT(*) FROM t"), "outer rollback discards the nested work");

                Exec(conn, "CREATE TABLE guard (id INTEGER); CREATE TRIGGER g1 BEFORE INSERT ON guard BEGIN SELECT RAISE(ROLLBACK, 'immutable'); END;");
                using (SQLiteTransaction tx = conn.BeginTransaction())
                {
                    Assert.Throws<SQLiteException>(delegate { Exec(conn, "INSERT INTO guard VALUES (1)"); });
                    Assert.Throws<SQLiteException>(delegate { tx.Commit(); }, "SQLite already ended the transaction");
                }
            }
        }

        [Test]
        public void Scripts_RunEveryStatement_AndScalarReturnsTheFirstQueryResult()
        {
            using (var conn = new SQLiteConnection(ConnString("script.db", "")))
            {
                conn.Open();
                Assert.AreEqual(3, Exec(conn, "CREATE TABLE m (id INTEGER PRIMARY KEY, v TEXT); INSERT INTO m (v) VALUES ('a'); INSERT INTO m (v) VALUES ('b'); INSERT INTO m (v) VALUES ('c');"));
                Assert.AreEqual(4L, Scalar(conn, "INSERT INTO m (v) VALUES ('d'); SELECT last_insert_rowid();"));
                using (var cmd = new SQLiteCommand("SELECT v FROM m ORDER BY id; INSERT INTO m (v) VALUES ('after')", conn))
                using (SQLiteDataReader reader = cmd.ExecuteReader())
                {
                    Assert.IsTrue(reader.Read());
                }
                Assert.AreEqual(1L, Scalar(conn, "SELECT COUNT(*) FROM m WHERE v = 'after'"), "statements after the SELECT still run when the reader is disposed");
                SQLiteException ex = Assert.Throws<SQLiteException>(delegate { Exec(conn, "INSERT INTO m (v) VALUES ('x1'); INSERT INTO nope VALUES (1); INSERT INTO m (v) VALUES ('x2')"); });
                Assert.AreEqual(SQLiteErrorCode.Error, ex.ResultCode);
                Assert.AreEqual(0L, Scalar(conn, "SELECT COUNT(*) FROM m WHERE v = 'x2'"), "statements after the failing one do not run");
            }
        }

        [Test]
        public void Errors_AreSQLiteExceptionsWithThePrimaryResultCode()
        {
            using (var conn = new SQLiteConnection(ConnString("errors.db", "")))
            {
                conn.Open();
                Exec(conn, "CREATE TABLE u (id INTEGER PRIMARY KEY, k TEXT UNIQUE)");
                Exec(conn, "INSERT INTO u (k) VALUES ('a')");
                SQLiteException unique = Assert.Throws<SQLiteException>(delegate { Exec(conn, "INSERT INTO u (k) VALUES ('a')"); });
                Assert.AreEqual(SQLiteErrorCode.Constraint, unique.ResultCode & (SQLiteErrorCode)0xFF);
                StringAssert.Contains("UNIQUE constraint failed", unique.Message);
                SQLiteException missingTable = Assert.Throws<SQLiteException>(delegate { Exec(conn, "SELECT * FROM nope"); });
                Assert.AreEqual(SQLiteErrorCode.Error, missingTable.ResultCode);
                using (var cmd = new SQLiteCommand("SELECT @missing", conn))
                {
                    Assert.Throws<SQLiteException>(delegate { cmd.ExecuteScalar(); }, "a parameter without a value is a SQLiteException");
                }
            }
            File.WriteAllText(Path.Combine(_dir, "garbage.db"), new string('x', 5000));
            using (var conn = new SQLiteConnection(ConnString("garbage.db", "")))
            {
                SQLiteException notDb = Assert.Throws<SQLiteException>(delegate { conn.Open(); Scalar(conn, "SELECT COUNT(*) FROM sqlite_master"); });
                Assert.AreEqual(SQLiteErrorCode.NotADb, notDb.ResultCode);
            }
        }

        [Test]
        public void EngineDefaults_MatchTheLegacyEngine()
        {
            using (var conn = new SQLiteConnection(ConnString("defaults.db", "")))
            {
                conn.Open();
                Assert.AreEqual(0L, Scalar(conn, "PRAGMA foreign_keys"), "foreign keys stay off unless the connection string asks for them");
                Assert.AreEqual(0L, Scalar(conn, "PRAGMA secure_delete"));
                Assert.AreEqual(0L, Scalar(conn, "PRAGMA recursive_triggers"));
                // plain connections keep the old TEMP_STORE=1 behaviour; a keyed (encrypted) connection must never spill decrypted data to plain temp files
                Assert.AreEqual(TestMode.Plain ? 1L : 2L, Scalar(conn, "PRAGMA temp_store"), "temp store: FILE for plain connections, MEMORY for keyed ones");
                Assert.AreEqual(0L, Scalar(conn, "PRAGMA busy_timeout"));
                Assert.AreEqual("abc", Scalar(conn, "SELECT \"abc\""), "double-quoted text literals keep working");
            }
            using (var conn = new SQLiteConnection(ConnString("prod.db", "BusyTimeout=5000;Foreign Keys=True;Journal Mode=Wal;Synchronous=Full;CacheSize=4000;")))
            {
                conn.Open();
                Assert.AreEqual(5000L, Scalar(conn, "PRAGMA busy_timeout"));
                Assert.AreEqual(1L, Scalar(conn, "PRAGMA foreign_keys"));
                Assert.AreEqual("wal", Scalar(conn, "PRAGMA journal_mode"));
                Assert.AreEqual(2L, Scalar(conn, "PRAGMA synchronous"), "FULL");
                Assert.AreEqual(-2000L, Scalar(conn, "PRAGMA cache_size"), "'CacheSize' (no space) was never a recognised keyword");
            }
            Assert.AreEqual(!TestMode.Plain, SQLiteConnection.ConnectionKeyHook != null, "the default key hook is installed (unless RAFIQ_TEST_PLAIN=1)");
        }

        [Test]
        public void ReadOnly_RejectsWrites_AndFailIfMissingDoesNotCreateTheFile()
        {
            using (var conn = new SQLiteConnection(ConnString("ro.db", "")))
            {
                conn.Open();
                Exec(conn, "CREATE TABLE r (id INTEGER)");
            }
            using (var conn = new SQLiteConnection(ConnString("ro.db", "Read Only=True;")))
            {
                conn.Open();
                SQLiteException ex = Assert.Throws<SQLiteException>(delegate { Exec(conn, "INSERT INTO r VALUES (1)"); });
                Assert.AreEqual(SQLiteErrorCode.ReadOnly, ex.ResultCode & (SQLiteErrorCode)0xFF);
            }
            string missing = Path.Combine(_dir, "missing.db");
            using (var conn = new SQLiteConnection("Data Source=" + missing + ";Version=3;FailIfMissing=True;Pooling=False;"))
            {
                SQLiteException ex = Assert.Throws<SQLiteException>(delegate { conn.Open(); });
                Assert.AreEqual(SQLiteErrorCode.CantOpen, ex.ResultCode);
                Assert.AreEqual(ConnectionState.Closed, conn.State);
            }
            Assert.IsFalse(File.Exists(missing));
        }

        [Test]
        public void BackupDatabase_CopiesEverything_AndFilesCanBeDeletedAfterClearAllPools()
        {
            string source = Path.Combine(_dir, "src.db");
            string copy = Path.Combine(_dir, "copy.db");
            using (var src = new SQLiteConnection("Data Source=" + source + ";Version=3;Journal Mode=Wal;"))
            {
                src.Open();
                Exec(src, "CREATE TABLE b (id INTEGER PRIMARY KEY, v TEXT)");
                using (SQLiteTransaction tx = src.BeginTransaction())
                {
                    for (int i = 0; i < 200; i++)
                    {
                        using (var cmd = new SQLiteCommand("INSERT INTO b (v) VALUES (@v)", src, tx))
                        {
                            cmd.Parameters.AddWithValue("@v", "row" + i);
                            cmd.ExecuteNonQuery();
                        }
                    }
                    tx.Commit();
                }
                using (var dst = new SQLiteConnection("Data Source=" + copy + ";Version=3;"))
                {
                    dst.Open();
                    src.BackupDatabase(dst, "main", "main", -1, null, 100);
                }
            }
            using (var check = new SQLiteConnection("Data Source=" + copy + ";Version=3;Read Only=True;"))
            {
                check.Open();
                Assert.AreEqual(200L, Scalar(check, "SELECT COUNT(*) FROM b"));
                Assert.AreEqual("ok", Scalar(check, "PRAGMA integrity_check"));
            }
            SQLiteConnection.ClearAllPools();
            File.Delete(copy);
            File.Delete(source);
            Assert.IsFalse(File.Exists(copy));
            Assert.IsFalse(File.Exists(source));
        }
    }
}
