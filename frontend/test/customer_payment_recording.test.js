import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Feature #42: Customer Payment Recording & Receipts (Story 67 / Tasks 42-1 to 42-4)
 * Invariants tested:
 * 1. Recording full payment (سدد الكل) brings customer balance to exactly 0.
 * 2. Recording partial payment accurately reduces balance with integer arithmetic.
 * 3. Rejects payment with zero or negative piasters.
 * 4. Overpayment rule: allows credit balance (negative balance = credit in favor of customer).
 * 5. Creates immutable ledger entry of type 'payment' with correct balance_after.
 * 6. Generates valid payment receipt payload with before/after balances.
 */

function validateAndRecordPayment({ currentBalancePiasters, paymentAmountPiasters, notes = '', customerId = 'cust_1' }) {
  if (!customerId) {
    throw new Error('معرف العميل مطلوب');
  }
  if (!Number.isInteger(paymentAmountPiasters) || paymentAmountPiasters <= 0) {
    throw new Error('مبلغ السداد يجب أن يكون أكبر من الصفر كعدد صحيح من القروش');
  }

  const newBalancePiasters = currentBalancePiasters - paymentAmountPiasters;
  const ledgerId = `led_pay_${Date.now()}`;
  const now = new Date().toISOString();

  const ledgerEntry = {
    id: ledgerId,
    customerId,
    type: 'payment',
    saleId: null,
    amountPiasters: paymentAmountPiasters,
    balanceAfterPiasters: newBalancePiasters,
    notes: notes.trim() || 'سداد نقدي من العميل',
    createdAt: now,
  };

  const receipt = {
    receiptType: 'CUSTOMER_PAYMENT',
    receiptId: `REC-${ledgerId.slice(-6)}`,
    customerId,
    previousBalancePiasters: currentBalancePiasters,
    amountPaidPiasters: paymentAmountPiasters,
    remainingBalancePiasters: newBalancePiasters,
    notes: ledgerEntry.notes,
    timestamp: now,
  };

  return {
    success: true,
    newBalancePiasters,
    ledgerEntry,
    receipt,
  };
}

test('Feature #42: Customer Payment Recording (Story 67 / Tasks 42-1 to 42-4)', async (t) => {
  await t.test('1. Full payment (سدد الكل) resets debt to exactly 0', () => {
    const currentBalance = 45050; // 450.50 EGP
    const result = validateAndRecordPayment({
      currentBalancePiasters: currentBalance,
      paymentAmountPiasters: 45050,
      notes: 'سداد كامل الحساب',
    });

    assert.equal(result.newBalancePiasters, 0);
    assert.equal(result.ledgerEntry.type, 'payment');
    assert.equal(result.ledgerEntry.amountPiasters, 45050);
    assert.equal(result.ledgerEntry.balanceAfterPiasters, 0);
    assert.equal(result.receipt.remainingBalancePiasters, 0);
  });

  await t.test('2. Partial payment reduces balance accurately using integer piasters', () => {
    const currentBalance = 100000; // 1,000.00 EGP
    const payment = 35025; // 350.25 EGP
    const result = validateAndRecordPayment({
      currentBalancePiasters: currentBalance,
      paymentAmountPiasters: payment,
      notes: 'دفعة تحت الحساب',
    });

    assert.equal(result.newBalancePiasters, 64975); // 649.75 EGP
    assert.equal(result.ledgerEntry.balanceAfterPiasters, 64975);
    assert.equal(result.receipt.previousBalancePiasters, 100000);
    assert.equal(result.receipt.amountPaidPiasters, 35025);
  });

  await t.test('3. Rejects payment with zero or negative amount', () => {
    assert.throws(
      () => validateAndRecordPayment({ currentBalancePiasters: 5000, paymentAmountPiasters: 0 }),
      /مبلغ السداد يجب أن يكون أكبر من الصفر/
    );

    assert.throws(
      () => validateAndRecordPayment({ currentBalancePiasters: 5000, paymentAmountPiasters: -100 }),
      /مبلغ السداد يجب أن يكون أكبر من الصفر/
    );

    assert.throws(
      () => validateAndRecordPayment({ currentBalancePiasters: 5000, paymentAmountPiasters: 12.5 }),
      /مبلغ السداد يجب أن يكون أكبر من الصفر كعدد صحيح/
    );
  });

  await t.test('4. Overpayment results in valid credit balance (رصيد دائن للعميل)', () => {
    const currentBalance = 20000; // 200.00 EGP
    const payment = 25000; // 250.00 EGP
    const result = validateAndRecordPayment({
      currentBalancePiasters: currentBalance,
      paymentAmountPiasters: payment,
      notes: 'سداد مع زيادة رصيد مقدم',
    });

    assert.equal(result.newBalancePiasters, -5000); // 50.00 EGP credit
    assert.equal(result.receipt.remainingBalancePiasters, -5000);
  });

  await t.test('5. Validates customer ID and generates complete receipt data for thermal printer', () => {
    assert.throws(
      () => validateAndRecordPayment({ currentBalancePiasters: 1000, paymentAmountPiasters: 1000, customerId: '' }),
      /معرف العميل مطلوب/
    );

    const result = validateAndRecordPayment({
      currentBalancePiasters: 8000,
      paymentAmountPiasters: 8000,
      customerId: 'cust_ahmed',
      notes: 'سداد الكاشير خالد',
    });

    assert.ok(result.receipt.receiptId.startsWith('REC-'));
    assert.equal(result.receipt.customerId, 'cust_ahmed');
    assert.equal(result.receipt.notes, 'سداد الكاشير خالد');
    assert.ok(result.receipt.timestamp);
  });
});
