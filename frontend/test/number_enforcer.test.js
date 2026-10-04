import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { 
  normalizeArabicDigits, 
  normalizeNumericInput, 
  installGlobalNumeralEnforcer 
} from '../src/utils/numberEnforcer.ts';
import { 
  formatNumber, 
  formatDateOnly, 
  formatTimeOnly, 
  formatDateTime,
  formatArabicCurrency,
  poundsToPiasters
} from '../src/utils/money.ts';

describe('Global Numeral Enforcer & Arabic-Indic Digits Elimination Test Suite', () => {
  before(() => {
    installGlobalNumeralEnforcer();
  });

  describe('1. normalizeArabicDigits & normalizeNumericInput', () => {
    it('accurately normalizes Eastern Arabic numerals ٠١٢٣٤٥٦٧٨٩ to 0123456789', () => {
      assert.equal(normalizeArabicDigits('٠١٢٣٤٥٦٧٨٩'), '0123456789');
    });

    it('accurately normalizes Persian / Urdu numerals ۰۱۲۳۴۵۶۷۸۹ to 0123456789', () => {
      assert.equal(normalizeArabicDigits('۰۱۲۳۴۵۶۷۸۹'), '0123456789');
    });

    it('normalizes mixed text preserving Arabic words and punctuation', () => {
      const input = 'إجمالي الفاتورة رقم ١٠٤٢ هو ٢٥٠ ج.م، تم البيع بنجاح';
      const expected = 'إجمالي الفاتورة رقم 1042 هو 250 ج.م، تم البيع بنجاح';
      assert.equal(normalizeArabicDigits(input), expected);
    });

    it('normalizes Arabic decimal comma in numeric inputs', () => {
      assert.equal(normalizeNumericInput('١٥٫٥٠'), '15.50');
      assert.equal(normalizeNumericInput('١٥،٥٠'), '15.50');
      assert.equal(poundsToPiasters('١٥٫٥٠'), 1550);
      assert.equal(poundsToPiasters('١٥،٥٠'), 1550);
    });

    it('safely handles null, undefined, empty and number types', () => {
      assert.equal(normalizeArabicDigits(null), '');
      assert.equal(normalizeArabicDigits(undefined), '');
      assert.equal(normalizeArabicDigits(''), '');
      assert.equal(normalizeArabicDigits(12345), '12345');
    });
  });

  describe('2. Intercepted Number.prototype.toLocaleString', () => {
    it('strictly outputs Latin digits even when ar-EG is requested', () => {
      const num = 12345;
      const formatted = num.toLocaleString('ar-EG');
      assert.match(formatted, /12/);
      assert.doesNotMatch(formatted, /[٠-٩۰-۹]/);
    });

    it('strictly outputs Latin digits with default toLocaleString()', () => {
      const num = 987654;
      const formatted = num.toLocaleString();
      assert.match(formatted, /987/);
      assert.doesNotMatch(formatted, /[٠-٩۰-۹]/);
    });

    it('preserves fraction digits with Latin numerals', () => {
      const num = 123.45;
      const formatted = num.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      assert.match(formatted, /123/);
      assert.doesNotMatch(formatted, /[٠-٩۰-۹]/);
    });
  });

  describe('3. Intercepted Date formatting methods', () => {
    const testDate = new Date(2026, 9, 4, 15, 30, 0); // 4 Oct 2026 15:30

    it('toLocaleDateString outputs Latin numbers even when ar-EG is requested', () => {
      const str = testDate.toLocaleDateString('ar-EG');
      assert.match(str, /2026/);
      assert.match(str, /4|10/);
      assert.doesNotMatch(str, /[٠-٩۰-۹]/);
    });

    it('toLocaleTimeString outputs Latin numbers even when ar-EG is requested', () => {
      const str = testDate.toLocaleTimeString('ar-EG');
      assert.match(str, /3|15/);
      assert.doesNotMatch(str, /[٠-٩۰-۹]/);
    });

    it('toLocaleString outputs Latin numbers even when ar-EG is requested', () => {
      const str = testDate.toLocaleString('ar-EG');
      assert.match(str, /2026/);
      assert.doesNotMatch(str, /[٠-٩۰-۹]/);
    });
  });

  describe('4. Intercepted Intl.NumberFormat & Intl.DateTimeFormat', () => {
    it('Intl.NumberFormat strictly formats numbers in Latin digits', () => {
      const formatter = new Intl.NumberFormat('ar-EG');
      const res = formatter.format(54321);
      assert.match(res, /54/);
      assert.doesNotMatch(res, /[٠-٩۰-۹]/);
    });

    it('Intl.DateTimeFormat strictly formats dates in Latin digits', () => {
      const formatter = new Intl.DateTimeFormat('ar-EG');
      const res = formatter.format(new Date(2026, 9, 4));
      assert.match(res, /2026/);
      assert.doesNotMatch(res, /[٠-٩۰-۹]/);
    });
  });

  describe('5. High-level centralized formatters in money.ts', () => {
    it('formatNumber outputs formatted Latin digits with thousand separators', () => {
      assert.equal(formatNumber(15000), '15,000');
      assert.equal(formatNumber('١٥٠٠٠'), '15,000');
      assert.equal(formatNumber(25.5, 2, 2), '25.50');
    });

    it('formatArabicCurrency outputs formatted price with symbol and Latin digits', () => {
      assert.equal(formatArabicCurrency(1550), '15.50 ج.م');
      assert.equal(formatArabicCurrency(100000), '1,000.00 ج.م');
    });

    it('formatDateOnly outputs uniform Latin digits', () => {
      const d = new Date(2026, 9, 4);
      const res = formatDateOnly(d);
      assert.match(res, /2026/);
      assert.doesNotMatch(res, /[٠-٩۰-۹]/);
    });

    it('formatTimeOnly outputs uniform Latin digits', () => {
      const d = new Date(2026, 9, 4, 14, 25);
      const res = formatTimeOnly(d);
      assert.match(res, /14|2|25/);
      assert.doesNotMatch(res, /[٠-٩۰-۹]/);
    });

    it('formatDateTime outputs uniform Latin digits', () => {
      const d = new Date(2026, 9, 4, 14, 25);
      const res = formatDateTime(d);
      assert.match(res, /2026/);
      assert.doesNotMatch(res, /[٠-٩۰-۹]/);
    });
  });
});
