import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Feature #43: Customer Printable Statement & Period Reconciliation (Story 69 / Tasks 43-1 to 43-3)
 * Invariants tested:
 * 1. Historical opening balance calculation: transactions before startDate establish the opening balance.
 * 2. Period debits and credits: transactions within the window are correctly segmented.
 * 3. Closing balance reconciliation: closingBalance === openingBalance + periodDebits - periodCredits.
 * 4. Print layout configuration: supports both Thermal (80mm / 320px) and Standard (A4) modes.
 * 5. Full financial integrity: all arithmetic operates strictly in integer piasters.
 * 6. Empty date filter: defaults gracefully to include entire historical statement.
 */

function generateCustomerStatementReport({
  customer,
  ledger,
  startDate = '',
  endDate = '',
}) {
  if (!customer || !customer.id) {
    throw new Error('العميل مطلوب لإنشاء كشف الحساب');
  }

  let runningOpening = 0;
  let periodDebits = 0;
  let periodCredits = 0;
  const filteredEntries = [];

  // Sort ascending by creation date
  const sorted = [...ledger].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  for (const entry of sorted) {
    const d = (entry.createdAt || '').slice(0, 10);
    const t = (entry.type || '').toLowerCase();
    const isDebit = (t === 'sale' || t === 'opening_balance' || t === 'debt_increase' || t === 'payment_cancel');
    const isCredit = (t === 'payment' || t === 'refund' || t === 'cancellation' || t === 'debt_decrease');

    // Prior to period
    if (startDate && d < startDate) {
      if (isDebit) runningOpening += entry.amountPiasters;
      else if (isCredit) runningOpening -= entry.amountPiasters;
      continue;
    }

    // After period
    if (endDate && d > endDate) {
      continue;
    }

    if (isDebit) periodDebits += entry.amountPiasters;
    else if (isCredit) periodCredits += entry.amountPiasters;

    filteredEntries.push(entry);
  }

  const closingBalance = runningOpening + periodDebits - periodCredits;

  return {
    customerId: customer.id,
    customerName: customer.name,
    customerPhone: customer.phone || '',
    startDate: startDate || '',
    endDate: endDate || '',
    openingBalancePiasters: runningOpening,
    periodDebitsPiasters: periodDebits,
    periodCreditsPiasters: periodCredits,
    closingBalancePiasters: closingBalance,
    entries: filteredEntries,
    entriesCount: filteredEntries.length,
  };
}

function getPrintLayoutConfig(mode) {
  if (mode === 'thermal') {
    return {
      mode: 'thermal',
      paperWidthMm: 80,
      containerWidthPx: 320,
      hasSignatures: true,
      headerStyle: 'compact',
    };
  } else if (mode === 'a4') {
    return {
      mode: 'a4',
      paperWidthMm: 210,
      containerWidthPx: '100%',
      hasSignatures: true,
      headerStyle: 'standard',
    };
  }
  throw new Error(`نمط الطباعة غير مدعوم: ${mode}`);
}

