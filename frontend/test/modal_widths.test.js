import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';

// Source guards for the dialog size ladder: sm (confirm/alert), md (single field), lg (short form),
// xl (medium form), 2xl (standard form, 4+ fields), 3xl-5xl (tables/reports). Panels are
// flex-col with a header, a scrolling body and a footer that stays visible.
const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const read = (rel) => readFileSync(join(SRC, rel), 'utf8').replace(/\r\n/g, '\n');

const panelClass = (src, re, label) => {
  const m = src.match(re);
  assert.ok(m, `panel not found: ${label}`);
  return m[0];
};

const FORMS = [
  {
    file: 'components/ExpenseModal.tsx',
    width: 'max-w-2xl',
    panel: /rounded-2xl shadow-2xl border border-line dark:border-line-dark w-full max-w-2xl max-h-\[90vh\] flex flex-col overflow-hidden/,
    body: /<MotionHeight className="flex-1 min-h-0 overflow-y-auto p-5 bg-canvas/,
    footer: /<div className="px-5 py-3 [^"]*flex justify-end gap-2 shrink-0">/,
  },
  {
    file: 'components/QuickAddProductModal.tsx',
    width: 'max-w-2xl',
    panel: /rounded-xl shadow-2xl border border-line dark:border-line-dark w-full max-w-2xl max-h-\[90vh\] overflow-hidden flex flex-col/,
    body: /<div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3\.5">/,
    footer: /<div className="px-4 py-3 hairline-t [^"]*justify-end gap-2 shrink-0">/,
  },
  {
    file: 'components/QuickShortageModal.tsx',
    width: 'max-w-2xl',
    panel: /w-full max-w-2xl max-h-\[90vh\] bg-surface [^"]*overflow-hidden flex flex-col/,
    body: /<MotionHeight className="flex-1 min-h-0 overflow-y-auto p-5">/,
    footer: /<div className="flex items-center justify-end gap-2 px-5 py-3 [^"]*shrink-0">/,
  },
  {
    file: 'views/purchases/SupplierFormModal.tsx',
    width: 'max-w-2xl',
    panel: /rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-\[90vh\]/,
    body: /<div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-3\.5">/,
    footer: /<div className="flex items-center gap-2 px-5 py-3 [^"]*shrink-0">/,
  },
  {
    file: 'views/customers/CustomerFormModal.tsx',
    width: 'max-w-2xl',
    panel: /rounded-xl shadow-2xl border border-line dark:border-line-dark w-full max-w-2xl max-h-\[90vh\] flex flex-col/,
    body: /<div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3\.5">/,
    footer: /<div className="px-4 py-3 flex justify-end gap-2 hairline-t [^"]*shrink-0">/,
    grid: /grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3\.5/,
  },
  {
    file: 'views/customers/CustomerPaymentModal.tsx',
    width: 'max-w-xl',
    panel: /rounded-2xl shadow-2xl border border-line dark:border-line-dark w-full max-w-xl max-h-\[90vh\] flex flex-col/,
    body: /<MotionHeight className="flex-1 min-h-0 overflow-y-auto p-5">/,
    footer: /<div className="px-5 py-3 flex items-center justify-end gap-2 [^"]*shrink-0">/,
    grid: /grid grid-cols-1 sm:grid-cols-2 gap-3 items-start/,
  },
  {
    file: 'views/purchases/SupplierPaymentModal.tsx',
    width: 'max-w-xl',
    panel: /rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl [^"]*flex flex-col max-h-\[90vh\]/,
    body: /<MotionHeight className="flex-1 min-h-0 overflow-y-auto p-5">/,
    footer: /<div className="px-5 py-3 flex items-center justify-end gap-2 [^"]*shrink-0">/,
  },
  {
    file: 'components/StockAdjustmentModal.tsx',
    width: 'max-w-xl',
    panel: /shadow-xl w-full max-w-xl flex flex-col max-h-\[90vh\]/,
    body: /<MotionHeight className="flex-1 min-h-0 overflow-y-auto p-5">/,
    footer: /<div className="px-5 py-3 border-t [^"]*justify-end gap-2 shrink-0">/,
  },
  {
    file: 'components/DrugInteractionManagerModal.tsx',
    width: 'max-w-2xl',
    panel: /w-full max-w-2xl bg-surface dark:bg-surface-dark border-2 border-brand [^"]*flex flex-col max-h-\[90vh\]/,
    body: /<div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-3\.5">/,
    footer: /<div className="px-5 py-3 flex items-center justify-end gap-2 [^"]*shrink-0">/,
  },
];

