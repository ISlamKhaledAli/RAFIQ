using System;
using System.Collections.Generic;
using System.IO;
using ClosedXML.Excel;
using RafiqPOS.Common;
using RafiqPOS.Models;
using RafiqPOS.Repositories;

namespace RafiqPOS.Services
{
    public class ExcelService
    {
        private static readonly XLColor ForestDark = XLColor.FromArgb(0, 55, 45);
        private static readonly XLColor EmeraldGreen = XLColor.FromArgb(0, 109, 65);
        private static readonly XLColor SoftMint = XLColor.FromArgb(232, 245, 233);
        private static readonly XLColor BorderGray = XLColor.FromArgb(209, 218, 211);
        private static readonly XLColor ZebraLight = XLColor.FromArgb(246, 250, 247);

        /// <summary>
        /// توليد قالب استيراد الأصناف بتنسيق رسمي وألوان احترافية متوافقة مع إكسل العربي (RTL)
        /// </summary>
        public string GenerateProductTemplateBase64()
        {
            using (var wb = new XLWorkbook())
            {
                var ws = wb.Worksheets.Add("قالب_الأصناف_المعتمد");
                ws.RightToLeft = true;
                ws.ShowGridLines = true;

                // 1. Title Banner (Row 1)
                ws.Range("A1:N1").Merge();
                var titleCell = ws.Cell("A1");
                titleCell.Value = "رفيق POS - نموذج استيراد الأصناف المعتمد للمتاجر";
                titleCell.Style.Font.Bold = true;
                titleCell.Style.Font.FontSize = 13;
                titleCell.Style.Font.FontColor = XLColor.White;
                titleCell.Style.Fill.BackgroundColor = ForestDark;
                titleCell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                titleCell.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
                ws.Row(1).Height = 40;

                // 2. Subtitle / Guidance Banner (Row 2)
                ws.Range("A2:N2").Merge();
                var subCell = ws.Cell("A2");
                subCell.Value = "تعليمات هامة: الأعمدة المميزة بنجمة (*) إلزامية | الباركودات تحفظ كنص | اللون والمقاس اختياريان لمحلات الملابس والأحذية | الوحدة: قطعة أو كجم | المبالغ بالجنيه المصري";
                subCell.Style.Font.Bold = true;
                subCell.Style.Font.FontSize = 9.5;
                subCell.Style.Font.FontColor = XLColor.FromArgb(0, 77, 64);
                subCell.Style.Fill.BackgroundColor = SoftMint;
                subCell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                subCell.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
                ws.Row(2).Height = 26;

                // 3. Table Column Headers (Row 3)
                string[] headers = new string[]
                {
                    "اسم الصنف *",
                    "الباركود الرئيسي",
                    "باركودات إضافية (مفصولة بفاصلة)",
                    "القسم / التصنيف",
                    "الوحدة (قطعة / كجم)",
                    "اللون (اختياري / للملابس)",
                    "المقاس (اختياري / للملابس)",
                    "سعر البيع (بالجنيه) *",
                    "سعر التكلفة (بالجنيه)",
                    "الرصيد الافتتاحي",
                    "حد الطلب الأدنى",
                    "نسبة الضريبة (%)",
                    "كود الصنف الداخلي (SKU)",
                    "كود التصنيف الضريبي (GS1/EGS)"
                };

                ws.Row(3).Height = 32;
                for (int i = 0; i < headers.Length; i++)
                {
                    var cell = ws.Cell(3, i + 1);
                    cell.Value = headers[i];
                    cell.Style.Font.Bold = true;
                    cell.Style.Font.FontSize = 10.5;
                    cell.Style.Font.FontColor = XLColor.White;
                    cell.Style.Fill.BackgroundColor = EmeraldGreen;
                    cell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                    cell.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
                    cell.Style.Border.OutsideBorder = XLBorderStyleValues.Thin;
                    cell.Style.Border.OutsideBorderColor = XLColor.FromArgb(0, 77, 64);
                }

                // 4. Realistic Supermarket & Retail Sample Rows (Rows 4 to 9)
                object[][] sampleData = new object[][]
                {
                    new object[] { "شاي العروسة ناعم 250 جم", "6223000123456", "6223000123457, 6223000123458", "بقالة ومشروبات", "قطعة", "", "", 35.00, 28.50, 50, 10, 0, "TEA-AR-250", "EG-100000-01" },
                    new object[] { "تيشيرت بولو كاجوال رجالي", "6225501100026", "", "ملابس رجالي", "قطعة", "كحلي", "L", 220.00, 140.00, 25, 5, 0, "POLO-NV-L", "" },
                    new object[] { "حذاء رياضي كوتشي كاجوال", "6225504400017", "", "أحذية وحقائب", "قطعة", "أسود", "42", 320.00, 200.00, 15, 3, 0, "SHOE-BK-42", "" },
                    new object[] { "طماطم بلدي طازجة درجة أولى", "200123456789", "", "خضار وفاكهة", "كجم", "", "", 15.00, 10.00, 45.0, 5, 0, "VEG-TOM-01", "" },
                    new object[] { "جبنة بيضاء رومي قديمة بالوزن", "200987654321", "", "ألبان وأجبان", "كجم", "", "", 320.00, 260.00, 15.5, 3, 0, "CHS-ROM-01", "EG-100000-03" },
                    new object[] { "صابون سائل بريل بالليمون 1 لتر", "6222000554433", "", "منظفات وعناية", "قطعة", "", "", 42.00, 35.00, 30, 5, 14, "CLN-PRL-01", "EG-100000-05" }
                };

                for (int r = 0; r < sampleData.Length; r++)
                {
                    int rowNum = r + 4;
                    ws.Row(rowNum).Height = 24;
                    bool isZebra = (r % 2 == 1);
                    XLColor rowBg = isZebra ? ZebraLight : XLColor.White;

                    object[] rowVals = sampleData[r];
                    for (int c = 0; c < rowVals.Length; c++)
                    {
                        var cell = ws.Cell(rowNum, c + 1);
                        cell.Value = rowVals[c] != null ? rowVals[c].ToString() : "";
                        cell.Style.Font.FontSize = 10;
                        cell.Style.Fill.BackgroundColor = rowBg;
                        cell.Style.Border.OutsideBorder = XLBorderStyleValues.Thin;
                        cell.Style.Border.OutsideBorderColor = BorderGray;
                        cell.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;

                        // Specific formatting based on column
                        if (c == 0) // Name
                        {
                            cell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Right;
                        }
                        else if (c == 1 || c == 2) // Barcodes (strictly Text format)
                        {
                            cell.Style.NumberFormat.Format = "@";
                            cell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                        }
                        else if (c == 3 || c == 4 || c == 5 || c == 6) // Category, Unit, Color, Size
                        {
                            cell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                        }
                        else if (c == 7 || c == 8) // Prices (Currency format)
                        {
                            if (rowVals[c] is double)
                            {
                                cell.Value = (double)rowVals[c];
                                cell.Style.NumberFormat.Format = "#,##0.00";
                            }
                            cell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                        }
                        else if (c == 9) // Stock
                        {
                            if (rowVals[c] is double)
                            {
                                cell.Value = (double)rowVals[c];
                                cell.Style.NumberFormat.Format = "#,##0.###";
                            }
                            else if (rowVals[c] is int)
                            {
                                cell.Value = (int)rowVals[c];
                                cell.Style.NumberFormat.Format = "#,##0";
                            }
                            cell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                        }
                        else if (c == 10 || c == 11) // Min stock, Tax
                        {
                            if (rowVals[c] is int)
                            {
                                cell.Value = (int)rowVals[c];
                                cell.Style.NumberFormat.Format = "#,##0";
                            }
                            cell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                        }
                        else // Codes
                        {
                            cell.Style.NumberFormat.Format = "@";
                            cell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                        }
                    }
                }

                // 5. Freeze Header Rows
                ws.SheetView.FreezeRows(3);

                // 6. Explicit and generous column widths
                ws.Column(1).Width = 34; // اسم الصنف
                ws.Column(2).Width = 20; // الباركود الرئيسي
                ws.Column(3).Width = 32; // باركودات إضافية
                ws.Column(4).Width = 20; // القسم
                ws.Column(5).Width = 18; // الوحدة
                ws.Column(6).Width = 18; // اللون
                ws.Column(7).Width = 18; // المقاس
                ws.Column(8).Width = 20; // سعر البيع
                ws.Column(9).Width = 20; // سعر التكلفة
                ws.Column(10).Width = 18; // الرصيد
                ws.Column(11).Width = 18; // حد الطلب
                ws.Column(12).Width = 16; // الضريبة
                ws.Column(13).Width = 22; // SKU
                ws.Column(14).Width = 26; // كود ضريبي

                using (var ms = new MemoryStream())
                {
                    wb.SaveAs(ms);
                    return Convert.ToBase64String(ms.ToArray());
                }
            }
        }

