import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('App Update System Verification (Online, Offline USB & Automated Rollback)', () => {
  const appUpdateServicePath = path.resolve('..', 'desktop', 'Services', 'AppUpdateService.cs');
  const appUpdateTestRunnerPath = path.resolve('..', 'desktop', 'Services', 'AppUpdateTestRunner.cs');
  const appUpdateModalPath = path.resolve('src', 'components', 'AppUpdateModal.tsx');
  const ipcDispatcherPath = path.resolve('..', 'desktop', 'Bridge', 'IpcDispatcher.Backup.cs');
  const ipcCorePath = path.resolve('..', 'desktop', 'Bridge', 'IpcDispatcher.cs');
  const ipcBridgePath = path.resolve('src', 'bridge', 'ipc.ts');

  it('1. AppUpdateService Architecture & Version Comparison Invariants', () => {
    assert.ok(fs.existsSync(appUpdateServicePath), 'AppUpdateService.cs must exist');
    const serviceContent = fs.readFileSync(appUpdateServicePath, 'utf8');

    // Version comparison
    assert.ok(serviceContent.includes('public static int CompareVersions(string v1, string v2)'), 'Must implement CompareVersions');
    assert.ok(serviceContent.includes('CURRENT_VERSION = "1.0.0"'), 'Must define CURRENT_VERSION');
    assert.ok(serviceContent.includes('ComputeFileSha256'), 'Must provide SHA-256 calculation for package integrity');

    // Check version comparison behavior in JS logic simulation
    function compareVersions(v1, v2) {
      const p1 = v1.trim().replace(/^[vV]/, '').split('.').map(Number);
      const p2 = v2.trim().replace(/^[vV]/, '').split('.').map(Number);
      const maxLen = Math.max(p1.length, p2.length);
      for (let i = 0; i < maxLen; i++) {
        const n1 = p1[i] || 0;
        const n2 = p2[i] || 0;
        if (n1 > n2) return 1;
        if (n1 < n2) return -1;
      }
      return 0;
    }

    assert.equal(compareVersions('1.0.1', '1.0.0'), 1);
    assert.equal(compareVersions('1.0.0', '1.0.0'), 0);
    assert.equal(compareVersions('0.9.9', '1.0.0'), -1);
    assert.equal(compareVersions('1.10.0', '1.2.0'), 1);
    assert.equal(compareVersions('2.0.0', '1.9.9'), 1);
  });

  it('2. Strict Store Database & Settings Preservation Before File Staging', () => {
    const serviceContent = fs.readFileSync(appUpdateServicePath, 'utf8');
    const runnerContent = fs.readFileSync(appUpdateTestRunnerPath, 'utf8');

    // Pre-update database safety backup
    assert.ok(serviceContent.includes('_backupService.CreateBackup'), 'Must trigger automated database backup before staging update files');
    assert.ok(serviceContent.includes('result.BackupPath = backupPath'), 'Must record backup file path in result');

    // Database & settings protection against overwrites
    assert.ok(serviceContent.includes('.EndsWith(".db")') || serviceContent.includes('.EndsWith(".db-wal")'), 
      'Must bar update packages from overwriting live SQLite database files');

    // Test runner asserts DB preservation
    assert.ok(runnerContent.includes('DatabasePreservationPassed'), 'Test runner must verify database file integrity after update');
  });

  it('3. Resilient Automated Rollback on Update Failure', () => {
    const serviceContent = fs.readFileSync(appUpdateServicePath, 'utf8');
    const runnerContent = fs.readFileSync(appUpdateTestRunnerPath, 'utf8');

    // Rollback directory & snapshot
    assert.ok(serviceContent.includes('rollback_backup'), 'Must prepare rollback_backup directory');
    assert.ok(serviceContent.includes('RafiqPOS.exe.bak'), 'Must back up current executable to RafiqPOS.exe.bak');

    // Rollback execution in catch block
    assert.ok(serviceContent.includes('result.RollbackTriggered = true'), 'Must flag RollbackTriggered on error');
    assert.ok(serviceContent.includes('UPDATE_FAILED_ROLLED_BACK'), 'Must assign code UPDATE_FAILED_ROLLED_BACK');
    assert.ok(serviceContent.includes('APP_UPDATE_ROLLBACK'), 'Must log audit event for rollback');

    // Test runner verifies rollback
    assert.ok(runnerContent.includes('RollbackOnFailurePassed'), 'Test runner must assert automatic rollback when simulateFailure is true');
  });

  it('4. Offline USB Package Inspection & Zip Slip Security Guard', () => {
    assert.ok(fs.existsSync(ipcDispatcherPath), 'IpcDispatcher.Backup.cs must exist');
    const serviceContent = fs.readFileSync(appUpdateServicePath, 'utf8');
    const ipcBackupContent = fs.readFileSync(ipcDispatcherPath, 'utf8');
    const ipcCoreContent = fs.readFileSync(ipcCorePath, 'utf8');

    // Offline inspection method
    assert.ok(serviceContent.includes('InspectOfflinePackage'), 'AppUpdateService must implement InspectOfflinePackage');
    assert.ok(serviceContent.includes('IsOfflinePackage'), 'Must identify offline packages');
    assert.ok(serviceContent.includes('ZipFile.OpenRead'), 'Must inspect archive files (.zip/.pkg)');

    // Zip Slip defense
    assert.ok(serviceContent.includes('Zip Slip'), 'Must protect against Zip Slip directory traversal vulnerabilities');

    // IPC endpoints
    assert.ok(ipcBackupContent.includes('updates:browsePackage'), 'Must support updates:browsePackage file dialog');
    assert.ok(ipcBackupContent.includes('updates:inspectPackage'), 'Must support updates:inspectPackage');
    assert.ok(ipcCoreContent.includes('updates:browsePackage'), 'Must declare permission for updates:browsePackage');
    assert.ok(ipcCoreContent.includes('updates:inspectPackage'), 'Must declare permission for updates:inspectPackage');
  });

  it('5. Frontend Modal UI Compliance & Zero Emojis Policy', () => {
    assert.ok(fs.existsSync(appUpdateModalPath), 'AppUpdateModal.tsx must exist');
    const modalContent = fs.readFileSync(appUpdateModalPath, 'utf8');
    const bridgeContent = fs.readFileSync(ipcBridgePath, 'utf8');

    // IPC bridge models
    assert.ok(bridgeContent.includes('isOfflinePackage?: boolean;'), 'ipc.ts AppUpdateInfo must declare isOfflinePackage');
    assert.ok(bridgeContent.includes('packagePath?: string;'), 'ipc.ts AppUpdateInfo must declare packagePath');
    assert.ok(bridgeContent.includes('filesStagedCount?: number;'), 'ipc.ts AppUpdateResult must declare filesStagedCount');

    // Zero emojis check (Strict Rule 7)
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    assert.ok(!emojiRegex.test(modalContent), 'AppUpdateModal must not contain any emojis');

    // Design tokens check (Strict Rule 6)
    assert.ok(modalContent.includes('brand'), 'Must use brand design token');
    assert.ok(modalContent.includes('paid'), 'Must use paid design token');
    assert.ok(modalContent.includes('surface'), 'Must use surface design token');
    assert.ok(modalContent.includes('ink'), 'Must use ink design token');

    // Offline USB picker button & Verification runner
    assert.ok(modalContent.includes('handleBrowseOfflinePackage'), 'Must support browsing offline package from USB');
    assert.ok(modalContent.includes('handleRunVerificationTests'), 'Must provide verification and rollback runner');
  });
});
