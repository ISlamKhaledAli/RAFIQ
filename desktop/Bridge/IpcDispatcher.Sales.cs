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
        private static bool TryDispatchSales(BridgeRequest request, out BridgeResponse response)
        {
            response = null;
            switch (request.Action)
            {
                case "sales:create":
                    // Feature #173: Block sale creation when license is expired or tampered (Task 173-2)
                    if (DatabaseService.License != null && DatabaseService.License.IsLicenseExpired())
                    {
                        response = BridgeResponse.Fail(request.Id, "LICENSE_EXPIRED", "انتهت فترة اشتراك البرنامج أو تم إيقافه. يرجى تجديد الترخيص لاستكمال عمليات البيع.");
                        return true;
                    }
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات الفاتورة فارغة");
                        return true;
                    }
                    try
                    {
                        var saleToCreate = JsonConvert.DeserializeObject<Sale>(request.Payload.ToString());
                        if (saleToCreate != null && string.IsNullOrEmpty(saleToCreate.CashierId) && SecurityService.CurrentUser != null)
                        {
                            saleToCreate.CashierId = SecurityService.CurrentUser.Id;
                        }
                        var createdSale = DatabaseService.Sales.ProcessSale(saleToCreate);
                        if (DatabaseService.License != null)
                        {
                            DatabaseService.License.RecordKnownUtc();
                        }
                        response = BridgeResponse.Ok(request.Id, createdSale);
                    }
                    catch (Exception ex)
                    {
                        Logger.Error("خطأ أثناء حفظ الفاتورة في قاعدة البيانات", ex);
                        response = BridgeResponse.Fail(request.Id, "SALE_SAVE_FAILED", "تعذر حفظ الفاتورة في قاعدة البيانات، يرجى إعادة المحاولة.");
                    }
                    return true;

                case "sales:getRecent":
                    var recentSales = DatabaseService.Sales.GetRecentSales(20);
                    response = BridgeResponse.Ok(request.Id, recentSales);
                    return true;

                case "sales:getById":
                    string saleId = "";
                    JObject sIdObj = request.Payload as JObject;
                    if (sIdObj != null && sIdObj["id"] != null)
                    {
                        saleId = sIdObj["id"].ToString();
                    }
                    else if (request.Payload != null)
                    {
                        saleId = request.Payload.ToString().Trim('"', ' ');
                    }
                    var singleSale = DatabaseService.Sales.GetSaleById(saleId);
                    if (singleSale == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "SALE_NOT_FOUND", "لم يتم العثور على الفاتورة المطلوبة");
                        return true;
                    }
                    response = BridgeResponse.Ok(request.Id, singleSale);
                    return true;

                case "sales:cancel":
                    string cancelSaleId = "";
                    string cancelReason = "إلغاء بناء على طلب الكاشير";
                    string cancelUserId = "usr_admin_default";
                    string cancelSupPin = null;
                    JObject cPayload = request.Payload as JObject;
                    if (cPayload != null)
                    {
                        if (cPayload["saleId"] != null) cancelSaleId = cPayload["saleId"].ToString();
                        else if (cPayload["id"] != null) cancelSaleId = cPayload["id"].ToString();
                        if (cPayload["reason"] != null) cancelReason = cPayload["reason"].ToString();
                        if (cPayload["userId"] != null) cancelUserId = cPayload["userId"].ToString();
                        if (cPayload["supervisorPin"] != null) cancelSupPin = cPayload["supervisorPin"].ToString();
                    }
                    else if (request.Payload != null)
                    {
                        cancelSaleId = request.Payload.ToString().Trim('"', ' ');
                    }

                    if (string.IsNullOrWhiteSpace(cancelSaleId))
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "معرّف الفاتورة مطلوب لإلغائها");
                        return true;
                    }

                    try
                    {
                        var cancelledSale = DatabaseService.Sales.CancelSale(cancelSaleId, cancelReason, cancelUserId, cancelSupPin);
                        response = BridgeResponse.Ok(request.Id, cancelledSale);
                    }
                    catch (UnauthorizedAccessException uEx)
                    {
                        response = BridgeResponse.Fail(request.Id, "PIN_REQUIRED", uEx.Message);
                    }
                    catch (Exception ex)
                    {
                        response = BridgeResponse.Fail(request.Id, "CANCEL_FAILED", ex.Message);
                    }
                    return true;

                case "sales:getByInvoiceNumber":
                    int invNum = 0;
                    JObject invPayload = request.Payload as JObject;
                    if (invPayload != null && invPayload["invoiceNumber"] != null)
                    {
                        invNum = invPayload["invoiceNumber"].Value<int>();
                    }
                    else if (request.Payload != null)
                    {
                        int.TryParse(request.Payload.ToString().Trim('"', ' ', '#'), out invNum);
                    }
                    if (invNum <= 0)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "رقم الفاتورة غير صحيح");
                        return true;
                    }
                    var foundSale = DatabaseService.Sales.GetSaleByInvoiceNumber(invNum);
                    response = BridgeResponse.Ok(request.Id, foundSale);
                    return true;

                case "sales:search":
                    string sQuery = null;
                    string sDateFrom = null;
                    string sDateTo = null;
                    string sCustomerId = null;
                    string sStatus = null;
                    long? sMinTotal = null;
                    long? sMaxTotal = null;
                    int sLimit = 100;

                    JObject sSearchObj = request.Payload as JObject;
                    if (sSearchObj != null)
                    {
                        if (sSearchObj["query"] != null) sQuery = sSearchObj["query"].ToString();
                        if (sSearchObj["dateFrom"] != null) sDateFrom = sSearchObj["dateFrom"].ToString();
                        if (sSearchObj["dateTo"] != null) sDateTo = sSearchObj["dateTo"].ToString();
                        if (sSearchObj["customerId"] != null) sCustomerId = sSearchObj["customerId"].ToString();
                        if (sSearchObj["status"] != null) sStatus = sSearchObj["status"].ToString();
                        if (sSearchObj["minTotal"] != null) sMinTotal = sSearchObj["minTotal"].Value<long>();
                        if (sSearchObj["maxTotal"] != null) sMaxTotal = sSearchObj["maxTotal"].Value<long>();
                        if (sSearchObj["limit"] != null) sLimit = sSearchObj["limit"].Value<int>();
                    }
                    else if (request.Payload != null)
                    {
                        sQuery = request.Payload.ToString().Trim('"', ' ');
                    }

                    var searchedSales = DatabaseService.Sales.SearchSales(
                        sQuery, sDateFrom, sDateTo, sCustomerId, sStatus, sMinTotal, sMaxTotal, sLimit
                    );
                    response = BridgeResponse.Ok(request.Id, searchedSales);
                    return true;

                // Feature #25: Held Sales
                case "sales:hold":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات الفاتورة المعلقة فارغة");
                        return true;
                    }
                    var heldToSave = JsonConvert.DeserializeObject<HeldSale>(request.Payload.ToString());
                    var savedHeld = DatabaseService.HeldSales.HoldSale(heldToSave);
                    response = BridgeResponse.Ok(request.Id, savedHeld);
                    return true;

                case "sales:getHeld":
                    var heldList = DatabaseService.HeldSales.GetHeldSales();
                    response = BridgeResponse.Ok(request.Id, heldList);
                    return true;

                case "sales:recallHeld":
                    string recallId = "";
                    JObject recallHeldPayloadObj = request.Payload as JObject;
                    if (recallHeldPayloadObj != null && recallHeldPayloadObj["id"] != null) recallId = recallHeldPayloadObj["id"].ToString();
                    else if (request.Payload != null) recallId = request.Payload.ToString().Trim('"', ' ');

                    if (string.IsNullOrEmpty(recallId))
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "معرّف الفاتورة المعلقة مطلوب لاسترجاعها");
                        return true;
                    }
                    var recalled = DatabaseService.HeldSales.RecallHeldSale(recallId);
                    if (recalled == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "NOT_FOUND", "لم يتم العثور على الفاتورة المعلقة");
                        return true;
                    }
                    response = BridgeResponse.Ok(request.Id, recalled);
                    return true;

                case "sales:deleteHeld":
                    string delHeldId = "";
                    JObject dObj = request.Payload as JObject;
                    if (dObj != null && dObj["id"] != null) delHeldId = dObj["id"].ToString();
                    else if (request.Payload != null) delHeldId = request.Payload.ToString().Trim('"', ' ');

                    bool delHeldOk = DatabaseService.HeldSales.DeleteHeldSale(delHeldId);
                    response = BridgeResponse.Ok(request.Id, new { success = delHeldOk });
                    return true;

                case "sales:cleanupHeld":
                    int cleanDays = 7;
                    JObject cDaysObj = request.Payload as JObject;
                    if (cDaysObj != null && cDaysObj["days"] != null) cleanDays = cDaysObj["days"].Value<int>();
                    int cleanedCount = DatabaseService.HeldSales.CleanupOldHeldSales(cleanDays);
                    response = BridgeResponse.Ok(request.Id, new { cleanedCount = cleanedCount });
                    return true;

                // Feature #26: Returns & Refunds
                case "returns:create":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات المرتجع فارغة");
                        return true;
                    }
                    try
                    {
                        JObject retReqObj = request.Payload as JObject;
                        string retSupPin = null;
                        Return retObjToProcess;

                        if (retReqObj != null && retReqObj["return"] != null)
                        {
                            retObjToProcess = retReqObj["return"].ToObject<Return>();
                            if (retReqObj["supervisorPin"] != null)
                            {
                                retSupPin = retReqObj["supervisorPin"].ToString();
                            }
                        }
                        else
                        {
                            retObjToProcess = JsonConvert.DeserializeObject<Return>(request.Payload.ToString());
                            if (retReqObj != null && retReqObj["supervisorPin"] != null)
                            {
                                retSupPin = retReqObj["supervisorPin"].ToString();
                            }
                        }

                        if (retObjToProcess == null)
                        {
                            response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "تعذر قراءة بيانات المرتجع");
                            return true;
                        }

                        var processedReturn = DatabaseService.Returns.ProcessReturn(retObjToProcess, retSupPin);
                        response = BridgeResponse.Ok(request.Id, processedReturn);
                    }
                    catch (UnauthorizedAccessException uEx)
                    {
                        response = BridgeResponse.Fail(request.Id, "PIN_REQUIRED", uEx.Message);
                    }
                    catch (Exception ex)
                    {
                        Logger.Error("خطأ أثناء معالجة المرتجع", ex);
                        response = BridgeResponse.Fail(request.Id, "RETURN_FAILED", ex.Message);
                    }
                    return true;

                case "returns:getRecent":
                    int retLimit = 50;
                    JObject retLimitObj = request.Payload as JObject;
                    if (retLimitObj != null && retLimitObj["limit"] != null) retLimit = retLimitObj["limit"].Value<int>();
                    var recentReturns = DatabaseService.Returns.GetRecentReturns(retLimit);
                    response = BridgeResponse.Ok(request.Id, recentReturns);
                    return true;

                case "returns:getById":
                    string retIdToFind = "";
                    JObject retIdObj = request.Payload as JObject;
                    if (retIdObj != null && retIdObj["id"] != null) retIdToFind = retIdObj["id"].ToString();
                    else if (request.Payload != null) retIdToFind = request.Payload.ToString().Trim('"', ' ');
                    var singleReturn = DatabaseService.Returns.GetReturnById(retIdToFind);
                    if (singleReturn == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "NOT_FOUND", "لم يتم العثور على المرتجع المطلوب");
                        return true;
                    }
                    response = BridgeResponse.Ok(request.Id, singleReturn);
                    return true;

                case "returns:getForSale":
                    string forSaleId = "";
                    JObject fSaleObj = request.Payload as JObject;
                    if (fSaleObj != null && fSaleObj["saleId"] != null) forSaleId = fSaleObj["saleId"].ToString();
                    else if (request.Payload != null) forSaleId = request.Payload.ToString().Trim('"', ' ');
                    var saleReturns = DatabaseService.Returns.GetReturnsForSale(forSaleId);
                    response = BridgeResponse.Ok(request.Id, saleReturns);
                    return true;

                case "returns:printReceipt":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات المرتجع مطلوبة للطباعة");
                        return true;
                    }
                    try
                    {
                        JObject printRetObj = request.Payload as JObject;
                        Return retToPrint = null;
                        string pPrinterName = null;
                        int? pPaperWidth = null;
                        bool? pOpenDrawer = null;

                        if (printRetObj != null)
                        {
                            if (printRetObj["return"] != null)
                            {
                                retToPrint = printRetObj["return"].ToObject<Return>();
                            }
                            else if (printRetObj["returnId"] != null)
                            {
                                retToPrint = DatabaseService.Returns.GetReturnById(printRetObj["returnId"].ToString());
                            }
                            else if (printRetObj["id"] != null)
                            {
                                retToPrint = DatabaseService.Returns.GetReturnById(printRetObj["id"].ToString());
                            }

                            if (printRetObj["printerName"] != null) pPrinterName = printRetObj["printerName"].ToString();
                            if (printRetObj["paperWidth"] != null) pPaperWidth = printRetObj["paperWidth"].Value<int>();
                            if (printRetObj["openDrawer"] != null) pOpenDrawer = printRetObj["openDrawer"].Value<bool>();
                        }

                        if (retToPrint == null)
                        {
                            retToPrint = JsonConvert.DeserializeObject<Return>(request.Payload.ToString());
                        }

                        if (retToPrint == null)
                        {
                            response = BridgeResponse.Fail(request.Id, "NOT_FOUND", "تعذر العثور على بيانات المرتجع للطباعة");
                            return true;
                        }

                        var printRes = DatabaseService.Printer.PrintReturnReceipt(retToPrint, pPrinterName, pPaperWidth, pOpenDrawer);
                        response = BridgeResponse.Ok(request.Id, printRes);
                    }
                    catch (Exception ex)
                    {
                        Logger.Error("خطأ أثناء طباعة إيصال المرتجع", ex);
                        response = BridgeResponse.Fail(request.Id, "PRINT_FAILED", ex.Message);
                    }
                    return true;

                case "counters:getNextExpectedInvoiceNumber":
                    long nextExpected = DatabaseService.CounterRepo != null 
                        ? DatabaseService.CounterRepo.GetNextExpectedInvoiceNumber() 
                        : 1;
                    response = BridgeResponse.Ok(request.Id, new { nextInvoiceNumber = nextExpected });
                    return true;

                case "tests:runSalesCompletionTests":
                    var salesComplTestRes = SalesCompletionTestRunner.RunAllTests();
                    response = BridgeResponse.Ok(request.Id, salesComplTestRes);
                    return true;

                default:
                    return false;
            }
        }
    }
}
