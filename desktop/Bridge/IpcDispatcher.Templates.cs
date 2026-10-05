using System;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Bridge
{
    public partial class IpcDispatcher
    {
        private static bool TryDispatchTemplates(BridgeRequest request, out BridgeResponse response)
        {
            response = null;
            switch (request.Action)
            {
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

                case "templates:seedProducts":
                    string tplToSeed = "supermarket";
                    if (request.Payload != null)
                    {
                        JObject sObj = request.Payload as JObject;
                        if (sObj != null && sObj["templateId"] != null)
                        {
                            tplToSeed = sObj["templateId"].ToString();
                        }
                        else if (request.Payload is string)
                        {
                            string strPayload = request.Payload.ToString();
                            if (!string.IsNullOrWhiteSpace(strPayload))
                            {
                                tplToSeed = strPayload;
                            }
                        }
                    }
                    if (string.IsNullOrWhiteSpace(tplToSeed) || tplToSeed == "supermarket")
                    {
                        string savedType = DatabaseService.SettingsRepo.Get("store_type", "");
                        if (!string.IsNullOrWhiteSpace(savedType))
                        {
                            tplToSeed = savedType;
                        }
                    }
                    int seededCount = DatabaseService.Templates.SeedProductsForTemplate(tplToSeed);
                    response = BridgeResponse.Ok(request.Id, new {
                        success = true,
                        seededCount = seededCount,
                        templateId = tplToSeed
                    });
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

                default:
                    return false;
            }
        }
    }
}
