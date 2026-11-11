import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  EMPTY_REPORT_MESSAGE,
  NO_PRINTER_REASON,
  REPORT_BUSY_MESSAGE,
  buildStandaloneReportHtml,
  createReportOutput,
  describeError,
  runReportOutput,
} from '../src/utils/printReport.ts';

/**
 * Report output: print through the host, and when there is no printer or printing fails SAVE the same report.
 * The flow is tested with injected host fakes; the source-level checks make sure every report button uses the helper.
 */

const PDF = { path: 'C:\\Reports\\a.pdf', folder: 'C:\\Reports', fileName: 'a.pdf', format: 'pdf' };
const HTML = { path: 'C:\\Reports\\a.html', folder: 'C:\\Reports', fileName: 'a.html', format: 'html' };

function fakeHost(overrides = {}) {
  const calls = [];
  const host = {
    calls,
    async getPrinterStatus() { calls.push('status'); return { hasPrinter: true }; },
    async print() { calls.push('print'); },
    async savePdf(name) { calls.push('pdf:' + name); return PDF; },
    async saveHtml(name) { calls.push('html:' + name); return HTML; },
    ...overrides,
  };
  return host;
}

test('printer ok: the print UI is opened and nothing is saved', async () => {
  const host = fakeHost();
  const outcome = await runReportOutput(host, { reportName: 'تقرير النواقص' });
  assert.equal(outcome.status, 'printed');
  assert.deepEqual(host.calls, ['status', 'print']);
});

test('no printer: printing is skipped and the report is saved as PDF with an Arabic message', async () => {
  const host = fakeHost({ async getPrinterStatus() { host.calls.push('status'); return { hasPrinter: false }; } });
  const outcome = await runReportOutput(host, { reportName: 'تقرير النواقص' });
  assert.equal(outcome.status, 'saved');
  assert.deepEqual(host.calls, ['status', 'pdf:تقرير النواقص']);
  assert.deepEqual(outcome.saved, PDF);
  assert.ok(outcome.message.includes(NO_PRINTER_REASON));
  assert.ok(outcome.message.includes('تقرير النواقص'));
});

test('printer fails: the SAME report name is saved and the printer error is part of the message', async () => {
  const host = fakeHost({ async print() { host.calls.push('print'); throw new Error('الطابعة غير متصلة'); } });
  const outcome = await runReportOutput(host, { reportName: 'كشف حساب أحمد' });
  assert.equal(outcome.status, 'saved');
  assert.deepEqual(host.calls, ['status', 'print', 'pdf:كشف حساب أحمد']);
  assert.ok(outcome.message.includes('الطابعة غير متصلة'));
});

test('PDF save fails: the standalone HTML file is saved instead', async () => {
  const host = fakeHost({
    async getPrinterStatus() { return { hasPrinter: false }; },
    async savePdf() { host.calls.push('pdf'); throw new Error('انتهت مهلة إنشاء ملف PDF.'); },
  });
  const outcome = await runReportOutput(host, { reportName: 'تقرير' });
  assert.equal(outcome.status, 'saved');
  assert.deepEqual(outcome.saved, HTML);
  assert.deepEqual(host.calls, ['pdf', 'html:تقرير']);
});

test('save fails too: the Arabic errors are surfaced verbatim, nothing is thrown, the report stays on screen', async () => {
  const host = fakeHost({
    async print() { throw new Error('الطابعة خارج الخدمة'); },
    async savePdf() { throw new Error('لا توجد صلاحية كتابة على المجلد.'); },
    async saveHtml() { throw new Error('لا توجد مساحة كافية على القرص.'); },
  });
  const outcome = await runReportOutput(host, { reportName: 'تقرير' });
  assert.equal(outcome.status, 'failed');
  assert.equal(outcome.saved, undefined);
  for (const piece of ['الطابعة خارج الخدمة', 'لا توجد صلاحية كتابة على المجلد.', 'لا توجد مساحة كافية على القرص.', 'ما زال معروضاً على الشاشة']) {
    assert.ok(outcome.message.includes(piece), piece);
  }
});

