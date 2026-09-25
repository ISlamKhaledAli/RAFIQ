export interface Product {
  id: string;
  barcode: string | null;
  barcodes?: string[];
  name: string;
  normalizedName?: string;
  categoryId?: string | null;
  pricePiasters: number;
  costPiasters: number;
  stockQuantityMilli: number;
  minStockQuantityMilli?: number;
  unit: string;
  taxRatePercent: number;
  taxCategoryCode?: string;
  internalCode?: string;
  isActive: boolean;
  needsReview?: boolean;
  createdAt: string;
  updatedAt: string;
  units?: ProductUnit[];
  priceFormatted?: string;
  stockFormatted?: string;
  minStockFormatted?: string;
}

export interface ProductUnit {
  id?: string;
  productId?: string;
  unitName: string;
  conversionFactor: number;
  isBaseUnit: boolean;
  sellPricePiasters: number;
  costPricePiasters: number;
  barcode?: string | null;
  isDivisible: boolean;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
  sellPriceFormatted?: string;
  costPriceFormatted?: string;
}

export interface Category {
  id: string;
  name: string;
  displayOrder: number;
  isActive: boolean;
  productCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface QuickItem {
  id: string;
  productId?: string | null;
  name: string;
  pricePiasters: number;
  isOpenPrice: boolean;
  unit: string;
  categoryName: string;
  color?: string | null;
  displayOrder: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProductPriceHistory {
  id: string;
  productId: string;
  oldPricePiasters: number;
  newPricePiasters: number;
  oldCostPiasters: number;
  newCostPiasters: number;
  changeReason?: string;
  createdAt: string;
  oldPriceFormatted?: string;
  newPriceFormatted?: string;
  oldCostFormatted?: string;
  newCostFormatted?: string;
}

export interface SaleItem {
  id?: string;
  saleId?: string;
  productId: string;
  productName: string;
  barcode?: string | null;
  quantityMilli: number;
  unitPricePiasters: number;
  unitCostPiasters: number;
  discountPiasters: number;
  totalPiasters: number;
  taxPiasters: number;
  taxRatePercent?: number;
  unit?: string;
  unitId?: string;
  unitName?: string;
  conversionFactor?: number;
}

export interface Sale {
  id?: string;
  invoiceNumber?: number;
  cashierId?: string | null;
  customerId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  subtotalPiasters: number;
  discountPiasters: number;
  taxPiasters: number;
  totalPiasters: number;
  paidPiasters: number;
  paymentMethod: string;
  status: string;
  notes?: string | null;
  createdAt?: string;
  items: SaleItem[];
  payments?: SalePayment[];
  negativeStockWarnings?: string[];
}

export interface SalePayment {
  id?: string;
  saleId?: string;
  amountPiasters: number;
  method: 'cash' | 'credit' | 'card';
  createdAt?: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  balancePiasters: number;
  creditLimitPiasters: number;
  createdAt: string;
  balanceFormatted?: string;
  creditLimitFormatted?: string;
}

export interface CustomerLedgerEntry {
  id: string;
  customerId: string;
  type: 'sale' | 'payment' | 'opening_balance' | 'payment_cancel' | 'refund' | 'cancellation' | string;
  saleId?: string | null;
  amountPiasters: number;
  balanceAfterPiasters: number;
  notes: string;
  createdAt: string;
  amountFormatted?: string;
  balanceAfterFormatted?: string;
}

export interface CustomerBalanceVerification {
  customerId: string;
  storedBalancePiasters: number;
  calculatedBalancePiasters: number;
  isBalanced: boolean;
  discrepancyPiasters: number;
  totalEntriesCount: number;
}

export interface CustomerImportRow {
  rowIndex: number;
  name: string;
  phone: string;
  initialBalancePiasters: number;
  initialBalanceFormatted?: string;
  creditLimitPiasters: number;
  creditLimitFormatted?: string;
  notes: string;
  isValid: boolean;
  errors: string[];
  isPhoneDuplicateInDb: boolean;
}

export interface CustomerImportPreviewResult {
  totalRowsCount: number;
  validRowsCount: number;
  invalidRowsCount: number;
  duplicatePhonesCount: number;
  totalOpeningDebtsPiasters: number;
  totalOpeningDebtsFormatted?: string;
  rows: CustomerImportRow[];
}

export interface CustomerImportResult {
  importedCount: number;
  skippedCount: number;
  totalOpeningDebtsPiasters: number;
  totalOpeningDebtsFormatted?: string;
  message: string;
}

export interface TopSellingItem {
  productId: string;
  productName: string;
  totalQuantity: number;
  totalSalesPiasters: number;
  totalSalesFormatted?: string;
}

export interface LowStockItem {
  productId: string;
  productName: string;
  currentStock: number;
  unit: string;
}

export interface TopDebtorItem {
  customerId: string;
  customerName: string;
  customerPhone?: string;
  balancePiasters: number;
  balanceFormatted?: string;
}

export interface DashboardSummary {
  todaySalesPiasters: number;
  todaySalesFormatted?: string;
  todayCashPiasters: number;
  todayCashFormatted?: string;
  todayCreditPiasters: number;
  todayCreditFormatted?: string;
  todayProfitsPiasters: number;
  todayProfitsFormatted?: string;
  todayInvoicesCount: number;
  cashDrawerPiasters: number;
  cashDrawerFormatted?: string;
  topSellingProducts: TopSellingItem[];
  lowStockProducts: LowStockItem[];
  totalCustomerDebtsPiasters?: number;
  totalCustomerDebtsFormatted?: string;
  debtorsCount?: number;
  topDebtors?: TopDebtorItem[];
}

export interface AuditLogEntry {
  id: string;
  userId?: string | null;
  userDisplayName?: string;
  action: string;
  actionArabic?: string;
  entityType: string;
  entityId: string;
  detailsJson?: string | null;
  createdAt: string;
}

export interface StockMovement {
  id: string;
  productId: string;
  productName?: string;
  productBarcode?: string;
  unit?: string;
  movementType: 'INITIAL' | 'SALE' | 'PURCHASE' | 'ADJUSTMENT' | 'RETURN' | string;
  quantityMilli: number;
  referenceId?: string | null;
  referenceType?: string | null;
  unitCostPiasters: number;
  note?: string | null;
  batchNumber?: string | null;
  createdAt: string;
  movementTypeArabic?: string;
  quantityFormatted?: string;
  costFormatted?: string;
}

export interface StockDiscrepancy {
  productId: string;
  productName: string;
  productBarcode: string;
  unit: string;
  cachedStockMilli: number;
  calculatedStockMilli: number;
  differenceMilli: number;
}

export interface SearchBenchmarkResult {
  success: boolean;
  totalProductsTested: number;
  seedTimeMs: number;
  averageSearchLatencyMs: number;
  maxSearchLatencyMs: number;
  minSearchLatencyMs: number;
  meetsSlaUnder100ms: boolean;
  normalizationTestsPassed: boolean;
  scannerSimulationPassed: boolean;
  summaryReport: string;
  testLog: string[];
}



