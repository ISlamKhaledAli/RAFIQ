using System;
using Newtonsoft.Json.Linq;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Bridge
{
    public partial class IpcDispatcher
    {
        private static bool TryDispatchShifts(BridgeRequest request, out BridgeResponse response)
        {
            response = null;
            switch (request.Action)
            {
                case "shifts:getActive":
                    string posRegister = "default_pos";
                    JObject getActObj = request.Payload as JObject;
                    if (getActObj != null && getActObj["posRegisterId"] != null)
                    {
                        posRegister = getActObj["posRegisterId"].ToString();
                    }
                    var activeShift = DatabaseService.Shifts.GetActiveShift(posRegister);
                    response = BridgeResponse.Ok(request.Id, activeShift);
                    return true;

                case "shifts:open":
                    JObject openObj = request.Payload as JObject;
                    if (openObj == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات فتح الوردية فارغة.");
                        return true;
                    }
                    try
                    {
                        var openReq = openObj.ToObject<OpenShiftRequest>();
                        var opened = DatabaseService.Shifts.OpenShift(openReq);
                        response = BridgeResponse.Ok(request.Id, opened);
                    }
                    catch (InvalidOperationException invEx)
                    {
                        response = BridgeResponse.Fail(request.Id, "SHIFT_OPEN_ERROR", invEx.Message);
                    }
                    catch (Exception ex)
                    {
                        response = BridgeResponse.Fail(request.Id, "SHIFT_OPEN_FAILED", ex.Message);
                    }
                    return true;

                case "shifts:close":
                    JObject closeObj = request.Payload as JObject;
                    if (closeObj == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات إغلاق الوردية فارغة.");
                        return true;
                    }
                    try
                    {
                        var closeReq = closeObj.ToObject<CloseShiftRequest>();
                        var closed = DatabaseService.Shifts.CloseShift(closeReq);
                        response = BridgeResponse.Ok(request.Id, closed);
                    }
                    catch (InvalidOperationException invEx)
                    {
                        response = BridgeResponse.Fail(request.Id, "SHIFT_CLOSE_ERROR", invEx.Message);
                    }
                    catch (Exception ex)
                    {
                        response = BridgeResponse.Fail(request.Id, "SHIFT_CLOSE_FAILED", ex.Message);
                    }
                    return true;

                case "shifts:getSummary":
                    string sumShiftId = null;
                    JObject sumObj = request.Payload as JObject;
                    if (sumObj != null && sumObj["shiftId"] != null)
                    {
                        sumShiftId = sumObj["shiftId"].ToString();
                    }
                    var summary = DatabaseService.Shifts.GetShiftSummary(sumShiftId);
                    response = BridgeResponse.Ok(request.Id, summary);
                    return true;

                case "shifts:getRecent":
                case "shifts:getHistory":
                    int limit = 30;
                    JObject histObj = request.Payload as JObject;
                    if (histObj != null && histObj["limit"] != null)
                    {
                        int.TryParse(histObj["limit"].ToString(), out limit);
                    }
                    var history = DatabaseService.Shifts.GetRecentShifts(limit);
                    response = BridgeResponse.Ok(request.Id, history);
                    return true;

                case "shifts:cashIn":
                case "drawer:cashIn":
                    JObject inObj = request.Payload as JObject;
                    if (inObj == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات الإيداع فارغة.");
                        return true;
                    }
                    try
                    {
                        var inReq = inObj.ToObject<CashMovementRequest>();
                        var inTx = DatabaseService.CashDrawer.RecordCashIn(inReq);
                        response = BridgeResponse.Ok(request.Id, inTx);
                    }
                    catch (InvalidOperationException invEx)
                    {
                        response = BridgeResponse.Fail(request.Id, "DRAWER_CASH_IN_ERROR", invEx.Message);
                    }
                    catch (Exception ex)
                    {
                        response = BridgeResponse.Fail(request.Id, "DRAWER_CASH_IN_FAILED", ex.Message);
                    }
                    return true;

                case "shifts:cashOut":
                case "drawer:cashOut":
                    JObject outObj = request.Payload as JObject;
                    if (outObj == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات السحب فارغة.");
                        return true;
                    }
                    try
                    {
                        var outReq = outObj.ToObject<CashMovementRequest>();
                        var outTx = DatabaseService.CashDrawer.RecordCashOut(outReq);
                        response = BridgeResponse.Ok(request.Id, outTx);
                    }
                    catch (InvalidOperationException invEx)
                    {
                        response = BridgeResponse.Fail(request.Id, "DRAWER_CASH_OUT_ERROR", invEx.Message);
                    }
                    catch (Exception ex)
                    {
                        response = BridgeResponse.Fail(request.Id, "DRAWER_CASH_OUT_FAILED", ex.Message);
                    }
                    return true;

                case "shifts:getMovements":
                case "drawer:getMovements":
                    string movShiftId = null;
                    JObject movObj = request.Payload as JObject;
                    if (movObj != null && movObj["shiftId"] != null)
                    {
                        movShiftId = movObj["shiftId"].ToString();
                    }
                    var movements = DatabaseService.CashDrawer.GetMovements(movShiftId);
                    response = BridgeResponse.Ok(request.Id, movements);
                    return true;

                case "shifts:getLiveBalance":
                case "drawer:getLiveBalance":
                    string balShiftId = null;
                    JObject balObj = request.Payload as JObject;
                    if (balObj != null && balObj["shiftId"] != null)
                    {
                        balShiftId = balObj["shiftId"].ToString();
                    }
                    var liveBal = DatabaseService.CashDrawer.GetLiveDrawerBalance(balShiftId);
                    response = BridgeResponse.Ok(request.Id, liveBal);
                    return true;

                case "drawer:openManual":
                case "drawer:kick":
                    string opReason = null;
                    JObject opObj = request.Payload as JObject;
                    if (opObj != null && opObj["reason"] != null)
                    {
                        opReason = opObj["reason"].ToString();
                    }
                    bool opSuccess = DatabaseService.CashDrawer.OpenDrawerManual(opReason);
                    response = BridgeResponse.Ok(request.Id, new { success = opSuccess });
                    return true;
            }

            return false;
        }
    }
}
