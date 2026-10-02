using System;
using System.Drawing;
using System.Text;

namespace RafiqPOS.Common
{
    /// <summary>
    /// مولّد باركود Code 128 احترافي عالي الدقة بدون أي مكتبات خارجية
    /// متوافق 100% مع معيار ISO/IEC 15417 ويدعم طابعات الباركود الحرارية (203/300 DPI)
    /// </summary>
    public static class BarcodeGenerator
    {
        // مصفوفة رموز Code 128 القياسية (107 رموز: 103 بيانات + 3 بدايات + 1 توقف)
        private static readonly long[] BARS = new long[]
        {
            11011001100L, 11001101100L, 11001100110L, 10010011000L, 10010001100L, 10001001100L, 10011001000L, 10011000100L, 10001100100L, 11001001000L,
            11001000100L, 11000100100L, 10110011100L, 10011011100L, 10011001110L, 10111001100L, 10011101100L, 10011100110L, 11001110010L, 11001011100L,
            11001001110L, 11011100100L, 11001110100L, 11101101110L, 11101001100L, 11100101100L, 11100100110L, 11101100100L, 11100110100L, 11100110010L,
            11011011000L, 11011000110L, 11000110110L, 10100011000L, 10001011000L, 10001000110L, 10110001000L, 10001101000L, 10001100010L, 11010001000L,
            11000101000L, 11000100010L, 10110111000L, 10110001110L, 10001101110L, 10111011000L, 10111000110L, 10001110110L, 11101110110L, 11010001110L,
            11000101110L, 11011101000L, 11011100010L, 11011101110L, 11101011000L, 11101000110L, 11100010110L, 11101101000L, 11101100010L, 11100011010L,
            11101111010L, 11001000010L, 11110001010L, 10100110000L, 10100001100L, 10010110000L, 10010000110L, 10000101100L, 10000100110L, 10110010000L,
            10110000100L, 10011010000L, 10011000010L, 10000110100L, 10000110010L, 11000010010L, 11001010000L, 11110111010L, 11000010100L, 10001111010L,
            10100111100L, 10010111100L, 10010011110L, 10111100100L, 10011110100L, 10011110010L, 11110100100L, 11110010100L, 11110010010L, 11011011110L,
            11011110110L, 11110110110L, 10101111000L, 10100011110L, 10001011110L, 10111101000L, 10111100010L, 11110101000L, 11110100010L, 10111011110L,
            10111101110L, 11101011110L, 11110101110L, 11010000100L, 11010010000L, 11010011100L, 1100011101011L
        };

        private const int START_B = 104;
        private const int STOP = 106;

        /// <summary>
        /// تحويل نص الباركود إلى سلسلة بتات ثنائية (1 = خط أسود، 0 = فراغ أبيض)
        /// باستخدام ترميز Code 128 Subset B الشامل للأرقام والحروف
        /// </summary>
        public static string EncodeCode128(string text)
        {
            if (string.IsNullOrEmpty(text)) return "";

            // تنظيف النص وحصره في محارف ASCII المسموحة (32 إلى 126)
            var clean = new StringBuilder();
            for (int i = 0; i < text.Length; i++)
            {
                char c = text[i];
                if (c >= 32 && c <= 126)
                {
                    clean.Append(c);
                }
            }

            if (clean.Length == 0) return "";

            string raw = clean.ToString();
            var sb = new StringBuilder();

            // 1. رمز البداية Start B (104)
            sb.Append(BARS[START_B].ToString().PadLeft(11, '0'));

            int checksum = START_B;

            // 2. محارف البيانات وحساب المجموع الاختباري (Modulo 103)
            for (int i = 0; i < raw.Length; i++)
            {
                int code = raw[i] - 32;
                checksum += code * (i + 1);
                sb.Append(BARS[code].ToString().PadLeft(11, '0'));
            }

            // 3. رمز فحص التحقق Modulo 103
            int checkDigit = checksum % 103;
            sb.Append(BARS[checkDigit].ToString().PadLeft(11, '0'));

            // 4. رمز التوقف Stop (106) بطول 13 بت
            sb.Append(BARS[STOP].ToString().PadLeft(13, '0'));

            return sb.ToString();
        }

