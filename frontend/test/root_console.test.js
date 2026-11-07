import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getAllowedRootSubTabs, canAccessRootConsole, resolveRootSubTab, ROOT_SUB_TAB_IDS } from '../src/utils/rootAccess.ts';
import { getAllowedSettingsSubTabs, resolveSettingsSubTab } from '../src/utils/settingsAccess.ts';
import { buildStatusRows, buildDiagnosticsSummary } from '../src/utils/diagnosticsSummary.ts';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const HOST = fileURLToPath(new URL('../../desktop/', import.meta.url));
const read = (rel) => readFileSync(`${SRC}${rel}`, 'utf8');
const readHost = (rel) => readFileSync(`${HOST}${rel}`, 'utf8');
const app = read('App.tsx');
const rootDir = `${SRC}views/root/`;
const rootFiles = readdirSync(rootDir).filter((f) => f.endsWith('.tsx'));
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const only = (perms) => (key) => perms.includes(key);

describe('root console access rules (pure)', () => {
  it('only root gets the six pages in order; others get none', () => {
    assert.deepEqual(getAllowedRootSubTabs({ isRoot: true, canViewAudit: true }), ['status', 'receipt', 'features', 'devices', 'data', 'audit']);
    assert.deepEqual([...ROOT_SUB_TAB_IDS], ['status', 'receipt', 'features', 'devices', 'data', 'audit']);
    for (const user of [{ isRoot: false, canViewAudit: true }, { isRoot: false, canViewAudit: false }]) {
      const tabs = getAllowedRootSubTabs(user);
      assert.deepEqual(tabs, [], 'owner, manager and cashier never get a root page');
    }
    assert.equal(canAccessRootConsole({ isRoot: false, canViewAudit: true }), false);
    assert.equal(canAccessRootConsole({ isRoot: true, canViewAudit: false }), true);
  });

  it('there is no support root tab: it is not an id, and a stale one redirects to the status page', () => {
    assert.ok(!ROOT_SUB_TAB_IDS.includes('support'));
    assert.ok(!getAllowedRootSubTabs({ isRoot: true, canViewAudit: true }).includes('support'));
    assert.equal(resolveRootSubTab('support', getAllowedRootSubTabs({ isRoot: false, canViewAudit: false })), null);
    assert.equal(resolveRootSubTab('support', getAllowedRootSubTabs({ isRoot: true, canViewAudit: false })), 'status');
    assert.equal(resolveRootSubTab('nope', getAllowedRootSubTabs({ isRoot: true, canViewAudit: true })), 'status');
  });

  it('the audit page needs audit_log.view even for root', () => {
    const tabs = getAllowedRootSubTabs({ isRoot: true, canViewAudit: false });
    assert.ok(!tabs.includes('audit'));
    assert.ok(tabs.includes('status') && tabs.includes('receipt') && tabs.includes('features') && tabs.includes('devices') && tabs.includes('data'));
  });

  it('a stale or forbidden sub-tab redirects to the first allowed page, and to nothing when closed', () => {
    const allowed = getAllowedRootSubTabs({ isRoot: true, canViewAudit: false });
    assert.equal(resolveRootSubTab('audit', allowed), 'status');
    assert.equal(resolveRootSubTab('data', allowed), 'data');
    assert.equal(resolveRootSubTab('status', []), null, 'non-root opening a stored root sub-tab gets nothing');
  });

  it('settings sub-tab state kept from before the split (root-only ids) lands on the first owner screen', () => {
    const owner = getAllowedSettingsSubTabs({ isRoot: false, isAdmin: true, hasPermission: only([]) });
    for (const stale of ['features', 'scanner', 'security', 'system', 'demo', 'unknown']) {
      assert.equal(resolveSettingsSubTab(stale, owner), 'profile', stale);
    }
    assert.equal(resolveSettingsSubTab('backup', owner), 'backup');
    const cashierWithPrinter = getAllowedSettingsSubTabs({ isRoot: false, isAdmin: false, hasPermission: only(['settings.printer']) });
    assert.equal(resolveSettingsSubTab('profile', cashierWithPrinter), 'printer');
  });

  it('no settings tab id is shared with a root page (no feature has two homes)', () => {
    const settings = getAllowedSettingsSubTabs({ isRoot: true, isAdmin: true, hasPermission: () => true });
    assert.deepEqual(settings, ['profile', 'policies', 'printer', 'backup']);
    for (const id of settings) assert.ok(!ROOT_SUB_TAB_IDS.includes(id), `${id} exists on both sides`);
  });
});

