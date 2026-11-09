import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const app = read('src/App.tsx');
const panel = read('src/components/SidebarGroupPanel.tsx');
const css = read('src/index.css');
const guard = '@media screen and (prefers-reduced-motion: no-preference) {';
const motionCss = css.slice(css.indexOf(guard));
const sidebarCss = motionCss.slice(motionCss.indexOf('Sidebar («القوائم الرئيسية»)'));
const sidebar = app.slice(app.indexOf('<aside'), app.indexOf('</aside>'));
const GROUPS = ['Epay', 'Wallets', 'Insurance', 'Dashboard', 'Products', 'Purchases', 'Root', 'Settings'];

describe('sidebar group panels', () => {
  it('every expandable group renders its children through SidebarGroupPanel, driven by its expanded flag and the sidebar width', () => {
    assert.match(app, /import SidebarGroupPanel from '\.\/components\/SidebarGroupPanel'/);
    for (const g of GROUPS) {
      assert.ok(
        sidebar.includes(`<SidebarGroupPanel open={is${g}MenuExpanded && !isSidebarCollapsed}>`),
        `${g} group is not wrapped by SidebarGroupPanel`
      );
    }
    assert.equal(sidebar.match(/<SidebarGroupPanel /g).length, GROUPS.length);
    assert.equal(sidebar.match(/<\/SidebarGroupPanel>/g).length, GROUPS.length);
  });

  it('no group keeps its own conditional block with the animate-in slide: that markup lives once, in the panel', () => {
    assert.ok(!sidebar.includes('slide-in-from-top-1'));
    assert.ok(!/is\w+Item && is\w+MenuExpanded && \(/.test(sidebar));
    assert.match(panel, /border-r-2 border-brand-dark\/25 dark:border-paid-bright\/40 animate-in slide-in-from-top-1 duration-150/);
  });

  it('the panel uses the exit primitive: mounted while closing, inert and marked data-exiting', () => {
    assert.match(panel, /import \{ useExitTransition \} from '\.\.\/hooks\/useExitTransition'/);
    assert.match(panel, /const \{ mounted, exiting \} = useExitTransition\(open\)/);
    assert.match(panel, /if \(!mounted\) return null/);
    assert.match(panel, /data-exiting=\{exiting \|\| undefined\}/);
    assert.match(panel, /inert=\{exiting \|\| undefined\}/);
    assert.match(panel, /motion-nav-group motion-exit-collapse/);
  });

  it('the hook runs before any branch, in the same place on every render', () => {
    const hookAt = panel.indexOf('useExitTransition(open)');
    assert.ok(hookAt > 0 && hookAt < panel.indexOf('return null'));
    const appHook = app.indexOf('const sidebarBody = useExitTransition(!isSidebarCollapsed)');
    assert.ok(appHook > app.indexOf('const [isSidebarCollapsed'));
    assert.ok(appHook < app.indexOf('<aside'));
  });
});

describe('sidebar chevron and collapse', () => {
  it('the group chevron is one icon turned with a motion-aware transform transition, not two swapped icons', () => {
    assert.match(sidebar, /<ChevronLeft\s+className=\{`motion-chevron w-3\.5 h-3\.5 \$\{[^}]*\? '-rotate-90' : ''\}`\}/);
    assert.ok(!sidebar.includes('<ChevronDown'));
    assert.match(sidebarCss, /html\[data-motion="on"\] \.motion-chevron \{\s*transition: transform var\(--rq-motion-duration, 240ms\) ease-out;/);
  });

  it('the icon rail takes over only after the full rows were held for the exit; the width follows the expanded flag at once', () => {
    assert.match(app, /const showSidebarRail = isSidebarCollapsed && !sidebarBody\.mounted;/);
    assert.match(sidebar, /isSidebarCollapsed \? 'w-\[64px\]' : 'w-\[256px\]'/);
    assert.match(sidebar, /showSidebarRail \? 'px-1\.5 py-2\.5 items-center' : 'p-2\.5'/);
    assert.match(sidebar, /if \(showSidebarRail\) \{\s*return \(/);
    assert.match(sidebar, /data-sidebar-exiting=\{sidebarBody\.exiting \|\| undefined\}/);
    assert.match(sidebar, /data-rail=\{showSidebarRail \|\| undefined\}/);
  });

  it('every label that disappears in the rail carries the fading label class', () => {
    assert.equal(sidebar.match(/motion-sidebar-label/g).length, 5);
    assert.ok(!/\{!isSidebarCollapsed && \(/.test(sidebar));
  });

  it('the off path keeps the original classes', () => {
    assert.ok(sidebar.includes('bg-surface dark:bg-surface-dark hairline-l flex flex-col shrink-0 select-none transition-all duration-150 h-full min-h-0 overflow-hidden shadow-2xs'));
    assert.ok(sidebar.includes('w-full relative flex items-center justify-between px-3 h-[2.5625rem] rounded-xl text-sm transition-all duration-150'));
    assert.ok(sidebar.includes('relative w-full h-[2.625rem] rounded-xl flex items-center justify-center transition-all duration-150'));
  });
});

describe('sidebar motion css', () => {
  it('lives in the motion block: scoped under html[data-motion="on"] inside the reduced-motion media query', () => {
    assert.ok(css.indexOf(guard) > 0 && css.indexOf(guard) < css.indexOf('Sidebar («القوائم الرئيسية»)'));
    const rules = sidebarCss.split('\n').filter((l) => /\{\s*$/.test(l) && !/^\s*(@keyframes|\/\*|\*)/.test(l) && !/^\s*(from|to)\b/.test(l));
    assert.ok(rules.length >= 10);
    for (const r of rules) assert.ok(/html\[data-motion="on"\]/.test(r), `unscoped sidebar rule: ${r.trim()}`);
  });

  it('timing comes from the shared variable only: no hard-coded duration except the 80ms press feedback of buttons', () => {
    const withoutVars = sidebarCss.replace(/var\(--rq-motion-duration, 240ms\)/g, '').replace(/transform 0\.08s ease/g, '');
    assert.ok(!/\b\d+(\.\d+)?m?s\b/.test(withoutVars.replace(/\/\*[\s\S]*?\*\//g, '')), 'sidebar rules hard-code a duration');
  });

  it('group children glide the height of a one-row grid, fade, and drop the legacy slide-in', () => {
    assert.match(sidebarCss, /@keyframes rq-collapse-in \{\s*from \{ opacity: 0; grid-template-rows: 0fr; \}\s*to \{ opacity: 1; grid-template-rows: 1fr; \}/);
    assert.match(sidebarCss, /\.motion-nav-group \{\s*display: grid;\s*grid-template-rows: 1fr;\s*animation: rq-collapse-in var\(--rq-motion-duration, 240ms\) ease-out;/);
    assert.match(sidebarCss, /\.motion-nav-group > \* \{\s*min-height: 0;\s*overflow: hidden;/);
    assert.match(sidebarCss, /\.motion-nav-group \.animate-in \{\s*animation: none;/);
    assert.match(motionCss, /\.motion-exit-collapse\[data-exiting\] \{\s*display: grid;\s*animation: rq-collapse-out/);
  });

  it('the width follows the shared duration, rows keep their expanded width while it changes, labels fade', () => {
    assert.match(sidebarCss, /\.motion-sidebar \{\s*transition-property: width;\s*transition-duration: var\(--rq-motion-duration, 240ms\);/);
    assert.match(sidebarCss, /\.motion-sidebar:not\(\[data-rail\]\) > \* \{\s*min-width: calc\(256px - 1\.25rem\);/);
    assert.match(sidebarCss, /\.motion-sidebar-label \{\s*animation: rq-modal-backdrop-in/);
    assert.match(sidebarCss, /\.motion-sidebar\[data-sidebar-exiting\] \.motion-sidebar-label \{\s*animation: rq-fade-out var\(--rq-motion-duration, 240ms\) ease-out forwards;/);
  });

  it('the active highlight only transitions colours, so nothing reflows', () => {
    const rule = sidebarCss.match(/\.motion-sidebar nav button \{([^}]*)\}/)[1];
    assert.ok(!/transition-property: all|font-weight|padding|width|height|margin/.test(rule));
    for (const p of ['color', 'background-color', 'border-color', 'box-shadow']) assert.ok(rule.includes(`${p} var(--rq-motion-duration, 240ms) ease-out`), p);
    assert.match(sidebarCss, /:where\(html\[data-motion="on"\] \.motion-sidebar nav button\) \{\s*border-width: 1px;\s*border-color: transparent;/);
    assert.match(sidebarCss, /\.motion-sidebar nav > button \{\s*height: 41px;/);
  });
});
