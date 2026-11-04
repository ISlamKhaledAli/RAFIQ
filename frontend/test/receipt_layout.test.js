import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_DEVELOPER_SIGNATURE,
  DEFAULT_RECEIPT_THANKS,
  buildOrderMetaText,
  buildReceiptLines,
  buildReceiptModel,
  buildSampleReceiptSale,
  computeReceiptTotals,
  formatReceiptDateTime,
  formatReceiptMoney,
  formatReceiptQuantity,
  formatReceiptQuantityWithUnit,
  groupThousands,
  layoutReceiptTable,
  receiptLineGross,
  receiptPaymentLabel,
  receiptUnitLabel,
  resolveReceiptFooter,
  resolveReceiptSignature,
} from '../src/utils/receiptLayout.ts';

/**
 * Supermarket receipt layout (preview twin of PrinterService.cs): integer money, measured table layout,
 * totals straight from the stored sale, no internal ids / barcode / emoji.
 */

const STORE = { name: 'سوبر ماركت الأمل', phone: '01012345678', address: 'القاهرة', taxNumber: '123-456-789', header: '', footer: '', signature: '' };

function item(name, qtyMilli, price, extra = {}) {
  return { productName: name, quantityMilli: qtyMilli, unitPricePiasters: price, discountPiasters: 0, unit: 'piece', ...extra };
}

/** A coherent sale: subtotal = sum of gross lines, total = subtotal - discounts + fees. */
function makeSale(items, { invoiceDiscount = 0, serviceCharge = 0, deliveryFee = 0, payments, paidPiasters, ...rest } = {}) {
  const gross = items.reduce((sum, it) => sum + receiptLineGross(it.unitPricePiasters, it.quantityMilli), 0);
  const lineDiscounts = items.reduce((sum, it) => sum + (it.discountPiasters || 0), 0);
  const total = gross - lineDiscounts - invoiceDiscount + serviceCharge + deliveryFee;
  return {
    id: 'sale_internal_guid_123',
    invoiceNumber: 1042,
    cashierName: 'أحمد',
    subtotalPiasters: gross,
    discountPiasters: invoiceDiscount,
    taxPiasters: 0,
    totalPiasters: total,
    paidPiasters: paidPiasters ?? total,
    changePiasters: 0,
    serviceChargePiasters: serviceCharge,
    deliveryFeePiasters: deliveryFee,
    paymentMethod: 'cash',
    items,
    payments,
    ...rest,
  };
}

test('money formatting uses integer math and Latin grouped digits', () => {
  assert.equal(formatReceiptMoney(0), '0.00');
  assert.equal(formatReceiptMoney(5), '0.05');
  assert.equal(formatReceiptMoney(100), '1.00');
  assert.equal(formatReceiptMoney(123456789), '1,234,567.89');
  assert.equal(formatReceiptMoney(99999999999), '999,999,999.99');
  assert.equal(formatReceiptMoney(-2050), '-20.50');
  assert.equal(formatReceiptMoney(Number.NaN), '0.00');
  assert.equal(groupThousands('1234'), '1,234');
  assert.equal(groupThousands('123'), '123');
});

test('quantities: pieces are integers, weights print three decimals', () => {
  assert.equal(formatReceiptQuantity(2000), '2');
  assert.equal(formatReceiptQuantity(1250), '1.250');
  assert.equal(formatReceiptQuantity(500), '0.500');
  assert.equal(formatReceiptQuantity(1200000), '1,200');
  assert.equal(formatReceiptQuantityWithUnit(1250, null, 'kg'), '1.250 كجم');
  assert.equal(formatReceiptQuantityWithUnit(2000, null, 'kg'), '2.000 كجم');
  assert.equal(formatReceiptQuantityWithUnit(2000, null, 'piece'), '2 ق');
  assert.equal(formatReceiptQuantityWithUnit(3000, 'كيس', 'piece'), '3 كيس');
  assert.equal(receiptUnitLabel(null, 'g', 500), 'جم');
  assert.equal(receiptUnitLabel(null, 'liter', 1000), 'لتر');
  assert.equal(receiptUnitLabel(null, undefined, 1500), 'كجم');
});

test('line gross rounds half away from zero like Money.MultiplyByMilliUnits', () => {
  assert.equal(receiptLineGross(333, 1500), 500); // 499.5
  assert.equal(receiptLineGross(4200, 2000), 8400);
  assert.equal(receiptLineGross(16400, 250), 4100);
  assert.equal(receiptLineGross(1, 499), 0);
  assert.equal(receiptLineGross(1, 500), 1);
  assert.equal(receiptLineGross(99999999999, 1000), 99999999999);
});

