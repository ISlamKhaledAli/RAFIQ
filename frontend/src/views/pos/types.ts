import type { Product, SaleItem, ProductUnit } from '../../types/models';
import type { ControlledDrugDispense } from '../../types/pharma';

export interface CartItem extends SaleItem {
  taxRatePercent?: number;
  stockQuantityMilli?: number;
  productUnits?: ProductUnit[];
  /** Catalogue base-unit price at add time; keeps package-unit switches exact (no round-trip through a package price). */
  basePricePiasters?: number;
  isDivisible?: boolean;
  isControlled?: boolean;
  controlledSchedule?: string | null;
  controlledDispense?: ControlledDrugDispense;
  consumesIngredientsOnSale?: boolean;
}

export interface SmartCatalogItem {
  id: string;
  productId?: string | null;
  name: string;
  pricePiasters: number;
  isOpenPrice: boolean;
  unit: string;
  categoryId?: string | null;
  categoryName: string;
  stockQuantityMilli?: number;
  barcode?: string | null;
  barcodes?: string[];
  units?: ProductUnit[];
  isCustomQuickItem: boolean;
  salesCount: number;
  quickDisplayOrder: number;
  productRef?: Product;
  hasVariants?: boolean;
  variantColor?: string | null;
  variantSize?: string | null;
  variantsCount?: number;
  hasBatches?: boolean;
  nearestExpiryDate?: string | null;
  suggestedBatchNumber?: string | null;
  isExpired?: boolean;
  defaultSaleUnitId?: string | null;
  isLooseSellable?: boolean;
  consumesIngredientsOnSale?: boolean;
  isControlled?: boolean;
  controlledSchedule?: string | null;
}

