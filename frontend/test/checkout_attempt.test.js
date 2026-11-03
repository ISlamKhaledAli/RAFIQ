import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CHECKOUT_ATTEMPT_STORAGE_KEY, captureCheckoutAttempt, readCheckoutAttempt,
  saveCheckoutAttempt, clearCheckoutAttempt, readSavedCheckout, readAbandonCheckout,
} from '../src/views/pos/checkoutAttempt.ts';
import { FINANCIAL_ATTEMPT_STORAGE_KEY } from '../src/utils/financialAttempt.ts';

function payload() {
  return {
    idempotencyKey: 'attempt-1', subtotalPiasters: 4200, discountPiasters: 0,
    taxPiasters: 0, totalPiasters: 4200, paidPiasters: 5000,
    paymentMethod: 'cash', status: 'completed', supervisorPin: 'PRIVATE-TEST-PIN',
    items: [{
      productId: 'milk', productName: 'Milk', quantityMilli: 1000, unitPricePiasters: 4200,
      unitCostPiasters: 3400, discountPiasters: 0, totalPiasters: 4200, taxPiasters: 0,
    }],
    payments: [{ method: 'cash', amountPiasters: 5000 }],
  };
}

function storage() {
  const rows = new Map();
  return {
    getItem: (key) => rows.get(key) ?? null,
    setItem: (key, value) => rows.set(key, value),
    removeItem: (key) => rows.delete(key),
  };
}

describe('Durable unresolved checkout attempt', () => {
  it('blocks a new sale for every unresolved financial journal, including corrupt and foreign records', () => {
    for (const raw of ['', '{broken', ...[
      'wallets:processTransaction', 'wallets:fundAccount',
      'epay:createTransaction', 'epay:fundTerminal',
    ].map((action) => JSON.stringify({ action, actorId: 'another-cashier' }))]) {
      const db = storage();
      db.setItem(FINANCIAL_ATTEMPT_STORAGE_KEY, raw);
      assert.throws(() => saveCheckoutAttempt(db, captureCheckoutAttempt(payload(), 'cashier-1')), /محاولة مالية/);
      assert.equal(db.getItem(CHECKOUT_ATTEMPT_STORAGE_KEY), null);
      assert.equal(db.getItem(FINANCIAL_ATTEMPT_STORAGE_KEY), raw);
      db.removeItem(FINANCIAL_ATTEMPT_STORAGE_KEY);
      saveCheckoutAttempt(db, captureCheckoutAttempt(payload(), 'cashier-1'));
      assert.ok(readCheckoutAttempt(db));
    }
  });

  it('freezes an independent original request and never stores approval credentials', () => {
    const request = payload();
    request.approval = { password: 'PRIVATE-PASSWORD', token: 'PRIVATE-TOKEN', reason: 'approved' };
    const attempt = captureCheckoutAttempt(request, 'cashier-1');
    request.items[0].quantityMilli = 9000;
    request.paidPiasters = 0;
    assert.equal(attempt.payload.items[0].quantityMilli, 1000);
    assert.equal(attempt.payload.paidPiasters, 5000);
    assert.ok(Object.isFrozen(attempt.payload.items[0]));
    assert.ok(!JSON.stringify(attempt).includes('PRIVATE-'));
    assert.deepEqual(attempt.payload.approval, { reason: 'approved' });
  });

  it('restores the same key, actor, quantities and payment after a reload', () => {
    const db = storage();
    const attempt = captureCheckoutAttempt(payload(), 'cashier-1');
    saveCheckoutAttempt(db, attempt);
    assert.deepEqual(readCheckoutAttempt(db), attempt);
  });

  it('will not overwrite an unresolved operation or reuse its key with a changed request', () => {
    const db = storage();
    const original = captureCheckoutAttempt(payload(), 'cashier-1');
    saveCheckoutAttempt(db, original);
    for (const change of [
      { idempotencyKey: 'attempt-2' }, { paidPiasters: 4200 }, { customerId: 'another-customer' },
    ]) {
      assert.throws(() => saveCheckoutAttempt(db, captureCheckoutAttempt({ ...payload(), ...change }, 'cashier-1')), /سابقة/);
    }
    assert.throws(() => saveCheckoutAttempt(db, captureCheckoutAttempt(payload(), 'cashier-2')), /سابقة/);
    assert.deepEqual(readCheckoutAttempt(db), original);
  });

  it('preserves malformed journals and refuses to clear another attempt', () => {
    const db = storage();
    db.setItem(CHECKOUT_ATTEMPT_STORAGE_KEY, '{broken');
    assert.throws(() => readCheckoutAttempt(db));
    assert.equal(db.getItem(CHECKOUT_ATTEMPT_STORAGE_KEY), '{broken');
    db.removeItem(CHECKOUT_ATTEMPT_STORAGE_KEY);
    saveCheckoutAttempt(db, captureCheckoutAttempt(payload(), 'cashier-1'));
    assert.throws(() => clearCheckoutAttempt(db, 'different-key'), /أخرى/);
    assert.ok(readCheckoutAttempt(db));
    clearCheckoutAttempt(db, 'attempt-1');
    assert.equal(readCheckoutAttempt(db), null);
  });

  it('rejects fractional and unsafe monetary or quantity inputs before persistence', () => {
    for (const change of [{ paidPiasters: 0.1 }, { totalPiasters: Number.MAX_SAFE_INTEGER + 1 }, { taxPiasters: -1 }]) {
      assert.throws(() => captureCheckoutAttempt({ ...payload(), ...change }, 'cashier-1'), /الحساب الآمن/);
    }
    const request = payload();
    request.items[0].quantityMilli = 1.5;
    assert.throws(() => captureCheckoutAttempt(request, 'cashier-1'));
  });

  it('never interprets a lookup miss or an unrelated sale as durable abandonment', () => {
    for (const result of [null, undefined, { success: true }, { abandoned: true, sale: { id: 'existing' } }]) {
      assert.throws(() => readAbandonCheckout(result, 'attempt-1'));
    }
    assert.deepEqual(readAbandonCheckout({ abandoned: true, sale: null }, 'attempt-1'), { abandoned: true, sale: null });
  });

  it('accepts only a valid stored sale for the original checkout key', () => {
    const original = { ...payload(), id: 'persisted-invoice', supervisorPin: undefined };
    assert.equal(readSavedCheckout(original, 'attempt-1').id, 'persisted-invoice');
    assert.throws(() => readSavedCheckout({ ...original, idempotencyKey: 'older-attempt' }, 'attempt-1'));
    assert.throws(() => readSavedCheckout({ ...original, items: undefined }, 'attempt-1'));
    assert.equal(readAbandonCheckout({ abandoned: false, sale: original }, 'attempt-1').sale.id, original.id);
  });
});
