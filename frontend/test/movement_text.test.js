import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanMovementNote, movementTypeLabel } from '../src/utils/movementText.ts';

describe('cleanMovementNote', () => {
  it('translates the legacy (piece) unit token that the sale movement used to store', () => {
    assert.equal(cleanMovementNote('مبيعات كاشير - فاتورة #1001 (piece)'), 'مبيعات كاشير - فاتورة #1001 (قطعة)');
    assert.equal(cleanMovementNote('تسوية (PIECE)'), 'تسوية (قطعة)');
    assert.equal(cleanMovementNote('x (pcs)'), 'x (قطعة)');
    assert.equal(cleanMovementNote('x ( pc )'), 'x (قطعة)');
  });

  it('translates kilogram, box and carton tokens through the shared unit dictionary', () => {
    assert.equal(cleanMovementNote('بيع (kg)'), 'بيع (كجم)');
    assert.equal(cleanMovementNote('بيع (box)'), 'بيع (علبة)');
    assert.equal(cleanMovementNote('بيع (carton)'), 'بيع (كرتونة)');
  });

  it('translates bare unit words and the stocktake tags', () => {
    assert.equal(cleanMovementNote('الكمية 3 piece'), 'الكمية 3 قطعة');
    assert.equal(cleanMovementNote('تسوية جردية [SURPLUS]: من 1 إلى 3'), 'تسوية جردية [فائض جردي]: من 1 إلى 3');
    assert.equal(cleanMovementNote('تسوية جردية [shortage]: من 3 إلى 1'), 'تسوية جردية [عجز جردي]: من 3 إلى 1');
  });

  it('is idempotent and passes Arabic and unknown text through untouched', () => {
    const arabic = 'رصيد افتتاحي مسجل أثناء ترقية النظام';
    assert.equal(cleanMovementNote(arabic), arabic);
    const once = cleanMovementNote('بيع (piece) [SURPLUS]');
    assert.equal(cleanMovementNote(once), once);
    assert.equal(cleanMovementNote('فاتورة (INV-9842)'), 'فاتورة (INV-9842)');
    assert.equal(cleanMovementNote('مورد (Fawry)'), 'مورد (Fawry)');
  });

  it('returns an empty string for missing notes', () => {
    assert.equal(cleanMovementNote(null), '');
    assert.equal(cleanMovementNote(undefined), '');
    assert.equal(cleanMovementNote(''), '');
  });
});

describe('movementTypeLabel', () => {
  it('prefers the Arabic label sent by the host', () => {
    assert.equal(movementTypeLabel('SALE', 'مبيعات كاشير'), 'مبيعات كاشير');
  });

  it('never shows an English code: it maps every code the host writes', () => {
    const codes = [
      'INITIAL', 'INITIAL_OPENING', 'OPENING_BALANCE', 'SALE', 'SALE_CANCEL', 'PURCHASE', 'PURCHASE_RETURN',
      'ADJUSTMENT', 'INVENTORY_ADJUSTMENT', 'RETURN', 'REFUND', 'DAMAGED_RETURN', 'DAMAGE', 'EXPIRED_WRITE_OFF',
      'UNIT_REBASE', 'PRODUCTION_CONSUMPTION', 'PRODUCTION_OUTPUT', 'RECIPE_SALE_CONSUMPTION',
      'RECIPE_SALE_REVERSAL', 'IN', 'OUT',
    ];
    for (const code of codes) {
      const label = movementTypeLabel(code, code);
      assert.match(label, /[\u0600-\u06FF]/, code);
      assert.doesNotMatch(label, /[A-Za-z]/, code);
    }
  });

  it('falls back to a generic Arabic label for unknown or missing codes', () => {
    assert.equal(movementTypeLabel('SOMETHING_NEW'), 'حركة مخزون');
    assert.equal(movementTypeLabel(null, null), 'حركة مخزون');
    assert.equal(movementTypeLabel('sale', ''), 'مبيعات كاشير');
  });
});