        /// <summary>
        /// رسم الباركود بيانياً بدقة متناهية داخل المستطيل المحدد
        /// </summary>
        public static void DrawBarcode(Graphics g, string barcodeText, RectangleF rect, bool showText = true, Font textFont = null)
        {
            if (g == null || string.IsNullOrEmpty(barcodeText) || rect.Width <= 0 || rect.Height <= 0)
                return;

            string bits = EncodeCode128(barcodeText);
            if (string.IsNullOrEmpty(bits)) return;

            float textHeight = showText ? 14f : 0f;
            float barcodeHeight = Math.Max(10f, rect.Height - textHeight - 2f);

            // حساب عرض الموديول الواحد (Module Width)
            float moduleWidth = rect.Width / (float)bits.Length;
            if (moduleWidth < 0.5f) moduleWidth = 0.5f;

            // توسيط الباركود داخل المستطيل المتاح
            float totalBarcodeWidth = moduleWidth * bits.Length;
            float startX = rect.X + Math.Max(0f, (rect.Width - totalBarcodeWidth) / 2f);
            float startY = rect.Y;

            // رسم الخطوط السوداء والفراغات
            using (var brush = new SolidBrush(Color.Black))
            {
                int i = 0;
                while (i < bits.Length)
                {
                    if (bits[i] == '1')
                    {
                        int runLength = 1;
                        while (i + runLength < bits.Length && bits[i + runLength] == '1')
                        {
                            runLength++;
                        }

                        float barX = startX + (i * moduleWidth);
                        float barW = runLength * moduleWidth;
                        g.FillRectangle(brush, barX, startY, barW, barcodeHeight);

                        i += runLength;
                    }
                    else
                    {
                        i++;
                    }
                }
            }

            // رسم رقم الباركود كنص مقروء أسفل الأعمدة
            if (showText)
            {
                Font fontToUse = textFont;
                bool disposeFont = false;
                if (fontToUse == null)
                {
                    fontToUse = new Font("Courier New", 8.5f, FontStyle.Bold);
                    disposeFont = true;
                }

                try
                {
                    var format = new StringFormat
                    {
                        Alignment = StringAlignment.Center,
                        LineAlignment = StringAlignment.Center
                    };

                    var textRect = new RectangleF(rect.X, startY + barcodeHeight + 1f, rect.Width, textHeight);
                    using (var textBrush = new SolidBrush(Color.Black))
                    {
                        g.DrawString(barcodeText, fontToUse, textBrush, textRect, format);
                    }
                }
                finally
                {
                    if (disposeFont && fontToUse != null)
                    {
                        fontToUse.Dispose();
                    }
                }
            }
        }

        #region Feature #119 / Story 108: توليد الباركود الداخلي القياسي EAN-13

        /// <summary>
        /// البادئة القياسية للباركود الداخلي في محلات التجزئة والسوبرماركت (GS1 Restricted Distribution)
        /// البادئة 200 تمنع أي تعارض قطعي مع باركودات المصانع العالمية (مثل 622 لمصر و00-13 لأمريكا)
        /// وتمنع التعارض مع باركودات الميزان الحساس (21 أو 22)
        /// </summary>
        public const string INTERNAL_BARCODE_PREFIX = "200";

        /// <summary>
        /// حساب الرقم التدقيقي للباركود القياسي EAN-13 (Modulo 10 with alternating weights 1 and 3)
        /// متوافق 100% مع معايير GS1 الدولية
        /// </summary>
        public static int CalculateEan13CheckDigit(string digits12)
        {
            if (string.IsNullOrEmpty(digits12) || digits12.Length != 12)
            {
                throw new ArgumentException("EAN-13 payload must be exactly 12 digits.", "digits12");
            }

            int sumOdd = 0;
            int sumEven = 0;

            for (int i = 0; i < 12; i++)
            {
                char c = digits12[i];
                if (c < '0' || c > '9')
                {
                    throw new ArgumentException("EAN-13 payload must contain only numeric digits.", "digits12");
                }

                int val = c - '0';
                if (i % 2 == 0) // الفهارس الزوجية برمجياً تمثل الخانات الفردية ترتيباً (1, 3, 5, 7, 9, 11) بوزن 1
                {
                    sumOdd += val;
                }
                else // الفهارس الفردية برمجياً تمثل الخانات الزوجية ترتيباً (2, 4, 6, 8, 10, 12) بوزن 3
                {
                    sumEven += val;
                }
            }

            int total = sumOdd + (sumEven * 3);
            int rem = total % 10;
            return (10 - rem) % 10;
        }

        /// <summary>
        /// توليد باركود داخلي قياسي كامل بطول 13 خانة (EAN-13) بناءً على رقم العداد المتسلسل
        /// البنية: [200][تسلسل 9 أرقام][رقم التحقق]
        /// مثال: العداد 1 => "2000000000015"
        /// </summary>
        public static string FormatInternalEan13(long sequenceNumber)
        {
            if (sequenceNumber < 1) sequenceNumber = 1;

            // كحد أقصى 9 خانات متسلسلة (من 1 إلى 999,999,999)
            long clamped = sequenceNumber % 1000000000L;
            if (clamped == 0) clamped = sequenceNumber;

            string digits12 = INTERNAL_BARCODE_PREFIX + clamped.ToString("D9");
            int checkDigit = CalculateEan13CheckDigit(digits12);
            return digits12 + checkDigit.ToString();
        }

        /// <summary>
        /// التحقق من صحة باركود EAN-13 بطول 13 رقماً ورقم تدقيقي سليم
        /// </summary>
        public static bool IsValidEan13(string barcode)
        {
            if (string.IsNullOrEmpty(barcode) || barcode.Length != 13) return false;

            for (int i = 0; i < 13; i++)
            {
                if (barcode[i] < '0' || barcode[i] > '9') return false;
            }

            string payload = barcode.Substring(0, 12);
            int expectedCheck = CalculateEan13CheckDigit(payload);
            int actualCheck = barcode[12] - '0';
            return expectedCheck == actualCheck;
        }

        /// <summary>
        /// فحص هل الباركود باركود داخلي ينتمي لنظام رفيق POS
        /// </summary>
        public static bool IsInternalBarcode(string barcode)
        {
            return IsValidEan13(barcode) && barcode.StartsWith(INTERNAL_BARCODE_PREFIX);
        }

        #endregion
    }
}
