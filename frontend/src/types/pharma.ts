export interface PharmaDosageForm {
  id: string;
  nameAr: string;
  nameEn?: string | null;
  description?: string | null;
}

export interface PharmaManufacturer {
  id: string;
  nameAr: string;
  nameEn?: string | null;
  country?: string | null;
}

export interface TherapeuticClass {
  id: string;
  code?: string | null;
  nameAr: string;
  nameEn?: string | null;
  description?: string | null;
}

export interface ActiveIngredient {
  id: string;
  nameAr: string;
  nameEn?: string | null;
  description?: string | null;
}

export interface ProductIngredientDto {
  ingredientId: string;
  ingredientName?: string | null;
  strengthMilli: number;
  strengthUnit: string;
  isPrimary: boolean;
}

export interface ProductPharmaInfo {
  productId: string;
  scientificName?: string | null;
  dosageFormId?: string | null;
  dosageFormName?: string | null;
  manufacturerId?: string | null;
  manufacturerName?: string | null;
  therapeuticClassId?: string | null;
  therapeuticClassName?: string | null;
  routeOfAdministration?: string | null;
  isPrescriptionOnly: boolean;
  isAntibiotic: boolean;
  isRefrigerated: boolean;
  pregnancyCategory?: string | null;
  storageConditions?: string | null;
  dosageInstructions?: string | null;
  rxStatus?: string | null;
  controlledSchedule?: string | null;
  ingredients: ProductIngredientDto[];
}

export interface DrugAlternativeItem {
  productId: string;
  name?: string;
  productName: string;
  barcode?: string;
  scientificName?: string | null;
  dosageFormName?: string | null;
  manufacturerName?: string | null;
  pricePiasters: number;
  stockQuantityMilli: number;
  compoundStockDisplay?: string;
  unit?: string;
  matchTier: number;
  matchReason?: string | null;
  priceDifferencePiasters: number;
}

export interface DrugAlternativesResult {
  originalProductId: string;
  originalProductName: string;
  originalScientificName?: string | null;
  originalPricePiasters: number;
  tier1IdenticalGenerics: DrugAlternativeItem[];
  tier2DifferentForms: DrugAlternativeItem[];
  tier3DifferentStrengths: DrugAlternativeItem[];
  tier4TherapeuticAlternatives: DrugAlternativeItem[];
}

export interface ControlledDrugDispense {
  id?: string;
  saleId?: string;
  saleItemId?: string;
  productId: string;
  productName?: string;
  batchId?: string;
  batchNumber?: string;
  quantityMilli: number;
  patientName: string;
  patientNationalId?: string;
  patientNationalIdMasked?: string;
  patientPhone?: string;
  patientAddress?: string;
  doctorName?: string;
  doctorLicenseNo?: string;
  prescriptionNo?: string;
  prescriptionDate?: string;
  prescriptionId?: string;
  entryType?: 'dispense' | 'return' | 'correction';
  originalDispenseId?: string;
  reason?: string;
  dispensedBy?: string;
  dispensedByName?: string;
  approvedBy?: string;
  approvedByName?: string;
  notes?: string;
  createdAt?: string;
}

