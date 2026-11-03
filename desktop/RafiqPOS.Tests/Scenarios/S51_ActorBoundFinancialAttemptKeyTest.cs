using System;
using NUnit.Framework;
using RafiqPOS.Common;

namespace RafiqPOS.Tests.Scenarios
{
    [TestFixture]
    [Category("FinancePure")]
    public class S51_ActorBoundFinancialAttemptKeyTest
    {
        [TestCase("actor-a", "financial_v1:actor-a:attempt-1")]
        [TestCase("actor /!'()*Ω", "financial_v1:actor%20%2F%21%27%28%29%2A%CE%A9:attempt-1")]
        public void PublicActorNamespaceMatchesBrowserEncoding(string actorId, string key)
        {
            IdempotencyGuard.VerifyFinancialAttemptKeyActor(key, actorId, true);
        }

        [TestCase("actor-b", "financial_v1:actor-a:attempt-1")]
        [TestCase("actor-a", "financial_v1:actor-a:")]
        [TestCase("actor-a", "legacy-uncommitted")]
        public void UncommittedOwnershipCannotBeChangedOrGuessed(string actorId, string key)
        {
            Assert.Throws<InvalidOperationException>(delegate { IdempotencyGuard.VerifyFinancialAttemptKeyActor(key, actorId, true); });
        }

        [Test]
        public void LegacyReadCanProceedToStrictFingerprintButCannotCreateAnUnprovenBarrier()
        {
            IdempotencyGuard.VerifyFinancialAttemptKeyActor("legacy-committed", "actor-a", false);
            Assert.Throws<InvalidOperationException>(delegate
            {
                IdempotencyGuard.VerifyFinancialAttemptKeyActor("legacy-committed", "actor-a", true);
            });
        }
    }
}
