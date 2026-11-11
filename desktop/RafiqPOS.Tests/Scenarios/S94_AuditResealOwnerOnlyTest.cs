using System;
using System.Reflection;
using NUnit.Framework;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    /// <summary>
    /// إعادة ختم سلسلة سجل التدقيق (audit:resealChain) لصاحب المحل أو المطور فقط، ويُسجَّل قيد قبلها وقيد بعدها.
    /// </summary>
    [TestFixture]
    [NonParallelizable]
    public class S94_AuditResealOwnerOnlyTest : S44_UserHierarchyFixtureBase
    {
        private static void SetAuditService(AuditLogService service)
        {
            PropertyInfo prop = typeof(DatabaseService).GetProperty("Audit", BindingFlags.Static | BindingFlags.Public);
            Assert.IsNotNull(prop, "DatabaseService.Audit");
            prop.GetSetMethod(true).Invoke(null, new object[] { service });
        }

        [SetUp]
        public void ResealSetUp()
        {
            SetAuditService(new AuditLogService(AuditRepo));
        }

        [TearDown]
        public override void BaseTearDown()
        {
            SetAuditService(null);
            base.BaseTearDown();
        }

        [Test]
        public void ManagersAndCashiers_CannotResealTheChain()
        {
            var manager = CreateManager("mgr_reseal", ManagerPin);
            var cashier = CreateCashierBy(OwnerId, "cash_reseal");
            long before = CountAudit("AUDIT_CHAIN_RESEAL_STARTED");

            string[] sessions = new string[] { manager.Id, cashier.Id };
            for (int i = 0; i < sessions.Length; i++)
            {
                LoginAs(sessions[i]);
                var res = Dispatch("audit:resealChain", null);
                Assert.IsFalse(res.Success, "إعادة الختم مرفوضة لـ " + sessions[i]);
                Assert.AreEqual("FORBIDDEN", ErrorCode(res), Describe(res));
            }

            Assert.AreEqual(before, CountAudit("AUDIT_CHAIN_RESEAL_STARTED"), "الرفض قبل الوصول للمعالج: لا قيد تدقيق");
        }

        [Test]
        public void Owner_CanReseal_AndTheOperationIsAuditedBeforeAndAfter()
        {
            LoginAs(OwnerId);
            var res = Dispatch("audit:resealChain", null);
            Assert.IsTrue(res.Success, Describe(res));

            Assert.AreEqual(1L, CountAudit("AUDIT_CHAIN_RESEAL_STARTED"), "قيد قبل إعادة الختم");
            Assert.AreEqual(1L, CountAudit("AUDIT_CHAIN_RESEALED"), "قيد بعد إعادة الختم");
            Assert.IsTrue(AuditRepo.VerifyChainIntegrity().IsValid, "السلسلة سليمة بعد إعادة الختم");
        }

        [Test]
        public void AuditRowWithoutAUser_StaysVerifiable()
        {
            AuditRepo.Log(new RafiqPOS.Models.AuditLog { Action = "NO_USER_ROW", EntityType = "TEST", EntityId = "e1", DetailsJson = "{}" });
            AuditRepo.Log(new RafiqPOS.Models.AuditLog { UserId = "", Action = "EMPTY_USER_ROW", EntityType = "TEST", EntityId = "e2", DetailsJson = "{}" });
            AuditRepo.Log(new RafiqPOS.Models.AuditLog { UserId = "usr_x", Action = "USER_ROW", EntityType = "TEST", EntityId = "e3", DetailsJson = "{}" });

            Assert.AreEqual(2L, Scalar("SELECT COUNT(*) FROM audit_logs WHERE user_id = 'usr_admin_default' AND action IN ('NO_USER_ROW', 'EMPTY_USER_ROW');"),
                "المستخدم الافتراضي يُخزَّن ويُحسب في البصمة بنفس القيمة");
            var check = AuditRepo.VerifyChainIntegrity();
            Assert.IsTrue(check.IsValid, check.ErrorMessage);
        }

        [Test]
        public void Reseal_ProcessesLongChainsInPages_AndTheChainStaysValid()
        {
            // More rows than one 500-row page
            for (int i = 0; i < 1200; i++)
            {
                AuditRepo.Log(new RafiqPOS.Models.AuditLog { UserId = "usr_x", Action = "BULK_ROW", EntityType = "TEST", EntityId = "e" + i, DetailsJson = "{}" });
            }

            int resealed = AuditRepo.ResealChain();

            Assert.GreaterOrEqual(resealed, 1200);
            Assert.AreEqual(resealed, (int)Scalar("SELECT COUNT(*) FROM audit_logs;"), "كل الصفوف أُعيد ختمها");
            Assert.IsTrue(AuditRepo.VerifyChainIntegrity().IsValid);
        }

        [Test]
        public void Reseal_WaitsForOtherIpcWork_BecauseItRunsUnderTheExclusiveGate()
        {
            FieldInfo gateField = typeof(RafiqPOS.Bridge.IpcDispatcher).GetField("_dbGate", BindingFlags.NonPublic | BindingFlags.Static);
            Assert.IsNotNull(gateField, "_dbGate");
            var gate = (System.Threading.ReaderWriterLockSlim)gateField.GetValue(null);

            LoginAs(OwnerId);
            gate.EnterReadLock(); // another IPC call is in flight
            try
            {
                var task = System.Threading.Tasks.Task.Factory.StartNew(delegate { return Dispatch("audit:resealChain", null); });
                Assert.IsFalse(task.Wait(400), "إعادة الختم تنتظر انتهاء بقية الطلبات");
                gate.ExitReadLock();
                Assert.IsTrue(task.Wait(10000), "ثم تكتمل");
                Assert.IsTrue(task.Result.Success, Describe(task.Result));
            }
            finally
            {
                if (gate.IsReadLockHeld) gate.ExitReadLock();
            }
        }

        [Test]
        public void Root_CanReseal()
        {
            LoginAs(RootId);
            var res = Dispatch("audit:resealChain", null);
            Assert.IsTrue(res.Success, Describe(res));
            Assert.AreEqual(1L, CountAudit("AUDIT_CHAIN_RESEALED"));
        }
    }
}
