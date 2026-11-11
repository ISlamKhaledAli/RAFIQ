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
    /// H1: nothing public in the host assembly hands out the database key. F6: a missing / blocked / wrong-architecture native engine
    /// fails closed with a dedicated, non-destructive exception (never a generic database error, never counted as a conversion failure).
    /// </summary>
    [TestFixture]
    [NonParallelizable]
    public class S111_KeyHygieneAndEngineLoadTest
    {
        [TearDown]
        public void RestoreEngine()
        {
            SQLiteNative.RestoreDefaultsForTests();
            DatabaseEncryptionService.ResetTestSeams();
        }

        private static bool IsHostType(Type t)
        {
            string ns = t.Namespace ?? string.Empty;
            return !ns.StartsWith("RafiqPOS.Tests", StringComparison.Ordinal) && ns.StartsWith("RafiqPOS", StringComparison.Ordinal);
        }

        private static bool ExposesKeyBytes(Type type)
        {
            if (type == typeof(byte[])) return true;
            if (type.IsGenericType && type.GetGenericTypeDefinition() == typeof(Func<,>))
            {
                Type[] args = type.GetGenericArguments();
                return args[args.Length - 1] == typeof(byte[]);
            }
            return false;
        }

        [Test]
        public void NoPublicMember_OfTheHostAssembly_ReturnsOrExposesByteArrays_OrTheKeyProvider()
        {
            Assembly host = typeof(DatabaseService).Assembly;
            Assert.IsFalse(typeof(DatabaseKeyProvider).IsPublic, "DatabaseKeyProvider must be internal");
            Assert.IsFalse(typeof(DatabaseFileAccess).IsPublic, "DatabaseFileAccess must be internal");

            List<string> violations = new List<string>();
            const BindingFlags flags = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly;
            foreach (Type t in host.GetTypes())
            {
                if (!(t.IsPublic || t.IsNestedPublic) || !IsHostType(t)) continue;
                foreach (MethodInfo m in t.GetMethods(flags))
                {
                    if (!(m.IsPublic || m.IsFamily || m.IsFamilyOrAssembly) || m.IsSpecialName && !m.Name.StartsWith("get_", StringComparison.Ordinal)) continue;
                    if (ExposesKeyBytes(m.ReturnType)) violations.Add(t.FullName + "." + m.Name + " returns " + m.ReturnType.Name);
                }
                foreach (FieldInfo f in t.GetFields(flags))
                {
                    if (!(f.IsPublic || f.IsFamily || f.IsFamilyOrAssembly)) continue;
                    if (ExposesKeyBytes(f.FieldType)) violations.Add(t.FullName + "." + f.Name + " field " + f.FieldType.Name);
                }
            }
            // Public members that return byte[] for other reasons are listed here explicitly (each reviewed to not be the database key)
            string[] reviewedNotTheKey = new string[]
            {
                "RafiqPOS.MainForm.RenderPagePdf",
                "RafiqPOS.Services.PrescriptionService.GetImageBytes",
                "RafiqPOS.Services.InsuranceService.ExportBatchToExcelBytes",
                "RafiqPOS.Common.RawPrinterHelper."
            };
            violations.RemoveAll(delegate(string v)
            {
                for (int i = 0; i < reviewedNotTheKey.Length; i++) if (v.StartsWith(reviewedNotTheKey[i], StringComparison.Ordinal)) return true;
                return false;
            });
            Assert.AreEqual(0, violations.Count, "public members exposing byte[]: " + string.Join("; ", violations.ToArray()));

            FieldInfo hook = typeof(SQLiteConnection).GetField("ConnectionKeyHook", BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static);
            Assert.IsNotNull(hook);
            Assert.IsFalse(hook.IsPublic, "the key hook is internal");
        }

        [Test]
        public void SetEncryptionKey_ClonesAndWipes_TheCallersAndTheStoredCopy()
        {
            byte[] mine = EncryptionTestKit.OtherKey();
            byte[] original = (byte[])mine.Clone();
            SQLiteConnection conn = new SQLiteConnection("Data Source=" + Path.Combine(Path.GetTempPath(), "never_opened_" + Guid.NewGuid().ToString("N") + ".db") + ";Version=3;");
            conn.SetEncryptionKey(mine);
            Array.Clear(mine, 0, mine.Length);
            FieldInfo stored = typeof(SQLiteConnection).GetField("_explicitKey", BindingFlags.NonPublic | BindingFlags.Instance);
            byte[] copy = (byte[])stored.GetValue(conn);
            CollectionAssert.AreEqual(original, copy, "the connection keeps its own clone");
            conn.Dispose();
            Assert.IsNull(stored.GetValue(conn), "the stored key is released on dispose");
            CollectionAssert.AreEqual(new byte[32], copy, "and its bytes were zeroed");
        }

        [Test]
        public void MissingNativeLibrary_FailsClosed_WithTheDedicatedException()
        {
            string empty = EncryptionTestKit.NewFolder("rafiq_nunit_nodll_");
            try
            {
                SQLiteNative.EnforceNativeLoad = true;
                SQLiteNative.NativeDirectoryOverride = empty;
                SQLiteNative.ResetForTests();
                DatabaseEngineMissingException ex = Assert.Throws<DatabaseEngineMissingException>(delegate { SQLiteConnection.EnsureEngineLoaded(); });
                StringAssert.Contains("sqlite3mc.dll", ex.Message);
                StringAssert.Contains("بياناتك سليمة", ex.Message);
                // and it is thrown again (not cached as success)
                Assert.Throws<DatabaseEngineMissingException>(delegate { new SQLiteConnection("Data Source=x.db;Version=3;"); });
            }
            finally
            {
                SQLiteNative.RestoreDefaultsForTests();
                EncryptionTestKit.DeleteFolder(empty);
            }
        }

        [Test]
        public void LoadLibraryFailure_IsReportedWithTheWin32Error()
        {
            string folder = EncryptionTestKit.NewFolder("rafiq_nunit_badimage_");
            try
            {
                File.WriteAllText(Path.Combine(folder, "sqlite3mc.dll"), "not a dll");
                SQLiteNative.EnforceNativeLoad = true;
                SQLiteNative.NativeDirectoryOverride = folder;
                SQLiteNative.LoadLibraryHook = delegate(string path) { Assert.AreEqual(Path.Combine(folder, "sqlite3mc.dll"), path, "loaded by full path from the application folder"); return IntPtr.Zero; };
                SQLiteNative.ResetForTests();
                DatabaseEngineMissingException ex = Assert.Throws<DatabaseEngineMissingException>(delegate { SQLiteConnection.EnsureEngineLoaded(); });
                StringAssert.Contains("LoadLibraryW", ex.Message);
            }
            finally
            {
                SQLiteNative.RestoreDefaultsForTests();
                EncryptionTestKit.DeleteFolder(folder);
            }
        }

        [Test]
        public void NativeLoadErrors_OfTheFirstCall_AllBecomeTheDedicatedException()
        {
            Action[] failures = new Action[]
            {
                delegate { throw new DllNotFoundException("sqlite3mc"); },
                delegate { throw new BadImageFormatException("wrong architecture"); },
                delegate { throw new EntryPointNotFoundException("sqlite3_libversion"); }
            };
            for (int i = 0; i < failures.Length; i++)
            {
                SQLiteNative.ProbeHook = failures[i];
                SQLiteNative.ResetForTests();
                DatabaseEngineMissingException ex = Assert.Throws<DatabaseEngineMissingException>(delegate { SQLiteConnection.EnsureEngineLoaded(); });
                Assert.IsNotNull(ex.InnerException, "the original loader error is kept");
            }
        }

        [Test]
        public void DatabaseServiceInitialize_SurfacesTheEngineException_AndCreatesNothing()
        {
            string baseFolder = EncryptionTestKit.NewFolder("rafiq_nunit_engine_");
            try
            {
                SQLiteNative.ProbeHook = delegate { throw new DllNotFoundException("sqlite3mc"); };
                SQLiteNative.ResetForTests();
                Assert.Throws<DatabaseEngineMissingException>(delegate { DatabaseService.Initialize(baseFolder); });
                Assert.IsFalse(File.Exists(Path.Combine(Path.Combine(baseFolder, "data"), "rafiq_pos.db")), "no database was created");
            }
            finally
            {
                SQLiteNative.RestoreDefaultsForTests();
                EncryptionTestKit.ResetDatabaseServiceStatics();
                EncryptionTestKit.DeleteFolder(baseFolder);
            }
        }

        [Test]
        public void EngineMissing_IsNotCountedAsAConversionFailure()
        {
            TestMode.RequireEncrypted();
            string baseFolder = EncryptionTestKit.NewFolder("rafiq_nunit_engine2_");
            try
            {
                string dbPath = EncryptionTestKit.InstallLegacyStore(baseFolder);
                string folder = Path.GetDirectoryName(dbPath);
                DatabaseEncryptionService.PreConversionBackupProvider = delegate(string db, string backups) { throw new DatabaseEngineMissingException("simulated", 0, null); };
                Assert.Throws<DatabaseEngineMissingException>(delegate { DatabaseEncryptionService.EnsureEncryptedAtStartup(folder, dbPath, null); });
                Assert.AreEqual(0, DatabaseEncryptionService.GetStatus(dbPath).ConversionFailures, "no failure was recorded");
                Assert.IsTrue(DatabaseKeyProvider.IsPlainSqliteFile(dbPath));
            }
            finally
            {
                EncryptionTestKit.DeleteFolder(baseFolder);
            }
        }
    }
}
