import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { toLocalDateString } from '../src/utils/dateFilter.ts';
import {
  MOVEMENTS_LOAD_LIMIT,
  PRODUCT_MOVEMENTS_LOAD_LIMIT,
  buildMovementsRequest,
} from '../src/views/products/stockMovementsQuery.ts';
import {
  PURCHASES_LOAD_LIMIT,
  SUPPLIER_STATEMENT_LOAD_LIMIT,
  buildPurchasesRequest,
  buildSupplierTransactionsRequest,
} from '../src/views/purchases/purchasesQuery.ts';
import {
  EMPTY_EXPIRY_RANGE,
  batchValuePiasters,
  isExpiryRangeActive,
  matchesExpiryRange,
  summarizeBatches,
} from '../src/utils/expiryRange.ts';
import { formatShortageDate, matchesShortageDay, shortageInstant } from '../src/views/purchases/shortageDates.ts';
import { buildProductFilterState } from '../src/utils/productFilterRequest.ts';

const src = (rel) =>
  fs.readFileSync(path.join(import.meta.dirname, '..', 'src', rel), 'utf8').replace(/\r\n/g, '\n');
const csharp = (rel) =>
  fs.readFileSync(path.join(import.meta.dirname, '..', '..', 'desktop', rel), 'utf8').replace(/\r\n/g, '\n');

const custom = (startDate, endDate) => ({ preset: 'custom', startDate, endDate });
const ALL = { preset: 'all', startDate: '', endDate: '' };

describe('stock movement request (range goes to the backend, never filtered client-side over a capped load)', () => {
  it('no filter sends only the limit', () => {
    assert.deepEqual(buildMovementsRequest('ALL', ALL, MOVEMENTS_LOAD_LIMIT), { limit: MOVEMENTS_LOAD_LIMIT });
  });

  it('type, product and a custom range are all sent together', () => {
    assert.deepEqual(
      buildMovementsRequest('SALE', custom('2026-11-01', '2026-11-07'), PRODUCT_MOVEMENTS_LOAD_LIMIT, 'p_1'),
      { limit: PRODUCT_MOVEMENTS_LOAD_LIMIT, dateFrom: '2026-11-01', dateTo: '2026-11-07', movementType: 'SALE', productId: 'p_1' },
    );
  });

  it('only a start or only an end date works', () => {
    assert.deepEqual(buildMovementsRequest('ALL', custom('2026-11-01', ''), 10), { limit: 10, dateFrom: '2026-11-01' });
    assert.deepEqual(buildMovementsRequest('ALL', custom('', '2026-11-07'), 10), { limit: 10, dateTo: '2026-11-07' });
  });

  it('a swapped range (start after end) is reordered', () => {
    const request = buildMovementsRequest('ALL', custom('2026-11-07', '2026-11-01'), 10);
    assert.equal(request.dateFrom, '2026-11-01');
    assert.equal(request.dateTo, '2026-11-07');
  });

  it('a custom preset with no dates restricts nothing', () => {
    assert.deepEqual(buildMovementsRequest('ALL', custom('', ''), 10), { limit: 10 });
  });

  it('week is the last 7 days including today and month starts on the 1st', () => {
    const now = new Date();
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
    const week = buildMovementsRequest('ALL', { preset: 'week', startDate: '', endDate: '' }, 10);
    assert.equal(week.dateFrom, toLocalDateString(weekStart));
    assert.equal(week.dateTo, toLocalDateString(now));
    const month = buildMovementsRequest('ALL', { preset: 'month', startDate: '', endDate: '' }, 10);
    assert.equal(month.dateFrom, `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`);
  });

  it('a relative preset is recomputed after midnight, not frozen when the screen mounted', () => {
    mock.timers.enable({ apis: ['Date'], now: new Date(2026, 10, 7, 23, 59, 30) });
    try {
      const before = buildMovementsRequest('ALL', { preset: 'today', startDate: '', endDate: '' }, 10);
      assert.equal(before.dateFrom, '2026-11-07');
      mock.timers.setTime(new Date(2026, 10, 8, 0, 0, 30).getTime());
      const after = buildMovementsRequest('ALL', { preset: 'today', startDate: '', endDate: '' }, 10);
      assert.equal(after.dateFrom, '2026-11-08');
      assert.equal(after.dateTo, '2026-11-08');
    } finally {
      mock.timers.reset();
    }
  });
});

