import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const SRC_DIR = fileURLToPath(new URL('../src/', import.meta.url));
const BUILD_DIR = fileURLToPath(new URL('../node_modules/.tmp/clear_filters_test/', import.meta.url));
const read = (rel) => readFileSync(`${SRC_DIR}${rel}`, 'utf8').replace(/\r\n/g, '\n');

// Every toolbar / filter surface that was audited for filter-state layout jumps.
const OWNED_FILES = [
  'views/SalesHistoryView.tsx',
  'views/AuditLogView.tsx',
  'views/purchases/PurchasesInvoicesTab.tsx',
  'views/purchases/ShortagesTab.tsx',
  'views/purchases/SuppliersTab.tsx',
  'views/purchases/SupplierStatementModal.tsx',
  'views/products/BatchesTab.tsx',
  'views/products/StockMovementsTab.tsx',
  'views/products/ProductsToolbarParts.tsx',
  'views/ProductsView.tsx',
  'views/CustomersView.tsx',
  'views/customers/CustomerStatementModal.tsx',
  'views/epay/EpayView.tsx',
  'views/wallets/WalletsView.tsx',
  'views/insurance/InsuranceContractsView.tsx',
  'views/DashboardView.tsx',
  'components/StockMovementsModal.tsx',
  'components/PriceHistoryModal.tsx',
  'components/ExpiryReturnsModal.tsx',
  'components/ControlledDrugsRegisterModal.tsx',
  'components/SpecializedPharmacyReportsModal.tsx',
  'components/DebtorsReportModal.tsx',
  'components/HeldSalesModal.tsx',
  'components/DailyClosingModal.tsx',
  'components/LowStockReportModal.tsx',
];

// file -> number of <ClearFiltersButton> usages
const USES = {
  'views/SalesHistoryView.tsx': 1,
  'views/AuditLogView.tsx': 1,
  'views/ProductsView.tsx': 1,
  'views/customers/CustomerStatementModal.tsx': 1,
  'views/epay/EpayView.tsx': 2,
  'views/wallets/WalletsView.tsx': 1,
  'views/insurance/InsuranceContractsView.tsx': 2,
};

