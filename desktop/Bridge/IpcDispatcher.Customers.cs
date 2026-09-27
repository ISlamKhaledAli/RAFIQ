using System;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Bridge
{
    public partial class IpcDispatcher
    {
        private static bool TryDispatchCustomers(BridgeRequest request, out BridgeResponse response)
        {
            response = null;
            switch (request.Action)
            {
                case "customers:getAll":
                    int custLimit = 100;
                    JObject getCustObj = request.Payload as JObject;
                    if (getCustObj != null && getCustObj["limit"] != null)
                    {
                        custLimit = getCustObj["limit"].Value<int>();
                    }
                    var allCustomers = DatabaseService.Customers.GetAll(custLimit);
                    response = BridgeResponse.Ok(request.Id, allCustomers);
                    return true;

                case "customers:search":
                    string custQuery = "";
                    JObject searchCustObj = request.Payload as JObject;
                    if (searchCustObj != null && searchCustObj["query"] != null)
                    {
                        custQuery = searchCustObj["query"].ToString();
                    }
                    var custSearchResults = DatabaseService.Customers.Search(custQuery);
                    response = BridgeResponse.Ok(request.Id, custSearchResults);
                    return true;

                case "customers:save":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات العميل فارغة");
                        return true;
                    }
                    var customerToSave = JsonConvert.DeserializeObject<Customer>(request.Payload.ToString());
                    var savedCustomer = DatabaseService.Customers.SaveCustomer(customerToSave);
                    response = BridgeResponse.Ok(request.Id, savedCustomer);
                    return true;

                case "customers:recordPayment":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات السداد فارغة");
                        return true;
                    }
                    JObject payObj = request.Payload as JObject;
                    if (payObj == null || payObj["customerId"] == null || payObj["amountPiasters"] == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات السداد غير مكتملة");
                        return true;
                    }
                    string payCustId = payObj["customerId"].ToString();
                    long payAmount = payObj["amountPiasters"].Value<long>();
                    string payNotes = payObj["notes"] != null ? payObj["notes"].ToString() : "";
                    var updatedCustomerAfterPay = DatabaseService.Customers.RecordPayment(payCustId, payAmount, payNotes);
                    response = BridgeResponse.Ok(request.Id, updatedCustomerAfterPay);
                    return true;

                case "customers:cancelPayment":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات إلغاء السداد فارغة");
                        return true;
                    }
                    JObject cancelPayObj = request.Payload as JObject;
                    if (cancelPayObj == null || cancelPayObj["customerId"] == null || cancelPayObj["ledgerEntryId"] == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات إلغاء السداد غير مكتملة");
                        return true;
                    }
                    string cpCustId = cancelPayObj["customerId"].ToString();
                    string cpLedgerId = cancelPayObj["ledgerEntryId"].ToString();
                    string cpReason = cancelPayObj["reason"] != null ? cancelPayObj["reason"].ToString() : "سجلت بالخطأ";
                    string cpUser = cancelPayObj["userName"] != null ? cancelPayObj["userName"].ToString() : "الكاشير";
                    var custAfterCancel = DatabaseService.Customers.CancelPayment(cpCustId, cpLedgerId, cpReason, cpUser);
                    response = BridgeResponse.Ok(request.Id, custAfterCancel);
                    return true;

                case "customers:checkPhone":
                    string checkPhoneNum = "";
                    string checkExcludeId = null;
                    JObject cpObj = request.Payload as JObject;
                    if (cpObj != null)
                    {
                        if (cpObj["phone"] != null) checkPhoneNum = cpObj["phone"].ToString();
                        if (cpObj["excludeId"] != null) checkExcludeId = cpObj["excludeId"].ToString();
                    }
                    else if (request.Payload != null)
                    {
                        checkPhoneNum = request.Payload.ToString().Trim('"', ' ');
                    }
                    var existingCust = DatabaseService.Customers.FindByPhone(checkPhoneNum, checkExcludeId);
                    response = BridgeResponse.Ok(request.Id, new
                    {
                        isDuplicate = existingCust != null,
                        existingCustomer = existingCust
                    });
                    return true;

                case "customers:verifyBalance":
                    string vbCustId = "";
                    JObject vbObj = request.Payload as JObject;
                    if (vbObj != null && vbObj["customerId"] != null) vbCustId = vbObj["customerId"].ToString();
                    else if (request.Payload != null) vbCustId = request.Payload.ToString().Trim('"', ' ');
                    var verifyRes = DatabaseService.Customers.VerifyBalance(vbCustId);
                    response = BridgeResponse.Ok(request.Id, verifyRes);
                    return true;

                case "customers:recalculateBalance":
                    string rbCustId = "";
                    JObject rbObj = request.Payload as JObject;
                    if (rbObj != null && rbObj["customerId"] != null) rbCustId = rbObj["customerId"].ToString();
                    else if (request.Payload != null) rbCustId = request.Payload.ToString().Trim('"', ' ');
                    var fixedCust = DatabaseService.Customers.RecalculateAndFixBalance(rbCustId);
                    response = BridgeResponse.Ok(request.Id, fixedCust);
                    return true;

                case "customers:getDetailedStatement":
                    string detCustId = "";
                    string detStartDate = null;
                    string detEndDate = null;
                    JObject detObj = request.Payload as JObject;
                    if (detObj != null)
                    {
                        if (detObj["customerId"] != null) detCustId = detObj["customerId"].ToString();
                        if (detObj["startDate"] != null) detStartDate = detObj["startDate"].ToString();
                        if (detObj["endDate"] != null) detEndDate = detObj["endDate"].ToString();
                    }
                    var detailedStatement = DatabaseService.Customers.GetDetailedStatement(detCustId, detStartDate, detEndDate);
                    response = BridgeResponse.Ok(request.Id, detailedStatement);
                    return true;

                case "customers:getStatement":
                    string statCustId = "";
                    JObject statObj = request.Payload as JObject;
                    if (statObj != null && statObj["customerId"] != null)
                    {
                        statCustId = statObj["customerId"].ToString();
                    }
                    var statement = DatabaseService.Customers.GetStatement(statCustId, 50);
                    response = BridgeResponse.Ok(request.Id, statement);
                    return true;

                case "customers:runTests":
                    var custTestRes = CustomerLedgerTestRunner.RunAllTests();
                    if (custTestRes.Success)
                    {
                        response = BridgeResponse.Ok(request.Id, custTestRes);
                    }
                    else
                    {
                        response = BridgeResponse.Fail(request.Id, "CUSTOMER_TESTS_FAILED", custTestRes.Message);
                    }
                    return true;

                default:
                    return false;
            }
        }
    }
}
