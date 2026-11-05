using NUnit.Framework;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    /// <summary>
    /// اسم الصنف المطبوع سطر واحد نظيف: نفس صفوف NAME_CLEANING_TABLE في receipt_layout.test.js (توأم cleanReceiptItemName).
    /// </summary>
    [TestFixture]
    public class S54_ReceiptItemNameTest
    {
        [Test]
        public void CleanReceiptItemName_MatchesTheFrontendTable()
        {
            string[] input = new string[]
            {
                "لبن جهينة",
                "  لبن   جهينة  ",
                "أرز مصري\nعبوة 10 كجم",
                "شاي\t\tليبتون\r\nأصفر",
                "عصير \uD83C\uDF4A برتقال",
                "حلوى \u2764 شوكولاتة \u2713",
                "عبوة\u200Bكبيرة",
                "\u202Eمنتج\u202C عادي",
                "Pampers\u00AE 5 Pack \u00D7 3",
                "\uD83C\uDF4A\uD83C\uDF4B",
                "   ",
                ""
            };
            string[] expected = new string[]
            {
                "لبن جهينة",
                "لبن جهينة",
                "أرز مصري عبوة 10 كجم",
                "شاي ليبتون أصفر",
                "عصير برتقال",
                "حلوى شوكولاتة",
                "عبوةكبيرة",
                "منتج عادي",
                "Pampers\u00AE 5 Pack \u00D7 3",
                "",
                "",
                ""
            };
            for (int i = 0; i < input.Length; i++)
            {
                Assert.AreEqual(expected[i], PrinterService.CleanReceiptItemName(input[i]), "row " + i);
            }
        }

        [Test]
        public void CleanReceiptItemName_NullIsEmpty()
        {
            Assert.AreEqual("", PrinterService.CleanReceiptItemName(null));
        }
    }
}
