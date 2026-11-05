import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LIVE_SEARCH_LIMIT,
  createRequestGate,
  describeSearchRow,
  isBarcodeLikeQuery,
  pickDropdownProduct,
  shouldRunLiveSearch,
} from '../src/views/pos/liveSearch.ts';
import { resolveDefaultSaleUnit } from '../src/views/pos/saleUnit.ts';
import { POPULAR_ITEMS_LIMIT, POPULAR_WINDOW_DAYS, pickPopularItems } from '../src/views/pos/popularItems.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
// Sources may be checked out with CRLF on Windows; the multi-line markers below use LF
const read = (...parts) => readFileSync(join(ROOT, ...parts), 'utf8').replace(/\r\n/g, '\n');
const posView = read('frontend', 'src', 'views', 'PosView.tsx');
const barcodeBar = read('frontend', 'src', 'views', 'pos', 'PosBarcodeBar.tsx');
const checkoutBar = read('frontend', 'src', 'views', 'pos', 'PosCartCheckoutBar.tsx');
const categoriesPanel = read('frontend', 'src', 'views', 'pos', 'PosCategoriesPanel.tsx');
const catalogHook = read('frontend', 'src', 'views', 'pos', 'usePosCatalog.ts');
const productRepo = read('desktop', 'Repositories', 'ProductRepository.cs');

const product = (over = {}) => ({
  id: 'p', name: 'صنف', barcode: null, pricePiasters: 1000, costPiasters: 500,
  stockQuantityMilli: 12000, unit: 'piece', taxRatePercent: 0, isActive: true, ...over,
});

const slice = (src, from, to) => {
  const a = src.indexOf(from);
  assert.notEqual(a, -1, `missing: ${from}`);
  const b = src.indexOf(to, a);
  assert.notEqual(b, -1, `missing end: ${to}`);
  return src.slice(a, b);
};

