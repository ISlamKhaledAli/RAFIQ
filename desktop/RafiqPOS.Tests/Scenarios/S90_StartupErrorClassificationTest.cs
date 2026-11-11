using System;
using System.IO;
using NUnit.Framework;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    /// <summary>
    /// تصنيف أخطاء قاعدة البيانات: التلف الحقيقي فقط (SQLITE_CORRUPT=11 / SQLITE_NOTADB=26) يفتح مسار العزل والاسترجاع،
    /// أما امتلاء القرص والقراءة فقط وخطأ القرص وتعذر الفتح فلها رسائل عربية مستقلة ولا يُعرض معها استرجاع نسخة احتياطية.
    /// </summary>
    [TestFixture]
    public class S90_StartupErrorClassificationTest
    {
        [Test]
        public void OnlyCorruptAndNotADatabase_AreClassifiedAsCorruption()
        {
            Assert.AreEqual(DatabaseFailureKind.Corrupt, DatabaseFailureClassifier.ClassifyResultCode(11));
            Assert.AreEqual(DatabaseFailureKind.Corrupt, DatabaseFailureClassifier.ClassifyResultCode(26));
            // Extended result codes keep the primary code in the low byte (SQLITE_CORRUPT_VTAB = 11 | 1 << 8)
            Assert.AreEqual(DatabaseFailureKind.Corrupt, DatabaseFailureClassifier.ClassifyResultCode(11 | (1 << 8)));
        }

        [Test]
        public void DiskFullReadOnlyIoErrorAndCannotOpen_AreNeverCorruption()
        {
            Assert.AreEqual(DatabaseFailureKind.DiskFull, DatabaseFailureClassifier.ClassifyResultCode(13));
            Assert.AreEqual(DatabaseFailureKind.ReadOnly, DatabaseFailureClassifier.ClassifyResultCode(8));
            Assert.AreEqual(DatabaseFailureKind.IoError, DatabaseFailureClassifier.ClassifyResultCode(10));
            // SQLITE_IOERR_READ = 10 | 1 << 8 is still an I/O error, not damage to the file
            Assert.AreEqual(DatabaseFailureKind.IoError, DatabaseFailureClassifier.ClassifyResultCode(10 | (1 << 8)));
            Assert.AreEqual(DatabaseFailureKind.CannotOpen, DatabaseFailureClassifier.ClassifyResultCode(14));
        }

        [Test]
        public void BusyAndLockedAreTransient_AndUnknownCodesStayUnknown()
        {
            Assert.AreEqual(DatabaseFailureKind.Busy, DatabaseFailureClassifier.ClassifyResultCode(5));
            Assert.AreEqual(DatabaseFailureKind.Busy, DatabaseFailureClassifier.ClassifyResultCode(6));
            Assert.AreEqual(DatabaseFailureKind.Unknown, DatabaseFailureClassifier.ClassifyResultCode(1));
            Assert.AreEqual(DatabaseFailureKind.Unknown, DatabaseFailureClassifier.ClassifyResultCode(-1));
            Assert.AreEqual(DatabaseFailureKind.Unknown, DatabaseFailureClassifier.ClassifyResultCode(0));
        }

        [Test]
        public void DotNetExceptions_AreClassifiedWithoutBeingTreatedAsCorruption()
        {
            Assert.AreEqual(DatabaseFailureKind.Unknown, DatabaseFailureClassifier.Classify(null));
            Assert.AreEqual(DatabaseFailureKind.ReadOnly, DatabaseFailureClassifier.Classify(new UnauthorizedAccessException("denied")));
            // Only a real sharing/lock violation (Win32 32 / 33) is "busy"; any other I/O failure is a cannot-open problem
            Assert.AreEqual(DatabaseFailureKind.Busy,
                DatabaseFailureClassifier.Classify(new IOException("sharing violation", unchecked((int)0x80070020))));
            Assert.AreEqual(DatabaseFailureKind.Busy,
                DatabaseFailureClassifier.Classify(new IOException("lock violation", unchecked((int)0x80070021))));
            Assert.AreEqual(DatabaseFailureKind.CannotOpen, DatabaseFailureClassifier.Classify(new IOException("generic io")));
            // ERROR_DISK_FULL (112) as an HRESULT
            Assert.AreEqual(DatabaseFailureKind.DiskFull,
                DatabaseFailureClassifier.Classify(new IOException("disk full", unchecked((int)0x80070070))));
            Assert.AreEqual(DatabaseFailureKind.Unknown, DatabaseFailureClassifier.Classify(new InvalidOperationException("x")));
        }

        [Test]
        public void StorageFailureMessages_AreDistinctArabic_AndNeverOfferRestore()
        {
            DatabaseFailureKind[] storageKinds = new DatabaseFailureKind[]
            {
                DatabaseFailureKind.DiskFull,
                DatabaseFailureKind.ReadOnly,
                DatabaseFailureKind.IoError,
                DatabaseFailureKind.CannotOpen,
                DatabaseFailureKind.Busy
            };

            var seen = new System.Collections.Generic.HashSet<string>();
            for (int i = 0; i < storageKinds.Length; i++)
            {
                string message = DatabaseFailureClassifier.DescribeArabic(storageKinds[i]);
                Assert.IsFalse(string.IsNullOrWhiteSpace(message), storageKinds[i] + " له رسالة");
                Assert.IsTrue(seen.Add(message), storageKinds[i] + " رسالته مستقلة");
                StringAssert.DoesNotContain("استرجاع", message, storageKinds[i] + " لا يعرض استرجاع نسخة احتياطية");
                StringAssert.DoesNotContain("عزل", message);
                Assert.IsNotNull(DatabaseFailureClassifier.IpcCode(storageKinds[i]), storageKinds[i] + " له كود IPC");
            }

            Assert.IsNull(DatabaseFailureClassifier.IpcCode(DatabaseFailureKind.Corrupt), "التلف يبقى على المعالج العام");
            Assert.IsNull(DatabaseFailureClassifier.IpcCode(DatabaseFailureKind.Unknown));
        }

        [Test]
        public void BusyAndUnknownIntegrityFailures_AreStartupBlockers_NotCorruption()
        {
            var busy = new DatabaseIntegrityStatus { IsValid = true };
            DatabaseService.ApplyIntegrityFailure(busy, new IOException("sharing violation", unchecked((int)0x80070020)));
            Assert.IsFalse(busy.IsValid);
            Assert.IsFalse(busy.IsCorrupt);
            Assert.AreEqual(DatabaseFailureKind.Busy, busy.StorageFailure);
            var busyEx = Assert.Throws<DatabaseStorageException>(delegate { DatabaseService.ThrowIfStartupBlocked(busy); });
            Assert.AreEqual(DatabaseFailureKind.Busy, busyEx.Kind);

            var unknown = new DatabaseIntegrityStatus { IsValid = true };
            DatabaseService.ApplyIntegrityFailure(unknown, new InvalidOperationException("boom"));
            Assert.IsFalse(unknown.IsCorrupt);
            var unknownEx = Assert.Throws<DatabaseStorageException>(delegate { DatabaseService.ThrowIfStartupBlocked(unknown); });
            Assert.AreEqual(DatabaseFailureKind.Unknown, unknownEx.Kind);
            StringAssert.Contains("boom", unknownEx.Message);
        }

        [Test]
        public void HealthyAndCorruptIntegrityResults_DoNotThrowAsStorageFailures()
        {
            Assert.DoesNotThrow(delegate { DatabaseService.ThrowIfStartupBlocked(new DatabaseIntegrityStatus { IsValid = true }); });
            Assert.DoesNotThrow(delegate { DatabaseService.ThrowIfStartupBlocked(new DatabaseIntegrityStatus { IsValid = false, IsCorrupt = true }); });
            Assert.DoesNotThrow(delegate { DatabaseService.ThrowIfStartupBlocked(null); });
        }

        [Test]
        public void MigrationBackupWithoutRoom_IsADiskFullStartupFailure()
        {
            var ex = Assert.Throws<DatabaseStorageException>(delegate
            {
                RafiqPOS.Database.MigrationRunner.CheckBackupSpace(100L * 1024 * 1024, 150L * 1024 * 1024);
            });
            Assert.AreEqual(DatabaseFailureKind.DiskFull, ex.Kind);
            Assert.DoesNotThrow(delegate
            {
                RafiqPOS.Database.MigrationRunner.CheckBackupSpace(100L * 1024 * 1024, 200L * 1024 * 1024);
            });
        }

        [Test]
        public void StorageException_CarriesItsKind()
        {
            var ex = new DatabaseStorageException(DatabaseFailureKind.DiskFull, "msg");
            Assert.AreEqual(DatabaseFailureKind.DiskFull, ex.Kind);
            Assert.AreEqual("msg", ex.Message);
        }
    }
}
