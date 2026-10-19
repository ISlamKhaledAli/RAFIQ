using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Printing;
using System.Drawing.Text;
using RafiqPOS.Common;
using RafiqPOS.Models;

namespace RafiqPOS.Services
{
    /// <summary>
    /// خدمة متخصصة في طباعة وتوليد ملصقات الباركود والأسعار
    /// تدعم طابعات الباركود الحرارية (بكرات الرول: 38x25, 50x30 ومقاسات مخصصة) وطابعات A4 بالملصقات الشبكية
    /// متوافقة بالكامل مع ويندوز 7 وويندوز 11 وبدون أي إنترنت
    /// ومصممة بأعلى معايير الدقة والـ Quiet Zones لضمان قراءة سريعة بكافة أجهزة المسح الليزرية
    /// </summary>
    public class BarcodeLabelService
    {
        private readonly SettingsService _settings;
        private readonly PrinterService _printerService;

        public BarcodeLabelService(SettingsService settings, PrinterService printerService)
        {
            _settings = settings;
            _printerService = printerService;
        }

        /// <summary>
        /// طباعة دفعة ملصقات لمنتج واحد أو مجموعة منتجات
        /// </summary>
        public PrintLabelsResult PrintLabels(PrintLabelsRequest request)
        {
            if (request == null || request.Items == null || request.Items.Count == 0)
            {
                return new PrintLabelsResult
                {
                    Success = false,
                    Message = "قائمة الأصناف المراد طباعة ملصقات لها فارغة."
                };
            }

            try
            {
                string targetPrinter = ResolveLabelPrinter(request.Config != null ? request.Config.PrinterName : null);
                if (string.IsNullOrEmpty(targetPrinter))
                {
                    return new PrintLabelsResult
                    {
                        Success = false,
                        Message = "لم يتم العثور على أي طابعة مثبتة في النظام لطباعة الملصقات."
                    };
                }

                var flatList = new List<BarcodeLabelItem>();
                for (int i = 0; i < request.Items.Count; i++)
                {
                    var item = request.Items[i];
                    if (item == null || string.IsNullOrEmpty(item.Barcode)) continue;
                    int count = Math.Max(1, item.Copies);
                    for (int c = 0; c < count; c++)
                    {
                        flatList.Add(item);
                    }
                }

                if (flatList.Count == 0)
                {
                    return new PrintLabelsResult
                    {
                        Success = false,
                        Message = "لا توجد ملصقات صالحة للطباعة (تأكد من وجود باركود للأصناف)."
                    };
                }

                var config = request.Config ?? new BarcodeLabelConfig();
                if (string.IsNullOrEmpty(config.StoreName) && _settings != null)
                {
                    config.StoreName = _settings.Get("store_name", "متجر رفيق");
                }

                bool isA4 = config.PaperSize != null && config.PaperSize.StartsWith("a4", StringComparison.OrdinalIgnoreCase);

                if (isA4)
                {
                    return PrintA4SheetLabels(flatList, config, targetPrinter);
                }
                else
                {
                    return PrintRollLabels(flatList, config, targetPrinter);
                }
            }
            catch (Exception ex)
            {
                Logger.Error("خطأ في طباعة ملصقات الباركود: " + ex.Message, ex);
                return new PrintLabelsResult
                {
                    Success = false,
                    Message = "فشلت عملية الطباعة: " + ex.Message
                };
            }
        }

        /// <summary>
        /// تحويل بنود فاتورة مشتريات إلى قائمة عناصر ملصقات باركود بعدد النسخ المطابق للكمية المشتراة
        /// </summary>
        public static List<BarcodeLabelItem> CreateItemsFromPurchase(Purchase purchase, IDictionary<string, long> productSellPrices = null)
        {
            var result = new List<BarcodeLabelItem>();
            if (purchase == null || purchase.Items == null || purchase.Items.Count == 0)
            {
                return result;
            }

            for (int i = 0; i < purchase.Items.Count; i++)
            {
                var pItem = purchase.Items[i];
                if (pItem == null) continue;

                // احتساب الكمية المستلمة كاملة (الكمية المشتراة + بضاعة البونص المجانية)
                long totalMilli = pItem.QuantityMilli + pItem.BonusQuantityMilli;
                int copies = (int)Math.Max(1, Math.Round(totalMilli / 1000.0));

                long sellPrice = pItem.NewSellingPricePiasters.HasValue && pItem.NewSellingPricePiasters.Value > 0
                    ? pItem.NewSellingPricePiasters.Value
                    : pItem.UnitCostPiasters;

                if (productSellPrices != null && !string.IsNullOrEmpty(pItem.ProductId) && productSellPrices.ContainsKey(pItem.ProductId))
                {
                    sellPrice = productSellPrices[pItem.ProductId];
                }

                result.Add(new BarcodeLabelItem
                {
                    ProductId = pItem.ProductId,
                    ProductName = pItem.ProductName,
                    Barcode = !string.IsNullOrEmpty(pItem.Barcode) ? pItem.Barcode : "",
                    PricePiasters = sellPrice,
                    Copies = copies,
                    ExpiryDate = !string.IsNullOrEmpty(pItem.ExpiryDate) ? pItem.ExpiryDate : "",
                    VariantInfo = !string.IsNullOrEmpty(pItem.BatchNumber) ? ("شحنة: " + pItem.BatchNumber) : ""
                });
            }

            return result;
        }

