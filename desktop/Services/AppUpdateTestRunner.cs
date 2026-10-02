using System;
using System.IO;
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
        public bool SuccessfulUpdateStagingPassed { get; set; }
        public int TotalAssertions { get; set; }
        public int PassedAssertions { get; set; }
    }

    public static class AppUpdateTestRunner
    {
        public static AppUpdateTestResult RunAllTests()
        {
            var result = new AppUpdateTestResult
            {
                Success = false,
                VersionComparisonPassed = false,
                ManifestParsingPassed = false,
                ChecksumIntegrityPassed = false,
                RollbackOnFailurePassed = false,
                SuccessfulUpdateStagingPassed = false,
                TotalAssertions = 0,
                PassedAssertions = 0
            };

            if (DatabaseService.Updates == null || DatabaseService.Backup == null)
            {
                result.Message = "خدمة التحديثات أو النسخ الاحتياطي غير مهيأة";
                return result;
            }

            string tempDir = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "update_test_tmp");
            try
            {
                if (!Directory.Exists(tempDir))
                {
                    Directory.CreateDirectory(tempDir);
                }

                // ==========================================
                // TEST 1: Version Comparison Logic (Task 115-2)
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
                // TEST 2: Manifest Parsing & Update Detection (Task 115-1)
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

                var parsedInfo = DatabaseService.Updates.CheckForUpdates(mockManifest);
                if (!parsedInfo.HasUpdate || parsedInfo.LatestVersion != "1.1.0" || parsedInfo.Changelog == null)
                {
                    result.Message = "فشل اختبار معالجة ملف الإصدار واكتشاف التحديث";
                    return result;
                }
                result.ManifestParsingPassed = true;
                result.PassedAssertions++;

                // ==========================================
                // TEST 3: Checksum Integrity Validation (Task 115-2)
                // ==========================================
                result.TotalAssertions++;
                string testPackage = Path.Combine(tempDir, "test_update.pkg");
                File.WriteAllText(testPackage, "RAFIQ_POS_UPDATE_PAYLOAD_TEST_CONTENT");
                string actualSha = AppUpdateService.ComputeFileSha256(testPackage);

                // Try applying with corrupt/mismatching expected hash
                var mismatchRes = DatabaseService.Updates.ApplyUpdate(testPackage, "0000000000000000000000000000000000000000000000000000000000000000");
                if (mismatchRes.Success || mismatchRes.Code != "CHECKSUM_MISMATCH")
                {
                    result.Message = "فشل اختبار التحقق من الهاش: تم قبول حزمة تحديث تالفة";
                    return result;
                }
                result.ChecksumIntegrityPassed = true;
                result.PassedAssertions++;

                // ==========================================
                // TEST 4: Automatic Rollback on Update Failure (Task 115-3, 115-5)
                // ==========================================
                result.TotalAssertions++;
                var rollbackRes = DatabaseService.Updates.ApplyUpdate(testPackage, actualSha, true);
                if (rollbackRes.Success || !rollbackRes.RollbackTriggered || rollbackRes.Code != "UPDATE_FAILED_ROLLED_BACK")
                {
                    result.Message = "فشل اختبار التراجع التلقائي عند تعثر تثبيت التحديث";
                    return result;
                }
                result.RollbackTriggered = true;
                result.RollbackOnFailurePassed = true;
                result.PassedAssertions++;

                // ==========================================
                // TEST 5: Successful Update Staging with Safety Backup (Task 115-3, 115-5)
                // ==========================================
                result.TotalAssertions++;
                var successRes = DatabaseService.Updates.ApplyUpdate(testPackage, actualSha, false);
                if (!successRes.Success || successRes.Code != "UPDATE_APPLIED_SUCCESS" || string.IsNullOrEmpty(successRes.BackupPath))
                {
                    result.Message = "فشل اختبار تثبيت التحديث الناجح أو أخذ النسخة الاحتياطية للأمان: " + successRes.Message;
                    return result;
                }
                result.SuccessfulUpdateStagingPassed = true;
                result.PassedAssertions++;

                result.Success = true;
                result.Message = string.Format("نجحت جميع اختبارات التحديث التلقائي الآمن والتراجع بنسبة 100% ({0}/{1} تأكيداً)!", result.PassedAssertions, result.TotalAssertions);
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
