using System;
using System.Collections.Generic;
using System.IO;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    [TestFixture]
    [NonParallelizable]
    public class S54_CashTenderContractTest : S40_FinanceFixture
    {
        [Test]
        public void ActualCashSubmit_84Bill100Received_Persists100Tender16ChangeAnd84DrawerWithoutCustomerCredit()
        {
            // The Node contract test executes PaymentModal.handleConfirm and compares its emitted object
            // to this SAME fixture. Do not assume the host reconstructs gross tender from net allocation.
            var payment = JObject.Parse(File.ReadAllText(Path.Combine(
                TestContext.CurrentContext.TestDirectory, "Fixtures", "cash_tender_84_100.json")));
            var shift = OpenShift(0);
            var product = CreateProduct("Cash tender contract product", 8400, 3000, 10000);
            long ledgerBefore = FinanceCount("SELECT COUNT(*) FROM customer_ledger;");
            long balancesBefore = FinanceCount("SELECT COALESCE(SUM(balance_piasters),0) FROM customers;");
            string key = "financial_v1:" + Uri.EscapeDataString(AdminId) + ":" + Guid.NewGuid().ToString("N");
            var request = new Sale
            {
                CashierId = AdminId, CashierName = "Cash tender contract", ShiftId = shift.Id,
                SubtotalPiasters = 8400, TotalPiasters = 8400, Status = "completed",
                PaymentMethod = payment["paymentMethod"].Value<string>(),
                PaidPiasters = payment["paidPiasters"].Value<long>(),
                ChangePiasters = payment["changeDuePiasters"].Value<long>(),
                CustomerId = payment["customerId"].Type == JTokenType.Null ? null : payment["customerId"].Value<string>(),
                Payments = payment["payments"].ToObject<List<SalePayment>>(),
                Items = new List<SaleItem> { new SaleItem
                {
                    ProductId = product.Id, ProductName = product.Name, QuantityMilli = 1000,
                    Unit = product.Unit, ConversionFactor = 1, UnitPricePiasters = 8400, TotalPiasters = 8400
                } }
            };
            Sale sale;
            using (ProductWritePolicy.EnterRequest(SecurityService.CaptureRequestAdmission()))
                sale = DatabaseService.Sales.ProcessSale(request, key);

            Assert.AreEqual(8400, sale.TotalPiasters);
            Assert.AreEqual(10000, sale.PaidPiasters, "Receipt must retain the actual 100-pound tender.");
            Assert.AreEqual(1600, sale.ChangePiasters, "Receipt must retain the 16-pound cash change.");
            Assert.AreEqual(10000, FinanceCount("SELECT paid_piasters FROM sales WHERE id=@id;", "@id", sale.Id));
            Assert.AreEqual(1600, FinanceCount("SELECT change_piasters FROM sales WHERE id=@id;", "@id", sale.Id));
            Assert.AreEqual(10000, FinanceCount(
                "SELECT SUM(amount_piasters) FROM payments WHERE sale_id=@id AND method='cash';", "@id", sale.Id));
            Assert.AreEqual(8400, DatabaseService.Shifts.GetShiftSummary(shift.Id).ExpectedCashPiasters,
                "Actual physical drawer contribution is 84 pounds, not 68 or 100.");
            Assert.AreEqual(8400, DatabaseService.DailyClosing.GetLiveDrawerBalance(
                DatabaseService.DailyClosing.GetCurrentBusinessDate()).AvailableCashPiasters);
            Assert.AreEqual(ledgerBefore, FinanceCount("SELECT COUNT(*) FROM customer_ledger;"));
            Assert.AreEqual(balancesBefore, FinanceCount("SELECT COALESCE(SUM(balance_piasters),0) FROM customers;"),
                "Normal cash change must not become customer-account credit.");
        }
    }
}
