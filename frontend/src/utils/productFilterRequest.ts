// Pure rules for "open the products page with a preset filter" so they run under node strip-types.
// Every request carries a fresh nonce: the same filter clicked twice is still a new request.

import { DEFAULT_DATE_FILTER, type DateFilterValue } from './dateFilter.ts';

export type ProductStockFilter = 'all' | 'lowStock' | 'outOfStock';

export interface ProductFilterRequest {
  filter: ProductStockFilter;
  nonce: number;
}

/** Filter state of the products page that a request replaces as a whole. */
export interface ProductFilterState {
  searchQuery: string;
  stockStatus: ProductStockFilter;
  categoryId: string;
  page: number;
  selectedProductIds: string[];
  movementType: string;
  movementSearchQuery: string;
  movementDateFilter: DateFilterValue;
  batchesSearchQuery: string;
}

export const INITIAL_PRODUCT_FILTER_REQUEST: ProductFilterRequest = { filter: 'all', nonce: 0 };

export function nextProductFilterRequest(
  previous: ProductFilterRequest,
  filter: ProductStockFilter = 'all',
): ProductFilterRequest {
  return { filter, nonce: previous.nonce + 1 };
}

/** Keeps the nonce so a manual "clear stock filter" is not mistaken for a new request. */
export function withClearedStockFilter(request: ProductFilterRequest): ProductFilterRequest {
  return request.filter === 'all' ? request : { ...request, filter: 'all' };
}

/** Every filter back to its default, then only the requested stock filter applied. */
export function buildProductFilterState(filter: ProductStockFilter): ProductFilterState {
  return {
    searchQuery: '',
    stockStatus: filter,
    categoryId: 'all',
    page: 1,
    selectedProductIds: [],
    movementType: 'ALL',
    movementSearchQuery: '',
    movementDateFilter: { ...DEFAULT_DATE_FILTER },
    batchesSearchQuery: '',
  };
}

export function isNewProductFilterRequest(handledNonce: number, request: ProductFilterRequest): boolean {
  return request.nonce !== handledNonce;
}
