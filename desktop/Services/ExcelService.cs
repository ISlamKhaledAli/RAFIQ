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
                ws.Range("A1:L1").Merge();
                var titleCell = ws.Cell("A1");
                titleCell.Value = "رفيق لنقاط البيع وإدارة السوبرماركت (Rafiq POS) - نموذج استيراد الأصناف المعتمد";
                titleCell.Style.Font.Bold = true;
                titleCell.Style.Font.FontSize = 13;
                titleCell.Style.Font.FontColor = XLColor.White;
                titleCell.Style.Fill.BackgroundColor = ForestDark;
                titleCell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                titleCell.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
                ws.Row(1).Height = 40;

                // 2. Subtitle / Guidance Banner (Row 2)
                ws.Range("A2:L2").Merge();
                var subCell = ws.Cell("A2");
                subCell.Value = "تعليمات هامة: الأعمدة المميزة بنجمة (*) إلزامية | الباركودات تحفظ كنص لعدم مسح الأصفار جهة اليسار | الوحدة: قطعة أو كجم | الأسعار والتكلفة بالجنيه المصري";
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

                // 4. Realistic Supermarket Sample Rows (Rows 4 to 9)
                object[][] sampleData = new object[][]
                {
                    new object[] { "شاي العروسة ناعم 250 جم", "6223000123456", "6223000123457, 6223000123458", "بقالة ومشروبات", "قطعة", 35.00, 28.50, 50, 10, 0, "TEA-AR-250", "EG-100000-01" },
                    new object[] { "سكر الأسرة فاخر 1 كجم", "6221144001122", "", "بقالة ومشروبات", "قطعة", 36.00, 32.00, 80, 15, 0, "SUG-OSR-01", "EG-100000-02" },
                    new object[] { "طماطم بلدي طازجة درجة أولى", "200123456789", "", "خضار وفاكهة", "كجم", 15.00, 10.00, 45.0, 5, 0, "VEG-TOM-01", "" },
                    new object[] { "جبنة بيضاء رومي قديمة بالوزن", "200987654321", "", "ألبان وأجبان", "كجم", 320.00, 260.00, 15.5, 3, 0, "CHS-ROM-01", "EG-100000-03" },
                    new object[] { "مكرونة حواء 400 جم", "6223000987654", "6223000987655", "بقالة ومشروبات", "قطعة", 14.50, 11.75, 120, 20, 0, "PAS-HAW-01", "EG-100000-04" },
                    new object[] { "صابون سائل بريل بالليمون 1 لتر", "6222000554433", "", "منظفات وعناية", "قطعة", 42.00, 35.00, 30, 5, 14, "CLN-PRL-01", "EG-100000-05" }
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
                        else if (c == 3 || c == 4) // Category, Unit
                        {
                            cell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                        }
                        else if (c == 5 || c == 6) // Prices (Currency format)
                        {
                            if (rowVals[c] is double)
                            {
                                cell.Value = (double)rowVals[c];
                                cell.Style.NumberFormat.Format = "#,##0.00";
                            }
                            cell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                        }
                        else if (c == 7) // Stock
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
                        else if (c == 8 || c == 9) // Min stock, Tax
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
                ws.Column(6).Width = 20; // سعر البيع
                ws.Column(7).Width = 20; // سعر التكلفة
                ws.Column(8).Width = 18; // الرصيد
                ws.Column(9).Width = 18; // حد الطلب
                ws.Column(10).Width = 16; // الضريبة
                ws.Column(11).Width = 22; // SKU
                ws.Column(12).Width = 26; // كود ضريبي

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
                ws.Range("A1:N1").Merge();
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
                ws.Range("A2:N2").Merge();
                var metaCell = ws.Cell("A2");
                metaCell.Value = string.Format(
                    "تاريخ التصدير: {0} | إجمالي الأصناف المسجلة: {1} صنف | نظام رفيق لإدارة السوبرماركت والمخازن",
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

                // 4. Products Data Rows
                for (int idx = 0; idx < products.Count; idx++)
                {
                    int rowNum = idx + 4;
                    var prod = products[idx];
                    ws.Row(rowNum).Height = 22;

                    bool isZebra = (idx % 2 == 1);
                    XLColor rowBg = isZebra ? ZebraLight : XLColor.White;

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

                    object[] rowVals = new object[]
                    {
                        idx + 1,
                        prod.Name ?? "",
                        prod.Barcode ?? "",
                        catName,
                        prod.Unit == "kg" ? "كجم" : "قطعة",
                        sellPounds,
                        costPounds,
                        profitPounds,
                        marginPercent > 0 ? string.Format("{0:0.#}%", marginPercent) : "0%",
                        currentStock,
                        minStock,
                        stockStatusText,
                        prod.TaxRatePercent > 0 ? string.Format("{0}%", prod.TaxRatePercent) : "0%",
                        prod.InternalCode ?? ""
                    };

                    for (int c = 0; c < rowVals.Length; c++)
                    {
                        var cell = ws.Cell(rowNum, c + 1);
                        cell.Value = rowVals[c] != null ? rowVals[c].ToString() : "";
                        cell.Style.Font.FontSize = 10;
                        cell.Style.Fill.BackgroundColor = rowBg;
                        cell.Style.Border.OutsideBorder = XLBorderStyleValues.Thin;
                        cell.Style.Border.OutsideBorderColor = BorderGray;
                        cell.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;

                        if (c == 0) // Sequence
                        {
                            cell.Value = idx + 1;
                            cell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                        }
                        else if (c == 1) // Name
                        {
                            cell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Right;
                        }
                        else if (c == 2) // Barcode
                        {
                            cell.Style.NumberFormat.Format = "@";
                            cell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                        }
                        else if (c == 5 || c == 6 || c == 7) // Prices & Profit
                        {
                            cell.Value = (double)rowVals[c];
                            cell.Style.NumberFormat.Format = "#,##0.00";
                            cell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                        }
                        else if (c == 9 || c == 10) // Stock & MinStock
                        {
                            cell.Value = (double)rowVals[c];
                            cell.Style.NumberFormat.Format = "#,##0.###";
                            cell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                        }
                        else if (c == 11) // Stock Status badge
                        {
                            cell.Style.Fill.BackgroundColor = stockBg;
                            cell.Style.Font.FontColor = stockFont;
                            cell.Style.Font.Bold = true;
                            cell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                        }
                        else
                        {
                            cell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                        }
                    }
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
                titleCell.Value = "رفيق لنقاط البيع وإدارة السوبرماركت (Rafiq POS) - نموذج استيراد بيانات العملاء والديون الافتتاحية";
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
    }
}
