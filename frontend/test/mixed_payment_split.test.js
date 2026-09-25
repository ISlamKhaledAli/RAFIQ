import { test } from 'node:test';
import assert from 'node:assert';

test('Feature #29: Mixed Payment (Split Cash & Credit) (Story 66 / Tasks 29-1 to 29-3)', async (t) => {
  // Pure logic for split payment distribution and validation matching PaymentModal
  const validateAndBuildSplitPayment = ({
    netTotalPiasters,
    splitRows,
    selectedCustomer = null,
  }) => {
    // 1. Calculate sum of all split parts
    const splitTotalPaid = splitRows.reduce((sum, r) => sum + r.amountPiasters, 0);
    const splitRemainingPiasters = netTotalPiasters - splitTotalPaid;
    const isSumValid = splitRemainingPiasters === 0;

    // 2. Check if credit is involved
    const creditRows = splitRows.filter(r => r.method === 'credit');
    const hasCredit = creditRows.length > 0;
    const totalCreditPiasters = creditRows.reduce((sum, r) => sum + r.amountPiasters, 0);

    // 3. Customer requirement check
    if (hasCredit && !selectedCustomer) {
      return {
        isValid: false,
        error: 'CUSTOMER_REQUIRED_FOR_CREDIT',
        message: 'يجب اختيار عميل لتسجيل الجزء الآجل عليه',
        splitRemainingPiasters,
      };
    }

    if (!isSumValid) {
      return {
        isValid: false,
        error: 'SUM_MISMATCH',
        message: `مجموع الدفعات لا يساوي إجمالي الفاتورة. الفارق: ${splitRemainingPiasters} قرش`,
        splitRemainingPiasters,
      };
    }

    // 4. Over-limit check
    let isOverLimit = false;
    let overLimitPiasters = 0;
    if (hasCredit && selectedCustomer && selectedCustomer.creditLimitPiasters > 0) {
      const newTotalDebt = selectedCustomer.balancePiasters + totalCreditPiasters;
      if (newTotalDebt > selectedCustomer.creditLimitPiasters) {
        isOverLimit = true;
        overLimitPiasters = newTotalDebt - selectedCustomer.creditLimitPiasters;
      }
    }

    // 5. Build payment payload
    const totalCashAndCardPaid = splitRows
      .filter(r => r.method !== 'credit')
      .reduce((sum, r) => sum + r.amountPiasters, 0);

    return {
      isValid: true,
      error: null,
      splitRemainingPiasters: 0,
      isOverLimit,
      overLimitPiasters,
      paymentPayload: {
        paymentMethod: 'multi',
        paidPiasters: totalCashAndCardPaid,
        debtPiasters: totalCreditPiasters,
        netTotalPiasters,
        customerId: selectedCustomer ? selectedCustomer.id : null,
        payments: splitRows.map(r => ({
          method: r.method,
          amountPiasters: r.amountPiasters,
        })),
      },
    };
  };

  await t.test('1. Valid 50/50 split evenly divides invoice and produces valid payload', () => {
    const netTotal = 25000; // 250.00 EGP
    const customer = {
      id: 'cust_1',
      name: 'أحمد محمود',
      balancePiasters: 10000,
      creditLimitPiasters: 100000,
    };

    const res = validateAndBuildSplitPayment({
      netTotalPiasters: netTotal,
      splitRows: [
        { id: '1', method: 'cash', amountPiasters: 12500 },
        { id: '2', method: 'credit', amountPiasters: 12500 },
      ],
      selectedCustomer: customer,
    });

    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.splitRemainingPiasters, 0);
    assert.strictEqual(res.paymentPayload.paidPiasters, 12500); // Cash portion
    assert.strictEqual(res.paymentPayload.debtPiasters, 12500); // Credit portion
    assert.strictEqual(res.paymentPayload.paidPiasters + res.paymentPayload.debtPiasters, netTotal);
    assert.strictEqual(res.isOverLimit, false);
  });

  await t.test('2. Odd piaster split ensures total strictly matches down to single piaster', () => {
    const oddTotal = 1575; // 15.75 EGP
    const half = Math.round(oddTotal / 2); // 788
    const otherHalf = oddTotal - half;     // 787

    const customer = {
      id: 'cust_2',
      name: 'محمود',
      balancePiasters: 0,
      creditLimitPiasters: 50000,
    };

    const res = validateAndBuildSplitPayment({
      netTotalPiasters: oddTotal,
      splitRows: [
        { id: '1', method: 'cash', amountPiasters: half },
        { id: '2', method: 'credit', amountPiasters: otherHalf },
      ],
      selectedCustomer: customer,
    });

    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.paymentPayload.paidPiasters + res.paymentPayload.debtPiasters, 1575);
  });

  await t.test('3. Rejects payment when split total does not match invoice total', () => {
    const res = validateAndBuildSplitPayment({
      netTotalPiasters: 10000,
      splitRows: [
        { id: '1', method: 'cash', amountPiasters: 6000 },
        { id: '2', method: 'credit', amountPiasters: 3000 }, // sum 9000 != 10000
      ],
      selectedCustomer: { id: 'c1', balancePiasters: 0, creditLimitPiasters: 50000 },
    });

    assert.strictEqual(res.isValid, false);
    assert.strictEqual(res.error, 'SUM_MISMATCH');
    assert.strictEqual(res.splitRemainingPiasters, 1000);
  });

  await t.test('4. Rejects credit split when no customer is selected', () => {
    const res = validateAndBuildSplitPayment({
      netTotalPiasters: 10000,
      splitRows: [
        { id: '1', method: 'cash', amountPiasters: 5000 },
        { id: '2', method: 'credit', amountPiasters: 5000 },
      ],
      selectedCustomer: null, // Missing customer
    });

    assert.strictEqual(res.isValid, false);
    assert.strictEqual(res.error, 'CUSTOMER_REQUIRED_FOR_CREDIT');
  });

  await t.test('5. Flags over-limit condition when credit portion exceeds customer limit', () => {
    const customer = {
      id: 'cust_over',
      name: 'عميل تجاوز الحد',
      balancePiasters: 80000,     // 800 EGP existing
      creditLimitPiasters: 100000, // 1000 EGP limit
    };

    const res = validateAndBuildSplitPayment({
      netTotalPiasters: 50000, // 500 EGP
      splitRows: [
        { id: '1', method: 'cash', amountPiasters: 20000 },   // 200 EGP cash
        { id: '2', method: 'credit', amountPiasters: 30000 }, // 300 EGP credit -> total debt 1100 EGP > 1000
      ],
      selectedCustomer: customer,
    });

    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.isOverLimit, true);
    assert.strictEqual(res.overLimitPiasters, 10000); // 100.00 EGP over limit
  });
});
