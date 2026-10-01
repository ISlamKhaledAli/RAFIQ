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
                        DatabaseService.Suppliers.RecordPayment(pSupId, pAmount, pNotes);
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
            }

            return false;
        }
    }
}
