import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildSampleReceiptSale,
  resolveStoreActivityType,
  SAMPLE_BASKETS_BY_STORE_TYPE,
  computeReceiptTotals,
} from '../src/utils/receiptLayout.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const storeProfileTabPath = path.resolve(__dirname, '../src/views/settings/StoreProfileTab.tsx');
const settingsViewPath = path.resolve(__dirname, '../src/views/SettingsView.tsx');
const invoiceTemplatesTabPath = path.resolve(__dirname, '../src/views/settings/InvoiceTemplatesTab.tsx');

describe('Receipt Sample Activity Baskets & Adaptive Store Type Preview', () => {
  it('resolves store activity type accurately by explicit code', () => {
    assert.equal(resolveStoreActivityType('pharmacy'), 'pharmacy');
    assert.equal(resolveStoreActivityType('cafe_restaurant'), 'cafe_restaurant');
    assert.equal(resolveStoreActivityType('clothing_apparel'), 'clothing_apparel');
    assert.equal(resolveStoreActivityType('phones_electronics'), 'phones_electronics');
    assert.equal(resolveStoreActivityType('produce_butchery'), 'produce_butchery');
    assert.equal(resolveStoreActivityType('dairy_bakery'), 'dairy_bakery');
    assert.equal(resolveStoreActivityType('spices_roastery'), 'spices_roastery');
    assert.equal(resolveStoreActivityType('stationery_gifts'), 'stationery_gifts');
    assert.equal(resolveStoreActivityType('toys_kids'), 'toys_kids');
    assert.equal(resolveStoreActivityType('supermarket'), 'supermarket');
  });

  it('resolves store activity type by intelligent name and header heuristics', () => {
    assert.equal(resolveStoreActivityType('', 'صيدلية رفيق للرعاية الدوائية', ''), 'pharmacy');
    assert.equal(resolveStoreActivityType('', 'مجمع الأمل الطبي', 'صيدلية وعلاج'), 'pharmacy');
    assert.equal(resolveStoreActivityType('', 'كافيه وبيتزا السلطان', 'أشهى المأكولات والمشروبات'), 'cafe_restaurant');
    assert.equal(resolveStoreActivityType('', 'بوتيك الفخامة للأزياء والملابس', ''), 'clothing_apparel');
    assert.equal(resolveStoreActivityType('', 'البرنس للهواتف والإلكترونيات وصيانة المحمول', ''), 'phones_electronics');
    assert.equal(resolveStoreActivityType('', 'جزارة النعيم للحوم الطازجة', ''), 'produce_butchery');
    assert.equal(resolveStoreActivityType('', 'ألبان ومخبز الخيرات', ''), 'dairy_bakery');
    assert.equal(resolveStoreActivityType('', 'مطحنة وعطارة البركة', ''), 'spices_roastery');
    assert.equal(resolveStoreActivityType('', 'مكتبة النجاح للأدوات المدرسية', ''), 'stationery_gifts');
    assert.equal(resolveStoreActivityType('', 'عالم الأطفال لألعاب ومكعبات الصغار', ''), 'toys_kids');
  });

  it('buildSampleReceiptSale returns pharmacy items when pharmacy is selected or detected', () => {
    const sale = buildSampleReceiptSale('pharmacy', 'صيدلية رفيق');
    assert.ok(sale.items && sale.items.length >= 3);
    const names = sale.items.map((i) => i.productName);

    assert.ok(names.some((n) => n?.includes('بنادول')));
    assert.ok(names.some((n) => n?.includes('أوجمنتين')));
    assert.ok(names.some((n) => n?.includes('كتافلام')));

    // Must not include grocery items
    assert.ok(!names.some((n) => n?.includes('جبنة عبور لاند')));
    assert.ok(!names.some((n) => n?.includes('شاي العروسة')));
  });

  it('buildSampleReceiptSale returns restaurant/cafe items when cafe_restaurant is selected', () => {
    const sale = buildSampleReceiptSale('cafe_restaurant');
    assert.ok(sale.items && sale.items.length >= 3);
    const names = sale.items.map((i) => i.productName);

    assert.ok(names.some((n) => n?.includes('برجر') || n?.includes('بيتزا')));
    assert.equal(sale.orderType, 'dine_in');
  });

  it('buildSampleReceiptSale returns clothing items when clothing_apparel is selected', () => {
    const sale = buildSampleReceiptSale('clothing_apparel');
    assert.ok(sale.items && sale.items.length >= 3);
    const names = sale.items.map((i) => i.productName);

    assert.ok(names.some((n) => n?.includes('قميص') || n?.includes('بنطلون') || n?.includes('تيشرت')));
  });

  it('verifies integer financial arithmetic across all sample baskets', () => {
    for (const [type, basket] of Object.entries(SAMPLE_BASKETS_BY_STORE_TYPE)) {
      assert.ok(Number.isInteger(basket.totalPiasters), `${type} totalPiasters must be integer`);
      assert.ok(Number.isInteger(basket.subtotalPiasters), `${type} subtotalPiasters must be integer`);
      assert.ok(Number.isInteger(basket.discountPiasters), `${type} discountPiasters must be integer`);
      assert.ok(Number.isInteger(basket.taxPiasters), `${type} taxPiasters must be integer`);
      assert.ok(Number.isInteger(basket.paidPiasters), `${type} paidPiasters must be integer`);
      assert.ok(Number.isInteger(basket.changePiasters), `${type} changePiasters must be integer`);

      for (const itm of basket.items || []) {
        assert.ok(Number.isInteger(itm.unitPricePiasters), `${type} item price must be integer`);
        assert.ok(Number.isInteger(itm.quantityMilli), `${type} item qty must be integer`);
        if (itm.discountPiasters !== undefined && itm.discountPiasters !== null) {
          assert.ok(Number.isInteger(itm.discountPiasters), `${type} item discount must be integer`);
        }
      }

      // Recompute totals with receipt engine
      const totals = computeReceiptTotals(basket);
      assert.equal(totals.total, basket.totalPiasters, `${type} totals.total must match totalPiasters`);
      assert.equal(totals.subtotal, basket.subtotalPiasters, `${type} totals.subtotal must match subtotalPiasters`);
      assert.equal(totals.paid, basket.paidPiasters, `${type} totals.paid must match paidPiasters`);
    }
  });

  it('ensures zero emojis in all sample basket definitions', () => {
    const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u;
    for (const [type, basket] of Object.entries(SAMPLE_BASKETS_BY_STORE_TYPE)) {
      for (const itm of basket.items || []) {
        assert.equal(emojiRegex.test(itm.productName || ''), false, `${type} item "${itm.productName}" has emoji`);
      }
    }
  });

  it('StoreProfileTab and SettingsView pass storeType down to preview models', () => {
    const storeProfileCode = fs.readFileSync(storeProfileTabPath, 'utf8');
    const settingsViewCode = fs.readFileSync(settingsViewPath, 'utf8');
    const invoiceTemplatesCode = fs.readFileSync(invoiceTemplatesTabPath, 'utf8');

    assert.match(storeProfileCode, /buildSampleReceiptSale\(storeType,\s*storeName,\s*receiptHeader\)/);
    assert.match(storeProfileCode, /storeType=\{storeType\}/);
    assert.match(settingsViewCode, /storeType=\{storeType\}/);
    assert.match(invoiceTemplatesCode, /resolveStoreActivityType\(storeType,\s*storeName\)/);
  });
});
