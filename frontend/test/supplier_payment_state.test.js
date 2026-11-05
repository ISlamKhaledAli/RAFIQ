import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describeSupplierBalance, getSupplierPaymentState, halfOfInvoicePiasters } from '../src/views/purchases/supplierPaymentState.ts';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (...parts) => readFileSync(join(ROOT, ...parts), 'utf8').replace(/\r\n/g, '\n');
const tab = read('src', 'views', 'purchases', 'NewPurchaseTab.tsx');
const card = read('src', 'views', 'purchases', 'SupplierPaymentStatusCard.tsx');
const money = (p) => `${(p / 100).toFixed(2)} ج.م`;

describe('supplier invoice payment state (integer piasters)', () => {
  it('classifies none / full / partial / credit / excess', () => {
    assert.equal(getSupplierPaymentState(0, 0), 'none');
    assert.equal(getSupplierPaymentState(0, 500), 'none', 'an empty invoice has no payment state');
    assert.equal(getSupplierPaymentState(10000, 10000), 'full');
    assert.equal(getSupplierPaymentState(10000, 4000), 'partial');
    assert.equal(getSupplierPaymentState(10000, 1), 'partial');
    assert.equal(getSupplierPaymentState(10000, 9999), 'partial');
    assert.equal(getSupplierPaymentState(10000, 0), 'credit');
    assert.equal(getSupplierPaymentState(10000, 10001), 'excess');
  });

  it('exactly one state at a time, so at most one quick button can be pressed', () => {
    for (const [net, paid] of [[0, 0], [100, 0], [100, 50], [100, 100], [100, 150], [1, 1], [1, 0]]) {
      const state = getSupplierPaymentState(net, paid);
      const pressed = [state === 'full', state === 'partial', state === 'credit'].filter(Boolean).length;
      assert.ok(pressed <= 1, `net ${net} paid ${paid} -> ${state}`);
    }
  });

  it('half of the invoice is a whole number of piasters, never the full amount', () => {
    assert.equal(halfOfInvoicePiasters(10000), 5000);
    assert.equal(halfOfInvoicePiasters(3401), 1700);
    assert.equal(halfOfInvoicePiasters(1), 0);
    assert.equal(halfOfInvoicePiasters(0), 0);
    for (const net of [2, 3, 99, 10001]) {
      const half = halfOfInvoicePiasters(net);
      assert.ok(Number.isInteger(half) && half < net);
    }
  });

  it('supplier balance wording: positive = we owe, negative = they owe us', () => {
    assert.equal(describeSupplierBalance(12500, money), 'علينا 125.00 ج.م');
    assert.equal(describeSupplierBalance(-3000, money), 'لنا 30.00 ج.م');
    assert.equal(describeSupplierBalance(0, money), 'خالص');
  });
});

describe('purchase payment section mirrors the cashier: full / part / on account', () => {
  it('three pressed-state buttons driven by the real amounts, plus a status card', () => {
    assert.match(tab, /aria-pressed=\{paymentState === 'full'\}/);
    assert.match(tab, /aria-pressed=\{paymentState === 'partial'\}/);
    assert.match(tab, /aria-pressed=\{paymentState === 'credit'\}/);
    assert.ok(tab.includes('<span>دفع جزء</span>') && tab.includes('<span>دفع كامل</span>') && tab.includes('<span>آجل بالكامل</span>'));
    assert.match(tab, /<SupplierPaymentStatusCard/);
  });

  it('the old two-button logic and the relabelled credit button are gone', () => {
    assert.ok(!tab.includes("'من رصيدنا المتاح'"), 'the credit button keeps one honest label');
    assert.ok(!tab.includes('settlementLabel') && !tab.includes('settlementNote'));
    assert.ok(!tab.includes('quickBtnCls(paidAmountPiasters === 0)'), 'credit highlight no longer fires for an empty invoice');
  });

  it('the card explains each state and shows the supplier balance before/after only when a supplier is chosen', () => {
    for (const title of ['الفاتورة مسددة بالكامل', 'دفع جزء الآن والباقي آجل على المورد', 'الفاتورة كلها آجل على المورد (بدون كاش)', 'سداد بزيادة عن الفاتورة']) {
      assert.ok(card.includes(title), title);
    }
    assert.match(card, /const balanceAfter = supplierName \? \(/);
    assert.ok(card.includes('حساب المورد قبل الفاتورة') && card.includes('حساب المورد بعد الفاتورة'));
  });

  it('uses design tokens with dark pairs and no emoji / palette classes', () => {
    assert.ok(!/text-(slate|gray|blue|red|green|emerald|amber)-\d|#[0-9a-fA-F]{3,8}\b/.test(card));
    assert.ok(!/\p{Extended_Pictographic}/u.test(card));
    for (const cls of ['bg-paid-soft dark:bg-paid-dark-soft', 'bg-warn-soft dark:bg-warn-dark-soft', 'bg-danger-soft dark:bg-danger-dark-soft']) {
      assert.ok(card.includes(cls), cls);
    }
  });
});