export interface Prescription {
  id: string;
  customerId?: string | null;
  patientName: string;
  patientPhone?: string | null;
  patientNationalId?: string | null;
  doctorName?: string | null;
  clinic?: string | null;
  prescriptionNo?: string | null;
  prescriptionDate?: string | null;
  notes?: string | null;
  imagePath?: string | null;
  createdBy?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface ControlledInspectionReportRow {
  date: string;
  transactionType: string;
  transactionTypeAr: string;
  documentRefNo?: string | null;
  supplierOrPatientName?: string | null;
  patientNationalIdMasked?: string | null;
  doctorName?: string | null;
  doctorLicenseNo?: string | null;
  prescriptionNo?: string | null;
  prescriptionDate?: string | null;
  batchNumber?: string | null;
  inflowQtyMilli: number;
  outflowQtyMilli: number;
  runningBalanceMilli: number;
  dispensedBy?: string | null;
  approvedBy?: string | null;
  notes?: string | null;
}

export interface ControlledMandatoryFields {
  requirePatientNationalId: boolean;
  requireDoctorLicense: boolean;
  requireDoctorName: boolean;
  requirePrescriptionNo: boolean;
  requirePrescriptionDate: boolean;
  requirePatientPhone: boolean;
}

export interface ExpiryReturnableBatch {
  batchId: string;
  productId: string;
  productName: string;
  barcode?: string | null;
  unit: string;
  batchNumber: string;
  expiryDate: string;
  daysUntilExpiry: number;
  quantityMilli: number;
  unitCostPiasters: number;
  totalCostPiasters: number;
  supplierId?: string | null;
  supplierName?: string | null;
  windowDays: number;
  creditBps: number;
  estimatedCreditPiasters: number;
}

export interface BatchExpiryReturnItemRequest {
  batchId: string;
  quantityMilli: number;
  unitCostPiasters: number;
  creditBps: number;
}

export interface BatchExpiryReturnRequest {
  supplierId: string;
  items: BatchExpiryReturnItemRequest[];
  notes?: string;
}

export interface ExpiredWriteOffItemRequest {
  batchId: string;
  quantityMilli: number;
  reason?: string;
}

export interface ExpiredWriteOff {
  id: string;
  writeOffNumber: string;
  batchId?: string | null;
  productId: string;
  productName: string;
  batchNumber?: string | null;
  quantityMilli: number;
  unitCostPiasters: number;
  totalCostPiasters: number;
  reason: string;
  committeeMembers?: string | null;
  notes?: string | null;
  createdBy: string;
  createdAt: string;
}

export interface ExpiredWriteOffCertificate {
  certificateNumber: string;
  date: string;
  committeeMembers: string;
  generalNotes?: string;
  totalItemsCount: number;
  totalCostPiasters: number;
  items: ExpiredWriteOff[];
}

export interface DrugReferenceItem {
  id: string;
  barcode: string;
  tradeName: string;
  scientificName?: string | null;
  form?: string | null;
  strength?: string | null;
  flavorForm?: string | null;
  manufacturer?: string | null;
  packDesc?: string | null;
  publicPricePiasters?: number | null;
  source?: string | null;
  therapeuticClass?: string | null;
  category?: string | null;
  storageLocation?: string | null;
  isRefrigerated?: boolean;
  route?: string | null;
  pregnancyCategory?: string | null;
  isAntibiotic?: boolean;
  rxStatus?: string | null;
  piecesPerPack?: number | null;
  importedAt: string;
  createdAt?: string;
  updatedAt?: string | null;
}

export interface DrugReferenceImportRow {
  rowNumber: number;
  barcode: string;
  tradeName: string;
  scientificName?: string | null;
  form?: string | null;
  strength?: string | null;
  flavorForm?: string | null;
  manufacturer?: string | null;
  packDesc?: string | null;
  publicPricePiasters?: number | null;
  therapeuticClass?: string | null;
  category?: string | null;
  storageLocation?: string | null;
  isRefrigerated?: boolean;
  route?: string | null;
  pregnancyCategory?: string | null;
  isAntibiotic?: boolean;
  rxStatus?: string | null;
  piecesPerPack?: number | null;
  status: 'NEW' | 'UPDATE' | 'ERROR';
  reason?: string | null;
}

export interface DrugReferenceImportPreviewResult {
  totalRows: number;
  newRowsCount: number;
  updateRowsCount: number;
  errorRowsCount: number;
  rows: DrugReferenceImportRow[];
}

// =============================================================================
// Drug-Drug Interactions (Story 137 / Feature #194 / F-01)
// =============================================================================

export type DdiSeverity = 'severe' | 'moderate' | 'minor';

export interface DrugInteraction {
  id: string;
  activeIngredientA: string;
  activeIngredientB: string;
  severity: DdiSeverity;
  mechanismAr: string;
  clinicalRiskAr: string;
  recommendationAr: string;
  alternativeAr?: string;
  source?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface InteractionConflictItem {
  interactionId: string;
  productAId: string;
  productAName: string;
  activeIngredientA: string;
  productBId: string;
  productBName: string;
  activeIngredientB: string;
  severity: DdiSeverity;
  mechanismAr: string;
  clinicalRiskAr: string;
  recommendationAr: string;
  alternativeAr?: string;
}

export interface CartInteractionCheckResult {
  hasInteractions: boolean;
  maxSeverity: 'severe' | 'moderate' | 'minor' | 'none';
  requiresOverride: boolean;
  conflicts: InteractionConflictItem[];
  checkedPairsCount: number;
}


