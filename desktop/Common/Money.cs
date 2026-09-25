using System;

namespace RafiqPOS.Common
{
    /// <summary>
    /// هيكل مالي يعتمد كلياً على الأعداد الصحيحة (القروش - Piasters)
    /// متوافق مع C# 5 و .NET Framework 4.8
    /// يمنع أي أخطاء تقريب أو استخدام للأرقام العشرية (Float/Double)
    /// </summary>
    public struct Money : IEquatable<Money>, IComparable<Money>
    {
        private readonly long _piasters;

        public long Piasters
        {
            get { return _piasters; }
        }

        public Money(long piasters)
        {
            this._piasters = piasters;
        }

        public static Money Zero
        {
            get { return new Money(0); }
        }

        public static Money FromPiasters(long piasters)
        {
            return new Money(piasters);
        }

        public static string FormatPiasters(long piasters)
        {
            decimal pounds = (decimal)piasters / 100m;
            return string.Format("{0} ج.م", pounds.ToString("N2"));
        }

        public static Money FromPounds(decimal pounds)
        {
            // 1 Pound = 100 Piasters. Round to nearest piaster using Half-Up rounding
            long piasters = (long)Math.Round(pounds * 100m, 0, MidpointRounding.AwayFromZero);
            return new Money(piasters);
        }

        public decimal ToPounds()
        {
            return (decimal)this._piasters / 100m;
        }

        public string ToFormattedArabicString(bool includeUnit)
        {
            decimal pounds = ToPounds();
            string formatted = pounds.ToString("N2");
            return includeUnit ? string.Format("{0} ج.م", formatted) : formatted;
        }

        public Money Add(Money other)
        {
            return new Money(this._piasters + other.Piasters);
        }

        public Money Subtract(Money other)
        {
            return new Money(this._piasters - other.Piasters);
        }

        /// <summary>
        /// ضرب السعر في كمية بالملي-وحدة (مثلاً: 1000 = 1 قطعة أو 1 كجم)
        /// </summary>
        public Money MultiplyByMilliUnits(long milliUnits)
        {
            decimal total = ((decimal)this._piasters * milliUnits) / 1000m;
            long roundedPiasters = (long)Math.Round(total, 0, MidpointRounding.AwayFromZero);
            return new Money(roundedPiasters);
        }

        /// <summary>
        /// حساب نسبة مئوية (مثلاً خصم أو ضريبة) بنقاط الأساس (Basis Points: 100 bp = 1%)
        /// </summary>
        public Money CalculateBasisPoints(int basisPoints)
        {
            decimal portion = ((decimal)this._piasters * basisPoints) / 10000m;
            long roundedPiasters = (long)Math.Round(portion, 0, MidpointRounding.AwayFromZero);
            return new Money(roundedPiasters);
        }

        /// <summary>
        /// حساب قيمة الضريبة بالقروش من إجمالي المبلغ بعد الخصم (Feature #6)
        /// </summary>
        /// <param name="totalPiasters">إجمالي المبلغ بعد الخصم</param>
        /// <param name="taxRatePercent">نسبة الضريبة (مثال: 14 لـ 14%)</param>
        /// <param name="priceIncludesTax">هل السعر شامل الضريبة (افتراضي في مصر)</param>
        public static long CalculateTaxPiasters(long totalPiasters, int taxRatePercent, bool priceIncludesTax)
        {
            if (taxRatePercent <= 0 || totalPiasters <= 0) return 0;

            if (priceIncludesTax)
            {
                // Net = (Total * 100) / (100 + TaxRate)
                // Tax = Total - Net
                decimal net = ((decimal)totalPiasters * 100m) / (100m + taxRatePercent);
                long netPiasters = (long)Math.Round(net, 0, MidpointRounding.AwayFromZero);
                return Math.Max(0, totalPiasters - netPiasters);
            }
            else
            {
                // Tax = Total * TaxRate / 100
                decimal tax = ((decimal)totalPiasters * taxRatePercent) / 100m;
                return (long)Math.Round(tax, 0, MidpointRounding.AwayFromZero);
            }
        }

        public static Money operator +(Money a, Money b)
        {
            return a.Add(b);
        }

        public static Money operator -(Money a, Money b)
        {
            return a.Subtract(b);
        }

        public static bool operator ==(Money a, Money b)
        {
            return a.Piasters == b.Piasters;
        }

        public static bool operator !=(Money a, Money b)
        {
            return a.Piasters != b.Piasters;
        }

        public static bool operator >(Money a, Money b)
        {
            return a.Piasters > b.Piasters;
        }

        public static bool operator <(Money a, Money b)
        {
            return a.Piasters < b.Piasters;
        }

        public static bool operator >=(Money a, Money b)
        {
            return a.Piasters >= b.Piasters;
        }

        public static bool operator <=(Money a, Money b)
        {
            return a.Piasters <= b.Piasters;
        }

        public bool Equals(Money other)
        {
            return this._piasters == other.Piasters;
        }

        public override bool Equals(object obj)
        {
            if (obj is Money)
            {
                Money other = (Money)obj;
                return Equals(other);
            }
            return false;
        }

        public override int GetHashCode()
        {
            return this._piasters.GetHashCode();
        }

        public int CompareTo(Money other)
        {
            return this._piasters.CompareTo(other.Piasters);
        }

        public override string ToString()
        {
            return ToFormattedArabicString(true);
        }

        /// <summary>
        /// تحويل الأرقام العربية المشرقية والفارسية والفاصلة العربية إلى أرقام قياسية (Feature #130 / Task 130-1)
        /// </summary>
        public static string NormalizeNumerals(string input)
        {
            if (string.IsNullOrEmpty(input)) return string.Empty;

            var sb = new System.Text.StringBuilder(input.Length);
            for (int i = 0; i < input.Length; i++)
            {
                char c = input[i];
                if (c >= '\u0660' && c <= '\u0669') // ٠-٩
                {
                    sb.Append((char)('0' + (c - '\u0660')));
                }
                else if (c >= '\u06F0' && c <= '\u06F9') // ۰-۹
                {
                    sb.Append((char)('0' + (c - '\u06F0')));
                }
                else if (c == '،' || c == ',')
                {
                    sb.Append('.');
                }
                else
                {
                    sb.Append(c);
                }
            }
            return sb.ToString();
        }

        public static bool TryParsePounds(string input, out Money result)
        {
            result = Money.Zero;
            if (string.IsNullOrEmpty(input)) return false;

            string normalized = NormalizeNumerals(input.Trim());
            decimal pounds;
            if (decimal.TryParse(normalized, System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out pounds))
            {
                result = Money.FromPounds(pounds);
                return true;
            }
            return false;
        }
    }
}
