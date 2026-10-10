using System;
using Newtonsoft.Json;

namespace RafiqPOS.Models
{
    public class Expense
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("expenseNumber")]
        public long ExpenseNumber { get; set; }

        [JsonProperty("amountPiasters")]
        public long AmountPiasters { get; set; }

        [JsonProperty("amountFormatted")]
        public string AmountFormatted
        {
            get { return Common.Money.FormatPiasters(this.AmountPiasters); }
        }

        [JsonProperty("category")]
        public string Category { get; set; }

        [JsonProperty("notes")]
        public string Notes { get; set; }

        [JsonProperty("createdBy")]
        public string CreatedBy { get; set; }

        [JsonProperty("businessDate")]
        public string BusinessDate { get; set; }

        [JsonProperty("createdAt")]
        public string CreatedAt { get; set; }
    }

    public class CreateExpenseRequest
    {
        [JsonProperty("amountPiasters")]
        public long AmountPiasters { get; set; }

        [JsonProperty("category")]
        public string Category { get; set; }

        [JsonProperty("notes")]
        public string Notes { get; set; }

        [JsonProperty("createdBy")]
        public string CreatedBy { get; set; }

        [JsonProperty("businessDate")]
        public string BusinessDate { get; set; }
    }
}
