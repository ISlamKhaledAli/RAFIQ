using System;
using System.IO;
using NUnit.Framework;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    [TestFixture]
    public class S7_BackupCrossDeviceTest : TestBase
    {
        [Test]
        public void Scenario_S7_Cross_Device_Backup_Recovery_Using_Owner_Recovery_Code()
        {
            // 1. Arrange: جهاز A يقوم بإنشاء نسخة احتياطية مشفرة بتشفير المغلف المزدوج (Dual-Wrap RFBK v2)
            string plainDbFile = Path.Combine(Path.GetTempPath(), "rafiq_src_db_" + Guid.NewGuid().ToString("N") + ".db");
            string encBackupFile = Path.Combine(Path.GetTempPath(), "rafiq_backup_pkg_" + Guid.NewGuid().ToString("N") + ".bak");
            string restoredDbFile = Path.Combine(Path.GetTempPath(), "rafiq_restored_db_" + Guid.NewGuid().ToString("N") + ".db");

            try
            {
                // كتابة ملف محاكاة لقاعدة بيانات
                string originalContent = "SQLite format 3\0 - RAFIQ POS REAL PRODUCTION BACKUP TEST DATA - STABLE RECOVERY";
                File.WriteAllText(plainDbFile, originalContent);

                // جهاز A لديه بصمة جهاز ومفتاح تشفير A
                var machineAEncryption = new EncryptionService("DEVICE_MACHINE_A_FINGERPRINT_1111");
                string ownerRecoveryCode = EncryptionService.GenerateRecoveryCode();

                // التشفير المزدوج
                machineAEncryption.EncryptFileDualWrap(plainDbFile, encBackupFile, ownerRecoveryCode);

                Assert.IsTrue(File.Exists(encBackupFile), "تم إنشاء ملف النسخة الاحتياطية المشفرة");
                Assert.IsTrue(EncryptionService.IsFileEncrypted(encBackupFile), "الملف يحمل ترويسة التشفير الرسمية");

                // 2. محاكاة جهاز B جديد تماماً (مفتاح مختلف كلياً وبصمة مختلفة)
                var machineBEncryption = new EncryptionService("DEVICE_MACHINE_B_FOREIGN_DIFFERENT_9999");

                // جهاز B يحاول فك التشفير بدون كود الاسترجاع -> يجب أن يفشل حتماً لحماية البيانات من السرقة
                bool failedWithoutCode = false;
                try
                {
                    machineBEncryption.DecryptFile(encBackupFile, restoredDbFile, null);
                }
                catch
                {
                    failedWithoutCode = true;
                }
                Assert.IsTrue(failedWithoutCode, "جهاز أجنبي بدون كود الاسترجاع يجب أن يُمنع تماماً من فك تشفير النسخة");

                // 3. جهاز B يستخدم كود الاسترجاع الرسمي (Owner Recovery Code) -> ينجح 100%
                machineBEncryption.DecryptFile(encBackupFile, restoredDbFile, ownerRecoveryCode);

                Assert.IsTrue(File.Exists(restoredDbFile), "تم فك تشفير النسخة على الجهاز الجديد بنجاح");
                string restoredContent = File.ReadAllText(restoredDbFile);
                Assert.AreEqual(originalContent, restoredContent, "محتوى قاعدة البيانات المسترجعة مطابق تماماً للأصل");
            }
            finally
            {
                try { if (File.Exists(plainDbFile)) File.Delete(plainDbFile); } catch { }
                try { if (File.Exists(encBackupFile)) File.Delete(encBackupFile); } catch { }
                try { if (File.Exists(restoredDbFile)) File.Delete(restoredDbFile); } catch { }
            }
        }
    }
}
