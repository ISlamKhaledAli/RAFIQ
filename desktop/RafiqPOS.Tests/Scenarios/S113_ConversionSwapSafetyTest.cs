using System;
using System.Collections.Generic;
using System.IO;
using NUnit.Framework;
using RafiqPOS.Data;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    /// <summary>
    /// The swap of the plain database for the encrypted one under hostile file-system conditions (antivirus holding files, locked
    /// renames, a failing post-swap check): retried, undone, or - when it cannot be undone - fatal with every file kept and never a
    /// new empty database next to the leftovers.
    /// </summary>
    [TestFixture]
    [NonParallelizable]
    public class S113_ConversionSwapSafetyTest
    {
        private string _base;
        private string _dbPath;
        private string _dataFolder;
        private IDictionary<string, string> _expected;

        [SetUp]
        public void SetUp()
        {
            TestMode.RequireEncrypted();
            _base = EncryptionTestKit.NewFolder("rafiq_nunit_swap_");
            _dbPath = EncryptionTestKit.InstallLegacyStore(_base);
            _dataFolder = Path.GetDirectoryName(_dbPath);
            _expected = EncryptionTestKit.Fingerprint(EncryptionTestKit.LegacyTemplate());
            EncryptionTestKit.UseStubBackup();
            DatabaseEncryptionService.RetryBaseDelayMilliseconds = 1;
        }

        [TearDown]
        public void TearDown()
        {
            DatabaseEncryptionService.ResetTestSeams();
            if (!TestMode.Plain) DatabaseKeyProvider.EnableDefaultEncryption();
            if (DatabaseService.License != null) DatabaseService.License.StopBackgroundPeriodicCheck();
            if (DatabaseService.Backup != null) DatabaseService.Backup.StopBackgroundPeriodicCheck();
            EncryptionTestKit.ResetDatabaseServiceStatics();
            if (_base != null) EncryptionTestKit.DeleteFolder(_base);
        }

        private EncryptionStartupResult Start()
        {
            return DatabaseEncryptionService.EnsureEncryptedAtStartup(_dataFolder, _dbPath, null);
        }

        private string Old { get { return _dbPath + DatabaseEncryptionService.OldPlainSuffix; } }
        private string Work { get { return _dbPath + DatabaseEncryptionService.WorkSuffix; } }

        private void AssertPlainOriginalIntact()
        {
            SQLiteConnection.ClearAllPools();
            Assert.IsTrue(DatabaseKeyProvider.IsPlainSqliteFile(_dbPath), "the plain original is the live file");
            Assert.IsNull(DatabaseFileAccess.CompareFingerprints(_expected, EncryptionTestKit.Fingerprint(_dbPath)), "and it is complete");
        }

        private void AssertConverted()
        {
            SQLiteConnection.ClearAllPools();
            Assert.AreEqual(DatabaseFileKind.NotPlain, DatabaseKeyProvider.DetectFileKind(_dbPath));
            Assert.IsNull(DatabaseFileAccess.CompareFingerprints(_expected, EncryptionTestKit.Fingerprint(_dbPath)));
            Assert.IsFalse(File.Exists(Old));
            Assert.IsFalse(File.Exists(Work));
            Assert.AreEqual(0, EncryptionTestKit.FindPlainSqliteFiles(_base).Count);
        }

        [Test]
        public void WhenBothSwapRenamesFail_StartupIsFatal_NoNewDatabaseAppears_AndTheNextStartRecovers()
        {
            DatabaseEncryptionService.FaultInjector = delegate(string point)
            {
                if (point == DatabaseEncryptionService.FaultRenameWorkToLive || point == DatabaseEncryptionService.FaultRenameRollback)
                {
                    throw new IOException("the file is locked by another process (simulated antivirus)");
                }
            };

            EncryptionSwapFatalException fatal = Assert.Throws<EncryptionSwapFatalException>(delegate { DatabaseService.Initialize(_base); });
            StringAssert.Contains("بيانات المحل محفوظة", fatal.Message);
            StringAssert.Contains("الدعم الفني", fatal.Message);

            SQLiteConnection.ClearAllPools();
            Assert.IsFalse(File.Exists(_dbPath), "no live file and, above all, NO new empty database");
            Assert.IsTrue(File.Exists(Old) && DatabaseKeyProvider.IsPlainSqliteFile(Old), "the plain original is kept");
            Assert.IsTrue(File.Exists(Work) && DatabaseKeyProvider.DetectFileKind(Work) == DatabaseFileKind.NotPlain, "the verified candidate is kept");
            Assert.IsTrue(File.Exists(DatabaseEncryptionService.PreEncryptionPath(_dbPath)), "the sealed copy is kept");

            // a second start in the same state must not fall back to creating a database either (the injector still blocks the recovery)
            Assert.Throws<EncryptionSwapFatalException>(delegate { DatabaseService.Initialize(_base); });
            Assert.IsFalse(File.Exists(_dbPath));

            // once the files are free again the next start finishes the swap by itself
            DatabaseEncryptionService.FaultInjector = null;
            EncryptionTestKit.ResetDatabaseServiceStatics();
            DatabaseService.Initialize(_base);
            Assert.IsFalse(DatabaseService.IsCorrupted);
            Assert.IsTrue(DatabaseEncryptionService.LastStartupResult.RecoveredInterruptedSwap);
            SQLiteConnection.ClearAllPools();
            Assert.AreEqual(DatabaseFileKind.NotPlain, DatabaseKeyProvider.DetectFileKind(_dbPath));
            Assert.AreEqual(EncryptionTestKit.Count(EncryptionTestKit.LegacyTemplate(), "sales"), EncryptionTestKit.Count(_dbPath, "sales"));
            Assert.IsFalse(File.Exists(Old), "the plain original was wiped after the encrypted file opened");
        }

        [Test]
        public void TransientIOException_OnTheFirstRename_IsRetried_AndTheConversionSucceeds()
        {
            int attempts = 0;
            DatabaseEncryptionService.FaultInjector = delegate(string point)
            {
                if (point == DatabaseEncryptionService.FaultRenameLiveToOld)
                {
                    attempts++;
                    if (attempts <= 3) throw new IOException("sharing violation (simulated)");
                }
            };
            EncryptionStartupResult result = Start();
            Assert.AreEqual(EncryptionStartupOutcome.Converted, result.Outcome, result.Message);
            Assert.AreEqual(4, attempts, "three failures, then the fourth try renamed it");
            AssertConverted();
        }

        [Test]
        public void UnauthorizedAccess_AlsoCountsAsRetryable()
        {
            int attempts = 0;
            DatabaseEncryptionService.FaultInjector = delegate(string point)
            {
                if (point == DatabaseEncryptionService.FaultRenameWorkToLive && ++attempts <= 2) throw new UnauthorizedAccessException("denied (simulated)");
            };
            Assert.AreEqual(EncryptionStartupOutcome.Converted, Start().Outcome);
            AssertConverted();
        }

        [Test]
        public void PersistentFailureOfTheFirstRename_IsAnOrdinaryFailure_AndTheOriginalStaysLive()
        {
            DatabaseEncryptionService.FaultInjector = delegate(string point)
            {
                if (point == DatabaseEncryptionService.FaultRenameLiveToOld) throw new IOException("locked (simulated)");
            };
            EncryptionStartupResult result = Start();
            Assert.AreEqual(EncryptionStartupOutcome.RunningPlain, result.Outcome);
            Assert.AreEqual(1, result.Failures);
            AssertPlainOriginalIntact();
            Assert.IsFalse(File.Exists(Old), "nothing was moved");
        }

        [Test]
        public void FailureOfTheSecondRename_IsRolledBack_AndALaterStartConverts()
        {
            DateTime now = new DateTime(2030, 6, 1, 8, 0, 0, DateTimeKind.Utc);
            DatabaseEncryptionService.UtcNow = delegate { return now; };
            DatabaseEncryptionService.FaultInjector = delegate(string point)
            {
                if (point == DatabaseEncryptionService.FaultRenameWorkToLive) throw new IOException("locked (simulated)");
            };
            EncryptionStartupResult result = Start();
            Assert.AreEqual(EncryptionStartupOutcome.RunningPlain, result.Outcome);
            AssertPlainOriginalIntact();
            Assert.IsFalse(File.Exists(Old), "the original was renamed back");
            Assert.IsFalse(File.Exists(Work), "the candidate of the failed attempt is removed while a live file exists");

            DatabaseEncryptionService.FaultInjector = null;
            now = now.AddHours(1);
            Assert.AreEqual(EncryptionStartupOutcome.Converted, Start().Outcome);
            AssertConverted();
        }

        private static void DamageFirstPage(string path)
        {
            using (FileStream fs = new FileStream(path, FileMode.Open, FileAccess.Write, FileShare.ReadWrite))
            {
                byte[] junk = new byte[4096];
                for (int i = 0; i < junk.Length; i++) junk[i] = 0x5A;
                fs.Write(junk, 0, junk.Length);
            }
        }

        [Test]
        public void PostSwapOpenFailure_RenamesTheBadFileAside_AndRestoresThePlainOriginal()
        {
            DateTime now = new DateTime(2030, 6, 1, 8, 0, 0, DateTimeKind.Utc);
            DatabaseEncryptionService.UtcNow = delegate { return now; };
            DatabaseEncryptionService.FaultInjector = delegate(string point)
            {
                if (point == DatabaseEncryptionService.FaultAfterRenameWorkToLive) { SQLiteConnection.ClearAllPools(); DamageFirstPage(_dbPath); }
            };
            EncryptionStartupResult result = Start();
            Assert.AreEqual(EncryptionStartupOutcome.RunningPlain, result.Outcome);
            StringAssert.Contains("لم تفتح", result.LastError);
            AssertPlainOriginalIntact();
            string[] bad = Directory.GetFiles(_dataFolder, "rafiq_pos.db" + DatabaseEncryptionService.BadSuffixPrefix + "*");
            Assert.AreEqual(1, bad.Length, "the encrypted file that failed its check is kept for support");

            // .bad_* files are removed after 14 days
            DatabaseEncryptionService.FaultInjector = null;
            now = now.AddDays(15);
            Assert.AreEqual(EncryptionStartupOutcome.Converted, Start().Outcome);
            Assert.AreEqual(0, Directory.GetFiles(_dataFolder, "rafiq_pos.db" + DatabaseEncryptionService.BadSuffixPrefix + "*").Length, "old .bad_* purged");
            AssertConverted();
        }

        [Test]
        public void PostSwapOpenFailure_WithAFailingRenameBack_IsFatal_AndKeepsEveryFile()
        {
            DatabaseEncryptionService.FaultInjector = delegate(string point)
            {
                if (point == DatabaseEncryptionService.FaultAfterRenameWorkToLive) { SQLiteConnection.ClearAllPools(); DamageFirstPage(_dbPath); }
                if (point == DatabaseEncryptionService.FaultRenameLiveToBad) throw new IOException("locked (simulated)");
            };
            Assert.Throws<EncryptionSwapFatalException>(delegate { Start(); });
            Assert.IsTrue(File.Exists(Old) && DatabaseKeyProvider.IsPlainSqliteFile(Old), "the plain original is kept");
            Assert.IsTrue(File.Exists(_dbPath), "the (bad) encrypted file is still there");
            Assert.IsTrue(File.Exists(DatabaseEncryptionService.PreEncryptionPath(_dbPath)));
        }

        [Test]
        public void NonEmptyWal_BeforeTheSwap_AbortsTheConversion()
        {
            DatabaseEncryptionService.FaultInjector = delegate(string point)
            {
                if (point == DatabaseEncryptionService.FaultBeforeSwap) File.WriteAllBytes(_dbPath + "-wal", new byte[100]);
            };
            EncryptionStartupResult result = Start();
            Assert.AreEqual(EncryptionStartupOutcome.RunningPlain, result.Outcome);
            StringAssert.Contains("WAL", result.LastError);
            Assert.IsFalse(File.Exists(Old), "no rename happened");
            DatabaseEncryptionService.FaultInjector = null;
            File.Delete(_dbPath + "-wal");
            AssertPlainOriginalIntact();
        }

        [TestCase("marker")]
        [TestCase("converting")]
        public void LiveFileMissing_NextToLeftovers_NeverCreatesANewDatabase(string leftover)
        {
            File.Delete(_dbPath);
            string leftoverPath;
            if (leftover == "marker")
            {
                // a valid marker that says the swap was in progress
                DatabaseEncryptionService.WriteMarkerForTests(_dataFolder, "Swapping", 0, null);
                leftoverPath = DatabaseEncryptionService.MarkerPath(_dataFolder);
            }
            else
            {
                leftoverPath = Work;
                File.WriteAllText(leftoverPath, "leftover of an interrupted conversion");
            }
            string before = EncryptionTestKit.Sha256Hex(leftoverPath);

            DatabaseStorageException ex = Assert.Throws<DatabaseStorageException>(delegate { DatabaseService.Initialize(_base); });
            Assert.AreEqual(DatabaseFailureKind.EncryptionSwapInterrupted, ex.Kind);
            Assert.AreEqual("ENCRYPTION_SWAP_INTERRUPTED", DatabaseFailureClassifier.IpcCode(ex.Kind));
            StringAssert.Contains("بيانات المحل محفوظة", ex.Message);
            SQLiteConnection.ClearAllPools();
            Assert.IsFalse(File.Exists(_dbPath), "no database was created");
            Assert.AreEqual(before, EncryptionTestKit.Sha256Hex(leftoverPath), "the leftover was not touched");
        }

        [Test]
        public void LiveFileMissing_NextToOnlyTheSealedCopy_HasItsOwnCodeAndNeverCreatesANewDatabase()
        {
            File.Delete(_dbPath);
            string sealedPath = DatabaseEncryptionService.PreEncryptionPath(_dbPath);
            File.WriteAllText(sealedPath, "sealed copy stand-in");
            DatabaseStorageException ex = Assert.Throws<DatabaseStorageException>(delegate { DatabaseService.Initialize(_base); });
            Assert.AreEqual(DatabaseFailureKind.EncryptionSealedOnly, ex.Kind);
            Assert.AreEqual("ENCRYPTION_SEALED_ONLY", DatabaseFailureClassifier.IpcCode(ex.Kind));
            StringAssert.Contains("database:restoreFromPreEncryptionCopy", ex.Message);
            SQLiteConnection.ClearAllPools();
            Assert.IsFalse(File.Exists(_dbPath));
            Assert.AreEqual("sealed copy stand-in", File.ReadAllText(sealedPath));
        }

        [Test]
        public void StalePlainOld_BesideAPlainLiveFile_IsRemovedAfterTheConversionVerifies()
        {
            File.Copy(EncryptionTestKit.LegacyTemplate(), Old);
            Assert.IsTrue(DatabaseKeyProvider.IsPlainSqliteFile(Old));
            EncryptionStartupResult result = Start();
            Assert.AreEqual(EncryptionStartupOutcome.Converted, result.Outcome, result.Message);
            Assert.AreEqual(0, Directory.GetFiles(_dataFolder, "*.stale*").Length);
            AssertConverted();
        }

        [Test]
        public void RecoveryRenameFailure_AtTheNextStart_IsFatal_AndNothingIsDeleted()
        {
            DatabaseEncryptionService.FaultInjector = delegate(string point)
            {
                if (point == DatabaseEncryptionService.FaultAfterRenameLiveToOld) throw new SimulatedCrashException(point);
            };
            Assert.Throws<SimulatedCrashException>(delegate { Start(); });

            DatabaseEncryptionService.FaultInjector = delegate(string point)
            {
                if (point == DatabaseEncryptionService.FaultRenameWorkToLive || point == DatabaseEncryptionService.FaultRenameRollback) throw new IOException("locked (simulated)");
            };
            Assert.Throws<EncryptionSwapFatalException>(delegate { Start(); });
            Assert.IsFalse(File.Exists(_dbPath));
            Assert.IsTrue(File.Exists(Old));
            Assert.IsTrue(File.Exists(Work));

            DatabaseEncryptionService.FaultInjector = null;
            Assert.AreEqual(EncryptionStartupOutcome.Converted, Start().Outcome);
            AssertConverted();
        }
    }
}
