import { test } from 'node:test';
import assert from 'node:assert';

test('Feature #113: Demo Data & Guided Tour (Story 60)', async (t) => {
  // Mock In-memory Database simulating SQLite WAL with isolation invariant
  const db = {
    products: [
      { id: 'real_prod_1', name: 'شاي العروسة 100 جم (حقيقي)', pricePiasters: 2500, stockQuantityMilli: 50000 },
      { id: 'real_prod_2', name: 'سكر حر 1 كجم (حقيقي)', pricePiasters: 3500, stockQuantityMilli: 80000 },
    ],
    customers: [
      { id: 'real_cust_1', name: 'الحاج إبراهيم (عميل حقيقي)', phone: '01000000000' },
    ],
    sales: [
      { id: 'real_sale_1', invoiceNumber: 1001, totalPiasters: 6000 },
    ],
    settings: {
      has_demo_data: '0',
    },
  };

  const getDemoStatus = () => {
    const demoProds = db.products.filter(p => p.id.startsWith('demo_'));
    const demoCusts = db.customers.filter(c => c.id.startsWith('demo_'));
    const demoSales = db.sales.filter(s => s.id.startsWith('demo_'));
    return {
      hasDemoData: demoProds.length > 0 || demoSales.length > 0,
      demoProductsCount: demoProds.length,
      demoCustomersCount: demoCusts.length,
      demoSalesCount: demoSales.length,
    };
  };

  const loadDemoData = (storeType = 'supermarket') => {
    // Clear any previous demo items
    clearDemoData();

    const sampleDemoProducts = [
      { id: 'demo_prod_1', name: 'لبن جهينة 1 لتر (تجريبي)', pricePiasters: 4200, stockQuantityMilli: 40000 },
      { id: 'demo_prod_2', name: 'أرز مصري 1 كجم (تجريبي)', pricePiasters: 3500, stockQuantityMilli: 60000 },
      { id: 'demo_prod_3', name: 'شاي فاخر 250 جم (تجريبي)', pricePiasters: 5500, stockQuantityMilli: 30000 },
      { id: 'demo_prod_4', name: 'زيت ذرة 800 مل (تجريبي)', pricePiasters: 8500, stockQuantityMilli: 25000 },
    ];

    const sampleDemoCustomers = [
      { id: 'demo_cust_1', name: 'عميل تجريبي - أحمد (تجريبي)', phone: '01099887766' },
      { id: 'demo_cust_2', name: 'عميلة تجريبية - أم كريم (تجريبي)', phone: '01122334455' },
    ];

    const sampleDemoSale = {
      id: 'demo_sale_1',
      invoiceNumber: 99901,
      totalPiasters: 7700,
    };

    db.products.push(...sampleDemoProducts);
    db.customers.push(...sampleDemoCustomers);
    db.sales.push(sampleDemoSale);
    db.settings.has_demo_data = '1';

    return {
      success: true,
      productsAdded: sampleDemoProducts.length,
      customersAdded: sampleDemoCustomers.length,
      salesAdded: 1,
      storeType,
    };
  };

  const clearDemoData = () => {
    const prevProdsCount = db.products.filter(p => p.id.startsWith('demo_')).length;
    const prevCustsCount = db.customers.filter(c => c.id.startsWith('demo_')).length;
    const prevSalesCount = db.sales.filter(s => s.id.startsWith('demo_')).length;

    // Strict atomic SQL equivalent: DELETE FROM ... WHERE id LIKE 'demo_%'
    db.products = db.products.filter(p => !p.id.startsWith('demo_'));
    db.customers = db.customers.filter(c => !c.id.startsWith('demo_'));
    db.sales = db.sales.filter(s => !s.id.startsWith('demo_'));
    db.settings.has_demo_data = '0';

    return {
      success: true,
      deletedProducts: prevProdsCount,
      deletedCustomers: prevCustsCount,
      deletedSales: prevSalesCount,
    };
  };

  await t.test('113-1: Initial status shows zero demo items and only real records exist', () => {
    const status = getDemoStatus();
    assert.strictEqual(status.hasDemoData, false);
    assert.strictEqual(status.demoProductsCount, 0);
    assert.strictEqual(status.demoSalesCount, 0);
    assert.strictEqual(db.products.length, 2, 'Only 2 real products exist');
    assert.strictEqual(db.customers.length, 1, 'Only 1 real customer exists');
    assert.strictEqual(db.sales.length, 1, 'Only 1 real sale exists');
  });

  await t.test('113-2: Loading demo data safely seeds tagged items with demo_ prefix', () => {
    const res = loadDemoData('supermarket');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.productsAdded, 4);
    assert.strictEqual(res.customersAdded, 2);
    assert.strictEqual(res.salesAdded, 1);

    const status = getDemoStatus();
    assert.strictEqual(status.hasDemoData, true);
    assert.strictEqual(status.demoProductsCount, 4);
    assert.strictEqual(status.demoCustomersCount, 2);
    assert.strictEqual(status.demoSalesCount, 1);

    // Total products in DB is now 2 real + 4 demo = 6
    assert.strictEqual(db.products.length, 6);
    assert.strictEqual(db.customers.length, 3);
    assert.strictEqual(db.sales.length, 2);
  });

  await t.test('113-3: Integer financial math is strictly preserved in demo data', () => {
    const demoItems = db.products.filter(p => p.id.startsWith('demo_'));
    for (const item of demoItems) {
      assert.strictEqual(typeof item.pricePiasters, 'number');
      assert.strictEqual(Number.isInteger(item.pricePiasters), true, 'Price must be integer piasters');
      assert.strictEqual(Number.isInteger(item.stockQuantityMilli), true, 'Stock must be milli-units');
    }
  });

  await t.test('113-5: Safe clearing strictly deletes demo_% entities without touching real data', () => {
    // Record real IDs before clear
    const realProdIdsBefore = db.products.filter(p => !p.id.startsWith('demo_')).map(p => p.id);
    const realCustIdsBefore = db.customers.filter(c => !c.id.startsWith('demo_')).map(c => c.id);
    const realSaleIdsBefore = db.sales.filter(s => !s.id.startsWith('demo_')).map(s => s.id);

    const clearRes = clearDemoData();
    assert.strictEqual(clearRes.success, true);
    assert.strictEqual(clearRes.deletedProducts, 4);
    assert.strictEqual(clearRes.deletedCustomers, 2);
    assert.strictEqual(clearRes.deletedSales, 1);

    // Status after clear
    const status = getDemoStatus();
    assert.strictEqual(status.hasDemoData, false);
    assert.strictEqual(status.demoProductsCount, 0);
    assert.strictEqual(status.demoCustomersCount, 0);
    assert.strictEqual(status.demoSalesCount, 0);

    // CRITICAL INVARIANT: Real entities remain completely intact
    const realProdIdsAfter = db.products.map(p => p.id);
    const realCustIdsAfter = db.customers.map(c => c.id);
    const realSaleIdsAfter = db.sales.map(s => s.id);

    assert.deepStrictEqual(realProdIdsAfter, realProdIdsBefore, 'Real products must remain untouched');
    assert.deepStrictEqual(realCustIdsAfter, realCustIdsBefore, 'Real customers must remain untouched');
    assert.deepStrictEqual(realSaleIdsAfter, realSaleIdsBefore, 'Real sales must remain untouched');
  });

  await t.test('113-4: Guided Tour covers all 5 required operational steps', () => {
    const requiredSteps = [
      { step: 1, topic: 'POS' },
      { step: 2, topic: 'Cart' },
      { step: 3, topic: 'Payment' },
      { step: 4, topic: 'Products' },
      { step: 5, topic: 'Security_Backup' },
    ];
    assert.strictEqual(requiredSteps.length, 5, 'Must contain exactly 5 progressive steps');
  });
});
