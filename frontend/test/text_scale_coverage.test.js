import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_TEXT_SCALE,
  TEXT_SCALE_CLAMPED_MAX,
  TEXT_SCALE_CLAMP_BELOW_WIDTH,
  TEXT_SCALE_CSS_VAR,
  TEXT_SCALE_LEVELS,
  TEXT_SCALE_STORAGE_KEY,
  applyTextScale,
  effectiveTextScale,
  isTextScaleClamped,
  parseTextScale,
  setTextScale,
  watchTextScaleViewport,
} from '../src/utils/textScale.ts';
import {
  PX_ALLOW_LIST,
  SRC_DIR,
  convertProject,
  convertSource,
  listSourceFiles,
  pxToRem,
} from '../scripts/px-to-rem.mjs';

const read = (rel) => readFileSync(new URL(`../src/${rel}`, import.meta.url), 'utf8');
const memoryStorage = (initial = {}) => {
  const data = { ...initial };
  return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = v; } };
};
const fakeRoot = () => {
  const props = {};
  return { props, style: { setProperty: (n, v) => { props[n] = v; } } };
};

describe('text scale levels and viewport clamp', () => {
  it('offers four levels and keeps the three stored values exactly', () => {
    assert.deepEqual(TEXT_SCALE_LEVELS.map((l) => l.value), [0.9, 1, 1.1, 1.2]);
    assert.deepEqual(TEXT_SCALE_LEVELS.map((l) => l.label), ['صغير', 'عادي', 'كبير', 'كبير جداً']);
    for (const old of ['0.9', '1', '1.1']) assert.equal(parseTextScale(old), Number(old), `stored ${old} still accepted`);
    assert.equal(parseTextScale('1.2'), 1.2);
    for (const bad of ['1.3', '1.15', '2', '0', '', 'abc', null, undefined]) assert.equal(parseTextScale(bad), DEFAULT_TEXT_SCALE);
  });

  it('clamps the effective scale below 1200px and not above it', () => {
    assert.equal(TEXT_SCALE_CLAMP_BELOW_WIDTH, 1200);
    assert.equal(TEXT_SCALE_CLAMPED_MAX, 1.1);
    for (const width of [640, 1024, 1199]) {
      assert.equal(effectiveTextScale(1.2, width), 1.1, `1.2 at ${width}`);
      assert.equal(effectiveTextScale(1.1, width), 1.1);
      assert.equal(effectiveTextScale(1, width), 1);
      assert.equal(effectiveTextScale(0.9, width), 0.9);
      assert.equal(isTextScaleClamped(1.2, width), true);
      assert.equal(isTextScaleClamped(1.1, width), false);
    }
    for (const width of [1200, 1366, 1920]) {
      assert.equal(effectiveTextScale(1.2, width), 1.2, `1.2 at ${width}`);
      assert.equal(isTextScaleClamped(1.2, width), false);
    }
    assert.equal(effectiveTextScale(1.2, 1024.5), 1.1);
    assert.equal(effectiveTextScale(99, 1024), DEFAULT_TEXT_SCALE, 'invalid input falls back before clamping');
  });

  it('applies the clamped value to the root but keeps the selected level', () => {
    const root = fakeRoot();
    assert.equal(applyTextScale(root, 1.2, 1024), 1.2);
    assert.equal(root.props[TEXT_SCALE_CSS_VAR], '1.1');
    assert.equal(applyTextScale(root, 1.2, 1366), 1.2);
    assert.equal(root.props[TEXT_SCALE_CSS_VAR], '1.2');
    assert.equal(applyTextScale(root, 1.2), 1.2, 'no viewport width means no clamp');
    assert.equal(root.props[TEXT_SCALE_CSS_VAR], '1.2');

    const storage = memoryStorage();
    assert.equal(setTextScale(root, storage, 1.2, 1024), 1.2);
    assert.equal(storage.data[TEXT_SCALE_STORAGE_KEY], '1.2', 'the selection is persisted, not the clamped value');
    assert.equal(root.props[TEXT_SCALE_CSS_VAR], '1.1');
  });

  it('re-applies the stored selection when the window is resized and can be disposed', () => {
    const root = fakeRoot();
    const storage = memoryStorage({ [TEXT_SCALE_STORAGE_KEY]: '1.2' });
    const listeners = new Set();
    const win = {
      innerWidth: 1024,
      addEventListener: (type, fn) => { assert.equal(type, 'resize'); listeners.add(fn); },
      removeEventListener: (type, fn) => { assert.equal(type, 'resize'); listeners.delete(fn); },
    };
    const stop = watchTextScaleViewport(win, root, storage);
    assert.equal(root.props[TEXT_SCALE_CSS_VAR], '1.1', 'applied immediately with the current width');
    win.innerWidth = 1600;
    listeners.forEach((fn) => fn());
    assert.equal(root.props[TEXT_SCALE_CSS_VAR], '1.2');
    win.innerWidth = 900;
    listeners.forEach((fn) => fn());
    assert.equal(root.props[TEXT_SCALE_CSS_VAR], '1.1');
    stop();
    assert.equal(listeners.size, 0);
  });

  it('TextScaleControl shows three levels in a row, the largest full width under them, and explains the clamp', () => {
    const src = read('components/TextScaleControl.tsx');
    assert.ok(src.includes('TEXT_SCALE_LEVELS.map'), 'one radio per level');
    assert.ok(src.includes('grid-cols-3'));
    assert.ok(!src.includes('grid-cols-4'));
    assert.ok(src.includes("isLast ? 'col-span-3' : ''"), 'the last level spans the whole row');
    assert.ok(src.includes('isTextScaleClamped'));
    assert.ok(src.includes('يُطبّق بالكامل على الشاشات الأعرض من 1200 بكسل'));
    assert.ok(read('main.tsx').includes('watchTextScaleViewport'), 'the viewport clamp is installed at startup');
  });
});

