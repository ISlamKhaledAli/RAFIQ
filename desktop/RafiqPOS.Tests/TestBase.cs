using System;
using System.IO;
using System.Data.SQLite;
using NUnit.Framework;
using RafiqPOS.Common;
using RafiqPOS.Database;
using RafiqPOS.Models;
using RafiqPOS.Repositories;
using RafiqPOS.Services;

namespace RafiqPOS.Tests
{
    [TestFixture]
    public abstract class TestBase
    {
        protected string TestDbPath;
        protected string ConnectionString;

        // Repositories
        protected CounterRepository CounterRepo;
        protected AuditLogRepository AuditRepo;
        protected SettingsRepository SettingsRepo;
        protected ProductRepository ProductRepo;
        protected ProductPriceHistoryRepository PriceHistoryRepo;
        protected StockMovementRepository StockMovementRepo;
        protected CustomerRepository CustomerRepo;
        protected SupplierRepository SupplierRepo;
        protected SaleRepository SaleRepo;
        protected ReturnRepository ReturnRepo;
        protected HeldSaleRepository HeldRepo;
        protected ShiftRepository ShiftRepo;
        protected DailyClosingRepository DailyClosingRepo;
        protected ExpenseRepository ExpenseRepo;
        protected UserRepository UserRepo;
        protected EpayRepository EpayRepo;
        protected DigitalAccountRepository DigitalAccountRepo;
        protected TableRepository TableRepo;
        protected ModifierRepository ModifierRepo;
        protected DeliveryRepository DeliveryRepo;
        protected RecipeRepository RecipeRepo;

        // Services
        protected ProductService ProductService;
        protected CustomerService CustomerService;
        protected SaleService SaleService;
        protected ReturnService ReturnService;
        protected DailyClosingService DailyClosingService;
        protected ShiftService ShiftService;
        protected CashDrawerService CashDrawerService;
        protected ExpenseService ExpenseService;
        protected SecurityService SecurityService;
        protected EncryptionService EncryptionService;
        protected BackupService BackupService;
        protected TableManagementService TableManagementService;
        protected ModifierService ModifierService;
        protected DeliveryService DeliveryService;
        protected RecipeService RecipeService;

        [SetUp]
        public virtual void BaseSetUp()
        {
            TestDbPath = Path.Combine(Path.GetTempPath(), "rafiq_nunit_" + Guid.NewGuid().ToString("N") + ".db");
            ConnectionString = string.Format("Data Source={0};Version=3;BusyTimeout=5000;", TestDbPath);

            // Apply all migrations on isolated SQLite database (1 to LATEST_SUPPORTED_VERSION)
            MigrationRunner.ApplyMigrations(ConnectionString, TestDbPath);

            // Initialize Repositories
            CounterRepo = new CounterRepository(ConnectionString);
            AuditRepo = new AuditLogRepository(ConnectionString);
            SettingsRepo = new SettingsRepository(ConnectionString);
            DailyClosingRepo = new DailyClosingRepository(ConnectionString);
            DailyClosingService = new DailyClosingService(ConnectionString, DailyClosingRepo, CounterRepo, AuditRepo, SettingsRepo);

            ProductRepo = new ProductRepository(ConnectionString, AuditRepo);
            PriceHistoryRepo = new ProductPriceHistoryRepository(ConnectionString);
            StockMovementRepo = new StockMovementRepository(ConnectionString);
            ProductService = new ProductService(ProductRepo, AuditRepo, PriceHistoryRepo, StockMovementRepo);

            CustomerRepo = new CustomerRepository(ConnectionString, AuditRepo);
            CustomerService = new CustomerService(CustomerRepo);

            SupplierRepo = new SupplierRepository(ConnectionString, AuditRepo);

            SaleRepo = new SaleRepository(ConnectionString, CounterRepo, AuditRepo);
            SaleService = new SaleService(SaleRepo, ProductRepo);

            ReturnRepo = new ReturnRepository(ConnectionString, CounterRepo, AuditRepo);
            ReturnService = new ReturnService(ReturnRepo, SaleRepo, DailyClosingService);

            HeldRepo = new HeldSaleRepository(ConnectionString);

            ShiftRepo = new ShiftRepository(ConnectionString);
            ShiftService = new ShiftService(ConnectionString, ShiftRepo, CounterRepo, AuditRepo, DailyClosingService);
            CashDrawerService = new CashDrawerService(ConnectionString, ShiftRepo, ShiftService, AuditRepo);

            ExpenseRepo = new ExpenseRepository(ConnectionString, AuditRepo, CounterRepo);
            ExpenseService = new ExpenseService(ExpenseRepo, DailyClosingService);

            UserRepo = new UserRepository(ConnectionString);
            SecurityService = new SecurityService(SettingsRepo, AuditRepo, UserRepo);
            DatabaseService.Security = SecurityService;

            EpayRepo = new EpayRepository(ConnectionString, AuditRepo);
            DigitalAccountRepo = new DigitalAccountRepository(ConnectionString, AuditRepo);

            EncryptionService = new EncryptionService();
            BackupService = new BackupService(ConnectionString, TestDbPath, SettingsRepo, AuditRepo, EncryptionService);

            TableRepo = new TableRepository(ConnectionString, AuditRepo);
            TableManagementService = new TableManagementService(TableRepo);
            DatabaseService.TableRepo = TableRepo;
            DatabaseService.Tables = TableManagementService;

            ModifierRepo = new ModifierRepository(ConnectionString);
            ModifierService = new ModifierService(ModifierRepo);
            DatabaseService.ModifierRepo = ModifierRepo;
            DatabaseService.Modifiers = ModifierService;

            DeliveryRepo = new DeliveryRepository(ConnectionString, AuditRepo);
            DeliveryService = new DeliveryService(DeliveryRepo);
            DatabaseService.DeliveryRepo = DeliveryRepo;
            DatabaseService.Delivery = DeliveryService;

            RecipeRepo = new RecipeRepository(ConnectionString, AuditRepo);
            RecipeService = new RecipeService(RecipeRepo);
            DatabaseService.RecipeRepo = RecipeRepo;
            DatabaseService.Recipes = RecipeService;

            // Set default business day cutoff if not configured (04:00 AM)
            SettingsRepo.Set("business_day_cutoff_time", "04:00");
        }

