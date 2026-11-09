import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Plus } from 'lucide-react';
import ts from 'typescript';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import tailwindConfig from '../tailwind.config.js';
import {
  BUTTON_SIZES,
  BUTTON_VARIANTS,
  MENU_DIVIDER,
  MENU_ITEM,
  MENU_ITEM_DANGER,
  MENU_ITEM_ICON,
  MENU_ITEM_ICON_DANGER,
  MENU_PANEL,
  TABLE_ACTION_TRIGGER,
  buttonClass,
  buttonIconClass,
  tableActionIconClass,
} from '../src/utils/buttonStyles.ts';

const APP_BUTTON_SRC = fileURLToPath(new URL('../src/components/AppButton.tsx', import.meta.url));
const STYLES_URL = new URL('../src/utils/buttonStyles.ts', import.meta.url).href;
const BUILD_DIR = fileURLToPath(new URL('../node_modules/.tmp/app_button_test/', import.meta.url));

const ALLOWED_HEIGHTS = ['h-7', 'h-8', 'h-10', 'h-11'];
const ALLOWED_SQUARES = ['7', '8', '10', '11'];
const PALETTE = /(?:^|[:\-!])(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/;
const COLOUR_UTILITY = /^(ring-offset|bg|text|border|ring)-((?:white|black|transparent|current)|(?:brand|paid|danger|warn|surface|line|ink|canvas|secondary)(?:-[a-z0-9-]+)?)(?:\/\d+)?$/;
const ENABLED = '[&:not(:disabled)]';

// "dark:[&:not(:disabled)]:hover:bg-x" -> { variants: ['ENABLED', 'hover'], dark: true, utility: 'bg-x' }
function parseToken(token) {
  const parts = token.split(ENABLED).join('ENABLED').split(':');
  const utility = parts[parts.length - 1].replace(/^!/, '');
  const all = parts.slice(0, -1);
  return { dark: all.includes('dark'), variants: all.filter((v) => v !== 'dark'), utility };
}

function colourTokens(classString) {
  return classString
    .split(/\s+/)
    .map((token) => ({ token, ...parseToken(token) }))
    .map((t) => ({ ...t, match: COLOUR_UTILITY.exec(t.utility) }))
    .filter((t) => t.match);
}

function assertDarkPairs(classString, label) {
  const all = colourTokens(classString);
  const darkKeys = new Set(all.filter((t) => t.dark).map((t) => `${t.match[1]}|${t.variants.join(':')}`));
  for (const t of all.filter((x) => !x.dark)) {
    const key = `${t.match[1]}|${t.variants.join(':')}`;
    assert.ok(darkKeys.has(key), `${label}: "${t.token}" has no dark: counterpart`);
  }
}

function assertCleanClasses(classString, label) {
  assert.ok(!/\[#|#[0-9a-fA-F]{3,8}\b/.test(classString), `${label}: hex colour found`);
  for (const token of classString.split(/\s+/)) {
    assert.ok(!PALETTE.test(token), `${label}: palette class "${token}"`);
  }
}

function assertHoverGated(classString, label) {
  for (const token of classString.split(/\s+/)) {
    const { variants } = parseToken(token);
    if (variants.includes('hover')) {
      assert.ok(variants.includes('ENABLED'), `${label}: "${token}" hovers while disabled`);
    }
  }
}

const matrix = [];
for (const variant of BUTTON_VARIANTS) {
  for (const size of BUTTON_SIZES) {
    matrix.push({ variant, size, label: `${variant}/${size}`, cls: buttonClass({ variant, size }) });
    matrix.push({
      variant,
      size,
      label: `${variant}/${size}/icon-only`,
      iconOnly: true,
      cls: buttonClass({ variant, size, iconOnly: true, ariaLabel: 'إجراء' }),
    });
  }
}

describe('buttonClass: design rules for every variant x size', () => {
  it('covers the full matrix', () => {
    assert.equal(matrix.length, BUTTON_VARIANTS.length * BUTTON_SIZES.length * 2);
    assert.equal(new Set(BUTTON_VARIANTS).size, BUTTON_VARIANTS.length);
  });

  it('every colour utility has a dark: pair in the same state (rest / hover / focus / open)', () => {
    for (const m of matrix) assertDarkPairs(m.cls, m.label);
  });

  it('uses no hex values and no palette classes', () => {
    for (const m of matrix) assertCleanClasses(m.cls, m.label);
  });

  it('only uses the allowed heights, one per button, and square sizes for icon-only', () => {
    for (const m of matrix) {
      const tokens = m.cls.split(/\s+/);
      const heights = tokens.filter((t) => /^h-\d/.test(t));
      assert.equal(heights.length, 1, `${m.label}: exactly one height`);
      assert.ok(ALLOWED_HEIGHTS.includes(heights[0]), `${m.label}: ${heights[0]} not in the scale`);
      const widths = tokens.filter((t) => /^w-\d/.test(t));
      if (m.iconOnly) {
        assert.equal(widths.length, 1, `${m.label}: icon-only is square`);
        assert.equal(widths[0].slice(2), heights[0].slice(2), `${m.label}: width equals height`);
        assert.ok(ALLOWED_SQUARES.includes(widths[0].slice(2)));
      } else {
        assert.equal(widths.length, 0, `${m.label}: text buttons size by padding`);
      }
    }
  });

  it('has one radius from {lg, xl} and one text size from {xs, sm}', () => {
    for (const m of matrix.filter((x) => !x.iconOnly)) {
      const tokens = m.cls.split(/\s+/);
      const radius = tokens.filter((t) => /^rounded/.test(t));
      assert.equal(radius.length, 1, `${m.label}: one radius`);
      assert.ok(['rounded-lg', 'rounded-xl'].includes(radius[0]));
      const text = tokens.filter((t) => /^text-(xs|sm|micro|base|lg)$/.test(t));
      assert.equal(text.length, 1, `${m.label}: one text size`);
      assert.equal(text[0], m.size === 'lg' ? 'text-sm' : 'text-xs');
    }
    assert.match(buttonClass({ size: 'lg' }), /\brounded-xl\b/);
    assert.match(buttonClass({ size: 'md' }), /\brounded-lg\b/);
  });

  it('is deterministic and every variant / size produces a different class string', () => {
    assert.equal(new Set(matrix.map((m) => m.cls)).size, matrix.length);
    assert.equal(buttonClass({ variant: 'primary', size: 'sm' }), buttonClass({ variant: 'primary', size: 'sm' }));
  });

  it('defaults to a medium secondary button', () => {
    assert.equal(buttonClass(), buttonClass({ variant: 'secondary', size: 'md' }));
  });

  it('never hovers while disabled', () => {
    for (const m of matrix) assertHoverGated(m.cls, m.label);
  });

  it('disabled rule: faded, not-allowed, no shadow; solid fills carry a shadow-xs only at rest', () => {
    for (const m of matrix) {
      assert.match(m.cls, /\bdisabled:cursor-not-allowed\b/, m.label);
      assert.match(m.cls, /\bdisabled:opacity-50\b/, m.label);
      assert.match(m.cls, /\bdisabled:shadow-none\b/, m.label);
      assert.match(m.cls, /\baria-disabled:pointer-events-none\b/, m.label);
    }
    for (const v of ['primary', 'success', 'warning', 'danger']) assert.match(buttonClass({ variant: v }), /\bshadow-xs\b/);
    for (const v of ['secondary', 'soft', 'subtle']) assert.doesNotMatch(buttonClass({ variant: v }), /\bshadow-xs\b/);
  });

  it('has the same keyboard focus ring on every button, light and dark', () => {
    for (const m of matrix) {
      for (const token of ['focus-visible:!ring-2', 'focus-visible:!ring-brand', 'dark:focus-visible:!ring-brand-bright']) {
        assert.ok(m.cls.split(/\s+/).includes(token), `${m.label}: missing ${token}`);
      }
    }
  });

  it('does not add transition or press-scale classes (index.css owns them for every button)', () => {
    for (const m of matrix) assert.doesNotMatch(m.cls, /\btransition|active:scale|duration-/, m.label);
  });

  it('dark primary shares the success fill (paid-bright) while the light fills differ', () => {
    const p = buttonClass({ variant: 'primary' });
    assert.match(p, /\bdark:bg-paid-bright\b/);
    assert.match(p, /\bdark:\[&:not\(:disabled\)\]:hover:bg-paid-bright-hover\b/);
    assert.match(p, /(?:^|\s)bg-brand\b/);
    assert.match(buttonClass({ variant: 'success' }), /(?:^|\s)bg-paid\b/);
  });

  it('solid variants use a bright fill with dark text in the dark theme, white (or ink on warn) in light', () => {
    for (const v of ['primary', 'success', 'warning', 'danger']) {
      const cls = buttonClass({ variant: v });
      assert.match(cls, new RegExp(`dark:bg-${v === 'primary' || v === 'success' ? 'paid' : v === 'warning' ? 'warn' : 'danger'}-bright\\b`));
      assert.match(cls, /dark:text-surface-dark\b/);
      assert.match(cls, v === 'warning' ? /(?:^|\s)text-ink\b/ : /\btext-white\b/);
      if (v === 'warning') assert.match(cls, /(?:^|\s)bg-warn-bright\b/);
      else assert.doesNotMatch(cls, /\bbg-warn(?![-\w])/);
    }
  });

  it('loading drops the fade (spinner is the feedback), keeps the layout reference and the rest of the rules', () => {
    const cls = buttonClass({ variant: 'primary', loading: true });
    assert.match(cls, /\brelative\b/);
    assert.match(cls, /\bdisabled:opacity-80\b/);
    assert.doesNotMatch(cls, /\bdisabled:opacity-50\b/);
    assert.match(cls, /\bdisabled:cursor-not-allowed\b/);
    assertDarkPairs(cls, 'loading');
  });

  it('fullWidth adds w-full for text buttons only', () => {
    assert.match(buttonClass({ fullWidth: true }), /\bw-full\b/);
    assert.doesNotMatch(buttonClass(), /\bw-full\b/);
    assert.doesNotMatch(buttonClass({ iconOnly: true, ariaLabel: 'حذف', fullWidth: true }), /\bw-full\b/);
  });

  it('icon-only requires a non-empty accessible name', () => {
    assert.throws(() => buttonClass({ iconOnly: true }), /ariaLabel/);
    assert.throws(() => buttonClass({ iconOnly: true, ariaLabel: '' }), /ariaLabel/);
    assert.throws(() => buttonClass({ iconOnly: true, ariaLabel: '   ' }), /ariaLabel/);
    assert.doesNotThrow(() => buttonClass({ iconOnly: true, ariaLabel: 'حذف' }));
  });

  it('icon sizes: w-3.5 on xs/sm, w-4 on md/lg and on icon-only sm and up', () => {
    assert.match(buttonIconClass('sm'), /^w-3\.5 h-3\.5\b/);
    assert.match(buttonIconClass('md'), /^w-4 h-4\b/);
    assert.match(buttonIconClass('xs', true), /^w-3\.5 h-3\.5\b/);
    assert.match(buttonIconClass('sm', true), /^w-4 h-4\b/);
    for (const m of matrix.filter((x) => !x.iconOnly)) assert.match(m.cls, /\bgap-1\.5\b/, m.label);
  });
});

describe('contrast of text on every solid fill (WCAG AA 4.5:1), both themes, rest and hover', () => {
  const flat = {};
  for (const [name, value] of Object.entries(tailwindConfig.theme.extend.colors)) {
    if (typeof value === 'string') flat[name] = value;
    else for (const [k, v] of Object.entries(value)) flat[k === 'DEFAULT' ? name : `${name}-${k}`] = v;
  }
  const channel = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const luminance = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16) / 255));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const resolve = (name, alpha, under) => {
    const hex = flat[name] ?? (name === 'white' ? '#FFFFFF' : undefined);
    assert.ok(hex, `unknown colour token ${name}`);
    if (alpha === undefined) return hex;
    const mixed = [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * alpha + parseInt(under.slice(i, i + 2), 16) * (1 - alpha)));
    return `#${mixed.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
  };
  const ratio = (a, b) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const pick = (cls, re) => {
    const m = re.exec(cls);
    assert.ok(m, `no match for ${re}`);
    return m;
  };

  for (const variant of ['primary', 'success', 'warning', 'danger']) {
    it(`${variant}: text is readable on the fill and on its hover fill`, () => {
      const cls = buttonClass({ variant });
      const tokens = cls.split(/\s+/);
      const lightText = pick(cls, /(?:^|\s)text-(white|ink)(?:\s|$)/)[1];
      const lightFill = pick(cls, /(?:^|\s)bg-([a-z-]+)(?:\s|$)/)[1];
      const lightHover = pick(tokens.join(' '), /(?:^|\s)\[&:not\(:disabled\)\]:hover:bg-([a-z-]+)(?:\/(\d+))?(?:\s|$)/);
      const darkText = pick(cls, /(?:^|\s)dark:text-([a-z-]+)(?:\s|$)/)[1];
      const darkFill = pick(cls, /(?:^|\s)dark:bg-([a-z-]+)(?:\s|$)/)[1];
      const darkHover = pick(cls, /(?:^|\s)dark:\[&:not\(:disabled\)\]:hover:bg-([a-z-]+)(?:\/(\d+))?(?:\s|$)/);
      const text = (name) => resolve(name);
      const alpha = (m) => (m[2] ? Number(m[2]) / 100 : undefined);
      assert.ok(ratio(text(lightText), resolve(lightFill)) >= 4.5, `${variant} light rest`);
      assert.ok(ratio(text(lightText), resolve(lightHover[1], alpha(lightHover), '#FFFFFF')) >= 4.5, `${variant} light hover`);
      assert.ok(ratio(text(darkText), resolve(darkFill)) >= 4.5, `${variant} dark rest`);
      assert.ok(ratio(text(darkText), resolve(darkHover[1], alpha(darkHover), flat['surface-dark'])) >= 4.5, `${variant} dark hover`);
    });
  }
});

describe('table action and menu constants', () => {
  const sets = {
    TABLE_ACTION_TRIGGER,
    tableActionIcon: tableActionIconClass('تعديل'),
    tableActionIconDanger: tableActionIconClass('حذف', true),
    MENU_PANEL,
    MENU_ITEM,
    MENU_ITEM_DANGER,
    MENU_ITEM_ICON,
    MENU_ITEM_ICON_DANGER,
    MENU_DIVIDER,
  };

  it('follow the same dark-pair, hex and palette rules', () => {
    for (const [name, cls] of Object.entries(sets)) {
      assertDarkPairs(cls, name);
      assertCleanClasses(cls, name);
      assertHoverGated(cls, name);
    }
  });

  it('table trigger is the compact secondary button and paints its open state via aria-expanded', () => {
    assert.match(TABLE_ACTION_TRIGGER, /\bh-7\b/);
    assert.match(TABLE_ACTION_TRIGGER, /\baria-expanded:bg-brand-soft\b/);
    assert.match(TABLE_ACTION_TRIGGER, /\bdark:aria-expanded:bg-brand-dark-soft\b/);
  });

  it('table icon buttons are square h-7 and need a label', () => {
    assert.match(sets.tableActionIcon, /\bw-7\b.*\bh-7\b|\bh-7\b.*\bw-7\b/);
    assert.throws(() => tableActionIconClass(''), /ariaLabel/);
    assert.notEqual(sets.tableActionIcon, sets.tableActionIconDanger);
  });

  it('menu rows share one geometry and differ only by tone', () => {
    for (const row of [MENU_ITEM, MENU_ITEM_DANGER]) {
      assert.match(row, /\bmin-h-9\b/);
      assert.match(row, /\brounded-lg\b/);
      assert.match(row, /\btext-xs\b/);
      assert.match(row, /\bdisabled:cursor-not-allowed\b/);
    }
    assert.match(MENU_ITEM_DANGER, /\btext-danger\b/);
    assert.match(MENU_ITEM_DANGER, /\bdark:text-danger-bright\b/);
  });
});

describe('every generated class exists in Tailwind v3', () => {
  it('compiles each token to CSS (catches dead classes such as active:scale-98 or hover:bg-danger-hover)', async () => {
    const tokens = new Set();
    for (const m of matrix) m.cls.split(/\s+/).forEach((t) => tokens.add(t));
    for (const cls of [buttonClass({ loading: true }), buttonClass({ fullWidth: true }), ...Object.values({ TABLE_ACTION_TRIGGER, MENU_PANEL, MENU_ITEM, MENU_ITEM_DANGER, MENU_ITEM_ICON, MENU_ITEM_ICON_DANGER, MENU_DIVIDER })]) {
      cls.split(/\s+/).forEach((t) => tokens.add(t));
    }
    const result = await postcss([tailwindcss({ ...tailwindConfig, content: [{ raw: [...tokens].join(' ') }] })]).process('@tailwind utilities;', { from: undefined });
    const escape = (token) => token.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`);
    // "group" is a marker class without a rule of its own.
    const missing = [...tokens].filter((t) => t !== 'group' && !result.css.includes(`.${escape(t)}`));
    assert.deepEqual(missing, []);
  });
});

