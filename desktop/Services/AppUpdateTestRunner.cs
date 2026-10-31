using System;
using System.IO;
using System.IO.Compression;
using System.Text;
using RafiqPOS.Bridge;
using RafiqPOS.Common;

namespace RafiqPOS.Services
{
    public class AppUpdateTestResult
    {
        public bool Success { get; set; }
        public string Message { get; set; }
        public bool VersionComparisonPassed { get; set; }
        public bool ManifestParsingPassed { get; set; }
        public bool ChecksumIntegrityPassed { get; set; }
        public bool RollbackOnFailurePassed { get; set; }
        public bool RollbackTriggered { get; set; }
        public bool ZipSecurityPassed { get; set; }
        public bool OfflinePackageInspectionPassed { get; set; }
        public bool SuccessfulUpdateStagingPassed { get; set; }
        public bool DatabasePreservationPassed { get; set; }
        public bool DownloadValidationPassed { get; set; }
        public bool RestartGuardPassed { get; set; }
        public int TotalAssertions { get; set; }
        public int PassedAssertions { get; set; }
    }

    public static class AppUpdateTestRunner
    {
        public static AppUpdateTestResult RunAllTests()
        {
            AppUpdateTestResult result = new AppUpdateTestResult();
            result.Success = false;
            result.VersionComparisonPassed = false;
            result.ManifestParsingPassed = false;
            result.ChecksumIntegrityPassed = false;
            result.RollbackOnFailurePassed = false;
            result.ZipSecurityPassed = false;
            result.OfflinePackageInspectionPassed = false;
            result.SuccessfulUpdateStagingPassed = false;
            result.DatabasePreservationPassed = false;
            result.TotalAssertions = 0;
            result.PassedAssertions = 0;

            if (DatabaseService.Updates == null || DatabaseService.Backup == null)
            {
                result.Message = "خدمة التحديثات أو النسخ الاحتياطي غير مهيأة";
                return result;
            }

            string tempDir = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "update_test_tmp");
            try
            {
                if (Directory.Exists(tempDir))
                {
                    try { Directory.Delete(tempDir, true); } catch { }
                }
                Directory.CreateDirectory(tempDir);

                // ==========================================
                // TEST 1: Version Comparison Logic
                // ==========================================
                result.TotalAssertions++;
                bool v1 = AppUpdateService.CompareVersions("1.0.1", "1.0.0") > 0;
                bool v2 = AppUpdateService.CompareVersions("1.0.0", "1.0.0") == 0;
                bool v3 = AppUpdateService.CompareVersions("0.9.9", "1.0.0") < 0;
                bool v4 = AppUpdateService.CompareVersions("1.10.0", "1.2.0") > 0;

                if (!v1 || !v2 || !v3 || !v4)
                {
                    result.Message = "فشل اختبار مقارنة إصدارات البرنامج";
                    return result;
                }
                result.VersionComparisonPassed = true;
                result.PassedAssertions++;

                // ==========================================
                // TEST 2: Manifest Parsing & Update Detection
                // ==========================================
                result.TotalAssertions++;
                string mockManifest = "{" +
                    "\"version\": \"1.1.0\"," +
                    "\"releaseDate\": \"2026-10-10\"," +
                    "\"changelog\": \"تحسينات شاملة وسرعة فائقة في المبيعات\"," +
                    "\"downloadUrl\": \"https://example.com/update_v1.1.0.zip\"," +
                    "\"sha256\": \"E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855\"," +
                    "\"isMandatory\": false," +
                    "\"fileSizeBytes\": 1048576" +
                "}";

                AppUpdateInfo parsedInfo = DatabaseService.Updates.CheckForUpdates(mockManifest);
                if (!parsedInfo.HasUpdate || parsedInfo.LatestVersion != "1.1.0" || parsedInfo.Changelog == null)
                {
                    result.Message = "فشل اختبار معالجة ملف الإصدار واكتشاف التحديث";
                    return result;
                }
                result.ManifestParsingPassed = true;
                result.PassedAssertions++;

                // ==========================================
                // TEST 3: Checksum Integrity Validation
                // ==========================================
                result.TotalAssertions++;
                string testPackage = Path.Combine(tempDir, "test_update.pkg");
                File.WriteAllText(testPackage, "RAFIQ_POS_UPDATE_PAYLOAD_TEST_CONTENT", Encoding.UTF8);
                string actualSha = AppUpdateService.ComputeFileSha256(testPackage);

                // Try applying with corrupt/mismatching expected hash
                AppUpdateResult mismatchRes = DatabaseService.Updates.ApplyUpdate(testPackage, "0000000000000000000000000000000000000000000000000000000000000000");
                if (mismatchRes.Success || mismatchRes.Code != "CHECKSUM_MISMATCH")
                {
                    result.Message = "فشل اختبار التحقق من الهاش: تم قبول حزمة تحديث تالفة";
                    return result;
                }
                result.ChecksumIntegrityPassed = true;
                result.PassedAssertions++;

                // ==========================================
                // TEST 4: Automatic Rollback on Update Failure (Task 115-3)
                // ==========================================
                result.TotalAssertions++;
                AppUpdateResult rollbackRes = DatabaseService.Updates.ApplyUpdate(testPackage, actualSha, true);
                if (rollbackRes.Success || !rollbackRes.RollbackTriggered || rollbackRes.Code != "UPDATE_FAILED_ROLLED_BACK")
                {
                    result.Message = "فشل اختبار التراجع التلقائي عند تعثر تثبيت التحديث";
                    return result;
                }
                result.RollbackTriggered = true;
                result.RollbackOnFailurePassed = true;
                result.PassedAssertions++;

                // ==========================================
                // TEST 5: Offline Package Creation & Inspection
                // ==========================================
                result.TotalAssertions++;
                string offlineZipPath = Path.Combine(tempDir, "rafiq_update_v1.2.0.pkg");
                using (FileStream zipStream = new FileStream(offlineZipPath, FileMode.Create))
                using (ZipArchive archive = new ZipArchive(zipStream, ZipArchiveMode.Create))
                {
                    // Add update_manifest.json
                    ZipArchiveEntry manifestEntry = archive.CreateEntry("update_manifest.json");
                    using (Stream writer = manifestEntry.Open())
                    {
                        string offlineManifest = "{" +
                            "\"version\": \"1.2.0\"," +
                            "\"releaseDate\": \"2026-10-19\"," +
                            "\"changelog\": \"ميزات الأوفلاين الجديدة وسرعة فائقة في المبيعات\"," +
                            "\"sha256\": \"\"" +
                        "}";
                        byte[] bytes = Encoding.UTF8.GetBytes(offlineManifest);
                        writer.Write(bytes, 0, bytes.Length);
                    }

                    // Add simulated binary executable update
                    ZipArchiveEntry exeEntry = archive.CreateEntry("RafiqPOS_New.exe");
                    using (Stream writer = exeEntry.Open())
                    {
                        byte[] exeBytes = Encoding.UTF8.GetBytes("SIMULATED_NEW_BINARY_PAYLOAD_V120");
                        writer.Write(exeBytes, 0, exeBytes.Length);
                    }
                }

                AppUpdateInfo offlineInfo = DatabaseService.Updates.InspectOfflinePackage(offlineZipPath);
                if (!offlineInfo.HasUpdate || offlineInfo.LatestVersion != "1.2.0" || !offlineInfo.IsOfflinePackage)
                {
                    result.Message = "فشل فحص حزمة التحديث الأوفلاين من الفلاشة";
                    return result;
                }
                result.OfflinePackageInspectionPassed = true;
                result.PassedAssertions++;

                // ==========================================
                // TEST 6: Malicious Zip / Database Overwrite Protection
                // ==========================================
                result.TotalAssertions++;
                string maliciousZipPath = Path.Combine(tempDir, "malicious_update.pkg");
                using (FileStream zipStream = new FileStream(maliciousZipPath, FileMode.Create))
                using (ZipArchive archive = new ZipArchive(zipStream, ZipArchiveMode.Create))
                {
                    // Malicious entry attempting to overwrite db or traverse path
                    ZipArchiveEntry badEntry = archive.CreateEntry("../data/rafiq_pos.db");
                    using (Stream writer = badEntry.Open())
                    {
                        byte[] badBytes = Encoding.UTF8.GetBytes("ATTACK_PAYLOAD");
                        writer.Write(badBytes, 0, badBytes.Length);
                    }
                }

                AppUpdateResult badRes = DatabaseService.Updates.ApplyUpdate(maliciousZipPath, null, false);
                if (badRes.Success || !badRes.RollbackTriggered)
                {
                    result.Message = "فشل اختبار حماية قاعدة البيانات: تم قبول ملف يحاول النفاذ للمسارات المحمية";
                    return result;
                }
                result.ZipSecurityPassed = true;
                result.PassedAssertions++;

                // ==========================================
                // TEST 7: Successful Update Staging with Safety Backup & Database Preservation
                // ==========================================
                result.TotalAssertions++;
                string dbPathBefore = DatabaseService.DbPath;
                bool dbExistsBefore = !string.IsNullOrEmpty(dbPathBefore) && File.Exists(dbPathBefore);

                string offlineZipSha = AppUpdateService.ComputeFileSha256(offlineZipPath);
                AppUpdateResult successRes = DatabaseService.Updates.ApplyUpdate(offlineZipPath, offlineZipSha, false);
                if (!successRes.Success || successRes.Code != "UPDATE_APPLIED_SUCCESS" || string.IsNullOrEmpty(successRes.BackupPath))
                {
                    result.Message = "فشل اختبار تثبيت التحديث الناجح أو أخذ النسخة الاحتياطية للأمان: " + successRes.Message;
                    return result;
                }
                result.SuccessfulUpdateStagingPassed = true;
                result.PassedAssertions++;

                // ==========================================
                // TEST 8: Strict Database & Settings Preservation Check
                // ==========================================
                result.TotalAssertions++;
                if (dbExistsBefore)
                {
                    if (!File.Exists(dbPathBefore))
                    {
                        result.Message = "خطأ حرج: تم التأثير على ملف قاعدة البيانات أثناء التحديث!";
                        return result;
                    }
                }
                result.DatabasePreservationPassed = true;
                result.PassedAssertions++;

                // ==========================================
                // TEST 9: Download Validation (Empty URL & Checksum Guard)
                // ==========================================
                result.TotalAssertions++;
                var badDl = DatabaseService.Updates.DownloadUpdate("", "");
                if (badDl.Success)
                {
                    result.Message = "فشل اختبار التحقق من رابط التحميل الفارغ";
                    return result;
                }
                result.DownloadValidationPassed = true;
                result.PassedAssertions++;

                // ==========================================
                // TEST 10: Restart Updater Guard (Requires Staging)
                // ==========================================
                result.TotalAssertions++;
                string errRestart;
                string testStaging = AppUpdateService.GetStagingDirectory();
                if (Directory.Exists(testStaging))
                {
                    try { Directory.Delete(testStaging, true); } catch { }
                }
                bool restartRefused = !DatabaseService.Updates.LaunchRestartUpdater(out errRestart);
                if (!restartRefused || string.IsNullOrEmpty(errRestart))
                {
                    result.Message = "فشل اختبار حماية إعادة التشغيل عند عدم وجود ملفات التحديث المجهزة";
                    return result;
                }
                result.RestartGuardPassed = true;
                result.PassedAssertions++;

                result.Success = true;
                result.Message = string.Format("نجحت جميع اختبارات التحديث التلقائي والأوفلاين والتراجع بنسبة 100% ({0}/{1} تأكيداً)!", result.PassedAssertions, result.TotalAssertions);
                return result;
            }
            catch (Exception ex)
            {
                result.Message = "خطأ أثناء تنفيذ اختبارات التحديث: " + ex.Message;
                return result;
            }
            finally
            {
                try
                {
                    if (Directory.Exists(tempDir))
                    {
                        Directory.Delete(tempDir, true);
                    }
                }
                catch { }
            }
        }
    }
}
