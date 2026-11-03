using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Printing;
using System.Drawing.Text;
using System.IO;
using RafiqPOS.Common;
using RafiqPOS.Models;
using Newtonsoft.Json;

namespace RafiqPOS.Services
{
    public class PrinterInfo
    {
        public string Name { get; set; }
        public bool IsDefault { get; set; }
        public bool IsOnline { get; set; }
    }

    public class PrintResult
    {
        public bool Success { get; set; }
        public string Message { get; set; }
        public string PrinterUsed { get; set; }
    }

    /// <summary>
    /// محرك الطباعة الحرارية وأوامر ESC/POS لنظام رفيق
    /// يدعم طابعات الإيصالات USB والشبكية (80mm و 57mm) مع طباعة الحروف العربية والباركود والشعار
    /// ونبضة فتح درج النقدية وقص الورق التلقائي وعزل أعطال الطابعة دون تجميد النظام
    /// متوافق مع .NET Framework 4.8 و C# 5 وأنظمة ويندوز 7 SP1 حتى 11
    /// </summary>
    public partial class PrinterService
    {
        private readonly SettingsService _settings;

        public PrinterService(SettingsService settings)
        {
            _settings = settings;
        }

        /// <summary>
        /// الحصول على قائمة الطابعات المثبتة في نظام ويندوز
        /// </summary>
        public List<PrinterInfo> GetInstalledPrinters()
        {
            var list = new List<PrinterInfo>();
            string defaultPrinter = "";

            try
            {
                var defaultSettings = new PrinterSettings();
                defaultPrinter = defaultSettings.PrinterName ?? "";
            }
            catch
            {
                // Ignore if no default printer
            }

            try
            {
                foreach (string printer in PrinterSettings.InstalledPrinters)
                {
                    list.Add(new PrinterInfo
                    {
                        Name = printer,
                        IsDefault = string.Equals(printer, defaultPrinter, StringComparison.OrdinalIgnoreCase),
                        IsOnline = true
                    });
                }
            }
            catch (Exception ex)
            {
                Logger.Error("فشل استخراج قائمة الطابعات من ويندوز: " + ex.Message, ex);
            }

            return list;
        }

        /// <summary>
        /// فحص وتحديد ما إذا كان مقاس الورق المحدد هو المقاس الضيق (57mm أو 58mm)
        /// </summary>
        public static bool IsCompactPaper(string widthStr)
        {
            if (string.IsNullOrWhiteSpace(widthStr)) return false;
            string w = widthStr.Trim().ToLowerInvariant();
            return w == "57mm" || w == "58mm" || w == "57" || w == "58";
        }

        /// <summary>
        /// حساب عرض محتوى الإيصال بالنقاط وفقاً لمقاس الورق (285 لـ 80mm و 190 لـ 57mm/58mm)
        /// </summary>
        public static int GetContentWidthPoints(string widthStr)
        {
            return IsCompactPaper(widthStr) ? 190 : 285;
        }

        /// <summary>
        /// فحص ما إذا كانت الطابعة طابعة فواتير حرارية (وليست طابعة وهمية كـ PDF أو طابعة A4 عادية)
        /// </summary>
        public static bool IsThermalPrinter(string printerName, string paperWidth)
        {
            if (string.Equals(paperWidth, "a4", StringComparison.OrdinalIgnoreCase))
            {
                return false;
            }

            if (string.IsNullOrWhiteSpace(printerName))
            {
                return true;
            }

            string pLower = printerName.ToLowerInvariant();
            if (pLower.Contains("pdf") ||
                pLower.Contains("xps") ||
                pLower.Contains("onenote") ||
                pLower.Contains("fax") ||
                pLower.Contains("document writer") ||
                pLower.Contains("writer"))
            {
                return false;
            }

            return true;
        }

        public int GetConfiguredDrawerPulseMs()
        {
            if (_settings != null)
            {
                string val = _settings.Get("drawer_pulse_ms", "30");
                int ms;
                if (int.TryParse(val, out ms) && ms >= 2 && ms <= 250)
                {
                    return ms;
                }
            }
            return 30;
        }

        public int GetConfiguredDrawerPin()
        {
            if (_settings != null)
            {
                string val = _settings.Get("drawer_pin", "0");
                int pin;
                if (int.TryParse(val, out pin) && (pin == 0 || pin == 1 || pin == 2))
                {
                    return pin;
                }
            }
            return 0;
        }


        /// <summary>
        /// نبضة فتح درج النقدية المادي عبر ESC/POS (USB Spooler أو طابعة شبكية TCP)
        /// </summary>
        public PrintResult KickDrawer(string printerName = null, int? pulseMs = null, int? pin = null)
        {
            string targetPrinter = ResolvePrinterName(printerName);
            if (string.IsNullOrWhiteSpace(targetPrinter))
            {
                return new PrintResult
                {
                    Success = false,
                    Message = "لم يتم تحديد طابعة لفتح الدرج (لا توجد طابعة افتراضية محددة).",
                    PrinterUsed = ""
                };
            }

            try
            {
                string errMsg;
                int effectivePulse = pulseMs.HasValue ? pulseMs.Value : GetConfiguredDrawerPulseMs();
                int effectivePin = pin.HasValue ? pin.Value : GetConfiguredDrawerPin();
                bool ok = RawPrinterHelper.SendDrawerKick(targetPrinter, out errMsg, effectivePulse, effectivePin);
                if (ok)
                {
                    Logger.Info("تم إرسال نبضة فتح درج النقدية بنجاح إلى: " + targetPrinter);
                    return new PrintResult
                    {
                        Success = true,
                        Message = string.Format("تم فتح درج النقدية بنجاح بقوة ({0} مللي ثانية).", effectivePulse),
                        PrinterUsed = targetPrinter
                    };
                }
                else
                {
                    Logger.Warn("فشل إرسال نبضة فتح الدرج: " + errMsg);
                    return new PrintResult
                    {
                        Success = false,
                        Message = "تعذر فتح الدرج: " + errMsg,
                        PrinterUsed = targetPrinter
                    };
                }
            }
            catch (Exception ex)
            {
                Logger.Error("استثناء أثناء فتح درج النقدية: " + ex.Message, ex);
                return new PrintResult
                {
                    Success = false,
                    Message = "خطأ أثناء إرسال أمر فتح الدرج: " + ex.Message,
                    PrinterUsed = targetPrinter
                };
            }
        }

        /// <summary>
        /// أمر تغذية وقص الورق التلقائي عبر ESC/POS
        /// </summary>
        public PrintResult CutPaper(string printerName = null)
        {
            string targetPrinter = ResolvePrinterName(printerName);
            if (string.IsNullOrWhiteSpace(targetPrinter))
            {
                return new PrintResult
                {
                    Success = false,
                    Message = "لم يتم تحديد طابعة لقص الورق.",
                    PrinterUsed = ""
                };
            }

            try
            {
                string errMsg;
                bool ok = RawPrinterHelper.SendPaperCut(targetPrinter, out errMsg);
                return new PrintResult
                {
                    Success = ok,
                    Message = ok ? "تم إرسال أمر قص الورق بنجاح." : ("فشل قص الورق: " + errMsg),
                    PrinterUsed = targetPrinter
                };
            }
            catch (Exception ex)
            {
                Logger.Error("استثناء أثناء قص الورق: " + ex.Message, ex);
                return new PrintResult
                {
                    Success = false,
                    Message = "خطأ أثناء إرسال أمر قص الورق: " + ex.Message,
                    PrinterUsed = targetPrinter
                };
            }
        }

        /// <summary>
        /// طباعة صفحة اختبار عربية للتأكد من عمل الطابعة وجودة الحروف والباركود والشعار
        /// </summary>
        public PrintResult PrintTestReceipt(string printerName = null, string paperWidth = null)
        {
            try
            {
                string selectedPrinter = ResolvePrinterName(printerName);
                string selectedWidth = paperWidth ?? GetConfiguredPaperWidth();

                var testSale = new Sale
                {
                    Id = "test_sale_receipt",
                    InvoiceNumber = 1001,
                    CreatedAt = DateTime.UtcNow.ToString("o"),
                    CashierId = "كاشير تجريبي",
                    PaymentMethod = "cash",
                    SubtotalPiasters = 12500,
                    DiscountPiasters = 1000,
                    TaxPiasters = 1400,
                    TotalPiasters = 12900,
                    PaidPiasters = 15000,
                    Notes = "فاتورة تجريبية لاختبار جودة الطباعة والحروف العربية والباركود",
                    Items = new List<SaleItem>
                    {
                        new SaleItem { ProductName = "لبن جهينة كامل الدسم 1 لتر", QuantityMilli = 2000, UnitPricePiasters = 4200, TotalPiasters = 8400, Unit = "piece" },
                        new SaleItem { ProductName = "جبنة رومي قديمة بالوزن", QuantityMilli = 250, UnitPricePiasters = 16400, TotalPiasters = 4100, Unit = "kg" }
                    },
                    Payments = new List<SalePayment>
                    {
                        new SalePayment { Method = "cash", AmountPiasters = 15000 }
                    }
                };

                return PrintSaleReceipt(testSale, selectedPrinter, selectedWidth, false);
            }
            catch (Exception ex)
            {
                Logger.Error("خطأ أثناء طباعة صفحة الاختبار: " + ex.Message, ex);
                return new PrintResult
                {
                    Success = false,
                    Message = "فشل أمر الطباعة التجريبية: " + ex.Message,
                    PrinterUsed = printerName
                };
            }
        }

