import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SRC_DIR = fileURLToPath(new URL('../src/', import.meta.url));
const src = readFileSync(`${SRC_DIR}views/SalesHistoryView.tsx`, 'utf8').replace(/\r\n/g, '\n');

const MODAL_START = src.indexOf('{/* 4. Full Invoice Details Modal */}');
const MODAL_END = src.indexOf('{/* Void / Cancel Invoice Modal');
const modal = src.slice(MODAL_START, MODAL_END);
const BODY_START = modal.indexOf('{/* Modal Body */}');
const FOOTER_START = modal.indexOf('{/* Modal Footer Controls */}');

describe('sales history: row action', () => {
  const rowStart = src.indexOf('{/* Action View */}');
  const rowAction = src.slice(rowStart, src.indexOf('</AppButton>', rowStart));

  it('the details action in each row is a labelled AppButton, not icon-only', () => {
    assert.ok(rowStart > 0);
    assert.match(rowAction, /<AppButton[\s\S]*icon=\{Receipt\}/);
    assert.match(rowAction, />\s*تفاصيل\s*$/);
  });

  it('keeps the accessible name and tooltip', () => {
    assert.match(rowAction, /aria-label="عرض بنود وتفاصيل الفاتورة"/);
    assert.match(rowAction, /title="عرض بنود وتفاصيل الفاتورة"/);
  });

  it('the column header no longer repeats the word of the row action', () => {
    assert.ok(!src.includes('<span className="col-span-1 text-center">تفاصيل</span>'));
  });
});

describe('sales history: invoice details modal', () => {
  it('is located in the source', () => {
    assert.ok(MODAL_START > 0 && MODAL_END > MODAL_START);
    assert.ok(BODY_START > 0 && FOOTER_START > BODY_START);
  });

  it('is wide (max-w-4xl), full width on small screens and scrolls inside max-h-[90vh]', () => {
    assert.match(modal, /w-full max-w-4xl/);
    assert.ok(!modal.includes('max-w-3xl'));
    assert.match(modal, /max-h-\[90vh\]/);
  });

  it('has a tall header with the shared modal title role, the invoice number and a status chip', () => {
    const header = modal.slice(0, BODY_START);
    assert.match(header, /\bh-14\b/);
    assert.match(header, /t-modal-title/);
    assert.match(header, /#\{selectedSale\.invoiceNumber\}/);
    for (const label of ['سليمة', 'ملغية', 'فيها مرتجع']) assert.ok(header.includes(label), label);
  });

  it('uses text-sm as the base size with comfortable paddings', () => {
    const body = modal.slice(BODY_START, FOOTER_START);
    assert.match(body.split('\n')[1], /p-5 sm:p-6 flex flex-col gap-5[^"]*\btext-sm\b/);
  });

  it('never uses text-micro or px font sizes inside the modal', () => {
    assert.ok(!modal.includes('text-micro'));
    assert.ok(!/text-\[\d+px\]/.test(modal));
  });

  it('info block rows have a comfortable height and the items table has a sticky h-11 header and min-h-12 rows', () => {
    assert.match(src, /const DetailRow[\s\S]*min-h-9/);
    assert.match(modal, /sticky[^"]*\bh-11\b/);
    assert.match(modal, /min-h-12 px-4/);
    assert.match(modal, /text-sm font-semibold[^"]*break-words/);
    assert.ok(!/truncate/.test(modal.slice(modal.indexOf('Items Breakdown Table'), modal.indexOf('Detailed Returns Log'))));
  });

  it('totals use the KPI size for the final figure', () => {
    const totals = modal.slice(modal.indexOf('Financial Totals'), FOOTER_START);
    assert.match(totals, /t-kpi/);
    assert.match(totals, /min-h-14/);
  });

  it('footer is pinned h-16 and every footer action is an md AppButton with an icon', () => {
    const footer = modal.slice(FOOTER_START);
    assert.match(footer, /\bh-16\b/);
    assert.ok(!/<button/.test(footer));
    assert.match(footer, /variant="warning"[\s\S]*icon=\{RotateCcw\}/);
    assert.match(footer, /variant="danger"[\s\S]*icon=\{Ban\}/);
    assert.match(footer, /variant="primary"[\s\S]*icon=\{Printer\}/);
    assert.ok(!/size="(xs|sm|lg)"/.test(footer));
  });

  it('keeps permission gates, dismiss logic and animation hooks', () => {
    assert.match(modal, /canReturn && \(/);
    assert.match(modal, /canCancelInvoice && \(/);
    assert.match(modal, /canReprint && \(/);
    assert.match(modal, /requestCloseSaleDetails/);
    assert.match(modal, /animate-in fade-in zoom-in-95/);
  });

  it('uses tokens only: no hex colours and no palette classes, every status colour has a dark pair', () => {
    assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(modal), 'no hex colours');
    assert.ok(!/\b(?:text|bg|border)-(?:slate|gray|zinc|neutral|stone|red|amber|yellow|green|blue|orange|emerald)-\d{2,3}\b/.test(modal));
    assert.ok(!/text-danger font-/.test(modal), 'danger text needs a dark: pair');
  });
});
