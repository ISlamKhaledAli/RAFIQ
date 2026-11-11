using System;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using RafiqPOS.Common;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    /// <summary>
    /// نوع التوكن (kind) مُثبّت: لا يعمل كترخيص إلا توكن activation (التفعيل السحابي) أو support (كود الدعم)،
    /// أما clock_reset و pin_reset و root_session الموقّعة بنفس المفتاح فلا يمكن استخدامها كترخيص.
    /// </summary>
    [TestFixture]
    [NonParallelizable]
    public class S93_LicenseTokenKindPinningTest : TestBase
    {
        private LicenseService _license;

        [SetUp]
        public void LicenseSetUp()
        {
            LicenseService.InvalidateCache();
            _license = new LicenseService(SettingsRepo, new AuditLogService(AuditRepo));
        }

        [TearDown]
        public override void BaseTearDown()
        {
            LicenseService.InvalidateCache();
            base.BaseTearDown();
        }

        private static string BuildToken(string kind)
        {
            long now = LicenseTokenVerifier.ToUnix(DateTime.UtcNow);
            var payload = new JObject();
            payload["iss"] = "rafiq-license-server";
            payload["sub"] = "KIND-TEST-" + Guid.NewGuid().ToString("N");
            payload["fp"] = EncryptionService.GenerateDeviceFingerprint().Trim().ToUpperInvariant();
            payload["shop"] = "";
            payload["type"] = "lifetime";
            payload["iat"] = now;
            payload["exp"] = null;
            payload["kind"] = kind;
            payload["jti"] = Guid.NewGuid().ToString("N");
            return LicenseTokenVerifier.SignWithEphemeralTestKey(payload);
        }

        private LicenseInfo InfoWithStoredToken(string kind)
        {
            SettingsRepo.Set("license_token", BuildToken(kind));
            LicenseService.InvalidateCache();
            return _license.GetLicenseInfo();
        }

        [Test]
        public void ActivationAndSupportTokens_WorkAsALicense()
        {
            Assert.IsTrue(InfoWithStoredToken("activation").IsActive, "توكن التفعيل يعمل كترخيص");
            Assert.IsTrue(InfoWithStoredToken("support").IsActive, "توكن كود الدعم يعمل كترخيص");
        }

        [Test]
        public void ClockResetPinResetAndRootSessionTokens_CannotBeUsedAsALicense()
        {
            string[] kinds = new string[] { "clock_reset", "pin_reset", "root_session" };
            for (int i = 0; i < kinds.Length; i++)
            {
                LicenseInfo info = InfoWithStoredToken(kinds[i]);
                Assert.IsFalse(info.IsActive, kinds[i] + " لا يفعّل الترخيص");
                Assert.IsTrue(info.IsExpired, kinds[i] + " يترك النسخة غير مرخصة");
                Assert.AreEqual("invalid", info.Status, kinds[i]);
            }
        }

        [Test]
        public void SupportCodeActivation_RejectsTokensOfOtherKinds()
        {
            string[] wrongKinds = new string[] { "activation", "clock_reset", "pin_reset", "root_session" };
            for (int i = 0; i < wrongKinds.Length; i++)
            {
                var res = _license.ActivateWithSupportCode("RFQ-SUP-" + BuildToken(wrongKinds[i]), "محل");
                Assert.IsFalse(res.Success, wrongKinds[i] + " لا يُقبل ككود دعم");
                Assert.AreEqual("INVALID_CODE", res.Code, wrongKinds[i]);
            }
            Assert.AreEqual("", SettingsRepo.Get("license_token", ""), "لم يُحفظ أي توكن مرفوض");
        }

        [Test]
        public void SupportCodeActivation_AcceptsARealSupportToken()
        {
            string code = LicenseService.GenerateOfflineSupportCode(EncryptionService.GenerateDeviceFingerprint(), "lifetime", 9999);
            var res = _license.ActivateWithSupportCode(code, "محل");
            Assert.IsTrue(res.Success, res.Message);
            Assert.IsTrue(_license.GetLicenseInfo().IsActive);
        }
    }
}
