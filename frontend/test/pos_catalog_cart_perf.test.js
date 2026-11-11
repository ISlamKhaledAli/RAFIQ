import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  POS_CATALOG_LIMIT,
  applyFreshProductFacts,
  collectProductIds,
  describeRemoteCatalogRequest,
  isCatalogTruncated,
  mergeProductsById,
  remoteCatalogKey,
} from '../src/views/pos/catalogLoad.ts';
import { isExactBarcodeCandidate } from '../src/views/pos/exactBarcode.ts';
import {
  POS_CART_DRAFT_AUTO_RESTORE_MS,
  POS_CART_DRAFT_KEY,
  clearPosCartDraft,
  decidePosCartDraftRestore,
  hasUnpaidPosCart,
  parsePosCartDraft,
  readPosCartDraftRestore,
  savePosCartDraft,
} from '../src/utils/posCartDraft.ts';
import { createFingerprintedAttemptKey } from '../src/utils/idempotency.ts';

const read = (...p) => fs.readFileSync(path.resolve(...p), 'utf8').replace(/\r\n/g, '\n');
const posView = read('src', 'views', 'PosView.tsx');
const catalogHook = read('src', 'views', 'pos', 'usePosCatalog.ts');
const products = read('..', 'desktop', 'Repositories', 'ProductRepository.cs');
const productsIpc = read('..', 'desktop', 'Bridge', 'IpcDispatcher.Products.cs');

const product = (id, extra = {}) => ({ id, name: `p${id}`, pricePiasters: 100, costPiasters: 50, stockQuantityMilli: 5000, ...extra });
const cartItem = (id) => ({ productId: id, productName: `p${id}`, quantityMilli: 1000, unitPricePiasters: 100, totalPiasters: 100 });

describe('POS exact barcode scan path', () => {
  it('only barcode-shaped text goes through the indexed lookup', () => {
    assert.equal(isExactBarcodeCandidate('6221234567890'), true);
    assert.equal(isExactBarcodeCandidate('ABC-123/4'), true);
    assert.equal(isExactBarcodeCandidate('  6221234567890  '), true);
    assert.equal(isExactBarcodeCandidate('لبن جهينة'), false);
    assert.equal(isExactBarcodeCandidate('شاي'), false);
    assert.equal(isExactBarcodeCandidate('milk 1l'), false);
    assert.equal(isExactBarcodeCandidate(''), false);
    assert.equal(isExactBarcodeCandidate('9'.repeat(65)), false);
  });

  it('PosView resolves scans with the exact lookup first and skips the LIKE search for scale labels', () => {
    assert.match(posView, /'products:getByExactBarcode'/);
    const fast = posView.slice(posView.indexOf('const handleFastBarcodeScan'), posView.indexOf('const handleSearchKeyDown'));
    assert.ok(fast.indexOf('findProductsByExactBarcode(scannedBarcode)') < fast.indexOf("'products:search', { query: scannedBarcode"));
    assert.match(fast, /results\.length === 0 && !scaleInfo/);
    const submit = posView.slice(posView.indexOf('const handleBarcodeSubmit'), posView.indexOf('const handleConfirmWeight'));
    assert.match(submit, /findProductsByExactBarcode\(query\)/);
    assert.match(submit, /hasArabicLetters \|\| !scaleInfo/);
  });

  it('the host exposes the lookup as equality unions on the three indexed barcode columns', () => {
    assert.match(productsIpc, /case "products:getByExactBarcode":/);
    // the SQL text lives in BuildExactBarcodeSql (extracted so the plan-shape test can read it), which sits right before GetByExactBarcode
    const method = products.slice(products.indexOf('internal static string BuildExactBarcodeSql'), products.indexOf('public Product GetOwnerOfBarcode(string barcode)'));
    assert.match(method, /FROM products WHERE barcode = @bc/);
    assert.match(method, /FROM product_barcodes WHERE barcode = @bc/);
    assert.match(method, /FROM product_units WHERE barcode = @bc/);
    assert.match(method, /p\.is_active = 1/);
    assert.ok(!/LIKE/.test(method.replace(/\/\/.*$/gm, '')), 'exact lookup never uses LIKE');
  });

  it('search callers that only need rows skip the three count scans', () => {
    assert.match(productsIpc, /includeCounts/);
    assert.match(posView, /limit: LIVE_SEARCH_LIMIT, includeCounts: false/);
  });
});

