import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { parseExcelOrCsvFile, validateImportRows } from '../src/utils/excelImport.ts';
import { computePurchaseLine, purchaseLinesTotal, packageLineGross } from '../src/views/purchases/purchaseLineMath.ts';
import { calculateLineTotal } from '../src/utils/money.ts';

// A workbook exactly as a shop owner exports it, wrapped the way the import modal hands it over (File.arrayBuffer)
const sheetFile = (rows) => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Sheet1');
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return { arrayBuffer: async () => buf };
};

const importPayloads = async (rows) => {
  const parsed = await parseExcelOrCsvFile(sheetFile(rows));
  return validateImportRows(parsed, [], []).map((r) => r.payload);
};

describe('Step 3A H2: Excel update import never invents stock or overwrites absent columns', () => {
  it('a price-only sheet sends stock/cost/unit/category as null (not provided)', async () => {
    const [payload] = await importPayloads([
      ['اسم الصنف', 'الباركود', 'سعر البيع'],
      ['شاي العروسة 250 جم', '6223000123456', '37.50'],
    ]);
    assert.equal(payload.pricePiasters, 3750);
    assert.equal(payload.stockQuantityMilli, null, 'missing stock column must not become 0');
    assert.equal(payload.costPiasters, null);
    assert.equal(payload.unit, null);
    assert.equal(payload.categoryName, null);
    assert.equal(payload.minStockQuantityMilli, null);
    assert.equal(payload.taxRatePercent, null);
    assert.equal(payload.internalCode, null);
  });

  it('an empty stock cell is "not provided" while an explicit 0 is a real count', async () => {
    const payloads = await importPayloads([
      ['اسم الصنف', 'الباركود', 'سعر البيع', 'الرصيد', 'الوحدة'],
      ['صنف بلا رصيد مكتوب', '6223000000011', '10', '', 'قطعة'],
      ['صنف رصيده صفر', '6223000000012', '10', '0', 'كجم'],
    ]);
    assert.equal(payloads[0].stockQuantityMilli, null);
    assert.equal(payloads[0].unit, 'piece');
    assert.equal(payloads[1].stockQuantityMilli, 0);
    assert.equal(payloads[1].unit, 'kg');
  });

  it('a unit (carton) barcode of an existing product is reported as already registered', async () => {
    const parsed = await parseExcelOrCsvFile(sheetFile([
      ['اسم الصنف', 'الباركود', 'سعر البيع'],
      ['صنف جديد', '6220000000999', '5'],
    ]));
    const existing = [{
      id: 'p1', name: 'مياه معدنية', barcode: '6220000000001', barcodes: [],
      units: [{ id: 'u1', productId: 'p1', unitName: 'كرتونة', conversionFactor: 12, isBaseUnit: false, barcode: '6220000000999' }],
    }];
    const [row] = validateImportRows(parsed, existing, []);
    assert.ok(row.warnings.some((w) => w.includes('مياه معدنية')));
  });

  it('R1: the preview explains that a carton-barcode row only updates the carton price', async () => {
    const parsed = await parseExcelOrCsvFile(sheetFile([
      ['اسم الصنف', 'الباركود', 'سعر البيع', 'الرصيد'],
      ['بيبسي كرتونة 24', '6221030000024', '240', '3'],
    ]));
    const existing = [{
      id: 'p-cans', name: 'بيبسي كانز 330 مل', barcode: '6221030000001', barcodes: [],
      units: [
        { id: 'u-base', productId: 'p-cans', unitName: 'علبة', conversionFactor: 1, isBaseUnit: true, barcode: '6221030000001' },
        { id: 'u-carton', productId: 'p-cans', unitName: 'كرتونة', conversionFactor: 24, isBaseUnit: false, barcode: '6221030000024' },
      ],
    }];
    const [row] = validateImportRows(parsed, existing, []);
    const reason = row.warnings.find((w) => w.includes('كرتونة'));
    assert.ok(reason, 'specific carton warning');
    assert.ok(reason.includes('×24') && reason.includes('بيبسي كانز 330 مل'));
    assert.ok(reason.includes('سعر هذه الوحدة فقط'));
  });
});

const pharmaLine = (overrides) => ({
  productId: 'p-amox',
  productName: 'أموكسيسيلين 500',
  barcode: '6221000000500',
  currentStockMilli: 0,
  currentCostPiasters: 0,
  currentPricePiasters: 300,
  quantityUnits: 200,
  unitCostPiasters: 238,
  newSellingPricePiasters: 300,
  unit: 'قرص',
  packageUnitName: 'علبة',
  purchaseUnitMode: 'package',
  productUnits: [
    { id: 'u-base', productId: 'p-amox', unitName: 'قرص', conversionFactor: 1, isBaseUnit: true, isDivisible: false, sortOrder: 0, sellPricePiasters: 300, costPricePiasters: 0 },
    { id: 'u-box', productId: 'p-amox', unitName: 'علبة', conversionFactor: 20, isBaseUnit: false, isDivisible: false, sortOrder: 1, sellPricePiasters: 6000, costPricePiasters: 0 },
  ],
  cartonsInput: '10',
  packageQuantityInput: '10',
  packSizeInput: '20',
  packSize: 20,
  looseInput: '0',
  packageCostPiasters: 4750,
  ...overrides,
});

describe('Step 3A H3/M1/M2: purchase line amounts match the server', () => {
  it('10 boxes of 20 at 47.50 cost exactly 475.00 (not 20 x 2.38 = 476.00)', () => {
    const line = computePurchaseLine(pharmaLine({}));
    assert.equal(line.quantityMilli, 200000);
    assert.equal(line.conversionFactor, 20);
    assert.equal(line.packageCostPiasters, 4750);
    assert.equal(line.lineGrossPiasters, 47500);
    assert.equal(purchaseLinesTotal([pharmaLine({})]), 47500);
  });

  it('a 1-box distributor bonus adds 20 tablets (220 total), not 1', () => {
    const line = computePurchaseLine(pharmaLine({ bonusQuantityUnits: 1, bonusQuantityInput: '1' }));
    assert.equal(line.bonusQuantityMilli, 20000);
    assert.equal(line.quantityMilli + line.bonusQuantityMilli, 220000);
  });

  it('weighed goods use the same half-up line rounding as the server (0.086 kg x 12.50 = 1.08)', () => {
    const cheese = pharmaLine({
      productUnits: [], packSize: undefined, packSizeInput: '', purchaseUnitMode: 'base',
      quantityUnits: 0.086, unitCostPiasters: 1250, packageCostPiasters: undefined,
    });
    const line = computePurchaseLine(cheese);
    assert.equal(Math.round(0.086 * 1250), 107, 'the old float formula under-counted');
    assert.equal(line.lineGrossPiasters, 108);
    assert.equal(line.lineGrossPiasters, calculateLineTotal(1250, 86));
  });

  it('base-unit buying of a packaged product keeps unit x quantity exactly', () => {
    const line = computePurchaseLine(pharmaLine({ purchaseUnitMode: 'base', quantityUnits: 37, unitCostPiasters: 238 }));
    assert.equal(line.lineGrossPiasters, 238 * 37);
    assert.equal(packageLineGross(238 * 20, 37000, 20), 238 * 37);
  });
});
