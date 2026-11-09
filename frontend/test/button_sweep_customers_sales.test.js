import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SRC_DIR = fileURLToPath(new URL('../src/', import.meta.url));
const read = (rel) => readFileSync(`${SRC_DIR}${rel}`, 'utf8').replace(/\r\n/g, '\n');

// Zone 2: customers, sales, dashboard, reports and the shared date / pagination controls.
const ZONE_FILES = [
  'views/CustomersView.tsx',
  'views/customers/CustomerFormModal.tsx',
  'views/customers/CustomerImportExcelModal.tsx',
  'views/customers/CustomerPaymentModal.tsx',
  'views/customers/CustomerPrintStatementModal.tsx',
  'views/customers/CustomerReceiptVoucherModal.tsx',
  'views/customers/CustomerStatementModal.tsx',
  'views/customers/PatientProfileModal.tsx',
  'views/SalesHistoryView.tsx',
  'views/AuditLogView.tsx',
  'views/DashboardView.tsx',
  'views/analytics/CustomerAnalyticsView.tsx',
  'views/analytics/InventoryAnalyticsView.tsx',
  'views/analytics/RevenueAnalyticsView.tsx',
  'components/analytics/DeadStockRadar.tsx',
  'components/DateFilterControl.tsx',
  'components/CustomDatePicker.tsx',
  'components/ReturnModal.tsx',
  'components/ShiftModal.tsx',
  'components/DailyClosingModal.tsx',
  'components/HeldSalesModal.tsx',
  'components/DebtorsReportModal.tsx',
  'components/VoidInvoiceModal.tsx',
  'components/ReceiptModal.tsx',
  'components/DuePatientsModal.tsx',
  'components/ItemDiscountModal.tsx',
  'components/NotificationCenter.tsx',
  'components/UndoToast.tsx',
];

const ALL_FILES = [
  ...ZONE_FILES,
  'components/PaginationBar.tsx',
  'components/analytics/CashierPerformanceCard.tsx',
  'components/analytics/FinancialGaugeMeter.tsx',
  'components/analytics/FinancialWaterfallChart.tsx',
  'components/analytics/HourlyHeatmapBar.tsx',
  'views/analytics/profitabilityDisplay.ts',
  'views/customers/customerStatementReport.ts',
];

// Documented specials: the header bell chip keeps the 34px size shared with the other header chips.
const H85_ALLOWED = new Set(['components/NotificationCenter.tsx']);

function buttonBlocks(source) {
  const blocks = [];
  const re = /<button\b/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    const end = source.indexOf('</button>', m.index);
    assert.ok(end > m.index, 'unterminated <button>');
    blocks.push(source.slice(m.index, end + 9));
  }
  return blocks;
}

