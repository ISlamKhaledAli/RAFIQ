using System;
using NUnit.Framework;
using RafiqPOS.Data;

namespace RafiqPOS.Tests
{
    // Test-suite mode switch. Default: every database the tests create is ENCRYPTED (the shipping behaviour).
    // RAFIQ_TEST_PLAIN=1 runs the whole suite against plain databases (to compare engines or to debug with a SQLite viewer).
    public static class TestMode
    {
        public static bool Plain
        {
            get { return Environment.GetEnvironmentVariable("RAFIQ_TEST_PLAIN") == "1"; }
        }

        // Encryption-specific scenarios have nothing to assert in plain mode.
        public static void RequireEncrypted()
        {
            if (Plain) Assert.Ignore("RAFIQ_TEST_PLAIN=1: encryption scenarios are skipped in plain mode");
        }
    }

    [SetUpFixture]
    public class GlobalTestSetup
    {
        [OneTimeSetUp]
        public void ApplyMode()
        {
            if (TestMode.Plain) DatabaseKeyProvider.DisableDefaultEncryption();
            else DatabaseKeyProvider.EnableDefaultEncryption();
        }
    }
}
