using System;
using System.Collections.Generic;
using RafiqPOS.Data;
using NUnit.Framework;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    [TestFixture]
    [NonParallelizable]
    public class S17_SupervisorPriceOverrideTest : TestBase
    {
        private const string AdminId = "usr_admin_default";
        private const string CashierId = "usr_cashier_1";
        private const string SupervisorPin = "7418";

        [SetUp]
        public void LoginCashier()
        {
            SecurityService.ChangeUserPin(AdminId, SupervisorPin);
            var cashier = UserRepo.GetById(CashierId);
            Assert.IsNotNull(cashier, "الكاشير المبدئي غير موجود");
            SecurityService.SetCurrentUserForTesting(SecurityService.MapToDto(cashier));
        }

        [TearDown]
        public override void BaseTearDown()
        {
            SecurityService.SetCurrentUserForTesting(null);
            base.BaseTearDown();
        }

        [Test]
        public void Held_Price_Different_From_Catalogue_Needs_Supervisor_And_Is_Audited()
        {
            var prod = CreateTestProduct("صنف سعر محجوز", 5000, 3000, 100000);

            var ex = Assert.Throws<InvalidOperationException>(delegate { SaleService.ProcessSale(BuildSale(prod, null), null); });
            StringAssert.Contains("يختلف عن سعر الكتالوج", ex.Message);
            Assert.AreEqual(0, CountAudit("SALE_PRICE_OVERRIDE_APPROVED"));

            var sale = SaleService.ProcessSale(BuildSale(prod, SupervisorPin), null);
            Assert.IsNotNull(sale);
            Assert.AreEqual(4500, sale.Items[0].UnitPricePiasters, "السعر المحجوز محفوظ");

            string details = AuditDetails("SALE_PRICE_OVERRIDE_APPROVED", sale.Id);
            Assert.IsNotNull(details, "اعتماد المشرف مسجل في سجل المراجعة");
            StringAssert.Contains(prod.Id, details);
            StringAssert.Contains("\"cataloguePricePiasters\":5000", details);
            StringAssert.Contains("\"soldPricePiasters\":4500", details);
            StringAssert.Contains("\"supervisor\":", details);
        }

        private static Sale BuildSale(Product prod, string supervisorPin)
        {
            return new Sale
            {
                CashierId = CashierId,
                PaymentMethod = "cash",
                PaidPiasters = 4500,
                SupervisorPin = supervisorPin,
                Items = new List<SaleItem>
                {
                    new SaleItem { ProductId = prod.Id, ProductName = prod.Name, QuantityMilli = 1000, UnitPricePiasters = 4500, TotalPiasters = 4500 }
                }
            };
        }

        private long CountAudit(string action)
        {
            using (var conn = new SQLiteConnection(ConnectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand("SELECT COUNT(*) FROM audit_logs WHERE action = @a;", conn))
                {
                    cmd.Parameters.AddWithValue("@a", action);
                    return Convert.ToInt64(cmd.ExecuteScalar());
                }
            }
        }

        private string AuditDetails(string action, string saleId)
        {
            using (var conn = new SQLiteConnection(ConnectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand("SELECT details_json FROM audit_logs WHERE action = @a AND entity_id = @id LIMIT 1;", conn))
                {
                    cmd.Parameters.AddWithValue("@a", action);
                    cmd.Parameters.AddWithValue("@id", saleId);
                    object v = cmd.ExecuteScalar();
                    return v == null || v == DBNull.Value ? null : v.ToString();
                }
            }
        }
    }
}
