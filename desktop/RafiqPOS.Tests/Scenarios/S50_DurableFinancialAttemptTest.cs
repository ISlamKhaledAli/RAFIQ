using System;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using RafiqPOS.Models;
using RafiqPOS.Repositories;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    [TestFixture]
    [NonParallelizable]
    public class S50_DurableFinancialAttemptTest : S40_FinanceFixture
    {
        private JObject Payload(string operation)
        {
            bool wallet = operation.StartsWith("wallets:", StringComparison.Ordinal);
            bool funding = operation.EndsWith("fundAccount", StringComparison.Ordinal) || operation.EndsWith("fundTerminal", StringComparison.Ordinal);
            string id = wallet ? Wallet(50000).Id : new EpayRepository(DatabaseService.ConnectionString, DatabaseService.AuditRepo)
                .SaveTerminal(new EpayTerminal { Name = "Durable attempt", Provider = "fawry", BalancePiasters = 50000, IsActive = true }).Id;
            var payload = new JObject { { wallet ? "accountId" : "terminalId", id },
                { "idempotencyKey", "financial_v1:" + Uri.EscapeDataString(AdminId) + ":" + Guid.NewGuid().ToString("N") } };
            if (funding)
            {
                payload["amountPiasters"] = 10000;
                payload["fundingSource"] = "external";
            }
            else if (wallet)
            {
                payload["amountPiasters"] = 10000;
                payload["profitPiasters"] = 100;
                payload["txType"] = "cash_in";
                payload["paymentDestination"] = "external";
            }
            else
            {
                payload["billAmountPiasters"] = 10000;
                payload["serviceType"] = "bill";
                payload["customerFeePiasters"] = 100;
                payload["paymentChannel"] = "external";
            }
            return payload;
        }

        private static FinancialAttemptResult Resolve(string operation, JObject payload, bool abandon, string actor)
        {
            return operation.StartsWith("wallets:", StringComparison.Ordinal) ?
                DatabaseService.DigitalAccounts.ResolveAttempt(operation, payload, actor, abandon) :
                new EpayRepository(DatabaseService.ConnectionString, DatabaseService.AuditRepo).ResolveAttempt(operation, payload, actor, abandon);
        }

        private static object Post(string operation, JObject payload)
        {
            switch (operation)
            {
                case "wallets:processTransaction": return DatabaseService.DigitalAccounts.ProcessTransaction(payload.ToObject<DigitalTransaction>());
                case "wallets:fundAccount": return DatabaseService.DigitalAccounts.FundAccount((string)payload["accountId"], 10000, "external", null, AdminId, (string)payload["idempotencyKey"]);
                case "epay:createTransaction": return new EpayRepository(DatabaseService.ConnectionString, DatabaseService.AuditRepo).CreateTransaction(payload.ToObject<EpayTransaction>());
                case "epay:fundTerminal": return new EpayRepository(DatabaseService.ConnectionString, DatabaseService.AuditRepo).FundTerminal((string)payload["terminalId"], 10000, "external", null, AdminId, (string)payload["idempotencyKey"]);
                default: throw new ArgumentException("Unsupported test operation");
            }
        }

        [TestCase("wallets:processTransaction")]
        [TestCase("wallets:fundAccount")]
        [TestCase("epay:createTransaction")]
        [TestCase("epay:fundTerminal")]
        public void MissingIsNonfinal_DurableAbandonmentBlocksLateWrite_AndIsActorBound(string operation)
        {
            var payload = Payload(operation);
            string before = FinancialState();
            var missing = Resolve(operation, payload, false, AdminId);
            Assert.AreEqual("pending", missing.Status);
            Assert.IsNull(missing.Data);
            Assert.AreEqual(0, FinanceCount("SELECT COUNT(*) FROM financial_attempt_cancellations;"));
            Assert.AreEqual(before, FinancialState());
            Assert.AreEqual("abandoned", Resolve(operation, payload, true, AdminId).Status);
            Assert.AreEqual("abandoned", Resolve(operation, payload, true, AdminId).Status);
            Assert.AreEqual(1, FinanceCount("SELECT COUNT(*) FROM financial_attempt_cancellations;"));
            Assert.AreEqual(1, FinanceCount("SELECT COUNT(*) FROM audit_logs WHERE action='financial_attempt_abandon';"));
            Assert.Throws<InvalidOperationException>(delegate { Post(operation, payload); });
            Assert.AreEqual(before, FinancialState(), "Neither abandonment nor a late queued request may change financial rows.");
            var changed = (JObject)payload.DeepClone();
            changed[operation == "epay:createTransaction" ? "billAmountPiasters" : "amountPiasters"] = 11000;
            Assert.Throws<InvalidOperationException>(delegate { Resolve(operation, changed, true, AdminId); });
            Assert.Throws<InvalidOperationException>(delegate { Resolve(operation, payload, true, CashierId); });
            LoginAs(CashierId);
            Assert.Throws<InvalidOperationException>(delegate { Resolve(operation, payload, true, CashierId); });
            Assert.AreEqual(before, FinancialState());
        }

        [TestCase("wallets:processTransaction")]
        [TestCase("wallets:fundAccount")]
        [TestCase("epay:createTransaction")]
        [TestCase("epay:fundTerminal")]
        public void CommitThenLostResponse_ReconcileOrAbandonReturnsCompleteDtoWithoutSecondPosting(string operation)
        {
            var payload = Payload(operation);
            object saved = Post(operation, payload);
            string before = FinancialState();
            foreach (bool abandon in new[] { false, true })
            {
                var result = Resolve(operation, payload, abandon, AdminId);
                Assert.AreEqual("committed", result.Status);
                Assert.AreEqual(JsonConvert.SerializeObject(saved), JsonConvert.SerializeObject(result.Data));
                Assert.AreEqual(payload["idempotencyKey"].ToString(), result.IdempotencyKey);
                Assert.AreEqual(JObject.FromObject(result.Data)["idempotencyFingerprint"].ToString(), result.RequestFingerprint);
                Assert.AreEqual(AdminId, result.ActorId);
            }
            Assert.AreEqual(0, FinanceCount("SELECT COUNT(*) FROM financial_attempt_cancellations;"));
            Assert.AreEqual(before, FinancialState());
        }

        [TestCase("wallets:processTransaction")]
        [TestCase("wallets:fundAccount")]
        [TestCase("epay:createTransaction")]
        [TestCase("epay:fundTerminal")]
        public void UncommittedKeyCannotBePostedOrAbandonedByAnotherActor(string operation)
        {
            var payload = Payload(operation);
            LoginAs(CashierId);
            string before = FinancialState();
            Assert.Throws<InvalidOperationException>(delegate { Post(operation, payload); });
            Assert.Throws<InvalidOperationException>(delegate { Resolve(operation, payload, true, CashierId); });
            Assert.AreEqual(0, FinanceCount("SELECT COUNT(*) FROM financial_attempt_cancellations;"));
            Assert.AreEqual(before, FinancialState());
        }
    }
}
