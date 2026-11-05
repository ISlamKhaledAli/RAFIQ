using System;
using System.Data.SQLite;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using RafiqPOS.Bridge;
using RafiqPOS.Database;
using RafiqPOS.Models;
using RafiqPOS.Repositories;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    /// <summary>
    /// اسم صاحب حساب المحفظة / إنستاباي (هجرة 64: digital_accounts.holder_name) والحساب الرئيسي لكل نوع:
    /// الهجرة تتكرر بلا ضرر، الاسم يُحفظ ويُرجَع منظّفاً ومقصوصاً عند 60 حرفاً، حساب رئيسي واحد فقط لكل نوع،
    /// وأول حساب نشط من نوعه يصبح رئيسياً، وإجراء setDefaultAccount لا يلمس الأرصدة.
    /// </summary>
    [TestFixture]
    [NonParallelizable]
    public class S52_DigitalAccountHolderMigrationTest : TestBase
    {
        private long Scalar(string sql, params object[] nameValuePairs)
        {
            using (var conn = new SQLiteConnection(ConnectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    for (int i = 0; i + 1 < nameValuePairs.Length; i += 2)
                    {
                        cmd.Parameters.AddWithValue((string)nameValuePairs[i], nameValuePairs[i + 1]);
                    }
                    object val = cmd.ExecuteScalar();
                    return val == null || val == DBNull.Value ? 0 : Convert.ToInt64(val);
                }
            }
        }

        private void Execute(string sql)
        {
            using (var conn = new SQLiteConnection(ConnectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.ExecuteNonQuery();
                }
            }
        }

        private int _phoneSeq;

        private DigitalAccount Save(string name, string type, string holder, bool isDefault, bool isActive, long balancePiasters)
        {
            _phoneSeq++;
            return DigitalAccountRepo.SaveAccount(new DigitalAccount
            {
                Name = name,
                Type = type,
                Provider = type == "instapay" ? "nbe" : "vodafone_cash",
                PhoneNumber = "010" + (10000000 + _phoneSeq).ToString(),
                HolderName = holder,
                BalancePiasters = balancePiasters,
                IsDefault = isDefault,
                IsActive = isActive
            });
        }

        private long DefaultCount(string type)
        {
            return Scalar("SELECT COUNT(*) FROM digital_accounts WHERE type = @t AND is_default = 1;", "@t", type);
        }

        // ---------- Migration 64 ----------

        [Test]
        public void Migration64_AddsHolderColumn_KeepsRows_AndIsIdempotent()
        {
            Assert.GreaterOrEqual(MigrationRunner.LATEST_SUPPORTED_VERSION, 64);
            Assert.AreEqual(1, Scalar("SELECT COUNT(*) FROM pragma_table_info('digital_accounts') WHERE name = 'holder_name';"), "العمود موجود بعد كل الهجرات");

            var before = Save("حساب قبل الهجرة", "instapay", "اسم قديم", true, true, 12345);

            // Back to the version-63 shape
            Execute("ALTER TABLE digital_accounts DROP COLUMN holder_name;");
            Execute("DELETE FROM schema_migrations WHERE version >= 64;");
            Assert.AreEqual(63, Scalar("SELECT MAX(version) FROM schema_migrations;"));
            Assert.AreEqual(0, Scalar("SELECT COUNT(*) FROM pragma_table_info('digital_accounts') WHERE name = 'holder_name';"));

            // The host still reads the old shape without failing
            var legacy = DigitalAccountRepo.GetAccountById(before.Id);
            Assert.IsNotNull(legacy);
            Assert.AreEqual("", legacy.HolderName ?? "", "لا عمود: لا اسم");

            Assert.DoesNotThrow(() => MigrationRunner.ApplyMigrations(ConnectionString, TestDbPath));

            Assert.AreEqual(MigrationRunner.LATEST_SUPPORTED_VERSION, Scalar("SELECT MAX(version) FROM schema_migrations;"));
            Assert.AreEqual(1, Scalar("SELECT COUNT(*) FROM schema_migrations WHERE version = 64;"));
            Assert.AreEqual(1, Scalar("SELECT COUNT(*) FROM pragma_table_info('digital_accounts') WHERE name = 'holder_name';"));
            var after = DigitalAccountRepo.GetAccountById(before.Id);
            Assert.IsNotNull(after, "الصف باقٍ");
            Assert.AreEqual("", after.HolderName, "الصفوف القديمة تأخذ القيمة الافتراضية الفارغة");
            Assert.AreEqual(12345, after.BalancePiasters, "الرصيد لم يتغير");
            Assert.IsTrue(after.IsDefault);

            // Re-running changes nothing
            Assert.DoesNotThrow(() => MigrationRunner.ApplyMigrations(ConnectionString, TestDbPath));
            Assert.DoesNotThrow(() => MigrationRunner.ApplyMigrations(ConnectionString, TestDbPath));
            Assert.AreEqual(1, Scalar("SELECT COUNT(*) FROM pragma_table_info('digital_accounts') WHERE name = 'holder_name';"), "عمود واحد فقط");
            Assert.AreEqual(1, Scalar("SELECT COUNT(*) FROM schema_migrations WHERE version = 64;"), "لا تسجيل مكرر");

            var saved = Save("حساب بعد الهجرة", "instapay", "اسم جديد", false, true, 0);
            Assert.AreEqual("اسم جديد", DigitalAccountRepo.GetAccountById(saved.Id).HolderName);
        }

        [Test]
        public void SchemaHealth_RepairsMissingHolderColumn_OnStartup()
        {
            Execute("ALTER TABLE digital_accounts DROP COLUMN holder_name;");
            Assert.AreEqual(0, Scalar("SELECT COUNT(*) FROM pragma_table_info('digital_accounts') WHERE name = 'holder_name';"));

            // schema_migrations still says 64, so only the self-healing guard can bring the column back
            MigrationRunner.ApplyMigrations(ConnectionString, TestDbPath);

            Assert.AreEqual(1, Scalar("SELECT COUNT(*) FROM pragma_table_info('digital_accounts') WHERE name = 'holder_name';"));
        }

        // ---------- Holder name ----------

        [Test]
        public void HolderName_IsSavedAndReturned_Trimmed_CleanedAndCappedAt60()
        {
            var plain = Save("حساب 1", "instapay", "  محمد   حسن \t عبد الله  ", true, true, 0);
            Assert.AreEqual("محمد حسن عبد الله", DigitalAccountRepo.GetAccountById(plain.Id).HolderName, "تقليم ومسافة واحدة وبلا محارف تحكم");

            var control = Save("حساب 2", "wallet", "أحمد\r\nمحمود\u0007السيد", true, true, 0);
            Assert.AreEqual("أحمد محمود السيد", DigitalAccountRepo.GetAccountById(control.Id).HolderName, "أسطر جديدة ومحارف تحكم تتحول لمسافة");

            string longName = new string('س', 90);
            var capped = Save("حساب 3", "wallet", longName, false, true, 0);
            string stored = DigitalAccountRepo.GetAccountById(capped.Id).HolderName;
            Assert.AreEqual(60, stored.Length, "الحد الأقصى 60 حرفاً");
            Assert.AreEqual(longName.Substring(0, 60), stored);
        }

        [Test]
        public void HolderName_OnUpdate_NullKeepsStored_EmptyClears()
        {
            var acc = Save("حساب الاسم", "instapay", "صاحب الحساب", true, true, 0);

            acc.HolderName = null;
            acc.Name = "حساب الاسم (معدل)";
            DigitalAccountRepo.SaveAccount(acc);
            Assert.AreEqual("صاحب الحساب", DigitalAccountRepo.GetAccountById(acc.Id).HolderName, "عميل قديم لا يرسل الاسم: يبقى المخزن");

            acc.HolderName = "   ";
            DigitalAccountRepo.SaveAccount(acc);
            Assert.AreEqual("", DigitalAccountRepo.GetAccountById(acc.Id).HolderName, "نص فارغ يمسح الاسم");
        }

        [Test]
        public void NormalizeHolderName_TableOfInputs()
        {
            Assert.AreEqual("", DigitalAccountRepository.NormalizeHolderName(null));
            Assert.AreEqual("", DigitalAccountRepository.NormalizeHolderName("  \n\t "));
            Assert.AreEqual("a b", DigitalAccountRepository.NormalizeHolderName("a\u200Fb"));
            Assert.AreEqual("a b", DigitalAccountRepository.NormalizeHolderName("a\u202Eb"));
            Assert.AreEqual("ab", DigitalAccountRepository.NormalizeHolderName("  ab  "));
            Assert.AreEqual(60, DigitalAccountRepository.NormalizeHolderName(new string('x', 61)).Length);
            Assert.AreEqual(59, DigitalAccountRepository.NormalizeHolderName(new string('x', 59) + " " + new string('y', 10)).Length, "القص لا يترك مسافة في الآخر");
        }

        // ---------- Main account per type ----------

        [Test]
        public void FirstActiveAccountOfAType_BecomesMain_EvenWhenSavedAsNotMain()
        {
            var first = Save("أول إنستاباي", "instapay", "أ", false, true, 0);
            Assert.IsTrue(DigitalAccountRepo.GetAccountById(first.Id).IsDefault, "أول حساب نشط من نوعه رئيسي");
            Assert.IsTrue(first.IsDefault, "والقيمة المرجعة تعكس ذلك");

            var second = Save("ثاني إنستاباي", "instapay", "ب", false, true, 0);
            Assert.IsFalse(DigitalAccountRepo.GetAccountById(second.Id).IsDefault, "الثاني ليس رئيسياً");
            Assert.AreEqual(1, DefaultCount("instapay"));

            // A different type is independent: its first account is main too
            var wallet = Save("أول محفظة", "wallet", "ج", false, true, 0);
            Assert.IsTrue(DigitalAccountRepo.GetAccountById(wallet.Id).IsDefault);
            Assert.AreEqual(1, DefaultCount("wallet"));
            Assert.AreEqual(1, DefaultCount("instapay"));
        }

        [Test]
        public void SavingASecondMain_LeavesExactlyOneMainPerType()
        {
            var first = Save("أول", "instapay", "أ", true, true, 0);
            var second = Save("ثاني", "instapay", "ب", true, true, 0);
            var wallet = Save("محفظة", "wallet", "ج", true, true, 0);

            Assert.AreEqual(1, DefaultCount("instapay"), "رئيسي واحد لإنستاباي");
            Assert.AreEqual(1, DefaultCount("wallet"), "ولا يمس المحافظ");
            Assert.IsFalse(DigitalAccountRepo.GetAccountById(first.Id).IsDefault);
            Assert.IsTrue(DigitalAccountRepo.GetAccountById(second.Id).IsDefault);
            Assert.IsTrue(DigitalAccountRepo.GetAccountById(wallet.Id).IsDefault);
            Assert.AreEqual(second.Id, DigitalAccountRepo.GetDefaultAccountForType("instapay").Id, "الحساب الذي يُقيد فيه البيع");
        }

        [Test]
        public void InactiveAccount_IsNeverMain_AndDoesNotCountAsPeer()
        {
            var inactive = Save("موقوف", "wallet", "", true, false, 0);
            Assert.IsFalse(DigitalAccountRepo.GetAccountById(inactive.Id).IsDefault, "الموقوف لا يكون رئيسياً");

            var live = Save("نشط", "wallet", "", false, true, 0);
            Assert.IsTrue(DigitalAccountRepo.GetAccountById(live.Id).IsDefault, "أول نشط رغم وجود موقوف من نفس النوع");
            Assert.AreEqual(1, DefaultCount("wallet"));
        }

        [Test]
        public void SetDefaultAccount_SwitchesTheMain_WithoutTouchingBalancesOrOtherFields()
        {
            var a = Save("أ", "instapay", "صاحب أ", true, true, 5000);
            var b = Save("ب", "instapay", "صاحب ب", false, true, 7000);
            var otherType = Save("محفظة", "wallet", "صاحب ج", true, true, 900);

            var updated = DigitalAccountRepo.SetDefaultAccount(b.Id);

            Assert.IsTrue(updated.IsDefault);
            Assert.AreEqual(1, DefaultCount("instapay"));
            Assert.IsFalse(DigitalAccountRepo.GetAccountById(a.Id).IsDefault);
            Assert.IsTrue(DigitalAccountRepo.GetAccountById(b.Id).IsDefault);
            Assert.IsTrue(DigitalAccountRepo.GetAccountById(otherType.Id).IsDefault, "نوع آخر لم يتأثر");
            Assert.AreEqual(5000, DigitalAccountRepo.GetAccountById(a.Id).BalancePiasters);
            Assert.AreEqual(7000, DigitalAccountRepo.GetAccountById(b.Id).BalancePiasters);
            Assert.AreEqual(900, DigitalAccountRepo.GetAccountById(otherType.Id).BalancePiasters);
            Assert.AreEqual("صاحب ب", DigitalAccountRepo.GetAccountById(b.Id).HolderName);
            Assert.AreEqual(b.Id, DigitalAccountRepo.GetDefaultAccountForType("instapay").Id);

            // Idempotent
            DigitalAccountRepo.SetDefaultAccount(b.Id);
            Assert.AreEqual(1, DefaultCount("instapay"));
        }

        [Test]
        public void SetDefaultAccount_RefusesUnknownAndInactiveAccounts_AndChangesNothing()
        {
            var main = Save("رئيسي", "instapay", "", true, true, 0);
            var archived = Save("مؤرشف", "instapay", "", false, false, 0);

            Assert.Throws<InvalidOperationException>(() => DigitalAccountRepo.SetDefaultAccount("no_such_account"));
            Assert.Throws<InvalidOperationException>(() => DigitalAccountRepo.SetDefaultAccount(archived.Id));
            Assert.Throws<ArgumentException>(() => DigitalAccountRepo.SetDefaultAccount(""));

            Assert.AreEqual(1, DefaultCount("instapay"));
            Assert.IsTrue(DigitalAccountRepo.GetAccountById(main.Id).IsDefault);
        }
    }

    /// <summary>
    /// نفس الأمور عبر بوابة IPC الحقيقية بجلسة مستخدم حقيقية: wallets:saveAccount يمرر holderName،
    /// و wallets:setDefaultAccount يتبع صلاحية wallets.accounts_manage.
    /// </summary>
    [TestFixture]
    [NonParallelizable]
    public class S52_DigitalAccountHolderAndDefaultTest : S30_Step3BFixtureBase
    {
        [SetUp]
        public void EnableWalletsFeature()
        {
            DatabaseService.SettingsRepo.Set("feature_digital_wallets", "1");
        }

        private static JObject AccountPayload(string name, string type, string holder, bool isDefault)
        {
            return new JObject
            {
                { "name", name },
                { "type", type },
                { "accountType", type },
                { "provider", type == "instapay" ? "nbe" : "vodafone_cash" },
                { "holderName", holder },
                { "phoneNumber", "01012345678" },
                { "identifier", type == "instapay" ? "shop@instapay" : null },
                { "balancePiasters", 0 },
                { "isDefault", isDefault },
                { "isActive", true }
            };
        }

        private static JArray AllAccounts()
        {
            var res = DispatchOk("wallets:getAccounts", new JObject());
            return JArray.FromObject(res.Data);
        }

        private static JObject Find(JArray accounts, string id)
        {
            for (int i = 0; i < accounts.Count; i++)
            {
                var item = (JObject)accounts[i];
                if ((string)item["id"] == id) return item;
            }
            return null;
        }

        [Test]
        public void SaveAccount_PassesHolderNameThrough_Trimmed_AndGetAccountsReturnsIt()
        {
            string longName = new string('ص', 80);
            var res = DispatchOk("wallets:saveAccount", AccountPayload("حساب إنستاباي", "instapay", "  سامي   علي \n", false));
            var saved = Data(res);
            Assert.AreEqual("سامي علي", (string)saved["holderName"], "المرجع منظف");

            var capped = Data(DispatchOk("wallets:saveAccount", AccountPayload("محفظة", "wallet", longName, false)));
            Assert.AreEqual(60, ((string)capped["holderName"]).Length, "مقصوص عند 60 حرفاً");

            var list = AllAccounts();
            Assert.AreEqual("سامي علي", (string)Find(list, (string)saved["id"])["holderName"]);
            Assert.AreEqual(60, ((string)Find(list, (string)capped["id"])["holderName"]).Length);
        }

        [Test]
        public void SaveAccount_FirstOfType_IsMain_AndASecondMainReplacesIt()
        {
            var first = Data(DispatchOk("wallets:saveAccount", AccountPayload("الأول", "instapay", "", false)));
            Assert.IsTrue((bool)first["isDefault"], "أول حساب نشط رئيسي رغم أن الواجهة أرسلت false");

            var second = Data(DispatchOk("wallets:saveAccount", AccountPayload("الثاني", "instapay", "", true)));
            var list = AllAccounts();
            int mains = 0;
            for (int i = 0; i < list.Count; i++)
            {
                var item = (JObject)list[i];
                if ((string)item["type"] == "instapay" && (bool)item["isDefault"]) mains++;
            }
            Assert.AreEqual(1, mains, "رئيسي واحد فقط لإنستاباي");
            Assert.IsTrue((bool)Find(list, (string)second["id"])["isDefault"]);
            Assert.IsFalse((bool)Find(list, (string)first["id"])["isDefault"]);
        }

        [Test]
        public void SetDefaultAccount_SwitchesTheMain_ForAnAccountsManager_AndIsForbiddenForACashier()
        {
            var a = Data(DispatchOk("wallets:saveAccount", AccountPayload("أ", "instapay", "صاحب أ", true)));
            var b = Data(DispatchOk("wallets:saveAccount", AccountPayload("ب", "instapay", "صاحب ب", false)));
            Assert.IsTrue((bool)a["isDefault"]);
            Assert.IsFalse((bool)b["isDefault"]);

            // A cashier does not hold wallets.accounts_manage
            LoginAs(CashierId);
            var denied = Dispatch("wallets:setDefaultAccount", new JObject { { "id", (string)b["id"] } });
            Assert.IsFalse(denied.Success, "الكاشير ممنوع");
            Assert.AreEqual("FORBIDDEN", denied.Error.Code);
            Assert.IsFalse((bool)Find(AllAccounts(), (string)b["id"])["isDefault"], "لم يتغير شيء");

            LoginAs(AdminId);
            var ok = DispatchOk("wallets:setDefaultAccount", new JObject { { "id", (string)b["id"] } });
            Assert.IsTrue((bool)Data(ok)["isDefault"]);
            var list = AllAccounts();
            Assert.IsTrue((bool)Find(list, (string)b["id"])["isDefault"]);
            Assert.IsFalse((bool)Find(list, (string)a["id"])["isDefault"]);
            Assert.AreEqual("صاحب ب", (string)Find(list, (string)b["id"])["holderName"], "الاسم باقٍ");

            var missing = Dispatch("wallets:setDefaultAccount", new JObject());
            Assert.IsFalse(missing.Success);
            Assert.AreEqual("VALIDATION_ERROR", missing.Error.Code);
        }
    }
}
