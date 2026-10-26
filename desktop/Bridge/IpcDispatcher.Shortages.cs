using System;
using System.Collections.Generic;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Bridge
{
    public partial class IpcDispatcher
    {
        private static bool TryDispatchShortages(BridgeRequest request, out BridgeResponse response)
        {
            response = null;
            switch (request.Action)
            {
                case "shortages:getAll":
                case "shortages:list":
                    string status = null;
                    string source = null;
                    string supplierId = null;
                    string search = null;

                    if (request.Payload != null)
                    {
                        var pObj = request.Payload as JObject;
                        if (pObj != null)
                        {
                            if (pObj["status"] != null) status = pObj["status"].ToString();
                            if (pObj["source"] != null) source = pObj["source"].ToString();
                            if (pObj["supplierId"] != null) supplierId = pObj["supplierId"].ToString();
                            if (pObj["search"] != null) search = pObj["search"].ToString();
                        }
                    }

                    var list = DatabaseService.Shortages.GetAll(status, source, supplierId, search);
                    response = BridgeResponse.Ok(request.Id, list);
                    return true;

                case "shortages:get":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "معرف القيد مطلوب.");
                        return true;
                    }

                    string id = null;
                    var getObj = request.Payload as JObject;
                    if (getObj != null && getObj["id"] != null) id = getObj["id"].ToString();
                    else id = request.Payload.ToString();

                    var entry = DatabaseService.Shortages.GetById(id);
                    if (entry == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "NOT_FOUND", "قيد النواقص غير موجود.");
                    }
                    else
                    {
                        response = BridgeResponse.Ok(request.Id, entry);
                    }
                    return true;

                case "shortages:save":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات النواقص مطلوبة.");
                        return true;
                    }
                    try
                    {
                        var entryToSave = JsonConvert.DeserializeObject<ShortageEntry>(request.Payload.ToString());
                        string userId = SecurityService.CurrentUser != null ? SecurityService.CurrentUser.Id : "usr_admin_default";
                        var saved = DatabaseService.Shortages.Save(entryToSave, userId);
                        response = BridgeResponse.Ok(request.Id, saved);
                    }
                    catch (Exception ex)
                    {
                        response = BridgeResponse.Fail(request.Id, "SAVE_FAILED", ex.Message);
                    }
                    return true;

                case "shortages:updateStatus":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "البيانات مطلوبة.");
                        return true;
                    }
                    try
                    {
                        var uObj = request.Payload as JObject;
                        string sId = uObj != null && uObj["id"] != null ? uObj["id"].ToString() : null;
                        string sStatus = uObj != null && uObj["status"] != null ? uObj["status"].ToString() : "open";
                        string sPurchId = uObj != null && uObj["purchaseId"] != null ? uObj["purchaseId"].ToString() : null;
                        bool increaseStock = true;
                        if (uObj != null && uObj["increaseStock"] != null)
                        {
                            increaseStock = Convert.ToBoolean(uObj["increaseStock"]);
                        }

                        string userId = SecurityService.CurrentUser != null ? SecurityService.CurrentUser.Id : "usr_admin_default";
                        DatabaseService.Shortages.UpdateStatus(sId, sStatus, sPurchId, userId, increaseStock);
                        response = BridgeResponse.Ok(request.Id, true);
                    }
                    catch (Exception ex)
                    {
                        response = BridgeResponse.Fail(request.Id, "UPDATE_FAILED", ex.Message);
                    }
                    return true;

                case "shortages:delete":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "معرف القيد مطلوب.");
                        return true;
                    }
                    try
                    {
                        string delId = null;
                        var dObj = request.Payload as JObject;
                        if (dObj != null && dObj["id"] != null) delId = dObj["id"].ToString();
                        else delId = request.Payload.ToString();

                        string userId = SecurityService.CurrentUser != null ? SecurityService.CurrentUser.Id : "usr_admin_default";
                        DatabaseService.Shortages.Delete(delId, userId);
                        response = BridgeResponse.Ok(request.Id, true);
                    }
                    catch (Exception ex)
                    {
                        response = BridgeResponse.Fail(request.Id, "DELETE_FAILED", ex.Message);
                    }
                    return true;

                case "shortages:convertToPurchase":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "قائمة النواقص مطلوبة.");
                        return true;
                    }
                    try
                    {
                        var cObj = request.Payload as JObject;
                        var sIds = new List<string>();
                        string suppId = null;

                        if (cObj != null)
                        {
                            var arr = cObj["shortageIds"] as JArray;
                            if (arr != null)
                            {
                                for (int i = 0; i < arr.Count; i++) sIds.Add(arr[i].ToString());
                            }
                            if (cObj["supplierId"] != null) suppId = cObj["supplierId"].ToString();
                        }

                        string userId = SecurityService.CurrentUser != null ? SecurityService.CurrentUser.Id : "usr_admin_default";
                        var proposal = DatabaseService.Shortages.ConvertToPurchaseProposal(sIds, suppId, userId);
                        response = BridgeResponse.Ok(request.Id, proposal);
                    }
                    catch (Exception ex)
                    {
                        response = BridgeResponse.Fail(request.Id, "CONVERT_FAILED", ex.Message);
                    }
                    return true;

                case "shortages:getAuto":
                case "shortages:getAutoShortages":
                    try
                    {
                        int coverDays = 15;
                        var aObj = request.Payload as JObject;
                        if (aObj != null && aObj["targetCoverDays"] != null)
                        {
                            int.TryParse(aObj["targetCoverDays"].ToString(), out coverDays);
                        }
                        var autoList = DatabaseService.Shortages.GetAutoShortages(coverDays);
                        response = BridgeResponse.Ok(request.Id, autoList);
                    }
                    catch (Exception ex)
                    {
                        response = BridgeResponse.Fail(request.Id, "AUTO_SHORTAGE_FAILED", ex.Message);
                    }
                    return true;

                case "shortages:getLostSalesReport":
                    {
                        try
                        {
                            string fromDate = null;
                            string toDate = null;
                            string reportSource = null;
                            string reportStatus = null;
                            var rObj = request.Payload as JObject;
                            if (rObj != null)
                            {
                                if (rObj["fromDate"] != null) fromDate = rObj["fromDate"].ToString();
                                if (rObj["toDate"] != null) toDate = rObj["toDate"].ToString();
                                if (rObj["source"] != null) reportSource = rObj["source"].ToString();
                                if (rObj["status"] != null) reportStatus = rObj["status"].ToString();
                                if (rObj["days"] != null)
                                {
                                    int daysVal = 30;
                                    if (int.TryParse(rObj["days"].ToString(), out daysVal) && daysVal > 0)
                                    {
                                        fromDate = DateTime.UtcNow.AddDays(-daysVal).ToString("yyyy-MM-dd HH:mm:ss");
                                    }
                                }
                            }
                            var report = DatabaseService.Shortages.GetLostSalesReport(fromDate, toDate, reportSource, reportStatus);
                            response = BridgeResponse.Ok(request.Id, report);
                        }
                        catch (Exception ex)
                        {
                            response = BridgeResponse.Fail(request.Id, "REPORT_FAILED", ex.Message);
                        }
                        return true;
                    }
            }

            return false;
        }
    }
}
