using System;
using System.Collections.Generic;
using Newtonsoft.Json;

namespace RafiqPOS.Models
{
    public class SyncOutboxItem
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("entityType")]
        public string EntityType { get; set; }

        [JsonProperty("entityId")]
        public string EntityId { get; set; }

        [JsonProperty("operation")]
        public string Operation { get; set; }

        [JsonProperty("payloadJson")]
        public string PayloadJson { get; set; }

        [JsonProperty("createdAt")]
        public string CreatedAt { get; set; }

        [JsonProperty("syncStatus")]
        public string SyncStatus { get; set; }

        [JsonProperty("retryCount")]
        public int RetryCount { get; set; }

        [JsonProperty("lastError")]
        public string LastError { get; set; }

        [JsonProperty("syncedAt")]
        public string SyncedAt { get; set; }
    }

    public class SyncInboxItem
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("orderId")]
        public string OrderId { get; set; }

        [JsonProperty("orderNumber")]
        public int OrderNumber { get; set; }

        [JsonProperty("customerName")]
        public string CustomerName { get; set; }

        [JsonProperty("customerPhone")]
        public string CustomerPhone { get; set; }

        [JsonProperty("totalPiasters")]
        public long TotalPiasters { get; set; }

        [JsonProperty("orderDataJson")]
        public string OrderDataJson { get; set; }

        [JsonProperty("receivedAt")]
        public string ReceivedAt { get; set; }

        [JsonProperty("processStatus")]
        public string ProcessStatus { get; set; }

        [JsonProperty("posInvoiceId")]
        public string PosInvoiceId { get; set; }

        [JsonProperty("processedAt")]
        public string ProcessedAt { get; set; }

        [JsonProperty("order")]
        public OnlineOrderDto Order { get; set; }
    }

    public class OnlineOrderItemDto
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("order_id")]
        public string OrderId { get; set; }

        [JsonProperty("product_id")]
        public string ProductId { get; set; }

        [JsonProperty("product_name")]
        public string ProductName { get; set; }

        [JsonProperty("product_price")]
        public long ProductPrice { get; set; }

        [JsonProperty("quantity")]
        public long Quantity { get; set; }

        [JsonProperty("line_total")]
        public long LineTotal { get; set; }

        [JsonProperty("notes")]
        public string Notes { get; set; }
    }

    public class OnlineOrderDto
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("store_id")]
        public string StoreId { get; set; }

        [JsonProperty("order_number")]
        public int OrderNumber { get; set; }

        [JsonProperty("customer_name")]
        public string CustomerName { get; set; }

        [JsonProperty("customer_phone")]
        public string CustomerPhone { get; set; }

        [JsonProperty("customer_address")]
        public string CustomerAddress { get; set; }

        [JsonProperty("delivery_method")]
        public string DeliveryMethod { get; set; }

        [JsonProperty("delivery_zone")]
        public string DeliveryZone { get; set; }

        [JsonProperty("delivery_fee")]
        public long DeliveryFee { get; set; }

        [JsonProperty("subtotal")]
        public long Subtotal { get; set; }

        [JsonProperty("total")]
        public long Total { get; set; }

        [JsonProperty("notes")]
        public string Notes { get; set; }

        [JsonProperty("payment_method")]
        public string PaymentMethod { get; set; }

        [JsonProperty("sender_phone")]
        public string SenderPhone { get; set; }

        [JsonProperty("payment_ref")]
        public string PaymentRef { get; set; }

        [JsonProperty("receipt_image")]
        public string ReceiptImage { get; set; }

        [JsonProperty("status")]
        public string Status { get; set; }

        [JsonProperty("rejection_reason")]
        public string RejectionReason { get; set; }

        [JsonProperty("created_at")]
        public string CreatedAt { get; set; }

        [JsonProperty("items")]
        public List<OnlineOrderItemDto> Items { get; set; }

        public OnlineOrderDto()
        {
            Items = new List<OnlineOrderItemDto>();
        }
    }

    public class SyncStateDto
    {
        [JsonProperty("onlineStoreEnabled")]
        public bool OnlineStoreEnabled { get; set; }

        [JsonProperty("storeCloudId")]
        public string StoreCloudId { get; set; }

        [JsonProperty("syncApiKeyMasked")]
        public string SyncApiKeyMasked { get; set; }

        [JsonProperty("hasApiKey")]
        public bool HasApiKey { get; set; }

        [JsonProperty("onlineStoreSlug")]
        public string OnlineStoreSlug { get; set; }

        [JsonProperty("cloudApiUrl")]
        public string CloudApiUrl { get; set; }

        [JsonProperty("lastSyncTimestamp")]
        public string LastSyncTimestamp { get; set; }

        [JsonProperty("syncIntervalSeconds")]
        public int SyncIntervalSeconds { get; set; }

        [JsonProperty("pendingOutboxCount")]
        public int PendingOutboxCount { get; set; }

        [JsonProperty("failedOutboxCount")]
        public int FailedOutboxCount { get; set; }

        [JsonProperty("newOrdersCount")]
        public int NewOrdersCount { get; set; }

        [JsonProperty("isSyncing")]
        public bool IsSyncing { get; set; }

        [JsonProperty("lastError")]
        public string LastError { get; set; }
    }

    public class SyncConfigUpdateRequest
    {
        [JsonProperty("onlineStoreEnabled")]
        public bool? OnlineStoreEnabled { get; set; }

        [JsonProperty("storeCloudId")]
        public string StoreCloudId { get; set; }

        [JsonProperty("syncApiKey")]
        public string SyncApiKey { get; set; }

        [JsonProperty("onlineStoreSlug")]
        public string OnlineStoreSlug { get; set; }

        [JsonProperty("cloudApiUrl")]
        public string CloudApiUrl { get; set; }

        [JsonProperty("syncIntervalSeconds")]
        public int? SyncIntervalSeconds { get; set; }
    }

    public class SyncProcessOrderRequest
    {
        [JsonProperty("orderId")]
        public string OrderId { get; set; }

        [JsonProperty("status")]
        public string Status { get; set; }

        [JsonProperty("rejectionReason")]
        public string RejectionReason { get; set; }

        [JsonProperty("posInvoiceId")]
        public string PosInvoiceId { get; set; }
    }

    public class SyncCycleResult
    {
        [JsonProperty("success")]
        public bool Success { get; set; }

        [JsonProperty("skipped")]
        public bool Skipped { get; set; }

        [JsonProperty("message")]
        public string Message { get; set; }

        [JsonProperty("catalogSyncedCount")]
        public int CatalogSyncedCount { get; set; }

        [JsonProperty("prunedOutOfStockCount")]
        public int PrunedOutOfStockCount { get; set; }

        [JsonProperty("stockSyncedCount")]
        public int StockSyncedCount { get; set; }

        [JsonProperty("newOrdersDownloaded")]
        public int NewOrdersDownloaded { get; set; }

        [JsonProperty("orderStatusesUploaded")]
        public int OrderStatusesUploaded { get; set; }

        [JsonProperty("catalogUpdatesDownloaded")]
        public int CatalogUpdatesDownloaded { get; set; }

        [JsonProperty("syncedAt")]
        public string SyncedAt { get; set; }
    }

    /// <summary>
    /// Aggregate-only daily POS sales summary uploaded to cloud owner dashboard (zero PII).
    /// All monetary amounts are strict integer piasters.
    /// </summary>
    public class DailySalesSummaryDto
    {
        [JsonProperty("summary_date")]
        public string SummaryDate { get; set; }

        [JsonProperty("total_sales")]
        public long TotalSales { get; set; }

        [JsonProperty("invoice_count")]
        public int InvoiceCount { get; set; }

        [JsonProperty("avg_invoice")]
        public long AvgInvoice { get; set; }

        [JsonProperty("cash_total")]
        public long CashTotal { get; set; }

        [JsonProperty("card_total")]
        public long CardTotal { get; set; }

        [JsonProperty("credit_total")]
        public long CreditTotal { get; set; }

        [JsonProperty("returns_count")]
        public int ReturnsCount { get; set; }

        [JsonProperty("returns_total")]
        public long ReturnsTotal { get; set; }

        [JsonProperty("hourly_breakdown")]
        public Dictionary<string, long> HourlyBreakdown { get; set; }

        [JsonProperty("top_products")]
        public List<DailyTopProductDto> TopProducts { get; set; }

        [JsonProperty("metrics")]
        public DailyExtendedMetricsDto Metrics { get; set; }
    }

    public class DailyExtendedMetricsDto
    {
        [JsonProperty("gross_profit")]
        public long GrossProfitPiasters { get; set; }

        [JsonProperty("expenses_total")]
        public long ExpensesTotalPiasters { get; set; }

        [JsonProperty("net_profit")]
        public long NetProfitPiasters { get; set; }

        [JsonProperty("instapay_total")]
        public long InstapayTotalPiasters { get; set; }

        [JsonProperty("wallet_total")]
        public long WalletTotalPiasters { get; set; }

        [JsonProperty("card_only_total")]
        public long CardOnlyTotalPiasters { get; set; }

        [JsonProperty("debt_payments_total")]
        public long DebtPaymentsTotalPiasters { get; set; }

        [JsonProperty("discount_total")]
        public long DiscountTotalPiasters { get; set; }

        [JsonProperty("cancelled_count")]
        public int CancelledCount { get; set; }

        [JsonProperty("cancelled_total")]
        public long CancelledTotalPiasters { get; set; }

        [JsonProperty("customer_debts_total")]
        public long CustomerDebtsTotalPiasters { get; set; }

        [JsonProperty("debtor_customers_count")]
        public int DebtorCustomersCount { get; set; }

        [JsonProperty("supplier_debts_total")]
        public long SupplierDebtsTotalPiasters { get; set; }
    }

    public class DailyTopProductDto
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("name")]
        public string Name { get; set; }

        [JsonProperty("qty")]
        public long QtyMilli { get; set; }

        [JsonProperty("revenue")]
        public long RevenuePiasters { get; set; }

        [JsonProperty("profit")]
        public long ProfitPiasters { get; set; }
    }

    public enum InboxSaveOutcome
    {
        Unchanged = 0,
        Inserted = 1,
        Updated = 2
    }

    public class OnlineOrderNotificationDto
    {
        [JsonProperty("orderId")]
        public string OrderId { get; set; }

        [JsonProperty("orderNumber")]
        public int OrderNumber { get; set; }

        [JsonProperty("customerName")]
        public string CustomerName { get; set; }

        [JsonProperty("customerPhone")]
        public string CustomerPhone { get; set; }

        [JsonProperty("totalPiasters")]
        public long TotalPiasters { get; set; }

        [JsonProperty("deliveryMethod")]
        public string DeliveryMethod { get; set; }

        [JsonProperty("paymentMethod")]
        public string PaymentMethod { get; set; }

        [JsonProperty("itemsCount")]
        public int ItemsCount { get; set; }

        [JsonProperty("processStatus")]
        public string ProcessStatus { get; set; }
    }

    public class OnlineOrdersSyncedEvent
    {
        [JsonProperty("newOrdersCount")]
        public int NewOrdersCount { get; set; }

        [JsonProperty("updatedOrdersCount")]
        public int UpdatedOrdersCount { get; set; }

        [JsonProperty("totalPendingNewCount")]
        public int TotalPendingNewCount { get; set; }

        [JsonProperty("syncedAt")]
        public string SyncedAt { get; set; }

        [JsonProperty("newOrders")]
        public List<OnlineOrderNotificationDto> NewOrders { get; set; }
    }

    public class CloudCatalogProductDelta
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("description")]
        public string Description { get; set; }

        [JsonProperty("is_online")]
        public int IsOnline { get; set; }

        [JsonProperty("is_featured")]
        public int IsFeatured { get; set; }

        [JsonProperty("updated_at")]
        public string UpdatedAt { get; set; }
    }
}
