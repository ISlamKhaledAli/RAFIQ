using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Printing;
using System.Drawing.Text;
using Newtonsoft.Json;
using RafiqPOS.Common;
using RafiqPOS.Models;

namespace RafiqPOS.Services
{
    public partial class PrinterService
    {
        public KotRoutingConfig GetKotRoutingConfig()
        {
            var cfg = new KotRoutingConfig
            {
                KitchenPrinterName = _settings != null ? _settings.Get("kot_kitchen_printer", "") : "",
                BarPrinterName = _settings != null ? _settings.Get("kot_bar_printer", "") : "",
                AutoPrintOnSale = _settings != null && _settings.Get("kot_auto_print_on_sale", "true") == "true",
                PaperWidth = _settings != null ? _settings.Get("kot_paper_width", "80mm") : "80mm",
                CategoryRoutes = new List<CategoryKotRoute>()
            };

            try
            {
                if (DatabaseService.CategoryRepo != null)
                {
                    var cats = DatabaseService.CategoryRepo.GetAll(true);
                    if (cats != null)
                    {
                        for (int i = 0; i < cats.Count; i++)
                        {
                            cfg.CategoryRoutes.Add(new CategoryKotRoute
                            {
                                CategoryId = cats[i].Id,
                                CategoryName = cats[i].Name,
                                KotStation = string.IsNullOrWhiteSpace(cats[i].KotStation) ? "kitchen" : cats[i].KotStation
                            });
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Logger.Warn("تعذر تحميل توجيه أقسام المطبخ KOT: " + ex.Message);
            }

            return cfg;
        }

        public KotRoutingConfig SaveKotRoutingConfig(KotRoutingConfig config)
        {
            if (config == null) throw new ArgumentException("بيانات توجيه طابعات المطبخ فارغة.");

            if (_settings != null)
            {
                _settings.Set("kot_kitchen_printer", config.KitchenPrinterName ?? "");
                _settings.Set("kot_bar_printer", config.BarPrinterName ?? "");
                _settings.Set("kot_auto_print_on_sale", config.AutoPrintOnSale ? "true" : "false");
                _settings.Set("kot_paper_width", string.IsNullOrWhiteSpace(config.PaperWidth) ? "80mm" : config.PaperWidth);
            }

            if (config.CategoryRoutes != null && !string.IsNullOrEmpty(DatabaseService.ConnectionString))
            {
                using (var conn = new System.Data.SQLite.SQLiteConnection(DatabaseService.ConnectionString))
                {
                    conn.Open();
                    using (var tx = conn.BeginTransaction())
                    {
                        try
                        {
                            for (int i = 0; i < config.CategoryRoutes.Count; i++)
                            {
                                var route = config.CategoryRoutes[i];
                                if (route == null || string.IsNullOrWhiteSpace(route.CategoryId)) continue;
                                string station = string.IsNullOrWhiteSpace(route.KotStation) ? "kitchen" : route.KotStation.Trim().ToLowerInvariant();
                                if (station != "kitchen" && station != "bar" && station != "both" && station != "none")
                                {
                                    station = "kitchen";
                                }
                                using (var cmd = conn.CreateCommand())
                                {
                                    cmd.Transaction = tx;
                                    cmd.CommandText = "UPDATE categories SET kot_station = @st WHERE id = @id;";
                                    cmd.Parameters.AddWithValue("@st", station);
                                    cmd.Parameters.AddWithValue("@id", route.CategoryId);
                                    cmd.ExecuteNonQuery();
                                }
                            }
                            tx.Commit();
                        }
                        catch
                        {
                            tx.Rollback();
                            throw;
                        }
                    }
                }
            }

            return GetKotRoutingConfig();
        }

        /// <summary>
        /// طباعة تذكرة تحضير المطبخ أو البار (KOT - Kitchen Order Ticket) بخط عريض وبدون أسعار
        /// مع توجيه الأصناف تلقائياً إلى طابعة المطبخ وطابعة البار حسب إعدادات الأقسام
        /// </summary>
        public PrintResult PrintKitchenOrderTicket(KotPrintRequest req)
        {
            if (req == null || req.Items == null || req.Items.Count == 0)
            {
                return new PrintResult { Success = false, Message = "لا توجد أصناف لإرسالها إلى طابعة المطبخ أو البار." };
            }

            var cfg = GetKotRoutingConfig();
            var catStationMap = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            if (cfg.CategoryRoutes != null)
            {
                for (int i = 0; i < cfg.CategoryRoutes.Count; i++)
                {
                    catStationMap[cfg.CategoryRoutes[i].CategoryId] = cfg.CategoryRoutes[i].KotStation ?? "kitchen";
                }
            }

            // Group items by station ("kitchen" vs "bar")
            var stationGroups = new Dictionary<string, List<KotItemDto>>(StringComparer.OrdinalIgnoreCase);
            for (int i = 0; i < req.Items.Count; i++)
            {
                var item = req.Items[i];
                if (item == null || item.QuantityMilli <= 0) continue;

                string st = !string.IsNullOrWhiteSpace(item.KotStation) ? item.KotStation.Trim().ToLowerInvariant() : "";
                if (string.IsNullOrWhiteSpace(st) && !string.IsNullOrWhiteSpace(item.ProductId) && DatabaseService.ProductRepo != null)
                {
                    try
                    {
                        var prod = DatabaseService.ProductRepo.GetById(item.ProductId);
                        if (prod != null && !string.IsNullOrWhiteSpace(prod.CategoryId) && catStationMap.ContainsKey(prod.CategoryId))
                        {
                            st = catStationMap[prod.CategoryId];
                        }
                    }
                    catch { }
                }

                if (string.IsNullOrWhiteSpace(st)) st = "kitchen";
                if (st == "none") continue;

                if (!stationGroups.ContainsKey(st))
                {
                    stationGroups[st] = new List<KotItemDto>();
                }
                stationGroups[st].Add(item);
            }

            if (stationGroups.Count == 0)
            {
                return new PrintResult { Success = true, Message = "الأصناف المحددة لا تتطلب طباعة مطبخ/بار (Station = none)." };
            }

            string paperWidth = !string.IsNullOrWhiteSpace(cfg.PaperWidth) ? cfg.PaperWidth : GetConfiguredPaperWidth();
            int contentWidth = GetContentWidthPoints(paperWidth);

            var printedStations = new List<string>();
            string lastError = null;
            string lastPrinterUsed = "";

            foreach (var kvp in stationGroups)
            {
                string stationKey = kvp.Key;
                List<KotItemDto> stationItems = kvp.Value;

                string targetPrinter = req.PrinterName;
                if (string.IsNullOrWhiteSpace(targetPrinter))
                {
                    if (string.Equals(stationKey, "bar", StringComparison.OrdinalIgnoreCase))
                    {
                        targetPrinter = !string.IsNullOrWhiteSpace(cfg.BarPrinterName) ? cfg.BarPrinterName : cfg.KitchenPrinterName;
                    }
                    else
                    {
                        targetPrinter = cfg.KitchenPrinterName;
                    }
                }
                if (string.IsNullOrWhiteSpace(targetPrinter))
                {
                    targetPrinter = ResolvePrinterName(null);
                }

                lastPrinterUsed = targetPrinter;
                string stationTitle = string.Equals(stationKey, "bar", StringComparison.OrdinalIgnoreCase)
                    ? "تذكرة تحضير البار (BAR KOT)"
                    : "تذكرة تحضير المطبخ (KITCHEN KOT)";

                PrintResult res = PrintSingleStationKot(req, stationTitle, stationItems, targetPrinter, paperWidth, contentWidth);
                if (res.Success)
                {
                    printedStations.Add(string.Equals(stationKey, "bar", StringComparison.OrdinalIgnoreCase) ? "البار" : "المطبخ");
                }
                else
                {
                    lastError = res.Message;
                }
            }

            if (printedStations.Count > 0)
            {
                return new PrintResult
                {
                    Success = true,
                    Message = "تم إرسال تذكرة التحضير (KOT) بنجاح إلى: " + string.Join(" + ", printedStations.ToArray()),
                    PrinterUsed = lastPrinterUsed
                };
            }

            return new PrintResult
            {
                Success = false,
                Message = lastError ?? "تعذر طباعة تذكرة المطبخ KOT.",
                PrinterUsed = lastPrinterUsed
            };
        }

        private PrintResult PrintSingleStationKot(
            KotPrintRequest req,
            string stationTitle,
            List<KotItemDto> items,
            string targetPrinter,
            string paperWidth,
            int contentWidth)
        {
            if (RawPrinterHelper.IsNetworkPrinter(targetPrinter))
            {
                try
                {
                    using (var measureBmp = new Bitmap(contentWidth, 100))
                    using (var mg = Graphics.FromImage(measureBmp))
                    {
                        float totalH = RenderKotPage(mg, req, stationTitle, items, contentWidth);
                        int bmpH = Math.Max(160, (int)Math.Ceiling(totalH) + 24);
                        using (var bmp = new Bitmap(contentWidth, bmpH))
                        using (var g = Graphics.FromImage(bmp))
                        {
                            g.TextRenderingHint = TextRenderingHint.SingleBitPerPixelGridFit;
                            g.SmoothingMode = SmoothingMode.None;
                            RenderKotPage(g, req, stationTitle, items, contentWidth);
                            byte[] escpos = RawPrinterHelper.ConvertBitmapToEscPosRaster(bmp, false, true);
                            string err;
                            bool ok = RawPrinterHelper.SendRawBytes(targetPrinter, escpos, "Rafiq KOT Ticket", out err);
                            return new PrintResult
                            {
                                Success = ok,
                                Message = ok ? "تمت طباعة تذكرة التحضير شبكياً." : ("فشل طباعة KOT على الشبكة: " + err),
                                PrinterUsed = targetPrinter
                            };
                        }
                    }
                }
                catch (Exception ex)
                {
                    return new PrintResult { Success = false, Message = "خطأ في طباعة KOT الشبكية: " + ex.Message, PrinterUsed = targetPrinter };
                }
            }

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
                            Message = string.Format("طابعة المطبخ/البار '{0}' غير متصلة أو غير معرفة في النظام.", targetPrinter),
                            PrinterUsed = targetPrinter
                        };
                    }

                    doc.DocumentName = stationTitle;
                    doc.PrintController = new StandardPrintController();
                    doc.PrintPage += delegate(object sender, PrintPageEventArgs e)
                    {
                        e.Graphics.TextRenderingHint = TextRenderingHint.SingleBitPerPixelGridFit;
                        e.Graphics.SmoothingMode = SmoothingMode.None;
                        RenderKotPage(e.Graphics, req, stationTitle, items, contentWidth);
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
                    Message = "تمت طباعة تذكرة المطبخ/البار بنجاح.",
                    PrinterUsed = targetPrinter
                };
            }
            catch (Exception ex)
            {
                Logger.Warn("تعذر طباعة تذكرة المطبخ KOT: " + ex.Message);
                return new PrintResult
                {
                    Success = false,
                    Message = "تعذر إرسال تذكرة التحضير للطابعة: " + ex.Message,
                    PrinterUsed = targetPrinter
                };
            }
        }

