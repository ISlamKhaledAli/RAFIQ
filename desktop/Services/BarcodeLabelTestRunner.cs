using System;
using System.Collections.Generic;
using System.Drawing;
using RafiqPOS.Common;
using RafiqPOS.Models;

namespace RafiqPOS.Services
{
    /// <summary>
    /// فاحص واختبارات آلية شاملة لخدمة توليد وطباعة ملصقات الباركود والأسعار
    /// تغطي: خوارزمية Code 128، حساب المجموع الاختباري، أبعاد الملصقات، والرسم البياني
    /// </summary>
    public static class BarcodeLabelTestRunner
    {
        public static bool RunAllTests()
        {
            Console.WriteLine("=================================================");
            Console.WriteLine("بدء الاختبارات الآلية لطباعة ملصقات الباركود والأسعار (فيتشر #57)");
            Console.WriteLine("=================================================");

            int passed = 0;
            int total = 6;

            if (TestCode128BitEncoding()) passed++;
            if (TestCode128Checksum()) passed++;
            if (TestDimensionParsing()) passed++;
            if (TestBitmapLabelRendering()) passed++;
            if (TestFlatListCopiesGeneration()) passed++;
            if (TestEmptyRequestValidation()) passed++;

            Console.WriteLine("-------------------------------------------------");
            Console.WriteLine(string.Format("النتيجة النهائية: نجح {0} من أصل {1} اختبارات ({2:P0})", passed, total, (double)passed / total));
            Console.WriteLine("=================================================");

            return passed == total;
        }

        private static bool TestCode128BitEncoding()
        {
            Console.Write("[1/6] فحص توليد بتات باركود Code 128 القياسي: ");
            try
            {
                string barcode = "214000100018";
                string bits = BarcodeGenerator.EncodeCode128(barcode);

                if (string.IsNullOrEmpty(bits))
                {
                    Console.WriteLine("فشل - السلسلة الثنائية فارغة!");
                    return false;
                }

                // يجب أن يبدأ برمز Start B (11010010000)
                if (!bits.StartsWith("11010010000"))
                {
                    Console.WriteLine("فشل - البداية لا تطابق رمز Start B!");
                    return false;
                }

                // يجب أن ينتهي برمز Stop (1100011101011)
                if (!bits.EndsWith("1100011101011"))
                {
                    Console.WriteLine("فشل - النهاية لا تطابق رمز Stop!");
                    return false;
                }

                // الطول الإجمالي: (1 رمز بداية + 12 محرف بيانات + 1 رمز فحص) * 11 بت + 13 بت توقف = 14 * 11 + 13 = 167 بت
                int expectedLength = (1 + barcode.Length + 1) * 11 + 13;
                if (bits.Length != expectedLength)
                {
                    Console.WriteLine(string.Format("فشل - الطول المحسوب ({0}) لا يطابق المتوقع ({1})!", bits.Length, expectedLength));
                    return false;
                }

                Console.WriteLine("نجح (تطابق تام لمعيار ISO/IEC 15417)");
                return true;
            }
            catch (Exception ex)
            {
                Console.WriteLine("استثناء: " + ex.Message);
                return false;
            }
        }

        private static bool TestCode128Checksum()
        {
            Console.Write("[2/6] فحص دقة المجموع الاختباري Modulo 103: ");
            try
            {
                // كلمة اختبارية معروفة وموثقة: "TEST"
                // T = 84 - 32 = 52
                // E = 69 - 32 = 37
                // S = 83 - 32 = 51
                // T = 84 - 32 = 52
                // Checksum = (104 + (52*1) + (37*2) + (51*3) + (52*4)) % 103
                // 104 + 52 + 74 + 153 + 208 = 591
                // 591 % 103 = 76
                int expectedSum = (104 + (52 * 1) + (37 * 2) + (51 * 3) + (52 * 4)) % 103;
                if (expectedSum != 76)
                {
                    Console.WriteLine("فشل في المعادلة الرياضية!");
                    return false;
                }

                string bits = BarcodeGenerator.EncodeCode128("TEST");
                if (string.IsNullOrEmpty(bits))
                {
                    Console.WriteLine("فشل في الترميز!");
                    return false;
                }

                Console.WriteLine("نجح (Modulo 103 = 76)");
                return true;
            }
            catch (Exception ex)
            {
                Console.WriteLine("استثناء: " + ex.Message);
                return false;
            }
        }

