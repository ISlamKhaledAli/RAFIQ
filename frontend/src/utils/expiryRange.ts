// Pure rules for the batches tab expiry-date range filter (calendar days, both ends inclusive).
// An expiry date is a calendar date, not an instant, so it is compared as text without time-zone shifts.

import { normalizeDateRange } from './dateFilter.ts';

export interface ExpiryRange {
  startDate: string; // YYYY-MM-DD or ''
  endDate: string; // YYYY-MM-DD or ''
}

export const EMPTY_EXPIRY_RANGE: ExpiryRange = { startDate: '', endDate: '' };

export interface ExpiryRangeBatch {
  expiryDate?: string | null;
  quantityMilli: number;
  costPricePiasters: number;
  isExpired?: boolean;
  isExpiringSoon?: boolean;
}

export interface ExpiryRangeSummary {
  activeCount: number;
  expiringSoonCount: number;
  expiringSoonValuePiasters: number;
  expiredCount: number;
  expiredValuePiasters: number;
  totalValuePiasters: number;
}

export function isExpiryRangeActive(range: ExpiryRange): boolean {
  const { startDate, endDate } = normalizeDateRange(range.startDate, range.endDate);
  return Boolean(startDate || endDate);
}

/** Batches without an expiry date never match an active range. */
export function matchesExpiryRange(expiryDate: string | null | undefined, range: ExpiryRange): boolean {
  const { startDate, endDate } = normalizeDateRange(range.startDate, range.endDate);
  if (!startDate && !endDate) return true;
  const day = typeof expiryDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(expiryDate) ? expiryDate.slice(0, 10) : '';
  if (!day) return false;
  if (startDate && day < startDate) return false;
  if (endDate && day > endDate) return false;
  return true;
}

/** Same value the table row shows for a batch: quantity x cost, rounded to a whole piaster. */
export function batchValuePiasters(batch: Pick<ExpiryRangeBatch, 'quantityMilli' | 'costPricePiasters'>): number {
  return Math.round((batch.quantityMilli * batch.costPricePiasters) / 1000);
}

/** Summary cards computed from the batches inside the range, so they match the rows on screen. */
export function summarizeBatches(batches: ExpiryRangeBatch[]): ExpiryRangeSummary {
  const summary: ExpiryRangeSummary = {
    activeCount: batches.length,
    expiringSoonCount: 0,
    expiringSoonValuePiasters: 0,
    expiredCount: 0,
    expiredValuePiasters: 0,
    totalValuePiasters: 0,
  };
  for (const b of batches) {
    const value = batchValuePiasters(b);
    summary.totalValuePiasters += value;
    if (b.isExpired) {
      summary.expiredCount += 1;
      summary.expiredValuePiasters += value;
    } else if (b.isExpiringSoon) {
      summary.expiringSoonCount += 1;
      summary.expiringSoonValuePiasters += value;
    }
  }
  return summary;
}
