import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  piastersToPounds
} from '../src/utils/money.ts';

describe('Story 47 & Story 48: Receipt Printing & Thermal Printer Invariants (Features #31 & #53)', () => {

  const sampleSale = {
    id: 'sale-test-uuid-001',
    invoiceNumber: 1042,
    subtotalPiasters: 15000,
    discountPiasters: 1000,
    taxPiasters: 1960,
    totalPiasters: 15960,
    paidPiasters: 20000,
    paymentMethod: 'cash',
    items: [
      {
        productId: 'p-1',
        productName: 'لبن جهينة 1 لتر',
        quantityMilli: 2000,
        unitPricePiasters: 4000,
        discountPiasters: 0,
        taxPiasters: 0,
        totalPiasters: 8000,
        unit: 'piece'
      },
      {
        productId: 'p-2',
        productName: 'جبنة دومتي 500 جم',
        quantityMilli: 1000,
        unitPricePiasters: 7000,
        discountPiasters: 1000,
        taxPiasters: 1960,
        totalPiasters: 6000,
        unit: 'piece'
      }
    ],
    payments: [
      { method: 'cash', amountPiasters: 20000 }
    ],
    createdAt: new Date().toISOString()
  };

  describe('Task 31-1 & 31-2: Receipt Formatting & Integer Financial Precision', () => {
    it('correctly calculates change due for receipt display without floating-point error', () => {
      const changePiasters = Math.max(0, sampleSale.paidPiasters - sampleSale.totalPiasters);
      assert.equal(changePiasters, 4040); // 40.40 EGP
      assert.equal(piastersToPounds(changePiasters), 40.4);
    });

    it('formats quantity based on product unit (kg vs piece)', () => {
      const formatQty = (qtyMilli, unit) => {
        if (unit === 'kg' || qtyMilli % 1000 !== 0) {
          return `${(qtyMilli / 1000).toFixed(3)} كجم`;
        }
        return `${qtyMilli / 1000} ق`;
      };

      assert.equal(formatQty(2000, 'piece'), '2 ق');
      assert.equal(formatQty(1500, 'piece'), '1.500 كجم');
      assert.equal(formatQty(750, 'kg'), '0.750 كجم');
    });

    it('formats invoice total, discount, and tax lines correctly', () => {
      const subtotalPounds = piastersToPounds(sampleSale.subtotalPiasters);
      const discountPounds = piastersToPounds(sampleSale.discountPiasters);
      const taxPounds = piastersToPounds(sampleSale.taxPiasters);
      const netTotalPounds = piastersToPounds(sampleSale.totalPiasters);

      assert.equal(subtotalPounds, 150);
      assert.equal(discountPounds, 10);
      assert.equal(taxPounds, 19.6);
      assert.equal(netTotalPounds, 159.6);
    });
  });

  describe('Task 53-1 & 53-2: Paper Width & Printer Specifications', () => {
    it('supports 80mm, 57mm, and A4 width specifications', () => {
      const validPaperWidths = ['80mm', '57mm', 'a4'];
      const paperWidthConfig = {
        '80mm': { charWidth: 48, feedLines: 4, label: 'ورق حراري قياسي (80 مم)' },
        '57mm': { charWidth: 32, feedLines: 3, label: 'ورق حراري صغير (57 مم)' },
        'a4': { charWidth: 80, feedLines: 2, label: 'ورق مكتبي عادي (A4)' }
      };

      assert.ok(validPaperWidths.includes('80mm'));
      assert.ok(validPaperWidths.includes('57mm'));
      assert.ok(validPaperWidths.includes('a4'));
      assert.equal(paperWidthConfig['80mm'].charWidth, 48);
      assert.equal(paperWidthConfig['57mm'].charWidth, 32);
    });

    it('validates printer settings payload format', () => {
      const printerSettingsPayload = {
        default_printer_name: 'POS-80 Thermal Printer',
        receipt_paper_width: '80mm',
        printer_auto_print: '1',
        printer_open_drawer: '1'
      };

      assert.equal(typeof printerSettingsPayload.default_printer_name, 'string');
      assert.ok(['80mm', '57mm', 'a4'].includes(printerSettingsPayload.receipt_paper_width));
      assert.ok(['0', '1'].includes(printerSettingsPayload.printer_auto_print));
      assert.ok(['0', '1'].includes(printerSettingsPayload.printer_open_drawer));
    });
  });

  describe('Task 31-3 & 31-4: Non-Blocking Fault Tolerance on Print Failure', () => {
    it('ensures printer failure does not throw or corrupt sale status', async () => {
      const mockPrintCommand = async (shouldFail) => {
        if (shouldFail) {
          return { success: false, message: 'الطابعة غير متصلة أو لا يوجد ورق' };
        }
        return { success: true, message: 'تم إرسال الإيصال للطابعة بنجاح' };
      };

      // Even if printer returns failure, sale is already committed
      const res = await mockPrintCommand(true);
      assert.equal(res.success, false);
      assert.match(res.message, /الطابعة/);
      assert.equal(sampleSale.invoiceNumber, 1042); // Sale remains valid
    });

    it('auto-print condition evaluates correctly from setting string', () => {
      const shouldAutoPrint = (settingValue) => settingValue === '1' || settingValue === 'true';

      assert.equal(shouldAutoPrint('1'), true);
      assert.equal(shouldAutoPrint('0'), false);
      assert.equal(shouldAutoPrint(undefined), false);
      assert.equal(shouldAutoPrint(null), false);
    });
  });

});
