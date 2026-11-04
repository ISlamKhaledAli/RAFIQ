import test from 'node:test';
import assert from 'node:assert/strict';
import {
  A4_ONLY_HINT,
  PRINT_STYLE_ID,
  PRINT_TARGET_ATTR,
  ROLL_PAGE_HEIGHT_MM,
  buildPageSizeCss,
  invalidateReportPaperCache,
  getConfiguredReportPaper,
  setReportSettingsLoader,
  isRollPaper,
  normalizeReportPaper,
  pickRollPaper,
  printReport,
  resolvePrintMode,
} from '../src/utils/printReport.ts';

/**
 * Report printing (Phase 1): the page size must follow the report kind and the saved report_paper_size.
 * Pure helpers are tested directly; printReport() runs against a tiny fake window/document.
 */

function createFakeDom() {
  const windowListeners = {};
  const timers = [];
  const appended = [];
  const styles = {};
  const markedRoots = [{ attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; } },
                       { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; } }];
  const state = { printCalls: 0, cssAtPrint: null, paperAtPrint: null, targetsAtPrint: 0 };

  const documentElement = { dataset: {} };
  const fakeWindow = {
    addEventListener(name, fn) { (windowListeners[name] = windowListeners[name] || []).push(fn); },
    removeEventListener(name, fn) { windowListeners[name] = (windowListeners[name] || []).filter((f) => f !== fn); },
    setTimeout(fn, ms) { timers.push({ fn, ms }); return timers.length; },
    clearTimeout() {},
    print() {
      state.printCalls += 1;
      state.cssAtPrint = styles[PRINT_STYLE_ID] ? styles[PRINT_STYLE_ID].textContent : null;
      state.paperAtPrint = documentElement.dataset.printPaper;
      state.targetsAtPrint = markedRoots.filter((r) => PRINT_TARGET_ATTR in r.attrs).length;
    },
  };
  const makeEl = (tag) => ({
    tag, id: '', className: '', textContent: '', attrs: {},
    setAttribute(k, v) { this.attrs[k] = v; },
    remove() { if (this.id) delete styles[this.id]; this.removed = true; },
  });
  const fakeDocument = {
    documentElement,
    head: { appendChild(el) { if (el.id) styles[el.id] = el; } },
    body: { appendChild(el) { appended.push(el); } },
    getElementById(id) { return styles[id] || null; },
    createElement: makeEl,
    querySelectorAll(selector) {
      const list = selector === '[data-print-root]'
        ? markedRoots
        : markedRoots.filter((r) => PRINT_TARGET_ATTR in r.attrs);
      list.item = (i) => list[i] || null;
      return list;
    },
  };

  return {
    install() {
      globalThis.window = fakeWindow;
      globalThis.document = fakeDocument;
    },
    uninstall() {
      delete globalThis.window;
      delete globalThis.document;
    },
    fire(name) { (windowListeners[name] || []).slice().forEach((fn) => fn({})); },
    runTimers() { timers.splice(0).forEach((t) => t.fn()); },
    styles, appended, state, documentElement, markedRoots, timers,
  };
}

test('normalizeReportPaper accepts known sizes and defaults to a4', () => {
  assert.equal(normalizeReportPaper('80mm'), '80mm');
  assert.equal(normalizeReportPaper('58mm'), '58mm');
  assert.equal(normalizeReportPaper('57mm'), '58mm');
  assert.equal(normalizeReportPaper(' A4 '), 'a4');
  assert.equal(normalizeReportPaper(''), 'a4');
  assert.equal(normalizeReportPaper(undefined), 'a4');
  assert.equal(normalizeReportPaper(null), 'a4');
  assert.equal(normalizeReportPaper('letter'), 'a4');
  assert.equal(normalizeReportPaper(80), 'a4');
});

test('resolvePrintMode: a4only always prints A4 and flags a downgrade only for roll settings', () => {
  assert.deepEqual(resolvePrintMode('a4only', 'a4'), { paper: 'a4', downgraded: false });
  assert.deepEqual(resolvePrintMode('a4only', '80mm'), { paper: 'a4', downgraded: true });
  assert.deepEqual(resolvePrintMode('a4only', '58mm', '58mm'), { paper: 'a4', downgraded: true });
});

test('resolvePrintMode: compact follows the explicit paper, then the saved setting', () => {
  assert.deepEqual(resolvePrintMode('compact', '80mm'), { paper: '80mm', downgraded: false });
  assert.deepEqual(resolvePrintMode('compact', '58mm'), { paper: '58mm', downgraded: false });
  assert.deepEqual(resolvePrintMode('compact', 'a4'), { paper: 'a4', downgraded: false });
  assert.deepEqual(resolvePrintMode('compact', 'a4', '58mm'), { paper: '58mm', downgraded: false });
});

test('buildPageSizeCss: A4 uses 10mm margins and honours orientation', () => {
  assert.equal(buildPageSizeCss('a4'), '@page { size: A4 portrait; margin: 10mm; }');
  assert.equal(buildPageSizeCss('a4', 'landscape'), '@page { size: A4 landscape; margin: 10mm; }');
});

