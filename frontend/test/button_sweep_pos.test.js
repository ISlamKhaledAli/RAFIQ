import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Zone 6 of the button sweep: the cashier screen, the payment dialogs and the POS pickers.
const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const read = (rel) => readFileSync(join(SRC, rel), 'utf8').replace(/\r\n/g, '\n');

const POS_DIR = 'views/pos';
const PAYMENT_DIR = 'components/payment';
const ZONE_FILES = [
  'views/PosView.tsx',
  ...readdirSync(join(SRC, POS_DIR)).filter((f) => f.endsWith('.tsx')).map((f) => `${POS_DIR}/${f}`),
  ...readdirSync(join(SRC, PAYMENT_DIR)).filter((f) => f.endsWith('.tsx')).map((f) => `${PAYMENT_DIR}/${f}`),
  'components/PaymentModal.tsx',
  'components/DigitalPaymentModal.tsx',
  'components/ProductUnitPickerModal.tsx',
  'components/ProductVariantPickerModal.tsx',
  'components/WeightInputModal.tsx',
  'components/BarcodeScannerSettingsModal.tsx',
  'components/ExpenseModal.tsx',
];
const sources = ZONE_FILES.map((f) => ({ f, src: read(f) }));

// Raw <button> elements that deliberately keep their own classes (documented specials), by file.
// - PosCartCheckoutBar: PAY_BTN / SECONDARY_BTN are the cashier's large payment and secondary action surfaces.
// - PosCategoriesPanel / PosCartTable: category rail cards and the h-9 quantity stepper / h-6 row chips.
// - Tabs, option cards and segmented controls keep their selected-state classes (they are not AppButton).
const SOLID_FILL_ALLOWED = new Set([
  'views/pos/PosCartCheckoutBar.tsx',
  'views/pos/PosCategoriesPanel.tsx',
  'views/pos/PosCartTable.tsx',
  'views/pos/PosOrderModeBar.tsx',
  'views/pos/DeliveryCommandModal.tsx',
  'views/pos/FloorTablesModal.tsx',
  'views/pos/DrugAlternativesDrawer.tsx',
  'views/pos/ItemModifiersModal.tsx',
  'components/ProductVariantPickerModal.tsx',
  'components/WeightInputModal.tsx',
  'components/ExpenseModal.tsx',
  'components/payment/PaymentStatusCard.tsx',
]);

// Returns each raw <button ...>...</button> as { open, body, line }.
function rawButtons(src) {
  const out = [];
  let i = 0;
  while ((i = src.indexOf('<button', i)) !== -1) {
    let depth = 0;
    let j = i + 7;
    for (; j < src.length; j += 1) {
      const c = src[j];
      if (c === '{') depth += 1;
      else if (c === '}') depth -= 1;
      else if (c === '>' && depth === 0) break;
    }
    const end = src.indexOf('</button>', j);
    out.push({ open: src.slice(i, j + 1), body: src.slice(j + 1, end), line: src.slice(0, i).split('\n').length });
    i = end + 9;
  }
  return out;
}

