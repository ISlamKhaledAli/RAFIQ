import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const read = (rel) => readFileSync(join(SRC, rel), 'utf8').replace(/\r\n/g, '\n');

const listTsx = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return listTsx(full);
    return full.endsWith('.tsx') ? [full] : [];
  });
const allTsx = listTsx(SRC).map((f) => ({ file: f, src: readFileSync(f, 'utf8').replace(/\r\n/g, '\n') }));

const css = read('index.css');
const guard = '@media screen and (prefers-reduced-motion: no-preference) {';
const motionCss = css.slice(css.indexOf(guard));

// Runtime audit (motion on, 1366x768, medium/slide) found these switches still unanimated or jumping on purpose.
// Each entry names the file and a needle that proves the site still exists, so a deleted site cannot keep a stale pass.
const ALLOWED = [
  { id: 'pos-order-mode-bar', flags: ['HEIGHT_JUMP'], file: 'views/pos/PosOrderModeBar.tsx', needle: 'px-3 py-1.5 rounded-lg text-xs font-black', reason: 'POS hot cashier path: the table / delivery row appears instantly so the cart never moves under a scanning hand' },
  { id: 'pos-catalog-collapse', flags: ['NO_ENTRANCE', 'HEIGHT_JUMP'], file: 'views/pos/PosCatalogPanel.tsx', needle: 'طي أصناف المحل', reason: 'POS hot cashier path: collapsing the catalog is instant by design' },
  { id: 'pos-cash-amount-status', flags: ['NO_ENTRANCE'], file: 'components/payment/CashPaymentSection.tsx', needle: 'receivedPiasters', reason: 'typing and preset buttons update the change / short card on every keystroke; an entrance would add latency to the cashier path' },
  { id: 'text-size-reflow', flags: ['HEIGHT_JUMP', 'DURATION_MISMATCH'], file: 'components/TextScaleControl.tsx', needle: 'TEXT_SCALE_LEVELS', reason: 'the font-size control rescales every rem at once; header buttons only run their hover transition-all on the new size' },
  { id: 'switch-knob', flags: ['DURATION_MISMATCH'], file: 'components/ToggleSwitch.tsx', needle: 'transition-all duration-200', reason: 'the knob is a 200ms control affordance, not content motion' },
  { id: 'progress-bar', flags: ['DURATION_MISMATCH'], file: 'components/ReadinessCheckModal.tsx', needle: 'duration-700', reason: 'a progress bar fills over a deliberately slow 700ms' },
  { id: 'loading-dim', flags: ['DURATION_MISMATCH'], file: 'components/BackupManager.tsx', needle: 'transition-opacity', reason: 'a table dims while it reloads; a 150ms dim is a loading hint, not an entrance' },
  { id: 'hover-icon-chip', flags: ['DURATION_MISMATCH'], file: 'components/DailyClosingModal.tsx', needle: 'سجل الورديات المقفولة', reason: 'row icon chips scale on hover (200ms), a pointer affordance' },
  { id: 'sales-history-filters', flags: ['NO_ENTRANCE'], file: 'views/SalesHistoryView.tsx', needle: 'فواتير ملغية', reason: 'filter chips refresh a result list; list rows and empty states are never animated one by one (scan path, up to hundreds of rows)' },
  { id: 'stock-movements-filters', flags: ['NO_ENTRANCE'], file: 'views/products/StockMovementsTab.tsx', needle: 'مرتجعات بضاعة', reason: 'movement type chips refresh a result table' },
  { id: 'wallets-history-empty', flags: ['NO_ENTRANCE'], file: 'views/wallets/WalletsView.tsx', needle: 'لا توجد عمليات مسج', reason: 'history filters swap a list for its empty state' },
  { id: 'epay-history-empty', flags: ['NO_ENTRANCE'], file: 'views/epay/EpayView.tsx', needle: 'لا توجد عمليات دفع', reason: 'history filters swap a list for its empty state' },
  { id: 'hardware-filter-cards', flags: ['HEIGHT_JUMP'], file: 'components/CertifiedHardwareModal.tsx', needle: 'filteredDevices', reason: 'the modal has a fixed height; only the device cards inside the scroll area appear and disappear' },
  { id: 'variant-size-chips', flags: ['HEIGHT_JUMP'], file: 'components/ProductVariantMatrixModal.tsx', needle: 'المقاسات المتاحة', reason: 'adding or removing a size chip is data entry, not a tab switch' },
  { id: 'async-result-cards', flags: ['NO_ENTRANCE'], file: 'components/LicenseModal.tsx', needle: 'فحص صلاحية الترخيص', reason: 'a one-off result card (license check, backup, support bundle) appears when its request returns' },
  { id: 'help-support-bundle', flags: ['NO_ENTRANCE'], file: 'components/HelpCenterModal.tsx', needle: 'إنشاء حزمة الدعم', reason: 'a one-off result card appears when the bundle is created' },
  { id: 'dashboard-static-toolbars', flags: ['NO_ENTRANCE'], file: 'views/ProductsView.tsx', needle: 'motion-static', reason: 'shared page headers and toolbars are marked motion-static on purpose; only the content under them moves' },
  { id: 'root-avatar-gallery', flags: ['NO_ENTRANCE'], file: 'views/root/SignatureImageField.tsx', needle: 'إرجاع الافتراضية', reason: 'root-only image list refresh' },
];

