using System;
using System.IO;
using RafiqPOS.Common;
using RafiqPOS.Database;
using RafiqPOS.Repositories;

namespace RafiqPOS.Services
{
    public class TransactionResult
    {
        public bool Success { get; set; }
        public string Message { get; set; }

        public TransactionResult(bool success, string message)
        {
            this.Success = success;
            this.Message = message;
        }
    }

    public class DatabaseIntegrityStatus
    {
        public bool IsValid { get; set; }
        public bool IsCorrupt { get; set; }
        public string Message { get; set; }
        public string CorruptBackupSavedPath { get; set; }
        public string LatestValidBackupFile { get; set; }
        public string LatestValidBackupDate { get; set; }
        public long LatestValidBackupSizeBytes { get; set; }
    }

    public class DatabaseService
    {
        private static string _dbPath;
        private static string _connectionString;

        public static string ConnectionString
        {
            get { return _connectionString; }
        }

        public static string DbPath
        {
            get { return _dbPath; }
        }

        public static DatabaseIntegrityStatus IntegrityStatus { get; private set; }

        public static bool IsCorrupted
        {
            get { return IntegrityStatus != null && IntegrityStatus.IsCorrupt; }
        }

        public static CounterRepository CounterRepo { get; private set; }
        public static ProductRepository ProductRepo { get; private set; }
        public static SaleRepository SaleRepo { get; private set; }
        public static SettingsRepository SettingsRepo { get; private set; }
        public static CustomerRepository CustomerRepo { get; private set; }
        public static AuditLogRepository AuditRepo { get; private set; }
        public static CategoryRepository CategoryRepo { get; private set; }
        public static ProductPriceHistoryRepository PriceHistoryRepo { get; private set; }
        public static StockMovementRepository StockMovementRepo { get; private set; }
        public static QuickItemRepository QuickItemRepo { get; private set; }
        public static ProductUnitRepository ProductUnitRepo { get; private set; }
        public static ProductService Products { get; private set; }
        public static ProductUnitService ProductUnits { get; private set; }
        public static SaleService Sales { get; private set; }
        public static InventoryService Inventory { get; private set; }
        public static SettingsService Settings { get; private set; }
        public static CustomerService Customers { get; private set; }
        public static CategoryService Categories { get; private set; }
        public static QuickItemService QuickItems { get; private set; }
        public static ReportsService Reports { get; private set; }
        public static AuditLogService Audit { get; private set; }
        public static SupportService Support { get; private set; }
        public static BenchmarkService Benchmark { get; private set; }
        public static BackupService Backup { get; private set; }
        public static ExcelService Excel { get; private set; }
        public static PrinterService Printer { get; private set; }
        public static SecurityService Security { get; private set; }
        public static StoreTemplateService Templates { get; private set; }
        public static DemoDataService DemoData { get; private set; }
        public static ReadinessService Readiness { get; private set; }
        public static SystemHealthService SystemHealth { get; private set; }

        public static void Initialize(string customBaseFolder = null)
        {
            string baseFolder;

            if (!string.IsNullOrEmpty(customBaseFolder))
            {
                baseFolder = customBaseFolder;
            }
            else
            {
                // If running in development (Debug), use local data folder
                #if DEBUG
                baseFolder = AppDomain.CurrentDomain.BaseDirectory;
                #else
                // In Production (Program Files), use C:\ProgramData\RafiqPOS for full write permissions
                baseFolder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "RafiqPOS");
                #endif
            }

            string dataFolder = Path.Combine(baseFolder, "data");
            if (!Directory.Exists(dataFolder))
            {
                Directory.CreateDirectory(dataFolder);
            }

            _dbPath = Path.Combine(dataFolder, "rafiq_pos.db");
            _connectionString = string.Format("Data Source={0};Version=3;BusyTimeout=5000;", _dbPath);

            // Fast Startup Integrity Check (Feature #124 / Task 124-1)
            IntegrityStatus = CheckDatabaseIntegrityInternal(_connectionString, _dbPath);
            if (IntegrityStatus.IsCorrupt)
            {
                Logger.Error("تم اكتشاف تلف في ملف قاعدة البيانات عند بدء التشغيل! تم إيقاف عمليات الكتابة: " + IntegrityStatus.Message, null);
                return; // Block migrations and repo init until recovery is performed
            }

