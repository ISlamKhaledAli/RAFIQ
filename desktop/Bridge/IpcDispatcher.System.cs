using System;
using System.Collections.Generic;
using System.Windows.Forms;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using RafiqPOS.Common;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Bridge
{
    public partial class IpcDispatcher
    {
        private static bool TryDispatchSystem(BridgeRequest request, out BridgeResponse response)
        {
            response = null;
            switch (request.Action)
            {
                case "system:getInfo":
                    string osDetails = RafiqPOS.Common.OsDetector.GetOsFriendlyName() + (Environment.Is64BitOperatingSystem ? " (64-bit)" : " (32-bit)");
                    response = BridgeResponse.Ok(request.Id, new
                    {
                        appName = "رفيق POS",
                        version = "1.0.0",
                        osVersion = osDetails,
                        isWebView2 = true,
                        dbStatus = DatabaseService.GetStatus()
                    });
                    return true;

                case "system:ping":
                    response = BridgeResponse.Ok(request.Id, new { timestamp = DateTime.UtcNow.ToString("o") });
                    return true;

                case "window:toggleFullscreen":
                    if (RafiqPOS.MainForm.Instance != null)
                    {
                        RafiqPOS.MainForm.Instance.ToggleFullscreen();
                        response = BridgeResponse.Ok(request.Id, new { isFullscreen = RafiqPOS.MainForm.Instance.IsFullscreen() });
                        return true;
                    }
                    response = BridgeResponse.Ok(request.Id, new { isFullscreen = true });
                    return true;

                case "window:isFullscreen":
                    bool isFs = RafiqPOS.MainForm.Instance != null && RafiqPOS.MainForm.Instance.IsFullscreen();
                    response = BridgeResponse.Ok(request.Id, new { isFullscreen = isFs });
                    return true;

                case "window:minimize":
                    if (RafiqPOS.MainForm.Instance != null)
                    {
                        RafiqPOS.MainForm.Instance.Invoke(new Action(delegate { RafiqPOS.MainForm.Instance.WindowState = FormWindowState.Minimized; }));
                    }
                    response = BridgeResponse.Ok(request.Id, new { success = true });
                    return true;

                case "window:close":
                    if (RafiqPOS.MainForm.Instance != null)
                    {
                        RafiqPOS.MainForm.Instance.Invoke(new Action(delegate { RafiqPOS.MainForm.Instance.Close(); }));
                    }
                    response = BridgeResponse.Ok(request.Id, new { success = true });
                    return true;

                case "db:testTransaction":
                    int count = 10;
                    JObject jObj = request.Payload as JObject;
                    if (jObj != null && jObj["count"] != null)
                    {
                        count = jObj["count"].Value<int>();
                    }
                    TransactionResult result = DatabaseService.ExecuteAtomicSaleTransaction(count);
                    if (result.Success)
                    {
                        response = BridgeResponse.Ok(request.Id, new { success = true, message = result.Message });
                    }
                    else
                    {
                        response = BridgeResponse.Fail(request.Id, "DB_TRANSACTION_FAILED", result.Message);
                    }
                    return true;

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

                case "settings:getAll":
                    var allSettings = DatabaseService.Settings.GetAllSettings();
                    response = BridgeResponse.Ok(request.Id, allSettings);
                    return true;

                case "settings:save":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات الإعدادات فارغة");
                        return true;
                    }
                    var settingsDict = JsonConvert.DeserializeObject<Dictionary<string, string>>(request.Payload.ToString());
                    var updatedSettings = DatabaseService.Settings.SaveSettings(settingsDict);
                    response = BridgeResponse.Ok(request.Id, updatedSettings);
                    return true;

                case "features:getAll":
                    var flags = DatabaseService.Settings.GetFeatureFlags();
                    response = BridgeResponse.Ok(request.Id, flags);
                    return true;

                case "features:set":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات الميزة فارغة");
                        return true;
                    }
                    JObject featObj = request.Payload as JObject;
                    if (featObj != null && featObj["key"] != null && featObj["enabled"] != null)
                    {
                        string fKey = featObj["key"].ToString();
                        bool fEnabled = featObj["enabled"].Value<bool>();
                        DatabaseService.Settings.SetFeatureFlag(fKey, fEnabled);
                        response = BridgeResponse.Ok(request.Id, new { key = fKey, enabled = fEnabled });
                        return true;
                    }
                    response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "الحقول المطلوبة (key, enabled) ناقصة");
                    return true;

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
                    string loginUser = loginObj != null && loginObj["usernameOrId"] != null ? loginObj["usernameOrId"].ToString() : "";
                    string loginPin = loginObj != null && loginObj["pin"] != null ? loginObj["pin"].ToString() : "";
                    var loginRes = DatabaseService.Security.Login(loginUser, loginPin);
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

                case "templates:getAll":
                    var allTemplates = DatabaseService.Templates.GetAllTemplates();
                    response = BridgeResponse.Ok(request.Id, allTemplates);
                    return true;

                case "templates:isFirstRunNeeded":
                    bool needed = DatabaseService.Templates.IsFirstRunNeeded();
                    response = BridgeResponse.Ok(request.Id, new { isNeeded = needed });
                    return true;

                case "templates:apply":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات تطبيق القالب فارغة");
                        return true;
                    }
                    var applyReq = JsonConvert.DeserializeObject<ApplyTemplateRequest>(request.Payload.ToString());
                    var applyRes = DatabaseService.Templates.ApplyTemplate(applyReq);
                    if (!applyRes.Success)
                    {
                        response = BridgeResponse.Fail(request.Id, "TEMPLATE_APPLY_FAILED", applyRes.Message);
                        return true;
                    }
                    response = BridgeResponse.Ok(request.Id, applyRes);
                    return true;

                case "demo:getStatus":
                    var demoStatus = DatabaseService.DemoData.GetStatus();
                    response = BridgeResponse.Ok(request.Id, demoStatus);
                    return true;

                case "demo:load":
                    string demoStoreType = "supermarket";
                    if (request.Payload != null)
                    {
                        JObject demoLoadObj = request.Payload as JObject;
                        if (demoLoadObj != null && demoLoadObj["storeType"] != null)
                        {
                            demoStoreType = demoLoadObj["storeType"].ToString();
                        }
                        else if (request.Payload is string)
                        {
                            demoStoreType = request.Payload.ToString();
                        }
                    }
                    var demoLoadRes = DatabaseService.DemoData.LoadDemoData(demoStoreType);
                    if (!demoLoadRes.Success)
                    {
                        response = BridgeResponse.Fail(request.Id, "DEMO_LOAD_FAILED", demoLoadRes.Message);
                        return true;
                    }
                    response = BridgeResponse.Ok(request.Id, demoLoadRes);
                    return true;

                case "demo:clear":
                    var demoClearRes = DatabaseService.DemoData.ClearDemoData();
                    if (!demoClearRes.Success)
                    {
                        response = BridgeResponse.Fail(request.Id, "DEMO_CLEAR_FAILED", demoClearRes.Message);
                        return true;
                    }
                    response = BridgeResponse.Ok(request.Id, demoClearRes);
                    return true;

                case "readiness:getStatus":
                    var readinessStatus = DatabaseService.Readiness.GetStatus();
                    response = BridgeResponse.Ok(request.Id, readinessStatus);
                    return true;

                case "readiness:processTestSale":
                    Sale inputTestSale = null;
                    if (request.Payload != null)
                    {
                        inputTestSale = JsonConvert.DeserializeObject<Sale>(request.Payload.ToString());
                    }
                    var testSaleResult = DatabaseService.Sales.ProcessTestSale(inputTestSale);
                    response = BridgeResponse.Ok(request.Id, testSaleResult);
                    return true;

                case "health:getStatus":
                    var systemHealth = DatabaseService.SystemHealth.GetSystemHealth();
                    response = BridgeResponse.Ok(request.Id, systemHealth);
                    return true;

                case "system:factoryReset":
                    var resetResult = DatabaseService.FactoryReset();
                    response = BridgeResponse.Ok(request.Id, resetResult);
                    return true;

                case "reports:getTodaySummary":
                    var summary = DatabaseService.Reports.GetTodaySummary();
                    response = BridgeResponse.Ok(request.Id, summary);
                    return true;

                case "reports:getPeriodSales":
                    string repPeriod = "today";
                    string fromDate = null;
                    string toDate = null;
                    JObject repObj = request.Payload as JObject;
                    if (repObj != null)
                    {
                        if (repObj["period"] != null) repPeriod = repObj["period"].ToString();
                        if (repObj["fromDate"] != null) fromDate = repObj["fromDate"].ToString();
                        if (repObj["toDate"] != null) toDate = repObj["toDate"].ToString();
                    }
                    var periodReport = DatabaseService.Reports.GetPeriodSalesReport(repPeriod, fromDate, toDate);
                    response = BridgeResponse.Ok(request.Id, periodReport);
                    return true;

                case "reports:getLowStock":
                    var lowStockItems = DatabaseService.Reports.GetLowStockReport();
                    response = BridgeResponse.Ok(request.Id, lowStockItems);
                    return true;

                case "reports:getDebtors":
                    var debtorsList = DatabaseService.Reports.GetDebtorsReport();
                    response = BridgeResponse.Ok(request.Id, debtorsList);
                    return true;

                case "reports:getDataQuality":
                    var dataQualityReport = DatabaseService.Reports.GetDataQualityReport();
                    response = BridgeResponse.Ok(request.Id, dataQualityReport);
                    return true;

                case "reports:runMilestone9Tests":
                    var m9TestResult = ReportsAndClosingTestRunner.RunAllTests();
                    response = BridgeResponse.Ok(request.Id, m9TestResult);
                    return true;

                case "reports:getInventoryLoss":
                    string lossPeriod = "today";
                    string lossFrom = null;
                    string lossTo = null;
                    JObject lossObj = request.Payload as JObject;
                    if (lossObj != null)
                    {
                        if (lossObj["period"] != null) lossPeriod = lossObj["period"].ToString();
                        if (lossObj["fromDate"] != null) lossFrom = lossObj["fromDate"].ToString();
                        if (lossObj["toDate"] != null) lossTo = lossObj["toDate"].ToString();
                    }
                    var lossReport = DatabaseService.Reports.GetInventoryLossReport(lossPeriod, lossFrom, lossTo);
                    response = BridgeResponse.Ok(request.Id, lossReport);
                    return true;

                case "reports:getClosingHistory":
                    string chPeriod = "month";
                    string chFrom = null;
                    string chTo = null;
                    JObject chObj = request.Payload as JObject;
                    if (chObj != null)
                    {
                        if (chObj["period"] != null) chPeriod = chObj["period"].ToString();
                        if (chObj["fromDate"] != null) chFrom = chObj["fromDate"].ToString();
                        if (chObj["toDate"] != null) chTo = chObj["toDate"].ToString();
                    }
                    var closings = DatabaseService.Reports.GetClosingHistory(chPeriod, chFrom, chTo);
                    response = BridgeResponse.Ok(request.Id, closings);
                    return true;

                case "reports:getCategoryPerformance":
                    string catPeriod = "month";
                    string catFrom = null;
                    string catTo = null;
                    JObject catObj = request.Payload as JObject;
                    if (catObj != null)
                    {
                        if (catObj["period"] != null) catPeriod = catObj["period"].ToString();
                        if (catObj["fromDate"] != null) catFrom = catObj["fromDate"].ToString();
                        if (catObj["toDate"] != null) catTo = catObj["toDate"].ToString();
                    }
                    var catPerf = DatabaseService.Reports.GetCategoryPerformance(catPeriod, catFrom, catTo);
                    response = BridgeResponse.Ok(request.Id, catPerf);
                    return true;

                case "reports:getItemProfitability":
                    string itemPeriod = "month";
                    int itemLimit = 20;
                    string itemDir = "desc";
                    JObject itemObj = request.Payload as JObject;
                    if (itemObj != null)
                    {
                        if (itemObj["period"] != null) itemPeriod = itemObj["period"].ToString();
                        if (itemObj["limit"] != null) int.TryParse(itemObj["limit"].ToString(), out itemLimit);
                        if (itemObj["direction"] != null) itemDir = itemObj["direction"].ToString();
                    }
                    var itemProf = DatabaseService.Reports.GetItemProfitability(itemPeriod, itemLimit, itemDir);
                    response = BridgeResponse.Ok(request.Id, itemProf);
                    return true;

                case "reports:getPeriodComparison":
                    string compPeriod = "week";
                    JObject compObj = request.Payload as JObject;
                    if (compObj != null && compObj["period"] != null)
                    {
                        compPeriod = compObj["period"].ToString();
                    }
                    var compReport = DatabaseService.Reports.GetPeriodComparison(compPeriod);
                    response = BridgeResponse.Ok(request.Id, compReport);
                    return true;

                case "reports:getInventoryOverview":
                    var invOverview = DatabaseService.Reports.GetInventoryOverview();
                    response = BridgeResponse.Ok(request.Id, invOverview);
                    return true;

                case "reports:getShrinkageAnalysis":
                    string shPeriod = "month";
                    string shFrom = null;
                    string shTo = null;
                    JObject shObj = request.Payload as JObject;
                    if (shObj != null)
                    {
                        if (shObj["period"] != null) shPeriod = shObj["period"].ToString();
                        if (shObj["fromDate"] != null) shFrom = shObj["fromDate"].ToString();
                        if (shObj["toDate"] != null) shTo = shObj["toDate"].ToString();
                    }
                    var shrinkage = DatabaseService.Reports.GetShrinkageAnalysis(shPeriod, shFrom, shTo);
                    response = BridgeResponse.Ok(request.Id, shrinkage);
                    return true;

                case "reports:getPurchaseAnalysis":
                    string purPeriod = "month";
                    string purFrom = null;
                    string purTo = null;
                    JObject purObj = request.Payload as JObject;
                    if (purObj != null)
                    {
                        if (purObj["period"] != null) purPeriod = purObj["period"].ToString();
                        if (purObj["fromDate"] != null) purFrom = purObj["fromDate"].ToString();
                        if (purObj["toDate"] != null) purTo = purObj["toDate"].ToString();
                    }
                    var purAnalysis = DatabaseService.Reports.GetPurchaseAnalysis(purPeriod, purFrom, purTo);
                    response = BridgeResponse.Ok(request.Id, purAnalysis);
                    return true;

                case "reports:getCreditOverview":
                    string crPeriod = "month";
                    string crFrom = null;
                    string crTo = null;
                    JObject crObj = request.Payload as JObject;
                    if (crObj != null)
                    {
                        if (crObj["period"] != null) crPeriod = crObj["period"].ToString();
                        if (crObj["fromDate"] != null) crFrom = crObj["fromDate"].ToString();
                        if (crObj["toDate"] != null) crTo = crObj["toDate"].ToString();
                    }
                    var creditOverview = DatabaseService.Reports.GetCreditOverview(crPeriod, crFrom, crTo);
                    response = BridgeResponse.Ok(request.Id, creditOverview);
                    return true;

                case "reports:getDebtAging":
                    var debtAging = DatabaseService.Reports.GetDebtAgingReport();
                    response = BridgeResponse.Ok(request.Id, debtAging);
                    return true;

                case "reports:getCustomerBehavior":
                    string cbPeriod = "month";
                    string cbFrom = null;
                    string cbTo = null;
                    JObject cbObj = request.Payload as JObject;
                    if (cbObj != null)
                    {
                        if (cbObj["period"] != null) cbPeriod = cbObj["period"].ToString();
                        if (cbObj["fromDate"] != null) cbFrom = cbObj["fromDate"].ToString();
                        if (cbObj["toDate"] != null) cbTo = cbObj["toDate"].ToString();
                    }
                    var custBehavior = DatabaseService.Reports.GetCustomerBehavior(cbPeriod, cbFrom, cbTo);
                    response = BridgeResponse.Ok(request.Id, custBehavior);
                    return true;

                case "reports:getPaymentHistory":
                    string payPeriod = "month";
                    string payFrom = null;
                    string payTo = null;
                    string payCustId = null;
                    JObject payObj = request.Payload as JObject;
                    if (payObj != null)
                    {
                        if (payObj["period"] != null) payPeriod = payObj["period"].ToString();
                        if (payObj["fromDate"] != null) payFrom = payObj["fromDate"].ToString();
                        if (payObj["toDate"] != null) payTo = payObj["toDate"].ToString();
                        if (payObj["customerId"] != null) payCustId = payObj["customerId"].ToString();
                    }
                    var payHistory = DatabaseService.Reports.GetPaymentHistory(payPeriod, payFrom, payTo, payCustId);
                    response = BridgeResponse.Ok(request.Id, payHistory);
                    return true;


                case "closing:getPreview":
                    string bDate = null;
                    JObject prevObj = request.Payload as JObject;
                    if (prevObj != null && prevObj["businessDate"] != null)
                    {
                        bDate = prevObj["businessDate"].ToString();
                    }
                    var closingPreview = DatabaseService.DailyClosing.GetClosingPreview(bDate);
                    response = BridgeResponse.Ok(request.Id, closingPreview);
                    return true;

                case "closing:save":
                    JObject savePayload = request.Payload as JObject;
                    if (savePayload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات إقفال اليومية فارغة");
                        return true;
                    }
                    DailyClosingSaveRequest saveReq = savePayload.ToObject<DailyClosingSaveRequest>();
                    var savedClosing = DatabaseService.DailyClosing.SaveClosing(saveReq);
                    response = BridgeResponse.Ok(request.Id, savedClosing);
                    return true;

                case "closing:getHistory":
                    int histLimit = 30;
                    JObject histObj = request.Payload as JObject;
                    if (histObj != null && histObj["limit"] != null)
                    {
                        histLimit = histObj["limit"].Value<int>();
                    }
                    var closingHistory = DatabaseService.DailyClosing.GetHistory(histLimit);
                    response = BridgeResponse.Ok(request.Id, closingHistory);
                    return true;

                case "closing:getById":
                    string closingTargetId = null;
                    JObject idObj = request.Payload as JObject;
                    if (idObj != null && idObj["id"] != null)
                    {
                        closingTargetId = idObj["id"].ToString();
                    }
                    var singleClosing = DatabaseService.DailyClosing.GetById(closingTargetId);
                    response = BridgeResponse.Ok(request.Id, singleClosing);
                    return true;

                case "closing:checkPreviousDay":
                    var prevDayAlert = DatabaseService.DailyClosing.CheckPreviousDayClosed();
                    response = BridgeResponse.Ok(request.Id, prevDayAlert);
                    return true;

                case "closing:print":
                    string printPName = null;
                    DailyClosing closingToPrint = null;
                    JObject printObj = request.Payload as JObject;
                    if (printObj != null)
                    {
                        if (printObj["printerName"] != null) printPName = printObj["printerName"].ToString();
                        if (printObj["closing"] != null)
                        {
                            var cObj = printObj["closing"] as JObject;
                            if (cObj != null)
                            {
                                closingToPrint = cObj.ToObject<DailyClosing>();
                            }
                        }
                        else if (printObj["closingId"] != null)
                        {
                            closingToPrint = DatabaseService.DailyClosing.GetById(printObj["closingId"].ToString());
                        }
                    }
                    if (closingToPrint == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "NOT_FOUND", "سجل الإقفال المطلوب طباعته غير موجود");
                        return true;
                    }
                    var printRes = DatabaseService.Printer.PrintDailyClosingReport(closingToPrint, printPName);
                    response = BridgeResponse.Ok(request.Id, printRes);
                    return true;

                case "audit:list":
                case "audit:getLogs":
                    int auditLimit = 100;
                    string auditAction = null;
                    JObject auditObj = request.Payload as JObject;
                    if (auditObj != null)
                    {
                        if (auditObj["limit"] != null) auditLimit = auditObj["limit"].Value<int>();
                        if (auditObj["action"] != null) auditAction = auditObj["action"].ToString();
                    }
                    var logs = DatabaseService.Audit.GetLogs(auditLimit, auditAction);
                    response = BridgeResponse.Ok(request.Id, logs);
                    return true;

                case "auditLogs:create":
                case "audit:create":
                    if (request.Payload != null)
                    {
                        JObject cObj = request.Payload as JObject;
                        if (cObj != null)
                        {
                            string cAction = cObj["action"] != null ? cObj["action"].ToString() : "GENERAL_AUDIT";
                            string cType = cObj["entityType"] != null ? cObj["entityType"].ToString() : "system";
                            string cId = cObj["entityId"] != null ? cObj["entityId"].ToString() : "";
                            string cDetails = cObj["detailsJson"] != null ? cObj["detailsJson"].ToString() : "";
                            string cUser = SecurityService.CurrentUser != null ? SecurityService.CurrentUser.Username : "usr_admin_default";
                            DatabaseService.Audit.Log(cAction, cType, cId, cDetails, cUser);
                        }
                    }
                    response = BridgeResponse.Ok(request.Id, true);
                    return true;

                case "support:getSystemInfo":
                    var supportInfo = DatabaseService.Support.GetSystemDiagnosticInfo();
                    response = BridgeResponse.Ok(request.Id, supportInfo);
                    return true;

                case "support:createBundle":
                    var bundleResult = DatabaseService.Support.CreateSupportBundle();
                    response = BridgeResponse.Ok(request.Id, bundleResult);
                    return true;

                case "system:checkClock":
                    var clockResult = TimeGuard.ValidateSystemClock(DatabaseService.ConnectionString);
                    response = BridgeResponse.Ok(request.Id, clockResult);
                    return true;

                case "benchmark:run":
                    int pCount = 3000;
                    if (request.Payload != null)
                    {
                        JObject bObj = request.Payload as JObject;
                        if (bObj != null && bObj["productCount"] != null)
                        {
                            pCount = bObj["productCount"].Value<int>();
                        }
                    }
                    var benchResult = DatabaseService.Benchmark.RunStressTest(pCount);
                    response = BridgeResponse.Ok(request.Id, benchResult);
                    return true;

                case "backup:getStatus":
                    var backupStatus = DatabaseService.Backup.GetStatus();
                    response = BridgeResponse.Ok(request.Id, backupStatus);
                    return true;

                case "backup:create":
                    string customFolder = null;
                    if (request.Payload != null)
                    {
                        JObject bkObj = request.Payload as JObject;
                        if (bkObj != null && bkObj["folder"] != null)
                        {
                            customFolder = bkObj["folder"].ToString();
                        }
                    }
                    var createResult = DatabaseService.Backup.CreateBackup(customFolder);
                    response = BridgeResponse.Ok(request.Id, createResult);
                    return true;

                case "backup:getDrives":
                    var drives = DatabaseService.Backup.GetAvailableDrives();
                    response = BridgeResponse.Ok(request.Id, drives);
                    return true;

                case "backup:configure":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات إعدادات النسخ فارغة");
                        return true;
                    }
                    JObject cfgObj = request.Payload as JObject;
                    string bFolder = cfgObj != null && cfgObj["targetFolder"] != null ? cfgObj["targetFolder"].ToString() : "";
                    bool bAutoClose = cfgObj != null && cfgObj["autoOnClose"] != null ? cfgObj["autoOnClose"].Value<bool>() : true;
                    bool bAutoDaily = cfgObj != null && cfgObj["autoDaily"] != null ? cfgObj["autoDaily"].Value<bool>() : true;
                    int bRetDays = cfgObj != null && cfgObj["retentionDays"] != null ? cfgObj["retentionDays"].Value<int>() : 7;
                    int bRetWeeks = cfgObj != null && cfgObj["retentionWeeks"] != null ? cfgObj["retentionWeeks"].Value<int>() : 4;
                    int bWarnDays = cfgObj != null && cfgObj["warnAfterDays"] != null ? cfgObj["warnAfterDays"].Value<int>() : 2;
                    int bMaxCopies = cfgObj != null && cfgObj["maxCopies"] != null ? cfgObj["maxCopies"].Value<int>() : 20;

                    DatabaseService.Backup.SaveConfiguration(bFolder, bAutoClose, bAutoDaily, bRetDays, bRetWeeks, bWarnDays, bMaxCopies);
                    response = BridgeResponse.Ok(request.Id, new { success = true });
                    return true;

                case "database:checkIntegrity":
                    var dbIntegrity = DatabaseService.CheckDatabaseIntegrity();
                    response = BridgeResponse.Ok(request.Id, dbIntegrity);
                    return true;

                case "database:restore":
                    string restoreFilePath = null;
                    string restoreMasterKey = null;
                    if (request.Payload != null)
                    {
                        JObject rObj = request.Payload as JObject;
                        if (rObj != null)
                        {
                            if (rObj["backupFilePath"] != null)
                            {
                                restoreFilePath = rObj["backupFilePath"].ToString();
                            }
                            if (rObj["masterKey"] != null)
                            {
                                restoreMasterKey = rObj["masterKey"].ToString();
                            }
                            else if (rObj["password"] != null)
                            {
                                restoreMasterKey = rObj["password"].ToString();
                            }
                        }
                    }
                    var restoreResult = DatabaseService.RestoreFromBackup(restoreFilePath, restoreMasterKey);
                    if (restoreResult.Success)
                    {
                        response = BridgeResponse.Ok(request.Id, new { success = true, message = restoreResult.Message });
                    }
                    else
                    {
                        response = BridgeResponse.Fail(request.Id, "RESTORE_FAILED", restoreResult.Message);
                    }
                    return true;

                case "backup:verify":
                    string verifyFilePath = "";
                    if (request.Payload != null)
                    {
                        JObject vObj = request.Payload as JObject;
                        if (vObj != null && vObj["backupFilePath"] != null)
                        {
                            verifyFilePath = vObj["backupFilePath"].ToString();
                        }
                        else
                        {
                            verifyFilePath = request.Payload.ToString().Trim('"', ' ');
                        }
                    }
                    bool isVerified = DatabaseService.Backup.VerifyBackupIntegrity(verifyFilePath);
                    response = BridgeResponse.Ok(request.Id, new
                    {
                        success = isVerified,
                        isVerified = isVerified,
                        message = isVerified
                            ? "تم فحص النسخة الاحتياطية بنجاح: بنية B-Tree سليمة وتطابق أعداد الأصناف والفواتير مع قاعدة البيانات الأصلية."
                            : "فشل فحص النسخة الاحتياطية: الملف تالف أو لا يطابق سجلات النظام."
                    });
                    return true;

                case "search:runBenchmark":
                    int benchProdCount = 5000;
                    int benchQueryCount = 100;
                    JObject benchObj = request.Payload as JObject;
                    if (benchObj != null)
                    {
                        if (benchObj["productCount"] != null) benchProdCount = benchObj["productCount"].Value<int>();
                        if (benchObj["queryIterations"] != null) benchQueryCount = benchObj["queryIterations"].Value<int>();
                    }
                    var benchRunner = new SearchBenchmarkRunner(DatabaseService.ConnectionString, DatabaseService.ProductRepo);
                    var benchRes = benchRunner.RunBenchmark(benchProdCount, benchQueryCount);
                    response = BridgeResponse.Ok(request.Id, benchRes);
                    return true;

                case "excel:getTemplate":
                    string tplBase64 = DatabaseService.Excel.GenerateProductTemplateBase64();
                    response = BridgeResponse.Ok(request.Id, new
                    {
                        success = true,
                        fileName = "قالب_استيراد_المنتجات_رفيق_POS.xlsx",
                        base64 = tplBase64
                    });
                    return true;

                case "excel:exportProducts":
                    var prodsToExport = DatabaseService.ProductRepo.GetAllForExport();
                    var cats = DatabaseService.CategoryRepo.GetAll(true);
                    var catDict = new Dictionary<string, string>();
                    if (cats != null)
                    {
                        foreach (var c in cats)
                        {
                            if (!string.IsNullOrEmpty(c.Id)) catDict[c.Id] = c.Name;
                        }
                    }
                    string expBase64 = DatabaseService.Excel.ExportProductsBase64(prodsToExport, catDict);
                    string exportFileName = string.Format("كتالوج_أصناف_رفيق_{0}.xlsx", DateTime.Now.ToString("yyyyMMdd_HHmm"));
                    response = BridgeResponse.Ok(request.Id, new
                    {
                        success = true,
                        fileName = exportFileName,
                        base64 = expBase64,
                        count = prodsToExport.Count
                    });
                    return true;

                case "excel:exportCustomers":
                    var custsToExport = DatabaseService.CustomerRepo.GetAll(50000);
                    string expCustBase64 = DatabaseService.Excel.ExportCustomersBase64(custsToExport);

                    string custExportFileName = string.Format("سجل_عملاء_رفيق_{0}.xlsx", DateTime.Now.ToString("yyyyMMdd_HHmm"));
                    response = BridgeResponse.Ok(request.Id, new
                    {
                        success = true,
                        fileName = custExportFileName,
                        base64 = expCustBase64,
                        count = custsToExport.Count
                    });
                    return true;


                case "excel:getCustomerTemplate":
                    string custTplBase64 = DatabaseService.Excel.GenerateCustomerTemplateBase64();
                    response = BridgeResponse.Ok(request.Id, new
                    {
                        success = true,
                        fileName = "قالب_استيراد_العملاء_رفيق_POS.xlsx",
                        base64 = custTplBase64
                    });
                    return true;

                case "excel:previewCustomerImport":
                    string pBase64 = "";
                    JObject prevCustObj = request.Payload as JObject;
                    if (prevCustObj != null && prevCustObj["base64"] != null) pBase64 = prevCustObj["base64"].ToString();
                    else if (request.Payload != null) pBase64 = request.Payload.ToString().Trim('"', ' ');
                    var previewResult = DatabaseService.Excel.ParseCustomerImportBase64(pBase64, DatabaseService.CustomerRepo);
                    response = BridgeResponse.Ok(request.Id, previewResult);
                    return true;

                case "excel:importCustomers":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات الاستيراد فارغة");
                        return true;
                    }
                    List<CustomerImportRow> rowsToImport = null;
                    JObject impCustObj = request.Payload as JObject;
                    if (impCustObj != null && impCustObj["rows"] != null)
                    {
                        rowsToImport = impCustObj["rows"].ToObject<List<CustomerImportRow>>();
                    }
                    else
                    {
                        rowsToImport = JsonConvert.DeserializeObject<List<CustomerImportRow>>(request.Payload.ToString());
                    }
                    var custImportResult = DatabaseService.Customers.BatchImportCustomers(rowsToImport);
                    response = BridgeResponse.Ok(request.Id, custImportResult);
                    return true;

                case "excel:exportFullStore":
                    {
                        string targetDir = null;
                        if (request.Payload != null)
                        {
                            var pObj = request.Payload as JObject;
                            if (pObj != null && pObj["targetFolder"] != null)
                            {
                                targetDir = pObj["targetFolder"].ToString();
                            }
                            else if (request.Payload is string)
                            {
                                targetDir = request.Payload.ToString();
                            }
                        }
                        var fullStoreExportResult = DatabaseService.Excel.ExportFullStoreData(targetDir);
                        response = BridgeResponse.Ok(request.Id, fullStoreExportResult);
                        return true;
                    }

                case "excel:browseExportFolder":
                    {
                        string chosenFolder = null;
                        var browseExportThread = new System.Threading.Thread(delegate()
                        {
                            using (var fbd = new System.Windows.Forms.FolderBrowserDialog())
                            {
                                fbd.Description = "اختر المجلد أو الفلاشة لحفظ ملفات التصدير الشاملة";
                                if (fbd.ShowDialog() == System.Windows.Forms.DialogResult.OK)
                                {
                                    chosenFolder = fbd.SelectedPath;
                                }
                            }
                        });
                        browseExportThread.SetApartmentState(System.Threading.ApartmentState.STA);
                        browseExportThread.Start();
                        browseExportThread.Join();
                        response = BridgeResponse.Ok(request.Id, new { selectedFolder = chosenFolder, cancelled = string.IsNullOrEmpty(chosenFolder) });
                        return true;
                    }

                case "excel:openExportFolder":
                    {
                        string openDir = null;
                        if (request.Payload != null)
                        {
                            var pObj = request.Payload as JObject;
                            if (pObj != null && pObj["folderPath"] != null)
                            {
                                openDir = pObj["folderPath"].ToString();
                            }
                            else if (request.Payload is string)
                            {
                                openDir = request.Payload.ToString();
                            }
                        }
                        if (!string.IsNullOrEmpty(openDir) && System.IO.Directory.Exists(openDir))
                        {
                            System.Diagnostics.Process.Start("explorer.exe", openDir);
                            response = BridgeResponse.Ok(request.Id, new { success = true });
                        }
                        else
                        {
                            response = BridgeResponse.Fail(request.Id, "FOLDER_NOT_FOUND", "المجلد المحدد غير موجود");
                        }
                        return true;
                    }

                case "excel:runExportTests":
                    {
                        var testRes = FullStoreExportTestRunner.RunAllTests();
                        response = BridgeResponse.Ok(request.Id, testRes);
                        return true;
                    }

                case "audit:verifyChain":
                    var chainCheck = DatabaseService.Audit.VerifyChainIntegrity();
                    response = BridgeResponse.Ok(request.Id, chainCheck);
                    return true;

                case "audit:resealChain":
                    int resealedCount = DatabaseService.Audit.ResealChain();
                    var newCheck = DatabaseService.Audit.VerifyChainIntegrity();
                    response = BridgeResponse.Ok(request.Id, new { resealedCount = resealedCount, verification = newCheck });
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

                case "license:getInfo":
                    var licInfo = DatabaseService.License != null ? DatabaseService.License.GetLicenseInfo() : null;
                    response = BridgeResponse.Ok(request.Id, licInfo);
                    return true;

                case "license:activate":
                    string licKey = "";
                    if (request.Payload != null)
                    {
                        JObject licObj = request.Payload as JObject;
                        if (licObj == null)
                        {
                            try
                            {
                                licObj = JObject.Parse(request.Payload.ToString());
                            }
                            catch { }
                        }
                        if (licObj != null)
                        {
                            if (licObj["licenseKey"] != null) licKey = licObj["licenseKey"].ToString();
                            else if (licObj["key"] != null) licKey = licObj["key"].ToString();
                        }
                    }
                    var actResult = DatabaseService.License != null 
                        ? DatabaseService.License.ActivateLicense(licKey)
                        : new LicenseOperationResult { Success = false, Message = "خدمة التراخيص غير مهيأة" };
                    response = BridgeResponse.Ok(request.Id, actResult);
                    return true;

                case "license:verify":
                    var verResult = DatabaseService.License != null 
                        ? DatabaseService.License.VerifyLicenseOnline()
                        : new LicenseOperationResult { Success = false, Message = "خدمة التراخيص غير مهيأة" };
                    response = BridgeResponse.Ok(request.Id, verResult);
                    return true;

                case "license:checkExpiry":
                    var chkExpiry = DatabaseService.License != null 
                        ? DatabaseService.License.CheckExpiry() 
                        : null;
                    response = BridgeResponse.Ok(request.Id, chkExpiry);
                    return true;

                case "license:deactivateForTransfer":
                    string transReason = "";
                    if (request.Payload != null)
                    {
                        JObject transObj = request.Payload as JObject;
                        if (transObj != null && transObj["reason"] != null)
                        {
                            transReason = transObj["reason"].ToString();
                        }
                    }
                    var deactRes = DatabaseService.License != null
                        ? DatabaseService.License.DeactivateForTransfer(transReason)
                        : new LicenseOperationResult { Success = false, Message = "خدمة التراخيص غير مهيأة" };
                    response = BridgeResponse.Ok(request.Id, deactRes);
                    return true;

                case "license:activateSupportCode":
                    string supCode = "";
                    string supShop = "";
                    if (request.Payload != null)
                    {
                        JObject actSupObj = request.Payload as JObject;
                        if (actSupObj != null)
                        {
                            if (actSupObj["supportCode"] != null) supCode = actSupObj["supportCode"].ToString();
                            else if (actSupObj["code"] != null) supCode = actSupObj["code"].ToString();
                            if (actSupObj["shopName"] != null) supShop = actSupObj["shopName"].ToString();
                        }
                    }
                    var actSupRes = DatabaseService.License != null
                        ? DatabaseService.License.ActivateWithSupportCode(supCode, supShop)
                        : new LicenseOperationResult { Success = false, Message = "خدمة التراخيص غير مهيأة" };
                    response = BridgeResponse.Ok(request.Id, actSupRes);
                    return true;

                case "license:generateSupportCode":
                    string genFp = "";
                    string genType = "lifetime";
                    int genDays = 9999;
                    if (request.Payload != null)
                    {
                        JObject genObj = request.Payload as JObject;
                        if (genObj != null)
                        {
                            if (genObj["deviceFingerprint"] != null) genFp = genObj["deviceFingerprint"].ToString();
                            if (genObj["licenseType"] != null) genType = genObj["licenseType"].ToString();
                            if (genObj["days"] != null) genDays = genObj["days"].Value<int>();
                        }
                    }
                    if (string.IsNullOrEmpty(genFp))
                    {
                        genFp = EncryptionService.GenerateDeviceFingerprint();
                    }
                    string generatedCode = LicenseService.GenerateOfflineSupportCode(genFp, genType, genDays);
                    response = BridgeResponse.Ok(request.Id, new { supportCode = generatedCode, deviceFingerprint = genFp });
                    return true;

                case "license:runTests":
                    var licTestRes = LicenseTestRunner.RunAllTests();
                    response = BridgeResponse.Ok(request.Id, licTestRes);
                    return true;

                case "migration:getMetrics":
                    var curMetrics = DatabaseService.Migration != null ? DatabaseService.Migration.GetCurrentMetrics() : new MigrationAuditMetrics();
                    response = BridgeResponse.Ok(request.Id, curMetrics);
                    return true;

                case "migration:export":
                    string exportFolder = null;
                    if (request.Payload != null)
                    {
                        JObject expObj = request.Payload as JObject;
                        if (expObj != null && expObj["folder"] != null)
                        {
                            exportFolder = expObj["folder"].ToString();
                        }
                    }
                    var expResult = DatabaseService.Migration != null
                        ? DatabaseService.Migration.CreateMigrationPackage(exportFolder)
                        : new MigrationPackageExportResult { Success = false, Message = "خدمة النقل غير متوفرة." };
                    response = BridgeResponse.Ok(request.Id, expResult);
                    return true;

                case "migration:inspect":
                    string inspectPath = null;
                    if (request.Payload != null)
                    {
                        JObject insObj = request.Payload as JObject;
                        if (insObj != null && insObj["packagePath"] != null)
                        {
                            inspectPath = insObj["packagePath"].ToString();
                        }
                        else
                        {
                            inspectPath = request.Payload.ToString().Trim('"', ' ');
                        }
                    }
                    var insResult = DatabaseService.Migration != null
                        ? DatabaseService.Migration.InspectPackage(inspectPath)
                        : new MigrationPackageInspectResult { Success = false, Message = "خدمة النقل غير متوفرة." };
                    response = BridgeResponse.Ok(request.Id, insResult);
                    return true;

                case "migration:restore":
                    string restorePkgPath = null;
                    if (request.Payload != null)
                    {
                        JObject resObj = request.Payload as JObject;
                        if (resObj != null && resObj["packagePath"] != null)
                        {
                            restorePkgPath = resObj["packagePath"].ToString();
                        }
                        else
                        {
                            restorePkgPath = request.Payload.ToString().Trim('"', ' ');
                        }
                    }
                    var restResult = DatabaseService.Migration != null
                        ? DatabaseService.Migration.RestorePackage(restorePkgPath)
                        : new MigrationRestoreResult { Success = false, Message = "خدمة النقل غير متوفرة." };
                    response = BridgeResponse.Ok(request.Id, restResult);
                    return true;

                case "migration:runTests":
                    var migTestRes = MigrationTestRunner.RunAllTests();
                    response = BridgeResponse.Ok(request.Id, migTestRes);
                    return true;

                case "migration:browseFile":
                    string selectedFile = null;
                    var fileThread = new System.Threading.Thread(delegate()
                    {
                        using (var ofd = new System.Windows.Forms.OpenFileDialog())
                        {
                            ofd.Filter = "حزمة رفيق للنقل (*.rafiqpkg;*.zip)|*.rafiqpkg;*.zip|جميع الملفات (*.*)|*.*";
                            ofd.Title = "اختر حزمة نقل نظام رفيق لاسترجاعها";
                            if (ofd.ShowDialog() == System.Windows.Forms.DialogResult.OK)
                            {
                                selectedFile = ofd.FileName;
                            }
                        }
                    });
                    fileThread.SetApartmentState(System.Threading.ApartmentState.STA);
                    fileThread.Start();
                    fileThread.Join();
                    response = BridgeResponse.Ok(request.Id, new { selectedPath = selectedFile, cancelled = string.IsNullOrEmpty(selectedFile) });
                    return true;

                case "migration:browseFolder":
                    string selectedFolder = null;
                    var folderThread = new System.Threading.Thread(delegate()
                    {
                        using (var fbd = new System.Windows.Forms.FolderBrowserDialog())
                        {
                            fbd.Description = "اختر المجلد أو الفلاشة لحفظ حزمة النقل";
                            if (fbd.ShowDialog() == System.Windows.Forms.DialogResult.OK)
                            {
                                selectedFolder = fbd.SelectedPath;
                            }
                        }
                    });
                    folderThread.SetApartmentState(System.Threading.ApartmentState.STA);
                    folderThread.Start();
                    folderThread.Join();
                    response = BridgeResponse.Ok(request.Id, new { selectedFolder = selectedFolder, cancelled = string.IsNullOrEmpty(selectedFolder) });
                    return true;

                case "updates:check":
                    {
                        string manifestOrUrl = null;
                        if (request.Payload != null)
                        {
                            var pObj = request.Payload as JObject;
                            if (pObj != null && pObj["url"] != null)
                            {
                                manifestOrUrl = pObj["url"].ToString();
                            }
                        }
                        var updateInfo = DatabaseService.Updates.CheckForUpdates(manifestOrUrl);
                        response = BridgeResponse.Ok(request.Id, updateInfo);
                        return true;
                    }

                case "updates:apply":
                    {
                        string pkgPath = null;
                        string expectedSha = null;
                        bool simFail = false;
                        if (request.Payload != null)
                        {
                            var pObj = request.Payload as JObject;
                            if (pObj != null)
                            {
                                if (pObj["packagePath"] != null) pkgPath = pObj["packagePath"].ToString();
                                if (pObj["expectedSha256"] != null) expectedSha = pObj["expectedSha256"].ToString();
                                if (pObj["simulateFailure"] != null) simFail = pObj["simulateFailure"].Value<bool>();
                            }
                        }
                        var updateApplyRes = DatabaseService.Updates.ApplyUpdate(pkgPath, expectedSha, simFail);
                        response = BridgeResponse.Ok(request.Id, updateApplyRes);
                        return true;
                    }

                case "updates:runTests":
                    {
                        var updateTestRes = AppUpdateTestRunner.RunAllTests();
                        response = BridgeResponse.Ok(request.Id, updateTestRes);
                        return true;
                    }

                default:
                    return false;
            }
        }
    }
}