describe('purchases requests', () => {
  it('the invoices list sends the period to the backend with its limit', () => {
    assert.deepEqual(buildPurchasesRequest(ALL), { limit: PURCHASES_LOAD_LIMIT });
    assert.deepEqual(buildPurchasesRequest(custom('2026-10-01', '2026-10-31')), {
      limit: PURCHASES_LOAD_LIMIT,
      dateFrom: '2026-10-01',
      dateTo: '2026-10-31',
    });
  });

  it('the supplier statement sends the supplier and the period', () => {
    assert.deepEqual(buildSupplierTransactionsRequest('sup_1', custom('', '2026-10-31')), {
      supplierId: 'sup_1',
      limit: SUPPLIER_STATEMENT_LOAD_LIMIT,
      dateTo: '2026-10-31',
    });
  });
});

describe('expiry range (batches, return and write-off lists)', () => {
  const r = (startDate, endDate) => ({ startDate, endDate });

  it('is inactive without dates and then matches everything, even undated batches', () => {
    assert.equal(isExpiryRangeActive(EMPTY_EXPIRY_RANGE), false);
    assert.equal(matchesExpiryRange(null, EMPTY_EXPIRY_RANGE), true);
    assert.equal(matchesExpiryRange('2030-01-01', EMPTY_EXPIRY_RANGE), true);
  });

  it('includes both boundary days', () => {
    assert.equal(matchesExpiryRange('2026-11-01', r('2026-11-01', '2026-11-30')), true);
    assert.equal(matchesExpiryRange('2026-11-30', r('2026-11-01', '2026-11-30')), true);
    assert.equal(matchesExpiryRange('2026-10-31', r('2026-11-01', '2026-11-30')), false);
    assert.equal(matchesExpiryRange('2026-12-01', r('2026-11-01', '2026-11-30')), false);
  });

  it('works with only a start or only an end', () => {
    assert.equal(matchesExpiryRange('2027-05-05', r('2026-11-01', '')), true);
    assert.equal(matchesExpiryRange('2026-10-31', r('2026-11-01', '')), false);
    assert.equal(matchesExpiryRange('2026-01-01', r('', '2026-11-01')), true);
    assert.equal(matchesExpiryRange('2026-11-02', r('', '2026-11-01')), false);
  });

  it('reorders a swapped range', () => {
    assert.equal(matchesExpiryRange('2026-11-15', r('2026-11-30', '2026-11-01')), true);
  });

  it('an expiry date with a time part is compared by its calendar day, with no time-zone shift', () => {
    assert.equal(matchesExpiryRange('2026-11-30T00:00:00', r('2026-11-30', '2026-11-30')), true);
    assert.equal(matchesExpiryRange('2026-11-30 23:59:59', r('2026-11-30', '2026-11-30')), true);
  });

  it('undated batches never match an active range', () => {
    assert.equal(matchesExpiryRange(null, r('2026-11-01', '2026-11-30')), false);
    assert.equal(matchesExpiryRange('', r('2026-11-01', '2026-11-30')), false);
    assert.equal(matchesExpiryRange(undefined, r('', '2026-11-30')), false);
  });

  it('summary cards are computed from the rows given, with the same value the table shows', () => {
    const batches = [
      { quantityMilli: 2500, costPricePiasters: 1001, isExpired: true },
      { quantityMilli: 1000, costPricePiasters: 500, isExpiringSoon: true },
      { quantityMilli: 3000, costPricePiasters: 100 },
    ];
    assert.equal(batchValuePiasters(batches[0]), 2503);
    assert.deepEqual(summarizeBatches(batches), {
      activeCount: 3,
      expiringSoonCount: 1,
      expiringSoonValuePiasters: 500,
      expiredCount: 1,
      expiredValuePiasters: 2503,
      totalValuePiasters: 2503 + 500 + 300,
    });
    assert.deepEqual(summarizeBatches([]), {
      activeCount: 0,
      expiringSoonCount: 0,
      expiringSoonValuePiasters: 0,
      expiredCount: 0,
      expiredValuePiasters: 0,
      totalValuePiasters: 0,
    });
  });
});

