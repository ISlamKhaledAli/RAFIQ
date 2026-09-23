using System;
using System.Collections.Generic;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Bridge
{
    public class IpcDispatcher
    {
        public static BridgeResponse Dispatch(BridgeRequest request)
        {
            if (request == null || string.IsNullOrWhiteSpace(request.Action))
            {
                string reqId = (request != null && request.Id != null) ? request.Id : "";
                return BridgeResponse.Fail(reqId, "INVALID_REQUEST", "طلب غير صالح أو فارغ");
            }

            try
            {
                switch (request.Action)
                {
                    case "system:getInfo":
                        string osDetails = Environment.OSVersion.VersionString + (Environment.Is64BitOperatingSystem ? " (64-bit)" : " (32-bit)");
                        return BridgeResponse.Ok(request.Id, new
                        {
                            appName = "رفيق POS",
                            version = "1.0.0-Spike",
                            osVersion = osDetails,
                            isWebView2 = true,
                            dbStatus = DatabaseService.GetStatus()
                        });

                    case "system:ping":
                        return BridgeResponse.Ok(request.Id, new { timestamp = DateTime.UtcNow.ToString("o") });

                    case "products:getAll":
                        int limit = 100;
                        JObject getAllObj = request.Payload as JObject;
                        if (getAllObj != null && getAllObj["limit"] != null)
                        {
                            limit = getAllObj["limit"].Value<int>();
                        }
                        var allProducts = DatabaseService.Products.GetAll(limit);
                        return BridgeResponse.Ok(request.Id, allProducts);

                    case "products:search":
                        string query = "";
                        JObject searchObj = request.Payload as JObject;
                        if (searchObj != null && searchObj["query"] != null)
                        {
                            query = searchObj["query"].ToString();
                        }
                        var searchResults = DatabaseService.Products.Search(query);
                        return BridgeResponse.Ok(request.Id, searchResults);

                    case "products:save":
                        if (request.Payload == null)
                        {
                            return BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات المنتج فارغة");
                        }
                        var productToSave = JsonConvert.DeserializeObject<Product>(request.Payload.ToString());
                        var savedProduct = DatabaseService.Products.SaveProduct(productToSave);
                        return BridgeResponse.Ok(request.Id, savedProduct);

                    case "sales:create":
                        if (request.Payload == null)
                        {
                            return BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات الفاتورة فارغة");
                        }
                        var saleToCreate = JsonConvert.DeserializeObject<Sale>(request.Payload.ToString());
                        var createdSale = DatabaseService.Sales.ProcessSale(saleToCreate);
                        return BridgeResponse.Ok(request.Id, createdSale);

                    case "sales:getRecent":
                        var recentSales = DatabaseService.Sales.GetRecentSales(20);
                        return BridgeResponse.Ok(request.Id, recentSales);

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
                            return BridgeResponse.Ok(request.Id, new { success = true, message = result.Message });
                        }
                        else
                        {
                            return BridgeResponse.Fail(request.Id, "DB_TRANSACTION_FAILED", result.Message);
                        }

                    case "printer:test":
                        return BridgeResponse.Ok(request.Id, new
                        {
                            success = true,
                            message = "تمت محاكاة طباعة إيصال عربي (ESC/POS) بعرض 80مم عبر Win32 Spooler بنجاح"
                        });

                    default:
                        return BridgeResponse.Fail(request.Id, "ACTION_NOT_FOUND", "الإجراء غير مسجل في النواة: " + request.Action);
                }
            }
            catch (Exception ex)
            {
                return BridgeResponse.Fail(request.Id, "INTERNAL_ERROR", ex.Message);
            }
        }
    }
}
