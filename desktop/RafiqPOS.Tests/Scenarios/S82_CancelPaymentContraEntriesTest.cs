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
    /// إلغاء دفعة عميل لا يحذف توزيع الفواتير ولا قيود التسوية: يُضاف قيد معاكس بمبالغ سالبة
    /// فتعود المديونية والكشوف صحيحة ويبقى الأثر للمراجعة، وتفاصيل المراجعة JSON صالحة مهما كان نص السبب.
    /// </summary>
    [TestFixture]
    [NonParallelizable]
    public class S82_CancelPaymentContraEntriesTest : S30_Step3BFixtureBase
    {
        private static string Text(string sql, params object[] nameValuePairs)
        {
            using (var conn = new SQLiteConnection(DatabaseService.ConnectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    for (int i = 0; i + 1 < nameValuePairs.Length; i += 2)
                    {
                        cmd.Parameters.AddWithValue((string)nameValuePairs[i], nameValuePairs[i + 1]);
                    }
                    object val = cmd.ExecuteScalar();
                    return val == null || val == DBNull.Value ? null : val.ToString();
                }
            }
        }

        private static int DebtSettlementLines(string saleId)
        {
            int count = 0;
            foreach (SalePayment payment in DatabaseService.SaleRepo.GetSaleById(saleId).Payments)
            {
                if (string.Equals(payment.Method, "debt_settlement", StringComparison.OrdinalIgnoreCase)) count++;
            }
            return count;
        }

        [Test]
        public void CancelPayment_AddsContraRows_AndKeepsTheOriginalAllocationAndSettlement()
        {
            OpenShift(50000);
            var product = CreateProduct("زيت 1 لتر", 2500, 2000, 100000);
            var customer = DatabaseService.Customers.SaveCustomer(new Customer { Name = "عميل إلغاء سداد", Phone = "01077700022", CreditLimitPiasters = 100000 });

            // 100 EGP on credit with a 20 EGP cash down payment leaves 80 EGP of debt
            JObject salePayload = SalePayload(new JArray { CartLine(product, 4000, 2500) }, 10000, "credit", 2000, customer.Id);
            salePayload["payments"] = new JArray
            {
                new JObject { { "amountPiasters", 2000 }, { "method", "cash" } },
                new JObject { { "amountPiasters", 8000 }, { "method", "credit" } }
            };
            JObject sale = Data(DispatchOk("sales:create", salePayload));
            string saleId = sale["id"].ToString();
            DispatchOk("customers:recordPayment", new JObject
            {
                { "customerId", customer.Id }, { "amountPiasters", 3000 }, { "notes", "سداد نقدي للدين" }, { "paymentMethod", "cash" }, { "idempotencyKey", Guid.NewGuid().ToString() }
            });
            Assert.AreEqual(5000, DatabaseService.Customers.GetById(customer.Id).BalancePiasters);
            Assert.AreEqual(1, DebtSettlementLines(saleId), "السداد ظاهر على الفاتورة قبل الإلغاء");
            string ledgerId = Text("SELECT id FROM customer_ledger WHERE customer_id = @c AND type = 'payment';", "@c", customer.Id);

            DatabaseService.Customers.CancelPayment(customer.Id, ledgerId, "سجلت \"بالخطأ\"", AdminId);

            Assert.AreEqual(0, DebtSettlementLines(saleId), "بعد الإلغاء لا يظهر سطر السداد الملغى ولا قيده المعاكس على الفاتورة أو إيصالها");
            Assert.AreEqual(2, Scalar("SELECT COUNT(*) FROM debt_allocations WHERE sale_id = @s;", "@s", saleId), "التوزيع الأصلي باقٍ مع قيده المعاكس");
            Assert.AreEqual(0, Scalar("SELECT COALESCE(SUM(amount_piasters), 0) FROM debt_allocations WHERE sale_id = @s AND type = 'payment';", "@s", saleId), "صافي التوزيعات صفر");
            Assert.AreEqual(2, Scalar("SELECT COUNT(*) FROM payments WHERE sale_id = @s AND method = 'debt_settlement';", "@s", saleId), "قيد التسوية الأصلي باقٍ مع قيده المعاكس");
            Assert.AreEqual(0, Scalar("SELECT COALESCE(SUM(amount_piasters), 0) FROM payments WHERE sale_id = @s AND method = 'debt_settlement';", "@s", saleId), "صافي التسويات صفر");
            using (var conn = new SQLiteConnection(DatabaseService.ConnectionString))
            {
                conn.Open();
                Assert.AreEqual(8000, CustomerRepository.GetInvoiceOutstanding(conn, null, saleId), "المتبقي على الفاتورة عاد 80 ج.م");
            }
            Assert.AreEqual(8000, DatabaseService.Customers.GetById(customer.Id).BalancePiasters, "رصيد العميل عاد");
            Assert.AreEqual(0, DatabaseService.Returns.GetReturnsForSale(saleId).Count);

            string details = Text("SELECT details_json FROM audit_logs WHERE action = 'cancel_payment' AND entity_id = @l;", "@l", ledgerId);
            Assert.IsNotNull(details, "سجل المراجعة موجود");
            Assert.AreEqual("سجلت \"بالخطأ\"", (string)JObject.Parse(details)["reason"], "JSON صالح ونص السبب سليم رغم علامات الاقتباس");

            var again = Assert.Throws<InvalidOperationException>(delegate { DatabaseService.Customers.CancelPayment(customer.Id, ledgerId, "مرة ثانية", AdminId); });
            StringAssert.Contains("تم إلغاء هذه الدفعة مسبقاً", again.Message);
        }
    }
}
