import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const read = (...p) => fs.readFileSync(path.resolve(...p), 'utf8').replace(/\r\n/g, '\n');
const wizard = read('src', 'components', 'MigrationWizardModal.tsx');
const cartDraft = read('src', 'utils', 'posCartDraft.ts');
const posView = read('src', 'views', 'PosView.tsx');
const service = read('..', 'desktop', 'Services', 'MigrationService.cs');
const dispatcher = read('..', 'desktop', 'Bridge', 'IpcDispatcher.Backup.cs');
const excelDispatcher = read('..', 'desktop', 'Bridge', 'IpcDispatcher.Excel.cs');
const permissions = read('..', 'desktop', 'Bridge', 'IpcDispatcher.cs');
const ipcBridge = read('src', 'bridge', 'ipc.ts');
const folderSelectDialog = read('..', 'desktop', 'Common', 'FolderSelectDialog.cs');

const visibleText = wizard
  .split('\n')
  .filter((l) => !l.trim().startsWith('import ') && !l.trim().startsWith('//') && !l.includes("invoke<") && !l.includes("invoke('"))
  .join('\n');

describe('migration wizard (source level)', () => {
  it('opens the package only with the owner recovery code, typed in a password field with show/hide', () => {
    assert.match(wizard, /id="migration-recovery-code"[\s\S]{0,200}type=\{showRecoveryCode \? 'text' : 'password'\}/);
    assert.match(wizard, /aria-label=\{showRecoveryCode \? 'إخفاء الكود' : 'إظهار الكود'\}/);
    assert.match(wizard, /autoComplete="off"/);
    assert.match(wizard, /'migration:inspect', \{\s*packagePath: target\.trim\(\),\s*recoveryCode: recoveryCode\.trim\(\)/);
    assert.match(wizard, /'migration:restore', \{\s*packagePath: packagePath\.trim\(\),\s*recoveryCode: recoveryCode\.trim\(\)/);
  });

  it('gives the long host operations a long timeout instead of the 15 second bridge default', () => {
    assert.match(wizard, /MIGRATION_TIMEOUT_MS = 10 \* 60 \* 1000/);
    assert.equal((wizard.match(/MIGRATION_TIMEOUT_MS\)/g) || []).length, 3);
  });

  it('never logs or persists the recovery code and clears it when closed and after a restore', () => {
    assert.doesNotMatch(wizard, /console\.(log|error|warn)/);
    assert.doesNotMatch(wizard, /localStorage|sessionStorage/);
    assert.match(wizard, /The recovery code never outlives the open wizard[\s\S]{0,120}setRecoveryCode\(''\)/);
    assert.match(wizard, /setRecoveryCode\(''\);\s*setRestoreResult\(res\)/);
  });

  it('cannot start the same action twice while one is running', () => {
    assert.match(wizard, /const handleExport = async \(\) => \{\s*if \(loading\) return;/);
    assert.match(wizard, /const handleInspectPackage = async \(pathOverride\?: string\) => \{\s*if \(loading\) return;/);
    assert.match(wizard, /const handleRestorePackage = async \(\) => \{\s*if \(loading \|\| /);
    assert.match(wizard, /loading=\{loading\}\s*disabled=\{loading\}\s*onClick=\{\(\) => void handleExport\(\)\}/);
    assert.match(wizard, /loading=\{loading\}\s*disabled=\{loading\}\s*onClick=\{\(\) => void handleRestorePackage\(\)\}/);
    assert.match(wizard, /isOpen: isOpen && !isBusy/);
  });

  it('shows the host message instead of swallowing failures or claiming success', () => {
    assert.doesNotMatch(wizard, /catch\s*(\(\w+\))?\s*\{\s*\}/);
    assert.doesNotMatch(wizard, /as any|: any\b/);
    assert.match(wizard, /if \(res && res\.success\) \{\s*setExportResult\(res\);\s*\} else \{\s*setErrorMessage\(res\?\.message/);
    assert.match(wizard, /setErrorMessage\(res\?\.message \|\| 'فشل استرجاع حزمة النقل\.'\)/);
    assert.match(wizard, /handleBrowsePackage[\s\S]{0,700}setErrorMessage\(messageOf/);
    assert.match(wizard, /!restoreResult\.isMatch && \(/);
    assert.match(wizard, /restoreResult\.differences\.map/);
  });

  it('asks for an explicit replace confirmation and blocks the restore while a sale is open', () => {
    assert.match(wizard, /hasUnpaidPosCart\(\)/);
    assert.match(wizard, /await rafiqConfirm\(\{[\s\S]{0,200}استبدال كل بيانات هذا الجهاز[\s\S]{0,900}variant: 'danger'/);
    assert.match(wizard, /if \(!confirmed\) return;/);
    assert.ok(wizard.indexOf('hasUnpaidPosCart()') < wizard.indexOf("'migration:restore'"));
    assert.ok(wizard.indexOf('if (!confirmed) return;') < wizard.indexOf("'migration:restore'"));
  });

  it('the cart guard reads the key PosView really writes', () => {
    assert.match(cartDraft, /POS_CART_DRAFT_KEY = 'rafiq_pos_cart_draft'/);
    assert.ok(posView.includes("'rafiq_pos_cart_draft'"));
  });

  it('gates export on settings.backup and restore on settings.restore, like the host', () => {
    assert.match(wizard, /const canExport = hasPermission\('settings\.backup'\)/);
    assert.match(wizard, /const canImport = hasPermission\('settings\.restore'\)/);
    assert.match(wizard, /onClick=\{\(\) => setStep\('export_step'\)\}\s*disabled=\{!canExport\}/);
    assert.match(wizard, /onClick=\{\(\) => setStep\('import_step'\)\}\s*disabled=\{!canImport\}/);
    for (const [channel, permission] of [
      ['migration:getMetrics', 'settings.backup'],
      ['migration:export', 'settings.backup'],
      ['migration:browseFolder', 'settings.backup'],
      ['migration:inspect', 'settings.restore'],
      ['migration:browseFile', 'settings.restore'],
      ['migration:restore', 'settings.restore'],
    ]) {
      assert.ok(permissions.includes(`{ "${channel}", "${permission}" }`), channel);
    }
  });

  it('the restore holds the exclusive database gate so no sale runs during the swap', () => {
    assert.match(permissions, /request\.Action == "migration:restore" \|\|/);
    assert.match(permissions, /_dbGate\.EnterWriteLock\(\)/);
  });

  it('every host channel the wizard needs is wired and every wired channel is used', () => {
    for (const channel of ['migration:getMetrics', 'migration:export', 'migration:inspect', 'migration:restore', 'migration:browseFile', 'migration:browseFolder']) {
      assert.ok(wizard.includes(`'${channel}'`), `wizard uses ${channel}`);
      assert.ok(dispatcher.includes(`case "${channel}":`), `dispatcher handles ${channel}`);
    }
  });

  it('has no English UI text, emoji or raw palette colours', () => {
    const jsxText = [...visibleText.matchAll(/>\s*([^<>{}\n]+?)\s*</g)].map((m) => m[1]);
    for (const t of jsxText) {
      assert.doesNotMatch(t.replace(/USB/g, ''), /[A-Za-z]{3,}/, `English text in JSX: ${t}`);
    }
    assert.doesNotMatch(wizard, /\p{Extended_Pictographic}/u);
    assert.doesNotMatch(wizard, /#[0-9a-fA-F]{3,8}\b/);
    assert.doesNotMatch(wizard, /\b(?:bg|text|border)-(?:slate|gray|zinc|neutral|red|green|blue)-\d{2,3}\b/);
  });

  it('keeps money in integer piasters until the final display', () => {
    assert.match(wizard, /formatPiasters = \(piasters: number\)/);
    assert.doesNotMatch(service, /\/ 100\.0|\/ 1000\.0|\bdouble\b|\bfloat\b|\bdecimal\b/);
  });
});

describe('migration service guards (source level)', () => {
  it('requires the recovery code and refuses unencrypted or unlockable packages', () => {
    assert.match(service, /EncryptionService\.CanUnlockWithRecoveryCode\(fullPath, recoveryCode\)/);
    assert.match(service, /غير مشفرة \(تنسيق قديم\)/);
    assert.ok(!/public MigrationRestoreResult RestorePackage\(string packagePath\)/.test(service));
    assert.ok(!/public MigrationPackageInspectResult InspectPackage\(string packagePath\)/.test(service));
  });

  it('whitelists archive entries, bounds extraction and verifies hash, integrity, schema and numbers before the swap', () => {
    assert.match(service, /ValidateArchiveEntries/);
    assert.match(service, /ExtractEntryBounded/);
    assert.match(service, /PRAGMA quick_check/);
    assert.match(service, /SELECT COALESCE\(MAX\(version\), 0\) FROM schema_migrations/);
    assert.ok(service.indexOf('PreparePackage(packagePath, recoveryCode, true, work)') < service.indexOf('DatabaseService.ReplaceDatabaseFile('));
  });

  it('exports to a folder the user chose (never silently elsewhere), verifies the written file and removes it on failure', () => {
    assert.match(service, /ResolveExportFolder\(targetFolder, out folderError\)/);
    assert.match(service, /PreparePackage\(finalPath, code, false, verify\)/);
    assert.match(service, /File\.Delete\(leftover\)/);
    assert.doesNotMatch(service, /File\.Delete\(targetFilePath\)/);
  });
});

describe('modern folder browser dialog and timeout invariants', () => {
  it('assigns 10-minute timeout for interactive folder and file browsing in ipc.ts', () => {
    assert.match(ipcBridge, /action\.endsWith\(':browseFolder'\)/);
    assert.match(ipcBridge, /return 600000; \/\/ 10 minutes for interactive user file\/folder pickers/);
  });

  it('MigrationWizardModal passes initialFolder to migration:browseFolder and migration:browseFile', () => {
    assert.match(wizard, /'migration:browseFolder',\s*\{\s*initialFolder: targetFolder\.trim\(\) \|\| undefined/);
    assert.match(wizard, /'migration:browseFile',\s*\{\s*initialFolder: packagePath\.trim\(\) \|\| undefined/);
  });

  it('C# dispatchers use FolderSelectDialog instead of legacy FolderBrowserDialog', () => {
    assert.match(dispatcher, /using \(var dlg = new FolderSelectDialog\(\)\)/);
    assert.match(excelDispatcher, /using \(var dlg = new FolderSelectDialog\(\)\)/);
    assert.doesNotMatch(dispatcher, /new System\.Windows\.Forms\.FolderBrowserDialog\(\)/);
    assert.doesNotMatch(excelDispatcher, /new System\.Windows\.Forms\.FolderBrowserDialog\(\)/);
  });

  it('FolderSelectDialog wraps IFileOpenDialog with fallback to FolderBrowserDialog and zero emojis', () => {
    assert.match(folderSelectDialog, /IFileOpenDialog/);
    assert.match(folderSelectDialog, /FOS_PICKFOLDERS/);
    assert.match(folderSelectDialog, /ShowLegacyDialog/);
    assert.doesNotMatch(folderSelectDialog, /\p{Extended_Pictographic}/u);
  });
});
