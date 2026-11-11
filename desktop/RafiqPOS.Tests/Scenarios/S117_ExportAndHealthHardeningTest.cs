using System;
using System.Diagnostics;
using System.IO;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using RafiqPOS.Data;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    /// <summary>
    /// database:exportDecrypted accepts only a fully-qualified, new, local .db path outside the data folder and is audited BEFORE any
    /// plain byte is written; the public health:getStatus action tells an unauthenticated caller nothing about encryption.
    /// </summary>
    [TestFixture]
    [NonParallelizable]
    public class S117_ExportAndHealthHardeningTest : S30_Step3BFixtureBase
    {
        private string _scratch;

        [OneTimeSetUp]
        public void BuildLegacyTemplateOnce()
        {
            if (!TestMode.Plain) EncryptionTestKit.LegacyTemplate();
        }

        [SetUp]
        public void HardeningSetUp()
        {
            TestMode.RequireEncrypted();
            _scratch = EncryptionTestKit.NewFolder("rafiq_nunit_export_");
        }

        [TearDown]
        public void HardeningTearDown()
        {
            SecurityService.SetCurrentUserForTesting(null);
            DatabaseEncryptionService.ResetTestSeams();
            if (!TestMode.Plain) DatabaseKeyProvider.EnableDefaultEncryption();
            if (_scratch != null) EncryptionTestKit.DeleteFolder(_scratch);
        }

        private string DataFolder
        {
            get { return Path.GetDirectoryName(DatabaseService.DbPath); }
        }

        private static bool IsWindows
        {
            get { return Path.DirectorySeparatorChar == '\\'; }
        }

        private string Check(string path)
        {
            string full;
            return DatabaseService.ValidateExportPath(path, DataFolder, out full);
        }

        [Test]
        public void ValidateExportPath_RejectsEveryUnsafeShape()
        {
            string existing = Path.Combine(_scratch, "exists.db");
            File.WriteAllText(existing, "x");
            string[] bad = new string[]
            {
                null,
                "   ",
                "relative.db",
                "sub/relative.db",
                "C:x.db",
                "C:relative\\x.db",
                "\\\\server\\share\\x.db",
                "//server/share/x.db",
                "\\\\?\\C:\\x.db",
                Path.Combine(_scratch, "..", "escape.db"),
                Path.Combine(_scratch, "a:stream.db"),
                Path.Combine(_scratch, "x.db:hidden"),
                Path.Combine(_scratch, "notdb.txt"),
                Path.Combine(_scratch, "missing_folder", "x.db"),
                existing,
                Path.Combine(DataFolder, "inside.db"),
                Path.Combine(_scratch, "nul\0.db")
            };
            for (int i = 0; i < bad.Length; i++)
            {
                Assert.IsNotNull(Check(bad[i]), "must be rejected: " + (bad[i] == null ? "<null>" : bad[i].Replace("\0", "\\0")));
            }
            Assert.IsNull(Check(Path.Combine(_scratch, "fine.db")), "a plain new .db file in another folder is accepted");
        }

        [Test]
        public void ValidateExportPath_RejectsTheWholeRafiqBaseFolder_NotOnlyTheDataFolder()
        {
            string baseFolder = Path.GetDirectoryName(DataFolder);
            string backups = Path.Combine(baseFolder, "backups");
            string logs = Path.Combine(baseFolder, "logs");
            Directory.CreateDirectory(backups);
            Directory.CreateDirectory(logs);
            string[] bad = new string[]
            {
                Path.Combine(baseFolder, "x.db"),
                Path.Combine(backups, "x.db"),
                Path.Combine(logs, "x.db"),
                Path.Combine(DataFolder, "x.db")
            };
            for (int i = 0; i < bad.Length; i++) Assert.IsNotNull(Check(bad[i]), "must be rejected: " + bad[i]);
            Assert.IsNull(Check(Path.Combine(_scratch, "elsewhere.db")));
        }

        [Test]
        public void ValidateExportPath_RejectsAFolderThatLeadsIntoTheDataFolderThroughALink()
        {
            if (IsWindows) Assert.Ignore("Junction creation needs mklink; covered by the real-path comparison on Windows (unverified here).");
            string link = Path.Combine(_scratch, "link_to_data");
            ProcessStartInfo psi = new ProcessStartInfo("ln", "-s \"" + DataFolder + "\" \"" + link + "\"");
            psi.UseShellExecute = false;
            using (Process p = Process.Start(psi))
            {
                p.WaitForExit();
                if (p.ExitCode != 0) Assert.Ignore("ln -s is not available");
            }
            Assert.IsNotNull(Check(Path.Combine(link, "via_link.db")), "a symlinked folder into the data folder must be refused");
            Assert.IsFalse(File.Exists(Path.Combine(DataFolder, "via_link.db")));
        }

        [Test]
        public void ExportIsRefused_WhenTheAuditEntryCannotBeWritten_AndNoPlainBytesAppear()
        {
            LoginAs("usr_root_developer");
            string target = Path.Combine(_scratch, "blocked_export.db");
            Execute("CREATE TRIGGER tr_block_audit BEFORE INSERT ON audit_logs BEGIN SELECT RAISE(ABORT, 'blocked'); END;");

            TransactionResult refused = DatabaseService.ExportDecryptedCopy(target);

            Assert.IsFalse(refused.Success);
            Assert.IsFalse(File.Exists(target), "no plain copy without an audit record");
            Assert.AreEqual(0, Directory.GetFiles(_scratch).Length, "no work file left either");

            Execute("DROP TRIGGER tr_block_audit;");
            long before = Scalar("SELECT COUNT(*) FROM audit_logs WHERE action = 'تصدير_قاعدة_بيانات_غير_مشفرة';");
            TransactionResult ok = DatabaseService.ExportDecryptedCopy(target);
            Assert.IsTrue(ok.Success, ok.Message);
            Assert.AreEqual(before + 1, Scalar("SELECT COUNT(*) FROM audit_logs WHERE action = 'تصدير_قاعدة_بيانات_غير_مشفرة';"));
            Assert.AreEqual(0, Directory.GetFiles(_scratch, "*.converting").Length);
            Assert.AreEqual(1, Directory.GetFiles(_scratch).Length, "only the requested export exists");
        }

        [Test]
        public void AFailedExport_LeavesNoWorkFileBehind()
        {
            LoginAs("usr_root_developer");
            string target = Path.Combine(_scratch, "failing_export.db");
            DatabaseEncryptionService.FaultInjector = delegate(string at) { if (at == DatabaseEncryptionService.FaultExportBeforeMove) throw new IOException("simulated export failure"); };
            TransactionResult result = DatabaseService.ExportDecryptedCopy(target);
            DatabaseEncryptionService.FaultInjector = null;
            Assert.IsFalse(result.Success);
            Assert.IsFalse(File.Exists(target));
            Assert.AreEqual(0, Directory.GetFiles(_scratch, "*.converting*").Length, "work files are wiped on failure");
            Assert.AreEqual(0, EncryptionTestKit.FindFilesContaining(_scratch, "SQLite format 3").Count);
            Assert.IsNotNull(result);
        }

        [Test]
        public void TheUnauthenticatedHealthAction_ReturnsOnlyTheLevel_AndAnAdminGetsTheDetail()
        {
            // make an encryption-related alert exist: a readable copy that cannot be protected
            string quarantine = Path.Combine(DataFolder, "quarantine");
            Directory.CreateDirectory(quarantine);
            byte[] bytes = new byte[8192];
            byte[] magic = System.Text.Encoding.ASCII.GetBytes("SQLite format 3\0");
            Array.Copy(magic, bytes, magic.Length);
            for (int i = magic.Length; i < bytes.Length; i++) bytes[i] = (byte)(i * 17);
            File.WriteAllBytes(Path.Combine(quarantine, "unprotectable.db"), bytes);
            DatabaseEncryptionService.SweepPlainFiles(Path.GetDirectoryName(DataFolder), DataFolder, DatabaseService.DbPath);

            SecurityService.SetCurrentUserForTesting(null);
            string anonymous = JObject.FromObject(DispatchOk("health:getStatus", null).Data).ToString();
            JObject anonymousObject = JObject.Parse(anonymous);
            Assert.IsNotNull(anonymousObject["overallStatus"]);
            Assert.AreEqual(1, anonymousObject.Properties().Count(), "only the level is public");
            StringAssert.DoesNotContain("database_unprotected_copies", anonymous);
            StringAssert.DoesNotContain("quarantine", anonymous);
            StringAssert.DoesNotContain(DataFolder, anonymous);
            StringAssert.DoesNotContain("مشفر", anonymous);

            LoginAs(AdminId);
            string detailed = JObject.FromObject(DispatchOk("health:getStatus", null).Data).ToString();
            StringAssert.Contains("database_unprotected_copies", detailed, "the authenticated path keeps the full detail");
        }
    }

    internal static class PropertyCountExtensions
    {
        public static int Count(this System.Collections.Generic.IEnumerable<Newtonsoft.Json.Linq.JProperty> properties)
        {
            int n = 0;
            foreach (Newtonsoft.Json.Linq.JProperty p in properties) n++;
            return n;
        }
    }
}
