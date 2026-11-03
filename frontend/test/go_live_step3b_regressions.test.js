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

  it('e-pay transactions and terminal fundings durably preserve the keyed original after a lost response', async () => {
    const epay = readSrc('views/epay/EpayView.tsx');
    assert.match(epay, /financial\.run<EpayTransaction>\('epay:createTransaction'/);
    assert.match(epay, /financial\.run\('epay:fundTerminal'/);
    assert.doesNotMatch(epay, /cashierName:|performedBy:/);
    const { createFinancialAttempt, readFinancialAttempt } = await import('../src/utils/financialAttempt.ts');
    for (const action of ['epay:createTransaction', 'epay:fundTerminal']) {
      const saved = new Map(), rows = new Map(), calls = [];
      const storage = { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value), removeItem: key => saved.delete(key) };
      const payload = action.endsWith('fundTerminal') ?
        { terminalId: 'terminal', amountPiasters: 10000, fundingSource: 'external' } :
        { terminalId: 'terminal', billAmountPiasters: 10000, customerFeePiasters: 100,
          providerCommissionPiasters: 0, serviceType: 'bill', paymentChannel: 'external' };
      let lost = true;
      const send = async (_, request) => {
        assert.equal(readFinancialAttempt(storage).payload.idempotencyKey, request.idempotencyKey, 'Persist before sending');
        calls.push(request);
        if (!rows.has(request.idempotencyKey)) rows.set(request.idempotencyKey, {
          ...request, id: 'saved', idempotencyFingerprint: 'fingerprint', createdBy: 'cashier-test',
          previousBalancePiasters: 50000, newBalancePiasters: 60000,
        });
        if (lost) { lost = false; throw new Error('Committed then response lost'); }
        return rows.get(request.idempotencyKey);
      };
      await assert.rejects(createFinancialAttempt(storage, 'cashier-test', action, send).execute(payload));
      const frozen = readFinancialAttempt(storage);
      await createFinancialAttempt(storage, 'cashier-test', action, send).execute({ ...payload, amountPiasters: 20000 });
      assert.equal(calls[1].idempotencyKey, calls[0].idempotencyKey);
      assert.deepEqual(calls[1], frozen.payload, 'A remounted form cannot substitute edited values');
      assert.equal(rows.size, 1, 'A retry cannot create a second posting');
      assert.equal(readFinancialAttempt(storage), null, 'Only the strict committed result clears the journal');
    }
  });
});