        /// <summary>
        /// تصدير كامل أصناف النظام إلى ملف إكسل احترافي ملون ومفصل مع تقييم المخزون وهوامش الربح
        /// </summary>
        public string ExportProductsBase64(List<Product> products, Dictionary<string, string> categoryNames)
        {
            if (products == null) products = new List<Product>();
            if (categoryNames == null) categoryNames = new Dictionary<string, string>();

            using (var wb = new XLWorkbook())
            {
                var ws = wb.Worksheets.Add("كتالوج_المخزون_والأصناف");
                ws.RightToLeft = true;
                ws.ShowGridLines = true;

                // 1. Header Banner (Row 1)
                ws.Range("A1:P1").Merge();
                var titleCell = ws.Cell("A1");
                titleCell.Value = "رفيق لنقاط البيع (Rafiq POS) - تقرير جرد وكتالوج الأصناف الكامل";
                titleCell.Style.Font.Bold = true;
                titleCell.Style.Font.FontSize = 13;
                titleCell.Style.Font.FontColor = XLColor.White;
                titleCell.Style.Fill.BackgroundColor = ForestDark;
                titleCell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                titleCell.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
                ws.Row(1).Height = 40;

                // 2. Metadata Banner (Row 2)
                ws.Range("A2:P2").Merge();
                var metaCell = ws.Cell("A2");
                metaCell.Value = string.Format(
                    "تاريخ التصدير: {0} | إجمالي الأصناف المسجلة: {1} صنف | نظام رفيق لإدارة المبيعات والمخازن",
                    DateTime.Now.ToString("yyyy/MM/dd HH:mm"),
                    products.Count
                );
                metaCell.Style.Font.Bold = true;
                metaCell.Style.Font.FontSize = 9.5;
                metaCell.Style.Font.FontColor = XLColor.FromArgb(0, 77, 64);
                metaCell.Style.Fill.BackgroundColor = SoftMint;
                metaCell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                metaCell.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
                ws.Row(2).Height = 26;

                // 3. Table Column Headers (Row 3)
                string[] headers = new string[]
                {
                    "م",
                    "اسم الصنف",
                    "الباركود الرئيسي",
                    "القسم / التصنيف",
                    "الوحدة",
                    "اللون",
                    "المقاس",
                    "سعر البيع (ج.م)",
                    "سعر التكلفة (ج.م)",
                    "هامش الربح (ج.م)",
                    "نسبة الربح",
                    "الرصيد الحالي",
                    "حد الطلب الأدنى",
                    "حالة المخزون",
                    "نسبة الضريبة",
                    "كود الصنف (SKU)"
                };

                ws.Row(3).Height = 32;
                for (int i = 0; i < headers.Length; i++)
                {
                    var cell = ws.Cell(3, i + 1);
                    cell.Value = headers[i];
                    cell.Style.Font.Bold = true;
                    cell.Style.Font.FontSize = 10.5;
                    cell.Style.Font.FontColor = XLColor.White;
                    cell.Style.Fill.BackgroundColor = EmeraldGreen;
                    cell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                    cell.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
                    cell.Style.Border.OutsideBorder = XLBorderStyleValues.Thin;
                    cell.Style.Border.OutsideBorderColor = XLColor.FromArgb(0, 77, 64);
                }

                // 4. Products Data Rows (Optimized for lightning speed even with 50,000 items)
                int productCount = products.Count;
                for (int idx = 0; idx < productCount; idx++)
                {
                    int rowNum = idx + 4;
                    var prod = products[idx];
                    ws.Row(rowNum).Height = 22;

                    string catName = "عام / متنوع";
                    if (!string.IsNullOrEmpty(prod.CategoryId) && categoryNames.ContainsKey(prod.CategoryId))
                    {
                        catName = categoryNames[prod.CategoryId];
                    }

                    double sellPounds = prod.PricePiasters / 100.0;
                    double costPounds = prod.CostPiasters / 100.0;
                    double profitPounds = Math.Max(0, sellPounds - costPounds);
                    double marginPercent = costPounds > 0 ? (profitPounds / costPounds) * 100.0 : 0.0;
                    double currentStock = prod.StockQuantityMilli / 1000.0;
                    double minStock = prod.MinStockQuantityMilli / 1000.0;

                    // Stock Status Logic
                    string stockStatusText;
                    XLColor stockBg;
                    XLColor stockFont;

                    if (currentStock <= 0)
                    {
                        stockStatusText = "نفد من المخزن";
                        stockBg = XLColor.FromArgb(253, 232, 232); // Light red
                        stockFont = XLColor.FromArgb(155, 28, 28); // Dark red
                    }
                    else if (currentStock <= minStock)
                    {
                        stockStatusText = "قارب على النفاد";
                        stockBg = XLColor.FromArgb(254, 240, 138); // Light amber
                        stockFont = XLColor.FromArgb(120, 53, 15); // Dark amber
                    }
                    else
                    {
                        stockStatusText = "متوفر بالمخزن";
                        stockBg = XLColor.FromArgb(220, 252, 231); // Light green
                        stockFont = XLColor.FromArgb(20, 83, 45); // Dark green
                    }

                    ws.Cell(rowNum, 1).Value = idx + 1;
                    ws.Cell(rowNum, 2).Value = prod.Name ?? "";
                    ws.Cell(rowNum, 3).SetValue<string>(prod.Barcode ?? "");
                    ws.Cell(rowNum, 4).Value = catName;
                    ws.Cell(rowNum, 5).Value = prod.Unit == "kg" ? "كجم" : "قطعة";
                    ws.Cell(rowNum, 6).Value = prod.VariantColor ?? "";
                    ws.Cell(rowNum, 7).Value = prod.VariantSize ?? "";
                    ws.Cell(rowNum, 8).Value = sellPounds;
                    ws.Cell(rowNum, 9).Value = costPounds;
                    ws.Cell(rowNum, 10).Value = profitPounds;
                    ws.Cell(rowNum, 11).Value = marginPercent > 0 ? string.Format("{0:0.#}%", marginPercent) : "0%";
                    ws.Cell(rowNum, 12).Value = currentStock;
                    ws.Cell(rowNum, 13).Value = minStock;

                    var statusCell = ws.Cell(rowNum, 14);
                    statusCell.Value = stockStatusText;
                    statusCell.Style.Fill.BackgroundColor = stockBg;
                    statusCell.Style.Font.FontColor = stockFont;
                    statusCell.Style.Font.Bold = true;

                    ws.Cell(rowNum, 15).Value = prod.TaxRatePercent > 0 ? string.Format("{0}%", prod.TaxRatePercent) : "0%";
                    ws.Cell(rowNum, 16).SetValue<string>(prod.InternalCode ?? "");

                    if (idx % 2 == 1)
                    {
                        ws.Range(rowNum, 1, rowNum, 13).Style.Fill.BackgroundColor = ZebraLight;
                        ws.Range(rowNum, 15, rowNum, 16).Style.Fill.BackgroundColor = ZebraLight;
                    }
                }

                // Batch Range Formatting (50x faster than cell-by-cell in ClosedXML)
                int lastRow = productCount + 3;
                if (productCount > 0)
                {
                    var dataRange = ws.Range(4, 1, lastRow, 16);
                    dataRange.Style.Font.FontSize = 10;
                    dataRange.Style.Border.OutsideBorder = XLBorderStyleValues.Thin;
                    dataRange.Style.Border.InsideBorder = XLBorderStyleValues.Thin;
                    dataRange.Style.Border.OutsideBorderColor = BorderGray;
                    dataRange.Style.Border.InsideBorderColor = BorderGray;
                    dataRange.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;

                    ws.Range(4, 1, lastRow, 1).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                    ws.Range(4, 2, lastRow, 2).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Right;
                    ws.Range(4, 3, lastRow, 3).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                    ws.Range(4, 3, lastRow, 3).Style.NumberFormat.Format = "@";
                    ws.Range(4, 4, lastRow, 7).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                    ws.Range(4, 8, lastRow, 10).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                    ws.Range(4, 8, lastRow, 10).Style.NumberFormat.Format = "#,##0.00";
                    ws.Range(4, 11, lastRow, 11).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                    ws.Range(4, 12, lastRow, 13).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                    ws.Range(4, 12, lastRow, 13).Style.NumberFormat.Format = "#,##0.###";
                    ws.Range(4, 14, lastRow, 16).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                }

                // 5. Freeze Header Rows
                ws.SheetView.FreezeRows(3);

                // 6. Generous widths
                ws.Column(1).Width = 8;   // م
                ws.Column(2).Width = 34;  // الاسم
                ws.Column(3).Width = 20;  // الباركود
                ws.Column(4).Width = 20;  // القسم
                ws.Column(5).Width = 14;  // الوحدة
                ws.Column(6).Width = 18;  // سعر البيع
                ws.Column(7).Width = 18;  // التكلفة
                ws.Column(8).Width = 18;  // هامش الربح
                ws.Column(9).Width = 14;  // نسبة الربح
                ws.Column(10).Width = 16; // الرصيد
                ws.Column(11).Width = 16; // حد الطلب
                ws.Column(12).Width = 20; // حالة المخزون
                ws.Column(13).Width = 14; // الضريبة
                ws.Column(14).Width = 20; // SKU

                using (var ms = new MemoryStream())
                {
                    wb.SaveAs(ms);
                    return Convert.ToBase64String(ms.ToArray());
                }
            }
        }

