import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// The "unsaved changes" chip always keeps its slot, so a save button never moves when a form turns dirty.
const SRC = path.resolve('src');
const read = (...parts) => fs.readFileSync(path.join(SRC, ...parts), 'utf8').replace(/\r\n/g, '\n');

const FILES = [
  ['views', 'settings', 'PrinterSettingsTab.tsx'],
  ['views', 'settings', 'StoreProfileTab.tsx'],
  ['views', 'settings', 'SalesPoliciesTab.tsx'],
  ['views', 'purchases', 'NewPurchaseTab.tsx'],
  ['views', 'epay', 'EpayView.tsx'],
  ['views', 'wallets', 'WalletsView.tsx'],
  ['views', 'root', 'RootReceiptPage.tsx'],
];

describe('UnsavedChangesChip reserves its space', () => {
  const chip = read('components', 'UnsavedChangesChip.tsx');

  it('renders a wrapper in both states and only hides the visible chip', () => {
    assert.ok(chip.includes('dirty = true'), 'prop-less callers keep the visible chip');
    assert.ok(chip.includes('role="status"'));
    assert.ok(/aria-hidden="true"[\s\S]*invisible/.test(chip), 'the clean state is invisible but still measured');
    assert.ok(chip.includes("{dirty && <span className=\"sr-only\">"), 'announced only while dirty');
    assert.ok(!/if \(!dirty\)\s*return null|dirty\s*\?\s*\(|!dirty\s*&&\s*null/.test(chip), 'never unmounts the chip');
  });

  for (const file of FILES) {
    it(`${file.at(-1)} keeps the chip mounted`, () => {
      const src = read(...file);
      assert.ok(/<UnsavedChangesChip dirty=\{[^}]+\} \/>/.test(src), 'mounted with a dirty prop');
      assert.ok(!/&&\s*\(?\s*<UnsavedChangesChip/.test(src), 'no conditional mount');
      assert.ok(!/&&\s*\(\s*<div[^>]*>\s*<UnsavedChangesChip/.test(src), 'no conditional wrapper');
      assert.ok(!src.includes('<UnsavedChangesChip />'), 'no prop-less (always visible) chip');
      assert.ok(!/statusNode\s*=\s*<UnsavedChangesChip/.test(src), 'not swapped in through a status chain');
    });
  }
});
