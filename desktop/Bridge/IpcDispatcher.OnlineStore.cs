using System;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Bridge
{
    public partial class IpcDispatcher
    {
        private static bool TryDispatchOnlineStore(BridgeRequest request, out BridgeResponse response)
        {
            response = null;
            string action = request.Action ?? "";

            if (action.StartsWith("onlineStore."))
            {
                action = action.Replace('.', ':');
            }

            if (!action.StartsWith("onlineStore:"))
            {
                return false;
            }

            if (DatabaseService.Sync == null || DatabaseService.SyncRepo == null)
            {
                response = BridgeResponse.Fail(request.Id, "MODULE_NOT_INITIALIZED", "محرك المزامنة للمتجر الإلكتروني غير مهيأ.");
                return true;
            }

            var pObj = request.Payload as JObject;
            if (pObj == null && request.Payload != null)
            {
                try
                {
                    pObj = JObject.FromObject(request.Payload);
                }
                catch { }
            }

            try
            {
                if (action == "onlineStore:getState")
                {
                    var state = DatabaseService.Sync.GetState();
                    response = BridgeResponse.Ok(request.Id, state);
                    return true;
                }

                if (action == "onlineStore:saveConfig")
                {
                    var req = pObj != null ? pObj.ToObject<SyncConfigUpdateRequest>() : new SyncConfigUpdateRequest();
                    var updated = DatabaseService.Sync.SaveConfig(req);
                    response = BridgeResponse.Ok(request.Id, updated);
                    return true;
                }

                if (action == "onlineStore:triggerSync")
                {
                    bool fullCatalog = false;
                    if (pObj != null && pObj["fullCatalog"] != null)
                    {
                        fullCatalog = pObj["fullCatalog"].Value<bool>();
                    }
                    var syncResult = DatabaseService.Sync.RunSyncCycle(true, fullCatalog);
                    response = BridgeResponse.Ok(request.Id, syncResult);
                    return true;
                }

                if (action == "onlineStore:getOrders")
                {
                    string status = "all";
                    int limit = 100;
                    if (pObj != null)
                    {
                        if (pObj["status"] != null) status = pObj["status"].ToString();
                        if (pObj["limit"] != null) limit = pObj["limit"].Value<int>();
                    }
                    var orders = DatabaseService.SyncRepo.GetInboxOrders(status, limit);
                    response = BridgeResponse.Ok(request.Id, orders);
                    return true;
                }

                if (action == "onlineStore:processOrder")
                {
                    if (pObj == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات معالجة الطلب غير مكتملة.");
                        return true;
                    }

                    var req = pObj.ToObject<SyncProcessOrderRequest>();
                    if (req == null || string.IsNullOrWhiteSpace(req.OrderId) || string.IsNullOrWhiteSpace(req.Status))
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "رقم الطلب والحالة الجديدة مطلوبان.");
                        return true;
                    }

                    // Validate allowed status transitions
                    string cleanStatus = req.Status.Trim().ToLowerInvariant();
                    if (cleanStatus != "accepted" && cleanStatus != "preparing" && cleanStatus != "ready" &&
                        cleanStatus != "delivered" && cleanStatus != "rejected" && cleanStatus != "viewed")
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_STATUS", "حالة الطلب غير صالحة: " + req.Status);
                        return true;
                    }

                    // Prevent silently rejecting an order that already generated a POS invoice (must use Returns/Cancel to keep cash & stock balanced)
                    if (cleanStatus == "rejected")
                    {
                        SyncInboxItem existingInbox = DatabaseService.SyncRepo.GetInboxOrderByOrderId(req.OrderId);
                        if (existingInbox != null && !string.IsNullOrWhiteSpace(existingInbox.PosInvoiceId))
                        {
                            response = BridgeResponse.Fail(
                                request.Id,
                                "ORDER_ALREADY_INVOICED",
                                "لا يمكن رفض طلب تم إصدار فاتورة كاشير له بالفعل. يرجى عمل مرتجع أو إلغاء الفاتورة من شاشة سجل الفواتير للحفاظ على توازن الخزنة والمخزن."
                            );
                            return true;
                        }
                    }

                    bool ok = DatabaseService.SyncRepo.UpdateInboxOrderStatus(
                        req.OrderId,
                        cleanStatus,
                        req.RejectionReason,
                        req.PosInvoiceId
                    );

                    if (!ok)
                    {
                        response = BridgeResponse.Fail(request.Id, "ORDER_NOT_FOUND", "لم يتم العثور على الطلب المطلوب.");
                        return true;
                    }

                    // Fire non-blocking fast pulse so customer tracking & Web Dashboard update within ~1 second
                    System.Threading.ThreadPool.QueueUserWorkItem(delegate(object _)
                    {
                        try
                        {
                            DatabaseService.Sync.RunFastOrderPulse();
                        }
                        catch { }
                    });

                    response = BridgeResponse.Ok(request.Id, new { success = true, orderId = req.OrderId, status = cleanStatus });
                    return true;
                }

                if (action == "onlineStore:convertToSale" || action == "onlineStore:processOrderToSale")
                {
                    if (DatabaseService.License != null && DatabaseService.License.IsLicenseExpired())
                    {
                        response = BridgeResponse.Fail(request.Id, "LICENSE_EXPIRED", DatabaseService.License.GetBlockedActionMessage());
                        return true;
                    }
                    if (pObj == null || pObj["orderId"] == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "رقم الطلب مطلوب للتحويل إلى فاتورة كاشير.");
                        return true;
                    }

                    string orderId = pObj["orderId"].ToString();
                    string markStatus = pObj["markStatus"] != null ? pObj["markStatus"].ToString().Trim().ToLowerInvariant() : null;

                    SyncInboxItem inboxItem = DatabaseService.SyncRepo.GetInboxOrderByOrderId(orderId);
                    if (inboxItem == null || inboxItem.Order == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "ORDER_NOT_FOUND", "لم يتم العثور على الطلب المطلوب.");
                        return true;
                    }

                    if (string.Equals(inboxItem.ProcessStatus, "rejected", StringComparison.OrdinalIgnoreCase))
                    {
                        response = BridgeResponse.Fail(request.Id, "ORDER_REJECTED", "لا يمكن إصدار فاتورة كاشير لطلب مرفوض.");
                        return true;
                    }

                    // Idempotent guard: if already converted to a POS invoice, advance status if requested and return existing link
                    if (!string.IsNullOrWhiteSpace(inboxItem.PosInvoiceId) && DatabaseService.Sales != null)
                    {
                        Sale existingSale = DatabaseService.Sales.GetSaleById(inboxItem.PosInvoiceId);
                        if (existingSale != null)
                        {
                            string existingStatus = inboxItem.ProcessStatus;
                            if (!string.IsNullOrEmpty(markStatus) &&
                                (markStatus == "accepted" || markStatus == "preparing" || markStatus == "ready" || markStatus == "delivered") &&
                                !string.Equals(existingStatus, markStatus, StringComparison.OrdinalIgnoreCase))
                            {
                                DatabaseService.SyncRepo.UpdateInboxOrderStatus(orderId, markStatus, null, existingSale.Id);
                                existingStatus = markStatus;
                                System.Threading.ThreadPool.QueueUserWorkItem(delegate(object _)
                                {
                                    try { DatabaseService.Sync.RunFastOrderPulse(); }
                                    catch { }
                                });
                            }

                            response = BridgeResponse.Ok(request.Id, new
                            {
                                success = true,
                                alreadyConverted = true,
                                saleId = existingSale.Id,
                                invoiceNumber = existingSale.InvoiceNumber,
                                orderId = orderId,
                                status = existingStatus
                            });
                            return true;
                        }
                    }

                    OnlineOrderDto ord = inboxItem.Order;
                    if (ord.Items == null || ord.Items.Count == 0)
                    {
                        response = BridgeResponse.Fail(request.Id, "EMPTY_ORDER", "لا توجد أصناف داخل الطلب لتحويلها لفاتورة.");
                        return true;
                    }

                    // Resolve canonical POS payment method from online order payment text
                    string rawPay = (ord.PaymentMethod ?? "").Trim().ToLowerInvariant();
                    string rawNotes = (ord.Notes ?? "").Trim().ToLowerInvariant();
                    string posPaymentMethod = "cash";
                    if (rawPay.Contains("إنستا") || rawPay.Contains("انستا") || rawPay.Contains("instapay") ||
                        rawNotes.Contains("إنستا") || rawNotes.Contains("instapay"))
                    {
                        posPaymentMethod = "instapay";
                    }
                    else if (rawPay.Contains("فودافون") || rawPay.Contains("محفظ") || rawPay.Contains("vodafone") ||
                             rawNotes.Contains("فودافون") || rawNotes.Contains("vodafone"))
                    {
                        posPaymentMethod = "vodafone_cash";
                    }

                    // Build strict integer-piaster Sale items from live local product catalog
                    var saleItems = new List<SaleItem>();
                    long itemsSubtotalPiasters = 0;

                    for (int i = 0; i < ord.Items.Count; i++)
                    {
                        OnlineOrderItemDto line = ord.Items[i];
                        if (line == null || line.Quantity <= 0) continue;

                        Product localProd = (DatabaseService.ProductRepo != null && !string.IsNullOrWhiteSpace(line.ProductId))
                            ? DatabaseService.ProductRepo.GetById(line.ProductId)
                            : null;

                        long unitPrice = line.ProductPrice > 0
                            ? line.ProductPrice
                            : (localProd != null ? localProd.PricePiasters : 0);
                        long lineTotal = line.LineTotal > 0
                            ? line.LineTotal
                            : ((unitPrice * line.Quantity) + 500) / 1000;

                        itemsSubtotalPiasters += lineTotal;

                        // Explicitly pin the product's base unit (factor = 1) so SaleService never falls back
                        // to a packaged DefaultSaleUnitId (e.g. carton x12) and over-deducts stock.
                        ProductUnit baseUnit = null;
                        if (localProd != null && localProd.Units != null && localProd.Units.Count > 0)
                        {
                            for (int uIdx = 0; uIdx < localProd.Units.Count; uIdx++)
                            {
                                var candidate = localProd.Units[uIdx];
                                if (candidate != null && (candidate.IsBaseUnit || candidate.ConversionFactor == 1))
                                {
                                    baseUnit = candidate;
                                    if (candidate.IsBaseUnit) break;
                                }
                            }
                        }

                        saleItems.Add(new SaleItem
                        {
                            ProductId = localProd != null ? localProd.Id : line.ProductId,
                            ProductName = !string.IsNullOrWhiteSpace(line.ProductName)
                                ? line.ProductName
                                : (localProd != null ? localProd.Name : "صنف أونلاين"),
                            Barcode = localProd != null ? localProd.Barcode : null,
                            QuantityMilli = line.Quantity,
                            UnitPricePiasters = unitPrice,
                            UnitCostPiasters = localProd != null ? localProd.CostPiasters : 0,
                            DiscountPiasters = 0,
                            TotalPiasters = lineTotal,
                            TaxPiasters = 0,
                            TaxRatePercent = localProd != null ? (int?)localProd.TaxRatePercent : 0,
                            UnitId = baseUnit != null ? baseUnit.Id : null,
                            Unit = baseUnit != null ? baseUnit.UnitName : (localProd != null && !string.IsNullOrEmpty(localProd.Unit) ? localProd.Unit : "piece"),
                            UnitName = baseUnit != null ? baseUnit.UnitName : (localProd != null && !string.IsNullOrEmpty(localProd.Unit) ? localProd.Unit : "قطعة"),
                            ConversionFactor = 1,
                            Notes = line.Notes
                        });
                    }

                    if (saleItems.Count == 0)
                    {
                        response = BridgeResponse.Fail(request.Id, "EMPTY_ORDER", "لم يتم العثور على أصناف صالحة للتحويل.");
                        return true;
                    }

                    bool isPickup = string.Equals(ord.DeliveryMethod, "pickup", StringComparison.OrdinalIgnoreCase);
                    long deliveryFeePiasters = (!isPickup && ord.DeliveryFee > 0) ? ord.DeliveryFee : 0;
                    long grandTotalPiasters = itemsSubtotalPiasters + deliveryFeePiasters;

                    string orderRefLabel = "#ORD-" + inboxItem.OrderNumber.ToString("D4");
                    string saleNote = "طلب أونلاين " + orderRefLabel + " - " + (inboxItem.CustomerName ?? "");
                    if (!string.IsNullOrWhiteSpace(ord.DeliveryZone))
                    {
                        saleNote += " (" + ord.DeliveryZone + ")";
                    }

                    Sale saleToCreate = new Sale
                    {
                        CustomerName = inboxItem.CustomerName,
                        CustomerPhone = inboxItem.CustomerPhone,
                        OrderType = isPickup ? "takeaway" : "delivery",
                        DeliveryFeePiasters = deliveryFeePiasters,
                        SubtotalPiasters = itemsSubtotalPiasters,
                        DiscountPiasters = 0,
                        TaxPiasters = 0,
                        TotalPiasters = grandTotalPiasters,
                        PaidPiasters = grandTotalPiasters,
                        ChangePiasters = 0,
                        PaymentMethod = posPaymentMethod,
                        Notes = saleNote,
                        Items = saleItems,
                        IsVerifiedOnlineOrder = true
                    };

                    if (SecurityService.CurrentUser != null)
                    {
                        saleToCreate.CashierId = SecurityService.CurrentUser.Id;
                        saleToCreate.CashierName = !string.IsNullOrEmpty(SecurityService.CurrentUser.DisplayName)
                            ? SecurityService.CurrentUser.DisplayName
                            : SecurityService.CurrentUser.Username;
                    }

                    string idemKey = "online_order_" + orderId;
                    Sale createdSale = DatabaseService.Sales.ProcessSale(saleToCreate, idemKey);

                    string targetStatus = inboxItem.ProcessStatus;
                    if (!string.IsNullOrEmpty(markStatus) &&
                        (markStatus == "accepted" || markStatus == "preparing" || markStatus == "ready" || markStatus == "delivered"))
                    {
                        targetStatus = markStatus;
                    }
                    else if (targetStatus == "new" || targetStatus == "viewed")
                    {
                        targetStatus = "accepted";
                    }

                    DatabaseService.SyncRepo.UpdateInboxOrderStatus(orderId, targetStatus, null, createdSale.Id);

                    // Non-blocking fast push of linked invoice, status & deducted stock to cloud
                    System.Threading.ThreadPool.QueueUserWorkItem(delegate(object _)
                    {
                        try
                        {
                            DatabaseService.Sync.RunFastOrderPulse();
                        }
                        catch { }
                    });

                    response = BridgeResponse.Ok(request.Id, new
                    {
                        success = true,
                        alreadyConverted = false,
                        saleId = createdSale.Id,
                        invoiceNumber = createdSale.InvoiceNumber,
                        orderId = orderId,
                        status = targetStatus
                    });
                    return true;
                }

                if (action == "onlineStore:updateProductOnline")
                {
                    if (pObj == null || pObj["productId"] == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "معرف الصنف مطلوب.");
                        return true;
                    }

                    string productId = pObj["productId"].ToString();
                    bool isOnline = pObj["isOnline"] != null ? pObj["isOnline"].Value<bool>() : true;
                    bool isFeatured = pObj["isFeatured"] != null ? pObj["isFeatured"].Value<bool>() : false;
                    string onlineDesc = pObj["onlineDescription"] != null ? pObj["onlineDescription"].ToString() : null;
                    long? comparePrice = null;
                    if (pObj["comparePricePiasters"] != null && pObj["comparePricePiasters"].Type != JTokenType.Null)
                    {
                        comparePrice = pObj["comparePricePiasters"].Value<long>();
                    }

                    bool updated = DatabaseService.ProductRepo.UpdateOnlineFields(productId, isOnline, isFeatured, onlineDesc, comparePrice);
                    if (updated)
                    {
                        DatabaseService.SyncRepo.TryEnqueueOutboxIfEnabled("product", productId, "upsert", "{\"id\":\"" + productId + "\"}");
                    }

                    response = BridgeResponse.Ok(request.Id, new { success = updated, productId = productId });
                    return true;
                }

                if (action == "onlineStore:setCashierBusy")
                {
                    bool busy = pObj != null && pObj["busy"] != null && pObj["busy"].Value<bool>();
                    DatabaseService.Sync.SetCashierBusy(busy);
                    response = BridgeResponse.Ok(request.Id, new { busy = busy });
                    return true;
                }

                if (action == "onlineStore:getRealtimeSession")
                {
                    var session = DatabaseService.Sync.RequestRealtimeSession();
                    response = BridgeResponse.Ok(request.Id, session);
                    return true;
                }

                if (action == "onlineStore:fastPulse")
                {
                    System.Threading.ThreadPool.QueueUserWorkItem(delegate(object _)
                    {
                        try
                        {
                            DatabaseService.Sync.RunFastOrderPulse(true);
                        }
                        catch { }
                    });
                    response = BridgeResponse.Ok(request.Id, new { triggered = true });
                    return true;
                }

                if (action == "onlineStore:setRealtimeConnected")
                {
                    bool connected = pObj != null && pObj["connected"] != null && pObj["connected"].Value<bool>();
                    DatabaseService.Sync.SetRealtimeConnected(connected);
                    response = BridgeResponse.Ok(request.Id, new { connected = connected });
                    return true;
                }

                if (action == "onlineStore:openExternalUrl")
                {
                    string rawUrl = pObj != null && pObj["url"] != null ? pObj["url"].ToString() : "";
                    Uri parsedUri;
                    if (!Uri.TryCreate(rawUrl, UriKind.Absolute, out parsedUri) ||
                        !string.Equals(parsedUri.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase))
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_URL", "الرابط غير صالح.");
                        return true;
                    }

                    string host = (parsedUri.Host ?? "").Trim().ToLowerInvariant();
                    bool trusted = host == "rafiq-store-web.rafiq-store-api.workers.dev" ||
                                   host.EndsWith(".rafiq-store-api.workers.dev") ||
                                   host == "wa.me" ||
                                   host == "api.whatsapp.com" ||
                                   host == "maps.google.com" ||
                                   (host == "www.google.com" && (parsedUri.AbsolutePath ?? "").StartsWith("/maps", StringComparison.OrdinalIgnoreCase));

                    if (!trusted)
                    {
                        response = BridgeResponse.Fail(request.Id, "UNTRUSTED_HOST", "النطاق غير مسموح بفتحه خارجياً.");
                        return true;
                    }

                    System.Diagnostics.ProcessStartInfo psi = new System.Diagnostics.ProcessStartInfo(parsedUri.AbsoluteUri);
                    psi.UseShellExecute = true;
                    System.Diagnostics.Process.Start(psi);

                    response = BridgeResponse.Ok(request.Id, new { opened = true, url = parsedUri.AbsoluteUri });
                    return true;
                }

                if (action == "onlineStore:purgeOrders")
                {
                    bool ok = DatabaseService.Sync.PurgeAllOrders();
                    response = BridgeResponse.Ok(request.Id, new { success = ok });
                    return true;
                }

                if (action == "onlineStore:purgeCatalog")
                {
                    bool ok = DatabaseService.Sync.PurgeCloudCatalog();
                    response = BridgeResponse.Ok(request.Id, new { success = ok });
                    return true;
                }

                response = BridgeResponse.Fail(request.Id, "ACTION_NOT_FOUND", "أمر المتجر الإلكتروني غير معروف: " + action);
                return true;
            }
            catch (Exception ex)
            {
                response = BridgeResponse.Fail(request.Id, "ONLINE_STORE_ERROR", ex.Message);
                return true;
            }
        }
    }
}
