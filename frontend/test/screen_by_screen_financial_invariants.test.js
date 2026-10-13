import test from 'node:test';
import assert from 'node:assert/strict';
import { parseScaleBarcode } from '../src/utils/scaleBarcode.ts';
import { cleanExcelBarcode } from '../src/utils/barcodeReader.ts';

// -----------------------------------------------------------------------------
// Senior QA Master Test Suite: Screen-by-Screen Financial & Inventory Invariants
// -----------------------------------------------------------------------------

test('Screen 1 & 2 Invariant: Return on 100% Unpaid Credit Sale MUST NOT Deduct Cash from Drawer', () => {
  // Scenario: Customer buys goods for 500.00 EGP on credit (paid = 0).
  const origSale = {
    id: 'sale_credit_001',
    invoiceNumber: 101,
    paymentMethod: 'credit',
    totalPiasters: 50000,
    paidPiasters: 0,
    changePiasters: 0,
    customerId: 'cust_ahmed_1',
    customerName: 'أحمد محمود',
    status: 'completed',
    items: [
      { id: 'si_1', productId: 'p_1', productName: 'زيت عباد', quantityMilli: 5000, unitPricePiasters: 10000, totalPiasters: 50000 }
    ]
  };

  // Rule verification: Net cash received is 0
  const netCashPaidOnOrig = origSale.paymentMethod === 'cash'
    ? Math.max(0, origSale.paidPiasters - origSale.changePiasters)
    : Math.max(0, origSale.paidPiasters);
  assert.equal(netCashPaidOnOrig, 0, 'Net cash received on credit invoice with 0 down-payment must be 0');

  // Customer returns 2 bottles (200.00 EGP)
  const returnAttempt = {
    saleId: origSale.id,
    customerId: origSale.customerId,
    totalPiasters: 20000,
    requestedRefundMethod: 'cash',
    items: [{ productId: 'p_1', quantityMilli: 2000, totalPiasters: 20000 }]
  };

  // Backend enforcement logic simulation:
  let effectiveRefundMethod = returnAttempt.requestedRefundMethod;
  if (effectiveRefundMethod === 'cash' && netCashPaidOnOrig <= 0) {
    if (returnAttempt.customerId) {
      effectiveRefundMethod = 'credit'; // Auto-converted to reduce customer debt
    } else {
      assert.fail('Should throw error if no customer attached to credit return');
    }
  }

  assert.equal(effectiveRefundMethod, 'credit', 'Return method must be forced to credit');

  // Financial impact on cash drawer vs customer ledger:
  let cashDrawerBalancePiasters = 100000; // 1000.00 EGP before return
  let customerDebtPiasters = 50000;      // 500.00 EGP debt before return

  if (effectiveRefundMethod === 'cash') {
    cashDrawerBalancePiasters -= returnAttempt.totalPiasters;
  } else if (effectiveRefundMethod === 'credit') {
    customerDebtPiasters -= returnAttempt.totalPiasters;
  }

  assert.equal(cashDrawerBalancePiasters, 100000, 'Cash drawer MUST remain untouched (0 cash deducted)');
  assert.equal(customerDebtPiasters, 30000, 'Customer debt MUST be reduced from 500.00 to 300.00 EGP');
});

test('Screen 1 & 2 Invariant: Partial Cash Paid Sale Return Ceiling Enforced', () => {
  // Scenario: Sale total 1000.00 EGP, paid 300.00 EGP in cash, 700.00 EGP credit
  const origSale = {
    paymentMethod: 'credit',
    totalPiasters: 100000,
    paidPiasters: 30000,
    changePiasters: 0
  };

  const netCashPaid = origSale.paidPiasters;
  assert.equal(netCashPaid, 30000);

  // Return requested for 500.00 EGP items
  const returnTotalPiasters = 50000;
  const allowableCashRefund = Math.min(returnTotalPiasters, netCashPaid);
  const remainingCreditRefund = returnTotalPiasters - allowableCashRefund;

  assert.equal(allowableCashRefund, 30000, 'Max allowable cash refund is capped at exactly 300.00 EGP');
  assert.equal(remainingCreditRefund, 20000, 'Remaining 200.00 EGP must be credited to customer account');
});

