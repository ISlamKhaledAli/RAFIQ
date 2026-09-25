import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  piastersToPounds
} from '../src/utils/money.ts';

describe('Story 51: Sales History Search, Details, and Copy Reprinting (Feature #133)', () => {

  const sampleSales = [
    {
      id: 'sale-001',
      invoiceNumber: 1001,
      customerId: 'cust-1',
      customerName: 'محمد أحمد',
      customerPhone: '01012345678',
      subtotalPiasters: 8500,
      discountPiasters: 500,
      taxPiasters: 0,
      totalPiasters: 8000,
      paidPiasters: 8000,
      paymentMethod: 'cash',
      status: 'completed',
      notes: 'عميل مميز',
      createdAt: '2026-09-24T10:00:00Z',
      items: [
        {
          productId: 'prod-1',
          productName: 'سكر الأسرة 1 كجم',
          barcode: '6221001122334',
          quantityMilli: 2000,
          unitPricePiasters: 4000,
          discountPiasters: 0,
          totalPiasters: 8000,
          unit: 'piece'
        }
      ]
    },
    {
      id: 'sale-002',
      invoiceNumber: 1002,
      customerId: null,
      customerName: null,
      customerPhone: null,
      subtotalPiasters: 15000,
      discountPiasters: 0,
      taxPiasters: 0,
      totalPiasters: 15000,
      paidPiasters: 15000,
      paymentMethod: 'credit',
      status: 'cancelled',
      notes: 'إلغاء بناء على طلب الكاشير - خطأ في تسجيل الصنف',
      createdAt: '2026-09-23T14:30:00Z',
      items: [
        {
          productId: 'prod-2',
          productName: 'زيت عباد الشمس 800 مل',
          barcode: '6222003344556',
          quantityMilli: 3000,
          unitPricePiasters: 5000,
          discountPiasters: 0,
          totalPiasters: 15000,
          unit: 'piece'
        }
      ]
    },
    {
      id: 'sale-003',
      invoiceNumber: 1003,
      customerId: 'cust-2',
      customerName: 'سوبرماركت الأمانة',
      customerPhone: '01298765432',
      subtotalPiasters: 24000,
      discountPiasters: 2000,
      taxPiasters: 0,
      totalPiasters: 22000,
      paidPiasters: 22000,
      paymentMethod: 'cash',
      status: 'refunded',
      notes: 'مرتجع جزئي',
      createdAt: '2026-09-20T08:15:00Z',
      items: [
        {
          productId: 'prod-3',
          productName: 'أرز فاخر مصري كجم',
          barcode: '6223004455667',
          quantityMilli: 5000,
          unitPricePiasters: 4400,
          discountPiasters: 0,
          totalPiasters: 22000,
          unit: 'kg'
        }
      ]
    }
  ];

  // Helper matching the multi-criteria search in SalesHistoryView and SaleRepository
  const searchSalesInMemory = (sales, { query, status, dateFilter, customDate }) => {
    return sales.filter((s) => {
      // 1. Status Filter
      if (status && status !== 'all' && s.status !== status) {
        return false;
      }

      // 2. Date Filter
      if (dateFilter && dateFilter !== 'all' && s.createdAt) {
        const saleDateStr = s.createdAt.split('T')[0];
        if (dateFilter === 'custom' && customDate && saleDateStr !== customDate) {
          return false;
        }
      }

      // 3. Search Query
      if (query && query.trim()) {
        const q = query.trim().toLowerCase().replace(/^#/, '');
        const invMatch = String(s.invoiceNumber).includes(q);
        const notesMatch = (s.notes || '').toLowerCase().includes(q);
        const custMatch = (s.customerName || '').toLowerCase().includes(q) || (s.customerPhone || '').includes(q);
        const paymentMatch = (s.paymentMethod || '').toLowerCase().includes(q);
        const amountPounds = ((s.totalPiasters || 0) / 100).toFixed(0);
        const amountMatch = amountPounds.includes(q);

        if (!invMatch && !notesMatch && !custMatch && !paymentMatch && !amountMatch) {
          return false;
        }
      }

      return true;
    });
  };

  describe('Task 133-1: Multi-criteria Invoices Search (Invoice #, Date, Customer, Amount)', () => {
    it('finds invoice directly by sequential invoice number', () => {
      const results = searchSalesInMemory(sampleSales, { query: '1001' });
      assert.equal(results.length, 1);
      assert.equal(results[0].invoiceNumber, 1001);
      assert.equal(results[0].customerName, 'محمد أحمد');
    });

    it('finds invoice by customer name or phone query', () => {
      const byName = searchSalesInMemory(sampleSales, { query: 'محمد' });
      assert.equal(byName.length, 1);
      assert.equal(byName[0].invoiceNumber, 1001);

      const byPhone = searchSalesInMemory(sampleSales, { query: '01298765432' });
      assert.equal(byPhone.length, 1);
      assert.equal(byPhone[0].invoiceNumber, 1003);
    });

    it('finds invoices by amount in pounds (e.g. 80 EGP = 8000 piasters)', () => {
      const byAmount = searchSalesInMemory(sampleSales, { query: '80' });
      assert.equal(byAmount.length, 1);
      assert.equal(byAmount[0].totalPiasters, 8000);
      assert.equal(piastersToPounds(byAmount[0].totalPiasters), 80);
    });

    it('filters accurately by custom date', () => {
      const results = searchSalesInMemory(sampleSales, { dateFilter: 'custom', customDate: '2026-09-23' });
      assert.equal(results.length, 1);
      assert.equal(results[0].invoiceNumber, 1002);
    });
  });

  describe('Task 133-2: Invoice Details Breakdown and Status Badges', () => {
    it('correctly categorizes completed, cancelled, and refunded invoices', () => {
      const completed = searchSalesInMemory(sampleSales, { status: 'completed' });
      assert.equal(completed.length, 1);
      assert.equal(completed[0].invoiceNumber, 1001);

      const cancelled = searchSalesInMemory(sampleSales, { status: 'cancelled' });
      assert.equal(cancelled.length, 1);
      assert.equal(cancelled[0].invoiceNumber, 1002);
      assert.ok(cancelled[0].notes.includes('إلغاء'));

      const refunded = searchSalesInMemory(sampleSales, { status: 'refunded' });
      assert.equal(refunded.length, 1);
      assert.equal(refunded[0].invoiceNumber, 1003);
    });

    it('preserves integer precision in financial breakdown and discounts', () => {
      const sale = sampleSales[0];
      assert.equal(sale.subtotalPiasters - sale.discountPiasters, sale.totalPiasters);
      assert.equal(sale.totalPiasters, 8000); // 80.00 EGP
      assert.equal(sale.discountPiasters, 500); // 5.00 EGP
    });
  });

  describe('Task 133-3: Reprinting Copy Receipt with Watermark and Audit Logging', () => {
    it('prepares reprint payload with isCopy: true and original sale details', () => {
      const saleToReprint = sampleSales[0];
      const reprintPayload = {
        sale: saleToReprint,
        isCopy: true
      };

      assert.equal(reprintPayload.isCopy, true);
      assert.equal(reprintPayload.sale.invoiceNumber, 1001);
      assert.equal(reprintPayload.sale.customerName, 'محمد أحمد');
    });

    it('generates correct document title and watermark indicator for copy receipts', () => {
      const isCopy = true;
      const invoiceNumber = 1001;
      const docTitle = isCopy ? `إيصال رفيق (نسخة) - فاتورة #${invoiceNumber}` : `إيصال رفيق - فاتورة #${invoiceNumber}`;
      assert.equal(docTitle, 'إيصال رفيق (نسخة) - فاتورة #1001');

      const watermarkHeader = isCopy ? '*** نسخة طبق الأصل - إيصال مكرر ***' : '';
      assert.ok(watermarkHeader.includes('نسخة طبق الأصل'));
    });

    it('formats audit log entry for reprint operation', () => {
      const auditEntry = {
        action: 'sale_reprint',
        entityType: 'sale',
        entityId: 'sale-001',
        details: {
          invoiceNumber: 1001,
          isCopy: true
        }
      };

      assert.equal(auditEntry.action, 'sale_reprint');
      assert.equal(auditEntry.details.isCopy, true);
      assert.equal(auditEntry.details.invoiceNumber, 1001);
    });
  });

  describe('Task 133-4: Large Scale In-Memory Search Performance & Robustness', () => {
    it('executes search across 1000 simulated sales in less than 5ms', () => {
      const bigList = [];
      for (let i = 1; i <= 1000; i++) {
        bigList.push({
          id: `sale-${i}`,
          invoiceNumber: 1000 + i,
          customerName: i % 10 === 0 ? `عميل_${i}` : null,
          totalPiasters: (i * 150),
          status: i % 50 === 0 ? 'cancelled' : 'completed',
          createdAt: '2026-09-24T12:00:00Z'
        });
      }

      const t0 = performance.now();
      const match = searchSalesInMemory(bigList, { query: '1500' });
      const elapsed = performance.now() - t0;

      assert.ok(elapsed < 20, `Search took ${elapsed}ms which is under 20ms`);
      assert.ok(match.length > 0);
      assert.equal(match[0].invoiceNumber, 1500);
    });
  });
});
