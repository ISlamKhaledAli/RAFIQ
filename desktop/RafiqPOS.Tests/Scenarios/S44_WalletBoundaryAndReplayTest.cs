using System;
using System.Reflection;
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
    public class S44_WalletBoundaryAndReplayTest : S40_FinanceFixture
    {
        private static JObject Attempt(string accountId, bool funding)
        {
            var payload = new JObject
            {
                { "accountId", accountId }, { "amountPiasters", 10000 },
                { "idempotencyKey", Guid.NewGuid().ToString("N") }, { "notes", "Wallet boundary regression" }
            };
            if (funding) payload["fundingSource"] = "external";
            else
            {
                payload["txType"] = "cash_out";
                payload["profitPiasters"] = 100;
                payload["paymentDestination"] = "external";
            }
            return payload;
        }

        private static string Action(bool funding)
        {
            return funding ? "wallets:fundAccount" : "wallets:processTransaction";
        }

        [TestCase(false)]
        [TestCase(true)]
        public void MissingAttemptKey_RejectsRatherThanPretendingRetrySafety(bool funding)
        {
            var payload = Attempt(Wallet(50000).Id, funding);
            payload.Remove("idempotencyKey");
            string before = FinancialState();
            Assert.IsFalse(Dispatch(Action(funding), payload).Success);
            Assert.AreEqual(before, FinancialState());
        }

        [TestCase(false)]
        [TestCase(true)]
        public void Replay_ReturnsCompleteStoredDto_AndRepositoryGetById(bool funding)
        {
            var payload = Attempt(Wallet(50000).Id, funding);
            var first = DispatchOk(Action(funding), payload);
            var repository = new DigitalAccountRepository(DatabaseService.ConnectionString, DatabaseService.AuditRepo);
            string before = FinancialState();
            var retry = DispatchOk(Action(funding), payload);
            Assert.AreEqual(Data(first).ToString(Formatting.None), Data(retry).ToString(Formatting.None));
            string id = Data(first)["id"].ToString();
            object stored = funding ? (object)repository.GetFundingById(id) : repository.GetTransactionById(id);
            Assert.AreEqual(Data(first).ToString(Formatting.None), JObject.FromObject(stored).ToString(Formatting.None));
            Assert.AreEqual(payload["idempotencyKey"].ToString(), Data(retry)["idempotencyKey"].ToString());
            Assert.IsNotEmpty(Data(retry)["idempotencyFingerprint"].ToString());
            Assert.AreEqual(before, FinancialState());
        }

        [TestCase(false, "notes")]
        [TestCase(false, "customerPhone")]
        [TestCase(false, "customerName")]
        [TestCase(false, "referenceNumber")]
        [TestCase(false, "paymentDestination")]
        [TestCase(true, "notes")]
        [TestCase(true, "fundingSource")]
        public void Replay_ChangedNonAmountPayload_RejectsWithoutMutation(bool funding, string field)
        {
            var payload = Attempt(Wallet(50000).Id, funding);
            DispatchOk(Action(funding), payload);
            payload[field] = field == "paymentDestination" ? "safe" :
                field == "fundingSource" ? "bank_transfer" : "Different value";
            string before = FinancialState();
            Assert.IsFalse(Dispatch(Action(funding), payload).Success);
            Assert.AreEqual(before, FinancialState());
        }

        [TestCase(false)]
        [TestCase(true)]
        public void Replay_ChangedTextCase_RejectsWithoutMutation(bool funding)
        {
            var payload = Attempt(Wallet(50000).Id, funding);
            DispatchOk(Action(funding), payload);
            payload["notes"] = payload["notes"].ToString().ToUpperInvariant();
            string before = FinancialState();
            Assert.IsFalse(Dispatch(Action(funding), payload).Success);
            Assert.AreEqual(before, FinancialState());
        }

        [TestCase(false)]
        [TestCase(true)]
        public void ClientActor_IsNotAuthoritative(bool funding)
        {
            var payload = Attempt(Wallet(50000).Id, funding);
            payload["createdBy"] = "forged-user";
            payload["cashierName"] = "forged-user";
            payload["performedBy"] = "forged-user";
            var response = DispatchOk(Action(funding), payload);
            Assert.AreEqual(funding ? SecurityService.CurrentUser.Id :
                SecurityService.CurrentUser.DisplayName ?? SecurityService.CurrentUser.Username,
                Data(response)[funding ? "createdBy" : "cashierName"].ToString());
            LoginAs(CashierId);
            string before = FinancialState();
            Assert.IsFalse(Dispatch(Action(funding), payload).Success, "A new actor cannot claim an old actor's attempt.");
            Assert.Throws<InvalidOperationException>(delegate
            {
                if (funding) DatabaseService.DigitalAccounts.FundAccount(payload["accountId"].ToString(), 10000,
                    "external", payload["notes"].ToString(), AdminId, payload["idempotencyKey"].ToString());
                else DatabaseService.DigitalAccounts.ProcessTransaction(JsonConvert.DeserializeObject<DigitalTransaction>(payload.ToString()));
            }, "The repository fingerprint must bind the actor independently of the IPC permission gate.");
            Assert.AreEqual(before, FinancialState());
        }

        [Test]
        public void CashGuard_DoesNotDependOnOptionalDailyClosingService()
        {
            OpenShift(0);
            var account = Wallet(0);
            PropertyInfo property = typeof(DatabaseService).GetProperty("DailyClosing");
            object previous = property.GetValue(null, null);
            try
            {
                property.GetSetMethod(true).Invoke(null, new object[] { null });
                string before = FinancialState();
                Assert.Throws<InvalidOperationException>(delegate
                {
                    DatabaseService.DigitalAccounts.ProcessTransaction(new DigitalTransaction
                    {
                        AccountId = account.Id, TxType = " CASH_IN ", AmountPiasters = 10000,
                        ProfitPiasters = 100, IdempotencyKey = Guid.NewGuid().ToString("N")
                    });
                });
                Assert.AreEqual(before, FinancialState());
            }
            finally { property.GetSetMethod(true).Invoke(null, new object[] { previous }); }
        }

        [TestCase(false)]
        [TestCase(true)]
        public void EpayReplay_ReturnsCompleteDto_AndRejectsChangedText(bool funding)
        {
            var repo = new EpayRepository(DatabaseService.ConnectionString, DatabaseService.AuditRepo);
            var terminal = repo.SaveTerminal(new EpayTerminal
            {
                Name = "Replay terminal", Provider = "fawry", BalancePiasters = 50000, IsActive = true
            });
            string key = Guid.NewGuid().ToString("N");
            object first = funding ? (object)repo.FundTerminal(terminal.Id, 10000, "external", "Case sensitive", AdminId, key) :
                repo.CreateTransaction(EpayRequest(terminal.Id, key, "Case sensitive"));
            repo = new EpayRepository(DatabaseService.ConnectionString, DatabaseService.AuditRepo);
            string before = FinancialState();
            object retry = funding ? (object)repo.FundTerminal(terminal.Id, 10000, "external", "Case sensitive", AdminId, key) :
                repo.CreateTransaction(EpayRequest(terminal.Id, key, "Case sensitive"));
            Assert.AreEqual(JsonConvert.SerializeObject(first), JsonConvert.SerializeObject(retry));
            Assert.IsNotEmpty(JObject.FromObject(retry)["idempotencyFingerprint"].ToString());
            Assert.Throws<InvalidOperationException>(delegate
            {
                if (funding) repo.FundTerminal(terminal.Id, 10000, "external", "CASE SENSITIVE", AdminId, key);
                else repo.CreateTransaction(EpayRequest(terminal.Id, key, "CASE SENSITIVE"));
            });
            Assert.AreEqual(before, FinancialState());
        }

        private static EpayTransaction EpayRequest(string terminalId, string key, string notes)
        {
            return new EpayTransaction
            {
                TerminalId = terminalId, ServiceType = "bill", BillAmountPiasters = 10000,
                CustomerFeePiasters = 100, PaymentChannel = "external", IdempotencyKey = key, Notes = notes
            };
        }
    }
}
