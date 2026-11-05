/** Size of the "الأكثر طلباً ومبيعاً" list and the window the host counts sales in (see ProductRepository.GetSmartCatalog). */
export const POPULAR_ITEMS_LIMIT = 24;
export const POPULAR_WINDOW_DAYS = 30;

interface PopularCandidate {
  name: string;
  salesCount: number;
  productRef?: { createdAt?: string } | null;
}

export interface PopularSelection<T> {
  items: T[];
  /** True when nothing was sold yet: the list shows the newest products instead of best sellers. */
  isFallback: boolean;
}

const byName = (a: PopularCandidate, b: PopularCandidate) => a.name.localeCompare(b.name, 'ar');

/**
 * Best sellers = most units sold in the window, then name. A store with no sales yet gets
 * its newest products so the tab is never an empty dead end.
 */
export function pickPopularItems<T extends PopularCandidate>(items: T[]): PopularSelection<T> {
  const sold = items
    .filter((it) => (it.salesCount || 0) > 0)
    .sort((a, b) => (b.salesCount - a.salesCount) || byName(a, b))
    .slice(0, POPULAR_ITEMS_LIMIT);
  if (sold.length > 0) return { items: sold, isFallback: false };

  const newest = items
    .filter((it) => Boolean(it.productRef?.createdAt))
    .sort((a, b) => {
      const createdA = a.productRef?.createdAt || '';
      const createdB = b.productRef?.createdAt || '';
      if (createdA !== createdB) return createdA < createdB ? 1 : -1;
      return byName(a, b);
    })
    .slice(0, POPULAR_ITEMS_LIMIT);
  return { items: newest, isFallback: true };
}
