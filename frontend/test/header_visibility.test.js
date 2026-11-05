import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { getHeaderVisibility, filterNotificationsForAudience, getRoleAvatarClasses } from '../src/utils/headerVisibility.ts';

const root = { id: 'usr_root', username: 'root', role: 'root', isOwner: false };
const owner = { id: 'usr_admin_default', username: 'admin', role: 'admin', isOwner: true };
const manager = { id: 'usr_mgr', username: 'mgr', role: 'admin', isOwner: false };
const cashier = { id: 'usr_c', username: 'c1', role: 'cashier', isOwner: false };

const base = { canOpenShiftPanel: true, canManageUsers: false, canViewProducts: true, canUpdateApp: true };

describe('top bar visibility by role', () => {
  it('update check and badge need an admin tier AND the system.updates permission', () => {
    assert.equal(getHeaderVisibility({ ...base, user: owner }).showUpdates, true);
    assert.equal(getHeaderVisibility({ ...base, user: manager }).showUpdates, true, 'manager with the grant');
    assert.equal(getHeaderVisibility({ ...base, user: manager, canUpdateApp: false }).showUpdates, false, 'manager without the grant');
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
  const grants = { canUpdateApp: true, canManageLicense: true };
  const noGrants = { canUpdateApp: false, canManageLicense: false };
  const idsOf = (kind, canViewProducts = true) =>
    filterNotificationsForAudience(all, { kind, canViewProducts, ...noGrants }).map((n) => n.id);

  it('owner and root see everything, with working actions', () => {
    for (const kind of ['owner', 'root']) {
      const out = filterNotificationsForAudience(all, { kind, canViewProducts: true, ...grants });
      assert.equal(out.length, all.length);
      assert.ok(out.every((n) => typeof n.onAction === 'function'));
    }
  });

  it('manager without the owner-grade grants gets no licence action and no update alert', () => {
    const out = filterNotificationsForAudience(all, { kind: 'manager', canViewProducts: true, ...noGrants });
    assert.deepEqual(
      out.map((n) => n.id).sort(),
      all.filter((n) => n.id !== 'app_update_available').map((n) => n.id).sort(),
    );
    for (const id of ['license_readonly', 'license_expiry_warning', 'license_trial']) {
      const n = out.find((x) => x.id === id);
      assert.equal(n.onAction, undefined, id);
      assert.equal(n.actionLabel, undefined, id);
    }
  });

  it('manager keeps each alert action only for the grant that unlocks it', () => {
    const licenseOnly = filterNotificationsForAudience(all, { kind: 'manager', canViewProducts: true, canUpdateApp: false, canManageLicense: true });
    assert.equal(typeof licenseOnly.find((n) => n.id === 'license_readonly').onAction, 'function');
    assert.ok(!licenseOnly.some((n) => n.id === 'app_update_available'));
    const updatesOnly = filterNotificationsForAudience(all, { kind: 'manager', canViewProducts: true, canUpdateApp: true, canManageLicense: false });
    assert.equal(typeof updatesOnly.find((n) => n.id === 'app_update_available').onAction, 'function');
    assert.equal(updatesOnly.find((n) => n.id === 'license_readonly').onAction, undefined);
  });

  it('a cashier never gets owner-grade actions even if a flag leaks through', () => {
    const out = filterNotificationsForAudience(all, { kind: 'cashier', canViewProducts: true, ...grants });
    assert.equal(out.find((n) => n.id === 'license_readonly').onAction, undefined);
    assert.ok(!out.some((n) => n.id === 'app_update_available'));
  });

  it('cashier only sees what affects selling and never an action they cannot use', () => {
    assert.deepEqual(idsOf('cashier').sort(), ['clock_tampering', 'license_expiry_warning', 'license_readonly', 'low_stock']);
    const out = filterNotificationsForAudience(all, { kind: 'cashier', canViewProducts: true, ...noGrants });
    assert.equal(out.find((n) => n.id === 'license_readonly').onAction, undefined);
    assert.equal(out.find((n) => n.id === 'clock_tampering').onAction, onAction, 'safety alerts keep their own action');
    assert.ok(!idsOf('cashier', false).includes('low_stock'), 'no stock alert without products.view');
  });

  it('does not mutate the source notifications', () => {
    filterNotificationsForAudience(all, { kind: 'cashier', canViewProducts: true, ...noGrants });
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

  it('refresh is a visible bar button (F5 hint, spinner while refreshing) and not a menu entry', () => {
    assert.ok(header.includes('handleUniversalRefresh') && header.includes('title="تحديث البيانات (F5)"'));
    assert.ok(header.includes('aria-label="تحديث البيانات"') && header.includes('isUniversalRefreshing'));
    assert.ok(!app.includes("id: 'refresh'"), 'refresh is no longer in the more menu');
  });

  it('has no manual switch-user entry: users log out, then log in again', () => {
    assert.ok(!app.includes("'switch-user'") && !app.includes('تبديل المستخدم'));
    assert.ok(app.includes("id: 'logout'"), 'logout stays in the user menu');
  });

  it('keeps the F1 / F5 / F11 shortcuts wired', () => {
    assert.ok(app.includes("e.key === 'F11'") && app.includes("e.key === 'F5'") && app.includes("e.key === 'F1'"));
  });

  it('every capability removed from the bar has a menu entry', () => {
    for (const id of ["'shortcuts'", "'help'", "'logout'", "'minimize'", "'employees'", "'updates'", "'readiness'"]) {
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

describe('app-shell cleanups', () => {
  it('dashboard no longer shows a last-refreshed chip', () => {
    const dash = fs.readFileSync(path.resolve('src', 'views', 'DashboardView.tsx'), 'utf8');
    assert.ok(!dash.includes('آخر تحديث') && !dash.includes('lastRefreshed'));
  });

  it('forced PIN screen is themed for dark mode (card, header, banner, disabled submit)', () => {
    const app = fs.readFileSync(path.resolve('src', 'App.tsx'), 'utf8');
    const shell = app.slice(app.indexOf('requiresForcedPinChange(currentUser)) {'), app.indexOf('const shopSubtitle'));
    for (const pair of ['bg-canvas dark:bg-canvas-dark', 'bg-surface dark:bg-surface-dark ', 'border-line dark:border-line-dark', 'text-ink dark:text-ink-dark']) {
      assert.ok(shell.includes(pair), `${pair} on the forced PIN shell`);
    }
    const form = fs.readFileSync(path.resolve('src', 'components', 'ForcedPinChangeForm.tsx'), 'utf8');
    assert.ok(form.includes('dark:disabled:bg-surface-dark-3') && form.includes('disabled:opacity-100'), 'disabled submit stays readable in dark');
    assert.ok(!form.includes('text-warn dark:text-warn-bright flex'), 'warning copy uses ink text, not warn-on-soft');
  });
});
