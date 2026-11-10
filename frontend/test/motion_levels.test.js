import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_MOTION_LEVEL,
  DEFAULT_MOTION_STYLE,
  MOTION_LEVELS,
  MOTION_LEVEL_SETTING_KEY,
  MOTION_LEVEL_STORAGE_KEY,
  MOTION_STYLES,
  MOTION_STYLE_SETTING_KEY,
  MOTION_STYLE_STORAGE_KEY,
  applyMotionLevel,
  applyMotionStyle,
  detectDeviceHardwareTier,
  loadCachedMotionLevel,
  loadCachedMotionStyle,
  parseMotionLevel,
  parseMotionStyle,
  setMotionLevel,
  setMotionStyle,
  startMotion,
  syncMotionFromHost,
} from '../src/utils/motion.ts';
import { parseMotionDurationMs, retargetDurationMs, shouldAnimateHeight } from '../src/utils/motionHeight.ts';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const memoryStorage = (initial = {}) => {
  const data = { ...initial };
  return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = v; } };
};
const fakeRoot = () => ({ dataset: {} });

describe('motion level and style parsing', () => {
  it('keys, lists and defaults match the host contract', () => {
    assert.equal(MOTION_LEVEL_SETTING_KEY, 'ui_motion_level');
    assert.equal(MOTION_STYLE_SETTING_KEY, 'ui_motion_style');
    assert.deepEqual([...MOTION_LEVELS], ['soft', 'medium', 'strong']);
    assert.deepEqual([...MOTION_STYLES], ['slide', 'fade', 'zoom']);
    assert.equal(DEFAULT_MOTION_LEVEL, 'medium');
    assert.equal(DEFAULT_MOTION_STYLE, 'fade');
  });

  it('accepts known values (any case, padded) and falls back to the default for everything else', () => {
    assert.equal(parseMotionLevel('soft'), 'soft');
    assert.equal(parseMotionLevel(' STRONG '), 'strong');
    for (const bad of [undefined, null, '', 'high', 'banana', 1, true, {}]) assert.equal(parseMotionLevel(bad), 'medium');
    assert.equal(parseMotionStyle('fade'), 'fade');
    assert.equal(parseMotionStyle(' Zoom '), 'zoom');
    for (const bad of [undefined, null, '', 'flip', 'spin', 0, false, []]) assert.equal(parseMotionStyle(bad), 'fade');
  });
});

describe('device hardware tier auto-detection', () => {
  it('detects a valid tier with level, Arabic label and summary', () => {
    const info = detectDeviceHardwareTier();
    assert.ok(['weak', 'medium', 'strong'].includes(info.tier));
    assert.ok(['ضعيف', 'متوسط', 'قوي'].includes(info.tierArabic));
    assert.ok(['soft', 'medium', 'strong'].includes(info.level));
    assert.ok(typeof info.summary === 'string' && info.summary.length > 0);
  });
});

