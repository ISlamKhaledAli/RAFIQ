import { test, describe } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('ProductFormModal Scanner Enter Guard & Barcode Sanitization', () => {
  const modalPath = path.resolve(__dirname, '../src/views/products/ProductFormModal.tsx');
  const viewPath = path.resolve(__dirname, '../src/views/ProductsView.tsx');

  test('ProductFormModal imports sanitizeScannedBarcode from barcodeReader', () => {
    const content = fs.readFileSync(modalPath, 'utf8');
    assert.ok(
      content.includes("import { sanitizeScannedBarcode } from '../../utils/barcodeReader';") ||
      content.includes("sanitizeScannedBarcode"),
      'ProductFormModal must import sanitizeScannedBarcode'
    );
  });

  test('ProductFormModal defines barcodeInputRef, priceInputRef, and costInputRef', () => {
    const content = fs.readFileSync(modalPath, 'utf8');
    assert.ok(content.includes('barcodeInputRef = useRef<HTMLInputElement>'), 'barcodeInputRef must be defined');
    assert.ok(content.includes('priceInputRef = useRef<HTMLInputElement>'), 'priceInputRef must be defined');
    assert.ok(content.includes('costInputRef = useRef<HTMLInputElement>'), 'costInputRef must be defined');
  });

  test('Primary barcode input intercepts Enter key and redirects focus to priceInputRef', () => {
    const content = fs.readFileSync(modalPath, 'utf8');
    assert.ok(content.includes('ref={barcodeInputRef}'), 'barcode input must bind barcodeInputRef');
    assert.ok(content.includes('priceInputRef.current?.focus()'), 'Enter on barcode input must focus priceInputRef');
    assert.ok(content.includes('e.preventDefault()'), 'Enter on barcode must prevent default form submission');
  });

  test('Primary and secondary barcode inputs sanitize scanned barcode for Arabic layout & AIM tags', () => {
    const content = fs.readFileSync(modalPath, 'utf8');
    assert.ok(
      content.includes('sanitizeScannedBarcode(normalizeArabicNumerals(e.target.value))'),
      'Barcode inputs must use sanitizeScannedBarcode'
    );
  });

  test('Modal form element prevents accidental Enter submission from inputs', () => {
    const content = fs.readFileSync(modalPath, 'utf8');
    assert.ok(
      content.includes("if (input.type !== 'submit' && input.type !== 'button')"),
      'Form must guard text inputs from accidental submit on Enter'
    );
    assert.ok(
      content.includes("e.ctrlKey || e.metaKey"),
      'Form must allow explicit Ctrl+Enter / Cmd+Enter shortcut to save'
    );
  });

  test('ProductsView sanitizes primary and extra barcodes before sending products:save', () => {
    const content = fs.readFileSync(viewPath, 'utf8');
    assert.ok(
      content.includes('sanitizeScannedBarcode(barcode.trim())'),
      'ProductsView must sanitize primary barcode before saving'
    );
    assert.ok(
      content.includes('sanitizeScannedBarcode(b.trim())'),
      'ProductsView must sanitize extra barcodes before saving'
    );
  });
});
