import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { copyCartForUpdate } from '../src/views/pos/cartUpdates.ts';
import { calculateLineTotal } from '../src/utils/money.ts';

describe('Cashier cart updater purity', () => {
  it('does not mutate the existing line when React evaluates an updater twice', () => {
    const previous = Object.freeze([
      Object.freeze({
        productId: 'milk', quantityMilli: 1000, unitPricePiasters: 4200,
        discountPiasters: 0, totalPiasters: 4200,
      }),
    ]);
    const update = (items) => {
      const next = copyCartForUpdate(items);
      next[0].quantityMilli += 1000;
      next[0].totalPiasters = calculateLineTotal(
        next[0].unitPricePiasters, next[0].quantityMilli, next[0].discountPiasters,
      );
      return next;
    };
    const first = update(previous);
    const repeatedEvaluation = update(previous);
    assert.equal(previous[0].quantityMilli, 1000);
    assert.equal(previous[0].totalPiasters, 4200);
    assert.deepEqual(repeatedEvaluation, first);
    assert.equal(first[0].quantityMilli, 2000);
    assert.equal(first[0].totalPiasters, 8400);
    assert.equal(update(first)[0].quantityMilli, 3000);
  });

  it('preserves order and values but gives every editable line a separate identity', () => {
    const previous = [{ productId: 'a', discountPiasters: 0 }, { productId: 'b', discountPiasters: 0 }];
    const next = copyCartForUpdate(previous);
    assert.deepEqual(next, previous);
    assert.notStrictEqual(next, previous);
    for (let i = 0; i < next.length; i++) assert.notStrictEqual(next[i], previous[i]);
    next[1].discountPiasters = 100;
    assert.equal(previous[1].discountPiasters, 0);
  });
});
