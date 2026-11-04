import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  getRoleLabel,
  getRoleKind,
  getTier,
  canManageUser,
  isOwnerOrRoot,
  getRoleBadgeClasses,
  getRoleNameClasses,
} from '../src/utils/roleLabels.ts';
import { APP_TITLE, getShopSubtitle } from '../src/utils/appBranding.ts';
import { INITIAL_STORE_TEMPLATES } from '../src/constants/storeTemplates.ts';
import { PERMISSION_GROUPS } from '../src/constants/permissionGroups.ts';

const root = { id: 'usr_root', username: 'islam', role: 'root', isOwner: false };
const owner = { id: 'usr_admin_default', username: 'admin', role: 'admin', isOwner: true };
const manager = { id: 'usr_mgr', username: 'mgr', role: 'admin', isOwner: false };
const manager2 = { id: 'usr_mgr2', username: 'mgr2', role: 'admin' };
const cashier = { id: 'usr_c', username: 'c1', role: 'cashier', isOwner: false };

describe('roleLabels: labels and tiers', () => {
  it('labels each tier correctly', () => {
    assert.equal(getRoleLabel(root), 'المطور (Root)');
    assert.equal(getRoleLabel(owner), 'المالك');
    assert.equal(getRoleLabel(manager), 'مدير');
    assert.equal(getRoleLabel(cashier), 'كاشير');
  });

  it('never labels anyone below the owner as the owner', () => {
    for (const u of [manager, manager2, cashier, { role: 'cashier', isOwner: false }, { role: 'admin' }, null, undefined]) {
      assert.notEqual(getRoleLabel(u), 'المالك');
      assert.notEqual(getRoleLabel(u), 'المطور (Root)');
    }
    // only an explicit isOwner === true earns the owner label
    assert.equal(getRoleLabel({ role: 'admin', isOwner: undefined }), 'مدير');
  });

  it('keeps root distinct from the owner label', () => {
    assert.notEqual(getRoleLabel(root), 'المالك');
    assert.equal(getRoleKind({ role: 'root', isOwner: true }), 'root');
  });

  it('orders tiers root 3 > owner 2 > manager 1 > cashier 0', () => {
    assert.equal(getTier(root), 3);
    assert.equal(getTier(owner), 2);
    assert.equal(getTier(manager), 1);
    assert.equal(getTier(cashier), 0);
    assert.equal(getTier(null), 0);
  });

  it('treats a missing user as the lowest tier cashier', () => {
    assert.equal(getRoleLabel(null), 'كاشير');
  });

  it('flags owner and root as owner-level sessions only', () => {
    assert.equal(isOwnerOrRoot(root), true);
    assert.equal(isOwnerOrRoot(owner), true);
    assert.equal(isOwnerOrRoot(manager), false);
    assert.equal(isOwnerOrRoot(cashier), false);
  });

  it('provides distinct badge classes per tier using design tokens only', () => {
    const classes = [root, owner, manager, cashier].map(getRoleBadgeClasses);
    assert.equal(new Set(classes).size, 4);
    for (const c of classes) {
      assert.ok(!/slate-|#[0-9a-fA-F]{3,6}/.test(c), `no ad-hoc colours in: ${c}`);
    }
  });
});

describe('roleLabels: canManageUser', () => {
  it('root manages everyone below, including owner', () => {
    assert.equal(canManageUser(root, owner), true);
    assert.equal(canManageUser(root, manager), true);
    assert.equal(canManageUser(root, cashier), true);
  });

  it('owner manages managers and cashiers but not root or himself', () => {
    assert.equal(canManageUser(owner, manager), true);
    assert.equal(canManageUser(owner, cashier), true);
    assert.equal(canManageUser(owner, root), false);
    assert.equal(canManageUser(owner, owner), false);
  });

  it('manager manages cashiers only', () => {
    assert.equal(canManageUser(manager, cashier), true);
    assert.equal(canManageUser(manager, manager2), false);
    assert.equal(canManageUser(manager, manager), false);
    assert.equal(canManageUser(manager, owner), false);
    assert.equal(canManageUser(manager, root), false);
  });

  it('cashier manages nobody', () => {
    assert.equal(canManageUser(cashier, cashier), false);
    assert.equal(canManageUser(cashier, manager), false);
    assert.equal(canManageUser(cashier, owner), false);
  });

  it('returns false when either side is missing', () => {
    assert.equal(canManageUser(null, cashier), false);
    assert.equal(canManageUser(owner, null), false);
    assert.equal(canManageUser(undefined, undefined), false);
  });
});

describe('PERMISSION_GROUPS catalogue', () => {
  const allKeys = PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => i.key));

  it('has unique group ids (epay and wallets appear exactly once)', () => {
    const ids = PERMISSION_GROUPS.map((g) => g.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(ids.filter((id) => id === 'epay').length, 1);
    assert.equal(ids.filter((id) => id === 'wallets').length, 1);
  });

  it('has unique permission keys across all groups', () => {
    const dupes = allKeys.filter((k, i) => allKeys.indexOf(k) !== i);
    assert.deepEqual(dupes, []);
  });

  it('merges the epay and wallets key unions', () => {
    const epay = PERMISSION_GROUPS.find((g) => g.id === 'epay').items.map((i) => i.key);
    const wallets = PERMISSION_GROUPS.find((g) => g.id === 'wallets').items.map((i) => i.key);
    for (const k of ['access', 'transact', 'fund', 'terminals_manage', 'history', 'analytics', 'cancel', 'balance_adjust']) {
      assert.ok(epay.includes(`epay.${k}`), `epay.${k}`);
    }
    for (const k of ['access', 'transact', 'fund', 'accounts_manage', 'history', 'analytics', 'cancel', 'balance_adjust']) {
      assert.ok(wallets.includes(`wallets.${k}`), `wallets.${k}`);
    }
  });

  it('only lists keys that exist in the server ALL_PERMISSIONS', () => {
    const svc = fs.readFileSync(path.resolve('..', 'desktop', 'Services', 'SecurityService.cs'), 'utf8');
    const start = svc.indexOf('ALL_PERMISSIONS = new string[]');
    assert.ok(start > 0, 'ALL_PERMISSIONS must exist');
    const block = svc.slice(start, svc.indexOf('};', start));
    const serverKeys = new Set([...block.matchAll(/"([a-z_.]+)"/g)].map((m) => m[1]));
    const unknown = allKeys.filter((k) => !serverKeys.has(k));
    assert.deepEqual(unknown, []);
  });

  it('hides owner/root-only and retired keys from the editor', () => {
    for (const k of [
      'settings.restore', 'settings.license', 'settings.features', 'audit_log.view', 'users.delegate',
      'pharma.controlled.view_full', 'expenses.cancel', 'db_recovery', 'refunds', 'cancel_sale',
    ]) {
      assert.ok(!allKeys.includes(k), `${k} must not be listed`);
    }
  });

  it('follows the agreed logical group order', () => {
    const order = PERMISSION_GROUPS.map((g) => g.id);
    const expected = [
      'pos', 'pricing', 'shifts', 'invoices', 'customers', 'products', 'stock', 'purchases',
      'expenses', 'epay', 'wallets', 'reports', 'settings', 'users', 'pharma', 'insurance',
    ];
    assert.deepEqual(order.slice(0, expected.length), expected);
    assert.equal(order[order.length - 1], 'cafe_restaurant');
  });

  it('keeps related keys in their intended groups', () => {
    const groupOf = (key) => PERMISSION_GROUPS.find((g) => g.items.some((i) => i.key === key))?.id;
    assert.equal(groupOf('pos.discount_line'), 'pricing');
    assert.equal(groupOf('pos.price_override'), 'pricing');
    assert.equal(groupOf('categories.manage'), 'products');
    assert.equal(groupOf('inventory.locations.manage'), 'stock');
    assert.equal(groupOf('stock.adjust'), 'stock');
    assert.equal(groupOf('shortage.view'), 'purchases');
    assert.equal(groupOf('suppliers.manage'), 'purchases');
    assert.equal(groupOf('reports.pharma.view'), 'pharma');
    assert.equal(groupOf('returns.create'), 'invoices');
  });

  it('gates feature-specific groups behind their store feature flag', () => {
    const featureOf = (id) => PERMISSION_GROUPS.find((g) => g.id === id)?.feature;
    assert.equal(featureOf('pharma'), 'feature_pharmacy');
    assert.equal(featureOf('insurance'), 'feature_insurance');
    assert.equal(featureOf('patients'), 'feature_patient_profiles');
    assert.equal(featureOf('epay'), 'feature_epay_services');
    assert.equal(featureOf('wallets'), 'feature_digital_wallets');
    assert.equal(featureOf('cafe_restaurant'), 'feature_cafe_restaurant');
    const cafeKeys = PERMISSION_GROUPS.find((g) => g.id === 'cafe_restaurant').items.map((i) => i.key);
    for (const prefix of ['tables.', 'kot.', 'modifiers.', 'delivery.', 'recipes.']) {
      assert.ok(cafeKeys.some((k) => k.startsWith(prefix)), `cafe group covers ${prefix}`);
    }
  });

  it('has no label typos from the old catalogue', () => {
    const text = PERMISSION_GROUPS.flatMap((g) => [g.name, ...g.items.flatMap((i) => [i.label, i.description])]).join(' ');
    assert.ok(!text.includes('الأصنيع'));
  });
});