test('empty data: nothing is printed or saved and the user is told so', async () => {
  const host = fakeHost();
  const outcome = await runReportOutput(host, { reportName: 'تقرير', hasData: false });
  assert.equal(outcome.status, 'empty');
  assert.equal(outcome.message, EMPTY_REPORT_MESSAGE);
  assert.ok(outcome.message.includes('لا توجد بيانات'));
  assert.deepEqual(host.calls, []);
});

test('unknown printer status does not block printing', async () => {
  const host = fakeHost({ async getPrinterStatus() { throw new Error('timeout'); } });
  const outcome = await runReportOutput(host, { reportName: 'تقرير', hasData: true });
  assert.equal(outcome.status, 'printed');
  assert.deepEqual(host.calls, ['print']);
});

test('non-Error rejections still give an Arabic message', async () => {
  assert.equal(describeError(undefined), 'خطأ غير معروف');
  assert.equal(describeError('سبب نصي'), 'سبب نصي');
  assert.equal(describeError(new Error('')), 'خطأ غير معروف');
});

test('double click guard: a second request while the first is running is ignored, then allowed again', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const host = fakeHost({ async print() { host.calls.push('print'); await gate; } });
  const controller = createReportOutput(() => host, 0);

  const first = controller.run({ kind: 'a4only' }, { reportName: 'تقرير' });
  assert.equal(controller.isBusy(), true);
  const second = await controller.run({ kind: 'a4only' }, { reportName: 'تقرير' });
  assert.equal(second.status, 'busy');
  assert.equal(second.message, REPORT_BUSY_MESSAGE);

  release();
  assert.equal((await first).status, 'printed');
  assert.equal(controller.isBusy(), false);
  assert.equal(host.calls.filter((c) => c === 'print').length, 1);
  assert.equal((await controller.run({ kind: 'a4only' }, { reportName: 'تقرير' })).status, 'printed');
});

test('standalone HTML is RTL, UTF-8, escapes the title and keeps the page rule', () => {
  const html = buildStandaloneReportHtml('تقرير <b>"س"</b>', '<div data-print-target>محتوى</div>', '.x{color:red}', 'a4', 'landscape');
  assert.ok(html.startsWith('<!DOCTYPE html>'));
  assert.ok(html.includes('dir="rtl"') && html.includes('<meta charset="utf-8">'));
  assert.ok(html.includes('<title>تقرير &lt;b&gt;&quot;س&quot;&lt;/b&gt;</title>'));
  assert.ok(html.includes('@page { size: A4 landscape;'));
  assert.ok(html.includes('<div data-print-target>محتوى</div>'));
  assert.ok(html.includes('.x{color:red}'));
});

// ---------------------------------------------------------------------------
// Source-level: every report button goes through the helper
// ---------------------------------------------------------------------------

const SRC = path.resolve(import.meta.dirname, '../src');
const CS = path.resolve(import.meta.dirname, '../../desktop');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const sourceFiles = walk(SRC).filter((f) => /\.(ts|tsx)$/.test(f));
const read = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const rel = (f) => path.relative(SRC, f).split(path.sep).join('/');

// Dedicated paths that must NOT use the helper, each with the reason
const ALLOWED_DIRECT_PRINT = {
  'utils/printReport.ts': 'the helper itself',
  'components/RecoveryCodeModal.tsx': 'recovery code sheet is a secret: never auto-saved to a file, errors are shown instead',
};

