import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Feature #17 / Tasks 17-1, 17-2, 17-3, 17-4
 * Rules:
 * 1. Financial values strictly in integer piasters (Money Rule 1).
 * 2. Warning (not strict blocking) if selling price is less than cost.
 * 3. Support price zero (free / promotional gifts) while warning if cost > 0.
 * 4. Negative price or negative cost are strictly forbidden.
 * 5. Accurate profit margin and markup calculations.
 * 6. Full price history alteration tracking.
 */

// Simulated ProductService business rules matching desktop/Services/ProductService.cs
class MockPriceService {
  constructor() {
    this.products = new Map();
    this.priceHistory = [];
  }

  calculateProfit(pricePiasters, costPiasters) {
    return pricePiasters - costPiasters;
  }

  calculateMarkupPercent(pricePiasters, costPiasters) {
    if (costPiasters <= 0) return 0.0;
    return Number((((pricePiasters - costPiasters) / costPiasters) * 100).toFixed(2));
  }

  calculateMarginPercent(pricePiasters, costPiasters) {
    if (pricePiasters <= 0) return 0.0;
    return Number((((pricePiasters - costPiasters) / pricePiasters) * 100).toFixed(2));
  }

  saveProduct(product, confirmBelowCost = false) {
    if (!product || !product.name || !product.name.trim()) {
      throw new Error('اسم المنتج مطلوب ولا يمكن أن يكون فارغاً');
    }

    if (product.pricePiasters < 0) {
      throw new Error('سعر البيع لا يمكن أن يكون سالباً');
    }

    if (product.costPiasters < 0) {
      throw new Error('سعر التكلفة لا يمكن أن يكون سالباً');
    }

    // Task 17-1: تنبيه (وليس منع) لو سعر البيع أقل من التكلفة
    if (product.pricePiasters < product.costPiasters && !confirmBelowCost) {
      const loss = product.costPiasters - product.pricePiasters;
      const err = new Error(`سعر البيع (${(product.pricePiasters / 100).toFixed(2)} ج.م) أقل من سعر التكلفة (${(product.costPiasters / 100).toFixed(2)} ج.م)`);
      err.code = 'BELOW_COST_WARNING';
      err.details = {
        pricePiasters: product.pricePiasters,
        costPiasters: product.costPiasters,
        lossPiasters: loss
      };
      throw err;
    }

    const existing = product.id ? this.products.get(product.id) : null;
    const finalProduct = {
      ...product,
      id: product.id || `prod_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      createdAt: existing ? existing.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Task 17-3: Price history tracking
    if (existing) {
      if (existing.pricePiasters !== finalProduct.pricePiasters || existing.costPiasters !== finalProduct.costPiasters) {
        this.priceHistory.push({
          id: `ph_${this.priceHistory.length + 1}`,
          productId: finalProduct.id,
          oldPricePiasters: existing.pricePiasters,
          newPricePiasters: finalProduct.pricePiasters,
          oldCostPiasters: existing.costPiasters,
          newCostPiasters: finalProduct.costPiasters,
          changeReason: 'تعديل سعر وتكلفة يدوي',
          createdAt: new Date().toISOString()
        });
      }
    } else {
      this.priceHistory.push({
        id: `ph_${this.priceHistory.length + 1}`,
        productId: finalProduct.id,
        oldPricePiasters: 0,
        newPricePiasters: finalProduct.pricePiasters,
        oldCostPiasters: 0,
        newCostPiasters: finalProduct.costPiasters,
        changeReason: 'تسجيل السعر الأولي للصنف الجديد',
        createdAt: new Date().toISOString()
      });
    }

    this.products.set(finalProduct.id, finalProduct);
    return finalProduct;
  }

  getPriceHistory(productId) {
    return this.priceHistory.filter(h => h.productId === productId);
  }
}

describe('Feature #17: Selling Price, Cost Rules & Price History', () => {
  it('Task 17-1: calculates profit, markup percent, and margin percent accurately', () => {
    const service = new MockPriceService();
    // Cost: 20 EGP (2000 piasters), Selling Price: 25 EGP (2500 piasters)
    const profit = service.calculateProfit(2500, 2000);
    const markup = service.calculateMarkupPercent(2500, 2000);
    const margin = service.calculateMarginPercent(2500, 2000);

    assert.equal(profit, 500); // 5 EGP
    assert.equal(markup, 25.0); // 25% markup on cost
    assert.equal(margin, 20.0); // 20% margin on sales price
  });

  it('Task 17-1 & 17-4: warns when selling price is less than cost without confirm flag', () => {
    const service = new MockPriceService();
    // Cost: 3000 piasters (30 EGP), Price: 2500 piasters (25 EGP) -> 500 piasters loss
    assert.throws(() => {
      service.saveProduct({
        name: 'منتج تحت التكلفة',
        pricePiasters: 2500,
        costPiasters: 3000
      }, false);
    }, (err) => {
      assert.equal(err.code, 'BELOW_COST_WARNING');
      assert.equal(err.details.lossPiasters, 500);
      assert.equal(err.details.pricePiasters, 2500);
      assert.equal(err.details.costPiasters, 3000);
      return true;
    });
  });

  it('Task 17-1: allows saving below cost when user confirms explicitly (override alert)', () => {
    const service = new MockPriceService();
    const saved = service.saveProduct({
      name: 'عرض ترويجي مخفض بالخسارة',
      pricePiasters: 1500,
      costPiasters: 2000
    }, true); // confirmBelowCost = true

    assert.ok(saved.id);
    assert.equal(saved.pricePiasters, 1500);
    assert.equal(saved.costPiasters, 2000);
  });

  it('Task 17-4: supports zero selling price (promotional/free gift) with appropriate rules', () => {
    const service = new MockPriceService();
    
    // Case 1: Price 0, Cost > 0 -> Warns below cost if not confirmed
    assert.throws(() => {
      service.saveProduct({
        name: 'عينة مجانية لها تكلفة',
        pricePiasters: 0,
        costPiasters: 500
      }, false);
    }, (err) => {
      assert.equal(err.code, 'BELOW_COST_WARNING');
      assert.equal(err.details.lossPiasters, 500);
      return true;
    });

    // Case 2: Price 0, Cost > 0 -> Permitted when confirmed
    const freeWithCost = service.saveProduct({
      name: 'عينة مجانية مدفوعة التكلفة',
      pricePiasters: 0,
      costPiasters: 500
    }, true);
    assert.equal(freeWithCost.pricePiasters, 0);

    // Case 3: Price 0, Cost 0 -> Completely free sample, no loss, saves directly
    const completelyFree = service.saveProduct({
      name: 'كيس هدايا مجاني من المورد',
      pricePiasters: 0,
      costPiasters: 0
    }, false);
    assert.equal(completelyFree.pricePiasters, 0);
    assert.equal(completelyFree.costPiasters, 0);
  });

  it('Task 17-4: strictly rejects negative price or negative cost', () => {
    const service = new MockPriceService();

    assert.throws(() => {
      service.saveProduct({
        name: 'منتج بسعر سالب',
        pricePiasters: -100,
        costPiasters: 500
      }, true);
    }, /سعر البيع لا يمكن أن يكون سالباً/);

    assert.throws(() => {
      service.saveProduct({
        name: 'منتج بتكلفة سالبة',
        pricePiasters: 500,
        costPiasters: -200
      }, true);
    }, /سعر التكلفة لا يمكن أن يكون سالباً/);
  });

  it('Task 17-3: tracks complete price and cost history upon modifications', () => {
    const service = new MockPriceService();

    // 1. Initial product creation
    const product = service.saveProduct({
      id: 'prod_tea_001',
      name: 'شاي العروسة 250 جم',
      pricePiasters: 3500, // 35 EGP
      costPiasters: 2800   // 28 EGP
    });

    let history = service.getPriceHistory(product.id);
    assert.equal(history.length, 1);
    assert.equal(history[0].oldPricePiasters, 0);
    assert.equal(history[0].newPricePiasters, 3500);
    assert.equal(history[0].oldCostPiasters, 0);
    assert.equal(history[0].newCostPiasters, 2800);

    // 2. Price increase by supplier
    service.saveProduct({
      id: 'prod_tea_001',
      name: 'شاي العروسة 250 جم',
      pricePiasters: 4000, // 40 EGP
      costPiasters: 3300   // 33 EGP
    });

    history = service.getPriceHistory(product.id);
    assert.equal(history.length, 2);
    const latestChange = history[1];
    assert.equal(latestChange.oldPricePiasters, 3500);
    assert.equal(latestChange.newPricePiasters, 4000);
    assert.equal(latestChange.oldCostPiasters, 2800);
    assert.equal(latestChange.newCostPiasters, 3300);

    // 3. Modifying another field (like name) without price change does not add spurious price history
    service.saveProduct({
      id: 'prod_tea_001',
      name: 'شاي العروسة فاخر 250 جم',
      pricePiasters: 4000,
      costPiasters: 3300
    });

    history = service.getPriceHistory(product.id);
    assert.equal(history.length, 2); // Unchanged count
  });
});
