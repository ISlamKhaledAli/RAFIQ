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

    public class FactoryResetResult
    {
        public bool Success { get; set; }
        public string Message { get; set; }
        public int DeletedSalesCount { get; set; }
        public int DeletedProductsCount { get; set; }
        public int DeletedCustomersCount { get; set; }
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
        public static UserRepository UserRepo { get; private set; }
        public static ProductService Products { get; private set; }
        public static ProductUnitService ProductUnits { get; private set; }
        public static SaleService Sales { get; private set; }
        public static InventoryService Inventory { get; private set; }
        public static SettingsService Settings { get; private set; }
        public static CustomerService Customers { get; private set; }
        public static CategoryService Categories { get; private set; }
        public static QuickItemService QuickItems { get; internal set; }
        public static ReportsService Reports { get; private set; }
        public static AuditLogService Audit { get; private set; }
        public static SupportService Support { get; private set; }
        public static BenchmarkService Benchmark { get; private set; }
        public static BackupService Backup { get; private set; }
        public static ExcelService Excel { get; private set; }
        public static PrinterService Printer { get; private set; }
        public static SecurityService Security { get; internal set; }
        public static StoreTemplateService Templates { get; private set; }
        public static DemoDataService DemoData { get; private set; }
        public static ReadinessService Readiness { get; private set; }
        public static EncryptionService Encryption { get; private set; }
        public static SystemHealthService SystemHealth { get; private set; }
        public static LicenseService License { get; private set; }
        public static HeldSaleRepository HeldSaleRepo { get; private set; }
        public static ReturnRepository ReturnRepo { get; private set; }
        public static SupplierRepository SupplierRepo { get; private set; }
        public static PurchaseRepository PurchaseRepo { get; private set; }
        public static HeldSaleService HeldSales { get; internal set; }
        public static ReturnService Returns { get; private set; }
        public static SupplierService Suppliers { get; private set; }
        public static PurchaseService Purchases { get; private set; }
        public static DailyClosingRepository DailyClosingRepo { get; private set; }
        public static DailyClosingService DailyClosing { get; private set; }
        public static ExpenseRepository ExpenseRepo { get; private set; }
        public static ExpenseService Expenses { get; private set; }
        public static MigrationService Migration { get; private set; }
        public static ProductBatchRepository ProductBatchRepo { get; private set; }
        public static ProductBatchService ProductBatches { get; private set; }
        public static ProductVariantRepository ProductVariantRepo { get; private set; }
        public static ProductVariantService ProductVariants { get; private set; }
        public static BarcodeLabelService BarcodeLabels { get; private set; }
        public static AppUpdateService Updates { get; private set; }
        public static DigitalAccountRepository DigitalAccounts { get; private set; }
        public static ShiftRepository ShiftRepo { get; private set; }
        public static ShiftService Shifts { get; private set; }
        public static CashDrawerService CashDrawer { get; private set; }
        public static StorageLocationRepository StorageLocationRepo { get; private set; }
        public static StorageLocationService StorageLocations { get; private set; }
        public static ShortageRepository ShortageRepo { get; private set; }
        public static ShortageService Shortages { get; private set; }
        public static PharmaRepository PharmaRepo { get; private set; }
        public static DrugAlternativesService DrugAlternatives { get; private set; }
        public static ControlledDrugRepository ControlledDrugRepo { get; set; }
        public static PrescriptionRepository PrescriptionRepo { get; set; }
        public static ControlledDrugService ControlledDrugs { get; set; }
        public static PrescriptionService Prescriptions { get; set; }
        public static InsuranceRepository InsuranceRepo { get; set; }
        public static InsuranceService Insurance { get; set; }
        public static PatientRepository PatientRepo { get; set; }
        public static PatientService Patients { get; set; }
        public static DrugReferenceRepository DrugReferenceRepo { get; set; }
        public static DrugReferenceService DrugReference { get; set; }
        public static PharmaStocktakingService PharmaStocktaking { get; private set; }

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

            // Feature #167: Restrict data folder permissions & initialize encryption service
            EncryptionService.ProtectDatabaseFolderAcl(dataFolder);
            Encryption = new EncryptionService();

            _dbPath = Path.Combine(dataFolder, "rafiq_pos.db");
            _connectionString = string.Format("Data Source={0};Version=3;BusyTimeout=5000;Foreign Keys=True;Journal Mode=Wal;", _dbPath);

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
            AuditRepo = new AuditLogRepository(_connectionString);
            ProductRepo = new ProductRepository(_connectionString, AuditRepo, CounterRepo);
            ProductBatchRepo = new ProductBatchRepository(_connectionString, AuditRepo);
            ProductVariantRepo = new ProductVariantRepository(_connectionString);
            SaleRepo = new SaleRepository(_connectionString, CounterRepo, AuditRepo, ProductBatchRepo);
            SettingsRepo = new SettingsRepository(_connectionString);
            CustomerRepo = new CustomerRepository(_connectionString, AuditRepo);
            CategoryRepo = new CategoryRepository(_connectionString);
            PriceHistoryRepo = new ProductPriceHistoryRepository(_connectionString);
            StockMovementRepo = new StockMovementRepository(_connectionString);
            QuickItemRepo = new QuickItemRepository(_connectionString);
            ProductUnitRepo = new ProductUnitRepository(_connectionString);
            UserRepo = new UserRepository(_connectionString);

            Products = new ProductService(ProductRepo, AuditRepo, PriceHistoryRepo, StockMovementRepo);
            ProductUnits = new ProductUnitService(_connectionString);
            ProductBatches = new ProductBatchService(ProductBatchRepo, SettingsRepo);
            ProductVariants = new ProductVariantService(_connectionString);
            Sales = new SaleService(SaleRepo, ProductRepo, QuickItemRepo);
            Inventory = new InventoryService(_connectionString, StockMovementRepo, ProductRepo, AuditRepo);
            Settings = new SettingsService(SettingsRepo, AuditRepo);
            Customers = new CustomerService(CustomerRepo);
            Categories = new CategoryService(CategoryRepo);
            QuickItems = new QuickItemService(QuickItemRepo);
            Reports = new ReportsService(_connectionString);
            Audit = new AuditLogService(AuditRepo);
            Support = new SupportService(_connectionString, _dbPath);
            Benchmark = new BenchmarkService(_connectionString);
            Backup = new BackupService(_connectionString, _dbPath, SettingsRepo, AuditRepo, Encryption);
            Excel = new ExcelService();
            Printer = new PrinterService(Settings);
            Security = new SecurityService(SettingsRepo, AuditRepo, UserRepo);
            Templates = new StoreTemplateService(_connectionString, SettingsRepo, Categories, QuickItems, AuditRepo);
            DemoData = new DemoDataService(_connectionString, SettingsRepo, AuditRepo);
            Readiness = new ReadinessService(SettingsRepo, ProductRepo, Backup, Printer);
            SystemHealth = new SystemHealthService(_dbPath, SettingsRepo, ProductRepo, Backup, Printer);
            License = new LicenseService(SettingsRepo, Audit);

            HeldSaleRepo = new HeldSaleRepository(_connectionString);
            ReturnRepo = new ReturnRepository(_connectionString, CounterRepo, AuditRepo);
            SupplierRepo = new SupplierRepository(_connectionString, AuditRepo);
            PurchaseRepo = new PurchaseRepository(_connectionString, CounterRepo, SupplierRepo, PriceHistoryRepo, AuditRepo, ProductBatchRepo);

            HeldSales = new HeldSaleService(HeldSaleRepo);
            Suppliers = new SupplierService(SupplierRepo);
            Purchases = new PurchaseService(PurchaseRepo);

            DailyClosingRepo = new DailyClosingRepository(_connectionString);
            DailyClosing = new DailyClosingService(_connectionString, DailyClosingRepo, CounterRepo, AuditRepo, SettingsRepo);
            Returns = new ReturnService(ReturnRepo, SaleRepo, DailyClosing);
            ExpenseRepo = new ExpenseRepository(_connectionString);
            Expenses = new ExpenseService(ExpenseRepo, DailyClosing);
            Migration = new MigrationService(_connectionString, _dbPath, SettingsRepo, AuditRepo);
            Updates = new AppUpdateService(SettingsRepo, Backup, Audit);
            BarcodeLabels = new BarcodeLabelService(Settings, Printer);
            DigitalAccounts = new DigitalAccountRepository(_connectionString, AuditRepo);

            ShiftRepo = new ShiftRepository(_connectionString);
            Shifts = new ShiftService(_connectionString, ShiftRepo, CounterRepo, AuditRepo, DailyClosing);
            CashDrawer = new CashDrawerService(_connectionString, ShiftRepo, Shifts, AuditRepo);

            StorageLocationRepo = new StorageLocationRepository(_connectionString);
            StorageLocations = new StorageLocationService(StorageLocationRepo);

            ShortageRepo = new ShortageRepository(_connectionString);
            Shortages = new ShortageService(ShortageRepo, _connectionString);
            PharmaRepo = new PharmaRepository(_connectionString);
            DrugAlternatives = new DrugAlternativesService(PharmaRepo, ProductRepo, _connectionString);
            ControlledDrugRepo = new ControlledDrugRepository(_connectionString);
            PrescriptionRepo = new PrescriptionRepository(_connectionString, Path.GetDirectoryName(_dbPath));
            ControlledDrugs = new ControlledDrugService(ControlledDrugRepo, SettingsRepo, Encryption, Security);
            Prescriptions = new PrescriptionService(PrescriptionRepo, Path.GetDirectoryName(_dbPath));
            InsuranceRepo = new InsuranceRepository(_connectionString);
            Insurance = new InsuranceService(InsuranceRepo, AuditRepo);
            PatientRepo = new PatientRepository(_connectionString, AuditRepo);
            Patients = new PatientService(PatientRepo, Security);
            DrugReferenceRepo = new DrugReferenceRepository(_connectionString, AuditRepo);
            DrugReference = new DrugReferenceService(DrugReferenceRepo, Excel, PurchaseRepo, ProductBatchRepo);
            PharmaStocktaking = new PharmaStocktakingService(_connectionString, ProductBatchRepo, ProductRepo, AuditRepo);

            // Cleanup old held sales (> 7 days) on startup (Task 25-4)
            try
            {
                HeldSales.CleanupOldHeldSales(7);
            }
            catch (Exception ex)
            {
                Logger.Warn("تعذر تنظيف الفواتير المعلقة القديمة: " + ex.Message);
            }

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
                    PruneDirectoryFiles(quarantineDir, "corrupt_db_*.db", 2);
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
            return RestoreFromBackup(backupFilePath, null);
        }

        public static TransactionResult RestoreFromBackup(string backupFilePath, string masterKey)
        {
            string tempStaging = null;
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

                // Feature #168: If backup is encrypted, decrypt to temp staging for verification and restore
                string fileToRestore = targetBackup;
                if (EncryptionService.IsFileEncrypted(targetBackup))
                {
                    tempStaging = Path.Combine(Path.GetTempPath(), "rafiq_staging_" + Guid.NewGuid().ToString("N") + ".db");
                    if (Encryption == null)
                    {
                        Encryption = new EncryptionService();
                    }
                    try
                    {
                        Encryption.DecryptFile(targetBackup, tempStaging, masterKey);
                    }
                    catch (Exception ex)
                    {
                        Logger.Error("فشل فك تشفير النسخة الاحتياطية أثناء الاسترجاع", ex);
                        return new TransactionResult(false, "تعذر فك تشفير النسخة الاحتياطية: " + ex.Message);
                    }
                    fileToRestore = tempStaging;
                }

                // Verify backup integrity before restoring
                using (var conn = new System.Data.SQLite.SQLiteConnection(string.Format("Data Source={0};Version=3;Read Only=True;", fileToRestore)))
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

                // Save a consistent snapshot of the current state before replacing. The SQLite online backup API
                // includes pages still in the WAL file; a plain File.Copy would miss recent sales (Audit F-29).
                if (File.Exists(_dbPath))
                {
                    try
                    {
                        string safetyDir = Path.Combine(Path.GetDirectoryName(_dbPath), "pre_restore");
                        if (!Directory.Exists(safetyDir)) Directory.CreateDirectory(safetyDir);
                        string snapPath = Path.Combine(safetyDir, string.Format("pre_restore_{0}.db", DateTime.Now.ToString("yyyyMMdd_HHmmss")));
                        using (var srcConn = new System.Data.SQLite.SQLiteConnection(_connectionString))
                        using (var dstConn = new System.Data.SQLite.SQLiteConnection(string.Format("Data Source={0};Version=3;", snapPath)))
                        {
                            srcConn.Open();
                            dstConn.Open();
                            srcConn.BackupDatabase(dstConn, "main", "main", -1, null, 0);
                        }
                        PruneDirectoryFiles(safetyDir, "pre_restore_*.db", 2);
                    }
                    catch (Exception snapEx)
                    {
                        Logger.Error("تعذر أخذ نسخة أمان قبل الاسترجاع", snapEx);
                        if (!IsCorrupted)
                        {
                            return new TransactionResult(false, "تم إيقاف الاسترجاع: تعذر حفظ نسخة أمان من البيانات الحالية قبل استبدالها.");
                        }
                        // Corrupt database: the backup API may be unable to read it, so keep raw copies of the db and WAL files instead
                        try
                        {
                            string rawDir = Path.Combine(Path.GetDirectoryName(_dbPath), "pre_restore");
                            if (!Directory.Exists(rawDir)) Directory.CreateDirectory(rawDir);
                            string stamp = DateTime.Now.ToString("yyyyMMdd_HHmmss");
                            File.Copy(_dbPath, Path.Combine(rawDir, "pre_restore_corrupt_" + stamp + ".db"), true);
                            if (File.Exists(_dbPath + "-wal")) File.Copy(_dbPath + "-wal", Path.Combine(rawDir, "pre_restore_corrupt_" + stamp + ".db-wal"), true);
                        }
                        catch (Exception rawEx)
                        {
                            Logger.Error("تعذر نسخ ملفات قاعدة البيانات التالفة قبل الاسترجاع", rawEx);
                        }
                    }
                }

                // Close and release all open SQLite connections and memory pools
                System.Data.SQLite.SQLiteConnection.ClearAllPools();
                GC.Collect();
                GC.WaitForPendingFinalizers();

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
                File.Copy(fileToRestore, _dbPath, true);

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
            finally
            {
                if (!string.IsNullOrEmpty(tempStaging) && File.Exists(tempStaging))
                {
                    try { File.Delete(tempStaging); } catch { }
                }
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

        public static FactoryResetResult FactoryReset(bool wipeBackups = false)
        {
            var result = new FactoryResetResult();
            if (string.IsNullOrEmpty(_connectionString))
            {
                result.Success = false;
                result.Message = "قاعدة البيانات غير مهيأة.";
                return result;
            }

            using (var conn = new System.Data.SQLite.SQLiteConnection(_connectionString))
            {
                conn.Open();

                // Mandatory safety backup before wiping data unless user explicitly requested wiping all backups
                if (!wipeBackups && Backup != null)
                {
                    BackupResult preResetBackup = null;
                    try
                    {
                        preResetBackup = Backup.CreateBackup(null);
                    }
                    catch (Exception bEx)
                    {
                        Logger.Error("فشل أخذ نسخة احتياطية قبل تصفير البيانات", bEx);
                    }
                    if (preResetBackup == null || !preResetBackup.Success)
                    {
                        result.Success = false;
                        result.Message = "تم إيقاف التصفير: تعذر أخذ نسخة احتياطية آمنة من البيانات الحالية أولاً.";
                        return result;
                    }
                }

                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        result.DeletedSalesCount = (int)CountRowsIfTableExists(conn, trans, "sales");
                        result.DeletedCustomersCount = (int)CountRowsIfTableExists(conn, trans, "customers");
                        result.DeletedProductsCount = (int)CountRowsIfTableExists(conn, trans, "products");

                        // Temporarily drop delete prevention triggers to allow complete factory reset
                        using (var dropTrgCmd = new System.Data.SQLite.SQLiteCommand(@"
                            DROP TRIGGER IF EXISTS trg_prevent_daily_closing_delete;
                            DROP TRIGGER IF EXISTS trg_prevent_shift_delete;
                            DROP TRIGGER IF EXISTS trg_prevent_drawer_tx_delete;
                        ", conn, trans))
                        {
                            dropTrgCmd.ExecuteNonQuery();
                        }

                        // 1-3. Delete business data child-first so foreign keys (PRAGMA foreign_keys = ON) never block the reset
                        string[] tablesInDeleteOrder = new string[]
                        {
                            // 1. Sales child allocations, insurance claims, and prescriptions linked to sales
                            "sale_item_batch_allocations", "debt_allocations", "sale_prescriptions",
                            "controlled_dispenses", "insurance_claim_lines", "insurance_claim_batches",
                            "insurance_exclusions", "insurance_members", "insurance_contracts", "insurance_companies",

                            // 2. Patient profiles, chronic medications, prescriptions
                            "chronic_medications", "customer_patient_info", "prescriptions",

                            // 3. Purchases & returns
                            "purchase_return_items", "purchase_returns",

                            // 4. Drawer & shifts (triggers dropped beforehand)
                            "cash_drawer_transactions", "shifts",

                            // 5. Digital & epay accounts
                            "digital_account_fundings", "digital_transactions", "digital_accounts",
                            "epay_terminal_fundings", "epay_transactions", "epay_terminals",

                            // 6. Expenses & categories
                            "expense_categories", "expenses",

                            // 7. Sales, items, payments, returns, customer ledger
                            "payments", "return_items", "returns", "held_sales", "sale_items", "sales",
                            "customer_ledger", "customers",

                            // 8. Purchases, items, supplier ledger
                            "purchase_items", "purchases", "supplier_transactions", "suppliers",

                            // 9. Shortage & expired write-offs
                            "shortage_entries", "expired_write_offs",

                            // 10. Product batches, variants, pharma info, ingredients, movements
                            "product_pharma_info", "product_ingredients", "product_batches",
                            "product_variants", "stock_movements", "product_price_history",
                            "product_barcodes", "product_units", "quick_items", "products",
                            "categories", "storage_locations", "drug_reference",

                            // 11. Daily closings
                            "daily_closings"
                        };
                        for (int tIdx = 0; tIdx < tablesInDeleteOrder.Length; tIdx++)
                        {
                            DeleteAllIfTableExists(conn, trans, tablesInDeleteOrder[tIdx]);
                        }

                        // Recreate immutability triggers for daily closings, shifts, and cash drawer
                        using (var recTrgCmd = new System.Data.SQLite.SQLiteCommand(@"
                            CREATE TRIGGER IF NOT EXISTS trg_prevent_daily_closing_delete
                            BEFORE DELETE ON daily_closings
                            BEGIN
                                SELECT RAISE(ABORT, 'لا يمكن حذف سجل قفل اليومية بعد اعتماده');
                            END;

                            CREATE TRIGGER IF NOT EXISTS trg_prevent_shift_delete
                            BEFORE DELETE ON shifts
                            BEGIN
                                SELECT RAISE(ABORT, 'لا يمكن حذف سجلات الورديات نهائياً');
                            END;

                            CREATE TRIGGER IF NOT EXISTS trg_prevent_drawer_tx_delete
                            BEFORE DELETE ON cash_drawer_transactions
                            BEGIN
                                SELECT RAISE(ABORT, 'لا يمكن حذف حركة نقدية من الدرج');
                            END;
                        ", conn, trans))
                        {
                            recTrgCmd.ExecuteNonQuery();
                        }

                        // 4. Reset sequence counters and first run flag
                        using (var cmd = new System.Data.SQLite.SQLiteCommand("DELETE FROM counters; DELETE FROM app_settings WHERE key IN ('first_run_completed', 'has_demo_data', 'wizard_completed', 'is_first_run_completed');", conn, trans))
                        {
                            cmd.ExecuteNonQuery();
                        }

                        // 5. Reset audit logs with genesis reset entry (temporarily authorized to bypass tamper trigger)
                        using (var authCmd = new System.Data.SQLite.SQLiteCommand("INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('allow_audit_reset', 'CONFIRM_PURGE_AUTHORIZED', datetime('now'));", conn, trans))
                        {
                            authCmd.ExecuteNonQuery();
                        }

                        using (var cmd = new System.Data.SQLite.SQLiteCommand("DELETE FROM audit_logs;", conn, trans))
                        {
                            cmd.ExecuteNonQuery();
                        }

                        using (var cleanCmd = new System.Data.SQLite.SQLiteCommand("DELETE FROM app_settings WHERE key = 'allow_audit_reset';", conn, trans))
                        {
                            cleanCmd.ExecuteNonQuery();
                        }

                        string genesisHash = "GENESIS_RAFIQ_AUDIT_V1";
                        string resetLogId = "aud_" + Guid.NewGuid().ToString("N");
                        string nowIso = DateTime.UtcNow.ToString("o");
                        string detailsJson = "{\"action\":\"factory_reset\",\"message\":\"تم تصفير ومسح كافة بيانات النظام والبدء من جديد\"}";
                        string recordHash = MigrationRunner.ComputeAuditHash(
                            genesisHash, resetLogId, "usr_admin_default", "factory_reset", "system", "all", detailsJson, nowIso
                        );

                        using (var cmd = new System.Data.SQLite.SQLiteCommand(@"
                            INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details_json, created_at, prev_hash, record_hash)
                            VALUES (@id, 'usr_admin_default', 'factory_reset', 'system', 'all', @details, @now, @prev, @rec);
                        ", conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@id", resetLogId);
                            cmd.Parameters.AddWithValue("@details", detailsJson);
                            cmd.Parameters.AddWithValue("@now", nowIso);
                            cmd.Parameters.AddWithValue("@prev", genesisHash);
                            cmd.Parameters.AddWithValue("@rec", recordHash);
                            cmd.ExecuteNonQuery();
                        }

                        // 6. Zero pre-seeded categories policy: keep categories clean
                        using (var cmd = new System.Data.SQLite.SQLiteCommand(@"
                            DELETE FROM customer_ledger WHERE customer_id = 'cust_general_cash';
                            DELETE FROM customers WHERE id = 'cust_general_cash';
                        ", conn, trans))
                        {
                            cmd.ExecuteNonQuery();
                        }

                        trans.Commit();
                        result.Success = true;
                        result.Message = "تم مسح وتصفير كافة البيانات بنجاح، والنظام جاهز الآن كبداية نظيفة كلياً.";
                    }
                    catch (Exception ex)
                    {
                        trans.Rollback();
                        result.Success = false;
                        result.Message = "فشل مسح البيانات: " + ex.Message;
                        return result;
                    }
                }

                // 7. Vacuum database to reclaim disk space
                try
                {
                    using (var vacCmd = new System.Data.SQLite.SQLiteCommand("VACUUM;", conn))
                    {
                        vacCmd.ExecuteNonQuery();
                    }
                }
                catch { }
            }

            // 8. Wipe all backup files and history if requested
            if (wipeBackups)
            {
                try
                {
                    if (Backup != null)
                    {
                        string defaultBDir = Backup.GetDefaultBackupFolder();
                        if (Directory.Exists(defaultBDir))
                        {
                            string[] files = Directory.GetFiles(defaultBDir, "*.*");
                            for (int i = 0; i < files.Length; i++)
                            {
                                try { File.Delete(files[i]); } catch { }
                            }
                        }
                    }

                    string customBDir = SettingsRepo != null ? SettingsRepo.Get("backup_target_folder", "") : "";
                    if (!string.IsNullOrWhiteSpace(customBDir) && Directory.Exists(customBDir))
                    {
                        string[] files = Directory.GetFiles(customBDir, "rafiq_backup_*.*");
                        for (int i = 0; i < files.Length; i++)
                        {
                            try { File.Delete(files[i]); } catch { }
                        }
                    }

                    if (SettingsRepo != null)
                    {
                        SettingsRepo.Set("backup_last_success_at", "");
                    }
                }
                catch (Exception bEx)
                {
                    Logger.Warn("تعذر إفراغ بعض ملفات النسخ الاحتياطي: " + bEx.Message);
                }
            }

            return result;
        }

        private static bool TableExists(System.Data.SQLite.SQLiteConnection conn, System.Data.SQLite.SQLiteTransaction trans, string tableName)
        {
            using (var cmd = new System.Data.SQLite.SQLiteCommand("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = @name;", conn, trans))
            {
                cmd.Parameters.AddWithValue("@name", tableName);
                return Convert.ToInt64(cmd.ExecuteScalar()) > 0;
            }
        }

        private static long CountRowsIfTableExists(System.Data.SQLite.SQLiteConnection conn, System.Data.SQLite.SQLiteTransaction trans, string tableName)
        {
            if (!TableExists(conn, trans, tableName)) return 0;
            // tableName comes only from the hard-coded list above, never from user input
            using (var cmd = new System.Data.SQLite.SQLiteCommand("SELECT COUNT(*) FROM " + tableName + ";", conn, trans))
            {
                return Convert.ToInt64(cmd.ExecuteScalar());
            }
        }

        private static void DeleteAllIfTableExists(System.Data.SQLite.SQLiteConnection conn, System.Data.SQLite.SQLiteTransaction trans, string tableName)
        {
            if (!TableExists(conn, trans, tableName)) return;
            using (var cmd = new System.Data.SQLite.SQLiteCommand("DELETE FROM " + tableName + ";", conn, trans))
            {
                cmd.ExecuteNonQuery();
            }
        }

        private static void PruneDirectoryFiles(string dir, string pattern, int keepCount)
        {
            try
            {
                if (!Directory.Exists(dir)) return;
                string[] files = Directory.GetFiles(dir, pattern);
                if (files.Length <= keepCount) return;
                Array.Sort(files);
                int toDelete = files.Length - keepCount;
                for (int i = 0; i < toDelete; i++)
                {
                    try { File.Delete(files[i]); } catch { }
                }
            }
            catch { }
        }
    }
}
