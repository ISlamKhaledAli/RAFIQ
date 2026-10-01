using System;
using System.Collections.Generic;
using System.Data.SQLite;
using System.IO;
using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;
using Newtonsoft.Json;
using RafiqPOS.Common;
using RafiqPOS.Database;
using RafiqPOS.Repositories;

namespace RafiqPOS.Services
{
    public class MigrationAuditMetrics
    {
        public int ProductsCount { get; set; }
        public int CustomersCount { get; set; }
        public int InvoicesCount { get; set; }
        public long TotalCustomerDebtPiasters { get; set; }
        public long TotalInventoryUnitsMilli { get; set; }
        public int TotalInventoryItemsCount { get; set; }
        public int SuppliersCount { get; set; }
        public long TotalSupplierDebtPiasters { get; set; }
        public int CategoriesCount { get; set; }
    }

    public class MigrationPackageManifest
    {
        public int PackageVersion { get; set; }
        public string CreatedAtUtc { get; set; }
        public string CreatedAtLocal { get; set; }
        public string SourceMachineName { get; set; }
        public string SourceOsName { get; set; }
        public string SourceOsBuild { get; set; }
        public string AppVersion { get; set; }
        public int SchemaVersion { get; set; }
        public string StoreName { get; set; }
        public string TaxNumber { get; set; }
        public string DatabaseSha256 { get; set; }
        public MigrationAuditMetrics Metrics { get; set; }

        public MigrationPackageManifest()
        {
            this.PackageVersion = 1;
            this.Metrics = new MigrationAuditMetrics();
        }
    }

    public class MigrationPackageExportResult
    {
        public bool Success { get; set; }
        public string FilePath { get; set; }
        public string FileName { get; set; }
        public long FileSizeBytes { get; set; }
        public MigrationPackageManifest Manifest { get; set; }
        public string Message { get; set; }
    }

    public class MigrationPackageInspectResult
    {
        public bool Success { get; set; }
        public string PackagePath { get; set; }
        public MigrationPackageManifest Manifest { get; set; }
        public bool IsCompatible { get; set; }
        public bool IsChecksumValid { get; set; }
        public string CompatibilityNotes { get; set; }
        public string Message { get; set; }
    }

    public class MigrationMetricComparison
    {
        public string MetricKey { get; set; }
        public string LabelAr { get; set; }
        public string SourceValue { get; set; }
        public string RestoredValue { get; set; }
        public bool IsMatched { get; set; }
    }

    public class MigrationRestoreResult
    {
        public bool Success { get; set; }
        public MigrationAuditMetrics SourceMetrics { get; set; }
        public MigrationAuditMetrics RestoredMetrics { get; set; }
        public List<MigrationMetricComparison> Comparisons { get; set; }
        public bool IsMatch { get; set; }
        public string Message { get; set; }
        public List<string> Differences { get; set; }

        public MigrationRestoreResult()
        {
            this.Comparisons = new List<MigrationMetricComparison>();
            this.Differences = new List<string>();
        }
    }

    public class MigrationService
    {
        private readonly string _connectionString;
        private readonly string _dbPath;
        private readonly SettingsRepository _settingsRepo;
        private readonly AuditLogRepository _auditRepo;

        public MigrationService(string connectionString, string dbPath, SettingsRepository settingsRepo, AuditLogRepository auditRepo)
        {
            this._connectionString = connectionString;
            this._dbPath = dbPath;
            this._settingsRepo = settingsRepo;
            this._auditRepo = auditRepo;
        }

        public static string ComputeSha256(string filePath)
        {
            using (var sha256 = SHA256.Create())
            using (var stream = File.OpenRead(filePath))
            {
                byte[] hash = sha256.ComputeHash(stream);
                var sb = new StringBuilder();
                for (int i = 0; i < hash.Length; i++)
                {
                    sb.Append(hash[i].ToString("x2"));
                }
                return sb.ToString();
            }
        }

        public static string ComputeSha256(Stream stream)
        {
            using (var sha256 = SHA256.Create())
            {
                byte[] hash = sha256.ComputeHash(stream);
                var sb = new StringBuilder();
                for (int i = 0; i < hash.Length; i++)
                {
                    sb.Append(hash[i].ToString("x2"));
                }
                return sb.ToString();
            }
        }

