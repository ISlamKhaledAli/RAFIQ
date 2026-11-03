using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using Mono.Data.Sqlite;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using RafiqPOS.Bridge;
using RafiqPOS.Models;
using RafiqPOS.Repositories;
using RafiqPOS.Services;

namespace RafiqPOS.Services
{
    public static class SaleService { public static readonly object FinancialWriteLock = new object(); }
    public static class SecurityService
    {
        private static User _user;
        public static long Generation;
        public static User CurrentUser { get { return _user; } set { _user = value; Generation++; } }
        internal static bool IsAdmissionCurrent(RequestAdmission admission)
        {
            return admission != null && admission.IsValid && admission.Generation == Generation &&
                admission.ActorId == (CurrentUser != null ? CurrentUser.Id : null);
        }
    }
    public class ProbeBalance { public long AvailableCashPiasters; }
    public class ProbeSecurity
    {
        public bool Allowed = true;
        public bool HasPermission(string actorId, string permission) { return Allowed; }
        public User LoadPersistedUser(string actorId)
        {
            if (actorId == "actor-a") return new User { Id = actorId, DisplayName = "Cashier", Username = "cashier", Role = "cashier", IsActive = true };
            if (actorId == "actor-b") return new User { Id = actorId, DisplayName = "Other actor", Username = "other", Role = "admin", IsActive = true };
            return null;
        }
    }
    public class ProbeClosing
    {
        public ProbeBalance GetLiveDrawerBalance(string day)
        {
            return new ProbeBalance { AvailableCashPiasters = DrawerCashCalculator.CalculateForBusinessDate(DatabaseService.ConnectionString, DateTime.Parse(day)).ExpectedCashPiasters };
        }
    }
    public static class DatabaseService
    {
        public static string ConnectionString;
        public static DigitalAccountRepository DigitalAccounts;
        public static AuditLogRepository AuditRepo;
        public static ProbeClosing DailyClosing = new ProbeClosing();
        public static ProbeSecurity Security = new ProbeSecurity();
    }
}

namespace RafiqPOS.Repositories
{
    public class AuditLogRepository
    {
        public static bool RejectAudit;
        public AuditLogRepository(string connectionString = null) { }

        public void Log(SqliteConnection conn, SqliteTransaction trans, AuditLog entry)
        {
            if (RejectAudit) throw new InvalidOperationException("Injected audit failure");
            using (var cmd = new SqliteCommand("INSERT INTO audit_probe VALUES (@details, @user);", conn, trans))
            {
                cmd.Parameters.AddWithValue("@details", entry.DetailsJson);
                cmd.Parameters.AddWithValue("@user", entry.UserId);
                cmd.ExecuteNonQuery();
            }
        }
    }
}

namespace RafiqPOS.Bridge
{
    public partial class IpcDispatcher
    {
        public static Action BeforeAccept;
        public static void ResetProbe() { _epayRepo = null; BeforeAccept = null; }
        private static string SessionActorName()
        {
            var user = SecurityService.CurrentUser;
            return user == null ? "system" : !string.IsNullOrEmpty(user.DisplayName) ? user.DisplayName : user.Username;
        }
        public static BridgeResponse Probe(BridgeRequest request)
        {
            BridgeResponse response;
            try
            {
                var admission = Snapshot();
                var property = typeof(BridgeRequest).GetProperty("Admission", System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic);
                if (property != null) property.SetValue(request, admission, null);
                using (ProductWritePolicy.EnterRequest(admission))
                {
                    if (BeforeAccept != null) { var change = BeforeAccept; BeforeAccept = null; change(); }
                    if (!TryDispatchWallets(request, out response) && !TryDispatchEpay(request, out response)) throw new InvalidOperationException("Unknown probe action");
                    return response;
                }
            }
            catch (Exception ex) { return BridgeResponse.Fail(request.Id, "PROBE_EXCEPTION", ex.Message); }
        }

