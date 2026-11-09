import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const HOST = fileURLToPath(new URL('../../desktop/', import.meta.url));
const norm = (s) => s.replace(/\r\n/g, '\n');
const help = norm(readFileSync(`${SRC}components/HelpCenterModal.tsx`, 'utf8'));
const service = norm(readFileSync(`${HOST}Services/SupportService.cs`, 'utf8'));
const dispatcher = norm(readFileSync(`${HOST}Bridge/IpcDispatcher.cs`, 'utf8'));
const dispatcherSystem = norm(readFileSync(`${HOST}Bridge/IpcDispatcher.System.cs`, 'utf8'));

describe('support bundle: frontend', () => {
  it('shows the real saved path from the server and reveals its folder through the existing gated IPC', () => {
    assert.ok(help.includes("invoke<SupportBundleResult>('support:createBundle')"));
    assert.ok(help.includes('folderPath?: string;'));
    assert.ok(help.includes('setSupportSavedPath(res.filePath || null)'));
    assert.ok(help.includes("invoke('excel:openExportFolder', { folderPath: supportFolderPath })"));
    assert.ok(help.includes('فتح المجلد'));
  });

  it('keeps the Desktop label only because the Desktop is the first target, and does not promise it as the only one', () => {
    assert.ok(help.includes('إنشاء حزمة الدعم على سطح المكتب'));
    assert.ok(help.includes('أو في التنزيلات إن تعذر'));
  });

  it('the dispatcher keeps the admin gate and no new folder-opening IPC was invented', () => {
    assert.ok(/"support:createBundle",\s*REQUIRE_ADMIN/.test(dispatcher));
    assert.ok(!dispatcher.includes('support:openFolder'));
    assert.ok(dispatcherSystem.includes('DatabaseService.Support.CreateSupportBundle()'));
  });
});

describe('support bundle: desktop source guarantees', () => {
  it('reports the real version, not a hard-coded one', () => {
    assert.ok(service.includes('info.AppVersion = AppUpdateService.CurrentVersion;'));
    assert.ok(!service.includes('"1.0.0"'));
  });

  it('never runs a full integrity_check on the live database', () => {
    assert.ok(!service.includes('PRAGMA integrity_check'));
    assert.ok(service.includes('PRAGMA quick_check;'));
    assert.ok(service.includes('QuickCheckMaxBytes'));
  });

  it('every section is isolated and the log is scrubbed before it is written', () => {
    assert.ok(service.includes('private static void RunSection('));
    assert.ok(service.includes('UnavailableSections[name]'));
    assert.ok(service.includes('SupportLogScrubber.ScrubRecentLog(Logger.ReadRecentLogs('));
  });

  it('never puts licence keys, fingerprints or the database file into the bundle', () => {
    const body = service.replace(/\/\/.*$/gm, '');
    assert.ok(!/\.LicenseKey|\.DeviceFingerprint|\.ReleaseCode|\.ShopName/.test(body));
    assert.ok(!/ZipFile\.CreateFromDirectory|CreateEntryFromFile/.test(body));
    assert.ok(!/\.db-wal|\.db-shm/.test(body));
  });

  it('the settings snapshot is a whitelist without secrets or store identity', () => {
    const match = /SettingsWhitelist = new string\[\][\s\S]*?\};/.exec(service);
    assert.ok(match, 'whitelist missing');
    for (const banned of ['pin_hash', 'recovery', 'license', 'token', 'store_name', 'store_phone', 'store_address', 'tax_number', 'password']) {
      assert.ok(!match[0].includes(banned), `whitelist must not contain ${banned}`);
    }
  });

  it('uses only C# 5 syntax in the support service', () => {
    const body = service.replace(/\/\/.*$/gm, '');
    assert.ok(!/nameof\(|\$"|\?\./.test(body));
    assert.ok(!/\bis\s+\w+\s+\w+\s*\)/.test(body));
  });

  it('has no emoji in the user-facing text', () => {
    assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(service + help));
  });
});