describe('motion level and style on the html element and in the cache', () => {
  it('sets the html data attributes', () => {
    const root = fakeRoot();
    applyMotionLevel(root, 'strong');
    applyMotionStyle(root, 'zoom');
    assert.equal(root.dataset.motionLevel, 'strong');
    assert.equal(root.dataset.motionStyle, 'zoom');
  });

  it('caches both values and reads them back with defaults when nothing is cached', () => {
    const root = fakeRoot();
    const storage = memoryStorage();
    assert.equal(loadCachedMotionLevel(storage), 'medium');
    assert.equal(loadCachedMotionStyle(storage), 'fade');
    setMotionLevel(root, storage, 'soft');
    setMotionStyle(root, storage, 'fade');
    assert.equal(storage.data[MOTION_LEVEL_STORAGE_KEY], 'soft');
    assert.equal(storage.data[MOTION_STYLE_STORAGE_KEY], 'fade');
    assert.equal(loadCachedMotionLevel(storage), 'soft');
    assert.equal(loadCachedMotionStyle(storage), 'fade');
    assert.equal(loadCachedMotionLevel(memoryStorage({ [MOTION_LEVEL_STORAGE_KEY]: 'garbage' })), 'medium');
  });

  it('survives blocked storage', () => {
    const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
    assert.equal(loadCachedMotionLevel(blocked), 'medium');
    assert.equal(loadCachedMotionStyle(blocked), 'fade');
    const root = fakeRoot();
    setMotionLevel(root, blocked, 'strong');
    setMotionStyle(root, blocked, 'zoom');
    assert.equal(root.dataset.motionLevel, 'strong');
    assert.equal(root.dataset.motionStyle, 'zoom');
  });

  it('the host value wins over the cache, invalid host values normalise, and an older host keeps the cache', async () => {
    const root = fakeRoot();
    const storage = memoryStorage({ [MOTION_LEVEL_STORAGE_KEY]: 'soft', [MOTION_STYLE_STORAGE_KEY]: 'fade' });
    assert.equal(await syncMotionFromHost(async () => ({ uiMotionEnabled: true, uiMotionLevel: 'strong', uiMotionStyle: 'zoom' }), root, storage), true);
    assert.equal(root.dataset.motionLevel, 'strong');
    assert.equal(root.dataset.motionStyle, 'zoom');
    assert.equal(storage.data[MOTION_LEVEL_STORAGE_KEY], 'strong');

    await syncMotionFromHost(async () => ({ uiMotionEnabled: true, uiMotionLevel: 'extreme', uiMotionStyle: 'spin' }), root, storage);
    assert.equal(root.dataset.motionLevel, 'medium');
    assert.equal(root.dataset.motionStyle, 'fade');

    const older = fakeRoot();
    const cached = memoryStorage({ [MOTION_LEVEL_STORAGE_KEY]: 'soft', [MOTION_STYLE_STORAGE_KEY]: 'fade' });
    applyMotionLevel(older, 'soft');
    applyMotionStyle(older, 'fade');
    await syncMotionFromHost(async () => ({ uiMotionEnabled: true }), older, cached);
    assert.equal(older.dataset.motionLevel, 'soft');
    assert.equal(older.dataset.motionStyle, 'fade');
  });

  it('startMotion paints the cached level and style first, then the host values win', async () => {
    const root = fakeRoot();
    const storage = memoryStorage({ [MOTION_LEVEL_STORAGE_KEY]: 'strong', [MOTION_STYLE_STORAGE_KEY]: 'zoom' });
    let before = '';
    await startMotion(async () => {
      before = `${root.dataset.motionLevel}/${root.dataset.motionStyle}`;
      return { uiMotionEnabled: true, uiMotionLevel: 'soft', uiMotionStyle: 'fade' };
    }, root, storage);
    assert.equal(before, 'strong/zoom');
    assert.equal(`${root.dataset.motionLevel}/${root.dataset.motionStyle}`, 'soft/fade');
  });
});