        /// <summary>
        /// طباعة إيصال بيع حراري عربي كامل على طابعة ويندوز أو طابعة شبكية ESC/POS مع دعم مقاسات 80mm و 57mm
        /// ورسم باركود حقيقي Code 128 ونبضة فتح الدرج وقص الورق التلقائي
        /// </summary>
        public PrintResult PrintSaleReceipt(Sale sale, string printerName = null, string paperWidth = null, bool? openDrawer = null, bool isCopy = false)
        {
            if (sale == null)
            {
                return new PrintResult { Success = false, Message = "بيانات الفاتورة فارغة" };
            }

            string targetPrinter = ResolvePrinterName(printerName);
            string targetWidth = paperWidth ?? GetConfiguredPaperWidth();
            bool isCompact = IsCompactPaper(targetWidth);
            int printWidth = GetContentWidthPoints(targetWidth);

            bool shouldOpenDrawer;
            if (openDrawer.HasValue)
            {
                shouldOpenDrawer = openDrawer.Value;
            }
            else
            {
                bool isCashInvolved = sale.PaymentMethod == "cash" || sale.PaidPiasters > 0;
                if (sale.Payments != null)
                {
                    for (int pi = 0; pi < sale.Payments.Count; pi++)
                    {
                        if (sale.Payments[pi] != null && sale.Payments[pi].Method == "cash" && sale.Payments[pi].AmountPiasters > 0)
                        {
                            isCashInvolved = true;
                            break;
                        }
                    }
                }
                shouldOpenDrawer = GetConfiguredOpenDrawer() && isCashInvolved;
            }

            // توجيه الطباعة إلى طابعة الشبكة (TCP Port 9100) عبر أوامر ESC/POS النقطية المباشرة
            if (RawPrinterHelper.IsNetworkPrinter(targetPrinter))
            {
                return PrintSaleReceiptToNetwork(sale, targetPrinter, targetWidth, shouldOpenDrawer, isCopy);
            }

            bool isThermal = IsThermalPrinter(targetPrinter, targetWidth);
            bool autoCut = GetConfiguredAutoCut();

            // للطابعات الحرارية المحلية (USB / Spooler): نستخدم ESC/POS Raster المباشر لمنع أي هدر في الورق
            if (isThermal)
            {
                try
                {
                    using (var bmp = RenderReceiptToBitmap(sale, targetWidth, isCopy))
                    {
                        if (bmp != null)
                        {
                            byte[] escposBytes = RawPrinterHelper.ConvertBitmapToEscPosRaster(bmp, shouldOpenDrawer, autoCut, GetConfiguredDrawerPulseMs(), GetConfiguredDrawerPin());
                            string errMsg;
                            string docTitle = string.Format("Rafiq Receipt #{0}", sale.InvoiceNumber);
                            bool ok = RawPrinterHelper.SendRawBytes(targetPrinter, escposBytes, docTitle, out errMsg);
                            if (ok)
                            {
                                if (isCopy && DatabaseService.Audit != null)
                                {
                                    try
                                    {
                                        DatabaseService.Audit.Log(
                                            userId: !string.IsNullOrEmpty(sale.CashierId) ? sale.CashierId : "usr_admin_default",
                                            action: "sale_reprint",
                                            entityType: "sale",
                                            entityId: sale.Id,
                                            detailsJson: string.Format("{{\"invoiceNumber\":{0},\"isCopy\":true,\"timestamp\":\"{1}\"}}", sale.InvoiceNumber, DateTime.UtcNow.ToString("o"))
                                        );
                                    }
                                    catch { }
                                }

                                return new PrintResult
                                {
                                    Success = true,
                                    Message = string.Format("تم إرسال {0} للفاتورة #{1} إلى الطابعة '{2}' بنجاح.", isCopy ? "نسخة طبق الأصل" : "الإيصال", sale.InvoiceNumber, targetPrinter),
                                    PrinterUsed = targetPrinter
                                };
                            }
                            else
                            {
                                Logger.Warn(string.Format("فشل الإرسال المباشر ESC/POS للطابعة '{0}': {1}، جاري المحاولة عبر Windows PrintDocument.", targetPrinter, errMsg));
                            }
                        }
                    }
                }
                catch (Exception exRaster)
                {
                    Logger.Warn("استثناء أثناء طباعة ESC/POS Raster: " + exRaster.Message);
                }
            }

            try
            {
                var store = _settings != null ? _settings.GetAllSettings() : new Dictionary<string, string>();
                string storeName = store.ContainsKey("store_name") ? store["store_name"] : "متجر رفيق";
                string phone = store.ContainsKey("store_phone") ? store["store_phone"] : "";
                string address = store.ContainsKey("store_address") ? store["store_address"] : "";
                string taxNumber = store.ContainsKey("tax_number") ? store["tax_number"] : "";
                string header = store.ContainsKey("receipt_header") ? store["receipt_header"] : "";
                string footer = store.ContainsKey("receipt_footer") ? store["receipt_footer"] : "";

                using (var doc = new PrintDocument())
                {
                    if (!string.IsNullOrWhiteSpace(targetPrinter))
                    {
                        doc.PrinterSettings.PrinterName = targetPrinter;
                    }

                    doc.DefaultPageSettings.Margins = new System.Drawing.Printing.Margins(0, 0, 0, 0);
                    doc.OriginAtMargins = false;

                    if (!doc.PrinterSettings.IsValid)
                    {
                        return new PrintResult
                        {
                            Success = false,
                            Message = string.Format("الطابعة '{0}' غير مثبتة أو غير متصلة بالنظام. الفاتورة رقم #{1} محفوظة بأمان في قاعدة البيانات.", targetPrinter, sale.InvoiceNumber),
                            PrinterUsed = targetPrinter
                        };
                    }

                    float measuredHeight;
                    using (var bmpMeasure = new Bitmap(10, 10))
                    using (var gMeasure = Graphics.FromImage(bmpMeasure))
                    {
                        measuredHeight = RenderReceiptPage(gMeasure, sale, storeName, phone, address, taxNumber, header, footer, printWidth, isCopy);
                    }

                    int widthHundredths = isCompact ? 228 : 314;
                    int heightHundredths = (int)Math.Ceiling((measuredHeight / 72.0) * 100.0) + 12;
                    try
                    {
                        doc.DefaultPageSettings.PaperSize = new PaperSize("RafiqReceipt", widthHundredths, heightHundredths);
                    }
                    catch { }

                    doc.DocumentName = string.Format(isCopy ? "إيصال رفيق (نسخة) - فاتورة #{0}" : "إيصال رفيق - فاتورة #{0}", sale.InvoiceNumber);
                    doc.PrintController = new StandardPrintController(); // طباعة صامتة بدون نوافذ حوارية مزعجة

                    doc.PrintPage += delegate(object sender, PrintPageEventArgs e)
                    {
                        e.Graphics.TextRenderingHint = TextRenderingHint.SingleBitPerPixelGridFit;
                        e.Graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
                        e.Graphics.SmoothingMode = SmoothingMode.None;
                        e.Graphics.PixelOffsetMode = PixelOffsetMode.Half;

                        RenderReceiptPage(e.Graphics, sale, storeName, phone, address, taxNumber, header, footer, printWidth, isCopy);
                        e.HasMorePages = false;
                    };

                    doc.Print();
                }

                if (shouldOpenDrawer)
                {
                    try
                    {
                        string kickErr;
                        RawPrinterHelper.SendDrawerKick(targetPrinter, out kickErr, GetConfiguredDrawerPulseMs(), GetConfiguredDrawerPin());
                    }
                    catch (Exception exDrawer)
                    {
                        Logger.Warn("فشل إرسال نبضة فتح درج النقدية بعد الطباعة: " + exDrawer.Message);
                    }
                }

                if (autoCut && !isThermal)
                {
                    try
                    {
                        string cutErr;
                        RawPrinterHelper.SendPaperCut(targetPrinter, out cutErr);
                    }
                    catch (Exception exCut)
                    {
                        Logger.Warn("فشل إرسال أمر قص الورق بعد الطباعة: " + exCut.Message);
                    }
                }

                if (isCopy && DatabaseService.Audit != null)
                {
                    try
                    {
                        DatabaseService.Audit.Log(
                            userId: !string.IsNullOrEmpty(sale.CashierId) ? sale.CashierId : "usr_admin_default",
                            action: "sale_reprint",
                            entityType: "sale",
                            entityId: sale.Id,
                            detailsJson: string.Format("{{\"invoiceNumber\":{0},\"isCopy\":true,\"timestamp\":\"{1}\"}}", sale.InvoiceNumber, DateTime.UtcNow.ToString("o"))
                        );
                    }
                    catch { }
                }

                return new PrintResult
                {
                    Success = true,
                    Message = string.Format("تم إرسال {0} للفاتورة #{1} إلى الطابعة '{2}' بنجاح.", isCopy ? "نسخة طبق الأصل" : "الإيصال", sale.InvoiceNumber, targetPrinter),
                    PrinterUsed = targetPrinter
                };
            }
            catch (Exception ex)
            {
                Logger.Error(string.Format("فشل طباعة الإيصال للفاتورة #{0}: {1}", sale.InvoiceNumber, ex.Message), ex);
                return new PrintResult
                {
                    Success = false,
                    Message = string.Format("تعذر إتمام الطباعة: قد تكون الطابعة '{0}' غير متصلة أو الورق نافد ({1}). الفاتورة محفوظة بأمان.", targetPrinter, ex.Message),
                    PrinterUsed = targetPrinter
                };
            }
        }

        private PrintResult PrintSaleReceiptToNetwork(Sale sale, string networkTarget, string paperWidth, bool shouldOpenDrawer, bool isCopy)
        {
            try
            {
                using (var bmp = RenderReceiptToBitmap(sale, paperWidth, isCopy))
                {
                    if (bmp == null)
                    {
                        return new PrintResult
                        {
                            Success = false,
                            Message = "فشل توليد صورة الإيصال للطباعة الشبكية.",
                            PrinterUsed = networkTarget
                        };
                    }

                    bool autoCut = GetConfiguredAutoCut();
                    byte[] escposBytes = RawPrinterHelper.ConvertBitmapToEscPosRaster(bmp, shouldOpenDrawer, autoCut, GetConfiguredDrawerPulseMs(), GetConfiguredDrawerPin());

                    string errMsg;
                    string docTitle = string.Format("Rafiq Network Receipt #{0}", sale.InvoiceNumber);
                    bool ok = RawPrinterHelper.SendRawBytes(networkTarget, escposBytes, docTitle, out errMsg);

                    if (ok)
                    {
                        if (isCopy && DatabaseService.Audit != null)
                        {
                            try
                            {
                                DatabaseService.Audit.Log(
                                    userId: !string.IsNullOrEmpty(sale.CashierId) ? sale.CashierId : "usr_admin_default",
                                    action: "sale_reprint",
                                    entityType: "sale",
                                    entityId: sale.Id,
                                    detailsJson: string.Format("{{\"invoiceNumber\":{0},\"isCopy\":true,\"networkPrinter\":\"{1}\",\"timestamp\":\"{2}\"}}", sale.InvoiceNumber, networkTarget, DateTime.UtcNow.ToString("o"))
                                );
                            }
                            catch { }
                        }

                        return new PrintResult
                        {
                            Success = true,
                            Message = string.Format("تم إرسال {0} للفاتورة #{1} إلى طابعة الشبكة '{2}' بنجاح.", isCopy ? "نسخة طبق الأصل" : "الإيصال", sale.InvoiceNumber, networkTarget),
                            PrinterUsed = networkTarget
                        };
                    }
                    else
                    {
                        return new PrintResult
                        {
                            Success = false,
                            Message = string.Format("تعذر إتمام الطباعة على طابعة الشبكة '{0}': {1}. الفاتورة محفوظة بأمان.", networkTarget, errMsg),
                            PrinterUsed = networkTarget
                        };
                    }
                }
            }
            catch (Exception ex)
            {
                Logger.Error(string.Format("استثناء أثناء إرسال الفاتورة #{0} لطابعة الشبكة '{1}': {2}", sale.InvoiceNumber, networkTarget, ex.Message), ex);
                return new PrintResult
                {
                    Success = false,
                    Message = string.Format("تعذر الاتصال بطابعة الشبكة '{0}': {1}. الفاتورة محفوظة بأمان.", networkTarget, ex.Message),
                    PrinterUsed = networkTarget
                };
            }
        }

        /// <summary>
        /// رسم الإيصال بالكامل إلى كائن Bitmap عالي الدقة (203 DPI) لدعم الطباعة الشبكية ومعاينة الصور واختبارات الهاردوير
        /// </summary>
        public Bitmap RenderReceiptToBitmap(Sale sale, string paperWidth = null, bool isCopy = false)
        {
            if (sale == null) return null;

            string targetWidth = paperWidth ?? GetConfiguredPaperWidth();
            bool isCompact = IsCompactPaper(targetWidth);
            int contentWidth = GetContentWidthPoints(targetWidth);

            // على طابعات 203 DPI: 80mm = 576 بكسل، 57mm = 384 بكسل
            int pixelWidth = isCompact ? 384 : 576;
            float scale = (float)pixelWidth / (float)contentWidth;

            // تقدير الارتفاع الأولي مع هامش كافٍ
            int estimatedHeight = Math.Max(500, 360 + (sale.Items != null ? sale.Items.Count * 45 : 0) + (isCopy ? 40 : 0) + 150);
            int pixelHeight = (int)(estimatedHeight * scale);

            var store = _settings != null ? _settings.GetAllSettings() : new Dictionary<string, string>();
            string storeName = store.ContainsKey("store_name") ? store["store_name"] : "متجر رفيق";
            string phone = store.ContainsKey("store_phone") ? store["store_phone"] : "";
            string address = store.ContainsKey("store_address") ? store["store_address"] : "";
            string taxNumber = store.ContainsKey("tax_number") ? store["tax_number"] : "";
            string header = store.ContainsKey("receipt_header") ? store["receipt_header"] : "";
            string footer = store.ContainsKey("receipt_footer") ? store["receipt_footer"] : "";

            var bmpTemp = new Bitmap(pixelWidth, pixelHeight);
            float finalY;
            using (var g = Graphics.FromImage(bmpTemp))
            {
                g.Clear(Color.White);
                g.ScaleTransform(scale, scale);
                g.TextRenderingHint = TextRenderingHint.SingleBitPerPixelGridFit;
                g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                g.SmoothingMode = SmoothingMode.None;
                g.PixelOffsetMode = PixelOffsetMode.Half;

                finalY = RenderReceiptPage(g, sale, storeName, phone, address, taxNumber, header, footer, contentWidth, isCopy);
            }

            int finalPixelHeight = Math.Max(50, (int)Math.Ceiling((finalY + 4f) * scale));
            var bmpFinal = new Bitmap(pixelWidth, finalPixelHeight);
            using (var gFinal = Graphics.FromImage(bmpFinal))
            {
                gFinal.DrawImage(bmpTemp, 0, 0, new Rectangle(0, 0, pixelWidth, finalPixelHeight), GraphicsUnit.Pixel);
            }
            bmpTemp.Dispose();

            return bmpFinal;
        }