        /// <summary>
        /// تصدير كامل بيانات وحسابات العملاء والديون إلى ملف إكسل احترافي ملون
        /// </summary>
        public string ExportCustomersBase64(List<Customer> customers)
        {
            if (customers == null) customers = new List<Customer>();

            using (var wb = new XLWorkbook())
            {
                var ws = wb.Worksheets.Add("كشف_حسابات_العملاء");
                ws.RightToLeft = true;
                ws.ShowGridLines = true;

                // 1. Header Banner (Row 1)
                ws.Range("A1:G1").Merge();
                var titleCell = ws.Cell("A1");
                titleCell.Value = "رفيق لنقاط البيع (Rafiq POS) - كشف حسابات وأرصدة العملاء والديون";
                titleCell.Style.Font.Bold = true;
                titleCell.Style.Font.FontSize = 13;
                titleCell.Style.Font.FontColor = XLColor.White;
                titleCell.Style.Fill.BackgroundColor = ForestDark;
                titleCell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                titleCell.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
                ws.Row(1).Height = 40;

                // 2. Metadata Banner (Row 2)
                ws.Range("A2:G2").Merge();
                var metaCell = ws.Cell("A2");
                metaCell.Value = string.Format(
                    "تاريخ الاستخراج: {0} | إجمالي العملاء: {1} عميل | نظام رفيق لإدارة المبيعات والآجل",
                    DateTime.Now.ToString("yyyy/MM/dd HH:mm"),
                    customers.Count
                );
                metaCell.Style.Font.Bold = true;
                metaCell.Style.Font.FontSize = 9.5;
                metaCell.Style.Font.FontColor = XLColor.FromArgb(0, 77, 64);
                metaCell.Style.Fill.BackgroundColor = SoftMint;
                metaCell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                metaCell.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
                ws.Row(2).Height = 26;

                // 3. Headers (Row 3)
                string[] headers = new string[]
                {
                    "م",
                    "اسم العميل",
                    "رقم الهاتف",
                    "الرصيد المستحق الحالي (ج.م)",
                    "حد الائتمان / التنبيه (ج.م)",
                    "حالة الحساب",
                    "تاريخ الإضافة"
                };

                ws.Row(3).Height = 32;
                for (int i = 0; i < headers.Length; i++)
                {
                    var cell = ws.Cell(3, i + 1);
                    cell.Value = headers[i];
                    cell.Style.Font.Bold = true;
                    cell.Style.Font.FontSize = 10.5;
                    cell.Style.Font.FontColor = XLColor.White;
                    cell.Style.Fill.BackgroundColor = EmeraldGreen;
                    cell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                    cell.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
                    cell.Style.Border.OutsideBorder = XLBorderStyleValues.Thin;
                    cell.Style.Border.OutsideBorderColor = XLColor.FromArgb(0, 77, 64);
                }

                // 4. Data Rows
                for (int idx = 0; idx < customers.Count; idx++)
                {
                    int rowNum = idx + 4;
                    var cust = customers[idx];
                    ws.Row(rowNum).Height = 22;

                    double currentBalPounds = cust.BalancePiasters / 100.0;
                    double creditLimitPounds = cust.CreditLimitPiasters / 100.0;

                    string statusText;
                    XLColor statusBg;
                    XLColor statusFont;

                    if (cust.BalancePiasters > cust.CreditLimitPiasters && cust.CreditLimitPiasters > 0)
                    {
                        statusText = "تجاوز حد الائتمان";
                        statusBg = XLColor.FromArgb(253, 232, 232);
                        statusFont = XLColor.FromArgb(155, 28, 28);
                    }
                    else if (cust.BalancePiasters > 0)
                    {
                        statusText = "عليه رصيد مدين";
                        statusBg = XLColor.FromArgb(254, 240, 138);
                        statusFont = XLColor.FromArgb(120, 53, 15);
                    }
                    else
                    {
                        statusText = "الحساب مسدد بالكامل";
                        statusBg = XLColor.FromArgb(220, 252, 231);
                        statusFont = XLColor.FromArgb(20, 83, 45);
                    }

                    ws.Cell(rowNum, 1).Value = idx + 1;
                    ws.Cell(rowNum, 2).Value = cust.Name ?? "";
                    ws.Cell(rowNum, 3).SetValue<string>(cust.Phone ?? "");
                    ws.Cell(rowNum, 4).Value = currentBalPounds;
                    ws.Cell(rowNum, 5).Value = creditLimitPounds;

                    var stCell = ws.Cell(rowNum, 6);
                    stCell.Value = statusText;
                    stCell.Style.Fill.BackgroundColor = statusBg;
                    stCell.Style.Font.FontColor = statusFont;
                    stCell.Style.Font.Bold = true;

                    ws.Cell(rowNum, 7).Value = cust.CreatedAt ?? "";

                    if (idx % 2 == 1)
                    {
                        ws.Range(rowNum, 1, rowNum, 5).Style.Fill.BackgroundColor = ZebraLight;
                        ws.Range(rowNum, 7, rowNum, 7).Style.Fill.BackgroundColor = ZebraLight;
                    }
                }


                int lastRow = customers.Count + 3;
                if (customers.Count > 0)
                {
                    var dataRange = ws.Range(4, 1, lastRow, 7);
                    dataRange.Style.Font.FontSize = 10;
                    dataRange.Style.Border.OutsideBorder = XLBorderStyleValues.Thin;
                    dataRange.Style.Border.InsideBorder = XLBorderStyleValues.Thin;
                    dataRange.Style.Border.OutsideBorderColor = BorderGray;
                    dataRange.Style.Border.InsideBorderColor = BorderGray;
                    dataRange.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;

                    ws.Range(4, 1, lastRow, 1).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                    ws.Range(4, 2, lastRow, 2).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Right;
                    ws.Range(4, 3, lastRow, 3).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                    ws.Range(4, 3, lastRow, 3).Style.NumberFormat.Format = "@";
                    ws.Range(4, 4, lastRow, 5).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                    ws.Range(4, 4, lastRow, 5).Style.NumberFormat.Format = "#,##0.00";
                    ws.Range(4, 6, lastRow, 6).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                    ws.Range(4, 7, lastRow, 7).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Right;
                }

                ws.SheetView.FreezeRows(3);
                ws.Column(1).Width = 8;
                ws.Column(2).Width = 32;
                ws.Column(3).Width = 20;
                ws.Column(4).Width = 24;
                ws.Column(5).Width = 24;
                ws.Column(6).Width = 22;
                ws.Column(7).Width = 35;

                using (var ms = new MemoryStream())
                {
                    wb.SaveAs(ms);
                    return Convert.ToBase64String(ms.ToArray());
                }
            }
        }