describe('root card controls and the mock bridge', () => {
  const card = read('src/views/root/RootMotionCard.tsx');

  it('has the two labelled controls with every option and a one-line description each', () => {
    for (const text of ['قوة الحركة', 'شكل الحركة', 'خفيفة', 'متوسطة', 'قوية', 'انزلاق', 'تلاشي', 'تكبير']) {
      assert.ok(card.includes(text), text);
    }
    assert.equal((card.match(/description: '/g) ?? []).length, 6);
    assert.match(card, /role="radiogroup"/);
    assert.match(card, /role="radio"/);
  });

  it('saves through settings:save with the new keys, applies live, reverts on failure and disables with motion off', () => {
    assert.match(card, /MOTION_LEVEL_SETTING_KEY/);
    assert.match(card, /MOTION_STYLE_SETTING_KEY/);
    assert.match(card, /setMotionLevel\(document\.documentElement, localStorage, next\)/);
    assert.match(card, /setMotionStyle\(document\.documentElement, localStorage, next\)/);
    assert.match(card, /setMotionLevel\(document\.documentElement, localStorage, prev\)/);
    assert.match(card, /setMotionStyle\(document\.documentElement, localStorage, prev\)/);
    assert.match(card, /disabled=\{!enabled \|\| saving\}/);
    assert.match(card, /settings:save/);
  });

  it('the preview plays a panel swap and a mini dialog, and the reduced-motion hint stays', () => {
    assert.match(card, /useMotionPanel\(/);
    assert.match(card, /motion-modal-backdrop/);
    assert.match(card, /motion-modal-panel/);
    assert.match(card, /osReducesMotion\(\)/);
    assert.ok(card.includes('تقليل الحركة'));
  });

  it('the mock bridge returns both fields in the store profile and has the defaults', () => {
    const ipc = read('src/bridge/ipc.ts');
    assert.match(ipc, /uiMotionLevel: profile\.ui_motion_level/);
    assert.match(ipc, /uiMotionStyle: profile\.ui_motion_style/);
    assert.match(ipc, /ui_motion_level: 'medium'/);
    assert.match(ipc, /ui_motion_style: 'fade'/);
  });
});

describe('host contract for level and style (source pins; NUnit S67 runs the behaviour)', () => {
  const settings = read('../desktop/Services/SettingsService.cs');
  const dispatcher = read('../desktop/Bridge/IpcDispatcher.System.cs');

  it('defines the keys, defaults, the Arabic root-only message and normalisation', () => {
    assert.ok(settings.includes('"ui_motion_level"'));
    assert.ok(settings.includes('"ui_motion_style"'));
    assert.ok(settings.includes('UiMotionLevelDefault = "medium"'));
    assert.ok(settings.includes('UiMotionStyleDefault = "fade"'));
    assert.ok(settings.includes('تغيير شكل الحركات متاح لحساب الروت فقط'));
    assert.match(settings, /NormalizeUiMotionLevel/);
    assert.match(settings, /NormalizeUiMotionStyle/);
  });

  it('the one existing guard covers the new keys and the profile exposes them', () => {
    assert.match(dispatcher, /IsUiMotionChange\(motionKey, writable\[motionKey\]\)/);
    assert.match(dispatcher, /NormalizeUiMotionSettingValue\(motionKey/);
    assert.match(dispatcher, /uiMotionLevel = DatabaseService\.Settings\.GetUiMotionLevel\(\)/);
    assert.match(dispatcher, /uiMotionStyle = DatabaseService\.Settings\.GetUiMotionStyle\(\)/);
  });
});

describe('MotionHeight pure rules', () => {
  it('first mount (no previous height) and unusable heights never animate', () => {
    assert.equal(shouldAnimateHeight(null, 200, true, false), false);
    assert.equal(shouldAnimateHeight(0, 200, true, false), false);
    assert.equal(shouldAnimateHeight(200, 0, true, false), false);
  });

  it('ignores changes under 2px, animates from 2px up, growing and shrinking', () => {
    assert.equal(shouldAnimateHeight(200, 201, true, false), false);
    assert.equal(shouldAnimateHeight(200, 201.9, true, false), false);
    assert.equal(shouldAnimateHeight(200, 202, true, false), true);
    assert.equal(shouldAnimateHeight(200, 320, true, false), true, 'growing');
    assert.equal(shouldAnimateHeight(320, 200, true, false), true, 'shrinking');
  });

  it('motion off or reduced motion never animate', () => {
    assert.equal(shouldAnimateHeight(200, 320, false, false), false);
    assert.equal(shouldAnimateHeight(200, 320, true, true), false);
    assert.equal(shouldAnimateHeight(200, 320, false, true), false);
  });

  it('reads the css duration, clamps it to 400ms and defaults to medium when unreadable', () => {
    assert.equal(parseMotionDurationMs('240ms'), 240);
    assert.equal(parseMotionDurationMs(' 160ms '), 160);
    assert.equal(parseMotionDurationMs('0.36s'), 360);
    assert.equal(parseMotionDurationMs('900ms'), 400);
    assert.equal(parseMotionDurationMs(''), 240);
    assert.equal(parseMotionDurationMs('fast'), 240);
  });

  it('a small target shift mid-glide keeps the remaining time, a real change restarts the full duration', () => {
    assert.equal(retargetDurationMs(240, 100, 12), 100);
    assert.equal(retargetDurationMs(240, 10, 12), 60, 'never shorter than 60ms');
    assert.equal(retargetDurationMs(240, 500, 12), 240, 'never longer than the full duration');
    assert.equal(retargetDurationMs(240, 100, 120), 240);
    assert.equal(retargetDurationMs(240, 0, 5), 240);
  });
});

describe('MotionHeight component contract', () => {
  const src = read('src/components/MotionHeight.tsx');

  it('renders two plain divs, observes the inner one only when motion is on, and cleans up', () => {
    assert.match(src, /<div className=\{className\} ref=\{outerRef\}>/);
    assert.match(src, /<div ref=\{innerRef\}>\{children\}<\/div>/);
    assert.match(src, /if \(!motionOn\) return undefined;/);
    assert.equal((src.match(/new ResizeObserver\(/g) ?? []).length, 1);
    assert.match(src, /observer\.observe\(inner\)/);
    assert.match(src, /observer\.disconnect\(\)/);
    assert.match(src, /document\.hidden/);
    assert.match(src, /--rq-motion-duration/);
  });

  it('clears every inline style it sets so the layout returns to natural auto', () => {
    for (const prop of ['transition', 'height', 'overflow', 'flex']) {
      assert.match(src, new RegExp(`outer\\.style\\.${prop} = '';`), prop);
    }
  });

  it('the license modal glides between its tabs and keeps header and footer still', () => {
    const modal = read('src/components/LicenseModal.tsx');
    assert.match(modal, /useMotionPanel\(activeTab\)/);
    assert.match(modal, /<MotionHeight>[\s\S]*<div \{\.\.\.tabPanel\}>[\s\S]*Tab 1: Online[\s\S]*Tab 3: Transfer[\s\S]*<\/MotionHeight>/);
    assert.ok(modal.indexOf('<MotionHeight>') > modal.indexOf('Mode Switcher Tabs'));
    assert.ok(modal.indexOf('</MotionHeight>') < modal.indexOf('Footer Actions'));
  });
});

describe('level and style css hooks', () => {
  const css = read('src/index.css');
  const motionCss = css.slice(css.indexOf('Opt-in motion'));

  it('every level and style has a variable block, all inside the reduced-motion guard', () => {
    for (const level of ['soft', 'strong']) assert.ok(motionCss.includes(`html[data-motion="on"][data-motion-level="${level}"]`), level);
    for (const style of ['fade', 'zoom']) assert.ok(motionCss.includes(`html[data-motion="on"][data-motion-style="${style}"]`), style);
    assert.ok(motionCss.indexOf('@media screen and (prefers-reduced-motion: no-preference)') < motionCss.indexOf('data-motion-level="soft"'));
    assert.ok(!css.slice(0, css.indexOf('Opt-in motion')).includes('data-motion-level'));
  });

  it('no rule hard-codes a motion distance or scale any more', () => {
    const rules = motionCss.slice(motionCss.indexOf('@keyframes rq-panel-in-a'));
    assert.ok(!/translate:\s*0\s+-?[1-9]\d*px/.test(rules));
    assert.ok(!/scale:\s*0\.\d+/.test(rules));
    assert.ok(!/--tw-enter-scale:\s*0\.\d+/.test(rules));
    assert.ok(!/--tw-enter-translate-y:\s*-?[1-9]\d*px/.test(rules));
  });
});
