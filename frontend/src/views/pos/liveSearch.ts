import type { Product, ProductUnit } from '../../types/models';
import { isBarcodeMatch } from '../../utils/barcodeReader.ts';
import { resolveDefaultSaleUnit } from './saleUnit.ts';
import { formatUnitArabic } from '../../utils/units.ts';

export const LIVE_SEARCH_MIN_CHARS = 2;
export const LIVE_SEARCH_LIMIT = 8;
export const LIVE_SEARCH_DEBOUNCE_MS = 180;

const BARCODE_LIKE = /^\d{6,}$/;

/** A long run of digits is a barcode (scanner burst or typed), never a name: it is resolved on Enter, not by the dropdown. */
export function isBarcodeLikeQuery(query: string): boolean {
  return BARCODE_LIKE.test(query.trim());
}

export function shouldRunLiveSearch(query: string): boolean {
  const q = query.trim();
  return q.length >= LIVE_SEARCH_MIN_CHARS && !isBarcodeLikeQuery(q);
}

/** Hands out request ids; only the newest id is current, so a late response can be dropped. */
export interface RequestGate {
  begin: () => number;
  invalidate: () => void;
  isCurrent: (id: number) => boolean;
}

export function createRequestGate(): RequestGate {
  let latest = 0;
  return {
    begin: () => {
      latest += 1;
      return latest;
    },
    invalidate: () => {
      latest += 1;
    },
    isCurrent: (id) => id === latest,
  };
}

export interface DropdownPick {
  product: Product;
  unit?: ProductUnit;
}

interface PickArgs {
  results: Product[];
  isOpen: boolean;
  /** Query the displayed results were fetched for. */
  resultsQuery: string;
  currentQuery: string;
  /** Text submitted with Enter, already normalised the way barcodes are stored. */
  submitted: string;
  selectedIndex: number;
}

/**
 * What Enter picks from the dropdown: an exact barcode match always wins over the highlighted row;
 * the highlighted row only counts while the dropdown is open and belongs to what is typed now.
 */
export function pickDropdownProduct({ results, isOpen, resultsQuery, currentQuery, submitted, selectedIndex }: PickArgs): DropdownPick | null {
  if (results.length === 0) return null;

  for (const product of results) {
    const unit = product.units?.find((u) => isBarcodeMatch(u.barcode, submitted));
    if (unit) return { product, unit };
    if (isBarcodeMatch(product.barcode, submitted) || product.barcodes?.some((bc) => isBarcodeMatch(bc, submitted))) {
      return { product };
    }
  }

  if (isOpen && resultsQuery === currentQuery && results[selectedIndex]) {
    return { product: results[selectedIndex] };
  }
  return null;
}

export type StockState = 'out' | 'low' | 'ok';

export interface SearchRowInfo {
  pricePiasters: number;
  /** Set only when the price is for a non-base unit (e.g. carton). */
  priceUnitName: string | null;
  stockText: string;
  stockState: StockState;
  hasVariants: boolean;
}

const DEFAULT_MIN_STOCK_MILLI = 5000;

/** The few facts a cashier needs from a name-search row: price (default sale unit), availability, variants marker. */
export function describeSearchRow(prod: Product): SearchRowInfo {
  const saleUnit = resolveDefaultSaleUnit(prod.units, prod.defaultSaleUnitId, prod.isLooseSellable);
  const pricePiasters = saleUnit && saleUnit.sellPricePiasters > 0 ? saleUnit.sellPricePiasters : prod.pricePiasters;
  const priceUnitName = saleUnit && !saleUnit.isBaseUnit ? formatUnitArabic(saleUnit.unitName) : null;

  const stockMilli = prod.stockQuantityMilli;
  const baseUnit = prod.units?.find((u) => u.isBaseUnit);
  const unitLabel = prod.unit === 'kg' ? 'كجم' : formatUnitArabic(baseUnit?.unitName || prod.unit || 'قطعة');
  const stock = Number((stockMilli / 1000).toFixed(3));

  let stockState: StockState = 'ok';
  if (stockMilli <= 0) stockState = 'out';
  else if (stockMilli <= (prod.minStockQuantityMilli || DEFAULT_MIN_STOCK_MILLI)) stockState = 'low';

  return {
    pricePiasters,
    priceUnitName,
    stockText: stockState === 'out' ? 'نفد' : `${stock.toLocaleString('en-US', { maximumFractionDigits: 3 })} ${unitLabel}`,
    stockState,
    hasVariants: Boolean(prod.hasVariants),
  };
}
