using System;
using System.IO;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    [TestFixture]
    public class S102_TrialDataPurgeTest : S30_Step3BFixtureBase
    {
        [Test]
        public void TrialDataPurge_EndToEnd_ClearsOperationalData_WhilePreservingSettingsUsersAndTemplate()
        {
            // 1. Setup store settings (Store name, activity type, first run complete)
            DatabaseService.SettingsRepo.Set("store_name", "محل النور للتجربة");
            DatabaseService.SettingsRepo.Set("store_type", "clothing_apparel");
            DatabaseService.SettingsRepo.Set("first_run_completed", "1");
            DatabaseService.SettingsRepo.Set("tax_number", "999-888-777");

            // 2. Setup a custom cashier user
            string cashierId = "usr_test_cashier_001";
            Execute(@"
                INSERT OR REPLACE INTO users (id, username, display_name, pin_code_hash, pin_salt, role, is_active, created_at, updated_at)
                VALUES (@id, 'cashier_nour', 'كاشير النور', 'dummy_hash_123', 'dummy_salt', 'cashier', 1, datetime('now'), datetime('now'));
            ", "@id", cashierId);

            // 3. Create a product and customer
            var prod = CreateProduct("قميص كاجوال تجريبي", 25000, 18000, 10000);
            Execute("INSERT INTO customers (id, name, phone, balance_piasters, is_archived, created_at) VALUES ('cust_t1', 'عميل تجريبي', '01011112222', 5000, 0, datetime('now'));");

            // Open and close a shift with a sale
            var shift = OpenShift(50000);
            Execute(@"
                INSERT INTO sales (id, invoice_number, cashier_id, customer_id, subtotal_piasters, discount_piasters, tax_piasters, total_piasters, paid_piasters, payment_method, status, created_at)
                VALUES ('sale_t1', 105, @cid, 'cust_t1', 25000, 0, 0, 25000, 25000, 'cash', 'completed', datetime('now'));
            ", "@cid", AdminId);
            Execute(@"
                INSERT INTO sale_items (id, sale_id, product_id, product_name, quantity_milli, unit_price_piasters, unit_cost_piasters, total_piasters)
                VALUES ('sitem_t1', 'sale_t1', @pid, 'قميص كاجوال تجريبي', 1000, 25000, 18000, 25000);
            ", "@pid", prod.Id);

            // Close the shift
            DatabaseService.Shifts.CloseShift(new CloseShiftRequest
            {
                ShiftId = shift.Id,
                CashierId = AdminId,
                ActualCashPiasters = 75000,
                Notes = "إقفال تجريبي"
            });

            // Verify before purge: records exist
            Assert.GreaterOrEqual(Scalar("SELECT COUNT(*) FROM sales;"), 1, "الفواتير موجودة قبل التصفير");
            Assert.GreaterOrEqual(Scalar("SELECT COUNT(*) FROM products;"), 1, "المنتجات موجودة قبل التصفير");
            Assert.GreaterOrEqual(Scalar("SELECT COUNT(*) FROM customers;"), 1, "العملاء موجودون قبل التصفير");

            // 4. Test wrong confirmation word rejects
            var wrongConfirmRes = Dispatch("system:trialDataPurge", new JObject { { "confirmWord", "غلط" } });
            Assert.IsFalse(wrongConfirmRes.Success, "يجب رفض الطلب إذا لم تكن كلمة التأكيد 'تصفير'");

            // 5. Run TrialDataPurge via IPC Dispatch with correct confirmation word
            var okRes = DispatchOk("system:trialDataPurge", new JObject { { "confirmWord", "تصفير" } });
            Assert.IsTrue(okRes.Success, "نجاح أمر IPC لتصفير بيانات التجربة");

            // 6. Assertions
            // Operational tables MUST be completely empty (0 records)
            Assert.AreEqual(0, Scalar("SELECT COUNT(*) FROM sales;"), "جدول الفواتير فارغ تماماً بعد التصفير");
            Assert.AreEqual(0, Scalar("SELECT COUNT(*) FROM sale_items;"), "جدول بنود الفواتير فارغ تماماً بعد التصفير");
            Assert.AreEqual(0, Scalar("SELECT COUNT(*) FROM products;"), "جدول المنتجات فارغ تماماً بعد التصفير");
            Assert.AreEqual(0, Scalar("SELECT COUNT(*) FROM customers;"), "جدول العملاء فارغ تماماً بعد التصفير");
            Assert.AreEqual(0, Scalar("SELECT COUNT(*) FROM shifts;"), "جدول الورديات فارغ تماماً بعد التصفير");

            // Invoices counter MUST be reset so next invoice starts at 1
            Assert.AreEqual(1, DatabaseService.CounterRepo.GetNextExpectedInvoiceNumber(), "عداد الفواتير تم تصفيره ليبدأ من رقم 1");

            // Crucial Invariant: Store settings MUST BE PRESERVED
            Assert.AreEqual("محل النور للتجربة", DatabaseService.SettingsRepo.Get("store_name", ""), "اسم المتجر محفوظ بالكامل ولم يُحذف");
            Assert.AreEqual("clothing_apparel", DatabaseService.SettingsRepo.Get("store_type", ""), "نشاط المتجر محفوظ بالكامل ولم يُحذف");
            Assert.AreEqual("1", DatabaseService.SettingsRepo.Get("first_run_completed", ""), "حالة اكتمال الإعداد الأول محفوظة ولم يُعاد تصفيرها لمعالج التثبيت");
            Assert.AreEqual("999-888-777", DatabaseService.SettingsRepo.Get("tax_number", ""), "الرقم الضريبي محفوظ بالكامل");

            // Crucial Invariant: User Accounts & Passwords MUST BE PRESERVED
            var cashierCheck = DatabaseService.UserRepo.GetById(cashierId);
            Assert.IsNotNull(cashierCheck, "حساب الكاشير المضاف لم يُحذف وظل مسجلاً");
            Assert.AreEqual("dummy_hash_123", cashierCheck.PinCodeHash, "تشفير كلمة مرور/PIN الكاشير لم يتغير");

            // Audit log MUST have the genesis reset entry
            Assert.AreEqual(1, Scalar("SELECT COUNT(*) FROM audit_logs WHERE action = 'trial_data_purge';"), "تم توثيق قيد التصفير النظامي في سجل التدقيق بنجاح");
        }

        [Test]
        public void TrialDataPurge_BlocksWhenShiftIsOpen()
        {
            // Open an active shift
            OpenShift(50000);

            // Attempt purge while shift is open
            var res = Dispatch("system:trialDataPurge", new JObject { { "confirmWord", "تصفير" } });

            // Must be blocked!
            Assert.IsFalse(res.Success, "يجب إيقاف التصفير لوجود وردية مفتوحة");
            StringAssert.Contains("وردية مفتوحة", res.Error.Message);
        }
    }
}
