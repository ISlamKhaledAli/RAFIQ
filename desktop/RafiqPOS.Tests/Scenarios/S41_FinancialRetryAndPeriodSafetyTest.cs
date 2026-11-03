using System;
using System.Collections.Generic;
using System.Globalization;
using System.Reflection;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using RafiqPOS.Bridge;
using RafiqPOS.Models;
using RafiqPOS.Repositories;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    [TestFixture]
    [NonParallelizable]
    public class S41_FinancialRetryAndPeriodSafetyTest : S40_FinanceFixture
    {
        private static JObject WalletAttempt(string accountId, string key, long amount, bool funding)
        {
            var payload = new JObject
            {
                { "accountId", accountId }, { "amountPiasters", amount }, { "idempotencyKey", key }
            };
            if (funding)
            {
                payload["fundingSource"] = "external";
                payload["source"] = "external";
            }
            else
            {
                payload["txType"] = "cash_out";
                payload["profitPiasters"] = 100;
                payload["paymentDestination"] = "external";
                payload["customerPhone"] = "01012345678";
            }
            return payload;
        }

        private static string WalletAction(bool funding)
        {
            return funding ? "wallets:fundAccount" : "wallets:processTransaction";
        }

        private static void ReloadWalletRepository()
        {
            typeof(DatabaseService).GetProperty("DigitalAccounts").GetSetMethod(true).Invoke(null,
                new object[] { new DigitalAccountRepository(DatabaseService.ConnectionString, DatabaseService.AuditRepo) });
        }

        private static T[] Race<T>(Func<int, T> operation)
        {
            using (var ready = new CountdownEvent(2))
            using (var go = new ManualResetEventSlim(false))
            {
                var tasks = new Task<T>[2];
                for (int i = 0; i < tasks.Length; i++)
                {
                    int worker = i;
                    tasks[i] = Task.Factory.StartNew(delegate
                    {
                        ready.Signal();
                        if (!go.Wait(TimeSpan.FromSeconds(30))) throw new TimeoutException("Race start gate timed out.");
                        return operation(worker);
                    }, CancellationToken.None, TaskCreationOptions.LongRunning, TaskScheduler.Default);
                }
                bool bothReady = ready.Wait(TimeSpan.FromSeconds(30));
                go.Set();
                Assert.IsTrue(Task.WaitAll(tasks, TimeSpan.FromSeconds(60)), "Both workers must terminate before DB cleanup.");
                Assert.IsTrue(bothReady, "Both independent callers must reach the start gate.");
                return new T[] { tasks[0].Result, tasks[1].Result };
            }
        }

        [TestCase(false)]
        [TestCase(true)]
        public void FIN04_WalletRetry_SamePayloadReturnsOriginal_AfterRepositoryRecreation(bool funding)
        {
            var account = Wallet(50000);
            string key = Guid.NewGuid().ToString("N");
            var first = DispatchOk(WalletAction(funding), WalletAttempt(account.Id, key, 10000, funding));
            string afterFirst = FinancialState();
            ReloadWalletRepository();
            var retry = DispatchOk(WalletAction(funding), WalletAttempt(account.Id, key, 10000, funding));
            Assert.AreEqual(Data(first)["id"].ToString(), Data(retry)["id"].ToString(), "Retry must return durable original identity.");
            Assert.AreEqual(afterFirst, FinancialState(), "Retry cannot mutate timestamps, counters, balances or any ledger.");
            Assert.AreEqual(funding ? 60000 : 40000, DatabaseService.DigitalAccounts.GetAccountById(account.Id).BalancePiasters);
            Assert.AreEqual(1, FinanceCount("SELECT COUNT(*) FROM digital_transactions WHERE account_id=@a;", "@a", account.Id));
            Assert.AreEqual(funding ? 1 : 0, FinanceCount(
                "SELECT COUNT(*) FROM digital_account_fundings WHERE account_id=@a;", "@a", account.Id));
        }

        [TestCase(false)]
        [TestCase(true)]
        public void FIN04_WalletRetry_ChangedPayloadRejectsWithoutMutation(bool funding)
        {
            var account = Wallet(50000);
            string key = Guid.NewGuid().ToString("N");
            DispatchOk(WalletAction(funding), WalletAttempt(account.Id, key, 10000, funding));
            ReloadWalletRepository();
            string before = FinancialState();
            var changed = Dispatch(WalletAction(funding), WalletAttempt(account.Id, key, 11000, funding));
            Assert.IsFalse(changed.Success, "Same key with a different amount is not a new posting or a successful old result.");
            Assert.AreEqual(before, FinancialState());
        }

        [TestCase(false, false)]
        [TestCase(true, false)]
        [TestCase(false, true)]
        [TestCase(true, true)]
        public void FIN04_WalletConcurrentRetries_PostExactlyOnce(bool funding, bool changedPayload)
        {
            var account = Wallet(50000);
            string key = Guid.NewGuid().ToString("N");
            var responses = Race<BridgeResponse>(delegate(int worker)
            {
                return Dispatch(WalletAction(funding),
                    WalletAttempt(account.Id, key, changedPayload && worker == 1 ? 11000 : 10000, funding));
            });
            int successes = (responses[0].Success ? 1 : 0) + (responses[1].Success ? 1 : 0);
            Assert.AreEqual(changedPayload ? 1 : 2, successes,
                "Equal requests replay; different requests sharing a key have exactly one winner. " +
                Describe(responses[0]) + " / " + Describe(responses[1]));
            if (!changedPayload)
                Assert.AreEqual(Data(responses[0])["id"].ToString(), Data(responses[1])["id"].ToString());
            Assert.AreEqual(1, FinanceCount("SELECT COUNT(*) FROM digital_transactions WHERE account_id=@a;", "@a", account.Id));
            Assert.AreEqual(funding ? 1 : 0, FinanceCount(
                "SELECT COUNT(*) FROM digital_account_fundings WHERE account_id=@a;", "@a", account.Id));
            long posted = FinanceCount("SELECT amount_piasters FROM digital_transactions WHERE account_id=@a;", "@a", account.Id);
            Assert.AreEqual(50000 + (funding ? posted : -posted),
                DatabaseService.DigitalAccounts.GetAccountById(account.Id).BalancePiasters);
        }

        [TestCase(false)]
        [TestCase(true)]
        public void FIN05_OriginalDaySealed_CancellationRejectsWithoutHistoricalRewrite(bool epay)
        {
            OpenShift(50000);
            string id;
            string table;
            var epayRepo = new EpayRepository(DatabaseService.ConnectionString, DatabaseService.AuditRepo);
            if (epay)
            {
                var terminal = epayRepo.SaveTerminal(new EpayTerminal
                {
                    Name = "Period regression terminal", Provider = "fawry", BalancePiasters = 50000, IsActive = true
                });
                id = epayRepo.CreateTransaction(new EpayTransaction
                {
                    TerminalId = terminal.Id, ServiceType = "bill", BillAmountPiasters = 10000,
                    CustomerFeePiasters = 100, PaymentChannel = "cash_drawer", CashierName = "Finance regression"
                }).Id;
                table = "epay_transactions";
            }
            else
            {
                var account = Wallet(50000);
                id = DatabaseService.DigitalAccounts.ProcessTransaction(new DigitalTransaction
                {
                    AccountId = account.Id, TxType = "cash_out", AmountPiasters = 10000,
                    ProfitPiasters = 100, PaymentDestination = "cash_drawer", CashierName = "Finance regression"
                }).Id;
                table = "digital_transactions";
            }
            // Fixture-only historical timestamp, because the production API has no injected clock.
            DateTime oldDay = DateTime.ParseExact(DatabaseService.DailyClosing.GetCurrentBusinessDate(),
                "yyyy-MM-dd", CultureInfo.InvariantCulture).AddDays(-2);
            FinanceExecute("UPDATE " + table + " SET created_at=@at WHERE id=@id;",
                "@at", oldDay.AddHours(12).ToString("o"), "@id", id);
            string oldBusinessDate = oldDay.ToString("yyyy-MM-dd");
            long oldContribution = DrawerCashCalculator.Calculate(DatabaseService.ConnectionString,
                oldDay, oldDay.AddDays(1)).ExpectedCashPiasters;
            Assert.AreEqual(10100, oldContribution, "The original transaction must actually contribute to historical cash.");
            DatabaseService.DailyClosing.SaveClosing(new DailyClosingSaveRequest
            {
                BusinessDate = oldBusinessDate, ActualCashPiasters = oldContribution,
                CashierId = AdminId, ConfirmSuspiciousDate = true
            });
            string before = FinancialState();
            if (epay)
                Assert.Throws<InvalidOperationException>(delegate { epayRepo.CancelTransaction(id, "Regression", AdminId); });
            else
                Assert.Throws<InvalidOperationException>(delegate { DatabaseService.DigitalAccounts.CancelTransaction(id, "Regression", AdminId); });
            Assert.AreEqual(before, FinancialState());
            Assert.AreEqual(oldContribution, DrawerCashCalculator.Calculate(DatabaseService.ConnectionString,
                oldDay, oldDay.AddDays(1)).ExpectedCashPiasters, "Today's cancellation cannot erase sealed historical cash.");
        }

        [TestCase(false)]
        [TestCase(true)]
        public void FIN05_OpenDayCancellation_ReversesOnlyOnce(bool epay)
        {
            OpenShift(50000);
            string day = DatabaseService.DailyClosing.GetCurrentBusinessDate();
            var repo = new EpayRepository(DatabaseService.ConnectionString, DatabaseService.AuditRepo);
            string id;
            string accountId;
            if (epay)
            {
                var terminal = repo.SaveTerminal(new EpayTerminal
                {
                    Name = "Open period terminal", Provider = "fawry", BalancePiasters = 50000, IsActive = true
                });
                accountId = terminal.Id;
                id = repo.CreateTransaction(new EpayTransaction
                {
                    TerminalId = accountId, ServiceType = "bill", BillAmountPiasters = 10000,
                    CustomerFeePiasters = 100, PaymentChannel = "cash_drawer"
                }).Id;
                repo.CancelTransaction(id, "Regression", AdminId);
            }
            else
            {
                accountId = Wallet(50000).Id;
                id = DatabaseService.DigitalAccounts.ProcessTransaction(new DigitalTransaction
                {
                    AccountId = accountId, TxType = "cash_out", AmountPiasters = 10000,
                    ProfitPiasters = 100, PaymentDestination = "cash_drawer"
                }).Id;
                DatabaseService.DigitalAccounts.CancelTransaction(id, "Regression", AdminId);
            }
            Assert.AreEqual(50000, epay ? repo.GetTerminalById(accountId).BalancePiasters
                : DatabaseService.DigitalAccounts.GetAccountById(accountId).BalancePiasters);
            Assert.AreEqual(50000, DatabaseService.DailyClosing.GetLiveDrawerBalance(day).AvailableCashPiasters);
            string before = FinancialState();
            // Either an unchanged replay or an explicit terminal-state rejection is acceptable.
            try
            {
                if (epay) repo.CancelTransaction(id, "Regression", AdminId);
                else DatabaseService.DigitalAccounts.CancelTransaction(id, "Regression", AdminId);
            }
            catch (InvalidOperationException) { }
            Assert.AreEqual(before, FinancialState(), "Already-cancelled posting cannot reverse balances a second time.");
        }

        private static Sale Checkout(Product product, Shift shift, string key)
        {
            return new Sale
            {
                CashierId = AdminId, CashierName = "Finance checkout", ShiftId = shift.Id,
                PaymentMethod = "cash", PaidPiasters = 10000, IdempotencyKey = key,
                Items = new List<SaleItem> { new SaleItem
                {
                    ProductId = product.Id, ProductName = product.Name, QuantityMilli = 1000,
                    Unit = product.Unit, ConversionFactor = 1, UnitPricePiasters = 10000, TotalPiasters = 10000
                } }
            };
        }

        [TestCase("goods", false)]
        [TestCase("customer", false)]
        [TestCase("payment", false)]
        [TestCase("goods", true)]
        [TestCase("customer", true)]
        [TestCase("payment", true)]
        public void FIN11_SameCheckoutKey_ChangedPayloadRejects(string change, bool cacheCold)
        {
            var shift = OpenShift(50000);
            var a = CreateProduct("Checkout A", 10000, 3000, 10000);
            var b = CreateProduct("Checkout B", 10000, 3000, 10000);
            var customer = DatabaseService.Customers.SaveCustomer(new Customer { Name = "Retry customer" });
            string key = Guid.NewGuid().ToString("N");
            DatabaseService.Sales.ProcessSale(Checkout(a, shift, key), key);
            var retry = Checkout(change == "goods" ? b : a, shift, key);
            if (change == "customer") retry.CustomerId = customer.Id;
            if (change == "payment") retry.PaidPiasters = 11000;
            if (cacheCold) SaleService.ClearIdempotencyCache();
            var service = cacheCold ? new SaleService(
                new SaleRepository(DatabaseService.ConnectionString, DatabaseService.CounterRepo, DatabaseService.AuditRepo),
                DatabaseService.ProductRepo) : DatabaseService.Sales;
            string before = FinancialState();
            Assert.Throws<InvalidOperationException>(delegate { service.ProcessSale(retry, key); },
                "Returning the old invoice as a success would silently discard the changed checkout.");
            Assert.AreEqual(before, FinancialState());
        }

        [Test]
        public void FIN11_SamePayloadAfterCacheClearAndServiceRecreation_ReturnsOriginalWithoutPosting()
        {
            var shift = OpenShift(50000);
            var product = CreateProduct("Durable checkout", 10000, 3000, 10000);
            string key = Guid.NewGuid().ToString("N");
            var first = DatabaseService.Sales.ProcessSale(Checkout(product, shift, key), key);
            SaleService.ClearIdempotencyCache();
            var restarted = new SaleService(new SaleRepository(DatabaseService.ConnectionString,
                DatabaseService.CounterRepo, DatabaseService.AuditRepo), DatabaseService.ProductRepo);
            string before = FinancialState();
            var replay = restarted.ProcessSale(Checkout(product, shift, key), key);
            Assert.AreEqual(first.Id, replay.Id);
            Assert.AreEqual(first.InvoiceNumber, replay.InvoiceNumber);
            Assert.AreEqual(before, FinancialState());
            Assert.AreEqual(9000, Stock(product.Id));
        }
    }
}
