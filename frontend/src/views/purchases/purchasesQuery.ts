// Pure request rules for the purchases screens. The date range is applied by the backend (SQL),
// so the capped loads below can never hide older matches.

import { type DateFilterValue, getDateFilterPayload } from '../../utils/dateFilter.ts';

/** Invoices requested by the invoices tab (headers only, no line items). */
export const PURCHASES_LOAD_LIMIT = 1000;

/** Ledger rows requested by the supplier statement. */
export const SUPPLIER_STATEMENT_LOAD_LIMIT = 500;

export interface PurchasesRequest {
  limit: number;
  dateFrom?: string;
  dateTo?: string;
}

export interface SupplierTransactionsRequest extends PurchasesRequest {
  supplierId: string;
}

export function buildPurchasesRequest(dateFilter: DateFilterValue): PurchasesRequest {
  return { limit: PURCHASES_LOAD_LIMIT, ...getDateFilterPayload(dateFilter) };
}

export function buildSupplierTransactionsRequest(
  supplierId: string,
  dateFilter: DateFilterValue,
): SupplierTransactionsRequest {
  return { supplierId, limit: SUPPLIER_STATEMENT_LOAD_LIMIT, ...getDateFilterPayload(dateFilter) };
}
