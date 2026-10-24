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
        private static bool TryDispatchPatients(BridgeRequest request, out BridgeResponse response)
        {
            response = null;
            string action = request.Action;

            if (action == "patients.getProfile") action = "patients:getProfile";
            else if (action == "patients.saveProfile") action = "patients:saveProfile";
            else if (action == "patients.getChronicMeds") action = "patients:getChronicMeds";
            else if (action == "patients.saveChronicMed") action = "patients:saveChronicMed";
            else if (action == "patients.deleteChronicMed") action = "patients:deleteChronicMed";
            else if (action == "patients.getDueAlerts") action = "patients:getDueAlerts";
            else if (action == "patients.recordDispense") action = "patients:recordDispense";
            else if (action == "patients.checkAllergies") action = "patients:checkAllergies";

            if (!action.StartsWith("patients:"))
            {
                return false;
            }

            if (DatabaseService.Patients == null)
            {
                response = BridgeResponse.Fail(request.Id, "MODULE_NOT_INITIALIZED", "خدمة ملفات المرضى غير مفعلة.");
                return true;
            }

            string currentUserId = SecurityService.CurrentUser != null ? SecurityService.CurrentUser.Id : "usr_admin_default";

            try
            {
                switch (action)
                {
                    case "patients:getProfile":
                        if (request.Payload == null)
                        {
                            response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "معرف العميل مطلوب.");
                            return true;
                        }
                        string getCustId = null;
                        var pObj = request.Payload as JObject;
                        if (pObj != null && pObj["customerId"] != null) getCustId = pObj["customerId"].ToString();
                        else getCustId = request.Payload.ToString();

                        var profile = DatabaseService.Patients.GetProfile(getCustId);
                        response = BridgeResponse.Ok(request.Id, profile);
                        return true;

                    case "patients:saveProfile":
                        if (request.Payload == null)
                        {
                            response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات الملف الطبي مطلوبة.");
                            return true;
                        }
                        var infoToSave = JsonConvert.DeserializeObject<CustomerPatientInfo>(request.Payload.ToString());
                        var savedProfile = DatabaseService.Patients.SaveProfile(infoToSave, currentUserId);
                        response = BridgeResponse.Ok(request.Id, savedProfile);
                        return true;

                    case "patients:getChronicMeds":
                        if (request.Payload == null)
                        {
                            response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "معرف العميل مطلوب.");
                            return true;
                        }
                        string medsCustId = null;
                        var mObj = request.Payload as JObject;
                        if (mObj != null && mObj["customerId"] != null) medsCustId = mObj["customerId"].ToString();
                        else medsCustId = request.Payload.ToString();

                        var meds = DatabaseService.Patients.GetChronicMedications(medsCustId);
                        response = BridgeResponse.Ok(request.Id, meds);
                        return true;

                    case "patients:saveChronicMed":
                        if (request.Payload == null)
                        {
                            response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات الدواء المزمن مطلوبة.");
                            return true;
                        }
                        var medToSave = JsonConvert.DeserializeObject<ChronicMedication>(request.Payload.ToString());
                        var savedMed = DatabaseService.Patients.SaveChronicMedication(medToSave, currentUserId);
                        response = BridgeResponse.Ok(request.Id, savedMed);
                        return true;

                    case "patients:deleteChronicMed":
                        if (request.Payload == null)
                        {
                            response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "معرف الدواء المزمن مطلوب.");
                            return true;
                        }
                        string delMedId = null;
                        var dObj = request.Payload as JObject;
                        if (dObj != null && dObj["id"] != null) delMedId = dObj["id"].ToString();
                        else delMedId = request.Payload.ToString();

                        bool delOk = DatabaseService.Patients.DeleteChronicMedication(delMedId, currentUserId);
                        response = BridgeResponse.Ok(request.Id, delOk);
                        return true;

                    case "patients:getDueAlerts":
                        int daysAhead = 3;
                        if (request.Payload != null)
                        {
                            var daObj = request.Payload as JObject;
                            if (daObj != null && daObj["daysAhead"] != null)
                            {
                                int.TryParse(daObj["daysAhead"].ToString(), out daysAhead);
                            }
                            else
                            {
                                int.TryParse(request.Payload.ToString(), out daysAhead);
                            }
                        }
                        var alerts = DatabaseService.Patients.GetDueAlerts(daysAhead);
                        response = BridgeResponse.Ok(request.Id, alerts);
                        return true;

                    case "patients:recordDispense":
                        if (request.Payload == null)
                        {
                            response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات صرف الدواء مطلوبة.");
                            return true;
                        }
                        var rdObj = request.Payload as JObject;
                        string rdCustId = rdObj != null && rdObj["customerId"] != null ? rdObj["customerId"].ToString() : null;
                        var prodIds = new List<string>();
                        if (rdObj != null && rdObj["productIds"] != null)
                        {
                            var arr = rdObj["productIds"] as JArray;
                            if (arr != null)
                            {
                                foreach (var item in arr)
                                {
                                    if (item != null) prodIds.Add(item.ToString());
                                }
                            }
                        }
                        int sDays = 30;
                        if (rdObj != null && rdObj["supplyDays"] != null)
                        {
                            int.TryParse(rdObj["supplyDays"].ToString(), out sDays);
                        }
                        string dispDate = rdObj != null && rdObj["dispensedAt"] != null ? rdObj["dispensedAt"].ToString() : null;

                        bool rdOk = DatabaseService.Patients.RecordDispense(rdCustId, prodIds, sDays, dispDate, currentUserId);
                        response = BridgeResponse.Ok(request.Id, rdOk);
                        return true;

                    case "patients:checkAllergies":
                        if (request.Payload == null)
                        {
                            response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات فحص الحساسية مطلوبة.");
                            return true;
                        }
                        var caObj = request.Payload as JObject;
                        string caCustId = caObj != null && caObj["customerId"] != null ? caObj["customerId"].ToString() : null;
                        var caProdIds = new List<string>();
                        if (caObj != null && caObj["productIds"] != null)
                        {
                            var arr = caObj["productIds"] as JArray;
                            if (arr != null)
                            {
                                foreach (var item in arr)
                                {
                                    if (item != null) caProdIds.Add(item.ToString());
                                }
                            }
                        }

                        var allergyRes = DatabaseService.Patients.CheckAllergies(caCustId, caProdIds);
                        response = BridgeResponse.Ok(request.Id, allergyRes);
                        return true;

                    case "patients:runTests":
                        var testRes = PatientProfileTestRunner.RunAllTests();
                        response = BridgeResponse.Ok(request.Id, testRes);
                        return true;
                }
            }
            catch (Exception ex)
            {
                response = BridgeResponse.Fail(request.Id, "PATIENT_ACTION_FAILED", ex.Message);
                return true;
            }

            return false;
        }
    }
}
