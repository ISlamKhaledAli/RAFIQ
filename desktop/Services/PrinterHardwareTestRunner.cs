using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using RafiqPOS.Common;
using RafiqPOS.Models;

namespace RafiqPOS.Services
{
    public class PrinterHardwareTestResult
    {
        public bool Success { get; set; }
        public int TotalTests { get; set; }
        public int Passed { get; set; }
        public int Failed { get; set; }
        public List<string> Details { get; set; }

        public PrinterHardwareTestResult()
        {
            Details = new List<string>();
        }
    }

    /// <summary>
    /// مدقق ومختبر هاردوير الطابعات الحرارية وأوامر ESC/POS
    /// يختبر طباعة النصوص العربية والباركود ومقاسات الورق (80mm و 57mm)
    /// ونبضات درج النقدية وقص الورق وعزل أخطاء الطابعة عند انقطاع الكابل أو نفاد الورق
    /// متوافق مع .NET Framework 4.8 و C# 5
    /// </summary>
    public static class PrinterHardwareTestRunner
    {
        public static PrinterHardwareTestResult RunAllTests()
        {
            var res = new PrinterHardwareTestResult();

            Action<string, bool, string> assert = delegate(string name, bool condition, string detail)
            {
                res.TotalTests++;
                if (condition)
                {
                    res.Passed++;
                    res.Details.Add("[PASS] " + name + (string.IsNullOrEmpty(detail) ? "" : ": " + detail));
                }
                else
                {
                    res.Failed++;
                    res.Details.Add("[FAIL] " + name + (string.IsNullOrEmpty(detail) ? "" : ": " + detail));
                }
            };

            // -------------------------------------------------------------
            // اختبار 1: توليد وتشفير باركود Code 128 القياسي للفواتير
            // -------------------------------------------------------------
            try
            {
                string invoiceBarcode = "00001001";
                string bits = BarcodeGenerator.EncodeCode128(invoiceBarcode);

                assert("Barcode_Encode_NotEmpty", !string.IsNullOrEmpty(bits), "طول البتات: " + (bits != null ? bits.Length : 0));
                // Code 128 subset B: 11 (Start) + 8*11 (Chars) + 11 (Checksum) + 13 (Stop) = 123 bits
                assert("Barcode_BitLength_Valid", bits != null && bits.Length == 123, "طول سلسلة بتات الباركود 123 بت متوافق مع ISO 15417");

                // رسم الباركود في مستطيل رسومي دون استثناءات
                using (var bmp = new Bitmap(280, 50))
                using (var g = Graphics.FromImage(bmp))
                {
                    BarcodeGenerator.DrawBarcode(g, invoiceBarcode, new RectangleF(10, 5, 260, 40), true);
                    assert("Barcode_Render_NoException", true, "تم رسم الباركود بيانياً بنجاح");
                }
            }
            catch (Exception ex)
            {
                assert("Barcode_Generation_Exception", false, ex.Message);
            }

            // -------------------------------------------------------------
            // اختبار 2: دعم مقاسات الورق (80mm و 57mm/58mm) وتناسق الأبعاد
            // -------------------------------------------------------------
            try
            {
                assert("Paper_57mm_Detection", PrinterService.IsCompactPaper("57mm"), "كشف مقاس 57mm");
                assert("Paper_58mm_Detection", PrinterService.IsCompactPaper("58mm"), "كشف مقاس 58mm كمرادف");
                assert("Paper_80mm_Detection", !PrinterService.IsCompactPaper("80mm"), "كشف مقاس 80mm القياسي");

                int width80 = PrinterService.GetContentWidthPoints("80mm");
                int width57 = PrinterService.GetContentWidthPoints("57mm");

                assert("Paper_80mm_Width", width80 == 285, "عرض 80mm هو 285 نقطة");
                assert("Paper_57mm_Width", width57 == 190, "عرض 57mm هو 190 نقطة");
            }
            catch (Exception ex)
            {
                assert("Paper_Dimensions_Exception", false, ex.Message);
            }

            // -------------------------------------------------------------
            // اختبار 3: كشف طابعات الشبكة (TCP Port 9100) وطابعات USB Spooler
            // -------------------------------------------------------------
            try
            {
                assert("Network_Printer_IP_Only", RawPrinterHelper.IsNetworkPrinter("192.168.1.150"), "كشف عنوان IP منفرد");
                assert("Network_Printer_IP_Port", RawPrinterHelper.IsNetworkPrinter("192.168.1.150:9100"), "كشف عنوان IP مع منفذ 9100");
                assert("USB_Printer_Name", !RawPrinterHelper.IsNetworkPrinter("POS-80C Thermal Printer"), "كشف طابعة USB محلية");
                assert("USB_Printer_Shared", !RawPrinterHelper.IsNetworkPrinter(@"\\SERVER\ReceiptPrinter"), "كشف طابعة مشاركة");
            }
            catch (Exception ex)
            {
                assert("Printer_Type_Detection_Exception", false, ex.Message);
            }

            // -------------------------------------------------------------
            // اختبار 4: أمان نبضات فتح درج النقدية وقص الورق التلقائي (ESC/POS)
            // -------------------------------------------------------------
            try
            {
                string kickErr;
                // اختبار إرسال نبضة لاسم فارغ للتأكد من المعالجة بدون استثناء
                bool kickEmpty = RawPrinterHelper.SendDrawerKick("", out kickErr);
                assert("Drawer_Kick_Empty_Safe", !kickEmpty && !string.IsNullOrEmpty(kickErr), "معالجة هادئة لاسم طابعة فارغ: " + kickErr);

                string cutErr;
                bool cutEmpty = RawPrinterHelper.SendPaperCut("", out cutErr);
                assert("Paper_Cut_Empty_Safe", !cutEmpty && !string.IsNullOrEmpty(cutErr), "معالجة هادئة لقص الورق عند غياب الطابعة: " + cutErr);
            }
            catch (Exception ex)
            {
                assert("Drawer_Cut_Safety_Exception", false, ex.Message);
            }

            // -------------------------------------------------------------
            // اختبار 5: عزل الأخطاء لسيناريو الطابعة غير المتصلة أو انقطاع الكابل
            // -------------------------------------------------------------
            try
            {
                var settingsRepo = new Repositories.SettingsRepository(DatabaseService.ConnectionString);
                var settings = new SettingsService(settingsRepo);
                var printerService = new PrinterService(settings);

                var testSale = new Sale
                {
                    Id = "sale_offline_test",
                    InvoiceNumber = 9999,
                    CreatedAt = DateTime.UtcNow.ToString("o"),
                    CashierId = "كاشير تجريبي",
                    PaymentMethod = "cash",
                    SubtotalPiasters = 5000,
                    TotalPiasters = 5000,
                    PaidPiasters = 5000,
                    Items = new List<SaleItem>
                    {
                        new SaleItem { ProductName = "صنف اختبار هاردوير", QuantityMilli = 1000, UnitPricePiasters = 5000, TotalPiasters = 5000, Unit = "piece" }
                    }
                };

                // إرسال أمر طباعة لطابعة وهمية غير متصلة
                var printResult = printerService.PrintSaleReceipt(testSale, "NON_EXISTENT_HARDWARE_PRINTER_TEST_XYZ", "80mm");

                // يجب أن يعود بفشل نظيف دون أي تجميد للنظام وبدون رمي استثناءات
                assert("Offline_Printer_Handled_Gracefully", !printResult.Success, "تم عزل خطأ الطابعة بنجاح: Success = false");
                assert("Offline_Printer_Arabic_Message", !string.IsNullOrEmpty(printResult.Message) && printResult.Message.Contains("غير"), "رسالة عربية واضحة للمستخدم: " + printResult.Message);
            }
            catch (Exception ex)
            {
                assert("Offline_Printer_Exception", false, ex.Message);
            }

            // -------------------------------------------------------------
            // اختبار 6: رسم الإيصال بالكامل لكلا المقاسين (80mm و 57mm) بدقة 203 DPI
            // -------------------------------------------------------------
            try
            {
                var settingsRepo = new Repositories.SettingsRepository(DatabaseService.ConnectionString);
                var settings = new SettingsService(settingsRepo);
                var printerService = new PrinterService(settings);

                var testSale = new Sale
                {
                    Id = "sale_full_render_test",
                    InvoiceNumber = 1002,
                    CreatedAt = DateTime.UtcNow.ToString("o"),
                    CashierId = "كاشير تجريبي",
                    PaymentMethod = "cash",
                    SubtotalPiasters = 12500,
                    DiscountPiasters = 500,
                    TaxPiasters = 1680,
                    TotalPiasters = 13680,
                    PaidPiasters = 15000,
                    ChangePiasters = 1320,
                    Notes = "ملاحظات الفاتورة: تم الدفع نقداً",
                    Items = new List<SaleItem>
                    {
                        new SaleItem { ProductName = "شاي العروسة ناعم 250 جم", QuantityMilli = 3000, UnitPricePiasters = 3500, TotalPiasters = 10500, Unit = "piece" },
                        new SaleItem { ProductName = "جبنة رومي قديمة بالوزن", QuantityMilli = 250, UnitPricePiasters = 16400, TotalPiasters = 4100, Unit = "kg" },
                        new SaleItem { ProductName = "كرتونة مياه معدنية 12 زجاجة", QuantityMilli = 500, UnitPricePiasters = 6000, TotalPiasters = 3000, Unit = "piece", UnitName = "نصف كرتونة" }
                    }
                };

                // اختبار مقاس 80mm
                using (var bmp80 = printerService.RenderReceiptToBitmap(testSale, "80mm", false))
                {
                    assert("RenderReceipt_80mm_NotNull", bmp80 != null, "توليد صورة إيصال 80mm");
                    assert("RenderReceipt_80mm_Width_576px", bmp80 != null && bmp80.Width == 576, "عرض صورة 80mm يطابق 576 نقطة حرارية (203 DPI)");
                    assert("RenderReceipt_80mm_Height_Valid", bmp80 != null && bmp80.Height > 200, "ارتفاع مناسب لمحتويات الإيصال: " + (bmp80 != null ? bmp80.Height : 0) + "px");
                }

                // اختبار مقاس 57mm مع علامة نسخة طبق الأصل
                using (var bmp57 = printerService.RenderReceiptToBitmap(testSale, "57mm", true))
                {
                    assert("RenderReceipt_57mm_NotNull", bmp57 != null, "توليد صورة إيصال 57mm مضغوط");
                    assert("RenderReceipt_57mm_Width_384px", bmp57 != null && bmp57.Width == 384, "عرض صورة 57mm يطابق 384 نقطة حرارية (203 DPI)");
                    assert("RenderReceipt_57mm_Height_Valid", bmp57 != null && bmp57.Height > 200, "ارتفاع مناسب لمحتويات الإيصال 57mm: " + (bmp57 != null ? bmp57.Height : 0) + "px");
                }
            }
            catch (Exception ex)
            {
                assert("Full_Render_Exception", false, ex.Message);
            }

            // -------------------------------------------------------------
            // اختبار 7: توليد أوامر ESC/POS النقطية (GS v 0 Raster Commands)
            // -------------------------------------------------------------
            try
            {
                using (var testBmp = new Bitmap(576, 200))
                using (var g = Graphics.FromImage(testBmp))
                {
                    g.Clear(Color.White);
                    // رسم خط أسود لاختبار عتبة التحويل النقطي
                    g.FillRectangle(Brushes.Black, new Rectangle(0, 50, 576, 20));

                    // تحويل الصورة مع نبضة الدرج وقص الورق
                    byte[] rasterBytes = RawPrinterHelper.ConvertBitmapToEscPosRaster(testBmp, kickDrawer: true, autoCut: true);

                    assert("EscPos_Raster_NotEmpty", rasterBytes != null && rasterBytes.Length > 0, "مصفوفة أوامر ESC/POS غير فارغة: " + (rasterBytes != null ? rasterBytes.Length : 0) + " بايت");

                    // فحص أمر التهيئة ESC @ (0x1B, 0x40)
                    bool hasInit = rasterBytes != null && rasterBytes.Length > 2 && rasterBytes[0] == 0x1B && rasterBytes[1] == 0x40;
                    assert("EscPos_Init_Command", hasInit, "بدء البيانات بأمر التهيئة ESC @");

                    // فحص أمر نبضة الدرج في البداية ESC p 0 (0x1B, 0x70)
                    bool hasDrawerKick = false;
                    for (int i = 0; i < Math.Min(30, rasterBytes != null ? rasterBytes.Length - 4 : 0); i++)
                    {
                        if (rasterBytes[i] == 0x1B && rasterBytes[i + 1] == 0x70)
                        {
                            hasDrawerKick = true;
                            break;
                        }
                    }
                    assert("EscPos_Drawer_Kick_Included", hasDrawerKick, "تضمين نبضة فتح درج النقدية المادي القياسية");

                    // فحص أمر الطباعة النقطية GS v 0 (0x1D, 0x76, 0x30)
                    bool hasRasterCmd = false;
                    for (int i = 0; i < (rasterBytes != null ? rasterBytes.Length - 4 : 0); i++)
                    {
                        if (rasterBytes[i] == 0x1D && rasterBytes[i + 1] == 0x76 && rasterBytes[i + 2] == 0x30)
                        {
                            hasRasterCmd = true;
                            break;
                        }
                    }
                    assert("EscPos_Raster_GS_v_0_Present", hasRasterCmd, "تضمين أمر GS v 0 القياسي للطباعة النقطية بدون تشويه خطوط");

                    // فحص أمر قص الورق GS V (0x1D, 0x56)
                    bool hasCutCmd = false;
                    int startCheck = Math.Max(0, (rasterBytes != null ? rasterBytes.Length : 0) - 20);
                    for (int i = startCheck; i < (rasterBytes != null ? rasterBytes.Length - 2 : 0); i++)
                    {
                        if (rasterBytes[i] == 0x1D && rasterBytes[i + 1] == 0x56)
                        {
                            hasCutCmd = true;
                            break;
                        }
                    }
                    assert("EscPos_Cut_Command_Present", hasCutCmd, "تضمين أمر قص الورق التلقائي في نهاية الإيصال");
                }
            }
            catch (Exception ex)
            {
                assert("EscPos_Raster_Exception", false, ex.Message);
            }

            // -------------------------------------------------------------
            // اختبار 8: عزل أخطاء طابعات الشبكة (TCP Port 9100) وسرعة الاستجابة
            // -------------------------------------------------------------
            try
            {
                var settingsRepo = new Repositories.SettingsRepository(DatabaseService.ConnectionString);
                var settings = new SettingsService(settingsRepo);
                var printerService = new PrinterService(settings);

                var networkSale = new Sale
                {
                    Id = "sale_network_test",
                    InvoiceNumber = 1003,
                    CreatedAt = DateTime.UtcNow.ToString("o"),
                    CashierId = "كاشير تجريبي",
                    PaymentMethod = "cash",
                    SubtotalPiasters = 5000,
                    TotalPiasters = 5000,
                    PaidPiasters = 5000,
                    Items = new List<SaleItem>
                    {
                        new SaleItem { ProductName = "صنف شبكة تجريبي", QuantityMilli = 1000, UnitPricePiasters = 5000, TotalPiasters = 5000, Unit = "piece" }
                    }
                };

                // عنوان IP محلي غير مستجيب لاختبار مهلة الاتصال والعزل الهادئ
                var sw = System.Diagnostics.Stopwatch.StartNew();
                var netResult = printerService.PrintSaleReceipt(networkSale, "192.168.254.254:9100", "80mm");
                sw.Stop();

                assert("Network_Timeout_Fast", sw.ElapsedMilliseconds < 3500, "استجابة سريعة لمهلة الطابعة الشبكية دون تجميد النظام: " + sw.ElapsedMilliseconds + "ms");
                assert("Network_Offline_Handled", !netResult.Success, "تم عزل عدم استجابة طابعة الشبكة بنجاح: Success = false");
                assert("Network_Offline_Message_Safe", !string.IsNullOrEmpty(netResult.Message) && netResult.Message.Contains("محفوظة بأمان"), "رسالة واضحة تطمئن المستخدم بحفظ الفاتورة: " + netResult.Message);
            }
            catch (Exception ex)
            {
                assert("Network_Printer_Exception", false, ex.Message);
            }

            res.Success = (res.Failed == 0);
            return res;
        }
    }
}