describe('px to rem converter', () => {
  it('converts size utilities to exact rem values and keeps everything else', () => {
    const src = 'a h-[34px] min-h-[124px] w-[110px] sm:max-w-[240px] min-w-[0.5px] h-[2px] print:h-[40px] border-[1px] rounded-[10px] text-[9px] w-[50%] h-[calc(100vh-34px)]';
    const { text, converted, skipped } = convertSource(src);
    assert.equal(text, 'a h-[2.125rem] min-h-[7.75rem] w-[6.875rem] sm:max-w-[15rem] min-w-[0.5px] h-[2px] print:h-[40px] border-[1px] rounded-[10px] text-[9px] w-[50%] h-[calc(100vh-34px)]');
    assert.deepEqual(converted, ['h-[34px]', 'min-h-[124px]', 'w-[110px]', 'sm:max-w-[240px]']);
    assert.deepEqual(skipped, ['min-w-[0.5px]', 'h-[2px]', 'print:h-[40px]']);
    assert.equal(pxToRem(39), '2.4375rem');
    assert.equal(pxToRem(255), '15.9375rem');
  });

  it('converts the px parts of grid templates only', () => {
    const { text } = convertSource('grid-cols-[minmax(0,1fr)_176px_128px] lg:grid-cols-[88px_1fr_auto]');
    assert.equal(text, 'grid-cols-[minmax(0,1fr)_11rem_8rem] lg:grid-cols-[5.5rem_1fr_auto]');
  });

  it('honours the allow-list, preserves CRLF and is idempotent', () => {
    const src = 'x w-[256px] h-[34px]\r\ny w-[256px]\r\n';
    const once = convertSource(src, ['w-[256px]']);
    assert.equal(once.text, 'x w-[256px] h-[2.125rem]\r\ny w-[256px]\r\n');
    assert.deepEqual(once.skipped, ['w-[256px]', 'w-[256px]']);
    const twice = convertSource(once.text, ['w-[256px]']);
    assert.equal(twice.text, once.text);
    assert.deepEqual(twice.converted, []);
  });
});

describe('no fixed pixel sizes on text-bearing boxes', () => {
  it('leaves nothing convertible outside the documented allow-list', () => {
    const left = convertProject({ write: false });
    assert.deepEqual(left.map((r) => `${r.file}: ${r.tokens.join(', ')}`), []);
  });

  it('documents every allow-listed token with a reason and still finds it in its file', () => {
    for (const [file, entries] of Object.entries(PX_ALLOW_LIST)) {
      const src = read(file);
      for (const { token, reason } of entries) {
        assert.ok(reason.length > 10, `${file} ${token} needs a reason`);
        assert.ok(src.includes(token), `${file} no longer contains allow-listed ${token}: remove it from the allow-list`);
      }
    }
  });

  it('has no inline pixel width, height or font size on text-bearing elements', () => {
    const offenders = [];
    for (const file of listSourceFiles(SRC_DIR).filter((f) => f.endsWith('.tsx'))) {
      const rel = file.slice(SRC_DIR.length + 1);
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(/\b(width|height|minWidth|maxWidth|minHeight|maxHeight|fontSize)\s*:\s*'(\d+(?:\.\d+)?)px'/g)) {
        offenders.push(`${rel}: ${m[0]}`);
      }
    }
    assert.deepEqual(offenders, []);
  });

  it('sidebar widths stay fixed on purpose', () => {
    const app = read('App.tsx');
    assert.ok(app.includes('w-[256px]') && app.includes('w-[64px]'));
  });
});

describe('table primary content is not set in 11px micro text', () => {
  it('main data tables use text-sm bodies', () => {
    assert.ok(read('views/products/ProductsTable.tsx').includes('<table className="w-full text-right border-collapse text-sm select-none">'));
    assert.ok(read('views/purchases/ShortagesTab.tsx').includes('<table className="w-full text-right text-sm">'));
    assert.equal(read('views/DashboardView.tsx').split('<table className="w-full text-right text-sm">').length - 1, 2);
  });

  it('dates, amounts and names in table cells are at least text-xs', () => {
    const cells = [
      ['components/DataQualityAuditModal.tsx', '<td className="py-3 px-4 text-micro font-mono tabular-nums">'],
      ['components/StockMovementsModal.tsx', '<td className="py-2.5 px-3 font-mono text-micro text-ink dark:text-ink-dark whitespace-nowrap">'],
      ['components/ExpiryReturnsModal.tsx', '<td className="p-3 font-mono text-ink-muted dark:text-ink-dark-muted text-micro">{parseDateToLocalDateStr'],
      ['components/PriceHistoryModal.tsx', '<td className="py-2.5 px-3 text-ink-muted dark:text-ink-dark-muted font-mono text-micro whitespace-nowrap">'],
      ['views/customers/CustomerStatementModal.tsx', '<td className="px-3 text-ink-muted dark:text-ink-dark-muted text-micro font-mono">'],
      ['views/customers/PatientProfileModal.tsx', 'text-center text-ink-muted dark:text-ink-dark-muted font-mono text-micro">'],
      ['views/CustomersView.tsx', '<td className="px-3 hidden xl:table-cell text-ink-muted dark:text-ink-dark-muted text-micro tabular-nums">'],
      ['views/purchases/ShortagesTab.tsx', '<td className="px-3 py-2.5 text-center text-micro text-ink-muted dark:text-ink-dark-muted font-mono whitespace-nowrap">'],
    ];
    for (const [file, micro] of cells) assert.ok(!read(file).includes(micro), `${file} still sets a primary cell in text-micro`);
  });
});
