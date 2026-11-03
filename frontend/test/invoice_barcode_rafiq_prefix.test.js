import test from 'node:test';
import assert from 'node:assert/strict';

// Test implementation of barcode logic matching invoiceBarcode.ts & barcodeReader.ts

const ARABIC_TO_QWERTY_MAP = {
  // Numbers
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
  '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
  
  // Row 1 (QWERTY)
  'ض': 'q', 'ص': 'w', 'ث': 'e', 'ق': 'r', 'ف': 't',
  'غ': 'y', 'ع': 'u', 'ه': 'i', 'خ': 'o', 'ح': 'p',
  'ج': '[', 'د': ']',

  // Row 2 (ASDF)
  'ش': 'a', 'س': 's', 'ي': 'd', 'ب': 'f', 'ل': 'g',
  'ا': 'h', 'ت': 'j', 'ن': 'k', 'م': 'l', 'ك': ';',
  'ط': '\'',

  // Row 3 (ZXCV)
  'ئ': 'z', 'ء': 'x', 'ؤ': 'c', 'ر': 'v', 'لا': 'b',
  'ى': 'n', 'ة': 'm', 'و': ',', 'ز': '.', 'ظ': '/',
};

function convertArabicLayoutToBarcode(raw) {
  if (!raw) return '';
  let out = '';
  for (let i = 0; i < raw.length; i++) {
    if (raw.substring(i, i + 2) === 'لا') {
      out += 'b';
      i++;
      continue;
    }
    const ch = raw[i];
    if (ch === '\uFEFB' || ch === '\uFEFC') {
      out += 'b';
    } else if (ARABIC_TO_QWERTY_MAP[ch] !== undefined) {
      out += ARABIC_TO_QWERTY_MAP[ch];
    } else {
      out += ch;
    }
  }
  return out.trim();
}

function parseInvoiceBarcode(rawInput) {
  if (!rawInput) return null;
  const trimmed = rawInput.trim();
  if (!trimmed) return null;

  const normalized = convertArabicLayoutToBarcode(trimmed).toUpperCase();

  // 1. Sales Invoices: RFQ-INV-00001001, RFQ-00001001, INV-00001001, INV1001
  const invPrefixMatch = normalized.match(/^(?:(?:RFQ-INV|RFQ|INV)-?)([0-9]+)$/i);
  if (invPrefixMatch && invPrefixMatch[1]) {
    const num = parseInt(invPrefixMatch[1], 10);
    if (!isNaN(num) && num > 0) {
      return {
        type: 'sale',
        invoiceNumber: num,
        originalQuery: trimmed,
      };
    }
  }

  // UUID match
  const invUuidMatch = normalized.match(/^(?:(?:RFQ-INV|RFQ|INV)-?)([A-F0-9-]{32,36})$/i);
  if (invUuidMatch && invUuidMatch[1]) {
    return {
      type: 'sale',
      rawId: invUuidMatch[1].toLowerCase(),
      originalQuery: trimmed,
    };
  }

  // 2. Return Invoices: RFQ-RET-00000123, RFQ-RET-123, RET-000123, RET123
  const retPrefixMatch = normalized.match(/^(?:(?:RFQ-RET|RET)-?)([0-9]+)$/i);
  if (retPrefixMatch && retPrefixMatch[1]) {
    const num = parseInt(retPrefixMatch[1], 10);
    if (!isNaN(num) && num > 0) {
      return {
        type: 'return',
        invoiceNumber: num,
        originalQuery: trimmed,
      };
    }
  }

  return null;
}

function formatInvoiceBarcode(invoiceNumber) {
  if (invoiceNumber === null || invoiceNumber === undefined) return '';
  const num = typeof invoiceNumber === 'number' ? invoiceNumber : parseInt(String(invoiceNumber).trim(), 10);
  if (!isNaN(num) && num > 0) {
    return `RFQ-INV-${String(num).padStart(8, '0')}`;
  }
  const str = String(invoiceNumber).trim().toUpperCase();
  if (str.startsWith('RFQ-INV-')) return str;
  if (str.startsWith('RFQ-')) return str.replace(/^RFQ-/, 'RFQ-INV-');
  if (str.startsWith('INV-')) return `RFQ-${str}`;
  return `RFQ-INV-${str}`;
}

function formatReturnBarcode(returnNumber) {
  if (returnNumber === null || returnNumber === undefined) return '';
  const num = typeof returnNumber === 'number' ? returnNumber : parseInt(String(returnNumber).trim(), 10);
  if (!isNaN(num) && num > 0) {
    return `RFQ-RET-${String(num).padStart(8, '0')}`;
  }
  const str = String(returnNumber).trim().toUpperCase();
  if (str.startsWith('RFQ-RET-')) return str;
  if (str.startsWith('RET-')) return `RFQ-${str}`;
  return `RFQ-RET-${str}`;
}