        /// <summary>
        /// طباعة ملصق تجريبي لاختبار أبعاد ورق الملصق وجودة الخط والباركود
        /// </summary>
        public PrintLabelsResult PrintTestLabel(string printerName = null, string paperSize = "38x25", int customW = 0, int customH = 0)
        {
            var testItem = new BarcodeLabelItem
            {
                ProductId = "test_item_label",
                ProductName = "شاي العروسة ناعم فاخر 250 جم",
                Barcode = "6224005544015",
                PricePiasters = 5500,
                VariantInfo = "عبوة أصلية",
                Copies = 1
            };

            var req = new PrintLabelsRequest
            {
                Items = new List<BarcodeLabelItem> { testItem },
                Config = new BarcodeLabelConfig
                {
                    PrinterName = printerName,
                    PaperSize = paperSize,
                    CustomWidthMm = customW,
                    CustomHeightMm = customH,
                    ShowStoreName = true,
                    ShowPrice = true,
                    ShowBarcodeText = true,
                    ShowExpiryDate = false
                }
            };

            return PrintLabels(req);
        }

        private PrintLabelsResult PrintRollLabels(List<BarcodeLabelItem> labels, BarcodeLabelConfig config, string printerName)
        {
            float widthMm = 38f;
            float heightMm = 25f;
            ParseLabelDimensions(config.PaperSize, config.CustomWidthMm, config.CustomHeightMm, out widthMm, out heightMm);

            int widthHundredths = (int)Math.Round(widthMm * 3.937f);
            int heightHundredths = (int)Math.Round(heightMm * 3.937f);

            int currentLabelIndex = 0;

            using (var printDoc = new PrintDocument())
            {
                printDoc.PrinterSettings.PrinterName = printerName;
                printDoc.DefaultPageSettings.PaperSize = new PaperSize("CustomLabel", widthHundredths, heightHundredths);
                printDoc.DefaultPageSettings.Margins = new Margins(0, 0, 0, 0);

                printDoc.PrintPage += delegate(object sender, PrintPageEventArgs ev)
                {
                    if (currentLabelIndex >= labels.Count)
                    {
                        ev.HasMorePages = false;
                        return;
                    }

                    // ضبط خيارات الرسم للحصول على أقصى دقة وتباين للباركود على رؤوس الطباعة الحرارية
                    ev.Graphics.SmoothingMode = SmoothingMode.None;
                    ev.Graphics.TextRenderingHint = TextRenderingHint.SingleBitPerPixelGridFit;
                    ev.Graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
                    ev.Graphics.PixelOffsetMode = PixelOffsetMode.Half;

                    var item = labels[currentLabelIndex];
                    float actualW = ev.PageBounds.Width > 0 ? Math.Min(ev.PageBounds.Width, (float)widthHundredths) : (float)widthHundredths;
                    float actualH = ev.PageBounds.Height > 0 ? Math.Min(ev.PageBounds.Height, (float)heightHundredths) : (float)heightHundredths;
                    var rect = new RectangleF(0, 0, actualW, actualH);

                    DrawSingleLabel(ev.Graphics, item, config, rect, widthMm, heightMm);

                    currentLabelIndex++;
                    ev.HasMorePages = (currentLabelIndex < labels.Count);
                };

                printDoc.Print();
            }

            return new PrintLabelsResult
            {
                Success = true,
                TotalLabelsPrinted = labels.Count,
                PrinterUsed = printerName,
                Message = string.Format("تمت طباعة {0} ملصق بنجاح على طابعة: {1}", labels.Count, printerName)
            };
        }

