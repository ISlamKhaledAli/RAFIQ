import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { isSameUserSnapshot, reconcileUser, stableStringify } from '../src/utils/userSnapshot.ts';
import { getAutoTopicsForAction } from '../src/bridge/ipc.ts';
import {
  applyCurrentPrices,
  currentCatalogUnitPrice,
  findHeldPriceChanges,
  isLegacyHeldCart,
  keepHeldPricesRequiresApproval,
  resolveBaseSellPrice,
  resolveHeldInvoiceDiscount,
  resolveUnitSellPrice,
  serializeHeldCart,
  stripHeldCartMarker,
} from '../src/views/pos/heldSalePricing.ts';
import { netSalesSharePercents, sortByProfit } from '../src/views/analytics/profitabilityDisplay.ts';
import { buildCashQuickPresetsPiasters, piastersToInputText } from '../src/components/payment/cashPresets.ts';
import { poundsToPiasters } from '../src/utils/money.ts';

const SRC = new URL('../src/', import.meta.url).pathname;
const readSrc = (rel) => readFileSync(join(SRC, rel), 'utf8');

const cashierUser = () => ({
  id: 'u-1',
  username: 'cashier1',
  displayName: 'Cashier',
  role: 'cashier',
  isActive: true,
  permissions: { 'pos.sell': true, 'pos.hold_invoice': true },
});

