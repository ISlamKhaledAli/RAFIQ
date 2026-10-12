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
 * Comprehensive Senior Engineering Test Suite: Equations, Operations & Reversibility
 * مجموعة الاختبارات الشاملة للمعادلات والعمليات الحسابية والعمليات وانعكاساتها (الفعل وعكسه)
 * =========================================================================================
 *
 * Covers:
 * 1. Financial Arithmetic & Rounding Invariants (القروش، الفواصل العشرية، التقريب المالي)
 * 2. Fractional Weights & Milli-unit Precision (الأوزان بالمليجرام وسعر الكيلو)
 * 3. Multi-unit Conversions (الكرتونة والعلبة والقطعة وحساب التكلفة)
 * 4. Egyptian Retail VAT Invariants (ضريبة القيمة المضافة 14% شاملة وغير شاملة)
 * 5. Invoice Discount Distribution without Piaster Loss (خوارزمية أكبر باقٍ)
 * 6. Inventory Weighted Average Cost (WAC) (المتوسط المرجح للتكلفة)
 * 7. Daily Cash Drawer Balance & Closing (معادلة تقفيل الدرج والوردية)
 * 8. Transaction Reversibility: Sale -> Sale Cancellation (البيع وإلغاء البيع)
 * 9. Transaction Reversibility: Sale -> Partial Return with Proportional Discount Refund
 * 10. Ledger Reversibility: Credit Sale -> Payment -> Payment Cancellation (الآجل والسداد وإلغاؤه)
 * 11. Supplier Reversibility: Purchase -> Purchase Return (المشتريات ومرتجع المشتريات)
 * 12. Stock Adjustment Reversibility: Deficit -> Recount Correction (تسوية الجرد وتصحيحها)
 * 13. Numerals Parsing & Formatting Idempotency (توحيد الأرقام المشرقية والفارسية)
 */