        internal static RequestAdmission Snapshot()
        {
            long generation = SecurityService.Generation;
            string actorId = SecurityService.CurrentUser != null ? SecurityService.CurrentUser.Id : null;
            User actor = DatabaseService.Security.LoadPersistedUser(actorId);
            var permissions = new Dictionary<string, bool>();
            foreach (string key in new[] { "wallets.transact", "wallets.fund", "wallets.accounts_manage", "wallets.balance_adjust",
                "wallets.cancel", "epay.transact", "epay.fund", "epay.terminals_manage", "epay.balance_adjust", "epay.cancel" })
                permissions[key] = DatabaseService.Security.Allowed;
            var admission = new RequestAdmission(actor != null && actor.IsActive, generation, actor, permissions);
            return SecurityService.IsAdmissionCurrent(admission) ? admission : new RequestAdmission(false, generation, null, null);
        }
    }
}

public static class WalletMoneyProbeCases
{
    private static string _schema;
    private static string _folder;
    private static int _number;

    private static void Execute(string sql)
    {
        using (var conn = new SqliteConnection(DatabaseService.ConnectionString))
        {
            conn.Open();
            using (var cmd = new SqliteCommand(sql, conn)) cmd.ExecuteNonQuery();
        }
    }

    private static long Number(string sql)
    {
        using (var conn = new SqliteConnection(DatabaseService.ConnectionString))
        {
            conn.Open();
            using (var cmd = new SqliteCommand(sql, conn)) return Convert.ToInt64(cmd.ExecuteScalar());
        }
    }

    private static void Check(bool ok, string description)
    {
        if (!ok) throw new InvalidOperationException(description);
    }

    private static void Fresh(long cash)
    {
        DatabaseService.ConnectionString = "Data Source=" + Path.Combine(_folder, (++_number) + ".db") + ";Foreign Keys=True";
        Execute(_schema);
        string now = DateTime.UtcNow.ToString("o");
        string day = DateTime.Now.ToString("yyyy-MM-dd");
        Execute("INSERT INTO shifts VALUES ('shift','" + day + "','" + DateTime.UtcNow.AddHours(-1).ToString("o") +
            "',NULL,'open'," + cash + ");" +
            "INSERT INTO digital_accounts(id,name,type,provider,balance_piasters,created_at,updated_at) VALUES ('wallet','Wallet','wallet','vodafone_cash',50000,'" + now + "','" + now + "');" +
            "INSERT INTO epay_terminals(id,name,provider,balance_piasters,created_at,updated_at) VALUES ('terminal','Terminal','fawry',50000,'" + now + "','" + now + "');");
        DatabaseService.DigitalAccounts = new DigitalAccountRepository(DatabaseService.ConnectionString, new AuditLogRepository());
        DatabaseService.Security.Allowed = true;
        AuditLogRepository.RejectAudit = false;
        IpcDispatcher.ResetProbe();
        SecurityService.CurrentUser = new User { Id = "actor-a", Username = "cashier", DisplayName = "Cashier", Role = "cashier", IsActive = true };
    }

    private static BridgeResponse Wallet(bool funding, string key, long amount, string destination)
    {
        var payload = new JObject { { "accountId", "wallet" }, { "amountPiasters", amount }, { "idempotencyKey", key } };
        if (funding) payload["fundingSource"] = destination;
        else
        {
            payload["txType"] = "cash_in";
            payload["profitPiasters"] = 100;
            if (destination != null) payload["paymentDestination"] = destination;
        }
        return Dispatch(funding, payload);
    }

    private static BridgeResponse Dispatch(bool funding, JObject payload)
    {
        return IpcDispatcher.Probe(new BridgeRequest
        {
            Id = Guid.NewGuid().ToString(), Action = funding ? "wallets:fundAccount" : "wallets:processTransaction", Payload = payload
        });
    }

    private static EpayTransaction Epay(string key)
    {
        return new EpayRepository(DatabaseService.ConnectionString, new AuditLogRepository()).CreateTransaction(new EpayTransaction
        {
            TerminalId = "terminal", ServiceType = "bill", BillAmountPiasters = 10000,
            CustomerFeePiasters = 100, PaymentChannel = "cash_drawer", IdempotencyKey = key
        });
    }

