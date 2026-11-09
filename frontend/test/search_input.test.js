import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const SRC_DIR = fileURLToPath(new URL('../src/', import.meta.url));
const BUILD_DIR = fileURLToPath(new URL('../node_modules/.tmp/search_input_test/', import.meta.url));
const STYLES_URL = new URL('../src/utils/buttonStyles.ts', import.meta.url).href;
const read = (rel) => readFileSync(`${SRC_DIR}${rel}`, 'utf8').replace(/\r\n/g, '\n');

const HEX = /#[0-9a-fA-F]{3,8}\b/;
const PALETTE = /(?:^|[:\-!])(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/;
const EMOJI = /\p{Extended_Pictographic}/u;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = `${dir}${name}`;
    if (statSync(full).isDirectory()) walk(`${full}/`, out);
    else if (full.endsWith('.tsx')) out.push(full.slice(SRC_DIR.length));
  }
  return out;
}

const ZONE = walk(SRC_DIR).filter((f) => f !== 'components/SearchInput.tsx');

describe('SearchInput component contract', () => {
  let SearchInput;

  before(async () => {
    mkdirSync(BUILD_DIR, { recursive: true });
    const compile = (rel) =>
      ts.transpileModule(read(rel), {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
      }).outputText;
    writeFileSync(`${BUILD_DIR}AppButton.mjs`, compile('components/AppButton.tsx').replace('../utils/buttonStyles.ts', STYLES_URL));
    const out = compile('components/SearchInput.tsx').replace("'./AppButton'", `'${pathToFileURL(`${BUILD_DIR}AppButton.mjs`).href}'`);
    writeFileSync(`${BUILD_DIR}SearchInput.mjs`, out);
    ({ SearchInput } = await import(`${pathToFileURL(`${BUILD_DIR}SearchInput.mjs`).href}?t=${Date.now()}`));
  });

  after(() => rmSync(BUILD_DIR, { recursive: true, force: true }));

  const html = (props) => renderToStaticMarkup(createElement(SearchInput, { value: '', onChange: () => {}, ariaLabel: 'بحث', ...props }));
  const outerClasses = (markup) => markup.match(/^<div class="([^"]*)"/)[1].split(/\s+/);
  const boxClasses = (markup) => [...markup.matchAll(/<div class="([^"]*)"/g)].map((m) => m[1]).find((c) => c.includes('border-line')).split(/\s+/);
  const searchButton = (markup) => markup.match(/<button[^>]*aria-label="بحث"[^>]*>[\s\S]*?<\/button>/)?.[0] ?? null;

  it('has two sizes: sm = h-8 / text-xs / w-3.5 icon, md = h-10 / text-sm / w-4 icon (sm by default)', () => {
    const sm = html({ size: 'sm' });
    assert.ok(boxClasses(sm).includes('h-8'));
    assert.match(sm, /<input[^>]*class="[^"]*\btext-xs\b/);
    assert.match(sm, /<svg[^>]*class="[^"]*\bw-3\.5 h-3\.5\b/);
    const md = html({ size: 'md' });
    assert.ok(boxClasses(md).includes('h-10'));
    assert.match(md, /<input[^>]*class="[^"]*\btext-sm\b/);
    assert.match(md, /<svg[^>]*class="[^"]*\bw-4 h-4\b/);
    assert.ok(boxClasses(html({})).includes('h-8'), 'sm is the default');
  });

  it('one shape: rounded-lg, surface-2 fill, line border, brand focus ring, all with dark pairs', () => {
    for (const size of ['sm', 'md']) {
      const classes = boxClasses(html({ size }));
      for (const c of [
        'rounded-lg',
        'border',
        'border-line',
        'dark:border-line-dark',
        'bg-surface-2',
        'dark:bg-surface-dark-2',
        'focus-within:border-brand',
        'dark:focus-within:border-brand-bright',
        'focus-within:ring-2',
        'focus-within:ring-brand/20',
        'dark:focus-within:ring-brand-bright/30',
      ]) {
        assert.ok(classes.includes(c), `${size}: ${c}`);
      }
      assert.ok(!classes.includes('rounded-xl'));
    }
  });

  it('input and icon text colours have bright dark pairs', () => {
    const out = html({ placeholder: 'ابحث' });
    assert.match(out, /<input[^>]*class="[^"]*\btext-ink dark:text-ink-dark\b/);
    assert.match(out, /placeholder:text-ink-muted dark:placeholder:text-ink-dark-muted/);
    assert.match(out, /<svg[^>]*class="[^"]*text-ink-muted dark:text-ink-dark-muted/);
  });

  it('is RTL-correct: the icon is the first child (inline start) and only logical padding/margin is used', () => {
    const out = html({ value: 'x' });
    assert.ok(out.indexOf('<svg') < out.indexOf('<input'), 'search icon before the input in DOM order = right side in RTL');
    const classes = out.match(/class="([^"]*)"/g).join(' ').replace(/"/g, '').split(/\s+/);
    assert.ok(classes.includes('ps-2.5') || classes.includes('ps-3'));
    assert.ok(!classes.some((c) => /^-?(pl|pr|ml|mr|left|right)-/.test(c)), 'no physical left/right utilities');
  });

  it('shows the clear button only for a non-empty value, with an accessible name', () => {
    assert.ok(!html({ value: '', searchButton: false }).includes('<button'));
    const filled = html({ value: 'سكر' });
    assert.match(filled, /<button[^>]*aria-label="مسح نص البحث"/);
    assert.match(filled, /<svg/);
    assert.ok(!html({ value: 'سكر', disabled: true }).includes('<button'), 'a disabled box has nothing to clear or submit');
  });

  it('puts the accessible name, placeholder and text type on the input; autofill is off by default', () => {
    const out = html({ ariaLabel: 'بحث في العملاء', placeholder: 'ابحث بالاسم' });
    assert.match(out, /<input[^>]*type="text"/);
    assert.match(out, /aria-label="بحث في العملاء"/);
    assert.match(out, /placeholder="ابحث بالاسم"/);
    assert.match(out, /autoComplete="off"|autocomplete="off"/);
  });

  it('className is layout only (default w-full) and trailing renders after the clear button', () => {
    for (const searchButtonProp of [true, false]) {
      assert.ok(outerClasses(html({ searchButton: searchButtonProp })).includes('w-full'));
      const custom = outerClasses(html({ className: 'flex-1 max-w-sm', searchButton: searchButtonProp }));
      assert.ok(custom.includes('flex-1') && custom.includes('max-w-sm') && !custom.includes('w-full'));
    }
    const out = html({ value: 'x', trailing: createElement('span', { id: 'extra' }, 'ملحق') });
    assert.ok(out.indexOf('aria-label="مسح نص البحث"') < out.indexOf('id="extra"'));
  });

  it('uses theme tokens only: no hex, no default palette, no emoji', () => {
    for (const size of ['sm', 'md']) {
      const out = html({ size, value: 'x', placeholder: 'بحث' });
      assert.ok(!HEX.test(out) && !PALETTE.test(out) && !EMOJI.test(out));
    }
    const source = read('components/SearchInput.tsx');
    assert.ok(!HEX.test(source) && !PALETTE.test(source) && !EMOJI.test(source));
  });

  it('renders a visible primary search button by default: label "بحث", Search icon, the same height as the box', () => {
    for (const [size, height, icon] of [['sm', 'h-8', 'w-3.5 h-3.5'], ['md', 'h-10', 'w-4 h-4']]) {
      const out = html({ size });
      const button = searchButton(out);
      assert.ok(button, `${size}: button rendered by default`);
      assert.match(button, /type="button"/);
      assert.match(button, /<svg[^>]*class="[^"]*\bw-/);
      assert.ok(button.includes(`${icon}`), `${size}: icon size ${icon}`);
      assert.match(button, />بحث<\/button>$/);
      assert.match(button, new RegExp(`class="[^"]*\\b${height}\\b`), `${size}: button ${height}`);
      assert.match(button, /\bbg-brand\b/);
      assert.match(button, /\bdark:/);
      assert.ok(!/\sdisabled(=|\s|>)/.test(button), 'never disabled');
      assert.ok(boxClasses(out).includes(height) && boxClasses(out).includes('flex-1'), `${size}: the box and the button share one height`);
    }
    assert.ok(outerClasses(html({})).includes('flex') && outerClasses(html({})).includes('items-center'), 'box + button are one joined row');
    assert.ok(html({}).indexOf('<input') < html({}).indexOf('aria-label="بحث"'), 'the button sits at the inline end (after the input)');
  });

  it('searchButtonLabel renames the button; searchButton={false} renders the bare box; a disabled box has no button', () => {
    const renamed = html({ searchButtonLabel: 'ابحث الآن' });
    assert.match(renamed, /<button[^>]*aria-label="ابحث الآن"[^>]*>[\s\S]*?ابحث الآن<\/button>/);
    assert.ok(!html({ searchButton: false }).includes('<button'));
    assert.ok(boxClasses(html({ searchButton: false })).includes('w-full'), 'the bare box keeps the caller layout class');
    assert.ok(!html({ disabled: true }).includes('<button'));
  });

  it('the clear button stays inside the box and never overlaps the search button', () => {
    const out = html({ value: 'سكر' });
    const box = out.slice(out.indexOf('<div class="relative'), out.lastIndexOf('<button'));
    assert.ok(box.includes('aria-label="مسح نص البحث"'), 'clear inside the box');
    assert.ok(out.indexOf('aria-label="مسح نص البحث"') < out.lastIndexOf('aria-label="بحث"'));
  });

  it('the search button does what Enter does: onSubmit(value); without onSubmit it focuses and selects the input', () => {
    const source = read('components/SearchInput.tsx');
    assert.match(source, /const handleSearchClick = \(\) => \{\s*if \(onSubmit\) \{\s*onSubmit\(value\);\s*return;\s*\}\s*inputRef\.current\?\.focus\(\);\s*inputRef\.current\?\.select\(\);\s*\};/);
    assert.match(source, /<AppButton variant="primary" size=\{size\} icon=\{Search\} onClick=\{handleSearchClick\} aria-label=\{searchButtonLabel\}/);
    assert.match(source, /searchButton = true,\s*searchButtonLabel = 'بحث',/);
  });

  it('Enter applies through onSubmit (not while an IME composes) and the clear button refocuses the input', () => {
    const source = read('components/SearchInput.tsx');
    assert.match(source, /event\.key !== 'Enter' \|\| !onSubmit \|\| event\.nativeEvent\.isComposing/);
    assert.match(source, /onSubmit\(value\)/);
    assert.match(source, /\(onClear \?\? \(\(\) => onChange\(''\)\)\)\(\);\s*inputRef\.current\?\.focus\(\);/);
    assert.match(source, /forwardRef<HTMLInputElement, SearchInputProps>/);
  });
});

