import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createDirtyTracker } from '../src/views/products/productFormDirty.ts';

const read = (rel) => readFileSync(fileURLToPath(new URL(`../src/${rel}`, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
const countOf = (text, needle) => text.split(needle).length - 1;

const FORM = 'views/products/ProductFormModal.tsx';
const src = read(FORM);

describe('product form motion: primitives and hook order', () => {
  it('imports the primitives from the shared locations', () => {
    assert.ok(src.includes("import { useMotionPanel } from '../../hooks/useMotionPanel';"));
    assert.ok(src.includes("import MotionHeight from '../../components/MotionHeight';"));
  });

  it('runs every hook before `if (!isOpen) return null`', () => {
    const early = src.search(/^\s*if \(!isOpen\) return null;/m);
    assert.ok(early > 0);
    for (const needle of ['useMotionPanel(unit)', 'useMotionPanel(productUnits.length', 'useMotionPanel(`${costCalcMode}', 'useMotionPanel(profitState)', 'useDirtyTracker(']) {
      const at = src.indexOf(needle);
      assert.ok(at !== -1, `${needle} is missing`);
      assert.ok(at < early, `${needle} must run before the early return`);
    }
  });

  it('keys the entrance on the real switch (unit, packaging tier, calculator mode, profit state)', () => {
    assert.match(src, /const stockPanel = useMotionPanel\(unit\);/);
    assert.match(src, /const stockTierPanel = useMotionPanel\(productUnits\.length > 2 \? 'multi' : 'pack'\);/);
    assert.match(src, /const costCalcPanel = useMotionPanel\(`\$\{costCalcMode\}\|\$\{unit\}`\);/);
    assert.match(src, /const profitPanel = useMotionPanel\(profitState\);/);
    assert.match(src, /const profitState = pricePiasters < costPiasters \? 'loss' : pricePiasters === costPiasters \? 'even' : 'profit';/);
  });
});

describe('product form motion: the switch sites are wrapped', () => {
  it('spreads each panel on a plain container that is never keyed (no remount of the inputs inside)', () => {
    for (const name of ['stockPanel', 'stockTierPanel', 'costCalcPanel', 'profitPanel']) {
      assert.equal(countOf(src, `{...${name}}`), 1, `${name} must be spread exactly once`);
      assert.doesNotMatch(src, new RegExp(`\\{\\.\\.\\.${name}\\}[^>]*\\bkey=`), `${name} container must not carry a key`);
    }
  });

  it('wraps the three data cards and the advanced card in a balanced MotionHeight with the card look on the outside', () => {
    const opens = countOf(src, '<MotionHeight');
    assert.equal(opens, 4);
    assert.equal(countOf(src, '</MotionHeight>'), opens);
    const cards = src.match(/<MotionHeight className="p-3\.5 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl shadow-2xs">\n\s*<div (?:ref=\{pricingCardRef\} )?className="flex flex-col gap-3">/g) ?? [];
    assert.equal(cards.length, 4, 'every card keeps its flex column + gap inside the MotionHeight body');
  });

  it('keeps the pricing card ref on the card content (scrollIntoView target)', () => {
    assert.match(src, /<div ref=\{pricingCardRef\} className="flex flex-col gap-3">/);
  });

  it('keeps the modal header and the footer bar outside every animated region', () => {
    const header = src.slice(src.indexOf('{/* Modal Header */}'), src.indexOf('{/* Modal Form */}'));
    const footer = src.slice(src.indexOf('{/* Footer Actions (Docked at bottom) */}'));
    for (const part of [header, footer]) {
      assert.doesNotMatch(part, /<MotionHeight|\{\.\.\.\w+Panel\}|data-motion-phase/);
    }
    assert.ok(src.lastIndexOf('</MotionHeight>') < src.indexOf('{/* Footer Actions (Docked at bottom) */}'));
  });

  it('adds no height styling or transitions of its own', () => {
    assert.doesNotMatch(src, /style=\{\{[^}]*(height|maxHeight)/i);
    assert.doesNotMatch(src, /transition-\[(max-)?height\]|transition-height|max-h-0/);
  });

  it('wraps nothing around the price, barcode or quantity inputs except layout-neutral blocks', () => {
    assert.match(src, /<div \{\.\.\.profitPanel\}>\n\s*\{\(\(\) => \{/);
    assert.match(src, /<div \{\.\.\.stockPanel\} className="flex flex-col gap-3">/);
    assert.match(src, /<div \{\.\.\.stockTierPanel\}>\n\s*\{productUnits\.length > 2 \? \(/);
    assert.match(src, /<div \{\.\.\.costCalcPanel\}>\n\s*\{costCalcMode === 'carton' && unit !== 'kg' \? \(/);
  });
});

describe('product form dirty detection: wiring', () => {
  it('no longer treats "has a value" as dirty', () => {
    assert.doesNotMatch(src, /const isDirty = useMemo/);
    assert.doesNotMatch(src, /productUnits\.length > 0 \|\|/);
    assert.match(src, /isDirty: dirtyTracker\.isDirty,/);
  });

  it('keys the snapshot on the opening and tracks every persisted field', () => {
    assert.match(src, /useDirtyTracker\(isOpen \? \(editingId \?\? 'new'\) : null, \{/);
    for (const field of ['name', 'barcode', 'additionalBarcodes', 'newBarcodeInput', 'categoryId', 'pricePiasters', 'costPiasters', 'unit', 'productUnits', 'stockInput', 'stockAdjustReason', 'minStockInput', 'taxRatePercent', 'internalCode', 'taxCategoryCode', 'variantSize', 'variantColor', 'initialExpiryDate', 'initialBatchNumber', 'isLooseSellable', 'defaultSaleUnitId', 'displayUnitId', 'locationId', 'isColdChain', 'pharmaInfo']) {
      assert.match(src, new RegExp(`useDirtyTracker\\([\\s\\S]*?\\n    ${field},?(?::|\\n)`), `${field} is not tracked`);
    }
    assert.match(src, /defaultPurchaseUnitId: _defaultPurchaseUnitId,/);
  });

  it('only user actions touch the form (typing, change, a click on a button or label), not focus or loading', () => {
    assert.match(src, /onInputCapture=\{handleFormInteraction\}/);
    assert.match(src, /onChangeCapture=\{handleFormInteraction\}/);
    assert.match(src, /onClickCapture=\{handleFormInteraction\}/);
    assert.match(src, /e\.type !== 'click' \|\| \(e\.target as Element\)\.closest\('button, label'\)/);
    assert.doesNotMatch(src, /onFocusCapture=\{handleFormInteraction\}/);
  });
});

const NEW_PRODUCT = () => ({
  name: '',
  barcode: '',
  pricePiasters: 0,
  stockInput: '0',
  productUnits: [{ unitName: 'قطعة', conversionFactor: 1, isBaseUnit: true, sellPricePiasters: 0, costPricePiasters: 0, barcode: '' }],
  pharmaInfo: undefined,
});

describe('product form dirty detection: tracker', () => {
  it('a new product with its default base unit and zero stock is clean, touched or not', () => {
    const t = createDirtyTracker();
    t.sync('new', NEW_PRODUCT());
    assert.equal(t.isDirty(), false);
    t.touch();
    t.sync('new', NEW_PRODUCT());
    assert.equal(t.isDirty(), false, 'a click that changes nothing is not a change');
  });

  it('an existing product opened and closed unchanged is clean (it always carries a name, barcode and price)', () => {
    const t = createDirtyTracker();
    t.sync('prod_1', { name: 'شاي', barcode: '6221', pricePiasters: 4200 });
    t.touch();
    t.sync('prod_1', { name: 'شاي', barcode: '6221', pricePiasters: 4200 });
    assert.equal(t.isDirty(), false);
  });

  it('data that arrives after opening and before the first touch (units, batch, pharmacy info) is part of the baseline', () => {
    const t = createDirtyTracker();
    t.sync('prod_1', { name: 'شاي', productUnits: [{ unitName: 'قطعة' }], initialBatchNumber: '' });
    t.sync('prod_1', { name: 'شاي', productUnits: [{ unitName: 'قطعة' }, { unitName: 'كرتونة' }], initialBatchNumber: 'LOT-7' });
    assert.equal(t.isDirty(), false);
    t.touch();
    t.sync('prod_1', { name: 'شاي 2', productUnits: [{ unitName: 'قطعة' }, { unitName: 'كرتونة' }], initialBatchNumber: 'LOT-7' });
    assert.equal(t.isDirty(), true);
  });

  it('typing, then reverting to the opening value, is clean again', () => {
    const t = createDirtyTracker();
    t.sync('new', NEW_PRODUCT());
    t.touch();
    t.sync('new', { ...NEW_PRODUCT(), name: 'صنف' });
    assert.equal(t.isDirty(), true);
    t.sync('new', NEW_PRODUCT());
    assert.equal(t.isDirty(), false);
  });

  it('formatting is not a change: Arabic digits, numeric strings, null, undefined and empty text', () => {
    const t = createDirtyTracker();
    t.sync('prod_1', { stockInput: '12', minStock: '5.0', note: null, code: undefined, flag: false });
    t.touch();
    t.sync('prod_1', { stockInput: '١٢', minStock: '5', note: '', code: '', flag: undefined });
    assert.equal(t.isDirty(), false);
  });

  it('nested lists and flags still count: a changed unit price or a ticked flag is dirty', () => {
    const t = createDirtyTracker();
    t.sync('prod_1', { units: [{ unitName: 'قطعة', sellPricePiasters: 500 }], isColdChain: false });
    t.touch();
    t.sync('prod_1', { units: [{ unitName: 'قطعة', sellPricePiasters: 600 }], isColdChain: false });
    assert.equal(t.isDirty(), true);
    t.sync('prod_1', { units: [{ unitName: 'قطعة', sellPricePiasters: 500 }], isColdChain: true });
    assert.equal(t.isDirty(), true);
  });

  it('a different opening (another product, or reopening) starts clean and untouched', () => {
    const t = createDirtyTracker();
    t.sync('new', NEW_PRODUCT());
    t.touch();
    t.sync('new', { ...NEW_PRODUCT(), name: 'صنف' });
    assert.equal(t.isDirty(), true);
    t.sync(null, { ...NEW_PRODUCT(), name: 'صنف' });
    assert.equal(t.isDirty(), false, 'closed form is never dirty');
    t.sync('new', NEW_PRODUCT());
    assert.equal(t.isDirty(), false, 'reopening starts from a fresh snapshot');
    t.sync('prod_2', { name: 'لبن' });
    assert.equal(t.isDirty(), false);
  });

  it('a touch alone (before any sync) never reports dirty', () => {
    const t = createDirtyTracker();
    t.touch();
    assert.equal(t.isDirty(), false);
  });
});
