using System;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using RafiqPOS.Common;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Bridge
{
    public partial class IpcDispatcher
    {
        private static bool TryDispatchPrinting(BridgeRequest request, out BridgeResponse response)
        {
            response = null;
            switch (request.Action)
            {
                case "printer:getList":
                case "printer:list":
                    var printers = DatabaseService.Printer.GetInstalledPrinters();
                    response = BridgeResponse.Ok(request.Id, printers);
                    return true;

                case "printer:test":
                case "printer:testPrint":
                    string tPrinter = null;
                    string tWidth = null;
                    JObject tPayload = request.Payload as JObject;
                    if (tPayload != null)
                    {
                        if (tPayload["printerName"] != null) tPrinter = tPayload["printerName"].ToString();
                        if (tPayload["paperWidth"] != null) tWidth = tPayload["paperWidth"].ToString();
                    }
                    var testPrintResult = DatabaseService.Printer.PrintTestReceipt(tPrinter, tWidth);
                    response = ToPrintResponse(request.Id, testPrintResult);
                    return true;

                case "barcode:printLabel":
                case "barcode:printLabels":
                case "printer:printLabels":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات ملصقات الباركود فارغة");
                        return true;
                    }
                    var labelReq = JsonConvert.DeserializeObject<PrintLabelsRequest>(request.Payload.ToString());
                    var labelResult = DatabaseService.BarcodeLabels.PrintLabels(labelReq);
                    if (labelResult.Success)
                    {
                        response = BridgeResponse.Ok(request.Id, labelResult);
                    }
                    else
                    {
                        response = BridgeResponse.Fail(request.Id, "PRINT_FAILED", labelResult.Message);
                    }
                    return true;

                case "printer:testLabel":
                    string testLabelPrinter = null;
                    string testPaperSize = "38x25";
                    int testCustomW = 0;
                    int testCustomH = 0;
                    JObject testLabelPayload = request.Payload as JObject;
                    if (testLabelPayload != null)
                    {
                        if (testLabelPayload["printerName"] != null) testLabelPrinter = testLabelPayload["printerName"].ToString();
                        if (testLabelPayload["paperSize"] != null) testPaperSize = testLabelPayload["paperSize"].ToString();
                        if (testLabelPayload["customWidthMm"] != null) int.TryParse(testLabelPayload["customWidthMm"].ToString(), out testCustomW);
                        if (testLabelPayload["customHeightMm"] != null) int.TryParse(testLabelPayload["customHeightMm"].ToString(), out testCustomH);
                    }
                    var testLabelRes = DatabaseService.BarcodeLabels.PrintTestLabel(testLabelPrinter, testPaperSize, testCustomW, testCustomH);
                    if (testLabelRes.Success)
                    {
                        response = BridgeResponse.Ok(request.Id, testLabelRes);
                    }
                    else
                    {
                        response = BridgeResponse.Fail(request.Id, "PRINT_FAILED", testLabelRes.Message);
                    }
                    return true;

                case "printer:printReceipt":
                    response = HandlePrintReceipt(request);
                    return true;

                case "printer:kickDrawer":
                    string kickPrinter = null;
                    int? kickPulse = null;
                    int? kickPin = null;
                    JObject kdPayload = request.Payload as JObject;
                    if (kdPayload != null)
                    {
                        if (kdPayload["printerName"] != null) kickPrinter = kdPayload["printerName"].ToString();
                        if (kdPayload["pulseMs"] != null)
                        {
                            int pVal;
                            if (int.TryParse(kdPayload["pulseMs"].ToString(), out pVal)) kickPulse = pVal;
                        }
                        if (kdPayload["pin"] != null)
                        {
                            int pPin;
                            if (int.TryParse(kdPayload["pin"].ToString(), out pPin)) kickPin = pPin;
                        }
                    }
                    var kickRes = DatabaseService.Printer.KickDrawer(kickPrinter, kickPulse, kickPin);
                    response = ToPrintResponse(request.Id, kickRes);
                    return true;

                case "printer:cutPaper":
                    string cutPrinter = null;
                    JObject cpPayload = request.Payload as JObject;
                    if (cpPayload != null && cpPayload["printerName"] != null)
                    {
                        cutPrinter = cpPayload["printerName"].ToString();
                    }
                    var cutRes = DatabaseService.Printer.CutPaper(cutPrinter);
                    response = ToPrintResponse(request.Id, cutRes);
                    return true;

                case "printer:printDosageLabel":
                case "pharma:printDosageLabel":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات ملصق الجرعة فارغة.");
                        return true;
                    }
                    try
                    {
                        var dosageReq = JsonConvert.DeserializeObject<DosageLabelRequest>(request.Payload.ToString());
                        var dosageRes = DatabaseService.Printer.PrintDosageLabel(dosageReq);
                        if (dosageRes.Success)
                        {
                            response = BridgeResponse.Ok(request.Id, dosageRes);
                        }
                        else
                        {
                            response = BridgeResponse.Fail(request.Id, "PRINT_FAILED", dosageRes.Message);
                        }
                    }
                    catch (Exception ex)
                    {
                        response = BridgeResponse.Fail(request.Id, "PRINT_FAILED", ex.Message);
                    }
                    return true;

                default:
                    return false;
            }
        }

        private static BridgeResponse ToPrintResponse(string requestId, PrintResult result)
        {
            if (result == null)
            {
                return BridgeResponse.Fail(requestId, "PRINT_FAILED", "تعذر تنفيذ أمر الطباعة (لم تصل نتيجة من خدمة الطباعة).");
            }
            if (!result.Success)
            {
                string message = string.IsNullOrWhiteSpace(result.Message) ? "فشل أمر الطباعة." : result.Message;
                return BridgeResponse.Fail(requestId, "PRINT_FAILED", message, new { printerUsed = result.PrinterUsed });
            }
            return BridgeResponse.Ok(requestId, result);
        }

        private static string ReadPayloadString(JObject payload, string key)
        {
            JToken token = payload[key];
            if (token == null || token.Type == JTokenType.Null) return null;
            string value = token.ToString();
            return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
        }

        private static bool? ReadPayloadBool(JObject payload, string key)
        {
            JToken token = payload[key];
            if (token == null || token.Type == JTokenType.Null) return null;
            if (token.Type == JTokenType.Boolean) return token.Value<bool>();
            bool parsed;
            if (bool.TryParse(token.ToString(), out parsed)) return parsed;
            return null;
        }

        /// <summary>
        /// printer:printReceipt: الفاتورة المخزنة تُحمّل من قاعدة البيانات بواسطة saleId (لا يُوثق بالمبالغ القادمة من العميل)،
        /// ونسخة/أصل الإيصال تُحدد في الخادم. الكائن الكامل مقبول فقط للشيك المبدئي وفواتير التدريب.
        /// </summary>
        private static BridgeResponse HandlePrintReceipt(BridgeRequest request)
        {
            JObject payload = request.Payload as JObject;
            if (payload == null)
            {
                return BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات الفاتورة المراد طباعتها فارغة أو غير صالحة");
            }
            if (DatabaseService.Printer == null)
            {
                return BridgeResponse.Fail(request.Id, "PRINTER_ERROR", "خدمة الطباعة غير مهيأة.");
            }

            string printerName = ReadPayloadString(payload, "printerName");
            string paperWidth = ReadPayloadString(payload, "paperWidth");
            bool? openDrawer = ReadPayloadBool(payload, "openDrawer");
            bool clientIsCopy = ReadPayloadBool(payload, "isCopy") ?? false;

            Sale sale = null;
            string saleId = ReadPayloadString(payload, "saleId");
            bool isTransient = false;

            if (saleId != null)
            {
                sale = DatabaseService.Sales != null ? DatabaseService.Sales.GetSaleById(saleId) : null;
                if (sale == null)
                {
                    return BridgeResponse.Fail(request.Id, "SALE_NOT_FOUND", "لم يتم العثور على الفاتورة المطلوب طباعتها.");
                }
            }
            else
            {
                JToken saleToken = payload["sale"];
                Sale clientSale;
                try
                {
                    clientSale = (saleToken != null && saleToken.Type != JTokenType.Null)
                        ? saleToken.ToObject<Sale>()
                        : payload.ToObject<Sale>();
                }
                catch (Exception ex)
                {
                    Logger.Warn("تعذر تحليل بيانات الفاتورة المرسلة للطباعة: " + ex.Message);
                    return BridgeResponse.Fail(request.Id, "INVALID_SALE", "تعذر تحليل بيانات الفاتورة المراد طباعتها");
                }

                if (clientSale == null)
                {
                    return BridgeResponse.Fail(request.Id, "INVALID_SALE", "تعذر تحليل بيانات الفاتورة المراد طباعتها");
                }

                Sale storedSale = null;
                if (!string.IsNullOrWhiteSpace(clientSale.Id) && DatabaseService.Sales != null)
                {
                    storedSale = DatabaseService.Sales.GetSaleById(clientSale.Id);
                }

                if (storedSale == null && PrinterService.IsTransientReceiptSale(clientSale))
                {
                    // Only unsaved pre-bills and test receipts are printed as sent; a real sale id always wins
                    sale = clientSale;
                    isTransient = true;
                }
                else if (storedSale != null)
                {
                    sale = storedSale;
                }
                else if (string.IsNullOrWhiteSpace(clientSale.Id))
                {
                    return BridgeResponse.Fail(request.Id, "INVALID_SALE", "لا يمكن طباعة فاتورة غير محفوظة. أرسل رقم الفاتورة (saleId) لطباعتها من قاعدة البيانات.");
                }
                else
                {
                    return BridgeResponse.Fail(request.Id, "SALE_NOT_FOUND", "لم يتم العثور على الفاتورة المطلوب طباعتها.");
                }
            }

            string validationError;
            if (!PrinterService.TryValidateSaleForPrint(sale, out validationError))
            {
                return BridgeResponse.Fail(request.Id, "INVALID_SALE", validationError);
            }

            bool isCopy = clientIsCopy;
            if (isTransient)
            {
                openDrawer = false;
            }
            else if (!isCopy && DatabaseService.Printer.HasSaleReceiptBeenPrinted(sale.Id))
            {
                isCopy = true;
            }

            PrintResult printResult = DatabaseService.Printer.PrintSaleReceipt(sale, printerName, paperWidth, openDrawer, isCopy);
            return ToPrintResponse(request.Id, printResult);
        }
    }
}
