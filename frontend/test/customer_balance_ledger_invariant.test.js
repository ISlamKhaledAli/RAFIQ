import { test } from 'node:test';
import assert from 'node:assert';

test('Feature #41: Customer Credit Ledger & Balance Integrity Invariant (Story 64 / Task 41-5)', async (t) => {
  // Ledger simulation engine matching C# CustomerRepository & SaleRepository ACID implementation
  class CustomerLedgerEngine {
    constructor() {
      this.customers = new Map();
      this.ledger = [];
    }

    createCustomer({ id, name, phone, initialBalancePiasters = 0, creditLimitPiasters = 100000 }) {
      const customer = {
        id,
        name,
        phone,
        balancePiasters: initialBalancePiasters,
        creditLimitPiasters,
        createdAt: new Date().toISOString(),
      };
      this.customers.set(id, customer);

      if (initialBalancePiasters > 0) {
        this.ledger.push({
          id: `led_${Date.now()}_open`,
          customerId: id,
          type: 'opening_balance',
          saleId: null,
          amountPiasters: initialBalancePiasters,
          balanceAfterPiasters: initialBalancePiasters,
          notes: 'رصيد افتتاحي من دفتر الآجل الورقي',
          createdAt: new Date().toISOString(),
        });
      }

      return customer;
    }

    recordCreditSale(customerId, saleId, creditAmountPiasters) {
      const customer = this.customers.get(customerId);
      if (!customer) throw new Error('العميل غير موجود');

      customer.balancePiasters += creditAmountPiasters;
      const entry = {
        id: `led_${Date.now()}_sale`,
        customerId,
        type: 'sale',
        saleId,
        amountPiasters: creditAmountPiasters,
        balanceAfterPiasters: customer.balancePiasters,
        notes: `فاتورة بيع آجل رقم ${saleId}`,
        createdAt: new Date().toISOString(),
      };
      this.ledger.push(entry);
      return entry;
    }

    recordPayment(customerId, paymentAmountPiasters, notes = 'سداد نقدي من العميل') {
      const customer = this.customers.get(customerId);
      if (!customer) throw new Error('العميل غير موجود');
      if (paymentAmountPiasters <= 0) throw new Error('مبلغ السداد يجب أن يكون موجباً');

      customer.balancePiasters -= paymentAmountPiasters;
      const entry = {
        id: `led_${Date.now()}_pay`,
        customerId,
        type: 'payment',
        saleId: null,
        amountPiasters: paymentAmountPiasters,
        balanceAfterPiasters: customer.balancePiasters,
        notes,
        createdAt: new Date().toISOString(),
      };
      this.ledger.push(entry);
      return entry;
    }

    cancelCreditSale(customerId, saleId, cancelAmountPiasters) {
      // Invariant: Zero Hard Delete - contra entry appended
      const customer = this.customers.get(customerId);
      if (!customer) throw new Error('العميل غير موجود');

      customer.balancePiasters -= cancelAmountPiasters;
      const entry = {
        id: `led_${Date.now()}_cancel`,
        customerId,
        type: 'cancellation',
        saleId,
        amountPiasters: cancelAmountPiasters,
        balanceAfterPiasters: customer.balancePiasters,
        notes: `إلغاء فاتورة بيع آجل بقيد عكسي رقم ${saleId}`,
        createdAt: new Date().toISOString(),
      };
      this.ledger.push(entry);
      return entry;
    }

    verifyBalance(customerId) {
      const customer = this.customers.get(customerId);
      if (!customer) return null;

      const entries = this.ledger.filter(l => l.customerId === customerId);
      let calculatedBalance = 0;

      for (const entry of entries) {
        if (entry.type === 'opening_balance' || entry.type === 'sale' || entry.type === 'debt_increase') {
          calculatedBalance += entry.amountPiasters;
        } else if (entry.type === 'payment' || entry.type === 'cancellation' || entry.type === 'refund' || entry.type === 'debt_decrease') {
          calculatedBalance -= entry.amountPiasters;
        }
      }

      return {
        customerId,
        storedBalancePiasters: customer.balancePiasters,
        calculatedBalancePiasters: calculatedBalance,
        isBalanced: customer.balancePiasters === calculatedBalance,
        discrepancyPiasters: customer.balancePiasters - calculatedBalance,
        totalEntriesCount: entries.length,
      };
    }
  }

  await t.test('1. Initial paper notebook opening balance matches ledger and stored balance exactly', () => {
    const engine = new CustomerLedgerEngine();
    engine.createCustomer({
      id: 'c1',
      name: 'أحمد محمود',
      phone: '01012345678',
      initialBalancePiasters: 35000, // 350.00 EGP
    });

    const verify = engine.verifyBalance('c1');
    assert.strictEqual(verify.isBalanced, true);
    assert.strictEqual(verify.storedBalancePiasters, 35000);
    assert.strictEqual(verify.calculatedBalancePiasters, 35000);
    assert.strictEqual(verify.discrepancyPiasters, 0);
    assert.strictEqual(verify.totalEntriesCount, 1);
  });

  await t.test('2. Sequence of credit sales and partial payments maintains exact ledger equality', () => {
    const engine = new CustomerLedgerEngine();
    engine.createCustomer({
      id: 'c2',
      name: 'محمود البقال',
      phone: '01122334455',
      initialBalancePiasters: 0,
    });

    // Sale 1: 120.50 EGP (12050 piasters)
    engine.recordCreditSale('c2', 'inv_101', 12050);
    // Sale 2: 80.00 EGP (8000 piasters)
    engine.recordCreditSale('c2', 'inv_102', 8000);
    // Payment 1: 100.00 EGP (10000 piasters)
    engine.recordPayment('c2', 10000, 'دفعة نقدية');

    const verify = engine.verifyBalance('c2');
    // Expected: 12050 + 8000 - 10000 = 10050 piasters (100.50 EGP)
    assert.strictEqual(verify.isBalanced, true);
    assert.strictEqual(verify.storedBalancePiasters, 10050);
    assert.strictEqual(verify.calculatedBalancePiasters, 10050);
    assert.strictEqual(verify.discrepancyPiasters, 0);
    assert.strictEqual(verify.totalEntriesCount, 3);
  });

  await t.test('3. Sale cancellation appends contra entry without hard deleting and preserves balance integrity', () => {
    const engine = new CustomerLedgerEngine();
    engine.createCustomer({
      id: 'c3',
      name: 'سامح إبراهيم',
      phone: '01299887766',
      initialBalancePiasters: 5000, // 50.00 EGP
    });

    // Credit sale of 150.00 EGP (15000 piasters)
    engine.recordCreditSale('c3', 'inv_201', 15000);
    assert.strictEqual(engine.customers.get('c3').balancePiasters, 20000);

    // Cancel the sale: contra entry appended, balance reduced back to 5000
    engine.cancelCreditSale('c3', 'inv_201', 15000);
    assert.strictEqual(engine.customers.get('c3').balancePiasters, 5000);

    const verify = engine.verifyBalance('c3');
    assert.strictEqual(verify.isBalanced, true);
    assert.strictEqual(verify.storedBalancePiasters, 5000);
    assert.strictEqual(verify.calculatedBalancePiasters, 5000);
    assert.strictEqual(verify.discrepancyPiasters, 0);
    assert.strictEqual(verify.totalEntriesCount, 3); // 1 open + 1 sale + 1 cancellation
  });

  await t.test('4. Full settlement brings customer balance to exactly 0 while preserving all historical records', () => {
    const engine = new CustomerLedgerEngine();
    engine.createCustomer({
      id: 'c4',
      name: 'هاني كمال',
      phone: '01055443322',
      initialBalancePiasters: 25000,
    });

    engine.recordPayment('c4', 25000, 'سداد كامل المديونية بالدفتر');
    const cust = engine.customers.get('c4');
    assert.strictEqual(cust.balancePiasters, 0);

    const verify = engine.verifyBalance('c4');
    assert.strictEqual(verify.isBalanced, true);
    assert.strictEqual(verify.storedBalancePiasters, 0);
    assert.strictEqual(verify.calculatedBalancePiasters, 0);
    assert.strictEqual(verify.discrepancyPiasters, 0);
    assert.strictEqual(verify.totalEntriesCount, 2);
  });

  await t.test('5. Discrepancy detector flags corrupted or out-of-sync stored balance with exact piaster difference', () => {
    const engine = new CustomerLedgerEngine();
    engine.createCustomer({
      id: 'c5',
      name: 'عميل اختبار عدم الاتساق',
      phone: '01000000000',
      initialBalancePiasters: 10000,
    });
    engine.recordCreditSale('c5', 'inv_999', 5000); // True calculated: 15000

    // Corrupt stored balance directly
    engine.customers.get('c5').balancePiasters = 12000; // 3000 discrepancy!

    const verify = engine.verifyBalance('c5');
    assert.strictEqual(verify.isBalanced, false);
    assert.strictEqual(verify.storedBalancePiasters, 12000);
    assert.strictEqual(verify.calculatedBalancePiasters, 15000);
    assert.strictEqual(verify.discrepancyPiasters, -3000);
  });
});
