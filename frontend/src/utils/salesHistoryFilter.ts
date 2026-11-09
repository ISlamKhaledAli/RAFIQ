import { type DateFilterValue, getDateFilterPayload } from './dateFilter.ts';

export type SalesStatusFilter = 'all' | 'completed' | 'cancelled' | 'refunded';

/** Most invoices one load returns (rows are light: no items); the screen warns when the result hits it */
export const SALES_HISTORY_LIMIT = 2000;

export interface SalesHistoryQuery {
  limit: number;
  dateFrom?: string;
  dateTo?: string;
  status?: Exclude<SalesStatusFilter, 'all'>;
}

/**
 * Backend payload of sales:getRecent / sales:search: date range and status are applied in SQL so the
 * row cap never hides older invoices that match the filter.
 */
export function buildSalesHistoryQuery(dateFilter: DateFilterValue, status: SalesStatusFilter, today?: string): SalesHistoryQuery {
  const query: SalesHistoryQuery = { limit: SALES_HISTORY_LIMIT, ...getDateFilterPayload(dateFilter, today) };
  if (status !== 'all') query.status = status;
  return query;
}

export interface SalesTotals {
  invoiceCount: number;
  validCount: number;
  totalPiasters: number;
  averagePiasters: number;
}

/** KPI totals of the rows on screen: cancelled invoices count as invoices but not as revenue; refunded amounts are deducted */
export function summarizeSales(sales: { status?: string; totalPiasters?: number; refundedPiasters?: number }[]): SalesTotals {
  const valid = sales.filter((s) => s.status !== 'cancelled');
  const totalPiasters = valid.reduce((sum, s) => {
    const gross = s.totalPiasters || 0;
    const refunded = s.refundedPiasters || 0;
    return sum + Math.max(0, gross - refunded);
  }, 0);
  const averagePiasters = valid.length > 0 ? Math.round(totalPiasters / valid.length) : 0;
  return { invoiceCount: sales.length, validCount: valid.length, totalPiasters, averagePiasters };
}
