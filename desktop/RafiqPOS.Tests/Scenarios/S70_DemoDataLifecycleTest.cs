using System;
using System.Collections.Generic;
using System.Data.SQLite;
using System.Reflection;
using NUnit.Framework;
using RafiqPOS.Bridge;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    /// <summary>
    /// دورة حياة البيانات التجريبية على محل حقيقي: التحميل يضيف أصنافاً وزبائن موسومة فقط (بدون فواتير أو ديون أو أرصدة)،
    /// يرفض التكرار وتعارض الباركود وكل نظام فيه فواتير حقيقية، والمسح يحذف السجلات التجريبية فقط بعد نسخة احتياطية موثقة
    /// ويُبقي ما استخدمته عملية حقيقية، وكل ذلك ذرّي (فشل وسط العملية يعيد كل شيء)، وبوابة IPC للمالك فقط.
    /// </summary>
    [TestFixture]
    [NonParallelizable]
    public class S70_DemoDataLifecycleTest : S44_UserHierarchyFixtureBase
    {
        private int _backupCalls;
        private BackupResult _backupAnswer;
        private bool _backupThrows;
        private DemoDataService _demo;

        private static readonly string[] AllStoreTypes = new string[]
        {
            "supermarket", "pharmacy", "clothing_apparel", "cafe_restaurant", "dairy_bakery", "accessories_gifts",
            "phones_electronics", "produce_butchery", "stationery_gifts", "spices_roastery", "toys_kids", "general_grocery"
        };

        [SetUp]
        public void DemoSetUp()
        {
            _backupCalls = 0;
            _backupThrows = false;
            _backupAnswer = new BackupResult { Success = true, IsVerified = true, BackupFilePath = "fake_backup.db" };
            _demo = new DemoDataService(ConnectionString, SettingsRepo, AuditRepo, delegate
            {
                _backupCalls++;
                if (_backupThrows)
                {
                    throw new InvalidOperationException("backup failure");
                }
                return _backupAnswer;
            });
        }

        // ---------- helpers ----------

        private static bool IsValidEan13(string code)
        {
            if (code == null || code.Length != 13)
            {
                return false;
            }
            int sum = 0;
            for (int i = 0; i < 12; i++)
            {
                if (!char.IsDigit(code[i]))
                {
                    return false;
                }
                int d = code[i] - '0';
                sum += (i % 2 == 0) ? d : d * 3;
            }
            int check = (10 - (sum % 10)) % 10;
            return code[12] - '0' == check;
        }

        private List<string> DemoBarcodes()
        {
            var list = new List<string>();
            using (var conn = new SQLiteConnection(ConnectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand("SELECT barcode FROM products WHERE id LIKE 'demo\\_%' ESCAPE '\\';", conn))
                using (var rd = cmd.ExecuteReader())
                {
                    while (rd.Read())
                    {
                        list.Add(rd.GetString(0));
                    }
                }
            }
            return list;
        }

        private void Execute(string sql)
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

        // A real invoice created by the normal repository path; the product id decides what it touches
        private Sale CreateRealSale(string productId, string productName, int invoiceNumber)
        {
            var sale = new Sale
            {
                Id = Guid.NewGuid().ToString("N"),
                InvoiceNumber = invoiceNumber,
                SubtotalPiasters = 4200,
                TotalPiasters = 4200,
                PaidPiasters = 4200,
                PaymentMethod = "cash",
                Status = "completed",
                CashierId = "usr_cashier_1",
                CreatedAt = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss")
            };
            sale.Items.Add(new SaleItem
            {
                Id = Guid.NewGuid().ToString("N"),
                SaleId = sale.Id,
                ProductId = productId,
                ProductName = productName,
                Barcode = "x",
                QuantityMilli = 1000,
                UnitPricePiasters = 4200,
                TotalPiasters = 4200
            });
            SaleRepo.CreateSaleAtomic(sale);
            return sale;
        }

        private LoadDemoDataResult LoadOk(string storeType)
        {
            var res = _demo.LoadDemoData(storeType, true);
            Assert.IsTrue(res.Success, res.Message);
            return res;
        }

        // ---------- load ----------

        [Test]
        public void Load_AddsOnlyMarkedRows_WithoutSalesDebtsOrWalletMoney()
        {
            long ledgerBefore = Scalar("SELECT COUNT(*) FROM customer_ledger;");
            long salesBefore = Scalar("SELECT COUNT(*) FROM sales;");

            var res = LoadOk("supermarket");

            Assert.AreEqual(8, res.ProductsAdded);
            Assert.AreEqual(2, res.CustomersAdded);
            Assert.AreEqual(0, res.ProductsSkipped);
            Assert.AreEqual(8, Scalar("SELECT COUNT(*) FROM products;"), "كل الأصناف المضافة موسومة demo_");
            Assert.AreEqual(8, Scalar("SELECT COUNT(*) FROM products WHERE id LIKE 'demo\\_prod\\_%' ESCAPE '\\';"));
            Assert.AreEqual(8, Scalar("SELECT COUNT(*) FROM stock_movements WHERE id LIKE 'demo\\_sm\\_%' ESCAPE '\\' AND reference_type = 'DEMO';"));
            Assert.AreEqual(8, Scalar("SELECT COUNT(*) FROM product_barcodes WHERE id LIKE 'demo\\_bcode\\_%' ESCAPE '\\';"));
            Assert.AreEqual(2, Scalar("SELECT COUNT(*) FROM customers WHERE id LIKE 'demo\\_cust\\_%' ESCAPE '\\' AND balance_piasters = 0;"));
            Assert.AreEqual(salesBefore, Scalar("SELECT COUNT(*) FROM sales;"), "لا فواتير تجريبية");
            Assert.AreEqual(ledgerBefore, Scalar("SELECT COUNT(*) FROM customer_ledger;"), "لا ديون ولا حركات حساب");
            Assert.AreEqual(0, Scalar("SELECT COUNT(*) FROM stock_movements WHERE id NOT LIKE 'demo\\_sm\\_%' ESCAPE '\\';"));
            Assert.AreEqual(0, Scalar("SELECT COUNT(*) FROM products WHERE typeof(price_piasters) <> 'integer' OR typeof(cost_piasters) <> 'integer' OR typeof(stock_quantity_milli) <> 'integer';"), "مبالغ وكميات صحيحة فقط");
            Assert.AreEqual(Scalar("SELECT SUM(stock_quantity_milli) FROM products;"), Scalar("SELECT SUM(quantity_milli) FROM stock_movements;"), "الرصيد الافتتاحي يطابق حركات المخزن");
            Assert.AreEqual(1, Scalar("SELECT COUNT(*) FROM audit_logs WHERE action = 'DEMO_DATA_LOADED';"), "قيد مراجعة للتحميل");
        }

        [Test]
        public void Load_BarcodesAreValidUniqueInStoreEan13_ForEveryStoreType()
        {
            for (int t = 0; t < AllStoreTypes.Length; t++)
            {
                LoadOk(AllStoreTypes[t]);
                List<string> codes = DemoBarcodes();
                Assert.IsTrue(codes.Count > 0, AllStoreTypes[t]);
                Assert.AreEqual(codes.Count, new HashSet<string>(codes).Count, "باركودات متكررة في " + AllStoreTypes[t]);
                for (int i = 0; i < codes.Count; i++)
                {
                    Assert.IsTrue(IsValidEan13(codes[i]), "EAN-13 غير صالح: " + codes[i]);
                    Assert.IsTrue(codes[i].StartsWith("299"), "بادئة الاستخدام الداخلي: " + codes[i]);
                }
                Assert.IsTrue(_demo.ClearDemoData().Success);
            }
        }

        [Test]
        public void Load_Twice_IsRefused_AndNeverDoublesStock()
        {
            LoadOk("supermarket");
            long stockBefore = Scalar("SELECT SUM(stock_quantity_milli) FROM products;");

            var second = _demo.LoadDemoData("supermarket", true);

            Assert.IsFalse(second.Success);
            Assert.AreEqual("ALREADY_LOADED", second.Code);
            Assert.AreEqual(8, Scalar("SELECT COUNT(*) FROM products;"));
            Assert.AreEqual(stockBefore, Scalar("SELECT SUM(stock_quantity_milli) FROM products;"));
            Assert.AreEqual(8, Scalar("SELECT COUNT(*) FROM stock_movements;"));
            Assert.IsFalse(_demo.GetStatus().CanLoad, "الحالة تمنع التحميل الثاني");
        }

        [Test]
        public void Load_SkipsAProduct_WhenARealProductAlreadyUsesItsBarcode_AndNeverTouchesIt()
        {
            LoadOk("supermarket");
            string demoBarcode = ScalarText("SELECT barcode FROM products WHERE id = 'demo_prod_1';");
            Assert.IsTrue(_demo.ClearDemoData().Success);

            var real = CreateTestProduct("منتج حقيقي بنفس الباركود", 5000, 3000, 5000, demoBarcode);
            long realStockBefore = ProductRepo.GetById(real.Id).StockQuantityMilli;

            var res = _demo.LoadDemoData("supermarket", true);

            Assert.IsTrue(res.Success, res.Message);
            Assert.AreEqual(7, res.ProductsAdded);
            Assert.AreEqual(1, res.ProductsSkipped);
            Assert.AreEqual(0, Scalar("SELECT COUNT(*) FROM products WHERE id = 'demo_prod_1';"));
            var realAfter = ProductRepo.GetById(real.Id);
            Assert.AreEqual("منتج حقيقي بنفس الباركود", realAfter.Name);
            Assert.AreEqual(5000, realAfter.PricePiasters);
            Assert.AreEqual(realStockBefore, realAfter.StockQuantityMilli, "لا دمج ولا تغيير لمخزون الصنف الحقيقي");
            Assert.AreEqual(1, Scalar("SELECT COUNT(*) FROM products WHERE barcode = @b;", "@b", demoBarcode));
        }

        [Test]
        public void Load_IsRefused_WhenRealInvoicesExist()
        {
            var real = CreateTestProduct("صنف حقيقي", 4200, 3000, 20000);
            CreateRealSale(real.Id, real.Name, 101);

            var res = _demo.LoadDemoData("supermarket", true);

            Assert.IsFalse(res.Success);
            Assert.AreEqual("REAL_SALES_EXIST", res.Code);
            Assert.IsTrue(res.Message.Contains("1 فاتورة حقيقية"), res.Message);
            Assert.AreEqual(0, Scalar("SELECT COUNT(*) FROM products WHERE id LIKE 'demo\\_%' ESCAPE '\\';"));
            var status = _demo.GetStatus();
            Assert.IsFalse(status.CanLoad);
            Assert.AreEqual(1, status.RealSalesCount);
            Assert.IsFalse(string.IsNullOrEmpty(status.LoadBlockedReason));
        }

        [Test]
        public void Load_NeedsExplicitAcknowledgement_WhenRealCatalogExists()
        {
            var real = CreateTestProduct("صنف حقيقي موجود", 4200, 3000, 20000);

            var refused = _demo.LoadDemoData("supermarket", false);
            Assert.IsFalse(refused.Success);
            Assert.AreEqual("CONFIRM_REQUIRED", refused.Code);
            Assert.AreEqual(1, Scalar("SELECT COUNT(*) FROM products;"), "لم يتغير شيء بدون التأكيد");

            var accepted = _demo.LoadDemoData("supermarket", true);
            Assert.IsTrue(accepted.Success, accepted.Message);
            Assert.AreEqual(9, Scalar("SELECT COUNT(*) FROM products;"));
            Assert.AreEqual(20000, ProductRepo.GetById(real.Id).StockQuantityMilli);
        }

        [Test]
        public void Load_ReportsPlannedCountsFromTheHost()
        {
            Assert.AreEqual(8, _demo.GetStatus("supermarket").PlannedProductsCount);
            Assert.AreEqual(6, _demo.GetStatus("pharmacy").PlannedProductsCount);
            Assert.AreEqual(2, _demo.GetStatus("pharmacy").PlannedCustomersCount);
            Assert.IsTrue(_demo.GetStatus().CanLoad);
        }

        [Test]
        public void Load_IsAtomic_WhenAnythingFailsMidWay()
        {
            Execute("CREATE TRIGGER trg_s70_fail_load BEFORE INSERT ON audit_logs WHEN NEW.action = 'DEMO_DATA_LOADED' BEGIN SELECT RAISE(ABORT, 'forced failure'); END;");

            var res = _demo.LoadDemoData("supermarket", true);

            Assert.IsFalse(res.Success);
            Assert.AreEqual("DEMO_LOAD_FAILED", res.Code);
            Assert.IsTrue(res.Message.Contains("forced failure"), "الخطأ يظهر كما هو: " + res.Message);
            Assert.AreEqual(0, Scalar("SELECT COUNT(*) FROM products;"));
            Assert.AreEqual(0, Scalar("SELECT COUNT(*) FROM stock_movements;"));
            Assert.AreEqual(0, Scalar("SELECT COUNT(*) FROM customers WHERE id LIKE 'demo\\_%' ESCAPE '\\';"));
            Assert.AreEqual(0, Scalar("SELECT COUNT(*) FROM product_barcodes;"));
        }

        // ---------- removal ----------

        [Test]
        public void Clear_RemovesOnlyDemoRows_AndKeepsEveryRealOne()
        {
            var realProduct = CreateTestProduct("صنف حقيقي", 4200, 3000, 20000);
            var realCustomer = CreateTestCustomer("زبون حقيقي", 10000, 0);
            LoadOk("supermarket");
            long realMovements = Scalar("SELECT COUNT(*) FROM stock_movements WHERE product_id = @p;", "@p", realProduct.Id);

            var res = _demo.ClearDemoData();

            Assert.IsTrue(res.Success, res.Message);
            Assert.AreEqual(8, res.DeletedProducts);
            Assert.AreEqual(2, res.DeletedCustomers);
            Assert.AreEqual(0, res.KeptProducts);
            Assert.AreEqual(1, _backupCalls, "نسخة احتياطية واحدة قبل المسح");
            Assert.AreEqual(0, Scalar("SELECT COUNT(*) FROM products WHERE id LIKE 'demo\\_%' ESCAPE '\\';"));
            Assert.AreEqual(0, Scalar("SELECT COUNT(*) FROM stock_movements WHERE id LIKE 'demo\\_%' ESCAPE '\\';"));
            Assert.AreEqual(0, Scalar("SELECT COUNT(*) FROM product_barcodes WHERE id LIKE 'demo\\_%' ESCAPE '\\';"));
            Assert.AreEqual(0, Scalar("SELECT COUNT(*) FROM customers WHERE id LIKE 'demo\\_%' ESCAPE '\\';"));
            Assert.IsNotNull(ProductRepo.GetById(realProduct.Id));
            Assert.AreEqual(20000, ProductRepo.GetById(realProduct.Id).StockQuantityMilli);
            Assert.AreEqual(realMovements, Scalar("SELECT COUNT(*) FROM stock_movements WHERE product_id = @p;", "@p", realProduct.Id));
            Assert.AreEqual(1, Scalar("SELECT COUNT(*) FROM customers WHERE id = @c;", "@c", realCustomer.Id));
            Assert.AreEqual(1, Scalar("SELECT COUNT(*) FROM audit_logs WHERE action = 'DEMO_DATA_CLEARED';"));
            Assert.IsFalse(_demo.GetStatus().HasDemoData);
        }

        [Test]
        public void Clear_KeepsADemoProduct_ThatARealSaleAlreadyUsed()
        {
            LoadOk("supermarket");
            var sale = CreateRealSale("demo_prod_1", "لبن جهينة كامل الدسم 1 لتر (تجريبي)", 101);
            long saleItemsBefore = Scalar("SELECT COUNT(*) FROM sale_items WHERE sale_id = @s;", "@s", sale.Id);
            long salesTotalBefore = Scalar("SELECT SUM(total_piasters) FROM sales;");

            var preview = _demo.GetStatus();
            Assert.AreEqual(1, preview.KeptProductsCount);
            Assert.AreEqual(7, preview.RemovableProductsCount);

            var res = _demo.ClearDemoData();

            Assert.IsTrue(res.Success, res.Message);
            Assert.AreEqual(7, res.DeletedProducts);
            Assert.AreEqual(1, res.KeptProducts);
            Assert.IsTrue(res.Message.Contains("بقي 1 صنف"), res.Message);
            Assert.AreEqual(1, Scalar("SELECT COUNT(*) FROM products WHERE id = 'demo_prod_1' AND is_active = 0;"), "الصنف يبقى موقوفاً");
            Assert.AreEqual(1, Scalar("SELECT COUNT(*) FROM sales WHERE id = @s;", "@s", sale.Id), "الفاتورة الحقيقية لا تُمس");
            Assert.AreEqual(saleItemsBefore, Scalar("SELECT COUNT(*) FROM sale_items WHERE sale_id = @s;", "@s", sale.Id), "بنود الفاتورة الحقيقية باقية");
            Assert.AreEqual(salesTotalBefore, Scalar("SELECT SUM(total_piasters) FROM sales;"));
            Assert.IsTrue(Scalar("SELECT COUNT(*) FROM stock_movements WHERE product_id = 'demo_prod_1';") >= 1, "سجل حركات الصنف الموقوف باقٍ");
            Assert.AreEqual(0, Scalar("SELECT COUNT(*) FROM customers WHERE id LIKE 'demo\\_%' ESCAPE '\\';"));
        }

        [Test]
        public void Clear_KeepsAndArchivesADemoCustomer_WhoHoldsABalance()
        {
            LoadOk("supermarket");
            Execute("UPDATE customers SET balance_piasters = 5000 WHERE id = 'demo_cust_1';");

            var res = _demo.ClearDemoData();

            Assert.IsTrue(res.Success, res.Message);
            Assert.AreEqual(1, res.DeletedCustomers);
            Assert.AreEqual(1, res.KeptCustomers);
            Assert.AreEqual(1, Scalar("SELECT COUNT(*) FROM customers WHERE id = 'demo_cust_1' AND is_archived = 1 AND balance_piasters = 5000;"));
            Assert.AreEqual(0, Scalar("SELECT COUNT(*) FROM customers WHERE id = 'demo_cust_2';"));
        }

        [Test]
        public void Clear_IsRefused_WhenTheBackupIsNotVerified_AndChangesNothing()
        {
            LoadOk("supermarket");
            _backupAnswer = new BackupResult { Success = true, IsVerified = false };

            var unverified = _demo.ClearDemoData();
            Assert.IsFalse(unverified.Success);
            Assert.AreEqual("BACKUP_FAILED", unverified.Code);

            _backupAnswer = new BackupResult { Success = true, IsVerified = true };
            _backupThrows = true;
            var thrown = _demo.ClearDemoData();
            Assert.IsFalse(thrown.Success);
            Assert.AreEqual("BACKUP_FAILED", thrown.Code);

            Assert.AreEqual(8, Scalar("SELECT COUNT(*) FROM products;"));
            Assert.AreEqual(8, Scalar("SELECT COUNT(*) FROM stock_movements;"));
            Assert.AreEqual(2, Scalar("SELECT COUNT(*) FROM customers WHERE id LIKE 'demo\\_%' ESCAPE '\\';"));
        }

        [Test]
        public void Clear_IsAtomic_WhenAnythingFailsMidWay()
        {
            LoadOk("supermarket");
            Execute("CREATE TRIGGER trg_s70_fail_clear BEFORE INSERT ON audit_logs WHEN NEW.action = 'DEMO_DATA_CLEARED' BEGIN SELECT RAISE(ABORT, 'forced failure'); END;");

            var res = _demo.ClearDemoData();

            Assert.IsFalse(res.Success);
            Assert.AreEqual("DEMO_CLEAR_FAILED", res.Code);
            Assert.IsTrue(res.Message.Contains("forced failure"), res.Message);
            Assert.AreEqual(8, Scalar("SELECT COUNT(*) FROM products;"));
            Assert.AreEqual(8, Scalar("SELECT COUNT(*) FROM stock_movements;"));
            Assert.AreEqual(8, Scalar("SELECT COUNT(*) FROM product_barcodes;"));
            Assert.AreEqual(2, Scalar("SELECT COUNT(*) FROM customers WHERE id LIKE 'demo\\_%' ESCAPE '\\';"));
        }

        [Test]
        public void Clear_WithNothingToRemove_SucceedsWithoutABackupOrChanges()
        {
            var res = _demo.ClearDemoData();

            Assert.IsTrue(res.Success);
            Assert.AreEqual(0, res.DeletedProducts);
            Assert.AreEqual(0, _backupCalls);
        }

        // ---------- access and factory reset gate ----------

        [Test]
        public void DemoLoadAndClear_AreMappedToOwnerOnly_AndRefusedForManagersAndCashiers()
        {
            FieldInfo map = typeof(IpcDispatcher).GetField("ACTION_PERMISSIONS", BindingFlags.NonPublic | BindingFlags.Static);
            Assert.IsNotNull(map);
            var permissions = (Dictionary<string, string>)map.GetValue(null);
            Assert.AreEqual("__owner__", permissions["demo:load"]);
            Assert.AreEqual("__owner__", permissions["demo:clear"]);
            Assert.AreEqual("__owner__", permissions["system:factoryReset"]);

            var manager = CreateManager("mgr_demo1", ManagerPin);
            var cashier = CreateCashierBy(OwnerId, "cash_demo1");
            string[] sessions = new string[] { manager.Id, cashier.Id };
            string[] actions = new string[] { "demo:load", "demo:clear" };
            for (int s = 0; s < sessions.Length; s++)
            {
                LoginAs(sessions[s]);
                for (int a = 0; a < actions.Length; a++)
                {
                    var res = Dispatch(actions[a], new { storeType = "supermarket", acknowledgeRealData = true });
                    Assert.IsFalse(res.Success, actions[a] + " يجب أن يُرفض لـ " + sessions[s]);
                    Assert.AreEqual("FORBIDDEN", ErrorCode(res), Describe(res));
                }
            }
            Assert.AreEqual(0, Scalar("SELECT COUNT(*) FROM products;"), "الرفض قبل أي تنفيذ");
        }

        [Test]
        public void FactoryReset_RequiresTheTypedConfirmationWord_OnTheHostToo()
        {
            string conn = DatabaseService.ConnectionString;
            Assert.IsTrue(string.IsNullOrEmpty(conn) || conn.IndexOf(System.IO.Path.GetTempPath(), StringComparison.OrdinalIgnoreCase) >= 0,
                "رفض تنفيذ اختبار مدمر على قاعدة غير مؤقتة: " + conn);
            CreateTestProduct("صنف يجب أن يبقى", 1000, 500, 1000);
            LoginAs(OwnerId);

            var withoutWord = Dispatch("system:factoryReset", null);
            Assert.IsFalse(withoutWord.Success);
            Assert.AreEqual("CONFIRMATION_REQUIRED", ErrorCode(withoutWord), Describe(withoutWord));

            var wrongWord = Dispatch("system:factoryReset", new { confirmWord = "نعم" });
            Assert.IsFalse(wrongWord.Success);
            Assert.AreEqual("CONFIRMATION_REQUIRED", ErrorCode(wrongWord), Describe(wrongWord));

            Assert.AreEqual(1, Scalar("SELECT COUNT(*) FROM products;"), "لم يُمس شيء بدون الكلمة الصحيحة");
        }
    }
}
