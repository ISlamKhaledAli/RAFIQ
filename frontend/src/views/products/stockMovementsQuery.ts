// Pure request rules for stock-movement lists, shared by the movements tab and the per-product movement card.
// The date range is applied by the backend (SQL) so a capped load can never hide older matches.

import { type DateFilterValue, getDateFilterPayload } from '../../utils/dateFilter.ts';

/** Rows requested by the all-products movements tab. */
export const MOVEMENTS_LOAD_LIMIT = 1000;

/** Rows requested by the per-product movement card. */
export const PRODUCT_MOVEMENTS_LOAD_LIMIT = 100;

export interface MovementsRequest {
  movementType?: string;
  productId?: string;
  limit: number;
  dateFrom?: string;
  dateTo?: string;
}

export function buildMovementsRequest(
  movementType: string,
  dateFilter: DateFilterValue,
  limit: number,
  productId?: string,
): MovementsRequest {
  const request: MovementsRequest = { limit, ...getDateFilterPayload(dateFilter) };
  if (movementType && movementType !== 'ALL') request.movementType = movementType;
  if (productId) request.productId = productId;
  return request;
}
