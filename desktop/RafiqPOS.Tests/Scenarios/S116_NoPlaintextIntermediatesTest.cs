using System;
using System.Collections.Generic;
using System.IO;
using NUnit.Framework;
using RafiqPOS.Data;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    /// <summary>
    /// The encrypted candidate is written straight from the plain source (VACUUM INTO an encrypted file): at no point of the conversion,
    /// including after a crash at any step, does a readable copy of the store exist other than the original plain file itself.
    /// </summary>
    [TestFixture]
    [NonParallelizable]
    public class S116_NoPlaintextIntermediatesTest
    {
        private string _base;
        private string _data;
        private string _db;

        private static readonly string[] CrashPoints = new string[]
        {
            DatabaseEncryptionService.FaultAfterSnapshot,
            DatabaseEncryptionService.FaultAfterEncrypt,
            DatabaseEncryptionService.FaultAfterVerify,
            DatabaseEncryptionService.FaultAfterSeal,
            DatabaseEncryptionService.FaultBeforeSwap,
            DatabaseEncryptionService.FaultRenameLiveToOld,
            DatabaseEncryptionService.FaultAfterRenameLiveToOld,
            DatabaseEncryptionService.FaultRenameWorkToLive,
            DatabaseEncryptionService.FaultAfterRenameWorkToLive,
            DatabaseEncryptionService.FaultAfterPostSwapCheck,
            DatabaseEncryptionService.FaultDuringWipe
        };

        [SetUp]
        public void SetUp()
        {
            TestMode.RequireEncrypted();
            _base = EncryptionTestKit.NewFolder("rafiq_nunit_noplain_");
            _db = EncryptionTestKit.InstallLegacyStore(_base);
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

        private List<string> ReadableCopies(string root, bool liveIsPlain)
        {
            List<string> found = new List<string>();
            string live = Path.GetFullPath(_db);
            foreach (string file in EncryptionTestKit.FindFilesContaining(root, EncryptionTestKit.TemplateProductMarker))
            {
                string full = Path.GetFullPath(file);
                if (liveIsPlain && string.Equals(full, live, StringComparison.OrdinalIgnoreCase)) continue;
                if (full.EndsWith(DatabaseEncryptionService.OldPlainSuffix, StringComparison.OrdinalIgnoreCase)) continue;
                found.Add(file);
            }
            return found;
        }

        [Test]
        public void AfterACrashAtAnyStep_NoReadableCopyExistsBesideTheOriginal()
        {
            foreach (string point in CrashPoints)
            {
                string p = point;
                using (EncryptionTestKit.HermeticTemp temp = new EncryptionTestKit.HermeticTemp())
                {
                    DatabaseEncryptionService.ResetTestSeams();
                    EncryptionTestKit.UseStubBackup();
                    DatabaseEncryptionService.RetryBaseDelayMilliseconds = 1;
                    SQLiteConnection.ClearAllPools();
                    foreach (string f in Directory.GetFiles(_data)) File.Delete(f);
                    File.Copy(EncryptionTestKit.LegacyTemplate(), _db, true);

                    DatabaseEncryptionService.FaultInjector = delegate(string at) { if (at == p) throw new SimulatedCrashException(at); };
                    try
                    {
                        DatabaseEncryptionService.EnsureEncryptedAtStartup(_data, _db, null);
                        Assert.Fail("the crash point " + point + " was not reached");
                    }
                    catch (SimulatedCrashException) { }
                    SQLiteConnection.ClearAllPools();

                    bool liveIsPlain = DatabaseKeyProvider.IsPlainSqliteFile(_db);
                    List<string> leaks = ReadableCopies(_base, liveIsPlain);
                    Assert.AreEqual(0, leaks.Count, "readable copy after a crash at " + point + ": " + (leaks.Count > 0 ? Path.GetFileName(leaks[0]) : ""));
                    Assert.AreEqual(0, ReadableCopies(temp.Path, false).Count, "readable temp file after a crash at " + point);

                    string work = _db + DatabaseEncryptionService.WorkSuffix;
                    if (File.Exists(work))
                    {
                        Assert.AreEqual(DatabaseFileKind.NotPlain, DatabaseKeyProvider.DetectFileKind(work), ".converting is never plain (" + point + ")");
                        Assert.IsFalse(File.Exists(work + "-journal"), "no plaintext rollback journal (" + point + ")");
                    }

                    // the restart ends in a usable encrypted store with nothing readable left anywhere
                    DatabaseEncryptionService.FaultInjector = null;
                    EncryptionStartupResult restart = DatabaseEncryptionService.EnsureEncryptedAtStartup(_data, _db, null);
                    SQLiteConnection.ClearAllPools();
                    Assert.AreEqual(DatabaseFileKind.NotPlain, DatabaseKeyProvider.DetectFileKind(_db), "after restart (" + point + "): " + restart.Message);
                    Assert.AreEqual(0, ReadableCopies(_base, false).Count, "readable copy after the restart (" + point + ")");
                    Assert.AreEqual(EncryptionTestKit.Count(EncryptionTestKit.LegacyTemplate(), "sales"), EncryptionTestKit.Count(_db, "sales"), point);
                }
            }
        }

        [Test]
        public void AConversionThatFailsVerification_WipesItsCandidate_AndLeavesTheOriginalUntouched()
        {
            string hash = EncryptionTestKit.Sha256Hex(_db);
            DatabaseEncryptionService.FaultInjector = delegate(string at)
            {
                if (at == DatabaseEncryptionService.FaultAfterEncrypt) throw new IOException("simulated failure after the candidate was written");
            };
            EncryptionStartupResult r = DatabaseEncryptionService.EnsureEncryptedAtStartup(_data, _db, null);
            Assert.AreEqual(EncryptionStartupOutcome.RunningPlain, r.Outcome);
            Assert.AreEqual(hash, EncryptionTestKit.Sha256Hex(_db));
            Assert.IsFalse(File.Exists(_db + DatabaseEncryptionService.WorkSuffix), "no candidate left");
            Assert.AreEqual(0, ReadableCopies(_base, true).Count);
            string[] stray = Directory.GetFiles(_data, "*-journal");
            Assert.AreEqual(0, stray.Length);
        }
    }
}