describe('every search box in the app is the shared SearchInput', () => {
  it('no file keeps a hand-rolled search icon next to a text input', () => {
    const offenders = [];
    for (const f of ZONE) {
      const lines = read(f).split('\n');
      lines.forEach((line, i) => {
        if (!line.includes('<Search ')) return;
        const near = lines.slice(Math.max(0, i - 8), i + 9).join('\n');
        if (/<input\b/.test(near)) offenders.push(`${f}:${i + 1}`);
      });
    }
    assert.deepEqual(offenders, []);
  });

  it('no raw <input> carries a search placeholder', () => {
    const offenders = [];
    for (const f of ZONE) {
      for (const m of read(f).matchAll(/<input\b[^>]*?placeholder=(?:"[^"]*"|\{[^}]*\})[^>]*>/gs)) {
        if (/(بحث|ابحث|دور في|دور برقم)/.test(m[0])) offenders.push(`${f}: ${m[0].slice(0, 80)}`);
      }
    }
    assert.deepEqual(offenders, []);
  });

  it('every <SearchInput> names itself (ariaLabel) and picks one of the two sizes', () => {
    let count = 0;
    for (const f of ZONE) {
      for (const m of read(f).matchAll(/<SearchInput\b([\s\S]*?)\n\s*\/?>/g)) {
        count += 1;
        assert.match(m[1], /\sariaLabel=/, `${f}: ${m[0].slice(0, 60)}`);
        assert.match(m[1], /\ssize="(sm|md)"/, `${f}: ${m[0].slice(0, 60)}`);
      }
    }
    assert.ok(count >= 45, `expected the whole app to be converted, found ${count}`);
  });

  it('every <SearchInput> keeps the built-in search button unless it is in the documented opt-out list', () => {
    const OPT_OUT = {
      'components/CustomSelect.tsx': 'inner option filter of a dropdown panel',
      'views/pos/PosCategoriesPanel.tsx': 'narrow POS quick filter',
      'views/pos/PosCatalogPanel.tsx': 'narrow POS quick filter',
      'components/HelpCenterModal.tsx': 'in-modal live search, tight header',
      'components/KeyboardShortcutsModal.tsx': 'in-modal live search, tight header',
      'components/DrugReferenceImportModal.tsx': 'the drug-guide lookup already has its own بحث button',
      'components/ReturnModal.tsx': 'the invoice lookup already has its own هات الفاتورة button',
      'components/BarcodeLabelModal.tsx': 'scanner typeahead: the results list closes on blur',
      'components/QuickShortageModal.tsx': 'name field with live suggestions, not a search box',
      'components/QuickFastItemModal.tsx': 'labelled form field with a suggestion list',
      'views/pos/InsurancePrescriptionModal.tsx': 'insurance card number field',
      'views/purchases/NewPurchaseTab.tsx': 'scanner entry line that adds items on Enter',
    };
    const found = new Set();
    let total = 0;
    for (const f of ZONE) {
      for (const m of read(f).matchAll(/<SearchInput\b([\s\S]*?)\n\s*\/>/g)) {
        total += 1;
        if (/\ssearchButton=\{false\}/.test(m[1])) found.add(f);
        assert.doesNotMatch(m[1], /\ssearchButton=\{(?!false\})/, `${f}: only searchButton={false} is allowed at call sites`);
      }
    }
    assert.deepEqual([...found].sort(), Object.keys(OPT_OUT).sort());
    assert.ok(total - found.size >= 30, 'most search boxes keep the button');
  });

  it('each toolbar uses the height of its neighbours (sm next to h-8 controls, md next to h-10 controls)', () => {
    const sizeOf = (file) => [...read(file).matchAll(/<SearchInput[\s\S]*?size="(sm|md)"/g)].map((m) => m[1]);
    const SM = ['views/SalesHistoryView.tsx', 'views/CustomersView.tsx', 'views/AuditLogView.tsx', 'views/purchases/ShortagesTab.tsx', 'views/wallets/WalletsView.tsx'];
    const MD = [
      'views/ProductsView.tsx',
      'views/products/StockMovementsTab.tsx',
      'views/products/BatchesTab.tsx',
      'views/purchases/SuppliersTab.tsx',
      'views/purchases/PurchasesInvoicesTab.tsx',
      'views/insurance/InsuranceContractsView.tsx',
    ];
    for (const f of SM) assert.deepEqual(sizeOf(f), ['sm'], f);
    for (const f of MD) assert.deepEqual(sizeOf(f), ['md'], f);
    assert.deepEqual(sizeOf('views/epay/EpayView.tsx'), ['sm', 'sm'], 'funding and history filter bars sit next to h-8 selects');
  });

  it('wallets, epay and insurance keep their live filters: plain state setters, no submit button, no leftover Search icon import', () => {
    const wallets = read('views/wallets/WalletsView.tsx');
    assert.match(wallets, /<SearchInput\s+size="sm"\s+value=\{historySearch\}\s+onChange=\{setHistorySearch\}/);
    const epay = read('views/epay/EpayView.tsx');
    assert.match(epay, /<SearchInput\s+size="sm"\s+value=\{fundingSearch\}\s+onChange=\{setFundingSearch\}/);
    assert.match(epay, /<SearchInput\s+size="sm"\s+value=\{historySearch\}\s+onChange=\{setHistorySearch\}/);
    const insurance = read('views/insurance/InsuranceContractsView.tsx');
    assert.match(insurance, /<SearchInput\s+size="md"\s+value=\{memberSearchQuery\}\s+onChange=\{setMemberSearchQuery\}/);
    for (const [name, source] of [['wallets', wallets], ['epay', epay], ['insurance', insurance]]) {
      assert.doesNotMatch(source, /^\s+Search,?\s*$/m, `${name}: unused lucide Search import`);
      assert.match(source, /import \{ SearchInput \} from '\.\.\/\.\.\/components\/SearchInput';/, name);
    }
  });

  it('documented specials are the only list-less hand-made boxes: the POS barcode bar keeps its h-11 shell next to the lg buttons', () => {
    const bar = read('views/pos/PosBarcodeBar.tsx');
    assert.match(bar, /relative flex-1 h-11 flex items-center/);
    assert.ok(!bar.includes('<SearchInput'));
  });
});

describe('catalog search (كتالوج الأصناف والأسعار)', () => {
  const view = read('views/ProductsView.tsx');

  it('is a sibling of the other toolbars: SearchInput md with its built-in button (no hand-rolled submit), compact stock tabs and a lg (h-10) category select', () => {
    assert.match(view, /<SearchInput\s+size="md"\s+value=\{searchDraft\}/);
    assert.doesNotMatch(view, /searchButton=\{false\}/);
    assert.doesNotMatch(view, /<AppButton[^>]*type="submit"[^>]*>\s*بحث\s*<\/AppButton>/);
    assert.doesNotMatch(view, /<form onSubmit=\{handleSearch\}/);
    assert.match(view, /<SegmentedTabs\s+size="compact"/);
    assert.match(view, /size="lg"\s+searchable=\{categories\.length > 7\}/);
  });

  it('applies live after a short pause and immediately on Enter (barcode scanners end with Enter)', () => {
    assert.match(view, /const debouncedSearchDraft = useDebouncedValue\(searchDraft\);/);
    assert.match(view, /setSearchQuery\(debouncedSearchDraft\);\s*setCurrentPage\(1\);/);
    assert.match(view, /onSubmit=\{applySearch\}/);
    assert.match(view, /const applySearch = \(value: string\) => \{\s*setCurrentPage\(1\);\s*if \(value !== searchQuery\) \{\s*setSearchQuery\(value\);\s*return;\s*\}\s*void loadProducts\(value, 1, pageSize\);/);
  });

  it('keeps the query state, the clear handler, the chips row and the digit normalisation', () => {
    assert.match(view, /const \[searchQuery, setSearchQuery\] = useState\(''\);/);
    assert.match(view, /onClear=\{clearSearchFilter\}/);
    assert.match(view, /onChange=\{\(value\) => setSearchDraft\(normalizeArabicNumerals\(value\)\)\}/);
    assert.match(view, /الفلاتر المفعّلة: لا يوجد/);
    assert.match(view, /setSearchQuery\(reset\.searchQuery\);/);
    assert.match(view, /useEffect\(\(\) => \{\s*setSearchDraft\(searchQuery\);\s*\}, \[searchQuery\]\);/);
  });
});

describe('server-backed list filters debounce and keep refreshes consistent', () => {
  it('useDebouncedValue waits SEARCH_DEBOUNCE_MS (280 ms) and clears its timer', () => {
    const hook = read('utils/useDebouncedValue.ts');
    assert.match(hook, /export const SEARCH_DEBOUNCE_MS = 280;/);
    assert.match(hook, /setTimeout\(\(\) => setDebounced\(value\), delayMs\)/);
    assert.match(hook, /return \(\) => clearTimeout\(timer\)/);
  });

  it('customers search is live: debounced apply, Enter applies at once, refreshes honour the applied text', () => {
    const view = read('views/CustomersView.tsx');
    assert.doesNotMatch(view, /handleSearch\b/);
    assert.match(view, /const debouncedSearchQuery = useDebouncedValue\(searchQuery\);/);
    assert.match(view, /onSubmit=\{applyCustomerSearch\}/);
    assert.match(view, /const query = appliedQueryRef\.current;\s*const data = query\.trim\(\)\s*\? await invoke<Customer\[\]>\('customers:search', \{ query \}\)\s*: await invoke<Customer\[\]>\('customers:getAll', \{ limit: 200 \}\);/);
    assert.doesNotMatch(view, /<AppButton type="submit"[^>]*>\s*بحث\s*<\/AppButton>/);
  });
});