describe('shortage dates (stored as UTC "yyyy-MM-dd HH:mm:ss")', () => {
  it('reads the space separated SQL timestamp as UTC', () => {
    assert.equal(shortageInstant('2026-11-06 23:30:00'), '2026-11-06T23:30:00Z');
    assert.equal(shortageInstant('2026-11-06 23:30:00.123'), '2026-11-06T23:30:00.123Z');
    assert.equal(shortageInstant('2026-11-06T23:30:00.000Z'), '2026-11-06T23:30:00.000Z');
    assert.equal(shortageInstant(''), null);
    assert.equal(shortageInstant(null), null);
  });

  it('the filter day is the local calendar day of that UTC instant', () => {
    const localDay = toLocalDateString(new Date('2026-11-06T23:30:00Z'));
    assert.equal(matchesShortageDay('2026-11-06 23:30:00', localDay, localDay), true);
    const dayBefore = toLocalDateString(new Date(new Date('2026-11-06T23:30:00Z').getTime() - 36 * 3600 * 1000));
    assert.equal(matchesShortageDay('2026-11-06 23:30:00', dayBefore, dayBefore), false);
  });

  it('both boundary days are included and an unreadable or missing date fails an active range', () => {
    const day = toLocalDateString(new Date('2026-11-06T12:00:00Z'));
    assert.equal(matchesShortageDay('2026-11-06 12:00:00', day, ''), true);
    assert.equal(matchesShortageDay('2026-11-06 12:00:00', '', day), true);
    assert.equal(matchesShortageDay('2026-11-06 12:00:00', '', ''), true);
    assert.equal(matchesShortageDay(null, day, day), false);
    assert.equal(matchesShortageDay('not a date', day, day), false);
    assert.equal(matchesShortageDay(null, '', ''), true);
  });

  it('the displayed date comes from the same UTC reading', () => {
    assert.equal(formatShortageDate(null), '-');
    assert.equal(formatShortageDate('garbage'), '-');
    assert.equal(formatShortageDate('2026-11-06 12:00:00'), new Date('2026-11-06T12:00:00Z').toLocaleDateString('ar-EG'));
  });
});

describe('products page filter reset covers the movements period', () => {
  it('a filter request resets the movements date filter to a fresh default', () => {
    const state = buildProductFilterState('lowStock');
    assert.deepEqual(state.movementDateFilter, { preset: 'all', startDate: '', endDate: '' });
    assert.notEqual(buildProductFilterState('all').movementDateFilter, buildProductFilterState('all').movementDateFilter);
  });

  it('ProductsView applies that reset and reloads movements from the new period', () => {
    const view = src('views/ProductsView.tsx');
    assert.match(view, /setMovementDateFilter\(reset\.movementDateFilter\)/);
    assert.match(view, /buildMovementsRequest\(movementTypeFilter, movementDateFilter, MOVEMENTS_LOAD_LIMIT\)/);
    assert.doesNotMatch(view, /limit: 250/);
  });

  it('the batches tab keeps its expiry range in its own state and remounts on a new request', () => {
    const view = src('views/ProductsView.tsx');
    assert.match(view, /<BatchesTab\s+key=\{handledFilterNonce\}/);
    assert.match(src('views/products/BatchesTab.tsx'), /useState<ExpiryRange>/);
  });
});