        /// <summary>
        /// محاولة تحميل شعار المتجر للطباعة الحرارية
        /// </summary>
        private Image TryLoadStoreLogo()
        {
            try
            {
                string showLogo = _settings != null ? _settings.Get("show_receipt_logo", "1") : "1";
                if (showLogo == "0" || showLogo.Equals("false", StringComparison.OrdinalIgnoreCase))
                {
                    return null;
                }

                string configured = _settings != null ? _settings.Get("store_logo_path", "") : "";
                if (string.IsNullOrWhiteSpace(configured) && _settings != null)
                {
                    configured = _settings.Get("store_logo_url", "");
                }

                string baseDir = AppDomain.CurrentDomain.BaseDirectory;

                if (!string.IsNullOrWhiteSpace(configured) && configured != "/logo.png" && configured != "/receipt_logo.png" && configured != "/receipt_logo_square.png")
                {
                    if (configured.StartsWith("data:image", StringComparison.OrdinalIgnoreCase))
                    {
                        int commaIdx = configured.IndexOf(',');
                        if (commaIdx >= 0)
                        {
                            byte[] bytes = Convert.FromBase64String(configured.Substring(commaIdx + 1));
                            using (var ms = new MemoryStream(bytes))
                            using (var tempImg = Image.FromStream(ms))
                            {
                                return new Bitmap(tempImg);
                            }
                        }
                    }
                    else if (File.Exists(configured))
                    {
                        using (var tempImg = Image.FromFile(configured))
                        {
                            return new Bitmap(tempImg);
                        }
                    }
                    else
                    {
                        string rel = configured.TrimStart('/', '\\');
                        string localPath = Path.Combine(baseDir, "dist", rel);
                        if (!File.Exists(localPath)) localPath = Path.Combine(baseDir, rel);
                        if (File.Exists(localPath))
                        {
                            using (var tempImg = Image.FromFile(localPath))
                            {
                                return new Bitmap(tempImg);
                            }
                        }
                    }
                }

                string[] candidates = new string[]
                {
                    Path.Combine(baseDir, "receipt_logo_square.png"),
                    Path.Combine(baseDir, "dist", "receipt_logo_square.png"),
                    Path.Combine(baseDir, "receipt_logo.png"),
                    Path.Combine(baseDir, "dist", "receipt_logo.png"),
                    Path.Combine(baseDir, "branding", "receipt_logo_square.png"),
                    Path.Combine(baseDir, "branding", "receipt_logo.png"),
                    Path.Combine(baseDir, "wwwroot", "receipt_logo_square.png"),
                    Path.Combine(baseDir, "wwwroot", "receipt_logo.png"),
                    Path.Combine(baseDir, "logo.png"),
                    Path.Combine(baseDir, "logo_full.png"),
                    Path.Combine(baseDir, "branding", "logo.png"),
                    Path.Combine(baseDir, "branding", "logo_full.png"),
                    Path.Combine(baseDir, "dist", "logo.png"),
                    Path.Combine(baseDir, "wwwroot", "logo.png")
                };

                for (int i = 0; i < candidates.Length; i++)
                {
                    if (File.Exists(candidates[i]))
                    {
                        using (var tempImg = Image.FromFile(candidates[i]))
                        {
                            return new Bitmap(tempImg);
                        }
                    }
                }
            }
            catch
            {
                // تجاوز الخطأ واستمر بالطباعة بدون شعار
            }
            return null;
        }

                public static string GetDefaultFooterForStoreType(string storeType)
        {
            storeType = (storeType ?? "").Trim().ToLowerInvariant();
            if (storeType == "pharmacy")
            {
                return "شكراً لزيارتكم ونتمنى لكم الشفاء العاجل! الأدوية غير المفتوحة تستبدل خلال 14 يوماً بالإيصال. أدوية الثلاجة والأمبولات المعقمة لا ترد حفاظاً على الصحة العامة.";
            }
            if (storeType == "clothing_apparel" || storeType == "clothing" || storeType == "clothing_shoes")
            {
                return "شكراً لاختياركم متجرنا! الاستبدال والاسترجاع خلال 14 يوماً بالإيصال مع بقاء تكت المصنع وبنفس الحالة الأصلية. الملابس الداخلية وسواريهات الحفلات لا ترد ولا تستبدل.";
            }
            if (storeType == "phones_electronics" || storeType == "electronics")
            {
                return "شكراً لثقتكم بنا! الضمان ساري بوجود الفاتورة والعلبة الأصلية ولا يشمل الكسر أو الحريق وسوء الاستخدام ودخول السوائل. الاسترجاع خلال 14 يوماً ضد عيوب الصناعة.";
            }
            if (storeType == "produce_butchery" || storeType == "butchery" || storeType == "produce")
            {
                return "شكراً لتعاملكم معنا! لحومنا وخضرواتنا طازجة ومذبوحة وفقاً للشريعة الإسلامية. يُرجى فحص الطلب واستلامه طازجاً، والرجوع بالإيصال لأي ملاحظة.";
            }
            if (storeType == "cafe_restaurant" || storeType == "cafe" || storeType == "restaurant")
            {
                return "أهلاً وسهلاً بكم دائماً! نسعد بخدمتكم ونتمنى أن تكون تجربتكم نالت كامل رضاكم. لأي ملاحظات أو اقتراحات يسعدنا تواصلكم.";
            }
            if (storeType == "spices_roastery" || storeType == "roastery")
            {
                return "شكراً لزيارتكم! بن وتوابل ومكسرات طازجة ومحمصة يومياً بأعلى جودة. الاستبدال للبضائع المغلفة خلال 14 يوماً بالإيصال.";
            }
            if (storeType == "dairy_bakery" || storeType == "bakery")
            {
                return "شكراً لاختياركم مخبزنا! منتجاتنا مخبوزة وطازجة يومياً بأجود المكونات الطبيعية. يسعدنا دائماً تكرار زيارتكم.";
            }
            if (storeType == "stationery_gifts" || storeType == "toys_kids")
            {
                return "شكراً لزيارتكم! يسعدنا تقديم أجود الأدوات والهدايا. الاستبدال والاسترجاع خلال 14 يوماً مع بقاء الغلاف الأصلي للمنتج.";
            }
            return "شكراً لتسوقكم معنا! البضاعة الجافة تستبدل خلال 14 يوماً بالإيصال وبحالتها الأصلية. المواد الغذائية الطازجة والمجمدة خلال 24 ساعة.";
        }

        public static string FormatReceiptUnit(string unitName, string unit, long quantityMilli)
        {
            string raw = (!string.IsNullOrWhiteSpace(unitName) ? unitName : unit ?? "").Trim().ToLowerInvariant();
            if (raw == "piece" || raw == "pc" || raw == "pcs" || raw == "item" || raw == "unit" || raw == "قطعة")
            {
                return "ق";
            }
            if (raw == "kg" || raw == "kilo" || raw == "kilogram")
            {
                return "كجم";
            }
            if (raw == "g" || raw == "gm" || raw == "gram")
            {
                return "جم";
            }
            if (raw == "l" || raw == "liter" || raw == "litre")
            {
                return "لتر";
            }
            if (raw == "m" || raw == "meter")
            {
                return "متر";
            }
            if (raw == "box" || raw == "carton")
            {
                return "علبة";
            }
            if (raw == "strip")
            {
                return "شريط";
            }
            if (raw == "bottle")
            {
                return "زجاجة";
            }
            if (raw == "capsule")
            {
                return "كبسولة";
            }
            if (raw == "tablet")
            {
                return "قرص";
            }
            if (raw == "sachet")
            {
                return "كيس";
            }
            if (raw == "ampoule")
            {
                return "أمبول";
            }
            if (raw == "vial")
            {
                return "فيال";
            }
            if (!string.IsNullOrWhiteSpace(unitName))
            {
                return unitName;
            }
            return (string.Equals(unit, "kg", StringComparison.OrdinalIgnoreCase) || quantityMilli % 1000 != 0) ? "كجم" : "ق";
        }

