using System;
using System.Collections.Generic;
using Newtonsoft.Json;
using RafiqPOS.Common;

namespace RafiqPOS.Models
{
    public class EpayTerminal
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("name")]
        public string Name { get; set; }

        [JsonProperty("provider")]
        public string Provider { get; set; } // super_pay, fawry, aman, momken, other

        [JsonProperty("terminalCode")]
        public string TerminalCode { get; set; }

        [JsonProperty("balancePiasters")]
        public long BalancePiasters { get; set; }

        [JsonProperty("lowBalanceAlertPiasters")]
        public long LowBalanceAlertPiasters { get; set; }

        [JsonProperty("isActive")]
        public bool IsActive { get; set; }

        [JsonProperty("customerFeeType")]
        public string CustomerFeeType { get; set; } // "fixed" or "percent"

        [JsonProperty("customerFeeValue")]
        public long CustomerFeeValue { get; set; } // piasters if fixed (e.g. 200 = 2 EGP); basis points if percent (100 = 1%)

        [JsonProperty("customerFeeMinPiasters")]
        public long CustomerFeeMinPiasters { get; set; }

        [JsonProperty("customerFeeMaxPiasters")]
        public long CustomerFeeMaxPiasters { get; set; }

        [JsonProperty("providerCommissionType")]
        public string ProviderCommissionType { get; set; } // "fixed" or "percent"

        [JsonProperty("providerCommissionValue")]
        public long ProviderCommissionValue { get; set; } // piasters if fixed (e.g. 100 = 1 EGP); basis points if percent (50 = 0.50%)

        [JsonProperty("providerCommissionMinPiasters")]
        public long ProviderCommissionMinPiasters { get; set; }

        [JsonProperty("providerCommissionMaxPiasters")]
        public long ProviderCommissionMaxPiasters { get; set; }

        [JsonProperty("serviceFeeRulesJson")]
        public string ServiceFeeRulesJson { get; set; }

        [JsonProperty("serviceFeeRules")]
        public List<EpayServiceFeeRule> ServiceFeeRules { get; set; }

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

    public class EpayTransaction
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("terminalId")]
        public string TerminalId { get; set; }

        [JsonProperty("terminalName")]
        public string TerminalName { get; set; }

        [JsonProperty("serviceType")]
        public string ServiceType { get; set; } // topup, bill, cash_in, cash_out, transfer, other

        [JsonProperty("serviceName")]
        public string ServiceName { get; set; }

        [JsonProperty("referenceNumber")]
        public string ReferenceNumber { get; set; }

        [JsonProperty("customerPhone")]
        public string CustomerPhone { get; set; }

        [JsonProperty("customerName")]
        public string CustomerName { get; set; }

        [JsonProperty("billAmountPiasters")]
        public long BillAmountPiasters { get; set; }

        [JsonProperty("customerFeePiasters")]
        public long CustomerFeePiasters { get; set; }

        [JsonProperty("totalReceivedPiasters")]
        public long TotalReceivedPiasters { get; set; }

        [JsonProperty("machineDeductedPiasters")]
        public long MachineDeductedPiasters { get; set; }

        [JsonProperty("deductedBalancePiasters")]
        public long DeductedBalancePiasters
        {
            get { return MachineDeductedPiasters; }
            set { if (MachineDeductedPiasters == 0) { MachineDeductedPiasters = value; } }
        }

        [JsonProperty("providerCommissionPiasters")]
        public long ProviderCommissionPiasters { get; set; }

        [JsonProperty("netProfitPiasters")]
        public long NetProfitPiasters { get; set; }

        [JsonProperty("paymentChannel")]
        public string PaymentChannel { get; set; }

        [JsonProperty("paymentDestination")]
        public string PaymentDestination
        {
            get { return PaymentChannel; }
            set { if (string.IsNullOrEmpty(PaymentChannel)) { PaymentChannel = value; } }
        }

        [JsonProperty("cashierName")]
        public string CashierName { get; set; }

        [JsonProperty("status")]
        public string Status { get; set; } // completed, cancelled

        [JsonProperty("notes")]
        public string Notes { get; set; }

        [JsonProperty("createdAt")]
        public string CreatedAt { get; set; }

        [JsonProperty("billAmountFormatted")]
        public string BillAmountFormatted
        {
            get { return Money.FormatPiasters(BillAmountPiasters); }
        }

        [JsonProperty("customerFeeFormatted")]
        public string CustomerFeeFormatted
        {
            get { return Money.FormatPiasters(CustomerFeePiasters); }
        }

        [JsonProperty("totalReceivedFormatted")]
        public string TotalReceivedFormatted
        {
            get { return Money.FormatPiasters(TotalReceivedPiasters); }
        }

        [JsonProperty("netProfitFormatted")]
        public string NetProfitFormatted
        {
            get { return Money.FormatPiasters(NetProfitPiasters); }
        }
    }

    public class EpayTerminalFunding
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("terminalId")]
        public string TerminalId { get; set; }

        [JsonProperty("terminalName")]
        public string TerminalName { get; set; }

        [JsonProperty("amountPiasters")]
        public long AmountPiasters { get; set; }

        [JsonProperty("fundingSource")]
        public string FundingSource { get; set; } // cash_drawer, bank_transfer, external

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

    public class EpayAnalyticsSummary
    {
        [JsonProperty("totalTransactionsCount")]
        public int TotalTransactionsCount { get; set; }

        [JsonProperty("totalBillVolumePiasters")]
        public long TotalBillVolumePiasters { get; set; }

        [JsonProperty("totalVolumePiasters")]
        public long TotalVolumePiasters
        {
            get { return TotalBillVolumePiasters; }
            set { TotalBillVolumePiasters = value; }
        }

        [JsonProperty("totalCustomerFeesPiasters")]
        public long TotalCustomerFeesPiasters { get; set; }

        [JsonProperty("totalProviderCommissionsPiasters")]
        public long TotalProviderCommissionsPiasters { get; set; }

        [JsonProperty("totalCommissionsPiasters")]
        public long TotalCommissionsPiasters
        {
            get { return TotalProviderCommissionsPiasters; }
            set { TotalProviderCommissionsPiasters = value; }
        }

        [JsonProperty("totalNetProfitPiasters")]
        public long TotalNetProfitPiasters { get; set; }

        [JsonProperty("totalInCashDrawerPiasters")]
        public long TotalInCashDrawerPiasters { get; set; }

        [JsonProperty("totalInTerminalTillPiasters")]
        public long TotalInTerminalTillPiasters { get; set; }

        [JsonProperty("activeTerminalsCount")]
        public int ActiveTerminalsCount { get; set; }

        [JsonProperty("totalTerminalsBalancePiasters")]
        public long TotalTerminalsBalancePiasters { get; set; }

        [JsonProperty("todayTransactionsCount")]
        public int TodayTransactionsCount { get; set; }

        [JsonProperty("todayNetProfitPiasters")]
        public long TodayNetProfitPiasters { get; set; }

        [JsonProperty("transactionsByType")]
        public Dictionary<string, int> TransactionsByType { get; set; }

        [JsonProperty("profitByTypePiasters")]
        public Dictionary<string, long> ProfitByTypePiasters { get; set; }

        [JsonProperty("totalBillVolumeFormatted")]
        public string TotalBillVolumeFormatted
        {
            get { return Money.FormatPiasters(TotalBillVolumePiasters); }
        }

        [JsonProperty("totalNetProfitFormatted")]
        public string TotalNetProfitFormatted
        {
            get { return Money.FormatPiasters(TotalNetProfitPiasters); }
        }

        [JsonProperty("todayNetProfitFormatted")]
        public string TodayNetProfitFormatted
        {
            get { return Money.FormatPiasters(TodayNetProfitPiasters); }
        }

        [JsonProperty("totalTerminalsBalanceFormatted")]
        public string TotalTerminalsBalanceFormatted
        {
            get { return Money.FormatPiasters(TotalTerminalsBalancePiasters); }
        }

        public EpayAnalyticsSummary()
        {
            TransactionsByType = new Dictionary<string, int>();
            ProfitByTypePiasters = new Dictionary<string, long>();
        }
    }

    public class EpayServiceFeeRule
    {
        [JsonProperty("serviceType")]
        public string ServiceType { get; set; } // mobile_recharge, utility_bill, wallet_transfer, cash_in, cash_out, other

        [JsonProperty("feeMode")]
        public string FeeMode { get; set; } // "default", "fixed", "percent", "per_thousand"

        [JsonProperty("customerFeeType")]
        public string CustomerFeeType { get; set; } // "fixed", "percent", "per_thousand"

        [JsonProperty("customerFeeValue")]
        public long CustomerFeeValue { get; set; } // piasters if fixed or per_thousand; basis points if percent (100 = 1%)

        [JsonProperty("customerFeeMinPiasters")]
        public long CustomerFeeMinPiasters { get; set; }

        [JsonProperty("customerFeeMaxPiasters")]
        public long CustomerFeeMaxPiasters { get; set; }

        [JsonProperty("providerCommissionType")]
        public string ProviderCommissionType { get; set; } // "fixed", "percent", "per_thousand"

        [JsonProperty("providerCommissionValue")]
        public long ProviderCommissionValue { get; set; }

        [JsonProperty("providerCommissionMinPiasters")]
        public long ProviderCommissionMinPiasters { get; set; }

        [JsonProperty("providerCommissionMaxPiasters")]
        public long ProviderCommissionMaxPiasters { get; set; }
    }

    public class EpayPricingResult
    {
        [JsonProperty("terminalId")]
        public string TerminalId { get; set; }

        [JsonProperty("serviceType")]
        public string ServiceType { get; set; }

        [JsonProperty("billAmountPiasters")]
        public long BillAmountPiasters { get; set; }

        [JsonProperty("customerFeePiasters")]
        public long CustomerFeePiasters { get; set; }

        [JsonProperty("providerCommissionPiasters")]
        public long ProviderCommissionPiasters { get; set; }

        [JsonProperty("totalReceivedPiasters")]
        public long TotalReceivedPiasters { get; set; }

        [JsonProperty("machineDeductedPiasters")]
        public long MachineDeductedPiasters { get; set; }

        [JsonProperty("netProfitPiasters")]
        public long NetProfitPiasters { get; set; }

        [JsonProperty("ruleApplied")]
        public string RuleApplied { get; set; } // "service_custom" or "terminal_default"

        [JsonProperty("customerFeeFormatted")]
        public string CustomerFeeFormatted
        {
            get { return Money.FormatPiasters(CustomerFeePiasters); }
        }

        [JsonProperty("providerCommissionFormatted")]
        public string ProviderCommissionFormatted
        {
            get { return Money.FormatPiasters(ProviderCommissionPiasters); }
        }

        [JsonProperty("totalReceivedFormatted")]
        public string TotalReceivedFormatted
        {
            get { return Money.FormatPiasters(TotalReceivedPiasters); }
        }

        [JsonProperty("netProfitFormatted")]
        public string NetProfitFormatted
        {
            get { return Money.FormatPiasters(NetProfitPiasters); }
        }
    }
}