test('date is local yyyy/MM/dd HH:mm with Latin digits', () => {
  const local = new Date(2026, 10, 4, 9, 5);
  assert.equal(formatReceiptDateTime(local.toISOString()), '2026/11/04 09:05');
  assert.equal(formatReceiptDateTime('not a date', local), '2026/11/04 09:05');
  assert.equal(formatReceiptDateTime(undefined, local), '2026/11/04 09:05');
});

test('totals: displayed gross lines add up to the stored subtotal and the identity to the total holds', () => {
  const items = [item('لبن', 2000, 4200), item('جبنة', 1250, 16400, { unit: 'kg', discountPiasters: 500 }), item('سكر', 12000, 2700)];
  const sale = makeSale(items, { invoiceDiscount: 1500, payments: [{ method: 'cash', amountPiasters: 50000 }], paidPiasters: 50000 });
  const lines = buildReceiptLines(sale);
  const totals = computeReceiptTotals(sale);

  const lineSum = items.reduce((sum, it) => sum + receiptLineGross(it.unitPricePiasters, it.quantityMilli), 0);
  assert.equal(lineSum, totals.subtotal);
  assert.equal(totals.discountTotal, 2000);
  assert.equal(totals.subtotal - totals.discountTotal, totals.total);
  assert.equal(totals.total, sale.totalPiasters); // straight from the model
  assert.equal(lines[1].qty, '1.250 كجم');
  assert.equal(lines[1].discount, '5.00');
  assert.equal(lines[0].discount, '');
  assert.equal(totals.itemCount, 3);
  assert.equal(totals.pieceCount, 2 + 12); // the weighed line is not counted as pieces
});

test('payments: mixed cash + card with change, credit remainder, e-payment fee, deposit to account', () => {
  const base = [item('تليفزيون', 1000, 123456789)];

  const mixed = computeReceiptTotals(makeSale(base, {
    payments: [{ method: 'cash', amountPiasters: 100000000 }, { method: 'card', amountPiasters: 30000000 }],
    paidPiasters: 130000000,
    changePiasters: 6543211,
  }));
  assert.deepEqual(mixed.payments.map((p) => p.label), ['نقدي', 'بطاقة']);
  assert.equal(mixed.paid, 130000000);
  assert.equal(mixed.change, 130000000 - 123456789);
  assert.equal(mixed.remaining, 0);

  const credit = computeReceiptTotals(makeSale([item('لحم', 1500, 28000)], {
    paymentMethod: 'multi',
    customerId: 'cust_7',
    payments: [{ method: 'instapay', amountPiasters: 3000 }, { method: 'credit', amountPiasters: 39000 }],
    paidPiasters: 3000,
  }));
  assert.equal(credit.remaining, 39000);
  assert.equal(credit.change, 0);

  const creditOnly = computeReceiptTotals(makeSale([item('لحم', 1000, 28000)], { paymentMethod: 'credit', paidPiasters: 0, customerId: 'cust_7' }));
  assert.equal(creditOnly.payments.length, 0);
  assert.equal(creditOnly.remaining, 28000);

  const epay = computeReceiptTotals({ ...makeSale([item('شاي', 1000, 10000)], { paymentMethod: 'instapay', paidPiasters: 10050 }), serviceFeePiasters: 50 });
  assert.equal(epay.payable, 10050);
  assert.equal(epay.change, 0);
  assert.equal(epay.remaining, 0);

  const deposited = computeReceiptTotals(makeSale([item('شاي', 1000, 10000)], { paidPiasters: 15000, changePiasters: 0, customerId: 'cust_7' }));
  assert.equal(deposited.change, 0);
  assert.equal(deposited.deposited, 5000);

  const walkIn = computeReceiptTotals(makeSale([item('شاي', 1000, 10000)], { paidPiasters: 15000, changePiasters: 0, customerId: 'cust_general_cash' }));
  assert.equal(walkIn.change, 5000);
  assert.equal(walkIn.deposited, 0);
});

