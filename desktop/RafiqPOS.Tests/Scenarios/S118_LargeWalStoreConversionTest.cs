using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Threading;
using NUnit.Framework;
using RafiqPOS.Data;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    /// <summary>
    /// A big WAL-mode legacy store (size from env RAFIQ_TEST_LARGE_MB, default 40) converts correctly, reports progress while it runs,
    /// the conversion flag is raised for the whole time (the host ignores window-close requests meanwhile), and a power cut in the
    /// middle of the swap still recovers. Time and peak memory are written as PERF lines. Windows timing is NOT measured here.
    /// </summary>
    [TestFixture]
    [NonParallelizable]
    public class S118_LargeWalStoreConversionTest
    {
        private string _base;
        private string _db;
        private string _data;

        private static long TargetBytes()
        {
            long mb = 40;
            string env = Environment.GetEnvironmentVariable("RAFIQ_TEST_LARGE_MB");
            long parsed;
            if (!string.IsNullOrEmpty(env) && long.TryParse(env, out parsed) && parsed > 0) mb = parsed;
            return mb * 1024L * 1024L;
        }

        // Resident set of this process: PeakWorkingSet64 is not filled in on macOS, so it is also sampled through ps (Unix only)
        private static long CurrentResidentBytes()
        {
            try
            {
                Process self = Process.GetCurrentProcess();
                if (Path.DirectorySeparatorChar == '\\') return self.WorkingSet64;
                ProcessStartInfo psi = new ProcessStartInfo("ps", "-o rss= -p " + self.Id);
                psi.RedirectStandardOutput = true;
                psi.UseShellExecute = false;
                using (Process ps = Process.Start(psi))
                {
                    string text = ps.StandardOutput.ReadToEnd().Trim();
                    ps.WaitForExit();
                    long kb;
                    return long.TryParse(text, out kb) ? kb * 1024L : 0L;
                }
            }
            catch (Exception) { return 0L; }
        }

        [SetUp]
        public void SetUp()
        {
            TestMode.RequireEncrypted();
            _base = EncryptionTestKit.NewFolder("rafiq_nunit_large_");
            _db = EncryptionTestKit.BuildLargeWalStore(_base, TargetBytes());
            _data = Path.GetDirectoryName(_db);
            EncryptionTestKit.UseStubBackup();
            DatabaseEncryptionService.RetryBaseDelayMilliseconds = 1;
        }

        [TearDown]
        public void TearDown()
        {
            DatabaseEncryptionService.ResetTestSeams();
            if (!TestMode.Plain) DatabaseKeyProvider.EnableDefaultEncryption();
            SQLiteConnection.ClearAllPools();
            if (_base != null) EncryptionTestKit.DeleteFolder(_base);
        }

        private IDictionary<string, string> FingerprintOfACopy()
        {
            string copyFolder = Path.Combine(_base, "reference");
            Directory.CreateDirectory(copyFolder);
            string copy = Path.Combine(copyFolder, "rafiq_pos.db");
            File.Copy(_db, copy, true);
            if (File.Exists(_db + "-wal")) File.Copy(_db + "-wal", copy + "-wal", true);
            IDictionary<string, string> fingerprint = EncryptionTestKit.Fingerprint(copy);
            SQLiteConnection.ClearAllPools();
            EncryptionTestKit.DeleteFolder(copyFolder);
            return fingerprint;
        }

        [Test]
        public void ALargeWalStore_ConvertsExactly_WithProgress_AndTheFlagRaisedMeanwhile()
        {
            Assert.IsTrue(File.Exists(_db + "-wal") && new FileInfo(_db + "-wal").Length > 0, "the fixture really leaves a non-empty WAL");
            long totalBytes = new FileInfo(_db).Length + new FileInfo(_db + "-wal").Length;
            IDictionary<string, string> expected = FingerprintOfACopy();

            List<string> progress = new List<string>();
            bool sawFlag = false;
            EncryptionStartupResult result = null;
            Exception failure = null;
            Stopwatch sw = Stopwatch.StartNew();
            Thread worker = new Thread(delegate()
            {
                try { result = DatabaseEncryptionService.EnsureEncryptedAtStartup(_data, _db, delegate(string line) { lock (progress) progress.Add(line); }); }
                catch (Exception ex) { failure = ex; }
            });
            worker.Start();
            long sampledPeak = 0;
            int ticks = 0;
            while (worker.IsAlive)
            {
                if (DatabaseEncryptionService.IsConversionRunning) sawFlag = true;
                if (++ticks % 40 == 0) sampledPeak = Math.Max(sampledPeak, CurrentResidentBytes());
                Thread.Sleep(5);
            }
            worker.Join();
            sw.Stop();
            long peak = Math.Max(Math.Max(sampledPeak, CurrentResidentBytes()), Process.GetCurrentProcess().PeakWorkingSet64);

            Assert.IsNull(failure, failure == null ? null : failure.ToString());
            Assert.AreEqual(EncryptionStartupOutcome.Converted, result.Outcome, result.Message + " " + result.LastError);
            Assert.IsTrue(sawFlag, "IsConversionRunning is true while the conversion runs");
            Assert.IsFalse(DatabaseEncryptionService.IsConversionRunning, "and false afterwards");
            lock (progress)
            {
                Assert.Greater(progress.Count, 3, "the splash gets step names");
                bool percent = false;
                for (int i = 0; i < progress.Count; i++) if (progress[i].IndexOf('%') >= 0) percent = true;
                Assert.IsTrue(percent, "and a percentage during verification");
            }

            SQLiteConnection.ClearAllPools();
            Assert.AreEqual(DatabaseFileKind.NotPlain, DatabaseKeyProvider.DetectFileKind(_db));
            Assert.IsNull(DatabaseFileAccess.CompareFingerprints(expected, EncryptionTestKit.Fingerprint(_db)), "row-for-row equal to the original");
            Assert.AreEqual(0, EncryptionTestKit.FindPlainSqliteFiles(_base).Count, "no readable SQLite file remains");
            Assert.AreEqual(0, EncryptionTestKit.FindFilesContaining(_base, "ملاحظة اختبار حجم كبير").Count, "and no readable row text");

            TestContext.Progress.WriteLine(string.Format("PERF large-conversion: store={0:F0} MB (db+wal) time={1:F1}s peak-working-set={2:F0} MB (macOS, Windows unverified)",
                totalBytes / 1048576.0, sw.Elapsed.TotalSeconds, peak / 1048576.0));
        }

        [Test]
        public void ALargeStore_ThatLosesPowerBetweenTheRenames_RecoversOnTheNextStart()
        {
            IDictionary<string, string> expected = FingerprintOfACopy();
            DatabaseEncryptionService.FaultInjector = delegate(string at)
            {
                if (at == DatabaseEncryptionService.FaultAfterRenameLiveToOld) throw new SimulatedCrashException(at);
            };
            try
            {
                DatabaseEncryptionService.EnsureEncryptedAtStartup(_data, _db, null);
                Assert.Fail("the crash point was not reached");
            }
            catch (SimulatedCrashException) { }
            DatabaseEncryptionService.FaultInjector = null;
            SQLiteConnection.ClearAllPools();
            Assert.IsFalse(File.Exists(_db), "between the renames the live name is empty: exactly the state the guard must handle");

            EncryptionStartupResult restart = DatabaseEncryptionService.EnsureEncryptedAtStartup(_data, _db, null);
            SQLiteConnection.ClearAllPools();
            Assert.IsTrue(File.Exists(_db), restart.Message);
            Assert.AreEqual(DatabaseFileKind.NotPlain, DatabaseKeyProvider.DetectFileKind(_db));
            Assert.IsNull(DatabaseFileAccess.CompareFingerprints(expected, EncryptionTestKit.Fingerprint(_db)));
            Assert.IsFalse(File.Exists(_db + DatabaseEncryptionService.OldPlainSuffix), "the plain original is gone after the recovery");
        }

        [Test]
        public void ALargeStore_CrashedBeforeTheSwap_StaysPlainAndConvertsOnRestart()
        {
            string hash = EncryptionTestKit.Sha256Hex(_db);
            string walHash = EncryptionTestKit.Sha256Hex(_db + "-wal");
            DatabaseEncryptionService.FaultInjector = delegate(string at)
            {
                if (at == DatabaseEncryptionService.FaultAfterSeal) throw new SimulatedCrashException(at);
            };
            try { DatabaseEncryptionService.EnsureEncryptedAtStartup(_data, _db, null); }
            catch (SimulatedCrashException) { }
            DatabaseEncryptionService.FaultInjector = null;
            SQLiteConnection.ClearAllPools();
            Assert.IsTrue(DatabaseKeyProvider.IsPlainSqliteFile(_db), "still the original");
            DatabaseEncryptionService.EnsureEncryptedAtStartup(_data, _db, null);
            SQLiteConnection.ClearAllPools();
            Assert.AreEqual(DatabaseFileKind.NotPlain, DatabaseKeyProvider.DetectFileKind(_db));
            Assert.IsNotNull(hash);
            Assert.IsNotNull(walHash);
        }
    }
}