describe('root console wiring in App', () => {
  it('has one root nav item, gated by canAccessRootConsole, and no separate audit tab', () => {
    assert.ok(/\{ id: 'root' as TabType, label: 'لوحة المطور \(Root\)'/.test(app), 'the nav label');
    assert.ok(app.includes('const canAccessRoot = canAccessRootConsole({ isRoot, canViewAudit: hasPermission(\'audit_log.view\') });'));
    assert.ok(app.includes("case 'root': return canAccessRoot;"), 'tab gate');
    assert.ok(!/TabType = [^;]*'audit'/.test(app) && !app.includes("id: 'audit' as TabType") && !app.includes('canAccessAudit'), 'the audit log is a root page now');
    assert.equal((app.match(/<RootConsoleView/g) || []).length, 1);
    assert.ok(app.includes('{canAccessRoot && visitedTabs.has(\'root\') && ('), 'never even mounted for non-root');
  });

  it('keeps the root pages in the sidebar sub-tree from the shared meta, with the demo dot on the data page', () => {
    assert.ok(app.includes('getAllowedRootSubTabs({ isRoot, canViewAudit })') && app.includes('ROOT_SUB_TAB_META[id].navLabel'));
    assert.ok(app.includes("sub.id === 'data' && hasDemoData"), 'the demo-data dot moved with the demo page');
    assert.ok(app.includes("if (isRootItem) setRootSubTab('status')"), 'collapsed rail opens the landing page');
  });

  it('the demo-data notification opens the root data page', () => {
    assert.ok(/onOpenDemoManagement: \(\) => \{\s*navigateTo\('root', \(\) => \{\s*setRootSubTab\('data'\);/.test(app));
  });

  it('help from the root console opens the settings help section', () => {
    assert.ok(app.includes("tab === 'root' ? 'settings' : tab"));
  });

  it('the console renders nothing for a non-root user even if mounted by mistake', () => {
    const view = read('views/root/RootConsoleView.tsx');
    assert.ok(view.includes('const subTab = resolveRootSubTab(activeSubTab, allowed);') && view.includes('if (subTab === null) return null;'));
    assert.ok(view.includes('getAllowedRootSubTabs({ isRoot, canViewAudit'));
  });

  it('the readiness check and the audit log are no longer reachable from owner surfaces', () => {
    assert.ok(!app.includes('ReadinessCheckModal') && !app.includes("id: 'readiness'"));
    assert.ok(!app.includes("from './views/AuditLogView'"), 'App no longer mounts the audit view itself');
    assert.ok(read('views/root/RootConsoleView.tsx').includes('<AuditLogView'));
    assert.ok(read('views/root/RootStatusPage.tsx').includes('<ReadinessCheckModal'));
  });
});

describe('the app appearance card is gone (the header toggle is the one home of light/dark)', () => {
  it('no ThemeModeCard component and no "مظهر البرنامج" card anywhere in the screens', () => {
    assert.ok(!existsSync(SRC + 'views/settings/ThemeModeCard.tsx'), 'the card file is deleted');
    for (const file of ['views/root/RootFeaturesPage.tsx', 'views/SettingsView.tsx', 'views/settings/StoreProfileTab.tsx']) {
      const src = read(file);
      assert.ok(!src.includes('ThemeModeCard') && !src.includes('مظهر البرنامج'), `${file} still shows the appearance card`);
    }
  });
});

describe('owner screens carry nothing root-only (and no root wording)', () => {
  const ownerFiles = ['views/SettingsView.tsx', 'views/settings/StoreProfileTab.tsx', 'views/settings/SalesPoliciesTab.tsx', 'views/settings/PrinterSettingsTab.tsx', 'components/BackupManager.tsx'];

  it('no root-only modal, tab or card is imported by an owner screen', () => {
    for (const file of ownerFiles) {
      const src = read(file);
      for (const gone of ['FirstRunWizardModal', 'PinSettingsModal', 'DemoDataModal', 'GuidedTourModal', 'FactoryResetModal', 'FullStoreExportModal', 'SearchBenchmarkModal', 'BarcodeScannerSettingsModal', 'SignatureImageField', 'ThemeModeCard', 'toggleFlag']) {
        assert.ok(!src.includes(gone), `${file} still references ${gone}`);
      }
    }
  });

  it('no user-visible root wording in owner screens (comments are fine)', () => {
    for (const file of ownerFiles) {
      const code = strip(read(file));
      assert.ok(!/روت|\(Root\)|حساب المطور|المشرف الفني الأعلى/.test(code), `${file} shows root wording`);
    }
  });

  it('the settings tab type has exactly the four owner screens', () => {
    const view = read('views/SettingsView.tsx');
    assert.ok(view.includes("export type SettingsSubTab = 'profile' | 'policies' | 'backup' | 'printer';"));
    for (const gone of ['onOpenWizard', 'isWizardOpen', 'demoStatus', 'runSqliteTest', 'runCreateSupportBundle', 'storeInstapayAddress']) {
      assert.ok(!view.includes(gone), `SettingsView still has ${gone}`);
    }
  });

  it('the old root-only settings files are gone', () => {
    for (const f of ['SystemDiagnosticsTab', 'DemoDataTab', 'ScannerSettingsTab', 'SecuritySettingsTab', 'StoreFeaturesTab', 'SignatureImageField']) {
      assert.ok(!existsSync(`${SRC}views/settings/${f}.tsx`), `${f} must live in views/root or be removed`);
    }
  });

  it('the root-only demo notification action is stripped for owner and manager', () => {
    assert.ok(read('utils/headerVisibility.ts').includes("kind === 'root' ? item : WITHOUT_ACTION(item)"));
  });
});

describe('every root feature has exactly one home', () => {
  const importers = (needle) =>
    ['App.tsx', ...walkTsx('views'), ...walkTsx('components')]
      .filter((rel) => !rel.startsWith('components/') || !rel.includes(needle))
      .filter((rel) => new RegExp(`import[^;]*\\b${needle}\\b[^;]*from`).test(read(rel)));

  function walkTsx(dir) {
    const out = [];
    for (const e of readdirSync(`${SRC}${dir}`, { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) out.push(...walkTsx(rel));
      else if (e.name.endsWith('.tsx')) out.push(rel);
    }
    return out;
  }

  it('factory reset, full export, PIN protection, demo data, benchmark and the update check are each opened from one place', () => {
    assert.deepEqual(importers('FactoryResetModal'), ['views/root/RootDataPage.tsx']);
    assert.deepEqual(importers('FullStoreExportModal'), ['views/root/RootDataPage.tsx']);
    assert.deepEqual(importers('PinSettingsModal'), ['views/root/RootDevicesPage.tsx']);
    assert.deepEqual(importers('DemoDataModal'), ['views/root/RootDataPage.tsx']);
    assert.deepEqual(importers('SearchBenchmarkModal'), ['views/root/RootStatusPage.tsx']);
    assert.deepEqual(importers('ReadinessCheckModal'), ['views/root/RootStatusPage.tsx']);
    assert.deepEqual(importers('AppUpdateModal'), ['App.tsx']);
  });

  it('the wizard is reopened from the root features page only (App keeps the first-run flow)', () => {
    assert.deepEqual(importers('FirstRunWizardModal').sort(), ['App.tsx', 'views/root/RootConsoleView.tsx']);
    assert.equal((read('views/root/RootFeaturesPage.tsx').match(/onOpenWizard/g) || []).length >= 2, true);
    assert.equal(rootFiles.filter((f) => read(`views/root/${f}`).includes('<Sparkles')).join(','), 'RootFeaturesPage.tsx', 'one wizard button');
  });

  it('feature toggles live only on the root features page', () => {
    const owners = [...walkTsx('views'), ...walkTsx('components')].filter((rel) => /toggleFlag\(/.test(read(rel)) && !rel.startsWith('views/root/'));
    assert.deepEqual(owners, [], 'no other screen flips feature flags');
    assert.ok(read('views/root/RootFeaturesPage.tsx').includes('toggleFlag(feat.key'));
  });

  it('the developer signature is saved from the root receipt page only', () => {
    const savers = [...walkTsx('views'), ...walkTsx('components')].filter((rel) => /developer_signature\w*:/.test(strip(read(rel))));
    assert.deepEqual(savers, ['views/root/RootReceiptPage.tsx']);
  });
});

describe('root pages: layout language and content rules', () => {
  const pages = rootFiles.map((f) => [f, read(`views/root/${f}`)]);

  it('use the shared settings parts, 44px controls and no cramped text', () => {
    for (const [name, src] of pages) {
      if (name === 'RootConsoleView.tsx' || name === 'SignatureImageField.tsx') continue;
      assert.ok(/settingsParts/.test(src), `${name} uses the shared settings parts`);
      assert.ok(!/h-9 px|h-10 px/.test(src), `${name} has a sub-44px button`);
      assert.ok(!/text-\[\d+px\]|\btext-xs font-black\b/.test(src), `${name} uses an ad-hoc text size`);
    }
  });

  it('every light class has a dark pair and no palette or hex colours are used', () => {
    for (const [name, src] of pages) {
      assert.ok(src.includes('dark:'), `${name} is dark aware`);
      assert.ok(!/(?:bg|text|border|ring|from|to)-\[#/.test(src), `${name} uses a hex colour`);
      assert.ok(!/(?:bg|text|border)-(?:red|green|blue|amber|emerald|slate|gray|zinc|yellow|purple|orange)-\d/.test(src), `${name} uses palette colours`);
      assert.ok(!/<select/.test(src), `${name} uses a native select`);
      assert.ok(!/اختياري/.test(src), `${name} says optional`);
      assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(src), `${name} has an emoji`);
    }
  });

  it('page chrome speaks Arabic: no leftover English labels apart from standard technical names', () => {
    const allowedEnglish = /\b(PIN|WebView2|Excel|Bluetooth|Root|demo_)\b/g;
    const bad = [];
    for (const [name, src] of pages) {
      if (name === 'SignatureImageField.tsx') continue;
      for (const m of strip(src).matchAll(/>([^<>{}\n]+)<\//g)) {
        if (/[A-Za-z]{3,}/.test(m[1].replace(allowedEnglish, ''))) bad.push(`${name}: ${m[1].trim()}`);
      }
    }
    assert.deepEqual(bad, []);
  });

  it('the status page keeps the live summary and checks and owns the diagnostics bundle and the copyable summary', () => {
    const status = read('views/root/RootStatusPage.tsx');
    assert.ok(status.includes('تحديث') && status.includes('useSystemSummary(sysInfo)'));
    for (const kept of ['printer:test', 'db:testTransaction', 'system:ping', 'SearchBenchmarkModal', 'ReadinessCheckModal']) {
      assert.ok(status.includes(kept), `${kept} stays on the status page`);
    }
    assert.ok(status.includes("invoke<{ success: boolean; message: string }>('support:createBundle')") && status.includes('تجهيز ملف التشخيص'));
    assert.ok(status.includes('نسخ ملخص التشخيص') && status.includes('buildDiagnosticsSummary(rows,') && status.includes('navigator.clipboard.writeText('));
    assert.ok(status.includes('تم نسخ الملخص') && status.includes('تعذر النسخ'), 'copy feedback for both outcomes');
    assert.ok(!/licen[cs]eKey/i.test(status), 'no licence key');
  });

  it('the diagnostics wording never says support and the contact card and steps list are gone', () => {
    const status = read('views/root/RootStatusPage.tsx');
    const meta = read('views/root/rootSubTabMeta.ts');
    for (const [name, src] of [['RootStatusPage.tsx', status], ['rootSubTabMeta.ts', meta], ['useSystemSummary.ts', read('views/root/useSystemSummary.ts')], ['diagnosticsSummary.ts', read('utils/diagnosticsSummary.ts')]]) {
      assert.ok(!/الدعم|الدعم الفني/.test(strip(src)), `${name} still shows support wording`);
    }
    for (const gone of ['SUPPORT_PHONE', 'tel:', 'ContactRow', 'خطوات مقترحة', 'LifeBuoy', 'PhoneCall']) {
      assert.ok(!status.includes(gone) && !meta.includes(gone), `${gone} must be gone`);
    }
    assert.ok(!existsSync(`${rootDir}RootSupportPage.tsx`), 'the support page file is deleted');
    assert.ok(!existsSync(`${SRC}utils/supportSummary.ts`), 'the summary builder is renamed to diagnosticsSummary');
    assert.ok(!rootFiles.some((f) => /support/i.test(f)));
  });

  it('the status page loads the summary through the one shared hook (no duplicated fetching)', () => {
    const hook = read('views/root/useSystemSummary.ts');
    assert.ok(hook.includes("invoke<HealthStatus>('health:getStatus')") && hook.includes('buildStatusRows('));
    const status = read('views/root/RootStatusPage.tsx');
    assert.ok(status.includes("from './useSystemSummary'") && !status.includes("'health:getStatus'") && !status.includes('buildStatusRows'));
    const users = rootFiles.filter((f) => read(`views/root/${f}`).includes('useSystemSummary('));
    assert.deepEqual(users, ['RootStatusPage.tsx']);
  });

  it('the console and the menu meta have exactly the six pages and no support wiring', () => {
    const view = read('views/root/RootConsoleView.tsx');
    assert.ok(!/RootSupportPage|onSubTabChange|'support'/.test(view), 'console has no support page or sub-tab callback');
    const meta = read('views/root/rootSubTabMeta.ts');
    assert.ok(!meta.includes('support:'));
    assert.deepEqual([...meta.matchAll(/^ {2}(\w+): \{$/gm)].map((m) => m[1]), [...ROOT_SUB_TAB_IDS]);
    assert.ok(!app.includes("'support'"), 'the sidebar needs no special case: it renders from ROOT_SUB_TAB_META');
  });

  it('every host action called from a root page exists on the host', () => {
    const host = readHost('Bridge/IpcDispatcher.cs');
    for (const [name, src] of [...pages, ['useSystemSummary.ts', read('views/root/useSystemSummary.ts')]]) {
      for (const m of src.matchAll(/invoke(?:<[^>]*>)?\(\s*'([a-zA-Z]+:[A-Za-z]+)'/g)) {
        assert.ok(host.includes(`"${m[1]}"`), `${name} calls ${m[1]} which the host does not know`);
      }
    }
  });
});

describe('diagnostics summary builder', () => {
  const snapshot = {
    appVersion: 'رفيق v1.0', osVersion: 'Windows 10', isWebView2: true, databaseStatus: 'سليمة', productsCount: 12,
    licenseStatus: 'ترخيص دائم', lastBackup: 'اليوم 10:30', isBackupOverdue: false, printerName: 'XP-80C', isPrinterReady: true,
    featuresActive: 5, featuresTotal: 20, diskFree: '48 جيجابايت', auditStatus: 'سليم', deviceFingerprint: 'RAFIQ-DEV-1',
  };

  it('builds one row per fact and the copied text mirrors the rows exactly', () => {
    const rows = buildStatusRows(snapshot);
    assert.equal(rows.length, 11);
    const text = buildDiagnosticsSummary(rows, '5 نوفمبر 2026');
    const lines = text.split('\n');
    assert.equal(lines[0], 'ملخص تشخيص نظام رفيق');
    assert.equal(lines[1], 'وقت الإنشاء: 5 نوفمبر 2026');
    assert.equal(lines.length, 2 + rows.length);
    for (const row of rows) assert.ok(text.includes(`${row.label}: ${row.value}`), row.id);
    assert.ok(text.includes('الميزات المفعّلة: 5 من 20') && text.includes('قاعدة البيانات: سليمة (12 صنف)'));
  });

  it('flags an overdue backup and a printer that is not ready, and never invents data', () => {
    const rows = buildStatusRows({ ...snapshot, isBackupOverdue: true, isPrinterReady: false });
    const backup = rows.find((r) => r.id === 'backup');
    const printer = rows.find((r) => r.id === 'printer');
    assert.equal(backup.tone, 'warn');
    assert.ok(backup.value.includes('متأخرة'));
    assert.equal(printer.tone, 'warn');
    assert.ok(printer.value.includes('غير جاهزة'));
    const empty = buildStatusRows({ featuresActive: 0, featuresTotal: 0 });
    assert.equal(empty.find((r) => r.id === 'version').value, 'غير معروف');
    assert.equal(empty.find((r) => r.id === 'printer').value, 'لم تُحدد طابعة');
    assert.ok(empty.every((r) => r.tone !== 'warn'));
  });

  it('never includes licence keys or any secret, only the facts above', () => {
    const text = buildDiagnosticsSummary(buildStatusRows({ ...snapshot }), 'x');
    assert.ok(!/RFQ-|licenseKey|password|pin\b/i.test(text));
  });
});

describe('pre-login screens can always close the program (owner feedback D)', () => {
  const block = (from, to) => app.slice(app.indexOf(from), app.indexOf(to));

  it('the loading, login, forced-PIN and licence-lock screens each carry the exit button', () => {
    const loading = block('if (isLoading && !currentUser) {', 'if (!currentUser) {');
    const login = block('if (!currentUser) {', 'requiresForcedPinChange(currentUser)) {');
    const forced = block('requiresForcedPinChange(currentUser)) {', 'const shopSubtitle');
    for (const [name, src] of [['loading', loading], ['login', login], ['forced PIN', forced]]) {
      assert.ok(src.includes('<ExitAppButton') && src.includes('handleExitApp()'), `${name} screen has the exit button`);
    }
    assert.ok(app.includes('{isLockScreenOpen && <ExitAppButton'), 'the licence lock screen has it too');
  });

  it('the exit button is the same confirm + window:close flow as the sidebar button', () => {
    const exit = block('const confirmAndExitApp = async () => {', 'const handleNavClick');
    assert.ok(exit.includes('rafiqConfirm') && exit.includes("variant: 'danger'") && exit.includes("invoke('window:close')"));
    assert.ok(app.includes("onClick={() => void handleExitApp()}") && app.includes('إغلاق البرنامج'), 'the sidebar button is unchanged');
    assert.ok(!/useState|useEffect|useAuth/.test(read('components/ExitAppButton.tsx')), 'no session dependency');
  });

  it('is a danger-outline Power button reachable in a corner at any viewport and in dark mode', () => {
    const btn = read('components/ExitAppButton.tsx');
    assert.ok(btn.includes("import { Power } from 'lucide-react'") && btn.includes('إغلاق البرنامج'));
    assert.ok(btn.includes('border-danger/40 dark:border-danger-bright/40') && btn.includes('text-danger dark:text-danger-bright'));
    assert.ok(btn.includes('h-11'), '44px high');
    const login = block('if (!currentUser) {', 'requiresForcedPinChange(currentUser)) {');
    assert.ok(login.includes('absolute top-3 left-3 z-[10001]'), 'pinned to a corner above every overlay');
  });

  it('the host lets window:close through without a session and without a permission', () => {
    const host = readHost('Bridge/IpcDispatcher.cs');
    const publicList = host.slice(host.indexOf('PUBLIC_ACTIONS = new HashSet<string>'), host.indexOf('ACTION_PERMISSION_ALTERNATES'));
    assert.ok(publicList.includes('"window:close"'), 'window:close is a public (pre-auth) action');
    assert.ok(!host.includes('{ "window:close",'), 'and has no permission requirement');
    const system = readHost('Bridge/IpcDispatcher.System.cs');
    assert.ok(system.includes('case "window:close":') && system.includes('Instance.Close()'));
  });
});
