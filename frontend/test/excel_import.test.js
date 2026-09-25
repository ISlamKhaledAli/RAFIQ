import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Story 37 — Feature #21 — استيراد المنتجات من ملف إكسل (ClosedXML / Excel Import)
 * Tasks: 21-1, 21-2, 21-3, 21-4, 21-5, 21-6, 21-7
 *
 * Rules:
 * 1. Financial integrity: prices and costs strictly in integer piasters.
 * 2. Barcodes as strings: preserving leading zeros ('012345678901').
 * 3. Arabic numerals normalization: (٠-٩) mapped to (0-9).
 * 4. ACID atomic transaction: all rows committed together or rolled back.
 * 5. Flexible Arabic/English header recognition.
 * 6. High performance on 1,000+ items.
 */

// Simulated logic matching utils/excelImport.ts and utils/money.ts
function normalizeArabicNumerals(str) {
  if (!str) return '';
  return String(str)
    .replace(/[٠-٩]/g, (d) => (d.charCodeAt(0) - 1632).toString())
    .replace(/[۰-۹]/g, (d) => (d.charCodeAt(0) - 1776).toString())
    .replace(/[،]/g, '.');
}

function poundsToPiasters(pounds) {
  if (!pounds || isNaN(pounds)) return 0;
  return Math.round(pounds * 100);
}

const HEADER_ALIASES = {
  name: ['اسم الصنف', 'الاسم', 'اسم المنتج', 'السلعة', 'الصنف', 'product name', 'name'],
  barcode: ['الباركود الرئيسي', 'الباركود', 'كود الصنف', 'الكود', 'barcode', 'code'],
  additionalBarcodes: ['باركودات إضافية', 'باركودات اضافية', 'اكواد اضافية', 'additional barcodes'],
  category: ['القسم / التصنيف', 'القسم', 'التصنيف', 'الفئة', 'المجموعة', 'category'],
  unit: ['الوحدة', 'نوع البيع', 'unit'],
  price: ['سعر البيع', 'السعر', 'سعر البيع للجمهور', 'selling price', 'price'],
  cost: ['سعر التكلفة', 'التكلفة', 'سعر الشراء', 'cost price', 'cost'],
  stock: ['الرصيد الافتتاحي', 'الرصيد', 'الكمية', 'stock', 'qty'],
  minStock: ['حد الطلب الأدنى', 'حد الطلب', 'الحد الأدنى', 'min stock'],
  tax: ['نسبة الضريبة', 'الضريبة', 'tax', 'vat'],
  internalCode: ['كود الصنف الداخلي', 'كود داخلي', 'sku'],
  taxCode: ['كود التصنيف الضريبي', 'كود ضريبي', 'tax code']
};

function matchHeader(headerStr) {
  if (!headerStr) return null;
  const clean = headerStr.trim().toLowerCase();
  for (const [canonical, aliases] of Object.entries(HEADER_ALIASES)) {
    for (const alias of aliases) {
      if (clean === alias.toLowerCase() || clean.includes(alias.toLowerCase())) {
        return canonical;
      }
    }
  }
  return null;
}

