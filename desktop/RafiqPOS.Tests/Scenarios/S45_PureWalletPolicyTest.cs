using System;
using NUnit.Framework;
using RafiqPOS.Repositories;

namespace RafiqPOS.Tests.Scenarios
{
    // Deliberately no TestBase/S30 inheritance, SQLite connections, IPC or DatabaseService initialization.
    // These are actual production pure normalization APIs and are safe for provider-free NUnit execution.
    [TestFixture]
    [Category("FinancePure")]
    public class S45_PureWalletPolicyTest
    {
        [TestCase(null, "cash_drawer")]
        [TestCase("", "cash_drawer")]
        [TestCase(" \t ", "cash_drawer")]
        [TestCase(" Cash_Drawer ", "cash_drawer")]
        [TestCase(" TERMINAL_TILL ", "terminal_till")]
        [TestCase("SAFE", "safe")]
        [TestCase("External", "external")]
        public void FIN01_PureDestinationNormalizer_ProducesCanonicalGuardInput(string input, string expected)
        {
            Assert.AreEqual(expected, DigitalAccountRepository.NormalizePaymentDestination(input));
        }

        [TestCase("cash")]
        [TestCase("drawer")]
        [TestCase("bank_transfer")]
        [TestCase("external_cash")]
        [TestCase("untrusted")]
        public void FIN01_PureDestinationNormalizer_RejectsUnknownDestinations(string input)
        {
            Assert.Throws<ArgumentException>(delegate { DigitalAccountRepository.NormalizePaymentDestination(input); });
        }

        [TestCase(null, "cash_drawer")]
        [TestCase("", "cash_drawer")]
        [TestCase(" \t ", "cash_drawer")]
        [TestCase("cash_drawer", "cash_drawer")]
        [TestCase(" BANK_TRANSFER ", "bank_transfer")]
        [TestCase("external_cash", "external")]
        [TestCase(" EXTERNAL ", "external")]
        public void FIN03_PureFundingNormalizer_ResolvesUiAliasBeforeGuards(string input, string expected)
        {
            Assert.AreEqual(expected, DigitalAccountRepository.NormalizeFundingSource(input));
        }

        [TestCase("safe")]
        [TestCase("terminal_till")]
        [TestCase("wallet")]
        [TestCase("bank")]
        [TestCase("untrusted")]
        public void FIN03_PureFundingNormalizer_RejectsUnknownSources(string input)
        {
            Assert.Throws<ArgumentException>(delegate { DigitalAccountRepository.NormalizeFundingSource(input); });
        }
    }
}