        public MigrationAuditMetrics GetCurrentMetrics()
        {
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                return CollectMetricsFromConnection(conn);
            }
        }

        public static MigrationAuditMetrics CollectMetricsFromConnection(SQLiteConnection conn)
        {
            var metrics = new MigrationAuditMetrics();

            // 1. Products count
            try
            {
                using (var cmd = new SQLiteCommand("SELECT COUNT(*) FROM products WHERE is_active = 1;", conn))
                {
                    object res = cmd.ExecuteScalar();
                    metrics.ProductsCount = (res != null && res != DBNull.Value) ? Convert.ToInt32(res) : 0;
                }
            }
            catch { }

            // 2. Customers count
            try
            {
                using (var cmd = new SQLiteCommand("SELECT COUNT(*) FROM customers;", conn))
                {
                    object res = cmd.ExecuteScalar();
                    metrics.CustomersCount = (res != null && res != DBNull.Value) ? Convert.ToInt32(res) : 0;
                }
            }
            catch { }

            // 3. Invoices count
            try
            {
                using (var cmd = new SQLiteCommand("SELECT COUNT(*) FROM sales WHERE status = 'completed';", conn))
                {
                    object res = cmd.ExecuteScalar();
                    metrics.InvoicesCount = (res != null && res != DBNull.Value) ? Convert.ToInt32(res) : 0;
                }
            }
            catch { }

            // 4. Total customer debt
            try
            {
                using (var cmd = new SQLiteCommand("SELECT COALESCE(SUM(balance_piasters), 0) FROM customers;", conn))
                {
                    object res = cmd.ExecuteScalar();
                    metrics.TotalCustomerDebtPiasters = (res != null && res != DBNull.Value) ? Convert.ToInt64(res) : 0L;
                }
            }
            catch { }

            // 5. Total inventory units milli
            try
            {
                using (var cmd = new SQLiteCommand("SELECT COALESCE(SUM(stock_quantity_milli), 0), COUNT(CASE WHEN stock_quantity_milli > 0 THEN 1 END) FROM products WHERE is_active = 1;", conn))
                {
                    using (var reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            metrics.TotalInventoryUnitsMilli = reader.IsDBNull(0) ? 0L : Convert.ToInt64(reader.GetValue(0));
                            metrics.TotalInventoryItemsCount = reader.IsDBNull(1) ? 0 : Convert.ToInt32(reader.GetValue(1));
                        }
                    }
                }
            }
            catch { }

