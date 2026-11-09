import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const read = (rel) => readFileSync(SRC + rel, 'utf8').replace(/\r\n/g, '\n');

describe('purchase invoices table: options menu', () => {
  const src = read('views/purchases/PurchasesInvoicesTab.tsx');

  it('replaces the details column by an options column', () => {
    assert.ok(!src.includes('>تفاصيل<'), 'no details header left');
    assert.ok(src.includes('>خيارات</div>'), 'options header');
    assert.ok(src.includes('<span>خيارات</span>'), 'options trigger label');
    assert.ok(!/aria-label="عرض تفاصيل الفاتورة وبنودها"/.test(src), 'no inline details icon button');
  });

  it('uses the shared trigger and menu constants with menu semantics', () => {
    for (const name of ['TABLE_ACTION_TRIGGER', 'MENU_PANEL', 'MENU_ITEM', 'MENU_ITEM_ICON']) {
      assert.ok(src.includes(name), name);
    }
    assert.ok(src.includes('aria-expanded={activeMenu?.purchase.id === pur.id}'));
    assert.ok(src.includes('aria-haspopup="menu"'));
    assert.ok(src.includes('createPortal('));
    assert.ok(src.includes("window.addEventListener('resize', close)"));
    assert.ok(src.includes("e.key === 'Escape'"));
    assert.ok(src.includes('openUpwards'));
  });

  it('keeps details first, labels as second, and no header repeating the invoice', () => {
    const menu = src.slice(src.indexOf('createPortal('));
    assert.ok(menu.indexOf('عرض التفاصيل والبنود') < menu.indexOf('طباعة ملصقات الباركود'));
    assert.ok(menu.includes('onSelectPurchase(pur)'));
    assert.ok(menu.includes('{onPrintLabels && ('));
    assert.ok(!/activeMenu\.purchase\.(invoiceNumber|supplierName)/.test(menu), 'menu does not repeat invoice info');
  });
});

describe('catalog header: help button is the last action', () => {
  it('orders the help button after the tools, categories and new-product actions', () => {
    const src = read('views/ProductsView.tsx');
    const help = src.indexOf("openHelpCenter('products')");
    const tools = src.indexOf('Senior Tools & Operations Dropdown');
    const categories = src.indexOf('إدارة الأقسام\n');
    const create = src.indexOf('onClick={openAddModal}');
    assert.ok(help > 0 && tools > 0 && categories > 0 && create > 0);
    assert.ok(tools < categories, 'tools before categories');
    assert.ok(categories < create, 'categories before the new-product button');
    assert.ok(create < help, 'help is last in the group');
    assert.ok(src.includes('aria-label="شرح ودليل إدارة الأصناف والمخزون والباركود"'));
  });
});

describe('category icon picker', () => {
  const src = read('components/CategoryIconPickerModal.tsx');

  it('is wide with a pinned footer and a scrolling body', () => {
    assert.ok(src.includes('max-w-3xl'));
    assert.ok(src.includes('max-h-[90vh]'));
    assert.ok(src.includes('overflow-y-auto'));
    assert.ok(/h-11 shrink-0/.test(src));
  });

  it('shows full Arabic names and never renders the English key', () => {
    assert.ok(!/>\s*\{item\.key\}\s*</.test(src), 'grid cell does not output the key');
    assert.ok(!/>\s*\{smartSuggestedKey\}\s*</.test(src), 'smart card does not output the key');
    assert.ok(!/>\s*\{activeKey\}\s*</.test(src));
    assert.ok(src.includes('{smartIconName'));
    assert.ok(src.includes('title={item.name}'));
    assert.ok(src.includes('break-words'));
    assert.ok(!/text-micro truncate leading-tight/.test(src), 'name is not truncated');
  });

  it('has the all-activities toggle and the store type note', () => {
    assert.ok(src.includes('عرض أيقونات كل الأنشطة'));
    assert.ok(src.includes('أيقونات مناسبة لنشاط:'));
    assert.ok(src.includes('useState(false)'));
  });

  it('keeps the stored value format (English key) when saving', () => {
    assert.ok(src.includes('handleSelectIcon(item.key)'));
    assert.ok(src.includes('setCustomCategoryIcon(categoryId || categoryName, key)'));
  });
});

describe('category icon store type filter', () => {
  const icon = (key, group, storeTypes) => ({ key, name: key, group, storeTypes, icon: null });
  const catalog = [
    icon('Pill', 'pharmacy', ['pharmacy']),
    icon('Baby', 'pharmacy', ['pharmacy', 'clothing_apparel', 'supermarket']),
    icon('Shirt', 'clothing', ['clothing_apparel']),
    icon('Tv', 'electronics', ['phones_electronics']),
    icon('Milk', 'bakery', ['dairy_bakery', 'supermarket']),
    icon('Apple', 'grocery', ['produce_butchery', 'supermarket']),
    icon('Home', 'general', ['supermarket', 'general_grocery']),
    icon('Package', 'general', ['general_grocery']),
    icon('Untagged', 'general', undefined),
  ];
  const keys = (list) => list.map((i) => i.key);
  let mod;

  it('loads', async () => {
    mod = await import('../src/utils/categoryIconFilter.ts');
    assert.equal(typeof mod.filterIconsForStoreType, 'function');
  });

  it('supermarket hides pharmacy, clothing and electronics only icons', () => {
    const got = keys(mod.filterIconsForStoreType(catalog, 'supermarket'));
    assert.deepEqual(got, ['Baby', 'Milk', 'Apple', 'Home', 'Package', 'Untagged']);
  });

  it('pharmacy shows pharmacy icons and hides supermarket-only ones', () => {
    const got = keys(mod.filterIconsForStoreType(catalog, 'pharmacy'));
    assert.deepEqual(got, ['Pill', 'Baby', 'Package', 'Untagged']);
  });

  it('clothing shows clothing icons', () => {
    const got = keys(mod.filterIconsForStoreType(catalog, 'clothing_apparel'));
    assert.deepEqual(got, ['Baby', 'Shirt', 'Package', 'Untagged']);
  });

  it('unknown, empty and general stores fall back to the supermarket set', () => {
    const expected = keys(mod.filterIconsForStoreType(catalog, 'supermarket'));
    assert.deepEqual(keys(mod.filterIconsForStoreType(catalog, '')), expected);
    assert.deepEqual(keys(mod.filterIconsForStoreType(catalog, 'toys_kids')), expected);
    assert.ok(keys(mod.filterIconsForStoreType(catalog, 'general_grocery')).includes('Home'));
  });

  it('keeps pinned keys (selected or suggested icon) visible', () => {
    const got = keys(mod.filterIconsForStoreType(catalog, 'supermarket', ['Pill']));
    assert.ok(got.includes('Pill'));
    assert.ok(!got.includes('Shirt'));
  });

  it('labels the store type in Arabic', () => {
    assert.equal(mod.getStoreTypeIconLabel('supermarket'), 'سوبر ماركت');
    assert.equal(mod.getStoreTypeIconLabel('pharmacy'), 'صيدلية');
    assert.equal(mod.getStoreTypeIconLabel(''), 'محل تجاري عام');
  });
});