            // Execute safe migrations (Feature #1 & #4)
            MigrationRunner.ApplyMigrations(_connectionString, _dbPath);

            // Initialize Repositories and Services (Feature #5 & #7)
            CounterRepo = new CounterRepository(_connectionString);
            ProductRepo = new ProductRepository(_connectionString);
            SaleRepo = new SaleRepository(_connectionString, CounterRepo);
            SettingsRepo = new SettingsRepository(_connectionString);
            CustomerRepo = new CustomerRepository(_connectionString);
            AuditRepo = new AuditLogRepository(_connectionString);
            CategoryRepo = new CategoryRepository(_connectionString);
            PriceHistoryRepo = new ProductPriceHistoryRepository(_connectionString);
            StockMovementRepo = new StockMovementRepository(_connectionString);
            QuickItemRepo = new QuickItemRepository(_connectionString);
            ProductUnitRepo = new ProductUnitRepository(_connectionString);

            Products = new ProductService(ProductRepo, AuditRepo, PriceHistoryRepo, StockMovementRepo);
            ProductUnits = new ProductUnitService(_connectionString);
            Sales = new SaleService(SaleRepo, ProductRepo);
            Inventory = new InventoryService(_connectionString, StockMovementRepo, ProductRepo, AuditRepo);
            Settings = new SettingsService(SettingsRepo);
            Customers = new CustomerService(CustomerRepo);
            Categories = new CategoryService(CategoryRepo);
            QuickItems = new QuickItemService(QuickItemRepo);
            Reports = new ReportsService(_connectionString);
            Audit = new AuditLogService(AuditRepo);
            Support = new SupportService(_connectionString, _dbPath);
            Benchmark = new BenchmarkService(_connectionString);
            Backup = new BackupService(_connectionString, _dbPath, SettingsRepo, AuditRepo);
            Excel = new ExcelService();
            Printer = new PrinterService(Settings);
            Security = new SecurityService(SettingsRepo, AuditRepo);
            Templates = new StoreTemplateService(_connectionString, SettingsRepo, Categories, QuickItems, AuditRepo);
            DemoData = new DemoDataService(_connectionString, SettingsRepo, AuditRepo);
            Readiness = new ReadinessService(SettingsRepo, ProductRepo, Backup, Printer);
            SystemHealth = new SystemHealthService(_dbPath, SettingsRepo, ProductRepo, Backup, Printer);
        }

        public static DatabaseIntegrityStatus CheckDatabaseIntegrity()
        {
            if (string.IsNullOrEmpty(_connectionString) || string.IsNullOrEmpty(_dbPath))
            {
                return new DatabaseIntegrityStatus { IsValid = true, IsCorrupt = false, Message = "قاعدة البيانات غير مهيأة بعد." };
            }
            return CheckDatabaseIntegrityInternal(_connectionString, _dbPath);
        }

