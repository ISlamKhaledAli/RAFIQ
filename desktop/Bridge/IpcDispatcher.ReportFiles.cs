using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using Newtonsoft.Json.Linq;
using RafiqPOS.Common;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Bridge
{
    /// <summary>
    /// حفظ التقارير كملفات عندما تتعذر الطباعة: PDF بنفس تنسيق الطباعة، أو HTML مستقل، أو صورة الإيصال.
    /// كل الملفات تذهب إلى مجلد ثابت يحدده الخادم (المستندات\RafiqPOS\Reports) والواجهة لا ترسل مساراً أبداً.
    /// </summary>
    public partial class IpcDispatcher
    {
        private const int PdfRenderTimeoutMs = 60000;

        // يستبدله الاختبار بمجلد مؤقت عبر الانعكاس
        private static ReportFileService _reportFiles = new ReportFileService(null);

        private static bool TryDispatchReportFiles(BridgeRequest request, out BridgeResponse response)
        {
            response = null;
            switch (request.Action)
            {
                case "report:getPrinterStatus":
                    if (DatabaseService.Printer == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "PRINTER_ERROR", "خدمة الطباعة غير مهيأة.");
                        return true;
                    }
                    response = BridgeResponse.Ok(request.Id, DatabaseService.Printer.GetPrinterStatus());
                    return true;

                case "report:savePdf":
                    response = HandleSaveReportPdf(request);
                    return true;

                case "report:saveFile":
                    response = HandleSaveReportFile(request);
                    return true;

                case "report:openFolder":
                    response = HandleOpenReportsFolder(request);
                    return true;

                case "printer:saveReceiptImage":
                    response = HandleSaveReceiptImage(request);
                    return true;

                default:
                    return false;
            }
        }

        private static BridgeResponse ToSaveResponse(string requestId, ReportSaveResult saved)
        {
            if (!saved.Success)
            {
                return BridgeResponse.Fail(requestId, saved.ErrorCode ?? "SAVE_FAILED", saved.Message);
            }
            return BridgeResponse.Ok(requestId, new
            {
                path = saved.FilePath,
                folder = saved.FolderPath,
                fileName = saved.FileName,
                sizeBytes = saved.SizeBytes
            });
        }

        private static BridgeResponse HandleSaveReportPdf(BridgeRequest request)
        {
            JObject payload = request.Payload as JObject;
            string reportName = payload != null ? ReadPayloadString(payload, "reportName") : null;
            bool landscape = payload != null && (ReadPayloadBool(payload, "landscape") ?? false);

            if (RafiqPOS.MainForm.Instance == null)
            {
                return BridgeResponse.Fail(request.Id, "MAIN_FORM_NOT_READY", "النافذة الرئيسية غير جاهزة لإنشاء ملف PDF.");
            }

            string renderError;
            byte[] pdf = RafiqPOS.MainForm.Instance.RenderPagePdf(landscape, PdfRenderTimeoutMs, out renderError);
            if (pdf == null)
            {
                return BridgeResponse.Fail(request.Id, "PDF_FAILED", renderError ?? "تعذر إنشاء ملف PDF.");
            }
            return ToSaveResponse(request.Id, _reportFiles.Save(reportName, "pdf", pdf));
        }

        private static BridgeResponse HandleSaveReportFile(BridgeRequest request)
        {
            JObject payload = request.Payload as JObject;
            if (payload == null)
            {
                return BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات الملف المراد حفظه فارغة.");
            }

            string reportName = ReadPayloadString(payload, "reportName");
            string extension = ReadPayloadString(payload, "extension");
            if (ReportFileService.NormalizeExtension(extension) == null)
            {
                return BridgeResponse.Fail(request.Id, "INVALID_EXTENSION", "نوع الملف غير مدعوم للحفظ.");
            }

            byte[] bytes;
            string base64 = ReadPayloadString(payload, "base64");
            string content = payload["content"] != null && payload["content"].Type == JTokenType.String ? payload["content"].ToString() : null;
            try
            {
                if (base64 != null)
                {
                    bytes = Convert.FromBase64String(base64);
                }
                else if (!string.IsNullOrEmpty(content))
                {
                    // BOM ليعرض المتصفح العربية صحيحة حتى بدون وسم الترميز
                    UTF8Encoding utf8 = new UTF8Encoding(true);
                    byte[] preamble = utf8.GetPreamble();
                    byte[] body = utf8.GetBytes(content);
                    bytes = new byte[preamble.Length + body.Length];
                    Buffer.BlockCopy(preamble, 0, bytes, 0, preamble.Length);
                    Buffer.BlockCopy(body, 0, bytes, preamble.Length, body.Length);
                }
                else
                {
                    bytes = null;
                }
            }
            catch (FormatException)
            {
                return BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "محتوى الملف غير صالح.");
            }

            return ToSaveResponse(request.Id, _reportFiles.Save(reportName, extension, bytes));
        }

        private static BridgeResponse HandleOpenReportsFolder(BridgeRequest request)
        {
            List<string> folders = _reportFiles.GetCandidateFolders();
            for (int i = 0; i < folders.Count; i++)
            {
                if (!Directory.Exists(folders[i])) continue;
                try
                {
                    System.Diagnostics.Process.Start("explorer.exe", "\"" + folders[i] + "\"");
                    return BridgeResponse.Ok(request.Id, new { success = true, folder = folders[i] });
                }
                catch (Exception ex)
                {
                    Logger.Warn("تعذر فتح مجلد التقارير: " + ex.Message);
                    return BridgeResponse.Fail(request.Id, "OPEN_FOLDER_FAILED", "تعذر فتح مجلد التقارير: " + ex.Message);
                }
            }
            return BridgeResponse.Fail(request.Id, "FOLDER_NOT_FOUND", "لم يُحفظ أي تقرير بعد، لذلك لا يوجد مجلد لفتحه.");
        }

        /// <summary>
        /// بديل الحفظ لإيصال البيع عند فشل الطابعة: نفس الصورة التي تُرسل للطابعة الحرارية تُحفظ PNG.
        /// الفاتورة تُحمّل من قاعدة البيانات بمعرفها فقط، ولا يُوثق بأي مبالغ من الواجهة.
        /// </summary>
        private static BridgeResponse HandleSaveReceiptImage(BridgeRequest request)
        {
            JObject payload = request.Payload as JObject;
            string saleId = payload != null ? ReadPayloadString(payload, "saleId") : null;
            if (saleId == null)
            {
                return BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "رقم الفاتورة المراد حفظ إيصالها مطلوب.");
            }
            if (DatabaseService.Printer == null || DatabaseService.Sales == null)
            {
                return BridgeResponse.Fail(request.Id, "PRINTER_ERROR", "خدمة الطباعة غير مهيأة.");
            }

            Sale sale = DatabaseService.Sales.GetSaleById(saleId);
            if (sale == null)
            {
                return BridgeResponse.Fail(request.Id, "SALE_NOT_FOUND", "لم يتم العثور على الفاتورة المطلوب حفظ إيصالها.");
            }
            string validationError;
            if (!PrinterService.TryValidateSaleForPrint(sale, out validationError))
            {
                return BridgeResponse.Fail(request.Id, "INVALID_SALE", validationError);
            }

            byte[] png;
            try
            {
                using (System.Drawing.Bitmap bmp = DatabaseService.Printer.RenderReceiptToBitmap(sale, null, false))
                using (MemoryStream ms = new MemoryStream())
                {
                    if (bmp == null)
                    {
                        return BridgeResponse.Fail(request.Id, "RENDER_FAILED", "تعذر رسم الإيصال.");
                    }
                    bmp.Save(ms, System.Drawing.Imaging.ImageFormat.Png);
                    png = ms.ToArray();
                }
            }
            catch (Exception ex)
            {
                Logger.Error("تعذر رسم إيصال الفاتورة للحفظ كصورة: ", ex);
                return BridgeResponse.Fail(request.Id, "RENDER_FAILED", "تعذر رسم الإيصال: " + ex.Message);
            }

            string name = "إيصال_فاتورة_" + sale.InvoiceNumber.ToString(System.Globalization.CultureInfo.InvariantCulture);
            return ToSaveResponse(request.Id, _reportFiles.Save(name, "png", png));
        }
    }
}