describe('POS bounded catalogue', () => {
  it('loads a bounded set and detects when the host holds more', () => {
    assert.ok(POS_CATALOG_LIMIT >= 100 && POS_CATALOG_LIMIT <= 1000);
    assert.match(posView, /'products:getSmartCatalog', \{ limit: POS_CATALOG_LIMIT \}/);
    assert.ok(!/limit: 50000/.test(posView), 'the POS never asks for the whole catalogue');
    assert.equal(isCatalogTruncated(300, 5000), true);
    assert.equal(isCatalogTruncated(300, 300), false);
    assert.equal(isCatalogTruncated(120, 120), false);
    assert.equal(isCatalogTruncated(300, undefined), false);
  });

  it('a large catalogue answers a search or an opened section from the host, never popular/custom tabs', () => {
    const cats = [{ id: 'c1', name: 'ألبان' }];
    assert.equal(describeRemoteCatalogRequest(false, '__ALL__', 'لبن', cats), null);
    assert.equal(describeRemoteCatalogRequest(true, '__POPULAR__', 'لبن', cats), null);
    assert.equal(describeRemoteCatalogRequest(true, '__CUSTOM__', 'لبن', cats), null);
    assert.equal(describeRemoteCatalogRequest(true, '__ALL__', 'ل', cats), null, 'one character is answered locally');
    const search = describeRemoteCatalogRequest(true, '__ALL__', '  لبن ', cats);
    assert.deepEqual({ query: search.query, categoryId: search.categoryId }, { query: 'لبن', categoryId: 'all' });
    const sectionSearch = describeRemoteCatalogRequest(true, 'ألبان', 'جهينة', cats);
    assert.equal(sectionSearch.categoryId, 'c1');
    const section = describeRemoteCatalogRequest(true, 'c1', '', cats);
    assert.deepEqual({ query: section.query, categoryId: section.categoryId }, { query: '', categoryId: 'c1' });
    assert.equal(describeRemoteCatalogRequest(true, 'unknown-section', '', cats), null);
    assert.equal(section.key, remoteCatalogKey('c1', ''));
  });

  it('merging keeps loaded rows and appends only new products', () => {
    const merged = mergeProductsById([product('a', { salesCount: 9 })], [product('a', { salesCount: 0 }), product('b')]);
    assert.deepEqual(merged.map((p) => p.id), ['a', 'b']);
    assert.equal(merged[0].salesCount, 9);
  });

  it('after a sale only stock and price of the sold products are refreshed', () => {
    const base = [product('a', { salesCount: 7, nearestExpiryDate: '2027-01-01' }), product('b')];
    const next = applyFreshProductFacts(base, [product('a', { stockQuantityMilli: 1000, pricePiasters: 120 })]);
    assert.equal(next[0].stockQuantityMilli, 1000);
    assert.equal(next[0].pricePiasters, 120);
    assert.equal(next[0].salesCount, 7);
    assert.equal(next[0].nearestExpiryDate, '2027-01-01');
    assert.equal(next[1], base[1]);
    assert.deepEqual(collectProductIds([{ productId: 'a' }, { productId: 'a' }, { productId: '' }, {}]), ['a']);
  });

  it('PosView does not reload the whole catalogue for its own sale', () => {
    const confirm = posView.slice(posView.indexOf('const handleConfirmPayment'), posView.indexOf('const setDirectQuantity'));
    assert.match(confirm, /refreshSoldProducts\(collectProductIds\(cart\)\)/);
    assert.ok(!/void loadSmartCatalog\(\)/.test(confirm));
    assert.match(confirm, /ownSaleRefreshRef\.current\.active = true/);
    assert.match(posView, /if \(ownSaleRefreshRef\.current\.active\)/);
  });

  it('nothing silently depends on the full catalogue: held recall, weight lines and bundles read missing products by id', () => {
    assert.match(posView, /isCatalogLimited\s*\?\s*await lookupProductsByIds\(collectProductIds\(itemsToRestore\)\)/);
    assert.match(posView, /await lookupProductsByIds\(\[weightModalProduct\.id\]\)/);
    assert.match(catalogHook, /resolveProductsByIds\(missingIds\)/);
    assert.match(posView, /categoryProductCounts[\s\S]{0,200}if \(isCatalogLimited\) return counts/);
  });
});

