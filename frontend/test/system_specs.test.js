import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildDatabaseCells,
  databaseSizeLabel,
  databaseStateLabel,
  journalModeLabel,
  lastBackupLabel,
  licenseTypeLabel,
  schemaVersionLabel,
} from '../src/utils/systemSpecs.ts';

describe('licenseTypeLabel', () => {
  it('maps every type the host produces to Arabic', () => {
    assert.equal(licenseTypeLabel('unlicensed'), 'غير مفعّل');
    assert.equal(licenseTypeLabel('trial'), 'تجريبي');
    assert.equal(licenseTypeLabel('monthly'), 'اشتراك شهري');
    assert.equal(licenseTypeLabel('annual'), 'اشتراك سنوي');
    assert.equal(licenseTypeLabel('lifetime'), 'دائم (مدى الحياة)');
    assert.equal(licenseTypeLabel(' Lifetime '), 'دائم (مدى الحياة)');
  });
  it('shows an unknown value as received and nothing for a missing one', () => {
    assert.equal(licenseTypeLabel('enterprise'), 'enterprise');
    assert.equal(licenseTypeLabel(''), '');
    assert.equal(licenseTypeLabel(undefined), '');
  });
});

describe('database facts', () => {
  it('state: connected, failed, or unknown (older host)', () => {
    assert.equal(databaseStateLabel({ dbOk: true }), 'متصلة وسليمة');
    assert.equal(databaseStateLabel({ dbOk: false }), 'تعذر فتح قاعدة البيانات');
    assert.equal(databaseStateLabel({}), '');
    assert.equal(databaseStateLabel(null), '');
  });
  it('journal mode: WAL explained, anything else shown as measured', () => {
    assert.equal(journalModeLabel('wal'), 'WAL (آمن ضد انقطاع الكهرباء)');
    assert.equal(journalModeLabel('delete'), 'DELETE');
    assert.equal(journalModeLabel(''), '');
  });
  it('schema version and size', () => {
    assert.equal(schemaVersionLabel(66), '66');
    assert.equal(schemaVersionLabel(0), '');
    assert.equal(schemaVersionLabel(undefined), '');
    assert.equal(databaseSizeLabel(4404019), '4.20 ميجابايت');
    assert.equal(databaseSizeLabel(0), '');
    assert.equal(databaseSizeLabel(undefined), '');
  });
  it('last backup: never, unknown, invalid, and a real time', () => {
    assert.equal(lastBackupLabel(''), 'لم تؤخذ بعد');
    assert.equal(lastBackupLabel(undefined), '');
    assert.equal(lastBackupLabel('not a date'), '');
    assert.match(lastBackupLabel('2026-05-01T10:00:00.0000000Z'), /^2026-05-0[12] \d\d:\d\d$/);
  });
});

describe('buildDatabaseCells', () => {
  it('healthy database', () => {
    const cells = buildDatabaseCells({ dbOk: true, dbJournalMode: 'wal', dbSchemaVersion: 66, dbSizeBytes: 1048576 });
    assert.deepEqual(cells.map((c) => c.value), ['متصلة وسليمة', 'WAL (آمن ضد انقطاع الكهرباء)', '66', '1.00 ميجابايت']);
    assert.ok(cells.every((c) => c.tone === 'normal'));
  });
  it('failed check is a danger state carrying the host reason', () => {
    const cells = buildDatabaseCells({ dbOk: false, dbError: 'ملف قاعدة البيانات غير موجود.' });
    assert.equal(cells[0].tone, 'danger');
    assert.equal(cells[0].value, 'تعذر فتح قاعدة البيانات: ملف قاعدة البيانات غير موجود.');
    assert.equal(cells[1].value, '');
  });
  it('an older host without the new fields shows dashes, not a false "healthy"', () => {
    const cells = buildDatabaseCells({});
    assert.ok(cells.every((c) => c.value === '' && c.tone === 'normal'));
  });
});

describe('Help Center section wiring and host sources', () => {
  const read = (...p) => fs.readFileSync(path.resolve(...p), 'utf8').replace(/\r\n/g, '\n');
  const help = read('src', 'components', 'HelpCenterModal.tsx');
  const bridge = read('..', 'desktop', 'Bridge', 'IpcDispatcher.System.cs');
  const db = read('..', 'desktop', 'Services', 'DatabaseService.cs');

  it('renders from the structured fields, not the raw dbStatus string or the raw licence type', () => {
    assert.ok(help.includes('...buildDatabaseCells(sysInfo)') && help.includes('licenseTypeLabel(licenseInfo?.licenseType)'));
    assert.ok(!help.includes('sysInfo?.dbStatus') && !help.includes('licenseInfo?.licenseType,'));
  });
  it('the host measures instead of printing a fixed string', () => {
    assert.ok(bridge.includes('DatabaseService.GetHealth()') && bridge.includes('dbJournalMode = dbHealth.JournalMode'));
    assert.ok(db.includes('PRAGMA journal_mode;') && db.includes('MAX(version), 0) FROM schema_migrations'));
    assert.ok(!db.includes('WAL Mode Active, Migrated'), 'the fixed status string is gone');
  });
});
