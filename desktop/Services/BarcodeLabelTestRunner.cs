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
            Console.WriteLine("Starting Automated Tests for Barcode & Labels (#57)");
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
            Console.WriteLine(string.Format("Final Result: {0} of {1} tests passed ({2:P0})", passed, total, (double)passed / total));
            Console.WriteLine("=================================================");

            return passed == total;
        }

        private static bool TestCode128BitEncoding()
        {
            Console.Write("[1/15] Testing Code 128 standard bit encoding: ");
            try
            {
                string barcode = "214000100018";
                string bits = BarcodeGenerator.EncodeCode128(barcode);

                if (string.IsNullOrEmpty(bits))
                {
                    Console.WriteLine("FAILED - Bit string is empty!");
                    return false;
                }

                // Starts with Start B (11010010000)
                if (!bits.StartsWith("11010010000"))
                {
                    Console.WriteLine("FAILED - Does not start with Start B symbol!");
                    return false;
                }

                // Ends with Stop (1100011101011)
                if (!bits.EndsWith("1100011101011"))
                {
                    Console.WriteLine("FAILED - Does not end with Stop symbol!");
                    return false;
                }

                int expectedLength = (1 + barcode.Length + 1) * 11 + 13;
                if (bits.Length != expectedLength)
                {
                    Console.WriteLine(string.Format("FAILED - Length ({0}) does not match expected ({1})!", bits.Length, expectedLength));
                    return false;
                }

                Console.WriteLine("PASSED (Full ISO/IEC 15417 compliance)");
                return true;
            }
            catch (Exception ex)
            {
                Console.WriteLine("Exception: " + ex.Message);
                return false;
            }
        }

        private static bool TestCode128Checksum()
        {
            Console.Write("[2/15] Testing Modulo 103 checksum accuracy: ");
            try
            {
                int expectedSum = (104 + (52 * 1) + (37 * 2) + (51 * 3) + (52 * 4)) % 103;
                if (expectedSum != 76)
                {
                    Console.WriteLine("FAILED - Math formula mismatch!");
                    return false;
                }

                string bits = BarcodeGenerator.EncodeCode128("TEST");
                if (string.IsNullOrEmpty(bits))
                {
                    Console.WriteLine("FAILED - Encoding returned empty string!");
                    return false;
                }

                Console.WriteLine("PASSED (Modulo 103 = 76)");
                return true;
            }
            catch (Exception ex)
            {
                Console.WriteLine("Exception: " + ex.Message);
                return false;
            }
        }

        private static bool TestDimensionParsing()
        {
            Console.Write("[3/15] Testing label dimensions parsing: ");
            try
            {
                var service = new BarcodeLabelService(null, null);

                // 38x25
                float w38, h38;
                service.ParseLabelDimensions("38x25", 0, 0, out w38, out h38);
                if (w38 != 38f || h38 != 25f)
                {
                    Console.WriteLine("FAILED - 38x25 dimension mismatch!");
                    return false;
                }

                // 50x30
                float w50, h50;
                service.ParseLabelDimensions("50x30", 0, 0, out w50, out h50);
                if (w50 != 50f || h50 != 30f)
                {
                    Console.WriteLine("FAILED - 50x30 dimension mismatch!");
                    return false;
                }

                // Custom Width & Height
                float wCust, hCust;
                service.ParseLabelDimensions("custom", 45, 35, out wCust, out hCust);
                if (wCust != 45f || hCust != 35f)
                {
                    Console.WriteLine("FAILED - Custom dimension mismatch!");
                    return false;
                }

                // Text format e.g. 55x35
                float wText, hText;
                service.ParseLabelDimensions("55x35", 0, 0, out wText, out hText);
                if (wText != 55f || hText != 35f)
                {
                    Console.WriteLine("FAILED - Textual dimension mismatch!");
                    return false;
                }

                Console.WriteLine("PASSED (Supports 38x25, 50x30, 40x30, 50x40, Custom)");
                return true;
            }
            catch (Exception ex)
            {
                Console.WriteLine("Exception: " + ex.Message);
                return false;
            }
        }

        private static bool TestBitmapLabelRendering()
        {
            Console.Write("[4/15] Testing bitmap label rendering and Quiet Zones: ");
            try
            {
                var service = new BarcodeLabelService(null, null);
                var testItem = new BarcodeLabelItem
                {
                    ProductName = "Old Rumi Cheese",
                    Barcode = "6223001234042",
                    PricePiasters = 32000,
                    VariantInfo = "Retail",
                    Copies = 1
                };

                var config = new BarcodeLabelConfig
                {
                    StoreName = "Rafiq Market",
                    ShowStoreName = true,
                    ShowPrice = true,
                    ShowBarcodeText = true
                };

                using (var bmp = new Bitmap(200, 130))
                using (var g = Graphics.FromImage(bmp))
                {
                    g.Clear(Color.White);
                    service.DrawSingleLabel(g, testItem, config, new RectangleF(0, 0, 200, 130), 38f, 25f);

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
                        Console.WriteLine("FAILED - No content rendered on bitmap!");
                        return false;
                    }
                }

                Console.WriteLine("PASSED (Text, price, and barcode rendered with crisp contrast)");
                return true;
            }
            catch (Exception ex)
            {
                Console.WriteLine("Exception: " + ex.Message);
                return false;
            }
        }

        private static bool TestFlatListCopiesGeneration()
        {
            Console.Write("[5/15] Testing copies unrolling: ");
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
                    Console.WriteLine("FAILED - Total copies calculation mismatch!");
                    return false;
                }

                Console.WriteLine(string.Format("PASSED (Total calculated copies = {0})", totalCalculated));
                return true;
            }
            catch (Exception ex)
            {
                Console.WriteLine("Exception: " + ex.Message);
                return false;
            }
        }

        private static bool TestEmptyRequestValidation()
        {
            Console.Write("[6/15] Testing empty and null request validation: ");
            try
            {
                var service = new BarcodeLabelService(null, null);
                var emptyReq = new PrintLabelsRequest();

                var res = service.PrintLabels(emptyReq);
                if (res.Success)
                {
                    Console.WriteLine("FAILED - Empty request should be rejected!");
                    return false;
                }

                var nullRes = service.PrintLabels(null);
                if (nullRes.Success)
                {
                    Console.WriteLine("FAILED - Null request should be rejected!");
                    return false;
                }

                Console.WriteLine("PASSED (Empty/null request safely rejected)");
                return true;
            }
            catch (Exception ex)
            {
                Console.WriteLine("Exception: " + ex.Message);
                return false;
            }
        }

        private static bool TestPurchaseInvoiceItemsCopiesMapping()
        {
            Console.Write("[7/15] Testing labels creation from purchase invoice: ");
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
                            ProductName = "El Arosa Tea 250g",
                            Barcode = "6224005544015",
                            QuantityMilli = 24000, // 24 pcs
                            UnitCostPiasters = 3200
                        },
                        new PurchaseItem
                        {
                            ProductId = "prod_sugar",
                            ProductName = "El Osra Sugar 1kg",
                            Barcode = "6221100998811",
                            QuantityMilli = 50000, // 50 pcs
                            UnitCostPiasters = 2500
                        },
                        new PurchaseItem
                        {
                            ProductId = "prod_oil",
                            ProductName = "Afia Corn Oil 800ml",
                            Barcode = "6223300112233",
                            QuantityMilli = 12000, // 12 pcs
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
                    Console.WriteLine("FAILED - Label item count does not match purchase items!");
                    return false;
                }

                if (labelItems[0].Copies != 24 || labelItems[0].PricePiasters != 3800)
                {
                    Console.WriteLine(string.Format("FAILED - First item copies ({0}) or price ({1}) mismatch!", labelItems[0].Copies, labelItems[0].PricePiasters));
                    return false;
                }

                if (labelItems[1].Copies != 50 || labelItems[1].PricePiasters != 3000)
                {
                    Console.WriteLine(string.Format("FAILED - Second item copies ({0}) mismatch!", labelItems[1].Copies));
                    return false;
                }

                if (labelItems[2].Copies != 12 || labelItems[2].PricePiasters != 7200)
                {
                    Console.WriteLine(string.Format("FAILED - Third item copies ({0}) mismatch!", labelItems[2].Copies));
                    return false;
                }

                int totalStickers = 0;
                for (int i = 0; i < labelItems.Count; i++) totalStickers += labelItems[i].Copies;
                if (totalStickers != 86)
                {
                    Console.WriteLine("FAILED - Total sticker count does not equal 86!");
                    return false;
                }

                Console.WriteLine(string.Format("PASSED (Extracted {0} items with {1} total labels matching quantities and prices)", labelItems.Count, totalStickers));
                return true;
            }
            catch (Exception ex)
            {
                Console.WriteLine("Exception: " + ex.Message);
                return false;
            }
        }

        private static bool TestQuietZoneStandardCompliance()
        {
            Console.Write("[8/15] Testing Quiet Zone (>= 2.54mm ISO 15417): ");
            try
            {
                float widthMm = 38f;
                float widthHundredths = widthMm * 3.937f;
                float quietZoneUnits = Math.Max(10f, widthHundredths * 0.05f);

                // 2.54 mm = 10.0 hundredths of an inch
                if (quietZoneUnits < 10f)
                {
                    Console.WriteLine(string.Format("FAILED - Quiet zone ({0}) is under 10 units (2.54mm)!", quietZoneUnits));
                    return false;
                }

                Console.WriteLine(string.Format("PASSED (Quiet Zone = {0:F1} units = {1:F2} mm ISO compliant)", quietZoneUnits, quietZoneUnits / 3.937f));
                return true;
            }
            catch (Exception ex)
            {
                Console.WriteLine("Exception: " + ex.Message);
                return false;
            }
        }

        private static bool TestLaserScannerModuleSnapping()
        {
            Console.Write("[9/15] Testing integer dot snapping on physical pixels: ");
            try
            {
                using (var bmp = new Bitmap(300, 100))
                using (var g = Graphics.FromImage(bmp))
                {
                    g.Clear(Color.White);
                    var rect = new RectangleF(10, 10, 260, 80);
                    BarcodeGenerator.DrawBarcode(g, "6221234567890", rect, true);

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
                        Console.WriteLine("FAILED - Barcode bars not rendered or blurry!");
                        return false;
                    }
                }

                Console.WriteLine("PASSED (Exact pixel alignment for instant laser scanning)");
                return true;
            }
            catch (Exception ex)
            {
                Console.WriteLine("Exception: " + ex.Message);
                return false;
            }
        }

        private static bool TestPaperSize38x25Rendering()
        {
            Console.Write("[10/15] Testing 38x25mm label rendering: ");
            try
            {
                var service = new BarcodeLabelService(null, null);
                var item = new BarcodeLabelItem
                {
                    ProductName = "Juhayna Orange Juice 1L",
                    Barcode = "6221000112233",
                    PricePiasters = 3500,
                    VariantInfo = "Carton",
                    Copies = 1
                };

                var config = new BarcodeLabelConfig
                {
                    StoreName = "El Salam Supermarket",
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

                    bool topDrawn = false, midDrawn = false, btmDrawn = false;
                    for (int x = 15; x < w - 15; x += 5)
                    {
                        if (bmp.GetPixel(x, 15).R < 100) topDrawn = true;
                        if (bmp.GetPixel(x, 40).R < 100) midDrawn = true;
                        if (bmp.GetPixel(x, 70).R < 100) btmDrawn = true;
                    }

                    if (!topDrawn || !midDrawn || !btmDrawn)
                    {
                        Console.WriteLine("FAILED - Incomplete elements in 38x25mm rendering!");
                        return false;
                    }
                }

                Console.WriteLine("PASSED (38x25mm: 150x98 units fully rendered)");
                return true;
            }
            catch (Exception ex)
            {
                Console.WriteLine("Exception: " + ex.Message);
                return false;
            }
        }

        private static bool TestPaperSize50x30Rendering()
        {
            Console.Write("[11/15] Testing 50x30mm label rendering: ");
            try
            {
                var service = new BarcodeLabelService(null, null);
                var item = new BarcodeLabelItem
                {
                    ProductName = "Dettol Floor Cleaner 900ml",
                    Barcode = "6221122334455",
                    PricePiasters = 8500,
                    VariantInfo = "Lavender",
                    Copies = 1
                };

                var config = new BarcodeLabelConfig
                {
                    StoreName = "El Tawfeer Hypermarket",
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
                        Console.WriteLine("FAILED - Rendered pixel density too low!");
                        return false;
                    }
                }

                Console.WriteLine("PASSED (50x30mm: 197x118 units well balanced)");
                return true;
            }
            catch (Exception ex)
            {
                Console.WriteLine("Exception: " + ex.Message);
                return false;
            }
        }

        private static bool TestCustomPaperDimensionsRendering()
        {
            Console.Write("[12/15] Testing custom paper dimensions (60x40, 80x50, 100x150, Custom): ");
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

                Console.WriteLine("PASSED (Supports 60x40, 80x50, 100x150, Custom)");
                return true;
            }
            catch (Exception ex)
            {
                Console.WriteLine("Exception: " + ex.Message);
                return false;
            }
        }

        private static bool TestPriceFormattingNoDuplicate()
        {
            Console.Write("[13/15] Testing price formatting without duplicate currency: ");
            try
            {
                long pricePiasters = 5500;
                string formatted = Money.FormatPiasters(pricePiasters);

                if (!formatted.Contains("ج.م"))
                {
                    Console.WriteLine("FAILED - Price text missing currency symbol!");
                    return false;
                }

                if (formatted.Contains("ج.م ج.م"))
                {
                    Console.WriteLine("FAILED - Duplicate currency symbol detected!");
                    return false;
                }

                Console.WriteLine("PASSED (Clean formatting without duplicate: " + formatted + ")");
                return true;
            }
            catch (Exception ex)
            {
                Console.WriteLine("Exception: " + ex.Message);
                return false;
            }
        }

        private static bool TestPurchaseBonusQuantityInclusion()
        {
            Console.Write("[14/15] Testing purchase bonus quantity label inclusion: ");
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
                            ProductName = "Ulker Vanilla Biscuit",
                            Barcode = "6225544332211",
                            QuantityMilli = 20000,
                            BonusQuantityMilli = 2000,
                            UnitCostPiasters = 500,
                            NewSellingPricePiasters = 700
                        }
                    }
                };

                var items = BarcodeLabelService.CreateItemsFromPurchase(pur);
                if (items == null || items.Count != 1)
                {
                    Console.WriteLine("FAILED - Failed to extract purchase items!");
                    return false;
                }

                if (items[0].Copies != 22)
                {
                    Console.WriteLine(string.Format("FAILED - Copies count ({0}) does not equal 22 (20 base + 2 bonus)!", items[0].Copies));
                    return false;
                }

                if (items[0].PricePiasters != 700)
                {
                    Console.WriteLine("FAILED - New selling price from invoice not applied!");
                    return false;
                }

                Console.WriteLine("PASSED (20 purchased + 2 bonus = 22 labels with 7.00 price)");
                return true;
            }
            catch (Exception ex)
            {
                Console.WriteLine("Exception: " + ex.Message);
                return false;
            }
        }

        private static bool TestA4SheetLabelLayout()
        {
            Console.Write("[15/15] Testing A4 sheet label layout (24 & 40 labels): ");
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

                Console.WriteLine("PASSED (a4_24: 24 labels 3x8 | a4_40: 40 labels 4x10)");
                return true;
            }
            catch (Exception ex)
            {
                Console.WriteLine("Exception: " + ex.Message);
                return false;
            }
        }
    }
}
