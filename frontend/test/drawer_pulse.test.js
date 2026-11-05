import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  DRAWER_PULSE_DEFAULT_MS,
  DRAWER_PULSE_MAX_MS,
  DRAWER_PULSE_MIN_MS,
  DRAWER_PULSE_PRESETS,
  formatDrawerPulse,
  normalizeDrawerPulse,
} from '../src/utils/drawerPulse.ts';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

describe('drawer pulse: only even numbers (the host stores the pulse in 2 ms units)', () => {
  it('every preset is even, in range, unique, and the default is one of them', () => {
    const values = DRAWER_PULSE_PRESETS.map((p) => p.ms);
    assert.ok(values.every((v) => v % 2 === 0 && v >= DRAWER_PULSE_MIN_MS && v <= DRAWER_PULSE_MAX_MS));
    assert.equal(new Set(values).size, values.length);
    assert.ok(values.includes(DRAWER_PULSE_DEFAULT_MS));
    assert.equal(values.length, 6, 'six presets, three per row');
    assert.ok(!values.includes(2) && !values.includes(5), 'the old 2 ms and 5 ms cards are gone');
  });

  it('normalizeDrawerPulse floors odd values, clamps the range and falls back to 30', () => {
    assert.equal(normalizeDrawerPulse('31'), 30);
    assert.equal(normalizeDrawerPulse('5'), 4);
    assert.equal(normalizeDrawerPulse('2'), 2, 'a custom value of 2 is allowed');
    assert.equal(normalizeDrawerPulse('1'), 2, 'below the minimum rises to 2');
    assert.equal(normalizeDrawerPulse('0'), 2);
    assert.equal(normalizeDrawerPulse('251'), 250);
    assert.equal(normalizeDrawerPulse('999'), 250);
    assert.equal(normalizeDrawerPulse(' 44 '), 44);
    assert.equal(normalizeDrawerPulse(''), 30);
    assert.equal(normalizeDrawerPulse('abc'), 30);
    assert.equal(normalizeDrawerPulse(undefined), 30);
    assert.equal(normalizeDrawerPulse(null), 30);
    assert.equal(normalizeDrawerPulse(35), 34);
  });

  it('the unit is written in Arabic, never "ms"', () => {
    assert.equal(formatDrawerPulse(30), '30 مللي ثانية');
    const tab = read('../src/views/settings/PrinterSettingsTab.tsx');
    assert.ok(!/\b\d+ ms\b/.test(tab) && !/>\s*ms\s*</.test(tab) && !tab.includes('Pulse Duration') && !tab.includes('Solenoid'));
    assert.ok(tab.includes('step={2}') && tab.includes('DRAWER_PULSE_PRESETS'));
    assert.match(tab, /grid-cols-2 sm:grid-cols-3[^\n]*\n\s*\{DRAWER_PULSE_PRESETS/);
    assert.ok(tab.includes('من 2 إلى 250'));
  });

  it('the host also uses the even value, so a stored odd number cannot behave differently from what the screen shows', () => {
    const cs = read('../../desktop/Services/PrinterService.cs');
    assert.match(cs, /return ms - \(ms % 2\);/);
    const helper = read('../../desktop/Common/RawPrinterHelper.cs');
    assert.match(helper, /pulseMs \/ 2/);
  });
});