test('no component calls window.print() or printReport()/printCompactReport() directly outside the allow-list', () => {
  const offenders = [];
  for (const file of sourceFiles) {
    const name = rel(file);
    if (ALLOWED_DIRECT_PRINT[name]) continue;
    const text = read(file);
    if (/window\.print\s*\(/.test(text) || /\bprintReport\s*\(/.test(text) || /\bprintCompactReport\s*\(/.test(text)) offenders.push(name);
  }
  assert.deepEqual(offenders, []);
});

test('the recovery sheet reports a failed print instead of swallowing it', () => {
  const text = read(path.join(SRC, 'components/RecoveryCodeModal.tsx'));
  assert.ok(!/void printCompactReport/.test(text));
  assert.ok(/await printCompactReport\('a4'\)/.test(text));
});

const REPORT_BUTTON_FILES = [
  'components/LowStockReportModal.tsx',
  'components/DebtorsReportModal.tsx',
  'components/ExpiryReturnsModal.tsx',
  'components/DataQualityAuditModal.tsx',
  'components/ControlledDrugsRegisterModal.tsx',
  'components/BarcodeLabelModal.tsx',
  'components/PharmacyStocktakingModal.tsx',
  'components/SpecializedPharmacyReportsModal.tsx',
  'components/CertifiedHardwareModal.tsx',
  'views/products/StorageLocationsModal.tsx',
  'views/customers/CustomerPrintStatementModal.tsx',
  'views/customers/CustomerReceiptVoucherModal.tsx',
];

test('every report print button uses usePrintReport with an Arabic report name and a loading state', () => {
  for (const name of REPORT_BUTTON_FILES) {
    const text = read(path.join(SRC, name));
    assert.ok(/usePrintReport\(\{/.test(text), name + ': usePrintReport');
    assert.ok(/reportName:[^\n]*[\u0600-\u06FF]/.test(text), name + ': Arabic reportName');
    assert.ok(/loading=\{\w+\}/.test(text), name + ': loading state on the button');
    assert.ok(!/void printReport|void printCompactReport/.test(text), name + ': no swallowed print');
  }
});

test('hooks are called before any early return in the report components', () => {
  for (const name of REPORT_BUTTON_FILES) {
    const text = read(path.join(SRC, name));
    const hookAt = text.indexOf('usePrintReport({');
    const earlyReturn = text.search(/\n\s*if \(!isOpen[^\n]*\) return null;/);
    if (earlyReturn >= 0) assert.ok(hookAt < earlyReturn, name + ': hook must come before the early return');
  }
});

test('receipt print failures offer the save-as-image fallback', () => {
  const receipt = read(path.join(SRC, 'components/ReceiptModal.tsx'));
  const history = read(path.join(SRC, 'views/SalesHistoryView.tsx'));
  assert.ok(receipt.includes('saveReceiptImageWithNotice') && /printStatus && !printStatus\.ok && \(/.test(receipt));
  assert.ok(history.includes('saveReceiptImageWithNotice') && history.includes('reprintFailed'));
});

test('the helper only calls host actions that exist, with a permission gate', () => {
  const dispatcher = fs.readFileSync(path.join(CS, 'Bridge/IpcDispatcher.cs'), 'utf8');
  const helper = read(path.join(SRC, 'utils/printReport.ts')) + read(path.join(SRC, 'utils/reportNotice.ts'));
  for (const action of ['system:showPrintDialog', 'report:getPrinterStatus', 'report:savePdf', 'report:saveFile', 'report:openFolder', 'printer:saveReceiptImage']) {
    assert.ok(helper.includes("'" + action + "'"), action + ' used by the helper');
    assert.ok(new RegExp('\\{ "' + action + '", [^}]+\\}').test(dispatcher), action + ' is mapped in ACTION_PERMISSIONS');
  }
  assert.ok(/\{ "printer:saveReceiptImage", "pos\.reprint" \}/.test(dispatcher), 'receipt image needs the reprint permission');
});

test('the host never lets the UI choose the save folder or file extension', () => {
  const host = fs.readFileSync(path.join(CS, 'Bridge/IpcDispatcher.ReportFiles.cs'), 'utf8');
  assert.ok(!/payload\["(folder|path|targetFolder|directory)"\]/.test(host));
  assert.ok(host.includes('ReportFileService.NormalizeExtension'));
});
