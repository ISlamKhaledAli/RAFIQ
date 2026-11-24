using System.Drawing;
using NUnit.Framework;
using RafiqPOS.Common;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    [TestFixture]
    public class S104_QrCodeGeneratorTest
    {
        [Test]
        public void Encode_NullOrEmpty_ReturnsNull()
        {
            Assert.IsNull(QrCodeGenerator.Encode(null));
            Assert.IsNull(QrCodeGenerator.Encode(""));
        }

        [Test]
        public void Encode_OnlineStoreUrl_GeneratesValidMatrixAndPatterns()
        {
            string url = "https://store.rafiqpos.workers.dev/shop-01234567";
            bool[,] matrix = QrCodeGenerator.Encode(url, QrCodeGenerator.EccLevel.Medium);

            Assert.IsNotNull(matrix, "المصفوفة يجب ألا تكون فارغة");
            int size = matrix.GetLength(0);
            Assert.AreEqual(33, size, "حجم QR لعنوان المتجر النموذجي يجب أن يكون Version 4 (33x33)");
            Assert.AreEqual(size, matrix.GetLength(1), "المصفوفة يجب أن تكون مربعة تماماً");

            // 1. فحص نمط زاوية البداية العلوية اليسرى (Top-Left Finder Pattern)
            Assert.IsTrue(matrix[0, 0], "زاوية المربع العلوي الأيسر يجب أن تكون سوداء");
            Assert.IsTrue(matrix[0, 6], "طرف إطار المربع العلوي الأيسر يجب أن يكون أسود");
            Assert.IsTrue(matrix[6, 0], "طرف إطار المربع السفلي الأيسر يجب أن يكون أسود");
            Assert.IsTrue(matrix[6, 6], "نهاية إطار المربع يجب أن تكون سوداء");

            // النواة الداخلية 3x3
            Assert.IsTrue(matrix[2, 2]);
            Assert.IsTrue(matrix[3, 3]);
            Assert.IsTrue(matrix[4, 4]);

            // الإطار الأبيض العازل 5x5
            Assert.IsFalse(matrix[1, 1]);
            Assert.IsFalse(matrix[1, 5]);
            Assert.IsFalse(matrix[5, 1]);
            Assert.IsFalse(matrix[5, 5]);

            // الفاصل المحيط بمربع التحديد (Separator)
            Assert.IsFalse(matrix[7, 0]);
            Assert.IsFalse(matrix[7, 7]);
            Assert.IsFalse(matrix[0, 7]);

            // 2. فحص نمط التوقيت المتناوب (Timing Patterns)
            for (int i = 8; i < size - 8; i++)
            {
                bool expected = (i % 2 == 0);
                Assert.AreEqual(expected, matrix[6, i], "خط التوقيت الأفقي عند العمود " + i);
                Assert.AreEqual(expected, matrix[i, 6], "خط التوقيت الرأسي عند الصف " + i);
            }

            // 3. النقطة السوداء الثابتة (Dark Module)
            Assert.IsTrue(matrix[size - 8, 8], "النقطة السوداء الإلزامية يجب أن تكون سوداء دائماً");
        }

        [Test]
        public void DrawQrCode_RendersToBitmapWithoutError()
        {
            string url = "https://store.rafiqpos.workers.dev/shop-souq";
            using (var bmp = new Bitmap(200, 200))
            using (var g = Graphics.FromImage(bmp))
            {
                g.Clear(Color.White);
                var rect = new RectangleF(20, 20, 160, 160);
                QrCodeGenerator.DrawQrCode(g, url, rect, 2);

                // التحقق من رسم بكسلات سوداء في المنتصف
                bool hasBlack = false;
                for (int y = 0; y < bmp.Height; y++)
                {
                    for (int x = 0; x < bmp.Width; x++)
                    {
                        Color c = bmp.GetPixel(x, y);
                        if (c.R == 0 && c.G == 0 && c.B == 0)
                        {
                            hasBlack = true;
                            break;
                        }
                    }
                    if (hasBlack) break;
                }
                Assert.IsTrue(hasBlack, "الباركود يجب أن يرسم بكسلات سوداء داخل الصورة");
            }
        }

        [Test]
        public void SettingsService_GetAllSettings_IncludesOnlineStoreReceiptKeys()
        {
            var settingsService = DatabaseService.Settings;
            if (settingsService != null)
            {
                var dict = settingsService.GetAllSettings();
                Assert.IsTrue(dict.ContainsKey("receipt_show_online_store_qr"), "يجب أن يتضمن مفتاح إظهار باركود المتجر");
                Assert.IsTrue(dict.ContainsKey("receipt_online_store_qr_label"), "يجب أن يتضمن مفتاح عنوان باركود المتجر");
                Assert.IsTrue(dict.ContainsKey("receipt_online_store_qr_text"), "يجب أن يتضمن مفتاح نص باركود المتجر");
                Assert.IsTrue(dict.ContainsKey("receipt_online_store_qr_show_url"), "يجب أن يتضمن مفتاح إظهار رابط المتجر");
                Assert.IsTrue(dict.ContainsKey("online_store_enabled"), "يجب أن يتضمن حالة تفعيل المتجر");
                Assert.IsTrue(dict.ContainsKey("online_store_slug"), "يجب أن يتضمن رابط المتجر slug");
            }
        }
    }
}
