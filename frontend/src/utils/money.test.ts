/// <reference types="node" />
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateDiscountAmount,
  distributeInvoiceDiscount,
  calculateLineTotal,
  poundsToPiasters,
  piastersToPounds,
} from './money.ts';

describe('Feature #24: Financial Discount Logic & Largest Remainder Tests', () => {
  it('calculateDiscountAmount accurately computes fixed EGP discount', () => {
    // 50.00 EGP gross, 10.50 EGP discount
    const discount = calculateDiscountAmount(5000, 'amount', 10.50);
    assert.equal(discount, 1050); // 1050 piasters
  });

  it('calculateDiscountAmount caps discount at gross amount', () => {
    // 20.00 EGP gross, 30.00 EGP discount attempt
    const discount = calculateDiscountAmount(2000, 'amount', 30.00);
    assert.equal(discount, 2000);
  });

  it('calculateDiscountAmount accurately computes percentage discount with rounding', () => {
    // 15.33 EGP (1533 piasters) with 7% discount
    // 1533 * 0.07 = 107.31 -> rounds to 107 piasters (1.07 EGP)
    const discount = calculateDiscountAmount(1533, 'percent', 7);
    assert.equal(discount, 107);
  });

  it('distributeInvoiceDiscount distributes exact piasters without any rounding discrepancy (Hamilton-Hare)', () => {
    // 3 items with fractional piasters:
    // Item 1: 10.33 EGP (1033 piasters)
    // Item 2: 10.33 EGP (1033 piasters)
    // Item 3: 10.33 EGP (1033 piasters)
    // Subtotal: 30.99 EGP (3099 piasters)
    // Total discount to distribute: 10.00 EGP (1000 piasters)
    const items = [
      { grossPiasters: 1033 },
      { grossPiasters: 1033 },
      { grossPiasters: 1033 },
    ];

    const distributed = distributeInvoiceDiscount(items, 1000);

    // Sum of distributed discounts MUST exactly equal 1000 piasters
    const sum = distributed.reduce((a, b) => a + b, 0);
    assert.equal(sum, 1000, 'Distributed sum must equal target discount exactly');

    // Shares should be 334, 333, 333 (1 remainder allocated to first highest remainder)
    assert.deepEqual(distributed, [334, 333, 333]);
  });

  it('distributeInvoiceDiscount handles varying item sizes proportionally', () => {
    // Item 1: 100.00 EGP (10000 piasters)
    // Item 2: 50.00 EGP (5000 piasters)
    // Item 3: 10.00 EGP (1000 piasters)
    // Subtotal: 160.00 EGP (16000 piasters)
    // Discount: 16.00 EGP (1600 piasters) = 10%
    const items = [
      { grossPiasters: 10000 },
      { grossPiasters: 5000 },
      { grossPiasters: 1000 },
    ];

    const distributed = distributeInvoiceDiscount(items, 1600);
    const sum = distributed.reduce((a, b) => a + b, 0);
    assert.equal(sum, 1600);

    // 10% of each: 1000, 500, 100
    assert.deepEqual(distributed, [1000, 500, 100]);
  });

  it('distributeInvoiceDiscount handles uneven odd piasters across 7 items', () => {
    const items = [
      { grossPiasters: 123 },
      { grossPiasters: 456 },
      { grossPiasters: 789 },
      { grossPiasters: 234 },
      { grossPiasters: 567 },
      { grossPiasters: 890 },
      { grossPiasters: 345 },
    ];
    // Total gross = 3404 piasters
    // Discount: 555 piasters
    const distributed = distributeInvoiceDiscount(items, 555);
    const sum = distributed.reduce((a, b) => a + b, 0);
    assert.equal(sum, 555, 'Sum must match 555 piasters exactly');

    // Every item share must be <= its gross
    for (let i = 0; i < items.length; i++) {
      assert.ok(distributed[i] <= items[i].grossPiasters);
    }
  });

  it('calculateLineTotal respects discount', () => {
    // 2.5 kg at 20.00 EGP/kg = 50.00 EGP (5000 piasters)
    // with 5.00 EGP discount (500 piasters)
    const total = calculateLineTotal(2000, 2500, 500);
    assert.equal(total, 4500); // 45.00 EGP
  });

  it('poundsToPiasters and piastersToPounds are inverse functions', () => {
    assert.equal(poundsToPiasters('15.50'), 1550);
    assert.equal(poundsToPiasters('١٥٫٥٠'), 1550); // Arabic Eastern digits
    assert.equal(piastersToPounds(1550), 15.5);
  });
});