describe('POS item 1: barcode scan vs live search dropdown', () => {
  it('treats long digit runs as barcodes and skips the live search for them', () => {
    assert.equal(isBarcodeLikeQuery('6221234567890'), true);
    assert.equal(isBarcodeLikeQuery(' 123456 '), true);
    assert.equal(isBarcodeLikeQuery('12345'), false);
    assert.equal(isBarcodeLikeQuery('لبن 123456'), false);
    assert.equal(shouldRunLiveSearch('6221234567890'), false);
    assert.equal(shouldRunLiveSearch('لب'), true);
    assert.equal(shouldRunLiveSearch('ل'), false);
    assert.equal(shouldRunLiveSearch('   '), false);
    assert.equal(shouldRunLiveSearch('لبن'), true);
  });

  it('a response that arrives after the query changed or was cleared is dropped (scan reproduction)', async () => {
    const gate = createRequestGate();
    const dropdown = { open: false, results: [] };
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const liveSearch = async (results, latencyMs) => {
      const id = gate.begin();
      await sleep(latencyMs);
      if (!gate.isCurrent(id)) return;
      dropdown.results = results;
      dropdown.open = results.length > 0;
    };

    const inFlight = liveSearch([product()], 20);
    gate.invalidate(); // Enter added the item and cleared the query
    await inFlight;
    assert.equal(dropdown.open, false);
    assert.deepEqual(dropdown.results, []);

    // A newer request supersedes an older one even when the older answers last
    const slow = liveSearch([product({ id: 'old' })], 30);
    const fast = liveSearch([product({ id: 'new' })], 5);
    await Promise.all([slow, fast]);
    assert.equal(dropdown.results[0].id, 'new');
  });

  it('PosView applies live-search answers only while they are the newest request', () => {
    const effect = slice(posView, 'Debounced live name search', 'Close live search dropdown when clicking outside');
    assert.match(effect, /shouldRunLiveSearch\(q\)/);
    assert.match(effect, /liveSearchGate\.begin\(\)/);
    assert.match(effect, /if \(!liveSearchGate\.isCurrent\(requestId\)\) return;/);
    assert.match(effect, /finally \{\s*if \(liveSearchGate\.isCurrent\(requestId\)\) setIsSearching\(false\);/);
    assert.match(effect, /return \(\) => \{\s*clearTimeout\(timer\);\s*liveSearchGate\.invalidate\(\);/);
    // an empty / barcode-like query closes the dropdown instead of ever reopening it
    const skipBranch = slice(effect, 'if (!shouldRunLiveSearch(q))', 'const requestId');
    assert.match(skipBranch, /setIsSearchDropdownOpen\(false\)/);
    assert.match(skipBranch, /setIsSearching\(false\)/);
    assert.match(effect, /limit: LIVE_SEARCH_LIMIT/);
    assert.equal(LIVE_SEARCH_LIMIT, 8);
  });

  it('a scan or Escape drops any in-flight search before resolving the barcode', () => {
    assert.match(slice(posView, 'const handleFastBarcodeScan', 'setLoading(true)'), /dismissLiveSearch\(\);/);
    assert.match(slice(posView, "e.key === 'Escape'", '};'), /dismissLiveSearch\(\)/);
    assert.match(slice(posView, 'const dismissLiveSearch', '}, [liveSearchGate]);'), /liveSearchGate\.invalidate\(\)/);
  });

  it('Enter: an exact barcode match always wins over the highlighted row', () => {
    const highlighted = product({ id: 'a', name: 'أ', barcode: '111' });
    const exact = product({ id: 'b', name: 'ب', barcode: '6221234567890' });
    const pick = pickDropdownProduct({
      results: [highlighted, exact], isOpen: true, resultsQuery: 'x', currentQuery: 'x',
      submitted: '6221234567890', selectedIndex: 0,
    });
    assert.equal(pick.product.id, 'b');

    const byUnit = product({ id: 'c', units: [{ unitName: 'كرتونة', conversionFactor: 12, isBaseUnit: false, sellPricePiasters: 1, barcode: '999', costPricePiasters: 1, isDivisible: false, sortOrder: 1 }] });
    const unitPick = pickDropdownProduct({ results: [highlighted, byUnit], isOpen: true, resultsQuery: 'x', currentQuery: 'x', submitted: '999', selectedIndex: 0 });
    assert.equal(unitPick.product.id, 'c');
    assert.equal(unitPick.unit.unitName, 'كرتونة');
  });

  it('Enter: the highlighted row is used only when the open dropdown answers what is typed now', () => {
    const rows = [product({ id: 'a' }), product({ id: 'b' }), product({ id: 'c' })];
    const base = { results: rows, isOpen: true, resultsQuery: 'لبن', currentQuery: 'لبن', submitted: 'fdf', selectedIndex: 2 };
    assert.equal(pickDropdownProduct(base).product.id, 'c');
    assert.equal(pickDropdownProduct({ ...base, isOpen: false }), null);
    assert.equal(pickDropdownProduct({ ...base, currentQuery: 'لبن جهينة' }), null);
    assert.equal(pickDropdownProduct({ ...base, results: [] }), null);
    assert.equal(pickDropdownProduct({ ...base, selectedIndex: 7 }), null);
  });

  it('handleBarcodeSubmit uses the shared pick, ends with focus on the input and no dropdown fallback after a failed search', () => {
    const submit = slice(posView, 'const handleBarcodeSubmit', 'const handleConfirmWeight');
    assert.match(submit, /pickDropdownProduct\(\{/);
    assert.match(submit, /barcodeInputRef\.current\?\.focus\(\);\s*return;/);
    assert.match(submit, /finally \{\s*setLoading\(false\);\s*barcodeInputRef\.current\?\.focus\(\);/);
    assert.doesNotMatch(submit, /Fallback to dropdown selection/);
  });

  it('shortcuts and the dropdown never block selling: no stuck shift-modal flag, dropdown is not a modal', () => {
    assert.doesNotMatch(posView, /setIsShiftModalOpen\(true\)\s*;\s*\n\s*return;/);
    assert.match(posView, /new CustomEvent\('rafiq:open-shift-modal'\)/);
    const modalFlags = slice(posView, 'const isAnyModalOpen', 'modifierModalState !== null');
    assert.doesNotMatch(modalFlags, /isSearchDropdownOpen/);
  });
});

describe('POS item 2: name-search dropdown rows show only what the cashier needs', () => {
  it('shows the default sale unit price, the unit label only for non-base units, and stock with its unit', () => {
    const info = describeSearchRow(product({
      pricePiasters: 1000, stockQuantityMilli: 45000, minStockQuantityMilli: 10000,
      units: [
        { id: 'u1', unitName: 'قطعة', conversionFactor: 1, isBaseUnit: true, sellPricePiasters: 1000, costPricePiasters: 500, isDivisible: false, sortOrder: 0 },
        { id: 'u2', unitName: 'كرتونة', conversionFactor: 12, isBaseUnit: false, sellPricePiasters: 11000, costPricePiasters: 6000, isDivisible: false, sortOrder: 1 },
      ],
    }));
    assert.equal(info.pricePiasters, 1000);
    assert.equal(info.priceUnitName, null);
    assert.equal(info.stockText, '45 قطعة');
    assert.equal(info.stockState, 'ok');

    const carton = describeSearchRow(product({
      defaultSaleUnitId: 'u2', isLooseSellable: false, stockQuantityMilli: 3500,
      units: [
        { id: 'u1', unitName: 'قطعة', conversionFactor: 1, isBaseUnit: true, sellPricePiasters: 1000, costPricePiasters: 500, isDivisible: false, sortOrder: 0 },
        { id: 'u2', unitName: 'كرتونة', conversionFactor: 12, isBaseUnit: false, sellPricePiasters: 11000, costPricePiasters: 6000, isDivisible: false, sortOrder: 1 },
      ],
    }));
    assert.equal(carton.pricePiasters, 11000);
    assert.equal(carton.priceUnitName, 'كرتونة');
    assert.equal(carton.stockState, 'low');
  });

  it('uses kg for weighed items, trims decimals, flags out-of-stock and variants', () => {
    assert.equal(describeSearchRow(product({ unit: 'kg', stockQuantityMilli: 2500 })).stockText, '2.5 كجم');
    const out = describeSearchRow(product({ stockQuantityMilli: 0, hasVariants: true }));
    assert.equal(out.stockState, 'out');
    assert.equal(out.stockText, 'نفد');
    assert.equal(out.hasVariants, true);
    assert.equal(describeSearchRow(product({ pricePiasters: 777, units: [{ id: 'u', unitName: 'قطعة', conversionFactor: 1, isBaseUnit: true, sellPricePiasters: 0, costPricePiasters: 0, isDivisible: false, sortOrder: 0 }] })).pricePiasters, 777);
  });

  it('the default sale unit rule is shared with the catalog tile', () => {
    const units = [
      { id: 'b', unitName: 'قطعة', conversionFactor: 1, isBaseUnit: true, sellPricePiasters: 1, costPricePiasters: 1, isDivisible: false, sortOrder: 0 },
      { id: 'c', unitName: 'علبة', conversionFactor: 6, isBaseUnit: false, sellPricePiasters: 6, costPricePiasters: 6, isDivisible: false, sortOrder: 1 },
      { id: 'd', unitName: 'كرتونة', conversionFactor: 24, isBaseUnit: false, sellPricePiasters: 24, costPricePiasters: 24, isDivisible: false, sortOrder: 2 },
    ];
    assert.equal(resolveDefaultSaleUnit(units).id, 'b');
    assert.equal(resolveDefaultSaleUnit(units, 'c').id, 'c');
    assert.equal(resolveDefaultSaleUnit(units, null, false).id, 'd');
    assert.equal(resolveDefaultSaleUnit(units, 'missing').id, 'b');
    assert.equal(resolveDefaultSaleUnit([], 'c'), null);
    assert.equal(resolveDefaultSaleUnit(undefined), null);
    assert.match(catalogHook, /resolveDefaultSaleUnit\(p\.units, p\.defaultSaleUnitId, p\.isLooseSellable\)/);
  });

  it('PosBarcodeBar rows drop barcodes, codes, locations, cold-chain, scientific names, cost, badges and the unit shelf', () => {
    for (const forbidden of ['prod.barcode', 'internalCode', 'locationCode', 'isColdChain', 'Snowflake', 'scientificName', 'dosageFormName', 'costPiasters', 'sky-', 'cyan-', 'الوحدات:', 'onSelectProduct(prod, ']) {
      assert.equal(barcodeBar.includes(forbidden), false, `row must not contain ${forbidden}`);
    }
    assert.match(barcodeBar, /min-h-11/);
    assert.match(barcodeBar, /describeSearchRow\(prod\)/);
    assert.match(barcodeBar, /bg-paid-soft\/80 dark:bg-surface-dark-3/);
    assert.match(barcodeBar, /dark:text-ink-dark-muted/);
    assert.doesNotMatch(barcodeBar, /overflow-x-(auto|scroll)/);
  });
});

describe('POS item 3: unregistered barcode clears the input before the add-product modal opens', () => {
  it('both not-found branches clear the query and the dropdown first and still hand the barcode to the modal', () => {
    const scan = slice(posView, 'const handleFastBarcodeScan', '}, [addProductToCart, showStatus, catalogProducts');
    const scanNotFound = slice(scan, '} else {\n        setBarcodeQuery', 'showStatus(`الباركود الممسوح');
    assert.ok(scanNotFound.indexOf("setBarcodeQuery('')") < scanNotFound.indexOf('setIsQuickAddModalOpen(true)'));
    assert.match(scanNotFound, /dismissLiveSearch\(\)/);
    assert.match(scanNotFound, /setUnregisteredBarcode\(scannedBarcode\)/);

    const submit = slice(posView, 'const handleBarcodeSubmit', 'const handleConfirmWeight');
    const firstOpen = submit.indexOf('setIsQuickAddModalOpen(true)');
    const clearAt = submit.indexOf("setBarcodeQuery('');\n        dismissLiveSearch();\n\n        if (matchedDrugRef)");
    assert.ok(clearAt > -1 && clearAt < firstOpen);
    assert.equal((submit.match(/setUnregisteredBarcode\(query\)/g) || []).length, 2);
  });

  it('a name that matches nothing does not open add-product with a garbled barcode', () => {
    const submit = slice(posView, 'const handleBarcodeSubmit', 'const handleConfirmWeight');
    assert.match(submit, /else if \(hasArabicLetters\) \{[^}]*لا يوجد صنف باسم/);
  });

  it('cancelling the modal returns focus to the (empty) input', () => {
    const close = slice(posView, '<QuickAddProductModal', 'onProductCreated');
    assert.match(close, /setUnregisteredBarcode\(''\);[\s\S]*barcodeInputRef\.current\?\.focus\(\);/);
  });
});

describe('POS item 10: catalog and sections reload when products/categories change or the cashier view returns', () => {
  it('subscribes to products, categories and all with one debounced refresh of both lists', () => {
    assert.match(posView, /useDataSubscription\(\['products', 'categories', 'all'\], scheduleCatalogRefresh\)/);
    const schedule = slice(posView, 'const scheduleCatalogRefresh', 'useDataSubscription([\'products\'');
    assert.match(schedule, /if \(!isActiveRef\.current\) return;/);
    assert.match(schedule, /loadCategories\(\);\s*void loadSmartCatalog\(\);/);
    assert.match(schedule, /CATALOG_REFRESH_DEBOUNCE_MS/);
  });

  it('reloads on the hidden to visible transition and ignores out-of-order catalog answers', () => {
    const activation = slice(posView, 'const wasActive = isActiveRef.current;', '}, [isActive, loadCategories, loadSmartCatalog]);');
    assert.match(activation, /if \(isActive && !wasActive\)/);
    assert.match(posView, /const seq = \+\+catalogLoadSeqRef\.current;/);
    assert.match(posView, /if \(seq !== catalogLoadSeqRef\.current\) return;/);
  });
});

describe('POS item 11: no open shift is unmissable and actionable', () => {
  it('PosView blocks only when the setting is on, no open shift, and tells the cashier with one message everywhere', () => {
    assert.match(posView, /const SHIFT_REQUIRED_MESSAGE = 'لازم تفتح وردية قبل البيع'/);
    assert.equal((posView.match(/requireOpenShiftToSell && !hasOpenShift\) \{\s*notifyShiftRequired\(\);/g) || []).length, 3);
    assert.doesNotMatch(posView, /لا يمكن إتمام البيع قبل فتح وردية رسمية/);
    assert.match(posView, /isAdmin \|\| hasPermission\('shifts\.open'\)/);
    assert.match(posView, /requireOpenShiftToSell && isShiftStatusKnown && !hasOpenShift/);
  });

  it('the checkout bar shows the banner with an open-shift button for permitted users and disables every payment button', () => {
    assert.match(checkoutBar, /role="alert"/);
    assert.match(checkoutBar, /shiftBlock\.message/);
    assert.match(checkoutBar, /\{shiftBlock\.canOpenShift && \(/);
    assert.match(checkoutBar, />\s*فتح وردية\s*</);
    assert.ok((checkoutBar.match(/Boolean\(shiftBlock\)/g) || []).length >= 4);
    assert.match(checkoutBar, /onClick=\{notice\.onBlockedAttempt\}/);
    assert.match(checkoutBar, /dark:bg-warn-dark-soft/);
    assert.match(checkoutBar, /dark:text-ink-dark/);
  });
});

describe('POS item 12: the "most requested" list is bounded, ordered and honest', () => {
  const item = (name, salesCount, createdAt) => ({ name, salesCount, productRef: createdAt ? { createdAt } : undefined });

  it('is capped, ordered by units sold then name, and ignores unsold items', () => {
    const items = [];
    for (let i = 0; i < 40; i += 1) items.push(item(`صنف ${String(i).padStart(2, '0')}`, 40 - i, '2026-01-01T00:00:00Z'));
    items.push(item('لم يُبع', 0, '2026-02-01T00:00:00Z'));
    const { items: top, isFallback } = pickPopularItems(items);
    assert.equal(isFallback, false);
    assert.equal(top.length, POPULAR_ITEMS_LIMIT);
    assert.equal(top[0].salesCount, 40);
    assert.ok(top.every((it, idx) => idx === 0 || top[idx - 1].salesCount >= it.salesCount));
    assert.ok(top.every((it) => it.salesCount > 0));
  });

  it('breaks ties by name', () => {
    const { items } = pickPopularItems([item('ب', 5), item('أ', 5), item('ج', 9)]);
    assert.deepEqual(items.map((i) => i.name), ['ج', 'أ', 'ب']);
  });

  it('falls back to the newest products for a store without sales and says so', () => {
    const { items, isFallback } = pickPopularItems([
      item('قديم', 0, '2026-01-01T00:00:00Z'),
      item('جديد', 0, '2026-03-01T00:00:00Z'),
      item('أوسط', 0, '2026-02-01T00:00:00Z'),
      item('زر سريع بدون صنف', 0),
    ]);
    assert.equal(isFallback, true);
    assert.deepEqual(items.map((i) => i.name), ['جديد', 'أوسط', 'قديم']);
    assert.deepEqual(pickPopularItems([]), { items: [], isFallback: true });
  });

  it('the badge counts what the tab shows and the card says what it is', () => {
    assert.match(catalogHook, /const popularItemsCount = popularSelection\.items\.length;/);
    assert.doesNotMatch(categoriesPanel, /popularItemsCount > 99/);
    assert.match(categoriesPanel, /POPULAR_WINDOW_DAYS/);
    assert.equal(POPULAR_WINDOW_DAYS, 30);
  });

  it('the host counts base units sold in the last 30 days, excluding cancelled/refunded sales, with a parameterised sargable filter', () => {
    const smart = slice(productRepo, 'public List<Product> GetSmartCatalog', 'public int GetTotalCount');
    assert.match(productRepo, /private const int PopularWindowDays = 30;/);
    assert.match(smart, /SUM\(si\.quantity_milli \* COALESCE\(NULLIF\(si\.conversion_factor, 0\), 1\)\)/);
    assert.match(smart, /sa\.created_at >= @popularSince/);
    assert.match(smart, /sa\.status IN \('completed', 'partially_refunded'\)/);
    assert.match(smart, /AddWithValue\("@popularSince", DateTime\.UtcNow\.AddDays\(-PopularWindowDays\)\.ToString\("o"\)\)/);
    assert.doesNotMatch(smart, /LIMIT 300/);
    assert.doesNotMatch(smart, /date\(sa\.created_at\)/);
  });
});
