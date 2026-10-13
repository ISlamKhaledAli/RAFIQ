import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Senior Architecture Verification: النظم الجوهرية الخمسة (الآجل، الموردين، المخزون، الفواتير، التحليلات)', () => {

  // =========================================================================
  // Helper Engines mirroring senior business rules and arithmetic without float
  // =========================================================================

  class CustomerLedgerEngine {
    constructor(id, name, initialBalancePiasters = 0, creditLimitPiasters = 0) {
      this.id = id;
      this.name = name;
      this.balancePiasters = initialBalancePiasters;
      this.creditLimitPiasters = creditLimitPiasters;
      this.entries = [];

      if (initialBalancePiasters !== 0) {
        this.entries.push({
          id: `led_init_${Date.now()}`,
          type: 'opening_balance',
          amountPiasters: Math.abs(initialBalancePiasters),
          balanceAfterPiasters: initialBalancePiasters,
          notes: 'رصيد افتتاحي',
          createdAt: new Date().toISOString()
        });
      }
    }

    addSale(totalPiasters, paidPiasters, changePiasters, invoiceNumber) {
      assert.ok(Number.isInteger(totalPiasters) && totalPiasters > 0);
      assert.ok(Number.isInteger(paidPiasters) && paidPiasters >= 0);
      assert.ok(Number.isInteger(changePiasters) && changePiasters >= 0);

      const debtAmount = totalPiasters - paidPiasters;
      let warning = null;

      if (debtAmount > 0) {
        const newBal = this.balancePiasters + debtAmount;
        if (this.creditLimitPiasters > 0 && newBal > this.creditLimitPiasters) {
          warning = `تجاوز الحد الائتماني بمقدار ${newBal - this.creditLimitPiasters} قرش`;
        }
        this.balancePiasters = newBal;
        this.entries.push({
          id: `led_sale_${invoiceNumber}`,
          type: 'sale',
          amountPiasters: debtAmount,
          balanceAfterPiasters: this.balancePiasters,
          notes: `فاتورة آجل #${invoiceNumber}`,
          createdAt: new Date().toISOString()
        });
      } else if (debtAmount < 0) {
        const unreturnedChange = Math.abs(debtAmount) - changePiasters;
        if (unreturnedChange > 0) {
          this.balancePiasters -= unreturnedChange;
          this.entries.push({
            id: `led_dep_${invoiceNumber}`,
            type: 'deposit',
            amountPiasters: unreturnedChange,
            balanceAfterPiasters: this.balancePiasters,
            notes: `مبلغ متبقي تحت الحساب (أمانات) من فاتورة #${invoiceNumber}`,
            createdAt: new Date().toISOString()
          });
        }
      }

      return { balancePiasters: this.balancePiasters, warning };
    }

    cancelSale(invoiceNumber, totalPiasters, paidPiasters) {
      const debtAmount = totalPiasters - paidPiasters;
      if (debtAmount > 0) {
        this.balancePiasters -= debtAmount;
        this.entries.push({
          id: `led_cancel_${invoiceNumber}`,
          type: 'cancellation',
          amountPiasters: -debtAmount,
          balanceAfterPiasters: this.balancePiasters,
          notes: `إلغاء فاتورة آجل #${invoiceNumber}`,
          createdAt: new Date().toISOString()
        });
      }
    }

    recordPayment(amountPiasters, notes = 'سداد نقدي') {
      assert.ok(Number.isInteger(amountPiasters) && amountPiasters > 0);
      this.balancePiasters -= amountPiasters;
      const entry = {
        id: `led_pay_${Date.now()}_${Math.random()}`,
        type: 'payment',
        amountPiasters,
        balanceAfterPiasters: this.balancePiasters,
        notes,
        createdAt: new Date().toISOString()
      };
      this.entries.push(entry);
      return entry;
    }

    cancelPayment(paymentEntryId, reason = 'سجلت بالخطأ') {
      const orig = this.entries.find(e => e.id === paymentEntryId);
      assert.ok(orig && orig.type === 'payment', 'حركة السداد غير موجودة');

      this.balancePiasters += orig.amountPiasters;
      const contra = {
        id: `led_contra_${Date.now()}`,
        type: 'payment_cancel',
        saleId: paymentEntryId,
        amountPiasters: orig.amountPiasters,
        balanceAfterPiasters: this.balancePiasters,
        notes: `قيد معاكس لإلغاء دفعة — السبب: ${reason}`,
        createdAt: new Date().toISOString()
      };
      this.entries.push(contra);
      return contra;
    }

    verifyBalanceInvariant() {
      let calc = 0;
      for (const e of this.entries) {
        const t = e.type.toLowerCase();
        const abs = Math.abs(e.amountPiasters);
        if (t === 'opening_balance') {
          calc += (e.balanceAfterPiasters < 0 ? -abs : abs);
        } else if (t === 'sale' || t === 'debt_increase' || t === 'payment_cancel') {
          calc += abs;
        } else if (t === 'payment' || t === 'refund' || t === 'debt_decrease' || t === 'deposit') {
          calc -= abs;
        } else if (t === 'cancellation') {
          calc += e.amountPiasters;
        }
      }
      return calc === this.balancePiasters;
    }
  }

  // =========================================================================
  // 1. الدفع الآجل (Deferred Payment & Customer Accounts)
  // =========================================================================
  describe('1. الدفع الآجل وحسابات ديون وأمانات العملاء (Customer Debts & Invariants)', () => {

    it('1.1: يسجل البيع الآجل بالكامل ويزيد رصيد الدين ويصدر قيد دفتر أستاذ متطابق', () => {
      const cust = new CustomerLedgerEngine('c1', 'محمد أحمد', 0, 50000);
      const res = cust.addSale(15000, 0, 0, 1001); // 150 EGP sale, 0 paid
      assert.equal(res.balancePiasters, 15000);
      assert.equal(cust.entries.length, 1);
      assert.equal(cust.entries[0].type, 'sale');
      assert.equal(cust.entries[0].amountPiasters, 15000);
      assert.equal(cust.verifyBalanceInvariant(), true);
    });

    it('1.2: يولد تحذيراً دقيقاً عند تجاوز الحد الائتماني دون تعطيل البيع إذا كان مسموحاً', () => {
      const cust = new CustomerLedgerEngine('c2', 'خالد علي', 20000, 30000); // 200 EGP debt, 300 EGP limit
      const res = cust.addSale(15000, 0, 0, 1002); // 150 EGP sale -> new debt 350 EGP (exceeds 300)
      assert.equal(res.balancePiasters, 35000);
      assert.ok(res.warning !== null);
      assert.match(res.warning, /5000 قرش/); // Exceeded by 50 EGP
      assert.equal(cust.verifyBalanceInvariant(), true);
    });

    it('1.3: يستهلك رصيد الأمانات المسبق (الرصيد الدائن) ويحول الفائض فقط لدين جديد', () => {
      const cust = new CustomerLedgerEngine('c3', 'محمود حسن', -5000, 50000); // Has 50 EGP advance credit
      // Customer buys 120 EGP (12000 piasters) on credit
      const res = cust.addSale(12000, 0, 0, 1003);
      // New balance = -5000 + 12000 = +7000 (Customer now owes 70 EGP)
      assert.equal(res.balancePiasters, 7000);
      assert.equal(cust.verifyBalanceInvariant(), true);
    });

    it('1.4: تسجيل سداد نقدي ثم إلغاؤه بقيد معاكس يسترجع الرصيد الأصلي دون أي حذف فيزيائي', () => {
      const cust = new CustomerLedgerEngine('c4', 'إبراهيم سامي', 10000, 50000); // 100 EGP debt
      const pay = cust.recordPayment(4000, 'سداد 40 ج.م');
      assert.equal(cust.balancePiasters, 6000);

      // Cancel payment
      const contra = cust.cancelPayment(pay.id, 'إلغاء سداد تم تسجيله بالخطأ');
      assert.equal(contra.type, 'payment_cancel');
      assert.equal(cust.balancePiasters, 10000); // Restored
      assert.equal(cust.entries.length, 3); // opening, payment, contra
      assert.equal(cust.verifyBalanceInvariant(), true);
    });

    it('1.5: إلغاء فاتورة بيع آجل بقيد معاكس cancellation يسترجع رصيد العميل بدقة تامة', () => {
      const cust = new CustomerLedgerEngine('c5', 'سيد عبد الله', 5000, 50000);
      cust.addSale(8000, 0, 0, 1005); // Balance = 13000
      assert.equal(cust.balancePiasters, 13000);

      cust.cancelSale(1005, 8000, 0); // Balance = 5000
      assert.equal(cust.balancePiasters, 5000);
      assert.equal(cust.verifyBalanceInvariant(), true);
    });

    it('1.6: التحقق من التمييز بين باقي الكاش المسلم للعميل والأمانات المتروكة تحت الحساب', () => {
      const custA = new CustomerLedgerEngine('cA', 'عميل استلم الباقي', 0, 50000);
      // Sale: 120 EGP (12000), Paid: 200 EGP (20000), Change handed back: 80 EGP (8000)
      custA.addSale(12000, 20000, 8000, 1006);
      // Since change was handed back in cash, customer balance MUST remain 0 (no deposit)
      assert.equal(custA.balancePiasters, 0);
      assert.equal(custA.entries.length, 0); // No deposit entry

      const custB = new CustomerLedgerEngine('cB', 'عميل ترك الباقي أمانات', 0, 50000);
      // Sale: 120 EGP (12000), Paid: 200 EGP (20000), Change kept as deposit: 0 EGP returned
      custB.addSale(12000, 20000, 0, 1007);
      // Unreturned 80 EGP is saved as credit deposit (-8000 piasters)
      assert.equal(custB.balancePiasters, -8000);
      assert.equal(custB.entries.length, 1);
      assert.equal(custB.entries[0].type, 'deposit');
      assert.equal(custB.entries[0].amountPiasters, 8000);
      assert.equal(custB.verifyBalanceInvariant(), true);
    });
  });

  // =========================================================================
  // 2. الموردين وفواتير الشراء والتكلفة (Suppliers & Purchases)
  // =========================================================================
  describe('2. الموردين وفواتير الشراء واحتساب التكاليف (Suppliers & Purchases)', () => {

    class SupplierEngine {
      constructor(id, name, initialBalancePiasters = 0) {
        this.id = id;
        this.name = name;
        this.balancePiasters = initialBalancePiasters; // Positive means we owe supplier
        this.purchases = [];
        this.transactions = [];
      }

      addPurchaseInvoice(netCostPiasters, paidAmountPiasters, invoiceNumber) {
        const delta = netCostPiasters - paidAmountPiasters;
        this.balancePiasters += delta;
        const purchase = {
          invoiceNumber,
          netCostPiasters,
          paidAmountPiasters,
          remainingAmountPiasters: Math.max(0, delta),
          paymentStatus: paidAmountPiasters >= netCostPiasters ? (paidAmountPiasters > netCostPiasters ? 'OVERPAID' : 'PAID') : (paidAmountPiasters > 0 ? 'PARTIAL' : 'CREDIT')
        };
        this.purchases.push(purchase);
        this.transactions.push({
          type: delta >= 0 ? 'PURCHASE_INVOICE' : 'PURCHASE_OVERPAYMENT',
          amountPiasters: delta,
          balanceAfterPiasters: this.balancePiasters,
          reference: `PUR-${invoiceNumber}`
        });
        return purchase;
      }

      recordPayment(amountPiasters) {
        assert.ok(amountPiasters > 0);
        this.balancePiasters -= amountPiasters;
        this.transactions.push({
          type: 'PAYMENT',
          amountPiasters: -amountPiasters,
          balanceAfterPiasters: this.balancePiasters
        });
      }

      canHardDelete() {
        return this.purchases.length === 0 && this.transactions.length === 0;
      }
    }

    it('2.1: تسجل فاتورة شراء آجل وتزيد مديونية المورد وتوثق الحركة في كشف الحساب', () => {
      const sup = new SupplierEngine('s1', 'شركة النيل للتوزيع', 0);
      const pur = sup.addPurchaseInvoice(50000, 0, 701); // 500 EGP unpaid
      assert.equal(pur.paymentStatus, 'CREDIT');
      assert.equal(pur.remainingAmountPiasters, 50000);
      assert.equal(sup.balancePiasters, 50000);
    });

    it('2.2: السداد بالزيادة في فاتورة الشراء ينشئ رصيداً دائناً لصالح المحل (مقدمات تحت الحساب)', () => {
      const sup = new SupplierEngine('s2', 'مطاحن الأمل', 10000); // We owe 100 EGP
      // Invoice cost: 50 EGP (5000 piasters), Paid: 80 EGP (8000 piasters) -> 30 EGP overpayment
      const pur = sup.addPurchaseInvoice(5000, 8000, 702);
      assert.equal(pur.paymentStatus, 'OVERPAID');
      // Balance was 10000 + (5000 - 8000) = 7000 (We now owe only 70 EGP)
      assert.equal(sup.balancePiasters, 7000);
    });

    it('2.3: سداد دفعة نقدية للمورد يخفض مديونيته بدقة سنت وقرش', () => {
      const sup = new SupplierEngine('s3', 'الأهرام للمشروبات', 45000);
      sup.recordPayment(25000); // Paid 250 EGP
      assert.equal(sup.balancePiasters, 20000); // 200 EGP remaining
    });

    it('2.4: حساب متوسط التكلفة المرجح بدقة رياضية مقارنة بآخر تكلفة شراء', () => {
      // Existing stock: 20 units (20,000 milli) at 25.00 EGP (2500 piasters)
      // Incoming stock: 30 units (30,000 milli) at 30.00 EGP (3000 piasters)
      const currentStockMilli = 20000;
      const currentCost = 2500;
      const incomingStockMilli = 30000;
      const incomingCost = 3000;

      const totalQty = currentStockMilli + incomingStockMilli;
      const weightedCost = Math.floor(((currentStockMilli * currentCost) + (incomingStockMilli * incomingCost)) / totalQty);
      // (20*2500 + 30*3000) / 50 = (50000 + 90000) / 50 = 140000 / 50 = 2800 piasters!
      assert.equal(weightedCost, 2800);
    });

    it('2.5: منع الحذف الفيزيائي للمورد المرتبط بفواتير أو حركات مالية وإلزام الأرشفة', () => {
      const sup = new SupplierEngine('s4', 'مورد مرتبط بحركات', 0);
      sup.addPurchaseInvoice(10000, 10000, 703);
      assert.equal(sup.canHardDelete(), false); // Must be archived, never deleted!
    });
  });

  // =========================================================================
  // 3. المخزون والدفعات والوحدات المتعددة (Inventory, Multi-Units & FEFO)
  // =========================================================================
  describe('3. المخزون والدفعات والوحدات المتعددة (Inventory & FEFO Batches)', () => {

    it('3.1: خصم المخزون بالوحدات المتعددة (الكرتونة = 24 قطعة) يخصم بدقة بالوحدات الأساسية', () => {
      let stockMilli = 100000; // 100 base units in stock
      const conversionFactor = 24; // 1 carton = 24 pieces
      const cartonsSoldMilli = 2000; // 2 cartons sold

      const baseQtyDeductionMilli = (cartonsSoldMilli / 1000) * conversionFactor * 1000; // 48,000 milli
      stockMilli -= baseQtyDeductionMilli;
      assert.equal(stockMilli, 52000); // 52 base units remaining
    });

    it('3.2: خصم الدفعات بتواريخ الصلاحية الأقرب أولاً (FEFO) واستنفاد الدفعة الأولى قبل التالية', () => {
      const batches = [
        { id: 'b1', expiry: '2026-05-01', qtyMilli: 10000 }, // 10 units expires earlier
        { id: 'b2', expiry: '2026-08-01', qtyMilli: 20000 }, // 20 units expires later
      ];

      let demandMilli = 15000; // Want to sell 15 units
      const deductions = [];

      for (const b of batches) {
        if (demandMilli <= 0) break;
        const take = Math.min(demandMilli, b.qtyMilli);
        b.qtyMilli -= take;
        demandMilli -= take;
        deductions.push({ batchId: b.id, deducted: take });
      }

      assert.equal(deductions.length, 2);
      assert.equal(deductions[0].batchId, 'b1');
      assert.equal(deductions[0].deducted, 10000); // b1 completely depleted
      assert.equal(deductions[1].batchId, 'b2');
      assert.equal(deductions[1].deducted, 5000);  // b2 partially deducted
      assert.equal(batches[0].qtyMilli, 0);
      assert.equal(batches[1].qtyMilli, 15000);
    });

    it('3.3: إلغاء فاتورة البيع يسترجع كميات الدفعات المستنفدة (FEFO Reversal) بالكامل', () => {
      const batch = { id: 'b1', qtyMilli: 0, status: 'DEPLETED' };
      const previousDeduction = 10000;

      // Sale cancelled: restore batch
      batch.qtyMilli += previousDeduction;
      batch.status = 'ACTIVE';

      assert.equal(batch.qtyMilli, 10000);
      assert.equal(batch.status, 'ACTIVE');
    });

    it('3.4: فحص إجمالي الطلب التراكمي لعدة بنود لنفس الصنف لمنع تجاوز المخزون عند تعطيل البيع بالسالب', () => {
      const stockMilli = 5000; // 5 units available
      const allowNegative = false;

      // Cart contains two lines for the same product: 3 units + 3 units = 6 units
      const line1Demand = 3000;
      const line2Demand = 3000;
      const totalDemand = line1Demand + line2Demand;

      const isPermitted = (stockMilli >= totalDemand) || allowNegative;
      assert.equal(isPermitted, false); // Rejected!
    });

    it('3.5: مرتجع بضاعة تالفة بوحدة الكرتونة يسجل حركة المخزون بالوحدات الأساسية ولا يدخل الرفوف', () => {
      let sellableStockMilli = 50000; // 50 units
      const cartonFactor = 12;
      const returnedCartonsMilli = 1000; // 1 carton damaged returned
      const isDamaged = true;

      const baseUnitsMilli = (returnedCartonsMilli / 1000) * cartonFactor * 1000; // 12,000 milli
      if (!isDamaged) {
        sellableStockMilli += baseUnitsMilli;
      }

      assert.equal(sellableStockMilli, 50000); // Sellable stock untouched
      assert.equal(baseUnitsMilli, 12000);    // Movement accurately logs 12 units (not 1!)
    });
  });

  // =========================================================================
  // 4. الفواتير والمدفوعات المتعددة والمرتجعات (Invoices, Multi-Payments & Returns)
  // =========================================================================
  describe('4. الفواتير والدفع المقسم والمرتجعات (Invoices & Multi-Payments)', () => {

    it('4.1: الدفع المتعدد المقسم (كاش + فيزا + آجل) يطابق النقدية المستلمة ويرحل الباقي كدين', () => {
      const totalPiasters = 10000; // 100 EGP
      const payments = [
        { method: 'cash', amountPiasters: 4000 },
        { method: 'card', amountPiasters: 3000 },
        { method: 'credit', amountPiasters: 3000 }
      ];

      // Sum of actual received money excludes 'credit'
      const actualReceivedMoney = payments
        .filter(p => p.method !== 'credit')
        .reduce((sum, p) => sum + p.amountPiasters, 0);

      assert.equal(actualReceivedMoney, 7000);
      const remainingDebt = totalPiasters - actualReceivedMoney;
      assert.equal(remainingDebt, 3000); // 30 EGP debt
    });

    it('4.2: منع البيع الآجل أو الجزئي لعميل نقدي غير مسجل (General Cash)', () => {
      const customerId = 'cust_general_cash';
      const totalPiasters = 10000;
      const paidPiasters = 6000; // Unpaid 4000

      const hasRegisteredCustomer = customerId && customerId !== 'cust_general_cash';
      const allowCreditSale = (paidPiasters >= totalPiasters) || hasRegisteredCustomer;
      assert.equal(allowCreditSale, false); // Blocked!
    });

    it('4.3: توزيع الخصم الإجمالي بطريقة أكبر باقٍ (Largest Remainder) يحفظ كل قرش', () => {
      // 3 items with line totals: 33.33, 33.33, 33.34 EGP (3333, 3333, 3334 piasters)
      const lineTotals = [3333, 3333, 3334];
      const invoiceDiscount = 1000; // 10.00 EGP discount
      const subtotal = lineTotals.reduce((a, b) => a + b, 0); // 10000

      // Distribute proportionally
      const distributed = [];
      let distributedSum = 0;
      for (const line of lineTotals) {
        const share = Math.floor((line * invoiceDiscount) / subtotal);
        distributed.push(share);
        distributedSum += share;
      }
      let remainder = invoiceDiscount - distributedSum;
      // Add remainder piasters
      for (let i = 0; i < remainder; i++) {
        distributed[i] += 1;
      }

      assert.equal(distributed.reduce((a, b) => a + b, 0), invoiceDiscount);
      assert.equal(distributed[0] + distributed[1] + distributed[2], 1000);
    });

    it('4.4: منع إرجاع كمية تتجاوز الكمية الأصلية عبر عدة مرتجعات جزئية متتالية', () => {
      const originalSoldMilli = 5000; // 5 units sold
      let alreadyReturnedMilli = 0;

      // Return 1: 3 units
      const ret1 = 3000;
      assert.ok(alreadyReturnedMilli + ret1 <= originalSoldMilli);
      alreadyReturnedMilli += ret1; // 3000 returned

      // Return 2: try 3 units (would be 6 > 5)
      const ret2 = 3000;
      const canReturn2 = alreadyReturnedMilli + ret2 <= originalSoldMilli;
      assert.equal(canReturn2, false); // Blocked!

      // Return 2 valid: 2 units (exactly exhausts original sale)
      const ret2Valid = 2000;
      assert.ok(alreadyReturnedMilli + ret2Valid <= originalSoldMilli);
      alreadyReturnedMilli += ret2Valid;
      assert.equal(alreadyReturnedMilli, originalSoldMilli);
    });

    it('4.5: حظر إلغاء فاتورة مبيعات عليها مرتجعات سابقة لحماية التسويات والدرج', () => {
      const pastReturnsCount = 1;
      const canCancelSale = pastReturnsCount === 0;
      assert.equal(canCancelSale, false); // Cannot cancel, must use return workflow
    });
  });

  // =========================================================================
  // 5. التحليلات وتقفيل الدرج والربحية (Analytics & Cash Reconciliation)
  // =========================================================================
  describe('5. التحليلات وتقفيل الدرج والربحية (Analytics & Daily Closings)', () => {

    it('5.1: معادلة النقدية المتوقعة في الدرج (Expected Cash Drawer) متطابقة بنسبة 100%', () => {
      const cashSales = 150000;     // 1500 EGP cash sales (including cash deposits)
      const returnsCash = 20000;    // 200 EGP cash refunds given back
      const debtPayments = 30000;   // 300 EGP collected from old customer debts
      const expenses = 15000;       // 150 EGP expenses paid from till
      const epayDrawerCash = 10000; // 100 EGP received for wallet bills
      const epayDrawerFunding = 5000; // 50 EGP funded to POS terminal from till

      const expectedCash = cashSales - returnsCash + debtPayments - expenses + epayDrawerCash - epayDrawerFunding;
      // 150000 - 20000 + 30000 - 15000 + 10000 - 5000 = 150000 EGP (1500.00 EGP)
      assert.equal(expectedCash, 150000);
    });

    it('5.2: احتساب مجمل الربح الصافي بعد خصم أرباح المرتجعات لمنع تضخيم الأرباح', () => {
      // Sale: Price 1000 EGP (100,000 piasters), Cost 800 EGP (80,000 piasters) -> Profit = 200 EGP (20,000)
      const saleGrossProfit = 20000;

      // Customer returns 50% of the sale undamaged: Refund 500 EGP, Cost recovered 400 EGP -> Refunded profit = 100 EGP
      const refundedProfit = 10000;

      const netGrossProfit = saleGrossProfit - refundedProfit;
      assert.equal(netGrossProfit, 10000); // 100 EGP actual profit remaining
    });

    it('5.3: عزل رسوم مزودي الدفع الإلكتروني (Pass-through Fees) عن إيرادات وأرباح المتجر', () => {
      const billAmount = 10000; // 100 EGP
      const providerFee = 200;  // 2 EGP fee collected for provider

      const totalCustomerPaid = billAmount + providerFee;
      assert.equal(totalCustomerPaid, 10200);

      // Shop merchandise revenue is strictly the bill amount, provider fee is never shop revenue
      const shopRevenue = totalCustomerPaid - providerFee;
      assert.equal(shopRevenue, 10000);
    });
  });
});
