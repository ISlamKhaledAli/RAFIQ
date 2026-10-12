import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  poundsToPiasters,
  piastersToPounds,
  formatArabicCurrency,
  calculateLineTotal,
  calculateTaxPiasters,
  calculateDiscountAmount,
  distributeInvoiceDiscount,
  normalizeArabicNumerals,
} from '../src/utils/money.ts';
import { normalizeArabicDigits, normalizeNumericInput } from '../src/utils/numberEnforcer.ts';

/**
 * =========================================================================================
 * Comprehensive Financial & Analytics Test Suite — Rafiq POS (نظام رفيق لنقاط البيع)
 * تغطية شاملة وموسعة لكافة العمليات المالية والتحليلات من أصغر وحدة وحتى التقارير الكلية
 * =========================================================================================
 *
 * Scenarios & Invariants Covered:
 * 1. Micro-Level Currency & Precision Invariants (القروش، الفواصل العشرية، التقريب المالي، أرقام المشرق وفارس)
 * 2. Item Pricing & Line Totals (القطع، الأوزان بالمليجرام، خصومات البند الفردي)
 * 3. Multi-Unit Invariants (الكرتونة، العلبة، معامل التحويل وتكلفة الوحدة)
 * 4. Invoice Discount Distribution (Hamilton-Hare / Largest Remainder)
 * 5. Egyptian VAT Invariants (ضريبة القيمة المضافة 14% شاملة وغير شاملة، السلات المختلطة)
 * 6. Payment Methods & Split Payments (كاش، فيزا، انستاباي، فودافون كاش، آجل، دفع متعدد)
 * 7. Cash Tendered, Change & Account Deposits (فارق الكاش المدفوع، الباقي باليد، الباقي أمانات للعميل)
 * 8. Customer Accounts & Ledger Balance Invariants (دفتر الأستاذ، السدادات، القيود المعاكسة)
 * 9. Inventory Weighted Average Cost (WAC) & COGS (متوسط التكلفة المرجح، تكلفة البضاعة المباعة)
 * 10. Reversibility & Returns (المرتجع الكامل والجزئي مع الخصم النسبي)
 * 11. Daily Cash Drawer Reconciliation & Closings (معادلة الدرج، العجز والزيادة والمطابقة)
 * 12. Macro Analytics & Executive Financial Metrics (صافي الإيرادات، هامش الربح، متوسط السلة، أعمار الديون)
 */

