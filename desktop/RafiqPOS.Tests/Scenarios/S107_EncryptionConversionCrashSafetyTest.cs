using System;
using System.Collections.Generic;
using System.IO;
using NUnit.Framework;
using RafiqPOS.Data;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    /// <summary>
    /// تحويل قاعدة بيانات قديمة غير مشفرة إلى مشفرة: لا يمس الملف الأصلي قبل التحقق، ينجو من انقطاع الكهرباء عند كل خطوة
    /// (بما فيها بين عمليتي إعادة التسمية)، يرفض أي اختلاف في الصفوف، ويتراجع بعد 3 محاولات فاشلة.
    /// </summary>
    [TestFixture]
    [NonParallelizable]
    public class S107_EncryptionConversionCrashSafetyTest
    {
        private string _base;
        private string _dbPath;
        private string _dataFolder;
        private IDictionary<string, string> _expected;

        [SetUp]
        public void SetUp()
        {
            TestMode.RequireEncrypted();
            _base = EncryptionTestKit.NewFolder("rafiq_nunit_conv_");
            _dbPath = EncryptionTestKit.InstallLegacyStore(_base);
            _dataFolder = Path.GetDirectoryName(_dbPath);
            _expected = EncryptionTestKit.Fingerprint(EncryptionTestKit.LegacyTemplate());
            // the real pre-conversion backup (it writes settings into the store) is covered by S112; here the original is compared byte for byte
            EncryptionTestKit.UseStubBackup();
            DatabaseEncryptionService.RetryBaseDelayMilliseconds = 1;
        }

        [TearDown]
        public void TearDown()
        {
            DatabaseEncryptionService.ResetTestSeams();
            if (!TestMode.Plain) DatabaseKeyProvider.EnableDefaultEncryption();
            if (_base != null) EncryptionTestKit.DeleteFolder(_base);
        }

        private EncryptionStartupResult Start()
        {
            return DatabaseEncryptionService.EnsureEncryptedAtStartup(_dataFolder, _dbPath, null);
        }

        private static void CrashAt(string point)
        {
            DatabaseEncryptionService.FaultInjector = delegate(string reached)
            {
                if (reached == point) throw new SimulatedCrashException(point);
            };
        }

        private void AssertConvertedAndClean()
        {
            SQLiteConnection.ClearAllPools();
            Assert.AreEqual(DatabaseFileKind.NotPlain, DatabaseKeyProvider.DetectFileKind(_dbPath), "live file is encrypted");
            Assert.IsNull(DatabaseFileAccess.CompareFingerprints(_expected, EncryptionTestKit.Fingerprint(_dbPath)), "every row equals the original");
            Assert.IsFalse(File.Exists(_dbPath + DatabaseEncryptionService.OldPlainSuffix), "the plain original is gone");
            Assert.IsFalse(File.Exists(_dbPath + DatabaseEncryptionService.WorkSuffix), "no working copy left");
            Assert.IsFalse(File.Exists(DatabaseEncryptionService.MarkerPath(_dataFolder)), "no marker left");
            string sealedPath = DatabaseEncryptionService.PreEncryptionPath(_dbPath);
            Assert.IsTrue(File.Exists(sealedPath), "the pre-encryption copy exists");
            Assert.AreEqual(DatabaseFileKind.NotPlain, DatabaseKeyProvider.DetectFileKind(sealedPath));
            Assert.IsNull(DatabaseFileAccess.CompareFingerprints(_expected, EncryptionTestKit.Fingerprint(sealedPath)), "the sealed copy equals the original");
            Assert.AreEqual(0, EncryptionTestKit.FindPlainSqliteFiles(_base).Count, "no plain SQLite file remains anywhere");
        }

        [Test]
        public void HappyPath_ConvertsAndKeepsTheSealedCopy()
        {
            EncryptionStartupResult result = Start();
            Assert.AreEqual(EncryptionStartupOutcome.Converted, result.Outcome, result.Message);
            AssertConvertedAndClean();
            Assert.AreEqual(EncryptionStartupOutcome.AlreadyEncrypted, Start().Outcome, "a second start has nothing to do");
        }

        [TestCase(DatabaseEncryptionService.FaultAfterSnapshot)]
        [TestCase(DatabaseEncryptionService.FaultAfterEncrypt)]
        [TestCase(DatabaseEncryptionService.FaultAfterVerify)]
        [TestCase(DatabaseEncryptionService.FaultAfterSeal)]
        public void CrashBeforeTheSwap_LeavesTheOriginalUntouched_AndRestartCompletes(string point)
        {
            string hashBefore = EncryptionTestKit.Sha256Hex(_dbPath);
            CrashAt(point);
            Assert.Throws<SimulatedCrashException>(delegate { Start(); });
            DatabaseEncryptionService.FaultInjector = null;
            SQLiteConnection.ClearAllPools();

            Assert.IsTrue(DatabaseKeyProvider.IsPlainSqliteFile(_dbPath), "the original is still the plain live file after a crash at " + point);
            Assert.AreEqual(hashBefore, EncryptionTestKit.Sha256Hex(_dbPath), "byte-identical original after a crash at " + point);
            Assert.IsNull(DatabaseFileAccess.CompareFingerprints(_expected, EncryptionTestKit.Fingerprint(_dbPath)), "usable and complete after a crash at " + point);

            EncryptionStartupResult result = Start();
            Assert.AreEqual(EncryptionStartupOutcome.Converted, result.Outcome, point + ": " + result.Message);
            AssertConvertedAndClean();
        }

        [Test]
        public void KillBetweenTheTwoRenames_NoLiveFile_RestartFinishesTheSwap()
        {
            CrashAt(DatabaseEncryptionService.FaultAfterRenameLiveToOld);
            Assert.Throws<SimulatedCrashException>(delegate { Start(); });
            DatabaseEncryptionService.FaultInjector = null;
            SQLiteConnection.ClearAllPools();

            Assert.IsFalse(File.Exists(_dbPath), "between the renames there is no live file");
            Assert.IsTrue(File.Exists(_dbPath + DatabaseEncryptionService.OldPlainSuffix), "the plain original is parked");
            Assert.IsTrue(File.Exists(_dbPath + DatabaseEncryptionService.WorkSuffix), "the verified candidate is waiting");

            EncryptionStartupResult result = Start();
            Assert.AreEqual(EncryptionStartupOutcome.Converted, result.Outcome, result.Message);
            Assert.IsTrue(result.RecoveredInterruptedSwap, "the interrupted swap was completed");
            AssertConvertedAndClean();
        }

        [Test]
        public void KillBetweenTheTwoRenames_WithADamagedCandidate_RestartRestoresTheOriginal_ThenConvertsAgain()
        {
            CrashAt(DatabaseEncryptionService.FaultAfterRenameLiveToOld);
            Assert.Throws<SimulatedCrashException>(delegate { Start(); });
            DatabaseEncryptionService.FaultInjector = null;
            SQLiteConnection.ClearAllPools();

            // the candidate is damaged (disk trouble) while the live file is missing
            string work = _dbPath + DatabaseEncryptionService.WorkSuffix;
            using (var fs = new FileStream(work, FileMode.Open, FileAccess.Write))
            {
                fs.Position = (fs.Length / 2 / 4096) * 4096;
                byte[] junk = new byte[4096];
                for (int i = 0; i < junk.Length; i++) junk[i] = 0x5A;
                fs.Write(junk, 0, junk.Length);
            }

            EncryptionStartupResult result = Start();
            Assert.IsFalse(result.RecoveredInterruptedSwap, "a damaged candidate must never become the live database");
            Assert.AreEqual(EncryptionStartupOutcome.Converted, result.Outcome, "the original came back and was converted again: " + result.Message);
            AssertConvertedAndClean();
        }

        [Test]
        public void CrashAfterTheSwap_BeforeTheSealedPlainOriginalIsWiped_RestartWipesIt()
        {
            string[] points = new string[]
            {
                DatabaseEncryptionService.FaultAfterRenameWorkToLive,
                DatabaseEncryptionService.FaultAfterPostSwapCheck,
                DatabaseEncryptionService.FaultDuringWipe
            };
            for (int i = 0; i < points.Length; i++)
            {
                TearDownAndSetUpFresh();
                CrashAt(points[i]);
                Assert.Throws<SimulatedCrashException>(delegate { Start(); });
                DatabaseEncryptionService.FaultInjector = null;
                SQLiteConnection.ClearAllPools();

                Assert.AreEqual(DatabaseFileKind.NotPlain, DatabaseKeyProvider.DetectFileKind(_dbPath), "the encrypted file is already live after a crash at " + points[i]);
                Assert.IsTrue(File.Exists(_dbPath + DatabaseEncryptionService.OldPlainSuffix), "the plain original still exists at " + points[i]);

                EncryptionStartupResult result = Start();
                Assert.AreEqual(EncryptionStartupOutcome.Converted, result.Outcome, points[i] + ": " + result.Message);
                AssertConvertedAndClean();
            }
        }

        [Test]
        public void SixCrashesInARow_ThenARestart_EndsInACorrectEncryptedStore()
        {
            string[] points = new string[]
            {
                DatabaseEncryptionService.FaultAfterSnapshot,
                DatabaseEncryptionService.FaultAfterEncrypt,
                DatabaseEncryptionService.FaultAfterVerify,
                DatabaseEncryptionService.FaultAfterSeal,
                DatabaseEncryptionService.FaultAfterRenameLiveToOld,
                DatabaseEncryptionService.FaultDuringWipe
            };
            for (int i = 0; i < points.Length; i++)
            {
                CrashAt(points[i]);
                Assert.Throws<SimulatedCrashException>(delegate { Start(); }, "crash " + (i + 1) + " at " + points[i]);
                DatabaseEncryptionService.FaultInjector = null;
                SQLiteConnection.ClearAllPools();
                bool hasLive = File.Exists(_dbPath);
                bool hasOld = File.Exists(_dbPath + DatabaseEncryptionService.OldPlainSuffix);
                Assert.IsTrue(hasLive || hasOld, "some complete copy of the data always exists (after crash at " + points[i] + ")");
            }
            EncryptionStartupResult result = Start();
            Assert.AreEqual(EncryptionStartupOutcome.Converted, result.Outcome, result.Message);
            AssertConvertedAndClean();
        }

        [Test]
        public void DiskFull_Simulation_KeepsThePlainStore_WithBackoff_CriticalAfterThreeFailures_AndRetriesDaily()
        {
            string hashBefore = EncryptionTestKit.Sha256Hex(_dbPath);
            DateTime now = new DateTime(2030, 1, 1, 8, 0, 0, DateTimeKind.Utc);
            DatabaseEncryptionService.UtcNow = delegate { return now; };
            long freeSpace = 1024;
            DatabaseEncryptionService.FreeSpaceProvider = delegate(string path) { return freeSpace; };

            // failure 1: needs 3x the database size
            EncryptionStartupResult r1 = Start();
            Assert.AreEqual(EncryptionStartupOutcome.RunningPlain, r1.Outcome);
            Assert.AreEqual(1, r1.Failures);
            Assert.IsFalse(r1.Stopped);
            StringAssert.Contains("مساحة القرص", r1.Message);
            Assert.AreEqual(hashBefore, EncryptionTestKit.Sha256Hex(_dbPath), "the original is untouched by a failed attempt");

            // plenty of space now, but the back-off has not passed: no new attempt
            freeSpace = long.MaxValue;
            now = now.AddMinutes(5);
            EncryptionStartupResult r2 = Start();
            Assert.AreEqual(EncryptionStartupOutcome.RunningPlain, r2.Outcome);
            Assert.AreEqual(1, r2.Failures, "no attempt was made during the back-off");
            Assert.IsTrue(r2.NextAttemptUtc.HasValue);
            Assert.IsTrue(DatabaseKeyProvider.IsPlainSqliteFile(_dbPath));

            // failures 2 and 3
            freeSpace = 1024;
            now = now.AddHours(1);
            Assert.AreEqual(2, Start().Failures);
            now = now.AddHours(3);
            EncryptionStartupResult r3 = Start();
            Assert.AreEqual(3, r3.Failures);
            Assert.IsTrue(r3.Stopped, "stopped after three failures");

            // after three failures the alert is critical but the store is NOT abandoned: one attempt per start, at most once a day
            freeSpace = long.MaxValue;
            now = now.AddHours(23);
            EncryptionStartupResult r4 = Start();
            Assert.AreEqual(EncryptionStartupOutcome.RunningPlain, r4.Outcome);
            Assert.IsTrue(r4.Stopped, "still critical");
            Assert.AreEqual(3, r4.Failures, "no attempt inside the 24 hour window");
            Assert.IsTrue(DatabaseKeyProvider.IsPlainSqliteFile(_dbPath));
            EncryptionStatus status = DatabaseEncryptionService.GetStatus(_dbPath);
            Assert.IsTrue(status.ConversionStopped);
            Assert.AreEqual("Failed", status.ConversionState);

            // the retry action clears the counter; here the daily retry instead: 24 hours later with space available it converts by itself
            now = now.AddHours(2);
            EncryptionStartupResult daily = Start();
            Assert.AreEqual(EncryptionStartupOutcome.Converted, daily.Outcome, daily.Message);
            AssertConvertedAndClean();
        }

        [Test]
        public void RootRetryAction_ClearsTheFailureCounter_SoTheNextStartConvertsImmediately()
        {
            DateTime now = new DateTime(2030, 1, 1, 8, 0, 0, DateTimeKind.Utc);
            DatabaseEncryptionService.UtcNow = delegate { return now; };
            DatabaseEncryptionService.FreeSpaceProvider = delegate(string path) { return 1024; };
            for (int i = 0; i < 3; i++)
            {
                Start();
                now = now.AddDays(2);
            }
            Assert.AreEqual(3, DatabaseEncryptionService.GetStatus(_dbPath).ConversionFailures);

            DatabaseEncryptionService.FreeSpaceProvider = delegate(string path) { return long.MaxValue; };
            now = now.AddMinutes(1);
            DatabaseEncryptionService.ResetConversionFailures(_dataFolder);
            EncryptionStartupResult r5 = Start();
            Assert.AreEqual(EncryptionStartupOutcome.Converted, r5.Outcome, r5.Message);
            AssertConvertedAndClean();
        }

        [Test]
        public void RetryReset_AfterASingleFailure_ConvertsOnTheNextStart()
        {
            // kept as a short smoke test of the retry reset flow on a fresh store
            DatabaseEncryptionService.FreeSpaceProvider = delegate(string path) { return 1024; };
            Assert.AreEqual(1, Start().Failures);
            DatabaseEncryptionService.FreeSpaceProvider = delegate(string path) { return long.MaxValue; };
            DatabaseEncryptionService.ResetConversionFailures(_dataFolder);
            EncryptionStartupResult r5 = Start();
            Assert.AreEqual(EncryptionStartupOutcome.Converted, r5.Outcome, r5.Message);
            AssertConvertedAndClean();
        }

        [Test]
        public void WhenTheEncryptedCandidateDiffersByOneValue_VerificationFails_AndThePlainStoreStays()
        {
            string hashBefore = EncryptionTestKit.Sha256Hex(_dbPath);
            DatabaseEncryptionService.FaultInjector = delegate(string point)
            {
                if (point != DatabaseEncryptionService.FaultAfterEncrypt) return;
                using (SQLiteConnection conn = DatabaseFileAccess.Open(_dbPath + DatabaseEncryptionService.WorkSuffix, false, false))
                {
                    DatabaseFileAccess.Execute(conn, "UPDATE sales SET total_piasters = total_piasters + 1 WHERE rowid = (SELECT MIN(rowid) FROM sales);");
                }
            };

            EncryptionStartupResult result = Start();
            DatabaseEncryptionService.FaultInjector = null;
            SQLiteConnection.ClearAllPools();

            Assert.AreEqual(EncryptionStartupOutcome.RunningPlain, result.Outcome, "a one-piaster difference blocks the conversion");
            StringAssert.Contains("table:sales", result.LastError);
            Assert.AreEqual(1, result.Failures);
            Assert.AreEqual(hashBefore, EncryptionTestKit.Sha256Hex(_dbPath), "the original is untouched");
            Assert.IsFalse(File.Exists(_dbPath + DatabaseEncryptionService.WorkSuffix), "the bad candidate is removed");
            Assert.IsFalse(File.Exists(DatabaseEncryptionService.PreEncryptionPath(_dbPath)), "no sealed copy of a rejected candidate");
        }

        [Test]
        public void WhenTheCandidateLosesARowOrASchemaObject_VerificationFails()
        {
            string[] tampers = new string[]
            {
                "DELETE FROM stock_movements WHERE rowid = (SELECT MAX(rowid) FROM stock_movements);",
                "CREATE TABLE intruder (id INTEGER);",
                "UPDATE customers SET name = name || 'x' WHERE rowid = (SELECT MIN(rowid) FROM customers);"
            };
            for (int i = 0; i < tampers.Length; i++)
            {
                TearDownAndSetUpFresh();
                string sql = tampers[i];
                DatabaseEncryptionService.FaultInjector = delegate(string point)
                {
                    if (point != DatabaseEncryptionService.FaultAfterEncrypt) return;
                    using (SQLiteConnection conn = DatabaseFileAccess.Open(_dbPath + DatabaseEncryptionService.WorkSuffix, false, false))
                    {
                        DatabaseFileAccess.Execute(conn, sql);
                    }
                };
                EncryptionStartupResult result = Start();
                DatabaseEncryptionService.FaultInjector = null;
                Assert.AreEqual(EncryptionStartupOutcome.RunningPlain, result.Outcome, "tamper " + i + " must be caught");
                Assert.IsTrue(DatabaseKeyProvider.IsPlainSqliteFile(_dbPath));
            }
        }

        [Test]
        public void ACorruptPlainDatabase_IsNeverConverted()
        {
            SQLiteConnection.ClearAllPools();
            using (var fs = new FileStream(_dbPath, FileMode.Open, FileAccess.Write))
            {
                fs.Position = (fs.Length / 2 / 4096) * 4096;
                byte[] junk = new byte[4096];
                for (int i = 0; i < junk.Length; i++) junk[i] = 0x5A;
                fs.Write(junk, 0, junk.Length);
            }
            string hashBefore = EncryptionTestKit.Sha256Hex(_dbPath);

            EncryptionStartupResult result = Start();
            Assert.AreEqual(EncryptionStartupOutcome.RunningPlain, result.Outcome);
            Assert.AreEqual(1, result.Failures);
            Assert.AreEqual(hashBefore, EncryptionTestKit.Sha256Hex(_dbPath), "the damaged original is left exactly as it was for the corruption flow");
            Assert.IsFalse(File.Exists(DatabaseEncryptionService.PreEncryptionPath(_dbPath)));
        }

        [Test]
        public void Conversion_HandlesAWalModeStore_WithCommittedPagesStillInTheWal()
        {
            // The legacy shipped database ran in WAL mode: rows committed but not yet checkpointed must survive the conversion
            long salesBefore = EncryptionTestKit.Count(_dbPath, "sales");
            using (SQLiteConnection conn = DatabaseFileAccess.Open(_dbPath, false, true))
            {
                DatabaseFileAccess.Scalar(conn, "PRAGMA journal_mode=WAL;");
                DatabaseFileAccess.Execute(conn, "INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('wal_marker', '1', '2030-01-01T00:00:00Z');");
                // keep the connection open: the WAL cannot be checkpointed away by closing the last connection
                IDictionary<string, string> withWal = DatabaseFileAccess.ComputeFingerprint(conn);
                _expected = withWal;
                Assert.IsTrue(File.Exists(_dbPath + "-wal"), "the update lives in the WAL");

                // simulate the process dying with the WAL left behind: copy the files while the connection is open
                string snapshotFolder = Path.Combine(_base, "walcopy");
                Directory.CreateDirectory(snapshotFolder);
                string copy = Path.Combine(snapshotFolder, "rafiq_pos.db");
                File.Copy(_dbPath, copy);
                File.Copy(_dbPath + "-wal", copy + "-wal");
                if (File.Exists(_dbPath + "-shm")) File.Copy(_dbPath + "-shm", copy + "-shm");
                _dbPath = copy;
                _dataFolder = snapshotFolder;
            }
            SQLiteConnection.ClearAllPools();

            EncryptionStartupResult result = Start();
            Assert.AreEqual(EncryptionStartupOutcome.Converted, result.Outcome, result.Message);
            Assert.AreEqual(salesBefore, EncryptionTestKit.Count(_dbPath, "sales"));
            using (SQLiteConnection conn = DatabaseFileAccess.OpenExisting(_dbPath, true))
            {
                Assert.AreEqual(1L, Convert.ToInt64(DatabaseFileAccess.Scalar(conn, "SELECT COUNT(*) FROM app_settings WHERE key = 'wal_marker';")), "the WAL-only change was converted");
            }
        }

        private void TearDownAndSetUpFresh()
        {
            DatabaseEncryptionService.ResetTestSeams();
            EncryptionTestKit.UseStubBackup();
            DatabaseEncryptionService.RetryBaseDelayMilliseconds = 1;
            SQLiteConnection.ClearAllPools();
            EncryptionTestKit.DeleteFolder(_base);
            _base = EncryptionTestKit.NewFolder("rafiq_nunit_conv_");
            _dbPath = EncryptionTestKit.InstallLegacyStore(_base);
            _dataFolder = Path.GetDirectoryName(_dbPath);
        }
    }
}