test('Distinct Rafiq POS Invoice & Return Barcode Suite', async (t) => {
  await t.test('1. formatInvoiceBarcode produces distinctive RFQ-INV- signature with 8 zero-padded digits', () => {
    assert.equal(formatInvoiceBarcode(1001), 'RFQ-INV-00001001');
    assert.equal(formatInvoiceBarcode(1), 'RFQ-INV-00000001');
    assert.equal(formatInvoiceBarcode('1001'), 'RFQ-INV-00001001');
    assert.equal(formatInvoiceBarcode('INV-1001'), 'RFQ-INV-1001');
    assert.equal(formatInvoiceBarcode('RFQ-INV-00001001'), 'RFQ-INV-00001001');
    assert.equal(formatInvoiceBarcode('RFQ-00001001'), 'RFQ-INV-00001001');
  });

  await t.test('2. formatReturnBarcode produces distinctive RFQ-RET- signature', () => {
    assert.equal(formatReturnBarcode(123), 'RFQ-RET-00000123');
    assert.equal(formatReturnBarcode('123'), 'RFQ-RET-00000123');
    assert.equal(formatReturnBarcode('RET-000123'), 'RFQ-RET-000123');
    assert.equal(formatReturnBarcode('RFQ-RET-00000123'), 'RFQ-RET-00000123');
  });

  await t.test('3. parseInvoiceBarcode accurately parses RFQ-INV- and legacy INV- sales barcodes', () => {
    const res1 = parseInvoiceBarcode('RFQ-INV-00001001');
    assert.ok(res1);
    assert.equal(res1.type, 'sale');
    assert.equal(res1.invoiceNumber, 1001);

    const res2 = parseInvoiceBarcode('RFQ-INV-1001');
    assert.ok(res2);
    assert.equal(res2.type, 'sale');
    assert.equal(res2.invoiceNumber, 1001);

    const res3 = parseInvoiceBarcode('RFQ-00001001');
    assert.ok(res3);
    assert.equal(res3.type, 'sale');
    assert.equal(res3.invoiceNumber, 1001);

    const res4 = parseInvoiceBarcode('INV-00001001');
    assert.ok(res4);
    assert.equal(res4.type, 'sale');
    assert.equal(res4.invoiceNumber, 1001);

    const res5 = parseInvoiceBarcode('INV1001');
    assert.ok(res5);
    assert.equal(res5.type, 'sale');
    assert.equal(res5.invoiceNumber, 1001);
  });

  await t.test('4. parseInvoiceBarcode accurately parses RFQ-RET- and legacy RET- return barcodes', () => {
    const res1 = parseInvoiceBarcode('RFQ-RET-00000123');
    assert.ok(res1);
    assert.equal(res1.type, 'return');
    assert.equal(res1.invoiceNumber, 123);

    const res2 = parseInvoiceBarcode('RET-000123');
    assert.ok(res2);
    assert.equal(res2.type, 'return');
    assert.equal(res2.invoiceNumber, 123);

    const res3 = parseInvoiceBarcode('RET123');
    assert.ok(res3);
    assert.equal(res3.type, 'return');
    assert.equal(res3.invoiceNumber, 123);
  });

  await t.test('5. Arabic keyboard layout immunity automatically decodes Arabic characters to RFQ-INV and RFQ-RET', () => {
    // Typing RFQ-INV-00001001 on Arabic keyboard produces قبض-هىر-00001001
    const resArabicSale = parseInvoiceBarcode('قبض-هىر-00001001');
    assert.ok(resArabicSale);
    assert.equal(resArabicSale.type, 'sale');
    assert.equal(resArabicSale.invoiceNumber, 1001);

    // Typing with Eastern Arabic numerals: قبض-هىر-٠٠٠٠١٠٠١
    const resArabicSaleNumerals = parseInvoiceBarcode('قبض-هىر-٠٠٠٠١٠٠١');
    assert.ok(resArabicSaleNumerals);
    assert.equal(resArabicSaleNumerals.type, 'sale');
    assert.equal(resArabicSaleNumerals.invoiceNumber, 1001);

    // Legacy INV-00001001 on Arabic keyboard: هىر-00001001
    const resLegacyArabic = parseInvoiceBarcode('هىر-00001001');
    assert.ok(resLegacyArabic);
    assert.equal(resLegacyArabic.type, 'sale');
    assert.equal(resLegacyArabic.invoiceNumber, 1001);

    // Typing RFQ-RET-00000123 on Arabic keyboard: قبض-قثف-00000123
    const resArabicReturn = parseInvoiceBarcode('قبض-قثف-00000123');
    assert.ok(resArabicReturn);
    assert.equal(resArabicReturn.type, 'return');
    assert.equal(resArabicReturn.invoiceNumber, 123);
  });

  await t.test('6. Ordinary product barcodes and SKUs return null (never confused for invoices)', () => {
    assert.equal(parseInvoiceBarcode('6223000123456'), null);
    assert.equal(parseInvoiceBarcode('12345678'), null);
    assert.equal(parseInvoiceBarcode('ITEM-001'), null);
    assert.equal(parseInvoiceBarcode(''), null);
  });
});

