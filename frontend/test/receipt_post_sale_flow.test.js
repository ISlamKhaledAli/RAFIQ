import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { shouldPrintReceipt, setReceiptPrintPreference } from '../src/utils/receiptPrintPreference.ts';

const read = (...parts) => fs.readFileSync(path.resolve('src', ...parts), 'utf8');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe('post-sale flow honours the cashier print switch', () => {
  beforeEach(() => {
    const store = new Map();
    globalThis.localStorage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => { store.set(k, String(v)); },
      removeItem: (k) => { store.delete(k); },
    };
  });

  it('the cashier switch wins over the store setting, the store setting is the fallback', () => {
    assert.equal(shouldPrintReceipt(), true, 'no setting at all: print');
    localStorage.setItem('rafiq_pos_printer_auto_print', '0');
    assert.equal(shouldPrintReceipt(), false, 'store setting off');
    setReceiptPrintPreference(true);
    assert.equal(shouldPrintReceipt(), true, 'cashier switch on overrides the store setting');
    setReceiptPrintPreference(false);
    localStorage.setItem('rafiq_pos_printer_auto_print', '1');
    assert.equal(shouldPrintReceipt(), false, 'cashier switch off overrides the store setting');
  });

  it('PosView decides with shouldPrintReceipt: print on = direct print and no window unless it fails, off = nothing', () => {
    const pos = read('views', 'PosView.tsx');
    assert.ok(pos.includes("import { shouldPrintReceipt } from '../utils/receiptPrintPreference'"));
    const start = pos.indexOf('if (shouldPrintReceipt()) {');
    assert.ok(start > 0, 'the post-sale flow calls shouldPrintReceipt()');
    const flow = pos.slice(start, pos.indexOf('negativeStockWarnings', start));
    assert.ok(!flow.includes('window.chrome?.webview'), 'printing does not depend on the environment, so no preview window is forced in the browser');
    assert.ok(/invoke<[^>]*>\('printer:printReceipt', \{ saleId: completedSale\.id \}\)/.test(flow), 'prints the stored sale by id');
    assert.ok(flow.includes("'warning'") && flow.includes('setIsReceiptOpen(true)'), 'a failed print keeps the warning and opens the preview for retry');
    const before = pos.slice(pos.lastIndexOf('setIsReceiptOpen(false);', start), start);
    assert.ok(before.includes('setIsReceiptOpen(false);'), 'the receipt modal is closed by default, so print off or a successful print shows no window');
    assert.ok(!flow.includes("localStorage.getItem('rafiq_pos_printer_auto_print')"), 'the switch helper replaces the raw storage read');
    assert.ok(pos.includes("localStorage.setItem('rafiq_pos_printer_auto_print', appSettings.printer_auto_print)"), 'the store setting is still mirrored');
  });

  it('ReceiptModal drops the saved-in-database line and uses theme tokens for the warning banner', () => {
    const modal = read('components', 'ReceiptModal.tsx');
    assert.ok(!modal.includes('قاعدة البيانات'), 'no "saved in database" line: the sale toast already says it');
    assert.ok(!/amber-/.test(modal), 'no palette classes');
    assert.ok(modal.includes('bg-warn-soft dark:bg-warn-dark-soft'), 'warning banner uses theme tokens with a dark pair');
    assert.ok(modal.includes('محفوظة. تأكد من الطابعة والورق ثم اعد المحاولة.'), 'short retry hint');
  });

  it('sales history keeps a permission-gated reprint that prints the stored sale as a copy', () => {
    const history = read('views', 'SalesHistoryView.tsx');
    assert.ok(history.includes("hasPermission('pos.reprint')"));
    assert.ok(/'printer:printReceipt',\s*\{\s*saleId:\s*selectedSale\.id,\s*isCopy:\s*true/.test(history));
  });
});

describe('success messages stay short', () => {
  it('no "saved successfully in the database" wording anywhere in the UI source (mock bridge excluded)', () => {
    const offenders = [];
    for (const file of walk(path.resolve('src'))) {
      if (file.endsWith(path.join('bridge', 'ipc.ts'))) continue;
      const text = fs.readFileSync(file, 'utf8');
      if (/بنجاح في (قاعدة البيانات|الداتابيز)/.test(text)) offenders.push(file);
    }
    assert.deepEqual(offenders, []);
  });

  it('the POS sale and hold toasts carry only what happened', () => {
    const pos = read('views', 'PosView.tsx');
    assert.ok(pos.includes("showStatus('تم تعليق الفاتورة', 'success')"));
    assert.ok(pos.includes('showStatus(`تم حفظ الفاتورة #${completedSale.invoiceNumber || \'\'}`, \'success\')'));
    assert.ok(pos.includes('completedSale.negativeStockWarnings[0]'), 'the negative-stock warning is still shown');
  });
});