        /// <summary>
        /// توليد قالب إكسل لاستيراد العملاء والديون الافتتاحية من دفتر الآجل الورقي (Story 71 / Task 109-1)
        /// </summary>
        public string GenerateCustomerTemplateBase64()
        {
            using (var wb = new XLWorkbook())
            {
                var ws = wb.Worksheets.Add("قالب_العملاء_والديون");
                ws.RightToLeft = true;
                ws.ShowGridLines = true;

                // 1. Title Banner
                ws.Range("A1:E1").Merge();
                var titleCell = ws.Cell("A1");
                titleCell.Value = "رفيق POS - نموذج استيراد بيانات العملاء والديون الافتتاحية للمتاجر";
                titleCell.Style.Font.Bold = true;
                titleCell.Style.Font.FontSize = 13;
                titleCell.Style.Font.FontColor = XLColor.White;
                titleCell.Style.Fill.BackgroundColor = ForestDark;
                titleCell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                titleCell.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
                ws.Row(1).Height = 40;

                // 2. Subtitle / Guidance Banner
                ws.Range("A2:E2").Merge();
                var subCell = ws.Cell("A2");
                subCell.Value = "تعليمات: اسم العميل إلزامي (*) | رقم الهاتف فريد لعدم تكرار الحسابات | الرصيد الافتتاحي هو دين الدفتر القديم بالجنيه | حد الائتمان هو سقف التنبيه بالجنيه";
                subCell.Style.Font.Bold = true;
                subCell.Style.Font.FontSize = 9.5;
                subCell.Style.Font.FontColor = XLColor.FromArgb(0, 77, 64);
                subCell.Style.Fill.BackgroundColor = SoftMint;
                subCell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                subCell.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
                ws.Row(2).Height = 26;

                // 3. Table Headers
                string[] headers = new string[]
                {
                    "اسم العميل *",
                    "رقم الهاتف",
                    "الرصيد الافتتاحي (دين الدفتر بالجنيه)",
                    "حد الائتمان / التنبيه (بالجنيه)",
                    "ملاحظات إضافية"
                };

                ws.Row(3).Height = 30;
                for (int i = 0; i < headers.Length; i++)
                {
                    var cell = ws.Cell(3, i + 1);
                    cell.Value = headers[i];
                    cell.Style.Font.Bold = true;
                    cell.Style.Font.FontSize = 10.5;
                    cell.Style.Font.FontColor = XLColor.White;
                    cell.Style.Fill.BackgroundColor = EmeraldGreen;
                    cell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                    cell.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
                    cell.Style.Border.OutsideBorder = XLBorderStyleValues.Thin;
                    cell.Style.Border.OutsideBorderColor = XLColor.FromArgb(0, 77, 64);
                }

                // 4. Sample Rows
                object[][] sampleData = new object[][]
                {
                    new object[] { "أحمد محمود العطار", "01012345678", 350.00, 2000.00, "عميل قديم طرف الشارع" },
                    new object[] { "سارة إبراهيم", "01198765432", 0.00, 1000.00, "حساب نقدي وآجل عند الطلب" },
                    new object[] { "الحاج مصطفى السعيد", "01234567890", 1250.50, 5000.00, "دين مرحل من الدفتر القديم ص 14" }
                };

                for (int r = 0; r < sampleData.Length; r++)
                {
                    int rowNum = r + 4;
                    ws.Row(rowNum).Height = 22;
                    bool isZebra = (r % 2 == 1);
                    XLColor rowBg = isZebra ? ZebraLight : XLColor.White;

                    for (int c = 0; c < sampleData[r].Length; c++)
                    {
                        var cell = ws.Cell(rowNum, c + 1);
                        cell.Value = sampleData[r][c].ToString();
                        cell.Style.Font.FontSize = 10;
                        cell.Style.Fill.BackgroundColor = rowBg;
                        cell.Style.Border.OutsideBorder = XLBorderStyleValues.Thin;
                        cell.Style.Border.OutsideBorderColor = BorderGray;
                        cell.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;

                        if (c == 0) // Name
                        {
                            cell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Right;
                        }
                        else if (c == 1) // Phone
                        {
                            cell.Style.NumberFormat.Format = "@";
                            cell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                        }
                        else if (c == 2 || c == 3) // Initial balance & credit limit
                        {
                            cell.Value = (double)sampleData[r][c];
                            cell.Style.NumberFormat.Format = "#,##0.00";
                            cell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                        }
                        else
                        {
                            cell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Right;
                        }
                    }
                }

                // 5. Freeze rows
                ws.SheetView.FreezeRows(3);

                // 6. Column widths
                ws.Column(1).Width = 32; // Name
                ws.Column(2).Width = 20; // Phone
                ws.Column(3).Width = 28; // Initial balance
                ws.Column(4).Width = 28; // Credit limit
                ws.Column(5).Width = 36; // Notes

                using (var ms = new MemoryStream())
                {
                    wb.SaveAs(ms);
                    return Convert.ToBase64String(ms.ToArray());
                }
            }
        }

        /// <summary>
        /// قراءة ومعاينة ملف إكسل لاستيراد العملاء والتحقق من صحة البيانات ومنع التكرار (Story 71 / Task 109-2)
        /// </summary>
        public CustomerImportPreviewResult ParseCustomerImportBase64(string base64, CustomerRepository customerRepo)
        {
            var result = new CustomerImportPreviewResult();
            if (string.IsNullOrWhiteSpace(base64)) return result;

            byte[] bytes = Convert.FromBase64String(base64);
            using (var ms = new MemoryStream(bytes))
            using (var wb = new XLWorkbook(ms))
            {
                var ws = wb.Worksheets.Count > 0 ? wb.Worksheet(1) : null;
                if (ws == null) return result;

                // Find header row (default row 3 or search for "اسم العميل")
                int headerRow = 3;
                for (int r = 1; r <= 10; r++)
                {
                    string cellVal = ws.Cell(r, 1).GetString().Trim();
                    if (cellVal.Contains("اسم العميل") || cellVal.Contains("الاسم"))
                    {
                        headerRow = r;
                        break;
                    }
                }

                int lastRow = ws.LastRowUsed() != null ? ws.LastRowUsed().RowNumber() : 0;
                var seenPhonesInFile = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

                for (int r = headerRow + 1; r <= lastRow; r++)
                {
                    string name = ws.Cell(r, 1).GetString().Trim();
                    string phone = ws.Cell(r, 2).GetString().Trim();
                    string balanceRaw = ws.Cell(r, 3).GetString().Trim();
                    string limitRaw = ws.Cell(r, 4).GetString().Trim();
                    string notes = ws.Cell(r, 5).GetString().Trim();

                    // Skip empty rows
                    if (string.IsNullOrWhiteSpace(name) && string.IsNullOrWhiteSpace(phone) && string.IsNullOrWhiteSpace(balanceRaw))
                    {
                        continue;
                    }

                    var row = new CustomerImportRow();
                    row.RowIndex = r;
                    row.Name = name;
                    row.Phone = phone.Replace(" ", "").Replace("-", "");
                    row.Notes = notes;
                    row.IsValid = true;

                    // 1. Name validation
                    if (string.IsNullOrWhiteSpace(name))
                    {
                        row.IsValid = false;
                        row.Errors.Add("اسم العميل إلزامي ولا يمكن تركه فارغاً");
                    }

                    // 2. Phone uniqueness validation
                    if (!string.IsNullOrWhiteSpace(row.Phone))
                    {
                        if (seenPhonesInFile.Contains(row.Phone))
                        {
                            row.IsValid = false;
                            row.Errors.Add(string.Format("رقم الهاتف {0} مكرر في أكثر من سطر بالملف", row.Phone));
                            result.DuplicatePhonesCount++;
                        }
                        else
                        {
                            seenPhonesInFile.Add(row.Phone);
                        }

                        // Check DB duplicate
                        if (customerRepo != null)
                        {
                            var existing = customerRepo.FindByPhone(row.Phone, null);
                            if (existing != null)
                            {
                                row.IsPhoneDuplicateInDb = true;
                                row.Errors.Add(string.Format("رقم الهاتف مسجل مسبقاً للعميل «{0}»", existing.Name));
                                row.IsValid = false;
                            }
                        }
                    }

                    // 3. Initial balance parsing
                    long balancePiasters = 0;
                    if (!string.IsNullOrWhiteSpace(balanceRaw))
                    {
                        decimal dVal;
                        if (decimal.TryParse(balanceRaw, out dVal) && dVal >= 0)
                        {
                            balancePiasters = (long)Math.Round(dVal * 100m, MidpointRounding.AwayFromZero);
                        }
                        else
                        {
                            row.IsValid = false;
                            row.Errors.Add("الرصيد الافتتاحي يجب أن يكون رقماً صحيحاً أو عشرياً موجباً");
                        }
                    }
                    row.InitialBalancePiasters = balancePiasters;

                    // 4. Credit limit parsing (default 1,000 EGP = 100,000 piasters)
                    long limitPiasters = 100000;
                    if (!string.IsNullOrWhiteSpace(limitRaw))
                    {
                        decimal dLimit;
                        if (decimal.TryParse(limitRaw, out dLimit) && dLimit >= 0)
                        {
                            limitPiasters = (long)Math.Round(dLimit * 100m, MidpointRounding.AwayFromZero);
                        }
                    }
                    row.CreditLimitPiasters = limitPiasters;

                    result.Rows.Add(row);
                    result.TotalRowsCount++;
                    if (row.IsValid)
                    {
                        result.ValidRowsCount++;
                        result.TotalOpeningDebtsPiasters += row.InitialBalancePiasters;
                    }
                    else
                    {
                        result.InvalidRowsCount++;
                    }
                }
            }

            return result;
        }

        // =========================================================================
        // Feature #148: تصدير كل بيانات المحل بضغطة واحدة (Single-Click Full Store Export)
        // =========================================================================

        public class FullStoreExportResult
        {
            public bool Success { get; set; }
            public string Message { get; set; }
            public string ExportFolder { get; set; }
            public int ProductsCount { get; set; }
            public int CustomersCount { get; set; }
            public int SuppliersCount { get; set; }
            public int SalesCount { get; set; }
            public int StockMovementsCount { get; set; }
            public int ClosingsCount { get; set; }
            public List<string> GeneratedFiles { get; set; }
            public long TotalSalesPiasters { get; set; }
            public long TotalDebtsPiasters { get; set; }
            public long TotalStockCostPiasters { get; set; }
            public long TotalStockRetailPiasters { get; set; }

            public FullStoreExportResult()
            {
                this.GeneratedFiles = new List<string>();
            }
        }