test('Feature #43: Customer Printable Statement (Story 69 / Tasks 43-1 to 43-3)', async (t) => {
  const demoCustomer = { id: 'cust_10', name: 'الحاج رضوان', phone: '01099887766' };
  const demoLedger = [
    {
      id: 'e1',
      customerId: 'cust_10',
      type: 'opening_balance',
      amountPiasters: 10000, // 100.00 EGP
      balanceAfterPiasters: 10000,
      createdAt: '2026-08-01T10:00:00Z',
    },
    {
      id: 'e2',
      customerId: 'cust_10',
      type: 'sale',
      amountPiasters: 25000, // 250.00 EGP
      balanceAfterPiasters: 35000,
      createdAt: '2026-08-15T12:00:00Z',
    },
    {
      id: 'e3',
      customerId: 'cust_10',
      type: 'payment',
      amountPiasters: 15000, // 150.00 EGP
      balanceAfterPiasters: 20000,
      createdAt: '2026-08-25T14:00:00Z',
    },
    // September transactions
    {
      id: 'e4',
      customerId: 'cust_10',
      type: 'sale',
      amountPiasters: 40000, // 400.00 EGP
      balanceAfterPiasters: 60000,
      createdAt: '2026-09-05T09:00:00Z',
    },
    {
      id: 'e5',
      customerId: 'cust_10',
      type: 'payment',
      amountPiasters: 30000, // 300.00 EGP
      balanceAfterPiasters: 30000,
      createdAt: '2026-09-12T16:00:00Z',
    },
    {
      id: 'e6',
      customerId: 'cust_10',
      type: 'payment_cancel',
      saleId: 'e5',
      amountPiasters: 30000, // Reverses payment e5 (+300.00 EGP)
      balanceAfterPiasters: 60000,
      createdAt: '2026-09-13T11:00:00Z',
    },
  ];

  await t.test('1. Accurately calculates opening balance prior to specified start date', () => {
    // Filter for September only: 2026-09-01 to 2026-09-30
    const report = generateCustomerStatementReport({
      customer: demoCustomer,
      ledger: demoLedger,
      startDate: '2026-09-01',
      endDate: '2026-09-30',
    });

    // Opening balance before Sep 1 is August balance: 10000 + 25000 - 15000 = 20000 piasters (200.00 EGP)
    assert.equal(report.openingBalancePiasters, 20000);
    assert.equal(report.entriesCount, 3); // e4, e5, e6
  });

  await t.test('2. Reconciles period debits, credits, and closing balance with contra entries', () => {
    const report = generateCustomerStatementReport({
      customer: demoCustomer,
      ledger: demoLedger,
      startDate: '2026-09-01',
      endDate: '2026-09-30',
    });

    // Debits in Sep: e4 (sale: 40000) + e6 (contra entry: 30000) = 70000 piasters
    assert.equal(report.periodDebitsPiasters, 70000);
    // Credits in Sep: e5 (payment: 30000)
    assert.equal(report.periodCreditsPiasters, 30000);

    // Closing balance = Opening (20000) + Debits (70000) - Credits (30000) = 60000 piasters (600.00 EGP)
    assert.equal(report.closingBalancePiasters, 60000);
    assert.equal(
      report.closingBalancePiasters,
      report.openingBalancePiasters + report.periodDebitsPiasters - report.periodCreditsPiasters
    );
  });

  await t.test('3. Full historical query when dates are left blank', () => {
    const report = generateCustomerStatementReport({
      customer: demoCustomer,
      ledger: demoLedger,
    });

    assert.equal(report.openingBalancePiasters, 0);
    assert.equal(report.entriesCount, 6);
    assert.equal(report.closingBalancePiasters, 60000);
  });

  await t.test('4. Thermal 80mm and A4 print layout configurations meet retail invariants', () => {
    const thermal = getPrintLayoutConfig('thermal');
    assert.equal(thermal.paperWidthMm, 80);
    assert.equal(thermal.containerWidthPx, 320);
    assert.equal(thermal.hasSignatures, true);

    const a4 = getPrintLayoutConfig('a4');
    assert.equal(a4.paperWidthMm, 210);
    assert.equal(a4.hasSignatures, true);

    assert.throws(() => getPrintLayoutConfig('unsupported_size'), /نمط الطباعة غير مدعوم/);
  });

  await t.test('5. Validates customer requirements and preserves integer money', () => {
    assert.throws(
      () => generateCustomerStatementReport({ customer: null, ledger: [] }),
      /العميل مطلوب لإنشاء كشف الحساب/
    );

    const report = generateCustomerStatementReport({
      customer: demoCustomer,
      ledger: demoLedger,
    });

    assert.ok(Number.isInteger(report.openingBalancePiasters));
    assert.ok(Number.isInteger(report.periodDebitsPiasters));
    assert.ok(Number.isInteger(report.periodCreditsPiasters));
    assert.ok(Number.isInteger(report.closingBalancePiasters));
    assert.equal(report.customerName, 'الحاج رضوان');
  });
});