        [TearDown]
        public virtual void BaseTearDown()
        {
            try
            {
                DatabaseService.TableRepo = null;
                DatabaseService.Tables = null;
                DatabaseService.ModifierRepo = null;
                DatabaseService.Modifiers = null;
                DatabaseService.DeliveryRepo = null;
                DatabaseService.Delivery = null;
                DatabaseService.RecipeRepo = null;
                DatabaseService.Recipes = null;
                DatabaseService.Security = null;

                SQLiteConnection.ClearAllPools();
                GC.Collect();
                GC.WaitForPendingFinalizers();

                if (File.Exists(TestDbPath))
                {
                    File.Delete(TestDbPath);
                }
                string walFile = TestDbPath + "-wal";
                if (File.Exists(walFile)) File.Delete(walFile);
                string shmFile = TestDbPath + "-shm";
                if (File.Exists(shmFile)) File.Delete(shmFile);
            }
            catch
            {
                // Ignore transient cleanup locks in temp dir
            }
        }

        protected Product CreateTestProduct(string name, long pricePiasters, long costPiasters, long stockMilli, string barcode = null)
        {
            var p = new Product
            {
                Name = name,
                Barcode = barcode ?? ("BAR_" + Guid.NewGuid().ToString("N").Substring(0, 8)),
                PricePiasters = pricePiasters,
                CostPiasters = costPiasters,
                StockQuantityMilli = stockMilli,
                Unit = "piece",
                IsActive = true
            };
            return ProductService.SaveProduct(p, true, true);
        }

        protected Customer CreateTestCustomer(string name, long creditLimitPiasters = 0, long initialBalancePiasters = 0)
        {
            var c = new Customer
            {
                Name = name,
                Phone = "010" + Guid.NewGuid().ToString("N").Substring(0, 8),
                BalancePiasters = initialBalancePiasters,
                CreditLimitPiasters = creditLimitPiasters
            };
            return CustomerService.SaveCustomer(c);
        }

        protected Shift OpenTestShift(string cashierId = "usr_cashier_1", string cashierName = "كاشير 1", long startingCashPiasters = 50000)
        {
            var req = new OpenShiftRequest
            {
                PosRegisterId = "default_pos",
                CashierId = cashierId,
                CashierName = cashierName,
                OpeningFloatPiasters = startingCashPiasters
            };
            return ShiftService.OpenShift(req);
        }

        protected void SeedDefaultUsers()
        {
            if (UserRepo.GetByUsername("admin") == null)
            {
                UserRepo.Insert(new User
                {
                    Username = "admin",
                    DisplayName = "مدير النظام",
                    Role = "admin",
                    IsActive = true
                });
            }

            if (UserRepo.GetByUsername("cashier1") == null)
            {
                UserRepo.Insert(new User
                {
                    Username = "cashier1",
                    DisplayName = "كاشير وردية صباحية",
                    Role = "cashier",
                    IsActive = true
                });
            }
        }
    }
}
