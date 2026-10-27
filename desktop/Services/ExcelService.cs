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
        private static string CleanWorksheetName(string name, HashSet<string> used)
        {
            if (string.IsNullOrWhiteSpace(name)) name = "عام";
            char[] invalidChars = new char[] { '\\', '/', '?', '*', ':', '[', ']', '\'' };
            string clean = name;
            for (int i = 0; i < invalidChars.Length; i++)
            {
                clean = clean.Replace(invalidChars[i], '_');
            }
            clean = clean.Trim();
            if (clean.Length > 28) clean = clean.Substring(0, 28);
            string candidate = clean;
            int counter = 1;
            while (used.Contains(candidate))
            {
                string prefix = clean.Length > 24 ? clean.Substring(0, 24) : clean;
                candidate = prefix + "_" + counter;
                counter++;
            }
            used.Add(candidate);
            return candidate;
        }

        private static void PopulateStandardProductSheet(
            IXLWorksheet ws,
            string sheetTitleBanner,
            List<Product> prodList,
            Dictionary<string, string> categoryNames,
            string fixedCategoryName = null)
        {
            ws.RightToLeft = true;
            ws.ShowGridLines = true;

            // 1. Title Banner
            ws.Range("A1:T1").Merge();
            var titleCell = ws.Cell("A1");
            titleCell.Value = "رفيق POS - " + sheetTitleBanner;
            titleCell.Style.Font.Bold = true;
            titleCell.Style.Font.FontSize = 13;
            titleCell.Style.Font.FontColor = XLColor.White;
            titleCell.Style.Fill.BackgroundColor = ForestDark;
            titleCell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
            titleCell.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
            ws.Row(1).Height = 40;

            // 2. Subtitle Banner
            ws.Range("A2:T2").Merge();
            var subCell = ws.Cell("A2");
            subCell.Value = string.Format(
                "تاريخ التصدير: {0} | اسم التابة يمثل القسم تلقائياً | إجمالي الأصناف: {1} صنف | المبالغ بالجنيه المصري | المعادلات تتحدث تلقائياً",
                DateTime.Now.ToString("yyyy/MM/dd HH:mm"),
                prodList != null ? prodList.Count : 0
            );
            subCell.Style.Font.Bold = true;
            subCell.Style.Font.FontSize = 9.5;
            subCell.Style.Font.FontColor = XLColor.FromArgb(0, 77, 64);
            subCell.Style.Fill.BackgroundColor = SoftMint;
            subCell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
            subCell.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
            ws.Row(2).Height = 26;

            // 3. Headers
            string[] headers = new string[]
            {
                "م",
                "اسم الصنف *",
                "الباركود الرئيسي",
                "باركودات إضافية (مفصولة بفاصلة)",
                "الوحدة (قطعة / كجم)",
                "سعر البيع (بالجنيه) *",
                "سعر التكلفة (بالجنيه)",
                "الرصيد الافتتاحي",
                "حد الطلب الأدنى",
                "هامش الربح للقطعة (ج.م)",
                "نسبة الربح (%)",
                "إجمالي قيمة التكلفة (ج.م)",
                "إجمالي القيمة البيعية (ج.م)",
                "إجمالي الربح المتوقع (ج.م)",
                "حالة المخزون التلقائية",
                "نسبة الضريبة (%)",
                "كود الصنف الداخلي (SKU)",
                "اللون (اختياري / للملابس)",
                "المقاس (اختياري / للملابس)",
                "كود التصنيف الضريبي (GS1/EGS)"
            };

            ws.Row(3).Height = 32;
            for (int i = 0; i < headers.Length; i++)
            {
                var cell = ws.Cell(3, i + 1);
                cell.Value = headers[i];
                cell.Style.Font.Bold = true;
                cell.Style.Font.FontSize = 10;
                cell.Style.Font.FontColor = XLColor.White;
                cell.Style.Fill.BackgroundColor = EmeraldGreen;
                cell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                cell.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
                cell.Style.Border.OutsideBorder = XLBorderStyleValues.Thin;
                cell.Style.Border.OutsideBorderColor = XLColor.FromArgb(0, 77, 64);
            }

            int count = prodList != null ? prodList.Count : 0;
            for (int idx = 0; idx < count; idx++)
            {
                int r = idx + 4;
                var p = prodList[idx];
                ws.Row(r).Height = 22;
                bool isZebra = (idx % 2 == 1);
                XLColor rowBg = isZebra ? ZebraLight : XLColor.White;

                double sellPrice = p.PricePiasters / 100.0;
                double costPrice = p.CostPiasters / 100.0;
                double stockQty = p.StockQuantityMilli / 1000.0;
                double minStockQty = p.MinStockQuantityMilli / 1000.0;
                double unitMargin = Math.Max(0, sellPrice - costPrice);
                double totalCost = stockQty * costPrice;
                double totalRetail = stockQty * sellPrice;
                double totalProfit = totalRetail - totalCost;

                string extraBarcodes = "";
                if (p.Barcodes != null && p.Barcodes.Count > 0)
                {
                    extraBarcodes = string.Join(", ", p.Barcodes.ToArray());
                }

                ws.Cell(r, 1).Value = idx + 1;
                ws.Cell(r, 2).Value = p.Name ?? "";
                ws.Cell(r, 3).SetValue<string>(p.Barcode ?? "");
                ws.Cell(r, 4).SetValue<string>(extraBarcodes);
                ws.Cell(r, 5).Value = p.Unit == "kg" ? "كجم" : "قطعة";
                ws.Cell(r, 6).Value = sellPrice;
                ws.Cell(r, 7).Value = costPrice;
                ws.Cell(r, 8).Value = stockQty;
                ws.Cell(r, 9).Value = minStockQty;

                // Dynamic Formulas (shifted left by 1 column)
                ws.Cell(r, 10).FormulaA1 = string.Format("F{0}-G{0}", r);
                ws.Cell(r, 10).Value = unitMargin;

                ws.Cell(r, 11).FormulaA1 = string.Format("IF(G{0}>0, (F{0}-G{0})/G{0}, 0)", r);
                ws.Cell(r, 11).Value = costPrice > 0 ? unitMargin / costPrice : 0.0;

                ws.Cell(r, 12).FormulaA1 = string.Format("H{0}*G{0}", r);
                ws.Cell(r, 12).Value = totalCost;

                ws.Cell(r, 13).FormulaA1 = string.Format("H{0}*F{0}", r);
                ws.Cell(r, 13).Value = totalRetail;

                ws.Cell(r, 14).FormulaA1 = string.Format("M{0}-L{0}", r);
                ws.Cell(r, 14).Value = totalProfit;

                ws.Cell(r, 15).FormulaA1 = string.Format("IF(H{0}<=0, \"نفد من المخزن\", IF(H{0}<=I{0}, \"قارب على النفاد\", \"متوفر بالمخزن\"))", r);
                ws.Cell(r, 15).Value = stockQty <= 0 ? "نفد من المخزن" : (stockQty <= minStockQty ? "قارب على النفاد" : "متوفر بالمخزن");

                ws.Cell(r, 16).Value = p.TaxRatePercent;
                ws.Cell(r, 17).SetValue<string>(p.InternalCode ?? "");
                ws.Cell(r, 18).Value = p.VariantColor ?? "";
                ws.Cell(r, 19).Value = p.VariantSize ?? "";
                ws.Cell(r, 20).SetValue<string>("");

                for (int c = 1; c <= 20; c++)
                {
                    var cell = ws.Cell(r, c);
                    cell.Style.Font.FontSize = 10;
                    cell.Style.Fill.BackgroundColor = rowBg;
                    cell.Style.Border.OutsideBorder = XLBorderStyleValues.Thin;
                    cell.Style.Border.OutsideBorderColor = BorderGray;
                    cell.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
                }

                ws.Cell(r, 1).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                ws.Cell(r, 2).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Right;
                ws.Cell(r, 3).Style.NumberFormat.Format = "@";
                ws.Cell(r, 3).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                ws.Cell(r, 4).Style.NumberFormat.Format = "@";
                ws.Cell(r, 4).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                ws.Cell(r, 5).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;

                ws.Cell(r, 6).Style.NumberFormat.Format = "#,##0.00";
                ws.Cell(r, 6).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                ws.Cell(r, 7).Style.NumberFormat.Format = "#,##0.00";
                ws.Cell(r, 7).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                ws.Cell(r, 8).Style.NumberFormat.Format = "#,##0.###";
                ws.Cell(r, 8).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                ws.Cell(r, 9).Style.NumberFormat.Format = "#,##0.###";
                ws.Cell(r, 9).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;

                ws.Cell(r, 10).Style.NumberFormat.Format = "#,##0.00";
                ws.Cell(r, 10).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                ws.Cell(r, 11).Style.NumberFormat.Format = "0.0%";
                ws.Cell(r, 11).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                ws.Cell(r, 12).Style.NumberFormat.Format = "#,##0.00";
                ws.Cell(r, 12).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                ws.Cell(r, 13).Style.NumberFormat.Format = "#,##0.00";
                ws.Cell(r, 13).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                ws.Cell(r, 14).Style.NumberFormat.Format = "#,##0.00";
                ws.Cell(r, 14).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;

                ws.Cell(r, 15).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                ws.Cell(r, 15).Style.Font.Bold = true;

                ws.Cell(r, 16).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                ws.Cell(r, 17).Style.NumberFormat.Format = "@";
                ws.Cell(r, 17).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                ws.Cell(r, 18).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                ws.Cell(r, 19).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                ws.Cell(r, 20).Style.NumberFormat.Format = "@";
                ws.Cell(r, 20).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
            }

            // Summary Row
            int lastDataRow = count + 3;
            int sumRow = count + 4;
            ws.Row(sumRow).Height = 26;

            ws.Cell(sumRow, 1).Value = "الإجمالي";
            ws.Cell(sumRow, 2).Value = string.Format("إجمالي {0} صنف مسجل", count);
            ws.Range(sumRow, 1, sumRow, 5).Style.Font.Bold = true;
            ws.Range(sumRow, 1, sumRow, 5).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;

            if (count > 0)
            {
                ws.Cell(sumRow, 6).FormulaA1 = string.Format("AVERAGE(F4:F{0})", lastDataRow);
                ws.Cell(sumRow, 6).Style.NumberFormat.Format = "#,##0.00";
                ws.Cell(sumRow, 7).FormulaA1 = string.Format("AVERAGE(G4:G{0})", lastDataRow);
                ws.Cell(sumRow, 7).Style.NumberFormat.Format = "#,##0.00";
                ws.Cell(sumRow, 8).FormulaA1 = string.Format("SUM(H4:H{0})", lastDataRow);
                ws.Cell(sumRow, 8).Style.NumberFormat.Format = "#,##0.##";

                ws.Cell(sumRow, 10).FormulaA1 = string.Format("AVERAGE(J4:J{0})", lastDataRow);
                ws.Cell(sumRow, 10).Style.NumberFormat.Format = "#,##0.00";
                ws.Cell(sumRow, 11).FormulaA1 = string.Format("IF(L{0}>0, N{0}/L{0}, 0)", sumRow);
                ws.Cell(sumRow, 11).Style.NumberFormat.Format = "0.0%";
                ws.Cell(sumRow, 12).FormulaA1 = string.Format("SUM(L4:L{0})", lastDataRow);
                ws.Cell(sumRow, 12).Style.NumberFormat.Format = "#,##0.00";
                ws.Cell(sumRow, 13).FormulaA1 = string.Format("SUM(M4:M{0})", lastDataRow);
                ws.Cell(sumRow, 13).Style.NumberFormat.Format = "#,##0.00";
                ws.Cell(sumRow, 14).FormulaA1 = string.Format("SUM(N4:N{0})", lastDataRow);
                ws.Cell(sumRow, 14).Style.NumberFormat.Format = "#,##0.00";
            }

            ws.Cell(sumRow, 15).Value = "محسوب بالمعادلات";
            ws.Cell(sumRow, 15).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;

            var sumRange = ws.Range(sumRow, 1, sumRow, 20);
            sumRange.Style.Font.Bold = true;
            sumRange.Style.Fill.BackgroundColor = SoftMint;
            sumRange.Style.Border.OutsideBorder = XLBorderStyleValues.Medium;
            sumRange.Style.Border.OutsideBorderColor = EmeraldGreen;

            ws.SheetView.FreezeRows(3);
            ws.Column(1).Width = 6;
            ws.Column(2).Width = 36;
            ws.Column(3).Width = 20;
            ws.Column(4).Width = 24;
            ws.Column(5).Width = 14;
            ws.Column(6).Width = 16;
            ws.Column(7).Width = 16;
            ws.Column(8).Width = 16;
            ws.Column(9).Width = 16;
            ws.Column(10).Width = 18;
            ws.Column(11).Width = 15;
            ws.Column(12).Width = 22;
            ws.Column(13).Width = 22;
            ws.Column(14).Width = 22;
            ws.Column(15).Width = 18;
            ws.Column(16).Width = 14;
            ws.Column(17).Width = 20;
            ws.Column(18).Width = 18;
            ws.Column(19).Width = 18;
            ws.Column(20).Width = 22;
        }

        private static void PopulateSummaryDashboardWorksheet(
            IXLWorksheet ws,
            string catalogTitle,
            List<string> categoryList,
            Dictionary<string, string> categorySheetNames,
            Dictionary<string, int> categoryItemCounts)
        {
            ws.RightToLeft = true;
            ws.ShowGridLines = true;

            ws.Range("A1:I1").Merge();
            var titleCell = ws.Cell("A1");
            titleCell.Value = "رفيق POS - لوحة مؤشرات وملخص أقسام المتجر (" + catalogTitle + ")";
            titleCell.Style.Font.Bold = true;
            titleCell.Style.Font.FontSize = 13;
            titleCell.Style.Font.FontColor = XLColor.White;
            titleCell.Style.Fill.BackgroundColor = ForestDark;
            titleCell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
            titleCell.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
            ws.Row(1).Height = 40;

            ws.Range("A2:I2").Merge();
            var subCell = ws.Cell("A2");
            subCell.Value = string.Format(
                "تاريخ التصدير: {0} | نظام رفيق لإدارة المبيعات والمخازن | إجمالي الأقسام: {1} قسم | تقرير مالي ومخزني شامل بمعادلات إكسل",
                DateTime.Now.ToString("yyyy/MM/dd HH:mm"),
                categoryList != null ? categoryList.Count : 0
            );
            subCell.Style.Font.Bold = true;
            subCell.Style.Font.FontSize = 9.5;
            subCell.Style.Font.FontColor = XLColor.FromArgb(0, 77, 64);
            subCell.Style.Fill.BackgroundColor = SoftMint;
            subCell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
            subCell.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
            ws.Row(2).Height = 26;

            string[] headers = new string[]
            {
                "م",
                "اسم القسم / التصنيف",
                "عدد الأصناف",
                "إجمالي كمية المخزون",
                "إجمالي رأس مال القسم بالتكلفة (ج.م)",
                "إجمالي القيمة البيعية التقديرية (ج.م)",
                "إجمالي الأرباح المتوقعة للقسم (ج.م)",
                "متوسط نسبة الربح (%)",
                "حالة القسم"
            };

            ws.Row(3).Height = 30;
            for (int i = 0; i < headers.Length; i++)
            {
                var cell = ws.Cell(3, i + 1);
                cell.Value = headers[i];
                cell.Style.Font.Bold = true;
                cell.Style.Font.FontColor = XLColor.White;
                cell.Style.Fill.BackgroundColor = EmeraldGreen;
                cell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                cell.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
                cell.Style.Border.OutsideBorder = XLBorderStyleValues.Thin;
                cell.Style.Border.OutsideBorderColor = XLColor.FromArgb(0, 77, 64);
            }

            int catCount = categoryList != null ? categoryList.Count : 0;
            for (int idx = 0; idx < catCount; idx++)
            {
                int sRow = idx + 4;
                string cat = categoryList[idx];
                string sheetName = categorySheetNames != null && categorySheetNames.ContainsKey(cat) ? categorySheetNames[cat] : cat;
                int itemsCount = categoryItemCounts != null && categoryItemCounts.ContainsKey(cat) ? categoryItemCounts[cat] : 0;
                int catLastRow = Math.Max(4, itemsCount + 3);

                ws.Row(sRow).Height = 24;
                bool isZebra = (idx % 2 == 1);
                XLColor bg = isZebra ? ZebraLight : XLColor.White;

                ws.Cell(sRow, 1).Value = idx + 1;
                ws.Cell(sRow, 2).Value = cat;

                ws.Cell(sRow, 3).FormulaA1 = string.Format("COUNTA('{0}'!B4:B{1})", sheetName, catLastRow);
                ws.Cell(sRow, 3).Value = itemsCount;

                ws.Cell(sRow, 4).FormulaA1 = string.Format("SUM('{0}'!I4:I{1})", sheetName, catLastRow);
                ws.Cell(sRow, 5).FormulaA1 = string.Format("SUM('{0}'!M4:M{1})", sheetName, catLastRow);
                ws.Cell(sRow, 6).FormulaA1 = string.Format("SUM('{0}'!N4:N{1})", sheetName, catLastRow);
                ws.Cell(sRow, 7).FormulaA1 = string.Format("F{0}-E{0}", sRow);
                ws.Cell(sRow, 8).FormulaA1 = string.Format("IF(E{0}>0, G{0}/E{0}, 0)", sRow);
                ws.Cell(sRow, 9).FormulaA1 = string.Format("IF(C{0}>0, \"قسم نشط بالمخزن\", \"فارغ\")", sRow);
                ws.Cell(sRow, 9).Value = "قسم نشط بالمخزن";

                for (int c = 1; c <= 9; c++)
                {
                    var cell = ws.Cell(sRow, c);
                    cell.Style.Fill.BackgroundColor = bg;
                    cell.Style.Border.OutsideBorder = XLBorderStyleValues.Thin;
                    cell.Style.Border.OutsideBorderColor = BorderGray;
                    cell.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
                }

                ws.Cell(sRow, 1).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                ws.Cell(sRow, 2).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Right;
                ws.Cell(sRow, 3).Style.NumberFormat.Format = "#,##0";
                ws.Cell(sRow, 3).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                ws.Cell(sRow, 4).Style.NumberFormat.Format = "#,##0.##";
                ws.Cell(sRow, 4).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                ws.Cell(sRow, 5).Style.NumberFormat.Format = "#,##0.00";
                ws.Cell(sRow, 5).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                ws.Cell(sRow, 6).Style.NumberFormat.Format = "#,##0.00";
                ws.Cell(sRow, 6).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                ws.Cell(sRow, 7).Style.NumberFormat.Format = "#,##0.00";
                ws.Cell(sRow, 7).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                ws.Cell(sRow, 8).Style.NumberFormat.Format = "0.0%";
                ws.Cell(sRow, 8).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                ws.Cell(sRow, 9).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                ws.Cell(sRow, 9).Style.Font.Bold = true;
            }

            int lastCatRow = catCount + 3;
            int grandSumRow = catCount + 4;
            ws.Row(grandSumRow).Height = 28;

            ws.Cell(grandSumRow, 1).Value = "الإجمالي العام";
            ws.Cell(grandSumRow, 2).Value = "الإجمالي لكافة أقسام المتجر";
            ws.Range(grandSumRow, 1, grandSumRow, 2).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;

            if (catCount > 0)
            {
                ws.Cell(grandSumRow, 3).FormulaA1 = string.Format("SUM(C4:C{0})", lastCatRow);
                ws.Cell(grandSumRow, 3).Style.NumberFormat.Format = "#,##0";
                ws.Cell(grandSumRow, 4).FormulaA1 = string.Format("SUM(D4:D{0})", lastCatRow);
                ws.Cell(grandSumRow, 4).Style.NumberFormat.Format = "#,##0.##";
                ws.Cell(grandSumRow, 5).FormulaA1 = string.Format("SUM(E4:E{0})", lastCatRow);
                ws.Cell(grandSumRow, 5).Style.NumberFormat.Format = "#,##0.00";
                ws.Cell(grandSumRow, 6).FormulaA1 = string.Format("SUM(F4:F{0})", lastCatRow);
                ws.Cell(grandSumRow, 6).Style.NumberFormat.Format = "#,##0.00";
                ws.Cell(grandSumRow, 7).FormulaA1 = string.Format("SUM(G4:G{0})", lastCatRow);
                ws.Cell(grandSumRow, 7).Style.NumberFormat.Format = "#,##0.00";
                ws.Cell(grandSumRow, 8).FormulaA1 = string.Format("IF(E{0}>0, G{0}/E{0}, 0)", grandSumRow);
                ws.Cell(grandSumRow, 8).Style.NumberFormat.Format = "0.0%";
            }

            ws.Cell(grandSumRow, 9).Value = "متجر متكامل";
            ws.Cell(grandSumRow, 9).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;

            var gRange = ws.Range(grandSumRow, 1, grandSumRow, 9);
            gRange.Style.Font.Bold = true;
            gRange.Style.Fill.BackgroundColor = SoftMint;
            gRange.Style.Border.OutsideBorder = XLBorderStyleValues.Medium;
            gRange.Style.Border.OutsideBorderColor = EmeraldGreen;

            ws.SheetView.FreezeRows(3);
            ws.Column(1).Width = 6;
            ws.Column(2).Width = 28;
            ws.Column(3).Width = 16;
            ws.Column(4).Width = 22;
            ws.Column(5).Width = 28;
            ws.Column(6).Width = 28;
            ws.Column(7).Width = 26;
            ws.Column(8).Width = 20;
            ws.Column(9).Width = 20;
        }

        /// <summary>
        /// توليد قالب استيراد الأصناف بتنسيق رسمي وألوان احترافية مع تابات للأقسام ومعادلات إكسل
        /// </summary>
        public string GenerateProductTemplateBase64()
        {
            using (var wb = new XLWorkbook())
            {
                var groceryProds = new List<Product>()
                {
                    new Product { Name = "شاي العروسة ناعم 250 جم", Barcode = "6223000123456", Barcodes = new List<string> { "6223000123457" }, Unit = "piece", PricePiasters = 3500, CostPiasters = 2850, StockQuantityMilli = 0, MinStockQuantityMilli = 10000, InternalCode = "TEA-AR-250" },
                    new Product { Name = "سكر أبيض فاخر 1 كجم", Barcode = "6223000987654", Unit = "piece", PricePiasters = 2700, CostPiasters = 2200, StockQuantityMilli = 0, MinStockQuantityMilli = 15000, InternalCode = "SGR-01" },
                    new Product { Name = "زيت خليط قلية ممتاز 700 مل", Barcode = "6224000112233", Unit = "piece", PricePiasters = 5500, CostPiasters = 4600, StockQuantityMilli = 0, MinStockQuantityMilli = 8000, InternalCode = "OIL-700" }
                };

                var clothingProds = new List<Product>()
                {
                    new Product { Name = "تيشيرت بولو كاجوال رجالي", Barcode = "6225501100026", Unit = "piece", VariantColor = "كحلي", VariantSize = "L", PricePiasters = 22000, CostPiasters = 14000, StockQuantityMilli = 0, MinStockQuantityMilli = 5000, InternalCode = "POLO-NV-L" },
                    new Product { Name = "حذاء رياضي كوتشي كاجوال", Barcode = "6225504400017", Unit = "piece", VariantColor = "أسود", VariantSize = "42", PricePiasters = 32000, CostPiasters = 20000, StockQuantityMilli = 0, MinStockQuantityMilli = 3000, InternalCode = "SHOE-BK-42" }
                };

                var dairyProds = new List<Product>()
                {
                    new Product { Name = "جبنة بيضاء رومي قديمة بالوزن", Barcode = "200987654321", Unit = "kg", PricePiasters = 32000, CostPiasters = 26000, StockQuantityMilli = 0, MinStockQuantityMilli = 3000, InternalCode = "CHS-ROM-01" },
                    new Product { Name = "حليب كامل الدسم مبستر 1 لتر", Barcode = "6221000123987", Unit = "piece", PricePiasters = 3800, CostPiasters = 3100, StockQuantityMilli = 0, MinStockQuantityMilli = 10000, InternalCode = "MLK-1L" }
                };

                var cleaningProds = new List<Product>()
                {
                    new Product { Name = "صابون سائل بريل بالليمون 1 لتر", Barcode = "6222000554433", Unit = "piece", PricePiasters = 4200, CostPiasters = 3500, StockQuantityMilli = 0, MinStockQuantityMilli = 5000, TaxRatePercent = 14, InternalCode = "CLN-PRL-01" },
                    new Product { Name = "مسحوق غسيل أوتوماتيك أريال 2.5 كجم", Barcode = "6222000889911", Unit = "piece", PricePiasters = 17500, CostPiasters = 14500, StockQuantityMilli = 0, MinStockQuantityMilli = 5000, InternalCode = "DET-ARL-25" }
                };

                // Category Sheets directly: Each department has its own dedicated tab with its items and formulas
                var ws1 = wb.Worksheets.Add("بقالة ومشروبات");
                PopulateStandardProductSheet(ws1, "قسم: بقالة ومشروبات", groceryProds, null, "بقالة ومشروبات");

                var ws2 = wb.Worksheets.Add("ملابس وأحذية");
                PopulateStandardProductSheet(ws2, "قسم: ملابس وأحذية", clothingProds, null, "ملابس وأحذية");

                var ws3 = wb.Worksheets.Add("ألبان وأجبان");
                PopulateStandardProductSheet(ws3, "قسم: ألبان وأجبان", dairyProds, null, "ألبان وأجبان");

                var ws4 = wb.Worksheets.Add("منظفات وعناية");
                PopulateStandardProductSheet(ws4, "قسم: منظفات وعناية", cleaningProds, null, "منظفات وعناية");

                using (var ms = new MemoryStream())
                {
                    wb.SaveAs(ms);
                    return Convert.ToBase64String(ms.ToArray());
                }
            }
        }

        /// <summary>
        /// تصدير كامل أصناف النظام إلى ملف إكسل احترافي مع تابات منفصلة لكل قسم ومعادلات مالية ومخزنية متقدمة
        /// </summary>
        public string ExportProductsBase64(List<Product> products, Dictionary<string, string> categoryNames)
        {
            if (products == null) products = new List<Product>();
            if (categoryNames == null) categoryNames = new Dictionary<string, string>();

            using (var wb = new XLWorkbook())
            {
                var categoryGroups = new Dictionary<string, List<Product>>();
                for (int i = 0; i < products.Count; i++)
                {
                    var p = products[i];
                    string cName = "عام / متنوع";
                    if (!string.IsNullOrEmpty(p.CategoryId) && categoryNames.ContainsKey(p.CategoryId))
                    {
                        cName = categoryNames[p.CategoryId];
                    }
                    cName = cName.Trim();
                    if (!categoryGroups.ContainsKey(cName))
                    {
                        categoryGroups[cName] = new List<Product>();
                    }
                    categoryGroups[cName].Add(p);
                }

                var catList = new List<string>(categoryGroups.Keys);
                var usedSheets = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

                var sheetNameMap = new Dictionary<string, string>();
                for (int i = 0; i < catList.Count; i++)
                {
                    string cat = catList[i];
                    string sName = CleanWorksheetName(cat, usedSheets);
                    sheetNameMap[cat] = sName;
                    usedSheets.Add(sName);
                }

                if (catList.Count == 0)
                {
                    var wsDefault = wb.Worksheets.Add("الأصناف_العامة");
                    PopulateStandardProductSheet(wsDefault, "قائمة الأصناف", products, categoryNames, "الأصناف_العامة");
                }
                else
                {
                    // Dedicated Category Sheets only - each category has its own independent tab
                    for (int i = 0; i < catList.Count; i++)
                    {
                        string cat = catList[i];
                        string sName = sheetNameMap[cat];
                        var wsCat = wb.Worksheets.Add(sName);
                        PopulateStandardProductSheet(wsCat, "قائمة أصناف قسم: [" + cat + "]", categoryGroups[cat], categoryNames, cat);
                    }
                }

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
        /// توليد قالب إكسل فارغ جاهز لتحميل دليل الأدوية المرجعي (Story 134 / Feature #191 / Task 191-4)
        /// </summary>
        public string GenerateDrugReferenceTemplate()
        {
            using (var wb = new XLWorkbook())
            {
                var ws = wb.Worksheets.Add("دليل_الأدوية_المرجعي");
                ws.RightToLeft = true;
                ws.ShowGridLines = true;

                // 1. Title Banner
                ws.Range("A1:S1").Merge();
                var titleCell = ws.Cell("A1");
                titleCell.Value = "رفيق POS - نموذج استيراد دليل الأدوية والمستحضرات المرجعي الصيدلي الشامل";
                titleCell.Style.Font.Bold = true;
                titleCell.Style.Font.FontSize = 13;
                titleCell.Style.Font.FontColor = XLColor.White;
                titleCell.Style.Fill.BackgroundColor = ForestDark;
                titleCell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                titleCell.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
                ws.Row(1).Height = 40;

                // 2. Subtitle / Guidance Banner
                ws.Range("A2:S2").Merge();
                var subCell = ws.Cell("A2");
                subCell.Value = "إرشادات: الباركود والاسم التجاري وسعر الجمهور إلزامية (*) | يدعم طريقة الاستخدام، فئة الحمل، مضاد حيوي، وسلسلة التبريد | عمود الثلاجة والمضاد الحيوي (نعم / لا)";
                subCell.Style.Font.Bold = true;
                subCell.Style.Font.FontSize = 9.5;
                subCell.Style.Font.FontColor = XLColor.FromArgb(0, 77, 64);
                subCell.Style.Fill.BackgroundColor = SoftMint;
                subCell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                subCell.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
                ws.Row(2).Height = 26;

                // 3. Table Headers (All 19 fields matching Pharmacy UI)
                string[] headers = new string[]
                {
                    "باركود الدواء *",
                    "الاسم التجاري *",
                    "الاسم العلمي (المادة الفعالة)",
                    "الشكل الدوائي (Dosage Form)",
                    "التركيز / الحجم",
                    "النكهة / الشكل المتفرع",
                    "الشركة المصنعة (Manufacturer)",
                    "المجموعة العلاجية (Therapeutic)",
                    "قسم وتصنيف الصنف بالمحل",
                    "الرف ومكان التخزين",
                    "سلسلة التبريد / ثلاجة (نعم/لا)",
                    "طريقة الاستخدام (Route)",
                    "فئة الحمل والرضاعة",
                    "مضاد حيوي (نعم/لا)",
                    "نوع الوصفة والصرف (Rx Status)",
                    "وصف العبوة",
                    "عدد الوحدات / الأشرطة بالعلبة",
                    "سعر الجمهور الرسمي (ج.م) *",
                    "مصدر التسعيرة / ملاحظات"
                };

                ws.Row(3).Height = 32;
                for (int i = 0; i < headers.Length; i++)
                {
                    var cell = ws.Cell(3, i + 1);
                    cell.Value = headers[i];
                    cell.Style.Font.Bold = true;
                    cell.Style.Font.FontSize = 10;
                    cell.Style.Font.FontColor = XLColor.White;
                    cell.Style.Fill.BackgroundColor = EmeraldGreen;
                    cell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                    cell.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
                    cell.Style.Border.OutsideBorder = XLBorderStyleValues.Thin;
                    cell.Style.Border.OutsideBorderColor = XLColor.FromArgb(0, 77, 64);
                }

                // 4. Sample Rows (Matching realistic Egyptian pharmacy products)
                object[][] sampleData = new object[][]
                {
                    new object[] { "6221001001011", "بانادول إكسترا أقراص", "Paracetamol + Caffeine", "أقراص", "500mg/65mg", "أقراص", "GlaxoSmithKline (GSK)", "مسكنات وخافضات حرارة ومضادات التهاب", "أدوية ومسكنات شائعة وفيتامينات", "رف A1 - مسكنات", "لا", "فموي (Oral)", "فئة B (آمن إلى حد كبير)", "لا", "صرف مباشر (OTC)", "علبة 2 شريط - 24 قرص", 2, 48.00, "تسعيرة جبرية رسمية" },
                    new object[] { "6221001001028", "بانادول أدفانس أقراص", "Paracetamol", "أقراص", "500mg", "أقراص مغلفة", "GlaxoSmithKline (GSK)", "مسكنات وخافضات حرارة ومضادات التهاب", "أدوية ومسكنات شائعة وفيتامينات", "رف A1 - مسكنات", "لا", "فموي (Oral)", "فئة B (آمن إلى حد كبير)", "لا", "صرف مباشر (OTC)", "علبة 2 شريط - 24 قرص", 2, 36.00, "تسعيرة رسمية 2026" },
                    new object[] { "6222002002022", "كونجستال أقراص", "Paracetamol + Pseudoephedrine + Chlorpheniramine", "أقراص", "650mg/60mg/4mg", "أقراص", "SIGMA Pharmaceuticals", "أدوية الجهاز التنفسي وموسعات الشعب والسعال", "أدوية ومسكنات شائعة وفيتامينات", "رف B2 - برد وكحة", "لا", "فموي (Oral)", "فئة C (بحذر وإشراف طبي)", "لا", "صرف مباشر (OTC)", "علبة 2 شريط - 20 قرص", 2, 39.00, "نشرة أسعار الموزع 2026" },
                    new object[] { "6223003003033", "أوجمنتين 1 جم أقراص", "Amoxicillin + Clavulanic Acid", "أقراص مغلفة", "1000mg", "أقراص مغلفة", "Medical Union Pharmaceuticals (MUP)", "مضادات حيوية ومضادات بكتيرية", "أدوية ومسكنات شائعة وفيتامينات", "رف C3 - مضادات حيوية", "لا", "فموي (Oral)", "فئة B (آمن إلى حد كبير)", "نعم", "روشتة طبية (Rx)", "علبة 2 شريط - 14 قرص", 2, 131.00, "تسعيرة وزارة الصحة" },
                    new object[] { "6224004004044", "أنسولين ميكستارد 100 وحدة قلم", "Human Insulin 30/70", "حقن", "100 IU/ml", "فيال / قلم", "Novo Nordisk", "أدوية السكري ومنظمات السكر", "أدوية ومسكنات شائعة وفيتامينات", "ثلاجة الأنسولين رف 1", "نعم", "حقن عضل / وريد (Parenteral)", "فئة B (آمن إلى حد كبير)", "لا", "روشتة طبية (Rx)", "فيال 10 مل", 1, 165.00, "سلسلة تبريد مبردة" }
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
                        cell.Style.Font.FontSize = 9.5;
                        cell.Style.Fill.BackgroundColor = rowBg;
                        cell.Style.Border.OutsideBorder = XLBorderStyleValues.Thin;
                        cell.Style.Border.OutsideBorderColor = BorderGray;
                        cell.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;

                        if (c == 0) // Barcode
                        {
                            cell.Style.NumberFormat.Format = "@";
                            cell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                        }
                        else if (c == 10 || c == 13) // Refrigerated or Antibiotic (نعم/لا)
                        {
                            cell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                            if (sampleData[r][c].ToString() == "نعم")
                            {
                                cell.Style.Font.Bold = true;
                                cell.Style.Font.FontColor = XLColor.FromArgb(0, 109, 65);
                            }
                        }
                        else if (c == 16) // Pieces Per Pack
                        {
                            cell.Value = Convert.ToInt32(sampleData[r][c]);
                            cell.Style.NumberFormat.Format = "#,##0";
                            cell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                        }
                        else if (c == 17) // Price
                        {
                            cell.Value = Convert.ToDouble(sampleData[r][c]);
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
                ws.Column(1).Width = 20; // Barcode
                ws.Column(2).Width = 28; // Trade Name
                ws.Column(3).Width = 30; // Scientific Name
                ws.Column(4).Width = 16; // Form
                ws.Column(5).Width = 16; // Strength
                ws.Column(6).Width = 16; // Flavor/Form
                ws.Column(7).Width = 26; // Manufacturer
                ws.Column(8).Width = 28; // Therapeutic Class
                ws.Column(9).Width = 22; // Category
                ws.Column(10).Width = 20; // Shelf Location
                ws.Column(11).Width = 16; // Refrigerated
                ws.Column(12).Width = 18; // Route
                ws.Column(13).Width = 18; // Pregnancy
                ws.Column(14).Width = 16; // Antibiotic
                ws.Column(15).Width = 18; // Rx Status
                ws.Column(16).Width = 22; // Pack Desc
                ws.Column(17).Width = 16; // Pieces Per Pack
                ws.Column(18).Width = 18; // Public Price
                ws.Column(19).Width = 24; // Notes

                using (var ms = new MemoryStream())
                {
                    wb.SaveAs(ms);
                    return Convert.ToBase64String(ms.ToArray());
                }
            }
        }

        /// <summary>
        /// قراءة ومعاينة ملف إكسل لاستيراد دليل الأدوية المرجعي والتحقق من صحة البيانات (Story 134 / Feature #191 / Task 191-4)
        /// </summary>
        public DrugReferenceImportPreviewResult ParseDrugReferenceImportBase64(string base64, DrugReferenceRepository drugRefRepo)
        {
            var result = new DrugReferenceImportPreviewResult();
            if (string.IsNullOrWhiteSpace(base64)) return result;

            if (base64.Contains(","))
            {
                base64 = base64.Substring(base64.IndexOf(",") + 1);
            }
            base64 = base64.Trim().Replace(" ", "").Replace("\r", "").Replace("\n", "");
            int mod4 = base64.Length % 4;
            if (mod4 > 0)
            {
                base64 += new string('=', 4 - mod4);
            }

            byte[] bytes = Convert.FromBase64String(base64);
            using (var ms = new MemoryStream(bytes))
            using (var wb = new XLWorkbook(ms))
            {
                var ws = wb.Worksheets.Count > 0 ? wb.Worksheet(1) : null;
                if (ws == null) return result;

                // Find header row (skip title and guidance banners, search for row with barcode + trade name headers)
                int headerRow = 3;
                for (int r = 1; r <= 10; r++)
                {
                    string c1 = ws.Cell(r, 1).GetString().Trim();
                    string c2 = ws.Cell(r, 2).GetString().Trim();
                    if (c1.Contains("إرشادات") || c1.Contains("نموذج") || c1.Contains("دليل الأدوية") || c1.Contains("دليل"))
                    {
                        continue;
                    }
                    if ((c1.Contains("باركود") || c1.Contains("كود") || string.Equals(c1, "Barcode", StringComparison.OrdinalIgnoreCase)) &&
                        (c2.Contains("الاسم") || c2.Contains("الدواء") || c2.Contains("الصنف") || string.Equals(c2, "Name", StringComparison.OrdinalIgnoreCase)))
                    {
                        headerRow = r;
                        break;
                    }
                }

                // Detect column mapping based on header texts to be resilient
                int colBarcode = 1;
                int colTrade = 2;
                int colSci = 3;
                int colForm = 4;
                int colStrength = 5;
                int colFlavorForm = 0;
                int colMfg = 7;
                int colTherapeutic = 0;
                int colCategory = 0;
                int colStorageLoc = 0;
                int colRefrigerated = 0;
                int colRoute = 0;
                int colPregnancy = 0;
                int colAntibiotic = 0;
                int colRxStatus = 0;
                int colPack = 0;
                int colPiecesPerPack = 0;
                int colPrice = 0;
                int colNotes = 0;

                int lastCol = ws.LastColumnUsed() != null ? ws.LastColumnUsed().ColumnNumber() : 19;
                for (int c = 1; c <= lastCol; c++)
                {
                    string h = ws.Cell(headerRow, c).GetString().Trim();
                    if (string.IsNullOrEmpty(h)) continue;
                    if (h.Contains("باركود") || string.Equals(h, "barcode", StringComparison.OrdinalIgnoreCase)) colBarcode = c;
                    else if (h.Contains("الاسم التجاري") || (h.Contains("الاسم") && !h.Contains("العلمي"))) colTrade = c;
                    else if (h.Contains("العلمي") || h.Contains("الفعالة") || string.Equals(h, "generic", StringComparison.OrdinalIgnoreCase)) colSci = c;
                    else if (h.Contains("الشكل الدوائي") || (h.Contains("الشكل") && !h.Contains("المتفرع")) || string.Equals(h, "dosage", StringComparison.OrdinalIgnoreCase) || string.Equals(h, "form", StringComparison.OrdinalIgnoreCase)) colForm = c;
                    else if (h.Contains("التركيز") || string.Equals(h, "strength", StringComparison.OrdinalIgnoreCase)) colStrength = c;
                    else if (h.Contains("النكهة") || h.Contains("المتفرع") || string.Equals(h, "flavor", StringComparison.OrdinalIgnoreCase) || string.Equals(h, "flavour", StringComparison.OrdinalIgnoreCase)) colFlavorForm = c;
                    else if (h.Contains("المصنعة") || h.Contains("الشركة") || string.Equals(h, "manufacturer", StringComparison.OrdinalIgnoreCase) || string.Equals(h, "company", StringComparison.OrdinalIgnoreCase)) colMfg = c;
                    else if (h.Contains("المجموعة") || h.Contains("العلاجية") || string.Equals(h, "therapeutic", StringComparison.OrdinalIgnoreCase)) colTherapeutic = c;
                    else if (h.Contains("قسم") || (h.Contains("تصنيف") && !h.Contains("الدليل")) || string.Equals(h, "category", StringComparison.OrdinalIgnoreCase)) colCategory = c;
                    else if (h.Contains("الرف") || h.Contains("تخزين") || string.Equals(h, "shelf", StringComparison.OrdinalIgnoreCase) || string.Equals(h, "location", StringComparison.OrdinalIgnoreCase)) colStorageLoc = c;
                    else if (h.Contains("تبريد") || h.Contains("ثلاجة") || string.Equals(h, "refrigerated", StringComparison.OrdinalIgnoreCase) || string.Equals(h, "fridge", StringComparison.OrdinalIgnoreCase)) colRefrigerated = c;
                    else if (h.Contains("طريقة الاستخدام") || (h.Contains("طريقة") && !h.Contains("البيع")) || string.Equals(h, "route", StringComparison.OrdinalIgnoreCase)) colRoute = c;
                    else if (h.Contains("الحمل") || h.Contains("الرضاعة") || string.Equals(h, "pregnancy", StringComparison.OrdinalIgnoreCase)) colPregnancy = c;
                    else if (h.Contains("مضاد حيوي") || string.Equals(h, "antibiotic", StringComparison.OrdinalIgnoreCase)) colAntibiotic = c;
                    else if (h.Contains("نوع الوصفة") || h.Contains("الصرف") || string.Equals(h, "rx", StringComparison.OrdinalIgnoreCase)) colRxStatus = c;
                    else if (h.Contains("عدد الوحدات") || h.Contains("الأشرطة") || string.Equals(h, "units", StringComparison.OrdinalIgnoreCase) || string.Equals(h, "pieces", StringComparison.OrdinalIgnoreCase)) colPiecesPerPack = c;
                    else if (h.Contains("العبوة") || string.Equals(h, "pack", StringComparison.OrdinalIgnoreCase)) colPack = c;
                    else if (h.Contains("سعر") || string.Equals(h, "price", StringComparison.OrdinalIgnoreCase)) colPrice = c;
                    else if (h.Contains("ملاحظات") || h.Contains("مصدر") || string.Equals(h, "notes", StringComparison.OrdinalIgnoreCase)) colNotes = c;
                }

                // Defaults if headers weren't named exactly:
                if (colPrice == 0)
                {
                    if (lastCol >= 18)
                    {
                        colFlavorForm = 6;
                        colMfg = 7;
                        colTherapeutic = 8;
                        colCategory = 9;
                        colStorageLoc = 10;
                        colRefrigerated = 11;
                        colRoute = 12;
                        colPregnancy = 13;
                        colAntibiotic = 14;
                        colRxStatus = 15;
                        colPack = 16;
                        colPiecesPerPack = 17;
                        colPrice = 18;
                        colNotes = 19;
                    }
                    else if (lastCol >= 12)
                    {
                        colMfg = 6;
                        colTherapeutic = 7;
                        colCategory = 8;
                        colStorageLoc = 9;
                        colRefrigerated = 10;
                        colPack = 11;
                        colPrice = 12;
                        colNotes = 13;
                    }
                    else
                    {
                        // Legacy 9-column template
                        colMfg = 6;
                        colPack = 7;
                        colPrice = 8;
                        colNotes = 9;
                    }
                }

                int lastRow = ws.LastRowUsed() != null ? ws.LastRowUsed().RowNumber() : 0;
                var seenBarcodesInFile = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                var existingDbBarcodes = drugRefRepo != null 
                    ? drugRefRepo.GetAllBarcodes() 
                    : new HashSet<string>(StringComparer.OrdinalIgnoreCase);

                for (int r = headerRow + 1; r <= lastRow; r++)
                {
                    var rowObj = ws.Row(r);
                    string barcode = colBarcode > 0 ? rowObj.Cell(colBarcode).GetString().Trim() : "";
                    string tradeName = colTrade > 0 ? rowObj.Cell(colTrade).GetString().Trim() : "";
                    string priceRaw = colPrice > 0 ? rowObj.Cell(colPrice).GetString().Trim() : "";

                    // Skip completely empty rows early
                    if (string.IsNullOrWhiteSpace(barcode) && string.IsNullOrWhiteSpace(tradeName) && string.IsNullOrWhiteSpace(priceRaw))
                    {
                        continue;
                    }

                    // Skip accidental header rows or guidance rows
                    if (barcode.Contains("باركود") || tradeName.Contains("الاسم التجاري") || tradeName.Contains("اسم الصنف") || string.Equals(barcode, "Barcode", StringComparison.OrdinalIgnoreCase))
                    {
                        continue;
                    }

                    string scientificName = colSci > 0 ? rowObj.Cell(colSci).GetString().Trim() : "";
                    string form = colForm > 0 ? rowObj.Cell(colForm).GetString().Trim() : "";
                    string strength = colStrength > 0 ? rowObj.Cell(colStrength).GetString().Trim() : "";
                    string flavorForm = colFlavorForm > 0 ? rowObj.Cell(colFlavorForm).GetString().Trim() : "";
                    string manufacturer = colMfg > 0 ? rowObj.Cell(colMfg).GetString().Trim() : "";
                    string therapeuticClass = colTherapeutic > 0 ? rowObj.Cell(colTherapeutic).GetString().Trim() : "";
                    string category = colCategory > 0 ? rowObj.Cell(colCategory).GetString().Trim() : "";
                    string storageLocation = colStorageLoc > 0 ? rowObj.Cell(colStorageLoc).GetString().Trim() : "";
                    string refrigRaw = colRefrigerated > 0 ? rowObj.Cell(colRefrigerated).GetString().Trim() : "";
                    string routeRaw = colRoute > 0 ? rowObj.Cell(colRoute).GetString().Trim() : "";
                    string pregnancyRaw = colPregnancy > 0 ? rowObj.Cell(colPregnancy).GetString().Trim() : "";
                    string antibioticRaw = colAntibiotic > 0 ? rowObj.Cell(colAntibiotic).GetString().Trim() : "";
                    string rxStatusRaw = colRxStatus > 0 ? rowObj.Cell(colRxStatus).GetString().Trim() : "";
                    string packDesc = colPack > 0 ? rowObj.Cell(colPack).GetString().Trim() : "";
                    string piecesRaw = colPiecesPerPack > 0 ? rowObj.Cell(colPiecesPerPack).GetString().Trim() : "";
                    string notes = colNotes > 0 ? rowObj.Cell(colNotes).GetString().Trim() : "";

                    bool isRefrigerated = false;
                    if (!string.IsNullOrWhiteSpace(refrigRaw))
                    {
                        string cleanRefrig = refrigRaw.Trim().ToLowerInvariant();
                        if (cleanRefrig == "نعم" || cleanRefrig == "yes" || cleanRefrig == "1" || cleanRefrig == "true" || cleanRefrig.Contains("ثلاجة"))
                        {
                            isRefrigerated = true;
                        }
                    }

                    bool isAntibiotic = false;
                    if (!string.IsNullOrWhiteSpace(antibioticRaw))
                    {
                        string cleanAnti = antibioticRaw.Trim().ToLowerInvariant();
                        if (cleanAnti == "نعم" || cleanAnti == "yes" || cleanAnti == "1" || cleanAnti == "true" || cleanAnti.Contains("مضاد"))
                        {
                            isAntibiotic = true;
                        }
                    }

                    string route = null;
                    if (!string.IsNullOrWhiteSpace(routeRaw))
                    {
                        string lowerRoute = routeRaw.Trim().ToLowerInvariant();
                        if (lowerRoute.Contains("oral") || lowerRoute.Contains("فم")) route = "oral";
                        else if (lowerRoute.Contains("topical") || lowerRoute.Contains("موضع") || lowerRoute.Contains("كريم") || lowerRoute.Contains("مرهم") || lowerRoute.Contains("جل")) route = "topical";
                        else if (lowerRoute.Contains("parenteral") || lowerRoute.Contains("inject") || lowerRoute.Contains("حقن") || lowerRoute.Contains("عضل") || lowerRoute.Contains("وريد")) route = "parenteral";
                        else if (lowerRoute.Contains("drop") || lowerRoute.Contains("قطر") || lowerRoute.Contains("عين") || lowerRoute.Contains("أذن")) route = "ophthalmic";
                        else if (lowerRoute.Contains("inhal") || lowerRoute.Contains("استنشاق") || lowerRoute.Contains("بخاخ")) route = "inhalation";
                        else if (lowerRoute.Contains("rectal") || lowerRoute.Contains("لبوس") || lowerRoute.Contains("شرج") || lowerRoute.Contains("تحاميل")) route = "rectal";
                        else route = routeRaw.Trim();
                    }

                    string pregnancyCategory = null;
                    if (!string.IsNullOrWhiteSpace(pregnancyRaw))
                    {
                        string upperPreg = pregnancyRaw.Trim().ToUpperInvariant();
                        if (upperPreg.Contains("A") || upperPreg.Contains("أ")) pregnancyCategory = "A";
                        else if (upperPreg.Contains("B") || upperPreg.Contains("ب")) pregnancyCategory = "B";
                        else if (upperPreg.Contains("C") || upperPreg.Contains("ج")) pregnancyCategory = "C";
                        else if (upperPreg.Contains("D") || upperPreg.Contains("د")) pregnancyCategory = "D";
                        else if (upperPreg.Contains("X")) pregnancyCategory = "X";
                        else pregnancyCategory = "";
                    }

                    string rxStatus = null;
                    if (!string.IsNullOrWhiteSpace(rxStatusRaw))
                    {
                        string lowerRx = rxStatusRaw.Trim().ToLowerInvariant();
                        if (lowerRx.Contains("control") || lowerRx.Contains("جدول") || lowerRx.Contains("مخدر") || lowerRx.Contains("مهدئ")) rxStatus = "controlled";
                        else if (lowerRx.Contains("rx") || lowerRx.Contains("روشتة") || lowerRx.Contains("وصفة")) rxStatus = "rx";
                        else rxStatus = "otc";
                    }

                    int? piecesPerPack = null;
                    if (!string.IsNullOrWhiteSpace(piecesRaw))
                    {
                        int pNum;
                        if (int.TryParse(piecesRaw.Replace("قرص", "").Replace("شريط", "").Trim(), out pNum) && pNum > 0)
                        {
                            piecesPerPack = pNum;
                        }
                    }

                    var row = new DrugReferenceImportRow
                    {
                        RowNumber = r,
                        Barcode = barcode,
                        TradeName = tradeName,
                        ScientificName = string.IsNullOrWhiteSpace(scientificName) ? null : scientificName,
                        Form = string.IsNullOrWhiteSpace(form) ? null : form,
                        Strength = string.IsNullOrWhiteSpace(strength) ? null : strength,
                        FlavorForm = string.IsNullOrWhiteSpace(flavorForm) ? null : flavorForm,
                        Manufacturer = string.IsNullOrWhiteSpace(manufacturer) ? null : manufacturer,
                        TherapeuticClass = string.IsNullOrWhiteSpace(therapeuticClass) ? null : therapeuticClass,
                        Category = string.IsNullOrWhiteSpace(category) ? null : category,
                        StorageLocation = string.IsNullOrWhiteSpace(storageLocation) ? null : storageLocation,
                        IsRefrigerated = isRefrigerated,
                        Route = route,
                        PregnancyCategory = pregnancyCategory,
                        IsAntibiotic = isAntibiotic,
                        RxStatus = rxStatus,
                        PiecesPerPack = piecesPerPack,
                        PackDesc = string.IsNullOrWhiteSpace(packDesc) ? null : packDesc,
                        Reason = notes
                    };

                    result.TotalRows++;

                    // Validation 1: Barcode is required
                    if (string.IsNullOrWhiteSpace(barcode))
                    {
                        row.Status = "ERROR";
                        row.Reason = "كود الباركود مطلوب ولا يمكن تركه فارغاً";
                        result.ErrorRowsCount++;
                        result.Rows.Add(row);
                        continue;
                    }

                    // Validation 2: Trade Name is required
                    if (string.IsNullOrWhiteSpace(tradeName))
                    {
                        row.Status = "ERROR";
                        row.Reason = "الاسم التجاري للدواء مطلوب";
                        result.ErrorRowsCount++;
                        result.Rows.Add(row);
                        continue;
                    }

                    // Validation 3: Duplicate barcode within same file
                    if (seenBarcodesInFile.Contains(barcode))
                    {
                        row.Status = "ERROR";
                        row.Reason = "كود الباركود مكرر داخل نفس ملف الإكسل (صف سابق)";
                        result.ErrorRowsCount++;
                        result.Rows.Add(row);
                        continue;
                    }
                    seenBarcodesInFile.Add(barcode);

                    // Validation 4: Price parsing (in EGP -> Piasters)
                    long? pricePiasters = null;
                    if (!string.IsNullOrWhiteSpace(priceRaw))
                    {
                        string cleanPrice = priceRaw.Replace("ج.م", "").Replace("EGP", "").Replace(",", "").Trim();
                        decimal decVal;
                        if (decimal.TryParse(cleanPrice, System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out decVal))
                        {
                            if (decVal < 0)
                            {
                                row.Status = "ERROR";
                                row.Reason = "سعر الجمهور لا يمكن أن يكون سالباً";
                                result.ErrorRowsCount++;
                                result.Rows.Add(row);
                                continue;
                            }
                            pricePiasters = (long)Math.Round(decVal * 100m);
                        }
                        else
                        {
                            row.Status = "ERROR";
                            row.Reason = "سعر الجمهور غير صحيح (يجب أن يكون رقماً بالجنيه)";
                            result.ErrorRowsCount++;
                            result.Rows.Add(row);
                            continue;
                        }
                    }
                    row.PublicPricePiasters = pricePiasters;

                    // Validation 5: Check database existence
                    bool existsInDb = existingDbBarcodes != null && existingDbBarcodes.Contains(barcode);

                    if (existsInDb)
                    {
                        row.Status = "UPDATE";
                        row.Reason = "صنف مسجل مسبقاً بالدليل المرجعي وسيتم تحديث بياناته وسعره";
                        result.UpdateRowsCount++;
                    }
                    else
                    {
                        row.Status = "NEW";
                        row.Reason = "صنف دوائي جديد سيتم إضافته للدليل المرجعي";
                        result.NewRowsCount++;
                    }

                    result.Rows.Add(row);
                }
            }

            return result;
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

                // Preload existing customer phones into memory once to eliminate N+1 database queries on large files
                var existingDbPhones = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                if (customerRepo != null)
                {
                    var existingCusts = customerRepo.GetAll(100000);
                    if (existingCusts != null)
                    {
                        for (int i = 0; i < existingCusts.Count; i++)
                        {
                            var ec = existingCusts[i];
                            if (!string.IsNullOrEmpty(ec.Phone))
                            {
                                string clnP = ec.Phone.Replace(" ", "").Replace("-", "").Trim();
                                if (!existingDbPhones.ContainsKey(clnP))
                                {
                                    existingDbPhones[clnP] = ec.Name ?? "";
                                }
                            }
                        }
                    }
                }

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

                        // Check DB duplicate via preloaded in-memory dictionary
                        string existingCustName;
                        if (existingDbPhones.TryGetValue(row.Phone, out existingCustName))
                        {
                            row.IsPhoneDuplicateInDb = true;
                            row.Errors.Add(string.Format("رقم الهاتف مسجل مسبقاً للعميل «{0}»", existingCustName));
                            row.IsValid = false;
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
                    decimal qty = products[i].StockQuantityMilli / 1000m;
                    res.TotalStockCostPiasters += (long)Math.Round(qty * products[i].CostPiasters, 0, MidpointRounding.AwayFromZero);
                    res.TotalStockRetailPiasters += (long)Math.Round(qty * products[i].PricePiasters, 0, MidpointRounding.AwayFromZero);
                }

                // File 1: Products & Stock
                string prodFile = Path.Combine(targetFolder, "01_المنتجات_والمخزون.xlsx");
                using (var wb = new XLWorkbook())
                {
                    var ws = wb.Worksheets.Add("المنتجات_والمخزون");
                    PopulateProductsWorksheet(ws, products, categoryDict, shopName);

                    // Group products by category and append category worksheets
                    var catGroups = new Dictionary<string, List<Product>>();
                    for (int pIdx = 0; pIdx < products.Count; pIdx++)
                    {
                        var p = products[pIdx];
                        string cName = "عام";
                        if (!string.IsNullOrEmpty(p.CategoryId) && categoryDict.ContainsKey(p.CategoryId))
                        {
                            cName = categoryDict[p.CategoryId];
                        }
                        if (!catGroups.ContainsKey(cName))
                        {
                            catGroups[cName] = new List<Product>();
                        }
                        catGroups[cName].Add(p);
                    }

                    var usedCatNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                    usedCatNames.Add("المنتجات_والمخزون");

                    foreach (var kvp in catGroups)
                    {
                        string safeSheetName = CleanWorksheetName(kvp.Key, usedCatNames);
                        usedCatNames.Add(safeSheetName);
                        var catWs = wb.Worksheets.Add(safeSheetName);
                        PopulateStandardProductSheet(catWs, string.Format("قسم: {0} - {1}", kvp.Key, shopName), kvp.Value, categoryDict, kvp.Key);
                    }

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
                ws.Cell(r, 2).SetValue<string>(p.InternalCode ?? "");
                ws.Cell(r, 2).Style.NumberFormat.Format = "@";
                ws.Cell(r, 3).Value = p.Name ?? "";
                ws.Cell(r, 4).SetValue<string>(p.Barcode ?? "");
                ws.Cell(r, 4).Style.NumberFormat.Format = "@";
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
                ws.Cell(r, 11).FormulaA1 = string.Format("I{0}*G{0}", r);
                ws.Cell(r, 11).Style.NumberFormat.Format = "#,##0.00";
                ws.Cell(r, 12).Value = retailRow;
                ws.Cell(r, 12).FormulaA1 = string.Format("I{0}*H{0}", r);
                ws.Cell(r, 12).Style.NumberFormat.Format = "#,##0.00";
                ws.Cell(r, 13).Value = p.TaxRatePercent;
                ws.Cell(r, 14).Value = status;
                ws.Cell(r, 14).FormulaA1 = string.Format("IF(I{0}<=0, \"نفد من المخزن\", IF(I{0}<=J{0}, \"قارب على النفاد\", \"متوفر\"))", r);

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
            if (products.Count > 0)
            {
                ws.Cell(sumRow, 9).FormulaA1 = string.Format("SUM(I4:I{0})", sumRow - 1);
            }
            ws.Cell(sumRow, 9).Style.NumberFormat.Format = "#,##0.##";
            ws.Cell(sumRow, 9).Style.Font.Bold = true;
            ws.Cell(sumRow, 11).Value = totalCostVal;
            if (products.Count > 0)
            {
                ws.Cell(sumRow, 11).FormulaA1 = string.Format("SUM(K4:K{0})", sumRow - 1);
            }
            ws.Cell(sumRow, 11).Style.NumberFormat.Format = "#,##0.00";
            ws.Cell(sumRow, 11).Style.Font.Bold = true;
            ws.Cell(sumRow, 12).Value = totalRetailVal;
            if (products.Count > 0)
            {
                ws.Cell(sumRow, 12).FormulaA1 = string.Format("SUM(L4:L{0})", sumRow - 1);
            }
            ws.Cell(sumRow, 12).Style.NumberFormat.Format = "#,##0.00";
            ws.Cell(sumRow, 12).Style.Font.Bold = true;
            ws.Range(sumRow, 1, sumRow, 14).Style.Fill.BackgroundColor = SoftMint;

            ws.Column(1).Width = 6;
            ws.Column(2).Width = 18;
            ws.Column(3).Width = 34;
            ws.Column(4).Width = 20;
            ws.Column(5).Width = 20;
            ws.Column(6).Width = 14;
            ws.Column(7).Width = 16;
            ws.Column(8).Width = 16;
            ws.Column(9).Width = 16;
            ws.Column(10).Width = 14;
            ws.Column(11).Width = 22;
            ws.Column(12).Width = 22;
            ws.Column(13).Width = 16;
            ws.Column(14).Width = 18;
        }

        private static void PopulateCustomersWorksheet(IXLWorksheet ws, List<Customer> customers, string shopName)
        {
            ws.RightToLeft = true;
            ws.ShowGridLines = true;

            ws.Range("A1:G1").Merge();
            var tCell = ws.Cell("A1");
            tCell.Value = string.Format("سجل العملاء وحسابات الديون - {0}", shopName);
            tCell.Style.Font.Bold = true;
            tCell.Style.Font.FontSize = 13;
            tCell.Style.Font.FontColor = XLColor.White;
            tCell.Style.Fill.BackgroundColor = ForestDark;
            tCell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
            tCell.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
            ws.Row(1).Height = 36;

            ws.Range("A2:G2").Merge();
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
                ws.Cell(r, 3).SetValue<string>(c.Phone ?? "");
                ws.Cell(r, 3).Style.NumberFormat.Format = "@";
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

            ws.Column(1).Width = 8;
            ws.Column(2).Width = 32;
            ws.Column(3).Width = 20;
            ws.Column(4).Width = 24;
            ws.Column(5).Width = 24;
            ws.Column(6).Width = 20;
            ws.Column(7).Width = 26;
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
                ws.Cell(r, 4).SetValue<string>(s.Phone ?? "");
                ws.Cell(r, 4).Style.NumberFormat.Format = "@";
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

            ws.Column(1).Width = 8;
            ws.Column(2).Width = 28;
            ws.Column(3).Width = 26;
            ws.Column(4).Width = 20;
            ws.Column(5).Width = 28;
            ws.Column(6).Width = 24;
            ws.Column(7).Width = 16;
            ws.Column(8).Width = 30;
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
                ws.Cell(r, 2).SetValue<string>("#" + s.InvoiceNumber);
                ws.Cell(r, 2).Style.NumberFormat.Format = "@";
                ws.Cell(r, 3).Value = s.CreatedAt ?? "";
                ws.Cell(r, 4).Value = s.CustomerName ?? "عميل نقدي";
                ws.Cell(r, 5).SetValue<string>(s.CustomerPhone ?? "");
                ws.Cell(r, 5).Style.NumberFormat.Format = "@";
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

            ws.Column(1).Width = 6;
            ws.Column(2).Width = 16;
            ws.Column(3).Width = 22;
            ws.Column(4).Width = 24;
            ws.Column(5).Width = 20;
            ws.Column(6).Width = 20;
            ws.Column(7).Width = 16;
            ws.Column(8).Width = 16;
            ws.Column(9).Width = 20;
            ws.Column(10).Width = 18;
            ws.Column(11).Width = 18;
            ws.Column(12).Width = 16;
            ws.Column(13).Width = 16;
            ws.Column(14).Width = 28;
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
                ws.Cell(r, 4).SetValue<string>(m.ProductBarcode ?? "");
                ws.Cell(r, 4).Style.NumberFormat.Format = "@";
                ws.Cell(r, 5).Value = !string.IsNullOrEmpty(m.MovementTypeArabic) ? m.MovementTypeArabic : (m.MovementType ?? "");
                ws.Cell(r, 6).Value = qty;
                ws.Cell(r, 6).Style.NumberFormat.Format = "#,##0.##";
                ws.Cell(r, 7).Value = cost;
                ws.Cell(r, 7).Style.NumberFormat.Format = "#,##0.00";
                ws.Cell(r, 8).SetValue<string>(m.ReferenceId ?? "");
                ws.Cell(r, 8).Style.NumberFormat.Format = "@";
                ws.Cell(r, 9).Value = m.Note ?? "";

                if (i % 2 == 1) ws.Range(r, 1, r, 9).Style.Fill.BackgroundColor = ZebraLight;
            }

            ws.Column(1).Width = 6;
            ws.Column(2).Width = 22;
            ws.Column(3).Width = 32;
            ws.Column(4).Width = 22;
            ws.Column(5).Width = 20;
            ws.Column(6).Width = 16;
            ws.Column(7).Width = 18;
            ws.Column(8).Width = 22;
            ws.Column(9).Width = 30;
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
                ws.Cell(r, 2).SetValue<string>("#" + c.ClosingNumber);
                ws.Cell(r, 2).Style.NumberFormat.Format = "@";
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

            ws.Column(1).Width = 6;
            ws.Column(2).Width = 16;
            ws.Column(3).Width = 18;
            ws.Column(4).Width = 22;
            ws.Column(5).Width = 24;
            ws.Column(6).Width = 20;
            ws.Column(7).Width = 18;
            ws.Column(8).Width = 18;
            ws.Column(9).Width = 18;
            ws.Column(10).Width = 18;
            ws.Column(11).Width = 16;
        }
    }
}
