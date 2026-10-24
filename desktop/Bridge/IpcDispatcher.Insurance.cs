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
        private static bool TryDispatchInsurance(BridgeRequest request, out BridgeResponse response)
        {
            response = null;
            string action = request.Action;

            if (action == "insurance.getCompanies") action = "insurance:getCompanies";
            else if (action == "insurance.saveCompany") action = "insurance:saveCompany";
            else if (action == "insurance.deleteCompany") action = "insurance:deleteCompany";
            else if (action == "insurance.getContracts") action = "insurance:getContracts";
            else if (action == "insurance.getContract") action = "insurance:getContract";
            else if (action == "insurance.saveContract") action = "insurance:saveContract";
            else if (action == "insurance.deleteContract") action = "insurance:deleteContract";
            else if (action == "insurance.getMembers") action = "insurance:getMembers";
            else if (action == "insurance.getMemberByNo") action = "insurance:getMemberByNo";
            else if (action == "insurance.saveMember") action = "insurance:saveMember";
            else if (action == "insurance.calculateSplit") action = "insurance:calculateSplit";
            else if (action == "insurance.getPendingClaims") action = "insurance:getPendingClaims";
            else if (action == "insurance.getBatches") action = "insurance:getBatches";
            else if (action == "insurance.getBatch") action = "insurance:getBatch";
            else if (action == "insurance.createBatch") action = "insurance:createBatch";
            else if (action == "insurance.settleBatch") action = "insurance:settleBatch";
            else if (action == "insurance.exportBatchExcel") action = "insurance:exportBatchExcel";

            if (!action.StartsWith("insurance:"))
            {
                return false;
            }

            if (DatabaseService.Insurance == null)
            {
                response = BridgeResponse.Fail(request.Id, "MODULE_NOT_INITIALIZED", "خدمة التأمين الطبي غير مفعلة.");
                return true;
            }

            try
            {
                switch (action)
                {
                    case "insurance:getCompanies":
                        bool incInactive = false;
                        if (request.Payload != null)
                        {
                            var pObj = request.Payload as JObject;
                            if (pObj != null && pObj["includeInactive"] != null)
                            {
                                bool.TryParse(pObj["includeInactive"].ToString(), out incInactive);
                            }
                        }
                        var companies = DatabaseService.Insurance.GetAllCompanies(incInactive);
                        response = BridgeResponse.Ok(request.Id, companies);
                        return true;

                    case "insurance:saveCompany":
                        if (request.Payload == null)
                        {
                            response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات شركة التأمين مطلوبة.");
                            return true;
                        }
                        var companyToSave = JsonConvert.DeserializeObject<InsuranceCompany>(request.Payload.ToString());
                        var savedCompany = DatabaseService.Insurance.SaveCompany(companyToSave);
                        response = BridgeResponse.Ok(request.Id, savedCompany);
                        return true;

                    case "insurance:deleteCompany":
                        if (request.Payload == null)
                        {
                            response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "معرف شركة التأمين مطلوب.");
                            return true;
                        }
                        string compId = null;
                        var delCompObj = request.Payload as JObject;
                        if (delCompObj != null && delCompObj["id"] != null) compId = delCompObj["id"].ToString();
                        else compId = request.Payload.ToString();

                        DatabaseService.Insurance.DeleteCompany(compId);
                        response = BridgeResponse.Ok(request.Id, true);
                        return true;

                    case "insurance:getContracts":
                        string forCompanyId = null;
                        bool incInactiveContracts = false;
                        if (request.Payload != null)
                        {
                            var cObj = request.Payload as JObject;
                            if (cObj != null)
                            {
                                if (cObj["companyId"] != null) forCompanyId = cObj["companyId"].ToString();
                                if (cObj["includeInactive"] != null) bool.TryParse(cObj["includeInactive"].ToString(), out incInactiveContracts);
                            }
                        }
                        var contracts = DatabaseService.Insurance.GetAllContracts(forCompanyId, incInactiveContracts);
                        response = BridgeResponse.Ok(request.Id, contracts);
                        return true;

                    case "insurance:getContract":
                        if (request.Payload == null)
                        {
                            response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "معرف العقد مطلوب.");
                            return true;
                        }
                        string cntId = null;
                        var getCntObj = request.Payload as JObject;
                        if (getCntObj != null && getCntObj["id"] != null) cntId = getCntObj["id"].ToString();
                        else cntId = request.Payload.ToString();

                        var contract = DatabaseService.Insurance.GetContractById(cntId);
                        if (contract == null)
                        {
                            response = BridgeResponse.Fail(request.Id, "NOT_FOUND", "عقد التأمين غير موجود.");
                        }
                        else
                        {
                            response = BridgeResponse.Ok(request.Id, contract);
                        }
                        return true;

                    case "insurance:saveContract":
                        if (request.Payload == null)
                        {
                            response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات العقد مطلوبة.");
                            return true;
                        }
                        var contractToSave = JsonConvert.DeserializeObject<InsuranceContract>(request.Payload.ToString());
                        var savedContract = DatabaseService.Insurance.SaveContract(contractToSave);
                        response = BridgeResponse.Ok(request.Id, savedContract);
                        return true;

                    case "insurance:deleteContract":
                        if (request.Payload == null)
                        {
                            response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "معرف العقد مطلوب.");
                            return true;
                        }
                        string delCntId = null;
                        var delCntObj = request.Payload as JObject;
                        if (delCntObj != null && delCntObj["id"] != null) delCntId = delCntObj["id"].ToString();
                        else delCntId = request.Payload.ToString();

                        DatabaseService.Insurance.DeleteContract(delCntId);
                        response = BridgeResponse.Ok(request.Id, true);
                        return true;

                    case "insurance:getMembers":
                        string mContractId = null;
                        string mSearch = null;
                        if (request.Payload != null)
                        {
                            var mObj = request.Payload as JObject;
                            if (mObj != null)
                            {
                                if (mObj["contractId"] != null) mContractId = mObj["contractId"].ToString();
                                if (mObj["search"] != null) mSearch = mObj["search"].ToString();
                            }
                        }
                        var members = DatabaseService.Insurance.GetMembers(mContractId, mSearch);
                        response = BridgeResponse.Ok(request.Id, members);
                        return true;

                    case "insurance:getMemberByNo":
                        if (request.Payload == null)
                        {
                            response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات البحث عن المشترك مطلوبة.");
                            return true;
                        }
                        string cardNo = null;
                        string memContractId = null;
                        var cardObj = request.Payload as JObject;
                        if (cardObj != null)
                        {
                            if (cardObj["cardNumber"] != null) cardNo = cardObj["cardNumber"].ToString();
                            if (cardObj["contractId"] != null) memContractId = cardObj["contractId"].ToString();
                        }
                        else
                        {
                            cardNo = request.Payload.ToString();
                        }

                        var member = DatabaseService.Insurance.GetMemberByCardNumber(cardNo, memContractId);
                        response = BridgeResponse.Ok(request.Id, member);
                        return true;

                    case "insurance:saveMember":
                        if (request.Payload == null)
                        {
                            response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات المشترك مطلوبة.");
                            return true;
                        }
                        var memberToSave = JsonConvert.DeserializeObject<InsuranceMember>(request.Payload.ToString());
                        var savedMember = DatabaseService.Insurance.SaveMember(memberToSave);
                        response = BridgeResponse.Ok(request.Id, savedMember);
                        return true;

                    case "insurance:calculateSplit":
                        if (request.Payload == null)
                        {
                            response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات الحساب مطلوبة.");
                            return true;
                        }
                        var calcObj = request.Payload as JObject;
                        if (calcObj == null || calcObj["contractId"] == null || calcObj["items"] == null)
                        {
                            response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "العقد وقائمة الأصناف مطلوبة لحساب النسب.");
                            return true;
                        }
                        string targetContractId = calcObj["contractId"].ToString();
                        var calcItems = calcObj["items"].ToObject<List<SaleItem>>();
                        var calcResult = DatabaseService.Insurance.CalculateSplit(targetContractId, calcItems);
                        response = BridgeResponse.Ok(request.Id, calcResult);
                        return true;

                    case "insurance:getPendingClaims":
                        string pCompanyId = null;
                        string pContractId = null;
                        if (request.Payload != null)
                        {
                            var pcObj = request.Payload as JObject;
                            if (pcObj != null)
                            {
                                if (pcObj["companyId"] != null) pCompanyId = pcObj["companyId"].ToString();
                                if (pcObj["contractId"] != null) pContractId = pcObj["contractId"].ToString();
                            }
                        }
                        var pendingClaims = DatabaseService.Insurance.GetPendingClaims(pCompanyId, pContractId);
                        response = BridgeResponse.Ok(request.Id, pendingClaims);
                        return true;

                    case "insurance:getBatches":
                        string bCompanyId = null;
                        if (request.Payload != null)
                        {
                            var bObj = request.Payload as JObject;
                            if (bObj != null && bObj["companyId"] != null)
                            {
                                bCompanyId = bObj["companyId"].ToString();
                            }
                        }
                        var batches = DatabaseService.Insurance.GetBatches(bCompanyId);
                        response = BridgeResponse.Ok(request.Id, batches);
                        return true;

                    case "insurance:getBatch":
                        if (request.Payload == null)
                        {
                            response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "معرف المطالبة مطلوب.");
                            return true;
                        }
                        string getBatchId = null;
                        var gBatchObj = request.Payload as JObject;
                        if (gBatchObj != null && gBatchObj["id"] != null) getBatchId = gBatchObj["id"].ToString();
                        else getBatchId = request.Payload.ToString();

                        var batch = DatabaseService.Insurance.GetBatchById(getBatchId);
                        if (batch == null)
                        {
                            response = BridgeResponse.Fail(request.Id, "NOT_FOUND", "مطالبة التأمين غير موجودة.");
                        }
                        else
                        {
                            response = BridgeResponse.Ok(request.Id, batch);
                        }
                        return true;

                    case "insurance:createBatch":
                        if (request.Payload == null)
                        {
                            response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات إنشاء المطالبة مطلوبة.");
                            return true;
                        }
                        var createBatchObj = request.Payload as JObject;
                        if (createBatchObj == null || createBatchObj["companyId"] == null || createBatchObj["batchNumber"] == null || createBatchObj["periodMonth"] == null)
                        {
                            response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "الشركة ورقم المطالبة والشهر مطلوبين.");
                            return true;
                        }

                        string batchCompId = createBatchObj["companyId"].ToString();
                        string batchNum = createBatchObj["batchNumber"].ToString();
                        string batchMonth = createBatchObj["periodMonth"].ToString();
                        string batchNotes = createBatchObj["notes"] != null ? createBatchObj["notes"].ToString() : null;
                        List<string> selectedClaimIds = null;
                        if (createBatchObj["claimLineIds"] != null)
                        {
                            selectedClaimIds = createBatchObj["claimLineIds"].ToObject<List<string>>();
                        }

                        string batchUserId = SecurityService.CurrentUser != null ? SecurityService.CurrentUser.Id : "usr_admin_default";
                        var createdBatch = DatabaseService.Insurance.CreateBatch(batchCompId, batchNum, batchMonth, batchNotes, selectedClaimIds, batchUserId);
                        response = BridgeResponse.Ok(request.Id, createdBatch);
                        return true;

                    case "insurance:settleBatch":
                        if (request.Payload == null)
                        {
                            response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات التسوية مطلوبة.");
                            return true;
                        }
                        var settleObj = request.Payload as JObject;
                        if (settleObj == null || settleObj["batchId"] == null)
                        {
                            response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "معرف المطالبة مطلوب للتسوية.");
                            return true;
                        }

                        string sBatchId = settleObj["batchId"].ToString();
                        long approvedAmt = 0;
                        long rejectedAmt = 0;
                        if (settleObj["approvedAmountPiasters"] != null) long.TryParse(settleObj["approvedAmountPiasters"].ToString(), out approvedAmt);
                        if (settleObj["rejectedAmountPiasters"] != null) long.TryParse(settleObj["rejectedAmountPiasters"].ToString(), out rejectedAmt);
                        string rejReason = settleObj["rejectionReason"] != null ? settleObj["rejectionReason"].ToString() : null;
                        string dedTarget = settleObj["deductionTarget"] != null ? settleObj["deductionTarget"].ToString() : "expense";

                        string settleUserId = SecurityService.CurrentUser != null ? SecurityService.CurrentUser.Id : "usr_admin_default";
                        var settledBatch = DatabaseService.Insurance.SettleBatch(sBatchId, approvedAmt, rejectedAmt, rejReason, dedTarget, settleUserId);
                        response = BridgeResponse.Ok(request.Id, settledBatch);
                        return true;

                    case "insurance:exportBatchExcel":
                        if (request.Payload == null)
                        {
                            response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "معرف المطالبة مطلوب للتصدير.");
                            return true;
                        }
                        string expBatchId = null;
                        string expPath = null;
                        var expObj = request.Payload as JObject;
                        if (expObj != null)
                        {
                            if (expObj["batchId"] != null) expBatchId = expObj["batchId"].ToString();
                            if (expObj["filePath"] != null) expPath = expObj["filePath"].ToString();
                        }
                        else
                        {
                            expBatchId = request.Payload.ToString();
                        }

                        string generatedExcelPath = DatabaseService.Insurance.ExportBatchToExcel(expBatchId, expPath);
                        response = BridgeResponse.Ok(request.Id, new { path = generatedExcelPath });
                        return true;

                    default:
                        return false;
                }
            }
            catch (Exception ex)
            {
                response = BridgeResponse.Fail(request.Id, "INSURANCE_ERROR", ex.Message);
                return true;
            }
        }
    }
}
