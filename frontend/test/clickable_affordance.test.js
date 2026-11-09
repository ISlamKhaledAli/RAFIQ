import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const read = (rel) => readFileSync(SRC + rel, 'utf8').replace(/\r\n/g, '\n');

const VIEWS = [
  'views/DashboardView.tsx',
  'views/analytics/RevenueAnalyticsView.tsx',
  'views/analytics/InventoryAnalyticsView.tsx',
  'views/analytics/CustomerAnalyticsView.tsx',
];
const AUDITED = [
  ...VIEWS,
  'components/analytics/CashierPerformanceCard.tsx',
  'components/analytics/DeadStockRadar.tsx',
  'components/analytics/HourlyHeatmapBar.tsx',
  'components/analytics/FinancialGaugeMeter.tsx',
  'components/analytics/FinancialWaterfallChart.tsx',
];
const NEW_FILES = ['utils/clickableStyles.ts', 'components/ClickableCard.tsx', 'hooks/useNavAccess.ts'];

const openingTags = (src, names) => [...src.matchAll(new RegExp(`<(?:${names})\\b[^<>]*?(?:\\{[^}]*\\}[^<>]*?)*>`, 'g'))].map((m) => m[0]);

describe('clickable affordance: shared helper', () => {
  const styles = read('utils/clickableStyles.ts');
  const card = read('components/ClickableCard.tsx');

  it('card classes carry pointer, hover border, shadow lift, pressed state and a keyboard focus ring with dark pairs', () => {
    assert.match(styles, /cursor-pointer/);
    assert.match(styles, /hover:border-brand dark:hover:border-brand-bright/);
    assert.match(styles, /hover:border-paid dark:hover:border-paid-bright/);
    assert.match(styles, /hover:border-warn dark:hover:border-warn-bright/);
    assert.match(styles, /hover:border-danger dark:hover:border-danger-bright/);
    assert.match(styles, /hover:shadow-md/);
    assert.match(styles, /active:shadow-2xs/);
    // the ! is required: index.css removes box-shadow on [role=button]:focus-visible
    assert.match(styles, /focus-visible:!ring-2/);
    assert.match(styles, /dark:focus-visible:!ring-brand-bright/);
  });

  it('hover motion is colour/shadow only and 150ms (no transform, scale, translate or transition-all)', () => {
    assert.match(styles, /transition-\[background-color,border-color,box-shadow\] duration-150/);
    assert.doesNotMatch(styles, /transition-all|transition-transform|scale-|translate-|duration-(?:200|300|500)/);
  });

  it('exposes the chevron and the text hint classes with dark pairs', () => {
    assert.match(styles, /CLICKABLE_CHEVRON_CLASS/);
    assert.match(styles, /text-ink-muted\/60 dark:text-ink-dark-muted\/60/);
    assert.match(styles, /CLICKABLE_HINT_CLASS[\s\S]*text-paid dark:text-paid-bright/);
    assert.match(card, /ChevronLeft/);
  });

  it('ClickableCard is a real button for assistive tech and keyboard users', () => {
    assert.match(card, /role="button"/);
    assert.match(card, /tabIndex=\{0\}/);
    assert.match(card, /event\.key === 'Enter' \|\| event\.key === ' '/);
    assert.match(card, /event\.preventDefault\(\)/);
    assert.match(card, /event\.target !== event\.currentTarget/);
    assert.match(card, /aria-label=\{ariaLabel\}/);
  });

  it('a card without an action renders plain: no role, no tabIndex, no affordance classes', () => {
    const plain = card.slice(card.indexOf('if (!onClick)'), card.indexOf('const handleKeyDown'));
    assert.match(plain, /<div className=\{className\} title=\{title\}>/);
    assert.doesNotMatch(plain, /role=|tabIndex|clickableClass/);
  });

  it('useNavAccess mirrors the App.tsx page gates', () => {
    const hook = read('hooks/useNavAccess.ts');
    assert.match(hook, /hasPermission\('products\.view'\) \|\| hasPermission\('products'\)/);
    assert.match(hook, /hasPermission\('purchases\.view'\)/);
    assert.match(hook, /hasPermission\('customers\.view'\) \|\| hasPermission\('customers'\)/);
  });

  it('SegmentedTabs idle tabs have a visible outline, a hover state and a keyboard focus ring', () => {
    const tabs = read('components/SegmentedTabs.tsx');
    assert.match(tabs, /IDLE_FRAME = '[^']*ring-1 ring-inset ring-line dark:ring-line-dark hover:ring-line-hover dark:hover:ring-line-dark-hover/);
    assert.match(tabs, /TAB_FOCUS = 'focus-visible:!ring-2 focus-visible:!ring-brand dark:focus-visible:!ring-brand-bright/);
    assert.match(tabs, /\$\{IDLE_FRAME\} \$\{IDLE_TONE\[tone\]\}/);
    assert.match(tabs, /cursor-pointer/);
  });
});

