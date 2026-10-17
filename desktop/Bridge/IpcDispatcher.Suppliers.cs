using System;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Bridge
{
    public partial class IpcDispatcher
    {
        private static bool TryDispatchSuppliers(BridgeRequest request, out BridgeResponse response)
        {
            response = null;
            switch (request.Action)
            {
                case "suppliers:getAll":
                    bool includeInactive = false;
                    JObject getObj = request.Payload as JObject;
                    if (getObj != null && getObj["includeInactive"] != null)
                    {
                        includeInactive = getObj["includeInactive"].Value<bool>();
                    }
                    var suppliers = DatabaseService.Suppliers.GetAll(includeInactive);
                    response = BridgeResponse.Ok(request.Id, suppliers);
                    return true;

                case "suppliers:getById":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "معرف المورد مفقود");
                        return true;
                    }
                    JObject getByIdObj = request.Payload as JObject;
                    string supId = getByIdObj != null && getByIdObj["id"] != null ? getByIdObj["id"].ToString() : request.Payload.ToString();
                    var sup = DatabaseService.Suppliers.GetById(supId);
                    if (sup == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "NOT_FOUND", "المورد غير موجود");
                    }
                    else
                    {
                        response = BridgeResponse.Ok(request.Id, sup);
                    }
                    return true;

                case "suppliers:save":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات المورد فارغة");
                        return true;
                    }
                    try
                    {
                        var supplierToSave = JsonConvert.DeserializeObject<Supplier>(request.Payload.ToString());
                        var saved = DatabaseService.Suppliers.Save(supplierToSave);
                        response = BridgeResponse.Ok(request.Id, saved);
                    }
                    catch (Exception ex)
                    {
                        response = BridgeResponse.Fail(request.Id, "SAVE_FAILED", ex.Message);
                    }
                    return true;

                case "suppliers:archive":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "معرف المورد مفقود");
                        return true;
                    }
                    JObject archObj = request.Payload as JObject;
                    string archId = archObj != null && archObj["id"] != null ? archObj["id"].ToString() : request.Payload.ToString();
                    bool archOk = DatabaseService.Suppliers.Archive(archId);
                    response = BridgeResponse.Ok(request.Id, new { success = archOk });
                    return true;

                case "suppliers:restore":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "معرف المورد مفقود");
                        return true;
                    }
                    JObject restObj = request.Payload as JObject;
                    string restId = restObj != null && restObj["id"] != null ? restObj["id"].ToString() : request.Payload.ToString();
                    bool restOk = DatabaseService.Suppliers.Restore(restId);
                    response = BridgeResponse.Ok(request.Id, new { success = restOk });
                    return true;

                case "suppliers:delete":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "معرف المورد مفقود");
                        return true;
                    }
                    try
                    {
                        JObject delObj = request.Payload as JObject;
                        string delId = delObj != null && delObj["id"] != null ? delObj["id"].ToString() : request.Payload.ToString();
                        bool delOk = DatabaseService.Suppliers.Delete(delId);
                        response = BridgeResponse.Ok(request.Id, new { success = delOk });
                    }
                    catch (Exception ex)
                    {
                        response = BridgeResponse.Fail(request.Id, "DELETE_FAILED", ex.Message);
                    }
                    return true;

                case "suppliers:recordPayment":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات السداد فارغة");
                        return true;
                    }
                    try
                    {
                        JObject payObj = request.Payload as JObject;
                        if (payObj == null || payObj["supplierId"] == null || payObj["amountPiasters"] == null)
                        {
                            response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات السداد غير مكتملة");
                            return true;
                        }
                        string pSupId = payObj["supplierId"].ToString();
                        long pAmount = payObj["amountPiasters"].Value<long>();
                        string pNotes = payObj["notes"] != null ? payObj["notes"].ToString() : "";
                        string pSource = payObj["paymentSource"] != null ? payObj["paymentSource"].ToString() : "cash_drawer";
                        string supPayUserId = SecurityService.CurrentUser != null ? SecurityService.CurrentUser.Id : null;
                        DatabaseService.Suppliers.RecordPayment(pSupId, pAmount, pNotes, supPayUserId, pSource);
                        var updatedSup = DatabaseService.Suppliers.GetById(pSupId);
                        response = BridgeResponse.Ok(request.Id, updatedSup);
                    }
                    catch (Exception ex)
                    {
                        response = BridgeResponse.Fail(request.Id, "PAYMENT_FAILED", ex.Message);
                    }
                    return true;

                case "suppliers:getTransactions":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "معرف المورد مفقود");
                        return true;
                    }
                    JObject txObj = request.Payload as JObject;
                    string txSupId = txObj != null && txObj["supplierId"] != null ? txObj["supplierId"].ToString() : request.Payload.ToString();
                    int txLimit = 50;
                    if (txObj != null && txObj["limit"] != null)
                    {
                        txLimit = txObj["limit"].Value<int>();
                    }
                    var transactions = DatabaseService.Suppliers.GetTransactions(txSupId, txLimit);
                    response = BridgeResponse.Ok(request.Id, transactions);
                    return true;

                case "suppliers:verifyBalance":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "معرف المورد مفقود");
                        return true;
                    }
                    JObject vObj = request.Payload as JObject;
                    string vSupId = vObj != null && vObj["supplierId"] != null ? vObj["supplierId"].ToString() : request.Payload.ToString();
                    var vResult = DatabaseService.Suppliers.VerifyBalance(vSupId);
                    if (vResult == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "NOT_FOUND", "المورد غير موجود");
                    }
                    else
                    {
                        response = BridgeResponse.Ok(request.Id, vResult);
                    }
                    return true;

                case "suppliers:recalculateBalance":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "معرف المورد مفقود");
                        return true;
                    }
                    try
                    {
                        JObject rObj = request.Payload as JObject;
                        string rSupId = rObj != null && rObj["supplierId"] != null ? rObj["supplierId"].ToString() : request.Payload.ToString();
                        string rUserId = SecurityService.CurrentUser != null ? SecurityService.CurrentUser.Id : null;
                        var fixedSup = DatabaseService.Suppliers.RecalculateAndFixBalance(rSupId, rUserId);
                        if (fixedSup == null)
                        {
                            response = BridgeResponse.Fail(request.Id, "NOT_FOUND", "المورد غير موجود");
                        }
                        else
                        {
                            response = BridgeResponse.Ok(request.Id, fixedSup);
                        }
                    }
                    catch (Exception ex)
                    {
                        response = BridgeResponse.Fail(request.Id, "RECALCULATE_FAILED", ex.Message);
                    }
                    return true;

                case "suppliers:checkDiscrepancies":
                    var discList = DatabaseService.Suppliers.CheckDiscrepancies();
                    response = BridgeResponse.Ok(request.Id, discList);
                    return true;
            }

            return false;
        }
    }
}
