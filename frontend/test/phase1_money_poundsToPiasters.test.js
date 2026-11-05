import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { poundsToPiasters } from '../src/utils/money.ts';
import { createAttemptKey } from '../src/utils/idempotency.ts';

describe('Phase 1 money (L2): poundsToPiasters is exact, half away from zero', () => {
  it('rounds the floating point edge cases correctly', () => {
    assert.equal(poundsToPiasters(1.005), 101);
    assert.equal(poundsToPiasters('1.005'), 101);
    assert.equal(poundsToPiasters(2.675), 268);
    assert.equal(poundsToPiasters(8.325), 833);
    assert.equal(poundsToPiasters(0.1 + 0.2), 30);
  });

  it('keeps normal inputs identical', () => {
    assert.equal(poundsToPiasters(15.5), 1550);
    assert.equal(poundsToPiasters('15.50'), 1550);
    assert.equal(poundsToPiasters(15), 1500);
    assert.equal(poundsToPiasters('.5'), 50);
    assert.equal(poundsToPiasters('1,234.56'), 123456);
    assert.equal(poundsToPiasters(0), 0);
    assert.equal(poundsToPiasters(19.99), 1999);
  });

  it('rounds sub-piaster amounts and keeps the sign symmetric', () => {
    assert.equal(poundsToPiasters(0.004), 0);
    assert.equal(poundsToPiasters(0.005), 1);
    assert.equal(poundsToPiasters('0.0049'), 0);
    assert.equal(poundsToPiasters(-1.005), -101);
    assert.equal(poundsToPiasters(-0.004), 0);
    assert.equal(Object.is(poundsToPiasters(-0.004), -0), false);
  });

  it('parses Arabic-Indic digits and the Arabic decimal separator', () => {
    assert.equal(poundsToPiasters('١٢٫٥٠'), 1250);
    assert.equal(poundsToPiasters('۱.۰۰۵'), 101);
  });

  it('returns 0 for empty or non numeric input', () => {
    assert.equal(poundsToPiasters(''), 0);
    assert.equal(poundsToPiasters('abc'), 0);
    assert.equal(poundsToPiasters('.'), 0);
    assert.equal(poundsToPiasters(Number.NaN), 0);
    assert.equal(poundsToPiasters(Number.POSITIVE_INFINITY), 0);
  });

  it('handles exponent notation produced by very small or large numbers', () => {
    assert.equal(poundsToPiasters(1e-7), 0);
    assert.equal(poundsToPiasters('1e2'), 10000);
    assert.equal(poundsToPiasters(1e6), 100000000);
  });
});

describe('Phase 1 money (H1): attempt keys for purchases and supplier payments', () => {
  it('reuses the key for retries of one attempt and rotates after success', () => {
    const attempt = createAttemptKey('pur');
    const first = attempt.current();
    assert.match(first, /^pur_/);
    assert.equal(attempt.current(), first);
    attempt.complete();
    const second = attempt.current();
    assert.notEqual(second, first);
  });
});
