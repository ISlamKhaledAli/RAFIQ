import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// Source-scanning guard for dark-mode readability (no browser): interactive elements must never
// pair a dark text colour with a dark/tinted background in the `dark` theme. See tailwind.config.js tokens.
const SRC = fileURLToPath(new URL('../src/', import.meta.url));

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (/\.tsx$/.test(e.name)) out.push(p);
  }
  return out;
}

const FILES = walk(SRC).map((p) => ({ rel: relative(SRC, p), src: readFileSync(p, 'utf8') }));
const LITERAL = /(["'`])((?:(?!\1)[^\\\n]|\\.)*?)\1/g;

/** Every quoted/template chunk that looks like a Tailwind class list, with its line number. */
function classLiterals(src) {
  const out = [];
  let m;
  while ((m = LITERAL.exec(src))) {
    const tokens = m[2].split(/\s+/).filter(Boolean);
    if (tokens.length < 2) continue;
    out.push({ tokens, index: m.index, line: src.slice(0, m.index).split('\n').length, text: m[2] });
  }
  return out;
}

function findViolations(test) {
  const hits = [];
  for (const f of FILES) {
    for (const lit of classLiterals(f.src)) {
      const why = test(lit.tokens, f);
      if (why) hits.push(`${f.rel}:${lit.line} ${why}`);
    }
  }
  return hits;
}

const has = (tokens, re) => tokens.some((t) => re.test(t));
const isDarkAware = (f) => (f.src.match(/dark:(bg-surface-dark|border-line-dark|bg-canvas-dark)/g) || []).length >= 6;

describe('dark mode readability guard', () => {
  it('dark: variants never reuse the light-mode (dark) text tokens', () => {
    const hits = findViolations((t) =>
      has(t, /^dark:(hover:|group-hover:|focus:)?text-(danger|warn|brand|paid|brand-dark|paid-hover|danger-ink|warn-dark)$/)
        ? 'dark text token used in dark theme (use the *-bright token)'
        : null);
    assert.deepEqual(hits, []);
  });

  it('no slate-900 text/fill and no emerald hover fills in dark: variants', () => {
    const hits = findViolations((t) =>
      has(t, /^dark:(group-hover:|hover:)?(text|fill|stroke)-slate-9\d\d(\/\d+)?$/) || has(t, /^dark:hover:bg-emerald-\d+/)
        ? 'ad-hoc palette colour in dark variant (use surface-dark / paid-bright-hover / brand-bright tokens)'
        : null);
    assert.deepEqual(hits, []);
  });

  it('a bright dark-mode fill never hovers to a dark fill while keeping dark text', () => {
    const hits = findViolations((t) => {
      const brightFill = has(t, /^dark:bg-(paid|brand|warn|danger)-bright$/);
      const darkText = has(t, /^dark:text-(surface-dark|slate-900|ink|canvas-dark)$/);
      const darkHover = has(t, /^dark:hover:bg-(paid|brand|warn|danger|paid-hover|brand-hover|brand-dark)$/);
      const hoverText = has(t, /^dark:hover:text-/);
      return brightFill && darkText && darkHover && !hoverText ? 'hover turns the bright fill dark under dark text' : null;
    });
    assert.deepEqual(hits, []);
  });

  it('SegmentedTabs selected state is bright text on a dark tint for every tone', () => {
    const f = FILES.find((x) => x.rel === join('components', 'SegmentedTabs.tsx'));
    assert.ok(f, 'SegmentedTabs.tsx must exist');
    for (const tone of ['brand', 'paid', 'warn', 'danger']) {
      const line = f.src.split('\n').find((l) => new RegExp(`^\\s*${tone}:\\s*'bg-`).test(l) && l.includes('shadow-xs'));
      assert.ok(line, `ACTIVE_TONE.${tone} is missing`);
      assert.ok(line.includes(`dark:bg-${tone}-dark-soft`), `${tone}: selected tab needs dark:bg-${tone}-dark-soft`);
      assert.ok(line.includes(`dark:text-${tone}-bright`), `${tone}: selected tab needs dark:text-${tone}-bright`);
      assert.ok(!/dark:text-(surface-dark|ink)\b/.test(line), `${tone}: selected tab must not use dark text`);
    }
  });

  it('selected-state class branches are not "bright fill + dark text" (use dark tint + bright text)', () => {
    const hits = [];
    for (const f of FILES) {
      for (const lit of classLiterals(f.src)) {
        const prefix = f.src.slice(Math.max(0, lit.index - 160), lit.index).trimEnd();
        const isSelectionBranch = /(isSelected|isActive|activeTab|activeSection|selected\w*|active\w*)\s*(===[^?]*)?\?$/.test(prefix);
        if (!isSelectionBranch) continue;
        if (has(lit.tokens, /^dark:bg-(paid|brand|warn|danger)-bright$/) && has(lit.tokens, /^dark:text-(surface-dark|ink|canvas-dark|brand-dark)$/)) {
          hits.push(`${f.rel}:${lit.line} selected state uses bright fill with dark text`);
        }
      }
    }
    assert.deepEqual(hits, []);
  });

  it('CustomSelect highlights and selected options stay readable in dark mode', () => {
    const src = FILES.find((x) => x.rel === join('components', 'CustomSelect.tsx')).src;
    assert.match(src, /isSelected\s*\n?\s*\? 'bg-brand-soft dark:bg-brand-dark-soft text-brand dark:text-brand-bright/);
    assert.doesNotMatch(src, /dark:hover:text-ink[ '"`]/, 'hover must not put dark ink on a dark row');
  });

  it('interactive controls in dark-aware files give hover/idle a dark variant', () => {
    const hits = [];
    for (const f of FILES) {
      if (!isDarkAware(f)) continue;
      for (const lit of classLiterals(f.src)) {
        const t = lit.tokens;
        if (has(t, /^bg-white(\/\d+)?$/) || has(t, /^print:/)) continue; // light "paper" surfaces keep dark ink
        const interactive = has(t, /^(hover:|group-hover:)/) || t.includes('cursor-pointer');
        if (!interactive) continue;
        const lightHoverBg = has(t, /^hover:bg-(surface|surface-2|surface-3|brand-soft|paid-soft|warn-soft|danger-soft|line)(\/\d+)?$/);
        if (lightHoverBg && !has(t, /^dark:hover:bg-/) && !has(t, /^dark:bg-/)) {
          hits.push(`${f.rel}:${lit.line} light hover background without dark:hover:bg-*`);
        }
        const darkHoverText = has(t, /^hover:text-(ink|brand|paid|warn|danger|black)$/);
        if (darkHoverText && !has(t, /^dark:hover:text-/) && !has(t, /^dark:text-/)) {
          hits.push(`${f.rel}:${lit.line} dark hover text without dark:hover:text-*`);
        }
        const idleDark = has(t, /^text-(ink-muted|ink)(\/\d+)?$/);
        if (idleDark && !has(t, /^dark:text-/) && !has(t, /^text-(white|brand|paid|warn|danger)/)) {
          hits.push(`${f.rel}:${lit.line} dark idle text without dark:text-*`);
        }
      }
    }
    assert.deepEqual(hits, []);
  });

  it('DailyClosingModal uses design tokens only (no hex, no emerald/purple palette)', () => {
    const src = FILES.find((x) => x.rel === join('components', 'DailyClosingModal.tsx')).src;
    assert.doesNotMatch(src, /\[#[0-9a-fA-F]{3,8}\]/, 'no arbitrary hex colours');
    assert.doesNotMatch(src, /-(emerald|purple|slate)-\d{2,3}/, 'no palette colours, use brand/paid/warn/danger tokens');
  });

  it('native selects switch to a bright chevron in dark mode', () => {
    const css = readFileSync(join(SRC, 'index.css'), 'utf8');
    assert.match(css, /html\.dark select\s*\{[^}]*stroke='%235FBFA2'/);
  });
});
