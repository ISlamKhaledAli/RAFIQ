import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Multi-Barcode Product Catalog simulation (matching C# ProductRepository & ProductService)
class MockBarcodeCatalog {
  constructor() {
    this.products = new Map();
    // Maps each unique barcode string -> productId
    this.barcodeIndex = new Map();
  }

  saveProduct(product) {
    if (!product || !product.name) throw new Error('Product name required');
    const prodId = product.id || `prod_${Math.random()}`;

    // Collect all candidate barcodes
    const allCodes = new Set();
    if (product.barcode) allCodes.add(String(product.barcode).trim());
    if (Array.isArray(product.barcodes)) {
      for (const b of product.barcodes) {
        if (b) allCodes.add(String(b).trim());
      }
    }

    // Check duplicate barcodes across other products (Task 15-2 & 15-4)
    for (const code of allCodes) {
      if (this.barcodeIndex.has(code)) {
        const ownerId = this.barcodeIndex.get(code);
        if (ownerId !== prodId) {
          const ownerProduct = this.products.get(ownerId);
          throw new Error(`الباركود '${code}' مسجل بالفعل لمنتج آخر: ${ownerProduct.name}`);
        }
      }
    }

    // Clean old barcode associations for this product
    for (const [code, ownerId] of this.barcodeIndex.entries()) {
      if (ownerId === prodId) {
        this.barcodeIndex.delete(code);
      }
    }

    // Register all barcodes
    for (const code of allCodes) {
      this.barcodeIndex.set(code, prodId);
    }

    const saved = {
      ...product,
      id: prodId,
      barcode: product.barcode || (allCodes.size > 0 ? Array.from(allCodes)[0] : null),
      barcodes: Array.from(allCodes)
    };
    this.products.set(prodId, saved);
    return saved;
  }

  findByBarcode(scannedBarcode) {
    if (!scannedBarcode) return null;
    const cleanCode = String(scannedBarcode).trim();
    const prodId = this.barcodeIndex.get(cleanCode);
    if (!prodId) return null;
    return this.products.get(prodId) || null;
  }
}

describe('Rafiq POS Multi-Barcode for Single Product Test Suite (Feature #15 / Tasks 15-1 to 15-4)', () => {
  it('allows scanning any of the registered barcodes to find the exact same product (Task 15-1 & 15-2)', () => {
    const catalog = new MockBarcodeCatalog();

    // Product with 1 primary barcode and 2 additional alternative barcodes (different suppliers or packaging)
    const product = catalog.saveProduct({
      id: 'prod_milk_1',
      name: 'لبن جهينة كامل الدسم 1 لتر',
      barcode: '6221001005001',
      barcodes: ['6221001005001', '6221001005002', '6221001005003'],
      pricePiasters: 4200
    });

    // Scan primary barcode
    const res1 = catalog.findByBarcode('6221001005001');
    assert.ok(res1);
    assert.equal(res1.id, product.id);

    // Scan secondary barcode
    const res2 = catalog.findByBarcode('6221001005002');
    assert.ok(res2);
    assert.equal(res2.id, product.id);

    // Scan third barcode
    const res3 = catalog.findByBarcode('6221001005003');
    assert.ok(res3);
    assert.equal(res3.id, product.id);
  });

  it('strictly preserves and distinguishes barcodes with leading zeros as text (Task 15-4)', () => {
    const catalog = new MockBarcodeCatalog();

    // Barcodes starting with one or two zeros
    const p1 = catalog.saveProduct({
      id: 'prod_imported_perfume',
      name: 'عطر مستورد باركود دولي',
      barcode: '007123456789',
      barcodes: ['007123456789'],
      pricePiasters: 15000
    });

    const p2 = catalog.saveProduct({
      id: 'prod_local_item',
      name: 'صنف محلي بدون أصفار بادئة',
      barcode: '7123456789',
      barcodes: ['7123456789'],
      pricePiasters: 12000
    });

    // Lookup with leading zeros
    const foundWithZeros = catalog.findByBarcode('007123456789');
    assert.ok(foundWithZeros);
    assert.equal(foundWithZeros.id, p1.id);
    assert.equal(foundWithZeros.barcode, '007123456789');

    // Lookup without leading zeros must find p2, never p1
    const foundWithoutZeros = catalog.findByBarcode('7123456789');
    assert.ok(foundWithoutZeros);
    assert.equal(foundWithoutZeros.id, p2.id);
    assert.equal(foundWithoutZeros.barcode, '7123456789');
  });

  it('rejects duplicate barcode assignment between two different products and names the owner (Task 15-2 & 15-4)', () => {
    const catalog = new MockBarcodeCatalog();

    catalog.saveProduct({
      id: 'prod_1',
      name: 'كولا كانز 330مل',
      barcode: '5449000000996',
      pricePiasters: 1200
    });

    assert.throws(
      () => {
        catalog.saveProduct({
          id: 'prod_2',
          name: 'بيبسي كانز 330مل',
          barcode: '5449000000996', // Conflict with prod_1
          pricePiasters: 1200
        });
      },
      (err) => {
        return (
          err instanceof Error &&
          err.message.includes('مسجل بالفعل لمنتج آخر: كولا كانز 330مل')
        );
      }
    );
  });

  it('allows a product to update its own barcodes without conflict with itself', () => {
    const catalog = new MockBarcodeCatalog();

    const p = catalog.saveProduct({
      id: 'prod_biscuit',
      name: 'بسكويت أوريو 6 قطع',
      barcode: '7622210800001',
      barcodes: ['7622210800001', '7622210800002'],
      pricePiasters: 1000
    });

    // Update the same product with an extra barcode
    assert.doesNotThrow(() => {
      catalog.saveProduct({
        ...p,
        barcodes: ['7622210800001', '7622210800002', '7622210800003']
      });
    });

    const res = catalog.findByBarcode('7622210800003');
    assert.ok(res);
    assert.equal(res.id, 'prod_biscuit');
  });
});
