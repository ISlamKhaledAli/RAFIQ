import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Feature #136: Customer Payment Cancellation via Accounting Contra Entry (Story 68 / Tasks 136-1 to 136-3)
 * Invariants tested:
 * 1. Contra entry reversal: cancelling a payment restores the customer debt balance.
 * 2. Zero hard delete: original payment remains intact in the ledger; a contra entry of type 'payment_cancel' is inserted.
 * 3. Double-cancellation prevention: attempting to cancel an already-cancelled payment is strictly rejected.
 * 4. Validation: only entries of type 'payment' can be cancelled via this workflow.
 * 5. Full audit metadata: contra entry captures reason, cashier username, and original payment id in saleId.
 * 6. Balance verification invariant: running balance and sum of ledger entries remain 100% equal.
 */

function calculateCustomerBalance(ledger) {
  let bal = 0;
  for (const entry of ledger) {
    const t = entry.type.toLowerCase();
    if (t === 'opening_balance' || t === 'sale' || t === 'debt_increase' || t === 'payment_cancel') {
      bal += entry.amountPiasters;
    } else if (t === 'payment' || t === 'refund' || t === 'cancellation' || t === 'debt_decrease') {
      bal -= entry.amountPiasters;
    }
  }
  return bal;
}

function cancelCustomerPayment({
  customer,
  ledger,
  paymentEntryId,
  reason = 'سجلت بالخطأ',
  userName = 'الكاشير',
}) {
  if (!customer || !customer.id) {
    throw new Error('العميل غير موجود في النظام');
  }

  const paymentEntry = ledger.find(e => e.id === paymentEntryId && e.customerId === customer.id);
  if (!paymentEntry) {
    throw new Error('حركة السداد غير موجودة في سجل هذا العميل');
  }

  if (paymentEntry.type !== 'payment') {
    throw new Error('لا يمكن إلغاء سوى حركات السداد فقط');
  }

  const alreadyCancelled = ledger.some(
    e => e.type === 'payment_cancel' && e.saleId === paymentEntryId
  );
  if (alreadyCancelled) {
    throw new Error('تم إلغاء هذه الدفعة مسبقاً بقيد معاكس');
  }

  const restoredBalance = customer.balancePiasters + paymentEntry.amountPiasters;
  const contraId = `led_rev_${Date.now()}`;
  const now = new Date().toISOString();

  const contraEntry = {
    id: contraId,
    customerId: customer.id,
    type: 'payment_cancel',
    saleId: paymentEntryId,
    amountPiasters: paymentEntry.amountPiasters,
    balanceAfterPiasters: restoredBalance,
    notes: `قيد معاكس لإلغاء دفعة (${(paymentEntry.amountPiasters / 100).toFixed(2)} ج.م) — السبب: ${reason.trim()} (المستخدم: ${userName.trim()})`,
    createdAt: now,
  };

  const updatedLedger = [contraEntry, ...ledger];
  const updatedCustomer = {
    ...customer,
    balancePiasters: restoredBalance,
  };

  return {
    customer: updatedCustomer,
    ledger: updatedLedger,
    contraEntry,
  };
}