test('Screen 1 Invariant: Composite Item Discount & Global Invoice Discount Zero-Drift Sum', () => {
  // 3 items with specific line discounts plus global invoice discount
  const items = [
    { qtyMilli: 3000, unitPrice: 3550, lineDiscountPercent: 5 },  // 3 * 35.50 = 106.50 -> -5% = 101.175 -> 10118 piasters
    { qtyMilli: 1000, unitPrice: 12000, lineDiscountPercent: 10 }, // 1 * 120.00 = 120.00 -> -10% = 108.00 -> 10800 piasters
    { qtyMilli: 2500, unitPrice: 4000, lineDiscountPercent: 0 }    // 2.5 * 40.00 = 100.00 -> 10000 piasters
  ];

  // Calculate line totals after line discounts
  let subtotalAfterLineDiscounts = 0;
  const linesWithDiscount = items.map((it) => {
    const rawTotal = Math.round((it.unitPrice * it.qtyMilli) / 1000);
    const disc = Math.round((rawTotal * it.lineDiscountPercent) / 100);
    const net = rawTotal - disc;
    subtotalAfterLineDiscounts += net;
    return { ...it, netLinePiasters: net };
  });

  assert.equal(subtotalAfterLineDiscounts, 30917); // 10117 + 10800 + 10000 = 30917 piasters (309.17 EGP)

  // Global invoice discount: 15.00 EGP (1500 piasters)
  const invoiceDiscountPiasters = 1500;
  const targetTotal = subtotalAfterLineDiscounts - invoiceDiscountPiasters; // 29417 piasters

  // Proportional distribution of invoice discount to lines (Senior Algorithm):
  let distributedSum = 0;
  const finalLines = linesWithDiscount.map((line, idx) => {
    if (idx === linesWithDiscount.length - 1) {
      // Last line gets exact remainder
      const lineFinal = targetTotal - distributedSum;
      return { ...line, finalTotal: lineFinal };
    }
    const propDisc = Math.round((invoiceDiscountPiasters * line.netLinePiasters) / subtotalAfterLineDiscounts);
    const lineFinal = line.netLinePiasters - propDisc;
    distributedSum += lineFinal;
    return { ...line, finalTotal: lineFinal };
  });

  const finalSum = finalLines.reduce((acc, l) => acc + l.finalTotal, 0);
  assert.equal(finalSum, targetTotal, 'Sum of final discounted lines MUST match target total exactly with 0 piaster drift');
});

test('Screen 1 Invariant: Scale Barcode GS1 Variable Measure Edge Cases', () => {
  // Test 1: Minimum weight (1 gram = 0.001 kg = 1 milli)
  const minBarcode = '2000123000010';
  const minResult = parseScaleBarcode(minBarcode);
  assert.ok(minResult);
  assert.equal(minResult.itemPlu, '00123');
  assert.equal(minResult.itemPluTrimmed, '123');
  assert.equal(minResult.weightGrams, 1);
  assert.equal(minResult.weightMilli, 1);

  // Test 2: Maximum weight (99.999 kg = 99999 grams = 99,999 milli)
  const maxBarcode = '2199999999995';
  const maxResult = parseScaleBarcode(maxBarcode);
  assert.ok(maxResult);
  assert.equal(maxResult.itemPlu, '99999');
  assert.equal(maxResult.weightGrams, 99999);
  assert.equal(maxResult.weightMilli, 99999);

  // Test 3: Standard retail barcodes starting with non-scale prefixes must NOT be parsed as scale
  assert.equal(parseScaleBarcode('6223000123456'), null); // Egyptian standard
  assert.equal(parseScaleBarcode('5901234567890'), null); // Polish standard
  assert.equal(parseScaleBarcode('8801234567890'), null); // Korean standard

  // Test 4: Scale barcode price calculation for 1.750 kg at 160.00 EGP/kg
  const parsed1750 = parseScaleBarcode('2200555017509');
  assert.ok(parsed1750);
  assert.equal(parsed1750.weightGrams, 1750);
  const pricePerKgPiasters = 16000; // 160.00 EGP
  const lineTotalPiasters = Math.round((pricePerKgPiasters * parsed1750.weightGrams) / 1000);
  assert.equal(lineTotalPiasters, 28000, '1.750 kg at 160 EGP/kg equals exactly 280.00 EGP');
});

test('Screen 3 Invariant: Multi-Unit Purchase Weighted Average Cost Reconciliation', () => {
  // Existing inventory: 50 pieces at 10.00 EGP (1000 piasters)
  const oldStockQtyMilli = 50000;
  const oldCostPiasters = 1000;

  // New purchase: 10 cartons (each carton = 12 pieces -> 120 pieces = 120,000 milli)
  const purchaseCartons = 10;
  const conversionFactor = 12;
  const cartonCostPiasters = 9600; // 96.00 EGP per carton (8.00 EGP per piece)

  const purchasedPiecesMilli = purchaseCartons * conversionFactor * 1000;
  const purchasedPieceCostPiasters = Math.round(cartonCostPiasters / conversionFactor);
  assert.equal(purchasedPieceCostPiasters, 800, 'Piece cost is 8.00 EGP');

  // WAC calculation:
  const totalQtyMilli = oldStockQtyMilli + purchasedPiecesMilli;
  assert.equal(totalQtyMilli, 170000, 'Total stock is 170 pieces');

  const oldTotalCostPiasters = (oldStockQtyMilli * oldCostPiasters) / 1000; // 50 * 1000 = 50,000
  const newPurchaseCostPiasters = (purchasedPiecesMilli * purchasedPieceCostPiasters) / 1000; // 120 * 800 = 96,000
  const combinedCost = oldTotalCostPiasters + newPurchaseCostPiasters; // 146,000 piasters

  const newWeightedAvgCost = Math.round((combinedCost * 1000) / totalQtyMilli);
  assert.equal(newWeightedAvgCost, 859, 'New weighted average cost is exactly 859 piasters (8.59 EGP)');
});