test('buildPageSizeCss: rolls use a fixed height (Chromium 109 rejects "80mm auto") and 2mm margins', () => {
  assert.equal(buildPageSizeCss('80mm'), `@page { size: 80mm ${ROLL_PAGE_HEIGHT_MM}mm; margin: 2mm; }`);
  assert.equal(buildPageSizeCss('58mm'), `@page { size: 58mm ${ROLL_PAGE_HEIGHT_MM}mm; margin: 2mm; }`);
  assert.ok(!buildPageSizeCss('80mm').includes('auto'));
  // orientation never rotates a roll
  assert.equal(buildPageSizeCss('80mm', 'landscape'), buildPageSizeCss('80mm', 'portrait'));
});

test('roll helpers', () => {
  assert.equal(isRollPaper('a4'), false);
  assert.equal(isRollPaper('80mm'), true);
  assert.equal(pickRollPaper('a4'), '80mm');
  assert.equal(pickRollPaper('58mm'), '58mm');
  assert.equal(pickRollPaper('80mm'), '80mm');
});

test('printReport compact: injects @page, marks the last print root, prints, cleans up on afterprint', async () => {
  const dom = createFakeDom();
  dom.install();
  try {
    await printReport({ kind: 'compact', paper: '58mm' });
    assert.equal(dom.state.printCalls, 1);
    assert.equal(dom.state.cssAtPrint, buildPageSizeCss('58mm'));
    assert.equal(dom.state.paperAtPrint, '58mm');
    assert.equal(dom.state.targetsAtPrint, 1);
    assert.ok(PRINT_TARGET_ATTR in dom.markedRoots[1].attrs, 'last root is the print target');
    assert.ok(!(PRINT_TARGET_ATTR in dom.markedRoots[0].attrs));

    dom.fire('afterprint');
    assert.equal(dom.styles[PRINT_STYLE_ID], undefined);
    assert.equal(dom.documentElement.dataset.printPaper, undefined);
    assert.equal(dom.markedRoots.filter((r) => PRINT_TARGET_ATTR in r.attrs).length, 0);
  } finally {
    dom.uninstall();
  }
});

test('printReport: second call reuses the single style element and a new call cleans up the previous one', async () => {
  const dom = createFakeDom();
  dom.install();
  try {
    await printReport({ kind: 'compact', paper: 'a4', orientation: 'landscape' });
    assert.equal(dom.state.cssAtPrint, buildPageSizeCss('a4', 'landscape'));
    await printReport({ kind: 'compact', paper: '80mm' });
    assert.equal(dom.state.cssAtPrint, buildPageSizeCss('80mm'));
    assert.equal(Object.keys(dom.styles).length, 1);
  } finally {
    dom.uninstall();
  }
});

test('printReport: the safety timeout removes the page style when afterprint never fires', async () => {
  const dom = createFakeDom();
  dom.install();
  try {
    await printReport({ kind: 'compact', paper: '80mm' });
    assert.ok(dom.styles[PRINT_STYLE_ID]);
    dom.runTimers();
    assert.equal(dom.styles[PRINT_STYLE_ID], undefined);
  } finally {
    dom.uninstall();
  }
});

test('printReport a4only with a roll setting prints A4 and shows the Arabic hint before printing', async () => {
  const dom = createFakeDom();
  dom.install();
  setReportSettingsLoader(async () => ({ report_paper_size: '80mm' }));
  try {
    const pending = printReport({ kind: 'a4only' });
    // The hint delays printing so it can paint
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    dom.timers.filter((t) => t.ms <= 1000).forEach((t) => t.fn());
    await pending;
    assert.equal(dom.state.printCalls, 1);
    assert.equal(dom.state.cssAtPrint, buildPageSizeCss('a4'));
    assert.equal(dom.appended.length, 1);
    assert.equal(dom.appended[0].textContent, A4_ONLY_HINT);
    assert.ok(A4_ONLY_HINT.includes('A4'));
  } finally {
    setReportSettingsLoader(null);
    dom.uninstall();
  }
});

test('printReport a4only with an A4 setting prints without a hint', async () => {
  const dom = createFakeDom();
  dom.install();
  setReportSettingsLoader(async () => ({}));
  try {
    await printReport({ kind: 'a4only', orientation: 'landscape' });
    assert.equal(dom.state.cssAtPrint, buildPageSizeCss('a4', 'landscape'));
    assert.equal(dom.appended.length, 0);
  } finally {
    setReportSettingsLoader(null);
    dom.uninstall();
  }
});

test('getConfiguredReportPaper caches the setting until invalidated and falls back to A4 on errors', async () => {
  let calls = 0;
  let value = '58mm';
  setReportSettingsLoader(async () => { calls += 1; return { report_paper_size: value }; });
  try {
    assert.equal(await getConfiguredReportPaper(), '58mm');
    value = '80mm';
    assert.equal(await getConfiguredReportPaper(), '58mm');
    assert.equal(calls, 1);
    invalidateReportPaperCache();
    assert.equal(await getConfiguredReportPaper(), '80mm');
    assert.equal(calls, 2);

    setReportSettingsLoader(async () => { throw new Error('bridge down'); });
    const originalWarn = console.warn;
    console.warn = () => {};
    try {
      assert.equal(await getConfiguredReportPaper(), 'a4');
    } finally {
      console.warn = originalWarn;
    }
  } finally {
    setReportSettingsLoader(null);
  }
});