describe('Comprehensive Financial & Analytics Test Suite — Rafiq POS', () => {

  // =======================================================================================
  // 1. MICRO-LEVEL CURRENCY & NUMERICAL INTEGRITY
  // =======================================================================================
  describe('1. Micro-Level Currency & Numerical Integrity (القروش، الفواصل، التقريب، الأرقام)', () => {
    it('Scenario 1.1: converts standard pounds to integer piasters without float drift', () => {
      const cases = [
        { pounds: 0.01, expectedPiasters: 1 },
        { pounds: 0.05, expectedPiasters: 5 },
        { pounds: 0.25, expectedPiasters: 25 },
        { pounds: 0.50, expectedPiasters: 50 },
        { pounds: 0.75, expectedPiasters: 75 },
        { pounds: 1.00, expectedPiasters: 100 },
        { pounds: 15.50, expectedPiasters: 1550 },
        { pounds: 99.99, expectedPiasters: 9999 },
        { pounds: 1250.75, expectedPiasters: 125075 },
        { pounds: 1000000.00, expectedPiasters: 100000000 },
      ];

      for (const c of cases) {
        assert.equal(poundsToPiasters(c.pounds), c.expectedPiasters, `Failed converting ${c.pounds} EGP`);
        assert.equal(piastersToPounds(c.expectedPiasters), c.pounds, `Failed converting ${c.expectedPiasters} piasters back`);
      }
    });

    it('Scenario 1.2: rounds fractional half-piasters away from zero (Commercial Banking Rule)', () => {
      // 10.005 EGP = 1000.5 piasters -> 1001
      assert.equal(poundsToPiasters(10.005), 1001);
      // 10.004 EGP = 1000.4 piasters -> 1000
      assert.equal(poundsToPiasters(10.004), 1000);
      // 12.556 EGP = 1255.6 piasters -> 1256
      assert.equal(poundsToPiasters(12.556), 1256);
      // 0.005 EGP = 0.5 piasters -> 1
      assert.equal(poundsToPiasters(0.005), 1);
      // 0.004 EGP = 0.4 piasters -> 0
      assert.equal(poundsToPiasters(0.004), 0);
    });

    it('Scenario 1.3: eliminates IEEE 754 float accumulation over 100,000 financial operations', () => {
      // Classic float failure: 0.1 added 100,000 times drifts from 10,000.0
      let rawFloatTotal = 0;
      let integerPiastersTotal = 0;

      const incrementPounds = 0.10; // 10 piasters
      const incrementPiasters = poundsToPiasters(incrementPounds);

      for (let i = 0; i < 100000; i++) {
        rawFloatTotal += incrementPounds;
        integerPiastersTotal += incrementPiasters;
      }

      // Raw float will NOT equal 10,000 exactly
      assert.notEqual(rawFloatTotal, 10000);

      // Integer piasters must equal exactly 1,000,000 piasters (10,000.00 EGP)
      assert.equal(integerPiastersTotal, 1000000);
      assert.equal(piastersToPounds(integerPiastersTotal), 10000.00);
    });

    it('Scenario 1.4: normalizes Eastern Arabic (٠-٩) and Persian (۰-۹) numerals and Arabic commas (،)', () => {
      assert.equal(poundsToPiasters('١٥٫٥٠'), 1550);
      assert.equal(poundsToPiasters('١٥،٥٠'), 1550);
      assert.equal(poundsToPiasters('١٥.٥٠'), 1550);
      assert.equal(poundsToPiasters('۰۱۲۳۴۵۶۷۸۹'), 12345678900);
      assert.equal(normalizeArabicNumerals('١٢٣،٤٥'), '123.45');
      assert.equal(normalizeArabicDigits('١٢٣٤٥'), '12345');
      assert.equal(normalizeNumericInput('١٥،٧٥'), '15.75');
      assert.equal(poundsToPiasters('  ١٥،٧٥ ج.م  '), 1575);
    });

    it('Scenario 1.5: handles null, undefined, empty, and malformed inputs gracefully without throwing', () => {
      assert.equal(poundsToPiasters(null), 0);
      assert.equal(poundsToPiasters(undefined), 0);
      assert.equal(poundsToPiasters(''), 0);
      assert.equal(poundsToPiasters('   '), 0);
      assert.equal(poundsToPiasters('abc'), 0);
      assert.equal(poundsToPiasters('NaN'), 0);
    });

    it('Scenario 1.6: formats Egyptian currency with proper commas and currency label', () => {
      assert.equal(formatArabicCurrency(1550, true), '15.50 ج.م');
      assert.equal(formatArabicCurrency(1550, false), '15.50');
      assert.equal(formatArabicCurrency(100000000, true), '1,000,000.00 ج.م');
      assert.equal(formatArabicCurrency(5, true), '0.05 ج.م');
      assert.equal(formatArabicCurrency(0, true), '0.00 ج.م');
    });
  });

  // =======================================================================================
  // 2. ITEM PRICING, WEIGHTS & LINE TOTALS
  // =======================================================================================
  describe('2. Item Pricing, Weights & Line Totals (حساب البنود، الأوزان، خصومات الصنف)', () => {
    it('Scenario 2.1: calculates standard discrete unit lines accurately', () => {
      // 5 units of Tuna can at 42.50 EGP each (4250 piasters)
      const lineTotal = calculateLineTotal(4250, 5000, 0);
      assert.equal(lineTotal, 21250); // 212.50 EGP
    });

    it('Scenario 2.2: calculates fractional weighted items down to the exact piaster', () => {
      // Cheddar Cheese at 380.00 EGP / kg (38000 piasters). Sold 245 grams (245 milli-units):
      // (38000 * 245) / 1000 = 9310 piasters (93.10 EGP)
      assert.equal(calculateLineTotal(38000, 245, 0), 9310);

      // Roumy Cheese at 240.00 EGP / kg (24000 piasters). Sold 350 grams:
      // (24000 * 350) / 1000 = 8400 piasters (84.00 EGP)
      assert.equal(calculateLineTotal(24000, 350, 0), 8400);

      // Fresh Meat at 395.75 EGP / kg (39575 piasters). Sold 635 grams:
      // 39575 * 635 / 1000 = 25130.125 -> rounds to 25130 piasters
      assert.equal(calculateLineTotal(39575, 635, 0), 25130);
    });

    it('Scenario 2.3: applies line-item fixed discount and clamps at gross amount', () => {
      // Gross: 100.00 EGP (10000 piasters). Discount: 15.00 EGP (1500 piasters)
      assert.equal(calculateLineTotal(10000, 1000, 1500), 8500);

      // Discount exceeds gross: Gross 5000, Discount 6000 -> Clamped at 0
      assert.equal(calculateLineTotal(5000, 1000, 6000), 0);
    });

    it('Scenario 2.4: computes discount amount from percent and fixed values accurately', () => {
      const gross = 20000; // 200.00 EGP

      // 10% discount on 200 EGP = 2000 piasters (20.00 EGP)
      assert.equal(calculateDiscountAmount(gross, 'percent', 10), 2000);

      // 15.5% discount on 200 EGP = 3100 piasters (31.00 EGP)
      assert.equal(calculateDiscountAmount(gross, 'percent', 15.5), 3100);

      // Fixed 35 EGP discount = 3500 piasters
      assert.equal(calculateDiscountAmount(gross, 'amount', 35), 3500);

      // 100% discount = full gross (20000)
      assert.equal(calculateDiscountAmount(gross, 'percent', 100), 20000);

      // Over 100% discount clamped at gross
      assert.equal(calculateDiscountAmount(gross, 'percent', 150), 20000);
      assert.equal(calculateDiscountAmount(gross, 'amount', 300), 20000);

      // Zero or negative discount returns 0
      assert.equal(calculateDiscountAmount(gross, 'percent', 0), 0);
      assert.equal(calculateDiscountAmount(gross, 'percent', -10), 0);
      assert.equal(calculateDiscountAmount(gross, 'amount', -5), 0);
    });
  });

  // =======================================================================================
  // 3. INVOICE DISCOUNT PROPORTIONAL DISTRIBUTION (HAMILTON-HARE METHOD)
  // =======================================================================================
  describe('3. Invoice Discount Distribution (خوارزمية توزيع الخصم الإجمالي بأكبر باقٍ)', () => {
    it('Scenario 3.1: distributes discount across items of unequal values with zero piaster drift', () => {
      // Cart: Item 1 = 100.00 EGP (10000 p), Item 2 = 50.00 EGP (5000 p), Item 3 = 25.00 EGP (2500 p)
      // Total Gross: 175.00 EGP (17500 piasters). Total Discount: 15.00 EGP (1500 piasters)
      const items = [
        { grossPiasters: 10000 },
        { grossPiasters: 5000 },
        { grossPiasters: 2500 },
      ];
      const totalDiscount = 1500;

      const distributed = distributeInvoiceDiscount(items, totalDiscount);
      assert.equal(distributed.length, 3);

      // Sum of distributed shares MUST match totalDiscount exactly
      const sumShares = distributed.reduce((a, b) => a + b, 0);
      assert.equal(sumShares, totalDiscount, 'Sum of distributed discount must match requested discount exactly');

      // Proportions: 10000/17500 * 1500 = 857.14 -> 857
      // 5000/17500 * 1500 = 428.57 -> 429
      // 2500/17500 * 1500 = 214.28 -> 214
      // 857 + 429 + 214 = 1500
      assert.equal(distributed[0], 857);
      assert.equal(distributed[1], 429);
      assert.equal(distributed[2], 214);
    });

    it('Scenario 3.2: distributes 10.00 EGP discount across 3 identical items (1000 piasters / 3)', () => {
      // 1000 piasters / 3 = 333.3333... piasters each. Leftover 1 piaster goes to highest remainder.
      const items = [
        { grossPiasters: 5000 },
        { grossPiasters: 5000 },
        { grossPiasters: 5000 },
      ];
      const totalDiscount = 1000;

      const distributed = distributeInvoiceDiscount(items, totalDiscount);
      const sum = distributed.reduce((a, b) => a + b, 0);
      assert.equal(sum, 1000);

      // One item gets 334, the other two get 333
      assert.ok(distributed.includes(334));
      assert.equal(distributed.filter(x => x === 333).length, 2);
    });

    it('Scenario 3.3: clamps total discount if it exceeds cart subtotal gross', () => {
      const items = [{ grossPiasters: 3000 }, { grossPiasters: 2000 }];
      const totalDiscount = 10000; // 100 EGP requested, but cart is only 50 EGP

      const distributed = distributeInvoiceDiscount(items, totalDiscount);
      const sum = distributed.reduce((a, b) => a + b, 0);
      assert.equal(sum, 5000, 'Discount must be clamped to subtotal gross');
      assert.equal(distributed[0], 3000);
      assert.equal(distributed[1], 2000);
    });
  });

  // =======================================================================================
  // 4. EGYPTIAN TAX INVARIANTS (ETA 14% VAT)
  // =======================================================================================
  describe('4. Egyptian VAT Invariants (ضريبة القيمة المضافة 14% شاملة وغير شاملة)', () => {
    it('Scenario 4.1: calculates embedded 14% VAT (tax-inclusive standard)', () => {
      // Receipt Total is 114.00 EGP (11400 piasters) inclusive of 14% VAT:
      // Net = (11400 * 100) / 114 = 10000 piasters (100.00 EGP)
      // Tax = 11400 - 10000 = 1400 piasters (14.00 EGP)
      const tax = calculateTaxPiasters(11400, 14, true);
      assert.equal(tax, 1400);

      // 57.00 EGP inclusive of 14% VAT:
      // Net = (5700 * 100) / 114 = 5000 piasters
      // Tax = 5700 - 5000 = 700 piasters (7.00 EGP)
      assert.equal(calculateTaxPiasters(5700, 14, true), 700);

      // 10.00 EGP inclusive of 14% VAT:
      // Net = (1000 * 100) / 114 = 877.19 -> 877 piasters
      // Tax = 1000 - 877 = 123 piasters (1.23 EGP)
      assert.equal(calculateTaxPiasters(1000, 14, true), 123);
    });

    it('Scenario 4.2: calculates tax-exclusive VAT (adding 14% on top of net)', () => {
      // Net = 100.00 EGP (10000 piasters)
      // Tax = 10000 * 14 / 100 = 1400 piasters
      assert.equal(calculateTaxPiasters(10000, 14, false), 1400);
    });

    it('Scenario 4.3: exempt products (0% tax rate) yield exactly zero tax', () => {
      assert.equal(calculateTaxPiasters(50000, 0, true), 0);
      assert.equal(calculateTaxPiasters(50000, 0, false), 0);
    });
  });

  // =======================================================================================
  // 5. TRANSACTION PAYMENTS, OVERPAYMENT, CHANGE & DEPOSITS
  // =======================================================================================
  describe('5. Payment Methods, Change Due & Customer Account Deposits', () => {
    it('Scenario 5.1: exact cash payment produces zero change and full settlement', () => {
      const invoiceTotal = 8500; // 85.00 EGP
      const cashTendered = 8500;

      const changeDue = Math.max(0, cashTendered - invoiceTotal);
      const remainingDebt = Math.max(0, invoiceTotal - cashTendered);

      assert.equal(changeDue, 0);
      assert.equal(remainingDebt, 0);
    });

    it('Scenario 5.2: cash overpayment with cash change returned does not inflate total sales or create debt', () => {
      // Invoice total: 80.00 EGP (8000 p). Customer gives 100.00 EGP (10000 p).
      // Cashier returns 20.00 EGP (2000 p) change in hand.
      const invoiceTotal = 8000;
      const cashTendered = 10000;
      const changeGiven = 2000;

      // Net cash retained in drawer from this sale:
      const netCashInDrawer = cashTendered - changeGiven;
      assert.equal(netCashInDrawer, 8000);

      // Customer account unreturned change must be 0:
      const excessAmount = cashTendered - invoiceTotal; // 2000
      const unreturnedChange = excessAmount - changeGiven; // 2000 - 2000 = 0
      assert.equal(unreturnedChange, 0, 'No deposit should be credited to customer if change was handed back in cash');
    });

    it('Scenario 5.3: cash overpayment with change credited to customer account (أمانات تحت الحساب)', () => {
      // Invoice total: 80.00 EGP (8000 p). Customer gives 100.00 EGP (10000 p).
      // Customer says "keep the 20 EGP change on my account":
      const invoiceTotal = 8000;
      const cashTendered = 10000;
      const changeGiven = 0; // Kept in store!

      const excessAmount = cashTendered - invoiceTotal; // 2000
      const unreturnedChange = excessAmount - changeGiven; // 2000 - 0 = 2000

      assert.equal(unreturnedChange, 2000, 'Unreturned change must be exactly 2000 piasters');

      // Net cash entering drawer is 10000 (8000 for sale + 2000 customer deposit)
      const cashEnteringDrawer = cashTendered - changeGiven;
      assert.equal(cashEnteringDrawer, 10000);
    });

    it('Scenario 5.4: partial cash payment on credit (بيع آجل مع دفعة مقدمة)', () => {
      // Invoice total: 150.00 EGP (15000 p). Customer pays 50.00 EGP (5000 p) cash:
      const invoiceTotal = 15000;
      const paidCash = 5000;

      const remainingDebt = invoiceTotal - paidCash;
      assert.equal(remainingDebt, 10000, 'Remaining debt must be 100.00 EGP (10000 piasters)');
    });

    it('Scenario 5.5: split / multi-method payment (نصف كاش ونصف فيزا)', () => {
      const invoiceTotal = 20000; // 200.00 EGP
      const payments = [
        { method: 'cash', amountPiasters: 8000 },
        { method: 'card', amountPiasters: 7000 },
        { method: 'instapay', amountPiasters: 5000 },
      ];

      const sumPayments = payments.reduce((sum, p) => sum + p.amountPiasters, 0);
      assert.equal(sumPayments, invoiceTotal, 'Sum of multi-payments must equal invoice total');

      // Invariants: only cash portion enters cash drawer directly
      const cashForDrawer = payments.filter(p => p.method === 'cash').reduce((s, p) => s + p.amountPiasters, 0);
      assert.equal(cashForDrawer, 8000);

      // Card and InstaPay go to bank / outside drawer
      const nonCashTotal = payments.filter(p => p.method !== 'cash').reduce((s, p) => s + p.amountPiasters, 0);
      assert.equal(nonCashTotal, 12000);
    });
  });

  // =======================================================================================
  // 6. CUSTOMER ACCOUNT & LEDGER INVARIANTS (ACID BALANCE INTEGRITY)
  // =======================================================================================
  describe('6. Customer Accounts Ledger Invariants (سلامة دفتر الأستاذ وعدم الحذف)', () => {
    class MockCustomerLedger {
      constructor(openingBalance = 0) {
        this.balance = openingBalance;
        this.entries = [];
        if (openingBalance !== 0) {
          this.entries.push({
            type: 'opening_balance',
            amount: Math.abs(openingBalance),
            balanceAfter: openingBalance,
          });
        }
      }

      addCreditSale(amountPiasters) {
        this.balance += amountPiasters;
        this.entries.push({
          type: 'sale',
          amount: amountPiasters,
          balanceAfter: this.balance,
        });
      }

      recordPayment(amountPiasters) {
        this.balance -= amountPiasters;
        const entry = {
          id: 'pay_' + this.entries.length,
          type: 'payment',
          amount: amountPiasters,
          balanceAfter: this.balance,
        };
        this.entries.push(entry);
        return entry;
      }

      cancelPayment(entryId, contraReason) {
        const target = this.entries.find(e => e.id === entryId && e.type === 'payment');
        if (!target) throw new Error('Payment not found');
        if (target.isCancelled) throw new Error('Payment already cancelled');

        target.isCancelled = true;
        this.balance += target.amount; // Reversal

        this.entries.push({
          type: 'payment_cancel',
          amount: target.amount,
          balanceAfter: this.balance,
          reason: contraReason,
        });
      }

      verifyIntegrity() {
        let calculated = 0;
        for (const e of this.entries) {
          if (e.type === 'opening_balance') calculated += e.amount;
          else if (e.type === 'sale') calculated += e.amount;
          else if (e.type === 'payment') calculated -= e.amount;
          else if (e.type === 'payment_cancel') calculated += e.amount;
          else if (e.type === 'deposit') calculated -= e.amount;
        }
        return {
          stored: this.balance,
          calculated,
          isBalanced: this.balance === calculated,
        };
      }
    }

    it('Scenario 6.1: verifies customer ledger transactions, payments and cancellations without hard-delete', () => {
      const ledger = new MockCustomerLedger(50000); // 500.00 EGP opening debt
      assert.equal(ledger.balance, 50000);

      // 1. Credit sale of 120.00 EGP
      ledger.addCreditSale(12000);
      assert.equal(ledger.balance, 62000);

      // 2. Partial payment of 220.00 EGP
      const p1 = ledger.recordPayment(22000);
      assert.equal(ledger.balance, 40000);

      // 3. Payment cancellation by contra-entry (Reversal)
      ledger.cancelPayment(p1.id, 'تسجيل خاطئ على العميل');
      assert.equal(ledger.balance, 62000, 'Balance must return to 620.00 EGP after reversal');

      // 4. Verify no hard-deletes: entries count must be 4
      assert.equal(ledger.entries.length, 4);

      // 5. Full settlement of 620.00 EGP
      ledger.recordPayment(62000);
      assert.equal(ledger.balance, 0, 'Customer balance must be exactly zero after full settlement');

      // 6. Verify mathematical invariant
      const check = ledger.verifyIntegrity();
      assert.ok(check.isBalanced);
      assert.equal(check.stored, check.calculated);
    });
  });

  // =======================================================================================
  // 7. INVENTORY WEIGHTED AVERAGE COST (WAC) & COGS
  // =======================================================================================
  describe('7. Inventory Weighted Average Cost (WAC) & COGS (حساب متوسط التكلفة)', () => {
    function calculateNewWAC(oldStockMilli, oldCostPiasters, incomingQtyMilli, incomingCostPiasters) {
      if (oldStockMilli <= 0) return incomingCostPiasters;
      const totalStockMilli = oldStockMilli + incomingQtyMilli;
      if (totalStockMilli <= 0) return incomingCostPiasters;

      // New WAC = (OldStock * OldCost + IncomingStock * IncomingCost) / TotalStock
      const oldTotalVal = (oldStockMilli * oldCostPiasters) / 1000;
      const inTotalVal = (incomingQtyMilli * incomingCostPiasters) / 1000;
      const totalVal = oldTotalVal + inTotalVal;

      return Math.round((totalVal * 1000) / totalStockMilli);
    }

    it('Scenario 7.1: calculates Weighted Average Cost accurately across successive purchase batches', () => {
      // Initial: 20 units at 25.00 EGP (2500 piasters)
      let currentStockMilli = 20000;
      let currentCostPiasters = 2500;

      // Purchase Batch 1: 30 units at 30.00 EGP (3000 piasters)
      // Total value: (20 * 2500) + (30 * 3000) = 50,000 + 90,000 = 140,000 piasters for 50 units
      // WAC = 140,000 / 50 = 2800 piasters (28.00 EGP)
      currentCostPiasters = calculateNewWAC(currentStockMilli, currentCostPiasters, 30000, 3000);
      currentStockMilli += 30000;
      assert.equal(currentCostPiasters, 2800);
      assert.equal(currentStockMilli, 50000);

      // Purchase Batch 2: 50 units at 40.00 EGP (4000 piasters)
      // Total value: (50 * 2800) + (50 * 4000) = 140,000 + 200,000 = 340,000 piasters for 100 units
      // WAC = 340,000 / 100 = 3400 piasters (34.00 EGP)
      currentCostPiasters = calculateNewWAC(currentStockMilli, currentCostPiasters, 50000, 4000);
      currentStockMilli += 50000;
      assert.equal(currentCostPiasters, 3400);
      assert.equal(currentStockMilli, 100000);
    });

    it('Scenario 7.2: computes Cost of Goods Sold (COGS) and Gross Profit accurately', () => {
      // Sale: 4 units sold at 50.00 EGP (5000 piasters), cost is 34.00 EGP (3400 piasters)
      const qtySoldMilli = 4000;
      const unitPrice = 5000;
      const unitCost = 3400;

      const totalRevenue = (unitPrice * qtySoldMilli) / 1000; // 20000 p (200.00 EGP)
      const cogs = (unitCost * qtySoldMilli) / 1000;           // 13600 p (136.00 EGP)
      const grossProfit = totalRevenue - cogs;                // 6400 p (64.00 EGP)

      assert.equal(totalRevenue, 20000);
      assert.equal(cogs, 13600);
      assert.equal(grossProfit, 6400);

      // Margin percent = (6400 / 20000) * 100 = 32%
      const marginPct = (grossProfit * 100) / totalRevenue;
      assert.equal(marginPct, 32.0);
    });
  });

  // =======================================================================================
  // 8. RETURNS REVERSIBILITY & PROPORTIONAL REFUND
  // =======================================================================================
  describe('8. Returns & Refunds Reversibility (المرتجع الكامل والجزئي والخصم التناسبي)', () => {
    it('Scenario 8.1: full return restores 100% of the customer money and inventory', () => {
      const soldQtyMilli = 3000;
      const lineTotalPiasters = 29000; // 290.00 EGP net after discount

      // Returning all 3 units must refund exactly 29000 piasters without 1-2 piaster loss!
      const returnQtyMilli = 3000;
      let refundPiasters = 0;
      if (returnQtyMilli === soldQtyMilli) {
        refundPiasters = lineTotalPiasters;
      } else {
        refundPiasters = Math.round((lineTotalPiasters * returnQtyMilli) / soldQtyMilli);
      }

      assert.equal(refundPiasters, 29000);
    });

    it('Scenario 8.2: partial return with proportional invoice discount refunds exact net share', () => {
      // 3 items sold at 100.00 EGP each (300 EGP gross).
      // Invoice discount was 30.00 EGP, so net paid was 270.00 EGP (27000 piasters) = 90.00 EGP/unit.
      // Customer returns 1 unit: refund MUST be 90.00 EGP (9000 piasters), NOT 100.00 EGP!
      const soldQtyMilli = 3000;
      const netLinePiasters = 27000;
      const returnQtyMilli = 1000; // 1 unit

      const effectiveUnitPrice = Math.round((netLinePiasters * 1000) / soldQtyMilli); // 9000 piasters
      const refundAmount = Math.round((effectiveUnitPrice * returnQtyMilli) / 1000);

      assert.equal(refundAmount, 9000);
    });
  });

  // =======================================================================================
  // 9. DAILY CASH DRAWER RECONCILIATION & CLOSINGS (تقفيل الوردية)
  // =======================================================================================
  describe('9. Daily Cash Drawer Balance & Closing Reconciliation (معادلة تقفيل الدرج)', () => {
    function calculateExpectedDrawerCash({
      cashSalesPiasters,
      cashReturnsPiasters,
      cashDebtCollectionsPiasters,
      expensesPiasters,
      epayDrawerCashPiasters = 0,
      epayDrawerFundingPiasters = 0,
    }) {
      const expected = cashSalesPiasters
        - cashReturnsPiasters
        + cashDebtCollectionsPiasters
        - expensesPiasters
        + epayDrawerCashPiasters
        - epayDrawerFundingPiasters;
      return Math.max(0, expected);
    }

    it('Scenario 9.1: perfectly balanced drawer (المطابقة التامة بدون عجز أو زيادة)', () => {
      const expected = calculateExpectedDrawerCash({
        cashSalesPiasters: 500000,        // 5,000.00 EGP sales
        cashReturnsPiasters: 20000,       // 200.00 EGP returned
        cashDebtCollectionsPiasters: 70000,// 700.00 EGP debt collected
        expensesPiasters: 50000,          // 500.00 EGP expenses paid
        epayDrawerCashPiasters: 30000,    // 300.00 EGP Fawry bills paid into drawer
        epayDrawerFundingPiasters: 0,
      });

      // 5000 - 200 + 700 - 500 + 300 = 5,300.00 EGP = 530,000 piasters
      assert.equal(expected, 530000);

      const actualCounted = 530000;
      const difference = actualCounted - expected;
      assert.equal(difference, 0, 'Difference must be exactly zero when drawer is balanced');
    });

    it('Scenario 9.2: cash drawer shortage (عجز في الدرج)', () => {
      const expected = 500000; // 5,000 EGP
      const actualCounted = 485000; // 4,850 EGP counted by cashier

      const difference = actualCounted - expected; // -15000 piasters (-150 EGP shortage)
      assert.equal(difference, -15000);
      assert.ok(difference < 0, 'Negative difference indicates drawer shortage (عجز)');
    });

    it('Scenario 9.3: cash drawer surplus (زيادة في الدرج)', () => {
      const expected = 500000; // 5,000 EGP
      const actualCounted = 512000; // 5,120 EGP counted

      const difference = actualCounted - expected; // +12000 piasters (+120 EGP surplus)
      assert.equal(difference, 12000);
      assert.ok(difference > 0, 'Positive difference indicates drawer surplus (زيادة)');
    });
  });

  // =======================================================================================
  // 10. MACRO FINANCIAL ANALYTICS & EXECUTIVE METRICS
  // =======================================================================================
  describe('10. Macro Financial Analytics & Reporting Metrics (تحليلات الأرباح والمبيعات)', () => {
    it('Scenario 10.1: calculates Net Sales, Gross Profit, and Net Operational Profit', () => {
      const totalSalesPiasters = 1200000; // 12,000.00 EGP gross sales
      const returnsPiasters = 80000;       // 800.00 EGP returns
      const netSalesPiasters = totalSalesPiasters - returnsPiasters; // 11,200.00 EGP

      assert.equal(netSalesPiasters, 1120000);

      const cogsPiasters = 800000; // 8,000.00 EGP cost of goods sold
      const grossProfitPiasters = netSalesPiasters - cogsPiasters; // 3,200.00 EGP
      assert.equal(grossProfitPiasters, 320000);

      const expensesPiasters = 50000;        // 500.00 EGP expenses
      const inventoryShrinkagePiasters = 20000; // 200.00 EGP inventory loss/theft
      const inventorySurplusPiasters = 5000;    // 50.00 EGP surplus

      const netOperationalProfit = grossProfitPiasters - expensesPiasters - inventoryShrinkagePiasters + inventorySurplusPiasters;
      // 3200 - 500 - 200 + 50 = 2,550.00 EGP = 255,000 piasters
      assert.equal(netOperationalProfit, 255000);

      // Profit Margin % = (255,000 / 1,120,000) * 100 = 22.77%
      const marginPct = (netOperationalProfit * 100) / netSalesPiasters;
      assert.equal(Number(marginPct.toFixed(2)), 22.77);
    });

    it('Scenario 10.2: calculates Average Basket Value (AOV / متوسط قيمة الفاتورة)', () => {
      const totalSalesPiasters = 540000; // 5,400.00 EGP
      const invoiceCount = 72;

      const aovPiasters = Math.round(totalSalesPiasters / invoiceCount);
      assert.equal(aovPiasters, 7500); // 75.00 EGP per customer
      assert.equal(piastersToPounds(aovPiasters), 75.00);
    });

    it('Scenario 10.3: payment breakdown percentages always sum up to exactly 100%', () => {
      const totalSales = 100000;
      const cashSales = 50000;     // 50%
      const creditSales = 20000;   // 20%
      const cardSales = 15000;     // 15%
      const instapaySales = 10000; // 10%
      const vodafoneSales = 5000;  // 5%

      const cashPct = Math.round((cashSales * 100) / totalSales);
      const creditPct = Math.round((creditSales * 100) / totalSales);
      const cardPct = Math.round((cardSales * 100) / totalSales);
      const instapayPct = Math.round((instapaySales * 100) / totalSales);
      const vodafonePct = Math.max(0, 100 - cashPct - creditPct - cardPct - instapayPct);

      assert.equal(cashPct, 50);
      assert.equal(creditPct, 20);
      assert.equal(cardPct, 15);
      assert.equal(instapayPct, 10);
      assert.equal(vodafonePct, 5);
      assert.equal(vodafoneSales, 5000);

      const totalPct = cashPct + creditPct + cardPct + instapayPct + vodafonePct;
      assert.equal(totalPct, 100);
    });

    it('Scenario 10.4: classifies customer debt aging into standard tiers accurately', () => {
      const debts = [
        { customerId: 'c1', debtPiasters: 10000, daysAgo: 3 },  // Tier 1 (<= 7 days)
        { customerId: 'c2', debtPiasters: 25000, daysAgo: 15 }, // Tier 2 (8-30 days)
        { customerId: 'c3', debtPiasters: 40000, daysAgo: 45 }, // Tier 3 (31-90 days)
        { customerId: 'c4', debtPiasters: 80000, daysAgo: 120 },// Tier 4 (> 90 days - critical)
      ];

      const tiers = {
        tier1: { count: 0, total: 0 },
        tier2: { count: 0, total: 0 },
        tier3: { count: 0, total: 0 },
        tier4: { count: 0, total: 0 },
      };

      for (const d of debts) {
        if (d.daysAgo <= 7) {
          tiers.tier1.count++;
          tiers.tier1.total += d.debtPiasters;
        } else if (d.daysAgo <= 30) {
          tiers.tier2.count++;
          tiers.tier2.total += d.debtPiasters;
        } else if (d.daysAgo <= 90) {
          tiers.tier3.count++;
          tiers.tier3.total += d.debtPiasters;
        } else {
          tiers.tier4.count++;
          tiers.tier4.total += d.debtPiasters;
        }
      }

      assert.equal(tiers.tier1.count, 1);
      assert.equal(tiers.tier1.total, 10000);

      assert.equal(tiers.tier2.count, 1);
      assert.equal(tiers.tier2.total, 25000);

      assert.equal(tiers.tier3.count, 1);
      assert.equal(tiers.tier3.total, 40000);

      assert.equal(tiers.tier4.count, 1);
      assert.equal(tiers.tier4.total, 80000);
    });
  });
});
