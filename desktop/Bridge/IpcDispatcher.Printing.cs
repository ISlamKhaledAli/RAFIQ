using System;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
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
                    response = BridgeResponse.Ok(request.Id, testPrintResult);
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
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات الفاتورة المراد طباعتها فارغة");
                        return true;
                    }
                    Sale saleToPrint = null;
                    string pPrinter = null;
                    string pWidth = null;
                    bool? pDrawer = null;
                    bool pIsCopy = true;

                    JObject printPayload = request.Payload as JObject;
                    if (printPayload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات طلب الطباعة غير صحيحة.");
                        return true;
                    }

                    string pStoredId = printPayload["saleId"] != null ? printPayload["saleId"].ToString() : null;
                    JObject legacyPrintSale = printPayload["sale"] as JObject;
                    if (printPayload["sale"] != null && legacyPrintSale == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_SALE", "بيانات الفاتورة المراد طباعتها غير صحيحة.");
                        return true;
                    }
                    string pLegacyId = legacyPrintSale != null && legacyPrintSale["id"] != null
                        ? legacyPrintSale["id"].ToString()
                        : (printPayload["id"] != null ? printPayload["id"].ToString() : null);
                    if (!string.IsNullOrWhiteSpace(pStoredId) && !string.IsNullOrWhiteSpace(pLegacyId) &&
                        !string.Equals(pStoredId, pLegacyId, StringComparison.Ordinal))
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_SALE", "معرّفات الفاتورة في طلب الطباعة غير متطابقة.");
                        return true;
                    }
                    pStoredId = !string.IsNullOrWhiteSpace(pStoredId) ? pStoredId : pLegacyId;
                    if (string.IsNullOrWhiteSpace(pStoredId))
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_SALE", "معرّف الفاتورة المحفوظة مطلوب للطباعة.");
                        return true;
                    }
                    saleToPrint = DatabaseService.Sales.GetSaleById(pStoredId);
                    if (saleToPrint == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "SALE_NOT_FOUND", "الفاتورة المطلوبة غير موجودة؛ لم يتم إرسال أي طباعة.");
                        return true;
                    }
                    if (printPayload["printerName"] != null) pPrinter = printPayload["printerName"].ToString();
                    if (printPayload["paperWidth"] != null) pWidth = printPayload["paperWidth"].ToString();
                    if (printPayload["openDrawer"] != null) pDrawer = printPayload["openDrawer"].Value<bool>();
                    if (printPayload["isCopy"] != null) pIsCopy = printPayload["isCopy"].Value<bool>();

                    var printReceiptResult = DatabaseService.Printer.PrintSaleReceipt(saleToPrint, pPrinter, pWidth, pDrawer, pIsCopy);
                    response = BridgeResponse.Ok(request.Id, printReceiptResult);
                    return true;

                case "printer:getDrawerSafety":
                    response = BridgeResponse.Ok(request.Id, new
                    {
                        canOpen = false,
                        code = RafiqPOS.Common.DrawerSafetyPolicy.WarningCode,
                        message = RafiqPOS.Common.DrawerSafetyPolicy.BlockReason
                    });
                    return true;

                case "printer:kickDrawer":
                    string kickPrinter = null;
                    int? kickPulse = null;
                    JObject kdPayload = request.Payload as JObject;
                    if (kdPayload != null)
                    {
                        if (kdPayload["printerName"] != null) kickPrinter = kdPayload["printerName"].ToString();
                        if (kdPayload["pulseMs"] != null)
                        {
                            int pVal;
                            if (int.TryParse(kdPayload["pulseMs"].ToString(), out pVal)) kickPulse = pVal;
                        }
                    }
                    var kickRes = DatabaseService.Printer.KickDrawer(kickPrinter, kickPulse);
                    response = BridgeResponse.Ok(request.Id, kickRes);
                    return true;

                case "printer:cutPaper":
                    string cutPrinter = null;
                    JObject cpPayload = request.Payload as JObject;
                    if (cpPayload != null && cpPayload["printerName"] != null)
                    {
                        cutPrinter = cpPayload["printerName"].ToString();
                    }
                    var cutRes = DatabaseService.Printer.CutPaper(cutPrinter);
                    response = BridgeResponse.Ok(request.Id, cutRes);
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
    }
}