describe('clickable affordance: audited views', () => {
  it('no div/span/section/tr/li with onClick lacks role and tabIndex (use ClickableCard or a real button)', () => {
    for (const f of AUDITED) {
      for (const tag of openingTags(read(f), 'div|span|section|article|li|tr|td')) {
        if (!/\sonClick=/.test(tag)) continue;
        assert.match(tag, /role="button"/, `${f}: ${tag.slice(0, 80)}`);
        assert.match(tag, /tabIndex=/, `${f}: ${tag.slice(0, 80)}`);
      }
    }
  });

  it('views do not hand-write the pointer or card hover affordance; ClickableCard owns it', () => {
    for (const f of [...VIEWS, 'components/analytics/CashierPerformanceCard.tsx']) {
      const src = read(f);
      assert.doesNotMatch(src, /cursor-pointer/, f);
      assert.doesNotMatch(src, /hover:(?:border|shadow)-/, f);
      assert.doesNotMatch(src, /group-hover:(?:scale|-?translate)-/, f);
    }
  });

  it('every ClickableCard has an onClick that may be undefined (RBAC) and the dashboard/inventory cards use it', () => {
    for (const f of ['views/DashboardView.tsx', 'views/analytics/InventoryAnalyticsView.tsx']) {
      const src = read(f);
      const tags = [...src.matchAll(/<ClickableCard\b[\s\S]*?\n\s*>/g)].map((m) => m[0]);
      assert.ok(tags.length >= 3, f);
      for (const t of tags) assert.match(t, /\sonClick=/, `${f}: ${t.slice(0, 80)}`);
      assert.match(src, /import \{[^}]*ClickableCard[^}]*\} from '(?:\.\.\/)+components\/ClickableCard'/, f);
    }
    assert.equal([...read('views/DashboardView.tsx').matchAll(/<ClickableCard\b/g)].length, 7);
    assert.equal([...read('views/analytics/InventoryAnalyticsView.tsx').matchAll(/<ClickableCard\b/g)].length, 3);
  });

  it('cards that open another page are gated by the same permissions as that page', () => {
    const dash = read('views/DashboardView.tsx');
    assert.match(dash, /useNavAccess\(\)/);
    assert.match(dash, /navAccess\.products \? \(\) => onNavigateToProducts\('catalog', 'lowStock'\) : undefined/);
    assert.match(dash, /onClick=\{canCloseDay \? \(\) => setIsClosingModalOpen\(true\) : undefined\}/);
    const inv = read('views/analytics/InventoryAnalyticsView.tsx');
    assert.match(inv, /useNavAccess\(\)/);
    assert.match(inv, /onNavigateToProducts && navAccess\.products/);
    assert.match(inv, /onNavigateToPurchases && navAccess\.purchases/);
    assert.match(inv, /\{openPurchases && \(/);
  });

  it('display-only KPI cards do not look clickable', () => {
    const dash = read('views/DashboardView.tsx');
    const kpi4 = dash.slice(dash.indexOf('KPI 4: Invoices Count'), dash.indexOf('KPI 5: Drawer Balance'));
    assert.doesNotMatch(kpi4, /hover:|cursor-|onClick|ClickableCard/);
    const cust = read('views/analytics/CustomerAnalyticsView.tsx');
    assert.doesNotMatch(cust, /hover:border|hover:shadow/);
  });

  it('the old wrong-direction arrow is gone (RTL uses the left chevron)', () => {
    assert.doesNotMatch(read('views/analytics/InventoryAnalyticsView.tsx'), /ArrowRight/);
  });

  it('clickable heat-map bars are labelled buttons with a keyboard focus ring', () => {
    const heat = read('components/analytics/HourlyHeatmapBar.tsx');
    assert.match(heat, /aria-label=\{`\$\{item\.hourLabel\}/);
    assert.match(heat, /focus-visible:!ring-2/);
    assert.doesNotMatch(heat, /focus:outline-none/);
  });
});

describe('clickable affordance: palette tokens only', () => {
  const PALETTE = /\b(?:bg|text|border|ring|fill|stroke|from|to|via|divide|outline)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/;
  const HEX = /['"`]#[0-9a-fA-F]{3,8}\b/;
  const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

  it('has no palette classes, hex colours or emoji in the helper, the audited views and the dashboard', () => {
    // RevenueAnalyticsView draws three wallet-provider chart lines in their brand colours (SVG stroke attributes, pre-existing).
    const PROVIDER_CHART_HEX = 'views/analytics/RevenueAnalyticsView.tsx';
    for (const f of [...NEW_FILES, 'components/SegmentedTabs.tsx', ...AUDITED]) {
      const src = read(f);
      assert.doesNotMatch(src, PALETTE, f);
      if (f !== PROVIDER_CHART_HEX) assert.doesNotMatch(src, HEX, f);
      assert.doesNotMatch(src, EMOJI, f);
    }
  });

  it('every hover colour in the helper has a dark: pair on the same class string', () => {
    const lines = read('utils/clickableStyles.ts').split('\n').filter((l) => /(?<![:\w-])hover:(?:border|bg)-/.test(l));
    assert.ok(lines.length >= 5);
    for (const l of lines) {
      assert.match(l, /dark:hover:(?:border|bg)-/, l.trim());
    }
  });
});
