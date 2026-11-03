using System;
using System.Collections.Generic;
using System.Data.SQLite;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json;
using NUnit.Framework;
using RafiqPOS.Models;
using RafiqPOS.Repositories;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    [TestFixture]
    [NonParallelizable]
    public class S48_CheckoutAbandonBarrierTest : S40_FinanceFixture
    {
        private sealed class Outcome
        {
            public Sale Sale;
            public InvalidOperationException Error;
        }

        private static Sale Attempt(Product product, Shift shift, string key)
        {
            return new Sale
            {
                IdempotencyKey = key, CashierId = AdminId, CashierName = "Abandon barrier regression",
                ShiftId = shift.Id, PaymentMethod = "cash", PaidPiasters = 10000,
                Items = new List<SaleItem> { new SaleItem
                {
                    ProductId = product.Id, ProductName = product.Name, QuantityMilli = 1000,
                    Unit = product.Unit, ConversionFactor = 1, UnitPricePiasters = 10000, TotalPiasters = 10000
                } }
            };
        }

        private static SaleService RecreatedService()
        {
            SaleService.ClearIdempotencyCache();
            return new SaleService(new SaleRepository(DatabaseService.ConnectionString,
                DatabaseService.CounterRepo, DatabaseService.AuditRepo), DatabaseService.ProductRepo);
        }

        private static string StateWithCancellations()
        {
            var rows = new List<string>();
            using (var conn = OpenFinanceConnection())
            using (var cmd = new SQLiteCommand("SELECT * FROM sale_checkout_cancellations;", conn))
            using (var reader = cmd.ExecuteReader())
            {
                while (reader.Read())
                {
                    var values = new object[reader.FieldCount];
                    reader.GetValues(values);
                    rows.Add(JsonConvert.SerializeObject(values));
                }
            }
            rows.Sort(StringComparer.Ordinal);
            return FinancialState() + JsonConvert.SerializeObject(rows);
        }

        private static void AssertOneDurableCancellation(Sale request, string key)
        {
            Assert.AreEqual(0, FinanceCount("SELECT COUNT(*) FROM sales WHERE idempotency_key=@key;", "@key", key));
            Assert.AreEqual(1, FinanceCount("SELECT COUNT(*) FROM sale_checkout_cancellations WHERE idempotency_key=@key;", "@key", key));
            Assert.AreEqual(SaleService.CheckoutFingerprint(request), Convert.ToString(FinanceValue(
                "SELECT request_fingerprint FROM sale_checkout_cancellations WHERE idempotency_key=@key;", "@key", key)));
            Assert.AreEqual(AdminId, Convert.ToString(FinanceValue(
                "SELECT actor_id FROM sale_checkout_cancellations WHERE idempotency_key=@key;", "@key", key)));
            Guid id;
            Assert.IsTrue(Guid.TryParse(Convert.ToString(FinanceValue(
                "SELECT id FROM sale_checkout_cancellations WHERE idempotency_key=@key;", "@key", key)), out id));
            Assert.AreNotEqual(Guid.Empty, id);
            Assert.IsNotEmpty(Convert.ToString(FinanceValue(
                "SELECT cancelled_at FROM sale_checkout_cancellations WHERE idempotency_key=@key;", "@key", key)));
        }

        private static Outcome Observe(Func<Sale> operation)
        {
            try { return new Outcome { Sale = operation() }; }
            catch (InvalidOperationException error) { return new Outcome { Error = error }; }
        }

        [Test]
        public void FIN11_AbandonBeforeQueuedCreate_AcknowledgesDurableBarrierAndPreventsPosting()
        {
            var shift = OpenShift(50000);
            var product = CreateProduct("Queued checkout stock", 10000, 3000, 10000);
            string key = Guid.NewGuid().ToString("N");
            string afterAck = null;
            using (var queued = new ManualResetEventSlim(false))
            using (var release = new ManualResetEventSlim(false))
            {
                var create = Task.Factory.StartNew(delegate
                {
                    queued.Set();
                    if (!release.Wait(TimeSpan.FromSeconds(30))) throw new TimeoutException("Queued create start gate timed out.");
                    return Observe(delegate { return DatabaseService.Sales.ProcessSale(Attempt(product, shift, key), key); });
                }, CancellationToken.None, TaskCreationOptions.LongRunning, TaskScheduler.Default);
                try
                {
                    Assert.IsTrue(queued.Wait(TimeSpan.FromSeconds(30)));
                    var request = Attempt(product, shift, key);
                    Assert.IsNull(DatabaseService.Sales.AbandonCheckout(request, key),
                        "Here null is an acknowledged durable cancellation, not a read-only lookup miss.");
                    AssertOneDurableCancellation(request, key);
                    afterAck = StateWithCancellations();
                }
                finally
                {
                    release.Set();
                    Assert.IsTrue(create.Wait(TimeSpan.FromSeconds(60)), "Queued worker must finish before test DB cleanup.");
                }
                Assert.IsNull(create.Result.Sale);
                Assert.IsNotNull(create.Result.Error);
                StringAssert.StartsWith("SALE_CHECKOUT_ABANDONED", create.Result.Error.Message);
            }
            Assert.AreEqual(afterAck, StateWithCancellations());
            Assert.AreEqual(10000, Stock(product.Id));
        }

        [Test]
        public void FIN11_AbandonAfterCommittedSale_ReturnsOriginalWithoutMoneyOrTombstoneChanges()
        {
            var shift = OpenShift(50000);
            var product = CreateProduct("Committed checkout stock", 10000, 3000, 10000);
            string key = Guid.NewGuid().ToString("N");
            var sale = DatabaseService.Sales.ProcessSale(Attempt(product, shift, key), key);
            string before = StateWithCancellations();
            var result = RecreatedService().AbandonCheckout(Attempt(product, shift, key), key);
            Assert.IsNotNull(result);
            Assert.AreEqual(sale.Id, result.Id);
            Assert.AreEqual(sale.InvoiceNumber, result.InvoiceNumber);
            Assert.AreEqual(10000, result.TotalPiasters);
            Assert.AreEqual(before, StateWithCancellations(), "A committed sale cannot be erased, reversed or masked by an abandon tombstone.");
            Assert.AreEqual(0, FinanceCount("SELECT COUNT(*) FROM sale_checkout_cancellations WHERE idempotency_key=@key;", "@key", key));
            Assert.AreEqual(9000, Stock(product.Id));
        }

        [TestCase(false)]
        [TestCase(true)]
        public void FIN11_MatchingAbandonRetry_IsIdempotentAndPreservesOriginalAcknowledgment(bool recreated)
        {
            var shift = OpenShift(50000);
            var product = CreateProduct("Retry abandon stock", 10000, 3000, 10000);
            string key = Guid.NewGuid().ToString("N");
            Assert.IsNull(DatabaseService.Sales.AbandonCheckout(Attempt(product, shift, key), key));
            string before = StateWithCancellations();
            var service = recreated ? RecreatedService() : DatabaseService.Sales;
            Assert.IsNull(service.AbandonCheckout(Attempt(product, shift, key), key));
            Assert.AreEqual(before, StateWithCancellations(), "Retry must retain the original UUID, actor and acknowledgment timestamp.");
            AssertOneDurableCancellation(Attempt(product, shift, key), key);
        }

        [TestCase(false, "goods")]
        [TestCase(false, "quantity")]
        [TestCase(false, "payment")]
        [TestCase(true, "goods")]
        [TestCase(true, "quantity")]
        [TestCase(true, "payment")]
        public void FIN11_ChangedPayloadAbandon_ConflictsWithoutMutation(bool committed, string change)
        {
            var shift = OpenShift(50000);
            var product = CreateProduct("Original attempt", 10000, 3000, 10000);
            var other = CreateProduct("Different attempt", 10000, 3000, 10000);
            string key = Guid.NewGuid().ToString("N");
            if (committed) DatabaseService.Sales.ProcessSale(Attempt(product, shift, key), key);
            else DatabaseService.Sales.AbandonCheckout(Attempt(product, shift, key), key);
            var changed = Attempt(change == "goods" ? other : product, shift, key);
            if (change == "quantity")
            {
                changed.Items[0].QuantityMilli = 2000;
                changed.Items[0].TotalPiasters = 20000;
                changed.PaidPiasters = 20000;
            }
            if (change == "payment") changed.PaidPiasters = 11000;
            string before = StateWithCancellations();
            var error = Assert.Throws<InvalidOperationException>(delegate { RecreatedService().AbandonCheckout(changed, key); });
            StringAssert.StartsWith("SALE_IDEMPOTENCY_CONFLICT", error.Message);
            Assert.AreEqual(before, StateWithCancellations());
        }

        [TestCase(false)]
        [TestCase(true)]
        public void FIN11_LateCreateAfterCacheClearAndServiceRecreation_CannotCrossAbandonBarrier(bool changedPayload)
        {
            var shift = OpenShift(50000);
            var product = CreateProduct("Late checkout stock", 10000, 3000, 10000);
            string key = Guid.NewGuid().ToString("N");
            Assert.IsNull(DatabaseService.Sales.AbandonCheckout(Attempt(product, shift, key), key));
            var request = Attempt(product, shift, key);
            if (changedPayload) request.PaidPiasters = 11000;
            string before = StateWithCancellations();
            var service = RecreatedService();
            var error = Assert.Throws<InvalidOperationException>(delegate { service.ProcessSale(request, key); });
            StringAssert.StartsWith(changedPayload ? "SALE_IDEMPOTENCY_CONFLICT" : "SALE_CHECKOUT_ABANDONED", error.Message);
            Assert.AreEqual(before, StateWithCancellations());
            AssertOneDurableCancellation(Attempt(product, shift, key), key);
        }

        [Test]
        public void FIN11_CreateRacingAbandon_HasExactlyOneDurableTerminalOutcome()
        {
            var shift = OpenShift(50000);
            var product = CreateProduct("Racing checkout stock", 10000, 3000, 10000);
            string key = Guid.NewGuid().ToString("N");
            var operations = new Func<Sale>[]
            {
                delegate { return DatabaseService.Sales.ProcessSale(Attempt(product, shift, key), key); },
                delegate { return DatabaseService.Sales.AbandonCheckout(Attempt(product, shift, key), key); }
            };
            Outcome[] results;
            using (var ready = new CountdownEvent(2))
            using (var start = new ManualResetEventSlim(false))
            {
                var tasks = new Task<Outcome>[2];
                for (int i = 0; i < tasks.Length; i++)
                {
                    Func<Sale> operation = operations[i];
                    tasks[i] = Task.Factory.StartNew(delegate
                    {
                        ready.Signal();
                        if (!start.Wait(TimeSpan.FromSeconds(30))) throw new TimeoutException("Create/abandon race start gate timed out.");
                        return Observe(operation);
                    }, CancellationToken.None, TaskCreationOptions.LongRunning, TaskScheduler.Default);
                }
                bool bothReady = ready.Wait(TimeSpan.FromSeconds(30));
                start.Set();
                Assert.IsTrue(Task.WaitAll(tasks, TimeSpan.FromSeconds(60)));
                Assert.IsTrue(bothReady);
                results = new Outcome[] { tasks[0].Result, tasks[1].Result };
            }
            Assert.IsNull(results[1].Error, "A matching abandon must return either the committed sale or durable cancellation acknowledgment.");
            long sales = FinanceCount("SELECT COUNT(*) FROM sales WHERE idempotency_key=@key;", "@key", key);
            long cancelled = FinanceCount("SELECT COUNT(*) FROM sale_checkout_cancellations WHERE idempotency_key=@key;", "@key", key);
            Assert.AreEqual(1, sales + cancelled, "Never both a committed sale and a cancellation tombstone, and never an unacknowledged gap.");
            if (sales == 1)
            {
                Assert.IsNull(results[0].Error);
                Assert.IsNotNull(results[0].Sale);
                Assert.IsNotNull(results[1].Sale);
                Assert.AreEqual(results[0].Sale.Id, results[1].Sale.Id);
                Assert.AreEqual(9000, Stock(product.Id));
            }
            else
            {
                Assert.IsNull(results[0].Sale);
                Assert.IsNotNull(results[0].Error);
                StringAssert.StartsWith("SALE_CHECKOUT_ABANDONED", results[0].Error.Message);
                Assert.IsNull(results[1].Sale);
                Assert.AreEqual(10000, Stock(product.Id));
                AssertOneDurableCancellation(Attempt(product, shift, key), key);
            }
            Assert.AreEqual(sales * 10000, FinanceCount(
                "SELECT COALESCE(SUM(amount_piasters),0) FROM payments WHERE method='cash' " +
                "AND sale_id IN (SELECT id FROM sales WHERE idempotency_key=@key);", "@key", key));
        }

        [Test]
        public void FIN11_ReconcileAcknowledgedAbandon_IsDefinitiveAndReadOnlyAfterRecreation()
        {
            var shift = OpenShift(50000);
            var product = CreateProduct("Abandoned reconciliation stock", 10000, 3000, 10000);
            string key = Guid.NewGuid().ToString("N");
            Assert.IsNull(DatabaseService.Sales.AbandonCheckout(Attempt(product, shift, key), key));
            string before = StateWithCancellations();
            var error = Assert.Throws<InvalidOperationException>(delegate
            {
                RecreatedService().ReconcileCheckout(Attempt(product, shift, key), key);
            });
            StringAssert.StartsWith("SALE_CHECKOUT_ABANDONED", error.Message);
            Assert.AreEqual(before, StateWithCancellations());
        }

        [Test]
        public void FIN11_AbandonAuditActor_ComesFromAuthenticatedSessionNotSubmittedCashier()
        {
            var shift = OpenShift(50000);
            var product = CreateProduct("Actor checkout stock", 10000, 3000, 10000);
            string key = Guid.NewGuid().ToString("N");
            var request = Attempt(product, shift, key);
            request.CashierId = CashierId;
            Assert.IsNull(DatabaseService.Sales.AbandonCheckout(request, key));
            AssertOneDurableCancellation(request, key);
        }
    }
}
