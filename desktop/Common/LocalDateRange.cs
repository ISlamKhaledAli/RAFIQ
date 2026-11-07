using System;
using System.Globalization;

namespace RafiqPOS.Common
{
    /// <summary>
    /// فترة بأيام تقويمية محلية (yyyy-MM-dd) تُحوَّل إلى حدود UTC نصف مفتوحة [FromUtc, ToExclusiveUtc):
    /// بداية يوم "من" حتى نهاية يوم "إلى" شاملة (أي قبل بداية اليوم التالي مباشرة).
    /// إذا كان "من" بعد "إلى" يتم تبديلهما. أي طرف فارغ يعني بلا حد.
    /// </summary>
    public sealed class LocalDateRange
    {
        public DateTime? FromUtc { get; private set; }
        public DateTime? ToExclusiveUtc { get; private set; }

        public bool HasBounds
        {
            get { return FromUtc.HasValue || ToExclusiveUtc.HasValue; }
        }

        public static LocalDateRange Parse(string dateFrom, string dateTo)
        {
            DateTime? fromDay = ParseDay(dateFrom);
            DateTime? toDay = ParseDay(dateTo);

            if (fromDay.HasValue && toDay.HasValue && fromDay.Value > toDay.Value)
            {
                DateTime swap = fromDay.Value;
                fromDay = toDay;
                toDay = swap;
            }

            var range = new LocalDateRange();
            if (fromDay.HasValue)
            {
                range.FromUtc = ToUtcStartOfDay(fromDay.Value);
            }
            if (toDay.HasValue)
            {
                range.ToExclusiveUtc = ToUtcStartOfDay(toDay.Value.AddDays(1));
            }
            return range;
        }

        /// <summary>
        /// بادئة نصية للمقارنة مع أعمدة ISO ("2026-11-06T22:00:00.1234567Z"): بلا كسور وبلا Z
        /// حتى تكون أي قيمة مخزنة في نفس الثانية أكبر من أو تساوي البادئة.
        /// </summary>
        public static string ToIsoPrefix(DateTime utc)
        {
            return utc.ToString("yyyy-MM-dd'T'HH:mm:ss", CultureInfo.InvariantCulture);
        }

        /// <summary>نفس الفكرة لأعمدة SQLite بصيغة "yyyy-MM-dd HH:mm:ss" (UTC).</summary>
        public static string ToSqlText(DateTime utc)
        {
            return utc.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture);
        }

        private static DateTime? ParseDay(string value)
        {
            if (string.IsNullOrWhiteSpace(value)) return null;

            DateTime parsed;
            if (!DateTime.TryParseExact(value.Trim(), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out parsed))
            {
                throw new ArgumentException("صيغة التاريخ غير صحيحة، المطلوب سنة-شهر-يوم مثل 2026-11-07");
            }
            return parsed.Date;
        }

        private static DateTime ToUtcStartOfDay(DateTime localDay)
        {
            DateTime local = DateTime.SpecifyKind(localDay.Date, DateTimeKind.Local);
            return local.ToUniversalTime();
        }
    }
}
