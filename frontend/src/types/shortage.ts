export interface ShortageEntry {
  id: string;
  productId?: string | null;
  productName: string;
  barcode?: string | null;
  unit?: string | null;
  requestedQuantityMilli: number;
  currentStockMilli: number;
  minStockMilli: number;
  costPiasters?: number;
  customerName?: string | null;
  customerPhone?: string | null;
  urgency: 'normal' | 'urgent' | 'critical';
  source: 'manual_pos' | 'auto_reorder' | 'customer_request';
  status: 'pending' | 'ordered' | 'received' | 'cancelled';
  notes?: string | null;
  recordedByUserId?: string | null;
  recordedByUserName?: string | null;
  preferredSupplierId?: string | null;
  preferredSupplierName?: string | null;
  purchaseOrderId?: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string | null;
}

export interface ShortageProposalItem {
  shortageId: string;
  productId: string;
  productName: string;
  barcode?: string | null;
  unit: string;
  suggestedQuantityMilli: number;
  costPiasters: number;
  totalEstimatedCostPiasters: number;
}

export interface ShortagePurchaseProposal {
  supplierId: string;
  supplierName: string;
  supplierPhone?: string | null;
  items: ShortageProposalItem[];
}

export interface LostSalesReportItem {
  productId: string;
  productName: string;
  barcode?: string | null;
  unit?: string | null;
  source?: string | null;
  status?: string | null;
  requestCount: number;
  totalRequestedQuantityMilli: number;
  unitPricePiasters: number;
  estimatedLostRevenuePiasters: number;
  currentStockMilli?: number;
  preferredSupplierName?: string | null;
}

export interface LostSalesReportSummary {
  totalUnmetRequestsCount: number;
  totalEstimatedLostRevenuePiasters: number;
  totalCustomerRequestsCount?: number;
  totalAutoReorderCount?: number;
  uniqueProductsCount?: number;
  topRequestedProducts: LostSalesReportItem[];
}

export function formatUnitArabic(unit?: string | null): string {
  if (!unit) return 'قطعة';
  const u = unit.trim().toLowerCase();
  if (u === 'piece' || u === 'pieces' || u === 'pcs' || u === 'pc') return 'قطعة';
  if (u === 'box' || u === 'boxes') return 'علبة';
  if (u === 'kg' || u === 'kilogram') return 'كجم';
  if (u === 'g' || u === 'gram') return 'جم';
  if (u === 'carton' || u === 'pack') return 'كرتونة';
  if (u === 'strip') return 'شريط';
  if (u === 'tablet') return 'قرص';
  if (u === 'bottle') return 'زجاجة';
  if (u === 'liter' || u === 'l') return 'لتر';
  if (u === 'meter' || u === 'm') return 'متر';
  return unit;
}