describe('Defect 1: idle refresh loop (auth:getCurrentUser -> setCurrentUser -> effects)', () => {
  it('reconcileUser keeps the previous reference when the server returns identical data in a new object', () => {
    const prev = cashierUser();
    const fresh = JSON.parse(JSON.stringify({ ...cashierUser(), permissions: { 'pos.hold_invoice': true, 'pos.sell': true } }));
    assert.notEqual(prev, fresh);
    assert.equal(reconcileUser(prev, fresh), prev);
  });

  it('reconcileUser returns the new user on real changes (permission, role, mustChangePin, login/logout)', () => {
    const prev = cashierUser();
    const revoked = { ...cashierUser(), permissions: { 'pos.sell': true, 'pos.hold_invoice': false } };
    assert.equal(reconcileUser(prev, revoked), revoked);
    const promoted = { ...cashierUser(), role: 'admin' };
    assert.equal(reconcileUser(prev, promoted), promoted);
    const forced = { ...cashierUser(), mustChangePin: true };
    assert.equal(reconcileUser(prev, forced), forced);
    assert.equal(reconcileUser(prev, null), null);
    const loggedIn = cashierUser();
    assert.equal(reconcileUser(null, loggedIn), loggedIn);
    assert.equal(reconcileUser({ ...cashierUser(), id: 'u-2' }, prev), prev);
  });

  it('stableStringify is key-order independent and ignores undefined fields', () => {
    assert.equal(stableStringify({ b: 1, a: { d: [1, 2], c: null } }), stableStringify({ a: { c: null, d: [1, 2] }, b: 1 }));
    assert.equal(isSameUserSnapshot({ id: 'x', parentId: undefined }, { id: 'x' }), true);
    assert.equal(isSameUserSnapshot({ id: 'x', permissions: { a: true } }, { id: 'x', permissions: { a: false } }), false);
  });

  // Drives the App refresh cycle (effect keyed on the user -> refreshSettings -> refreshUser -> setState)
  // with the real reconcile function and counts IPC calls over simulated renders.
  function simulateIdleRefreshCycle(reconcile, maxRenders = 200) {
    const calls = new Map();
    const invoke = (action) => {
      calls.set(action, (calls.get(action) || 0) + 1);
      if (action === 'auth:getCurrentUser') return JSON.parse(JSON.stringify(cashierUser()));
      return {};
    };
    let currentUser = cashierUser();
    let lastDep;
    let renders = 0;
    let dirty = true;
    while (dirty && renders < maxRenders) {
      renders++;
      dirty = false;
      if (currentUser !== lastDep) {
        lastDep = currentUser;
        invoke('settings:getAll');
        const next = reconcile(currentUser, invoke('auth:getCurrentUser'));
        invoke('security:getStatus');
        if (next !== currentUser) {
          currentUser = next;
          dirty = true;
        }
      }
    }
    return { renders, calls };
  }

  it('an idle session settles after one refresh instead of looping', () => {
    const { renders, calls } = simulateIdleRefreshCycle(reconcileUser);
    assert.equal(renders, 1);
    assert.equal(calls.get('settings:getAll'), 1);
    assert.equal(calls.get('auth:getCurrentUser'), 1);
  });

  it('the simulation detects the loop when the user is replaced unconditionally (pre-fix behaviour)', () => {
    const { renders, calls } = simulateIdleRefreshCycle((_prev, next) => next);
    assert.equal(renders, 200);
    assert.ok(calls.get('settings:getAll') >= 200);
  });

  it('AuthContext writes the user only through the reconciling commit path', () => {
    const auth = readSrc('context/AuthContext.tsx');
    assert.match(auth, /reconcileUser\(userRef\.current, next\)/);
    const directSets = auth.match(/setCurrentUser\(/g) || [];
    assert.equal(directSets.length, 1, 'only commitUser may call setCurrentUser');
  });

  it('App effects key on stable identifiers, never on the currentUser object', () => {
    const app = readSrc('App.tsx');
    const depArrays = app.match(/\}, \[[^\]]*\]\);/g) || [];
    const offenders = depArrays.filter((deps) => /[[,\s]currentUser[,\]]/.test(deps));
    assert.deepEqual(offenders, []);
    assert.match(app, /onUnlocked=\{handleLicenseUnlocked\}/);
  });

  it('read-only IPC actions observed in the loop never emit data-changed topics', () => {
    for (const action of [
      'settings:getAll',
      'shifts:getActive',
      'auth:getCurrentUser',
      'license:verify',
      'security:getStatus',
      'products:getLowStockCount',
      'license:checkExpiry',
      'sales:getHeld',
    ]) {
      assert.deepEqual(getAutoTopicsForAction(action), [], action);
    }
  });

  it('every action used by the UI that emits topics is a mutating verb', () => {
    const files = [];
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.tsx?$/.test(name)) files.push(full);
      }
    };
    walk(SRC);
    const actions = new Set();
    for (const file of files) {
      for (const m of readFileSync(file, 'utf8').matchAll(/invoke(?:<[^>]*>)?\('([a-zA-Z]+:[a-zA-Z.]+)'/g)) {
        actions.add(m[1]);
      }
    }
    assert.ok(actions.size > 100);
    const mutatingVerb = /^(save|delete|create|cancel|archive|record|fund|process|adjust|recalculate|bulk|import|apply|hold|recallHeld|deleteHeld|restore|dispose|rebase|setBase|seed|clear|vacuum)/;
    for (const action of actions) {
      if (getAutoTopicsForAction(action).length > 0) {
        assert.match(action.split(':')[1], mutatingVerb, `${action} emits topics but is not a mutation`);
      }
    }
  });
});

