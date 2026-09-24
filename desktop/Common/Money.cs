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
    }
}
