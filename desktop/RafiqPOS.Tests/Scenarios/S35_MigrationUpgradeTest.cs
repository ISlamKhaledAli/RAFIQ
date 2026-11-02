using System;
using System.Collections.Generic;
using System.Data.SQLite;
using NUnit.Framework;
using RafiqPOS.Database;
using RafiqPOS.Models;

namespace RafiqPOS.Tests.Scenarios
{
    /// <summary>
    /// ترقية قاعدة بيانات فعلية مليئة بالبيانات من إصدار هيكل 59 إلى الأحدث (هجرات 60 و61):
    /// لا فشل، لا فقد بيانات، وتحويل كميات سجل أدوية الجدول القديمة لوحدة الأساس عندما يكون التحويل حتمياً.
    /// </summary>
    [TestFixture]
    [NonParallelizable]
    public class S35_MigrationUpgradeTest : TestBase
    {
        private static readonly string[] KeyedTables = new string[]
        {
            "returns", "customer_ledger", "expenses", "cash_drawer_transactions", "epay_transactions", "epay_terminal_fundings"
        };

        private long Scalar(string sql, params object[] nameValuePairs)
        {
            using (var conn = new SQLiteConnection(ConnectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    for (int i = 0; i + 1 < nameValuePairs.Length; i += 2)
                    {
                        cmd.Parameters.AddWithValue((string)nameValuePairs[i], nameValuePairs[i + 1]);
                    }
                    object val = cmd.ExecuteScalar();
                    return val == null || val == DBNull.Value ? 0 : Convert.ToInt64(val);
                }
            }
        }

        private void Execute(string sql, params object[] nameValuePairs)
        {
            using (var conn = new SQLiteConnection(ConnectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    for (int i = 0; i + 1 < nameValuePairs.Length; i += 2)
                    {
                        cmd.Parameters.AddWithValue((string)nameValuePairs[i], nameValuePairs[i + 1]);
                    }
                    cmd.ExecuteNonQuery();
                }
            }
        }

        private string Sell(Product product, params int[] lineFactors)
        {
            var items = new List<SaleItem>();
            long total = 0;
            for (int i = 0; i < lineFactors.Length; i++)
            {
                long price = 1000L * lineFactors[i];
                items.Add(new SaleItem { ProductId = product.Id, ProductName = product.Name, QuantityMilli = 1000, ConversionFactor = lineFactors[i], UnitPricePiasters = price, TotalPiasters = price, UnitCostPiasters = 500L * lineFactors[i] });
                total += price;
            }
            return SaleRepo.CreateSaleAtomic(new Sale { SubtotalPiasters = total, TotalPiasters = total, PaidPiasters = total, PaymentMethod = "cash", Status = "completed", Items = items }).Id;
        }

        private void InsertLegacyDispense(string saleId, string productId, long quantityMilli)
        {
            Execute(@"INSERT INTO controlled_dispenses (id, sale_id, sale_item_id, product_id, quantity_milli, patient_name, doctor_name, prescription_date, entry_type, dispensed_by, created_at)
                      VALUES (@id, @s, NULL, @p, @q, 'مريض قديم', 'طبيب', '2026-01-01', 'dispense', 'usr_cashier_1', '2026-01-01 10:00:00');",
                "@id", "cd_legacy_" + Guid.NewGuid().ToString("N"), "@s", (object)saleId ?? DBNull.Value, "@p", productId, "@q", quantityMilli);
        }

        private void DowngradeToVersion59()
        {
            for (int i = 0; i < KeyedTables.Length; i++)
            {
                Execute("DROP INDEX IF EXISTS idx_" + KeyedTables[i] + "_idempotency;");
                Execute("ALTER TABLE " + KeyedTables[i] + " DROP COLUMN idempotency_fingerprint;");
                Execute("ALTER TABLE " + KeyedTables[i] + " DROP COLUMN idempotency_key;");
            }
            Execute("ALTER TABLE sale_items DROP COLUMN stock_deducted;");
            Execute("ALTER TABLE controlled_dispenses DROP COLUMN quantity_unit;");
            Execute("DELETE FROM schema_migrations WHERE version >= 60;");
        }

