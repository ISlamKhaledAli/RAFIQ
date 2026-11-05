// Shared report printing: picks the page size (A4 / 80mm / 58mm), injects the matching @page rule,
// calls window.print() and cleans up afterwards. Pure helpers are exported for node tests; DOM and
// IPC are only touched inside printReport() so this module is safe to import without a browser.

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
  const target = roots.item(roots.length - 1);
  if (target) target.setAttribute(PRINT_TARGET_ATTR, '');
}

function clearPrintTarget(): void {
  const marked = document.querySelectorAll('[' + PRINT_TARGET_ATTR + ']');
  for (let i = 0; i < marked.length; i++) marked[i].removeAttribute(PRINT_TARGET_ATTR);
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

export async function printReport(options: PrintReportOptions): Promise<void> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const configured = options.kind === 'compact' && options.paper ? options.paper : await getConfiguredReportPaper();
  const mode = resolvePrintMode(options.kind, configured, options.paper);
  const orientation: PrintOrientation = mode.paper === 'a4' ? options.orientation ?? 'portrait' : 'portrait';

  if (mode.downgraded) {
    const hint = showA4OnlyHint();
    // Let the browser paint the hint before the (blocking) print dialog opens
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
  try {
    window.print();
  } catch (err) {
    cleanup();
    throw err;
  }
}

/** For 'كاشير / A4' toggles: thermal follows the saved roll width, a4 always prints A4. */
export async function printCompactReport(mode: 'thermal' | 'a4'): Promise<void> {
  if (mode === 'a4') {
    await printReport({ kind: 'compact', paper: 'a4' });
    return;
  }
  await printReport({ kind: 'compact', paper: pickRollPaper(await getConfiguredReportPaper()) });
}
