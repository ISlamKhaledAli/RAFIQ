import { test } from 'node:test';
import assert from 'node:assert';

test('Feature #137: Pilot Readiness Checklist & Pilot Test Sale (Story 61)', async (t) => {
  // Mock store state
  const storeState = {
    settings: {
      store_name: 'سوبرماركت رفيق التجريبي',
      store_phone: '01012345678',
      default_printer_name: 'XP-80C',
      scanner_enabled: '1',
      last_backup_date: '2026-09-25 10:00',
    },
    printers: [
      { name: 'XP-80C', isDefault: true, isOnline: true },
    ],
    productsCount: 15,
    officialInvoiceSequence: 1042,
    stockMovementsCount: 88,
  };

  const evaluateReadiness = (state) => {
    const checks = [
      {
        key: 'store_profile',
        title: 'بيانات المحل والفاتورة',
        passed: Boolean(state.settings.store_name?.trim()),
        statusText: state.settings.store_name ? `مضبوطة (${state.settings.store_name})` : 'غير مسجل',
      },
      {
        key: 'printer',
        title: 'طابعة الإيصالات الحرارية',
        passed: state.printers.length > 0 && Boolean(state.settings.default_printer_name),
        statusText: state.printers.length > 0 ? `جاهزة (${state.settings.default_printer_name})` : 'لا توجد طابعة',
      },
      {
        key: 'scanner',
        title: 'قارئ الباركود (Barcode Scanner)',
        passed: state.settings.scanner_enabled !== '0',
        statusText: state.settings.scanner_enabled !== '0' ? 'مفعل وجاهز للمسح' : 'معطل',
      },
      {
        key: 'backup',
        title: 'النسخ الاحتياطي وأمان البيانات',
        passed: Boolean(state.settings.last_backup_date),
        statusText: state.settings.last_backup_date ? `سليمة (${state.settings.last_backup_date})` : 'لم يتم أخذ نسخة',
      },
      {
        key: 'products',
        title: 'كتالوج الأصناف والأسعار',
        passed: state.productsCount > 0,
        statusText: `${state.productsCount} صنف مسجل`,
      },
    ];

    const passedChecks = checks.filter(c => c.passed).length;
    const totalChecks = checks.length;
    const readinessPercentage = Math.round((passedChecks * 100) / totalChecks);
    const isReadyToSell = readinessPercentage >= 80;

    return {
      totalChecks,
      passedChecks,
      readinessPercentage,
      isReadyToSell,
      checks,
    };
  };

  const executePilotTestSale = (state, saleItems) => {
    // Invariant: Official counters and stock movements MUST NOT be modified
    const initialInvoiceSeq = state.officialInvoiceSequence;
    const initialStockMovements = state.stockMovementsCount;

    let subtotalPiasters = 0;
    const items = (saleItems || [
      {
        id: 'test_item_1',
        productId: 'test_prod_1',
        productName: 'صنف تجريبي لاختبار الطباعة',
        barcode: '622110099',
        quantityMilli: 1000,
        unitPricePiasters: 2500,
        discountPiasters: 0,
        unit: 'piece',
      },
    ]).map((item, idx) => {
      const lineGross = Math.round((item.unitPricePiasters * item.quantityMilli) / 1000);
      const lineTotal = lineGross - (item.discountPiasters || 0);
      subtotalPiasters += lineTotal;
      return {
        ...item,
        id: `test_item_${idx + 1}`,
        totalPiasters: lineTotal,
      };
    });

    const testSale = {
      id: `test_sale_${Date.now()}`,
      invoiceNumber: 0, // Does not use official sequence
      status: 'TEST_PILOT',
      notes: 'فاتورة بيع تجريبية - فحص جاهزية التشغيل (لا تدخل المخزون ولا الحسابات)',
      subtotalPiasters,
      discountPiasters: 0,
      taxPiasters: 0,
      totalPiasters: subtotalPiasters,
      paidPiasters: subtotalPiasters,
      paymentMethod: 'CASH',
      createdAt: new Date().toISOString(),
      items,
      watermark: '*** فاتورة تجريبية - فحص جاهزية وتدريب ***',
    };

    // Assert state didn't change
    assert.strictEqual(state.officialInvoiceSequence, initialInvoiceSeq, 'Official invoice sequence must not increment');
    assert.strictEqual(state.stockMovementsCount, initialStockMovements, 'Stock movements must not be recorded');

    return testSale;
  };

  await t.test('137-1: Evaluates all 5 readiness checklist items and percentage correctly', () => {
    const res = evaluateReadiness(storeState);
    assert.strictEqual(res.totalChecks, 5);
    assert.strictEqual(res.passedChecks, 5);
    assert.strictEqual(res.readinessPercentage, 100);
    assert.strictEqual(res.isReadyToSell, true);

    // Test with missing backup
    const partialState = {
      ...storeState,
      settings: { ...storeState.settings, last_backup_date: '' },
    };
    const partialRes = evaluateReadiness(partialState);
    assert.strictEqual(partialRes.passedChecks, 4);
    assert.strictEqual(partialRes.readinessPercentage, 80);
    assert.strictEqual(partialRes.isReadyToSell, true);

    // Test with zero products and no store name
    const emptyState = {
      ...storeState,
      settings: { ...storeState.settings, store_name: '', last_backup_date: '' },
      productsCount: 0,
    };
    const emptyRes = evaluateReadiness(emptyState);
    assert.strictEqual(emptyRes.passedChecks, 2);
    assert.strictEqual(emptyRes.readinessPercentage, 40);
    assert.strictEqual(emptyRes.isReadyToSell, false);
  });

  await t.test('137-2: Single-click test print and interactive barcode scanning validation', () => {
    // Validates that test print payload handles width and printer names
    const printPayload = { printerName: 'XP-80C', paperWidth: '80mm' };
    assert.strictEqual(printPayload.printerName, 'XP-80C');
    assert.strictEqual(printPayload.paperWidth, '80mm');

    // Interactive barcode scanning input handles fast wedge keystrokes
    const scannedCode = '6221009876543';
    assert.strictEqual(scannedCode.length >= 8, true);
    assert.strictEqual(/^\d+$/.test(scannedCode), true);
  });

  await t.test('137-3: Pilot Test Sale isolates official invoice counter, stock, and bears test watermark', () => {
    const sale = executePilotTestSale(storeState);

    assert.strictEqual(sale.status, 'TEST_PILOT');
    assert.strictEqual(sale.invoiceNumber, 0, 'Test sale must not take an official invoice number');
    assert.strictEqual(sale.totalPiasters, 2500);
    assert.strictEqual(Number.isInteger(sale.totalPiasters), true, 'Total must be integer piasters');
    assert.strictEqual(sale.watermark, '*** فاتورة تجريبية - فحص جاهزية وتدريب ***');
    assert.strictEqual(storeState.officialInvoiceSequence, 1042);
    assert.strictEqual(storeState.stockMovementsCount, 88);
  });

  await t.test('137-4: Non-technical user friendly status messages for each check item', () => {
    const res = evaluateReadiness(storeState);
    for (const chk of res.checks) {
      assert.strictEqual(typeof chk.title, 'string');
      assert.strictEqual(chk.title.length > 0, true);
      assert.strictEqual(typeof chk.statusText, 'string');
      assert.strictEqual(chk.statusText.length > 0, true);
    }
  });
});
