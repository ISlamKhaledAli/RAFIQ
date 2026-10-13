import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateLineTotal,
  poundsToPiasters,
  formatArabicCurrency
} from '../src/utils/money.ts';

describe('Senior Quick Items & POS Cart Edge Cases Audit (تدقيق السنيور للأصناف السريعة وحالات سلة البيع المعقدة)', () => {

  // Pure logic cart simulator matching PosView.tsx business rules exactly
  class SeniorAuditCart {
    constructor() {
      this.items = [];
    }

    addItem(product, unitPrice, qtyMilli = 1000, unitId = null, unitName = 'قطعة') {
      // Rule: In PosView.tsx, items can only merge if productId, unitId, unitPricePiasters, AND productName match.
      const existingIndex = this.items.findIndex(item =>
        item.productId === product.id &&
        (item.unitId || null) === (unitId || null) &&
        item.unitPricePiasters === unitPrice &&
        item.productName === product.name
      );

      if (existingIndex >= 0) {
        let newQty = this.items[existingIndex].quantityMilli;
        if (product.isWeighed) {
          // Weight accumulation rule: multiple weighings of same product accumulate, NOT overwrite!
          newQty += qtyMilli;
        } else {
          newQty += qtyMilli;
        }

        const updated = [...this.items];
        updated[existingIndex] = {
          ...updated[existingIndex],
          quantityMilli: newQty,
          totalPiasters: calculateLineTotal(unitPrice, newQty, updated[existingIndex].discountPiasters || 0)
        };
        this.items = updated;
      } else {
        const newItem = {
          id: 'item-' + Math.random().toString(36).substring(2, 9),
          productId: product.id,
          productName: product.name,
          barcode: product.barcode || '',
          unitPricePiasters: unitPrice,
          unitCostPiasters: product.costPiasters || 0,
          quantityMilli: qtyMilli,
          discountPiasters: 0,
          totalPiasters: calculateLineTotal(unitPrice, qtyMilli, 0),
          unit: unitName,
          unitId: unitId || null,
          isWeighed: Boolean(product.isWeighed),
          isQuickItem: Boolean(product.isQuickItem),
          isOpenPrice: Boolean(product.isOpenPrice)
        };
        this.items = [newItem, ...this.items];
      }
    }

    getSubtotalPiasters() {
      return this.items.reduce((sum, item) => sum + item.totalPiasters, 0);
    }

    getTotalCostPiasters() {
      return this.items.reduce((sum, item) => {
        const itemCost = Math.round((item.unitCostPiasters * item.quantityMilli) / 1000);
        return sum + itemCost;
      }, 0);
    }

    getOperatingProfitPiasters() {
      return this.getSubtotalPiasters() - this.getTotalCostPiasters();
    }
  }

  describe('1. Open-Price Standalone Items Separation (منع دمج الأصناف مفتوحة السعر بأسعار مختلفة)', () => {
    it('keeps separate cart lines when same open-price quick item is added at different prices', () => {
      const cart = new SeniorAuditCart();
      const openQuickItem = {
        id: 'quick-service-custom',
        name: 'خدمة شحن فوري',
        isQuickItem: true,
        isOpenPrice: true,
        costPiasters: 0,
        pricePiasters: 0
      };

      // Cashier enters 25.00 EGP (2500 piasters) for first customer request
      cart.addItem(openQuickItem, 2500, 1000, null, 'خدمة');
      assert.equal(cart.items.length, 1);
      assert.equal(cart.items[0].unitPricePiasters, 2500);

      // Cashier enters 30.00 EGP (3000 piasters) for second customer request
      cart.addItem(openQuickItem, 3000, 1000, null, 'خدمة');
      
      // CRITICAL ASSERTION: The cart MUST retain 2 separate lines, NOT merge and overwrite price
      assert.equal(cart.items.length, 2, 'Separate lines must be maintained for distinct prices of open-price items');
      assert.equal(cart.items[0].unitPricePiasters, 3000);
      assert.equal(cart.items[1].unitPricePiasters, 2500);
      assert.equal(cart.getSubtotalPiasters(), 5500, 'Subtotal must strictly be 55.00 EGP');
    });

    it('merges lines only if the exact same open-price item has identical price', () => {
      const cart = new SeniorAuditCart();
      const openItem = {
        id: 'quick-open-repair',
        name: 'صيانة فورية',
        isQuickItem: true,
        isOpenPrice: true,
        costPiasters: 0
      };

      cart.addItem(openItem, 4000, 1000, null, 'خدمة');
      cart.addItem(openItem, 4000, 1000, null, 'خدمة');

      assert.equal(cart.items.length, 1, 'Identical price lines for the same service can merge');
      assert.equal(cart.items[0].quantityMilli, 2000, 'Quantity accumulates to 2');
      assert.equal(cart.items[0].totalPiasters, 8000);
    });
  });

  describe('2. Electronic Scale Multiple Weighing Accumulation (تراكم أوزان الصنف الموزون)', () => {
    it('accumulates weight instead of replacing it when cashier places second bag of weighed item', () => {
      const cart = new SeniorAuditCart();
      const weighedProduct = {
        id: 'prod-apples-uuid',
        name: 'تفاح أحمر إيطالي',
        isWeighed: true,
        pricePiasters: 4000, // 40.00 EGP / kg
        costPiasters: 2500
      };

      // Bag 1 weighed on electronic scale: 1.250 kg (1250 milli)
      cart.addItem(weighedProduct, 4000, 1250, null, 'كجم');
      assert.equal(cart.items.length, 1);
      assert.equal(cart.items[0].quantityMilli, 1250);
      assert.equal(cart.items[0].totalPiasters, 5000); // 40.00 * 1.250 = 50.00 EGP (5000 piasters)

      // Bag 2 weighed on electronic scale: 0.750 kg (750 milli)
      cart.addItem(weighedProduct, 4000, 750, null, 'كجم');
      
      // CRITICAL ASSERTION: Weight accumulates to 2.000 kg (2000 milli), previous bag was not wiped out!
      assert.equal(cart.items.length, 1);
      assert.equal(cart.items[0].quantityMilli, 2000, 'Total weight should be 2,000 milli (2.000 kg)');
      assert.equal(cart.items[0].totalPiasters, 8000, 'Total price should be 80.00 EGP (8000 piasters)');
    });
  });

  describe('3. Operating Profit Margin for Standalone Quick Items (صفر تكلفة للأصناف الخدمية والمستقلة)', () => {
    it('guarantees 100% operating margin and zero cost on standalone custom services', () => {
      const cart = new SeniorAuditCart();
      const standaloneService = {
        id: 'quick-service-delivery',
        name: 'خدمة توصيل منزلي',
        isQuickItem: true,
        costPiasters: 0,
        pricePiasters: 2500
      };

      cart.addItem(standaloneService, 2500, 1000, null, 'خدمة');

      assert.equal(cart.getTotalCostPiasters(), 0, 'Cost for standalone custom service must be strictly 0');
      assert.equal(cart.getOperatingProfitPiasters(), 2500, 'Operating profit must be exactly 100% of revenue (25.00 EGP)');
    });

    it('correctly calculates mixed profit when cart has both warehouse inventory items and standalone services', () => {
      const cart = new SeniorAuditCart();
      const warehouseItem = {
        id: 'prod-milk',
        name: 'حليب كامل الدسم',
        pricePiasters: 3500, // 35.00 EGP
        costPiasters: 2800   // 28.00 EGP cost
      };
      const quickBag = {
        id: 'quick-plastic-bag',
        name: 'كيس قماش صديق للبيئة',
        isQuickItem: true,
        pricePiasters: 500,  // 5.00 EGP
        costPiasters: 0      // 0 cost service fee
      };

      cart.addItem(warehouseItem, 3500, 2000, null, 'علبة'); // 2 * 35 = 70.00 EGP
      cart.addItem(quickBag, 500, 1000, null, 'قطعة');       // 1 * 5 = 5.00 EGP

      assert.equal(cart.getSubtotalPiasters(), 7500, '75.00 EGP total revenue');
      assert.equal(cart.getTotalCostPiasters(), 5600, '2 * 28.00 = 56.00 EGP total inventory cost');
      assert.equal(cart.getOperatingProfitPiasters(), 1900, 'Operating profit = 7500 - 5600 = 1900 piasters (19.00 EGP)');
    });
  });

  describe('4. Input Sanitization & Fractional Piaster Defense (التحقق من صحة الإدخال ومقاومة الكسور)', () => {
    it('properly converts string price inputs to integer piasters without float inaccuracies', () => {
      assert.equal(poundsToPiasters('10.50'), 1050);
      assert.equal(poundsToPiasters('0.75'), 75);
      assert.equal(poundsToPiasters('100'), 10000);
      assert.equal(poundsToPiasters('١٢.٥٠'), 1250, 'Arabic numerals converted cleanly');
      assert.equal(poundsToPiasters('invalid'), 0, 'Invalid string safely parsed as 0');
    });

    it('formats piasters to display string cleanly without rounding distortions', () => {
      assert.equal(formatArabicCurrency(1050, false), '10.50');
      assert.equal(formatArabicCurrency(75, false), '0.75');
      assert.equal(formatArabicCurrency(10000, false), '100.00');
      assert.equal(formatArabicCurrency(0, false), '0.00');
      assert.equal(formatArabicCurrency(1500, true), '15.00 ج.م');
    });
  });
});
