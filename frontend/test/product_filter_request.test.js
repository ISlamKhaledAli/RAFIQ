import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  INITIAL_PRODUCT_FILTER_REQUEST,
  buildProductFilterState,
  isNewProductFilterRequest,
  nextProductFilterRequest,
  withClearedStockFilter,
} from '../src/utils/productFilterRequest.ts';

const src = (rel) => fs.readFileSync(path.join(import.meta.dirname, '..', 'src', rel), 'utf8');

describe('product filter request rules', () => {
  it('the same filter requested twice is two different requests', () => {
    const first = nextProductFilterRequest(INITIAL_PRODUCT_FILTER_REQUEST, 'lowStock');
    const second = nextProductFilterRequest(first, 'lowStock');
    assert.equal(first.filter, second.filter);
    assert.notEqual(first.nonce, second.nonce);
    assert.equal(isNewProductFilterRequest(first.nonce, second), true);
    assert.equal(isNewProductFilterRequest(second.nonce, second), false);
  });

  it('a request without a filter means "all"', () => {
    assert.equal(nextProductFilterRequest(INITIAL_PRODUCT_FILTER_REQUEST).filter, 'all');
  });

  it('a request resets search, category, page, selection and sub-view filters, then applies only its own filter', () => {
    const state = buildProductFilterState('outOfStock');
    assert.deepEqual(state, {
      searchQuery: '',
      stockStatus: 'outOfStock',
      categoryId: 'all',
      page: 1,
      selectedProductIds: [],
      movementType: 'ALL',
      movementSearchQuery: '',
      batchesSearchQuery: '',
    });
    assert.equal(buildProductFilterState('all').stockStatus, 'all');
  });

  it('each call returns a fresh selection array', () => {
    assert.notEqual(buildProductFilterState('all').selectedProductIds, buildProductFilterState('all').selectedProductIds);
  });

  it('manually clearing the stock filter keeps the nonce so it is not treated as a new request', () => {
    const request = nextProductFilterRequest(INITIAL_PRODUCT_FILTER_REQUEST, 'lowStock');
    const cleared = withClearedStockFilter(request);
    assert.equal(cleared.filter, 'all');
    assert.equal(cleared.nonce, request.nonce);
    assert.equal(isNewProductFilterRequest(request.nonce, cleared), false);
    assert.equal(withClearedStockFilter(cleared), cleared);
  });

  it('low stock, clear manually, low stock again is a new request that applies the filter again', () => {
    const first = nextProductFilterRequest(INITIAL_PRODUCT_FILTER_REQUEST, 'lowStock');
    const cleared = withClearedStockFilter(first);
    const again = nextProductFilterRequest(cleared, 'lowStock');
    assert.equal(isNewProductFilterRequest(cleared.nonce, again), true);
    assert.equal(again.filter, 'lowStock');
  });
});

describe('products page wiring (source)', () => {
  const productsView = src('views/ProductsView.tsx');
  const app = src('App.tsx');

  it('ProductsView reacts to the request nonce and resets every filter state', () => {
    assert.match(productsView, /isNewProductFilterRequest\(handledFilterNonce, filterRequest\)/);
    for (const setter of [
      'setSearchQuery(reset.searchQuery)',
      'setStockStatusFilter(reset.stockStatus)',
      'setSelectedCategoryFilter(reset.categoryId)',
      'setCurrentPage(reset.page)',
      'setSelectedProductIds(reset.selectedProductIds)',
      'setMovementTypeFilter(reset.movementType)',
      'setMovementSearchQuery(reset.movementSearchQuery)',
      'setBatchesInitialSearch(reset.batchesSearchQuery)',
    ]) {
      assert.ok(productsView.includes(setter), `missing reset: ${setter}`);
    }
  });

  it('ProductsView no longer compares the filter value (which ignored a repeated click)', () => {
    assert.doesNotMatch(productsView, /prevInitialFilter/);
    assert.doesNotMatch(productsView, /initialFilter/);
  });

  it('the batches tab remounts on a new request so its own filters reset too', () => {
    assert.match(productsView, /<BatchesTab\s+key=\{handledFilterNonce\}/);
  });

  it('manual clearing still notifies the host through onResetFilter', () => {
    assert.match(productsView, /onResetFilter\?\.\(\)/);
    assert.match(app, /onResetFilter=\{\(\) => setProductFilterRequest\(withClearedStockFilter\)\}/);
  });

  it('every App entry point that opens products with a filter goes through one request helper', () => {
    assert.doesNotMatch(app, /setInitialProductFilter|initialProductFilter/);
    assert.match(app, /onOpenLowStockCatalog: \(\) => openProductsWithFilter\('catalog', 'lowStock'\)/);
    const uses = app.match(/onNavigateToProducts=\{openProductsWithFilter\}/g) ?? [];
    assert.equal(uses.length, 2, 'dashboard today + inventory analytics');
    assert.match(app, /nextProductFilterRequest\(prev, filter\)/);
  });

  it('the dashboard low stock buttons ask for the lowStock filter', () => {
    const dash = src('views/DashboardView.tsx');
    const hits = dash.match(/onNavigateToProducts\('catalog', 'lowStock'\)/g) ?? [];
    assert.equal(hits.length, 2);
  });

  it('the low stock report modal starts from cleared filters each time it opens', () => {
    const modal = src('components/LowStockReportModal.tsx');
    assert.match(modal, /if \(isOpen\) \{\s*setSearchQuery\(''\);\s*setFilterMode\('all'\);/);
  });
});
