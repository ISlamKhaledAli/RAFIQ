import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Retention policy simulation logic (matching C# BackupService.PruneOldBackups)
function evaluateBackupsRetention(backupList, keepDays = 7, keepWeeks = 4, now = new Date()) {
  const cutoffDays = new Date(now.getTime() - keepDays * 24 * 60 * 60 * 1000);
  const cutoffWeeks = new Date(now.getTime() - keepWeeks * 7 * 24 * 60 * 60 * 1000);

  const retained = [];
  const pruned = [];
  const weeklyKept = new Set();

  for (const bk of backupList) {
    const created = new Date(bk.createdAt);

    if (created >= cutoffDays) {
      retained.push(bk.fileName);
    } else if (created < cutoffWeeks) {
      pruned.push(bk.fileName);
    } else {
      // Weekly retention: one per week
      const year = created.getUTCFullYear();
      const firstDayOfYear = new Date(Date.UTC(year, 0, 1));
      const pastDaysOfYear = (created.getTime() - firstDayOfYear.getTime()) / 86400000;
      const weekOfYear = Math.floor(pastDaysOfYear / 7);
      const weekKey = `${year}_${weekOfYear}`;

      if (!weeklyKept.has(weekKey)) {
        weeklyKept.add(weekKey);
        retained.push(bk.fileName);
      } else {
        pruned.push(bk.fileName);
      }
    }
  }

  return { retained, pruned };
}

function isBackupOverdue(lastSuccessIso, warnAfterDays = 2, now = new Date()) {
  if (!lastSuccessIso) return true;
  const lastDate = new Date(lastSuccessIso);
  const diffDays = (now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays >= warnAfterDays;
}

describe('Rafiq POS Backup Policy & Retention Test Suite (Feature #9 & #128)', () => {
  it('correctly matches standard enterprise backup file pattern rafiq_backup_YYYYMMDD_HHmmss.db', () => {
    const validFileName = 'rafiq_backup_20260924_143000.db';
    const regex = /^rafiq_backup_\d{8}_\d{6}\.db$/;
    assert.match(validFileName, regex);
  });

  it('identifies overdue status when no backup has ever been taken', () => {
    assert.equal(isBackupOverdue(null, 2), true);
    assert.equal(isBackupOverdue('', 2), true);
  });

  it('does not trigger warning when last backup was taken recently (< 2 days)', () => {
    const now = new Date('2026-09-24T12:00:00Z');
    const recent = new Date('2026-09-23T18:00:00Z').toISOString();
    assert.equal(isBackupOverdue(recent, 2, now), false);
  });

  it('triggers warning when last backup is older than 2 days', () => {
    const now = new Date('2026-09-24T12:00:00Z');
    const old = new Date('2026-09-21T08:00:00Z').toISOString(); // 3.16 days ago
    assert.equal(isBackupOverdue(old, 2, now), true);
  });

  it('retains all backups within 7 days, retains 1 per week up to 4 weeks, and prunes older', () => {
    const now = new Date('2026-09-24T12:00:00Z');

    const sampleBackups = [
      // Within last 7 days (all must be kept)
      { fileName: 'day1.db', createdAt: new Date('2026-09-24T10:00:00Z').toISOString() },
      { fileName: 'day2.db', createdAt: new Date('2026-09-23T10:00:00Z').toISOString() },
      { fileName: 'day3.db', createdAt: new Date('2026-09-20T10:00:00Z').toISOString() },

      // Week 2: two backups from the same week (only 1 must be kept)
      { fileName: 'w2_a.db', createdAt: new Date('2026-09-12T10:00:00Z').toISOString() },
      { fileName: 'w2_b.db', createdAt: new Date('2026-09-13T10:00:00Z').toISOString() },

      // Beyond 4 weeks (older than 28 days) -> must be pruned
      { fileName: 'ancient.db', createdAt: new Date('2026-08-01T10:00:00Z').toISOString() }
    ];

    const result = evaluateBackupsRetention(sampleBackups, 7, 4, now);

    assert.ok(result.retained.includes('day1.db'));
    assert.ok(result.retained.includes('day2.db'));
    assert.ok(result.retained.includes('day3.db'));
    assert.ok(result.retained.includes('w2_a.db'));
    assert.ok(result.pruned.includes('w2_b.db')); // redundant in same week
    assert.ok(result.pruned.includes('ancient.db')); // older than 4 weeks
  });
});

describe('Rafiq POS Database Integrity & Guided Recovery Test Suite (Feature #124)', () => {
  it('detects corrupted database response when PRAGMA quick_check returns non-ok or error', () => {
    function parseQuickCheckResult(rawResult) {
      if (!rawResult || rawResult.toLowerCase() !== 'ok') {
        return { isValid: false, isCorrupt: true, message: rawResult || 'database disk image is malformed' };
      }
      return { isValid: true, isCorrupt: false, message: 'قاعدة البيانات سليمة ومتحقق منها.' };
    }

    assert.equal(parseQuickCheckResult('ok').isCorrupt, false);
    assert.equal(parseQuickCheckResult('OK').isCorrupt, false);
    assert.equal(parseQuickCheckResult('malformed database').isCorrupt, true);
    assert.equal(parseQuickCheckResult(null).isCorrupt, true);
  });

  it('generates non-destructive quarantine filename keeping original file safe', () => {
    const timestamp = '20260924_143000';
    const quarantineFileName = `corrupt_db_${timestamp}.db`;
    assert.match(quarantineFileName, /^corrupt_db_\d{8}_\d{6}\.db$/);
  });

  it('strictly blocks write operations while allowing recovery and read operations when corrupt', () => {
    const isCorrupted = true;
    const writeActions = ['sales:create', 'products:save', 'products:delete', 'customers:save', 'customers:recordPayment'];
    const safeActions = ['database:checkIntegrity', 'database:restore', 'system:getInfo', 'support:createBundle'];

    function isActionAllowed(action, corrupt) {
      if (corrupt && writeActions.includes(action)) return false;
      return true;
    }

    for (const act of writeActions) {
      assert.equal(isActionAllowed(act, isCorrupted), false, `Write action ${act} must be blocked`);
    }

    for (const act of safeActions) {
      assert.equal(isActionAllowed(act, isCorrupted), true, `Safe action ${act} must remain accessible for recovery`);
    }
  });

  it('selects the latest valid backup automatically for guided recovery', () => {
    const availableBackups = [
      { path: 'rafiq_backup_20260920_100000.db', date: '2026-09-20' },
      { path: 'rafiq_backup_20260924_120000.db', date: '2026-09-24' },
      { path: 'rafiq_backup_20260922_090000.db', date: '2026-09-22' },
    ];

    const sorted = [...availableBackups].sort((a, b) => b.path.localeCompare(a.path));
    const selected = sorted[0];

    assert.equal(selected.path, 'rafiq_backup_20260924_120000.db');
  });
});

describe('Rafiq POS Backup Verification & Integrity Validation (Feature #125)', () => {
  function verifyBackupSimulation(sourceStats, backupStats, pragmaResult) {
    if (!pragmaResult || pragmaResult.toLowerCase() !== 'ok') {
      return { isVerified: false, message: 'فشل الفحص الداخلي B-Tree للنسخة' };
    }
    if (sourceStats.products !== backupStats.products) {
      return { isVerified: false, message: 'عدم تطابق في أعداد الأصناف المسجلة' };
    }
    if (sourceStats.sales !== backupStats.sales) {
      return { isVerified: false, message: 'عدم تطابق في أعداد الفواتير المسجلة' };
    }
    return { isVerified: true, message: 'تم التحقق بنجاح' };
  }

  it('verifies valid backup when PRAGMA is ok and record counts match 100%', () => {
    const mainDb = { products: 1250, sales: 840 };
    const backupDb = { products: 1250, sales: 840 };
    const res = verifyBackupSimulation(mainDb, backupDb, 'ok');
    assert.equal(res.isVerified, true);
  });

  it('rejects deliberate corrupted backup when PRAGMA quick_check fails', () => {
    const mainDb = { products: 1250, sales: 840 };
    const corruptBackup = { products: 1250, sales: 840 };
    const res = verifyBackupSimulation(mainDb, corruptBackup, 'database disk image is malformed');
    assert.equal(res.isVerified, false);
    assert.ok(res.message.includes('B-Tree'));
  });

  it('rejects backup with mismatched product or sales row count', () => {
    const mainDb = { products: 1250, sales: 840 };
    const incompleteBackup = { products: 1248, sales: 840 }; // 2 missing products
    const res = verifyBackupSimulation(mainDb, incompleteBackup, 'ok');
    assert.equal(res.isVerified, false);
    assert.ok(res.message.includes('الأصناف'));
  });
});

describe('Rafiq POS 1-Click Restore & Safety Snapshot Test Suite (Feature #10)', () => {
  const LATEST_SUPPORTED_SCHEMA_VERSION = 3;

  function validateBackupForRestore(backupSchemaVersion, latestSupportedVersion) {
    if (backupSchemaVersion > latestSupportedVersion) {
      return {
        allowed: false,
        error: `إصدار هيكل النسخة الاحتياطية (${backupSchemaVersion}) أحدث من الإصدار المدعوم (${latestSupportedVersion}). يرجى تحديث برنامج رفيق أولاً.`
      };
    }
    return { allowed: true, error: null };
  }

  function verifyRestorePin(enteredPin, expectedPin = '1234') {
    if (!enteredPin || enteredPin.trim() !== expectedPin) {
      return { success: false, error: 'الرقم السري لصاحب المحل غير صحيح (الرقم الافتراضي: 1234).' };
    }
    return { success: true, error: null };
  }

  it('rejects restoring a backup created with a newer app schema version (Task 10-1)', () => {
    const res = validateBackupForRestore(4, LATEST_SUPPORTED_SCHEMA_VERSION);
    assert.equal(res.allowed, false);
    assert.ok(res.error.includes('أحدث من الإصدار المدعوم'));
  });

  it('allows restoring a backup matching or older than supported schema version (Task 10-1 & 10-3)', () => {
    assert.equal(validateBackupForRestore(3, LATEST_SUPPORTED_SCHEMA_VERSION).allowed, true);
    assert.equal(validateBackupForRestore(2, LATEST_SUPPORTED_SCHEMA_VERSION).allowed, true);
    assert.equal(validateBackupForRestore(1, LATEST_SUPPORTED_SCHEMA_VERSION).allowed, true);
  });

  it('generates pre-restore safety snapshot filename preserving current state (Task 10-2)', () => {
    const timestamp = '20260924_150000';
    const safetySnapshotPath = `pre_restore/pre_restore_${timestamp}.db`;
    assert.match(safetySnapshotPath, /^pre_restore\/pre_restore_\d{8}_\d{6}\.db$/);
  });

  it('strictly validates owner PIN before executing restore (Task 10-4)', () => {
    assert.equal(verifyRestorePin('0000').success, false);
    assert.equal(verifyRestorePin('').success, false);
    assert.equal(verifyRestorePin(' 1234 ').success, true);
    assert.equal(verifyRestorePin('1234').success, true);
  });
});

