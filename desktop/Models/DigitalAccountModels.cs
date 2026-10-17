using System;
using System.Collections.Generic;
using Newtonsoft.Json;
using RafiqPOS.Common;

namespace RafiqPOS.Models
{
    public class DigitalAccount
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("name")]
        public string Name { get; set; }

        [JsonProperty("type")]
        public string Type { get; set; } // "wallet" or "instapay"

        [JsonProperty("provider")]
        public string Provider { get; set; } // "vodafone_cash", "orange_cash", "etisalat_cash", "we_pay", "instapay", "bank_account", "other"

        [JsonProperty("accountNumber")]
        public string AccountNumber { get; set; }

        [JsonProperty("balancePiasters")]
        public long BalancePiasters { get; set; }

        [JsonProperty("lowBalanceAlertPiasters")]
        public long LowBalanceAlertPiasters { get; set; }

        [JsonProperty("isDefault")]
        public bool IsDefault { get; set; }

        [JsonProperty("isActive")]
        public bool IsActive { get; set; }

        [JsonProperty("notes")]
        public string Notes { get; set; }

        [JsonProperty("createdAt")]
        public string CreatedAt { get; set; }

        [JsonProperty("updatedAt")]
        public string UpdatedAt { get; set; }

        [JsonProperty("balanceFormatted")]
        public string BalanceFormatted
        {
            get { return Money.FormatPiasters(BalancePiasters); }
        }

        [JsonProperty("lowBalanceAlertFormatted")]
        public string LowBalanceAlertFormatted
        {
            get { return Money.FormatPiasters(LowBalanceAlertPiasters); }
        }

        [JsonProperty("isLowBalance")]
        public bool IsLowBalance
        {
            get { return BalancePiasters <= LowBalanceAlertPiasters; }
        }
    }

    public class DigitalTransaction
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("accountId")]
        public string AccountId { get; set; }

        [JsonProperty("accountName")]
        public string AccountName { get; set; }

        [JsonProperty("accountType")]
        public string AccountType { get; set; }

        [JsonProperty("txType")]
        public string TxType { get; set; } // "cash_out", "cash_in", "pos_sale", "funding"

        [JsonProperty("amountPiasters")]
        public long AmountPiasters { get; set; }

        [JsonProperty("profitPiasters")]
        public long ProfitPiasters { get; set; }

        [JsonProperty("totalCollectedPiasters")]
        public long TotalCollectedPiasters { get; set; }

        [JsonProperty("customerPhone")]
        public string CustomerPhone { get; set; }

        [JsonProperty("customerName")]
        public string CustomerName { get; set; }

        [JsonProperty("referenceNumber")]
        public string ReferenceNumber { get; set; }

        [JsonProperty("saleId")]
        public string SaleId { get; set; }

        [JsonProperty("cashierName")]
        public string CashierName { get; set; }

        [JsonProperty("paymentDestination")]
        public string PaymentDestination { get; set; } // "cash_drawer", "terminal_till", "safe", "external"

        [JsonProperty("status")]
        public string Status { get; set; } // "completed", "cancelled"

        [JsonProperty("notes")]
        public string Notes { get; set; }

        [JsonProperty("createdAt")]
        public string CreatedAt { get; set; }

        [JsonProperty("amountFormatted")]
        public string AmountFormatted
        {
            get { return Money.FormatPiasters(AmountPiasters); }
        }

        [JsonProperty("profitFormatted")]
        public string ProfitFormatted
        {
            get { return Money.FormatPiasters(ProfitPiasters); }
        }

        [JsonProperty("totalCollectedFormatted")]
        public string TotalCollectedFormatted
        {
            get { return Money.FormatPiasters(TotalCollectedPiasters); }
        }
    }

    public class DigitalAccountFunding
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("accountId")]
        public string AccountId { get; set; }

        [JsonProperty("accountName")]
        public string AccountName { get; set; }

        [JsonProperty("amountPiasters")]
        public long AmountPiasters { get; set; }

        [JsonProperty("fundingSource")]
        public string FundingSource { get; set; } // "cash_drawer", "bank_transfer", "external"

        [JsonProperty("previousBalancePiasters")]
        public long PreviousBalancePiasters { get; set; }

        [JsonProperty("newBalancePiasters")]
        public long NewBalancePiasters { get; set; }

        [JsonProperty("notes")]
        public string Notes { get; set; }

        [JsonProperty("createdBy")]
        public string CreatedBy { get; set; }

        [JsonProperty("createdAt")]
        public string CreatedAt { get; set; }

        [JsonProperty("amountFormatted")]
        public string AmountFormatted
        {
            get { return Money.FormatPiasters(AmountPiasters); }
        }
    }

    public class DigitalAnalyticsSummary
    {
        [JsonProperty("totalWalletsBalancePiasters")]
        public long TotalWalletsBalancePiasters { get; set; }

        [JsonProperty("totalInstapayBalancePiasters")]
        public long TotalInstapayBalancePiasters { get; set; }

        [JsonProperty("totalDigitalBalancePiasters")]
        public long TotalDigitalBalancePiasters { get; set; }

        [JsonProperty("todayTransactionsCount")]
        public int TodayTransactionsCount { get; set; }

        [JsonProperty("todayProfitPiasters")]
        public long TodayProfitPiasters { get; set; }

        [JsonProperty("todayVolumePiasters")]
        public long TodayVolumePiasters { get; set; }

        [JsonProperty("totalTransactionsCount")]
        public int TotalTransactionsCount { get; set; }

        [JsonProperty("totalProfitPiasters")]
        public long TotalProfitPiasters { get; set; }

        [JsonProperty("activeAccountsCount")]
        public int ActiveAccountsCount { get; set; }

        [JsonProperty("totalWalletsBalanceFormatted")]
        public string TotalWalletsBalanceFormatted
        {
            get { return Money.FormatPiasters(TotalWalletsBalancePiasters); }
        }

        [JsonProperty("totalInstapayBalanceFormatted")]
        public string TotalInstapayBalanceFormatted
        {
            get { return Money.FormatPiasters(TotalInstapayBalancePiasters); }
        }

        [JsonProperty("totalDigitalBalanceFormatted")]
        public string TotalDigitalBalanceFormatted
        {
            get { return Money.FormatPiasters(TotalDigitalBalancePiasters); }
        }

        [JsonProperty("todayProfitFormatted")]
        public string TodayProfitFormatted
        {
            get { return Money.FormatPiasters(TodayProfitPiasters); }
        }

        [JsonProperty("totalProfitFormatted")]
        public string TotalProfitFormatted
        {
            get { return Money.FormatPiasters(TotalProfitPiasters); }
        }
    }
}