        private float RenderReceiptPage(
            Graphics g,
            Sale sale,
            string storeName,
            string phone,
            string address,
            string taxNumber,
            string header,
            string footer,
            int contentWidth,
            bool isCopy = false)
        {
            g.Clear(Color.White);

            bool isCompact = (contentWidth <= 210);

            // سلسلة الخطوط العربية المتوافقة
            string fontName = "Arial";
            using (var testFont = new Font("Cairo", 9f))
            {
                if (testFont.Name == "Cairo") fontName = "Cairo";
                else
                {
                    using (var segFont = new Font("Segoe UI", 9f))
                    {
                        if (segFont.Name == "Segoe UI") fontName = "Segoe UI";
                        else
                        {
                            using (var tahomaFont = new Font("Tahoma", 9f))
                            {
                                if (tahomaFont.Name == "Tahoma") fontName = "Tahoma";
                            }
                        }
                    }
                }
            }

            // تخصيص أحجام الخطوط تناسبياً مع مقاس الورق (80mm أو 57mm)
            float titleSize = isCompact ? 10.5f : 12f;
            float boldSize = isCompact ? 8f : 9f;
            float regSize = isCompact ? 7.5f : 8.5f;
            float smallSize = isCompact ? 6.8f : 7.5f;
            float largeSize = isCompact ? 11f : 12.5f;

            using (var fontTitle = new Font(fontName, titleSize, FontStyle.Bold))
            using (var fontBold = new Font(fontName, boldSize, FontStyle.Bold))
            using (var fontRegular = new Font(fontName, regSize, FontStyle.Regular))
            using (var fontSmall = new Font(fontName, smallSize, FontStyle.Regular))
            using (var fontLarge = new Font(fontName, largeSize, FontStyle.Bold))
            using (var penDashed = new Pen(Color.Black, 1f) { DashStyle = DashStyle.Dash })
            using (var penSolid = new Pen(Color.Black, 1.2f))
            {
                var rtlFormat = new StringFormat
                {
                    FormatFlags = StringFormatFlags.DirectionRightToLeft,
                    Alignment = StringAlignment.Near,
                    LineAlignment = StringAlignment.Center
                };

                var centerFormat = new StringFormat
                {
                    FormatFlags = StringFormatFlags.DirectionRightToLeft,
                    Alignment = StringAlignment.Center,
                    LineAlignment = StringAlignment.Center
                };

                var leftFormat = new StringFormat
                {
                    Alignment = StringAlignment.Near,
                    LineAlignment = StringAlignment.Center
                };

                // مسافة بداية علوية متوازنة وبسيطة (2pt لمنع الهدر العلوي)
                float y = 2f;

                // 0. رسم شعار المتجر إذا وجد
                using (var logo = TryLoadStoreLogo())
                {
                    if (logo != null)
                    {
                        try
                        {
                            float maxLogoW = isCompact ? 90f : 130f;
                            float maxLogoH = isCompact ? 38f : 48f;
                            float scale = Math.Min(maxLogoW / logo.Width, maxLogoH / logo.Height);
                            if (scale > 1f) scale = 1f;

                            float drawW = logo.Width * scale;
                            float drawH = logo.Height * scale;
                            float drawX = (contentWidth - drawW) / 2f;

                            g.DrawImage(logo, drawX, y, drawW, drawH);
                            y += drawH + 3f;
                        }
                        catch
                        {
                        }
                    }
                }

                // 1. ترويسة المتجر
                g.DrawString(storeName, fontTitle, Brushes.Black, new RectangleF(0, y, contentWidth, isCompact ? 19 : 22), centerFormat);
                y += isCompact ? 19 : 22;

                if (!string.IsNullOrWhiteSpace(address))
                {
                    g.DrawString(address, fontSmall, Brushes.Black, new RectangleF(0, y, contentWidth, isCompact ? 13 : 15), centerFormat);
                    y += isCompact ? 13 : 15;
                }

                if (!string.IsNullOrWhiteSpace(phone))
                {
                    g.DrawString("تليفون: " + phone, fontSmall, Brushes.Black, new RectangleF(0, y, contentWidth, isCompact ? 13 : 15), centerFormat);
                    y += isCompact ? 13 : 15;
                }

                if (!string.IsNullOrWhiteSpace(taxNumber))
                {
                    g.DrawString("ر.ض: " + taxNumber, fontSmall, Brushes.Black, new RectangleF(0, y, contentWidth, isCompact ? 13 : 15), centerFormat);
                    y += isCompact ? 13 : 15;
                }

                if (!string.IsNullOrWhiteSpace(header))
                {
                    g.DrawLine(penDashed, 5, y + 2, contentWidth - 5, y + 2);
                    y += 5;
                    g.DrawString(header, fontRegular, Brushes.Black, new RectangleF(0, y, contentWidth, isCompact ? 15 : 17), centerFormat);
                    y += isCompact ? 16 : 18;
                    g.DrawLine(penDashed, 5, y, contentWidth - 5, y);
                    y += 4;
                }

                // 2. بيانات الفاتورة الأساسية في سطر واحد منظم (طابق المعاينة بدقة)
                g.DrawLine(penDashed, 5, y + 1, contentWidth - 5, y + 1);
                y += 4;

                string invNumStr = string.Format("فاتورة: #{0}", sale.InvoiceNumber > 0 ? sale.InvoiceNumber.ToString() : sale.Id);
                DateTime saleDate;
                if (!DateTime.TryParse(sale.CreatedAt, out saleDate)) saleDate = DateTime.Now;
                string dateStr = saleDate.ToString("yyyy/MM/dd HH:mm");

                float metaHalf = contentWidth / 2f;
                g.DrawString(invNumStr, fontBold, Brushes.Black, new RectangleF(metaHalf, y, metaHalf - 5, 16), rtlFormat);
                g.DrawString(dateStr, fontSmall, Brushes.Black, new RectangleF(5, y, metaHalf - 5, 16), leftFormat);
                y += 18;

                if (isCopy)
                {
                    g.DrawString("*** نسخة طبق الأصل - إيصال مكرر ***", fontBold, Brushes.Black, new RectangleF(0, y, contentWidth, 16), centerFormat);
                    y += 17;
                }

                if (string.Equals(sale.Status, "TEST_PILOT", StringComparison.OrdinalIgnoreCase))
                {
                    g.DrawString("*** فاتورة تجريبية - تدريب ***", fontBold, Brushes.Black, new RectangleF(0, y, contentWidth, 16), centerFormat);
                    y += 17;
                }

                if (string.Equals(sale.Status, "cancelled", StringComparison.OrdinalIgnoreCase))
                {
                    g.DrawString("*** فاتورة ملغاة ***", fontBold, Brushes.Black, new RectangleF(0, y, contentWidth, 16), centerFormat);
                    y += 18;
                }

                // بيانات المشتري (إذا تم إدخال اسم عميل)
                if (!string.IsNullOrWhiteSpace(sale.CustomerName))
                {
                    string custStr = "العميل: " + sale.CustomerName;
                    if (!string.IsNullOrWhiteSpace(sale.CustomerPhone))
                    {
                        custStr += " (" + sale.CustomerPhone + ")";
                    }
                    g.DrawString(custStr, fontSmall, Brushes.Black, new RectangleF(5, y, contentWidth - 10, 14), rtlFormat);
                    y += 15;
                }

                // 3. جدول الأصناف المباعة (مطابق للمعاينة بالكامل: الصنف | الكمية × السعر | الإجمالي في سطر واحد)
                g.DrawLine(penDashed, 5, y, contentWidth - 5, y);
                y += 3;

                float colTotW = isCompact ? 48f : 65f;
                float colQtyW = isCompact ? 68f : 85f;
                float colItemW = contentWidth - colTotW - colQtyW - 10f;

                using (var headerCenterFormat = new StringFormat
                {
                    FormatFlags = StringFormatFlags.DirectionRightToLeft | StringFormatFlags.NoWrap,
                    Alignment = StringAlignment.Center,
                    LineAlignment = StringAlignment.Center
                })
                {
                    g.DrawString("الصنف", fontBold, Brushes.Black, new RectangleF(contentWidth - colItemW - 5, y, colItemW, 16), rtlFormat);
                    g.DrawString("الكمية × السعر", fontBold, Brushes.Black, new RectangleF(colTotW + 5, y, colQtyW, 16), headerCenterFormat);
                    g.DrawString("الإجمالي", fontBold, Brushes.Black, new RectangleF(5, y, colTotW - 5, 16), leftFormat);
                }
                y += 17;
                g.DrawLine(penSolid, 5, y, contentWidth - 5, y);
                y += 4;

                // 4. أسطر الأصناف
                if (sale.Items != null)
                {
                    foreach (var item in sale.Items)
                    {
                        string qStr;
                        if (string.Equals(item.Unit, "kg", StringComparison.OrdinalIgnoreCase))
                        {
                            qStr = (item.QuantityMilli / 1000.0).ToString("0.000");
                        }
                        else if (item.QuantityMilli % 1000 != 0)
                        {
                            qStr = (item.QuantityMilli / 1000.0).ToString("0.###");
                        }
                        else
                        {
                            qStr = (item.QuantityMilli / 1000).ToString();
                        }

                        string pStr = (item.UnitPricePiasters / 100.0).ToString("0.00");
                        string tStr = (item.TotalPiasters / 100.0).ToString("0.00");
                        string qtyPriceStr = qStr + " × " + pStr;

                        var nameSize = g.MeasureString(item.ProductName ?? "صنف", fontBold, (int)colItemW, rtlFormat);
                        float rowH = Math.Max(isCompact ? 15f : 17f, nameSize.Height + 1f);

                        // رسم الأعمدة الثلاثة على نفس السطر
                        g.DrawString(item.ProductName ?? "صنف", fontBold, Brushes.Black, new RectangleF(contentWidth - colItemW - 5, y, colItemW, rowH), rtlFormat);
                        g.DrawString(qtyPriceStr, fontRegular, Brushes.Black, new RectangleF(colTotW + 5, y, colQtyW, 16), centerFormat);
                        g.DrawString(tStr, fontBold, Brushes.Black, new RectangleF(5, y, colTotW - 5, 16), leftFormat);
                        y += rowH + 1f;

                        // سطر خصم الصنف إن وجد
                        if (item.DiscountPiasters > 0)
                        {
                            string discStr = string.Format("(خصم -{0:0.00})", item.DiscountPiasters / 100.0);
                            g.DrawString(discStr, fontSmall, Brushes.Black, new RectangleF(5, y, contentWidth - 10, 13), rtlFormat);
                            y += 13f;
                        }

                        // تشغيلة وصلاحية الأدوية (للصيدليات)
                        if (!string.IsNullOrWhiteSpace(item.BatchNumber) || !string.IsNullOrWhiteSpace(item.ExpiryDate))
                        {
                            string bInfo = "تشغيلة: " + (!string.IsNullOrWhiteSpace(item.BatchNumber) ? item.BatchNumber : "---");
                            if (!string.IsNullOrWhiteSpace(item.ExpiryDate)) bInfo += " | انتهاء: " + item.ExpiryDate;
                            g.DrawString(bInfo, fontSmall, Brushes.Black, new RectangleF(5, y, contentWidth - 10, 13), rtlFormat);
                            y += 13f;
                        }

                        // إضافات المطاعم
                        if (item.Modifiers != null && item.Modifiers.Count > 0)
                        {
                            for (int mi = 0; mi < item.Modifiers.Count; mi++)
                            {
                                var mod = item.Modifiers[mi];
                                if (mod == null || string.IsNullOrWhiteSpace(mod.OptionName)) continue;
                                string modLine = "  + " + mod.OptionName;
                                if (mod.ExtraPricePiasters > 0) modLine += string.Format(" (+{0:0.00})", mod.ExtraPricePiasters / 100.0);
                                g.DrawString(modLine, fontSmall, Brushes.Black, new RectangleF(5, y, contentWidth - 10, 13), rtlFormat);
                                y += 13f;
                            }
                        }

                        // ملاحظات الصنف
                        if (!string.IsNullOrWhiteSpace(item.Notes))
                        {
                            g.DrawString("  * " + item.Notes, fontSmall, Brushes.Black, new RectangleF(5, y, contentWidth - 10, 13), rtlFormat);
                            y += 13f;
                        }
                    }
                }

                // 5. قسم الإجماليات (مطابق تماماً للمعاينة في الصورة 2)
                g.DrawLine(penDashed, 5, y + 1, contentWidth - 5, y + 1);
                y += 5;

                long receiptDiscountPiasters = sale.DiscountPiasters;
                if (sale.Items != null)
                {
                    for (int di = 0; di < sale.Items.Count; di++)
                    {
                        receiptDiscountPiasters += sale.Items[di].DiscountPiasters;
                    }
                }

                // المجموع الفرعي
                g.DrawString("المجموع الفرعي:", fontRegular, Brushes.Black, new RectangleF(contentWidth * 0.40f, y, contentWidth * 0.55f, 16), rtlFormat);
                g.DrawString((sale.SubtotalPiasters / 100.0).ToString("0.00") + " ج.م", fontRegular, Brushes.Black, new RectangleF(5, y, contentWidth * 0.40f, 16), leftFormat);
                y += 17;

                // الخصم (إذا وجد خصم)
                if (receiptDiscountPiasters > 0 || sale.DiscountPiasters > 0)
                {
                    long totalDiscount = Math.Max(receiptDiscountPiasters, sale.DiscountPiasters);
                    g.DrawString("الخصم:", fontRegular, Brushes.Black, new RectangleF(contentWidth * 0.40f, y, contentWidth * 0.55f, 16), rtlFormat);
                    g.DrawString("-" + (totalDiscount / 100.0).ToString("0.00") + " ج.م", fontRegular, Brushes.Black, new RectangleF(5, y, contentWidth * 0.40f, 16), leftFormat);
                    y += 17;
                }

                if (sale.TaxPiasters > 0)
                {
                    g.DrawString("ضريبة القيمة المضافة:", fontRegular, Brushes.Black, new RectangleF(contentWidth * 0.40f, y, contentWidth * 0.55f, 16), rtlFormat);
                    g.DrawString((sale.TaxPiasters / 100.0).ToString("0.00") + " ج.م", fontRegular, Brushes.Black, new RectangleF(5, y, contentWidth * 0.40f, 16), leftFormat);
                    y += 17;
                }

                if (sale.DeliveryFeePiasters > 0)
                {
                    g.DrawString("رسوم التوصيل:", fontRegular, Brushes.Black, new RectangleF(contentWidth * 0.40f, y, contentWidth * 0.55f, 16), rtlFormat);
                    g.DrawString((sale.DeliveryFeePiasters / 100.0).ToString("0.00") + " ج.م", fontRegular, Brushes.Black, new RectangleF(5, y, contentWidth * 0.40f, 16), leftFormat);
                    y += 17;
                }

                if (sale.ServiceChargePiasters > 0)
                {
                    g.DrawString("خدمة الصالة:", fontRegular, Brushes.Black, new RectangleF(contentWidth * 0.40f, y, contentWidth * 0.55f, 16), rtlFormat);
                    g.DrawString((sale.ServiceChargePiasters / 100.0).ToString("0.00") + " ج.م", fontRegular, Brushes.Black, new RectangleF(5, y, contentWidth * 0.40f, 16), leftFormat);
                    y += 17;
                }

                // خط فاصل عريض قبل الإجمالي المطلوب
                g.DrawLine(penSolid, 5, y + 1, contentWidth - 5, y + 1);
                y += 4;

                // الإجمالي المطلوب (بخط عريض وواضح كما في الصورة 2)
                g.DrawString("الإجمالي المطلوب:", fontLarge, Brushes.Black, new RectangleF(contentWidth * 0.40f, y, contentWidth * 0.55f, isCompact ? 22 : 26), rtlFormat);
                g.DrawString((sale.TotalPiasters / 100.0).ToString("0.00") + " ج.م", fontLarge, Brushes.Black, new RectangleF(5, y, contentWidth * 0.40f, isCompact ? 22 : 26), leftFormat);
                y += isCompact ? 24 : 28;

                // طريقة الدفع والمتبقي
                string methodLabel = "المدفوع كاش:";
                if (sale.PaymentMethod == "credit") methodLabel = "المبلغ (آجل):";
                else if (sale.PaymentMethod == "instapay") methodLabel = "المدفوع إنستاباي:";
                else if (sale.PaymentMethod == "vodafone_cash") methodLabel = "المدفوع محفظة:";
                else if (sale.PaymentMethod == "card") methodLabel = "المدفوع بطاقة:";
                else if (sale.PaymentMethod == "multi") methodLabel = "المدفوع مجزأ:";

                long totalPaid = sale.PaidPiasters > 0 ? sale.PaidPiasters : sale.TotalPiasters;
                long changeDue = Math.Max(0, sale.ChangePiasters);

                g.DrawString(methodLabel, fontRegular, Brushes.Black, new RectangleF(contentWidth * 0.40f, y, contentWidth * 0.55f, 16), rtlFormat);
                g.DrawString((totalPaid / 100.0).ToString("0.00") + " ج.م", fontRegular, Brushes.Black, new RectangleF(5, y, contentWidth * 0.40f, 16), leftFormat);
                y += 17;

                if (changeDue > 0)
                {
                    g.DrawString("الباقي للزبون:", fontBold, Brushes.Black, new RectangleF(contentWidth * 0.40f, y, contentWidth * 0.55f, 17), rtlFormat);
                    g.DrawString((changeDue / 100.0).ToString("0.00") + " ج.م", fontBold, Brushes.Black, new RectangleF(5, y, contentWidth * 0.40f, 17), leftFormat);
                    y += 18;
                }

                // قسيمة الدليفري إن وجدت
                if (string.Equals(sale.OrderType, "delivery", StringComparison.OrdinalIgnoreCase))
                {
                    y += 4;
                    g.DrawLine(penSolid, 5, y, contentWidth - 5, y);
                    y += 3;
                    g.DrawString("=== توصيل دليفري ===", fontBold, Brushes.Black, new RectangleF(5, y, contentWidth - 10, 16), centerFormat);
                    y += 17;

                    string dCust = (sale.DeliveryInfo != null && !string.IsNullOrWhiteSpace(sale.DeliveryInfo.CustomerName))
                        ? sale.DeliveryInfo.CustomerName
                        : (!string.IsNullOrWhiteSpace(sale.CustomerName) ? sale.CustomerName : "عميل دليفري");
                    string dPhone = (sale.DeliveryInfo != null && !string.IsNullOrWhiteSpace(sale.DeliveryInfo.CustomerPhone))
                        ? sale.DeliveryInfo.CustomerPhone
                        : (sale.CustomerPhone ?? "");
                    string dAddr = (sale.DeliveryInfo != null && !string.IsNullOrWhiteSpace(sale.DeliveryInfo.DeliveryAddress))
                        ? sale.DeliveryInfo.DeliveryAddress
                        : "";

                    g.DrawString("العميل: " + dCust + (string.IsNullOrWhiteSpace(dPhone) ? "" : " (" + dPhone + ")"), fontBold, Brushes.Black, new RectangleF(5, y, contentWidth - 10, 15), rtlFormat);
                    y += 15;
                    if (!string.IsNullOrWhiteSpace(dAddr))
                    {
                        g.DrawString("العنوان: " + dAddr, fontSmall, Brushes.Black, new RectangleF(5, y, contentWidth - 10, 15), rtlFormat);
                        y += 15;
                    }
                    g.DrawLine(penSolid, 5, y, contentWidth - 5, y);
                    y += 4;
                }

                // 6. باركود الفاتورة مطابق للمعاينة
                y += 4;
                string barcodeValue = sale.InvoiceNumber > 0 ? string.Format("RFQ-INV-{0:D8}", sale.InvoiceNumber) : string.Format("RFQ-INV-{0}", sale.Id ?? "00000000");
                float barcodeH = isCompact ? 30f : 36f;
                var barcodeRect = new RectangleF(isCompact ? 15 : 25, y, contentWidth - (isCompact ? 30 : 50), barcodeH);
                BarcodeGenerator.DrawBarcode(g, barcodeValue, barcodeRect, showText: false);
                y += barcodeH + 2;

                g.DrawString(barcodeValue, fontSmall, Brushes.Black, new RectangleF(0, y, contentWidth, 14), centerFormat);
                y += 16;

                // 7. خاتمة الإيصال (فقط وحصرياً إذا قام المستخدم بكتابة خاتمة)
                if (!string.IsNullOrWhiteSpace(footer))
                {
                    g.DrawLine(penDashed, 5, y + 1, contentWidth - 5, y + 1);
                    y += 5;
                    var footerSize = g.MeasureString(footer, fontSmall, (int)(contentWidth - 10), centerFormat);
                    float footerH = Math.Max(15f, footerSize.Height + 2f);
                    g.DrawString(footer, fontSmall, Brushes.Black, new RectangleF(5, y, contentWidth - 10, footerH), centerFormat);
                    y += footerH + 4;
                }

                // 8. حقوق وتوقيع مطور النظام
                g.DrawLine(penDashed, 5, y + 1, contentWidth - 5, y + 1);
                y += 4;
                string defaultSig = "نظام رفيق للأنظمة والحلول البرمجية | تطوير: م. إسلام خالد - 01097782965";
                string devSig = _settings != null ? _settings.Get("developer_signature", defaultSig) : defaultSig;
                if (string.IsNullOrWhiteSpace(devSig) || devSig == "نظام رفيق لإدارة المتاجر ونقاط البيع | تطوير: م. إسلام خالد")
                {
                    devSig = defaultSig;
                }
                g.DrawString(devSig, fontSmall, Brushes.Black, new RectangleF(2, y, contentWidth - 4, isCompact ? 22 : 16), centerFormat);
                y += isCompact ? 24 : 18;

                // هامش سفلي طفيف جداً قبل شفرة القص
                y += 8f;

                return y;
            }
        }