test('model sections: only what is needed, no zero lines, no internal ids, no barcode', () => {
  const plain = buildReceiptModel(makeSale([item('خبز', 5000, 100)]), STORE);
  assert.equal(plain.adjustmentRows.length, 0, 'no discount/fees: no "before discount" duplicate of the total');
  assert.equal(plain.taxText, '');
  assert.equal(plain.epayFeeText, '');
  assert.equal(plain.badges.length, 0);
  assert.equal(plain.customer, '');
  assert.equal(plain.orderMeta, '');
  assert.equal(plain.paymentRows.length, 1);
  assert.equal(plain.paymentRows[0].label, 'المدفوع (نقدي)');
  assert.equal(plain.invoiceLabel, 'فاتورة رقم: 1042');
  assert.equal(plain.cashier, 'الكاشير: أحمد');
  assert.equal(plain.footer, DEFAULT_RECEIPT_THANKS);
  assert.equal(plain.signature, DEFAULT_DEVELOPER_SIGNATURE);

  const serialized = JSON.stringify(plain);
  assert.ok(!serialized.includes('sale_internal_guid_123'), 'internal sale id must never reach the paper');
  assert.ok(!/barcode|00001042/i.test(serialized), 'no invoice barcode block');
  assert.ok(!/\p{Extended_Pictographic}/u.test(serialized), 'no emoji / symbol glyphs on thermal paper');
});

test('model: discount, fees, VAT, e-payment fee and credit rows', () => {
  const sale = {
    ...makeSale([item('زيت', 1000, 35000, { discountPiasters: 1000 })], { invoiceDiscount: 500, serviceCharge: 1200, deliveryFee: 2000, orderType: 'delivery', customerName: 'محمد', customerPhone: '0100', customerId: 'c1',
      deliveryInfo: { customerName: 'محمد', customerPhone: '0100', deliveryAddress: 'شارع 9', landmark: 'بجوار المسجد' } }),
    taxPiasters: 4000,
    serviceFeePiasters: 70,
    paymentMethod: 'credit',
    paidPiasters: 0,
  };
  const model = buildReceiptModel(sale, STORE);
  assert.deepEqual(model.adjustmentRows.map((r) => r.label), ['الإجمالي قبل الخصم', 'الخصم', 'خدمة الصالة', 'رسوم التوصيل']);
  assert.equal(model.adjustmentRows[1].value, '-15.00');
  assert.equal(model.taxText, '40.00');
  assert.equal(model.epayFeeText, '0.70');
  assert.equal(model.payableText, model.totals.payable === 0 ? '' : formatReceiptMoney(model.totals.payable));
  assert.equal(model.customer, '', 'delivery customer is shown in the delivery block only');
  assert.match(model.deliveryTitle, /محمد/);
  assert.deepEqual(model.deliveryLines, ['العنوان: شارع 9', 'علامة مميزة: بجوار المسجد']);
  assert.equal(model.paymentRows.at(-1).label, 'المتبقي (آجل على الحساب)');
});

test('badges: reprint marker only on copies, plus cancelled / training / pre-bill', () => {
  const sale = makeSale([item('خبز', 1000, 100)]);
  assert.deepEqual(buildReceiptModel(sale, STORE).badges, []);
  assert.deepEqual(buildReceiptModel(sale, STORE, { isCopy: true }).badges, ['نسخة - إعادة طباعة']);
  assert.deepEqual(buildReceiptModel({ ...sale, status: 'cancelled' }, STORE).badges, ['فاتورة ملغاة']);
  assert.deepEqual(buildReceiptModel({ ...sale, status: 'TEST_PILOT' }, STORE).badges, ['فاتورة تجريبية - تدريب']);

  const preBill = buildReceiptModel({ ...sale, id: 'PRE-BILL', invoiceNumber: 0, notes: 'ملاحظة داخلية' }, STORE);
  assert.equal(preBill.isPreBill, true);
  assert.equal(preBill.invoiceLabel, 'حساب مبدئي');
  assert.deepEqual(preBill.paymentRows, [], 'a pre-bill is unpaid: no payment block');
  assert.equal(preBill.notes, '');
});

test('long names are never cut and a huge basket has no cap', () => {
  const longName = 'زيت عباد الشمس كريستال الأصلي عبوة اقتصادية كبيرة الحجم 5 لتر + هدية منظف أطباق 750 مل Premium Edition 2026';
  const sale = makeSale([item(longName, 1000, 35999)]);
  assert.equal(buildReceiptLines(sale)[0].name, longName);

  const many = [];
  for (let i = 1; i <= 250; i += 1) many.push(item(`صنف ${i}`, 1000, 100 + i));
  const manySale = makeSale(many);
  assert.equal(buildReceiptModel(manySale, STORE).lines.length, 250);
  assert.equal(computeReceiptTotals(manySale).itemCount, 250);
});