        private PrintLabelsResult PrintA4SheetLabels(List<BarcodeLabelItem> labels, BarcodeLabelConfig config, string printerName)
        {
            int cols = 3;
            int rows = 8;
            if (string.Equals(config.PaperSize, "a4_40", StringComparison.OrdinalIgnoreCase))
            {
                cols = 4;
                rows = 10;
            }

            int currentLabelIndex = 0;

            using (var printDoc = new PrintDocument())
            {
                printDoc.PrinterSettings.PrinterName = printerName;
                printDoc.DefaultPageSettings.Landscape = false;
                printDoc.DefaultPageSettings.Margins = new Margins(20, 20, 20, 20);

                printDoc.PrintPage += delegate(object sender, PrintPageEventArgs ev)
                {
                    ev.Graphics.SmoothingMode = SmoothingMode.None;
                    ev.Graphics.TextRenderingHint = TextRenderingHint.SingleBitPerPixelGridFit;
                    ev.Graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
                    ev.Graphics.PixelOffsetMode = PixelOffsetMode.Half;

                    float marginX = ev.MarginBounds.Left;
                    float marginY = ev.MarginBounds.Top;
                    float totalW = ev.MarginBounds.Width;
                    float totalH = ev.MarginBounds.Height;

                    float cellW = totalW / cols;
                    float cellH = totalH / rows;

                    for (int r = 0; r < rows; r++)
                    {
                        for (int c = 0; c < cols; c++)
                        {
                            if (currentLabelIndex >= labels.Count) break;

                            var item = labels[currentLabelIndex];
                            int colIndexRtl = (cols - 1) - c;
                            float x = marginX + (colIndexRtl * cellW) + 2f;
                            float y = marginY + (r * cellH) + 2f;
                            var cellRect = new RectangleF(x, y, cellW - 4f, cellH - 4f);

                            DrawSingleLabel(ev.Graphics, item, config, cellRect, (cellW - 4f) / 3.937f, (cellH - 4f) / 3.937f);
                            currentLabelIndex++;
                        }
                    }

                    ev.HasMorePages = (currentLabelIndex < labels.Count);
                };

                printDoc.Print();
            }

            return new PrintLabelsResult
            {
                Success = true,
                TotalLabelsPrinted = labels.Count,
                PrinterUsed = printerName,
                Message = string.Format("تمت طباعة {0} ملصق على ورق A4 بنجاح على طابعة: {1}", labels.Count, printerName)
            };
        }

        public void DrawSingleLabel(Graphics g, BarcodeLabelItem item, BarcodeLabelConfig config, RectangleF rect, float widthMm, float heightMm)
        {
            if (g == null || item == null) return;

            // سلسلة الخطوط العربية المتوافقة مع ويندوز 7 حتى 11
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

            var centerRtlFormat = new StringFormat
            {
                FormatFlags = StringFormatFlags.DirectionRightToLeft | StringFormatFlags.NoWrap,
                Alignment = StringAlignment.Center,
                LineAlignment = StringAlignment.Center,
                Trimming = StringTrimming.EllipsisCharacter
            };

            var centerFormat = new StringFormat
            {
                Alignment = StringAlignment.Center,
                LineAlignment = StringAlignment.Center,
                FormatFlags = StringFormatFlags.NoWrap,
                Trimming = StringTrimming.EllipsisCharacter
            };

            // حساب المنطقة الهادئة (Quiet Zone) على جانبي الباركود (2.5mm على الأقل وفق معيار ISO 15417)
            // 2.5mm تعادل 9.84 في وحدة 1/100 بوصة (نقربها لـ 10 وحدات كحد أدنى مضمون)
            float quietZoneUnits = Math.Max(10f, (widthMm * 3.937f) * 0.05f);
            float paddingX = quietZoneUnits;
            float contentX = rect.X + paddingX;
            float contentW = Math.Max(10f, rect.Width - (paddingX * 2));
            float curY = rect.Y + 2f;

            // تحديد أحجام الخطوط ديناميكياً بحسب ارتفاع الملصق (38x25, 50x30, أو المقاسات الكبيرة)
            bool isSmall = heightMm <= 26f;
            bool isMedium = heightMm > 26f && heightMm <= 35f;

            float storeFontSize = isSmall ? 6.5f : (isMedium ? 7.5f : 8.5f);
            float nameFontSize = isSmall ? 7.5f : (isMedium ? 8.5f : 10f);
            float priceFontSize = isSmall ? 9.5f : (isMedium ? 11f : 13f);
            float smallBarcodeFontSize = isSmall ? 7f : 8f;

            using (var fontStore = new Font(fontName, storeFontSize, FontStyle.Regular, GraphicsUnit.Point))
            using (var fontNameObj = new Font(fontName, nameFontSize, FontStyle.Bold, GraphicsUnit.Point))
            using (var fontPrice = new Font(fontName, priceFontSize, FontStyle.Bold, GraphicsUnit.Point))
            using (var fontBarcodeText = new Font("Courier New", smallBarcodeFontSize, FontStyle.Bold, GraphicsUnit.Point))
            using (var brush = new SolidBrush(Color.Black))
            {
                // 1. اسم المحل (اختياري)
                if (config.ShowStoreName && !string.IsNullOrEmpty(config.StoreName))
                {
                    float h = isSmall ? 10f : 13f;
                    var storeRect = new RectangleF(contentX, curY, contentW, h);
                    g.DrawString(config.StoreName, fontStore, brush, storeRect, centerRtlFormat);
                    curY += h;
                }

                // 2. اسم المنتج ومقاسه/لونه
                string displayName = item.ProductName ?? "";
                if (!string.IsNullOrEmpty(item.VariantInfo))
                {
                    displayName += " (" + item.VariantInfo + ")";
                }

                float nameH = isSmall ? 12f : 15f;
                var nameRect = new RectangleF(contentX, curY, contentW, nameH);
                g.DrawString(displayName, fontNameObj, brush, nameRect, centerRtlFormat);
                curY += nameH;

                // 3. السعر بالجنيه المصري (اختياري)
                if (config.ShowPrice)
                {
                    // دالة Money.FormatPiasters تُرجع مسبقاً النص بصيغة "55.00 ج.م"
                    string priceText = Money.FormatPiasters(item.PricePiasters);
                    float priceH = isSmall ? 14f : 18f;
                    var priceRect = new RectangleF(contentX, curY, contentW, priceH);
                    g.DrawString(priceText, fontPrice, brush, priceRect, centerRtlFormat);
                    curY += priceH;
                }

                // 4. الباركود الصوري ورقم الباركود مع Quiet Zone متوازنة
                float expH = isSmall ? 8f : 10f;
                float remainingH = (rect.Y + rect.Height) - curY - 2f;
                if (config.ShowExpiryDate && !string.IsNullOrEmpty(item.ExpiryDate))
                {
                    remainingH -= expH;
                }

                if (remainingH > 14f && !string.IsNullOrEmpty(item.Barcode))
                {
                    var barcodeRect = new RectangleF(contentX, curY, contentW, remainingH);
                    BarcodeGenerator.DrawBarcode(g, item.Barcode, barcodeRect, config.ShowBarcodeText, fontBarcodeText);
                    curY += remainingH;
                }

                // 5. تاريخ الصلاحية / التعبئة (اختياري)
                if (config.ShowExpiryDate && !string.IsNullOrEmpty(item.ExpiryDate))
                {
                    using (var fontExp = new Font(fontName, 6.5f, FontStyle.Regular, GraphicsUnit.Point))
                    {
                        var expRect = new RectangleF(contentX, curY, contentW, expH);
                        g.DrawString("صلاحية: " + item.ExpiryDate, fontExp, brush, expRect, centerRtlFormat);
                    }
                }
            }
        }

