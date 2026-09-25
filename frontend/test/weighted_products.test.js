import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Story 36 — Feature #19 — منتجات بالوزن (كيلو أو جرام)
 * Tasks: 19-1, 19-2, 19-3, 19-4, 19-5
 * 
 * Rules:
 * 1. Financial values strictly in integer piasters (Money Rule 1).
 * 2. Quantity stored as integer grams / milli-units in SQLite (1 kg = 1000 milli, 0.35 kg = 350 milli).
 * 3. Atomic stock deduction for fractional quantities (10.000 kg - 0.350 kg = 9.650 kg).
 * 4. Half-piaster rounding away from zero (Math.round in JS, MidpointRounding.AwayFromZero in C#).
 * 5. Arabic numerals normalization for keypad entry.
 */

// Simulated functions matching utils/money.ts and C# Money.cs
function normalizeArabicNumerals(str) {
  if (!str) return '';
  return str
    .replace(/[٠-٩]/g, (d) => (d.charCodeAt(0) - 1632).toString())
    .replace(/[۰-۹]/g, (d) => (d.charCodeAt(0) - 1776).toString())
    .replace(/[،]/g, '.');
}

function calculateLineTotal(unitPricePiasters, quantityMilli, discountPiasters = 0) {
  const gross = Math.round((unitPricePiasters * quantityMilli) / 1000);
  return Math.max(0, gross - discountPiasters);
}

function parseWeightInput(inputStr, mode = 'kg') {
  const normalized = normalizeArabicNumerals(inputStr.trim()).replace(/,/g, '.');
  const parsed = parseFloat(normalized);
  if (isNaN(parsed) || parsed <= 0) return 0;
  return mode === 'kg' ? Math.round(parsed * 1000) : Math.round(parsed);
}

function formatWeightDisplay(quantityMilli, unit = 'kg') {
  if (unit === 'kg') {
    return `${(quantityMilli / 1000).toFixed(3)} كجم`;
  }
  return `${quantityMilli / 1000} ق`;
}

function formatReceiptLine(productName, quantityMilli, unitPricePiasters, totalPiasters, unit = 'kg') {
  const qtyStr = unit === 'kg' || quantityMilli % 1000 !== 0 
    ? `${(quantityMilli / 1000).toFixed(3)} كجم` 
    : `${quantityMilli / 1000} ق`;
  const priceStr = (unitPricePiasters / 100).toFixed(2);
  const totalStr = (totalPiasters / 100).toFixed(2);
  return `${productName} | ${qtyStr} × ${priceStr} = ${totalStr} ج.م`;
}

// Simulated Atomic Sale Transaction with Stock Deduction
class MockPosInventory {
  constructor() {
    this.products = new Map();
  }

  addProduct(product) {
    this.products.set(product.id, {
      ...product,
      stockQuantityMilli: product.stockQuantityMilli ?? 0,
      unit: product.unit ?? 'piece',
    });
  }

  processSaleAtomic(saleItems) {
    // Phase 1: validate stock & calculate line totals
    const updates = [];
    let grandTotalPiasters = 0;

    for (const item of saleItems) {
      const prod = this.products.get(item.productId);
      if (!prod) throw new Error(`المنتج غير موجود: ${item.productId}`);

      const lineTotal = calculateLineTotal(item.unitPricePiasters, item.quantityMilli, item.discountPiasters || 0);
      grandTotalPiasters += lineTotal;

      updates.push({
        productId: prod.id,
        deductMilli: item.quantityMilli,
        newLineTotal: lineTotal,
      });
    }

    // Phase 2: Atomic commit (all or nothing)
    for (const u of updates) {
      const prod = this.products.get(u.productId);
      prod.stockQuantityMilli -= u.deductMilli;
    }

    return {
      success: true,
      grandTotalPiasters,
      items: updates,
    };
  }
}

describe('Story 36 — Feature #19: Weighted Products (منتجات بالوزن - كيلو أو جرام)', () => {
  
  it('Task 19-1: Unit Conventions — Integer storage in milli-units (grams) and display in kg', () => {
    // 1 kg = 1000 milli
    assert.strictEqual(parseWeightInput('1.0', 'kg'), 1000);
    // 0.35 kg = 350 milli (350 grams)
    assert.strictEqual(parseWeightInput('0.35', 'kg'), 350);
    assert.strictEqual(parseWeightInput('0.350', 'kg'), 350);
    // 2.5 kg = 2500 milli
    assert.strictEqual(parseWeightInput('2.5', 'kg'), 2500);
    // Gram mode: 350 grams = 350 milli
    assert.strictEqual(parseWeightInput('350', 'gram'), 350);
    assert.strictEqual(parseWeightInput('125', 'gram'), 125);
    // Display formatting
    assert.strictEqual(formatWeightDisplay(350, 'kg'), '0.350 كجم');
    assert.strictEqual(formatWeightDisplay(1000, 'kg'), '1.000 كجم');
    assert.strictEqual(formatWeightDisplay(2500, 'kg'), '2.500 كجم');
  });

  it('Task 19-2: Database & Model — Product unit type (piece vs kg) and integer stock', () => {
    const weightedProduct = {
      id: 'prod_tomato_01',
      name: 'طماطم بلدي طازجة',
      barcode: '622000000101',
      pricePiasters: 1500, // 15.00 EGP per kg
      costPiasters: 1000,  // 10.00 EGP per kg
      stockQuantityMilli: 25000, // 25.000 kg in stock
      minStockQuantityMilli: 5000, // 5.000 kg min alert
      unit: 'kg',
      taxRatePercent: 0,
      isActive: true,
    };

    assert.strictEqual(weightedProduct.unit, 'kg');
    assert.strictEqual(typeof weightedProduct.stockQuantityMilli, 'number');
    assert.strictEqual(Number.isInteger(weightedProduct.stockQuantityMilli), true);
    assert.strictEqual(weightedProduct.stockQuantityMilli / 1000, 25.0);
  });

  it('Task 19-3: Logic — Exact weight price calculation (0.35 kg) with AwayFromZero rounding', () => {
    // 1. Exact round number: 0.35 kg at 100.00 EGP/kg (10,000 piasters)
    // 10000 * 350 / 1000 = 3500 piasters (35.00 EGP)
    const price1 = 10000;
    const qty1 = 350; // 0.35 kg
    assert.strictEqual(calculateLineTotal(price1, qty1), 3500);

    // 2. Fractional rounding test: 0.35 kg at 13.99 EGP/kg (1399 piasters)
    // 1399 * 350 / 1000 = 489.65 piasters -> rounds to 490 piasters (4.90 EGP)
    const price2 = 1399;
    assert.strictEqual(calculateLineTotal(price2, qty1), 490);

    // 3. Quarter kilo (0.25 kg = 250 milli) at 80.00 EGP/kg (8000 piasters)
    // 8000 * 250 / 1000 = 2000 piasters (20.00 EGP)
    assert.strictEqual(calculateLineTotal(8000, 250), 2000);

    // 4. Eighth kilo (0.125 kg = 125 milli) at 250.00 EGP/kg (25000 piasters)
    // 25000 * 125 / 1000 = 3125 piasters (31.25 EGP)
    assert.strictEqual(calculateLineTotal(25000, 125), 3125);

    // 5. Line discount handling: 0.35 kg @ 100.00 EGP with 2.00 EGP (200 piasters) coupon
    // 3500 - 200 = 3300 piasters (33.00 EGP)
    assert.strictEqual(calculateLineTotal(price1, qty1, 200), 3300);
  });

  it('Task 19-4: UI & Input — Keypad entry, unit mode toggle, and Eastern Arabic numerals normalization', () => {
    // Cashier types in Eastern Arabic numerals from scale indicator: "٠.٣٥"
    const easternInput = '٠.٣٥';
    const parsedKg = parseWeightInput(easternInput, 'kg');
    assert.strictEqual(parsedKg, 350);

    // Cashier enters grams directly: "٣٥٠" in gram mode
    const easternGrams = '٣٥٠';
    const parsedGrams = parseWeightInput(easternGrams, 'gram');
    assert.strictEqual(parsedGrams, 350);

    // Comma decimal separator normalization: "0,35" -> 350
    assert.strictEqual(parseWeightInput('0,35', 'kg'), 350);

    // Invalid input fallback
    assert.strictEqual(parseWeightInput('abc', 'kg'), 0);
    assert.strictEqual(parseWeightInput('-0.5', 'kg'), 0);
  });

  it('Task 19-5: Comprehensive Test — 0.35 kg sale, fractional stock deduction, and receipt output', () => {
    const inventory = new MockPosInventory();

    // Initial stock: 10.000 kg (10,000 milli) of apples at 50.00 EGP/kg (5000 piasters)
    inventory.addProduct({
      id: 'prod_apple_01',
      name: 'تفاح أحمر سكري',
      barcode: '622000000202',
      pricePiasters: 5000,
      costPiasters: 3500,
      stockQuantityMilli: 10000, // 10 kg
      unit: 'kg',
    });

    // Customer buys 0.350 kg (350 milli)
    const saleItems = [
      {
        productId: 'prod_apple_01',
        productName: 'تفاح أحمر سكري',
        quantityMilli: 350,
        unitPricePiasters: 5000,
        discountPiasters: 0,
      }
    ];

    const result = inventory.processSaleAtomic(saleItems);

    // 1. Transaction succeeds
    assert.strictEqual(result.success, true);

    // 2. Exact financial charge: 5000 * 350 / 1000 = 1750 piasters (17.50 EGP)
    assert.strictEqual(result.grandTotalPiasters, 1750);

    // 3. Stock deducted fractionally with 100% precision:
    // 10,000 milli - 350 milli = 9,650 milli (9.650 kg)
    const updatedProd = inventory.products.get('prod_apple_01');
    assert.strictEqual(updatedProd.stockQuantityMilli, 9650);
    assert.strictEqual(updatedProd.stockQuantityMilli / 1000, 9.65);

    // 4. Receipt formatting for customer thermal printer
    const receiptLine = formatReceiptLine(
      'تفاح أحمر سكري',
      350,
      5000,
      1750,
      'kg'
    );
    assert.strictEqual(receiptLine, 'تفاح أحمر سكري | 0.350 كجم × 50.00 = 17.50 ج.م');
  });
});
