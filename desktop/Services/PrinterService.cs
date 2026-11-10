using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Printing;
using System.Drawing.Text;
using System.Globalization;
using System.IO;
using System.Text;
using RafiqPOS.Common;
using RafiqPOS.Models;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

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
        // رمز ثابت للواجهة عند فشل معروف السبب (مثل PRINTER_NOT_FOUND)، وفارغ للأعطال العامة
        public string ErrorCode { get; set; }
    }

    public class PrinterStatusInfo
    {
        // true عند وجود طابعة فعلية واحدة على الأقل (طابعات الملفات الافتراضية في ويندوز لا تُحسب)
        public bool HasPrinter { get; set; }
        public int PrinterCount { get; set; }
        public string DefaultPrinter { get; set; }
        public string ConfiguredPrinter { get; set; }
        public bool ConfiguredFound { get; set; }
    }

    public class RecoveryVoucherRequest
    {
        public string RecoveryCode { get; set; }
        public string StoreName { get; set; }
        public string Phone { get; set; }
        public string StationName { get; set; }
        public string IssueDate { get; set; }
        public string PaperWidth { get; set; }
        public string PrinterName { get; set; }
    }

    /// <summary>
    /// محرك الطباعة الحرارية وأوامر ESC/POS لنظام رفيق POS
    /// يدعم طابعات الإيصالات USB والشبكية (80mm و 57mm) مع طباعة الحروف العربية والشعار
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
                    // الأمر يخزن النبضة بوحدات 2 مللي ثانية، فالرقم الفردي يعمل مثل الزوجي الأصغر منه: نعتمد الزوجي صراحة
                    return ms - (ms % 2);
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
        /// طباعة صفحة اختبار عربية للتأكد من عمل الطابعة وجودة الحروف والشعار (فاتورة تجريبية موسومة، لا تُسجل ولا تُرقم)
        /// </summary>
        public PrintResult PrintTestReceipt(string printerName = null, string paperWidth = null)
        {
            try
            {
                string selectedPrinter = ResolvePrinterName(printerName);
                PrintResult missingTestPrinter = CheckPrinterAvailable(selectedPrinter, "");
                if (missingTestPrinter != null)
                {
                    return missingTestPrinter;
                }
                string selectedWidth = paperWidth ?? GetConfiguredPaperWidth();

                var testSale = new Sale
                {
                    Id = "test_sale_receipt",
                    InvoiceNumber = 0,
                    Status = "TEST_PILOT",
                    CreatedAt = DateTime.UtcNow.ToString("o"),
                    CashierName = "كاشير تجريبي",
                    PaymentMethod = "cash",
                    SubtotalPiasters = 12500,
                    DiscountPiasters = 1000,
                    TaxPiasters = 1412,
                    TotalPiasters = 11500,
                    PaidPiasters = 15000,
                    ChangePiasters = 3500,
                    Notes = "فاتورة تجريبية - ليست فاتورة حقيقية. لاختبار جودة الطباعة والحروف العربية",
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
        /// ونبضة فتح الدرج وقص الورق التلقائي
        /// </summary>
        public PrintResult PrintSaleReceipt(Sale sale, string printerName = null, string paperWidth = null, bool? openDrawer = null, bool isCopy = false)
        {
            if (sale == null)
            {
                return new PrintResult { Success = false, Message = "بيانات الفاتورة فارغة" };
            }

            string validationError;
            if (!TryValidateSaleForPrint(sale, out validationError))
            {
                return new PrintResult { Success = false, Message = validationError };
            }

            string targetPrinter = ResolvePrinterName(printerName);
            PrintResult missingPrinter = CheckPrinterAvailable(targetPrinter, string.Format("الفاتورة رقم #{0} محفوظة بأمان ويمكن حفظ الإيصال كصورة.", sale.InvoiceNumber));
            if (missingPrinter != null)
            {
                return missingPrinter;
            }
            string targetWidth = paperWidth ?? GetConfiguredPaperWidth();
            bool isCompact = IsCompactPaper(targetWidth);

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

            ReceiptRenderJob job = null;
            try
            {
                job = CreateSaleReceiptJob(sale, targetWidth, isCopy);

                // للطابعات الحرارية المحلية (USB / Spooler): نستخدم ESC/POS Raster المباشر لمنع أي هدر في الورق
                if (isThermal)
                {
                    try
                    {
                        byte[] escposBytes = BuildReceiptEscPos(job, shouldOpenDrawer, autoCut);
                        string errMsg;
                        string docTitle = string.Format("Rafiq Receipt #{0}", sale.InvoiceNumber);
                        if (RawPrinterHelper.SendRawBytes(targetPrinter, escposBytes, docTitle, out errMsg))
                        {
                            RecordSaleReceiptPrinted(sale, isCopy, targetPrinter, false);

                            return new PrintResult
                            {
                                Success = true,
                                Message = string.Format("تم إرسال {0} للفاتورة #{1} إلى الطابعة '{2}' بنجاح.", isCopy ? "نسخة طبق الأصل" : "الإيصال", sale.InvoiceNumber, targetPrinter),
                                PrinterUsed = targetPrinter
                            };
                        }

                        Logger.Warn(string.Format("فشل الإرسال المباشر ESC/POS للطابعة '{0}': {1}، جاري المحاولة عبر Windows PrintDocument.", targetPrinter, errMsg));
                    }
                    catch (Exception exRaster)
                    {
                        Logger.Warn("استثناء أثناء طباعة ESC/POS Raster: " + exRaster.Message);
                    }
                }

                // مسار ويندوز (PrintDocument): صفحة بمقاس ورق صريح وارتفاع محسوب من المحتوى وهوامش صفرية
                string gdiError;
                string docName = string.Format(isCopy ? "إيصال رفيق (نسخة) - فاتورة #{0}" : "إيصال رفيق - فاتورة #{0}", sale.InvoiceNumber);
                if (!PrintReceiptJobViaGdi(job, targetPrinter, docName, isCompact, out gdiError))
                {
                    return new PrintResult
                    {
                        Success = false,
                        Message = string.Format("{0} الفاتورة رقم #{1} محفوظة بأمان في قاعدة البيانات.", gdiError, sale.InvoiceNumber),
                        PrinterUsed = targetPrinter
                    };
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

                RecordSaleReceiptPrinted(sale, isCopy, targetPrinter, false);

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
            finally
            {
                if (job != null) job.Dispose();
            }
        }

        public const string ReceiptPrintedAuditAction = "RECEIPT_PRINTED";
        public const string SaleReprintAuditAction = "sale_reprint";
        public const string ReturnReprintAuditAction = "return_reprint";

        /// <summary>
        /// فحص صلاحية الفاتورة للطباعة: لا طباعة لإيصال فارغ أو بقيم سالبة
        /// </summary>
        public static bool TryValidateSaleForPrint(Sale sale, out string error)
        {
            error = null;
            if (sale == null)
            {
                error = "بيانات الفاتورة فارغة";
                return false;
            }
            if (sale.Items == null || sale.Items.Count == 0)
            {
                error = "الفاتورة لا تحتوي على أي أصناف ولا يمكن طباعة إيصال فارغ.";
                return false;
            }
            for (int i = 0; i < sale.Items.Count; i++)
            {
                SaleItem item = sale.Items[i];
                if (item == null || item.QuantityMilli <= 0 || item.UnitPricePiasters < 0 || item.DiscountPiasters < 0 || item.TotalPiasters < 0)
                {
                    error = "بيانات أصناف الفاتورة غير صالحة (كمية أو سعر أو خصم غير صحيح) ولا يمكن طباعتها.";
                    return false;
                }
            }
            if (sale.SubtotalPiasters < 0 || sale.DiscountPiasters < 0 || sale.TotalPiasters < 0 || sale.PaidPiasters < 0
                || sale.ChangePiasters < 0 || sale.ServiceChargePiasters < 0 || sale.DeliveryFeePiasters < 0 || sale.TaxPiasters < 0)
            {
                error = "إجماليات الفاتورة غير صالحة (قيم سالبة) ولا يمكن طباعتها.";
                return false;
            }
            return true;
        }

        /// <summary>
        /// اسم الصنف كما يُطبع: سطر واحد نظيف. المسافات والأسطر والتبويبات تصير مسافة واحدة، ويُحذف ما لا يملك خط الإيصال رمزاً له فيُطبع مربعاً
        /// (الإيموجي والرموز خارج المستوى الأساسي، والرموز الزخرفية، والأحرف الصفرية العرض، وعلامات قلب الاتجاه). توأم cleanReceiptItemName في receiptLayout.ts.
        /// </summary>
        public static string CleanReceiptItemName(string name)
        {
            if (string.IsNullOrEmpty(name)) return "";
            var sb = new StringBuilder(name.Length);
            bool pendingSpace = false;
            for (int i = 0; i < name.Length; i++)
            {
                char c = name[i];
                if (char.IsWhiteSpace(c) || char.IsControl(c))
                {
                    pendingSpace = sb.Length > 0;
                    continue;
                }
                if (c == '\u200B' || c == '\uFEFF' || c == '\uFE0F' ||
                    (c >= '\u202A' && c <= '\u202E') || (c >= '\u2066' && c <= '\u2069') ||
                    (c >= '\u2600' && c <= '\u27BF') || (c >= '\u2B00' && c <= '\u2BFF') ||
                    char.IsSurrogate(c))
                {
                    continue;
                }
                if (pendingSpace)
                {
                    sb.Append(' ');
                    pendingSpace = false;
                }
                sb.Append(c);
            }
            return sb.ToString();
        }

        private static string ReceiptItemNameOrDefault(string name)
        {
            string cleaned = CleanReceiptItemName(name);
            return cleaned.Length == 0 ? "صنف" : cleaned;
        }

        /// <summary>الشيك المبدئي وفواتير التدريب لا تُسجل كإيصال أصلي ولا تُعد نسخاً</summary>
        public static bool IsTransientReceiptSale(Sale sale)
        {
            if (sale == null) return false;
            return string.Equals(sale.Id, PreBillSaleId, StringComparison.Ordinal)
                || string.Equals(sale.Status, "TEST_PILOT", StringComparison.OrdinalIgnoreCase);
        }

        /// <summary>المستخدم الحالي هو صاحب العملية؛ كاشير الفاتورة فقط عند غياب الجلسة</summary>
        public static void ResolveAuditActor(string fallbackUserId, out string userId, out string userName)
        {
            UserDto current = SecurityService.CurrentUser;
            if (current != null && !string.IsNullOrWhiteSpace(current.Id))
            {
                userId = current.Id;
                userName = current.Username ?? "";
                return;
            }
            userId = !string.IsNullOrEmpty(fallbackUserId) ? fallbackUserId : "usr_admin_default";
            userName = "";
        }

        /// <summary>هل طُبع إيصال هذه الفاتورة من قبل (أصل أو نسخة)؟ عند تعذر قراءة السجل تُعامل كمطبوعة سابقاً</summary>
        public bool HasSaleReceiptBeenPrinted(string saleId)
        {
            return HasPrintMarker("sale", saleId, SaleReprintAuditAction);
        }

        private bool HasPrintMarker(string entityType, string entityId, string copyAction)
        {
            if (string.IsNullOrWhiteSpace(entityId) || string.Equals(entityId, PreBillSaleId, StringComparison.Ordinal)) return false;
            if (DatabaseService.Audit == null) return false;
            try
            {
                string[] actions = new string[] { ReceiptPrintedAuditAction, copyAction };
                for (int a = 0; a < actions.Length; a++)
                {
                    List<AuditLog> logs = DatabaseService.Audit.GetLogs(1000, actions[a], null, null, null, entityId);
                    for (int i = 0; i < logs.Count; i++)
                    {
                        if (string.Equals(logs[i].EntityType, entityType, StringComparison.Ordinal)
                            && string.Equals(logs[i].EntityId, entityId, StringComparison.Ordinal))
                        {
                            return true;
                        }
                    }
                }
                return false;
            }
            catch (Exception ex)
            {
                Logger.Warn("تعذر قراءة سجل طباعة الإيصال، سيُعامل الإيصال كنسخة: " + ex.Message);
                return true;
            }
        }

        private void RecordSaleReceiptPrinted(Sale sale, bool isCopy, string printerUsed, bool isNetwork)
        {
            if (sale == null || IsTransientReceiptSale(sale)) return;
            RecordPrintAudit("sale", sale.Id, isCopy, SaleReprintAuditAction, sale.InvoiceNumber, printerUsed, isNetwork, sale.CashierId);
        }

        /// <summary>
        /// توثيق طباعة إيصال في سجل التدقيق: RECEIPT_PRINTED للأصل (وهو علامة أن أي طباعة تالية نسخة) أو إجراء النسخة (لا يُفشل الطباعة أبداً)
        /// </summary>
        private void RecordPrintAudit(string entityType, string entityId, bool isCopy, string copyAction, int documentNumber, string printerUsed, bool isNetwork, string fallbackUserId)
        {
            if (string.IsNullOrWhiteSpace(entityId) || DatabaseService.Audit == null) return;
            try
            {
                string userId;
                string userName;
                ResolveAuditActor(fallbackUserId, out userId, out userName);

                var details = new JObject();
                details["number"] = documentNumber;
                details["isCopy"] = isCopy;
                details["printer"] = printerUsed ?? "";
                if (isNetwork) details["networkPrinter"] = printerUsed ?? "";
                details["username"] = userName;
                details["timestamp"] = DateTime.UtcNow.ToString("o");

                DatabaseService.Audit.Log(
                    userId: userId,
                    action: isCopy ? copyAction : ReceiptPrintedAuditAction,
                    entityType: entityType,
                    entityId: entityId,
                    detailsJson: details.ToString(Formatting.None)
                );
            }
            catch (Exception exAudit)
            {
                Logger.Warn("تعذر تسجيل طباعة الإيصال في سجل التدقيق: " + exAudit.Message);
            }
        }

        private PrintResult PrintSaleReceiptToNetwork(Sale sale, string networkTarget, string paperWidth, bool shouldOpenDrawer, bool isCopy)
        {
            try
            {
                using (var job = CreateSaleReceiptJob(sale, paperWidth, isCopy))
                {
                    bool autoCut = GetConfiguredAutoCut();
                    byte[] escposBytes = BuildReceiptEscPos(job, shouldOpenDrawer, autoCut);

                    string errMsg;
                    string docTitle = string.Format("Rafiq Network Receipt #{0}", sale.InvoiceNumber);
                    bool ok = RawPrinterHelper.SendRawBytes(networkTarget, escposBytes, docTitle, out errMsg);

                    if (ok)
                    {
                        RecordSaleReceiptPrinted(sale, isCopy, networkTarget, true);

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
            using (var job = CreateSaleReceiptJob(sale, targetWidth, isCopy))
            {
                return RenderReceiptBand(job, 0, job.PixelHeight);
            }
        }

        private ReceiptRenderJob CreateSaleReceiptJob(Sale sale, string paperWidth, bool isCopy)
        {
            ReceiptStoreInfo store = LoadReceiptStoreInfo();
            Image logo = TryLoadStoreLogo();
            return CreateReceiptJob(
                delegate(Graphics g, int width) { return RenderReceiptPage(g, sale, store, logo, width, isCopy); },
                GetContentWidthPoints(paperWidth),
                logo);
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

        // =====================================================================
        // محرك رسم الإيصال: قياس ثم رسم - الارتفاع يُحسب دائماً من المحتوى الفعلي (بدون حد ثابت للأصناف)
        // =====================================================================

        private const int MaxReceiptBitmapRows = 8192;   // أقصى ارتفاع لصورة واحدة قبل التقسيم إلى شرائح
        private const int ReceiptBandRows = 4096;        // ارتفاع الشريحة عند تقسيم الإيصالات الطويلة جداً (بدون اقتطاع)
        private const int ReceiptGdiPageRows = 12000;    // أقصى ارتفاع صفحة في مسار طباعة ويندوز (203 DPI)
        private const string GeneralCashCustomerId = "cust_general_cash";
        private const string PreBillSaleId = "PRE-BILL";
        private const string DefaultReceiptThanks = "شكراً لزيارتكم";

        // نصوص الخاتمة الافتراضية القديمة (لم يعدّلها المالك) تُرحَّل إلى الشكر الافتراضي، أما الخاتمة الفارغة فلا تُطبع إطلاقاً (نفس سلوك المعاينة)
        private static readonly string[] LegacyReceiptFooters = new string[]
        {
            "شكراً لتعاملكم معنا! البضاعة المباعة ترد وتستبدل وفقاً لسياسة المتجر.",
            "شكراً لزيارتكم! البضاعة المباعة ترد وتستبدل وفقاً لسياسة المتجر."
        };

        private static string _receiptFontName;

        private delegate float ReceiptPaintFunc(Graphics g, int contentWidth);

        /// <summary>مهمة طباعة: دالة رسم + أبعاد محسوبة من قياس المحتوى + الشعار المملوك لها</summary>
        private sealed class ReceiptRenderJob : IDisposable
        {
            public ReceiptPaintFunc Paint;
            public int ContentWidth;
            public int PixelWidth;
            public float Scale;
            public int PixelHeight;
            public Image Logo;

            public void Dispose()
            {
                if (Logo != null)
                {
                    Logo.Dispose();
                    Logo = null;
                }
            }
        }

        private sealed class ReceiptStoreInfo
        {
            public string Name = "";
            public string Phone = "";
            public string Address = "";
            public string TaxNumber = "";
            public string Header = "";
            public string Footer = "";
            public string Signature = "";
            public bool ShowCashier = true;
            public bool ShowInvoiceNumber = true;
            public bool ShowPaid = true;
            public bool ShowChange = true;
            public bool SignatureVisible = true;
            public string SignatureImage = "";
        }

        private sealed class ReceiptPaymentLine
        {
            public string Label;
            public long Amount;
        }

        private sealed class ReceiptTotals
        {
            public long Subtotal;
            public long DiscountTotal;
            public long ServiceCharge;
            public long DeliveryFee;
            public long Total;
            public long Tax;
            public long EpayFee;
            public long Payable;
            public long Paid;
            public long Change;
            public long Deposited;
            public long Remaining;
            public List<ReceiptPaymentLine> Payments = new List<ReceiptPaymentLine>();
        }

        private sealed class ReceiptLine
        {
            public string Name;
            public string Qty;
            public string Price;
            public string Total;
            public List<string> Details = new List<string>();
        }

        // ---------- تنسيق الأرقام والتواريخ (أعداد صحيحة فقط - لا double/float في المبالغ) ----------

        private static string GroupThousands(string digits)
        {
            if (digits.Length <= 3) return digits;
            var sb = new StringBuilder();
            int first = digits.Length % 3;
            if (first > 0) sb.Append(digits, 0, first);
            for (int i = first; i < digits.Length; i += 3)
            {
                if (sb.Length > 0) sb.Append(',');
                sb.Append(digits, i, 3);
            }
            return sb.ToString();
        }

        private static ulong AbsAsUnsigned(long value)
        {
            return value < 0 ? (ulong)(-(value + 1)) + 1UL : (ulong)value;
        }

        /// <summary>123456789 قرش => "1,234,567.89" (أرقام لاتينية، مستقل عن لغة الويندوز)</summary>
        public static string FormatReceiptMoney(long piasters)
        {
            ulong abs = AbsAsUnsigned(piasters);
            ulong frac = abs % 100UL;
            string text = GroupThousands((abs / 100UL).ToString(CultureInfo.InvariantCulture)) + "." + (frac < 10UL ? "0" : "") + frac.ToString(CultureInfo.InvariantCulture);
            return piasters < 0 ? "-" + text : text;
        }

        /// <summary>الكمية بالملي-وحدة: قطع صحيحة بدون كسور، والأوزان بثلاث خانات (1.250)</summary>
        public static string FormatReceiptQuantity(long quantityMilli, bool forceDecimals)
        {
            ulong abs = AbsAsUnsigned(quantityMilli);
            ulong frac = abs % 1000UL;
            string text = GroupThousands((abs / 1000UL).ToString(CultureInfo.InvariantCulture));
            if (frac != 0UL || forceDecimals) text += "." + frac.ToString("000", CultureInfo.InvariantCulture);
            return quantityMilli < 0 ? "-" + text : text;
        }

        public static string FormatReceiptQuantityWithUnit(long quantityMilli, string unitName, string unit)
        {
            string label = FormatReceiptUnit(unitName, unit, quantityMilli);
            return FormatReceiptQuantity(quantityMilli, label == "كجم") + " " + label;
        }

        public static string FormatReceiptDateTime(string createdAt)
        {
            DateTime parsed = DateTime.Now;
            if (!string.IsNullOrWhiteSpace(createdAt)
                && !DateTime.TryParse(createdAt, CultureInfo.InvariantCulture, DateTimeStyles.None, out parsed)
                && !DateTime.TryParse(createdAt, out parsed))
            {
                parsed = DateTime.Now;
            }
            return parsed.ToString("yyyy/MM/dd HH:mm", CultureInfo.InvariantCulture);
        }

        public static string GetReceiptPaymentLabel(string method)
        {
            string m = (method ?? "").Trim().ToLowerInvariant();
            if (m == "cash") return "نقدي";
            if (m == "card") return "بطاقة";
            if (m == "instapay") return "إنستاباي";
            if (m == "vodafone_cash" || m == "wallet") return "محفظة إلكترونية";
            if (m == "insurance") return "شركة التأمين";
            return "المدفوع";
        }

        private static long GetReceiptLineGross(SaleItem item)
        {
            return Money.FromPiasters(item.UnitPricePiasters).MultiplyByMilliUnits(item.QuantityMilli).Piasters;
        }

        /// <summary>تجميع إجماليات الإيصال مباشرة من الفاتورة المخزنة (بدون إعادة حساب الضريبة أو الإجمالي)</summary>
        private static ReceiptTotals ComputeReceiptTotals(Sale sale)
        {
            var t = new ReceiptTotals();
            long lineDiscounts = 0;
            long grossSum = 0;
            if (sale.Items != null)
            {
                for (int i = 0; i < sale.Items.Count; i++)
                {
                    SaleItem item = sale.Items[i];
                    if (item == null) continue;
                    lineDiscounts += Math.Max(0L, item.DiscountPiasters);
                    grossSum += GetReceiptLineGross(item);
                }
            }

            t.Subtotal = sale.SubtotalPiasters > 0 ? sale.SubtotalPiasters : grossSum;
            t.DiscountTotal = Math.Max(0L, sale.DiscountPiasters) + lineDiscounts;
            t.ServiceCharge = Math.Max(0L, sale.ServiceChargePiasters);
            t.DeliveryFee = Math.Max(0L, sale.DeliveryFeePiasters);
            t.Total = sale.TotalPiasters;
            t.Tax = Math.Max(0L, sale.TaxPiasters);
            t.EpayFee = Math.Max(0L, sale.ServiceFeePiasters);
            t.Payable = t.Total + t.EpayFee;

            long nonCredit = 0;
            long credit = 0;
            if (sale.Payments != null)
            {
                for (int i = 0; i < sale.Payments.Count; i++)
                {
                    SalePayment p = sale.Payments[i];
                    if (p == null || p.AmountPiasters <= 0) continue;
                    if (string.Equals(p.Method, "credit", StringComparison.OrdinalIgnoreCase))
                    {
                        credit += p.AmountPiasters;
                    }
                    else
                    {
                        nonCredit += p.AmountPiasters;
                        t.Payments.Add(new ReceiptPaymentLine { Label = GetReceiptPaymentLabel(p.Method), Amount = p.AmountPiasters });
                    }
                }
            }

            if (nonCredit == 0 && credit == 0)
            {
                long paid = sale.PaidPiasters;
                if (string.Equals(sale.PaymentMethod, "credit", StringComparison.OrdinalIgnoreCase))
                {
                    if (paid > 0)
                    {
                        nonCredit = paid;
                        t.Payments.Add(new ReceiptPaymentLine { Label = GetReceiptPaymentLabel(null), Amount = paid });
                    }
                }
                else
                {
                    if (paid <= 0) paid = t.Total;
                    nonCredit = paid;
                    if (paid > 0) t.Payments.Add(new ReceiptPaymentLine { Label = GetReceiptPaymentLabel(sale.PaymentMethod), Amount = paid });
                }
            }

            t.Paid = nonCredit;
            if (credit == 0 && t.Paid < t.Payable) credit = t.Payable - t.Paid;
            t.Remaining = credit;

            long excess = t.Paid - t.Payable;
            if (excess > 0)
            {
                bool registered = !string.IsNullOrWhiteSpace(sale.CustomerId)
                    && !string.Equals(sale.CustomerId, GeneralCashCustomerId, StringComparison.OrdinalIgnoreCase);
                long handedBack = Math.Max(0L, sale.ChangePiasters);
                if (registered)
                {
                    t.Change = Math.Min(handedBack, excess);
                    t.Deposited = excess - t.Change;
                }
                else
                {
                    t.Change = handedBack > 0 ? Math.Min(handedBack, excess) : excess;
                }
            }

            return t;
        }

        private static string ResolveReceiptFontName()
        {
            if (_receiptFontName != null) return _receiptFontName;

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

            _receiptFontName = fontName;
            return fontName;
        }

        private static void ApplyReceiptGraphicsHints(Graphics g)
        {
            g.TextRenderingHint = TextRenderingHint.SingleBitPerPixelGridFit;
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
            g.SmoothingMode = SmoothingMode.None;
            g.PixelOffsetMode = PixelOffsetMode.Half;
        }

        /// <summary>تمرير قياس: يحسب ارتفاع الإيصال الفعلي بنفس الرسم والمقياس المستخدمين في الطباعة</summary>
        private static ReceiptRenderJob CreateReceiptJob(ReceiptPaintFunc paint, int contentWidth, Image logo)
        {
            var job = new ReceiptRenderJob();
            job.Paint = paint;
            job.Logo = logo;
            bool compact = contentWidth <= 210;
            // على طابعات 203 DPI: 80mm = 576 بكسل، 57mm = 384 بكسل
            job.ContentWidth = compact ? 190 : 285;
            job.PixelWidth = compact ? 384 : 576;
            job.Scale = (float)job.PixelWidth / (float)job.ContentWidth;

            try
            {
                using (var bmpMeasure = new Bitmap(job.PixelWidth, 8))
                using (var gMeasure = Graphics.FromImage(bmpMeasure))
                {
                    ApplyReceiptGraphicsHints(gMeasure);
                    gMeasure.ScaleTransform(job.Scale, job.Scale);
                    float measured = paint(gMeasure, job.ContentWidth);
                    job.PixelHeight = Math.Max(40, (int)Math.Ceiling(measured * job.Scale) + 2);
                }
            }
            catch
            {
                job.Dispose();
                throw;
            }

            return job;
        }

        /// <summary>رسم شريحة من الإيصال (rows صفاً بدءاً من top) في صورة مستقلة</summary>
        private static Bitmap RenderReceiptBand(ReceiptRenderJob job, int top, int rows)
        {
            var bmp = new Bitmap(job.PixelWidth, Math.Max(1, rows));
            try
            {
                using (var g = Graphics.FromImage(bmp))
                {
                    g.Clear(Color.White);
                    ApplyReceiptGraphicsHints(g);
                    g.TranslateTransform(0f, -(float)top);
                    g.ScaleTransform(job.Scale, job.Scale);
                    job.Paint(g, job.ContentWidth);
                }
            }
            catch
            {
                bmp.Dispose();
                throw;
            }
            return bmp;
        }

        /// <summary>بايتات ESC/POS: صورة واحدة للإيصالات العادية، وشرائح متتالية (بدون اقتطاع) للإيصالات الطويلة جداً</summary>
        private byte[] BuildReceiptEscPos(ReceiptRenderJob job, bool kickDrawer, bool autoCut)
        {
            int pulseMs = GetConfiguredDrawerPulseMs();
            int pin = GetConfiguredDrawerPin();

            if (job.PixelHeight <= MaxReceiptBitmapRows)
            {
                using (var bmp = RenderReceiptBand(job, 0, job.PixelHeight))
                {
                    return RawPrinterHelper.ConvertBitmapToEscPosRaster(bmp, kickDrawer, autoCut, pulseMs, pin);
                }
            }

            using (var ms = new MemoryStream())
            {
                ms.WriteByte(0x1B); ms.WriteByte(0x40);                              // ESC @
                if (kickDrawer)
                {
                    byte[] kick = RawPrinterHelper.GetDrawerKickPulse(pulseMs, pin);
                    ms.Write(kick, 0, kick.Length);
                }
                ms.WriteByte(0x1B); ms.WriteByte(0x61); ms.WriteByte(0x01);          // ESC a 1

                for (int top = 0; top < job.PixelHeight; top += ReceiptBandRows)
                {
                    int rows = Math.Min(ReceiptBandRows, job.PixelHeight - top);
                    using (var band = RenderReceiptBand(job, top, rows))
                    {
                        AppendEscPosRaster(ms, band);
                    }
                }

                if (autoCut)
                {
                    byte[] cut = RawPrinterHelper.PaperCutSequence;
                    ms.Write(cut, 0, cut.Length);
                }
                else
                {
                    ms.WriteByte(0x1B); ms.WriteByte(0x64); ms.WriteByte(0x03);      // ESC d 3
                }
                return ms.ToArray();
            }
        }

        /// <summary>GS v 0 على دفعات 256 صفاً (نفس عتبة RawPrinterHelper) لشريحة واحدة</summary>
        private static void AppendEscPosRaster(MemoryStream ms, Bitmap bmp)
        {
            int width = bmp.Width;
            int height = bmp.Height;
            int bytesPerLine = (width + 7) / 8;

            System.Drawing.Imaging.BitmapData data = bmp.LockBits(
                new Rectangle(0, 0, width, height),
                System.Drawing.Imaging.ImageLockMode.ReadOnly,
                System.Drawing.Imaging.PixelFormat.Format32bppArgb);
            try
            {
                int stride = Math.Abs(data.Stride);
                byte[] pixels = new byte[stride * height];
                System.Runtime.InteropServices.Marshal.Copy(data.Scan0, pixels, 0, pixels.Length);

                for (int yStart = 0; yStart < height; yStart += 256)
                {
                    int chunk = Math.Min(256, height - yStart);
                    ms.WriteByte(0x1D); ms.WriteByte(0x76); ms.WriteByte(0x30); ms.WriteByte(0x00);
                    ms.WriteByte((byte)(bytesPerLine & 0xFF));
                    ms.WriteByte((byte)((bytesPerLine >> 8) & 0xFF));
                    ms.WriteByte((byte)(chunk & 0xFF));
                    ms.WriteByte((byte)((chunk >> 8) & 0xFF));

                    for (int y = yStart; y < yStart + chunk; y++)
                    {
                        int rowOffset = y * stride;
                        for (int xByte = 0; xByte < bytesPerLine; xByte++)
                        {
                            byte b = 0;
                            for (int bit = 0; bit < 8; bit++)
                            {
                                int x = xByte * 8 + bit;
                                if (x >= width) break;
                                int px = rowOffset + (x * 4);
                                int lum = (pixels[px + 2] * 299 + pixels[px + 1] * 587 + pixels[px] * 114) / 1000;
                                if (pixels[px + 3] > 128 && lum < 185) b |= (byte)(0x80 >> bit);
                            }
                            ms.WriteByte(b);
                        }
                    }
                }
            }
            finally
            {
                bmp.UnlockBits(data);
            }
        }

        // ارتفاع الصفحة بمائة البوصة: تقريب لأعلى + 3 (حوالي 0.75 مم) تحمي من تقريب تعريف الطابعة دون ترك ورق فارغ زائد
        private const int ReceiptPageSlackHundredths = 3;

        private static int ReceiptRowsToHundredthsInch(int rows)
        {
            return (int)(((long)rows * 100L + 202L) / 203L) + ReceiptPageSlackHundredths;
        }

        /// <summary>
        /// مسار ويندوز (PrintDocument): يرسم صورة الإيصال بمقاس ورق صريح وارتفاع من المحتوى وهوامش صفرية.
        /// الإيصال الطويل جداً يُقسم إلى صفحات متتالية بدل الاقتطاع.
        /// </summary>
        private bool PrintReceiptJobViaGdi(ReceiptRenderJob job, string printerName, string documentName, bool isCompact, out string error)
        {
            error = null;
            using (var doc = new PrintDocument())
            {
                if (!string.IsNullOrWhiteSpace(printerName))
                {
                    doc.PrinterSettings.PrinterName = printerName;
                }

                doc.DefaultPageSettings.Margins = new System.Drawing.Printing.Margins(0, 0, 0, 0);
                doc.OriginAtMargins = false;

                if (!doc.PrinterSettings.IsValid)
                {
                    error = string.Format("الطابعة '{0}' غير مثبتة أو غير متصلة بالنظام.", printerName);
                    return false;
                }

                int paperWidth = isCompact ? 228 : 314;
                int pageCount = (job.PixelHeight + ReceiptGdiPageRows - 1) / ReceiptGdiPageRows;
                int pageIndex = 0;

                try
                {
                    doc.DefaultPageSettings.PaperSize = new PaperSize("RafiqReceipt", paperWidth, ReceiptRowsToHundredthsInch(Math.Min(ReceiptGdiPageRows, job.PixelHeight)));
                }
                catch (Exception exPaper)
                {
                    Logger.Warn("تعذر ضبط مقاس ورق الإيصال: " + exPaper.Message);
                }

                doc.DocumentName = documentName;
                doc.PrintController = new StandardPrintController(); // طباعة صامتة بدون نوافذ حوارية مزعجة

                doc.QueryPageSettings += delegate(object sender, QueryPageSettingsEventArgs qe)
                {
                    int pageRows = Math.Min(ReceiptGdiPageRows, job.PixelHeight - pageIndex * ReceiptGdiPageRows);
                    try
                    {
                        qe.PageSettings.PaperSize = new PaperSize("RafiqReceipt", paperWidth, ReceiptRowsToHundredthsInch(pageRows));
                    }
                    catch (Exception exPage)
                    {
                        Logger.Warn("تعذر ضبط ارتفاع صفحة الإيصال: " + exPage.Message);
                    }
                };

                doc.PrintPage += delegate(object sender, PrintPageEventArgs e)
                {
                    int top = pageIndex * ReceiptGdiPageRows;
                    int pageRows = Math.Min(ReceiptGdiPageRows, job.PixelHeight - top);
                    using (var band = RenderReceiptBand(job, top, pageRows))
                    {
                        // 1/100 بوصة: الصورة بحجمها الفعلي عند 203 DPI ومتمركزة على عرض الورق
                        float destW = job.PixelWidth * 100f / 203f;
                        float destH = pageRows * 100f / 203f;
                        float offsetX = Math.Max(0f, (paperWidth - destW) / 2f);
                        e.Graphics.PageUnit = GraphicsUnit.Display;
                        e.Graphics.InterpolationMode = InterpolationMode.NearestNeighbor;
                        e.Graphics.PixelOffsetMode = PixelOffsetMode.Half;
                        e.Graphics.DrawImage(band, new RectangleF(offsetX, 0f, destW, destH));
                    }
                    pageIndex++;
                    e.HasMorePages = pageIndex < pageCount;
                };

                doc.Print();
            }
            return true;
        }

        private ReceiptStoreInfo LoadReceiptStoreInfo()
        {
            var store = _settings != null ? _settings.GetAllSettings() : new Dictionary<string, string>();
            var info = new ReceiptStoreInfo();
            info.Name = ReadStoreSetting(store, "store_name");
            if (info.Name.Length == 0) info.Name = "متجر رفيق";
            info.Phone = ReadStoreSetting(store, "store_phone");
            info.Address = ReadStoreSetting(store, "store_address");
            info.TaxNumber = ReadStoreSetting(store, "tax_number");
            // نصوص الترويسة والتذييل والتوقيع قد تحوي أسطراً حقيقية (\n): تُطبَّع بنفس قواعد الحفظ وتُرسم سطراً بسطر
            info.Header = SettingsService.NormalizeReceiptText(ReadStoreSetting(store, "receipt_header"));
            info.Footer = SettingsService.NormalizeReceiptText(ReadStoreSetting(store, "receipt_footer"));
            for (int i = 0; i < LegacyReceiptFooters.Length; i++)
            {
                if (info.Footer == LegacyReceiptFooters[i]) info.Footer = DefaultReceiptThanks;
            }
            // المفتاح الناقص أو أي قيمة غير "0" تعني إظهار اسم الكاشير
            info.ShowCashier = ReadStoreSetting(store, "receipt_show_cashier") != "0";
            // نفس القاعدة لمفاتيح رقم الفاتورة والمدفوع والباقي: عرض فقط ولا تغيّر أي قيمة مخزنة
            info.ShowInvoiceNumber = ReadStoreSetting(store, "receipt_show_invoice_number") != "0";
            info.ShowPaid = ReadStoreSetting(store, "receipt_show_paid") != "0";
            info.ShowChange = ReadStoreSetting(store, "receipt_show_change") != "0";
            // توقيع الإيصال: المفتاح الناقص يعني ظاهر وبالصورة الافتراضية المضمّنة؛ "none" بدون صورة؛ وغير ذلك صورة مخصصة
            info.SignatureVisible = ReadStoreSetting(store, SettingsService.SignatureVisibleKey) != "0";
            info.SignatureImage = ReadStoreSetting(store, SettingsService.SignatureImageKey);

            string signature = _settings != null ? _settings.Get("developer_signature", SettingsService.DefaultDeveloperSignature) : SettingsService.DefaultDeveloperSignature;
            if (SettingsService.IsLegacyOrBlankDeveloperSignature(signature)) signature = SettingsService.DefaultDeveloperSignature;
            info.Signature = SettingsService.NormalizeReceiptText(signature);
            return info;
        }

        private static string ReadStoreSetting(Dictionary<string, string> store, string key)
        {
            string value;
            if (store != null && store.TryGetValue(key, out value) && value != null) return value.Trim();
            return "";
        }

        /// <summary>أدوات الرسم: كل دالة تقيس ثم ترسم وتحرك Y، فلا يوجد نص مقطوع مهما طال</summary>
        private sealed class ReceiptPainter : IDisposable
        {
            public const float Pad = 5f;
            public const float ColGap = 6f;
            // هامش أمان لكل عمود مقاس: امتداد الحروف العربية المتصلة يتجاوز عرض القياس بوحدات قليلة
            public const float CellPad = 3f;
            // مسافة أعلى أول سطر وأسفل آخر سطر بوحدات الرسم (الوحدة = حوالي 0.25 مم)
            public const float TopPad = 2f;
            public const float BottomPad = 5f;

            public readonly Graphics G;
            public readonly float W;
            public readonly float Usable;
            public readonly bool Compact;
            public readonly string FontName;
            public readonly Font Title;
            public readonly Font Large;
            public readonly Font Bold;
            public readonly Font Regular;
            public readonly Font Small;
            public readonly Pen Dashed;
            public readonly Pen Solid;
            public readonly StringFormat Rtl;
            public readonly StringFormat RtlNoWrap;
            public readonly StringFormat Center;
            public readonly StringFormat Left;
            public readonly StringFormat Right;
            private readonly StringFormat _measure;
            public float Y;

            public ReceiptPainter(Graphics g, int contentWidth)
            {
                G = g;
                W = contentWidth;
                Usable = contentWidth - 2f * Pad;
                Compact = contentWidth <= 210;
                Y = TopPad;
                FontName = ResolveReceiptFontName();

                // أحجام الخطوط تناسبية مع مقاس الورق (80mm أو 57mm)
                Title = new Font(FontName, Compact ? 10.5f : 12f, FontStyle.Bold);
                Large = new Font(FontName, Compact ? 11.5f : 13f, FontStyle.Bold);
                Bold = new Font(FontName, Compact ? 8f : 9f, FontStyle.Bold);
                Regular = new Font(FontName, Compact ? 7.5f : 8.5f, FontStyle.Regular);
                Small = new Font(FontName, Compact ? 6.8f : 7.5f, FontStyle.Regular);
                Dashed = new Pen(Color.Black, 1f) { DashStyle = DashStyle.Dash };
                Solid = new Pen(Color.Black, 1.2f);

                Rtl = new StringFormat { FormatFlags = StringFormatFlags.DirectionRightToLeft, Alignment = StringAlignment.Near, LineAlignment = StringAlignment.Near };
                RtlNoWrap = new StringFormat { FormatFlags = StringFormatFlags.DirectionRightToLeft | StringFormatFlags.NoWrap | StringFormatFlags.NoClip, Alignment = StringAlignment.Near, LineAlignment = StringAlignment.Near };
                Center = new StringFormat { FormatFlags = StringFormatFlags.DirectionRightToLeft, Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Near };
                Left = (StringFormat)StringFormat.GenericTypographic.Clone();
                Left.Alignment = StringAlignment.Near;
                Left.LineAlignment = StringAlignment.Near;
                Left.FormatFlags |= StringFormatFlags.NoWrap | StringFormatFlags.NoClip;
                Right = (StringFormat)StringFormat.GenericTypographic.Clone();
                Right.Alignment = StringAlignment.Far;
                Right.LineAlignment = StringAlignment.Near;
                Right.FormatFlags |= StringFormatFlags.NoWrap | StringFormatFlags.NoClip;
                _measure = (StringFormat)StringFormat.GenericTypographic.Clone();
                _measure.FormatFlags |= StringFormatFlags.NoWrap;
            }

            public void Dispose()
            {
                Title.Dispose(); Large.Dispose(); Bold.Dispose(); Regular.Dispose(); Small.Dispose();
                Dashed.Dispose(); Solid.Dispose();
                Rtl.Dispose(); RtlNoWrap.Dispose(); Center.Dispose(); Left.Dispose(); Right.Dispose(); _measure.Dispose();
            }

            /// <summary>عرض سطر واحد (بدون التفاف) بوحدات الرسم، مع هامش أمان صغير</summary>
            public float TextW(string text, Font font)
            {
                if (string.IsNullOrEmpty(text)) return 0f;
                return (float)Math.Ceiling(G.MeasureString(text, font, new PointF(0f, 0f), _measure).Width) + 1f;
            }

            /// <summary>عرض خلية نص عربي تُرسم بتنسيق RtlNoWrap: يُقاس بنفس التنسيق (بما فيه حشو الحواف) ثم يُضاف هامش الأمان، فلا يُقص آخر حرف</summary>
            public float CellW(string text, Font font)
            {
                if (string.IsNullOrEmpty(text)) return 0f;
                return (float)Math.Ceiling(G.MeasureString(text, font, new PointF(0f, 0f), RtlNoWrap).Width) + CellPad;
            }

            public float LineH(Font font)
            {
                return (float)Math.Ceiling(font.GetHeight(G)) + 1f;
            }

            public void Separator(Pen pen, float before, float after)
            {
                Y += before;
                G.DrawLine(pen, Pad, Y, W - Pad, Y);
                Y += after;
            }

            /// <summary>نص ملتف على عرض كامل: يقاس بنفس التنسيق المستخدم في الرسم ثم يُرسم بارتفاعه الكامل</summary>
            public float WrapText(string text, Font font, StringFormat format, float x, float width)
            {
                if (string.IsNullOrWhiteSpace(text)) return 0f;
                string clean = text.Replace("\r\n", "\n").Replace('\r', '\n').Trim();
                SizeF size = G.MeasureString(clean, font, new SizeF(width, 100000f), format);
                float h = (float)Math.Ceiling(size.Height) + 1f;
                G.DrawString(clean, font, Brushes.Black, new RectangleF(x, Y, width, h), format);
                Y += h;
                return h;
            }

            /// <summary>نص بأسطر متعددة: كل فقرة (يفصلها \n) تُقاس وتُرسم على حدة، والسطر الفارغ يحجز ارتفاع سطر كامل</summary>
            public float WrapLines(string text, Font font, StringFormat format, float x, float width)
            {
                if (string.IsNullOrWhiteSpace(text)) return 0f;
                string[] paragraphs = text.Replace("\r\n", "\n").Replace('\r', '\n').Split('\n');
                float total = 0f;
                for (int i = 0; i < paragraphs.Length; i++)
                {
                    if (string.IsNullOrWhiteSpace(paragraphs[i]))
                    {
                        float blank = LineH(font);
                        Y += blank;
                        total += blank;
                    }
                    else
                    {
                        total += WrapText(paragraphs[i], font, format, x, width);
                    }
                }
                return total;
            }

            /// <summary>نص ملتف على اليمين وقيمة قصيرة على اليسار في نفس السطر (التفاف النص دون تداخل مع القيمة)</summary>
            public void WrapWithSide(string text, string side, Font textFont, Font sideFont)
            {
                float sideW = TextW(side, sideFont);
                float textW = sideW > 0f ? Usable - sideW - ColGap : Usable;
                float sideH = sideW > 0f ? LineH(sideFont) : 0f;
                if (sideW > 0f) G.DrawString(side, sideFont, Brushes.Black, new RectangleF(Pad, Y, sideW + 2f, sideH), Left);

                float textH = 0f;
                if (!string.IsNullOrWhiteSpace(text))
                {
                    string clean = text.Trim();
                    SizeF size = G.MeasureString(clean, textFont, new SizeF(textW, 100000f), Rtl);
                    textH = (float)Math.Ceiling(size.Height) + 1f;
                    G.DrawString(clean, textFont, Brushes.Black, new RectangleF(W - Pad - textW, Y, textW, textH), Rtl);
                }
                Y += Math.Max(textH, sideH);
            }

            /// <summary>عنوان على اليمين وقيمة على اليسار؛ تنزل القيمة لسطر مستقل إذا لم يتسع الاثنان معاً</summary>
            public void LabelValue(string label, string value, Font labelFont, Font valueFont, float valueColW)
            {
                float valueW = valueColW > 0f ? valueColW : TextW(value, valueFont);
                float labelW = CellW(label, labelFont);
                float h = Math.Max(LineH(labelFont), LineH(valueFont));
                if (labelW + valueW + ColGap <= Usable)
                {
                    G.DrawString(label, labelFont, Brushes.Black, new RectangleF(Pad, Y, Usable, h), Rtl);
                    DrawValue(value, valueFont, valueW, h);
                    Y += h;
                }
                else
                {
                    WrapText(label, labelFont, Rtl, Pad, Usable);
                    DrawValue(value, valueFont, valueW, LineH(valueFont));
                    Y += LineH(valueFont);
                }
            }

            private void DrawValue(string value, Font font, float colW, float h)
            {
                G.DrawString(value, font, Brushes.Black, new RectangleF(Pad, Y, Math.Max(colW, 1f), h), Right);
            }

            /// <summary>صف أعمدة الأصناف: كتلة الأرقام على اليسار (الإجمالي | السعر | الكمية) بعروض مقاسة مسبقاً، واسم الصنف اختيارياً على اليمين في نفس السطر</summary>
            public void NumbersRow(string name, string qty, string price, string total, float qtyW, float priceW, float totalW, Font nameFont, Font qtyFont, Font priceFont, Font totalFont)
            {
                float h = Math.Max(LineH(qtyFont), Math.Max(LineH(priceFont), LineH(totalFont)));
                if (!string.IsNullOrEmpty(name)) h = Math.Max(h, LineH(nameFont));
                float priceX = Pad + totalW + ColGap;
                float qtyX = priceX + priceW + ColGap;
                G.DrawString(total, totalFont, Brushes.Black, new RectangleF(Pad, Y, totalW, h), Right);
                G.DrawString(price, priceFont, Brushes.Black, new RectangleF(priceX, Y, priceW, h), Right);
                G.DrawString(qty, qtyFont, Brushes.Black, new RectangleF(qtyX, Y, qtyW, h), RtlNoWrap);
                if (!string.IsNullOrEmpty(name))
                {
                    float nameX = qtyX + qtyW + ColGap;
                    G.DrawString(name, nameFont, Brushes.Black, new RectangleF(nameX, Y, W - Pad - nameX, h), RtlNoWrap);
                }
                Y += h;
            }

            /// <summary>شارة سوداء بنص أبيض (نسخة / ملغاة / تجريبية)</summary>
            public void Badge(string text)
            {
                float h = LineH(Bold) + 3f;
                float x = Pad + 8f;
                float w = W - 2f * x;
                G.FillRectangle(Brushes.Black, new RectangleF(x, Y, w, h));
                G.DrawString(text, Bold, Brushes.White, new RectangleF(x, Y + 1.5f, w, h - 1.5f), Center);
                Y += h + 3f;
            }

            /// <summary>الإجمالي النهائي: العنوان بخط عريض والمبلغ بخط كبير، ويصغّر المبلغ تلقائياً إن لزم حتى لا يُقص أبداً</summary>
            public void GrandTotal(string label, string amount, string currency)
            {
                Font valueFont = Large;
                bool ownsFont = false;
                float size = Large.Size;
                float amountW = TextW(amount, valueFont);
                float currencyW = TextW(currency, valueFont);
                float valueW = amountW + (currencyW > 0f ? 3f + currencyW : 0f);
                while (valueW > Usable && size > 6f)
                {
                    size -= 0.5f;
                    if (ownsFont) valueFont.Dispose();
                    valueFont = new Font(FontName, size, FontStyle.Bold);
                    ownsFont = true;
                    amountW = TextW(amount, valueFont);
                    currencyW = TextW(currency, valueFont);
                    valueW = amountW + (currencyW > 0f ? 3f + currencyW : 0f);
                }

                try
                {
                    float labelW = TextW(label, Bold);
                    float h = Math.Max(LineH(Bold), LineH(valueFont));
                    float rowY = Y;
                    if (labelW + valueW + ColGap <= Usable)
                    {
                        G.DrawString(label, Bold, Brushes.Black, new RectangleF(Pad, rowY + (h - LineH(Bold)) / 2f, Usable, LineH(Bold)), Rtl);
                    }
                    else
                    {
                        WrapText(label, Bold, Rtl, Pad, Usable);
                        rowY = Y;
                        h = LineH(valueFont);
                    }

                    // الرقم والعملة يُرسمان منفصلين حتى لا يتغير ترتيبهما مع اتجاه النص
                    G.DrawString(amount, valueFont, Brushes.Black, new RectangleF(Pad, rowY, amountW + 2f, h), Left);
                    if (currencyW > 0f) G.DrawString(currency, valueFont, Brushes.Black, new RectangleF(Pad + amountW + 3f, rowY, currencyW + 2f, h), Left);
                    Y = rowY + h;
                }
                finally
                {
                    if (ownsFont) valueFont.Dispose();
                }
            }
        }

        private static void DrawStoreHeader(ReceiptPainter p, ReceiptStoreInfo store, Image logo, bool includeHeaderText)
        {
            if (logo != null && logo.Width > 0 && logo.Height > 0)
            {
                try
                {
                    float maxW = p.Compact ? 90f : 130f;
                    float maxH = p.Compact ? 38f : 48f;
                    float scale = Math.Min(maxW / logo.Width, maxH / logo.Height);
                    if (scale > 1f) scale = 1f;
                    float drawW = logo.Width * scale;
                    float drawH = logo.Height * scale;
                    p.G.DrawImage(logo, (p.W - drawW) / 2f, p.Y, drawW, drawH);
                    p.Y += drawH + 3f;
                }
                catch (Exception exLogo)
                {
                    Logger.Warn("تعذر رسم شعار المتجر على الإيصال: " + exLogo.Message);
                }
            }

            p.WrapText(store.Name, p.Title, p.Center, ReceiptPainter.Pad, p.Usable);
            p.WrapText(store.Address, p.Small, p.Center, ReceiptPainter.Pad, p.Usable);
            if (store.Phone.Length > 0) p.WrapText("هاتف: " + store.Phone, p.Small, p.Center, ReceiptPainter.Pad, p.Usable);
            if (store.TaxNumber.Length > 0) p.WrapText("الرقم الضريبي: " + store.TaxNumber, p.Small, p.Center, ReceiptPainter.Pad, p.Usable);
            if (includeHeaderText && store.Header.Length > 0)
            {
                p.Y += 2f;
                p.WrapLines(store.Header, p.Regular, p.Center, ReceiptPainter.Pad, p.Usable);
            }
        }

        // صور التوقيع أسفل الإيصال: الافتراضية هي كل PNG في Resources\signatures (مضمّنة باسم RafiqPOS.signatures.<الملف>) وتُحمَّل مرة واحدة
        // مرتبة ترتيباً حرفياً، والمخصصة (data URL من الروت) تُفك كلها مرة واحدة لكل نص إعداد وتُحفظ مع قائمتها،
        // ثم تُختار من المجموعة الكاملة صورة لكل فاتورة بنفس فهرس المعاينة
        private const string BuiltInSignaturePrefix = "RafiqPOS.signatures.";
        private static readonly object SignatureBannerLock = new object();
        private static List<Image> _builtInBanners;
        private static string _bannerListKey;
        private static List<Image> _bannerList;
        // الصور المخصصة التي أنشأناها فقط (لا تشمل المضمّنة المشتركة) لتُتلف عند تغيّر الإعداد
        private static readonly List<Image> OwnedCustomBanners = new List<Image>();

        // تُستدعى داخل SignatureBannerLock فقط. تُرجع القائمة نفسها في كل مرة؛ التالف يُسقَط ويُسجَّل اسمه فقط
        private static List<Image> LoadBuiltInSignatureBanners()
        {
            if (_builtInBanners != null) return _builtInBanners;
            var list = new List<Image>();
            try
            {
                System.Reflection.Assembly assembly = System.Reflection.Assembly.GetExecutingAssembly();
                string[] names = assembly.GetManifestResourceNames();
                Array.Sort(names, StringComparer.Ordinal);
                for (int i = 0; i < names.Length; i++)
                {
                    if (!names[i].StartsWith(BuiltInSignaturePrefix, StringComparison.Ordinal) ||
                        !names[i].EndsWith(".png", StringComparison.OrdinalIgnoreCase)) continue;
                    try
                    {
                        using (Stream resource = assembly.GetManifestResourceStream(names[i]))
                        {
                            if (resource == null) continue;
                            // GDI+ يحتاج المجرى حياً ما دامت الصورة مرتبطة به: ننسخها إلى Bitmap مستقل
                            using (Image decoded = Image.FromStream(resource))
                            {
                                list.Add(new Bitmap(decoded));
                            }
                        }
                    }
                    catch (Exception exBuiltIn)
                    {
                        Logger.Warn("تعذر تحميل صورة التوقيع المضمّنة " + names[i] + ": " + exBuiltIn.Message);
                    }
                }
            }
            catch (Exception exList)
            {
                Logger.Warn("تعذر قراءة صور التوقيع المضمّنة: " + exList.Message);
            }
            if (list.Count == 0) Logger.Warn("لا توجد صور توقيع مضمّنة داخل البرنامج: تُطبع الأسطر بدونها.");
            _builtInBanners = list;
            return list;
        }

        // صورة مخصصة واحدة من data URL؛ null عند الفشل (يُسجَّل رقمها فقط، لا محتواها)
        private static Image DecodeCustomBanner(string dataUrl, int number)
        {
            try
            {
                byte[] bytes;
                if (!SettingsService.TryDecodeSignatureImage(dataUrl, out bytes))
                {
                    Logger.Warn("صورة توقيع الإيصال المخصصة رقم " + number + " غير صالحة: تُتجاهل.");
                    return null;
                }
                using (var ms = new MemoryStream(bytes))
                using (Image decoded = Image.FromStream(ms))
                {
                    return new Bitmap(decoded);
                }
            }
            catch (Exception exCustom)
            {
                Logger.Warn("تعذر تحميل صورة توقيع الإيصال المخصصة رقم " + number + ": " + exCustom.Message);
                return null;
            }
        }

        // تُستدعى داخل SignatureBannerLock فقط. القائمة (حتى 8 عناصر) تُفك مرة واحدة لكل نص إعداد، والعنصر التالف يُسقَط منها،
        // و"default" يتوسع إلى الصور المضمّنة المشتركة التي لا تُتلف مع المخصصة
        private static List<Image> ResolveSignatureBanners(string setting)
        {
            if (_bannerList != null && _bannerListKey == setting) return _bannerList;

            for (int i = 0; i < OwnedCustomBanners.Count; i++) OwnedCustomBanners[i].Dispose();
            OwnedCustomBanners.Clear();

            var list = new List<Image>();
            List<string> items;
            if (!SettingsService.TryParseSignatureImageItems(setting, out items))
            {
                Logger.Warn("قائمة صور توقيع الإيصال غير صالحة: تُطبع الأسطر بدونها.");
            }
            else
            {
                for (int i = 0; i < items.Count && i < SettingsService.MaxSignatureImages; i++)
                {
                    if (items[i] == SettingsService.SignatureImageDefaultToken)
                    {
                        // "default" = كل الصور المضمّنة كعنصر واحد في القائمة، وكل واحدة منها تدخل مجموعة الاختيار
                        list.AddRange(LoadBuiltInSignatureBanners());
                        continue;
                    }
                    Image custom = DecodeCustomBanner(items[i], i + 1);
                    if (custom != null)
                    {
                        list.Add(custom);
                        OwnedCustomBanners.Add(custom);
                    }
                }
            }
            _bannerListKey = setting;
            _bannerList = list;
            return list;
        }

        /// <summary>يرسم صورة التوقيع المختارة للفاتورة (FNV-1a على pickKey) متمركزة بعرض 70% من الورقة وبارتفاع لا يتجاوز 4.5 سطر نص صغير، بنفس p.Y في القياس والرسم</summary>
        private static void DrawSignatureBanner(ReceiptPainter p, string setting, string pickKey)
        {
            lock (SignatureBannerLock)
            {
                List<Image> banners = ResolveSignatureBanners(setting);
                if (banners.Count == 0) return;
                Image banner = banners[SettingsService.PickSignatureImageIndex(pickKey, banners.Count)];
                if (banner.Width <= 0 || banner.Height <= 0) return;
                try
                {
                    float scale = Math.Min(p.Usable * 0.70f / banner.Width, p.LineH(p.Small) * 4.5f / banner.Height);
                    float drawW = banner.Width * scale;
                    float drawH = banner.Height * scale;
                    p.G.DrawImage(banner, (p.W - drawW) / 2f, p.Y, drawW, drawH);
                    p.Y += drawH + 3f;
                }
                catch (Exception exDraw)
                {
                    Logger.Warn("تعذر رسم صورة توقيع الإيصال: " + exDraw.Message);
                }
            }
        }

        /// <summary>توقيع النظام (إن كان ظاهراً): صورة متمركزة ثم أسطر التوقيع. كله يُقاس ثم يُرسم بنفس p.Y فلا يقص شيء. pickKey = معرّف الفاتورة (أو المرتجع)</summary>
        private static void DrawReceiptSignature(ReceiptPainter p, ReceiptStoreInfo store, bool separatorFirst, string pickKey)
        {
            if (!store.SignatureVisible || store.Signature.Length == 0) return;
            if (separatorFirst) p.Separator(p.Dashed, 2f, 3f);
            // مسافة سطر واحد بين الخط المنقط وما بعده، تدخل في قياس ارتفاع الإيصال مثل باقي الأسطر
            p.Y += p.LineH(p.Small);
            DrawSignatureBanner(p, store.SignatureImage, pickKey);
            p.WrapLines(store.Signature, p.Small, p.Center, ReceiptPainter.Pad - 3f, p.Usable + 6f);
        }

        // باركود الفاتورة بنقاط الطابعة (203 DPI: 576 نقطة لـ 80mm و384 لـ 57mm): هامش جانبي ومنطقة هادئة 10 موديولات على كل جانب
        private const int InvoiceBarcodeSideMarginDots = 10;
        private const int InvoiceBarcodeQuietModules = 10;

        /// <summary>قيمة باركود الفاتورة: البصمة الرسمية المميزة لنظام رفيق RFQ-INV- متبوعة بثمانية أرقام (أصفار بادئة). توأم formatInvoiceBarcodeValue في receiptLayout.ts</summary>
        public static string FormatInvoiceBarcodeValue(int invoiceNumber)
        {
            if (invoiceNumber <= 0) return "";
            return "RFQ-INV-" + invoiceNumber.ToString("D8", CultureInfo.InvariantCulture);
        }

        /// <summary>عرض الموديول بعدد صحيح من النقاط: أكبر قيمة يتسع معها الباركود مع منطقتيه الهادئتين داخل عرض الورق (لا تكبير كسري يطمس الخطوط). توأم layoutReceiptBarcode في receiptLayout.ts</summary>
        public static int ComputeInvoiceBarcodeModuleDots(int modules, int paperDots)
        {
            int available = paperDots - 2 * InvoiceBarcodeSideMarginDots;
            int dots = available / (modules + 2 * InvoiceBarcodeQuietModules);
            return dots < 1 ? 1 : dots;
        }

        /// <summary>ارتفاع الخطوط بالنقاط: 68 (حوالي 8.4mm) على 80mm و60 (حوالي 7.4mm) على 57mm</summary>
        public static int InvoiceBarcodeHeightDots(bool compact)
        {
            return compact ? 60 : 68;
        }

        /// <summary>
        /// باركود الفاتورة الحقيقي (Code 128) بلا أرقام تحته (رقم الفاتورة مطبوع في الترويسة). يُرسم بنقاط الطابعة الصحيحة مباشرة (بعد تصفير التحويل) فلا يتأثر بمقياس الإيصال الكسري،
        /// ثم يتقدّم p.Y بنفس الارتفاع في القياس والرسم
        /// </summary>
        private static void DrawInvoiceBarcode(ReceiptPainter p, string value, bool showText = true)
        {
            if (string.IsNullOrEmpty(value)) return;
            string bits = BarcodeGenerator.EncodeCode128Digits(value);
            if (bits.Length == 0) return;

            float scale;
            float originX;
            float originY;
            using (Matrix transform = p.G.Transform)
            {
                float[] e = transform.Elements;
                scale = e[0] > 0f ? e[0] : 1f;
                originX = e[4];
                originY = e[5];
            }

            int paperDots = (int)Math.Round(p.W * scale);
            int moduleDots = ComputeInvoiceBarcodeModuleDots(bits.Length, paperDots);
            int heightDots = InvoiceBarcodeHeightDots(p.Compact);
            int widthDots = bits.Length * moduleDots;
            int left = (int)Math.Round(originX) + Math.Max(0, (paperDots - widthDots) / 2);

            p.Y += 3f;
            int top = (int)Math.Round(originY + p.Y * scale);

            GraphicsState state = p.G.Save();
            try
            {
                p.G.ResetTransform();
                int i = 0;
                while (i < bits.Length)
                {
                    if (bits[i] != '1')
                    {
                        i++;
                        continue;
                    }
                    int run = 1;
                    while (i + run < bits.Length && bits[i + run] == '1') run++;
                    p.G.FillRectangle(Brushes.Black, left + i * moduleDots, top, run * moduleDots, heightDots);
                    i += run;
                }
            }
            finally
            {
                p.G.Restore(state);
            }

            p.Y += heightDots / scale + 1f;
            if (showText)
            {
                // طباعة النص المميز للباركود بخط واضح أسفل الخطوط (RFQ-INV-00001042)
                p.WrapText(value, p.Small, p.Center, ReceiptPainter.Pad, p.Usable);
            }
            p.Y += 2f;
        }

        /// <summary>جدول الأصناف: الاسم بعرض كامل ملتفاً، وتحته الكمية | السعر | الإجمالي بأعمدة مقاسة (أو سطرين إذا لم تتسع)</summary>
        private static void DrawReceiptLines(ReceiptPainter p, List<ReceiptLine> lines, string headerNote = null)
        {
            if (lines == null || lines.Count == 0) return;

            // الكمية تُرسم بتنسيق RTL فتُقاس بنفس التنسيق (CellW)، والسعر والإجمالي بتنسيق LTR مقاس بالتنسيق نفسه؛ كلها بهامش أمان CellPad
            float qtyW = p.CellW("الكمية", p.Bold);
            float priceW = p.TextW("السعر", p.Bold) + ReceiptPainter.CellPad;
            float totalW = p.TextW("الإجمالي", p.Bold) + ReceiptPainter.CellPad;
            for (int i = 0; i < lines.Count; i++)
            {
                qtyW = Math.Max(qtyW, p.CellW(lines[i].Qty, p.Regular));
                priceW = Math.Max(priceW, p.TextW(lines[i].Price, p.Regular) + ReceiptPainter.CellPad);
                totalW = Math.Max(totalW, p.TextW(lines[i].Total, p.Bold) + ReceiptPainter.CellPad);
            }

            // كتلة الأرقام (الكمية | السعر | الإجمالي) على اليسار؛ إن لم تتسع تُعرض الكمية × السعر والإجمالي في سطرين
            float cluster = qtyW + priceW + totalW + 2f * ReceiptPainter.ColGap;
            bool columns = cluster <= p.Usable;
            float nameAvail = p.Usable - cluster - ReceiptPainter.ColGap;

            if (columns)
            {
                float labelW = p.CellW("الصنف", p.Bold);
                if (labelW <= nameAvail)
                {
                    p.NumbersRow("الصنف", "الكمية", "السعر", "الإجمالي", qtyW, priceW, totalW, p.Bold, p.Bold, p.Bold, p.Bold);
                }
                else
                {
                    p.WrapText("الصنف", p.Bold, p.Rtl, ReceiptPainter.Pad, p.Usable);
                    p.NumbersRow(null, "الكمية", "السعر", "الإجمالي", qtyW, priceW, totalW, p.Bold, p.Bold, p.Bold, p.Bold);
                }
            }
            else
            {
                p.WrapText("الصنف", p.Bold, p.Rtl, ReceiptPainter.Pad, p.Usable);
                p.LabelValue("الكمية × السعر", "الإجمالي", p.Bold, p.Bold, 0f);
            }
            p.Separator(p.Solid, 1f, 3f);

            if (!string.IsNullOrEmpty(headerNote))
            {
                p.WrapText(headerNote, p.Small, p.Rtl, ReceiptPainter.Pad, p.Usable);
            }

            for (int i = 0; i < lines.Count; i++)
            {
                ReceiptLine line = lines[i];
                if (columns && p.CellW(line.Name, p.Bold) <= nameAvail)
                {
                    // اسم قصير: كل شيء في سطر واحد (توفير للورق)
                    p.NumbersRow(line.Name, line.Qty, line.Price, line.Total, qtyW, priceW, totalW, p.Bold, p.Regular, p.Regular, p.Bold);
                }
                else
                {
                    // اسم طويل: سطر كامل العرض (ملتف دون اقتطاع) ثم الأرقام في السطر التالي
                    p.WrapText(line.Name, p.Bold, p.Rtl, ReceiptPainter.Pad, p.Usable);
                    if (columns) p.NumbersRow(null, line.Qty, line.Price, line.Total, qtyW, priceW, totalW, p.Bold, p.Regular, p.Regular, p.Bold);
                    else p.LabelValue(line.Qty + " × " + line.Price, line.Total, p.Regular, p.Bold, 0f);
                }

                for (int d = 0; d < line.Details.Count; d++)
                {
                    p.WrapText(line.Details[d], p.Small, p.Rtl, ReceiptPainter.Pad, p.Usable - 8f);
                }
                p.Y += 3f;
            }
        }

        private static List<ReceiptLine> BuildSaleReceiptLines(Sale sale)
        {
            var lines = new List<ReceiptLine>();
            if (sale.Items == null) return lines;

            for (int i = 0; i < sale.Items.Count; i++)
            {
                SaleItem item = sale.Items[i];
                if (item == null) continue;

                var line = new ReceiptLine();
                line.Name = ReceiptItemNameOrDefault(item.ProductName);
                line.Qty = FormatReceiptQuantityWithUnit(item.QuantityMilli, item.UnitName, item.Unit);
                line.Price = FormatReceiptMoney(item.UnitPricePiasters);
                line.Total = FormatReceiptMoney(GetReceiptLineGross(item));

                // تشغيلة وصلاحية الأدوية (للصيدليات)
                if (!string.IsNullOrWhiteSpace(item.BatchNumber) || !string.IsNullOrWhiteSpace(item.ExpiryDate))
                {
                    string batch = "تشغيلة: " + (!string.IsNullOrWhiteSpace(item.BatchNumber) ? item.BatchNumber.Trim() : "---");
                    if (!string.IsNullOrWhiteSpace(item.ExpiryDate)) batch += " | انتهاء: " + item.ExpiryDate.Trim();
                    line.Details.Add(batch);
                }

                // إضافات المطاعم
                if (item.Modifiers != null)
                {
                    for (int m = 0; m < item.Modifiers.Count; m++)
                    {
                        SaleItemModifier mod = item.Modifiers[m];
                        if (mod == null || string.IsNullOrWhiteSpace(mod.OptionName)) continue;
                        string modText = "+ " + mod.OptionName.Trim();
                        if (mod.ExtraPricePiasters > 0) modText += " (+" + FormatReceiptMoney(mod.ExtraPricePiasters) + ")";
                        line.Details.Add(modText);
                    }
                }

                if (!string.IsNullOrWhiteSpace(item.Notes)) line.Details.Add("ملاحظة: " + item.Notes.Trim());
                lines.Add(line);
            }
            return lines;
        }

        private static bool HasColdChainItems(Sale sale)
        {
            if (sale.HasColdChainItems) return true;
            if (sale.Items == null) return false;
            for (int i = 0; i < sale.Items.Count; i++)
            {
                if (sale.Items[i] != null && sale.Items[i].IsColdChain) return true;
            }
            return false;
        }

        private static string BuildOrderMetaText(Sale sale)
        {
            string orderType = (sale.OrderType ?? "").Trim().ToLowerInvariant();
            bool hasTable = !string.IsNullOrWhiteSpace(sale.TableName);
            // رقم النداء لطلبات الكافيه فقط: فاتورة السوبر ماركت (نوع الطلب retail) لا تطبعه أبداً
            bool hasCall = sale.OrderCallNumber > 0 && (orderType == "dine_in" || orderType == "takeaway" || orderType == "delivery");
            bool hasWaiter = !string.IsNullOrWhiteSpace(sale.WaiterName);
            if (!hasTable && !hasCall && !hasWaiter && orderType != "dine_in" && orderType != "delivery") return "";

            var parts = new List<string>();
            if (hasCall) parts.Add("نداء " + sale.OrderCallNumber.ToString(CultureInfo.InvariantCulture));
            if (orderType == "delivery") parts.Add("توصيل");
            else if (hasTable || orderType == "dine_in") parts.Add(hasTable ? "طاولة " + sale.TableName.Trim() : "صالة");
            if (hasWaiter) parts.Add("الكابتن: " + sale.WaiterName.Trim());
            if (hasTable && sale.GuestsCount > 1) parts.Add("ضيوف: " + sale.GuestsCount.ToString(CultureInfo.InvariantCulture));
            return string.Join(" - ", parts.ToArray());
        }

        private float RenderReceiptPage(Graphics g, Sale sale, ReceiptStoreInfo store, Image logo, int contentWidth, bool isCopy)
        {
            ReceiptTotals t = ComputeReceiptTotals(sale);
            bool isPreBill = string.Equals(sale.Id, PreBillSaleId, StringComparison.Ordinal);
            bool isDelivery = string.Equals(sale.OrderType, "delivery", StringComparison.OrdinalIgnoreCase);

            using (var p = new ReceiptPainter(g, contentWidth))
            {
                // 1. ترويسة المتجر (الاسم كبير، والعنوان/الهاتف/الرقم الضريبي صغيرة)
                DrawStoreHeader(p, store, logo, true);
                p.Separator(p.Dashed, 3f, 4f);

                // 2. رقم الفاتورة + التاريخ والوقت + الكاشير (كتلة مضغوطة)
                // (إخفاء رقم الفاتورة يحذف نصّه فقط: تبقى التاريخ والوقت، ويبقى الباركود، ويبقى عنوان الحساب المبدئي)
                string invoiceText = isPreBill
                    ? "حساب مبدئي"
                    : (sale.InvoiceNumber > 0
                        ? (store.ShowInvoiceNumber ? "فاتورة رقم: " + sale.InvoiceNumber.ToString(CultureInfo.InvariantCulture) : "")
                        : "فاتورة");
                p.WrapWithSide(invoiceText, FormatReceiptDateTime(sale.CreatedAt), p.Bold, p.Small);
                if (store.ShowCashier && !string.IsNullOrWhiteSpace(sale.CashierName))
                {
                    p.WrapText("الكاشير: " + sale.CashierName.Trim(), p.Small, p.Rtl, ReceiptPainter.Pad, p.Usable);
                }

                string orderMeta = BuildOrderMetaText(sale);
                if (orderMeta.Length > 0) p.WrapText(orderMeta, p.Small, p.Rtl, ReceiptPainter.Pad, p.Usable);

                if (!isDelivery && !string.IsNullOrWhiteSpace(sale.CustomerName)
                    && !string.Equals(sale.CustomerId, GeneralCashCustomerId, StringComparison.OrdinalIgnoreCase))
                {
                    string customer = "العميل: " + sale.CustomerName.Trim();
                    if (!string.IsNullOrWhiteSpace(sale.CustomerPhone)) customer += " (" + sale.CustomerPhone.Trim() + ")";
                    p.WrapText(customer, p.Small, p.Rtl, ReceiptPainter.Pad, p.Usable);
                }

                // 3. شارات الحالة (نسخة فقط عند إعادة الطباعة)
                p.Y += 2f;
                if (isCopy) p.Badge("نسخة - إعادة طباعة");
                if (isPreBill) p.Badge("غير مدفوع - للمراجعة فقط");
                if (string.Equals(sale.Status, "TEST_PILOT", StringComparison.OrdinalIgnoreCase)) p.Badge("فاتورة تجريبية - تدريب");
                if (string.Equals(sale.Status, "cancelled", StringComparison.OrdinalIgnoreCase)) p.Badge("فاتورة ملغاة");

                p.Separator(p.Dashed, 0f, 3f);

                // 4. جدول الأصناف
                DrawReceiptLines(p, BuildSaleReceiptLines(sale));

                // 5. الإجماليات: الإجمالي قبل الخصم (مجموع الأسطر المطبوعة) ثم صف واحد لإجمالي كل الخصومات والرسوم ثم الإجمالي النهائي
                var rows = new List<KeyValuePair<string, string>>();
                if (t.DiscountTotal > 0 || t.ServiceCharge > 0 || t.DeliveryFee > 0)
                {
                    rows.Add(new KeyValuePair<string, string>("الإجمالي قبل الخصم", FormatReceiptMoney(t.Subtotal)));
                }
                if (t.DiscountTotal > 0) rows.Add(new KeyValuePair<string, string>("إجمالي الخصم", "-" + FormatReceiptMoney(t.DiscountTotal)));
                if (t.ServiceCharge > 0) rows.Add(new KeyValuePair<string, string>("خدمة الصالة", FormatReceiptMoney(t.ServiceCharge)));
                if (t.DeliveryFee > 0) rows.Add(new KeyValuePair<string, string>("رسوم التوصيل", FormatReceiptMoney(t.DeliveryFee)));

                // خط منقط يفصل الأسطر عن بنود التسوية، وبدونها يكفي الخط الغامق قبل الإجمالي النهائي (لا خط مزدوج)
                if (rows.Count > 0) p.Separator(p.Dashed, 0f, 3f);
                float colW = 0f;
                for (int i = 0; i < rows.Count; i++) colW = Math.Max(colW, p.TextW(rows[i].Value, p.Regular));
                for (int i = 0; i < rows.Count; i++) p.LabelValue(rows[i].Key, rows[i].Value, p.Regular, p.Regular, colW);

                p.Separator(p.Solid, 1f, 3f);
                p.GrandTotal("الإجمالي النهائي", FormatReceiptMoney(t.Total), "ج.م");
                if (t.Tax > 0) p.LabelValue("منها ضريبة القيمة المضافة", FormatReceiptMoney(t.Tax), p.Small, p.Small, 0f);
                if (t.EpayFee > 0)
                {
                    p.LabelValue("رسوم خدمة الدفع الإلكتروني", FormatReceiptMoney(t.EpayFee), p.Regular, p.Regular, 0f);
                    p.LabelValue("المطلوب سداده", FormatReceiptMoney(t.Payable), p.Bold, p.Bold, 0f);
                }

                // 6. المدفوعات: طرق الدفع المستخدمة فقط + الباقي + المتبقي الآجل
                if (!isPreBill && (t.Payments.Count > 0 || t.Remaining > 0))
                {
                    var payRows = new List<KeyValuePair<string, string>>();
                    bool single = t.Payments.Count == 1;
                    // إخفاء المدفوع أو الباقي يحذف صفوفه فقط؛ المودع والمتبقي الآجل يُطبعان دائماً
                    if (store.ShowPaid)
                    {
                        for (int i = 0; i < t.Payments.Count; i++)
                        {
                            string label = t.Payments[i].Label;
                            if (single) label = label == "المدفوع" ? "المدفوع" : "المدفوع (" + label + ")";
                            payRows.Add(new KeyValuePair<string, string>(label, FormatReceiptMoney(t.Payments[i].Amount)));
                        }
                        if (t.Payments.Count > 1) payRows.Add(new KeyValuePair<string, string>("إجمالي المدفوع", FormatReceiptMoney(t.Paid)));
                    }
                    if (store.ShowChange && t.Change > 0) payRows.Add(new KeyValuePair<string, string>("الباقي للعميل", FormatReceiptMoney(t.Change)));
                    if (t.Deposited > 0) payRows.Add(new KeyValuePair<string, string>("مودع في حساب العميل", FormatReceiptMoney(t.Deposited)));
                    if (t.Remaining > 0) payRows.Add(new KeyValuePair<string, string>("المتبقي (آجل على الحساب)", FormatReceiptMoney(t.Remaining)));

                    // لا خط فاصل ولا فراغ إذا لم يبقَ أي صف
                    if (payRows.Count > 0) p.Separator(p.Dashed, 2f, 3f);
                    float payColW = 0f;
                    for (int i = 0; i < payRows.Count; i++) payColW = Math.Max(payColW, p.TextW(payRows[i].Value, p.Bold));
                    for (int i = 0; i < payRows.Count; i++)
                    {
                        bool emphasis = payRows[i].Key == "الباقي للعميل" || payRows[i].Key == "إجمالي المدفوع" || payRows[i].Key.StartsWith("المتبقي", StringComparison.Ordinal);
                        Font f = emphasis ? p.Bold : p.Regular;
                        p.LabelValue(payRows[i].Key, payRows[i].Value, f, f, payColW);
                    }
                }

                // 7. بيانات التوصيل (للدليفري فقط)
                if (isDelivery)
                {
                    p.Separator(p.Solid, 3f, 3f);
                    string dCust = (sale.DeliveryInfo != null && !string.IsNullOrWhiteSpace(sale.DeliveryInfo.CustomerName))
                        ? sale.DeliveryInfo.CustomerName
                        : (!string.IsNullOrWhiteSpace(sale.CustomerName) ? sale.CustomerName : "عميل دليفري");
                    string dPhone = (sale.DeliveryInfo != null && !string.IsNullOrWhiteSpace(sale.DeliveryInfo.CustomerPhone))
                        ? sale.DeliveryInfo.CustomerPhone
                        : (sale.CustomerPhone ?? "");
                    p.WrapText("توصيل - العميل: " + dCust.Trim() + (string.IsNullOrWhiteSpace(dPhone) ? "" : " (" + dPhone.Trim() + ")"), p.Bold, p.Rtl, ReceiptPainter.Pad, p.Usable);
                    if (sale.DeliveryInfo != null)
                    {
                        if (!string.IsNullOrWhiteSpace(sale.DeliveryInfo.DeliveryAddress)) p.WrapText("العنوان: " + sale.DeliveryInfo.DeliveryAddress.Trim(), p.Small, p.Rtl, ReceiptPainter.Pad, p.Usable);
                        if (!string.IsNullOrWhiteSpace(sale.DeliveryInfo.Landmark)) p.WrapText("علامة مميزة: " + sale.DeliveryInfo.Landmark.Trim(), p.Small, p.Rtl, ReceiptPainter.Pad, p.Usable);
                        if (!string.IsNullOrWhiteSpace(sale.DeliveryInfo.Notes)) p.WrapText("ملاحظات: " + sale.DeliveryInfo.Notes.Trim(), p.Small, p.Rtl, ReceiptPainter.Pad, p.Usable);
                    }
                }

                // 8. باركود رقم الفاتورة (للبحث عنها عند المرتجع): للفاتورة الفعلية فقط، يشمل النسخة المعادة، لا الحساب المبدئي ولا التجريبية
                if (!IsTransientReceiptSale(sale)) DrawInvoiceBarcode(p, FormatInvoiceBarcodeValue(sale.InvoiceNumber), store.ShowInvoiceNumber);

                // 9. تنبيه سلسلة التبريد + ملاحظات الفاتورة + الخاتمة (إن وُجدت) + توقيع النظام
                p.Separator(p.Dashed, 3f, 3f);
                bool hasFooterBlock = false;
                if (HasColdChainItems(sale))
                {
                    p.WrapText("تنبيه: يحفظ في الثلاجة 2-8 مئوية", p.Bold, p.Center, ReceiptPainter.Pad, p.Usable);
                    p.Y += 2f;
                    hasFooterBlock = true;
                }
                if (!isPreBill && !string.IsNullOrWhiteSpace(sale.Notes))
                {
                    p.WrapText(sale.Notes, p.Small, p.Center, ReceiptPainter.Pad, p.Usable);
                    p.Y += 2f;
                    hasFooterBlock = true;
                }
                if (store.Footer.Length > 0)
                {
                    p.WrapLines(store.Footer, p.Small, p.Center, ReceiptPainter.Pad, p.Usable);
                    hasFooterBlock = true;
                }
                // بدون خاتمة ولا ملاحظات يكفي الخط الفاصل السابق: لا خط مزدوج ولا فراغ
                DrawReceiptSignature(p, store, hasFooterBlock, isPreBill ? "" : sale.Id);

                // هامش سفلي طفيف: تغذية القص (ESC d + GS V 66) تضيف المسافة الفعلية حتى الشفرة
                p.Y += ReceiptPainter.BottomPad;
                return p.Y;
            }
        }

        public PrintResult PrintReturnReceipt(
            Return returnObj,
            string printerName = null,
            int? paperWidth = null,
            bool? openDrawer = null,
            bool isCopy = false)
        {
            if (returnObj == null)
            {
                return new PrintResult { Success = false, Message = "بيانات المرتجع غير صحيحة" };
            }

            string targetPrinter = ResolvePrinterName(printerName);
            PrintResult missingReturnPrinter = CheckPrinterAvailable(targetPrinter, "المرتجع محفوظ بأمان.");
            if (missingReturnPrinter != null)
            {
                return missingReturnPrinter;
            }
            string configuredWidth = GetConfiguredPaperWidth();
            int printWidth = (paperWidth.HasValue && paperWidth.Value > 0)
                ? paperWidth.Value
                : GetContentWidthPoints(configuredWidth);

            // الدرج يُفتح فقط عند رد المبلغ نقداً (لا يُفتح للرد على حساب العميل أو المحافظ)
            bool shouldOpenDrawer = IsCashRefund(returnObj.RefundMethod)
                && (openDrawer.HasValue ? openDrawer.Value : GetConfiguredOpenDrawer());

            // إعادة طباعة إيصال سبقت طباعته تُوسم نسخة على الخادم بغض النظر عن طلب العميل
            if (!isCopy && HasPrintMarker("return", returnObj.Id, ReturnReprintAuditAction))
            {
                isCopy = true;
            }

            if (RawPrinterHelper.IsNetworkPrinter(targetPrinter))
            {
                return PrintReturnReceiptToNetwork(returnObj, targetPrinter, printWidth, shouldOpenDrawer, isCopy);
            }

            bool isThermal = IsThermalPrinter(targetPrinter, configuredWidth);
            bool autoCut = GetConfiguredAutoCut();

            try
            {
                using (var job = CreateReturnReceiptJob(returnObj, printWidth, isCopy))
                {
                    // الطابعة الحرارية المحلية: ESC/POS Raster مباشر (نفس مسار إيصال البيع) ثم ويندوز كبديل بمقاس ورق صريح
                    if (isThermal)
                    {
                        try
                        {
                            byte[] escposBytes = BuildReceiptEscPos(job, shouldOpenDrawer, autoCut);
                            string rawErr;
                            string rawTitle = string.Format("Rafiq Return #{0}", returnObj.ReturnNumber);
                            if (RawPrinterHelper.SendRawBytes(targetPrinter, escposBytes, rawTitle, out rawErr))
                            {
                                RecordPrintAudit("return", returnObj.Id, isCopy, ReturnReprintAuditAction, returnObj.ReturnNumber, targetPrinter, false, returnObj.CashierId);
                                return new PrintResult
                                {
                                    Success = true,
                                    Message = string.Format("تم إرسال {0} المرتجع #{1} إلى الطابعة بنجاح.", isCopy ? "نسخة من إيصال" : "إيصال", returnObj.ReturnNumber),
                                    PrinterUsed = targetPrinter
                                };
                            }

                            Logger.Warn(string.Format("فشل الإرسال المباشر ESC/POS لإيصال المرتجع على '{0}': {1}، جاري المحاولة عبر Windows PrintDocument.", targetPrinter, rawErr));
                        }
                        catch (Exception exRaster)
                        {
                            Logger.Warn("استثناء أثناء طباعة إيصال المرتجع بـ ESC/POS Raster: " + exRaster.Message);
                        }
                    }

                    string gdiError;
                    string docName = string.Format("إيصال مرتجع بضاعة #{0}", returnObj.ReturnNumber);
                    if (!PrintReceiptJobViaGdi(job, targetPrinter, docName, printWidth <= 210, out gdiError))
                    {
                        return new PrintResult
                        {
                            Success = false,
                            Message = gdiError,
                            PrinterUsed = targetPrinter
                        };
                    }
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
                        Logger.Warn("فشل إرسال نبضة فتح درج النقدية بعد طباعة المرتجع: " + exDrawer.Message);
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
                        Logger.Warn("فشل إرسال أمر قص الورق بعد طباعة المرتجع: " + exCut.Message);
                    }
                }

                RecordPrintAudit("return", returnObj.Id, isCopy, ReturnReprintAuditAction, returnObj.ReturnNumber, targetPrinter, false, returnObj.CashierId);

                return new PrintResult
                {
                    Success = true,
                    Message = string.Format("تم إرسال {0} المرتجع #{1} إلى الطابعة بنجاح.", isCopy ? "نسخة من إيصال" : "إيصال", returnObj.ReturnNumber),
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

        private PrintResult PrintReturnReceiptToNetwork(Return returnObj, string networkTarget, int printWidth, bool shouldOpenDrawer, bool isCopy)
        {
            try
            {
                using (var job = CreateReturnReceiptJob(returnObj, printWidth, isCopy))
                {
                    bool autoCut = GetConfiguredAutoCut();
                    byte[] escposBytes = BuildReceiptEscPos(job, shouldOpenDrawer, autoCut);

                    string errMsg;
                    string docTitle = string.Format("Rafiq Network Return #{0}", returnObj.ReturnNumber);
                    bool ok = RawPrinterHelper.SendRawBytes(networkTarget, escposBytes, docTitle, out errMsg);

                    if (ok)
                    {
                        RecordPrintAudit("return", returnObj.Id, isCopy, ReturnReprintAuditAction, returnObj.ReturnNumber, networkTarget, true, returnObj.CashierId);
                    }

                    return new PrintResult
                    {
                        Success = ok,
                        Message = ok ? string.Format("تم إرسال {0} المرتجع #{1} إلى طابعة الشبكة بنجاح.", isCopy ? "نسخة من إيصال" : "إيصال", returnObj.ReturnNumber) : ("تعذر الطباعة على طابعة الشبكة: " + errMsg),
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

        public Bitmap RenderReturnReceiptToBitmap(Return returnObj, int printWidth, bool isCopy = false)
        {
            if (returnObj == null) return null;
            using (var job = CreateReturnReceiptJob(returnObj, printWidth, isCopy))
            {
                return RenderReceiptBand(job, 0, job.PixelHeight);
            }
        }

        private ReceiptRenderJob CreateReturnReceiptJob(Return returnObj, int printWidth, bool isCopy)
        {
            ReceiptStoreInfo store = LoadReceiptStoreInfo();
            Image logo = TryLoadStoreLogo();
            return CreateReceiptJob(
                delegate(Graphics g, int width) { return RenderReturnReceiptPage(g, returnObj, store, logo, width, isCopy); },
                printWidth,
                logo);
        }

        /// <summary>هل يُرد المبلغ نقداً من الدرج (الافتراضي نقداً عند غياب الطريقة)</summary>
        public static bool IsCashRefund(string refundMethod)
        {
            return string.IsNullOrWhiteSpace(refundMethod)
                || string.Equals(refundMethod.Trim(), "cash", StringComparison.OrdinalIgnoreCase);
        }

        private float RenderReturnReceiptPage(Graphics g, Return returnObj, ReceiptStoreInfo store, Image logo, int contentWidth, bool isCopy)
        {
            using (var p = new ReceiptPainter(g, contentWidth))
            {
                DrawStoreHeader(p, store, logo, false);
                p.Separator(p.Dashed, 3f, 4f);
                p.Badge("إيصال مرتجع بضاعة");
                if (isCopy) p.Badge("نسخة - إعادة طباعة");

                // رقم المرتجع + التاريخ، ثم الفاتورة الأصلية والعميل والسبب
                p.WrapWithSide("مرتجع رقم: " + returnObj.ReturnNumber.ToString(CultureInfo.InvariantCulture), FormatReceiptDateTime(returnObj.CreatedAt), p.Bold, p.Small);
                if (returnObj.InvoiceNumber.HasValue && returnObj.InvoiceNumber.Value > 0)
                {
                    p.WrapText("الفاتورة الأصلية: " + returnObj.InvoiceNumber.Value.ToString(CultureInfo.InvariantCulture), p.Small, p.Rtl, ReceiptPainter.Pad, p.Usable);
                }
                else
                {
                    p.WrapText("مرتجع بدون فاتورة أصلية", p.Small, p.Rtl, ReceiptPainter.Pad, p.Usable);
                }
                if (!string.IsNullOrWhiteSpace(returnObj.CustomerName)) p.WrapText("العميل: " + returnObj.CustomerName.Trim(), p.Small, p.Rtl, ReceiptPainter.Pad, p.Usable);
                if (!string.IsNullOrWhiteSpace(returnObj.Reason)) p.WrapText("السبب: " + returnObj.Reason.Trim(), p.Small, p.Rtl, ReceiptPainter.Pad, p.Usable);

                p.Separator(p.Dashed, 2f, 3f);

                // جدول الأصناف المرتجعة (نفس أعمدة إيصال البيع)
                var lines = new List<ReceiptLine>();
                bool anyNetPricedLine = false;
                if (returnObj.Items != null)
                {
                    for (int i = 0; i < returnObj.Items.Count; i++)
                    {
                        ReturnItem item = returnObj.Items[i];
                        if (item == null) continue;
                        var line = new ReceiptLine();
                        line.Name = ReceiptItemNameOrDefault(item.ProductName) + (item.IsDamaged ? " (تالف)" : "");
                        line.Qty = FormatReceiptQuantityWithUnit(item.QuantityMilli, null, item.Unit);
                        line.Price = FormatReceiptMoney(item.UnitPricePiasters);
                        line.Total = FormatReceiptMoney(item.TotalPiasters);
                        if (Money.FromPiasters(item.UnitPricePiasters).MultiplyByMilliUnits(item.QuantityMilli).Piasters != item.TotalPiasters)
                        {
                            anyNetPricedLine = true;
                        }
                        lines.Add(line);
                    }
                }
                DrawReceiptLines(p, lines, anyNetPricedLine ? "الأسعار صافية بعد الخصم" : null);

                p.Separator(p.Solid, 0f, 3f);
                p.GrandTotal("إجمالي المبلغ المسترد", FormatReceiptMoney(returnObj.TotalPiasters), "ج.م");

                string refundKey = (returnObj.RefundMethod ?? "").Trim().ToLowerInvariant();
                string methodText;
                if (refundKey == "credit" || refundKey == "customer_balance") methodText = "طريقة الرد: خصم من حساب العميل";
                else if (refundKey == "instapay") methodText = "طريقة الرد: تحويل انستاباي";
                else if (refundKey == "vodafone_cash") methodText = "طريقة الرد: تحويل فودافون كاش";
                else if (refundKey == "wallet") methodText = "طريقة الرد: تحويل إلى المحفظة";
                else if (IsCashRefund(returnObj.RefundMethod)) methodText = "طريقة الرد: نقداً من الخزينة";
                else methodText = "طريقة الرد: " + returnObj.RefundMethod.Trim();
                p.WrapText(methodText, p.Regular, p.Rtl, ReceiptPainter.Pad, p.Usable);

                DrawReceiptSignature(p, store, true, returnObj.Id);

                p.Y += ReceiptPainter.BottomPad;
                return p.Y;
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
            PrintResult missingClosingPrinter = CheckPrinterAvailable(targetPrinter, "الإقفال محفوظ بأمان ويمكن إعادة طباعته لاحقاً.");
            if (missingClosingPrinter != null)
            {
                return missingClosingPrinter;
            }
            string targetWidth = paperWidth ?? GetConfiguredPaperWidth();
            int printWidth = GetContentWidthPoints(targetWidth);

            if (RawPrinterHelper.IsNetworkPrinter(targetPrinter))
            {
                return PrintDailyClosingReportToNetwork(closing, targetPrinter, targetWidth);
            }

            bool isCompact = IsCompactPaper(targetWidth);

            // الطابعة الحرارية المحلية: نفس مسار الصورة النقطية ESC/POS المستخدم في إيصال البيع (بدون هدر ورق)
            if (IsThermalPrinter(targetPrinter, targetWidth))
            {
                try
                {
                    using (var bmp = RenderDailyClosingToBitmap(closing, targetWidth))
                    {
                        if (bmp != null)
                        {
                            byte[] escposBytes = RawPrinterHelper.ConvertBitmapToEscPosRaster(bmp, false, GetConfiguredAutoCut(), GetConfiguredDrawerPulseMs(), GetConfiguredDrawerPin());
                            string rawErr;
                            string rawTitle = string.Format("Rafiq Closing #{0}", closing.ClosingNumber);
                            if (RawPrinterHelper.SendRawBytes(targetPrinter, escposBytes, rawTitle, out rawErr))
                            {
                                return new PrintResult
                                {
                                    Success = true,
                                    Message = string.Format("تم إرسال تقرير إقفال اليومية #{0} إلى الطابعة '{1}' بنجاح.", closing.ClosingNumber, targetPrinter),
                                    PrinterUsed = targetPrinter
                                };
                            }
                            Logger.Warn(string.Format("فشل الإرسال المباشر ESC/POS لتقرير الإقفال على الطابعة '{0}': {1}، جاري المحاولة عبر Windows PrintDocument.", targetPrinter, rawErr));
                        }
                    }
                }
                catch (Exception exRaster)
                {
                    Logger.Warn("استثناء أثناء طباعة تقرير الإقفال بـ ESC/POS Raster: " + exRaster.Message);
                }
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

                    doc.DefaultPageSettings.Margins = new System.Drawing.Printing.Margins(0, 0, 0, 0);
                    doc.OriginAtMargins = false;

                    if (!doc.PrinterSettings.IsValid)
                    {
                        return new PrintResult
                        {
                            Success = false,
                            Message = string.Format("الطابعة المحددة '{0}' غير صالحة أو غير مثبتة في النظام.", targetPrinter),
                            PrinterUsed = targetPrinter
                        };
                    }

                    // مقاس ورق صريح بدل الافتراضي للطابعة، والارتفاع من قياس المحتوى الفعلي
                    float measuredHeight;
                    using (var bmpMeasure = new Bitmap(10, 10))
                    using (var gMeasure = Graphics.FromImage(bmpMeasure))
                    {
                        measuredHeight = RenderDailyClosingPage(gMeasure, closing, storeName, printWidth);
                    }

                    int widthHundredths = isCompact ? 228 : 314;
                    int heightHundredths = (int)Math.Ceiling((measuredHeight / 72.0) * 100.0) + 12;
                    try
                    {
                        doc.DefaultPageSettings.PaperSize = new PaperSize("RafiqClosing", widthHundredths, heightHundredths);
                    }
                    catch { }

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

            var store = _settings != null ? _settings.GetAllSettings() : new Dictionary<string, string>();
            string storeName = store.ContainsKey("store_name") ? store["store_name"] : "متجر رفيق";

            // تمريرة قياس أولاً: الارتفاع يُحسب من عدد الصفوف الفعلي فلا يُقص التقرير مهما زادت الصفوف
            float finalY;
            using (var bmpMeasure = new Bitmap(pixelWidth, 10))
            using (var gMeasure = Graphics.FromImage(bmpMeasure))
            {
                gMeasure.ScaleTransform(scale, scale);
                gMeasure.TextRenderingHint = TextRenderingHint.SingleBitPerPixelGridFit;
                finalY = RenderDailyClosingPage(gMeasure, closing, storeName, contentWidth);
            }

            int finalPixelHeight = Math.Max(50, (int)Math.Ceiling((finalY + 12f) * scale));
            var bmpFinal = new Bitmap(pixelWidth, finalPixelHeight);
            using (var g = Graphics.FromImage(bmpFinal))
            {
                g.Clear(Color.White);
                g.ScaleTransform(scale, scale);
                g.TextRenderingHint = TextRenderingHint.SingleBitPerPixelGridFit;
                g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                g.SmoothingMode = SmoothingMode.None;
                g.PixelOffsetMode = PixelOffsetMode.Half;

                RenderDailyClosingPage(g, closing, storeName, contentWidth);
            }

            return bmpFinal;
        }

        private float RenderDailyClosingPage(Graphics g, DailyClosing closing, string storeName, int printWidth)
        {
            var store = _settings != null ? _settings.GetAllSettings() : new Dictionary<string, string>();
            bool isCompact = (printWidth <= 210);

            var fontTitle = new Font("Arial", isCompact ? 10f : 11f, FontStyle.Bold);
            var fontHeader = new Font("Arial", isCompact ? 8.5f : 9.5f, FontStyle.Bold);
            var fontBody = new Font("Arial", isCompact ? 7.5f : 8.5f, FontStyle.Regular);
            var fontBold = new Font("Arial", isCompact ? 7.5f : 8.5f, FontStyle.Bold);
            var fontSmall = new Font("Arial", isCompact ? 6.8f : 7.5f, FontStyle.Regular);

            var centerFormat = new StringFormat { Alignment = StringAlignment.Center, FormatFlags = StringFormatFlags.DirectionRightToLeft };
            var rightFormat = new StringFormat { Alignment = StringAlignment.Near, FormatFlags = StringFormatFlags.DirectionRightToLeft };
            // القيمة: اتجاه يسار-إلى-يمين بلا التفاف؛ عرضها يُقاس فلا يُقص مبلغ كبير
            var valueFormat = new StringFormat
            {
                Alignment = StringAlignment.Near,
                Trimming = StringTrimming.EllipsisCharacter,
                FormatFlags = StringFormatFlags.NoWrap
            };

            float y = 10;
            float contentWidth = printWidth;

            // يقيس ارتفاع النص بعد الالتفاف ويرسمه كاملاً ثم ينزل بالسطر (لا قص لسطر عربي طويل)
            Action<string, Font, StringFormat, float> drawBlock = delegate(string text, Font f, StringFormat fmt, float gap)
            {
                SizeF size = g.MeasureString(text, f, (int)contentWidth, fmt);
                g.DrawString(text, f, Brushes.Black, new RectangleF(0, y, contentWidth, size.Height + 1f), fmt);
                y += size.Height + gap;
            };

            // 1. Store Header
            string headerTitle = "تقرير إقفال اليومية والوردية";
            if (store.ContainsKey("doc_template_daily_closing_custom_header") && !string.IsNullOrWhiteSpace(store["doc_template_daily_closing_custom_header"]))
            {
                headerTitle = store["doc_template_daily_closing_custom_header"].Trim();
            }
            drawBlock(storeName, fontTitle, centerFormat, 3f);
            drawBlock(headerTitle, fontHeader, centerFormat, 4f);

            g.DrawLine(Pens.Black, 0, y, contentWidth, y);
            y += 6;

            // وقت الإقفال المسجّل (وليس لحظة الطباعة) كي تُظهر إعادة الطباعة الوقت الأصلي
            DateTime closedAt;
            if (string.IsNullOrWhiteSpace(closing.ClosedAt) ||
                !DateTime.TryParse(closing.ClosedAt, System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.None, out closedAt))
            {
                closedAt = DateTime.Now;
            }

            // 2. Info Block
            drawBlock(string.Format("رقم الإقفال: #{0}", closing.ClosingNumber), fontBold, rightFormat, 2f);
            drawBlock(string.Format("يوم العمل: {0}", closing.BusinessDate), fontBody, rightFormat, 2f);
            drawBlock(string.Format("الكاشير: {0}", closing.CashierName ?? "غير محدد"), fontBody, rightFormat, 2f);
            drawBlock(string.Format("وقت الإقفال: {0}", closedAt.ToString("yyyy-MM-dd HH:mm", System.Globalization.CultureInfo.InvariantCulture)), fontSmall, rightFormat, 4f);

            g.DrawLine(Pens.Black, 0, y, contentWidth, y);
            y += 8;

            // صف تسمية/قيمة: القيمة يساراً بعرضها المقاس، والتسمية يميناً تلتف في الباقي بلا تداخل
            Action<string, string, bool> drawRow = delegate(string label, string val, bool isBold)
            {
                var f = isBold ? fontBold : fontBody;
                const float margin = 2f;
                const float gutter = 6f;
                SizeF valSize = g.MeasureString(val, f, 10000, valueFormat);
                float valW = Math.Min(valSize.Width + 2f, contentWidth * 0.6f);
                float labelW = contentWidth - valW - gutter - (margin * 2f);
                SizeF labelSize = g.MeasureString(label, f, (int)labelW, rightFormat);
                float rowH = Math.Max(valSize.Height, labelSize.Height) + 1f;

                g.DrawString(val, f, Brushes.Black, new RectangleF(margin, y, valW, rowH), valueFormat);
                g.DrawString(label, f, Brushes.Black, new RectangleF(contentWidth - margin - labelW, y, labelW, rowH), rightFormat);
                y += rowH + 1f;
            };

            // 3. Sales Breakdown
            drawBlock("ملخص المبيعات والحركات", fontBold, rightFormat, 3f);

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
                        if (previewData.OpeningFloatPiasters > 0)
                        {
                            drawRow("عهدة افتتاحية بالدرج:", "+" + (previewData.OpeningFloatPiasters / 100.0).ToString("N2") + " ج.م", false);
                        }
                        if (previewData.ManualCashInPiasters > 0)
                        {
                            drawRow("إيداع نقدي يدوي بالدرج:", "+" + (previewData.ManualCashInPiasters / 100.0).ToString("N2") + " ج.م", false);
                        }
                        if (previewData.ManualCashOutPiasters > 0)
                        {
                            drawRow("سحب نقدي يدوي من الدرج:", "-" + (previewData.ManualCashOutPiasters / 100.0).ToString("N2") + " ج.م", false);
                        }
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
                        else if (previewData.EpayDrawerCashPiasters < 0)
                        {
                            drawRow("نقدية خدمات إلكترونية منصرفة:", "-" + (Math.Abs(previewData.EpayDrawerCashPiasters) / 100.0).ToString("N2") + " ج.م", false);
                        }
                        if (previewData.EpayDrawerFundingPiasters > 0)
                        {
                            drawRow("تغذية ماكينة دفع من الدرج:", "-" + (previewData.EpayDrawerFundingPiasters / 100.0).ToString("N2") + " ج.م", false);
                        }
                        if (previewData.WalletsDrawerCashPiasters > 0)
                        {
                            drawRow("نقدية محافظ بالدرج:", "+" + (previewData.WalletsDrawerCashPiasters / 100.0).ToString("N2") + " ج.م", false);
                        }
                        else if (previewData.WalletsDrawerCashPiasters < 0)
                        {
                            drawRow("نقدية منصرفة لمحافظ/إنستاباي:", "-" + (Math.Abs(previewData.WalletsDrawerCashPiasters) / 100.0).ToString("N2") + " ج.م", false);
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
            drawBlock("جرد النقدية والخزينة", fontBold, rightFormat, 3f);

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

            string closingFooter = store.ContainsKey("doc_template_daily_closing_custom_footer") && !string.IsNullOrWhiteSpace(store["doc_template_daily_closing_custom_footer"])
                ? store["doc_template_daily_closing_custom_footer"].Trim()
                : null;
            if (!string.IsNullOrEmpty(closingFooter))
            {
                drawBlock(closingFooter, fontSmall, centerFormat, 3f);
            }

            bool showClosingSignatures = !store.ContainsKey("doc_template_daily_closing_show_signatures") || store["doc_template_daily_closing_show_signatures"] != "0";
            if (showClosingSignatures)
            {
                y += 6;
                drawBlock("توقيع كاشير الوردية: __________________", fontSmall, rightFormat, 2f);
                drawBlock("اعتماد المشرف المالي: __________________", fontSmall, rightFormat, 4f);
            }

            drawBlock("سجل إقفال رسمي ومختوم رقمياً • لا يُعدّل بعد الحفظ", fontSmall, centerFormat, 3f);
            drawBlock("نظام رفيق لنقاط البيع وإدارة المتاجر", fontSmall, centerFormat, 6f);

            return y;
        }

        private string ResolvePrinterName(string explicitPrinter)
        {
            string configured = _settings != null ? _settings.Get("default_printer_name", "") : "";
            List<string> installed = ReadInstalledPrinterNames();
            if (installed == null)
            {
                // تعذر سرد الطابعات من ويندوز: السلوك القديم بدل حجب الطباعة بسبب قراءة فاشلة
                if (!string.IsNullOrWhiteSpace(explicitPrinter)) return explicitPrinter;
                if (!string.IsNullOrWhiteSpace(configured)) return configured;
                return ReadWindowsDefaultPrinter();
            }

            PrinterResolution resolution = PrinterNameResolver.Resolve(explicitPrinter, configured, installed, ReadWindowsDefaultPrinter());
            if (resolution.FellBack)
            {
                Logger.Warn(string.Format("الطابعة المحفوظة '{0}' غير مثبتة، تم استخدام طابعة ويندوز الافتراضية '{1}'.", configured, resolution.Name));
            }
            return resolution.Name;
        }

        private static List<string> ReadInstalledPrinterNames()
        {
            try
            {
                List<string> names = new List<string>();
                foreach (string printer in PrinterSettings.InstalledPrinters)
                {
                    names.Add(printer);
                }
                return names;
            }
            catch (Exception ex)
            {
                Logger.Warn("تعذر قراءة قائمة الطابعات: " + ex.Message);
                return null;
            }
        }

        private static string ReadWindowsDefaultPrinter()
        {
            try
            {
                return new PrinterSettings().PrinterName ?? "";
            }
            catch
            {
                return "";
            }
        }

        /// <summary>
        /// حالة الطابعات للواجهة قبل الطباعة: لا طابعة فعلية يعني التحويل مباشرة إلى حفظ التقرير كملف.
        /// </summary>
        public PrinterStatusInfo GetPrinterStatus()
        {
            string configured = _settings != null ? (_settings.Get("default_printer_name", "") ?? "").Trim() : "";
            List<string> installed = ReadInstalledPrinterNames();
            if (installed == null)
            {
                // القراءة فشلت: لا نمنع المحاولة، والتعامل مع فشل الطباعة يتم بعدها
                return new PrinterStatusInfo { HasPrinter = true, PrinterCount = 0, DefaultPrinter = ReadWindowsDefaultPrinter(), ConfiguredPrinter = configured, ConfiguredFound = true };
            }

            return new PrinterStatusInfo
            {
                HasPrinter = PrinterNameResolver.CountRealPrinters(installed) > 0 || RawPrinterHelper.IsNetworkPrinter(configured),
                PrinterCount = installed.Count,
                DefaultPrinter = ReadWindowsDefaultPrinter(),
                ConfiguredPrinter = configured,
                ConfiguredFound = configured.Length == 0 || RawPrinterHelper.IsNetworkPrinter(configured) || PrinterNameResolver.ContainsPrinter(installed, configured)
            };
        }

        /// <summary>
        /// null عندما تكون الطابعة صالحة (مثبتة أو عنوان شبكة)، وإلا نتيجة فاشلة برمز PRINTER_NOT_FOUND ورسالة عربية واضحة.
        /// </summary>
        private PrintResult CheckPrinterAvailable(string printerName, string documentHint)
        {
            if (RawPrinterHelper.IsNetworkPrinter(printerName)) return null;

            List<string> installed = ReadInstalledPrinterNames();
            if (installed == null) return null;

            if (string.IsNullOrWhiteSpace(printerName))
            {
                return new PrintResult
                {
                    Success = false,
                    ErrorCode = "PRINTER_NOT_FOUND",
                    Message = "لا توجد طابعة مثبتة على هذا الجهاز. ثبّت تعريف الطابعة أو اختر طابعة من إعدادات الطباعة. " + documentHint
                };
            }

            if (!PrinterNameResolver.ContainsPrinter(installed, printerName))
            {
                return new PrintResult
                {
                    Success = false,
                    ErrorCode = "PRINTER_NOT_FOUND",
                    PrinterUsed = printerName,
                    Message = string.Format("الطابعة '{0}' غير موجودة على هذا الجهاز أو غير مثبتة. تأكد من تشغيلها وتثبيت تعريفها أو اختر طابعة أخرى من إعدادات الطباعة. {1}", printerName, documentHint)
                };
            }
            return null;
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

        #region EPay & Digital Wallet Silent Thermal Printing

        /// <summary>
        /// طباعة إيصال خدمات وماكينات الدفع الإلكتروني (فوري، أمان، محافظ، إنستاباي)
        /// طباعة حرارية صامتة ومباشرة بدون فتح نافذة طباعة الويندوز (Zero OS Dialogs)
        /// </summary>
        public PrintResult PrintEpayReceipt(EpayTransaction tx, string printerName = null, string paperWidth = null)
        {
            if (tx == null)
            {
                return new PrintResult { Success = false, Message = "بيانات إيصال الدفع الإلكتروني فارغة" };
            }

            string targetPrinter = ResolvePrinterName(printerName);
            string targetWidth = paperWidth ?? GetConfiguredPaperWidth();
            int printWidth = GetContentWidthPoints(targetWidth);

            if (RawPrinterHelper.IsNetworkPrinter(targetPrinter))
            {
                return PrintEpayReceiptToNetwork(tx, targetPrinter, targetWidth);
            }

            if (IsThermalPrinter(targetPrinter, targetWidth))
            {
                try
                {
                    using (var bmp = RenderEpayReceiptToBitmap(tx, targetWidth))
                    {
                        if (bmp != null)
                        {
                            byte[] escposBytes = RawPrinterHelper.ConvertBitmapToEscPosRaster(bmp, false, GetConfiguredAutoCut(), GetConfiguredDrawerPulseMs(), GetConfiguredDrawerPin());
                            string rawErr;
                            string rawTitle = string.Format("Rafiq EPay #{0}", !string.IsNullOrEmpty(tx.ReferenceNumber) ? tx.ReferenceNumber : (!string.IsNullOrEmpty(tx.Id) && tx.Id.Length >= 8 ? tx.Id.Substring(0, 8) : "Receipt"));
                            if (RawPrinterHelper.SendRawBytes(targetPrinter, escposBytes, rawTitle, out rawErr))
                            {
                                return new PrintResult
                                {
                                    Success = true,
                                    Message = string.Format("تم إرسال إيصال الدفع الإلكتروني إلى الطابعة '{0}' بنجاح.", targetPrinter),
                                    PrinterUsed = targetPrinter
                                };
                            }
                            Logger.Warn(string.Format("فشل الإرسال المباشر ESC/POS لإيصال الدفع الإلكتروني على الطابعة '{0}': {1}، جاري المحاولة عبر Windows PrintDocument.", targetPrinter, rawErr));
                        }
                    }
                }
                catch (Exception exRaster)
                {
                    Logger.Warn("استثناء أثناء طباعة إيصال الدفع الإلكتروني بـ ESC/POS Raster: " + exRaster.Message);
                }
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
                    doc.DocumentName = string.Format("Rafiq EPay #{0}", !string.IsNullOrEmpty(tx.ReferenceNumber) ? tx.ReferenceNumber : "Receipt");
                    doc.PrintController = new StandardPrintController();

                    doc.PrintPage += delegate(object sender, PrintPageEventArgs e)
                    {
                        RenderEpayReceiptPage(e.Graphics, tx, storeName, printWidth);
                        e.HasMorePages = false;
                    };

                    doc.Print();
                }

                return new PrintResult
                {
                    Success = true,
                    Message = string.Format("تمت طباعة إيصال الدفع الإلكتروني على الطابعة '{0}' بنجاح.", targetPrinter),
                    PrinterUsed = targetPrinter
                };
            }
            catch (Exception ex)
            {
                Logger.Error("فشل طباعة إيصال الدفع الإلكتروني عبر PrintDocument: " + ex.Message, ex);
                return new PrintResult
                {
                    Success = false,
                    Message = "خطأ أثناء الطباعة: " + ex.Message,
                    PrinterUsed = targetPrinter
                };
            }
        }

        private PrintResult PrintEpayReceiptToNetwork(EpayTransaction tx, string networkTarget, string paperWidth)
        {
            try
            {
                using (var bmp = RenderEpayReceiptToBitmap(tx, paperWidth))
                {
                    if (bmp == null)
                    {
                        return new PrintResult { Success = false, Message = "فشل توليد صورة إيصال الدفع الإلكتروني للطباعة الشبكية.", PrinterUsed = networkTarget };
                    }

                    bool autoCut = GetConfiguredAutoCut();
                    byte[] escposBytes = RawPrinterHelper.ConvertBitmapToEscPosRaster(bmp, false, autoCut);

                    string errMsg;
                    string docTitle = string.Format("Rafiq Network EPay #{0}", !string.IsNullOrEmpty(tx.ReferenceNumber) ? tx.ReferenceNumber : "Receipt");
                    bool ok = RawPrinterHelper.SendRawBytes(networkTarget, escposBytes, docTitle, out errMsg);

                    return new PrintResult
                    {
                        Success = ok,
                        Message = ok ? "تم إرسال إيصال الدفع الإلكتروني إلى طابعة الشبكة بنجاح." : ("تعذر الطباعة على طابعة الشبكة: " + errMsg),
                        PrinterUsed = networkTarget
                    };
                }
            }
            catch (Exception ex)
            {
                Logger.Error("استثناء أثناء طباعة إيصال الدفع الإلكتروني على طابعة الشبكة: " + ex.Message, ex);
                return new PrintResult { Success = false, Message = "خطأ في الاتصال بطابعة الشبكة: " + ex.Message, PrinterUsed = networkTarget };
            }
        }

        public Bitmap RenderEpayReceiptToBitmap(EpayTransaction tx, string paperWidth = null)
        {
            if (tx == null) return null;
            string targetWidth = paperWidth ?? GetConfiguredPaperWidth();
            bool isCompact = IsCompactPaper(targetWidth);
            int contentWidth = GetContentWidthPoints(targetWidth);

            int pixelWidth = isCompact ? 384 : 576;
            float scale = (float)pixelWidth / (float)contentWidth;

            var store = _settings != null ? _settings.GetAllSettings() : new Dictionary<string, string>();
            string storeName = store.ContainsKey("store_name") ? store["store_name"] : "متجر رفيق";

            float finalY;
            using (var bmpMeasure = new Bitmap(pixelWidth, 10))
            using (var gMeasure = Graphics.FromImage(bmpMeasure))
            {
                gMeasure.ScaleTransform(scale, scale);
                gMeasure.TextRenderingHint = TextRenderingHint.SingleBitPerPixelGridFit;
                finalY = RenderEpayReceiptPage(gMeasure, tx, storeName, contentWidth);
            }

            int finalPixelHeight = Math.Max(50, (int)Math.Ceiling((finalY + 14f) * scale));
            var bmpFinal = new Bitmap(pixelWidth, finalPixelHeight);
            using (var g = Graphics.FromImage(bmpFinal))
            {
                g.Clear(Color.White);
                g.ScaleTransform(scale, scale);
                g.TextRenderingHint = TextRenderingHint.SingleBitPerPixelGridFit;
                g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                g.SmoothingMode = SmoothingMode.None;
                g.PixelOffsetMode = PixelOffsetMode.Half;

                RenderEpayReceiptPage(g, tx, storeName, contentWidth);
            }

            return bmpFinal;
        }

        private float RenderEpayReceiptPage(Graphics g, EpayTransaction tx, string storeName, int printWidth)
        {
            bool isCompact = (printWidth <= 210);

            var fontTitle = new Font("Arial", isCompact ? 10f : 11f, FontStyle.Bold);
            var fontHeader = new Font("Arial", isCompact ? 8.5f : 9.5f, FontStyle.Bold);
            var fontBody = new Font("Arial", isCompact ? 7.5f : 8.5f, FontStyle.Regular);
            var fontBold = new Font("Arial", isCompact ? 7.5f : 8.5f, FontStyle.Bold);
            var fontTotal = new Font("Arial", isCompact ? 10f : 11.5f, FontStyle.Bold);
            var fontSmall = new Font("Arial", isCompact ? 6.8f : 7.5f, FontStyle.Regular);

            var centerFormat = new StringFormat { Alignment = StringAlignment.Center, FormatFlags = StringFormatFlags.DirectionRightToLeft };
            var rightFormat = new StringFormat { Alignment = StringAlignment.Near, FormatFlags = StringFormatFlags.DirectionRightToLeft };
            var valueFormat = new StringFormat
            {
                Alignment = StringAlignment.Near,
                Trimming = StringTrimming.EllipsisCharacter,
                FormatFlags = StringFormatFlags.NoWrap
            };

            float y = 10;
            float contentWidth = printWidth;

            Action<string, Font, StringFormat, float> drawBlock = delegate(string text, Font f, StringFormat fmt, float gap)
            {
                SizeF size = g.MeasureString(text, f, (int)contentWidth, fmt);
                g.DrawString(text, f, Brushes.Black, new RectangleF(0, y, contentWidth, size.Height + 1f), fmt);
                y += size.Height + gap;
            };

            Action<string, string, bool> drawRow = delegate(string label, string val, bool isBold)
            {
                var f = isBold ? fontBold : fontBody;
                const float margin = 2f;
                const float gutter = 6f;
                SizeF valSize = g.MeasureString(val, f, 10000, valueFormat);
                float valW = Math.Min(valSize.Width + 2f, contentWidth * 0.6f);
                float labelW = contentWidth - valW - gutter - (margin * 2f);
                SizeF labelSize = g.MeasureString(label, f, (int)labelW, rightFormat);
                float rowH = Math.Max(valSize.Height, labelSize.Height) + 1f;

                g.DrawString(val, f, Brushes.Black, new RectangleF(margin, y, valW, rowH), valueFormat);
                g.DrawString(label, f, Brushes.Black, new RectangleF(contentWidth - margin - labelW, y, labelW, rowH), rightFormat);
                y += rowH + 1f;
            };

            Action<string, string> drawTotalRow = delegate(string label, string val)
            {
                const float margin = 2f;
                const float gutter = 6f;
                SizeF valSize = g.MeasureString(val, fontTotal, 10000, valueFormat);
                float valW = Math.Min(valSize.Width + 2f, contentWidth * 0.6f);
                float labelW = contentWidth - valW - gutter - (margin * 2f);
                SizeF labelSize = g.MeasureString(label, fontTotal, (int)labelW, rightFormat);
                float rowH = Math.Max(valSize.Height, labelSize.Height) + 2f;

                g.DrawString(val, fontTotal, Brushes.Black, new RectangleF(margin, y, valW, rowH), valueFormat);
                g.DrawString(label, fontTotal, Brushes.Black, new RectangleF(contentWidth - margin - labelW, y, labelW, rowH), rightFormat);
                y += rowH + 2f;
            };

            // 1. Header
            drawBlock(storeName, fontTitle, centerFormat, 3f);
            drawBlock("إيصال خدمة دفع إلكتروني", fontHeader, centerFormat, 4f);

            g.DrawLine(Pens.Black, 0, y, contentWidth, y);
            y += 6;

            // 2. Info
            DateTime txDate;
            if (string.IsNullOrWhiteSpace(tx.CreatedAt) ||
                !DateTime.TryParse(tx.CreatedAt, CultureInfo.InvariantCulture, DateTimeStyles.None, out txDate))
            {
                txDate = DateTime.Now;
            }
            else if (txDate.Kind == DateTimeKind.Utc)
            {
                txDate = txDate.ToLocalTime();
            }

            string refNum = !string.IsNullOrWhiteSpace(tx.ReferenceNumber) ? tx.ReferenceNumber : (!string.IsNullOrEmpty(tx.Id) && tx.Id.Length >= 8 ? tx.Id.Substring(0, 8).ToUpper() : "—");
            drawRow("رقم العملية / المرجع:", refNum, true);
            drawRow("التاريخ والوقت:", txDate.ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture), false);

            if (!string.IsNullOrWhiteSpace(tx.TerminalName))
            {
                drawRow("الماكينة / الحساب:", tx.TerminalName, false);
            }
            if (!string.IsNullOrWhiteSpace(tx.ServiceName))
            {
                drawRow("نوع الخدمة:", tx.ServiceName, true);
            }
            if (!string.IsNullOrWhiteSpace(tx.CustomerPhone))
            {
                drawRow("رقم الهاتف:", tx.CustomerPhone, false);
            }
            if (!string.IsNullOrWhiteSpace(tx.CustomerName))
            {
                drawRow("اسم العميل:", tx.CustomerName, false);
            }
            if (!string.IsNullOrWhiteSpace(tx.CashierName))
            {
                drawRow("الكاشير:", tx.CashierName, false);
            }

            g.DrawLine(Pens.Black, 0, y, contentWidth, y);
            y += 6;

            // 3. Financial breakdown
            bool isCashOut = string.Equals(tx.ServiceType, "cash_out", StringComparison.OrdinalIgnoreCase);
            string billLabel = isCashOut ? "1. مبلغ السحب النقدي:" : "1. قيمة الفاتورة / الرصيد:";
            drawRow(billLabel, FormatReceiptMoney(tx.BillAmountPiasters) + " ج.م", false);
            if (tx.ProviderCommissionPiasters > 0)
            {
                drawRow("2. عمولة الماكينة:", FormatReceiptMoney(tx.ProviderCommissionPiasters) + " ج.م", false);
            }
            if (tx.CustomerFeePiasters > 0)
            {
                drawRow("3. رسوم خدمة المحل:", FormatReceiptMoney(tx.CustomerFeePiasters) + " ج.م", false);
            }

            using (var pDashed = new Pen(Color.Black, 1f))
            {
                pDashed.DashStyle = DashStyle.Dash;
                g.DrawLine(pDashed, 0, y, contentWidth, y);
            }
            y += 6;

            string totalLabel = isCashOut ? "إجمالي العملية / المطلوب:" : "إجمالي المطلوب من الزبون:";
            drawTotalRow(totalLabel, FormatReceiptMoney(tx.TotalReceivedPiasters) + " ج.م");

            g.DrawLine(Pens.Black, 0, y, contentWidth, y);
            y += 6;

            // 4. Footer
            drawBlock("شكراً لتعاملكم معنا!", fontBody, centerFormat, 2f);
            drawBlock("احتفظ بهذا الإيصال للرجوع إليه عند الحاجة", fontSmall, centerFormat, 4f);

            return y;
        }

        /// <summary>
        /// طباعة إيصال معاملات المحافظ الإلكترونية وإنستاباي (فودافون كاش، أورنج، اتصالات، وي باي، إنستاباي)
        /// طباعة حرارية صامتة ومباشرة بدون فتح نافذة طباعة الويندوز (Zero OS Dialogs)
        /// </summary>
        public PrintResult PrintDigitalTransactionReceipt(DigitalTransaction tx, string printerName = null, string paperWidth = null)
        {
            if (tx == null)
            {
                return new PrintResult { Success = false, Message = "بيانات إيصال المحفظة فارغة" };
            }

            string targetPrinter = ResolvePrinterName(printerName);
            string targetWidth = paperWidth ?? GetConfiguredPaperWidth();
            int printWidth = GetContentWidthPoints(targetWidth);

            if (RawPrinterHelper.IsNetworkPrinter(targetPrinter))
            {
                return PrintDigitalTransactionReceiptToNetwork(tx, targetPrinter, targetWidth);
            }

            if (IsThermalPrinter(targetPrinter, targetWidth))
            {
                try
                {
                    using (var bmp = RenderDigitalTransactionToBitmap(tx, targetWidth))
                    {
                        if (bmp != null)
                        {
                            byte[] escposBytes = RawPrinterHelper.ConvertBitmapToEscPosRaster(bmp, false, GetConfiguredAutoCut(), GetConfiguredDrawerPulseMs(), GetConfiguredDrawerPin());
                            string rawErr;
                            string rawTitle = string.Format("Rafiq Wallet #{0}", !string.IsNullOrEmpty(tx.ReferenceNumber) ? tx.ReferenceNumber : (!string.IsNullOrEmpty(tx.Id) && tx.Id.Length >= 8 ? tx.Id.Substring(0, 8) : "Receipt"));
                            if (RawPrinterHelper.SendRawBytes(targetPrinter, escposBytes, rawTitle, out rawErr))
                            {
                                return new PrintResult
                                {
                                    Success = true,
                                    Message = string.Format("تم إرسال إيصال المحفظة إلى الطابعة '{0}' بنجاح.", targetPrinter),
                                    PrinterUsed = targetPrinter
                                };
                            }
                            Logger.Warn(string.Format("فشل الإرسال المباشر ESC/POS لإيصال المحفظة على الطابعة '{0}': {1}، جاري المحاولة عبر Windows PrintDocument.", targetPrinter, rawErr));
                        }
                    }
                }
                catch (Exception exRaster)
                {
                    Logger.Warn("استثناء أثناء طباعة إيصال المحفظة بـ ESC/POS Raster: " + exRaster.Message);
                }
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
                    doc.DocumentName = string.Format("Rafiq Wallet #{0}", !string.IsNullOrEmpty(tx.ReferenceNumber) ? tx.ReferenceNumber : "Receipt");
                    doc.PrintController = new StandardPrintController();

                    doc.PrintPage += delegate(object sender, PrintPageEventArgs e)
                    {
                        RenderDigitalTransactionPage(e.Graphics, tx, storeName, printWidth);
                        e.HasMorePages = false;
                    };

                    doc.Print();
                }

                return new PrintResult
                {
                    Success = true,
                    Message = string.Format("تمت طباعة إيصال المحفظة على الطابعة '{0}' بنجاح.", targetPrinter),
                    PrinterUsed = targetPrinter
                };
            }
            catch (Exception ex)
            {
                Logger.Error("فشل طباعة إيصال المحفظة عبر PrintDocument: " + ex.Message, ex);
                return new PrintResult
                {
                    Success = false,
                    Message = "خطأ أثناء الطباعة: " + ex.Message,
                    PrinterUsed = targetPrinter
                };
            }
        }

        private PrintResult PrintDigitalTransactionReceiptToNetwork(DigitalTransaction tx, string networkTarget, string paperWidth)
        {
            try
            {
                using (var bmp = RenderDigitalTransactionToBitmap(tx, paperWidth))
                {
                    if (bmp == null)
                    {
                        return new PrintResult { Success = false, Message = "فشل توليد صورة إيصال المحفظة للطباعة الشبكية.", PrinterUsed = networkTarget };
                    }

                    bool autoCut = GetConfiguredAutoCut();
                    byte[] escposBytes = RawPrinterHelper.ConvertBitmapToEscPosRaster(bmp, false, autoCut);

                    string errMsg;
                    string docTitle = string.Format("Rafiq Network Wallet #{0}", !string.IsNullOrEmpty(tx.ReferenceNumber) ? tx.ReferenceNumber : "Receipt");
                    bool ok = RawPrinterHelper.SendRawBytes(networkTarget, escposBytes, docTitle, out errMsg);

                    return new PrintResult
                    {
                        Success = ok,
                        Message = ok ? "تم إرسال إيصال المحفظة إلى طابعة الشبكة بنجاح." : ("تعذر الطباعة على طابعة الشبكة: " + errMsg),
                        PrinterUsed = networkTarget
                    };
                }
            }
            catch (Exception ex)
            {
                Logger.Error("استثناء أثناء طباعة إيصال المحفظة على طابعة الشبكة: " + ex.Message, ex);
                return new PrintResult { Success = false, Message = "خطأ في الاتصال بطابعة الشبكة: " + ex.Message, PrinterUsed = networkTarget };
            }
        }

        public Bitmap RenderDigitalTransactionToBitmap(DigitalTransaction tx, string paperWidth = null)
        {
            if (tx == null) return null;
            string targetWidth = paperWidth ?? GetConfiguredPaperWidth();
            bool isCompact = IsCompactPaper(targetWidth);
            int contentWidth = GetContentWidthPoints(targetWidth);

            int pixelWidth = isCompact ? 384 : 576;
            float scale = (float)pixelWidth / (float)contentWidth;

            var store = _settings != null ? _settings.GetAllSettings() : new Dictionary<string, string>();
            string storeName = store.ContainsKey("store_name") ? store["store_name"] : "متجر رفيق";

            float finalY;
            using (var bmpMeasure = new Bitmap(pixelWidth, 10))
            using (var gMeasure = Graphics.FromImage(bmpMeasure))
            {
                gMeasure.ScaleTransform(scale, scale);
                gMeasure.TextRenderingHint = TextRenderingHint.SingleBitPerPixelGridFit;
                finalY = RenderDigitalTransactionPage(gMeasure, tx, storeName, contentWidth);
            }

            int finalPixelHeight = Math.Max(50, (int)Math.Ceiling((finalY + 14f) * scale));
            var bmpFinal = new Bitmap(pixelWidth, finalPixelHeight);
            using (var g = Graphics.FromImage(bmpFinal))
            {
                g.Clear(Color.White);
                g.ScaleTransform(scale, scale);
                g.TextRenderingHint = TextRenderingHint.SingleBitPerPixelGridFit;
                g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                g.SmoothingMode = SmoothingMode.None;
                g.PixelOffsetMode = PixelOffsetMode.Half;

                RenderDigitalTransactionPage(g, tx, storeName, contentWidth);
            }

            return bmpFinal;
        }

        private float RenderDigitalTransactionPage(Graphics g, DigitalTransaction tx, string storeName, int printWidth)
        {
            bool isCompact = (printWidth <= 210);

            var fontTitle = new Font("Arial", isCompact ? 10f : 11f, FontStyle.Bold);
            var fontHeader = new Font("Arial", isCompact ? 8.5f : 9.5f, FontStyle.Bold);
            var fontBody = new Font("Arial", isCompact ? 7.5f : 8.5f, FontStyle.Regular);
            var fontBold = new Font("Arial", isCompact ? 7.5f : 8.5f, FontStyle.Bold);
            var fontTotal = new Font("Arial", isCompact ? 10f : 11.5f, FontStyle.Bold);
            var fontSmall = new Font("Arial", isCompact ? 6.8f : 7.5f, FontStyle.Regular);

            var centerFormat = new StringFormat { Alignment = StringAlignment.Center, FormatFlags = StringFormatFlags.DirectionRightToLeft };
            var rightFormat = new StringFormat { Alignment = StringAlignment.Near, FormatFlags = StringFormatFlags.DirectionRightToLeft };
            var valueFormat = new StringFormat
            {
                Alignment = StringAlignment.Near,
                Trimming = StringTrimming.EllipsisCharacter,
                FormatFlags = StringFormatFlags.NoWrap
            };

            float y = 10;
            float contentWidth = printWidth;

            Action<string, Font, StringFormat, float> drawBlock = delegate(string text, Font f, StringFormat fmt, float gap)
            {
                SizeF size = g.MeasureString(text, f, (int)contentWidth, fmt);
                g.DrawString(text, f, Brushes.Black, new RectangleF(0, y, contentWidth, size.Height + 1f), fmt);
                y += size.Height + gap;
            };

            Action<string, string, bool> drawRow = delegate(string label, string val, bool isBold)
            {
                var f = isBold ? fontBold : fontBody;
                const float margin = 2f;
                const float gutter = 6f;
                SizeF valSize = g.MeasureString(val, f, 10000, valueFormat);
                float valW = Math.Min(valSize.Width + 2f, contentWidth * 0.6f);
                float labelW = contentWidth - valW - gutter - (margin * 2f);
                SizeF labelSize = g.MeasureString(label, f, (int)labelW, rightFormat);
                float rowH = Math.Max(valSize.Height, labelSize.Height) + 1f;

                g.DrawString(val, f, Brushes.Black, new RectangleF(margin, y, valW, rowH), valueFormat);
                g.DrawString(label, f, Brushes.Black, new RectangleF(contentWidth - margin - labelW, y, labelW, rowH), rightFormat);
                y += rowH + 1f;
            };

            Action<string, string> drawTotalRow = delegate(string label, string val)
            {
                const float margin = 2f;
                const float gutter = 6f;
                SizeF valSize = g.MeasureString(val, fontTotal, 10000, valueFormat);
                float valW = Math.Min(valSize.Width + 2f, contentWidth * 0.6f);
                float labelW = contentWidth - valW - gutter - (margin * 2f);
                SizeF labelSize = g.MeasureString(label, fontTotal, (int)labelW, rightFormat);
                float rowH = Math.Max(valSize.Height, labelSize.Height) + 2f;

                g.DrawString(val, fontTotal, Brushes.Black, new RectangleF(margin, y, valW, rowH), valueFormat);
                g.DrawString(label, fontTotal, Brushes.Black, new RectangleF(contentWidth - margin - labelW, y, labelW, rowH), rightFormat);
                y += rowH + 2f;
            };

            // 1. Header
            drawBlock(storeName, fontTitle, centerFormat, 3f);
            drawBlock("إيصال معاملة محفظة إلكترونية", fontHeader, centerFormat, 4f);

            g.DrawLine(Pens.Black, 0, y, contentWidth, y);
            y += 6;

            // 2. Info
            DateTime txDate;
            if (string.IsNullOrWhiteSpace(tx.CreatedAt) ||
                !DateTime.TryParse(tx.CreatedAt, CultureInfo.InvariantCulture, DateTimeStyles.None, out txDate))
            {
                txDate = DateTime.Now;
            }
            else if (txDate.Kind == DateTimeKind.Utc)
            {
                txDate = txDate.ToLocalTime();
            }

            string txNum = !string.IsNullOrWhiteSpace(tx.ReferenceNumber) ? tx.ReferenceNumber : (!string.IsNullOrEmpty(tx.Id) && tx.Id.Length >= 8 ? tx.Id.Substring(0, 8).ToUpper() : "—");
            drawRow("رقم المعاملة:", txNum, true);
            drawRow("التاريخ والوقت:", txDate.ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture), false);

            if (!string.IsNullOrWhiteSpace(tx.AccountName))
            {
                drawRow("المحفظة / الحساب:", tx.AccountName, true);
            }

            string txTypeStr = tx.TxTypeArabic;
            if (string.IsNullOrWhiteSpace(txTypeStr))
            {
                if (tx.TxType == "cash_out") txTypeStr = "سحب نقدي من محفظة";
                else if (tx.TxType == "cash_in") txTypeStr = "إيداع نقدي في محفظة";
                else if (tx.TxType == "funding") txTypeStr = "شحن وتغذية رصيد";
                else if (tx.TxType == "customer_debt_payment") txTypeStr = "سداد آجل عميل";
                else if (tx.TxType == "pos_sale") txTypeStr = "مبيعات كاشير";
                else txTypeStr = tx.TxType ?? "معاملة محفظة";
            }
            drawRow("نوع العملية:", txTypeStr, true);

            if (!string.IsNullOrWhiteSpace(tx.CustomerPhone))
            {
                drawRow("رقم الهاتف:", tx.CustomerPhone, false);
            }
            if (!string.IsNullOrWhiteSpace(tx.CustomerName))
            {
                drawRow("اسم العميل:", tx.CustomerName, false);
            }
            if (!string.IsNullOrWhiteSpace(tx.CashierName))
            {
                drawRow("الكاشير:", tx.CashierName, false);
            }

            g.DrawLine(Pens.Black, 0, y, contentWidth, y);
            y += 6;

            // 3. Financial breakdown
            drawRow("مبلغ العملية:", FormatReceiptMoney(tx.AmountPiasters) + " ج.م", false);
            if (tx.ProfitPiasters > 0)
            {
                drawRow("عمولة / ربح الخدمة:", FormatReceiptMoney(tx.ProfitPiasters) + " ج.م", false);
            }

            using (var pDashed = new Pen(Color.Black, 1f))
            {
                pDashed.DashStyle = DashStyle.Dash;
                g.DrawLine(pDashed, 0, y, contentWidth, y);
            }
            y += 6;

            long totalAmt = tx.TotalCollectedPiasters > 0 ? tx.TotalCollectedPiasters : tx.AmountPiasters;
            string totalLabel = tx.TxType == "cash_out" ? "المطلوب استلامه من العميل:" : "إجمالي المعاملة:";
            drawTotalRow(totalLabel, FormatReceiptMoney(totalAmt) + " ج.م");

            g.DrawLine(Pens.Black, 0, y, contentWidth, y);
            y += 6;

            // 4. Footer
            drawBlock("شكراً لتعاملكم معنا!", fontBody, centerFormat, 2f);
            drawBlock("احتفظ بهذا الإيصال للرجوع إليه عند الحاجة", fontSmall, centerFormat, 4f);

            return y;
        }

        #endregion

        #region Emergency Master Recovery Key Voucher Printing

        /// <summary>
        /// تحميل صورة ختم الأمان المشفر المعتمد (الدرع وشعار الأمان) من الملفات المتاحة
        /// </summary>
        private Image TryLoadSecuritySealImage()
        {
            try
            {
                string baseDir = AppDomain.CurrentDomain.BaseDirectory;
                string[] candidates = new string[]
                {
                    Path.Combine(baseDir, "security_seal.png"),
                    Path.Combine(baseDir, "Resources", "security_seal.png"),
                    Path.Combine(baseDir, "dist", "security_seal.png"),
                    Path.Combine(baseDir, "wwwroot", "security_seal.png"),
                    Path.Combine(baseDir, "branding", "security_seal.png")
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
            catch (Exception ex)
            {
                Logger.Warn("تعذر تحميل صورة ختم الأمان للطباعة: " + ex.Message);
            }
            return null;
        }

        /// <summary>
        /// طباعة وثيقة أمان استرجاع البيانات المعتمدة مباشرة على الطابعة الحرارية (بدون فتح نوافذ المتصفح)
        /// </summary>
        public PrintResult PrintRecoveryVoucher(RecoveryVoucherRequest request, string printerName = null, string paperWidth = null)
        {
            if (request == null || string.IsNullOrWhiteSpace(request.RecoveryCode))
            {
                return new PrintResult { Success = false, Message = "بيانات كود الاسترجاع فارغة." };
            }

            string targetPrinter = ResolvePrinterName(printerName ?? request.PrinterName);
            string targetWidth = paperWidth ?? request.PaperWidth ?? GetConfiguredPaperWidth();
            int printWidth = GetContentWidthPoints(targetWidth);

            if (RawPrinterHelper.IsNetworkPrinter(targetPrinter))
            {
                return PrintRecoveryVoucherToNetwork(request, targetPrinter, targetWidth);
            }

            bool isThermal = IsThermalPrinter(targetPrinter, targetWidth);
            bool autoCut = GetConfiguredAutoCut();

            if (isThermal)
            {
                try
                {
                    using (var bmp = RenderRecoveryVoucherToBitmap(request, targetWidth))
                    {
                        if (bmp != null)
                        {
                            byte[] escposBytes = RawPrinterHelper.ConvertBitmapToEscPosRaster(bmp, false, autoCut);
                            string rawErr;
                            string rawTitle = "Rafiq Emergency Recovery Key";
                            if (RawPrinterHelper.SendRawBytes(targetPrinter, escposBytes, rawTitle, out rawErr))
                            {
                                return new PrintResult
                                {
                                    Success = true,
                                    Message = string.Format("تم إرسال كارت أمان استرجاع البيانات إلى الطابعة '{0}' بنجاح.", targetPrinter),
                                    PrinterUsed = targetPrinter
                                };
                            }
                            Logger.Warn(string.Format("فشل الإرسال المباشر ESC/POS لكارت الأمان على الطابعة '{0}': {1}، جاري المحاولة عبر Windows PrintDocument.", targetPrinter, rawErr));
                        }
                    }
                }
                catch (Exception exRaster)
                {
                    Logger.Warn("استثناء أثناء طباعة كارت الأمان بـ ESC/POS Raster: " + exRaster.Message);
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
                    doc.DocumentName = "Rafiq Emergency Recovery Key";
                    doc.PrintController = new StandardPrintController();

                    doc.PrintPage += delegate(object sender, PrintPageEventArgs e)
                    {
                        e.Graphics.TextRenderingHint = TextRenderingHint.SingleBitPerPixelGridFit;
                        e.Graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
                        e.Graphics.SmoothingMode = SmoothingMode.None;
                        e.Graphics.PixelOffsetMode = PixelOffsetMode.Half;

                        RenderRecoveryVoucherPage(e.Graphics, request, printWidth);
                        e.HasMorePages = false;
                    };

                    doc.Print();
                }

                if (autoCut)
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
                    Message = string.Format("تم إرسال كارت أمان استرجاع البيانات إلى الطابعة '{0}' بنجاح.", targetPrinter),
                    PrinterUsed = targetPrinter
                };
            }
            catch (Exception ex)
            {
                Logger.Error(string.Format("فشل طباعة كارت الأمان: {0}", ex.Message), ex);
                return new PrintResult
                {
                    Success = false,
                    Message = "خطأ أثناء الطباعة: " + ex.Message,
                    PrinterUsed = targetPrinter
                };
            }
        }

        private PrintResult PrintRecoveryVoucherToNetwork(RecoveryVoucherRequest request, string networkTarget, string paperWidth)
        {
            try
            {
                using (var bmp = RenderRecoveryVoucherToBitmap(request, paperWidth))
                {
                    if (bmp == null)
                    {
                        return new PrintResult { Success = false, Message = "فشل توليد صورة كارت الأمان للطباعة الشبكية.", PrinterUsed = networkTarget };
                    }

                    bool autoCut = GetConfiguredAutoCut();
                    byte[] escposBytes = RawPrinterHelper.ConvertBitmapToEscPosRaster(bmp, false, autoCut);

                    string errMsg;
                    string docTitle = "Rafiq Network Recovery Key";
                    bool ok = RawPrinterHelper.SendRawBytes(networkTarget, escposBytes, docTitle, out errMsg);

                    return new PrintResult
                    {
                        Success = ok,
                        Message = ok ? "تم إرسال كارت الأمان إلى طابعة الشبكة بنجاح." : ("تعذر الطباعة على طابعة الشبكة: " + errMsg),
                        PrinterUsed = networkTarget
                    };
                }
            }
            catch (Exception ex)
            {
                Logger.Error("استثناء أثناء طباعة كارت الأمان على طابعة الشبكة: " + ex.Message, ex);
                return new PrintResult { Success = false, Message = "خطأ في الاتصال بطابعة الشبكة: " + ex.Message, PrinterUsed = networkTarget };
            }
        }

        public Bitmap RenderRecoveryVoucherToBitmap(RecoveryVoucherRequest request, string paperWidth = null)
        {
            if (request == null) return null;
            string targetWidth = paperWidth ?? request.PaperWidth ?? GetConfiguredPaperWidth();
            bool isCompact = IsCompactPaper(targetWidth);
            int contentWidth = GetContentWidthPoints(targetWidth);

            int pixelWidth = isCompact ? 384 : 576;
            float scale = (float)pixelWidth / (float)contentWidth;

            // تمريرة قياس أولاً لتحديد الارتفاع المطلوب بدقة متناهية
            float finalY;
            using (var bmpMeasure = new Bitmap(pixelWidth, 10))
            using (var gMeasure = Graphics.FromImage(bmpMeasure))
            {
                gMeasure.ScaleTransform(scale, scale);
                gMeasure.TextRenderingHint = TextRenderingHint.SingleBitPerPixelGridFit;
                finalY = RenderRecoveryVoucherPage(gMeasure, request, contentWidth);
            }

            int finalPixelHeight = Math.Max(50, (int)Math.Ceiling((finalY + 14f) * scale));
            var bmpFinal = new Bitmap(pixelWidth, finalPixelHeight);
            using (var g = Graphics.FromImage(bmpFinal))
            {
                g.Clear(Color.White);
                g.ScaleTransform(scale, scale);
                g.TextRenderingHint = TextRenderingHint.SingleBitPerPixelGridFit;
                g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                g.SmoothingMode = SmoothingMode.None;
                g.PixelOffsetMode = PixelOffsetMode.Half;

                RenderRecoveryVoucherPage(g, request, contentWidth);
            }

            return bmpFinal;
        }

        private float RenderRecoveryVoucherPage(Graphics g, RecoveryVoucherRequest request, int contentWidth)
        {
            bool isCompact = (contentWidth <= 210);

            Font fontStore = new Font("Arial", isCompact ? 10f : 12f, FontStyle.Bold);
            Font fontSub = new Font("Arial", isCompact ? 7.5f : 8.5f, FontStyle.Regular);
            Font fontDocTitle = new Font("Arial", isCompact ? 9f : 10.5f, FontStyle.Bold);
            Font fontBanner = new Font("Arial", isCompact ? 7.5f : 8.5f, FontStyle.Bold);
            Font fontMetaLabel = new Font("Arial", isCompact ? 7f : 8f, FontStyle.Regular);
            Font fontMetaVal = new Font("Arial", isCompact ? 7f : 8f, FontStyle.Bold);
            Font fontKeyTitle = new Font("Arial", isCompact ? 8.5f : 9.5f, FontStyle.Bold);
            Font fontKeyCode = new Font("Courier New", isCompact ? 11f : 13f, FontStyle.Bold);
            Font fontBarcodeText = new Font("Courier New", isCompact ? 7f : 8f, FontStyle.Regular);
            Font fontNoticeTitle = new Font("Arial", isCompact ? 8f : 9f, FontStyle.Bold);
            Font fontNoticeBody = new Font("Arial", isCompact ? 6.8f : 7.5f, FontStyle.Regular);
            Font fontSig = new Font("Arial", isCompact ? 7.5f : 8.5f, FontStyle.Bold);
            Font fontFooter = new Font("Arial", isCompact ? 7f : 8f, FontStyle.Regular);
            Font fontFooterBold = new Font("Arial", isCompact ? 7.5f : 8.5f, FontStyle.Bold);

            StringFormat centerFormat = new StringFormat();
            centerFormat.Alignment = StringAlignment.Center;
            centerFormat.LineAlignment = StringAlignment.Center;

            StringFormat rightFormat = new StringFormat();
            rightFormat.Alignment = StringAlignment.Near;
            rightFormat.LineAlignment = StringAlignment.Center;
            rightFormat.FormatFlags = StringFormatFlags.DirectionRightToLeft;

            StringFormat leftFormat = new StringFormat();
            leftFormat.Alignment = StringAlignment.Far;
            leftFormat.LineAlignment = StringAlignment.Center;

            Pen penSolid = new Pen(Color.Black, 1.5f);
            Pen penThin = new Pen(Color.Black, 1f);
            Pen penDashed = new Pen(Color.Black, 1f);
            penDashed.DashStyle = DashStyle.Dash;

            float y = 4f;
            float margin = 4f;
            float usableWidth = contentWidth - margin * 2;

            // 1. Logo (if available)
            using (Image logo = TryLoadStoreLogo())
            {
                if (logo != null && logo.Width > 0 && logo.Height > 0)
                {
                    float maxW = isCompact ? 90f : 130f;
                    float maxH = isCompact ? 36f : 48f;
                    float scale = Math.Min(maxW / logo.Width, maxH / logo.Height);
                    float drawW = logo.Width * scale;
                    float drawH = logo.Height * scale;
                    g.DrawImage(logo, (contentWidth - drawW) / 2f, y, drawW, drawH);
                    y += drawH + 3f;
                }
            }

            // 2. Store Name
            string sName = !string.IsNullOrWhiteSpace(request.StoreName) ? request.StoreName : (_settings != null ? _settings.Get("store_name", "رفيق لإدارة المتاجر ونقاط البيع") : "رفيق لإدارة المتاجر ونقاط البيع");
            g.DrawString(sName, fontStore, Brushes.Black, new RectangleF(margin, y, usableWidth, isCompact ? 16f : 20f), centerFormat);
            y += isCompact ? 16f : 20f;

            g.DrawString("نظام رفيق لإدارة المتاجر ونقاط البيع", fontSub, Brushes.Black, new RectangleF(margin, y, usableWidth, 14f), centerFormat);
            y += 14f;

            if (!string.IsNullOrWhiteSpace(request.Phone))
            {
                g.DrawString("هاتف: " + request.Phone.Trim(), fontSub, Brushes.Black, new RectangleF(margin, y, usableWidth, 13f), centerFormat);
                y += 14f;
            }

            // Solid Divider
            g.DrawLine(penSolid, margin, y, margin + usableWidth, y);
            y += 4f;

            // 3. Document Title
            g.DrawString("وثيقة أمان استرجاع البيانات المعتمدة", fontDocTitle, Brushes.Black, new RectangleF(margin, y, usableWidth, isCompact ? 16f : 18f), centerFormat);
            y += isCompact ? 18f : 20f;

            // Inverted banner
            float bannerH = isCompact ? 16f : 18f;
            g.FillRectangle(Brushes.Black, margin, y, usableWidth, bannerH);
            g.DrawString("★ سري للغاية — يُحفظ في مكان آمن ومحمي ★", fontBanner, Brushes.White, new RectangleF(margin, y, usableWidth, bannerH), centerFormat);
            y += bannerH + 5f;

            // Dashed Divider
            g.DrawLine(penDashed, margin, y, margin + usableWidth, y);
            y += 4f;

            // 4. Metadata rows
            string issueDt = !string.IsNullOrWhiteSpace(request.IssueDate) ? request.IssueDate : DateTime.Now.ToString("yyyy/MM/dd hh:mm:ss tt");
            string stName = !string.IsNullOrWhiteSpace(request.StationName) ? request.StationName : (_settings != null ? _settings.Get("station_name", "محطة الكاشير الرئيسية (POS-01)") : "محطة الكاشير الرئيسية (POS-01)");

            Action<string, string> drawMetaRow = delegate(string label, string val)
            {
                float rowH = 14f;
                g.DrawString(label, fontMetaLabel, Brushes.Black, new RectangleF(margin, y, usableWidth / 2f, rowH), rightFormat);
                g.DrawString(val, fontMetaVal, Brushes.Black, new RectangleF(margin + usableWidth / 2f, y, usableWidth / 2f, rowH), leftFormat);
                y += rowH;
            };

            drawMetaRow("تاريخ الإصدار:", issueDt);
            drawMetaRow("المحطة / الجهاز:", stName);
            drawMetaRow("مستوى الأمان:", "تشفير آمن فائق الحماية");
            drawMetaRow("جهة الاعتماد:", "المالك الرئيسي للنظام");

            y += 2f;
            g.DrawLine(penDashed, margin, y, margin + usableWidth, y);
            y += 5f;

            // 5. Recovery Code Box
            g.DrawString("كود الاسترجاع المعتمد لمنشأتك:", fontKeyTitle, Brushes.Black, new RectangleF(margin, y, usableWidth, 16f), centerFormat);
            y += 17f;

            float keyBoxH = isCompact ? 28f : 32f;
            RectangleF keyBoxRect = new RectangleF(margin + 4f, y, usableWidth - 8f, keyBoxH);
            g.FillRectangle(Brushes.WhiteSmoke, keyBoxRect);
            g.DrawRectangle(penSolid, keyBoxRect.X, keyBoxRect.Y, keyBoxRect.Width, keyBoxRect.Height);
            g.DrawString(request.RecoveryCode, fontKeyCode, Brushes.Black, keyBoxRect, centerFormat);
            y += keyBoxH + 5f;

            // 6. Barcode
            string cleanCode = request.RecoveryCode.Trim();
            string barcodeBits = BarcodeGenerator.EncodeCode128(cleanCode);
            if (!string.IsNullOrEmpty(barcodeBits))
            {
                int quietModules = 10;
                int totalModules = barcodeBits.Length + 2 * quietModules;
                int moduleDots = Math.Max(1, (int)(usableWidth / totalModules));
                float barcodeTotalW = barcodeBits.Length * moduleDots;
                float barcodeLeft = (contentWidth - barcodeTotalW) / 2f;
                float barcodeH = isCompact ? 22f : 28f;

                for (int b = 0; b < barcodeBits.Length; b++)
                {
                    if (barcodeBits[b] == '1')
                    {
                        g.FillRectangle(Brushes.Black, barcodeLeft + b * moduleDots, y, moduleDots, barcodeH);
                    }
                }
                y += barcodeH + 2f;

                g.DrawString("* " + cleanCode + " *", fontBarcodeText, Brushes.Black, new RectangleF(margin, y, usableWidth, 12f), centerFormat);
                y += 14f;
            }

            // Dashed Divider
            g.DrawLine(penDashed, margin, y, margin + usableWidth, y);
            y += 5f;

            // 7. Security Notice Box
            float noticeBoxPad = 4f;
            float noticeInnerW = usableWidth - noticeBoxPad * 2;
            string noticeText = "• هذا الكود هو المفتاح الرئيسي الوحيد لفك تشفير واسترجاع قاعدة بيانات المحل عند تلف القرص الصلب أو تعطل الكمبيوتر.\n• احتفظ بهذه الورقة في خزانة حديدية أو مكان آمن تماماً خارج هذا الجهاز.\n• يُحظر مشاركة هذا الرمز مع الكاشيرات أو أي طرف غير مخول؛ ولا يُطلب إلا بمعرفة المالك شخصياً والدعم الفني المعتمد لرفيق.";
            SizeF noticeSize = g.MeasureString(noticeText, fontNoticeBody, (int)noticeInnerW, rightFormat);
            float noticeBoxH = noticeSize.Height + 22f;

            RectangleF noticeRect = new RectangleF(margin, y, usableWidth, noticeBoxH);
            g.FillRectangle(Brushes.WhiteSmoke, noticeRect);
            g.DrawRectangle(penThin, noticeRect.X, noticeRect.Y, noticeRect.Width, noticeRect.Height);

            g.DrawString("تنبيه أمان بالغ الأهمية:", fontNoticeTitle, Brushes.Black, new RectangleF(margin + noticeBoxPad, y + 3f, noticeInnerW, 16f), rightFormat);
            g.DrawString(noticeText, fontNoticeBody, Brushes.Black, new RectangleF(margin + noticeBoxPad, y + 19f, noticeInnerW, noticeSize.Height + 2f), rightFormat);
            y += noticeBoxH + 5f;

            // Dashed Divider
            g.DrawLine(penDashed, margin, y, margin + usableWidth, y);
            y += 5f;

            // 8. Signatures
            float colW = usableWidth / 2f;
            g.DrawString("توقيع المالك / المسؤول", fontSig, Brushes.Black, new RectangleF(margin + colW, y, colW, 14f), centerFormat);
            g.DrawString("الختم المعتمد", fontSig, Brushes.Black, new RectangleF(margin, y, colW, 14f), centerFormat);
            y += 28f;
            g.DrawLine(penThin, margin + colW + 15f, y, margin + usableWidth - 15f, y);
            g.DrawLine(penThin, margin + 15f, y, margin + colW - 15f, y);
            y += 6f;

            // 9. Security Seal / Security Emblem Image (صورة تعبر عن الأمان زي اللي في الفاتورة)
            g.DrawLine(penDashed, margin, y, margin + usableWidth, y);
            y += 5f;

            using (Image sealImg = TryLoadSecuritySealImage())
            {
                if (sealImg != null && sealImg.Width > 0 && sealImg.Height > 0)
                {
                    float sealMaxW = usableWidth * 0.90f;
                    float sealMaxH = isCompact ? 42f : 54f;
                    float sealScale = Math.Min(sealMaxW / sealImg.Width, sealMaxH / sealImg.Height);
                    float drawSealW = sealImg.Width * sealScale;
                    float drawSealH = sealImg.Height * sealScale;
                    g.DrawImage(sealImg, (contentWidth - drawSealW) / 2f, y, drawSealW, drawSealH);
                    y += drawSealH + 5f;
                }
                else
                {
                    float fallbackH = 32f;
                    RectangleF fbRect = new RectangleF(margin + 6f, y, usableWidth - 12f, fallbackH);
                    g.DrawRectangle(penThin, fbRect.X, fbRect.Y, fbRect.Width, fbRect.Height);
                    g.DrawString("بياناتك في أمان.. ورفيق هو الضمان !", fontDocTitle, Brushes.Black, fbRect, centerFormat);
                    y += fallbackH + 5f;
                }
            }

            // 10. Footer
            g.DrawLine(penSolid, margin, y, margin + usableWidth, y);
            y += 4f;

            g.DrawString("رفيق للأنظمة والحلول البرمجية", fontFooterBold, Brushes.Black, new RectangleF(margin, y, usableWidth, 14f), centerFormat);
            y += 14f;

            g.DrawString("للدعم الفني والاستفسار: 01097782965", fontFooter, Brushes.Black, new RectangleF(margin, y, usableWidth, 13f), centerFormat);
            y += 13f;

            g.DrawString("بياناتك في أمان تام • نظام رفيق", fontFooter, Brushes.Black, new RectangleF(margin, y, usableWidth, 13f), centerFormat);
            y += 15f;

            // Clean up created pens & fonts
            fontStore.Dispose();
            fontSub.Dispose();
            fontDocTitle.Dispose();
            fontBanner.Dispose();
            fontMetaLabel.Dispose();
            fontMetaVal.Dispose();
            fontKeyTitle.Dispose();
            fontKeyCode.Dispose();
            fontBarcodeText.Dispose();
            fontNoticeTitle.Dispose();
            fontNoticeBody.Dispose();
            fontSig.Dispose();
            fontFooter.Dispose();
            fontFooterBold.Dispose();

            centerFormat.Dispose();
            rightFormat.Dispose();
            leftFormat.Dispose();

            penSolid.Dispose();
            penThin.Dispose();
            penDashed.Dispose();

            return y;
        }

        #endregion
    }
}