        public PrintResult PrintReturnReceipt(
            Return returnObj,
            string printerName = null,
            int? paperWidth = null,
            bool? openDrawer = null)
        {
            if (returnObj == null)
            {
                return new PrintResult { Success = false, Message = "بيانات المرتجع غير صحيحة" };
            }

            string targetPrinter = ResolvePrinterName(printerName);
            int printWidth = (paperWidth.HasValue && paperWidth.Value > 0)
                ? paperWidth.Value
                : GetContentWidthPoints(GetConfiguredPaperWidth());

            bool shouldOpenDrawer = openDrawer.HasValue ? openDrawer.Value : GetConfiguredOpenDrawer();

            if (RawPrinterHelper.IsNetworkPrinter(targetPrinter))
            {
                return PrintReturnReceiptToNetwork(returnObj, targetPrinter, printWidth, shouldOpenDrawer);
            }

            try
            {
                string storeName = _settings != null ? _settings.Get("store_name", "متجر رفيق") : "متجر رفيق";
                string phone = _settings != null ? _settings.Get("store_phone", "") : "";
                string address = _settings != null ? _settings.Get("store_address", "") : "";

                using (var doc = new PrintDocument())
                {
                    if (!string.IsNullOrWhiteSpace(targetPrinter))
                    {
                        doc.PrinterSettings.PrinterName = targetPrinter;
                    }

                    if (!doc.PrinterSettings.IsValid)
                    {
                        return new PrintResult
                        {
                            Success = false,
                            Message = string.Format("الطابعة المحددة '{0}' غير صالحة أو غير مثبتة في النظام.", targetPrinter),
                            PrinterUsed = targetPrinter
                        };
                    }

                    doc.DocumentName = string.Format("إيصال مرتجع بضاعة #{0}", returnObj.ReturnNumber);
                    doc.PrintController = new StandardPrintController();

                    doc.PrintPage += delegate(object sender, PrintPageEventArgs e)
                    {
                        e.Graphics.TextRenderingHint = TextRenderingHint.SingleBitPerPixelGridFit;
                        e.Graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
                        e.Graphics.SmoothingMode = SmoothingMode.None;
                        e.Graphics.PixelOffsetMode = PixelOffsetMode.Half;

                        RenderReturnReceiptPage(e.Graphics, returnObj, storeName, phone, address, printWidth);
                        e.HasMorePages = false;
                    };

                    doc.Print();
                }

                if (shouldOpenDrawer)
                {
                    try
                    {
                        string kickErr;
                        RawPrinterHelper.SendDrawerKick(targetPrinter, out kickErr, GetConfiguredDrawerPulseMs(), GetConfiguredDrawerPin());
                    }
                    catch { }
                }

                if (GetConfiguredAutoCut())
                {
                    try
                    {
                        string cutErr;
                        RawPrinterHelper.SendPaperCut(targetPrinter, out cutErr);
                    }
                    catch { }
                }

                return new PrintResult
                {
                    Success = true,
                    Message = string.Format("تم إرسال إيصال المرتجع #{0} إلى الطابعة بنجاح.", returnObj.ReturnNumber),
                    PrinterUsed = targetPrinter
                };
            }
            catch (Exception ex)
            {
                Logger.Error(string.Format("فشل طباعة إيصال المرتجع #{0}: {1}", returnObj.ReturnNumber, ex.Message), ex);
                return new PrintResult
                {
                    Success = false,
                    Message = "خطأ أثناء طباعة إيصال المرتجع: " + ex.Message,
                    PrinterUsed = targetPrinter
                };
            }
        }

        private PrintResult PrintReturnReceiptToNetwork(Return returnObj, string networkTarget, int printWidth, bool shouldOpenDrawer)
        {
            try
            {
                using (var bmp = RenderReturnReceiptToBitmap(returnObj, printWidth))
                {
                    if (bmp == null)
                    {
                        return new PrintResult { Success = false, Message = "فشل توليد صورة إيصال المرتجع للطباعة الشبكية.", PrinterUsed = networkTarget };
                    }

                    bool autoCut = GetConfiguredAutoCut();
                    byte[] escposBytes = RawPrinterHelper.ConvertBitmapToEscPosRaster(bmp, shouldOpenDrawer, autoCut, GetConfiguredDrawerPulseMs(), GetConfiguredDrawerPin());

                    string errMsg;
                    string docTitle = string.Format("Rafiq Network Return #{0}", returnObj.ReturnNumber);
                    bool ok = RawPrinterHelper.SendRawBytes(networkTarget, escposBytes, docTitle, out errMsg);

                    return new PrintResult
                    {
                        Success = ok,
                        Message = ok ? string.Format("تم إرسال إيصال المرتجع #{0} إلى طابعة الشبكة بنجاح.", returnObj.ReturnNumber) : ("تعذر الطباعة على طابعة الشبكة: " + errMsg),
                        PrinterUsed = networkTarget
                    };
                }
            }
            catch (Exception ex)
            {
                Logger.Error("استثناء أثناء طباعة المرتجع على طابعة الشبكة: " + ex.Message, ex);
                return new PrintResult { Success = false, Message = "خطأ في الاتصال بطابعة الشبكة: " + ex.Message, PrinterUsed = networkTarget };
            }
        }

        public Bitmap RenderReturnReceiptToBitmap(Return returnObj, int printWidth)
        {
            if (returnObj == null) return null;
            bool isCompact = (printWidth <= 210);
            int pixelWidth = isCompact ? 384 : 576;
            float scale = (float)pixelWidth / (float)printWidth;

            int estimatedHeight = Math.Max(400, 320 + (returnObj.Items != null ? returnObj.Items.Count * 40 : 0) + 120);
            int pixelHeight = (int)(estimatedHeight * scale);

            string storeName = _settings != null ? _settings.Get("store_name", "متجر رفيق") : "متجر رفيق";
            string phone = _settings != null ? _settings.Get("store_phone", "") : "";
            string address = _settings != null ? _settings.Get("store_address", "") : "";

            var bmpTemp = new Bitmap(pixelWidth, pixelHeight);
            float finalY;
            using (var g = Graphics.FromImage(bmpTemp))
            {
                g.Clear(Color.White);
                g.ScaleTransform(scale, scale);
                g.TextRenderingHint = TextRenderingHint.SingleBitPerPixelGridFit;
                g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                g.SmoothingMode = SmoothingMode.None;
                g.PixelOffsetMode = PixelOffsetMode.Half;

                finalY = RenderReturnReceiptPage(g, returnObj, storeName, phone, address, printWidth);
            }

            int finalPixelHeight = Math.Max(50, (int)Math.Ceiling((finalY + 12f) * scale));
            var bmpFinal = new Bitmap(pixelWidth, finalPixelHeight);
            using (var gFinal = Graphics.FromImage(bmpFinal))
            {
                gFinal.DrawImage(bmpTemp, 0, 0, new Rectangle(0, 0, pixelWidth, finalPixelHeight), GraphicsUnit.Pixel);
            }
            bmpTemp.Dispose();

            return bmpFinal;
        }

