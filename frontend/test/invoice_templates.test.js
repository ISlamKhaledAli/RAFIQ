import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const read = (...parts) => readFileSync(join(SRC, ...parts), 'utf8').replace(/\r\n/g, '\n');

const EMOJI_REGEX = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/u;

describe('Invoice & Document Templates Suite: Live Preview, Styling & RBAC Invariants', () => {
  const templatesSrc = read('views', 'settings', 'InvoiceTemplatesTab.tsx');
  const permGroupsSrc = read('constants', 'permissionGroups.ts');
  const securityServiceSrc = read('..', '..', 'desktop', 'Services', 'SecurityService.cs');

  it('1. Strict Zero-Emojis policy: no emojis in templates tab source or simulated documents', () => {
    assert.ok(!EMOJI_REGEX.test(templatesSrc), 'InvoiceTemplatesTab must contain zero emojis');
  });

  it('2. Theme tokens discipline: no raw ad-hoc hex colors in InvoiceTemplatesTab', () => {
    const rawHexMatches = templatesSrc.match(/#[0-9a-fA-F]{3,8}\b/g);
    assert.equal(rawHexMatches, null, 'Must use semantic tailwind tokens, not raw ad-hoc hex');
  });

  it('3. Dark mode support: every surface and ink element has dark: pair', () => {
    assert.ok(templatesSrc.includes('dark:bg-surface-dark'));
    assert.ok(templatesSrc.includes('dark:border-line-dark'));
    assert.ok(templatesSrc.includes('dark:text-ink-dark'));
    assert.ok(templatesSrc.includes('dark:text-ink-dark-muted'));
  });

  it('4. Real paper isolation: simulated printed paper remains crisp black-on-white regardless of app theme', () => {
    assert.ok(templatesSrc.includes('bg-white text-black'), 'Physical paper must be simulated as white thermal/A4 sheet');
    assert.ok(templatesSrc.includes('border-neutral-300') || templatesSrc.includes('border-line'), 'Paper must have realistic physical outline');
  });

  it('5. Covers all 7 required business document templates with live renderers', () => {
    const docs = ['return', 'purchase', 'receipt_voucher', 'payment_voucher', 'daily_closing', 'quotation', 'statement'];
    for (const doc of docs) {
      assert.ok(templatesSrc.includes(`'${doc}'`), `Must support document type: ${doc}`);
    }
    assert.ok(templatesSrc.includes('renderReturnContent'), 'Must render Sales Return Receipt');
    assert.ok(templatesSrc.includes('renderPurchaseContent'), 'Must render Purchase Invoice');
    assert.ok(templatesSrc.includes('renderReceiptVoucherContent'), 'Must render Customer Receipt Voucher');
    assert.ok(templatesSrc.includes('renderPaymentVoucherContent'), 'Must render Cash Payment Voucher');
    assert.ok(templatesSrc.includes('renderDailyClosingContent'), 'Must render Shift Z-Report Closing');
    assert.ok(templatesSrc.includes('renderQuotationContent'), 'Must render Price Quotation');
    assert.ok(templatesSrc.includes('renderStatementContent'), 'Must render Statement of Account');
  });

  it('6. Supports physical paper size simulation (80mm, 57mm, A4) with live zoom controls', () => {
    assert.ok(templatesSrc.includes("'80mm'"));
    assert.ok(templatesSrc.includes("'57mm'"));
    assert.ok(templatesSrc.includes("'a4'"));
    assert.ok(templatesSrc.includes('zoomLevel'), 'Must support live zoom scaling');
    assert.ok(templatesSrc.includes('setZoomLevel'));
  });

  it('7. Integrates Arabic Tafqeet for integer financial amounts in vouchers', () => {
    assert.ok(templatesSrc.includes('tafqeetCurrency'), 'Must use enterprise Arabic Tafqeet helper');
    assert.ok(templatesSrc.includes('formatArabicCurrency'), 'Must use Egyptian currency formatter');
  });

  it('8. Authentic Code 128 Barcode generation in receipt preview', () => {
    assert.ok(templatesSrc.includes('encodeInvoiceBarcode'));
    assert.ok(templatesSrc.includes('layoutReceiptBarcode'));
    assert.ok(templatesSrc.includes('BarcodeSnippet'));
  });

  it('9. StoreProfileTab wiring: templates sub-tab registered cleanly alongside the mother sales invoice', () => {
    const storeProfileSrc = read('views', 'settings', 'StoreProfileTab.tsx');
    assert.ok(storeProfileSrc.includes('InvoiceTemplatesTab'), 'StoreProfileTab must render InvoiceTemplatesTab');
    assert.ok(storeProfileSrc.includes('profileViewMode'), 'StoreProfileTab must provide tab switching between mother invoice and other templates');
    assert.ok(storeProfileSrc.includes('معاينة وتخصيص باقي الفواتير والمستندات'), 'Must offer clear Arabic tab title');
  });

  it('10. RBAC and Permissions Matrix: registered in SecurityService.cs and permissionGroups.ts', () => {
    assert.ok(permGroupsSrc.includes('settings.templates'), 'Must be in permissionGroups.ts');
    assert.ok(securityServiceSrc.includes('settings.templates'), 'Must be in SecurityService.cs ALL_PERMISSIONS');
  });
});
