export interface ShortageEntry {
  id: string;
  productId?: string | null;
  productName: string;
  barcode?: string | null;
  unit?: string | null;
  requestedQuantityMilli: number;
  currentStockMilli: number;
  minStockMilli: number;
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
  requestCount: number;
  totalRequestedQuantityMilli: number;
  estimatedLostRevenuePiasters: number;
}

export interface LostSalesReportSummary {
  totalUnmetRequestsCount: number;
  totalEstimatedLostRevenuePiasters: number;
  topRequestedProducts: LostSalesReportItem[];
}
