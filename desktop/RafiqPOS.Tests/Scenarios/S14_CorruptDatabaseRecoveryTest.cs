using System;
using System.Collections.Generic;
using System.Data.SQLite;
using System.IO;
using System.Reflection;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using RafiqPOS.Bridge;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    [TestFixture]
    [NonParallelizable]
    public class S14_CorruptDatabaseRecoveryTest
    {
        private string _baseFolder;

        [SetUp]
        public void SetUp()
        {
            _baseFolder = Path.Combine(Path.GetTempPath(), "rafiq_nunit_recovery_" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(_baseFolder);
            SecurityService.SetCurrentUserForTesting(null);
        }

        [TearDown]
        public void TearDown()
        {
            SecurityService.SetCurrentUserForTesting(null);
            ResetDatabaseServiceStatics();
            SQLiteConnection.ClearAllPools();
            GC.Collect();
            GC.WaitForPendingFinalizers();
            try { Directory.Delete(_baseFolder, true); } catch (IOException) { } catch (UnauthorizedAccessException) { }
        }

        [Test]
        public void Corrupt_Database_Is_Recovered_In_App_With_Owner_Recovery_Code_Only()
        {
            // 1. متجر سليم فيه مبيعات + نسخة احتياطية مشفرة
            DatabaseService.Initialize(_baseFolder);
            Assert.IsFalse(DatabaseService.IsCorrupted);
            Product product;
            using (ProductWritePolicy.EnterTrustedFixtureOperation())
            product = DatabaseService.Products.SaveProduct(new Product
            {
                Name = "صنف قبل التلف",
                Barcode = "BAR_RECOVERY_1",
                PricePiasters = 1500,
                CostPiasters = 1000,
                StockQuantityMilli = 100000,
                Unit = "piece",
                IsActive = true
            }, true, true);
            for (int i = 0; i < 3; i++)
            {
                DatabaseService.SaleRepo.CreateSaleAtomic(new Sale
                {
                    SubtotalPiasters = 1500,
                    TotalPiasters = 1500,
                    PaidPiasters = 1500,
                    PaymentMethod = "cash",
                    Status = "completed",
                    Items = new List<SaleItem>
                    {
                        new SaleItem { ProductId = product.Id, ProductName = product.Name, QuantityMilli = 1000, UnitPricePiasters = 1500, TotalPiasters = 1500, UnitCostPiasters = 1000 }
                    }
                });
            }
            long salesBefore = CountSales();
            Assert.AreEqual(3, salesBefore);

            string recoveryCode = DatabaseService.Backup.GetOrCreateRecoveryCode();
            var backup = DatabaseService.Backup.CreateBackup(Path.Combine(_baseFolder, "backups"));
            Assert.IsTrue(backup.Success, backup.Message);
            Assert.IsTrue(EncryptionService.IsFileEncrypted(backup.BackupFilePath), "النسخة الاحتياطية مشفرة");

            // 2. تلف أول 4KB من ملف قاعدة البيانات مع وجود ملف WAL
            string dbPath = DatabaseService.DbPath;
            SQLiteConnection.ClearAllPools();
            GC.Collect();
            GC.WaitForPendingFinalizers();
            using (var fs = new FileStream(dbPath, FileMode.Open, FileAccess.Write))
            {
                byte[] junk = new byte[4096];
                for (int i = 0; i < junk.Length; i++) junk[i] = 0x5A;
                fs.Write(junk, 0, junk.Length);
            }
            File.WriteAllBytes(dbPath + "-wal", new byte[] { 1, 2, 3, 4 });

            DatabaseService.Initialize(_baseFolder);
            Assert.IsTrue(DatabaseService.IsCorrupted, "تم اكتشاف التلف عند بدء التشغيل");
            Assert.IsTrue(File.Exists(DatabaseService.IntegrityStatus.CorruptBackupSavedPath), "عزل الملف التالف");
            Assert.IsTrue(File.Exists(DatabaseService.IntegrityStatus.CorruptBackupSavedPath + "-wal"), "عزل ملف WAL مع الملف التالف");

            // 3. فحص السلامة يعمل بدون جلسة ويبلغ عن التلف
            var integrity = Dispatch("database:checkIntegrity", null);
            Assert.IsTrue(integrity.Success, Describe(integrity));
            var status = (DatabaseIntegrityStatus)integrity.Data;
            Assert.IsTrue(status.IsCorrupt, "الحالة تالفة");
            Assert.AreEqual(backup.BackupFilePath, status.LatestValidBackupFile, "اكتشاف آخر نسخة احتياطية");

            // 4. تسجيل الدخول يرجع رسالة عربية واضحة بدلاً من الانهيار
            var login = Dispatch("auth:login", new { username = "admin", pin = "1234" });
            Assert.IsFalse(login.Success);
            Assert.AreEqual("DATABASE_CORRUPT", login.Error.Code);
            StringAssert.Contains("استرجاع", login.Error.Message);
            Assert.IsTrue(Dispatch("auth:getCurrentUser", null).Success, "لا جلسة بدون انهيار");

            // 5. رفض ملف غير مشفر وكود خاطئ وكود فارغ
            string plainDb = Path.Combine(_baseFolder, "plain_copy.db");
            using (var plainConn = new SQLiteConnection("Data Source=" + plainDb + ";Version=3;"))
            {
                plainConn.Open();
                using (var cmd = new SQLiteCommand("CREATE TABLE t (id INTEGER);", plainConn)) { cmd.ExecuteNonQuery(); }
            }
            AssertRejected(Dispatch("database:restore", new { backupFilePath = plainDb, recoveryCode = recoveryCode }), "ملف غير مشفر");
            AssertRejected(Dispatch("database:restore", new { backupFilePath = backup.BackupFilePath, recoveryCode = "RFK-0000-0000-0000" }), "كود خاطئ");
            AssertRejected(Dispatch("database:restore", new { backupFilePath = backup.BackupFilePath }), "بدون كود");
            // الثغرة القديمة: حقل filePath بامتداد .rfbk كان يتجاوز البوابة بينما المعالج يقرأ backupFilePath
            AssertRejected(Dispatch("database:restore", new { filePath = "x.rfbk", backupFilePath = plainDb }), "تجاوز البوابة بحقل filePath");
            // خدمة النقل غير مهيأة على قاعدة تالفة: إجراءات الحزم تتطلب جلسة
            Assert.AreEqual("AUTH_REQUIRED", ErrorCode(Dispatch("migration:restore", new { packagePath = plainDb, recoveryCode = recoveryCode })), "استرجاع حزمة بدون جلسة");
            Assert.AreEqual("AUTH_REQUIRED", ErrorCode(Dispatch("migration:browseFile", null)), "اختيار ملف بدون جلسة");
            Assert.IsTrue(DatabaseService.IsCorrupted, "لم يحدث أي استرجاع بالمحاولات المرفوضة");

            // 6. الاسترجاع بكود المالك الصحيح ينجح والبيانات مطابقة
            var restore = Dispatch("database:restore", new { backupFilePath = backup.BackupFilePath, recoveryCode = recoveryCode });
            Assert.IsTrue(restore.Success, Describe(restore));
            Assert.IsFalse(DatabaseService.IsCorrupted, "قاعدة البيانات سليمة بعد الاسترجاع");
            Assert.AreEqual(dbPath, DatabaseService.DbPath, "الاسترجاع على نفس مجلد البيانات");
            Assert.AreEqual(salesBefore, CountSales(), "المبيعات المسترجعة مطابقة");
            Assert.IsNotNull(DatabaseService.Products.GetById(product.Id), "الأصناف المسترجعة موجودة");
        }

        [Test]
        public void Healthy_Restore_Checkpoints_Wal_Keeps_Safety_Copy_And_Reinitialises_Same_Folder()
        {
            DatabaseService.Initialize(_baseFolder);
            Product product;
            using (ProductWritePolicy.EnterTrustedFixtureOperation())
            product = DatabaseService.Products.SaveProduct(new Product
            {
                Name = "صنف استرجاع سليم",
                Barcode = "BAR_RESTORE_OK",
                PricePiasters = 1500,
                CostPiasters = 1000,
                StockQuantityMilli = 100000,
                Unit = "piece",
                IsActive = true
            }, true, true);
            InsertSale(product);
            string recoveryCode = DatabaseService.Backup.GetOrCreateRecoveryCode();
            var backup = DatabaseService.Backup.CreateBackup(Path.Combine(_baseFolder, "backups"));
            Assert.IsTrue(backup.Success, backup.Message);
            InsertSale(product);
            Assert.AreEqual(2, CountSales());

            var restore = DatabaseService.RestoreFromBackup(backup.BackupFilePath, recoveryCode);
            Assert.IsTrue(restore.Success, restore.Message);
            Assert.AreEqual(1, CountSales(), "البيانات عادت لوقت النسخة");
            Assert.IsTrue(DatabaseService.DbPath.StartsWith(_baseFolder), "إعادة التهيئة على نفس مجلد البيانات");

            string[] snapshots = Directory.GetFiles(Path.Combine(_baseFolder, "data", "pre_restore"), "pre_restore_*.db");
            Assert.AreEqual(1, snapshots.Length, "نسخة أمان قبل الاستبدال");
            using (var snapConn = new SQLiteConnection("Data Source=" + snapshots[0] + ";Version=3;Read Only=True;"))
            {
                snapConn.Open();
                using (var cmd = new SQLiteCommand("SELECT COUNT(*) FROM sales;", snapConn))
                {
                    Assert.AreEqual(2, Convert.ToInt64(cmd.ExecuteScalar()), "نسخة الأمان تشمل آخر بيع حتى لو كان في WAL");
                }
            }
        }

        private static void InsertSale(Product product)
        {
            DatabaseService.SaleRepo.CreateSaleAtomic(new Sale
            {
                SubtotalPiasters = 1500,
                TotalPiasters = 1500,
                PaidPiasters = 1500,
                PaymentMethod = "cash",
                Status = "completed",
                Items = new List<SaleItem>
                {
                    new SaleItem { ProductId = product.Id, ProductName = product.Name, QuantityMilli = 1000, UnitPricePiasters = 1500, TotalPiasters = 1500, UnitCostPiasters = 1000 }
                }
            });
        }

        private static BridgeResponse Dispatch(string action, object payload)
        {
            return IpcDispatcher.Dispatch(new BridgeRequest
            {
                Id = Guid.NewGuid().ToString("N"),
                Action = action,
                Payload = payload != null ? JObject.FromObject(payload) : null,
                Admission = SecurityService.CaptureRequestAdmission()
            });
        }

        private static void AssertRejected(BridgeResponse res, string label)
        {
            Assert.IsFalse(res.Success, label + " يجب أن يُرفض");
            Assert.AreEqual("RECOVERY_REJECTED", res.Error.Code, label + ": " + Describe(res));
        }

        private static string ErrorCode(BridgeResponse res)
        {
            return res != null && res.Error != null ? res.Error.Code : null;
        }

        private static string Describe(BridgeResponse res)
        {
            return res != null && res.Error != null ? res.Error.Code + ": " + res.Error.Message : "";
        }

        private static long CountSales()
        {
            using (var conn = new SQLiteConnection(DatabaseService.ConnectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand("SELECT COUNT(*) FROM sales;", conn))
                {
                    return Convert.ToInt64(cmd.ExecuteScalar());
                }
            }
        }

        // DatabaseService is a static service locator; leave no live services behind for the other fixtures
        private static void ResetDatabaseServiceStatics()
        {
            if (DatabaseService.License != null) DatabaseService.License.StopBackgroundPeriodicCheck();
            if (DatabaseService.Backup != null) DatabaseService.Backup.StopBackgroundPeriodicCheck();
            const BindingFlags flags = BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic;
            foreach (PropertyInfo prop in typeof(DatabaseService).GetProperties(flags))
            {
                MethodInfo setter = prop.GetSetMethod(true);
                if (setter != null && !prop.PropertyType.IsValueType) setter.Invoke(null, new object[] { null });
            }
            foreach (FieldInfo field in typeof(DatabaseService).GetFields(flags))
            {
                if (field.IsLiteral || field.IsInitOnly) continue;
                field.SetValue(null, field.FieldType.IsValueType ? Activator.CreateInstance(field.FieldType) : null);
            }
        }
    }
}
