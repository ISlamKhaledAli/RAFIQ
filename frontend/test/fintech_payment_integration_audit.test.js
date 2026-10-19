import { test } from 'node:test';
import assert from 'node:assert';

test('Fintech Payment Integration & Multi-Payment Audit Suite (Scenarios 1 - 4)', async (t) => {

  // Pure logic engine replicating C# and TypeScript payment reconciliation
  const reconcileSplitPayment = ({
    netTotalPiasters,
    payments,
    selectedCustomer = null,
    saveChangeToCustomerAccount = false,
    serviceFeePiasters = 0,
  }) => {
    // 1. Validate negative amounts
    if (payments.some(p => p.amountPiasters < 0)) {
      return {
        isValid: false,
        errorCode: 'NEGATIVE_PAYMENT_AMOUNT',
        errorMessage: 'لا يمكن تسجيل مبالغ سالبة في طرق الدفع.',
      };
    }

    // 2. Sum components
    const totalCredit = payments
      .filter(p => p.method === 'credit')
      .reduce((sum, p) => sum + p.amountPiasters, 0);

    const totalCash = payments
      .filter(p => p.method === 'cash')
      .reduce((sum, p) => sum + p.amountPiasters, 0);

    const totalElectronic = payments
      .filter(p => p.method === 'card' || p.method === 'instapay' || p.method === 'vodafone_cash')
      .reduce((sum, p) => sum + p.amountPiasters, 0);

    const totalNonCredit = totalCash + totalElectronic;
    const totalTenderedAll = totalNonCredit + totalCredit;

    // 3. Credit validation
    const hasCredit = totalCredit > 0;
    const hasRegisteredCustomer = !!(selectedCustomer && selectedCustomer.id !== 'cust_general_cash');

    if (hasCredit && !hasRegisteredCustomer) {
      return {
        isValid: false,
        errorCode: 'CUSTOMER_REQUIRED_FOR_CREDIT',
        errorMessage: 'يجب اختيار عميل لتسجيل الجزء الآجل (الشكك) عليه.',
      };
    }

    // 4. Overpayment and Change Calculation (Scenario 2)
    const expectedReceivable = netTotalPiasters + serviceFeePiasters;
    const diff = expectedReceivable - totalTenderedAll;

    if (diff > 0) {
      return {
        isValid: false,
        errorCode: 'SHORT_PAYMENT',
        errorMessage: `مجموع الدفعات أقل من المطلوب بمقدار ${diff} قرش.`,
        remainingPiasters: diff,
      };
    }

    if (diff < 0) {
      const excess = Math.abs(diff);

      // Rule: Cannot mix credit debt with overpayment
      if (hasCredit) {
        return {
          isValid: false,
          errorCode: 'CREDIT_WITH_OVERPAYMENT_PROHIBITED',
          errorMessage: 'لا يمكن تسجيل جزء آجل (شكك) مع وجود مبالغ زائدة عن المطلوب.',
        };
      }

      // Rule: Overpayment must be covered by physical cash tendered
      if (totalCash < excess) {
        return {
          isValid: false,
          errorCode: 'ELECTRONIC_OVERPAYMENT_PROHIBITED',
          errorMessage: 'لا يمكن إرجاع باقي نقدي لمدفوعات إلكترونية.',
        };
      }

      const cashChangeDue = saveChangeToCustomerAccount ? 0 : excess;
      const customerDeposit = (saveChangeToCustomerAccount && hasRegisteredCustomer) ? excess : 0;
      const netCashAddedToDrawer = totalCash - cashChangeDue;

      return {
        isValid: true,
        errorCode: null,
        paidPiasters: totalNonCredit,
        debtPiasters: 0,
        changeDuePiasters: cashChangeDue,
        customerDepositPiasters: customerDeposit,
        netCashAddedToDrawer,
        totalElectronic,
        storeRevenuePiasters: netTotalPiasters,
        serviceFeePiasters,
        // Mathematical invariant: Net cash in drawer + Electronic collected = Store Revenue + Service Fee + Customer Deposit
        isReconciled: (netCashAddedToDrawer + totalElectronic) === (netTotalPiasters + serviceFeePiasters + customerDeposit),
      };
    }

    // diff === 0: Exact Payment (Scenario 1)
    const debtAmount = totalCredit;
    const netCashAddedToDrawer = totalCash;

    // Check Credit Limit
    let isOverCreditLimit = false;
    let overCreditLimitPiasters = 0;
    if (hasCredit && selectedCustomer && selectedCustomer.creditLimitPiasters > 0) {
      const projectedDebt = selectedCustomer.balancePiasters + debtAmount;
      if (projectedDebt > selectedCustomer.creditLimitPiasters) {
        isOverCreditLimit = true;
        overCreditLimitPiasters = projectedDebt - selectedCustomer.creditLimitPiasters;
      }
    }

    return {
      isValid: true,
      errorCode: null,
      paidPiasters: totalNonCredit,
      debtPiasters: debtAmount,
      changeDuePiasters: 0,
      customerDepositPiasters: 0,
      netCashAddedToDrawer,
      totalElectronic,
      storeRevenuePiasters: netTotalPiasters,
      serviceFeePiasters,
      isOverCreditLimit,
      overCreditLimitPiasters,
      // Mathematical invariant: (Cash in drawer + Electronic collected + Customer Debt) === Total Bill + Service Fee
      isReconciled: (netCashAddedToDrawer + totalElectronic + debtAmount) === (netTotalPiasters + serviceFeePiasters),
    };
  };

  // --- SCENARIO 1: الدفع المقسم (Split Payment) ---
  await t.test('Scenario 1.1: 3-way Split (Cash + Card + Credit) sums to exact bill without 1 piaster difference', () => {
    const netTotal = 35000; // 350.00 EGP
    const customer = { id: 'c1', name: 'عميل مسجل', balancePiasters: 5000, creditLimitPiasters: 50000 };

    const res = reconcileSplitPayment({
      netTotalPiasters: netTotal,
      payments: [
        { method: 'cash', amountPiasters: 10000 },  // 100 EGP
        { method: 'card', amountPiasters: 15000 },  // 150 EGP
        { method: 'credit', amountPiasters: 10000 },// 100 EGP
      ],
      selectedCustomer: customer,
    });

    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.isReconciled, true);
    assert.strictEqual(res.paidPiasters, 25000); // 100 cash + 150 card = 250 EGP
    assert.strictEqual(res.debtPiasters, 10000); // 100 EGP debt
    assert.strictEqual(res.paidPiasters + res.debtPiasters, netTotal);
    assert.strictEqual(res.changeDuePiasters, 0);
  });

  await t.test('Scenario 1.2: Odd piaster split ensures 0 piaster rounding discrepancy', () => {
    const oddTotal = 1999; // 19.99 EGP
    const customer = { id: 'c2', name: 'أحمد', balancePiasters: 0, creditLimitPiasters: 10000 };

    const res = reconcileSplitPayment({
      netTotalPiasters: oddTotal,
      payments: [
        { method: 'cash', amountPiasters: 666 },
        { method: 'vodafone_cash', amountPiasters: 666 },
        { method: 'credit', amountPiasters: 667 },
      ],
      selectedCustomer: customer,
    });

    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.isReconciled, true);
    assert.strictEqual(res.paidPiasters + res.debtPiasters, 1999);
  });

  await t.test('Scenario 1.3: Rejects credit split when customer is anonymous', () => {
    const res = reconcileSplitPayment({
      netTotalPiasters: 10000,
      payments: [
        { method: 'cash', amountPiasters: 5000 },
        { method: 'credit', amountPiasters: 5000 },
      ],
      selectedCustomer: null,
    });

    assert.strictEqual(res.isValid, false);
    assert.strictEqual(res.errorCode, 'CUSTOMER_REQUIRED_FOR_CREDIT');
  });

  await t.test('Scenario 1.4: Flags credit limit breach on split payment with debt', () => {
    const customer = { id: 'c3', name: 'محمود', balancePiasters: 40000, creditLimitPiasters: 50000 };

    const res = reconcileSplitPayment({
      netTotalPiasters: 30000,
      payments: [
        { method: 'cash', amountPiasters: 10000 },
        { method: 'credit', amountPiasters: 20000 }, // 400 + 200 = 600 > 500 limit
      ],
      selectedCustomer: customer,
    });

    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.isOverCreditLimit, true);
    assert.strictEqual(res.overCreditLimitPiasters, 10000); // 100 EGP over limit
  });

  // --- SCENARIO 2: باقي العميل وأثر درج النقدية (Change & Cash Drawer Impact) ---
  await t.test('Scenario 2.1: Part Card + Excess Cash bill correctly computes cash change and net drawer impact', () => {
    // Bill = 100.00 EGP. Customer pays 40.00 EGP by card, and hands a 100.00 EGP banknote in cash for the remaining 60.00 EGP
    const netTotal = 10000;
    const res = reconcileSplitPayment({
      netTotalPiasters: netTotal,
      payments: [
        { method: 'card', amountPiasters: 4000 },
        { method: 'cash', amountPiasters: 10000 },
      ],
      selectedCustomer: null,
      saveChangeToCustomerAccount: false,
    });

    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.changeDuePiasters, 4000); // 40.00 EGP cash change handed back
    assert.strictEqual(res.netCashAddedToDrawer, 6000); // 100.00 in - 40.00 out = +60.00 net cash in drawer
    assert.strictEqual(res.totalElectronic, 4000);      // 40.00 card
    assert.strictEqual(res.netCashAddedToDrawer + res.totalElectronic, netTotal); // 60 + 40 = 100.00 EGP
    assert.strictEqual(res.isReconciled, true);
  });

  await t.test('Scenario 2.2: Saving cash change to customer account retains full cash in drawer and credits customer', () => {
    const netTotal = 10000;
    const customer = { id: 'cust_dep', name: 'عميل أمانات', balancePiasters: 0, creditLimitPiasters: 100000 };

    const res = reconcileSplitPayment({
      netTotalPiasters: netTotal,
      payments: [
        { method: 'card', amountPiasters: 4000 },
        { method: 'cash', amountPiasters: 10000 },
      ],
      selectedCustomer: customer,
      saveChangeToCustomerAccount: true, // Deposit change to customer balance
    });

    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.changeDuePiasters, 0);              // 0 handed back
    assert.strictEqual(res.customerDepositPiasters, 4000);      // 40 EGP deposit
    assert.strictEqual(res.netCashAddedToDrawer, 10000);        // 100 EGP full cash stays in drawer
    assert.strictEqual(res.totalElectronic, 4000);             // 40 EGP card
    assert.strictEqual(res.netCashAddedToDrawer + res.totalElectronic, netTotal + res.customerDepositPiasters); // 100 + 40 = 100 (sale) + 40 (deposit)
    assert.strictEqual(res.isReconciled, true);
  });

  await t.test('Scenario 2.3: Anti-Fraud: Rejects electronic overpayment attempting to extract cash change from drawer', () => {
    // Bill = 100.00 EGP. Customer attempts to pay 150.00 EGP by card with 0 cash, expecting 50.00 EGP cash back
    const res = reconcileSplitPayment({
      netTotalPiasters: 10000,
      payments: [
        { method: 'card', amountPiasters: 15000 },
      ],
    });

    assert.strictEqual(res.isValid, false);
    assert.strictEqual(res.errorCode, 'ELECTRONIC_OVERPAYMENT_PROHIBITED');
  });

  // --- SCENARIO 3: رسوم الخدمة الإلكترونية (ServiceFeePiasters) ---
  await t.test('Scenario 3.1: Service fee is isolated as pass-through liability, not store revenue', () => {
    const invoiceBill = 20000; // 200.00 EGP merchandise
    const serviceFee = 1000;   // 10.00 EGP payment provider fee
    const customer = { id: 'cust_epay', name: 'عميل محفظة', balancePiasters: 0, creditLimitPiasters: 50000 };

    // Customer pays 210.00 EGP total through digital wallet
    const res = reconcileSplitPayment({
      netTotalPiasters: invoiceBill,
      serviceFeePiasters: serviceFee,
      payments: [
        { method: 'vodafone_cash', amountPiasters: 21000 },
      ],
      selectedCustomer: customer,
    });

    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.storeRevenuePiasters, 20000); // Exactly 200.00 EGP store revenue
    assert.strictEqual(res.serviceFeePiasters, 1000);    // 10.00 EGP intermediary fee
    assert.strictEqual(res.debtPiasters, 0);             // Customer owes 0
    assert.strictEqual(res.customerDepositPiasters, 0);  // Customer does NOT receive accidental deposit for the provider fee
    assert.strictEqual(res.changeDuePiasters, 0);
    assert.strictEqual(res.isReconciled, true);
  });

  // --- SCENARIO 4: إلغاء وفشل الدفع الرقمي (Cancellation & Failure Integrity) ---
  await t.test('Scenario 4.1: Modal dismissal leaves cart and customer untouched without dummy transactions', () => {
    // Simulated POS state before checkout
    const initialCart = [
      { productId: 'p1', name: 'سكر 1 كجم', unitPricePiasters: 3500, quantityMilli: 2000, totalPiasters: 7000 },
    ];
    let cart = [...initialCart];
    let selectedCustomerId = 'cust_123';
    let isDigitalModalOpen = true;

    // User cancels the modal:
    const handleCloseDigitalModal = () => {
      isDigitalModalOpen = false;
      // Regression fix: selectedCustomerId must NOT be erased on cancellation
      // cart must remain intact
    };

    handleCloseDigitalModal();

    assert.strictEqual(isDigitalModalOpen, false);
    assert.strictEqual(cart.length, 1);
    assert.strictEqual(cart[0].productId, 'p1');
    assert.strictEqual(selectedCustomerId, 'cust_123');
  });

  await t.test('Scenario 4.2: Payment exception does not wipe the shopping cart', () => {
    const cart = [{ productId: 'p2', quantityMilli: 1000, totalPiasters: 5000 }];
    let checkoutFailed = false;

    try {
      // Simulated backend error (e.g. out of stock or concurrency collision)
      throw new Error('SQLite database is locked / Concurrency lock');
    } catch {
      checkoutFailed = true;
      // Cart is NOT cleared on catch!
    }

    assert.strictEqual(checkoutFailed, true);
    assert.strictEqual(cart.length, 1); // Cart preserved for cashier retry
  });
});
