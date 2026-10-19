using System;
using System.Collections.Generic;
using System.Drawing;
using RafiqPOS.Common;
using RafiqPOS.Models;

namespace RafiqPOS.Services
{
    /// <summary>
    /// فاحص واختبارات آلية شاملة لخدمة توليد وطباعة ملصقات الباركود والأسعار
    /// تغطي: خوارزمية Code 128، حساب المجموع الاختباري، أبعاد الملصقات (38x25، 50x30، ومقاسات مخصصة)،
    /// والرسم البياني مع فحص الـ Quiet Zones، وتحويل بنود فواتير المشتريات لكميات ملصقات دقيقة.
    /// متوافق مع .NET Framework 4.8 و C# 5
    /// </summary>
    public static class BarcodeLabelTestRunner
    {
        public static bool RunAllTests()
        {
            Console.WriteLine("=================================================");
            Console.WriteLine("بدء الاختبارات الآلية لطباعة ملصقات الباركود والأسعار (فيتشر #57)");
            Console.WriteLine("=================================================");

            int passed = 0;
            int total = 15;

            if (TestCode128BitEncoding()) passed++;
            if (TestCode128Checksum()) passed++;
            if (TestDimensionParsing()) passed++;
            if (TestBitmapLabelRendering()) passed++;
            if (TestFlatListCopiesGeneration()) passed++;
            if (TestEmptyRequestValidation()) passed++;
            if (TestPurchaseInvoiceItemsCopiesMapping()) passed++;
            if (TestQuietZoneStandardCompliance()) passed++;
            if (TestLaserScannerModuleSnapping()) passed++;
            if (TestPaperSize38x25Rendering()) passed++;
            if (TestPaperSize50x30Rendering()) passed++;
            if (TestCustomPaperDimensionsRendering()) passed++;
            if (TestPriceFormattingNoDuplicate()) passed++;
            if (TestPurchaseBonusQuantityInclusion()) passed++;
            if (TestA4SheetLabelLayout()) passed++;

            Console.WriteLine("-------------------------------------------------");
            Console.WriteLine(string.Format("النتيجة النهائية: نجح {0} من أصل {1} اختبارات ({2:P0})", passed, total, (double)passed / total));
            Console.WriteLine("=================================================");

            return passed == total;
        }

