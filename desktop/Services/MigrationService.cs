using System;
using System.Collections.Generic;
using RafiqPOS.Data;
using System.Globalization;
using System.IO;
using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
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
        // Null in packages made before these totals existed: the comparison then skips them instead of reporting a false difference
        public long? TotalSalesPiasters { get; set; }
        public long? TotalWalletBalancePiasters { get; set; }
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
        private const long MAX_PACKAGE_BYTES = 8L * 1024L * 1024L * 1024L;
        private const long MAX_MANIFEST_BYTES = 1024L * 1024L;
        private const string UNSAFE_PACKAGE_MESSAGE = "حزمة النقل غير صالحة: تحتوي على ملفات أو مسارات غير مسموحة، تم رفضها حمايةً للبيانات.";
        private const string CORRUPT_PACKAGE_MESSAGE = "تعذر قراءة حزمة النقل: الملف تالف أو ناقص أو ليس حزمة رفيق (قد تكون الفلاشة أُزيلت أثناء النسخ).";

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

        // Everything a verified package leaves on disk while it is being inspected or restored; always removed afterwards
        private sealed class PackageWork : IDisposable
        {
            public string TempRoot;
            public string PackageFullPath;
            public string DbPath;
            public string PrescriptionsDir;
            public MigrationPackageManifest Manifest;
            public bool ChecksumValid;
            public bool Compatible;

            public void Dispose()
            {
                if (TempRoot != null && Directory.Exists(TempRoot))
                {
                    // an imported legacy package holds a PLAIN database here: zero-fill it before the folder goes
                    SecureDelete.WipePlainSqliteFiles(TempRoot);
                    try
                    {
                        Directory.Delete(TempRoot, true);
                    }
                    catch (IOException ex)
                    {
                        Logger.Warn("تعذر حذف الملفات المؤقتة لحزمة النقل: " + ex.Message);
                    }
                    catch (UnauthorizedAccessException ex)
                    {
                        Logger.Warn("تعذر حذف الملفات المؤقتة لحزمة النقل: " + ex.Message);
                    }
                }
            }
        }

        public static string ComputeSha256(string filePath)
        {
            using (var stream = File.OpenRead(filePath))
            {
                return ComputeSha256(stream);
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

        private static long ReadLong(SQLiteConnection conn, string sql, string label)
        {
            try
            {
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    object res = cmd.ExecuteScalar();
                    return (res != null && res != DBNull.Value) ? Convert.ToInt64(res) : 0L;
                }
            }
            catch (Exception ex)
            {
                // A table missing in an old package reads as zero on both sides of the comparison; the cause stays in the log
                Logger.Warn("تعذر حساب مؤشر النقل (" + label + "): " + ex.Message);
                return 0L;
            }
        }

        // Integer piasters and milli-units only: no floating point touches a money figure
        public static MigrationAuditMetrics CollectMetricsFromConnection(SQLiteConnection conn)
        {
            var metrics = new MigrationAuditMetrics();
            metrics.ProductsCount = (int)ReadLong(conn, "SELECT COUNT(*) FROM products WHERE is_active = 1;", "products");
            metrics.CustomersCount = (int)ReadLong(conn, "SELECT COUNT(*) FROM customers;", "customers");
            metrics.InvoicesCount = (int)ReadLong(conn, "SELECT COUNT(*) FROM sales WHERE status = 'completed';", "invoices");
            metrics.TotalCustomerDebtPiasters = ReadLong(conn, "SELECT COALESCE(SUM(balance_piasters), 0) FROM customers;", "customer_debts");
            metrics.TotalInventoryUnitsMilli = ReadLong(conn, "SELECT COALESCE(SUM(stock_quantity_milli), 0) FROM products WHERE is_active = 1;", "inventory");
            metrics.TotalInventoryItemsCount = (int)ReadLong(conn, "SELECT COUNT(*) FROM products WHERE is_active = 1 AND stock_quantity_milli > 0;", "inventory_items");
            metrics.SuppliersCount = (int)ReadLong(conn, "SELECT COUNT(*) FROM suppliers WHERE is_active = 1;", "suppliers");
            metrics.TotalSupplierDebtPiasters = ReadLong(conn, "SELECT COALESCE(SUM(balance_piasters), 0) FROM suppliers WHERE is_active = 1;", "supplier_debts");
            metrics.CategoriesCount = (int)ReadLong(conn, "SELECT COUNT(*) FROM categories;", "categories");
            metrics.TotalSalesPiasters = ReadLong(conn, "SELECT COALESCE(SUM(total_piasters), 0) FROM sales WHERE status = 'completed';", "sales_total");
            metrics.TotalWalletBalancePiasters = ReadLong(conn, "SELECT COALESCE(SUM(balance_piasters), 0) FROM digital_accounts;", "wallet_balances");
            return metrics;
        }

        private static MigrationAuditMetrics ReadMetricsFromFile(string dbFile)
        {
            // Packages made before encryption hold a plain database, current ones an encrypted one: the header decides
            using (var conn = DatabaseFileAccess.OpenExisting(dbFile, true))
            {
                return CollectMetricsFromConnection(conn);
            }
        }

        // Display only: whole pounds and piasters are split with integer arithmetic
        private static string FormatPiasters(long piasters)
        {
            long abs = piasters < 0 ? -piasters : piasters;
            return (piasters < 0 ? "-" : "") + (abs / 100).ToString(CultureInfo.InvariantCulture) + "." + (abs % 100).ToString("00", CultureInfo.InvariantCulture) + " ج.م";
        }

        private static string FormatMilli(long milli)
        {
            long abs = milli < 0 ? -milli : milli;
            string fraction = (abs % 1000).ToString("000", CultureInfo.InvariantCulture).TrimEnd('0');
            return (milli < 0 ? "-" : "") + (abs / 1000).ToString(CultureInfo.InvariantCulture) + (fraction.Length > 0 ? "." + fraction : "");
        }

        private static void AddCountComparison(List<MigrationMetricComparison> list, string key, string label, long source, long restored)
        {
            list.Add(new MigrationMetricComparison
            {
                MetricKey = key,
                LabelAr = label,
                SourceValue = source.ToString(CultureInfo.InvariantCulture),
                RestoredValue = restored.ToString(CultureInfo.InvariantCulture),
                IsMatched = source == restored
            });
        }

        private static void AddMoneyComparison(List<MigrationMetricComparison> list, string key, string label, long source, long restored)
        {
            list.Add(new MigrationMetricComparison
            {
                MetricKey = key,
                LabelAr = label,
                SourceValue = FormatPiasters(source),
                RestoredValue = FormatPiasters(restored),
                IsMatched = source == restored
            });
        }

        private static List<MigrationMetricComparison> BuildComparisons(MigrationAuditMetrics source, MigrationAuditMetrics restored)
        {
            var list = new List<MigrationMetricComparison>();
            AddCountComparison(list, "products_count", "عدد الأصناف النشطة", source.ProductsCount, restored.ProductsCount);
            AddCountComparison(list, "customers_count", "عدد العملاء المسجلين", source.CustomersCount, restored.CustomersCount);
            AddCountComparison(list, "invoices_count", "إجمالي فواتير المبيعات", source.InvoicesCount, restored.InvoicesCount);
            AddMoneyComparison(list, "customer_debts", "إجمالي ديون وآجل العملاء", source.TotalCustomerDebtPiasters, restored.TotalCustomerDebtPiasters);
            list.Add(new MigrationMetricComparison
            {
                MetricKey = "inventory_milli",
                LabelAr = "مجموع كميات المخزون (بالوحدة/الكيلو)",
                SourceValue = FormatMilli(source.TotalInventoryUnitsMilli),
                RestoredValue = FormatMilli(restored.TotalInventoryUnitsMilli),
                IsMatched = source.TotalInventoryUnitsMilli == restored.TotalInventoryUnitsMilli
            });
            AddCountComparison(list, "suppliers_count", "عدد الموردين", source.SuppliersCount, restored.SuppliersCount);
            AddMoneyComparison(list, "supplier_debts", "إجمالي مستحقات الموردين", source.TotalSupplierDebtPiasters, restored.TotalSupplierDebtPiasters);
            AddCountComparison(list, "categories_count", "عدد الأقسام", source.CategoriesCount, restored.CategoriesCount);
            if (source.TotalSalesPiasters.HasValue && restored.TotalSalesPiasters.HasValue)
            {
                AddMoneyComparison(list, "sales_total", "إجمالي قيمة فواتير المبيعات", source.TotalSalesPiasters.Value, restored.TotalSalesPiasters.Value);
            }
            if (source.TotalWalletBalancePiasters.HasValue && restored.TotalWalletBalancePiasters.HasValue)
            {
                AddMoneyComparison(list, "wallet_balances", "إجمالي أرصدة المحافظ والحسابات الرقمية", source.TotalWalletBalancePiasters.Value, restored.TotalWalletBalancePiasters.Value);
            }
            return list;
        }

        private string AllowedNetworkFolder()
        {
            try
            {
                return _settingsRepo != null ? _settingsRepo.Get("backup_target_folder", "") : null;
            }
            catch (Exception ex)
            {
                Logger.Warn("تعذر قراءة مجلد النسخ الاحتياطي المسموح: " + ex.Message);
                return null;
            }
        }

        private string LiveDataFolder()
        {
            return string.IsNullOrEmpty(_dbPath) ? null : Path.GetDirectoryName(_dbPath);
        }

        private static bool SameFolder(string a, string b)
        {
            if (string.IsNullOrEmpty(a) || string.IsNullOrEmpty(b)) return false;
            return string.Equals(a.TrimEnd('\\', '/'), b.TrimEnd('\\', '/'), StringComparison.OrdinalIgnoreCase);
        }

        // Same rules as the backup restore gate: no device/stream syntax, a full path, network shares only inside the configured backup folder
        private string CheckFolderSyntax(string trimmed, string what, out string full)
        {
            full = null;
            if (BackupService.HasUnsafePathSyntax(trimmed))
            {
                return what + " غير صالح أو غير مسموح.";
            }
            bool driveRelative = trimmed.Length >= 2 && trimmed[1] == ':' && (trimmed.Length < 3 || (trimmed[2] != '\\' && trimmed[2] != '/'));
            if (!Path.IsPathRooted(trimmed) || driveRelative)
            {
                return "يجب كتابة المسار كاملاً مثل E:\\RafiqMigration وليس مساراً نسبياً.";
            }
            try
            {
                full = Path.GetFullPath(trimmed);
            }
            catch (Exception)
            {
                return what + " غير صالح.";
            }
            if (full.StartsWith("\\\\", StringComparison.Ordinal) && !BackupService.IsPathInsideFolder(full, AllowedNetworkFolder()))
            {
                full = null;
                return "مسارات الشبكة غير مسموحة إلا داخل مجلد النسخ الاحتياطي المحدد في الإعدادات.";
            }
            return null;
        }

        private string ValidatePackageSource(string path, out string fullPath)
        {
            fullPath = null;
            if (string.IsNullOrWhiteSpace(path))
            {
                return "لم يتم تحديد ملف حزمة النقل.";
            }

            string full;
            string syntaxError = CheckFolderSyntax(path.Trim().Trim('"'), "مسار حزمة النقل", out full);
            if (syntaxError != null)
            {
                return syntaxError;
            }
            if (!string.Equals(Path.GetExtension(full), ".rafiqpkg", StringComparison.OrdinalIgnoreCase))
            {
                return "الملف المحدد ليس حزمة نقل من رفيق (الامتداد المطلوب rafiqpkg).";
            }
            if (!File.Exists(full))
            {
                return "ملف حزمة النقل المحدد غير موجود. تأكد أن الفلاشة متصلة بالجهاز.";
            }
            try
            {
                if ((File.GetAttributes(full) & FileAttributes.ReparsePoint) != 0)
                {
                    return "الملف المحدد اختصار أو رابط رمزي وليس حزمة نقل فعلية.";
                }
            }
            catch (Exception)
            {
                return "تعذر قراءة خصائص ملف حزمة النقل.";
            }
            if (BackupService.IsPathInsideFolder(full, LiveDataFolder()))
            {
                return "لا يمكن استرجاع حزمة من داخل مجلد بيانات النظام الحالي. انسخها أولاً إلى فلاشة أو مجلد آخر.";
            }

            fullPath = full;
            return null;
        }

        // The package is only opened for someone who knows the owner recovery code of the shop it came from
        private string ValidatePackageAccess(string path, string recoveryCode, out string fullPath)
        {
            string pathError = ValidatePackageSource(path, out fullPath);
            if (pathError != null)
            {
                return pathError;
            }
            if (!EncryptionService.IsFileEncrypted(fullPath))
            {
                return "حزمة النقل غير مشفرة (تنسيق قديم) ولا يمكن استرجاعها بأمان. أعد تصدير الحزمة من الجهاز القديم بنسخة رفيق الحالية.";
            }
            if (string.IsNullOrWhiteSpace(recoveryCode))
            {
                return "يرجى إدخال كود استرجاع المالك (كود الجهاز القديم الذي صُدّرت منه الحزمة) لفتح الحزمة.";
            }
            if (!EncryptionService.CanUnlockWithRecoveryCode(fullPath, recoveryCode))
            {
                return "كود استرجاع المالك غير صحيح لهذه الحزمة، أو أن الملف ليس حزمة نقل رفيق صالحة.";
            }
            return null;
        }

        private static string ValidateArchiveEntries(ZipArchive archive)
        {
            long total = 0;
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (ZipArchiveEntry entry in archive.Entries)
            {
                string name = entry.FullName;
                if (string.IsNullOrEmpty(name) || name.IndexOf('\\') >= 0 || name.IndexOf(':') >= 0 || name.StartsWith("/", StringComparison.Ordinal))
                {
                    return UNSAFE_PACKAGE_MESSAGE;
                }
                string[] parts = name.Split('/');
                for (int i = 0; i < parts.Length; i++)
                {
                    if (parts[i] == "..")
                    {
                        return UNSAFE_PACKAGE_MESSAGE;
                    }
                }
                bool allowed = name == "manifest.json" || name == "rafiq_pos.db" || name.StartsWith("prescriptions/", StringComparison.Ordinal);
                if (!allowed || !seen.Add(name))
                {
                    return UNSAFE_PACKAGE_MESSAGE;
                }
                total += entry.Length;
                if (entry.Length > MAX_PACKAGE_BYTES || total > MAX_PACKAGE_BYTES)
                {
                    return "حجم محتويات حزمة النقل أكبر من المسموح، تم رفضها.";
                }
            }
            return null;
        }

        // Copies at most the size the archive declares, so a header that lies about a small entry cannot fill the disk
        private static void ExtractEntryBounded(ZipArchiveEntry entry, string destFile)
        {
            using (Stream source = entry.Open())
            using (var target = new FileStream(destFile, FileMode.Create, FileAccess.Write, FileShare.None))
            {
                byte[] buffer = new byte[81920];
                long copied = 0;
                int read;
                while ((read = source.Read(buffer, 0, buffer.Length)) > 0)
                {
                    copied += read;
                    if (copied > entry.Length)
                    {
                        throw new InvalidDataException("entry larger than declared");
                    }
                    target.Write(buffer, 0, read);
                }
            }
        }

        private static void ExtractPrescriptions(ZipArchive archive, string rxDir)
        {
            string canonicalRoot = Path.GetFullPath(rxDir).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
            foreach (ZipArchiveEntry entry in archive.Entries)
            {
                if (!entry.FullName.StartsWith("prescriptions/", StringComparison.Ordinal) || string.IsNullOrEmpty(entry.Name))
                {
                    continue;
                }
                string relative = entry.FullName.Substring("prescriptions/".Length).Replace('/', Path.DirectorySeparatorChar);
                string destFile = Path.GetFullPath(Path.Combine(rxDir, relative));
                if (!destFile.StartsWith(canonicalRoot, StringComparison.OrdinalIgnoreCase))
                {
                    throw new System.Security.SecurityException(UNSAFE_PACKAGE_MESSAGE);
                }
                string destParent = Path.GetDirectoryName(destFile);
                if (!string.IsNullOrEmpty(destParent) && !Directory.Exists(destParent))
                {
                    Directory.CreateDirectory(destParent);
                }
                ExtractEntryBounded(entry, destFile);
            }
        }

        /// <summary>
        /// Opens a package without touching the live database: access gate (path, encryption, recovery code), archive entry
        /// whitelist (zip slip / bomb), manifest, SHA-256 of the database, integrity and schema checks on the extracted copy, and
        /// the real counts and totals of that copy against the manifest. Returns the Arabic reason, or null when the package is sound.
        /// </summary>
        private string PreparePackage(string packagePath, string recoveryCode, bool withPrescriptions, PackageWork work)
        {
            string fullPath;
            string accessError = ValidatePackageAccess(packagePath, recoveryCode, out fullPath);
            if (accessError != null)
            {
                return accessError;
            }
            work.PackageFullPath = fullPath;

            try
            {
                work.TempRoot = Path.Combine(Path.GetTempPath(), "rafiq_mig_work_" + Guid.NewGuid().ToString("N"));
                string extractDir = Path.Combine(work.TempRoot, "extracted");
                Directory.CreateDirectory(extractDir);
                string zipPath = Path.Combine(work.TempRoot, "package.zip");
                work.DbPath = Path.Combine(extractDir, "rafiq_pos.db");
                work.PrescriptionsDir = Path.Combine(extractDir, "prescriptions");

                // Decryption verifies the HMAC of the whole file first, so a truncated or edited package stops here
                var enc = DatabaseService.Encryption ?? new EncryptionService();
                try
                {
                    enc.DecryptFile(fullPath, zipPath, recoveryCode);
                }
                catch (CryptographicException cex)
                {
                    Logger.Warn("فشل فك تشفير حزمة النقل: " + cex.Message);
                    return cex.Message;
                }

                string manifestJson;
                using (ZipArchive archive = ZipFile.OpenRead(zipPath))
                {
                    string entriesError = ValidateArchiveEntries(archive);
                    if (entriesError != null)
                    {
                        return entriesError;
                    }

                    ZipArchiveEntry manifestEntry = archive.GetEntry("manifest.json");
                    if (manifestEntry == null)
                    {
                        return "حزمة النقل غير صالحة: ملف البيان (manifest.json) مفقود داخل الحزمة.";
                    }
                    if (manifestEntry.Length > MAX_MANIFEST_BYTES)
                    {
                        return UNSAFE_PACKAGE_MESSAGE;
                    }
                    using (var reader = new StreamReader(manifestEntry.Open(), Encoding.UTF8))
                    {
                        manifestJson = reader.ReadToEnd();
                    }

                    ZipArchiveEntry dbEntry = archive.GetEntry("rafiq_pos.db");
                    if (dbEntry == null)
                    {
                        return "حزمة النقل غير صالحة: ملف قاعدة البيانات مفقود داخل الحزمة.";
                    }
                    ExtractEntryBounded(dbEntry, work.DbPath);

                    if (withPrescriptions)
                    {
                        ExtractPrescriptions(archive, work.PrescriptionsDir);
                    }
                }

                MigrationPackageManifest manifest;
                try
                {
                    manifest = JsonConvert.DeserializeObject<MigrationPackageManifest>(manifestJson);
                }
                catch (JsonException jex)
                {
                    Logger.Warn("ملف البيان في حزمة النقل غير مقروء: " + jex.Message);
                    manifest = null;
                }
                if (manifest == null || manifest.Metrics == null || string.IsNullOrEmpty(manifest.DatabaseSha256))
                {
                    return "حزمة النقل غير صالحة: ملف البيان (manifest.json) تالف أو ناقص.";
                }
                work.Manifest = manifest;

                work.ChecksumValid = string.Equals(ComputeSha256(work.DbPath), manifest.DatabaseSha256, StringComparison.OrdinalIgnoreCase);
                if (!work.ChecksumValid)
                {
                    return "تحذير أمني: البصمة الرقمية للبيانات داخل الحزمة لا تطابق البيان، قد يكون الملف معدلاً أو تالفاً.";
                }

                if (manifest.SchemaVersion > MigrationRunner.LATEST_SUPPORTED_VERSION)
                {
                    return string.Format("إصدار قاعدة البيانات في الحزمة ({0}) أحدث من إصدار البرنامج الحالي ({1}). يرجى تحديث برنامج رفيق على هذا الجهاز أولاً.", manifest.SchemaVersion, MigrationRunner.LATEST_SUPPORTED_VERSION);
                }

                string dbError = VerifyExtractedDatabase(work);
                if (dbError != null)
                {
                    return dbError;
                }

                work.Compatible = true;
                return null;
            }
            catch (System.Security.SecurityException sex)
            {
                Logger.Warn("حزمة نقل بمسارات غير آمنة: " + sex.Message);
                return UNSAFE_PACKAGE_MESSAGE;
            }
            catch (InvalidDataException iex)
            {
                Logger.Warn("حزمة نقل تالفة: " + iex.Message);
                return CORRUPT_PACKAGE_MESSAGE;
            }
            catch (IOException ioex)
            {
                Logger.Error("تعذرت قراءة حزمة النقل", ioex);
                return CORRUPT_PACKAGE_MESSAGE;
            }
            catch (UnauthorizedAccessException uex)
            {
                Logger.Error("تعذر الوصول إلى ملفات حزمة النقل", uex);
                return "تعذر الوصول إلى حزمة النقل أو إلى المجلد المؤقت لفحصها. تأكد من صلاحيات الجهاز وأن الفلاشة متصلة.";
            }
        }

        private static string VerifyExtractedDatabase(PackageWork work)
        {
            using (var conn = DatabaseFileAccess.OpenExisting(work.DbPath, true))
            {
                using (var cmd = new SQLiteCommand("PRAGMA quick_check;", conn))
                {
                    object res = cmd.ExecuteScalar();
                    if (res == null || !res.ToString().Equals("ok", StringComparison.OrdinalIgnoreCase))
                    {
                        return "قاعدة البيانات داخل الحزمة بها خلل في فحص السلامة (quick_check)، لذلك لم يتم استرجاعها.";
                    }
                }

                using (var cmd = new SQLiteCommand("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN ('schema_migrations', 'products', 'sales', 'customers', 'app_settings');", conn))
                {
                    if (Convert.ToInt32(cmd.ExecuteScalar()) != 5)
                    {
                        return "قاعدة البيانات داخل الحزمة ناقصة (جداول أساسية مفقودة) وليست نسخة رفيق كاملة.";
                    }
                }

                // The manifest is not trusted for the schema version: the database itself decides
                using (var cmd = new SQLiteCommand("SELECT COALESCE(MAX(version), 0) FROM schema_migrations;", conn))
                {
                    int actualVersion = Convert.ToInt32(cmd.ExecuteScalar());
                    if (actualVersion > MigrationRunner.LATEST_SUPPORTED_VERSION)
                    {
                        return string.Format("إصدار قاعدة البيانات في الحزمة ({0}) أحدث من إصدار البرنامج الحالي ({1}). يرجى تحديث برنامج رفيق على هذا الجهاز أولاً.", actualVersion, MigrationRunner.LATEST_SUPPORTED_VERSION);
                    }
                }

                MigrationAuditMetrics actual = CollectMetricsFromConnection(conn);
                List<MigrationMetricComparison> comparisons = BuildComparisons(work.Manifest.Metrics, actual);
                for (int i = 0; i < comparisons.Count; i++)
                {
                    if (!comparisons[i].IsMatched)
                    {
                        return "أرقام البيان المسجلة في الحزمة لا تطابق البيانات الفعلية داخلها (" + comparisons[i].LabelAr + ")، لذلك لم يتم استرجاعها.";
                    }
                }
            }
            return null;
        }

        private static bool TryGetFreeSpace(string folder, out long freeBytes)
        {
            freeBytes = 0;
            try
            {
                string root = Path.GetPathRoot(Path.GetFullPath(folder));
                if (string.IsNullOrEmpty(root) || root.StartsWith("\\\\", StringComparison.Ordinal))
                {
                    return false;
                }
                freeBytes = new DriveInfo(root).AvailableFreeSpace;
                return true;
            }
            catch (Exception)
            {
                return false;
            }
        }

        private static bool IsFolderWritable(string folder)
        {
            string probe = Path.Combine(folder, ".rafiq_write_test_" + Guid.NewGuid().ToString("N"));
            try
            {
                File.WriteAllText(probe, "x");
                File.Delete(probe);
                return true;
            }
            catch (IOException)
            {
                return false;
            }
            catch (UnauthorizedAccessException)
            {
                return false;
            }
        }

        // The folder the user named is used exactly or the export fails: a package must never land somewhere the user did not choose
        private string ResolveExportFolder(string targetFolder, out string error)
        {
            error = null;
            string resolved = null;
            if (!string.IsNullOrWhiteSpace(targetFolder))
            {
                string full;
                error = CheckFolderSyntax(targetFolder.Trim().Trim('"'), "مسار مكان الحفظ", out full);
                if (error != null)
                {
                    return null;
                }
                string liveFolder = LiveDataFolder();
                if (SameFolder(full, liveFolder) || BackupService.IsPathInsideFolder(full, liveFolder))
                {
                    error = "لا يمكن حفظ حزمة النقل داخل مجلد بيانات النظام. اختر الفلاشة أو مجلداً آخر.";
                    return null;
                }
                if (!Directory.Exists(full))
                {
                    string root = Path.GetPathRoot(full);
                    if (string.IsNullOrEmpty(root) || !Directory.Exists(root))
                    {
                        error = "المكان المحدد غير متاح. تأكد أن الفلاشة متصلة بالجهاز ثم أعد المحاولة.";
                        return null;
                    }
                    try
                    {
                        Directory.CreateDirectory(full);
                    }
                    catch (Exception ex)
                    {
                        Logger.Error("تعذر إنشاء مجلد حزمة النقل", ex);
                        error = "تعذر إنشاء مجلد الحفظ. تأكد أن الفلاشة متصلة وغير محمية من الكتابة.";
                        return null;
                    }
                }
                resolved = full;
            }
            else
            {
                DriveInfo[] allDrives = DriveInfo.GetDrives();
                for (int i = 0; i < allDrives.Length && resolved == null; i++)
                {
                    if (allDrives[i].DriveType == DriveType.Removable && allDrives[i].IsReady)
                    {
                        resolved = allDrives[i].RootDirectory.FullName;
                    }
                }
                if (resolved == null)
                {
                    string desktop = Environment.GetFolderPath(Environment.SpecialFolder.Desktop);
                    if (!string.IsNullOrWhiteSpace(desktop) && Directory.Exists(desktop))
                    {
                        resolved = desktop;
                    }
                }
                if (resolved == null)
                {
                    string downloads = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads");
                    if (Directory.Exists(downloads))
                    {
                        resolved = downloads;
                    }
                }
                if (resolved == null)
                {
                    error = "لم يتم العثور على مكان صالح للحفظ. وصّل الفلاشة بالجهاز أو اختر مجلداً.";
                    return null;
                }
            }

            if (!IsFolderWritable(resolved))
            {
                error = "لا يمكن الكتابة في مكان الحفظ المحدد. تأكد أن الفلاشة متصلة وغير محمية من الكتابة.";
                return null;
            }
            return resolved;
        }

        private static string SafeFileNamePart(string text)
        {
            string normalized = ArabicTextNormalizer.Normalize(text ?? "");
            char[] invalid = Path.GetInvalidFileNameChars();
            var sb = new StringBuilder();
            for (int i = 0; i < normalized.Length && sb.Length < 20; i++)
            {
                char c = normalized[i];
                sb.Append(char.IsWhiteSpace(c) || Array.IndexOf(invalid, c) >= 0 ? '_' : c);
            }
            return sb.Length == 0 ? "store" : sb.ToString();
        }

        private void LogAudit(string action, string actionArabic, string entityId, JObject details)
        {
            if (_auditRepo == null) return;
            try
            {
                RafiqPOS.Models.UserDto user = SecurityService.CurrentUser;
                _auditRepo.Log(new RafiqPOS.Models.AuditLog
                {
                    UserId = user != null ? user.Id : null,
                    Action = action,
                    ActionArabic = actionArabic,
                    EntityType = "system",
                    EntityId = entityId,
                    DetailsJson = details.ToString(Formatting.None)
                });
            }
            catch (Exception ex)
            {
                Logger.Warn("تعذر تسجيل عملية النقل في سجل التدقيق: " + ex.Message);
            }
        }

        public MigrationPackageExportResult CreateMigrationPackage(string targetFolder)
        {
            return CreateMigrationPackage(targetFolder, null);
        }

        /// <summary>
        /// Writes one encrypted package: consistent snapshot (SQLite online backup), manifest with SHA-256 and the shop numbers,
        /// the encrypted file is created beside its final name and renamed, then read back and verified. A package that fails the
        /// read-back is deleted, so a half-written file on a removed flash drive is never reported as success.
        /// </summary>
        public MigrationPackageExportResult CreateMigrationPackage(string targetFolder, string recoveryCode)
        {
            var result = new MigrationPackageExportResult();
            string workDir = null;
            string finalPath = null;
            bool completed = false;

            try
            {
                string folderError;
                string resolvedFolder = ResolveExportFolder(targetFolder, out folderError);
                if (folderError != null)
                {
                    result.Message = folderError;
                    return result;
                }

                string code = recoveryCode;
                if (string.IsNullOrWhiteSpace(code) && DatabaseService.Backup != null)
                {
                    code = DatabaseService.Backup.GetOrCreateRecoveryCode();
                }
                if (string.IsNullOrWhiteSpace(code))
                {
                    result.Message = "تعذر تحديد كود استرجاع المالك لتشفير الحزمة، لذلك لم يتم التصدير.";
                    return result;
                }

                Logger.Info("بدء تصدير حزمة نقل البرنامج والبيانات إلى جهاز جديد...");

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

                workDir = Path.Combine(Path.GetTempPath(), "rafiq_mig_staging_" + Guid.NewGuid().ToString("N"));
                string stagingDir = Path.Combine(workDir, "package");
                Directory.CreateDirectory(stagingDir);
                string stagingDbPath = Path.Combine(stagingDir, "rafiq_pos.db");

                // The staged copy has the live file's format (encrypted for an encrypted store), so the temp folder never holds plaintext
                bool livePlain = DatabaseKeyProvider.IsPlainSqliteFile(_dbPath);
                using (var srcConn = new SQLiteConnection(_connectionString))
                using (var dstConn = DatabaseFileAccess.Open(stagingDbPath, false, livePlain))
                {
                    srcConn.Open();
                    srcConn.BackupDatabase(dstConn, "main", "main", -1, null, 0);
                }

                string dbSha256 = ComputeSha256(stagingDbPath);
                MigrationAuditMetrics metrics = ReadMetricsFromFile(stagingDbPath);

                SQLiteConnection.ClearAllPools();
                GC.Collect();
                GC.WaitForPendingFinalizers();

                string shmPath = stagingDbPath + "-shm";
                if (File.Exists(shmPath))
                {
                    try { File.Delete(shmPath); } catch { }
                }
                string walPath = stagingDbPath + "-wal";
                if (File.Exists(walPath))
                {
                    try { File.Delete(walPath); } catch { }
                }

                string storeName = _settingsRepo != null ? _settingsRepo.Get("store_name", "متجر رفيق") : "متجر رفيق";
                string taxNumber = _settingsRepo != null ? _settingsRepo.Get("tax_number", "") : "";

                var manifest = new MigrationPackageManifest();
                manifest.CreatedAtUtc = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ");
                manifest.CreatedAtLocal = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss");
                manifest.SourceMachineName = Environment.MachineName;
                manifest.SourceOsName = OsDetector.GetOsFriendlyName();
                manifest.SourceOsBuild = OsDetector.GetBuildNumber().ToString();
                manifest.AppVersion = AppUpdateService.CurrentVersion;
                manifest.SchemaVersion = MigrationRunner.LATEST_SUPPORTED_VERSION;
                manifest.StoreName = storeName;
                manifest.TaxNumber = taxNumber;
                manifest.DatabaseSha256 = dbSha256;
                manifest.Metrics = metrics;
                File.WriteAllText(Path.Combine(stagingDir, "manifest.json"), JsonConvert.SerializeObject(manifest, Formatting.Indented), Encoding.UTF8);

                // Feature F-193: Include prescriptions directory if exists
                string baseDataDir = LiveDataFolder();
                if (!string.IsNullOrEmpty(baseDataDir))
                {
                    string liveRxDir = Path.Combine(baseDataDir, "prescriptions");
                    if (Directory.Exists(liveRxDir))
                    {
                        CopyDirectoryRecursive(liveRxDir, Path.Combine(stagingDir, "prescriptions"));
                    }
                }

                // The raw zip stays on the local disk: only the finished encrypted file is ever written to the flash drive
                string rawZip = Path.Combine(workDir, "package.zip");
                ZipFile.CreateFromDirectory(stagingDir, rawZip, CompressionLevel.Optimal, false);

                long packageBytes = new FileInfo(rawZip).Length;
                long freeBytes;
                if (TryGetFreeSpace(resolvedFolder, out freeBytes) && freeBytes < (packageBytes / 10L) * 12L + 65536L)
                {
                    result.Message = "المساحة الفارغة في مكان الحفظ لا تكفي لحزمة النقل. المطلوب تقريباً " + FormatBytesArabic((packageBytes / 10L) * 12L + 65536L) + ".";
                    return result;
                }

                string baseName = string.Format("rafiq_migration_{0}_{1:yyyyMMdd_HHmmss}", SafeFileNamePart(storeName), DateTime.Now);
                finalPath = Path.Combine(resolvedFolder, baseName + ".rafiqpkg");
                int suffix = 2;
                while (File.Exists(finalPath))
                {
                    finalPath = Path.Combine(resolvedFolder, baseName + "_" + suffix.ToString(CultureInfo.InvariantCulture) + ".rafiqpkg");
                    suffix++;
                }

                var encService = DatabaseService.Encryption ?? new EncryptionService();
                encService.EncryptFileDualWrap(rawZip, finalPath, code);

                using (var verify = new PackageWork())
                {
                    string verifyError = PreparePackage(finalPath, code, false, verify);
                    if (verifyError != null)
                    {
                        result.Message = "تم إلغاء التصدير لأن فحص الملف بعد كتابته فشل (قد تكون الفلاشة تالفة أو أُزيلت أثناء الحفظ): " + verifyError;
                        return result;
                    }
                }

                var fi = new FileInfo(finalPath);
                result.Success = true;
                result.FilePath = finalPath;
                result.FileName = fi.Name;
                result.FileSizeBytes = fi.Length;
                result.Manifest = manifest;
                result.Message = "تم إنشاء حزمة النقل وفحصها بنجاح، وهي جاهزة للنقل للجهاز الجديد.";
                completed = true;

                var details = new JObject();
                details["file"] = fi.Name;
                details["size"] = fi.Length;
                details["packageId"] = dbSha256.Substring(0, 16);
                details["schemaVersion"] = manifest.SchemaVersion;
                LogAudit("migration_export", "تصدير حزمة نقل البيانات", fi.Name, details);

                Logger.Info(string.Format("تم إنشاء حزمة النقل بنجاح في: {0}", finalPath));
            }
            catch (IOException ex)
            {
                result.Success = false;
                result.Message = "تعذر كتابة حزمة النقل. تأكد أن الفلاشة متصلة وبها مساحة كافية ولم تُسحب أثناء الحفظ، ثم أعد المحاولة.";
                Logger.Error("خطأ إدخال/إخراج في إنشاء حزمة النقل: " + ex.Message, ex);
            }
            catch (UnauthorizedAccessException ex)
            {
                result.Success = false;
                result.Message = "لا توجد صلاحية للكتابة في مكان الحفظ المحدد. اختر الفلاشة أو مجلداً آخر.";
                Logger.Error("خطأ صلاحيات في إنشاء حزمة النقل: " + ex.Message, ex);
            }
            catch (Exception ex)
            {
                result.Success = false;
                result.Message = "فشل إنشاء حزمة النقل بسبب خطأ غير متوقع. التفاصيل محفوظة في سجل النظام.";
                Logger.Error("خطأ في إنشاء حزمة النقل: " + ex.Message, ex);
            }
            finally
            {
                if (!completed && finalPath != null)
                {
                    foreach (string leftover in new string[] { finalPath, finalPath + ".tmp" })
                    {
                        try
                        {
                            if (File.Exists(leftover)) File.Delete(leftover);
                        }
                        catch (IOException ex)
                        {
                            Logger.Warn("تعذر حذف ملف حزمة غير مكتمل: " + ex.Message);
                        }
                        catch (UnauthorizedAccessException ex)
                        {
                            Logger.Warn("تعذر حذف ملف حزمة غير مكتمل: " + ex.Message);
                        }
                    }
                }
                if (workDir != null && Directory.Exists(workDir))
                {
                    SecureDelete.WipePlainSqliteFiles(workDir);
                    try
                    {
                        Directory.Delete(workDir, true);
                    }
                    catch (IOException ex)
                    {
                        Logger.Warn("تعذر حذف الملفات المؤقتة لتصدير الحزمة: " + ex.Message);
                    }
                    catch (UnauthorizedAccessException ex)
                    {
                        Logger.Warn("تعذر حذف الملفات المؤقتة لتصدير الحزمة: " + ex.Message);
                    }
                }
            }

            return result;
        }

        private static string FormatBytesArabic(long bytes)
        {
            long mb = (bytes + 1048575L) / 1048576L;
            return mb.ToString(CultureInfo.InvariantCulture) + " ميجابايت";
        }

        public MigrationPackageInspectResult InspectPackage(string packagePath, string recoveryCode)
        {
            var result = new MigrationPackageInspectResult();
            result.PackagePath = packagePath;

            try
            {
                using (var work = new PackageWork())
                {
                    string error = PreparePackage(packagePath, recoveryCode, false, work);
                    result.Manifest = work.Manifest;
                    result.IsChecksumValid = work.ChecksumValid;
                    result.IsCompatible = work.Compatible;
                    if (error != null)
                    {
                        result.Success = false;
                        result.Message = error;
                        result.CompatibilityNotes = error;
                        return result;
                    }
                    result.Success = true;
                    result.CompatibilityNotes = "الحزمة مشفرة وسليمة ومتوافقة مع هذا الإصدار من رفيق POS، وأرقامها مطابقة لبياناتها.";
                    result.Message = "تم فحص الحزمة بنجاح: البيانات مشفرة وسليمة ومتوافقة تماماً.";
                }
            }
            catch (Exception ex)
            {
                result.Success = false;
                result.Message = "تعذر فحص حزمة النقل بسبب خطأ غير متوقع. التفاصيل محفوظة في سجل النظام.";
                Logger.Error("خطأ عند فحص حزمة النقل: " + ex.Message, ex);
            }
            return result;
        }

        private string CheckRestoreDiskSpace(string replacementDb)
        {
            long incoming = new FileInfo(replacementDb).Length;
            long current = File.Exists(_dbPath) ? new FileInfo(_dbPath).Length : 0L;
            // The safety copy and the staged copy both sit beside the live file while it is swapped
            long required = ((incoming + current) / 10L) * 12L + 1048576L;
            long freeBytes;
            if (TryGetFreeSpace(LiveDataFolder(), out freeBytes) && freeBytes < required)
            {
                return "مساحة قرص هذا الجهاز لا تكفي لاسترجاع الحزمة بأمان (المطلوب تقريباً " + FormatBytesArabic(required) + ")، ولم يتم المساس بالبيانات الحالية.";
            }
            return null;
        }

        /// <summary>
        /// Replaces all data on this PC with the package contents. Everything is verified before the live file is touched
        /// (see PreparePackage); the swap itself is the shared staged swap with a safety copy and rollback.
        /// </summary>
        public MigrationRestoreResult RestorePackage(string packagePath, string recoveryCode)
        {
            var result = new MigrationRestoreResult();

            try
            {
                using (var work = new PackageWork())
                {
                    string prepareError = PreparePackage(packagePath, recoveryCode, true, work);
                    if (prepareError != null)
                    {
                        result.Message = prepareError;
                        return result;
                    }
                    result.SourceMetrics = work.Manifest.Metrics;

                    string spaceError = CheckRestoreDiskSpace(work.DbPath);
                    if (spaceError != null)
                    {
                        result.Message = spaceError;
                        return result;
                    }

                    Logger.Info(string.Format("بدء استرجاع حزمة النقل ({0})...", work.PackageFullPath));

                    // Same hardened swap as a backup restore: WAL-inclusive safety copy, timers off, WAL/SHM checkpointed and
                    // removed together, same data folder re-initialised (applies newer migrations to an older package)
                    string extractedRxDir = work.PrescriptionsDir;
                    TransactionResult swap = DatabaseService.ReplaceDatabaseFile(_dbPath, _connectionString, work.DbPath, "pre_migration", delegate
                    {
                        // Feature F-193: Restore prescriptions directory to base data folder if present
                        string baseDataDir = LiveDataFolder();
                        if (Directory.Exists(extractedRxDir) && !string.IsNullOrEmpty(baseDataDir))
                        {
                            CopyDirectoryRecursive(extractedRxDir, Path.Combine(baseDataDir, "prescriptions"));
                        }
                    });
                    if (!swap.Success)
                    {
                        result.Message = swap.Message;
                        return result;
                    }

                    MigrationAuditMetrics restoredMetrics = GetCurrentMetrics();
                    result.RestoredMetrics = restoredMetrics;
                    result.Comparisons = BuildComparisons(work.Manifest.Metrics, restoredMetrics);
                    bool allMatch = true;
                    for (int i = 0; i < result.Comparisons.Count; i++)
                    {
                        MigrationMetricComparison c = result.Comparisons[i];
                        if (!c.IsMatched)
                        {
                            allMatch = false;
                            result.Differences.Add(string.Format("{0} غير متطابق: {1} بالحزمة مقابل {2} بعد النقل", c.LabelAr, c.SourceValue, c.RestoredValue));
                        }
                    }

                    result.IsMatch = allMatch;
                    result.Success = true;
                    result.Message = allMatch
                        ? "تم استرجاع الحزمة بنجاح، وجميع أرقام وإحصائيات المحل متطابقة بنسبة 100%."
                        : "تم استرجاع الحزمة بنجاح مع وجود بعض الفروقات في الأرقام.";

                    // Written to the restored database: the old audit trail came with the package, this entry says who replaced what
                    var details = new JObject();
                    details["package"] = Path.GetFileName(work.PackageFullPath);
                    details["packageId"] = work.Manifest.DatabaseSha256.Substring(0, 16);
                    details["sourceMachine"] = work.Manifest.SourceMachineName;
                    details["packageCreatedAtUtc"] = work.Manifest.CreatedAtUtc;
                    details["isMatch"] = allMatch;
                    LogAudit("migration_restore", "استرجاع حزمة نقل البيانات", Path.GetFileName(work.PackageFullPath), details);

                    Logger.Info("تم استرجاع حزمة النقل والتحقق من الأعداد: " + result.Message);
                }
            }
            catch (Exception ex)
            {
                result.Success = false;
                result.Message = "فشل استرجاع حزمة النقل بسبب خطأ غير متوقع. التفاصيل محفوظة في سجل النظام، ويُرجى التأكد من سلامة البيانات الحالية.";
                Logger.Error("خطأ عند استرجاع حزمة النقل: " + ex.Message, ex);
            }

            return result;
        }

        private static void CopyDirectoryRecursive(string sourceDir, string destinationDir)
        {
            if (!Directory.Exists(sourceDir)) return;
            if (!Directory.Exists(destinationDir))
            {
                Directory.CreateDirectory(destinationDir);
            }

            string[] files = Directory.GetFiles(sourceDir);
            for (int i = 0; i < files.Length; i++)
            {
                string fileName = Path.GetFileName(files[i]);
                string destFile = Path.Combine(destinationDir, fileName);
                File.Copy(files[i], destFile, true);
            }

            string[] subDirs = Directory.GetDirectories(sourceDir);
            for (int i = 0; i < subDirs.Length; i++)
            {
                string dirName = Path.GetFileName(subDirs[i]);
                string destSubDir = Path.Combine(destinationDir, dirName);
                CopyDirectoryRecursive(subDirs[i], destSubDir);
            }
        }
    }
}
