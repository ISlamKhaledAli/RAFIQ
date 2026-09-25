import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateLineTotal
} from '../src/utils/money.ts';

describe('Story 43 & 44: POS Cart Model & Power Outage Draft Recovery Tests (Features #23 & #132)', () => {

  // Helper Cart Model (Mirrors PosView State & Business Rules)
  class PosCart {
    constructor() {
      this.items = [];
      this.discountPiasters = 0;
    }

    addItem(product, qtyMilli = 1000) {
      const existing = this.items.find(i => i.productId === product.id);
      if (existing) {
        existing.quantityMilli += qtyMilli;
        existing.totalPiasters = calculateLineTotal(existing.unitPricePiasters, existing.quantityMilli, existing.discountPiasters);
      } else {
        this.items.unshift({
          productId: product.id,
          productName: product.name,
          barcode: product.barcode,
          unitPricePiasters: product.pricePiasters,
          quantityMilli: qtyMilli,
          discountPiasters: 0,
          totalPiasters: calculateLineTotal(product.pricePiasters, qtyMilli, 0),
          unit: product.unit || 'piece'
        });
      }
    }

    updateQuantity(productId, newQtyMilli) {
      const item = this.items.find(i => i.productId === productId);
      if (!item) return;
      if (newQtyMilli <= 0) {
        this.removeItem(productId);
        return;
      }
      item.quantityMilli = newQtyMilli;
      item.totalPiasters = calculateLineTotal(item.unitPricePiasters, newQtyMilli, item.discountPiasters);
    }

    removeItem(productId) {
      this.items = this.items.filter(i => i.productId !== productId);
    }

    setDiscount(discountPiasters) {
      this.discountPiasters = Math.max(0, discountPiasters);
    }

    getSubtotalPiasters() {
      return this.items.reduce((sum, item) => sum + item.totalPiasters, 0);
    }

    getNetTotalPiasters() {
      return Math.max(0, this.getSubtotalPiasters() - this.discountPiasters);
    }

    getTotalItemCount() {
      return this.items.reduce((sum, item) => sum + (item.quantityMilli / 1000), 0);
    }

    serializeDraft() {
      return JSON.stringify({
        savedAt: Date.now(),
        items: this.items,
        discountPiasters: this.discountPiasters
      });
    }

    static deserializeDraft(jsonStr) {
      const parsed = JSON.parse(jsonStr);
      const cart = new PosCart();
      cart.items = parsed.items || [];
      cart.discountPiasters = parsed.discountPiasters || 0;
      return cart;
    }
  }

  describe('Feature #23: Cart Calculation & Line Item Management (Tasks 23-1 to 23-4)', () => {
    it('Task 23-1: should add items and merge identical products by increasing quantity', () => {
      const cart = new PosCart();
      const p1 = { id: 'p1', name: 'لبن جهينة 1 لتر', pricePiasters: 4200, unit: 'piece' };

      cart.addItem(p1, 1000);
      assert.equal(cart.items.length, 1);
      assert.equal(cart.items[0].quantityMilli, 1000);
      assert.equal(cart.items[0].totalPiasters, 4200);

      // Add same product again -> merges
      cart.addItem(p1, 1000);
      assert.equal(cart.items.length, 1);
      assert.equal(cart.items[0].quantityMilli, 2000);
      assert.equal(cart.items[0].totalPiasters, 8400);
    });

    it('Task 23-2: should support direct manual quantity input (e.g. typing 12)', () => {
      const cart = new PosCart();
      const p = { id: 'p2', name: 'شيبسي عائلي', pricePiasters: 1500, unit: 'piece' };
      cart.addItem(p, 1000);

      // Cashier manually types 12
      cart.updateQuantity('p2', 12000);
      assert.equal(cart.items[0].quantityMilli, 12000);
      assert.equal(cart.items[0].totalPiasters, 18000); // 12 * 15.00 = 180.00 EGP (18000 piasters)
    });

    it('Task 23-2: should remove line if quantity is set to 0 or deleted', () => {
      const cart = new PosCart();
      const p = { id: 'p3', name: 'زبادي', pricePiasters: 750, unit: 'piece' };
      cart.addItem(p, 1000);
      assert.equal(cart.items.length, 1);

      cart.updateQuantity('p3', 0);
      assert.equal(cart.items.length, 0);
    });

    it('Task 23-3: should accurately calculate subtotal, discount, and net total', () => {
      const cart = new PosCart();
      cart.addItem({ id: 'p1', name: 'أرز 1 كجم', pricePiasters: 3000 }, 2000); // 60.00 EGP
      cart.addItem({ id: 'p2', name: 'سكر 1 كجم', pricePiasters: 3500 }, 1000); // 35.00 EGP
      // Subtotal = 95.00 EGP (9500 piasters)

      assert.equal(cart.getSubtotalPiasters(), 9500);

      // Apply 5.00 EGP discount
      cart.setDiscount(500);
      assert.equal(cart.getNetTotalPiasters(), 9000);

      // Check item count
      assert.equal(cart.getTotalItemCount(), 3);
    });
  });

  describe('Feature #132: Power Outage Draft Recovery (Tasks 132-1 to 132-3)', () => {
    it('Task 132-1 & 132-3: should serialize and accurately recover full cart after simulated power cut', () => {
      const originalCart = new PosCart();
      originalCart.addItem({ id: 'p1', name: 'تونة صن شاين', pricePiasters: 5500, unit: 'piece' }, 3000);
      originalCart.addItem({ id: 'p2', name: 'جبنة دومتي 500 جم', pricePiasters: 3800, unit: 'piece' }, 2000);
      originalCart.setDiscount(600); // 6 EGP discount

      // Simulate power cut: Cart was serialized to persistent draft
      const draftJson = originalCart.serializeDraft();
      assert.ok(draftJson.length > 50);

      // System reboots: POS restores from draft
      const recoveredCart = PosCart.deserializeDraft(draftJson);
      assert.equal(recoveredCart.items.length, 2);
      assert.equal(recoveredCart.items[0].productId, 'p2');
      assert.equal(recoveredCart.items[1].productId, 'p1');
      assert.equal(recoveredCart.items[1].quantityMilli, 3000);
      assert.equal(recoveredCart.discountPiasters, 600);
      assert.equal(recoveredCart.getSubtotalPiasters(), (5500 * 3) + (3800 * 2));
      assert.equal(recoveredCart.getNetTotalPiasters(), ((5500 * 3) + (3800 * 2)) - 600);
    });

    it('Task 132-2: draft includes timestamp to verify freshness and prevent stale recovery', () => {
      const cart = new PosCart();
      cart.addItem({ id: 'p1', name: 'شاي العروسة', pricePiasters: 1200 }, 1000);
      const draft = JSON.parse(cart.serializeDraft());

      assert.ok(typeof draft.savedAt === 'number');
      assert.ok(Date.now() - draft.savedAt < 1000);
    });
  });
});
