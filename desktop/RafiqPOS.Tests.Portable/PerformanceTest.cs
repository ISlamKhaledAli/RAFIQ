using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.Text;
using NUnit.Framework;
using RafiqPOS.Data;
using RafiqPOS.Models;

namespace RafiqPOS.Tests.Portable
{
    /// <summary>
    /// Timings of the shim on a plain database (numbers are for the machine that runs them; the repo records macOS/arm64 figures only).
    /// Not part of the default run: dotnet test --filter "TestCategory=Performance" --logger "console;verbosity=detailed"
    /// </summary>
    [TestFixture]
    [Category("Performance")]
    public class PerformanceTest : RafiqPOS.Tests.TestBase
    {
        private static void Report(string text)
        {
            TestContext.Progress.WriteLine("PERF " + text);
        }

        private static double Median(List<double> values)
        {
            values.Sort();
            return values[values.Count / 2];
        }

        /// <summary>
        /// Encrypted versus plain on the same data in the same process: connection open (with the production keyword PRAGMAs and a first
        /// schema read) and a 1000-row read. The budget from the design brief: open overhead at most 3 ms.
        /// </summary>
        [Test]
        public void EncryptionOverhead_OpenAndThousandRowRead()
        {
            // The TestBase database is in the current mode; the second format is produced by the verified converters
            string current = TestDbPath;
            string other = TestDbPath + ".other";
            string plainPath;
            string encryptedPath;
            using (var conn = new SQLiteConnection(ConnectionString))
            {
                conn.Open();
                var sw = Stopwatch.StartNew();
                using (var tx = conn.BeginTransaction())
                {
                    using (var cmd = new SQLiteCommand("CREATE TABLE bench (id INTEGER PRIMARY KEY, a TEXT, b INTEGER, c REAL);", conn, tx)) cmd.ExecuteNonQuery();
                    using (var cmd = new SQLiteCommand("WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 50000) "
                        + "INSERT INTO bench (a, b, c) SELECT 'صنف اختبار ' || i, i * 7, i / 3.0 FROM n;", conn, tx)) cmd.ExecuteNonQuery();
                    tx.Commit();
                }
                using (var cmd = new SQLiteCommand("PRAGMA wal_checkpoint(TRUNCATE);", conn)) cmd.ExecuteNonQuery();
                Report("seed 50000 bench rows (" + (DatabaseKeyProvider.IsDefaultEncryptionEnabled ? "encrypted" : "plain") + " mode): " + sw.ElapsedMilliseconds + " ms");
            }
            SQLiteConnection.ClearAllPools();
            if (DatabaseKeyProvider.IsPlainSqliteFile(current))
            {
                plainPath = current;
                encryptedPath = other;
                RafiqPOS.Services.DatabaseEncryptionService.EncryptPlainCopy(plainPath, encryptedPath);
            }
            else
            {
                encryptedPath = current;
                plainPath = other;
                RafiqPOS.Services.DatabaseEncryptionService.ExportDecrypted(ConnectionString, plainPath);
            }

            string production = "Version=3;BusyTimeout=5000;Foreign Keys=True;Journal Mode=Wal;Synchronous=Full;CacheSize=4000;";
            // explicit formats, independent of the process mode (RAFIQ_TEST_PLAIN)
            string plainConn = "Data Source=" + plainPath + ";" + production + "Encryption=None;";
            string encConn = "Data Source=" + encryptedPath + ";" + production + "Encryption=Product;";

            for (int warm = 0; warm < 20; warm++)
            {
                OpenAndTouch(plainConn);
                OpenAndTouch(encConn);
            }
            var plainOpen = new List<double>();
            var encOpen = new List<double>();
            for (int i = 0; i < 400; i++)
            {
                // interleaved so drift in machine load hits both equally
                plainOpen.Add(OpenAndTouch(plainConn));
                encOpen.Add(OpenAndTouch(encConn));
            }
            double plainMs = Median(plainOpen);
            double encMs = Median(encOpen);
            Report("connection open + first schema read (production keywords), median of 400: plain " + plainMs.ToString("0.000", CultureInfo.InvariantCulture)
                + " ms, encrypted " + encMs.ToString("0.000", CultureInfo.InvariantCulture) + " ms, overhead "
                + (encMs - plainMs).ToString("0.000", CultureInfo.InvariantCulture) + " ms (budget 3 ms)");

            var plainRead = new List<double>();
            var encRead = new List<double>();
            for (int i = 0; i < 200; i++)
            {
                plainRead.Add(ReadThousandRows(plainConn));
                encRead.Add(ReadThousandRows(encConn));
            }
            Report("open + read 1000 rows (id,a,b,c), median of 200: plain " + Median(plainRead).ToString("0.000", CultureInfo.InvariantCulture)
                + " ms, encrypted " + Median(encRead).ToString("0.000", CultureInfo.InvariantCulture) + " ms");

            var plainScan = new List<double>();
            var encScan = new List<double>();
            for (int i = 0; i < 15; i++)
            {
                plainScan.Add(ScanAll(plainConn));
                encScan.Add(ScanAll(encConn));
            }
            Report("full scan SUM over 50000 rows (cold-ish page cache per open), median of 15: plain " + Median(plainScan).ToString("0.00", CultureInfo.InvariantCulture)
                + " ms, encrypted " + Median(encScan).ToString("0.00", CultureInfo.InvariantCulture) + " ms");

            long plainBytes = new System.IO.FileInfo(plainPath).Length;
            long encBytes = new System.IO.FileInfo(encryptedPath).Length;
            Report("file size: plain " + plainBytes + " bytes, encrypted " + encBytes + " bytes");
            SQLiteConnection.ClearAllPools();
            foreach (string suffix in new string[] { "", "-wal", "-shm", "-journal" })
            {
                try { if (System.IO.File.Exists(other + suffix)) System.IO.File.Delete(other + suffix); } catch (System.IO.IOException) { }
            }
            Assert.Less(encMs - plainMs, 3.0, "connection open overhead with the key exceeds the 3 ms budget");
        }

