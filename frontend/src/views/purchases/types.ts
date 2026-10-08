export type PurchasesSubView = 'invoices' | 'new_invoice' | 'suppliers';

export interface NewPurchaseLineItem {
  productId: string;
  productName: string;
  barcode: string;
  currentStockMilli: number;
  currentCostPiasters: number;
  currentPricePiasters: number;
  quantityUnits: number;
  quantityInput?: string;
  unitCostPiasters: number;
  newSellingPricePiasters: number;
  batchNumber?: string;
  expiryDate?: string;
  productionDate?: string;
  // Variants (Colors & Sizes)
  variantColor?: string;
  variantSize?: string;
  variantSku?: string;
  // Carton and Loose Pieces Breakdown
  unit?: string;
  cartonsInput?: string;
  packSizeInput?: string;
  looseInput?: string;
  cartonsCount?: number;
  packSize?: number;
  looseUnits?: number;
  isCartonModeOpen?: boolean;
}

export const formatMoney = (piasters: number): string => {
  return `${(piasters / 100).toFixed(2)} ج.م`;
};