describe('frontend wiring regressions', () => {
  const read = (...p) => fs.readFileSync(path.resolve('src', ...p), 'utf8');

  it('PosView uses the real delivery permission keys', () => {
    const src = read('views', 'PosView.tsx');
    for (const bad of ['delivery.manage_orders', 'delivery.settle_riders', 'delivery.configure_zones_riders']) {
      assert.ok(!src.includes(bad), `${bad} must be gone`);
    }
    for (const good of ['delivery.orders.manage', 'delivery.riders.settle', 'delivery.zones_riders.configure']) {
      assert.ok(src.includes(good), `${good} must be used`);
    }
  });

  it('UserManagerModal no longer exposes delegation, sub-account row button or password credentials', () => {
    const src = read('components', 'UserManagerModal.tsx');
    assert.ok(!/canDelegate|maxDepth|setDelegation/.test(src), 'delegation must be removed');
    assert.ok(!src.includes('حساب فرعي</span>'), 'row-level sub-account button must be removed');
    assert.ok(!src.includes('users:setPassword'), 'password setting must not be called');
    assert.ok(!/credMethod/.test(src), 'credential method switcher must be removed');
    assert.ok(src.includes('deleteUser('), 'delete goes through the typed ipc wrapper');
  });

  it('no PIN or password input advertises bullet placeholders', () => {
    const dir = path.resolve('src');
    const hits = [];
    const walk = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.tsx$/.test(e.name) && fs.readFileSync(p, 'utf8').includes('••')) hits.push(p);
      }
    };
    walk(dir);
    assert.deepEqual(hits, []);
  });

  it('ipc exposes users:delete through a typed wrapper', () => {
    const src = read('bridge', 'ipc.ts');
    assert.ok(src.includes("'users:delete'"));
    assert.ok(/export async function deleteUser\(id: string\)/.test(src));
    assert.ok(/isOwner\?: boolean/.test(src));
  });
});

