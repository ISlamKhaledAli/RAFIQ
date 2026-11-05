using System;
using System.Collections.Generic;
using System.Data.SQLite;
using NUnit.Framework;
using RafiqPOS.Database;
using RafiqPOS.Models;
using RafiqPOS.Repositories;

namespace RafiqPOS.Tests.Scenarios
{
    /// <summary>
    /// ترقية قاعدة بيانات فعلية مليئة بالبيانات من إصدار هيكل 59 إلى الأحدث (هجرات 60 و61 و62):
    /// لا فشل، لا فقد بيانات، وتحويل كميات سجل أدوية الجدول القديمة لوحدة الأساس عندما يكون التحويل حتمياً.
    /// الهجرة 62 تضيف مفاتيح منع التكرار لفواتير الشراء ومرتجعاتها وحركات الموردين مع فهارس فريدة جزئية.
    /// </summary>
    [TestFixture]
    [NonParallelizable]
    public class S35_MigrationUpgradeTest : TestBase
    {
        private static readonly string[] KeyedTables = new string[]
        {
            "returns", "customer_ledger", "expenses", "cash_drawer_transactions", "epay_transactions", "epay_terminal_fundings"
        };

        // Migration 62 (Phase 1 money audit H1)
        private static readonly string[] PurchasingKeyedTables = new string[]
        {
            "purchases", "purchase_returns", "supplier_transactions"
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

        private void DropPurchasingIdempotency()
        {
            for (int i = 0; i < PurchasingKeyedTables.Length; i++)
            {
                Execute("DROP INDEX IF EXISTS idx_" + PurchasingKeyedTables[i] + "_idempotency;");
                Execute("ALTER TABLE " + PurchasingKeyedTables[i] + " DROP COLUMN idempotency_fingerprint;");
                Execute("ALTER TABLE " + PurchasingKeyedTables[i] + " DROP COLUMN idempotency_key;");
            }
        }

        private void DropUserDeletedAt()
        {
            // Migration 63 (employee soft delete): the index must go first, SQLite refuses to drop an indexed column
            Execute("DROP INDEX IF EXISTS idx_users_deleted_at;");
            Execute("ALTER TABLE users DROP COLUMN deleted_at;");
        }

        private void DowngradeToVersion59()
        {
            for (int i = 0; i < KeyedTables.Length; i++)
            {
                Execute("DROP INDEX IF EXISTS idx_" + KeyedTables[i] + "_idempotency;");
                Execute("ALTER TABLE " + KeyedTables[i] + " DROP COLUMN idempotency_fingerprint;");
                Execute("ALTER TABLE " + KeyedTables[i] + " DROP COLUMN idempotency_key;");
            }
            DropPurchasingIdempotency();
            DropUserDeletedAt();
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
            for (int i = 0; i < PurchasingKeyedTables.Length; i++)
            {
                Assert.AreEqual(1, Scalar("SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name = @n;", "@n", "idx_" + PurchasingKeyedTables[i] + "_idempotency"),
                    "فهرس منع التكرار (الهجرة 62) موجود: " + PurchasingKeyedTables[i]);
            }

            // 4. Running again on an already-upgraded database is a no-op
            Assert.DoesNotThrow(() => MigrationRunner.ApplyMigrations(ConnectionString, TestDbPath));
            Assert.AreEqual(10000, Scalar("SELECT quantity_milli FROM controlled_dispenses WHERE sale_id = @s;", "@s", boxSale), "لا تحويل مزدوج");

            // 5. The older downgrade also removed users.deleted_at (migration 63); the upgrade brings it back with its index
            Assert.AreEqual(1, Scalar("SELECT COUNT(*) FROM pragma_table_info('users') WHERE name = 'deleted_at';"), "عمود الحذف الناعم عاد بعد الترقية");
            Assert.AreEqual(1, Scalar("SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name = 'idx_users_deleted_at';"));
            Assert.AreEqual(1, Scalar("SELECT COUNT(*) FROM schema_migrations WHERE version = 63;"), "الهجرة 63 مسجلة مرة واحدة");
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

        private Purchase CreateLegacyPurchase(PurchaseRepository purchaseRepo, Supplier supplier, Product product)
        {
            return purchaseRepo.CreatePurchase(new Purchase
            {
                SupplierId = supplier.Id,
                PaidAmountPiasters = 0,
                Items = new List<PurchaseItem>
                {
                    new PurchaseItem { ProductId = product.Id, ProductName = product.Name, QuantityMilli = 2000, UnitCostPiasters = 1000 }
                }
            }, "LATEST");
        }

        [Test]
        public void Version61Database_UpgradesToLatest_WithPurchasingColumnsAndUniquePartialIndexes()
        {
            // 1. مشتريات حقيقية كتبها الإصدار السابق (بدون مفاتيح منع التكرار)
            var product = CreateTestProduct("صنف مشتريات قبل 62", 2000, 1000, 0);
            var supplier = SupplierRepo.Save(new Supplier { Name = "مورد قبل 62", IsActive = true });
            var purchaseRepo = new PurchaseRepository(ConnectionString, CounterRepo, SupplierRepo, PriceHistoryRepo, AuditRepo);
            var first = CreateLegacyPurchase(purchaseRepo, supplier, product);
            var second = CreateLegacyPurchase(purchaseRepo, supplier, product);

            // 2. العودة لشكل الإصدار 61
            DropPurchasingIdempotency();
            Execute("DELETE FROM schema_migrations WHERE version >= 62;");
            Assert.AreEqual(61, Scalar("SELECT MAX(version) FROM schema_migrations;"));
            for (int i = 0; i < PurchasingKeyedTables.Length; i++)
            {
                Assert.AreEqual(0, Scalar("SELECT COUNT(*) FROM pragma_table_info('" + PurchasingKeyedTables[i] + "') WHERE name LIKE 'idempotency%';"),
                    "لا أعمدة منع تكرار قبل الهجرة: " + PurchasingKeyedTables[i]);
            }
            long purchases = Scalar("SELECT COUNT(*) FROM purchases;");
            long supplierTransactions = Scalar("SELECT COUNT(*) FROM supplier_transactions;");
            long balance = Scalar("SELECT balance_piasters FROM suppliers WHERE id = @s;", "@s", supplier.Id);
            Assert.AreEqual(2, purchases);

            // 3. الترقية
            Assert.DoesNotThrow(() => MigrationRunner.ApplyMigrations(ConnectionString, TestDbPath));

            Assert.AreEqual(MigrationRunner.LATEST_SUPPORTED_VERSION, Scalar("SELECT MAX(version) FROM schema_migrations;"));
            Assert.GreaterOrEqual(Scalar("SELECT MAX(version) FROM schema_migrations;"), 62L, "الهجرة 62 مسجلة");
            Assert.AreEqual(1, Scalar("SELECT COUNT(*) FROM schema_migrations WHERE version = 62;"));
            for (int i = 0; i < PurchasingKeyedTables.Length; i++)
            {
                string table = PurchasingKeyedTables[i];
                Assert.AreEqual(1, Scalar("SELECT COUNT(*) FROM pragma_table_info('" + table + "') WHERE name = 'idempotency_key';"), "عمود المفتاح: " + table);
                Assert.AreEqual(1, Scalar("SELECT COUNT(*) FROM pragma_table_info('" + table + "') WHERE name = 'idempotency_fingerprint';"), "عمود البصمة: " + table);
                Assert.AreEqual(1, Scalar("SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name = @n AND sql LIKE '%UNIQUE%' AND sql LIKE '%WHERE%';", "@n", "idx_" + table + "_idempotency"),
                    "فهرس فريد جزئي: " + table);
            }

            // 4. لا فقد بيانات، والصفوف القديمة بدون مفتاح
            Assert.AreEqual(purchases, Scalar("SELECT COUNT(*) FROM purchases;"));
            Assert.AreEqual(supplierTransactions, Scalar("SELECT COUNT(*) FROM supplier_transactions;"));
            Assert.AreEqual(balance, Scalar("SELECT balance_piasters FROM suppliers WHERE id = @s;", "@s", supplier.Id));
            Assert.AreEqual(purchases, Scalar("SELECT COUNT(*) FROM purchases WHERE idempotency_key IS NULL;"), "الفواتير القديمة بدون مفتاح");

            // 5. الفهرس فريد للمفاتيح الحقيقية فقط
            Execute("UPDATE purchases SET idempotency_key = 'dup_key' WHERE id = @id;", "@id", first.Id);
            Assert.Throws<SQLiteException>(delegate { Execute("UPDATE purchases SET idempotency_key = 'dup_key' WHERE id = @id;", "@id", second.Id); }, "مفتاح مكرر يُرفض");
            Assert.DoesNotThrow(delegate { Execute("UPDATE purchases SET idempotency_key = '';"); }, "المفتاح الفارغ لا يدخل الفهرس");

            // 6. إعادة التشغيل على قاعدة مرقاة لا تغيّر شيئاً
            Assert.DoesNotThrow(() => MigrationRunner.ApplyMigrations(ConnectionString, TestDbPath));
            Assert.AreEqual(purchases, Scalar("SELECT COUNT(*) FROM purchases;"));
            for (int i = 0; i < PurchasingKeyedTables.Length; i++)
            {
                Assert.AreEqual(1, Scalar("SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name = @n;", "@n", "idx_" + PurchasingKeyedTables[i] + "_idempotency"));
                Assert.AreEqual(1, Scalar("SELECT COUNT(*) FROM pragma_table_info('" + PurchasingKeyedTables[i] + "') WHERE name = 'idempotency_key';"));
            }
        }

        [Test]
        public void SchemaHealth_RepairsMissingPurchasingIdempotencyColumns_OnStartup()
        {
            DropPurchasingIdempotency();
            for (int i = 0; i < PurchasingKeyedTables.Length; i++)
            {
                Assert.AreEqual(0, Scalar("SELECT COUNT(*) FROM pragma_table_info('" + PurchasingKeyedTables[i] + "') WHERE name LIKE 'idempotency%';"));
            }

            MigrationRunner.ApplyMigrations(ConnectionString, TestDbPath);

            for (int i = 0; i < PurchasingKeyedTables.Length; i++)
            {
                string table = PurchasingKeyedTables[i];
                Assert.AreEqual(1, Scalar("SELECT COUNT(*) FROM pragma_table_info('" + table + "') WHERE name = 'idempotency_key';"), table);
                Assert.AreEqual(1, Scalar("SELECT COUNT(*) FROM pragma_table_info('" + table + "') WHERE name = 'idempotency_fingerprint';"), table);
                Assert.AreEqual(1, Scalar("SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name = @n;", "@n", "idx_" + table + "_idempotency"), table);
            }
        }

        // ---------- Migration 63: employee soft delete (users.deleted_at) ----------

        [Test]
        public void Version62Database_UpgradesToLatest_WithSoftDeleteColumn_AndEveryExistingUserStaysLive()
        {
            // 1. A v62 store: owner, developer root, seeded cashier plus a manager and a cashier written by the previous release
            UserRepo.Insert(new User { Id = "usr_mig_mgr", Username = "mig_mgr", DisplayName = "مدير قبل 63", Role = "admin", IsActive = true, ParentId = "usr_admin_default", CanDelegate = true, MaxDepth = 1 });
            UserRepo.Insert(new User { Id = "usr_mig_cash", Username = "mig_cash", DisplayName = "كاشير قبل 63", Role = "cashier", IsActive = false, ParentId = "usr_mig_mgr" });
            long users = Scalar("SELECT COUNT(*) FROM users;");
            long activeUsers = Scalar("SELECT COUNT(*) FROM users WHERE is_active = 1;");
            Assert.GreaterOrEqual(users, 5L, "المالك والمطور والكاشير المبدئي والحسابان المضافان");

            // 2. Back to the version-62 shape
            DropUserDeletedAt();
            Execute("DELETE FROM schema_migrations WHERE version >= 63;");
            Assert.AreEqual(62, Scalar("SELECT MAX(version) FROM schema_migrations;"));
            Assert.AreEqual(0, Scalar("SELECT COUNT(*) FROM pragma_table_info('users') WHERE name = 'deleted_at';"), "لا عمود قبل الهجرة");
            Assert.AreEqual(0, Scalar("SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name = 'idx_users_deleted_at';"));

            // 3. Upgrade
            Assert.DoesNotThrow(() => MigrationRunner.ApplyMigrations(ConnectionString, TestDbPath));

            Assert.AreEqual(MigrationRunner.LATEST_SUPPORTED_VERSION, Scalar("SELECT MAX(version) FROM schema_migrations;"));
            Assert.GreaterOrEqual(Scalar("SELECT MAX(version) FROM schema_migrations;"), 63L, "الهجرة 63 مسجلة");
            Assert.AreEqual(1, Scalar("SELECT COUNT(*) FROM schema_migrations WHERE version = 63;"));
            Assert.AreEqual(1, Scalar("SELECT COUNT(*) FROM pragma_table_info('users') WHERE name = 'deleted_at';"), "عمود deleted_at أُضيف");
            Assert.AreEqual(1, Scalar("SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name = 'idx_users_deleted_at';"), "وفهرسه");

            // 4. No data loss: every user is still live (deleted_at NULL) and keeps its fields
            Assert.AreEqual(users, Scalar("SELECT COUNT(*) FROM users;"));
            Assert.AreEqual(0, Scalar("SELECT COUNT(*) FROM users WHERE deleted_at IS NOT NULL;"), "لا حساب يُعتبر محذوفاً بعد الترقية");
            Assert.AreEqual(users, UserRepo.GetAll(false).Count, "كل الحسابات ظاهرة للمستودع");
            Assert.AreEqual(activeUsers, Scalar("SELECT COUNT(*) FROM users WHERE is_active = 1;"));
            var manager = UserRepo.GetById("usr_mig_mgr");
            Assert.IsNotNull(manager);
            Assert.AreEqual("admin", manager.Role);
            Assert.AreEqual("usr_admin_default", manager.ParentId);
            Assert.IsFalse(UserRepo.GetById("usr_mig_cash").IsActive, "حالة التعطيل محفوظة");
            Assert.IsNotNull(UserRepo.GetByUsername("admin"));

            // 5. Re-running is idempotent, and it never resurrects or touches an account deleted after the upgrade
            Assert.IsTrue(UserRepo.SoftDelete("usr_mig_cash", null));
            Assert.DoesNotThrow(() => MigrationRunner.ApplyMigrations(ConnectionString, TestDbPath));
            Assert.DoesNotThrow(() => MigrationRunner.ApplyMigrations(ConnectionString, TestDbPath));
            Assert.AreEqual(1, Scalar("SELECT COUNT(*) FROM pragma_table_info('users') WHERE name = 'deleted_at';"), "عمود واحد فقط");
            Assert.AreEqual(1, Scalar("SELECT COUNT(*) FROM schema_migrations WHERE version = 63;"), "لا تسجيل مكرر");
            Assert.AreEqual(1, Scalar("SELECT COUNT(*) FROM users WHERE deleted_at IS NOT NULL;"), "الحذف الناعم يبقى بعد إعادة التشغيل");
            Assert.IsNull(UserRepo.GetById("usr_mig_cash"));
            Assert.AreEqual(users - 1, UserRepo.GetAll(false).Count);
        }

        [Test]
        public void SchemaHealth_RepairsMissingUsersDeletedAtColumn_OnStartup()
        {
            long users = Scalar("SELECT COUNT(*) FROM users;");
            DropUserDeletedAt();
            Assert.AreEqual(0, Scalar("SELECT COUNT(*) FROM pragma_table_info('users') WHERE name = 'deleted_at';"));

            // schema_migrations still says 63, so only the self-healing guard can bring the column back
            MigrationRunner.ApplyMigrations(ConnectionString, TestDbPath);

            Assert.AreEqual(1, Scalar("SELECT COUNT(*) FROM pragma_table_info('users') WHERE name = 'deleted_at';"));
            Assert.AreEqual(1, Scalar("SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name = 'idx_users_deleted_at';"));
            Assert.AreEqual(users, UserRepo.GetAll(false).Count, "الحسابات تعمل بعد الإصلاح الذاتي");
        }
    }
}