describe('POS cart draft autosave', () => {
  let store;
  beforeEach(() => {
    store = new Map();
    globalThis.localStorage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => { store.set(k, String(v)); },
      removeItem: (k) => { store.delete(k); },
    };
  });

  it('saves the cart, discount and customer but never an idempotency key', () => {
    savePosCartDraft([cartItem('a')], 250, 'cust-1');
    const raw = store.get(POS_CART_DRAFT_KEY);
    const draft = JSON.parse(raw);
    assert.equal(draft.items.length, 1);
    assert.equal(draft.discountPiasters, 250);
    assert.equal(draft.customerId, 'cust-1');
    assert.ok(typeof draft.savedAt === 'number');
    assert.ok(!/idempotency/i.test(raw));
    assert.equal(hasUnpaidPosCart(), true);
  });

  it('an empty cart removes the draft and clear removes it too', () => {
    savePosCartDraft([cartItem('a')], 0, null);
    savePosCartDraft([], 0, null);
    assert.equal(store.has(POS_CART_DRAFT_KEY), false);
    savePosCartDraft([cartItem('a')], 0, null);
    clearPosCartDraft();
    assert.equal(store.has(POS_CART_DRAFT_KEY), false);
    assert.equal(hasUnpaidPosCart(), false);
  });

  it('a fresh draft of the same cashier is restored by itself, others are only offered, garbage is ignored', () => {
    const now = 1_000_000_000;
    const fresh = { items: [cartItem('a')], discountPiasters: 0, customerId: null, savedAt: now - 60_000, userId: 'u1' };
    const old = { ...fresh, savedAt: now - POS_CART_DRAFT_AUTO_RESTORE_MS - 1 };
    assert.equal(decidePosCartDraftRestore(parsePosCartDraft(JSON.stringify(fresh)), now, 'u1').mode, 'auto');
    assert.equal(decidePosCartDraftRestore(parsePosCartDraft(JSON.stringify(old)), now, 'u1').mode, 'prompt');
    assert.equal(decidePosCartDraftRestore(parsePosCartDraft(JSON.stringify(fresh)), now, 'u2').mode, 'prompt', 'another cashier is only offered it');
    assert.equal(decidePosCartDraftRestore(parsePosCartDraft(JSON.stringify({ ...fresh, userId: undefined })), now, 'u1').mode, 'prompt', 'a draft without an owner is only offered');
    assert.equal(decidePosCartDraftRestore(null, now, 'u1').mode, 'none');
    assert.equal(parsePosCartDraft('not json'), null);
    assert.equal(parsePosCartDraft(JSON.stringify({ items: [] })), null);
    assert.equal(parsePosCartDraft(JSON.stringify({ items: [{ productId: 1 }] })), null);
    store.set(POS_CART_DRAFT_KEY, '{broken');
    assert.equal(readPosCartDraftRestore('u1').mode, 'none');
  });

  it('PosView debounces the save, restores at mount with an Arabic notice and keeps an undecided draft', () => {
    assert.match(posView, /setTimeout\(\(\) => \{\s*savePosCartDraft\(cart, discountPiasters, selectedCustomerId \|\| null, currentUserId\);\s*\}, POS_CART_DRAFT_SAVE_DEBOUNCE_MS\)/);
    assert.match(posView, /تم استرجاع الفاتورة الجارية/);
    assert.match(posView, /if \(!draftPendingPromptRef\.current\) clearPosCartDraft\(\)/);
    assert.match(posView, /addEventListener\('pagehide'/);
  });
});

describe('sale idempotency key follows the request content', () => {
  it('keeps the key for an identical retry and rotates it when the cart or payments change', () => {
    const attempt = createFingerprintedAttemptKey('sale');
    const first = attempt.keyFor('cart-1|paid-100');
    assert.match(first, /^sale_/);
    assert.equal(attempt.keyFor('cart-1|paid-100'), first, 'pure retry keeps the key');
    const changed = attempt.keyFor('cart-2|paid-100');
    assert.notEqual(changed, first, 'changed cart gets a new key');
    assert.notEqual(attempt.keyFor('cart-2|paid-200'), changed, 'changed payment gets a new key');
  });

  it('reset (after success or clear) always starts a new key even for the same content', () => {
    const attempt = createFingerprintedAttemptKey('sale');
    const first = attempt.keyFor('same');
    attempt.reset();
    assert.notEqual(attempt.keyFor('same'), first);
  });

  it('PosView builds the key from the whole request except the key and the supervisor PIN', () => {
    assert.match(posView, /saleAttemptRef\.current\.keyFor\(\s*JSON\.stringify\(\{ \.\.\.salePayload, idempotencyKey: undefined, supervisorPin: undefined \}\)/);
    assert.match(posView, /isIdempotencyMismatchError\(err\)\) saleAttemptRef\.current\.reset\(\)/);
    assert.ok(!/cartSessionIdRef/.test(posView));
  });
});

describe('POS cart updaters are pure', () => {
  it('no setCart updater edits a cart line in place', () => {
    assert.ok(!/\n\s+item\.(quantityMilli|unitPricePiasters|totalPiasters|taxPiasters|unitId|batchId|discountPiasters) = /.test(posView));
    assert.ok(!/\n\s+it\.discountPiasters = /.test(posView));
  });
});
