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
  formatReceiptDateTime,
  formatReceiptMoney,
  formatReceiptQuantity,
  formatReceiptQuantityWithUnit,
  groupThousands,
  layoutReceiptTable,
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
  assert.equal(plain.footer, '', 'no footer text configured: nothing is printed');
  assert.deepEqual(plain.footerLines, []);
  assert.equal(plain.footerBlock, false);
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
  assert.ok(body.indexOf('p.Y += p.LineH(p.Small) * 1.5f;') < body.indexOf('DrawSignatureBanner'), 'the one-and-a-half line gap comes before the image');
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
  assert.ok(tab.includes('<textarea'), 'header / footer / signature are textareas');
  assert.ok(tab.includes('اضغط Enter للانتقال لسطر جديد'), 'the Enter hint is shown');
  assert.ok(!tab.includes('تطوير: م. إسلام خالد'), 'no stale single-line signature in the editor');
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
