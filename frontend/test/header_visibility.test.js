import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { getHeaderVisibility, filterNotificationsForAudience, getRoleAvatarClasses } from '../src/utils/headerVisibility.ts';

const root = { id: 'usr_root', username: 'root', role: 'root', isOwner: false };
const owner = { id: 'usr_admin_default', username: 'admin', role: 'admin', isOwner: true };
const manager = { id: 'usr_mgr', username: 'mgr', role: 'admin', isOwner: false };
const cashier = { id: 'usr_c', username: 'c1', role: 'cashier', isOwner: false };

const base = { canOpenShiftPanel: true, canManageUsers: false, canViewProducts: true };

describe('top bar visibility by role', () => {
  it('update check and badge are admin-tier only (updates:check is REQUIRE_ADMIN)', () => {
    assert.equal(getHeaderVisibility({ ...base, user: owner }).showUpdates, true);
    assert.equal(getHeaderVisibility({ ...base, user: manager }).showUpdates, true);
    assert.equal(getHeaderVisibility({ ...base, user: root }).showUpdates, true);
    assert.equal(getHeaderVisibility({ ...base, user: cashier }).showUpdates, false);
    assert.equal(getHeaderVisibility({ ...base, user: null }).showUpdates, false);
  });

  it('staff screen needs admin tier or the users.view permission', () => {
    assert.equal(getHeaderVisibility({ ...base, user: cashier }).showEmployees, false);
    assert.equal(getHeaderVisibility({ ...base, user: cashier, canManageUsers: true }).showEmployees, true);
    assert.equal(getHeaderVisibility({ ...base, user: manager }).showEmployees, true);
  });

  it('readiness check is root only and the shift button follows the shift permissions', () => {
    assert.equal(getHeaderVisibility({ ...base, user: root }).showReadiness, true);
    assert.equal(getHeaderVisibility({ ...base, user: owner }).showReadiness, false);
    assert.equal(getHeaderVisibility({ ...base, user: cashier, canOpenShiftPanel: false }).showShift, false);
    assert.equal(getHeaderVisibility({ ...base, user: cashier }).showShift, true);
  });

  it('every role gets its own avatar tint made of tokens only', () => {
    const tints = ['root', 'owner', 'manager', 'cashier'].map(getRoleAvatarClasses);
    assert.equal(new Set(tints).size, 4);
    for (const t of tints) {
      assert.doesNotMatch(t, /slate-|\[#/);
      assert.match(t, /dark:text-/, 'bright text in dark mode');
    }
  });
});

describe('role-appropriate notifications', () => {
  const onAction = () => {};
  const mk = (id, extra = {}) => ({ id, type: 'info', title: id, message: id, iconType: 'license', priority: 1, actionLabel: 'act', onAction, ...extra });
  const all = [
    mk('clock_tampering'),
    mk('license_readonly'),
    mk('license_expiry_warning'),
    mk('license_trial'),
    mk('app_update_available'),
    mk('low_stock'),
    mk('backup_overdue'),
    mk('demo_data_active'),
  ];
  const idsOf = (kind, canViewProducts = true) =>
    filterNotificationsForAudience(all, { kind, canViewProducts }).map((n) => n.id);

  it('owner and root see everything, with working actions', () => {
    for (const kind of ['owner', 'root']) {
      const out = filterNotificationsForAudience(all, { kind, canViewProducts: true });
      assert.equal(out.length, all.length);
      assert.ok(out.every((n) => typeof n.onAction === 'function'));
    }
  });

  it('manager sees admin alerts but gets no licence action (licence activation is owner-only)', () => {
    const out = filterNotificationsForAudience(all, { kind: 'manager', canViewProducts: true });
    assert.deepEqual(out.map((n) => n.id).sort(), all.map((n) => n.id).sort());
    for (const id of ['license_readonly', 'license_expiry_warning', 'license_trial']) {
      const n = out.find((x) => x.id === id);
      assert.equal(n.onAction, undefined, id);
      assert.equal(n.actionLabel, undefined, id);
    }
    assert.equal(typeof out.find((n) => n.id === 'app_update_available').onAction, 'function');
  });

  it('cashier only sees what affects selling and never an action they cannot use', () => {
    assert.deepEqual(idsOf('cashier').sort(), ['clock_tampering', 'license_expiry_warning', 'license_readonly', 'low_stock']);
    const out = filterNotificationsForAudience(all, { kind: 'cashier', canViewProducts: true });
    assert.equal(out.find((n) => n.id === 'license_readonly').onAction, undefined);
    assert.equal(out.find((n) => n.id === 'clock_tampering').onAction, onAction, 'safety alerts keep their own action');
    assert.ok(!idsOf('cashier', false).includes('low_stock'), 'no stock alert without products.view');
  });

  it('does not mutate the source notifications', () => {
    filterNotificationsForAudience(all, { kind: 'cashier', canViewProducts: true });
    assert.equal(all.find((n) => n.id === 'license_readonly').onAction, onAction);
  });
});

describe('top bar source rules', () => {
  const app = fs.readFileSync(path.resolve('src', 'App.tsx'), 'utf8');
  const header = app.slice(app.indexOf('<header '), app.indexOf('</header>'));

  it('keeps the essentials visible and moves the rest into the two menus', () => {
    for (const keep of ['NotificationBellButton', 'handleToggleFullscreen', 'toggleTheme', 'HeaderClock', 'setIsShiftModalOpen']) {
      assert.ok(header.includes(keep), `${keep} stays in the bar`);
    }
    assert.ok(header.includes('items={userMenuItems}') && header.includes('items={moreMenuItems}'));
    assert.ok(!header.includes('<Power') && !header.includes('handleMinimizeWindow'), 'logout/minimise live in the menus');
  });

  it('keeps the F1 / F5 / F11 shortcuts wired', () => {
    assert.ok(app.includes("e.key === 'F11'") && app.includes("e.key === 'F5'") && app.includes("e.key === 'F1'"));
  });

  it('every capability removed from the bar has a menu entry', () => {
    for (const id of ["'switch-user'", "'shortcuts'", "'help'", "'logout'", "'refresh'", "'minimize'", "'employees'", "'updates'", "'readiness'"]) {
      assert.ok(app.includes(`id: ${id}`), `${id} menu item`);
    }
  });

  it('icon-only header controls expose an accessible name and the header has no emojis', () => {
    const menu = fs.readFileSync(path.resolve('src', 'components', 'HeaderMenu.tsx'), 'utf8');
    assert.ok(menu.includes('aria-label={ariaLabel}') && menu.includes('title={title}'));
    const emoji = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    assert.ok(!emoji.test(menu) && !emoji.test(header));
    assert.ok(header.includes('aria-label') || header.includes('title='), 'plain header buttons keep a title');
  });
});
