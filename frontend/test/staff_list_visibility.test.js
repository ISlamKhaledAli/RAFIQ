import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { filterVisibleStaff } from '../src/utils/roleLabels.ts';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (...p) => readFileSync(join(ROOT, 'src', ...p), 'utf8').replace(/\r\n/g, '\n');
const modal = read('components', 'UserManagerModal.tsx');
const ipc = read('bridge', 'ipc.ts');
const labels = read('utils', 'roleLabels.ts');

const rootU = { id: 'r', role: 'root', username: 'dev' };
const owner = { id: 'o', role: 'admin', isOwner: true, username: 'admin' };
const manager1 = { id: 'm1', role: 'admin', username: 'm1' };
const manager2 = { id: 'm2', role: 'admin', username: 'm2' };
const cashier = { id: 'c1', role: 'cashier', username: 'c1' };
const everyone = [rootU, owner, manager1, manager2, cashier];
const ids = (list) => list.map((u) => u.id);

describe('filterVisibleStaff: only accounts strictly below the viewer', () => {
  it('root sees owner, managers and cashiers but not himself', () => {
    assert.deepEqual(ids(filterVisibleStaff(rootU, everyone)), ['o', 'm1', 'm2', 'c1']);
  });

  it('the owner sees managers and cashiers only (no root, not himself)', () => {
    assert.deepEqual(ids(filterVisibleStaff(owner, everyone)), ['m1', 'm2', 'c1']);
  });

  it('a manager sees cashiers only (no owner, no other manager, not himself)', () => {
    assert.deepEqual(ids(filterVisibleStaff(manager1, everyone)), ['c1']);
  });

  it('a cashier-tier viewer only drops himself (the host limits him to his descendants)', () => {
    assert.deepEqual(ids(filterVisibleStaff(cashier, [cashier, { id: 'c2', role: 'cashier' }])), ['c2']);
  });

  it('no viewer means nobody is visible (fail closed) and the input is not mutated', () => {
    assert.deepEqual(filterVisibleStaff(null, everyone), []);
    assert.deepEqual(filterVisibleStaff(undefined, everyone), []);
    assert.equal(everyone.length, 5);
  });

  it('a stale host that returns a user named root is still treated as root', () => {
    assert.deepEqual(ids(filterVisibleStaff(owner, [{ id: 'x', role: 'admin', username: 'root' }, cashier])), ['c1']);
  });
});

describe('the staff screen applies the rule and handles an absent self / owner', () => {
  it('loadData filters the host list with the viewer and the old root-only filter is gone', () => {
    assert.match(modal, /filterVisibleStaff\(viewer, allList \|\| \[\]\)/);
    assert.doesNotMatch(modal, /isRootSession \|\| u\.role !== 'root'/);
    assert.match(modal, /\}, \[viewerId, viewerRole, viewerIsOwner, viewerUsername\]\);/, 'loadData depends on primitive viewer fields only');
  });

  it('shows a friendly empty state before the search-empty state, with the add button still above it', () => {
    const empty = modal.indexOf('لا يوجد موظفون تحت حسابك حتى الآن');
    const searchEmpty = modal.indexOf('لا يوجد موظفون يطابقون كلمة البحث.');
    assert.ok(empty > 0 && searchEmpty > empty);
    assert.ok(modal.indexOf('إضافة حساب موظف جديد') < empty);
    assert.match(modal, /\) : users\.length === 0 \? \(/);
  });

  it('permission capping never falls back to a listed account: it uses the caller', () => {
    assert.match(modal, /return currentUser \|\| null;/);
    assert.match(modal, /return findUserById\(parentId\) \|\| currentUser \|\| null;/);
    assert.doesNotMatch(modal, /users\.find\(\(u\) => getTier\(u\) >= 1\)/);
  });

  it('the list is flat: one row per account, no nesting, and a cashier shows the manager he works under', () => {
    assert.doesNotMatch(modal, /buildTreeFromFlat|userTree|node\.children|marginRight/);
    assert.match(modal, /function sortStaff\(list: UserDto\[\]\): UserDto\[\]/);
    assert.match(modal, /filteredUsers\.map\(\(u\) => renderStaffRow\(u\)\)/);
    assert.match(modal, /تابع لـ \{supervisor\.displayName\}/);
  });
});

describe('the browser mock mirrors the host rule', () => {
  it('users:getAll and users:getTree both go through the one mock helper', () => {
    assert.match(ipc, /function getMockStaffVisibleToCaller\(\): UserDto\[\]/);
    assert.match(ipc, /case 'users:getAll': \{[\s\S]*?getMockStaffVisibleToCaller\(\)/);
    assert.match(ipc, /case 'users:getTree': \{\n\s+return getMockStaffVisibleToCaller\(\)/);
    assert.match(ipc, /if \(getTier\(caller\) >= 1\) return filterVisibleStaff\(caller, mockUsers\);/);
    assert.match(ipc, /if \(!caller\) return \[\];/);
  });

  it('the login picker mock (users:getActive) is untouched', () => {
    assert.match(ipc, /mockUsers\.filter\(x => x\.isActive && x\.role !== 'root'\)/);
  });

  it('roleLabels stays pure (no imports)', () => {
    assert.doesNotMatch(labels, /^import /m);
    assert.match(labels, /export function filterVisibleStaff/);
  });
});
