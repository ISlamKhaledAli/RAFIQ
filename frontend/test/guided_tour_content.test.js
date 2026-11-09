import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TOUR_STEP_DEFINITIONS, getVisibleTourSteps } from '../src/utils/tourSteps.ts';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const read = (rel) => readFileSync(SRC + rel, 'utf8').replace(/\r\n/g, '\n');

const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    const full = dir + name;
    if (statSync(full).isDirectory()) walk(full + '/', out);
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
};

// Every label the app can show. The tour's own data file is left out so a label cannot vouch for itself.
const UI_CORPUS = walk(SRC)
  .filter((f) => !f.endsWith('/utils/tourSteps.ts'))
  .map((f) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n'))
  .join('\n');

const modal = read('components/GuidedTourModal.tsx');
const stepsSource = read('utils/tourSteps.ts');
const shortcutsSource = read('components/KeyboardShortcutsModal.tsx');

const ARABIC = /[\u0600-\u06FF]/;
const GENERIC_PLACES = new Set(['القائمة الجانبية والشريط العلوي', 'الشريط العلوي', 'المزيد']);
const TECHNICAL_TOKENS = /\b(?:F\d{1,2}|Alt|Ctrl|Enter|USB|Q|Z)\b/g;

const everyone = {
  user: { id: 'u', username: 'owner', role: 'admin', isOwner: true },
  isRoot: false,
  isAdmin: true,
  hasPermission: () => true,
  isEnabled: () => true,
};

const accessFor = (user, permissions, features = []) => ({
  user,
  isRoot: false,
  isAdmin: user.role === 'admin',
  hasPermission: (p) => permissions.includes(p),
  isEnabled: (f) => features.includes(f),
});

const cashier = { id: 'c', username: 'c1', role: 'cashier', isOwner: false };
const manager = { id: 'm', username: 'm1', role: 'admin', isOwner: false };

const idsOf = (access) => getVisibleTourSteps(access).map((s) => s.id);

describe('guided tour: every step carries its content', () => {
  it('has unique ids and a title, an icon, a place and 2 to 4 short sentences each', () => {
    const ids = new Set();
    for (const step of TOUR_STEP_DEFINITIONS) {
      assert.ok(!ids.has(step.id), `duplicate ${step.id}`);
      ids.add(step.id);
      assert.ok(ARABIC.test(step.title) && step.title.length <= 40, `${step.id} title`);
      assert.ok(step.icon && new RegExp(`\\b${step.icon}\\b`).test(modal), `${step.id} icon ${step.icon} is not mapped in the modal`);
      assert.ok(ARABIC.test(step.where), `${step.id} where`);
      assert.ok(step.sentences.length >= 2 && step.sentences.length <= 4, `${step.id} sentence count`);
      for (const s of step.sentences) {
        assert.ok(ARABIC.test(s.text) && s.text.trim().endsWith('.'), `${step.id}: ${s.text}`);
        assert.ok(s.text.length <= 140, `${step.id} sentence is too long: ${s.text}`);
      }
    }
  });

  it('covers 10 to 14 steps for a user who can see everything (modules excluded)', () => {
    const base = idsOf({ ...everyone, isEnabled: () => false });
    assert.ok(base.length >= 10 && base.length <= 14, `${base.length} base steps`);
  });

  it('the icon union matches the icon map in the modal', () => {
    const union = /export type TourIconName =([\s\S]*?);/.exec(stepsSource)[1].match(/'(\w+)'/g).map((m) => m.slice(1, -1));
    const map = /const TOUR_ICONS: Record<TourIconName, LucideIcon> = \{([\s\S]*?)\};/.exec(modal)[1].match(/\w+/g);
    assert.deepEqual([...union].sort(), [...map].sort());
  });
});

describe('guided tour: text is Arabic and correct', () => {
  const texts = TOUR_STEP_DEFINITIONS.flatMap((s) => [s.title, s.where, ...s.sentences.map((x) => x.text), ...(s.shortcut ? [s.shortcut.label] : [])]);

  it('has no English words apart from key names and the technical items allowed', () => {
    for (const t of texts) {
      const rest = t.replace(TECHNICAL_TOKENS, '');
      assert.doesNotMatch(rest, /[A-Za-z]{2,}/, t);
    }
  });

  it('has no emoji', () => {
    for (const t of texts) assert.doesNotMatch(t, /\p{Extended_Pictographic}/u, t);
  });

  it('every quoted screen, button or option name exists in the app', () => {
    let checked = 0;
    for (const t of texts) {
      for (const m of t.matchAll(/«([^»]+)»/g)) {
        checked++;
        assert.ok(UI_CORPUS.includes(m[1]), `«${m[1]}» is not a label in the app`);
      }
    }
    assert.ok(checked >= 25, `labels checked: ${checked}`);
  });

  it('every place named in a step exists in the app navigation', () => {
    for (const step of TOUR_STEP_DEFINITIONS) {
      for (const raw of step.where.split(/،\s*(?:ثم\s*)?/)) {
        const place = raw.replace(/^و/, '').trim();
        if (GENERIC_PLACES.has(place)) continue;
        assert.ok(UI_CORPUS.includes(place), `${step.id}: "${place}" is not a screen name`);
      }
    }
  });

  it('every keyboard shortcut quoted by the tour is wired and listed in the shortcuts guide', () => {
    const keys = new Set();
    for (const t of texts) {
      for (const m of t.matchAll(/\bF\d{1,2}\b/g)) keys.add(m[0]);
    }
    for (const step of TOUR_STEP_DEFINITIONS) if (step.shortcut) keys.add(step.shortcut.keys);
    assert.ok(keys.size >= 7, `shortcuts quoted: ${[...keys].join(',')}`);
    for (const key of keys) assert.match(shortcutsSource, new RegExp(`key: '${key}(?:'| )`), `${key} is missing in KeyboardShortcutsModal`);
    for (const combo of ['Ctrl + Z', 'Ctrl + Q']) {
      if (texts.some((t) => t.includes(combo))) assert.ok(shortcutsSource.includes(`key: '${combo}'`), combo);
    }
    assert.ok(shortcutsSource.includes("key: 'Alt + 1'") && texts.some((t) => t.includes('Alt')));
  });

  it('keeps out the claims the old tour made that the code does not back', () => {
    const all = texts.join('\n');
    for (const gone of ['Delete', 'Space', 'مسافة', '10ms', '50,000', '100%', 'يتم حفظ', 'Excel']) {
      assert.ok(!all.includes(gone), `unsupported claim: ${gone}`);
    }
    assert.doesNotMatch(all, /ملهاش|علطول|بيفضل|عشان/);
  });
});

describe('guided tour: steps follow permissions and enabled modules', () => {
  it('a cashier with only the sale screen sees the sale steps and nothing else', () => {
    const ids = idsOf(accessFor(cashier, ['pos.access']));
    assert.deepEqual(ids, ['start', 'pos-sell', 'pos-pay']);
  });

  it('never shows a step for a screen the user cannot open', () => {
    const rules = {
      sales: 'invoices.view',
      customers: 'customers.view',
      products: 'products.view',
      purchases: 'purchases.view',
      reports: 'reports.sales',
      'pos-sell': 'pos.access',
    };
    for (const [id, permission] of Object.entries(rules)) {
      const all = Object.values(rules).filter((p) => p !== permission);
      assert.ok(!idsOf(accessFor(cashier, all)).includes(id), `${id} must need ${permission}`);
      assert.ok(idsOf(accessFor(cashier, [permission])).includes(id), `${id} appears with ${permission}`);
    }
  });

  it('module steps appear only when the module is enabled', () => {
    const perms = ['pos.access', 'insurance.claims.manage'];
    assert.ok(!idsOf(accessFor(manager, perms)).includes('pharmacy'));
    assert.ok(!idsOf(accessFor(manager, perms)).includes('cafe'));
    assert.ok(idsOf(accessFor(manager, perms, ['feature_pharmacy'])).includes('pharmacy'));
    assert.ok(idsOf(accessFor(manager, perms, ['feature_cafe_restaurant'])).includes('cafe'));
    assert.ok(!idsOf(accessFor(manager, ['customers.view'], ['feature_pharmacy', 'feature_cafe_restaurant'])).some((id) => id === 'pharmacy' || id === 'cafe'));
  });

  it('wallets and payment services need the feature as well as the permission', () => {
    assert.ok(!idsOf(accessFor(manager, ['wallets.access'])).includes('wallets-epay'));
    assert.ok(idsOf(accessFor(manager, ['wallets.access'], ['feature_digital_wallets'])).includes('wallets-epay'));
    assert.ok(idsOf(accessFor(manager, ['epay.access'], ['feature_epay_services'])).includes('wallets-epay'));
    const sentences = getVisibleTourSteps(accessFor(manager, ['epay.access'], ['feature_epay_services'])).find((s) => s.id === 'wallets-epay').sentences;
    assert.equal(sentences.length, 1, 'the wallets sentence is hidden when only payment services are open');
  });

  it('settings and backup follow the settings tabs the user may open', () => {
    const printerOnly = getVisibleTourSteps(accessFor(cashier, ['settings.printer']));
    assert.ok(!printerOnly.some((s) => s.id === 'backup'));
    const settings = printerOnly.find((s) => s.id === 'settings');
    assert.equal(settings.sentences.length, 1, 'only the printer sentence');
    assert.ok(settings.sentences[0].includes('إعدادات الطابعة والورق'));
    assert.ok(idsOf(accessFor(cashier, ['settings.backup'])).includes('backup'));
    assert.ok(!idsOf(accessFor(cashier, ['settings.backup'])).includes('settings'), 'the settings step has nothing to say to a backup-only user');
    const admin = getVisibleTourSteps(accessFor(manager, [])).find((s) => s.id === 'settings');
    assert.equal(admin.sentences.length, 3, 'an admin sees store data, policies and printer');
  });

  it('staff step follows the top bar rule and shift/closing sentences follow their own permissions', () => {
    assert.ok(!idsOf(accessFor(cashier, [])).includes('staff'));
    assert.ok(idsOf(accessFor(cashier, ['users.view'])).includes('staff'));
    assert.ok(idsOf(accessFor(manager, [])).includes('staff'));
    const onlyExpenses = getVisibleTourSteps(accessFor(cashier, ['expenses.create'])).find((s) => s.id === 'shift-closing');
    assert.equal(onlyExpenses.sentences.length, 1);
    const closing = getVisibleTourSteps(accessFor(cashier, ['reports.sales', 'reports.daily_closing'])).find((s) => s.id === 'shift-closing');
    assert.ok(closing.sentences[0].includes('تقفيل اليومية'));
    assert.ok(!idsOf(accessFor(cashier, ['reports.daily_closing'])).includes('shift-closing'), 'closing needs the reports screen too');
  });

  it('mirrors the permission checks App.tsx uses for the same screens', () => {
    const app = read('App.tsx');
    for (const key of ['pos.access', 'customers.view', 'products.view', 'purchases.view', 'invoices.view', 'reports.sales', 'wallets.access', 'epay.access', 'shifts.view', 'shifts.open', 'users.view']) {
      assert.ok(app.includes(`'${key}'`), `${key} is not an App.tsx permission`);
      assert.ok(stepsSource.includes(`'${key}'`), `${key} is not used by the tour`);
    }
    assert.ok(stepsSource.includes('getAllowedSettingsSubTabs') && stepsSource.includes('getHeaderVisibility'));
  });

  it('keeps every sentence of a reachable step out of the list when its own rule fails', () => {
    for (const step of getVisibleTourSteps(everyone)) assert.ok(step.sentences.length >= 1, step.id);
    const full = getVisibleTourSteps(everyone);
    assert.equal(full.length, TOUR_STEP_DEFINITIONS.length, 'everything is visible with every permission and module');
    assert.ok(full.length <= 16);
  });
});

describe('guided tour: layout and motion', () => {
  it('swaps steps with the shared primitives and keeps the hook order', () => {
    assert.match(modal, /import \{ useMotionPanel \} from '\.\.\/hooks\/useMotionPanel';/);
    assert.match(modal, /import MotionHeight from '\.\/MotionHeight';/);
    assert.match(modal, /const motionPanel = useMotionPanel\(String\(currentStepIndex\)\);/);
    assert.match(modal, /<MotionHeight className="[^"]*">\s*<div \{\.\.\.motionPanel\}/);
    const early = modal.indexOf('if (!isOpen) return null;');
    for (const hook of ['useAuth()', 'useFeatures()', 'useMotionPanel(', 'useMemo(', 'useModalDismiss(']) {
      const at = modal.indexOf(hook);
      assert.ok(at !== -1 && at < early, `${hook} must run before the early return`);
    }
  });

  it('adds no durations or transitions of its own', () => {
    assert.doesNotMatch(modal, /transition-all|transition-\[|\bduration-\d+|animate-(?!fadeIn)/);
  });

  it('uses tokens only, with dark pairs, readable sizes and a wrapping footer', () => {
    assert.doesNotMatch(modal, /#[0-9a-fA-F]{3,8}\b|\b(?:slate|gray|zinc|neutral|red|green|blue)-\d{2,3}\b|text-\[\d+px\]|text-micro/);
    assert.match(modal, /bg-surface dark:bg-surface-dark-2/);
    assert.match(modal, /text-base leading-relaxed/);
    assert.match(modal, /px-6 py-4 flex flex-wrap items-center justify-between/);
    assert.match(modal, /aria-label="تقدم الجولة"/);
  });

  it('resets to the first step on reopen and clamps when the step list shrinks', () => {
    assert.match(modal, /if \(isOpen\) setRequestedStepIndex\(0\)/);
    assert.match(modal, /Math\.min\(requestedStepIndex, tourSteps\.length - 1\)/);
  });
});
