export interface InsuranceCompany {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  taxNumber?: string | null;
  address?: string | null;
  notes?: string | null;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string | null;
  contractsCount?: number;
  pendingClaimsCount?: number;
  pendingClaimsPiasters?: number;
}

export interface InsuranceExclusion {
  id?: string;
  contractId?: string;
  categoryId?: string | null;
  categoryName?: string | null;
  productId?: string | null;
  productName?: string | null;
  createdAt?: string;
}

export interface InsuranceContract {
  id: string;
  companyId: string;
  companyName?: string;
  name: string;
  patientShareBps: number; // e.g. 2000 bps = 20%
  capPerInvoicePiasters?: number | null;
  capPerMonthPiasters?: number | null;
  validFrom?: string | null;
  validTo?: string | null;
  excludesCosmetics: boolean;
  notes?: string | null;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string | null;
  exclusions?: InsuranceExclusion[];
  membersCount?: number;
}

export interface InsuranceMember {
  id: string;
  contractId: string;
  contractName?: string;
  companyId?: string;
  companyName?: string;
  customerId?: string | null;
  memberName: string;
  memberNo: string;
  nationalId?: string | null;
  phone?: string | null;
  validTo?: string | null;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string | null;
}

export interface InsuranceClaimLine {
  id: string;
  saleId: string;
  invoiceNumber?: number;
  contractId: string;
  contractName?: string;
  companyId: string;
  companyName?: string;
  memberId?: string | null;
  memberNo: string;
  patientName: string;
  approvalNo?: string | null;
  totalInvoicePiasters: number;
  coveredPiasters: number;
  patientPiasters: number;
  companyPiasters: number;
  status: 'pending' | 'batched' | 'claimed' | 'paid' | 'rejected';
  claimBatchId?: string | null;
  claimBatchNumber?: string | null;
  settledAt?: string | null;
  rejectionReason?: string | null;
  createdAt?: string;
  updatedAt?: string | null;
}

export interface InsuranceClaimBatch {
  id: string;
  batchNumber: string;
  companyId: string;
  companyName?: string;
  period: string; // e.g. "2026-10"
  totalClaimsCount: number;
  totalAmountPiasters: number;
  status: 'open' | 'submitted' | 'partially_settled' | 'settled' | 'rejected';
  submittedAt?: string | null;
  settledAt?: string | null;
  settledAmountPiasters: number;
  rejectedAmountPiasters: number;
  rejectionReason?: string | null;
  settlementNotes?: string | null;
  settlementDeductionTarget?: 'patient_debt' | 'expense' | null;
  notes?: string | null;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string | null;
  lines?: InsuranceClaimLine[];
}

export interface InsuranceItemCoverage {
  productId: string;
  productName: string;
  lineTotalPiasters: number;
  isCovered: boolean;
  exclusionReason?: string | null;
  patientPiasters: number;
  companyPiasters: number;
}

export interface InsuranceCalculationResult {
  contractId: string;
  contractName: string;
  companyId: string;
  patientShareBps: number;
  totalInvoicePiasters: number;
  coveredPiasters: number;
  excludedPiasters: number;
  patientPiasters: number;
  companyPiasters: number;
  capApplied: boolean;
  capExcessPiasters: number;
  itemCoverages: InsuranceItemCoverage[];
}
