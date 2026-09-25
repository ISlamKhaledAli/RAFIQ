using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Printing;
using System.IO;
using RafiqPOS.Common;
using RafiqPOS.Models;

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

    public class PrinterService
    {
        private readonly SettingsService _settings;

        public PrinterService(SettingsService settings)
        {
            _settings = settings;
        }

        /// <summary>
        /// Task 53-1: الحصول على قائمة الطابعات المثبتة في نظام ويندوز
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
        /// Task 53-3 & 31-4: طباعة صفحة اختبار عربية للتأكد من عمل الطابعة وجودة الحروف
        /// </summary>
        public PrintResult PrintTestReceipt(string printerName = null, string paperWidth = null)
        {
            try
            {
                var storeSettings = _settings != null ? _settings.GetAllSettings() : new Dictionary<string, string>();
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
                    Notes = "فاتورة تجريبية لاختبار جودة الطباعة والحروف العربية",
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
                    Message = "فشل أمر الطباعة: " + ex.Message,
                    PrinterUsed = printerName
                };
            }
        }

        /// <summary>
        /// Task 31-1 & 31-2 & 133-3: طباعة إيصال بيع حراري عربي كامل على طابعة ويندوز مع دعم إعادة طباعة نسخة طبق الأصل
        /// </summary>
        public PrintResult PrintSaleReceipt(Sale sale, string printerName = null, string paperWidth = null, bool? openDrawer = null, bool isCopy = false)
        {
            if (sale == null)
            {
                return new PrintResult { Success = false, Message = "بيانات الفاتورة فارغة" };
            }

            string targetPrinter = ResolvePrinterName(printerName);
            string targetWidth = paperWidth ?? GetConfiguredPaperWidth();
            bool shouldOpenDrawer = openDrawer.HasValue ? openDrawer.Value : GetConfiguredOpenDrawer();

            try
            {
                var store = _settings != null ? _settings.GetAllSettings() : new Dictionary<string, string>();
                string storeName = store.ContainsKey("store_name") ? store["store_name"] : "متجر رفيق";
                string phone = store.ContainsKey("store_phone") ? store["store_phone"] : "";
                string address = store.ContainsKey("store_address") ? store["store_address"] : "";
                string taxNumber = store.ContainsKey("tax_number") ? store["tax_number"] : "";
                string header = store.ContainsKey("receipt_header") ? store["receipt_header"] : "أهلاً بكم في متجرنا";
                string footer = store.ContainsKey("receipt_footer") ? store["receipt_footer"] : "شكراً لزيارتكم! البضاعة المباعة ترد وتستبدل وفقاً لسياسة المتجر.";

                // Determine paper width in points (1 inch = 72 points, 100 hundredths of an inch)
                // 80mm ~ 3.15 inches ~ 315 (standard printable ~ 285)
                // 57mm ~ 2.25 inches ~ 225 (standard printable ~ 195)
                int printWidth = (targetWidth == "57mm") ? 200 : 285;

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

                    doc.DocumentName = string.Format(isCopy ? "إيصال رفيق (نسخة) - فاتورة #{0}" : "إيصال رفيق - فاتورة #{0}", sale.InvoiceNumber);
                    doc.PrintController = new StandardPrintController(); // Silent printing without Windows popup dialog

                    doc.PrintPage += delegate(object sender, PrintPageEventArgs e)
                    {
                        RenderReceiptPage(e.Graphics, sale, storeName, phone, address, taxNumber, header, footer, printWidth, isCopy);
                        e.HasMorePages = false;
                    };

                    doc.Print();
                }

                // Task 133-3: تسجيل إعادة الطباعة في سجل التدقيق (Audit Log)
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
                        // Don't fail printing if audit log recording hits transient issue
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
                    Message = "خطأ أثناء الطباعة: " + ex.Message,
                    PrinterUsed = targetPrinter
                };
            }
        }

        private void RenderReceiptPage(
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

            // Arabic-friendly font fallback chain
            string fontName = "Arial";
            using (var testFont = new Font("Cairo", 9f))
            {
                if (testFont.Name == "Cairo") fontName = "Cairo";
                else
                {
                    using (var segFont = new Font("Segoe UI", 9f))
                    {
                        if (segFont.Name == "Segoe UI") fontName = "Segoe UI";
                    }
                }
            }

            using (var fontTitle = new Font(fontName, 12f, FontStyle.Bold))
            using (var fontBold = new Font(fontName, 9f, FontStyle.Bold))
            using (var fontRegular = new Font(fontName, 8.5f, FontStyle.Regular))
            using (var fontSmall = new Font(fontName, 7.5f, FontStyle.Regular))
            using (var fontLarge = new Font(fontName, 13f, FontStyle.Bold))
            using (var penDashed = new Pen(Color.Black, 1f) { DashStyle = System.Drawing.Drawing2D.DashStyle.Dash })
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

                float y = 10;

                // 1. Store Header
                g.DrawString(storeName, fontTitle, Brushes.Black, new RectangleF(0, y, contentWidth, 24), centerFormat);
                y += 24;

                if (!string.IsNullOrWhiteSpace(address))
                {
                    g.DrawString(address, fontSmall, Brushes.Black, new RectangleF(0, y, contentWidth, 16), centerFormat);
                    y += 16;
                }

                if (!string.IsNullOrWhiteSpace(phone))
                {
                    g.DrawString("هاتف: " + phone, fontSmall, Brushes.Black, new RectangleF(0, y, contentWidth, 16), centerFormat);
                    y += 16;
                }

                if (!string.IsNullOrWhiteSpace(taxNumber))
                {
                    g.DrawString("الرقم الضريبي: " + taxNumber, fontSmall, Brushes.Black, new RectangleF(0, y, contentWidth, 16), centerFormat);
                    y += 16;
                }

                if (!string.IsNullOrWhiteSpace(header))
                {
                    g.DrawLine(penDashed, 5, y + 2, contentWidth - 5, y + 2);
                    y += 6;
                    g.DrawString(header, fontRegular, Brushes.Black, new RectangleF(0, y, contentWidth, 18), centerFormat);
                    y += 20;
                    g.DrawLine(penDashed, 5, y, contentWidth - 5, y);
                    y += 6;
                }
                else
                {
                    g.DrawLine(penDashed, 5, y + 4, contentWidth - 5, y + 4);
                    y += 10;
                }

                // 2. Invoice Meta Info
                string invNumStr = string.Format("فاتورة رقم: #{0}", sale.InvoiceNumber > 0 ? sale.InvoiceNumber.ToString() : sale.Id);
                DateTime saleDate;
                if (!DateTime.TryParse(sale.CreatedAt, out saleDate)) saleDate = DateTime.Now;
                string dateStr = saleDate.ToString("yyyy/MM/dd HH:mm");

                g.DrawString(invNumStr, fontBold, Brushes.Black, new RectangleF(contentWidth / 2f, y, contentWidth / 2f - 5, 18), rtlFormat);
                g.DrawString(dateStr, fontSmall, Brushes.Black, new RectangleF(5, y, contentWidth / 2f - 5, 18), leftFormat);
                y += 20;

                // Task 133-3: علامة نسخة طبق الأصل البارزة على الإيصال المطبوع
                if (isCopy)
                {
                    g.DrawLine(penSolid, 5, y + 1, contentWidth - 5, y + 1);
                    y += 3;
                    g.DrawString("*** نسخة طبق الأصل - إيصال مكرر ***", fontBold, Brushes.Black, new RectangleF(0, y, contentWidth, 18), centerFormat);
                    y += 18;
                    g.DrawLine(penSolid, 5, y + 1, contentWidth - 5, y + 1);
                    y += 4;
                }

                // Task 137-3: علامة فاتورة تجريبية بارزة على الإيصال
                if (string.Equals(sale.Status, "TEST_PILOT", StringComparison.OrdinalIgnoreCase))
                {
                    g.DrawLine(penSolid, 5, y + 1, contentWidth - 5, y + 1);
                    y += 3;
                    g.DrawString("*** فاتورة تجريبية - فحص جاهزية وتدريب ***", fontBold, Brushes.Black, new RectangleF(0, y, contentWidth, 18), centerFormat);
                    y += 18;
                    g.DrawLine(penSolid, 5, y + 1, contentWidth - 5, y + 1);
                    y += 4;
                }

                // بيان الفواتير الملغاة
                if (string.Equals(sale.Status, "cancelled", StringComparison.OrdinalIgnoreCase))
                {
                    g.DrawString("*** فاتورة ملغاة ***", fontBold, Brushes.Black, new RectangleF(0, y, contentWidth, 18), centerFormat);
                    y += 20;
                }

                // بيان العميل إن وجد
                if (!string.IsNullOrWhiteSpace(sale.CustomerName))
                {
                    string custStr = "العميل: " + sale.CustomerName;
                    if (!string.IsNullOrWhiteSpace(sale.CustomerPhone))
                    {
                        custStr += " (" + sale.CustomerPhone + ")";
                    }
                    g.DrawString(custStr, fontSmall, Brushes.Black, new RectangleF(5, y, contentWidth - 10, 16), rtlFormat);
                    y += 18;
                }

                // 3. Table Column Headers
                g.DrawLine(penSolid, 5, y, contentWidth - 5, y);
                y += 4;
                g.DrawString("الصنف", fontBold, Brushes.Black, new RectangleF(contentWidth * 0.45f, y, contentWidth * 0.50f, 18), rtlFormat);
                g.DrawString("الكمية × السعر", fontBold, Brushes.Black, new RectangleF(contentWidth * 0.20f, y, contentWidth * 0.25f, 18), centerFormat);
                g.DrawString("الإجمالي", fontBold, Brushes.Black, new RectangleF(5, y, contentWidth * 0.20f, 18), leftFormat);
                y += 20;
                g.DrawLine(penDashed, 5, y, contentWidth - 5, y);
                y += 6;

                // 4. Items lines
                if (sale.Items != null)
                {
                    foreach (var item in sale.Items)
                    {
                        string qtyStr;
                        if (string.Equals(item.Unit, "kg", StringComparison.OrdinalIgnoreCase))
                        {
                            qtyStr = (item.QuantityMilli / 1000.0).ToString("0.000") + " كجم";
                        }
                        else
                        {
                            qtyStr = (item.QuantityMilli / 1000).ToString() + " ق";
                        }

                        string rateStr = (item.UnitPricePiasters / 100.0).ToString("0.00");
                        string totalStr = (item.TotalPiasters / 100.0).ToString("0.00");

                        // Line 1: Item Name
                        g.DrawString(item.ProductName ?? "صنف", fontBold, Brushes.Black, new RectangleF(5, y, contentWidth - 10, 18), rtlFormat);
                        y += 18;

                        // Line 2: Details and price
                        g.DrawString(qtyStr + " × " + rateStr, fontSmall, Brushes.Black, new RectangleF(contentWidth * 0.30f, y, contentWidth * 0.65f, 16), rtlFormat);
                        g.DrawString(totalStr, fontBold, Brushes.Black, new RectangleF(5, y, contentWidth * 0.30f, 16), leftFormat);
                        y += 18;
                    }
                }

                // 5. Totals Section
                g.DrawLine(penSolid, 5, y + 2, contentWidth - 5, y + 2);
                y += 6;

                // Subtotal
                if (sale.DiscountPiasters > 0 || sale.TaxPiasters > 0)
                {
                    g.DrawString("المجموع قبل الخصم:", fontRegular, Brushes.Black, new RectangleF(contentWidth * 0.40f, y, contentWidth * 0.55f, 16), rtlFormat);
                    g.DrawString((sale.SubtotalPiasters / 100.0).ToString("0.00") + " ج.م", fontRegular, Brushes.Black, new RectangleF(5, y, contentWidth * 0.40f, 16), leftFormat);
                    y += 18;
                }

                // Discount
                if (sale.DiscountPiasters > 0)
                {
                    g.DrawString("قيمة الخصم:", fontRegular, Brushes.Black, new RectangleF(contentWidth * 0.40f, y, contentWidth * 0.55f, 16), rtlFormat);
                    g.DrawString("-" + (sale.DiscountPiasters / 100.0).ToString("0.00") + " ج.م", fontRegular, Brushes.Black, new RectangleF(5, y, contentWidth * 0.40f, 16), leftFormat);
                    y += 18;
                }

                // Grand Total
                g.DrawLine(penDashed, 5, y, contentWidth - 5, y);
                y += 4;
                g.DrawString("الصافي المستحق:", fontLarge, Brushes.Black, new RectangleF(contentWidth * 0.40f, y, contentWidth * 0.55f, 26), rtlFormat);
                g.DrawString((sale.TotalPiasters / 100.0).ToString("0.00") + " ج.م", fontLarge, Brushes.Black, new RectangleF(5, y, contentWidth * 0.40f, 26), leftFormat);
                y += 28;
                g.DrawLine(penSolid, 5, y, contentWidth - 5, y);
                y += 6;

                // 6. Payment & Change
                long totalPaid = sale.PaidPiasters > 0 ? sale.PaidPiasters : sale.TotalPiasters;
                long changeDue = Math.Max(0, totalPaid - sale.TotalPiasters);

                string methodArabic = "نقداً";
                if (sale.PaymentMethod == "credit") methodArabic = "آجل (على الحساب)";
                else if (sale.PaymentMethod == "card") methodArabic = "بطاقة بنكية / فيزا";
                else if (sale.PaymentMethod == "multi") methodArabic = "دفع مقسّم / متعدد";

                g.DrawString("طريقة السداد: " + methodArabic, fontRegular, Brushes.Black, new RectangleF(contentWidth * 0.40f, y, contentWidth * 0.55f, 16), rtlFormat);
                g.DrawString((totalPaid / 100.0).ToString("0.00") + " ج.م", fontRegular, Brushes.Black, new RectangleF(5, y, contentWidth * 0.40f, 16), leftFormat);
                y += 18;

                if (changeDue > 0)
                {
                    g.DrawString("المبلغ المتبقي (الباقي):", fontBold, Brushes.Black, new RectangleF(contentWidth * 0.40f, y, contentWidth * 0.55f, 18), rtlFormat);
                    g.DrawString((changeDue / 100.0).ToString("0.00") + " ج.م", fontBold, Brushes.Black, new RectangleF(5, y, contentWidth * 0.40f, 18), leftFormat);
                    y += 20;
                }

                // 7. Footer note
                if (!string.IsNullOrWhiteSpace(footer))
                {
                    y += 6;
                    g.DrawLine(penDashed, 5, y, contentWidth - 5, y);
                    y += 6;
                    g.DrawString(footer, fontSmall, Brushes.Black, new RectangleF(5, y, contentWidth - 10, 36), centerFormat);
                    y += 38;
                }

                // Barcode simulation text line
                g.DrawString("*" + (sale.InvoiceNumber > 0 ? sale.InvoiceNumber.ToString("D8") : "00000000") + "*", fontBold, Brushes.Black, new RectangleF(0, y, contentWidth, 18), centerFormat);
            }
        }

        private string ResolvePrinterName(string explicitPrinter)
        {
            if (!string.IsNullOrWhiteSpace(explicitPrinter))
            {
                return explicitPrinter;
            }

            // Read from configured default in SQLite settings
            if (_settings != null)
            {
                string configured = _settings.Get("default_printer_name", "");
                if (!string.IsNullOrWhiteSpace(configured))
                {
                    return configured;
                }
            }

            // Fallback to Windows default printer
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
    }
}
