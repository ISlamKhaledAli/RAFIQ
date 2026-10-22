using System;
using System.Collections.Generic;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using RafiqPOS.Models;
using RafiqPOS.Repositories;
using RafiqPOS.Services;

namespace RafiqPOS.Bridge
{
    public partial class IpcDispatcher
    {
        private static EpayRepository _epayRepo;
        private static EpayRepository GetEpayRepo()
        {
            if (_epayRepo == null)
            {
                _epayRepo = new EpayRepository(DatabaseService.ConnectionString, DatabaseService.AuditRepo);
            }
            return _epayRepo;
        }

        private static bool TryDispatchEpay(BridgeRequest request, out BridgeResponse response)
        {
            response = null;

            switch (request.Action)
            {
                case "epay:getTerminals":
                    {
                        var repo = GetEpayRepo();
                        var terminals = repo.GetAllTerminals();
                        response = BridgeResponse.Ok(request.Id, terminals);
                        return true;
                    }

                case "epay:saveTerminal":
                    {
                        var repo = GetEpayRepo();
                        if (request.Payload == null)
                        {
                            response = BridgeResponse.Fail(request.Id, "VALIDATION_ERROR", "بيانات الماكينة فارغة");
                            return true;
                        }

                        var terminal = JsonConvert.DeserializeObject<EpayTerminal>(request.Payload.ToString());
                        if (terminal == null || string.IsNullOrWhiteSpace(terminal.Name))
                        {
                            response = BridgeResponse.Fail(request.Id, "VALIDATION_ERROR", "اسم الماكينة مطلوب");
                            return true;
                        }
                        lock (SaleService.FinancialWriteLock)
                        {
                            var saved = repo.SaveTerminal(terminal);
                            response = BridgeResponse.Ok(request.Id, saved);
                        }
                        return true;
                    }

                case "epay:deleteTerminal":
                    {
                        var repo = GetEpayRepo();
                        if (request.Payload == null)
                        {
                            response = BridgeResponse.Fail(request.Id, "VALIDATION_ERROR", "معرف الماكينة فارغ");
                            return true;
                        }

                        string terminalId = null;
                        if (request.Payload is JValue)
                        {
                            terminalId = request.Payload.ToString();
                        }
                        else
                        {
                            JObject payloadObj = request.Payload as JObject ?? JObject.Parse(request.Payload.ToString());
                            terminalId = payloadObj["terminalId"] != null ? (string)payloadObj["terminalId"] : (payloadObj["id"] != null ? (string)payloadObj["id"] : null);
                        }

                        if (string.IsNullOrWhiteSpace(terminalId))
                        {
                            response = BridgeResponse.Fail(request.Id, "VALIDATION_ERROR", "يجب تحديد الماكينة المراد حذفها");
                            return true;
                        }

                        lock (SaleService.FinancialWriteLock)
                        {
                            string outMessage;
                            bool ok = repo.DeleteTerminal(terminalId, out outMessage);
                            if (ok)
                            {
                                response = BridgeResponse.Ok(request.Id, new { success = true, message = outMessage });
                            }
                            else
                            {
                                response = BridgeResponse.Fail(request.Id, "DELETE_ERROR", outMessage);
                            }
                        }
                        return true;
                    }

                case "epay:adjustBalance":
                    {
                        var repo = GetEpayRepo();
                        if (request.Payload == null)
                        {
                            response = BridgeResponse.Fail(request.Id, "VALIDATION_ERROR", "بيانات التسوية فارغة");
                            return true;
                        }

                        JObject payloadObj = request.Payload as JObject ?? JObject.Parse(request.Payload.ToString());
                        string terminalId = payloadObj["terminalId"] != null ? (string)payloadObj["terminalId"] : null;
                        long newBalancePiasters = payloadObj["newBalancePiasters"] != null ? (long)payloadObj["newBalancePiasters"] : 0;
                        string reason = payloadObj["reason"] != null ? (string)payloadObj["reason"] : null;

                        if (string.IsNullOrWhiteSpace(terminalId))
                        {
                            response = BridgeResponse.Fail(request.Id, "VALIDATION_ERROR", "معرف ماكينة الدفع مطلوب");
                            return true;
                        }
                        if (string.IsNullOrWhiteSpace(reason))
                        {
                            response = BridgeResponse.Fail(request.Id, "VALIDATION_ERROR", "سبب تسوية الرصيد إلزامي ولا يمكن تركه فارغاً");
                            return true;
                        }

                        var sessionUser = SecurityService.CurrentUser;
                        string userId = sessionUser != null ? sessionUser.Id : "admin";

                        lock (SaleService.FinancialWriteLock)
                        {
                            var updated = repo.AdjustBalance(terminalId, newBalancePiasters, reason, userId);
                            response = BridgeResponse.Ok(request.Id, updated);
                        }
                        return true;
                    }

                case "epay:fundTerminal":
                    {
                        var repo = GetEpayRepo();
                        if (request.Payload == null)
                        {
                            response = BridgeResponse.Fail(request.Id, "VALIDATION_ERROR", "بيانات التغذية فارغة");
                            return true;
                        }

                        JObject payloadObj = request.Payload as JObject ?? JObject.Parse(request.Payload.ToString());
                        string terminalId = payloadObj["terminalId"] != null ? (string)payloadObj["terminalId"] : null;
                        long amountPiasters = payloadObj["amountPiasters"] != null ? (long)payloadObj["amountPiasters"] : 0;
                        string fundingSource = payloadObj["fundingSource"] != null ? (string)payloadObj["fundingSource"] : "cash_drawer";
                        string notes = payloadObj["notes"] != null ? (string)payloadObj["notes"] : null;
                        string createdBy = payloadObj["createdBy"] != null ? (string)payloadObj["createdBy"] : null;

                        if (string.IsNullOrWhiteSpace(terminalId))
                        {
                            response = BridgeResponse.Fail(request.Id, "VALIDATION_ERROR", "يجب تحديد الماكينة المراد تغذية رصيدها");
                            return true;
                        }
                        if (amountPiasters <= 0)
                        {
                            response = BridgeResponse.Fail(request.Id, "VALIDATION_ERROR", "مبلغ التغذية يجب أن يكون أكبر من الصفر");
                            return true;
                        }

                        lock (SaleService.FinancialWriteLock)
                        {
                            var funding = repo.FundTerminal(terminalId, amountPiasters, fundingSource, notes, createdBy);
                            response = BridgeResponse.Ok(request.Id, funding);
                        }
                        return true;
                    }

                case "epay:calculatePricing":
                    {
                        var repo = GetEpayRepo();
                        if (request.Payload == null)
                        {
                            response = BridgeResponse.Fail(request.Id, "VALIDATION_ERROR", "بيانات التسعير فارغة");
                            return true;
                        }

                        JObject payloadObj = request.Payload as JObject ?? JObject.Parse(request.Payload.ToString());
                        string terminalId = payloadObj["terminalId"] != null ? (string)payloadObj["terminalId"] : null;
                        string serviceType = payloadObj["serviceType"] != null ? (string)payloadObj["serviceType"] : "mobile_recharge";
                        long billAmountPiasters = payloadObj["billAmountPiasters"] != null ? (long)payloadObj["billAmountPiasters"] : 0;

                        if (string.IsNullOrWhiteSpace(terminalId))
                        {
                            response = BridgeResponse.Fail(request.Id, "VALIDATION_ERROR", "يجب تحديد ماكينة الدفع الإلكتروني");
                            return true;
                        }
                        if (billAmountPiasters <= 0)
                        {
                            response = BridgeResponse.Fail(request.Id, "VALIDATION_ERROR", "مبلغ العملية يجب أن يكون أكبر من الصفر");
                            return true;
                        }

                        try
                        {
                            var pricing = repo.CalculatePricing(terminalId, serviceType, billAmountPiasters);
                            response = BridgeResponse.Ok(request.Id, pricing);
                        }
                        catch (Exception ex)
                        {
                            response = BridgeResponse.Fail(request.Id, "CALCULATION_FAILED", ex.Message);
                        }
                        return true;
                    }

                case "epay:createTransaction":
                    {
                        var repo = GetEpayRepo();
                        if (request.Payload == null)
                        {
                            response = BridgeResponse.Fail(request.Id, "VALIDATION_ERROR", "بيانات العملية فارغة");
                            return true;
                        }

                        var tx = JsonConvert.DeserializeObject<EpayTransaction>(request.Payload.ToString());
                        if (tx == null)
                        {
                            response = BridgeResponse.Fail(request.Id, "VALIDATION_ERROR", "بيانات العملية غير صالحة");
                            return true;
                        }
                        if (string.IsNullOrWhiteSpace(tx.TerminalId))
                        {
                            response = BridgeResponse.Fail(request.Id, "VALIDATION_ERROR", "يجب اختيار الماكينة المنفذة للعملية");
                            return true;
                        }
                        if (tx.BillAmountPiasters <= 0)
                        {
                            response = BridgeResponse.Fail(request.Id, "VALIDATION_ERROR", "مبلغ العملية يجب أن يكون أكبر من الصفر");
                            return true;
                        }
                        if (tx.CustomerFeePiasters < 0)
                        {
                            response = BridgeResponse.Fail(request.Id, "VALIDATION_ERROR", "رسوم الخدمة لا يمكن أن تكون سالبة");
                            return true;
                        }
                        if (tx.ProviderCommissionPiasters < 0)
                        {
                            response = BridgeResponse.Fail(request.Id, "VALIDATION_ERROR", "عمولة الشركة لا يمكن أن تكون سالبة");
                            return true;
                        }

                        try
                        {
                            lock (SaleService.FinancialWriteLock)
                            {
                                var created = repo.CreateTransaction(tx);
                                response = BridgeResponse.Ok(request.Id, created);
                            }
                        }
                        catch (Exception ex)
                        {
                            response = BridgeResponse.Fail(request.Id, "TRANSACTION_FAILED", ex.Message);
                        }
                        return true;
                    }

                case "epay:cancelTransaction":
                    {
                        var repo = GetEpayRepo();
                        if (request.Payload == null)
                        {
                            response = BridgeResponse.Fail(request.Id, "VALIDATION_ERROR", "بيانات الإلغاء فارغة");
                            return true;
                        }

                        JObject payloadObj = request.Payload as JObject ?? JObject.Parse(request.Payload.ToString());
                        string txId = payloadObj["transactionId"] != null ? (string)payloadObj["transactionId"] : null;
                        string reason = payloadObj["reason"] != null ? (string)payloadObj["reason"] : null;
                        string cancelledBy = payloadObj["cancelledBy"] != null ? (string)payloadObj["cancelledBy"] : null;

                        if (string.IsNullOrWhiteSpace(txId))
                        {
                            response = BridgeResponse.Fail(request.Id, "VALIDATION_ERROR", "يجب تحديد معرف العملية المراد إلغاؤها");
                            return true;
                        }

                        try
                        {
                            lock (SaleService.FinancialWriteLock)
                            {
                                var cancelled = repo.CancelTransaction(txId, reason, cancelledBy);
                                response = BridgeResponse.Ok(request.Id, cancelled);
                            }
                        }
                        catch (Exception ex)
                        {
                            response = BridgeResponse.Fail(request.Id, "CANCELLATION_FAILED", ex.Message);
                        }
                        return true;
                    }

                case "epay:getTransactions":
                    {
                        var repo = GetEpayRepo();
                        string terminalId = null;
                        string serviceType = null;
                        string fromDate = null;
                        string toDate = null;
                        int limit = 100;

                        if (request.Payload != null)
                        {
                            JObject payloadObj = request.Payload as JObject ?? JObject.Parse(request.Payload.ToString());
                            terminalId = payloadObj["terminalId"] != null ? (string)payloadObj["terminalId"] : null;
                            serviceType = payloadObj["serviceType"] != null ? (string)payloadObj["serviceType"] : null;
                            fromDate = payloadObj["fromDate"] != null ? (string)payloadObj["fromDate"] : null;
                            toDate = payloadObj["toDate"] != null ? (string)payloadObj["toDate"] : null;
                            limit = payloadObj["limit"] != null ? (int)payloadObj["limit"] : 100;
                        }

                        var transactions = repo.GetTransactions(terminalId, serviceType, fromDate, toDate, limit);
                        response = BridgeResponse.Ok(request.Id, transactions);
                        return true;
                    }

                case "epay:getFundings":
                    {
                        var repo = GetEpayRepo();
                        string terminalId = null;
                        int limit = 50;

                        if (request.Payload != null)
                        {
                            JObject payloadObj = request.Payload as JObject ?? JObject.Parse(request.Payload.ToString());
                            terminalId = payloadObj["terminalId"] != null ? (string)payloadObj["terminalId"] : null;
                            limit = payloadObj["limit"] != null ? (int)payloadObj["limit"] : 50;
                        }

                        var fundings = repo.GetFundings(terminalId, limit);
                        response = BridgeResponse.Ok(request.Id, fundings);
                        return true;
                    }

                case "epay:getAnalytics":
                    {
                        var repo = GetEpayRepo();
                        string fromDate = null;
                        string toDate = null;

                        if (request.Payload != null)
                        {
                            JObject payloadObj = request.Payload as JObject ?? JObject.Parse(request.Payload.ToString());
                            fromDate = payloadObj["fromDate"] != null ? (string)payloadObj["fromDate"] : null;
                            toDate = payloadObj["toDate"] != null ? (string)payloadObj["toDate"] : null;
                        }

                        var analytics = repo.GetAnalytics(fromDate, toDate);
                        response = BridgeResponse.Ok(request.Id, analytics);
                        return true;
                    }

                default:
                    return false;
            }
        }
    }
}
