// Product branding helpers (pure, unit-testable). The product name is fixed; the shop name is data.

export const APP_TITLE = 'نظام رفيق';

const PLACEHOLDER_STORE_NAMES = new Set<string>(['متجر رفيق', 'رفيق POS', APP_TITLE]);

/** Returns the saved shop name when it is a real one, or null for empty/placeholder defaults. */
export function getShopSubtitle(storeName: string | null | undefined): string | null {
  const name = (storeName ?? '').trim();
  if (!name || PLACEHOLDER_STORE_NAMES.has(name)) return null;
  return name;
}
