import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const bar = readFileSync(join(ROOT, 'src', 'views', 'pos', 'PosCartCheckoutBar.tsx'), 'utf8').replace(/\r\n/g, '\n');

describe('the held-invoices button in the cashier action row', () => {
  const block = bar.slice(bar.indexOf('{/* فواتير معلقة */}'), bar.indexOf('{/* مرتجع [F11] */}'));

  it('has its own list icon (distinct from the hold button clock) with the sibling icon classes', () => {
    assert.match(block, /<ClipboardList className=\{`\$\{SECONDARY_ICON\} text-ink-muted dark:text-ink-dark-muted`\} \/>/);
    assert.match(bar, /^\s+ClipboardList,$/m);
  });

  it('shows the count as a corner badge so the label and icon keep their width, with a dark pair', () => {
    assert.match(block, /relative`}/);
    assert.match(block, /absolute -top-2 -start-2[^"]*bg-warn-bright text-ink dark:bg-warn-bright dark:text-surface-dark/);
  });
});
