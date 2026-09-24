using System;
using Newtonsoft.Json;

namespace RafiqPOS.Models
{
    public class Customer
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("name")]
        public string Name { get; set; }

        [JsonProperty("phone")]
        public string Phone { get; set; }

        [JsonProperty("balancePiasters")]
        public long BalancePiasters { get; set; }

        [JsonProperty("creditLimitPiasters")]
        public long CreditLimitPiasters { get; set; }

        [JsonProperty("createdAt")]
        public string CreatedAt { get; set; }

        [JsonProperty("balanceFormatted")]
        public string BalanceFormatted
        {
            get
            {
                return Common.Money.FormatPiasters(this.BalancePiasters);
            }
        }

        [JsonProperty("creditLimitFormatted")]
        public string CreditLimitFormatted
        {
            get
            {
                return Common.Money.FormatPiasters(this.CreditLimitPiasters);
            }
        }
    }

    public class CustomerLedgerEntry
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("customerId")]
        public string CustomerId { get; set; }

        [JsonProperty("type")]
        public string Type { get; set; } // 'sale', 'payment', 'opening_balance'

        [JsonProperty("saleId")]
        public string SaleId { get; set; }

        [JsonProperty("amountPiasters")]
        public long AmountPiasters { get; set; }

        [JsonProperty("balanceAfterPiasters")]
        public long BalanceAfterPiasters { get; set; }

        [JsonProperty("notes")]
        public string Notes { get; set; }

        [JsonProperty("createdAt")]
        public string CreatedAt { get; set; }

        [JsonProperty("amountFormatted")]
        public string AmountFormatted
        {
            get
            {
                return Common.Money.FormatPiasters(this.AmountPiasters);
            }
        }

        [JsonProperty("balanceAfterFormatted")]
        public string BalanceAfterFormatted
        {
            get
            {
                return Common.Money.FormatPiasters(this.BalanceAfterPiasters);
            }
        }
    }
}
