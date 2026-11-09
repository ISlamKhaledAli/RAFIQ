import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Source guards for the cashier-screen polish: cart rows, every discount dialog and the digital (InstaPay / wallet) dialog
// must stay on theme tokens with dark pairs, and the digital dialog must keep one total, one confirm button, a fixed footer.
const read = (rel) => readFileSync(fileURLToPath(new URL(`../src/${rel}`, import.meta.url)), 'utf8');

const SURFACES = {
  'views/pos/PosCartTable.tsx': read('views/pos/PosCartTable.tsx'),
  'views/pos/PosCartCheckoutBar.tsx': read('views/pos/PosCartCheckoutBar.tsx'),
  'views/pos/PosInvoiceDiscountModal.tsx': read('views/pos/PosInvoiceDiscountModal.tsx'),
  'components/ItemDiscountModal.tsx': read('components/ItemDiscountModal.tsx'),
  'components/discount/DiscountEntry.tsx': read('components/discount/DiscountEntry.tsx'),
  'components/DigitalPaymentModal.tsx': read('components/DigitalPaymentModal.tsx'),
  'components/payment/ReceivingAccountCard.tsx': read('components/payment/ReceivingAccountCard.tsx'),
};

const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('cashier polish: theme tokens only', () => {
  for (const [name, src] of Object.entries(SURFACES)) {
    const code = stripComments(src);

    it(`${name} has no hex colours, palette classes or arbitrary text sizes`, () => {
      assert.doesNotMatch(code, /(?:bg|text|border|ring|from|to|via)-\[#/, 'hex colour in a class');
      assert.doesNotMatch(code, /\b(?:bg|text|border|ring|divide|fill|stroke)-(?:slate|gray|zinc|neutral|stone|amber|emerald|purple|cyan|red|green|blue|sky|teal|indigo|violet|pink|rose|orange|yellow|lime|fuchsia)-\d{2,3}/, 'palette class');
      assert.doesNotMatch(code, /text-\[\d/, 'arbitrary px text size');
      assert.doesNotMatch(code, /اختيار[يى]/);
    });

    it(`${name} gives every light surface/ink token a dark pair`, () => {
      const literals = [...code.matchAll(/(["'`])((?:(?!\1)[^\\\n]|\\.)*?)\1/g)].map((m) => m[2].split(/\s+/).filter(Boolean));
      const lone = [];
      for (const tokens of literals) {
        if (tokens.length < 2) continue;
        const dark = tokens.filter((t) => t.startsWith('dark:'));
        const light = tokens.filter((t) => /^(?:bg-(?:surface|surface-2|surface-3)|text-ink|text-ink-muted|border-line)$/.test(t));
        for (const t of light) {
          const prefix = t.replace(/^(bg|text|border)-.*/, '$1');
          if (!dark.some((d) => d.startsWith(`dark:${prefix}-`))) lone.push(`${t} in "${tokens.join(' ').slice(0, 60)}"`);
        }
      }
      assert.deepEqual(lone, []);
    });
  }
});

describe('line and invoice discount dialogs share one themed entry', () => {
  it('both dialogs render DiscountEntry and no longer carry their own toggle/preset markup', () => {
    for (const name of ['components/ItemDiscountModal.tsx', 'views/pos/PosInvoiceDiscountModal.tsx']) {
      assert.match(SURFACES[name], /<DiscountEntry/, name);
      assert.doesNotMatch(SURFACES[name], /<Banknote|<Percent/, `${name} still builds its own toggle`);
    }
  });

  it('the selected segment is a dark tint with bright text in dark mode (never a dark fill)', () => {
    const src = SURFACES['components/discount/DiscountEntry.tsx'];
    const block = src.slice(src.indexOf('const SEGMENT_ON'), src.indexOf('const SEGMENT_OFF'));
    assert.ok(block.length > 0, 'SEGMENT_ON constant is missing');
    assert.match(block, /dark:bg-brand-dark-soft/);
    assert.match(block, /dark:text-brand-bright/);
    assert.match(block, /dark:border-brand-bright/);
  });

  it('the value input has a single text colour per theme and a 3:1 resting border in both themes', () => {
    const src = SURFACES['components/discount/DiscountEntry.tsx'];
    const input = src.slice(src.indexOf('<input'), src.indexOf('/>', src.indexOf('<input')));
    assert.equal((input.match(/dark:text-/g) || []).length, 1);
    assert.match(input, /border-ink-muted\/70/);
    assert.match(input, /dark:border-ink-dark-muted\/70/);
  });

  it('the value field is labelled as required with the shared mark', () => {
    assert.match(SURFACES['components/discount/DiscountEntry.tsx'], /<RequiredMark \/>/);
  });
});

describe('digital payment dialog layout', () => {
  const src = SURFACES['components/DigitalPaymentModal.tsx'];

  it('shows the total once and has a single confirm button', () => {
    assert.equal((src.match(/\{totalLabel\}/g) || []).length, 1);
    assert.equal((src.match(/onClick=\{handleConfirm\}/g) || []).length, 1);
    assert.equal((src.match(/تأكيد استلام التحويل/g) || []).length, 2); // button label + the reminder that quotes it
  });

  it('keeps the footer outside the scrolling body with a 48px primary button', () => {
    assert.match(src, /flex-1 min-h-0 overflow-y-auto/);
    const footer = src.slice(src.indexOf('Footer: always visible'));
    assert.match(footer, /shrink-0/);
    assert.match(footer, /<AppButton variant="success" size="lg"[\s\S]*?className="h-12 flex-1"/);
  });

  it('keeps the money math: the confirmed amount is the net total, paid in full, no change', () => {
    assert.match(src, /paidPiasters: netTotalPiasters/);
    assert.match(src, /amountPiasters: netTotalPiasters/);
    assert.match(src, /changeDuePiasters: 0/);
  });

  it('uses the shared CustomerPicker (CustomSelect with a 44px trigger, never a native select)', () => {
    assert.doesNotMatch(src, /<select/);
    assert.match(src, /<CustomerPicker/);
    assert.match(read('components/payment/CustomerPicker.tsx'), /\[&>button\]:min-h-11/);
  });

  it('registers a new customer through the shared quick-add hook and form, like the cash dialog', () => {
    assert.match(src, /useQuickAddCustomer\(customers, handleCustomerSelect\)/);
    assert.match(src, /customers=\{localCustomers\}/);
    assert.match(src, /<QuickAddCustomerForm/);
    assert.match(src, /customerRequired=\{false\}/);
    assert.match(src, /hint="[^"]+"/);
    assert.doesNotMatch(src, /على الحساب أو هتدفع جزء منها/);
  });

  it('counts unsaved quick-add input as dirty and resets the form once per open', () => {
    assert.match(src, /isDirty = customerModified \|\| hasQuickAddInput/);
    assert.match(src, /isOpen && !prevIsOpenRef\.current\)[\s\S]{0,200}resetQuickAdd\(\)/);
  });

  it('Enter inside the quick-add form saves the customer and never confirms the payment', () => {
    const handler = src.slice(src.indexOf('const handleKeyDown'), src.indexOf('if (!isOpen) return null'));
    assert.match(handler, /closest\('form, button, input, textarea'\)/);
    assert.match(handler, /e\.stopPropagation\(\)/);
  });

  it('keeps one fixed outer box so no state (quick-add, duplicate, saving, account) resizes the dialog', () => {
    assert.match(src, /h-\[min\(38\.8125rem,92vh\)\]/);
    assert.doesNotMatch(src, /max-h-full/);
    assert.match(src, /md:grid-rows-\[minmax\(0,1fr\)\]/);
  });
});

describe('customer picker hint', () => {
  const picker = read('components/payment/CustomerPicker.tsx');

  it('keeps the cash wording as the default and lets a dialog replace or hide it', () => {
    assert.match(picker, /hint = DEFAULT_HINT/);
    assert.match(picker, /DEFAULT_HINT = 'اختار الزبون لو هتسجل الفاتورة على الحساب أو هتدفع جزء منها\.'/);
    assert.match(picker, /\{hint && \(/);
  });
});

describe('cart rows', () => {
  const src = SURFACES['views/pos/PosCartTable.tsx'];

  it('keeps a quantity input that can show five digits and money that never wraps', () => {
    assert.match(src, /className="w-14 h-9 text-center/);
    assert.match(src, /whitespace-nowrap">\{formatArabicCurrency\(item\.totalPiasters, false\)\}/);
  });

  it('marks weighed items with a distinct accent and keeps a stable accent slot for the rest', () => {
    assert.match(src, /isWeighed \? 'border-s-brand dark:border-s-brand-bright' : 'border-s-transparent'/);
  });

  it('renders a non-interactive batch badge (not a disabled button) when the cashier cannot change the batch', () => {
    assert.match(src, /canSelectBatch && onOpenBatchSelection \?/);
    assert.doesNotMatch(src, /disabled=\{!canSelectBatch/);
  });
});
