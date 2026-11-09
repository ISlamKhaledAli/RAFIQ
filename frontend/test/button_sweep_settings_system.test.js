import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const read = (rel) => readFileSync(SRC + rel, 'utf8').replace(/\r\n/g, '\n');

const tsx = (dir) => readdirSync(SRC + dir).filter((f) => f.endsWith('.tsx')).map((f) => dir + f);
const COMPONENTS = [
  'AppUpdateModal', 'BackupManager', 'CertifiedHardwareModal', 'ConfirmModal', 'DatabaseRecoveryModal', 'DemoDataModal',
  'ErrorBoundary', 'FactoryResetModal', 'FirstRunWizardModal', 'ForcedPinChangeForm', 'FullStoreExportModal', 'GuidedTourModal',
  'HeaderMenu', 'HelpCenterModal', 'KeyboardShortcutsModal', 'LicenseExpiredLockScreen', 'LicenseModal', 'MigrationWizardModal',
  'PinCodeModal', 'PinSettingsModal', 'RafiqDialog', 'ReadinessCheckModal', 'RecoveryCodeModal', 'SearchBenchmarkModal',
  'SetupChecklist', 'SupervisorPromptModal', 'TextScaleControl', 'UnsavedChangesDialog', 'UserManagerModal',
].map((n) => `components/${n}.tsx`);
const ZONE = [
  'views/SettingsView.tsx',
  ...tsx('views/settings/'),
  ...tsx('views/root/'),
  'views/LoginScreen.tsx',
  'App.tsx',
  ...COMPONENTS,
];
// App.tsx: only the header and the forced-PIN shell belong to this zone (the sidebar is navigation chrome and stays as is)
const zoneSource = (f) => {
  const src = read(f);
  if (f !== 'App.tsx') return src;
  const header = src.slice(src.indexOf('<header'), src.indexOf('</header>'));
  const forcedPin = src.slice(src.indexOf('requiresForcedPinChange(currentUser)) {'), src.indexOf('const shopSubtitle'));
  return header + '\n' + forcedPin;
};
const WITH_BUTTONS = ZONE.filter((f) => /<button|<AppButton/.test(read(f)));

// Returns the full opening tag of every raw <button ...> (braces and quotes are balanced) and its body text.
function rawButtons(src) {
  const out = [];
  let from = 0;
  for (;;) {
    const start = src.indexOf('<button', from);
    if (start === -1) return out;
    let depth = 0;
    let quote = '';
    let i = start + 7;
    for (; i < src.length; i += 1) {
      const c = src[i];
      if (quote) {
        if (c === quote && src[i - 1] !== '\\') quote = '';
      } else if (c === '"' || c === "'") {
        if (depth === 0 || src[i - 1] === '=') quote = c;
      } else if (c === '{') depth += 1;
      else if (c === '}') depth -= 1;
      else if (c === '>' && depth === 0 && src[i - 1] !== '=') break;
    }
    const tag = src.slice(start, i + 1);
    const end = src.indexOf('</button>', i);
    out.push({ tag, body: src.slice(i + 1, end === -1 ? i + 1 : end) });
    from = i + 1;
  }
}

