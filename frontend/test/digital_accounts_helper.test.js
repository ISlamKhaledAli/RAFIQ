import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  pickReceivingAccount,
  rawAccountValue,
  isNumericAccountValue,
  receivingNumbers,
  digitalProviderLabel,
} from '../src/utils/digitalAccounts.ts';

const acc = (over) => ({
  id: 'a',
  name: 'حساب',
  accountType: 'instapay',
  provider: 'nbe',
  balancePiasters: 0,
  isActive: true,
  isDefault: false,
  createdAt: '2026-01-01T10:00:00.0000000Z',
  updatedAt: '2026-01-01T10:00:00.0000000Z',
  ...over,
});

describe('pickReceivingAccount mirrors the host sale credit (is_default DESC, created_at ASC)', () => {
  it('prefers the main account even when it is newer and sorts last by name', () => {
    const list = [
      acc({ id: 'old', name: 'أ', createdAt: '2026-01-01T00:00:00Z' }),
      acc({ id: 'main', name: 'ي', isDefault: true, createdAt: '2026-06-01T00:00:00Z' }),
    ];
    assert.equal(pickReceivingAccount(list, 'instapay').id, 'main');
  });

  it('without a main account takes the oldest, not the first in name order', () => {
    const list = [
      acc({ id: 'newer-first-by-name', name: 'أ الأحدث', createdAt: '2026-06-01T00:00:00Z' }),
      acc({ id: 'oldest', name: 'ب الأقدم', createdAt: '2026-01-01T00:00:00Z' }),
    ];
    assert.equal(pickReceivingAccount(list, 'instapay').id, 'oldest');
  });

  it('ignores inactive accounts, even an inactive main one', () => {
    const list = [
      acc({ id: 'archived-main', isDefault: true, isActive: false, createdAt: '2025-01-01T00:00:00Z' }),
      acc({ id: 'live', createdAt: '2026-03-01T00:00:00Z' }),
    ];
    assert.equal(pickReceivingAccount(list, 'instapay').id, 'live');
    assert.equal(pickReceivingAccount([list[0]], 'instapay'), null);
  });

  it('only considers accounts of the requested type', () => {
    const list = [
      acc({ id: 'ip', accountType: 'instapay', isDefault: true }),
      acc({ id: 'w', accountType: 'wallet', provider: 'vodafone_cash', createdAt: '2026-09-01T00:00:00Z' }),
    ];
    assert.equal(pickReceivingAccount(list, 'wallet').id, 'w');
    assert.equal(pickReceivingAccount(list, 'instapay').id, 'ip');
    assert.equal(pickReceivingAccount([list[0]], 'wallet'), null);
  });

  it('equal keys keep the incoming list order (ties are stable)', () => {
    const same = '2026-01-01T00:00:00Z';
    const list = [acc({ id: 'first', createdAt: same }), acc({ id: 'second', createdAt: same })];
    assert.equal(pickReceivingAccount(list, 'instapay').id, 'first');
    const mains = [acc({ id: 'm1', isDefault: true, createdAt: same }), acc({ id: 'm2', isDefault: true, createdAt: same })];
    assert.equal(pickReceivingAccount(mains, 'instapay').id, 'm1');
  });

  it('breaks a default tie by the oldest creation date and treats a missing date as oldest', () => {
    const list = [
      acc({ id: 'm-new', isDefault: true, createdAt: '2026-05-01T00:00:00Z' }),
      acc({ id: 'm-old', isDefault: true, createdAt: '2026-02-01T00:00:00Z' }),
    ];
    assert.equal(pickReceivingAccount(list, 'instapay').id, 'm-old');
    const noDate = [acc({ id: 'dated' }), acc({ id: 'undated', createdAt: undefined })];
    assert.equal(pickReceivingAccount(noDate, 'instapay').id, 'undated');
  });

  it('copes with an empty or missing list', () => {
    assert.equal(pickReceivingAccount([], 'wallet'), null);
    assert.equal(pickReceivingAccount(null, 'wallet'), null);
    assert.equal(pickReceivingAccount(undefined, 'wallet'), null);
  });

  it('treats a missing isDefault flag as not main', () => {
    const list = [acc({ id: 'plain', isDefault: undefined, createdAt: '2026-01-01T00:00:00Z' }), acc({ id: 'main', isDefault: true, createdAt: '2026-08-01T00:00:00Z' })];
    assert.equal(pickReceivingAccount(list, 'instapay').id, 'main');
  });
});

describe('account number normalisation for copying', () => {
  it('copies the raw digits: spaces and dashes are stripped from numbers', () => {
    assert.equal(rawAccountValue('0101 234 5678'), '01012345678');
    assert.equal(rawAccountValue(' 010-1234-5678 '), '01012345678');
  });

  it('leaves InstaPay handles exactly as typed (trimmed only)', () => {
    assert.equal(rawAccountValue('  shop.market@instapay '), 'shop.market@instapay');
    assert.equal(isNumericAccountValue('shop@instapay'), false);
    assert.equal(isNumericAccountValue('0101 234 5678'), true);
  });
});

describe('which number is the big one', () => {
  it('InstaPay shows the payment address first and the phone as the second line', () => {
    const n = receivingNumbers({ accountType: 'instapay', identifier: 'shop@instapay', phoneNumber: '0101 234 5678' });
    assert.deepEqual(n, { primary: 'shop@instapay', secondary: '01012345678' });
  });

  it('wallets show the phone first', () => {
    const n = receivingNumbers({ accountType: 'wallet', phoneNumber: '01012345678', identifier: '123456' });
    assert.deepEqual(n, { primary: '01012345678', secondary: '123456' });
  });

  it('collapses the host alias (phone equals identifier when only one was typed)', () => {
    const n = receivingNumbers({ accountType: 'instapay', identifier: 'shop@instapay', phoneNumber: 'shop@instapay' });
    assert.deepEqual(n, { primary: 'shop@instapay', secondary: '' });
  });

  it('falls back to whichever exists', () => {
    assert.equal(receivingNumbers({ accountType: 'instapay', phoneNumber: '01012345678' }).primary, '01012345678');
    assert.equal(receivingNumbers({ accountType: 'wallet', identifier: 'card-1' }).primary, 'card-1');
    assert.deepEqual(receivingNumbers({ accountType: 'wallet' }), { primary: '', secondary: '' });
  });
});

describe('provider chip text', () => {
  it('names the wallet network', () => {
    assert.equal(digitalProviderLabel({ accountType: 'wallet', provider: 'vodafone_cash' }), 'فودافون كاش');
    assert.equal(digitalProviderLabel({ accountType: 'wallet', provider: 'orange_cash' }), 'أورانج كاش');
    assert.equal(digitalProviderLabel({ accountType: 'wallet', provider: 'unknown_thing' }), 'محفظة كاش');
  });

  it('names InstaPay with its bank when known', () => {
    assert.equal(digitalProviderLabel({ accountType: 'instapay', provider: 'nbe' }), 'إنستاباي • الأهلي المصري');
    assert.equal(digitalProviderLabel({ accountType: 'instapay', provider: 'instapay_cib' }), 'إنستاباي • CIB');
    assert.equal(digitalProviderLabel({ accountType: 'instapay', provider: 'instapay' }), 'إنستاباي');
  });
});
