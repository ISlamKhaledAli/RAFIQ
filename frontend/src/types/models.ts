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
  categoryName?: string;
  salesCount?: number;
  isCustomQuickItem?: boolean;
  isOpenPrice?: boolean;
  quickDisplayOrder?: number;
  parentId?: string | null;
  hasVariants?: boolean;
  variantSize?: string | null;
  variantColor?: string | null;
  variantSku?: string | null;
  variantsCount?: number;
  hasBatches?: boolean;
  nearestExpiryDate?: string | null;
  isExpired?: boolean;
}

export interface ProductVariant {
  id: string;
  parentProductId: string;
  variantProductId: string;
  size: string;
  color: string;
  sku: string;
  barcode: string;
  pricePiasters: number;
  costPiasters: number;
  stockQuantityMilli: number;
  minStockQuantityMilli: number;
  createdAt: string;
  updatedAt: string;
  priceFormatted?: string;
  costFormatted?: string;
  stockFormatted?: string;
}

export interface VariantMatrixCell {
  size: string;
  color: string;
  barcode?: string;
  sku?: string;
  pricePiasters: number;
  costPiasters: number;
  stockQuantityMilli: number;
  minStockQuantityMilli?: number;
  isEnabled: boolean;
}

export interface CreateVariantMatrixRequest {
  parentProductId?: string | null;
  parentName: string;
  categoryId?: string | null;
  defaultPricePiasters: number;
  defaultCostPiasters: number;
  defaultMinStockQuantityMilli?: number;
  sizes: string[];
  colors: string[];
  matrixCells: VariantMatrixCell[];
}

