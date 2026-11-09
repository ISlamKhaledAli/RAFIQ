import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_MOTION_ENABLED,
  MOTION_SETTING_KEY,
  MOTION_STORAGE_KEY,
  applyMotion,
  loadCachedMotion,
  parseMotionSetting,
  setMotionEnabled,
  startMotion,
  syncMotionFromHost,
} from '../src/utils/motion.ts';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const memoryStorage = (initial = {}) => {
  const data = { ...initial };
  return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = v; } };
};
const fakeRoot = () => ({ dataset: {} });

const css = read('src/index.css');
const marker = css.indexOf('Opt-in motion');
const motionCss = css.slice(marker);

describe('motion setting and plumbing', () => {
  it('uses the ui_motion_enabled key and is off by default', () => {
    assert.equal(MOTION_SETTING_KEY, 'ui_motion_enabled');
    assert.equal(DEFAULT_MOTION_ENABLED, false);
    assert.equal(parseMotionSetting(undefined), false);
    assert.equal(parseMotionSetting(null), false);
    assert.equal(parseMotionSetting(''), false);
    assert.equal(parseMotionSetting('0'), false);
    assert.equal(parseMotionSetting('garbage'), false);
    assert.equal(parseMotionSetting('1'), true);
    assert.equal(parseMotionSetting(' TRUE '), true);
    assert.equal(parseMotionSetting(true), true);
  });

  it('sets html data-motion and caches the value for the next first paint', () => {
    const root = fakeRoot();
    const storage = memoryStorage();
    applyMotion(root, true);
    assert.equal(root.dataset.motion, 'on');
    setMotionEnabled(root, storage, false);
    assert.equal(root.dataset.motion, 'off');
    assert.equal(storage.data[MOTION_STORAGE_KEY], '0');
    setMotionEnabled(root, storage, true);
    assert.equal(storage.data[MOTION_STORAGE_KEY], '1');
    assert.equal(loadCachedMotion(storage), true);
    assert.equal(loadCachedMotion(memoryStorage()), false);
  });

  it('survives blocked storage', () => {
    const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
    assert.equal(loadCachedMotion(blocked), false);
    const root = fakeRoot();
    setMotionEnabled(root, blocked, true);
    assert.equal(root.dataset.motion, 'on');
  });

  it('applies the host value and keeps the cache when the host is unreachable', async () => {
    const root = fakeRoot();
    const storage = memoryStorage({ [MOTION_STORAGE_KEY]: '1' });
    assert.equal(await syncMotionFromHost(async () => ({ uiMotionEnabled: false }), root, storage), true);
    assert.equal(root.dataset.motion, 'off');
    assert.equal(storage.data[MOTION_STORAGE_KEY], '0');

    storage.data[MOTION_STORAGE_KEY] = '1';
    applyMotion(root, true);
    assert.equal(await syncMotionFromHost(async () => { throw new Error('not ready'); }, root, storage), false);
    assert.equal(root.dataset.motion, 'on');
    assert.equal(await syncMotionFromHost(async () => ({ storeName: 'x' }), root, storage), false, 'a profile without the field changes nothing');
    assert.equal(root.dataset.motion, 'on');
  });

  it('startMotion paints the cached value first, then the host value wins', async () => {
    const root = fakeRoot();
    const storage = memoryStorage({ [MOTION_STORAGE_KEY]: '1' });
    let seenBeforeHost = '';
    await startMotion(async () => { seenBeforeHost = root.dataset.motion; return { uiMotionEnabled: '0' }; }, root, storage);
    assert.equal(seenBeforeHost, 'on');
    assert.equal(root.dataset.motion, 'off');
  });
});

