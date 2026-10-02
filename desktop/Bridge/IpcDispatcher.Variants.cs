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
        private static bool TryDispatchVariants(BridgeRequest request, out BridgeResponse response)
        {
            response = null;
            switch (request.Action)
            {
                case "variants:createMatrix":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "Ø¨ÙŠØ§Ù†Ø§Øª Ù…ØµÙÙˆÙØ© Ø§Ù„ØªØ±ÙƒÙŠØ¨Ø§Øª Ù…ÙÙ‚ÙˆØ¯Ø©");
                        return true;
                    }
                    CreateVariantMatrixRequest matrixReq = null;
                    if (request.Payload is JObject)
                    {
                        matrixReq = ((JObject)request.Payload).ToObject<CreateVariantMatrixRequest>();
                    }
                    else if (request.Payload is string)
                    {
                        matrixReq = JsonConvert.DeserializeObject<CreateVariantMatrixRequest>(request.Payload.ToString());
                    }

                    if (matrixReq == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "ØªØ¹Ø°Ø± Ù‚Ø±Ø§Ø¡Ø© Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„ØªØ±ÙƒÙŠØ¨Ø§Øª");
                        return true;
                    }

                    var matrixResult = DatabaseService.ProductVariants.CreateVariantMatrix(matrixReq);
                    response = BridgeResponse.Ok(request.Id, matrixResult);
                    return true;

                case "variants:getByParentId":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "Ù…Ø¹Ø±Ù Ø§Ù„Ù…Ù†ØªØ¬ Ø§Ù„Ø£Ø¨ Ù…ÙÙ‚ÙˆØ¯");
                        return true;
                    }
                    string parentId = null;
                    JObject byParentObj = request.Payload as JObject;
                    if (byParentObj != null && byParentObj["parentId"] != null)
                    {
                        parentId = byParentObj["parentId"].ToString();
                    }
                    else
                    {
                        parentId = request.Payload.ToString().Trim('"', ' ');
                    }

                    var variants = DatabaseService.ProductVariants.GetVariantsByParentId(parentId);
                    response = BridgeResponse.Ok(request.Id, variants);
                    return true;

                case "variants:getParentWithVariants":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "Ù…Ø¹Ø±Ù Ø§Ù„Ù…Ù†ØªØ¬ Ø§Ù„Ø£Ø¨ Ù…ÙÙ‚ÙˆØ¯");
                        return true;
                    }
                    string pId = null;
                    JObject pObj = request.Payload as JObject;
                    if (pObj != null && pObj["parentId"] != null)
                    {
                        pId = pObj["parentId"].ToString();
                    }
                    else
                    {
                        pId = request.Payload.ToString().Trim('"', ' ');
                    }

                    var parentWithVariants = DatabaseService.ProductVariants.GetParentWithVariants(pId);
                    response = BridgeResponse.Ok(request.Id, parentWithVariants);
                    return true;

                case "variants:getMatrixReport":
                    var report = DatabaseService.ProductVariants.GetVariantMatrixReport();
                    response = BridgeResponse.Ok(request.Id, report);
                    return true;

                default:
                    return false;
            }
        }
    }
}