export interface ParentProductWithVariants {
  parentProduct: Product;
  variants: ProductVariant[];
  totalStockMilli: number;
  totalVariantsCount: number;
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

export interface QuickBundleItem {
  productId: string;
  productName: string;
  barcode?: string | null;
  quantityMilli: number;
  unit: string;
  originalPricePiasters: number;
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
  bundleItemsJson?: string | null;
  bundleItems?: QuickBundleItem[];
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
  returnedQuantityMilli?: number;
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
  isArchived?: boolean;
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
  minStock?: number;
  unit: string;
}

export interface TopDebtorItem {
  customerId: string;
  customerName: string;
  customerPhone?: string;
  balancePiasters: number;
  balanceFormatted?: string;
}

export interface StockAdjustmentSummaryItem {
  productId: string;
  productName: string;
  unit: string;
  quantityDeltaMilli: number;
  quantityDeltaFormatted: string;
  unitCostPiasters: number;
  financialImpactPiasters: number;
  financialImpactFormatted: string;
  reason: string;
  createdAt: string;
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
  todaySalesGrossProfitPiasters?: number;
  todayInventoryLossPiasters?: number;
  todayInventoryLossFormatted?: string;
  todayInventorySurplusPiasters?: number;
  todayInventorySurplusFormatted?: string;
  todayNetProfitsPiasters?: number;
  todayNetProfitsFormatted?: string;
  todayAdjustmentsCount?: number;
  todayDebtPaymentsPiasters?: number;
  recentAdjustments?: StockAdjustmentSummaryItem[];
  todayCancelledSalesPiasters?: number;
  todayCancelledSalesFormatted?: string;
  todayCancelledCount?: number;
  todayReturnsPiasters?: number;
  todayReturnsFormatted?: string;
  todayReturnsCount?: number;
  todayInvoicesCount: number;
  cashDrawerPiasters: number;
  cashDrawerFormatted?: string;
  topSellingProducts: TopSellingItem[];
  lowStockProducts: LowStockItem[];
  lowStockCount?: number;
  totalCustomerDebtsPiasters?: number;
  totalCustomerDebtsFormatted?: string;
  debtorsCount?: number;
  topDebtors?: TopDebtorItem[];
}

export interface HeldSale {
  id?: string;
  holdLabel?: string;
  customerId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  itemsCount: number;
  subtotalPiasters: number;
  discountPiasters: number;
  totalPiasters: number;
  cartJson?: string;
  notes?: string | null;
  cashierId?: string | null;
  createdAt?: string;
  items?: SaleItem[];
}

export interface ReturnItem {
  id?: string;
  returnId?: string;
  saleItemId?: string | null;
  productId: string;
  productName: string;
  barcode?: string | null;
  quantityMilli: number;
  unitPricePiasters: number;
  totalPiasters: number;
  isDamaged: boolean;
  unit?: string;
  notes?: string | null;
  createdAt?: string;
}

export interface Return {
  id?: string;
  returnNumber?: number;
  saleId?: string | null;
  invoiceNumber?: number | null;
  customerId?: string | null;
  customerName?: string | null;
  cashierId?: string | null;
  totalPiasters: number;
  refundMethod: 'cash' | 'credit' | string;
  reason?: string | null;
  supervisorName?: string | null;
  isWithoutInvoice?: boolean;
  createdAt?: string;
  items?: ReturnItem[];
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
  prevHash?: string;
  recordHash?: string;
}

export interface AuditChainVerificationResult {
  isValid: boolean;
  isTampered: boolean;
  totalRecordsVerified: number;
  tamperedRecordId?: string | null;
  tamperedRecordIndex?: number;
  errorMessage?: string | null;
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

export interface Supplier {
  id: string;
  name: string;
  phone?: string | null;
  companyName?: string | null;
  address?: string | null;
  balancePiasters: number;
  notes?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseItem {
  id: string;
  purchaseId: string;
  productId: string;
  productName: string;
  barcode?: string | null;
  quantityMilli: number;
  unitCostPiasters: number;
  totalCostPiasters: number;
  previousCostPiasters: number;
  newSellingPricePiasters?: number | null;
  batchNumber?: string | null;
  expiryDate?: string | null;
  productionDate?: string | null;
  batchId?: string | null;
  createdAt: string;
}

export interface ProductBatch {
  id: string;
  productId: string;
  batchNumber: string;
  productionDate?: string | null;
  expiryDate?: string | null;
  quantityMilli: number;
  initialQuantityMilli: number;
  costPricePiasters: number;
  sellingPricePiasters?: number | null;
  status: 'ACTIVE' | 'DEPLETED' | 'EXPIRED' | string;
  supplierId?: string | null;
  purchaseInvoiceId?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  productName?: string;
  productBarcode?: string;
  unit?: string;
  daysUntilExpiry?: number;
  isExpired?: boolean;
  isExpiringSoon?: boolean;
}

export interface BatchSummary {
  totalActiveBatches: number;
  expiringSoonCount: number;
  expiredCount: number;
  expiredValuePiasters: number;
  expiringSoonValuePiasters: number;
  totalBatchStockValuePiasters: number;
}

export interface Purchase {
  id: string;
  invoiceNumber: number;
  supplierId?: string | null;
  supplierName?: string | null;
  supplierInvoiceNumber?: string | null;
  invoiceDate: string;
  totalCostPiasters: number;
  discountPiasters: number;
  netCostPiasters: number;
  paidAmountPiasters: number;
  remainingAmountPiasters: number;
  paymentStatus: 'PAID' | 'CREDIT' | 'PARTIAL' | string;
  status: 'COMPLETED' | 'CANCELLED' | string;
  notes?: string | null;
  createdByUserId?: string | null;
  createdAt: string;
  updatedAt: string;
  items?: PurchaseItem[];
}

export interface SupplierTransaction {
  id: string;
  supplierId: string;
  transactionType: 'OPENING_BALANCE' | 'PURCHASE_INVOICE' | 'PAYMENT' | 'RETURN' | string;
  referenceId?: string | null;
  amountPiasters: number;
  notes?: string | null;
  createdAt: string;
}

export interface DailyClosing {
  id: string;
  closingNumber: number;
  businessDate: string;
  closedAt: string;
  cashierId?: string | null;
  cashierName?: string | null;
  totalSalesPiasters: number;
  cashSalesPiasters: number;
  creditSalesPiasters: number;
  returnsTotalPiasters: number;
  returnsCashPiasters: number;
  cancelledTotalPiasters: number;
  debtPaymentsPiasters: number;
  expectedCashPiasters: number;
  actualCashPiasters: number;
  differencePiasters: number;
  grossProfitPiasters: number;
  invoicesCount: number;
  returnsCount: number;
  cancelledCount: number;
  notes?: string | null;
  summaryJson?: string | null;
  isSealed: boolean;
  totalSalesFormatted?: string;
  cashSalesFormatted?: string;
  creditSalesFormatted?: string;
  expectedCashFormatted?: string;
  actualCashFormatted?: string;
  differenceFormatted?: string;
}

export interface DailyClosingPreview {
  businessDate: string;
  currentUtc: string;
  totalSalesPiasters: number;
  cashSalesPiasters: number;
  creditSalesPiasters: number;
  returnsTotalPiasters: number;
  returnsCashPiasters: number;
  cancelledTotalPiasters: number;
  debtPaymentsPiasters: number;
  expectedCashPiasters: number;
  grossProfitPiasters: number;
  zeroCostItemsCount: number;
  invoicesCount: number;
  returnsCount: number;
  cancelledCount: number;
  isAlreadyClosed: boolean;
  existingClosing?: DailyClosing | null;
  isDateSuspicious: boolean;
  dateSuspiciousReason?: string | null;
}

export interface DailyClosingSaveRequest {
  businessDate?: string;
  actualCashPiasters: number;
  cashierId?: string;
  cashierName?: string;
  notes?: string;
  confirmSuspiciousDate?: boolean;
}

export interface UnclosedDayAlert {
  hasUnclosedDay: boolean;
  unclosedDate?: string;
  unclosedSalesCount: number;
  unclosedSalesTotalPiasters: number;
}

export interface PeriodSalesReport {
  period: string;
  startDate: string;
  endDate: string;
  totalSalesPiasters: number;
  cashSalesPiasters: number;
  creditSalesPiasters: number;
  cardSalesPiasters: number;
  returnsTotalPiasters: number;
  cancelledTotalPiasters: number;
  netSalesPiasters: number;
  grossProfitPiasters: number;
  invoicesCount: number;
  returnsCount: number;
  cancelledCount: number;
  zeroCostItemsCount: number;
  topSellingProducts: TopSellingItem[];
}

export interface LowStockReportItem {
  productId: string;
  name: string;
  barcode: string;
  stockMilli: number;
  minStockMilli: number;
  suggestedOrderMilli: number;
  unitCostPiasters: number;
  estimatedCostPiasters: number;
  unit: string;
  categoryName: string;
}

export interface DebtorReportItem {
  customerId: string;
  name: string;
  phone: string;
  balancePiasters: number;
  creditLimitPiasters: number;
  notes?: string;
  lastTransactionDate?: string;
}

export interface BarcodeLabelItem {
  productId: string;
  productName: string;
  barcode: string;
  pricePiasters: number;
  variantInfo?: string;
  copies: number;
  expiryDate?: string;
}

export interface BarcodeLabelConfig {
  printerName?: string;
  paperSize: '38x25' | '40x30' | '50x25' | '50x30' | '50x40' | 'a4_24' | 'a4_40' | string;
  customWidthMm?: number;
  customHeightMm?: number;
  showStoreName: boolean;
  storeName?: string;
  showPrice: boolean;
  showBarcodeText: boolean;
  showExpiryDate: boolean;
}

export interface PrintLabelsRequest {
  items: BarcodeLabelItem[];
  config: BarcodeLabelConfig;
}

export interface PrintLabelsResult {
  success: boolean;
  totalLabelsPrinted: number;
  printerUsed: string;
  message: string;
}

export interface BulkPriceExcelItem {
  identifier: string;
  newPricePiasters?: number | null;
  newCostPiasters?: number | null;
}

export interface BulkPricePreviewRequest {
  scope: 'selected' | 'category' | 'all' | 'search';
  productIds?: string[];
  categoryId?: string;
  searchQuery?: string;
  targetField: 'price' | 'cost' | 'both';
  method: 'percentage' | 'fixed_amount' | 'excel';
  percentageValue?: number;
  amountPiasters?: number;
  roundingRule: 'none' | 'half_pound' | 'one_pound' | 'five_pounds' | 'ceil_pound' | 'psychological_95' | 'psychological_50';
  reason?: string;
  excelItems?: BulkPriceExcelItem[];
}

export interface BulkPricePreviewItem {
  productId: string;
  productName: string;
  barcode: string;
  categoryName: string;
  currentPricePiasters: number;
  newPricePiasters: number;
  currentCostPiasters: number;
  newCostPiasters: number;
  priceDiffPiasters: number;
  priceDiffPercent: number;
  costDiffPiasters: number;
  belowCost: boolean;
}

export interface BulkPricePreviewResult {
  items: BulkPricePreviewItem[];
  totalCount: number;
  belowCostCount: number;
  averageIncreasePercent: number;
}

export interface BulkPriceApplyItem {
  productId: string;
  newPricePiasters: number;
  newCostPiasters: number;
  oldPricePiasters: number;
  oldCostPiasters: number;
}

export interface BulkPriceApplyRequest {
  items: BulkPriceApplyItem[];
  reason: string;
  userId?: string;
}

export interface BulkPriceApplyResult {
  success: boolean;
  updatedCount: number;
  message: string;
}

export type DataQualityIssueType = 
  | 'missing_cost' 
  | 'missing_barcode' 
  | 'missing_category' 
  | 'duplicate_barcode' 
  | 'negative_stock' 
  | 'price_below_cost';

export interface DataQualityIssueItem {
  productId: string;
  productName: string;
  barcode: string;
  categoryName: string;
  categoryId: string;
  stockMilli: number;
  costPiasters: number;
  pricePiasters: number;
  unit: string;
  issueType: DataQualityIssueType;
  severity: 'critical' | 'warning' | 'info';
  issueTitle: string;
  issueDescription: string;
  suggestedFix: string;
}

export interface DataQualityReport {
  totalProductsAudited: number;
  healthyProductsCount: number;
  healthScorePercent: number;
  totalIssuesCount: number;
  missingCostCount: number;
  missingBarcodeCount: number;
  missingCategoryCount: number;
  duplicateBarcodeCount: number;
  negativeStockCount: number;
  priceBelowCostCount: number;
  issues: DataQualityIssueItem[];
}

export interface BulkBarcodeProductItem {
  productId: string;
  productName: string;
  barcode: string;
  pricePiasters: number;
}

export interface BulkGenerateBarcodesResult {
  success: boolean;
  count: number;
  products: BulkBarcodeProductItem[];
  message: string;
}

export interface AssignBarcodeResult {
  success: boolean;
  productId: string;
  barcode: string;
  message: string;
}

// ==========================================
// ANALYTICS & ADVANCED REPORTING MODELS
// ==========================================

export type DashboardSubTab = 'today' | 'revenue' | 'inventory' | 'customers';

export interface InventoryLossItem {
  productId: string;
  productName: string;
  unit: string;
  quantityDeltaMilli: number;
  unitCostPiasters: number;
  financialImpactPiasters: number;
  reason: string;
  createdAt: string;
}

export interface InventoryLossReport {
  totalLossPiasters: number;
  totalDamagePiasters: number;
  totalGiftsPiasters: number;
  totalSurplusPiasters: number;
  topLossItems: InventoryLossItem[];
}

export interface ClosingHistoryRecord {
  id: string;
  closingDate: string;
  shiftNumber: number;
  cashierName: string;
  totalSalesPiasters: number;
  cashSalesPiasters: number;
  creditSalesPiasters: number;
  returnsPiasters: number;
  netSalesPiasters: number;
  grossProfitPiasters: number;
  expectedCashPiasters: number;
  actualCashPiasters: number;
  differencePiasters: number;
  isClosed: boolean;
  createdAt: string;
  notes?: string;
}

export interface CategoryPerformanceItem {
  categoryId: string;
  categoryName: string;
  totalSalesPiasters: number;
  totalCostPiasters: number;
  grossProfitPiasters: number;
  profitMarginPercent: number;
  itemsSoldQty: number;
  salesSharePercent: number;
}

export interface ItemProfitabilityItem {
  productId: string;
  productName: string;
  barcode: string;
  categoryName: string;
  unitCostPiasters: number;
  unitPricePiasters: number;
  quantitySoldMilli: number;
  totalSalesPiasters: number;
  totalCostPiasters: number;
  grossProfitPiasters: number;
  marginPercent: number;
  isNegativeMargin: boolean;
  isZeroCost: boolean;
}

export interface PeriodMetricComparison {
  current: number;
  previous: number;
  deltaPiasters: number;
  percentChange: number;
}

export interface PeriodComparisonReport {
  currentPeriodName: string;
  previousPeriodName: string;
  sales: PeriodMetricComparison;
  profit: PeriodMetricComparison;
  invoiceCount: {
    current: number;
    previous: number;
    percentChange: number;
  };
  avgInvoicePiasters: PeriodMetricComparison;
}

export interface InventoryOverviewReport {
  totalProductsCount: number;
  activeProductsCount: number;
  totalInventoryCostPiasters: number;
  totalInventoryRetailPiasters: number;
  potentialGrossProfitPiasters: number;
  outOfStockCount: number;
  lowStockCount: number;
  expiredBatchesCount: number;
  expiringSoonBatchesCount: number;
  turnoverRate: number;
}

export interface ShrinkageReasonBreakdown {
  reason: string;
  label: string;
  count: number;
  totalCostPiasters: number;
  percentOfTotal: number;
}

export interface ShrinkageAnalysisReport {
  totalShrinkagePiasters: number;
  shrinkageToSalesPercent: number;
  reasons: ShrinkageReasonBreakdown[];
  topShrinkageProducts: InventoryLossItem[];
}

export interface SupplierPurchaseItem {
  supplierId: string;
  supplierName: string;
  invoicesCount: number;
  totalPurchasePiasters: number;
  paidPiasters: number;
  unpaidPiasters: number;
}

export interface PurchaseAnalysisReport {
  totalPurchasesPiasters: number;
  totalInvoicesCount: number;
  totalPaidPiasters: number;
  totalUnpaidPiasters: number;
  topSuppliers: SupplierPurchaseItem[];
}

export interface CreditOverviewReport {
  totalOutstandingDebtsPiasters: number;
  debtorsCount: number;
  periodNewCreditPiasters: number;
  periodRepaymentsPiasters: number;
  netCreditFlowPiasters: number;
  averagePaybackDays: number;
}

export interface DebtAgingTier {
  label: string;
  daysRange: string;
  customerCount: number;
  totalDebtPiasters: number;
  percentOfTotal: number;
  severity: 'normal' | 'attention' | 'warning' | 'critical';
}

export interface DebtAgingReport {
  totalDebtPiasters: number;
  tiers: DebtAgingTier[];
  criticalDebtorsCount: number;
}

export interface CustomerRankItem {
  customerId: string;
  customerName: string;
  phone: string;
  totalAmountPiasters: number;
  invoicesCount: number;
  balancePiasters: number;
  lastActivityDate: string;
}

export interface CustomerBehaviorReport {
  topBuyingCustomers: CustomerRankItem[];
  topPayingCustomers: CustomerRankItem[];
  inactiveDebtors: CustomerRankItem[];
  newCustomersCount: number;
}

export interface PaymentHistoryRecord {
  id: string;
  customerId: string;
  customerName: string;
  amountPiasters: number;
  paymentDate: string;
  notes?: string;
  cashierName?: string;
  previousBalancePiasters: number;
  newBalancePiasters: number;
}

export interface HourlySalesPoint {
  hour: number;
  hourLabel: string;
  salesPiasters: number;
  invoicesCount: number;
  returnsPiasters: number;
}

export interface HourlyIntensityReport {
  period: string;
  peakHour: number;
  peakHourLabel: string;
  peakHourSalesPiasters: number;
  peakHourInvoicesCount: number;
  hours: HourlySalesPoint[];
}

export interface DeadStockItem {
  productId: string;
  barcode: string;
  name: string;
  categoryName: string;
  stockMilli: number;
  unit: string;
  unitCostPiasters: number;
  retailPricePiasters: number;
  tiedCapitalPiasters: number;
  daysInactive: number;
  lastSoldDate?: string | null;
}

export interface DeadStockReport {
  totalDeadItemsCount: number;
  totalTiedCapitalPiasters: number;
  daysThreshold: number;
  items: DeadStockItem[];
}

export interface CashierPerformanceMetric {
  cashierId: string;
  cashierName: string;
  role: string;
  invoicesCount: number;
  totalSalesPiasters: number;
  cashSalesPiasters: number;
  averageInvoicePiasters: number;
  cancelledCount: number;
  returnsCount: number;
}

export interface ProductSearchResult {
  products: Product[];
  totalCount: number;
  lowStockCount?: number;
  outOfStockCount?: number;
  offset: number;
  limit: number;
}

export function extractProducts(res: unknown): Product[] {
  if (!res) return [];
  if (Array.isArray(res)) return res as Product[];
  if (typeof res === 'object' && res !== null && 'products' in res) {
    const list = (res as { products?: unknown }).products;
    if (Array.isArray(list)) return list as Product[];
  }
  return [];
}


