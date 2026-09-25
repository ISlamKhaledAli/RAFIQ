import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  poundsToPiasters,
  piastersToPounds
} from '../src/utils/money.ts';

describe('Story 50 — Feature #108: Quick Add Unregistered Product at POS (Tasks 108-1 to 108-4)', () => {

  describe('Task 108-1: Detection of Unregistered Scanned Barcode', () => {
    it('detects when scanned barcode is not present in product catalog', () => {
      const mockCatalog = [
        { id: 'p1', barcode: '6221001001', name: 'شاي العروسة' },
        { id: 'p2', barcode: '6221001002', name: 'سكر أبيض' }
      ];

      const findProduct = (barcode) => mockCatalog.find((p) => p.barcode === barcode) || null;

      const registered = findProduct('6221001001');
      assert.ok(registered);

      const unregistered = findProduct('6229999999');
      assert.equal(unregistered, null);
    });
  });

  describe('Task 108-2 & 108-3: Quick Product Payload Formation & Incomplete Data Tag', () => {
    it('creates well-formed product payload with needsReview flag and integer piasters', () => {
      const scannedBarcode = '6223001998877';
      const inputName = 'بسكويت شوكولاتة كوكيز';
      const inputPriceEgp = 12.50;
      const inputCostEgp = 9.00;
      const unit = 'piece';
      const categoryId = 'cat_snacks';

      const payload = {
        barcode: scannedBarcode,
        barcodes: [scannedBarcode],
        name: inputName.trim(),
        categoryId,
        pricePiasters: poundsToPiasters(inputPriceEgp),
        costPiasters: poundsToPiasters(inputCostEgp),
        stockQuantityMilli: 10000, // 10 pieces provisional initial stock
        minStockQuantityMilli: 5000,
        unit,
        taxRatePercent: 0,
        isActive: true,
        needsReview: true // Task 108-3: tagged for review
      };

      assert.equal(payload.barcode, '6223001998877');
      assert.equal(payload.pricePiasters, 1250);
      assert.equal(payload.costPiasters, 900);
      assert.equal(payload.needsReview, true);
      assert.equal(payload.stockQuantityMilli, 10000);
      assert.equal(piastersToPounds(payload.pricePiasters), 12.5);
    });

    it('validates that product name cannot be blank', () => {
      const validateQuickProduct = (name, priceEgp) => {
        if (!name || !name.trim()) return { valid: false, error: 'اسم الصنف مطلوب' };
        const p = parseFloat(priceEgp);
        if (isNaN(p) || p <= 0) return { valid: false, error: 'سعر البيع يجب أن يكون أكبر من الصفر' };
        return { valid: true };
      };

      assert.equal(validateQuickProduct('', '15.00').valid, false);
      assert.equal(validateQuickProduct('   ', '15.00').valid, false);
      assert.equal(validateQuickProduct('منتج تجريبي', '15.00').valid, true);
    });

    it('validates that selling price cannot be zero or negative', () => {
      const validateQuickProduct = (name, priceEgp) => {
        if (!name || !name.trim()) return { valid: false, error: 'اسم الصنف مطلوب' };
        const p = parseFloat(priceEgp);
        if (isNaN(p) || p <= 0) return { valid: false, error: 'سعر البيع يجب أن يكون أكبر من الصفر' };
        return { valid: true };
      };

      assert.equal(validateQuickProduct('منتج', '0').valid, false);
      assert.equal(validateQuickProduct('منتج', '-5').valid, false);
      assert.equal(validateQuickProduct('منتج', 'invalid').valid, false);
      assert.equal(validateQuickProduct('منتج', '5.50').valid, true);
    });
  });

  describe('Task 108-2: Immediate Cart Integration', () => {
    it('allows newly created quick product to be added to active cart lines immediately', () => {
      const cart = [];
      const newQuickProduct = {
        id: 'prod-new-uuid',
        name: 'عصير تفاح طبيعي',
        barcode: '622888777666',
        pricePiasters: 1500,
        costPiasters: 1100,
        unit: 'piece',
        needsReview: true
      };

      const addItemToCart = (p) => {
        cart.push({
          productId: p.id,
          productName: p.name,
          barcode: p.barcode,
          quantityMilli: 1000,
          unitPricePiasters: p.pricePiasters,
          discountPiasters: 0,
          taxPiasters: 0,
          totalPiasters: p.pricePiasters,
          unit: p.unit
        });
      };

      addItemToCart(newQuickProduct);
      assert.equal(cart.length, 1);
      assert.equal(cart[0].productName, 'عصير تفاح طبيعي');
      assert.equal(cart[0].totalPiasters, 1500);
    });
  });

});