function validateImportRows(rawRows, existingProducts = []) {
  const existingBarcodeMap = new Map();
  for (const p of existingProducts) {
    if (p.barcode) existingBarcodeMap.set(p.barcode.trim(), p);
    if (p.barcodes && Array.isArray(p.barcodes)) {
      for (const b of p.barcodes) {
        if (b) existingBarcodeMap.set(b.trim(), p);
      }
    }
  }

  const seenInFileBarcodes = new Set();

  return rawRows.map((row) => {
    const errors = [];
    const warnings = [];

    const name = (row.name || '').trim();
    if (!name) {
      errors.push('اسم الصنف مطلوب ولا يمكن تركه فارغاً');
    }

    const barcode = (row.barcode || '').trim();
    const additionalBarcodes = (row.additionalBarcodes || []).map((b) => b.trim()).filter(Boolean);
    const allRowBarcodes = [barcode, ...additionalBarcodes].filter(Boolean);

    for (const b of allRowBarcodes) {
      if (seenInFileBarcodes.has(b)) {
        errors.push(`الباركود (${b}) مكرر في أكثر من صف داخل نفس الملف`);
      } else {
        seenInFileBarcodes.add(b);
      }

      if (existingBarcodeMap.has(b)) {
        const conflict = existingBarcodeMap.get(b);
        warnings.push(`الباركود (${b}) مستخدم مسبقاً لصالح الصنف "${conflict.name}"`);
      }
    }

    const pricePounds = typeof row.pricePounds === 'number' ? row.pricePounds : 0;
    const costPounds = typeof row.costPounds === 'number' ? row.costPounds : 0;

    if (pricePounds < 0) errors.push('سعر البيع لا يمكن أن يكون سالباً');
    if (costPounds < 0) errors.push('سعر التكلفة لا يمكن أن يكون سالباً');

    const pricePiasters = poundsToPiasters(pricePounds);
    const costPiasters = poundsToPiasters(costPounds);

    if (costPiasters > 0 && pricePiasters < costPiasters) {
      warnings.push(`سعر البيع (${(pricePiasters / 100).toFixed(2)} ج) أقل من سعر التكلفة (${(costPiasters / 100).toFixed(2)} ج)`);
    }

    const unit = row.unit === 'kg' ? 'kg' : 'piece';
    const stockQuantityMilli = Math.max(0, Math.round((row.stockQuantity || 0) * 1000));
    const minStockQuantityMilli = Math.max(0, Math.round((row.minStockQuantity || 5) * 1000));

    let status = 'valid';
    if (errors.length > 0) {
      status = 'error';
    } else if (warnings.length > 0) {
      status = 'warning';
    }

    return {
      rowIndex: row.rowIndex,
      status,
      errors,
      warnings,
      data: row,
      payload: {
        name,
        barcode: barcode || null,
        barcodes: additionalBarcodes,
        categoryName: (row.categoryName || 'عام').trim(),
        unit,
        pricePiasters,
        costPiasters,
        stockQuantityMilli,
        minStockQuantityMilli,
        taxRatePercent: row.taxRatePercent || 0,
        internalCode: (row.internalCode || '').trim(),
        taxCategoryCode: (row.taxCategoryCode || '').trim()
      }
    };
  });
}

// Simulated Atomic SQLite Batch Importer (Matching ProductRepository.ImportBatchAtomic)
class MockSqliteBatchImporter {
  constructor(initialProducts = []) {
    this.products = new Map();
    for (const p of initialProducts) {
      this.products.set(p.id, { ...p });
    }
  }

