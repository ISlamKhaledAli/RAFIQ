import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => readFileSync(fileURLToPath(new URL(`../src/${rel}`, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');

describe('POS cart row delete button', () => {
  const cart = read('views/pos/PosCartTable.tsx');
  const button = cart.match(/<AppButton\s+variant="dangerSubtle"\s+size="xs"\s+icon=\{Trash2\}[\s\S]*?<\/AppButton>/);

  it('shows the visible word "حذف" beside the trash icon and keeps the accessible name', () => {
    assert.ok(button, 'delete AppButton with icon and children');
    assert.match(button[0], />\s*حذف\s*<\/AppButton>$/);
    assert.match(button[0], /onClick=\{\(\) => removeItem\(index\)\}/);
    assert.match(button[0], /aria-label="حذف الصنف"/);
    assert.match(button[0], /title="حذف الصنف"/);
  });

  it('does not touch the quantity stepper size', () => {
    assert.equal((cart.match(/w-9 h-9 flex items-center justify-center/g) || []).length, 2);
  });

  it('keeps shortcuts and the undo toast wiring out of the row button', () => {
    assert.doesNotMatch(button[0], /undo|shortcut/i);
  });
});
