import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describeRefund, REFUND_METHOD_LABELS } from '../src/utils/refundMethods.ts';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const modal = readFileSync(join(SRC, 'components/ReturnModal.tsx'), 'utf8');

describe('ReturnModal: the refund follows the original tender', () => {
  it('offers only the methods that paid the original invoice, derived from its payments and past refunds', () => {
    assert.match(modal, /function computeRefundOptions\(sale: Sale \| null, pastReturns: ReturnWithRefunds\[\]\)/);
    assert.match(modal, /sale\.payments \|\| \[\]/);
    assert.match(modal, /refunded\[key\] \+= part\.amountPiasters/);
    assert.match(modal, /effectiveRefundOptions\.map\(\(option\) =>/);
  });

  it('no longer defaults to cash for every invoice', () => {
    assert.doesNotMatch(modal, /useState<'cash' \| 'credit'>/);
    assert.doesNotMatch(modal, /paymentMethod === 'credit' \? 'credit' : 'cash'/);
  });

  it('splits a refund larger than one method can take and sends it as refunds[] with an exact remainder part', () => {
    assert.match(modal, /function planRefund\(total: number, options: RefundOption\[\], preferred: RefundMethodKey\)/);
    assert.match(modal, /refunds: refundPlan\.length > 1/);
    assert.match(modal, /index === refundPlan\.length - 1 \? 0 : part\.amountPiasters/);
  });

  it('keeps the single refundMethod request shape and the idempotency key', () => {
    assert.match(modal, /refundMethod: refundPlan\[0\]\.method/);
    assert.match(modal, /idempotencyKey: returnAttemptRef\.current\.current\(\)/);
  });

  it('uses no native select and no emojis', () => {
    assert.doesNotMatch(modal, /<select/);
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    assert.equal(emojiRegex.test(modal), false);
  });

  it('plans the split from the server-computed caps (credit invoices keep a numeric cash cap)', () => {
    assert.match(modal, /includeCaps: true/);
    assert.match(modal, /function refundOptionsFromCaps\(caps: RefundCapsPayload\)/);
    assert.match(modal, /caps \? refundOptionsFromCaps\(caps\) : computeRefundOptions\(sale, pastReturnList\)/);
    assert.match(modal, /capPiasters: caps\.remainingPiasters/);
  });

  it('shares one Arabic label map between the return screen and the sales history', () => {
    const history = readFileSync(join(SRC, 'views/SalesHistoryView.tsx'), 'utf8');
    assert.match(modal, /from '\.\.\/utils\/refundMethods'/);
    assert.match(history, /describeRefund\(ret\)/);
    assert.doesNotMatch(history, /'كاش من الدرج'/);
  });
});

describe('describeRefund: one Arabic label per refund method or part', () => {
  it('labels every method and lists each part of a split refund', () => {
    assert.equal(describeRefund({ refundMethod: 'card', totalPiasters: 5000 }), REFUND_METHOD_LABELS.card);
    assert.equal(describeRefund({ refundMethod: 'vodafone_cash', totalPiasters: 5000 }), REFUND_METHOD_LABELS.wallet);
    assert.equal(describeRefund({ refundMethod: 'customer_balance', totalPiasters: 5000 }), REFUND_METHOD_LABELS.credit);
    const split = describeRefund({
      refundMethod: 'cash',
      totalPiasters: 5000,
      refunds: [
        { method: 'cash', amountPiasters: 3000 },
        { method: 'card', amountPiasters: 2000 },
        { method: 'instapay', amountPiasters: 0 }
      ]
    });
    assert.ok(split.includes(REFUND_METHOD_LABELS.cash));
    assert.ok(split.includes(REFUND_METHOD_LABELS.card));
    assert.ok(split.includes(REFUND_METHOD_LABELS.instapay));
    assert.equal(split.split(' + ').length, 3);
  });

  it('keeps an unknown legacy method visible instead of hiding it as cash', () => {
    assert.equal(describeRefund({ refundMethod: 'mystery', totalPiasters: 1 }), 'mystery');
  });
});