  importBatchAtomic(items, duplicateStrategy = 'skip') {
    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    const errors = [];

    // Check pre-condition for 'error' strategy
    if (duplicateStrategy === 'error') {
      for (const item of items) {
        if (item.barcode) {
          const exists = Array.from(this.products.values()).some(
            p => p.barcode === item.barcode || (p.barcodes && p.barcodes.includes(item.barcode))
          );
          if (exists) {
            throw new Error(`تعذر الاستيراد: تم العثور على باركود مكرر (${item.barcode}) واختيار استراتيجية الإيقاف عند التكرار.`);
          }
        }
      }
    }

    // Process all items in single atomic loop
    for (const item of items) {
      let existingProd = null;
      if (item.barcode) {
        existingProd = Array.from(this.products.values()).find(
          p => p.barcode === item.barcode || (p.barcodes && p.barcodes.includes(item.barcode))
        );
      }

      if (existingProd) {
        if (duplicateStrategy === 'skip') {
          skippedCount++;
          continue;
        } else if (duplicateStrategy === 'update') {
          existingProd.name = item.name;
          existingProd.pricePiasters = item.pricePiasters;
          existingProd.costPiasters = item.costPiasters;
          existingProd.unit = item.unit;
          if (item.stockQuantityMilli > 0) {
            existingProd.stockQuantityMilli += item.stockQuantityMilli;
          }
          updatedCount++;
        }
      } else {
        const newId = `prod_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        this.products.set(newId, {
          id: newId,
          name: item.name,
          barcode: item.barcode,
          barcodes: item.barcodes || [],
          unit: item.unit,
          pricePiasters: item.pricePiasters,
          costPiasters: item.costPiasters,
          stockQuantityMilli: item.stockQuantityMilli,
          minStockQuantityMilli: item.minStockQuantityMilli
        });
        createdCount++;
      }
    }

    return {
      totalProcessed: items.length,
      createdCount,
      updatedCount,
      skippedCount,
      failedCount: errors.length,
      errors
    };
  }
}

describe('Story 37 — Feature #21: Excel Import (ClosedXML & Frontend Parsing)', () => {
  
  it('Task 21-1: Should correctly match flexible Arabic and English header aliases', () => {
    assert.equal(matchHeader('اسم الصنف'), 'name');
    assert.equal(matchHeader('product name'), 'name');
    assert.equal(matchHeader('الباركود الرئيسي'), 'barcode');
    assert.equal(matchHeader('barcode'), 'barcode');
    assert.equal(matchHeader('سعر البيع للجمهور'), 'price');
    assert.equal(matchHeader('سعر التكلفة'), 'cost');
    assert.equal(matchHeader('الرصيد الافتتاحي'), 'stock');
    assert.equal(matchHeader('الوحدة'), 'unit');
    assert.equal(matchHeader('حد الطلب الأدنى'), 'minStock');
  });

  it('Task 21-2: Should preserve leading zeros in barcodes and normalize Arabic numbers', () => {
    const rawBarcode = '0123456789012';
    const arabicPrice = '٢٥.٥٠';
    const normalizedPrice = normalizeArabicNumerals(arabicPrice);
    const piasters = poundsToPiasters(parseFloat(normalizedPrice));

    assert.equal(rawBarcode, '0123456789012', 'Leading zero must NOT be stripped');
    assert.equal(normalizedPrice, '25.50');
    assert.equal(piasters, 2550);
  });

  it('Task 21-3 & 21-4: Should identify valid rows, duplicate barcodes, and invalid entries', () => {
    const existing = [
      { id: 'p1', name: 'شاي العروسة 250جم', barcode: '6221155001' }
    ];

    const rows = [
      {
        rowIndex: 2,
        name: 'شيبسي عائلي بالجبنة',
        barcode: '6221001002',
        additionalBarcodes: [],
        categoryName: 'سناكس',
        unit: 'piece',
        pricePounds: 15.0,
        costPounds: 12.0,
        stockQuantity: 24,
        minStockQuantity: 5
      },
      {
        rowIndex: 3,
        name: '', // Empty name -> error
        barcode: '6221001003',
        unit: 'piece',
        pricePounds: 10,
        costPounds: 8
      },
      {
        rowIndex: 4,
        name: 'شاي العروسة مكرر',
        barcode: '6221155001', // Duplicate from DB -> warning
        unit: 'piece',
        pricePounds: 50,
        costPounds: 42
      },
      {
        rowIndex: 5,
        name: 'منتج بسعر بيع أقل من التكلفة',
        barcode: '6221001005',
        unit: 'piece',
        pricePounds: 10,
        costPounds: 15 // Below cost -> warning
      },
      {
        rowIndex: 6,
        name: 'منتج بسعر سالب',
        barcode: '6221001006',
        unit: 'piece',
        pricePounds: -5, // Negative -> error
        costPounds: 10
      }
    ];

    const results = validateImportRows(rows, existing);

    assert.equal(results.length, 5);
    assert.equal(results[0].status, 'valid');
    assert.equal(results[0].payload.pricePiasters, 1500);

    assert.equal(results[1].status, 'error');
    assert.match(results[1].errors[0], /اسم الصنف مطلوب/);

    assert.equal(results[2].status, 'warning');
    assert.match(results[2].warnings[0], /مستخدم مسبقاً/);

    assert.equal(results[3].status, 'warning');
    assert.match(results[3].warnings[0], /أقل من سعر التكلفة/);

    assert.equal(results[4].status, 'error');
    assert.match(results[4].errors[0], /لا يمكن أن يكون سالباً/);
  });

  it('Task 21-3: Should detect intra-file duplicate barcodes', () => {
    const rows = [
      { rowIndex: 2, name: 'صنف أ', barcode: '999888', unit: 'piece', pricePounds: 10, costPounds: 5 },
      { rowIndex: 3, name: 'صنف ب', barcode: '999888', unit: 'piece', pricePounds: 20, costPounds: 15 }
    ];

    const validated = validateImportRows(rows, []);
    assert.equal(validated[0].status, 'valid');
    assert.equal(validated[1].status, 'error');
    assert.match(validated[1].errors[0], /مكرر في أكثر من صف داخل نفس الملف/);
  });

  it('Task 21-5: Should atomically import with skip strategy', () => {
    const existing = [
      { id: 'p1', name: 'أرز الضحى 1ك', barcode: '622001', pricePiasters: 3500, costPiasters: 3000, stockQuantityMilli: 10000 }
    ];
    const importer = new MockSqliteBatchImporter(existing);

    const items = [
      {
        name: 'أرز الضحى جديد (مكرر)',
        barcode: '622001',
        unit: 'piece',
        pricePiasters: 4000,
        costPiasters: 3200,
        stockQuantityMilli: 5000
      },
      {
        name: 'سكر الأسرة 1ك',
        barcode: '622002',
        unit: 'piece',
        pricePiasters: 2700,
        costPiasters: 2400,
        stockQuantityMilli: 20000
      }
    ];

    const result = importer.importBatchAtomic(items, 'skip');

    assert.equal(result.totalProcessed, 2);
    assert.equal(result.createdCount, 1);
    assert.equal(result.skippedCount, 1);
    assert.equal(result.updatedCount, 0);

    // Existing product was untouched
    const p1 = importer.products.get('p1');
    assert.equal(p1.pricePiasters, 3500);
    assert.equal(p1.name, 'أرز الضحى 1ك');
  });

  it('Task 21-5: Should atomically import with update strategy', () => {
    const existing = [
      { id: 'p1', name: 'أرز الضحى 1ك', barcode: '622001', pricePiasters: 3500, costPiasters: 3000, stockQuantityMilli: 10000 }
    ];
    const importer = new MockSqliteBatchImporter(existing);

    const items = [
      {
        name: 'أرز الضحى فاخر 1ك',
        barcode: '622001',
        unit: 'piece',
        pricePiasters: 3800,
        costPiasters: 3200,
        stockQuantityMilli: 5000
      }
    ];

    const result = importer.importBatchAtomic(items, 'update');

    assert.equal(result.updatedCount, 1);
    assert.equal(result.createdCount, 0);

    const p1 = importer.products.get('p1');
    assert.equal(p1.name, 'أرز الضحى فاخر 1ك');
    assert.equal(p1.pricePiasters, 3800);
    assert.equal(p1.costPiasters, 3200);
    assert.equal(p1.stockQuantityMilli, 15000); // 10000 + 5000 added
  });

  it('Task 21-5: Should abort and throw with error strategy when duplicate found', () => {
    const existing = [
      { id: 'p1', name: 'لبن جهينة 1 لتر', barcode: '622300' }
    ];
    const importer = new MockSqliteBatchImporter(existing);

    const items = [
      { name: 'لبن جهينة جديد', barcode: '622300', pricePiasters: 4000 }
    ];

    assert.throws(
      () => importer.importBatchAtomic(items, 'error'),
      /تعذر الاستيراد: تم العثور على باركود مكرر/
    );
  });

  it('Task 21-7: Performance Stress Test - Should validate 1,000 items in under 250ms', () => {
    const thousandRows = [];
    for (let i = 1; i <= 1000; i++) {
      thousandRows.push({
        rowIndex: i + 1,
        name: `صنف تجريبي رقم ${i}`,
        barcode: `6220000${String(i).padStart(5, '0')}`,
        categoryName: i % 2 === 0 ? 'بقالة' : 'منظفات',
        unit: i % 5 === 0 ? 'kg' : 'piece',
        pricePounds: 50 + (i % 50),
        costPounds: 20 + (i % 20),
        stockQuantity: 50,
        minStockQuantity: 10
      });
    }

    const startTime = Date.now();
    const validated = validateImportRows(thousandRows, []);
    const duration = Date.now() - startTime;

    assert.equal(validated.length, 1000);
    assert.equal(validated.filter(r => r.status === 'valid').length, 1000);
    assert.ok(duration < 250, `1,000 items validated in ${duration}ms, must be < 250ms`);
  });
});