        private static DatabaseIntegrityStatus CheckDatabaseIntegrityInternal(string connStr, string dbPath)
        {
            var status = new DatabaseIntegrityStatus
            {
                IsValid = true,
                IsCorrupt = false,
                Message = "قاعدة البيانات سليمة ومتحقق منها."
            };

            if (!File.Exists(dbPath))
            {
                // New / initial install
                return status;
            }

            try
            {
                using (var conn = new System.Data.SQLite.SQLiteConnection(connStr))
                {
                    conn.Open();

                    // 1. Run ultra-fast non-blocking PRAGMA quick_check
                    using (var cmd = new System.Data.SQLite.SQLiteCommand("PRAGMA quick_check;", conn))
                    {
                        object res = cmd.ExecuteScalar();
                        if (res == null || !res.ToString().Equals("ok", StringComparison.OrdinalIgnoreCase))
                        {
                            status.IsValid = false;
                            status.IsCorrupt = true;
                            status.Message = res != null ? res.ToString() : "ملف قاعدة البيانات تالف أو غير متسق.";
                        }
                    }

                    // 2. Validate essential table can be queried if quick_check returned ok
                    if (!status.IsCorrupt)
                    {
                        using (var cmd = new System.Data.SQLite.SQLiteCommand("SELECT count(*) FROM sqlite_master;", conn))
                        {
                            cmd.ExecuteScalar();
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                status.IsValid = false;
                status.IsCorrupt = true;
                status.Message = ex.Message;
            }

            // If corrupt, isolate and quarantine file without deleting it (Task 124-2)
            if (status.IsCorrupt)
            {
                try
                {
                    string quarantineDir = Path.Combine(Path.GetDirectoryName(dbPath), "quarantine");
                    if (!Directory.Exists(quarantineDir))
                    {
                        Directory.CreateDirectory(quarantineDir);
                    }
                    string timestamp = DateTime.Now.ToString("yyyyMMdd_HHmmss");
                    string corruptCopy = Path.Combine(quarantineDir, string.Format("corrupt_db_{0}.db", timestamp));
                    File.Copy(dbPath, corruptCopy, true);
                    status.CorruptBackupSavedPath = corruptCopy;
                }
                catch (Exception qEx)
                {
                    Logger.Warn("تعذر عزل ملف البيانات التالف: " + qEx.Message);
                }

                // Locate latest valid backup file
                try
                {
                    string baseFolder = Path.GetDirectoryName(dbPath);
                    string backupDir = Path.Combine(Path.GetDirectoryName(baseFolder), "backups");
                    if (Directory.Exists(backupDir))
                    {
                        string[] backups = Directory.GetFiles(backupDir, "rafiq_backup_*.db");
                        if (backups.Length > 0)
                        {
                            Array.Sort(backups);
                            Array.Reverse(backups);
                            string latest = backups[0];
                            var fi = new FileInfo(latest);
                            status.LatestValidBackupFile = latest;
                            status.LatestValidBackupDate = fi.CreationTime.ToString("yyyy-MM-dd HH:mm");
                            status.LatestValidBackupSizeBytes = fi.Length;
                        }
                    }
                }
                catch
                {
                    // Ignore backup discovery failure
                }
            }

            return status;
        }

        public static TransactionResult RestoreFromBackup(string backupFilePath)
        {
            try
            {
                string targetBackup = backupFilePath;

                if (string.IsNullOrWhiteSpace(targetBackup))
                {
                    // Pick latest valid backup
                    if (IntegrityStatus != null && !string.IsNullOrEmpty(IntegrityStatus.LatestValidBackupFile))
                    {
                        targetBackup = IntegrityStatus.LatestValidBackupFile;
                    }
                }

                if (string.IsNullOrWhiteSpace(targetBackup) || !File.Exists(targetBackup))
                {
                    return new TransactionResult(false, "لم يتم العثور على ملف النسخة الاحتياطية المحددة.");
                }

                // Verify backup integrity before restoring
                using (var conn = new System.Data.SQLite.SQLiteConnection(string.Format("Data Source={0};Version=3;Read Only=True;", targetBackup)))
                {
                    conn.Open();
                    using (var cmd = new System.Data.SQLite.SQLiteCommand("PRAGMA quick_check;", conn))
                    {
                        object res = cmd.ExecuteScalar();
                        if (res == null || !res.ToString().Equals("ok", StringComparison.OrdinalIgnoreCase))
                        {
                            return new TransactionResult(false, "ملف النسخة الاحتياطية المحدد تالف أو غير صالح للاسترجاع.");
                        }
                    }

                    // Check schema compatibility: ensure backup is not from a future app version (Task 10-1)
                    int backupSchemaVersion = 0;
                    try
                    {
                        using (var cmdVer = new System.Data.SQLite.SQLiteCommand("SELECT COALESCE(MAX(version), 0) FROM schema_migrations;", conn))
                        {
                            object vRes = cmdVer.ExecuteScalar();
                            if (vRes != null && vRes != DBNull.Value)
                            {
                                backupSchemaVersion = Convert.ToInt32(vRes);
                            }
                        }
                    }
                    catch
                    {
                        // If schema_migrations does not exist, it's an early base schema that can be migrated up safely
                    }

                    if (backupSchemaVersion > MigrationRunner.LATEST_SUPPORTED_VERSION)
                    {
                        return new TransactionResult(false, string.Format("إصدار هيكل النسخة الاحتياطية ({0}) أحدث من الإصدار المدعوم في هذا البرنامج ({1}). يرجى تحديث برنامج رفيق أولاً.", backupSchemaVersion, MigrationRunner.LATEST_SUPPORTED_VERSION));
                    }
                }

                // Close and release all open SQLite connections and memory pools
                System.Data.SQLite.SQLiteConnection.ClearAllPools();
                GC.Collect();
                GC.WaitForPendingFinalizers();

                // Save a snapshot of the current state before replacing
                if (File.Exists(_dbPath))
                {
                    try
                    {
                        string safetyDir = Path.Combine(Path.GetDirectoryName(_dbPath), "pre_restore");
                        if (!Directory.Exists(safetyDir)) Directory.CreateDirectory(safetyDir);
                        string snapPath = Path.Combine(safetyDir, string.Format("pre_restore_{0}.db", DateTime.Now.ToString("yyyyMMdd_HHmmss")));
                        File.Copy(_dbPath, snapPath, true);
                    }
                    catch { }
                }

                // Delete WAL / SHM files if present
                try
                {
                    string walFile = _dbPath + "-wal";
                    string shmFile = _dbPath + "-shm";
                    if (File.Exists(walFile)) File.Delete(walFile);
                    if (File.Exists(shmFile)) File.Delete(shmFile);
                }
                catch { }

                // Overwrite with the healthy backup file
                File.Copy(targetBackup, _dbPath, true);

                // Clear pools again
                System.Data.SQLite.SQLiteConnection.ClearAllPools();

                // Re-initialize all systems and services
                Initialize();

                if (IsCorrupted)
                {
                    return new TransactionResult(false, "فشلت استعادة قاعدة البيانات: الملف المسترجع غير سليم.");
                }

                Logger.Info("تم استرجاع قاعدة البيانات بنجاح من النسخة الاحتياطية: " + targetBackup);
                return new TransactionResult(true, "تم استرجاع قاعدة البيانات بنجاح، والنظام يعمل بكفاءة تامة الآن.");
            }
            catch (Exception ex)
            {
                Logger.Error("خطأ أثناء استرجاع قاعدة البيانات من النسخة الاحتياطية", ex);
                return new TransactionResult(false, "خطأ أثناء الاسترجاع: " + ex.Message);
            }
        }

        public static string GetStatus()
        {
            if (IsCorrupted)
            {
                return "قاعدة البيانات تالفة [Write Operations Locked]";
            }
            return string.Format("SQLite 3 Connected [File: {0}, WAL Mode Active, Migrated]", Path.GetFileName(_dbPath));
        }

        public static TransactionResult ExecuteAtomicSaleTransaction(int itemCount)
        {
            try
            {
                // Ensure sample products exist first
                for (int i = 1; i <= itemCount; i++)
                {
                    string prodId = string.Format("prod_sample_{0}", i);
                    if (ProductRepo.GetById(prodId) == null)
                    {
                        Products.SaveProduct(new Models.Product
                        {
                            Id = prodId,
                            Barcode = string.Format("62210000000{0}", i),
                            Name = string.Format("منتج تجريبي {0}", i),
                            PricePiasters = i * 1500, // e.g. 15.00 EGP
                            CostPiasters = i * 1000,
                            StockQuantityMilli = 50000, // 50 items in stock
                            Unit = "piece"
                        });
                    }
                }

                // Construct Sale
                var sale = new Models.Sale();
                for (int i = 1; i <= itemCount; i++)
                {
                    sale.Items.Add(new Models.SaleItem
                    {
                        ProductId = string.Format("prod_sample_{0}", i),
                        ProductName = string.Format("منتج تجريبي {0}", i),
                        QuantityMilli = 1000, // 1 piece
                        UnitPricePiasters = i * 1500,
                        DiscountPiasters = 0
                    });
                }

                var processed = Sales.ProcessSale(sale);
                double totalPounds = processed.TotalPiasters / 100.0;
                string msg = string.Format("تم حفظ فاتورة بيع رقم #{0} تحتوي على {1} أصناف بنجاح بإجمالي {2:N2} جنيه في معاملة ذرية واحدة (ACID).", processed.InvoiceNumber, itemCount, totalPounds);
                return new TransactionResult(true, msg);
            }
            catch (Exception ex)
            {
                return new TransactionResult(false, "فشلت المعاملة وتم التراجع التلقائي (Rollback): " + ex.Message);
            }
        }
    }
}