        public FullStoreExportResult ExportFullStoreData(string targetFolder = null)
        {
            var res = new FullStoreExportResult();
            try
            {
                string shopName = "متجر رفيق";
                if (DatabaseService.SettingsRepo != null)
                {
                    shopName = DatabaseService.SettingsRepo.Get("store_name", "متجر رفيق");
                }

                // Determine folder path
                if (string.IsNullOrWhiteSpace(targetFolder))
                {
                    string desktopPath = Environment.GetFolderPath(Environment.SpecialFolder.Desktop);
                    string safeShop = ArabicTextNormalizer.Normalize(shopName).Replace(" ", "_");
                    if (string.IsNullOrEmpty(safeShop)) safeShop = "المتجر";
                    targetFolder = Path.Combine(desktopPath, string.Format("تصدير_بيانات_رفيق_{0}_{1}", safeShop, DateTime.Now.ToString("yyyyMMdd_HHmmss")));
                }

                if (!Directory.Exists(targetFolder))
                {
                    Directory.CreateDirectory(targetFolder);
                }
                res.ExportFolder = targetFolder;

                // 1. Fetch all data
                var products = DatabaseService.ProductRepo != null ? DatabaseService.ProductRepo.GetAllForExport() : new List<Product>();
                var categories = DatabaseService.CategoryRepo != null ? DatabaseService.CategoryRepo.GetAll(true) : new List<Category>();
                var categoryDict = new Dictionary<string, string>();
                if (categories != null)
                {
                    foreach (var c in categories)
                    {
                        if (!string.IsNullOrEmpty(c.Id)) categoryDict[c.Id] = c.Name;
                    }
                }

                var customers = DatabaseService.CustomerRepo != null ? DatabaseService.CustomerRepo.GetAll(100000) : new List<Customer>();
                var suppliers = DatabaseService.SupplierRepo != null ? DatabaseService.SupplierRepo.GetAll(true) : new List<Supplier>();
                var sales = DatabaseService.SaleRepo != null ? DatabaseService.SaleRepo.GetAllForExport() : new List<Sale>();
                var movements = DatabaseService.StockMovementRepo != null ? DatabaseService.StockMovementRepo.GetMovements(null, null, null, null, 100000) : new List<StockMovement>();
                var closings = DatabaseService.DailyClosingRepo != null ? DatabaseService.DailyClosingRepo.GetHistory(10000) : new List<DailyClosing>();

                res.ProductsCount = products.Count;
                res.CustomersCount = customers.Count;
                res.SuppliersCount = suppliers.Count;
                res.SalesCount = sales.Count;
                res.StockMovementsCount = movements.Count;
                res.ClosingsCount = closings.Count;

                // Compute financial totals
                for (int i = 0; i < sales.Count; i++)
                {
                    res.TotalSalesPiasters += sales[i].TotalPiasters;
                }
                for (int i = 0; i < customers.Count; i++)
                {
                    if (customers[i].BalancePiasters > 0)
                    {
                        res.TotalDebtsPiasters += customers[i].BalancePiasters;
                    }
                }
                for (int i = 0; i < products.Count; i++)
                {
                    double qty = products[i].StockQuantityMilli / 1000.0;
                    res.TotalStockCostPiasters += (long)Math.Round(qty * products[i].CostPiasters);
                    res.TotalStockRetailPiasters += (long)Math.Round(qty * products[i].PricePiasters);
                }

                // File 1: Products & Stock
                string prodFile = Path.Combine(targetFolder, "01_المنتجات_والمخزون.xlsx");
                using (var wb = new XLWorkbook())
                {
                    var ws = wb.Worksheets.Add("المنتجات_والمخزون");
                    PopulateProductsWorksheet(ws, products, categoryDict, shopName);
                    wb.SaveAs(prodFile);
                    res.GeneratedFiles.Add(prodFile);
                }

                // File 2: Customers & Debts
                string custFile = Path.Combine(targetFolder, "02_العملاء_والديون.xlsx");
                using (var wb = new XLWorkbook())
                {
                    var ws = wb.Worksheets.Add("العملاء_والديون");
                    PopulateCustomersWorksheet(ws, customers, shopName);
                    wb.SaveAs(custFile);
                    res.GeneratedFiles.Add(custFile);
                }

                // File 3: Suppliers & Balances
                string supFile = Path.Combine(targetFolder, "03_الموردين_والأرصدة.xlsx");
                using (var wb = new XLWorkbook())
                {
                    var ws = wb.Worksheets.Add("الموردين_والأرصدة");
                    PopulateSuppliersWorksheet(ws, suppliers, shopName);
                    wb.SaveAs(supFile);
                    res.GeneratedFiles.Add(supFile);
                }

                // File 4: Sales Invoices
                string salesFile = Path.Combine(targetFolder, "04_فواتير_المبيعات.xlsx");
                using (var wb = new XLWorkbook())
                {
                    var ws = wb.Worksheets.Add("فواتير_المبيعات");
                    PopulateSalesWorksheet(ws, sales, shopName);
                    wb.SaveAs(salesFile);
                    res.GeneratedFiles.Add(salesFile);
                }

                // File 5: Stock Movements Log
                string moveFile = Path.Combine(targetFolder, "05_سجل_حركات_المخزون.xlsx");
                using (var wb = new XLWorkbook())
                {
                    var ws = wb.Worksheets.Add("سجل_حركات_المخزون");
                    PopulateStockMovementsWorksheet(ws, movements, shopName);
                    wb.SaveAs(moveFile);
                    res.GeneratedFiles.Add(moveFile);
                }

                // File 6: Daily Closings
                string closeFile = Path.Combine(targetFolder, "06_الإغلاق_اليومي_والورديات.xlsx");
                using (var wb = new XLWorkbook())
                {
                    var ws = wb.Worksheets.Add("الإغلاق_اليومي");
                    PopulateClosingsWorksheet(ws, closings, shopName);
                    wb.SaveAs(closeFile);
                    res.GeneratedFiles.Add(closeFile);
                }

                // File 7: Consolidated Master Workbook
                string masterFile = Path.Combine(targetFolder, "00_بيانات_المحل_الشاملة.xlsx");
                using (var wb = new XLWorkbook())
                {
                    var ws1 = wb.Worksheets.Add("المنتجات_والمخزون");
                    PopulateProductsWorksheet(ws1, products, categoryDict, shopName);

                    var ws2 = wb.Worksheets.Add("العملاء_والديون");
                    PopulateCustomersWorksheet(ws2, customers, shopName);

                    var ws3 = wb.Worksheets.Add("الموردين_والأرصدة");
                    PopulateSuppliersWorksheet(ws3, suppliers, shopName);

                    var ws4 = wb.Worksheets.Add("فواتير_المبيعات");
                    PopulateSalesWorksheet(ws4, sales, shopName);

                    var ws5 = wb.Worksheets.Add("حركات_المخزون");
                    PopulateStockMovementsWorksheet(ws5, movements, shopName);

                    var ws6 = wb.Worksheets.Add("الإغلاق_اليومي");
                    PopulateClosingsWorksheet(ws6, closings, shopName);

                    wb.SaveAs(masterFile);
                    res.GeneratedFiles.Add(masterFile);
                }

                // File 8: Data Ownership Certificate & Readme
                string txtFile = Path.Combine(targetFolder, "بيان_ملكية_وتصدير_البيانات.txt");
                var sb = new System.Text.StringBuilder();
                sb.AppendLine("================================================================================");
                sb.AppendLine("         وثيقة ملكية وتصدير البيانات الشاملة - نظام رفيق لنقاط البيع (Rafiq POS)");
                sb.AppendLine("================================================================================");
                sb.AppendLine(string.Format("اسم المنشأة / المحل: {0}", shopName));
                sb.AppendLine(string.Format("تاريخ وتوقيت التصدير: {0}", DateTime.Now.ToString("yyyy/MM/dd HH:mm:ss")));
                sb.AppendLine("البيئة: Windows Desktop Offline-First (SQLite Engine)");
                sb.AppendLine("--------------------------------------------------------------------------------");
                sb.AppendLine("إحصائيات السجلات المصدرة:");
                sb.AppendLine(string.Format(" • إجمالي الأصناف والمنتجات:       {0} صنف", res.ProductsCount));
                sb.AppendLine(string.Format(" • إجمالي العملاء المسجلين:        {0} عميل (إجمالي الديون: {1:N2} ج.م)", res.CustomersCount, res.TotalDebtsPiasters / 100.0));
                sb.AppendLine(string.Format(" • إجمالي الموردين المسجلين:       {0} مورد", res.SuppliersCount));
                sb.AppendLine(string.Format(" • إجمالي فواتير المبيعات:         {0} فاتورة (إجمالي المبيعات: {1:N2} ج.م)", res.SalesCount, res.TotalSalesPiasters / 100.0));
                sb.AppendLine(string.Format(" • إجمالي حركات المخزون المسجلة:   {0} حركة", res.StockMovementsCount));
                sb.AppendLine(string.Format(" • إجمالي جلسات الإغلاق اليومي:    {0} إغلاق", res.ClosingsCount));
                sb.AppendLine("--------------------------------------------------------------------------------");
                sb.AppendLine("تأكيد الأمان وحرية البيانات:");
                sb.AppendLine("جميع البيانات الواردة في هذا المجلد والملفات المرفقة هي ملكية حصرية وتامة لصاحب");
                sb.AppendLine("المحل، تم تصديرها بجداول Excel قياسية بدون أي تشفير أو احتكار لضمان حقك المطلق");
                sb.AppendLine("في مراجعتها أو نقلها لأي نظام آخر في أي وقت وبكل سلاسة.");
                sb.AppendLine("================================================================================");
                File.WriteAllText(txtFile, sb.ToString(), System.Text.Encoding.UTF8);
                res.GeneratedFiles.Add(txtFile);

                if (DatabaseService.Audit != null)
                {
                    DatabaseService.Audit.Log(
                        "FULL_STORE_EXPORT",
                        "EXPORT",
                        "SUCCESS",
                        string.Format("{{\"folder\":\"{0}\",\"products\":{1},\"customers\":{2},\"sales\":{3}}}",
                            targetFolder.Replace("\\", "\\\\"), res.ProductsCount, res.CustomersCount, res.SalesCount),
                        "SYSTEM"
                    );
                }

                res.Success = true;
                res.Message = string.Format("تم تصدير كافة بيانات المحل بنجاح إلى المجلد ({0}) بإجمالي {1} ملفاً.", Path.GetFileName(targetFolder), res.GeneratedFiles.Count);
            }
            catch (Exception ex)
            {
                Logger.Error("FullStoreExport: حدث خطأ أثناء تصدير بيانات المحل", ex);
                res.Success = false;
                res.Message = "حدث خطأ أثناء تصدير البيانات: " + ex.Message;
            }

            return res;
        }

