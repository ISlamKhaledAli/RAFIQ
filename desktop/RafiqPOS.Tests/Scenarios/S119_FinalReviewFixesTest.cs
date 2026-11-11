using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using NUnit.Framework;
using RafiqPOS.Data;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    /// <summary>
    /// Final review round: a 0-byte live stub never hides swap leftovers, the sealed-only state has its own code and a root restore,
    /// post-swap cleanup failures are not "failed conversions", the sweep re-encryption is crash-safe, stale copies and back-offs are
    /// bounded, the sealed copy is verified, pre-conversion backups are pruned.
    /// </summary>
    [TestFixture]
    [NonParallelizable]
    public class S119_FinalReviewFixesTest
    {
        private string _base;
        private string _dbPath;
        private string _dataFolder;
        private IDictionary<string, string> _expected;

        [SetUp]
        public void SetUp()
        {
            TestMode.RequireEncrypted();
            _base = EncryptionTestKit.NewFolder("rafiq_nunit_final_");
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
        private string Sealed { get { return DatabaseEncryptionService.PreEncryptionPath(_dbPath); } }

        private void CrashBetweenRenames()
        {
            DatabaseEncryptionService.FaultInjector = delegate(string p)
            {
                if (p == DatabaseEncryptionService.FaultAfterRenameLiveToOld) throw new SimulatedCrashException(p);
            };
            try
            {
                Start();
                Assert.Fail("the crash point was not reached");
            }
            catch (SimulatedCrashException) { }
            DatabaseEncryptionService.FaultInjector = null;
            SQLiteConnection.ClearAllPools();
            Assert.IsFalse(File.Exists(_dbPath), "between the renames the live name is empty");
        }

        private void ConvertNow()
        {
            EncryptionStartupResult r = Start();
            Assert.AreEqual(EncryptionStartupOutcome.Converted, r.Outcome, r.Message + " " + r.LastError);
            SQLiteConnection.ClearAllPools();
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

        // ------------------------------------------------------------------ F3: a 0-byte live file is not a database

        [Test]
        public void EmptyLiveStub_WithOnlyThePlainOriginal_IsRolledBack_AndTheStoreIsConverted()
        {
            CrashBetweenRenames();
            File.Delete(Work);
            File.WriteAllBytes(_dbPath, new byte[0]);
            EncryptionStartupResult r = Start();
            Assert.AreEqual(EncryptionStartupOutcome.Converted, r.Outcome, r.Message + " " + r.LastError);
            AssertConverted();
        }

        [Test]
        public void EmptyLiveStub_WithOriginalAndVerifiedCandidate_FinishesTheSwap()
        {
            CrashBetweenRenames();
            File.WriteAllBytes(_dbPath, new byte[0]);
            EncryptionStartupResult r = Start();
            Assert.IsTrue(r.RecoveredInterruptedSwap);
            Assert.AreEqual(EncryptionStartupOutcome.Converted, r.Outcome);
            AssertConverted();
        }

        [TestCase("work")]
        [TestCase("sealed")]
        [TestCase("marker")]
        public void EmptyLiveStub_NextToLeftovers_ThrowsAndChangesNothing_NoNewSchema(string leftover)
        {
            File.Delete(_dbPath);
            File.WriteAllBytes(_dbPath, new byte[0]);
            string path;
            if (leftover == "marker")
            {
                DatabaseEncryptionService.WriteMarkerForTests(_dataFolder, "Swapping", 0, null);
                path = DatabaseEncryptionService.MarkerPath(_dataFolder);
            }
            else
            {
                path = leftover == "work" ? Work : Sealed;
                byte[] bytes = new byte[4096];
                for (int i = 0; i < bytes.Length; i++) bytes[i] = (byte)(i * 7 + 3);
                File.WriteAllBytes(path, bytes);
            }
            string before = EncryptionTestKit.Sha256Hex(path);

            DatabaseStorageException ex = Assert.Throws<DatabaseStorageException>(delegate { DatabaseService.Initialize(_base); });
            Assert.AreEqual(leftover == "sealed" ? DatabaseFailureKind.EncryptionSealedOnly : DatabaseFailureKind.EncryptionSwapInterrupted, ex.Kind);
            SQLiteConnection.ClearAllPools();
            Assert.AreEqual(0, new FileInfo(_dbPath).Length, "the stub was not turned into a new database (no schema was created)");
            Assert.AreEqual(before, EncryptionTestKit.Sha256Hex(path), "the leftover is byte-identical");
            Assert.IsFalse(File.Exists(_dbPath + "-wal"));
        }

        // ------------------------------------------------------------------ F4: post-swap steps are isolated

        [Test]
        public void AFailureAfterTheSwap_IsNotAFailedConversion_AndTheNextStartWipesThePlainOriginal()
        {
            int wipes = 0;
            DatabaseEncryptionService.FaultInjector = delegate(string p)
            {
                if (p == DatabaseEncryptionService.FaultAfterPostSwapCheck) throw new IOException("post-swap step failed (simulated)");
                if (p == DatabaseEncryptionService.FaultDuringWipe && wipes++ == 0) throw new IOException("wipe failed (simulated)");
            };
            DatabaseService.Initialize(_base);
            Assert.IsFalse(DatabaseService.IsCorrupted, "the encrypted file must not be mistaken for a corrupt one");
            Assert.IsFalse(DatabaseKeyProvider.IsPlainFallbackActive, "not running plain on an encrypted file");
            Assert.AreNotEqual(EncryptionStartupOutcome.RunningPlain, DatabaseEncryptionService.LastStartupResult.Outcome);
            SQLiteConnection.ClearAllPools();
            Assert.AreEqual(DatabaseFileKind.NotPlain, DatabaseKeyProvider.DetectFileKind(DatabaseService.DbPath));
            Assert.IsTrue(File.Exists(DatabaseService.DbPath + DatabaseEncryptionService.OldPlainSuffix), "the plain original could not be wiped this time");

            DatabaseEncryptionService.FaultInjector = null;
            if (DatabaseService.License != null) DatabaseService.License.StopBackgroundPeriodicCheck();
            if (DatabaseService.Backup != null) DatabaseService.Backup.StopBackgroundPeriodicCheck();
            EncryptionTestKit.ResetDatabaseServiceStatics();
            DatabaseService.Initialize(_base);
            SQLiteConnection.ClearAllPools();
            Assert.IsFalse(File.Exists(_dbPath + DatabaseEncryptionService.OldPlainSuffix), "the next start wipes it");
            Assert.IsFalse(DatabaseService.IsCorrupted);
        }

        [Test]
        public void AFailingSwappedMarkerWrite_DoesNotFailTheConversion()
        {
            DatabaseEncryptionService.FaultInjector = delegate(string p)
            {
                if (p == DatabaseEncryptionService.FaultSwappedMarkerWrite) throw new IOException("marker write failed (simulated)");
            };
            EncryptionStartupResult r = Start();
            Assert.AreEqual(EncryptionStartupOutcome.Converted, r.Outcome, r.Message + " " + r.LastError);
            Assert.AreEqual(0, r.Failures);
            AssertConverted();
            Assert.IsTrue(DatabaseEncryptionService.HasValidEvidence(_dataFolder));
        }

        [Test]
        public void Initialize_IgnoresARunningPlainResult_WhenTheLiveFileIsReallyEncrypted()
        {
            ConvertNow();
            EncryptionStartupResult bogus = new EncryptionStartupResult();
            bogus.Outcome = EncryptionStartupOutcome.RunningPlain;
            typeof(DatabaseService).GetField("_preparedEncryption", BindingFlags.Static | BindingFlags.NonPublic).SetValue(null, bogus);
            typeof(DatabaseService).GetField("_preparedDbPath", BindingFlags.Static | BindingFlags.NonPublic).SetValue(null, Path.Combine(_dataFolder, "rafiq_pos.db"));
            DatabaseService.Initialize(_base);
            Assert.IsFalse(DatabaseService.IsCorrupted);
            Assert.IsFalse(DatabaseKeyProvider.IsPlainFallbackActive);
        }

        // ------------------------------------------------------------------ F5: marker-only, sealed-only, restore action

        [Test]
        public void AMarkerOnlyLeftover_DoesNotBlockAMissingLiveFile()
        {
            File.Delete(_dbPath);
            DatabaseEncryptionService.WriteMarkerForTests(_dataFolder, "Failed", 2, DateTime.UtcNow.AddHours(1));
            EncryptionStartupResult r = Start();
            Assert.AreEqual(EncryptionStartupOutcome.NewDatabase, r.Outcome);
            Assert.IsFalse(File.Exists(DatabaseEncryptionService.MarkerPath(_dataFolder)), "the stale marker is removed");
        }

        [Test]
        public void RestoreFromThePreEncryptionCopy_PutsTheSealedCopyBack_WhenTheLiveFileIsMissingOrEmpty()
        {
            ConvertNow();
            Assert.IsTrue(File.Exists(Sealed));
            string sealedHash = EncryptionTestKit.Sha256Hex(Sealed);

            // live file present: refused, nothing changes
            string liveHash = EncryptionTestKit.Sha256Hex(_dbPath);
            Assert.IsNotNull(DatabaseEncryptionService.RestoreFromPreEncryptionCopy(_dbPath));
            Assert.AreEqual(liveHash, EncryptionTestKit.Sha256Hex(_dbPath));

            // missing
            File.Delete(_dbPath);
            Assert.IsNull(DatabaseEncryptionService.RestoreFromPreEncryptionCopy(_dbPath));
            SQLiteConnection.ClearAllPools();
            Assert.AreEqual(DatabaseFileKind.NotPlain, DatabaseKeyProvider.DetectFileKind(_dbPath));
            Assert.AreEqual(EncryptionTestKit.Count(EncryptionTestKit.LegacyTemplate(), "sales"), EncryptionTestKit.Count(_dbPath, "sales"));
            Assert.AreEqual(sealedHash, EncryptionTestKit.Sha256Hex(Sealed), "the sealed copy is kept");

            // an empty stub
            File.Delete(_dbPath);
            File.WriteAllBytes(_dbPath, new byte[0]);
            Assert.IsNull(DatabaseEncryptionService.RestoreFromPreEncryptionCopy(_dbPath));
            SQLiteConnection.ClearAllPools();
            Assert.Greater(new FileInfo(_dbPath).Length, 0);
            Assert.AreEqual(0, Directory.GetFiles(_dataFolder, "*.restoring").Length);
        }

        [Test]
        public void RestoreFromThePreEncryptionCopy_RefusesADamagedSealedCopy_AndAnInterruptedSwap()
        {
            ConvertNow();
            File.Delete(_dbPath);
            byte[] bytes = File.ReadAllBytes(Sealed);
            for (int i = 0; i < 200; i++) bytes[i] = (byte)(bytes[i] ^ 0x5A);
            File.WriteAllBytes(Sealed, bytes);
            string error = DatabaseEncryptionService.RestoreFromPreEncryptionCopy(_dbPath);
            Assert.IsNotNull(error);
            Assert.IsFalse(File.Exists(_dbPath), "no file was created from a damaged copy");

            File.WriteAllBytes(Old, new byte[] { 1, 2, 3 });
            Assert.IsNotNull(DatabaseEncryptionService.RestoreFromPreEncryptionCopy(_dbPath), "an interrupted swap is for the startup recovery, not for this action");
            Assert.IsFalse(File.Exists(_dbPath));
        }

        // ------------------------------------------------------------------ F7

        [Test]
        public void ABackOffReadFromTheMarker_IsNeverLongerThanADay()
        {
            DateTime now = DateTime.UtcNow;
            // a legitimate 20 h back-off still blocks, and ends when the clock passes it
            DatabaseEncryptionService.WriteMarkerForTests(_dataFolder, "Failed", 3, now.AddHours(20));
            EncryptionStartupResult blocked = Start();
            Assert.AreEqual(EncryptionStartupOutcome.RunningPlain, blocked.Outcome);
            Assert.LessOrEqual(blocked.NextAttemptUtc.Value, now.AddHours(24));
            DatabaseEncryptionService.UtcNow = delegate { return now.AddHours(25); };
            Assert.AreEqual(EncryptionStartupOutcome.Converted, Start().Outcome);
        }

        [Test]
        public void ABackOffThirtyDaysAhead_FromAWrongClock_IsTreatedAsDue()
        {
            DateTime now = DateTime.UtcNow;
            DatabaseEncryptionService.WriteMarkerForTests(_dataFolder, "Failed", 3, now.AddDays(30));
            EncryptionStartupResult r = Start();
            Assert.AreEqual(EncryptionStartupOutcome.Converted, r.Outcome, "a wrong clock cannot postpone the retry for months");
        }

        [Test]
        public void AStalePlainOld_BesideAPlainLiveFile_IsKeptUntilTheNewConversionVerifies()
        {
            byte[] bytes = File.ReadAllBytes(EncryptionTestKit.LegacyTemplate());
            File.WriteAllBytes(Old, bytes);
            string hash = EncryptionTestKit.Sha256Hex(Old);
            DatabaseEncryptionService.FaultInjector = delegate(string p)
            {
                if (p == DatabaseEncryptionService.FaultAfterEncrypt) throw new IOException("conversion failed (simulated)");
            };
            EncryptionStartupResult failed = Start();
            Assert.AreEqual(EncryptionStartupOutcome.RunningPlain, failed.Outcome);
            string[] stale = Directory.GetFiles(_dataFolder, "*.plain-old.stale*");
            Assert.AreEqual(1, stale.Length, "the stale copy was set aside, not wiped");
            Assert.AreEqual(hash, EncryptionTestKit.Sha256Hex(stale[0]), "byte-identical");
            Assert.IsFalse(File.Exists(Old));

            DatabaseEncryptionService.FaultInjector = null;
            DatabaseEncryptionService.UtcNow = delegate { return DateTime.UtcNow.AddHours(3); };
            Assert.AreEqual(EncryptionStartupOutcome.Converted, Start().Outcome);
            Assert.AreEqual(0, Directory.GetFiles(_dataFolder, "*.stale*").Length, "wiped after the conversion verified");
            AssertConverted();
        }

        [Test]
        public void ASealedCopy_ThatDiffersFromTheVerifiedCandidate_CancelsTheConversion()
        {
            DatabaseEncryptionService.FaultInjector = delegate(string p)
            {
                if (p == DatabaseEncryptionService.FaultAfterSealCopy) File.WriteAllBytes(Sealed + ".tmp", new byte[10]);
            };
            EncryptionStartupResult r = Start();
            Assert.AreEqual(EncryptionStartupOutcome.RunningPlain, r.Outcome);
            StringAssert.Contains("نسخة ما قبل التشفير", r.LastError);
            Assert.IsFalse(File.Exists(Sealed));
            SQLiteConnection.ClearAllPools();
            Assert.IsTrue(DatabaseKeyProvider.IsPlainSqliteFile(_dbPath));
            Assert.IsNull(DatabaseFileAccess.CompareFingerprints(_expected, EncryptionTestKit.Fingerprint(_dbPath)));
        }

        [Test]
        public void SweepReencryption_CrashedBetweenItsRenames_IsFinishedByName_AtTheNextStart()
        {
            ConvertNow();
            string quarantine = Path.Combine(_dataFolder, "quarantine");
            Directory.CreateDirectory(quarantine);
            string file = Path.Combine(quarantine, "old_corrupt.db");
            File.Copy(EncryptionTestKit.LegacyTemplate(), file);
            DatabaseEncryptionService.FaultInjector = delegate(string p)
            {
                if (p == DatabaseEncryptionService.FaultSweepBetweenRenames) throw new SimulatedCrashException(p);
            };
            try { Start(); Assert.Fail("not reached"); }
            catch (SimulatedCrashException) { }
            DatabaseEncryptionService.FaultInjector = null;
            SQLiteConnection.ClearAllPools();
            Assert.IsFalse(File.Exists(file), "crashed between the renames");
            Assert.IsTrue(File.Exists(file + ".sweep") && File.Exists(file + DatabaseEncryptionService.SweepPlainSuffix));

            Start();
            SQLiteConnection.ClearAllPools();
            Assert.AreEqual(DatabaseFileKind.NotPlain, DatabaseKeyProvider.DetectFileKind(file));
            Assert.AreEqual(EncryptionTestKit.Count(EncryptionTestKit.LegacyTemplate(), "sales"), EncryptionTestKit.Count(file, "sales"));
            Assert.AreEqual(0, Directory.GetFiles(quarantine, "*.sweep*").Length);
            Assert.AreEqual(0, EncryptionTestKit.FindFilesContaining(_base, EncryptionTestKit.TemplateProductMarker).Count);
        }

        [Test]
        public void SweepReencryption_CrashedAfterTheEncryptedFileWasWritten_LeavesTheOriginalAndRedoesIt()
        {
            ConvertNow();
            string quarantine = Path.Combine(_dataFolder, "quarantine");
            Directory.CreateDirectory(quarantine);
            string file = Path.Combine(quarantine, "old_corrupt.db");
            File.Copy(EncryptionTestKit.LegacyTemplate(), file);
            string hash = EncryptionTestKit.Sha256Hex(file);
            DatabaseEncryptionService.FaultInjector = delegate(string p)
            {
                if (p == DatabaseEncryptionService.FaultSweepAfterEncrypt) throw new SimulatedCrashException(p);
            };
            try { Start(); Assert.Fail("not reached"); }
            catch (SimulatedCrashException) { }
            DatabaseEncryptionService.FaultInjector = null;
            SQLiteConnection.ClearAllPools();
            Assert.AreEqual(hash, EncryptionTestKit.Sha256Hex(file), "the original is untouched until the replacement is in place");

            Start();
            SQLiteConnection.ClearAllPools();
            Assert.AreEqual(DatabaseFileKind.NotPlain, DatabaseKeyProvider.DetectFileKind(file));
            Assert.AreEqual(0, Directory.GetFiles(quarantine, "*.sweep*").Length);
        }

        [Test]
        public void ATransientIoError_WhileVerifyingTheCandidateAtRecovery_IsRetried_NotTreatedAsAMismatch()
        {
            CrashBetweenRenames();
            int calls = 0;
            DatabaseEncryptionService.FaultInjector = delegate(string p)
            {
                if (p == DatabaseEncryptionService.FaultRecoveryVerify && calls++ < 2) throw new IOException("file is locked (simulated)");
            };
            EncryptionStartupResult r = Start();
            Assert.IsTrue(r.RecoveredInterruptedSwap, "the good candidate was used, not deleted");
            AssertConverted();
        }

        [Test]
        public void APersistentIoError_WhileVerifyingTheCandidate_IsFatal_AndKeepsBothFiles()
        {
            CrashBetweenRenames();
            string oldHash = EncryptionTestKit.Sha256Hex(Old);
            string workHash = EncryptionTestKit.Sha256Hex(Work);
            DatabaseEncryptionService.FaultInjector = delegate(string p)
            {
                if (p == DatabaseEncryptionService.FaultRecoveryVerify) throw new IOException("file is locked (simulated)");
            };
            Assert.Throws<EncryptionSwapFatalException>(delegate { Start(); });
            Assert.IsFalse(File.Exists(_dbPath));
            Assert.AreEqual(oldHash, EncryptionTestKit.Sha256Hex(Old));
            Assert.AreEqual(workHash, EncryptionTestKit.Sha256Hex(Work), "a good candidate is never deleted because of a hiccup");
        }

        [Test]
        public void PreConversionBackups_AreListed_AndOnlyTheNewestTwoAreKept_UserBackupsAreNeverTouched()
        {
            string backups = Path.Combine(_base, "backups");
            Directory.CreateDirectory(backups);
            string user = Path.Combine(backups, "rafiq_backup_20200101_000000.db");
            File.WriteAllText(user, "the owner's own backup");
            List<string> made = new List<string>();
            for (int i = 1; i <= 4; i++)
            {
                string f = Path.Combine(backups, "rafiq_backup_2026010" + i + "_120000.db");
                File.WriteAllText(f, "pre-conversion " + i);
                File.WriteAllText(Path.Combine(backups, "rafiq_rx_2026010" + i + "_120000.db"), "companion " + i);
                made.Add(f);
                DatabaseEncryptionService.RecordAndPrunePreConversionBackups(_dataFolder, f);
            }
            Assert.IsFalse(File.Exists(made[0]));
            Assert.IsFalse(File.Exists(made[1]));
            Assert.IsTrue(File.Exists(made[2]));
            Assert.IsTrue(File.Exists(made[3]));
            Assert.IsFalse(File.Exists(Path.Combine(backups, "rafiq_rx_20260101_120000.db")), "the companion of a pruned backup goes too");
            Assert.AreEqual("the owner's own backup", File.ReadAllText(user));
        }
    }
}
