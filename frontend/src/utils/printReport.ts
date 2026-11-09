// Shared report printing: picks the page size (A4 / 80mm / 58mm), injects the matching @page rule,
// calls window.print() and cleans up afterwards. outputReport() adds the save fallback (PDF, then HTML)
// when there is no printer or printing fails. Pure helpers are exported for node tests; DOM and
// IPC are only touched inside the print/save functions so this module is safe to import without a browser.

export type ReportPaper = 'a4' | '80mm' | '58mm';
export type PrintKind = 'a4only' | 'compact';
export type PrintOrientation = 'portrait' | 'landscape';

export interface PrintReportOptions {
  kind: PrintKind;
  orientation?: PrintOrientation;
  paper?: ReportPaper;
}

export interface ResolvedPrintMode {
  paper: ReportPaper;
  // true when the saved setting is a roll size but the report can only be printed on A4
  downgraded: boolean;
}

export const REPORT_PAPER_SETTING_KEY = 'report_paper_size';
export const PRINT_STYLE_ID = 'print-page-size';
export const PRINT_TARGET_ATTR = 'data-print-target';
export const PRINT_ANCESTOR_ATTR = 'data-print-ancestor';
export const PRINTING_BODY_ATTR = 'data-printing';
export const A4_ONLY_HINT = 'هذا التقرير يُطبع على ورق A4 فقط - اختر طابعة A4 من نافذة الطباعة';

// Chromium 109 only accepts `auto` as the sole value of `size`, so rolls get a fixed page height
export const ROLL_PAGE_HEIGHT_MM = 297;
export const A4_MARGIN_MM = 10;
export const ROLL_MARGIN_MM = 2;

const ROLL_WIDTH_MM: Record<'80mm' | '58mm', number> = { '80mm': 80, '58mm': 58 };

export function normalizeReportPaper(raw: unknown): ReportPaper {
  if (typeof raw !== 'string') return 'a4';
  const value = raw.trim().toLowerCase();
  if (value === '80mm' || value === '80') return '80mm';
  if (value === '58mm' || value === '58' || value === '57mm' || value === '57') return '58mm';
  return 'a4';
}

export function isRollPaper(paper: ReportPaper): boolean {
  return paper !== 'a4';
}

/** Cashier-printer layouts need a roll width; an A4 setting falls back to 80mm. */
export function pickRollPaper(configured: ReportPaper): '80mm' | '58mm' {
  return configured === '58mm' ? '58mm' : '80mm';
}

/** a4only reports always print on A4; compact reports follow the explicit choice, then the saved setting. */
export function resolvePrintMode(
  kind: PrintKind,
  configured: ReportPaper,
  explicit?: ReportPaper
): ResolvedPrintMode {
  if (kind === 'a4only') {
    return { paper: 'a4', downgraded: isRollPaper(configured) };
  }
  return { paper: explicit ?? configured, downgraded: false };
}

export function buildPageSizeCss(paper: ReportPaper, orientation: PrintOrientation = 'portrait'): string {
  if (paper === 'a4') {
    return `@page { size: A4 ${orientation}; margin: ${A4_MARGIN_MM}mm; }`;
  }
  return `@page { size: ${ROLL_WIDTH_MM[paper]}mm ${ROLL_PAGE_HEIGHT_MM}mm; margin: ${ROLL_MARGIN_MM}mm; }`;
}

// ---------------------------------------------------------------------------
// Settings cache (report_paper_size)
// ---------------------------------------------------------------------------

let cachedPaper: ReportPaper | null = null;
let listenerAttached = false;

/** Drop the cached setting so the next print re-reads settings:getAll (call after saving printer settings). */
export function invalidateReportPaperCache(): void {
  cachedPaper = null;
}

function attachSettingsListener(): void {
  if (listenerAttached || typeof window === 'undefined') return;
  listenerAttached = true;
  window.addEventListener('rafiq:data-changed', (event: Event) => {
    const detail = (event as CustomEvent<{ topics?: string[] }>).detail;
    const topics = detail && Array.isArray(detail.topics) ? detail.topics : [];
    if (topics.indexOf('settings') >= 0 || topics.indexOf('all') >= 0) invalidateReportPaperCache();
  });
}

