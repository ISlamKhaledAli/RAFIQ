using System;
using System.Collections.Generic;
using Newtonsoft.Json;

namespace RafiqPOS.Models
{
    public class SaleItem
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("saleId")]
        public string SaleId { get; set; }

        [JsonProperty("productId")]
        public string ProductId { get; set; }

        [JsonProperty("productName")]
        public string ProductName { get; set; }

        [JsonProperty("barcode")]
        public string Barcode { get; set; }

        [JsonProperty("quantityMilli")]
        public long QuantityMilli { get; set; }

        [JsonProperty("unitPricePiasters")]
        public long UnitPricePiasters { get; set; }

        [JsonProperty("unitCostPiasters")]
        public long UnitCostPiasters { get; set; }

        [JsonProperty("discountPiasters")]
        public long DiscountPiasters { get; set; }

        [JsonProperty("totalPiasters")]
        public long TotalPiasters { get; set; }

        [JsonProperty("taxPiasters")]
        public long TaxPiasters { get; set; }

        [JsonProperty("taxRatePercent")]
        public int? TaxRatePercent { get; set; }

        [JsonProperty("unit")]
        public string Unit { get; set; }

        [JsonProperty("unitId")]
        public string UnitId { get; set; }

        [JsonProperty("unitName")]
        public string UnitName { get; set; }

        [JsonProperty("conversionFactor")]
        public int ConversionFactor { get; set; }

        [JsonProperty("batchId")]
        public string BatchId { get; set; }

        [JsonProperty("batchNumber")]
        public string BatchNumber { get; set; }

        [JsonProperty("expiryDate")]
        public string ExpiryDate { get; set; }

        [JsonProperty("isExpiredBypass")]
        public bool IsExpiredBypass { get; set; }

        [JsonProperty("isColdChain")]
        public bool IsColdChain { get; set; }

        [JsonProperty("notes")]
        public string Notes { get; set; }

        [JsonProperty("modifiers")]
        public List<SaleItemModifier> Modifiers { get; set; }

        public SaleItem()
        {
            Modifiers = new List<SaleItemModifier>();
        }
    }

    public class Sale
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("hasColdChainItems")]
        public bool HasColdChainItems { get; set; }

        [JsonProperty("invoiceNumber")]
        public int InvoiceNumber { get; set; }

        [JsonProperty("cashierId")]
        public string CashierId { get; set; }

        [JsonProperty("cashierName")]
        public string CashierName { get; set; }

        [JsonProperty("customerId")]
        public string CustomerId { get; set; }

        [JsonProperty("customerName")]
        public string CustomerName { get; set; }

        [JsonProperty("customerPhone")]
        public string CustomerPhone { get; set; }

        [JsonProperty("subtotalPiasters")]
        public long SubtotalPiasters { get; set; }

        [JsonProperty("discountPiasters")]
        public long DiscountPiasters { get; set; }

        [JsonProperty("taxPiasters")]
        public long TaxPiasters { get; set; }

        [JsonProperty("totalPiasters")]
        public long TotalPiasters { get; set; }

        [JsonProperty("paidPiasters")]
        public long PaidPiasters { get; set; }

        [JsonProperty("paymentMethod")]
        public string PaymentMethod { get; set; }

        [JsonProperty("status")]
        public string Status { get; set; }

        [JsonProperty("notes")]
        public string Notes { get; set; }

        [JsonProperty("changePiasters")]
        public long ChangePiasters { get; set; }

        /// <summary>
        /// E-payment service fee collected for the payment provider (pass-through, not shop revenue).
        /// Always computed on the server; any client-supplied value is ignored.
        /// </summary>
        [JsonProperty("serviceFeePiasters")]
        public long ServiceFeePiasters { get; set; }

        [JsonProperty("idempotencyKey")]
        public string IdempotencyKey { get; set; }

        [JsonProperty("supervisorPin")]
        public string SupervisorPin { get; set; }

        [JsonProperty("shiftId")]
        public string ShiftId { get; set; }

        [JsonProperty("createdAt")]
        public string CreatedAt { get; set; }

        [JsonProperty("items")]
        public List<SaleItem> Items { get; set; }

        [JsonProperty("payments")]
        public List<SalePayment> Payments { get; set; }

        [JsonProperty("negativeStockWarnings")]
        public List<string> NegativeStockWarnings { get; set; }

        [JsonProperty("creditLimitWarning")]
        public string CreditLimitWarning { get; set; }

        [JsonProperty("controlledDispenses")]
        public List<ControlledDrugDispense> ControlledDispenses { get; set; }

        [JsonProperty("prescription")]
        public Prescription Prescription { get; set; }

        [JsonProperty("insuranceClaim")]
        public InsuranceClaimLine InsuranceClaim { get; set; }

        [JsonProperty("orderType")]
        public string OrderType { get; set; }

        [JsonProperty("orderCallNumber")]
        public int OrderCallNumber { get; set; }

        [JsonProperty("tableId")]
        public string TableId { get; set; }

        [JsonProperty("tableName")]
        public string TableName { get; set; }

        [JsonProperty("guestsCount")]
        public int GuestsCount { get; set; }

        [JsonProperty("waiterName")]
        public string WaiterName { get; set; }

        [JsonProperty("serviceChargePiasters")]
        public long ServiceChargePiasters { get; set; }

        [JsonProperty("deliveryFeePiasters")]
        public long DeliveryFeePiasters { get; set; }

        [JsonProperty("deliveryInfo")]
        public DeliveryOrderCreateInfo DeliveryInfo { get; set; }

        public Sale()
        {
            Items = new List<SaleItem>();
            Payments = new List<SalePayment>();
            NegativeStockWarnings = new List<string>();
            ControlledDispenses = new List<ControlledDrugDispense>();
            OrderType = "takeaway";
            GuestsCount = 1;
        }
    }

    public class SalePayment
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("saleId")]
        public string SaleId { get; set; }

        [JsonProperty("amountPiasters")]
        public long AmountPiasters { get; set; }

        [JsonProperty("method")]
        public string Method { get; set; }

        [JsonProperty("createdAt")]
        public string CreatedAt { get; set; }
    }
}
