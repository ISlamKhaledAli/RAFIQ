import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Retention (days / weeks / max copies) is root-only: read-only for everyone else, defaults 14 / 8 / 30,
// and the unsaved-changes chip keeps its slot so the save button never moves.
const read = (...parts) => fs.readFileSync(path.resolve(...parts), 'utf8').replace(/\r\n/g, '\n');
const manager = read('src', 'components', 'BackupManager.tsx');
const retention = read('src', 'utils', 'backupRetention.ts');
const backupService = read('..', 'desktop', 'Services', 'BackupService.cs');
const backupBridge = read('..', 'desktop', 'Bridge', 'IpcDispatcher.Backup.cs');
const systemBridge = read('..', 'desktop', 'Bridge', 'IpcDispatcher.System.cs');

const slice = (src, from, to) => {
  const start = src.indexOf(from);
  assert.ok(start >= 0, `missing: ${from}`);
  const end = src.indexOf(to, start + from.length);
  return src.slice(start, end < 0 ? undefined : end);
};

describe('backup retention is root-only in the UI', () => {
  it('reads the root flag from the auth context', () => {
    assert.ok(/const \{ hasPermission, isRoot \} = useAuth\(\);/.test(manager));
  });

  it('the three retention inputs are disabled for non-root; the warn-after input stays editable', () => {
    for (const value of ['value={retentionDays}', 'value={retentionWeeks}', 'value={maxCopies}']) {
      assert.ok(manager.includes(`${value}\n                  disabled={!isRoot}`), `${value} is disabled for non-root`);
    }
    const warn = slice(manager, 'value={warnAfterDays}', '/>');
    assert.ok(!warn.includes('disabled='), 'warn-after is not retention (it never deletes anything)');
  });

  it('shows the Arabic explanation only for non-root', () => {
    assert.ok(retention.includes("'سياسة الاحتفاظ يضبطها حساب الروت فقط'"));
    assert.ok(/\{!isRoot && \(\s*<p[^>]*>\s*<Lock[^>]*\/>\s*\{RETENTION_ROOT_ONLY_NOTE\}/.test(manager));
  });

  it('a non-root never sends retention values: every backup:configure goes through one payload builder', () => {
    assert.equal(manager.match(/invoke\('backup:configure'/g).length, 3);
    assert.equal(manager.match(/invoke\('backup:configure', buildConfigPayload\(/g).length, 3);
    const builder = slice(manager, 'const buildConfigPayload', 'const handleToggleAutoOnClose');
    const afterSpread = builder.slice(builder.indexOf('...(isRoot'));
    assert.ok(/\.\.\.\(isRoot\s*\?\s*\{[\s\S]*retentionDays[\s\S]*retentionWeeks[\s\S]*maxCopies[\s\S]*\}\s*:\s*\{\}\)/.test(afterSpread));
    assert.ok(!builder.slice(0, builder.indexOf('...(isRoot')).includes('retentionDays'), 'retention only inside the root branch');
  });
});

describe('backup retention defaults come from one place', () => {
  const num = (src, name) => Number(new RegExp(`${name}\\s*=\\s*(\\d+)`).exec(src)[1]);

  it('frontend defaults are 14 days / 8 weeks / 30 copies / warn after 2', () => {
    assert.equal(num(retention, 'DEFAULT_RETENTION_DAYS'), 14);
    assert.equal(num(retention, 'DEFAULT_RETENTION_WEEKS'), 8);
    assert.equal(num(retention, 'DEFAULT_MAX_COPIES'), 30);
    assert.equal(num(retention, 'DEFAULT_WARN_AFTER_DAYS'), 2);
  });

  it('match the host constants (BackupService.DEFAULT_*)', () => {
    for (const name of ['DEFAULT_RETENTION_DAYS', 'DEFAULT_RETENTION_WEEKS', 'DEFAULT_MAX_COPIES', 'DEFAULT_WARN_AFTER_DAYS']) {
      assert.equal(num(backupService, name), num(retention, name), name);
    }
  });

  it('no stale 7 / 4 / 20 fallbacks are left in the manager', () => {
    assert.ok(!/\|\| (7|4|20|2)\b/.test(manager), 'fallbacks use the named defaults');
    assert.ok(manager.includes('useState(DEFAULT_RETENTION_DAYS)') && manager.includes('useState(DEFAULT_MAX_COPIES)'));
  });
});

describe('backup retention is enforced by the host too', () => {
  it('the same Arabic refusal is used by backup:configure and settings writes', () => {
    assert.ok(backupService.includes('"تعديل سياسة الاحتفاظ بالنسخ الاحتياطية متاح لحساب الروت فقط"'));
    assert.ok(backupBridge.includes('!IsCurrentUserRoot() && DatabaseService.Backup.RetentionWouldChange('));
    assert.ok(backupBridge.includes('BackupService.RETENTION_ROOT_ONLY_MESSAGE'));
    assert.ok(systemBridge.includes('BackupService.IsRetentionSettingKey(kvp.Key)') && systemBridge.includes('IsRetentionSettingChange'));
  });
});

describe('the unsaved-changes chip keeps its slot in the backup save bar', () => {
  it('is always mounted and only flips dirty', () => {
    const bar = slice(manager, 'ref={policySaveBarRef}', '</div>');
    assert.ok(bar.includes('<UnsavedChangesChip dirty={policyDirty} />'));
    assert.ok(!/policyDirty\s*&&/.test(bar), 'never mounted conditionally');
    assert.ok(!manager.includes('<UnsavedChangesChip />'));
  });

  it('the chip component reserves space (invisible, not removed) while clean', () => {
    const chip = read('src', 'components', 'UnsavedChangesChip.tsx');
    assert.ok(/aria-hidden="true"[\s\S]*invisible/.test(chip));
    assert.ok(chip.includes('{dirty && <span className="sr-only">'));
  });
});