describe('form dialogs: width ladder and header / scrolling body / footer structure', () => {
  for (const f of FORMS) {
    it(`${f.file} is ${f.width} with a scrolling body and a pinned footer`, () => {
      const src = read(f.file);
      const panel = panelClass(src, f.panel, f.file);
      assert.ok(panel.includes(f.width), `${f.file} must use ${f.width}`);
      assert.ok(panel.includes('max-h-[90vh]'), `${f.file} panel needs max-h-[90vh]`);
      assert.ok(panel.includes('flex-col'), `${f.file} panel must be flex-col`);
      assert.match(src, f.body);
      assert.match(src, f.footer);
      if (f.grid) assert.match(src, f.grid);
    });
  }

  it('the form in a dialog is the flex column that holds both the scrolling body and the footer', () => {
    for (const [file, re] of [
      ['components/QuickAddProductModal.tsx', /<form onSubmit=\{handleSubmit\} className="flex-1 min-h-0 flex flex-col">/],
      ['components/QuickShortageModal.tsx', /<form onSubmit=\{handleSave\} className="flex-1 min-h-0 flex flex-col">/],
      ['views/purchases/SupplierFormModal.tsx', /<form onSubmit=\{onSave\} className="flex-1 min-h-0 flex flex-col">/],
      ['views/customers/CustomerFormModal.tsx', /<form onSubmit=\{onSave\} className="text-xs flex-1 min-h-0 flex flex-col">/],
      ['views/customers/CustomerPaymentModal.tsx', /<form onSubmit=\{handleSubmit\} className="text-xs flex-1 min-h-0 flex flex-col">/],
      ['views/purchases/SupplierPaymentModal.tsx', /<form onSubmit=\{handleSubmit\} className="text-xs flex-1 min-h-0 flex flex-col">/],
      ['components/StockAdjustmentModal.tsx', /<form onSubmit=\{handleSubmit\} className="flex-1 min-h-0 flex flex-col">/],
      ['components/DrugInteractionManagerModal.tsx', /<form onSubmit=\{handleSaveInteraction\} className="flex-1 min-h-0 flex flex-col">/],
    ]) {
      assert.match(read(file), re, file);
    }
  });

  it('the expense submit button lives in the pinned footer and targets the form by id', () => {
    const src = read('components/ExpenseModal.tsx');
    assert.match(src, /<form id="expense-form" onSubmit=\{handleSubmit\}/);
    const footer = src.slice(src.indexOf('{/* Footer */}'));
    assert.match(footer, /type="submit"\s+form="expense-form"/);
    assert.doesNotMatch(src.slice(0, src.indexOf('{/* Footer */}')), /type="submit"/);
  });

  it('customer form: the duplicate-phone warning spans both columns instead of squeezing into one', () => {
    assert.match(read('views/customers/CustomerFormModal.tsx'), /\{duplicateCustomer && \(\s+<div className="sm:col-span-2 /);
  });
});

describe('settings, tables and prompts', () => {
  it('PIN settings is max-w-2xl so the protected-actions grid and the PIN fields are not squeezed', () => {
    const src = read('components/PinSettingsModal.tsx');
    const panel = panelClass(src, /w-full max-w-2xl bg-surface dark:bg-surface-dark rounded-2xl[^"]*flex flex-col max-h-\[90vh\]/, 'PinSettings');
    assert.ok(panel.includes('overflow-hidden'));
    assert.match(src, /<div className="p-6 overflow-y-auto space-y-6 flex-1 min-h-0 /);
  });

  it('held sales table (5 columns) is max-w-3xl, its body scrolls inside the panel and names are not cut at 140px', () => {
    const src = read('components/HeldSalesModal.tsx');
    panelClass(src, /w-full max-w-3xl bg-surface dark:bg-surface-dark rounded-2xl[^"]*flex flex-col max-h-\[90vh\]/, 'HeldSales');
    assert.match(src, /<div className="p-4 space-y-3 overflow-y-auto flex-1 min-h-0">/);
    assert.ok(!src.includes('max-w-[640px]'));
    assert.ok(!src.includes('max-w-[140px]'));
  });

  it('shortage action dialog is max-w-lg with a scrolling body and a pinned footer', () => {
    const src = read('views/purchases/ShortagesTab.tsx');
    panelClass(src, /w-full max-w-lg max-h-\[90vh\] flex flex-col bg-surface/, 'ShortagesTab action');
    assert.match(src, /<div className="p-4 flex flex-col gap-3 text-xs flex-1 min-h-0 overflow-y-auto">/);
    assert.match(src, /\{\/\* Modal Footer \*\/\}\s+<div className="[^"]*shrink-0">/);
  });

  it('purchase details (5-column table) is max-w-3xl and product variants list (7 columns) is max-w-4xl', () => {
    panelClass(read('views/purchases/PurchaseDetailsModal.tsx'), /w-full max-w-3xl max-h-\[90vh\] flex flex-col/, 'PurchaseDetails');
    panelClass(read('components/ProductVariantsListModal.tsx'), /w-full max-w-4xl [^"]*flex flex-col max-h-\[90vh\]/, 'ProductVariantsList');
  });
});

// Guard: a dialog with 4+ fields must not stay in the small tier. Dialogs owned by other engineers
// (wallets/epay/insurance, cashier payment dialogs) and small-by-design keypads/prompts are skipped.
const SKIP = [
  /^views\/(wallets|epay|insurance)\//,
  /^components\/payment\//,
  /^components\/(PaymentModal|DigitalPaymentModal|UnsavedChangesDialog|ConfirmModal|RafiqDialog|SupervisorPromptModal|PinCodeModal)\.tsx$/,
  /^views\/LoginScreen\.tsx$/,
];
const walk = (dir) =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.tsx') ? [p] : [];
  });

describe('no cramped form dialogs', () => {
  it('dialogs with 4+ fields are never max-w-sm/md/lg', () => {
    const offenders = [];
    for (const abs of walk(SRC)) {
      const rel = relative(SRC, abs).split('\\').join('/');
      if (SKIP.some((re) => re.test(rel))) continue;
      const lines = read(rel).split('\n');
      lines.forEach((line, i) => {
        if (!line.includes('fixed inset-0')) return;
        const indent = line.length - line.trimStart().length;
        let end = i + 1;
        while (end < lines.length) {
          const l = lines[end];
          if (l.trim().startsWith('</div>') && l.length - l.trimStart().length <= indent) break;
          end += 1;
        }
        const region = lines.slice(i, end + 1).join('\n');
        const width = lines.slice(i, i + 6).join(' ').match(/max-w-(sm|md|lg)\b/);
        if (!width) return;
        const fields = (region.match(/<(input|textarea|CustomSelect|MoneyInput)\b/g) || []).filter((tag) => tag !== '<input').length
          + (region.match(/<input\b(?![^>]*type="(checkbox|radio|file)")/g) || []).length;
        if (fields >= 4) offenders.push(`${rel}:${i + 1} ${width[0]} (${fields} fields)`);
      });
    }
    assert.deepEqual(offenders, []);
  });
});
