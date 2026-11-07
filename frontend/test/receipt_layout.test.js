import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_DEVELOPER_SIGNATURE,
  DEFAULT_RECEIPT_THANKS,
  LEGACY_DEVELOPER_SIGNATURES,
  LEGACY_RECEIPT_FOOTERS,
  RECEIPT_TEXT_MAX_CHARS,
  RECEIPT_TEXT_MAX_LINES,
  buildOrderMetaText,
  buildReceiptLines,
  buildReceiptModel,
  buildSampleReceiptSale,
  computeReceiptTotals,
  encodeInvoiceBarcode,
  cleanReceiptItemName,
  formatInvoiceBarcodeValue,
  formatReceiptDateTime,
  formatReceiptMoney,
  formatReceiptQuantity,
  formatReceiptQuantityWithUnit,
  groupThousands,
  layoutReceiptBarcode,
  layoutReceiptTable,
  normalizeInvoiceSearchText,
  normalizeReceiptText,
  receiptLineGross,
  receiptTextLimitError,
  receiptPaymentLabel,
  receiptUnitLabel,
  resolveReceiptFooter,
  resolveReceiptSignature,
  splitReceiptText,
} from '../src/utils/receiptLayout.ts';
import { pickSignatureImageIndex } from '../src/utils/signatureImage.ts';

