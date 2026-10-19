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
    /// محرك الطباعة الحرارية وأوامر ESC/POS لنظام رفيق POS
    /// يدعم طابعات الإيصالات USB والشبكية (80mm و 57mm) مع طباعة الحروف العربية والباركود والشعار
    /// ونبضة فتح درج النقدية وقص الورق التلقائي وعزل أعطال الطابعة دون تجميد النظام
    /// متوافق مع .NET Framework 4.8 و C# 5 وأنظمة ويندوز 7 SP1 حتى 11
    /// </summary>
    public class PrinterService
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
        /// نبضة فتح درج النقدية المادي عبر ESC/POS (USB Spooler أو طابعة شبكية TCP)
        /// </summary>
        public PrintResult KickDrawer(string printerName = null)
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
                bool ok = RawPrinterHelper.SendDrawerKick(targetPrinter, out errMsg);
                if (ok)
                {
                    Logger.Info("تم إرسال نبضة فتح درج النقدية بنجاح إلى: " + targetPrinter);
                    return new PrintResult
                    {
                        Success = true,
                        Message = "تم فتح درج النقدية بنجاح.",
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

            try
            {
                var store = _settings != null ? _settings.GetAllSettings() : new Dictionary<string, string>();
                string storeName = store.ContainsKey("store_name") ? store["store_name"] : "متجر رفيق";
                string phone = store.ContainsKey("store_phone") ? store["store_phone"] : "";
                string address = store.ContainsKey("store_address") ? store["store_address"] : "";
                string taxNumber = store.ContainsKey("tax_number") ? store["tax_number"] : "";
                string header = store.ContainsKey("receipt_header") ? store["receipt_header"] : "أهلاً بكم في متجرنا";
                string footer = store.ContainsKey("receipt_footer") ? store["receipt_footer"] : "شكراً لزيارتكم! البضاعة المباعة ترد وتستبدل وفقاً لسياسة المتجر.";

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
                            Message = string.Format("الطابعة '{0}' غير مثبتة أو غير متصلة بالنظام. الفاتورة رقم #{1} محفوظة بأمان في قاعدة البيانات.", targetPrinter, sale.InvoiceNumber),
                            PrinterUsed = targetPrinter
                        };
                    }

                    doc.DocumentName = string.Format(isCopy ? "إيصال رفيق (نسخة) - فاتورة #{0}" : "إيصال رفيق - فاتورة #{0}", sale.InvoiceNumber);
                    doc.PrintController = new StandardPrintController(); // طباعة صامتة بدون نوافذ حوارية مزعجة

                    doc.PrintPage += delegate(object sender, PrintPageEventArgs e)
                    {
                        // ضبط خيارات الرسم للحصول على أقصى دقة على رؤوس الطباعة الحرارية (203/300 DPI)
                        e.Graphics.TextRenderingHint = TextRenderingHint.SingleBitPerPixelGridFit;
                        e.Graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
                        e.Graphics.SmoothingMode = SmoothingMode.None;
                        e.Graphics.PixelOffsetMode = PixelOffsetMode.Half;

                        RenderReceiptPage(e.Graphics, sale, storeName, phone, address, taxNumber, header, footer, printWidth, isCopy);
                        e.HasMorePages = false;
                    };

                    doc.Print();
                }

                // تنفيذ أوامر الهاردوير: فتح درج النقدية وقص الورق التلقائي بعد انتهاء طباعة الإيصال
                if (shouldOpenDrawer)
                {
                    try
                    {
                        string kickErr;
                        RawPrinterHelper.SendDrawerKick(targetPrinter, out kickErr);
                    }
                    catch (Exception exDrawer)
                    {
                        Logger.Warn("فشل إرسال نبضة فتح درج النقدية بعد الطباعة: " + exDrawer.Message);
                    }
                }

                if (GetConfiguredAutoCut())
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

                // تسجيل إعادة الطباعة في سجل التدقيق الرقابي
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
                    catch
                    {
                        // لا تفشل الطباعة إذا حدث خطأ عرضي في سجل التدقيق
                    }
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

        /// <summary>
        /// طباعة إيصال البيع على طابعة شبكية (TCP/IP Port 9100) عبر أوامر ESC/POS النقطية عالية الدقة
        /// </summary>
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
                    byte[] escposBytes = RawPrinterHelper.ConvertBitmapToEscPosRaster(bmp, shouldOpenDrawer, autoCut);

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
            string header = store.ContainsKey("receipt_header") ? store["receipt_header"] : "أهلاً بكم في متجرنا";
            string footer = store.ContainsKey("receipt_footer") ? store["receipt_footer"] : "شكراً لزيارتكم! البضاعة المباعة ترد وتستبدل وفقاً لسياسة المتجر.";

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

            int finalPixelHeight = Math.Max(50, (int)Math.Ceiling((finalY + 12f) * scale));
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

                if (!string.IsNullOrWhiteSpace(configured))
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
                }

                string baseDir = AppDomain.CurrentDomain.BaseDirectory;
                string[] candidates = new string[]
                {
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
            float largeSize = isCompact ? 11.5f : 13f;

            using (var fontTitle = new Font(fontName, titleSize, FontStyle.Bold))
            using (var fontBold = new Font(fontName, boldSize, FontStyle.Bold))
            using (var fontRegular = new Font(fontName, regSize, FontStyle.Regular))
            using (var fontSmall = new Font(fontName, smallSize, FontStyle.Regular))
            using (var fontLarge = new Font(fontName, largeSize, FontStyle.Bold))
            using (var penDashed = new Pen(Color.Black, 1f) { DashStyle = DashStyle.Dash })
            using (var penSolid = new Pen(Color.Black, 1.5f))
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

                float y = 8;

                // 0. رسم شعار المتجر إذا وجد
                using (var logo = TryLoadStoreLogo())
                {
                    if (logo != null)
                    {
                        try
                        {
                            float maxLogoW = isCompact ? 90f : 130f;
                            float maxLogoH = isCompact ? 40f : 55f;
                            float scale = Math.Min(maxLogoW / logo.Width, maxLogoH / logo.Height);
                            if (scale > 1f) scale = 1f;

                            float drawW = logo.Width * scale;
                            float drawH = logo.Height * scale;
                            float drawX = (contentWidth - drawW) / 2f;

                            g.DrawImage(logo, drawX, y, drawW, drawH);
                            y += drawH + 4f;
                        }
                        catch
                        {
                            // تجاوز الخطأ في رسم الشعار
                        }
                    }
                }

                // 1. ترويسة المتجر
                g.DrawString(storeName, fontTitle, Brushes.Black, new RectangleF(0, y, contentWidth, isCompact ? 20 : 24), centerFormat);
                y += isCompact ? 20 : 24;

                if (!string.IsNullOrWhiteSpace(address))
                {
                    g.DrawString(address, fontSmall, Brushes.Black, new RectangleF(0, y, contentWidth, isCompact ? 14 : 16), centerFormat);
                    y += isCompact ? 14 : 16;
                }

                if (!string.IsNullOrWhiteSpace(phone))
                {
                    g.DrawString("هاتف: " + phone, fontSmall, Brushes.Black, new RectangleF(0, y, contentWidth, isCompact ? 14 : 16), centerFormat);
                    y += isCompact ? 14 : 16;
                }

                if (!string.IsNullOrWhiteSpace(taxNumber))
                {
                    g.DrawString("الرقم الضريبي: " + taxNumber, fontSmall, Brushes.Black, new RectangleF(0, y, contentWidth, isCompact ? 14 : 16), centerFormat);
                    y += isCompact ? 14 : 16;
                }

                if (!string.IsNullOrWhiteSpace(header))
                {
                    g.DrawLine(penDashed, 5, y + 2, contentWidth - 5, y + 2);
                    y += 5;
                    g.DrawString(header, fontRegular, Brushes.Black, new RectangleF(0, y, contentWidth, isCompact ? 16 : 18), centerFormat);
                    y += isCompact ? 17 : 20;
                    g.DrawLine(penDashed, 5, y, contentWidth - 5, y);
                    y += 5;
                }
                else
                {
                    g.DrawLine(penDashed, 5, y + 3, contentWidth - 5, y + 3);
                    y += 8;
                }

                // 2. بيانات الفاتورة الأساسية
                string invNumStr = string.Format("فاتورة رقم: #{0}", sale.InvoiceNumber > 0 ? sale.InvoiceNumber.ToString() : sale.Id);
                DateTime saleDate;
                if (!DateTime.TryParse(sale.CreatedAt, out saleDate)) saleDate = DateTime.Now;
                string dateStr = saleDate.ToString("yyyy/MM/dd HH:mm");

                float metaHalf = contentWidth / 2f;
                g.DrawString(invNumStr, fontBold, Brushes.Black, new RectangleF(metaHalf, y, metaHalf - 5, 17), rtlFormat);
                g.DrawString(dateStr, fontSmall, Brushes.Black, new RectangleF(5, y, metaHalf - 5, 17), leftFormat);
                y += 18;

                if (isCopy)
                {
                    g.DrawLine(penSolid, 5, y + 1, contentWidth - 5, y + 1);
                    y += 3;
                    g.DrawString("*** نسخة طبق الأصل - إيصال مكرر ***", fontBold, Brushes.Black, new RectangleF(0, y, contentWidth, 18), centerFormat);
                    y += 18;
                    g.DrawLine(penSolid, 5, y + 1, contentWidth - 5, y + 1);
                    y += 4;
                }

                if (string.Equals(sale.Status, "TEST_PILOT", StringComparison.OrdinalIgnoreCase))
                {
                    g.DrawLine(penSolid, 5, y + 1, contentWidth - 5, y + 1);
                    y += 3;
                    g.DrawString("*** فاتورة تجريبية - فحص وتدريب ***", fontBold, Brushes.Black, new RectangleF(0, y, contentWidth, 18), centerFormat);
                    y += 18;
                    g.DrawLine(penSolid, 5, y + 1, contentWidth - 5, y + 1);
                    y += 4;
                }

                if (string.Equals(sale.Status, "cancelled", StringComparison.OrdinalIgnoreCase))
                {
                    g.DrawString("*** فاتورة ملغاة ***", fontBold, Brushes.Black, new RectangleF(0, y, contentWidth, 18), centerFormat);
                    y += 20;
                }

                if (!string.IsNullOrWhiteSpace(sale.CustomerName))
                {
                    string custStr = "العميل: " + sale.CustomerName;
                    if (!string.IsNullOrWhiteSpace(sale.CustomerPhone))
                    {
                        custStr += " (" + sale.CustomerPhone + ")";
                    }
                    g.DrawString(custStr, fontSmall, Brushes.Black, new RectangleF(5, y, contentWidth - 10, 15), rtlFormat);
                    y += 16;
                }

                // 3. جدول الأصناف المباعة
                g.DrawLine(penSolid, 5, y, contentWidth - 5, y);
                y += 3;

                float colItemW = isCompact ? contentWidth * 0.44f : contentWidth * 0.48f;
                float colQtyW = isCompact ? contentWidth * 0.28f : contentWidth * 0.26f;
                float colTotW = isCompact ? contentWidth * 0.28f : contentWidth * 0.26f;

                g.DrawString("الصنف", fontBold, Brushes.Black, new RectangleF(contentWidth - colItemW - 5, y, colItemW, 16), rtlFormat);
                g.DrawString("الكمية × السعر", fontBold, Brushes.Black, new RectangleF(colTotW + 5, y, colQtyW, 16), centerFormat);
                g.DrawString("الإجمالي", fontBold, Brushes.Black, new RectangleF(5, y, colTotW - 5, 16), leftFormat);
                y += 18;
                g.DrawLine(penDashed, 5, y, contentWidth - 5, y);
                y += 5;

                // 4. أسطر الأصناف
                if (sale.Items != null)
                {
                    foreach (var item in sale.Items)
                    {
                        string unitLabel = !string.IsNullOrEmpty(item.UnitName)
                            ? item.UnitName
                            : (string.Equals(item.Unit, "kg", StringComparison.OrdinalIgnoreCase) || item.QuantityMilli % 1000 != 0 ? "كجم" : "ق");

                        string qtyNum;
                        if (string.Equals(item.Unit, "kg", StringComparison.OrdinalIgnoreCase))
                        {
                            qtyNum = (item.QuantityMilli / 1000.0).ToString("0.000");
                        }
                        else if (item.QuantityMilli % 1000 != 0)
                        {
                            qtyNum = (item.QuantityMilli / 1000.0).ToString("0.###");
                        }
                        else
                        {
                            qtyNum = (item.QuantityMilli / 1000).ToString();
                        }
                        string qtyStr = qtyNum + " " + unitLabel;

                        string rateStr = (item.UnitPricePiasters / 100.0).ToString("0.00");
                        string totalStr = (item.TotalPiasters / 100.0).ToString("0.00");

                        // السطر 1: اسم الصنف
                        g.DrawString(item.ProductName ?? "صنف", fontBold, Brushes.Black, new RectangleF(5, y, contentWidth - 10, 17), rtlFormat);
                        y += 16;

                        // السطر 2: الكمية × السعر وإجمالي الصنف
                        g.DrawString(qtyStr + " × " + rateStr, fontSmall, Brushes.Black, new RectangleF(contentWidth * 0.32f, y, contentWidth * 0.63f, 15), rtlFormat);
                        g.DrawString(totalStr, fontBold, Brushes.Black, new RectangleF(5, y, contentWidth * 0.32f, 15), leftFormat);
                        y += 17;
                    }
                }

                // 5. قسم الإجماليات
                g.DrawLine(penSolid, 5, y + 2, contentWidth - 5, y + 2);
                y += 5;

                if (sale.DiscountPiasters > 0 || sale.TaxPiasters > 0)
                {
                    g.DrawString("المجموع قبل الخصم:", fontRegular, Brushes.Black, new RectangleF(contentWidth * 0.40f, y, contentWidth * 0.55f, 15), rtlFormat);
                    g.DrawString((sale.SubtotalPiasters / 100.0).ToString("0.00") + " ج.م", fontRegular, Brushes.Black, new RectangleF(5, y, contentWidth * 0.40f, 15), leftFormat);
                    y += 17;
                }

                if (sale.DiscountPiasters > 0)
                {
                    g.DrawString("قيمة الخصم:", fontRegular, Brushes.Black, new RectangleF(contentWidth * 0.40f, y, contentWidth * 0.55f, 15), rtlFormat);
                    g.DrawString("-" + (sale.DiscountPiasters / 100.0).ToString("0.00") + " ج.م", fontRegular, Brushes.Black, new RectangleF(5, y, contentWidth * 0.40f, 15), leftFormat);
                    y += 17;
                }

                if (sale.TaxPiasters > 0)
                {
                    g.DrawString("ضريبة القيمة المضافة:", fontRegular, Brushes.Black, new RectangleF(contentWidth * 0.40f, y, contentWidth * 0.55f, 15), rtlFormat);
                    g.DrawString((sale.TaxPiasters / 100.0).ToString("0.00") + " ج.م", fontRegular, Brushes.Black, new RectangleF(5, y, contentWidth * 0.40f, 15), leftFormat);
                    y += 17;
                }

                // الصافي المستحق
                g.DrawLine(penDashed, 5, y, contentWidth - 5, y);
                y += 4;
                g.DrawString("الصافي المستحق:", fontLarge, Brushes.Black, new RectangleF(contentWidth * 0.40f, y, contentWidth * 0.55f, isCompact ? 22 : 26), rtlFormat);
                g.DrawString((sale.TotalPiasters / 100.0).ToString("0.00") + " ج.م", fontLarge, Brushes.Black, new RectangleF(5, y, contentWidth * 0.40f, isCompact ? 22 : 26), leftFormat);
                y += isCompact ? 24 : 28;
                g.DrawLine(penSolid, 5, y, contentWidth - 5, y);
                y += 5;

                // 6. طرق الدفع والمتبقي
                long totalPaid = sale.PaidPiasters > 0 ? sale.PaidPiasters : sale.TotalPiasters;
                long changeDue = sale.ServiceFeePiasters > 0 ? 0 : Math.Max(0, sale.ChangePiasters);

                string methodArabic = "نقداً";
                if (sale.PaymentMethod == "credit") methodArabic = "آجل (على الحساب)";
                else if (sale.PaymentMethod == "instapay") methodArabic = "انستاباي (InstaPay)";
                else if (sale.PaymentMethod == "vodafone_cash") methodArabic = "فودافون كاش / محفظة";
                else if (sale.PaymentMethod == "card") methodArabic = "بطاقة بنكية / فيزا";
                else if (sale.PaymentMethod == "multi") methodArabic = "دفع مقسّم / متعدد";

                g.DrawString("طريقة السداد: " + methodArabic, fontRegular, Brushes.Black, new RectangleF(contentWidth * 0.40f, y, contentWidth * 0.55f, 15), rtlFormat);
                g.DrawString((totalPaid / 100.0).ToString("0.00") + " ج.م", fontRegular, Brushes.Black, new RectangleF(5, y, contentWidth * 0.40f, 15), leftFormat);
                y += 17;

                if (sale.PaymentMethod == "multi" && sale.Payments != null && sale.Payments.Count > 1)
                {
                    for (int pIdx = 0; pIdx < sale.Payments.Count; pIdx++)
                    {
                        var p = sale.Payments[pIdx];
                        if (p == null || p.AmountPiasters <= 0) continue;
                        string pName = "نقداً";
                        if (p.Method == "credit") pName = "آجل (شكك)";
                        else if (p.Method == "card") pName = "فيزا / بطاقة";
                        else if (p.Method == "instapay") pName = "إنستاباي";
                        else if (p.Method == "vodafone_cash") pName = "محفظة كاش";

                        g.DrawString("  • " + pName + ":", fontSmall, Brushes.Black, new RectangleF(contentWidth * 0.40f, y, contentWidth * 0.55f, 14), rtlFormat);
                        g.DrawString((p.AmountPiasters / 100.0).ToString("0.00") + " ج.م", fontSmall, Brushes.Black, new RectangleF(5, y, contentWidth * 0.40f, 14), leftFormat);
                        y += 15;
                    }
                }

                if (changeDue > 0)
                {
                    g.DrawString("المبلغ المتبقي (الباقي):", fontBold, Brushes.Black, new RectangleF(contentWidth * 0.40f, y, contentWidth * 0.55f, 17), rtlFormat);
                    g.DrawString((changeDue / 100.0).ToString("0.00") + " ج.م", fontBold, Brushes.Black, new RectangleF(5, y, contentWidth * 0.40f, 17), leftFormat);
                    y += 18;
                }

                // 7. خاتمة الإيصال
                if (!string.IsNullOrWhiteSpace(footer))
                {
                    y += 4;
                    g.DrawLine(penDashed, 5, y, contentWidth - 5, y);
                    y += 5;
                    g.DrawString(footer, fontSmall, Brushes.Black, new RectangleF(5, y, contentWidth - 10, isCompact ? 30 : 36), centerFormat);
                    y += isCompact ? 32 : 38;
                }

                // 8. باركود Code 128 قياسي عالي الدقة وسريع المسح
                string barcodeValue = sale.InvoiceNumber > 0 ? sale.InvoiceNumber.ToString("D8") : (sale.Id ?? "00000000");
                float barcodeH = isCompact ? 36f : 42f;
                var barcodeRect = new RectangleF(10, y, contentWidth - 20, barcodeH);
                BarcodeGenerator.DrawBarcode(g, barcodeValue, barcodeRect, showText: true, textFont: fontSmall);
                y += barcodeH + 6;

                // 9. حقوق وتوقيع مطور النظام (دعاية ثابتة لا يمكن لغير الروت تغييرها)
                string defaultSig = "نظام رفيق للأنظمة والحلول البرمجية | تطوير: م. إسلام خالد - 01097782965";
                string devSig = _settings != null ? _settings.Get("developer_signature", defaultSig) : defaultSig;
                if (string.IsNullOrWhiteSpace(devSig) || devSig == "نظام رفيق لإدارة المتاجر ونقاط البيع | تطوير: م. إسلام خالد")
                {
                    devSig = defaultSig;
                }
                y += 2;
                g.DrawLine(penDashed, 5, y, contentWidth - 5, y);
                y += 4;
                g.DrawString(devSig, fontSmall, Brushes.Black, new RectangleF(2, y, contentWidth - 4, isCompact ? 28 : 18), centerFormat);
                y += isCompact ? 30 : 20;

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
                        RawPrinterHelper.SendDrawerKick(targetPrinter, out kickErr);
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
                    byte[] escposBytes = RawPrinterHelper.ConvertBitmapToEscPosRaster(bmp, shouldOpenDrawer, autoCut);

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
                string retBarcode = string.Format("RET{0:D6}", returnObj.ReturnNumber);
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
    }
}