describe('motion consistency: shared css rules', () => {
  it('fades every translucent dialog backdrop with the shared duration, scoped and inside the reduced-motion guard', () => {
    assert.ok(css.includes(guard), 'reduced-motion guard present');
    const m = /html\[data-motion="on"\] \.fixed\.inset-0:is\(([^)]*)\)([^{]*)\{([^}]*)\}/.exec(motionCss);
    assert.ok(m, 'backdrop rule exists inside the guard');
    assert.ok(m[1].includes('[class*="bg-black/"]') && m[1].includes('[class*="bg-ink/"]'), 'matches the translucent black / ink fills');
    assert.ok(m[2].includes(':not(.motion-static)') && m[2].includes(':not([class*="animate-"])'), 'opt-out and own-animation exclusions');
    assert.match(m[3], /animation:\s*rq-modal-backdrop-in var\(--rq-motion-duration, 240ms\) ease-out;/);
  });

  it('never selects app shells, lock screens or click-catchers (no translucent fill class)', () => {
    const shells = allTsx.flatMap(({ file, src }) =>
      [...src.matchAll(/className="([^"]*\bfixed inset-0\b[^"]*)"/g)].map((x) => ({ file, cls: x[1] })));
    assert.ok(shells.length > 60, `overlay shells found: ${shells.length}`);
    const matched = shells.filter((s) => /\bbg-(black|ink)\//.test(s.cls));
    const unmatched = shells.filter((s) => !/\bbg-(black|ink)\//.test(s.cls));
    assert.ok(matched.length > 60);
    for (const s of unmatched) {
      assert.ok(!/bg-(black|ink)\/\d/.test(s.cls), s.file);
    }
    // the splash / lock / first-run shells have an opaque canvas or no fill, so the rule cannot reach them
    assert.ok(unmatched.some((s) => s.cls.includes('z-[9999]')), 'full-screen shells exist and stay unmatched');
  });

  it('pre-existing animate utilities follow the variables for duration and easing (no hard-coded milliseconds)', () => {
    const m = /html\[data-motion="on"\] :is\(([^)]*)\) \{([^}]*)\}/.exec(motionCss);
    assert.ok(m, 'unified rule exists');
    for (const cls of ['.animate-in', '.animate-fade-in', '.animate-fadeIn']) assert.ok(m[1].includes(cls), cls);
    assert.match(m[2], /animation-duration:\s*var\(--rq-motion-duration, 240ms\);/);
    assert.match(m[2], /animation-timing-function:\s*ease-out;/);
    const withoutDefs = motionCss
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/--rq-motion-duration:\s*\d+ms;/g, '')
      .replace(/var\(--rq-motion-duration, \d+ms\)/g, 'VAR');
    assert.ok(!/\d+ms/.test(withoutDefs), 'the only milliseconds in the motion block are the three level definitions and the variable fallback');
  });

  it('every animate-* utility and slide-in-from-* variant in use is covered by the motion block', () => {
    const used = new Set();
    const slides = new Set();
    for (const { src } of allTsx) {
      for (const m of src.matchAll(/\banimate-[a-zA-Z-]+/g)) used.add(m[0]);
      for (const m of src.matchAll(/\bslide-in-from-[a-z0-9-]+/g)) slides.add(m[0]);
    }
    const known = new Set(['animate-in', 'animate-fade-in', 'animate-fadeIn', 'animate-scale-up', 'animate-spin', 'animate-pulse', 'animate-bounce', 'animate-ping']);
    for (const u of used) assert.ok(known.has(u), `new animate utility ${u} needs a motion rule (or a documented exception here)`);
    for (const u of ['animate-in', 'animate-fade-in', 'animate-fadeIn', 'animate-scale-up']) assert.ok(motionCss.includes(u.replace('animate-', '.animate-')), u);
    assert.ok(slides.size >= 5);
    for (const s of slides) assert.ok(motionCss.includes(`.${s}`), `${s} is used but has no strength rule in the motion block`);
  });

  it('chevrons, side panels and the popups with no animation of their own share the duration', () => {
    assert.match(motionCss, /html\[data-motion="on"\] svg\.transition-transform \{\s*transition-duration: var\(--rq-motion-duration, 240ms\);\s*transition-timing-function: ease-out;/);
    assert.match(motionCss, /html\[data-motion="on"\] \.motion-resize \{\s*transition-duration: var\(--rq-motion-duration, 240ms\);/);
    assert.match(motionCss, /html\[data-motion="on"\] \.motion-popup \{\s*animation: rq-popup-in var\(--rq-motion-duration, 240ms\) ease-out;/);
    assert.match(read('components/HeaderMenu.tsx'), /motion-popup absolute top-full/);
    assert.match(read('views/pos/PosCategoriesPanel.tsx'), /transition-all duration-150 motion-resize/);
  });

  it('a legacy animate-in child of a tab container takes the same entrance as its siblings, and a fade-less popup still fades', () => {
    assert.match(motionCss, /\[data-motion-phase="a"\] > \.animate-in:not\(\.motion-static\):not\(\.absolute\):not\(\.fixed\) \{\s*animation: rq-panel-in-a/);
    assert.match(motionCss, /\[data-motion-phase="b"\] > \.animate-in:not\(\.motion-static\):not\(\.absolute\):not\(\.fixed\) \{\s*animation: rq-panel-in-b/);
    assert.match(motionCss, /\.animate-in:not\(\.fade-in\) \{\s*--tw-enter-opacity: 0;/);
  });
});

describe('motion consistency: the height glide and the entrance run as long as each other', () => {
  const mh = read('components/MotionHeight.tsx');

  it('MotionHeight reads the shared duration variable and measures layout height, not the scaled bounding rect', () => {
    assert.match(mh, /getPropertyValue\('--rq-motion-duration'\)/);
    assert.ok(!/getBoundingClientRect/.test(mh), 'a running dialog entrance scales the rect and would start the glide from a wrong height');
    assert.ok((mh.match(/offsetHeight/g) ?? []).length >= 4);
  });
});

describe('motion consistency: payment-method and source switches', () => {
  const sites = [
    ['views/purchases/NewPurchaseTab.tsx', 'sourcePanel'],
    ['views/purchases/SupplierPaymentModal.tsx', 'sourcePanel'],
    ['views/customers/CustomerPaymentModal.tsx', 'methodPanel'],
    ['views/wallets/WalletsView.tsx', 'fundingPanel'],
    ['components/payment/CustomerPicker.tsx', 'motionPanel'],
  ];

  for (const [file, name] of sites) {
    it(`${file} drives its switch with useMotionPanel`, () => {
      const src = read(file);
      assert.match(src, /import \{ useMotionPanel \} from '[./]+\/hooks\/useMotionPanel'/);
      assert.match(src, new RegExp(`const ${name} = useMotionPanel\\(`));
      assert.match(src, new RegExp(`\\{\\.\\.\\.${name}\\}`));
    });
  }

  it('cash / instapay / vodafone / external notices share one container and none keeps its own duration class', () => {
    for (const file of ['views/purchases/NewPurchaseTab.tsx', 'views/purchases/SupplierPaymentModal.tsx']) {
      const src = read(file);
      const start = src.indexOf('{...sourcePanel}');
      const block = src.slice(start, start + 6000);
      for (const source of ["'cash_drawer'", "'instapay'", "'vodafone_cash'", "'external_cash'"]) {
        assert.ok(block.includes(`paymentSource === ${source}`), `${file} ${source} inside the shared container`);
      }
      assert.ok(!/animate-in[^"'`]*duration-\d+/.test(block), `${file}: duration-* is dead on animate-in and must not linger`);
    }
    for (const file of ['views/customers/CustomerPaymentModal.tsx', 'components/DigitalPaymentModal.tsx']) {
      assert.ok(!/animate-in[^"'`]*duration-\d+/.test(read(file)), `${file}: no leftover duration-* on an animate-in element`);
    }
  });

  it('the POS payment modals keep the hot cashier path untouched: no panel or height wrapper around the amount, keypad, totals or confirm button', () => {
    for (const file of ['components/PaymentModal.tsx', 'components/DigitalPaymentModal.tsx', 'components/payment/CashPaymentSection.tsx', 'components/payment/PaymentSummary.tsx']) {
      const src = read(file);
      assert.ok(!/useMotionPanel|MotionHeight/.test(src), `${file} must not wrap the cashier path`);
    }
    const picker = read('components/payment/CustomerPicker.tsx');
    assert.match(picker, /<section\s+\{\.\.\.motionPanel\}\s+aria-label="الزبون"/);
    assert.ok(!/AppButton[^>]*handleConfirm|onConfirmPayment/.test(picker));
    assert.match(read('components/PaymentModal.tsx'), /motion-modal-backdrop fixed inset-0/);
  });

  it('every element carrying the phase attributes or MotionHeight in the files this audit changed has no transition-all / duration-* that would fight the glide', () => {
    const marker = /\{\.\.\.(motionPanel|sourcePanel|methodPanel|fundingPanel|listPanel|gridPanel)\}|<MotionHeight/;
    const changed = new Set([
      'components/KeyboardShortcutsModal.tsx', 'components/payment/CustomerPicker.tsx', 'components/CategoryIconPickerModal.tsx',
      'components/CertifiedHardwareModal.tsx', 'components/SearchBenchmarkModal.tsx', 'components/DatabaseRecoveryModal.tsx',
      'views/purchases/NewPurchaseTab.tsx', 'views/purchases/SupplierPaymentModal.tsx', 'views/purchases/SupplierStatementModal.tsx',
      'views/customers/CustomerPaymentModal.tsx', 'views/wallets/WalletsView.tsx',
    ]);
    let checked = 0;
    for (const { file, src } of allTsx) {
      if (!changed.has(file.slice(SRC.length).split('\\').join('/'))) continue;
      for (const line of src.split('\n')) {
        if (!marker.test(line)) continue;
        checked++;
        assert.ok(!/transition-all|\bduration-\d+/.test(line), `${file}: ${line.trim().slice(0, 120)}`);
      }
    }
    assert.ok(checked >= 11, `lines checked: ${checked}`);
  });

  it('modals that resized instantly now glide through MotionHeight', () => {
    const sites2 = [
      ['components/KeyboardShortcutsModal.tsx', 'activeCategory'],
      ['views/purchases/SupplierStatementModal.tsx', 'describeDateFilter(dateFilter)'],
      ['components/CategoryIconPickerModal.tsx', 'selectedTabId'],
      ['components/CertifiedHardwareModal.tsx', 'activeCategory'],
    ];
    for (const [file, key] of sites2) {
      const src = read(file);
      assert.match(src, /useMotionPanel\(/, file);
      assert.ok(src.includes(key), `${file} keys the panel by ${key}`);
    }
    for (const file of ['components/KeyboardShortcutsModal.tsx', 'views/purchases/SupplierStatementModal.tsx', 'components/CategoryIconPickerModal.tsx', 'components/SearchBenchmarkModal.tsx', 'components/DatabaseRecoveryModal.tsx']) {
      assert.match(read(file), /<MotionHeight className="[^"]*overflow-y-auto/, file);
    }
  });
});

describe('motion consistency: allow-list of switches that stay instant on purpose', () => {
  it('every entry is documented, uses a known flag and still points at an existing site', () => {
    const known = new Set(['NO_ENTRANCE', 'NO_BACKDROP_FADE', 'HEIGHT_JUMP', 'DURATION_MISMATCH', 'EASING_MISMATCH', 'STYLE_MISMATCH']);
    const ids = new Set();
    for (const a of ALLOWED) {
      assert.ok(!ids.has(a.id), `duplicate ${a.id}`);
      ids.add(a.id);
      assert.ok(a.reason.length >= 25, `${a.id} needs a real reason`);
      for (const f of a.flags) assert.ok(known.has(f), `${a.id}: ${f}`);
      assert.ok(existsSync(join(SRC, a.file)), `${a.id}: ${a.file} no longer exists, delete the entry`);
      assert.ok(read(a.file).includes(a.needle), `${a.id}: "${a.needle}" is gone from ${a.file}, delete or update the entry`);
    }
  });

  it('backdrops and easing have no exceptions: they are fixed centrally', () => {
    for (const a of ALLOWED) {
      assert.ok(!a.flags.includes('NO_BACKDROP_FADE') && !a.flags.includes('EASING_MISMATCH'), a.id);
    }
  });
});
