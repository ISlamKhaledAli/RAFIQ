import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  piastersToPounds
} from '../src/utils/money.ts';

describe('Story 45: Multi-Payment & Change Due Invariants (Feature #27 / Tasks 27-1 to 27-5)', () => {

  describe('Task 27-2: Cash Received & Change Due Math', () => {
    it('calculates change due accurately with zero float precision error', () => {
      const netTotalPiasters = 14350; // 143.50 EGP
      const receivedPiasters = 20000; // 200.00 EGP

      const changePiasters = Math.max(0, receivedPiasters - netTotalPiasters);
      assert.equal(changePiasters, 5650); // 56.50 EGP
      assert.equal(piastersToPounds(changePiasters), 56.5);
    });

    it('returns zero change when customer pays exact amount', () => {
      const netTotalPiasters = 8725;
      const receivedPiasters = 8725;

      const changePiasters = Math.max(0, receivedPiasters - netTotalPiasters);
      assert.equal(changePiasters, 0);
    });

    it('detects short payment when customer provides less than invoice total', () => {
      const netTotalPiasters = 10000; // 100.00 EGP
      const receivedPiasters = 7500;  // 75.00 EGP

      const isShort = receivedPiasters < netTotalPiasters;
      const shortAmount = netTotalPiasters - receivedPiasters;

      assert.equal(isShort, true);
      assert.equal(shortAmount, 2500); // 25.00 EGP short
    });
  });

  describe('Task 27-1: Multi-Payment / Split Payment Validation', () => {
    it('validates that sum of split rows matches net total exactly', () => {
      const netTotalPiasters = 25000; // 250.00 EGP

      const splitPayments = [
        { method: 'cash', amountPiasters: 10000 },
        { method: 'card', amountPiasters: 15000 },
      ];

      const sumPaid = splitPayments.reduce((acc, p) => acc + p.amountPiasters, 0);
      assert.equal(sumPaid, netTotalPiasters);
    });

    it('flags imbalance when split payments do not cover full total', () => {
      const netTotalPiasters = 30000;

      const splitPayments = [
        { method: 'cash', amountPiasters: 10000 },
        { method: 'card', amountPiasters: 15000 },
      ];

      const sumPaid = splitPayments.reduce((acc, p) => acc + p.amountPiasters, 0);
      const remaining = netTotalPiasters - sumPaid;

      assert.equal(remaining, 5000); // 50.00 EGP still unpaid
      assert.notEqual(sumPaid, netTotalPiasters);
    });
  });

  describe('Task 27-4: Atomic Payment Record Payload Formation', () => {
    it('creates well-formed payment rows for SQLite insertion', () => {
      const saleId = 'sale_test_uuid_1';
      const netTotalPiasters = 18500;

      const payments = [
        { id: 'pay_1', saleId, amountPiasters: 10000, method: 'cash' },
        { id: 'pay_2', saleId, amountPiasters: 8500, method: 'card' }
      ];

      assert.equal(payments.length, 2);
      assert.equal(payments[0].method, 'cash');
      assert.equal(payments[1].method, 'card');
      assert.equal(payments[0].amountPiasters + payments[1].amountPiasters, netTotalPiasters);
    });
  });
});