        private float RenderReturnReceiptPage(
            Graphics g,
            Return returnObj,
            string storeName,
            string phone,
            string address,
            int contentWidth)
        {
            g.Clear(Color.White);

            bool isCompact = (contentWidth <= 210);

            string fontName = "Arial";
            using (var testFont = new Font("Cairo", 9f))
            {
                if (testFont.Name == "Cairo") fontName = "Cairo";
                else
                {
                    using (var segFont = new Font("Segoe UI", 9f))
                    {
                        if (segFont.Name == "Segoe UI") fontName = "Segoe UI";
                        else
                        {
                            using (var tahomaFont = new Font("Tahoma", 9f))
                            {
                                if (tahomaFont.Name == "Tahoma") fontName = "Tahoma";
                            }
                        }
                    }
                }
            }

            float titleSize = isCompact ? 10.5f : 12f;
            float boldSize = isCompact ? 8f : 9f;
            float regSize = isCompact ? 7.5f : 8.5f;
            float smallSize = isCompact ? 6.8f : 7.5f;
            float largeSize = isCompact ? 11.5f : 13f;

            using (var fontTitle = new Font(fontName, titleSize, FontStyle.Bold))
            using (var fontBold = new Font(fontName, boldSize, FontStyle.Bold))
            using (var fontRegular = new Font(fontName, regSize, FontStyle.Regular))
            using (var fontSmall = new Font(fontName, smallSize, FontStyle.Regular))
            using (var fontLarge = new Font(fontName, largeSize, FontStyle.Bold))
            using (var penDashed = new Pen(Color.Black, 1f) { DashStyle = DashStyle.Dash })
            using (var penSolid = new Pen(Color.Black, 1.5f))
            using (var centerFormat = new StringFormat { FormatFlags = StringFormatFlags.DirectionRightToLeft, Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center })
            using (var rightFormat = new StringFormat { FormatFlags = StringFormatFlags.DirectionRightToLeft, Alignment = StringAlignment.Near, LineAlignment = StringAlignment.Center })
            using (var leftFormat = new StringFormat { Alignment = StringAlignment.Near, LineAlignment = StringAlignment.Center })
            {
                float y = 5;

                // 1. ترويسة المتجر
                g.DrawString(storeName, fontTitle, Brushes.Black, new RectangleF(0, y, contentWidth, 22), centerFormat);
                y += 24;

                if (!string.IsNullOrWhiteSpace(address))
                {
                    g.DrawString(address, fontSmall, Brushes.Black, new RectangleF(0, y, contentWidth, 14), centerFormat);
                    y += 16;
                }
                if (!string.IsNullOrWhiteSpace(phone))
                {
                    g.DrawString("هاتف: " + phone, fontSmall, Brushes.Black, new RectangleF(0, y, contentWidth, 14), centerFormat);
                    y += 16;
                }

                y += 4;
                g.DrawLine(penSolid, 5, y, contentWidth - 5, y);
                y += 8;

                // شارة: إيصال مرتجع بضاعة
                g.FillRectangle(Brushes.Black, new RectangleF(15, y, contentWidth - 30, 24));
                g.DrawString("إيصال مرتجع بضاعة", fontBold, Brushes.White, new RectangleF(15, y, contentWidth - 30, 24), centerFormat);
                y += 30;

                // 2. بيانات المرتجع
                string retNumStr = "رقم المرتجع: #" + returnObj.ReturnNumber;
                g.DrawString(retNumStr, fontBold, Brushes.Black, new RectangleF(5, y, contentWidth - 10, 16), rightFormat);
                y += 18;

                if (returnObj.InvoiceNumber.HasValue && returnObj.InvoiceNumber.Value > 0)
                {
                    string origInvStr = "الفاتورة الأصلية: #" + returnObj.InvoiceNumber.Value;
                    g.DrawString(origInvStr, fontRegular, Brushes.Black, new RectangleF(5, y, contentWidth - 10, 16), rightFormat);
                    y += 18;
                }
                else
                {
                    g.DrawString("مرتجع حر (بدون فاتورة أصلية)", fontSmall, Brushes.Black, new RectangleF(5, y, contentWidth - 10, 16), rightFormat);
                    y += 18;
                }

                DateTime retDate = DateTime.Now;
                DateTime.TryParse(returnObj.CreatedAt, out retDate);
                g.DrawString(retDate.ToString("yyyy/MM/dd HH:mm"), fontSmall, Brushes.Black, new RectangleF(5, y, contentWidth - 10, 14), rightFormat);
                y += 16;

                if (!string.IsNullOrWhiteSpace(returnObj.CustomerName))
                {
                    g.DrawString("العميل: " + returnObj.CustomerName, fontSmall, Brushes.Black, new RectangleF(5, y, contentWidth - 10, 14), rightFormat);
                    y += 16;
                }

                if (!string.IsNullOrWhiteSpace(returnObj.Reason))
                {
                    g.DrawString("السبب: " + returnObj.Reason, fontSmall, Brushes.Black, new RectangleF(5, y, contentWidth - 10, 14), rightFormat);
                    y += 16;
                }

                y += 4;
                g.DrawLine(penDashed, 5, y, contentWidth - 5, y);
                y += 6;

                // 3. جدول الأصناف
                float colProdW = contentWidth * 0.48f;
                float colQtyW = contentWidth * 0.22f;
                float colTotalW = contentWidth * 0.30f;

                g.DrawString("الصنف", fontBold, Brushes.Black, new RectangleF(contentWidth - colProdW - 5, y, colProdW, 16), rightFormat);
                g.DrawString("الكمية", fontBold, Brushes.Black, new RectangleF(contentWidth - colProdW - colQtyW - 5, y, colQtyW, 16), centerFormat);
                g.DrawString("الإجمالي", fontBold, Brushes.Black, new RectangleF(5, y, colTotalW, 16), leftFormat);
                y += 18;
                g.DrawLine(penSolid, 5, y, contentWidth - 5, y);
                y += 6;

                // 4. أسطر الأصناف المرتجعة
                if (returnObj.Items != null)
                {
                    foreach (var item in returnObj.Items)
                    {
                        string pName = item.ProductName ?? "";
                        if (item.IsDamaged)
                        {
                            pName += " [تالف]";
                        }

                        g.DrawString(pName, fontRegular, Brushes.Black, new RectangleF(contentWidth - colProdW - 5, y, colProdW, 16), rightFormat);

                        double qty = item.QuantityMilli / 1000.0;
                        string qtyStr = qty.ToString("0.###");
                        g.DrawString(qtyStr, fontRegular, Brushes.Black, new RectangleF(contentWidth - colProdW - colQtyW - 5, y, colQtyW, 16), centerFormat);

                        string itemTotalStr = Money.FormatPiasters(item.TotalPiasters);
                        g.DrawString(itemTotalStr, fontBold, Brushes.Black, new RectangleF(5, y, colTotalW, 16), leftFormat);
                        y += 18;
                    }
                }

                y += 4;
                g.DrawLine(penDashed, 5, y, contentWidth - 5, y);
                y += 6;

                // 5. إجمالي المبلغ المسترد
                g.DrawString("إجمالي المبلغ المسترد:", fontBold, Brushes.Black, new RectangleF(contentWidth * 0.4f, y, contentWidth * 0.55f, 20), rightFormat);
                string totalStr = Money.FormatPiasters(returnObj.TotalPiasters) + " ج.م";
                g.DrawString(totalStr, fontLarge, Brushes.Black, new RectangleF(5, y, contentWidth * 0.45f, 20), leftFormat);
                y += 24;

                string methodStr = string.Equals(returnObj.RefundMethod, "credit", StringComparison.OrdinalIgnoreCase)
                    ? "طريقة الرد: خصم من حساب العميل"
                    : "طريقة الرد: نقداً من الخزينة";
                g.DrawString(methodStr, fontRegular, Brushes.Black, new RectangleF(5, y, contentWidth - 10, 16), rightFormat);
                y += 22;

                // باركود المرتجع Code 128
                string retBarcode = string.Format("RFQ-RET-{0:D8}", returnObj.ReturnNumber);
                float retBarH = isCompact ? 34f : 40f;
                BarcodeGenerator.DrawBarcode(g, retBarcode, new RectangleF(10, y, contentWidth - 20, retBarH), showText: true, textFont: fontSmall);
                y += retBarH + 6;

                g.DrawLine(penDashed, 5, y, contentWidth - 5, y);
                y += 8;

                g.DrawString("تم توثيق المرتجع بنجاح في سجل العمليات الرقابي", fontSmall, Brushes.Black, new RectangleF(0, y, contentWidth, 16), centerFormat);
                y += 18;

                string defaultSig = "نظام رفيق للأنظمة والحلول البرمجية | تطوير: م. إسلام خالد - 01097782965";
                string devSigReturn = _settings != null ? _settings.Get("developer_signature", defaultSig) : defaultSig;
                if (string.IsNullOrWhiteSpace(devSigReturn) || devSigReturn == "نظام رفيق لإدارة المتاجر ونقاط البيع | تطوير: م. إسلام خالد")
                {
                    devSigReturn = defaultSig;
                }
                y += 2;
                g.DrawLine(penDashed, 5, y, contentWidth - 5, y);
                y += 4;
                g.DrawString(devSigReturn, fontSmall, Brushes.Black, new RectangleF(2, y, contentWidth - 4, isCompact ? 28 : 18), centerFormat);
                y += isCompact ? 30 : 20;

                return y;
            }
        }

        /// <summary>
        /// طباعة ملخص تقرير قفل اليومية (Z-Report) على الطابعة الحرارية أو الشبكية
        /// </summary>
        public PrintResult PrintDailyClosingReport(DailyClosing closing, string printerName = null, string paperWidth = null)
        {
            if (closing == null)
            {
                return new PrintResult { Success = false, Message = "بيانات تقرير الإقفال فارغة" };
            }

            string targetPrinter = ResolvePrinterName(printerName);
            string targetWidth = paperWidth ?? GetConfiguredPaperWidth();
            int printWidth = GetContentWidthPoints(targetWidth);

            if (RawPrinterHelper.IsNetworkPrinter(targetPrinter))
            {
                return PrintDailyClosingReportToNetwork(closing, targetPrinter, targetWidth);
            }

            try
            {
                var store = _settings != null ? _settings.GetAllSettings() : new Dictionary<string, string>();
                string storeName = store.ContainsKey("store_name") ? store["store_name"] : "متجر رفيق";

                using (var doc = new PrintDocument())
                {
                    if (!string.IsNullOrWhiteSpace(targetPrinter))
                    {
                        doc.PrinterSettings.PrinterName = targetPrinter;
                    }

                    if (!doc.PrinterSettings.IsValid)
                    {
                        return new PrintResult
                        {
                            Success = false,
                            Message = string.Format("الطابعة المحددة '{0}' غير صالحة أو غير مثبتة في النظام.", targetPrinter),
                            PrinterUsed = targetPrinter
                        };
                    }

                    doc.DocumentName = string.Format("تقرير إقفال اليومية #{0}", closing.ClosingNumber);
                    doc.PrintController = new StandardPrintController();

                    doc.PrintPage += delegate(object sender, PrintPageEventArgs e)
                    {
                        e.Graphics.TextRenderingHint = TextRenderingHint.SingleBitPerPixelGridFit;
                        e.Graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
                        e.Graphics.SmoothingMode = SmoothingMode.None;
                        e.Graphics.PixelOffsetMode = PixelOffsetMode.Half;

                        RenderDailyClosingPage(e.Graphics, closing, storeName, printWidth);
                        e.HasMorePages = false;
                    };

                    doc.Print();
                }

                if (GetConfiguredAutoCut())
                {
                    try
                    {
                        string cutErr;
                        RawPrinterHelper.SendPaperCut(targetPrinter, out cutErr);
                    }
                    catch { }
                }

                return new PrintResult
                {
                    Success = true,
                    Message = string.Format("تم إرسال تقرير إقفال اليومية #{0} إلى الطابعة '{1}' بنجاح.", closing.ClosingNumber, targetPrinter),
                    PrinterUsed = targetPrinter
                };
            }
            catch (Exception ex)
            {
                Logger.Error(string.Format("فشل طباعة تقرير إقفال اليومية #{0}: {1}", closing.ClosingNumber, ex.Message), ex);
                return new PrintResult
                {
                    Success = false,
                    Message = "خطأ أثناء الطباعة: " + ex.Message,
                    PrinterUsed = targetPrinter
                };
            }
        }

        private PrintResult PrintDailyClosingReportToNetwork(DailyClosing closing, string networkTarget, string paperWidth)
        {
            try
            {
                using (var bmp = RenderDailyClosingToBitmap(closing, paperWidth))
                {
                    if (bmp == null)
                    {
                        return new PrintResult { Success = false, Message = "فشل توليد صورة تقرير الإقفال للطباعة الشبكية.", PrinterUsed = networkTarget };
                    }

                    bool autoCut = GetConfiguredAutoCut();
                    byte[] escposBytes = RawPrinterHelper.ConvertBitmapToEscPosRaster(bmp, false, autoCut);

                    string errMsg;
                    string docTitle = string.Format("Rafiq Network Closing #{0}", closing.ClosingNumber);
                    bool ok = RawPrinterHelper.SendRawBytes(networkTarget, escposBytes, docTitle, out errMsg);

                    return new PrintResult
                    {
                        Success = ok,
                        Message = ok ? string.Format("تم إرسال تقرير إقفال اليومية #{0} إلى طابعة الشبكة بنجاح.", closing.ClosingNumber) : ("تعذر الطباعة على طابعة الشبكة: " + errMsg),
                        PrinterUsed = networkTarget
                    };
                }
            }
            catch (Exception ex)
            {
                Logger.Error("استثناء أثناء طباعة تقرير الإقفال على طابعة الشبكة: " + ex.Message, ex);
                return new PrintResult { Success = false, Message = "خطأ في الاتصال بطابعة الشبكة: " + ex.Message, PrinterUsed = networkTarget };
            }
        }

