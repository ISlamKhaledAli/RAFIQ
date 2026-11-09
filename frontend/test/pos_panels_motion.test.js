import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (...parts) => readFileSync(join(ROOT, ...parts), 'utf8').replace(/\r\n/g, '\n');
const catalog = read('src', 'views', 'pos', 'PosCatalogPanel.tsx');
const categories = read('src', 'views', 'pos', 'PosCategoriesPanel.tsx');
const css = read('src', 'index.css');
const guard = '@media screen and (prefers-reduced-motion: no-preference) {';
const motionCss = css.slice(css.indexOf(guard));

describe('POS side panels glide with the shared motion rule', () => {
  it('both panels keep their 150ms transition and carry motion-resize, so the length follows --rq-motion-duration', () => {
    assert.match(catalog, /transition-all duration-150 motion-resize motion-catalog/);
    assert.equal((categories.match(/transition-all duration-150 motion-resize/g) || []).length, 2, 'collapsed and expanded sections');
    assert.match(motionCss, /html\[data-motion="on"\] \.motion-resize \{\s*transition-duration: var\(--rq-motion-duration, 240ms\);\s*transition-timing-function: ease-out;/);
  });

  it('the markup classes that decide the motion-off layout are untouched', () => {
    assert.match(catalog, /flex-none w-\[3\.625rem\] min-w-\[3\.625rem\]'/);
    assert.match(catalog, /'flex-1 min-w-\[18\.75rem\] p-2\.5 sm:p-3'/);
    assert.match(categories, /w-\[3\.625rem\] min-w-\[3\.625rem\]/);
    assert.match(categories, /w-\[13\.75rem\] sm:w-\[15rem\]/);
  });

  it('the collapsed catalog gets an interpolable flex only with motion on, inside the reduced-motion guard', () => {
    assert.ok(css.includes(guard) && css.indexOf('.motion-catalog[data-collapsed="true"]') > css.indexOf(guard));
    assert.match(catalog, /data-collapsed=\{isCollapsed\}/);
    assert.match(motionCss, /html\[data-motion="on"\] \.motion-catalog\[data-collapsed="true"\] \{\s*flex: 0 0 3\.625rem;/);
    const outside = css.slice(0, css.indexOf(guard));
    assert.ok(!/motion-catalog|motion-swap/.test(outside), 'no panel motion rule outside the guard');
  });

  it('the catalog body fades instead of popping and is inert and hidden for focus once collapsed', () => {
    assert.match(catalog, /isCollapsed \? 'hidden motion-catalog-body' : 'contents motion-catalog-body'/);
    assert.match(catalog, /inert=\{isCollapsed\}/);
    const base = /html\[data-motion="on"\] \.motion-catalog-body \{([^}]*)\}/.exec(motionCss);
    assert.ok(base, 'body rule');
    assert.match(base[1], /transition: opacity var\(--rq-motion-duration, 240ms\) ease-out;/);
    assert.match(base[1], /display: flex;/, 'a real box while motion is on, so opacity applies');
    const collapsed = /\.motion-catalog\[data-collapsed="true"\] \.motion-catalog-body \{([^}]*)\}/.exec(motionCss);
    assert.ok(collapsed, 'collapsed body rule');
    assert.match(collapsed[1], /opacity: 0;/);
    assert.match(collapsed[1], /visibility: hidden;/);
    assert.match(collapsed[1], /pointer-events: none;/);
    assert.match(collapsed[1], /visibility 0s linear var\(--rq-motion-duration, 240ms\)/, 'visibility flips after the fade');
    assert.ok(!/display:\s*none/.test(collapsed[1]), 'never display none-only while motion is on');
  });

  it('what mounts on a strip / body switch fades in with the same variable', () => {
    assert.match(catalog, /motion-swap-in flex-1 w-full min-h-0/);
    assert.match(categories, /motion-swap-children/);
    assert.match(motionCss, /html\[data-motion="on"\] \.motion-swap-in,\s*html\[data-motion="on"\] \.motion-swap-children > \* \{\s*animation: rq-modal-backdrop-in var\(--rq-motion-duration, 240ms\) ease-out;/);
  });

  it('the cart column still absorbs the width (flex-1) and the linked collapse / expand signals are unchanged', () => {
    const posView = read('src', 'views', 'PosView.tsx');
    assert.match(posView, /showFastItems \? 'flex-1 min-w-\[22\.5rem\]' : 'flex-1'/);
    assert.match(posView, /onCollapse=\{\(\) => setCategoriesCollapseSignal\(\(n\) => n \+ 1\)\}/);
    assert.match(posView, /onExpand=\{\(\) => setCatalogExpandSignal\(\(n\) => n \+ 1\)\}/);
  });
});