            // 6. Suppliers count and debt
            try
            {
                using (var cmd = new SQLiteCommand("SELECT COUNT(*), COALESCE(SUM(balance_piasters), 0) FROM suppliers WHERE is_active = 1;", conn))
                {
                    using (var reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            metrics.SuppliersCount = reader.IsDBNull(0) ? 0 : Convert.ToInt32(reader.GetValue(0));
                            metrics.TotalSupplierDebtPiasters = reader.IsDBNull(1) ? 0L : Convert.ToInt64(reader.GetValue(1));
                        }
                    }
                }
            }
            catch { }

            // 7. Categories count
            try
            {
                using (var cmd = new SQLiteCommand("SELECT COUNT(*) FROM categories;", conn))
                {
                    object res = cmd.ExecuteScalar();
                    metrics.CategoriesCount = (res != null && res != DBNull.Value) ? Convert.ToInt32(res) : 0;
                }
            }
            catch { }

            return metrics;
        }

        public MigrationPackageExportResult CreateMigrationPackage(string targetFolder)
        {
            var result = new MigrationPackageExportResult();
            string stagingDir = null;

            try
            {
                Logger.Info("بدء تصدير حزمة نقل البرنامج والبيانات إلى جهاز جديد...");

                // 1. Flush SQLite WAL
                try
                {
                    using (var conn = new SQLiteConnection(_connectionString))
                    {
                        conn.Open();
                        using (var cmd = new SQLiteCommand("PRAGMA wal_checkpoint(TRUNCATE);", conn))
                        {
                            cmd.ExecuteNonQuery();
                        }
                    }
                }
                catch (Exception ex)
                {
                    Logger.Warn("تحذير عند تفريغ WAL: " + ex.Message);
                }

                // 2. Prepare staging directory
                stagingDir = Path.Combine(Path.GetTempPath(), "rafiq_mig_staging_" + Guid.NewGuid().ToString("N"));
                Directory.CreateDirectory(stagingDir);

                string stagingDbPath = Path.Combine(stagingDir, "rafiq_pos.db");

                // 3. Online point-in-time backup to staging
                using (var srcConn = new SQLiteConnection(_connectionString))
                using (var dstConn = new SQLiteConnection(string.Format("Data Source={0};Version=3;", stagingDbPath)))
                {
                    srcConn.Open();
                    dstConn.Open();
                    srcConn.BackupDatabase(dstConn, "main", "main", -1, null, 0);
                }

                // 4. Calculate SHA256 of staged DB
                string dbSha256 = ComputeSha256(stagingDbPath);

                // 5. Collect audit metrics from staged DB
                MigrationAuditMetrics metrics;
                using (var stagedConn = new SQLiteConnection(string.Format("Data Source={0};Version=3;Read Only=True;", stagingDbPath)))
                {
                    stagedConn.Open();
                    metrics = CollectMetricsFromConnection(stagedConn);
                }

                // 6. Build Manifest
                string storeName = _settingsRepo != null ? _settingsRepo.Get("store_name", "متجر رفيق") : "متجر رفيق";
                string taxNumber = _settingsRepo != null ? _settingsRepo.Get("tax_number", "") : "";

                var manifest = new MigrationPackageManifest();
                manifest.PackageVersion = 1;
                manifest.CreatedAtUtc = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ");
                manifest.CreatedAtLocal = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss");
                manifest.SourceMachineName = Environment.MachineName;
                manifest.SourceOsName = OsDetector.GetOsFriendlyName();
                manifest.SourceOsBuild = OsDetector.GetBuildNumber().ToString();
                manifest.AppVersion = "1.0.0";
                manifest.SchemaVersion = MigrationRunner.LATEST_SUPPORTED_VERSION;
                manifest.StoreName = storeName;
                manifest.TaxNumber = taxNumber;
                manifest.DatabaseSha256 = dbSha256;
                manifest.Metrics = metrics;

                string manifestJson = JsonConvert.SerializeObject(manifest, Formatting.Indented);
                File.WriteAllText(Path.Combine(stagingDir, "manifest.json"), manifestJson, Encoding.UTF8);

                // 7. Determine target folder
                string resolvedFolder = targetFolder;
                if (string.IsNullOrWhiteSpace(resolvedFolder) || !Directory.Exists(resolvedFolder))
                {
                    // Prefer removable drive (USB flash drive) if available
                    DriveInfo[] allDrives = DriveInfo.GetDrives();
                    for (int i = 0; i < allDrives.Length; i++)
                    {
                        if (allDrives[i].DriveType == DriveType.Removable && allDrives[i].IsReady)
                        {
                            resolvedFolder = allDrives[i].RootDirectory.FullName;
                            break;
                        }
                    }
                }

                if (string.IsNullOrWhiteSpace(resolvedFolder) || !Directory.Exists(resolvedFolder))
                {
                    resolvedFolder = Environment.GetFolderPath(Environment.SpecialFolder.Desktop);
                }
                if (string.IsNullOrWhiteSpace(resolvedFolder) || !Directory.Exists(resolvedFolder))
                {
                    resolvedFolder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads");
                }
                if (string.IsNullOrWhiteSpace(resolvedFolder) || !Directory.Exists(resolvedFolder))
                {
                    resolvedFolder = AppDomain.CurrentDomain.BaseDirectory;
                }

                string safeStoreName = ArabicTextNormalizer.Normalize(storeName)
                    .Replace(" ", "_")
                    .Replace("/", "_")
                    .Replace("\\", "_")
                    .Replace(":", "_");

                if (safeStoreName.Length > 20)
                {
                    safeStoreName = safeStoreName.Substring(0, 20);
                }

                string fileName = string.Format("rafiq_migration_{0}_{1:yyyyMMdd_HHmmss}.rafiqpkg", safeStoreName, DateTime.Now);
                string targetFilePath = Path.Combine(resolvedFolder, fileName);

                if (File.Exists(targetFilePath))
                {
                    File.Delete(targetFilePath);
                }

                // 8. Create zip package (.rafiqpkg)
                ZipFile.CreateFromDirectory(stagingDir, targetFilePath, CompressionLevel.Optimal, false);

                var fi = new FileInfo(targetFilePath);

                result.Success = true;
                result.FilePath = targetFilePath;
                result.FileName = fileName;
                result.FileSizeBytes = fi.Length;
                result.Manifest = manifest;
                result.Message = "تم إنشاء حزمة نقل البرنامج والبيانات بنجاح وتجهيزها للنقل للجهاز الجديد.";

                if (_auditRepo != null)
                {
                    try
                    {
                        _auditRepo.Log(new RafiqPOS.Models.AuditLog
                        {
                            Action = "migration_export",
                            ActionArabic = "تصدير حزمة نقل البيانات",
                            EntityType = "system",
                            EntityId = fileName,
                            DetailsJson = string.Format("{{\"file\":\"{0}\",\"size\":{1}}}", fileName, fi.Length)
                        });
                    }
                    catch { }
                }

                Logger.Info(string.Format("تم إنشاء حزمة النقل بنجاح في: {0}", targetFilePath));
            }
            catch (Exception ex)
            {
                result.Success = false;
                result.Message = "فشل في إنشاء حزمة النقل: " + ex.Message;
                Logger.Error("خطأ في إنشاء حزمة النقل: " + ex.Message, ex);
            }
            finally
            {
                if (stagingDir != null && Directory.Exists(stagingDir))
                {
                    try
                    {
                        Directory.Delete(stagingDir, true);
                    }
                    catch { }
                }
            }

            return result;
        }

        public MigrationPackageInspectResult InspectPackage(string packagePath)
        {
            var result = new MigrationPackageInspectResult();
            result.PackagePath = packagePath;

            if (string.IsNullOrWhiteSpace(packagePath) || !File.Exists(packagePath))
            {
                result.Success = false;
                result.Message = "ملف حزمة النقل المحدد غير موجود.";
                return result;
            }

            try
            {
                using (var archive = ZipFile.OpenRead(packagePath))
                {
                    // 1. Locate manifest.json
                    ZipArchiveEntry manifestEntry = archive.GetEntry("manifest.json");
                    if (manifestEntry == null)
                    {
                        result.Success = false;
                        result.Message = "حزمة النقل غير صالحة: ملف البيان (manifest.json) مفقود داخل الحزمة.";
                        return result;
                    }

                    string manifestJson;
                    using (var reader = new StreamReader(manifestEntry.Open(), Encoding.UTF8))
                    {
                        manifestJson = reader.ReadToEnd();
                    }

                    MigrationPackageManifest manifest = JsonConvert.DeserializeObject<MigrationPackageManifest>(manifestJson);
                    result.Manifest = manifest;

                    // 2. Locate DB entry
                    ZipArchiveEntry dbEntry = archive.GetEntry("rafiq_pos.db");
                    if (dbEntry == null)
                    {
                        result.Success = false;
                        result.Message = "حزمة النقل غير صالحة: ملف قاعدة البيانات مفقود داخل الحزمة.";
                        return result;
                    }

                    // 3. Verify Checksum
                    string actualSha256;
                    using (var stream = dbEntry.Open())
                    {
                        actualSha256 = ComputeSha256(stream);
                    }

                    result.IsChecksumValid = string.Equals(actualSha256, manifest.DatabaseSha256, StringComparison.OrdinalIgnoreCase);
                    if (!result.IsChecksumValid)
                    {
                        result.Success = false;
                        result.Message = "تحذير أمني: البصمة الرقمية للبيانات داخل الحزمة لا تطابق البيان، قد يكون الملف معدلاً أو تالفاً.";
                        return result;
                    }

                    // 4. Schema Compatibility check
                    if (manifest.SchemaVersion > MigrationRunner.LATEST_SUPPORTED_VERSION)
                    {
                        result.IsCompatible = false;
                        result.CompatibilityNotes = string.Format("إصدار قاعدة البيانات في الحزمة ({0}) أحدث من إصدار البرنامج الحالي ({1}). يرجى تحديث برنامج رفيق على هذا الجهاز أولاً.", manifest.SchemaVersion, MigrationRunner.LATEST_SUPPORTED_VERSION);
                        result.Success = false;
                        result.Message = result.CompatibilityNotes;
                        return result;
                    }

                    result.IsCompatible = true;
                    result.CompatibilityNotes = "الحزمة متوافقة تماماً مع هذا الإصدار من رفيق POS.";
                    result.Success = true;
                    result.Message = "تم فحص الحزمة بنجاح: البيانات سليمة ومتوافقة تماماً.";
                }
            }
            catch (Exception ex)
            {
                result.Success = false;
                result.Message = "تعذر قراءة أو فحص حزمة النقل: " + ex.Message;
                Logger.Error("خطأ عند فحص حزمة النقل: " + ex.Message, ex);
            }

            return result;
        }

        public MigrationRestoreResult RestorePackage(string packagePath)
        {
            var result = new MigrationRestoreResult();

            // 1. Inspect package first
            MigrationPackageInspectResult inspectRes = InspectPackage(packagePath);
            if (!inspectRes.Success || !inspectRes.IsCompatible || !inspectRes.IsChecksumValid)
            {
                result.Success = false;
                result.Message = inspectRes.Message;
                return result;
            }

            result.SourceMetrics = inspectRes.Manifest.Metrics;
            string tempExtractDir = null;

            try
            {
                Logger.Info(string.Format("بدء استرجاع حزمة النقل ({0})...", packagePath));

                tempExtractDir = Path.Combine(Path.GetTempPath(), "rafiq_mig_extract_" + Guid.NewGuid().ToString("N"));
                Directory.CreateDirectory(tempExtractDir);

                string extractedDbPath = Path.Combine(tempExtractDir, "rafiq_pos.db");

                using (var archive = ZipFile.OpenRead(packagePath))
                {
                    ZipArchiveEntry dbEntry = archive.GetEntry("rafiq_pos.db");
                    if (dbEntry == null)
                    {
                        result.Success = false;
                        result.Message = "ملف قاعدة البيانات غير موجود داخل الحزمة.";
                        return result;
                    }

                    dbEntry.ExtractToFile(extractedDbPath, true);
                }

                // Quick integrity check on extracted DB
                using (var conn = new SQLiteConnection(string.Format("Data Source={0};Version=3;Read Only=True;", extractedDbPath)))
                {
                    conn.Open();
                    using (var cmd = new SQLiteCommand("PRAGMA quick_check;", conn))
                    {
                        object res = cmd.ExecuteScalar();
                        if (res == null || !res.ToString().Equals("ok", StringComparison.OrdinalIgnoreCase))
                        {
                            result.Success = false;
                            result.Message = "قاعدة البيانات المستخرجة من الحزمة بها خلل في فحص السلامة (quick_check).";
                            return result;
                        }
                    }
                }

                // Backup current active DB to pre_restore safety folder
                if (File.Exists(_dbPath))
                {
                    try
                    {
                        string safetyDir = Path.Combine(Path.GetDirectoryName(_dbPath), "pre_restore");
                        if (!Directory.Exists(safetyDir)) Directory.CreateDirectory(safetyDir);
                        string snapPath = Path.Combine(safetyDir, string.Format("pre_migration_{0}.db", DateTime.Now.ToString("yyyyMMdd_HHmmss")));
                        File.Copy(_dbPath, snapPath, true);
                    }
                    catch { }
                }

                // Clear connection pools and force cleanup
                SQLiteConnection.ClearAllPools();
                GC.Collect();
                GC.WaitForPendingFinalizers();

                // Delete current WAL & SHM files
                try
                {
                    string walFile = _dbPath + "-wal";
                    string shmFile = _dbPath + "-shm";
                    if (File.Exists(walFile)) File.Delete(walFile);
                    if (File.Exists(shmFile)) File.Delete(shmFile);
                }
                catch { }

                // Overwrite live DB with extracted DB
                File.Copy(extractedDbPath, _dbPath, true);

                // Clear pools again
                SQLiteConnection.ClearAllPools();

                // Re-initialize DatabaseService (applies any newer migrations if restoring older package)
                DatabaseService.Initialize();

                // Collect restored metrics from live connection
                MigrationAuditMetrics restoredMetrics = GetCurrentMetrics();
                result.RestoredMetrics = restoredMetrics;

                // Compare numbers (Task 139-3)
                bool allMatch = true;

                // 1. Products
                bool prodMatch = (inspectRes.Manifest.Metrics.ProductsCount == restoredMetrics.ProductsCount);
                if (!prodMatch) allMatch = false;
                result.Comparisons.Add(new MigrationMetricComparison
                {
                    MetricKey = "products_count",
                    LabelAr = "عدد الأصناف النشطة",
                    SourceValue = inspectRes.Manifest.Metrics.ProductsCount.ToString(),
                    RestoredValue = restoredMetrics.ProductsCount.ToString(),
                    IsMatched = prodMatch
                });
                if (!prodMatch)
                {
                    result.Differences.Add(string.Format("عدد الأصناف غير متطابق: {0} بالحزمة مقابل {1} بعد النقل", inspectRes.Manifest.Metrics.ProductsCount, restoredMetrics.ProductsCount));
                }

                // 2. Customers
                bool custMatch = (inspectRes.Manifest.Metrics.CustomersCount == restoredMetrics.CustomersCount);
                if (!custMatch) allMatch = false;
                result.Comparisons.Add(new MigrationMetricComparison
                {
                    MetricKey = "customers_count",
                    LabelAr = "عدد العملاء المسجلين",
                    SourceValue = inspectRes.Manifest.Metrics.CustomersCount.ToString(),
                    RestoredValue = restoredMetrics.CustomersCount.ToString(),
                    IsMatched = custMatch
                });
                if (!custMatch)
                {
                    result.Differences.Add(string.Format("عدد العملاء غير متطابق: {0} بالحزمة مقابل {1} بعد النقل", inspectRes.Manifest.Metrics.CustomersCount, restoredMetrics.CustomersCount));
                }

                // 3. Invoices
                bool invMatch = (inspectRes.Manifest.Metrics.InvoicesCount == restoredMetrics.InvoicesCount);
                if (!invMatch) allMatch = false;
                result.Comparisons.Add(new MigrationMetricComparison
                {
                    MetricKey = "invoices_count",
                    LabelAr = "إجمالي فواتير المبيعات",
                    SourceValue = inspectRes.Manifest.Metrics.InvoicesCount.ToString(),
                    RestoredValue = restoredMetrics.InvoicesCount.ToString(),
                    IsMatched = invMatch
                });
                if (!invMatch)
                {
                    result.Differences.Add(string.Format("عدد الفواتير غير متطابق: {0} بالحزمة مقابل {1} بعد النقل", inspectRes.Manifest.Metrics.InvoicesCount, restoredMetrics.InvoicesCount));
                }

                // 4. Customer debts
                bool debtMatch = (inspectRes.Manifest.Metrics.TotalCustomerDebtPiasters == restoredMetrics.TotalCustomerDebtPiasters);
                if (!debtMatch) allMatch = false;
                result.Comparisons.Add(new MigrationMetricComparison
                {
                    MetricKey = "customer_debts",
                    LabelAr = "إجمالي ديون وآجل العملاء",
                    SourceValue = (inspectRes.Manifest.Metrics.TotalCustomerDebtPiasters / 100.0).ToString("F2") + " ج.م",
                    RestoredValue = (restoredMetrics.TotalCustomerDebtPiasters / 100.0).ToString("F2") + " ج.م",
                    IsMatched = debtMatch
                });
                if (!debtMatch)
                {
                    result.Differences.Add(string.Format("أرصدة الآجل غير متطابقة: {0} مقابل {1}", inspectRes.Manifest.Metrics.TotalCustomerDebtPiasters, restoredMetrics.TotalCustomerDebtPiasters));
                }

                // 5. Total inventory milli
                bool invMilliMatch = (inspectRes.Manifest.Metrics.TotalInventoryUnitsMilli == restoredMetrics.TotalInventoryUnitsMilli);
                if (!invMilliMatch) allMatch = false;
                result.Comparisons.Add(new MigrationMetricComparison
                {
                    MetricKey = "inventory_milli",
                    LabelAr = "مجموع كميات المخزون (بالوحدة/الكيلو)",
                    SourceValue = (inspectRes.Manifest.Metrics.TotalInventoryUnitsMilli / 1000.0).ToString("0.###"),
                    RestoredValue = (restoredMetrics.TotalInventoryUnitsMilli / 1000.0).ToString("0.###"),
                    IsMatched = invMilliMatch
                });
                if (!invMilliMatch)
                {
                    result.Differences.Add(string.Format("كميات المخزون غير متطابقة: {0} مقابل {1}", inspectRes.Manifest.Metrics.TotalInventoryUnitsMilli, restoredMetrics.TotalInventoryUnitsMilli));
                }

                // 6. Suppliers count
                bool supMatch = (inspectRes.Manifest.Metrics.SuppliersCount == restoredMetrics.SuppliersCount);
                if (!supMatch) allMatch = false;
                result.Comparisons.Add(new MigrationMetricComparison
                {
                    MetricKey = "suppliers_count",
                    LabelAr = "عدد الموردين",
                    SourceValue = inspectRes.Manifest.Metrics.SuppliersCount.ToString(),
                    RestoredValue = restoredMetrics.SuppliersCount.ToString(),
                    IsMatched = supMatch
                });

                // 7. Supplier debts
                bool supDebtMatch = (inspectRes.Manifest.Metrics.TotalSupplierDebtPiasters == restoredMetrics.TotalSupplierDebtPiasters);
                if (!supDebtMatch) allMatch = false;
                result.Comparisons.Add(new MigrationMetricComparison
                {
                    MetricKey = "supplier_debts",
                    LabelAr = "إجمالي مستحقات الموردين",
                    SourceValue = (inspectRes.Manifest.Metrics.TotalSupplierDebtPiasters / 100.0).ToString("F2") + " ج.م",
                    RestoredValue = (restoredMetrics.TotalSupplierDebtPiasters / 100.0).ToString("F2") + " ج.م",
                    IsMatched = supDebtMatch
                });

                result.IsMatch = allMatch;
                result.Success = true;
                result.Message = allMatch
                    ? "تم استرجاع الحزمة بنجاح، وجميع أرقام وإحصائيات المحل متطابقة بنسبة 100%!"
                    : "تم استرجاع الحزمة بنجاح مع وجود بعض الفروقات في الأرقام.";

                if (_auditRepo != null)
                {
                    try
                    {
                        _auditRepo.Log(new RafiqPOS.Models.AuditLog
                        {
                            Action = "migration_restore",
                            ActionArabic = "استرجاع حزمة نقل البيانات",
                            EntityType = "system",
                            EntityId = Path.GetFileName(packagePath),
                            DetailsJson = string.Format("{{\"isMatch\":{0}}}", allMatch ? "true" : "false")
                        });
                    }
                    catch { }
                }

                Logger.Info("تم استرجاع حزمة النقل والتحقق من الأعداد بنجاح: " + result.Message);
            }
            catch (Exception ex)
            {
                result.Success = false;
                result.Message = "فشل في استرجاع حزمة النقل: " + ex.Message;
                Logger.Error("خطأ عند استرجاع حزمة النقل: " + ex.Message, ex);
            }
            finally
            {
                if (tempExtractDir != null && Directory.Exists(tempExtractDir))
                {
                    try
                    {
                        Directory.Delete(tempExtractDir, true);
                    }
                    catch { }
                }
            }

            return result;
        }
    }
}
