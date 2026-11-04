import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { isValidPinFormat, isWeakPin, requiresForcedPinChange } from '../src/utils/pinPolicy.ts';
import { totalSaleDiscountPiasters } from '../src/utils/money.ts';
import { getAllowedSettingsSubTabs } from '../src/utils/settingsAccess.ts';

describe('Security hardening: forced PIN change and PIN policy', () => {
  it('rejects factory/sequential PINs and accepts a strong PIN', () => {
    assert.equal(isWeakPin('1234'), true);
    assert.equal(isWeakPin('0000'), true);
    assert.equal(isWeakPin('123456'), true);
    assert.equal(isWeakPin('7418'), false);
  });

  it('accepts only 4-8 digit PINs', () => {
    assert.equal(isValidPinFormat('7418'), true);
    assert.equal(isValidPinFormat('74185296'), true);
    assert.equal(isValidPinFormat('741'), false);
    assert.equal(isValidPinFormat('741852963'), false);
    assert.equal(isValidPinFormat('74a8'), false);
  });

  it('requires the forced change only for flagged sessions', () => {
    assert.equal(requiresForcedPinChange({ mustChangePin: true }), true);
    assert.equal(requiresForcedPinChange({ mustChangePin: false }), false);
    assert.equal(requiresForcedPinChange(null), false);
  });

  it('App gates every screen (including the first-launch LoginScreen path) behind the shared forced-change form', () => {
    const app = fs.readFileSync(path.resolve('src', 'App.tsx'), 'utf8');
    const modal = fs.readFileSync(path.resolve('src', 'components', 'LoginModal.tsx'), 'utf8');
    assert.ok(app.includes('requiresForcedPinChange(currentUser)'), 'App must gate the shell on mustChangePin');
    assert.ok(app.includes('<ForcedPinChangeForm'), 'App must render the shared forced-change form');
    assert.ok(modal.includes('<ForcedPinChangeForm'), 'LoginModal must reuse the shared forced-change form');
  });

  it('recovery code modal is only requested for owner sessions', () => {
    const app = fs.readFileSync(path.resolve('src', 'App.tsx'), 'utf8');
    const idx = app.indexOf("invoke<{ isConfirmed: boolean; recoveryCode?: string }>('backup:getRecoveryStatus')");
    assert.ok(idx > 0, 'recovery status request must exist');
    const before = app.slice(Math.max(0, idx - 400), idx);
    assert.ok(before.includes('if (!isOwnerOrRoot'), 'recovery status must be requested only for owner or root sessions');
  });

  it('line discounts never leak into the invoice-level discount (R1)', () => {
    const pos = fs.readFileSync(path.resolve('src', 'views', 'PosView.tsx'), 'utf8');
    const start = pos.indexOf('const handleApplyItemDiscount');
    const end = pos.indexOf('const handleApplyInvoiceDiscount');
    assert.ok(start > 0 && end > start);
    assert.ok(!pos.slice(start, end).includes('setDiscountPiasters'), 'item discount must not overwrite the invoice discount');
    assert.ok(pos.includes('discountPiasters={totalDiscountPiasters}'), 'checkout display shows line + invoice discount');
  });

  it('receipt discount = invoice discount + line discounts', () => {
    assert.equal(totalSaleDiscountPiasters({ discountPiasters: 300, items: [{ discountPiasters: 500 }, { discountPiasters: 0 }] }), 800);
    assert.equal(totalSaleDiscountPiasters({ discountPiasters: 0, items: [] }), 0);
    assert.equal(totalSaleDiscountPiasters({ discountPiasters: 150 }), 150);
  });

  it('settings screens follow the server permission allowlists (R2)', () => {
    const only = (perms) => (key) => perms.includes(key);
    assert.deepEqual(getAllowedSettingsSubTabs({ isRoot: false, isAdmin: false, hasPermission: only(['settings.store']) }), ['profile']);
    assert.deepEqual(getAllowedSettingsSubTabs({ isRoot: false, isAdmin: false, hasPermission: only(['settings.printer']) }), ['printer']);
    assert.deepEqual(getAllowedSettingsSubTabs({ isRoot: false, isAdmin: true, hasPermission: only([]) }), ['profile', 'printer', 'backup']);
    assert.ok(getAllowedSettingsSubTabs({ isRoot: true, isAdmin: true, hasPermission: only([]) }).includes('security'));
  });

  it('forced PIN change uses security:setPin only for the store owner account (R4)', () => {
    const form = fs.readFileSync(path.resolve('src', 'components', 'ForcedPinChangeForm.tsx'), 'utf8');
    assert.ok(form.includes("STORE_OWNER_ID = 'usr_admin_default'"));
    assert.ok(form.includes('user.isRecoverySession'), 'recovery sessions skip the forgotten current PIN');
  });
});
