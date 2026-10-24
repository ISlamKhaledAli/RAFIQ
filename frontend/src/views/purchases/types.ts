export type PurchasesSubView = 'invoices' | 'new_invoice' | 'suppliers' | 'shortages';

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
  // Pharmacy Distributor Pricing (P10 / Story 136)
  publicPricePiasters?: number;
  publicPriceInput?: string;
  distributorDiscountPercent?: number;
  distributorDiscountInput?: string;
  bonusQuantityUnits?: number;
  bonusQuantityInput?: string;
  isPharmaPricing?: boolean;
}

import { formatArabicCurrency } from '../../utils/money';

export const formatMoney = (piasters: number | null | undefined): string => {
  return formatArabicCurrency(piasters, true);
};
