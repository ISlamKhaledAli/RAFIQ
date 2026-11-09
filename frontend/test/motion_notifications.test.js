import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { exitDurationMs } from '../src/utils/motionExit.ts';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const css = read('src/index.css');
const guard = '@media screen and (prefers-reduced-motion: no-preference) {';
const motionCss = css.slice(css.indexOf(guard));
const hook = read('src/hooks/useExitTransition.ts');
const center = read('src/components/NotificationCenter.tsx');
const undo = read('src/components/UndoToast.tsx');

describe('exit duration rule', () => {
  it('is zero whenever motion is off, reduced or the tab is hidden: the element unmounts in the same render', () => {
    assert.equal(exitDurationMs('240ms', false, false, false), 0);
    assert.equal(exitDurationMs('240ms', true, true, false), 0);
    assert.equal(exitDurationMs('240ms', true, false, true), 0);
  });

  it('follows the shared duration variable and never exceeds 400ms', () => {
    assert.equal(exitDurationMs('240ms', true, false, false), 240);
    assert.equal(exitDurationMs('0.36s', true, false, false), 360);
    assert.equal(exitDurationMs('900ms', true, false, false), 400);
    assert.equal(exitDurationMs('', true, false, false), 240);
  });
});

describe('exit primitive (hooks/useExitTransition.ts)', () => {
  it('exposes the value, boolean and list flavours', () => {
    assert.match(hook, /export function useExitValue</);
    assert.match(hook, /export function useExitTransition\(/);
    assert.match(hook, /export function useExitList</);
  });

  it('reads the shared variable through the pure rule and checks motion, reduced motion and a hidden tab', () => {
    assert.match(hook, /getPropertyValue\('--rq-motion-duration'\)/);
    assert.match(hook, /exitDurationMs\(/);
    assert.match(hook, /getMotionSnapshot\(\)/);
    assert.match(hook, /prefers-reduced-motion: reduce/);
    assert.match(hook, /document\.hidden/);
    assert.doesNotMatch(hook, /setTimeout\([^)]*,\s*\d+\)/, 'no hard-coded delay');
  });

  it('the off path unmounts in the same render (no held value, no timer)', () => {
    assert.match(hook, /const exiting = live === null && held !== null && readExitMs\(\) > 0;/);
    assert.match(hook, /value: live \?\? \(exiting \? held : null\)/);
    assert.match(hook, /if \(ms <= 0\) \{\s*setHeld\(null\);\s*return undefined;/);
  });

  it('every timer is cleared: value, list and unmount paths', () => {
    assert.match(hook, /return \(\) => window\.clearTimeout\(timer\);/);
    assert.match(hook, /window\.clearTimeout\(timer\);\s*map\.delete\(id\);/);
    assert.match(hook, /map\.forEach\(\(timer\) => window\.clearTimeout\(timer\)\);\s*map\.clear\(\);/);
  });

  it('ghost rows keep their position among several removals', () => {
    assert.match(hook, /function mergeEntries</);
    assert.match(hook, /mergeEntries\(shown, ghosts\)/);
    assert.match(hook, /return mergeEntries\(items, ghosts\);/);
  });
});

describe('exit css (motion block)', () => {
  const exitRules = [
    ['motion-exit-fade', 'rq-fade-out'],
    ['motion-exit-toast', 'rq-toast-out'],
    ['motion-exit-toast-bottom', 'rq-toast-out-bottom'],
    ['motion-exit-popup', 'rq-popup-out'],
    ['motion-exit-modal-panel', 'rq-modal-panel-out'],
    ['motion-exit-collapse', 'rq-collapse-out'],
  ];

  it('lives inside the reduced-motion guard, scoped under html[data-motion="on"], and needs data-exiting', () => {
    assert.ok(css.includes(guard));
    for (const [cls, keyframes] of exitRules) {
      const m = new RegExp(`html\\[data-motion="on"\\] \\.${cls}\\[data-exiting\\] \\{([^}]*)\\}`).exec(motionCss);
      assert.ok(m, `${cls} rule exists inside the guard`);
      assert.match(m[1], new RegExp(`animation: ${keyframes} var\\(--rq-motion-duration, 240ms\\) ease-out forwards;`), cls);
      assert.ok(!css.slice(0, css.indexOf(guard)).includes(`.${cls}`), `${cls} must not exist outside the guard`);
    }
    assert.match(motionCss, /html\[data-motion="on"\] \[data-exiting\] \{\s*pointer-events: none;/);
  });

  it('only opacity / translate / scale are animated, except the documented row collapse', () => {
    for (const name of ['rq-fade-out', 'rq-toast-out', 'rq-toast-out-bottom', 'rq-popup-out', 'rq-modal-panel-out', 'rq-badge-pop-a', 'rq-badge-pop-b']) {
      const m = new RegExp(`@keyframes ${name} \\{([\\s\\S]*?)\\n  \\}`).exec(motionCss);
      assert.ok(m, name);
      const props = [...m[1].matchAll(/([a-z-]+):/g)].map((x) => x[1]).filter((p) => p !== 'from' && p !== 'to');
      for (const p of props) assert.ok(['opacity', 'translate', 'scale'].includes(p), `${name} animates ${p}`);
    }
    const collapse = /@keyframes rq-collapse-out \{([\s\S]*?)\n  \}/.exec(motionCss);
    assert.ok(collapse && collapse[1].includes('grid-template-rows'), 'row collapse glides grid rows');
  });

  it('the badge pop and the loading shell only exist with motion on', () => {
    assert.match(motionCss, /html\[data-motion="on"\] \[data-pop="a"\] \{\s*animation: rq-badge-pop-a var\(--rq-motion-duration, 240ms\) ease-out;/);
    assert.match(motionCss, /html\[data-motion="on"\] \[data-pop="b"\] \{\s*animation: rq-badge-pop-b var\(--rq-motion-duration, 240ms\) ease-out;/);
    assert.match(motionCss, /html\[data-motion="on"\] \.motion-loading-fill \{\s*min-height:/);
    assert.ok(!css.slice(0, css.indexOf(guard)).includes('data-pop'));
  });
});

describe('notification center', () => {
  it('the drawer fades its backdrop and slides its panel both ways, and keeps rows for their exit', () => {
    assert.match(center, /useExitTransition\(isDrawerOpen\)/);
    assert.match(center, /if \(!mounted\) return null;/);
    assert.match(center, /motion-modal-backdrop motion-exit-fade/);
    assert.match(center, /motion-exit-popup animate-in slide-in-from-top-2/);
    assert.match(center, /useExitList\(notifications, mounted\)/);
    assert.match(center, /motion-exit-collapse \[--rq-collapse-gap:0\.625rem\]/);
    assert.match(center, /inert=\{leaving \|\| undefined\}/);
  });

  it('the top bar keeps its last content while it collapses, and the bell badge pops only when the count goes up', () => {
    assert.match(center, /useExitValue\(notifications\.length > 0 && !isDismissed \? notifications : null\)/);
    assert.match(center, /className="motion-exit-collapse shrink-0"/);
    assert.match(center, /count > pop\.count/);
    assert.match(center, /data-pop=\{pop\.phase \?\? undefined\}/);
  });

  it('the dismiss logic is untouched: handlers still fire immediately', () => {
    assert.match(center, /onClick=\{item\.onDismiss\}/);
    assert.match(center, /onClick=\{onDismissTicker\}/);
  });
});

describe('toasts', () => {
  it('the undo toast stops its countdown and Ctrl+Z while it only plays its exit, and the cashier screen keeps it mounted', () => {
    assert.match(undo, /exiting\?: boolean;/);
    assert.match(undo, /if \(exiting\) return undefined;/);
    assert.match(undo, /\}, \[durationMs, message, exiting\]\);/);
    assert.match(undo, /motion-exit-toast-bottom fixed bottom-6 left-6/);
    assert.match(undo, /data-exiting=\{exiting \|\| undefined\}/);
    const pos = read('src/views/PosView.tsx');
    assert.match(pos, /const undoToast = useExitValue\(undoItem\);/);
    assert.match(pos, /\{undoToast\.value && \(\s*<UndoToast/);
    assert.match(pos, /exiting=\{undoToast\.exiting\}/);
    assert.match(pos, /onUndo=\{handleUndoRemove\}/);
  });

  it('the app refresh toast and the two purchases toasts use the same primitive', () => {
    const app = read('src/App.tsx');
    assert.match(app, /const refreshToast = useExitValue\(refreshToastMsg\);/);
    assert.match(app, /motion-exit-toast fixed top-14/);
    for (const file of ['src/views/PurchasesView.tsx', 'src/views/purchases/ShortagesTab.tsx']) {
      const src = read(file);
      assert.match(src, /const toast = useExitValue\(notification\);/, file);
      assert.match(src, /motion-toast motion-exit-toast fixed top-4/, file);
      assert.match(src, /data-exiting=\{toast\.exiting \|\| undefined\}/, file);
    }
  });
});

describe('daily closing button and dialog', () => {
  const dash = read('src/views/DashboardView.tsx');
  const closing = read('src/components/DailyClosingModal.tsx');

  it('the button label cross-fades with the day state through a keyed span (no logic change)', () => {
    assert.match(dash, /<span key=\{summary\?\.isDayClosed \? 'closed' : 'open'\} className="motion-swap-in">/);
    assert.match(dash, /canCloseDay && \(/);
    assert.match(dash, /variant=\{summary\?\.isDayClosed \? 'success' : 'primary'\}/);
  });

  it('the dialog gets the shared backdrop + panel entrance and exit, and the success screen keeps its own exit', () => {
    assert.match(closing, /useExitTransition\(isOpen\)/);
    assert.match(closing, /if \(!mounted\) return null;/);
    assert.match(closing, /motion-static motion-modal-backdrop motion-exit-fade fixed inset-0 z-50/);
    assert.match(closing, /motion-exit-modal-panel bg-surface[^"]*animate-in fade-in zoom-in-95/);
    assert.match(closing, /const printPrompt = useExitValue\(showPrintPrompt \? savedClosing : null\);/);
    assert.match(closing, /motion-exit-fade fixed inset-0 z-\[60\]/);
    assert.match(closing, /motion-exit-modal-panel bg-surface[^"]*animate-in zoom-in-95/);
  });

  it('the loading shell keeps the dialog size and the swapped body fades in', () => {
    assert.match(closing, /motion-swap-children flex-1 overflow-y-auto/);
    assert.match(closing, /motion-loading-fill py-20/);
  });

  it('the closing logic and amounts are untouched', () => {
    assert.match(closing, /invoke<DailyClosing>\('closing:save'/);
    assert.match(closing, /actualCashPiasters: actualCashPiasters,/);
    assert.match(closing, /disabled=\{\(preview\?\.isDateSuspicious && !confirmSuspiciousDate\)/);
  });
});
