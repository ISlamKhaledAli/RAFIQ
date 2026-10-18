import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  poundsToPiasters,
  formatArabicCurrency,
  calculateLineTotal,
} from '../src/utils/money.ts';

/**
 * =========================================================================================
 * Senior Retail Scenarios & Cash Drawer Overdraft Defense Test Suite — Rafiq POS
 * اختبارات السنيور للسيناريوهات الواقعية في المحلات: حماية نقدية الدرج من السحب على المكشوف
 * وحظر العمليات النقدية عند إغلاق اليومية ومطابقة كشوف المرتجعات والمصروفات
 * =========================================================================================
 */

describe('Senior Retail Scenarios: Cash Drawer Overdraft & Returns Defense', () => {

  // Simulated Live Drawer Balance Engine mirroring DailyClosingService.cs
  class MockDrawerLedger {
    constructor() {
      this.cashSalesPiasters = 0;
      this.returnsCashPiasters = 0;
      this.debtPaymentsPiasters = 0;
      this.expensesPiasters = 0;
      this.epayDrawerCashPiasters = 0;
      this.epayDrawerFundingPiasters = 0;
      this.walletsDrawerCashPiasters = 0;
      this.walletsDrawerFundingPiasters = 0;
      this.purchasesDrawerCashPiasters = 0;
      this.supplierPaymentsDrawerCashPiasters = 0;
      this.isDayClosed = false;
    }

    getAvailableCashPiasters() {
      const net = (
        this.cashSalesPiasters
        - this.returnsCashPiasters
        + this.debtPaymentsPiasters
        - this.expensesPiasters
        + this.epayDrawerCashPiasters
        - this.epayDrawerFundingPiasters
        + this.walletsDrawerCashPiasters
        - this.walletsDrawerFundingPiasters
        - this.purchasesDrawerCashPiasters
        - this.supplierPaymentsDrawerCashPiasters
      );
      return Math.max(0, net);
    }

    addExpense(amountPiasters) {
      if (this.isDayClosed) {
        throw new Error('لا يمكن تسجيل مصروف لتاريخ عمل تم إقفاله وتشميعه مسبقاً.');
      }
      const available = this.getAvailableCashPiasters();
      if (available < amountPiasters) {
        throw new Error(`رصيد نقدية الدرج المتاح حالياً (${formatArabicCurrency(available)}) غير كافٍ لصرف هذا المصروف (${formatArabicCurrency(amountPiasters)}). يرجى توريد عهدة للدرج أولاً.`);
      }
      this.expensesPiasters += amountPiasters;
    }

    processReturn({ refundMethod, totalPiasters, isOriginalCreditUnpaid }) {
      if (this.isDayClosed) {
        throw new Error('لا يمكن عمل مرتجع نقدي لتاريخ عمل تم إقفاله وتشميعه مسبقاً.');
      }
      if (refundMethod === 'cash') {
        if (isOriginalCreditUnpaid) {
          throw new Error('لا يمكن صرف مرتجع نقدي من الدرج لفاتورة بيع لم يُسدد منها مبالغ نقدية.');
        }
        const available = this.getAvailableCashPiasters();
        if (available < totalPiasters) {
          throw new Error(`رصيد نقدية الدرج المتاح حالياً (${formatArabicCurrency(available)}) غير كافٍ لصرف قيمة المرتجع نقداً (${formatArabicCurrency(totalPiasters)}). يرجى استرداد القيمة كرصيد آجل (credit) في حساب العميل أو توريد نقدية للدرج أولاً.`);
        }
        this.returnsCashPiasters += totalPiasters;
      }
    }

    cancelCustomerPayment(amountPiasters) {
      if (this.isDayClosed) {
        throw new Error('لا يمكن إلغاء دفعة نقدية لتاريخ عمل تم إقفاله وتشميعه مسبقاً.');
      }
      const available = this.getAvailableCashPiasters();
      if (available < amountPiasters) {
        throw new Error(`رصيد نقدية الدرج المتاح حالياً (${formatArabicCurrency(available)}) غير كافٍ لإلغاء هذه الدفعة النقدية واستردادها (${formatArabicCurrency(amountPiasters)}).`);
      }
      this.debtPaymentsPiasters -= amountPiasters;
    }

    fundDigitalAccount(amountPiasters, fundingSource = 'cash_drawer') {
      if (fundingSource === 'cash_drawer') {
        if (this.isDayClosed) {
          throw new Error('لا يمكن تغذية الحساب من درج الكاشير لتاريخ عمل تم إقفاله وتشميعه مسبقاً.');
        }
        const available = this.getAvailableCashPiasters();
        if (available < amountPiasters) {
          throw new Error(`رصيد نقدية درج الكاشير المتاح حالياً (${formatArabicCurrency(available)}) غير كافٍ لتغذية المحفظة بمبلغ (${formatArabicCurrency(amountPiasters)}).`);
        }
        this.walletsDrawerFundingPiasters += amountPiasters;
      }
    }

    purchaseFromDrawer(paidPiasters, paymentSource = 'cash_drawer') {
      if (paymentSource === 'cash_drawer') {
        if (this.isDayClosed) {
          throw new Error('لا يمكن سداد فاتورة شراء من درج الكاشير لتاريخ عمل تم إقفاله وتشميعه مسبقاً.');
        }
        const available = this.getAvailableCashPiasters();
        if (available < paidPiasters) {
          throw new Error(`رصيد نقدية درج الكاشير المتاح (${formatArabicCurrency(available)}) غير كافٍ لسداد فاتورة الشراء (${formatArabicCurrency(paidPiasters)}).`);
        }
        this.purchasesDrawerCashPiasters += paidPiasters;
      }
    }
  }

  // =======================================================================================
  // 1. EXPENSES OVERDRAFT PROTECTION
  // =======================================================================================
  describe('1. حماية مصروفات الدرج من السحب على المكشوف (Expense Drawer Overdraft)', () => {
    it('Scenario 1.1: يحظر تسجيل أي مصروف نقدي عندما يكون رصيد الدرج 0.00 ج.م', () => {
      const drawer = new MockDrawerLedger();
      assert.equal(drawer.getAvailableCashPiasters(), 0);

      assert.throws(
        () => drawer.addExpense(poundsToPiasters(50)),
        /غير كافٍ لصرف هذا المصروف/
      );
      assert.equal(drawer.expensesPiasters, 0);
    });

    it('Scenario 1.2: يحظر تسجيل مصروف أكبر من النقدية المتاحة في الدرج', () => {
      const drawer = new MockDrawerLedger();
      drawer.cashSalesPiasters = poundsToPiasters(200); // 200 EGP in drawer
      assert.equal(drawer.getAvailableCashPiasters(), poundsToPiasters(200));

      // Attempt expense of 250 EGP
      assert.throws(
        () => drawer.addExpense(poundsToPiasters(250)),
        /غير كافٍ لصرف هذا المصروف/
      );

      // Allowed expense within budget (150 EGP)
      drawer.addExpense(poundsToPiasters(150));
      assert.equal(drawer.getAvailableCashPiasters(), poundsToPiasters(50));
      assert.equal(drawer.expensesPiasters, poundsToPiasters(150));
    });

    it('Scenario 1.3: يحظر تسجيل المصروف في يوم عمل تم إقفاله وتشميعه مسبقاً', () => {
      const drawer = new MockDrawerLedger();
      drawer.cashSalesPiasters = poundsToPiasters(1000);
      drawer.isDayClosed = true;

      assert.throws(
        () => drawer.addExpense(poundsToPiasters(100)),
        /تم إقفاله وتشميعه مسبقاً/
      );
    });
  });

  // =======================================================================================
  // 2. RETURNS OVERDRAFT PROTECTION
  // =======================================================================================
  describe('2. حماية مرتجعات الكاش من السحب على المكشوف (Cash Returns Overdraft)', () => {
    it('Scenario 2.1: يحظر صرف مرتجع نقدي من الدرج عندما يكون رصيد الدرج غير كافٍ', () => {
      const drawer = new MockDrawerLedger();
      drawer.cashSalesPiasters = poundsToPiasters(50); // Only 50 EGP in drawer

      // Customer comes with receipt for 120 EGP and asks for cash refund
      assert.throws(
        () => drawer.processReturn({
          refundMethod: 'cash',
          totalPiasters: poundsToPiasters(120),
          isOriginalCreditUnpaid: false
        }),
        /رصيد نقدية الدرج المتاح حالياً .* غير كافٍ لصرف قيمة المرتجع نقداً/
      );
      assert.equal(drawer.returnsCashPiasters, 0);
    });

    it('Scenario 2.2: يسمح بالمرتجع النقدي عندما تتوفر نقدية كافية بالدرج ويخفض الرصيد بدقة', () => {
      const drawer = new MockDrawerLedger();
      drawer.cashSalesPiasters = poundsToPiasters(300);

      drawer.processReturn({
        refundMethod: 'cash',
        totalPiasters: poundsToPiasters(100),
        isOriginalCreditUnpaid: false
      });

      assert.equal(drawer.getAvailableCashPiasters(), poundsToPiasters(200));
      assert.equal(drawer.returnsCashPiasters, poundsToPiasters(100));
    });

    it('Scenario 2.3: يحظر صرف مرتجع كاش لفاتورة شكك غير مسددة ويُلزم برد القيمة كرصيد آجل', () => {
      const drawer = new MockDrawerLedger();
      drawer.cashSalesPiasters = poundsToPiasters(500);

      assert.throws(
        () => drawer.processReturn({
          refundMethod: 'cash',
          totalPiasters: poundsToPiasters(200),
          isOriginalCreditUnpaid: true
        }),
        /لا يمكن صرف مرتجع نقدي من الدرج لفاتورة بيع لم يُسدد منها مبالغ نقدية/
      );
    });

    it('Scenario 2.4: يحظر عمل أي مرتجع نقدي ليومية مقفولة ومعتمدة', () => {
      const drawer = new MockDrawerLedger();
      drawer.cashSalesPiasters = poundsToPiasters(1000);
      drawer.isDayClosed = true;

      assert.throws(
        () => drawer.processReturn({
          refundMethod: 'cash',
          totalPiasters: poundsToPiasters(100),
          isOriginalCreditUnpaid: false
        }),
        /تم إقفاله وتشميعه مسبقاً/
      );
    });
  });

  // =======================================================================================
  // 3. COMPLEX CASCADING CASH IN/OUT MULTI-CHANNEL STORE SCENARIOS
  // =======================================================================================
  describe('3. السيناريو المركب لتعدد قنوات السحب والتغذية بالدرج (Multi-Channel Cascading Outflow)', () => {
    it('Scenario 3.1: محاكاة يوم عمل واقعي وتتبع تآكل نقدية الدرج ومنع السحب على المكشوف في كل خطوة', () => {
      const drawer = new MockDrawerLedger();

      // 1. مبيعات كاش صباحية: 2,000 ج.م
      drawer.cashSalesPiasters = poundsToPiasters(2000);
      assert.equal(drawer.getAvailableCashPiasters(), poundsToPiasters(2000));

      // 2. سداد مورد من الدرج: 800 ج.م
      drawer.purchaseFromDrawer(poundsToPiasters(800), 'cash_drawer');
      assert.equal(drawer.getAvailableCashPiasters(), poundsToPiasters(1200));

      // 3. تغذية محفظة إلكترونية (فودافون كاش) من الدرج: 500 ج.م
      drawer.fundDigitalAccount(poundsToPiasters(500), 'cash_drawer');
      assert.equal(drawer.getAvailableCashPiasters(), poundsToPiasters(700));

      // 4. صرف مصروف بوفيه ونظافة: 150 ج.م
      drawer.addExpense(poundsToPiasters(150));
      assert.equal(drawer.getAvailableCashPiasters(), poundsToPiasters(550));

      // 5. مرتجع مبيعات كاش: 250 ج.م
      drawer.processReturn({
        refundMethod: 'cash',
        totalPiasters: poundsToPiasters(250),
        isOriginalCreditUnpaid: false
      });
      assert.equal(drawer.getAvailableCashPiasters(), poundsToPiasters(300));

      // 6. محاولة صرف مصروف كهرباء 400 ج.م (أكبر من المتبقي 300 ج.م) -> يجب أن يفشل ويمنع السحب السالب
      assert.throws(
        () => drawer.addExpense(poundsToPiasters(400)),
        /غير كافٍ لصرف هذا المصروف/
      );
      assert.equal(drawer.getAvailableCashPiasters(), poundsToPiasters(300));

      // 7. تحصيل مديونية عميل كاش بالدرج: 300 ج.م
      drawer.debtPaymentsPiasters += poundsToPiasters(300);
      assert.equal(drawer.getAvailableCashPiasters(), poundsToPiasters(600));

      // 8. الآن صرف مصروف الكهرباء 400 ج.م ينجح
      drawer.addExpense(poundsToPiasters(400));
      assert.equal(drawer.getAvailableCashPiasters(), poundsToPiasters(200));

      // 9. محاولة إلغاء تحصيل دفعة العميل السابقة (300 ج.م) بينما الدرج فيه 200 ج.م فقط -> تفشل لحماية الدرج
      assert.throws(
        () => drawer.cancelCustomerPayment(poundsToPiasters(300)),
        /غير كافٍ لإلغاء هذه الدفعة النقدية واستردادها/
      );
      assert.equal(drawer.getAvailableCashPiasters(), poundsToPiasters(200));
    });

    it('Scenario 3.2: المشتريات من كاش خارجي (صاحب المحل) لا تستنزف نقدية درج الكاشير', () => {
      const drawer = new MockDrawerLedger();
      drawer.cashSalesPiasters = poundsToPiasters(500);

      // فاتورة شراء بـ 15,000 ج.م دفعها صاحب المحل من جيبه الخاص (external_cash)
      drawer.purchaseFromDrawer(poundsToPiasters(15000), 'external_cash');

      // رصيد درج الكاشير لم يمس
      assert.equal(drawer.getAvailableCashPiasters(), poundsToPiasters(500));
      assert.equal(drawer.purchasesDrawerCashPiasters, 0);
    });
  });
});
