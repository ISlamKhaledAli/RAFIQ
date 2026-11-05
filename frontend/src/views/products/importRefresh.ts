export interface ImportHostResult {
  createdCount?: number;
  importedCount?: number;
  updatedCount?: number;
  skippedCount?: number;
  categoriesCreatedCount?: number;
  categoriesRestoredCount?: number;
  errors?: string[];
}

export interface ImportOutcome {
  added: number;
  updated: number;
  skipped: number;
  categoriesCreated: number;
  categoriesRestored: number;
  notes: string[];
}

interface CategoryRef {
  id: string;
}

/** A category filter may only point at a section that still exists; otherwise the list falls back to all sections. */
export function resolveCategoryFilter(selectedId: string, categories: ReadonlyArray<CategoryRef>): string {
  if (selectedId === 'all') return 'all';
  return categories.some((c) => c.id === selectedId) ? selectedId : 'all';
}

function toCount(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

/** Prefers the host's own count; an older host without it is covered by comparing the lists before and after. */
export function countCreatedCategories(
  hostCount: number | undefined,
  before: ReadonlyArray<CategoryRef>,
  after: ReadonlyArray<CategoryRef>,
): number {
  const fromHost = toCount(hostCount);
  if (fromHost !== null) return fromHost;
  const known = new Set(before.map((c) => c.id));
  return after.filter((c) => !known.has(c.id)).length;
}

export function buildImportOutcome(
  res: ImportHostResult | null | undefined,
  before: ReadonlyArray<CategoryRef>,
  after: ReadonlyArray<CategoryRef>,
): ImportOutcome {
  const host = res ?? {};
  return {
    added: toCount(host.createdCount) ?? toCount(host.importedCount) ?? 0,
    updated: toCount(host.updatedCount) ?? 0,
    skipped: toCount(host.skippedCount) ?? 0,
    categoriesCreated: countCreatedCategories(host.categoriesCreatedCount, before, after),
    categoriesRestored: toCount(host.categoriesRestoredCount) ?? 0,
    notes: Array.isArray(host.errors) ? host.errors : [],
  };
}
