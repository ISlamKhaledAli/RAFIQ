using System;
using System.Collections.Generic;
using Newtonsoft.Json;

namespace RafiqPOS.Models
{
    public class InsuranceCompany
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("name")]
        public string Name { get; set; }

        [JsonProperty("phone")]
        public string Phone { get; set; }

        [JsonProperty("email")]
        public string Email { get; set; }

        [JsonProperty("taxNumber")]
        public string TaxNumber { get; set; }

        [JsonProperty("address")]
        public string Address { get; set; }

        [JsonProperty("notes")]
        public string Notes { get; set; }

        [JsonProperty("isActive")]
        public bool IsActive { get; set; }

        [JsonProperty("createdAt")]
        public string CreatedAt { get; set; }

        [JsonProperty("updatedAt")]
        public string UpdatedAt { get; set; }

        [JsonProperty("contractsCount")]
        public int ContractsCount { get; set; }

        [JsonProperty("pendingClaimsCount")]
        public int PendingClaimsCount { get; set; }

        [JsonProperty("pendingClaimsPiasters")]
        public long PendingClaimsPiasters { get; set; }

        public InsuranceCompany()
        {
            IsActive = true;
        }
    }

    public class InsuranceContract
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("companyId")]
        public string CompanyId { get; set; }

        [JsonProperty("companyName")]
        public string CompanyName { get; set; }

        [JsonProperty("name")]
        public string Name { get; set; }

        /// <summary>
        /// Patient Co-Pay Share in Basis Points (e.g. 1000 = 10%, 2000 = 20%)
        /// </summary>
        [JsonProperty("patientShareBps")]
        public int PatientShareBps { get; set; }

        /// <summary>
        /// Maximum insurance coverage per single invoice in Piasters (null/0 = unlimited)
        /// </summary>
        [JsonProperty("capPerInvoicePiasters")]
        public long? CapPerInvoicePiasters { get; set; }

        [JsonProperty("capPerMonthPiasters")]
        public long? CapPerMonthPiasters { get; set; }

        [JsonProperty("validFrom")]
        public string ValidFrom { get; set; }

        [JsonProperty("validTo")]
        public string ValidTo { get; set; }

        [JsonProperty("excludesCosmetics")]
        public bool ExcludesCosmetics { get; set; }

        [JsonProperty("notes")]
        public string Notes { get; set; }

        [JsonProperty("isActive")]
        public bool IsActive { get; set; }

        [JsonProperty("createdAt")]
        public string CreatedAt { get; set; }

        [JsonProperty("updatedAt")]
        public string UpdatedAt { get; set; }

        [JsonProperty("exclusions")]
        public List<InsuranceExclusion> Exclusions { get; set; }

        public InsuranceContract()
        {
            IsActive = true;
            Exclusions = new List<InsuranceExclusion>();
        }
    }

    public class InsuranceExclusion
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("contractId")]
        public string ContractId { get; set; }

        [JsonProperty("categoryId")]
        public string CategoryId { get; set; }

        [JsonProperty("categoryName")]
        public string CategoryName { get; set; }

        [JsonProperty("productId")]
        public string ProductId { get; set; }

        [JsonProperty("productName")]
        public string ProductName { get; set; }

        [JsonProperty("createdAt")]
        public string CreatedAt { get; set; }
    }

    public class InsuranceMember
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("contractId")]
        public string ContractId { get; set; }

        [JsonProperty("contractName")]
        public string ContractName { get; set; }

        [JsonProperty("companyId")]
        public string CompanyId { get; set; }

        [JsonProperty("companyName")]
        public string CompanyName { get; set; }

        [JsonProperty("customerId")]
        public string CustomerId { get; set; }

        [JsonProperty("memberName")]
        public string MemberName { get; set; }

        [JsonProperty("memberNo")]
        public string MemberNo { get; set; }

        [JsonProperty("nationalId")]
        public string NationalId { get; set; }

        [JsonProperty("phone")]
        public string Phone { get; set; }

        [JsonProperty("validTo")]
        public string ValidTo { get; set; }

        [JsonProperty("isActive")]
        public bool IsActive { get; set; }

        [JsonProperty("createdAt")]
        public string CreatedAt { get; set; }

        [JsonProperty("updatedAt")]
        public string UpdatedAt { get; set; }

        public InsuranceMember()
        {
            IsActive = true;
        }
    }

    public class InsuranceClaimLine
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("saleId")]
        public string SaleId { get; set; }

        [JsonProperty("invoiceNumber")]
        public int InvoiceNumber { get; set; }

        [JsonProperty("contractId")]
        public string ContractId { get; set; }

        [JsonProperty("contractName")]
        public string ContractName { get; set; }

        [JsonProperty("companyId")]
        public string CompanyId { get; set; }

        [JsonProperty("companyName")]
        public string CompanyName { get; set; }

        [JsonProperty("memberId")]
        public string MemberId { get; set; }

        [JsonProperty("memberNo")]
        public string MemberNo { get; set; }

        [JsonProperty("patientName")]
        public string PatientName { get; set; }

        [JsonProperty("approvalNo")]
        public string ApprovalNo { get; set; }

        [JsonProperty("totalInvoicePiasters")]
        public long TotalInvoicePiasters { get; set; }

        [JsonProperty("coveredPiasters")]
        public long CoveredPiasters { get; set; }

        [JsonProperty("patientPiasters")]
        public long PatientPiasters { get; set; }

        [JsonProperty("companyPiasters")]
        public long CompanyPiasters { get; set; }

        /// <summary>
        /// pending, batched, claimed, paid, rejected
        /// </summary>
        [JsonProperty("status")]
        public string Status { get; set; }

        [JsonProperty("claimBatchId")]
        public string ClaimBatchId { get; set; }

        [JsonProperty("claimBatchNumber")]
        public string ClaimBatchNumber { get; set; }

        [JsonProperty("settledAt")]
        public string SettledAt { get; set; }

        [JsonProperty("rejectionReason")]
        public string RejectionReason { get; set; }

        [JsonProperty("createdAt")]
        public string CreatedAt { get; set; }

        [JsonProperty("updatedAt")]
        public string UpdatedAt { get; set; }

        public InsuranceClaimLine()
        {
            Status = "pending";
        }
    }

    public class InsuranceClaimBatch
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("batchNumber")]
        public string BatchNumber { get; set; }

        [JsonProperty("companyId")]
        public string CompanyId { get; set; }

        [JsonProperty("companyName")]
        public string CompanyName { get; set; }

        [JsonProperty("period")]
        public string Period { get; set; }

        [JsonProperty("totalClaimsCount")]
        public int TotalClaimsCount { get; set; }

        [JsonProperty("totalAmountPiasters")]
        public long TotalAmountPiasters { get; set; }

        /// <summary>
        /// open, submitted, partially_settled, settled, rejected
        /// </summary>
        [JsonProperty("status")]
        public string Status { get; set; }

        [JsonProperty("submittedAt")]
        public string SubmittedAt { get; set; }

        [JsonProperty("settledAt")]
        public string SettledAt { get; set; }

        [JsonProperty("settledAmountPiasters")]
        public long SettledAmountPiasters { get; set; }

        [JsonProperty("rejectedAmountPiasters")]
        public long RejectedAmountPiasters { get; set; }

        [JsonProperty("rejectionReason")]
        public string RejectionReason { get; set; }

        [JsonProperty("settlementNotes")]
        public string SettlementNotes { get; set; }

        /// <summary>
        /// 'patient_debt' or 'expense'
        /// </summary>
        [JsonProperty("settlementDeductionTarget")]
        public string SettlementDeductionTarget { get; set; }

        [JsonProperty("notes")]
        public string Notes { get; set; }

        [JsonProperty("createdBy")]
        public string CreatedBy { get; set; }

        [JsonProperty("createdAt")]
        public string CreatedAt { get; set; }

        [JsonProperty("updatedAt")]
        public string UpdatedAt { get; set; }

        [JsonProperty("lines")]
        public List<InsuranceClaimLine> Lines { get; set; }

        public InsuranceClaimBatch()
        {
            Status = "open";
            Lines = new List<InsuranceClaimLine>();
        }
    }

    public class InsuranceCalculationResult
    {
        [JsonProperty("contractId")]
        public string ContractId { get; set; }

        [JsonProperty("contractName")]
        public string ContractName { get; set; }

        [JsonProperty("companyId")]
        public string CompanyId { get; set; }

        [JsonProperty("patientShareBps")]
        public int PatientShareBps { get; set; }

        [JsonProperty("totalInvoicePiasters")]
        public long TotalInvoicePiasters { get; set; }

        [JsonProperty("coveredPiasters")]
        public long CoveredPiasters { get; set; }

        [JsonProperty("excludedPiasters")]
        public long ExcludedPiasters { get; set; }

        [JsonProperty("patientPiasters")]
        public long PatientPiasters { get; set; }

        [JsonProperty("companyPiasters")]
        public long CompanyPiasters { get; set; }

        [JsonProperty("capApplied")]
        public bool CapApplied { get; set; }

        [JsonProperty("capExcessPiasters")]
        public long CapExcessPiasters { get; set; }

        [JsonProperty("itemCoverages")]
        public List<InsuranceItemCoverage> ItemCoverages { get; set; }

        public InsuranceCalculationResult()
        {
            ItemCoverages = new List<InsuranceItemCoverage>();
        }
    }

    public class InsuranceItemCoverage
    {
        [JsonProperty("productId")]
        public string ProductId { get; set; }

        [JsonProperty("productName")]
        public string ProductName { get; set; }

        [JsonProperty("lineTotalPiasters")]
        public long LineTotalPiasters { get; set; }

        [JsonProperty("isCovered")]
        public bool IsCovered { get; set; }

        [JsonProperty("exclusionReason")]
        public string ExclusionReason { get; set; }

        [JsonProperty("patientPiasters")]
        public long PatientPiasters { get; set; }

        [JsonProperty("companyPiasters")]
        public long CompanyPiasters { get; set; }
    }
}