describe('button sweep: settings, root console, app shell and system modals', () => {
  it('every file with buttons uses the shared system', () => {
    for (const f of WITH_BUTTONS) {
      const src = read(f);
      const raw = rawButtons(src).length;
      if (raw === 0 || /AppButton|buttonClass|MENU_ITEM/.test(src)) continue;
      // The only files that keep nothing but documented specials
      assert.ok(['components/SetupChecklist.tsx', 'components/TextScaleControl.tsx'].includes(f), `${f} must use AppButton/buttonClass or be a documented special`);
    }
  });

  it('has no leftover local button constant sets', () => {
    for (const f of ZONE) {
      assert.doesNotMatch(read(f), /\b(PRIMARY_BUTTON_CLASS|SECONDARY_BUTTON_CLASS|DANGER_BUTTON_CLASS|SAVE_BUTTON|DISCARD_BUTTON|STAY_BUTTON|FOOTER_BTN|baseButton|BTN_\w+|QUICK_BTN\w*)\b/, f);
    }
  });

  it('has no dead classes, h-8.5 or button scale leftovers', () => {
    for (const f of ZONE) {
      const src = zoneSource(f);
      assert.doesNotMatch(src, /\bactive:scale-98\b|(?<![\w-])(?:dark:)?(?:hover:|active:)?(?:bg|text|border)-(?:warn-hover|danger-hover|brand-darker)(?![\w-])|(?<![\w-])warn-dark(?![\w-])|\bh-8\.5\b/, f);
      if (f !== 'App.tsx') assert.doesNotMatch(src, /active:scale-\[?0?\.?9/, f + ' no press scale on buttons'); // the header chips in App.tsx are documented specials
    }
  });

  it('has no hand-written solid brand/paid/danger/warn button fills without a dark pair (only documented tab/chip selections)', () => {
    const SELECTED_CHIP = /aria-pressed|activeCategory|isSelected|targetFolder\.startsWith|activeTab ===/;
    for (const f of ZONE) {
      for (const { tag } of rawButtons(zoneSource(f))) {
        const solid = /\bbg-(?:brand|paid|danger|warn)(?![\w-])(?!\/)/.test(tag);
        if (!solid) continue;
        assert.match(tag, /dark:bg-/, `${f}: solid fill needs a dark pair: ${tag.slice(0, 120)}`);
        assert.match(tag, SELECTED_CHIP, `${f}: only selected-state chips may keep a hand-written solid fill: ${tag.slice(0, 120)}`);
      }
    }
  });

  it('icon-only raw buttons have an aria-label', () => {
    for (const f of ZONE) {
      for (const { tag, body } of rawButtons(read(f))) {
        const text = body.replace(/<[A-Za-z][^>]*\/>/g, '').replace(/<\/?[A-Za-z][^>]*>/g, '').trim();
        if (text.length > 0) continue;
        assert.match(tag, /aria-label=/, `${f}: icon-only button without aria-label: ${tag.slice(0, 120)}`);
      }
    }
  });

  it('every raw button declares its type', () => {
    for (const f of ZONE) {
      for (const { tag } of rawButtons(read(f))) {
        assert.match(tag, /\btype=/, `${f}: raw button without type: ${tag.slice(0, 120)}`);
      }
    }
  });

  it('dialog footers: primary/secondary/danger at the default md size, keyboard defaults untouched', () => {
    const confirm = read('components/ConfirmModal.tsx');
    assert.match(confirm, /variant="secondary" onClick=\{onCancel\}/);
    assert.match(confirm, /<AppButton variant=\{confirmVariant\} autoFocus onClick=\{onConfirm\}>/);
    assert.match(confirm, /effectiveVariant === 'danger' \? 'danger' : effectiveVariant === 'paid' \? 'success' : 'primary'/);
    assert.match(confirm, /e\.key === 'Escape'/);

    const dialog = read('components/RafiqDialog.tsx');
    assert.match(dialog, /<AppButton variant="secondary" onClick=\{handleCancel\}>/);
    assert.match(dialog, /<AppButton variant=\{confirmVariant\} autoFocus onClick=\{handleConfirm\}>/);
    assert.match(dialog, /e\.key === 'Escape'[\s\S]{0,80}handleCancel\(\)[\s\S]{0,120}e\.key === 'Enter'[\s\S]{0,80}handleConfirm\(\)/);
    assert.doesNotMatch(dialog, /slate-|\[#/);

    const reset = read('components/FactoryResetModal.tsx');
    assert.match(reset, /<AppButton variant="secondary" onClick=\{onClose\} disabled=\{loading\}>/);
    assert.match(reset, /<AppButton\s+variant="danger"\s+icon=\{Trash2\}\s+loading=\{loading\}/);
    assert.match(reset, /disabled=\{!isConfirmed\}/, 'the typed confirmation still gates the reset');

    const supervisor = read('components/SupervisorPromptModal.tsx');
    assert.match(supervisor, /<AppButton variant="primary" loading=\{loading\} disabled=\{!pin\} onClick=\{\(\) => handleSubmit\(\)\} className="flex-1">/);
    assert.match(supervisor, /<AppButton variant="secondary" onClick=\{onCancel\}>/);

    const pin = read('components/PinCodeModal.tsx');
    assert.match(pin, /disabled=\{isLocked \|\| pin\.length < 4\}/);
    assert.match(pin, /<AppButton variant="secondary" onClick=\{handleClose\}>/);
  });

  it('UnsavedChangesDialog: same three actions, stay is the default focus and nothing handles Enter', () => {
    const src = read('components/UnsavedChangesDialog.tsx');
    assert.match(src, /<AppButton ref=\{stayRef\} variant="secondary" icon=\{Pencil\} onClick=\{onStay\} disabled=\{saving\}>/);
    assert.match(src, /stayRef\.current\?\.focus\(\)/);
    assert.match(src, /<AppButton variant="primary" icon=\{Save\} loading=\{saving\} onClick=\{onSave\}>/);
    assert.match(src, /<AppButton variant="dangerSoft" icon=\{RotateCcw\} onClick=\{onDiscard\} disabled=\{saving\}>/);
    assert.ok(src.indexOf('onSave') < src.indexOf('onDiscard') && src.indexOf('onDiscard') < src.indexOf('onStay}'), 'order: save, discard, stay');
    assert.doesNotMatch(src, /'Enter'/, 'no Enter handler: Enter never throws work away');
    assert.match(src, /e\.key === 'Tab'|e\.key !== 'Tab'/, 'focus trap stays');
  });

  it('BackupManager: row buttons are soft/secondary sm with icons, create and policy save are primary md', () => {
    const src = read('components/BackupManager.tsx');
    assert.match(src, /variant="secondary"\s+size="sm"\s+icon=\{ShieldCheck\}\s+loading=\{isVerifying\}/);
    assert.match(src, /variant="soft"\s+size="sm"\s+icon=\{RotateCcw\}/);
    assert.match(src, /<AppButton variant="primary" icon=\{Database\} loading=\{loading\} onClick=\{\(\) => void handleCreateBackup\(\)\}>/);
    assert.match(src, /<AppButton variant="primary" icon=\{Save\} onClick=\{\(\) => void handleSavePolicy\(\)\}>/);
    assert.match(src, /\{canRestore && \(\s*<AppButton/, 'restore stays behind the permission');
  });

  it('PrinterSettingsTab: the size option cards stay radios, the actions are AppButtons', () => {
    const src = read('views/settings/PrinterSettingsTab.tsx');
    assert.match(src, /role="radio"/);
    assert.match(src, /<AppButton variant="primary" size="lg" fullWidth icon=\{Save\} loading=\{saveLoading\}/);
    assert.match(src, /<AppButton variant="primary" icon=\{Zap\} loading=\{testPrinting\} disabled=\{!selectedPrinter\} onClick=\{onTestPrint\}>/);
  });

  it('UserManagerModal: tree row actions are xs buttons, icon-only ones carry aria-labels', () => {
    const src = read('components/UserManagerModal.tsx');
    assert.match(src, /variant="secondary"\s+size="xs"\s+icon=\{Shield\}/);
    assert.match(src, /variant="secondary" size="xs" icon=\{Key\}/);
    assert.match(src, /variant="secondary" size="xs" icon=\{Edit3\}/);
    assert.match(src, /aria-label=\{node\.isActive \? 'تعطيل الحساب' : 'تفعيل الحساب'\}/);
    assert.match(src, /variant="dangerSubtle" size="xs" icon=\{Trash2\} aria-label="حذف الحساب"/);
    assert.doesNotMatch(src, /طي الفروع|expandedNodes/, 'the staff tree has no collapse control');
    assert.equal((src.match(/<button/g) ?? []).length, 4, 'only the role radio cards stay raw');
    assert.equal((src.match(/<AppButton[\s\S]{0,40}type="submit"/g) ?? []).length, 5, 'one submit per form');
  });

  it('settings and root pages use 44px (lg) buttons where they had 44px buttons', () => {
    for (const f of ['views/settings/SalesPoliciesTab.tsx', 'views/settings/StoreProfileTab.tsx']) {
      assert.match(read(f), /<AppButton type="submit" variant="primary" size="lg" icon=\{Save\}/, f);
    }
    for (const f of ['views/root/RootDataPage.tsx', 'views/root/RootDevicesPage.tsx', 'views/root/RootStatusPage.tsx', 'views/root/RootReceiptPage.tsx', 'views/root/RootFeaturesPage.tsx']) {
      assert.match(read(f), /<AppButton[^>]*\bsize="lg"/, f);
    }
  });

  it('App header: icon buttons are secondary sm with aria-labels; the sidebar is untouched', () => {
    const src = read('App.tsx');
    assert.match(src, /icon=\{RefreshCw\}\s+loading=\{isUniversalRefreshing\}[\s\S]{0,160}aria-label="تحديث البيانات"/);
    assert.match(src, /icon=\{isFullscreen \? Minimize2 : Maximize2\}[\s\S]{0,120}aria-label=/);
    assert.match(src, /icon=\{isDark \? Sun : Moon\}[\s\S]{0,120}aria-label=/);
    assert.match(src, /const moreTriggerClassName = buttonClass\(\{ variant: 'secondary', size: 'sm', iconOnly: true/);
    assert.match(src, /className=\{PANEL_TOGGLE_BUTTON_CLASS\}/);
    assert.match(src, /<ExitAppButton compact/);
  });

  it('HeaderMenu rows use the shared menu constants', () => {
    const src = read('components/HeaderMenu.tsx');
    assert.match(src, /className=\{isDanger \? MENU_ITEM_DANGER : MENU_ITEM\}/);
    assert.match(src, /MENU_ITEM_ICON_DANGER : MENU_ITEM_ICON/);
    assert.match(src, /role="menuitem"/);
  });

  it('keypads: digits are secondary lg, clear is warningSoft, backspace is dangerSoft with an aria-label', () => {
    for (const f of ['components/PinCodeModal.tsx', 'components/SupervisorPromptModal.tsx']) {
      const src = read(f);
      assert.match(src, /variant="secondary"\s+size="lg"\s+className="!text-lg/, f);
      assert.match(src, /variant="warningSoft" size="lg"/, f);
      assert.match(src, /variant="dangerSoft"\s+size="lg"\s+aria-label="/, f);
    }
  });
});