describe('Senior Engineering Test Suite: Equations, Operations & Reversibility', () => {

  // ---------------------------------------------------------------------------------------
  // SECTION 1: Exact Integer Financial Arithmetic (المعادلات الرياضية والمالية بدقة القروش)
  // ---------------------------------------------------------------------------------------
  describe('1. Exact Integer Financial Arithmetic & Float Drift Immunity', () => {
    it('eliminates IEEE 754 floating point drift on cumulative additions', () => {
      // Classic float bug: 0.1 + 0.2 === 0.30000000000000004
      const floatSum = 0.1 + 0.2;
      assert.notEqual(floatSum, 0.3); // Proves float problem exists in raw JS

      // With Rafiq POS Integer Piasters:
      const p1 = poundsToPiasters(0.10); // 10 piasters
      const p2 = poundsToPiasters(0.20); // 20 piasters
      const totalPiasters = p1 + p2;      // 30 piasters
      assert.equal(totalPiasters, 30);
      assert.equal(piastersToPounds(totalPiasters), 0.30);
    });

    it('guarantees roundtrip invariance: pounds -> piasters -> pounds', () => {
      const testValues = [0, 0.01, 0.05, 0.50, 1.00, 15.75, 99.99, 1250.50, 100000.00];
      for (const val of testValues) {
        const piasters = poundsToPiasters(val);
        const reconstructedPounds = piastersToPounds(piasters);
        assert.equal(reconstructedPounds, val);
      }
    });

    it('correctly rounds half-piasters away from zero on fractional calculations', () => {
      // 14.285 EGP -> 1429 piasters
      assert.equal(poundsToPiasters(14.285), 1429);
      // 14.284 EGP -> 1428 piasters
      assert.equal(poundsToPiasters(14.284), 1428);
      // String with arabic decimal comma and point
      assert.equal(poundsToPiasters('14٫50'), 1450);
      assert.equal(poundsToPiasters('14،50'), 1450);
      assert.equal(poundsToPiasters('1,250.50'), 125050);
    });

    it('handles negative, zero, and malformed inputs safely without crashing', () => {
      assert.equal(poundsToPiasters(0), 0);
      assert.equal(poundsToPiasters(''), 0);
      assert.equal(poundsToPiasters(null), 0);
      assert.equal(poundsToPiasters(undefined), 0);
      assert.equal(poundsToPiasters('invalid_string'), 0);
    });

    it('formats Egyptian currency string accurately with standard arabic currency mark', () => {
      assert.equal(formatArabicCurrency(1550, true), '15.50 ج.م');
      assert.equal(formatArabicCurrency(1550, false), '15.50');
      assert.equal(formatArabicCurrency(100000, true), '1,000.00 ج.م');
      assert.equal(formatArabicCurrency(5, true), '0.05 ج.م');
    });
  });

  // ---------------------------------------------------------------------------------------
  // SECTION 2: Fractional Weights & Milli-Units (الأوزان بالمليجرام وسعر الكيلو)
  // ---------------------------------------------------------------------------------------
  describe('2. Weight Equations & Milli-Unit Arithmetic', () => {
    it('calculates weighted items accurately down to the exact piaster for arbitrary grams', () => {
      // Roumy Cheese: 240.00 EGP / kg (24,000 piasters per 1,000g). Cashier sells 327 grams:
      // (24000 * 327) / 1000 = 7848 piasters (78.48 EGP)
      const cheeseTotal = calculateLineTotal(24000, 327, 0);
      assert.equal(cheeseTotal, 7848);

      // White Cheese: 115.50 EGP / kg (11,550 piasters per 1,000g). Cashier sells 850 grams:
      // (11550 * 850) / 1000 = 9817.5 -> rounds to 9818 piasters (98.18 EGP)
      const fetaTotal = calculateLineTotal(11550, 850, 0);
      assert.equal(fetaTotal, 9818);
    });

    it('clamps line totals to zero when line discount exceeds gross price', () => {
      const normal = calculateLineTotal(5000, 1000, 1000); // 50 EGP - 10 EGP = 40 EGP (4000 piasters)
      assert.equal(normal, 4000);

      const excessiveDiscount = calculateLineTotal(5000, 1000, 9000); // 50 EGP - 90 EGP -> clamped at 0
      assert.equal(excessiveDiscount, 0);
    });

    it('converts weight inputs in kg string with Arabic/Western notations to integer milligrams', () => {
      function parseWeightKgToMilli(input) {
        const normalized = normalizeArabicNumerals(input).replace(/,/g, '.');
        const num = parseFloat(normalized);
        if (isNaN(num) || num <= 0) return 0;
        return Math.round(num * 1000);
      }

      assert.equal(parseWeightKgToMilli('1.5'), 1500);
      assert.equal(parseWeightKgToMilli('0.350'), 350);
      assert.equal(parseWeightKgToMilli('١٫٢٥٠'), 1250);
      assert.equal(parseWeightKgToMilli('٠٫٠٥٠'), 50);
    });
  });

  // ---------------------------------------------------------------------------------------
  // SECTION 3: Multi-Unit Conversions (الكرتونة والعلبة والقطعة)
  // ---------------------------------------------------------------------------------------
  describe('3. Multi-Unit Conversions & Carton vs Piece Price/Cost Equations', () => {
    it('correctly tracks stock deduction and line price when selling cartons vs individual pieces', () => {
      const product = {
        id: 'prod_tuna',
        name: 'تونة صن شاين',
        unit: 'piece',
        stockMilli: 240000, // 240 cans in stock (base units in milli)
        piecesPerCarton: 24,
        piecePricePiasters: 4500, // 45.00 EGP per can
        cartonPricePiasters: 98000, // 980.00 EGP per carton (wholesale discount vs 24 * 45 = 1080.00 EGP)
        cartonCostPiasters: 84000, // 840.00 EGP cost per carton
      };

      // Scenario A: Customer buys 2 cartons
      const cartonsSold = 2;
      const stockDeductedA = cartonsSold * product.piecesPerCarton * 1000; // 48,000 milli-units (48 cans)
      const revenueA = cartonsSold * product.cartonPricePiasters; // 196,000 piasters
      assert.equal(stockDeductedA, 48000);
      assert.equal(revenueA, 196000);

      // Scenario B: Customer buys 24 individual cans
      const piecesSold = 24;
      const stockDeductedB = piecesSold * 1000; // 24,000 milli-units (24 cans)
      const revenueB = piecesSold * product.piecePricePiasters; // 24 * 4500 = 108,000 piasters
      assert.equal(stockDeductedB, 24000);
      assert.equal(revenueB, 108000);

      // Derived unit cost per piece equation:
      const derivedPieceCost = Math.round(product.cartonCostPiasters / product.piecesPerCarton);
      assert.equal(derivedPieceCost, 3500); // 35.00 EGP per can
      const cartonCostCheck = derivedPieceCost * product.piecesPerCarton;
      assert.equal(cartonCostCheck, product.cartonCostPiasters);
    });
  });

  // ---------------------------------------------------------------------------------------
  // SECTION 4: Egyptian Retail VAT Equations (معادلة ضريبة القيمة المضافة 14%)
  // ---------------------------------------------------------------------------------------
  describe('4. Egyptian Retail VAT 14% Invariants (Tax-Inclusive vs Tax-Exclusive)', () => {
    it('calculates tax-inclusive net and vat where net + vat strictly equals total gross', () => {
      const grossTotals = [11400, 22800, 5000, 1375, 100, 9999];

      for (const gross of grossTotals) {
        const vat = calculateTaxPiasters(gross, 14, true);
        const net = gross - vat;
        // Verify identity: net + vat === gross
        assert.equal(net + vat, gross, `Failed for gross ${gross}`);
        assert.ok(vat >= 0);
        assert.ok(net >= 0);
      }
    });

    it('verifies exact math for standard 114.00 EGP tax-inclusive item', () => {
      // 114.00 EGP inclusive of 14% VAT: Net = 100.00 EGP, Tax = 14.00 EGP
      const vat = calculateTaxPiasters(11400, 14, true);
      assert.equal(vat, 1400); // 14.00 EGP
      const net = 11400 - vat;
      assert.equal(net, 10000); // 100.00 EGP
    });

    it('calculates tax-exclusive correctly: vat = round(net * 14 / 100)', () => {
      const net = 10000; // 100.00 EGP
      const vat = calculateTaxPiasters(net, 14, false);
      assert.equal(vat, 1400);
      const gross = net + vat;
      assert.equal(gross, 11400);
    });

    it('returns zero vat when tax rate is 0%', () => {
      assert.equal(calculateTaxPiasters(25000, 0, true), 0);
      assert.equal(calculateTaxPiasters(25000, 0, false), 0);
    });
  });

  // ---------------------------------------------------------------------------------------
  // SECTION 5: Invoice Discount Distribution & Calculation (Zero Piaster Leakage)
  // ---------------------------------------------------------------------------------------
  describe('5. Invoice Discount Calculation & Distribution (Zero Piaster Leakage)', () => {
    it('calculates fixed and percentage discounts accurately with strict bounds clamping', () => {
      // Fixed amount discount: 15.50 EGP on a 100.00 EGP gross item
      const fixedDisc = calculateDiscountAmount(10000, 'amount', 15.50);
      assert.equal(fixedDisc, 1550); // 1550 piasters

      // Percentage discount: 15% on 200.00 EGP (20,000 piasters)
      const pctDisc = calculateDiscountAmount(20000, 'percent', 15);
      assert.equal(pctDisc, 3000); // 3000 piasters (30.00 EGP)

      // Clamping: discount cannot exceed gross total
      const clampedFixed = calculateDiscountAmount(3000, 'amount', 50.00);
      assert.equal(clampedFixed, 3000);

      const clampedPct = calculateDiscountAmount(3000, 'percent', 150);
      assert.equal(clampedPct, 3000);

      // Safe defense against zero or negative values
      assert.equal(calculateDiscountAmount(3000, 'amount', -10), 0);
      assert.equal(calculateDiscountAmount(0, 'percent', 10), 0);
    });

    it('distributes discount across items where the sum of line discounts strictly matches total discount', () => {
      // 3 items with prices: 3,500, 4,200, and 1,700 piasters (Subtotal: 9,400 piasters = 94.00 EGP)
      // Cashier gives a 10.00 EGP invoice discount (1,000 piasters)
      const items = [
        { grossPiasters: 3500 },
        { grossPiasters: 4200 },
        { grossPiasters: 1700 },
      ];
      const discountPiasters = 1000;

      const distributed = distributeInvoiceDiscount(items, discountPiasters);
      const totalDistributed = distributed.reduce((sum, d) => sum + d, 0);

      // Invariant 1: Zero Piaster Leakage (sum === total)
      assert.equal(totalDistributed, discountPiasters);

      // Invariant 2: Proportional distribution
      // Item 1 (3500/9400 * 1000 = 372.34 -> 372 or 373)
      // Item 2 (4200/9400 * 1000 = 446.80 -> 447)
      // Item 3 (1700/9400 * 1000 = 180.85 -> 181)
      assert.equal(distributed[0], 372);
      assert.equal(distributed[1], 447);
      assert.equal(distributed[2], 181);
      assert.equal(372 + 447 + 181, 1000);
    });

    it('caps total discount at subtotal when cashier gives 100% or excess discount', () => {
      const items = [
        { grossPiasters: 1000 },
        { grossPiasters: 2000 },
      ];
      // Subtotal is 3000 piasters. Cashier attempts to discount 5000 piasters:
      const distributed = distributeInvoiceDiscount(items, 5000);
      assert.deepEqual(distributed, [1000, 2000]);
      assert.equal(distributed.reduce((s, d) => s + d, 0), 3000);
    });

    it('handles cart with zero-priced or promotional gift items without throwing divide-by-zero', () => {
      const items = [
        { grossPiasters: 5000 },
        { grossPiasters: 0 }, // Free promo sample
        { grossPiasters: 5000 },
      ];
      const distributed = distributeInvoiceDiscount(items, 1000);
      assert.equal(distributed[1], 0); // Zero priced item gets 0 discount
      assert.equal(distributed[0] + distributed[2], 1000);
    });
  });

  // ---------------------------------------------------------------------------------------
  // SECTION 6: Weighted Average Cost (WAC) Equation (المتوسط المرجح للتكلفة)
  // ---------------------------------------------------------------------------------------
  describe('6. Inventory Weighted Average Cost (WAC) Equation', () => {
    function calculateNewWAC(currentStockMilli, currentCostPiasters, incomingStockMilli, incomingCostPiasters) {
      if (currentStockMilli <= 0) return incomingCostPiasters;
      const totalStockMilli = currentStockMilli + incomingStockMilli;
      if (totalStockMilli <= 0) return currentCostPiasters;

      const totalValuation = (currentStockMilli * currentCostPiasters) + (incomingStockMilli * incomingCostPiasters);
      return Math.round(totalValuation / totalStockMilli);
    }

    it('accurately computes WAC when new shipment arrives at higher cost', () => {
      // Existing: 100 units at 500 piasters (5.00 EGP)
      // Incoming: 50 units at 650 piasters (6.50 EGP)
      // New WAC = ((100 * 500) + (50 * 650)) / 150 = (50000 + 32500) / 150 = 82500 / 150 = 550 piasters
      const newCost = calculateNewWAC(100000, 500, 50000, 650);
      assert.equal(newCost, 550);
    });

    it('returns incoming cost directly when previous stock was zero', () => {
      const newCost = calculateNewWAC(0, 500, 40000, 720);
      assert.equal(newCost, 720);
    });

    it('preserves exact integer rounding on odd fractional average costs', () => {
      // 10 units at 1000 piasters + 7 units at 1450 piasters:
      // (10 * 1000 + 7 * 1450) / 17 = (10000 + 10150) / 17 = 20150 / 17 = 1185.294 -> 1185 piasters
      const newCost = calculateNewWAC(10000, 1000, 7000, 1450);
      assert.equal(newCost, 1185);
    });
  });

  // ---------------------------------------------------------------------------------------
  // SECTION 7: Cash Drawer Closing Equation (معادلة إغلاق الدرج والوردية)
  // ---------------------------------------------------------------------------------------
  describe('7. Daily Shift Cash Drawer Equation & Discrepancy Classification', () => {
    function computeShiftClosing({
      openingCashPiasters,
      cashSalesPiasters,
      customerCashPaymentsPiasters,
      cashReturnsPiasters,
      cashPurchasesPiasters,
      paidExpensesPiasters,
      actualCountedCashPiasters,
    }) {
      const expectedCashPiasters =
        openingCashPiasters +
        cashSalesPiasters +
        customerCashPaymentsPiasters -
        cashReturnsPiasters -
        cashPurchasesPiasters -
        paidExpensesPiasters;

      const discrepancyPiasters = actualCountedCashPiasters - expectedCashPiasters;

      let status = 'MATCHED';
      if (discrepancyPiasters > 0) status = 'SURPLUS'; // زيادة بالدرج
      else if (discrepancyPiasters < 0) status = 'SHORTAGE'; // عجز بالدرج

      return {
        expectedCashPiasters,
        discrepancyPiasters,
        status,
      };
    }

    it('evaluates exact matched drawer when cash count is identical to expected', () => {
      const result = computeShiftClosing({
        openingCashPiasters: 50000,         // 500.00 EGP
        cashSalesPiasters: 250000,          // 2500.00 EGP
        customerCashPaymentsPiasters: 30000,// 300.00 EGP
        cashReturnsPiasters: 15000,         // -150.00 EGP
        cashPurchasesPiasters: 40000,       // -400.00 EGP
        paidExpensesPiasters: 25000,        // -250.00 EGP
        actualCountedCashPiasters: 250000,  // 500 + 2500 + 300 - 150 - 400 - 250 = 2500.00 EGP
      });

      assert.equal(result.expectedCashPiasters, 250000);
      assert.equal(result.discrepancyPiasters, 0);
      assert.equal(result.status, 'MATCHED');
    });

    it('detects cash shortage (عجز بالدرج) accurately as a negative discrepancy', () => {
      const result = computeShiftClosing({
        openingCashPiasters: 10000,
        cashSalesPiasters: 90000,
        customerCashPaymentsPiasters: 0,
        cashReturnsPiasters: 0,
        cashPurchasesPiasters: 0,
        paidExpensesPiasters: 0,
        actualCountedCashPiasters: 95000, // Expected 100,000, actual 95,000 -> 50.00 EGP shortage
      });

      assert.equal(result.expectedCashPiasters, 100000);
      assert.equal(result.discrepancyPiasters, -5000);
      assert.equal(result.status, 'SHORTAGE');
    });

    it('detects cash surplus (زيادة بالدرج) accurately as a positive discrepancy', () => {
      const result = computeShiftClosing({
        openingCashPiasters: 10000,
        cashSalesPiasters: 50000,
        customerCashPaymentsPiasters: 0,
        cashReturnsPiasters: 0,
        cashPurchasesPiasters: 0,
        paidExpensesPiasters: 0,
        actualCountedCashPiasters: 62000, // Expected 60,000, actual 62,000 -> 20.00 EGP surplus
      });

      assert.equal(result.expectedCashPiasters, 60000);
      assert.equal(result.discrepancyPiasters, 2000);
      assert.equal(result.status, 'SURPLUS');
    });
  });

  // ---------------------------------------------------------------------------------------
  // SECTION 8: Transaction Reversibility: Sale -> Cancel Sale (الفعل وعكسه: البيع وإلغاؤه)
  // ---------------------------------------------------------------------------------------
  describe('8. Transaction Reversibility: Sale Execution vs Atomic Sale Cancellation', () => {
    class MockPosStore {
      constructor() {
        this.stockMilli = 50000; // 50 items (50,000 milli)
        this.drawerCashPiasters = 100000; // 1,000.00 EGP
        this.customerDebtPiasters = 0;
        this.sales = new Map();
        this.stockMovements = [];
      }

      executeSale({ saleId, qtyMilli, unitPricePiasters, cashPaidPiasters, creditPiasters, customerId }) {
        if (this.sales.has(saleId)) throw new Error('Sale already exists');

        const totalPiasters = Math.round((unitPricePiasters * qtyMilli) / 1000);
        assert.equal(cashPaidPiasters + creditPiasters, totalPiasters, 'Payment must match total');

        // Apply changes
        this.stockMilli -= qtyMilli;
        this.drawerCashPiasters += cashPaidPiasters;
        if (creditPiasters > 0 && customerId) {
          this.customerDebtPiasters += creditPiasters;
        }

        // Ledger movement
        this.stockMovements.push({
          type: 'SALE',
          saleId,
          qtyMilli: -qtyMilli,
        });

        const saleRecord = {
          id: saleId,
          qtyMilli,
          unitPricePiasters,
          totalPiasters,
          cashPaidPiasters,
          creditPiasters,
          customerId,
          isCancelled: false,
        };
        this.sales.set(saleId, saleRecord);
        return saleRecord;
      }

      cancelSale({ saleId, reason, cashierName }) {
        const sale = this.sales.get(saleId);
        if (!sale) throw new Error('Sale not found');
        if (sale.isCancelled) throw new Error('لا يمكن إلغاء فاتورة ملغاة مسبقاً');

        // Reversal of all financial and stock effects
        this.stockMilli += sale.qtyMilli; // Exact restoration
        this.drawerCashPiasters -= sale.cashPaidPiasters; // Contra drawer adjustment
        if (sale.creditPiasters > 0 && sale.customerId) {
          this.customerDebtPiasters -= sale.creditPiasters; // Contra customer credit adjustment
        }

        // Immutable contra stock movement (Never hard delete!)
        this.stockMovements.push({
          type: 'SALE_CANCEL',
          saleId,
          qtyMilli: sale.qtyMilli,
          reason,
          cashierName,
        });

        sale.isCancelled = true;
        sale.cancelledAt = Date.now();
        sale.cancelReason = reason;
      }
    }

    it('completely restores stock, drawer cash, and customer debt upon sale cancellation', () => {
      const store = new MockPosStore();
      const initialStock = store.stockMilli;
      const initialDrawer = store.drawerCashPiasters;
      const initialDebt = store.customerDebtPiasters;

      // Cashier completes mixed payment sale: 5 items for 2500 piasters cash + 2500 piasters credit
      store.executeSale({
        saleId: 'inv_101',
        qtyMilli: 5000,
        unitPricePiasters: 1000,
        cashPaidPiasters: 2500,
        creditPiasters: 2500,
        customerId: 'cust_ahmed',
      });

      // Verify intermediate post-sale state
      assert.equal(store.stockMilli, initialStock - 5000);
      assert.equal(store.drawerCashPiasters, initialDrawer + 2500);
      assert.equal(store.customerDebtPiasters, initialDebt + 2500);

      // Cashier cancels the invoice
      store.cancelSale({
        saleId: 'inv_101',
        reason: 'طلب العميل إلغاء الطلب بعد الدفع',
        cashierName: 'أحمد كاشير',
      });

      // INVARIANT: State after cancellation MUST be 100% identical to initial state
      assert.equal(store.stockMilli, initialStock, 'Stock must return to initial value');
      assert.equal(store.drawerCashPiasters, initialDrawer, 'Drawer cash must return to initial value');
      assert.equal(store.customerDebtPiasters, initialDebt, 'Customer debt must return to initial value');

      // Verify zero hard-delete: original sale still exists, marked isCancelled
      const cancelledSale = store.sales.get('inv_101');
      assert.ok(cancelledSale);
      assert.equal(cancelledSale.isCancelled, true);

      // Verify stock movements: 1 negative (SALE) and 1 positive (SALE_CANCEL)
      assert.equal(store.stockMovements.length, 2);
      const netMovement = store.stockMovements.reduce((sum, m) => sum + m.qtyMilli, 0);
      assert.equal(netMovement, 0, 'Net stock movement of cancelled sale must be exactly zero');
    });

    it('prevents double cancellation strictly (Idempotency Guard)', () => {
      const store = new MockPosStore();
      store.executeSale({
        saleId: 'inv_102',
        qtyMilli: 2000,
        unitPricePiasters: 1000,
        cashPaidPiasters: 2000,
        creditPiasters: 0,
      });

      store.cancelSale({ saleId: 'inv_102', reason: 'خطأ', cashierName: 'كاشير' });

      // Attempting to cancel a second time must throw
      assert.throws(() => {
        store.cancelSale({ saleId: 'inv_102', reason: 'محاولة إلغاء مكررة', cashierName: 'كاشير' });
      }, /لا يمكن إلغاء فاتورة ملغاة مسبقاً/);
    });
  });

  // ---------------------------------------------------------------------------------------
  // SECTION 9: Transaction Reversibility: Sale -> Partial Return with Proportional Discount
  // ---------------------------------------------------------------------------------------
  describe('9. Transaction Reversibility: Sale vs Partial Return & Proportional Refund', () => {
    class ReturnSimulator {
      constructor() {
        this.stockMilli = 20000; // 20 units
        this.drawerCash = 50000;
        this.returns = [];
      }

      processPartialReturn({ saleItem, returnQtyMilli }) {
        const remainingQtyMilli = saleItem.soldQtyMilli - saleItem.returnedQtyMilli;
        if (returnQtyMilli <= 0) {
          throw new Error('كمية المرتجع يجب أن تكون أكبر من الصفر');
        }
        if (returnQtyMilli > remainingQtyMilli) {
          throw new Error('الكمية المرتجعة تتجاوز الكمية المتبقية من البيعة');
        }

        // Net price paid per unit after distributed discount:
        // effectiveUnitPricePiasters = netLinePiasters / soldQtyMilli
        const effectiveUnitPricePiasters = saleItem.netLinePiasters / saleItem.soldQtyMilli;
        const refundAmountPiasters = Math.round(effectiveUnitPricePiasters * returnQtyMilli);

        // Update state
        saleItem.returnedQtyMilli += returnQtyMilli;
        this.stockMilli += returnQtyMilli;
        this.drawerCash -= refundAmountPiasters;

        const record = {
          returnQtyMilli,
          refundAmountPiasters,
        };
        this.returns.push(record);
        return record;
      }
    }

    it('calculates proportional refund correctly when item had line discount, protecting the store from loss', () => {
      const sim = new ReturnSimulator();

      // Customer bought 10 units at 1000 piasters each (Gross = 10,000 piasters = 100.00 EGP)
      // Customer received a 20.00 EGP discount (2,000 piasters)
      // Net paid: 8,000 piasters = 800 piasters per unit (8.00 EGP per unit)
      const saleItem = {
        soldQtyMilli: 10000,
        grossLinePiasters: 10000,
        discountPiasters: 2000,
        netLinePiasters: 8000,
        returnedQtyMilli: 0,
      };

      // Customer returns 3 units:
      // Refund MUST be 3 * 800 = 2400 piasters (NOT 3 * 1000 = 3000 piasters!)
      const ret1 = sim.processPartialReturn({ saleItem, returnQtyMilli: 3000 });
      assert.equal(ret1.refundAmountPiasters, 2400);
      assert.equal(saleItem.returnedQtyMilli, 3000);
      assert.equal(sim.stockMilli, 23000);

      // Customer returns the remaining 7 units:
      // Refund MUST be 7 * 800 = 5600 piasters
      const ret2 = sim.processPartialReturn({ saleItem, returnQtyMilli: 7000 });
      assert.equal(ret2.refundAmountPiasters, 5600);
      assert.equal(saleItem.returnedQtyMilli, 10000);
      assert.equal(sim.stockMilli, 30000); // All 10 units restored to stock

      // Total refunded across both returns strictly matches total net paid: 2400 + 5600 === 8000
      assert.equal(ret1.refundAmountPiasters + ret2.refundAmountPiasters, saleItem.netLinePiasters);
    });

    it('rejects returns that exceed original purchased quantity', () => {
      const sim = new ReturnSimulator();
      const saleItem = {
        soldQtyMilli: 5000,
        grossLinePiasters: 5000,
        discountPiasters: 0,
        netLinePiasters: 5000,
        returnedQtyMilli: 0,
      };

      // Return 4 units
      sim.processPartialReturn({ saleItem, returnQtyMilli: 4000 });

      // Attempting to return 2 more units (4 + 2 = 6 > 5) must throw
      assert.throws(() => {
        sim.processPartialReturn({ saleItem, returnQtyMilli: 2000 });
      }, /الكمية المرتجعة تتجاوز الكمية المتبقية من البيعة/);
    });
  });

  // ---------------------------------------------------------------------------------------
  // SECTION 10: Ledger Reversibility: Credit Sale -> Payment -> Payment Cancellation
  // ---------------------------------------------------------------------------------------
  describe('10. Customer Ledger Reversibility: Credit Sale vs Debt Payment vs Cancellation', () => {
    class CustomerLedgerSimulator {
      constructor() {
        this.balancePiasters = 0;
        this.ledger = [];
        this.drawerCashPiasters = 100000;
      }

      addCreditSale({ saleId, amountPiasters }) {
        this.balancePiasters += amountPiasters;
        this.ledger.push({
          id: `led_sale_${saleId}`,
          type: 'SALE',
          amountPiasters,
          referenceId: saleId,
        });
      }

      recordPayment({ paymentId, amountPiasters }) {
        if (amountPiasters <= 0) throw new Error('قيمة السداد يجب أن تكون موجبة');
        this.balancePiasters -= amountPiasters;
        this.drawerCashPiasters += amountPiasters;
        this.ledger.push({
          id: paymentId,
          type: 'PAYMENT',
          amountPiasters,
          isCancelled: false,
        });
      }

      cancelPayment({ paymentId, reason }) {
        const payment = this.ledger.find(e => e.id === paymentId && e.type === 'PAYMENT');
        if (!payment) throw new Error('حركة السداد غير موجودة');
        if (payment.isCancelled) throw new Error('تم إلغاء هذه الدفعة مسبقاً');

        // Reversal: balance goes back up, drawer cash goes back down
        this.balancePiasters += payment.amountPiasters;
        this.drawerCashPiasters -= payment.amountPiasters;

        payment.isCancelled = true;
        this.ledger.push({
          id: `led_cancel_${paymentId}`,
          type: 'PAYMENT_CANCEL',
          amountPiasters: payment.amountPiasters,
          referenceId: paymentId,
          reason,
        });
      }

      verifyCalculatedBalance() {
        let calculated = 0;
        for (const entry of this.ledger) {
          if (entry.type === 'SALE' || entry.type === 'PAYMENT_CANCEL') {
            calculated += entry.amountPiasters;
          } else if (entry.type === 'PAYMENT') {
            calculated -= entry.amountPiasters;
          }
        }
        return calculated;
      }
    }

    it('verifies that payment cancellation restores customer balance and drawer cash to exact prior state', () => {
      const ledgerSim = new CustomerLedgerSimulator();

      // Customer buys 50.00 EGP on credit
      ledgerSim.addCreditSale({ saleId: 'sale_1', amountPiasters: 5000 });
      assert.equal(ledgerSim.balancePiasters, 5000);
      assert.equal(ledgerSim.verifyCalculatedBalance(), 5000);

      const balanceBeforePayment = ledgerSim.balancePiasters;
      const drawerBeforePayment = ledgerSim.drawerCashPiasters;

      // Customer pays 30.00 EGP cash
      ledgerSim.recordPayment({ paymentId: 'pay_001', amountPiasters: 3000 });
      assert.equal(ledgerSim.balancePiasters, 2000);
      assert.equal(ledgerSim.drawerCashPiasters, drawerBeforePayment + 3000);
      assert.equal(ledgerSim.verifyCalculatedBalance(), 2000);

      // Cashier cancels the payment (e.g. entered on wrong customer profile)
      ledgerSim.cancelPayment({ paymentId: 'pay_001', reason: 'سجلت للعميل الخطأ' });

      // INVARIANT: Balance and Drawer cash MUST return to exact state before payment
      assert.equal(ledgerSim.balancePiasters, balanceBeforePayment);
      assert.equal(ledgerSim.drawerCashPiasters, drawerBeforePayment);
      assert.equal(ledgerSim.verifyCalculatedBalance(), balanceBeforePayment);
    });
  });

  // ---------------------------------------------------------------------------------------
  // SECTION 11: Supplier Reversibility: Purchase -> Purchase Return
  // ---------------------------------------------------------------------------------------
  describe('11. Supplier Reversibility: Purchase vs Purchase Return', () => {
    it('restores supplier debt and inventory stock accurately when returning goods to supplier', () => {
      let productStockMilli = 10000; // 10 units
      let supplierPayablePiasters = 0;

      // Restock 50 units at 700 piasters each on supplier credit
      const purchaseQtyMilli = 50000;
      const unitCostPiasters = 700;
      const purchaseTotal = Math.round((unitCostPiasters * purchaseQtyMilli) / 1000); // 35,000 piasters

      productStockMilli += purchaseQtyMilli;
      supplierPayablePiasters += purchaseTotal;

      assert.equal(productStockMilli, 60000);
      assert.equal(supplierPayablePiasters, 35000);

      // Return 15 damaged units back to supplier
      const returnQtyMilli = 15000;
      const returnCreditPiasters = Math.round((unitCostPiasters * returnQtyMilli) / 1000); // 10,500 piasters

      productStockMilli -= returnQtyMilli;
      supplierPayablePiasters -= returnCreditPiasters;

      assert.equal(productStockMilli, 45000);
      assert.equal(supplierPayablePiasters, 24500); // 35 units * 700 = 24,500 piasters
    });
  });

  // ---------------------------------------------------------------------------------------
  // SECTION 12: Stock Adjustment Reversibility: Deficit vs Recount Correction
  // ---------------------------------------------------------------------------------------
  describe('12. Stock Adjustment Reversibility: Deficit Adjustment vs Physical Recount Correction', () => {
    it('accurately records stock adjustments and their counter-adjustments maintaining full audit trail', () => {
      let stockMilli = 100000; // 100 units
      const movements = [];

      // Physical audit reveals 8 units missing (92 units found)
      const deficitMilli = -8000;
      stockMilli += deficitMilli;
      movements.push({ type: 'ADJUSTMENT_DEFICIT', qtyMilli: deficitMilli, reason: 'عجز جرد سنوي' });
      assert.equal(stockMilli, 92000);

      // Later, warehouse worker finds the 8 units misplaced on top shelf
      const recountCorrectionMilli = 8000;
      stockMilli += recountCorrectionMilli;
      movements.push({ type: 'ADJUSTMENT_CORRECTION', qtyMilli: recountCorrectionMilli, reason: 'تصحيح عجز جرد بعد العثور على الصنف' });

      // INVARIANT: Stock returns to 100 units and net adjustment across both is 0
      assert.equal(stockMilli, 100000);
      const netAdjustment = movements.reduce((sum, m) => sum + m.qtyMilli, 0);
      assert.equal(netAdjustment, 0);
      assert.equal(movements.length, 2);
    });
  });

  // ---------------------------------------------------------------------------------------
  // SECTION 13: Numerals Parsing & Formatting Idempotency
  // ---------------------------------------------------------------------------------------
  describe('13. Numerals Parsing, Arabic Normalization & Idempotency', () => {
    it('is completely idempotent: normalize(normalize(x)) === normalize(x)', () => {
      const inputs = [
        '١٢٣٫٤٥',
        '۱۵.۷۵',
        '٠٫٠٥',
        '123.45',
        '1,250.50',
      ];

      for (const input of inputs) {
        const once = normalizeArabicDigits(input);
        const twice = normalizeArabicDigits(once);
        assert.equal(once, twice, `Idempotency failed for ${input}`);
      }
    });

    it('accurately converts all Eastern Arabic and Persian numerals to Western digits', () => {
      assert.equal(normalizeArabicDigits('٠١٢٣٤٥٦٧٨٩'), '0123456789');
      assert.equal(normalizeArabicDigits('۰۱۲۳۴۵۶۷۸۹'), '0123456789');
      assert.equal(normalizeNumericInput('١٥،٥٠'), '15.50');
      assert.equal(normalizeNumericInput('١٥٫٥٠'), '15.50');
    });

    it('integrates seamlessly with financial poundsToPiasters parser', () => {
      assert.equal(poundsToPiasters('١٥٠٫٧٥'), 15075);
      assert.equal(poundsToPiasters('۲۵.۵۰'), 2550);
      assert.equal(poundsToPiasters('٠٫٠٥'), 5);
    });
  });
});