        [Test]
        public void PopulatedVersion59Database_UpgradesToLatest_WithoutDataLoss()
        {
            // 1. A store with real activity, written by the current code
            var drug = CreateTestProduct("ترامادول", 300, 200, 1000000);
            var customer = CreateTestCustomer("عميل قديم", 100000, 20000);
            string boxSale = Sell(drug, 10);
            string mixedSale = Sell(drug, 1, 10);
            CustomerRepo.RecordPayment(customer.Id, 5000, "سداد قديم", null, "cash", null, "pay_old_1");
            ExpenseRepo.Insert(new Expense { AmountPiasters = 700, Category = "نثريات", Source = "safe", CreatedBy = "الكاشير" });
            ExpenseRepo.Insert(new Expense { AmountPiasters = 700, Category = "نثريات", Source = "safe", CreatedBy = "الكاشير", Notes = null });

            // 2. Back to the version-59 shape (no 60/61 columns or indexes), plus rows only older releases wrote
            DowngradeToVersion59();
            Assert.AreEqual(59, Scalar("SELECT MAX(version) FROM schema_migrations;"));
            InsertLegacyDispense(boxSale, drug.Id, 1000);    // one box stored as 1 (sale unit)
            InsertLegacyDispense(mixedSale, drug.Id, 1000);  // tablets and boxes in one sale: factor unknown
            InsertLegacyDispense(null, drug.Id, 3000);       // manual register entry (already base units)

            long sales = Scalar("SELECT COUNT(*) FROM sales;");
            long saleItems = Scalar("SELECT COUNT(*) FROM sale_items;");
            long ledger = Scalar("SELECT COUNT(*) FROM customer_ledger;");
            long expenses = Scalar("SELECT COUNT(*) FROM expenses;");
            long balance = Scalar("SELECT balance_piasters FROM customers WHERE id = @c;", "@c", customer.Id);

            // 3. Upgrade
            Assert.DoesNotThrow(() => MigrationRunner.ApplyMigrations(ConnectionString, TestDbPath));

            Assert.AreEqual(MigrationRunner.LATEST_SUPPORTED_VERSION, Scalar("SELECT MAX(version) FROM schema_migrations;"));
            Assert.AreEqual(sales, Scalar("SELECT COUNT(*) FROM sales;"));
            Assert.AreEqual(saleItems, Scalar("SELECT COUNT(*) FROM sale_items;"));
            Assert.AreEqual(ledger, Scalar("SELECT COUNT(*) FROM customer_ledger;"));
            Assert.AreEqual(expenses, Scalar("SELECT COUNT(*) FROM expenses;"), "المصروفات المتطابقة والقيم الفارغة تبقى كما هي");
            Assert.AreEqual(balance, Scalar("SELECT balance_piasters FROM customers WHERE id = @c;", "@c", customer.Id));
            Assert.AreEqual(saleItems, Scalar("SELECT COUNT(*) FROM sale_items WHERE stock_deducted IS NULL;"), "أسطر البيع القديمة تبقى بدون علم (يُحكم عليها من حركات المخزون)");

            Assert.AreEqual(10000, Scalar("SELECT quantity_milli FROM controlled_dispenses WHERE sale_id = @s AND quantity_unit = 'base';", "@s", boxSale), "علبة قديمة = 10 أقراص");
            Assert.AreEqual(1000, Scalar("SELECT quantity_milli FROM controlled_dispenses WHERE sale_id = @s AND quantity_unit = 'legacy_sale_unit';", "@s", mixedSale), "غير الحتمي يُعلَّم ولا يُغيَّر");
            Assert.AreEqual(3000, Scalar("SELECT quantity_milli FROM controlled_dispenses WHERE sale_id IS NULL AND quantity_unit = 'base';"));

            for (int i = 0; i < KeyedTables.Length; i++)
            {
                Assert.AreEqual(1, Scalar("SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name = @n;", "@n", "idx_" + KeyedTables[i] + "_idempotency"),
                    "فهرس منع التكرار موجود: " + KeyedTables[i]);
            }

            // 4. Running again on an already-upgraded database is a no-op
            Assert.DoesNotThrow(() => MigrationRunner.ApplyMigrations(ConnectionString, TestDbPath));
            Assert.AreEqual(10000, Scalar("SELECT quantity_milli FROM controlled_dispenses WHERE sale_id = @s;", "@s", boxSale), "لا تحويل مزدوج");
        }

        [Test]
        public void SchemaHealth_RepairsMissingStep3BColumns_OnStartup()
        {
            Execute("DROP INDEX IF EXISTS idx_cash_drawer_transactions_idempotency;");
            Execute("ALTER TABLE cash_drawer_transactions DROP COLUMN idempotency_fingerprint;");
            Execute("ALTER TABLE cash_drawer_transactions DROP COLUMN idempotency_key;");

            MigrationRunner.ApplyMigrations(ConnectionString, TestDbPath);

            Assert.AreEqual(1, Scalar("SELECT COUNT(*) FROM pragma_table_info('cash_drawer_transactions') WHERE name = 'idempotency_fingerprint';"));
            Assert.AreEqual(1, Scalar("SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name = 'idx_cash_drawer_transactions_idempotency';"));
        }
    }
}
