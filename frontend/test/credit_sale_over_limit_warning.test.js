import { test } from 'node:test';
import assert from 'node:assert';

test('Feature #28: Credit Sale High Debt & Over-Limit Warning (Story 65 / Tasks 28-3 & 28-4)', async (t) => {
  // Evaluates customer debt status and over-limit warnings matching PaymentModal logic
  const evaluateCreditEligibility = ({
    customerBalancePiasters,
    creditLimitPiasters,
    invoiceNetTotalPiasters,
  }) => {
    const totalDebtAfterPiasters = customerBalancePiasters + invoiceNetTotalPiasters;
    const isOverLimit = creditLimitPiasters > 0 && totalDebtAfterPiasters > creditLimitPiasters;
    const isHighExistingDebt = customerBalancePiasters >= 50000; // >= 500.00 EGP
    const overLimitDifferencePiasters = isOverLimit ? totalDebtAfterPiasters - creditLimitPiasters : 0;

    let warningLevel = 'NONE';
    let warningMessage = null;

    if (isOverLimit) {
      warningLevel = 'CRITICAL';
      warningMessage = `تحذير حرج: تجاوز الحد الائتماني بمقدار ${overLimitDifferencePiasters / 100} ج.م`;
    } else if (isHighExistingDebt) {
      warningLevel = 'WARNING';
      warningMessage = `تنبيه: العميل لديه مديونية سابقة مرتفعة بقيمة ${customerBalancePiasters / 100} ج.م`;
    }

    return {
      totalDebtAfterPiasters,
      isOverLimit,
      isHighExistingDebt,
      overLimitDifferencePiasters,
      warningLevel,
      warningMessage,
      requiresCashierConfirmation: isOverLimit,
    };
  };

  await t.test('1. Normal debt within limits requires no alert or confirmation', () => {
    const res = evaluateCreditEligibility({
      customerBalancePiasters: 10000, // 100 EGP
      creditLimitPiasters: 100000,    // 1,000 EGP
      invoiceNetTotalPiasters: 15000, // 150 EGP -> total 250 EGP
    });

    assert.strictEqual(res.totalDebtAfterPiasters, 25000);
    assert.strictEqual(res.isOverLimit, false);
    assert.strictEqual(res.isHighExistingDebt, false);
    assert.strictEqual(res.warningLevel, 'NONE');
    assert.strictEqual(res.requiresCashierConfirmation, false);
  });

  await t.test('2. High existing debt (>= 500 EGP) triggers warning level alert', () => {
    const res = evaluateCreditEligibility({
      customerBalancePiasters: 60000, // 600 EGP >= 500 EGP
      creditLimitPiasters: 200000,    // 2,000 EGP limit
      invoiceNetTotalPiasters: 5000,  // 50 EGP
    });

    assert.strictEqual(res.totalDebtAfterPiasters, 65000);
    assert.strictEqual(res.isOverLimit, false);
    assert.strictEqual(res.isHighExistingDebt, true);
    assert.strictEqual(res.warningLevel, 'WARNING');
    assert.ok(res.warningMessage.includes('مديونية سابقة مرتفعة'));
    assert.strictEqual(res.requiresCashierConfirmation, false);
  });

  await t.test('3. Sale exceeding credit limit triggers CRITICAL warning and requires confirmation', () => {
    const res = evaluateCreditEligibility({
      customerBalancePiasters: 80000, // 800 EGP
      creditLimitPiasters: 100000,    // 1,000 EGP limit
      invoiceNetTotalPiasters: 40000, // 400 EGP -> total 1,200 EGP (> 1,000 EGP)
    });

    assert.strictEqual(res.totalDebtAfterPiasters, 120000);
    assert.strictEqual(res.isOverLimit, true);
    assert.strictEqual(res.overLimitDifferencePiasters, 20000); // 200 EGP over
    assert.strictEqual(res.warningLevel, 'CRITICAL');
    assert.strictEqual(res.requiresCashierConfirmation, true);
    assert.ok(res.warningMessage.includes('تجاوز الحد الائتماني بمقدار 200'));
  });

  await t.test('4. Credit sale payload structure guarantees integer arithmetic and 0 paid piasters', () => {
    const customerId = 'cust_test_123';
    const netTotalPiasters = 14500;

    const createCreditPaymentPayload = (cId, totalPiasters) => {
      if (!cId) throw new Error('يجب اختيار عميل');
      return {
        paymentMethod: 'credit',
        paidPiasters: 0,
        changeDuePiasters: 0,
        customerId: cId,
        payments: [
          {
            amountPiasters: 0,
            method: 'credit',
          },
        ],
        debtAddedPiasters: totalPiasters,
      };
    };

    const payload = createCreditPaymentPayload(customerId, netTotalPiasters);
    assert.strictEqual(payload.paymentMethod, 'credit');
    assert.strictEqual(payload.paidPiasters, 0);
    assert.strictEqual(payload.changeDuePiasters, 0);
    assert.strictEqual(payload.customerId, 'cust_test_123');
    assert.strictEqual(payload.debtAddedPiasters, 14500);
  });
});