        private static void PopulateProductsWorksheet(IXLWorksheet ws, List<Product> products, Dictionary<string, string> categoryNames, string shopName)
        {
            ws.RightToLeft = true;
            ws.ShowGridLines = true;

            // Row 1: Title
            ws.Range("A1:N1").Merge();
            var tCell = ws.Cell("A1");
            tCell.Value = string.Format("سجل الأصناف والمخزون الكامل - {0}", shopName);
            tCell.Style.Font.Bold = true;
            tCell.Style.Font.FontSize = 13;
            tCell.Style.Font.FontColor = XLColor.White;
            tCell.Style.Fill.BackgroundColor = ForestDark;
            tCell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
            tCell.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
            ws.Row(1).Height = 36;

            // Row 2: Subtitle
            ws.Range("A2:N2").Merge();
            var sCell = ws.Cell("A2");
            sCell.Value = string.Format("تاريخ التصدير: {0} | إجمالي الأصناف: {1} | القيم المالية بالجنيه المصري", DateTime.Now.ToString("yyyy/MM/dd HH:mm"), products.Count);
            sCell.Style.Font.Bold = true;
            sCell.Style.Font.FontSize = 9.5;
            sCell.Style.Font.FontColor = XLColor.FromArgb(0, 77, 64);
            sCell.Style.Fill.BackgroundColor = SoftMint;
            sCell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
            sCell.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
            ws.Row(2).Height = 24;

            // Row 3: Headers
            string[] headers = new string[]
            {
                "م", "كود SKU", "اسم الصنف", "الباركود", "القسم / التصنيف", "الوحدة",
                "سعر الشراء (ج.م)", "سعر البيع (ج.م)", "الرصيد الحالي", "حد الطلب",
                "إجمالي قيمة التكلفة (ج.م)", "إجمالي قيمة البيع (ج.م)", "نسبة الضريبة (%)", "حالة المخزون"
            };
            ws.Row(3).Height = 30;
            for (int i = 0; i < headers.Length; i++)
            {
                var h = ws.Cell(3, i + 1);
                h.Value = headers[i];
                h.Style.Font.Bold = true;
                h.Style.Font.FontColor = XLColor.White;
                h.Style.Fill.BackgroundColor = EmeraldGreen;
                h.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                h.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
                h.Style.Border.OutsideBorder = XLBorderStyleValues.Thin;
            }

            double totalQty = 0;
            double totalCostVal = 0;
            double totalRetailVal = 0;

            for (int i = 0; i < products.Count; i++)
            {
                int r = i + 4;
                var p = products[i];
                double qty = p.StockQuantityMilli / 1000.0;
                double minQty = p.MinStockQuantityMilli / 1000.0;
                double cost = p.CostPiasters / 100.0;
                double retail = p.PricePiasters / 100.0;
                double costRow = qty * cost;
                double retailRow = qty * retail;

                totalQty += qty;
                totalCostVal += costRow;
                totalRetailVal += retailRow;

                string catName = "عام";
                if (!string.IsNullOrEmpty(p.CategoryId) && categoryNames.ContainsKey(p.CategoryId))
                {
                    catName = categoryNames[p.CategoryId];
                }

                string status = "متوفر";
                if (qty <= 0) status = "نفد من المخزن";
                else if (qty <= minQty) status = "قارب على النفاد";

                ws.Row(r).Height = 22;
                ws.Cell(r, 1).Value = i + 1;
                ws.Cell(r, 2).Value = p.InternalCode ?? "";
                ws.Cell(r, 3).Value = p.Name ?? "";
                ws.Cell(r, 4).SetValue(p.Barcode ?? "");
                ws.Cell(r, 5).Value = catName;
                ws.Cell(r, 6).Value = p.Unit ?? "قطعة";
                ws.Cell(r, 7).Value = cost;
                ws.Cell(r, 7).Style.NumberFormat.Format = "#,##0.00";
                ws.Cell(r, 8).Value = retail;
                ws.Cell(r, 8).Style.NumberFormat.Format = "#,##0.00";
                ws.Cell(r, 9).Value = qty;
                ws.Cell(r, 9).Style.NumberFormat.Format = "#,##0.##";
                ws.Cell(r, 10).Value = minQty;
                ws.Cell(r, 11).Value = costRow;
                ws.Cell(r, 11).Style.NumberFormat.Format = "#,##0.00";
                ws.Cell(r, 12).Value = retailRow;
                ws.Cell(r, 12).Style.NumberFormat.Format = "#,##0.00";
                ws.Cell(r, 13).Value = p.TaxRatePercent;
                ws.Cell(r, 14).Value = status;

                if (i % 2 == 1)
                {
                    ws.Range(r, 1, r, 14).Style.Fill.BackgroundColor = ZebraLight;
                }
            }

            // Summary row
            int sumRow = products.Count + 4;
            ws.Row(sumRow).Height = 26;
            ws.Cell(sumRow, 1).Value = "الإجمالي العام";
            ws.Range(sumRow, 1, sumRow, 8).Merge().Style.Font.Bold = true;
            ws.Cell(sumRow, 1).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
            ws.Cell(sumRow, 9).Value = totalQty;
            ws.Cell(sumRow, 9).Style.NumberFormat.Format = "#,##0.##";
            ws.Cell(sumRow, 9).Style.Font.Bold = true;
            ws.Cell(sumRow, 11).Value = totalCostVal;
            ws.Cell(sumRow, 11).Style.NumberFormat.Format = "#,##0.00";
            ws.Cell(sumRow, 11).Style.Font.Bold = true;
            ws.Cell(sumRow, 12).Value = totalRetailVal;
            ws.Cell(sumRow, 12).Style.NumberFormat.Format = "#,##0.00";
            ws.Cell(sumRow, 12).Style.Font.Bold = true;
            ws.Range(sumRow, 1, sumRow, 14).Style.Fill.BackgroundColor = SoftMint;

            ws.Columns().AdjustToContents(10, 45);
        }

        private static void PopulateCustomersWorksheet(IXLWorksheet ws, List<Customer> customers, string shopName)
        {
            ws.RightToLeft = true;
            ws.ShowGridLines = true;

            ws.Range("A1:I1").Merge();
            var tCell = ws.Cell("A1");
            tCell.Value = string.Format("سجل العملاء وحسابات الديون - {0}", shopName);
            tCell.Style.Font.Bold = true;
            tCell.Style.Font.FontSize = 13;
            tCell.Style.Font.FontColor = XLColor.White;
            tCell.Style.Fill.BackgroundColor = ForestDark;
            tCell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
            tCell.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
            ws.Row(1).Height = 36;

            ws.Range("A2:I2").Merge();
            var sCell = ws.Cell("A2");
            sCell.Value = string.Format("تاريخ التصدير: {0} | إجمالي العملاء: {1}", DateTime.Now.ToString("yyyy/MM/dd HH:mm"), customers.Count);
            sCell.Style.Font.Bold = true;
            sCell.Style.Font.FontSize = 9.5;
            sCell.Style.Font.FontColor = XLColor.FromArgb(0, 77, 64);
            sCell.Style.Fill.BackgroundColor = SoftMint;
            sCell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
            sCell.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
            ws.Row(2).Height = 24;

            string[] headers = new string[]
            {
                "م", "اسم العميل", "رقم الهاتف",
                "الرصيد المستحق الحالي (ج.م)", "حد الائتمان / التنبيه (ج.م)", "حالة الحساب", "تاريخ الإضافة"
            };
            ws.Row(3).Height = 30;
            for (int i = 0; i < headers.Length; i++)
            {
                var h = ws.Cell(3, i + 1);
                h.Value = headers[i];
                h.Style.Font.Bold = true;
                h.Style.Font.FontColor = XLColor.White;
                h.Style.Fill.BackgroundColor = EmeraldGreen;
                h.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                h.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
                h.Style.Border.OutsideBorder = XLBorderStyleValues.Thin;
            }

            double totalDebts = 0;

            for (int i = 0; i < customers.Count; i++)
            {
                int r = i + 4;
                var c = customers[i];
                double bal = c.BalancePiasters / 100.0;
                double limit = c.CreditLimitPiasters / 100.0;
                totalDebts += bal;

                ws.Row(r).Height = 22;
                ws.Cell(r, 1).Value = i + 1;
                ws.Cell(r, 2).Value = c.Name ?? "";
                ws.Cell(r, 3).SetValue(c.Phone ?? "");
                ws.Cell(r, 4).Value = bal;
                ws.Cell(r, 4).Style.NumberFormat.Format = "#,##0.00";
                if (bal > 0) ws.Cell(r, 4).Style.Font.FontColor = XLColor.FromArgb(178, 58, 46);
                ws.Cell(r, 5).Value = limit;
                ws.Cell(r, 5).Style.NumberFormat.Format = "#,##0.00";
                ws.Cell(r, 6).Value = c.IsArchived ? "مؤرشف" : "نشط";
                ws.Cell(r, 7).Value = c.CreatedAt ?? "";

                if (i % 2 == 1) ws.Range(r, 1, r, 7).Style.Fill.BackgroundColor = ZebraLight;
            }

            int sumRow = customers.Count + 4;
            ws.Row(sumRow).Height = 26;
            ws.Cell(sumRow, 1).Value = "إجمالي مديونيات العملاء";
            ws.Range(sumRow, 1, sumRow, 3).Merge().Style.Font.Bold = true;
            ws.Cell(sumRow, 4).Value = totalDebts;
            ws.Cell(sumRow, 4).Style.NumberFormat.Format = "#,##0.00";
            ws.Cell(sumRow, 4).Style.Font.Bold = true;
            ws.Range(sumRow, 1, sumRow, 7).Style.Fill.BackgroundColor = SoftMint;

            ws.Columns().AdjustToContents(10, 40);
        }

