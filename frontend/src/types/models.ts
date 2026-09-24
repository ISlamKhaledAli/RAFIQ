export interface Product {
  id: string;
  barcode: string | null;
  barcodes?: string[];
  name: string;
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
  createdAt: string;
  updatedAt: string;
  priceFormatted?: string;
  stockFormatted?: string;
  minStockFormatted?: string;
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
  unit?: string;
}

export interface Sale {
  id?: string;
  invoiceNumber?: number;
  cashierId?: string | null;
  customerId?: string | null;
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
  type: 'sale' | 'payment' | 'opening_balance';
  saleId?: string | null;
  amountPiasters: number;
  balanceAfterPiasters: number;
  notes: string;
  createdAt: string;
  amountFormatted?: string;
  balanceAfterFormatted?: string;
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

