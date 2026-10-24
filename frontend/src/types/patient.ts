export interface CustomerPatientInfo {
  customerId: string;
  customerName?: string;
  customerPhone?: string;
  birthYear?: number | null;
  gender?: string | null;
  allergies?: string | null;
  chronicConditions?: string | null;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string | null;
}

export interface ChronicMedication {
  id: string;
  customerId: string;
  productId: string;
  productName?: string;
  barcode?: string;
  dailyQtyMilli: number;
  daysSupply?: number;
  lastDispensedAt?: string | null;
  nextDueDate?: string | null;
  notes?: string | null;
  createdAt?: string;
  pricePiasters?: number;
  stockQuantityMilli?: number;
}

export interface PatientDueAlert {
  customerId: string;
  customerName: string;
  customerPhone?: string;
  medicationsCount: number;
  overdueCount: number;
  dueSoonCount: number;
  earliestDueDate?: string;
  medicationNames: string[];
}

export interface AllergyConflictItem {
  productId: string;
  productName: string;
  allergyMatch?: string;
  matchedAllergy?: string;
  ingredientName?: string;
  warningDetails?: string;
  conflictReason?: string;
}

export interface AllergyCheckResult {
  hasConflict: boolean;
  customerId?: string;
  customerName?: string;
  patientName?: string;
  conflicts: AllergyConflictItem[];
}
