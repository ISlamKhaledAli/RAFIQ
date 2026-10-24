using System;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Bridge
{
    public partial class IpcDispatcher
    {
        private static bool TryDispatchLocations(BridgeRequest request, out BridgeResponse response)
        {
            response = null;
            switch (request.Action)
            {
                case "locations:list":
                    bool activeOnly = false;
                    if (request.Payload != null)
                    {
                        var pObj = request.Payload as JObject;
                        if (pObj != null && pObj["activeOnly"] != null)
                        {
                            activeOnly = pObj["activeOnly"].Value<bool>();
                        }
                    }
                    var locations = DatabaseService.StorageLocations.GetAll(activeOnly);
                    response = BridgeResponse.Ok(request.Id, locations);
                    return true;

                case "locations:get":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "معرف الموقع مطلوب.");
                        return true;
                    }
                    string locId = null;
                    var getObj = request.Payload as JObject;
                    if (getObj != null && getObj["id"] != null) locId = getObj["id"].ToString();
                    else locId = request.Payload.ToString();

                    var loc = DatabaseService.StorageLocations.GetById(locId);
                    if (loc == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "NOT_FOUND", "الموقع غير موجود.");
                    }
                    else
                    {
                        response = BridgeResponse.Ok(request.Id, loc);
                    }
                    return true;

                case "locations:save":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات الموقع مطلوبة.");
                        return true;
                    }
                    try
                    {
                        var locationToSave = JsonConvert.DeserializeObject<StorageLocation>(request.Payload.ToString());
                        string userId = SecurityService.CurrentUser != null ? SecurityService.CurrentUser.Id : "usr_admin_default";
                        var saved = DatabaseService.StorageLocations.Save(locationToSave, userId);
                        response = BridgeResponse.Ok(request.Id, saved);
                    }
                    catch (Exception ex)
                    {
                        response = BridgeResponse.Fail(request.Id, "SAVE_FAILED", ex.Message);
                    }
                    return true;

                case "locations:delete":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "معرف الموقع مطلوب.");
                        return true;
                    }
                    string delId = null;
                    var delObj = request.Payload as JObject;
                    if (delObj != null && delObj["id"] != null) delId = delObj["id"].ToString();
                    else delId = request.Payload.ToString();

                    string delUserId = SecurityService.CurrentUser != null ? SecurityService.CurrentUser.Id : "usr_admin_default";
                    DatabaseService.StorageLocations.Delete(delId, delUserId);
                    response = BridgeResponse.Ok(request.Id, new { success = true });
                    return true;

                case "locations:assignProduct":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "البيانات غير مكتملة.");
                        return true;
                    }
                    var assignObj = request.Payload as JObject;
                    if (assignObj == null || assignObj["productId"] == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "معرف الصنف مطلوب.");
                        return true;
                    }
                    string assignProdId = assignObj["productId"].ToString();
                    string targetLocId = assignObj["locationId"] != null ? assignObj["locationId"].ToString() : null;
                    bool isCold = assignObj["isColdChain"] != null && assignObj["isColdChain"].Value<bool>();
                    string assignUserId = SecurityService.CurrentUser != null ? SecurityService.CurrentUser.Id : "usr_admin_default";

                    DatabaseService.StorageLocations.AssignProduct(assignProdId, targetLocId, isCold, assignUserId);
                    response = BridgeResponse.Ok(request.Id, new { success = true });
                    return true;

                case "locations:getDraftInventory":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "معرف الموقع مطلوب.");
                        return true;
                    }
                    string draftLocId = null;
                    var draftObj = request.Payload as JObject;
                    if (draftObj != null && draftObj["locationId"] != null) draftLocId = draftObj["locationId"].ToString();
                    else if (draftObj != null && draftObj["id"] != null) draftLocId = draftObj["id"].ToString();
                    else draftLocId = request.Payload.ToString();

                    try
                    {
                        var draft = DatabaseService.StorageLocations.GetDraftInventory(draftLocId);
                        response = BridgeResponse.Ok(request.Id, draft);
                    }
                    catch (Exception ex)
                    {
                        response = BridgeResponse.Fail(request.Id, "DRAFT_FAILED", ex.Message);
                    }
                    return true;

                case "locations:getProducts":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "معرف الموقع مطلوب.");
                        return true;
                    }
                    string prodsLocId = null;
                    var prodsObj = request.Payload as JObject;
                    if (prodsObj != null && prodsObj["locationId"] != null) prodsLocId = prodsObj["locationId"].ToString();
                    else prodsLocId = request.Payload.ToString();

                    var prods = DatabaseService.StorageLocations.GetProductsByLocation(prodsLocId);
                    response = BridgeResponse.Ok(request.Id, prods);
                    return true;
            }

            return false;
        }
    }
}
