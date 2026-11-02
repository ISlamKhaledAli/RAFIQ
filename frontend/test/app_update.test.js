import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('App Update System: informational check only (no in-app apply)', () => {
  const servicePath = path.resolve('..', 'desktop', 'Services', 'AppUpdateService.cs');
  const ipcBackupPath = path.resolve('..', 'desktop', 'Bridge', 'IpcDispatcher.Backup.cs');
  const ipcCorePath = path.resolve('..', 'desktop', 'Bridge', 'IpcDispatcher.cs');
  const modalPath = path.resolve('src', 'components', 'AppUpdateModal.tsx');
  const installerPath = path.resolve('..', 'installer', 'RafiqPOS_Setup.iss');

  it('keeps version comparison and the online check', () => {
    const service = fs.readFileSync(servicePath, 'utf8');
    assert.ok(service.includes('public static int CompareVersions(string v1, string v2)'));
    assert.ok(service.includes('CURRENT_VERSION = "1.0.0"'));
    assert.ok(service.includes('public AppUpdateInfo CheckForUpdates('));
  });

  it('has no elevated apply path, staging folder, or updater script', () => {
    const service = fs.readFileSync(servicePath, 'utf8');
    for (const forbidden of ['ApplyUpdate', 'LaunchRestartUpdater', 'rafiq_updater', 'runas', 'GetStagingDirectory', 'DownloadUpdate']) {
      assert.ok(!service.includes(forbidden), `AppUpdateService must not contain ${forbidden}`);
    }
    const ipc = fs.readFileSync(ipcBackupPath, 'utf8') + fs.readFileSync(ipcCorePath, 'utf8');
    for (const action of ['updates:apply', 'updates:download', 'updates:restart', 'updates:browsePackage', 'updates:inspectPackage', 'updates:runTests']) {
      assert.ok(!ipc.includes(`"${action}"`), `${action} must be removed from the IPC surface and RBAC map`);
    }
    assert.ok(ipc.includes('"updates:check"'), 'updates:check stays available to admins');
  });

  it('modal only checks and tells the owner to install the official Setup', () => {
    const modal = fs.readFileSync(modalPath, 'utf8');
    assert.ok(modal.includes("'updates:check'"));
    assert.ok(!/updates:(apply|download|restart|browsePackage|inspectPackage|runTests)/.test(modal));
    assert.ok(modal.includes('Setup'), 'must explain installing through the official Setup');
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    assert.ok(!emojiRegex.test(modal), 'AppUpdateModal must not contain any emojis');
  });

  it('installer no longer grants users write access to an updates folder or the app folder', () => {
    const iss = fs.readFileSync(installerPath, 'utf8');
    assert.ok(!/RafiqPOS\\updates"; Permissions/.test(iss), 'updates folder must not be user-writable');
    assert.ok(!/Name: "\{app\}"; Permissions/.test(iss), '{app} must not be user-writable');
  });
});