test('table layout: short names share the row on 80mm, long names and huge amounts fall back', () => {
  const lines = buildReceiptLines(makeSale([item('خبز', 5000, 100), item('لبن جهينة كامل الدسم 1 لتر', 1000, 4200), item('زيت عباد الشمس كريستال الأصلي عبوة اقتصادية كبيرة 5 لتر', 1000, 35999)]));
  const wide = layoutReceiptTable(lines, '80mm');
  assert.equal(wide.columns, true);
  assert.deepEqual(wide.inline, [true, false, false]);

  const narrow = layoutReceiptTable(lines, '57mm');
  assert.equal(narrow.columns, true);
  assert.deepEqual(narrow.inline, [true, false, false], '57mm: only a tiny name shares the row; every other name takes its own full-width line');

  const huge = buildReceiptLines(makeSale([item('سيارة', 1000, 99999999999), item('جبنة بالوزن', 999999, 99999999, { unit: 'kg' })]));
  assert.equal(layoutReceiptTable(huge, '57mm').columns, false, 'columns that cannot fit stack instead of clipping');
});

test('labels, footer and signature resolution', () => {
  assert.equal(receiptPaymentLabel('cash'), 'نقدي');
  assert.equal(receiptPaymentLabel('instapay'), 'إنستاباي');
  assert.equal(receiptPaymentLabel('vodafone_cash'), 'محفظة إلكترونية');
  assert.equal(receiptPaymentLabel('insurance'), 'شركة التأمين');
  assert.equal(receiptPaymentLabel('multi'), 'المدفوع');
  assert.equal(resolveReceiptFooter('  '), DEFAULT_RECEIPT_THANKS);
  assert.equal(resolveReceiptFooter('شكراً لزيارتكم! البضاعة المباعة ترد وتستبدل وفقاً لسياسة المتجر.'), DEFAULT_RECEIPT_THANKS);
  assert.equal(resolveReceiptFooter('الاستبدال خلال 3 أيام'), 'الاستبدال خلال 3 أيام');
  assert.equal(resolveReceiptSignature('نظام رفيق لإدارة المتاجر ونقاط البيع | تطوير: م. إسلام خالد'), DEFAULT_DEVELOPER_SIGNATURE);
  assert.equal(resolveReceiptSignature('توقيع مخصص'), 'توقيع مخصص');
});

test('order meta only appears for dine-in / delivery / table / call number', () => {
  assert.equal(buildOrderMetaText({ totalPiasters: 0, orderType: 'takeaway' }), '');
  assert.equal(buildOrderMetaText({ totalPiasters: 0, orderType: 'dine_in', tableName: '5', waiterName: 'علي', orderCallNumber: 12, guestsCount: 3 }), 'نداء 12 - طاولة 5 - الكابتن: علي - ضيوف: 3');
});

test('sample sale used by the store-profile preview is internally consistent', () => {
  const sample = buildSampleReceiptSale();
  const totals = computeReceiptTotals(sample);
  assert.equal(totals.subtotal - totals.discountTotal, totals.total);
  assert.equal(totals.change, 5000);
  const model = buildReceiptModel(sample, STORE);
  assert.equal(model.lines[2].qty, '0.750 كجم');
  assert.equal(model.lines[2].total, '210.00');
  assert.equal(model.grandTotal, '300.00');
});

test('ReceiptModal prints the stored sale by id and no longer truncates names or fakes a barcode', () => {
  const modal = fs.readFileSync(path.resolve('src', 'components', 'ReceiptModal.tsx'), 'utf8');
  assert.ok(/'printer:printReceipt',\s*\{\s*saleId:\s*sale\.id\s*\}/.test(modal), 'printer:printReceipt must receive the sale id so the host prints the stored sale');
  assert.ok(!/'printer:printReceipt',\s*\{\s*sale\s*\}/.test(modal), 'the client must not send its own sale object for printing');
  assert.ok(modal.includes('res.success'), 'PrintResult uses "success", not "ok"');

  const paper = fs.readFileSync(path.resolve('src', 'components', 'ReceiptPaper.tsx'), 'utf8');
  assert.ok(!paper.includes('truncate'), 'product names wrap, they are never cut');
  assert.ok(!/bg-black h-full/.test(paper), 'no simulated barcode strip');
});
