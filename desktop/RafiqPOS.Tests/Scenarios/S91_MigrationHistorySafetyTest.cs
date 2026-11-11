using System;
using System.Data.SQLite;
using System.IO;
using NUnit.Framework;
using RafiqPOS.Database;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    /// <summary>
    /// سلامة الترحيلات: لا ترحيل يعيد كتابة فواتير تاريخية، ولا يُحذف عمود قديم بلا حاجة،
    /// وقاعدة أحدث من نسخة البرنامج تُرفض بنوع استثناء مخصص بدل أن تُلمس.
    /// </summary>
    [TestFixture]
    [NonParallelizable]
    public class S91_MigrationHistorySafetyTest : TestBase
    {
        private void Exec(string sql)
        {
            using (var conn = new SQLiteConnection(ConnectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.ExecuteNonQuery();
                }
            }
        }

        private long Scalar(string sql)
        {
            using (var conn = new SQLiteConnection(ConnectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    object val = cmd.ExecuteScalar();
                    return val == null || val == DBNull.Value ? 0 : Convert.ToInt64(val);
                }
            }
        }

        [Test]
        public void Migration66_NeverRewritesHistoricalSaleTax()
        {
            var product = CreateTestProduct("صنف ترحيل 66", 1000, 700, 100000);
            var sale = SaleRepo.CreateSaleAtomic(new Sale
            {
                SubtotalPiasters = 1000,
                TaxPiasters = 140,
                TotalPiasters = 1140,
                PaidPiasters = 1140,
                PaymentMethod = "cash",
                Status = "completed",
                Items = new System.Collections.Generic.List<SaleItem>
                {
                    new SaleItem { ProductId = product.Id, ProductName = product.Name, QuantityMilli = 1000, UnitPricePiasters = 1000, TotalPiasters = 1000, UnitCostPiasters = 700 }
                }
            });
            long taxBefore = Scalar("SELECT tax_piasters FROM sales WHERE id = '" + sale.Id + "';");
            Assert.Greater(taxBefore, 0L, "الفاتورة المحفوظة تحمل ضريبة");

            // Re-run migration 66 on a store whose taxes are switched off today: history must stay untouched
            SettingsRepo.Set("feature_taxes", "0");
            Exec("DELETE FROM schema_migrations WHERE version = 66;");
            MigrationRunner.ApplyMigrations(ConnectionString, TestDbPath);

            Assert.AreEqual(66L, Scalar("SELECT COALESCE(MAX(version), 0) FROM schema_migrations;"), "الترحيل سُجّل");
            Assert.AreEqual(taxBefore, Scalar("SELECT tax_piasters FROM sales WHERE id = '" + sale.Id + "';"), "ضريبة فاتورة تاريخية لا تُصفَّر");
        }

        [Test]
        public void SchemaHealth_KeepsHarmlessLegacySaleItemsQuantityColumn()
        {
            Exec("ALTER TABLE sale_items ADD COLUMN quantity INTEGER DEFAULT 7;");

            MigrationRunner.ApplyMigrations(ConnectionString, TestDbPath);

            Assert.AreEqual(1L, Scalar("SELECT COUNT(*) FROM pragma_table_info('sale_items') WHERE name = 'quantity';"),
                "عمود quantity القديم ذو القيمة الافتراضية لا يمنع الإدخال ولا يُحذف");
        }

        private string ScalarText(string sql)
        {
            using (var conn = new SQLiteConnection(ConnectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    object val = cmd.ExecuteScalar();
                    return val == null || val == DBNull.Value ? null : val.ToString();
                }
            }
        }

        // Re-creates sale_items the way a very old install had it: a NOT NULL quantity column with no default
        private void RebuildSaleItemsWithRequiredLegacyQuantity()
        {
            string sql = ScalarText("SELECT sql FROM sqlite_master WHERE type='table' AND name='sale_items';");
            int open = sql.IndexOf('(');
            string modified = sql.Substring(0, open + 1) + " quantity INTEGER NOT NULL, " + sql.Substring(open + 1);
            Exec("DROP TABLE sale_items;");
            Exec(modified);
        }

        // A real parent sale keeps the foreign key satisfied while the migration connection runs with foreign_keys = ON
        private string CreateParentSaleId()
        {
            var product = CreateTestProduct("صنف قديم", 1000, 500, 100000);
            var sale = SaleRepo.CreateSaleAtomic(new Sale
            {
                SubtotalPiasters = 1000,
                TotalPiasters = 1000,
                PaidPiasters = 1000,
                PaymentMethod = "cash",
                Status = "completed",
                Items = new System.Collections.Generic.List<SaleItem>
                {
                    new SaleItem { ProductId = product.Id, ProductName = product.Name, QuantityMilli = 1000, UnitPricePiasters = 1000, TotalPiasters = 1000, UnitCostPiasters = 500 }
                }
            });
            return sale.Id;
        }

        private void InsertLegacyItem(string saleId, string id, string quantityLiteral)
        {
            Exec("INSERT INTO sale_items (id, sale_id, product_id, product_name, quantity, quantity_milli, unit_price_piasters, unit_cost_piasters, total_piasters) " +
                 "VALUES ('" + id + "', '" + saleId + "', 'legacy_prod', 'legacy item', " + quantityLiteral + ", 0, 1000, 500, 3000);");
        }

        private int LegacyQuantityColumnCount()
        {
            return (int)Scalar("SELECT COUNT(*) FROM pragma_table_info('sale_items') WHERE name = 'quantity';");
        }

        [Test]
        public void BlockingLegacyQuantityColumn_IsBackedUp_BackfilledAndThenDropped()
        {
            string saleA = CreateParentSaleId();
            RebuildSaleItemsWithRequiredLegacyQuantity();
            InsertLegacyItem(saleA, "legacy_item_1", "3");
            Assert.AreEqual(1, LegacyQuantityColumnCount());

            MigrationRunner.ApplyMigrations(ConnectionString, TestDbPath);

            Assert.AreEqual(0, LegacyQuantityColumnCount(), "العمود القديم المانع للإدخال حُذف");
            Assert.AreEqual(3000L, Scalar("SELECT quantity_milli FROM sale_items WHERE id = 'legacy_item_1';"), "الكمية القديمة نُقلت إلى quantity_milli (x1000)");
            string backupDir = Path.Combine(Path.GetDirectoryName(TestDbPath), "migration_backups");
            Assert.Greater(Directory.GetFiles(backupDir, "pre_drop_sale_items_quantity_*.db").Length, 0, "نسخة أمان قبل الحذف");
            Assert.AreNotEqual("1", SettingsRepo.Get(MigrationRunner.SALE_ITEMS_QUANTITY_WARNING_KEY, "0"));
        }

        [Test]
        public void BlockingLegacyQuantityColumn_WithAnUnconvertibleRow_IsKept_AndAWarningFlagIsRaised()
        {
            string saleB = CreateParentSaleId();
            RebuildSaleItemsWithRequiredLegacyQuantity();
            // 0.0001 rounds to zero milli-units: dropping the column would lose this row's quantity
            InsertLegacyItem(saleB, "legacy_item_tiny", "0.0001");

            MigrationRunner.ApplyMigrations(ConnectionString, TestDbPath);

            Assert.AreEqual(1, LegacyQuantityColumnCount(), "العمود يبقى لأن حذفه يضيع كمية");
            Assert.AreEqual("1", SettingsRepo.Get(MigrationRunner.SALE_ITEMS_QUANTITY_WARNING_KEY, "0"), "تحذير دائم يظهر في فحص النظام");
        }

        [Test]
        public void TooNewDatabase_IsRefusedBeforeAnyPragmaOrDdlTouchesTheFile()
        {
            string path = Path.Combine(Path.GetTempPath(), "rafiq_toonew_" + Guid.NewGuid().ToString("N") + ".db");
            string cs = string.Format("Data Source={0};Version=3;", path);
            try
            {
                using (var conn = new SQLiteConnection(cs))
                {
                    conn.Open();
                    using (var cmd = new SQLiteCommand("CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT, applied_at TEXT NOT NULL);" +
                        "INSERT INTO schema_migrations (version, name, applied_at) VALUES (" + (MigrationRunner.LATEST_SUPPORTED_VERSION + 1) + ", 'future', 'x');", conn))
                    {
                        cmd.ExecuteNonQuery();
                    }
                }
                SQLiteConnection.ClearAllPools();

                Assert.Throws<DatabaseSchemaTooNewException>(delegate { MigrationRunner.ApplyMigrations(cs, path); });

                using (var conn = new SQLiteConnection(cs))
                {
                    conn.Open();
                    using (var cmd = new SQLiteCommand("PRAGMA journal_mode;", conn))
                    {
                        Assert.AreEqual("delete", Convert.ToString(cmd.ExecuteScalar()).ToLowerInvariant(), "لم يُحوَّل الملف إلى WAL");
                    }
                    using (var cmd = new SQLiteCommand("SELECT COUNT(*) FROM sqlite_master;", conn))
                    {
                        Assert.AreEqual(1L, Convert.ToInt64(cmd.ExecuteScalar()), "لم يُنشأ أي جدول جديد");
                    }
                }
            }
            finally
            {
                SQLiteConnection.ClearAllPools();
                string[] files = new string[] { path, path + "-wal", path + "-shm" };
                for (int i = 0; i < files.Length; i++)
                {
                    try { if (File.Exists(files[i])) File.Delete(files[i]); } catch (IOException) { }
                }
            }
        }

        [Test]
        public void DatabaseNewerThanThisApp_IsRejectedWithTypedException_AndLeftUntouched()
        {
            Exec("INSERT INTO schema_migrations (version, name, applied_at) VALUES (" + (MigrationRunner.LATEST_SUPPORTED_VERSION + 1) + ", 'future', datetime('now'));");

            var ex = Assert.Throws<DatabaseSchemaTooNewException>(delegate
            {
                MigrationRunner.ApplyMigrations(ConnectionString, TestDbPath);
            });
            StringAssert.Contains("تحديث", ex.Message);
            Assert.IsInstanceOf<InvalidOperationException>(ex);
            Assert.AreEqual((long)(MigrationRunner.LATEST_SUPPORTED_VERSION + 1), Scalar("SELECT MAX(version) FROM schema_migrations;"), "القاعدة لم تُعدَّل");
        }
    }
}
