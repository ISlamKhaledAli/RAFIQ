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
        private static bool TryDispatchPharma(BridgeRequest request, out BridgeResponse response)
        {
            response = null;
            string action = request.Action;

            // Support both colon and dot notation (e.g. pharma.getAlternatives and pharma:getAlternatives)
            if (action == "pharma.getDrugInfo" || action == "pharma:getInfo" || action == "pharma.getInfo") action = "pharma:getDrugInfo";
            else if (action == "pharma.saveDrugInfo" || action == "pharma:saveInfo" || action == "pharma.saveInfo") action = "pharma:saveDrugInfo";
            else if (action == "pharma.getAlternatives" || action == "pharma:findAlternatives" || action == "pharma.findAlternatives") action = "pharma:getAlternatives";
            else if (action == "pharma.searchByIngredient") action = "pharma:searchByIngredient";

            switch (action)
            {
                case "pharma:getDrugInfo":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "معرف الصنف مطلوب.");
                        return true;
                    }

                    string pId = null;
                    var getObj = request.Payload as JObject;
                    if (getObj != null && getObj["productId"] != null) pId = getObj["productId"].ToString();
                    else pId = request.Payload.ToString();

                    var info = DatabaseService.PharmaRepo.GetPharmaInfo(pId);
                    response = BridgeResponse.Ok(request.Id, info);
                    return true;

                case "pharma:saveDrugInfo":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات الملف الدوائي مطلوبة.");
                        return true;
                    }
                    try
                    {
                        var infoToSave = JsonConvert.DeserializeObject<ProductPharmaInfo>(request.Payload.ToString());
                        string userId = SecurityService.CurrentUser != null ? SecurityService.CurrentUser.Id : "usr_admin_default";
                        var saved = DatabaseService.PharmaRepo.SavePharmaInfo(infoToSave, userId);
                        response = BridgeResponse.Ok(request.Id, saved);
                    }
                    catch (Exception ex)
                    {
                        response = BridgeResponse.Fail(request.Id, "SAVE_FAILED", ex.Message);
                    }
                    return true;

                case "pharma:getAlternatives":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "معرف الصنف مطلوب.");
                        return true;
                    }

                    string altPid = null;
                    var altObj = request.Payload as JObject;
                    if (altObj != null && altObj["productId"] != null) altPid = altObj["productId"].ToString();
                    else altPid = request.Payload.ToString();

                    try
                    {
                        var alternatives = DatabaseService.DrugAlternatives.GetAlternatives(altPid);
                        response = BridgeResponse.Ok(request.Id, alternatives);
                    }
                    catch (Exception ex)
                    {
                        response = BridgeResponse.Fail(request.Id, "ALTERNATIVES_FAILED", ex.Message);
                    }
                    return true;

                case "pharma:searchByIngredient":
                    string ingQuery = "";
                    if (request.Payload != null)
                    {
                        var sObj = request.Payload as JObject;
                        if (sObj != null && sObj["query"] != null) ingQuery = sObj["query"].ToString();
                        else ingQuery = request.Payload.ToString();
                    }

                    var ings = DatabaseService.PharmaRepo.GetActiveIngredients(ingQuery);
                    response = BridgeResponse.Ok(request.Id, ings);
                    return true;

                case "pharma:getDosageForms":
                    bool activeOnlyForms = true;
                    var fObj = request.Payload as JObject;
                    if (fObj != null && fObj["all"] != null) activeOnlyForms = !fObj["all"].Value<bool>();
                    var forms = DatabaseService.PharmaRepo.GetDosageForms(activeOnlyForms);
                    response = BridgeResponse.Ok(request.Id, forms);
                    return true;

                case "pharma:saveDosageForm":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات الشكل الصيدلاني مطلوبة.");
                        return true;
                    }
                    try
                    {
                        var df = JsonConvert.DeserializeObject<PharmaDosageForm>(request.Payload.ToString());
                        var saved = DatabaseService.PharmaRepo.SaveDosageForm(df);
                        response = BridgeResponse.Ok(request.Id, saved);
                    }
                    catch (Exception ex)
                    {
                        response = BridgeResponse.Fail(request.Id, "SAVE_FAILED", ex.Message);
                    }
                    return true;

                case "pharma:getManufacturers":
                    bool activeOnlyMfr = true;
                    var mObj = request.Payload as JObject;
                    if (mObj != null && mObj["all"] != null) activeOnlyMfr = !mObj["all"].Value<bool>();
                    var mfrs = DatabaseService.PharmaRepo.GetManufacturers(activeOnlyMfr);
                    response = BridgeResponse.Ok(request.Id, mfrs);
                    return true;

                case "pharma:saveManufacturer":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات الشركة المصنعة مطلوبة.");
                        return true;
                    }
                    try
                    {
                        var m = JsonConvert.DeserializeObject<PharmaManufacturer>(request.Payload.ToString());
                        var saved = DatabaseService.PharmaRepo.SaveManufacturer(m);
                        response = BridgeResponse.Ok(request.Id, saved);
                    }
                    catch (Exception ex)
                    {
                        response = BridgeResponse.Fail(request.Id, "SAVE_FAILED", ex.Message);
                    }
                    return true;

                case "pharma:getTherapeuticClasses":
                    bool activeOnlyTc = true;
                    var tcObj = request.Payload as JObject;
                    if (tcObj != null && tcObj["all"] != null) activeOnlyTc = !tcObj["all"].Value<bool>();
                    var tcs = DatabaseService.PharmaRepo.GetTherapeuticClasses(activeOnlyTc);
                    response = BridgeResponse.Ok(request.Id, tcs);
                    return true;

                case "pharma:saveTherapeuticClass":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات التصنيف العلاجي مطلوبة.");
                        return true;
                    }
                    try
                    {
                        var tc = JsonConvert.DeserializeObject<TherapeuticClass>(request.Payload.ToString());
                        var saved = DatabaseService.PharmaRepo.SaveTherapeuticClass(tc);
                        response = BridgeResponse.Ok(request.Id, saved);
                    }
                    catch (Exception ex)
                    {
                        response = BridgeResponse.Fail(request.Id, "SAVE_FAILED", ex.Message);
                    }
                    return true;

                case "pharma:getActiveIngredients":
                    string q = null;
                    var iObj = request.Payload as JObject;
                    if (iObj != null && iObj["search"] != null) q = iObj["search"].ToString();
                    var ingredients = DatabaseService.PharmaRepo.GetActiveIngredients(q);
                    response = BridgeResponse.Ok(request.Id, ingredients);
                    return true;

                case "pharma:saveActiveIngredient":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات المادة الفعالة مطلوبة.");
                        return true;
                    }
                    try
                    {
                        var ai = JsonConvert.DeserializeObject<ActiveIngredient>(request.Payload.ToString());
                        var saved = DatabaseService.PharmaRepo.SaveActiveIngredient(ai);
                        response = BridgeResponse.Ok(request.Id, saved);
                    }
                    catch (Exception ex)
                    {
                        response = BridgeResponse.Fail(request.Id, "SAVE_FAILED", ex.Message);
                    }
                    return true;

                // --- Story 131 / Feature #188: Controlled Drugs Endpoints ---
                case "pharma:getControlledDispenses":
                case "pharma.getControlledDispenses":
                    string prodId = null;
                    string dateF = null;
                    string dateT = null;
                    string eType = null;
                    int lim = 200;

                    if (request.Payload != null)
                    {
                        var cdObj = request.Payload as JObject;
                        if (cdObj != null)
                        {
                            if (cdObj["productId"] != null) prodId = cdObj["productId"].ToString();
                            if (cdObj["dateFrom"] != null) dateF = cdObj["dateFrom"].ToString();
                            if (cdObj["dateTo"] != null) dateT = cdObj["dateTo"].ToString();
                            if (cdObj["entryType"] != null) eType = cdObj["entryType"].ToString();
                            if (cdObj["limit"] != null) lim = cdObj["limit"].Value<int>();
                        }
                    }

                    bool canViewFull = false;
                    if (SecurityService.CurrentUser != null && DatabaseService.Security != null)
                    {
                        canViewFull = DatabaseService.Security.HasPermission(SecurityService.CurrentUser.Id, "pharma.controlled.view_full");
                    }

                    var dispenses = DatabaseService.ControlledDrugs.GetDispenses(prodId, dateF, dateT, eType, canViewFull, lim);
                    response = BridgeResponse.Ok(request.Id, dispenses);
                    return true;

                case "pharma:saveControlledDispense":
                case "pharma.saveControlledDispense":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات صرف الدواء مطلوبة.");
                        return true;
                    }
                    try
                    {
                        var dObj = JsonConvert.DeserializeObject<ControlledDrugDispense>(request.Payload.ToString());
                        string actorId = SecurityService.CurrentUser != null ? SecurityService.CurrentUser.Id : "usr_admin_default";
                        bool needApproval = !DatabaseService.Security.HasPermission(actorId, "pharma.controlled.dispense");
                        
                        string supPin = null;
                        var rawJ = request.Payload as JObject;
                        if (rawJ != null && rawJ["supervisorPin"] != null) supPin = rawJ["supervisorPin"].ToString();

                        DatabaseService.ControlledDrugs.ValidateAndPrepareDispense(dObj, actorId, needApproval, supPin);
                        DatabaseService.ControlledDrugRepo.InsertDispense(dObj);
                        response = BridgeResponse.Ok(request.Id, dObj);
                    }
                    catch (Exception ex)
                    {
                        response = BridgeResponse.Fail(request.Id, "SAVE_FAILED", ex.Message);
                    }
                    return true;

                case "pharma:getControlledInspectionRegister":
                case "pharma.getControlledInspectionRegister":
                    string regProdId = null;
                    string regFrom = null;
                    string regTo = null;

                    if (request.Payload != null)
                    {
                        var rObj = request.Payload as JObject;
                        if (rObj != null)
                        {
                            if (rObj["productId"] != null) regProdId = rObj["productId"].ToString();
                            if (rObj["dateFrom"] != null) regFrom = rObj["dateFrom"].ToString();
                            if (rObj["dateTo"] != null) regTo = rObj["dateTo"].ToString();
                        }
                    }

                    if (string.IsNullOrEmpty(regProdId))
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "يرجى تحديد الدواء لاستعراض دفتر التفتيش.");
                        return true;
                    }

                    bool canViewFullReg = false;
                    if (SecurityService.CurrentUser != null && DatabaseService.Security != null)
                    {
                        canViewFullReg = DatabaseService.Security.HasPermission(SecurityService.CurrentUser.Id, "pharma.controlled.view_full");
                    }

                    var reportRows = DatabaseService.ControlledDrugs.GetInspectionRegister(regProdId, regFrom, regTo, canViewFullReg);
                    response = BridgeResponse.Ok(request.Id, reportRows);
                    return true;

                case "pharma:getMandatoryFieldsSettings":
                case "pharma.getMandatoryFieldsSettings":
                    var mFields = DatabaseService.ControlledDrugs.GetMandatoryFields();
                    response = BridgeResponse.Ok(request.Id, mFields);
                    return true;

                case "pharma:saveMandatoryFieldsSettings":
                case "pharma.saveMandatoryFieldsSettings":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "قائمة الحقول مطلوبة.");
                        return true;
                    }
                    try
                    {
                        var fieldsList = JsonConvert.DeserializeObject<List<string>>(request.Payload.ToString());
                        DatabaseService.ControlledDrugs.SaveMandatoryFields(fieldsList);
                        response = BridgeResponse.Ok(request.Id, fieldsList);
                    }
                    catch (Exception ex)
                    {
                        response = BridgeResponse.Fail(request.Id, "SAVE_FAILED", ex.Message);
                    }
                    return true;

                case "pharma:verifyControlledPharmacistPin":
                case "pharma.verifyControlledPharmacistPin":
                    string pin = null;
                    var pJObj = request.Payload as JObject;
                    if (pJObj != null && pJObj["pin"] != null) pin = pJObj["pin"].ToString();
                    else if (request.Payload != null) pin = request.Payload.ToString();

                    if (string.IsNullOrEmpty(pin))
                    {
                        response = BridgeResponse.Fail(request.Id, "PIN_REQUIRED", "الرمز السري للصيدلي مطلوب.");
                        return true;
                    }

                    var pinVerification = DatabaseService.Security.VerifySupervisorPin(pin, "PHARMA_CONTROLLED_DISPENSE");
                    if (pinVerification != null && pinVerification.Success)
                    {
                        response = BridgeResponse.Ok(request.Id, new { success = true, supervisorName = pinVerification.SupervisorName });
                    }
                    else
                    {
                        string msg = (pinVerification != null && !string.IsNullOrEmpty(pinVerification.Message))
                            ? pinVerification.Message
                            : "الرمز السري غير صحيح.";
                        response = BridgeResponse.Fail(request.Id, "INVALID_PIN", msg);
                    }
                    return true;

                // --- Prescriptions Endpoints ---
                case "prescriptions:getAll":
                case "prescriptions.getAll":
                    string rxQ = null;
                    int rxLim = 50;
                    if (request.Payload != null)
                    {
                        var rxObj = request.Payload as JObject;
                        if (rxObj != null)
                        {
                            if (rxObj["search"] != null) rxQ = rxObj["search"].ToString();
                            if (rxObj["limit"] != null) rxLim = rxObj["limit"].Value<int>();
                        }
                    }
                    var prescriptions = DatabaseService.Prescriptions.GetAll(rxQ, rxLim);
                    response = BridgeResponse.Ok(request.Id, prescriptions);
                    return true;

                case "prescriptions:getById":
                case "prescriptions.getById":
                    string rxId = null;
                    var rxIdObj = request.Payload as JObject;
                    if (rxIdObj != null && rxIdObj["id"] != null) rxId = rxIdObj["id"].ToString();
                    else if (request.Payload != null) rxId = request.Payload.ToString();

                    var rx = DatabaseService.Prescriptions.GetById(rxId);
                    response = BridgeResponse.Ok(request.Id, rx);
                    return true;

                case "prescriptions:save":
                case "prescriptions.save":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات الروشتة مطلوبة.");
                        return true;
                    }
                    try
                    {
                        var newRx = JsonConvert.DeserializeObject<Prescription>(request.Payload.ToString());
                        newRx.CreatedBy = SecurityService.CurrentUser != null ? SecurityService.CurrentUser.Id : "usr_admin_default";
                        var savedRx = DatabaseService.Prescriptions.SavePrescription(newRx);
                        response = BridgeResponse.Ok(request.Id, savedRx);
                    }
                    catch (Exception ex)
                    {
                        response = BridgeResponse.Fail(request.Id, "SAVE_FAILED", ex.Message);
                    }
                    return true;

                case "prescriptions:uploadImage":
                case "prescriptions.uploadImage":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات الصورة مطلوبة.");
                        return true;
                    }
                    try
                    {
                        var upObj = request.Payload as JObject;
                        string targetRxId = upObj != null && upObj["prescriptionId"] != null ? upObj["prescriptionId"].ToString() : null;
                        string b64 = upObj != null && upObj["imageBase64"] != null ? upObj["imageBase64"].ToString() : null;
                        string ext = upObj != null && upObj["extension"] != null ? upObj["extension"].ToString() : "jpg";

                        if (string.IsNullOrEmpty(targetRxId) || string.IsNullOrEmpty(b64))
                        {
                            response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "معرف الروشتة وملف الصورة مشفر Base64 مطلوبان.");
                            return true;
                        }

                        if (b64.Contains(","))
                        {
                            b64 = b64.Substring(b64.IndexOf(",") + 1);
                        }

                        byte[] imgBytes = Convert.FromBase64String(b64);
                        string savedPath = DatabaseService.Prescriptions.UploadImage(targetRxId, imgBytes, ext);
                        response = BridgeResponse.Ok(request.Id, new { imagePath = savedPath });
                    }
                    catch (Exception ex)
                    {
                        response = BridgeResponse.Fail(request.Id, "UPLOAD_FAILED", ex.Message);
                    }
                    return true;

                case "prescriptions:getImage":
                case "prescriptions.getImage":
                    string relPath = null;
                    var pathObj = request.Payload as JObject;
                    if (pathObj != null && pathObj["imagePath"] != null) relPath = pathObj["imagePath"].ToString();
                    else if (request.Payload != null) relPath = request.Payload.ToString();

                    try
                    {
                        byte[] rawBytes = DatabaseService.Prescriptions.GetImageBytes(relPath);
                        if (rawBytes != null && rawBytes.Length > 0)
                        {
                            string resultB64 = Convert.ToBase64String(rawBytes);
                            response = BridgeResponse.Ok(request.Id, new { imageBase64 = resultB64 });
                        }
                        else
                        {
                            response = BridgeResponse.Fail(request.Id, "NOT_FOUND", "ملف الصورة غير موجود.");
                        }
                    }
                    catch (Exception ex)
                    {
                        response = BridgeResponse.Fail(request.Id, "READ_FAILED", ex.Message);
                    }
                    return true;

                // --- Expiry Returns & Write-Offs (Story 134 / Feature #191) ---
                case "pharma:getExpiryReturnableBatches":
                case "pharma.getExpiryReturnableBatches":
                    string supId = null;
                    int? winDays = null;
                    if (request.Payload != null)
                    {
                        var pObj = request.Payload as JObject;
                        if (pObj != null)
                        {
                            if (pObj["supplierId"] != null && !string.IsNullOrEmpty(pObj["supplierId"].ToString()))
                                supId = pObj["supplierId"].ToString();
                            if (pObj["windowDays"] != null && pObj["windowDays"].Type != JTokenType.Null)
                                winDays = pObj["windowDays"].Value<int>();
                        }
                    }
                    var returnables = DatabaseService.DrugReference.GetExpiryReturnableBatches(supId, winDays);
                    response = BridgeResponse.Ok(request.Id, returnables);
                    return true;

                case "pharma:getExpiredBatches":
                case "pharma.getExpiredBatches":
                    var expiredBatches = DatabaseService.DrugReference.GetExpiredBatches();
                    response = BridgeResponse.Ok(request.Id, expiredBatches);
                    return true;

                case "pharma:createExpiryReturn":
                case "pharma.createExpiryReturn":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات المرتجع مطلوبة.");
                        return true;
                    }
                    try
                    {
                        var retReq = JsonConvert.DeserializeObject<BatchExpiryReturnRequest>(request.Payload.ToString());
                        string actorId = SecurityService.CurrentUser != null ? SecurityService.CurrentUser.Id : "usr_admin_default";
                        var createdReturn = DatabaseService.DrugReference.CreateExpiryPurchaseReturn(retReq, actorId);
                        response = BridgeResponse.Ok(request.Id, createdReturn);
                    }
                    catch (Exception ex)
                    {
                        response = BridgeResponse.Fail(request.Id, "RETURN_FAILED", ex.Message);
                    }
                    return true;

                case "pharma:writeOffExpiredBatches":
                case "pharma.writeOffExpiredBatches":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات الإعدام مطلوبة.");
                        return true;
                    }
                    try
                    {
                        var woObj = request.Payload as JObject;
                        List<ExpiredWriteOffItemRequest> woItems = null;
                        string commMembers = "لجنة الجرد والتفتيش الصيدلي";
                        string woNotes = null;

                        if (woObj != null)
                        {
                            if (woObj["items"] != null)
                            {
                                woItems = JsonConvert.DeserializeObject<List<ExpiredWriteOffItemRequest>>(woObj["items"].ToString());
                            }
                            if (woObj["committeeMembers"] != null)
                            {
                                commMembers = woObj["committeeMembers"].ToString();
                            }
                            if (woObj["notes"] != null)
                            {
                                woNotes = woObj["notes"].ToString();
                            }
                        }
                        else
                        {
                            woItems = JsonConvert.DeserializeObject<List<ExpiredWriteOffItemRequest>>(request.Payload.ToString());
                        }

                        string actorId = SecurityService.CurrentUser != null ? SecurityService.CurrentUser.Id : "usr_admin_default";
                        var cert = DatabaseService.DrugReference.WriteOffExpiredBatches(woItems, commMembers, woNotes, actorId);
                        response = BridgeResponse.Ok(request.Id, cert);
                    }
                    catch (Exception ex)
                    {
                        response = BridgeResponse.Fail(request.Id, "WRITE_OFF_FAILED", ex.Message);
                    }
                    return true;

                case "pharma:getExpiredWriteOffs":
                case "pharma.getExpiredWriteOffs":
                    string fDate = null;
                    string tDate = null;
                    if (request.Payload != null)
                    {
                        var dObj = request.Payload as JObject;
                        if (dObj != null)
                        {
                            if (dObj["fromDate"] != null) fDate = dObj["fromDate"].ToString();
                            if (dObj["toDate"] != null) tDate = dObj["toDate"].ToString();
                        }
                    }
                    var writeOffs = DatabaseService.DrugReference.GetExpiredWriteOffs(fDate, tDate);
                    response = BridgeResponse.Ok(request.Id, writeOffs);
                    return true;

                // --- External Drug Reference Endpoints (Story 134 / Feature #191) ---
                case "pharma:downloadDrugReferenceTemplate":
                case "pharma.downloadDrugReferenceTemplate":
                    try
                    {
                        string templateB64 = DatabaseService.DrugReference.GenerateTemplate();
                        response = BridgeResponse.Ok(request.Id, new { templateBase64 = templateB64, fileName = "قالب_استيراد_دليل_الأدوية.xlsx" });
                    }
                    catch (Exception ex)
                    {
                        response = BridgeResponse.Fail(request.Id, "TEMPLATE_FAILED", ex.Message);
                    }
                    return true;

                case "pharma:previewDrugReferenceImport":
                case "pharma.previewDrugReferenceImport":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "ملف الإكسل مشفر Base64 مطلوب.");
                        return true;
                    }
                    try
                    {
                        string b64 = null;
                        var importPJObj = request.Payload as JObject;
                        if (importPJObj != null)
                        {
                            if (importPJObj["fileBase64"] != null) b64 = importPJObj["fileBase64"].ToString();
                            else if (importPJObj["base64"] != null) b64 = importPJObj["base64"].ToString();
                        }
                        if (string.IsNullOrWhiteSpace(b64) && request.Payload != null)
                        {
                            b64 = request.Payload.ToString();
                        }

                        if (!string.IsNullOrWhiteSpace(b64) && b64.Contains(","))
                        {
                            b64 = b64.Substring(b64.IndexOf(",") + 1);
                        }
                        if (!string.IsNullOrWhiteSpace(b64))
                        {
                            b64 = b64.Trim().Replace(" ", "").Replace("\r", "").Replace("\n", "");
                        }

                        var preview = DatabaseService.DrugReference.PreviewImport(b64);
                        response = BridgeResponse.Ok(request.Id, preview);
                    }
                    catch (Exception ex)
                    {
                        response = BridgeResponse.Fail(request.Id, "PARSE_FAILED", ex.Message);
                    }
                    return true;

                case "pharma:confirmDrugReferenceImport":
                case "pharma.confirmDrugReferenceImport":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات الأصناف للاستيراد مطلوبة.");
                        return true;
                    }
                    try
                    {
                        var cObj = request.Payload as JObject;
                        List<DrugReference> impItems = null;
                        string src = "Excel Import";

                        if (cObj != null)
                        {
                            if (cObj["items"] != null)
                            {
                                impItems = JsonConvert.DeserializeObject<List<DrugReference>>(cObj["items"].ToString());
                            }
                            else if (cObj["base64"] != null || cObj["fileBase64"] != null)
                            {
                                string b64 = (cObj["base64"] != null ? cObj["base64"] : cObj["fileBase64"]).ToString();
                                if (b64.Contains(",")) b64 = b64.Substring(b64.IndexOf(",") + 1);
                                b64 = b64.Trim().Replace(" ", "").Replace("\r", "").Replace("\n", "");
                                var preview = DatabaseService.DrugReference.PreviewImport(b64);
                                if (preview != null && preview.Rows != null)
                                {
                                    impItems = new List<DrugReference>();
                                    for (int i = 0; i < preview.Rows.Count; i++)
                                    {
                                        var row = preview.Rows[i];
                                        if (row != null && row.Status != "ERROR")
                                        {
                                            impItems.Add(new DrugReference
                                            {
                                                Barcode = row.Barcode,
                                                TradeName = row.TradeName,
                                                ScientificName = row.ScientificName,
                                                Form = row.Form,
                                                Strength = row.Strength,
                                                Manufacturer = row.Manufacturer,
                                                PackDesc = row.PackDesc,
                                                PublicPricePiasters = row.PublicPricePiasters,
                                                TherapeuticClass = row.TherapeuticClass,
                                                Category = row.Category,
                                                StorageLocation = row.StorageLocation,
                                                IsRefrigerated = row.IsRefrigerated,
                                                Route = row.Route,
                                                PregnancyCategory = row.PregnancyCategory,
                                                IsAntibiotic = row.IsAntibiotic,
                                                RxStatus = row.RxStatus,
                                                FlavorForm = row.FlavorForm,
                                                PiecesPerPack = row.PiecesPerPack
                                            });
                                        }
                                    }
                                }
                            }

                            if (cObj["source"] != null)
                            {
                                src = cObj["source"].ToString();
                            }
                        }
                        else
                        {
                            impItems = JsonConvert.DeserializeObject<List<DrugReference>>(request.Payload.ToString());
                        }

                        string actorId = SecurityService.CurrentUser != null ? SecurityService.CurrentUser.Id : "usr_admin_default";
                        int importedCount = DatabaseService.DrugReference.ConfirmImport(impItems, src, actorId);
                        response = BridgeResponse.Ok(request.Id, new { 
                            totalProcessed = impItems != null ? impItems.Count : 0,
                            createdCount = importedCount,
                            updatedCount = 0,
                            failedCount = 0,
                            importedCount = importedCount
                        });
                    }
                    catch (Exception ex)
                    {
                        response = BridgeResponse.Fail(request.Id, "CONFIRM_FAILED", ex.Message);
                    }
                    return true;

                case "pharma:checkDrugReference":
                case "pharma.checkDrugReference":
                    string checkBarcode = null;
                    var bJObj = request.Payload as JObject;
                    if (bJObj != null && bJObj["barcode"] != null) checkBarcode = bJObj["barcode"].ToString();
                    else if (request.Payload != null) checkBarcode = request.Payload.ToString();

                    if (string.IsNullOrWhiteSpace(checkBarcode))
                    {
                        response = BridgeResponse.Ok(request.Id, null);
                        return true;
                    }

                    var matchedDrug = DatabaseService.DrugReference.GetByBarcode(checkBarcode);
                    response = BridgeResponse.Ok(request.Id, matchedDrug);
                    return true;

                case "pharma:searchDrugReference":
                case "pharma.searchDrugReference":
                    string sQ = null;
                    int sLim = 50;
                    int sOff = 0;
                    if (request.Payload != null)
                    {
                        var sObj = request.Payload as JObject;
                        if (sObj != null)
                        {
                            if (sObj["query"] != null) sQ = sObj["query"].ToString();
                            if (sObj["limit"] != null) sLim = sObj["limit"].Value<int>();
                            if (sObj["offset"] != null) sOff = sObj["offset"].Value<int>();
                            else if (sObj["page"] != null)
                            {
                                int pageNum = sObj["page"].Value<int>();
                                if (pageNum > 1) sOff = (pageNum - 1) * sLim;
                            }
                        }
                    }
                    var searchRes = DatabaseService.DrugReference.Search(sQ, sLim, sOff);
                    int totalMatching = DatabaseService.DrugReference.GetSearchCount(sQ);
                    int grandTotal = DatabaseService.DrugReference.GetTotalCount();
                    response = BridgeResponse.Ok(request.Id, new
                    {
                        items = searchRes,
                        totalCount = totalMatching,
                        grandTotal = grandTotal,
                        limit = sLim,
                        offset = sOff
                    });
                    return true;

                case "pharma:clearDrugReference":
                case "pharma.clearDrugReference":
                    try
                    {
                        string actorId = SecurityService.CurrentUser != null ? SecurityService.CurrentUser.Id : "usr_admin_default";
                        DatabaseService.DrugReference.ClearAll(actorId);
                        response = BridgeResponse.Ok(request.Id, new { success = true });
                    }
                    catch (Exception ex)
                    {
                        response = BridgeResponse.Fail(request.Id, "CLEAR_FAILED", ex.Message);
                    }
                    return true;

                case "pharma:getStocktakingSheet":
                case "pharma.getStocktakingSheet":
                    string locId = null;
                    string mfgId = null;
                    string sq = null;
                    int sheetLimit = 200;
                    if (request.Payload != null)
                    {
                        JObject sObj = request.Payload as JObject;
                        if (sObj != null)
                        {
                            if (sObj["locationId"] != null) locId = sObj["locationId"].ToString();
                            if (sObj["manufacturerId"] != null) mfgId = sObj["manufacturerId"].ToString();
                            if (sObj["query"] != null) sq = sObj["query"].ToString();
                            if (sObj["limit"] != null) sheetLimit = sObj["limit"].Value<int>();
                        }
                    }
                    var stkSheet = DatabaseService.PharmaStocktaking.GetStocktakingSheet(locId, mfgId, sq, sheetLimit);
                    response = BridgeResponse.Ok(request.Id, stkSheet);
                    return true;

                case "pharma:applyStocktaking":
                case "pharma.applyStocktaking":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات التسوية الجردية فارغة.");
                        return true;
                    }
                    try
                    {
                        var stkReq = JsonConvert.DeserializeObject<PharmacyStocktakingBatchRequest>(request.Payload.ToString());
                        string actor = SecurityService.CurrentUser != null ? SecurityService.CurrentUser.Id : "usr_admin_default";
                        int adjCount = DatabaseService.PharmaStocktaking.ApplyStocktakingAdjustments(stkReq, actor);
                        response = BridgeResponse.Ok(request.Id, new { success = true, adjustedCount = adjCount });
                    }
                    catch (Exception ex)
                    {
                        response = BridgeResponse.Fail(request.Id, "ADJUSTMENT_FAILED", ex.Message);
                    }
                    return true;

                case "pharma:runGoldenSuite":
                case "pharma.runGoldenSuite":
                    try
                    {
                        var goldenResult = PharmacyGoldenSuiteTestRunner.RunAllTests();
                        if (goldenResult.Success)
                        {
                            response = BridgeResponse.Ok(request.Id, goldenResult);
                        }
                        else
                        {
                            response = BridgeResponse.Fail(request.Id, "GOLDEN_SUITE_FAILED", goldenResult.Message, goldenResult);
                        }
                    }
                    catch (Exception ex)
                    {
                        response = BridgeResponse.Fail(request.Id, "GOLDEN_SUITE_EXCEPTION", ex.Message);
                    }
                    return true;

                // =====================================================================
                // Drug-Drug Interactions (Story 137 / Feature #194 / F-01)
                // =====================================================================
                case "ddi:checkCart":
                case "ddi.checkCart":
                    var pids = new List<string>();
                    if (request.Payload != null)
                    {
                        var jObj = request.Payload as JObject;
                        if (jObj != null && jObj["productIds"] != null)
                        {
                            var arr = jObj["productIds"] as JArray;
                            if (arr != null)
                            {
                                for (int i = 0; i < arr.Count; i++) pids.Add(arr[i].ToString());
                            }
                        }
                        else
                        {
                            var jArr = request.Payload as JArray;
                            if (jArr != null)
                            {
                                for (int i = 0; i < jArr.Count; i++) pids.Add(jArr[i].ToString());
                            }
                        }
                    }
                    var checkRes = DatabaseService.DrugInteractions.CheckCartInteractions(pids);
                    response = BridgeResponse.Ok(request.Id, checkRes);
                    return true;

                case "ddi:getAll":
                case "ddi.getAll":
                    string ddiSearch = null;
                    string ddiSev = null;
                    int ddiPage = 1;
                    int ddiLimit = 50;
                    if (request.Payload != null)
                    {
                        var gObj = request.Payload as JObject;
                        if (gObj != null)
                        {
                            if (gObj["search"] != null) ddiSearch = gObj["search"].ToString();
                            if (gObj["severity"] != null) ddiSev = gObj["severity"].ToString();
                            if (gObj["page"] != null) ddiPage = gObj["page"].Value<int>();
                            if (gObj["limit"] != null) ddiLimit = gObj["limit"].Value<int>();
                        }
                    }
                    int totalDdiCount;
                    var ddiList = DatabaseService.DrugInteractions.GetAll(ddiSearch, ddiSev, ddiPage, ddiLimit, out totalDdiCount);
                    response = BridgeResponse.Ok(request.Id, new
                    {
                        items = ddiList,
                        totalCount = totalDdiCount,
                        page = ddiPage,
                        limit = ddiLimit
                    });
                    return true;

                case "ddi:getById":
                case "ddi.getById":
                    string ddiId = null;
                    if (request.Payload != null)
                    {
                        var idObj = request.Payload as JObject;
                        if (idObj != null && idObj["id"] != null) ddiId = idObj["id"].ToString();
                        else ddiId = request.Payload.ToString();
                    }
                    var singleDdi = DatabaseService.DrugInteractions.GetById(ddiId);
                    if (singleDdi == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "NOT_FOUND", "التفاعل الدوائي غير موجود.");
                    }
                    else
                    {
                        response = BridgeResponse.Ok(request.Id, singleDdi);
                    }
                    return true;

                case "ddi:save":
                case "ddi.save":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات التفاعل الدوائي مطلوبة.");
                        return true;
                    }
                    try
                    {
                        var itemToSave = JsonConvert.DeserializeObject<DrugInteraction>(request.Payload.ToString());
                        string actorUser = SecurityService.CurrentUser != null ? SecurityService.CurrentUser.Id : "usr_admin_default";
                        var savedDdi = DatabaseService.DrugInteractions.Save(itemToSave, actorUser);
                        response = BridgeResponse.Ok(request.Id, savedDdi);
                    }
                    catch (Exception ex)
                    {
                        response = BridgeResponse.Fail(request.Id, "SAVE_FAILED", ex.Message);
                    }
                    return true;

                case "ddi:delete":
                case "ddi.delete":
                    string delDdiId = null;
                    if (request.Payload != null)
                    {
                        var delObj = request.Payload as JObject;
                        if (delObj != null && delObj["id"] != null) delDdiId = delObj["id"].ToString();
                        else delDdiId = request.Payload.ToString();
                    }
                    if (string.IsNullOrEmpty(delDdiId))
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "معرف التفاعل الدوائي مطلوب.");
                        return true;
                    }
                    string delUser = SecurityService.CurrentUser != null ? SecurityService.CurrentUser.Id : "usr_admin_default";
                    bool delSuccess = DatabaseService.DrugInteractions.Delete(delDdiId, delUser);
                    response = BridgeResponse.Ok(request.Id, new { success = delSuccess });
                    return true;

                case "ddi:importFromExcel":
                case "ddi.importFromExcel":
                    string impFilePath = null;
                    if (request.Payload != null)
                    {
                        var impObj = request.Payload as JObject;
                        if (impObj != null && impObj["filePath"] != null) impFilePath = impObj["filePath"].ToString();
                        else impFilePath = request.Payload.ToString();
                    }
                    if (string.IsNullOrEmpty(impFilePath))
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "مسار ملف الإكسل مطلوب.");
                        return true;
                    }
                    try
                    {
                        string impActor = SecurityService.CurrentUser != null ? SecurityService.CurrentUser.Id : "usr_admin_default";
                        int imported = DatabaseService.DrugInteractions.ImportFromExcel(impFilePath, impActor);
                        response = BridgeResponse.Ok(request.Id, new { success = true, importedCount = imported });
                    }
                    catch (Exception ex)
                    {
                        response = BridgeResponse.Fail(request.Id, "IMPORT_FAILED", ex.Message);
                    }
                    return true;

                case "ddi:exportToExcel":
                case "ddi.exportToExcel":
                    string expSearch = null;
                    string expSev = null;
                    string expPath = null;
                    if (request.Payload != null)
                    {
                        var expObj = request.Payload as JObject;
                        if (expObj != null)
                        {
                            if (expObj["search"] != null) expSearch = expObj["search"].ToString();
                            if (expObj["severity"] != null) expSev = expObj["severity"].ToString();
                            if (expObj["targetPath"] != null) expPath = expObj["targetPath"].ToString();
                        }
                    }
                    try
                    {
                        string outPath = DatabaseService.DrugInteractions.ExportToExcel(expSearch, expSev, expPath);
                        response = BridgeResponse.Ok(request.Id, new { success = true, filePath = outPath });
                    }
                    catch (Exception ex)
                    {
                        response = BridgeResponse.Fail(request.Id, "EXPORT_FAILED", ex.Message);
                    }
                    return true;

                case "ddi:generateTemplate":
                case "ddi.generateTemplate":
                    string tmplPath = null;
                    if (request.Payload != null)
                    {
                        var tmplObj = request.Payload as JObject;
                        if (tmplObj != null && tmplObj["targetPath"] != null) tmplPath = tmplObj["targetPath"].ToString();
                    }
                    try
                    {
                        string generatedTmpl = DatabaseService.DrugInteractions.GenerateBlankTemplate(tmplPath);
                        response = BridgeResponse.Ok(request.Id, new { success = true, filePath = generatedTmpl });
                    }
                    catch (Exception ex)
                    {
                        response = BridgeResponse.Fail(request.Id, "TEMPLATE_FAILED", ex.Message);
                    }
                    return true;

                case "ddi:override":
                case "ddi.override":
                    string ovPin = "";
                    string ovReason = "";
                    var ovPids = new List<string>();
                    if (request.Payload != null)
                    {
                        var ovObj = request.Payload as JObject;
                        if (ovObj != null)
                        {
                            if (ovObj["pin"] != null) ovPin = ovObj["pin"].ToString();
                            if (ovObj["reason"] != null) ovReason = ovObj["reason"].ToString();
                            if (ovObj["conflictProductIds"] != null)
                            {
                                var arr = ovObj["conflictProductIds"] as JArray;
                                if (arr != null)
                                {
                                    for (int i = 0; i < arr.Count; i++) ovPids.Add(arr[i].ToString());
                                }
                            }
                        }
                    }

                    bool userHasOverridePerm = DatabaseService.Security.HasPermission(null, "pharma.ddi.override");
                    string supName = "";

                    if (userHasOverridePerm)
                    {
                        supName = SecurityService.CurrentUser != null ? SecurityService.CurrentUser.DisplayName : "الصيدلي المشرف";
                    }
                    else
                    {
                        if (string.IsNullOrEmpty(ovPin))
                        {
                            response = BridgeResponse.Fail(request.Id, "PIN_REQUIRED", "رمز PIN للمشرف مطلوب لتجاوز مانع الصرف الحرج.");
                            return true;
                        }

                        var verifySup = DatabaseService.Security.VerifySupervisorPin(ovPin, "pharma.ddi.override");
                        if (!verifySup.Success)
                        {
                            response = BridgeResponse.Fail(request.Id, "OVERRIDE_AUTH_FAILED", verifySup.Message);
                            return true;
                        }
                        supName = verifySup.SupervisorName;
                    }

                    string actId = SecurityService.CurrentUser != null ? SecurityService.CurrentUser.Id : "cashier";
                    if (DatabaseService.AuditRepo != null)
                    {
                        DatabaseService.AuditRepo.Log(new AuditLog
                        {
                            UserId = actId,
                            Action = "DDI_SUPERVISOR_OVERRIDE",
                            EntityType = "sales_cart",
                            EntityId = "cart",
                            DetailsJson = string.Format("تجاوز تحذير تعارض دوائي حرج بواسطة: {0}. السبب: {1}. الأصناف: {2}", supName, ovReason, string.Join(",", ovPids.ToArray()))
                        });
                    }

                    response = BridgeResponse.Ok(request.Id, new { success = true, supervisorName = supName });
                    return true;
            }

            return false;
        }
    }
}
