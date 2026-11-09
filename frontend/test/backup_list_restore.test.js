import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  BACKUP_LIST_MAX,
  BACKUP_PAGE_SIZE,
  backupCountLabel,
  formatBackupDate,
  formatBackupSize,
  nextBackupLimit,
  normalizeFolderState,
  remainingBackups,
} from '../src/utils/backupList.ts';

const read = (...p) => fs.readFileSync(path.resolve(...p), 'utf8').replace(/\r\n/g, '\n');
const manager = read('src', 'components', 'BackupManager.tsx');
const modal = read('src', 'components', 'DatabaseRecoveryModal.tsx');
const service = read('..', 'desktop', 'Services', 'BackupService.cs');
const database = read('..', 'desktop', 'Services', 'DatabaseService.cs');
const dispatcher = read('..', 'desktop', 'Bridge', 'IpcDispatcher.Backup.cs');
const permissions = read('..', 'desktop', 'Bridge', 'IpcDispatcher.cs');

describe('backup list formatting (pure)', () => {
  it('formats sizes without showing 0 KB for a tiny non-empty file', () => {
    assert.equal(formatBackupSize(0), '0 بايت');
    assert.equal(formatBackupSize(null), '0 بايت');
    assert.equal(formatBackupSize(100), '1 ك.ب');
    assert.equal(formatBackupSize(2048), '2 ك.ب');
    assert.equal(formatBackupSize(1500000), '1.43 م.ب');
  });

  it('shows the device-local date and time, and the raw text only when it cannot be parsed', () => {
    assert.equal(formatBackupDate('2026-03-05 10:00'), '2026-03-05 10:00');
    assert.equal(formatBackupDate(''), 'غير محدد');
    assert.equal(formatBackupDate('not a date'), 'not a date');
  });

  it('labels the total honestly: the real total, never the capped length', () => {
    assert.equal(backupCountLabel(15, 40, null), 'عرض أحدث 15 من إجمالي 40 نسخة');
    assert.equal(backupCountLabel(12, 12, null), 'إجمالي النسخ: 12');
    assert.equal(backupCountLabel(15, 40, 'هذا الشهر'), 'عرض 15 من 40 نسخة خلال هذا الشهر');
    assert.equal(backupCountLabel(3, 3, 'هذا الشهر'), '3 نسخة خلال هذا الشهر');
  });

  it('pages by one step, never above the real total or the host maximum', () => {
    assert.equal(BACKUP_PAGE_SIZE, 15);
    assert.equal(nextBackupLimit(15, 40), 30);
    assert.equal(nextBackupLimit(30, 40), 40);
    assert.equal(nextBackupLimit(15, 16), 16);
    assert.equal(nextBackupLimit(195, 500), BACKUP_LIST_MAX);
    assert.equal(remainingBackups(15, 40), 25);
    assert.equal(remainingBackups(40, 40), 0);
    assert.equal(remainingBackups(200, 500), 0);
  });

  it('only the "ok" state may claim an empty list is an empty folder', () => {
    assert.equal(normalizeFolderState('ok'), 'ok');
    assert.equal(normalizeFolderState(undefined), 'ok');
    assert.equal(normalizeFolderState('unavailable'), 'unavailable');
    assert.equal(normalizeFolderState('unreadable'), 'unreadable');
    assert.equal(normalizeFolderState('garbage'), 'ok');
  });
});

