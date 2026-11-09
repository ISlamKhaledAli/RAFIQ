import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const read = (rel) => readFileSync(SRC + rel, 'utf8').replace(/\r\n/g, '\n');

const PRODUCTS_DIR = SRC + 'views/products/';
const ZONE = [
  'views/ProductsView.tsx',
  ...readdirSync(PRODUCTS_DIR).filter((f) => f.endsWith('.tsx')).map((f) => 'views/products/' + f),
  ...[
    'BarcodeLabelModal',
    'CategoryIconPickerModal',
    'CategoryManagerModal',
    'ExcelImportModal',
    'ExpiryRangeFilter',
    'ExpiryReturnsModal',
    'LowStockReportModal',
    'PackagingWizardModal',
    'PriceHistoryModal',
    'ProductUnitsEditor',
    'ProductVariantMatrixModal',
    'ProductVariantsListModal',
    'QuickAddProductModal',
    'QuickFastItemModal',
    'QuickItemFormParts',
    'QuickItemsManagerModal',
    'StockAdjustmentModal',
    'StockMovementsModal',
    'ModifierManagerModal',
    'RecipeManagerModal',
    'DosageLabelModal',
  ].map((n) => 'components/' + n + '.tsx'),
];

// QuickItemFormParts only keeps the accordion header (a documented special), so it does not need AppButton.
const NEEDS_SHARED = ZONE.filter((f) => f !== 'components/QuickItemFormParts.tsx' && /<button|<AppButton/.test(read(f)));

const rawButtons = (src) => [...src.matchAll(/<button\b([\s\S]*?)<\/button>/g)];

