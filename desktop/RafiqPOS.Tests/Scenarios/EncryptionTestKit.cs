using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using System.Security.Cryptography;
using RafiqPOS.Data;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    /// <summary>
    /// Shared helpers of the database-encryption scenarios (S104 and up): temp folders, hashing, plaintext scans and a realistic
    /// legacy (plain) store that every conversion test copies instead of rebuilding.
    /// </summary>
    internal static class EncryptionTestKit
    {
        public const string SqliteMagic = "SQLite format 3";

        // A key that is not the product key (wrong-key and conversion tests)
        public static byte[] OtherKey()
        {
            byte[] key = new byte[32];
            for (int i = 0; i < key.Length; i++) key[i] = (byte)(i * 7 + 3);
            return key;
        }

        public static string NewFolder(string prefix)
        {
            string path = Path.Combine(Path.GetTempPath(), prefix + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(path);
            return path;
        }

        public static void DeleteFolder(string path)
        {
            if (string.IsNullOrEmpty(path)) return;
            SQLiteConnection.ClearAllPools();
            GC.Collect();
            GC.WaitForPendingFinalizers();
            try { Directory.Delete(path, true); } catch (IOException) { } catch (UnauthorizedAccessException) { }
        }

        public static string Sha256Hex(string path)
        {
            using (SHA256 sha = SHA256.Create())
            using (FileStream fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
            {
                return DatabaseKeyProvider.ToHex(sha.ComputeHash(fs));
            }
        }

        public static bool HasSqliteMagic(string path)
        {
            try
            {
                byte[] header = new byte[16];
                using (FileStream fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
                {
                    if (fs.Read(header, 0, 16) < 16) return false;
                }
                return System.Text.Encoding.ASCII.GetString(header, 0, 15) == SqliteMagic;
            }
            catch (IOException)
            {
                return false;
            }
        }

        // Every file under root whose first bytes are the plain SQLite header
        public static List<string> FindPlainSqliteFiles(string root)
        {
            List<string> found = new List<string>();
            if (!Directory.Exists(root)) return found;
            foreach (string file in Directory.GetFiles(root, "*", SearchOption.AllDirectories))
            {
                if (HasSqliteMagic(file)) found.Add(file);
            }
            return found;
        }

        // Files (any extension: db, wal, journal, temp copies) under root whose bytes contain the UTF-8 text: a plaintext leak
        public static List<string> FindFilesContaining(string root, string text)
        {
            List<string> found = new List<string>();
            if (!Directory.Exists(root)) return found;
            byte[] needle = System.Text.Encoding.UTF8.GetBytes(text);
            foreach (string file in Directory.GetFiles(root, "*", SearchOption.AllDirectories))
            {
                try
                {
                    if (IndexOf(File.ReadAllBytes(file), needle) >= 0) found.Add(file);
                }
                catch (IOException) { }
            }
            return found;
        }

        public static int IndexOf(byte[] haystack, byte[] needle)
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

        // Plain SQLite files (rafiq_* files and the contents of rafiq_* folders) in the temp folder that did not exist in the snapshot
        public static List<string> FindNewPlainTempFiles(HashSet<string> before)
        {
            List<string> found = new List<string>();
            foreach (string entry in Directory.GetFileSystemEntries(Path.GetTempPath(), "rafiq_*"))
            {
                if (before.Contains(entry)) continue;
                // the test-only legacy template is deliberately plain
                if (entry.IndexOf("rafiq_nunit_legacy_", StringComparison.Ordinal) >= 0) continue;
                if (Directory.Exists(entry)) found.AddRange(FindPlainSqliteFiles(entry));
                else if (HasSqliteMagic(entry)) found.Add(entry);
            }
            return found;
        }

        public static HashSet<string> SnapshotTempFiles()
        {
            return new HashSet<string>(Directory.GetFileSystemEntries(Path.GetTempPath(), "rafiq_*"), StringComparer.OrdinalIgnoreCase);
        }

        public static IDictionary<string, string> Fingerprint(string path)
        {
            using (SQLiteConnection conn = DatabaseFileAccess.OpenExisting(path, true))
            {
                return DatabaseFileAccess.ComputeFingerprint(conn);
            }
        }

        public static long Count(string path, string table)
        {
            using (SQLiteConnection conn = DatabaseFileAccess.OpenExisting(path, true))
            {
                return Convert.ToInt64(DatabaseFileAccess.Scalar(conn, "SELECT COUNT(*) FROM " + table + ";"));
            }
        }

        public static void ResetDatabaseServiceStatics()
        {
            const BindingFlags flags = BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic;
            foreach (PropertyInfo prop in typeof(DatabaseService).GetProperties(flags))
            {
                MethodInfo setter = prop.GetSetMethod(true);
                if (setter != null && !prop.PropertyType.IsValueType) setter.Invoke(null, new object[] { null });
            }
            foreach (FieldInfo field in typeof(DatabaseService).GetFields(flags))
            {
                if (field.IsLiteral || field.IsInitOnly) continue;
                field.SetValue(null, field.FieldType.IsValueType ? Activator.CreateInstance(field.FieldType) : null);
            }
        }

        // A private temp folder for the code under test: Path.GetTempPath() follows TMPDIR (Unix) / TMP / TEMP (Windows) on every call,
        // so tests that scan "the temp folder" only ever see files made inside their own scope, never the shared %TEMP%.
        public sealed class HermeticTemp : IDisposable
        {
            private readonly string[] _names = new string[] { "TMPDIR", "TMP", "TEMP" };
            private readonly string[] _old;
            public string Path { get; private set; }

            public HermeticTemp()
            {
                Path = NewFolder("rafiq_hermetic_");
                _old = new string[_names.Length];
                for (int i = 0; i < _names.Length; i++)
                {
                    _old[i] = Environment.GetEnvironmentVariable(_names[i]);
                    Environment.SetEnvironmentVariable(_names[i], Path);
                }
            }

            public void Dispose()
            {
                for (int i = 0; i < _names.Length; i++) Environment.SetEnvironmentVariable(_names[i], _old[i]);
                DeleteFolder(Path);
            }
        }

        // The standard pre-conversion backup is a real container backup (it also writes settings into the store); tests that compare the
        // original byte for byte use this stub instead, and the dedicated backup tests (S112) use the real one.
        public static void UseStubBackup()
        {
            DatabaseEncryptionService.PreConversionBackupProvider = delegate(string dbPath, string backupFolder) { return "stub-backup"; };
        }

        // Grows a plain legacy store (WAL mode, a non-empty WAL left behind) to about targetBytes with stock_movements rows.
        // Returns the folder holding the copied db + wal + shm, as a crashed WAL-mode installation would leave them.
        public static string BuildLargeWalStore(string baseFolder, long targetBytes)
        {
            string working = Path.Combine(baseFolder, "inflate");
            Directory.CreateDirectory(working);
            string work = Path.Combine(working, "rafiq_pos.db");
            File.Copy(LegacyTemplate(), work, true);
            string dataFolder = Path.Combine(baseFolder, "data");
            Directory.CreateDirectory(dataFolder);
            string target = Path.Combine(dataFolder, "rafiq_pos.db");

            using (SQLiteConnection conn = DatabaseFileAccess.Open(work, false, true))
            {
                DatabaseFileAccess.Scalar(conn, "PRAGMA journal_mode=WAL;");
                DatabaseFileAccess.Execute(conn, "PRAGMA wal_autocheckpoint=0;");
                long next = 1;
                while (new FileInfo(work).Length + (File.Exists(work + "-wal") ? new FileInfo(work + "-wal").Length : 0) < targetBytes)
                {
                    DatabaseFileAccess.Execute(conn, "BEGIN;");
                    DatabaseFileAccess.Execute(conn,
                        "WITH RECURSIVE n(i) AS (SELECT " + next + " UNION ALL SELECT i + 1 FROM n WHERE i < " + (next + 49999) + ") "
                        + "INSERT INTO stock_movements (id, product_id, movement_type, quantity_milli, reference_id, reference_type, unit_cost_piasters, note, batch_number, created_at) "
                        + "SELECT 'big_' || i, (SELECT product_id FROM stock_movements LIMIT 1), 'adjustment', i % 1000, 'ref_' || i, 'test', 100 + i % 50, "
                        + "printf('%0120d', i) || ' ملاحظة اختبار حجم كبير', 'B' || i % 100, '2030-01-01T00:00:00Z' FROM n;");
                    DatabaseFileAccess.Execute(conn, "COMMIT;");
                    next += 50000;
                }
                // copy while the connection is open: db + non-empty wal + shm, like a process that died with the WAL left
                File.Copy(work, target, true);
                if (File.Exists(work + "-wal")) File.Copy(work + "-wal", target + "-wal", true);
                if (File.Exists(work + "-shm")) File.Copy(work + "-shm", target + "-shm", true);
            }
            SQLiteConnection.ClearAllPools();
            DeleteFolder(working);
            return target;
        }

        // ------------------------------------------------------------------ the legacy store

        private static readonly object TemplateLock = new object();
        private static string _legacyTemplate;

        public const int TemplateSales = 300;
        public const string TemplateProductMarker = "صنف تشفير مميز";

        // A populated PLAIN database (as an installation before encryption would have): products, customers, ~300 sales, returns,
        // customer payments and stock adjustments. Built once per process through the real services, then copied per test.
        public static string LegacyTemplate()
        {
            lock (TemplateLock)
            {
                if (_legacyTemplate != null && File.Exists(_legacyTemplate)) return _legacyTemplate;
                string path = Path.Combine(Path.GetTempPath(), "rafiq_nunit_legacy_" + Guid.NewGuid().ToString("N") + ".db");
                LegacyBuilder builder = new LegacyBuilder();
                builder.Build(path);
                _legacyTemplate = path;
                AppDomain.CurrentDomain.ProcessExit += delegate
                {
                    try { if (File.Exists(path)) File.Delete(path); } catch (IOException) { }
                };
                return path;
            }
        }

        // Copies the legacy template to baseFolder/data/rafiq_pos.db and returns the path
        public static string InstallLegacyStore(string baseFolder)
        {
            string dataFolder = Path.Combine(baseFolder, "data");
            Directory.CreateDirectory(dataFolder);
            string dbPath = Path.Combine(dataFolder, "rafiq_pos.db");
            File.Copy(LegacyTemplate(), dbPath, true);
            return dbPath;
        }

        private sealed class LegacyBuilder : TestBase
        {
            public void Build(string plainDestination)
            {
                BaseSetUp();
                try
                {
                    Shift shift = OpenTestShift("usr_cashier_1", "كاشير 1", 50000);
                    List<Product> products = new List<Product>();
                    for (int i = 0; i < 20; i++)
                    {
                        products.Add(CreateTestProduct(TemplateProductMarker + " " + i, 1000 + i * 50, 600 + i * 30, 500000, "ENCBAR" + i.ToString("00")));
                    }
                    List<Customer> customers = new List<Customer>();
                    for (int i = 0; i < 10; i++)
                    {
                        customers.Add(CreateTestCustomer("عميل تشفير " + i, 5000000));
                    }

                    List<Sale> cashSales = new List<Sale>();
                    for (int s = 0; s < TemplateSales; s++)
                    {
                        Product p = products[s % products.Count];
                        bool credit = s % 5 == 4;
                        Customer c = customers[s % customers.Count];
                        long total = p.PricePiasters * 2;
                        Sale sale = new Sale
                        {
                            CashierId = shift.CashierId,
                            CashierName = shift.CashierName,
                            PaymentMethod = credit ? "credit" : "cash",
                            PaidPiasters = credit ? 0 : total,
                            CustomerId = credit ? c.Id : null,
                            CustomerName = credit ? c.Name : null,
                            Items = new List<SaleItem>
                            {
                                new SaleItem { ProductId = p.Id, ProductName = p.Name, QuantityMilli = 2000, UnitPricePiasters = p.PricePiasters, TotalPiasters = total }
                            }
                        };
                        Sale saved = SaleService.ProcessSale(sale, null);
                        if (!credit) cashSales.Add(saved);
                    }

                    // A return on every 12th cash sale, one unit each
                    for (int r = 0; r < cashSales.Count; r += 12)
                    {
                        Sale original = cashSales[r];
                        SaleItem line = original.Items[0];
                        ReturnService.ProcessReturn(new Return
                        {
                            SaleId = original.Id,
                            CashierId = shift.CashierId,
                            RefundMethod = "cash",
                            Reason = "مرتجع اختبار التشفير",
                            TotalPiasters = line.UnitPricePiasters,
                            Items = new List<ReturnItem>
                            {
                                new ReturnItem { ProductId = line.ProductId, ProductName = line.ProductName, QuantityMilli = 1000, UnitPricePiasters = line.UnitPricePiasters, TotalPiasters = line.UnitPricePiasters }
                            }
                        });
                    }

                    for (int i = 0; i < customers.Count; i++)
                    {
                        CustomerService.RecordPayment(customers[i].Id, 2500, "سداد اختبار التشفير");
                    }

                    InventoryService inventory = new InventoryService(ConnectionString, StockMovementRepo, ProductRepo, AuditRepo);
                    for (int i = 0; i < 10; i++)
                    {
                        inventory.AdjustStockByDelta(products[i].Id, -1000, "تالف اختبار التشفير", "usr_admin_default");
                    }

                    // The service connection is encrypted (default); the legacy file is the verified plain export of it
                    DatabaseEncryptionService.ExportDecrypted(ConnectionString, plainDestination);
                }
                finally
                {
                    BaseTearDown();
                }
            }
        }
    }
}
