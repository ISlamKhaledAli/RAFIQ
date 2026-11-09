using System;
using System.Data.SQLite;
using System.IO;
using System.IO.Compression;
using System.Text;
using Newtonsoft.Json;
using NUnit.Framework;
using RafiqPOS.Database;
using RafiqPOS.Models;
using RafiqPOS.Repositories;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    /// <summary>
    /// نقل المحل لجهاز جديد عبر الفلاشة: تصدير ثم فحص ثم استرجاع كاملة الأرقام (أصناف، عملاء، فواتير، مجموع المبيعات، ديون، مخزون، محافظ)،
    /// كود الاسترجاع إلزامي ولا يمس الكود الخاطئ قاعدة البيانات الحالية، الحزمة المقطوعة أو المعدلة أو التي تحمل مسارات خارج الحزمة (zip slip)
    /// أو إصدار أحدث أو أرقاماً لا تطابق بيانها تُرفض قبل أي استبدال، ومسارات الشبكة والأجهزة مرفوضة، وفشل الاستبدال يعيد القاعدة الأصلية كما كانت.
    /// </summary>
    [TestFixture]
    [NonParallelizable]
    public class S69_StoreMigrationRoundTripTest
    {
        private string _root;
        private string _sourceFolder;
        private string _targetFolder;
        private string _flashFolder;
        private string _sourceDb;
        private string _targetDb;
        private string _sourceConn;
        private string _targetConn;
        private string _code;
        private MigrationService _source;
        private MigrationService _target;

        [SetUp]
        public void MigrationSetUp()
        {
            _root = Path.Combine(Path.GetTempPath(), "rafiq_s69_" + Guid.NewGuid().ToString("N"));
            _sourceFolder = Path.Combine(_root, "source");
            _targetFolder = Path.Combine(_root, "target");
            _flashFolder = Path.Combine(_root, "flash");
            Directory.CreateDirectory(_sourceFolder);
            Directory.CreateDirectory(_targetFolder);
            Directory.CreateDirectory(_flashFolder);

            _sourceDb = Path.Combine(_sourceFolder, "rafiq_pos.db");
            _targetDb = Path.Combine(_targetFolder, "rafiq_pos.db");
            _sourceConn = string.Format("Data Source={0};Version=3;BusyTimeout=5000;", _sourceDb);
            _targetConn = string.Format("Data Source={0};Version=3;BusyTimeout=5000;", _targetDb);
            _code = EncryptionService.GenerateRecoveryCode();

            MigrationRunner.ApplyMigrations(_sourceConn, _sourceDb);
            MigrationRunner.ApplyMigrations(_targetConn, _targetDb);

            var srcAudit = new AuditLogRepository(_sourceConn);
            var srcSettings = new SettingsRepository(_sourceConn);
            SeedShop(_sourceConn, srcAudit, srcSettings);
            Execute(_sourceConn, "UPDATE digital_accounts SET balance_piasters = 12345;");

            // The new PC already holds a little data of its own that the restore must replace
            var tgtAudit = new AuditLogRepository(_targetConn);
            var tgtCustomer = new CustomerRepository(_targetConn, tgtAudit);
            tgtCustomer.SaveCustomer(new Customer { Name = "عميل الجهاز الجديد", Phone = "01000000000", BalancePiasters = 999 });

            _source = new MigrationService(_sourceConn, _sourceDb, srcSettings, srcAudit);
            _target = new MigrationService(_targetConn, _targetDb, new SettingsRepository(_targetConn), tgtAudit);
        }

        [TearDown]
        public void MigrationTearDown()
        {
            SQLiteConnection.ClearAllPools();
            GC.Collect();
            GC.WaitForPendingFinalizers();
            try { Directory.Delete(_root, true); } catch (IOException) { } catch (UnauthorizedAccessException) { }
        }

        private static void SeedShop(string conn, AuditLogRepository audit, SettingsRepository settings)
        {
            var counter = new CounterRepository(conn);
            var products = new ProductRepository(conn, audit);
            var customers = new CustomerRepository(conn, audit);
            var sales = new SaleRepository(conn, counter, audit);
            var suppliers = new SupplierRepository(conn, audit);

            settings.Set("store_name", "سوبرماركت البركة للتجارة");
            settings.Set("tax_number", "123-456-789");

            for (int i = 1; i <= 5; i++)
            {
                products.Upsert(new Product
                {
                    Id = Guid.NewGuid().ToString("N"),
                    Name = "صنف تجريبي " + i,
                    Barcode = "6221000" + i,
                    PricePiasters = 2500 * i,
                    CostPiasters = 1800 * i,
                    StockQuantityMilli = 10000 * i,
                    Unit = "piece",
                    IsActive = true
                });
            }

            customers.SaveCustomer(new Customer { Name = "الحاج محمود سعيد", Phone = "01011112222", BalancePiasters = 15000 });
            customers.SaveCustomer(new Customer { Name = "الأستاذ طارق إبراهيم", Phone = "01122223333", BalancePiasters = 32000 });

            var sale = new Sale
            {
                Id = Guid.NewGuid().ToString("N"),
                InvoiceNumber = 101,
                SubtotalPiasters = 5000,
                TotalPiasters = 5000,
                PaidPiasters = 5000,
                PaymentMethod = "cash",
                Status = "completed",
                CashierId = "usr_cashier",
                CreatedAt = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss")
            };
            sale.Items.Add(new SaleItem
            {
                Id = Guid.NewGuid().ToString("N"),
                SaleId = sale.Id,
                ProductId = "dummy_prod",
                ProductName = "صنف تجريبي 1",
                Barcode = "62210001",
                QuantityMilli = 2000,
                UnitPricePiasters = 2500,
                TotalPiasters = 5000
            });
            sales.CreateSaleAtomic(sale);

            suppliers.Save(new Supplier { Name = "شركة النور للمواد الغذائية", Phone = "01233334444", BalancePiasters = 50000, IsActive = true });
        }

        private static void Execute(string conn, string sql)
        {
            using (var c = new SQLiteConnection(conn))
            {
                c.Open();
                using (var cmd = new SQLiteCommand(sql, c))
                {
                    cmd.ExecuteNonQuery();
                }
            }
        }

        private static long Scalar(string conn, string sql)
        {
            using (var c = new SQLiteConnection(conn))
            {
                c.Open();
                using (var cmd = new SQLiteCommand(sql, c))
                {
                    object res = cmd.ExecuteScalar();
                    return (res == null || res == DBNull.Value) ? 0L : Convert.ToInt64(res);
                }
            }
        }

        private MigrationPackageExportResult Export()
        {
            MigrationPackageExportResult res = _source.CreateMigrationPackage(_flashFolder, _code);
            Assert.IsTrue(res.Success, res.Message);
            return res;
        }

        private string TargetDbHash()
        {
            SQLiteConnection.ClearAllPools();
            return MigrationService.ComputeSha256(_targetDb);
        }

        // Decrypts a package, lets the test change its zip, and encrypts it again under the same code
        private string Rebuild(string package, string newName, Action<ZipArchive> mutate)
        {
            string zip = Path.Combine(_root, newName + ".zip");
            new EncryptionService().DecryptFile(package, zip, _code);
            using (ZipArchive archive = ZipFile.Open(zip, ZipArchiveMode.Update))
            {
                mutate(archive);
            }
            string rebuilt = Path.Combine(_flashFolder, newName + ".rafiqpkg");
            new EncryptionService().EncryptFileDualWrap(zip, rebuilt, _code);
            File.Delete(zip);
            return rebuilt;
        }

        private static MigrationPackageManifest ReadManifest(ZipArchive archive)
        {
            using (var reader = new StreamReader(archive.GetEntry("manifest.json").Open(), Encoding.UTF8))
            {
                return JsonConvert.DeserializeObject<MigrationPackageManifest>(reader.ReadToEnd());
            }
        }

        private static void WriteManifest(ZipArchive archive, MigrationPackageManifest manifest)
        {
            archive.GetEntry("manifest.json").Delete();
            ZipArchiveEntry entry = archive.CreateEntry("manifest.json");
            using (var writer = new StreamWriter(entry.Open(), new UTF8Encoding(false)))
            {
                writer.Write(JsonConvert.SerializeObject(manifest, Formatting.Indented));
            }
        }

        [Test]
        public void RoundTrip_ExportInspectRestore_KeepsEveryCountAndTotal()
        {
            MigrationPackageExportResult exported = Export();

            StringAssert.EndsWith(".rafiqpkg", exported.FilePath);
            Assert.AreEqual(Path.GetFullPath(_flashFolder), Path.GetDirectoryName(Path.GetFullPath(exported.FilePath)));
            Assert.IsFalse(File.Exists(exported.FilePath + ".tmp"), "الملف المؤقت يجب ألا يبقى على الفلاشة");
            Assert.AreEqual(64, exported.Manifest.DatabaseSha256.Length);
            Assert.AreEqual(MigrationRunner.LATEST_SUPPORTED_VERSION, exported.Manifest.SchemaVersion);
            Assert.AreEqual(AppUpdateService.CurrentVersion, exported.Manifest.AppVersion);
            Assert.IsFalse(string.IsNullOrEmpty(exported.Manifest.SourceMachineName));
            Assert.AreEqual(5, exported.Manifest.Metrics.ProductsCount);
            Assert.AreEqual(2, exported.Manifest.Metrics.CustomersCount);
            Assert.AreEqual(1, exported.Manifest.Metrics.InvoicesCount);
            Assert.AreEqual(47000L, exported.Manifest.Metrics.TotalCustomerDebtPiasters);
            Assert.AreEqual(5000L, exported.Manifest.Metrics.TotalSalesPiasters);
            Assert.AreEqual(Scalar(_sourceConn, "SELECT COALESCE(SUM(stock_quantity_milli), 0) FROM products WHERE is_active = 1;"), exported.Manifest.Metrics.TotalInventoryUnitsMilli);
            Assert.IsTrue(exported.Manifest.Metrics.TotalWalletBalancePiasters.Value >= 12345L);

            // The package opens without touching the target database
            string before = TargetDbHash();
            MigrationPackageInspectResult inspected = _target.InspectPackage(exported.FilePath, _code);
            Assert.IsTrue(inspected.Success, inspected.Message);
            Assert.IsTrue(inspected.IsChecksumValid);
            Assert.IsTrue(inspected.IsCompatible);
            Assert.AreEqual(before, TargetDbHash(), "الفحص لا يجوز أن يغير قاعدة البيانات الحالية");

            MigrationRestoreResult restored = _target.RestorePackage(exported.FilePath, _code);
            Assert.IsTrue(restored.Success, restored.Message);
            Assert.IsTrue(restored.IsMatch, string.Join(" | ", restored.Differences.ToArray()));
            Assert.AreEqual(0, restored.Differences.Count);
            foreach (MigrationMetricComparison c in restored.Comparisons)
            {
                Assert.IsTrue(c.IsMatched, c.LabelAr + ": " + c.SourceValue + " / " + c.RestoredValue);
            }

            SQLiteConnection.ClearAllPools();
            Assert.AreEqual(Scalar(_sourceConn, "SELECT COUNT(*) FROM customers;"), Scalar(_targetConn, "SELECT COUNT(*) FROM customers;"), "عميل الجهاز الجديد يجب أن يُستبدل");
            Assert.AreEqual(Scalar(_sourceConn, "SELECT COUNT(*) FROM products WHERE is_active = 1;"), Scalar(_targetConn, "SELECT COUNT(*) FROM products WHERE is_active = 1;"));
            Assert.AreEqual(Scalar(_sourceConn, "SELECT COUNT(*) FROM sales WHERE status = 'completed';"), Scalar(_targetConn, "SELECT COUNT(*) FROM sales WHERE status = 'completed';"));
            Assert.AreEqual(Scalar(_sourceConn, "SELECT COALESCE(SUM(total_piasters), 0) FROM sales;"), Scalar(_targetConn, "SELECT COALESCE(SUM(total_piasters), 0) FROM sales;"));
            Assert.AreEqual(Scalar(_sourceConn, "SELECT COALESCE(SUM(balance_piasters), 0) FROM customers;"), Scalar(_targetConn, "SELECT COALESCE(SUM(balance_piasters), 0) FROM customers;"));
            Assert.AreEqual(Scalar(_sourceConn, "SELECT COALESCE(SUM(stock_quantity_milli), 0) FROM products;"), Scalar(_targetConn, "SELECT COALESCE(SUM(stock_quantity_milli), 0) FROM products;"));
            Assert.AreEqual(Scalar(_sourceConn, "SELECT COALESCE(SUM(balance_piasters), 0) FROM digital_accounts;"), Scalar(_targetConn, "SELECT COALESCE(SUM(balance_piasters), 0) FROM digital_accounts;"));
            Assert.AreEqual(1L, Scalar(_targetConn, "SELECT COUNT(*) FROM audit_logs WHERE action = 'migration_restore';"), "سطر التدقيق يُكتب في القاعدة الجديدة");

            string safetyDir = Path.Combine(_targetFolder, "pre_restore");
            Assert.IsTrue(Directory.Exists(safetyDir) && Directory.GetFiles(safetyDir, "pre_migration_*.db").Length == 1, "نسخة أمان من بيانات الجهاز قبل الاستبدال");
        }

        [Test]
        public void WrongOrMissingCode_IsRejected_AndTheLiveDatabaseIsNotTouched()
        {
            MigrationPackageExportResult exported = Export();
            string before = TargetDbHash();

            foreach (string badCode in new string[] { null, "", "   ", "RFK-WRONG-CODE-0000" })
            {
                MigrationPackageInspectResult inspected = _target.InspectPackage(exported.FilePath, badCode);
                Assert.IsFalse(inspected.Success);
                StringAssert.Contains("كود استرجاع المالك", inspected.Message);

                MigrationRestoreResult restored = _target.RestorePackage(exported.FilePath, badCode);
                Assert.IsFalse(restored.Success);
                StringAssert.Contains("كود استرجاع المالك", restored.Message);
            }

            Assert.AreEqual(before, TargetDbHash());
            Assert.IsFalse(Directory.Exists(Path.Combine(_targetFolder, "pre_restore")), "لا نسخة أمان ولا استبدال قبل التحقق من الكود");
            Assert.AreEqual(1L, Scalar(_targetConn, "SELECT COUNT(*) FROM customers;"));
        }

        [Test]
        public void TruncatedPackage_IsRejected_BeforeAnyReplacement()
        {
            MigrationPackageExportResult exported = Export();
            string truncated = Path.Combine(_flashFolder, "truncated.rafiqpkg");
            File.Copy(exported.FilePath, truncated);
            using (var fs = new FileStream(truncated, FileMode.Open, FileAccess.Write))
            {
                fs.SetLength(fs.Length - 1000);
            }
            string before = TargetDbHash();

            Assert.IsFalse(_target.InspectPackage(truncated, _code).Success);
            MigrationRestoreResult restored = _target.RestorePackage(truncated, _code);
            Assert.IsFalse(restored.Success);
            Assert.IsFalse(string.IsNullOrEmpty(restored.Message));
            Assert.AreEqual(before, TargetDbHash());
        }

        [Test]
        public void ZipSlipAndAbsoluteEntries_AreRejected_AndNothingIsWrittenOutsideTheStaging()
        {
            MigrationPackageExportResult exported = Export();
            string before = TargetDbHash();
            string[] evilNames = new string[] { "prescriptions/../../evil.txt", "../evil.txt", "/evil.txt", "C:/evil.txt", "prescriptions\\..\\evil.txt" };

            for (int i = 0; i < evilNames.Length; i++)
            {
                string evilName = evilNames[i];
                string package = Rebuild(exported.FilePath, "evil_" + i, delegate (ZipArchive archive)
                {
                    ZipArchiveEntry evil = archive.CreateEntry(evilName);
                    using (var w = new StreamWriter(evil.Open())) { w.Write("x"); }
                });

                MigrationPackageInspectResult inspected = _target.InspectPackage(package, _code);
                Assert.IsFalse(inspected.Success, evilName);
                MigrationRestoreResult restored = _target.RestorePackage(package, _code);
                Assert.IsFalse(restored.Success, evilName);
            }

            Assert.IsFalse(File.Exists(Path.Combine(_root, "evil.txt")));
            Assert.IsFalse(File.Exists(Path.Combine(Path.GetTempPath(), "evil.txt")));
            Assert.AreEqual(before, TargetDbHash());
        }

        [Test]
        public void PackageFromANewerSchema_IsRefused_WithTheUpdateMessage()
        {
            MigrationPackageExportResult exported = Export();
            string newer = Rebuild(exported.FilePath, "newer", delegate (ZipArchive archive)
            {
                MigrationPackageManifest manifest = ReadManifest(archive);
                manifest.SchemaVersion = MigrationRunner.LATEST_SUPPORTED_VERSION + 1;
                WriteManifest(archive, manifest);
            });
            string before = TargetDbHash();

            MigrationPackageInspectResult inspected = _target.InspectPackage(newer, _code);
            Assert.IsFalse(inspected.Success);
            Assert.IsFalse(inspected.IsCompatible);
            StringAssert.Contains("أحدث", inspected.Message);
            StringAssert.Contains("تحديث برنامج رفيق", inspected.Message);
            Assert.IsFalse(_target.RestorePackage(newer, _code).Success);
            Assert.AreEqual(before, TargetDbHash());
        }

        [Test]
        public void ManifestNumbersThatDoNotMatchTheDatabaseInside_AreRefused()
        {
            MigrationPackageExportResult exported = Export();
            string tampered = Rebuild(exported.FilePath, "tampered", delegate (ZipArchive archive)
            {
                MigrationPackageManifest manifest = ReadManifest(archive);
                manifest.Metrics.TotalCustomerDebtPiasters = manifest.Metrics.TotalCustomerDebtPiasters + 100;
                WriteManifest(archive, manifest);
            });
            string before = TargetDbHash();

            MigrationRestoreResult restored = _target.RestorePackage(tampered, _code);
            Assert.IsFalse(restored.Success);
            StringAssert.Contains("لا تطابق", restored.Message);
            Assert.AreEqual(before, TargetDbHash());
        }

        [Test]
        public void UnencryptedLegacyPackage_IsRefused()
        {
            string staging = Path.Combine(_root, "plain");
            Directory.CreateDirectory(staging);
            File.WriteAllText(Path.Combine(staging, "manifest.json"), "{}");
            string plain = Path.Combine(_flashFolder, "plain.rafiqpkg");
            ZipFile.CreateFromDirectory(staging, plain, CompressionLevel.Optimal, false);

            MigrationPackageInspectResult inspected = _target.InspectPackage(plain, _code);
            Assert.IsFalse(inspected.Success);
            StringAssert.Contains("غير مشفرة", inspected.Message);
            Assert.IsFalse(_target.RestorePackage(plain, _code).Success);
        }

        [Test]
        public void NetworkDeviceAndRelativePaths_AreRejected_ForBothDirections()
        {
            string[] badPackages = new string[] { "\\\\server\\share\\shop.rafiqpkg", "\\\\?\\C:\\shop.rafiqpkg", "\\\\.\\PhysicalDrive0", "C:shop.rafiqpkg", "shop.rafiqpkg", "C:\\shop.rafiqpkg:stream" };
            foreach (string path in badPackages)
            {
                MigrationPackageInspectResult inspected = _target.InspectPackage(path, _code);
                Assert.IsFalse(inspected.Success, path);
                Assert.IsFalse(string.IsNullOrEmpty(inspected.Message), path);
                Assert.IsFalse(_target.RestorePackage(path, _code).Success, path);
            }
            StringAssert.Contains("مسارات الشبكة", _target.InspectPackage("\\\\server\\share\\shop.rafiqpkg", _code).Message);

            string[] badFolders = new string[] { "\\\\server\\share\\usb", "\\\\?\\C:\\usb", "usb", Path.Combine(_sourceFolder, "usb"), _sourceFolder };
            foreach (string folder in badFolders)
            {
                MigrationPackageExportResult exported = _source.CreateMigrationPackage(folder, _code);
                Assert.IsFalse(exported.Success, folder);
                Assert.IsFalse(string.IsNullOrEmpty(exported.Message), folder);
            }
            Assert.IsFalse(Directory.Exists(Path.Combine(_sourceFolder, "usb")), "لا يُنشأ مجلد داخل بيانات النظام");
        }

        [Test]
        public void Export_ToTheChosenFolder_NeverOverwritesAnExistingPackage_AndCreatesTheFolder()
        {
            string chosen = Path.Combine(_flashFolder, "RafiqMigration");
            MigrationPackageExportResult first = _source.CreateMigrationPackage(chosen, _code);
            MigrationPackageExportResult second = _source.CreateMigrationPackage(chosen, _code);

            Assert.IsTrue(first.Success, first.Message);
            Assert.IsTrue(second.Success, second.Message);
            Assert.AreNotEqual(first.FilePath, second.FilePath);
            Assert.IsTrue(File.Exists(first.FilePath) && File.Exists(second.FilePath));
            Assert.AreEqual(Path.GetFullPath(chosen), Path.GetDirectoryName(Path.GetFullPath(first.FilePath)));
            Assert.AreEqual(0, Directory.GetFiles(chosen, "*.tmp").Length);
        }

        [Test]
        public void SwapFailureAfterTheNewFileIsInPlace_RestoresTheOriginalDatabase()
        {
            long customersBefore = Scalar(_targetConn, "SELECT COUNT(*) FROM customers;");
            long debtBefore = Scalar(_targetConn, "SELECT COALESCE(SUM(balance_piasters), 0) FROM customers;");

            TransactionResult result = DatabaseService.ReplaceDatabaseFile(_targetDb, _targetConn, _sourceDb, "pre_s69", delegate
            {
                throw new InvalidOperationException("فشل مقصود أثناء الاستبدال");
            });

            Assert.IsFalse(result.Success);
            StringAssert.Contains("إرجاع قاعدة البيانات الحالية", result.Message);
            SQLiteConnection.ClearAllPools();
            Assert.AreEqual(customersBefore, Scalar(_targetConn, "SELECT COUNT(*) FROM customers;"));
            Assert.AreEqual(debtBefore, Scalar(_targetConn, "SELECT COALESCE(SUM(balance_piasters), 0) FROM customers;"), "بيانات الجهاز الأصلية تعود كما كانت");
            Assert.AreEqual(0, Directory.GetFiles(_targetFolder, "*.rollback_*").Length);
            Assert.AreEqual(0, Directory.GetFiles(_targetFolder, "*.incoming_*").Length);
        }
    }
}