        private float RenderKotPage(
            Graphics g,
            KotPrintRequest req,
            string stationTitle,
            List<KotItemDto> items,
            int contentWidth)
        {
            g.Clear(Color.White);
            bool isCompact = (contentWidth <= 210);
            string fontName = "Arial";
            using (var testFont = new Font("Cairo", 10f))
            {
                if (testFont.Name == "Cairo") fontName = "Cairo";
            }

            using (var fontBanner = new Font(fontName, isCompact ? 11f : 13f, FontStyle.Bold))
            using (var fontCall = new Font(fontName, isCompact ? 13f : 15f, FontStyle.Bold))
            using (var fontItem = new Font(fontName, isCompact ? 10.5f : 12f, FontStyle.Bold))
            using (var fontMod = new Font(fontName, isCompact ? 9f : 10f, FontStyle.Bold))
            using (var fontMeta = new Font(fontName, isCompact ? 8f : 9f, FontStyle.Regular))
            using (var penSolid = new Pen(Color.Black, 2f))
            using (var penDashed = new Pen(Color.Black, 1f) { DashStyle = DashStyle.Dash })
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

                float y = 8f;

                g.DrawString(stationTitle, fontBanner, Brushes.Black, new RectangleF(4, y, contentWidth - 8, 22), centerFormat);
                y += 23f;

                if (req.IsSupplement)
                {
                    g.DrawLine(penSolid, 4, y, contentWidth - 4, y);
                    y += 3f;
                    g.DrawString("*** طلب إضافي / تعديل على الطاولة ***", fontMod, Brushes.Black, new RectangleF(4, y, contentWidth - 8, 19), centerFormat);
                    y += 20f;
                }

                g.DrawLine(penSolid, 4, y, contentWidth - 4, y);
                y += 4f;

                string modeStr = "تيك أواي (سفري)";
                if (string.Equals(req.OrderType, "dine_in", StringComparison.OrdinalIgnoreCase) || !string.IsNullOrWhiteSpace(req.TableName))
                {
                    modeStr = !string.IsNullOrWhiteSpace(req.TableName) ? ("طاولة: " + req.TableName) : "صالة (Dine-In)";
                }
                else if (string.Equals(req.OrderType, "delivery", StringComparison.OrdinalIgnoreCase))
                {
                    modeStr = "دليفري (توصيل)";
                }

                if (req.OrderCallNumber > 0)
                {
                    g.DrawString(string.Format("نداء #{0:D3} - {1}", req.OrderCallNumber, modeStr), fontCall, Brushes.Black, new RectangleF(4, y, contentWidth - 8, 25), centerFormat);
                    y += 26f;
                }
                else
                {
                    g.DrawString(modeStr, fontCall, Brushes.Black, new RectangleF(4, y, contentWidth - 8, 24), centerFormat);
                    y += 25f;
                }

                string timeNow = DateTime.Now.ToString("yyyy/MM/dd HH:mm:ss");
                string waiterMeta = "الوقت: " + timeNow;
                if (!string.IsNullOrWhiteSpace(req.WaiterName)) waiterMeta += " | الكابتن: " + req.WaiterName;
                else if (!string.IsNullOrWhiteSpace(req.CashierName)) waiterMeta += " | الكاشير: " + req.CashierName;
                if (req.GuestsCount > 0) waiterMeta += " | ضيوف: " + req.GuestsCount.ToString();

                g.DrawString(waiterMeta, fontMeta, Brushes.Black, new RectangleF(4, y, contentWidth - 8, 16), centerFormat);
                y += 18f;

                g.DrawLine(penSolid, 4, y, contentWidth - 4, y);
                y += 5f;

                // Header
                g.DrawString("الصنف المطلوب تحضيره", fontMod, Brushes.Black, new RectangleF(65, y, contentWidth - 70, 18), rtlFormat);
                g.DrawString("الكمية", fontMod, Brushes.Black, new RectangleF(5, y, 58, 18), leftFormat);
                y += 19f;
                g.DrawLine(penDashed, 4, y, contentWidth - 4, y);
                y += 5f;

                for (int i = 0; i < items.Count; i++)
                {
                    var item = items[i];
                    if (item == null) continue;

                    string qtyText = (item.QuantityMilli % 1000 == 0)
                        ? (item.QuantityMilli / 1000).ToString() + " ×"
                        : (item.QuantityMilli / 1000.0).ToString("0.##") + " ×";

                    g.DrawString(item.ProductName ?? "صنف", fontItem, Brushes.Black, new RectangleF(62, y, contentWidth - 68, 22), rtlFormat);
                    g.DrawString(qtyText, fontItem, Brushes.Black, new RectangleF(6, y, 54, 22), leftFormat);
                    y += 23f;

                    if (item.Modifiers != null && item.Modifiers.Count > 0)
                    {
                        for (int m = 0; m < item.Modifiers.Count; m++)
                        {
                            var mod = item.Modifiers[m];
                            if (mod == null || string.IsNullOrWhiteSpace(mod.OptionName)) continue;
                            g.DrawString("   + إضافة: " + mod.OptionName, fontMod, Brushes.Black, new RectangleF(8, y, contentWidth - 16, 18), rtlFormat);
                            y += 18f;
                        }
                    }

                    if (!string.IsNullOrWhiteSpace(item.Notes))
                    {
                        g.DrawString("   * ملاحظة: " + item.Notes, fontMod, Brushes.Black, new RectangleF(8, y, contentWidth - 16, 18), rtlFormat);
                        y += 18f;
                    }

                    g.DrawLine(penDashed, 6, y + 2, contentWidth - 6, y + 2);
                    y += 6f;
                }

                if (!string.IsNullOrWhiteSpace(req.Notes))
                {
                    y += 2f;
                    g.DrawString("ملاحظات عامة للطلب: " + req.Notes, fontMod, Brushes.Black, new RectangleF(6, y, contentWidth - 12, 20), rtlFormat);
                    y += 22f;
                }

                g.DrawLine(penSolid, 4, y, contentWidth - 4, y);
                y += 10f;
                return y;
            }
        }