describe('motion css is scoped, cheap and respects reduced motion', () => {
  it('has the motion block and nothing of it outside the media guard', () => {
    assert.ok(marker > 0);
    const guard = '@media screen and (prefers-reduced-motion: no-preference) {';
    assert.ok(motionCss.includes(guard), 'prefers-reduced-motion guard present');
    // nothing before the guard may define the new classes or keyframes
    const before = css.slice(0, css.lastIndexOf('/*', marker));
    for (const name of ['rq-panel-in', 'rq-modal', 'rq-toast', 'motion-panel', 'motion-modal', 'motion-toast', 'data-motion']) {
      assert.ok(!before.includes(name), `${name} must only exist inside the guard`);
    }
    // the guard is the last block of the file: braces balance to zero at the end
    const body = motionCss.slice(motionCss.indexOf(guard));
    let depth = 0;
    for (const ch of body) { if (ch === '{') depth++; if (ch === '}') depth--; }
    assert.equal(depth, 0);
  });

  it('every style rule is scoped under html[data-motion="on"]', () => {
    const body = motionCss.slice(motionCss.indexOf('{') + 1);
    const withoutKeyframes = body.replace(/@keyframes[^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
    const selectors = [...withoutKeyframes.matchAll(/([^{}]+)\{[^{}]*\}/g)].map((m) => m[1].replace(/\/\*[\s\S]*?\*\//g, '').trim());
    assert.ok(selectors.length >= 6);
    for (const sel of selectors) {
      assert.ok(sel.replace(/^:where\(/, '').startsWith('html[data-motion="on"]'), `unscoped selector: ${sel}`);
    }
  });

  it('keyframes only animate opacity, translate and scale (the notification row collapse also glides its grid row and gap)', () => {
    const frames = [...motionCss.matchAll(/@keyframes\s+([\w-]+)\s*\{((?:[^{}]*\{[^{}]*\})*)\s*\}/g)];
    assert.equal(frames.length, 15);
    for (const [, name, inner] of frames) {
      const props = [...inner.matchAll(/([\w-]+)\s*:/g)].map((m) => m[1]);
      assert.ok(props.length > 0, name);
      const allowed = name === 'rq-collapse-out' ? ['opacity', 'grid-template-rows', 'margin-bottom'] : name === 'rq-collapse-in' ? ['opacity', 'grid-template-rows'] : ['opacity', 'translate', 'scale'];
      for (const p of props) assert.ok(allowed.includes(p), `${name} animates ${p}`);
    }
  });

  it('every animation is a single short ease-out driven by the duration variable (levels never exceed 400ms)', () => {
    const anims = [...motionCss.matchAll(/animation:\s*([^;]+);/g)].map((m) => m[1]);
    assert.ok(anims.length >= 6);
    for (const a of anims) {
      if (a === 'none') continue; // only the sidebar group switches its legacy slide-in off
      assert.match(a, /var\(--rq-motion-duration, \d+ms\)/, `animation must use the variable: "${a}"`);
      assert.ok(a.includes('ease-out'));
      assert.ok(!/infinite/.test(a), 'no looping animation');
      assert.ok(!/\d+ms/.test(a.replace(/var\(--rq-motion-duration, \d+ms\)/, '')), `no hard-coded duration in "${a}"`);
    }
    const transitions = [...motionCss.matchAll(/(?:^|[\s;{])transition\s*:\s*([^;]+);/g)].map((m) => m[1]);
    assert.ok(transitions.length >= 1);
    for (const t of transitions) {
      if (/^transform var\(--rq-motion-duration, \d+ms\) ease-out$/.test(t)) continue; // the sidebar chevron
      if (/^color var\(--rq-motion-duration, \d+ms\) ease-out,\s*background-color var\(--rq-motion-duration, \d+ms\) ease-out,\s*border-color var\(--rq-motion-duration, \d+ms\) ease-out,\s*box-shadow var\(--rq-motion-duration, \d+ms\) ease-out,\s*transform 0\.08s ease$/.test(t)) continue; // sidebar rows: colours only
      assert.match(t, /^opacity var\(--rq-motion-duration, \d+ms\) ease-out(, visibility 0s linear var\(--rq-motion-duration, \d+ms\))?$/, `the motion block only fades (and flips visibility after the fade): "${t}"`);
    }
    for (const level of ['soft', 'medium', 'strong']) {
      const sel = level === 'medium' ? 'html[data-motion="on"] {' : `html[data-motion="on"][data-motion-level="${level}"] {`;
      const block = new RegExp(`${sel.replace(/[[\]{}()"=]/g, '\\$&')}\\s*([^}]*)\\}`).exec(motionCss);
      assert.ok(block, `${level} block`);
      const ms = Number(/--rq-motion-duration:\s*(\d+)ms/.exec(block[1])?.[1]);
      assert.ok(ms >= 120 && ms <= 400, `${level} duration ${ms}`);
    }
    assert.ok(!/(height|width|margin|top|left)\s*:\s*[^;]*;\s*\}?\s*to/.test(motionCss));
  });

  it('the level variables get stronger and the styles map to the right variables', () => {
    const num = (level, name) => {
      const sel = level === 'medium' ? 'html[data-motion="on"] {' : `html[data-motion="on"][data-motion-level="${level}"] {`;
      const start = motionCss.indexOf(sel);
      const body = motionCss.slice(start, motionCss.indexOf('}', start));
      return parseFloat(new RegExp(`${name}:\\s*([\\d.]+)`).exec(body)[1]);
    };
    for (const name of ['--rq-motion-duration', '--rq-motion-distance']) {
      assert.ok(num('soft', name) < num('medium', name) && num('medium', name) < num('strong', name), name);
    }
    assert.ok(num('soft', '--rq-motion-scale') > num('medium', '--rq-motion-scale') && num('medium', '--rq-motion-scale') > num('strong', '--rq-motion-scale'));
    assert.match(motionCss, /data-motion-style="fade"\] \{[^}]*--rq-motion-y: 0px;[^}]*--rq-motion-s: 1;[^}]*--rq-motion-dy: 0px;[^}]*--rq-motion-ds: 1;/);
    assert.match(motionCss, /data-motion-style="zoom"\] \{[^}]*--rq-motion-y: 0px;[^}]*--rq-motion-dy: 0px;[^}]*--rq-motion-ds: var\(--rq-motion-scale\)/);
    assert.match(motionCss, /--rq-motion-y: var\(--rq-motion-distance\);/);
  });

  it('keeps the phase twin keyframes identical so the restart trick stays valid', () => {
    const a = /@keyframes rq-panel-in-a \{([^}]*\}[^}]*)\}/.exec(motionCss);
    const b = /@keyframes rq-panel-in-b \{([^}]*\}[^}]*)\}/.exec(motionCss);
    assert.ok(a && b);
    assert.equal(a[1], b[1]);
  });
});