type SettingsLoader = () => Promise<Record<string, string>>;

const defaultSettingsLoader: SettingsLoader = async () => {
  const { invoke } = await import('../bridge/ipc.ts');
  return invoke<Record<string, string>>('settings:getAll');
};

let settingsLoader: SettingsLoader = defaultSettingsLoader;

/** Test seam: replace how settings are read (pass null to restore the IPC loader). */
export function setReportSettingsLoader(loader: SettingsLoader | null): void {
  settingsLoader = loader ?? defaultSettingsLoader;
  cachedPaper = null;
}

export async function getConfiguredReportPaper(): Promise<ReportPaper> {
  attachSettingsListener();
  if (cachedPaper) return cachedPaper;
  try {
    const settings = await settingsLoader();
    cachedPaper = normalizeReportPaper(settings ? settings[REPORT_PAPER_SETTING_KEY] : undefined);
  } catch (err) {
    // Settings unreadable: print as A4 without caching so the next attempt retries
    console.warn('تعذر قراءة مقاس ورق التقارير، سيتم استخدام A4', err);
    return 'a4';
  }
  return cachedPaper;
}

// ---------------------------------------------------------------------------
// DOM side (browser only)
// ---------------------------------------------------------------------------

const CLEANUP_TIMEOUT_MS = 5 * 60 * 1000;
const HINT_VISIBLE_MS = 5000;
const HINT_PAINT_DELAY_MS = 600;

let activeCleanup: (() => void) | null = null;

function showA4OnlyHint(): HTMLElement {
  const hint = document.createElement('div');
  hint.setAttribute('role', 'status');
  hint.setAttribute('data-no-print', '');
  hint.className =
    'no-print fixed top-4 left-1/2 -translate-x-1/2 z-[100] px-5 py-2.5 rounded-xl border font-bold text-xs shadow-md bg-warn-soft border-warn-border text-warn dark:bg-surface-dark-2 dark:border-line-dark dark:text-ink-dark';
  hint.textContent = A4_ONLY_HINT;
  document.body.appendChild(hint);
  window.setTimeout(() => hint.remove(), HINT_VISIBLE_MS);
  return hint;
}

function markPrintTarget(): void {
  clearPrintTarget();
  // Modals and portals render after the page content, so the last marked root is the one on top
  const roots = document.querySelectorAll('[data-print-root]');
  const target = roots.item(roots.length - 1) as HTMLElement | null;
  if (!target) return;

  target.setAttribute(PRINT_TARGET_ATTR, '');
  if (document.body && typeof document.body.setAttribute === 'function') {
    document.body.setAttribute(PRINTING_BODY_ATTR, '');
  }

  // Walk up ancestors and mark them so CSS does not need expensive :has() queries in Chromium 109
  let current: HTMLElement | null = target.parentElement || null;
  while (current && current !== document.body) {
    if (typeof current.setAttribute === 'function') {
      current.setAttribute(PRINT_ANCESTOR_ATTR, '');
    }
    current = current.parentElement || null;
  }
}

function clearPrintTarget(): void {
  if (document.body && typeof document.body.removeAttribute === 'function') {
    document.body.removeAttribute(PRINTING_BODY_ATTR);
  }
  const markedTargets = document.querySelectorAll('[' + PRINT_TARGET_ATTR + ']');
  for (let i = 0; i < markedTargets.length; i++) markedTargets[i].removeAttribute(PRINT_TARGET_ATTR);

  const markedAncestors = document.querySelectorAll('[' + PRINT_ANCESTOR_ATTR + ']');
  for (let i = 0; i < markedAncestors.length; i++) markedAncestors[i].removeAttribute(PRINT_ANCESTOR_ATTR);
}

function applyPageStyle(paper: ReportPaper, orientation: PrintOrientation): void {
  let style = document.getElementById(PRINT_STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = PRINT_STYLE_ID;
    document.head.appendChild(style);
  }
  style.textContent = buildPageSizeCss(paper, orientation);
  document.documentElement.dataset.printPaper = paper;
  document.documentElement.dataset.printOrientation = orientation;
  markPrintTarget();
}

