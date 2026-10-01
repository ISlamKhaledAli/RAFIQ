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
        private static bool TryDispatchProducts(BridgeRequest request, out BridgeResponse response)
        {
            response = null;
            switch (request.Action)
            {
                case "products:getAll":
                    int limit = 100;
                    JObject getAllObj = request.Payload as JObject;
                    if (getAllObj != null && getAllObj["limit"] != null)
                    {
                        limit = getAllObj["limit"].Value<int>();
                    }
                    var allProducts = DatabaseService.Products.GetAll(limit);
                    response = BridgeResponse.Ok(request.Id, allProducts);
                    return true;

                case "products:getLowStock":
                    int lowStockLimit = 100;
                    JObject lowStockObj = request.Payload as JObject;
                    if (lowStockObj != null && lowStockObj["limit"] != null)
                    {
                        lowStockLimit = lowStockObj["limit"].Value<int>();
                    }
                    var lowStockItems = DatabaseService.Products.GetLowStock(lowStockLimit);
                    int totalLowStockCount = DatabaseService.Products.GetLowStockCount();
                    response = BridgeResponse.Ok(request.Id, new
                    {
                        products = lowStockItems,
                        count = totalLowStockCount
                    });
                    return true;

                case "products:getLowStockCount":
                    int countOnly = DatabaseService.Products.GetLowStockCount();
                    response = BridgeResponse.Ok(request.Id, new { count = countOnly });
                    return true;

                case "products:getSmartCatalog":
                    int smartLimit = 1000;
                    JObject smartObj = request.Payload as JObject;
                    if (smartObj != null && smartObj["limit"] != null)
                    {
                        smartLimit = smartObj["limit"].Value<int>();
                    }
                    var smartCatalog = DatabaseService.Products.GetSmartCatalog(smartLimit);
                    var customQuickList = DatabaseService.QuickItems.GetAll();
                    response = BridgeResponse.Ok(request.Id, new {
                        products = smartCatalog,
                        customQuickItems = customQuickList
                    });
                    return true;

                case "products:search":
                    string query = "";
                    int searchLimit = 50;
                    int searchOffset = 0;
                    string stockStatus = "all";
                    string categoryId = "all";
                    JObject searchObj = request.Payload as JObject;
                    if (searchObj != null)
                    {
                        if (searchObj["query"] != null)
                        {
                            query = searchObj["query"].ToString();
                        }
                        if (searchObj["limit"] != null)
                        {
                            searchLimit = searchObj["limit"].Value<int>();
                        }
                        if (searchObj["offset"] != null)
                        {
                            searchOffset = searchObj["offset"].Value<int>();
                        }
                        if (searchObj["stockStatus"] != null)
                        {
                            stockStatus = searchObj["stockStatus"].ToString();
                        }
                        if (searchObj["categoryId"] != null)
                        {
                            categoryId = searchObj["categoryId"].ToString();
                        }
                    }
                    else if (request.Payload != null)
                    {
                        query = request.Payload.ToString().Trim('"', ' ');
                    }
                    var searchResults = DatabaseService.Products.Search(query, searchLimit, searchOffset, stockStatus, categoryId);
                    int searchTotalCount = DatabaseService.Products.GetSearchCount(query, stockStatus, categoryId);
                    int globalLowStockCount = DatabaseService.Products.GetLowStockCount();
                    int globalOutOfStockCount = DatabaseService.Products.GetOutOfStockCount();
                    response = BridgeResponse.Ok(request.Id, new
                    {
                        products = searchResults,
                        totalCount = searchTotalCount,
                        lowStockCount = globalLowStockCount,
                        outOfStockCount = globalOutOfStockCount,
                        offset = searchOffset,
                        limit = searchLimit
                    });
                    return true;

                case "products:save":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات المنتج فارغة");
                        return true;
                    }
                    var pSaveObj = request.Payload as JObject;
                    bool confirmSimilar = false;
                    if (pSaveObj != null && pSaveObj["confirmSimilarName"] != null)
                    {
                        confirmSimilar = pSaveObj["confirmSimilarName"].Value<bool>();
                    }
                    bool confirmBelowCost = false;
                    if (pSaveObj != null && pSaveObj["confirmBelowCost"] != null)
                    {
                        confirmBelowCost = pSaveObj["confirmBelowCost"].Value<bool>();
                    }
                    var productToSave = JsonConvert.DeserializeObject<Product>(request.Payload.ToString());
                    try
                    {
                        var savedProduct = DatabaseService.Products.SaveProduct(productToSave, confirmSimilar, confirmBelowCost);
                        response = BridgeResponse.Ok(request.Id, savedProduct);
                    }
                    catch (SimilarProductException simEx)
                    {
                        response = BridgeResponse.Fail(request.Id, "SIMILAR_NAME_WARNING", simEx.Message, new { similarProductName = simEx.SimilarProductName, reason = simEx.Reason });
                    }
                    catch (BelowCostPriceException costEx)
                    {
                        response = BridgeResponse.Fail(request.Id, "BELOW_COST_WARNING", costEx.Message, new { pricePiasters = costEx.PricePiasters, costPiasters = costEx.CostPiasters, lossPiasters = costEx.LossPiasters });
                    }
                    return true;

                case "products:getPriceHistory":
                    string pHistId = "";
                    JObject pHistObj = request.Payload as JObject;
                    if (pHistObj != null && pHistObj["productId"] != null)
                    {
                        pHistId = pHistObj["productId"].ToString();
                    }
                    else if (request.Payload != null)
                    {
                        pHistId = request.Payload.ToString().Trim('"', ' ');
                    }
                    int histLimit = 50;
                    if (pHistObj != null && pHistObj["limit"] != null)
                    {
                        histLimit = pHistObj["limit"].Value<int>();
                    }
                    var pHistory = DatabaseService.Products.GetPriceHistory(pHistId, histLimit);
                    response = BridgeResponse.Ok(request.Id, pHistory);
                    return true;

                case "products:delete":
                    string prodIdToDelete = "";
                    JObject delObj = request.Payload as JObject;
                    if (delObj != null && delObj["id"] != null)
                    {
                        prodIdToDelete = delObj["id"].ToString();
                    }
                    else if (request.Payload != null)
                    {
                        prodIdToDelete = request.Payload.ToString().Trim('"', ' ');
                    }
                    DatabaseService.Products.DeleteProduct(prodIdToDelete);
                    response = BridgeResponse.Ok(request.Id, new { success = true, deletedId = prodIdToDelete });
                    return true;

                case "products:bulkUpdateMinStock":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات التعديل الجماعي فارغة");
                        return true;
                    }
                    JObject bulkObj = request.Payload as JObject;
                    if (bulkObj == null || bulkObj["productIds"] == null || bulkObj["minStockMilli"] == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "الحقول المطلوبة (productIds, minStockMilli) ناقصة");
                        return true;
                    }
                    var pIds = bulkObj["productIds"].ToObject<List<string>>();
                    long minStockMilli = bulkObj["minStockMilli"].Value<long>();
                    DatabaseService.Products.BulkUpdateMinStock(pIds, minStockMilli);
                    response = BridgeResponse.Ok(request.Id, new { success = true, count = pIds.Count, minStockMilli = minStockMilli });
                    return true;

                case "products:importBatch":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات الاستيراد الجماعي فارغة");
                        return true;
                    }
                    var importReq = JsonConvert.DeserializeObject<BatchImportRequest>(request.Payload.ToString());
                    if (importReq == null || importReq.Items == null || importReq.Items.Count == 0)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "قائمة الأصناف المراد استيرادها فارغة");
                        return true;
                    }
                    var importResult = DatabaseService.Products.ImportBatch(importReq, "usr_admin_default");
                    response = BridgeResponse.Ok(request.Id, importResult);
                    return true;

                // Product Units Management
                case "productUnits:getByProduct":
                    string puProdId = "";
                    JObject puProdObj = request.Payload as JObject;
                    if (puProdObj != null && puProdObj["productId"] != null)
                    {
                        puProdId = puProdObj["productId"].ToString();
                    }
                    else if (request.Payload != null)
                    {
                        puProdId = request.Payload.ToString().Trim('"', ' ');
                    }
                    var pUnits = DatabaseService.ProductUnits.GetUnitsForProduct(puProdId);
                    response = BridgeResponse.Ok(request.Id, pUnits);
                    return true;

                case "productUnits:save":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات الوحدة فارغة");
                        return true;
                    }
                    var unitToSave = JsonConvert.DeserializeObject<ProductUnit>(request.Payload.ToString());
                    if (unitToSave == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "تعذر قراءة بيانات الوحدة");
                        return true;
                    }
                    try
                    {
                        ProductUnit savedUnit;
                        if (string.IsNullOrWhiteSpace(unitToSave.Id))
                        {
                            savedUnit = DatabaseService.ProductUnits.CreateUnit(unitToSave);
                        }
                        else
                        {
                            var existingUnit = DatabaseService.ProductUnits.GetUnitById(unitToSave.Id);
                            if (existingUnit == null)
                            {
                                savedUnit = DatabaseService.ProductUnits.CreateUnit(unitToSave);
                            }
                            else
                            {
                                savedUnit = DatabaseService.ProductUnits.UpdateUnit(unitToSave);
                            }
                        }
                        response = BridgeResponse.Ok(request.Id, savedUnit);
                    }
                    catch (Exception ex)
                    {
                        response = BridgeResponse.Fail(request.Id, "SAVE_UNIT_FAILED", ex.Message);
                    }
                    return true;

                case "productUnits:delete":
                    string uIdToDelete = "";
                    JObject uDelObj = request.Payload as JObject;
                    if (uDelObj != null && uDelObj["unitId"] != null)
                    {
                        uIdToDelete = uDelObj["unitId"].ToString();
                    }
                    else if (uDelObj != null && uDelObj["id"] != null)
                    {
                        uIdToDelete = uDelObj["id"].ToString();
                    }
                    else if (request.Payload != null)
                    {
                        uIdToDelete = request.Payload.ToString().Trim('"', ' ');
                    }
                    try
                    {
                        DatabaseService.ProductUnits.DeleteUnit(uIdToDelete);
                        response = BridgeResponse.Ok(request.Id, new { success = true, deletedId = uIdToDelete });
                    }
                    catch (Exception ex)
                    {
                        response = BridgeResponse.Fail(request.Id, "DELETE_UNIT_FAILED", ex.Message);
                    }
                    return true;

                case "productUnits:setBase":
                    string sbProdId = "";
                    string sbUnitId = "";
                    JObject sbObj = request.Payload as JObject;
                    if (sbObj != null)
                    {
                        if (sbObj["productId"] != null) sbProdId = sbObj["productId"].ToString();
                        if (sbObj["unitId"] != null) sbUnitId = sbObj["unitId"].ToString();
                    }
                    if (string.IsNullOrWhiteSpace(sbProdId) || string.IsNullOrWhiteSpace(sbUnitId))
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "معرف المنتج ومعرف الوحدة مطلوبان");
                        return true;
                    }
                    try
                    {
                        DatabaseService.ProductUnits.SetBaseUnit(sbProdId, sbUnitId);
                        var updatedUnits = DatabaseService.ProductUnits.GetUnitsForProduct(sbProdId);
                        response = BridgeResponse.Ok(request.Id, updatedUnits);
                    }
                    catch (Exception ex)
                    {
                        response = BridgeResponse.Fail(request.Id, "SET_BASE_UNIT_FAILED", ex.Message);
                    }
                    return true;

                case "productUnits:calculateProfit":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "البيانات فارغة");
                        return true;
                    }
                    JObject calcObj = request.Payload as JObject;
                    ProductUnit calcUnit = null;
                    ProductUnit calcBaseUnit = null;
                    if (calcObj != null)
                    {
                        if (calcObj["unit"] != null)
                        {
                            calcUnit = calcObj["unit"].ToObject<ProductUnit>();
                        }
                        if (calcObj["baseUnit"] != null)
                        {
                            calcBaseUnit = calcObj["baseUnit"].ToObject<ProductUnit>();
                        }
                    }
                    var profitInfo = DatabaseService.ProductUnits.CalculateProfit(calcUnit, calcBaseUnit);
                    response = BridgeResponse.Ok(request.Id, profitInfo);
                    return true;

                // Categories
                case "categories:getAll":
                    bool incArchived = false;
                    JObject getCatObj = request.Payload as JObject;
                    if (getCatObj != null && getCatObj["includeArchived"] != null)
                    {
                        incArchived = getCatObj["includeArchived"].Value<bool>();
                    }
                    var allCats = DatabaseService.Categories.GetAll(incArchived);
                    response = BridgeResponse.Ok(request.Id, allCats);
                    return true;

                case "categories:save":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات التصنيف فارغة");
                        return true;
                    }
                    var catToSave = JsonConvert.DeserializeObject<Category>(request.Payload.ToString());
                    var savedCat = DatabaseService.Categories.SaveCategory(catToSave);
                    response = BridgeResponse.Ok(request.Id, savedCat);
                    return true;

                case "categories:archive":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "معرف التصنيف فارغ");
                        return true;
                    }
                    JObject archCatObj = request.Payload as JObject;
                    string archCatId = archCatObj != null && archCatObj["id"] != null ? archCatObj["id"].ToString() : "";
                    bool isArch = archCatObj != null && archCatObj["isArchived"] != null ? archCatObj["isArchived"].Value<bool>() : true;
                    DatabaseService.Categories.ArchiveCategory(archCatId, isArch);
                    response = BridgeResponse.Ok(request.Id, new { success = true, id = archCatId, isArchived = isArch });
                    return true;

                case "categories:reorder":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "قائمة الترتيب فارغة");
                        return true;
                    }
                    JObject reorderObj = request.Payload as JObject;
                    List<string> orderedIds = null;
                    if (reorderObj != null && reorderObj["orderedIds"] != null)
                    {
                        orderedIds = reorderObj["orderedIds"].ToObject<List<string>>();
                    }
                    DatabaseService.Categories.ReorderCategories(orderedIds);
                    response = BridgeResponse.Ok(request.Id, new { success = true });
                    return true;

                // Quick Items
                case "quickItems:getAll":
                    var allQuickItems = DatabaseService.QuickItems.GetAll();
                    response = BridgeResponse.Ok(request.Id, allQuickItems);
                    return true;

                case "quickItems:save":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات الصنف السريع فارغة");
                        return true;
                    }
                    var quickItemToSave = JsonConvert.DeserializeObject<QuickItem>(request.Payload.ToString());
                    var savedQuickItem = DatabaseService.QuickItems.Save(quickItemToSave);
                    response = BridgeResponse.Ok(request.Id, savedQuickItem);
                    return true;

                case "quickItems:delete":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "معرف الصنف السريع فارغ");
                        return true;
                    }
                    string deleteQuickId = "";
                    JObject delQuickObj = request.Payload as JObject;
                    if (delQuickObj != null && delQuickObj["id"] != null)
                    {
                        deleteQuickId = delQuickObj["id"].ToString();
                    }
                    else if (request.Payload != null)
                    {
                        deleteQuickId = request.Payload.ToString().Trim('"', ' ');
                    }
                    bool delSuccess = DatabaseService.QuickItems.Delete(deleteQuickId);
                    response = BridgeResponse.Ok(request.Id, new { success = delSuccess, id = deleteQuickId });
                    return true;

                case "quickItems:reorder":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "قائمة الترتيب فارغة");
                        return true;
                    }
                    JObject reorderQuickObj = request.Payload as JObject;
                    List<string> orderedQuickIds = null;
                    if (reorderQuickObj != null && reorderQuickObj["orderedIds"] != null)
                    {
                        orderedQuickIds = reorderQuickObj["orderedIds"].ToObject<List<string>>();
                    }
                    DatabaseService.QuickItems.Reorder(orderedQuickIds);
                    response = BridgeResponse.Ok(request.Id, new { success = true });
                    return true;

                case "quickItems:deleteCategory":
                    string delCategoryName = "";
                    JObject delCatObj = request.Payload as JObject;
                    if (delCatObj != null && delCatObj["categoryName"] != null)
                    {
                        delCategoryName = delCatObj["categoryName"].ToString();
                    }
                    else if (request.Payload != null)
                    {
                        delCategoryName = request.Payload.ToString().Trim('"', ' ');
                    }
                    DatabaseService.QuickItems.DeleteCategory(delCategoryName);
                    response = BridgeResponse.Ok(request.Id, new { success = true, categoryName = delCategoryName });
                    return true;

                case "quickItems:renameCategory":
                    string oldCatName = "";
                    string newCatName = "";
                    JObject renCatObj = request.Payload as JObject;
                    if (renCatObj != null)
                    {
                        if (renCatObj["oldName"] != null) oldCatName = renCatObj["oldName"].ToString();
                        if (renCatObj["newName"] != null) newCatName = renCatObj["newName"].ToString();
                    }
                    DatabaseService.QuickItems.RenameCategory(oldCatName, newCatName);
                    response = BridgeResponse.Ok(request.Id, new { success = true, oldName = oldCatName, newName = newCatName });
                    return true;

                default:
                    return false;
            }
        }
    }
}
