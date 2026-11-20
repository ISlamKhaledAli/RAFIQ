import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  deriveUpdateStatus,
  isSafeDownloadUrl,
  isSupportedInstallerUrl,
  isValidSha256,
  formatFileSize,
} from '../src/utils/appUpdateView.ts';

describe('App Update System: secure in-app Setup download + SHA-256 verification + official installer launch', () => {
  const servicePath = path.resolve('..', 'desktop', 'Services', 'AppUpdateService.cs');
  const ipcBackupPath = path.resolve('..', 'desktop', 'Bridge', 'IpcDispatcher.Backup.cs');
  const ipcCorePath = path.resolve('..', 'desktop', 'Bridge', 'IpcDispatcher.cs');
  const modalPath = path.resolve('src', 'components', 'AppUpdateModal.tsx');
  const installerPath = path.resolve('..', 'installer', 'RafiqPOS_Setup.iss');

  it('keeps version comparison, online check, and secure verified Setup download/launch', () => {
    const service = fs.readFileSync(servicePath, 'utf8');
    assert.ok(service.includes('public static int CompareVersions(string v1, string v2)'));
    assert.ok(!service.includes('CURRENT_VERSION = "1.0.0"'), 'the running version must not be hard-coded in the service');
    assert.ok(service.includes('GetName().Version'), 'current version comes from the assembly');
    assert.ok(service.includes('public AppUpdateInfo CheckForUpdates('));
    assert.ok(service.includes('public AppUpdateDownloadState StartDownload()'));
    assert.ok(service.includes('public AppUpdateDownloadState GetDownloadState()'));
    assert.ok(service.includes('public AppUpdateDownloadState CancelDownload()'));
    assert.ok(service.includes('public AppUpdateLaunchResult LaunchVerifiedInstaller()'));
    assert.ok(service.includes('Path.GetTempPath()'), 'downloads must stay in user %TEMP%, never {app}');
    assert.ok(service.includes('HasValidPeHeader('), 'downloaded Setup must pass PE header verification');
    assert.ok(service.includes('ComputeFileSha256('), 'downloaded Setup must pass SHA-256 verification');
  });

  it('has no unsafe ZIP extraction, staging folder, batch updater script, or runas elevation hack', () => {
    const service = fs.readFileSync(servicePath, 'utf8');
    for (const forbidden of ['ApplyUpdate', 'LaunchRestartUpdater', 'rafiq_updater', 'runas', 'GetStagingDirectory', 'ZipArchive']) {
      assert.ok(!service.includes(forbidden), `AppUpdateService must not contain ${forbidden}`);
    }
    const ipc = fs.readFileSync(ipcBackupPath, 'utf8') + fs.readFileSync(ipcCorePath, 'utf8');
    for (const action of ['updates:apply', 'updates:restart', 'updates:browsePackage', 'updates:inspectPackage', 'updates:runTests']) {
      assert.ok(!ipc.includes(`"${action}"`), `${action} must stay removed from the IPC surface and RBAC map`);
    }
    for (const action of ['updates:check', 'updates:startDownload', 'updates:getDownloadState', 'updates:cancelDownload', 'updates:launchInstaller']) {
      assert.ok(ipc.includes(`"${action}"`), `${action} must be registered in IPC and RBAC`);
    }
  });

  it('modal provides one-click download/install without exposing raw links or SHA-256 dumps, and guards active sales', () => {
    const modal = fs.readFileSync(modalPath, 'utf8');
    assert.ok(modal.includes("'updates:check'"));
    assert.ok(modal.includes("'updates:startDownload'"));
    assert.ok(modal.includes("'updates:getDownloadState'"));
    assert.ok(modal.includes("'updates:cancelDownload'"));
    assert.ok(modal.includes("'updates:launchInstaller'"));
    assert.ok(modal.includes('hasActiveSale'), 'modal must enforce Active Transaction Guard before launching Setup');
    assert.ok(!modal.includes('نسخ رابط التحميل'), 'modal must not require manual URL copying');
    assert.ok(!/updates:(apply|restart|browsePackage|inspectPackage|runTests)/.test(modal));
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    assert.ok(!emojiRegex.test(modal), 'AppUpdateModal must not contain any emojis');
  });

  it('installer never grants users write access to an updates folder or the app folder', () => {
    const iss = fs.readFileSync(installerPath, 'utf8');
    assert.ok(!/RafiqPOS\\updates"; Permissions/.test(iss), 'updates folder must not be user-writable');
    assert.ok(!/Name: "\{app\}"; Permissions/.test(iss), '{app} must not be user-writable');
  });

  it('one product version: assembly, installer and package.json agree, and system:getInfo reads the assembly', () => {
    const asm = fs.readFileSync(path.resolve('..', 'desktop', 'Properties', 'AssemblyInfo.cs'), 'utf8');
    const asmVersion = asm.match(/AssemblyVersion\("(\d+)\.(\d+)\.(\d+)\.\d+"\)/);
    const issVersion = fs.readFileSync(installerPath, 'utf8').match(/#define MyAppVersion "([\d.]+)"/);
    const pkgVersion = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8')).version;
    assert.ok(asmVersion && issVersion, 'version declarations must be present');
    assert.equal(`${asmVersion[1]}.${asmVersion[2]}.${asmVersion[3]}`, issVersion[1]);
    assert.equal(pkgVersion, issVersion[1]);
    const sys = fs.readFileSync(path.resolve('..', 'desktop', 'Bridge', 'IpcDispatcher.System.cs'), 'utf8');
    assert.ok(sys.includes('AppUpdateService.CurrentVersion'), 'system:getInfo must not hard-code the version');
  });

  it('every version declaration drifts together: package.json, lock file, manifest, installer scripts and the dev mock', () => {
    const pkgVersion = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8')).version;
    const lock = JSON.parse(fs.readFileSync(path.resolve('package-lock.json'), 'utf8'));
    assert.equal(lock.version, pkgVersion, 'package-lock.json top-level version');
    assert.equal(lock.packages[''].version, pkgVersion, 'package-lock.json root package version');

    const manifest = fs.readFileSync(path.resolve('..', 'desktop', 'app.manifest'), 'utf8');
    const manifestVersion = manifest.match(/<assemblyIdentity version="(\d+\.\d+\.\d+)\.0"/);
    assert.ok(manifestVersion, 'app.manifest assemblyIdentity version must be X.Y.Z.0');
    assert.equal(manifestVersion[1], pkgVersion, 'app.manifest assemblyIdentity version');

    const installerBatPath = path.resolve('..', 'Build_Installer.bat');
    const bat = fs.readFileSync(installerBatPath, 'utf8');
    const batVersions = [...bat.matchAll(/RafiqPOS_Setup(?:_Slim)?_v(\d+\.\d+\.\d+)\.exe/g)].map((m) => m[1]);
    assert.ok(batVersions.length >= 3, 'Build_Installer.bat names the installers it builds');
    for (const version of batVersions) assert.equal(version, pkgVersion, 'Build_Installer.bat installer file name');

    // The other build scripts take the name from Build_Installer.bat and must not pin an older one
    for (const name of ['Build_Installer_Full.bat', 'Build_Installer_Slim.bat', 'Build_Setup.bat']) {
      const text = fs.readFileSync(path.resolve('..', name), 'utf8');
      for (const m of text.matchAll(/RafiqPOS_Setup(?:_Slim)?_v(\d+\.\d+\.\d+)/g)) assert.equal(m[1], pkgVersion, `${name} installer file name`);
    }

    const mock = fs.readFileSync(path.resolve('src', 'bridge', 'ipc.ts'), 'utf8');
    for (const m of mock.matchAll(/(?:currentVersion|version): '(\d+\.\d+\.\d+)[^']*'/g)) {
      assert.equal(m[1], pkgVersion, `dev mock version literal ${m[0]}`);
    }
    assert.ok(!/v1\.0\.0/.test(mock), 'dev mock app version text');
  });

  it('header update entry points are admin-tier only and never open the modal by themselves', () => {
    const app = fs.readFileSync(path.resolve('src', 'App.tsx'), 'utf8');
    assert.ok(app.includes('canSeeUpdates'), 'update check/badge must be gated by the role rule');
    assert.ok(!/info\.isMandatory\)\s*\{\s*setIsAppUpdateModalOpen/.test(app), 'a mandatory flag must not pop a modal over a sale');
  });
});

describe('App Update modal helpers', () => {
  it('derives an honest status for every host answer', () => {
    const ok = deriveUpdateStatus({ hasUpdate: false, isEligible: true, currentVersion: '1.0.0', latestVersion: '1.0.0' });
    assert.equal(ok.kind, 'success');
    const newer = deriveUpdateStatus({ hasUpdate: true, isEligible: true, latestVersion: '1.1.0' });
    assert.equal(newer.kind, 'info');
    assert.match(newer.text, /1\.1\.0/);
    const denied = deriveUpdateStatus({ hasUpdate: false, isEligible: false, errorMessage: 'انتهت فترة الدعم' });
    assert.equal(denied.kind, 'warn');
    assert.equal(denied.text, 'انتهت فترة الدعم');
    const offline = deriveUpdateStatus({ hasUpdate: false, isEligible: true, errorMessage: 'تعذر الاتصال' });
    assert.equal(offline.kind, 'error');
    assert.match(offline.text, /فلاشة USB/, 'offline errors point to the USB installer path');
    const thrown = deriveUpdateStatus(null, 'timeout');
    assert.equal(thrown.kind, 'error');
    assert.match(thrown.text, /timeout/);
  });

  it('only https download links, .exe installers, and well-formed SHA-256 values are accepted', () => {
    assert.equal(isSafeDownloadUrl('https://example.com/RafiqPOS_Setup_v1.1.0.exe'), true);
    assert.equal(isSupportedInstallerUrl('https://example.com/RafiqPOS_Setup_v1.1.0.exe'), true);
    assert.equal(isSupportedInstallerUrl('https://example.com/RafiqPOS_Update_v1.1.0.zip'), false);
    for (const bad of ['http://example.com/a.exe', 'javascript:alert(1)', 'file:///C:/a.exe', 'https://', '', null, undefined, 'https://a b/c']) {
      assert.equal(isSafeDownloadUrl(bad), false, String(bad));
      assert.equal(isSupportedInstallerUrl(bad), false, String(bad));
    }
    assert.equal(isValidSha256('a'.repeat(64)), true);
    assert.equal(isValidSha256('A'.repeat(64)), true);
    assert.equal(isValidSha256('abc'), false);
    assert.equal(isValidSha256('g'.repeat(64)), false);
    assert.equal(isValidSha256(''), false);
  });

  it('formats the installer size', () => {
    assert.equal(formatFileSize(0), '');
    assert.equal(formatFileSize(undefined), '');
    assert.equal(formatFileSize(2048), '2 KB');
    assert.equal(formatFileSize(98765432), '94.2 MB');
  });
});