function clearPageStyle(): void {
  const style = document.getElementById(PRINT_STYLE_ID);
  if (style) style.remove();
  delete document.documentElement.dataset.printPaper;
  delete document.documentElement.dataset.printOrientation;
  clearPrintTarget();
}

interface PrintLayout {
  paper: ReportPaper;
  orientation: PrintOrientation;
  release: () => void;
}

/** Marks the report root and injects the @page rule; release() undoes both (also runs on afterprint or after a long timeout). */
async function enterPrintLayout(options: PrintReportOptions, showHint: boolean): Promise<PrintLayout> {
  const configured = options.kind === 'compact' && options.paper ? options.paper : await getConfiguredReportPaper();
  const mode = resolvePrintMode(options.kind, configured, options.paper);
  const orientation: PrintOrientation = mode.paper === 'a4' ? options.orientation ?? 'portrait' : 'portrait';

  if (mode.downgraded && showHint) {
    const hint = showA4OnlyHint();
    // Let the browser paint the hint before the print dialog opens
    await new Promise<void>((resolve) => window.setTimeout(resolve, HINT_PAINT_DELAY_MS));
    window.addEventListener('beforeprint', () => hint.remove(), { once: true });
  }

  if (activeCleanup) activeCleanup();

  let timer: number | undefined;
  const cleanup = () => {
    window.removeEventListener('afterprint', cleanup);
    if (timer !== undefined) window.clearTimeout(timer);
    clearPageStyle();
    if (activeCleanup === cleanup) activeCleanup = null;
  };
  activeCleanup = cleanup;
  window.addEventListener('afterprint', cleanup);
  // The preview may re-layout while open, so only fall back to a timeout long after the dialog is gone
  timer = window.setTimeout(cleanup, CLEANUP_TIMEOUT_MS);

  applyPageStyle(mode.paper, orientation);
  return { paper: mode.paper, orientation, release: cleanup };
}

function isWebViewHost(): boolean {
  return typeof window !== 'undefined' && Boolean((window as unknown as { chrome?: { webview?: unknown } }).chrome?.webview);
}

async function hostInvoke<T>(action: string, payload?: unknown, timeoutMs?: number): Promise<T> {
  const { invoke } = await import('../bridge/ipc');
  return invoke<T>(action, payload, timeoutMs);
}

/** Opens the system print UI; throws when neither the host dialog nor window.print() could be opened. */
async function openPrintUi(): Promise<void> {
  // In desktop WebView2 host: trigger safe non-blocking native print UI to prevent UI thread lockup
  if (isWebViewHost()) {
    try {
      const res = await hostInvoke<{ triggered?: boolean }>('system:showPrintDialog', { kind: 'browser' });
      if (res && res.triggered) {
        return;
      }
    } catch (ipcErr) {
      console.warn('تعذر استدعاء طباعة النظام عبر IPC، سيتم استخدام window.print() كبديل', ipcErr);
    }
  }

  window.print();
}