        private static void PopulateSuppliersWorksheet(IXLWorksheet ws, List<Supplier> suppliers, string shopName)
        {
            ws.RightToLeft = true;
            ws.ShowGridLines = true;

            ws.Range("A1:H1").Merge();
            var tCell = ws.Cell("A1");
            tCell.Value = string.Format("سجل الموردين والأرصدة المستحقة - {0}", shopName);
            tCell.Style.Font.Bold = true;
            tCell.Style.Font.FontSize = 13;
            tCell.Style.Font.FontColor = XLColor.White;
            tCell.Style.Fill.BackgroundColor = ForestDark;
            tCell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
            tCell.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
            ws.Row(1).Height = 36;

            ws.Range("A2:H2").Merge();
            var sCell = ws.Cell("A2");
            sCell.Value = string.Format("تاريخ التصدير: {0} | إجمالي الموردين: {1}", DateTime.Now.ToString("yyyy/MM/dd HH:mm"), suppliers.Count);
            sCell.Style.Font.Bold = true;
            sCell.Style.Font.FontSize = 9.5;
            sCell.Style.Font.FontColor = XLColor.FromArgb(0, 77, 64);
            sCell.Style.Fill.BackgroundColor = SoftMint;
            sCell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
            sCell.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
            ws.Row(2).Height = 24;

            string[] headers = new string[]
            {
                "م", "اسم المورد", "الشركة / النشاط", "رقم الهاتف", "العنوان",
                "الرصيد المستحق (ج.م)", "حالة النشاط", "ملاحظات"
            };
            ws.Row(3).Height = 30;
            for (int i = 0; i < headers.Length; i++)
            {
                var h = ws.Cell(3, i + 1);
                h.Value = headers[i];
                h.Style.Font.Bold = true;
                h.Style.Font.FontColor = XLColor.White;
                h.Style.Fill.BackgroundColor = EmeraldGreen;
                h.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                h.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
                h.Style.Border.OutsideBorder = XLBorderStyleValues.Thin;
            }

            double totalDue = 0;
            for (int i = 0; i < suppliers.Count; i++)
            {
                int r = i + 4;
                var s = suppliers[i];
                double bal = s.BalancePiasters / 100.0;
                totalDue += bal;

                ws.Row(r).Height = 22;
                ws.Cell(r, 1).Value = i + 1;
                ws.Cell(r, 2).Value = s.Name ?? "";
                ws.Cell(r, 3).Value = s.CompanyName ?? "";
                ws.Cell(r, 4).SetValue(s.Phone ?? "");
                ws.Cell(r, 5).Value = s.Address ?? "";
                ws.Cell(r, 6).Value = bal;
                ws.Cell(r, 6).Style.NumberFormat.Format = "#,##0.00";
                ws.Cell(r, 7).Value = s.IsActive ? "نشط" : "متوقف";
                ws.Cell(r, 8).Value = s.Notes ?? "";

                if (i % 2 == 1) ws.Range(r, 1, r, 8).Style.Fill.BackgroundColor = ZebraLight;
            }

            int sumRow = suppliers.Count + 4;
            ws.Row(sumRow).Height = 26;
            ws.Cell(sumRow, 1).Value = "إجمالي الأرصدة المستحقة للموردين";
            ws.Range(sumRow, 1, sumRow, 5).Merge().Style.Font.Bold = true;
            ws.Cell(sumRow, 6).Value = totalDue;
            ws.Cell(sumRow, 6).Style.NumberFormat.Format = "#,##0.00";
            ws.Cell(sumRow, 6).Style.Font.Bold = true;
            ws.Range(sumRow, 1, sumRow, 8).Style.Fill.BackgroundColor = SoftMint;

            ws.Columns().AdjustToContents(10, 40);
        }

        private static void PopulateSalesWorksheet(IXLWorksheet ws, List<Sale> sales, string shopName)
        {
            ws.RightToLeft = true;
            ws.ShowGridLines = true;

            ws.Range("A1:N1").Merge();
            var tCell = ws.Cell("A1");
            tCell.Value = string.Format("سجل فواتير المبيعات - {0}", shopName);
            tCell.Style.Font.Bold = true;
            tCell.Style.Font.FontSize = 13;
            tCell.Style.Font.FontColor = XLColor.White;
            tCell.Style.Fill.BackgroundColor = ForestDark;
            tCell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
            tCell.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
            ws.Row(1).Height = 36;

            ws.Range("A2:N2").Merge();
            var sCell = ws.Cell("A2");
            sCell.Value = string.Format("تاريخ التصدير: {0} | إجمالي الفواتير: {1}", DateTime.Now.ToString("yyyy/MM/dd HH:mm"), sales.Count);
            sCell.Style.Font.Bold = true;
            sCell.Style.Font.FontSize = 9.5;
            sCell.Style.Font.FontColor = XLColor.FromArgb(0, 77, 64);
            sCell.Style.Fill.BackgroundColor = SoftMint;
            sCell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
            sCell.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
            ws.Row(2).Height = 24;

            string[] headers = new string[]
            {
                "م", "رقم الفاتورة", "التاريخ والوقت", "اسم العميل", "هاتف العميل",
                "الإجمالي قبل الخصم (ج.م)", "الخصم (ج.م)", "الضريبة (ج.م)", "الإجمالي النهائي (ج.م)",
                "المدفوع (ج.م)", "المتبقي (ج.م)", "طريقة الدفع", "الحالة", "ملاحظات"
            };
            ws.Row(3).Height = 30;
            for (int i = 0; i < headers.Length; i++)
            {
                var h = ws.Cell(3, i + 1);
                h.Value = headers[i];
                h.Style.Font.Bold = true;
                h.Style.Font.FontColor = XLColor.White;
                h.Style.Fill.BackgroundColor = EmeraldGreen;
                h.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                h.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
                h.Style.Border.OutsideBorder = XLBorderStyleValues.Thin;
            }

            double totalSales = 0;
            double totalPaid = 0;
            double totalRemaining = 0;

            for (int i = 0; i < sales.Count; i++)
            {
                int r = i + 4;
                var s = sales[i];
                double sub = s.SubtotalPiasters / 100.0;
                double disc = s.DiscountPiasters / 100.0;
                double tax = s.TaxPiasters / 100.0;
                double tot = s.TotalPiasters / 100.0;
                double paid = s.PaidPiasters / 100.0;
                double rem = (s.TotalPiasters - s.PaidPiasters) / 100.0;

                totalSales += tot;
                totalPaid += paid;
                totalRemaining += rem;

                ws.Row(r).Height = 22;
                ws.Cell(r, 1).Value = i + 1;
                ws.Cell(r, 2).Value = "#" + s.InvoiceNumber;
                ws.Cell(r, 3).Value = s.CreatedAt ?? "";
                ws.Cell(r, 4).Value = s.CustomerName ?? "عميل نقدي";
                ws.Cell(r, 5).SetValue(s.CustomerPhone ?? "");
                ws.Cell(r, 6).Value = sub;
                ws.Cell(r, 6).Style.NumberFormat.Format = "#,##0.00";
                ws.Cell(r, 7).Value = disc;
                ws.Cell(r, 7).Style.NumberFormat.Format = "#,##0.00";
                ws.Cell(r, 8).Value = tax;
                ws.Cell(r, 8).Style.NumberFormat.Format = "#,##0.00";
                ws.Cell(r, 9).Value = tot;
                ws.Cell(r, 9).Style.NumberFormat.Format = "#,##0.00";
                ws.Cell(r, 10).Value = paid;
                ws.Cell(r, 10).Style.NumberFormat.Format = "#,##0.00";
                ws.Cell(r, 11).Value = rem;
                ws.Cell(r, 11).Style.NumberFormat.Format = "#,##0.00";
                ws.Cell(r, 12).Value = s.PaymentMethod ?? "cash";
                ws.Cell(r, 13).Value = s.Status ?? "completed";
                ws.Cell(r, 14).Value = s.Notes ?? "";

                if (i % 2 == 1) ws.Range(r, 1, r, 14).Style.Fill.BackgroundColor = ZebraLight;
            }

            int sumRow = sales.Count + 4;
            ws.Row(sumRow).Height = 26;
            ws.Cell(sumRow, 1).Value = "إجمالي المبيعات والتحصيلات";
            ws.Range(sumRow, 1, sumRow, 8).Merge().Style.Font.Bold = true;
            ws.Cell(sumRow, 9).Value = totalSales;
            ws.Cell(sumRow, 9).Style.NumberFormat.Format = "#,##0.00";
            ws.Cell(sumRow, 9).Style.Font.Bold = true;
            ws.Cell(sumRow, 10).Value = totalPaid;
            ws.Cell(sumRow, 10).Style.NumberFormat.Format = "#,##0.00";
            ws.Cell(sumRow, 10).Style.Font.Bold = true;
            ws.Cell(sumRow, 11).Value = totalRemaining;
            ws.Cell(sumRow, 11).Style.NumberFormat.Format = "#,##0.00";
            ws.Cell(sumRow, 11).Style.Font.Bold = true;
            ws.Range(sumRow, 1, sumRow, 14).Style.Fill.BackgroundColor = SoftMint;

            ws.Columns().AdjustToContents(10, 35);
        }