describe('backup list screen (source level)', () => {
  it('uses the shared helpers and never renders the raw createdAt text or a fake verified flag', () => {
    assert.match(manager, /formatBackupDate\(bk\.createdAt\)/);
    assert.doesNotMatch(manager, />\{bk\.createdAt\}</);
    const fileInfo = manager.slice(manager.indexOf('interface BackupFileInfo'), manager.indexOf('interface VerifyOutcome'));
    assert.doesNotMatch(fileInfo, /isVerified/);
    assert.match(manager, /backupCountLabel\(shownCount, totalCount/);
    assert.doesNotMatch(manager, /إجمالي النسخ: \$\{status\?\.recentBackups/);
  });

  it('keeps the shared date filter and sends it with the page size', () => {
    assert.match(manager, /'backup:getStatus', listQueryRef\.current/);
    assert.match(manager, /getDateFilterPayload\(dateFilter, today\)/);
    assert.match(manager, /limit: listLimit/);
    assert.match(manager, /<DateFilterControl value=\{dateFilter\} onChange=\{handleDateFilterChange\}/);
  });

  it('has loading, error and unreadable-folder states that do not claim "no backups"', () => {
    assert.match(manager, /listLoading && !status/);
    assert.match(manager, /تعذر تحميل سجل النسخ الاحتياطية/);
    assert.match(manager, /folderState === 'unreadable'/);
    assert.match(manager, /folderState === 'unavailable'/);
    assert.match(manager, /إعادة المحاولة/);
  });

  it('refreshes the list after a backup without overwriting an unsaved policy draft', () => {
    const create = manager.slice(manager.indexOf('const handleCreateBackup'), manager.indexOf('const handleToggleAutoOnClose'));
    assert.match(create, /await refreshList\(\)/);
    assert.doesNotMatch(create, /fetchBackupStatus/);
    assert.doesNotMatch(create, /folder: targetFolder/);
    const sub = manager.slice(manager.indexOf("useDataSubscription(['settings', 'all']"));
    assert.match(sub.slice(0, 120), /refreshList\(\)/);
  });

  it('verifies with a per-row spinner and a result shown inside the list', () => {
    assert.match(manager, /verifyingPath === bk\.fullPath/);
    assert.match(manager, /verifyOutcomes\[bk\.fullPath\]/);
    assert.match(manager, /animate-spin/);
  });

  it('row buttons are at least 32px high with 12px text and lucide icons only', () => {
    const rows = manager.slice(manager.indexOf('<tbody'), manager.indexOf('</tbody>'));
    const buttons = rows.match(/<AppButton[^>]*\bsize="sm"[^>]*\bicon=\{\w+\}/g) || [];
    assert.ok(buttons.length >= 2, 'verify and restore buttons are AppButton size sm (h-8, text-xs) with a lucide icon');
    assert.doesNotMatch(rows, /text-micro/);
    assert.doesNotMatch(manager, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  });

  it('reloads the whole app after a manual restore (state under every screen was replaced)', () => {
    const block = manager.slice(manager.indexOf('<DatabaseRecoveryModal'), manager.indexOf('<MigrationWizardModal'));
    assert.match(block, /window\.location\.reload\(\)/);
  });

  it('the restore button stays behind the settings.restore permission', () => {
    assert.match(manager, /hasPermission\('settings\.restore'\)/);
    assert.match(manager, /\{canRestore && \(\s*<AppButton[\s\S]{0,300}setRestoreTarget\(bk\)/);
  });

  it('the restore dialog does not call a manually chosen file "verified" and states the consequences', () => {
    assert.match(modal, /isStandaloneDialog \? 'هتتفحص قبل الاسترجاع'/);
    assert.match(modal, /نسخة أمان من بياناتك الحالية/);
    assert.doesNotMatch(modal, /border-red-300/);
  });
});

describe('backup host contract (source level; NUnit S64 covers behaviour)', () => {
  it('lists only finished app backups sorted by their own timestamp with a real total', () => {
    assert.match(service, /Directory\.GetFiles\(folder, "rafiq_backup_\*\.db"\)/);
    assert.match(service, /TotalBackupCount = matches\.Count/);
    assert.match(service, /TryParseBackupTimestamp\(file, out ts\)/);
    assert.doesNotMatch(service, /fi\.CreationTime\.ToString\("yyyy-MM-dd HH:mm"/);
    assert.match(service, /FolderStatus = "unreadable"/);
    assert.match(service, /FolderStatus = "unavailable"/);
  });

  it('creates backups with the SQLite online backup API into staging names, never a bare file copy', () => {
    assert.match(service, /BackupDatabase\(destConn, "main", "main", -1, null, 0\)/);
    assert.doesNotMatch(service, /File\.Copy\(_dbPath/);
    assert.match(service, /backupFilePath \+ "\.raw"/);
    assert.match(service, /File\.Move\(encryptedTempPath, backupFilePath\)/);
  });

  it('retention applies the minimum-copies floor oldest-first so the newest copies survive', () => {
    assert.match(service, /expiredCandidates/);
    assert.match(service, /for \(int i = expiredCandidates\.Count - 1; i >= 0; i--\)/);
    assert.match(service, /MIN_GUARANTEED_COPIES/);
  });

  it('never trusts a path from the UI: verify and restore pass the same gate', () => {
    assert.match(dispatcher, /BackupService\.ValidateRestoreSource\(verifyFilePath/);
    assert.match(database, /BackupService\.ValidateRestoreSource\(candidate/);
    assert.match(database, /CheckRestoreSource\(ResolveRestoreTarget\(backupFilePath\), out targetBackup\)/);
    assert.match(dispatcher, /BackupService\.ValidateTargetFolder\(bFolder\)/);
    assert.match(dispatcher, /BackupService\.ValidateTargetFolder\(customFolder\)/);
  });

  it('requires the owner recovery code for every restore, not only on a corrupt database', () => {
    const restore = dispatcher.slice(dispatcher.indexOf('case "database:restore"'), dispatcher.indexOf('case "backup:verify"'));
    assert.doesNotMatch(restore, /if \(DatabaseService\.IsCorrupted \|\| /);
    assert.match(restore, /DatabaseService\.ValidateRecoveryBackup\(restoreFilePath, restoreMasterKey\)/);
  });

  it('swaps the database from a staged copy and rolls back automatically', () => {
    assert.match(database, /\.incoming_/);
    assert.match(database, /\.rollback_/);
    assert.match(database, /RollBackDatabaseSwap\(/);
    assert.match(database, /wal_checkpoint\(TRUNCATE\)/);
    assert.match(database, /pre_restore/);
  });

  it('the dispatcher maps every backup action to settings.backup and restore to settings.restore', () => {
    for (const action of ['backup:getStatus', 'backup:create', 'backup:getDrives', 'backup:configure', 'backup:verify', 'database:checkIntegrity']) {
      assert.match(permissions, new RegExp(`\\{ "${action}", "settings\\.backup" \\}`));
    }
    assert.match(permissions, /\{ "database:restore", "settings\.restore" \}/);
  });
});