export async function printReport(options: PrintReportOptions): Promise<void> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const layout = await enterPrintLayout(options, true);
  try {
    await openPrintUi();
  } catch (err) {
    layout.release();
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Report output: print, and when printing is impossible or fails, SAVE the same report as a file
// ---------------------------------------------------------------------------

export interface PrinterStatus {
  hasPrinter: boolean;
  printerCount?: number;
  defaultPrinter?: string;
  configuredPrinter?: string;
  configuredFound?: boolean;
}

export interface SavedReport {
  path: string;
  folder: string;
  fileName: string;
  format: 'pdf' | 'html' | 'png';
}

export type ReportOutputStatus = 'printed' | 'saved' | 'empty' | 'failed' | 'busy';

export interface ReportOutcome {
  status: ReportOutputStatus;
  message: string;
  saved?: SavedReport;
}

export interface ReportOutputRequest {
  reportName: string;
  /** false means there is nothing to print: the report is not printed or saved silently */
  hasData?: boolean;
}

export interface ReportOutputHost {
  /** null/undefined when the status could not be read: printing is then attempted anyway */
  getPrinterStatus(): Promise<PrinterStatus | null | undefined>;
  print(): Promise<void>;
  savePdf(reportName: string): Promise<SavedReport>;
  saveHtml(reportName: string): Promise<SavedReport>;
}

export const EMPTY_REPORT_MESSAGE = 'لا توجد بيانات في هذا التقرير لطباعتها أو حفظها';
export const REPORT_BUSY_MESSAGE = 'جاري تجهيز التقرير، انتظر لحظة';
export const NO_PRINTER_REASON = 'لا توجد طابعة متاحة على هذا الجهاز';
const UNKNOWN_ERROR_MESSAGE = 'خطأ غير معروف';
const DEFAULT_COOLDOWN_MS = 1200;

export function describeError(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string' && err.trim()) return err;
  return UNKNOWN_ERROR_MESSAGE;
}

function formatLabel(format: SavedReport['format']): string {
  if (format === 'png') return 'كصورة PNG';
  return format === 'pdf' ? 'كملف PDF' : 'كملف HTML يُفتح بالمتصفح';
}

/**
 * Print-or-save flow: 1) nothing to print -> say so, 2) no real printer -> save, 3) try the printer UI,
 * 4) any failure -> save as PDF, then as a standalone HTML file, 5) only when both fail the Arabic errors are surfaced.
 */
export async function runReportOutput(host: ReportOutputHost, request: ReportOutputRequest): Promise<ReportOutcome> {
  if (request.hasData === false) {
    return { status: 'empty', message: EMPTY_REPORT_MESSAGE };
  }

  let printerStatus: PrinterStatus | null | undefined = null;
  try {
    printerStatus = await host.getPrinterStatus();
  } catch (statusErr) {
    console.warn('تعذر قراءة حالة الطابعات، ستتم محاولة الطباعة مباشرة', statusErr);
  }

  let reason: string;
  if (printerStatus && printerStatus.hasPrinter === false) {
    reason = NO_PRINTER_REASON;
  } else {
    try {
      await host.print();
      return { status: 'printed', message: 'تم فتح نافذة الطباعة' };
    } catch (printErr) {
      reason = 'تعذرت الطباعة: ' + describeError(printErr);
    }
  }

  let pdfError = '';
  try {
    const saved = await host.savePdf(request.reportName);
    return { status: 'saved', saved, message: `${reason}، فتم حفظ "${request.reportName}" ${formatLabel(saved.format)}` };
  } catch (pdfErr) {
    pdfError = describeError(pdfErr);
  }

  try {
    const saved = await host.saveHtml(request.reportName);
    return { status: 'saved', saved, message: `${reason}، فتم حفظ "${request.reportName}" ${formatLabel(saved.format)}` };
  } catch (htmlErr) {
    return {
      status: 'failed',
      message: `${reason}. وتعذر حفظ التقرير كملف PDF (${pdfError}) أو كملف HTML (${describeError(htmlErr)}). التقرير ما زال معروضاً على الشاشة.`,
    };
  }
}

export interface ReportOutputController {
  run(options: PrintReportOptions, request: ReportOutputRequest): Promise<ReportOutcome>;
  isBusy(): boolean;
}

/** Single-flight wrapper: a second click while a report is being prepared (and shortly after) is ignored. */
export function createReportOutput(
  buildHost: (options: PrintReportOptions) => ReportOutputHost,
  cooldownMs: number = DEFAULT_COOLDOWN_MS
): ReportOutputController {
  let busy = false;
  return {
    isBusy: () => busy,
    async run(options, request) {
      if (busy) return { status: 'busy', message: REPORT_BUSY_MESSAGE };
      busy = true;
      try {
        return await runReportOutput(buildHost(options), request);
      } finally {
        if (cooldownMs > 0 && typeof setTimeout === 'function') {
          setTimeout(() => {
            busy = false;
          }, cooldownMs);
        } else {
          busy = false;
        }
      }
    },
  };
}

interface HostSavedFile {
  path: string;
  folder: string;
  fileName: string;
}

function toSavedReport(res: HostSavedFile | null | undefined, format: SavedReport['format']): SavedReport {
  if (!res || !res.path) throw new Error('لم يرجع النظام مسار الملف المحفوظ');
  return { path: res.path, folder: res.folder, fileName: res.fileName, format };
}

const PDF_SAVE_TIMEOUT_MS = 90000;
const LAYOUT_SETTLE_MS = 60;

function collectStyleText(): string {
  const chunks: string[] = [];
  for (let i = 0; i < document.styleSheets.length; i++) {
    try {
      const rules = document.styleSheets[i].cssRules;
      for (let j = 0; j < rules.length; j++) chunks.push(rules[j].cssText);
    } catch {
      // A stylesheet from another origin cannot be read: the bundled app sheets are enough
    }
  }
  return chunks.join('\n').replace(/<\/style/gi, '<\\/style');
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** One self-contained HTML document of the marked report root: opens in any browser and prints with the same print rules. */
export function buildStandaloneReportHtml(reportName: string, bodyHtml: string, css: string, paper: ReportPaper, orientation: PrintOrientation): string {
  const screenCss =
    '@media screen{body{background:#fff;color:#000;margin:0;padding:16px}' +
    '[data-print-target]{position:static!important;inset:auto!important;width:100%!important;max-width:none!important;height:auto!important;max-height:none!important;box-shadow:none!important;transform:none!important;animation:none!important;overflow:visible!important;background:#fff!important;color:#000!important}' +
    '[data-print-target] *{color:#000!important}[data-print-target] [class*="overflow-"],[data-print-target] [class*="max-h-"]{overflow:visible!important;max-height:none!important}' +
    'button,.no-print,[data-no-print]{display:none!important}}';
  return (
    '<!DOCTYPE html><html lang="ar" dir="rtl" data-print-paper="' + paper + '"><head><meta charset="utf-8">' +
    '<title>' + escapeHtml(reportName) + '</title>' +
    '<style>' + css + '</style><style>' + buildPageSizeCss(paper, orientation) + screenCss + '</style></head>' +
    '<body data-printing>' + bodyHtml + '</body></html>'
  );
}

function createBrowserHost(options: PrintReportOptions): ReportOutputHost {
  return {
    getPrinterStatus: () => hostInvoke<PrinterStatus>('report:getPrinterStatus'),
    print: () => printReport(options),
    async savePdf(reportName) {
      const layout = await enterPrintLayout(options, false);
      try {
        // Give the print attributes a moment to apply before the host renders the page
        await new Promise<void>((resolve) => window.setTimeout(resolve, LAYOUT_SETTLE_MS));
        const res = await hostInvoke<HostSavedFile>(
          'report:savePdf',
          { reportName, landscape: layout.orientation === 'landscape' },
          PDF_SAVE_TIMEOUT_MS
        );
        return toSavedReport(res, 'pdf');
      } finally {
        layout.release();
      }
    },
    async saveHtml(reportName) {
      const layout = await enterPrintLayout(options, false);
      try {
        const target = document.querySelector('[' + PRINT_TARGET_ATTR + ']');
        if (!target) throw new Error('لا يوجد تقرير معروض لحفظه');
        const clone = target.cloneNode(true) as HTMLElement;
        const html = buildStandaloneReportHtml(reportName, clone.outerHTML, collectStyleText(), layout.paper, layout.orientation);
        const res = await hostInvoke<HostSavedFile>('report:saveFile', { reportName, extension: 'html', content: html }, PDF_SAVE_TIMEOUT_MS);
        return toSavedReport(res, 'html');
      } finally {
        layout.release();
      }
    },
  };
}

const browserReportOutput = createReportOutput(createBrowserHost);

/** Prints the report that is on screen, or saves it as a file when printing is not possible. */
export function outputReport(options: PrintReportOptions, request: ReportOutputRequest): Promise<ReportOutcome> {
  return browserReportOutput.run(options, request);
}

/** For 'كاشير / A4' toggles: thermal follows the saved roll width, a4 always prints A4. */
export async function printCompactReport(mode: 'thermal' | 'a4'): Promise<void> {
  if (mode === 'a4') {
    await printReport({ kind: 'compact', paper: 'a4' });
    return;
  }
  await printReport({ kind: 'compact', paper: pickRollPaper(await getConfiguredReportPaper()) });
}
