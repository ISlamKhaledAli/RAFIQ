import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (...parts) => readFileSync(join(ROOT, ...parts), 'utf8').replace(/\r\n/g, '\n');
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
    assert.match(categories, /w-\[3\.625rem\] min-w-\[3\.625rem\]/);
    assert.match(panel, /flex-none w-\[3\.625rem\] min-w-\[3\.625rem\]'/);
    assert.match(panel, /'flex-1 min-w-\[300px\] p-2\.5 sm:p-3'/);
    assert.match(panel, /transition-all duration-150/);
    assert.ok(!panel.includes('PanelLeftOpen'), 'no icon in the collapsed catalog strip');
    assert.match(panel, /PanelLeftClose/);
    assert.match(panel, /writingMode: 'vertical-rl', transform: 'rotate\(180deg\)'/, 'the vertical title reads bottom-to-top, the Arabic spine direction');
  });

  it('the expand strip and the collapse button are titled, labelled and expose aria-expanded', () => {
    assert.match(panel, /aria-expanded=\{false\}\s*aria-label="توسيع أصناف المحل"\s*title="توسيع أصناف المحل"/);
    assert.match(panel, /aria-expanded=\{true\}\s*aria-label="طي أصناف المحل"\s*title="طي أصناف المحل"/);
    assert.equal((panel.match(/w-10 h-10/g) || []).length, 0, 'the collapse button uses the shared panel toggle size');
  });

  it('the collapsed strip is only the title text: no icon and no count', () => {
    const start = panel.indexOf('{isCollapsed && (');
    const strip = panel.slice(start, panel.indexOf("<div className={isCollapsed ? 'hidden' : 'contents'}>"));
    assert.ok(start > 0 && strip.includes('أصناف المحل') && strip.includes('onClick={toggleCollapsed}'));
    assert.ok(!/<Sparkles|<PanelLeft|displayedCatalogItems/.test(strip), 'no icon and no count while collapsed');
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

describe('collapsed categories rail shows only the title text', () => {
  it('collapsed state returns one text-only strip that expands on click: no icons, no items', () => {
    const start = categories.indexOf('if (isCollapsed) {');
    const strip = categories.slice(start, categories.indexOf('\n  }\n', start));
    assert.ok(start > 0 && strip.includes('أقسام المتجر') && strip.includes('onClick={toggleCollapsed}'));
    assert.match(strip, /writingMode: 'vertical-rl', transform: 'rotate\(180deg\)'/);
    assert.ok(!/<[A-Z][A-Za-z]*\s+className="w-\d/.test(strip), 'no lucide icon inside the collapsed strip');
    assert.ok(!/IconComponent|RailItem|onSelectCategory/.test(strip), 'no section items while collapsed');
  });

  it('the old item rail is gone and the expanded list is unconditional', () => {
    assert.ok(!categories.includes('RailItem'));
    assert.ok(!categories.includes('PanelLeftOpen'));
    assert.equal((categories.match(/isCollapsed/g) || []).length, 3, 'only the state, the toggle and the early-return guard remain');
  });
});

describe('expanding the sections rail opens the catalog with it', () => {
  it('categories call onExpand only when expanding; PosView bumps a signal the catalog panel reacts to', () => {
    assert.match(categories, /if \(!next\) onExpand\?\.\(\);/);
    assert.match(posView, /onExpand=\{\(\) => setCatalogExpandSignal\(\(n\) => n \+ 1\)\}/);
    assert.match(posView, /expandSignal=\{catalogExpandSignal\}/);
    assert.match(panel, /expandSignal = 0,/);
    const effect = panel.slice(panel.indexOf('if (expandSignal === 0) return;'), panel.indexOf('const toggleCollapsed'));
    assert.match(effect, /setIsCollapsed\(false\)/);
    assert.match(effect, /localStorage\.setItem\(CATALOG_COLLAPSED_KEY, 'false'\)/);
  });
});

describe('the three panel toggles share one size', () => {
  const toggle = read('src', 'utils', 'panelToggle.ts');
  const app = read('src', 'App.tsx');

  it('one 28px button class and one 16px icon class, no leftover local sizes', () => {
    assert.match(toggle, /PANEL_TOGGLE_BUTTON_CLASS =\s*'w-7 h-7 /);
    assert.match(toggle, /PANEL_TOGGLE_ICON_CLASS = 'w-4 h-4'/);
    for (const [name, src] of [['App', app], ['catalog', panel], ['categories', categories]]) {
      assert.ok(src.includes('PANEL_TOGGLE_BUTTON_CLASS') && src.includes('PANEL_TOGGLE_ICON_CLASS'), `${name} uses the shared toggle style`);
    }
    assert.ok(!/<PanelLeftClose className="w-/.test(panel + categories), 'no local icon size on the panel toggles');
    assert.ok(!/<PanelRight(Open|Close) className="w-/.test(app), 'no local icon size on the sidebar toggle');
  });
});

describe('collapsing the catalog closes the sections rail too (the reverse of expanding)', () => {
  it('the catalog calls onCollapse only when collapsing; PosView bumps a signal the rail reacts to', () => {
    assert.match(panel, /if \(next\) onCollapse\?\.\(\);/);
    assert.match(posView, /onCollapse=\{\(\) => setCategoriesCollapseSignal\(\(n\) => n \+ 1\)\}/);
    assert.match(posView, /collapseSignal=\{categoriesCollapseSignal\}/);
    assert.match(categories, /collapseSignal = 0,/);
    const effect = categories.slice(categories.indexOf('if (collapseSignal === 0) return;'), categories.indexOf('const toggleCollapsed'));
    assert.match(effect, /setIsCollapsed\(true\)/);
    assert.match(effect, /'rafiq_pos_categories_collapsed', 'true'/);
  });
});

