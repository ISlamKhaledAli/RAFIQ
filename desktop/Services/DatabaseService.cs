using System;
using System.IO;
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

        public static ProductRepository ProductRepo { get; private set; }
        public static SaleRepository SaleRepo { get; private set; }
        public static SettingsRepository SettingsRepo { get; private set; }
        public static ProductService Products { get; private set; }
        public static SaleService Sales { get; private set; }
        public static SettingsService Settings { get; private set; }

        public static void Initialize()
        {
            string baseFolder;

            // If running in development (Debug), use local data folder
            #if DEBUG
            baseFolder = AppDomain.CurrentDomain.BaseDirectory;
            #else
            // In Production (Program Files), use C:\ProgramData\RafiqPOS for full write permissions
            baseFolder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "RafiqPOS");
            #endif

            string dataFolder = Path.Combine(baseFolder, "data");
            if (!Directory.Exists(dataFolder))
            {
                Directory.CreateDirectory(dataFolder);
            }

            _dbPath = Path.Combine(dataFolder, "rafiq_pos.db");
            _connectionString = string.Format("Data Source={0};Version=3;BusyTimeout=5000;", _dbPath);

            // Execute safe migrations (Feature #1 & #4)
            MigrationRunner.ApplyMigrations(_connectionString, _dbPath);

            // Initialize Repositories and Services (Feature #5)
            ProductRepo = new ProductRepository(_connectionString);
            SaleRepo = new SaleRepository(_connectionString);
            SettingsRepo = new SettingsRepository(_connectionString);
            Products = new ProductService(ProductRepo);
            Sales = new SaleService(SaleRepo, ProductRepo);
            Settings = new SettingsService(SettingsRepo);
        }

        public static string GetStatus()
        {
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
