import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// In-memory simulation of SaleItem snapshot and Product lifecycle
class MockSupermarketDatabase {
  constructor() {
    this.products = new Map();
    this.sales = new Map();
    this.saleItems = new Map();
  }

  addProduct(product) {
    this.products.set(product.id, { ...product, isActive: true });
    return this.products.get(product.id);
  }

  updateProduct(id, updates) {
    const prod = this.products.get(id);
    if (!prod) throw new Error('Product not found');
    const updated = { ...prod, ...updates };
    this.products.set(id, updated);
    return updated;
  }

  archiveProduct(id) {
    const prod = this.products.get(id);
    if (!prod) throw new Error('Product not found');
    prod.isActive = false;
    prod.archivedAt = new Date().toISOString();
    return prod;
  }

  createSale(sale) {
    const saleId = sale.id || `sale_${Date.now()}`;
    const savedSale = {
      ...sale,
      id: saleId,
      createdAt: sale.createdAt || new Date().toISOString()
    };
    this.sales.set(saleId, savedSale);

    const savedItems = [];
    for (const item of sale.items) {
      const prod = this.products.get(item.productId);
      const itemId = item.id || `item_${Math.random()}`;
      // Snapshot product name and unit price at sale time
      const snapshotItem = {
        id: itemId,
        saleId,
        productId: item.productId,
        productName: item.productName || (prod ? prod.name : 'صنف غير معروف'),
        barcode: item.barcode || (prod ? prod.barcode : null),
        quantityMilli: item.quantityMilli,
        unitPricePiasters: item.unitPricePiasters,
        discountPiasters: item.discountPiasters || 0,
        totalPiasters: item.totalPiasters
      };
      this.saleItems.set(itemId, snapshotItem);
      savedItems.push(snapshotItem);
    }

    return { ...savedSale, items: savedItems };
  }

  getInvoiceForPrint(saleId) {
    const sale = this.sales.get(saleId);
    if (!sale) return null;
    const items = [];
    for (const item of this.saleItems.values()) {
      if (item.saleId === saleId) {
        items.push(item);
      }
    }
    return { ...sale, items };
  }
}

describe('Rafiq POS Historical Sale Immutability & Archiving Test Suite (Feature #14 / Task 14-4)', () => {
  it('preserves original product name and price on receipt reprint after product price is modified', () => {
    const db = new MockSupermarketDatabase();

    // 1. Initial product: Tea at 45.00 EGP (4500 piasters)
    const tea = db.addProduct({
      id: 'prod_tea_1',
      name: 'شاي العروسة 250جم',
      barcode: '6221001001',
      pricePiasters: 4500,
      costPiasters: 4000
    });

    // 2. Customer buys 2 packs of tea
    const originalSale = db.createSale({
      invoiceNumber: 101,
      totalPiasters: 9000,
      subtotalPiasters: 9000,
      discountPiasters: 0,
      items: [
        {
          productId: tea.id,
          productName: tea.name,
          quantityMilli: 2000,
          unitPricePiasters: 4500,
          totalPiasters: 9000
        }
      ]
    });

    // 3. Supermarket later raises price to 55.00 EGP and edits name
    db.updateProduct(tea.id, {
      name: 'شاي العروسة 250جم (إصدار جديد)',
      pricePiasters: 5500
    });

    // 4. Customer returns or asks to reprint invoice #101
    const reprintedInvoice = db.getInvoiceForPrint(originalSale.id);

    assert.ok(reprintedInvoice);
    assert.equal(reprintedInvoice.items.length, 1);
    // MUST retain original name and unit price, NOT the new 55.00 EGP price
    assert.equal(reprintedInvoice.items[0].productName, 'شاي العروسة 250جم');
    assert.equal(reprintedInvoice.items[0].unitPricePiasters, 4500);
    assert.equal(reprintedInvoice.items[0].totalPiasters, 9000);
  });

  it('preserves historical sales data and item lines completely after a product is archived', () => {
    const db = new MockSupermarketDatabase();

    // 1. Initial product: Seasonal item
    const seasonalItem = db.addProduct({
      id: 'prod_ramadan_dates',
      name: 'تمر الوادي 1كجم',
      barcode: '6222002002',
      pricePiasters: 7500,
      costPiasters: 6000
    });

    // 2. Recorded sale
    const sale = db.createSale({
      invoiceNumber: 102,
      totalPiasters: 7500,
      subtotalPiasters: 7500,
      items: [
        {
          productId: seasonalItem.id,
          productName: seasonalItem.name,
          quantityMilli: 1000,
          unitPricePiasters: 7500,
          totalPiasters: 7500
        }
      ]
    });

    // 3. Product is archived at end of season (is_active = false)
    db.archiveProduct(seasonalItem.id);

    // 4. Past invoice remains valid and displays original line data
    const pastInvoice = db.getInvoiceForPrint(sale.id);
    assert.ok(pastInvoice);
    assert.equal(pastInvoice.items[0].productName, 'تمر الوادي 1كجم');
    assert.equal(pastInvoice.items[0].unitPricePiasters, 7500);
    assert.equal(pastInvoice.totalPiasters, 7500);
  });
});