describe('motion wiring', () => {
  it('main starts the motion module', () => {
    const main = read('src/main.tsx');
    assert.match(main, /startMotion\(/);
    assert.match(main, /settings:getStoreProfile/);
  });

  it('the hook flips a/b without remounting', () => {
    const hook = read('src/hooks/useMotionPanel.ts');
    assert.match(hook, /data-motion-phase/);
    assert.match(hook, /'a' \| 'b'/);
  });

  it('the shared panel wrapper is used in the central tab places', () => {
    const files = [
      'src/views/ProductsView.tsx',
      'src/views/PurchasesView.tsx',
      'src/views/SettingsView.tsx',
      'src/views/wallets/WalletsView.tsx',
      'src/views/epay/EpayView.tsx',
      'src/views/insurance/InsuranceContractsView.tsx',
      'src/views/root/RootConsoleView.tsx',
      'src/views/analytics/RevenueAnalyticsView.tsx',
      'src/views/analytics/InventoryAnalyticsView.tsx',
      'src/views/analytics/CustomerAnalyticsView.tsx',
    ];
    for (const f of files) {
      const src = read(f);
      assert.match(src, /useMotionPanel\(/, `${f} calls the hook`);
      assert.match(src, /\{\.\.\.motionPanel\}/, `${f} spreads it on the swapping container`);
    }
    const app = read('src/App.tsx');
    const wrappers = app.match(/h-full w-full (?:overflow-hidden )?motion-panel \$\{/g) ?? [];
    assert.ok(wrappers.length >= 14, `App keep-alive wrappers: ${wrappers.length}`);
  });

  it('shared headers stay still and the previously unanimated modals and toasts opt in', () => {
    assert.match(read('src/views/ProductsView.tsx'), /motion-static/);
    assert.match(read('src/views/SettingsView.tsx'), /motion-static/);
    assert.match(read('src/components/PaymentModal.tsx'), /motion-modal-backdrop[\s\S]*motion-modal-panel/);
    assert.match(read('src/views/PurchasesView.tsx'), /motion-toast/);
  });

  it('existing animations were not touched', () => {
    assert.match(read('src/components/ConfirmModal.tsx'), /animate-in fade-in duration-150/);
    assert.match(read('src/components/RafiqDialog.tsx'), /animate-fade-in/);
    assert.match(read('src/utils/buttonStyles.ts'), /select-none animate-fade-in/);
  });
});

describe('root-only toggle', () => {
  const card = read('src/views/root/RootMotionCard.tsx');

  it('lives in the root console with the owner wording and a honest hint', () => {
    assert.match(read('src/views/root/RootFeaturesPage.tsx'), /<RootMotionCard \/>/);
    assert.ok(card.includes('الحركات والانتقالات (تأثيرات الواجهة)'));
    assert.ok(card.includes('مغلقة افتراضياً. فعّلها فقط على الأجهزة القوية؛ قد تبطئ الأجهزة القديمة'));
    assert.match(card, /ToggleRow/);
    assert.match(card, /settings:save/);
    assert.match(card, /setMotionEnabled\(/);
  });

  it('the console itself renders nothing for non-root users', () => {
    const consoleSrc = read('src/views/root/RootConsoleView.tsx');
    assert.match(consoleSrc, /resolveRootSubTab/);
    assert.match(consoleSrc, /if \(subTab === null\) return null/);
  });

  it('the host guard exists and the scenario is registered', () => {
    const dispatcher = read('../desktop/Bridge/IpcDispatcher.System.cs');
    assert.match(dispatcher, /IsUiMotionSettingKey/);
    assert.match(dispatcher, /UiMotionRootOnlyMessage/);
    assert.match(dispatcher, /uiMotionEnabled/);
    assert.ok(read('../desktop/Services/SettingsService.cs').includes('تفعيل الحركات والانتقالات متاح لحساب الروت فقط'));
    assert.match(read('../desktop/RafiqPOS.Tests/RafiqPOS.Tests.csproj'), /S67_UiMotionRootOnlyTest\.cs/);
  });
});