        private static double OpenAndTouch(string cs)
        {
            long start = Stopwatch.GetTimestamp();
            using (var conn = new SQLiteConnection(cs))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand("SELECT count(*) FROM sqlite_master;", conn)) cmd.ExecuteScalar();
            }
            return (Stopwatch.GetTimestamp() - start) * 1000.0 / Stopwatch.Frequency;
        }

        private static double ReadThousandRows(string cs)
        {
            long start = Stopwatch.GetTimestamp();
            long sum = 0;
            using (var conn = new SQLiteConnection(cs))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand("SELECT id, a, b, c FROM bench ORDER BY id LIMIT 1000;", conn))
                using (var reader = cmd.ExecuteReader())
                {
                    while (reader.Read()) sum += reader.GetInt64(0) + reader.GetString(1).Length + reader.GetInt64(2);
                }
            }
            Assert.Greater(sum, 0);
            return (Stopwatch.GetTimestamp() - start) * 1000.0 / Stopwatch.Frequency;
        }

        private static double ScanAll(string cs)
        {
            long start = Stopwatch.GetTimestamp();
            using (var conn = new SQLiteConnection(cs))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand("SELECT SUM(b), SUM(c), SUM(length(a)) FROM bench;", conn))
                using (var reader = cmd.ExecuteReader())
                {
                    Assert.IsTrue(reader.Read());
                }
            }
            return (Stopwatch.GetTimestamp() - start) * 1000.0 / Stopwatch.Frequency;
        }

        [Test]
        public void ThousandSales_ThroughSaleService()
        {
            var shift = OpenTestShift();
            var products = new List<Product>();
            for (int i = 0; i < 20; i++) products.Add(CreateTestProduct("صنف " + i, 1000 + i * 100, 600, 100000000, "62210000" + (10000 + i)));

            var sw = Stopwatch.StartNew();
            for (int n = 0; n < 1000; n++)
            {
                var items = new List<SaleItem>();
                long total = 0;
                for (int k = 0; k < 3; k++)
                {
                    Product p = products[(n + k) % products.Count];
                    long line = p.PricePiasters * 2;
                    total += line;
                    items.Add(new SaleItem { ProductId = p.Id, ProductName = p.Name, QuantityMilli = 2000, UnitPricePiasters = p.PricePiasters, TotalPiasters = line });
                }
                SaleService.ProcessSale(new Sale
                {
                    ShiftId = shift.Id,
                    CashierId = shift.CashierId,
                    CashierName = shift.CashierName,
                    PaymentMethod = "cash",
                    PaidPiasters = total,
                    Items = items
                }, null);
            }
            sw.Stop();
            Report("1000 cash sales x 3 items via SaleService.ProcessSale (TestBase connection string: journal DELETE, synchronous FULL, file DB): " + sw.ElapsedMilliseconds + " ms total, "
                + (sw.ElapsedMilliseconds / 1000.0).ToString("0.00", CultureInfo.InvariantCulture) + " ms per sale");
            using (var conn = new SQLiteConnection(ConnectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand("SELECT COUNT(*) FROM sales", conn)) Assert.AreEqual(1000L, cmd.ExecuteScalar());
            }
        }

        [Test]
        public void FiftyThousandProducts_ExactBarcodeLookup()
        {
            Product template = CreateTestProduct("قالب", 1000, 700, 1000, "6000000000000");
            var columns = new List<string>();
            using (var conn = new SQLiteConnection(ConnectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand("PRAGMA table_info(products)", conn))
                using (var reader = cmd.ExecuteReader())
                {
                    while (reader.Read()) columns.Add(reader["name"].ToString());
                }
                var select = new StringBuilder();
                var insert = new StringBuilder();
                foreach (string c in columns)
                {
                    if (insert.Length > 0) { insert.Append(","); select.Append(","); }
                    insert.Append(c);
                    if (c == "id") select.Append("'perf_' || n.i");
                    else if (c == "barcode") select.Append("printf('%013d', 6000000000000 + n.i)");
                    else if (c == "name") select.Append("'صنف اختبار ' || n.i");
                    else select.Append("p." + c);
                }
                string sql = "WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 50000) INSERT INTO products (" + insert + ") SELECT " + select
                    + " FROM n, (SELECT * FROM products WHERE id = @tid) p;";
                var sw = Stopwatch.StartNew();
                using (var tx = conn.BeginTransaction())
                {
                    using (var cmd = new SQLiteCommand(sql, conn, tx))
                    {
                        cmd.Parameters.AddWithValue("@tid", template.Id);
                        cmd.CommandTimeout = 300;
                        cmd.ExecuteNonQuery();
                    }
                    tx.Commit();
                }
                sw.Stop();
                Report("seed 50000 products with INSERT..SELECT: " + sw.ElapsedMilliseconds + " ms");
                string keepCopy = Environment.GetEnvironmentVariable("RAFIQ_PERF_KEEP_DB");
                if (!string.IsNullOrEmpty(keepCopy))
                {
                    using (var dst = new SQLiteConnection("Data Source=" + keepCopy + ";Version=3;"))
                    {
                        dst.Open();
                        conn.BackupDatabase(dst, "main", "main", -1, null, 100);
                    }
                }
                using (var cmd = new SQLiteCommand("SELECT COUNT(*) FROM products", conn)) Assert.AreEqual(50001L, cmd.ExecuteScalar());
            }

            var random = new Random(42);
            var timings = new List<double>();
            ProductRepo.GetByExactBarcode("6000000000001"); // warm up
            for (int i = 0; i < 2000; i++)
            {
                string code = (6000000000000L + random.Next(1, 50001)).ToString("D13", CultureInfo.InvariantCulture);
                long start = Stopwatch.GetTimestamp();
                List<Product> found = ProductRepo.GetByExactBarcode(code);
                timings.Add((Stopwatch.GetTimestamp() - start) * 1000.0 / Stopwatch.Frequency);
                Assert.AreEqual(1, found.Count, code);
            }
            timings.Sort();
            using (var conn = new SQLiteConnection(ConnectionString))
            {
                conn.Open();
                var plan = new StringBuilder();
                foreach (string table in new string[] { "products", "product_barcodes", "product_units" })
                {
                    using (var cmd = new SQLiteCommand("EXPLAIN QUERY PLAN SELECT id FROM " + table + " WHERE barcode = @bc", conn))
                    {
                        cmd.Parameters.AddWithValue("@bc", "6000000000001");
                        using (var reader = cmd.ExecuteReader())
                        {
                            while (reader.Read()) plan.Append(table + ": " + reader["detail"] + "; ");
                        }
                    }
                }
                Report("query plan (SQLite " + conn.ServerVersion + "): " + plan);
                var open = Stopwatch.StartNew();
                for (int i = 0; i < 500; i++) using (var c2 = new SQLiteConnection(ConnectionString)) { c2.Open(); }
                open.Stop();
                Report("connection open+close with the TestBase connection string BusyTimeout=5000 (500): " + (open.ElapsedMilliseconds / 500.0).ToString("0.000", CultureInfo.InvariantCulture) + " ms each");
            }
            Report("exact barcode lookup in 50001 products (ProductRepository.GetByExactBarcode, 2000 random hits): p50 "
                + timings[1000].ToString("0.000", CultureInfo.InvariantCulture) + " ms, p95 " + timings[1900].ToString("0.000", CultureInfo.InvariantCulture)
                + " ms, max " + timings[1999].ToString("0.000", CultureInfo.InvariantCulture) + " ms");

            var missTimings = new List<double>();
            using (var persistent = new SQLiteConnection(ConnectionString))
            {
                persistent.Open();
                string sqlText = RafiqPOS.Repositories.ProductRepository.BuildExactBarcodeSql(false, false);
                var pt = new List<double>();
                for (int i = 0; i < 1000; i++)
                {
                    string code = (6000000000000L + random.Next(1, 50001)).ToString("D13", CultureInfo.InvariantCulture);
                    long start = Stopwatch.GetTimestamp();
                    using (var cmd = new SQLiteCommand(sqlText, persistent))
                    {
                        cmd.Parameters.AddWithValue("@bc", code);
                        cmd.Parameters.AddWithValue("@limit", 5);
                        using (var r = cmd.ExecuteReader()) { while (r.Read()) { } }
                    }
                    pt.Add((Stopwatch.GetTimestamp() - start) * 1000.0 / Stopwatch.Frequency);
                }
                pt.Sort();
                Report("exact barcode SQL alone on ONE already-open connection (1000 hits): p50 " + pt[500].ToString("0.000", CultureInfo.InvariantCulture) + " ms, p95 " + pt[950].ToString("0.000", CultureInfo.InvariantCulture) + " ms");
            }
            for (int i = 0; i < 500; i++)
            {
                long start = Stopwatch.GetTimestamp();
                ProductRepo.GetByExactBarcode("9" + i.ToString("D12", CultureInfo.InvariantCulture));
                missTimings.Add((Stopwatch.GetTimestamp() - start) * 1000.0 / Stopwatch.Frequency);
            }
            missTimings.Sort();
            Report("exact barcode lookup, unknown barcode (500): p50 " + missTimings[250].ToString("0.000", CultureInfo.InvariantCulture) + " ms, max "
                + missTimings[499].ToString("0.000", CultureInfo.InvariantCulture) + " ms");

            foreach (string q in new string[] { "6000000012345", "صنف اختبار 4321", "اختبار 99" })
            {
                ProductRepo.Search(q, 50, 0, "all", "all");
                var ts = new List<double>();
                for (int i = 0; i < 20; i++)
                {
                    long start = Stopwatch.GetTimestamp();
                    ProductRepo.Search(q, 50, 0, "all", "all");
                    ts.Add((Stopwatch.GetTimestamp() - start) * 1000.0 / Stopwatch.Frequency);
                }
                ts.Sort();
                Report("Search(\"" + q + "\", limit 50, includeCounts=false path) in 50001 products (20 runs): p50 " + ts[10].ToString("0.0", CultureInfo.InvariantCulture) + " ms, max " + ts[19].ToString("0.0", CultureInfo.InvariantCulture) + " ms");
            }
            foreach (int limit in new int[] { 200, 50000 })
            {
                ProductRepo.GetSmartCatalog(limit);
                var ts = new List<double>();
                for (int i = 0; i < 5; i++)
                {
                    long start = Stopwatch.GetTimestamp();
                    ProductRepo.GetSmartCatalog(limit);
                    ts.Add((Stopwatch.GetTimestamp() - start) * 1000.0 / Stopwatch.Frequency);
                }
                ts.Sort();
                Report("GetSmartCatalog(limit " + limit + ") in 50001 products (5 runs): p50 " + ts[2].ToString("0", CultureInfo.InvariantCulture) + " ms, max " + ts[4].ToString("0", CultureInfo.InvariantCulture) + " ms");
            }
        }

        [Test]
        public void ShimOverhead_VersusTheRawProvider()
        {
            string path = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "perf_raw_" + Guid.NewGuid().ToString("N") + ".db");
            string cs = "Data Source=" + path + ";Version=3;BusyTimeout=5000;Foreign Keys=True;Journal Mode=Wal;Synchronous=Full;Encryption=None;"; // plain on purpose: the raw provider below has no key
            try
            {
                using (var c = new SQLiteConnection(cs))
                {
                    c.Open();
                    using (var cmd = new SQLiteCommand("CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT, qty INTEGER, price INTEGER)", c)) cmd.ExecuteNonQuery();
                    using (var tx = c.BeginTransaction())
                    {
                        for (int i = 0; i < 5000; i++)
                            using (var cmd = new SQLiteCommand("INSERT INTO t (name, qty, price) VALUES (@n,@q,@p)", c, tx))
                            {
                                cmd.Parameters.AddWithValue("@n", "n" + i); cmd.Parameters.AddWithValue("@q", i); cmd.Parameters.AddWithValue("@p", i * 10L);
                                cmd.ExecuteNonQuery();
                            }
                        tx.Commit();
                    }
                }

                // shim: 20000 point reads on one open connection
                var sw = Stopwatch.StartNew();
                long sum = 0;
                using (var c = new SQLiteConnection(cs))
                {
                    c.Open();
                    for (int i = 0; i < 20000; i++)
                        using (var cmd = new SQLiteCommand("SELECT name, qty, price FROM t WHERE id = @id", c))
                        {
                            cmd.Parameters.AddWithValue("@id", (i % 5000) + 1);
                            using (var r = cmd.ExecuteReader()) { while (r.Read()) sum += Convert.ToInt64(r["qty"]) + Convert.ToInt64(r["price"]) + r["name"].ToString().Length; }
                        }
                }
                sw.Stop();
                double shimMs = sw.Elapsed.TotalMilliseconds;

                SQLitePCL.Batteries_V2.Init();
                sw.Restart();
                long sum2 = 0;
                using (var c = new Microsoft.Data.Sqlite.SqliteConnection("Data Source=" + path + ";Pooling=False"))
                {
                    c.Open();
                    for (int i = 0; i < 20000; i++)
                        using (var cmd = c.CreateCommand())
                        {
                            cmd.CommandText = "SELECT name, qty, price FROM t WHERE id = @id";
                            cmd.Parameters.AddWithValue("@id", (long)((i % 5000) + 1));
                            using (var r = cmd.ExecuteReader()) { while (r.Read()) sum2 += Convert.ToInt64(r["qty"]) + Convert.ToInt64(r["price"]) + r["name"].ToString().Length; }
                        }
                }
                sw.Stop();
                double rawMs = sw.Elapsed.TotalMilliseconds;
                Assert.AreEqual(sum, sum2);
                Report("20000 point reads on one open connection: shim " + shimMs.ToString("0", CultureInfo.InvariantCulture) + " ms ("
                    + (shimMs / 20000).ToString("0.0000", CultureInfo.InvariantCulture) + " ms each) vs raw Microsoft.Data.Sqlite "
                    + rawMs.ToString("0", CultureInfo.InvariantCulture) + " ms (" + (rawMs / 20000).ToString("0.0000", CultureInfo.InvariantCulture) + " ms each)");

                sw.Restart();
                using (var c = new SQLiteConnection(cs))
                {
                    c.Open();
                    for (int i = 0; i < 300; i++)
                        using (var tx = c.BeginTransaction())
                        {
                            using (var cmd = new SQLiteCommand("INSERT INTO t (name, qty, price) VALUES ('x', 1, 1)", c, tx)) cmd.ExecuteNonQuery();
                            tx.Commit();
                        }
                }
                sw.Stop();
                Report("300 durable single-row transactions (BEGIN IMMEDIATE + INSERT + COMMIT, WAL, synchronous=FULL): "
                    + (sw.Elapsed.TotalMilliseconds / 300).ToString("0.00", CultureInfo.InvariantCulture) + " ms each");
            }
            finally
            {
                SQLiteConnection.ClearAllPools();
                foreach (string f in new string[] { path, path + "-wal", path + "-shm" }) { try { System.IO.File.Delete(f); } catch (System.IO.IOException) { } }
            }
        }
    }
}
