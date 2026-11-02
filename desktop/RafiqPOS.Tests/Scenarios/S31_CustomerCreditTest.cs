using System;
using System.Data.SQLite;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using RafiqPOS.Models;
using RafiqPOS.Repositories;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    /// <summary>
    /// M2 / M3 / L1 / L2 / L8: حسابات آجل العملاء — إلغاء سداد البطاقة، صلاحيات استيراد إكسل،
    /// توزيع السداد على فواتير بها مرتجع، تاريخ كشف الحساب المحلي، وعدم تكرار السداد عند إعادة المحاولة.
    /// </summary>
    [TestFixture]
    [NonParallelizable]
    public class S31_CustomerCreditTest : S30_Step3BFixtureBase
    {
        private Customer CreateCustomer(string name, long openingBalancePiasters, long creditLimitPiasters)
        {
            return DatabaseService.Customers.SaveCustomer(new Customer
            {
                Name = name,
                Phone = "010" + Guid.NewGuid().ToString("N").Substring(0, 8),
                BalancePiasters = openingBalancePiasters,
                CreditLimitPiasters = creditLimitPiasters
            });
        }

        private static string LastLedgerId(string customerId, string type)
        {
            using (var conn = new SQLiteConnection(DatabaseService.ConnectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand("SELECT id FROM customer_ledger WHERE customer_id = @c AND type = @t ORDER BY created_at DESC LIMIT 1;", conn))
                {
                    cmd.Parameters.AddWithValue("@c", customerId);
                    cmd.Parameters.AddWithValue("@t", type);
                    return Convert.ToString(cmd.ExecuteScalar());
                }
            }
        }

        [Test]
        public void M2_CancellingCardPayment_DebitsTheDigitalAccount_NotTheCashDrawer()
        {
            OpenShift(0); // empty drawer: a cash-style cancellation would be refused
            var account = DatabaseService.DigitalAccounts.SaveAccount(new DigitalAccount
            {
                Name = "ماكينة فيزا البنك",
                Type = "instapay",
                Provider = "bank_account",
                IsDefault = true,
                IsActive = true
            });
            var customer = CreateCustomer("عميل فيزا", 50000, 100000);

            // Same payload as CustomersView.handleRecordPayment
            DispatchOk("customers:recordPayment", new JObject
            {
                { "customerId", customer.Id },
                { "amountPiasters", 20000 },
                { "notes", "سداد دين عبر card" },
                { "paymentMethod", "card" },
                { "idempotencyKey", Guid.NewGuid().ToString() }
            });
            Assert.AreEqual(20000, DatabaseService.DigitalAccounts.GetAccountById(account.Id).BalancePiasters, "سداد البطاقة يدخل الحساب الإلكتروني");

            var res = Dispatch("customers:cancelPayment", new JObject
            {
                { "customerId", customer.Id },
                { "ledgerEntryId", LastLedgerId(customer.Id, "payment") },
                { "reason", "سجلت بالخطأ" },
                { "userName", "الكاشير" }
            });

            Assert.IsTrue(res.Success, "إلغاء سداد بطاقة لا يمر على الدرج: " + Describe(res));
            Assert.AreEqual(0, DatabaseService.DigitalAccounts.GetAccountById(account.Id).BalancePiasters, "الإلغاء يخصم من نفس الحساب الإلكتروني");
            Assert.AreEqual(50000, DatabaseService.Customers.GetById(customer.Id).BalancePiasters, "المديونية تعود كما كانت");
        }

        [Test]
        public void M3_ExcelImport_RejectsBalanceAndLimitRowsWithoutPermission_AndUsesConfiguredDefaultLimit()
        {
            DatabaseService.SettingsRepo.Set("default_customer_credit_limit_egp", "2500");
            LoginAs(CashierId); // customers.create yes, customers.opening_balance / customers.credit_limit no

            // Same rows the preview (excel:previewCustomerImport) hands back to CustomerImportExcelModal
            var rows = new JArray
            {
                ImportRow(2, "عميل بدين قديم", "01000000002", 30000, 0),
                ImportRow(3, "عميل بحد ائتماني", "01000000003", 0, 500000),
                ImportRow(4, "عميل جديد عادي", "01000000004", 0, 0)
            };
            var res = DispatchOk("excel:importCustomers", new JObject { { "rows", rows } });
            JObject result = Data(res);

            Assert.AreEqual(1, (int)result["importedCount"]);
            Assert.AreEqual(2, (int)result["skippedCount"]);
            JArray rowErrors = (JArray)result["rowErrors"];
            Assert.AreEqual(2, rowErrors.Count, "خطأ عربي لكل سطر مرفوض");
            StringAssert.Contains("السطر 2", rowErrors[0].ToString());
            StringAssert.Contains("رصيد افتتاحي", rowErrors[0].ToString());
            StringAssert.Contains("السطر 3", rowErrors[1].ToString());
            StringAssert.Contains("الحد الائتماني", rowErrors[1].ToString());

            Assert.AreEqual(0, Scalar("SELECT COUNT(*) FROM customers WHERE name IN ('عميل بدين قديم', 'عميل بحد ائتماني');"));
            Assert.AreEqual(0, Scalar("SELECT COUNT(*) FROM customer_ledger WHERE type = 'opening_balance';"), "لا رصيد افتتاحي بدون صلاحية");
            Assert.AreEqual(250000, Scalar("SELECT credit_limit_piasters FROM customers WHERE name = 'عميل جديد عادي';"),
                "الحد الافتراضي من إعداد المتجر (2500 ج.م) وليس 1000 ج.م ثابتة");
        }

        private static JObject ImportRow(int rowIndex, string name, string phone, long balance, long limit)
        {
            return new JObject
            {
                { "rowIndex", rowIndex },
                { "name", name },
                { "phone", phone },
                { "initialBalancePiasters", balance },
                { "initialBalanceFormatted", "" },
                { "creditLimitPiasters", limit },
                { "creditLimitFormatted", "" },
                { "notes", null },
                { "isValid", true },
                { "errors", new JArray() },
                { "isPhoneDuplicateInDb", false }
            };
        }

        [Test]
        public void L1_PaymentAfterPartialReturn_IsAllocatedToTheInvoice_AndRefundReducesOutstanding()
        {
            OpenShift(0);
            var product = CreateProduct("أرز 1 كجم", 2500, 2000, 100000);
            var customer = CreateCustomer("عميل آجل", 0, 100000);

            var saleRes = DispatchOk("sales:create", SalePayload(new JArray { CartLine(product, 4000, 2500) }, 10000, "credit", 0, customer.Id));
            JObject sale = Data(saleRes);
            string saleId = sale["id"].ToString();

            DispatchOk("returns:create", new JObject
            {
                { "saleId", saleId },
                { "reason", "مرتجع من العميل" },
                { "refundMethod", "credit" },
                { "idempotencyKey", Guid.NewGuid().ToString() },
                { "items", new JArray
                    {
                        new JObject
                        {
                            { "saleItemId", sale["items"][0]["id"].ToString() },
                            { "productId", product.Id },
                            { "productName", product.Name },
                            { "quantityMilli", 2000 },
                            { "unitPricePiasters", 2500 },
                            { "totalPiasters", 5000 },
                            { "isDamaged", false }
                        }
                    }
                }
            });

            DispatchOk("customers:recordPayment", new JObject
            {
                { "customerId", customer.Id },
                { "amountPiasters", 3000 },
                { "notes", "سداد نقدي للدين" },
                { "paymentMethod", "cash" },
                { "idempotencyKey", Guid.NewGuid().ToString() }
            });

            Assert.AreEqual(3000, Scalar("SELECT COALESCE(SUM(amount_piasters), 0) FROM debt_allocations WHERE sale_id = @s AND type = 'payment';", "@s", saleId),
                "السداد يُوزَّع على الفاتورة رغم أن حالتها أصبحت partially_refunded");
            using (var conn = new SQLiteConnection(DatabaseService.ConnectionString))
            {
                conn.Open();
                Assert.AreEqual(2000, CustomerRepository.GetInvoiceOutstanding(conn, null, saleId), "المتبقي = 100 - مرتجع 50 - سداد 30");
            }
            Assert.AreEqual(2000, DatabaseService.Customers.GetById(customer.Id).BalancePiasters, "رصيد العميل يطابق متبقي الفاتورة");
        }

        [Test]
        public void L2_Statement_UsesLocalBusinessDate_ForEntriesAfterLocalMidnight()
        {
            DatabaseService.SettingsRepo.Set("business_day_cutoff_hour", "0");
            OpenShift(0);
            var customer = CreateCustomer("عميل كشف حساب", 50000, 100000);
            DispatchOk("customers:recordPayment", new JObject
            {
                { "customerId", customer.Id },
                { "amountPiasters", 10000 },
                { "notes", "سداد بعد منتصف الليل" },
                { "paymentMethod", "cash" },
                { "idempotencyKey", Guid.NewGuid().ToString() }
            });

            // 01:30 local time yesterday is still "yesterday" for the shop, but the previous day in UTC east of Greenwich
            DateTime localDay = DateTime.Today.AddDays(-1);
            string createdAtUtc = localDay.AddHours(1).AddMinutes(30).ToUniversalTime().ToString("o");
            Execute("UPDATE customer_ledger SET created_at = @t WHERE customer_id = @c AND type = 'payment';", "@t", createdAtUtc, "@c", customer.Id);

            string day = localDay.ToString("yyyy-MM-dd");
            var res = DispatchOk("customers:getDetailedStatement", new JObject { { "customerId", customer.Id }, { "startDate", day }, { "endDate", day } });
            JObject report = Data(res);

            Assert.AreEqual(10000, (long)report["periodCreditsPiasters"], "السداد يظهر في يومه المحلي " + day);
            Assert.AreEqual(50000, (long)report["openingBalancePiasters"]);
        }

        [Test]
        public void L8_RetriedCustomerPayment_WithSameKey_IsRecordedOnce()
        {
            OpenShift(0);
            var customer = CreateCustomer("عميل إعادة محاولة", 50000, 100000);
            var payload = new JObject
            {
                { "customerId", customer.Id },
                { "amountPiasters", 15000 },
                { "notes", "سداد نقدي للدين" },
                { "paymentMethod", "cash" },
                { "idempotencyKey", "pay_" + Guid.NewGuid().ToString("N") }
            };

            DispatchOk("customers:recordPayment", payload);
            var retry = DispatchOk("customers:recordPayment", (JObject)payload.DeepClone());

            Assert.AreEqual(35000, (long)Data(retry)["balancePiasters"], "إعادة المحاولة ترجع نفس النتيجة");
            Assert.AreEqual(1, Scalar("SELECT COUNT(*) FROM customer_ledger WHERE customer_id = @c AND type = 'payment';", "@c", customer.Id), "قيد سداد واحد فقط");
            Assert.AreEqual(35000, DatabaseService.Customers.GetById(customer.Id).BalancePiasters);
        }
    }
}