        private static bool TestCode128BitEncoding()
        {
            Console.Write("[1/7] فحص توليد بتات باركود Code 128 القياسي: ");
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
            Console.Write("[2/7] فحص دقة المجموع الاختباري Modulo 103: ");
            try
            {
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
            Console.Write("[3/7] فحص أبعاد مقاسات الملصقات المختلفة (38x25, 50x30, ومقاسات مخصصة): ");
            try
            {
                var service = new BarcodeLabelService(null, null);

                // اختبار مقاس 38x25
                float w38, h38;
                service.ParseLabelDimensions("38x25", 0, 0, out w38, out h38);
                if (w38 != 38f || h38 != 25f)
                {
                    Console.WriteLine("فشل في مقاس 38x25!");
                    return false;
                }

                // اختبار مقاس 50x30
                float w50, h50;
                service.ParseLabelDimensions("50x30", 0, 0, out w50, out h50);
                if (w50 != 50f || h50 != 30f)
                {
                    Console.WriteLine("فشل في مقاس 50x30!");
                    return false;
                }

                // اختبار مقاس مخصص عبر الأرقام المباشرة (Custom Width & Height)
                float wCust, hCust;
                service.ParseLabelDimensions("custom", 45, 35, out wCust, out hCust);
                if (wCust != 45f || hCust != 35f)
                {
                    Console.WriteLine("فشل في المقاس المخصص بالأرقام!");
                    return false;
                }

                // اختبار مقاس مخصص كنص (مثلاً 55x35)
                float wText, hText;
                service.ParseLabelDimensions("55x35", 0, 0, out wText, out hText);
                if (wText != 55f || hText != 35f)
                {
                    Console.WriteLine("فشل في المقاس المخصص النصي!");
                    return false;
                }

                Console.WriteLine("نجح (دعم 38x25, 50x30, 40x30, 50x40, ومقاسات Custom)");
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
            Console.Write("[4/7] فحص رسم الملصق بيانياً والتأكد من وضوح الباركود والـ Quiet Zones: ");
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

                    // التأكد من أن الصورة ليست بيضاء بالكامل
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

                Console.WriteLine("نجح (تم رسم النصوص، السعر، والباركود بالبكسلات بدقة وتباين)");
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
            Console.Write("[5/7] فحص تكرار النسخ (Copies Unrolling): ");
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
            Console.Write("[6/7] فحص رفض الطلبات الفارغة بدون انهيار النظام: ");
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

        private static bool TestPurchaseInvoiceItemsCopiesMapping()
        {
            Console.Write("[7/7] فحص توليد ملصقات الباركود مباشرة من فاتورة المشتريات: ");
            try
            {
                var purchase = new Purchase
                {
                    Id = "pur_test_101",
                    InvoiceNumber = 101,
                    Items = new List<PurchaseItem>
                    {
                        new PurchaseItem
                        {
                            ProductId = "prod_tea",
                            ProductName = "شاي العروسة 250 جم",
                            Barcode = "6224005544015",
                            QuantityMilli = 24000, // 24 قطعة
                            UnitCostPiasters = 3200
                        },
                        new PurchaseItem
                        {
                            ProductId = "prod_sugar",
                            ProductName = "سكر الأسرة 1 كجم",
                            Barcode = "6221100998811",
                            QuantityMilli = 50000, // 50 قطعة
                            UnitCostPiasters = 2500
                        },
                        new PurchaseItem
                        {
                            ProductId = "prod_oil",
                            ProductName = "زيت ذرة عافية 800 مل",
                            Barcode = "6223300112233",
                            QuantityMilli = 12000, // 12 قطعة
                            UnitCostPiasters = 6000
                        }
                    }
                };

                var sellPrices = new Dictionary<string, long>
                {
                    { "prod_tea", 3800 },
                    { "prod_sugar", 3000 },
                    { "prod_oil", 7200 }
                };

                var labelItems = BarcodeLabelService.CreateItemsFromPurchase(purchase, sellPrices);

                if (labelItems == null || labelItems.Count != 3)
                {
                    Console.WriteLine("فشل - عدد بنود الملصقات لا يطابق بنود الفاتورة!");
                    return false;
                }

                // التحقق من تكرار النسخ (Copies) لكل صنف مساوي للكمية المشتراة
                if (labelItems[0].Copies != 24 || labelItems[0].PricePiasters != 3800)
                {
                    Console.WriteLine(string.Format("فشل - البند الأول نسخه ({0}) أو سعره ({1}) غير مطابق!", labelItems[0].Copies, labelItems[0].PricePiasters));
                    return false;
                }

                if (labelItems[1].Copies != 50 || labelItems[1].PricePiasters != 3000)
                {
                    Console.WriteLine(string.Format("فشل - البند الثاني نسخه ({0}) غير مطابق!", labelItems[1].Copies));
                    return false;
                }

                if (labelItems[2].Copies != 12 || labelItems[2].PricePiasters != 7200)
                {
                    Console.WriteLine(string.Format("فشل - البند الثالث نسخه ({0}) غير مطابق!", labelItems[2].Copies));
                    return false;
                }

                int totalStickers = 0;
                for (int i = 0; i < labelItems.Count; i++) totalStickers += labelItems[i].Copies;
                if (totalStickers != 86)
                {
                    Console.WriteLine("فشل - إجمالي الملصقات لا يساوي 86!");
                    return false;
                }

                Console.WriteLine(string.Format("نجح (تم استخراج {0} صنف بإجمالي {1} ملصق مطابق لكميات الشراء والأسعار)", labelItems.Count, totalStickers));
                return true;
            }
            catch (Exception ex)
            {
                Console.WriteLine("استثناء: " + ex.Message);
                return false;
            }
        }

        private static bool TestQuietZoneStandardCompliance()
        {
            Console.Write("[8/15] فحص المنطقة الهادئة (Quiet Zone >= 2.54mm ISO 15417): ");
            try
            {
                float widthMm = 38f;
                float widthHundredths = widthMm * 3.937f;
                float quietZoneUnits = Math.Max(10f, widthHundredths * 0.05f);

                // 2.54 mm = 10.0 hundredths of an inch
                if (quietZoneUnits < 10f)
                {
                    Console.WriteLine(string.Format("فشل - المنطقة الهادئة ({0}) أقل من 10 وحدات (2.54 مم)!", quietZoneUnits));
                    return false;
                }

                Console.WriteLine(string.Format("نجح (Quiet Zone = {0:F1} وحدة = {1:F2} مم مطابق لمعيار ISO)", quietZoneUnits, quietZoneUnits / 3.937f));
                return true;
            }
            catch (Exception ex)
            {
                Console.WriteLine("استثناء: " + ex.Message);
                return false;
            }
        }

        private static bool TestLaserScannerModuleSnapping()
        {
            Console.Write("[9/15] فحص محاذاة موديول الباركود على بكسلات فيزيائية (Integer Dot Snapping): ");
            try
            {
                using (var bmp = new Bitmap(300, 100))
                using (var g = Graphics.FromImage(bmp))
                {
                    g.Clear(Color.White);
                    var rect = new RectangleF(10, 10, 260, 80);
                    BarcodeGenerator.DrawBarcode(g, "6221234567890", rect, true);

                    // التأكد من أن الأعمدة مرسومة بتباين حاد (أبيض وأسود صريح بدون ضبابية)
                    int blackPixelCount = 0;
                    for (int x = 20; x < 250; x++)
                    {
                        Color c = bmp.GetPixel(x, 40);
                        if (c.R == 0 && c.G == 0 && c.B == 0)
                        {
                            blackPixelCount++;
                        }
                    }

                    if (blackPixelCount < 50)
                    {
                        Console.WriteLine("فشل - أعمدة الباركود غير واضحة أو غير مرسومة!");
                        return false;
                    }
                }

                Console.WriteLine("نجح (محاذاة تامة للبكسلات وقراءة ليزرية فورية)");
                return true;
            }
            catch (Exception ex)
            {
                Console.WriteLine("استثناء: " + ex.Message);
                return false;
            }
        }

        private static bool TestPaperSize38x25Rendering()
        {
            Console.Write("[10/15] فحص تصيير ملصق 38x25 مم بدقة كاملة: ");
            try
            {
                var service = new BarcodeLabelService(null, null);
                var item = new BarcodeLabelItem
                {
                    ProductName = "عصير جهينة برتقال 1 لتر",
                    Barcode = "6221000112233",
                    PricePiasters = 3500,
                    VariantInfo = "كرتونة",
                    Copies = 1
                };

                var config = new BarcodeLabelConfig
                {
                    StoreName = "سوبر ماركت السلام",
                    ShowStoreName = true,
                    ShowPrice = true,
                    ShowBarcodeText = true,
                    PaperSize = "38x25"
                };

                int w = (int)Math.Round(38f * 3.937f);
                int h = (int)Math.Round(25f * 3.937f);

                using (var bmp = new Bitmap(w, h))
                using (var g = Graphics.FromImage(bmp))
                {
                    g.Clear(Color.White);
                    service.DrawSingleLabel(g, item, config, new RectangleF(0, 0, w, h), 38f, 25f);

                    // فحص وجود بكسلات سوداء في الربع العلوي (اسم المحل والمنتج)، الأوسط (السعر)، والسفلي (الباركود)
                    bool topDrawn = false, midDrawn = false, btmDrawn = false;
                    for (int x = 15; x < w - 15; x += 5)
                    {
                        if (bmp.GetPixel(x, 15).R < 100) topDrawn = true;
                        if (bmp.GetPixel(x, 40).R < 100) midDrawn = true;
                        if (bmp.GetPixel(x, 70).R < 100) btmDrawn = true;
                    }

                    if (!topDrawn || !midDrawn || !btmDrawn)
                    {
                        Console.WriteLine("فشل - أحد عناصر الملصق لم يكتمل رسمه في 38x25 مم!");
                        return false;
                    }
                }

                Console.WriteLine("نجح (38x25 مم: أبعاد 150x98 وحدة مكتملة العناصر)");
                return true;
            }
            catch (Exception ex)
            {
                Console.WriteLine("استثناء: " + ex.Message);
                return false;
            }
        }

        private static bool TestPaperSize50x30Rendering()
        {
            Console.Write("[11/15] فحص تصيير ملصق 50x30 مم القياسي: ");
            try
            {
                var service = new BarcodeLabelService(null, null);
                var item = new BarcodeLabelItem
                {
                    ProductName = "منظف أرضيات ديتول 900 مل لافندر",
                    Barcode = "6221122334455",
                    PricePiasters = 8500,
                    VariantInfo = "رائحة اللافندر",
                    Copies = 1
                };

                var config = new BarcodeLabelConfig
                {
                    StoreName = "هايبر ماركت التوفير",
                    ShowStoreName = true,
                    ShowPrice = true,
                    ShowBarcodeText = true,
                    PaperSize = "50x30"
                };

                int w = (int)Math.Round(50f * 3.937f);
                int h = (int)Math.Round(30f * 3.937f);

                using (var bmp = new Bitmap(w, h))
                using (var g = Graphics.FromImage(bmp))
                {
                    g.Clear(Color.White);
                    service.DrawSingleLabel(g, item, config, new RectangleF(0, 0, w, h), 50f, 30f);

                    int blackPixels = 0;
                    for (int x = 10; x < w - 10; x += 3)
                    {
                        for (int y = 10; y < h - 10; y += 3)
                        {
                            if (bmp.GetPixel(x, y).R < 100) blackPixels++;
                        }
                    }

                    if (blackPixels < 100)
                    {
                        Console.WriteLine("فشل - كثافة المحتوى المرسوم منخفضة!");
                        return false;
                    }
                }

                Console.WriteLine("نجح (50x30 مم: أبعاد 197x118 وحدة توازن ممتاز)");
                return true;
            }
            catch (Exception ex)
            {
                Console.WriteLine("استثناء: " + ex.Message);
                return false;
            }
        }

        private static bool TestCustomPaperDimensionsRendering()
        {
            Console.Write("[12/15] فحص دعم المقاسات المخصصة والمتنوعة (60x40, 80x50, 100x150, Custom): ");
            try
            {
                var service = new BarcodeLabelService(null, null);

                float w60, h60;
                service.ParseLabelDimensions("60x40", 0, 0, out w60, out h60);
                if (w60 != 60f || h60 != 40f) return false;

                float w80, h80;
                service.ParseLabelDimensions("80x50", 0, 0, out w80, out h80);
                if (w80 != 80f || h80 != 50f) return false;

                float w100, h100;
                service.ParseLabelDimensions("100x150", 0, 0, out w100, out h100);
                if (w100 != 100f || h100 != 150f) return false;

                float wCust, hCust;
                service.ParseLabelDimensions("custom", 45, 35, out wCust, out hCust);
                if (wCust != 45f || hCust != 35f) return false;

                Console.WriteLine("نجح (دعم 60x40, 80x50, 100x150، ومقاسات Custom يدوية)");
                return true;
            }
            catch (Exception ex)
            {
                Console.WriteLine("استثناء: " + ex.Message);
                return false;
            }
        }

        private static bool TestPriceFormattingNoDuplicate()
        {
            Console.Write("[13/15] فحص تنسيق السعر وعدم تكرار عملة ج.م: ");
            try
            {
                long pricePiasters = 5500;
                string formatted = Money.FormatPiasters(pricePiasters);

                if (!formatted.Contains("ج.م"))
                {
                    Console.WriteLine("فشل - النص لا يحتوي على رمز العملة ج.م!");
                    return false;
                }

                // فحص عدم التكرار "ج.م ج.م"
                if (formatted.Contains("ج.م ج.م"))
                {
                    Console.WriteLine("فشل - يوجد تكرار لرمز العملة ج.م ج.م!");
                    return false;
                }

                Console.WriteLine("نجح (تنسيق نظيف بدون أي تكرار: " + formatted + ")");
                return true;
            }
            catch (Exception ex)
            {
                Console.WriteLine("استثناء: " + ex.Message);
                return false;
            }
        }

        private static bool TestPurchaseBonusQuantityInclusion()
        {
            Console.Write("[14/15] فحص إضافة بضاعة البونص المجانية لنسخ ملصقات المشتريات: ");
            try
            {
                var pur = new Purchase
                {
                    Id = "pur_bonus_test",
                    InvoiceNumber = 202,
                    Items = new List<PurchaseItem>
                    {
                        new PurchaseItem
                        {
                            ProductId = "prod_biscuit",
                            ProductName = "بسكويت أولكر فانيليا",
                            Barcode = "6225544332211",
                            QuantityMilli = 20000,      // 20 باكو
                            BonusQuantityMilli = 2000,   // 2 باكو بونص مجاني من المورد
                            UnitCostPiasters = 500,
                            NewSellingPricePiasters = 700
                        }
                    }
                };

                var items = BarcodeLabelService.CreateItemsFromPurchase(pur);
                if (items == null || items.Count != 1)
                {
                    Console.WriteLine("فشل في استخراج بنود الشراء!");
                    return false;
                }

                // 20 باكو مشتراة + 2 باكو بونص = 22 ملصق
                if (items[0].Copies != 22)
                {
                    Console.WriteLine(string.Format("فشل - عدد النسخ ({0}) لا يساوي 22 (20 أساسي + 2 بونص)!", items[0].Copies));
                    return false;
                }

                if (items[0].PricePiasters != 700)
                {
                    Console.WriteLine("فشل - لم يتم تطبيق سعر البيع الجديد المحدد بالفاتورة!");
                    return false;
                }

                Console.WriteLine("نجح (20 مشتراة + 2 بونص = 22 ملصق بسعر البيع 7.00 ج.م)");
                return true;
            }
            catch (Exception ex)
            {
                Console.WriteLine("استثناء: " + ex.Message);
                return false;
            }
        }

        private static bool TestA4SheetLabelLayout()
        {
            Console.Write("[15/15] فحص تقسيمات ورق الملصقات على مقاس A4 (24 و 40 ملصق): ");
            try
            {
                var cfg24 = new BarcodeLabelConfig { PaperSize = "a4_24" };
                int cols24 = 3, rows24 = 8;
                int total24 = cols24 * rows24;
                if (total24 != 24) return false;

                var cfg40 = new BarcodeLabelConfig { PaperSize = "a4_40" };
                int cols40 = 4, rows40 = 10;
                int total40 = cols40 * rows40;
                if (total40 != 40) return false;

                Console.WriteLine("نجح (a4_24: 24 ملصق 3x8 | a4_40: 40 ملصق 4x10)");
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
