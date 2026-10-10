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
        private static bool TryDispatchAuth(BridgeRequest request, out BridgeResponse response)
        {
            response = null;
            switch (request.Action)
            {
                case "security:getStatus":
                    var secStatus = DatabaseService.Security.GetStatus();
                    response = BridgeResponse.Ok(request.Id, secStatus);
                    return true;

                case "security:verifyPin":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات التحقق فارغة");
                        return true;
                    }
                    JObject verifyObj = request.Payload as JObject;
                    string verifyPinVal = verifyObj != null && verifyObj["pin"] != null ? verifyObj["pin"].ToString() : "";
                    string verifyActionVal = verifyObj != null && verifyObj["action"] != null ? verifyObj["action"].ToString() : "";
                    var verifyResult = DatabaseService.Security.VerifyPin(verifyPinVal, verifyActionVal);
                    response = BridgeResponse.Ok(request.Id, verifyResult);
                    return true;

                case "security:setPin":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات تعيين الرقم السري فارغة");
                        return true;
                    }
                    JObject setPinObj = request.Payload as JObject;
                    string newPin = setPinObj != null && setPinObj["newPin"] != null ? setPinObj["newPin"].ToString() : "";
                    string currPin = setPinObj != null && setPinObj["currentPin"] != null ? setPinObj["currentPin"].ToString() : null;
                    string recCode = setPinObj != null && setPinObj["recoveryCode"] != null ? setPinObj["recoveryCode"].ToString() : null;
                    var setPinResult = DatabaseService.Security.SetPin(newPin, currPin, recCode);
                    if (!setPinResult.Success)
                    {
                        response = BridgeResponse.Fail(request.Id, "PIN_SET_FAILED", setPinResult.Message);
                        return true;
                    }
                    response = BridgeResponse.Ok(request.Id, setPinResult);
                    return true;

                case "security:resetWithRecovery":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات الاسترجاع فارغة");
                        return true;
                    }
                    JObject recoveryPayloadObj = request.Payload as JObject;
                    string rCode = recoveryPayloadObj != null && recoveryPayloadObj["recoveryCode"] != null ? recoveryPayloadObj["recoveryCode"].ToString() : "";
                    string rNewPin = recoveryPayloadObj != null && recoveryPayloadObj["newPin"] != null ? recoveryPayloadObj["newPin"].ToString() : "";
                    var recResult = DatabaseService.Security.ResetWithRecoveryCode(rCode, rNewPin);
                    if (!recResult.Success)
                    {
                        response = BridgeResponse.Fail(request.Id, "RECOVERY_FAILED", recResult.Message);
                        return true;
                    }
                    response = BridgeResponse.Ok(request.Id, recResult);
                    return true;

                case "security:disablePin":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "الرقم السري الحالي مطلوب لإلغاء التفعيل");
                        return true;
                    }
                    JObject disObj = request.Payload as JObject;
                    string disPin = disObj != null && disObj["currentPin"] != null ? disObj["currentPin"].ToString() : "";
                    bool disabled = DatabaseService.Security.DisablePin(disPin);
                    if (!disabled)
                    {
                        response = BridgeResponse.Fail(request.Id, "PIN_DISABLE_FAILED", "الرقم السري غير صحيح");
                        return true;
                    }
                    response = BridgeResponse.Ok(request.Id, new { success = true });
                    return true;

                case "security:enablePin":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "الرقم السري الحالي مطلوب للتفعيل");
                        return true;
                    }
                    JObject enObj = request.Payload as JObject;
                    string enPin = enObj != null && enObj["currentPin"] != null ? enObj["currentPin"].ToString() : "";
                    bool enabled = DatabaseService.Security.EnablePin(enPin);
                    if (!enabled)
                    {
                        response = BridgeResponse.Fail(request.Id, "PIN_ENABLE_FAILED", "الرقم السري غير صحيح");
                        return true;
                    }
                    response = BridgeResponse.Ok(request.Id, new { success = true });
                    return true;

                case "security:saveProtectedActions":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات العمليات المحمية فارغة");
                        return true;
                    }
                    JObject actObj = request.Payload as JObject;
                    string actPin = actObj != null && actObj["currentPin"] != null ? actObj["currentPin"].ToString() : "";
                    Dictionary<string, bool> actionsDict = new Dictionary<string, bool>();
                    if (actObj != null && actObj["actions"] != null)
                    {
                        actionsDict = JsonConvert.DeserializeObject<Dictionary<string, bool>>(actObj["actions"].ToString());
                    }
                    bool actSaved = DatabaseService.Security.SaveProtectedActions(actionsDict, actPin);
                    if (!actSaved)
                    {
                        response = BridgeResponse.Fail(request.Id, "AUTH_FAILED", "الرقم السري غير صحيح لحفظ إعدادات الحماية");
                        return true;
                    }
                    response = BridgeResponse.Ok(request.Id, new { success = true });
                    return true;

                case "auth:login":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات تسجيل الدخول فارغة");
                        return true;
                    }
                    JObject loginObj = request.Payload as JObject;
                    string loginUser = "";
                    if (loginObj != null)
                    {
                        if (loginObj["username"] != null) loginUser = loginObj["username"].ToString();
                        else if (loginObj["usernameOrId"] != null) loginUser = loginObj["usernameOrId"].ToString();
                    }
                    string loginSecret = "";
                    if (loginObj != null)
                    {
                        if (loginObj["password"] != null) loginSecret = loginObj["password"].ToString();
                        else if (loginObj["pin"] != null) loginSecret = loginObj["pin"].ToString();
                    }
                    var loginRes = DatabaseService.Security.Login(loginUser, loginSecret);
                    if (!loginRes.Success)
                    {
                        response = BridgeResponse.Fail(request.Id, "AUTH_FAILED", loginRes.Message, loginRes);
                        return true;
                    }
                    response = BridgeResponse.Ok(request.Id, loginRes);
                    return true;

                case "auth:logout":
                    DatabaseService.Security.Logout();
                    response = BridgeResponse.Ok(request.Id, new { success = true });
                    return true;

                case "auth:getCurrentUser":
                    var currentUserDto = DatabaseService.Security.GetCurrentSessionUser();
                    response = BridgeResponse.Ok(request.Id, currentUserDto);
                    return true;

                case "auth:hasPermission":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "مفتاح الصلاحية مطلوب");
                        return true;
                    }
                    JObject hasObj = request.Payload as JObject;
                    string permKey = "";
                    if (hasObj != null)
                    {
                        if (hasObj["permission"] != null) permKey = hasObj["permission"].ToString();
                        else if (hasObj["permKey"] != null) permKey = hasObj["permKey"].ToString();
                    }
                    bool hasPerm = DatabaseService.Security.HasPermission(null, permKey);
                    response = BridgeResponse.Ok(request.Id, new { hasPermission = hasPerm });
                    return true;

                case "auth:getActiveUsers":
                    var activeUsers = DatabaseService.Security.GetActiveUsers();
                    response = BridgeResponse.Ok(request.Id, activeUsers);
                    return true;

                case "auth:verifySupervisor":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات التحقق فارغة");
                        return true;
                    }
                    JObject supObj = request.Payload as JObject;
                    string supPin = supObj != null && supObj["pin"] != null ? supObj["pin"].ToString() : "";
                    string supAction = supObj != null && supObj["action"] != null ? supObj["action"].ToString() : "SUPERVISOR_ACTION";
                    var supRes = DatabaseService.Security.VerifySupervisorPin(supPin, supAction);
                    if (!supRes.Success)
                    {
                        response = BridgeResponse.Fail(request.Id, "SUPERVISOR_AUTH_FAILED", supRes.Message);
                        return true;
                    }
                    response = BridgeResponse.Ok(request.Id, supRes);
                    return true;

                case "users:getAll":
                    if (!DatabaseService.Security.IsCurrentSessionAdmin())
                    {
                        JObject supObjAll = request.Payload as JObject;
                        string supPinAll = supObjAll != null && supObjAll["supervisorPin"] != null ? supObjAll["supervisorPin"].ToString() : "";
                        if (string.IsNullOrEmpty(supPinAll) || !DatabaseService.Security.VerifySupervisorPin(supPinAll, "VIEW_USERS").Success)
                        {
                            response = BridgeResponse.Fail(request.Id, "UNAUTHORIZED", "غير مصرح: عرض بيانات الموظفين يتطلب صلاحيات مدير النظام.");
                            return true;
                        }
                    }
                    var allUsersList = DatabaseService.Security.GetAllUsers();
                    response = BridgeResponse.Ok(request.Id, allUsersList);
                    return true;

                case "users:getTree":
                    JObject treeObj = request.Payload as JObject;
                    string treeParentId = treeObj != null && treeObj["parentId"] != null ? treeObj["parentId"].ToString() : null;
                    var treeList = DatabaseService.Security.GetUserTree(treeParentId);
                    response = BridgeResponse.Ok(request.Id, treeList);
                    return true;

                case "users:createSubUser":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات إنشاء الحساب فارغة");
                        return true;
                    }
                    JObject subObj = request.Payload as JObject;
                    string sParentId = subObj != null && subObj["parentId"] != null ? subObj["parentId"].ToString() : null;
                    string sUsername = subObj != null && subObj["username"] != null ? subObj["username"].ToString() : "";
                    string sDisplayName = subObj != null && subObj["displayName"] != null ? subObj["displayName"].ToString() : "";
                    string sPassword = subObj != null && subObj["password"] != null ? subObj["password"].ToString() : null;
                    string sPin = subObj != null && subObj["pin"] != null ? subObj["pin"].ToString() : null;
                    string sRole = subObj != null && subObj["role"] != null ? subObj["role"].ToString() : "cashier";
                    bool sCanDelegate = subObj != null && subObj["canDelegate"] != null ? subObj["canDelegate"].Value<bool>() : false;
                    int sMaxDepth = subObj != null && subObj["maxDepth"] != null ? subObj["maxDepth"].Value<int>() : 0;
                    Dictionary<string, bool> sPerms = null;
                    if (subObj != null && subObj["permissions"] != null)
                    {
                        sPerms = JsonConvert.DeserializeObject<Dictionary<string, bool>>(subObj["permissions"].ToString());
                    }
                    try
                    {
                        var createdSub = DatabaseService.Security.CreateSubUser(sParentId, sUsername, sDisplayName, sPassword, sPin, sRole, sPerms, sCanDelegate, sMaxDepth);
                        response = BridgeResponse.Ok(request.Id, createdSub);
                    }
                    catch (Exception ex)
                    {
                        response = BridgeResponse.Fail(request.Id, "USER_CREATE_ERROR", ex.Message);
                    }
                    return true;

                case "users:updatePermissions":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات الصلاحيات فارغة");
                        return true;
                    }
                    JObject pObj = request.Payload as JObject;
                    string pUserId = "";
                    if (pObj != null)
                    {
                        if (pObj["userId"] != null) pUserId = pObj["userId"].ToString();
                        else if (pObj["id"] != null) pUserId = pObj["id"].ToString();
                    }
                    Dictionary<string, bool> pDict = new Dictionary<string, bool>();
                    if (pObj != null && pObj["permissions"] != null)
                    {
                        pDict = JsonConvert.DeserializeObject<Dictionary<string, bool>>(pObj["permissions"].ToString());
                    }
                    try
                    {
                        DatabaseService.Security.UpdateUserPermissions(pUserId, pDict);
                        response = BridgeResponse.Ok(request.Id, new { success = true });
                    }
                    catch (Exception ex)
                    {
                        response = BridgeResponse.Fail(request.Id, "PERMISSIONS_UPDATE_ERROR", ex.Message);
                    }
                    return true;

                case "users:setDelegation":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات التفويض فارغة");
                        return true;
                    }
                    JObject delObj = request.Payload as JObject;
                    string delUserId = "";
                    if (delObj != null)
                    {
                        if (delObj["userId"] != null) delUserId = delObj["userId"].ToString();
                        else if (delObj["id"] != null) delUserId = delObj["id"].ToString();
                    }
                    bool delCan = delObj != null && delObj["canDelegate"] != null ? delObj["canDelegate"].Value<bool>() : false;
                    int delDepth = delObj != null && delObj["maxDepth"] != null ? delObj["maxDepth"].Value<int>() : 0;
                    try
                    {
                        DatabaseService.Security.SetUserDelegation(delUserId, delCan, delDepth);
                        response = BridgeResponse.Ok(request.Id, new { success = true });
                    }
                    catch (Exception ex)
                    {
                        response = BridgeResponse.Fail(request.Id, "DELEGATION_UPDATE_ERROR", ex.Message);
                    }
                    return true;

                case "users:setPassword":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات كلمة المرور فارغة");
                        return true;
                    }
                    JObject passObj = request.Payload as JObject;
                    string passUserId = "";
                    if (passObj != null)
                    {
                        if (passObj["userId"] != null) passUserId = passObj["userId"].ToString();
                        else if (passObj["id"] != null) passUserId = passObj["id"].ToString();
                    }
                    string passNew = passObj != null && passObj["newPassword"] != null ? passObj["newPassword"].ToString() : "";
                    string passCurrent = passObj != null && passObj["currentPassword"] != null ? passObj["currentPassword"].ToString() : "";
                    try
                    {
                        DatabaseService.Security.SetUserPassword(passUserId, passNew, passCurrent);
                        response = BridgeResponse.Ok(request.Id, new { success = true });
                    }
                    catch (Exception ex)
                    {
                        response = BridgeResponse.Fail(request.Id, "PASSWORD_CHANGE_ERROR", ex.Message);
                    }
                    return true;

                case "users:create":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات إنشاء الموظف فارغة");
                        return true;
                    }
                    JObject createUObj = request.Payload as JObject;
                    string createSupPin = createUObj != null && createUObj["supervisorPin"] != null ? createUObj["supervisorPin"].ToString() : "";
                    if (!DatabaseService.Security.IsCurrentSessionAdmin() && (string.IsNullOrEmpty(createSupPin) || !DatabaseService.Security.VerifySupervisorPin(createSupPin, "USER_CREATE").Success))
                    {
                        response = BridgeResponse.Fail(request.Id, "UNAUTHORIZED", "غير مصرح: إضافة موظفين تتطلب صلاحيات مدير النظام.");
                        return true;
                    }

                    string uName = createUObj != null && createUObj["username"] != null ? createUObj["username"].ToString() : "";
                    string dName = createUObj != null && createUObj["displayName"] != null ? createUObj["displayName"].ToString() : "";
                    string uPin = createUObj != null && createUObj["pin"] != null ? createUObj["pin"].ToString() : "";
                    string uRole = createUObj != null && createUObj["role"] != null ? createUObj["role"].ToString() : "cashier";
                    try
                    {
                        var createdUser = DatabaseService.Security.CreateUser(uName, dName, uPin, uRole);
                        response = BridgeResponse.Ok(request.Id, createdUser);
                    }
                    catch (Exception uEx)
                    {
                        response = BridgeResponse.Fail(request.Id, "USER_CREATE_ERROR", uEx.Message);
                    }
                    return true;

                case "users:update":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات تعديل الموظف فارغة");
                        return true;
                    }
                    JObject updateUObj = request.Payload as JObject;
                    string updateSupPin = updateUObj != null && updateUObj["supervisorPin"] != null ? updateUObj["supervisorPin"].ToString() : "";
                    if (!DatabaseService.Security.IsCurrentSessionAdmin() && (string.IsNullOrEmpty(updateSupPin) || !DatabaseService.Security.VerifySupervisorPin(updateSupPin, "USER_UPDATE").Success))
                    {
                        response = BridgeResponse.Fail(request.Id, "UNAUTHORIZED", "غير مصرح: تعديل بيانات الموظفين يتطلب صلاحيات مدير النظام.");
                        return true;
                    }

                    string updId = updateUObj != null && updateUObj["id"] != null ? updateUObj["id"].ToString() : "";
                    string updName = updateUObj != null && updateUObj["displayName"] != null ? updateUObj["displayName"].ToString() : "";
                    string updRole = updateUObj != null && updateUObj["role"] != null ? updateUObj["role"].ToString() : "cashier";
                    bool updActive = updateUObj != null && updateUObj["isActive"] != null ? updateUObj["isActive"].Value<bool>() : true;
                    try
                    {
                        DatabaseService.Security.UpdateUser(updId, updName, updRole, updActive);
                        response = BridgeResponse.Ok(request.Id, new { success = true });
                    }
                    catch (Exception uEx)
                    {
                        response = BridgeResponse.Fail(request.Id, "USER_UPDATE_ERROR", uEx.Message);
                    }
                    return true;

                case "users:changePin":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات تغيير الرقم السري فارغة");
                        return true;
                    }
                    JObject chPinObj = request.Payload as JObject;
                    string targetUId = chPinObj != null && chPinObj["id"] != null ? chPinObj["id"].ToString() : "";
                    string targetPin = chPinObj != null && chPinObj["newPin"] != null ? chPinObj["newPin"].ToString() : "";
                    string curPin = chPinObj != null && chPinObj["currentPin"] != null ? chPinObj["currentPin"].ToString() : "";
                    string chSupPin = chPinObj != null && chPinObj["supervisorPin"] != null ? chPinObj["supervisorPin"].ToString() : "";
                    try
                    {
                        DatabaseService.Security.ChangeUserPinSecure(targetUId, targetPin, curPin, chSupPin);
                        response = BridgeResponse.Ok(request.Id, new { success = true });
                    }
                    catch (Exception uEx)
                    {
                        response = BridgeResponse.Fail(request.Id, "PIN_CHANGE_ERROR", uEx.Message);
                    }
                    return true;


                case "security:setIdleTimeout":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات مهلة الخمول فارغة");
                        return true;
                    }
                    JObject timeoutObj = request.Payload as JObject;
                    int idleMin = timeoutObj != null && timeoutObj["minutes"] != null ? timeoutObj["minutes"].Value<int>() : 15;
                    DatabaseService.Security.SetIdleTimeoutMinutes(idleMin);
                    response = BridgeResponse.Ok(request.Id, new { minutes = idleMin });
                    return true;

                case "security:getDeviceFingerprint":
                    string fp = DatabaseService.Encryption != null ? DatabaseService.Encryption.DeviceFingerprint : EncryptionService.GenerateDeviceFingerprint();
                    response = BridgeResponse.Ok(request.Id, new
                    {
                        deviceFingerprint = fp,
                        isEncrypted = true,
                        encryptionAlgorithm = "AES-256-CBC + HMAC-SHA256"
                    });
                    return true;

                case "security:runTests":
                    var secTestRes = SecurityTestRunner.RunAllTests(DatabaseService.ConnectionString, DatabaseService.DbPath);
                    response = BridgeResponse.Ok(request.Id, secTestRes);
                    return true;

                default:
                    return false;
            }
        }
    }
}
