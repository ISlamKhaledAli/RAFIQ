import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Feature #18 / Tasks 18-1 & 18-2: Minimum Stock & Bulk Update
 * Rules:
 * 1. Each product stores min_stock_quantity_milli (default 5000 = 5 pieces).
 * 2. Alert triggers when stock <= minStock.
 * 3. Supports bulk updating min stock across multiple product IDs in a single operation.
 * 4. Negative min stock is strictly prohibited.
 */

class MockStockService {
  constructor() {
    this.products = new Map();
  }

  saveProduct(product) {
    if (!product || !product.name) throw new Error('اسم المنتج مطلوب');
    const minStockMilli = product.minStockQuantityMilli !== undefined ? product.minStockQuantityMilli : 5000;
    if (minStockMilli < 0) {
      throw new Error('الحد الأدنى للمخزون لا يمكن أن يكون سالباً');
    }

    const p = {
      ...product,
      id: product.id || `p_${Date.now()}_${Math.random()}`,
      stockQuantityMilli: product.stockQuantityMilli || 0,
      minStockQuantityMilli: minStockMilli
    };
    this.products.set(p.id, p);
    return p;
  }

  bulkUpdateMinStock(productIds, newMinStockMilli) {
    if (!Array.isArray(productIds) || productIds.length === 0) return 0;
    if (newMinStockMilli < 0) {
      throw new Error('الحد الأدنى للمخزون لا يمكن أن يكون سالباً');
    }

    let updatedCount = 0;
    for (const id of productIds) {
      const prod = this.products.get(id);
      if (prod) {
        prod.minStockQuantityMilli = newMinStockMilli;
        updatedCount++;
      }
    }
    return updatedCount;
  }

  getStockStatus(product) {
    const stockPieces = product.stockQuantityMilli / 1000;
    const minPieces = product.minStockQuantityMilli / 1000;

    if (stockPieces <= 0) {
      return { status: 'out_of_stock', label: 'نافد' };
    }
    if (stockPieces <= minPieces) {
      return { status: 'low_stock', label: `نقص (${minPieces})` };
    }
    return { status: 'in_stock', label: 'متوفر' };
  }
}

describe('Feature #18: Minimum Stock Threshold & Bulk Update', () => {
  it('Task 18-1: sets default min stock to 5 pieces (5000 milli) if not specified', () => {
    const service = new MockStockService();
    const prod = service.saveProduct({
      name: 'جبنة فيتا دومتي 500 جم',
      stockQuantityMilli: 20000 // 20 pieces
    });

    assert.equal(prod.minStockQuantityMilli, 5000);
  });

  it('Task 18-1: accurately flags low stock when stock drops to or below threshold', () => {
    const service = new MockStockService();
    const prod = service.saveProduct({
      id: 'p1',
      name: 'حليب جهينة 1 لتر',
      stockQuantityMilli: 4000, // 4 pieces
      minStockQuantityMilli: 5000 // 5 pieces threshold
    });

    const status = service.getStockStatus(prod);
    assert.equal(status.status, 'low_stock');
    assert.match(status.label, /نقص/);
  });

  it('Task 18-1: accurately flags out of stock when stock is zero or below', () => {
    const service = new MockStockService();
    const prod = service.saveProduct({
      id: 'p2',
      name: 'سكر الأسرة 1 كجم',
      stockQuantityMilli: 0,
      minStockQuantityMilli: 10000
    });

    const status = service.getStockStatus(prod);
    assert.equal(status.status, 'out_of_stock');
    assert.equal(status.label, 'نافد');
  });

  it('Task 18-2: bulk updates minimum stock threshold across multiple products', () => {
    const service = new MockStockService();
    service.saveProduct({ id: 'p_101', name: 'أرز الضحى 1 كجم', minStockQuantityMilli: 5000 });
    service.saveProduct({ id: 'p_102', name: 'مكرونة الملكة 400 جم', minStockQuantityMilli: 5000 });
    service.saveProduct({ id: 'p_103', name: 'شاي ليبتون 100 فتلة', minStockQuantityMilli: 5000 });

    // Bulk update p_101 and p_102 to threshold 15 pieces (15000 milli)
    const updated = service.bulkUpdateMinStock(['p_101', 'p_102'], 15000);
    assert.equal(updated, 2);

    assert.equal(service.products.get('p_101').minStockQuantityMilli, 15000);
    assert.equal(service.products.get('p_102').minStockQuantityMilli, 15000);
    // p_103 remains untouched
    assert.equal(service.products.get('p_103').minStockQuantityMilli, 5000);
  });

  it('Task 18-1 & 18-2: rejects negative minimum stock threshold', () => {
    const service = new MockStockService();
    assert.throws(() => {
      service.saveProduct({
        name: 'منتج بحد سالب',
        minStockQuantityMilli: -1000
      });
    }, /الحد الأدنى للمخزون لا يمكن أن يكون سالباً/);

    assert.throws(() => {
      service.bulkUpdateMinStock(['p1'], -5000);
    }, /الحد الأدنى للمخزون لا يمكن أن يكون سالباً/);
  });
});
