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
                    JObject testLabelPayload = request.Payload as JObject;
                    if (testLabelPayload != null)
                    {
                        if (testLabelPayload["printerName"] != null) testLabelPrinter = testLabelPayload["printerName"].ToString();
                        if (testLabelPayload["paperSize"] != null) testPaperSize = testLabelPayload["paperSize"].ToString();
                    }
                    var testLabelRes = DatabaseService.BarcodeLabels.PrintTestLabel(testLabelPrinter, testPaperSize);
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
                    bool pIsCopy = false;

                    JObject printPayload = request.Payload as JObject;
                    if (printPayload != null && printPayload["sale"] != null)
                    {
                        saleToPrint = JsonConvert.DeserializeObject<Sale>(printPayload["sale"].ToString());
                        if (printPayload["printerName"] != null) pPrinter = printPayload["printerName"].ToString();
                        if (printPayload["paperWidth"] != null) pWidth = printPayload["paperWidth"].ToString();
                        if (printPayload["openDrawer"] != null) pDrawer = printPayload["openDrawer"].Value<bool>();
                        if (printPayload["isCopy"] != null) pIsCopy = printPayload["isCopy"].Value<bool>();
                    }
                    else
                    {
                        saleToPrint = JsonConvert.DeserializeObject<Sale>(request.Payload.ToString());
                        if (printPayload != null && printPayload["isCopy"] != null)
                        {
                            pIsCopy = printPayload["isCopy"].Value<bool>();
                        }
                    }

                    if (saleToPrint == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_SALE", "تعذر تحليل بيانات الفاتورة المراد طباعتها");
                        return true;
                    }

                    var printReceiptResult = DatabaseService.Printer.PrintSaleReceipt(saleToPrint, pPrinter, pWidth, pDrawer, pIsCopy);
                    response = BridgeResponse.Ok(request.Id, printReceiptResult);
                    return true;

                default:
                    return false;
            }
        }
    }
}