        public void ParseLabelDimensions(string paperSize, int customW, int customH, out float widthMm, out float heightMm)
        {
            widthMm = 38f;
            heightMm = 25f;

            if (customW > 0 && customH > 0)
            {
                widthMm = customW;
                heightMm = customH;
                return;
            }

            if (string.IsNullOrEmpty(paperSize)) return;

            string s = paperSize.ToLowerInvariant();
            if (s == "38x25") { widthMm = 38f; heightMm = 25f; }
            else if (s == "40x30") { widthMm = 40f; heightMm = 30f; }
            else if (s == "50x25") { widthMm = 50f; heightMm = 25f; }
            else if (s == "50x30") { widthMm = 50f; heightMm = 30f; }
            else if (s == "50x40") { widthMm = 50f; heightMm = 40f; }
            else if (s == "60x40") { widthMm = 60f; heightMm = 40f; }
            else if (s == "80x50") { widthMm = 80f; heightMm = 50f; }
            else if (s == "100x150") { widthMm = 100f; heightMm = 150f; }
            else if (s.Contains("x"))
            {
                string[] parts = s.Split('x');
                float parsedW, parsedH;
                if (parts.Length == 2 && float.TryParse(parts[0], out parsedW) && float.TryParse(parts[1], out parsedH) && parsedW >= 15 && parsedH >= 10)
                {
                    widthMm = parsedW;
                    heightMm = parsedH;
                }
            }
        }

        private string ResolveLabelPrinter(string explicitPrinter)
        {
            if (!string.IsNullOrWhiteSpace(explicitPrinter))
            {
                return explicitPrinter;
            }

            if (_settings != null)
            {
                string configuredLabelPrinter = _settings.Get("default_label_printer_name", "");
                if (!string.IsNullOrWhiteSpace(configuredLabelPrinter))
                {
                    return configuredLabelPrinter;
                }

                string configuredReceiptPrinter = _settings.Get("default_printer_name", "");
                if (!string.IsNullOrWhiteSpace(configuredReceiptPrinter))
                {
                    return configuredReceiptPrinter;
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
    }
}