        public Bitmap RenderDailyClosingToBitmap(DailyClosing closing, string paperWidth = null)
        {
            if (closing == null) return null;
            string targetWidth = paperWidth ?? GetConfiguredPaperWidth();
            bool isCompact = IsCompactPaper(targetWidth);
            int contentWidth = GetContentWidthPoints(targetWidth);

            int pixelWidth = isCompact ? 384 : 576;
            float scale = (float)pixelWidth / (float)contentWidth;

            int estimatedHeight = 650;
            int pixelHeight = (int)(estimatedHeight * scale);

            var store = _settings != null ? _settings.GetAllSettings() : new Dictionary<string, string>();
            string storeName = store.ContainsKey("store_name") ? store["store_name"] : "متجر رفيق";

            var bmpTemp = new Bitmap(pixelWidth, pixelHeight);
            float finalY;
            using (var g = Graphics.FromImage(bmpTemp))
            {
                g.Clear(Color.White);
                g.ScaleTransform(scale, scale);
                g.TextRenderingHint = TextRenderingHint.SingleBitPerPixelGridFit;
                g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                g.SmoothingMode = SmoothingMode.None;
                g.PixelOffsetMode = PixelOffsetMode.Half;

                finalY = RenderDailyClosingPage(g, closing, storeName, contentWidth);
            }

            int finalPixelHeight = Math.Max(50, (int)Math.Ceiling((finalY + 12f) * scale));
            var bmpFinal = new Bitmap(pixelWidth, finalPixelHeight);
            using (var gFinal = Graphics.FromImage(bmpFinal))
            {
                gFinal.DrawImage(bmpTemp, 0, 0, new Rectangle(0, 0, pixelWidth, finalPixelHeight), GraphicsUnit.Pixel);
            }
            bmpTemp.Dispose();

            return bmpFinal;
        }

        private float RenderDailyClosingPage(Graphics g, DailyClosing closing, string storeName, int printWidth)
        {
            bool isCompact = (printWidth <= 210);

            var fontTitle = new Font("Arial", isCompact ? 10f : 11f, FontStyle.Bold);
            var fontHeader = new Font("Arial", isCompact ? 8.5f : 9.5f, FontStyle.Bold);
            var fontBody = new Font("Arial", isCompact ? 7.5f : 8.5f, FontStyle.Regular);
            var fontBold = new Font("Arial", isCompact ? 7.5f : 8.5f, FontStyle.Bold);
            var fontSmall = new Font("Arial", isCompact ? 6.8f : 7.5f, FontStyle.Regular);

            var centerFormat = new StringFormat { Alignment = StringAlignment.Center, FormatFlags = StringFormatFlags.DirectionRightToLeft };
            var rightFormat = new StringFormat { Alignment = StringAlignment.Near, FormatFlags = StringFormatFlags.DirectionRightToLeft };
            var leftFormat = new StringFormat { Alignment = StringAlignment.Far };

            float y = 10;
            float contentWidth = printWidth;

            // 1. Store Header
            g.DrawString(storeName, fontTitle, Brushes.Black, new RectangleF(0, y, contentWidth, 20), centerFormat);
            y += 22;

            g.DrawString("تقرير إقفال اليومية والوردية", fontHeader, Brushes.Black, new RectangleF(0, y, contentWidth, 18), centerFormat);
            y += 20;

            g.DrawLine(Pens.Black, 0, y, contentWidth, y);
            y += 6;

            // 2. Info Block
            g.DrawString(string.Format("رقم الإقفال: #{0}", closing.ClosingNumber), fontBold, Brushes.Black, new RectangleF(0, y, contentWidth, 16), rightFormat);
            y += 16;

            g.DrawString(string.Format("يوم العمل: {0}", closing.BusinessDate), fontBody, Brushes.Black, new RectangleF(0, y, contentWidth, 16), rightFormat);
            y += 16;

            g.DrawString(string.Format("الكاشير: {0}", closing.CashierName ?? "غير محدد"), fontBody, Brushes.Black, new RectangleF(0, y, contentWidth, 16), rightFormat);
            y += 16;

            g.DrawString(string.Format("وقت الإقفال: {0}", DateTime.Now.ToString("yyyy-MM-dd HH:mm")), fontSmall, Brushes.Black, new RectangleF(0, y, contentWidth, 16), rightFormat);
            y += 18;

            g.DrawLine(Pens.Black, 0, y, contentWidth, y);
            y += 8;

            // Helper row
            Action<string, string, bool> drawRow = delegate(string label, string val, bool isBold)
            {
                var f = isBold ? fontBold : fontBody;
                g.DrawString(label, f, Brushes.Black, new RectangleF(0, y, contentWidth * 0.6f, 16), rightFormat);
                g.DrawString(val, f, Brushes.Black, new RectangleF(contentWidth * 0.55f, y, contentWidth * 0.45f, 16), leftFormat);
                y += 17;
            };

            // 3. Sales Breakdown
            g.DrawString("ملخص المبيعات والحركات", fontBold, Brushes.Black, new RectangleF(0, y, contentWidth, 16), rightFormat);
            y += 18;

            drawRow(string.Format("إجمالي المبيعات ({0} فواتير):", closing.InvoicesCount), (closing.TotalSalesPiasters / 100.0).ToString("N2") + " ج.م", true);
            drawRow("  • مبيعات نقدية (بالدرج):", (closing.CashSalesPiasters / 100.0).ToString("N2") + " ج.م", false);
            if (closing.InstapaySalesPiasters > 0)
            {
                drawRow("  • مبيعات انستاباي (خارج الدرج):", (closing.InstapaySalesPiasters / 100.0).ToString("N2") + " ج.م", false);
            }
            if (closing.VodafoneCashSalesPiasters > 0)
            {
                drawRow("  • مبيعات فودافون كاش (خارج الدرج):", (closing.VodafoneCashSalesPiasters / 100.0).ToString("N2") + " ج.م", false);
            }
            if (closing.CardSalesPiasters > 0)
            {
                drawRow("  • مبيعات فيزا سابقة:", (closing.CardSalesPiasters / 100.0).ToString("N2") + " ج.م", false);
            }
            drawRow("  • مبيعات آجلة:", (closing.CreditSalesPiasters / 100.0).ToString("N2") + " ج.م", false);

            if (closing.ExpensesPiasters > 0)
            {
                drawRow(string.Format("مصروفات الدرج ({0} إيصالات):", closing.ExpensesCount), "-" + (closing.ExpensesPiasters / 100.0).ToString("N2") + " ج.م", false);
            }

            if (closing.ReturnsTotalPiasters > 0)
            {
                drawRow(string.Format("المرتجعات ({0} عمليات):", closing.ReturnsCount), "-" + (closing.ReturnsTotalPiasters / 100.0).ToString("N2") + " ج.م", false);
            }

            if (closing.DebtPaymentsPiasters > 0)
            {
                drawRow("سداد ديون العملاء (نقدي):", "+" + (closing.DebtPaymentsPiasters / 100.0).ToString("N2") + " ج.م", false);
            }

            if (closing.CancelledCount > 0)
            {
                drawRow(string.Format("فواتير ملغاة ({0}):", closing.CancelledCount), (closing.CancelledTotalPiasters / 100.0).ToString("N2") + " ج.م", false);
            }

            if (!string.IsNullOrEmpty(closing.SummaryJson))
            {
                try
                {
                    var previewData = JsonConvert.DeserializeObject<DailyClosingPreview>(closing.SummaryJson);
                    if (previewData != null)
                    {
                        if (previewData.PurchasesDrawerCashPiasters > 0)
                        {
                            drawRow("مشتريات مسددة من الدرج:", "-" + (previewData.PurchasesDrawerCashPiasters / 100.0).ToString("N2") + " ج.م", false);
                        }
                        if (previewData.SupplierPaymentsDrawerCashPiasters > 0)
                        {
                            drawRow("سداد موردين من الدرج:", "-" + (previewData.SupplierPaymentsDrawerCashPiasters / 100.0).ToString("N2") + " ج.م", false);
                        }
                        if (previewData.EpayDrawerCashPiasters > 0)
                        {
                            drawRow("نقدية خدمات إلكترونية بالدرج:", "+" + (previewData.EpayDrawerCashPiasters / 100.0).ToString("N2") + " ج.م", false);
                        }
                        if (previewData.EpayDrawerFundingPiasters > 0)
                        {
                            drawRow("تغذية ماكينة دفع من الدرج:", "-" + (previewData.EpayDrawerFundingPiasters / 100.0).ToString("N2") + " ج.م", false);
                        }
                        if (previewData.WalletsDrawerCashPiasters > 0)
                        {
                            drawRow("نقدية محافظ بالدرج:", "+" + (previewData.WalletsDrawerCashPiasters / 100.0).ToString("N2") + " ج.م", false);
                        }
                        if (previewData.WalletsDrawerFundingPiasters > 0)
                        {
                            drawRow("تغذية محفظة من الدرج:", "-" + (previewData.WalletsDrawerFundingPiasters / 100.0).ToString("N2") + " ج.م", false);
                        }
                    }
                }
                catch
                {
                    // Fallback gracefully if summary JSON format differs
                }
            }

            y += 4;
            g.DrawLine(Pens.Black, 0, y, contentWidth, y);
            y += 8;

            // 4. جرد النقدية والخزينة
            g.DrawString("جرد النقدية والخزينة", fontBold, Brushes.Black, new RectangleF(0, y, contentWidth, 16), rightFormat);
            y += 18;

            drawRow("النقد المفترض في الدرج:", (closing.ExpectedCashPiasters / 100.0).ToString("N2") + " ج.م", true);
            drawRow("النقد الفعلي المعدود:", (closing.ActualCashPiasters / 100.0).ToString("N2") + " ج.م", true);

            string diffLabel = closing.DifferencePiasters == 0 ? "مطابق تماماً (لا يوجد فرق)" :
                               closing.DifferencePiasters > 0 ? "فائض نقدية (+):" : "عجز نقدية (-):";
            drawRow(diffLabel, (Math.Abs(closing.DifferencePiasters) / 100.0).ToString("N2") + " ج.م", true);

            y += 4;
            g.DrawLine(Pens.Black, 0, y, contentWidth, y);
            y += 8;

            // 5. Profitability & Footer
            drawRow("الربح التقريبي لليوم:", (closing.GrossProfitPiasters / 100.0).ToString("N2") + " ج.م", true);
            y += 8;

            g.DrawString("سجل إقفال رسمي ومختوم رقمياً • لا يُعدّل بعد الحفظ", fontSmall, Brushes.Black, new RectangleF(0, y, contentWidth, 16), centerFormat);
            y += 16;
            g.DrawString("نظام رفيق لنقاط البيع وإدارة المتاجر", fontSmall, Brushes.Black, new RectangleF(0, y, contentWidth, 16), centerFormat);
            y += 18;

            return y;
        }

        private string ResolvePrinterName(string explicitPrinter)
        {
            if (!string.IsNullOrWhiteSpace(explicitPrinter))
            {
                return explicitPrinter;
            }

            if (_settings != null)
            {
                string configured = _settings.Get("default_printer_name", "");
                if (!string.IsNullOrWhiteSpace(configured))
                {
                    return configured;
                }
            }

            try
            {
                return new PrinterSettings().PrinterName;
            }
            catch
            {
                return "";
            }
        }

        private string GetConfiguredPaperWidth()
        {
            if (_settings != null)
            {
                return _settings.Get("receipt_paper_width", "80mm");
            }
            return "80mm";
        }

        private bool GetConfiguredOpenDrawer()
        {
            if (_settings != null)
            {
                return _settings.Get("printer_open_drawer", "0") == "1";
            }
            return false;
        }

        private bool GetConfiguredAutoCut()
        {
            if (_settings != null)
            {
                return _settings.Get("printer_auto_cut", "1") != "0";
            }
            return true;
        }

