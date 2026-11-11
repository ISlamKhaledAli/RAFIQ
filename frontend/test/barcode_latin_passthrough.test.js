import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { convertArabicLayoutToBarcode, sanitizeScannedBarcode } from '../src/utils/barcodeReader.ts';

describe('barcode wedge: Latin input is never remapped as Arabic-layout output', () => {
  it('leaves Latin punctuation untouched', () => {
    assert.equal(sanitizeScannedBarcode('ABC.123'), 'ABC.123');
    assert.equal(sanitizeScannedBarcode('A-12/3'), 'A-12/3');
    assert.equal(sanitizeScannedBarcode('ABC,1'), 'ABC,1');
    assert.equal(sanitizeScannedBarcode('a~b'), 'a~b');
    assert.equal(sanitizeScannedBarcode('X[1]{2}:"3"'), 'X[1]{2}:"3"');
    assert.equal(convertArabicLayoutToBarcode('ABC.123'), 'ABC.123');
    assert.equal(convertArabicLayoutToBarcode('A-12/3'), 'A-12/3');
  });

  it('leaves plain digit barcodes and trims whitespace', () => {
    assert.equal(sanitizeScannedBarcode('6221234567890'), '6221234567890');
    assert.equal(convertArabicLayoutToBarcode('  6221234567890 '), '6221234567890');
    assert.equal(sanitizeScannedBarcode(''), '');
  });

  it('still recovers Arabic-layout output (Arabic-Indic digits and letter keys)', () => {
    assert.equal(sanitizeScannedBarcode('٦٢٢١٢٣٤٥٦٧٨٩٠'), '6221234567890');
    assert.equal(convertArabicLayoutToBarcode('۶۲۲۱'), '6221');
    assert.equal(convertArabicLayoutToBarcode('شسي'), 'asd');
    assert.equal(convertArabicLayoutToBarcode('لا'), 'b');
  });

  it('strips the scanner prefix and the AIM identifier on both Latin and Arabic input', () => {
    assert.equal(sanitizeScannedBarcode(']C16221234567890'), '6221234567890');
    assert.equal(sanitizeScannedBarcode('*6221234567890', '*'), '6221234567890');
  });
});
