import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const read = (rel) => readFileSync(SRC + rel, 'utf8').replace(/\r\n/g, '\n');
const slice = (src, from, to) => {
  const a = src.indexOf(from);
  const b = src.indexOf(to, a);
  assert.ok(a >= 0 && b > a, `markers not found: ${from} .. ${to}`);
  return src.slice(a, b);
};

describe('e-pay and wallet transaction summaries keep a stable layout across service types', () => {
  const epay = read('views/epay/EpayView.tsx');
  const summary = slice(epay, 'ملخص العملية', 'Auto print toggle card');

  it('the e-pay summary never mounts a row only for one service type', () => {
    assert.doesNotMatch(summary, /serviceType === 'cash_out' && \(/);
    assert.doesNotMatch(summary, /serviceType !== 'cash_out' && \(/);
    assert.doesNotMatch(summary, /\? \(\s*<(?:div|span)/);
  });

  it('the total hint is one constant line with a reserved height', () => {
    assert.match(summary, /block mt-1 min-h-4">\s*\(شامل المبلغ والعمولة وربح المحل\)\s*<\/span>/);
  });

  it('the insufficient-balance warning is always mounted and only hidden visually', () => {
    assert.doesNotMatch(summary, /\{isBalanceInsufficient && \(/);
    assert.match(summary, /aria-hidden=\{!isBalanceInsufficient\}/);
    assert.match(summary, /isBalanceInsufficient \? 'text-danger dark:text-danger-bright' : 'invisible'/);
  });

  it('the wallet transaction card reserves the insufficient-balance warning too', () => {
    const wallets = read('views/wallets/WalletsView.tsx');
    assert.doesNotMatch(wallets, /\{hasInsufficientBalance && \(/);
    assert.match(wallets, /aria-hidden=\{!hasInsufficientBalance\}/);
    assert.match(wallets, /hasInsufficientBalance \? '' : 'invisible'/);
  });
});