describe('Defect 2: held-sale recall keeps held prices unless the cashier chooses otherwise', () => {
  const carton = { id: 'unit-carton', sellPricePiasters: 14000, conversionFactor: 12 };
  const piece = { id: 'unit-piece', sellPricePiasters: 0, conversionFactor: 1 };
  const product = { id: 'p-1', pricePiasters: 1250, units: [piece, carton] };
  const heldCarton = {
    productId: 'p-1',
    productName: 'Juice',
    unitId: 'unit-carton',
    unitName: 'Carton',
    quantityMilli: 1000,
    unitPricePiasters: 14000,
    discountPiasters: 0,
    totalPiasters: 14000,
    taxPiasters: 0,
  };

  it('uses the same unit pricing as addProductToCart: unit sell price first, else base x factor', () => {
    assert.equal(resolveUnitSellPrice(1250, carton), 14000);
    assert.equal(resolveUnitSellPrice(1250, { id: 'u', sellPricePiasters: 0, conversionFactor: 6 }), 7500);
    assert.equal(resolveUnitSellPrice(1250, undefined), 1250);
    assert.equal(resolveBaseSellPrice({ ...product, suggestedBatchSellPricePiasters: 1300 }, true), 1300);
    assert.equal(resolveBaseSellPrice({ ...product, suggestedBatchSellPricePiasters: 1300 }, false), 1250);
  });

  it('reported scenario: carton held at 140.00 is not re-priced to 12 x 12.50 = 150.00', () => {
    assert.equal(currentCatalogUnitPrice(heldCarton, [product], false), 14000);
    assert.deepEqual(findHeldPriceChanges([heldCarton], [product], false), []);
  });

  it('modifier extras are part of the current price', () => {
    const withMods = { ...heldCarton, unitPricePiasters: 14500, modifiers: [{ extraPricePiasters: 300 }, { extraPricePiasters: 200 }] };
    assert.deepEqual(findHeldPriceChanges([withMods], [product], false), []);
  });

  it('a real catalog change is reported with held vs current price and is applied only on request', () => {
    const raised = { ...product, units: [piece, { ...carton, sellPricePiasters: 14500 }] };
    const items = [heldCarton, { ...heldCarton, productId: 'gone' }];
    const changes = findHeldPriceChanges(items, [raised], false);
    assert.deepEqual(changes, [{
      index: 0,
      productName: 'Juice',
      unitName: 'Carton',
      heldUnitPricePiasters: 14000,
      currentUnitPricePiasters: 14500,
    }]);
    const repriced = applyCurrentPrices([{ ...heldCarton, quantityMilli: 2000, discountPiasters: 500 }], changes);
    assert.equal(repriced[0].unitPricePiasters, 14500);
    assert.equal(repriced[0].totalPiasters, 28500);
    assert.equal(items[0].unitPricePiasters, 14000, 'held items are not mutated');
  });

  it('lines that cannot be priced (unknown product, deleted unit, open price) are left alone', () => {
    assert.equal(currentCatalogUnitPrice({ ...heldCarton, productId: 'x' }, [product], false), null);
    assert.equal(currentCatalogUnitPrice({ ...heldCarton, unitId: 'deleted' }, [product], false), null);
    assert.equal(currentCatalogUnitPrice({ ...heldCarton, unitId: undefined }, [{ id: 'p-1', pricePiasters: 0 }], false), null);
  });

  it('legacy held sales: invoice discount equal to the line-discount sum is dropped as duplication', () => {
    const items = [{ discountPiasters: 500 }, { discountPiasters: 300 }];
    assert.equal(resolveHeldInvoiceDiscount(items, 800), 0);
    assert.equal(resolveHeldInvoiceDiscount(items, 300), 300);
    assert.equal(resolveHeldInvoiceDiscount([{ discountPiasters: 0 }], 800), 800);
    assert.equal(resolveHeldInvoiceDiscount([], undefined), 0);
  });

  it('PosView recall never re-prices silently, guards cart replacement, and renews the checkout key', () => {
    const pos = readSrc('views/PosView.tsx');
    assert.doesNotMatch(pos, /لأسعار الكتالوج الحالية/);
    assert.match(pos, /onOpenHeldSales=\{requestOpenHeldSales\}/);
    const body = (name) => {
      const start = pos.indexOf(`const ${name} =`);
      assert.ok(start >= 0, name);
      const end = pos.indexOf('\n  const ', start + 1);
      return pos.slice(start, end);
    };
    for (const name of ['confirmClearCart', 'handleHoldCurrentSale', 'handleRecallHeldSale']) {
      assert.match(body(name), /resetCartSession\(\)/, `${name} must renew the idempotency key`);
    }
    assert.match(pos, /canDiscountInvoice \|\| exceedsCashierLimit/, 'supervisor re-approval of held discounts stays');
  });
});