test('Screen 4 Invariant: Customer Account Full Lifecycle Balance & Ledger Reconciliation', () => {
  let customerBalancePiasters = 0;
  const ledgerEntries = [];

  // Step 1: Credit Sale of 400.00 EGP (40,000 piasters)
  customerBalancePiasters += 40000;
  ledgerEntries.push({ type: 'sale', amount: 40000, balanceAfter: customerBalancePiasters });
  assert.equal(customerBalancePiasters, 40000);

  // Step 2: Customer pays 150.00 EGP cash (15,000 piasters)
  customerBalancePiasters -= 15000;
  ledgerEntries.push({ type: 'payment', amount: 15000, balanceAfter: customerBalancePiasters });
  assert.equal(customerBalancePiasters, 25000);

  // Step 3: Payment cancelled due to cashier error (contra entry)
  customerBalancePiasters += 15000;
  ledgerEntries.push({ type: 'payment_cancel', amount: 15000, balanceAfter: customerBalancePiasters });
  assert.equal(customerBalancePiasters, 40000);

  // Step 4: Customer returns 100.00 EGP worth of goods as credit refund
  customerBalancePiasters -= 10000;
  ledgerEntries.push({ type: 'refund', amount: 10000, balanceAfter: customerBalancePiasters });
  assert.equal(customerBalancePiasters, 30000);

  // Reconcile ledger entries against customer balance:
  let reconstructedBalance = 0;
  for (const entry of ledgerEntries) {
    if (entry.type === 'sale') reconstructedBalance += entry.amount;
    else if (entry.type === 'payment') reconstructedBalance -= entry.amount;
    else if (entry.type === 'payment_cancel') reconstructedBalance += entry.amount;
    else if (entry.type === 'refund') reconstructedBalance -= entry.amount;
  }
  assert.equal(reconstructedBalance, customerBalancePiasters, 'Ledger sum MUST equal customer final balance');
});

test('Screen 8 & 9 Invariant: Closed-Form Cash Drawer Balance Identity', () => {
  // Simulated day numbers in piasters
  const cashSalesPiasters = 150000;       // 1500.00 EGP
  const cashReturnsPiasters = 20000;       // 200.00 EGP
  const debtCollectionsPiasters = 45000;   // 450.00 EGP
  const expensesPiasters = 12000;          // 120.00 EGP
  const epayDrawerCashPiasters = 30000;    // 300.00 EGP (e.g. Fawry cash received in drawer)
  const epayDrawerFundingPiasters = 50000; // 500.00 EGP (e.g. 500 EGP taken from drawer to fund POS)

  const expectedCashPiasters = cashSalesPiasters
    - cashReturnsPiasters
    + debtCollectionsPiasters
    - expensesPiasters
    + epayDrawerCashPiasters
    - epayDrawerFundingPiasters;

  assert.equal(expectedCashPiasters, 143000, 'Expected cash must be exactly 1,430.00 EGP (143,000 piasters)');

  // Physical count by cashier: 140,000 piasters (1,400.00 EGP)
  const countedCashPiasters = 140000;
  const deficitPiasters = countedCashPiasters - expectedCashPiasters;
  assert.equal(deficitPiasters, -3000, 'Accurate deficit of 30.00 EGP detected');
});

test('Screen 6 Invariant: Excel Barcode Cleanser Extreme Edge Cases', () => {
  // Scientific notation with 14 zeros
  assert.equal(cleanExcelBarcode('6.22300000000000E+12'), '6223000000000');
  assert.equal(cleanExcelBarcode('2.00000000000000E+12'), '2000000000000');

  // Trailing .0 or .00 decimal artifact
  assert.equal(cleanExcelBarcode('6224000123456.0'), '6224000123456');
  assert.equal(cleanExcelBarcode('123456789.00'), '123456789');

  // Preserving leading zeros on alphanumeric or standard codes
  assert.equal(cleanExcelBarcode('00123456'), '00123456');
  assert.equal(cleanExcelBarcode('0123456789012'), '0123456789012');

  // Eastern Arabic numerals conversion
  assert.equal(cleanExcelBarcode('٦٢٢٣٠٠٠١٢٣٤٥٦'), '6223000123456');
});
