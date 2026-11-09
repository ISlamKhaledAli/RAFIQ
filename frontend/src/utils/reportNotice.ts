// Message shown after a report was saved instead of printed (or could not be output at all).
// Plain DOM on purpose: report buttons live in many modals, and the notice must survive a modal closing.

import { invoke } from '../bridge/ipc';
import {
  outputReport,
  describeError,
  type PrintReportOptions,
  type ReportOutcome,
  type ReportOutputRequest,
} from './printReport';

const NOTICE_ID = 'report-output-notice';
const SAVED_VISIBLE_MS = 15000;
const EMPTY_VISIBLE_MS = 5000;

const TONE_CLASS: Record<'saved' | 'empty' | 'failed', string> = {
  saved: 'bg-paid-soft border-paid-border text-paid dark:bg-paid-dark dark:border-paid-dark-border dark:text-paid-bright',
  empty: 'bg-warn-soft border-warn-border text-warn dark:bg-warn-dark-soft dark:border-line-dark dark:text-warn-bright',
  failed: 'bg-danger-soft border-danger-border text-danger-ink dark:bg-danger-dark-soft dark:border-line-dark dark:text-danger-bright',
};

const ACTION_BUTTON_CLASS =
  'h-8 px-3 rounded-lg border border-line bg-surface text-ink text-xs font-bold dark:border-line-dark dark:bg-surface-dark-2 dark:text-ink-dark';

let dismissTimer: number | undefined;

export function dismissReportNotice(): void {
  if (dismissTimer !== undefined) window.clearTimeout(dismissTimer);
  dismissTimer = undefined;
  const existing = document.getElementById(NOTICE_ID);
  if (existing) existing.remove();
}

function addAction(row: HTMLElement, label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = ACTION_BUTTON_CLASS;
  button.textContent = label;
  button.addEventListener('click', onClick);
  row.appendChild(button);
  return button;
}

/** 'printed' needs no message (the print dialog is the feedback) and 'busy' is a double click that is ignored. */
export function announceReportOutcome(outcome: ReportOutcome, onRetry?: () => void): void {
  if (typeof document === 'undefined') return;
  if (outcome.status === 'printed' || outcome.status === 'busy') return;

  dismissReportNotice();

  const tone = outcome.status === 'saved' ? 'saved' : outcome.status === 'empty' ? 'empty' : 'failed';
  const box = document.createElement('div');
  box.id = NOTICE_ID;
  box.setAttribute('role', tone === 'failed' ? 'alert' : 'status');
  box.setAttribute('data-no-print', '');
  box.className =
    'no-print fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] w-[min(36rem,92vw)] rounded-xl border px-4 py-3 shadow-card text-xs font-bold leading-6 ' +
    TONE_CLASS[tone];

  const text = document.createElement('div');
  text.textContent = outcome.message;
  box.appendChild(text);

  if (outcome.saved) {
    const fileLine = document.createElement('div');
    fileLine.className = 'text-micro font-normal break-all mt-1';
    fileLine.appendChild(document.createTextNode('اسم الملف: '));
    // Arabic name + digits + Latin extension: isolate it as one left-to-right run so the order stays readable
    const fileName = document.createElement('bdi');
    fileName.dir = 'ltr';
    fileName.textContent = outcome.saved.fileName;
    fileLine.appendChild(fileName);
    box.appendChild(fileLine);

    const folderLine = document.createElement('div');
    folderLine.className = 'font-mono text-micro font-normal break-all';
    folderLine.dir = 'ltr';
    folderLine.textContent = outcome.saved.folder;
    box.appendChild(folderLine);
  }

  const actions = document.createElement('div');
  actions.className = 'flex flex-wrap items-center gap-2 mt-2';
  const feedback = document.createElement('span');
  feedback.className = 'text-micro font-normal';

  if (outcome.saved) {
    addAction(actions, 'فتح المجلد', () => {
      feedback.textContent = '';
      invoke('report:openFolder').catch((err: unknown) => {
        feedback.textContent = describeError(err);
      });
    });
  }
  if (outcome.status === 'failed' && onRetry) {
    addAction(actions, 'إعادة المحاولة', () => {
      dismissReportNotice();
      onRetry();
    });
  }
  addAction(actions, 'إغلاق', dismissReportNotice);
  actions.appendChild(feedback);
  box.appendChild(actions);

  document.body.appendChild(box);

  if (outcome.status !== 'failed') {
    dismissTimer = window.setTimeout(dismissReportNotice, outcome.status === 'saved' ? SAVED_VISIBLE_MS : EMPTY_VISIBLE_MS);
  }
}

/** The whole report-button action: print or save, then tell the user what happened (retry is offered on failure). */
export async function printWithNotice(options: PrintReportOptions, request: ReportOutputRequest): Promise<ReportOutcome> {
  const outcome = await outputReport(options, request);
  announceReportOutcome(outcome, () => {
    void printWithNotice(options, request);
  });
  return outcome;
}

/** Fallback for a receipt the printer could not print: saves the same receipt image the printer would get and says where it is. */
export async function saveReceiptImageWithNotice(saleId: string | undefined, invoiceNumber: number | string): Promise<void> {
  if (!saleId) {
    announceReportOutcome({ status: 'failed', message: 'تعذر حفظ الإيصال كصورة: الفاتورة غير محفوظة بعد.' });
    return;
  }
  try {
    const saved = await invoke<{ path: string; folder: string; fileName: string }>('printer:saveReceiptImage', { saleId });
    announceReportOutcome({
      status: 'saved',
      message: `تم حفظ إيصال الفاتورة #${invoiceNumber} كصورة PNG`,
      saved: { path: saved.path, folder: saved.folder, fileName: saved.fileName, format: 'png' },
    });
  } catch (err) {
    announceReportOutcome({ status: 'failed', message: 'تعذر حفظ الإيصال كصورة: ' + describeError(err) });
  }
}
