import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const read = (rel) => readFileSync(SRC + rel, 'utf8').replace(/\r\n/g, '\n');

const PURCHASES_DIR = SRC + 'views/purchases/';
const ZONE = [
  ...readdirSync(PURCHASES_DIR).filter((f) => f.endsWith('.tsx')).map((f) => 'views/purchases/' + f),
  'views/PurchasesView.tsx',
  'components/QuickShortageModal.tsx',
  'components/PurchaseEntryModal.tsx',
];
const WITH_BUTTONS = ZONE.filter((f) => /<button|<AppButton/.test(read(f)));

describe('button sweep: purchases zone', () => {
  it('every file with buttons uses the shared system', () => {
    for (const f of WITH_BUTTONS) {
      const src = read(f);
      assert.match(src, /AppButton|buttonClass|TABLE_ACTION_TRIGGER|MENU_ITEM/, f + ' must use AppButton/buttonClass/menu constants');
    }
  });

  it('has no leftover local button constant sets', () => {
    for (const f of ZONE) {
      const src = read(f);
      assert.doesNotMatch(src, /\bquickBtnCls\b|\b(QUICK_BTN\w*|PRIMARY_BUTTON_CLASS|SECONDARY_BUTTON_CLASS|DANGER_BUTTON_CLASS|FOOTER_BTN|BTN_\w+)\b/, f);
    }
  });

  it('has no dead classes, h-8.5 or button ring/scale leftovers', () => {
    for (const f of ZONE) {
      const src = read(f);
      assert.doesNotMatch(src, /active:scale-|\bwarn-hover\b|\bdanger-hover\b|\bbrand-darker\b|\bh-8\.5\b|\bbrand-hover\b|(?<![\w-])warn-dark(?![\w-])/, f);
      assert.doesNotMatch(src, /\b(?:emerald|amber|slate)-/, f + ' must not use palette colours');
    }
  });

  it('has no hand-written solid brand/paid/danger/warn button fills', () => {
    const SOLID = /className=(?:"|\{`)[^"`]*\bbg-(?:brand|paid|danger|warn)(?![\w-])(?!\/)[^"`]*\bh-(?:7|8|9|10|11)\b/;
    for (const f of ZONE) {
      const src = read(f);
      assert.doesNotMatch(src, SOLID, f);
    }
  });

  it('ShortagesTab: toolbar, row trigger and menu follow the shared constants', () => {
    const src = read('views/purchases/ShortagesTab.tsx');
    assert.match(src, /<AppButton\s+variant="primary"\s+size="sm"\s+icon=\{Plus\} onClick=\{\(\) => setIsQuickAddOpen\(true\)\}>\s*تسجيل نواقص\s*<\/AppButton>/);
    assert.match(src, /variant="secondary"\s+size="sm"\s+icon=\{RefreshCw\}/);
    assert.match(src, /variant="secondary"\s+size="sm"\s+icon=\{TrendingDown\}/);
    assert.match(src, /variant="success"\s+size="sm"\s+icon=\{Truck\}/);
    assert.match(src, /className=\{TABLE_ACTION_TRIGGER\}/);
    assert.match(src, /aria-expanded=\{activeMenu\?\.item\.id === item\.id\}/);
    assert.match(src, /MENU_PANEL/);
    assert.equal((src.match(/className=\{MENU_ITEM\}/g) ?? []).length + (src.match(/className=\{MENU_ITEM_DANGER\}/g) ?? []).length, 6);
    assert.doesNotMatch(src, /\brotate-180\b|ring-brand\/20|animate-pulse/, 'no ad-hoc open-state animation/ring on the trigger');
  });

  it('ShortagesTab: status pills share the movements pill geometry and every tone has a dark pair', () => {
    const src = read('views/purchases/ShortagesTab.tsx');
    const base = src.match(/STATUS_PILL_BASE = '(h-\d+) px-3\.5 (rounded-full)/);
    assert.ok(base, 'STATUS_PILL_BASE must be an h-N px-3.5 rounded-full pill');
    const tones = [...src.matchAll(/activeClass: ('[^']+'|STATUS_PILL_ACTIVE_BRAND)/g)].map((m) => m[1]);
    assert.equal(tones.length, 5);
    for (const t of tones) assert.match(t, /dark:bg-|STATUS_PILL_ACTIVE_BRAND/, t);
    assert.match(src, /STATUS_PILL_ACTIVE_BRAND = 'bg-brand text-white dark:bg-paid-bright dark:text-surface-dark'/);
    const movements = read('views/products/StockMovementsTab.tsx');
    assert.ok(movements.includes(base[1] + ' px-3.5 rounded-full'), 'shortages pills must keep the same height/radius as the movements type pills');
  });

  it('SuppliersTab: trigger and menu rows use the shared constants, no repeated name header', () => {
    const src = read('views/purchases/SuppliersTab.tsx');
    assert.match(src, /className=\{TABLE_ACTION_TRIGGER\}/);
    assert.match(src, /aria-expanded=\{activeMenu\?\.supplier\.id === sup\.id\}/);
    assert.match(src, /<AppButton variant="primary" size="md" icon=\{Plus\}/);
    assert.equal((src.match(/className=\{MENU_ITEM(?:_DANGER)?\}/g) ?? []).length, 5);
    assert.doesNotMatch(src, /rotate-180/);
  });

  it('NewPurchaseTab: payment helpers and save bar use AppButton; the fixed status area is untouched', () => {
    const src = read('views/purchases/NewPurchaseTab.tsx');
    assert.match(src, /min-h-\[17\.5rem\] flex flex-col/);
    assert.match(src, /variant="success"\s+size="lg"\s+icon=\{Receipt\}/);
    assert.match(src, /<AppButton variant="secondary" size="lg" onClick=\{onRequestCancel\}>/);
    assert.match(src, /variant="successSoft"\s+size="xs"\s+icon=\{Banknote\}/);
    assert.match(src, /تفريغ \(آجل\)/);
    assert.match(src, /تصفية الدين/);
    assert.match(src, /سداد الفرق بعد رصيدنا/);
  });

  it('icon-only AppButtons carry an aria-label', () => {
    for (const f of ZONE) {
      const src = read(f);
      const blocks = src.match(/<AppButton\b[^>]*?\/>/gs) ?? [];
      for (const b of blocks) assert.match(b, /aria-label=/, f + ': ' + b.slice(0, 80));
    }
  });

  it('raw buttons keep an explicit type', () => {
    for (const f of ZONE) {
      const src = read(f);
      for (const m of src.matchAll(/<button\b([^>]*?)>/gs)) {
        assert.match(m[1], /type=/, f + ': <button without type');
      }
    }
  });
});