describe('header role colour (name only, no parenthesised role text)', () => {
  it('uses distinct token classes for owner, manager and cashier, with dark variants', () => {
    const [o, m, c] = ['owner', 'manager', 'cashier'].map((k) => getRoleNameClasses(k));
    assert.equal(new Set([o, m, c, getRoleNameClasses('root')]).size, 4);
    for (const cls of [o, m, c, getRoleNameClasses('root')]) {
      assert.ok(/dark:text-/.test(cls), `dark variant missing in: ${cls}`);
      assert.ok(!/slate-|#[0-9a-fA-F]{3,6}/.test(cls), `no ad-hoc colours in: ${cls}`);
    }
  });

  it('maps users to their kind colour via getRoleKind', () => {
    assert.equal(getRoleNameClasses(getRoleKind(owner)), getRoleNameClasses('owner'));
    assert.equal(getRoleNameClasses(getRoleKind(manager)), getRoleNameClasses('manager'));
    assert.equal(getRoleNameClasses(getRoleKind(cashier)), getRoleNameClasses('cashier'));
  });

  it('App header no longer renders the role in parentheses', () => {
    const app = fs.readFileSync(path.resolve('src', 'App.tsx'), 'utf8');
    assert.ok(!app.includes('({getRoleLabel(currentUser)})'));
    assert.ok(app.includes('getRoleNameClasses(headerAccess.kind)'), 'name is coloured by the role kind computed once via getRoleKind');
    assert.ok(fs.readFileSync(path.resolve('src', 'utils', 'headerVisibility.ts'), 'utf8').includes('getRoleKind(input.user)'));
  });
});

describe('app title branding', () => {
  it('uses the fixed product title and hides placeholder shop names', () => {
    assert.equal(APP_TITLE, 'نظام رفيق');
    for (const placeholder of ['', '  ', null, undefined, 'متجر رفيق', 'رفيق POS', 'نظام رفيق']) {
      assert.equal(getShopSubtitle(placeholder), null);
    }
    assert.equal(getShopSubtitle('  سوبر ماركت النور '), 'سوبر ماركت النور');
  });
});

describe('cafe permission group is feature-gated', () => {
  it('declares feature_cafe_restaurant on the cafe_restaurant group', () => {
    const cafe = PERMISSION_GROUPS.find((g) => g.id === 'cafe_restaurant');
    assert.ok(cafe, 'cafe_restaurant group must exist');
    assert.equal(cafe.feature, 'feature_cafe_restaurant');
  });

  it('the supermarket template does not enable the cafe feature', () => {
    const supermarket = INITIAL_STORE_TEMPLATES.find((t) => t.id === 'supermarket');
    assert.ok(supermarket, 'supermarket template must exist');
    assert.notEqual(supermarket.featureFlags.feature_cafe_restaurant, true);
    const cafeTemplate = INITIAL_STORE_TEMPLATES.find((t) => t.id === 'cafe_restaurant');
    assert.equal(cafeTemplate.featureFlags.feature_cafe_restaurant, true);
  });
});
