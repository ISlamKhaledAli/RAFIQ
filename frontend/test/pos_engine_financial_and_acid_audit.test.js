import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  poundsToPiasters,
  piastersToPounds,
  calculateLineTotal,
  calculateTaxPiasters,
  distributeInvoiceDiscount,
} from '../src/utils/money.ts';

/**
 * =========================================================================================
 * POS Financial Engine Audit Test Suite — Rafiq POS
 * تدقيق الحساب المالي الدقيق بالقروش (Integer Arithmetic) وذرية المعاملات (ACID Rollback)
 * =========================================================================================
 */

describe('POS Engine Financial & ACID Audit (Integer Arithmetic & Atomic Transactions)', () => {

  describe('1. حسابات القروش الصارمة (Integer Financial Arithmetic & Zero Float Leakage)', () => {

    it('1.1: يجب تحويل وتخزين كل المبالغ بالقروش كأعداد صحيحة بدون أي كسر عائم (Zero Float Leak)', () => {
      const inputs = [
        { pounds: 10.50, expectedPiasters: 1050 },
        { pounds: '15.75', expectedPiasters: 1575 },
        { pounds: '١٢.٥٠', expectedPiasters: 1250 }, // Eastern Arabic Numerals
        { pounds: '0.01', expectedPiasters: 1 },
        { pounds: 0, expectedPiasters: 0 },
      ];

      for (const item of inputs) {
        const piasters = poundsToPiasters(item.pounds);
        assert.equal(Number.isInteger(piasters), true, 'المبلغ يجب أن يكون عدداً صحيحاً تماماً');
        assert.equal(piasters, item.expectedPiasters);
        assert.equal(piastersToPounds(piasters), item.expectedPiasters / 100);
      }
    });

    it('1.2: حساب خط الفاتورة للأصناف الوزنية بالمليجرام يطابق تقريب AwayFromZero بالقروش تماماً', () => {
      // 0.333 kg (333 milli-units) at 15.50 EGP/kg (1550 piasters)
      // 1550 * 333 / 1000 = 516.15 -> rounds to 516 piasters (5.16 EGP)
      const line1 = calculateLineTotal(1550, 333);
      assert.equal(line1, 516);
      assert.equal(Number.isInteger(line1), true);

      // 1.750 kg (1750 milli-units) at 45.25 EGP/kg (4525 piasters) with 200 piasters discount
      // 4525 * 1750 / 1000 = 7918.75 -> rounds to 7919 piasters
      // Net = 7919 - 200 = 7719 piasters
      const line2 = calculateLineTotal(4525, 1750, 200);
      assert.equal(line2, 7719);
      assert.equal(Number.isInteger(line2), true);
    });

    it('1.3: حساب الضريبة (14% VAT) شاملة وغير شاملة السعر بدون أي كسور عائمة', () => {
      // Net = (11400 * 100) / 114 = 10000 piasters, Tax = 11400 - 10000 = 1400 piasters
      const taxIncluded = calculateTaxPiasters(11400, 14, true);
      assert.equal(taxIncluded, 1400);
      assert.equal(Number.isInteger(taxIncluded), true);

      // Tax excluded: 10000 * 14 / 100 = 1400 piasters
      const taxExcluded = calculateTaxPiasters(10000, 14, false);
      assert.equal(taxExcluded, 1400);
      assert.equal(Number.isInteger(taxExcluded), true);

      // Fractional case: 100 piasters inclusive of 14%
      // 100 * 100 / 114 = 87.719... -> 88 net piasters, Tax = 12 piasters
      const taxFractional = calculateTaxPiasters(100, 14, true);
      assert.equal(taxFractional, 12);
      assert.equal(Number.isInteger(taxFractional), true);
    });

    it('1.4: خوارزمية Largest Remainder تضمن عدم ضياع أي قرش عند توزيع خصم الفاتورة', () => {
      const items = [
        { grossPiasters: 3333 },
        { grossPiasters: 3333 },
        { grossPiasters: 3334 },
      ];
      const discountToDistribute = 1000; // 10 EGP discount across 3 items
      const distributed = distributeInvoiceDiscount(items, discountToDistribute);

      assert.equal(distributed.length, 3);
      const totalDistributed = distributed.reduce((a, b) => a + b, 0);
      assert.equal(totalDistributed, discountToDistribute, 'مجموع الخصومات الموزعة يجب أن يطابق تماماً الخصم الإجمالي');
      for (const d of distributed) {
        assert.equal(Number.isInteger(d), true, 'كل حصة خصم يجب أن تكون عدداً صحيحاً بالقروش');
      }
    });

    it('1.5: دمج خصم الصنف وخصم الفاتورة بالتسلسل الصحيح بالقروش دون مضاعفة الخصم', () => {
      // Item 1: 10000 piasters (100 EGP), item discount = 1000 piasters (10 EGP) -> net = 9000
      // Item 2: 5000 piasters (50 EGP), item discount = 0 -> net = 5000
      // Total Gross = 15000, Total Net before invoice discount = 14000
      // Invoice discount = 1400 piasters (10% extra)
      const cart = [
        { unitPricePiasters: 10000, quantityMilli: 1000, discountPiasters: 1000 },
        { unitPricePiasters: 5000, quantityMilli: 1000, discountPiasters: 0 },
      ];

      const itemNetList = cart.map(it => ({
        grossPiasters: Math.max(0, it.unitPricePiasters - it.discountPiasters),
      }));

      const extraInvoiceDiscount = 1400;
      const distributedExtra = distributeInvoiceDiscount(itemNetList, extraInvoiceDiscount);

      // Verify item 1 extra discount is 900, item 2 extra discount is 500
      assert.equal(distributedExtra[0], 900);
      assert.equal(distributedExtra[1], 500);

      // Total discount on item 1: 1000 + 900 = 1900 piasters
      // Total discount on item 2: 0 + 500 = 500 piasters
      const finalItem1Discount = cart[0].discountPiasters + distributedExtra[0];
      const finalItem2Discount = cart[1].discountPiasters + distributedExtra[1];
      const totalDiscountCombined = finalItem1Discount + finalItem2Discount;

      assert.equal(finalItem1Discount, 1900);
      assert.equal(finalItem2Discount, 500);
      assert.equal(totalDiscountCombined, 2400); // Exactly 1000 item disc + 1400 invoice disc

      const grandTotal = (10000 + 5000) - totalDiscountCombined;
      assert.equal(grandTotal, 12600); // 126.00 EGP
      assert.equal(Number.isInteger(grandTotal), true);
    });
  });

  describe('2. ذرية المعاملة والـ Rollback التلقائي (ACID Transactions Invariants)', () => {

    class MockAtomicPosDatabase {
      constructor() {
        this.sales = new Map();
        this.saleItems = new Map();
        this.stockQuantityMilli = new Map([
          ['prod_sugar', 10000], // 10 kg
          ['prod_tea', 5000],    // 5 kg
        ]);
        this.payments = [];
        this.customerBalances = new Map([['cust_101', 0]]);
      }

      executeSaleTransaction(saleData, simulateFailureStep = null) {
        // Snapshot for rollback verification
        const snapshot = {
          sales: new Map(this.sales),
          saleItems: new Map(this.saleItems),
          stock: new Map(this.stockQuantityMilli),
          payments: [...this.payments],
          customerBalances: new Map(this.customerBalances),
        };

        try {
          // Step 1: Save Sale Master
          if (simulateFailureStep === 'sale_master') throw new Error('DB_DISK_FULL_ON_SALE');
          this.sales.set(saleData.id, { ...saleData });

          // Step 2: Save Sale Items
          if (simulateFailureStep === 'sale_items') throw new Error('DB_CONSTRAINT_VIOLATION_ITEMS');
          for (const item of saleData.items) {
            this.saleItems.set(item.id, { ...item, saleId: saleData.id });
          }

          // Step 3: Deduct Stock
          if (simulateFailureStep === 'stock_deduction') throw new Error('STOCK_ROW_LOCK_TIMEOUT');
          for (const item of saleData.items) {
            const currentStock = this.stockQuantityMilli.get(item.productId) || 0;
            if (currentStock < item.quantityMilli) {
              throw new Error(`INSUFFICIENT_STOCK_FOR_${item.productId}`);
            }
            this.stockQuantityMilli.set(item.productId, currentStock - item.quantityMilli);
          }

          // Step 4: Record Payments
          if (simulateFailureStep === 'payments') throw new Error('PAYMENT_GATEWAY_TIMEOUT');
          for (const p of saleData.payments) {
            this.payments.push({ ...p, saleId: saleData.id });
          }

          // Step 5: Update Customer Debt if any
          if (simulateFailureStep === 'customer_debt') throw new Error('CUSTOMER_RECORD_LOCKED');
          if (saleData.customerId) {
            const debt = saleData.totalPiasters - saleData.paidPiasters;
            if (debt > 0) {
              const prev = this.customerBalances.get(saleData.customerId) || 0;
              this.customerBalances.set(saleData.customerId, prev + debt);
            }
          }

          // Transaction committed successfully
          return { success: true };
        } catch (error) {
          // Atomic Rollback: Restore exact snapshot
          this.sales = snapshot.sales;
          this.saleItems = snapshot.saleItems;
          this.stockQuantityMilli = snapshot.stock;
          this.payments = snapshot.payments;
          this.customerBalances = snapshot.customerBalances;
          return { success: false, error: error.message };
        }
      }
    }

    it('2.1: المعاملة الذرية الناجحة تخصم المخزون وتحفظ الفاتورة والمدفوعات بالكامل', () => {
      const db = new MockAtomicPosDatabase();
      const validSale = {
        id: 'sale_001',
        totalPiasters: 5000,
        paidPiasters: 5000,
        customerId: 'cust_101',
        items: [
          { id: 'item_1', productId: 'prod_sugar', quantityMilli: 2000, unitPricePiasters: 2500 }
        ],
        payments: [
          { id: 'pay_1', amountPiasters: 5000, method: 'cash' }
        ]
      };

      const result = db.executeSaleTransaction(validSale);
      assert.equal(result.success, true);
      assert.equal(db.sales.has('sale_001'), true);
      assert.equal(db.saleItems.has('item_1'), true);
      assert.equal(db.stockQuantityMilli.get('prod_sugar'), 8000, 'يجب خصم 2 كجم من رصيد السكر (10 - 2 = 8)');
      assert.equal(db.payments.length, 1);
    });

    it('2.2: الفشل في خصم المخزون يلغي حفظ الفاتورة فورياً ولا يترك أي سجلات مشوهة (Rollback on Stock Failure)', () => {
      const db = new MockAtomicPosDatabase();
      const failingSale = {
        id: 'sale_fail_stock',
        totalPiasters: 5000,
        paidPiasters: 5000,
        customerId: 'cust_101',
        items: [
          { id: 'item_f1', productId: 'prod_sugar', quantityMilli: 2000, unitPricePiasters: 2500 }
        ],
        payments: [
          { id: 'pay_f1', amountPiasters: 5000, method: 'cash' }
        ]
      };

      const result = db.executeSaleTransaction(failingSale, 'stock_deduction');
      assert.equal(result.success, false);
      assert.equal(result.error, 'STOCK_ROW_LOCK_TIMEOUT');

      // Verify ZERO orphan records exist after rollback
      assert.equal(db.sales.has('sale_fail_stock'), false, 'الفاتورة لا يجب أن تتواجد بعد التراجع');
      assert.equal(db.saleItems.has('item_f1'), false, 'بنود الفاتورة يجب أن تُلغى بالكامل');
      assert.equal(db.stockQuantityMilli.get('prod_sugar'), 10000, 'رصيد المخزن يجب أن يظل 10000 دون أي تغيير');
      assert.equal(db.payments.length, 0, 'المدفوعات لا يجب أن تُسجل');
    });

    it('2.3: الفشل في تسجيل المدفوعات يسترجع رصيد المخزن المحجوز فورياً (Rollback on Payment Failure)', () => {
      const db = new MockAtomicPosDatabase();
      const failingSale = {
        id: 'sale_fail_pay',
        totalPiasters: 5000,
        paidPiasters: 5000,
        customerId: 'cust_101',
        items: [
          { id: 'item_f2', productId: 'prod_tea', quantityMilli: 1000, unitPricePiasters: 5000 }
        ],
        payments: [
          { id: 'pay_f2', amountPiasters: 5000, method: 'instapay' }
        ]
      };

      const result = db.executeSaleTransaction(failingSale, 'payments');
      assert.equal(result.success, false);
      assert.equal(result.error, 'PAYMENT_GATEWAY_TIMEOUT');

      // Verify stock was NOT deducted permanently
      assert.equal(db.stockQuantityMilli.get('prod_tea'), 5000, 'رصيد الشاي يجب أن يظل 5000 دون أي خصم');
      assert.equal(db.sales.has('sale_fail_pay'), false);
    });

    it('2.4: الفشل في تحديث دفتر حساب العميل يلغي المعاملة كاملة ويمنع تفاوت الحسابات', () => {
      const db = new MockAtomicPosDatabase();
      const creditSale = {
        id: 'sale_credit_fail',
        totalPiasters: 8000,
        paidPiasters: 0,
        customerId: 'cust_101',
        items: [
          { id: 'item_f3', productId: 'prod_sugar', quantityMilli: 1000, unitPricePiasters: 8000 }
        ],
        payments: []
      };

      const result = db.executeSaleTransaction(creditSale, 'customer_debt');
      assert.equal(result.success, false);
      assert.equal(result.error, 'CUSTOMER_RECORD_LOCKED');

      assert.equal(db.customerBalances.get('cust_101'), 0, 'رصيد العميل لا يجب أن يتغير عند فشل القيد');
      assert.equal(db.sales.has('sale_credit_fail'), false);
      assert.equal(db.stockQuantityMilli.get('prod_sugar'), 10000);
    });
  });
});