describe('button sweep: products and inventory zone', () => {
  it('every file with buttons uses the shared system', () => {
    for (const f of NEEDS_SHARED) {
      assert.match(read(f), /AppButton|buttonClass|TABLE_ACTION_TRIGGER|MENU_ITEM/, f + ' must use AppButton/buttonClass/menu constants');
    }
  });

  it('has no leftover local button constant sets', () => {
    for (const f of ZONE) {
      assert.doesNotMatch(read(f), /\b(QUICK_BTN\w*|ROW_ICON_BTN|PRIMARY_BUTTON_CLASS|SECONDARY_BUTTON_CLASS|DANGER_BUTTON_CLASS|FOOTER_BTN|BTN_\w+)\b/, f);
    }
  });

  it('has no dead classes, h-8.5 or button ring/scale leftovers', () => {
    for (const f of ZONE) {
      assert.doesNotMatch(read(f), /active:scale-|\bwarn-hover\b|\bdanger-hover\b|\bbrand-darker\b|\bh-8\.5\b|(?<![\w-])warn-dark(?![\w-])/, f);
    }
  });

  it('buttons do not use palette colours (slate/gray/red/emerald/amber/purple/cyan)', () => {
    const PALETTE = /\b(?:slate|gray|zinc|stone|red|emerald|amber|purple|cyan|green|blue)-\d/;
    for (const f of ZONE) {
      const src = read(f);
      for (const m of rawButtons(src)) assert.doesNotMatch(m[0], PALETTE, f + ': ' + m[0].slice(0, 100));
      for (const m of src.matchAll(/<AppButton\b[\s\S]*?(?:<\/AppButton>|\/>\n)/g)) {
        assert.doesNotMatch(m[0], PALETTE, f + ': ' + m[0].slice(0, 100));
      }
    }
  });

  it('has no hand-written solid brand/paid/danger/warn button fills', () => {
    const SOLID = /<button\b[^>]*className=(?:"|\{`)[^"`]*\bbg-(?:brand|paid|danger|warn)(?![\w-])(?!\/)[^"`]*\bh-(?:7|8|9|10|11)\b/;
    for (const f of ZONE) {
      assert.doesNotMatch(read(f), SOLID, f);
    }
  });

  it('every remaining raw <button> declares its type', () => {
    for (const f of ZONE) {
      for (const m of rawButtons(read(f))) {
        const opening = m[1].slice(0, m[1].indexOf('>') < 0 ? m[1].length : m[1].search(/>\s*(?:\n|<|[^\s=])/));
        assert.match(m[0].split('\n').slice(0, 6).join('\n'), /\btype=/, f + ': ' + opening.trim().slice(0, 80));
      }
    }
  });

  it('icon-only raw buttons carry an aria-label', () => {
    for (const f of ZONE) {
      for (const m of rawButtons(read(f))) {
        const body = m[1].slice(m[1].lastIndexOf('>\n') + 2);
        const iconOnly = /^\s*<[A-Z]\w*\s[^>]*\/>\s*$/.test(body) || /^\s*\{[^}]*\?\s*<[A-Z]\w*[^>]*\/>\s*:\s*<[A-Z]\w*[^>]*\/>\s*\}\s*$/.test(body);
        if (iconOnly) assert.match(m[0], /aria-label=/, f + ': ' + m[0].slice(0, 140));
      }
    }
  });

  it('AppButton without children (icon-only) always has an aria-label', () => {
    for (const f of ZONE) {
      for (const m of read(f).matchAll(/<AppButton\b([^>]*?)\/>/g)) {
        assert.match(m[1], /aria-label=/, f + ': ' + m[0].slice(0, 120));
      }
    }
  });

  it('ProductsView header: "صنف جديد / دواء جديد" is primary md with an icon', () => {
    const src = read('views/ProductsView.tsx');
    assert.match(src, /<AppButton variant="primary" icon=\{Plus\} onClick=\{openAddModal\}[^>]*>\s*\{isPharmacy \? 'دواء جديد' : 'صنف جديد'\}\s*<\/AppButton>/);
    assert.doesNotMatch(src, /<AppButton type="submit"[^>]*>\s*بحث\s*<\/AppButton>/, 'no hand-rolled submit button: the catalog uses SearchInput with its built-in بحث button');
    assert.match(src, /<SearchInput\s+size="md"[\s\S]*?onSubmit=\{applySearch\}/);
    assert.doesNotMatch(src, /searchButton=\{false\}/);
  });

  it('ProductsView: tools dropdown panel and rows come from the MENU_* constants', () => {
    const view = read('views/ProductsView.tsx');
    assert.match(view, /role="menu" className=\{`\$\{MENU_PANEL\}/);
    const parts = read('views/products/ProductsToolbarParts.tsx');
    assert.match(parts, /MENU_ITEM, MENU_ITEM_DANGER, MENU_ITEM_ICON, MENU_ITEM_ICON_DANGER/);
    assert.match(parts, /default: MENU_ITEM,/);
    assert.match(parts, /danger: MENU_ITEM_DANGER,/);
  });

  it('ProductsView keeps the always-mounted active-filters row and the shared ClearFiltersButton', () => {
    const src = read('views/ProductsView.tsx');
    assert.match(src, /<ClearFiltersButton active=\{isCatalogFiltered\} onClick=\{clearAllFilters\} label="مسح الكل" shape="pill" \/>/);
    assert.match(src, /الفلاتر المفعّلة: لا يوجد/);
  });

  it('ProductsTable: row trigger and floating menu use the shared constants', () => {
    const src = read('views/products/ProductsTable.tsx');
    assert.match(src, /className=\{`\$\{TABLE_ACTION_TRIGGER\} select-none`\}/);
    assert.match(src, /aria-expanded=\{activeMenu\?\.product\.id === prod\.id\}/);
    assert.match(src, /\$\{MENU_PANEL\}/);
    assert.equal((src.match(/className=\{MENU_ITEM\}/g) ?? []).length, 8);
    assert.equal((src.match(/className=\{MENU_ITEM_DANGER\}/g) ?? []).length, 1);
    assert.match(src, /className=\{MENU_DIVIDER\}/);
    assert.doesNotMatch(src, /rounded-2xl shadow-2xl overflow-hidden/);
  });

  it('ProductsTable: bulk-selection bar buttons are sm AppButtons', () => {
    const src = read('views/products/ProductsTable.tsx');
    assert.equal((src.match(/<AppButton\b[^>]*\bsize="sm"/g) ?? []).length, 7);
    assert.match(src, /variant="dangerSoft" size="sm" icon=\{Trash2\}/);
  });

  it('StockMovementsTab: reconcile button is secondary md and the type pills are h-8 rounded-full text-xs', () => {
    const src = read('views/products/StockMovementsTab.tsx');
    assert.match(src, /<AppButton\s+variant="secondary"\s+icon=\{RotateCcw\}[\s\S]*?fullWidth/);
    assert.match(src, /h-8 px-3\.5 rounded-full text-xs font-bold shrink-0/);
    assert.match(src, /'bg-brand text-white dark:bg-paid-bright dark:text-surface-dark'/);
    assert.match(src, /'bg-surface-2 dark:bg-surface-dark-2 text-ink-muted dark:text-ink-dark-muted border border-line dark:border-line-dark hover:text-ink dark:hover:text-ink-dark'/);
    assert.doesNotMatch(src, /h-9 px-3\.5 rounded-full/);
  });

  it('selected states of hand-written toggles carry a dark pair', () => {
    for (const f of ['views/products/BulkPriceAdjustmentModal.tsx', 'views/products/ProductFormModal.tsx']) {
      assert.doesNotMatch(read(f), /'bg-brand text-white(?: border-brand)?(?: shadow-(?:2xs|xs))?'/, f);
    }
  });

  it('the quick-item form parts no longer export button constants', () => {
    const src = read('components/QuickItemFormParts.tsx');
    assert.doesNotMatch(src, /export const QUICK_BTN/);
    assert.match(read('components/QuickItemsManagerModal.tsx'), /<AppButton/);
    assert.match(read('components/QuickFastItemModal.tsx'), /<AppButton/);
  });

  it('does not use native selects or emojis in the zone', () => {
    for (const f of ZONE) {
      const src = read(f);
      assert.doesNotMatch(src, /<select\b/, f);
      assert.doesNotMatch(src, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, f);
    }
  });
});
