export interface CatalogueRecord {
  schemaVersion: 1;
  recordId: string;
  gtin: string;
  gtin14Key: string;
  nameOriginal: string;
  brand: string;
  variant: null;
  netQuantityText: string;
  packDescription: string;
  category: string;
  provenance: {
    source: 'openfoodfacts';
    sourceRecordId: string;
    sourceUrl: string;
    sourceModifiedAt: string;
    retrievedAt: string;
    rawRecordSha256: string;
    databaseLicense: 'ODbL-1.0';
    contentsLicense: 'DbCL-1.0';
  };
}
export interface CatalogueManifest {
  schemaVersion: 1;
  datasetId: string;
  datasetSha256: string;
  eligibleCount: number;
  quarantinedCount: number;
  pilotCoverageStatus: string;
  acquisitionStatus: string;
  attribution: string;
  coverage: Record<string, number>;
  files: Record<string, string>;
}
export interface CataloguePage {
  manifest: CatalogueManifest;
  records: CatalogueRecord[];
  total: number;
  page: number;
  pageSize: number;
}
export interface CatalogueSelection {
  recordId: string;
  confirmedBarcode: string;
  confirmedPack: string;
  identityConfirmed: boolean;
  pricesConfirmed: boolean;
  belowCostConfirmed: boolean;
  zeroCostConfirmed: boolean;
  salePricePiasters: number | null;
  costPiasters: number | null;
  categoryId: string;
}
export interface CatalogueRequest {
  datasetSha256: string;
  selections: CatalogueSelection[];
  expectedPreviewHash?: string;
  attemptId?: string;
  confirmApply?: boolean;
}
export interface CataloguePreview {
  previewHash: string;
  rows: { recordId: string; status: 'new' | 'existing'; existingProductId: string | null; barcodeSource: string | null }[];
}
export interface CatalogueApplyResult {
  attemptId: string;
  createdProductIds: string[];
  skippedRecordIds: string[];
}
export const CATALOGUE_MANIFEST_SHA256 = 'c7276a34e2047b3323dc825fff3e137f65aba0df1db29ae49b73b1edcb7f99f6';

export function requiresBelowCostConfirmation(selection: CatalogueSelection): boolean {
  return selection.salePricePiasters !== null && selection.costPiasters !== null &&
    selection.salePricePiasters < selection.costPiasters;
}

export function editCatalogueSelection(selection: CatalogueSelection, patch: Partial<CatalogueSelection>): {
  selection: CatalogueSelection; preview: null; applyConfirmed: false;
} {
  const next = { ...selection, ...patch };
  if (('salePricePiasters' in patch && patch.salePricePiasters !== selection.salePricePiasters) ||
      ('costPiasters' in patch && patch.costPiasters !== selection.costPiasters)) {
    next.belowCostConfirmed = false;
    next.pricesConfirmed = false;
  }
  return { selection: next, preview: null, applyConfirmed: false };
}

export function selectionErrors(selection: CatalogueSelection, record: CatalogueRecord): string[] {
  const errors: string[] = [];
  if (selection.recordId !== record.recordId || selection.confirmedBarcode !== record.gtin ||
      selection.confirmedPack !== record.packDescription || !selection.identityConfirmed) errors.push('أكد الباركود والعبوة الفعلية المطابقة');
  if (!selection.pricesConfirmed) errors.push('أكد أن الأسعار مدخلة من واقع المتجر');
  if (requiresBelowCostConfirmation(selection) && !selection.belowCostConfirmed)
    errors.push('سعر البيع أقل من التكلفة؛ أكد صراحة الموافقة على البيع بخسارة');
  if (!Number.isSafeInteger(selection.salePricePiasters) || (selection.salePricePiasters ?? 0) <= 0 ||
      (selection.salePricePiasters ?? 0) > 99999999999) errors.push('أدخل سعر بيع فعلي موجب');
  if (!Number.isSafeInteger(selection.costPiasters) || (selection.costPiasters ?? -1) < 0 ||
      (selection.costPiasters ?? 0) > 99999999999 || (selection.costPiasters === 0 && !selection.zeroCostConfirmed))
    errors.push('أدخل التكلفة الفعلية وأكد صراحة إذا كانت صفراً');
  if (!selection.categoryId) errors.push('اختر قسماً موجوداً');
  return errors;
}
