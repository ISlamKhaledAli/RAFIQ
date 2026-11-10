import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  OWNER_GRADE_KEYS,
  OWNER_GRADE_CHIP_LABELS,
  isOwnerGradeKey,
  getGrantedOwnerGradeKeys,
  buildOwnerGradePayload,
} from '../src/utils/ownerGrade.ts';
import {
  PERMISSION_GROUPS,
  CASHIER_PERMISSION_GROUPS,
  OWNER_GRADE_GROUP,
} from '../src/constants/permissionGroups.ts';
import { getHeaderVisibility } from '../src/utils/headerVisibility.ts';

const read = (...p) => fs.readFileSync(path.resolve(...p), 'utf8');

describe('owner-grade key helper', () => {
  it('lists exactly the three delegable keys', () => {
    assert.deepEqual([...OWNER_GRADE_KEYS], ['system.updates', 'settings.restore', 'settings.license']);
    for (const key of OWNER_GRADE_KEYS) assert.ok(OWNER_GRADE_CHIP_LABELS[key], `${key} has a chip label`);
  });

  it('isOwnerGradeKey is true only for those keys', () => {
    for (const key of OWNER_GRADE_KEYS) assert.equal(isOwnerGradeKey(key), true);
    for (const key of ['settings.backup', 'users.edit', 'system:factoryReset', 'settings', '']) {
      assert.equal(isOwnerGradeKey(key), false, key);
    }
  });

  it('getGrantedOwnerGradeKeys reads only granted owner-grade keys', () => {
    assert.deepEqual(getGrantedOwnerGradeKeys(null), []);
    assert.deepEqual(getGrantedOwnerGradeKeys(undefined), []);
    assert.deepEqual(getGrantedOwnerGradeKeys({ 'pos.sell': true, 'system.updates': false }), []);
    assert.deepEqual(
      getGrantedOwnerGradeKeys({ 'settings.license': true, 'system.updates': true, 'settings.restore': false, 'pos.sell': true }),
      ['system.updates', 'settings.license'],
    );
  });

  it('buildOwnerGradePayload sends every owner-grade key explicitly and nothing else', () => {
    assert.deepEqual(buildOwnerGradePayload({}), { 'system.updates': false, 'settings.restore': false, 'settings.license': false });
    assert.deepEqual(
      buildOwnerGradePayload({ 'settings.restore': true, 'pos.sell': true, 'users.edit': true }),
      { 'system.updates': false, 'settings.restore': true, 'settings.license': false },
    );
  });
});

describe('owner_grade permission group', () => {
  it('exists once, is flagged, and carries the three keys with Arabic label and description', () => {
    const groups = PERMISSION_GROUPS.filter((g) => g.id === 'owner_grade');
    assert.equal(groups.length, 1);
    assert.equal(groups[0], OWNER_GRADE_GROUP);
    assert.equal(OWNER_GRADE_GROUP.ownerGrade, true);
    assert.equal(OWNER_GRADE_GROUP.name, 'صلاحيات خاصة بالمالك');
    assert.deepEqual(OWNER_GRADE_GROUP.items.map((i) => i.key).sort(), [...OWNER_GRADE_KEYS].sort());
    for (const item of OWNER_GRADE_GROUP.items) {
      assert.match(item.label, /[\u0600-\u06FF]/);
      assert.match(item.description, /[\u0600-\u06FF]/);
    }
  });

  it('is excluded from the cashier editor', () => {
    assert.ok(!CASHIER_PERMISSION_GROUPS.some((g) => g.id === 'owner_grade' || g.ownerGrade));
    const cashierKeys = CASHIER_PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => i.key));
    for (const key of OWNER_GRADE_KEYS) assert.ok(!cashierKeys.includes(key), key);
    assert.equal(CASHIER_PERMISSION_GROUPS.length, PERMISSION_GROUPS.length - 1);
  });

  it('every key is registered in ALL_PERMISSIONS, the role defaults and the IPC permission map', () => {
    const svc = read('..', 'desktop', 'Services', 'SecurityService.cs');
    const dispatcher = read('..', 'desktop', 'Bridge', 'IpcDispatcher.cs');
    const start = svc.indexOf('ALL_PERMISSIONS = new string[]');
    const block = svc.slice(start, svc.indexOf('};', start));
    const delegable = svc.slice(svc.indexOf('DELEGABLE_OWNER_PERMISSIONS = new string[]'), svc.indexOf('};', svc.indexOf('DELEGABLE_OWNER_PERMISSIONS = new string[]')));
    for (const key of OWNER_GRADE_KEYS) {
      assert.ok(block.includes(`"${key}"`), `${key} in ALL_PERMISSIONS`);
      assert.ok(delegable.includes(`"${key}"`), `${key} in DELEGABLE_OWNER_PERMISSIONS`);
      assert.ok(svc.includes(`p["${key}"] = isAdmin`), `${key} in GetPermissionsForRole`);
      assert.ok(dispatcher.includes(`"${key}" }`), `${key} mapped in ACTION_PERMISSIONS`);
    }
  });

  it('maps the owner-grade actions to the delegable keys and keeps the rest owner-only', () => {
    const dispatcher = read('..', 'desktop', 'Bridge', 'IpcDispatcher.cs');
    const mapped = (action) => new RegExp(`\\{ "${action}", ([^}]+?) \\}`).exec(dispatcher)?.[1];
    for (const action of ['license:activate', 'license:activateSupportCode', 'license:generateSupportCode', 'license:deactivateForTransfer']) {
      assert.equal(mapped(action), '"settings.license"', action);
    }
    for (const action of ['database:restore', 'migration:inspect', 'migration:browseFile', 'migration:restore']) {
      assert.equal(mapped(action), '"settings.restore"', action);
    }
    assert.equal(mapped('updates:check'), '"system.updates"');
    for (const action of [
      'system:factoryReset', 'backup:revealRecoveryCode', 'backup:confirmRecoveryCode',
      'security:setPin', 'security:disablePin', 'security:enablePin', 'security:saveProtectedActions',
    ]) {
      assert.equal(mapped(action), 'REQUIRE_OWNER', action);
    }
  });
});

