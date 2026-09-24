import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Import compiled or pure financial arithmetic functions
function normalizeArabicNumerals(str) {
  if (!str) return '';
  return str
    .replace(/[٠-٩]/g, (d) => (d.charCodeAt(0) - 1632).toString())
    .replace(/[۰-۹]/g, (d) => (d.charCodeAt(0) - 1776).toString())
    .replace(/[،]/g, '.');
}

function poundsToPiasters(pounds) {
  const normalized = typeof pounds === 'string' ? normalizeArabicNumerals(pounds) : pounds;
  const num = typeof normalized === 'string' ? parseFloat(normalized.replace(/,/g, '')) : normalized;
  if (isNaN(num)) return 0;
  return Math.round(num * 100);
}

function piastersToPounds(piasters) {
  return piasters / 100;
}

function calculateLineTotal(unitPricePiasters, quantityMilli, discountPiasters = 0) {
  const gross = Math.round((unitPricePiasters * quantityMilli) / 1000);
  return Math.max(0, gross - discountPiasters);
}

function calculateTaxPiasters(totalPiasters, taxRatePercent, priceIncludesTax = true) {
  if (taxRatePercent <= 0 || totalPiasters <= 0) return 0;

  if (priceIncludesTax) {
    const net = Math.round((totalPiasters * 100) / (100 + taxRatePercent));
    return Math.max(0, totalPiasters - net);
  } else {
    return Math.round((totalPiasters * taxRatePercent) / 100);
  }
}

describe('Rafiq POS Financial Arithmetic Test Suite (Feature #128)', () => {
  describe('Rule 1: Integer Financial Arithmetic (No floats in calculations)', () => {
    it('accurately converts pounds to integer piasters without decimal drift', () => {
      assert.equal(poundsToPiasters(15.50), 1550);
      assert.equal(poundsToPiasters(0.05), 5);
      assert.equal(poundsToPiasters(0.01), 1);
      assert.equal(poundsToPiasters('142.75'), 14275);
    });

    it('accurately converts integer piasters back to display pounds', () => {
      assert.equal(piastersToPounds(1550), 15.50);
      assert.equal(piastersToPounds(5), 0.05);
      assert.equal(piastersToPounds(100), 1.00);
    });
  });

  describe('Weights and Fractional Milli-units (Feature #3 & #128)', () => {
    it('calculates weighted items by grams/milli-units accurately', () => {
      // Example: Roumy Cheese at 240.00 EGP/kg (24000 piasters per 1000g). Cashier sells 350 grams:
      // (24000 * 350) / 1000 = 8400 piasters (84.00 EGP)
      const lineTotal = calculateLineTotal(24000, 350, 0);
      assert.equal(lineTotal, 8400);
    });

    it('rounds half-piasters properly away from zero on odd weight fractions', () => {
      // Meat at 345.50 EGP/kg (34550 piasters/kg). Sold 625 grams:
      // 34550 * 625 / 1000 = 21593.75 -> 21594 piasters
      const lineTotal = calculateLineTotal(34550, 625, 0);
      assert.equal(lineTotal, 21594);
    });

    it('subtracts line discount accurately and clamps at zero', () => {
      const lineTotalWithDiscount = calculateLineTotal(10000, 1000, 1500); // 100 EGP - 15 EGP
      assert.equal(lineTotalWithDiscount, 8500);

      const clamped = calculateLineTotal(1000, 1000, 5000); // Excess discount
      assert.equal(clamped, 0);
    });
  });

  describe('Tax (VAT 14%) and ETA Readiness (Feature #6 & #128)', () => {
    it('calculates tax embedded in price (Egyptian retail standard: tax-inclusive)', () => {
      // Total receipt item is 114.00 EGP inclusive of 14% VAT
      // Net = (11400 * 100) / 114 = 10000 piasters
      // Tax = 11400 - 10000 = 1400 piasters (14.00 EGP)
      const tax = calculateTaxPiasters(11400, 14, true);
      assert.equal(tax, 1400);
    });

    it('calculates tax-exclusive price properly', () => {
      // Net item is 100.00 EGP + 14% VAT
      // Tax = 10000 * 14 / 100 = 1400 piasters
      const tax = calculateTaxPiasters(10000, 14, false);
      assert.equal(tax, 1400);
    });

    it('returns zero tax when tax rate is 0%', () => {
      const tax = calculateTaxPiasters(5000, 0, true);
      assert.equal(tax, 0);
    });
  });

  describe('Eastern Arabic Numerals & Comma Normalization (Feature #130 & #128)', () => {
    it('converts Eastern Arabic numerals ٠١٢٣٤٥٦٧٨٩ to 0123456789', () => {
      assert.equal(normalizeArabicNumerals('٠١٢٣٤٥٦٧٨٩'), '0123456789');
    });

    it('converts Persian numerals ۰۱۲۳۴۵۶۷۸۹ to 0123456789', () => {
      assert.equal(normalizeArabicNumerals('۰۱۲۳۴۵۶۷۸۹'), '0123456789');
    });

    it('converts Arabic comma ، to decimal point .', () => {
      assert.equal(normalizeArabicNumerals('١٥،٥٠'), '15.50');
      assert.equal(poundsToPiasters('١٥،٥٠'), 1550);
    });
  });
});