describe('Cash "exact amount" button uses integer piasters', () => {
  it('exact preset equals the total for every amount up to 1000.00', () => {
    for (let net = 0; net <= 100000; net++) {
      const presets = buildCashQuickPresetsPiasters(net);
      assert.equal(presets[0], net);
      assert.equal(poundsToPiasters(piastersToInputText(net)), net);
    }
  });

  it('documents the old float path that left 2.30 / 4.35 / 1.15 short', () => {
    assert.notEqual((230 / 100) * 100, 230);
    assert.equal(piastersToInputText(230), '2.30');
    assert.equal(piastersToInputText(435), '4.35');
    assert.equal(piastersToInputText(115), '1.15');
    assert.equal(piastersToInputText(5000), '50');
    assert.equal(piastersToInputText(5), '0.05');
  });

  it('quick presets are next 50, next 100 and 200 pounds, unique and never below the total', () => {
    assert.deepEqual(buildCashQuickPresetsPiasters(2350), [2350, 5000, 10000, 20000]);
    assert.deepEqual(buildCashQuickPresetsPiasters(5000), [5000, 10000, 20000]);
    assert.deepEqual(buildCashQuickPresetsPiasters(25010), [25010, 30000]);
  });
});

describe('Step 2 final round: held-sale price approval and discount format marker', () => {
  const change = { index: 0, productName: 'A', heldUnitPricePiasters: 14000, currentUnitPricePiasters: 14500 };

  it('H1: keeping off-catalog held prices needs a supervisor only for users without pos.price_override', () => {
    assert.equal(keepHeldPricesRequiresApproval([change], false), true);
    assert.equal(keepHeldPricesRequiresApproval([change], true), false);
    assert.equal(keepHeldPricesRequiresApproval([], false), false);
  });

  it('H1: PosView routes a cashier keep through SupervisorPromptModal with a reprice fallback on cancel', () => {
    const pos = readSrc('views/PosView.tsx');
    const start = pos.indexOf('const handleKeepHeldPrices =');
    const keep = pos.slice(start, pos.indexOf('\n  const ', start + 1));
    assert.match(keep, /keepHeldPricesRequiresApproval\(review\.changes, canOverridePrice\)/);
    assert.match(keep, /setSupervisorPrompt\(/);
    assert.match(keep, /onCancelled: \(\) => updateRecalledToCurrentPrices\(/);
    assert.match(pos, /const canOverridePrice = isAdmin \|\| hasPermission\('pos\.price_override'\)/);
    assert.match(pos, /supervisorPinRef\.current = verifiedPin/, 'approved PIN is kept for sales:create');
    assert.match(pos, /supervisorPin: paymentData\.supervisorPin \|\| supervisorPinRef\.current/);
    assert.match(pos, /onCancelled\?\.\(\)/, 'supervisor cancel triggers the fallback');
  });

  it('H1: Escape never silently keeps prices that would fail at checkout', () => {
    const modal = readSrc('views/pos/HeldSalePriceReviewModal.tsx');
    assert.match(modal, /if \(!keepRequiresApproval\) onKeepHeldPrices\(\);/);
  });

  it('M1: newly held carts carry the format marker on every line, stored verbatim in cartJson', () => {
    const lines = JSON.parse(serializeHeldCart([{ productId: 'a', discountPiasters: 500 }, { productId: 'b', discountPiasters: 0 }]));
    assert.equal(lines.length, 2);
    assert.ok(lines.every((l) => l.heldFormatVersion === 2));
    assert.equal(isLegacyHeldCart(lines), false);
    assert.deepEqual(stripHeldCartMarker(lines), [{ productId: 'a', discountPiasters: 500 }, { productId: 'b', discountPiasters: 0 }]);
    const pos = readSrc('views/PosView.tsx');
    assert.equal((pos.match(/cartJson: serializeHeldCart\(cart\)/g) || []).length, 3);
    assert.doesNotMatch(pos, /cartJson: JSON\.stringify\(cart\)/);
  });

  it('M1: a new-format sale keeps an invoice discount equal to its line discounts; legacy is still deduped', () => {
    const marked = JSON.parse(serializeHeldCart([{ discountPiasters: 500 }, { discountPiasters: 0 }]));
    assert.equal(resolveHeldInvoiceDiscount(marked, 500), 500);
    assert.equal(resolveHeldInvoiceDiscount([{ discountPiasters: 500 }, { discountPiasters: 0 }], 500), 0);
  });
});

describe('Revenue analytics: net-of-returns ex-VAT profitability display', () => {
  it('shares use positive net sales only and stay within 0..100', () => {
    assert.deepEqual(netSalesSharePercents([
      { totalSalesPiasters: 30000 },
      { totalSalesPiasters: 10000 },
      { totalSalesPiasters: -5000 },
      { totalSalesPiasters: 0 },
    ]), [75, 25, 0, 0]);
    assert.deepEqual(netSalesSharePercents([{ totalSalesPiasters: -100 }]), [0]);
    assert.deepEqual(netSalesSharePercents([]), []);
  });

  it("'least profitable' puts the biggest losses first", () => {
    const rows = [
      { id: 'a', grossProfitPiasters: 500, totalSalesPiasters: 1000 },
      { id: 'b', grossProfitPiasters: -2000, totalSalesPiasters: -1500 },
      { id: 'c', grossProfitPiasters: -200, totalSalesPiasters: 300 },
    ];
    assert.deepEqual(sortByProfit(rows, 'asc').map((r) => r.id), ['b', 'c', 'a']);
    assert.deepEqual(sortByProfit(rows, 'desc').map((r) => r.id), ['a', 'c', 'b']);
    assert.equal(rows[0].id, 'a', 'input not mutated');
  });

  it('the view labels the column as net sales excluding VAT after returns', () => {
    const view = readSrc('views/analytics/RevenueAnalyticsView.tsx');
    assert.equal((view.match(/بدون ضريبة، بعد المرتجعات/g) || []).length, 2);
    assert.doesNotMatch(view, /cat\.salesSharePercent/);
  });
});

describe('Product edit: Save waits for the authoritative units list', async () => {
  const { canSaveProductUnits, unitsLoadBlockMessage } = await import('../src/views/products/unitsLoadGuard.ts');

  it('an existing product can be saved only after productUnits:getByProduct resolved', () => {
    assert.equal(canSaveProductUnits(true, 'loading'), false);
    assert.equal(canSaveProductUnits(true, 'error'), false);
    assert.equal(canSaveProductUnits(true, 'ready'), true);
    assert.equal(canSaveProductUnits(false, 'loading'), true, 'new products have no server units to lose');
    assert.match(unitsLoadBlockMessage('error'), /إعادة المحاولة/);
    assert.match(unitsLoadBlockMessage('loading'), /جاري تحميل/);
  });

  it('ProductsView blocks every save path and ignores stale unit responses', () => {
    const view = readSrc('views/ProductsView.tsx');
    const start = view.indexOf('const handleSaveProduct =');
    const head = view.slice(start, view.indexOf("setFormError('اسم المنتج مطلوب')", start));
    assert.match(head, /if \(!canSaveProductUnits\(Boolean\(editingId\), unitsLoadState\)\)/);
    const editStart = view.indexOf('const openEditModal =');
    const edit = view.slice(editStart, view.indexOf('\n  };\n', editStart));
    assert.match(edit, /loadEditingProductUnits\(prod\.id\)/);
    assert.doesNotMatch(edit, /\/\/ keep default/);
    assert.match(view, /if \(requestId !== unitsRequestRef\.current\) return;/);
    assert.match(view, /setUnitsLoadState\('error'\)/);
  });

  it('the form disables Save and offers a retry while units are not loaded', () => {
    const modal = readSrc('views/products/ProductFormModal.tsx');
    assert.match(modal, /disabled=\{loading \|\| unitsLoadState !== 'ready'\}/);
    assert.match(modal, /onClick=\{onRetryLoadUnits\}/);
  });
});