const RESET_LABELS = ['مسح التصفية', 'مسح الفلاتر', 'إلغاء الفلترة', 'مسح الكل', 'كل الفترات'];
// a conditionally mounted toolbar button: `{cond && ( <button ...> [icon] <label> </button> )}`
const CONDITIONAL_RESET_BUTTON = new RegExp(
  `&&\\s*\\(?\\s*<button(?:[^>]|=>)*>\\s*(?:<RotateCcw[^>]*/>\\s*)?(?:<span>)?\\s*(?:${RESET_LABELS.join('|')})\\s*(?:</span>)?\\s*</button>`,
);
const EMOJI = /\p{Extended_Pictographic}/u;
const HEX = /#[0-9a-fA-F]{3,8}\b/;
const PALETTE = /(?:^|[:\-!])(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/;

describe('ClearFiltersButton component contract', () => {
  let ClearFiltersButton;

  before(async () => {
    mkdirSync(BUILD_DIR, { recursive: true });
    const out = ts.transpileModule(read('components/ClearFiltersButton.tsx'), {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    const file = `${BUILD_DIR}ClearFiltersButton.mjs`;
    writeFileSync(file, out);
    ({ ClearFiltersButton } = await import(`${pathToFileURL(file).href}?t=${Date.now()}`));
  });

  after(() => rmSync(BUILD_DIR, { recursive: true, force: true }));

  const html = (props) => renderToStaticMarkup(createElement(ClearFiltersButton, { onClick: () => {}, ...props }));
  const classesOf = (markup) => markup.match(/<button[^>]*class="([^"]*)"/)[1].split(/\s+/);
  const sizeTokens = (markup) => classesOf(markup).filter((c) => /^(h|px|rounded|gap)-/.test(c)).sort();

  it('is always rendered: the inactive state still outputs the full button with icon and label', () => {
    const out = html({ active: false });
    assert.match(out, /^<button type="button"/);
    assert.match(out, /<svg/);
    assert.match(out, /مسح التصفية/);
    assert.match(out, /w-3\.5 h-3\.5/);
  });

  it('is disabled and not focusable while no filter is active', () => {
    const out = html({ active: false });
    assert.match(out, /\sdisabled=""/);
    assert.match(out, /aria-disabled="true"/);
    assert.match(out, /tabindex="-1"/);
    assert.match(out, /cursor-not-allowed/);
    assert.ok(!classesOf(out).some((c) => c.includes('hover:')), 'inactive state must have no hover effect');
    assert.match(out, /title="لا توجد فلاتر مفعّلة"/);
  });

  it('is a red reset button (danger tint, solid red on hover) when a filter is active', () => {
    const out = html({ active: true, title: 'إلغاء كل الفلاتر' });
    assert.ok(!/\sdisabled=""/.test(out));
    assert.match(out, /aria-disabled="false"/);
    assert.match(out, /tabindex="0"/);
    assert.match(out, /cursor-pointer/);
    assert.match(out, /bg-danger-soft dark:bg-danger-dark-soft/);
    assert.match(out, /text-danger dark:text-danger-bright/);
    assert.match(out, /hover:bg-danger hover:text-white/);
    assert.match(out, /dark:hover:bg-danger-bright dark:hover:text-surface-dark/);
    assert.match(out, /title="إلغاء كل الفلاتر"/);
  });

  it('only forwards the click while active', () => {
    const click = () => {};
    assert.equal(ClearFiltersButton({ onClick: click, active: true }).props.onClick, click);
    assert.equal(ClearFiltersButton({ onClick: click, active: false }).props.onClick, undefined);
  });

  it('occupies exactly the same box in both states (identical size/shape classes per size)', () => {
    for (const size of ['sm', 'md']) {
      for (const shape of ['default', 'pill']) {
        assert.deepEqual(sizeTokens(html({ active: false, size, shape })), sizeTokens(html({ active: true, size, shape })));
      }
    }
    assert.ok(classesOf(html({ active: false, size: 'sm' })).includes('h-8'));
    assert.ok(classesOf(html({ active: false, size: 'md' })).includes('h-10'));
    assert.ok(classesOf(html({ active: false })).includes('h-8'), 'sm is the default size');
    assert.ok(classesOf(html({ active: true, size: 'md' })).includes('rounded-xl'));
    assert.ok(classesOf(html({ active: true, size: 'sm' })).includes('rounded-lg'));
    assert.ok(classesOf(html({ active: true, shape: 'pill' })).includes('rounded-full'));
  });

  it('keeps the label fixed per instance and supports a custom label', () => {
    assert.match(html({ active: false, label: 'إلغاء الفلترة' }), /<span>إلغاء الفلترة<\/span>/);
    assert.match(html({ active: true, label: 'إلغاء الفلترة' }), /<span>إلغاء الفلترة<\/span>/);
  });

  it('uses theme tokens only: no hex, no default palette, no emoji, colour-only transition, dark pairs', () => {
    for (const active of [false, true]) {
      const out = html({ active });
      assert.ok(!HEX.test(out) && !PALETTE.test(out) && !EMOJI.test(out));
      const classes = classesOf(out);
      assert.ok(classes.includes('transition-colors'));
      assert.ok(!classes.some((c) => /^transition(-all)?$/.test(c) || c.startsWith('duration-') || c.startsWith('animate-')));
      for (const family of ['bg', 'text', 'border']) {
        const light = classes.filter((c) => new RegExp(`^${family}-(?!xs$)`).test(c));
        const dark = classes.filter((c) => c.startsWith(`dark:${family}-`));
        assert.ok(light.length > 0 && dark.length >= light.length, `${family}: every light token needs a dark: pair (active=${active})`);
      }
    }
  });
});

describe('toolbars no longer mount a reset-filters button conditionally', () => {
  for (const file of OWNED_FILES) {
    it(`${file} has no conditional toolbar reset button`, () => {
      const src = read(file);
      assert.ok(!CONDITIONAL_RESET_BUTTON.test(src), `${file} still mounts a reset button behind a filter condition`);
    });
  }

  it('the conditional-mount detector catches the old pattern (guard against a vacuous test)', () => {
    const oldPattern = `{anyFilterActive && (\n  <button type="button" onClick={reset} className="x">\n    <RotateCcw className="w-3.5 h-3.5" />\n    <span>مسح التصفية</span>\n  </button>\n)}`;
    assert.ok(CONDITIONAL_RESET_BUTTON.test(oldPattern));
    assert.ok(CONDITIONAL_RESET_BUTTON.test(`{dateActive && (\n  <button onClick={reset} className="x">\n    إلغاء الفلترة\n  </button>\n)}`));
  });

  for (const [file, count] of Object.entries(USES)) {
    it(`${file} renders <ClearFiltersButton> ${count}x, each with an explicit active flag`, () => {
      const src = read(file);
      assert.match(src, /import \{ ClearFiltersButton \} from '(?:\.\.\/)+components\/ClearFiltersButton';/);
      const tags = src.match(/<ClearFiltersButton\b(?:[^>]|=>)*?\/>/g) ?? [];
      assert.equal(tags.length, count);
      for (const tag of tags) {
        assert.match(tag, /\bactive=\{[^}]+\}/);
        assert.match(tag, /\bonClick=\{/);
      }
    });
  }

  it('files without a clear button do not import the component (no dead imports)', () => {
    for (const file of OWNED_FILES) {
      if (file in USES) continue;
      assert.ok(!read(file).includes('ClearFiltersButton'), `${file} should not reference ClearFiltersButton`);
    }
  });
});

describe('other filter-dependent toolbar elements keep a fixed slot', () => {
  it('products filter chips row is always mounted and never guarded by isCatalogFiltered', () => {
    const src = read('views/ProductsView.tsx');
    assert.ok(!/isCatalogFiltered && \(\s*<div[^>]*>\s*<span[^>]*>الفلاتر المفعّلة/.test(src));
    assert.match(src, /الفلاتر المفعّلة: لا يوجد/);
    assert.match(src, /<ClearFiltersButton active=\{isCatalogFiltered\} onClick=\{clearAllFilters\} label="مسح الكل" shape="pill" \/>/);
  });

  it('active filter chips are width-capped so the chips row cannot wrap on a long search term', () => {
    const src = read('views/products/ProductsToolbarParts.tsx');
    assert.match(src, /max-w-\[14rem\]/);
    assert.ok(!/rounded-full border text-xs font-bold max-w-full/.test(src));
  });

  it('wallets history keeps the record count and the shown period in one reserved slot', () => {
    const src = read('views/wallets/WalletsView.tsx');
    assert.ok(!/isDateFilterActive\(historyDateFilter\) && \(\s*<div[^>]*>\s*الفترة المعروضة/.test(src));
    assert.match(src, /w-40 shrink-0 flex flex-col items-end/);
    assert.match(src, /الفترة المعروضة: \$\{isDateFilterActive\(historyDateFilter\) \? describeDateFilter\(historyDateFilter\) : 'كل الفترات'\}/);
    assert.ok(!/\{totalPages <= 1 && \(\s*<span/.test(src));
  });

  it('customer statement filter bar keeps the movement count + reset slot mounted', () => {
    const src = read('views/customers/CustomerStatementModal.tsx');
    assert.match(src, /w-64 truncate text-micro font-bold/);
    assert.match(src, /كل الحركات \(\$\{filteredStatementEntries\.length\}\)/);
    assert.ok(!/\{dateActive && \(\s*<div className="flex items-center gap-2">\s*<span className="text-micro font-bold text-brand/.test(src));
  });

  it('stock movements and batches KPI period lines are always mounted', () => {
    const movements = read('views/products/StockMovementsTab.tsx');
    assert.ok(!/\{isDateActive && \(\s*<div className="text-micro text-brand[^"]*">في الفترة/.test(movements));
    assert.match(movements, /في الفترة: \{isDateActive \? periodLabel : 'كل الفترات'\}/);
    const batches = read('views/products/BatchesTab.tsx');
    assert.ok(!/\{isExpiryActive && \(\s*<div className="text-micro text-brand[^"]*">تنتهي/.test(batches));
    assert.match(batches, /تنتهي: \{isExpiryActive \? expiryLabel : 'كل التواريخ'\}/);
  });

  it('purchases KPI label never wraps onto a second line', () => {
    const src = read('views/purchases/PurchasesInvoicesTab.tsx');
    assert.match(src, /font-bold block truncate"\s*\n\s*title=\{isDateActive/);
  });

  it('result-count texts in modal toolbars sit in a fixed-width truncating slot', () => {
    assert.match(read('components/StockMovementsModal.tsx'), /w-64 shrink-0 truncate text-micro/);
    assert.match(read('components/PriceHistoryModal.tsx'), /w-64 shrink-0 truncate text-micro/);
    assert.match(read('components/DailyClosingModal.tsx'), /w-56 truncate text-xs text-ink-muted dark:text-ink-dark-muted"\s*\n\s*title=\{historyDateActive/);
  });

  it('the "showing latest N" capped notices live outside the filter toolbar flow', () => {
    const sales = read('views/SalesHistoryView.tsx');
    assert.match(sales, /<\/div>\n\n      \{sales\.length >= SALES_HISTORY_LIMIT && \(\n        <div className="flex items-center gap-1\.5[^"]*shrink-0"/);
    const audit = read('views/AuditLogView.tsx');
    assert.match(audit, /<\/div>\n\n      \{logs\.length >= AUDIT_LOAD_LIMIT && \(\n        <div className="flex items-center gap-1\.5[^"]*shrink-0"/);
  });
});
