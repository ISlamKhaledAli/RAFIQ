export type PurchasesSubView = 'invoices' | 'new_invoice' | 'suppliers';

export interface NewPurchaseLineItem {
  productId: string;
  productName: string;
  barcode: string;
  currentStockMilli: number;
  currentCostPiasters: number;
  currentPricePiasters: number;
  quantityUnits: number;
  unitCostPiasters: number;
  newSellingPricePiasters: number;
  batchNumber?: string;
  expiryDate?: string;
  productionDate?: string;
}

export const formatMoney = (piasters: number): string => {
  return `${(piasters / 100).toFixed(2)} ج.م`;
};
