import type { Category, Product } from '../../types/models';

/** The POS grid loads only the best-selling / quick items; everything else is searched on demand. */
export const POS_CATALOG_LIMIT = 300;
/** Rows fetched when a section of a large catalogue is opened. */
export const POS_SECTION_FETCH_LIMIT = 200;
/** Rows fetched for a grid search box query on a large catalogue. */
export const POS_SEARCH_FETCH_LIMIT = 60;
export const POS_REMOTE_SEARCH_MIN_CHARS = 2;

const TAB_ALL = '__ALL__';
const TAB_POPULAR = '__POPULAR__';
const TAB_CUSTOM = '__CUSTOM__';

/** True when the host holds more active products than the bounded load returned. An unknown total means "complete". */
export function isCatalogTruncated(loadedCount: number, totalCount: number | undefined): boolean {
  return typeof totalCount === 'number' && Number.isFinite(totalCount) && totalCount > loadedCount;
}

export interface RemoteCatalogRequest {
  key: string;
  query: string;
  /** 'all' means no section filter (the host's own wildcard). */
  categoryId: string;
  limit: number;
}

export function remoteCatalogKey(tab: string, query: string): string {
  return `${tab}|${query.trim()}`;
}

/**
 * What must be fetched from the host to answer the grid's search box / section tab when the loaded catalogue is bounded.
 * Popular and custom tabs are always fully loaded (best sellers and quick items come first in the bounded load).
 */
export function describeRemoteCatalogRequest(
  truncated: boolean,
  tab: string,
  query: string,
  categories: ReadonlyArray<Pick<Category, 'id' | 'name'>>
): RemoteCatalogRequest | null {
  if (!truncated) return null;
  if (tab === TAB_POPULAR || tab === TAB_CUSTOM) return null;

  const trimmed = query.trim();
  const isSection = tab !== TAB_ALL;
  const section = isSection ? categories.find((c) => c.id === tab || c.name === tab) : undefined;
  const categoryId = section ? section.id : 'all';

  if (trimmed.length >= POS_REMOTE_SEARCH_MIN_CHARS) {
    return { key: remoteCatalogKey(tab, trimmed), query: trimmed, categoryId, limit: POS_SEARCH_FETCH_LIMIT };
  }
  if (section && trimmed.length === 0) {
    return { key: remoteCatalogKey(tab, ''), query: '', categoryId, limit: POS_SECTION_FETCH_LIMIT };
  }
  return null;
}

/** Appends products the base list does not have yet; the base entry wins (it carries sales rank and batch data). */
export function mergeProductsById(base: ReadonlyArray<Product>, extra: ReadonlyArray<Product>): Product[] {
  if (extra.length === 0) return base.slice();
  const seen = new Set<string>();
  for (const p of base) seen.add(p.id);
  const merged = base.slice();
  for (const p of extra) {
    if (p.id && !seen.has(p.id)) {
      seen.add(p.id);
      merged.push(p);
    }
  }
  return merged;
}

/** Copies the live stock/price of freshly read rows onto the matching catalogue rows; every other field is kept. */
export function applyFreshProductFacts(products: ReadonlyArray<Product>, fresh: ReadonlyArray<Product>): Product[] {
  if (fresh.length === 0) return products.slice();
  const byId = new Map<string, Product>();
  for (const p of fresh) byId.set(p.id, p);
  return products.map((p) => {
    const latest = byId.get(p.id);
    if (!latest) return p;
    return {
      ...p,
      stockQuantityMilli: latest.stockQuantityMilli,
      minStockQuantityMilli: latest.minStockQuantityMilli,
      pricePiasters: latest.pricePiasters,
      costPiasters: latest.costPiasters,
    };
  });
}

/** Ids of the products a finished sale touched (real catalogue ids only), without duplicates. */
export function collectProductIds(items: ReadonlyArray<{ productId?: string }>): string[] {
  const ids = new Set<string>();
  for (const item of items) {
    if (item.productId) ids.add(item.productId);
  }
  return Array.from(ids);
}
