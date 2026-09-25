using System;
using System.Collections.Generic;
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

    public class CustomerBalanceVerification
    {
        [JsonProperty("customerId")]
        public string CustomerId { get; set; }

        [JsonProperty("storedBalancePiasters")]
        public long StoredBalancePiasters { get; set; }

        [JsonProperty("calculatedBalancePiasters")]
        public long CalculatedBalancePiasters { get; set; }

        [JsonProperty("isBalanced")]
        public bool IsBalanced { get; set; }

        [JsonProperty("discrepancyPiasters")]
        public long DiscrepancyPiasters { get; set; }

        [JsonProperty("totalEntriesCount")]
        public int TotalEntriesCount { get; set; }
    }

    public class CustomerStatementReport
    {
        [JsonProperty("customerId")]
        public string CustomerId { get; set; }

        [JsonProperty("customerName")]
        public string CustomerName { get; set; }

        [JsonProperty("customerPhone")]
        public string CustomerPhone { get; set; }

        [JsonProperty("startDate")]
        public string StartDate { get; set; }

        [JsonProperty("endDate")]
        public string EndDate { get; set; }

        [JsonProperty("openingBalancePiasters")]
        public long OpeningBalancePiasters { get; set; }

        [JsonProperty("periodDebitsPiasters")]
        public long PeriodDebitsPiasters { get; set; }

        [JsonProperty("periodCreditsPiasters")]
        public long PeriodCreditsPiasters { get; set; }

        [JsonProperty("closingBalancePiasters")]
        public long ClosingBalancePiasters { get; set; }

        [JsonProperty("entries")]
        public List<CustomerLedgerEntry> Entries { get; set; }

        public CustomerStatementReport()
        {
            this.Entries = new List<CustomerLedgerEntry>();
        }
    }

    public class CustomerImportRow
    {
        [JsonProperty("rowIndex")]
        public int RowIndex { get; set; }

        [JsonProperty("name")]
        public string Name { get; set; }

        [JsonProperty("phone")]
        public string Phone { get; set; }

        [JsonProperty("initialBalancePiasters")]
        public long InitialBalancePiasters { get; set; }

        [JsonProperty("initialBalanceFormatted")]
        public string InitialBalanceFormatted
        {
            get { return Common.Money.FormatPiasters(this.InitialBalancePiasters); }
        }

        [JsonProperty("creditLimitPiasters")]
        public long CreditLimitPiasters { get; set; }

        [JsonProperty("creditLimitFormatted")]
        public string CreditLimitFormatted
        {
            get { return Common.Money.FormatPiasters(this.CreditLimitPiasters); }
        }

        [JsonProperty("notes")]
        public string Notes { get; set; }

        [JsonProperty("isValid")]
        public bool IsValid { get; set; }

        [JsonProperty("errors")]
        public List<string> Errors { get; set; }

        [JsonProperty("isPhoneDuplicateInDb")]
        public bool IsPhoneDuplicateInDb { get; set; }

        public CustomerImportRow()
        {
            this.Errors = new List<string>();
        }
    }

    public class CustomerImportPreviewResult
    {
        [JsonProperty("totalRowsCount")]
        public int TotalRowsCount { get; set; }

        [JsonProperty("validRowsCount")]
        public int ValidRowsCount { get; set; }

        [JsonProperty("invalidRowsCount")]
        public int InvalidRowsCount { get; set; }

        [JsonProperty("duplicatePhonesCount")]
        public int DuplicatePhonesCount { get; set; }

        [JsonProperty("totalOpeningDebtsPiasters")]
        public long TotalOpeningDebtsPiasters { get; set; }

        [JsonProperty("totalOpeningDebtsFormatted")]
        public string TotalOpeningDebtsFormatted
        {
            get { return Common.Money.FormatPiasters(this.TotalOpeningDebtsPiasters); }
        }

        [JsonProperty("rows")]
        public List<CustomerImportRow> Rows { get; set; }

        public CustomerImportPreviewResult()
        {
            this.Rows = new List<CustomerImportRow>();
        }
    }

    public class CustomerImportResult
    {
        [JsonProperty("importedCount")]
        public int ImportedCount { get; set; }

        [JsonProperty("skippedCount")]
        public int SkippedCount { get; set; }

        [JsonProperty("totalOpeningDebtsPiasters")]
        public long TotalOpeningDebtsPiasters { get; set; }

        [JsonProperty("totalOpeningDebtsFormatted")]
        public string TotalOpeningDebtsFormatted
        {
            get { return Common.Money.FormatPiasters(this.TotalOpeningDebtsPiasters); }
        }

        [JsonProperty("message")]
        public string Message { get; set; }
    }
}

