using System;
using System.IO;
using System.Data.SQLite;

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

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();

                // Enable Write-Ahead Logging (WAL) for Power-Cut resilience
                using (var cmd = new SQLiteCommand("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;", conn))
                {
                    cmd.ExecuteNonQuery();
                }

                // Initial tables for Spike / Milestone 0 & 1
                string initSql = @"
                    CREATE TABLE IF NOT EXISTS schema_migrations (
                        version INTEGER PRIMARY KEY,
                        applied_at TEXT NOT NULL
                    );

                    CREATE TABLE IF NOT EXISTS products (
                        id TEXT PRIMARY KEY,
                        name TEXT NOT NULL,
                        barcode TEXT UNIQUE,
                        price_piasters INTEGER NOT NULL,
                        cost_piasters INTEGER NOT NULL,
                        stock_quantity INTEGER NOT NULL DEFAULT 0,
                        created_at TEXT NOT NULL
                    );

                    CREATE TABLE IF NOT EXISTS sales (
                        id TEXT PRIMARY KEY,
                        invoice_number INTEGER NOT NULL,
                        total_piasters INTEGER NOT NULL,
                        paid_piasters INTEGER NOT NULL,
                        created_at TEXT NOT NULL
                    );

                    CREATE TABLE IF NOT EXISTS sale_items (
                        id TEXT PRIMARY KEY,
                        sale_id TEXT NOT NULL,
                        product_id TEXT NOT NULL,
                        quantity INTEGER NOT NULL,
                        unit_price_piasters INTEGER NOT NULL,
                        FOREIGN KEY (sale_id) REFERENCES sales(id)
                    );
                ";

                using (var cmd = new SQLiteCommand(initSql, conn))
                {
                    cmd.ExecuteNonQuery();
                }
            }
        }

        public static string GetStatus()
        {
            return string.Format("SQLite 3 Connected [File: {0}, WAL Mode Active]", Path.GetFileName(_dbPath));
        }

        public static TransactionResult ExecuteAtomicSaleTransaction(int itemCount)
        {
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        string saleId = Guid.NewGuid().ToString();
                        long totalPiasters = 0;

                        // Insert test sale items in single transaction
                        for (int i = 1; i <= itemCount; i++)
                        {
                            long price = i * 1500; // e.g. 15.00 LE in piasters
                            totalPiasters += price;

                            string insertItem = @"
                                INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price_piasters)
                                VALUES (@id, @sale_id, @product_id, @qty, @price);
                            ";
                            using (var cmd = new SQLiteCommand(insertItem, conn, trans))
                            {
                                cmd.Parameters.AddWithValue("@id", Guid.NewGuid().ToString());
                                cmd.Parameters.AddWithValue("@sale_id", saleId);
                                cmd.Parameters.AddWithValue("@product_id", string.Format("PROD-{0:000}", i));
                                cmd.Parameters.AddWithValue("@qty", 1000); // 1000 milli-units / 1 piece
                                cmd.Parameters.AddWithValue("@price", price);
                                cmd.ExecuteNonQuery();
                            }
                        }

                        // Insert sale master
                        string insertSale = @"
                            INSERT INTO sales (id, invoice_number, total_piasters, paid_piasters, created_at)
                            VALUES (@id, (SELECT COALESCE(MAX(invoice_number), 0) + 1 FROM sales), @total, @paid, @time);
                        ";
                        using (var cmd = new SQLiteCommand(insertSale, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@id", saleId);
                            cmd.Parameters.AddWithValue("@total", totalPiasters);
                            cmd.Parameters.AddWithValue("@paid", totalPiasters);
                            cmd.Parameters.AddWithValue("@time", DateTime.UtcNow.ToString("o"));
                            cmd.ExecuteNonQuery();
                        }

                        // Commit atomically!
                        trans.Commit();
                        double totalPounds = totalPiasters / 100.0;
                        string msg = string.Format("تم حفظ فاتورة بيع تحتوي على {0} أصناف بنجاح بإجمالي {1:N2} جنيه في معاملة ذرية واحدة (ACID).", itemCount, totalPounds);
                        return new TransactionResult(true, msg);
                    }
                    catch (Exception ex)
                    {
                        trans.Rollback();
                        return new TransactionResult(false, "فشلت المعاملة وتم التراجع التلقائي (Rollback): " + ex.Message);
                    }
                }
            }
        }
    }
}
