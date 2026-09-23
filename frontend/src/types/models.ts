export interface Product {
  id: string;
  barcode: string | null;
  name: string;
  categoryId?: string | null;
  pricePiasters: number;
  costPiasters: number;
  stockQuantityMilli: number;
  unit: string;
  taxRatePercent: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  priceFormatted?: string;
  stockFormatted?: string;
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
