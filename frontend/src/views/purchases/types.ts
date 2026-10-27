import type { ProductUnit } from '../../types/models';

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
  // Packaging, Units & Store Terminology
  unit?: string;                       // Base unit name (e.g. 'برشامة', 'قرص', 'قطعة')
  packageUnitName?: string;            // Package unit name (e.g. 'علبة', 'كرتونة', 'دستة')
  purchaseUnitMode?: 'package' | 'base'; // 'package' (بالعلبة / بالكرتونة) vs 'base' (بالبرشامة / فرط)
  packageQuantityInput?: string;       // Quantity typed when in package mode (e.g. '5' علب)
  productUnits?: ProductUnit[];        // Attached product packaging units
  packageCostPiasters?: number;        // Cost per package (e.g. cost per علبة / كرتونة)
  cartonsInput?: string;               // Package count input
  packSizeInput?: string;              // Units per package input
  looseInput?: string;                 // Loose units input
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
