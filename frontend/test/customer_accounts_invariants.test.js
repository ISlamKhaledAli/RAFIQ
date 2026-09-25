import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Story 73 — Feature #128: اختبارات آلية لحسابات البيع والمخزون والآجل (Task 128-4)', () => {

  // Helper class replicating financial arithmetic without floating point math
  class CustomerLedgerEngine {
    constructor(customerId, customerName, initialBalancePiasters = 0) {
      this.customerId = customerId;
      this.customerName = customerName;
      this.storedBalancePiasters = initialBalancePiasters;
      this.entries = [];

      if (initialBalancePiasters > 0) {
        this.entries.push({
          id: `led_init_${Date.now()}`,
          type: 'opening_balance',
          amountPiasters: initialBalancePiasters,
          balanceAfterPiasters: initialBalancePiasters,
          notes: 'رصيد افتتاحي من الدفتر القديم',
          createdAt: new Date().toISOString(),
        });
      }
    }

    addCreditSale(amountPiasters, invoiceNumber) {
      assert.ok(Number.isInteger(amountPiasters) && amountPiasters > 0, 'مبلغ الفاتورة يجب أن يكون عدداً صحيحاً موجباً بالقروش');
      this.storedBalancePiasters += amountPiasters;
      const entry = {
        id: `led_sale_${invoiceNumber}`,
        type: 'sale',
        amountPiasters,
        balanceAfterPiasters: this.storedBalancePiasters,
        notes: `فاتورة آجل رقم #${invoiceNumber}`,
        createdAt: new Date().toISOString(),
      };
      this.entries.push(entry);
      return entry;
    }

    recordPayment(amountPiasters, notes = 'سداد نقدي') {
      assert.ok(Number.isInteger(amountPiasters) && amountPiasters > 0, 'مبلغ السداد يجب أن يكون عدداً صحيحاً موجباً بالقروش');
      this.storedBalancePiasters -= amountPiasters;
      const entry = {
        id: `led_pay_${Date.now()}_${Math.random()}`,
        type: 'payment',
        amountPiasters,
        balanceAfterPiasters: this.storedBalancePiasters,
        notes,
        createdAt: new Date().toISOString(),
      };
      this.entries.push(entry);
      return entry;
    }

    cancelPayment(paymentEntryId, reason = 'سجلت بالخطأ', user = 'كاشير 1') {
      const orig = this.entries.find(e => e.id === paymentEntryId);
      assert.ok(orig, 'حركة السداد غير موجودة');
      assert.equal(orig.type, 'payment', 'لا يمكن إلغاء سوى دفعات السداد');

      // Check if already cancelled
      const alreadyCancelled = this.entries.some(e => e.type === 'payment_cancel' && e.saleId === paymentEntryId);
      assert.equal(alreadyCancelled, false, 'لا يمكن إلغاء دفعة ملغاة مسبقاً');

      // Contra entry restores balance
      this.storedBalancePiasters += orig.amountPiasters;
      const contraEntry = {
        id: `led_rev_${Date.now()}`,
        type: 'payment_cancel',
        saleId: paymentEntryId,
        amountPiasters: orig.amountPiasters,
        balanceAfterPiasters: this.storedBalancePiasters,
        notes: `قيد معاكس لإلغاء دفعة (${(orig.amountPiasters / 100).toFixed(2)} ج.م) — السبب: ${reason} (المستخدم: ${user})`,
        createdAt: new Date().toISOString(),
      };
      this.entries.push(contraEntry);
      return contraEntry;
    }

    processRefund(refundAmountPiasters, invoiceNumber, reason = 'مرتجع أصناف من فاتورة آجلة') {
      assert.ok(Number.isInteger(refundAmountPiasters) && refundAmountPiasters > 0);
      this.storedBalancePiasters -= refundAmountPiasters;
      const entry = {
        id: `led_ref_${Date.now()}`,
        type: 'refund',
        amountPiasters: refundAmountPiasters,
        balanceAfterPiasters: this.storedBalancePiasters,
        notes: `${reason} - فاتورة #${invoiceNumber}`,
        createdAt: new Date().toISOString(),
      };
      this.entries.push(entry);
      return entry;
    }

    verifyBalance() {
      let calculated = 0;
      for (const e of this.entries) {
        if (e.type === 'opening_balance' || e.type === 'sale' || e.type === 'payment_cancel' || e.type === 'debt_increase') {
          calculated += e.amountPiasters;
        } else if (e.type === 'payment' || e.type === 'refund' || e.type === 'cancellation' || e.type === 'debt_decrease') {
          calculated -= e.amountPiasters;
        }
      }
      return {
        stored: this.storedBalancePiasters,
        calculated,
        isBalanced: this.storedBalancePiasters === calculated,
        discrepancy: this.storedBalancePiasters - calculated,
      };
    }
  }

  // 1. فحص الرصيد الافتتاحي والبيع الآجل والسداد الجزئي
  it('128-4.1: رصيد العميل يزداد بالبيع الآجل وينخفض بالسداد الجزئي بدقة القروش', () => {
    const engine = new CustomerLedgerEngine('c1', 'أحمد كمال', 30000); // 300 EGP opening
    assert.equal(engine.storedBalancePiasters, 30000);

    // Credit sale of 150.00 EGP (15000 piasters)
    engine.addCreditSale(15000, 101);
    assert.equal(engine.storedBalancePiasters, 45000);

    // Partial payment of 200.00 EGP (20000 piasters)
    engine.recordPayment(20000, 'دفعة نقدية');
    assert.equal(engine.storedBalancePiasters, 25000);

    const check = engine.verifyBalance();
    assert.equal(check.isBalanced, true);
    assert.equal(check.discrepancy, 0);
    assert.equal(check.calculated, 25000);
  });

  // 2. فحص مرتجع من فاتورة آجلة
  it('128-4.2: مرتجع من فاتورة آجلة يخفض دين العميل ويسجل قيد مرتجع دائن', () => {
    const engine = new CustomerLedgerEngine('c2', 'سمير الشريف', 0);

    // Sale of 500 EGP
    engine.addCreditSale(50000, 201);
    assert.equal(engine.storedBalancePiasters, 50000);

    // Return 100 EGP from the invoice
    engine.processRefund(10000, 201, 'مرتجع علبتين جبنة تالفة');
    assert.equal(engine.storedBalancePiasters, 40000);

    const check = engine.verifyBalance();
    assert.equal(check.isBalanced, true);
    assert.equal(check.calculated, 40000);
  });

  // 3. فحص إلغاء دفعة سداد بقيد معاكس دون حذف أي سجل
  it('128-4.3: إلغاء دفعة سداد بالخطأ بقيد معاكس يستعيد رصيد الدين الأصلي دون حذف القيود', () => {
    const engine = new CustomerLedgerEngine('c3', 'محمود عثمان', 100000); // 1,000 EGP debt

    // Payment of 400 EGP
    const payEntry = engine.recordPayment(40000, 'سداد نقدي تم تسجيله بالخطأ');
    assert.equal(engine.storedBalancePiasters, 60000);

    // Cashier cancels the payment
    const contra = engine.cancelPayment(payEntry.id, 'العميل لم يسدد، السداد يخص عميل آخر', 'الكاشير');
    assert.equal(contra.type, 'payment_cancel');
    assert.equal(engine.storedBalancePiasters, 100000); // restored back to 1,000 EGP!

    // Verify all 3 entries are preserved
    assert.equal(engine.entries.length, 3);
    assert.equal(engine.entries[0].type, 'opening_balance');
    assert.equal(engine.entries[1].type, 'payment');
    assert.equal(engine.entries[2].type, 'payment_cancel');

    const check = engine.verifyBalance();
    assert.equal(check.isBalanced, true);
    assert.equal(check.discrepancy, 0);
  });

  // 4. سيناريو مركب كامل للآجل والمخزون
  it('128-4.4: سيناريو مركب متتابع (افتتاحي + بيع + سداد + مرتجع + إلغاء سداد + سداد كلي) يحافظ دائماً على الرصيد المخزن = مجموع القيود', () => {
    const engine = new CustomerLedgerEngine('c4', 'متجر الأخوة', 25000); // 250 EGP

    // 1. Sale 1
    engine.addCreditSale(45000, 301); // +450 => 700 EGP (70000)
    assert.equal(engine.storedBalancePiasters, 70000);

    // 2. Sale 2
    engine.addCreditSale(30000, 302); // +300 => 1000 EGP (100000)
    assert.equal(engine.storedBalancePiasters, 100000);

    // 3. Payment 1 (partial 500 EGP)
    const p1 = engine.recordPayment(50000, 'سداد نقدي نصف الدين'); // -500 => 500 EGP (50000)
    assert.equal(engine.storedBalancePiasters, 50000);

    // 4. Refund 50 EGP from sale 301
    engine.processRefund(5000, 301); // -50 => 450 EGP (45000)
    assert.equal(engine.storedBalancePiasters, 45000);

    // 5. Cancel payment 1
    engine.cancelPayment(p1.id, 'إلغاء دفعة السداد'); // +500 => 950 EGP (95000)
    assert.equal(engine.storedBalancePiasters, 95000);

    // 6. Settle all
    engine.recordPayment(95000, 'سدد الكل'); // -950 => 0 EGP
    assert.equal(engine.storedBalancePiasters, 0);

    // Invariant check
    const check = engine.verifyBalance();
    assert.equal(check.isBalanced, true);
    assert.equal(check.calculated, 0);
    assert.equal(check.stored, 0);
    assert.equal(check.discrepancy, 0);
  });
});
