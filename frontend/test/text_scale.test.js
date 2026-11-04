import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_TEXT_SCALE,
  TEXT_SCALE_CSS_VAR,
  TEXT_SCALE_LEVELS,
  TEXT_SCALE_STORAGE_KEY,
  applyTextScale,
  loadTextScale,
  parseTextScale,
  setTextScale,
} from '../src/utils/textScale.ts';

const memoryStorage = (initial = {}) => {
  const data = { ...initial };
  return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = v; } };
};
const fakeRoot = () => {
  const props = {};
  return { props, style: { setProperty: (n, v) => { props[n] = v; } } };
};

describe('text scale preference', () => {
  it('offers three levels with the default in the list', () => {
    assert.deepEqual(TEXT_SCALE_LEVELS.map((l) => l.value), [0.9, 1, 1.1]);
    assert.ok(TEXT_SCALE_LEVELS.some((l) => l.value === DEFAULT_TEXT_SCALE));
  });

  it('parses valid levels and falls back to the default for anything else', () => {
    assert.equal(parseTextScale('1.1'), 1.1);
    assert.equal(parseTextScale('0.9'), 0.9);
    assert.equal(parseTextScale('1.2'), DEFAULT_TEXT_SCALE, 'level above the cap is rejected');
    for (const bad of [null, undefined, '', '  ', 'abc', '0', '2', '-1', '1.05', 'NaN', 'Infinity']) {
      assert.equal(parseTextScale(bad), DEFAULT_TEXT_SCALE, `input ${String(bad)}`);
    }
  });

  it('loads the stored level and survives a throwing storage', () => {
    assert.equal(loadTextScale(memoryStorage({ [TEXT_SCALE_STORAGE_KEY]: '1.1' })), 1.1);
    assert.equal(loadTextScale(memoryStorage()), DEFAULT_TEXT_SCALE);
    assert.equal(loadTextScale(memoryStorage({ [TEXT_SCALE_STORAGE_KEY]: 'huge' })), DEFAULT_TEXT_SCALE);
    assert.equal(loadTextScale({ getItem: () => { throw new Error('blocked'); } }), DEFAULT_TEXT_SCALE);
  });

  it('applies the scale as a CSS variable on the root and rejects invalid values', () => {
    const root = fakeRoot();
    assert.equal(applyTextScale(root, 1.1), 1.1);
    assert.equal(root.props[TEXT_SCALE_CSS_VAR], '1.1');
    assert.equal(applyTextScale(root, 5), DEFAULT_TEXT_SCALE);
    assert.equal(root.props[TEXT_SCALE_CSS_VAR], '1');
  });

  it('setTextScale applies and persists, and still applies when storage throws', () => {
    const root = fakeRoot();
    const storage = memoryStorage();
    assert.equal(setTextScale(root, storage, 0.9), 0.9);
    assert.equal(storage.data[TEXT_SCALE_STORAGE_KEY], '0.9');
    assert.equal(root.props[TEXT_SCALE_CSS_VAR], '0.9');

    const blocked = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
    assert.equal(setTextScale(root, blocked, 1.1), 1.1);
    assert.equal(root.props[TEXT_SCALE_CSS_VAR], '1.1');
  });

  it('wires the root font-size to the CSS variable', () => {
    const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
    assert.match(css, /html\s*\{[^}]*font-size:\s*calc\(100%\s*\*\s*var\(--rafiq-text-scale,\s*1\)\)/);
    assert.equal(TEXT_SCALE_CSS_VAR, '--rafiq-text-scale');
  });
});
