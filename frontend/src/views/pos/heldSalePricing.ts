import { calculateLineTotal, calculateTaxPiasters } from '../../utils/money.ts';

export interface PricingUnit {
  id?: string;
  sellPricePiasters: number;
  conversionFactor: number;
}

export interface PricingProduct {
  id: string;
  pricePiasters: number;
  suggestedBatchSellPricePiasters?: number | null;
  units?: PricingUnit[];
}

export interface HeldPricingItem {
  productId: string;
  productName: string;
  unitId?: string;
  unitName?: string;
  quantityMilli: number;
  unitPricePiasters: number;
  discountPiasters: number;
  totalPiasters: number;
  taxPiasters: number;
  taxRatePercent?: number;
  modifiers?: ReadonlyArray<{ extraPricePiasters: number }>;
}

export interface HeldPriceChange {
  index: number;
  productName: string;
  unitName?: string;
  heldUnitPricePiasters: number;
  currentUnitPricePiasters: number;
}

/** Base (smallest unit) selling price, honouring batch pricing when enabled. */
export function resolveBaseSellPrice(product: PricingProduct, useBatchPricing: boolean): number {
  const batchPrice = product.suggestedBatchSellPricePiasters;
  return useBatchPricing && batchPrice && batchPrice > 0 ? batchPrice : product.pricePiasters;
}

/** A unit's own sell price wins; otherwise base price x conversion factor. */
export function resolveUnitSellPrice(baseSellPricePiasters: number, unit?: PricingUnit | null): number {
  if (!unit) return baseSellPricePiasters;
  if (unit.sellPricePiasters > 0) return unit.sellPricePiasters;
  const factor = unit.conversionFactor > 0 ? unit.conversionFactor : 1;
  return baseSellPricePiasters * factor;
}

export function sumModifierExtras(modifiers?: ReadonlyArray<{ extraPricePiasters: number }>): number {
  return (modifiers || []).reduce((sum, m) => sum + (m.extraPricePiasters || 0), 0);
}

/** Current catalog price for a held line, or null when it cannot be priced (unknown product/unit, open price). */
export function currentCatalogUnitPrice(
  item: HeldPricingItem,
  catalog: ReadonlyArray<PricingProduct>,
  useBatchPricing: boolean
): number | null {
  const product = catalog.find((p) => p.id === item.productId);
  if (!product) return null;
  let unit: PricingUnit | undefined;
  if (item.unitId) {
    unit = (product.units || []).find((u) => u.id === item.unitId);
    if (!unit) return null;
  }
  const unitPrice = resolveUnitSellPrice(resolveBaseSellPrice(product, useBatchPricing), unit);
  if (unitPrice <= 0) return null;
  return unitPrice + sumModifierExtras(item.modifiers);
}

export function findHeldPriceChanges(
  items: ReadonlyArray<HeldPricingItem>,
  catalog: ReadonlyArray<PricingProduct>,
  useBatchPricing: boolean
): HeldPriceChange[] {
  const changes: HeldPriceChange[] = [];
  items.forEach((item, index) => {
    const current = currentCatalogUnitPrice(item, catalog, useBatchPricing);
    if (current !== null && current !== item.unitPricePiasters) {
      changes.push({
        index,
        productName: item.productName,
        unitName: item.unitName,
        heldUnitPricePiasters: item.unitPricePiasters,
        currentUnitPricePiasters: current,
      });
    }
  });
  return changes;
}

/** Re-prices only the listed lines, keeping quantities and line discounts. */
export function applyCurrentPrices<T extends HeldPricingItem>(items: ReadonlyArray<T>, changes: ReadonlyArray<HeldPriceChange>): T[] {
  return items.map((item, index) => {
    const change = changes.find((c) => c.index === index);
    if (!change) return item;
    const total = calculateLineTotal(change.currentUnitPricePiasters, item.quantityMilli, item.discountPiasters || 0);
    return {
      ...item,
      unitPricePiasters: change.currentUnitPricePiasters,
      totalPiasters: total,
      taxPiasters: calculateTaxPiasters(total, item.taxRatePercent || 0, true),
    };
  });
}

/** Per-line marker written into held carts since discountPiasters became invoice-level only. */
export const HELD_CART_FORMAT_VERSION = 2;

/** The marker lives on each line because the server stores cartJson verbatim as a line array. */
export function serializeHeldCart<T extends object>(items: ReadonlyArray<T>): string {
  return JSON.stringify(items.map((item) => ({ ...item, heldFormatVersion: HELD_CART_FORMAT_VERSION })));
}

export function isLegacyHeldCart(items: ReadonlyArray<{ heldFormatVersion?: number }>): boolean {
  return !items.some((item) => item.heldFormatVersion === HELD_CART_FORMAT_VERSION);
}

export function stripHeldCartMarker<T extends { heldFormatVersion?: number }>(items: ReadonlyArray<T>): T[] {
  return items.map((item) => {
    const copy = { ...item };
    delete copy.heldFormatVersion;
    return copy;
  });
}

/**
 * Legacy held sales (no format marker) stored the sum of line discounts in discountPiasters too.
 * For those only, an invoice discount exactly equal to that sum is treated as the duplication and
 * dropped; marked carts keep their invoice discount as held.
 */
export function resolveHeldInvoiceDiscount(
  items: ReadonlyArray<{ discountPiasters?: number; heldFormatVersion?: number }>,
  heldDiscountPiasters: number | null | undefined
): number {
  const invoiceDiscount = heldDiscountPiasters || 0;
  if (!isLegacyHeldCart(items)) return invoiceDiscount;
  const lineDiscounts = items.reduce((sum, item) => sum + (item.discountPiasters || 0), 0);
  if (lineDiscounts > 0 && invoiceDiscount === lineDiscounts) return 0;
  return invoiceDiscount;
}

/** Keeping held prices that differ from the catalog needs a supervisor unless the user may override prices. */
export function keepHeldPricesRequiresApproval(changes: ReadonlyArray<HeldPriceChange>, canOverridePrice: boolean): boolean {
  return changes.length > 0 && !canOverridePrice;
}
