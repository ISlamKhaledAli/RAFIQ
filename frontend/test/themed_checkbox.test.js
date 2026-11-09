import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const css = fs.readFileSync(path.resolve('src', 'index.css'), 'utf8').replace(/\r\n/g, '\n');

const listSourceFiles = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listSourceFiles(full);
    return full.endsWith('.tsx') ? [full] : [];
  });

// Every native checkbox input: the JSX text from its <input to the closing />
const nativeCheckboxes = () => {
  const found = [];
  for (const file of listSourceFiles(path.resolve('src'))) {
    const source = fs.readFileSync(file, 'utf8');
    let from = 0;
    for (;;) {
      const at = source.indexOf('type="checkbox"', from);
      if (at === -1) break;
      const start = source.lastIndexOf('<input', at);
      const end = source.indexOf('/>', at);
      found.push({ file: path.relative(path.resolve('src'), file), markup: source.slice(start, end) });
      from = at + 1;
    }
  }
  return found;
};

const blockOf = (selector) => {
  const start = css.indexOf(selector);
  assert.ok(start !== -1, `missing rule: ${selector}`);
  return css.slice(start, css.indexOf('}', start));
};

describe('themed native checkbox base style', () => {
  const base = blockOf('input[type="checkbox"] {');

  it('lives in the base layer, before the motion block', () => {
    assert.ok(css.indexOf('input[type="checkbox"] {') < css.indexOf('@layer components'));
  });

  it('is a 1rem appearance-less square using tokens only', () => {
    assert.ok(base.includes('appearance-none'));
    assert.ok(base.includes('w-4') && base.includes('h-4'));
    assert.ok(base.includes('border-line-hover') && base.includes('bg-surface'));
    assert.ok(base.includes('enabled:hover:border-brand'));
    assert.ok(base.includes('focus-visible:ring-2') && base.includes('focus-visible:ring-brand/40'));
    assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(base), 'no hex colours in the base rule');
  });

  it('has dark variants for border, background, hover and focus ring', () => {
    assert.ok(base.includes('dark:border-line-dark-strong'));
    assert.ok(base.includes('dark:bg-surface-dark'));
    assert.ok(base.includes('dark:enabled:hover:border-brand-bright'));
    assert.ok(base.includes('dark:focus-visible:ring-brand-bright'));
  });

  it('styles checked and indeterminate with brand fill in light and dark', () => {
    const checked = blockOf('input[type="checkbox"]:checked,\n  input[type="checkbox"]:indeterminate {');
    assert.ok(checked.includes('bg-brand') && checked.includes('border-brand'));
    assert.ok(checked.includes('dark:bg-paid-bright') && checked.includes('dark:border-paid-bright'));
  });

  it('draws the check and the dash with masks, contrasting in both themes', () => {
    const mark = blockOf('input[type="checkbox"]::before {');
    assert.ok(mark.includes('bg-white') && mark.includes('dark:bg-surface-dark'));
    assert.ok(mark.includes('mask:') && mark.includes('-webkit-mask:'));
    assert.ok(mark.includes('data:image/svg+xml'));
    assert.ok(css.includes('input[type="checkbox"]:indeterminate::before {'));
    assert.ok(css.includes('input[type="checkbox"]:checked::before'));
  });

  it('dims the unchecked disabled box and keeps the danger variant on tokens', () => {
    const disabled = blockOf('input[type="checkbox"]:disabled:not(:checked):not(:indeterminate) {');
    assert.ok(disabled.includes('bg-surface-2') && disabled.includes('dark:bg-surface-dark-2'));
    const danger = blockOf('input[type="checkbox"].checkbox-danger:checked,\n  input[type="checkbox"].checkbox-danger:indeterminate {');
    assert.ok(danger.includes('bg-danger') && danger.includes('dark:bg-danger-bright'));
  });

  it('keeps the global disabled cursor rule for inputs', () => {
    assert.ok(/input:disabled,\s*\.cursor-not-allowed \{\s*cursor: not-allowed !important;/.test(css));
  });
});

describe('native checkbox call sites', () => {
  const sites = nativeCheckboxes();

  it('finds the known call sites', () => {
    assert.ok(sites.length >= 25, `expected at least 25 native checkboxes, found ${sites.length}`);
  });

  it('do not fight the global style with accent, text, ring, border or palette classes', () => {
    const offenders = sites.filter((s) => /accent-|\btext-(brand|danger|cyan)|focus:ring|\bborder-line|\brounded\b|\bpeer\b/.test(s.markup));
    assert.deepEqual(offenders.map((s) => s.file), []);
  });

  it('use no visually hidden or peer checkboxes that the base style could reveal', () => {
    assert.ok(!sites.some((s) => /sr-only|\bpeer\b/.test(s.markup)));
  });

  it('only destructive confirmations opt into the danger variant', () => {
    const allowed = ['components/ExpiryReturnsModal.tsx', 'components/FactoryResetModal.tsx'];
    const danger = sites.filter((s) => s.markup.includes('checkbox-danger')).map((s) => s.file.replace(/\\/g, '/'));
    assert.ok(danger.length > 0);
    assert.deepEqual(danger.filter((file) => !allowed.includes(file)), []);
  });

  it('keeps the toggle switch free of a native checkbox', () => {
    const toggle = fs.readFileSync(path.resolve('src', 'components', 'ToggleSwitch.tsx'), 'utf8');
    assert.ok(!toggle.includes('type="checkbox"'));
  });
});