        /// <summary>
        /// طباعة شيك حساب مبدئي للطاولة (Pre-Bill Check) لمراجعة العميل قبل السداد دون إغلاق الطاولة أو فتح الدرج
        /// </summary>
        public PrintResult PrintTablePreBill(string tableId)
        {
            if (string.IsNullOrWhiteSpace(tableId))
            {
                return new PrintResult { Success = false, Message = "معرف الطاولة مطلوب لطباعة الشيك المبدئي." };
            }

            if (DatabaseService.TableRepo == null)
            {
                return new PrintResult { Success = false, Message = "خدمة إدارة الطاولات غير مهيأة." };
            }

            var table = DatabaseService.TableRepo.GetById(tableId);
            if (table == null || (string.IsNullOrWhiteSpace(table.ActiveHeldSaleId) && string.IsNullOrWhiteSpace(table.CartJson)))
            {
                return new PrintResult { Success = false, Message = "لا يوجد طلب مفتوح على هذه الطاولة حالياً." };
            }

            string cartJson = table.CartJson;
            if (string.IsNullOrWhiteSpace(cartJson))
            {
                return new PrintResult { Success = false, Message = "سلة الطاولة فارغة." };
            }

            // Update table status to bill_printed so floor map highlights it
            if (DatabaseService.Tables != null && table.Status == "occupied")
            {
                try
                {
                    DatabaseService.Tables.SetTableStatus(table.Id, "bill_printed");
                }
                catch { }
            }

            var items = new List<SaleItem>();
            long subtotal = 0;
            try
            {
                var parsed = JsonConvert.DeserializeObject<List<SaleItem>>(cartJson);
                if (parsed != null)
                {
                    for (int i = 0; i < parsed.Count; i++)
                    {
                        var it = parsed[i];
                        if (it == null) continue;
                        if (it.QuantityMilli <= 0) it.QuantityMilli = 1000;
                        long lineTot = it.TotalPiasters > 0
                            ? it.TotalPiasters
                            : (long)Math.Round((double)it.UnitPricePiasters * it.QuantityMilli / 1000.0, MidpointRounding.AwayFromZero);
                        it.TotalPiasters = lineTot;
                        subtotal += lineTot;
                        items.Add(it);
                    }
                }
            }
            catch { }

            long total = table.CurrentTotalPiasters > 0 ? table.CurrentTotalPiasters : subtotal;

            var preBillSale = new Sale
            {
                Id = "PRE-BILL",
                InvoiceNumber = 0,
                OrderType = "dine_in",
                TableId = table.Id,
                TableName = table.Name + (!string.IsNullOrWhiteSpace(table.ZoneName) ? (" (" + table.ZoneName + ")") : ""),
                GuestsCount = table.GuestsCount > 0 ? table.GuestsCount : 1,
                WaiterName = table.WaiterName ?? "",
                CustomerName = "",
                SubtotalPiasters = subtotal,
                DiscountPiasters = 0,
                ServiceChargePiasters = Math.Max(0, total - subtotal),
                TotalPiasters = total,
                PaidPiasters = 0,
                PaymentMethod = "cash",
                Notes = "*** شيك حساب مبدئي للمراجعة (غير مدفوع) ***",
                CreatedAt = DateTime.UtcNow.ToString("o"),
                Items = items
            };

            return PrintSaleReceipt(preBillSale, null, null, false, false);
        }
    }
}