describe('AppButton component', () => {
  let AppButton;

  before(async () => {
    mkdirSync(BUILD_DIR, { recursive: true });
    const source = readFileSync(APP_BUTTON_SRC, 'utf8');
    const out = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText.replace('../utils/buttonStyles.ts', STYLES_URL);
    const file = `${BUILD_DIR}AppButton.mjs`;
    writeFileSync(file, out);
    ({ AppButton } = await import(`${pathToFileURL(file).href}?t=${Date.now()}`));
  });

  after(() => rmSync(BUILD_DIR, { recursive: true, force: true }));

  const html = (props, ...children) => renderToStaticMarkup(createElement(AppButton, props, ...children));

  it('renders a type="button" button by default (never an accidental form submit)', () => {
    const out = html({ variant: 'primary' }, 'حفظ');
    assert.match(out, /^<button type="button"/);
    assert.match(out, /حفظ/);
    assert.match(html({ type: 'submit' }, 'إرسال'), /type="submit"/);
  });

  it('uses buttonClass for its colours and appends layout-only className', () => {
    const out = html({ variant: 'danger', size: 'sm', className: 'shrink-0', fullWidth: true }, 'حذف');
    const expected = `${buttonClass({ variant: 'danger', size: 'sm', fullWidth: true })} shrink-0`;
    assert.ok(out.includes(expected.replace(/&/g, '&amp;')));
  });

  it('passes title and aria-* through', () => {
    const out = html({ title: 'تلميح', 'aria-describedby': 'hint', 'aria-expanded': false }, 'خيارات');
    assert.match(out, /title="تلميح"/);
    assert.match(out, /aria-describedby="hint"/);
    assert.match(out, /aria-expanded="false"/);
  });

  it('places the icon first by default and after the label with iconPosition="end"', () => {
    const start = html({ icon: Plus }, 'جديد');
    assert.ok(start.indexOf('<svg') < start.indexOf('جديد'));
    const end = html({ icon: Plus, iconPosition: 'end' }, 'جديد');
    assert.ok(end.indexOf('<svg') > end.indexOf('جديد'));
    assert.match(start, /class="[^"]*\bw-4 h-4\b/);
    assert.match(html({ icon: Plus, size: 'sm' }, 'جديد'), /<svg[^>]*class="[^"]*\bw-3\.5 h-3\.5\b/);
  });

  it('loading with an icon swaps the icon for a spinner of the same size and disables the button', () => {
    const out = html({ icon: Plus, loading: true }, 'حفظ');
    assert.match(out, /aria-busy="true"/);
    assert.match(out, /\bdisabled=""/);
    assert.equal((out.match(/<svg/g) || []).length, 1);
    assert.match(out, /animate-spin/);
    assert.match(out, /\bw-4 h-4\b/);
    assert.doesNotMatch(out, /invisible/);
  });

  it('loading without an icon overlays the spinner and keeps the label in the layout', () => {
    const out = html({ loading: true }, 'جاري الحفظ');
    assert.match(out, /aria-busy="true"/);
    assert.match(out, /<span class="invisible">جاري الحفظ<\/span>/);
    assert.match(out, /absolute inset-0/);
    assert.equal((out.match(/<svg/g) || []).length, 1);
  });

  it('is not busy when not loading', () => {
    assert.doesNotMatch(html({}, 'حفظ'), /aria-busy/);
    assert.doesNotMatch(html({}, 'حفظ'), /\bdisabled=""/);
    assert.match(html({ disabled: true }, 'حفظ'), /\bdisabled=""/);
  });

  it('icon-only gets the square classes, the aria-label and a tooltip, and refuses to render without a label', () => {
    const out = html({ icon: Plus, 'aria-label': 'إضافة', size: 'sm', variant: 'subtle' });
    assert.match(out, /aria-label="إضافة"/);
    assert.match(out, /title="إضافة"/);
    assert.match(out, /\bw-8\b/);
    assert.match(out, /\bh-8\b/);
    assert.throws(() => html({ icon: Plus }), /ariaLabel/);
  });

  it('renders as an anchor and neutralises it while loading', () => {
    const link = html({ as: 'a', href: '/x', variant: 'primary' }, 'فتح');
    assert.match(link, /^<a /);
    assert.match(link, /href="\/x"/);
    assert.doesNotMatch(link, /type=/);
    const busy = html({ as: 'a', href: '/x', loading: true }, 'فتح');
    assert.doesNotMatch(busy, /href=/);
    assert.match(busy, /aria-disabled="true"/);
    assert.match(busy, /tabindex="-1"/);
    assert.match(html({ as: 'a', href: '/x', 'aria-disabled': true }, 'فتح'), /aria-disabled="true"/);
    assert.doesNotMatch(html({ as: 'a', href: '/x', 'aria-disabled': true }, 'فتح'), /href=/);
  });

  it('keeps all colour decisions in buttonStyles.ts', () => {
    const source = readFileSync(APP_BUTTON_SRC, 'utf8');
    assert.doesNotMatch(source, /\b(?:bg|text|border|ring)-(?:brand|paid|danger|warn|surface|line|ink)\b/);
    assert.doesNotMatch(source, /#[0-9a-fA-F]{3,8}\b/);
    assert.doesNotMatch(source, PALETTE);
  });
});
