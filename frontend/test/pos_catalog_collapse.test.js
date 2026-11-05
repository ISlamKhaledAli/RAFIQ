import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (...parts) => readFileSync(join(ROOT, ...parts), 'utf8');
const panel = read('src', 'views', 'pos', 'PosCatalogPanel.tsx');
const categories = read('src', 'views', 'pos', 'PosCategoriesPanel.tsx');
const posView = read('src', 'views', 'PosView.tsx');

describe('POS catalog panel (أصناف المحل) is collapsible like the categories rail', () => {
  it('persists under its own key, expanded by default, read lazily with try/catch', () => {
    assert.match(panel, /const CATALOG_COLLAPSED_KEY = 'rafiq_pos_catalog_collapsed';/);
    assert.match(panel, /useState<boolean>\(\(\) => \{\s*try \{\s*return localStorage\.getItem\(CATALOG_COLLAPSED_KEY\) === 'true';\s*\} catch \{\s*return false;/);
    assert.match(panel, /localStorage\.setItem\(CATALOG_COLLAPSED_KEY, String\(next\)\)/);
    assert.notEqual('rafiq_pos_catalog_collapsed', 'rafiq_pos_categories_collapsed');
  });

  it('uses the same animation and toggle icons as the categories rail', () => {
    assert.match(categories, /w-\[4\.75rem\] min-w-\[4\.75rem\]/);
    assert.match(panel, /flex-none w-\[3\.625rem\] min-w-\[3\.625rem\]/);
    assert.match(panel, /'flex-1 min-w-\[300px\] p-2\.5 sm:p-3'/);
    assert.match(panel, /transition-all duration-150/);
    assert.match(panel, /PanelLeftOpen/);
    assert.match(panel, /PanelLeftClose/);
    assert.match(panel, /writingMode: 'vertical-rl', transform: 'rotate\(180deg\)'/, 'the vertical title reads bottom-to-top, the Arabic spine direction');
  });

  it('both controls are 40px, titled, labelled and expose aria-expanded', () => {
    assert.match(panel, /aria-expanded=\{false\}\s*aria-label="توسيع أصناف المحل"\s*title="توسيع أصناف المحل"/);
    assert.match(panel, /aria-expanded=\{true\}\s*aria-label="طي أصناف المحل"\s*title="طي أصناف المحل"/);
    assert.equal((panel.match(/w-10 h-10/g) || []).length, 2);
  });

  it('the rail shows the real count of the active tab with readable, dark-paired colours', () => {
    assert.match(panel, /\{displayedCatalogItems\.length\}/);
    assert.match(panel, /text-sm font-mono font-extrabold[^"]*dark:text-paid-bright/);
    assert.doesNotMatch(panel, /text-\[\d+px\]/);
  });

  it('state survives: the body stays mounted (hidden), search/tab live in PosView, grid scroll is restored', () => {
    assert.match(panel, /<div className=\{isCollapsed \? 'hidden' : 'contents'\}>/);
    assert.match(panel, /savedScrollTopRef\.current = gridRef\.current\.scrollTop/);
    assert.match(panel, /gridRef\.current\.scrollTop = savedScrollTopRef\.current/);
    assert.match(panel, /catalogSearchQuery,\s*setCatalogSearchQuery,\s*activeCatalogTab/);
  });

  it('toggling returns focus to the barcode input and adds no global shortcut', () => {
    assert.match(panel, /onAfterToggle\?\.\(\);/);
    assert.match(posView, /onAfterToggle=\{\(\) => barcodeInputRef\.current\?\.focus\(\)\}/);
    assert.doesNotMatch(panel, /addEventListener\('keydown'/);
  });

  it('the cart region keeps flex-1 so it takes the freed width without a layout change when expanded', () => {
    assert.match(posView, /showFastItems \? 'flex-1 min-w-\[360px\]' : 'flex-1'/);
  });
});

describe('collapsed categories rail shows names, not icons', () => {
  it('renders RailItem text labels with the count and no icon in the collapsed branch', () => {
    assert.match(categories, /const RailItem: React\.FC<RailItemProps>/);
    assert.match(categories, /line-clamp-2/);
    assert.match(categories, /label="الكل"/);
    assert.match(categories, /label="الأكثر طلباً"/);
    assert.match(categories, /label="المفضلة"/);
    assert.match(categories, /label=\{cat\.name\}/);
    const rail = categories.slice(categories.indexOf('const RailItem'), categories.indexOf('export const PosCategoriesPanel'));
    assert.ok(!/IconComponent|<Flame|<Star|<LayoutGrid/.test(rail), 'the rail item has no icon');
  });
});

