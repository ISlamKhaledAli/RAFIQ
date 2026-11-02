import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createAttemptKey, newIdempotencyKey } from '../src/utils/idempotency.ts';
import { enforcesOwnStock } from '../src/views/pos/stockGuard.ts';

import { fileURLToPath } from 'node:url';
const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const readSrc = (rel) => readFileSync(join(SRC, rel), 'utf8');

describe('Go-live 3B / L8: retry-safe money actions', () => {
  it('newIdempotencyKey is prefixed and unique per call', () => {
    const a = newIdempotencyKey('ret');
    const b = newIdempotencyKey('ret');
    assert.match(a, /^ret_/);
    assert.notEqual(a, b);
  });

  it('an attempt keeps one key across retries and gets a fresh one after success', () => {
    const attempt = createAttemptKey('pay');
    const first = attempt.current();
    assert.equal(attempt.current(), first, 'a retry after timeout reuses the same key');
    attempt.complete();
    assert.notEqual(attempt.current(), first, 'the next payment is a new operation');
  });

  it('returns, customer payments and expenses send an idempotency key', () => {
    assert.match(readSrc('components/ReturnModal.tsx'), /idempotencyKey: returnAttemptRef\.current\.current\(\)/);
    assert.match(readSrc('views/CustomersView.tsx'), /idempotencyKey: paymentAttemptRef\.current\.current\(\)/);
    assert.match(readSrc('components/ExpenseModal.tsx'), /idempotencyKey: expenseAttemptRef\.current\.current\(\)/);
  });
});

describe('Go-live 3B / M5: the actor comes from the server session', () => {
  it('payment cancellation and stock adjustment no longer send a client-side user identity', () => {
    const customers = readSrc('views/CustomersView.tsx');
    const cancelCall = customers.slice(customers.indexOf("'customers:cancelPayment'"), customers.indexOf("'customers:cancelPayment'") + 300);
    assert.doesNotMatch(cancelCall, /userName/);
    const adjust = readSrc('components/StockAdjustmentModal.tsx');
    const adjustCall = adjust.slice(adjust.indexOf("'inventory:adjustStock'"), adjust.indexOf("'inventory:adjustStock'") + 300);
    assert.doesNotMatch(adjustCall, /userId/);
  });
});

describe('Go-live 3B / M3: rejected customer import rows are shown', () => {
  it('the import result modal lists the Arabic per-row errors', () => {
    assert.match(readSrc('views/customers/CustomerImportExcelModal.tsx'), /importResult\.rowErrors\.map/);
    assert.match(readSrc('types/models.ts'), /rowErrors\?: string\[\];/);
  });
});

describe('Go-live 3B / R2: café recipe items are not blocked on their own stock', () => {
  it('own stock is guarded only for ordinary products while negative stock is off', () => {
    assert.equal(enforcesOwnStock(false, { consumesIngredientsOnSale: true }), false, 'a latte with own stock 0 can be added; the server checks its ingredients');
    assert.equal(enforcesOwnStock(false, { consumesIngredientsOnSale: false }), true);
    assert.equal(enforcesOwnStock(false, {}), true);
    assert.equal(enforcesOwnStock(true, {}), false);
  });

  it('every POS own-stock check goes through the guard and the flag reaches cart lines', () => {
    const pos = readSrc('views/PosView.tsx');
    assert.doesNotMatch(pos, /if \(!allowNegativeStock/);
    assert.equal((pos.match(/enforcesOwnStock\(allowNegativeStock, /g) || []).length, 4);
    assert.match(pos, /consumesIngredientsOnSale: prod\.consumesIngredientsOnSale/);
    assert.match(readSrc('views/pos/usePosCatalog.ts'), /consumesIngredientsOnSale: item\.consumesIngredientsOnSale/);
  });
});

describe('Go-live 3B round 2: drawer and e-pay retries, no client identity', () => {
  it('shift actions send no cashier/performer identity and drawer movements carry a key', () => {
    const shift = readSrc('components/ShiftModal.tsx');
    assert.doesNotMatch(shift, /cashierId:|cashierName:|performedById:|performedByName:/);
    assert.match(shift, /idempotencyKey: cashInAttemptRef\.current\.current\(\)/);
    assert.match(shift, /idempotencyKey: cashOutAttemptRef\.current\.current\(\)/);
  });

  it('e-pay transactions and terminal fundings carry a key', () => {
    const epay = readSrc('views/epay/EpayView.tsx');
    assert.match(epay, /idempotencyKey: txAttemptRef\.current\.current\(\)/);
    assert.match(epay, /idempotencyKey: fundAttemptRef\.current\.current\(\)/);
  });
});