describe('button sweep, zone 6 (cashier screen and payment dialogs)', () => {
  it('uses the shared AppButton in every converted file', () => {
    const mustUse = [
      'views/pos/PosBarcodeBar.tsx',
      'views/pos/PosCatalogPanel.tsx',
      'views/pos/PosCartCheckoutBar.tsx',
      'views/pos/PosCartTable.tsx',
      'views/pos/PosFooterBar.tsx',
      'views/pos/PosOrderModeBar.tsx',
      'views/pos/HeldSalePriceReviewModal.tsx',
      'views/pos/PosQuantityModal.tsx',
      'views/pos/PosInvoiceDiscountModal.tsx',
      'views/pos/OpenPriceModal.tsx',
      'views/pos/FloorTablesModal.tsx',
      'components/PaymentModal.tsx',
      'components/DigitalPaymentModal.tsx',
      'components/payment/CashPaymentSection.tsx',
      'components/payment/QuickAddCustomerForm.tsx',
      'components/WeightInputModal.tsx',
      'components/ProductVariantPickerModal.tsx',
      'components/BarcodeScannerSettingsModal.tsx',
      'components/ExpenseModal.tsx',
    ];
    for (const f of mustUse) {
      assert.match(read(f), /import \{ AppButton \} from '[./]+(?:components\/)?AppButton';/, `${f}: AppButton is not imported`);
    }
  });

  it('keeps the two special checkout surfaces and nothing else of the old constant sets', () => {
    const checkout = read('views/pos/PosCartCheckoutBar.tsx');
    assert.match(checkout, /const PAY_BTN =/);
    assert.match(checkout, /const SECONDARY_BTN =/);
    for (const { f, src } of sources) {
      assert.doesNotMatch(src, /\b(QUICK_BTN\w*|PRIMARY_BUTTON_CLASS|SECONDARY_BUTTON_CLASS|DANGER_BUTTON_CLASS|SAVE_BUTTON|DISCARD_BUTTON|STAY_BUTTON|BTN_PRIMARY|BTN_SECONDARY|FOOTER_BTN|PRESET_BASE|PRESET_IDLE|PRESET_SELECTED|ROW_ICON_BTN)\b/, `${f}: leftover local button constant`);
    }
  });

  it('has no retired heights, dead classes, palette colours, hex colours or emoji', () => {
    for (const { f, src } of sources) {
      assert.doesNotMatch(src, /\bh-8\.5\b/, `${f}: h-8.5`);
      assert.doesNotMatch(src, /active:scale-98\b/, `${f}: active:scale-98`);
      assert.doesNotMatch(src, /\bwarn-dark(?![-\w])/, `${f}: warn-dark`);
      assert.doesNotMatch(src, /\b(?:danger-hover|warn-hover|brand-darker)\b/, `${f}: dead colour token`);
      // The purple "variants" badges on the product grid cards are not buttons and stay as designed (owner: do not restyle the cards).
      const palette = f === 'views/pos/PosCatalogPanel.tsx' ? /\b(?:hover:)?(?:bg|text|border)-(?:red|green|emerald|slate|gray|amber|yellow|blue)-\d{2,3}\b/ : /\b(?:hover:)?(?:bg|text|border)-(?:red|green|emerald|purple|slate|gray|amber|yellow|blue)-\d{2,3}\b/;
      assert.doesNotMatch(src, palette, `${f}: palette colour`);
      assert.doesNotMatch(src, /\[#[0-9a-fA-F]{3,8}\]/, `${f}: arbitrary hex colour`);
      assert.doesNotMatch(src, /\p{Extended_Pictographic}/u, `${f}: emoji`);
    }
  });

  it('never hand-writes a solid brand/paid/danger/warn fill on a raw button outside the documented specials', () => {
    for (const { f, src } of sources) {
      if (SOLID_FILL_ALLOWED.has(f)) continue;
      for (const b of rawButtons(src)) {
        assert.doesNotMatch(b.open, /(?<![-\w:/])bg-(?:brand|paid|danger|warn)(?![-\w])/, `${f}:${b.line}: solid fill on a raw button, use AppButton`);
      }
    }
  });

  it('gives every raw button a type and every icon-only raw button an aria-label', () => {
    for (const { f, src } of sources) {
      for (const b of rawButtons(src)) {
        assert.match(b.open, /\btype=/, `${f}:${b.line}: raw button without type`);
        if (/role="switch"/.test(b.open)) continue; // named by its <label htmlFor>
        const textless = b.body.replace(/<[A-Za-z][\w.]*\b[^<>]*\/>/g, '').replace(/[{}\s]/g, '') === '';
        const ternaryIcon = /\? <\w+ [^>]*\/> :/.test(b.body);
        if (textless || ternaryIcon) {
          assert.match(b.open, /aria-label=/, `${f}:${b.line}: icon-only raw button without aria-label`);
        }
      }
    }
  });

  it('keeps the cashier targets: checkout buttons h-11 / min-h-14, cart stepper and delete controls unchanged in size', () => {
    const checkout = read('views/pos/PosCartCheckoutBar.tsx');
    assert.match(checkout, /const SECONDARY_BTN =\s*'h-11 /);
    assert.match(checkout, /const PAY_BTN =\s*'[^']*min-h-14 /);
    const cart = read('views/pos/PosCartTable.tsx');
    assert.equal((cart.match(/w-9 h-9 flex items-center justify-center/g) || []).length, 2, 'quantity +/- stay w-9 h-9');
    assert.match(cart, /variant="dangerSubtle"\s+size="xs"\s+icon=\{Trash2\}/, 'row delete is the h-7 icon + word button, neutral until hovered (red on hover)');
  });

  it('shows the same primary "تسجيل نواقص" action on the POS catalog header as on the shortages page', () => {
    const catalog = read('views/pos/PosCatalogPanel.tsx');
    assert.match(catalog, /<AppButton\s+variant="primary"\s+size="xs"\s+icon=\{ClipboardList\}[\s\S]*?تسجيل نواقص/);
  });

  it('keeps the payment dialog footers at the fixed 48px size inside their fixed-height footer', () => {
    const cash = read('components/PaymentModal.tsx');
    assert.match(cash, /h-\[4\.5rem\][^"]*hairline-t[^"]*shrink-0/);
    assert.match(cash, /<AppButton variant="primary" size="lg"[\s\S]*?className="h-12 min-w-72"/);
    const digital = read('components/DigitalPaymentModal.tsx');
    assert.match(digital, /<AppButton variant="success" size="lg"[\s\S]*?className="h-12 flex-1"/);
  });

  it('keeps the cash presets as h-11 toggle buttons with aria-pressed and the Enter handling untouched', () => {
    const cash = read('components/payment/CashPaymentSection.tsx');
    assert.equal((cash.match(/aria-pressed=/g) || []).length, 3);
    assert.match(cash, /size="lg"/);
    const modal = read('components/PaymentModal.tsx');
    assert.match(modal, /onKeyDownCapture=\{\(e\) => \{\s+if \(e\.key === 'Enter'\) \{\s+e\.stopPropagation\(\);\s+handleKeyDown\(e\);/);
  });

  it('lets the catalog header chips wrap instead of overflowing when every feature is on', () => {
    const catalog = read('views/pos/PosCatalogPanel.tsx');
    assert.match(catalog, /flex flex-wrap items-center justify-end gap-1\.5 min-w-0/);
  });
});
