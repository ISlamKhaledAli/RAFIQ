using System;

namespace RafiqPOS.Services
{
    public class AppUpdateTestResult
    {
        public bool Success { get; set; }
        public string Message { get; set; }
        public bool VersionComparisonPassed { get; set; }
        public bool ManifestParsingPassed { get; set; }
        public bool IneligibleLicensePassed { get; set; }
        public int TotalAssertions { get; set; }
        public int PassedAssertions { get; set; }
    }

    // Verifies the informational update check (applying updates from inside the app is intentionally not supported)
    public static class AppUpdateTestRunner
    {
        public static AppUpdateTestResult RunAllTests()
        {
            AppUpdateTestResult result = new AppUpdateTestResult();

            if (DatabaseService.Updates == null)
            {
                result.Message = "خدمة التحديثات غير مهيأة";
                return result;
            }

            try
            {
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

                string[] parts = (AppUpdateService.CurrentVersion ?? "1.0.0").Split('.');
                int major = 2;
                if (parts.Length > 0 && int.TryParse(parts[0], out major))
                {
                    major = major + 1;
                }
                string futureVersion = string.Format("{0}.0.0", major);

                result.TotalAssertions++;
                string manifest = string.Format("{{\"version\": \"{0}\", \"releaseDate\": \"2026-10-10\", \"changelog\": \"تحسينات\", \"isMandatory\": false}}", futureVersion);
                AppUpdateInfo parsed = DatabaseService.Updates.CheckForUpdates(manifest);
                if (!parsed.HasUpdate || parsed.LatestVersion != futureVersion)
                {
                    result.Message = "فشل اختبار معالجة ملف الإصدار واكتشاف التحديث";
                    return result;
                }
                result.ManifestParsingPassed = true;
                result.PassedAssertions++;

                result.TotalAssertions++;
                string ineligible = string.Format("{{\"version\": \"{0}\", \"isEligible\": false, \"message\": \"غير مؤهل\"}}", futureVersion);
                AppUpdateInfo blocked = DatabaseService.Updates.CheckForUpdates(ineligible);
                if (blocked.HasUpdate || string.IsNullOrEmpty(blocked.ErrorMessage))
                {
                    result.Message = "فشل اختبار حجب التحديث عن الترخيص غير المؤهل";
                    return result;
                }
                result.IneligibleLicensePassed = true;
                result.PassedAssertions++;

                result.Success = true;
                result.Message = string.Format("نجحت اختبارات فحص التحديثات ({0}/{1} تأكيداً).", result.PassedAssertions, result.TotalAssertions);
                return result;
            }
            catch (Exception ex)
            {
                result.Message = "خطأ أثناء تنفيذ اختبارات التحديث: " + ex.Message;
                return result;
            }
        }
    }
}