describe('owner-grade gating in the UI', () => {
  const manager = { id: 'usr_m', username: 'm', role: 'admin', isOwner: false };
  const base = { canOpenShiftPanel: true, canManageUsers: false, canViewProducts: true };

  it('header update button follows system.updates for a manager', () => {
    assert.equal(getHeaderVisibility({ ...base, user: manager, canUpdateApp: false }).showUpdates, false);
    assert.equal(getHeaderVisibility({ ...base, user: manager, canUpdateApp: true }).showUpdates, true);
  });

  it('openers use the permission keys instead of the owner check', () => {
    const backup = read('src', 'components', 'BackupManager.tsx');
    assert.ok(backup.includes("hasPermission('settings.restore')") && backup.includes("hasPermission('settings.license')"));
    assert.ok(!backup.includes('isOwnerOrRoot'));
    // One home for the update check: the top bar menu (owner/root always, manager by grant); the root console has no copy of it
    for (const page of ['RootStatusPage.tsx', 'RootDataPage.tsx', 'RootConsoleView.tsx']) {
      assert.ok(!read('src', 'views', 'root', page).includes('AppUpdateModal'), `${page} must not duplicate the update check`);
    }
    const app = read('src', 'App.tsx');
    assert.ok(app.includes("id: 'updates'") && app.includes('headerAccess.showUpdates'));
    assert.ok(app.includes("hasPermission('system.updates')") && app.includes("hasPermission('settings.license')"));
    const lock = read('src', 'components', 'LicenseExpiredLockScreen.tsx');
    assert.ok(lock.includes("hasPermission('settings.license')") && !lock.includes('isOwnerOrRoot'));
  });

  it('recovery code and factory reset entries stay owner/root only', () => {
    const app = read('src', 'App.tsx');
    assert.ok(/if \(!isOwnerOrRoot \|\| mustChangePinNow\) return;/.test(app), 'recovery code is requested for owner sessions only');
  });
});

describe('staff screen cleanups', () => {
  it('the supervisor-PIN staff manager entry is gone (the login modal no longer exists)', () => {
    const app = read('src', 'App.tsx');
    assert.ok(!app.replace(/ShiftLoginModal/g, '').includes('LoginModal'), 'App must not use the removed login modal');
    assert.ok(!app.includes('برقم المدير السري'), 'no supervisor-PIN staff manager entry');
  });

  it('UserManagerModal has no row login button or login-as form, and no dead supervisor-session plumbing', () => {
    const src = read('src', 'components', 'UserManagerModal.tsx');
    for (const gone of ['handleStartSwitchLogin', 'handleSubmitSwitchLogin', 'switchLogin', 'switchSecret', 'LogIn', 'supervisorPin?: string']) {
      assert.ok(!src.includes(gone), `${gone} must be gone`);
    }
    assert.ok(!src.includes('<span>دخول</span>'));
  });

  it('UserManagerModal edits a manager through the owner-grade panel only', () => {
    const src = read('src', 'components', 'UserManagerModal.tsx');
    assert.ok(src.includes('handleStartOwnerGrade') && src.includes('buildOwnerGradePayload'));
    assert.ok(src.includes('المدير يملك باقي صلاحيات الإدارة اليومية تلقائياً'));
    assert.ok(src.includes('CASHIER_PERMISSION_GROUPS') && !/\bPERMISSION_GROUPS\b/.test(src.replace(/CASHIER_PERMISSION_GROUPS/g, '')));
  });
});
