import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { toSafePiasters, formatArabicCurrency, formatThousands, tafqeetCurrency, isValidMoneyText } from '../src/utils/money.ts';
import {
  normalizeShift,
  normalizeShiftList,
  normalizeShiftSummary,
  normalizeDrawerTransactions,
  getMovementTypeLabel,
} from '../src/utils/shiftSummary.ts';

const originalWarn = console.warn;
let warnings;
beforeEach(() => {
  warnings = [];
  console.warn = (msg) => warnings.push(String(msg));
});
afterEach(() => {
  console.warn = originalWarn;
});

describe('toSafePiasters: no NaN/undefined/Infinity can enter money state', () => {
  it('keeps safe integers unchanged, including negatives and zero', () => {
    assert.equal(toSafePiasters(0), 0);
    assert.equal(toSafePiasters(1550), 1550);
    assert.equal(toSafePiasters(-2500), -2500);
    assert.equal(toSafePiasters(Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER);
    assert.equal(warnings.length, 0);
  });

  it('rounds fractions to whole piasters, half away from zero, and never returns -0', () => {
    assert.equal(toSafePiasters(10.4), 10);
    assert.equal(toSafePiasters(10.5), 11);
    assert.equal(toSafePiasters(-10.5), -11);
    assert.ok(Object.is(toSafePiasters(-0.4), 0));
    assert.ok(Object.is(toSafePiasters(-0), 0));
  });

  it('returns 0 and warns once per source for NaN, undefined, null, Infinity', () => {
    for (const bad of [Number.NaN, undefined, null, Infinity, -Infinity]) {
      assert.equal(toSafePiasters(bad, 'test.field'), 0);
    }
    assert.equal(warnings.length, 1, 'one warning per source, not per call');
    assert.match(warnings[0], /test\.field/);
  });

  it('treats strings, objects, booleans and unsafe-huge numbers as invalid', () => {
    for (const bad of ['1500', '', 'abc', {}, [], true, Number.MAX_SAFE_INTEGER + 2, 1e21, -1e21]) {
      assert.equal(toSafePiasters(bad, `bad:${String(bad)}`), 0);
    }
  });
});

describe('formatArabicCurrency / formatThousands / tafqeet never print NaN', () => {
  it('renders 0.00 for non-finite or missing amounts', () => {
    for (const bad of [Number.NaN, undefined, null, Infinity, -Infinity]) {
      assert.equal(formatArabicCurrency(bad), '0.00 ج.م');
      assert.equal(formatArabicCurrency(bad, false), '0.00');
      assert.equal(tafqeetCurrency(bad), '');
      assert.equal(formatThousands(bad), '');
    }
    assert.equal(formatThousands(Number.NaN), '', 'a NaN number must not become the text "NaN"');
  });

  it('formats real amounts unchanged', () => {
    assert.equal(formatArabicCurrency(188000), '1,880.00 ج.م');
    assert.equal(formatArabicCurrency(-50), '-0.50 ج.م');
    assert.equal(formatArabicCurrency(0), '0.00 ج.م');
    assert.equal(formatThousands('1234567.5'), '1,234,567.5');
  });
});

describe('isValidMoneyText: MoneyInput typing guard', () => {
  it('accepts partial input while typing', () => {
    for (const ok of ['', '-', '.', '-.', '5', '5.', '5.5', '5.55', '-5.25', '.5', '99999999999', '99999999999.99']) {
      assert.equal(isValidMoneyText(ok), true, ok);
    }
  });

  it('rejects letters, exponents, 3 decimals and more than 11 integer digits', () => {
    for (const bad of ['abc', '1e5', '1.234', '--1', '1-', '123456789012', '1,5', ' 5']) {
      assert.equal(isValidMoneyText(bad), false, bad);
    }
  });
});

const rawShift = (over = {}) => ({
  id: 'shift_1',
  shiftNumber: 3,
  cashierId: 'u1',
  cashierName: 'المالك',
  posRegisterId: 'default_pos',
  businessDate: '2026-11-04',
  openedAt: '2026-11-04T08:00:00Z',
  closedAt: null,
  status: 'open',
  openingFloatPiasters: 50000,
  cashSalesPiasters: 125000,
  cardSalesPiasters: 48000,
  expectedCashPiasters: 171500,
  actualCashPiasters: 0,
  differencePiasters: 0,
  invoicesCount: 18,
  ...over,
});

const rawSummary = (over = {}) => ({
  shift: rawShift(),
  openingFloatPiasters: 50000,
  cashSalesPiasters: 125000,
  cardSalesPiasters: 48000,
  cashInPiasters: 0,
  cashOutPiasters: 0,
  expectedCashPiasters: 171500,
  availableCashInDrawerPiasters: 171500,
  invoicesCount: 18,
  recentMovements: [],
  ...over,
});

describe('normalizeShiftSummary: the contract of desktop ShiftSummary', () => {
  it('passes a full backend summary through with integer money', () => {
    const s = normalizeShiftSummary(rawSummary());
    assert.equal(s.expectedCashPiasters, 171500);
    assert.equal(s.cardSalesPiasters, 48000);
    assert.equal(s.shift.id, 'shift_1');
    assert.equal(s.invoicesCount, 18);
    // the summary above omits returnsCashPiasters: a missing field is reported once to the developer
    assert.ok(warnings.some((w) => w.includes('shiftSummary.returnsCashPiasters')));
  });

  it('defaults missing optional money fields to 0 instead of undefined/NaN', () => {
    const s = normalizeShiftSummary(rawSummary());
    for (const key of ['instapaySalesPiasters', 'vodafoneCashSalesPiasters', 'creditSalesPiasters', 'returnsCashPiasters', 'expensesCashPiasters']) {
      assert.equal(s[key], 0, key);
    }
  });

  it('returns null (so the modal shows an error) when expected cash is missing or invalid', () => {
    assert.equal(normalizeShiftSummary(null), null);
    assert.equal(normalizeShiftSummary(undefined), null);
    assert.equal(normalizeShiftSummary('x'), null);
    assert.equal(normalizeShiftSummary({ success: true, echoed: { shiftId: 's' } }), null, 'generic mock echo');
    assert.equal(normalizeShiftSummary(rawSummary({ expectedCashPiasters: undefined })), null);
    assert.equal(normalizeShiftSummary(rawSummary({ expectedCashPiasters: null })), null);
    assert.equal(normalizeShiftSummary(rawSummary({ expectedCashPiasters: Number.NaN })), null);
    assert.equal(normalizeShiftSummary(rawSummary({ expectedCashPiasters: '1500' })), null);
  });

  it('keeps a legitimately negative expected cash (drawer overdrawn)', () => {
    assert.equal(normalizeShiftSummary(rawSummary({ expectedCashPiasters: -500 })).expectedCashPiasters, -500);
  });

  it('sanitises nested movements and tolerates a missing shift', () => {
    const s = normalizeShiftSummary(
      rawSummary({ shift: undefined, recentMovements: [{ id: 'm1', type: 'cash_in', amountPiasters: 'x', reason: 'r' }, null, { type: 'cash_in' }] }),
    );
    assert.equal(s.shift, null);
    assert.equal(s.recentMovements.length, 1);
    assert.equal(s.recentMovements[0].amountPiasters, 0);
  });
});

describe('normalizeShift / normalizeShiftList', () => {
  it('rejects non-shift payloads (null, echo object, no id)', () => {
    assert.equal(normalizeShift(null), null);
    assert.equal(normalizeShift({ success: true, echoed: {} }), null);
    assert.equal(normalizeShift(rawShift({ id: '' })), null);
    assert.equal(normalizeShift([]), null);
  });

  it('closed shifts with null/undefined actual cash get 0, never undefined', () => {
    const closed = normalizeShift(rawShift({ status: 'closed', actualCashPiasters: null, differencePiasters: undefined }));
    assert.equal(closed.status, 'closed');
    assert.equal(closed.actualCashPiasters, 0);
    assert.equal(closed.differencePiasters, 0);
    assert.equal(formatArabicCurrency(closed.actualCashPiasters), '0.00 ج.م');
  });

  it('fills text fields and counts with safe defaults', () => {
    const s = normalizeShift({ id: 'x' });
    assert.equal(s.cashierName, '');
    assert.equal(s.shiftNumber, 0);
    assert.equal(s.invoicesCount, 0);
    assert.equal(s.isDanglingFromPreviousDay, false);
    assert.equal(s.closedAt, null);
  });

  it('list drops invalid entries and handles non-arrays', () => {
    assert.deepEqual(normalizeShiftList(undefined), []);
    assert.deepEqual(normalizeShiftList({}), []);
    assert.equal(normalizeShiftList([rawShift(), null, { foo: 1 }]).length, 1);
  });
});

describe('normalizeDrawerTransactions', () => {
  it('returns [] for non-arrays and keeps valid rows', () => {
    assert.deepEqual(normalizeDrawerTransactions(null), []);
    assert.deepEqual(normalizeDrawerTransactions({}), []);
    const out = normalizeDrawerTransactions([{ id: 'a', type: 'cash_out', amountPiasters: 2500, reason: 'توريد', performedByName: 'س', createdAt: 'x' }]);
    assert.equal(out[0].amountPiasters, 2500);
    assert.equal(out[0].type, 'cash_out');
  });
});

describe('getMovementTypeLabel: Arabic labels, raw value only for unknown codes', () => {
  it('maps the known codes in any letter case', () => {
    assert.equal(getMovementTypeLabel('cash_in'), 'إيداع');
    assert.equal(getMovementTypeLabel('cash_out'), 'سحب');
    assert.equal(getMovementTypeLabel('opening_float'), 'عهدة افتتاحية');
    assert.equal(getMovementTypeLabel('CASH_SALE'), 'مبيعات نقدية');
    assert.equal(getMovementTypeLabel('EXPENSE'), 'مصروف');
  });

  it('falls back to the raw code for unknown values and never to prototype keys', () => {
    assert.equal(getMovementTypeLabel('weird_code'), 'weird_code');
    assert.equal(getMovementTypeLabel('constructor'), 'constructor');
    assert.equal(getMovementTypeLabel(''), '');
  });
});

describe('ShiftModal source wiring (regression guards)', () => {
  const src = readFileSync(new URL('../src/components/ShiftModal.tsx', import.meta.url), 'utf8');

  it('feeds every backend payload through the normalisers and never reads raw summary fields', () => {
    assert.match(src, /normalizeShiftSummary\(/);
    assert.match(src, /normalizeShift\(/);
    assert.match(src, /normalizeDrawerTransactions\(/);
    assert.doesNotMatch(src, /setActualCashPiasters\(summary \? summary\.expectedCashPiasters : 0\)/);
    assert.doesNotMatch(src, /visaSalesPiasters/, 'the backend property is cardSalesPiasters');
    assert.doesNotMatch(src, /\.toFixed\(2\)/, 'money text goes through formatArabicCurrency');
  });

  it('shows no English words in visible labels', () => {
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const word of ['Cash In', 'Cash Out', 'Expected', 'Actual Counted Cash', "'cashier'"]) {
      assert.ok(!code.includes(word), `${word} must not appear in ShiftModal`);
    }
  });

  it('uses dark-aware notice tokens for every banner', () => {
    assert.match(src, /danger: 'bg-danger-soft dark:bg-danger-dark-soft [^']*dark:text-danger-bright'/);
    assert.match(src, /success: 'bg-paid-soft dark:bg-paid-dark-soft [^']*dark:text-paid-bright'/);
    assert.doesNotMatch(src, /bg-danger\/10 border-b|bg-paid-soft border-b/);
  });
});