/**
 * Supermarket receipt layout (preview twin of PrinterService.cs): integer money, measured table layout,
 * totals straight from the stored sale, a real invoice barcode (digits only), no internal ids / emoji.
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
  assert.ok(!('discount' in lines[1]), 'a line discount is never printed under its product');
  assert.ok(!('itemCount' in totals) && !('pieceCount' in totals), 'no item / piece counts on the invoice');
});

test('money: printed gross lines add up to the pre-discount row, then ONE total discount row, then the final total', () => {
  // two line discounts + an invoice discount + a weighed line
  const items = [
    item('لبن', 2000, 4200, { discountPiasters: 300 }),
    item('جبنة', 1250, 16400, { unit: 'kg', discountPiasters: 500 }),
    item('سكر', 12000, 2700),
  ];
  const sale = makeSale(items, { invoiceDiscount: 1500 });
  const model = buildReceiptModel(sale, STORE);

  const cents = (text) => Number(text.replace(/,/g, '').replace('.', ''));
  const printedLineSum = model.lines.reduce((sum, line) => sum + cents(line.total), 0);
  const rows = Object.fromEntries(model.adjustmentRows.map((r) => [r.label, cents(r.value)]));

  assert.equal(printedLineSum, rows['الإجمالي قبل الخصم'], 'printed line totals sum to the pre-discount subtotal');
  assert.equal(rows['إجمالي الخصم'], -(300 + 500 + 1500), 'one row sums line + invoice discounts');
  assert.equal(model.adjustmentRows.filter((r) => /الخصم/.test(r.label) && r.label !== 'الإجمالي قبل الخصم').length, 1, 'exactly one discount row');
  assert.equal(rows['الإجمالي قبل الخصم'] + rows['إجمالي الخصم'], cents(model.grandTotal), 'total = subtotal - total discount');

  // with service charge and delivery fee the identity still reads top to bottom
  const fees = buildReceiptModel(makeSale(items, { invoiceDiscount: 1500, serviceCharge: 1200, deliveryFee: 2000 }), STORE);
  const feeRows = Object.fromEntries(fees.adjustmentRows.map((r) => [r.label, cents(r.value)]));
  assert.equal(feeRows['الإجمالي قبل الخصم'] + feeRows['إجمالي الخصم'] + feeRows['خدمة الصالة'] + feeRows['رسوم التوصيل'], cents(fees.grandTotal));
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

test('model sections: only what is needed, no zero lines, no internal ids, a real invoice barcode', () => {
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
  assert.equal(plain.footer, '', 'no footer text configured: nothing is printed');
  assert.deepEqual(plain.footerLines, []);
  assert.equal(plain.footerBlock, false);
  assert.equal(plain.signature, DEFAULT_DEVELOPER_SIGNATURE);

  const serialized = JSON.stringify(plain);
  assert.ok(!serialized.includes('sale_internal_guid_123'), 'internal sale id must never reach the paper');
  assert.deepEqual(plain.barcode, { value: 'RFQ-INV-00001042' }, 'distinctive RFQ-INV- barcode is rendered');
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
  assert.deepEqual(model.adjustmentRows.map((r) => r.label), ['الإجمالي قبل الخصم', 'إجمالي الخصم', 'خدمة الصالة', 'رسوم التوصيل']);
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
  assert.equal(resolveReceiptFooter('  '), '', 'an empty footer prints nothing');
  assert.equal(resolveReceiptFooter(null), '');
  assert.equal(resolveReceiptFooter('\n  \n'), '');
  for (const legacy of LEGACY_RECEIPT_FOOTERS) {
    assert.equal(resolveReceiptFooter(legacy), DEFAULT_RECEIPT_THANKS, 'an untouched old built-in footer migrates to the plain thanks line');
  }
  assert.equal(resolveReceiptFooter('شكراً لزيارتكم! البضاعة المباعة ترد وتستبدل وفقاً لسياسة المتجر.'), DEFAULT_RECEIPT_THANKS);
  assert.equal(resolveReceiptFooter('الاستبدال خلال 3 أيام'), 'الاستبدال خلال 3 أيام');
  for (const legacy of LEGACY_DEVELOPER_SIGNATURES) {
    assert.equal(resolveReceiptSignature(legacy), DEFAULT_DEVELOPER_SIGNATURE, 'every older built-in default migrates to the current one');
  }
  assert.equal(resolveReceiptSignature(''), DEFAULT_DEVELOPER_SIGNATURE);
  assert.equal(resolveReceiptSignature('توقيع مخصص'), 'توقيع مخصص');
});

test('order meta only appears for dine-in / delivery / table / call number', () => {
  assert.equal(buildOrderMetaText({ totalPiasters: 0, orderType: 'takeaway' }), '');
  assert.equal(buildOrderMetaText({ totalPiasters: 0, orderType: 'dine_in', tableName: '5', waiterName: 'علي', orderCallNumber: 12, guestsCount: 3 }), 'نداء 12 - طاولة 5 - الكابتن: علي - ضيوف: 3');
  // the cafe call number never reaches a supermarket sale, even when the host stored one
  assert.equal(buildOrderMetaText({ totalPiasters: 0, orderType: 'retail', orderCallNumber: 12 }), '');
  assert.equal(buildOrderMetaText({ totalPiasters: 0, orderCallNumber: 12 }), '');
  assert.equal(buildOrderMetaText({ totalPiasters: 0, orderType: 'takeaway', orderCallNumber: 7 }), 'نداء 7');
  assert.equal(buildOrderMetaText({ totalPiasters: 0, orderType: 'delivery', orderCallNumber: 7 }), 'نداء 7 - توصيل');
  const retail = buildReceiptModel({ ...makeSale([item('خبز', 1000, 100)]), orderType: 'retail', orderCallNumber: 41 }, STORE);
  assert.equal(retail.orderMeta, '');
  assert.ok(!JSON.stringify(retail).includes('نداء'), 'no call number anywhere on a supermarket invoice');
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
  assert.ok(paper.includes('encodeInvoiceBarcode(value)') && paper.includes('model.barcode &&'), 'the preview draws the real Code 128 bars of the model barcode');
  assert.ok(paper.indexOf('model.barcode &&') > paper.indexOf('model.paymentRows.length') && paper.indexOf('model.barcode &&') < paper.indexOf('model.coldChainNotice &&'), 'barcode sits after the payments and before the footer');
});

test('invoice barcode value: distinctive RFQ-INV- with 8 zero-padded digits (C# twin asserted in S53)', () => {
  const table = [
    [1, 'RFQ-INV-00000001'],
    [42, 'RFQ-INV-00000042'],
    [1042, 'RFQ-INV-00001042'],
    [99999999, 'RFQ-INV-99999999'],
    [100000000, 'RFQ-INV-100000000'],
    [2147483647, 'RFQ-INV-2147483647'],
    [0, ''],
    [-5, ''],
    [null, ''],
    [undefined, ''],
    [Number.NaN, '']
  ];
  for (const [input, expected] of table) assert.equal(formatInvoiceBarcodeValue(input), expected, String(input));
  assert.equal(formatInvoiceBarcodeValue(1042.9), 'RFQ-INV-00001042', 'fractions are cut, never rounded up to another invoice');
  assert.ok(formatInvoiceBarcodeValue(1042).startsWith('RFQ-INV-'), 'distinctive signature prefix');
});

test('model barcode: only a valid invoice number on a real sale (original or reprint)', () => {
  const sale = makeSale([item('خبز', 1000, 100)]);
  assert.deepEqual(buildReceiptModel(sale, STORE).barcode, { value: 'RFQ-INV-00001042' });
  assert.deepEqual(buildReceiptModel(sale, STORE, { isCopy: true }).barcode, { value: 'RFQ-INV-00001042' }, 'a reprint carries the same barcode');
  assert.deepEqual(buildReceiptModel({ ...sale, invoiceNumber: 123456789 }, STORE).barcode, { value: 'RFQ-INV-123456789' }, 'longer numbers use the full number');
  for (const invoiceNumber of [0, -1, null, undefined]) {
    assert.equal(buildReceiptModel({ ...sale, invoiceNumber }, STORE).barcode, null, `invoiceNumber ${invoiceNumber}`);
  }
  assert.equal(buildReceiptModel({ ...sale, id: 'PRE-BILL' }, STORE).barcode, null, 'pre-bill is not an invoice');
  assert.equal(buildReceiptModel({ ...sale, status: 'TEST_PILOT' }, STORE).barcode, null, 'a training receipt is not stored, nothing to find');
});

test('invoice barcode bits: Code 128 subset C, golden strings shared with the C# encoder (S53)', () => {
  assert.equal(encodeInvoiceBarcode('00001042'), '1101001110011011001100110110011001100100010010110111000111101010001100011101011');
  assert.equal(encodeInvoiceBarcode('12345678'), '1101001110010110011100100010110001110001011011000010100100011101101100011101011');
  assert.equal(encodeInvoiceBarcode('RFQ-INV-00001042'), '1101001000011000101110100011000101101000111010011011100110001000101011100011011101011000100110111001011101111011011001100110110011001100100010010110111000100101100001100011101011');
  assert.equal(encodeInvoiceBarcode('00001042').length, 79);
  assert.equal(encodeInvoiceBarcode('1234567890').length, 90);
  assert.equal(encodeInvoiceBarcode('123456789').length, 101);
  assert.equal(encodeInvoiceBarcode('RFQ-INV-00001042').length, 178);
  assert.equal(encodeInvoiceBarcode(''), '');
});

test('invoice barcode layout: whole-dot modules, quiet zones, inside the printable width (C# twin asserted in S53)', () => {
  const table = [
    [79, '80mm', 5],
    [79, '57mm', 3],
    [90, '80mm', 5],
    [90, '57mm', 3],
    [101, '80mm', 4],
    [101, '57mm', 3],
    [178, '80mm', 2],
    [178, '57mm', 1],
  ];
  for (const [modules, paper, moduleDots] of table) {
    const layout = layoutReceiptBarcode(modules, paper);
    assert.equal(layout.moduleDots, moduleDots, `${modules} / ${paper}`);
    assert.ok(Number.isInteger(layout.moduleDots), 'never a fractional module (blurry bars)');
    assert.equal(layout.widthDots, modules * moduleDots);
    const paperDots = paper === '80mm' ? 576 : 384;
    assert.ok((modules + 20) * moduleDots <= paperDots - 20, 'bars plus a 10-module quiet zone on each side fit the paper');
  }
  assert.equal(layoutReceiptBarcode(79, '80mm').heightDots, 68, '8.4 mm on 80mm paper');
  assert.equal(layoutReceiptBarcode(79, '57mm').heightDots, 60, '7.4 mm on 57mm paper');
});

test('invoice search text: a scanned 8-digit barcode finds the invoice, other searches are untouched', () => {
  assert.equal(normalizeInvoiceSearchText('00001042'), '1042');
  assert.equal(normalizeInvoiceSearchText(' 00001042 '), '1042');
  assert.equal(normalizeInvoiceSearchText('#00001042'), '1042');
  assert.equal(normalizeInvoiceSearchText('12345678'), '12345678');
  assert.equal(normalizeInvoiceSearchText('1042'), '1042');
  assert.equal(normalizeInvoiceSearchText('#1042'), '1042');
  assert.equal(normalizeInvoiceSearchText('00000000'), '00000000', 'no invoice zero');
  assert.equal(normalizeInvoiceSearchText('01012345678'), '01012345678', 'a phone number keeps its leading zero');
  assert.equal(normalizeInvoiceSearchText('أحمد'), 'أحمد');
  assert.equal(normalizeInvoiceSearchText(String(formatInvoiceBarcodeValue(42))), '42', 'round trip with the barcode value');
});

test('SalesHistoryView resolves a scan: keeps the search box focused, Enter searches, the padded value is normalised', () => {
  const view = fs.readFileSync(path.resolve('src', 'views', 'SalesHistoryView.tsx'), 'utf8');
  assert.ok(view.includes('ref={searchInputRef}') && view.includes('searchInputRef.current?.focus()'), 'the search box takes the scanner input');
  assert.ok(/e\.key === 'Enter'[\s\S]{0,60}handleSearchInvoice\(\)/.test(view), 'the Enter a wedge scanner sends runs the search');
  assert.ok(view.includes('const raw = normalizeInvoiceSearchText(searchQuery)'), 'the search strips the padding zeros before parseInt / sales:search');
  assert.ok(view.includes('normalizeInvoiceSearchText(searchQuery).toLowerCase()'), 'the list filter uses the same normalised text');
});

test('developer signature default: three lines, no emoji, every older default migrates', () => {
  assert.equal(DEFAULT_DEVELOPER_SIGNATURE, 'رفيق للأنظمة والحلول البرمجية\nللاستفسار وتجربة النظام\nم. إسلام خالد | 01097782965');
  assert.deepEqual(splitReceiptText(DEFAULT_DEVELOPER_SIGNATURE), ['رفيق للأنظمة والحلول البرمجية', 'للاستفسار وتجربة النظام', 'م. إسلام خالد | 01097782965']);
  assert.ok(!DEFAULT_DEVELOPER_SIGNATURE.includes('شكرًا لثقتكم بنا'), 'the thanks line is gone (the banner image carries the message)');
  assert.ok(splitReceiptText(DEFAULT_DEVELOPER_SIGNATURE).length <= RECEIPT_TEXT_MAX_LINES, 'the default fits the server line cap');
  assert.equal(receiptTextLimitError(DEFAULT_DEVELOPER_SIGNATURE), '', 'the default passes the server validation');
  assert.ok(!/\p{Extended_Pictographic}/u.test(DEFAULT_DEVELOPER_SIGNATURE), 'no emoji: Windows 7/8 thermal drivers print boxes');
  assert.equal(LEGACY_DEVELOPER_SIGNATURES.length, 5);
  const fourLine = 'رفيق للأنظمة والحلول البرمجية\nللدعم الفني والاستفسارات\nم. إسلام خالد - 01097782965\nشكرًا لثقتكم بنا';
  const twoLine = 'للدعم الفني والاستفسارات\nم. إسلام خالد - 01097782965';
  assert.ok(LEGACY_DEVELOPER_SIGNATURES.includes(fourLine), 'the previous four-line default migrates');
  assert.ok(LEGACY_DEVELOPER_SIGNATURES.includes(twoLine), 'the previous two-line default migrates');
  assert.equal(resolveReceiptSignature(fourLine), DEFAULT_DEVELOPER_SIGNATURE);
  assert.equal(resolveReceiptSignature(twoLine), DEFAULT_DEVELOPER_SIGNATURE);
  assert.equal(resolveReceiptSignature('نظام رفيق للأنظمة والحلول البرمجية\nللتواصل: م. إسلام خالد - 01097782965'), DEFAULT_DEVELOPER_SIGNATURE);
  assert.equal(resolveReceiptSignature(DEFAULT_DEVELOPER_SIGNATURE), DEFAULT_DEVELOPER_SIGNATURE);
  assert.equal(resolveReceiptSignature('توقيع مخصص\nالسطر الثاني'), 'توقيع مخصص\nالسطر الثاني', 'a value the root customised is never replaced');
});

// URLs of a built-in set of three images (the app passes BUILT_IN_SIGNATURE_IMAGES: the files of src/assets/signatures)
const BUILT = ['/s/default_01.png', '/s/default_02.png', '/s/default_03.png'];

test('signature model: image source, visibility and plain text lines', () => {
  const sale = makeSale([item('خبز', 1000, 100)]);
  const withSet = (extra = {}) => ({ builtInSignatureImages: BUILT, ...extra });
  const byDefault = buildReceiptModel(sale, STORE, withSet());
  assert.deepEqual(byDefault.signatureLines, ['رفيق للأنظمة والحلول البرمجية', 'للاستفسار وتجربة النظام', 'م. إسلام خالد | 01097782965']);
  assert.equal(byDefault.signatureVisible, true);
  assert.ok(BUILT.includes(byDefault.signatureImageSrc), 'missing setting: one image of the built-in set');
  const custom = buildReceiptModel(sale, { ...STORE, signature: 'سطر 1\nسطر 2\nسطر 3' }, withSet());
  assert.deepEqual(custom.signatureLines, ['سطر 1', 'سطر 2', 'سطر 3']);
  assert.ok(BUILT.includes(custom.signatureImageSrc), 'a custom text still gets the image');
  assert.equal(buildReceiptModel(sale, STORE, withSet({ signatureImage: 'none' })).signatureImageSrc, null, "'none' = text only");
  assert.ok(BUILT.includes(buildReceiptModel(sale, STORE, withSet({ signatureImage: '' })).signatureImageSrc));
  assert.equal(buildReceiptModel(sale, STORE, withSet({ signatureImage: 'data:image/jpeg;base64,AAAA' })).signatureImageSrc, null, 'an invalid value shows nothing');
  assert.equal(buildReceiptModel(sale, STORE).signatureImageSrc, null, 'without a built-in set the default entry has nothing to show');
  const png = 'data:image/png;base64,' + fs.readFileSync(path.resolve('src', 'assets', 'signatures', 'default_01.png')).toString('base64');
  assert.equal(buildReceiptModel(sale, STORE, withSet({ signatureImage: png })).signatureImageSrc, png, 'a valid custom PNG is used as is');
  assert.equal(buildReceiptModel(sale, STORE, withSet({ signatureVisible: false })).signatureVisible, false);
  assert.equal(buildReceiptModel(sale, STORE, withSet({ signatureImage: JSON.stringify([png]) })).signatureImageSrc, png, 'a one-element array');
  assert.equal(buildReceiptModel(sale, STORE, withSet({ signatureVisible: true })).signatureVisible, true);
  for (const dead of ['signatureRule', 'signatureHeart', 'signatureBanner']) {
    assert.ok(!(dead in byDefault), `${dead} no longer exists`);
  }
});

test('signature image per invoice: pool of default(3) + custom(2), deterministic by sale id, stable on reprint', () => {
  const banner = fs.readFileSync(path.resolve('src', 'assets', 'signatures', 'default_01.png'));
  const custom1 = 'data:image/png;base64,' + banner.toString('base64');
  const custom2 = 'data:image/png;base64,' + Buffer.concat([banner.subarray(0, 24), Buffer.alloc(40)]).toString('base64');
  const list = JSON.stringify(['default', custom1, custom2]);
  const pool = [...BUILT, custom1, custom2];
  const srcFor = (id, extra = {}) => buildReceiptModel({ ...makeSale([item('خبز', 1000, 100)]), id }, STORE, { signatureImage: list, builtInSignatureImages: BUILT, ...extra }).signatureImageSrc;

  assert.equal(srcFor('sale_abc'), srcFor('sale_abc'), 'the same invoice always shows the same image');
  assert.equal(srcFor('sale_abc'), srcFor('sale_abc', { now: new Date(2030, 1, 1) }), 'a later reprint is identical');
  const seen = new Set();
  for (let i = 0; i < 120; i++) seen.add(srcFor(`sale_${i}`));
  assert.equal(seen.size, 5, 'all 3 built-ins and both custom images join the rotation');
  assert.deepEqual([...seen].sort(), [...pool].sort());
  const expected = (id) => pool[pickSignatureImageIndex(id, pool.length)];
  for (const id of ['sale_1', 'sale_2', 'sale_internal_guid_123']) assert.equal(srcFor(id), expected(id), 'index = fnv1a32(id) % pool size, "default" expanded in order');
  const pre = buildReceiptModel({ ...makeSale([item('خبز', 1000, 100)]), id: 'PRE-BILL' }, STORE, { signatureImage: list, builtInSignatureImages: BUILT }).signatureImageSrc;
  assert.equal(pre, BUILT[0], 'the pre-bill has no stored id: the first image of the pool');
  assert.equal(srcFor('sale_1', { signatureImageIndex: 4 }), custom2, 'the settings preview can force a pool image');
  assert.equal(srcFor('sale_1', { signatureImageIndex: 1 }), BUILT[1], 'including one of the built-in set');
  assert.equal(srcFor('sale_1', { signatureImageIndex: null }), srcFor('sale_1'));
  assert.equal(srcFor('sale_1', { signatureImageIndex: 99 }), srcFor('sale_1'), 'an out-of-range index falls back to the invoice pick');
});

test('preview: the signature block is hidden with the switch, the img comes from the model with a height cap', () => {
  const paper = fs.readFileSync(path.resolve('src', 'components', 'ReceiptPaper.tsx'), 'utf8');
  assert.ok(paper.includes('model.signatureVisible &&'), 'the whole block (image, lines, separator) renders only when visible');
  assert.ok(paper.includes('src={model.signatureImageSrc}'), 'the image source comes from the model');
  assert.ok(/className="[^"]*w-2\/3[^"]*max-h-14[^"]*object-contain[^"]*"/.test(paper), 'two-thirds width and a height cap like the printer');
  assert.ok(!/DEFAULT_SIGNATURE_IMAGE_SRC|width: 900/.test(paper), 'no fixed size for the built-in image: the set has different shapes');
  assert.ok(!paper.includes('lucide-react') && !/Heart/.test(paper), 'no code-drawn heart');
  assert.ok(!paper.includes('model.signatureRule') && !paper.includes('font-bold">{line}') && !paper.includes('w-fit'), 'no bold first line or rule wrapper');
  assert.ok(!/filter|invert/.test(paper), 'the paper is always black on white: no filters');
  const modal = fs.readFileSync(path.resolve('src', 'components', 'ReceiptModal.tsx'), 'utf8');
  assert.ok(modal.includes("signatureVisible: liveSettings.developer_signature_visible !== '0'"));
  assert.ok(modal.includes("signatureImage: liveSettings.developer_signature_image ?? ''"));
  assert.ok(modal.includes('builtInSignatureImages: BUILT_IN_SIGNATURE_IMAGES') && modal.includes("from '../utils/signatureDefaults'"), 'the receipt modal passes the built-in set');
});

test('thermal printer: resolves the signature image per receipt and draws it above the signature lines with the shared p.Y flow', () => {
  const cs = fs.readFileSync(path.resolve('..', 'desktop', 'Services', 'PrinterService.cs'), 'utf8');
  const start = cs.indexOf('private static void DrawReceiptSignature');
  const body = cs.slice(start, cs.indexOf('/// <summary>', start));
  assert.ok(body.includes('if (!store.SignatureVisible || store.Signature.Length == 0) return;'), 'hidden: nothing at all, not even the separator');
  assert.ok(body.includes('DrawSignatureBanner(p, store.SignatureImage, pickKey)'), 'the invoice (or return) id picks the image');
  assert.ok(/DrawReceiptSignature\(p, store, hasFooterBlock, isPreBill \? "" : sale\.Id\)/.test(cs) && cs.includes('DrawReceiptSignature(p, store, true, returnObj.Id)'), 'both call sites pass their id (the pre-bill passes an empty key)');
  assert.ok(body.includes('p.WrapLines(store.Signature, p.Small, p.Center'), 'all signature lines are plain small text, measured then drawn');
  assert.ok(body.indexOf('p.Y += p.LineH(p.Small);') < body.indexOf('DrawSignatureBanner'), 'the one-line gap comes before the image');
  const draw = cs.slice(cs.indexOf('private static void DrawSignatureBanner'), start);
  assert.ok(draw.includes('p.G.DrawImage(banner') && draw.includes('p.Y += drawH + 3f;'), 'advances p.Y so the measure pass and the draw pass agree');
  assert.ok(draw.includes('p.Usable * 0.70f / banner.Width') && draw.includes('p.LineH(p.Small) * 4.5f / banner.Height'), 'width 70% and height capped at 4.5 small lines');
  assert.ok(draw.includes('lock (SignatureBannerLock)'), 'resolve and draw are one atomic step');
  assert.ok(draw.includes('SettingsService.PickSignatureImageIndex(pickKey, banners.Count)'), 'same FNV index as the preview');
  const resolve = cs.slice(cs.indexOf('private static List<Image> ResolveSignatureBanners'), cs.indexOf('/// <summary>يرسم صورة التوقيع المختارة'));
  assert.ok(resolve.includes('if (_bannerList != null && _bannerListKey == setting) return _bannerList;'), 'the whole list is decoded once per setting string');
  assert.ok(resolve.includes('OwnedCustomBanners[i].Dispose()') && resolve.includes('OwnedCustomBanners.Add(custom)'), 'previous custom bitmaps are disposed');
  assert.ok(resolve.includes('SettingsService.TryParseSignatureImageItems(setting, out items)') && resolve.includes('i < SettingsService.MaxSignatureImages'));
  assert.ok(cs.includes('SettingsService.TryDecodeSignatureImage(dataUrl, out bytes)') && cs.includes('return new Bitmap(decoded);'), 'standalone copy of every decoded custom image');
  assert.ok(/catch \(Exception exCustom\)/.test(cs), 'a corrupt custom image is dropped from the list and never breaks printing');
  assert.ok(!/Logger\.(Warn|Info|Error)\([^;]*(setting|dataUrl)[^;]*\)/.test(cs.slice(cs.indexOf('private static Image DecodeCustomBanner'), start)), 'the image content is never logged');
  const builtIn = cs.slice(cs.indexOf('private static List<Image> LoadBuiltInSignatureBanners'), cs.indexOf('private static Image DecodeCustomBanner'));
  assert.ok(cs.includes('"RafiqPOS.signatures."') && builtIn.includes('GetManifestResourceNames()') && builtIn.includes('Array.Sort(names, StringComparer.Ordinal)'), 'every embedded signatures resource, ordinal order like the preview');
  assert.ok(builtIn.includes('GetManifestResourceStream(names[i])') && builtIn.includes('list.Add(new Bitmap(decoded));'), 'standalone copy: GDI+ must not depend on the stream');
  assert.ok(builtIn.includes('if (_builtInBanners != null) return _builtInBanners;'), 'the built-in set is loaded once');
  assert.ok(/catch \(Exception exBuiltIn\)/.test(builtIn) && builtIn.includes('names[i] + ": "'), 'a broken built-in is dropped and logged by name only');
  assert.ok(resolve.includes('list.AddRange(LoadBuiltInSignatureBanners())'), '"default" expands into every built-in image in the pool');
  assert.ok(!resolve.includes('OwnedCustomBanners.AddRange') && !/OwnedCustomBanners\.Add\(embedded/.test(resolve), 'built-ins are never disposed with the custom ones');
  assert.ok(!cs.includes('receipt_signature.png') && !cs.includes('LoadEmbeddedSignatureBanner'), 'the single embedded banner is gone');
  assert.ok(cs.includes('info.SignatureVisible = ReadStoreSetting(store, SettingsService.SignatureVisibleKey) != "0";'));
  assert.ok(cs.includes('info.SignatureImage = ReadStoreSetting(store, SettingsService.SignatureImageKey);'));
  for (const dead of ['TextWidthRule', 'CenteredTextWithHeart', 'DrawHeart', 'Hairline', 'GetSignatureBanner']) {
    assert.ok(!cs.includes(dead), `${dead} was removed`);
  }
  const csproj = fs.readFileSync(path.resolve('..', 'desktop', 'RafiqPOS.csproj'), 'utf8');
  assert.ok(/<EmbeddedResource Include="Resources\\signatures\\\*\.png">\s*<LogicalName>RafiqPOS\.signatures\.%\(Filename\)%\(Extension\)<\/LogicalName>\s*<\/EmbeddedResource>/.test(csproj), 'every PNG of the folder is embedded as RafiqPOS.signatures.<file>');
  assert.ok(!csproj.includes('receipt_signature.png'), 'the old single entry is gone');
  const settings = fs.readFileSync(path.resolve('..', 'desktop', 'Services', 'SettingsService.cs'), 'utf8');
  assert.ok(settings.includes(DEFAULT_DEVELOPER_SIGNATURE.replace(/\n/g, '\\n')), 'C# default equals the TypeScript default');
  for (const legacy of LEGACY_DEVELOPER_SIGNATURES) {
    assert.ok(settings.includes(legacy.replace(/\n/g, '\\n')), 'C# legacy list contains: ' + legacy.slice(0, 20));
  }
  assert.ok(settings.includes('MaxReceiptTextLines = ' + RECEIPT_TEXT_MAX_LINES), 'C# and TypeScript line caps agree');
});

test('multi-line receipt texts: paragraphs split on CRLF / CR / LF and are wrapped one by one', () => {
  assert.deepEqual(splitReceiptText('شكراً لزيارتكم\r\nالاستبدال خلال 3 أيام\rبالفاتورة'), ['شكراً لزيارتكم', 'الاستبدال خلال 3 أيام', 'بالفاتورة']);
  assert.deepEqual(splitReceiptText('سطر واحد'), ['سطر واحد']);
  assert.deepEqual(splitReceiptText(''), []);
  assert.deepEqual(splitReceiptText(null), []);
  assert.deepEqual(splitReceiptText('  \n \r\n '), [], 'only blank lines means no text');
});

test('normalizeReceiptText: trims lines, drops edge blanks and collapses blank runs', () => {
  assert.equal(normalizeReceiptText('\n\n  أول  \n\n\n\n  ثاني \n\n'), 'أول\n\nثاني');
  assert.equal(normalizeReceiptText('أ\r\nب\n\n\n\n\nج'), 'أ\nب\n\nج');
  assert.equal(normalizeReceiptText('  نص عادي  '), 'نص عادي', 'single-line values behave like the old trim');
  assert.equal(normalizeReceiptText(undefined), '');
});

test('receipt text limits: 300 chars and 4 lines are rejected with a message, never cut silently', () => {
  assert.equal(RECEIPT_TEXT_MAX_CHARS, 300);
  assert.equal(RECEIPT_TEXT_MAX_LINES, 4);
  assert.equal(receiptTextLimitError('أ\nب\nج\nد'), '');
  assert.match(receiptTextLimitError('أ\nب\nج\nد\nهـ'), /4 أسطر/);
  assert.equal(receiptTextLimitError('ا'.repeat(300)), '');
  assert.match(receiptTextLimitError('ا'.repeat(301)), /300/);
  assert.equal(receiptTextLimitError('أ\n\n\n\n\n\nب'), '', 'blank runs collapse before the line count');
});

test('receipt model carries header, footer and signature as separate lines', () => {
  const model = buildReceiptModel(makeSale([item('خبز', 1000, 100)]), {
    ...STORE,
    header: 'أهلاً بكم\r\nفي محلنا',
    footer: 'الاستبدال خلال 3 أيام\n\n\nبالفاتورة فقط',
    signature: '',
  });
  assert.deepEqual(model.headerLines, ['أهلاً بكم', 'في محلنا']);
  assert.equal(model.headerText, 'أهلاً بكم\nفي محلنا');
  assert.deepEqual(model.footerLines, ['الاستبدال خلال 3 أيام', '', 'بالفاتورة فقط']);
  assert.deepEqual(model.signatureLines, splitReceiptText(DEFAULT_DEVELOPER_SIGNATURE));

  const bare = buildReceiptModel(makeSale([item('خبز', 1000, 100)]), STORE);
  assert.deepEqual(bare.headerLines, []);
  assert.deepEqual(bare.footerLines, [], 'an empty footer is not replaced by a thanks line');
  assert.equal(bare.footerBlock, false, 'no footer, notes or cold-chain notice: the signature follows the closing rule directly');
  assert.equal(model.footerBlock, true);
  assert.equal(buildReceiptModel(makeSale([item('خبز', 1000, 100)], { notes: 'ملاحظة' }), STORE).footerBlock, true);
  assert.equal(buildReceiptModel(makeSale([item('خبز', 1000, 100)]), { ...STORE, footer: LEGACY_RECEIPT_FOOTERS[0] }).footerLines[0], DEFAULT_RECEIPT_THANKS);
});

test('cashier line: shown by default, hidden when the store switch is off', () => {
  const sale = makeSale([item('خبز', 1000, 100)]);
  assert.equal(buildReceiptModel(sale, STORE).cashier, 'الكاشير: أحمد');
  assert.equal(buildReceiptModel(sale, STORE, { showCashier: true }).cashier, 'الكاشير: أحمد');
  assert.equal(buildReceiptModel(sale, STORE, { showCashier: false }).cashier, '');
  const sample = buildSampleReceiptSale();
  assert.equal(buildReceiptModel(sample, STORE).cashier, 'الكاشير: أحمد', 'the sample keeps its example cashier');
  assert.equal(buildReceiptModel(sample, STORE, { showCashier: false }).cashier, '');
});

test('hideable receipt rows: invoice number, paid rows and change, over every on/off combination', () => {
  const base = makeSale([item('خبز', 10000, 1000)], { payments: [{ method: 'cash', amountPiasters: 12000 }, { method: 'card', amountPiasters: 3000 }] });
  const withChange = { ...base, changePiasters: 5000 };
  const partlyOnCredit = makeSale([item('خبز', 10000, 1000)], { payments: [{ method: 'cash', amountPiasters: 4000 }] });
  const singleCash = { ...makeSale([item('خبز', 10000, 1000)], { paidPiasters: 12000 }), changePiasters: 2000 };
  const registeredOverpay = { ...makeSale([item('خبز', 10000, 1000)], { paidPiasters: 15000, customerId: 'c1', customerName: 'منى' }), changePiasters: 2000 };
  const cases = [
    ['paid + change split in two methods', withChange, ['نقدي', 'بطاقة', 'إجمالي المدفوع', 'الباقي للعميل'].sort()],
    ['single cash with change', singleCash, ['المدفوع (نقدي)', 'الباقي للعميل'].sort()],
    ['partly on credit', partlyOnCredit, ['المدفوع (نقدي)', 'المتبقي (آجل على الحساب)'].sort()],
    ['registered customer overpay', registeredOverpay, ['المدفوع (نقدي)', 'الباقي للعميل', 'مودع في حساب العميل'].sort()],
  ];
  const ALWAYS = ['المتبقي (آجل على الحساب)', 'مودع في حساب العميل'];

  for (const [name, sale, labelsWhenAllShown] of cases) {
    const full = buildReceiptModel(sale, STORE);
    assert.deepEqual(full.paymentRows.map((r) => r.label).sort(), labelsWhenAllShown, `${name}: all shown is the unchanged receipt`);
    assert.deepEqual(buildReceiptModel(sale, STORE, { showInvoiceNumber: true, showPaid: true, showChange: true }), full, `${name}: explicit true equals the default`);

    for (const showInvoiceNumber of [true, false]) {
      for (const showPaid of [true, false]) {
        for (const showChange of [true, false]) {
          const label = `${name} (invoice ${showInvoiceNumber}, paid ${showPaid}, change ${showChange})`;
          const model = buildReceiptModel(sale, STORE, { showInvoiceNumber, showPaid, showChange });
          const expected = full.paymentRows
            .filter((r) => ALWAYS.includes(r.label) || (r.label === 'الباقي للعميل' ? showChange : showPaid))
            .map((r) => r.label);
          assert.deepEqual(model.paymentRows.map((r) => r.label), expected, `${label}: rows`);
          assert.equal(model.invoiceLabel, showInvoiceNumber ? 'فاتورة رقم: 1042' : '', `${label}: invoice label`);
          // display only: nothing but the switched rows and the label differ
          assert.deepEqual({ ...model, paymentRows: null, invoiceLabel: null }, { ...full, paymentRows: null, invoiceLabel: null }, `${label}: everything else is identical`);
          assert.deepEqual(model.barcode, { value: 'RFQ-INV-00001042' }, `${label}: the barcode always prints`);
          assert.equal(model.dateTime, full.dateTime, `${label}: the date and time stay`);
        }
      }
    }
  }
});

test('hideable receipt rows: totals and credit facts never hide, pre-bill and numberless invoices keep their label', () => {
  const sale = { ...makeSale([item('خبز', 10000, 1000)], { invoiceDiscount: 500, paidPiasters: 12000 }), changePiasters: 2500 };
  const hidden = buildReceiptModel(sale, STORE, { showInvoiceNumber: false, showPaid: false, showChange: false });
  assert.deepEqual(hidden.paymentRows, [], 'nothing left to print for a fully paid cash sale');
  assert.deepEqual(hidden.adjustmentRows.map((r) => r.label), ['الإجمالي قبل الخصم', 'إجمالي الخصم']);
  assert.equal(hidden.grandTotal, '95.00');
  assert.equal(hidden.totals.paid, 12000, 'the stored paid amount is untouched');
  assert.equal(hidden.totals.change, 2500, 'the stored change is untouched');

  const credit = buildReceiptModel(makeSale([item('خبز', 10000, 1000)], { payments: [{ method: 'credit', amountPiasters: 10000 }] }), STORE, { showPaid: false, showChange: false });
  assert.deepEqual(credit.paymentRows.map((r) => r.label), ['المتبقي (آجل على الحساب)'], 'a debt on account always prints');

  const preBill = buildReceiptModel({ ...sale, id: 'PRE-BILL', invoiceNumber: 0 }, STORE, { showInvoiceNumber: false, showPaid: false, showChange: false });
  assert.equal(preBill.invoiceLabel, 'حساب مبدئي', 'the pre-bill label ignores the switch');
  assert.equal(buildReceiptModel({ ...sale, invoiceNumber: 0 }, STORE, { showInvoiceNumber: false }).invoiceLabel, 'فاتورة', 'no number to hide');
  assert.equal(buildReceiptModel({ ...sale, status: 'TEST_PILOT' }, STORE, { showInvoiceNumber: false }).barcode, null, 'training receipts still have no barcode');
});

test('GDI receipt mirrors the hideable rows: missing key shows, only "0" hides, barcode and credit rows are untouched', () => {
  const cs = fs.readFileSync(path.resolve('..', 'desktop', 'Services', 'PrinterService.cs'), 'utf8').replace(/\r\n/g, '\n');
  for (const [field, key] of [['ShowInvoiceNumber', 'receipt_show_invoice_number'], ['ShowPaid', 'receipt_show_paid'], ['ShowChange', 'receipt_show_change']]) {
    assert.ok(cs.includes(`info.${field} = ReadStoreSetting(store, "${key}") != "0";`), `${key}: missing key means show`);
    assert.ok(cs.includes(`public bool ${field} = true;`), `${field} defaults to true`);
  }
  assert.ok(cs.includes('(store.ShowInvoiceNumber ? "فاتورة رقم: " + sale.InvoiceNumber.ToString(CultureInfo.InvariantCulture) : "")'));
  assert.ok(cs.includes('p.WrapWithSide(invoiceText, FormatReceiptDateTime(sale.CreatedAt), p.Bold, p.Small);'), 'the date still prints next to an empty label');
  assert.ok(cs.includes('if (store.ShowPaid)\n'));
  assert.ok(cs.includes('if (store.ShowChange && t.Change > 0) payRows.Add('));
  assert.ok(cs.includes('if (t.Deposited > 0) payRows.Add(') && cs.includes('if (t.Remaining > 0) payRows.Add('), 'deposit and credit rows have no switch');
  assert.ok(cs.includes('if (payRows.Count > 0) p.Separator(p.Dashed, 2f, 3f);'), 'no empty payments block');
  assert.ok(cs.includes('if (!IsTransientReceiptSale(sale)) DrawInvoiceBarcode('), 'the barcode does not depend on the switch');

  const settingsService = fs.readFileSync(path.resolve('..', 'desktop', 'Services', 'SettingsService.cs'), 'utf8');
  const dispatcher = fs.readFileSync(path.resolve('..', 'desktop', 'Bridge', 'IpcDispatcher.System.cs'), 'utf8');
  for (const key of ['receipt_show_invoice_number', 'receipt_show_paid', 'receipt_show_change']) {
    assert.ok(settingsService.includes(`if (!settings.ContainsKey("${key}")) settings["${key}"] = "1";`), `${key} default`);
    assert.ok(dispatcher.includes(`"${key}"`), `${key} is whitelisted for the store settings permission`);
  }
});

test('GDI footer mirrors the preview: empty footer prints nothing, switch hides the cashier, legacy footers migrate', () => {
  const cs = fs.readFileSync(path.resolve('..', 'desktop', 'Services', 'PrinterService.cs'), 'utf8');
  assert.ok(!/store\.Footer\.Length > 0 \? store\.Footer : DefaultReceiptThanks/.test(cs), 'no forced thanks line');
  assert.ok(cs.includes('if (info.Footer == LegacyReceiptFooters[i]) info.Footer = DefaultReceiptThanks;'));
  assert.ok(cs.includes('if (store.Footer.Length > 0)'), 'the footer is drawn only when it has text');
  assert.ok(cs.includes('DrawReceiptSignature(p, store, hasFooterBlock, '), 'the signature separator only follows a footer block');
  assert.ok(cs.includes('info.ShowCashier = ReadStoreSetting(store, "receipt_show_cashier") != "0";'), 'missing key means show');
  assert.ok(cs.includes('if (store.ShowCashier && !string.IsNullOrWhiteSpace(sale.CashierName))'));
  const dispatcher = fs.readFileSync(path.resolve('..', 'desktop', 'Bridge', 'IpcDispatcher.System.cs'), 'utf8');
  assert.ok(dispatcher.includes('"receipt_show_cashier"'), 'the key is whitelisted for the store settings permission');
});

test('ReceiptPaper renders every line as its own element and the editors are multi-line', () => {
  const paper = fs.readFileSync(path.resolve('src', 'components', 'ReceiptPaper.tsx'), 'utf8');
  assert.ok(paper.includes('model.headerLines.map') && paper.includes('model.footerLines.map') && paper.includes('model.signatureLines.map'));

  const tab = fs.readFileSync(path.resolve('src', 'views', 'settings', 'StoreProfileTab.tsx'), 'utf8');
  const parts = fs.readFileSync(path.resolve('src', 'views', 'settings', 'settingsParts.tsx'), 'utf8');
  assert.ok(parts.includes('<textarea') && tab.includes('<ReceiptTextField'), 'header / footer are textareas (the shared ReceiptTextField)');
  const rootReceipt = fs.readFileSync(path.resolve('src', 'views', 'root', 'RootReceiptPage.tsx'), 'utf8');
  assert.ok(rootReceipt.includes('<ReceiptTextField') && rootReceipt.includes('rows={4}'), 'the signature is a multi-line textarea on the root receipt page');
  assert.ok(parts.includes('اضغط Enter') || tab.includes('اضغط Enter للانتقال لسطر جديد'), 'the Enter hint is shown');
  assert.ok(!tab.includes('تطوير: م. إسلام خالد') && !rootReceipt.includes('تطوير: م. إسلام خالد'), 'no stale single-line signature in the editor');
});

test('store profile tab keeps identity + receipt only; policies live in their own admin screen', () => {
  const tab = fs.readFileSync(path.resolve('src', 'views', 'settings', 'StoreProfileTab.tsx'), 'utf8');
  for (const moved of ['allowNegativeStock', 'requireOpenShiftToSell', 'defaultCustomerCreditLimitEgp', 'feature_pharmacy', 'useTheme']) {
    assert.ok(!tab.includes(moved), `${moved} moved out of the store profile tab`);
  }
  const policies = fs.readFileSync(path.resolve('src', 'views', 'settings', 'SalesPoliciesTab.tsx'), 'utf8');
  for (const kept of ['onToggleNegativeStock', 'onToggleRequireOpenShift', 'setDefaultCustomerCreditLimitEgp', 'pharma:saveControlledMandatoryFields']) {
    assert.ok(policies.includes(kept), `${kept} still wired in the policies tab`);
  }
  const view = fs.readFileSync(path.resolve('src', 'views', 'SettingsView.tsx'), 'utf8');
  assert.ok(view.includes("subTab === 'policies'"));
  for (const key of ['allow_negative_stock', 'require_open_shift_to_sell', 'default_customer_credit_limit_egp']) {
    const idx = view.indexOf(key + ':');
    assert.ok(idx > view.indexOf('handleSavePolicies'), `${key} is saved by the policies save`);
  }
});

test('GDI invoice: no per-line discount, no counts, one total discount row, call number gated by order type', () => {
  const cs = fs.readFileSync(path.resolve('..', 'desktop', 'Services', 'PrinterService.cs'), 'utf8');
  for (const gone of ['عدد الأصناف', 'عدد القطع', 'line.Discount', 'public string Discount', 'ItemCount', 'PieceCount', 'IsMeasureUnitLabel', 'LabelValue("خصم"']) {
    assert.ok(!cs.includes(gone), `${gone} is removed from the printer`);
  }
  assert.ok(cs.includes('"إجمالي الخصم", "-" + FormatReceiptMoney(t.DiscountTotal)'), 'the single discount row is labelled and signed');
  assert.ok(!cs.includes('("الخصم", "-"'), 'the old unlabelled discount row is gone');
  assert.ok(cs.includes('line.Total = FormatReceiptMoney(GetReceiptLineGross(item));'), 'printed line totals stay gross (qty x unit price)');
  assert.ok(cs.includes('if (rows.Count > 0) p.Separator(p.Dashed, 0f, 3f);'), 'the dashed rule before the adjustment rows exists only when there are rows (no double rule)');
  assert.ok(cs.includes('bool hasCall = sale.OrderCallNumber > 0 && (orderType == "dine_in" || orderType == "takeaway" || orderType == "delivery");'), 'a retail sale never prints the call number');

  const paper = fs.readFileSync(path.resolve('src', 'components', 'ReceiptPaper.tsx'), 'utf8');
  assert.ok(!/itemsCountText|piecesCountText|line\.discount/.test(paper), 'the preview has no counts row and no per-line discount');
  assert.ok(paper.includes('model.adjustmentRows.length > 0 &&'), 'the preview draws the rule + rows only when there are rows');

  const repo = fs.readFileSync(path.resolve('..', 'desktop', 'Repositories', 'SaleRepository.cs'), 'utf8');
  assert.ok(repo.includes('if (sale.OrderCallNumber <= 0 && !isRetailSale)'), 'a retail sale does not consume the order_call_number counter');
});

test('GDI columns: every cell is measured with the family it is drawn with, plus a safety pad, and never clipped', () => {
  const cs = fs.readFileSync(path.resolve('..', 'desktop', 'Services', 'PrinterService.cs'), 'utf8');
  assert.ok(cs.includes('public const float CellPad = 3f;'));
  const cell = cs.slice(cs.indexOf('public float CellW('), cs.indexOf('public float LineH('));
  assert.ok(cell.includes('MeasureString(text, font, new PointF(0f, 0f), RtlNoWrap)'), 'Arabic cells are measured with the RtlNoWrap format they are drawn with');
  assert.ok(cell.includes('+ CellPad'));
  for (const name of ['RtlNoWrap', 'Left', 'Right']) {
    const line = cs.split('\n').find((l) => l.includes(`${name} = new StringFormat`) || l.includes(`${name}.FormatFlags |=`));
    assert.ok(line && line.includes('StringFormatFlags.NoClip'), `${name} never clips glyph overhang`);
  }
  const lines = cs.slice(cs.indexOf('private static void DrawReceiptLines'), cs.indexOf('private static List<ReceiptLine> BuildSaleReceiptLines'));
  assert.ok(lines.includes('float qtyW = p.CellW("الكمية", p.Bold);'), 'the qty header column is measured like it is drawn');
  assert.ok(lines.includes('Math.Max(qtyW, p.CellW(lines[i].Qty, p.Regular))'));
  assert.ok(lines.includes('p.TextW("السعر", p.Bold) + ReceiptPainter.CellPad') && lines.includes('p.TextW("الإجمالي", p.Bold) + ReceiptPainter.CellPad'));
  assert.ok(lines.includes('p.CellW(line.Name, p.Bold) <= nameAvail') && lines.includes('p.CellW("الصنف", p.Bold)'), 'the name decision uses the drawn family too');
  assert.ok(!/p\.TextW\(lines\[i\]\.Qty/.test(lines), 'no typographic measure for the RTL qty cells');
  // the only table helper is shared by the sale and the return receipt
  assert.equal(cs.split('DrawReceiptLines(p, ').length - 1, 2, 'sale and return receipts share the one fixed table');
  const labelValue = cs.slice(cs.indexOf('public void LabelValue('), cs.indexOf('private void DrawValue('));
  assert.ok(labelValue.includes('float labelW = CellW(label, labelFont);'));
});

test('receipt margins: one top constant, one bottom constant, trimmed page slack, preview padding matches', () => {
  const cs = fs.readFileSync(path.resolve('..', 'desktop', 'Services', 'PrinterService.cs'), 'utf8');
  assert.ok(cs.includes('public const float TopPad = 2f;') && cs.includes('Y = TopPad;'));
  assert.ok(cs.includes('public const float BottomPad = 5f;'));
  assert.equal(cs.split('p.Y += ReceiptPainter.BottomPad;').length - 1, 2, 'sale and return receipts end with the same small bottom pad');
  assert.ok(!cs.includes('p.Y += 8f;'), 'the old 8-unit bottom margin is gone');
  assert.ok(cs.includes('private const int ReceiptPageSlackHundredths = 3;') && cs.includes('+ ReceiptPageSlackHundredths;'));
  assert.ok(cs.includes('measured * job.Scale) + 2);'), 'height is still measured by the same paint pass the print uses');

  const paper = fs.readFileSync(path.resolve('src', 'components', 'ReceiptPaper.tsx'), 'utf8');
  assert.ok(paper.includes('w-[302px] px-4 py-2') && paper.includes('w-[220px] px-2.5 py-2'), '80mm and 57mm previews use a slim vertical padding');
  assert.ok(!/\bp-4\b|\bp-2\.5\b/.test(paper), 'no full-size padding on the paper');
});

test('the barcode preview renders the distinctive RFQ-INV- signature underneath the bars', () => {
  const paper = fs.readFileSync(path.resolve('src', 'components', 'ReceiptPaper.tsx'), 'utf8');
  const fn = paper.slice(paper.indexOf('function InvoiceBarcode'), paper.indexOf('export function ReceiptPaper'));
  assert.ok(fn.includes('<svg') && fn.includes('{value}'), 'both the bars and distinctive value are rendered');
  const cs = fs.readFileSync(path.resolve('..', 'desktop', 'Services', 'PrinterService.cs'), 'utf8');
  const draw = cs.slice(cs.indexOf('private static void DrawInvoiceBarcode'), cs.indexOf('private static void DrawReceiptLines'));
  assert.ok(draw.includes('WrapText'), 'the printed receipt draws the distinctive text under the bars');
});

// Shared with S54_ReceiptItemNameTest.cs (same rows): the printed product name is one clean line.
const NAME_CLEANING_TABLE = [
  ['لبن جهينة', 'لبن جهينة'],
  ['  لبن   جهينة  ', 'لبن جهينة'],
  ['أرز مصري\nعبوة 10 كجم', 'أرز مصري عبوة 10 كجم'],
  ['شاي\t\tليبتون\r\nأصفر', 'شاي ليبتون أصفر'],
  ['عصير 🍊 برتقال', 'عصير برتقال'],
  ['حلوى ❤ شوكولاتة ✓', 'حلوى شوكولاتة'],
  ['عبوة\u200Bكبيرة', 'عبوةكبيرة'],
  ['\u202Eمنتج\u202C عادي', 'منتج عادي'],
  ['Pampers® 5 Pack × 3', 'Pampers® 5 Pack × 3'],
  ['🍊🍋', ''],
  ['   ', ''],
  ['', ''],
];

test('cleanReceiptItemName: one clean printable line, nothing legitimate is lost', () => {
  for (const [input, expected] of NAME_CLEANING_TABLE) {
    assert.equal(cleanReceiptItemName(input), expected, JSON.stringify(input));
  }
  assert.equal(cleanReceiptItemName(null), '');
  assert.equal(cleanReceiptItemName(undefined), '');
});

test('the receipt model uses the cleaned name and falls back to "صنف" when nothing printable is left', () => {
  const sale = {
    id: 's1', invoiceNumber: 5, status: 'completed', paymentMethod: 'cash', totalPiasters: 2000, paidPiasters: 2000,
    items: [
      { productName: 'حلوى 🍬\nبالفراولة', quantityMilli: 1000, unitPricePiasters: 1000, unit: 'piece' },
      { productName: '🍬🍬', quantityMilli: 1000, unitPricePiasters: 1000, unit: 'piece' },
    ],
  };
  const model = buildReceiptModel(sale, { storeName: 'متجر' }, {});
  assert.equal(model.lines[0].name, 'حلوى بالفراولة');
  assert.equal(model.lines[1].name, 'صنف');
});
