using System.Collections.Generic;
using System.Reflection;
using NUnit.Framework;
using RafiqPOS.Bridge;
using RafiqPOS.Common;

namespace RafiqPOS.Tests.Scenarios
{
    [TestFixture]
    [Category("FinancePure")]
    public class S55_FinancialRecoveryWiringTest
    {
        [TestCase("wallets:reconcileAttempt", "feature_digital_wallets", false)]
        [TestCase("wallets:abandonAttempt", "feature_digital_wallets", true)]
        [TestCase("epay:reconcileAttempt", "feature_epay_services", false)]
        [TestCase("epay:abandonAttempt", "feature_epay_services", true)]
        public void RecoveryPreservesSessionFeatureAndWriteGates(string action, string feature, bool writes)
        {
            var permissions = (Dictionary<string, string>)typeof(IpcDispatcher)
                .GetField("ACTION_PERMISSIONS", BindingFlags.NonPublic | BindingFlags.Static)
                .GetValue(null);
            Assert.AreEqual("__session_required__", permissions[action]);
            Assert.AreEqual(feature, FeatureRegistry.GetFeatureForCommand(action));
            Assert.AreEqual(!writes, FeatureRegistry.IsHistoricalOrReadCommand(action));
            var licenseGate = typeof(IpcDispatcher).GetMethod(
                "IsLicenseBlockedAction", BindingFlags.NonPublic | BindingFlags.Static);
            Assert.AreEqual(writes, licenseGate.Invoke(null, new object[] { action }));
        }
    }
}