describe('every dated list uses the shared date filter control', () => {
  const sharedControl = /<DateFilterControl\b/;

  it('movement tab, product movement card, price history, invoices, supplier statement, shortages, write-off history', () => {
    for (const file of [
      'views/products/StockMovementsTab.tsx',
      'components/StockMovementsModal.tsx',
      'components/PriceHistoryModal.tsx',
      'views/purchases/PurchasesInvoicesTab.tsx',
      'views/purchases/SupplierStatementModal.tsx',
      'views/purchases/ShortagesTab.tsx',
      'components/ExpiryReturnsModal.tsx',
    ]) {
      assert.match(src(file), sharedControl, `${file} must render DateFilterControl`);
    }
  });

  it('expiry lists use the shared range picker (relative presets point at the past)', () => {
    assert.match(src('components/ExpiryRangeFilter.tsx'), /<CustomDateRangePicker\b/);
    assert.match(src('views/products/BatchesTab.tsx'), /<ExpiryRangeFilter\b/);
    const modal = src('components/ExpiryReturnsModal.tsx');
    assert.equal((modal.match(/<ExpiryRangeFilter\b/g) ?? []).length, 2);
  });

  it('capped lists never filter by date on the client', () => {
    for (const file of [
      'views/products/StockMovementsTab.tsx',
      'views/purchases/PurchasesInvoicesTab.tsx',
      'views/purchases/SupplierStatementModal.tsx',
    ]) {
      const text = src(file);
      assert.doesNotMatch(text, /useDateFilter\(/, `${file} must not filter a capped load client-side`);
      assert.doesNotMatch(text, /filterDate\(/);
    }
    const view = src('views/PurchasesView.tsx');
    assert.doesNotMatch(view, /limit: 150/);
    assert.doesNotMatch(view, /limit: 50 \}/);
    assert.match(view, /buildPurchasesRequest\(purchaseDateFilter\)/);
    assert.match(view, /buildSupplierTransactionsRequest\(statementSupplierId, statementDateFilter\)/);
  });

  it('the movement type pills no longer fire a second, stale reload', () => {
    const tab = src('views/products/StockMovementsTab.tsx');
    assert.doesNotMatch(tab, /setTimeout/);
    assert.doesNotMatch(tab, /onLoadMovements/);
  });

  it('invoice cards follow the rows on screen', () => {
    const tab = src('views/purchases/PurchasesInvoicesTab.tsx');
    assert.match(tab, /filteredPurchases\.reduce/);
    assert.match(tab, /filteredPurchases\.filter\(\(p\) => p\.paymentStatus === 'CREDIT'/);
  });

  it('shortage selection is cleared on any filter change so hidden rows are never converted', () => {
    const tab = src('views/purchases/ShortagesTab.tsx');
    assert.match(tab, /setSelectedIds\(\[\]\);\s*\}, \[searchQuery, statusFilter, urgencyFilter, sourceFilter, rangeStart, rangeEnd\]\)/);
  });

  it('write-off and return lists only submit rows inside the expiry range', () => {
    const modal = src('components/ExpiryReturnsModal.tsx');
    assert.match(modal, /visibleReturnableBatches\.filter\(b => selectedBatchesMap/);
    assert.match(modal, /visibleExpiredBatches\.filter\(b => selectedWriteOffMap/);
  });
});

describe('backend contract (source)', () => {
  it('each existing action accepts optional dateFrom/dateTo', () => {
    assert.match(csharp('Bridge/IpcDispatcher.Inventory.cs'), /pObj\["dateFrom"\][\s\S]*pObj\["dateTo"\]/);
    assert.match(csharp('Bridge/IpcDispatcher.Purchases.cs'), /getObj\["dateFrom"\][\s\S]*getObj\["dateTo"\]/);
    assert.match(csharp('Bridge/IpcDispatcher.Suppliers.cs'), /txObj\["dateFrom"\][\s\S]*txObj\["dateTo"\]/);
    assert.match(csharp('Bridge/IpcDispatcher.Products.cs'), /pHistObj\["dateFrom"\][\s\S]*pHistObj\["dateTo"\]/);
  });

  it('the repositories bind the range as parameters (half-open UTC bounds), never string-built SQL', () => {
    for (const file of [
      'Repositories/StockMovementRepository.cs',
      'Repositories/PurchaseRepository.cs',
      'Repositories/SupplierRepository.cs',
      'Repositories/ProductPriceHistoryRepository.cs',
    ]) {
      const text = csharp(file);
      assert.match(text, /LocalDateRange\.Parse\(dateFrom, dateTo\)/, file);
      assert.match(text, /@dayFrom/, file);
      assert.match(text, /@dayToExclusive/, file);
    }
  });
});