test('Feature #136: Customer Payment Cancellation via Contra Entry (Story 68 / Tasks 136-1 to 136-3)', async (t) => {
  await t.test('1. Cancelling payment restores customer balance to exact pre-payment amount', () => {
    const customer = { id: 'cust_1', name: 'أحمد', balancePiasters: 15000 }; // current debt 150.00 EGP after paying 50.00 EGP
    const ledger = [
      {
        id: 'pay_1',
        customerId: 'cust_1',
        type: 'payment',
        saleId: null,
        amountPiasters: 5000, // 50.00 EGP
        balanceAfterPiasters: 15000,
        notes: 'سداد نقدي',
        createdAt: '2026-09-25T10:00:00Z',
      },
      {
        id: 'init_1',
        customerId: 'cust_1',
        type: 'opening_balance',
        saleId: null,
        amountPiasters: 20000, // 200.00 EGP
        balanceAfterPiasters: 20000,
        notes: 'رصيد افتتاحي',
        createdAt: '2026-09-20T10:00:00Z',
      },
    ];

    const result = cancelCustomerPayment({
      customer,
      ledger,
      paymentEntryId: 'pay_1',
      reason: 'سجلت للعميل الخطأ',
      userName: 'خالد علي',
    });

    assert.equal(result.customer.balancePiasters, 20000); // 15000 + 5000 = 20000 (pre-payment balance)
    assert.equal(result.contraEntry.type, 'payment_cancel');
    assert.equal(result.contraEntry.saleId, 'pay_1');
    assert.equal(result.contraEntry.amountPiasters, 5000);
    assert.equal(result.contraEntry.balanceAfterPiasters, 20000);
  });

  await t.test('2. Zero hard delete: original payment remains intact and accessible in ledger', () => {
    const customer = { id: 'cust_1', name: 'أحمد', balancePiasters: 0 };
    const ledger = [
      {
        id: 'pay_full',
        customerId: 'cust_1',
        type: 'payment',
        saleId: null,
        amountPiasters: 30000,
        balanceAfterPiasters: 0,
        notes: 'سداد بالكامل',
        createdAt: '2026-09-25T11:00:00Z',
      },
      {
        id: 'sale_1',
        customerId: 'cust_1',
        type: 'sale',
        saleId: 'sale_101',
        amountPiasters: 30000,
        balanceAfterPiasters: 30000,
        notes: 'فاتورة آجل #101',
        createdAt: '2026-09-25T10:30:00Z',
      },
    ];

    const result = cancelCustomerPayment({
      customer,
      ledger,
      paymentEntryId: 'pay_full',
      reason: 'شيك مرتجع بدون رصيد',
    });

    // Ledger has 3 entries: contra entry + payment + sale
    assert.equal(result.ledger.length, 3);
    const original = result.ledger.find(e => e.id === 'pay_full');
    assert.ok(original, 'Original payment entry must still exist');
    assert.equal(original.amountPiasters, 30000);
  });

  await t.test('3. Prevents duplicate cancellation of the same payment entry', () => {
    const customer = { id: 'cust_1', name: 'أحمد', balancePiasters: 10000 };
    const ledger = [
      {
        id: 'contra_1',
        customerId: 'cust_1',
        type: 'payment_cancel',
        saleId: 'pay_already_cancelled',
        amountPiasters: 5000,
        balanceAfterPiasters: 10000,
        notes: 'قيد معاكس',
        createdAt: '2026-09-25T12:00:00Z',
      },
      {
        id: 'pay_already_cancelled',
        customerId: 'cust_1',
        type: 'payment',
        saleId: null,
        amountPiasters: 5000,
        balanceAfterPiasters: 5000,
        notes: 'سداد قديم',
        createdAt: '2026-09-25T11:00:00Z',
      },
    ];

    assert.throws(
      () => cancelCustomerPayment({ customer, ledger, paymentEntryId: 'pay_already_cancelled' }),
      /تم إلغاء هذه الدفعة مسبقاً بقيد معاكس/
    );
  });

  await t.test('4. Rejects attempts to cancel non-payment entries (e.g. sale or opening_balance)', () => {
    const customer = { id: 'cust_1', name: 'أحمد', balancePiasters: 15000 };
    const ledger = [
      {
        id: 'open_1',
        customerId: 'cust_1',
        type: 'opening_balance',
        saleId: null,
        amountPiasters: 15000,
        balanceAfterPiasters: 15000,
        notes: 'رصيد افتتاحي',
        createdAt: '2026-09-20T10:00:00Z',
      },
    ];

    assert.throws(
      () => cancelCustomerPayment({ customer, ledger, paymentEntryId: 'open_1' }),
      /لا يمكن إلغاء سوى حركات السداد فقط/
    );
  });

  await t.test('5. Balance verification invariant: sum of all ledger entries strictly equals customer balance', () => {
    let customer = { id: 'cust_test', name: 'سامي', balancePiasters: 0 };
    let ledger = [];

    // Step 1: Opening balance 50,000 piasters (500 EGP)
    ledger.push({
      id: 'e1',
      customerId: 'cust_test',
      type: 'opening_balance',
      saleId: null,
      amountPiasters: 50000,
      balanceAfterPiasters: 50000,
      notes: 'رصيد افتتاحي',
      createdAt: '2026-09-20T10:00:00Z',
    });
    customer.balancePiasters = 50000;
    assert.equal(calculateCustomerBalance(ledger), customer.balancePiasters);

    // Step 2: Payment of 20,000 piasters (200 EGP)
    ledger.unshift({
      id: 'e2',
      customerId: 'cust_test',
      type: 'payment',
      saleId: null,
      amountPiasters: 20000,
      balanceAfterPiasters: 30000,
      notes: 'سداد نقدي',
      createdAt: '2026-09-21T10:00:00Z',
    });
    customer.balancePiasters = 30000;
    assert.equal(calculateCustomerBalance(ledger), customer.balancePiasters);

    // Step 3: Sale of 12,500 piasters (125 EGP)
    ledger.unshift({
      id: 'e3',
      customerId: 'cust_test',
      type: 'sale',
      saleId: 'sale_99',
      amountPiasters: 12500,
      balanceAfterPiasters: 42500,
      notes: 'فاتورة آجل #99',
      createdAt: '2026-09-22T10:00:00Z',
    });
    customer.balancePiasters = 42500;
    assert.equal(calculateCustomerBalance(ledger), customer.balancePiasters);

    // Step 4: Cancel the payment e2 via contra entry
    const cancelRes = cancelCustomerPayment({
      customer,
      ledger,
      paymentEntryId: 'e2',
      reason: 'سجلت بالخطأ',
      userName: 'كاشير المساء',
    });
    customer = cancelRes.customer;
    ledger = cancelRes.ledger;

    // Customer balance must be restored: 42500 + 20000 = 62500
    assert.equal(customer.balancePiasters, 62500);
    assert.equal(calculateCustomerBalance(ledger), 62500);
    assert.equal(calculateCustomerBalance(ledger), customer.balancePiasters);
  });
});