    private static JObject Original(string operation, string key)
    {
        key = "financial_v1:actor-a:" + key;
        if (operation == "wallets:processTransaction")
            return new JObject { { "accountId", "wallet" }, { "txType", "cash_in" }, { "amountPiasters", 10000 },
                { "profitPiasters", 100 }, { "paymentDestination", "external" }, { "idempotencyKey", key } };
        if (operation == "wallets:fundAccount")
            return new JObject { { "accountId", "wallet" }, { "amountPiasters", 10000 }, { "fundingSource", "external" }, { "idempotencyKey", key } };
        if (operation == "epay:createTransaction")
            return new JObject { { "terminalId", "terminal" }, { "serviceType", "bill" }, { "billAmountPiasters", 10000 },
                { "customerFeePiasters", 100 }, { "providerCommissionPiasters", 0 }, { "paymentChannel", "external" }, { "idempotencyKey", key } };
        return new JObject { { "terminalId", "terminal" }, { "amountPiasters", 10000 }, { "fundingSource", "external" }, { "idempotencyKey", key } };
    }

    private static BridgeResponse Post(string operation, JObject payload)
    {
        return IpcDispatcher.Probe(new BridgeRequest { Id = Guid.NewGuid().ToString(), Action = operation, Payload = payload });
    }

    private static object DirectPost(string operation, JObject payload)
    {
        switch (operation)
        {
            case "wallets:processTransaction": return DatabaseService.DigitalAccounts.ProcessTransaction(payload.ToObject<DigitalTransaction>());
            case "wallets:fundAccount":
#if BASELINE
                return DatabaseService.DigitalAccounts.FundAccount("wallet", 10000, "external", null, "actor-a");
#else
                return DatabaseService.DigitalAccounts.FundAccount("wallet", 10000, "external", null, "actor-a", (string)payload["idempotencyKey"]);
#endif
            case "epay:createTransaction": return new EpayRepository(DatabaseService.ConnectionString, new AuditLogRepository()).CreateTransaction(payload.ToObject<EpayTransaction>());
            default: return new EpayRepository(DatabaseService.ConnectionString, new AuditLogRepository()).FundTerminal("terminal", 10000, "external", null, "actor-a", (string)payload["idempotencyKey"]);
        }
    }
    private static JObject Resolve(string operation, JObject payload, bool abandon)
    {
        var response = IpcDispatcher.Probe(new BridgeRequest
        {
            Id = Guid.NewGuid().ToString(),
            Action = operation.Split(':')[0] + (abandon ? ":abandonAttempt" : ":reconcileAttempt"),
            Payload = new JObject { { "operation", operation }, { "actorId", SecurityService.CurrentUser.Id }, { "payload", payload.DeepClone() } }
        });
        if (!response.Success) throw new InvalidOperationException(response.Error == null ? "No durable resolution API" : response.Error.Message);
        return JObject.FromObject(response.Data);
    }

