using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Printing;
using RafiqPOS.Common;
using RafiqPOS.Models;

namespace RafiqPOS.Services
{
    /// <summary>
    /// خدمة متخصصة في طباعة وتوليد ملصقات الباركود والأسعار
    /// تدعم طابعات الباركود الحرارية (بكرات الرول) وطابعات A4 بالملصقات الشبكية
    /// متوافقة بالكامل مع ويندوز 7 وويندوز 11 وبدون أي إنترنت
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
        /// Task 57-2: طباعة دفعة ملصقات لمنتج واحد أو مجموعة منتجات
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
                    config.StoreName = _settings.Get("store_name", "رفيق سوبرماركت");
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
        /// Task 57-1: طباعة ملصق تجريبي لاختبار أبعاد ورق الملصق وجودة الخط والباركود
        /// </summary>
        public PrintLabelsResult PrintTestLabel(string printerName = null, string paperSize = "38x25")
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

                    var item = labels[currentLabelIndex];
                    var rect = new RectangleF(0, 0, ev.PageBounds.Width, ev.PageBounds.Height);

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

            int labelsPerPage = cols * rows;
            int currentLabelIndex = 0;

            using (var printDoc = new PrintDocument())
            {
                printDoc.PrinterSettings.PrinterName = printerName;
                printDoc.DefaultPageSettings.Landscape = false;
                printDoc.DefaultPageSettings.Margins = new Margins(20, 20, 20, 20);

                printDoc.PrintPage += delegate(object sender, PrintPageEventArgs ev)
                {
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
                            // Right to left layout for columns
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

            g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
            g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;

            var centerFormat = new StringFormat
            {
                Alignment = StringAlignment.Center,
                LineAlignment = StringAlignment.Center,
                FormatFlags = StringFormatFlags.NoWrap,
                Trimming = StringTrimming.EllipsisCharacter
            };

            var rtlFormat = new StringFormat
            {
                FormatFlags = StringFormatFlags.DirectionRightToLeft | StringFormatFlags.NoWrap,
                Alignment = StringAlignment.Center,
                LineAlignment = StringAlignment.Center,
                Trimming = StringTrimming.EllipsisCharacter
            };

            float padding = 4f;
            float contentX = rect.X + padding;
            float contentW = rect.Width - (padding * 2);
            float curY = rect.Y + 2f;

            // تحديد أحجام الخطوط ديناميكياً بحسب ارتفاع الملصق
            bool isSmall = heightMm <= 26f;
            float storeFontSize = isSmall ? 6.5f : 7.5f;
            float nameFontSize = isSmall ? 7.5f : 9f;
            float priceFontSize = isSmall ? 9.5f : 12f;

            using (var fontStore = new Font("Cairo", storeFontSize, FontStyle.Regular, GraphicsUnit.Point))
            using (var fontName = new Font("Cairo", nameFontSize, FontStyle.Bold, GraphicsUnit.Point))
            using (var fontPrice = new Font("Cairo", priceFontSize, FontStyle.Bold, GraphicsUnit.Point))
            using (var brush = new SolidBrush(Color.Black))
            {
                // 1. اسم المحل (اختياري)
                if (config.ShowStoreName && !string.IsNullOrEmpty(config.StoreName))
                {
                    float h = isSmall ? 10f : 12f;
                    var storeRect = new RectangleF(contentX, curY, contentW, h);
                    g.DrawString(config.StoreName, fontStore, brush, storeRect, centerFormat);
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
                g.DrawString(displayName, fontName, brush, nameRect, rtlFormat);
                curY += nameH;

                // 3. السعر بالجنيه المصري (اختياري)
                if (config.ShowPrice)
                {
                    float priceEgp = item.PricePiasters / 100f;
                    string priceText = string.Format("{0:N2} ج.م", priceEgp);
                    float priceH = isSmall ? 14f : 18f;
                    var priceRect = new RectangleF(contentX, curY, contentW, priceH);
                    g.DrawString(priceText, fontPrice, brush, priceRect, centerFormat);
                    curY += priceH;
                }

                // 4. الباركود الصوري ورقم الباركود
                float remainingH = (rect.Y + rect.Height) - curY - 2f;
                if (config.ShowExpiryDate && !string.IsNullOrEmpty(item.ExpiryDate))
                {
                    remainingH -= 10f;
                }

                if (remainingH > 15f && !string.IsNullOrEmpty(item.Barcode))
                {
                    var barcodeRect = new RectangleF(contentX, curY, contentW, remainingH);
                    BarcodeGenerator.DrawBarcode(g, item.Barcode, barcodeRect, config.ShowBarcodeText);
                    curY += remainingH;
                }

                // 5. تاريخ الصلاحية / التعبئة (اختياري)
                if (config.ShowExpiryDate && !string.IsNullOrEmpty(item.ExpiryDate))
                {
                    using (var fontExp = new Font("Cairo", 6.5f, FontStyle.Regular, GraphicsUnit.Point))
                    {
                        var expRect = new RectangleF(contentX, curY, contentW, 10f);
                        g.DrawString("صلاحية: " + item.ExpiryDate, fontExp, brush, expRect, centerFormat);
                    }
                }
            }
        }

        private void ParseLabelDimensions(string paperSize, int customW, int customH, out float widthMm, out float heightMm)
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
