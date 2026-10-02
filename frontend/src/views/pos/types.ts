import type { Product, SaleItem, ProductUnit } from '../../types/models';

export interface CartItem extends SaleItem {
  taxRatePercent?: number;
  stockQuantityMilli?: number;
  productUnits?: ProductUnit[];
  isDivisible?: boolean;
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
}