        /// <summary>
        /// طباعة ملصق الجرعة الحراري للعبوات الصيدلانية (Story 135 / Task 192-2)
        /// خالي تماماً من أي إيموجي ومصمم باللغة العربية الواضحة لتنبيه المريض بالجرعة وتاريخ الصرف
        /// </summary>
        public PrintResult PrintDosageLabel(DosageLabelRequest request, string printerName = null, string paperWidth = null)
        {
            if (request == null)
            {
                return new PrintResult { Success = false, Message = "بيانات ملصق الجرعة فارغة." };
            }

            if (string.IsNullOrWhiteSpace(request.DrugName) && string.IsNullOrWhiteSpace(request.DosageInstructions))
            {
                return new PrintResult { Success = false, Message = "اسم الدواء وتعليمات الجرعة مطلوبة لطباعة الملصق." };
            }

            string targetPrinter = ResolvePrinterName(printerName ?? request.PrinterName);
            string targetWidth = paperWidth ?? request.PaperWidth ?? GetConfiguredPaperWidth();
            int printWidth = GetContentWidthPoints(targetWidth);

            int copies = request.Copies > 0 ? Math.Min(request.Copies, 10) : 1;
            string storeName = _settings != null ? _settings.Get("store_name", "صيدلية رفيق") : "صيدلية رفيق";
            string phone = _settings != null ? _settings.Get("store_phone", "") : "";

            if (string.IsNullOrWhiteSpace(request.DispenseDate))
            {
                request.DispenseDate = DateTime.Now.ToString("yyyy/MM/dd");
            }

            // توجيه الطباعة إلى طابعة الشبكة (TCP Port 9100) عبر ESC/POS
            if (RawPrinterHelper.IsNetworkPrinter(targetPrinter))
            {
                try
                {
                    var bmp = GenerateDosageLabelBitmap(request, storeName, phone, printWidth);
                    if (bmp == null)
                    {
                        return new PrintResult { Success = false, Message = "فشل توليد صورة ملصق الجرعة للطباعة الشبكية.", PrinterUsed = targetPrinter };
                    }

                    bool autoCut = GetConfiguredAutoCut();
                    byte[] escposBytes = RawPrinterHelper.ConvertBitmapToEscPosRaster(bmp, false, autoCut);
                    bmp.Dispose();

                    for (int c = 0; c < copies; c++)
                    {
                        string errMsg;
                        string docTitle = string.Format("Dosage Label - {0}", request.DrugName);
                        bool ok = RawPrinterHelper.SendRawBytes(targetPrinter, escposBytes, docTitle, out errMsg);
                        if (!ok)
                        {
                            return new PrintResult { Success = false, Message = "تعذر إرسال ملصق الجرعة لطابعة الشبكة: " + errMsg, PrinterUsed = targetPrinter };
                        }
                    }

                    return new PrintResult
                    {
                        Success = true,
                        Message = string.Format("تمت طباعة ملصق الجرعة ({0} نسخة) بنجاح.", copies),
                        PrinterUsed = targetPrinter
                    };
                }
                catch (Exception ex)
                {
                    Logger.Error("خطأ أثناء طباعة ملصق الجرعة على الشبكة: " + ex.Message, ex);
                    return new PrintResult { Success = false, Message = "فشل أمر طباعة الملصق: " + ex.Message, PrinterUsed = targetPrinter };
                }
            }

            // الطباعة على طابعة ويندوز القياسية
            try
            {
                using (var doc = new PrintDocument())
                {
                    if (!string.IsNullOrWhiteSpace(targetPrinter))
                    {
                        doc.PrinterSettings.PrinterName = targetPrinter;
                    }

                    if (!doc.PrinterSettings.IsValid)
                    {
                        return new PrintResult
                        {
                            Success = false,
                            Message = string.Format("الطابعة '{0}' غير مثبتة أو غير متصلة بالنظام.", targetPrinter),
                            PrinterUsed = targetPrinter
                        };
                    }

                    doc.DocumentName = string.Format("ملصق جرعة - {0}", request.DrugName);
                    doc.PrintController = new StandardPrintController();
                    doc.PrinterSettings.Copies = (short)copies;

                    doc.PrintPage += delegate(object sender, PrintPageEventArgs e)
                    {
                        e.Graphics.TextRenderingHint = TextRenderingHint.ClearTypeGridFit;
                        e.Graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
                        e.Graphics.SmoothingMode = SmoothingMode.HighQuality;
                        e.Graphics.PixelOffsetMode = PixelOffsetMode.Half;

                        RenderDosageLabelPage(e.Graphics, request, storeName, phone, printWidth);
                        e.HasMorePages = false;
                    };

                    doc.Print();
                }

                if (GetConfiguredAutoCut())
                {
                    try
                    {
                        string cutErr;
                        RawPrinterHelper.SendPaperCut(targetPrinter, out cutErr);
                    }
                    catch { }
                }

                return new PrintResult
                {
                    Success = true,
                    Message = string.Format("تمت طباعة ملصق الجرعة الدوائي ({0} نسخة) بنجاح.", copies),
                    PrinterUsed = targetPrinter
                };
            }
            catch (Exception ex)
            {
                Logger.Error("فشل طباعة ملصق الجرعة: " + ex.Message, ex);
                return new PrintResult
                {
                    Success = false,
                    Message = "تعذر إتمام طباعة ملصق الجرعة: " + ex.Message,
                    PrinterUsed = targetPrinter
                };
            }
        }

        private Bitmap GenerateDosageLabelBitmap(DosageLabelRequest req, string storeName, string phone, int contentWidth)
        {
            float scale = 203f / 72f;
            int pixelWidth = Math.Max(100, (int)Math.Ceiling(contentWidth * scale));
            int pixelHeight = (int)(240f * scale);

            var bmpTemp = new Bitmap(pixelWidth, pixelHeight);
            float finalY;
            using (var g = Graphics.FromImage(bmpTemp))
            {
                g.Clear(Color.White);
                g.ScaleTransform(scale, scale);
                g.TextRenderingHint = TextRenderingHint.ClearTypeGridFit;
                g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                g.SmoothingMode = SmoothingMode.HighQuality;
                g.PixelOffsetMode = PixelOffsetMode.Half;

                finalY = RenderDosageLabelPage(g, req, storeName, phone, contentWidth);
            }

            int finalPixelHeight = Math.Max(50, (int)Math.Ceiling((finalY + 8f) * scale));
            var bmpFinal = new Bitmap(pixelWidth, finalPixelHeight);
            using (var gFinal = Graphics.FromImage(bmpFinal))
            {
                gFinal.DrawImage(bmpTemp, 0, 0, new Rectangle(0, 0, pixelWidth, finalPixelHeight), GraphicsUnit.Pixel);
            }
            bmpTemp.Dispose();

            return bmpFinal;
        }

        private float RenderDosageLabelPage(
            Graphics g,
            DosageLabelRequest req,
            string storeName,
            string phone,
            int contentWidth)
        {
            g.Clear(Color.White);

            string fontName = "Arial";
            using (var testFont = new Font("Cairo", 9f))
            {
                if (testFont.Name == "Cairo") fontName = "Cairo";
                else
                {
                    using (var segFont = new Font("Segoe UI", 9f))
                    {
                        if (segFont.Name == "Segoe UI") fontName = "Segoe UI";
                        else
                        {
                            using (var tahomaFont = new Font("Tahoma", 9f))
                            {
                                if (tahomaFont.Name == "Tahoma") fontName = "Tahoma";
                            }
                        }
                    }
                }
            }

            bool isCompact = (contentWidth <= 210);
            float margin = 6f;
            float printableWidth = contentWidth - (margin * 2f);
            float y = margin + 2f;

            using (var fontStore = new Font(fontName, isCompact ? 9.5f : 11f, FontStyle.Bold))
            using (var fontSub = new Font(fontName, isCompact ? 7f : 8f, FontStyle.Regular))
            using (var fontPatient = new Font(fontName, isCompact ? 8.5f : 9.5f, FontStyle.Bold))
            using (var fontDrug = new Font(fontName, isCompact ? 9.5f : 11f, FontStyle.Bold))
            using (var fontDosage = new Font(fontName, isCompact ? 8.5f : 10f, FontStyle.Bold))
            using (var fontNotes = new Font(fontName, isCompact ? 7f : 7.5f, FontStyle.Regular))
            using (var fontFooter = new Font(fontName, isCompact ? 6.5f : 7f, FontStyle.Regular))
            using (var penSolid = new Pen(Color.Black, 1.2f))
            using (var penDashed = new Pen(Color.Black, 1f) { DashStyle = DashStyle.Dash })
            using (var brushBorder = new Pen(Color.FromArgb(50, 50, 50), 1f))
            {
                var rtlFormat = new StringFormat
                {
                    FormatFlags = StringFormatFlags.DirectionRightToLeft,
                    Alignment = StringAlignment.Near,
                    LineAlignment = StringAlignment.Center
                };

                var centerFormat = new StringFormat
                {
                    FormatFlags = StringFormatFlags.DirectionRightToLeft,
                    Alignment = StringAlignment.Center,
                    LineAlignment = StringAlignment.Center
                };

                // Outer border for thermal dosage sticker
                float labelTop = y;

                // 1. Store header
                string dispStore = !string.IsNullOrWhiteSpace(storeName) ? storeName : "صيدلية رفيق";
                g.DrawString(dispStore, fontStore, Brushes.Black, new RectangleF(margin, y, printableWidth, 18f), centerFormat);
                y += 18f;

                string subTitle = "ملصق إرشادات الجرعة واستخدام العلاج";
                if (!string.IsNullOrWhiteSpace(phone)) subTitle += " - هاتف: " + phone;
                g.DrawString(subTitle, fontSub, Brushes.Black, new RectangleF(margin, y, printableWidth, 14f), centerFormat);
                y += 16f;

                // Solid divider line
                g.DrawLine(penSolid, margin, y, margin + printableWidth, y);
                y += 6f;

                // 2. Patient name
                if (!string.IsNullOrWhiteSpace(req.PatientName))
                {
                    string patientText = "المريض: " + req.PatientName.Trim();
                    g.DrawString(patientText, fontPatient, Brushes.Black, new RectangleF(margin, y, printableWidth, 16f), rtlFormat);
                    y += 16f;
                }

                // 3. Drug name
                if (!string.IsNullOrWhiteSpace(req.DrugName))
                {
                    string drugText = "الدواء: " + req.DrugName.Trim();
                    g.DrawString(drugText, fontDrug, Brushes.Black, new RectangleF(margin, y, printableWidth, 18f), rtlFormat);
                    y += 20f;
                }

                // 4. Dosage instructions in a highlighted framed box
                string dosageText = !string.IsNullOrWhiteSpace(req.DosageInstructions) ? req.DosageInstructions.Trim() : "حسب تعليمات الطبيب المعالج";
                var dosageSize = g.MeasureString(dosageText, fontDosage, (int)printableWidth - 8, rtlFormat);
                float boxHeight = Math.Max(26f, dosageSize.Height + 10f);

                RectangleF dosageBox = new RectangleF(margin, y, printableWidth, boxHeight);
                g.DrawRectangle(brushBorder, dosageBox.X, dosageBox.Y, dosageBox.Width, dosageBox.Height);

                g.DrawString(dosageText, fontDosage, Brushes.Black, new RectangleF(margin + 4f, y + 4f, printableWidth - 8f, boxHeight - 8f), centerFormat);
                y += boxHeight + 6f;

                // 5. Storage condition & warnings
                if (!string.IsNullOrWhiteSpace(req.StorageCondition))
                {
                    string storageText = "تنبيه الحفظ: " + req.StorageCondition.Trim();
                    g.DrawString(storageText, fontNotes, Brushes.Black, new RectangleF(margin, y, printableWidth, 14f), rtlFormat);
                    y += 14f;
                }

                // 6. Doctor name (if provided)
                if (!string.IsNullOrWhiteSpace(req.DoctorName))
                {
                    string docText = "الطبيب: د/ " + req.DoctorName.Trim();
                    g.DrawString(docText, fontNotes, Brushes.Black, new RectangleF(margin, y, printableWidth, 14f), rtlFormat);
                    y += 14f;
                }

                // Dashed divider
                g.DrawLine(penDashed, margin, y, margin + printableWidth, y);
                y += 5f;

                // 7. Footer: Date, Pharmacist & Healing wish
                string footerText = "تاريخ الصرف: " + req.DispenseDate;
                if (!string.IsNullOrWhiteSpace(req.PharmacistName))
                {
                    footerText += " | الصيدلي: " + req.PharmacistName.Trim();
                }
                g.DrawString(footerText, fontFooter, Brushes.Black, new RectangleF(margin, y, printableWidth, 13f), centerFormat);
                y += 13f;

                g.DrawString("مع تمنياتنا لكم بتمام الصحة والشفاء العاجل", fontFooter, Brushes.Black, new RectangleF(margin, y, printableWidth, 13f), centerFormat);
                y += 15f;

                // Draw outer bounding box for the entire sticker
                g.DrawRectangle(brushBorder, margin - 2f, labelTop - 2f, printableWidth + 4f, y - labelTop + 4f);
            }

            return y;
        }
    }
}