    public static int Run(string root, string label)
    {
        string migrations = string.Join("\n", Directory.GetFiles(Path.Combine(root, "desktop/Database"), "MigrationRunner*.cs").Select(File.ReadAllText));
        var schema = new System.Text.StringBuilder(@"PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
            CREATE TABLE app_settings(key TEXT, value TEXT);
            CREATE TABLE daily_closings(business_date TEXT, closed_at TEXT);
            CREATE TABLE shifts(id TEXT, business_date TEXT, opened_at TEXT, closed_at TEXT, status TEXT, opening_float_piasters INTEGER);
            CREATE TABLE sales(id TEXT, payment_method TEXT, change_piasters INTEGER, paid_piasters INTEGER, service_fee_piasters INTEGER, total_piasters INTEGER, status TEXT, shift_id TEXT, created_at TEXT);
            CREATE TABLE payments(sale_id TEXT, amount_piasters INTEGER, method TEXT);
            CREATE TABLE delivery_orders(sale_id TEXT, cash_handover_tracked INTEGER, total_to_collect_piasters INTEGER);
            CREATE TABLE audit_probe(details TEXT, user_id TEXT);");
        schema.Append(@"CREATE TABLE financial_attempt_cancellations(
            id TEXT PRIMARY KEY NOT NULL, operation TEXT NOT NULL, idempotency_key TEXT NOT NULL,
            request_fingerprint TEXT NOT NULL, actor_id TEXT NOT NULL, cancelled_at TEXT NOT NULL,
            UNIQUE(operation,idempotency_key));");
        foreach (string table in new[] { "digital_accounts", "digital_transactions", "digital_account_fundings", "epay_terminals", "epay_transactions", "epay_terminal_fundings" })
        {
            string create = Regex.Matches(migrations, @"CREATE TABLE IF NOT EXISTS " + table + @"\s*\(.*?\);", RegexOptions.Singleline)
                .Cast<Match>().Select(m => m.Value).OrderByDescending(s => s.Length).First();
            schema.Append(create);
            if (table.Contains("transactions") || table.Contains("fundings"))
                schema.Append("ALTER TABLE " + table + " ADD COLUMN idempotency_key TEXT; ALTER TABLE " + table + " ADD COLUMN idempotency_fingerprint TEXT;" +
                    "CREATE UNIQUE INDEX uq_" + table + "_probe ON " + table + "(idempotency_key) WHERE idempotency_key IS NOT NULL;");
        }
        _schema = schema.ToString();
        _folder = Path.Combine(Path.GetTempPath(), "rafiq_wallet_source_probe_" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(_folder);
        var tests = new List<KeyValuePair<string, Action>>();
        tests.Add(new KeyValuePair<string, Action>("FIN01 missing destination insufficient cash", delegate
        {
            Fresh(0);
            Check(!Wallet(false, "tx", 10000, null).Success, "posted 9900 drawer outflow with zero available cash");
            Check(Number("SELECT COUNT(*) FROM digital_transactions") == 0, "rejection left a posting");
        }));
        tests.Add(new KeyValuePair<string, Action>("FIN01 missing destination closed day", delegate
        {
            Fresh(50000);
            Execute("INSERT INTO daily_closings VALUES ('" + DateTime.Now.ToString("yyyy-MM-dd") + "','" + DateTime.UtcNow.ToString("o") + "');");
            Check(!Wallet(false, "tx", 10000, null).Success, "posted into sealed business day");
        }));
        tests.Add(new KeyValuePair<string, Action>("FIN03 legacy external source has zero drawer impact", delegate
        {
            Fresh(50000);
            var result = Dispatch(true, new JObject { { "accountId", "wallet" }, { "amountPiasters", 10000 }, { "source", "external" }, { "idempotencyKey", "fund" } });
            Check(result.Success, result.Error == null ? "failed" : result.Error.Message);
            Check(((DigitalAccountFunding)result.Data).FundingSource == "external", "external source silently became drawer");
            Check(DrawerCashCalculator.CalculateForBusinessDate(DatabaseService.ConnectionString, DateTime.Now.Date).ExpectedCashPiasters == 50000, "external funding deducted drawer");
        }));
        foreach (string requestedSource in new[] { "cash_drawer", "bank_transfer", "external_cash" })
        {
            string source = requestedSource;
            tests.Add(new KeyValuePair<string, Action>("FIN03 typed source canonical cash impact " + source, delegate
            {
                Fresh(50000);
                var result = Wallet(true, "source", 10000, source);
                Check(result.Success, result.Error == null ? "funding failed" : result.Error.Message);
                string canonical = source == "external_cash" ? "external" : source;
                Check(((DigitalAccountFunding)result.Data).FundingSource == canonical, "incorrect canonical funding source");
                long expected = source == "cash_drawer" ? 40000 : 50000;
                Check(DrawerCashCalculator.CalculateForBusinessDate(DatabaseService.ConnectionString, DateTime.Now.Date).ExpectedCashPiasters == expected,
                    "funding source changed drawer incorrectly");
            }));
        }
        foreach (bool isFunding in new[] { false, true })
        {
            bool funding = isFunding;
            tests.Add(new KeyValuePair<string, Action>("FIN04 persistent replay " + funding, delegate
            {
                Fresh(50000);
                var first = Wallet(funding, "stable-key", 10000, "external");
                Check(first.Success, "first attempt failed");
                DatabaseService.DigitalAccounts = new DigitalAccountRepository(DatabaseService.ConnectionString, new AuditLogRepository());
                var second = Wallet(funding, "stable-key", 10000, "external");
                Check(second.Success, "replay failed");
                Check(JsonConvert.SerializeObject(first.Data) == JsonConvert.SerializeObject(second.Data), "replay returned different/incomplete DTO");
                Check(Number("SELECT COUNT(*) FROM digital_transactions") == 1, "retry posted twice");
                Check(!Wallet(funding, "stable-key", 11000, "external").Success, "changed amount accepted with same key");
            }));
            tests.Add(new KeyValuePair<string, Action>("FIN04 concurrent replay " + funding, delegate
            {
                Fresh(50000);
                var workers = new[] { Task.Factory.StartNew(() => Wallet(funding, "race", 10000, "external")),
                    Task.Factory.StartNew(() => Wallet(funding, "race", 10000, "external")) };
                Task.WaitAll(workers);
                Check(workers.All(t => t.Result.Success), "equal concurrent requests must both succeed");
                Check(Number("SELECT COUNT(*) FROM digital_transactions") == 1, "concurrent retry posted twice");
            }));
            tests.Add(new KeyValuePair<string, Action>("FIN04 reject missing key " + funding, delegate
            {
                Fresh(50000);
                Check(!Wallet(funding, null, 10000, "external").Success, "unprotected IPC write accepted");
            }));
        }
        foreach (bool isEpay in new[] { false, true })
        {
            bool epay = isEpay;
            tests.Add(new KeyValuePair<string, Action>("FIN05 original closed day " + epay, delegate
            {
                Fresh(50000);
                string id = epay ? Epay("epay").Id : ((DigitalTransaction)Wallet(false, "wallet", 10000, "external").Data).Id;
                string table = epay ? "epay_transactions" : "digital_transactions";
                DateTime old = DateTime.Now.Date.AddDays(-2);
                Execute("UPDATE " + table + " SET created_at='" + old.AddHours(12).ToUniversalTime().ToString("o") + "';" +
                    "INSERT INTO daily_closings VALUES ('" + old.ToString("yyyy-MM-dd") + "','" + DateTime.UtcNow.ToString("o") + "');");
                bool rejected = false;
                try
                {
                    if (epay) new EpayRepository(DatabaseService.ConnectionString, new AuditLogRepository()).CancelTransaction(id, "Regression", "actor-a");
                    else DatabaseService.DigitalAccounts.CancelTransaction(id, "Regression", "actor-a");
                }
                catch (InvalidOperationException) { rejected = true; }
                Check(rejected, "cancel rewrote original sealed period");
                Check(Number("SELECT COUNT(*) FROM " + table + " WHERE status='completed'") == 1, "historical status changed");
            }));
            tests.Add(new KeyValuePair<string, Action>("FIN05 original closed shift " + epay, delegate
            {
                Fresh(50000);
                string id = epay ? Epay("epay").Id : ((DigitalTransaction)Wallet(false, "wallet", 10000, "external").Data).Id;
                Execute("UPDATE shifts SET status='closed', closed_at='" + DateTime.UtcNow.AddMinutes(1).ToString("o") + "';");
                bool rejected = false;
                try
                {
                    if (epay) new EpayRepository(DatabaseService.ConnectionString, new AuditLogRepository()).CancelTransaction(id, "Regression", "actor-a");
                    else DatabaseService.DigitalAccounts.CancelTransaction(id, "Regression", "actor-a");
                }
                catch (InvalidOperationException) { rejected = true; }
                Check(rejected, "cancel rewrote original closed shift");
            }));
            tests.Add(new KeyValuePair<string, Action>("FIN05 open cancellation reverses exactly once " + epay, delegate
            {
                Fresh(50000);
                string id = epay ? Epay("epay").Id : ((DigitalTransaction)Wallet(false, "wallet", 10000, "cash_drawer").Data).Id;
                var repo = new EpayRepository(DatabaseService.ConnectionString, new AuditLogRepository());
                long beforeAudit = Number("SELECT COUNT(*) FROM audit_probe");
                if (epay) repo.CancelTransaction(id, "Regression", "actor-a");
                else DatabaseService.DigitalAccounts.CancelTransaction(id, "Regression", "actor-a");
                try
                {
                    if (epay) repo.CancelTransaction(id, "Regression", "actor-a");
                    else DatabaseService.DigitalAccounts.CancelTransaction(id, "Regression", "actor-a");
                }
                catch (InvalidOperationException) { }
                Check(Number("SELECT balance_piasters FROM " + (epay ? "epay_terminals" : "digital_accounts")) == 50000, "balance did not reconcile");
                Check(DrawerCashCalculator.CalculateForBusinessDate(DatabaseService.ConnectionString, DateTime.Now.Date).ExpectedCashPiasters == 50000, "drawer did not reconcile");
                Check(Number("SELECT COUNT(*) FROM audit_probe") == beforeAudit + 1, "cancellation audited twice");
            }));
        }
        tests.Add(new KeyValuePair<string, Action>("FIN05 missing shift and intervening closing rejects ambiguous period", delegate
        {
            Fresh(50000);
            string id = ((DigitalTransaction)Wallet(false, "wallet", 10000, "external").Data).Id;
            Execute("DELETE FROM shifts; INSERT INTO daily_closings VALUES ('" + DateTime.Now.Date.AddDays(-1).ToString("yyyy-MM-dd") +
                "','" + DateTime.UtcNow.AddMinutes(1).ToString("o") + "');");
            bool rejected = false;
            try { DatabaseService.DigitalAccounts.CancelTransaction(id, "Ambiguous original period", "actor-a"); }
            catch (InvalidOperationException) { rejected = true; }
            Check(rejected, "missing original period accepted despite an intervening closure");
        }));
        tests.Add(new KeyValuePair<string, Action>("EPAY complete persistent replay", delegate
        {
            Fresh(50000);
            var first = Epay("same");
            var second = Epay("same");
            Check(JsonConvert.SerializeObject(first) == JsonConvert.SerializeObject(second), "epay replay DTO incomplete");
            Check(Number("SELECT COUNT(*) FROM epay_transactions") == 1, "epay duplicate posting");
        }));
        foreach (bool isFunding in new[] { false, true })
        {
            bool funding = isFunding;
            tests.Add(new KeyValuePair<string, Action>("EPAY exact text fingerprint " + funding, delegate
            {
                Fresh(50000);
                var repo = new EpayRepository(DatabaseService.ConnectionString, new AuditLogRepository());
                if (funding) repo.FundTerminal("terminal", 10000, "external", "Case sensitive", "actor-a", "text");
                else repo.CreateTransaction(new EpayTransaction
                {
                    TerminalId = "terminal", ServiceType = "bill", BillAmountPiasters = 10000,
                    PaymentChannel = "external", IdempotencyKey = "text", Notes = "Case sensitive"
                });
                bool rejected = false;
                try
                {
                    if (funding) repo.FundTerminal("terminal", 10000, "external", "CASE SENSITIVE", "actor-a", "text");
                    else repo.CreateTransaction(new EpayTransaction
                    {
                        TerminalId = "terminal", ServiceType = "bill", BillAmountPiasters = 10000,
                        PaymentChannel = "external", IdempotencyKey = "text", Notes = "CASE SENSITIVE"
                    });
                }
                catch (InvalidOperationException) { rejected = true; }
                Check(rejected, "changed request text treated as the same attempt");
            }));
        }
        foreach (string originalOperation in new[] { "wallets:processTransaction", "wallets:fundAccount", "epay:createTransaction", "epay:fundTerminal" })
        {
            string operation = originalOperation;
            string table = operation == "wallets:processTransaction" ? "digital_transactions" :
                operation == "wallets:fundAccount" ? "digital_account_fundings" :
                operation == "epay:createTransaction" ? "epay_transactions" : "epay_terminal_fundings";
            tests.Add(new KeyValuePair<string, Action>("FIN04 strict reconcile missing is nonfinal " + operation, delegate
            {
                Fresh(50000);
                var result = Resolve(operation, Original(operation, "missing"), false);
                Check((string)result["status"] == "pending" && result["data"].Type == JTokenType.Null, "absence was treated as final");
                Check(Number("SELECT COUNT(*) FROM financial_attempt_cancellations") == 0 && Number("SELECT COUNT(*) FROM audit_probe") == 0, "read-only reconcile wrote rows");
            }));
            tests.Add(new KeyValuePair<string, Action>("FIN04 abandon blocks late write and rejects changed payload/actor " + operation, delegate
            {
                Fresh(50000);
                var payload = Original(operation, "abandon");
                Check((string)Resolve(operation, payload, true)["status"] == "abandoned", "abandon not acknowledged");
                Check((string)Resolve(operation, payload, true)["status"] == "abandoned", "matching abandon replay failed");
                Check(Number("SELECT COUNT(*) FROM audit_probe") == 1, "abandon audited twice");
                Check(!Post(operation, payload).Success, "late queued write posted after durable abandonment");
                Check(Number("SELECT COUNT(*) FROM " + table) == 0, "abandoned request left financial rows");
                var changed = (JObject)payload.DeepClone();
                changed[operation == "epay:createTransaction" ? "billAmountPiasters" : "amountPiasters"] = 11000;
                bool rejected = false;
                try { Resolve(operation, changed, true); } catch (InvalidOperationException) { rejected = true; }
                Check(rejected, "changed payload reused a cancellation");
                SecurityService.CurrentUser = new User { Id = "actor-b", DisplayName = "Other actor", Username = "other" };
                rejected = false;
                try { Resolve(operation, payload, true); } catch (InvalidOperationException) { rejected = true; }
                Check(rejected, "another actor reused the original barrier");
                Check(Number("SELECT balance_piasters FROM digital_accounts") == 50000 && Number("SELECT balance_piasters FROM epay_terminals") == 50000, "barrier changed balances");
            }));
            tests.Add(new KeyValuePair<string, Action>("FIN04 committed recovery returns complete original DTO " + operation, delegate
            {
                Fresh(50000);
                var payload = Original(operation, "saved");
                var first = Post(operation, payload);
                Check(first.Success, "original posting failed");
                long audit = Number("SELECT COUNT(*) FROM audit_probe");
                var recovered = Resolve(operation, payload, false);
                var abandon = Resolve(operation, payload, true);
                Check((string)recovered["status"] == "committed" && (string)abandon["status"] == "committed", "committed row was abandoned or nonfinal");
                Check(JToken.DeepEquals(JToken.FromObject(first.Data), recovered["data"]) && JToken.DeepEquals(recovered["data"], abandon["data"]), "recovery DTO incomplete");
                Check(Number("SELECT COUNT(*) FROM " + table) == 1 && Number("SELECT COUNT(*) FROM financial_attempt_cancellations") == 0, "recovery duplicated or tombstoned committed row");
                Check(Number("SELECT COUNT(*) FROM audit_probe") == audit, "read-only committed recovery mutated audit");
            }));
            tests.Add(new KeyValuePair<string, Action>("FIN04 audit failure rolls back abandonment " + operation, delegate
            {
                Fresh(50000);
                var payload = Original(operation, "audit-failure");
                AuditLogRepository.RejectAudit = true;
                bool rejected = false;
                try { Resolve(operation, payload, true); } catch (InvalidOperationException) { rejected = true; }
                AuditLogRepository.RejectAudit = false;
                Check(rejected && Number("SELECT COUNT(*) FROM financial_attempt_cancellations") == 0, "unaudited barrier committed");
                Check(Post(operation, payload).Success, "failed abandonment left a hidden barrier");
            }));
            tests.Add(new KeyValuePair<string, Action>("FIN04 abandon/create race is serialized " + operation, delegate
            {
                Fresh(50000);
                var payload = Original(operation, "race-barrier");
                var write = Task.Factory.StartNew(() => Post(operation, payload));
                var abandon = Task.Factory.StartNew(() => Resolve(operation, payload, true));
                Task.WaitAll(write, abandon);
                bool committed = (string)abandon.Result["status"] == "committed";
                Check(Number("SELECT COUNT(*) FROM " + table) == (committed ? 1 : 0), "race left inconsistent financial state");
                Check(write.Result.Success == committed, "race returned contradictory outcomes");
                if (!committed) Check(!Post(operation, payload).Success, "late write crossed race winner's barrier");
            }));
            tests.Add(new KeyValuePair<string, Action>("FIN04 every financial entrypoint checks persisted tombstone " + operation, delegate
            {
                Fresh(50000);
                Execute("INSERT INTO financial_attempt_cancellations VALUES ('barrier','" + operation + "','financial_v1:actor-a:blocked','strict-fingerprint','actor-a','" + DateTime.UtcNow.ToString("o") + "');");
                Check(!Post(operation, Original(operation, "blocked")).Success, "write ignored persisted barrier");
                Check(Number("SELECT COUNT(*) FROM " + table) == 0, "blocked request posted");
            }));
            tests.Add(new KeyValuePair<string, Action>("FIN04 operation permission required for reconciliation " + operation, delegate
            {
                Fresh(50000);
                DatabaseService.Security.Allowed = false;
                bool rejected = false;
                try { Resolve(operation, Original(operation, "no-permission"), true); } catch (InvalidOperationException) { rejected = true; }
                Check(rejected && Number("SELECT COUNT(*) FROM financial_attempt_cancellations") == 0, "session-only authorization allowed abandonment");
            }));
            tests.Add(new KeyValuePair<string, Action>("FIN04 uncommitted key belongs to original actor namespace " + operation, delegate
            {
                Fresh(50000);
                var payload = Original(operation, "uncommitted-owner");
                SecurityService.CurrentUser = new User { Id = "actor-b", DisplayName = "Other actor", Username = "other" };
                Check(!Post(operation, payload).Success, "another actor posted an uncommitted original key");
                bool rejected = false;
                try { Resolve(operation, payload, true); } catch (InvalidOperationException) { rejected = true; }
                Check(rejected && Number("SELECT COUNT(*) FROM financial_attempt_cancellations") == 0, "another actor claimed an uncommitted original key");
                Check(Number("SELECT COUNT(*) FROM " + table) == 0, "cross-actor attempt changed financial state");
            }));
            tests.Add(new KeyValuePair<string, Action>("AUTH queued switch rejects before financial acceptance " + operation, delegate
            {
                Fresh(50000);
                var payload = Original(operation, "queued-switch");
                IpcDispatcher.BeforeAccept = delegate
                {
                    SecurityService.CurrentUser = new User { Id = "actor-b", DisplayName = "Promoted", Role = "admin", IsActive = true };
                };
                Check(!Post(operation, payload).Success, "queued request borrowed the later session");
                Check(Number("SELECT COUNT(*) FROM " + table) == 0, "stale admission posted financial rows");
            }));
            tests.Add(new KeyValuePair<string, Action>("AUTH accepted operation keeps actor and permissions after switch " + operation, delegate
            {
                Fresh(50000);
                var payload = Original(operation, "accepted-switch");
                using (ProductWritePolicy.EnterRequest(IpcDispatcher.Snapshot()))
                lock (SaleService.FinancialWriteLock)
                using (ProductWritePolicy.BeginOperation())
                {
                    SecurityService.CurrentUser = new User { Id = "actor-b", DisplayName = "Other actor", Role = "admin", IsActive = true };
                    DatabaseService.Security.Allowed = false;
                    JObject dto = JObject.FromObject(DirectPost(operation, payload));
                    Check((string)dto["createdBy"] == "actor-a" || (string)dto["cashierName"] == "Cashier", "accepted operation was re-attributed");
                    Check(Number("SELECT COUNT(*) FROM " + table) == 1, "accepted original operation did not post exactly once");
                }
            }));
            tests.Add(new KeyValuePair<string, Action>("AUTH accepted low privilege cannot upgrade from later admin " + operation, delegate
            {
                Fresh(50000);
                var payload = Original(operation, "no-upgrade");
                DatabaseService.Security.Allowed = false;
                using (ProductWritePolicy.EnterRequest(IpcDispatcher.Snapshot()))
                lock (SaleService.FinancialWriteLock)
                using (ProductWritePolicy.BeginOperation())
                {
                    SecurityService.CurrentUser = new User { Id = "actor-b", DisplayName = "Promoted", Role = "admin", IsActive = true };
                    DatabaseService.Security.Allowed = true;
                    bool rejected = false;
                    try { DirectPost(operation, payload); } catch (UnauthorizedAccessException) { rejected = true; }
                    Check(rejected && Number("SELECT COUNT(*) FROM " + table) == 0, "accepted request upgraded its original financial capability");
                }
            }));
            tests.Add(new KeyValuePair<string, Action>("AUTH mutable session role cannot grant persisted financial capability " + operation, delegate
            {
                Fresh(50000);
                DatabaseService.Security.Allowed = false;
                SecurityService.CurrentUser.Role = "admin";
                Check(!Post(operation, Original(operation, "tampered-role")).Success, "mutable session DTO granted financial authority");
                Check(Number("SELECT COUNT(*) FROM " + table) == 0, "DTO role tampering posted financial rows");
            }));
        }
        int failures = 0;
        try
        {
            foreach (var test in tests)
            {
                try { test.Value(); Console.WriteLine(label + " PASS " + test.Key); }
                catch (Exception ex) { failures++; Console.WriteLine(label + " FAIL " + test.Key + ": " + ex.Message); }
            }
        }
        finally { Directory.Delete(_folder, true); }
        return failures;
    }
}
