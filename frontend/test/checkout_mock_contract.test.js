import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DevelopmentCheckoutStore } from '../src/bridge/checkoutMocks.ts';
import { BridgeResponseError } from '../src/bridge/errors.ts';

function request(key = 'attempt-1') {
  return {
    idempotencyKey: key, subtotalPiasters: 4200, discountPiasters: 0,
    taxPiasters: 0, totalPiasters: 4200, paidPiasters: 5000,
    paymentMethod: 'cash', status: 'completed', supervisorPin: 'PRIVATE-TEST-PIN',
    items: [{
      productId: 'milk', productName: 'Milk', quantityMilli: 1000,
      unitPricePiasters: 4200, unitCostPiasters: 3400,
      discountPiasters: 0, totalPiasters: 4200, taxPiasters: 0,
    }],
    payments: [{ method: 'cash', amountPiasters: 5000 }],
  };
}

describe('Development checkout response shapes (not native accounting tests)', () => {
  it('returns populated receipt items and an array history without credential echoes', () => {
    const store = new DevelopmentCheckoutStore();
    const sale = store.handle('sales:create', request(), 'cashier-1');
    assert.ok(sale.id);
    assert.equal(sale.items.length, 1);
    assert.ok(sale.items[0].id);
    assert.ok(!JSON.stringify(sale).includes('PRIVATE-TEST-PIN'));
    assert.deepEqual(store.handle('sales:getRecent', {}, 'cashier-1'), [sale]);
    assert.deepEqual(store.handle('sales:getById', { id: sale.id }, 'cashier-1'), sale);
    assert.equal(store.nextInvoiceNumber, sale.invoiceNumber + 1);
  });

  it('replays the matching request but rejects changed money or actor', () => {
    const store = new DevelopmentCheckoutStore();
    const original = store.handle('sales:create', request(), 'cashier-1');
    assert.strictEqual(store.handle('sales:create', request(), 'cashier-1'), original);
    for (const [payload, actor] of [
      [{ ...request(), paidPiasters: 4200 }, 'cashier-1'],
      [request(), 'cashier-2'],
    ]) {
      assert.throws(() => store.handle('sales:create', payload, actor),
        (error) => error instanceof BridgeResponseError && error.code === 'SALE_IDEMPOTENCY_CONFLICT');
    }
    assert.equal(store.handle('sales:getRecent', {}, 'cashier-1').length, 1);
  });

  it('keeps lookup absence distinct from an acknowledged abandonment barrier', () => {
    const store = new DevelopmentCheckoutStore();
    assert.equal(store.handle('sales:reconcileCheckout', request(), 'cashier-1'), null);
    assert.deepEqual(store.handle('sales:abandonCheckout', request(), 'cashier-1'), { abandoned: true, sale: null });
    assert.throws(() => store.handle('sales:create', request(), 'cashier-1'),
      (error) => error instanceof BridgeResponseError && error.code === 'SALE_CHECKOUT_ABANDONED');
    assert.deepEqual(store.handle('sales:getRecent', {}, 'cashier-1'), []);
  });

  it('never cancels an already recorded sale when resolving an attempt', () => {
    const store = new DevelopmentCheckoutStore();
    const sale = store.handle('sales:create', request(), 'cashier-1');
    assert.deepEqual(store.handle('sales:abandonCheckout', request(), 'cashier-1'), { abandoned: false, sale });
    assert.equal(sale.status, 'completed');
    assert.equal(store.handle('sales:getRecent', {}, 'cashier-1').length, 1);
  });
});
