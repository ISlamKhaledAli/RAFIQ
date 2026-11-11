using System;
using System.Collections.Generic;
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

    public class DatabaseHealthInfo
    {
        public bool IsOk { get; set; }
        public string JournalMode { get; set; }
        public int SchemaVersion { get; set; }
        public long SizeBytes { get; set; }
        public string Error { get; set; }

        public DatabaseHealthInfo()
        {
            JournalMode = "";
            Error = "";
        }

        // Short Arabic line for the legacy dbStatus field (root console fallback); the Help Center renders the structured fields
        public string ToSummaryText()
        {
            if (IsOk) return "متصلة وسليمة";
            return string.IsNullOrEmpty(Error) ? "تعذر فتح قاعدة البيانات" : Error;
        }
    }

    public class FactoryResetResult
    {
        public bool Success { get; set; }
        public string Message { get; set; }
        public int DeletedSalesCount { get; set; }
        public int DeletedProductsCount { get; set; }
        public int DeletedCustomersCount { get; set; }
        public string SafetyBackupFile { get; set; }
    }

    public enum DatabaseFailureKind
    {
        Unknown = 0,
        Corrupt = 1,
        DiskFull = 2,
        ReadOnly = 3,
        IoError = 4,
        CannotOpen = 5,
        Busy = 6,
        // The file is not a plain SQLite database and does not open with this program's key (wrong key or a damaged header): never destructive
        EncryptionKeyMismatch = 7,
        // A conversion swap stopped half way and could not be undone, or the live file is missing next to conversion leftovers
        EncryptionSwapInterrupted = 8,
        // The live file is missing or empty and only the sealed pre-encryption copy exists
        EncryptionSealedOnly = 9
    }

    // Raised at startup for storage problems that are NOT file corruption: restore/quarantine must never be offered for them
    public class DatabaseStorageException : Exception
    {
        public DatabaseFailureKind Kind { get; private set; }

        public DatabaseStorageException(DatabaseFailureKind kind, string message) : base(message)
        {
            this.Kind = kind;
        }
    }

    // Separates genuine SQLite corruption from disk-full / read-only / I/O / cannot-open / busy conditions
    public static class DatabaseFailureClassifier
    {
        // SQLite primary result codes (the low byte of an extended result code)
        public const int SQLITE_PERM = 3;
        public const int SQLITE_BUSY = 5;
        public const int SQLITE_LOCKED = 6;
        public const int SQLITE_READONLY = 8;
        public const int SQLITE_IOERR = 10;
        public const int SQLITE_CORRUPT = 11;
        public const int SQLITE_FULL = 13;
        public const int SQLITE_CANTOPEN = 14;
        public const int SQLITE_NOTADB = 26;

        public static DatabaseFailureKind ClassifyResultCode(int resultCode)
        {
            switch (resultCode & 0xFF)
            {
                case SQLITE_CORRUPT:
                case SQLITE_NOTADB:
                    return DatabaseFailureKind.Corrupt;
                case SQLITE_FULL:
                    return DatabaseFailureKind.DiskFull;
                case SQLITE_READONLY:
                    return DatabaseFailureKind.ReadOnly;
                case SQLITE_IOERR:
                    return DatabaseFailureKind.IoError;
                case SQLITE_CANTOPEN:
                case SQLITE_PERM:
                    return DatabaseFailureKind.CannotOpen;
                case SQLITE_BUSY:
                case SQLITE_LOCKED:
                    return DatabaseFailureKind.Busy;
                default:
                    return DatabaseFailureKind.Unknown;
            }
        }

        public static DatabaseFailureKind Classify(Exception ex)
        {
            if (ex == null) return DatabaseFailureKind.Unknown;

            RafiqPOS.Data.SQLiteException sqlEx = ex as RafiqPOS.Data.SQLiteException;
            if (sqlEx != null)
            {
                DatabaseFailureKind kind = ClassifyResultCode((int)sqlEx.ResultCode);
                if (kind != DatabaseFailureKind.Unknown) return kind;

                // Generic "SQL logic error" results still carry the engine text for a damaged file
                string text = sqlEx.Message ?? "";
                if (text.IndexOf("malformed", StringComparison.OrdinalIgnoreCase) >= 0 ||
                    text.IndexOf("not a database", StringComparison.OrdinalIgnoreCase) >= 0)
                {
                    return DatabaseFailureKind.Corrupt;
                }
                if (text.IndexOf("busy", StringComparison.OrdinalIgnoreCase) >= 0 ||
                    text.IndexOf("locked", StringComparison.OrdinalIgnoreCase) >= 0)
                {
                    return DatabaseFailureKind.Busy;
                }
                return DatabaseFailureKind.Unknown;
            }

            if (ex is UnauthorizedAccessException)
            {
                return DatabaseFailureKind.ReadOnly;
            }

            if (ex is IOException)
            {
                // Win32 ERROR_HANDLE_DISK_FULL (39) / ERROR_DISK_FULL (112); ERROR_SHARING_VIOLATION (32) / ERROR_LOCK_VIOLATION (33)
                int win32 = ex.HResult & 0xFFFF;
                if (win32 == 39 || win32 == 112) return DatabaseFailureKind.DiskFull;
                if (win32 == 32 || win32 == 33) return DatabaseFailureKind.Busy;
                return DatabaseFailureKind.CannotOpen;
            }

            return DatabaseFailureKind.Unknown;
        }

        public static string DescribeArabic(DatabaseFailureKind kind)
        {
            switch (kind)
            {
                case DatabaseFailureKind.DiskFull:
                    return "مساحة القرص ممتلئة ولا يمكن حفظ البيانات. احذف ملفات غير ضرورية أو انقل النسخ الاحتياطية القديمة إلى قرص آخر لتحرير مساحة ثم أعد المحاولة.";
                case DatabaseFailureKind.ReadOnly:
                    return "ملف قاعدة البيانات أو مجلد البيانات للقراءة فقط ولا يمكن الكتابة فيه. تحقق من صلاحيات المجلد ومن أن القرص أو الفلاشة غير مقفلة للقراءة فقط.";
                case DatabaseFailureKind.IoError:
                    return "حدث خطأ أثناء قراءة أو كتابة القرص. تحقق من سلامة القرص وتوصيله ثم أعد المحاولة، ولا تحذف ملف قاعدة البيانات.";
                case DatabaseFailureKind.CannotOpen:
                    return "تعذر فتح ملف قاعدة البيانات. تحقق من وجود مجلد البيانات وصلاحيات الوصول إليه ومن أن برنامج الحماية لا يمنعه.";
                case DatabaseFailureKind.Busy:
                    return "قاعدة البيانات مشغولة بعملية أخرى حالياً. يرجى المحاولة بعد لحظات.";
                case DatabaseFailureKind.Corrupt:
                    return "ملف قاعدة البيانات تالف أو غير متسق.";
                case DatabaseFailureKind.EncryptionSwapInterrupted:
                    return EncryptionSwapFatalException.ArabicMessage;
                case DatabaseFailureKind.EncryptionSealedOnly:
                    return DatabaseEncryptionService.SealedOnlyMessage;
                case DatabaseFailureKind.EncryptionKeyMismatch:
                    return "تعذر فتح ملف قاعدة البيانات المشفرة: إما أن الملف تالف (مثلاً بسبب انقطاع الكهرباء أثناء الحفظ) أو أنه كُتب بواسطة نسخة مختلفة من البرنامج. لم يتم تغيير أو حذف أي ملف. يمكنك استرجاع آخر نسخة احتياطية سليمة من نافذة الاسترجاع بكود استرجاع المالك، أو التواصل مع الدعم الفني. لن يحدث أي استرجاع إلا بعد اختيارك.";
                default:
                    return "تعذر تنفيذ العملية على قاعدة البيانات.";
            }
        }

        // Short IPC error code for each kind (Unknown/Corrupt keep the generic handler)
        public static string IpcCode(DatabaseFailureKind kind)
        {
            switch (kind)
            {
                case DatabaseFailureKind.DiskFull: return "DISK_FULL";
                case DatabaseFailureKind.ReadOnly: return "DATABASE_READONLY";
                case DatabaseFailureKind.IoError: return "DISK_IO_ERROR";
                case DatabaseFailureKind.CannotOpen: return "DATABASE_CANNOT_OPEN";
                case DatabaseFailureKind.Busy: return "DATABASE_BUSY";
                case DatabaseFailureKind.EncryptionKeyMismatch: return "ENCRYPTION_KEY_MISMATCH";
                case DatabaseFailureKind.EncryptionSwapInterrupted: return "ENCRYPTION_SWAP_INTERRUPTED";
                case DatabaseFailureKind.EncryptionSealedOnly: return "ENCRYPTION_SEALED_ONLY";
                default: return null;
            }
        }
    }

    public class DatabaseIntegrityStatus
    {
        public bool IsValid { get; set; }
        public bool IsCorrupt { get; set; }
        // Set when startup failed for a storage reason that is not corruption (disk full, read-only, I/O, cannot open)
        public DatabaseFailureKind StorageFailure { get; set; }
        // True when the file is not plain SQLite and its header page does not decrypt with this program's key: either damaged
        // (a torn write of page 1) or written by a different build. Handled through the same user-initiated recovery flow as
        // corruption (IsCorrupt is also true) but with zero automatic action: no quarantine, no restore, no file change.
        public bool IsKeyMismatch { get; set; }
        // True when a PLAIN database appeared although this store was known to be encrypted (failure code UNEXPECTED_PLAIN_DATABASE)
        public bool IsUnexpectedPlain { get; set; }
        // Machine-readable reason for the UI and support ("ENCRYPTION_KEY_MISMATCH" or null)
        public string FailureCode { get; set; }
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
        private static string _baseFolder;
        private static bool _backgroundChecksRequested;
        // True once startup finished the integrity check; until then a leftover session marker still describes the previous (maybe unclean) run
        private static bool _integrityCheckCompleted;

        // Set by the host before Initialize: receives short Arabic status lines while a long startup step (the one-time encryption conversion) runs
        public static Action<string> StartupProgress { get; set; }

        private static bool _retentionAppliedThisProcess;

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
        public static SaleService Sales { get; internal set; }
        public static InventoryService Inventory { get; private set; }
        public static SettingsService Settings { get; internal set; }
        public static CustomerService Customers { get; private set; }
        public static CategoryService Categories { get; private set; }
        public static QuickItemService QuickItems { get; internal set; }
        public static ReportsService Reports { get; private set; }
        public static AuditLogService Audit { get; private set; }
        public static SupportService Support { get; private set; }
        public static BenchmarkService Benchmark { get; private set; }
        public static BackupService Backup { get; internal set; }
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
        public static DrugInteractionRepository DrugInteractionRepo { get; private set; }
        public static DrugInteractionService DrugInteractions { get; private set; }
        public static TableRepository TableRepo { get; set; }
        public static TableManagementService Tables { get; set; }
        public static ModifierRepository ModifierRepo { get; set; }
        public static ModifierService Modifiers { get; set; }
        public static DeliveryRepository DeliveryRepo { get; set; }
        public static DeliveryService Delivery { get; set; }
        public static RecipeRepository RecipeRepo { get; set; }
        public static RecipeService Recipes { get; set; }

        private static string ResolveBaseFolder(string customBaseFolder)
        {
            if (!string.IsNullOrEmpty(customBaseFolder))
            {
                return customBaseFolder;
            }
            // If running in development (Debug), use local data folder
            #if DEBUG
            return AppDomain.CurrentDomain.BaseDirectory;
            #else
            // In Production (Program Files), use C:\ProgramData\RafiqPOS for full write permissions
            return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "RafiqPOS");
            #endif
        }

        private static string _preparedDbPath;
        private static EncryptionStartupResult _preparedEncryption;

        /// <summary>
        /// The slow part of startup (the one-time encryption conversion of a legacy store) separated so the host can run it on a worker thread
        /// while the splash screen stays responsive. Initialize uses this result instead of repeating the work. Safe to skip.
        /// </summary>
        public static void PrepareEncryptionAtStartup(string customBaseFolder = null)
        {
            RafiqPOS.Data.SQLiteConnection.EnsureEngineLoaded();
            string baseFolder = ResolveBaseFolder(customBaseFolder);
            string dataFolder = Path.Combine(baseFolder, "data");
            if (!Directory.Exists(dataFolder))
            {
                Directory.CreateDirectory(dataFolder);
            }
            EncryptionService.ProtectDatabaseFolderAcl(dataFolder);
            string dbPath = Path.Combine(dataFolder, "rafiq_pos.db");
            _preparedEncryption = DatabaseEncryptionService.EnsureEncryptedAtStartup(dataFolder, dbPath, StartupProgress);
            _preparedDbPath = dbPath;
        }

        public static void Initialize(string customBaseFolder = null)
        {
            // A missing or blocked native engine must surface as itself (not as a generic database error further down)
            RafiqPOS.Data.SQLiteConnection.EnsureEngineLoaded();
            string baseFolder = ResolveBaseFolder(customBaseFolder);

            _integrityCheckCompleted = false;
            _baseFolder = baseFolder;
            string dataFolder = Path.Combine(baseFolder, "data");
            if (!Directory.Exists(dataFolder))
            {
                Directory.CreateDirectory(dataFolder);
            }

            // Feature #167: Restrict data folder permissions & initialize encryption service
            EncryptionService.ProtectDatabaseFolderAcl(dataFolder);
            Encryption = new EncryptionService();

            _dbPath = Path.Combine(dataFolder, "rafiq_pos.db");
            _connectionString = string.Format("Data Source={0};Version=3;BusyTimeout=5000;Foreign Keys=True;Journal Mode=Wal;Synchronous=Full;CacheSize=4000;", _dbPath);

            // Encrypted databases only: a legacy plain file is converted (crash-safe, verified) before anything opens it.
            // When the conversion cannot run, the process keeps using the plain file (every default connection unkeyed) and raises an alert.
            EncryptionStartupResult encryptionStart;
            if (_preparedEncryption != null && string.Equals(_preparedDbPath, _dbPath, StringComparison.OrdinalIgnoreCase))
            {
                encryptionStart = _preparedEncryption;
            }
            else
            {
                encryptionStart = DatabaseEncryptionService.EnsureEncryptedAtStartup(dataFolder, _dbPath, StartupProgress);
            }
            _preparedEncryption = null;
            _preparedDbPath = null;

            if (encryptionStart.Outcome == EncryptionStartupOutcome.FatalMissingDatabase)
            {
                // Never create a new empty database next to conversion leftovers
                throw new DatabaseStorageException(DatabaseFailureKind.EncryptionSwapInterrupted, encryptionStart.Message);
            }
            if (encryptionStart.Outcome == EncryptionStartupOutcome.FatalSealedOnly)
            {
                throw new DatabaseStorageException(DatabaseFailureKind.EncryptionSealedOnly, encryptionStart.Message);
            }
            // "running plain" is only valid when the live file really is plain: an encrypted file opened without the key would look corrupt
            if (encryptionStart.Outcome == EncryptionStartupOutcome.RunningPlain
                && RafiqPOS.Data.DatabaseKeyProvider.DetectFileKind(_dbPath) != RafiqPOS.Data.DatabaseFileKind.Plain)
            {
                Logger.Error("نتيجة التشفير 'قاعدة غير مشفرة' لكن الملف الحي ليس غير مشفر؛ تم تجاهل وضع الرجوع للقاعدة غير المشفرة.", null);
                encryptionStart.Outcome = EncryptionStartupOutcome.AlreadyEncrypted;
            }
            if (encryptionStart.Outcome == EncryptionStartupOutcome.RunningPlain)
            {
                RafiqPOS.Data.DatabaseKeyProvider.EnterPlainFallback();
            }
            else
            {
                RafiqPOS.Data.DatabaseKeyProvider.LeavePlainFallback();
            }
            if (encryptionStart.Outcome == EncryptionStartupOutcome.UnexpectedPlain)
            {
                // Recovery-style state, no automatic action: the plain file is neither adopted, converted nor modified
                IntegrityStatus = new DatabaseIntegrityStatus
                {
                    IsValid = false,
                    IsCorrupt = true,
                    IsUnexpectedPlain = true,
                    FailureCode = "UNEXPECTED_PLAIN_DATABASE",
                    Message = encryptionStart.Message
                };
                AttachLatestValidBackup(IntegrityStatus, _dbPath);
                _integrityCheckCompleted = true;
                MarkSessionOpen(dataFolder);
                Logger.Error("قاعدة بيانات غير مشفرة غير متوقعة؛ تم إيقاف عمليات الكتابة حتى يختار المستخدم الاسترجاع: " + encryptionStart.Message, null);
                return;
            }

            CleanStaleTempArtifacts();

            // Fast Startup Integrity Check (Feature #124 / Task 124-1)
            // PRAGMA quick_check reads the whole file (slow on big stores), so it runs only after an unclean shutdown,
            // when a WAL file was left behind, or once a week; otherwise a fast open + schema read still detects a damaged header/schema.
            bool fullCheck = ShouldRunFullIntegrityCheck(dataFolder, _dbPath);
            IntegrityStatus = CheckDatabaseIntegrityInternal(_connectionString, _dbPath, fullCheck);
            _integrityCheckCompleted = true;
            MarkSessionOpen(dataFolder);
            if (IntegrityStatus.IsCorrupt)
            {
                Logger.Error((IntegrityStatus.IsKeyMismatch
                    ? "ملف قاعدة البيانات لا يُفتح بمفتاح البرنامج (تالف أو من نسخة مختلفة)! لم يتم تغيير أي ملف وتم إيقاف عمليات الكتابة حتى يختار المستخدم الاسترجاع: "
                    : "تم اكتشاف تلف في ملف قاعدة البيانات عند بدء التشغيل! تم إيقاف عمليات الكتابة: ") + IntegrityStatus.Message, null);
                return; // Block migrations and repo init until recovery is performed
            }
            // Busy, disk full, read-only, I/O, cannot open and unknown errors are not corruption: fail with a precise message, never offer restore
            ThrowIfStartupBlocked(IntegrityStatus);

            // Execute safe migrations (Feature #1 & #4)
            MigrationRunner.ApplyMigrations(_connectionString, _dbPath);
            // From now on this store is known to be encrypted: a plain file appearing later is not adopted silently (UNEXPECTED_PLAIN_DATABASE)
            if (RafiqPOS.Data.DatabaseKeyProvider.DetectFileKind(_dbPath) == RafiqPOS.Data.DatabaseFileKind.NotPlain)
            {
                DatabaseEncryptionService.RecordEncryptionEvidence(dataFolder);
            }

            // Initialize Repositories and Services (Feature #5 & #7)
            CounterRepo = new CounterRepository(_connectionString);
            AuditRepo = new AuditLogRepository(_connectionString);
            ProductRepo = new ProductRepository(_connectionString, AuditRepo, CounterRepo);
            ProductBatchRepo = new ProductBatchRepository(_connectionString, AuditRepo);
            ProductVariantRepo = new ProductVariantRepository(_connectionString);
            SaleRepo = new SaleRepository(_connectionString, CounterRepo, AuditRepo, ProductBatchRepo);
            SettingsRepo = new SettingsRepository(_connectionString);
            if (fullCheck && IntegrityStatus.IsValid)
            {
                RecordFullIntegrityCheck();
            }
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
            Sales = new SaleService(SaleRepo, ProductRepo, QuickItemRepo, SettingsRepo);
            Inventory = new InventoryService(_connectionString, StockMovementRepo, ProductRepo, AuditRepo);
            Settings = new SettingsService(SettingsRepo, AuditRepo);
            Customers = new CustomerService(CustomerRepo);
            Categories = new CategoryService(CategoryRepo);
            QuickItems = new QuickItemService(QuickItemRepo);
            Reports = new ReportsService(_connectionString);
            Audit = new AuditLogService(AuditRepo);
            Support = new SupportService(_connectionString, _dbPath);
            Benchmark = new BenchmarkService();
            Backup = new BackupService(_connectionString, _dbPath, SettingsRepo, AuditRepo, Encryption);
            Excel = new ExcelService();
            Printer = new PrinterService(Settings);
            Security = new SecurityService(SettingsRepo, AuditRepo, UserRepo);
            Templates = new StoreTemplateService(_connectionString, SettingsRepo, Categories, QuickItems, AuditRepo);
            DemoData = new DemoDataService(_connectionString, SettingsRepo, AuditRepo, delegate { return Backup.CreateBackup(null); });
            Readiness = new ReadinessService(SettingsRepo, ProductRepo, Backup, Printer);
            SystemHealth = new SystemHealthService(_dbPath, SettingsRepo, ProductRepo, Backup, Printer);
            ApplyPreEncryptionRetentionOnce();
            License = new LicenseService(SettingsRepo, Audit);

            HeldSaleRepo = new HeldSaleRepository(_connectionString);
            ReturnRepo = new ReturnRepository(_connectionString, CounterRepo, AuditRepo);
            SupplierRepo = new SupplierRepository(_connectionString, AuditRepo);
            PurchaseRepo = new PurchaseRepository(_connectionString, CounterRepo, SupplierRepo, PriceHistoryRepo, AuditRepo, ProductBatchRepo);

            HeldSales = new HeldSaleService(HeldSaleRepo);
            Suppliers = new SupplierService(SupplierRepo);
            Purchases = new PurchaseService(PurchaseRepo);

            DailyClosingRepo = new DailyClosingRepository(_connectionString);
            ShiftRepo = new ShiftRepository(_connectionString);
            DailyClosing = new DailyClosingService(_connectionString, DailyClosingRepo, CounterRepo, AuditRepo, SettingsRepo, ShiftRepo);
            Returns = new ReturnService(ReturnRepo, SaleRepo, DailyClosing);
            ExpenseRepo = new ExpenseRepository(_connectionString);
            Expenses = new ExpenseService(ExpenseRepo, DailyClosing);
            Migration = new MigrationService(_connectionString, _dbPath, SettingsRepo, AuditRepo);
            Updates = new AppUpdateService(SettingsRepo);
            BarcodeLabels = new BarcodeLabelService(Settings, Printer);
            DigitalAccounts = new DigitalAccountRepository(_connectionString, AuditRepo);

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
            DrugInteractionRepo = new DrugInteractionRepository(_connectionString, AuditRepo);
            DrugInteractions = new DrugInteractionService(DrugInteractionRepo, PharmaRepo, ProductRepo, _connectionString);

            TableRepo = new TableRepository(_connectionString, AuditRepo);
            Tables = new TableManagementService(TableRepo);
            ModifierRepo = new ModifierRepository(_connectionString);
            Modifiers = new ModifierService(ModifierRepo);
            DeliveryRepo = new DeliveryRepository(_connectionString, AuditRepo);
            Delivery = new DeliveryService(DeliveryRepo);
            RecipeRepo = new RecipeRepository(_connectionString, AuditRepo);
            Recipes = new RecipeService(RecipeRepo);

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

        // Decrypted staging copies of legacy (plain) backups can outlive a crash: remove stale ones from the temp folder
        private static void CleanStaleTempArtifacts()
        {
            try
            {
                string temp = Path.GetTempPath();
                string[] patterns = new string[] { "rafiq_staging_*", "rafiq_bk_verify_*", "rafiq_wal_precheck_*" };
                DateTime cutoff = DateTime.UtcNow.AddHours(-2);
                for (int p = 0; p < patterns.Length; p++)
                {
                    foreach (string file in Directory.GetFiles(temp, patterns[p]))
                    {
                        try
                        {
                            if (File.GetLastWriteTimeUtc(file) < cutoff) RafiqPOS.Data.SecureDelete.WipeAndDeleteQuietly(file);
                        }
                        catch (IOException) { }
                        catch (UnauthorizedAccessException) { }
                    }
                }
            }
            catch (Exception ex)
            {
                Logger.Warn("تعذر تنظيف الملفات المؤقتة القديمة: " + ex.Message);
            }
        }

        // Once per process: counts this launch toward the retention of the sealed pre-encryption copy (see DatabaseEncryptionService)
        private static void ApplyPreEncryptionRetentionOnce()
        {
            if (_retentionAppliedThisProcess) return;
            _retentionAppliedThisProcess = true;
            try
            {
                DatabaseEncryptionService.ApplyPreEncryptionRetention(_dbPath);
            }
            catch (Exception ex)
            {
                Logger.Warn("تعذر تطبيق سياسة الاحتفاظ بنسخة ما قبل التشفير: " + ex.Message);
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

        private const string SessionOpenMarkerName = "session_open.marker";
        // Stored in the database settings table (not a separate file a standard user could fake)
        private const string LastFullIntegrityCheckKey = "integrity_last_full_check_utc";
        private const int FullIntegrityCheckIntervalDays = 7;

        private static bool ShouldRunFullIntegrityCheck(string dataFolder, string dbPath)
        {
            try
            {
                if (!File.Exists(dbPath))
                {
                    return true;
                }
                if (File.Exists(Path.Combine(dataFolder, SessionOpenMarkerName)))
                {
                    Logger.Warn("لم يُغلق البرنامج بشكل سليم في المرة السابقة؛ سيتم إجراء فحص السلامة الكامل لقاعدة البيانات.");
                    return true;
                }
                FileInfo wal = new FileInfo(dbPath + "-wal");
                if (wal.Exists && wal.Length > 0)
                {
                    Logger.Warn("تم العثور على ملف WAL غير مدمج عند بدء التشغيل؛ سيتم إجراء فحص السلامة الكامل لقاعدة البيانات.");
                    return true;
                }

                string raw = null;
                string readOnlyConn = string.Format("Data Source={0};Version=3;Read Only=True;BusyTimeout=2000;", dbPath);
                using (var conn = new RafiqPOS.Data.SQLiteConnection(readOnlyConn))
                {
                    conn.Open();
                    using (var cmd = new RafiqPOS.Data.SQLiteCommand("SELECT value FROM app_settings WHERE key = @key;", conn))
                    {
                        cmd.Parameters.AddWithValue("@key", LastFullIntegrityCheckKey);
                        object val = cmd.ExecuteScalar();
                        if (val != null && val != DBNull.Value)
                        {
                            raw = val.ToString();
                        }
                    }
                }

                DateTime lastUtc;
                if (string.IsNullOrEmpty(raw) ||
                    !DateTime.TryParse(raw.Trim(), System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.RoundtripKind, out lastUtc))
                {
                    return true;
                }
                double ageDays = (DateTime.UtcNow - lastUtc.ToUniversalTime()).TotalDays;
                return ageDays < 0 || ageDays >= FullIntegrityCheckIntervalDays;
            }
            catch (Exception ex)
            {
                Logger.Warn("تعذر قراءة حالة فحص السلامة السابق، سيتم إجراء الفحص الكامل: " + ex.Message);
                return true;
            }
        }

        private static void RecordFullIntegrityCheck()
        {
            try
            {
                SettingsRepo.Set(LastFullIntegrityCheckKey, DateTime.UtcNow.ToString("o"));
            }
            catch (Exception ex)
            {
                Logger.Warn("تعذر حفظ تاريخ آخر فحص سلامة كامل: " + ex.Message);
            }
        }

        private static void MarkSessionOpen(string dataFolder)
        {
            try
            {
                File.WriteAllText(Path.Combine(dataFolder, SessionOpenMarkerName), DateTime.UtcNow.ToString("o"));
            }
            catch (Exception ex)
            {
                Logger.Warn("تعذر إنشاء علامة جلسة التشغيل: " + ex.Message);
            }
        }

        /// <summary>Called on normal application close; the next startup then uses the fast integrity check.</summary>
        public static void MarkCleanShutdown()
        {
            try
            {
                if (string.IsNullOrEmpty(_dbPath)) return;
                // Startup failed before the integrity check finished: the previous run's marker must stay so the next start checks fully
                if (!_integrityCheckCompleted) return;
                // Close pooled connections so SQLite checkpoints and removes the WAL; a WAL left at the next startup then
                // reliably means an unclean shutdown (and triggers the full integrity check)
                RafiqPOS.Data.SQLiteConnection.ClearAllPools();
                string marker = Path.Combine(Path.GetDirectoryName(_dbPath), SessionOpenMarkerName);
                if (File.Exists(marker))
                {
                    File.Delete(marker);
                }
            }
            catch (Exception ex)
            {
                Logger.Warn("تعذر حذف علامة جلسة التشغيل عند الإغلاق: " + ex.Message);
            }
        }

        private static DatabaseIntegrityStatus CheckDatabaseIntegrityInternal(string connStr, string dbPath)
        {
            return CheckDatabaseIntegrityInternal(connStr, dbPath, true);
        }

        private static DatabaseIntegrityStatus CheckDatabaseIntegrityInternal(string connStr, string dbPath, bool fullCheck)
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

            // Opening the database may checkpoint or discard the WAL, so keep its pre-check bytes for the quarantine
            string walSnapshot = null;
            if (File.Exists(dbPath + "-wal"))
            {
                walSnapshot = Path.Combine(Path.GetTempPath(), "rafiq_wal_precheck_" + Guid.NewGuid().ToString("N") + ".db-wal");
                try
                {
                    File.Copy(dbPath + "-wal", walSnapshot, true);
                }
                catch (IOException walEx)
                {
                    Logger.Warn("تعذر أخذ نسخة من ملف WAL قبل فحص السلامة: " + walEx.Message);
                    walSnapshot = null;
                }
            }

            try
            {
                return CheckAndQuarantine(connStr, dbPath, walSnapshot, status, fullCheck);
            }
            finally
            {
                if (walSnapshot != null && File.Exists(walSnapshot))
                {
                    try { File.Delete(walSnapshot); } catch (IOException) { }
                }
            }
        }

        // Only genuine corruption (SQLITE_CORRUPT / SQLITE_NOTADB) may trigger quarantine and the restore flow
        public static void ApplyIntegrityFailure(DatabaseIntegrityStatus status, Exception ex)
        {
            DatabaseFailureKind failure = DatabaseFailureClassifier.Classify(ex);
            status.IsValid = false;
            if (failure == DatabaseFailureKind.Corrupt)
            {
                status.IsCorrupt = true;
                status.Message = ex.Message;
                return;
            }

            status.IsCorrupt = false;
            status.StorageFailure = failure;
            if (failure == DatabaseFailureKind.Busy)
            {
                status.Message = "ملف قاعدة البيانات مقفل مؤقتاً بواسطة برنامج آخر أو قيد الفحص: " + ex.Message;
            }
            else
            {
                status.Message = DatabaseFailureClassifier.DescribeArabic(failure) + "\n\n" + ex.Message;
            }
            Logger.Error("فشل فحص قاعدة البيانات عند بدء التشغيل لسبب ليس تلفاً في الملف (" + failure + ")", ex);
        }

        // A "not a database / corrupt" failure on a file whose header is not plain SQLite is what a wrong key looks like
        public static bool IsEncryptionKeyFailure(string dbPath, Exception ex)
        {
            if (!(ex is RafiqPOS.Data.SQLiteException)) return false;
            if (DatabaseFailureClassifier.Classify(ex) != DatabaseFailureKind.Corrupt) return false;
            if (!RafiqPOS.Data.DatabaseKeyProvider.IsDefaultEncryptionEnabled) return false;
            if (RafiqPOS.Data.DatabaseKeyProvider.DetectFileKind(dbPath) != RafiqPOS.Data.DatabaseFileKind.NotPlain) return false;
            return !KeyDecryptsHeaderPage(dbPath);
        }

        // Reads only the first (header) page with the program key. If that works the key is right and any other failure is real
        // corruption; if it does not, the file is a wrong-key / damaged-header case that must never be quarantined or restored over.
        private static bool KeyDecryptsHeaderPage(string dbPath)
        {
            try
            {
                using (var conn = RafiqPOS.Data.DatabaseFileAccess.OpenExisting(dbPath, true))
                using (var cmd = new RafiqPOS.Data.SQLiteCommand("PRAGMA schema_version;", conn))
                {
                    cmd.ExecuteScalar();
                    return true;
                }
            }
            catch (RafiqPOS.Data.SQLiteException)
            {
                return false;
            }
            catch (IOException)
            {
                return false;
            }
        }

        public static void ApplyEncryptionKeyMismatch(DatabaseIntegrityStatus status, Exception ex)
        {
            status.IsValid = false;
            // Recoverable through the existing restore flow (IsCorrupt drives the recovery UI), but nothing happens automatically
            status.IsCorrupt = true;
            status.IsKeyMismatch = true;
            status.FailureCode = DatabaseFailureClassifier.IpcCode(DatabaseFailureKind.EncryptionKeyMismatch);
            status.StorageFailure = DatabaseFailureKind.EncryptionKeyMismatch;
            status.Message = DatabaseFailureClassifier.DescribeArabic(DatabaseFailureKind.EncryptionKeyMismatch);
            Logger.Error("ENCRYPTION_KEY_MISMATCH: فشل فتح قاعدة البيانات المشفرة بالمفتاح الحالي؛ لم يتم تغيير أي ملف", ex);
        }

        // An integrity result that is neither valid nor corrupt (busy, disk, permission, unknown) is a startup failure with its own message
        public static void ThrowIfStartupBlocked(DatabaseIntegrityStatus status)
        {
            if (status != null && !status.IsValid && !status.IsCorrupt)
            {
                throw new DatabaseStorageException(status.StorageFailure, status.Message);
            }
        }

        private static DatabaseIntegrityStatus CheckAndQuarantine(string connStr, string dbPath, string walSnapshot, DatabaseIntegrityStatus status, bool fullCheck)
        {
            // A NotADb/corrupt failure on a non-plain file whose header page does not decrypt with our key means "wrong key or damaged
            // header", which must never trigger quarantine or restore (decision 5)
            try
            {
                using (var conn = new RafiqPOS.Data.SQLiteConnection(connStr))
                {
                    conn.Open();

                    // 1. Run PRAGMA quick_check (full file scan) only when requested; startup uses it after unclean shutdown or weekly
                    if (fullCheck)
                    {
                        using (var cmd = new RafiqPOS.Data.SQLiteCommand("PRAGMA quick_check;", conn))
                        {
                            object res = cmd.ExecuteScalar();
                            if (res == null || !res.ToString().Equals("ok", StringComparison.OrdinalIgnoreCase))
                            {
                                status.IsValid = false;
                                status.IsCorrupt = true;
                                status.Message = res != null ? res.ToString() : "ملف قاعدة البيانات تالف أو غير متسق.";
                            }
                        }
                    }

                    // 2. Validate essential table can be queried if quick_check returned ok
                    if (!status.IsCorrupt)
                    {
                        using (var cmd = new RafiqPOS.Data.SQLiteCommand("SELECT count(*) FROM sqlite_master;", conn))
                        {
                            cmd.ExecuteScalar();
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                if (IsEncryptionKeyFailure(dbPath, ex))
                {
                    ApplyEncryptionKeyMismatch(status, ex);
                }
                else
                {
                    ApplyIntegrityFailure(status, ex);
                }
            }

            // If corrupt, isolate and quarantine file without deleting it (Task 124-2)
            if (status.IsCorrupt)
            {
                // A key mismatch is never quarantined: the file stays exactly as it is until the user chooses to restore
                if (!status.IsKeyMismatch)
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
                    // Committed pages not yet checkpointed live only in the WAL, so it must be quarantined with the db
                    if (walSnapshot != null)
                    {
                        File.Copy(walSnapshot, corruptCopy + "-wal", true);
                    }
                    status.CorruptBackupSavedPath = corruptCopy;
                    PruneDirectoryFiles(quarantineDir, "corrupt_db_*.db", 2);
                    PruneDirectoryFiles(quarantineDir, "corrupt_db_*.db-wal", 2);
                }
                catch (Exception qEx)
                {
                    Logger.Warn("تعذر عزل ملف البيانات التالف: " + qEx.Message);
                }

                // Locate latest valid backup file
                AttachLatestValidBackup(status, dbPath);
            }

            return status;
        }

        // Fills the "latest backup" fields the recovery UI shows (corruption, key mismatch and unexpected-plain states)
        private static void AttachLatestValidBackup(DatabaseIntegrityStatus status, string dbPath)
        {
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

        public static TransactionResult RestoreFromBackup(string backupFilePath)
        {
            return RestoreFromBackup(backupFilePath, null);
        }

        /// <summary>The file a restore request will actually use: the given path, or the latest discovered backup.</summary>
        public static string ResolveRestoreTarget(string backupFilePath)
        {
            if (string.IsNullOrWhiteSpace(backupFilePath) && IntegrityStatus != null && !string.IsNullOrEmpty(IntegrityStatus.LatestValidBackupFile))
            {
                return IntegrityStatus.LatestValidBackupFile;
            }
            return backupFilePath;
        }

        /// <summary>
        /// Gate for restores without a session (corrupt database): only an encrypted Rafiq backup that opens with the
        /// owner recovery code is accepted. Returns null when allowed, otherwise the Arabic reason.
        /// </summary>
        public static string ValidateRecoveryBackup(string backupFilePath, string recoveryCode)
        {
            string target;
            string pathError = CheckRestoreSource(ResolveRestoreTarget(backupFilePath), out target);
            if (pathError != null)
            {
                return pathError;
            }
            if (!EncryptionService.IsFileEncrypted(target))
            {
                return "في وضع استعادة تلف قاعدة البيانات يُسمح فقط باستعادة نسخ رفيق الاحتياطية المشفرة.";
            }
            if (string.IsNullOrWhiteSpace(recoveryCode))
            {
                return "يرجى إدخال كود استرجاع المالك لتأكيد الاسترجاع.";
            }
            if (!EncryptionService.CanUnlockWithRecoveryCode(target, recoveryCode))
            {
                return "كود استرجاع المالك غير صحيح لهذه النسخة، أو أن الملف ليس نسخة رفيق احتياطية مشفرة صالحة.";
            }
            return null;
        }

        // Path gate shared by the restore entry points: the backup file the UI names is never trusted as-is
        private static string CheckRestoreSource(string candidate, out string fullPath)
        {
            string allowedFolder = null;
            try
            {
                if (SettingsRepo != null) allowedFolder = SettingsRepo.Get("backup_target_folder", "");
            }
            catch (Exception)
            {
                // Settings may be unreadable on a damaged database; the gate then only allows local drive paths
            }
            string liveDataFolder = string.IsNullOrEmpty(_dbPath) ? null : Path.GetDirectoryName(_dbPath);
            return BackupService.ValidateRestoreSource(candidate, allowedFolder, liveDataFolder, out fullPath);
        }

        /// <summary>Starts license/backup background timers now and again after every database swap.</summary>
        public static void StartBackgroundChecks()
        {
            _backgroundChecksRequested = true;
            if (License != null) License.StartBackgroundPeriodicCheck();
            if (Backup != null) Backup.StartBackgroundPeriodicCheck();
        }

        private static void StopBackgroundChecks()
        {
            if (License != null) License.StopBackgroundPeriodicCheck();
            if (Backup != null) Backup.StopBackgroundPeriodicCheck();
        }

        public static TransactionResult RestoreFromBackup(string backupFilePath, string masterKey)
        {
            string tempStaging = null;
            try
            {
                string targetBackup;
                string pathError = CheckRestoreSource(ResolveRestoreTarget(backupFilePath), out targetBackup);
                if (pathError != null)
                {
                    return new TransactionResult(false, pathError);
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
                // Legacy backups hold a plain database, current ones an encrypted one: the header decides how it is opened
                using (var conn = RafiqPOS.Data.DatabaseFileAccess.OpenExisting(fileToRestore, true))
                {
                    using (var cmd = new RafiqPOS.Data.SQLiteCommand("PRAGMA quick_check;", conn))
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
                        using (var cmdVer = new RafiqPOS.Data.SQLiteCommand("SELECT COALESCE(MAX(version), 0) FROM schema_migrations;", conn))
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

                TransactionResult swap = ReplaceDatabaseFile(_dbPath, _connectionString, fileToRestore, "pre_restore", null);
                if (!swap.Success)
                {
                    return swap;
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
                    RafiqPOS.Data.SecureDelete.WipeAndDeleteQuietly(tempStaging);
                }
            }
        }

        /// <summary>
        /// Swaps a database file for an already verified replacement (backup restore and migration package).
        /// Safety snapshot (WAL included) first, WAL checkpointed, WAL+SHM removed together or not at all.
        /// When dbPath is the live database the background timers are paused and the same data folder is
        /// re-initialised. afterCopy runs once the new file is in place (may be null).
        /// </summary>
        public static TransactionResult ReplaceDatabaseFile(string dbPath, string connectionString, string replacementDbPath, string safetyPrefix, Action afterCopy)
        {
            bool isLive = !string.IsNullOrEmpty(_dbPath)
                && string.Equals(Path.GetFullPath(dbPath), Path.GetFullPath(_dbPath), StringComparison.OrdinalIgnoreCase);
            bool sourceCorrupt = isLive && IsCorrupted;

            // The SQLite online backup API includes pages still in the WAL file; a plain File.Copy would miss recent sales (Audit F-29)
            if (File.Exists(dbPath))
            {
                string safetyDir = Path.Combine(Path.GetDirectoryName(dbPath), "pre_restore");
                string stamp = DateTime.Now.ToString("yyyyMMdd_HHmmss");
                try
                {
                    if (!Directory.Exists(safetyDir)) Directory.CreateDirectory(safetyDir);
                    string snapPath = Path.Combine(safetyDir, string.Format("{0}_{1}.db", safetyPrefix, stamp));
                    // The snapshot has the live file's format, so it never exposes more than the original does
                    bool livePlain = RafiqPOS.Data.DatabaseKeyProvider.IsPlainSqliteFile(dbPath);
                    using (var srcConn = new RafiqPOS.Data.SQLiteConnection(connectionString))
                    using (var dstConn = RafiqPOS.Data.DatabaseFileAccess.Open(snapPath, false, livePlain))
                    {
                        srcConn.Open();
                        srcConn.BackupDatabase(dstConn, "main", "main", -1, null, 0);
                    }
                    PruneDirectoryFiles(safetyDir, safetyPrefix + "_*.db", 2);
                }
                catch (Exception snapEx)
                {
                    Logger.Error("تعذر أخذ نسخة أمان قبل استبدال قاعدة البيانات", snapEx);
                    if (!sourceCorrupt)
                    {
                        return new TransactionResult(false, "تم إيقاف الاسترجاع: تعذر حفظ نسخة أمان من البيانات الحالية قبل استبدالها.");
                    }
                    // Corrupt database: the backup API may be unable to read it, so keep raw copies of the db and WAL files instead
                    try
                    {
                        if (!Directory.Exists(safetyDir)) Directory.CreateDirectory(safetyDir);
                        File.Copy(dbPath, Path.Combine(safetyDir, safetyPrefix + "_corrupt_" + stamp + ".db"), true);
                        if (File.Exists(dbPath + "-wal")) File.Copy(dbPath + "-wal", Path.Combine(safetyDir, safetyPrefix + "_corrupt_" + stamp + ".db-wal"), true);
                    }
                    catch (Exception rawEx)
                    {
                        Logger.Error("تعذر نسخ ملفات قاعدة البيانات التالفة قبل الاسترجاع", rawEx);
                    }
                }
            }

            // Stage the replacement next to the live file first: a failed copy (disk full, flash removed) then changes nothing
            string incomingPath = dbPath + ".incoming_" + Guid.NewGuid().ToString("N");
            try
            {
                // A legacy plain database (old backup / store package) is converted to the encrypted format and verified
                // before it can become the live file; encrypted replacements are copied as they are
                if (RafiqPOS.Data.DatabaseKeyProvider.IsDefaultEncryptionEnabled
                    && !RafiqPOS.Data.DatabaseKeyProvider.IsPlainFallbackActive
                    && RafiqPOS.Data.DatabaseKeyProvider.IsPlainSqliteFile(replacementDbPath))
                {
                    DatabaseEncryptionService.EncryptPlainCopy(replacementDbPath, incomingPath);
                }
                else
                {
                    File.Copy(replacementDbPath, incomingPath, true);
                }
            }
            catch (Exception stageEx)
            {
                Logger.Error("تعذر تجهيز ملف قاعدة البيانات المسترجعة", stageEx);
                RafiqPOS.Data.SecureDelete.WipeAndDeleteQuietly(incomingPath);
                return new TransactionResult(false, "تم إيقاف الاسترجاع: تعذر تجهيز ملف النسخة (مساحة القرص أو الفلاشة). لم يتم المساس بقاعدة البيانات الحالية.");
            }

            // Background timers would reopen the database mid-swap, so they stay off until the new file is live
            if (isLive) StopBackgroundChecks();
            string rollbackPath = null;
            try
            {
                // Fold the WAL into the main file so nothing committed depends on the files about to be removed
                if (!sourceCorrupt && File.Exists(dbPath))
                {
                    using (var ckConn = new RafiqPOS.Data.SQLiteConnection(connectionString))
                    {
                        ckConn.Open();
                        using (var ckCmd = new RafiqPOS.Data.SQLiteCommand("PRAGMA wal_checkpoint(TRUNCATE);", ckConn))
                        using (var ckReader = ckCmd.ExecuteReader())
                        {
                            if (ckReader.Read() && Convert.ToInt32(ckReader[0]) != 0)
                            {
                                return new TransactionResult(false, "تم إيقاف الاسترجاع: قاعدة البيانات مشغولة بعملية أخرى حالياً. أعد المحاولة بعد لحظات.");
                            }
                        }
                    }
                }

                RafiqPOS.Data.SQLiteConnection.ClearAllPools();
                GC.Collect();
                GC.WaitForPendingFinalizers();

                // WAL and SHM leave together or not at all: a stray WAL would be replayed over the restored file
                string moveError = MoveAsideWalAndShm(dbPath);
                if (moveError != null)
                {
                    return new TransactionResult(false, moveError);
                }

                try
                {
                    // The current file is parked (not deleted) until the restored one has opened cleanly, so any failure can undo the swap
                    if (File.Exists(dbPath))
                    {
                        rollbackPath = dbPath + ".rollback_" + Guid.NewGuid().ToString("N");
                        File.Move(dbPath, rollbackPath);
                    }
                    File.Move(incomingPath, dbPath);
                    if (afterCopy != null)
                    {
                        afterCopy();
                    }

                    RafiqPOS.Data.SQLiteConnection.ClearAllPools();
                    if (isLive)
                    {
                        Initialize(_baseFolder);
                        if (IsCorrupted)
                        {
                            throw new InvalidDataException("الملف المسترجع لم يجتز فحص السلامة بعد الاستبدال.");
                        }
                    }
                }
                catch (Exception swapEx)
                {
                    Logger.Error("فشل استبدال قاعدة البيانات، جاري إعادة الملف الأصلي", swapEx);
                    return new TransactionResult(false, RollBackDatabaseSwap(dbPath, rollbackPath, isLive, swapEx));
                }

                if (rollbackPath != null)
                {
                    try { File.Delete(rollbackPath); } catch (IOException delEx) { Logger.Warn("تعذر حذف الملف المؤقت للقاعدة السابقة: " + delEx.Message); }
                }
                return new TransactionResult(true, "تم استبدال قاعدة البيانات بنجاح.");
            }
            finally
            {
                RafiqPOS.Data.SecureDelete.WipeAndDeleteQuietly(incomingPath);
                if (isLive && _backgroundChecksRequested && !IsCorrupted)
                {
                    StartBackgroundChecks();
                }
            }
        }

        // Puts the parked database back after a failed swap and reopens it; returns the Arabic outcome for the caller
        private static string RollBackDatabaseSwap(string dbPath, string rollbackPath, bool isLive, Exception cause)
        {
            try
            {
                RafiqPOS.Data.SQLiteConnection.ClearAllPools();
                GC.Collect();
                GC.WaitForPendingFinalizers();
                if (rollbackPath != null && File.Exists(rollbackPath))
                {
                    // Whatever replaced the original (including its WAL/SHM) goes away together
                    foreach (string stray in new string[] { dbPath, dbPath + "-wal", dbPath + "-shm" })
                    {
                        if (File.Exists(stray)) File.Delete(stray);
                    }
                    File.Move(rollbackPath, dbPath);
                }
                if (isLive)
                {
                    Initialize(_baseFolder);
                }
                return "تم إلغاء الاسترجاع وإرجاع قاعدة البيانات الحالية كما كانت دون أي تغيير. السبب: " + cause.Message;
            }
            catch (Exception rbEx)
            {
                Logger.Error("تعذرت إعادة قاعدة البيانات الأصلية بعد فشل الاستبدال", rbEx);
                return "فشل الاسترجاع وتعذرت إعادة قاعدة البيانات تلقائياً. لا تغلق البرنامج وتواصل مع الدعم الفني فوراً؛ نسخة الأمان محفوظة في مجلد pre_restore ونسخة القاعدة السابقة في: " + (rollbackPath ?? dbPath);
            }
        }

        // Renames -wal and -shm out of the way (undoing on failure), then deletes the renamed copies; null on success
        private static string MoveAsideWalAndShm(string dbPath)
        {
            string[] files = new string[] { dbPath + "-wal", dbPath + "-shm" };
            var moved = new List<KeyValuePair<string, string>>();
            try
            {
                foreach (string file in files)
                {
                    if (!File.Exists(file)) continue;
                    string aside = file + ".swap_" + Guid.NewGuid().ToString("N");
                    File.Move(file, aside);
                    moved.Add(new KeyValuePair<string, string>(file, aside));
                }
            }
            catch (Exception moveEx)
            {
                Logger.Error("تعذر إزالة ملفات WAL/SHM قبل الاسترجاع", moveEx);
                foreach (var pair in moved)
                {
                    try { File.Move(pair.Value, pair.Key); }
                    catch (Exception undoEx) { Logger.Error("تعذر إرجاع ملف " + pair.Key, undoEx); }
                }
                return "تم إيقاف الاسترجاع: ملفات سجل قاعدة البيانات (WAL/SHM) مستخدمة حالياً ولا يمكن إزالتها. أغلق أي نسخة أخرى من البرنامج ثم أعد المحاولة.";
            }
            foreach (var pair in moved)
            {
                try { File.Delete(pair.Value); }
                catch (IOException delEx) { Logger.Warn("تعذر حذف نسخة WAL/SHM المنقولة: " + delEx.Message); }
            }
            return null;
        }

        public static DatabaseHealthInfo GetHealth()
        {
            return CheckHealth(_dbPath, IsCorrupted);
        }

        // Real read-only facts about the store database. Never throws and never waits long: a short busy timeout on a
        // separate connection (WAL readers do not block the sale writer) so the system info screen cannot stall selling.
        public static DatabaseHealthInfo CheckHealth(string dbPath, bool flaggedCorrupt)
        {
            var info = new DatabaseHealthInfo();
            if (string.IsNullOrEmpty(dbPath) || !File.Exists(dbPath))
            {
                info.Error = "ملف قاعدة البيانات غير موجود.";
                return info;
            }

            try { info.SizeBytes = new FileInfo(dbPath).Length; }
            catch (Exception sizeEx) { Logger.Warn("تعذر قراءة حجم قاعدة البيانات: " + sizeEx.Message); }

            if (flaggedCorrupt)
            {
                info.Error = "فحص السلامة اكتشف تلفاً في قاعدة البيانات، وعمليات الكتابة موقوفة حمايةً للبيانات.";
                return info;
            }

            try
            {
                string connStr = string.Format("Data Source={0};Version=3;BusyTimeout=500;Pooling=False;", dbPath);
                using (var conn = new RafiqPOS.Data.SQLiteConnection(connStr))
                {
                    conn.Open();
                    using (var cmd = new RafiqPOS.Data.SQLiteCommand("PRAGMA journal_mode;", conn))
                    {
                        object mode = cmd.ExecuteScalar();
                        info.JournalMode = mode != null && mode != DBNull.Value ? mode.ToString().ToLowerInvariant() : "";
                    }
                    using (var cmd = new RafiqPOS.Data.SQLiteCommand("SELECT COALESCE(MAX(version), 0) FROM schema_migrations;", conn))
                    {
                        object ver = cmd.ExecuteScalar();
                        info.SchemaVersion = ver != null && ver != DBNull.Value ? Convert.ToInt32(ver) : 0;
                    }
                }
                info.IsOk = true;
            }
            catch (Exception ex)
            {
                Logger.Warn("تعذر فحص قاعدة البيانات لشاشة معلومات النظام: " + ex.Message);
                info.IsOk = false;
                info.Error = "تعذر فتح قاعدة البيانات أو قراءة بياناتها.";
            }
            return info;
        }

        // ------------------------------------------------------------ database encryption (root tools, status)

        public static EncryptionStatus GetEncryptionStatus()
        {
            if (string.IsNullOrEmpty(_dbPath)) return new EncryptionStatus();
            EncryptionStatus status = DatabaseEncryptionService.GetStatus(_dbPath);
            // The conversion that started with this process decides what is shown (the marker is gone after a success)
            EncryptionStartupResult startup = DatabaseEncryptionService.LastStartupResult;
            if (startup != null && startup.Outcome == EncryptionStartupOutcome.RunningPlain)
            {
                status.DatabaseEncrypted = false;
                if (startup.Stopped) status.ConversionStopped = true;
            }
            return status;
        }

        // Returns false when the entry could not be written (callers that must audit first refuse to continue)
        private static bool LogEncryptionAudit(string action, string details)
        {
            try
            {
                if (AuditRepo == null) return false;
                RafiqPOS.Models.UserDto actor = SecurityService.CurrentUser;
                AuditRepo.Log(new RafiqPOS.Models.AuditLog
                {
                    UserId = actor != null ? actor.Id : "usr_admin_default",
                    Action = action,
                    EntityType = "database",
                    EntityId = "rafiq_pos.db",
                    DetailsJson = details
                });
                return true;
            }
            catch (Exception ex)
            {
                Logger.Warn("تعذر تسجيل حدث التشفير في سجل التدقيق: " + ex.Message);
                return false;
            }
        }

        /// <summary>
        /// Validates the destination of the decrypted export: a fully-qualified LOCAL path only. Rejects drive-relative paths (C:x), UNC and
        /// device paths, "..", alternate data streams, wrong extension, folders that are or sit behind a reparse point (junction/symlink),
        /// and anything inside the data folder. Returns null when acceptable, otherwise the Arabic reason; fullPath is the normalised target.
        /// </summary>
        internal static string ValidateExportPath(string destinationPath, string liveDataFolder, out string fullPath)
        {
            fullPath = null;
            if (string.IsNullOrWhiteSpace(destinationPath)) return "يرجى تحديد مسار ملف الوجهة.";
            string raw = destinationPath.Trim();
            if (raw.IndexOf('\0') >= 0) return "مسار الوجهة غير صالح.";
            if (raw.StartsWith("\\\\", StringComparison.Ordinal) || raw.StartsWith("//", StringComparison.Ordinal)) return "مسارات الشبكة والأجهزة غير مسموحة؛ اختر مساراً محلياً كاملاً.";
            bool driveForm = raw.Length >= 2 && char.IsLetter(raw[0]) && raw[1] == ':';
            if (driveForm && (raw.Length < 3 || (raw[2] != '\\' && raw[2] != '/'))) return "يجب أن يكون المسار كاملاً (مثل D:\\export\\store.db) وليس نسبياً للقرص.";
            string rest = driveForm ? raw.Substring(2) : raw;
            if (rest.IndexOf(':') >= 0) return "المسارات التي تحتوي على تدفقات بيانات بديلة غير مسموحة.";
            if (!driveForm && !raw.StartsWith("/", StringComparison.Ordinal)) return "يجب أن يكون المسار كاملاً وينتهي بالامتداد .db";
            string[] parts = raw.Split(new char[] { '\\', '/' });
            for (int i = 0; i < parts.Length; i++)
            {
                if (parts[i] == "..") return "المسارات التي تحتوي على .. غير مسموحة.";
            }
            try
            {
                fullPath = Path.GetFullPath(raw);
            }
            catch (Exception)
            {
                return "مسار الوجهة غير صالح.";
            }
            if (!string.Equals(Path.GetExtension(fullPath), ".db", StringComparison.OrdinalIgnoreCase)) return "يجب أن يكون المسار كاملاً وينتهي بالامتداد .db";
            string folder = Path.GetDirectoryName(fullPath);
            if (string.IsNullOrEmpty(folder) || !Directory.Exists(folder)) return "مجلد الوجهة غير موجود.";

            // A junction or symlink anywhere on the way could redirect the write into the data folder: compare the REAL locations
            string realFolder = RealPathResolver.ResolveDirectory(folder);
            if (realFolder == null) return "تعذر التحقق من مسار مجلد الوجهة.";
            if (!string.IsNullOrEmpty(liveDataFolder))
            {
                string realLive = RealPathResolver.ResolveDirectory(liveDataFolder);
                if (realLive == null) return "تعذر التحقق من مسار مجلد البيانات.";
                string liveReal = realLive.TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
                string folderReal = realFolder.TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
                if (folderReal.StartsWith(liveReal, StringComparison.OrdinalIgnoreCase)) return "لا يمكن التصدير داخل مجلد بيانات البرنامج (ولا عبر رابط إليه)؛ اختر مجلداً آخر.";
            }
            // The whole RafiqPOS base folder (backups, logs, quarantine, ... and the data folder) is off limits, also through links
            if (!string.IsNullOrEmpty(liveDataFolder))
            {
                string baseFolder = Path.GetDirectoryName(Path.GetFullPath(liveDataFolder).TrimEnd(Path.DirectorySeparatorChar));
                if (!string.IsNullOrEmpty(baseFolder) && Directory.Exists(baseFolder))
                {
                    string realBase = RealPathResolver.ResolveDirectory(baseFolder);
                    if (realBase == null) return "تعذر التحقق من مسار مجلد البرنامج.";
                    string baseReal = realBase.TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
                    string folderReal2 = realFolder.TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
                    if (folderReal2.StartsWith(baseReal, StringComparison.OrdinalIgnoreCase)) return "لا يمكن التصدير داخل مجلد بيانات رفيق (backups أو data أو غيرها)؛ اختر مجلداً آخر.";
                    string baseFull = Path.GetFullPath(baseFolder).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
                    if (fullPath.StartsWith(baseFull, StringComparison.OrdinalIgnoreCase)) return "لا يمكن التصدير داخل مجلد بيانات رفيق؛ اختر مجلداً آخر.";
                }
            }
            string liveFolder = string.IsNullOrEmpty(liveDataFolder) ? null : Path.GetFullPath(liveDataFolder).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
            if (liveFolder != null && fullPath.StartsWith(liveFolder, StringComparison.OrdinalIgnoreCase)) return "لا يمكن التصدير داخل مجلد بيانات البرنامج؛ اختر مجلداً آخر.";
            if (File.Exists(fullPath)) return "الملف الوجهة موجود بالفعل، اختر اسماً جديداً.";
            return null;
        }

        /// <summary>
        /// Root-only escape hatch: writes a plain, row-for-row verified copy of the live database to a new file chosen by the caller.
        /// The path must be absolute, new, outside the data folder and end with .db. Audited.
        /// </summary>
        public static TransactionResult ExportDecryptedCopy(string destinationPath)
        {
            string full;
            string pathError = ValidateExportPath(destinationPath, string.IsNullOrEmpty(_dbPath) ? null : Path.GetDirectoryName(_dbPath), out full);
            if (pathError != null)
            {
                return new TransactionResult(false, pathError);
            }
            if (string.IsNullOrEmpty(_connectionString))
            {
                return new TransactionResult(false, "قاعدة البيانات غير مهيأة.");
            }

            // The audit entry comes FIRST: no plain copy of the store is written unless the attempt is on record
            if (!LogEncryptionAudit("تصدير_قاعدة_بيانات_غير_مشفرة", "محاولة تصدير نسخة غير مشفرة من قاعدة البيانات إلى: " + full))
            {
                return new TransactionResult(false, "تم إلغاء التصدير: تعذر تسجيل العملية في سجل التدقيق.");
            }

            try
            {
                DatabaseEncryptionService.ExportDecrypted(_connectionString, full);
                Logger.Warn("تم تصدير نسخة غير مشفرة من قاعدة البيانات بواسطة المستخدم الجذر: " + full);
                return new TransactionResult(true, "تم تصدير نسخة غير مشفرة وموثقة من قاعدة البيانات. احفظها في مكان آمن واحذفها بعد الانتهاء.");
            }
            catch (DatabaseConversionException ex)
            {
                return new TransactionResult(false, ex.Message);
            }
            catch (Exception ex)
            {
                Logger.Error("فشل تصدير نسخة غير مشفرة", ex);
                return new TransactionResult(false, "فشل التصدير: " + ex.Message);
            }
        }

        /// <summary>
        /// Root action: puts the sealed pre-encryption copy back as the live database when (and only when) the live file is missing or empty.
        /// The audit entry is written after the restore (when the store is open, it can only be written to the restored file); the
        /// application log always records it.
        /// </summary>
        public static TransactionResult RestoreFromPreEncryptionCopy()
        {
            if (string.IsNullOrEmpty(_dbPath)) return new TransactionResult(false, "قاعدة البيانات غير مهيأة.");
            string error = DatabaseEncryptionService.RestoreFromPreEncryptionCopy(_dbPath);
            if (error != null) return new TransactionResult(false, error);
            RafiqPOS.Data.SQLiteConnection.ClearAllPools();
            LogEncryptionAudit("استرجاع_من_نسخة_ما_قبل_التشفير", "تم استرجاع قاعدة البيانات من نسخة ما قبل التشفير المحفوظة بطلب المستخدم الجذر");
            return new TransactionResult(true, "تم استرجاع قاعدة البيانات من نسخة ما قبل التشفير. أعد تشغيل البرنامج.");
        }

        public static TransactionResult DeletePreEncryptionCopy()
        {
            if (string.IsNullOrEmpty(_dbPath)) return new TransactionResult(false, "قاعدة البيانات غير مهيأة.");
            if (!File.Exists(DatabaseEncryptionService.PreEncryptionPath(_dbPath)))
            {
                return new TransactionResult(false, "لا توجد نسخة ما قبل التشفير.");
            }
            bool deleted = DatabaseEncryptionService.DeletePreEncryptionCopy(_dbPath);
            if (deleted) LogEncryptionAudit("حذف_نسخة_ما_قبل_التشفير", "تم حذف نسخة ما قبل التشفير بطلب المستخدم الجذر");
            return new TransactionResult(deleted, deleted ? "تم حذف نسخة ما قبل التشفير." : "تعذر حذف نسخة ما قبل التشفير.");
        }

        public static TransactionResult RetryEncryptionConversion()
        {
            if (string.IsNullOrEmpty(_dbPath)) return new TransactionResult(false, "قاعدة البيانات غير مهيأة.");
            DatabaseEncryptionService.ResetConversionFailures(Path.GetDirectoryName(_dbPath));
            LogEncryptionAudit("إعادة_محاولة_تشفير_قاعدة_البيانات", "تمت تهيئة محاولة تشفير جديدة عند التشغيل القادم");
            return new TransactionResult(true, "سيتم إعادة محاولة تشفير قاعدة البيانات عند تشغيل البرنامج في المرة القادمة.");
        }

        public static TransactionResult ExecuteAtomicSaleTransaction(int itemCount)
        {
            // Isolate test transactions to a temporary DB to avoid polluting the active store DB (BUG-03)
            string tempDbPath = Path.Combine(Path.GetTempPath(), "rafiq_atomic_test_" + Guid.NewGuid().ToString("N") + ".db");
            try
            {
                string connStr = string.Format("Data Source={0};Version=3;Journal Mode=WAL;", tempDbPath);
                using (var conn = new RafiqPOS.Data.SQLiteConnection(connStr))
                {
                    conn.Open();
                    using (var cmd = conn.CreateCommand())
                    {
                        cmd.CommandText = "CREATE TABLE test_items (id TEXT PRIMARY KEY, price INTEGER);";
                        cmd.ExecuteNonQuery();
                    }
                    using (var trans = conn.BeginTransaction())
                    {
                        for (int i = 1; i <= itemCount; i++)
                        {
                            using (var insCmd = conn.CreateCommand())
                            {
                                insCmd.Transaction = trans;
                                insCmd.CommandText = "INSERT INTO test_items VALUES (@id, @price);";
                                insCmd.Parameters.AddWithValue("@id", "item_" + i);
                                insCmd.Parameters.AddWithValue("@price", i * 1500);
                                insCmd.ExecuteNonQuery();
                            }
                        }
                        trans.Commit();
                    }
                }
                return new TransactionResult(true, string.Format("تم اختبار المعاملة الذرية بنجاح لـ {0} أصناف في بيئة معزولة.", itemCount));
            }
            catch (Exception ex)
            {
                return new TransactionResult(false, "فشلت المعاملة وتم التراجع التلقائي: " + ex.Message);
            }
            finally
            {
                try
                {
                    if (File.Exists(tempDbPath)) File.Delete(tempDbPath);
                }
                catch { }
            }
        }

        public static FactoryResetResult FactoryReset()
        {
            var result = new FactoryResetResult();
            if (string.IsNullOrEmpty(_connectionString))
            {
                result.Success = false;
                result.Message = "قاعدة البيانات غير مهيأة.";
                return result;
            }

            RafiqPOS.Models.UserDto resetActor = SecurityService.CurrentUser;
            string preResetBackupName = "";

            using (var conn = new RafiqPOS.Data.SQLiteConnection(_connectionString))
            {
                conn.Open();

                // An open shift holds cash that the wipe would erase, so the cashier must close it first
                if (TableExists(conn, null, "shifts"))
                {
                    long openShifts;
                    using (var shiftCmd = new RafiqPOS.Data.SQLiteCommand("SELECT COUNT(*) FROM shifts WHERE status = 'open';", conn))
                    {
                        openShifts = Convert.ToInt64(shiftCmd.ExecuteScalar());
                    }
                    if (openShifts > 0)
                    {
                        result.Success = false;
                        result.Message = "تم إيقاف التصفير: توجد وردية مفتوحة. أغلق الوردية واعتمد إقفال اليوم أولاً ثم أعد المحاولة.";
                        return result;
                    }
                }

                // Mandatory verified safety backup before wiping; without it nothing is deleted
                BackupResult preResetBackup = null;
                if (Backup != null)
                {
                    try
                    {
                        preResetBackup = Backup.CreateBackup(null);
                    }
                    catch (Exception bEx)
                    {
                        Logger.Error("فشل أخذ نسخة احتياطية قبل تصفير البيانات", bEx);
                    }
                }
                if (preResetBackup == null || !preResetBackup.Success || !preResetBackup.IsVerified)
                {
                    result.Success = false;
                    result.Message = "تم إيقاف التصفير: تعذر أخذ نسخة احتياطية موثقة من البيانات الحالية أولاً، ولم يُحذف شيء.";
                    return result;
                }
                preResetBackupName = Path.GetFileName(preResetBackup.BackupFilePath ?? "");

                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        result.DeletedSalesCount = (int)CountRowsIfTableExists(conn, trans, "sales");
                        result.DeletedCustomersCount = (int)CountRowsIfTableExists(conn, trans, "customers");
                        result.DeletedProductsCount = (int)CountRowsIfTableExists(conn, trans, "products");

                        // Temporarily drop delete prevention triggers to allow complete factory reset
                        using (var dropTrgCmd = new RafiqPOS.Data.SQLiteCommand(@"
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
                            "sale_item_modifiers", "delivery_orders",
                            "sale_item_batch_allocations", "debt_allocations", "sale_prescriptions",
                            "controlled_dispenses", "insurance_claim_lines", "insurance_claim_batches",
                            "insurance_exclusions", "insurance_members", "insurance_contracts", "insurance_companies",

                            // 2. Patient profiles, chronic medications, prescriptions
                            "chronic_medications", "customer_patient_info", "prescriptions",

                            // 2.b Cafe & Restaurant tables, modifiers, delivery, recipes
                            "restaurant_tables", "product_modifier_groups", "modifier_options", "modifier_groups",
                            "delivery_riders", "delivery_zones",
                            "production_batches", "recipe_ingredients", "recipes",

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
                        using (var recTrgCmd = new RafiqPOS.Data.SQLiteCommand(@"
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

                        // 4. Reset sequence counters, wipe all app settings, and restore factory users
                        // Licence state (activation, clock guard, used offline codes, transfer data) survives a data reset, so a wipe never un-licenses the shop or re-opens used codes
                        using (var cmd = new RafiqPOS.Data.SQLiteCommand(@"
                            DELETE FROM counters;
                            DELETE FROM app_settings
                            WHERE key NOT LIKE 'license_%'
                              AND key NOT LIKE 'transfer_%'
                              AND key NOT IN ('consumed_offline_codes', 'last_known_utc', 'last_online_verify_at', 'last_online_verify_attempt');
                        ", conn, trans))
                        {
                            cmd.ExecuteNonQuery();
                        }

                        if (TableExists(conn, trans, "sqlite_sequence"))
                        {
                            using (var seqCmd = new RafiqPOS.Data.SQLiteCommand("DELETE FROM sqlite_sequence WHERE name IN ('sales', 'customers', 'products', 'held_sales');", conn, trans))
                            {
                                seqCmd.ExecuteNonQuery();
                            }
                        }

                        SecurityService.ResetUsersToFactoryDefaults(conn, trans);

                        // 5. Reset audit logs with genesis reset entry (temporarily authorized to bypass tamper trigger)
                        using (var authCmd = new RafiqPOS.Data.SQLiteCommand("INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('allow_audit_reset', 'CONFIRM_PURGE_AUTHORIZED', datetime('now'));", conn, trans))
                        {
                            authCmd.ExecuteNonQuery();
                        }

                        using (var cmd = new RafiqPOS.Data.SQLiteCommand("DELETE FROM audit_logs;", conn, trans))
                        {
                            cmd.ExecuteNonQuery();
                        }

                        using (var cleanCmd = new RafiqPOS.Data.SQLiteCommand("DELETE FROM app_settings WHERE key = 'allow_audit_reset';", conn, trans))
                        {
                            cleanCmd.ExecuteNonQuery();
                        }

                        string genesisHash = "GENESIS_RAFIQ_AUDIT_V1";
                        string resetLogId = "aud_" + Guid.NewGuid().ToString("N");
                        string nowIso = DateTime.UtcNow.ToString("o");
                        string detailsJson = Newtonsoft.Json.JsonConvert.SerializeObject(new
                        {
                            action = "factory_reset",
                            message = "تم تصفير ومسح كافة بيانات النظام والبدء من جديد",
                            performedBy = resetActor != null ? resetActor.Username : "غير معروف",
                            safetyBackup = preResetBackupName
                        });
                        string recordHash = MigrationRunner.ComputeAuditHash(
                            genesisHash, resetLogId, "usr_admin_default", "factory_reset", "system", "all", detailsJson, nowIso
                        );

                        using (var cmd = new RafiqPOS.Data.SQLiteCommand(@"
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
                        using (var cmd = new RafiqPOS.Data.SQLiteCommand(@"
                            DELETE FROM customer_ledger WHERE customer_id = 'cust_general_cash';
                            DELETE FROM customers WHERE id = 'cust_general_cash';
                        ", conn, trans))
                        {
                            cmd.ExecuteNonQuery();
                        }

                        trans.Commit();
                        result.Success = true;
                        result.SafetyBackupFile = preResetBackupName;
                        result.Message = "تم مسح وتصفير كافة البيانات بنجاح، والنظام جاهز الآن كبداية نظيفة كلياً. النسخة الاحتياطية التي أُخذت قبل التصفير محفوظة على الجهاز.";
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
                    using (var vacCmd = new RafiqPOS.Data.SQLiteCommand("VACUUM;", conn))
                    {
                        vacCmd.ExecuteNonQuery();
                    }
                }
                catch { }
            }

            if (result.Success)
            {
                // No old store data may survive a reset: the sealed pre-encryption copy and the encryption marker/state files go too
                string[] notRemoved = DatabaseEncryptionService.PurgeEncryptionArtifacts(_dbPath);
                if (notRemoved.Length > 0)
                {
                    result.Message += " تنبيه: تعذر حذف " + notRemoved.Length + " ملف من ملفات التشفير القديمة، احذفها يدوياً من مجلد البيانات: " + string.Join("، ", Array.ConvertAll(notRemoved, delegate(string f) { return Path.GetFileName(f); }));
                }
            }

            return result;
        }

        private static bool TableExists(RafiqPOS.Data.SQLiteConnection conn, RafiqPOS.Data.SQLiteTransaction trans, string tableName)
        {
            using (var cmd = new RafiqPOS.Data.SQLiteCommand("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = @name;", conn, trans))
            {
                cmd.Parameters.AddWithValue("@name", tableName);
                return Convert.ToInt64(cmd.ExecuteScalar()) > 0;
            }
        }

        private static long CountRowsIfTableExists(RafiqPOS.Data.SQLiteConnection conn, RafiqPOS.Data.SQLiteTransaction trans, string tableName)
        {
            if (!TableExists(conn, trans, tableName)) return 0;
            // tableName comes only from the hard-coded list above, never from user input
            using (var cmd = new RafiqPOS.Data.SQLiteCommand("SELECT COUNT(*) FROM " + tableName + ";", conn, trans))
            {
                return Convert.ToInt64(cmd.ExecuteScalar());
            }
        }

        private static void DeleteAllIfTableExists(RafiqPOS.Data.SQLiteConnection conn, RafiqPOS.Data.SQLiteTransaction trans, string tableName)
        {
            if (!TableExists(conn, trans, tableName)) return;
            using (var cmd = new RafiqPOS.Data.SQLiteCommand("DELETE FROM " + tableName + ";", conn, trans))
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