function openingTag(block) {
  // The opening tag ends at the first `>` that is not part of `=>` or inside braces.
  let depth = 0;
  for (let i = 0; i < block.length; i += 1) {
    const ch = block[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    else if (ch === '>' && depth === 0 && block[i - 1] !== '=') return block.slice(0, i + 1);
  }
  return block;
}

describe('button sweep zone 2: adoption of the shared button system', () => {
  for (const file of ZONE_FILES) {
    it(`${file} uses AppButton`, () => {
      assert.match(read(file), /import \{ AppButton \} from '[./]+\/(?:components\/)?AppButton';|import \{ AppButton \} from '\.\/AppButton';/);
    });
  }

  for (const file of ALL_FILES) {
    const src = read(file);

    it(`${file} has no legacy heights or dead classes`, () => {
      if (!H85_ALLOWED.has(file)) assert.ok(!/\bh-8\.5\b|\bh-7\.5\b|\bh-6\.5\b/.test(src), 'off-scale h-8.5 / h-7.5 / h-6.5');
      assert.ok(!/active:scale-98/.test(src));
      assert.ok(!/active:scale-\[?0?\.?9/.test(src), 'press feedback comes from index.css');
      assert.ok(!/(?<![\w-])(?:bg|text|border|ring)-warn-dark(?![\w-])/.test(src), 'warn-dark is not a token');
      assert.ok(!/danger-hover|warn-hover|brand-darker/.test(src));
    });

    it(`${file} has no leftover local button constant sets`, () => {
      assert.ok(!/\b(?:BTN_SECONDARY|BTN_WARN|BTN_[A-Z_]+|QUICK_BTN\w*|PRIMARY_BUTTON_CLASS|SECONDARY_BUTTON_CLASS|DANGER_BUTTON_CLASS|FOOTER_BTN|SAVE_BUTTON|DISCARD_BUTTON|STAY_BUTTON)\s*=/.test(src));
    });

    it(`${file}: every raw <button> has a type, an accessible name when icon-only and a dark pair on solid fills`, () => {
      for (const block of buttonBlocks(src)) {
        const tag = openingTag(block);
        assert.match(tag, /\btype=/, `missing type: ${tag.slice(0, 80)}`);

        const inner = block.slice(tag.length, -9);
        const hasText = /[\u0600-\u06FFA-Za-z0-9{]/.test(inner.replace(/<[^>]*>/g, ''));
        if (!hasText && /<\w+ className="[^"]*w-\d/.test(inner)) {
          assert.match(tag, /aria-label=|title=/, `icon-only button needs aria-label: ${tag.slice(0, 80)}`);
        }

        const className = tag.match(/className=(?:"([^"]*)"|\{`([^`]*)`\})/);
        const classText = className ? (className[1] ?? className[2] ?? '') : '';
        const solid = /\bbg-(?:brand|paid|danger|warn)(?![\w/-])/.test(classText);
        if (solid) assert.match(classText, /dark:bg-/, `solid fill without a dark pair: ${classText.slice(0, 80)}`);
      }
    });
  }
});

describe('button sweep zone 2: the requested conversions', () => {
  it("'عميل جديد' is a primary sm AppButton in the h-8 toolbar row", () => {
    const src = read('views/CustomersView.tsx');
    assert.match(src, /<AppButton variant="primary" size="sm" icon=\{Plus\} onClick=\{openAddModal\}[^>]*>\s*عميل جديد/);
    assert.ok(!/h-8\.5/.test(src));
  });

  it('dashboard KPI card actions are xs and the "كل النواقص" link is a soft AppButton', () => {
    const src = read('views/DashboardView.tsx');
    assert.match(src, /variant="soft"\s+size="xs"[\s\S]{0,160}>\s*كل النواقص/);
    assert.match(src, /variant="primary"\s+size="xs"[\s\S]{0,260}طلب بضاعة/);
    assert.match(src, /variant="primary"\s+size="xs"[\s\S]{0,260}كشف الحسابات/);
  });

  it('PaginationBar chips share one geometry and one dark pair, with an accessible name on the arrows', () => {
    const src = read('components/PaginationBar.tsx');
    assert.match(src, /const CHIP = 'h-8 min-w-8 px-2\.5 [^']*rounded-lg text-xs font-bold/);
    assert.ok(!/px-2\.5 py-1|rounded-lg text-micro/.test(src), 'page-size chips must use the shared CHIP geometry');
    assert.ok(!/dark:bg-brand dark:bg-brand|dark:bg-brand text-white/.test(src));
    assert.equal((src.match(/bg-brand-dark-soft/g) ?? []).length >= 3, true);
    assert.match(src, /aria-label="الصفحة السابقة"/);
    assert.match(src, /aria-label="الصفحة التالية"/);
  });
});

describe('button sweep zone 2: DateFilterControl keeps a constant footprint', () => {
  const src = read('components/DateFilterControl.tsx');

  it('renders the preset layer and the custom-range layer in one shared grid cell, in every preset', () => {
    assert.match(src, /const LAYER = 'col-start-1 row-start-1 /);
    assert.equal((src.match(/\$\{LAYER\}/g) ?? []).length, 3, 'pills, select and range layers all use the shared cell');
    assert.match(src, /className=\{`grid items-center \$\{className\}`\}/);
  });

  it('never mounts or unmounts the custom range: the inactive layer is only hidden and inert', () => {
    assert.ok(!/value\.preset === 'custom' && \(/.test(src), 'range picker must not be conditionally mounted');
    assert.match(src, /inert=\{!isCustom\}/);
    assert.match(src, /inert=\{isCustom\}/);
    assert.match(src, /const HIDDEN_LAYER = 'invisible pointer-events-none'/);
  });

  it('keeps the public API and offers a way back from the custom range', () => {
    assert.match(src, /export interface DateFilterControlProps \{\s*value: DateFilterValue;\s*onChange: \(value: DateFilterValue\) => void;\s*variant\?: 'select' \| 'pills';\s*size\?: 'sm' \| 'md';\s*className\?: string;\s*selectWidthClass\?: string;\s*\}/);
    assert.match(src, /aria-label="إلغاء تحديد التاريخ والعودة للكل"/);
    assert.ok(!/\(value\.startDate \|\| value\.endDate\) &&/.test(src), 'the reset button must always be reachable in custom mode');
  });

  it('active pills carry a dark pair', () => {
    assert.match(src, /dark:bg-brand-dark-soft dark:text-brand-bright/);
  });
});