        private static void PopulateStockMovementsWorksheet(IXLWorksheet ws, List<StockMovement> movements, string shopName)
        {
            ws.RightToLeft = true;
            ws.ShowGridLines = true;

            ws.Range("A1:I1").Merge();
            var tCell = ws.Cell("A1");
            tCell.Value = string.Format("سجل حركات وتغيرات المخزون - {0}", shopName);
            tCell.Style.Font.Bold = true;
            tCell.Style.Font.FontSize = 13;
            tCell.Style.Font.FontColor = XLColor.White;
            tCell.Style.Fill.BackgroundColor = ForestDark;
            tCell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
            tCell.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
            ws.Row(1).Height = 36;

            ws.Range("A2:I2").Merge();
            var sCell = ws.Cell("A2");
            sCell.Value = string.Format("تاريخ التصدير: {0} | إجمالي الحركات: {1}", DateTime.Now.ToString("yyyy/MM/dd HH:mm"), movements.Count);
            sCell.Style.Font.Bold = true;
            sCell.Style.Font.FontSize = 9.5;
            sCell.Style.Font.FontColor = XLColor.FromArgb(0, 77, 64);
            sCell.Style.Fill.BackgroundColor = SoftMint;
            sCell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
            sCell.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
            ws.Row(2).Height = 24;

            string[] headers = new string[]
            {
                "م", "التاريخ والوقت", "اسم الصنف", "الباركود",
                "نوع الحركة", "الكمية", "سعر التكلفة (ج.م)", "المرجع / الفاتورة", "ملاحظات"
            };
            ws.Row(3).Height = 30;
            for (int i = 0; i < headers.Length; i++)
            {
                var h = ws.Cell(3, i + 1);
                h.Value = headers[i];
                h.Style.Font.Bold = true;
                h.Style.Font.FontColor = XLColor.White;
                h.Style.Fill.BackgroundColor = EmeraldGreen;
                h.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                h.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
                h.Style.Border.OutsideBorder = XLBorderStyleValues.Thin;
            }

            for (int i = 0; i < movements.Count; i++)
            {
                int r = i + 4;
                var m = movements[i];
                double qty = m.QuantityMilli / 1000.0;
                double cost = m.UnitCostPiasters / 100.0;

                ws.Row(r).Height = 22;
                ws.Cell(r, 1).Value = i + 1;
                ws.Cell(r, 2).Value = m.CreatedAt ?? "";
                ws.Cell(r, 3).Value = m.ProductName ?? "";
                ws.Cell(r, 4).SetValue(m.ProductBarcode ?? "");
                ws.Cell(r, 5).Value = !string.IsNullOrEmpty(m.MovementTypeArabic) ? m.MovementTypeArabic : (m.MovementType ?? "");
                ws.Cell(r, 6).Value = qty;
                ws.Cell(r, 6).Style.NumberFormat.Format = "#,##0.##";
                ws.Cell(r, 7).Value = cost;
                ws.Cell(r, 7).Style.NumberFormat.Format = "#,##0.00";
                ws.Cell(r, 8).Value = m.ReferenceId ?? "";
                ws.Cell(r, 9).Value = m.Note ?? "";

                if (i % 2 == 1) ws.Range(r, 1, r, 9).Style.Fill.BackgroundColor = ZebraLight;
            }

            ws.Columns().AdjustToContents(10, 35);
        }

        private static void PopulateClosingsWorksheet(IXLWorksheet ws, List<DailyClosing> closings, string shopName)
        {
            ws.RightToLeft = true;
            ws.ShowGridLines = true;

            ws.Range("A1:K1").Merge();
            var tCell = ws.Cell("A1");
            tCell.Value = string.Format("سجل الإغلاق اليومي والورديات - {0}", shopName);
            tCell.Style.Font.Bold = true;
            tCell.Style.Font.FontSize = 13;
            tCell.Style.Font.FontColor = XLColor.White;
            tCell.Style.Fill.BackgroundColor = ForestDark;
            tCell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
            tCell.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
            ws.Row(1).Height = 36;

            ws.Range("A2:K2").Merge();
            var sCell = ws.Cell("A2");
            sCell.Value = string.Format("تاريخ التصدير: {0} | إجمالي الإغلاقات: {1}", DateTime.Now.ToString("yyyy/MM/dd HH:mm"), closings.Count);
            sCell.Style.Font.Bold = true;
            sCell.Style.Font.FontSize = 9.5;
            sCell.Style.Font.FontColor = XLColor.FromArgb(0, 77, 64);
            sCell.Style.Fill.BackgroundColor = SoftMint;
            sCell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
            sCell.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
            ws.Row(2).Height = 24;

            string[] headers = new string[]
            {
                "م", "رقم الإغلاق", "تاريخ العمل", "تاريخ الإغلاق", "الكاشير",
                "إجمالي المبيعات (ج.م)", "مبيعات نقدي (ج.م)", "مبيعات آجل (ج.م)",
                "النقدية الفعلية (ج.م)", "العجز / الزيادة (ج.م)", "عدد الفواتير"
            };
            ws.Row(3).Height = 30;
            for (int i = 0; i < headers.Length; i++)
            {
                var h = ws.Cell(3, i + 1);
                h.Value = headers[i];
                h.Style.Font.Bold = true;
                h.Style.Font.FontColor = XLColor.White;
                h.Style.Fill.BackgroundColor = EmeraldGreen;
                h.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                h.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
                h.Style.Border.OutsideBorder = XLBorderStyleValues.Thin;
            }

            for (int i = 0; i < closings.Count; i++)
            {
                int r = i + 4;
                var c = closings[i];
                double tot = c.TotalSalesPiasters / 100.0;
                double cash = c.CashSalesPiasters / 100.0;
                double credit = c.CreditSalesPiasters / 100.0;
                double act = c.ActualCashPiasters / 100.0;
                double diff = c.DifferencePiasters / 100.0;

                ws.Row(r).Height = 22;
                ws.Cell(r, 1).Value = i + 1;
                ws.Cell(r, 2).Value = "#" + c.ClosingNumber;
                ws.Cell(r, 3).Value = c.BusinessDate ?? "";
                ws.Cell(r, 4).Value = c.ClosedAt ?? "";
                ws.Cell(r, 5).Value = c.CashierName ?? "";
                ws.Cell(r, 6).Value = tot;
                ws.Cell(r, 6).Style.NumberFormat.Format = "#,##0.00";
                ws.Cell(r, 7).Value = cash;
                ws.Cell(r, 7).Style.NumberFormat.Format = "#,##0.00";
                ws.Cell(r, 8).Value = credit;
                ws.Cell(r, 8).Style.NumberFormat.Format = "#,##0.00";
                ws.Cell(r, 9).Value = act;
                ws.Cell(r, 9).Style.NumberFormat.Format = "#,##0.00";
                ws.Cell(r, 10).Value = diff;
                ws.Cell(r, 10).Style.NumberFormat.Format = "#,##0.00";
                if (diff < 0) ws.Cell(r, 10).Style.Font.FontColor = XLColor.FromArgb(178, 58, 46);
                ws.Cell(r, 11).Value = c.InvoicesCount;

                if (i % 2 == 1) ws.Range(r, 1, r, 11).Style.Fill.BackgroundColor = ZebraLight;
            }

            ws.Columns().AdjustToContents(10, 35);
        }
    }
}
