import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { poundsToPiasters, normalizeArabicNumerals } from '../src/utils/money.ts';
import { buildCashQuickPresetsPiasters, piastersToInputText } from '../src/components/payment/cashPresets.ts';

// The cash payment dialog opens with an EMPTY received-amount field. '' must mean "nothing received yet"
// (0 piasters) in every consumer, exactly like the previous pre-filled '0'.
const COMPONENTS = fileURLToPath(new URL('../src/components/', import.meta.url));
const PAYMENT_DIR = join(COMPONENTS, 'payment');
const read = (p) => readFileSync(p, 'utf8');
const modalSrc = read(join(COMPONENTS, 'PaymentModal.tsx'));
const cashSrc = read(join(PAYMENT_DIR, 'CashPaymentSection.tsx'));
const paymentSources = readdirSync(PAYMENT_DIR)
  .filter((f) => f.endsWith('.tsx'))
  .map((f) => ({ f, src: read(join(PAYMENT_DIR, f)) }))
  .concat([{ f: 'PaymentModal.tsx', src: modalSrc }]);

describe('received amount: empty input is read as zero piasters', () => {
  it('poundsToPiasters never returns NaN for empty or blank text', () => {
    for (const blank of ['', ' ', '   ', '.', '+', '-']) {
      const v = poundsToPiasters(blank);
      assert.equal(Number.isNaN(v), false, `poundsToPiasters(${JSON.stringify(blank)}) is NaN`);
      assert.equal(v, 0, `poundsToPiasters(${JSON.stringify(blank)}) must be 0`);
    }
  });

  it("the modal's input pipeline (normalize then parse) maps '' and Arabic zero to 0 and keeps real amounts", () => {
    const parse = (raw) => poundsToPiasters(normalizeArabicNumerals(raw));
    assert.equal(parse(''), 0);
    assert.equal(parse('٠'), 0);
    assert.equal(parse('0'), 0);
    assert.equal(parse('٥٠٠'), 50000);
    assert.equal(parse('١٢٥٫٥'), 12550);
    assert.equal(parse('42.5'), 4250);
  });

  it('the input mask accepts the empty string so the field can be cleared', () => {
    assert.match(modalSrc, /\/\^\[0-9\]\*\\\.\?\[0-9\]\{0,2\}\$\//);
    assert.ok(/^[0-9]*\.?[0-9]{0,2}$/.test(''));
  });

  it('preset text and presets are derived from integer piasters, not from the field text', () => {
    assert.equal(piastersToInputText(4200), '42');
    assert.equal(piastersToInputText(4250), '42.50');
    assert.deepEqual(buildCashQuickPresetsPiasters(4200), [4200, 5000, 10000, 20000]);
  });
});

describe('PaymentModal / CashPaymentSection start empty', () => {
  it("never pre-fills '0' (initial state, open reset and full-credit reset are all '')", () => {
    assert.doesNotMatch(modalSrc, /setReceivedInput\('0'\)/);
    assert.doesNotMatch(modalSrc, /useState<string>\(\(\) => piastersToInputText/);
    assert.match(modalSrc, /useState<string>\(''\)/);
    assert.equal((modalSrc.match(/setReceivedInput\(''\)/g) || []).length, 2, 'open reset + full-credit reset');
  });

  it('keeps auto-focus on open but no longer selects a placeholder zero', () => {
    assert.match(modalSrc, /receivedInputRef\.current\?\.focus\(\)/);
    assert.doesNotMatch(modalSrc, /receivedInputRef\.current\?\.select\(\)/);
  });

  it("isDirty reads '' and '0' the same way (derived from piasters, not from the text)", () => {
    assert.match(modalSrc, /const receivedModified = receivedPiasters > 0;/);
    assert.doesNotMatch(modalSrc, /receivedInput !== '0'/);
  });

  it('shows a small neutral Arabic placeholder instead of a big 0.00', () => {
    assert.doesNotMatch(cashSrc, /placeholder="0\.00"/);
    assert.match(cashSrc, /placeholder="اكتب المبلغ المستلم"/);
    assert.match(cashSrc, /placeholder:text-sm/);
    assert.match(cashSrc, /placeholder:font-sans/);
    assert.match(cashSrc, /ج\.م/, 'currency suffix label stays');
  });

  it('credit/short/change consumers still branch on receivedPiasters === 0, never on the text', () => {
    assert.match(modalSrc, /receivedPiasters === 0 && hasRegisteredCustomer/);
    assert.match(cashSrc, /receivedPiasters === 0 && hasRegisteredCustomer/);
    assert.match(read(join(PAYMENT_DIR, 'PaymentStatusCard.tsx')), /if \(receivedPiasters === 0\) \{\s*return \(/);
    assert.match(modalSrc, /const isShortPayment = receivedPiasters > 0 && receivedPiasters < netTotalPiasters;/);
  });

  it('Enter belongs to the focused form, dropdown menu, plain button or textarea and never completes the sale from there', () => {
    assert.match(modalSrc, /const isPlainButton = target\.tagName === 'BUTTON' && target\.getAttribute\('role'\) !== 'switch';/);
    assert.match(modalSrc, /target\.closest\('form, textarea, \[data-select-menu\]'\)/);
    const select = read(join(COMPONENTS, 'CustomSelect.tsx'));
    assert.match(select, /data-select-menu=""/, 'the dropdown menu is recognisable by the dialog');
  });

  it('the Enter that opens a confirmation is stopped so the global dialog listener cannot auto-accept it', () => {
    assert.match(modalSrc, /e\.preventDefault\(\);\s*\/\/[^\n]*\n\s*e\.stopPropagation\(\);\s*void handleConfirm\(\);/);
  });
});

describe('payment dialog uses design tokens only', () => {
  it('no hex colours, legacy palettes, px text sizes, emojis or optional-field wording', () => {
    for (const { f, src } of paymentSources) {
      assert.doesNotMatch(src, /\[#[0-9a-fA-F]{3,8}\]/, `${f}: arbitrary hex colour`);
      assert.doesNotMatch(src, /-(slate|amber|emerald|gray|zinc|stone|purple|red|green|yellow)-\d{2,3}/, `${f}: palette colour`);
      assert.doesNotMatch(src, /(?:bg|border)-white(?:\/\d+)?(?![\w-])/, `${f}: raw white surface`);
      assert.doesNotMatch(src, /text-\[\d+(?:\.\d+)?px\]/, `${f}: px text size`);
      assert.doesNotMatch(src, /اختياري/, `${f}: optional wording`);
      assert.doesNotMatch(src, /\p{Extended_Pictographic}/u, `${f}: emoji`);
      assert.doesNotMatch(src, /<select[\s>]/, `${f}: native select`);
    }
  });

  it('there is no dead payment component left behind', () => {
    assert.equal(existsSync(join(PAYMENT_DIR, 'CreditPaymentSection.tsx')), false);
    for (const name of ['CashPaymentSection', 'CustomerPicker', 'PaymentSummary', 'PaymentStatusCard', 'QuickAddCustomerForm']) {
      assert.ok(paymentSources.some(({ src }) => src.includes(`<${name}`)), `${name} is not used`);
    }
  });

  it('the confirm button and cancel sit in a fixed footer; the body only scrolls as a last resort', () => {
    assert.match(modalSrc, /h-\[min\(46rem,100%\)\] flex flex-col overflow-hidden/);
    assert.match(modalSrc, /flex-1 min-h-0 overflow-y-auto/);
    assert.match(modalSrc, /h-\[4\.5rem\][^"]*hairline-t[^"]*shrink-0/);
    assert.match(modalSrc, /h-12 min-w-72 px-6 rounded-lg/);
  });
});

describe('payment dialog keeps one fixed size in every state', () => {
  const picker = read(join(PAYMENT_DIR, 'CustomerPicker.tsx'));
  const quickAdd = read(join(PAYMENT_DIR, 'QuickAddCustomerForm.tsx'));
  const status = read(join(PAYMENT_DIR, 'PaymentStatusCard.tsx'));
  const summary = read(join(PAYMENT_DIR, 'PaymentSummary.tsx'));

  it('has no max-height that lets the dialog shrink and grow with its content', () => {
    assert.doesNotMatch(modalSrc, /max-h-\[/);
  });

  it('the quick-add form replaces the picker inside the same card instead of adding a block', () => {
    assert.match(picker, /quickAddOpen \? \(\s*children\s*\) : \(/);
    assert.match(picker, /flex-1 min-h-0 rounded-xl/);
    assert.match(modalSrc, /quickAddOpen=\{showQuickAdd\}/);
    assert.doesNotMatch(modalSrc, /\{showQuickAdd && \(\s*<QuickAddCustomerForm/);
    assert.doesNotMatch(quickAdd, /<form[^>]*border/);
  });

  it('the status card always renders a placeholder in the reserved region (never null)', () => {
    assert.doesNotMatch(status, /return null;/);
    assert.match(status, /h-full min-h-0/);
  });

  it('the discount line under the total is always rendered (fixed h-4)', () => {
    assert.match(summary, /h-4 text-xs leading-4/);
    assert.match(summary, /مفيش خصم على الفاتورة/);
  });
});

describe('quick-add customer labels are short', () => {
  const quickAdd = read(join(PAYMENT_DIR, 'QuickAddCustomerForm.tsx'));
  it("save button says 'حفظ' / 'جاري الحفظ...' and the duplicate action says 'اختيار'", () => {
    assert.match(quickAdd, /quickSaving \? 'جاري الحفظ\.\.\.' : 'حفظ'/);
    assert.doesNotMatch(quickAdd, /حفظ واختيار الزبون/);
    assert.match(quickAdd, /onSelectDuplicateCustomer\(duplicateQuickCustomer\)/);
    assert.match(quickAdd, />\s*اختيار\s*</);
  });
});

describe('credit confirmations are short and the full-credit click no longer shows a wall of text', () => {
  it('the two old long dialogs are gone and replaced by title + one line + the amount', () => {
    assert.doesNotMatch(modalSrc, /تأكيد تسجيل الفاتورة على الحساب/);
    assert.doesNotMatch(modalSrc, /تأكيد الدفع الجزئي وتسجيل الباقي كآجل/);
    assert.doesNotMatch(modalSrc, /تفاصيل العملية/);
    assert.match(modalSrc, /title: 'تسجيل الفاتورة على الحساب'/);
    assert.match(modalSrc, /title: 'تسجيل الباقي على الحساب'/);
    assert.equal((modalSrc.match(/variant: 'warning',\s*\}\);\s*if \(!confirm(OnAccount|Short)\) return;/g) || []).length, 2);
  });

  it('money math of the on-account amounts is unchanged', () => {
    assert.match(modalSrc, /Math\.max\(0, netTotalPiasters - Math\.max\(0, -selectedCustomer\.balancePiasters\)\)/);
    assert.match(modalSrc, /amountPiasters: shortAmountPiasters,\s*method: 'credit'/);
  });

  it('the confirm button names the credit actions', () => {
    assert.match(modalSrc, /'إتمام البيع على الحساب'/);
    assert.match(modalSrc, /'إتمام البيع والباقي على الحساب'/);
  });
});

describe('receipt print switch', () => {
  it('reads the preference fresh on every open and persists every change', () => {
    assert.match(modalSrc, /from '\.\.\/utils\/receiptPrintPreference'/);
    assert.match(modalSrc, /useState<boolean>\(\(\) => shouldPrintReceipt\(\)\)/);
    assert.match(modalSrc, /setPrintReceipt\(shouldPrintReceipt\(\)\);/);
    assert.match(modalSrc, /setReceiptPrintPreference\(value\);/);
  });

  it('uses the shared ToggleSwitch with the label "طباعة الوصل" tied to it', () => {
    assert.match(modalSrc, /import \{ ToggleSwitch \} from '\.\/ToggleSwitch'/);
    assert.match(modalSrc, /htmlFor="payment-print-receipt-switch"/);
    assert.match(modalSrc, /id="payment-print-receipt-switch"/);
    assert.match(modalSrc, /طباعة الوصل\s*<\/label>/);
  });

  it('the confirm label names the process, not the technical steps', () => {
    assert.match(modalSrc, /let confirmLabel = 'إتمام البيع';/);
    assert.ok(!modalSrc.includes('حفظ الفاتورة وطباعة الوصل'), 'no label that spells out save + print');
  });

  it('Enter on the focused switch still confirms and the report to PosView is unchanged', () => {
    assert.match(modalSrc, /onKeyDownCapture=\{\(e\) => \{\s*if \(e\.key === 'Enter'\) \{\s*e\.stopPropagation\(\);\s*handleKeyDown\(e\);/);
    assert.doesNotMatch(modalSrc, /printReceipt[^\n]*onConfirmPayment|onConfirmPayment\([^)]*printReceipt/);
  });
});