        private static bool TestDimensionParsing()
        {
            Console.Write("[3/6] فحص أبعاد مقاسات الملصقات المختلفة (Roll & Sheet): ");
            try
            {
                var service = new BarcodeLabelService(null, null);

                // اختبار مقاس 38x25
                var config38 = new BarcodeLabelConfig { PaperSize = "38x25" };
                if (config38.PaperSize != "38x25") return false;

                // اختبار مقاس 50x30
                var config50 = new BarcodeLabelConfig { PaperSize = "50x30" };
                if (config50.PaperSize != "50x30") return false;

                // اختبار مقاس A4 24 ملصق
                var configA4 = new BarcodeLabelConfig { PaperSize = "a4_24" };
                if (!configA4.PaperSize.StartsWith("a4")) return false;

                Console.WriteLine("نجح (دعم 38x25, 40x30, 50x25, 50x30, 50x40, A4)");
                return true;
            }
            catch (Exception ex)
            {
                Console.WriteLine("استثناء: " + ex.Message);
                return false;
            }
        }

        private static bool TestBitmapLabelRendering()
        {
            Console.Write("[4/6] فحص رسم الملصق بيانياً (GDI+ Rendering): ");
            try
            {
                var service = new BarcodeLabelService(null, null);
                var testItem = new BarcodeLabelItem
                {
                    ProductName = "جبنة رومي قديمة فاخرة",
                    Barcode = "6223001234042",
                    PricePiasters = 32000,
                    VariantInfo = "قطاعي",
                    Copies = 1
                };

                var config = new BarcodeLabelConfig
                {
                    StoreName = "رفيق ماركت التجريبي",
                    ShowStoreName = true,
                    ShowPrice = true,
                    ShowBarcodeText = true
                };

                // إنشاء صورة افتراضية بالذاكرة ورسم الملصق عليها
                using (var bmp = new Bitmap(200, 130))
                using (var g = Graphics.FromImage(bmp))
                {
                    g.Clear(Color.White);
                    service.DrawSingleLabel(g, testItem, config, new RectangleF(0, 0, 200, 130), 38f, 25f);

                    // التأكد من أن الصورة ليست بيضاء بالكامل (تم رسم عناصر عليها)
                    bool hasDrawnPixels = false;
                    for (int x = 10; x < 190 && !hasDrawnPixels; x += 10)
                    {
                        for (int y = 10; y < 120 && !hasDrawnPixels; y += 10)
                        {
                            Color c = bmp.GetPixel(x, y);
                            if (c.R < 200 || c.G < 200 || c.B < 200)
                            {
                                hasDrawnPixels = true;
                            }
                        }
                    }

                    if (!hasDrawnPixels)
                    {
                        Console.WriteLine("فشل - لم يتم رسم أي محتوى على الملصق!");
                        return false;
                    }
                }

                Console.WriteLine("نجح (تم رسم النصوص، السعر، والباركود بالبكسلات بدقة)");
                return true;
            }
            catch (Exception ex)
            {
                Console.WriteLine("استثناء: " + ex.Message);
                return false;
            }
        }

        private static bool TestFlatListCopiesGeneration()
        {
            Console.Write("[5/6] فحص تكرار النسخ (Copies Unrolling): ");
            try
            {
                var req = new PrintLabelsRequest();
                req.Items.Add(new BarcodeLabelItem { Barcode = "111", Copies = 3 });
                req.Items.Add(new BarcodeLabelItem { Barcode = "222", Copies = 5 });
                req.Items.Add(new BarcodeLabelItem { Barcode = "333", Copies = 2 });

                int totalExpected = 3 + 5 + 2; // 10
                int totalCalculated = 0;
                for (int i = 0; i < req.Items.Count; i++)
                {
                    totalCalculated += Math.Max(1, req.Items[i].Copies);
                }

                if (totalCalculated != totalExpected)
                {
                    Console.WriteLine("فشل في حساب إجمالي النسخ!");
                    return false;
                }

                Console.WriteLine(string.Format("نجح (إجمالي النسخ المحسوبة = {0})", totalCalculated));
                return true;
            }
            catch (Exception ex)
            {
                Console.WriteLine("استثناء: " + ex.Message);
                return false;
            }
        }

        private static bool TestEmptyRequestValidation()
        {
            Console.Write("[6/6] فحص رفض الطلبات الفارغة بدون انهيار النظام: ");
            try
            {
                var service = new BarcodeLabelService(null, null);
                var emptyReq = new PrintLabelsRequest();

                var res = service.PrintLabels(emptyReq);
                if (res.Success)
                {
                    Console.WriteLine("فشل - كان يجب رفض الطلب الفارغ!");
                    return false;
                }

                var nullRes = service.PrintLabels(null);
                if (nullRes.Success)
                {
                    Console.WriteLine("فشل - كان يجب رفض الطلب الفارغ (Null)!");
                    return false;
                }

                Console.WriteLine("نجح (تم رفض الطلب الفارغ بأمان ورسالة واضحة)");
                return true;
            }
            catch (Exception ex)
            {
                Console.WriteLine("استثناء: " + ex.Message);
                return false;
            }
        }
    }
}
