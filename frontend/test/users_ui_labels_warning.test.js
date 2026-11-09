import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const src = readFileSync(join(ROOT, 'src', 'components', 'UserManagerModal.tsx'), 'utf8').replace(/\r\n/g, '\n');

// Every <AppButton ...> opening tag (attributes may span lines; arrows of inline handlers are masked first).
const countIconOnly = (code) =>
  [...code.replace(/=>/g, '=_').matchAll(/<AppButton\b([^>]*?)(\/)?>/g)]
    .map((m) => ({ attrs: m[1], selfClosing: Boolean(m[2]) }))
    .filter((b) => /\bicon=/.test(b.attrs) && b.selfClosing);

describe('every icon button in the users modal shows a visible label', () => {
  it('no AppButton with an icon is self-closing (icon-only)', () => {
    assert.deepEqual(countIconOnly(src).map((b) => b.attrs.replace(/\s+/g, ' ').trim()), []);
    assert.equal(countIconOnly('<AppButton icon={X} onClick={() => go()} />').length, 1, 'the detector sees an icon-only button');
  });

  it('the row actions carry a short Arabic label and keep their aria-label', () => {
    assert.doesNotMatch(src, /طي الفروع|expandedNodes/, 'the staff tree has no collapse control');
    assert.match(src, /aria-label=\{node\.isActive \? 'تعطيل الحساب' : 'تفعيل الحساب'\}[\s\S]*?\{node\.isActive \? 'تعطيل' : 'تفعيل'\}/);
    assert.match(src, /aria-label="حذف الحساب" onClick=\{\(\) => setDeleteTarget\(node\)\}>\n\s+حذف\n\s+<\/AppButton>/);
    assert.match(src, /aria-label="إغلاق" onClick=\{requestClose\}>\n\s+إغلاق\n/);
  });

  it('the permission, PIN, edit and add actions keep their text labels and RBAC gates', () => {
    for (const label of ['الصلاحيات', 'الرقم السري', 'تعديل']) assert.ok(src.includes(`\n                ${label}\n`) || src.includes(`>\n                ${label}\n`), label);
    assert.match(src, /canManageNode && \(nodeKind === 'cashier' \|\| \(nodeKind === 'manager' && viewerTier >= 2\)\)/);
    assert.match(src, /const canDeleteNode = canManageNode && !isSelf && !isOwnerOrRootNode;/);
  });
});

describe('the cascade warning only appears for an account that supervises others', () => {
  it('computes the subordinates from the parent chain of the flat user list', () => {
    assert.match(src, /const selectedSubordinates = useMemo\(/);
    assert.match(src, /u\.parentId === parent && !seen\.has\(u\.id\)/);
  });

  it('renders the warning only when there are subordinates, with the count and up to 3 names', () => {
    assert.match(src, /\{selectedSubordinates\.length > 0 && \(\n\s+<div[^>]*>\n\s+<AlertTriangle/);
    assert.match(src, /describeSubordinates\(selectedSubordinates\)\}: أي صلاحية هتشيلها منه هتتشال تلقائياً وفوراً من الموظفين التابعين له\./);
    assert.match(src, /هذا الحساب يشرف على \$\{countPhrase\} \(\$\{names\}\)/);
    assert.match(src, /subordinates\.slice\(0, 3\)/);
    assert.ok(!src.includes('من كل الموظفين التابعين ليه وتحت إشرافه'), 'the unconditional sentence is gone');
  });
});
