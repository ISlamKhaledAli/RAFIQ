using System;
using System.Collections.Generic;
using Newtonsoft.Json;

namespace RafiqPOS.Models
{
    public class ReturnItem
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("returnId")]
        public string ReturnId { get; set; }

        [JsonProperty("saleItemId")]
        public string SaleItemId { get; set; }

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

        [JsonProperty("totalPiasters")]
        public long TotalPiasters { get; set; }

        [JsonProperty("isDamaged")]
        public bool IsDamaged { get; set; }

        [JsonProperty("unit")]
        public string Unit { get; set; }

        [JsonProperty("conversionFactor")]
        public int ConversionFactor { get; set; }

        [JsonProperty("batchId")]
        public string BatchId { get; set; }

        [JsonProperty("batchNumber")]
        public string BatchNumber { get; set; }

        [JsonProperty("createdAt")]
        public string CreatedAt { get; set; }
    }

    /// <summary>One slice of a split refund: the money leaves through exactly one method.</summary>
    public class ReturnRefundPart
    {
        [JsonProperty("method")]
        public string Method { get; set; }

        /// <summary>Amount in piasters; zero/omitted on at most one part means "the remainder of the return total".</summary>
        [JsonProperty("amountPiasters")]
        public long AmountPiasters { get; set; }
    }

    /// <summary>The most each original tender can still refund (piasters), computed by the server with the same rules ProcessReturn enforces.</summary>
    public class RefundCapsInfo
    {
        [JsonProperty("saleId")]
        public string SaleId { get; set; }

        [JsonProperty("cashPiasters")]
        public long CashPiasters { get; set; }

        [JsonProperty("cardPiasters")]
        public long CardPiasters { get; set; }

        [JsonProperty("instapayPiasters")]
        public long InstapayPiasters { get; set; }

        [JsonProperty("walletPiasters")]
        public long WalletPiasters { get; set; }

        /// <summary>True when the invoice belongs to a registered customer (credit refunds reduce that customer's debt).</summary>
        [JsonProperty("creditAllowed")]
        public bool CreditAllowed { get; set; }

        /// <summary>Invoice total minus everything refunded so far.</summary>
        [JsonProperty("remainingPiasters")]
        public long RemainingPiasters { get; set; }
    }

    public class Return
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("returnNumber")]
        public int ReturnNumber { get; set; }

        [JsonProperty("saleId")]
        public string SaleId { get; set; }

        [JsonProperty("invoiceNumber")]
        public int? InvoiceNumber { get; set; }

        [JsonProperty("customerId")]
        public string CustomerId { get; set; }

        [JsonProperty("customerName")]
        public string CustomerName { get; set; }

        [JsonProperty("cashierId")]
        public string CashierId { get; set; }

        [JsonProperty("totalPiasters")]
        public long TotalPiasters { get; set; }

        [JsonProperty("refundMethod")]
        public string RefundMethod { get; set; }

        /// <summary>
        /// Split refund (optional): when present the return total is paid through these methods and RefundMethod is the first part.
        /// Each part after the first is persisted as a linked item-less return row so every cash/ledger query keeps summing per method.
        /// </summary>
        [JsonProperty("refunds")]
        public List<ReturnRefundPart> Refunds { get; set; }

        [JsonProperty("reason")]
        public string Reason { get; set; }

        [JsonProperty("isWithoutInvoice")]
        public bool IsWithoutInvoice { get; set; }

        [JsonProperty("shiftId")]
        public string ShiftId { get; set; }

        /// <summary>Client key per return attempt; a retried request returns the already-saved return.</summary>
        [JsonProperty("idempotencyKey")]
        public string IdempotencyKey { get; set; }

        [JsonIgnore]
        public string IdempotencyFingerprint { get; set; }

        /// <summary>Set only by ReturnService after it priced every line from the validated original invoice; never from the client.</summary>
        [JsonIgnore]
        public bool TotalsComputedByService { get; set; }

        [JsonProperty("createdAt")]
        public string CreatedAt { get; set; }

        [JsonProperty("items")]
        public List<ReturnItem> Items { get; set; }

        public Return()
        {
            Items = new List<ReturnItem>();
        }
    }
}
