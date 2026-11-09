import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTokenOrKey, isSignedLicenseToken } from '../src/utils/tokenNormalizer.ts';

describe('tokenNormalizer Unit Tests', () => {
  it('handles null, undefined, and empty string', () => {
    assert.equal(normalizeTokenOrKey(null), '');
    assert.equal(normalizeTokenOrKey(undefined), '');
    assert.equal(normalizeTokenOrKey(''), '');
    assert.equal(normalizeTokenOrKey('   '), '');
  });

  it('safely uppercases standard license keys', () => {
    assert.equal(normalizeTokenOrKey('rfq-perm-1234-abcd'), 'RFQ-PERM-1234-ABCD');
    assert.equal(normalizeTokenOrKey('  rfq-annual-8899-xyz1  '), 'RFQ-ANNUAL-8899-XYZ1');
    assert.equal(normalizeTokenOrKey('rfq-trial-0011-2233'), 'RFQ-TRIAL-0011-2233');
  });

  it('safely uppercases local owner recovery codes', () => {
    assert.equal(normalizeTokenOrKey('rfk-aaaa-bbbb'), 'RFK-AAAA-BBBB');
    assert.equal(normalizeTokenOrKey('  rfk-1234-5678  '), 'RFK-1234-5678');
  });

  it('preserves exact Base64 case for PIN recovery tokens (RFQ-REC-)', () => {
    const rawJwt = 'RFQ-REC-eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJyYWZpcS1s';
    const lowerPrefix = 'rfq-rec-eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJyYWZpcS1s';

    assert.equal(normalizeTokenOrKey(rawJwt), rawJwt);
    assert.equal(normalizeTokenOrKey(lowerPrefix), rawJwt);
    assert.equal(normalizeTokenOrKey(`  ${lowerPrefix}  `), rawJwt);
  });

  it('preserves exact Base64 case for Offline Support tokens (RFQ-SUP-)', () => {
    const rawSup = 'RFQ-SUP-eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJmb28iOiJiYXIifQ';
    const lowerSup = 'rfq-sup-eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJmb28iOiJiYXIifQ';

    assert.equal(normalizeTokenOrKey(rawSup), rawSup);
    assert.equal(normalizeTokenOrKey(lowerSup), rawSup);
  });

  it('preserves exact Base64 case for Clock Reset tokens (RFQ-TIME-)', () => {
    const rawTime = 'RFQ-TIME-eyJhbGciOiJSUzI1NiJ9.eyJraW5kIjoiY2xvY2tfcmVzZXQifQ';
    const lowerTime = 'rfq-time-eyJhbGciOiJSUzI1NiJ9.eyJraW5kIjoiY2xvY2tfcmVzZXQifQ';

    assert.equal(normalizeTokenOrKey(rawTime), rawTime);
    assert.equal(normalizeTokenOrKey(lowerTime), rawTime);
  });

  it('preserves exact Base64 case for Root tokens (RFQ-ROOT-)', () => {
    const rawRoot = 'RFQ-ROOT-eyJhbGciOiJSUzI1NiJ9.eyJraW5kIjoicm9vdF9zZXNzaW9uIn0';
    const lowerRoot = 'rfq-root-eyJhbGciOiJSUzI1NiJ9.eyJraW5kIjoicm9vdF9zZXNzaW9uIn0';

    assert.equal(normalizeTokenOrKey(rawRoot), rawRoot);
    assert.equal(normalizeTokenOrKey(lowerRoot), rawRoot);
  });

  it('correctly identifies signed license tokens', () => {
    assert.equal(isSignedLicenseToken('RFQ-REC-xyz'), true);
    assert.equal(isSignedLicenseToken('rfq-sup-xyz'), true);
    assert.equal(isSignedLicenseToken('RFQ-TIME-xyz'), true);
    assert.equal(isSignedLicenseToken('rfq-root-xyz'), true);
    assert.equal(isSignedLicenseToken('RFQ-PERM-1234'), false);
    assert.equal(isSignedLicenseToken('RFK-1234-5678'), false);
    assert.equal(isSignedLicenseToken(''), false);
    assert.equal(isSignedLicenseToken(null), false);
  });
});
