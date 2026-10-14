import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseScaleBarcode } from '../src/utils/scaleBarcode.ts';
import { calculateLineTotal, normalizeArabicNumerals } from '../src/utils/money.ts';

describe('Senior Deep Stress Suite: إجهاد الأوزان والكسور وحسابات الموردين وفواتير الشراء', () => {

  describe('1. إجهاد الأوزان والكسور والحساب المالي (Weights & Fractional Arithmetic Stress)', () => {

    it('1.1: التحقق من حساب خط الفاتورة للأوزان الكسرية بالمليجرام وتطابقه مع C# AwayFromZero', () => {
      // 350g at 33 piasters/kg -> (33 * 350) / 1000 = 11.55 -> 12 piasters
      assert.equal(calculateLineTotal(33, 350), 12);

      // 125g at 25000 piasters/kg (250 EGP/kg) -> (25000 * 125) / 1000 = 3125 piasters
      assert.equal(calculateLineTotal(25000, 125), 3125);

      // 1g at 99 piasters/kg -> 0.099 -> 0 piasters
      assert.equal(calculateLineTotal(99, 1), 0);

      // 1g at 1000 piasters/kg -> 1 piaster
      assert.equal(calculateLineTotal(1000, 1), 1);

      // 777g at 1399 piasters/kg -> (1399 * 777) / 1000 = 1087.023 -> 1087 piasters
      assert.equal(calculateLineTotal(1399, 777), 1087);
    });

    it('1.2: حظر تجزئة الأصناف المباعة بالقطعة (Piece Divisibility Guard)', () => {
      const pieceProduct = {
        id: 'prod_biscuit',
        name: 'بسكويت شوكولاتة',
        unit: 'piece',
        pricePiasters: 500
      };

      const isDivisible = (prod, qtyMilli) => {
        if (prod.unit !== 'kg' && prod.unit !== 'gram') {
          return qtyMilli % 1000 === 0;
        }
        return true;
      };

      assert.equal(isDivisible(pieceProduct, 1000), true);
      assert.equal(isDivisible(pieceProduct, 3000), true);
      assert.equal(isDivisible(pieceProduct, 350), false); // 0.35 piece forbidden
      assert.equal(isDivisible(pieceProduct, 1500), false); // 1.5 piece forbidden
    });

    it('1.3: معالجة الأرقام العربية والفواصل العشرية المدخلة للأوزان (Arabic Numerals & Comma)', () => {
      const parseWeightInput = (raw) => {
        const normalized = normalizeArabicNumerals(raw)
          .replace(/,/g, '.')
          .replace(/[^\d.]/g, '');
        const floatVal = parseFloat(normalized);
        return isNaN(floatVal) ? 0 : Math.round(floatVal * 1000);
      };

      assert.equal(parseWeightInput('٠٫٣٥٠'), 350);
      assert.equal(parseWeightInput('٠,٣٥'), 350);
      assert.equal(parseWeightInput('1.250'), 1250);
      assert.equal(parseWeightInput('٢٫٥'), 2500);
      assert.equal(parseWeightInput('0.005'), 5);
    });

    it('1.4: فحص وتأمين باركود الميزان الإلكتروني عند الأطراف القصوى (Boundary Scale Barcodes)', () => {
      // 1 gram scale barcode (00.001 kg)
      const minBarcode = '2000001000017';
      const parsedMin = parseScaleBarcode(minBarcode);
      assert.ok(parsedMin);
      assert.equal(parsedMin.isScaleBarcode, true);
      assert.equal(parsedMin.weightGrams, 1);
      assert.equal(parsedMin.weightMilli, 1);

      // 99.999 kg max scale barcode
      const maxBarcode = '2200999999991';
      const parsedMax = parseScaleBarcode(maxBarcode);
      assert.ok(parsedMax);
      assert.equal(parsedMax.isScaleBarcode, true);
      assert.equal(parsedMax.weightGrams, 99999);
      assert.equal(parsedMax.weightKg, 99.999);

      // Non-scale regular item barcode
      const regularBarcode = '6221155998877';
      assert.equal(parseScaleBarcode(regularBarcode), null);
    });
  });

  describe('2. حسابات الموردين وفواتير الشراء المتقدمة (Suppliers & Purchases Integrity)', () => {

    it('2.1: حساب متوسط التكلفة المرجح (Weighted Average Cost Invariant)', () => {
      const calcWeightedAverageCost = (currentStockMilli, currentCostPiasters, incomingQtyMilli, incomingCostPiasters) => {
        const validCurrentStock = Math.max(0, currentStockMilli);
        const totalQty = validCurrentStock + incomingQtyMilli;
        if (totalQty <= 0) return incomingCostPiasters;
        const totalValue = (validCurrentStock * currentCostPiasters) + (incomingQtyMilli * incomingCostPiasters);
        return Math.round(totalValue / totalQty);
      };

      // 1000g at 1000 piasters + 350g at 1500 piasters -> 1,525,000 / 1350 = 1129.629 -> 1130
      const newCost = calcWeightedAverageCost(1000, 1000, 350, 1500);
      assert.equal(newCost, 1130);

      // When existing stock is zero or negative:
      const costFromZero = calcWeightedAverageCost(0, 1000, 500, 1200);
      assert.equal(costFromZero, 1200);

      const costFromNegative = calcWeightedAverageCost(-200, 1000, 500, 1200);
      assert.equal(costFromNegative, 1200);
    });

    it('2.2: حظر إنشاء فواتير شراء آجلة أو بمبالغ زائدة بدون مورد (Liability Leak Guard)', () => {
      const validatePurchaseSupplier = (purchase) => {
        const netCost = Math.max(0, purchase.totalCost - (purchase.discount || 0));
        const paid = Math.max(0, purchase.paidAmount || 0);
        if (paid !== netCost && (!purchase.supplierId || purchase.supplierId.trim() === '')) {
          throw new Error('يجب اختيار المورد أولاً لتسجيل فاتورة شراء آجلة أو بسداد جزئي أو بمبلغ زائد.');
        }
        return true;
      };

      // Full cash purchase without supplier is allowed
      assert.equal(validatePurchaseSupplier({ totalCost: 5000, discount: 0, paidAmount: 5000, supplierId: null }), true);

      // Unpaid credit purchase without supplier MUST throw
      assert.throws(() => {
        validatePurchaseSupplier({ totalCost: 5000, discount: 0, paidAmount: 0, supplierId: null });
      }, /يجب اختيار المورد أولاً/);

      // Partial purchase without supplier MUST throw
      assert.throws(() => {
        validatePurchaseSupplier({ totalCost: 5000, discount: 0, paidAmount: 2000, supplierId: '' });
      }, /يجب اختيار المورد أولاً/);

      // Overpaid purchase without supplier MUST throw
      assert.throws(() => {
        validatePurchaseSupplier({ totalCost: 5000, discount: 0, paidAmount: 6000, supplierId: null });
      }, /يجب اختيار المورد أولاً/);

      // Credit purchase with supplier succeeds
      assert.equal(validatePurchaseSupplier({ totalCost: 5000, discount: 0, paidAmount: 2000, supplierId: 'sup_123' }), true);
    });

    it('2.3: تطابق القيود المحاسبية وكشف حساب المورد (Ledger Invariant Discrepancy === 0)', () => {
      let supplierBalance = 0;
      const transactions = [];

      const recordTransaction = (type, amountPiasters, refId = null, notes = '') => {
        supplierBalance += amountPiasters;
        transactions.push({
          id: `tx_${transactions.length + 1}`,
          transactionType: type,
          amountPiasters,
          referenceId: refId,
          notes
        });
      };

      // Opening balance: 5000 piasters owed to supplier
      recordTransaction('OPENING_BALANCE', 5000, null, 'رصيد افتتاحي');

      // Credit purchase invoice: net 8000, paid 3000 -> remaining 5000 added to debt
      recordTransaction('PURCHASE_INVOICE', 5000, 'pur_1', 'فاتورة شراء جزئية');

      // Cash purchase invoice: net 4000, paid 4000 -> 0 delta, recorded for audit
      recordTransaction('PURCHASE_PAID_CASH', 0, 'pur_2', 'فاتورة مسددة كاش');

      // Cash payment to supplier: 4000 piasters paid -> reduces debt
      recordTransaction('PAYMENT', -4000, null, 'سداد نقدي على الحساب');

      // Excess overpayment: paid 7000 when debt is 6000 -> balance becomes -1000 (advance credit)
      recordTransaction('PAYMENT', -7000, null, 'سداد بالزيادة تحت الحساب');

      assert.equal(supplierBalance, -1000);

      // Calculate sum of transactions
      const calculatedBalance = transactions.reduce((sum, t) => sum + t.amountPiasters, 0);
      assert.equal(calculatedBalance, supplierBalance);
      assert.equal(supplierBalance - calculatedBalance, 0);
    });
  });
});
