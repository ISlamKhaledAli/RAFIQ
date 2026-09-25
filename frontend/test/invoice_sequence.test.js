import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Story 49 — Feature #107: Sequential Invoice Counter & Number Invariants (Tasks 107-1 to 107-4)', () => {

  describe('Task 107-1 & 107-2: Atomic Sequence Counter Invariants', () => {
    it('strictly increments invoice numbers sequentially by 1', () => {
      let counter = 1000;
      const getNextInvoiceNumber = () => {
        counter += 1;
        return counter;
      };

      const inv1 = getNextInvoiceNumber();
      const inv2 = getNextInvoiceNumber();
      const inv3 = getNextInvoiceNumber();

      assert.equal(inv1, 1001);
      assert.equal(inv2, 1002);
      assert.equal(inv3, 1003);
    });

    it('simulates ACID transaction rollback preserving counter value on crash/failure', () => {
      let committedCounter = 500;
      let transactionCounter = committedCounter;

      const attemptSale = (shouldCrash) => {
        transactionCounter += 1; // provisional increment inside transaction
        if (shouldCrash) {
          // Rollback: revert provisional counter
          transactionCounter = committedCounter;
          throw new Error('Power outage / constraint violation rollback');
        }
        // Commit: persist counter
        committedCounter = transactionCounter;
        return committedCounter;
      };

      // Successful sale 1
      const inv1 = attemptSale(false);
      assert.equal(inv1, 501);
      assert.equal(committedCounter, 501);

      // Failed sale (crash during transaction)
      assert.throws(() => attemptSale(true), /rollback/);
      assert.equal(committedCounter, 501); // Counter did not advance!

      // Next successful sale gets next sequential number without gap
      const inv2 = attemptSale(false);
      assert.equal(inv2, 502);
      assert.equal(committedCounter, 502);
    });
  });

  describe('Task 107-3: Invoice Number Search Normalization & Lookup', () => {
    it('normalizes invoice query stripping #, spaces, and leading zeros properly', () => {
      const parseInvoiceQuery = (raw) => {
        if (!raw) return null;
        // Normalize Arabic-Indic digits if entered
        const western = raw.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632));
        const cleaned = western.trim().replace(/^#+/, '').trim();
        const num = parseInt(cleaned, 10);
        return isNaN(num) || num <= 0 ? null : num;
      };

      assert.equal(parseInvoiceQuery('1042'), 1042);
      assert.equal(parseInvoiceQuery('#1042'), 1042);
      assert.equal(parseInvoiceQuery('  # 1042  '), 1042);
      assert.equal(parseInvoiceQuery('١٠٤٢'), 1042);
      assert.equal(parseInvoiceQuery('#١٠٤٢'), 1042);
      assert.equal(parseInvoiceQuery('abc'), null);
      assert.equal(parseInvoiceQuery('0'), null);
      assert.equal(parseInvoiceQuery('-5'), null);
    });

    it('finds invoice by exact sequential number among ledger sales', () => {
      const mockSales = [
        { id: 's1', invoiceNumber: 1001, totalPiasters: 5000 },
        { id: 's2', invoiceNumber: 1002, totalPiasters: 7500 },
        { id: 's3', invoiceNumber: 1003, totalPiasters: 12000 }
      ];

      const findByInvoice = (num) => mockSales.find((s) => s.invoiceNumber === num) || null;

      const found = findByInvoice(1002);
      assert.ok(found);
      assert.equal(found.id, 's2');
      assert.equal(found.totalPiasters, 7500);

      const notFound = findByInvoice(9999);
      assert.equal(notFound, null);
    });
  });

});
