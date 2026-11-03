using System;
using System.Collections.Generic;
using System.Data.SQLite;
using System.Threading;
using System.Threading.Tasks;
using NUnit.Framework;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    [TestFixture]
    [NonParallelizable]
    public class S42_InsuranceCafeAndCodSafetyTest : S40_FinanceFixture
    {
        private static Sale InsuredSale(Shift shift, Product product)
        {
            var company = DatabaseService.InsuranceRepo.SaveCompany(new InsuranceCompany { Name = "Lifecycle insurer" });
            var contract = DatabaseService.InsuranceRepo.SaveContract(new InsuranceContract
            {
                CompanyId = company.Id, Name = "Lifecycle contract", PatientShareBps = 2000
            });
            var customer = DatabaseService.Customers.SaveCustomer(new Customer { Name = "Insured customer" });
            var sale = DatabaseService.Sales.ProcessSale(new Sale
            {
                CashierId = AdminId, CashierName = "Finance insurance", ShiftId = shift.Id,
                CustomerId = customer.Id, PaymentMethod = "insurance", PaidPiasters = 2000,
                InsuranceClaim = new InsuranceClaimLine
                {
                    CompanyId = company.Id, ContractId = contract.Id, MemberNo = "FIN-INS-001",
                    PatientName = "Test patient", Status = "pending"
                },
                Items = new List<SaleItem> { new SaleItem
                {
                    ProductId = product.Id, ProductName = product.Name, QuantityMilli = 1000,
                    Unit = product.Unit, ConversionFactor = 1, UnitPricePiasters = 10000, TotalPiasters = 10000
                } }
            }, Guid.NewGuid().ToString("N"));
            Assert.AreEqual(8000, FinanceCount(
                "SELECT company_piasters FROM insurance_claim_lines WHERE sale_id=@s AND status='pending';", "@s", sale.Id));
            Assert.AreEqual(2000, FinanceCount(
                "SELECT SUM(amount_piasters) FROM payments WHERE sale_id=@s AND method='cash';", "@s", sale.Id));
            return sale;
        }

        // Existing submitted batches must be testable even while FIN08 blocks new batch creation.
        // Import fixture: valid parent first, then link; never turn off foreign keys.
        private static string ImportedSubmittedBatch(Sale sale)
        {
            string batchId = Guid.NewGuid().ToString("N");
            FinanceExecute(@"INSERT INTO insurance_claim_batches
                (id,batch_number,company_id,period,total_claims_count,total_amount_piasters,status,created_by,created_at)
                SELECT @b,@number,company_id,'2026-11',1,company_piasters,'submitted',@by,created_at
                FROM insurance_claim_lines WHERE sale_id=@s;
                UPDATE insurance_claim_lines SET status='batched',claim_batch_id=@b WHERE sale_id=@s;",
                "@b", batchId, "@number", "FIN-" + batchId, "@by", AdminId, "@s", sale.Id);
            return batchId;
        }

        [Test]
        public void FIN09_PendingInsuredSaleCancellation_StopsCollectionAndRetainsHistory()
        {
            var shift = OpenShift(50000);
            var product = CreateProduct("Insured stock", 10000, 3000, 10000);
            var sale = InsuredSale(shift, product);
            var cancelled = DatabaseService.SaleRepo.CancelSaleAtomic(sale.Id, "Finance regression", AdminId);
            Assert.AreEqual("cancelled", cancelled.Status);
            Assert.AreEqual(10000, Stock(product.Id));
            Assert.AreEqual(1, FinanceCount("SELECT COUNT(*) FROM insurance_claim_lines WHERE sale_id=@s;", "@s", sale.Id),
                "Reversal must retain auditable claim history.");
            Assert.AreEqual(0, FinanceCount(
                "SELECT COALESCE(SUM(company_piasters),0) FROM insurance_claim_lines WHERE sale_id=@s AND status='pending';",
                "@s", sale.Id), "Cancelled invoices must never remain collectible.");
            Assert.IsFalse(DatabaseService.InsuranceRepo.GetPendingClaimLines().Exists(
                delegate(InsuranceClaimLine line) { return line.SaleId == sale.Id; }));
        }

        [Test]
        public void FIN09_ClaimReversalFailure_RollsBackSaleStockCashAndClaimTogether()
        {
            var shift = OpenShift(50000);
            var sale = InsuredSale(shift, CreateProduct("Atomic insured stock", 10000, 3000, 10000));
            FinanceExecute(@"CREATE TRIGGER fin09_fail_claim_reversal
                BEFORE UPDATE ON insurance_claim_lines
                BEGIN SELECT RAISE(ABORT,'FIN09 injected claim reversal failure'); END;");
            string before = FinancialState();
            var error = Assert.Catch<Exception>(delegate
            {
                DatabaseService.SaleRepo.CancelSaleAtomic(sale.Id, "Finance regression", AdminId);
            });
            StringAssert.Contains("FIN09 injected claim reversal failure", error.ToString());
            Assert.AreEqual(before, FinancialState(), "Insurance, invoice, customer balance and stock must share one transaction.");
        }

        [TestCase("batched", false)]
        [TestCase("settled", false)]
        [TestCase("batched", true)]
        [TestCase("settled", true)]
        public void FIN09_BatchedOrSettledClaim_CancellationAndReturnsRejectUntilReconciliation(string state, bool refund)
        {
            var shift = OpenShift(50000);
            var sale = InsuredSale(shift, CreateProduct("Reconciled stock", 10000, 3000, 10000));
            string batch = ImportedSubmittedBatch(sale);
            if (state == "settled")
                DatabaseService.Insurance.SettleBatch(batch, 8000, 0, null, null, AdminId);
            string before = FinancialState();
            if (refund)
            {
                var request = Refund(sale, sale.Items[0].ProductId, sale.Items[0].Id);
                // This is a valid invoice-customer credit return, not an over-limit cash refund.
                request.CustomerId = sale.CustomerId;
                request.RefundMethod = "credit";
                Assert.Throws<InvalidOperationException>(delegate { DatabaseService.Returns.ProcessReturn(request); });
            }
            else
                Assert.Throws<InvalidOperationException>(delegate { DatabaseService.SaleRepo.CancelSaleAtomic(sale.Id, "Finance regression", AdminId); });
            Assert.AreEqual(before, FinancialState());
        }

        private static void AssertOneRejectionExpense(string batch)
        {
            Assert.AreEqual(1, FinanceCount("SELECT COUNT(*) FROM expenses WHERE category='insurance_rejection' AND is_cancelled=0;"));
            Assert.AreEqual(2000, FinanceCount("SELECT SUM(amount_piasters) FROM expenses WHERE category='insurance_rejection' AND is_cancelled=0;"));
            var settled = DatabaseService.InsuranceRepo.GetBatchById(batch);
            Assert.AreEqual(6000, settled.SettledAmountPiasters);
            Assert.AreEqual(2000, settled.RejectedAmountPiasters);
            Assert.AreEqual("partially_settled", settled.Status);
        }

        [Test]
        public void FIN10_SettlementRetry_CreatesAtMostOneRejectionExpense()
        {
            var shift = OpenShift(50000);
            var batch = ImportedSubmittedBatch(InsuredSale(shift, CreateProduct("Settlement stock", 10000, 3000, 10000)));
            DatabaseService.Insurance.SettleBatch(batch, 6000, 2000, "Rejected test item", "expense", AdminId);
            string before = FinancialState();
            try { DatabaseService.Insurance.SettleBatch(batch, 6000, 2000, "Rejected test item", "expense", AdminId); }
            catch (InvalidOperationException) { }
            AssertOneRejectionExpense(batch);
            Assert.AreEqual(before, FinancialState(), "Replay or terminal rejection must not repost a rejection expense.");
        }

        [Test]
        public void FIN10_ConcurrentSettlementRetry_CreatesAtMostOneRejectionExpense()
        {
            var shift = OpenShift(50000);
            var batch = ImportedSubmittedBatch(InsuredSale(shift, CreateProduct("Concurrent settlement", 10000, 3000, 10000)));
            using (var ready = new CountdownEvent(2))
            using (var go = new ManualResetEventSlim(false))
            {
                var tasks = new Task[2];
                for (int i = 0; i < tasks.Length; i++)
                {
                    tasks[i] = Task.Factory.StartNew(delegate
                    {
                        ready.Signal();
                        if (!go.Wait(TimeSpan.FromSeconds(30))) throw new TimeoutException("Settlement start gate timed out.");
                        try { DatabaseService.Insurance.SettleBatch(batch, 6000, 2000, "Rejected test item", "expense", AdminId); }
                        catch (InvalidOperationException) { } // An explicitly rejected terminal retry is permitted.
                    }, CancellationToken.None, TaskCreationOptions.LongRunning, TaskScheduler.Default);
                }
                bool bothReady = ready.Wait(TimeSpan.FromSeconds(30));
                go.Set();
                Assert.IsTrue(Task.WaitAll(tasks, TimeSpan.FromSeconds(60)), "Settlement workers must terminate before DB cleanup.");
                Assert.IsTrue(bothReady);
            }
            AssertOneRejectionExpense(batch);
        }

        [Test]
        public void FIN02_CodDrawerIsZeroUntilHandover_ThenActualCashNetOfCommission_Once()
        {
            var shift = OpenShift(50000);
            var product = CreateProduct("COD stock", 10000, 3000, 10000);
            var rider = DatabaseService.Delivery.SaveRider(new DeliveryRider
            {
                Name = "Finance rider", Phone = "01012345678", VehicleType = "motorcycle",
                CommissionPerOrderPiasters = 1000, Status = "available", IsActive = true
            });
            var sale = DatabaseService.Sales.ProcessSale(new Sale
            {
                CashierId = AdminId, CashierName = "Finance COD", PaymentMethod = "cash",
                OrderType = "delivery", PaidPiasters = 0,
                DeliveryInfo = new DeliveryOrderCreateInfo
                {
                    CustomerName = "COD customer", CustomerPhone = "01012345678", DeliveryAddress = "Test address"
                },
                Items = new List<SaleItem> { new SaleItem
                {
                    ProductId = product.Id, ProductName = product.Name, QuantityMilli = 1000,
                    UnitPricePiasters = 10000, TotalPiasters = 10000, ConversionFactor = 1, Unit = product.Unit
                } }
            }, Guid.NewGuid().ToString("N"));
            var order = DatabaseService.Delivery.GetOrders().Find(delegate(DeliveryOrder item) { return item.SaleId == sale.Id; });
            Assert.IsNotNull(order);
            Assert.AreEqual(10000, order.TotalToCollectPiasters);
            Assert.AreEqual(1, FinanceCount(
                "SELECT cash_handover_tracked FROM delivery_orders WHERE id=@id;", "@id", order.Id),
                "Only explicitly tracked new orders use the new handover accounting, never a fingerprint inference.");
            Assert.AreEqual(0, FinanceCount(
                "SELECT COUNT(*) FROM cash_drawer_transactions WHERE shift_id=@s;", "@s", shift.Id));
            string day = DatabaseService.DailyClosing.GetCurrentBusinessDate();
            Assert.AreEqual(50000, DatabaseService.DailyClosing.GetLiveDrawerBalance(day).AvailableCashPiasters,
                "The receivable is not physical drawer cash.");
            DatabaseService.Delivery.AssignOrderToRider(order.Id, rider.Id, AdminId);
            DatabaseService.Delivery.UpdateOrderStatus(order.Id, "delivered", AdminId);
            Assert.AreEqual(50000, DatabaseService.DailyClosing.GetLiveDrawerBalance(day).AvailableCashPiasters,
                "Delivery alone is not rider cash handover.");
            var receipt = DatabaseService.Delivery.SettleRider(rider.Id, AdminId, true);
            Assert.AreEqual(9000, receipt.NetDrawerDepositPiasters);
            Assert.AreEqual(59000, DatabaseService.DailyClosing.GetLiveDrawerBalance(day).AvailableCashPiasters);
            Assert.AreEqual(1, FinanceCount(
                "SELECT COUNT(*) FROM cash_drawer_transactions WHERE shift_id=@s AND type='cash_in';", "@s", shift.Id));
            Assert.AreEqual(10000, FinanceCount(
                "SELECT SUM(amount_piasters) FROM cash_drawer_transactions WHERE shift_id=@s AND type='cash_in';", "@s", shift.Id),
                "Record actual gross cash once; the separate supported commission expense gives a net 9,000.");
            Assert.AreEqual(1, FinanceCount(
                "SELECT COUNT(*) FROM expenses WHERE source='drawer' AND amount_piasters=1000 AND is_cancelled=0;"));
            Assert.AreEqual(1, FinanceCount(
                "SELECT is_settled FROM delivery_orders WHERE id=@id AND cash_handover_tracked=1;", "@id", order.Id));
            string before = FinancialState();
            try { DatabaseService.Delivery.SettleRider(rider.Id, AdminId, true); }
            catch (InvalidOperationException) { }
            Assert.AreEqual(before, FinancialState(), "A repeated handover cannot collect the same order twice.");
        }

        [TestCase(true, false, -300)]
        [TestCase(false, false, 0)]
        [TestCase(false, true, -300)]
        public void FIN12_RefundProfit_RecoversCostOnlyWhenInventoryActuallyRestored(bool recipe, bool damaged, long expectedProfit)
        {
            var shift = OpenShift(50000);
            var ingredient = CreateProduct("Recipe ingredient", 0, 300, 5000);
            var product = CreateProduct(recipe ? "Made latte" : "Stocked item", 1000, 300, recipe ? 0 : 5000);
            if (recipe)
                DatabaseService.Recipes.SaveRecipe(new Recipe
                {
                    ProductId = product.Id, Name = "One ingredient recipe", YieldQtyMilli = 1000,
                    DepletionMode = "on_sale", IsActive = true,
                    Ingredients = new List<RecipeIngredient> { new RecipeIngredient
                    {
                        IngredientProductId = ingredient.Id, QuantityMilli = 1000, WastagePercent = 0
                    } }
                }, true);
            var sale = CashSale(product, shift, 1000);
            Assert.AreEqual(300, sale.Items[0].UnitCostPiasters);
            Assert.AreEqual(recipe ? 4000 : 5000, Stock(ingredient.Id));
            var request = Refund(sale, product.Id, sale.Items[0].Id);
            request.Items[0].IsDamaged = damaged;
            DatabaseService.Returns.ProcessReturn(request);
            Assert.AreEqual(recipe ? 4000 : 5000, Stock(ingredient.Id), "A prepared drink refund does not restore consumed ingredients.");
            Assert.AreEqual(recipe ? 0 : (damaged ? 4000 : 5000), Stock(product.Id));
            var reports = new ReportsService(DatabaseService.ConnectionString);
            Assert.AreEqual(expectedProfit, reports.GetTodaySummary().TodayProfitsPiasters, "Dashboard profit.");
            Assert.AreEqual(expectedProfit, reports.GetPeriodSalesReport("today", null, null).GrossProfitPiasters, "Period profit.");
            var item = reports.GetItemProfitability("today", 20, "desc").Find(
                delegate(ItemProfitabilityItem row) { return row.ProductId == product.Id; });
            Assert.IsNotNull(item);
            Assert.AreEqual(expectedProfit, item.GrossProfitPiasters, "Item profit.");
            long categoryProfit = 0;
            foreach (var category in reports.GetCategoryPerformance("today", null, null))
                categoryProfit += category.GrossProfitPiasters;
            Assert.AreEqual(expectedProfit, categoryProfit, "Category profit.");
            Assert.AreEqual(expectedProfit, reports.GetPeriodComparison("today").Profit.Current, "Period comparison profit.");
            Assert.AreEqual(expectedProfit, DatabaseService.DailyClosing.GetClosingPreview(
                DatabaseService.DailyClosing.GetCurrentBusinessDate()).GrossProfitPiasters, "Daily closing profit.");
        }
    }
}
