using System;
using System.Data.SQLite;
using System.Globalization;

namespace RafiqPOS.Common
{
    public class ClockValidationResult
    {
        public bool IsValid { get; set; }
        public string Code { get; set; }
        public string Message { get; set; }
        public string LastRecordedUtc { get; set; }
        public string CurrentUtc { get; set; }

        public ClockValidationResult(bool isValid, string code, string message, string lastRecordedUtc, string currentUtc)
        {
            this.IsValid = isValid;
            this.Code = code;
            this.Message = message;
            this.LastRecordedUtc = lastRecordedUtc;
            this.CurrentUtc = currentUtc;
        }

        public static ClockValidationResult Valid()
        {
            return new ClockValidationResult(true, "OK", "توقيت وساعة الجهاز متطابقة مع سجلات العمليات.", null, DateTime.UtcNow.ToString("o"));
        }

        public static ClockValidationResult Warning(string code, string message, string lastRecorded, string currentUtc)
        {
            return new ClockValidationResult(false, code, message, lastRecorded, currentUtc);
        }
    }

    public static class TimeGuard
    {
        /// <summary>
        /// فحص سلامة ساعة وتاريخ الجهاز مقارنة بآخر عملية بيع أو سجل نشاط (Feature #127 / Task 127-2)
        /// يكتشف بطارية اللوحة الأم التالفة (CMOS) أو تغيير التاريخ اليدوي لتجنب إفساد تقارير اليومية
        /// </summary>
        public static ClockValidationResult ValidateSystemClock(string connectionString)
        {
            try
            {
                using (SQLiteConnection conn = new SQLiteConnection(connectionString))
                {
                    conn.Open();
                    string query = @"
                        SELECT MAX(created_at) FROM (
                            SELECT MAX(created_at) AS created_at FROM sales
                            UNION ALL
                            SELECT MAX(created_at) AS created_at FROM audit_logs
                        ) WHERE created_at IS NOT NULL;";

                    using (SQLiteCommand cmd = new SQLiteCommand(query, conn))
                    {
                        object obj = cmd.ExecuteScalar();
                        if (obj == null || obj == DBNull.Value || string.IsNullOrEmpty(obj.ToString()))
                        {
                            // No prior records, system clock is assumed valid for first run
                            return ClockValidationResult.Valid();
                        }

                        string lastRecordedStr = obj.ToString();
                        DateTime lastRecordedUtc;
                        if (!DateTime.TryParse(lastRecordedStr, CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out lastRecordedUtc))
                        {
                            return ClockValidationResult.Valid();
                        }

                        DateTime nowUtc = DateTime.UtcNow;

                        // Case 1: Clock went backwards by more than 5 minutes (e.g. CMOS battery reset or user changed clock to falsify dates)
                        if (nowUtc < lastRecordedUtc.AddMinutes(-5))
                        {
                            TimeSpan diff = lastRecordedUtc - nowUtc;
                            string msg = string.Format(
                                "تنبيه أمان: ساعة الجهاز متأخرة عن آخر عملية مسجلة بمقدار {0} دقيقة.\n" +
                                "آخر عملية كانت بتاريخ: {1} (UTC)\n" +
                                "التوقيت الحالي للجهاز: {2} (UTC)\n" +
                                "يرجى التحقق من بطارية الجهاز (CMOS) وضبط التاريخ والوقت لتفادي تشويه إقفال اليومية.",
                                Math.Round(diff.TotalMinutes),
                                lastRecordedUtc.ToString("yyyy-MM-dd HH:mm:ss"),
                                nowUtc.ToString("yyyy-MM-dd HH:mm:ss")
                            );
                            Logger.Warn("اكتشاف تراجع في ساعة النظام: " + msg);
                            return ClockValidationResult.Warning("CLOCK_BACKWARDS", msg, lastRecordedStr, nowUtc.ToString("o"));
                        }

                        // Case 2: Clock jumped forward into the far future by more than 45 days
                        if (nowUtc > lastRecordedUtc.AddDays(45))
                        {
                            TimeSpan diff = nowUtc - lastRecordedUtc;
                            string msg = string.Format(
                                "تنبيه أمان: تاريخ الجهاز يقفز للمستقبل بفارق كبير ({0} يوماً عن آخر حركة).\n" +
                                "آخر عملية كانت بتاريخ: {1} (UTC)\n" +
                                "التوقيت الحالي للجهاز: {2} (UTC)\n" +
                                "يرجى ضبط تاريخ الويندوز للعام والتاريخ الحاليين.",
                                Math.Round(diff.TotalDays),
                                lastRecordedUtc.ToString("yyyy-MM-dd HH:mm:ss"),
                                nowUtc.ToString("yyyy-MM-dd HH:mm:ss")
                            );
                            Logger.Warn("اكتشاف قفزة للأمام في ساعة النظام: " + msg);
                            return ClockValidationResult.Warning("CLOCK_JUMP_FORWARD", msg, lastRecordedStr, nowUtc.ToString("o"));
                        }
                    }
                }

                return ClockValidationResult.Valid();
            }
            catch (Exception ex)
            {
                Logger.Error("خطأ أثناء التحقق من سلامة ساعة النظام", ex);
                return ClockValidationResult.Valid();
            }
        }

        /// <summary>
        /// حساب تاريخ يوم العمل للسوبرماركت مع الأخذ في الاعتبار ساعة الإغلاق الليلية (Feature #127 / Task 127-1)
        /// السوبرماركت الذي يستمر لما بعد منتصف الليل، تُحسب مبيعات حتى 3:00 ص أو 4:00 ص ضمن يوم العمل السابق
        /// </summary>
        public static DateTime GetBusinessDate(DateTime localTime, int cutoffHour = 4)
        {
            if (localTime.Hour < cutoffHour)
            {
                return localTime.Date.AddDays(-1);
            }
            return localTime.Date;
        }
    }
}
